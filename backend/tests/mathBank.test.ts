import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATH_PLAN } from '../src/services/curriculum/mathPlan';
import { expandChapter, EXPANDED_AT, type StoredChapter } from '../src/services/curriculum/mathExpand';
import { KIND_NAMES, parseSpec } from '../src/services/curriculum/mathBank';
import { questionProblems, textProblems, type CourseQuestion } from '../src/services/curriculum/course';

/** The chapters as the database has them (3 questions + 2 practice a lesson), built from the plan. */
const stub = (q: number, p: number): CourseQuestion[] => Array.from({ length: q + p }, (_, i) => ({ type: 'mcq' as const, prompt: `old ${i}`, options: ['a', 'b'], answer: 'a', difficulty: 'easy' as const, explanation: '' }));
function chapters(): StoredChapter[] {
  return Object.entries(MATH_PLAN).map(([order, plan]) => ({
    order: Number(order),
    title: plan.title,
    slug: plan.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    lessons: plan.lessons.map((_, i) => ({ title: `L${i + 1}`, questions: stub(3, 0), practice: stub(0, 2).map((x, j) => ({ ...x, prompt: `old practice ${j}` })), estimatedMinutes: 8 })),
  }));
}
const EMOJI = /\p{Extended_Pictographic}/gu;
const emojiCount = (s: string) => (s.match(EMOJI) ?? []).length;

test('every planned kind exists and every spec parses', () => {
  for (const [order, plan] of Object.entries(MATH_PLAN)) {
    plan.lessons.forEach((spec, i) => {
      const s = parseSpec(spec);
      assert.ok(s.kinds.length > 0, `chapter ${order} lesson ${i + 1}`);
      assert.ok(s.lo <= s.hi, `chapter ${order} lesson ${i + 1} range`);
      for (const k of s.kinds) assert.ok(KIND_NAMES.includes(k.kind), `unknown kind "${k.kind}" in chapter ${order} lesson ${i + 1}`);
    });
  }
});

test('expansion keeps old questions, adds new ones to every lesson, and is the same each time', () => {
  for (const ch of chapters()) {
    const a = expandChapter(ch);
    assert.equal(a.status, 'ok', `${ch.title}: ${a.status === 'skipped' ? a.reason : ''}`);
    if (a.status !== 'ok') continue;
    assert.deepEqual(expandChapter(ch), a, 'deterministic');
    a.lessons.forEach((l, i) => {
      const old = ch.lessons[i]!;
      assert.deepEqual(l.questions.slice(0, old.questions.length), old.questions, 'old questions untouched');
      assert.deepEqual(l.practice.slice(0, old.practice.length), old.practice, 'old practice untouched');
      assert.ok(l.questions.length - old.questions.length >= 3, `${ch.title} lesson ${i + 1}: new questions`);
      assert.ok(l.practice.length - old.practice.length >= 3, `${ch.title} lesson ${i + 1}: new practice`);
      assert.ok(l.questions.length <= 30 && l.practice.length <= 10, 'inside the admin limits');
      assert.ok(l.estimatedMinutes > (old.estimatedMinutes ?? 0));
    });
  }
});

test('an already expanded lesson is left alone, and wrong chapters are skipped', () => {
  const ch = chapters()[0]!;
  const done = expandChapter(ch);
  assert.equal(done.status, 'ok');
  if (done.status !== 'ok') return;
  const again = expandChapter({ ...ch, lessons: ch.lessons.map((l, i) => ({ ...l, questions: done.lessons[i]!.questions, practice: done.lessons[i]!.practice })) });
  assert.equal(again.status, 'ok');
  if (again.status === 'ok') again.lessons.forEach((l, i) => assert.equal(l.questions.length, done.lessons[i]!.questions.length));
  assert.ok(done.lessons[0]!.questions.length > EXPANDED_AT);
  assert.equal(expandChapter({ ...ch, title: 'Something else' }).status, 'skipped');
  assert.equal(expandChapter({ ...ch, lessons: ch.lessons.slice(1) }).status, 'skipped');
});

