import type { ClassTitles } from '../../../lib/kid-games/types';

/**
 * What each English game is called in each class. The mechanic of a slot never changes (see
 * TEMPLATES in lib/kid-games/catalog.ts); the name and the learning goal follow the class.
 */
const titles: ClassTitles = {
  1: {
    'alphabet-adventure': { title: 'Alphabet Adventure', description: 'Put the letters A to Z in order.' },
    'word-match': { title: 'Letter Match', description: 'Match big letters, small letters and first sounds.' },
    'picture-word-match': { title: 'Picture Word Match', description: 'Flip cards to pair pictures with their words.' },
    'spell-it': { title: 'Spell It', description: 'Look at the picture and pick the right spelling.' },
    'missing-letter': { title: 'Missing Letter', description: 'Find the letter missing from the word.' },
    'sentence-builder': { title: 'Simple Sentence', description: 'Put three or four words together to make a sentence.' },
    'grammar-quest': { title: 'Sorting Fun', description: 'Sort animals, colours, fruits and letters.' },
    'vocabulary-challenge': { title: 'Beginning Sound', description: 'First sounds, colours, opposites and rhymes.' },
    'reading-challenge': { title: 'Read and Find', description: 'Read a tiny sentence and answer the question.' },
    'english-quiz': { title: 'ABC Quiz', description: 'A mixed quiz on letters, sounds and first words.' },
  },
  2: {
    'alphabet-adventure': { title: 'Days and Months', description: 'Put words, days and months in order.' },
    'word-match': { title: 'Opposite Words', description: 'Match opposites, plurals and pronouns.' },
    'picture-word-match': { title: 'Picture Vocabulary', description: 'Flip cards to pair pictures with their words.' },
    'spell-it': { title: 'Spell Challenge', description: 'Pick the right spelling of everyday words.' },
    'missing-letter': { title: 'Word Scramble', description: 'Find the letters missing from longer words.' },
    'sentence-builder': { title: 'Sentence Builder', description: 'Build sentences with he, she, it and they.' },
    'grammar-quest': { title: 'Noun and Verb Hunt', description: 'Sort naming words and doing words.' },
    'vocabulary-challenge': { title: 'Plural Match', description: 'Opposites, same meanings and one or many.' },
    'reading-challenge': { title: 'Story Time', description: 'Read short sentences and answer questions.' },
    'english-quiz': { title: 'Word Power Quiz', description: 'Nouns, verbs, pronouns and spelling in one quiz.' },
  },
  3: {
    'alphabet-adventure': { title: 'Dictionary Detective', description: 'Order words by their second letter, and put stories in order.' },
    'word-match': { title: 'Synonym Match', description: 'Match opposites, same meanings, plurals and genders.' },
    'picture-word-match': { title: 'Nature Words', description: 'Flip cards: animals, insects, weather and tools.' },
    'spell-it': { title: 'Tricky Spellings', description: 'Pick the right spelling of longer words.' },
    'missing-letter': { title: 'Missing Word', description: 'Fill in a, an, the, is, am, are and describing words.' },
    'sentence-builder': { title: 'Sentence Maker', description: 'Build sentences of five or six words.' },
    'grammar-quest': { title: 'Adjective Quest', description: 'Sort nouns, verbs and adjectives.' },
    'vocabulary-challenge': { title: 'Word Wizard', description: 'Opposites, synonyms, genders and group words.' },
    'reading-challenge': { title: 'Reading Detective', description: 'Read short passages and find the answers.' },
    'english-quiz': { title: 'Grammar Quiz', description: 'A mixed quiz on grammar basics and vocabulary.' },
  },
  4: {
    'alphabet-adventure': { title: 'Dictionary Skills', description: 'Order words that begin the same way.' },
    'word-match': { title: 'Tense Match', description: 'Match verbs to their past tense, prefixes and homophones.' },
    'picture-word-match': { title: 'Big Word Memory', description: 'Flip cards: harder words and their meanings.' },
    'spell-it': { title: 'Spelling Bee', description: 'Choose the right spelling of tricky words.' },
    'missing-letter': { title: 'Preposition Puzzle', description: 'Fill in tenses, prepositions and comparing words.' },
    'sentence-builder': { title: 'Time Travel Sentences', description: 'Build sentences in the past, present and future.' },
    'grammar-quest': { title: 'Parts of Speech', description: 'Sort words by tense and part of speech.' },
    'vocabulary-challenge': { title: 'Synonyms and Antonyms', description: 'Meanings, prefixes and similes.' },
    'reading-challenge': { title: 'Comprehension Quest', description: 'Read a passage and find facts and meanings.' },
    'english-quiz': { title: 'Tense Challenge', description: 'Tenses, parts of speech and vocabulary.' },
  },
  5: {
    'alphabet-adventure': { title: 'Event Order', description: 'Order long words and the events of a story.' },
    'word-match': { title: 'Idiom Match', description: 'Past participles, idioms and one-word answers.' },
    'picture-word-match': { title: 'Science Words', description: 'Flip cards: science words, synonyms and homophones.' },
    'spell-it': { title: 'Spelling Master', description: 'Choose the right spelling of long, difficult words.' },
    'missing-letter': { title: 'Tense Fix', description: 'Continuous and perfect tenses, agreement and prepositions.' },
    'sentence-builder': { title: 'Sentence Correction', description: 'Build long sentences with the right tense and agreement.' },
    'grammar-quest': { title: 'Agreement Quest', description: 'Countable nouns, subject–verb agreement and tense forms.' },
    'vocabulary-challenge': { title: 'Vocabulary Master', description: 'Synonyms, antonyms, idioms and word forms.' },
    'reading-challenge': { title: 'Deep Reading', description: 'Read longer passages and think about them.' },
    'english-quiz': { title: 'English Champion', description: 'Tenses, agreement and vocabulary in one big quiz.' },
  },
};

export default titles;
