import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/auth/passwordRules';
import { cn } from '@/utils/cn';

/** Live view of the new-password rules, so people see what's missing before submitting. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul
      className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-hover/40 px-3.5 py-3 min-[380px]:grid-cols-2"
      aria-label="Password requirements"
    >
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.id}
            className={cn('flex items-center gap-2 text-xs leading-5 transition-colors', met ? 'text-success' : 'text-muted')}
          >
            {met ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
            <span>{rule.label}</span>
            <span className="sr-only">{met ? '(met)' : '(not yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
