import { rng, type Rng } from './templateKit';
import type { CourseQuestion, Difficulty } from './course';

/**
 * Class 1 Mathematics question bank: seeded generators that write fresh, validated practice for the
 * existing lessons (the same seed always gives the same questions). Nothing here is shown directly:
 * the questions are saved into each lesson's own `questions` / `practice` in the database and the
 * lesson player renders them like any other.
 *
 * A prompt line made only of emoji and + − = ? is drawn as a picture (frontend: splitVisual), so
 * "🍎 🍎 + 🍎 = ?" is a counting picture, not text. Every answer is correct by construction.
 */

interface Ctx {
  r: Rng;
  lo: number;
  hi: number;
  d: Difficulty;
  arg: string;
}
type Gen = (c: Ctx) => CourseQuestion | null;

// ------------------------------------------------------------------------------------ vocabulary

interface Obj {
  e: string;
  one: string;
  many: string;
  food?: boolean;
}
const OBJ: Obj[] = [
  { e: '🍎', one: 'apple', many: 'apples', food: true },
  { e: '🍌', one: 'banana', many: 'bananas', food: true },
  { e: '⭐', one: 'star', many: 'stars' },
  { e: '🎈', one: 'balloon', many: 'balloons' },
  { e: '📕', one: 'book', many: 'books' },
  { e: '✏️', one: 'pencil', many: 'pencils' },
  { e: '🌸', one: 'flower', many: 'flowers' },
  { e: '⚽', one: 'ball', many: 'balls' },
  { e: '🚗', one: 'car', many: 'cars' },
  { e: '🐦', one: 'bird', many: 'birds' },
  { e: '🐟', one: 'fish', many: 'fish' },
  { e: '🍬', one: 'candy', many: 'candies', food: true },
  { e: '🧁', one: 'cupcake', many: 'cupcakes', food: true },
  { e: '🌳', one: 'tree', many: 'trees' },
  { e: '🧸', one: 'teddy bear', many: 'teddy bears' },
  { e: '🥭', one: 'mango', many: 'mangoes', food: true },
  { e: '🍪', one: 'cookie', many: 'cookies', food: true },
];
const NAMES = ['Riya', 'Aarav', 'Meera', 'Kabir', 'Anaya', 'Ishaan', 'Diya', 'Arjun'];
const nm = (o: Obj, n: number) => (n === 1 ? o.one : o.many);
const row = (e: string, n: number) => Array(n).fill(e).join(' ');

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS_NAMES: Record<number, string> = { 10: 'ten', 20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety', 100: 'one hundred' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CLOCKS = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];

// ------------------------------------------------------------------------------------ helpers

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const S = String;

/** A number in [lo, hi], leaning low for easy and high for hard questions. */
function pickN(c: Ctx, lo = c.lo, hi = c.hi): number {
  const size = hi - lo + 1;
  if (size <= 2) return c.r.int(lo, hi);
  if (c.d === 'easy') return c.r.int(lo, lo + Math.ceil(size * 0.6) - 1);
  if (c.d === 'hard') return c.r.int(lo + Math.floor(size * 0.4), hi);
  return c.r.int(lo, hi);
}
const near = (n: number, min: number, max: number) => [n - 2, n - 1, n + 1, n + 2].filter((x) => x >= min && x <= max && x !== n);

function mc(c: Ctx, prompt: string, answer: string, wrong: string[], expl: string, type: CourseQuestion['type'] = 'mcq'): CourseQuestion | null {
  const w = c.r.shuffle(uniq(wrong.filter((x) => x !== answer))).slice(0, 2);
  if (w.length < 1) return null;
  return { type, prompt, options: c.r.shuffle([answer, ...w]), answer, difficulty: c.d, explanation: expl };
}
/** A number answer: three number choices, or (a third of the time past the easy level) typed in. */
function numQ(c: Ctx, prompt: string, ans: number, expl: string, min = 0, max = ans + 3, type: CourseQuestion['type'] = 'mcq', fmt: (n: number) => string = S): CourseQuestion | null {
  if (c.d !== 'easy' && fmt === S && c.r.int(0, 2) === 0 && !prompt.includes('___')) return { type: 'fill-blank', prompt, options: [], answer: fmt(ans), difficulty: c.d, explanation: expl };
  return mc(c, prompt, fmt(ans), near(ans, min, max).map(fmt), expl, prompt.includes('___') ? 'fill-blank' : type);
}
function tfQ(c: Ctx, prompt: string, truth: boolean, expl: string): CourseQuestion {
  return { type: 'true-false', prompt, options: ['True', 'False'], answer: truth ? 'True' : 'False', difficulty: c.d, explanation: expl };
}
const rupee = (n: number) => `₹${n}`;

// ------------------------------------------------------------------------------------ counting & numbers

const count: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const n = pickN(c, Math.max(1, c.lo), Math.min(20, c.hi));
  return numQ(c, `${row(o.e, n)}\nHow many ${o.many}?`, n, `Count each one. There ${n === 1 ? 'is' : 'are'} ${n}.`, 1, 20, 'mcq');
};
const matchQty: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const n = pickN(c, Math.max(1, c.lo), Math.min(10, c.hi));
  if (c.r.int(0, 1) === 0) return mc(c, `${row(o.e, n)}\nWhich number matches?`, S(n), near(n, 1, 12).map(S), `${n} ${nm(o, n)}.`, 'match');
  const wrong = near(n, 1, 12).map((m) => row(o.e, m));
  return mc(c, `Which group shows ${n}?`, row(o.e, n), wrong, `${n} ${nm(o, n)}.`, 'match');
};
const missing: Gen = (c) => {
  if (c.hi - c.lo < 4) return null;
  const down = c.arg === 'down' || (c.arg === '' && c.d === 'hard' && c.r.int(0, 1) === 1);
  const start = c.r.int(c.lo, c.hi - 4);
  const seq = Array.from({ length: 5 }, (_, i) => (down ? start + 4 - i : start + i));
  const hide = c.d === 'easy' ? c.r.int(1, 3) : c.r.int(0, 4);
  const ans = seq[hide]!;
  const shown = seq.map((n, i) => (i === hide ? '?' : S(n))).join(', ');
  return numQ(c, `${shown}\nFill the missing number.`, ans, down ? 'The numbers go down by 1.' : 'The numbers go up by 1.', c.lo, c.hi + 1);
};
const ba: Gen = (c) => {
  if (c.hi - c.lo < 2) return null;
  const after = c.arg === 'after' || (c.arg === '' && c.r.int(0, 1) === 0);
  if (after) {
    const n = pickN(c, c.lo, c.hi - 1);
    return numQ(c, `What comes after ${n}?`, n + 1, `${n + 1} comes just after ${n}.`, c.lo, c.hi + 1);
  }
  const n = pickN(c, c.lo + 1, c.hi);
  return numQ(c, `What comes before ${n}?`, n - 1, `${n - 1} comes just before ${n}.`, Math.max(0, c.lo - 1), c.hi);
};
const between: Gen = (c) => {
  if (c.hi - c.lo < 2) return null;
  const a = pickN(c, c.lo, c.hi - 2);
  return numQ(c, `${a}, ?, ${a + 2}\nWhich number is in the middle?`, a + 1, `${a + 1} comes between ${a} and ${a + 2}.`, c.lo, c.hi);
};
const cmp: Gen = (c) => {
  const a = pickN(c);
  let b = pickN(c);
  if (a === b) b = a < c.hi ? a + 1 : a - 1;
  if (b < c.lo || b === a) return null;
  const bigger = c.arg === 'smaller' ? false : c.arg === 'bigger' ? true : c.r.int(0, 1) === 0;
  const ans = bigger ? Math.max(a, b) : Math.min(a, b);
  return mc(c, `Which number is ${bigger ? 'bigger' : 'smaller'}?\n${a} or ${b}`, S(ans), [S(a === ans ? b : a)], `${ans} is ${bigger ? 'bigger' : 'smaller'} than ${a === ans ? b : a}.`);
};
const cmpGroups: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const max = Math.min(10, c.hi);
  if (max < 2) return null;
  if (c.r.int(0, 3) === 0) {
    const n = pickN(c, 1, max);
    const same = c.r.int(0, 1) === 0;
    const m = same ? n : n === max ? n - 1 : n + 1;
    return { type: 'mcq', prompt: `A: ${row(o.e, n)}\nB: ${row(o.e, m)}\nAre A and B the same?`, options: ['Yes', 'No'], answer: same ? 'Yes' : 'No', difficulty: c.d, explanation: same ? `Both have ${n}.` : `A has ${n} and B has ${m}.` };
  }
  const a = pickN(c, 1, max);
  let b = pickN(c, 1, max);
  if (a === b) b = a === max ? a - 1 : a + 1;
  const more = c.arg === 'fewer' ? false : c.arg === 'more' ? true : c.r.int(0, 1) === 0;
  const ans = (more ? a > b : a < b) ? 'A' : 'B';
  return { type: 'mcq', prompt: `A: ${row(o.e, a)}\nB: ${row(o.e, b)}\nWhich group has ${more ? 'more' : 'fewer'}?`, options: ['A', 'B'], answer: ans, difficulty: c.d, explanation: `A has ${a} and B has ${b}.` };
};
const order: Gen = (c) => {
  if (c.hi - c.lo < 4) return null;
  const pool = c.r.shuffle(Array.from({ length: c.hi - c.lo + 1 }, (_, i) => c.lo + i)).slice(0, 4);
  const down = c.arg === 'desc' || (c.arg === '' && c.r.int(0, 1) === 1);
  const sorted = [...pool].sort((x, y) => (down ? y - x : x - y));
  const fmt = (xs: number[]) => xs.join(' → ');
  const swap = [...sorted];
  const i = c.r.int(0, 2);
  [swap[i], swap[i + 1]] = [swap[i + 1]!, swap[i]!];
  const wrong = [fmt(swap), fmt([...sorted].reverse()), fmt(pool)];
  return mc(c, `Put the numbers in order, ${down ? 'big to small' : 'small to big'}.\n${pool.join(', ')}`, fmt(sorted), wrong, `${down ? 'Start with the biggest.' : 'Start with the smallest.'}`);
};
const skip: Gen = (c) => {
  const step = Number(c.arg.split(':')[0]) || 2;
  const k = step === 2 ? c.r.int(1, 5) : step === 5 ? c.r.int(1, 3) : c.r.int(1, 4);
  const start = step * (c.d === 'easy' ? 1 : k);
  const seq = Array.from({ length: 5 }, (_, i) => start + step * i);
  const hide = c.d === 'easy' ? 3 + c.r.int(0, 1) : c.r.int(1, 4);
  const shown = seq.map((n, i) => (i === hide ? '?' : S(n))).join(', ');
  const ans = seq[hide]!;
  return mc(c, `${shown}\nCount by ${step}s. What is missing?`, S(ans), [S(ans - step), S(ans + step), S(ans + 1)], `We add ${step} each time.`);
};
const name: Gen = (c) => {
  if (c.arg === 'tens') {
    const t = c.r.int(1, 9) * 10;
    if (c.r.int(0, 1) === 0) return mc(c, `Which is the name of ${t}?`, TENS_NAMES[t]!, [TENS_NAMES[t - 10] ?? 'ten', TENS_NAMES[t + 10] ?? 'ninety', 'twenty'], `${t} is ${TENS_NAMES[t]}.`);
    return mc(c, `Which number is "${TENS_NAMES[t]}"?`, S(t), [S(t - 10 || 10), S(t + 10), S(t + 20)], `${TENS_NAMES[t]} is ${t}.`);
  }
  const n = pickN(c, c.lo, Math.min(20, c.hi));
  if (c.r.int(0, 1) === 0) return mc(c, `Which is the name of ${n}?`, ONES[n]!, near(n, 0, 20).map((m) => ONES[m]!), `${n} is ${ONES[n]}.`);
  return mc(c, `Which number is "${ONES[n]}"?`, S(n), near(n, 0, 20).map(S), `${ONES[n]} is ${n}.`);
};
const tens: Gen = (c) => {
  const n = pickN(c, Math.max(11, c.lo), c.hi);
  if (n <= 20) {
    if (c.r.int(0, 1) === 0) return numQ(c, `1 ten and ${n - 10} ones make ___`, n, `10 and ${n - 10} make ${n}.`, 10, 20);
    return numQ(c, `In ${n}, how many ones are there?`, n - 10, `${n} is 1 ten and ${n - 10} ones.`, 0, 9);
  }
  const t = Math.floor(n / 10);
  const o = n % 10;
  const form = c.r.int(0, 2);
  if (form === 0) return numQ(c, `${t} tens and ${o} ones make ___`, n, `${t} tens is ${t * 10}. Add ${o}.`, 11, 100);
  if (form === 1) return numQ(c, `How many tens are in ${n}?`, t, `${n} has ${t} tens.`, 1, 10);
  return numQ(c, `How many ones are in ${n}?`, o, `${n} has ${o} ones.`, 0, 9);
};
const zero: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const form = c.r.int(0, 2);
  if (form === 0) return mc(c, `🍽️\nThe plate has no ${o.many}. How many ${o.many} are on the plate?`, '0', ['1', '2'], 'No things means zero.');
  if (form === 1) {
    const n = c.r.int(1, Math.min(9, c.hi));
    return numQ(c, `${n} − ${n} = ?`, 0, `Take away all ${n}. Nothing is left.`, 0, 3);
  }
  return mc(c, 'Zero means...', 'nothing', ['one', 'many'], 'Zero means none, nothing at all.');
};
const oneMore: Gen = (c) => {
  const n = pickN(c, Math.max(1, c.lo), c.hi - 1);
  const o = c.r.pick(OBJ);
  const vis = n <= 10 && c.d === 'easy';
  return numQ(c, `${vis ? `${row(o.e, n)} + ${o.e}\n` : ''}What is one more than ${n}?`, n + 1, `${n} and 1 more is ${n + 1}.`, 0, c.hi + 1);
};
const oneLess: Gen = (c) => {
  const n = pickN(c, Math.max(1, c.lo + 1), c.hi);
  return numQ(c, `What is one less than ${n}?`, n - 1, `Take away 1 from ${n} to get ${n - 1}.`, 0, c.hi);
};

