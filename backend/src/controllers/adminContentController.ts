import type { Request, Response } from 'express';
import { Types, type FilterQuery } from 'mongoose';
import { ContentItem, type IContentItem } from '../models/ContentItem';
import { Course, type ICourse, type ICourseLesson } from '../models/Course';
import { CONTENT_TYPES, type ActivityAction, type ContentType } from '../config/constants';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { ensureCatalogSeeded, invalidateCatalog, nextOrder, siblingFilter } from '../services/contentService';
import { classSubjectKey } from '../services/learningStructure';
import { escapeRegex, pageMeta } from '../services/adminQueries';
import type { CreateContentInput, CreateCourseInput, UpdateContentInput, UpdateCourseInput } from '../validators/contentValidators';

/**
 * Admin content management: the catalog (sections, classes, subjects, Kid Games, games) and
 * courses. Every route sits behind requireAuth + requireAdmin (adminRoutes), and every change is
 * written to the activity log with the administrator as actor and only safe metadata — the
 * entry's type, key and which fields changed, never their values' secrets (there are none here).
 */

const TYPE_LABEL: Record<ContentType, string> = {
  section: 'section',
  class: 'class',
  subject: 'subject',
  class_subject: 'class subject',
  kid_game: 'Kid Game',
  game: 'game',
};

type Status = 'live' | 'active' | 'disabled' | 'hidden' | 'archived' | 'all';

function statusFilter(status: Status): FilterQuery<IContentItem & ICourse> {
  switch (status) {
    case 'archived':
      return { archivedAt: { $ne: null } };
    case 'active':
      return { archivedAt: null, isEnabled: true, isVisible: true };
    case 'disabled':
      return { archivedAt: null, isEnabled: false };
    case 'hidden':
      return { archivedAt: null, isVisible: false };
    case 'all':
      return {};
    default:
      return { archivedAt: null };
  }
}

const SORTS = {
  order: { order: 1, _id: 1 },
  title: { title: 1, _id: 1 },
  updated: { updatedAt: -1, _id: -1 },
  created: { createdAt: -1, _id: -1 },
} as const;

/** `updatedBy` as loaded: an id, or the administrator's name and email once populated. */
type UpdatedBy = Types.ObjectId | { _id: Types.ObjectId; name?: string; email?: string } | null;

function serializeUpdatedBy(value: UpdatedBy) {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return { id: value.toString(), name: null, email: null };
  return { id: value._id.toString(), name: value.name ?? null, email: value.email ?? null };
}

function serializeItem(item: IContentItem) {
  return {
    id: item._id.toString(),
    type: item.type,
    key: item.key,
    title: item.title,
    description: item.description,
    classLevel: item.classLevel ?? null,
    subject: item.subject ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    glyph: item.glyph ?? null,
    difficulty: item.difficulty ?? null,
    gameType: item.gameType ?? null,
    courseId: item.courseId ? item.courseId.toString() : null,
    order: item.order,
    isEnabled: item.isEnabled,
    isVisible: item.isVisible,
    source: item.source,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    updatedBy: serializeUpdatedBy(item.updatedBy as UpdatedBy),
  };
}

/** Writes one audit entry for a catalog change. */
function auditItem(req: Request, action: ActivityAction, item: IContentItem, verb: string, metadata: Record<string, unknown> = {}) {
  return logActivity(req, {
    action,
    targetType: 'content',
    targetId: item._id,
    targetName: item.title,
    message: `${verb} ${TYPE_LABEL[item.type]} “${item.title}”`,
    metadata: { type: item.type, key: item.key, ...metadata },
  });
}

// ------------------------------------------------------------------------------------ relationships

/** A live (not archived) class with this number, or a 400 naming the field. */
async function assertClass(classLevel: number) {
  if (!(await ContentItem.exists({ type: 'class', classLevel, archivedAt: null }))) {
    throw AppError.badRequest(`There is no Class ${classLevel}`, [{ path: 'classLevel', message: 'Unknown class' }]);
  }
}

