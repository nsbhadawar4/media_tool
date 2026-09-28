import { logger } from '../../utils/logger';
import type { EmailMessage, EmailProvider } from './EmailProvider';

/**
 * Logs that an email would have been sent, instead of sending it. The only provider that
 * works with zero setup, so it is the default in development and tests (see
 * EMAIL_PROVIDER in config/env.ts).
 *
 * Deliberately never logs `message.html`/`message.text`: a password-reset email's body
 * carries a one-time token good for actually taking over the account, and a server log is
 * routinely broader-read and longer-retained than anyone drafting an email service
 * expects. Recipient and subject are logged because they carry no secret and are already
 * the kind of thing an activity log records elsewhere in this app.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console' as const;

  async send(message: EmailMessage): Promise<void> {
    logger.warn(
      `EMAIL NOT SENT (EMAIL_PROVIDER=console) — to: ${message.to}, subject: "${message.subject}". ` +
        'Body withheld: it may carry a one-time token. Set EMAIL_PROVIDER=resend (or smtp) to actually deliver it.',
    );
  }
}
