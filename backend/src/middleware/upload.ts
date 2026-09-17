import path from 'node:path';
import crypto from 'node:crypto';
import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { env } from '../config/env';
import { EXTENSION_TO_MIME, ALLOWED_MIME_TYPES, IMAGE_MIME_TYPES } from '../config/constants';
import { assertSafeFilename } from '../utils/filenameSafety';
import { AppError } from '../utils/AppError';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.tmpDir);
  },
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

/**
 * NOTE on partial-failure behavior: multer/busboy parses one multipart stream, so a
 * fileFilter rejection (or a `limits` violation, e.g. LIMIT_FILE_SIZE) aborts the whole
 * request, not just the offending file. That's a property of streaming multipart parsing
 * itself, not something a fileFilter can opt out of. It's not a gap in practice here: the
 * frontend uploads exactly one file per HTTP request (see lib/api/media.ts), which is also
 * what gives each file its own progress bar — so one bad file only ever fails its own
 * request, never anyone else's. A request with several files (e.g. a future API client)
 * still gets correct itemized uploaded/failed results for anything that fails *after*
 * multer accepts the files (see mediaController.uploadMedia's per-file loop).
 */
function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  // The `poster` part is a browser-generated video still, never stored as media in its own
  // right — it only has to be an image sharp can read, so it skips the extension mapping
  // that real uploads go through.
  if (file.fieldname === 'poster') {
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(AppError.badRequest('Video poster must be an image'));
      return;
    }
    cb(null, true);
    return;
  }

  try {
    assertSafeFilename(file.originalname);
  } catch (err) {
    cb(AppError.badRequest(err instanceof Error ? err.message : 'Invalid filename'));
    return;
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const expectedMime = EXTENSION_TO_MIME[ext];

  if (!expectedMime) {
    cb(AppError.badRequest(`Unsupported file extension: ${ext || '(none)'}`));
    return;
  }

  // Some browsers/OSes report a generic or slightly different mimetype for the same
  // extension (e.g. .mkv as application/octet-stream). Trust the extension mapping,
  // but reject anything whose reported mimetype is a clearly different, disallowed type.
  const reportedIsKnown = (ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype);
  if (!reportedIsKnown && file.mimetype !== 'application/octet-stream') {
    cb(AppError.badRequest(`File type mismatch for ${file.originalname}`));
    return;
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileSizeBytes,
    // +1 leaves room for the optional poster part; the real per-request cap on *media*
    // is enforced by the `files` field's maxCount below.
    files: env.MAX_FILES_PER_UPLOAD + 1,
  },
});

/**
 * Accepts the media itself plus an optional `poster` still for videos. `.fields()` rather
 * than `.array()` so the two parts stay distinguishable by field name — the poster must
 * never be mistaken for another uploaded file.
 */
export const uploadMedia = upload.fields([
  { name: 'files', maxCount: env.MAX_FILES_PER_UPLOAD },
  { name: 'poster', maxCount: 1 },
]);
