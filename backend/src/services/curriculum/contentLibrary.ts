/**
 * Real learning material for the template generator's core subjects — Hindi, English and early
 * Mathematics — written for this app (no textbook text). Lessons, examples and questions are built
 * from these lists, so every answer the template gives is a checked fact, not filler.
 */

export interface Pair {
  a: string;
  b: string;
}
const P = (a: string, b: string): Pair => ({ a, b });

// ------------------------------------------------------------------------------------ Hindi

/** स्वर, each with a word that starts with it. */
export const SWAR: Pair[] = [P('अ', 'अनार'), P('आ', 'आम'), P('इ', 'इमली'), P('ई', 'ईख'), P('उ', 'उल्लू'), P('ऊ', 'ऊन'), P('ऋ', 'ऋषि'), P('ए', 'एड़ी'), P('ऐ', 'ऐनक'), P('ओ', 'ओखली'), P('औ', 'औज़ार')];

/** व्यंजन in their groups, each with a word that starts with it. */
export const VYANJAN_GROUPS: Array<{ name: string; letters: Pair[] }> = [
  { name: 'क वर्ग', letters: [P('क', 'कबूतर'), P('ख', 'खरगोश'), P('ग', 'गमला'), P('घ', 'घड़ी')] },
  { name: 'च वर्ग', letters: [P('च', 'चम्मच'), P('छ', 'छतरी'), P('ज', 'जहाज़'), P('झ', 'झंडा')] },
  { name: 'ट वर्ग', letters: [P('ट', 'टमाटर'), P('ठ', 'ठेला'), P('ड', 'डमरू'), P('ढ', 'ढोल'), P('ण', 'बाण')] },
  { name: 'त वर्ग', letters: [P('त', 'तरबूज़'), P('थ', 'थाली'), P('द', 'दवात'), P('ध', 'धनुष'), P('न', 'नल')] },
  { name: 'प वर्ग', letters: [P('प', 'पतंग'), P('फ', 'फल'), P('ब', 'बतख'), P('भ', 'भालू'), P('म', 'मछली')] },
  { name: 'अंतःस्थ', letters: [P('य', 'यान'), P('र', 'रथ'), P('ल', 'लट्टू'), P('व', 'वन')] },
  { name: 'ऊष्म', letters: [P('श', 'शेर'), P('स', 'सेब'), P('ह', 'हाथी')] },
];
export const VYANJAN: Pair[] = VYANJAN_GROUPS.flatMap((g) => g.letters);

/** मात्राएँ: the स्वर, its sign, क with it, and a word that uses it. */
export const MATRAS: Array<{ swar: string; sign: string; withKa: string; word: string }> = [
  { swar: 'आ', sign: 'ा', withKa: 'का', word: 'काला' },
  { swar: 'इ', sign: 'ि', withKa: 'कि', word: 'किताब' },
  { swar: 'ई', sign: 'ी', withKa: 'की', word: 'खीर' },
  { swar: 'उ', sign: 'ु', withKa: 'कु', word: 'कुत्ता' },
  { swar: 'ऊ', sign: 'ू', withKa: 'कू', word: 'फूल' },
  { swar: 'ए', sign: 'े', withKa: 'के', word: 'केला' },
  { swar: 'ऐ', sign: 'ै', withKa: 'कै', word: 'पैसा' },
  { swar: 'ओ', sign: 'ो', withKa: 'को', word: 'मोर' },
  { swar: 'औ', sign: 'ौ', withKa: 'कौ', word: 'कौआ' },
];

/** Simple words without मात्राएँ, by the number of letters, with their meaning in English. */
export const HINDI_WORDS_2: Pair[] = [P('घर', 'house'), P('जल', 'water'), P('फल', 'fruit'), P('नल', 'tap'), P('बस', 'bus'), P('रथ', 'chariot'), P('वन', 'forest'), P('हल', 'plough'), P('कप', 'cup'), P('पर', 'feather')];
export const HINDI_WORDS_3: Pair[] = [P('कमल', 'lotus'), P('नमक', 'salt'), P('बतख', 'duck'), P('मटर', 'peas'), P('महल', 'palace'), P('कलम', 'pen'), P('शहर', 'city'), P('सड़क', 'road'), P('दरज़ी', 'tailor'), P('भवन', 'building')];
/** Short sentences built from such words. */
export const HINDI_SENTENCES: string[] = ['कमल जल में है।', 'राम घर चल।', 'नल पर मत चढ़।', 'बतख जल में तैरती है।', 'मटर हरी है।', 'बस सड़क पर चल रही है।'];

