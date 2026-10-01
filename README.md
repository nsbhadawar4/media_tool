# media_tool

A private, multi-user media manager for photos, videos and documents. Every account gets
its own library; an administrator manages accounts but can never see anyone's files.

| | |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, React Query |
| Backend | Node.js, Express 4, TypeScript, Mongoose, zod |
| Database | MongoDB (Atlas, your own server, or a built-in local one) |
| File storage | Pluggable: `local` disk, `gridfs`, Cloudflare `r2`, or Amazon `s3` |
| Auth | JWT in an HTTP-only cookie, bcrypt passwords, 4-digit email OTP for password reset |

More detail lives in [`backend/README.md`](backend/README.md) (full API reference) and
[`DEPLOYMENT.md`](DEPLOYMENT.md) (Vercel, R2, GridFS, email setup).

---

## 1. Quick start

Requires Node.js 20.9+.

```bash
npm install                      # installs frontend + backend (npm workspaces)

cp backend/.env.example backend/.env             # then fill it in, see section 7
cp frontend/.env.local.example frontend/.env.local

npm run create-admin -- you@example.com "your-password"   # optional: first admin
npm run dev                      # backend :5000, frontend :3000
```

Open `http://localhost:3000`, sign up, and you land on your dashboard.

| Command | What it does |
|---|---|
| `npm run dev` | Backend and frontend together (`dev:backend` / `dev:frontend` for one) |
| `npm run build` | Builds the backend, then the frontend |
| `npm run typecheck` | Typechecks both |
| `npm test` | Backend test suite plus frontend tests |
| `npm run smoke` | End-to-end check of the Vercel-shaped build (run `npm run build` first) |
| `npm run create-admin` | Creates or updates an administrator (safe to re-run) |
| `npm run migrate-storage` | Copies files between storage providers (dry-run by default) |

---

## 2. How it works

```
Browser ──► Next.js frontend ──► /api/* ──► Express API ──► MongoDB   (metadata, accounts, logs)
                                                      └──► Storage    (the actual file bytes)
```

- **Development:** Express runs on `:5000`, Next on `:3000`. The browser calls the API
  cross-origin with credentials, and CORS allows it.
- **Production (Vercel):** one project, one domain. The Express app is mounted inside a Next.js
  Route Handler (`frontend/app/api/[...path]/route.ts`), so there is one implementation of the
  API for both modes, no CORS, and first-party cookies.
- **Request path:** `helmet → CORS → rate limit → body parsing → cookies → Mongo-operator
  sanitizer → route → requireAuth → zod validation → controller → error handler`.
- **Response format:** `{ success: true, data, meta? }` or
  `{ success: false, error: { message, details? } }`.

### Authentication

1. Signup and login set a JWT in the HTTP-only `mt_session` cookie. JavaScript never sees it.
   Default lifetime is 7 days (`JWT_EXPIRES_IN`); "remember me" decides whether it persists.
2. On **every** request `requireAuth` re-reads the user from MongoDB. A deactivated user, or a
   changed role, takes effect immediately instead of when the cookie expires.
3. `tokenVersion` on the user is embedded in the token. A completed password reset bumps it,
   which signs out every other device.
4. The frontend (`proxy.ts`) only checks that the cookie *exists*, to avoid a flash of
   protected UI. The real check is `GET /api/auth/me`. If the backend is merely unreachable the
   user sees a retry screen, not a sign-out.
5. **Forgot password:** email a 4-digit code (hashed, expiring, attempt-limited, resend
   cooldown) → `verify-otp` returns a short-lived reset token → `reset-password` requires that
   token, never the OTP → the user is signed back in.

### Data isolation

Every folder and media query is filtered by `ownerId`. Admin endpoints only list, activate,
deactivate and delete *accounts* and show aggregate statistics; they never touch another
user's files. Covered by `backend/tests/userIsolation.test.ts`.

---

## 3. Where data is stored

| Data | Where | Format / location | How it is read |
|---|---|---|---|
| Account (name, email, mobile, role) | MongoDB `users` | document | `GET /api/auth/me` |
| Password | MongoDB `users.passwordHash` | bcrypt hash only | compared at login |
| Profile photo | MongoDB `users.avatarUrl` | 256×256 WebP data URL, ~10–20 KB | returned with `/auth/me` |
| **Uploaded photos, videos, documents** | **The configured storage provider** (table below) | original bytes | `/api/media/:id/raw` and `/download` |
| Thumbnails | Same provider, `thumbnails/` prefix | 480 px WebP | `/api/media/:id/thumb` |
| File details (name, size, type, folder) | MongoDB `media` | document | `/api/media` |
| Folders | MongoDB `folders` | document | `/api/folders` |
| Audit log | MongoDB `activitylogs` | document | `/api/activity` |
| Password-reset OTP | MongoDB `users` | hash + expiry only | email delivers the code |
| Session | Browser cookie `mt_session` | signed JWT | sent automatically |
| Theme | Browser localStorage | | this device only |
| Upload temp files | `TMP_DIR` | deleted after processing | server only |

