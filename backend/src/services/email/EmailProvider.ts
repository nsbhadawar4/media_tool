export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transport abstraction so the rest of the app never talks to a provider's API (or SMTP,
 * or console) directly. Implementations: ConsoleEmailProvider (dev/test default — logs
 * that a send happened, never the body), ResendEmailProvider (the recommended production
 * provider — one API key, no SMTP setup), SmtpEmailProvider (any SMTP-speaking service, for
 * anyone who already has one: SES, SendGrid, Postmark, Mailtrap, a plain mailbox). Swapping
 * EMAIL_PROVIDER in .env is the only thing that changes.
 */
export interface EmailProvider {
  readonly name: 'console' | 'resend' | 'smtp';
  send(message: EmailMessage): Promise<void>;
}
