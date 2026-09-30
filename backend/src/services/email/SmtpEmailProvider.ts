import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../../utils/logger';
import type { EmailMessage, EmailProvider } from './EmailProvider';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** Sends through any SMTP-speaking service — see EmailProvider for why SMTP specifically. */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly host: string;
  private readonly port: number;

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });
    this.from = config.from;
    this.host = config.host;
    this.port = config.port;
  }

  async send(message: EmailMessage): Promise<void> {
    // Never logs credentials or the body (it carries a one-time code) — only routing facts.
    const route = `host=${this.host} port=${this.port} from=${this.from} to=${message.to}`;
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      // "Accepted" means the SMTP server took the message, not that it reached the inbox.
      logger.info(
        `SMTP accepted message (${route}) accepted=${info.accepted?.length ?? '-'} rejected=${info.rejected?.length ?? '-'} ` +
          `response="${info.response}" messageId=${info.messageId}`,
      );
      if (info.accepted && info.accepted.length === 0) {
        throw new Error(`SMTP server accepted no recipients: ${info.response}`);
      }
    } catch (err) {
      const e = err as { code?: string; responseCode?: number; command?: string; response?: string; message?: string };
      logger.error(
        `SMTP send failed (${route}) code=${e.code ?? '-'} responseCode=${e.responseCode ?? '-'} ` +
          `command=${e.command ?? '-'} response="${e.response ?? '-'}" message="${e.message ?? 'unknown'}"`,
      );
      throw err;
    }
  }
}