async function assertSubject(subject: string) {
  if (!(await ContentItem.exists({ type: 'subject', key: subject, archivedAt: null }))) {
    throw AppError.badRequest(`There is no subject “${subject}”`, [{ path: 'subject', message: 'Unknown subject' }]);
  }
}

/** The class exists, the subject exists, and the class offers the subject (a live link). */
async function assertClassOffersSubject(classLevel: number, subject: string) {
  await Promise.all([assertClass(classLevel), assertSubject(subject)]);
  if (!(await ContentItem.exists({ type: 'class_subject', classLevel, subject, archivedAt: null }))) {
    throw AppError.badRequest(`Class ${classLevel} doesn't offer “${subject}” — assign the subject to the class first`, [
      { path: 'subject', message: 'Not offered in this class' },
    ]);
  }
}

/** A live course in this class and subject. */
async function assertCourseFits(courseId: string, classLevel: number, subject: string) {
  const course = await Course.findOne({ _id: courseId, archivedAt: null }, { classLevel: 1, subject: 1 }).lean<{ classLevel: number | null; subject: string | null } | null>();
  if (!course) throw AppError.badRequest('That course doesn’t exist (or is archived)', [{ path: 'courseId', message: 'Unknown course' }]);
  if (course.classLevel !== classLevel || course.subject !== subject) {
    throw AppError.badRequest('The course is for a different class or subject', [{ path: 'courseId', message: 'Course does not match' }]);
  }
}

// ------------------------------------------------------------------------------------ catalog

/** Counts per type: total, active, disabled, hidden, archived and admin-added. */
export const getContentStats = asyncHandler(async (_req: Request, res: Response) => {
  await ensureCatalogSeeded();
  const rows = await ContentItem.aggregate<{ _id: ContentType; total: number; active: number; disabled: number; hidden: number; archived: number; custom: number }>([
    {
      $group: {
        _id: '$type',
        total: { $sum: { $cond: [{ $eq: ['$archivedAt', null] }, 1, 0] } },
        active: { $sum: { $cond: [{ $and: [{ $eq: ['$archivedAt', null] }, '$isEnabled', '$isVisible'] }, 1, 0] } },
        disabled: { $sum: { $cond: [{ $and: [{ $eq: ['$archivedAt', null] }, { $not: '$isEnabled' }] }, 1, 0] } },
        hidden: { $sum: { $cond: [{ $and: [{ $eq: ['$archivedAt', null] }, { $not: '$isVisible' }] }, 1, 0] } },
        archived: { $sum: { $cond: [{ $ne: ['$archivedAt', null] }, 1, 0] } },
        custom: { $sum: { $cond: [{ $eq: ['$source', 'admin'] }, 1, 0] } },
      },
    },
  ]);
  const zero = { total: 0, active: 0, disabled: 0, hidden: 0, archived: 0, custom: 0 };
  const byType = Object.fromEntries(CONTENT_TYPES.map((t) => [t, { ...zero }])) as Record<ContentType, typeof zero>;
  for (const { _id, ...counts } of rows) byType[_id] = counts;

  const [coursesLive, coursesActive, coursesArchived] = await Promise.all([
    Course.countDocuments({ archivedAt: null }),
    Course.countDocuments({ archivedAt: null, isEnabled: true, isVisible: true }),
    Course.countDocuments({ archivedAt: { $ne: null } }),
  ]);
  sendSuccess(res, { ...byType, course: { total: coursesLive, active: coursesActive, archived: coursesArchived } });
});

