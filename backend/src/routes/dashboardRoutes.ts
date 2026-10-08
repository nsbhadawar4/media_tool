import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getStats, getRecent, getStorage } from '../controllers/dashboardController';

const router = Router();
router.use(requireAuth);

router.get('/stats', getStats);
router.get('/recent', getRecent);
router.get('/storage', getStorage);

export default router;
