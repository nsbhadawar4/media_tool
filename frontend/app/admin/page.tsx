import { redirect } from 'next/navigation';
import { ADMIN_HOME_PATH } from '@/lib/auth/routes';

/**
 * `/admin` never renders anything itself. A signed-out visitor never reaches this (proxy.ts
 * sends them to /login first); whether the session belongs to an administrator is settled by
 * the admin layout and, definitively, by the backend's requireAdmin on every request.
 */
export default function AdminIndexPage() {
  redirect(ADMIN_HOME_PATH);
}
