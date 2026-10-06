import type {
  BuildQuestion,
  ChoiceQuestion,
  MatchQuestion,
  OrderQuestion,
  SortQuestion,
  SubjectContent,
} from '../../../lib/kid-games/types';

/** Class 4 English: simple tenses, parts of speech, prepositions, sentence correction and comprehension. */

const order = (prompt: string, items: string[]): OrderQuestion => ({ kind: 'order', prompt, items });
const match = (prompt: string, pairs: [string, string][]): MatchQuestion => ({ kind: 'match', prompt, pairs });
const pick = (prompt: string, options: string[], answer: string, more: Partial<ChoiceQuestion> = {}): ChoiceQuestion => ({
  kind: 'choice',
  prompt,
  options,
  answer,
  ...more,
});
const spell = (visual: string, answer: string, wrong: string[]): ChoiceQuestion =>
  pick('Spell this word.', [answer, ...wrong], answer, { visual });
const gap = (sentence: string, options: string[], answer: string, explain?: string): ChoiceQuestion =>
  pick('Choose the missing word.', options, answer, { sentence, ...(explain ? { explain } : {}) });
const build = (sentence: string, extra?: string[]): BuildQuestion => ({
  kind: 'build',
  prompt: 'Make the sentence.',
  tiles: sentence.split(' '),
  joiner: ' ',
  ...(extra ? { extra } : {}),
});
const sort = (prompt: string, groups: Record<string, string[]>): SortQuestion => ({
  kind: 'sort',
  prompt,
  buckets: Object.keys(groups),
  items: Object.entries(groups).flatMap(([bucket, words]) => words.map((text) => ({ text, bucket }))),
});
const read = (passage: string, prompt: string, options: string[], answer: string): ChoiceQuestion =>
  pick(prompt, options, answer, { passage });

const DICT = 'Put the words in dictionary order. Look past the letters that are the same.';
const TENSE = 'Is it past, present or future?';

const BIRDS =
  'Every year, thousands of birds fly to the Bharatpur Bird Sanctuary in Rajasthan. They come from faraway cold countries to escape the harsh winter. These birds are called migratory birds. They stay in India for a few months and fly back when spring arrives. Bird lovers visit the sanctuary to watch them.';
const MOHAN =
  'Mohan found a purse on the road while going to school. It had some money and a card with a name and address. Mohan did not keep the money. After school, he went to the address and returned the purse to an old lady. She thanked him and blessed him.';
const BANYAN =
  'The banyan is the national tree of India. It has a huge trunk and many branches. Its branches send down roots that grow into the ground and look like new trunks. A single banyan tree can cover a very large area. Many birds make their homes in it, and people rest in its cool shade.';

