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

### Where the Vercel configuration lives

`frontend/vercel.json`, and nowhere else. A `vercel.json` is read from the project's Root
Directory, which is `frontend/` — so a file at the repository root would simply be ignored.

It is deliberately almost empty:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

Pinning the framework states the intent in the repository rather than leaving it to
detection, which is what keeps the import flow from treating this monorepo as ambiguous.
Everything else is left at its default on purpose: the build command comes from
`frontend/package.json`, the install is handled by Vercel's npm-workspaces detection (see
below if that ever fails), and `maxDuration` is declared by the route handler itself.
Restating any of those here would only create a second place to keep them correct.

### There is no root `vercel.json`, and `backend/` is not a second service

Vercel has no multi-service configuration: one Project builds one framework, and a
`vercel.json` configures exactly one Project. A monorepo that genuinely has two
deployables needs two Vercel **Projects**, each with its own Root Directory — that is a
dashboard setting, not something any config file can express.

This repository does not need that, because `backend/` is not deployed as a service at
all. It is compiled to `backend/dist/` during the frontend's build and imported by
`app/api/[...path]/route.ts`, so the Express app ships *inside* the Next.js function.
`backend/package.json`'s `start` script (`node dist/server.js`, which calls
`app.listen()`) is for local development only; Vercel runs no long-lived processes.

If the import screen offers to create a second project for `backend/`, decline it. One
project, one domain, one API implementation — see §1.

---

## 2. Before the first deploy

### Somewhere to put files is required

`STORAGE_PROVIDER=local` cannot be used here, and the app refuses to start it rather than
letting it fail later: a serverless filesystem is read-only apart from `/tmp`, and `/tmp`
is discarded with the instance. Left to run it would accept an upload, show a thumbnail,
and lose the file an hour later — the worst kind of failure, because nothing reports it.

There are two ways to satisfy this, and they trade against each other.

| | `r2` / `s3` | `gridfs` |
| --- | --- | --- |
| Where files live | A bucket | MongoDB, beside the records |
| To set up | An account, a bucket, an API token, a CORS policy | Nothing — it uses `MONGODB_URI` |
| Largest file | `MAX_FILE_SIZE_MB` (default 500 MB) | **~4.4 MB** |
| Total capacity | Effectively unlimited | Whatever the database tier allows — 512 MB on an Atlas free cluster, shared with everything else |
| Cost | R2 is free to 10 GB, but Cloudflare wants a card on file | Included |

**Object storage is the better answer** wherever it is available. It is not merely bigger:
it hands the browser a presigned URL so the bytes go straight to the bucket, bypassing the
**4.5 MB** cap Vercel puts on a request body. `gridfs` has no such URL to give, so every
byte travels through the function and that cap becomes the file size limit. `presign`
enforces it up front and says so, rather than letting the platform reject the upload with
a response this app never sees.

**`gridfs` is the answer when opening a storage account is the blocker.** It is a real
option, not a stopgap: the bytes are as durable and as backed-up as everything else in the
database, and nothing about the app behaves differently. It is sized for a private library
of a few hundred photos, not for video.

Moving between them later is a supported operation, not a migration project — see
*Media uploaded before the switch* below.

Create a **private** bucket if you go the R2/S3 route. The app never needs it to be public:
files are served through short-lived presigned URLs minted only after an ownership check.

### MongoDB GridFS, step by step

1. Set `STORAGE_PROVIDER=gridfs` in the Vercel project (§4).
2. Redeploy.

That is the whole procedure. There is no second credential to issue and no CORS policy to
write, because nothing but this API ever touches the bytes. `/api/health` will report
`"storage": "configured"` — for this provider that is answered by `MONGODB_URI` alone, so
if the database is up, storage is up.

Worth knowing before choosing it:

- **Uploads over ~4.4 MB are refused**, with a message saying why. Phone photos are
  usually under it; video is usually not.
- **Files count against the database's storage**, so `db.stats()` and the Atlas storage
  gauge grow with the library. On a free M0 cluster that is 512 MB in total.
- **Backups now include the media.** Convenient, and it makes a database dump much larger.
- Files live in the `media.files` and `media.chunks` collections. Nothing else uses them.

