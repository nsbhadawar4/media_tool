import { Router } from 'express';
import {
  signup,
  login,
  logout,
  me,
  updateProfile,
  changePassword,
} from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { loginRateLimiter, signupRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  loginSchema,
  signupSchema,
  updateProfileSchema,
  changePasswordSchema,
} from '../validators/authValidators';

const router = Router();

router.post('/signup', signupRateLimiter, validate({ body: signupSchema }), signup);
router.post('/login', loginRateLimiter, validate({ body: loginSchema }), login);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, validate({ body: updateProfileSchema }), updateProfile);
router.post(
  '/change-password',
  requireAuth,
  // Rate limited like signing in: both take a password and both can be guessed at.
  loginRateLimiter,
  validate({ body: changePasswordSchema }),
  changePassword,
);

export default router;
