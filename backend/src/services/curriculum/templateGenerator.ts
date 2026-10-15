import { DOMAINS, defaultDomains, domainById, type ChapterSpec, type Domain, type NumberKind, type Topic } from './topics';
import type {
  ChapterDifficulty,
  ClassBrief,
  CurriculumGenerator,
  GeneratedActivity,
  GeneratedChapter,
  GeneratedQuestion,
  SubjectRequest,
  SubjectSuggestion,
} from './types';

/**
 * The default curriculum generator: deterministic, offline, free. It reads what the administrator
 * wrote (title, descriptions, learning goal) together with the class number, curriculum type,
 * language and difficulty, matches it against the subject library (topics.ts), and builds chapters
 * whose lessons, practice and quizzes are generated from each chapter's own outline and key terms.
 * The same brief always gives the same result.
 */

// ------------------------------------------------------------------------------------ text analysis

const LATIN = /^[\x20-\x7e]+$/;

/** Where a keyword first appears in the text (whole words for English, substring for Hindi), or -1. */
function findKeyword(text: string, keyword: string): number {
  if (!LATIN.test(keyword)) return text.indexOf(keyword);
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).exec(text);
  return match ? match.index + match[1]!.length : -1;
}

interface Hit {
  index: number;
  matched: string[];
}

interface Analysis {
  domains: Map<string, Hit>;
  topics: Map<string, Hit & { domain: string }>;
}

function analyse(text: string): Analysis {
  const domains = new Map<string, Hit>();
  const topics = new Map<string, Hit & { domain: string }>();
  const note = (map: Map<string, Hit>, id: string, keyword: string, index: number) => {
    const hit = map.get(id) ?? { index, matched: [] };
    hit.index = Math.min(hit.index, index);
    if (!hit.matched.includes(keyword)) hit.matched.push(keyword);
    map.set(id, hit);
  };
  for (const domain of DOMAINS) {
    for (const kw of domain.keywords) {
      const at = findKeyword(text, kw);
      if (at >= 0) note(domains, domain.id, kw, at);
    }
    for (const topic of domain.topics) {
      for (const kw of topic.keywords) {
        const at = findKeyword(text, kw);
        if (at < 0) continue;
        note(domains, domain.id, kw, at);
        const hit = topics.get(topic.id) ?? { index: at, matched: [], domain: domain.id };
        hit.index = Math.min(hit.index, at);
        if (!hit.matched.includes(kw)) hit.matched.push(kw);
        topics.set(topic.id, hit);
      }
    }
  }
  return { domains, topics };
}

const briefText = (b: ClassBrief) => [b.title, b.subtitle, b.description, b.details, b.learningGoal].filter(Boolean).join(' \n ').toLowerCase();

// ------------------------------------------------------------------------------------ levels

function chapterDifficulty(b: ClassBrief): ChapterDifficulty {
  switch (b.difficulty) {
    case 'beginner':
    case 'elementary':
      return 'easy';
    case 'intermediate':
      return 'medium';
    case 'advanced':
      return 'hard';
    default:
      return b.classLevel <= 2 ? 'easy' : b.classLevel <= 7 ? 'medium' : 'hard';
  }
}

/** How many chapters a whole-subject course gets. */
function chapterLimit(b: ClassBrief): number {
  switch (b.difficulty) {
    case 'beginner':
      return 5;
    case 'elementary':
      return 6;
    case 'advanced':
      return 10;
    case 'intermediate':
      return 8;
    default:
      return b.classLevel <= 2 ? 5 : b.classLevel <= 5 ? 6 : 8;
  }
}

const inRange = (c: ChapterSpec, level: number) => (c.min ?? 1) <= level && level <= (c.max ?? 12);
const distance = (c: ChapterSpec, level: number) => Math.max((c.min ?? 1) - level, level - (c.max ?? 12), 0);

/** A topic's chapters for this class: those in range, or the nearest one if none are. */
function topicChapters(topic: Topic, level: number): ChapterSpec[] {
  const fit = topic.chapters.filter((c) => inRange(c, level));
  if (fit.length) return fit;
  const nearest = [...topic.chapters].sort((a, b) => distance(a, level) - distance(b, level))[0];
  return nearest ? [nearest] : [];
}

// ------------------------------------------------------------------------------------ subjects

type SubjectSource = { kind: 'domain'; domain: Domain; title: string } | { kind: 'topic'; domain: Domain; topic: Topic };