### Cloudflare R2, step by step

1. **Create the bucket.** Cloudflare dashboard → **R2** → *Create bucket*. Any name; the
   location hint can stay *Automatic*. Leave public access **disabled** — under
   *Settings → Public Development URL*, do not enable it. The app does not want it, and
   enabling it makes every object readable by anyone who learns its address.

2. **Copy the account id.** It is shown in the R2 overview sidebar, and is also the
   subdomain of the S3 endpoint the bucket page displays
   (`https://<account-id>.r2.cloudflarestorage.com`). This is `R2_ACCOUNT_ID`.

3. **Create an API token.** R2 → **Manage R2 API Tokens** → *Create API token*, with
   permission **Object Read & Write**, scoped to this one bucket. The token page shows an
   *Access Key ID* and a *Secret Access Key* — these are `R2_ACCESS_KEY_ID` and
   `R2_SECRET_ACCESS_KEY`. The secret is shown once; if it is lost, issue a new token.
   Do not use the *API Token* value itself, which is a different credential.

4. **Add the CORS policy.** Bucket → **Settings → CORS policy** → *Add CORS policy*. The
   browser uploads straight to the bucket, so without this every upload fails with a CORS
   error in the console while the API reports nothing wrong. Nothing in the application
   configures this; it is a property of the bucket.

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

   `PUT` is the only method needed, and `content-type` the only header: the browser sends
   exactly one request to the bucket per file, and reads nothing back from it. Downloads
   and previews are redirects the browser follows as a resource, which CORS does not
   apply to. Add each preview domain you want uploads to work from as a further entry in
   `AllowedOrigins`; a deploy preview has its own hostname.

5. **Set the environment variables** on the Vercel project — see §4 — and redeploy.

Optional but recommended bucket settings:

| Setting | Why |
| --- | --- |
| Lifecycle rule: abort incomplete multipart uploads after ~1 day | Cleans up uploads that were presigned and started but never finished |
| Object versioning | Protects against accidental deletion (see README §10) |

### Media uploaded before the switch

Changing `STORAGE_PROVIDER` changes where the app *looks* for every file, not only where
it puts new ones. Records written while the provider was `local` hold keys that only ever
existed in `backend/uploads` on one machine, so after the switch they resolve to nothing
in the bucket and show as broken thumbnails. Nothing is lost — the database rows and the
local files are both untouched — but the two no longer point at each other.

Nothing does this automatically, and no deployment step depends on it. To repair those
records, run the migration from the machine that still holds `backend/uploads`, with
`backend/.env` pointing at the **same** MongoDB the deployment uses and at the bucket:

```bash
npm run migrate-storage              # dry run - reports what it would do
npm run migrate-storage -- --apply   # upload the bytes, then repoint the records
```

It copies rather than moves (local originals stay where they are), never deletes a file
or a record, skips anything already in the bucket, and is safe to re-run after a failure.
Records whose bytes are not on that machine are reported and left alone.

Skipping this entirely is a valid choice: new uploads work regardless, and the old records
stay in the database as they are.

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
4. Framework Preset should already read **Next.js** — `frontend/vercel.json` pins it.
   Leave the build and install commands at their defaults.
5. If the importer also offers to create a project for `backend/`, **decline it**. The
   Express app is built into the frontend's function, not deployed separately.

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
| `STORAGE_PROVIDER` | `r2` or `s3` (object storage), or `gridfs` (files in MongoDB — see §2) |

### Required for Cloudflare R2

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.

`R2_PUBLIC_BASE_URL` is optional and should be **left unset**, which is the recommended
setup: with no public base URL the app has no direct link to hand out, so every file is
served through this API's ownership check. Set it only for a bucket you have deliberately
made public behind a custom domain.

Find the first four in the Cloudflare dashboard: **R2 → Manage R2 API Tokens** issues an
access key pair with *Object Read & Write* on the bucket, and the account id is in the
R2 overview sidebar (it is also the subdomain of the S3 endpoint the dashboard shows).

### Required for Amazon S3

`S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`.
`S3_ENDPOINT` and `S3_FORCE_PATH_STYLE` are for S3-compatible providers — Backblaze B2,
MinIO, or R2 addressed by hand.