export const listContent = asyncHandler(async (req: Request, res: Response) => {
  await ensureCatalogSeeded();
  const { type, search, status, classLevel, subject, sort, page, limit } = req.query as unknown as {
    type: ContentType;
    search?: string;
    status: Status;
    classLevel?: number;
    subject?: string;
    sort: keyof typeof SORTS;
    page: number;
    limit: number;
  };
  const clauses: FilterQuery<IContentItem>[] = [{ type }, statusFilter(status)];
  if (classLevel !== undefined) clauses.push({ classLevel });
  if (subject) clauses.push({ subject });
  if (search) {
    const text = { $regex: escapeRegex(search), $options: 'i' };
    clauses.push({ $or: [{ title: text }, { key: text }, { description: text }] });
  }
  const filter = { $and: clauses };
  // Kid Games read naturally grouped by class and subject before their own order.
  const order = sort === 'order' && type === 'kid_game' ? { classLevel: 1, subject: 1, order: 1, _id: 1 } : SORTS[sort];

  const [items, total] = await Promise.all([
    ContentItem.find(filter)
      .sort(order as Record<string, 1 | -1>)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('updatedBy', 'name email'),
    ContentItem.countDocuments(filter),
  ]);
  sendSuccess(res, items.map(serializeItem), 200, pageMeta(page, limit, total));
});

export const createContent = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateContentInput;
  await ensureCatalogSeeded();

  // Classes and their subject links are addressed by number / subject, so their keys are derived
  // here rather than taken from the request.
  const key =
    input.type === 'class' ? `class-${input.classLevel}` : input.type === 'class_subject' ? classSubjectKey(input.classLevel!, input.subject!) : input.key!;

  if (await ContentItem.exists({ type: input.type, key })) {
    throw AppError.conflict(
      input.type === 'class'
        ? `Class ${input.classLevel} already exists (it may be archived)`
        : input.type === 'class_subject'
          ? `Class ${input.classLevel} already offers “${input.subject}” (the link may be archived — restore it)`
          : `A ${TYPE_LABEL[input.type]} with the key “${key}” already exists (it may be archived)`,
    );
  }
  if (input.type === 'class_subject') await Promise.all([assertClass(input.classLevel!), assertSubject(input.subject!)]);
  if (input.type === 'kid_game') {
    await assertClassOffersSubject(input.classLevel!, input.subject!);
    if (input.courseId) await assertCourseFits(input.courseId, input.classLevel!, input.subject!);
  }

  const fields = {
    type: input.type,
    key,
    title: input.title,
    description: input.description,
    classLevel: input.classLevel ?? null,
    subject: input.subject ?? null,
  };
  const item = await ContentItem.create({
    ...fields,
    thumbnailUrl: input.thumbnailUrl ?? null,
    glyph: input.type === 'subject' ? (input.glyph ?? null) : null,
    difficulty: input.type === 'kid_game' ? (input.difficulty ?? 'easy') : null,
    gameType: input.type === 'kid_game' ? (input.gameType ?? null) : null,
    courseId: input.type === 'kid_game' && input.courseId ? new Types.ObjectId(input.courseId) : null,
    order: await nextOrder(siblingFilter(fields)),
    isEnabled: input.isEnabled,
    isVisible: input.isVisible,
    source: 'admin',
    createdBy: new Types.ObjectId(req.user!.id),
    updatedBy: new Types.ObjectId(req.user!.id),
  }).catch((err: unknown) => {
    if ((err as { code?: number }).code === 11000) throw AppError.conflict(`“${key}” already exists`);
    throw err;
  });
  invalidateCatalog();
  await auditItem(req, 'content_created', item, 'Created');
  sendSuccess(res, serializeItem(item), 201, undefined, 'Created');
});

/** Fields only a Kid Game has, and which of them a code game's content fixes. */
const KID_GAME_ONLY = ['classLevel', 'subject', 'difficulty', 'gameType', 'courseId'] as const;
const CODE_FIXED = ['classLevel', 'subject', 'difficulty', 'gameType'] as const;