test('every generated question is valid, correct, simple and not repeated', () => {
  let total = 0;
  const kinds = new Set<string>();
  const types = new Set<string>();
  for (const ch of chapters()) {
    const res = expandChapter(ch);
    if (res.status !== 'ok') throw new Error('expected ok');
    const prompts = new Set<string>();
    res.lessons.forEach((l, i) => {
      const added = l.added;
      const where = `${ch.title} lesson ${i + 1}`;
      for (const q of added) {
        total++;
        kinds.add(q.kind);
        types.add(q.type);
        const w = `${where} [${q.kind}] "${q.prompt.replace(/\n/g, ' / ')}"`;
        assert.deepEqual(questionProblems(q, w), [], w);
        assert.deepEqual(textProblems(q, w), [], w);
        assert.ok(q.prompt.length <= 500 && q.answer.length <= 300 && q.explanation.length <= 500, `${w}: length`);
        assert.ok(q.options.length <= 3 || q.type === 'true-false', `${w}: too many options`);
        assert.equal(new Set(q.options).size, q.options.length, `${w}: repeated options`);
        if (q.options.length) assert.ok(q.options.includes(q.answer), `${w}: answer not among options`);
        assert.ok(!prompts.has(q.prompt.toLowerCase()), `${w}: repeated in the chapter`);
        prompts.add(q.prompt.toLowerCase());
        // Simple words: nothing long, and short sentences.
        for (const word of q.prompt.match(/[A-Za-z']+/g) ?? []) assert.ok(word.length <= 12, `${w}: hard word "${word}"`);
        for (const sentence of q.prompt.split(/[.?!\n]/)) assert.ok(sentence.trim().split(/\s+/).length <= 22, `${w}: long sentence`);
        verify(q, w);
      }
    });
  }
  assert.ok(total >= 780, `expected hundreds of questions, got ${total}`);
  for (const t of ['mcq', 'true-false', 'fill-blank', 'match', 'word-problem']) assert.ok(types.has(t), `no ${t} questions`);
  assert.ok(verified >= 250, `only ${verified} answers were re-checked independently`);
  assert.ok(kinds.size >= 40, `only ${kinds.size} kinds in use`);
});

/** An independent check of the answer, read back from the question text. */
let verified = 0;
function checked(a: unknown, b: unknown, w: string) {
  verified++;
  assert.equal(a, b, w);
}
function verify(q: CourseQuestion, w: string) {
  const lines = q.prompt.split('\n');
  const first = lines[0]!;
  let m: RegExpMatchArray | null;
  if ((m = /^(\d+) ([+−]) (\d+) = \?$/.exec(q.prompt))) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    checked(Number(q.answer), m[2] === '+' ? a + b : a - b, w);
  } else if ((m = /^(\d+) \+ ___ = (\d+)$/.exec(q.prompt))) {
    checked(Number(q.answer), Number(m[2]) - Number(m[1]), w);
  } else if ((m = /^(\d+) ([+−]) (\d+) = (\d+)$/.exec(q.prompt))) {
    const ok = (m[2] === '+' ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3])) === Number(m[4]);
    checked(q.answer, ok ? 'True' : 'False', w);
  } else if ((m = /^How many (.+)\?$/.exec(lines[1] ?? '')) && !first.includes('+') && !first.includes('?') && !/^[A-C]:/.test(first)) {
    const items = first.split(' ');
    const target = /triangles/.test(m[1]!) ? items.filter((x) => x === '🔺').length : /^(?!.*\bfish\b)/.test(m[1]!) && items.every((x) => x === items[0]) ? items.length : null;
    if (target !== null) checked(Number(q.answer), target, w);
  } else if ((m = /^(.+) \+ (.+?)( = \?)?$/.exec(first)) && emojiCount(first) > 0 && /altogether|Add them/.test(q.prompt)) {
    checked(Number(q.answer), emojiCount(first), w);
  } else if ((m = /Take away (\d+) /.exec(q.prompt)) && emojiCount(first) > 0) {
    checked(Number(q.answer), emojiCount(first) - Number(m[1]), w);
  } else if ((m = /^Which number is (bigger|smaller)\?$/.exec(first))) {
    const [a, b] = lines[1]!.split(' or ').map(Number) as [number, number];
    checked(Number(q.answer), m[1] === 'bigger' ? Math.max(a!, b!) : Math.min(a!, b!), w);
  } else if ((m = /^What comes (after|before) (\d+)\?$/.exec(q.prompt))) {
    checked(Number(q.answer), Number(m[2]) + (m[1] === 'after' ? 1 : -1), w);
  } else if ((m = /^A: (.*)$/.exec(first)) && /Which group has/.test(q.prompt)) {
    const a = emojiCount(first);
    const b = emojiCount(lines[1]!);
    const more = /more\?/.test(q.prompt);
    checked(q.answer, (more ? a > b : a < b) ? 'A' : 'B', w);
  }
}
