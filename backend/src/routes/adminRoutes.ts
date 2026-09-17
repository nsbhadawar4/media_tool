import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listUsers,
  getUser,
  setUserStatus,
  deleteUser,
  getAdminStats,
} from '../controllers/adminController';
import {
  userIdParamSchema,
  listUsersQuerySchema,
  setUserStatusSchema,
} from '../validators/adminValidators';

const router = Router();

// Both guards on the whole router: a route added later cannot forget one of them.
router.use(requireAuth, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', validate({ query: listUsersQuerySchema }), listUsers);
router.get('/users/:id', validate({ params: userIdParamSchema }), getUser);
router.patch(
  '/users/:id/status',
  validate({ params: userIdParamSchema, body: setUserStatusSchema }),
  setUserStatus,
);
router.delete('/users/:id', validate({ params: userIdParamSchema }), deleteUser);

export default router;
