import { Modal } from '@/components/ui/Modal';

const RULES = [
  'Take turns rolling the dice. You need a 6 to bring a token out of base onto your start square.',
  'Rolling a 6 gives you another roll. Three 6s in a row lose the turn.',
  'Pick a glowing token to move that many squares clockwise. If no token can move, the turn passes.',
  'Landing on a lone opponent token sends it back to its base. Two or more tokens of one colour on a square form a block and cannot be captured.',
  'Star squares and start squares are safe: nobody can be captured there.',
  'After a full lap a token turns into its own coloured lane. It needs the exact number to reach the centre.',
  'The first player to bring all four tokens home wins.',
];

export function LudoRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Ludo rules" size="sm">
      <ol className="space-y-3 text-sm text-muted">
        {RULES.map((rule, i) => (
          <li key={rule} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-foreground-soft">
              {i + 1}
            </span>
            <span>{rule}</span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
