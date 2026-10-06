import type { EngineType, GameContent, MathGenerator, Question } from './types';

/**
 * Turns a game's content into one play session: questions picked from the pool (plus any
 * computed maths questions), in a fresh order, with options and tiles shuffled. Pure apart from
 * the random source, so the tests can drive it with a seeded one.
 */

export type Rng = () => number;

/** A session aims for at least this many scored items (questions, pairs or sorted words). */
export const SESSION_TARGET = 10;

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffles, but never returns the original order when there is any other (an "ordering" puzzle must not start solved). */
export function shuffleAway<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  if (items.length < 2 || new Set(items).size < 2) return items.slice();
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = shuffle(items, rng);
    if (out.some((item, i) => item !== items[i])) return out;
  }
  return items.slice().reverse();
}

/** How many scored items a question is worth. */
export function questionPoints(question: Question): number {
  switch (question.kind) {
    case 'match':
      return question.pairs.length;
    case 'sort':
      return question.items.length;
    default:
      return 1;
  }
}

function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Three wrong-but-plausible numbers near the answer, never negative, never the answer. */
function numberDistractors(answer: number, rng: Rng): string[] {
  const spread = Math.max(3, Math.round(Math.abs(answer) * 0.15));
  const out = new Set<number>();
  const candidates = shuffle([answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, answer + spread, answer - spread], rng);
  for (const value of candidates) {
    if (value >= 0 && value !== answer) out.add(value);
    if (out.size === 3) break;
  }
  while (out.size < 3) out.add(answer + out.size + 3);
  return [...out].map(String);
}

const APPLE = '🍎';
const fmt = (n: number) => n.toLocaleString('en-IN');

interface Fact {
  /** "8 + 7 = ?" */
  visual: string;
  prompt: string;
  answer: number;
}

function arithmeticFact(gen: MathGenerator, rng: Rng): Fact | null {
  switch (gen.op) {
    case 'add': {
      const a = int(rng, gen.min, gen.max);
      const b = int(rng, gen.min, gen.max);
      if (gen.visual) {
        return { visual: `${APPLE.repeat(a)} + ${APPLE.repeat(b)}`, prompt: 'How many apples in all?', answer: a + b };
      }
      return { visual: `${fmt(a)} + ${fmt(b)} = ?`, prompt: 'Add the numbers.', answer: a + b };
    }
    case 'sub': {
      const a = int(rng, gen.min, gen.max);
      const b = int(rng, gen.min, gen.max);
      const [big, small] = a >= b ? [a, b] : [b, a];
      if (gen.visual) {
        return { visual: `${APPLE.repeat(big)} − ${APPLE.repeat(small)}`, prompt: 'How many apples are left?', answer: big - small };
      }
      return { visual: `${fmt(big)} − ${fmt(small)} = ?`, prompt: 'Subtract.', answer: big - small };
    }
    case 'mul': {
      const a = gen.tables[int(rng, 0, gen.tables.length - 1)];
      const b = int(rng, 1, gen.maxFactor);
      if (gen.visual) {
        const group = APPLE.repeat(a);
        return { visual: Array.from({ length: b }, () => group).join('  '), prompt: `${b} groups of ${a}. How many in all?`, answer: a * b };
      }
      return { visual: `${a} × ${b} = ?`, prompt: 'Multiply.', answer: a * b };
    }
    case 'div': {
      const d = gen.divisors[int(rng, 0, gen.divisors.length - 1)];
      const q = int(rng, 1, gen.maxQuotient);
      return { visual: `${d * q} ÷ ${d} = ?`, prompt: 'Divide.', answer: q };
    }
    case 'missing-add': {
      const a = int(rng, gen.min, gen.max);
      const b = int(rng, gen.min, gen.max);
      return { visual: `${fmt(a)} + ? = ${fmt(a + b)}`, prompt: 'Which number is missing?', answer: b };
    }
    case 'count': {
      const n = int(rng, gen.min, gen.max);
      const pictures = ['🍎', '⭐', '🐟', '🎈', '🌼', '🚗', '🍌', '🐥'];
      const picture = pictures[int(rng, 0, pictures.length - 1)];
      return { visual: picture.repeat(n), prompt: 'How many can you count?', answer: n };
    }
    case 'skip-count': {
      const step = gen.steps[int(rng, 0, gen.steps.length - 1)];
      const startIndex = int(rng, 1, Math.max(1, Math.floor(gen.max / step) - 4));
      const seq = Array.from({ length: 5 }, (_, i) => step * (startIndex + i));
      const hole = int(rng, 1, 4);
      const answer = seq[hole];
      return {
        visual: seq.map((n, i) => (i === hole ? '?' : fmt(n))).join(', '),
        prompt: `Count in ${step}s. Which number is missing?`,
        answer,
      };
    }
    default:
      return null;
  }
}