### Required for GridFS

Nothing. `STORAGE_PROVIDER=gridfs` uses `MONGODB_URI`, which is already required.

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

Then check `https://<your-app>.vercel.app/api/health`:

```json
{ "success": true, "database": "connected", "storage": "configured" }
```

Both fields have to read that way. `storage` reports whether the variables in §4 add up to
a provider this deployment can build — it is answered from configuration alone, with no
call to the bucket, so it is free to poll and it cannot tell you the credentials are
*accepted*, only that they are present and well-formed. The endpoint answers `503` if
either field is wrong, because a deployment that cannot store a file is not serving this
app in any useful sense: every page still loads and every list is still empty, and the
failure surfaces only when somebody tries to upload.

### Checking stored files

`npm run verify-storage` reports which media records still have the bytes they describe.
Uploads can no longer create a record without a verified object behind it, but records
written before that was true still exist, and nothing stops a file being removed from
storage behind the app's back.

```bash
npm run verify-storage                      # report only, changes nothing
npm run verify-storage -- --checksum        # also re-hash objects that recorded one
npm run verify-storage -- --fix-thumbnails  # regenerate previews that are missing
npm run verify-storage -- --trash-missing   # move records with no bytes to the trash
```

It never deletes a record or a stored object. `--trash-missing` moves records to the trash,
which is reversible from the app, and even that is opt-in. Run it with `backend/.env`
pointing at the database and storage you want to check.

Media whose bytes are gone shows in the gallery as a **File unavailable** card rather than a
broken image, so nothing has to be repaired for the app to stay readable.

### If uploads fail

The browser shows the reason on the failed row in the upload panel. The three it will be:

| Message | Cause |
| --- | --- |
| `STORAGE_PROVIDER=local cannot be used on a serverless deployment…` | `STORAGE_PROVIDER` is unset or `local` in the Vercel project. Set it to `r2` (§4) and redeploy. |
| `STORAGE_PROVIDER=r2 requires … Not set: X` | `X` is missing or empty in the Vercel project. Setting it requires a redeploy to take effect. |
| `File storage is unavailable (InvalidAccessKeyId / SignatureDoesNotMatch / NoSuchBucket / AccessDenied)…` | The variables are all set, but the bucket rejected them. The name in brackets says which one to look at: the key id, the secret, the bucket name, or the token's permissions. |

Two things to know while reading those:

- **Environment variables are baked in at build time.** Adding or changing one in the
  Vercel dashboard does nothing until the project is redeployed.
- **A CORS error is a different failure.** If the bucket has no CORS policy the browser
  never reaches it, the API is never told, and the row reads `Network error during upload`
  rather than any of the above. That is §2 step 4 — and note that each preview deployment
  has its own hostname, which has to be in `AllowedOrigins` too.

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

**Uploads are capped at ~4.4 MB whenever storage cannot presign** — `gridfs`, or `local`
where it is force-enabled. Those providers have no URL for the browser to PUT to, so the
bytes travel through the function and Vercel's 4.5 MB request body limit applies, less a
little for the multipart envelope. `presign` rejects an oversized file up front with a
message naming the limit; the alternative is the platform refusing the request before the
function runs, which the app cannot see or explain. `r2`/`s3` are not affected.

**Function bundle size.** The deployed function carries sharp's native binaries, the
MongoDB driver and the AWS SDK. It is well inside the 250 MB limit today; adding large
dependencies to the backend is what would threaten that.

**An upload is rejected if its contents do not match its name.** The server reads the bytes
rather than trusting the extension or the browser's Content-Type, and for images it decodes
them: a file renamed to `.jpg`, a photo truncated by a dropped connection, or a ZIP renamed
to `.docx` is refused with a message saying so. This is deliberate — each of those used to
be stored successfully and then appear in the gallery as a card that never loads.

**HEIC needs a sharp build with HEIF support.** iPhone photos are accepted only where sharp
can decode them, which the prebuilt Linux binaries do. On a host whose sharp lacks it, HEIC
uploads are refused rather than stored: a browser cannot display HEIC either, so storing one
without a preview would produce exactly the broken tile the check exists to prevent.

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
