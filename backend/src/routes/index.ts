import { Router } from 'express';
import authRoutes from './authRoutes';
import folderRoutes from './folderRoutes';
import mediaRoutes from './mediaRoutes';
import trashRoutes from './trashRoutes';
import dashboardRoutes from './dashboardRoutes';
import activityRoutes from './activityRoutes';
import searchRoutes from './searchRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/folders', folderRoutes);
router.use('/media', mediaRoutes);
router.use('/trash', trashRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/activity', activityRoutes);
router.use('/search', searchRoutes);

export default router;