export const updateContent = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateContentInput;
  const item = await ContentItem.findById(req.params.id);
  if (!item) throw AppError.notFound('Content not found');
  if (item.archivedAt) throw AppError.conflict('Restore this entry before changing it');

  const given = (f: keyof UpdateContentInput) => input[f] !== undefined;
  if (item.type !== 'kid_game' && KID_GAME_ONLY.some(given)) {
    throw AppError.badRequest('Only Kid Games have a class, subject, difficulty, game type or course');
  }
  if (item.type !== 'subject' && given('glyph')) throw AppError.badRequest('Only subjects have a glyph');
  const fixed = CODE_FIXED.filter((f) => given(f) && input[f] !== item[f]);
  if (item.source === 'code' && fixed.length) {
    throw AppError.badRequest(`This game's ${fixed.join(', ')} ${fixed.length === 1 ? 'is' : 'are'} fixed by its content in the app`, fixed.map((f) => ({ path: f, message: 'Fixed by the app' })));
  }

  // Kid Games: the class / subject / course they end up with must fit together.
  if (item.type === 'kid_game') {
    const classLevel = input.classLevel ?? item.classLevel!;
    const subject = input.subject ?? item.subject!;
    const moved = classLevel !== item.classLevel || subject !== item.subject;
    if (moved) await assertClassOffersSubject(classLevel, subject);
    const courseId = input.courseId !== undefined ? input.courseId : (item.courseId?.toString() ?? null);
    if (courseId && (given('courseId') || moved)) await assertCourseFits(courseId, classLevel, subject);
    if (moved) item.order = await nextOrder({ ...siblingFilter({ type: 'kid_game', classLevel, subject }), archivedAt: null });
  }

  const before = { isEnabled: item.isEnabled, isVisible: item.isVisible };
  const editable = ['title', 'description', 'thumbnailUrl', 'glyph', 'classLevel', 'subject', 'difficulty', 'gameType'] as const;
  const edited: string[] = editable.filter((f) => given(f) && input[f] !== item[f]);
  for (const f of editable) if (given(f)) (item as unknown as Record<string, unknown>)[f] = input[f];
  if (given('courseId')) {
    const next = input.courseId ? new Types.ObjectId(input.courseId) : null;
    if ((next?.toString() ?? null) !== (item.courseId?.toString() ?? null)) edited.push('courseId');
    item.courseId = next;
  }
  if (given('isEnabled')) item.isEnabled = input.isEnabled!;
  if (given('isVisible')) item.isVisible = input.isVisible!;
  item.updatedBy = new Types.ObjectId(req.user!.id);
  await item.save();
  invalidateCatalog();

  if (edited.length) await auditItem(req, 'content_updated', item, 'Updated', { fields: edited });
  const state = (on: boolean) => (on ? 'on' : 'off');
  if (item.type === 'section') {
    // A website section is ON when it is both enabled and visible: one event per ON/OFF change.
    const wasOn = before.isEnabled && before.isVisible;
    const isOn = item.isEnabled && item.isVisible;
    if (wasOn !== isOn) {
      await auditItem(req, isOn ? 'section_enabled' : 'section_disabled', item, isOn ? 'Turned on' : 'Turned off', { section: item.key, previous: state(wasOn), next: state(isOn) });
    }
  } else {
    if (item.isEnabled !== before.isEnabled) {
      await auditItem(req, item.isEnabled ? 'content_enabled' : 'content_disabled', item, item.isEnabled ? 'Enabled' : 'Disabled', {
        field: 'isEnabled',
        previous: before.isEnabled,
        next: item.isEnabled,
      });
    }
    if (item.isVisible !== before.isVisible) {
      await auditItem(req, item.isVisible ? 'content_shown' : 'content_hidden', item, item.isVisible ? 'Showed' : 'Hid', {
        field: 'isVisible',
        previous: before.isVisible,
        next: item.isVisible,
      });
    }
  }
  sendSuccess(res, serializeItem(item), 200, undefined, 'Saved');
});