// ------------------------------------------------------------------------------------ add & subtract

const addObj: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const top = Math.min(c.hi, 20);
  if (top < 3) return null;
  const sum = pickN(c, Math.max(2, c.lo), top);
  const a = c.r.int(1, sum - 1);
  const b = sum - a;
  const eq = c.d === 'easy' ? '' : ' = ?';
  const ask = c.d === 'easy' ? `How many ${o.many} altogether?` : 'Add them.';
  return numQ(c, `${row(o.e, a)} + ${row(o.e, b)}${eq}\n${ask}`, sum, `${a} and ${b} make ${sum}.`, 1, top + 2);
};
const addEq: Gen = (c) => {
  const top = c.hi;
  if (top < 2) return null;
  let a: number;
  let b: number;
  if (c.arg === '01') {
    a = c.r.int(0, Math.max(0, top - 1));
    b = c.r.pick([0, 1]);
    if (c.r.int(0, 1)) [a, b] = [b, a];
  } else if (c.arg === 'ten') {
    a = 10;
    b = c.r.int(1, top - 10);
  } else if (c.arg === 'on') {
    a = c.r.int(Math.max(1, c.lo - 3), top - 3);
    b = c.r.int(1, 3);
  } else if (c.arg === 'cross') {
    a = c.r.int(6, 9);
    b = c.r.int(11 - a, Math.min(9, top - a));
  } else {
    const sum = pickN(c, Math.max(2, c.lo), top);
    a = c.r.int(1, sum - 1);
    b = sum - a;
  }
  const hint = c.arg === 'cross' ? `Make ten first: ${a} + ${10 - a} = 10, then add ${b - (10 - a)} more.` : c.arg === 'on' ? `Start at ${a} and count on ${b}.` : `${a} + ${b} = ${a + b}.`;
  return numQ(c, `${a} + ${b} = ?`, a + b, hint, 0, top + 2);
};
const missAdd: Gen = (c) => {
  const top = c.hi;
  if (top < 3) return null;
  const sum = pickN(c, Math.max(3, c.lo), top);
  const a = c.r.int(1, sum - 1);
  const b = sum - a;
  return numQ(c, `${a} + ___ = ${sum}`, b, `${a} + ${b} = ${sum}.`, 0, top);
};
const subObj: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const top = Math.min(c.hi, 20);
  if (top < 3) return null;
  const t = pickN(c, Math.max(3, c.lo), top);
  const k = c.r.int(1, t - 1);
  return numQ(c, `${row(o.e, t)}\nTake away ${k} ${nm(o, k)}. How many are left?`, t - k, `${t} take away ${k} is ${t - k}.`, 0, t);
};
const subEq: Gen = (c) => {
  const top = c.hi;
  if (top < 2) return null;
  let a: number;
  let b: number;
  if (c.arg === '01') {
    a = c.r.int(2, top);
    b = c.r.pick([0, 1, a]);
  } else if (c.arg === 'teen') {
    a = c.r.int(11, top);
    b = c.r.int(1, a - 10);
  } else if (c.arg === 'cross') {
    a = c.r.int(11, Math.min(18, top));
    b = c.r.int(a - 9, 9);
    if (b < 1 || b >= a) return null;
  } else {
    a = pickN(c, Math.max(2, c.lo), top);
    b = c.r.int(1, a - 1);
  }
  return numQ(c, `${a} − ${b} = ?`, a - b, c.arg === 'cross' ? `Go back to 10 first, then go back more.` : `${a} take away ${b} is ${a - b}.`, 0, top);
};
const fam: Gen = (c) => {
  const top = Math.min(c.hi, 20);
  if (top < 3) return null;
  const sum = pickN(c, Math.max(3, c.lo), top);
  const a = c.r.int(1, sum - 1);
  const b = sum - a;
  return numQ(c, `${a} + ${b} = ${sum}. So ${sum} − ${b} = ?`, a, 'Adding and taking away are friends.', 0, top);
};
const doubles: Gen = (c) => {
  const n = c.r.int(1, Math.min(10, Math.floor(c.hi / 2)));
  const vis = c.d === 'easy' && n <= 5;
  const o = c.r.pick(OBJ);
  return numQ(c, vis ? `${row(o.e, n)} + ${row(o.e, n)} = ?\nDouble ${n}.` : `${n} + ${n} = ?`, n * 2, `Double ${n} is ${n * 2}.`, 0, 22);
};
const makeTen: Gen = (c) => {
  const a = c.r.int(1, 9);
  return numQ(c, `${a} + ___ = 10`, 10 - a, `${a} and ${10 - a} make 10.`, 0, 10);
};
const mental: Gen = (c) => {
  const top = Math.max(4, c.hi);
  if (c.r.int(0, 1) === 0) {
    const a = c.r.int(1, Math.floor(top / 2));
    const b = c.r.int(1, top - a);
    return numQ(c, `${a} + ${b} = ?`, a + b, `${a} + ${b} = ${a + b}.`, 0, top + 2);
  }
  const a = c.r.int(2, top);
  const b = c.r.int(1, a - 1);
  return numQ(c, `${a} − ${b} = ?`, a - b, `${a} − ${b} = ${a - b}.`, 0, top);
};
const repAdd: Gen = (c) => {
  const v = c.r.int(1, 5);
  const k = c.r.int(2, 4);
  if (v * k > 20) return null;
  return numQ(c, `${Array(k).fill(v).join(' + ')} = ?`, v * k, `${k} groups of ${v} make ${v * k}.`, 0, 22);
};
const groups: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const g = c.r.int(2, 4);
  const k = c.r.int(2, 4);
  const rows = Array.from({ length: g }, () => row(o.e, k)).join('\n');
  return numQ(c, `${rows}\nThere are ${g} plates. Each plate has ${k} ${o.many}. How many ${o.many} in all?`, g * k, `${g} groups of ${k} is ${g * k}.`, 1, 20);
};
const share: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const g = c.r.pick([2, 2, 3, 4, 5]);
  const k = c.r.int(1, Math.floor(20 / g) > 4 ? 4 : Math.floor(20 / g));
  const total = g * k;
  const kids = g === 2 ? 'two friends' : `${g} friends`;
  return numQ(c, `${row(o.e, total)}\nShare ${total} ${o.many} equally with ${kids}. How many does each friend get?`, k, `${total} shared by ${g} is ${k} each.`, 1, 6);
};

