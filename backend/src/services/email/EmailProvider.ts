export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transport abstraction so the rest of the app never talks to an SMTP server (or console)
 * directly. Implementations: ConsoleEmailProvider (dev/test default — logs instead of
 * sending), SmtpEmailProvider (any SMTP-speaking service: a real mailbox, SES, SendGrid,
 * Resend, Postmark, Mailtrap, self-hosted). Swapping EMAIL_PROVIDER in .env is the only
 * thing that changes.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
