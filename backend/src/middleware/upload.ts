import path from 'node:path';
import crypto from 'node:crypto';
import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { env } from '../config/env';
import { EXTENSION_TO_MIME, ALLOWED_MIME_TYPES } from '../config/constants';

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

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedMime = EXTENSION_TO_MIME[ext];

  if (!expectedMime) {
    cb(new Error(`Unsupported file extension: ${ext || '(none)'}`));
    return;
  }

  // Some browsers/OSes report a generic or slightly different mimetype for the same
  // extension (e.g. .mkv as application/octet-stream). Trust the extension mapping,
  // but reject anything whose reported mimetype is a clearly different, disallowed type.
  const reportedIsKnown = (ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype);
  if (!reportedIsKnown && file.mimetype !== 'application/octet-stream') {
    cb(new Error(`File type mismatch for ${file.originalname}`));
    return;
  }

  cb(null, true);
}

export const uploadMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileSizeBytes,
    files: env.MAX_FILES_PER_UPLOAD,
  },
});