export const HINDI_SYNONYMS: Pair[] = [P('पानी', 'जल'), P('सूरज', 'सूर्य'), P('फूल', 'पुष्प'), P('घर', 'मकान'), P('आग', 'अग्नि'), P('पेड़', 'वृक्ष'), P('चाँद', 'चंद्रमा'), P('आँख', 'नयन')];
export const HINDI_ANTONYMS: Pair[] = [P('दिन', 'रात'), P('अच्छा', 'बुरा'), P('ऊपर', 'नीचे'), P('सुख', 'दुख'), P('आना', 'जाना'), P('बड़ा', 'छोटा'), P('सच', 'झूठ'), P('गरम', 'ठंडा')];
export const HINDI_GENDER: Pair[] = [P('लड़का', 'लड़की'), P('घोड़ा', 'घोड़ी'), P('शेर', 'शेरनी'), P('राजा', 'रानी'), P('मोर', 'मोरनी'), P('बेटा', 'बेटी')];
export const HINDI_NUMBER: Pair[] = [P('लड़का', 'लड़के'), P('किताब', 'किताबें'), P('नदी', 'नदियाँ'), P('चिड़िया', 'चिड़ियाँ'), P('कपड़ा', 'कपड़े'), P('रात', 'रातें')];
/** Words of one kind, for "which is a संज्ञा / सर्वनाम / विशेषण / क्रिया?" */
export const HINDI_PARTS: Record<'संज्ञा' | 'सर्वनाम' | 'विशेषण' | 'क्रिया', string[]> = {
  संज्ञा: ['राम', 'किताब', 'दिल्ली', 'गाय', 'गंगा', 'मेज़'],
  सर्वनाम: ['मैं', 'तुम', 'वह', 'हम', 'आप', 'वे'],
  विशेषण: ['लाल', 'सुंदर', 'मीठा', 'बड़ा', 'छोटा', 'ईमानदार'],
  क्रिया: ['खाना', 'पढ़ना', 'खेलना', 'दौड़ना', 'लिखना', 'सोना'],
};
export const HINDI_PART_MEANING: Record<keyof typeof HINDI_PARTS, string> = {
  संज्ञा: 'किसी व्यक्ति, वस्तु, स्थान या प्राणी के नाम को संज्ञा कहते हैं।',
  सर्वनाम: 'संज्ञा के स्थान पर आने वाले शब्दों को सर्वनाम कहते हैं।',
  विशेषण: 'संज्ञा या सर्वनाम की विशेषता बताने वाले शब्दों को विशेषण कहते हैं।',
  क्रिया: 'जिन शब्दों से किसी काम के करने या होने का पता चले, उन्हें क्रिया कहते हैं।',
};

// ------------------------------------------------------------------------------------ English

export const PHONICS: Pair[] = [
  P('a', 'apple'), P('b', 'ball'), P('c', 'cat'), P('d', 'dog'), P('e', 'egg'), P('f', 'fish'), P('g', 'goat'), P('h', 'hat'), P('i', 'ink'),
  P('j', 'jug'), P('k', 'kite'), P('l', 'lion'), P('m', 'mango'), P('n', 'nest'), P('o', 'orange'), P('p', 'pen'), P('q', 'queen'), P('r', 'rat'),
  P('s', 'sun'), P('t', 'tiger'), P('u', 'umbrella'), P('v', 'van'), P('w', 'watch'), P('x', 'box'), P('y', 'yak'), P('z', 'zebra'),
];
/** Three-letter consonant–vowel–consonant words, with their vowel. */
export const CVC: Pair[] = [P('cat', 'a'), P('hat', 'a'), P('bag', 'a'), P('pen', 'e'), P('hen', 'e'), P('bed', 'e'), P('pig', 'i'), P('pin', 'i'), P('dog', 'o'), P('pot', 'o'), P('sun', 'u'), P('bus', 'u'), P('cup', 'u')];
export const EN_OPPOSITES: Pair[] = [P('big', 'small'), P('hot', 'cold'), P('up', 'down'), P('happy', 'sad'), P('day', 'night'), P('fast', 'slow'), P('open', 'close'), P('tall', 'short'), P('full', 'empty'), P('light', 'dark')];
export const EN_SYNONYMS: Pair[] = [P('big', 'large'), P('happy', 'glad'), P('start', 'begin'), P('fast', 'quick'), P('little', 'small'), P('shut', 'close'), P('end', 'finish'), P('gift', 'present')];
export const EN_PLURALS: Pair[] = [P('cat', 'cats'), P('box', 'boxes'), P('baby', 'babies'), P('child', 'children'), P('man', 'men'), P('bus', 'buses'), P('leaf', 'leaves'), P('tooth', 'teeth')];
export const EN_PAST: Pair[] = [P('go', 'went'), P('eat', 'ate'), P('play', 'played'), P('run', 'ran'), P('write', 'wrote'), P('see', 'saw'), P('sing', 'sang'), P('jump', 'jumped')];
export const EN_ARTICLES: Pair[] = [P('apple', 'an'), P('ball', 'a'), P('egg', 'an'), P('umbrella', 'an'), P('cat', 'a'), P('owl', 'an'), P('book', 'a'), P('orange', 'an')];
export const EN_PARTS: Record<'noun' | 'pronoun' | 'verb' | 'adjective', string[]> = {
  noun: ['girl', 'table', 'Delhi', 'tree', 'teacher', 'river'],
  pronoun: ['he', 'she', 'it', 'they', 'we', 'you'],
  verb: ['run', 'eat', 'read', 'jump', 'write', 'sleep'],
  adjective: ['red', 'tall', 'sweet', 'happy', 'little', 'kind'],
};
export const EN_PART_MEANING: Record<keyof typeof EN_PARTS, string> = {
  noun: 'A noun is a naming word: the name of a person, place, animal or thing.',
  pronoun: 'A pronoun is a word used in place of a noun, such as he, she, it or they.',
  verb: 'A verb is an action word: it tells what someone or something does.',
  adjective: 'An adjective is a describing word: it tells us more about a noun.',
};
