/**
 * How a client-side auth gate tells proxy.ts "I already asked the server about this
 * session, and it said no".
 *
 * proxy.ts decides where to send a visitor from the *presence* of the session cookie
 * alone — it cannot verify the token, by design. That is right for someone who is still
 * signed in, and a trap for someone whose cookie is no longer accepted: the gate
 * redirects them out to the sign-in page, the proxy sees a cookie and redirects them
 * straight back in, the gate asks again, and the app spins on its loading state for as
 * long as the tab is open. There is no way out of that loop from inside the app, not
 * even to the login form.
 *
 * So the redirect out carries this marker, and the proxy stands aside when it sees it
 * (and drops the dead cookie on the way past). It is deliberately set only after a 401 —
 * a request that never reached the server proves nothing about the session, and treating
 * a brief network blip as a sign-out would throw away a perfectly good one.
 */
export const SESSION_ENDED_PARAM = 'session';
export const SESSION_ENDED_VALUE = 'expired';

/** Sign-in URL to send someone to once the server has rejected their session. */
export function sessionEndedUrl(path: '/' | '/admin/login' = '/'): string {
  return `${path}?${SESSION_ENDED_PARAM}=${SESSION_ENDED_VALUE}`;
}
