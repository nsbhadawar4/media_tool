import { DOMAINS, type ChapterSpec, type NumberKind } from './topics';
import { numberQuestion, rng, type Rng } from './templateKit';
import * as L from './contentLibrary';
import type { CourseBrief, CourseChapter, CourseLesson, CourseOutline, CourseQuestion, Difficulty } from './course';

/**
 * The template course generator: offline, free and deterministic (the same brief gives the same
 * course). It is the fallback when no AI provider is configured, and its output is labelled as
 * template-generated, never as AI.
 *
 * It writes from real material, not filler: Hindi and English chapters are built from the word
 * lists in contentLibrary.ts (स्वर, व्यंजन, मात्राएँ, शब्द, phonics, opposites, tenses…), maths
 * lessons from worked examples and freshly computed questions, and other subjects from the topic
 * library's own outlines and key-term definitions. Every answer is checked by construction.
 */

type Builder = (part: number, parts: number, r: Rng, ctx: Ctx) => Material;
interface Ctx {
  level: number;
  difficulty: Difficulty;
  hindi: boolean;
}
interface Material {
  explanation: string;
  examples: string[];
  keyPoints: string[];
  /** Plenty of questions to choose from (deduplicated by prompt when picked). */
  pool: CourseQuestion[];
}
interface PlanChapter {
  title: string;
  description: string;
  objectives: string[];
  lessons: string[];
  build: Builder;
}

// ------------------------------------------------------------------------------------ question helpers

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
function mcq(prompt: string, answer: string, distractors: string[], r: Rng, d: Difficulty, explanation = ''): CourseQuestion {
  const options = r.shuffle(uniq([answer, ...r.shuffle(uniq(distractors).filter((x) => x !== answer)).slice(0, 3)]));
  return { type: 'mcq', prompt, options, answer, difficulty: d, explanation };
}
function tf(prompt: string, truth: boolean, hindi: boolean, d: Difficulty, explanation = ''): CourseQuestion {
  const [t, f] = hindi ? ['सही', 'गलत'] : ['True', 'False'];
  return { type: 'true-false', prompt, options: [t, f], answer: truth ? t : f, difficulty: d, explanation };
}
const fill = (prompt: string, answer: string, d: Difficulty, explanation = ''): CourseQuestion => ({ type: 'fill-blank', prompt, options: [], answer, difficulty: d, explanation });
const short = (prompt: string, answer: string, d: Difficulty, explanation = ''): CourseQuestion => ({ type: 'short-answer', prompt, options: [], answer, difficulty: d, explanation });
function match(prompt: string, answer: string, options: string[], r: Rng, d: Difficulty, explanation = ''): CourseQuestion {
  return { type: 'match', prompt, options: r.shuffle(uniq([answer, ...options.filter((o) => o !== answer)]).slice(0, 4)), answer, difficulty: d, explanation };
}

/** The part of a list a lesson covers (lesson 2 of 3 gets the middle third); the whole list for extra practice lessons. */
function slice<T>(xs: T[], part: number, parts: number): T[] {
  if (part >= parts) return xs;
  const size = Math.ceil(xs.length / parts);
  const out = xs.slice(part * size, part * size + size);
  return out.length ? out : xs;
}

/** Questions on pairs (a ↔ b): several kinds per pair, so even a short list gives enough. */
function pairPool(items: L.Pair[], all: L.Pair[], r: Rng, d: Difficulty, hindi: boolean, say: {
  ab: (p: L.Pair) => string;
  ba?: (p: L.Pair) => string;
  blank?: (p: L.Pair) => string;
  truth: (a: string, b: string) => string;
  why?: (p: L.Pair) => string;
}): CourseQuestion[] {
  const bs = all.map((p) => p.b);
  const as = all.map((p) => p.a);
  return items.flatMap((p, i) => {
    const other = all[(all.indexOf(p) + 1 + i) % all.length]!;
    const why = say.why?.(p) ?? '';
    return [
      mcq(say.ab(p), p.b, bs, r, d, why),
      ...(say.ba ? [mcq(say.ba(p), p.a, as, r, d, why)] : []),
      ...(say.blank ? [fill(say.blank(p), p.b, d, why)] : []),
      tf(say.truth(p.a, p.b), true, hindi, d, why),
      ...(other.b !== p.b ? [tf(say.truth(p.a, other.b), false, hindi, d, why)] : []),
      match(p.a, p.b, bs, r, d, why),
    ];
  });
}

// ------------------------------------------------------------------------------------ Hindi

const H = (title: string, description: string, objectives: string[], lessons: string[], build: Builder): PlanChapter => ({ title, description, objectives, lessons, build });

const swar: Builder = (part, parts, r, { difficulty: d }) => {
  const items = slice(L.SWAR, part, parts);
  return {
    explanation: `हिंदी वर्णमाला में ग्यारह स्वर हैं: ${L.SWAR.map((s) => s.a).join(' ')}। स्वर अपने आप बोले जाते हैं — इन्हें बोलने के लिए किसी और वर्ण की ज़रूरत नहीं होती। इस पाठ में हम ये स्वर पहचानेंगे: ${items.map((s) => s.a).join(', ')}। हर स्वर से एक शब्द बनता है, जैसे "${items[0]!.a}" से "${items[0]!.b}"।`,
    examples: items.slice(0, 4).map((s) => `${s.a} से ${s.b}`),
    keyPoints: ['हिंदी में ग्यारह स्वर हैं।', 'स्वर अपने आप बोले जाते हैं।', `इस पाठ के स्वर: ${items.map((s) => s.a).join(', ')}`],
    pool: pairPool(items, L.SWAR, r, d, true, {
      ab: (p) => `"${p.a}" से कौन-सा शब्द शुरू होता है?`,
      ba: (p) => `"${p.b}" किस स्वर से शुरू होता है?`,
      blank: (p) => `${p.a} से ____`,
      truth: (a, b) => `"${b}" शब्द "${a}" से शुरू होता है।`,
      why: (p) => `"${p.b}" का पहला वर्ण "${p.a}" है।`,
    }).concat(items.map((s) => tf(`"${s.a}" एक स्वर है।`, true, true, d)), [tf('"क" एक स्वर है।', false, true, d, '"क" एक व्यंजन है।')]),
  };
};

