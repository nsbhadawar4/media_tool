import { headers } from 'next/headers';

/**
 * Server-only site configuration for the public pages. Nothing here reads a secret, and the
 * only value that ever reaches the page is an email address or an origin.
 */

/**
 * The site's absolute URL when the deployment says what it is: NEXT_PUBLIC_SITE_URL, or on
 * Vercel the production domain Vercel provides. Null when neither is set — never a guess.
 */
export function configuredSiteUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/** A plain host[:port], so a malformed Host header can't be turned into a URL. */
const HOST_PATTERN = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * Base for canonical links and Open Graph URLs on a public page.
 *
 * With a configured URL this is static, and the page stays prerendered. Without one it falls
 * back to the origin the current request came in on — which makes that page render per
 * request, but keeps the URLs correct on any host instead of pointing at a made-up address.
 */
export async function siteMetadataBase(): Promise<URL | undefined> {
  const configured = configuredSiteUrl();
  if (configured) return new URL(configured);

  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0]!.trim();
  if (!HOST_PATTERN.test(host)) return undefined;
  const forwardedProto = h.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto === 'http' || forwardedProto === 'https' ? forwardedProto : host.startsWith('localhost') ? 'http' : 'https';
  return new URL(`${proto}://${host}`);
}

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * The address people can write to for help: SUPPORT_EMAIL if one is set, otherwise the
 * sender address the app already emails from (EMAIL_FROM, e.g. `Media Tool <help@…>`), which
 * every password-reset recipient sees anyway. Only the address itself is returned — never a
 * display name, and nothing from any other variable. Null when neither is configured.
 */
export function supportEmail(): string | null {
  for (const raw of [process.env.SUPPORT_EMAIL, process.env.EMAIL_FROM]) {
    const value = raw?.trim();
    if (!value) continue;
    const address = (/<([^>]+)>/.exec(value)?.[1] ?? value).trim();
    if (EMAIL_PATTERN.test(address)) return address;
  }
  return null;
}
