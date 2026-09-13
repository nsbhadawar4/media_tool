import { Router } from 'express';
import { login, logout, me } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { loginRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { loginSchema } from '../validators/authValidators';

const router = Router();

router.post('/login', loginRateLimiter, validate({ body: loginSchema }), login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

export default router;
