import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getProgress, postResult, putSettings } from '../controllers/kidGameController';
import { kidGameResultSchema, kidGameSettingsSchema } from '../validators/kidGameValidators';

const router = Router();
router.use(requireAuth);

router.get('/progress', getProgress);
router.post('/results', validate({ body: kidGameResultSchema }), postResult);
router.put('/settings', validate({ body: kidGameSettingsSchema }), putSettings);

export default router;
