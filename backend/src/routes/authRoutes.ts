import { Router } from 'express';
import {
  signup,
  login,
  logout,
  me,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
} from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { loginRateLimiter, signupRateLimiter, forgotPasswordRateLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  loginSchema,
  signupSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
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
router.post(
  '/forgot-password',
  forgotPasswordRateLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
);
router.post(
  '/reset-password',
  // Rate limited like signing in: both take a password and both can be guessed at.
  loginRateLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword,
);

export default router;
