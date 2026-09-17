# media_tool — backend API

Express + TypeScript + Mongoose API for a multi-user private media library. Each account
sees only its own folders and files; an administrator manages accounts but never their
contents.

- **Runtime:** Node.js 20.9+
- **Database:** MongoDB Atlas (`media_tool`) — metadata only
- **Files:** on disk under `uploads/`, behind a storage abstraction that can be swapped
  for Cloudflare R2 or Amazon S3 without touching the media code

---

## 1. Installation

This is an npm workspaces monorepo, so install from the repository root:

```bash
npm install
```

---

## 2. Environment variables

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored and must stay that way.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (5000) | Port the API listens on |
| `NODE_ENV` | no (development) | `development` \| `production` \| `test` |
| `API_BASE_URL` | no | This API's own public address, used to build media links |
| `FRONTEND_URL` | no | Comma-separated origins allowed to call the API with credentials |
| `MONGODB_URI` | **yes** | MongoDB Atlas connection string. No fallback — see below |
| `JWT_SECRET` | **yes** | Signing key, at least 16 characters |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | no | Defaults for `npm run create-admin` |
| `STORAGE_PROVIDER` | no (local) | `local` \| `r2` \| `s3` |
| `UPLOAD_DIR` | no (uploads) | Where the local provider writes files |
| `MAX_FILE_SIZE_MB` | no (500) | Per-file upload limit |

Optional extras (cookie tuning, rate limits, R2/S3 credentials) are listed, commented out,
at the bottom of `.env.example`. Every one has a working default in `src/config/env.ts`.

**`MONGODB_URI` has no default on purpose.** A fallback would let the server start against
some other database and silently write there — the one failure that is invisible from
inside the application. Without it the process exits with a message naming what is missing.

---

## 3. MongoDB setup

Use the connection string from Atlas → **Connect → Drivers → Node.js**, replacing
`<db_password>` with the real password. URL-encode any `@ : / ? # %` in it (`@` → `%40`).

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/media_tool?retryWrites=true&w=majority
```

Add the machine to **Network Access → Add IP Address**, or connections time out.

Collections and indexes are created on first use. To build them up front, or after
upgrading from the single-admin version, run the migration in §5.

---

## 4. Running

```bash
npm run dev      # from backend/, or `npm run dev` at the root to start the frontend too
npm run build    # tsc -> dist/
npm start        # node dist/server.js
npm test         # 39 tests: trash safety, trash API, user isolation
```

Startup order is deliberate: load `.env` → validate it → connect to MongoDB → *then*
listen. If the database is unreachable the process exits rather than serving a broken API.

A healthy start logs:

```
MongoDB connected successfully
Database: <cluster-host>/media_tool
media_tool API listening on port 5000 [development]
```

---

## 5. Scripts

| Command | What it does |
|---|---|
| `npm run create-admin -- <email> <password>` | Creates an administrator, or promotes and re-passwords an existing account. The **only** way to get `role: 'admin'` |
| `npm run migrate-to-users` | One-off upgrade from the single-admin model: moves `admins` into `users`, backfills `ownerId` on every folder and file, rebuilds indexes |
| `npm run migrate-to-atlas` | Copies a leftover local development database up to Atlas |
| `npm run hash-password -- "<password>"` | Prints a bcrypt hash for `ADMIN_PASSWORD_HASH` |
| `npm run generate-thumbnails` | Backfills thumbnails for images uploaded before thumbnailing existed |

---

## 6. Authentication flow

```
POST /api/auth/signup   ->  creates a `user` account            ->  redirect to login
POST /api/auth/login    ->  sets an HttpOnly session cookie     ->  dashboard
GET  /api/auth/me       ->  the signed-in account, or 401
POST /api/auth/logout   ->  clears the cookie
```

- Passwords are hashed with bcrypt (12 rounds) and stored as `passwordHash`, which is
  `select: false` on the schema and stripped again in `toJSON`. It is never serialized.
- The JWT holds `sub` (user id), `role`, `email` and `name` — never a password or hash.
- It travels in an **HttpOnly** cookie (`Secure` in production, `SameSite` configurable),
  so JavaScript on the page cannot read it. It is never put in `localStorage`.
- `requireAuth` re-reads the account from the database on every request, so a deactivated
  or demoted user loses access immediately rather than when their cookie expires.
- Signup writes `role: 'user'` unconditionally, ignoring anything in the request body.

### Data isolation

Every folder and media document carries an `ownerId`. Queries put it *in the filter*
rather than loading a document and comparing afterwards:

```ts
Folder.findOne({ _id: req.params.id, ownerId: req.user.id })
```

The owner id always comes from the session cookie, never from the body, params or query.
Another account's id therefore returns **404** — not 403, which would confirm the id is
real. `tests/userIsolation.test.ts` exercises this over the real HTTP stack.

---

## 7. API endpoints

All paths are relative to `/api`. Everything except `/health`, `/auth/signup` and
`/auth/login` requires a session cookie.

### Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | Rate limited. Always creates a `user` |
| POST | `/auth/login` | Rate limited. Sets the session cookie |
| POST | `/auth/logout` | Clears the cookie |
| GET | `/auth/me` | Current account |

### Folders

| Method | Path | Notes |
|---|---|---|
| GET | `/folders` | `?parentFolder&search&sort&includeDeleted` |
| GET | `/folders/:id` | Folder, subfolders and breadcrumbs |
| POST | `/folders` | `{ name, description?, parentFolder? }` |
| PATCH | `/folders/:id` | Rename, move, set description or cover image |
| DELETE | `/folders/:id` | **Soft** delete — cascades to the subtree |
| POST | `/folders/:id/restore` | Restores the folder and everything its deletion swept up |

### Media

| Method | Path | Notes |
|---|---|---|
| GET | `/media` | `?folderId&fileType&search&sort&page&limit` |
| GET | `/media/:id` | One file's metadata |
| POST | `/media/upload` | `multipart/form-data`: `files[]`, `folderId?`, optional video `poster` |
| PATCH | `/media/:id` | Rename |
| POST | `/media/:id/move` | Move to another folder |
| DELETE | `/media/:id` | Soft delete |
| POST | `/media/:id/restore` | Restore from trash |
| GET | `/media/:id/raw` | Streams the file (supports `Range`) |
| GET | `/media/:id/thumb` | Derived thumbnail |
| GET | `/media/:id/download` | Download with `Content-Disposition` |
| POST | `/media/bulk/delete` | `{ ids: string[] }` |
| POST | `/media/bulk/move` | `{ ids: string[], folderId }` |

### Trash

| Method | Path | Notes |
|---|---|---|
| GET | `/trash` | Directly-deleted entries, with what each folder contains |
| GET | `/trash/:id/deletion-preview` | What a permanent delete would destroy |
| POST | `/trash/:id/restore` | Restore a folder or file |
| DELETE | `/trash/:id/permanent` | Requires `{ "confirm": "DELETE PERMANENTLY" }` |

### Dashboard, activity, search

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard/stats` | The caller's own counts and storage |
| GET | `/dashboard/recent` | Recent uploads, folders and activity |
| GET | `/activity` | The caller's own history |
| GET | `/search` | Across the caller's folders and files |

