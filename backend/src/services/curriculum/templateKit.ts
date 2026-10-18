import type { NumberKind } from './topics';

/**
 * Small, deterministic building blocks for the template course generator: a seeded random
 * generator (the same brief always gives the same course) and numeric questions sized to a class.
 */

// ------------------------------------------------------------------------------------ randomness

/** A small seeded random generator, so a brief always produces the same practice questions. */
export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <X>(xs: readonly X[]) => xs[int(0, xs.length - 1)]!;
  const shuffle = <X>(xs: readonly X[]) => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  };
  return { int, pick, shuffle };
}
export type Rng = ReturnType<typeof rng>;

// ------------------------------------------------------------------------------------ numbers

const NAMES = ['Riya', 'Aarav', 'Meera', 'Kabir', 'Anaya', 'Ishaan', 'Sara', 'Vivaan'];
const THINGS = ['pencils', 'apples', 'stickers', 'marbles', 'books', 'flowers', 'balloons', 'coins'];

/** One numeric question of this kind, sized for the class level. */
export function numberQuestion(kind: NumberKind, level: number, r: Rng): { prompt: string; options: string[]; answer: string } {
  const span = level <= 1 ? [1, 9] : level <= 2 ? [10, 99] : level <= 4 ? [100, 999] : [1000, 9999];
  const [lo, hi] = span as [number, number];
  switch (kind) {
    case 'count': {
      const n = r.int(3, 9);
      return { prompt: `How many stars are there? ${'★ '.repeat(n).trim()}`, options: [], answer: String(n) };
    }
    case 'compare': {
      const a = r.int(lo, hi);
      let b = r.int(lo, hi);
      if (b === a) b = a + 1;
      return { prompt: `Which number is greater: ${a} or ${b}?`, options: [String(a), String(b)], answer: String(Math.max(a, b)) };
    }
    case 'placevalue': {
      const digits = level <= 2 ? 2 : level <= 4 ? 3 : level <= 6 ? 5 : 7;
      const n = r.int(10 ** (digits - 1), 10 ** digits - 1);
      const s = String(n);
      const pos = r.int(0, s.length - 1);
      const d = s[pos]!;
      return { prompt: `What is the place value of the digit ${d} at position ${pos + 1} (from the left) in ${n.toLocaleString('en-IN')}?`, options: [], answer: String(Number(d) * 10 ** (s.length - 1 - pos)) };
    }
    case 'add': {
      const a = r.int(lo, hi);
      const b = r.int(lo, hi);
      return { prompt: `${a} + ${b} = ?`, options: [], answer: String(a + b) };
    }
    case 'sub': {
      const a = r.int(lo, hi);
      const b = r.int(lo, a);
      return { prompt: `${a} − ${b} = ?`, options: [], answer: String(a - b) };
    }
    case 'mul': {
      const a = level <= 3 ? r.int(2, 10) : level <= 5 ? r.int(11, 99) : r.int(12, 99);
      const b = level <= 2 ? r.int(1, 5) : level <= 4 ? r.int(2, 9) : r.int(11, 49);
      return { prompt: `${a} × ${b} = ?`, options: [], answer: String(a * b) };
    }
    case 'div': {
      const d = r.int(2, 9);
      const q = level <= 4 ? r.int(2, 12) : r.int(12, 99);
      return { prompt: `${d * q} ÷ ${d} = ?`, options: [], answer: String(q) };
    }
    case 'integer': {
      const a = r.int(-20, 20);
      const b = r.int(-20, 20);
      const op = r.pick(['+', '−'] as const);
      const fmt = (n: number) => (n < 0 ? `(${n})` : String(n));
      return { prompt: `${fmt(a)} ${op} ${fmt(b)} = ?`, options: [], answer: String(op === '+' ? a + b : a - b) };
    }
    case 'fraction': {
      if (level <= 5) {
        const den = r.int(3, 12);
        const a = r.int(1, den - 1);
        let b = r.int(1, den - 1);
        if (b === a) b = a === 1 ? 2 : a - 1;
        return { prompt: `Which fraction is greater: ${a}/${den} or ${b}/${den}?`, options: [`${a}/${den}`, `${b}/${den}`], answer: `${Math.max(a, b)}/${den}` };
      }
      const pairs: Array<[number, number, number, number]> = [[1, 2, 2, 3], [3, 4, 2, 3], [2, 5, 1, 3], [5, 6, 3, 4], [3, 8, 1, 2], [4, 5, 7, 10]];
      const [a, b, c, d] = r.pick(pairs);
      return { prompt: `Which fraction is greater: ${a}/${b} or ${c}/${d}?`, options: [`${a}/${b}`, `${c}/${d}`], answer: a / b > c / d ? `${a}/${b}` : `${c}/${d}` };
    }
    case 'decimal': {
      const places = level >= 7 ? 2 : 1;
      const f = 10 ** places;
      const a = r.int(1 * f, 50 * f) / f;
      const b = r.int(1 * f, 50 * f) / f;
      return { prompt: `${a.toFixed(places)} + ${b.toFixed(places)} = ?`, options: [], answer: (a + b).toFixed(places) };
    }
    case 'percent': {
      const p = r.pick([10, 20, 25, 50, 75]);
      const n = r.int(2, 20) * 20;
      return { prompt: `What is ${p}% of ${n}?`, options: [], answer: String((p * n) / 100) };
    }
    case 'pattern': {
      const start = r.int(1, level <= 2 ? 10 : 30);
      const step = r.int(level <= 2 ? 1 : 2, level <= 2 ? 5 : 12);
      const seq = [0, 1, 2, 3].map((i) => start + i * step);
      return { prompt: `What comes next? ${seq.join(', ')}, ___`, options: [], answer: String(start + 4 * step) };
    }
    case 'equation': {
      const x = r.int(2, 20);
      if (level >= 7 && r.int(0, 1)) {
        const a = r.int(2, 9);
        return { prompt: `Solve for x: ${a}x = ${a * x}`, options: [], answer: `x = ${x}` };
      }
      const a = r.int(1, 30);
      return { prompt: `Solve for x: x + ${a} = ${x + a}`, options: [], answer: `x = ${x}` };
    }
    case 'perimeter': {
      const l = r.int(3, 20);
      const w = r.int(2, l);
      return r.int(0, 1)
        ? { prompt: `A rectangle is ${l} cm long and ${w} cm wide. What is its perimeter?`, options: [], answer: `${2 * (l + w)} cm` }
        : { prompt: `A rectangle is ${l} cm long and ${w} cm wide. What is its area?`, options: [], answer: `${l * w} sq cm` };
    }
    case 'mean': {
      const avg = r.int(4, 30);
      const d1 = r.int(1, 3);
      const d2 = r.int(1, 3);
      const nums = r.shuffle([avg - d1, avg + d1, avg - d2, avg + d2]);
      return { prompt: `What is the average of ${nums.join(', ')}?`, options: [], answer: String(avg) };
    }
    case 'word':
    default: {
      const who = r.pick(NAMES);
      const what = r.pick(THINGS);
      if (level <= 2 || r.int(0, 2) === 0) {
        const a = r.int(3, level <= 2 ? 20 : 90);
        const b = r.int(2, level <= 2 ? 9 : 40);
        return { prompt: `${who} has ${a} ${what} and gets ${b} more. How many ${what} does ${who} have now?`, options: [], answer: String(a + b) };
      }
      if (r.int(0, 1)) {
        const boxes = r.int(3, 12);
        const each = r.int(4, 15);
        return { prompt: `${who} packs ${each} ${what} in each of ${boxes} boxes. How many ${what} are there in all?`, options: [], answer: String(boxes * each) };
      }
      const kids = r.int(2, 8);
      const each = r.int(3, 12);
      return { prompt: `${who} shares ${kids * each} ${what} equally among ${kids} friends. How many does each friend get?`, options: [], answer: String(each) };
    }
  }
}
