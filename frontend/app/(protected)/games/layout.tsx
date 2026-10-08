import type { ReactNode } from 'react';
import { SectionGate } from '@/components/content/SectionGate';

/** /games/*: open only while the "games" website section is on (/admin/content/sections). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SectionGate section="games" name="Games">
      {children}
    </SectionGate>
  );
}
