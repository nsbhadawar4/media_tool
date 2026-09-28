import { logger } from '../../utils/logger';
import type { EmailMessage, EmailProvider } from './EmailProvider';

/**
 * Prints the email instead of sending it. The only provider that works with zero setup,
 * so it is the default in development and tests (see EMAIL_PROVIDER in config/env.ts) —
 * and it says so loudly on every use, so watching the server log and seeing a reset link
 * is never mistaken for a real delivery having happened.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    logger.warn(
      `EMAIL NOT SENT (EMAIL_PROVIDER=console) — to: ${message.to}, subject: "${message.subject}"\n` +
        `${message.text}`,
    );
  }
}