/** Builds `count` distinct computed questions shaped for the engine that will play them. */
export function generateQuestions(gen: MathGenerator, engine: EngineType, count: number, rng: Rng = Math.random): Question[] {
  const out: Question[] = [];
  const seen = new Set<string>();
  let guard = 0;

  while (out.length < count && guard++ < count * 40) {
    if (gen.op === 'order') {
      const values = new Set<number>();
      while (values.size < gen.count) values.add(int(rng, gen.min, gen.max));
      const sorted = [...values].sort((a, b) => (gen.descending ? b - a : a - b));
      const key = sorted.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: 'order',
        prompt: gen.descending ? 'Arrange from biggest to smallest.' : 'Arrange from smallest to biggest.',
        items: sorted.map(fmt),
      });
      continue;
    }

    if (gen.op === 'compare') {
      const pivot = int(rng, gen.min + 2, gen.max - 2);
      const values = new Set<number>();
      let tries = 0;
      while (values.size < 6 && tries++ < 200) {
        const v = int(rng, gen.min, gen.max);
        if (v !== pivot) values.add(v);
      }
      const items = [...values].map((v) => ({ text: fmt(v), bucket: v < pivot ? `Less than ${fmt(pivot)}` : `More than ${fmt(pivot)}` }));
      const buckets = [`Less than ${fmt(pivot)}`, `More than ${fmt(pivot)}`];
      // Both groups must be used, or the round is a trick.
      if (!buckets.every((b) => items.some((item) => item.bucket === b))) continue;
      const key = `${pivot}:${items.map((i) => i.text).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: 'sort', prompt: `Is each number less or more than ${fmt(pivot)}?`, buckets, items });
      continue;
    }

    if (engine === 'matching' || engine === 'memory') {
      const pairs: [string, string][] = [];
      const answers = new Set<number>();
      const lefts = new Set<string>();
      let tries = 0;
      while (pairs.length < 4 && tries++ < 200) {
        const fact = arithmeticFact(gen, rng);
        if (!fact) break;
        const left = fact.visual.replace(' = ?', '');
        if (answers.has(fact.answer) || lefts.has(left)) continue;
        answers.add(fact.answer);
        lefts.add(left);
        pairs.push([left, fmt(fact.answer)]);
      }
      if (pairs.length < 4) break;
      const key = pairs.map((p) => p[0]).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: 'match', prompt: 'Match each problem to its answer.', pairs });
      continue;
    }

    const fact = arithmeticFact(gen, rng);
    if (!fact) break;
    if (seen.has(fact.visual)) continue;
    seen.add(fact.visual);
    if (engine === 'number-pad') {
      out.push({ kind: 'number', prompt: fact.prompt, visual: fact.visual, answer: String(fact.answer) });
    } else {
      const answer = fmt(fact.answer);
      const options = [answer, ...numberDistractors(fact.answer, rng).map((v) => fmt(Number(v)))];
      out.push({ kind: 'choice', prompt: fact.prompt, visual: fact.visual, options, answer });
    }
  }
  return out;
}

/** A question as it will be played: options and tiles already in their on-screen order. */
export type PreparedQuestion = Question & { key: string };

function prepare(question: Question, index: number, rng: Rng): PreparedQuestion {
  const key = `q${index}`;
  switch (question.kind) {
    case 'choice':
      return { ...question, key, options: shuffle(question.options, rng) };
    case 'match':
      return { ...question, key, pairs: shuffle(question.pairs, rng) };
    case 'sort':
      return { ...question, key, items: shuffle(question.items, rng) };
    default:
      return { ...question, key };
  }
}

/**
 * Picks questions for one session: the pool and any generated questions are shuffled together,
 * then taken until the session is worth SESSION_TARGET points (10 questions, or e.g. three
 * matching rounds of four pairs). No question appears twice in a session.
 */
export function buildSession(engine: EngineType, content: GameContent, rng: Rng = Math.random): PreparedQuestion[] {
  const generated = content.generator ? generateQuestions(content.generator, engine, SESSION_TARGET, rng) : [];
  // With a generator, keep a fair share of the hand-written questions (word problems) in the mix.
  const pool = shuffle([...shuffle(content.questions, rng).slice(0, content.generator ? 5 : undefined), ...generated], rng);

  const picked: Question[] = [];
  let points = 0;
  for (const question of pool) {
    if (points >= SESSION_TARGET) break;
    picked.push(question);
    points += questionPoints(question);
  }
  return picked.map((question, index) => prepare(question, index, rng));
}

export function sessionPoints(questions: readonly Question[]): number {
  return questions.reduce((sum, question) => sum + questionPoints(question), 0);
}

/** "3/4", "2.50" and " 12 " compare equal to "3/4", "2.5" and "12". */
export function sameNumber(input: string, answer: string): boolean {
  const clean = (s: string) => s.replace(/[\s,₹]/g, '');
  const a = clean(input);
  const b = clean(answer);
  if (a === b) return true;
  const asNumber = (s: string) => {
    const frac = /^(-?\d+)\/(\d+)$/.exec(s);
    if (frac) return null; // fractions must be typed as written (3/4, not 0.75)
    const n = Number(s);
    return s !== '' && Number.isFinite(n) ? n : null;
  };
  const na = asNumber(a);
  const nb = asNumber(b);
  return na !== null && nb !== null && na === nb;
}
