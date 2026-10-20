import { z } from 'zod';

/**
 * Admin → Archive and Admin → Trash / Deleted. Every request names entries as { kind, id }: the kind
 * is checked against what the id really is (adminLifecycleController.load), so an id can't be passed
 * off as another kind; the entry's current state is checked against the move asked for.
 */
export const LIFECYCLE_KINDS = ['class', 'subject', 'course', 'chapter', 'kid_game', 'game', 'section'] as const;
export type LifecycleKind = (typeof LIFECYCLE_KINDS)[number];

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
const ref = z.object({ kind: z.enum(LIFECYCLE_KINDS), id: objectId }).strict();
export type LifecycleRef = z.infer<typeof ref>;

/** 1–100 entries, none twice. */
const refs = z
  .array(ref)
  .min(1, 'Choose at least one item')
  .max(100, 'At most 100 items at a time')
  .refine((list) => new Set(list.map((r) => `${r.kind}:${r.id}`)).size === list.length, { message: 'An item is listed twice' });

export const lifecycleListQuerySchema = z
  .object({
    type: z.enum(['all', ...LIFECYCLE_KINDS]).default('all'),
    q: z.string().trim().max(120).default(''),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    /** Trash only: who deleted it. */
    by: objectId.optional(),
    sort: z.enum(['recent', 'oldest', 'name', 'name_desc']).default('recent'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type LifecycleListQuery = z.infer<typeof lifecycleListQuerySchema>;

export const lifecycleRefSchema = ref;
export const lifecycleRestoreSchema = z.object({ items: refs, withParents: z.boolean().default(false) }).strict();
export const lifecycleMoveSchema = z.object({ items: refs }).strict();
/** Forever Delete asks for the word itself, on the server too — not just a button. */
export const lifecycleDeleteSchema = z.object({ items: refs, confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }) }).strict();
