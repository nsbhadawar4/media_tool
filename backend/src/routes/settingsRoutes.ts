import { Router } from 'express';
import { getPublicAppearance } from '../controllers/settingsController';

const router = Router();

// Public: every page (signed in or not) reads which themes it may use. Holds no private data.
router.get('/appearance', getPublicAppearance);

export default router;
