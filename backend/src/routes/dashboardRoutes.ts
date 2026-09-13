import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getStats, getRecent } from '../controllers/dashboardController';

const router = Router();
router.use(requireAuth);

router.get('/stats', getStats);
router.get('/recent', getRecent);

export default router;
