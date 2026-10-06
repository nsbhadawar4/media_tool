import type {
  BuildQuestion,
  ChoiceQuestion,
  MatchQuestion,
  OrderQuestion,
  SortQuestion,
  SubjectContent,
} from '../../../lib/kid-games/types';

/** Class 2 English: simple sentences, spelling, nouns, verbs, pronouns and short reading. */

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
const gap = (visual: string, sentence: string, options: string[], answer: string): ChoiceQuestion =>
  pick('Fill in the missing letter.', options, answer, { visual, sentence });
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

const ABC = 'Put the words in ABC order.';
const SECOND = 'All start with the same letter. Look at the second letter and put them in ABC order.';
const NOUN_VERB = 'Is it a noun (naming word) or a verb (doing word)?';

const RAJU = 'Raju has a pet dog named Moti. Moti is brown. He likes to run in the garden.';
const RAIN = 'It is raining today. Anu takes her yellow umbrella. She goes to school with her brother.';
const LADDOO = 'Grandma makes laddoos for Diwali. The laddoos are round and sweet. Everyone loves them.';
const BIRD = 'A little bird sat on a tree. It sang a sweet song. Then it flew away.';
const ZOO = 'Tina and Sam went to the zoo. They saw a tall giraffe and a big elephant. Sam liked the monkeys best.';

