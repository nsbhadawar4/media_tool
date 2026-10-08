import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  /** When false, the session cookie is browser-session-only (cleared on browser close). */
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Password rules for new accounts (both signup methods). Existing passwords are untouched —
 * this only applies when an account is created. Mirrored in the signup form's checklist.
 */
export const strongPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number');

const nameField = z.string().trim().min(1, 'Name is required').max(120, 'Name is too long');

export const signupSchema = z
  .object({
    name: nameField,
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: strongPassword,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    mobile: z
      .string()
      .trim()
      .regex(/^[+]?[\d\s()-]{7,20}$/, 'Enter a valid mobile number')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    // Deliberately absent: `role`. Signup always creates a 'user' — see the controller.
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SignupInput = z.infer<typeof signupSchema>;

/** ISO 3166 country code (IN, US, …) plus the number as typed; normalised in the controller. */
const countryField = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Choose a country');
const nationalNumber = z
  .string()
  .trim()
  .min(4, 'Enter your mobile number')
  .max(20, 'Enter a valid mobile number')
  .regex(/^[\d\s()-]+$/, 'Enter a valid mobile number');
/** The canonical number echoed back by step 1, used for resend and verify. */
const e164Field = z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone number');
const signupTokenField = z.string().regex(/^[0-9a-f]{64}$/, 'This signup has expired. Please start again.');

export const mobileSignupStartSchema = z
  .object({
    name: nameField,
    country: countryField,
    mobile: nationalNumber,
    password: strongPassword,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type MobileSignupStartInput = z.infer<typeof mobileSignupStartSchema>;

export const mobileSignupResendSchema = z.object({ phone: e164Field, signupToken: signupTokenField });
export type MobileSignupResendInput = z.infer<typeof mobileSignupResendSchema>;

export const mobileSignupVerifySchema = z.object({
  phone: e164Field,
  signupToken: signupTokenField,
  otp: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit code'),
});
export type MobileSignupVerifyInput = z.infer<typeof mobileSignupVerifySchema>;

export const mobileLoginSchema = z.object({
  country: countryField,
  mobile: nationalNumber,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});
export type MobileLoginInput = z.infer<typeof mobileLoginSchema>;

/**
 * The signup details an account may change afterwards.
 *
 * Every field is optional and only what is sent is written, so the form can save one
 * field without having to resend the rest — and a client that omits a field can never
 * blank it by accident. Mobile is the exception: an empty string is how "remove it" is
 * expressed, since it is the one field that is legitimately allowed to be absent.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long').optional(),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
    mobile: z
      .string()
      .trim()
      .regex(/^[+]?[\d\s()-]{7,20}$/, 'Enter a valid mobile number')
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Nothing to update',
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Changing a password requires proving you know the current one.
 *
 * A live session is not proof enough: it may be an unattended laptop, or a cookie someone
 * else is holding. Asking for the current password is what keeps a stolen session from
 * becoming a stolen account.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Your current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Only an email. Never reveals whether it matched an account — see the controller — so
 * there is nothing else this request needs to carry.
 */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * The email identifies which account's code this is being checked against —
 * verifyPasswordResetOtp looks the account up by it rather than by, say, an id embedded
 * in some other token, so there is nothing else for a client to hold onto between
 * requesting a code and submitting it.
 */
export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  otp: z.string().trim().regex(/^\d{4}$/, 'Enter the 4-digit code'),
});

export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

/**
 * The reset token alone identifies which account and that a code was already verified —
 * see passwordResetService.resetPassword — so nothing else identifying belongs here, and
 * in particular not the OTP: this token is what proves it was checked, not a second
 * chance to check it.
 */
export const resetPasswordSchema = z
  .object({
    resetToken: z.string().trim().min(1, 'This reset session is invalid or has expired'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(200),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** The ID token Google handed the browser. Everything about the user is read from it, server-side. */
export const googleSignInSchema = z.object({
  credential: z.string().min(20, 'Missing Google credential').max(4096),
});
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

/**
 * Only the plan's name is accepted. Its status (active / pending), dates and price are decided
 * by the server — a client sending `subscriptionStatus: 'active'` is simply ignored.
 */
export const completeOnboardingSchema = z.object({
  plan: z.enum(['free', 'pro', 'premium'], { errorMap: () => ({ message: 'Choose a valid plan' }) }),
});
export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
