import nodemailer, { type Transporter } from 'nodemailer';
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

  constructor(config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });
    this.from = config.from;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}
