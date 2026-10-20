/**
 * Admin → Manual Courses, in the browser's own logic: new ids for every copy and paste, ordering,
 * the clipboard's safety, the save / publish checks (same paths as the server), and the navigation
 * entry right after Manage Courses with its breadcrumbs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cloneChapter,
  cloneCourse,
  countsOf,
  emptyChapter,
  emptyDraft,
  emptyQuestion,
  insertAfter,
  move,
  newUid,
  parseClip,
  pasted,
  publishErrors,
  saveErrors,
  serverErrors,
  withOption,
  withType,
} from '../lib/manualCourses/builder';
import type { ManualChapter, ManualCourseDraft } from '../lib/api/manualCourses';
import { ADMIN_NAV_GROUPS } from '../components/admin/navItems';
import { adminCrumbs } from '../lib/admin/breadcrumbs';

const uidsOf = (chapters: ManualChapter[]) => chapters.flatMap((c) => [c.uid, ...c.lessons.flatMap((l) => [l.uid, ...l.questions.map((q) => q.uid)])]);

function fullChapter(title = 'Varnamala'): ManualChapter {
  const c = emptyChapter();
  c.title = title;
  c.lessons[0]!.title = 'Swar';
  c.lessons[0]!.questions = [
    { ...emptyQuestion('mcq'), prompt: 'Which is a vowel?', options: ['अ', 'क', 'ख', 'ग'], answer: 'अ' },
    { ...emptyQuestion('true-false'), prompt: 'क is a vowel', answer: 'False' },
    { ...emptyQuestion('short-answer'), prompt: 'First swar?', answer: 'अ' },
  ];
  return c;
}
const course = (chapters: ManualChapter[] = [fullChapter()]): ManualCourseDraft => ({ ...emptyDraft(), classLevel: 1, subjectKey: 'hindi', title: 'Hindi Basics', chapters });

test('ids: URL-safe, the shape the server accepts, never repeated', () => {
  const ids = new Set(Array.from({ length: 500 }, newUid));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{6,64}$/);
});

test('duplicate / copy-paste: same structure and content, every part with a new id', () => {
  const src = fullChapter();
  const copy = cloneChapter(src);
  assert.deepEqual({ ...copy, uid: '', lessons: [] }, { ...src, uid: '', lessons: [] });
  assert.equal(copy.lessons[0]!.questions.length, 3);
  assert.equal(copy.lessons[0]!.questions[0]!.options.join(), 'अ,क,ख,ग');
  const before = uidsOf([src]);
  assert.ok(uidsOf([copy]).every((u) => !before.includes(u)));
  // Editing the copy never changes the original (no shared arrays).
  copy.lessons[0]!.questions[0]!.options[0] = 'changed';
  assert.equal(src.lessons[0]!.questions[0]!.options[0], 'अ');

  const whole = cloneCourse(course([src, fullChapter('Matra')]));
  assert.deepEqual(whole.chapters.map((c) => c.title), ['Varnamala', 'Matra']);
  assert.ok(uidsOf(whole.chapters).every((u) => !before.includes(u)));
});

test('clipboard: what was copied pastes with new ids; malformed or foreign data is ignored', () => {
  const ch = fullChapter();
  const clip = parseClip(JSON.stringify({ kind: 'chapter', title: ch.title, data: ch }));
  assert.equal(clip?.kind, 'chapter');
  const p = pasted(clip as Extract<typeof clip, { kind: 'chapter' }>);
  assert.equal(p.title, 'Varnamala');
  assert.notEqual(p.uid, ch.uid);
  const q = parseClip(JSON.stringify({ kind: 'question', title: 'q', data: ch.lessons[0]!.questions[0] }));
  assert.equal(q?.kind, 'question');
  const c = parseClip(JSON.stringify({ kind: 'course', title: 'Hindi', data: { title: 'Hindi', description: '', chapters: [ch] } }));
  assert.equal(c?.kind, 'course');
  for (const bad of [null, '', 'not json', '{"kind":"chapter","title":"x","data":{"uid":1}}', '{"kind":"virus","title":"x","data":{}}', JSON.stringify({ kind: 'lesson', title: 'x', data: { ...ch.lessons[0], status: 'gone' } })]) {
    assert.equal(parseClip(bad), null, String(bad));
  }
});

test('ordering: move up / down stays in bounds; insert after places right below', () => {
  assert.deepEqual(move(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(move(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(move(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(move(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
  assert.deepEqual(insertAfter(['a', 'b'], 0, 'x'), ['a', 'x', 'b']);
  assert.deepEqual(insertAfter(['a', 'b'], -1, 'x'), ['x', 'a', 'b']);
  assert.deepEqual(insertAfter([], -1, 'x'), ['x']);
});

test('save needs class, subject and title; a draft may otherwise be incomplete', () => {
  assert.deepEqual(Object.keys(saveErrors(emptyDraft())).sort(), ['classLevel', 'subjectKey', 'title']);
  const incomplete = course([{ ...emptyChapter(), title: '' }]);
  assert.deepEqual(saveErrors(incomplete), {});
});

test('publish needs a published chapter with a published lesson, titles and valid questions — server paths', () => {
  assert.deepEqual(publishErrors(course()), {});
  assert.equal(publishErrors(course([])).chapters, 'Add at least one chapter');
  const drafts = fullChapter();
  drafts.status = 'draft';
  assert.ok(publishErrors(course([drafts])).chapters);

  const bad = fullChapter('');
  bad.lessons[0]!.title = '';
  bad.lessons[0]!.questions[0]!.options[1] = '';
  bad.lessons[0]!.questions[1]!.answer = 'Maybe';
  bad.lessons[0]!.questions[2]!.answer = ' ';
  const e = publishErrors(course([bad]));
  for (const p of ['chapters.0.title', 'chapters.0.lessons.0.title', 'chapters.0.lessons.0.questions.0.options', 'chapters.0.lessons.0.questions.1.answer', 'chapters.0.lessons.0.questions.2.answer']) {
    assert.ok(e[p], p);
  }
  const wrongAnswer = fullChapter();
  wrongAnswer.lessons[0]!.questions[0]!.answer = 'z';
  assert.ok(publishErrors(course([wrongAnswer]))['chapters.0.lessons.0.questions.0.answer']);
  const same = fullChapter();
  same.lessons[0]!.questions[0]!.options = ['a', 'A', 'b', 'c'];
  assert.ok(publishErrors(course([same]))['chapters.0.lessons.0.questions.0.options']);
});

test('questions: the correct option follows its edit; changing type resets what no longer fits', () => {
  const q = { ...emptyQuestion('mcq'), options: ['1', '2', '3', '4'], answer: '2' };
  assert.equal(withOption(q, 1, 'two').answer, 'two');
  assert.equal(withOption(q, 0, 'one').answer, '2');
  const tf = withType({ ...q, prompt: 'Keep me', explanation: 'and me' }, 'true-false');
  assert.deepEqual([tf.prompt, tf.explanation, tf.options.length, tf.answer], ['Keep me', 'and me', 0, 'True']);
  assert.equal(withType(tf, 'mcq').options.length, 4);
});

test('counts and server errors', () => {
  assert.deepEqual(countsOf([fullChapter(), fullChapter()]), { chapters: 2, lessons: 2, questions: 6 });
  assert.deepEqual(serverErrors([{ path: 'title', message: 'Enter a title' }, { path: 'title', message: 'second' }, { nope: 1 }]), { title: 'Enter a title' });
  assert.deepEqual(serverErrors(undefined), {});
});

test('navigation: Manual Courses right after Manage Courses; breadcrumbs for list, new, edit, preview and trash', () => {
  const manage = ADMIN_NAV_GROUPS.find((g) => g.label === 'Manage')!.items.map((i) => i.href);
  assert.equal(manage[manage.indexOf('/admin/courses') + 1], '/admin/manual-courses');
  const labels = (p: string) => adminCrumbs(p).map((c) => c.label);
  assert.deepEqual(labels('/admin/manual-courses'), ['Admin', 'Manual Courses']);
  assert.deepEqual(labels('/admin/manual-courses/new'), ['Admin', 'Manual Courses', 'New manual course']);
  assert.deepEqual(labels('/admin/manual-courses/trash'), ['Admin', 'Manual Courses', 'Trash']);
  assert.deepEqual(labels('/admin/manual-courses/abc/edit'), ['Admin', 'Manual Courses', 'Course', 'Edit']);
  assert.deepEqual(labels('/admin/manual-courses/abc/preview'), ['Admin', 'Manual Courses', 'Course', 'Preview']);
  assert.equal(adminCrumbs('/admin/manual-courses/abc/preview')[2]!.href, '/admin/manual-courses/abc/edit');
});

test('separation: Manage Courses has no manual-course entry; the sidebar lists the two systems side by side', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'frontend', 'components', 'admin', 'courses');
  for (const file of ['ClassManager.tsx', 'ClassEditor.tsx', 'CourseGenerator.tsx', 'CourseEditor.tsx', 'CourseEditPage.tsx', 'ClassPreview.tsx']) {
    const src = readFileSync(join(dir, file), 'utf8');
    assert.ok(!/manual-courses|Add Manual Course|manualCourses/.test(src), `${file} must not link to or use Manual Courses`);
  }
  const manage = ADMIN_NAV_GROUPS.find((g) => g.label === 'Manage')!.items.filter((i) => !i.planned).map((i) => i.label);
  assert.deepEqual(manage, ['Users', 'Manage Courses', 'Manual Courses', 'User activity', 'Reviews']);
});