const content: SubjectContent = {
  'alphabet-adventure': {
    learn: 'Dictionary order for words that begin the same way',
    questions: [
      order(DICT, ['calm', 'cart', 'cat', 'catch']),
      order(DICT, ['plan', 'plant', 'plate', 'play']),
      order(DICT, ['stamp', 'stand', 'star', 'stay']),
      order(DICT, ['bread', 'break', 'brick', 'bride', 'bring']),
      order(DICT, ['grain', 'grand', 'grape', 'grass', 'great']),
      order(DICT, ['sheep', 'shell', 'shine', 'ship', 'shoe']),
      order(DICT, ['trace', 'track', 'trade', 'train', 'tree']),
      order(DICT, ['monkey', 'month', 'moon', 'morning', 'mother']),
      order(DICT, ['farm', 'farmer', 'fast', 'fat', 'father']),
      order(DICT, ['clean', 'clear', 'clever', 'climb', 'clock']),
      order(DICT, ['warm', 'wash', 'watch', 'water']),
      order(DICT, ['light', 'lighten', 'lightning', 'lights']),
      order(DICT, ['book', 'bookcase', 'booklet', 'bookmark']),
      order('Put the story in order.', [
        'The thirsty crow looked for water.',
        'It found a pot with a little water.',
        'It dropped pebbles into the pot.',
        'The water came up and the crow drank it.',
      ]),
      order('Put the steps for making tea in order.', [
        'Boil water in a pan.',
        'Add tea leaves.',
        'Add milk and sugar.',
        'Strain the tea into a cup.',
      ]),
      order("Put the stages of a butterfly's life in order.", ['egg', 'caterpillar', 'pupa', 'butterfly']),
    ],
  },

  'word-match': {
    learn: 'Past tense forms, prefixes, homophones and meanings',
    questions: [
      match('Match each verb to its past tense.', [['go', 'went'], ['eat', 'ate'], ['run', 'ran'], ['write', 'wrote']]),
      match('Match each verb to its past tense.', [['sing', 'sang'], ['buy', 'bought'], ['teach', 'taught'], ['see', 'saw']]),
      match('Match each word to its opposite.', [['happy', 'unhappy'], ['honest', 'dishonest'], ['possible', 'impossible'], ['kind', 'unkind']]),
      match('Match each word to its meaning.', [
        ['enormous', 'very big'],
        ['ancient', 'very old'],
        ['swift', 'very fast'],
        ['timid', 'shy and easily scared'],
      ]),
      match('Match the words that sound the same.', [['sea', 'see'], ['right', 'write'], ['son', 'sun'], ['flour', 'flower']]),
      match('Match each word to its comparing form.', [['tall', 'taller'], ['good', 'better'], ['bad', 'worse'], ['many', 'more']]),
      match('Match the noun to its adjective.', [['danger', 'dangerous'], ['beauty', 'beautiful'], ['wood', 'wooden'], ['friend', 'friendly']]),
    ],
  },

  'picture-word-match': {
    learn: 'Harder words and words with the same meaning',
    questions: [
      match('Find the picture and its word.', [['🔭', 'telescope'], ['🔬', 'microscope'], ['🧭', 'compass'], ['🌡️', 'thermometer']]),
      match('Find the picture and its word.', [['🦜', 'parrot'], ['🦢', 'swan'], ['🦩', 'flamingo'], ['🐧', 'penguin']]),
      match('Find the picture and its word.', [['🏔️', 'mountain'], ['🏝️', 'island'], ['🏜️', 'desert'], ['🌊', 'wave']]),
      match('Find the picture and its word.', [['🦷', 'tooth'], ['🦴', 'bone'], ['🧠', 'brain'], ['👣', 'footprints']]),
      match('Find the picture and its word.', [['🚜', 'tractor'], ['🚒', 'fire engine'], ['🚑', 'ambulance'], ['🛵', 'scooter']]),
      match('Find the pairs of words that mean the same.', [['quick', 'fast'], ['glad', 'happy'], ['begin', 'start'], ['shut', 'close']]),
      match('Find the pairs of words that mean the same.', [['brave', 'bold'], ['silent', 'quiet'], ['wealthy', 'rich'], ['difficult', 'hard']]),
    ],
  },

  'spell-it': {
    learn: 'Spelling tricky words',
    questions: [
      spell('🐘', 'elephant', ['elefant', 'eliphant', 'elephent']),
      spell('🔭', 'telescope', ['teliscope', 'telescop', 'tellescope']),
      spell('🦜', 'parrot', ['parot', 'perrot', 'parrat']),
      spell('🐧', 'penguin', ['pengiun', 'pengwin', 'penquin']),
      spell('🧭', 'compass', ['compas', 'kompass', 'cumpass']),
      spell('🌡️', 'thermometer', ['thermomitter', 'termometer', 'thermameter']),
      spell('🍍', 'pineapple', ['pinapple', 'pineaple', 'pinaple']),
      spell('🐬', 'dolphin', ['dolfin', 'dolphine', 'dolpin']),
      spell('🚑', 'ambulance', ['ambulence', 'embulance', 'ambulanse']),
      spell('🧠', 'brain', ['brane', 'brayn', 'brein']),
      spell('🍫', 'chocolate', ['chocolete', 'choclate', 'chocalate']),
      spell('🦩', 'flamingo', ['flamingoe', 'flemingo', 'flamango']),
      spell('🏝️', 'island', ['iland', 'ieland', 'islend']),
      spell('🪜', 'ladder', ['lader', 'laddar', 'leddar']),
      spell('🕯️', 'candle', ['candel', 'kandle', 'candal']),
      spell('🧮', 'abacus', ['abacas', 'abbacus', 'abakus']),
    ],
  },

  'missing-letter': {
    learn: 'Tenses, prepositions, articles and comparing words',
    questions: [
      gap('Yesterday, we ___ to the zoo.', ['went', 'go', 'goes', 'will go'], 'went', '"Yesterday" tells us it happened in the past.'),
      gap('Tomorrow, Riya ___ her grandmother.', ['will visit', 'visited', 'visiting'], 'will visit', '"Tomorrow" tells us it will happen in the future.'),
      gap('My father ___ the newspaper every morning.', ['reads', 'reading', 'are reading'], 'reads'),
      gap('I ___ my homework last night.', ['did', 'do', 'will do'], 'did'),
      gap('The sun ___ in the east every day.', ['rises', 'rose', 'rising'], 'rises'),
      gap('Look! The children ___ in the park.', ['are playing', 'played', 'plays'], 'are playing'),
      gap('I was born ___ 2016.', ['in', 'on', 'at'], 'in', 'We use "in" with years and months.'),
      gap('We have a holiday ___ Monday.', ['on', 'in', 'at'], 'on', 'We use "on" with days.'),
      gap("The train leaves ___ 6 o'clock.", ['at', 'in', 'on'], 'at', 'We use "at" with clock times.'),
      gap('He is afraid ___ dogs.', ['of', 'from', 'with'], 'of'),
      gap('___ honest man always tells the truth.', ['An', 'A'], 'An', 'The h in "honest" is silent, so it begins with a vowel sound.'),
      gap('She is ___ best singer in our class.', ['the', 'a', 'an'], 'the'),
      gap('Ravi is ___ than his brother.', ['taller', 'tall', 'tallest'], 'taller'),
      gap('This is the ___ building in the city.', ['tallest', 'taller', 'tall'], 'tallest'),
      gap('Mohan and I ___ good friends.', ['are', 'is', 'am'], 'are'),
      gap('Rani sings ___.', ['sweetly', 'sweet', 'sweeter'], 'sweetly'),
      gap('There are ___ apples in the basket.', ['many', 'much', 'a'], 'many', 'Use "many" for things you can count.'),
    ],
  },

  'sentence-builder': {
    learn: 'Building sentences in the past, present and future',
    questions: [
      build('We visited the Red Fort last week.', ['visit']),
      build('My sister will join a dance class.', ['joined']),
      build('The farmers are working in the fields.', ['is']),
      build('Mother bought fresh vegetables from the market.', ['buys']),
      build('The train arrived ten minutes late.'),
      build('Will you come to my birthday party?', ['came']),
      build('The tortoise won the race at last.', ['win']),
      build('Our teacher told us an interesting story.', ['a']),
      build('I have never seen a real tiger.'),
      build('The children played kabaddi after school.'),
      build('Please do not waste water.', ['does']),
      build('Honesty is the best policy.'),
      build('The kite flew high in the sky.', ['fly']),
      build('Who will clean the classroom today?'),
      build('My grandfather tells funny stories.'),
      build('The peacock danced in the rain.', ['dance']),
    ],
  },

  'grammar-quest': {
    learn: 'Sorting by tense and by part of speech',
    questions: [
      sort(TENSE, { Past: ['played', 'wrote'], Present: ['plays', 'writes'], Future: ['will play', 'will write'] }),
      sort(TENSE, {
        Past: ['She sang a song.', 'We went home.'],
        Present: ['She sings well.', 'We go to school.'],
        Future: ['She will sing.', 'We will go to Goa.'],
      }),
      sort('Is it a present tense word or a past tense word?', { Present: ['is', 'has', 'go'], Past: ['was', 'had', 'went'] }),
      sort('Is it a noun, a verb or an adjective?', { Noun: ['honesty', 'Kolkata'], Verb: ['explore', 'borrow'], Adjective: ['careful', 'ancient'] }),
      sort('Is it a noun, a pronoun or a verb?', { Noun: ['forest', 'Anita'], Pronoun: ['we', 'them'], Verb: ['discover', 'carry'] }),
      sort('Is it an adjective or an adverb?', { Adjective: ['quick', 'gentle', 'loud'], Adverb: ['quickly', 'gently', 'loudly'] }),
      sort('Is it a preposition or a conjunction?', { Preposition: ['under', 'between', 'behind'], Conjunction: ['and', 'but', 'because'] }),
    ],
  },

  'vocabulary-challenge': {
    learn: 'Meanings, synonyms, antonyms, prefixes and similes',
    questions: [
      pick('What does "enormous" mean?', ['very big', 'very small', 'very fast', 'very old'], 'very big'),
      pick('Which word is a synonym of "difficult"?', ['hard', 'easy', 'simple', 'soft'], 'hard'),
      pick('Which word is an antonym of "ancient"?', ['modern', 'old', 'broken', 'large'], 'modern'),
      pick('Which word has a prefix that means "not"?', ['unhappy', 'happily', 'happiness', 'happier'], 'unhappy'),
      pick('What is the opposite of "honest"?', ['dishonest', 'unhonest', 'inhonest', 'nonhonest'], 'dishonest'),
      pick('Which pair of words are homophones?', ['see – sea', 'sit – sat', 'big – bag', 'cup – cap'], 'see – sea', { explain: 'Homophones sound the same but have different spellings and meanings.' }),
      pick('A person who writes books is called an …', ['author', 'editor', 'reader', 'painter'], 'author'),
      pick('Which word means "to look at something carefully"?', ['observe', 'ignore', 'forget', 'borrow'], 'observe'),
      pick('Which is the odd one out?', ['Mercury', 'Mars', 'Jupiter', 'Moon'], 'Moon', { explain: 'The Moon is not a planet. The others are planets.' }),
      pick('Complete the simile: as busy as a …', ['bee', 'mouse', 'lion', 'snail'], 'bee'),
      pick('Complete the simile: as brave as a …', ['lion', 'mouse', 'rabbit', 'deer'], 'lion'),
      pick('What is the plural of "knife"?', ['knives', 'knifes', 'knifs', 'knive'], 'knives'),
      pick('Which word is spelt correctly?', ['necessary', 'neccessary', 'necesary', 'nessesary'], 'necessary'),
      pick('What is the comparing form of "good"?', ['better', 'gooder', 'best', 'more good'], 'better'),
      pick('A place where aeroplanes land and take off is an …', ['airport', 'harbour', 'station', 'garage'], 'airport'),
      pick('Which word means "full of joy"?', ['joyful', 'joyless', 'enjoy', 'joyed'], 'joyful'),
    ],
  },

  'reading-challenge': {
    learn: 'Reading a passage and finding facts and meanings',
    questions: [
      read(BIRDS, 'Where is the Bharatpur Bird Sanctuary?', ['in Rajasthan', 'in Kerala', 'in Assam', 'in Punjab'], 'in Rajasthan'),
      read(BIRDS, 'Why do these birds come to India?', ['to escape the harsh winter', 'to look for water', 'to build big nests', 'to meet other birds'], 'to escape the harsh winter'),
      read(BIRDS, 'What are these birds called?', ['migratory birds', 'water birds', 'wild birds', 'singing birds'], 'migratory birds'),
      read(BIRDS, 'When do the birds fly back?', ['when spring arrives', 'in the middle of winter', 'after one week'], 'when spring arrives'),
      read(BIRDS, 'What does "harsh" mean in the passage?', ['very hard and unpleasant', 'warm and pleasant', 'short and quick'], 'very hard and unpleasant'),
      read(BIRDS, 'Who visits the sanctuary to watch the birds?', ['bird lovers', 'farmers', 'soldiers'], 'bird lovers'),
      read(MOHAN, 'Where did Mohan find the purse?', ['on the road', 'in his classroom', 'in the park'], 'on the road'),
      read(MOHAN, 'How did Mohan know whose purse it was?', ['It had a card with a name and address.', 'A policeman told him.', 'His friend told him.'], 'It had a card with a name and address.'),
      read(MOHAN, 'What kind of boy is Mohan?', ['honest', 'lazy', 'greedy', 'rude'], 'honest'),
      read(MOHAN, 'Who did the purse belong to?', ['an old lady', 'his teacher', 'a shopkeeper'], 'an old lady'),
      read(MOHAN, 'Which words mean the same as "returned" in the passage?', ['gave back', 'took away', 'threw away', 'kept safe'], 'gave back'),
      read(BANYAN, 'What is the national tree of India?', ['the banyan', 'the neem', 'the mango', 'the peepal'], 'the banyan'),
      read(BANYAN, 'What do the branches of a banyan tree send down?', ['roots', 'flowers', 'fruits', 'seeds'], 'roots'),
      read(BANYAN, 'Why do people rest under the banyan tree?', ['It gives cool shade.', 'It has sweet fruit.', 'It is very short.'], 'It gives cool shade.'),
      read(BANYAN, 'Which word describes the trunk of the banyan?', ['huge', 'many', 'national', 'cool'], 'huge'),
    ],
  },

  'english-quiz': {
    learn: 'A mixed quiz on tenses, parts of speech and vocabulary',
    questions: [
      pick('What is the past tense of "bring"?', ['brought', 'bringed', 'brang', 'brung'], 'brought'),
      pick('What is the past tense of "catch"?', ['caught', 'catched', 'cought', 'catch'], 'caught'),
      pick('Which sentence is in the future tense?', ['I will call you tomorrow.', 'I called you yesterday.', 'I call you every day.'], 'I will call you tomorrow.'),
      pick('Which sentence is in the past tense?', ['They played cricket.', 'They play cricket.', 'They will play cricket.'], 'They played cricket.'),
      pick('Which sentence is correct?', ["He doesn't like milk.", "He don't like milk.", 'He not like milk.', "He doesn't likes milk."], "He doesn't like milk."),
      pick('Which word is a preposition: "The cat is hiding ___ the bed."?', ['under', 'quickly', 'happy', 'and'], 'under'),
      pick('Which word is an adverb?', ['slowly', 'gentle', 'garden', 'sing'], 'slowly'),
      pick('Which word is a conjunction?', ['because', 'beside', 'beautiful', 'become'], 'because'),
      pick('Which word is the adjective in "The honest boy returned the purse."?', ['honest', 'boy', 'returned', 'purse'], 'honest'),
      pick('Which word is the verb in "Birds build nests in trees."?', ['build', 'Birds', 'nests', 'trees'], 'build'),
      pick('What is the opposite of "possible"?', ['impossible', 'unpossible', 'dispossible', 'nonpossible'], 'impossible'),
      pick('Which is correct?', ['an hour', 'a hour'], 'an hour', { explain: 'The h in "hour" is silent, so we say "an hour".' }),
      pick('What is the superlative of "big"?', ['biggest', 'bigest', 'more big', 'bigger'], 'biggest'),
      pick('Which word sounds the same as "write"?', ['right', 'white', 'wrote', 'ride'], 'right'),
      pick('Which spelling is correct?', ['February', 'Febuary', 'Febrary', 'Feburary'], 'February'),
      pick('Fill in: She ___ a letter now.', ['is writing', 'wrote', 'will write'], 'is writing'),
      pick('Which tense is "We are watching a film."?', ['present', 'past', 'future'], 'present'),
    ],
  },
};

export default content;
