# Deploying media_tool to Vercel

One repository, one Vercel project, one domain. The Next.js app is served from `/`,
and the existing Express API from `/api/*` on that same origin.

---

## 1. How it fits together

```
media_tool/
├── frontend/                       ← the Vercel project (Root Directory)
│   ├── app/api/[...path]/route.ts  ← the one Vercel Function: hands every
│   │                                 /api/* request to the Express app
│   ├── lib/server/expressBridge.ts ← Web Request ⇄ Node req/res adapter
│   └── next.config.ts              ← file tracing + externals
└── backend/                        ← unchanged; compiled to dist/ during the build
    └── src/app.ts                  ← createApp(): routers, auth, error handling
```

Vercel builds **one framework per project**: the root-level `api/` directory convention
belongs to projects with no framework, and the monorepo docs direct you to create a
separate project per directory. An Express app therefore cannot be deployed beside a
Next.js app inside one project as its own function. Mounting Express *inside* a Next.js
Route Handler is what keeps this to a single project — and it means the backend has
exactly one implementation, shared by local development and production.

Two consequences worth knowing:

- **No CORS.** The browser calls `/api/...` on the origin it loaded the app from, so no
  cross-origin request is ever made. The CORS middleware is skipped when `API_BASE_URL`
  is empty, which is the production default.
- **First-party cookies.** The session cookie stays `SameSite=Lax` and `Secure`, with no
  third-party cookie concerns.

Locally nothing changes: `npm run dev` still runs Express on `:5000` via `app.listen()`
and Next on `:3000`.

### Why there is no `vercel.json`

Nothing in this architecture needs one. The framework is auto-detected, the build command
comes from `frontend/package.json`, `maxDuration` is declared by the route itself, and
`/api/[...path]` is a real Next.js route rather than a rewrite target. A `vercel.json`
here would only restate defaults.

---

## 2. Before the first deploy

### Object storage is required

Production **must** use Cloudflare R2 or Amazon S3. This is not a preference:

- A serverless filesystem is ephemeral, so `STORAGE_PROVIDER=local` would lose every
  uploaded file, at an unpredictable moment.
- A Vercel Function's request body is capped at **4.5 MB**. Uploading an ordinary phone
  photo through the API is impossible. Setting `STORAGE_PROVIDER` to `r2` or `s3` switches
  uploads to presigned direct-to-bucket transfers, which the cap does not apply to.

Create a **private** bucket. The app never needs it to be public: files are served through
short-lived presigned URLs minted only after an ownership check.

Recommended bucket settings:

| Setting | Why |
| --- | --- |
| Private (no public access) | Media is per-user and private by design |
| CORS: allow `PUT` from your domain | The browser uploads straight to the bucket |
| Lifecycle rule: delete incomplete objects after ~1 day | Cleans up uploads that were presigned and started but never committed |
| Versioning on | Protects against accidental deletion (see README §10) |

The bucket CORS rule needs roughly this, with your own origin:

