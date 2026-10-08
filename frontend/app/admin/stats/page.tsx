import { redirect } from 'next/navigation';
import { ADMIN_HOME_PATH } from '@/lib/auth/routes';

/** The installation-wide statistics now live on the admin dashboard; kept for old links. */
export default function AdminStatsPage() {
  redirect(ADMIN_HOME_PATH);
}
