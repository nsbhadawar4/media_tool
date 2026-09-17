import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listTrash,
  restoreTrashItem,
  previewPermanentDelete,
  permanentlyDeleteTrashItem,
  PERMANENT_DELETE_CONFIRMATION,
} from '../controllers/trashController';

const idParamSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') });

/**
 * Permanent deletion is gated on an exact phrase rather than a boolean. A stray `true`
 * is easy to send by accident — from a mistyped script, a replayed request, or a default
 * in a client library — whereas this phrase only ever appears when someone typed it.
 */
const permanentDeleteBodySchema = z.object({
  confirm: z.literal(PERMANENT_DELETE_CONFIRMATION, {
    errorMap: () => ({ message: `Type "${PERMANENT_DELETE_CONFIRMATION}" to confirm permanent deletion` }),
  }),
});

const router = Router();
router.use(requireAuth);

router.get('/', listTrash);
router.get('/:id/deletion-preview', validate({ params: idParamSchema }), previewPermanentDelete);
router.post('/:id/restore', validate({ params: idParamSchema }), restoreTrashItem);
router.delete(
  '/:id/permanent',
  validate({ params: idParamSchema, body: permanentDeleteBodySchema }),
  permanentlyDeleteTrashItem,
);

export default router;
