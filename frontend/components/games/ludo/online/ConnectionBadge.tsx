import { cn } from '@/utils/cn';
import type { Connection } from './useLudoRoom';

const LABEL: Record<Connection, string> = {
  idle: 'Offline',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
  unavailable: 'Server unavailable',
};

/** A small status pill. Only the dot pulses (opacity), and only while something is in progress. */
export function ConnectionBadge({ state }: { state: Connection }) {
  const good = state === 'connected';
  const busy = state === 'connecting' || state === 'reconnecting';
  return (
    <span
      role="status"
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-white/[0.04] px-2.5 text-[11px] font-medium text-muted"
    >
      <span
        aria-hidden
        className={cn('h-2 w-2 rounded-full', good ? 'bg-emerald-400' : busy ? 'ludo-dot bg-amber-400' : 'bg-rose-400')}
      />
      {LABEL[state]}
    </span>
  );
}
