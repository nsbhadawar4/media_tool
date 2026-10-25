import { Router } from 'express';
import { courseEngine, generateCourseChapter, generateCourseLesson, generateCourseOutline, generateCourseQuestions, getCourse as getSubjectCourse, publishCourse, saveCourse, unpublishCourse } from '../controllers/adminCourseController';
import {
  currentGenerationJobQuerySchema,
  generateChapterSchema,
  generateLessonSchema,
  generateOutlineSchema,
  generateQuestionsSchema,
  generationJobParamSchema,
  levelSubjectParamSchema,
  saveCourseSchema,
  startGenerationJobSchema,
} from '../validators/courseValidators';
import { currentGenerationJob, discardGenerationJob, finishGenerationJob, nextGenerationStep, startGenerationJob } from '../controllers/courseGenerationJobController';
import {
  archiveItem,
  foreverDeleteFromTrash,
  lifecycleSummary,
  listArchive,
  listTrash,
  moveArchiveToTrash,
  restoreFromArchive,
  restoreFromTrash,
  trashItem,
} from '../controllers/adminLifecycleController';
import { lifecycleDeleteSchema, lifecycleListQuerySchema, lifecycleMoveSchema, lifecycleRefSchema, lifecycleRestoreSchema } from '../validators/lifecycleValidators';
import {
  createManualCourse,
  deleteManualCourseForever,
  duplicateManualCourse,
  getManualCourse,
  listManualCourses,
  listManualCourseTrash,
  manualCourseOptions,
  manualCourseStats,
  publishManualCourse,
  restoreManualCourse,
  setManualCourseVisibility,
  trashManualCourse,
  unpublishManualCourse,
  updateManualCourse,
} from '../controllers/adminManualCourseController';
import {
  createManualCourseSchema,
  listManualCoursesQuerySchema,
  manualCourseIdParamSchema,
  manualCourseVisibilitySchema,
  permanentDeleteManualCourseSchema,
  updateManualCourseSchema,
} from '../validators/manualCourseValidators';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { getAdminAppearance, updateAppearance } from '../controllers/settingsController';
import { updateAppearanceSchema } from '../validators/settingsValidators';
import { validate } from '../middleware/validate';
import { uploadContentImageFile } from '../middleware/upload';
import {
  archiveClass,
  createClass,
  getClass,
  listClasses,
  restoreClass,
  setClassOrder,
  setClassVisibility,
  updateClass,
  uploadContentImage,
} from '../controllers/adminClassController';
import {
  duplicateClass,
  getClassCurriculum,
  setClassStatus,
} from '../controllers/adminCurriculumController';
import {
  classLevelParamSchema,
  classOrderSchema,
  classVisibilitySchema,
  createClassSchema,
  listClassesQuerySchema,
  updateClassSchema,
  classStatusSchema,
  duplicateClassSchema,
} from '../validators/classValidators';
import {
  listUsers,
  getUser,
  setUserStatus,
  deleteUser,
  getAdminStats,
  listActivity,
  getUserStats,
  updateUserSubscription,
  getUserActivity,
} from '../controllers/adminController';
import {
  userIdParamSchema,
  listUsersQuerySchema,
  setUserStatusSchema,
  listActivityQuerySchema,
  updateSubscriptionSchema,
  userActivityQuerySchema,
  adminStatsQuerySchema,
} from '../validators/adminValidators';
import {
  listReviews,
  reviewStats,
  getReview,
  approveReview,
  rejectReview,
  unpublishReview,
  publishReview,
  deleteReview,
} from '../controllers/adminReviewController';
import {
  archiveContent,
  archiveCourse,
  bulkUpdateContent,
  createContent,
  createCourse,
  getContentStats,
  getCourse,
  listContent,
  listCourses,
  scheduleCourses,
  courseLearningStats,
  moveContent,
  moveCourse,
  restoreContent,
  restoreCourse,
  updateContent,
  updateCourse,
} from '../controllers/adminContentController';
import {
  contentIdParamSchema,
  bulkUpdateSchema,
  createContentSchema,
  createCourseSchema,
  listContentQuerySchema,
  listCoursesQuerySchema,
  scheduleCoursesSchema,
  courseStatsQuerySchema,
  moveSchema,
  updateContentSchema,
  updateCourseSchema,
} from '../validators/contentValidators';
import { adminReviewsQuerySchema, rejectReviewSchema, reviewIdParamSchema } from '../validators/reviewValidators';

const router = Router();

// Both guards on the whole router: a route added later cannot forget one of them.
router.use(requireAuth, requireAdmin);

