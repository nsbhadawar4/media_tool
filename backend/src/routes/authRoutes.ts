import { Router } from 'express';
import {
  signup,
  login,
  logout,
  me,
  updateProfile,
  uploadAvatar,
  removeAvatar,
  changePassword,
  forgotPassword,
  verifyOtp,
  resetPassword,
  startMobileSignup,
  resendMobileSignupCode,
  verifyMobileSignup,
  loginWithMobile,
  mobileSignupConfig,
  googleConfig,
  googleSignIn,
  completeOnboarding,
} from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { uploadAvatarImage } from '../middleware/upload';
import {
  loginRateLimiter,
  loginAccountRateLimiter,
  signupRateLimiter,
  forgotPasswordRateLimiter,
  verifyOtpRateLimiter,
  phoneOtpSendRateLimiter,
  phoneOtpVerifyRateLimiter,
} from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  loginSchema,
  signupSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  mobileSignupStartSchema,
  mobileSignupResendSchema,
  mobileSignupVerifySchema,
  mobileLoginSchema,
  googleSignInSchema,
  completeOnboardingSchema,
} from '../validators/authValidators';

const router = Router();

router.post('/signup', signupRateLimiter, validate({ body: signupSchema }), signup);
router.post('/login', loginRateLimiter, loginAccountRateLimiter, validate({ body: loginSchema }), login);

// Mobile-number signup (OTP-verified) and login. All public; see phoneSignupService.
router.get('/signup/mobile/config', mobileSignupConfig);
router.post('/signup/mobile', phoneOtpSendRateLimiter, validate({ body: mobileSignupStartSchema }), startMobileSignup);
router.post('/signup/mobile/resend', phoneOtpSendRateLimiter, validate({ body: mobileSignupResendSchema }), resendMobileSignupCode);
router.post('/signup/mobile/verify', phoneOtpVerifyRateLimiter, validate({ body: mobileSignupVerifySchema }), verifyMobileSignup);
router.post('/login/mobile', loginRateLimiter, loginAccountRateLimiter, validate({ body: mobileLoginSchema }), loginWithMobile);

// "Continue with Google" (ID-token flow, verified server-side) and first-time onboarding.
router.get('/google/config', googleConfig);
router.post('/google', loginRateLimiter, validate({ body: googleSignInSchema }), googleSignIn);
router.post('/onboarding', requireAuth, validate({ body: completeOnboardingSchema }), completeOnboarding);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, validate({ body: updateProfileSchema }), updateProfile);
router.post('/me/avatar', requireAuth, uploadAvatarImage, uploadAvatar);
router.delete('/me/avatar', requireAuth, removeAvatar);
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
  // Also used for "Resend OTP" — the frontend just calls this endpoint again.
  forgotPasswordRateLimiter,
  validate({ body: forgotPasswordSchema }),
  forgotPassword,
);
router.post(
  '/verify-otp',
  verifyOtpRateLimiter,
  validate({ body: verifyOtpSchema }),
  verifyOtp,
);
router.post(
  '/reset-password',
  // Rate limited like signing in: both take a password and both can be guessed at.
  loginRateLimiter,
  validate({ body: resetPasswordSchema }),
  resetPassword,
);

export default router;