const vyanjan: Builder = (part, parts, r, { difficulty: d }) => {
  const groups = slice(L.VYANJAN_GROUPS, part, parts);
  const items = groups.flatMap((g) => g.letters);
  return {
    explanation: `व्यंजन वे वर्ण हैं जो स्वर की सहायता से बोले जाते हैं — जैसे "क" में "अ" की ध्वनि मिली होती है (क् + अ = क)। व्यंजन वर्गों में रखे जाते हैं। इस पाठ में: ${groups.map((g) => `${g.name} (${g.letters.map((l) => l.a).join(' ')})`).join('; ')}।`,
    examples: items.slice(0, 4).map((v) => `${v.a} से ${v.b}`),
    keyPoints: ['व्यंजन स्वर की सहायता से बोले जाते हैं।', 'व्यंजन वर्गों में रखे जाते हैं।', ...groups.map((g) => `${g.name}: ${g.letters.map((l) => l.a).join(' ')}`)].slice(0, 5),
    pool: pairPool(items, L.VYANJAN, r, d, true, {
      ab: (p) => `"${p.a}" से कौन-सा शब्द शुरू होता है?`,
      ba: (p) => `"${p.b}" किस व्यंजन से शुरू होता है?`,
      blank: (p) => `${p.a} से ____`,
      truth: (a, b) => `"${b}" शब्द "${a}" से शुरू होता है।`,
      why: (p) => `"${p.b}" का पहला वर्ण "${p.a}" है।`,
    }).concat(items.map((v) => tf(`"${v.a}" एक व्यंजन है।`, true, true, d)), [tf('"आ" एक व्यंजन है।', false, true, d, '"आ" एक स्वर है।')]),
  };
};

const matra: Builder = (part, parts, r, { difficulty: d }) => {
  const items = slice(L.MATRAS, part, parts);
  const signs = L.MATRAS.map((m) => m.sign);
  return {
    explanation: `जब कोई स्वर किसी व्यंजन के साथ मिलता है तो वह मात्रा के रूप में लिखा जाता है। जैसे क + आ = का (आ की मात्रा "ा")। इस पाठ की मात्राएँ: ${items.map((m) => `${m.swar} → "${m.sign}"`).join(', ')}।`,
    examples: items.map((m) => `क + ${m.swar} = ${m.withKa} (जैसे "${m.word}")`).slice(0, 4),
    keyPoints: ['स्वर व्यंजन के साथ मात्रा बनकर लिखा जाता है।', '"अ" की कोई मात्रा नहीं होती।', ...items.slice(0, 3).map((m) => `${m.swar} की मात्रा: ${m.sign}`)],
    pool: items.flatMap((m) => [
      mcq(`"${m.swar}" की मात्रा कौन-सी है?`, m.sign, signs, r, d, `"${m.swar}" की मात्रा "${m.sign}" है।`),
      fill(`क + ${m.swar} = ____`, m.withKa, d),
      mcq(`"${m.word}" शब्द में कौन-सी मात्रा है?`, m.sign, signs, r, d),
      tf(`क + ${m.swar} = ${m.withKa}`, true, true, d),
      match(m.swar, m.sign, signs, r, d),
    ]),
  };
};

