/**
 * The learner flow's presentation logic (lib/learn/lessonFlow.ts): turning a lesson as the database
 * stores it into steps, sections, stages and question layouts, without any content of its own.
 * Fixtures copy the shapes of real generated Class 1 lessons (Maths, Hindi, English).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { CurriculumQuestion } from '../lib/api/adminClasses';
import { buildSteps, CHEERS, isCorrect, NUDGES, parseExplanation, pick, previewEmoji, questionLayout, rating, splitBlank, splitStage, starsFor } from '../lib/learn/lessonFlow';
import { detectLanguage, pickVoice } from '../lib/learn/speech';

const q = (p: Partial<CurriculumQuestion> & { prompt: string }): CurriculumQuestion => ({ type: 'mcq', options: [], ...p });

test('an explanation split into its emoji-headed parts keeps every line, in order', () => {
  const text = "🎯 What you will learn:\nYou will count things.\n\n💡 Let's understand:\nCounting means saying one number for each thing.\nTouch each thing only once.\n\n🎈 Activity:\nFind 5 pebbles.\n\n🌍 In real life:\nCount the stairs.";
  const parts = parseExplanation(text);
  assert.deepEqual(parts.map((p) => p.kind), ['goal', 'learn', 'activity', 'real']);
  assert.deepEqual(parts.map((p) => p.heading), ['What you will learn', "Let's understand", 'Activity', 'In real life']);
  assert.deepEqual(parts[1]!.lines, ['Counting means saying one number for each thing.', 'Touch each thing only once.']);
});

test('Hindi headings (with the Devanagari danda or colon) and unknown emoji still split; plain text is one intro part', () => {
  const hi = parseExplanation('🎯 आज हम सीखेंगे:\nहम स्वर सीखेंगे।\n\n🌟 एक खास बात:\nअ से अनार 🍎');
  assert.deepEqual(hi.map((p) => p.kind), ['goal', 'note']);
  assert.equal(hi[1]!.lines[0], 'अ से अनार 🍎', 'an emoji inside a line is not a heading');
  const plain = parseExplanation('Just a paragraph.\nAnd another line.');
  assert.deepEqual(plain.map((p) => [p.kind, p.lines.length]), [['intro', 2]]);
  assert.deepEqual(parseExplanation(''), []);
});

test('a run of emoji in a prompt becomes a stage; the question text stays', () => {
  assert.deepEqual(splitStage('How many balloons are there? 🎈🎈🎈'), { text: 'How many balloons are there?', stage: ['🎈', '🎈', '🎈'] });
  assert.deepEqual(splitStage('🐟🐟 There are 2 fish.'), { text: 'There are 2 fish.', stage: ['🐟', '🐟'] });
  assert.deepEqual(splitStage('Which one is a fruit? 🍎 🚌 🐶').stage, ['🍎', '🚌', '🐶']);
  assert.deepEqual(splitStage('One sun ☀️ in the sky'), { text: 'One sun ☀️ in the sky', stage: [] }, 'a single emoji stays inline');
  assert.deepEqual(splitStage('"अनार" शब्द किस स्वर से शुरू होता है?'), { text: '"अनार" शब्द किस स्वर से शुरू होता है?', stage: [] });
});

test('layouts follow the shape: true/false, big tiles for letters and numbers, wide choices for words, typed or reflect without options', () => {
  assert.equal(questionLayout(q({ type: 'true-false', prompt: 'Z is last.', options: ['True', 'False'], answer: 'True' })), 'truefalse');
  assert.equal(questionLayout(q({ type: 'true-false', prompt: 'x', options: ['सही', 'गलत'], answer: 'सही' })), 'truefalse');
  assert.equal(questionLayout(q({ prompt: 'How many?', options: ['2', '3', '4'], answer: '3' })), 'tiles');
  assert.equal(questionLayout(q({ type: 'fill-blank', prompt: 'अ, आ, ___, ई', options: ['इ', 'ए', 'ओ'], answer: 'इ' })), 'tiles');
  assert.equal(questionLayout(q({ prompt: 'Which is a fruit?', options: ['🍎', '🚌', '🐶'], answer: '🍎' })), 'tiles');
  assert.equal(questionLayout(q({ prompt: 'What colour?', options: ['red apple', 'blue sky'], answer: 'red apple' })), 'choices');
  assert.equal(questionLayout(q({ type: 'short-answer', prompt: 'Say the number.', answer: '5' })), 'type');
  assert.equal(questionLayout(q({ type: 'short-answer', prompt: 'Say the first five letters.', answer: 'A, B, C, D, E' })), 'reflect');
  assert.equal(questionLayout(q({ type: 'short-answer', prompt: 'Draw it.' })), 'reflect', 'no answer to check');
});

test('blanks split around the gap; answers compare without case, spacing or final punctuation', () => {
  assert.deepEqual(splitBlank('1, 2, ___, 4, 5'), ['1, 2, ', ', 4, 5']);
  assert.equal(splitBlank('How many?'), null);
  const apple = q({ prompt: 'x', answer: 'Apple' });
  assert.equal(isCorrect(apple, ' apple. '), true);
  assert.equal(isCorrect(apple, 'apples'), false);
  assert.equal(isCorrect(q({ prompt: 'x' }), ''), false, 'no stored answer is never "correct"');
  assert.equal(isCorrect(q({ prompt: 'x', answer: 'सही' }), 'सही'), true);
  // Letter questions: "b" is not "B" — a chosen option is matched exactly, and a typed single letter too.
  const capital = q({ prompt: 'Which one is a capital letter?', options: ['b', 'd', 'B'], answer: 'B' });
  assert.equal(isCorrect(capital, 'b', true), false);
  assert.equal(isCorrect(capital, 'B', true), true);
  assert.equal(isCorrect(capital, 'b'), false, 'a single-letter answer is case-exact even when typed');
  assert.equal(isCorrect(q({ prompt: 'x', answer: 'Cat' }), 'cat'), true, 'a word typed in another case is fine');
  assert.equal(isCorrect(q({ prompt: 'x', answer: 'Cat' }), 'cat', true), false, 'but a chosen option is exact');
});

test('the flow: learn, examples, questions then practice (easy first), finish — however many there are', () => {
  const lesson = {
    explanation: '🎯 Goal:\nx',
    examples: ['1 sun'],
    keyPoints: [],
    questions: [q({ prompt: 'hard one', difficulty: 'hard', answer: '1' }), q({ prompt: 'easy one', difficulty: 'easy', answer: '1' }), q({ prompt: '   ' })],
    practice: [q({ prompt: 'practice', answer: '2' })],
  };
  const steps = buildSteps(lesson);
  assert.deepEqual(steps.map((s) => s.kind), ['learn', 'examples', 'question', 'question', 'question', 'finish']);
  const prompts = steps.flatMap((s) => (s.kind === 'question' ? [s.q.prompt] : []));
  assert.deepEqual(prompts, ['easy one', 'hard one', 'practice'], 'blank prompts dropped, easy before hard, practice last');
  assert.deepEqual(steps.filter((s) => s.kind === 'question').map((s) => s.kind === 'question' && `${s.group}:${s.position}/${s.of}`), ['questions:1/2', 'questions:2/2', 'practice:1/1']);
  // No questions or examples: still a lesson with a way through.
  assert.deepEqual(buildSteps({ explanation: 'x', examples: [], keyPoints: [], questions: [], practice: [] }).map((s) => s.kind), ['learn', 'finish']);
  const big = Array.from({ length: 100 }, (_, i) => q({ prompt: `q${i}`, answer: 'a' }));
  assert.equal(buildSteps({ ...lesson, questions: big, practice: [] }).length, 103);
});

test('feedback is encouraging: no "wrong", stars are 10 first try and 5 after, ratings run 1 to 3', () => {
  for (const n of NUDGES) assert.ok(!/wrong|incorrect|fail/i.test(`${n.text} ${n.hint}`), n.text);
  assert.ok(CHEERS.length >= 5);
  assert.equal(pick(CHEERS, 0), CHEERS[0]);
  assert.equal(pick(CHEERS, CHEERS.length), CHEERS[0], 'wraps');
  assert.equal(starsFor(1), 10);
  assert.equal(starsFor(2), 5);
  assert.deepEqual([rating(5, 5), rating(3, 5), rating(1, 5), rating(0, 0)], [3, 2, 1, 3]);
});

test('lesson cards preview the emoji a lesson itself uses, and speech picks Hindi for Devanagari', () => {
  assert.deepEqual(previewEmoji(['1 sun in the sky ☀️', '3 wheels 🛺', 'plain', 'five ✋', 'more ☀️']), ['☀️', '🛺', '✋']);
  assert.deepEqual(previewEmoji(['nothing here']), []);
  assert.equal(detectLanguage('अ से अनार'), 'hi');
  assert.equal(detectLanguage('A is for apple'), 'en');
  const v = (lang: string, d = false) => ({ lang, default: d });
  assert.equal(pickVoice([v('en-IN', true), v('en-GB'), v('en-US'), v('hi-IN')], 'en')?.lang, 'en-US');
  assert.equal(pickVoice([v('en-IN', true), v('en-GB'), v('hi-IN')], 'en')?.lang, 'en-GB');
  assert.equal(pickVoice([v('en-IN', true), v('en-AU')], 'en')?.lang, 'en-AU');
  assert.equal(pickVoice([v('en-IN'), v('hi-IN')], 'en')?.lang, 'en-IN');
  assert.equal(pickVoice([v('hi-IN'), v('en-US')], 'hi')?.lang, 'hi-IN');
  assert.equal(pickVoice([v('en_US')], 'en')?.lang, 'en_US');
  assert.equal(pickVoice([v('fr-FR')], 'en'), null);
});

test('Manual Courses stay separate: their pages and view never use the AI learner layer', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = join(process.cwd(), 'frontend');
  const files = [
    'components/courses/ManualCourseView.tsx',
    'app/classes/[slug]/[subject]/manual/[course]/page.tsx',
    'components/admin/manualCourses/ManualCoursePreview.tsx',
    'lib/api/manualCourses.ts',
    'lib/manualCourses/builder.ts',
  ];
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8');
    assert.ok(!/components\/courses\/learn|lib\/learn\/|LearnWidgets|SubjectCards|\bkl-(tone|tint|badge|pop|float)/.test(src), `${file} must not use the AI learner layer`);
  }
  // And the learner layer never reaches into the manual system.
  for (const file of ['components/courses/learn/KidLesson.tsx', 'components/courses/learn/ActivityCard.tsx', 'components/courses/learn/ProgressPieces.tsx', 'lib/learn/lessonFlow.ts', 'components/courses/SubjectCards.tsx']) {
    const src = readFileSync(join(root, file), 'utf8');
    assert.ok(!/manualCourses|ManualCourse|manual-courses/.test(src), `${file} must not use Manual Courses`);
  }
});
