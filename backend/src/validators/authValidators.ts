import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  /** When false, the session cookie is browser-session-only (cleared on browser close). */
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
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
