import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { listTrash, restoreTrashItem, permanentlyDeleteTrashItem } from '../controllers/trashController';
import { z } from 'zod';

const idParamSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') });

const router = Router();
router.use(requireAuth);

router.get('/', listTrash);
router.post('/:id/restore', validate({ params: idParamSchema }), restoreTrashItem);
router.delete('/:id/permanent', validate({ params: idParamSchema }), permanentlyDeleteTrashItem);

export default router;
