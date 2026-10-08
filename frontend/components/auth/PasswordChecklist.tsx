import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/auth/passwordRules';
import { cn } from '@/utils/cn';

/** Live view of the new-password rules, so people see what's missing before submitting. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.id}
            className={cn('flex items-center gap-1.5 text-[11px] transition-colors', met ? 'text-success' : 'text-muted')}
          >
            {met ? <Check className="h-3 w-3 shrink-0" strokeWidth={3} /> : <Circle className="h-3 w-3 shrink-0" />}
            <span>{rule.label}</span>
            <span className="sr-only">{met ? '(met)' : '(not yet)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
