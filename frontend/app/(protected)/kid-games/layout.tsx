import type { ReactNode } from 'react';
import { SectionGate } from '@/components/content/SectionGate';

/** /kid-games/*: open only while the "kid-games" website section is on (/admin/content/sections). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SectionGate section="kid-games" name="Kid Games">
      {children}
    </SectionGate>
  );
}
