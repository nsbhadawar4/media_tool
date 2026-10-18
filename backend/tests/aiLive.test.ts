/**
 * LIVE check of the configured AI provider (costs a few cents). Skipped unless AI_LIVE=1:
 *   AI_LIVE=1 npm run test:ai-live --workspace backend
 * It reads AI_PROVIDER / AI_API_KEY / AI_MODEL from backend/.env, asks for ONE small Class 1 Hindi chapter
 * through the same generator the admin uses, and checks the reply passed validation. The key is never printed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import dotenv from 'dotenv';
import { engineStatus, generateChapter, generateOutline } from '../src/services/curriculum';
import type { CourseBrief } from '../src/services/curriculum/course';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const live = process.env.AI_LIVE === '1';

const brief: CourseBrief = {
  classLevel: 1,
  subject: { key: 'hindi', title: 'Hindi' },
  title: 'Hindi for Class 1',
  description: '',
  language: 'hindi',
  level: 'beginner',
  chapters: 1,
  lessonsPerChapter: 2,
  questionsPerLesson: 3,
  prompt: 'Swar (vowels) and simple words for Class 1 children.',
  goals: '',
  include: '',
  avoid: '',
  instructions: '',
};

test('live AI provider: one Class 1 Hindi chapter, validated, labelled AI, no template fallback', { skip: !live && 'set AI_LIVE=1 to call the real provider', timeout: 600_000 }, async () => {
  const status = engineStatus();
  assert.equal(status.ai.ready, true, status.ai.problem ?? 'AI provider not configured');
  const key = process.env.AI_API_KEY ?? '';

  const { outline, by } = await generateOutline(brief, 'ai');
  assert.equal(by.kind, 'ai', 'never the template');
  assert.equal(by.provider, status.ai.provider);
  assert.equal(by.model, status.ai.model);
  assert.equal(outline.classLevel, 1);
  assert.equal(outline.chapters.length, 1);

  const { chapter } = await generateChapter(brief, outline, 0, 'ai', 'live');
  assert.ok(chapter.title.trim(), 'chapter title');
  assert.equal(chapter.lessons.length, 2);
  for (const l of chapter.lessons) {
    assert.ok(l.explanation.trim().length > 40, 'lesson content');
    assert.equal(l.questions.length, 3);
    for (const q of l.questions) assert.ok(String(q.answer).trim(), 'every question has an answer');
  }
  assert.ok(chapter.quiz.length > 0 && chapter.quiz.every((q) => String(q.answer).trim()), 'quiz with answers');
  const all = JSON.stringify(chapter);
  assert.ok((all.match(/[ऀ-ॿ]/g) ?? []).length > 100, 'Hindi (Devanagari) content');
  assert.ok(!key || !all.includes(key), 'the key never appears in generated content');
  console.log(`live ${by.provider} (${by.model}): "${chapter.title}" — ${chapter.lessons.length} lessons, ${chapter.quiz.length} quiz questions`);
});
