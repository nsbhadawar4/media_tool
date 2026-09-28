import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { ConsoleEmailProvider } from './ConsoleEmailProvider';
import { ResendEmailProvider } from './ResendEmailProvider';
import { SmtpEmailProvider } from './SmtpEmailProvider';
import type { EmailProvider } from './EmailProvider';

export type { EmailMessage, EmailProvider } from './EmailProvider';

let cachedProvider: EmailProvider | null = null;

/**
 * A deployment that is not configured to send mail, reported so the operator can read it —
 * same reasoning as storageFailure/configError in services/storage/index.ts: a plain Error
 * here would become an opaque "Internal server error" in production instead of naming the
 * variable that is missing.
 */
function configError(message: string): AppError {
  return AppError.unavailable(message);
}

function buildProvider(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'console':
      return new ConsoleEmailProvider();

    case 'resend': {
      const { RESEND_API_KEY, EMAIL_FROM } = env;
      if (!RESEND_API_KEY || !EMAIL_FROM) {
        const missing = [
          ['RESEND_API_KEY', RESEND_API_KEY],
          ['EMAIL_FROM', EMAIL_FROM],
        ]
          .filter(([, value]) => !value)
          .map(([name]) => name);

        throw configError(
          `EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM. Not set: ${missing.join(', ')}. ` +
            'See DEPLOYMENT.md §4.',
        );
      }

      return new ResendEmailProvider(RESEND_API_KEY, EMAIL_FROM);
    }

    case 'smtp': {
      const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE, EMAIL_FROM } = env;
      if (!SMTP_HOST || !SMTP_PORT || !EMAIL_FROM) {
        const missing = [
          ['SMTP_HOST', SMTP_HOST],
          ['SMTP_PORT', SMTP_PORT],
          ['EMAIL_FROM', EMAIL_FROM],
        ]
          .filter(([, value]) => !value)
          .map(([name]) => name);

        throw configError(
          'EMAIL_PROVIDER=smtp requires SMTP_HOST, SMTP_PORT and EMAIL_FROM. Not set: ' +
            `${missing.join(', ')}. See DEPLOYMENT.md §4.`,
        );
      }

      return new SmtpEmailProvider({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        user: SMTP_USER,
        password: SMTP_PASSWORD,
        from: EMAIL_FROM,
      });
    }

    default:
      throw AppError.internal(`Unknown EMAIL_PROVIDER: ${env.EMAIL_PROVIDER}`);
  }
}

/** Lazily built, memoized singleton — call sites never need to know which provider is active. */
export function getEmailProvider(): EmailProvider {
  if (!cachedProvider) {
    cachedProvider = buildProvider();
  }
  return cachedProvider;
}

/** Logs a delivery failure without throwing — see requestPasswordReset for why. */
export function logEmailFailure(action: string, err: unknown): void {
  logger.error(`Email could not ${action}`, err);
}