const DEFAULT_TOPICS = (domain: Domain, level: number) => domain.topics.filter((t) => t.chapters.some((c) => inRange(c, level))).slice(0, 5);

function subjectSources(brief: ClassBrief, a: Analysis): { sources: SubjectSource[]; why: (s: SubjectSource) => string } {
  const level = brief.classLevel;
  const type = brief.curriculumType ?? 'general';
  const domainTitle = (d: Domain) => (d.id === 'social' && level <= 5 ? 'Social Studies' : d.name);
  const asDomain = (d: Domain): SubjectSource => ({ kind: 'domain', domain: d, title: domainTitle(d) });
  const detectedDomains = [...a.domains.entries()].sort((x, y) => x[1].index - y[1].index).map(([id]) => domainById(id)!);
  const topicsIn = (d: Domain) =>
    [...a.topics.entries()]
      .filter(([, h]) => h.domain === d.id)
      .sort((x, y) => x[1].index - y[1].index)
      .map(([id]) => d.topics.find((t) => t.id === id)!);

  const typeDomain: Record<string, string | undefined> = { mathematics: 'math', science: 'science' };
  const focusId = typeDomain[type];
  const only = detectedDomains.length === 1 ? detectedDomains[0]! : null;
  const focusDomain =
    only && (topicsIn(only).length >= 2 || only.id === focusId)
      ? only
      : focusId && detectedDomains.every((d) => d.id === focusId)
        ? domainById(focusId)!
        : null;

  let sources: SubjectSource[];
  if (focusDomain) {
    // A class about one area: its topics become the subjects (e.g. Science → Energy, Environment…).
    let topics = topicsIn(focusDomain);
    if (topics.length < 2) topics = [...topics, ...DEFAULT_TOPICS(focusDomain, level).filter((t) => !topics.includes(t))].slice(0, 5);
    sources = [...(focusDomain.keepWhenFocused ? [asDomain(focusDomain)] : []), ...topics.map((topic): SubjectSource => ({ kind: 'topic', domain: focusDomain, topic }))];
  } else if (detectedDomains.length) {
    sources = detectedDomains.map(asDomain);
  } else {
    const byType: Record<string, string[] | null> = {
      language: ['english', 'hindi'],
      competitive: ['math', 'reasoning', 'science', 'english', 'gk'],
      skills: ['computer', 'english:communication', 'math:problem-solving', 'gk'],
    };
    const ids = byType[type] ?? defaultDomains(level);
    sources = ids.map((id) => {
      const [d, t] = id.split(':');
      const domain = domainById(d!)!;
      const topic = t ? domain.topics.find((x) => x.id === t) : undefined;
      return topic ? { kind: 'topic', domain, topic } : asDomain(domain);
    });
  }

  // Language: an English-only class leaves Hindi out unless it was asked for; a Hindi class starts with it.
  const hindiAsked = a.domains.has('hindi');
  if (brief.language === 'english' && !hindiAsked) sources = sources.filter((s) => s.domain.id !== 'hindi');
  if (brief.language === 'hindi' || brief.language === 'bilingual') {
    if (!sources.some((s) => s.domain.id === 'hindi') && (brief.language === 'bilingual' || !detectedDomains.length || type === 'language')) {
      sources.push(asDomain(domainById('hindi')!));
    }
    if (brief.language === 'hindi') sources.sort((x, y) => Number(y.domain.id === 'hindi') - Number(x.domain.id === 'hindi'));
  }
  if (brief.language === 'bilingual' && !sources.some((s) => s.domain.id === 'english') && type === 'language') sources.unshift(asDomain(domainById('english')!));

  const why = (s: SubjectSource) => {
    const hit = s.kind === 'topic' ? a.topics.get(s.topic.id) : a.domains.get(s.domain.id);
    if (hit?.matched.length) return `Found in your description: ${hit.matched.slice(0, 4).join(', ')}`;
    if (focusDomain && s.kind === 'topic') return `Core ${focusDomain.name.toLowerCase()} topic for Class ${level}`;
    if (type !== 'general' && type !== 'custom' && !detectedDomains.length) return `Part of a ${CURRICULUM_LABEL[type] ?? type} curriculum`;
    return `Recommended for Class ${level}`;
  };
  return { sources: sources.slice(0, 8), why };
}

