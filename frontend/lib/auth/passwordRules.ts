/**
 * Password rules for new accounts — the same ones the backend enforces on signup
 * (backend/src/validators/authValidators.ts: strongPassword). Shown as a live checklist; the
 * server is still the one that decides.
 */
export const PASSWORD_RULES: ReadonlyArray<{ id: string; label: string; test: (password: string) => boolean }> = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
];

/** The first unmet rule, phrased as an error, or null when the password is strong enough. */
export function passwordProblem(password: string): string | null {
  if (password.length > 200) return 'Password is too long';
  const failed = PASSWORD_RULES.find((rule) => !rule.test(password));
  return failed ? `Password needs ${failed.label.charAt(0).toLowerCase()}${failed.label.slice(1)}` : null;
}
