import type {
  BuildQuestion,
  ChoiceQuestion,
  MatchQuestion,
  OrderQuestion,
  SortQuestion,
  SubjectContent,
} from '../../../lib/kid-games/types';

/** Class 1 English: A to Z, big and small letters, first sounds, colours, animals and first words. */

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

const ABC = 'Put the letters in ABC order.';
const ABC_WORDS = 'Put the words in ABC order.';

const content: SubjectContent = {
  'alphabet-adventure': {
    learn: 'Letters A to Z in order',
    questions: [
      order(ABC, ['A', 'B', 'C', 'D']),
      order(ABC, ['E', 'F', 'G', 'H']),
      order(ABC, ['I', 'J', 'K', 'L', 'M']),
      order(ABC, ['N', 'O', 'P', 'Q']),
      order(ABC, ['R', 'S', 'T', 'U']),
      order(ABC, ['V', 'W', 'X', 'Y', 'Z']),
      order(ABC, ['B', 'D', 'F', 'H']),
      order(ABC, ['a', 'b', 'c', 'd', 'e']),
      order(ABC, ['f', 'g', 'h', 'i']),
      order(ABC, ['j', 'k', 'l', 'm', 'n']),
      order(ABC, ['o', 'p', 'q', 'r', 's']),
      order(ABC, ['t', 'u', 'v', 'w', 'x']),
      order(ABC_WORDS, ['apple', 'ball', 'cat', 'dog']),
      order(ABC_WORDS, ['egg', 'fish', 'goat', 'hat']),
      order(ABC_WORDS, ['ink', 'jug', 'kite', 'lion']),
      order('Put the number words in order.', ['one', 'two', 'three', 'four', 'five']),
      order('Put the number words in order.', ['six', 'seven', 'eight', 'nine', 'ten']),
    ],
  },

  'word-match': {
    learn: 'Big and small letters, first sounds and number words',
    questions: [
      match('Match the big letter to its small letter.', [['A', 'a'], ['B', 'b'], ['D', 'd'], ['E', 'e']]),
      match('Match the big letter to its small letter.', [['G', 'g'], ['H', 'h'], ['M', 'm'], ['R', 'r']]),
      match('Match the big letter to its small letter.', [['N', 'n'], ['Q', 'q'], ['T', 't'], ['Y', 'y']]),
      match('Match the letter to the word that starts with it.', [['A', 'apple'], ['B', 'ball'], ['C', 'cat'], ['D', 'dog']]),
      match('Match the letter to the word that starts with it.', [['F', 'fish'], ['G', 'goat'], ['H', 'hen'], ['S', 'sun']]),
      match('Match the number to its word.', [['1', 'one'], ['2', 'two'], ['3', 'three'], ['4', 'four']]),
      match('Match the number to its word.', [['5', 'five'], ['6', 'six'], ['7', 'seven'], ['8', 'eight']]),
      match('Match the animal to its baby.', [['cat', 'kitten'], ['dog', 'puppy'], ['hen', 'chick'], ['cow', 'calf']]),
      match('Match each word to its opposite.', [['big', 'small'], ['hot', 'cold'], ['up', 'down'], ['day', 'night']]),
    ],
  },

  'picture-word-match': {
    learn: 'Animals, fruits, colours and things around us',
    questions: [
      match('Find the picture and its word.', [['🐱', 'cat'], ['🐶', 'dog'], ['🐮', 'cow'], ['🐟', 'fish']]),
      match('Find the picture and its word.', [['🦁', 'lion'], ['🐒', 'monkey'], ['🐐', 'goat'], ['🐸', 'frog']]),
      match('Find the picture and its word.', [['🍎', 'apple'], ['🍌', 'banana'], ['🥭', 'mango'], ['🍇', 'grapes']]),
      match('Find the picture and its word.', [['⚽', 'ball'], ['🪁', 'kite'], ['🎩', 'hat'], ['🚌', 'bus']]),
      match('Find the picture and its word.', [['☀️', 'sun'], ['🌙', 'moon'], ['⭐', 'star'], ['☁️', 'cloud']]),
      match('Find the picture and its word.', [['🚗', 'car'], ['✈️', 'aeroplane'], ['🚂', 'train'], ['🚢', 'ship']]),
      match('Find the picture and its word.', [['👁️', 'eye'], ['👂', 'ear'], ['👃', 'nose'], ['✋', 'hand']]),
      match('Find the colour and its name.', [['🔴', 'red'], ['🔵', 'blue'], ['🟢', 'green'], ['🟡', 'yellow']]),
    ],
  },

  'spell-it': {
    learn: 'Spelling three-letter words',
    questions: [
      spell('🐱', 'cat', ['bat', 'cot', 'car']),
      spell('🐶', 'dog', ['dug', 'dot', 'log']),
      spell('🐷', 'pig', ['peg', 'big', 'pin']),
      spell('🚌', 'bus', ['bas', 'bun', 'bud']),
      spell('🎩', 'hat', ['hut', 'hit', 'mat']),
      spell('☀️', 'sun', ['sen', 'run', 'fun']),
      spell('🐜', 'ant', ['and', 'art', 'ent']),
      spell('🐔', 'hen', ['hin', 'ten', 'pen']),
      spell('🥚', 'egg', ['eeg', 'agg', 'ugg']),
      spell('🛏️', 'bed', ['bad', 'red', 'bud']),
      spell('🦊', 'fox', ['box', 'fix', 'fax']),
      spell('🐀', 'rat', ['rot', 'cat', 'ran']),
      spell('🐄', 'cow', ['caw', 'cou', 'how']),
      spell('🧢', 'cap', ['cup', 'cop', 'map']),
      spell('☕', 'cup', ['cap', 'cop', 'pup']),
      spell('🔑', 'key', ['kay', 'kee', 'ley']),
    ],
  },

  'missing-letter': {
    learn: 'Finding the missing letter in a word',
    questions: [
      gap('🐱', 'c___t', ['a', 'o', 'u', 'i'], 'a'),
      gap('🐶', 'd___g', ['o', 'a', 'i', 'e'], 'o'),
      gap('🐷', 'p___g', ['i', 'a', 'e', 'u'], 'i'),
      gap('☀️', 's___n', ['u', 'a', 'i', 'e'], 'u'),
      gap('🐟', 'f___sh', ['i', 'a', 'e', 'o'], 'i'),
      gap('🍎', '___pple', ['a', 'e', 'o', 'u'], 'a'),
      gap('🥭', 'm___ngo', ['a', 'e', 'i', 'u'], 'a'),
      gap('🐔', 'h___n', ['e', 'a', 'i', 'o'], 'e'),
      gap('🦁', 'lio___', ['n', 'm', 'r', 't'], 'n'),
      gap('🚌', 'b___s', ['u', 'a', 'o', 'i'], 'u'),
      gap('🐸', 'fr___g', ['o', 'a', 'i', 'u'], 'o'),
      gap('⭐', 's___ar', ['t', 'p', 'c', 'k'], 't'),
      gap('🍌', '___anana', ['b', 'd', 'p', 'n'], 'b'),
      gap('🐮', 'co___', ['w', 'v', 'u', 'm'], 'w'),
      gap('🐐', 'g___at', ['o', 'a', 'e', 'i'], 'o'),
      gap('🪁', 'ki___e', ['t', 'd', 'l', 'f'], 't'),
    ],
  },

  'sentence-builder': {
    learn: 'Making short sentences of three or four words',
    questions: [
      build('I can run.', ['cat']),
      build('The cat is fat.'),
      build('I see a dog.', ['an']),
      build('The sun is hot.'),
      build('I like mangoes.'),
      build('The ball is red.', ['are']),
      build('This is my bag.'),
      build('The fish can swim.'),
      build('I am happy.', ['is']),
      build('The sky is blue.'),
      build('Look at the kite.'),
      build('The cow is big.', ['small']),
      build('I have a pen.'),
      build('Birds can fly.'),
      build('We play cricket.'),
      build('My cap is green.'),
    ],
  },

  'grammar-quest': {
    learn: 'Sorting animals, colours, fruits and letters',
    questions: [
      sort('Is it an animal or a fruit?', { Animals: ['cat', 'lion', 'cow'], Fruits: ['apple', 'mango', 'banana'] }),
      sort('Is it an animal or a colour?', { Animals: ['dog', 'goat', 'horse'], Colours: ['red', 'blue', 'green'] }),
      sort('Is it a fruit or a colour?', { Fruits: ['grapes', 'guava', 'papaya'], Colours: ['pink', 'yellow', 'black'] }),
      sort('Animal, colour or fruit?', { Animals: ['tiger', 'monkey'], Colours: ['white', 'brown'], Fruits: ['pear', 'cherry'] }),
      sort('Is it a big letter or a small letter?', { 'Big letters': ['A', 'G', 'R'], 'Small letters': ['b', 'h', 'q'] }),
      sort('Is it a vowel or a consonant?', { Vowels: ['a', 'e', 'o'], Consonants: ['b', 'k', 't'] }),
      sort('Can it fly or not?', { 'Can fly': ['parrot', 'crow', 'butterfly'], 'Cannot fly': ['elephant', 'rabbit', 'camel'] }),
      sort('Is it a number word or a colour?', { 'Number words': ['one', 'two', 'six'], Colours: ['red', 'grey', 'purple'] }),
    ],
  },

  'vocabulary-challenge': {
    learn: 'First words, colours, opposites and rhymes',
    questions: [
      pick('Which word starts with B?', ['ball', 'cat', 'dog', 'sun'], 'ball'),
      pick('Which word is a colour?', ['green', 'goat', 'gate', 'girl'], 'green'),
      pick('Which word is an animal?', ['tiger', 'table', 'tomato', 'tap'], 'tiger'),
      pick('What is the opposite of big?', ['small', 'tall', 'fat', 'long'], 'small'),
      pick('What is the opposite of hot?', ['cold', 'warm', 'wet', 'sunny'], 'cold'),
      pick('Which one is a fruit?', ['mango', 'milk', 'mouse', 'mat'], 'mango'),
      pick('Which word means 3?', ['three', 'tree', 'ten', 'two'], 'three'),
      pick('Which is the odd one out?', ['red', 'blue', 'cat', 'green'], 'cat', { explain: 'Red, blue and green are colours. A cat is an animal.' }),
      pick('Which is the odd one out?', ['dog', 'cat', 'cow', 'apple'], 'apple', { explain: 'An apple is a fruit. The others are animals.' }),
      pick('What colour is a ripe banana?', ['yellow', 'blue', 'black', 'pink'], 'yellow'),
      pick('What colour is grass?', ['green', 'red', 'white', 'purple'], 'green'),
      pick('Which word rhymes with cat?', ['hat', 'cup', 'dog', 'sun'], 'hat'),
      pick('Which word rhymes with sun?', ['fun', 'sit', 'pen', 'cap'], 'fun'),
      pick('What is a baby dog called?', ['puppy', 'kitten', 'calf', 'chick'], 'puppy'),
      pick('Which word starts with the same sound as fish?', ['fan', 'van', 'pan', 'man'], 'fan'),
      pick('Which animal says "moo"?', ['cow', 'cat', 'dog', 'duck'], 'cow'),
    ],
  },

  'reading-challenge': {
    learn: 'Reading one or two short sentences',
    questions: [
      read('Sam has a red ball. He plays with his dog.', 'What colour is the ball?', ['red', 'blue', 'green'], 'red'),
      read('Sam has a red ball. He plays with his dog.', 'Who does Sam play with?', ['his dog', 'his cat', 'his sister'], 'his dog'),
      read('Riya has a cat. The cat is white.', 'What does Riya have?', ['a cat', 'a dog', 'a hen'], 'a cat'),
      read('Riya has a cat. The cat is white.', 'What colour is the cat?', ['white', 'black', 'brown'], 'white'),
      read('The sun is up. It is a hot day.', 'What kind of day is it?', ['hot', 'cold', 'rainy'], 'hot'),
      read('Ali eats a mango. The mango is sweet.', 'What does Ali eat?', ['a mango', 'an apple', 'a banana'], 'a mango'),
      read('Ali eats a mango. The mango is sweet.', 'How does the mango taste?', ['sweet', 'sour', 'salty'], 'sweet'),
      read('I see six ducks in the pond.', 'How many ducks are there?', ['six', 'five', 'seven'], 'six'),
      read('I see six ducks in the pond.', 'Where are the ducks?', ['in the pond', 'in a tree', 'in the house'], 'in the pond'),
      read('Meena has a blue kite. She flies it in the park.', 'What colour is the kite?', ['blue', 'red', 'yellow'], 'blue'),
      read('Meena has a blue kite. She flies it in the park.', 'Where does Meena fly the kite?', ['in the park', 'at school', 'on a bus'], 'in the park'),
      read('The frog can jump. It sits on a big leaf.', 'What can the frog do?', ['jump', 'fly', 'read'], 'jump'),
      read('The frog can jump. It sits on a big leaf.', 'Where does the frog sit?', ['on a big leaf', 'on a cup', 'on a bed'], 'on a big leaf'),
      read('Tom has two pens. One pen is black.', 'How many pens does Tom have?', ['two', 'one', 'three'], 'two'),
      read('Tom has two pens. One pen is black.', 'What colour is one of the pens?', ['black', 'green', 'pink'], 'black'),
    ],
  },

  'english-quiz': {
    learn: 'A mixed quiz on letters, sounds and first words',
    questions: [
      pick('Which letter comes after C?', ['D', 'B', 'E', 'F'], 'D'),
      pick('Which letter comes before M?', ['L', 'N', 'K', 'O'], 'L'),
      pick('What is the small letter for G?', ['g', 'j', 'q', 'p'], 'g'),
      pick('What is the big letter for r?', ['R', 'P', 'B', 'K'], 'R'),
      pick('Which word starts with S?', ['sun', 'moon', 'cup', 'hat'], 'sun'),
      pick('Which letter is a vowel?', ['e', 'b', 'd', 'k'], 'e', { explain: 'The vowels are a, e, i, o and u.' }),
      pick('How do you spell 5?', ['five', 'fiv', 'fife', 'vive'], 'five'),
      pick('What colour is the sky on a sunny day?', ['blue', 'green', 'pink', 'brown'], 'blue'),
      pick('Which animal can fly?', ['parrot', 'cow', 'dog', 'goat'], 'parrot'),
      pick('Pick the right spelling.', ['fish', 'fesh', 'fich', 'fsh'], 'fish', { visual: '🐟' }),
      pick('What is the opposite of up?', ['down', 'top', 'on', 'in'], 'down'),
      pick('Which word rhymes with pen?', ['ten', 'pan', 'pin', 'pot'], 'ten'),
      pick('Which letter does "ball" start with?', ['b', 'd', 'p', 'l'], 'b'),
      pick('How many letters are there in the English alphabet?', ['26', '24', '20', '28'], '26'),
      pick('What comes next: one, two, three, …?', ['four', 'five', 'six', 'ten'], 'four'),
      pick('Which one is a fruit?', ['banana', 'bus', 'bat', 'bell'], 'banana'),
      pick('Which word ends with t?', ['cat', 'cup', 'dog', 'sun'], 'cat'),
    ],
  },
};

export default content;
