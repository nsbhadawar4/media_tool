# media_tool

A private, personal media management application for photos, videos and documents.
Self-hosted and multi-user: each account gets its own private library, and an
administrator manages accounts without ever seeing their contents.

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Lucide icons, React Query
- **Backend**: Node.js, Express, TypeScript, MongoDB/Mongoose, JWT + HTTP-only cookies
- **Storage**: pluggable — local disk (dev), Cloudflare R2, or Amazon S3, behind one interface

Frontend and backend are two independent projects (`frontend/`, `backend/`) with their own
`package.json`, developed and run separately in development — Express on `:5000`, Next on `:3000`.

For deployment they come back together: on Vercel the whole application ships as a single
project on a single domain, with the Express app mounted inside a Next.js Route Handler so
there is still only one implementation of the API. See [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 1. Final folder structure

```
media_tool/
├── package.json              # root workspace (npm install links both projects)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx, page.tsx, globals.css
│   │   └── admin/
│   │       ├── page.tsx                # redirects to /dashboard or /login
│   │       ├── login/page.tsx
│   │       └── (protected)/            # sidebar shell + auth guard
│   │           ├── layout.tsx
│   │           ├── dashboard/page.tsx
│   │           ├── folders/page.tsx
│   │           ├── folders/[id]/page.tsx
│   │           ├── media/page.tsx
│   │           ├── documents/page.tsx
│   │           ├── trash/page.tsx
│   │           ├── activity/page.tsx
│   │           └── settings/page.tsx
│   ├── app/api/[...path]/route.ts   # deployment entrypoint: hands /api/* to the Express app
│   ├── components/{admin,folders,media,modals,ui}/
│   ├── lib/{api,auth,theme,toast}/
│   ├── lib/server/expressBridge.ts  # Web Request ⇄ Node req/res adapter for the above
│   ├── hooks/, types/, utils/
│   ├── next.config.ts         # file tracing across the workspace + server externals
│   ├── proxy.ts               # fast cookie-presence redirect (Next 16's `middleware` rename)
│   └── .env.local.example
│
├── backend/
│   ├── src/
│   │   ├── config/            # env validation, db connection, constants
│   │   ├── models/            # Admin, Folder, Media, ActivityLog
│   │   ├── middleware/        # auth, mediaAccess, upload, validate, rateLimit, sanitize, errors
│   │   ├── services/          # storage abstraction, folder/media/activity/token logic
│   │   │   └── storage/       # StorageService + Local/S3(R2) implementations + factory
│   │   ├── controllers/, routes/, validators/, utils/, types/
│   │   ├── scripts/           # create-admin.ts, hash-password.ts, generate-thumbnails.ts,
│   │   │                       # migrate-storage.ts (local -> R2/S3, opt-in, non-destructive)
│   │   ├── app.ts, server.ts
│   ├── tests/                  # trash/recovery, owner isolation, Vercel bridge, R2 config
│   ├── smoke-vercel.mts        # `npm run smoke`: end-to-end check of the deployed shape
│   ├── uploads/                # local storage provider's files (dev only, gitignored)
│   └── .env.example
│
├── DEPLOYMENT.md              # single-project Vercel deployment
└── README.md
```

---

## 2. Installation

Requires **Node.js 20.9+** (Next.js 16's minimum). A MongoDB install is optional — by
default the backend runs one for you (see section 4).

```bash
# from the repo root — installs both frontend/ and backend/ via npm workspaces
npm install
```

You can still `cd frontend` / `cd backend` and run `npm install` individually if you prefer.

---

## 3. Environment setup

### Backend (`backend/.env`)

```bash
cd backend
cp .env.example .env
```

Fill in at minimum:

| Variable | Notes |
|---|---|
| `MONGODB_URI` | Atlas connection string, or `local` to let the backend run MongoDB for you |
| `JWT_SECRET` | Long random string — generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FRONTEND_URL` | `http://localhost:3000` in dev; your deployed frontend origin in production |
| `STORAGE_PROVIDER` | `local`, `r2`, or `s3` (see [Storage setup](#5-storage-setup)) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used once by `npm run create-admin` (see below) |

Every variable is documented inline in `.env.example`. **Never commit `.env`.**

### Frontend (`frontend/.env.local`)

```bash
cd frontend
cp .env.local.example .env.local
```

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_SESSION_COOKIE_NAME=mt_session   # must match backend's COOKIE_NAME
```

---

## 4. MongoDB setup

**Option A — built-in local database (default, nothing to install):**
```
MONGODB_URI=local
```
The backend starts a real `mongod` on `127.0.0.1:27017` at boot and stores data in
`backend/.data/mongodb`, so it survives restarts. The binary is downloaded and cached on
first run. If a MongoDB is already listening on that port, it is reused instead. Best for
development; use a managed database for anything you care about keeping.

**Option B — MongoDB Atlas (recommended for production):**
1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user and allow your IP (or `0.0.0.0/0` for quick testing).
3. Copy the connection string into `MONGODB_URI`, e.g.
   `mongodb+srv://user:pass@cluster0.mongodb.net/media_tool?retryWrites=true&w=majority`.

**Option C — your own MongoDB install:**
Install MongoDB Community Server, run it, and use:
```
MONGODB_URI=mongodb://127.0.0.1:27017/media_tool
```

No manual schema setup is needed — Mongoose creates collections/indexes on first use.

---

## 5. Storage setup

The backend never stores files inside MongoDB — only metadata (`storageKey`, `size`,
`mimeType`, etc). The actual bytes live behind a swappable `StorageService`
(`backend/src/services/storage/`): `upload()`, `delete()`, `exists()`, `stat()`,
`getUrl()`, `getSignedUrl()` and `getUploadUrl()` (plus `getObjectStream()`, needed to
actually serve private files with HTTP Range support — see the design note below).

- **`local`** (default, for development) — files are written under `backend/uploads/`,
  organized by type first, then by folder:
  ```
  backend/uploads/
  ├── photos/<folderId or "unfiled">/<generated-name>.jpg
  ├── videos/<folderId or "unfiled">/<generated-name>.mp4
  ├── documents/<folderId or "unfiled">/<generated-name>.pdf
  └── thumbnails/<generated-name>.webp
  ```
  The folder segment is the folder's stable database id, not its display name, so
  renaming or moving a folder in the UI never touches any already-uploaded file's path.
  Thumbnails sit in a flat prefix keyed off the original's unique generated name, so they
  don't have to be moved when their file's folder changes either. Nothing else to configure.
- **`r2`** (Cloudflare R2) — set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_NAME` (and optionally `R2_PUBLIC_BASE_URL`, or its accepted alias
  `R2_PUBLIC_URL`, if the bucket is bound to a custom domain and deliberately public).
  Keys use the same layout as the local tree above, so a bucket stays browsable.
- **`s3`** (Amazon S3, or any S3-compatible service) — set `S3_REGION`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` (and `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE` for
  non-AWS S3-compatible services like MinIO).

Switch providers anytime by changing `STORAGE_PROVIDER` — no application code changes
needed. Note what that does *not* do: media already recorded under the old provider keeps
its old keys, so its files stay where they are and the app will not find them in the new
bucket. `npm run migrate-storage` copies those files across and repoints the records; it
is opt-in, dry-run by default, and deletes nothing. See DEPLOYMENT.md §2.

Files are **never** served from a public bucket URL directly to the browser. Every
`<img>`/`<video>`/download link the frontend renders points at the backend's own
`/api/media/:id/raw` and `/api/media/:id/download` endpoints, each carrying a short-lived
signed token scoped to that one file. This keeps the library private even if the
underlying bucket is otherwise reachable.

### How the bytes actually travel

Which way a file moves depends on whether the provider can issue presigned URLs, and the
server decides — the client has one code path for both.

- **`local`**: uploads are posted to `/api/media/upload` as multipart, and downloads are
  streamed back through the API. Nothing else is possible; there is no URL to sign.
- **`r2` / `s3`**: uploads go `POST /api/media/presign` → browser `PUT`s straight to the
  bucket → `POST /api/media/commit`. Serving redirects (`302`) to a short-lived presigned
  `GET`. The bytes never pass through the API in either direction.

  One exception, and it is deliberate: a caller that reads a file's bytes *itself* rather
  than handing the URL to the browser cannot follow that redirect, because a cross-origin
  read of a presigned URL has no CORS headers to permit it (and for a credentialed request
  cannot have them, since S3-style CORS never emits `Access-Control-Allow-Credentials`).
  Such callers add `?proxy=1` to the view URL and the API relays the bytes instead. Only
  the inline text-document preview does this today, and it is capped at 2 MB. Everything
  the browser loads as a resource — `<img>`, `<video>`, the PDF `<iframe>`, download links
  — follows the redirect normally and never touches the function.

That second path is what makes the app deployable on a serverless host at all, where a
request body is capped at 4.5 MB and a function is a poor media server. The ownership
check still happens first, on every request — the redirect is only issued afterwards, and
the URL it points at expires.

The presign step never takes a storage key from the client. The server derives the key,
signs it into an upload token along with the resolved type, target folder and size
ceiling, and `commit` re-checks all of it against what actually landed in the bucket —
so a caller cannot register a file they did not upload, or one belonging to someone else.

---

## 6. Admin creation/setup

Anyone can sign up at `/signup` and gets the `user` role. Administrators are created
only from the command line — see below. The account is bootstrapped from environment
variables:

```bash
npm run create-admin -- you@example.com "your-password"
```

Credentials can also come from `ADMIN_EMAIL` + `ADMIN_PASSWORD` (or `ADMIN_PASSWORD_HASH`)
in `backend/.env` if you leave the arguments off.

This is safe to re-run — it upserts by email, so you can also use it later to rotate the
password (run it again with the new one).

To generate a bcrypt hash without ever writing the plaintext password to `.env`:
```bash
npm run hash-password -- "your-password"
# copy the output into ADMIN_PASSWORD_HASH, leave ADMIN_PASSWORD blank
```

---

## 7. Running the app

One command from the repo root starts both:

```bash
npm run dev        # backend on :5000, frontend on :3000
```

Output from the two servers is prefixed with `[backend]` / `[frontend]`, and Ctrl+C stops
both. To run just one, use `npm run dev:backend` or `npm run dev:frontend`.

Visit `http://localhost:3000/signup` to create an account, or `http://localhost:3000/login`
to sign in — either way you land on `/dashboard` with your own library.

Administrators additionally get `/admin` (user management and installation-wide
statistics), reachable from the sidebar or at `http://localhost:3000/admin/login`.

The full API reference lives in [`backend/README.md`](backend/README.md).

### Production build

From the repo root, which builds the backend first because the frontend's API route
imports its compiled output:

```bash
npm run build      # backend (tsc) then frontend (next build)
npm run typecheck  # both workspaces
npm test           # backend suite, including the Vercel bridge tests
npm run smoke      # end-to-end check of the deployed shape (needs npm run build first)
```

`npm run smoke` boots the built Next.js server and drives the real API through it, exactly
as a Vercel deployment does — the Express app inside the Route Handler, one origin, no
`app.listen()`. It uses a throwaway in-memory MongoDB and needs no credentials, so it
touches neither Atlas nor a real bucket. It is kept out of `npm test` because it depends
on a prior build and takes about a minute.

To run the two as separate long-lived servers instead:

```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm start
```

For deploying the whole thing as one Vercel project, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

> **Note on `frontend/npm run typecheck`**: Next.js 16 generates a few global helper types
> (`LayoutProps`, `PageProps`, …) into `.next/types` the first time you run `next dev`,
> `next build`, or `npx next typegen`. Running the standalone typecheck script cold, before
> any of those, will report `Cannot find name 'LayoutProps'` — just run `next dev` once (or
> `npx next typegen`) first. This is a one-time-per-checkout quirk of Next's typegen model,
> not an application bug.

---

## 8. API documentation

All routes are prefixed with `/api`. Every route except `POST /auth/login` requires the
`mt_session` HTTP-only cookie (set automatically by the browser after login); the two
media streaming routes additionally accept a short-lived signed `?token=` instead.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | `{ email, password }` → sets session cookie |
| POST | `/auth/logout` | Clears the session cookie |
| GET | `/auth/me` | Current admin profile |

### Folders
| Method | Path | Description |
|---|---|---|
| GET | `/folders?parentFolder=&search=&includeDeleted=` | List folders (siblings, or search across all) |
| GET | `/folders/:id` | Folder + its subfolders + breadcrumbs |
| POST | `/folders` | `{ name, description?, parentFolder? }` |
| PATCH | `/folders/:id` | `{ name?, description?, parentFolder?, coverImage? }` — renames and/or moves |
| DELETE | `/folders/:id` | Soft delete (cascades to subfolders + contained media) |
| POST | `/folders/:id/restore` | Restore from trash |

### Media
| Method | Path | Description |
|---|---|---|
| GET | `/media?folderId=&fileType=&search=&sort=&page=&limit=` | List with filters/sort/pagination |
| GET | `/media/:id` | Single item |
| POST | `/media/upload` | `multipart/form-data`: `files` (one or more) + optional `folderId`, `poster`, `duration` |
| POST | `/media/presign` | `{ fileName, mimeType, size, folderId? }` → `{ mode: "direct", uploadUrl, contentType, uploadToken }`, or `{ mode: "proxy" }` when storage cannot issue upload URLs |
| POST | `/media/commit` | `{ uploadToken, width?, height?, duration? }` — records a file already PUT to storage |
| POST | `/media/:id/thumbnail` | `multipart/form-data`: `poster` — attaches a video's poster frame as its thumbnail |
| PATCH | `/media/:id` | `{ originalName }` — rename |
| POST | `/media/:id/move` | `{ folderId }` (`null` = unfiled) |
| DELETE | `/media/:id` | Soft delete |
| POST | `/media/:id/restore` | Restore from trash |
| POST | `/media/bulk/delete` | `{ ids: string[] }` — soft-delete many; returns `succeeded`/`failed` |
| POST | `/media/bulk/move` | `{ ids: string[], folderId }` — move many; returns `succeeded`/`failed` |
| GET | `/media/:id/raw?token=` | Inline stream (Range-enabled) — used by `<img>`/`<video>` |
| GET | `/media/:id/thumb?token=` | Derived WebP thumbnail (480px longest edge), long-cached |
| GET | `/media/:id/download?token=` | Same, with `Content-Disposition: attachment` |

Both bulk endpoints apply per item rather than all-or-nothing: ids that no longer resolve
come back in `failed` while everything else still goes through, so one stale entry in a
selection can't block the rest.

### Trash
| Method | Path | Description |
|---|---|---|
| GET | `/trash` | Directly-deleted folders + media; each folder reports what it contains |
| GET | `/trash/:id/deletion-preview` | What a permanent delete would destroy — reads only |
| POST | `/trash/:id/restore` | Restore a folder (with its contents) or a media item by id |
| DELETE | `/trash/:id/permanent` | Permanently delete — **requires** `{ "confirm": "DELETE PERMANENTLY" }` |

`DELETE /trash/:id/permanent` is the only irreversible endpoint in the API. It rejects any
request whose confirmation is missing, truthy-but-wrong (`true`, `"yes"`), or differently
cased — the phrase must match exactly. It also only addresses items that are *already* in
the trash, so nothing visible in the gallery can be destroyed in a single call.

### Dashboard
| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/stats` | Folder/image/video/document counts, storage used, trash count |
| GET | `/dashboard/recent` | Recent uploads + recent activity |

### Activity & Search
| Method | Path | Description |
|---|---|---|
| GET | `/activity?action=&page=&limit=` | Paginated audit log |
| GET | `/search?q=&fileType=&sort=&page=&limit=` | Global search across folder + file names |

All responses use the envelope `{ success: true, data, meta? }` or
`{ success: false, error: { message, details? } }`.

---

## 9. Security notes

- Passwords are bcrypt-hashed (never stored or returned in plaintext).
- Sessions are JWTs in **HTTP-only** cookies. `Secure` defaults to on in production and
  on Vercel, rather than being something a missing `.env` line can quietly turn off.
- Login is rate-limited; the whole API has a general rate limiter. The counters live in
  memory, so on a serverless deployment — where many instances run at once — the effective
  limit is multiplied by the instance count. See "Known limitations" in
  [`DEPLOYMENT.md`](DEPLOYMENT.md) for how to make it a real ceiling.
- `TRUST_PROXY` states how many proxies sit in front of the app, which is what decides the
  address those limiters count against. It defaults to the true value per environment;
  setting it higher would let a caller forge `X-Forwarded-For` and get a fresh quota per
  request.
- Uploads are validated by extension **and** mimetype, with a configurable max size/count.
- Request bodies/params/queries are validated with `zod`; a custom sanitizer strips
  Mongo operator-injection keys (`$gt`, dotted paths) from `body`/`params`/`query`.
- Deletes are soft everywhere — nothing is unrecoverable until an explicit permanent
  delete in Trash, which requires the phrase `DELETE PERMANENTLY` to be typed and is
  enforced server-side, not only in the dialog. See section 10.
- A known, low-severity `npm audit` finding remains: Express 4.22.2's own `qs` dependency
  sits inside a broad advisory range with no non-breaking fix published yet (Express 5
  would resolve it but is a larger migration). Request validation via `zod` limits the
  practical exposure in the meantime.

---

## 10. Data safety: trash, backups and recovery

### What the application guarantees

Deleting anything through the UI or the API is a **soft delete**. It sets `isDeleted` and
`deletedAt` and nothing else — no byte is ever removed from disk or from the bucket by a
normal delete. Items disappear from the gallery and appear in `/admin/trash`, and they stay
there indefinitely; there is no automatic purge, deliberately.

Storage is touched by exactly one operation: `DELETE /api/trash/:id/permanent`, which
requires the literal phrase `DELETE PERMANENTLY` in the request body.

**Folder deletion cascades safely.** Trashing a folder stamps every subfolder and file it
sweeps up with `deletedCascadeRoot = <that folder>`. That single field is what makes the
system recoverable:

- **Restore** brings back the folder *and* everything carrying its id — so a restored
  folder is never an empty shell with its photos stranded in the trash.
- Anything deleted **separately, beforehand** keeps `deletedCascadeRoot: null` and stays in
  the trash. Restoring a folder never silently undoes a deliberate earlier deletion.
- Re-deleting a parent leaves an already-trashed subfolder's `deletedAt` untouched, so you
  can still see when each thing was actually deleted.
- The trash lists only directly-deleted entries, with a summary of what each folder holds.
  Trashing one folder of 400 photos adds *one* row, not 401.

**Permanent deletion is deliberately hard to reach.** It requires the typed phrase; it only
addresses items already in the trash; it refuses outright if the folder still contains
anything that is *not* in the trash; it clears storage before dropping the database record,
so a storage failure leaves the item in the trash to retry rather than losing track of a
file that still exists; and folders flagged `isProtected` cannot be deleted at all, by any
route. Every delete, restore and permanent delete is written to the activity log with counts
and bytes freed.

Set the protection flag directly in the database for anything that must never be removed:

```js
db.folders.updateOne({ _id: ObjectId("...") }, { $set: { isProtected: true } })
```

Run the safety tests with `npm run test --workspace backend` (see `backend/tests/`). They
exercise the cascade and the API against a real MongoDB and real files on disk.

### None of the above is a backup

**Software alone does not make your data safe, and this application is not a backup
system.** Everything above protects against one class of problem: a person deleting the
wrong thing through the UI. It does nothing about the ways data is actually lost most often:

- a disk, volume or bucket failing
- a database that is corrupted, dropped, or restored from a bad state
- ransomware or a stolen credential deleting both the files *and* the records
- a bug in this application — including one in the code described above
- a cloud account being suspended, or a region becoming unavailable
- someone typing `DELETE PERMANENTLY` and meaning it

A soft delete lives in the same database and the same bucket as the thing it protects.
Anything that destroys those destroys the trash along with them. Treat the sections below as
required for production, not optional.

### MongoDB backups

The metadata database is small, but it is the index to everything — without it the files in
the bucket are anonymous blobs with generated names, attached to no folder and no filename.

- **MongoDB Atlas** (recommended): enable **Continuous Cloud Backup** with point-in-time
  restore, available on M10 and above. Shared tiers (M0/M2/M5) only take periodic snapshots
  and cannot do PITR. Set retention to at least 7 days — long enough that a problem noticed
  on a Monday can be rolled back to the previous week.
- **Self-hosted**: run `mongodump` on a schedule and ship the archive off the machine that
  hosts the database. A dump sitting on the same disk as the database is not a backup.

  ```bash
  mongodump --uri="$MONGODB_URI" --archive=media_tool-$(date +%F).gz --gzip
  ```

  Point-in-time recovery needs a replica set with an oplog, not just periodic dumps.
- Keep backups **encrypted at rest** and restrict who can read them — they contain every
  filename and folder name in the library.
- **Test a restore.** A backup you have never restored is a hypothesis, not a backup.
  Restore into a scratch database at least once, and again after any schema change:

  ```bash
  mongorestore --uri="$RESTORE_TARGET_URI" --archive=media_tool-2026-09-16.gz --gzip
  ```

### Object storage backups and versioning

With `STORAGE_PROVIDER=r2` or `s3`, the bucket holds the only copy of the actual photos.

- **Enable object versioning** on the bucket. This is the highest-value setting here: with
  versioning on, a permanent delete — or a bug, or a stolen credential — writes a delete
  marker instead of destroying bytes, and the previous version can be recovered. Without it,
  `DeleteObject` is final.
  - S3: `aws s3api put-bucket-versioning --bucket <name> --versioning-configuration Status=Enabled`
  - R2: enable versioning in the bucket settings, or through the S3-compatible API above.
- **Add a lifecycle rule** so noncurrent versions expire after a defined window (30–90 days
  is typical). Versioning with no expiry grows without bound; versioning with too short a
  window can expire the copy you needed. Choose the window deliberately.
- **Enable MFA Delete** (S3), or restrict `s3:DeleteObject` and `s3:DeleteObjectVersion` to
  a separate administrative principal. The credentials this application runs with need write
  and read; they should ideally not be able to destroy versions.
- **Replicate to a second bucket** in a different region and, ideally, a different account.
  Cross-Region Replication (S3) or a scheduled `rclone sync` covers region outages and
  account-level problems that versioning alone does not.
- **Enable Object Lock / compliance mode** on the replica if the library is irreplaceable.
  It makes objects immutable for a retention period, and it is the only configuration that
  survives an attacker holding full credentials.
- **If you use `STORAGE_PROVIDER=local`, back up `backend/uploads/` too.** The local
  provider is for development: no versioning, no replication, no redundancy. Do not run a
  production library on it.

### The restore drill

Backups and the trash solve different problems, and only one of them gets tested by using
the app day to day. At least once, and after any change to storage or schema:

1. Restore the database dump into a scratch database.
2. Point a scratch instance of the API at it, with read-only credentials for the bucket.
3. Open the gallery and confirm images actually render. That is what proves the metadata and
   the stored objects still agree with each other — the part that rots silently.

Keep the two backups **consistent with each other**: a database restored to Tuesday
alongside a bucket restored to Friday leaves records pointing at objects that no longer
exist, and objects that no record mentions. Note the timestamp of each restore point, and
prefer a database snapshot slightly *older* than the storage snapshot — an unreferenced
object is harmless, a missing one is not.

---

## 11. Design notes worth knowing

- **Frontend and backend are fully decoupled**: the frontend never holds the backend's
  JWT secret. `proxy.ts` only checks for the *presence* of the session cookie (fast
  redirect for logged-out visitors); the real authority is `GET /api/auth/me` against
  the backend, checked client-side on every protected page load.
- **Thumbnails are generated at upload time**, not derived on the fly: `sharp` writes a
  480px WebP next to the original and its key is stored on the media document, so the
  gallery grid never loads full-size originals. `GET /media/:id/thumb` serves them with a
  long `Cache-Control`. If an image can't be decoded (HEIC, where `sharp` usually lacks
  libheif), `thumbnailUrl` comes back `null` and the grid falls back to the original.
  Run `npm run generate-thumbnails` in `backend/` to backfill anything uploaded before
  this existed (`-- --force` regenerates everything).
- **Video posters are captured in the browser**, because no `ffmpeg`/`ffprobe` dependency
  was introduced. `frontend/utils/videoPoster.ts` decodes the file in a `<video>` element,
  draws one frame to a canvas and uploads that still (plus the duration) alongside the
  file; the server treats it as the thumbnail source. This only covers formats the
  *browser* can decode — MP4 and WebM always, MOV usually, MKV generally not — so it
  degrades to the previous play-icon placeholder rather than failing the upload. The video
  preview modal uses the native HTML5 `<video>` element with full controls.
- **`sharp.cache(false)` is set deliberately** (`services/thumbnailService.ts`): sharp
  keeps recently-read files open, and Windows refuses to `unlink` a file with an open
  handle, which otherwise leaks a temp file for every video poster and failed upload.
- **"Media" vs "Documents"** in the sidebar: Media shows everything (with Images/Videos/
  Documents filter chips), Documents is a pre-filtered shortcut to documents only.
- **One HTTP request per file on upload**: the upload queue sends each file as its own
  request (see `frontend/lib/api/media.ts`), not one batch request for the whole
  selection. That's what gives each file an independent progress bar, an independent
  cancel/retry, and a hard guarantee that one bad file can never affect another's
  already-completed upload — multipart parsers (busboy, used by `multer`) abort the
  *entire* request on a single malformed/oversized part, so true per-file isolation only
  exists if each file *is* its own request. `POST /api/media/upload` still accepts a real
  multi-file batch (and returns itemized `uploaded`/`failed` arrays) for any other API
  client that doesn't need per-file progress.
- **Bulk download triggers one download per file**, spaced apart, rather than streaming a
  server-built archive — no archiving dependency was introduced. Each file's download URL
  already sends `Content-Disposition: attachment`, so the browser saves it without
  navigating. Expect a one-time "allow multiple downloads?" prompt per site.
- **`getSignedUrl()`** only returns a real presigned URL for `r2`/`s3` (via
  `@aws-sdk/s3-request-presigner`); for `local` it returns `null`, same as `getUrl()` —
  local dev storage has no directly-addressable URL of any kind, signed or otherwise, so
  every private file is always streamed through the API's own token-guarded routes.
