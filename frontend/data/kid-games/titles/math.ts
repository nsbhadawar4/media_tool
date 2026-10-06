import type { ClassTitles } from '../../../lib/kid-games/types';

/**
 * What each Maths game is called in each class. The mechanic of a slot never changes (see
 * TEMPLATES in lib/kid-games/catalog.ts); the name and the learning goal follow the class.
 */
const titles: ClassTitles = {
  1: {
    'number-runner': { title: 'Number Order', description: 'Line up numbers up to 50, smallest first.' },
    'counting-challenge': { title: 'Count the Objects', description: 'Count the pictures and type how many.' },
    'addition-adventure': { title: 'Addition Fun', description: 'Add numbers within 20.' },
    'subtraction-challenge': { title: 'Subtraction Fun', description: 'Take away within 20 and type what is left.' },
    'multiplication-quest': { title: 'Equal Groups', description: 'Add the same number again and again.' },
    'division-challenge': { title: 'Share It Out', description: 'Share equally and match each to how many it gets.' },
    'number-comparison': { title: 'Bigger or Smaller', description: 'Sort numbers into bigger and smaller.' },
    'missing-number': { title: 'Missing Number', description: 'Find the number that is missing.' },
    'pattern-puzzle': { title: 'Simple Patterns', description: 'Spot the colour, shape or number pattern.' },
    'math-quiz': { title: 'Shape and Money Quiz', description: 'Shapes, time, money and sums in one quiz.' },
  },
  2: {
    'number-runner': { title: 'Number Adventure', description: 'Put two- and three-digit numbers in order.' },
    'counting-challenge': { title: 'Place Value', description: 'Skip count and find tens and ones.' },
    'addition-adventure': { title: 'Addition Challenge', description: 'Add two-digit numbers.' },
    'subtraction-challenge': { title: 'Subtraction Race', description: 'Subtract two-digit numbers.' },
    'multiplication-quest': { title: 'Multiplication Intro', description: 'Tables of 2, 3, 4 and 5.' },
    'division-challenge': { title: 'Division Intro', description: 'Share equally and make groups.' },
    'number-comparison': { title: 'Number Comparison', description: 'Compare numbers; sort even, odd, 2D and 3D.' },
    'missing-number': { title: 'Number Detective', description: 'Find missing numbers in sums and tables.' },
    'pattern-puzzle': { title: 'Patterns', description: 'Shape patterns and skip-counting patterns.' },
    'math-quiz': { title: 'Time and Money Match', description: 'Clocks, rupees, shapes and place value.' },
  },
  3: {
    'number-runner': { title: 'Fraction Line-up', description: 'Order 3-digit numbers, fractions and lengths.' },
    'counting-challenge': { title: 'Place Value Puzzle', description: 'Place value, skip counting, faces and edges.' },
    'addition-adventure': { title: 'Addition', description: 'Add three-digit numbers, with carrying.' },
    'subtraction-challenge': { title: 'Subtraction', description: 'Subtract three-digit numbers, with borrowing.' },
    'multiplication-quest': { title: 'Multiplication', description: 'Tables up to 10 and 2-digit × 1-digit.' },
    'division-challenge': { title: 'Division', description: 'Division facts, remainders and fractions.' },
    'number-comparison': { title: 'Fractions', description: 'Compare numbers, fractions and lengths.' },
    'missing-number': { title: 'Number Puzzles', description: 'Find missing numbers in tables and fractions.' },
    'pattern-puzzle': { title: 'Number Patterns', description: 'Adding, doubling and growing patterns.' },
    'math-quiz': { title: 'Time, Money and Geometry', description: 'Measurement, time, money and shapes.' },
  },
  4: {
    'number-runner': { title: 'Large Numbers', description: 'Order 4-digit numbers, fractions and decimals.' },
    'counting-challenge': { title: 'Rounding Off', description: 'Place value, rounding and large numbers.' },
    'addition-adventure': { title: 'Big Number Sums', description: 'Add 4-digit numbers, decimals and fractions.' },
    'subtraction-challenge': { title: 'Decimal Difference', description: 'Subtract 4-digit numbers, decimals and fractions.' },
    'multiplication-quest': { title: 'Multiplication', description: 'Multiply bigger numbers.' },
    'division-challenge': { title: 'Division and Decimals', description: 'Long division, equivalent fractions and decimals.' },
    'number-comparison': { title: 'Geometry Sort', description: 'Compare numbers, fractions and angles.' },
    'missing-number': { title: 'Number Mystery', description: 'Missing numbers in ×, ÷, fractions and decimals.' },
    'pattern-puzzle': { title: 'Patterns', description: 'Number and decimal patterns and growing rules.' },
    'math-quiz': { title: 'Measurement and Time', description: 'Length, weight, time, angles and money.' },
  },
  5: {
    'number-runner': { title: 'Percentage Line-up', description: 'Order large numbers, decimals and percentages.' },
    'counting-challenge': { title: 'Lakhs and Crores', description: 'Indian place value, rounding and counting cubes.' },
    'addition-adventure': { title: 'Fractions and Decimals', description: 'Add large numbers, decimals and unlike fractions.' },
    'subtraction-challenge': { title: 'Decimal Subtraction', description: 'Subtract large numbers, decimals and fractions.' },
    'multiplication-quest': { title: 'Factors and Multiples', description: 'Large multiplication, decimals and percentages.' },
    'division-challenge': { title: 'Percentage Basics', description: 'Match fractions, decimals and percentages.' },
    'number-comparison': { title: 'Prime Sort', description: 'Compare fractions and percents; sort primes.' },
    'missing-number': { title: 'Average and Missing Values', description: 'Fractions, decimals, percentages and averages.' },
    'pattern-puzzle': { title: 'Logical Maths', description: 'Number patterns and reasoning puzzles.' },
    'math-quiz': { title: 'Word Problem Master', description: 'Area, perimeter, volume, time and money.' },
  },
};

export default titles;