MongoDB holds **metadata only**, except with `gridfs` (see below). The file bytes live in the
storage provider chosen by `STORAGE_PROVIDER`:

| `STORAGE_PROVIDER` | Bytes live in | Use it for | Notes |
|---|---|---|---|
| `local` (default) | `backend/uploads/` on the server's disk | development | Not suitable for Vercel or any host with an ephemeral disk. No redundancy. |
| `gridfs` | Your MongoDB database | small deployments | Counts against your database's storage size. Uploads pass through the API. |
| `r2` | Cloudflare R2 bucket | production | Browser uploads directly to the bucket. |
| `s3` | Amazon S3 (or S3-compatible, e.g. MinIO) | production | Same direct-upload path as R2. |

Local layout:

```
backend/uploads/
├── images/<folderId or "unfiled">/<timestamp>-<random>.jpg
├── videos/<folderId or "unfiled">/...
├── documents/<folderId or "unfiled">/...
└── thumbnails/<generated-name>.webp
```

The folder segment is the folder's database id, not its name, so renaming or moving a folder
never moves a file. Changing `STORAGE_PROVIDER` does **not** move existing files; use
`npm run migrate-storage` (opt-in, dry-run by default, deletes nothing).

Files are never served from a public bucket URL. Every `<img>`, `<video>` and download link
points at the API, carrying a short-lived token scoped to that one file; ownership is checked
before the file is streamed or the (expiring) presigned redirect is issued.

---

## 4. Limits and capacity

| Question | Answer |
|---|---|
| Storage per user | **No per-user quota exists in the code.** A user can upload until the database or the storage provider runs out of room. |
| Max size of one file | `MAX_FILE_SIZE_MB`, default **500 MB**. |
| Files per upload request | `MAX_FILES_PER_UPLOAD`, default **25** (the UI sends one request per file regardless). |
| Serverless + `local`/`gridfs` | Bytes pass through the function, so the effective cap is about **4.4 MB per file**. Use `r2` or `s3` on Vercel. |
| Max number of users | **No cap in the code**; signup is open. Practical limit is your database and storage plan. Signup is throttled to 10 per IP per hour. |
| Request rate | API: 300 requests/min per IP. Login/password change: 10 per 15 min. OTP endpoints are limited separately. |
| Session length | 7 days by default. |
| Allowed file types | Checked by extension, mimetype and content (see `backend/src/config/constants.ts`). |

What actually bounds you depends on the provider (check current pricing, these change):

| Resource | Typical constraint |
|---|---|
| Atlas free tier (M0) | about 512 MB for all metadata and avatars. Each user document is a few KB plus up to ~20 KB of avatar, so this is room for thousands of users, but not for GridFS media. |
| Cloudflare R2 | generous free tier (around 10 GB), then billed per GB stored; no egress fees. |
| Amazon S3 | billed per GB stored plus transfer. |
| Local disk | whatever free space the server has. |

**Adding a per-user quota** is not built yet. The place for it is the upload path
(`presignUpload` and `uploadMedia` in `backend/src/services/mediaService.ts`): sum the user's
non-purged `media.size`, compare with a limit, and reject with a clear error. The dashboard
already computes "storage used", so the aggregation exists.

---

## 5. Database schema

### `users`

| Field | Type | Meaning |
|---|---|---|
| `name` | String (≤120) | Display name |
| `email` | String, unique, lowercase | Sign-in address |
| `passwordHash` | String, never selected by default | bcrypt (12 rounds) |
| `mobile` | String or null | Optional |
| `avatarUrl` | String or null | Profile photo as a data URL |
| `role` | `user` or `admin` | Admins are created only from the CLI |
| `isActive` | Boolean | `false` blocks sign-in immediately |
| `isEmailVerified` | Boolean | Reset to `false` when the email changes |
| `lastLoginAt`, `lastLoginIp` | Date, String | |
| `passwordReset*` | hashes, expiries, attempt count | OTP flow state, never selected by default |
| `tokenVersion` | Number | Bumped on password reset to invalidate sessions |
| `createdAt`, `updatedAt` | Date | |

### `folders`

| Field | Type | Meaning |
|---|---|---|
| `ownerId` | ref `User` | Owner |
| `name`, `slug` | String | Name and its lowercase form (unique among siblings, per owner) |
| `description` | String | Optional |
| `parentFolder` | ref `Folder` or null | Nesting |
| `path` | `[ObjectId]` | Ancestor chain, root first, for fast subtree queries |
| `coverImage` | ref `Media` | Optional |
| `itemCount` | Number | Direct, non-deleted files |
| `isDeleted`, `deletedAt` | Boolean, Date | Trash state |
| `deletedCascadeRoot` | ref `Folder` or null | Which folder's deletion trashed this one |
| `isProtected` | Boolean | If `true`, can never be deleted |