// Site settings (appearance): read with its history, saved and audited.
router.get('/settings/appearance', getAdminAppearance);
router.patch('/settings/appearance', validate({ body: updateAppearanceSchema }), updateAppearance);

router.get('/stats', validate({ query: adminStatsQuerySchema }), getAdminStats);
router.get('/activity', validate({ query: listActivityQuerySchema }), listActivity);
// Before /users/:id, so "stats" is never read as an id.
router.get('/users/stats', getUserStats);
router.get('/users', validate({ query: listUsersQuerySchema }), listUsers);
router.get('/users/:id', validate({ params: userIdParamSchema }), getUser);
router.get('/users/:id/activity', validate({ params: userIdParamSchema, query: userActivityQuerySchema }), getUserActivity);
router.patch(
  '/users/:id/status',
  validate({ params: userIdParamSchema, body: setUserStatusSchema }),
  setUserStatus,
);
router.delete('/users/:id', validate({ params: userIdParamSchema }), deleteUser);
router.patch(
  '/users/:id/subscription',
  validate({ params: userIdParamSchema, body: updateSubscriptionSchema }),
  updateUserSubscription,
);

// Review moderation (same guards as everything else in this router).
router.get('/reviews', validate({ query: adminReviewsQuerySchema }), listReviews);
router.get('/reviews/stats', reviewStats);
router.get('/reviews/:id', validate({ params: reviewIdParamSchema }), getReview);
router.patch('/reviews/:id/approve', validate({ params: reviewIdParamSchema }), approveReview);
router.patch('/reviews/:id/reject', validate({ params: reviewIdParamSchema, body: rejectReviewSchema }), rejectReview);
router.patch('/reviews/:id/unpublish', validate({ params: reviewIdParamSchema }), unpublishReview);
router.patch('/reviews/:id/publish', validate({ params: reviewIdParamSchema }), publishReview);
router.delete('/reviews/:id', validate({ params: reviewIdParamSchema }), deleteReview);

// Content management: the catalog (sections, classes, subjects, Kid Games, games) and courses.
const contentId = { params: contentIdParamSchema };
router.get('/content/stats', getContentStats);
router.get('/content/items', validate({ query: listContentQuerySchema }), listContent);
router.post('/content/items', validate({ body: createContentSchema }), createContent);
router.post('/content/items/bulk', validate({ body: bulkUpdateSchema }), bulkUpdateContent);
router.patch('/content/items/:id', validate({ ...contentId, body: updateContentSchema }), updateContent);
router.post('/content/items/:id/move', validate({ ...contentId, body: moveSchema }), moveContent);
router.delete('/content/items/:id', validate(contentId), archiveContent);
router.post('/content/items/:id/restore', validate(contentId), restoreContent);
router.get('/content/courses', validate({ query: listCoursesQuerySchema }), listCourses);
router.post('/content/courses', validate({ body: createCourseSchema }), createCourse);
router.post('/content/courses/schedule', validate({ body: scheduleCoursesSchema }), scheduleCourses);
router.get('/content/courses/stats', validate({ query: courseStatsQuerySchema }), courseLearningStats);
router.get('/content/courses/:id', validate(contentId), getCourse);
router.patch('/content/courses/:id', validate({ ...contentId, body: updateCourseSchema }), updateCourse);
router.post('/content/courses/:id/move', validate({ ...contentId, body: moveSchema }), moveCourse);
router.delete('/content/courses/:id', validate(contentId), archiveCourse);
router.post('/content/courses/:id/restore', validate(contentId), restoreCourse);

// Manage Courses: each class with its subjects, on the same catalog entries as above.
const classLevel = { params: classLevelParamSchema };
router.get('/classes', validate({ query: listClassesQuerySchema }), listClasses);
router.post('/classes', validate({ body: createClassSchema }), createClass);
router.post('/classes/images', uploadContentImageFile, uploadContentImage);
router.get('/classes/:level', validate(classLevel), getClass);
router.patch('/classes/:level', validate({ ...classLevel, body: updateClassSchema }), updateClass);
router.patch('/classes/:level/visibility', validate({ ...classLevel, body: classVisibilitySchema }), setClassVisibility);
router.patch('/classes/:level/order', validate({ ...classLevel, body: classOrderSchema }), setClassOrder);
router.delete('/classes/:level', validate(classLevel), archiveClass);
router.post('/classes/:level/restore', validate(classLevel), restoreClass);
router.patch('/classes/:level/status', validate({ ...classLevel, body: classStatusSchema }), setClassStatus);
router.post('/classes/:level/duplicate', validate({ ...classLevel, body: duplicateClassSchema }), duplicateClass);
router.get('/classes/:level/curriculum', validate(classLevel), getClassCurriculum);