function wordsBuilder(list: L.Pair[], letters: number): Builder {
  return (part, parts, r, { difficulty: d }) => {
    const items = slice(list, part, parts);
    const other = letters === 2 ? L.HINDI_WORDS_3 : L.HINDI_WORDS_2;
    return {
      explanation: `अक्षरों को जोड़कर शब्द बनते हैं। ${letters} अक्षर वाले शब्द, जैसे ${items.slice(0, 3).map((w) => `${[...splitAkshar(w.a)].join(' + ')} = ${w.a}`).join('; ')}। हर शब्द को धीरे-धीरे, अक्षर-अक्षर पढ़ें।`,
      examples: items.slice(0, 4).map((w) => `${splitAkshar(w.a).join(' + ')} = ${w.a} (${w.b})`),
      keyPoints: ['अक्षरों को जोड़कर शब्द बनते हैं।', `इन शब्दों में ${letters} अक्षर हैं।`, 'शब्द को अक्षर-अक्षर पढ़ें, फिर पूरा बोलें।'],
      pool: items.flatMap((w) => [
        fill(`अक्षर जोड़िए: ${splitAkshar(w.a).join(' + ')} = ____`, w.a, d),
        mcq(`इनमें से ${letters} अक्षर वाला शब्द कौन-सा है?`, w.a, other.map((o) => o.a), r, d),
        short(`"${w.a}" में कितने अक्षर हैं?`, String(letters), d),
        tf(`"${w.a}" में ${letters} अक्षर हैं।`, true, true, d),
        mcq(`"${w.a}" का पहला अक्षर कौन-सा है?`, splitAkshar(w.a)[0]!, uniq(list.map((x) => splitAkshar(x.a)[0]!)), r, d),
      ]),
    };
  };
}
/** "कमल" → ["क","म","ल"]; a letter keeps its मात्रा / nukta / halant. */
function splitAkshar(word: string): string[] {
  const out: string[] = [];
  for (const ch of word) {
    if (/[ा-्ँ-ः़]/.test(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

const sentences: Builder = (part, parts, r, { difficulty: d }) => {
  const items = slice(L.HINDI_SENTENCES, part, parts);
  const words = uniq(L.HINDI_SENTENCES.flatMap((s) => s.replace('।', '').split(' ')));
  return {
    explanation: `शब्दों को सही क्रम में जोड़ने से वाक्य बनता है। वाक्य से पूरी बात समझ आती है। हिंदी के वाक्य के अंत में पूर्ण विराम (।) लगता है। जैसे: "${items[0]}"`,
    examples: items.slice(0, 4),
    keyPoints: ['शब्दों से वाक्य बनता है।', 'वाक्य पूरी बात कहता है।', 'वाक्य के अंत में पूर्ण विराम (।) लगता है।'],
    pool: items.flatMap((s) => {
      const parts2 = s.replace('।', '').split(' ');
      const k = Math.min(1, parts2.length - 1);
      const hidden = parts2[k]!;
      return [
        fill(`वाक्य पूरा कीजिए: ${parts2.map((w, i) => (i === k ? '____' : w)).join(' ')}।`, hidden, d),
        mcq(`वाक्य पूरा कीजिए: ${parts2.map((w, i) => (i === k ? '____' : w)).join(' ')}।`, hidden, words, r, d),
        short(`शब्दों को सही क्रम में लिखिए: ${r.shuffle(parts2).join(', ')}`, s, d),
        tf(`"${s}" एक पूरा वाक्य है।`, true, true, d),
      ];
    }).concat([mcq('हिंदी वाक्य के अंत में कौन-सा चिह्न लगता है?', '।', ['?', ',', '।', '!'], r, d)]),
  };
};

function pairsBuilder(list: L.Pair[], what: { title: string; meaning: string; ab: (p: L.Pair) => string; truth: (a: string, b: string) => string }): Builder {
  return (part, parts, r, { difficulty: d }) => {
    const items = slice(list, part, parts);
    return {
      explanation: `${what.meaning} इस पाठ में: ${items.map((p) => `${p.a} — ${p.b}`).join(', ')}।`,
      examples: items.slice(0, 4).map((p) => `${p.a} — ${p.b}`),
      keyPoints: [what.meaning, ...items.slice(0, 3).map((p) => `${p.a} — ${p.b}`)],
      pool: pairPool(items, list, r, d, true, { ab: what.ab, blank: (p) => `${p.a} — ____`, truth: what.truth }),
    };
  };
}

function partsBuilder(kinds: Array<keyof typeof L.HINDI_PARTS>): Builder {
  return (part, parts, r, { difficulty: d }) => {
    const ks = slice(kinds, part, parts);
    const all = Object.values(L.HINDI_PARTS).flat();
    return {
      explanation: ks.map((k) => `${L.HINDI_PART_MEANING[k]} जैसे: ${L.HINDI_PARTS[k].slice(0, 4).join(', ')}।`).join(' '),
      examples: ks.flatMap((k) => L.HINDI_PARTS[k].slice(0, 2).map((w) => `"${w}" — ${k}`)).slice(0, 4),
      keyPoints: ks.map((k) => L.HINDI_PART_MEANING[k]),
      pool: ks.flatMap((k) =>
        L.HINDI_PARTS[k].flatMap((w) => [
          mcq(`इनमें से ${k} कौन-सा है?`, w, all.filter((x) => !L.HINDI_PARTS[k].includes(x)), r, d),
          tf(`"${w}" एक ${k} है।`, true, true, d),
          mcq(`"${w}" किस प्रकार का शब्द है?`, k, Object.keys(L.HINDI_PARTS), r, d),
        ]),
      ),
    };
  };
}

function hindiPlan(level: number): PlanChapter[] {
  const antonyms = pairsBuilder(L.HINDI_ANTONYMS, { title: 'विलोम', meaning: 'विलोम शब्द उल्टा अर्थ बताते हैं।', ab: (p) => `"${p.a}" का विलोम शब्द क्या है?`, truth: (a, b) => `"${a}" का विलोम "${b}" है।` });
  const synonyms = pairsBuilder(L.HINDI_SYNONYMS, { title: 'पर्यायवाची', meaning: 'पर्यायवाची शब्दों का अर्थ एक जैसा होता है।', ab: (p) => `"${p.a}" का पर्यायवाची शब्द क्या है?`, truth: (a, b) => `"${a}" का पर्यायवाची "${b}" है।` });
  const gender = pairsBuilder(L.HINDI_GENDER, { title: 'लिंग', meaning: 'लिंग से पता चलता है कि शब्द पुरुष जाति का है या स्त्री जाति का।', ab: (p) => `"${p.a}" का स्त्रीलिंग क्या है?`, truth: (a, b) => `"${a}" का स्त्रीलिंग "${b}" है।` });
  const number = pairsBuilder(L.HINDI_NUMBER, { title: 'वचन', meaning: 'वचन से पता चलता है कि वस्तु एक है या अनेक।', ab: (p) => `"${p.a}" का बहुवचन क्या है?`, truth: (a, b) => `"${a}" का बहुवचन "${b}" है।` });
  if (level <= 2)
    return [
      H('स्वर', 'हिंदी के स्वर पहचानना, बोलना और उनसे बने शब्द।', ['सभी स्वर पहचानना', 'हर स्वर से एक शब्द बताना'], ['स्वर पहचानें', 'स्वर से शब्द', 'स्वर का अभ्यास'], swar),
      H('व्यंजन', 'हिंदी के व्यंजन और उनके वर्ग।', ['व्यंजन पहचानना', 'व्यंजन से शब्द बताना'], ['क वर्ग से त वर्ग', 'प वर्ग और बाकी व्यंजन', 'व्यंजन का अभ्यास'], vyanjan),
      H('मात्राएँ', 'स्वरों की मात्राएँ और मात्रा वाले शब्द।', ['मात्राएँ पहचानना', 'मात्रा लगाकर अक्षर बनाना'], ['आ, इ, ई की मात्रा', 'उ, ऊ, ए की मात्रा', 'ऐ, ओ, औ की मात्रा'], matra),
      H('दो अक्षर वाले शब्द', 'अक्षर जोड़कर छोटे शब्द पढ़ना और लिखना।', ['दो अक्षर वाले शब्द पढ़ना', 'अक्षर जोड़कर शब्द बनाना'], ['शब्द पढ़ें', 'शब्द बनाएँ', 'शब्दों का अभ्यास'], wordsBuilder(L.HINDI_WORDS_2, 2)),
      H('तीन अक्षर वाले शब्द', 'तीन अक्षर वाले शब्द पढ़ना और लिखना।', ['तीन अक्षर वाले शब्द पढ़ना', 'शब्दों का अर्थ समझना'], ['शब्द पढ़ें', 'शब्द बनाएँ', 'शब्दों का अभ्यास'], wordsBuilder(L.HINDI_WORDS_3, 3)),
      H('सरल वाक्य', 'शब्दों से छोटे वाक्य बनाना और पढ़ना।', ['छोटे वाक्य पढ़ना', 'शब्दों को सही क्रम में रखना'], ['वाक्य क्या है?', 'वाक्य पूरा करें', 'वाक्य बनाएँ'], sentences),
      H('विलोम शब्द', 'उल्टे अर्थ वाले शब्द।', ['विलोम शब्द बताना'], ['विलोम शब्द', 'विलोम का अभ्यास', 'विलोम खेल'], antonyms),
      H('लिंग और वचन', 'एक-अनेक और लड़का-लड़की वाले शब्द।', ['स्त्रीलिंग शब्द बताना', 'बहुवचन शब्द बताना'], ['लिंग', 'वचन', 'अभ्यास'], (p, n, r, c) => (p % 2 === 0 ? gender : number)(p, n, r, c)),
    ];
  return [
    H('मात्राएँ और शब्द', 'मात्राओं का सही प्रयोग और शब्द निर्माण।', ['मात्राएँ सही लगाना'], ['मात्राएँ', 'मात्रा वाले शब्द', 'अभ्यास'], matra),
    H('संज्ञा और सर्वनाम', 'नाम वाले शब्द और उनकी जगह आने वाले शब्द।', ['संज्ञा पहचानना', 'सर्वनाम पहचानना'], ['संज्ञा', 'सर्वनाम', 'अभ्यास'], partsBuilder(['संज्ञा', 'सर्वनाम'])),
    H('विशेषण और क्रिया', 'विशेषता बताने वाले और काम बताने वाले शब्द।', ['विशेषण पहचानना', 'क्रिया पहचानना'], ['विशेषण', 'क्रिया', 'अभ्यास'], partsBuilder(['विशेषण', 'क्रिया'])),
    H('लिंग', 'पुल्लिंग और स्त्रीलिंग।', ['स्त्रीलिंग शब्द बनाना'], ['लिंग क्या है?', 'स्त्रीलिंग बनाएँ', 'अभ्यास'], gender),
    H('वचन', 'एकवचन और बहुवचन।', ['बहुवचन शब्द बनाना'], ['वचन क्या है?', 'बहुवचन बनाएँ', 'अभ्यास'], number),
    H('पर्यायवाची शब्द', 'समान अर्थ वाले शब्द।', ['पर्यायवाची शब्द बताना'], ['पर्यायवाची', 'वाक्य में प्रयोग', 'अभ्यास'], synonyms),
    H('विलोम शब्द', 'उल्टे अर्थ वाले शब्द।', ['विलोम शब्द बताना'], ['विलोम', 'वाक्य में प्रयोग', 'अभ्यास'], antonyms),
    H('वाक्य निर्माण', 'शब्दों से सही वाक्य बनाना।', ['सही क्रम में वाक्य बनाना'], ['वाक्य क्या है?', 'शब्दों का क्रम', 'अभ्यास'], sentences),
  ];
}

// ------------------------------------------------------------------------------------ English

function enPairs(list: L.Pair[], meaning: string, ab: (p: L.Pair) => string, truth: (a: string, b: string) => string, ba?: (p: L.Pair) => string): Builder {
  return (part, parts, r, { difficulty: d }) => {
    const items = slice(list, part, parts);
    return {
      explanation: `${meaning} In this lesson: ${items.map((p) => `${p.a} → ${p.b}`).join(', ')}.`,
      examples: items.slice(0, 4).map((p) => `${p.a} → ${p.b}`),
      keyPoints: [meaning, ...items.slice(0, 3).map((p) => `${p.a} → ${p.b}`)],
      pool: pairPool(items, list, r, d, false, { ab, ba, blank: (p) => `${p.a} → ____`, truth }),
    };
  };
}
const letters: Builder = (part, parts, r, { difficulty: d }) => {
  const items = slice(L.PHONICS, part, parts);
  const all = L.PHONICS.map((p) => p.a.toUpperCase());
  return {
    explanation: `The English alphabet has 26 letters. Each letter has a capital form and a small form: ${items.map((p) => `${p.a.toUpperCase()} ${p.a}`).join(', ')}. Every letter makes a sound — "${items[0]!.a}" as in "${items[0]!.b}".`,
    examples: items.slice(0, 4).map((p) => `${p.a.toUpperCase()} ${p.a} — ${p.b}`),
    keyPoints: ['There are 26 letters in the English alphabet.', 'Each letter has a capital and a small form.', 'Each letter has its own sound.'],
    pool: items.flatMap((p) => [
      mcq(`What is the capital form of "${p.a}"?`, p.a.toUpperCase(), all, r, d),
      mcq(`Which word starts with the sound of "${p.a}"?`, p.b, L.PHONICS.map((x) => x.b), r, d, `"${p.b}" starts with "${p.a}".`),
      fill(`${p.a} is for ____`, p.b, d),
      tf(`"${p.b}" starts with the letter "${p.a}".`, true, false, d),
      match(p.a.toUpperCase(), p.a, L.PHONICS.map((x) => x.a), r, d),
    ]),
  };
};
const cvc: Builder = (part, parts, r, { difficulty: d }) => {
  const items = slice(L.CVC, part, parts);
  return {
    explanation: `Many short words have three sounds: a consonant, a vowel and a consonant. Say each sound, then blend them: c-a-t → cat. In this lesson: ${items.map((w) => w.a).join(', ')}.`,
    examples: items.slice(0, 4).map((w) => `${w.a.split('').join('-')} → ${w.a}`),
    keyPoints: ['Short words can have three sounds.', 'The vowels are a, e, i, o, u.', 'Blend the sounds to read the word.'],
    pool: items.flatMap((w) => [
      mcq(`Which vowel is in "${w.a}"?`, w.b, ['a', 'e', 'i', 'o', 'u'], r, d),
      fill(`Blend the sounds: ${w.a.split('').join('-')} = ____`, w.a, d),
      fill(`${w.a[0]}_${w.a[2]} (fill the vowel to make "${w.a}"): ____`, w.b, d),
      tf(`"${w.a}" has the vowel "${w.b}".`, true, false, d),
      short(`How many sounds does "${w.a}" have?`, '3', d),
    ]),
  };
};
function enParts(kinds: Array<keyof typeof L.EN_PARTS>): Builder {
  return (part, parts, r, { difficulty: d }) => {
    const ks = slice(kinds, part, parts);
    const all = Object.values(L.EN_PARTS).flat();
    return {
      explanation: ks.map((k) => `${L.EN_PART_MEANING[k]} For example: ${L.EN_PARTS[k].slice(0, 4).join(', ')}.`).join(' '),
      examples: ks.flatMap((k) => L.EN_PARTS[k].slice(0, 2).map((w) => `"${w}" is a ${k}`)).slice(0, 4),
      keyPoints: ks.map((k) => L.EN_PART_MEANING[k]),
      pool: ks.flatMap((k) =>
        L.EN_PARTS[k].flatMap((w) => [
          mcq(`Which of these is a ${k}?`, w, all.filter((x) => !L.EN_PARTS[k].includes(x)), r, d),
          tf(`"${w}" is a ${k}.`, true, false, d),
          mcq(`What kind of word is "${w}"?`, k, Object.keys(L.EN_PARTS), r, d),
        ]),
      ),
    };
  };
}
function englishPlan(level: number): PlanChapter[] {
  const opposites = enPairs(L.EN_OPPOSITES, 'Opposites are words with opposite meanings.', (p) => `What is the opposite of "${p.a}"?`, (a, b) => `The opposite of "${a}" is "${b}".`);
  const plurals = enPairs(L.EN_PLURALS, 'One thing is singular; more than one is plural. Most words add -s or -es, and some change.', (p) => `What is the plural of "${p.a}"?`, (a, b) => `The plural of "${a}" is "${b}".`);
  const articles = enPairs(L.EN_ARTICLES, 'Use "an" before a vowel sound (a, e, i, o, u) and "a" before other sounds.', (p) => `Which article goes before "${p.a}"?`, (a, b) => `We say "${b} ${a}".`);
  const past = enPairs(L.EN_PAST, 'The past tense tells what already happened. Many verbs add -ed; some change completely.', (p) => `What is the past tense of "${p.a}"?`, (a, b) => `The past tense of "${a}" is "${b}".`);
  const synonyms = enPairs(L.EN_SYNONYMS, 'Synonyms are words with the same or almost the same meaning.', (p) => `Which word means the same as "${p.a}"?`, (a, b) => `"${a}" and "${b}" mean almost the same.`);
  const C = (title: string, description: string, objectives: string[], lessons: string[], build: Builder): PlanChapter => ({ title, description, objectives, lessons, build });
  if (level <= 2)
    return [
      C('Capital and Small Letters', 'The 26 letters of the alphabet, capital and small.', ['recognise all letters', 'match capital and small letters'], ['Letters A to I', 'Letters J to R', 'Letters S to Z'], letters),
      C('Letter Sounds', 'The sound each letter makes.', ['say the sound of each letter', 'find words that start with a sound'], ['First Sounds', 'More Sounds', 'Sound Practice'], letters),
      C('Three-Letter Words', 'Blending sounds into short words.', ['blend three sounds to read a word'], ['Short a and e words', 'Short i and o words', 'Short u words'], cvc),
      C('Naming Words', 'Nouns name people, places, animals and things.', ['identify naming words'], ['What is a Noun?', 'Nouns Around Us', 'Practice'], enParts(['noun'])),
      C('Action Words', 'Verbs tell us what someone does.', ['identify action words'], ['What is a Verb?', 'Actions We Do', 'Practice'], enParts(['verb'])),
      C('Opposites', 'Words with opposite meanings.', ['give the opposite of a word'], ['Opposites 1', 'Opposites 2', 'Practice'], opposites),
      C('One and Many', 'Singular and plural.', ['make plurals'], ['Adding -s', 'Special Plurals', 'Practice'], plurals),
      C('a and an', 'Using the articles a and an.', ['choose a or an correctly'], ['Using a', 'Using an', 'Practice'], articles),
    ];
  return [
    C('Nouns and Pronouns', 'Naming words and words used in their place.', ['identify nouns and pronouns'], ['Nouns', 'Pronouns', 'Practice'], enParts(['noun', 'pronoun'])),
    C('Verbs and Adjectives', 'Action words and describing words.', ['identify verbs and adjectives'], ['Verbs', 'Adjectives', 'Practice'], enParts(['verb', 'adjective'])),
    C('Articles', 'a, an and the.', ['use a and an correctly'], ['a', 'an', 'Practice'], articles),
    C('Singular and Plural', 'Making plurals.', ['form regular and irregular plurals'], ['Regular Plurals', 'Irregular Plurals', 'Practice'], plurals),
    C('Past Tense', 'Talking about what already happened.', ['form the past tense of verbs'], ['Regular Verbs', 'Irregular Verbs', 'Practice'], past),
    C('Synonyms', 'Words with similar meanings.', ['choose synonyms'], ['Synonyms 1', 'Synonyms 2', 'Practice'], synonyms),
    C('Opposites', 'Words with opposite meanings.', ['choose antonyms'], ['Opposites 1', 'Opposites 2', 'Practice'], opposites),
    C('Phonics Review', 'Sounds and spelling.', ['spell short words by their sounds'], ['Vowel Sounds', 'Blending', 'Practice'], cvc),
  ];
}

// ------------------------------------------------------------------------------------ Mathematics (and other subjects)

const MATH_INTRO: Partial<Record<NumberKind, string>> = {
  count: 'Counting tells us how many things there are. Point to each thing once and say the next number.',
  compare: 'To compare two numbers, look at which is bigger. A number with more digits is bigger; if they have the same number of digits, compare from the left.',
  placevalue: 'Each digit in a number has a place: ones, tens, hundreds, thousands… Its value is the digit times its place.',
  add: 'Adding puts numbers together. Add the ones first, then the tens, carrying over when a column makes ten or more.',
  sub: 'Subtracting takes one number away from another. Start with the ones; borrow from the next place when you need to.',
  mul: 'Multiplying is repeated adding: 4 × 3 means four threes, 3 + 3 + 3 + 3.',
  div: 'Dividing shares a number into equal groups: 12 ÷ 3 asks how many are in each of 3 equal groups.',
  integer: 'Integers include negative numbers. On a number line, adding moves right and subtracting moves left.',
  fraction: 'A fraction is a part of a whole: the bottom number says how many equal parts, the top how many we take.',
  decimal: 'Decimals show parts of a whole using a point: 0.5 is five tenths. Line up the points when you add.',
  percent: 'Percent means "out of 100": 25% of a number is 25 hundredths of it.',
  pattern: 'A pattern follows a rule. Find the rule (for example "add 3") and use it to find what comes next.',
  equation: 'An equation is balanced like a scale. Do the same thing to both sides to find the unknown.',
  perimeter: 'Perimeter is the distance around a shape (add all the sides); area is the space inside (length × width for a rectangle).',
  mean: 'The average (mean) is the total divided by how many numbers there are.',
  word: 'In a word problem, find what is given and what is asked, decide the operation, then solve and check.',
};

const asQuestion = (q: { prompt: string; options: string[]; answer: string }, kind: NumberKind, d: Difficulty): CourseQuestion =>
  q.options.length ? { type: 'mcq', prompt: q.prompt, options: uniq(q.options), answer: q.answer, difficulty: d, explanation: '' } : { type: kind === 'word' ? 'word-problem' : 'short-answer', prompt: q.prompt, options: [], answer: q.answer, difficulty: d, explanation: '' };

function mathBuilder(kind: NumberKind, spec: ChapterSpec): Builder {
  return (_part, _parts, r, { level, difficulty: d }) => {
    const worked = Array.from({ length: 3 }, () => numberQuestion(kind, level, r));
    const pool: CourseQuestion[] = [];
    for (let i = 0; i < 40; i++) pool.push(asQuestion(numberQuestion(kind, level, r), kind, d));
    // A few true/false checks: the right answer, or an answer that is off by a little.
    for (let i = 0; i < 4; i++) {
      const q = numberQuestion(kind, level, r);
      const n = Number(q.answer);
      if (!q.options.length && Number.isFinite(n)) {
        const right = i % 2 === 0;
        pool.push(tf(`True or false: ${q.prompt.replace(/ = \?$/, '').replace(/\?$/, '')} → ${right ? n : n + r.int(1, 3)}`, right, false, d, `The answer is ${n}.`));
      }
    }
    return {
      explanation: `${MATH_INTRO[kind] ?? spec.about} ${spec.about}`,
      examples: worked.map((w) => `${w.prompt.replace(/ = \?$/, '')} → ${w.answer}`),
      keyPoints: [MATH_INTRO[kind] ?? spec.about, `Goal: ${spec.objective}.`, 'Check every answer once you have worked it out.'],
      pool,
    };
  };
}

/** Other subjects: the topic library's outline and key terms, as definitions and questions on them. */
function termBuilder(spec: ChapterSpec): Builder {
  return (part, parts, r, { difficulty: d, hindi }) => {
    const terms = spec.terms.map(([a, b]) => ({ a, b }));
    const items = slice(terms, part, parts);
    const meanings = terms.map((t) => t.b);
    const words = terms.map((t) => t.a);
    return {
      explanation: `${spec.about} ${items.map((t) => (hindi ? `"${t.a}" — ${t.b}।` : `${t.a[0]!.toUpperCase()}${t.a.slice(1)} means ${t.b}.`)).join(' ')}`,
      examples: items.map((t) => (hindi ? `${t.a}: ${t.b}` : `${t.a} — ${t.b}`)),
      keyPoints: [`${spec.about}`, ...items.map((t) => `${t.a}: ${t.b}`)].slice(0, 5),
      pool: terms.flatMap((t, i) => {
        const other = terms[(i + 1) % terms.length]!;
        return [
          mcq(hindi ? `"${t.a}" का अर्थ क्या है?` : `What does "${t.a}" mean?`, t.b, meanings, r, d),
          mcq(hindi ? `"${t.b}" — यह किस शब्द का अर्थ है?` : `Which word means "${t.b}"?`, t.a, words, r, d),
          fill(hindi ? `${t.b} को ____ कहते हैं।` : `${t.b[0]!.toUpperCase()}${t.b.slice(1)} is called ____.`, t.a, d),
          tf(hindi ? `"${t.a}" का अर्थ है: ${t.b}` : `"${t.a}" means ${t.b}.`, true, hindi, d),
          ...(other.b !== t.b ? [tf(hindi ? `"${t.a}" का अर्थ है: ${other.b}` : `"${t.a}" means ${other.b}.`, false, hindi, d)] : []),
          match(t.a, t.b, meanings, r, d),
        ];
      }),
    };
  };
}

function libraryPlan(subject: CourseBrief['subject'], level: number): PlanChapter[] {
  const name = `${subject.key} ${subject.title}`.toLowerCase();
  const domain =
    DOMAINS.find((dm) => dm.key === subject.key || dm.id === subject.key) ??
    DOMAINS.find((dm) => dm.keywords.some((k) => name.includes(k.toLowerCase()))) ??
    DOMAINS.find((dm) => dm.topics.some((t) => t.id === subject.key || t.keywords.some((k) => name.includes(k.toLowerCase()))));
  const inRange = (c: ChapterSpec) => (c.min ?? 1) <= level && level <= (c.max ?? 12);
  const specs = domain ? domain.topics.flatMap((t) => t.chapters).filter(inRange) : [];
  const fallback: ChapterSpec[] = [`Introduction to ${subject.title}`, `Key Ideas in ${subject.title}`, `${subject.title} in Daily Life`, `Practice and Review`].map((title) => ({
    title,
    about: `${title}: the main ideas of ${subject.title} for Class ${level}.`,
    objective: `understand ${title.toLowerCase()}`,
    lessons: ['Getting Started', 'Main Ideas', 'Practice'],
    terms: [[subject.title, `the subject this course is about`], ['practice', 'doing something again to get better at it'], ['review', 'looking back at what we learned']],
  }));
  return (specs.length ? specs : fallback).map((spec) => ({
    title: spec.title,
    description: spec.about,
    objectives: [spec.objective[0]!.toUpperCase() + spec.objective.slice(1)],
    lessons: spec.lessons,
    build: spec.numbers ? mathBuilder(spec.numbers, spec) : termBuilder(spec),
  }));
}

function planFor(brief: CourseBrief): PlanChapter[] {
  const name = `${brief.subject.key} ${brief.subject.title}`.toLowerCase();
  if (/^hindi\b|हिंदी|हिन्दी/.test(name) && brief.classLevel <= 5) return hindiPlan(brief.classLevel);
  if (/^english\b/.test(name) && brief.classLevel <= 5) return englishPlan(brief.classLevel);
  return libraryPlan(brief.subject, brief.classLevel);
}

// ------------------------------------------------------------------------------------ the generator

const DIFFICULTY: Record<CourseBrief['level'], Difficulty> = { beginner: 'easy', basic: 'easy', intermediate: 'medium', advanced: 'hard' };
const isHindi = (brief: CourseBrief) => /hindi|हिंदी|हिन्दी/.test(`${brief.subject.key} ${brief.subject.title}`.toLowerCase());

/** Chapters ordered by what the administrator asked for (named topics first), without what they asked to avoid. */
function rankedPlan(brief: CourseBrief): PlanChapter[] {
  const plan = planFor(brief);
  const want = `${brief.prompt} ${brief.include} ${brief.goals}`.toLowerCase();
  const avoid = brief.avoid.toLowerCase();
  const hits = (c: PlanChapter, text: string) => text && [c.title, ...c.lessons].some((t) => t.length > 1 && text.includes(t.toLowerCase()));
  const kept = plan.filter((c) => !hits(c, avoid));
  return [...kept].sort((a, b) => Number(hits(b, want)) - Number(hits(a, want)) || kept.indexOf(a) - kept.indexOf(b));
}

function lessonTitles(c: PlanChapter, n: number, hindi: boolean): string[] {
  const out = c.lessons.slice(0, n);
  for (let i = out.length; i < n; i++) out.push(hindi ? `अभ्यास ${i - c.lessons.length + 1}` : `Practice ${i - c.lessons.length + 1}`);
  return out;
}

function pick(pool: CourseQuestion[], n: number, r: Rng, avoid: Set<string> = new Set()): CourseQuestion[] {
  const seen = new Set(avoid);
  const out: CourseQuestion[] = [];
  for (const q of r.shuffle(pool)) {
    if (out.length >= n) break;
    if (seen.has(q.prompt)) continue;
    seen.add(q.prompt);
    out.push(q);
  }
  return out;
}

export class TemplateCourseGenerator {
  readonly kind = 'template' as const;

  /** The plan: chapters (and lesson titles) for this class and subject. */
  outline(brief: CourseBrief): CourseOutline {
    const plan = rankedPlan(brief);
    const hindi = isHindi(brief);
    const chapters = Array.from({ length: brief.chapters }, (_, i) => {
      const c = plan[i % plan.length]!;
      const round = Math.floor(i / plan.length);
      // More chapters than the plan has: later rounds revisit chapters as practice chapters.
      const title = round ? `${c.title} — ${hindi ? 'अभ्यास' : 'Practice'} ${round + 1}` : c.title;
      return { title, description: c.description, lessonTitles: lessonTitles(c, brief.lessonsPerChapter, hindi) };
    });
    return {
      classLevel: brief.classLevel,
      subject: brief.subject.title,
      title: brief.title,
      description: brief.description || (hindi ? `कक्षा ${brief.classLevel} के लिए ${brief.subject.title} का पाठ्यक्रम।` : `${brief.subject.title} for Class ${brief.classLevel}.`),
      objectives: uniq(plan.slice(0, Math.min(plan.length, brief.chapters)).flatMap((c) => c.objectives)).slice(0, 5),
      chapters,
    };
  }

  private planChapter(brief: CourseBrief, title: string): PlanChapter {
    const plan = rankedPlan(brief);
    const base = title.replace(/ — (अभ्यास|Practice) \d+$/, '');
    return plan.find((c) => c.title === base) ?? plan[0]!;
  }

  lesson(brief: CourseBrief, chapter: { title: string; lessonTitles: string[] }, index: number, seed = ''): CourseLesson {
    const c = this.planChapter(brief, chapter.title);
    const r = rng(`${brief.classLevel}:${brief.subject.key}:${chapter.title}:${index}:${seed}`);
    const ctx: Ctx = { level: brief.classLevel, difficulty: DIFFICULTY[brief.level], hindi: isHindi(brief) };
    const m = c.build(index, c.lessons.length, r, ctx);
    const questions = pick(m.pool, brief.questionsPerLesson, r);
    // Not enough in this lesson's part of the material: top up from the whole chapter's.
    if (questions.length < brief.questionsPerLesson) {
      const all = c.build(c.lessons.length, c.lessons.length, r, ctx).pool;
      questions.push(...pick(all, brief.questionsPerLesson - questions.length, r, new Set(questions.map((q) => q.prompt))));
    }
    // Still short (a chapter with only a few key terms): top up from the rest of the subject's plan.
    if (questions.length < brief.questionsPerLesson) {
      const wider = rankedPlan(brief).filter((x) => x !== c).flatMap((x) => x.build(x.lessons.length, x.lessons.length, r, ctx).pool);
      questions.push(...pick(wider, brief.questionsPerLesson - questions.length, r, new Set(questions.map((q) => q.prompt))));
    }
    const practice = pick(m.pool, Math.min(3, Math.max(0, m.pool.length - questions.length)), r, new Set(questions.map((q) => q.prompt)));
    return {
      title: chapter.lessonTitles[index] ?? c.lessons[index] ?? c.title,
      explanation: m.explanation,
      examples: m.examples.length ? m.examples : [m.keyPoints[0]!],
      keyPoints: m.keyPoints,
      questions,
      practice,
      estimatedMinutes: (brief.classLevel <= 2 ? 6 : 8) + Math.ceil(brief.questionsPerLesson * (brief.classLevel <= 2 ? 0.7 : 1)),
    };
  }

  chapter(brief: CourseBrief, outline: CourseOutline, index: number, seed = ''): CourseChapter {
    const o = outline.chapters[index]!;
    const c = this.planChapter(brief, o.title);
    const lessons = o.lessonTitles.map((_, i) => this.lesson(brief, o, i, seed));
    const r = rng(`${brief.classLevel}:${brief.subject.key}:${o.title}:quiz:${seed}`);
    const ctx: Ctx = { level: brief.classLevel, difficulty: DIFFICULTY[brief.level], hindi: isHindi(brief) };
    const used = new Set(lessons.flatMap((l) => [...l.questions, ...l.practice].map((q) => q.prompt)));
    const quizSize = brief.classLevel <= 2 ? 5 : brief.classLevel <= 5 ? 8 : 10;
    const pool = c.build(c.lessons.length, c.lessons.length, r, ctx).pool;
    let quiz = pick(pool, quizSize, r, used);
    if (quiz.length < 3) quiz = pick(pool, quizSize, r);
    return {
      title: o.title,
      description: o.description,
      objectives: c.objectives.length ? c.objectives : [o.description],
      difficulty: DIFFICULTY[brief.level],
      lessons,
      quiz,
      // A recap built from what the lessons' key points actually say.
      summary: `${ctx.hindi ? 'इस अध्याय में हमने सीखा:' : 'In this chapter we learned:'} ${uniq(lessons.flatMap((l) => l.keyPoints)).slice(0, 4).join(' ')}`,
      estimatedMinutes: lessons.reduce((n, l) => n + l.estimatedMinutes, 0) + 10,
    };
  }

  questions(brief: CourseBrief, chapterTitle: string, lessonIndex: number, count: number, seed: string): CourseQuestion[] {
    const c = this.planChapter(brief, chapterTitle);
    const r = rng(`${brief.classLevel}:${brief.subject.key}:${chapterTitle}:${lessonIndex}:q:${seed}`);
    const ctx: Ctx = { level: brief.classLevel, difficulty: DIFFICULTY[brief.level], hindi: isHindi(brief) };
    const m = c.build(lessonIndex, c.lessons.length, r, ctx);
    const out = pick(m.pool, count, r);
    if (out.length < count) out.push(...pick(c.build(c.lessons.length, c.lessons.length, r, ctx).pool, count - out.length, r, new Set(out.map((q) => q.prompt))));
    if (out.length < count) {
      const wider = rankedPlan(brief).filter((x) => x !== c).flatMap((x) => x.build(x.lessons.length, x.lessons.length, r, ctx).pool);
      out.push(...pick(wider, count - out.length, r, new Set(out.map((q) => q.prompt))));
    }
    return out;
  }
}
