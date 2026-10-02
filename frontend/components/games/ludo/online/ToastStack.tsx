import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { Toast } from './useLudoRoom';

const ICON = { info: Info, error: AlertCircle, success: CheckCircle2 } as const;

/** In-page notifications (never alert()). Sits above the pinned controls on phones. */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 max-md:bottom-28"
    >
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'ludo-enter pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground shadow-pop',
              t.kind === 'error' ? 'border-rose-400/50' : t.kind === 'success' ? 'border-emerald-400/50' : 'border-border-strong',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 shrink-0',
                t.kind === 'error' ? 'text-rose-400' : t.kind === 'success' ? 'text-emerald-400' : 'text-accent-2',
              )}
            />
            <span className="min-w-0 flex-1">{t.text}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Dismiss"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