// AI Course Generator and course editor: a course is one subject of one class. Generating saves nothing.
const levelSubject = { params: levelSubjectParamSchema };
// Archive and Trash / Deleted: every lifecycle move of course content, checked against the entry's state
// (ACTIVE → ARCHIVED / TRASHED, ARCHIVED → ACTIVE / TRASHED, TRASHED → ACTIVE / gone). Nothing is ever removed
// except by Forever Delete, from Trash, with DELETE typed.
router.get('/lifecycle/summary', lifecycleSummary);
router.get('/archive', validate({ query: lifecycleListQuerySchema }), listArchive);
router.post('/archive', validate({ body: lifecycleRefSchema }), archiveItem);
router.post('/archive/restore', validate({ body: lifecycleRestoreSchema }), restoreFromArchive);
router.post('/archive/trash', validate({ body: lifecycleMoveSchema }), moveArchiveToTrash);
router.get('/trash', validate({ query: lifecycleListQuerySchema }), listTrash);
router.post('/trash', validate({ body: lifecycleRefSchema }), trashItem);
router.post('/trash/restore', validate({ body: lifecycleRestoreSchema }), restoreFromTrash);
router.post('/trash/delete', validate({ body: lifecycleDeleteSchema }), foreverDeleteFromTrash);

router.get('/courses/engine', courseEngine);
// Resumable generation: one step per request (fits serverless), rate limits retried with backoff, chapters kept as they arrive.
router.post('/courses/generate/jobs', validate({ body: startGenerationJobSchema }), startGenerationJob);
router.get('/courses/generate/jobs/current', validate({ query: currentGenerationJobQuerySchema }), currentGenerationJob);
router.post('/courses/generate/jobs/:id/next', validate({ params: generationJobParamSchema }), nextGenerationStep);
router.post('/courses/generate/jobs/:id/finish', validate({ params: generationJobParamSchema }), finishGenerationJob);
router.delete('/courses/generate/jobs/:id', validate({ params: generationJobParamSchema }), discardGenerationJob);
router.post('/courses/generate/outline', validate({ body: generateOutlineSchema }), generateCourseOutline);
router.post('/courses/generate/chapter', validate({ body: generateChapterSchema }), generateCourseChapter);
router.post('/courses/generate/lesson', validate({ body: generateLessonSchema }), generateCourseLesson);
router.post('/courses/generate/questions', validate({ body: generateQuestionsSchema }), generateCourseQuestions);
router.get('/courses/:level/:subject', validate(levelSubject), getSubjectCourse);
router.put('/courses/:level/:subject', validate({ ...levelSubject, body: saveCourseSchema }), saveCourse);
router.post('/courses/:level/:subject/publish', validate(levelSubject), publishCourse);
router.post('/courses/:level/:subject/unpublish', validate(levelSubject), unpublishCourse);

// Manual Courses: hand-written courses in their own collection — independent of the AI Course Generator.
// The fixed paths come before /:id, so "trash", "stats" and "options" are never read as ids.
const manualId = { params: manualCourseIdParamSchema };
router.get('/manual-courses/options', manualCourseOptions);
router.get('/manual-courses/stats', manualCourseStats);
router.get('/manual-courses/trash', validate({ query: listManualCoursesQuerySchema }), listManualCourseTrash);
router.get('/manual-courses', validate({ query: listManualCoursesQuerySchema }), listManualCourses);
router.post('/manual-courses', validate({ body: createManualCourseSchema }), createManualCourse);
router.get('/manual-courses/:id', validate(manualId), getManualCourse);
router.patch('/manual-courses/:id', validate({ ...manualId, body: updateManualCourseSchema }), updateManualCourse);
router.patch('/manual-courses/:id/visibility', validate({ ...manualId, body: manualCourseVisibilitySchema }), setManualCourseVisibility);
router.post('/manual-courses/:id/publish', validate(manualId), publishManualCourse);
router.post('/manual-courses/:id/unpublish', validate(manualId), unpublishManualCourse);
router.post('/manual-courses/:id/duplicate', validate(manualId), duplicateManualCourse);
router.post('/manual-courses/:id/restore', validate(manualId), restoreManualCourse);
router.delete('/manual-courses/:id/permanent', validate({ ...manualId, body: permanentDeleteManualCourseSchema }), deleteManualCourseForever);
router.delete('/manual-courses/:id', validate(manualId), trashManualCourse);

export default router;
