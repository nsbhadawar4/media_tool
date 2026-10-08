import { logger } from '../../utils/logger';
import { maskPhone } from '../../utils/phone';
import type { SmsMessage, SmsProvider } from './SmsProvider';

/**
 * Sends nothing, ever. For development and tests until a real provider is configured.
 *
 * In development (NODE_ENV=development) the message — including any one-time code — is written
 * to the server log, so a developer can complete a mobile signup locally. Anywhere else (tests,
 * production) the body is withheld and the number masked: a code must never land in logs
 * beyond a developer's own machine. Production refuses the mock entirely — see
 * isSmsDeliveryAvailable.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock' as const;
  readonly delivers = false;

  constructor(private readonly logBodies: boolean) {}

  async send(message: SmsMessage): Promise<void> {
    if (this.logBodies) {
      logger.warn(`SMS NOT SENT (SMS_PROVIDER=mock) — to: ${message.to} — "${message.body}"`);
    } else {
      logger.warn(
        `SMS NOT SENT (SMS_PROVIDER=mock) — to: ${maskPhone(message.to)}. Body withheld in production. ` +
          'Configure a real SMS provider to deliver verification codes.',
      );
    }
  }
}
