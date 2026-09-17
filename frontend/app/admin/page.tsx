import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_COOKIE_NAME = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? 'mt_session';

/**
 * `/admin` never renders anything itself — it only decides where to send the visitor.
 * This is a fast, optimistic check (cookie presence only); whether the session is valid
 * *and* belongs to an administrator is settled by the admin layout and, definitively,
 * by the backend's requireAdmin on every request.
 */
export default async function AdminIndexPage() {
  const cookieStore = await cookies();
  const hasSessionCookie = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  redirect(hasSessionCookie ? '/admin/users' : '/admin/login');
}