const CURRICULUM_LABEL: Record<string, string> = {
  mathematics: 'Mathematics Focus',
  science: 'Science Focus',
  language: 'Language Focus',
  competitive: 'Competitive Learning',
  skills: 'Skill Development',
};

const keyOf = (s: SubjectSource) => (s.kind === 'domain' ? s.domain.key : s.topic.id);
const titleOf = (s: SubjectSource) => (s.kind === 'domain' ? s.title : s.topic.name);

/** A subject the administrator named: matched to the library by its key or its words, if possible. */
function resolveSubject(req: SubjectRequest): SubjectSource | null {
  for (const domain of DOMAINS) {
    if (domain.key === req.key) return { kind: 'domain', domain, title: req.title };
    const topic = domain.topics.find((t) => t.id === req.key);
    if (topic) return { kind: 'topic', domain, topic };
  }
  const a = analyse(req.title.toLowerCase());
  const [topicId, topicHit] = [...a.topics.entries()].sort((x, y) => x[1].index - y[1].index)[0] ?? [];
  const domainHits = [...a.domains.entries()].sort((x, y) => x[1].index - y[1].index);
  // "Mathematics" names the whole domain; "Physics" or "Fractions" name a topic inside one.
  // A topic match ("Biology & Life Science") is more specific than a domain word inside it ("science"),
  // unless the name is just the domain's own ("Science", "Maths").
  const lower = req.title.toLowerCase().trim();
  const domainNamed = domainHits.find(([id]) => domainById(id)!.keywords.some((k) => findKeyword(lower, k) >= 0));
  const isDomainName = Boolean(domainNamed && (domainById(domainNamed[0])!.keywords.includes(lower) || domainById(domainNamed[0])!.name.toLowerCase() === lower));
  if (domainNamed && (isDomainName || !topicId)) return { kind: 'domain', domain: domainById(domainNamed[0])!, title: req.title };
  if (topicId && topicHit) {
    const domain = domainById(topicHit.domain)!;
    return { kind: 'topic', domain, topic: domain.topics.find((t) => t.id === topicId)! };
  }
  return null;
}

/** The chapter outlines a subject gets for this class, before they are written out. */
function chapterSpecs(brief: ClassBrief, source: SubjectSource | null, a: Analysis, limit?: number): ChapterSpec[] {
  if (!source) return [];
  const level = brief.classLevel;
  if (source.kind === 'topic') return topicChapters(source.topic, level).slice(0, limit ?? 12);
  // A whole subject: one chapter per topic in turn (topics the brief mentions first), then back in
  // the library's teaching order, so the course covers the subject evenly.
  const max = limit ?? chapterLimit(brief);
  const mentioned = new Set([...a.topics.entries()].filter(([, h]) => h.domain === source.domain.id).map(([id]) => id));
  const topics = [...source.domain.topics].sort((x, y) => Number(mentioned.has(y.id)) - Number(mentioned.has(x.id)));
  // Only chapters meant for this class; within a topic, those best centred on this class first.
  const centre = (c: ChapterSpec) => Math.abs(((c.min ?? 1) + (c.max ?? 12)) / 2 - level);
  const pools = topics.map((t) => t.chapters.filter((c) => inRange(c, level)).sort((x, y) => centre(x) - centre(y)));
  const picked = new Set<ChapterSpec>();
  for (let round = 0; picked.size < max && pools.some((p) => p.length > round); round++) {
    for (const pool of pools) {
      if (picked.size >= max) break;
      if (pool[round]) picked.add(pool[round]!);
    }
  }
  const order = source.domain.topics.flatMap((t) => t.chapters);
  return [...picked].sort((x, y) => order.indexOf(x) - order.indexOf(y));
}

