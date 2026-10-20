import { api } from './client';

/**
 * Admin → Archive and Admin → Trash / Deleted (backend adminLifecycleController). Two separate
 * states: archived (intentionally put away) and trashed (deleted, still restorable). Allowed moves:
 * active → archive / trash, archive → active / trash, trash → active / gone (typed DELETE).
 */
export type LifecycleKind = 'class' | 'subject' | 'course' | 'chapter' | 'kid_game' | 'game' | 'section';
export type LifecycleBin = 'archive' | 'trash';
export type LifecycleSort = 'recent' | 'oldest' | 'name' | 'name_desc';

export const KIND_LABEL: Record<LifecycleKind, string> = {
  class: 'Class',
  subject: 'Subject',
  course: 'Course',
  chapter: 'Chapter',
  kid_game: 'Kid Game',
  game: 'Game',
  section: 'Section',
};

export interface LifecycleRef {
  kind: LifecycleKind;
  id: string;
}

export interface LifecycleBlocker {
  kind: LifecycleKind;
  id: string | null;
  title: string;
  reason: 'archived' | 'trashed' | 'missing';
}

export interface LifecycleItem extends LifecycleRef {
  title: string;
  parent: string | null;
  location: string;
  state: 'archived' | 'trashed';
  /** When it went to Archive / Trash, and who did it. */
  at: string;
  by: string | null;
  /** Trash only: it was archived before it was deleted. */
  archivedAt: string | null;
  archivedBy: string | null;
  /** Part of the app itself: never deleted for good. */
  builtIn: boolean;
  /** What depends on it ("3 subjects", "12 chapters"). */
  contains: string[];
  /** Parents in Archive / Trash (restore them first, or with it) or gone (can't restore). */
  restoreBlockedBy: LifecycleBlocker[];
  /** Trash only: why it can't be deleted for good, or null. */
  deleteBlock: string | null;
}

export type LifecycleCounts = Record<LifecycleKind | 'all', number>;

export interface LifecycleList {
  items: LifecycleItem[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  counts: LifecycleCounts;
  /** Trash only: who deleted what is in Trash (the "Deleted by" filter). */
  deleters?: Array<{ id: string; name: string }>;
}

export interface LifecycleOutcome extends LifecycleRef {
  title: string | null;
  ok: boolean;
  code: 'ARCHIVED' | 'TRASHED' | 'RESTORED' | 'DELETED' | 'NOT_FOUND' | 'WRONG_STATE' | 'PARENT_ARCHIVED' | 'PARENT_MISSING' | 'BUILT_IN' | 'IN_USE' | 'FAILED';
  message: string;
  blockers?: LifecycleBlocker[];
  removed?: Record<string, number>;
}

export interface LifecycleListQuery {
  type: LifecycleKind | 'all';
  q: string;
  from?: string;
  to?: string;
  /** Trash only: deleted by this administrator. */
  by?: string;
  sort: LifecycleSort;
  page: number;
  limit: number;
}

type Many = { results: LifecycleOutcome[]; done: number; failed: number };

/** Everything Archive / Trash shows, and the sidebar badges — invalidated after any move. */
export const LIFECYCLE_KEY = ['admin', 'lifecycle'] as const;

const listQuery = (q: LifecycleListQuery) => ({ ...q, q: q.q || undefined, from: q.from || undefined, to: q.to || undefined, by: q.by || undefined });

export const lifecycleApi = {
  summary: (signal?: AbortSignal) => api.get<{ archive: LifecycleCounts; trash: LifecycleCounts }>('/api/admin/lifecycle/summary', undefined, signal),
  list: (bin: LifecycleBin, query: LifecycleListQuery, signal?: AbortSignal) => api.get<LifecycleList>(`/api/admin/${bin}`, listQuery(query), signal),
  /** Active → Archive. */
  archive: (ref: LifecycleRef) => api.post<LifecycleOutcome>('/api/admin/archive', ref),
  /** Active → Trash (Delete). */
  trash: (ref: LifecycleRef) => api.post<LifecycleOutcome>('/api/admin/trash', ref),
  restore: (bin: LifecycleBin, items: LifecycleRef[], withParents = false) => api.post<Many>(`/api/admin/${bin}/restore`, { items, withParents }),
  /** Archive → Trash. */
  moveToTrash: (items: LifecycleRef[]) => api.post<Many>('/api/admin/archive/trash', { items }),
  /** Trash → gone. The server checks the typed word too. */
  foreverDelete: (items: LifecycleRef[], confirm: string) => api.post<Many>('/api/admin/trash/delete', { items, confirm }),
};