/** Swaps an entry with its neighbour among its siblings (live entries only). */
export const moveContent = asyncHandler(async (req: Request, res: Response) => {
  const { direction } = req.body as { direction: 'up' | 'down' };
  const item = await ContentItem.findById(req.params.id);
  if (!item) throw AppError.notFound('Content not found');
  if (item.archivedAt) throw AppError.conflict('Archived entries have no position');

  const neighbour = await ContentItem.findOne({
    ...siblingFilter(item),
    archivedAt: null,
    _id: { $ne: item._id },
    order: direction === 'up' ? { $lte: item.order } : { $gte: item.order },
  }).sort(direction === 'up' ? { order: -1, _id: -1 } : { order: 1, _id: 1 });
  if (!neighbour) {
    sendSuccess(res, serializeItem(item), 200, undefined, direction === 'up' ? 'Already first' : 'Already last');
    return;
  }
  const previousOrder = item.order;
  // Equal orders (possible after creates) still separate cleanly.
  const [a, b] = neighbour.order === item.order ? (direction === 'up' ? [item.order - 1, item.order] : [item.order + 1, item.order]) : [neighbour.order, item.order];
  item.order = a;
  neighbour.order = b;
  item.updatedBy = new Types.ObjectId(req.user!.id);
  await Promise.all([item.save(), neighbour.save()]);
  invalidateCatalog();
  await auditItem(req, item.type === 'section' ? 'section_reordered' : 'content_reordered', item, `Moved ${direction}`, {
    direction,
    ...(item.type === 'section' ? { section: item.key } : {}),
    previous: previousOrder,
    next: item.order,
  });
  sendSuccess(res, serializeItem(item), 200, undefined, 'Moved');
});

/** "Delete" is an archive: the entry disappears for users and can be restored. */
export const archiveContent = asyncHandler(async (req: Request, res: Response) => {
  const item = await ContentItem.findById(req.params.id);
  if (!item) throw AppError.notFound('Content not found');
  if (item.archivedAt) throw AppError.conflict('Already archived');
  item.archivedAt = new Date();
  item.updatedBy = new Types.ObjectId(req.user!.id);
  await item.save();
  invalidateCatalog();
  await auditItem(req, 'content_archived', item, 'Archived');
  sendSuccess(res, serializeItem(item), 200, undefined, 'Archived');
});

export const restoreContent = asyncHandler(async (req: Request, res: Response) => {
  const item = await ContentItem.findById(req.params.id);
  if (!item) throw AppError.notFound('Content not found');
  if (!item.archivedAt) throw AppError.conflict('This entry is not archived');
  item.archivedAt = null;
  // Back at the end of its siblings, so it never collides with what was reordered meanwhile.
  item.order = await nextOrder({ ...siblingFilter(item), archivedAt: null });
  item.updatedBy = new Types.ObjectId(req.user!.id);
  await item.save();
  invalidateCatalog();
  await auditItem(req, 'content_restored', item, 'Restored');
  sendSuccess(res, serializeItem(item), 200, undefined, 'Restored');
});

// ------------------------------------------------------------------------------------ courses

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60)
      .replace(/^-|-$/g, '') || 'course'
  );
}

