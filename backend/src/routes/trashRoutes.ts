import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listTrash,
  restoreTrashItem,
  previewPermanentDelete,
  permanentlyDeleteTrashItem,
  permanentlyDeleteTrashItems,
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

/** Same gate as a single delete, over a list of ids. */
const bulkPermanentDeleteBodySchema = permanentDeleteBodySchema.extend({
  ids: z
    .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'))
    .min(1, 'Select at least one item to delete')
    // Bounded so one request cannot ask for an unbounded amount of storage work; the
    // client deletes a page at a time, which is well inside this.
    .max(200, 'Delete at most 200 items at a time'),
});

const router = Router();
router.use(requireAuth);

router.get('/', listTrash);
router.get('/:id/deletion-preview', validate({ params: idParamSchema }), previewPermanentDelete);
router.post('/:id/restore', validate({ params: idParamSchema }), restoreTrashItem);
/**
 * Registered ahead of `/:id/permanent` for clarity rather than necessity - the two differ
 * in segment count and could not be confused - so the bulk route stays visible next to the
 * single one it shares its logic with.
 */
router.delete('/permanent', validate({ body: bulkPermanentDeleteBodySchema }), permanentlyDeleteTrashItems);
router.delete(
  '/:id/permanent',
  validate({ params: idParamSchema, body: permanentDeleteBodySchema }),
  permanentlyDeleteTrashItem,
);

export default router;