/** Outlines for a subject the library doesn't know (e.g. "Art"): a sound, editable starting point. */
function genericSpecs(title: string, level: number): ChapterSpec[] {
  const t = title.trim();
  const lower = t.toLowerCase();
  const terms: Array<[string, string]> = [
    [t, `the subject this course is about`],
    ['practice', `doing something again and again to get better at ${lower}`],
    ['project', `a piece of work that brings together what we learned in ${lower}`],
    ['review', `looking back at what we learned`],
  ];
  const base = [
    { title: `Introduction to ${t}`, about: `What ${lower} is and why it matters.`, objective: `explain what ${lower} is about`, lessons: [`What is ${t}?`, `${t} Around Us`, `Getting Started`] },
    { title: `Key Ideas in ${t}`, about: `The main ideas and words used in ${lower}.`, objective: `use the key words of ${lower} correctly`, lessons: ['Important Words', 'Main Ideas', 'Examples'] },
    { title: `${t} in Daily Life`, about: `Where ${lower} appears in everyday life.`, objective: `connect ${lower} to everyday situations`, lessons: ['At Home', 'At School', 'In the Community'] },
    { title: `Practice and Projects`, about: `Applying ${lower} in small projects.`, objective: `complete a small ${lower} project`, lessons: ['Planning a Project', 'Doing the Project', 'Sharing Our Work'] },
    { title: `Review and Reflection`, about: `Bringing together what was learned.`, objective: `review the main ideas of ${lower}`, lessons: ['What We Learned', 'Questions and Answers', 'Next Steps'] },
  ];
  return base.slice(0, level <= 2 ? 4 : 5).map((c) => ({ ...c, terms }));
}

// ------------------------------------------------------------------------------------ randomness

