import type { ReactNode } from 'react';

/**
 * /courses/*: the signed-in app's way into the classes. Open whatever the Kid Games switch says —
 * courses follow Manage Courses alone (a class is listed while it is published and visible there).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
