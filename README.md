# media_tool

A private, personal media management application for photos, videos and documents.
Not a public product — designed to be self-hosted and used by a single admin.

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Lucide icons, React Query
- **Backend**: Node.js, Express, TypeScript, MongoDB/Mongoose, JWT + HTTP-only cookies
- **Storage**: pluggable — local disk (dev), Cloudflare R2, or Amazon S3, behind one interface

Frontend and backend are two fully independent projects (`frontend/`, `backend/`) with their own
`package.json`, so they can be developed, deployed and scaled separately.

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
│   ├── components/{admin,folders,media,modals,ui}/
│   ├── lib/{api,auth,theme,toast}/
│   ├── hooks/, types/, utils/
│   ├── proxy.ts               # fast cookie-presence redirect (Next 16's `middleware` rename)
│   └── .env.local.example
│
├── backend/
│   ├── src/
│   │   ├── config/            # env validation, db connection, constants
│   │   ├── models/            # Admin, Folder, Media, ActivityLog
│   │   ├── middleware/        # auth, mediaAccess, upload, validate, rateLimit, sanitize, errors
│   │   ├── services/          # storage abstraction, folder/media/activity/token logic
│   │   │   └── storage/       # IStorageProvider + Local/S3(R2) implementations + factory
│   │   ├── controllers/, routes/, validators/, utils/, types/
│   │   ├── scripts/           # create-admin.ts, hash-password.ts
│   │   ├── app.ts, server.ts
│   ├── uploads/                # local storage provider's files (dev only, gitignored)
│   └── .env.example
│
└── README.md
```

---

## 2. Installation

Requires **Node.js 20.9+** (Next.js 16's minimum) and a MongoDB database (Atlas or local).

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
| `MONGODB_URI` | Atlas connection string, or `mongodb://127.0.0.1:27017/media_tool` locally |
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
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SESSION_COOKIE_NAME=mt_session   # must match backend's COOKIE_NAME
```

---

## 4. MongoDB setup

**Option A — MongoDB Atlas (recommended):**
1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user and allow your IP (or `0.0.0.0/0` for quick testing).
3. Copy the connection string into `MONGODB_URI`, e.g.
   `mongodb+srv://user:pass@cluster0.mongodb.net/media_tool?retryWrites=true&w=majority`.

**Option B — Local MongoDB:**
Install MongoDB Community Server, run it, and use:
```
MONGODB_URI=mongodb://127.0.0.1:27017/media_tool
```

No manual schema setup is needed — Mongoose creates collections/indexes on first use.

---

## 5. Storage setup

The backend never stores files inside MongoDB — only metadata (`storageKey`, `size`,
`mimeType`, etc). The actual bytes live behind a swappable `IStorageProvider`
(`backend/src/services/storage/`):

- **`local`** (default, for development) — files are written under `backend/uploads/`.
  Nothing else to configure.
- **`r2`** (Cloudflare R2) — set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET_NAME` (and optionally `R2_PUBLIC_BASE_URL` if the bucket is bound to a custom domain).
- **`s3`** (Amazon S3, or any S3-compatible service) — set `S3_REGION`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` (and `S3_ENDPOINT`/`S3_FORCE_PATH_STYLE` for
  non-AWS S3-compatible services like MinIO).

Switch providers anytime by changing `STORAGE_PROVIDER` — no application code changes needed.

Files are **never** served from a public bucket URL directly to the browser. Every
`<img>`/`<video>`/download link the frontend renders points at the backend's own
`/api/media/:id/raw` and `/api/media/:id/download` endpoints, each carrying a short-lived
signed token scoped to that one file. This keeps the library private even if the
underlying bucket is otherwise reachable.

---

## 6. Admin creation/setup

There's no public sign-up — the single admin account is bootstrapped from environment
variables:

```bash
cd backend
# make sure ADMIN_EMAIL + ADMIN_PASSWORD (or ADMIN_PASSWORD_HASH) are set in .env
npm run create-admin
```

This is safe to re-run — it upserts by email, so you can also use it later to rotate the
password (update `.env`, run it again).

To generate a bcrypt hash without ever writing the plaintext password to `.env`:
```bash
npm run hash-password -- "your-password"
# copy the output into ADMIN_PASSWORD_HASH, leave ADMIN_PASSWORD blank
```

---

## 7. Running the app

Two terminals:

```bash
# Terminal 1
cd backend
npm run dev        # http://localhost:4000

# Terminal 2
cd frontend
npm run dev        # http://localhost:3000
```

Visit `http://localhost:3000/admin` → you'll land on the login page → sign in with the
admin account you created above → `/admin/dashboard`.

### Production build

```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm start
```

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
| POST | `/media/upload` | `multipart/form-data`: `files` (one or more) + optional `folderId` |
| PATCH | `/media/:id` | `{ originalName }` — rename |
| POST | `/media/:id/move` | `{ folderId }` (`null` = unfiled) |
| DELETE | `/media/:id` | Soft delete |
| POST | `/media/:id/restore` | Restore from trash |
| GET | `/media/:id/raw?token=` | Inline stream (Range-enabled) — used by `<img>`/`<video>` |
| GET | `/media/:id/download?token=` | Same, with `Content-Disposition: attachment` |

### Trash
| Method | Path | Description |
|---|---|---|
| GET | `/trash` | Deleted folders + deleted media |
| POST | `/trash/:id/restore` | Restore either a folder or a media item by id |
| DELETE | `/trash/:id/permanent` | Permanently delete (irreversible) |

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
- Sessions are JWTs in **HTTP-only** cookies (`Secure` + configurable `SameSite` in production).
- Login is rate-limited; the whole API has a general rate limiter.
- Uploads are validated by extension **and** mimetype, with a configurable max size/count.
- Request bodies/params/queries are validated with `zod`; a custom sanitizer strips
  Mongo operator-injection keys (`$gt`, dotted paths) from `body`/`params`/`query`.
- Deletes are soft by default everywhere — nothing is unrecoverable until an explicit
  "permanently delete" action in Trash, which requires confirmation in the UI.
- A known, low-severity `npm audit` finding remains: Express 4.22.2's own `qs` dependency
  sits inside a broad advisory range with no non-breaking fix published yet (Express 5
  would resolve it but is a larger migration). Request validation via `zod` limits the
  practical exposure in the meantime.

---

## 10. Design notes worth knowing

- **Frontend and backend are fully decoupled**: the frontend never holds the backend's
  JWT secret. `proxy.ts` only checks for the *presence* of the session cookie (fast
  redirect for logged-out visitors); the real authority is `GET /api/auth/me` against
  the backend, checked client-side on every protected page load.
- **No video thumbnails are generated server-side** (no `ffmpeg`/`ffprobe` dependency was
  introduced). Video tiles show a play-icon indicator instead of a frame preview; the
  video preview modal uses the native HTML5 `<video>` element with full controls.
- **"Media" vs "Documents"** in the sidebar: Media shows everything (with Images/Videos/
  Documents filter chips), Documents is a pre-filtered shortcut to documents only.
