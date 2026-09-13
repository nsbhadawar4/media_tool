import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listFolders,
  getFolder,
  createFolder,
  updateFolder,
  deleteFolder,
  restoreFolder,
} from '../controllers/folderController';
import {
  createFolderSchema,
  updateFolderSchema,
  folderIdParamSchema,
  listFoldersQuerySchema,
} from '../validators/folderValidators';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listFoldersQuerySchema }), listFolders);
router.get('/:id', validate({ params: folderIdParamSchema }), getFolder);
router.post('/', validate({ body: createFolderSchema }), createFolder);
router.patch('/:id', validate({ params: folderIdParamSchema, body: updateFolderSchema }), updateFolder);
router.delete('/:id', validate({ params: folderIdParamSchema }), deleteFolder);
router.post('/:id/restore', validate({ params: folderIdParamSchema }), restoreFolder);

export default router;