export function serializeCourse(course: ICourse) {
  return {
    id: course._id.toString(),
    title: course.title,
    slug: course.slug,
    summary: course.summary,
    classLevel: course.classLevel ?? null,
    subject: course.subject ?? null,
    thumbnailUrl: course.thumbnailUrl ?? null,
    difficulty: course.difficulty ?? null,
    ageGroup: course.ageGroup ?? null,
    learningObjective: course.learningObjective ?? '',
    lessons: (course.lessons as unknown as ICourseLesson[]).map((l) => ({ id: l._id.toString(), title: l.title, body: l.body, url: l.url ?? null })),
    order: course.order,
    isEnabled: course.isEnabled,
    isVisible: course.isVisible,
    archivedAt: course.archivedAt,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

function auditCourse(req: Request, action: ActivityAction, course: ICourse, verb: string, metadata: Record<string, unknown> = {}) {
  return logActivity(req, {
    action,
    targetType: 'course',
    targetId: course._id,
    targetName: course.title,
    message: `${verb} course “${course.title}”`,
    metadata: { slug: course.slug, ...metadata },
  });
}

export const listCourses = asyncHandler(async (req: Request, res: Response) => {
  const { search, status, classLevel, subject, sort, page, limit } = req.query as unknown as {
    search?: string;
    status: Status;
    classLevel?: number;
    subject?: string;
    sort: keyof typeof SORTS;
    page: number;
    limit: number;
  };
  const clauses: FilterQuery<ICourse>[] = [statusFilter(status)];
  if (classLevel !== undefined) clauses.push({ classLevel });
  if (subject) clauses.push({ subject });
  if (search) {
    const text = { $regex: escapeRegex(search), $options: 'i' };
    clauses.push({ $or: [{ title: text }, { slug: text }, { summary: text }] });
  }
  const filter = { $and: clauses };
  const [courses, total] = await Promise.all([
    Course.find(filter).sort(SORTS[sort] as Record<string, 1 | -1>).skip((page - 1) * limit).limit(limit),
    Course.countDocuments(filter),
  ]);
  sendSuccess(res, courses.map(serializeCourse), 200, pageMeta(page, limit, total));
});

export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw AppError.notFound('Course not found');
  sendSuccess(res, serializeCourse(course));
});

export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as CreateCourseInput;
  await assertClassOffersSubject(input.classLevel, input.subject);

  let slug = input.slug ?? slugify(input.title);
  if (await Course.exists({ slug })) {
    // An explicit slug must be unique; a derived one gets a number.
    if (input.slug) throw AppError.conflict(`A course with the address “${slug}” already exists`);
    let n = 2;
    while (await Course.exists({ slug: `${slug}-${n}` })) n++;
    slug = `${slug}-${n}`;
  }
  const course = await Course.create({
    title: input.title,
    slug,
    summary: input.summary,
    classLevel: input.classLevel,
    subject: input.subject,
    thumbnailUrl: input.thumbnailUrl ?? null,
    difficulty: input.difficulty ?? null,
    ageGroup: input.ageGroup ?? null,
    learningObjective: input.learningObjective,
    lessons: input.lessons,
    order: (((await Course.findOne({}, { order: 1 }).sort({ order: -1 }).lean<{ order: number } | null>())?.order) ?? 0) + 1,
    isEnabled: input.isEnabled,
    isVisible: input.isVisible,
    createdBy: new Types.ObjectId(req.user!.id),
    updatedBy: new Types.ObjectId(req.user!.id),
  }).catch((err: unknown) => {
    if ((err as { code?: number }).code === 11000) throw AppError.conflict(`A course with the address “${slug}” already exists`);
    throw err;
  });
  invalidateCatalog();
  await auditCourse(req, 'course_created', course, 'Created', { lessons: course.lessons.length });
  sendSuccess(res, serializeCourse(course), 201, undefined, 'Course created');
});