### `media`

| Field | Type | Meaning |
|---|---|---|
| `ownerId` | ref `User` | Owner; every query filters on it |
| `folderId` | ref `Folder` or null | `null` means unfiled |
| `originalName` | String | Name shown to the user |
| `storedName`, `storageKey` | String | Generated name and full key/path in storage |
| `storageProvider` | `local`, `gridfs`, `r2`, `s3` | Where the bytes are |
| `mimeType`, `fileType` | String, `image`/`video`/`document` | |
| `size` | Number | Bytes |
| `checksum` | String or null | SHA-256 of the validated bytes |
| `width`, `height`, `duration` | Number or null | Image and video metadata |
| `thumbnailKey` | String or null | Storage key of the thumbnail |
| `isDeleted`, `deletedAt`, `deletedCascadeRoot` | | Trash state |

### `activitylogs`

| Field | Meaning |
|---|---|
| `action` | `signup`, `login`, `login_failed`, `logout`, `profile_updated`, `avatar_updated`, `password_*`, `folder_*`, `media_*`, `user_*` |
| `targetType`, `targetId`, `targetName`, `message` | What it happened to |
| `performedBy`, `performedByEmail` | Who did it |
| `ip`, `userAgent`, `metadata` | Context |

---

## 6. API summary

All routes are under `/api` and need the session cookie unless noted. Full request and
response details are in [`backend/README.md`](backend/README.md).

| Group | Endpoints |
|---|---|
| Auth (no login needed) | `POST /auth/signup`, `/auth/login`, `/auth/forgot-password`, `/auth/verify-otp`, `/auth/reset-password` |
| Auth (login needed) | `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`, `POST /auth/me/avatar`, `DELETE /auth/me/avatar`, `POST /auth/change-password` |
| Folders | `GET /folders`, `GET /folders/:id`, `POST /folders`, `PATCH /folders/:id`, `DELETE /folders/:id`, `POST /folders/:id/restore` |
| Media | `GET /media`, `GET /media/:id`, `POST /media/upload`, `POST /media/presign`, `POST /media/commit`, `POST /media/:id/thumbnail`, `PATCH /media/:id`, `POST /media/:id/move`, `DELETE /media/:id`, `POST /media/:id/restore`, `POST /media/bulk/delete`, `POST /media/bulk/move` |
| Media bytes (cookie or signed `?token=`) | `GET /media/:id/raw`, `/media/:id/thumb`, `/media/:id/download` |
| Trash | `GET /trash`, `GET /trash/:id/deletion-preview`, `POST /trash/:id/restore`, `DELETE /trash/:id/permanent` (needs `{"confirm":"DELETE PERMANENTLY"}`) |
| Dashboard / Activity / Search | `GET /dashboard/stats`, `GET /dashboard/recent`, `GET /activity`, `GET /search?q=` |
| Admin (admin role only) | `GET /admin/stats`, `GET /admin/users`, `GET /admin/users/:id`, `PATCH /admin/users/:id/status`, `DELETE /admin/users/:id` |
| Health | `GET /api/health` |

### How an upload travels

| Step | Local / GridFS | R2 / S3 |
|---|---|---|
| 1 | Browser `POST /media/upload` (multipart, one request per file) | Browser `POST /media/presign`; the server derives the storage key itself |
| 2 | Server validates extension, mimetype and content, and enforces size | Browser `PUT`s the bytes straight to the bucket |
| 3 | `sharp` reads dimensions and makes the 480 px WebP thumbnail | Browser `POST /media/commit`; the server re-checks the object in the bucket, then makes the thumbnail |
| 4 | File and thumbnail are written to storage and read back to verify the checksum | |
| 5 | A `media` document is created, the folder's `itemCount` is updated, `media_uploaded` is logged | Same |

Video posters are captured in the browser from a frame of the video, so no ffmpeg is needed.

---

## 7. Configuration

Everything is documented inline in `backend/.env.example`. The ones that matter:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Atlas or server connection string, or `local` for a built-in MongoDB stored in `backend/.data/mongodb` |
| `JWT_SECRET` | Long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `FRONTEND_URL` | Frontend origin (CORS and email links) |
| `STORAGE_PROVIDER` | `local`, `gridfs`, `r2`, `s3` (+ the matching `R2_*` / `S3_*` credentials) |
| `MAX_FILE_SIZE_MB`, `MAX_FILES_PER_UPLOAD` | Upload limits |
| `EMAIL_PROVIDER` | `console` (prints the OTP to the log), `smtp`, or `resend`, plus `EMAIL_FROM` and the provider's credentials |
| `JWT_EXPIRES_IN`, `COOKIE_*` | Session lifetime and cookie settings |
| `TRUST_PROXY` | Number of proxies in front of the app; decides which IP the rate limiters count |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Used by `npm run create-admin` when no arguments are given |

