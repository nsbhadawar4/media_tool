import { BookOpen } from 'lucide-react';

/** A class without a picture: its colours with its subjects' marks (class pages, previews, Manage Courses). */
export function ThemedPlaceholder({ level, marks }: { level: number; marks: string[] }) {
  const slot = ((Math.max(1, level) - 1) % 5) + 1;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(135deg, var(--kid-class-${slot}), var(--kid-class-${slot}-2))` }}>
      <span className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/20" />
      <span className="absolute -bottom-12 left-4 h-32 w-32 rounded-full bg-black/10" />
      <span className="absolute inset-0 flex items-center justify-center gap-2 p-6">
        {(marks.length ? marks : ['📘']).map((m, i) => (
          <span key={`${m}-${i}`} className="flex h-14 min-w-14 items-center justify-center rounded-2xl border border-white/30 bg-white/15 px-2 text-xl font-bold text-white backdrop-blur-sm">
            {m}
          </span>
        ))}
      </span>
      <span className="absolute bottom-3 left-4 text-sm font-bold uppercase tracking-[0.2em] text-white/90">
        <BookOpen className="mr-1 inline h-4 w-4" />
        Class {level}
      </span>
    </div>
  );
}
