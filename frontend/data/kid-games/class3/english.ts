import type {
  BuildQuestion,
  ChoiceQuestion,
  MatchQuestion,
  OrderQuestion,
  SortQuestion,
  SubjectContent,
} from '../../../lib/kid-games/types';

/** Class 3 English: nouns, pronouns, verbs, adjectives, articles, vocabulary and short passages. */

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

const DICT = 'Put the words in dictionary order. Look at the second letter.';
const NVA = 'Is it a noun, a verb or an adjective?';
const AN_VOWEL = 'Use "an" before a vowel sound: a, e, i, o, u.';

const KABIR =
  'Kabir loves to visit his grandparents in the village. There, he feeds the cows and climbs mango trees. In the evening, his grandmother tells him stories. Kabir never feels bored in the village.';
const ANTS =
  'The ant is a tiny insect, but it works very hard. Ants live together in large groups called colonies. They collect food in summer and store it for the rainy season.';
const NEHA =
  'Neha planted a sunflower seed in a pot. She watered it every day and kept it in the sun. After a few weeks, a tall plant with a big yellow flower grew.';
const ARJUN =
  'It was Sunday. Arjun and his father went to the market. They bought fresh vegetables and a kilo of bananas. On the way home, they ate hot samosas.';

const content: SubjectContent = {
  'alphabet-adventure': {
    learn: 'Dictionary order by the second letter, and story order',
    questions: [
      order(DICT, ['ant', 'apple', 'arrow', 'aunt']),
      order(DICT, ['bat', 'bell', 'blue', 'boat', 'bush']),
      order(DICT, ['cake', 'chalk', 'clock', 'crow', 'cup']),
      order(DICT, ['dance', 'deep', 'drum', 'duck']),
      order(DICT, ['fan', 'feet', 'fish', 'frog', 'fun']),
      order(DICT, ['game', 'gift', 'goat', 'grass']),
      order(DICT, ['hand', 'help', 'hill', 'hope', 'hut']),
      order(DICT, ['lamp', 'leaf', 'lion', 'lock']),
      order(DICT, ['map', 'milk', 'moon', 'mud']),
      order(DICT, ['rain', 'red', 'rice', 'road', 'rug']),
      order(DICT, ['sand', 'ship', 'sky', 'snow', 'sun']),
      order(DICT, ['table', 'teeth', 'tiger', 'train', 'tub']),
      order('Put the months in order.', ['May', 'June', 'July', 'August', 'September']),
      order('Put the story in order.', [
        'The seed was planted.',
        'It got water and sunlight.',
        'A small plant came out.',
        'It grew into a big tree.',
      ]),
      order('Put the story in order.', [
        'Mina woke up early.',
        'She got ready for school.',
        'She caught the school bus.',
        'She reached school on time.',
      ]),
    ],
  },

  'word-match': {
    learn: 'Opposites, same meanings, plurals and genders',
    questions: [
      match('Match each word to its opposite.', [['rich', 'poor'], ['strong', 'weak'], ['clean', 'dirty'], ['give', 'take']]),
      match('Match each word to its opposite.', [['always', 'never'], ['push', 'pull'], ['remember', 'forget'], ['buy', 'sell']]),
      match('Match the words that mean the same.', [['big', 'large'], ['quick', 'fast'], ['begin', 'start'], ['gift', 'present']]),
      match('Match one to many.', [['leaf', 'leaves'], ['foot', 'feet'], ['lady', 'ladies'], ['knife', 'knives']]),
      match('Match the male to the female.', [['king', 'queen'], ['uncle', 'aunt'], ['nephew', 'niece'], ['lion', 'lioness']]),
      match('Match the group word to what it is used for.', [['herd', 'cows'], ['flock', 'sheep'], ['swarm', 'bees'], ['bunch', 'grapes']]),
      match('Match the animal to its young one.', [['cow', 'calf'], ['sheep', 'lamb'], ['horse', 'foal'], ['frog', 'tadpole']]),
    ],
  },

  'picture-word-match': {
    learn: 'New words for animals, insects, weather and tools',
    questions: [
      match('Find the picture and its word.', [['🦒', 'giraffe'], ['🦓', 'zebra'], ['🐪', 'camel'], ['🦚', 'peacock']]),
      match('Find the picture and its word.', [['🦋', 'butterfly'], ['🐌', 'snail'], ['🕷️', 'spider'], ['🐛', 'caterpillar']]),
      match('Find the picture and its word.', [['🌈', 'rainbow'], ['❄️', 'snowflake'], ['⚡', 'lightning'], ['🌋', 'volcano']]),
      match('Find the picture and its word.', [['🧅', 'onion'], ['🥔', 'potato'], ['🍅', 'tomato'], ['🌶️', 'chilli']]),
      match('Find the picture and its word.', [['🎸', 'guitar'], ['🥁', 'drum'], ['🎺', 'trumpet'], ['🎻', 'violin']]),
      match('Find the picture and its word.', [['🔨', 'hammer'], ['✂️', 'scissors'], ['🔦', 'torch'], ['🧲', 'magnet']]),
      match('Find the picture and its word.', [['🏰', 'castle'], ['⛺', 'tent'], ['🏥', 'hospital'], ['🌉', 'bridge']]),
    ],
  },

  'spell-it': {
    learn: 'Spelling longer and trickier words',
    questions: [
      spell('🦒', 'giraffe', ['girafe', 'jiraffe', 'giraff']),
      spell('🦋', 'butterfly', ['buterfly', 'butterfli', 'butterflie']),
      spell('🌈', 'rainbow', ['rainbo', 'ranebow', 'reinbow']),
      spell('🐪', 'camel', ['camle', 'kamel', 'cammel']),
      spell('🍅', 'tomato', ['tomatto', 'tamato', 'tomatoe']),
      spell('🥔', 'potato', ['potatoe', 'potatto', 'patato']),
      spell('✂️', 'scissors', ['sissors', 'scisors', 'scissers']),
      spell('🎻', 'violin', ['vyolin', 'violen', 'voilin']),
      spell('🏥', 'hospital', ['hospitel', 'hospitle', 'hosptal']),
      spell('🦚', 'peacock', ['peacok', 'pecock', 'peakock']),
      spell('🔦', 'torch', ['torche', 'torsh', 'tortch']),
      spell('🧲', 'magnet', ['magnit', 'megnet', 'magnat']),
      spell('🕷️', 'spider', ['spyder', 'spidder', 'spidar']),
      spell('🥁', 'drum', ['drumm', 'drom', 'drume']),
      spell('🌋', 'volcano', ['valcano', 'volcanoe', 'vulcano']),
      spell('🐌', 'snail', ['snale', 'snial', 'snayl']),
    ],
  },

  'missing-letter': {
    learn: 'Articles, pronouns, is/am/are and describing words',
    questions: [
      gap('Ravi eats ___ apple every day.', ['an', 'a'], 'an', AN_VOWEL),
      gap('She has ___ umbrella.', ['an', 'a'], 'an', AN_VOWEL),
      gap('There is ___ cow in the field.', ['a', 'an'], 'a', 'Use "a" before a consonant sound.'),
      gap('___ sun rises in the east.', ['The', 'A', 'An'], 'The', 'There is only one sun, so we say "the sun".'),
      gap('Riya is my friend. ___ lives near my house.', ['She', 'He', 'They', 'It'], 'She'),
      gap('The boys are playing. ___ are very happy.', ['They', 'He', 'She', 'It'], 'They'),
      gap('This is my pen. Please give ___ to me.', ['it', 'them', 'him', 'they'], 'it'),
      gap('The baby ___ sleeping.', ['is', 'are', 'am'], 'is'),
      gap('We ___ going to the market.', ['are', 'is', 'am'], 'are'),
      gap('I ___ a good student.', ['am', 'is', 'are'], 'am'),
      gap('Sita and Gita ___ sisters.', ['are', 'is', 'am'], 'are'),
      gap('An elephant is a very ___ animal.', ['big', 'tiny', 'thin'], 'big'),
      gap('Sugar tastes ___.', ['sweet', 'sour', 'salty', 'bitter'], 'sweet'),
      gap('Ice is very ___.', ['cold', 'hot', 'warm'], 'cold'),
      gap('Fish ___ in water.', ['swim', 'fly', 'walk', 'climb'], 'swim'),
      gap('Mother ___ tea every morning.', ['makes', 'make', 'making'], 'makes'),
    ],
  },

  'sentence-builder': {
    learn: 'Building sentences of five or six words',
    questions: [
      build('The peacock is a beautiful bird.', ['an']),
      build('My grandmother tells us stories.'),
      build('An owl can see at night.', ['a']),
      build('She is wearing a red dress.', ['are']),
      build('The farmer works in the field.'),
      build('We celebrate Diwali with lamps.'),
      build('The little puppy is very playful.'),
      build('Delhi is the capital of India.'),
      build('They are flying colourful kites.', ['is']),
      build('Do you like to play cricket?', ['does']),
      build('The moon shines at night.'),
      build('He gave me a sweet mango.', ['an']),
      build('Bees make honey from flowers.'),
      build('The old man walks slowly.'),
      build('Please help your little brother.'),
      build('Where is your school bag?', ['are']),
    ],
  },

  'grammar-quest': {
    learn: 'Nouns, verbs, adjectives, proper nouns and a/an',
    questions: [
      sort(NVA, { Noun: ['garden', 'teacher'], Verb: ['write', 'climb'], Adjective: ['tall', 'happy'] }),
      sort(NVA, { Noun: ['river', 'pencil'], Verb: ['laugh', 'carry'], Adjective: ['soft', 'brave'] }),
      sort(NVA, { Noun: ['kitten', 'mountain'], Verb: ['shout', 'dig'], Adjective: ['lazy', 'clever'] }),
      sort('Is it a common noun or a proper noun?', { 'Common noun': ['city', 'river', 'boy'], 'Proper noun': ['Delhi', 'Ganga', 'Rahul'] }),
      sort('Is it a common noun or a proper noun?', {
        'Common noun': ['festival', 'country', 'mountain'],
        'Proper noun': ['Holi', 'India', 'Everest'],
      }),
      sort('Does it take "a" or "an"?', { a: ['banana', 'book', 'tiger'], an: ['owl', 'egg', 'orange'] }),
      sort('Does the describing word tell size, colour or taste?', { Size: ['huge', 'tiny'], Colour: ['purple', 'golden'], Taste: ['sweet', 'sour'] }),
    ],
  },

  'vocabulary-challenge': {
    learn: 'Opposites, synonyms, genders and group words',
    questions: [
      pick('What is the opposite of brave?', ['cowardly', 'bold', 'strong', 'kind'], 'cowardly'),
      pick('Which word means the same as begin?', ['start', 'finish', 'stop', 'end'], 'start'),
      pick('Which word means the same as happy?', ['glad', 'angry', 'upset', 'tired'], 'glad'),
      pick('What is the opposite of rich?', ['poor', 'wealthy', 'kind', 'cheap'], 'poor'),
      pick('Which word is an adjective (describing word)?', ['beautiful', 'run', 'table', 'sing'], 'beautiful'),
      pick('Which word is a proper noun?', ['Mumbai', 'city', 'river', 'school'], 'Mumbai', { explain: 'A proper noun is a special name and begins with a capital letter.' }),
      pick('What is the plural of leaf?', ['leaves', 'leafs', 'leafes', 'leavs'], 'leaves'),
      pick('What is the female of king?', ['queen', 'princess', 'lady', 'kingess'], 'queen'),
      pick('A group of cows is called a …', ['herd', 'flock', 'swarm', 'bunch'], 'herd'),
      pick('What is the young one of a cat called?', ['kitten', 'puppy', 'cub', 'calf'], 'kitten'),
      pick('Which is the odd one out?', ['rose', 'lotus', 'lily', 'parrot'], 'parrot', { explain: 'A parrot is a bird. The others are flowers.' }),
      pick('A person who treats sick people is a …', ['doctor', 'tailor', 'carpenter', 'potter'], 'doctor'),
      pick('Which word fits: "a ___ of grapes"?', ['bunch', 'herd', 'flock', 'pack'], 'bunch'),
      pick('A place where we can borrow and read books is a …', ['library', 'kitchen', 'bank', 'stadium'], 'library'),
      pick('What is the opposite of early?', ['late', 'soon', 'quick', 'first'], 'late'),
      pick('Which word means very big?', ['huge', 'tiny', 'little', 'narrow'], 'huge'),
    ],
  },

  'reading-challenge': {
    learn: 'Reading short passages of three or four sentences',
    questions: [
      read(KABIR, "Where do Kabir's grandparents live?", ['in a village', 'in a big city', 'near the sea'], 'in a village'),
      read(KABIR, 'What does Kabir feed in the village?', ['the cows', 'the hens', 'the fish'], 'the cows'),
      read(KABIR, 'Who tells Kabir stories?', ['his grandmother', 'his grandfather', 'his teacher'], 'his grandmother'),
      read(KABIR, 'How does Kabir feel in the village?', ['He never feels bored.', 'He feels sad.', 'He feels sleepy.'], 'He never feels bored.'),
      read(ANTS, 'What is an ant?', ['an insect', 'a bird', 'a fish'], 'an insect'),
      read(ANTS, 'What are groups of ants called?', ['colonies', 'herds', 'flocks'], 'colonies'),
      read(ANTS, 'When do ants collect food?', ['in summer', 'in winter', 'at night'], 'in summer'),
      read(ANTS, 'Why do ants store food?', ['for the rainy season', 'to sell it', 'to give it to birds'], 'for the rainy season'),
      read(NEHA, 'What did Neha plant?', ['a sunflower seed', 'a mango seed', 'a rose plant'], 'a sunflower seed'),
      read(NEHA, 'Where did Neha keep the pot?', ['in the sun', 'in a dark room', 'under her bed'], 'in the sun'),
      read(NEHA, 'What colour was the flower?', ['yellow', 'red', 'white'], 'yellow'),
      read(NEHA, 'How often did Neha water the seed?', ['every day', 'once a week', 'never'], 'every day'),
      read(ARJUN, 'On which day did they go to the market?', ['Sunday', 'Monday', 'Saturday'], 'Sunday'),
      read(ARJUN, 'Who went to the market with Arjun?', ['his father', 'his mother', 'his sister'], 'his father'),
      read(ARJUN, 'What did they eat on the way home?', ['hot samosas', 'ice cream', 'jalebis'], 'hot samosas'),
    ],
  },

  'english-quiz': {
    learn: 'A mixed quiz on grammar basics and vocabulary',
    questions: [
      pick('Which word is a noun?', ['garden', 'quickly', 'beautiful', 'run'], 'garden'),
      pick('Which word is an adjective?', ['tall', 'tree', 'talk', 'today'], 'tall'),
      pick('Which word is a verb?', ['jump', 'juice', 'jolly', 'jar'], 'jump'),
      pick('Which word is a pronoun?', ['they', 'table', 'tall', 'talk'], 'they'),
      pick('Pick the proper noun.', ['Kolkata', 'city', 'town', 'village'], 'Kolkata'),
      pick('Which is correct?', ['an elephant', 'a elephant'], 'an elephant', { explain: AN_VOWEL }),
      pick('Which sentence is correct?', ['She is reading a book.', 'She are reading a book.', 'She am reading a book.'], 'She is reading a book.'),
      pick('What is the plural of mouse?', ['mice', 'mouses', 'mices', 'mousees'], 'mice'),
      pick('What is the opposite of strong?', ['weak', 'tall', 'big', 'hard'], 'weak'),
      pick('Which word means the same as quick?', ['fast', 'slow', 'late', 'lazy'], 'fast'),
      pick('What is the young one of a hen called?', ['chick', 'cub', 'calf', 'kid'], 'chick'),
      pick('What is the male of aunt?', ['uncle', 'father', 'nephew', 'brother'], 'uncle'),
      pick('Which word comes first in a dictionary?', ['ball', 'bat', 'bell', 'bus'], 'ball'),
      pick('Which spelling is correct?', ['beautiful', 'beutiful', 'beautifull', 'butiful'], 'beautiful'),
      pick('Which word describes the balloon in "a red balloon"?', ['red', 'a', 'balloon'], 'red'),
      pick('Which mark ends a telling sentence?', ['full stop (.)', 'question mark (?)', 'comma (,)'], 'full stop (.)'),
      pick('A group of sheep is called a …', ['flock', 'herd', 'swarm', 'bunch'], 'flock'),
    ],
  },
};

export default content;
