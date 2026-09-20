import { redirect } from 'next/navigation';

/**
 * Kept so links and bookmarks to /login still work. The sign-in form itself now lives at
 * `/` — see app/page.tsx — and this forwards there rather than rendering a second copy,
 * so there is only ever one sign-in page to maintain.
 *
 * The query string is carried across, which matters for `?registered=1` (the post-signup
 * notice) and `?from=` (where to return to after signing in).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }

  const query = params.toString();
  redirect(query ? `/?${query}` : '/');
}
