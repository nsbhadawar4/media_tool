import { Types, type FilterQuery } from 'mongoose';
import { User, accountLabel, type IUser } from '../models/User';
import { Media } from '../models/Media';
import type { IActivityLog } from '../models/ActivityLog';
import { ACTIVITY_CATEGORIES, type ActivityAction, type ActivityCategory, type FileType } from '../config/constants';
import { describeUserAgent, maskIp } from '../utils/clientInfo';
import { maskPhone } from '../utils/phone';

/**
 * Query building and serialisation for the admin panel's user and activity screens. Everything
 * here returns only what an administrator may see: no secrets, a masked IP, a coarse device.
 */

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Accounts from before `authProvider` existed are email accounts unless they only have a phone. */
export function providerFilter(provider: 'email' | 'mobile' | 'google'): FilterQuery<IUser> {
  if (provider === 'email') {
    return { $or: [{ authProvider: 'email' }, { authProvider: { $in: [null] }, phoneE164: { $in: [null] } }, { authProvider: { $in: [null] }, email: { $type: 'string' } }] };
  }
  if (provider === 'mobile') {
    return { $or: [{ authProvider: 'mobile' }, { authProvider: { $in: [null] }, email: { $in: [null] }, phoneE164: { $type: 'string' } }] };
  }
  return { authProvider: 'google' };
}

/** Plans belong to normal users; an account that never chose one uses Free. */
export function planFilter(plan: 'free' | 'pro' | 'premium'): FilterQuery<IUser> {
  return plan === 'free' ? { role: 'user', plan: { $in: ['free', null] } } : { role: 'user', plan };
}

/** Name or email contains the text; a run of digits also matches mobile numbers. */
export function userSearchFilter(search: string): FilterQuery<IUser> {
  const text = { $regex: escapeRegex(search), $options: 'i' };
  const or: FilterQuery<IUser>[] = [{ name: text }, { email: text }];
  const digits = search.replace(/\D/g, '');
  if (digits.length >= 3) {
    const number = { $regex: escapeRegex(digits) };
    or.push({ phoneE164: number }, { mobile: { $regex: digits.split('').map(escapeRegex).join('[\\s()-]*') } });
  }
  return { $or: or };
}

/** Everything that concerns one account: what it did, what was done to it, and what named it. */
export function userTimelineFilter(user: Pick<IUser, '_id' | 'email' | 'phoneE164'>): FilterQuery<IActivityLog> {
  const identifiers = [user.email, user.phoneE164].filter((v): v is string => Boolean(v));
  return {
    $or: [
      { subjectUserId: user._id },
      { performedBy: user._id },
      { targetType: 'user', targetId: user._id },
      ...(identifiers.length ? [{ subjectIdentifier: { $in: identifiers } }] : []),
    ],
  };
}

/** The categories an action belongs to, for labels and filters. */
export function categoriesOf(action: ActivityAction): ActivityCategory[] {
  return (Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[]).filter((c) => (ACTIVITY_CATEGORIES[c] as readonly string[]).includes(action));
}

/** Phone numbers are shown masked; emails as they are (administrators already see them). */
function identifierLabel(identifier: string | null | undefined): string | null {
  if (!identifier) return null;
  return identifier.startsWith('+') ? maskPhone(identifier) : identifier;
}

export interface AdminActivityEntry {
  id: string;
  action: ActivityAction;
  categories: ActivityCategory[];
  status: 'success' | 'failure';
  authProvider: string | null;
  /** For code events: what the code was for (mobile_signup, password_reset). */
  purpose: string | null;
  /** For failures: why (wrong_password, suspended, no_account, incorrect, expired, locked, …). */
  reason: string | null;
  message: string;
  targetType: string;
  targetId: string | null;
  targetName: string | null;
  fileType: FileType | null;
  performedBy: string | null;
  performedByEmail: string | null;
  /** The account the event concerns, when there is one. */
  user: { id: string; name: string; label: string; role: string } | null;
  /** What the event named when no account matched (e.g. a failed sign-in for an unknown address). */
  subjectLabel: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  ipMasked: string | null;
  createdAt: Date;
}

/**
 * Turns log rows into admin entries, resolving the accounts they concern and, for uploads, what
 * kind of file it was — two queries for the whole page, whatever its size.
 */
export async function serializeActivity(entries: IActivityLog[]): Promise<AdminActivityEntry[]> {
  const userIds = [...new Set(entries.map((e) => (e.subjectUserId ?? e.performedBy)?.toString()).filter(Boolean))] as string[];
  const mediaIds = entries.filter((e) => e.targetType === 'media' && e.targetId).map((e) => e.targetId!);

  const [users, media] = await Promise.all([
    userIds.length
      ? User.find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } }, { name: 1, email: 1, phoneE164: 1, role: 1 }).lean<
          Array<Pick<IUser, '_id' | 'name' | 'email' | 'phoneE164' | 'role'>>
        >()
      : [],
    mediaIds.length ? Media.find({ _id: { $in: mediaIds } }, { fileType: 1 }).lean<Array<{ _id: Types.ObjectId; fileType: FileType }>>() : [],
  ]);
  const userBy = new Map(users.map((u) => [u._id.toString(), u]));
  const fileTypeBy = new Map(media.map((m) => [m._id.toString(), m.fileType]));

  return entries.map((e) => {
    const subject = userBy.get((e.subjectUserId ?? e.performedBy)?.toString() ?? '');
    const client = describeUserAgent(e.userAgent);
    // Only these two short, non-sensitive fields of the (already sanitised) metadata leave the API.
    const meta = (e.metadata ?? {}) as { purpose?: unknown; reason?: unknown };
    return {
      id: e._id.toString(),
      action: e.action,
      categories: categoriesOf(e.action),
      status: e.status ?? 'success',
      authProvider: e.authProvider ?? null,
      purpose: typeof meta.purpose === 'string' ? meta.purpose : null,
      reason: typeof meta.reason === 'string' ? meta.reason : null,
      message: e.message,
      targetType: e.targetType,
      targetId: e.targetId?.toString() ?? null,
      targetName: e.targetName ?? null,
      fileType: e.targetType === 'media' && e.targetId ? (fileTypeBy.get(e.targetId.toString()) ?? null) : null,
      performedBy: e.performedBy?.toString() ?? null,
      performedByEmail: e.performedByEmail ?? null,
      user: subject ? { id: subject._id.toString(), name: subject.name, label: accountLabel(subject), role: subject.role } : null,
      subjectLabel: subject ? null : identifierLabel(e.subjectIdentifier),
      device: client.device,
      os: client.os,
      browser: client.browser,
      ipMasked: maskIp(e.ip),
      createdAt: e.createdAt,
    };
  });
}

export const pageMeta = (page: number, limit: number, total: number) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
