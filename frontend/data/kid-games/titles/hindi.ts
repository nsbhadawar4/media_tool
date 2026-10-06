import type { ClassTitles } from '../../../lib/kid-games/types';

/**
 * What each Hindi game is called in each class. The mechanic of a slot never changes (see
 * TEMPLATES in lib/kid-games/catalog.ts); the name and the learning goal follow the class.
 */
const titles: ClassTitles = {
  1: {
    'varn-pehchan': { title: 'स्वर-व्यंजन छाँटो', gloss: 'Sort vowels and consonants', description: 'स्वर और व्यंजन को अलग-अलग डिब्बे में रखो।' },
    'matra-milao': { title: 'मात्रा पहचान', gloss: 'Match the matra', description: 'ा, ि और ी की मात्रा वाले अक्षर मिलाओ।' },
    'shabd-banao': { title: 'शब्द बनाओ', gloss: 'Build a word', description: 'अक्षर जोड़कर कमल, घर जैसे छोटे शब्द बनाओ।' },
    'chitra-shabd': { title: 'चित्र से शब्द', gloss: 'Picture to word', description: 'चित्र देखो और उसका सही नाम चुनो।' },
    'sahi-shabd': { title: 'अक्षर पहचान', gloss: 'Know your letters', description: 'सही अक्षर और सही शब्द चुनो।' },
    'akshar-kram': { title: 'अक्षर क्रम', gloss: 'Letter order', description: 'स्वर और व्यंजन को वर्णमाला के क्रम में लगाओ।' },
    'shabd-milan': { title: 'अक्षर मिलाओ', gloss: 'Picture word memory', description: 'पत्ते पलटो और चित्र-शब्द की जोड़ी ढूँढो।' },
    'rikt-sthan': { title: 'छूटा अक्षर भरो', gloss: 'Missing letter', description: 'शब्द में छूटा हुआ अक्षर भरो।' },
    'vakya-poora': { title: 'छोटे वाक्य', gloss: 'Short sentences', description: 'छोटे-छोटे वाक्य पढ़ो और पूरे करो।' },
    'hindi-quiz': { title: 'वर्णमाला क्विज़', gloss: 'Alphabet quiz', description: 'स्वर, व्यंजन, मात्रा और शब्दों का मज़ेदार क्विज़।' },
  },
  2: {
    'varn-pehchan': { title: 'एक-अनेक और लिंग', gloss: 'Singular, plural and gender', description: 'शब्दों को मात्रा, वचन और लिंग के समूह में रखो।' },
    'matra-milao': { title: 'मात्रा अभ्यास', gloss: 'Matra practice', description: 'सभी मात्राओं वाले अक्षर और शब्द मिलाओ।' },
    'shabd-banao': { title: 'शब्द पहेली', gloss: 'Word puzzle', description: 'अक्षर जोड़कर मात्रा वाले शब्द बनाओ।' },
    'chitra-shabd': { title: 'चित्र से वर्तनी', gloss: 'Picture spelling', description: 'चित्र देखो और सही वर्तनी वाला नाम चुनो।' },
    'sahi-shabd': { title: 'सही शब्द चुनो', gloss: 'Choose the right word', description: 'सही वर्तनी, सही वचन और सही लिंग पहचानो।' },
    'akshar-kram': { title: 'शब्द क्रम', gloss: 'Word order', description: 'दिनों, बारहखड़ी और वाक्य के शब्दों का क्रम लगाओ।' },
    'shabd-milan': { title: 'नर-मादा जोड़ी', gloss: 'Pair memory', description: 'पत्ते पलटो: एक-अनेक और नर-मादा की जोड़ियाँ।' },
    'rikt-sthan': { title: 'शब्द पहचान', gloss: 'Word in a sentence', description: 'वाक्य में सही शब्द भरो।' },
    'vakya-poora': { title: 'वाक्य पूरा करो', gloss: 'Complete the sentence', description: 'पढ़ो, समझो और वाक्य पूरा करो।' },
    'hindi-quiz': { title: 'मात्रा क्विज़', gloss: 'Matra and word quiz', description: 'मात्राएँ, शब्द और वाक्य — सब का क्विज़।' },
  },
  3: {
    'varn-pehchan': { title: 'संज्ञा-सर्वनाम छाँटो', gloss: 'Noun and pronoun sort', description: 'संज्ञा, सर्वनाम, विलोम और पर्यायवाची अलग करो।' },
    'matra-milao': { title: 'विलोम शब्द मिलाओ', gloss: 'Opposite words', description: 'शब्दों को उनके विलोम और पर्यायवाची से मिलाओ।' },
    'shabd-banao': { title: 'वाक्य बनाओ', gloss: 'Build a sentence', description: 'बड़े शब्द और सरल वाक्य बनाओ।' },
    'chitra-shabd': { title: 'चित्र पर्यायवाची', gloss: 'Picture synonyms', description: 'चित्र देखो और उसका पर्यायवाची चुनो।' },
    'sahi-shabd': { title: 'व्याकरण पहचान', gloss: 'Grammar check', description: 'विलोम, पर्यायवाची, संज्ञा और सर्वनाम पहचानो।' },
    'akshar-kram': { title: 'शब्दकोश क्रम', gloss: 'Dictionary order', description: 'शब्दों, महीनों और कहानी को सही क्रम में लगाओ।' },
    'shabd-milan': { title: 'पर्यायवाची जोड़ी', gloss: 'Synonym memory', description: 'पत्ते पलटो: विलोम, पर्यायवाची और वचन की जोड़ियाँ।' },
    'rikt-sthan': { title: 'सही संज्ञा भरो', gloss: 'Fill the noun', description: 'वाक्य में सही संज्ञा और सर्वनाम भरो।' },
    'vakya-poora': { title: 'पढ़ो और समझो', gloss: 'Reading comprehension', description: 'छोटे अनुच्छेद पढ़ो और प्रश्नों के उत्तर दो।' },
    'hindi-quiz': { title: 'व्याकरण क्विज़', gloss: 'Grammar quiz', description: 'विलोम, पर्यायवाची, संज्ञा, सर्वनाम और वचन का क्विज़।' },
  },
  4: {
    'varn-pehchan': { title: 'शब्द-भेद छाँटो', gloss: 'Parts of speech sort', description: 'संज्ञा, विशेषण और क्रिया को सही समूह में रखो।' },
    'matra-milao': { title: 'विशेषण बनाओ', gloss: 'Adjective forms', description: 'संज्ञा से बने विशेषण, भाववाचक और विलोम मिलाओ।' },
    'shabd-banao': { title: 'वाक्य रचना', gloss: 'Sentence building', description: 'शब्द जोड़कर सही वाक्य बनाओ।' },
    'chitra-shabd': { title: 'चित्र से क्रिया', gloss: 'Picture verbs', description: 'चित्र देखो: कौन-सी क्रिया या विशेषण है?' },
    'sahi-shabd': { title: 'वाक्य सुधार', gloss: 'Sentence correction', description: 'शुद्ध वर्तनी और शुद्ध वाक्य चुनो।' },
    'akshar-kram': { title: 'घटनाओं का क्रम', gloss: 'Order of events', description: 'शब्दकोश, वाक्य और घटनाओं का सही क्रम लगाओ।' },
    'shabd-milan': { title: 'एक शब्द जोड़ी', gloss: 'One-word memory', description: 'पत्ते पलटो: अनेक शब्दों के लिए एक शब्द ढूँढो।' },
    'rikt-sthan': { title: 'क्रिया-विशेषण भरो', gloss: 'Fill verbs and adjectives', description: 'वाक्य में सही क्रिया, विशेषण और सर्वनाम भरो।' },
    'vakya-poora': { title: 'अनुच्छेद प्रश्न', gloss: 'Passage questions', description: 'अनुच्छेद पढ़ो और समझकर उत्तर दो।' },
    'hindi-quiz': { title: 'व्याकरण चैंपियन', gloss: 'Grammar champion quiz', description: 'शब्द-भेद, वचन, लिंग, विलोम और शुद्ध वाक्य।' },
  },
  5: {
    'varn-pehchan': { title: 'काल छाँटो', gloss: 'Tense sort', description: 'वाक्यों को भूत, वर्तमान और भविष्य काल में रखो।' },
    'matra-milao': { title: 'मुहावरे मिलाओ', gloss: 'Idiom match', description: 'हर मुहावरे को उसके सही अर्थ से मिलाओ।' },
    'shabd-banao': { title: 'काल से वाक्य', gloss: 'Tense sentences', description: 'काल के अनुसार वाक्य और कठिन शब्द बनाओ।' },
    'chitra-shabd': { title: 'चित्र मुहावरे', gloss: 'Picture idioms', description: 'चित्र देखो: पर्यायवाची या मुहावरा पहचानो।' },
    'sahi-shabd': { title: 'शुद्ध वाक्य चुनो', gloss: 'Correct sentence', description: 'शुद्ध वर्तनी, शुद्ध वाक्य, काल और मुहावरे।' },
    'akshar-kram': { title: 'वाक्य संरचना', gloss: 'Sentence structure', description: 'शब्दों और घटनाओं को सही क्रम में लगाओ।' },
    'shabd-milan': { title: 'तत्सम-तद्भव जोड़ी', gloss: 'Tatsam-tadbhav memory', description: 'पत्ते पलटो: मुहावरे, पर्यायवाची और तत्सम-तद्भव।' },
    'rikt-sthan': { title: 'सही शब्द-रूप भरो', gloss: 'Right word form', description: 'काल और मुहावरे के अनुसार सही शब्द भरो।' },
    'vakya-poora': { title: 'अनुच्छेद चुनौती', gloss: 'Passage challenge', description: 'लंबे अनुच्छेद पढ़ो, सोचो और उत्तर दो।' },
    'hindi-quiz': { title: 'हिंदी महाक्विज़', gloss: 'Hindi grand quiz', description: 'काल, मुहावरे, पर्यायवाची, विलोम और शुद्ध वाक्य।' },
  },
};

export default titles;
