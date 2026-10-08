/**
 * Everything the app needs from an SMS service. Kept this small on purpose: a real provider
 * (MSG91, Twilio, AWS SNS, …) is a new class implementing it plus one case in ./index.ts —
 * nothing else in the application knows which provider is in use.
 */
export interface SmsMessage {
  /** E.164, e.g. +919876543210. */
  to: string;
  body: string;
}

export interface SmsProvider {
  readonly name: string;
  /**
   * Whether `send` actually delivers a text. A provider that doesn't (the mock) is refused in
   * production, so the app never tells someone "we sent you a code" when nothing was sent.
   */
  readonly delivers: boolean;
  send(message: SmsMessage): Promise<void>;
}
