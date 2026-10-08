import { env } from '../../config/env';
import { MockSmsProvider } from './MockSmsProvider';
import type { SmsProvider } from './SmsProvider';

export type { SmsMessage, SmsProvider } from './SmsProvider';

let cachedProvider: SmsProvider | null = null;

function buildProvider(): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'mock':
      return new MockSmsProvider(env.isDevelopment);
    // Add real providers here, e.g. `case 'msg91': return new Msg91SmsProvider(...)`.
  }
}

/**
 * Whether mobile verification texts can be used right now: always with a provider that really
 * delivers; with the mock only outside production. When this is false, mobile signup fails
 * with a clear "not available" answer instead of pretending a code was sent.
 */
export function isSmsDeliveryAvailable(): boolean {
  return getSmsProvider().delivers || !env.isProduction;
}

/** The configured provider, built once per process. */
export function getSmsProvider(): SmsProvider {
  if (!cachedProvider) cachedProvider = buildProvider();
  return cachedProvider;
}
