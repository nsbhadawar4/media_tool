import { Router } from 'express';
import authRoutes from './authRoutes';
import folderRoutes from './folderRoutes';
import mediaRoutes from './mediaRoutes';
import trashRoutes from './trashRoutes';
import dashboardRoutes from './dashboardRoutes';
import activityRoutes from './activityRoutes';
import searchRoutes from './searchRoutes';
import adminRoutes from './adminRoutes';
import healthRoutes from './healthRoutes';
import kidGameRoutes from './kidGameRoutes';
import reviewRoutes from './reviewRoutes';
import contentRoutes from './contentRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/folders', folderRoutes);
router.use('/media', mediaRoutes);
router.use('/trash', trashRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/activity', activityRoutes);
router.use('/search', searchRoutes);
router.use('/admin', adminRoutes);
router.use('/health', healthRoutes);
router.use('/kid-games', kidGameRoutes);
router.use('/reviews', reviewRoutes);
router.use('/content', contentRoutes);

export default router;