export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateCourseInput;
  const course = await Course.findById(req.params.id);
  if (!course) throw AppError.notFound('Course not found');
  if (course.archivedAt) throw AppError.conflict('Restore this course before changing it');
  // A course always sits in a class and a subject that class offers.
  const classLevel = input.classLevel ?? course.classLevel;
  const subject = input.subject ?? course.subject;
  if (classLevel == null || subject == null) {
    throw AppError.badRequest('Choose a class and a subject for this course', [{ path: 'classLevel', message: 'Choose a class' }]);
  }
  if (input.classLevel !== undefined || input.subject !== undefined || course.classLevel == null || course.subject == null) {
    await assertClassOffersSubject(classLevel, subject);
  }
  if ((classLevel !== course.classLevel || subject !== course.subject) && course.classLevel != null) {
    const linked = await ContentItem.countDocuments({ type: 'kid_game', courseId: course._id, archivedAt: null });
    if (linked) throw AppError.conflict(`${linked} game${linked === 1 ? ' is' : 's are'} linked to this course — move or unlink ${linked === 1 ? 'it' : 'them'} before changing its class or subject`);
  }
  if (input.slug && input.slug !== course.slug && (await Course.exists({ slug: input.slug }))) {
    throw AppError.conflict(`A course with the address “${input.slug}” already exists`);
  }

  const before = { isEnabled: course.isEnabled, isVisible: course.isVisible };
  const edited: string[] = [];
  for (const field of ['title', 'slug', 'summary', 'classLevel', 'subject', 'thumbnailUrl', 'difficulty', 'ageGroup', 'learningObjective'] as const) {
    if (input[field] !== undefined && input[field] !== course[field]) {
      edited.push(field);
      (course as unknown as Record<string, unknown>)[field] = input[field];
    }
  }
  if (input.lessons !== undefined) {
    edited.push('lessons');
    course.set('lessons', input.lessons);
  }
  if (input.isEnabled !== undefined) course.isEnabled = input.isEnabled;
  if (input.isVisible !== undefined) course.isVisible = input.isVisible;
  course.updatedBy = new Types.ObjectId(req.user!.id);
  await course.save();
  invalidateCatalog();

  if (edited.length) await auditCourse(req, 'course_updated', course, 'Updated', { fields: edited });
  if (course.isEnabled !== before.isEnabled) await auditCourse(req, course.isEnabled ? 'course_enabled' : 'course_disabled', course, course.isEnabled ? 'Enabled' : 'Disabled');
  if (course.isVisible !== before.isVisible) await auditCourse(req, course.isVisible ? 'course_shown' : 'course_hidden', course, course.isVisible ? 'Showed' : 'Hid');
  sendSuccess(res, serializeCourse(course), 200, undefined, 'Saved');
});

export const moveCourse = asyncHandler(async (req: Request, res: Response) => {
  const { direction } = req.body as { direction: 'up' | 'down' };
  const course = await Course.findById(req.params.id);
  if (!course) throw AppError.notFound('Course not found');
  if (course.archivedAt) throw AppError.conflict('Archived courses have no position');
  const neighbour = await Course.findOne({
    archivedAt: null,
    _id: { $ne: course._id },
    order: direction === 'up' ? { $lte: course.order } : { $gte: course.order },
  }).sort(direction === 'up' ? { order: -1, _id: -1 } : { order: 1, _id: 1 });
  if (!neighbour) {
    sendSuccess(res, serializeCourse(course), 200, undefined, direction === 'up' ? 'Already first' : 'Already last');
    return;
  }
  const [a, b] = neighbour.order === course.order ? (direction === 'up' ? [course.order - 1, course.order] : [course.order + 1, course.order]) : [neighbour.order, course.order];
  course.order = a;
  neighbour.order = b;
  await Promise.all([course.save(), neighbour.save()]);
  invalidateCatalog();
  await auditCourse(req, 'course_reordered', course, `Moved ${direction}`, { direction });
  sendSuccess(res, serializeCourse(course), 200, undefined, 'Moved');
});

export const archiveCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw AppError.notFound('Course not found');
  if (course.archivedAt) throw AppError.conflict('Already archived');
  course.archivedAt = new Date();
  course.updatedBy = new Types.ObjectId(req.user!.id);
  await course.save();
  invalidateCatalog();
  await auditCourse(req, 'course_archived', course, 'Archived');
  sendSuccess(res, serializeCourse(course), 200, undefined, 'Archived');
});

export const restoreCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw AppError.notFound('Course not found');
  if (!course.archivedAt) throw AppError.conflict('This course is not archived');
  course.archivedAt = null;
  course.order = (((await Course.findOne({ archivedAt: null }, { order: 1 }).sort({ order: -1 }).lean<{ order: number } | null>())?.order) ?? 0) + 1;
  course.updatedBy = new Types.ObjectId(req.user!.id);
  await course.save();
  invalidateCatalog();
  await auditCourse(req, 'course_restored', course, 'Restored');
  sendSuccess(res, serializeCourse(course), 200, undefined, 'Restored');
});