// ------------------------------------------------------------------------------------ stories

const story = (c: Ctx, kind: 'add' | 'sub'): CourseQuestion | null => {
  const o = c.r.pick(OBJ);
  const who = c.r.pick(NAMES);
  const top = Math.min(c.hi, 20);
  if (top < 3) return null;
  if (kind === 'add') {
    const sum = pickN(c, Math.max(2, c.lo), top);
    const a = c.r.int(1, sum - 1);
    const b = sum - a;
    const T = [
      `${who} has ${a} ${nm(o, a)}. Mom gives ${b} more. How many ${o.many} does ${who} have now?`,
      `There ${a === 1 ? 'is' : 'are'} ${a} ${nm(o, a)} in a box and ${b} on the table. How many ${o.many} in all?`,
      `We see ${a} ${nm(o, a)}. Then we see ${b} more. How many ${o.many} do we see?`,
      `${who} has ${a} ${nm(o, a)}. A friend has ${b} ${nm(o, b)}. How many ${o.many} together?`,
    ];
    const vis = c.d === 'easy' && sum <= 10 ? `${row(o.e, a)} + ${row(o.e, b)}\n` : '';
    return numQ(c, vis + c.r.pick(T), sum, `${a} + ${b} = ${sum}.`, 1, top + 2, 'word-problem');
  }
  const t = pickN(c, Math.max(3, c.lo), top);
  const k = c.r.int(1, t - 1);
  const T = [
    `${who} has ${t} ${nm(o, t)}. ${who} gives ${k} to a friend. How many are left?`,
    `There ${t === 1 ? 'is' : 'are'} ${t} ${nm(o, t)}. ${k} go away. How many are left?`,
    ...(o.food ? [`${who} has ${t} ${nm(o, t)}. ${who} eats ${k}. How many are left?`] : []),
  ];
  const vis = c.d === 'easy' && t <= 10 ? `${row(o.e, t)}\n` : '';
  return numQ(c, vis + c.r.pick(T), t - k, `${t} − ${k} = ${t - k}.`, 0, t, 'word-problem');
};
const addStory: Gen = (c) => story(c, 'add');
const subStory: Gen = (c) => story(c, 'sub');
const mixStory: Gen = (c) => story(c, c.r.int(0, 1) === 0 ? 'add' : 'sub');
const twoStep: Gen = (c) => {
  const o = c.r.pick(OBJ.filter((x) => x.food));
  const who = c.r.pick(NAMES);
  const a = c.r.int(2, 6);
  const b = c.r.int(1, 4);
  const k = c.r.int(1, Math.min(3, a + b - 1));
  return numQ(c, `${who} has ${a} ${nm(o, a)}. Mom gives ${b} more. ${who} eats ${k}. How many are left?`, a + b - k, `${a} + ${b} = ${a + b}. Then ${a + b} − ${k} = ${a + b - k}.`, 0, 12, 'word-problem');
};
const tf: Gen = (c) => {
  const form = c.arg === 'cmp' ? 0 : c.arg === 'add' ? 1 : c.arg === 'sub' ? 2 : c.r.int(0, 2);
  const truth = c.r.int(0, 1) === 0;
  if (form === 0 || c.hi < 3) {
    const a = pickN(c);
    let b = pickN(c);
    if (a === b) b = a < c.hi ? a + 1 : a - 1;
    const big = Math.max(a, b);
    const small = Math.min(a, b);
    return truth ? tfQ(c, `${big} is greater than ${small}.`, true, `${big} is bigger than ${small}.`) : tfQ(c, `${small} is greater than ${big}.`, false, `${small} is smaller than ${big}.`);
  }
  if (form === 1) {
    const a = c.r.int(1, Math.floor(c.hi / 2));
    const b = c.r.int(1, c.hi - a);
    const shown = truth ? a + b : a + b + c.r.pick([-1, 1, 2]);
    return tfQ(c, `${a} + ${b} = ${shown}`, shown === a + b, `${a} + ${b} = ${a + b}.`);
  }
  const a = c.r.int(2, c.hi);
  const b = c.r.int(1, a - 1);
  const shown = truth ? a - b : a - b + c.r.pick([1, 2]);
  return tfQ(c, `${a} − ${b} = ${shown}`, shown === a - b, `${a} − ${b} = ${a - b}.`);
};
const nline: Gen = (c) => {
  const top = Math.min(10, Math.max(6, c.hi));
  const line = Array.from({ length: top + 1 }, (_, i) => i).join(' — ');
  if (c.arg === 'miss' || (c.arg === '' && c.r.int(0, 1) === 0)) {
    const n = c.r.int(1, top - 1);
    const shown = Array.from({ length: top + 1 }, (_, i) => (i === n ? '?' : S(i))).join(' — ');
    return numQ(c, `${shown}\nWhich number is missing on the number line?`, n, `${n} comes after ${n - 1}.`, 0, top);
  }
  const sub = c.arg === 'sub';
  const a = sub ? c.r.int(3, top) : c.r.int(0, top - 2);
  const b = sub ? c.r.int(1, a) : c.r.int(1, top - a);
  const ans = sub ? a - b : a + b;
  return numQ(c, `${line}\nStart at ${a}. Jump ${b} ${b === 1 ? 'step' : 'steps'} ${sub ? 'back' : 'forward'}. Where do you land?`, ans, sub ? `${a} − ${b} = ${ans}.` : `${a} + ${b} = ${ans}.`, 0, top);
};

