import type { Types } from 'mongoose';

/**
 * Where an entry of the catalog (ContentItem: classes, subjects, the class ↔ subject links that are
 * courses, Kid Games, games, sections) or a course chapter (Course) stands:
 *
 *   ACTIVE    archivedAt null                      — in its lists, as usual
 *   ARCHIVED  archivedAt set, trashedAt null        — intentionally put away (Admin → Archive)
 *   TRASHED   trashedAt set (archivedAt set too)    — deleted, still restorable (Admin → Trash / Deleted)
 *
 * Every "active only" query in the app is `archivedAt: null`, so both ARCHIVED and TRASHED entries
 * are out of every active list without touching those queries — and everything archived before
 * Trash existed simply stays ARCHIVED. Nothing here removes data: only Trash's "Forever Delete"
 * does, and only from TRASHED. Allowed moves:
 *
 *   ACTIVE → ARCHIVED, ACTIVE → TRASHED, ARCHIVED → ACTIVE, ARCHIVED → TRASHED, TRASHED → ACTIVE
 *   (TRASHED → gone, in adminLifecycleController — never from ACTIVE or ARCHIVED directly)
 */
export type LifecycleState = 'active' | 'archived' | 'trashed';

export interface Archivable {
  archivedAt: Date | null;
  archivedBy: Types.ObjectId | null;
  restoredAt: Date | null;
  restoredBy: Types.ObjectId | null;
  trashedAt: Date | null;
  trashedBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
}

export function stateOf(doc: Pick<Archivable, 'archivedAt' | 'trashedAt'>): LifecycleState {
  if (doc.trashedAt) return 'trashed';
  return doc.archivedAt ? 'archived' : 'active';
}

/** Filters for each state (trashedAt: null also matches entries saved before the field existed). */
export const ACTIVE_FILTER = { archivedAt: null } as const;
export const ARCHIVED_FILTER = { archivedAt: { $ne: null }, trashedAt: null } as const;
export const TRASHED_FILTER = { trashedAt: { $ne: null } } as const;
/** Everything an admin list shows: active and archived — never what is in Trash. */
export const NOT_TRASHED_FILTER = { trashedAt: null } as const;

/** ACTIVE → ARCHIVED (not saved). */
export function markArchived(doc: Archivable, by: Types.ObjectId | null, at = new Date()): void {
  doc.archivedAt = at;
  doc.archivedBy = by;
  doc.trashedAt = null;
  doc.trashedBy = null;
  doc.updatedBy = by;
}

/** ACTIVE or ARCHIVED → TRASHED (not saved). An archived entry keeps when and by whom it was archived. */
export function markTrashed(doc: Archivable, by: Types.ObjectId | null, at = new Date()): void {
  if (!doc.archivedAt) {
    doc.archivedAt = at;
    doc.archivedBy = null; // straight from active: never archived
  }
  doc.trashedAt = at;
  doc.trashedBy = by;
  doc.updatedBy = by;
}

/** ARCHIVED or TRASHED → ACTIVE (not saved): back in its lists, as it was. */
export function markRestored(doc: Archivable, by: Types.ObjectId | null, at = new Date()): void {
  Object.assign(doc, restoreFields(by, at));
}

/** The same, as an update for updateMany (archiving many chapters at once). */
export const archiveUpdate = (by: Types.ObjectId | null, at = new Date()) => ({ $set: { archivedAt: at, archivedBy: by, trashedAt: null, trashedBy: null, updatedBy: by } });

/** A restore as one update — applied with a state filter, so an entry is restored once (no double restore). */
export const restoreFields = (by: Types.ObjectId | null, at = new Date()) => ({ archivedAt: null, trashedAt: null, trashedBy: null, restoredAt: at, restoredBy: by, updatedBy: by });

/** Audit metadata: the state before and after. */
export const archivedState = { previousStatus: 'active', newStatus: 'archived' } as const;
export const restoredState = { previousStatus: 'archived', newStatus: 'active' } as const;
export const transition = (from: LifecycleState, to: LifecycleState | 'deleted') => ({ previousStatus: from, newStatus: to });