```json
[
  {
    "AllowedOrigins": ["https://media-tool.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

### MongoDB Atlas

- Under **Network Access**, add `0.0.0.0/0`. Vercel Functions do not have fixed outbound
  IP addresses, so an allow-list of specific addresses cannot work. The database is then
  protected by its credentials alone — use a long generated password, and a database user
  scoped to the `media_tool` database with `readWrite` only.
- Put the database name in the URI: `.../media_tool?retryWrites=true&w=majority`.
- If you need IP allow-listing instead, that requires Vercel Secure Compute (Enterprise).

---

## 3. Import the project

1. **Vercel → Add New → Project**, and import the repository.
2. **Set Root Directory to `frontend`.** This is the one setting that is not automatic,
   and the deploy will fail without it.
3. Confirm **Include source files outside of the Root Directory in the Build Step** is
   enabled, in the same settings section. It is on by default, and the build needs it to
   reach `backend/`.
4. Framework Preset should already read **Next.js**. Leave the build and install commands
   at their defaults.

### If the build fails during install

The build needs `npm install` to run at the **repository root**, not inside `frontend/`.
The root `package.json` declares the two workspaces, and it is that install which creates
the `media-tool-backend` link that `frontend/` depends on — the backend is a workspace,
not a published package. Vercel detects npm workspaces and does this on its own, so there
is normally nothing to configure.

If it ever installs in `frontend/` instead, the install fails with:

```
npm error 404 Not Found - GET https://registry.npmjs.org/media-tool-backend
```

That is this situation and not a missing dependency — nothing needs to be published. Set
**Settings → Build & Development Settings → Install Command** to:

```bash
cd .. && npm install
```

The Install Command runs in the Root Directory (`frontend`), so the `cd ..` is what puts
the install at the repository root where the workspaces are declared.

### If the build fails on a missing native module

A Linux build failing on something the local build never complains about — for example:

```
Cannot find module '../lightningcss.linux-x64-gnu'
```

means `package-lock.json` was last written on a machine of a different platform. Several
dependencies here ship prebuilt native binaries as per-platform optional packages
(`lightningcss`, `@tailwindcss/oxide` and `@next/swc` for the build, `sharp` at runtime),
and `npm install` records only the ones it actually installed. A lockfile written on
Windows therefore lists `…-win32-x64-msvc` and nothing else, and `npm ci` on Vercel — which
installs strictly what the lockfile names — finds no Linux binary to use.

Regenerate the lockfile so it describes every platform. The order matters: npm reuses the
existing tree in `node_modules` if one is there, which reproduces the same one-platform
result.

```bash
rm -rf node_modules frontend/node_modules backend/node_modules
rm -f package-lock.json
npm install --package-lock-only    # resolves from the registry: every platform
npm install                        # installs this machine's binaries only
```

`--package-lock-only` is the step that matters: resolving without installing is what stops
npm narrowing the result to the current platform. A normal `npm install` afterwards keeps
the other platforms' entries, so this does not need repeating.

Check before committing — this must print `true`:

```bash
node -e "console.log(Object.keys(require('./package-lock.json').packages).some(k => k.endsWith('lightningcss-linux-x64-gnu')))"
```

---

## 4. Environment variables

Set these on the Vercel project (**Settings → Environment Variables**), for Production
*and* Preview. None of them should ever be prefixed `NEXT_PUBLIC_`.

### Required

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/media_tool?retryWrites=true&w=majority` — URL-encode `@ : / ? # %` in the password |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV` | `production` |
| `STORAGE_PROVIDER` | `r2` or `s3` |

### Required for Cloudflare R2

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
Add `R2_PUBLIC_BASE_URL` only if the bucket is deliberately public.

### Required for Amazon S3

`S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`.
`S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` are for S3-compatible providers.

### Deliberately left unset

| Variable | Why |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Unset means same-origin `/api`. Setting it to a fixed host breaks every preview deployment, each of which has its own URL. |
| `API_BASE_URL` | Same reason, for the media URLs the API generates. Defaults to empty on Vercel. |
| `COOKIE_SECURE` | Defaults to `true` on Vercel and in production. |
| `TRUST_PROXY` | Defaults to `1` on Vercel, which is the real number of hops. Raising it lets callers forge `X-Forwarded-For` and evade the login rate limiter. |
| `FRONTEND_URL` | Only consulted for CORS, which is not used same-origin. |

### Optional

`MAX_FILE_SIZE_MB` (default 500), `MAX_FILES_PER_UPLOAD`, `JWT_EXPIRES_IN`,
`LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MIN`.

---

## 5. After the first deploy

Create the administrator account. `npm run create-admin` runs against whatever
`MONGODB_URI` points at, so run it locally with production credentials in your shell
rather than in `backend/.env`:

```bash
MONGODB_URI="<production uri>" \
ADMIN_EMAIL="you@example.com" \
ADMIN_NAME="Your Name" \
ADMIN_PASSWORD="<a long password>" \
npm run create-admin
```

Then check `https://<your-app>.vercel.app/api/health`. It returns
`{"success":true,"database":"connected"}` once Atlas is reachable.

---

## 6. Known limitations

**Rate limiting is per-instance.** `express-rate-limit` keeps its counters in memory, and
a serverless deployment runs many instances, so the effective limit is the configured one
multiplied by however many instances are live. The login limiter is a real security
control, so if this matters, either put a Vercel Firewall rate-limit rule in front of
`/api/auth/login`, or give `express-rate-limit` a shared store.

**Thumbnails are skipped for images over 64 MB.** A direct upload never passes through the
server, so a thumbnail means downloading the object back. Past that ceiling it is not
worth the function time, and the gallery falls back to the full image. See
`MAX_DERIVED_SOURCE_BYTES` in `backend/src/services/mediaService.ts`.

**Video thumbnails depend on the browser.** There is no ffmpeg in the function, so a
video's thumbnail is the poster frame the browser captured at upload time and posted to
`/api/media/:id/thumbnail`. A browser that cannot produce one leaves the video with a
placeholder — unchanged from how this already worked.

**Uploads are capped at 4.5 MB when `STORAGE_PROVIDER=local`.** This configuration is not
supported in production for the reasons in §2, but if it is set anyway, the client falls
back to uploading through the API and the platform limit applies.

**Function bundle size.** The deployed function carries sharp's native binaries, the
MongoDB driver and the AWS SDK. It is well inside the 250 MB limit today; adding large
dependencies to the backend is what would threaten that.

---

## 7. Local development is unchanged

```bash
npm install
npm run dev          # Express on :5000, Next on :3000
```

The production request path — the Express bridge — is covered by
`backend/tests/vercelBridge.test.ts`, which runs requests through the adapter exactly as
Vercel does. Run it with `npm run test:bridge --workspace backend`, or `npm test` for the
full suite.

To exercise the deployed shape itself — the API served from inside Next.js, on one origin,
with no `app.listen()` anywhere — build first and run the smoke check:

```bash
npm run build
npm run smoke
```

It starts the built Next.js server against a throwaway in-memory MongoDB and drives real
requests through it: health, signup, login and the `Set-Cookie` round trip, an
authenticated read, folder create/list, the direct-upload negotiation, a 401 for an
unauthenticated request, the frontend being served from that same origin, and logout. It
needs no credentials and touches neither Atlas nor a real bucket.

### A note on `vercel dev`

`npx vercel dev` from `frontend/` also runs the Route Handler, but it does **not** work
without one extra step: the backend reads its configuration relative to the working
directory, which is `frontend/`, and `frontend/.env.local` holds only `NEXT_PUBLIC_*`
values. `MONGODB_URI` and `JWT_SECRET` have to reach that process explicitly — either
exported in the shell you run it from, or by running `vercel env pull` first, which writes
them into `frontend/.env.local`. That file is gitignored, so pulled secrets stay local; it
is the one case where backend secrets legitimately live there.

`npm run smoke` needs none of that, which is why it is the recommended route.
