import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireMediaAccess } from '../middleware/mediaAccess';
import { validate } from '../middleware/validate';
import { uploadMedia as uploadMiddleware, uploadPosterImage } from '../middleware/upload';
import {
  listMedia,
  getMedia,
  uploadMedia,
  updateMedia,
  moveMedia,
  deleteMedia,
  restoreMedia,
  streamMedia,
  streamThumbnail,
  downloadMedia,
  bulkDeleteMedia,
  bulkMoveMedia,
} from '../controllers/mediaController';
import {
  mediaIdParamSchema,
  updateMediaSchema,
  moveMediaSchema,
  listMediaQuerySchema,
  bulkDeleteMediaSchema,
  bulkMoveMediaSchema,
} from '../validators/mediaValidators';
import { presignUpload, commitUpload, uploadThumbnail } from '../controllers/uploadController';
import { presignUploadSchema, commitUploadSchema } from '../validators/uploadValidators';

const router = Router();

// Streamed directly by <img>/<video> src and download links — authenticated via a
// scoped token or the session cookie, not the standard requireAuth chain.
router.get('/:id/raw', validate({ params: mediaIdParamSchema }), requireMediaAccess, streamMedia);
router.get('/:id/thumb', validate({ params: mediaIdParamSchema }), requireMediaAccess, streamThumbnail);
router.get('/:id/download', validate({ params: mediaIdParamSchema }), requireMediaAccess, downloadMedia);

// Registered ahead of the `/:id` routes so "bulk" is never parsed as a media id.
router.post('/bulk/delete', requireAuth, validate({ body: bulkDeleteMediaSchema }), bulkDeleteMedia);
router.post('/bulk/move', requireAuth, validate({ body: bulkMoveMediaSchema }), bulkMoveMedia);

// Direct-to-bucket upload, in two steps. Ahead of `/:id` for the same reason as `/bulk`.
router.post('/presign', requireAuth, validate({ body: presignUploadSchema }), presignUpload);
router.post('/commit', requireAuth, validate({ body: commitUploadSchema }), commitUpload);

router.get('/', requireAuth, validate({ query: listMediaQuerySchema }), listMedia);
router.get('/:id', requireAuth, validate({ params: mediaIdParamSchema }), getMedia);
router.post('/upload', requireAuth, uploadMiddleware, uploadMedia);
router.patch(
  '/:id',
  requireAuth,
  validate({ params: mediaIdParamSchema, body: updateMediaSchema }),
  updateMedia,
);
router.post(
  '/:id/move',
  requireAuth,
  validate({ params: mediaIdParamSchema, body: moveMediaSchema }),
  moveMedia,
);
router.delete('/:id', requireAuth, validate({ params: mediaIdParamSchema }), deleteMedia);
router.post('/:id/restore', requireAuth, validate({ params: mediaIdParamSchema }), restoreMedia);
router.post(
  '/:id/thumbnail',
  requireAuth,
  validate({ params: mediaIdParamSchema }),
  uploadPosterImage,
  uploadThumbnail,
);

export default router;
