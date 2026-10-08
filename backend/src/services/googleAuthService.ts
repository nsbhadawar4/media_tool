import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { User, type IUser } from '../models/User';

/**
 * "Continue with Google", using Google Identity Services' ID-token flow.
 *
 * The browser gets a signed ID token (a JWT) from Google and posts it here; this service
 * verifies it with Google's public keys — signature, issuer, expiry and that it was issued for
 * *this* app's client ID — and only then trusts its claims. Nothing the client says about who
 * the user is (id, email, role) is ever read. No Google access or refresh token exists in this
 * flow, so none is stored, and no client secret is needed (the client ID is public by design).
 */

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  nonce: string | null;
}

type Verifier = (idToken: string) => Promise<GoogleIdentity>;

let client: OAuth2Client | null = null;

const verifyWithGoogle: Verifier = async (idToken) => {
  if (!env.GOOGLE_CLIENT_ID) throw new Error('Google sign-in is not configured');
  client ??= new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new Error('Google token is missing required claims');
  return { sub: p.sub, email: p.email, emailVerified: p.email_verified === true, name: p.name ?? null, nonce: p.nonce ?? null };
};

let verifier: Verifier = verifyWithGoogle;

/** Tests swap in a fake verifier; production always uses Google's. */
export function setGoogleTokenVerifier(next: Verifier | null): void {
  verifier = next ?? verifyWithGoogle;
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID);
}

export function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  return verifier(idToken);
}

/** Random, single-use value Google embeds in the ID token; checked against an HTTP-only cookie. */
export function newGoogleNonce(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function noncesMatch(expected: string | undefined, actual: string | null): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A bcrypt hash nobody knows the input of: the account has no usable password. */
async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
}

export type GoogleSignInResult =
  | { ok: true; user: IUser; created: boolean; passwordDisabled: boolean }
  | { ok: false; reason: 'unverified-email' | 'admin-account' | 'inactive' | 'conflict' };

/**
 * Finds or creates the account for a verified Google identity.
 *
 *  1. Already linked (googleId) → that account.
 *  2. An account with the same email → linked to Google, unless it is an administrator.
 *     Emails are never verified at signup in this app, so whoever registered that address may
 *     not own it. Google has just proved the person signing in *does* own it, so on that first
 *     link any password set by someone else is turned off and every existing session ended
 *     (the owner can set a new password with "Forgot password"). That closes the
 *     "pre-registered account" takeover where an attacker signs up with a victim's email first.
 *  3. Otherwise → a new plain user, with onboarding to complete.
 *
 * Administrators are never created, linked or signed in through Google: the role is only ever
 * set server-side (create-admin), and an admin keeps signing in with their password.
 */
export async function signInWithGoogle(identity: GoogleIdentity): Promise<GoogleSignInResult> {
  if (!identity.emailVerified) return { ok: false, reason: 'unverified-email' };
  const email = identity.email.trim().toLowerCase();

  const linked = await User.findOne({ googleId: identity.sub });
  if (linked) {
    if (linked.role === 'admin') return { ok: false, reason: 'admin-account' };
    if (!linked.isActive) return { ok: false, reason: 'inactive' };
    return { ok: true, user: linked, created: false, passwordDisabled: false };
  }

  const byEmail = await User.findOne({ email });
  if (byEmail) {
    if (byEmail.role === 'admin') return { ok: false, reason: 'admin-account' };
    if (!byEmail.isActive) return { ok: false, reason: 'inactive' };
    // Already linked to a *different* Google account: don't silently re-point it.
    if (byEmail.googleId && byEmail.googleId !== identity.sub) return { ok: false, reason: 'conflict' };

    const passwordDisabled = !byEmail.isEmailVerified;
    byEmail.googleId = identity.sub;
    byEmail.isEmailVerified = true;
    if (passwordDisabled) {
      byEmail.passwordHash = await unusablePasswordHash();
      byEmail.tokenVersion = (byEmail.tokenVersion ?? 0) + 1;
    }
    await byEmail.save();
    return { ok: true, user: byEmail, created: false, passwordDisabled };
  }

  const user = await User.create({
    name: (identity.name?.trim() || email.split('@')[0]!).slice(0, 120),
    email,
    isEmailVerified: true,
    googleId: identity.sub,
    authProvider: 'google',
    passwordHash: await unusablePasswordHash(),
    onboardingRequired: true,
    // Never from the request: a public sign-in must not be able to mint an administrator.
    role: 'user',
  });
  return { ok: true, user, created: true, passwordDisabled: false };
}
