import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface NormalizedPhone {
  /** +919876543210 — the canonical form stored and matched on. */
  e164: string;
  /** +91 98765 43210 — for display. */
  international: string;
}

/**
 * Parses a national number in the context of an ISO country (IN, US, …) and returns its
 * canonical E.164 form, or null when it isn't a valid number for that country. The country is
 * an ISO code rather than a dial code because some dial codes are shared (+1 is the US,
 * Canada and others).
 */
export function normalizePhone(country: string, number: string): NormalizedPhone | null {
  const parsed = parsePhoneNumberFromString(number, country.toUpperCase() as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return { e164: parsed.number, international: parsed.formatInternational() };
}

/** Whether a string is already a valid E.164 number (as sent back by the client after step 1). */
export function isE164(value: string): boolean {
  const parsed = parsePhoneNumberFromString(value);
  return Boolean(parsed && parsed.isValid() && parsed.number === value);
}

/** "+91 •••••• 3210" — enough for the owner to recognise, not enough to read off a screen. */
export function maskPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  const last4 = e164.slice(-4);
  return parsed ? `+${parsed.countryCallingCode} •••••• ${last4}` : `•••••• ${last4}`;
}
