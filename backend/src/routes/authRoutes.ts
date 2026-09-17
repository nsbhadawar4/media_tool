import { Router } from 'express';
import { signup, login, logout, me } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { loginRateLimiter, signupRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { loginSchema, signupSchema } from '../validators/authValidators';

const router = Router();

router.post('/signup', signupRateLimiter, validate({ body: signupSchema }), signup);
router.post('/login', loginRateLimiter, validate({ body: loginSchema }), login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

export default router;
