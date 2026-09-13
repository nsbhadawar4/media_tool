import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireMediaAccess } from '../middleware/mediaAccess';
import { validate } from '../middleware/validate';
import { uploadMedia as uploadMiddleware } from '../middleware/upload';
import {
  listMedia,
  getMedia,
  uploadMedia,
  updateMedia,
  moveMedia,
  deleteMedia,
  restoreMedia,
  streamMedia,
  downloadMedia,
} from '../controllers/mediaController';
import {
  mediaIdParamSchema,
  updateMediaSchema,
  moveMediaSchema,
  listMediaQuerySchema,
} from '../validators/mediaValidators';

const router = Router();

// Streamed directly by <img>/<video> src and download links — authenticated via a
// scoped token or the session cookie, not the standard requireAuth chain.
router.get('/:id/raw', validate({ params: mediaIdParamSchema }), requireMediaAccess, streamMedia);
router.get('/:id/download', validate({ params: mediaIdParamSchema }), requireMediaAccess, downloadMedia);

router.get('/', requireAuth, validate({ query: listMediaQuerySchema }), listMedia);
router.get('/:id', requireAuth, validate({ params: mediaIdParamSchema }), getMedia);
router.post('/upload', requireAuth, uploadMiddleware.array('files'), uploadMedia);
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

export default router;
