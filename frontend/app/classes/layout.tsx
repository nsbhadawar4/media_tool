import type { ReactNode } from 'react';
import { MarketingShell } from '@/components/marketing/MarketingShell';

/**
 * /classes/…: the public site's header and footer around the class list and every class, subject
 * and chapter page — kept in place while the next page loads (each segment's loading.tsx).
 */
export default function ClassesLayout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
