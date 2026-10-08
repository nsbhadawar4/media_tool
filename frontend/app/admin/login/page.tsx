import { redirect } from 'next/navigation';
import { LOGIN_PATH } from '@/lib/auth/routes';

/**
 * Kept so links and bookmarks to the old admin sign-in still work. There is one sign-in
 * page now (/login); an administrator's role, not the form, sends them to /admin/dashboard.
 *
 * The query string is carried across, which matters for `?from=` and `?session=expired`.
 */
export default async function AdminLoginPage({
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
  redirect(query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH);
}