### Admin (`requireAuth` + `requireAdmin`)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | Installation-wide totals |
| GET | `/admin/users` | `?search&role&status&page&limit`, with per-user counts |
| GET | `/admin/users/:id` | One account and its usage |
| PATCH | `/admin/users/:id/status` | `{ isActive }`. Cannot target yourself |
| DELETE | `/admin/users/:id` | Removes the account; **keeps** its folders and files |

### Health

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ "success": true, "database": "connected" }` — unauthenticated, reveals nothing else |

---

## 8. Response format

```jsonc
// success
{ "success": true, "message": "…", "data": { } }

// error
{ "success": false, "message": "…", "error": { "message": "…", "details": [] } }
```

`passwordHash`, `JWT_SECRET`, `MONGODB_URI` and storage credentials never appear in a
response.

---

## 9. Security

bcrypt hashing · JWT in an HttpOnly cookie · CORS restricted to `FRONTEND_URL` with
credentials · Helmet · rate limiting on login and signup · Zod validation on body, params
and query · Mongo operator stripping (`$gt`, dotted keys) on all input · ObjectId
validation · MIME **and** extension checks on uploads with a size cap · filename
sanitisation · path-traversal guards in the storage layer · `ownerId` taken only from the
session · a uniform "invalid email or password" for every login failure.

---

## 10. Data safety

Deleting is always a soft delete. Storage is touched by exactly one operation —
`DELETE /trash/:id/permanent`, gated on a typed confirmation phrase — and bytes are removed
before the database record, so a storage failure leaves the item recoverable in the trash
rather than losing track of a file that still exists. Folders flagged `isProtected` cannot
be deleted by any route.

**None of this is a backup.** For anything you care about keeping, use MongoDB Atlas
continuous backups, object-storage versioning with its own retention policy, and a copy
held somewhere the application cannot reach. See §10 of the root `README.md`.
