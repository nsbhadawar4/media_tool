import { redirect } from 'next/navigation';

/** /admin/courses/N/generate — an older address: the AI Course Generator, with Class N chosen. */
export default async function AdminGenerateForClassPage({ params }: { params: Promise<{ level: string }> }) {
  const { level } = await params;
  const n = Number(level);
  redirect(Number.isInteger(n) && n >= 1 && n <= 12 ? `/admin/courses/generate?class=${n}` : '/admin/courses/generate');
}
