import { Resend } from 'resend';
import type { EmailMessage, EmailProvider } from './EmailProvider';

/** Sends through Resend's HTTP API. The recommended production provider — see EmailProvider. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      // Resend's error describes *its* rejection (bad domain, rate limit, invalid key) —
      // never an echo of what we sent — so this is safe to surface and log.
      throw new Error(`Resend error (${error.name}): ${error.message}`);
    }
  }
}