Frontend (`frontend/.env.local`): `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:5000/api`) and
`NEXT_PUBLIC_SESSION_COOKIE_NAME` (must match the backend's `COOKIE_NAME`).

Never commit `.env`.

Administrators are created only from the command line, never through signup:
`npm run create-admin -- you@example.com "your-password"`.

---

## 8. Project layout

```
media_tool/
├── package.json            # npm workspaces root
├── frontend/
│   ├── app/                # pages: login, signup, forgot-password, dashboard, folders, media,
│   │                       #   documents, trash, activity, profile, settings, admin/*
│   ├── app/api/[...path]/  # mounts the Express app on Vercel
│   ├── components/         # admin shell, auth, folders, media, modals, profile, ui
│   ├── lib/                # api clients, auth, upload queue, theme, toast, server bridge
│   ├── hooks/, types/, utils/
│   └── proxy.ts            # cookie-presence redirect
├── backend/
│   ├── src/
│   │   ├── config/         # env validation, db connection, constants
│   │   ├── models/         # User, Folder, Media, ActivityLog
│   │   ├── routes/ controllers/ validators/ middleware/
│   │   ├── services/       # storage/, email/, media, folder, token, password reset, thumbnails
│   │   └── scripts/        # create-admin, migrate-storage, generate-thumbnails, ...
│   ├── tests/              # trash safety, user isolation, uploads, storage providers, auth, email
│   └── uploads/            # local provider's files (dev only, gitignored)
├── DEPLOYMENT.md
└── scripts/dev.mjs         # runs both servers with prefixed logs
```

---

## 9. Trash and data safety

- **Deleting is soft.** It sets `isDeleted` and `deletedAt`; no bytes are removed. Items sit in
  Trash until someone permanently deletes them. There is no automatic purge.
- **Folder deletes cascade safely.** Everything swept up by a folder delete is stamped with
  `deletedCascadeRoot`. Restoring the folder brings back exactly those items, and anything
  deleted separately beforehand stays in Trash.
- **Permanent delete is the only irreversible action** (`DELETE /trash/:id/permanent`). It needs
  the exact phrase `DELETE PERMANENTLY` (enforced on the server), only works on items already
  in Trash, clears storage before the database record so a failure can be retried, and never
  touches `isProtected` folders.
- **This is not a backup.** Soft delete protects against mis-clicks only. For real safety:
  - MongoDB: enable Atlas Cloud Backup (point-in-time restore on M10+) or scheduled
    `mongodump` shipped off the machine. Test a restore.
  - Buckets: enable versioning, a lifecycle rule for old versions, and ideally replication to
    a second region or account.
  - `local` storage: back up `backend/uploads/` yourself; it has no redundancy.
  - Restore the database and storage to nearby points in time. An unreferenced object is
    harmless; a record pointing at a missing object is not.

---

## 10. Security

- Passwords are bcrypt-hashed; hashes and OTP data are never selected or returned by default.
- HTTP-only session cookie; `Secure` defaults to on in production and on Vercel.
- Rate limits on the whole API, and stricter ones on login, signup, OTP and password change.
  The counters are in memory, so on serverless the effective limit scales with the number of
  instances (see "Known limitations" in `DEPLOYMENT.md`).
- Uploads are validated by extension, mimetype and content; request bodies, params and queries
  go through zod; Mongo operator keys (`$gt`, dotted paths) are stripped.
- Per-file signed tokens and ownership checks guard every media byte.
- The forgot-password endpoint reports unknown emails as "no account", which is a deliberate
  trade for usability and does reveal which addresses are registered.
- Known low-severity `npm audit` item: Express 4's `qs` dependency has no non-breaking fix;
  zod validation limits exposure.

---

## 11. Design notes

- **Thumbnails are made at upload time** with `sharp` (480 px WebP), so grids never load
  originals. `sharp.cache(false)` is set because Windows cannot delete files with open handles.
  Run `npm run generate-thumbnails` in `backend/` to backfill older uploads.
- **One HTTP request per uploaded file** gives each file its own progress, cancel and retry,
  and means one bad file can never fail another.
- **Bulk download** triggers one download per file rather than building an archive on the
  server (no archiving dependency).
- **Profile photos** are stored on the user document rather than in the media storage, so they
  work with every provider and need no extra serving route. They are cropped in the browser
  first, then re-encoded by the server.
- **Frontend and backend are decoupled:** the frontend never holds the JWT secret.