const content: SubjectContent = {
  'alphabet-adventure': {
    learn: 'ABC order of words, days and months',
    questions: [
      order(ABC, ['apple', 'banana', 'grapes', 'mango']),
      order(ABC, ['bird', 'fish', 'horse', 'lion', 'zebra']),
      order(ABC, ['cap', 'desk', 'pen', 'ruler']),
      order(ABC, ['ball', 'doll', 'kite', 'top']),
      order(ABC, ['blue', 'green', 'pink', 'red']),
      order(ABC, ['bread', 'egg', 'milk', 'rice']),
      order(ABC, ['cloud', 'rain', 'sun', 'wind']),
      order(ABC, ['deer', 'elephant', 'monkey', 'tiger']),
      order(SECOND, ['bag', 'bed', 'bird', 'box', 'bus']),
      order(SECOND, ['cat', 'chair', 'cow', 'cup']),
      order(SECOND, ['pan', 'pen', 'pin', 'pot']),
      order(SECOND, ['sky', 'snake', 'spoon', 'sun']),
      order('Put the days of the week in order.', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
      order('Put the months in order.', ['January', 'February', 'March', 'April']),
      order('Put the steps in order.', ['Dig a small hole.', 'Put the seed in.', 'Cover it with soil.', 'Water it.']),
      order('Put the steps in order.', ['Wake up.', 'Get ready.', 'Go to school.', 'Come back home.']),
    ],
  },

  'word-match': {
    learn: 'Opposites, one and many, and pronouns',
    questions: [
      match('Match each word to its opposite.', [['big', 'small'], ['fast', 'slow'], ['happy', 'sad'], ['tall', 'short']]),
      match('Match each word to its opposite.', [['in', 'out'], ['wet', 'dry'], ['full', 'empty'], ['early', 'late']]),
      match('Match one to many.', [['cat', 'cats'], ['box', 'boxes'], ['bus', 'buses'], ['baby', 'babies']]),
      match('Match one to many.', [['man', 'men'], ['child', 'children'], ['tooth', 'teeth'], ['mouse', 'mice']]),
      match('Match the naming word to the pronoun that can take its place.', [['Riya', 'she'], ['Ravi', 'he'], ['the ball', 'it'], ['the boys', 'they']]),
      match('Match the animal to its sound.', [['dog', 'barks'], ['cat', 'mews'], ['cow', 'moos'], ['lion', 'roars']]),
      match('Match the animal to its home.', [['bird', 'nest'], ['dog', 'kennel'], ['bee', 'hive'], ['lion', 'den']]),
    ],
  },

  'picture-word-match': {
    learn: 'Words for animals, food, places and things',
    questions: [
      match('Find the picture and its word.', [['🐘', 'elephant'], ['🐯', 'tiger'], ['🐻', 'bear'], ['🐰', 'rabbit']]),
      match('Find the picture and its word.', [['🍉', 'watermelon'], ['🍍', 'pineapple'], ['🍓', 'strawberry'], ['🥕', 'carrot']]),
      match('Find the picture and its word.', [['🏠', 'house'], ['🏫', 'school'], ['🌳', 'tree'], ['🌸', 'flower']]),
      match('Find the picture and its word.', [['🍞', 'bread'], ['🥛', 'milk'], ['🍚', 'rice'], ['🧀', 'cheese']]),
      match('Find the picture and its word.', [['🎒', 'school bag'], ['📚', 'books'], ['✏️', 'pencil'], ['📏', 'ruler']]),
      match('Find the picture and its word.', [['🚲', 'bicycle'], ['🚂', 'train'], ['🚁', 'helicopter'], ['🛺', 'auto-rickshaw']]),
      match('Find the picture and its word.', [['⏰', 'clock'], ['🔔', 'bell'], ['🪑', 'chair'], ['🚪', 'door']]),
    ],
  },

  'spell-it': {
    learn: 'Spelling everyday words',
    questions: [
      spell('🐯', 'tiger', ['tigar', 'tigur', 'tieger']),
      spell('🌳', 'tree', ['tre', 'trea', 'tri']),
      spell('🏠', 'house', ['hous', 'howse', 'haus']),
      spell('🐦', 'bird', ['berd', 'burd', 'brid']),
      spell('🍌', 'banana', ['bananna', 'banena', 'bannana']),
      spell('🐒', 'monkey', ['monky', 'munkey', 'monkee']),
      spell('🌸', 'flower', ['flowr', 'flawer', 'flowar']),
      spell('🐰', 'rabbit', ['rabit', 'rebbit', 'rabbet']),
      spell('🍎', 'apple', ['aple', 'appel', 'apel']),
      spell('🪑', 'chair', ['chare', 'cheir', 'chiar']),
      spell('⏰', 'clock', ['clok', 'klock', 'clocke']),
      spell('🥛', 'milk', ['milc', 'mylk', 'melk']),
      spell('🚂', 'train', ['trane', 'trian', 'tren']),
      spell('🦆', 'duck', ['duk', 'dack', 'duc']),
      spell('🌙', 'moon', ['mun', 'mone', 'muun']),
      spell('🐸', 'frog', ['frogg', 'frag', 'forg']),
    ],
  },

  'missing-letter': {
    learn: 'Missing letters in longer words',
    questions: [
      gap('🐯', 'ti___er', ['g', 'j', 'q', 'd'], 'g'),
      gap('🐘', 'ele___hant', ['p', 'f', 'b', 'v'], 'p'),
      gap('🍉', 'water___elon', ['m', 'n', 'w', 'b'], 'm'),
      gap('🌳', 'tr___e', ['e', 'a', 'i', 'u'], 'e'),
      gap('🏫', 'sch___ol', ['o', 'u', 'a', 'e'], 'o'),
      gap('🐦', 'b___rd', ['i', 'e', 'u', 'a'], 'i'),
      gap('🚂', 'tr___in', ['a', 'e', 'i', 'o'], 'a'),
      gap('🌸', 'flo___er', ['w', 'v', 'u', 'r'], 'w'),
      gap('📚', 'bo___ks', ['o', 'u', 'a', 'e'], 'o'),
      gap('✏️', 'pen___il', ['c', 's', 'k', 'z'], 'c'),
      gap('🥕', 'car___ot', ['r', 'l', 't', 'd'], 'r'),
      gap('⏰', 'clo___k', ['c', 'k', 's', 'q'], 'c'),
      gap('🐻', 'b___ar', ['e', 'a', 'i', 'o'], 'e'),
      gap('🍞', 'brea___', ['d', 't', 'b', 'p'], 'd'),
      gap('🐰', 'rab___it', ['b', 'd', 'p', 'v'], 'b'),
      gap('☂️', 'umbr___lla', ['e', 'a', 'i', 'o'], 'e'),
    ],
  },

  'sentence-builder': {
    learn: 'Simple sentences with he, she, it and they',
    questions: [
      build('She is my sister.', ['her']),
      build('He plays with a ball.', ['play']),
      build('They are going to school.', ['is']),
      build('It is a sunny day.'),
      build('We eat rice for lunch.'),
      build('My mother cooks food.', ['cook']),
      build('The dog runs very fast.'),
      build('I drink milk every day.', ['am']),
      build('Ravi has a new bicycle.', ['have']),
      build('The children are playing.', ['is']),
      build('Can you see the moon?'),
      build('Please close the door.'),
      build('The flowers are very pretty.'),
      build('He is reading a book.', ['she']),
      build('We go to the park.'),
      build('The bird is in the nest.'),
    ],
  },

  'grammar-quest': {
    learn: 'Nouns, verbs, one and many, he and she',
    questions: [
      sort(NOUN_VERB, { Nouns: ['table', 'girl', 'mango'], Verbs: ['run', 'jump', 'eat'] }),
      sort(NOUN_VERB, { Nouns: ['school', 'doctor', 'pencil'], Verbs: ['sing', 'write', 'swim'] }),
      sort(NOUN_VERB, { Nouns: ['river', 'teacher', 'cup'], Verbs: ['read', 'sleep', 'cry'] }),
      sort(NOUN_VERB, { Nouns: ['kite', 'sister', 'garden'], Verbs: ['laugh', 'climb', 'walk'] }),
      sort('Is it one or more than one?', { One: ['book', 'mouse', 'bus'], 'More than one': ['cats', 'men', 'flowers'] }),
      sort('Which pronoun can take its place: he or she?', { He: ['boy', 'father', 'king'], She: ['girl', 'mother', 'queen'] }),
      sort('Is it a person, a place or a thing?', { Person: ['teacher', 'farmer'], Place: ['park', 'market'], Thing: ['spoon', 'clock'] }),
    ],
  },

  'vocabulary-challenge': {
    learn: 'Opposites, same meanings, plurals and word groups',
    questions: [
      pick('What is the opposite of happy?', ['sad', 'glad', 'kind', 'tall'], 'sad'),
      pick('What is the opposite of fast?', ['slow', 'quick', 'fat', 'far'], 'slow'),
      pick('Which word means the same as big?', ['large', 'little', 'tiny', 'thin'], 'large'),
      pick('Which word means the same as little?', ['small', 'huge', 'long', 'heavy'], 'small'),
      pick('What is the plural of box?', ['boxes', 'boxs', 'boxies', 'boxen'], 'boxes', { explain: 'Words ending in x add -es: box, boxes.' }),
      pick('What is the plural of child?', ['children', 'childs', 'childes', 'childrens'], 'children'),
      pick('Which is the odd one out?', ['Monday', 'Friday', 'Sunday', 'January'], 'January', { explain: 'January is a month. The others are days.' }),
      pick('Which is the odd one out?', ['pen', 'pencil', 'eraser', 'mango'], 'mango', { explain: 'A mango is a fruit. The others are things we write with.' }),
      pick('Which word is a doing word?', ['jump', 'chair', 'green', 'happy'], 'jump'),
      pick('Which word is a naming word?', ['teacher', 'run', 'sing', 'quickly'], 'teacher'),
      pick('Where does a bird live?', ['nest', 'hive', 'den', 'kennel'], 'nest'),
      pick('Who teaches children at school?', ['teacher', 'doctor', 'farmer', 'driver'], 'teacher'),
      pick('Which word rhymes with cake?', ['lake', 'cook', 'cap', 'kite'], 'lake'),
      pick('Which day comes after Monday?', ['Tuesday', 'Sunday', 'Wednesday', 'Friday'], 'Tuesday'),
      pick('A person who grows crops is a …', ['farmer', 'tailor', 'pilot', 'baker'], 'farmer'),
      pick('Which pronoun can take the place of "Meena and I"?', ['we', 'they', 'she', 'he'], 'we'),
    ],
  },

  'reading-challenge': {
    learn: 'Reading two or three short sentences',
    questions: [
      read(RAJU, "What is the name of Raju's dog?", ['Moti', 'Raju', 'Tommy'], 'Moti'),
      read(RAJU, 'What colour is Moti?', ['brown', 'white', 'black'], 'brown'),
      read(RAJU, 'Where does Moti like to run?', ['in the garden', 'on the road', 'in the kitchen'], 'in the garden'),
      read(RAIN, 'What is the weather like today?', ['rainy', 'sunny', 'snowy'], 'rainy'),
      read(RAIN, 'What colour is the umbrella?', ['yellow', 'red', 'blue'], 'yellow'),
      read(RAIN, 'Who goes to school with Anu?', ['her brother', 'her mother', 'her friend'], 'her brother'),
      read(LADDOO, 'When does Grandma make laddoos?', ['for Diwali', 'for a birthday', 'every Monday'], 'for Diwali'),
      read(LADDOO, 'What shape are the laddoos?', ['round', 'square', 'flat'], 'round'),
      read(BIRD, 'Where did the bird sit?', ['on a tree', 'on a roof', 'on a wall'], 'on a tree'),
      read(BIRD, 'What did the bird do after singing?', ['It flew away.', 'It went to sleep.', 'It ate a worm.'], 'It flew away.'),
      read(ZOO, 'Where did Tina and Sam go?', ['to the zoo', 'to the park', 'to the market'], 'to the zoo'),
      read(ZOO, 'Which animals did Sam like best?', ['the monkeys', 'the giraffes', 'the elephants'], 'the monkeys'),
      read(ZOO, 'Which tall animal did they see?', ['a giraffe', 'a camel', 'a horse'], 'a giraffe'),
      read(LADDOO, 'How do the laddoos taste?', ['sweet', 'sour', 'salty'], 'sweet'),
      read(BIRD, 'What did the bird sing?', ['a sweet song', 'a sad song', 'a loud song'], 'a sweet song'),
    ],
  },

  'english-quiz': {
    learn: 'A mixed quiz on nouns, verbs, pronouns and spelling',
    questions: [
      pick('Which word is a naming word (noun)?', ['garden', 'jump', 'sing', 'slowly'], 'garden'),
      pick('Which word is a doing word (verb)?', ['write', 'table', 'red', 'tall'], 'write'),
      pick('Fill in: ___ is my brother.', ['He', 'She', 'It', 'They'], 'He'),
      pick('Which word can take the place of "the ball"?', ['it', 'he', 'she', 'they'], 'it'),
      pick('Which word can take the place of "Rahul and Sita"?', ['they', 'he', 'she', 'it'], 'they'),
      pick('Which spelling is correct?', ['friend', 'freind', 'frend', 'frind'], 'friend'),
      pick('Which spelling is correct?', ['school', 'scool', 'skool', 'schol'], 'school'),
      pick('What is the plural of cat?', ['cats', 'cates', 'catz', 'catts'], 'cats'),
      pick('What is the opposite of day?', ['night', 'light', 'noon', 'morning'], 'night'),
      pick('Which sentence is correct?', ['I am a girl.', 'I is a girl.', 'I are a girl.', 'I be a girl.'], 'I am a girl.'),
      pick('A sentence begins with a … letter.', ['capital', 'small', 'red', 'round'], 'capital'),
      pick('Which mark comes at the end of a question?', ['?', '.', ',', '!'], '?'),
      pick('How many days are there in a week?', ['seven', 'five', 'six', 'ten'], 'seven'),
      pick('Which word rhymes with ball?', ['tall', 'bell', 'bill', 'bowl'], 'tall'),
      pick('Which word means the same as shut?', ['close', 'open', 'push', 'pull'], 'close'),
      pick('Which word names an animal?', ['rabbit', 'rubber', 'ribbon', 'river'], 'rabbit'),
    ],
  },
};

export default content;
