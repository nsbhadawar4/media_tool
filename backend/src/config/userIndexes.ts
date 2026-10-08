import { logger } from '../utils/logger';

/**
 * Moves the users collection from its original `email_1` index (unique, every document) to
 * the partial unique index the User schema now declares (unique only where an email exists),
 * which is what lets mobile-signup accounts exist without an email.
 *
 * Order matters and is what makes this safe on a live database: the new index is built first,
 * so email uniqueness is enforced throughout, and only then is the old one dropped. It only
 * touches indexes — no document is read or changed — and is a no-op once done.
 */
export const USER_EMAIL_INDEX = {
  name: 'email_unique_present',
  key: { email: 1 },
  partialFilterExpression: { email: { $type: 'string' } },
} as const;

/** The few collection methods used here — structural, so mongoose's and the driver's types both fit. */
interface IndexedCollection {
  indexes(): Promise<Array<{ name?: string; unique?: boolean; partialFilterExpression?: unknown }>>;
  createIndex(key: Record<string, 1 | -1>, options: Record<string, unknown>): Promise<string>;
  dropIndex(name: string): Promise<unknown>;
}

export async function migrateUserEmailIndex(users: IndexedCollection): Promise<'migrated' | 'already-done'> {
  const indexes = await users.indexes();
  let changed = false;

  if (!indexes.some((i) => i.name === USER_EMAIL_INDEX.name)) {
    await users.createIndex({ ...USER_EMAIL_INDEX.key }, {
      name: USER_EMAIL_INDEX.name,
      unique: true,
      partialFilterExpression: USER_EMAIL_INDEX.partialFilterExpression,
    });
    changed = true;
  }

  const legacy = indexes.find((i) => i.name === 'email_1' && i.unique && !i.partialFilterExpression);
  if (legacy) {
    await users.dropIndex('email_1');
    changed = true;
  }

  if (changed) logger.info('users: email index migrated to unique-when-present (email_unique_present)');
  return changed ? 'migrated' : 'already-done';
}