// ------------------------------------------------------------------------------------ shapes

type ShapeName = 'circle' | 'square' | 'triangle' | 'rectangle';
const SHAPES: Record<ShapeName, { sides: number; emoji: string[]; things: Array<[string, string]> }> = {
  circle: { sides: 0, emoji: ['🔴', '🔵', '🟢', '🟡'], things: [['a ball', '⚽'], ['a coin', '🪙'], ['a clock face', '🕐'], ['the sun', '☀️']] },
  square: { sides: 4, emoji: ['🟥', '🟦', '🟩', '🟨'], things: [['a dice', '🎲'], ['a picture frame', '🖼️'], ['a chess board', '♟️']] },
  triangle: { sides: 3, emoji: ['🔺'], things: [['a flag', '🚩'], ['a slice of pizza', '🍕']] },
  rectangle: { sides: 4, emoji: [], things: [['a door', '🚪'], ['a book', '📕'], ['a phone', '📱'], ['a TV', '📺']] },
};
const SHAPE_KEYS = Object.keys(SHAPES) as ShapeName[];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** The shape a lesson is about (its #arg), or any of the four. */
const focus = (c: Ctx): ShapeName[] => {
  const f = c.arg.split(',').filter((x): x is ShapeName => x in SHAPES);
  return f.length ? f : SHAPE_KEYS;
};
const shapeName: Gen = (c) => {
  const s = c.r.pick(focus(c).filter((k) => SHAPES[k].emoji.length));
  if (!s) return null;
  const e = c.r.pick(SHAPES[s].emoji);
  const wrong = SHAPE_KEYS.filter((k) => k !== s && k !== 'rectangle').map(cap);
  return mc(c, `${e}\nWhich shape is this?`, cap(s), wrong, `This is a ${s}.`);
};
const shapeSides: Gen = (c) => {
  const s = c.r.pick(focus(c));
  const n = SHAPES[s].sides;
  return mc(c, `How many sides does a ${s} have?`, S(n), [S(n + 1), S(n === 0 ? 2 : n - 1), S(n + 2)], n === 0 ? 'A circle is round. It has no straight sides.' : `A ${s} has ${n} sides.`);
};
const shapeObj: Gen = (c) => {
  const s = c.r.pick(focus(c));
  const [thing, e] = c.r.pick(SHAPES[s].things);
  return mc(c, `${e}\nWhat shape is ${thing}?`, cap(s), SHAPE_KEYS.filter((k) => k !== s).map(cap), `${cap(thing)} is shaped like a ${s}.`);
};
const oddShape: Gen = (c) => {
  const pairs: Array<[string, string]> = [['🔴', '🟥'], ['🔵', '🟦'], ['🟢', '🟩'], ['🔴', '🔺'], ['🟥', '🔺']];
  let [a, b] = c.r.pick(pairs);
  if (c.r.int(0, 1)) [a, b] = [b, a];
  const items = [a, a, a, a];
  items[c.r.int(0, 3)] = b;
  return { type: 'mcq', prompt: `${items.join(' ')}\nWhich shape is different?`, options: c.r.shuffle([a, b]), answer: b, difficulty: c.d, explanation: 'It is not the same shape as the others.' };
};
const shapeCount: Gen = (c) => {
  const n = c.r.int(2, 6);
  const m = c.r.int(1, 5);
  const items = c.r.shuffle([...Array(n).fill('🔺'), ...Array(m).fill('🔴')]);
  return numQ(c, `${items.join(' ')}\nHow many triangles?`, n, `There are ${n} triangles.`, 1, 8);
};
const tfShape: Gen = (c) => {
  const s = c.r.pick(focus(c));
  const truth = c.r.int(0, 1) === 0;
  const n = SHAPES[s].sides;
  const shown = truth ? n : c.r.pick([n + 1, n === 0 ? 3 : n - 1].filter((x) => x !== n && x >= 0));
  if (n === 0) return truth ? tfQ(c, 'A circle has no corners.', true, 'A circle is round.') : tfQ(c, 'A circle has 4 sides.', false, 'A circle has no sides.');
  return tfQ(c, `A ${s} has ${shown} sides.`, shown === n, `A ${s} has ${n} sides.`);
};

// ------------------------------------------------------------------------------------ patterns & sorting

const PAT_EMOJI = ['⭐', '🔵', '🍎', '🍌', '🔺', '🟢', '🌸', '🐱', '⚽', '🚗', '🧸', '🎈'];
const pattern: Gen = (c) => {
  const kind = c.arg || (c.d === 'easy' ? 'ab' : c.d === 'medium' ? 'aab' : 'abc');
  const [x, y, z, w] = c.r.shuffle(PAT_EMOJI);
  const unit = kind === 'ab' ? [x!, y!] : kind === 'aab' ? [x!, x!, y!] : kind === 'abb' ? [x!, y!, y!] : [x!, y!, z!];
  const p = c.d === 'easy' ? 0 : c.r.int(0, unit.length - 1);
  const shown = [...unit, ...unit, ...unit.slice(0, p)];
  const ans = unit[p]!;
  const options = uniq([...unit, w!]).slice(0, 3);
  if (!options.includes(ans)) options[0] = ans;
  return { type: 'mcq', prompt: `${shown.join(' ')} ?\nWhat comes next?`, options: c.r.shuffle(uniq(options)), answer: ans, difficulty: c.d, explanation: `The pattern repeats: ${unit.join(' ')}.` };
};
const patNum: Gen = (c) => {
  const a = c.r.int(1, 6);
  let b = c.r.int(1, 6);
  if (b === a) b = a + 1;
  const p = c.r.int(0, 1);
  const shown = [a, b, a, b, a].slice(0, 4 + p).join(', ') + ', ?';
  const ans = p === 0 ? a : b;
  return mc(c, `${shown}\nWhat number comes next?`, S(ans), [S(a === ans ? b : a), S(ans + 1), S(ans + 2)], `The numbers ${a}, ${b} repeat.`);
};
const CATS: string[][] = [['🍎', '🍌', '🍇', '🍊'], ['🐱', '🐶', '🐰', '🐻'], ['🚗', '🚌', '🚲', '🚂'], ['⚽', '🧸', '🎲', '🎈']];
const oddCat: Gen = (c) => {
  const [ca, cb] = c.r.shuffle(CATS);
  const same = c.r.shuffle(ca!).slice(0, 3);
  const diff = c.r.pick(cb!);
  const items = [...same];
  items.splice(c.r.int(0, 3), 0, diff);
  return { type: 'mcq', prompt: `${items.join(' ')}\nWhich one is different?`, options: c.r.shuffle([diff, same[0]!, same[1]!]), answer: diff, difficulty: c.d, explanation: 'The others belong together.' };
};
const sortCount: Gen = (c) => {
  const [a, b] = c.r.shuffle(OBJ.filter((o) => o.many !== 'fish')).slice(0, 2) as [Obj, Obj];
  const n = c.r.int(2, 7);
  const m = c.r.int(1, 6);
  const items = c.r.shuffle([...Array(n).fill(a.e), ...Array(m).fill(b.e)]);
  if (c.r.int(0, 1) === 0) return numQ(c, `${items.join(' ')}\nHow many ${a.many}?`, n, `Sort and count the ${a.many}.`, 0, 9);
  if (n === m) return null;
  return mc(c, `${items.join(' ')}\nThere are more ...`, n > m ? a.many : b.many, [n > m ? b.many : a.many], `${n} ${a.many} and ${m} ${b.many}.`);
};
const pictograph: Gen = (c) => {
  const o = c.r.pick(OBJ);
  const counts = c.r.shuffle([1, 2, 3, 4, 5, 6]).slice(0, 3);
  const labels = ['A', 'B', 'C'];
  const rows = counts.map((n, i) => `${labels[i]}: ${row(o.e, n)}`).join('\n');
  const most = c.r.int(0, 1) === 0;
  const target = most ? Math.max(...counts) : Math.min(...counts);
  return { type: 'mcq', prompt: `${rows}\nWhich row has the ${most ? 'most' : 'fewest'}?`, options: labels, answer: labels[counts.indexOf(target)]!, difficulty: c.d, explanation: `Count each row. ${target} is the ${most ? 'biggest' : 'smallest'}.` };
};

// ------------------------------------------------------------------------------------ measurement

const PAIRS: Record<string, Array<[big: string, small: string]>> = {
  long: [['a train 🚂', 'a pencil ✏️'], ['a bus 🚌', 'a toy car 🚗'], ['a snake 🐍', 'a worm 🪱'], ['a rope', 'a thread']],
  tall: [['a tree 🌳', 'a flower 🌸'], ['a giraffe 🦒', 'a cat 🐱'], ['an elephant 🐘', 'a mouse 🐭'], ['a tall building 🏢', 'a chair 🪑']],
  heavy: [['an elephant 🐘', 'a bird 🐦'], ['a stone 🪨', 'a feather 🪶'], ['a watermelon 🍉', 'a grape 🍇'], ['a truck 🚚', 'a bicycle 🚲'], ['a book 📕', 'a leaf 🍃']],
  big: [['a whale 🐋', 'a fish 🐟'], ['a lion 🦁', 'a cat 🐱'], ['a bus 🚌', 'a car 🚗']],
};
const WORDS: Record<string, [string, string]> = { long: ['longer', 'shorter'], tall: ['taller', 'shorter'], heavy: ['heavier', 'lighter'], big: ['bigger', 'smaller'] };
const measure: Gen = (c) => {
  const kind = PAIRS[c.arg] ? c.arg : c.r.pick(Object.keys(PAIRS));
  const [big, small] = c.r.pick(PAIRS[kind]!);
  const [up, down] = WORDS[kind]!;
  const wantBig = c.r.int(0, 1) === 0;
  return mc(c, `Which is ${wantBig ? up : down}?`, wantBig ? big : small, [wantBig ? small : big], `${cap(big)} is ${up} than ${small}.`);
};
const FACTS: Record<string, Array<[string, boolean]>> = {
  fe: [['An empty glass has nothing in it.', true], ['A full bag has no more space.', true], ['A full bottle is empty.', false], ['An empty box has many toys inside.', false]],
  near: [['Your friend sitting next to you is near.', true], ['The moon is near to us.', false], ['Your nose is near your eyes.', true], ['A star is near to us.', false]],
};
const tfMeasure: Gen = (c) => {
  if (c.arg === 'fe' || c.arg === 'near') {
    const [t, v] = c.r.pick(FACTS[c.arg]!);
    return tfQ(c, t, v, v ? 'Yes, that is right.' : 'No, that is not right.');
  }
  const kind = PAIRS[c.arg] ? c.arg : 'long';
  const [big, small] = c.r.pick(PAIRS[kind]!);
  const [up] = WORDS[kind]!;
  const truth = c.r.int(0, 1) === 0;
  return tfQ(c, truth ? `${cap(big)} is ${up} than ${small}.` : `${cap(small)} is ${up} than ${big}.`, truth, `${cap(big)} is ${up} than ${small}.`);
};

// ------------------------------------------------------------------------------------ time

const PARTS: Array<[act: string, emoji: string, part: string]> = [
  ['wake up and brush our teeth', '🪥', 'morning'],
  ['eat breakfast', '🥣', 'morning'],
  ['go to school', '🎒', 'morning'],
  ['eat lunch', '🍛', 'afternoon'],
  ['see the bright sun high in the sky', '☀️', 'afternoon'],
  ['watch the sun go down', '🌇', 'evening'],
  ['sleep in bed', '😴', 'night'],
  ['see the moon and the stars', '🌙', 'night'],
  ['say "Good morning"', '🌅', 'morning'],
  ['hear the rooster crow', '🐓', 'morning'],
  ['get ready for school', '🚸', 'morning'],
  ['come back home from school', '🏠', 'afternoon'],
  ['eat a snack after school', '🍪', 'afternoon'],
  ['do our homework after school', '📚', 'afternoon'],
  ['see the sky turn orange', '🌆', 'evening'],
  ['watch the birds fly back to their nests', '🐦', 'evening'],
  ['play in the park as the sun sets', '🛝', 'evening'],
  ['say "Good night"', '🌃', 'night'],
  ['see the stars in the dark sky', '⭐', 'night'],
  ['switch off the light and go to bed', '🛏️', 'night'],
];
const PART_NAMES = ['morning', 'afternoon', 'evening', 'night'];
const parts: Gen = (c) => {
  const [act, e, part] = c.r.pick(PARTS);
  return mc(c, `${e}\nWhen do we ${act}?`, cap(part), PART_NAMES.filter((p) => p !== part).map(cap), `We ${act} in the ${part}.`);
};
const dayNight: Gen = (c) => {
  const [e, a] = c.r.pick([['☀️', 'Day'], ['🌙', 'Night'], ['🌞', 'Day'], ['🌜', 'Night'], ['⭐', 'Night'], ['🌃', 'Night'], ['🌄', 'Day']] as const);
  return mc(c, `${e}\nIs it day or night?`, a, [a === 'Day' ? 'Night' : 'Day'], a === 'Day' ? 'The sun shines in the day.' : 'The moon shines at night.');
};
const clockQ: Gen = (c) => {
  const h = c.r.int(1, 12);
  const wrong = near(h, 1, 12).map((m) => `${m} o'clock`);
  return mc(c, `${CLOCKS[h % 12]}\nWhat time is it?`, `${h} o'clock`, wrong, `The short hand points to ${h}.`);
};
const clockRev: Gen = (c) => {
  const h = c.r.int(1, 12);
  return mc(c, `Which clock shows ${h} o'clock?`, CLOCKS[h % 12]!, near(h, 1, 12).map((m) => CLOCKS[m % 12]!), `At ${h} o'clock the short hand points to ${h}.`);
};
const CLOCK_FACTS: Array<[string, boolean]> = [['A clock has 12 numbers.', true], ['A clock has 7 numbers.', false], ['A clock tells us the time.', true], ['The short hand shows the hour.', true], ['We use a clock to weigh things.', false]];
const clockFact: Gen = (c) => {
  if (c.r.int(0, 2) === 0) return mc(c, 'How many numbers are on a clock?', '12', ['10', '11'], 'A clock has numbers 1 to 12.');
  const [t, v] = c.r.pick(CLOCK_FACTS);
  return tfQ(c, t, v, v ? 'Yes, that is right.' : 'No, that is not right.');
};
const TIME_FACTS: Array<[string, boolean]> = [
  ['We sleep at night.', true], ['The sun shines at night.', false], ['We see the moon at night.', true], ['We go to school in the morning.', true],
  ['Breakfast is eaten in the morning.', true], ['The sun sets in the evening.', true], ['We see the stars in the day.', false], ['We eat lunch in the afternoon.', true],
  ['Night comes after the evening.', true], ['Morning comes after the night.', true],
];
const tfTime: Gen = (c) => {
  const [t, v] = c.r.pick(TIME_FACTS);
  return tfQ(c, t, v, v ? 'Yes, that is right.' : 'No, that is not right.');
};
const days: Gen = (c) => {
  const i = c.r.int(0, 6);
  const form = c.r.int(0, 3);
  if (form === 0) return mc(c, `What day comes after ${DAYS[i]}?`, DAYS[(i + 1) % 7]!, [DAYS[(i + 2) % 7]!, DAYS[(i + 6) % 7]!], `${DAYS[(i + 1) % 7]} comes after ${DAYS[i]}.`);
  if (form === 1) return mc(c, `What day comes before ${DAYS[i]}?`, DAYS[(i + 6) % 7]!, [DAYS[(i + 1) % 7]!, DAYS[(i + 5) % 7]!], `${DAYS[(i + 6) % 7]} comes before ${DAYS[i]}.`);
  if (form === 2) return mc(c, 'How many days are in a week?', '7', ['5', '6'], 'There are 7 days in a week.');
  return mc(c, `${DAYS[i]}, ?, ${DAYS[(i + 2) % 7]}\nWhich day is in the middle?`, DAYS[(i + 1) % 7]!, [DAYS[(i + 3) % 7]!, DAYS[(i + 5) % 7]!], `${DAYS[(i + 1) % 7]} is between them.`);
};
const ydt: Gen = (c) => {
  const i = c.r.int(0, 6);
  if (c.r.int(0, 1) === 0) return mc(c, `Today is ${DAYS[i]}. What is tomorrow?`, DAYS[(i + 1) % 7]!, [DAYS[(i + 6) % 7]!, DAYS[(i + 2) % 7]!], `Tomorrow is the next day.`);
  return mc(c, `Today is ${DAYS[i]}. What was yesterday?`, DAYS[(i + 6) % 7]!, [DAYS[(i + 1) % 7]!, DAYS[(i + 5) % 7]!], `Yesterday is the day before.`);
};
const months: Gen = (c) => {
  const i = c.r.int(0, 11);
  const form = c.r.int(0, 2);
  if (form === 0) return mc(c, `Which month comes after ${MONTHS[i]}?`, MONTHS[(i + 1) % 12]!, [MONTHS[(i + 2) % 12]!, MONTHS[(i + 11) % 12]!], `${MONTHS[(i + 1) % 12]} comes after ${MONTHS[i]}.`);
  if (form === 1) return mc(c, `Which month comes before ${MONTHS[i]}?`, MONTHS[(i + 11) % 12]!, [MONTHS[(i + 1) % 12]!, MONTHS[(i + 10) % 12]!], `${MONTHS[(i + 11) % 12]} comes before ${MONTHS[i]}.`);
  return mc(c, 'How many months are in a year?', '12', ['10', '7'], 'There are 12 months in a year.');
};

// ------------------------------------------------------------------------------------ money

const PRICED: Array<[string, string]> = [['a toffee', '🍬'], ['a pencil', '✏️'], ['an eraser', '🧽'], ['a balloon', '🎈'], ['a ball', '⚽']];
const coinSum: Gen = (c) => {
  const v = c.r.pick([1, 1, 2, 5]);
  const n = v === 1 ? c.r.int(2, 8) : v === 2 ? c.r.int(2, 5) : c.r.int(2, 3);
  return numQ(c, `${row('🪙', n)}\nEach coin is ${rupee(v)}. How much money is this?`, v * n, `${n} coins of ${rupee(v)} make ${rupee(v * n)}.`, 1, 25, 'mcq', rupee);
};
const cmpMoney: Gen = (c) => {
  const [a, b] = c.r.shuffle([1, 2, 5, 10]).slice(0, 2) as [number, number];
  return mc(c, `Which is worth more?\n${rupee(a)} or ${rupee(b)}`, rupee(Math.max(a, b)), [rupee(Math.min(a, b))], `${rupee(Math.max(a, b))} is worth more than ${rupee(Math.min(a, b))}.`);
};
const tfMoney: Gen = (c) => {
  const [a, b] = c.r.shuffle([1, 2, 5, 10]).slice(0, 2) as [number, number];
  const truth = c.r.int(0, 1) === 0;
  const [big, small] = [Math.max(a, b), Math.min(a, b)];
  const forms: Array<() => CourseQuestion> = [
    () => (truth ? tfQ(c, `${rupee(big)} is more than ${rupee(small)}.`, true, `${rupee(big)} is worth more.`) : tfQ(c, `${rupee(small)} is more than ${rupee(big)}.`, false, `${rupee(big)} is worth more.`)),
    () => tfQ(c, `We use money to buy things.`, true, 'We pay with money.'),
  ];
  return c.r.pick(forms)();
};
const spend: Gen = (c) => {
  const have = c.r.int(3, c.d === 'hard' ? 20 : 10);
  const s = c.r.int(1, have - 1);
  return numQ(c, `You have ${rupee(have)}. You spend ${rupee(s)}. How much is left?`, have - s, `${rupee(have)} − ${rupee(s)} = ${rupee(have - s)}.`, 0, have, 'word-problem', rupee);
};
const price: Gen = (c) => {
  const [[an, ae], [bn, be]] = c.r.shuffle(PRICED).slice(0, 2) as [[string, string], [string, string]];
  const pa = c.r.int(1, 9);
  let pb = c.r.int(1, 9);
  if (pb === pa) pb = pa === 9 ? 8 : pa + 1;
  const more = c.r.int(0, 1) === 0;
  const win = (more ? pa > pb : pa < pb) ? an : bn;
  return mc(c, `${ae} ${be}\n${cap(an)} costs ${rupee(pa)}. ${cap(bn)} costs ${rupee(pb)}. Which costs ${more ? 'more' : 'less'}?`, win, [win === an ? bn : an], `${rupee(Math.max(pa, pb))} is more than ${rupee(Math.min(pa, pb))}.`, 'word-problem');
};
const comboOf = (c: Ctx, sum: number): string => {
  const parts: number[] = [];
  let left = sum;
  while (left > 0) {
    const v = c.r.pick([1, 2, 5].filter((x) => x <= left));
    parts.push(v);
    left -= v;
  }
  return parts.sort((x, y) => y - x).map(rupee).join(' + ');
};
const makeAmt: Gen = (c) => {
  const t = c.r.int(4, 10);
  const ans = comboOf(c, t);
  const wrong = [comboOf(c, t + 1), comboOf(c, t - 1), comboOf(c, t + 2)];
  return mc(c, `Which coins make ${rupee(t)}?`, ans, wrong, `Add them up to get ${rupee(t)}.`);
};

// ------------------------------------------------------------------------------------ position & riddles

const ANIM = ['🐱', '🐶', '🐰', '🐻', '🐼', '🦁', '🐵', '🐸'];
const lineup: Gen = (c) => {
  const [a, b, d] = c.r.shuffle(ANIM) as [string, string, string];
  const form = c.arg === 'between' ? 1 : c.arg === 'lr' ? c.r.pick([0, 2]) : c.r.int(0, 2);
  const line = `${a} ${b} ${d}`;
  if (form === 0) return mc(c, `${line}\nWho is on the left?`, a, [b, d], 'We look from left to right.');
  if (form === 1) return mc(c, `${line}\nWho is in the middle?`, b, [a, d], 'The middle one is between the other two.');
  return mc(c, `${line}\nWho is on the right?`, d, [a, b], 'The last one is on the right.');
};
const POS: Array<[string, boolean]> = [
  ['The sun is above the ground.', true], ['A fish swims under the water.', true], ['A bird in the sky is above us.', true], ['The floor is above the table.', false], ['The roof is below the floor.', false],
  ['We read from left to right.', true], ['Your right hand is on your right side.', true],
];
const tfPos: Gen = (c) => {
  const pool = c.arg === 'lr' ? POS.slice(5) : c.arg === 'ab' ? POS.slice(0, 5) : POS;
  const [t, v] = c.r.pick(pool);
  return tfQ(c, t, v, v ? 'Yes, that is right.' : 'No, that is not right.');
};
const riddle: Gen = (c) => {
  const kind = c.arg === 'shape' ? 'shape' : c.arg || c.r.pick(['between', 'more', 'less']);
  if (kind === 'shape') {
    const R: Array<[string, string]> = [['I have 3 sides. Who am I?', 'Triangle'], ['I am round. I have no corners. Who am I?', 'Circle'], ['I have 4 equal sides. Who am I?', 'Square']];
    const [t, a] = c.r.pick(R);
    return mc(c, t, a, ['Circle', 'Square', 'Triangle'].filter((x) => x !== a), `I am a ${a.toLowerCase()}.`);
  }
  const top = Math.max(c.hi, 5);
  if (kind === 'between') {
    const a = c.r.int(Math.max(1, c.lo), top - 2);
    return numQ(c, `I am a number.\nI come after ${a}.\nI come before ${a + 2}.\nWho am I?`, a + 1, `${a + 1} is between ${a} and ${a + 2}.`, 0, top);
  }
  const n = c.r.int(2, Math.min(top, 9));
  const k = c.r.int(1, 3);
  if (kind === 'more') return numQ(c, `I am ${k} more than ${n}. Who am I?`, n + k, `${n} + ${k} = ${n + k}.`, 0, top + 4);
  return numQ(c, `I am ${Math.min(k, n - 1)} less than ${n}. Who am I?`, n - Math.min(k, n - 1), `${n} − ${Math.min(k, n - 1)} = ${n - Math.min(k, n - 1)}.`, 0, top);
};

// ------------------------------------------------------------------------------------ registry

const GENS: Record<string, Gen> = {
  count, matchQty, missing, ba, between, cmp, cmpGroups, order, skip, name, tens, zero, oneMore, oneLess,
  addObj, addEq, missAdd, subObj, subEq, fam, doubles, makeTen, mental, repAdd, groups, share,
  addStory, subStory, mixStory, twoStep, tf, nline,
  shapeName, shapeSides, shapeObj, odd: oddShape, oddCat, shapeCount, tfShape,
  pattern, patNum, sortCount, pictograph,
  measure, tfMeasure, parts, dayNight, tfTime, clock: clockQ, clockRev, clockFact, days, ydt, months,
  coinSum, cmpMoney, tfMoney, spend, price, makeAmt, lineup, tfPos, riddle,
};
export const KIND_NAMES = Object.keys(GENS);

// ------------------------------------------------------------------------------------ plan → questions

/** "kind,kind:arg@lo-hi#arg": the kinds a lesson draws on, its number range, and a lesson-wide argument. */
export interface LessonSpec {
  kinds: Array<{ kind: string; arg: string | null }>;
  lo: number;
  hi: number;
  arg: string;
}
export function parseSpec(spec: string): LessonSpec {
  const [rest = '', lessonArg = ''] = spec.split('#');
  const [head, range = ''] = rest.split('@');
  const [lo, hi] = range ? range.split('-').map(Number) : [1, 10];
  const kinds = head!.split(',').map((k) => {
    const [kind, arg] = k.split(':');
    return { kind: kind!.trim(), arg: arg ?? null };
  });
  return { kinds, lo: lo ?? 1, hi: hi ?? 10, arg: lessonArg };
}

export interface BankQuestion extends CourseQuestion {
  /** Which generator made it (for reports); never stored. */
  kind: string;
}

/**
 * New questions for one lesson: `easy`, `medium`, `hard` counts per target (questions / practice),
 * different from each other and from every prompt in `seen` (which grows as questions are taken).
 */
export function lessonBank(spec: string, seed: string, want: { questions: Difficulty[]; practice: Difficulty[] }, seen: Set<string>): { questions: BankQuestion[]; practice: BankQuestion[] } {
  const s = parseSpec(spec);
  const r = rng(seed);
  const order = r.shuffle(s.kinds);
  let turn = 0;
  const make = (d: Difficulty): BankQuestion | null => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const k = order[(turn + attempt) % order.length]!;
      const gen = GENS[k.kind];
      if (!gen) throw new Error(`mathBank: unknown kind "${k.kind}" in "${spec}"`);
      const q = gen({ r, lo: s.lo, hi: s.hi, d, arg: k.arg ?? s.arg });
      if (!q) continue;
      const key = q.prompt.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      turn += attempt + 1;
      return { ...q, kind: k.kind };
    }
    return null;
  };
  const take = (ds: Difficulty[]) => ds.map(make).filter((q): q is BankQuestion => q !== null);
  return { questions: take(want.questions), practice: take(want.practice) };
}
