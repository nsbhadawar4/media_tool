/** How an account is shown where an email used to be assumed: its email, else its verified phone. */
export function accountLabel(user: { email: string | null; phone?: string | null }): string {
  return user.email ?? user.phone ?? '—';
}