/** A small seeded random generator, so a brief always produces the same practice questions. */
function rng(seed: string) {
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
type Rng = ReturnType<typeof rng>;

// ------------------------------------------------------------------------------------ numbers

const NAMES = ['Riya', 'Aarav', 'Meera', 'Kabir', 'Anaya', 'Ishaan', 'Sara', 'Vivaan'];
const THINGS = ['pencils', 'apples', 'stickers', 'marbles', 'books', 'flowers', 'balloons', 'coins'];

/** One numeric question of this kind, sized for the class level. */
function numberQuestion(kind: NumberKind, level: number, r: Rng): GeneratedQuestion {
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

// ------------------------------------------------------------------------------------ writing chapters

const TIP: Record<ChapterDifficulty, [string, string]> = {
  easy: ['Use pictures, objects and everyday examples, one small step at a time.', 'चित्रों, वस्तुओं और रोज़ के उदाहरणों से छोटे-छोटे कदमों में सीखें।'],
  medium: ['Try examples from daily life and explain your thinking in your own words.', 'रोज़ के जीवन के उदाहरण लें और अपने शब्दों में समझाएँ।'],
  hard: ['Apply the idea to new problems and explain each step of your reasoning.', 'इस विचार को नए प्रश्नों पर लागू करें और हर कदम समझाएँ।'],
};

const sentence = (s: string) => {
  const t = s.trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
};

function writeChapter(spec: ChapterSpec, brief: ClassBrief, difficulty: ChapterDifficulty, hindi: boolean, seed: string): GeneratedChapter {
  const r = rng(seed);
  const terms = spec.terms;
  const lessons = spec.lessons.map((title, i) => {
    const [term, meaning] = terms[i % terms.length]!;
    const body = hindi
      ? `${spec.about} इस पाठ "${title}" में विद्यार्थी उदाहरणों, गतिविधियों और प्रश्नों के साथ सीखेंगे। मुख्य शब्द — "${term}": ${meaning}। ${TIP[difficulty][1]}`
      : `${spec.about} In "${title}", learners explore the idea through short explanations, worked examples and questions. Key word — "${term}": ${meaning}. ${TIP[difficulty][0]}`;
    return { title, body };
  });

  const meanings = terms.map(([, m]) => m);
  const words = terms.map(([t]) => t);
  const activities: GeneratedActivity[] = [
    {
      type: 'multiple-choice',
      title: hindi ? 'सही शब्द चुनिए' : 'Choose the Right Word',
      instructions: hindi ? 'हर अर्थ के लिए सही शब्द चुनिए।' : 'Pick the word that matches each meaning.',
      questions: terms.map(([term, meaning]) => ({ prompt: hindi ? `"${meaning}" — यह किस शब्द का अर्थ है?` : `Which word means "${meaning}"?`, options: r.shuffle(words), answer: term })),
    },
    {
      type: 'fill-blank',
      title: hindi ? 'रिक्त स्थान भरिए' : 'Fill in the Blanks',
      instructions: hindi ? 'सही शब्द से रिक्त स्थान भरिए।' : 'Complete each sentence with the right key word.',
      questions: r.shuffle(terms).map(([term, meaning]) => ({ prompt: hindi ? `${meaning} को ______ कहते हैं।` : `${sentence(meaning)} is called ______.`, options: [], answer: term })),
    },
    {
      type: 'match-pair',
      title: hindi ? 'सही जोड़ी मिलाइए' : 'Match the Pairs',
      instructions: hindi ? 'हर शब्द को उसके सही अर्थ से मिलाइए।' : 'Match each word with its meaning.',
      questions: terms.map(([term, meaning]) => ({ prompt: term, options: r.shuffle(meanings), answer: meaning })),
    },
  ];
  if (spec.numbers) {
    activities.push({
      type: 'number-problems',
      title: 'Number Problems',
      instructions: 'Work out each answer. Show your working where you can.',
      questions: Array.from({ length: 5 }, () => numberQuestion(spec.numbers!, brief.classLevel, r)),
    });
  }

  // The quiz: meaning questions, true/false checks and (in maths) fresh number questions.
  const quizSize = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 8 : 10;
  const pool: GeneratedQuestion[] = [];
  terms.forEach(([term, meaning], i) => {
    pool.push({ prompt: hindi ? `"${term}" का अर्थ क्या है?` : `What does "${term}" mean?`, options: r.shuffle(meanings), answer: meaning });
    const other = terms[(i + 1) % terms.length]![1];
    const truthful = i % 2 === 0;
    pool.push({
      prompt: hindi ? `सही या गलत: "${term}" का अर्थ है — ${truthful ? meaning : other}।` : `True or false: "${term}" means ${truthful ? meaning : other}.`,
      options: hindi ? ['सही', 'गलत'] : ['True', 'False'],
      answer: hindi ? (truthful ? 'सही' : 'गलत') : truthful ? 'True' : 'False',
    });
  });
  if (spec.numbers) for (let i = 0; i < 4; i++) pool.push(numberQuestion(spec.numbers, brief.classLevel, r));
  const quiz = r.shuffle(pool).slice(0, quizSize);

  const lessonMinutes = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 12 : 15;
  const objectives = hindi
    ? [`विद्यार्थी ${spec.objective}।`, `विद्यार्थी मुख्य शब्दों का प्रयोग करें: ${words.join(', ')}।`, `विद्यार्थी अभ्यास और छोटी प्रश्नोत्तरी से "${spec.title}" दोहराएँ।`]
    : [`Students ${spec.objective}.`, `Students use the key words ${words.join(', ')} correctly.`, `Students practise ${spec.title.toLowerCase()} through activities and a short quiz.`];

  return {
    title: spec.title,
    description: spec.about,
    objectives,
    estimatedMinutes: lessons.length * lessonMinutes + activities.length * 8 + 10,
    difficulty,
    lessons,
    activities,
    quiz,
  };
}

// ------------------------------------------------------------------------------------ the generator

export class TemplateCurriculumGenerator implements CurriculumGenerator {
  readonly name = 'template';

  async suggestSubjects(brief: ClassBrief): Promise<SubjectSuggestion[]> {
    const a = analyse(briefText(brief));
    const { sources, why } = subjectSources(brief, a);
    const difficulty = chapterDifficulty(brief);
    const seen = new Set<string>();
    const out: SubjectSuggestion[] = [];
    for (const s of sources) {
      const key = keyOf(s);
      if (seen.has(key)) continue;
      seen.add(key);
      const chapters = await this.buildChapters(brief, { key, title: titleOf(s), difficulty });
      out.push({
        key,
        title: titleOf(s),
        description: s.kind === 'domain' ? s.domain.description : s.topic.description,
        glyph: s.kind === 'domain' ? s.domain.glyph : s.topic.glyph,
        difficulty,
        estimatedMinutes: chapters.reduce((n, c) => n + c.estimatedMinutes, 0),
        chapterCount: chapters.length,
        activityCount: chapters.reduce((n, c) => n + c.activities.length, 0),
        reason: why(s),
      });
    }
    return out;
  }

  async buildChapters(brief: ClassBrief, subject: SubjectRequest): Promise<GeneratedChapter[]> {
    const a = analyse(briefText(brief));
    const source = resolveSubject(subject);
    const difficulty = subject.difficulty ?? chapterDifficulty(brief);
    const specs = source ? chapterSpecs(brief, source, a, subject.chapterCount) : genericSpecs(subject.title, brief.classLevel);
    const hindi = Boolean(source?.domain.hindi);
    const list = subject.chapterCount ? specs.slice(0, subject.chapterCount) : specs;
    return list.map((spec, i) => writeChapter(spec, brief, difficulty, hindi, `${brief.classLevel}:${subject.key}:${i}:${spec.title}`));
  }
}
