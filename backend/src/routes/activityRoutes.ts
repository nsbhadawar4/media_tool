import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { listActivity } from '../controllers/activityController';
import { listActivityQuerySchema } from '../validators/activityValidators';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: listActivityQuerySchema }), listActivity);

export default router;
