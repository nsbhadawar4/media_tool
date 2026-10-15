/**
 * The template generator's subject library: domains (Mathematics, Science, …), the topics inside
 * them, and for each topic the chapters it can teach, with the class range each chapter suits.
 *
 * Everything here is written for this app: short original outlines and key terms, from which the
 * generator builds lessons, practice and quizzes. No textbook content is copied.
 */

/** Which numeric practice a maths chapter gets (generated fresh for each class level). */
export type NumberKind =
  | 'count'
  | 'compare'
  | 'placevalue'
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'integer'
  | 'fraction'
  | 'decimal'
  | 'percent'
  | 'pattern'
  | 'equation'
  | 'perimeter'
  | 'mean'
  | 'word';

export interface ChapterSpec {
  title: string;
  /** One or two sentences about what the chapter covers. */
  about: string;
  /** What learners can do afterwards. */
  objective: string;
  lessons: string[];
  /** Key terms and their meanings: the raw material for practice and quizzes. */
  terms: Array<[term: string, meaning: string]>;
  /** Suitable from / up to this class (inclusive). */
  min?: number;
  max?: number;
  numbers?: NumberKind;
}

export interface Topic {
  id: string;
  /** Its name when it becomes a subject of its own (a focused class). */
  name: string;
  glyph: string;
  description: string;
  keywords: string[];
  chapters: ChapterSpec[];
}

export interface Domain {
  id: string;
  /** The catalog subject key for the whole domain (existing keys for Hindi, English, Maths). */
  key: string;
  name: string;
  glyph: string;
  description: string;
  keywords: string[];
  topics: Topic[];
  /** In a class focused on this domain, keep the domain itself as the first subject. */
  keepWhenFocused: boolean;
  /** Content written in Hindi. */
  hindi?: boolean;
}

const T = (term: string, meaning: string): [string, string] => [term, meaning];

export const DOMAINS: Domain[] = [
  {
    id: 'math',
    key: 'math',
    name: 'Mathematics',
    glyph: '123',
    description: 'Numbers, operations, shapes, measurement and problem solving',
    keywords: ['math', 'maths', 'mathematics', 'mathematical', 'numeracy', 'गणित'],
    keepWhenFocused: true,
    topics: [
      {
        id: 'number-sense',
        name: 'Number Sense',
        glyph: '#',
        description: 'Counting, place value and how numbers are built',
        keywords: ['number', 'numbers', 'counting', 'count', 'place value', 'numeral', 'number system', 'whole numbers', 'integers', 'even', 'odd'],
        chapters: [
          { title: 'Counting and Numbers', min: 1, max: 2, numbers: 'count', about: 'Counting objects and reading and writing numbers.', objective: 'count objects accurately and read numbers up to 100', lessons: ['Counting Objects', 'Numbers up to 100', 'Before, After and Between', 'Comparing Numbers'], terms: [T('count', 'to find how many things there are'), T('digit', 'one of the symbols 0 to 9 used to write numbers'), T('greater', 'having a bigger value'), T('smaller', 'having a lower value')] },
          { title: 'Place Value', min: 2, max: 5, numbers: 'placevalue', about: 'How the position of a digit decides its value.', objective: 'find the value of each digit in a number', lessons: ['Ones and Tens', 'Hundreds and Thousands', 'Expanded Form', 'Comparing Large Numbers'], terms: [T('place value', 'the value of a digit because of its position'), T('ones', 'the place furthest to the right in a whole number'), T('tens', 'groups of ten'), T('expanded form', 'a number written as the sum of the values of its digits')] },
          { title: 'Number System', min: 5, max: 12, numbers: 'placevalue', about: 'Large numbers, reading them aloud and estimating.', objective: 'read, write, compare and round large numbers', lessons: ['Reading Large Numbers', 'Indian and International Systems', 'Rounding and Estimating', 'Roman Numerals'], terms: [T('estimate', 'a sensible guess close to the exact answer'), T('rounding', 'changing a number to the nearest ten, hundred or thousand'), T('numeral', 'a symbol or group of symbols that stands for a number'), T('period', 'a group of three digits in a large number')] },
          { title: 'Whole Numbers', min: 6, max: 8, numbers: 'add', about: 'Properties of whole numbers and the number line.', objective: 'use properties of whole numbers to calculate quickly', lessons: ['Whole Numbers on a Number Line', 'Predecessor and Successor', 'Properties of Operations', 'Patterns in Whole Numbers'], terms: [T('whole number', 'zero or any counting number'), T('successor', 'the number that comes just after'), T('predecessor', 'the number that comes just before'), T('number line', 'a line with numbers marked at equal distances')] },
          { title: 'Integers', min: 6, max: 12, numbers: 'integer', about: 'Negative numbers and calculating with them.', objective: 'place, compare, add and subtract integers', lessons: ['What are Negative Numbers?', 'Integers on a Number Line', 'Adding Integers', 'Subtracting Integers'], terms: [T('integer', 'a whole number that can be positive, negative or zero'), T('negative number', 'a number less than zero'), T('opposite', 'a number the same distance from zero on the other side'), T('absolute value', 'the distance of a number from zero')] },
        ],
      },
      {
        id: 'arithmetic',
        name: 'Arithmetic',
        glyph: '+−',
        description: 'Addition, subtraction, multiplication and division',
        keywords: ['arithmetic', 'addition', 'adding', 'subtraction', 'subtract', 'multiplication', 'multiply', 'times tables', 'tables', 'division', 'divide', 'sum', 'difference', 'calculation', 'operations'],
        chapters: [
          { title: 'Addition', min: 1, max: 3, numbers: 'add', about: 'Putting numbers together to find the total.', objective: 'add numbers with and without carrying', lessons: ['Adding Small Numbers', 'Adding on a Number Line', 'Adding with Carrying', 'Addition Stories'], terms: [T('add', 'to put numbers together'), T('sum', 'the answer to an addition'), T('carry', 'moving a ten to the next place when adding'), T('total', 'the whole amount')] },
          { title: 'Subtraction', min: 1, max: 3, numbers: 'sub', about: 'Taking away and finding differences.', objective: 'subtract numbers with and without borrowing', lessons: ['Taking Away', 'Counting Back', 'Subtracting with Borrowing', 'Finding the Difference'], terms: [T('subtract', 'to take one number away from another'), T('difference', 'the answer to a subtraction'), T('borrow', 'taking a ten from the next place when subtracting'), T('left', 'what remains after taking away')] },
          { title: 'Multiplication', min: 2, max: 5, numbers: 'mul', about: 'Equal groups, repeated addition and times tables.', objective: 'multiply using tables and the column method', lessons: ['Equal Groups', 'Times Tables', 'Multiplying by Tens', 'Multiplying Larger Numbers'], terms: [T('multiply', 'to add equal groups quickly'), T('product', 'the answer to a multiplication'), T('factor', 'a number multiplied to get a product'), T('times table', 'a list of the multiples of a number')] },
          { title: 'Division', min: 3, max: 6, numbers: 'div', about: 'Sharing equally and grouping.', objective: 'divide numbers and understand remainders', lessons: ['Sharing Equally', 'Division and Multiplication', 'Long Division', 'Remainders'], terms: [T('divide', 'to share into equal groups'), T('quotient', 'the answer to a division'), T('remainder', 'what is left over after dividing equally'), T('divisor', 'the number you divide by')] },
          { title: 'Operations with Large Numbers', min: 5, max: 8, numbers: 'mul', about: 'Calculating with large numbers and the order of operations.', objective: 'use all four operations with large numbers in the right order', lessons: ['Adding and Subtracting Large Numbers', 'Multiplying Large Numbers', 'Order of Operations', 'Checking Answers'], terms: [T('operation', 'a way of combining numbers such as adding or dividing'), T('brackets', 'symbols that show which part to work out first'), T('inverse', 'an operation that undoes another'), T('check', 'to make sure an answer is correct')] },
        ],
      },
      {
        id: 'fractions',
        name: 'Fractions & Decimals',
        glyph: '½',
        description: 'Parts of a whole, decimals and percentages',
        keywords: ['fraction', 'fractions', 'decimal', 'decimals', 'percentage', 'percentages', 'percent', 'ratio', 'proportion'],
        chapters: [
          { title: 'Fractions', min: 3, max: 8, numbers: 'fraction', about: 'Parts of a whole and comparing simple fractions.', objective: 'understand basic fractions and compare simple fractions', lessons: ['What is a Fraction?', 'Numerator and Denominator', 'Equivalent Fractions', 'Comparing Fractions'], terms: [T('fraction', 'a number that names part of a whole'), T('numerator', 'the top number of a fraction'), T('denominator', 'the bottom number of a fraction'), T('equivalent fractions', 'fractions that show the same amount')] },
          { title: 'Decimals', min: 5, max: 9, numbers: 'decimal', about: 'Tenths, hundredths and calculating with decimals.', objective: 'read, compare and add decimals', lessons: ['Tenths and Hundredths', 'Decimals and Fractions', 'Comparing Decimals', 'Adding and Subtracting Decimals'], terms: [T('decimal', 'a number with a decimal point'), T('tenth', 'one of ten equal parts'), T('hundredth', 'one of a hundred equal parts'), T('decimal point', 'the dot that separates whole numbers from parts')] },
          { title: 'Ratio and Percentage', min: 6, max: 12, numbers: 'percent', about: 'Comparing quantities with ratios and percentages.', objective: 'find percentages of amounts and simplify ratios', lessons: ['What is a Ratio?', 'Equivalent Ratios', 'Percentages', 'Percentages in Daily Life'], terms: [T('ratio', 'a comparison of two quantities'), T('percent', 'out of one hundred'), T('proportion', 'a statement that two ratios are equal'), T('discount', 'an amount taken off a price')] },
        ],
      },
      {
        id: 'algebra',
        name: 'Algebra',
        glyph: 'x',
        description: 'Patterns, variables and simple equations',
        keywords: ['algebra', 'equation', 'equations', 'variable', 'variables', 'expression', 'expressions', 'pattern', 'patterns'],
        chapters: [
          { title: 'Patterns', min: 1, max: 5, numbers: 'pattern', about: 'Spotting and continuing patterns in numbers and shapes.', objective: 'find the rule of a pattern and continue it', lessons: ['Shape Patterns', 'Number Patterns', 'Finding the Rule', 'Making Patterns'], terms: [T('pattern', 'something that repeats or grows by a rule'), T('rule', 'the instruction that makes a pattern'), T('sequence', 'numbers in a particular order'), T('term', 'one number in a sequence')] },
          { title: 'Algebra Basics', min: 6, max: 12, numbers: 'equation', about: 'Using letters for unknown numbers and solving simple equations.', objective: 'write simple expressions and solve one-step equations', lessons: ['Using Letters for Numbers', 'Writing Expressions', 'Simple Equations', 'Solving Equations'], terms: [T('variable', 'a letter that stands for an unknown number'), T('expression', 'numbers and letters joined by operations'), T('equation', 'a statement that two expressions are equal'), T('solution', 'the value that makes an equation true')] },
        ],
      },
      {
        id: 'geometry',
        name: 'Geometry',
        glyph: '△',
        description: 'Shapes, lines, angles and space',
        keywords: ['geometry', 'shape', 'shapes', 'angle', 'angles', 'triangle', 'triangles', 'circle', 'circles', 'lines', 'symmetry', '2d', '3d'],
        chapters: [
          { title: 'Shapes Around Us', min: 1, max: 3, about: 'Flat and solid shapes we see every day.', objective: 'name and sort common 2D and 3D shapes', lessons: ['Flat Shapes', 'Solid Shapes', 'Sides and Corners', 'Symmetry'], terms: [T('circle', 'a round flat shape'), T('square', 'a shape with four equal sides'), T('cube', 'a solid shape with six square faces'), T('symmetry', 'when one half matches the other half')] },
          { title: 'Lines and Angles', min: 4, max: 12, about: 'Kinds of lines and measuring angles.', objective: 'identify lines and measure and classify angles', lessons: ['Points, Lines and Rays', 'Parallel and Perpendicular Lines', 'Measuring Angles', 'Types of Angles'], terms: [T('ray', 'a line that starts at a point and goes on forever'), T('parallel', 'lines that never meet'), T('right angle', 'an angle of exactly 90 degrees'), T('acute angle', 'an angle smaller than a right angle')] },
          { title: 'Triangles and Quadrilaterals', min: 6, max: 12, about: 'Properties of triangles and four-sided shapes.', objective: 'classify triangles and quadrilaterals by their properties', lessons: ['Types of Triangles', 'Angle Sum of a Triangle', 'Quadrilaterals', 'Circles and Their Parts'], terms: [T('triangle', 'a shape with three sides'), T('quadrilateral', 'a shape with four sides'), T('radius', 'the distance from the centre of a circle to its edge'), T('diameter', 'a line across a circle through its centre')] },
        ],
      },
      {
        id: 'measurement',
        name: 'Measurement',
        glyph: '📏',
        description: 'Length, weight, time, money, area and perimeter',
        keywords: ['measurement', 'measure', 'measuring', 'length', 'weight', 'mass', 'telling time', 'money problems', 'area', 'perimeter', 'volume', 'capacity'],
        chapters: [
          { title: 'Length, Weight and Capacity', min: 1, max: 5, about: 'Measuring how long, how heavy and how much.', objective: 'measure and compare length, weight and capacity', lessons: ['Measuring Length', 'Measuring Weight', 'Measuring Capacity', 'Choosing Units'], terms: [T('metre', 'a unit for measuring length'), T('kilogram', 'a unit for measuring weight'), T('litre', 'a unit for measuring how much a container holds'), T('unit', 'a fixed amount used for measuring')] },
          { title: 'Time and Money', min: 1, max: 6, numbers: 'add', about: 'Telling time, calendars and using money.', objective: 'read clocks and solve simple money problems', lessons: ['Reading a Clock', 'Days, Weeks and Months', 'Coins and Notes', 'Shopping Problems'], terms: [T('hour', 'sixty minutes'), T('calendar', 'a chart of the days, weeks and months of a year'), T('change', 'the money you get back after paying'), T('rupee', 'the money used in India')] },
          { title: 'Perimeter and Area', min: 4, max: 12, numbers: 'perimeter', about: 'The distance around a shape and the space inside it.', objective: 'find the perimeter and area of rectangles and squares', lessons: ['What is Perimeter?', 'Perimeter of Rectangles', 'What is Area?', 'Area of Rectangles and Squares'], terms: [T('perimeter', 'the distance around a shape'), T('area', 'the space inside a flat shape'), T('square unit', 'a unit for measuring area'), T('length', 'how long something is')] },
        ],
      },
      {
        id: 'data',
        name: 'Data Handling',
        glyph: '📊',
        description: 'Collecting, showing and reading data',
        keywords: ['data', 'graph', 'graphs', 'chart', 'charts', 'statistics', 'average', 'tally', 'data handling'],
        chapters: [
          { title: 'Data Handling', min: 3, max: 12, numbers: 'mean', about: 'Collecting data and showing it in tables and graphs.', objective: 'record data and read bar graphs and pictographs', lessons: ['Collecting Data', 'Tally Marks and Tables', 'Pictographs and Bar Graphs', 'Finding the Average'], terms: [T('data', 'facts or numbers collected to learn something'), T('tally', 'marks used to count things quickly'), T('bar graph', 'a chart that uses bars to show amounts'), T('average', 'the total divided by the number of values')] },
        ],
      },
      {
        id: 'problem-solving',
        name: 'Problem Solving',
        glyph: '🧠',
        description: 'Word problems, strategies and mental maths',
        keywords: ['problem solving', 'problem-solving', 'word problems', 'word problem', 'mental math', 'mental maths', 'strategies'],
        chapters: [
          { title: 'Word Problems', min: 2, max: 12, numbers: 'word', about: 'Turning everyday situations into number sentences.', objective: 'choose the right operation to solve word problems', lessons: ['Reading the Problem', 'Choosing the Operation', 'Solving Step by Step', 'Checking the Answer'], terms: [T('word problem', 'a maths question told as a short story'), T('clue words', 'words that hint which operation to use'), T('steps', 'the order in which a problem is solved'), T('answer', 'the result that solves the problem')] },
          { title: 'Mental Maths Strategies', min: 3, max: 12, numbers: 'add', about: 'Quick ways to calculate in your head.', objective: 'use number facts and strategies to calculate mentally', lessons: ['Number Bonds', 'Doubling and Halving', 'Rounding to Calculate', 'Quick Checks'], terms: [T('number bond', 'two numbers that make a total'), T('double', 'to add a number to itself'), T('half', 'one of two equal parts'), T('estimate', 'a quick, close answer')] },
        ],
      },
    ],
  },
  {
    id: 'science',
    key: 'science',
    name: 'Science',
    glyph: '🔬',
    description: 'Living things, materials, energy, our planet and how scientists think',
    keywords: ['science', 'sciences', 'scientific', 'विज्ञान'],
    keepWhenFocused: false,
    topics: [
      {
        id: 'life-science',
        name: 'Biology & Life Science',
        glyph: '🌱',
        description: 'Plants, animals, the human body and living organisms',
        keywords: ['biology', 'life science', 'plants', 'plant', 'animals', 'animal', 'living', 'organisms', 'organism', 'cells', 'cell', 'human body', 'habitat', 'habitats', 'nutrition'],
        chapters: [
          { title: 'Living and Non-living Things', min: 1, max: 6, about: 'What makes something alive.', objective: 'sort things into living and non-living using their features', lessons: ['Signs of Life', 'Living Things Around Us', 'Non-living Things', 'Sorting and Grouping'], terms: [T('living thing', 'something that grows, breathes and reproduces'), T('non-living thing', 'something that does not grow or breathe on its own'), T('reproduce', 'to make young ones of the same kind'), T('grow', 'to get bigger over time')] },
          { title: 'Plants', min: 1, max: 12, about: 'Parts of plants, how they grow and how they make food.', objective: 'name plant parts and explain what each part does', lessons: ['Parts of a Plant', 'How Seeds Grow', 'How Plants Make Food', 'Plants and People'], terms: [T('root', 'the part of a plant that takes in water from the soil'), T('leaf', 'the part of a plant that makes food using sunlight'), T('seed', 'the part from which a new plant grows'), T('photosynthesis', 'how plants make food using sunlight, water and air')] },
          { title: 'Animals', min: 1, max: 12, about: 'Kinds of animals, where they live and what they eat.', objective: 'group animals by their features, food and habitat', lessons: ['Animals Around Us', 'What Animals Eat', 'Animal Homes and Habitats', 'Animal Groups'], terms: [T('habitat', 'the natural home of an animal or plant'), T('herbivore', 'an animal that eats only plants'), T('carnivore', 'an animal that eats other animals'), T('mammal', 'an animal that feeds its young on milk')] },
          { title: 'The Human Body', min: 2, max: 12, about: 'Body parts, senses and how organs work together.', objective: 'describe major body parts and keep the body healthy', lessons: ['Our Body Parts', 'The Five Senses', 'Bones and Muscles', 'Staying Healthy'], terms: [T('sense organ', 'a body part that helps us see, hear, smell, taste or touch'), T('skeleton', 'the frame of bones that supports the body'), T('muscle', 'a body part that helps us move'), T('heart', 'the organ that pumps blood around the body')] },
          { title: 'Food and Nutrition', min: 3, max: 10, about: 'What food gives us and how to eat a balanced diet.', objective: 'explain the main food groups and plan a balanced meal', lessons: ['Why We Need Food', 'Food Groups', 'A Balanced Diet', 'Keeping Food Safe'], terms: [T('nutrient', 'a substance in food that the body needs'), T('protein', 'a nutrient that helps the body grow and repair'), T('carbohydrate', 'a nutrient that gives energy'), T('balanced diet', 'food with the right amounts of each nutrient')] },
          { title: 'Cells and Organisms', min: 6, max: 12, about: 'Cells as the building blocks of life.', objective: 'describe the basic parts of plant and animal cells', lessons: ['What is a Cell?', 'Plant and Animal Cells', 'Tissues and Organs', 'Microorganisms'], terms: [T('cell', 'the smallest unit of a living thing'), T('nucleus', 'the part of a cell that controls it'), T('tissue', 'a group of similar cells working together'), T('microorganism', 'a living thing too small to see without a microscope')] },
        ],
      },
      {
        id: 'matter',
        name: 'Matter & Materials',
        glyph: '🧪',
        description: 'Solids, liquids, gases and the materials things are made of',
        keywords: ['matter', 'materials', 'material', 'chemistry', 'solid', 'solids', 'liquid', 'liquids', 'gas', 'gases', 'mixture', 'mixtures', 'substances'],
        chapters: [
          { title: 'Solids, Liquids and Gases', min: 2, max: 8, about: 'The three states of matter and how they change.', objective: 'describe the states of matter and changes between them', lessons: ['What is Matter?', 'Solids, Liquids and Gases', 'Melting and Freezing', 'Evaporation and Condensation'], terms: [T('matter', 'anything that has mass and takes up space'), T('solid', 'matter with a fixed shape'), T('liquid', 'matter that flows and takes the shape of its container'), T('evaporation', 'when a liquid changes into a gas')] },
          { title: 'Materials and Their Properties', min: 3, max: 8, about: 'Choosing materials for what they can do.', objective: 'match materials to uses by their properties', lessons: ['Natural and Made Materials', 'Hard, Soft and Flexible', 'Floating and Sinking', 'Choosing the Right Material'], terms: [T('property', 'a feature that describes a material'), T('transparent', 'lets light pass through clearly'), T('flexible', 'bends without breaking'), T('waterproof', 'does not let water through')] },
          { title: 'Mixtures and Separation', min: 5, max: 12, about: 'Mixing substances and separating them again.', objective: 'choose a method to separate a mixture', lessons: ['Mixtures Around Us', 'Dissolving', 'Filtering and Sieving', 'Evaporating to Separate'], terms: [T('mixture', 'two or more substances mixed together'), T('dissolve', 'when a solid spreads evenly through a liquid'), T('filter', 'to separate solids from a liquid using a mesh or paper'), T('solution', 'a liquid with a substance dissolved in it')] },
        ],
      },
      {
        id: 'energy',
        name: 'Energy',
        glyph: '⚡',
        description: 'Light, sound, heat, forces, electricity and magnets',
        keywords: ['energy', 'force', 'forces', 'motion', 'light', 'sound', 'heat', 'electricity', 'electric', 'magnet', 'magnets', 'physics'],
        chapters: [
          { title: 'Forms of Energy', min: 3, max: 12, about: 'Energy around us and how it changes form.', objective: 'name forms of energy and describe simple energy changes', lessons: ['What is Energy?', 'Heat and Light', 'Energy Changes', 'Saving Energy'], terms: [T('energy', 'the ability to do work or cause change'), T('heat', 'energy that makes things warmer'), T('fuel', 'something burned to give energy'), T('renewable', 'a source of energy that does not run out')] },
          { title: 'Light and Shadows', min: 3, max: 9, about: 'How light travels and how shadows form.', objective: 'explain how shadows and reflections are made', lessons: ['Sources of Light', 'Light Travels in Straight Lines', 'Shadows', 'Reflection'], terms: [T('light source', 'something that gives out its own light'), T('shadow', 'a dark shape made when light is blocked'), T('reflection', 'light bouncing off a surface'), T('opaque', 'does not let light pass through')] },
          { title: 'Sound', min: 4, max: 9, about: 'How sounds are made and heard.', objective: 'explain that sounds are made by vibrations', lessons: ['How Sound is Made', 'How We Hear', 'Loud and Soft, High and Low', 'Noise and Our Health'], terms: [T('vibration', 'a quick back-and-forth movement'), T('pitch', 'how high or low a sound is'), T('volume', 'how loud or soft a sound is'), T('echo', 'a sound that bounces back')] },
          { title: 'Force and Motion', min: 5, max: 12, about: 'Pushes, pulls and how things move.', objective: 'describe how forces change the motion of objects', lessons: ['Pushes and Pulls', 'Friction', 'Gravity', 'Speed and Motion'], terms: [T('force', 'a push or a pull'), T('friction', 'a force that slows moving things down'), T('gravity', 'the force that pulls things towards the Earth'), T('speed', 'how fast something moves')] },
          { title: 'Electricity and Magnets', min: 5, max: 12, about: 'Simple circuits and magnetic forces.', objective: 'build a simple circuit and describe how magnets behave', lessons: ['Using Electricity Safely', 'Simple Circuits', 'Conductors and Insulators', 'Magnets and Their Poles'], terms: [T('circuit', 'a complete path for electricity'), T('conductor', 'a material that lets electricity pass'), T('insulator', 'a material that does not let electricity pass'), T('magnetic pole', 'an end of a magnet where its pull is strongest')] },
        ],
      },
      {
        id: 'environment',
        name: 'Environment',
        glyph: '🌍',
        description: 'Ecosystems, water, pollution and caring for our planet',
        keywords: ['environment', 'environmental', 'ecosystem', 'ecosystems', 'pollution', 'climate', 'conservation', 'nature', 'recycling', 'water cycle', 'evs'],
        chapters: [
          { title: 'Our Environment', min: 1, max: 8, about: 'The living and non-living world around us and how it fits together.', objective: 'describe how living things depend on their surroundings', lessons: ['What is the Environment?', 'Food Chains', 'Ecosystems', 'People and Nature'], terms: [T('environment', 'everything around us, living and non-living'), T('food chain', 'who eats whom in nature'), T('ecosystem', 'living things and their surroundings working together'), T('producer', 'a living thing that makes its own food')] },
          { title: 'Water and the Water Cycle', min: 3, max: 9, about: 'Where water comes from and how it moves around the Earth.', objective: 'explain the water cycle and ways to save water', lessons: ['Sources of Water', 'The Water Cycle', 'Clean Water', 'Saving Water'], terms: [T('water cycle', 'the journey of water from the Earth to the sky and back'), T('condensation', 'when water vapour cools into droplets'), T('precipitation', 'water falling from clouds as rain, snow or hail'), T('groundwater', 'water stored under the ground')] },
          { title: 'Pollution and Conservation', min: 4, max: 12, about: 'How we harm and protect air, water and land.', objective: 'identify causes of pollution and ways to reduce it', lessons: ['Air Pollution', 'Water Pollution', 'Reduce, Reuse, Recycle', 'Protecting Forests and Wildlife'], terms: [T('pollution', 'harmful things added to air, water or land'), T('recycle', 'to make used things into new things'), T('conservation', 'protecting nature and resources'), T('waste', 'material that is thrown away')] },
        ],
      },
      {
        id: 'earth-space',
        name: 'Earth & Space',
        glyph: '🪐',
        description: 'Weather, rocks and soil, the Sun, Moon and planets',
        keywords: ['earth', 'space', 'planets', 'planet', 'solar system', 'moon', 'sun', 'stars', 'weather', 'seasons', 'rocks', 'soil', 'universe', 'astronomy'],
        chapters: [
          { title: 'Weather and Seasons', min: 1, max: 6, about: 'Daily weather and the seasons of the year.', objective: 'describe weather and how seasons differ', lessons: ['Sunny, Rainy and Windy', 'Measuring Weather', 'The Seasons', 'Dressing for the Weather'], terms: [T('weather', 'what the air outside is like each day'), T('season', 'a part of the year with its own weather'), T('temperature', 'how hot or cold something is'), T('monsoon', 'the rainy season in India')] },
          { title: 'Earth: Land, Rocks and Soil', min: 3, max: 9, about: 'What the Earth is made of and how soil forms.', objective: 'describe types of rocks and how soil forms', lessons: ['Layers of the Earth', 'Rocks', 'How Soil Forms', 'Soil and Plants'], terms: [T('crust', 'the outer layer of the Earth'), T('rock', 'a hard natural material made of minerals'), T('soil', 'the top layer of earth where plants grow'), T('erosion', 'the wearing away of land by wind or water')] },
          { title: 'The Solar System', min: 4, max: 12, about: 'The Sun, the Moon and the planets.', objective: 'name the planets and explain day, night and phases of the Moon', lessons: ['The Sun and Stars', 'Planets of the Solar System', 'Day and Night', 'Phases of the Moon'], terms: [T('planet', 'a large body that moves around a star'), T('orbit', 'the path of one object around another'), T('rotation', 'turning around on an axis'), T('satellite', 'an object that moves around a planet')] },
        ],
      },
      {
        id: 'scientific-thinking',
        name: 'Scientific Thinking',
        glyph: '🔍',
        description: 'Observing, asking questions and doing fair experiments',
        keywords: ['experiment', 'experiments', 'scientific thinking', 'scientific method', 'observation', 'observe', 'hypothesis', 'investigation', 'investigations', 'inquiry'],
        chapters: [
          { title: 'Observing and Asking Questions', min: 1, max: 6, about: 'Using our senses carefully and asking good questions.', objective: 'make careful observations and ask testable questions', lessons: ['Using Our Senses', 'Asking Questions', 'Making Predictions', 'Sharing What We Found'], terms: [T('observe', 'to watch something carefully'), T('question', 'something we want to find out'), T('predict', 'to say what we think will happen'), T('record', 'to write or draw what we found')] },
          { title: 'Doing Fair Experiments', min: 3, max: 12, about: 'Planning a fair test and changing one thing at a time.', objective: 'plan a fair test with one variable changed', lessons: ['What is an Experiment?', 'Making a Fair Test', 'Variables', 'Staying Safe in Experiments'], terms: [T('experiment', 'a test to find something out'), T('fair test', 'a test where only one thing is changed'), T('variable', 'something that can change in an experiment'), T('hypothesis', 'an idea that can be tested')] },
          { title: 'Recording and Explaining Results', min: 4, max: 12, about: 'Tables, charts and drawing conclusions from evidence.', objective: 'record results and explain what they show', lessons: ['Tables and Charts', 'Looking for Patterns', 'Drawing Conclusions', 'Improving an Experiment'], terms: [T('result', 'what happened in an experiment'), T('evidence', 'facts that show something is true'), T('conclusion', 'what we decide from the results'), T('pattern', 'something that happens again and again')] },
        ],
      },
    ],
  },
  {
    id: 'english',
    key: 'english',
    name: 'English',
    glyph: 'Aa',
    description: 'Reading, vocabulary, grammar, writing and communication',
    keywords: ['english', 'language arts'],
    keepWhenFocused: true,
    topics: [
      {
        id: 'reading',
        name: 'Reading',
        glyph: '📖',
        description: 'Phonics, reading aloud and reading for meaning',
        keywords: ['reading', 'read', 'phonics', 'comprehension', 'books', 'alphabet', 'alphabets', 'alfabet', 'alfabets', 'alfabates', 'abc', 'letters'],
        chapters: [
          { title: 'Phonics and Sounds', min: 1, max: 3, about: 'Letter sounds and blending them into words.', objective: 'blend letter sounds to read simple words', lessons: ['Letter Sounds', 'Blending Sounds', 'Short and Long Vowels', 'Reading Simple Words'], terms: [T('vowel', 'one of the letters a, e, i, o, u'), T('consonant', 'a letter that is not a vowel'), T('blend', 'to join sounds together to say a word'), T('syllable', 'a beat in a word')] },
          { title: 'Reading', min: 1, max: 6, about: 'Reading aloud with expression and understanding.', objective: 'read short texts aloud fluently', lessons: ['Reading Aloud', 'Reading with Expression', 'Picture Clues', 'Retelling a Story'], terms: [T('fluency', 'reading smoothly at a good speed'), T('expression', 'reading with feeling'), T('title', 'the name of a book or story'), T('retell', 'to tell a story again in your own words')] },
          { title: 'Comprehension', min: 3, max: 12, about: 'Understanding and thinking about what we read.', objective: 'find main ideas and answer questions about a text', lessons: ['Finding the Main Idea', 'Supporting Details', 'Making Inferences', 'Answering Questions'], terms: [T('main idea', 'what a text is mostly about'), T('detail', 'a small fact that supports the main idea'), T('inference', 'a guess based on clues in the text'), T('summary', 'a short version of a text')] },
        ],
      },
      {
        id: 'vocabulary',
        name: 'Vocabulary',
        glyph: '🔤',
        description: 'Building words, spelling and word meanings',
        keywords: ['vocabulary', 'words', 'spelling', 'synonyms', 'antonyms'],
        chapters: [
          { title: 'Vocabulary', min: 1, max: 6, about: 'New words, their meanings and spellings.', objective: 'learn and use new words correctly', lessons: ['Word Families', 'Spelling Patterns', 'Using a Dictionary', 'Words in Context'], terms: [T('dictionary', 'a book or tool that gives word meanings'), T('spelling', 'the correct order of letters in a word'), T('word family', 'words that share a pattern'), T('meaning', 'what a word stands for')] },
          { title: 'Synonyms and Antonyms', min: 3, max: 12, about: 'Words with similar and opposite meanings.', objective: 'choose synonyms and antonyms to improve writing', lessons: ['Synonyms', 'Antonyms', 'Homophones', 'Choosing Better Words'], terms: [T('synonym', 'a word with the same or a similar meaning'), T('antonym', 'a word with the opposite meaning'), T('homophone', 'a word that sounds like another but has a different meaning'), T('prefix', 'letters added to the start of a word')] },
        ],
      },
      {
        id: 'grammar',
        name: 'Grammar',
        glyph: '✍️',
        description: 'Parts of speech, tenses, sentences and punctuation',
        keywords: ['grammar', 'noun', 'nouns', 'verb', 'verbs', 'tense', 'tenses', 'punctuation', 'sentence', 'sentences', 'adjectives'],
        chapters: [
          { title: 'Grammar', min: 1, max: 8, about: 'Naming words, doing words and describing words.', objective: 'identify nouns, pronouns, verbs and adjectives', lessons: ['Nouns', 'Pronouns', 'Verbs', 'Adjectives'], terms: [T('noun', 'a naming word for a person, place or thing'), T('pronoun', 'a word used instead of a noun'), T('verb', 'an action word'), T('adjective', 'a word that describes a noun')] },
          { title: 'Sentence Formation', min: 1, max: 12, about: 'Building clear, complete sentences.', objective: 'write complete sentences with correct word order', lessons: ['What is a Sentence?', 'Word Order', 'Kinds of Sentences', 'Joining Sentences'], terms: [T('sentence', 'a group of words that makes complete sense'), T('subject', 'who or what a sentence is about'), T('question', 'a sentence that asks something'), T('conjunction', 'a joining word such as and or but')] },
          { title: 'Tenses and Punctuation', min: 3, max: 12, about: 'Showing time with verbs and using punctuation marks.', objective: 'use past, present and future tense and correct punctuation', lessons: ['Present Tense', 'Past Tense', 'Future Tense', 'Punctuation Marks'], terms: [T('tense', 'the form of a verb that shows time'), T('full stop', 'the mark that ends a statement'), T('comma', 'a mark that shows a short pause'), T('apostrophe', 'a mark used for missing letters or ownership')] },
        ],
      },
      {
        id: 'writing',
        name: 'Writing',
        glyph: '📝',
        description: 'Sentences, paragraphs, letters and creative writing',
        keywords: ['writing', 'write', 'essay', 'essays', 'paragraph', 'letter writing', 'creative writing', 'composition'],
        chapters: [
          { title: 'Writing', min: 2, max: 8, about: 'Writing clear sentences and paragraphs.', objective: 'write a short paragraph on a topic', lessons: ['Planning Ideas', 'Writing Sentences', 'Writing a Paragraph', 'Checking Our Writing'], terms: [T('paragraph', 'a group of sentences about one idea'), T('topic sentence', 'the sentence that tells what a paragraph is about'), T('draft', 'a first try at writing'), T('edit', 'to correct and improve writing')] },
          { title: 'Letters and Creative Writing', min: 4, max: 12, about: 'Writing letters, messages and stories.', objective: 'write a letter and a short story with a clear structure', lessons: ['Informal Letters', 'Formal Letters', 'Writing a Story', 'Describing Characters and Places'], terms: [T('greeting', 'the opening words of a letter'), T('plot', 'what happens in a story'), T('character', 'a person or animal in a story'), T('setting', 'where and when a story happens')] },
        ],
      },
      {
        id: 'communication',
        name: 'Communication Skills',
        glyph: '💬',
        description: 'Listening, speaking and presenting with confidence',
        keywords: ['speaking', 'communication', 'listening', 'presentation', 'presentations', 'conversation', 'spoken english', 'public speaking'],
        chapters: [
          { title: 'Listening and Speaking', min: 1, max: 12, about: 'Listening carefully and speaking clearly.', objective: 'listen actively and speak clearly to a group', lessons: ['Active Listening', 'Speaking Clearly', 'Taking Turns', 'Asking and Answering'], terms: [T('listen', 'to pay attention to sounds and words'), T('pronounce', 'to say a word correctly'), T('tone', 'the feeling in how something is said'), T('audience', 'the people who are listening')] },
          { title: 'Communication', min: 4, max: 12, about: 'Conversations, discussions and short presentations.', objective: 'take part in discussions and give a short presentation', lessons: ['Polite Conversations', 'Group Discussions', 'Giving a Presentation', 'Body Language'], terms: [T('discussion', 'talking together about a topic'), T('presentation', 'a short talk given to others'), T('body language', 'how we show feelings without words'), T('opinion', 'what someone thinks or believes')] },
        ],
      },
      {
        id: 'literature',
        name: 'Literature',
        glyph: '📚',
        description: 'Stories, poems and plays',
        keywords: ['literature', 'poem', 'poems', 'poetry', 'stories', 'story', 'drama', 'novel'],
        chapters: [
          { title: 'Stories and Poems', min: 1, max: 12, about: 'Enjoying and understanding stories and poems.', objective: 'talk about characters, rhyme and the message of a text', lessons: ['Listening to Stories', 'Characters and Feelings', 'Rhyme and Rhythm', 'The Message of a Story'], terms: [T('poem', 'writing arranged in lines, often with rhythm'), T('rhyme', 'words that end with the same sound'), T('moral', 'the lesson a story teaches'), T('author', 'the person who wrote a text')] },
        ],
      },
    ],
  },
  {
    id: 'hindi',
    key: 'hindi',
    name: 'Hindi',
    glyph: 'अ',
    description: 'वर्णमाला, शब्द, व्याकरण, पठन, लेखन, कहानी और कविता',
    keywords: ['hindi', 'हिंदी', 'हिन्दी'],
    keepWhenFocused: true,
    hindi: true,
    topics: [
      {
        id: 'varnamala',
        name: 'वर्णमाला',
        glyph: 'क',
        description: 'स्वर, व्यंजन और मात्राएँ',
        keywords: ['वर्णमाला', 'स्वर', 'व्यंजन', 'मात्रा', 'varnamala'],
        chapters: [
          { title: 'वर्णमाला', min: 1, max: 3, about: 'हिंदी के स्वर और व्यंजन पहचानना और लिखना।', objective: 'स्वर और व्यंजन पहचानना और सही क्रम में बोलना', lessons: ['स्वर', 'व्यंजन', 'मात्राएँ', 'अक्षरों से शब्द'], terms: [T('स्वर', 'वे वर्ण जो अपने आप बोले जाते हैं'), T('व्यंजन', 'वे वर्ण जो स्वर की सहायता से बोले जाते हैं'), T('मात्रा', 'स्वर का वह चिह्न जो व्यंजन के साथ लगता है'), T('वर्ण', 'भाषा की सबसे छोटी ध्वनि')] },
        ],
      },
      {
        id: 'shabd',
        name: 'शब्द ज्ञान',
        glyph: 'शब्द',
        description: 'नए शब्द, अर्थ, पर्यायवाची और विलोम',
        keywords: ['शब्द', 'पर्यायवाची', 'विलोम', 'शब्द ज्ञान'],
        chapters: [
          { title: 'शब्द ज्ञान', min: 1, max: 8, about: 'नए शब्द सीखना और उनके अर्थ समझना।', objective: 'नए शब्दों का अर्थ समझकर वाक्यों में प्रयोग करना', lessons: ['दो अक्षर वाले शब्द', 'तीन अक्षर वाले शब्द', 'पर्यायवाची शब्द', 'विलोम शब्द'], terms: [T('शब्द', 'वर्णों का सार्थक मेल'), T('पर्यायवाची', 'समान अर्थ वाले शब्द'), T('विलोम', 'उल्टे अर्थ वाले शब्द'), T('अर्थ', 'किसी शब्द का मतलब')] },
        ],
      },
      {
        id: 'vyakaran',
        name: 'व्याकरण',
        glyph: 'व्या',
        description: 'संज्ञा, सर्वनाम, क्रिया, काल और वाक्य',
        keywords: ['व्याकरण', 'संज्ञा', 'सर्वनाम', 'क्रिया', 'वाक्य', 'vyakaran'],
        chapters: [
          { title: 'व्याकरण', min: 2, max: 12, about: 'संज्ञा, सर्वनाम और विशेषण की पहचान।', objective: 'संज्ञा, सर्वनाम और विशेषण पहचानना', lessons: ['संज्ञा', 'सर्वनाम', 'विशेषण', 'लिंग और वचन'], terms: [T('संज्ञा', 'किसी व्यक्ति, वस्तु या स्थान का नाम'), T('सर्वनाम', 'संज्ञा के स्थान पर आने वाला शब्द'), T('विशेषण', 'संज्ञा की विशेषता बताने वाला शब्द'), T('वचन', 'एक या अनेक का बोध कराने वाला रूप')] },
          { title: 'वाक्य निर्माण', min: 2, max: 12, about: 'शब्दों को सही क्रम में जोड़कर वाक्य बनाना।', objective: 'सही क्रम में पूरे वाक्य बनाना', lessons: ['वाक्य क्या है?', 'शब्दों का क्रम', 'क्रिया और काल', 'प्रश्नवाचक वाक्य'], terms: [T('वाक्य', 'शब्दों का वह समूह जो पूरा अर्थ दे'), T('क्रिया', 'काम होने या करने का बोध कराने वाला शब्द'), T('काल', 'क्रिया के होने का समय'), T('विराम चिह्न', 'वाक्य में रुकने का संकेत')] },
        ],
      },
      {
        id: 'pathan',
        name: 'पठन',
        glyph: 'पठ',
        description: 'पढ़ना, समझना और प्रश्नों के उत्तर देना',
        keywords: ['पठन', 'पढ़ना', 'पढ़ाई'],
        chapters: [
          { title: 'पठन', min: 1, max: 12, about: 'सही उच्चारण के साथ पढ़ना और समझना।', objective: 'छोटे पाठ पढ़कर उनके प्रश्नों के उत्तर देना', lessons: ['ज़ोर से पढ़ना', 'सही उच्चारण', 'पाठ को समझना', 'प्रश्नों के उत्तर'], terms: [T('उच्चारण', 'शब्दों को बोलने का ढंग'), T('पाठ', 'पढ़ने के लिए लिखा गया अंश'), T('शीर्षक', 'किसी पाठ का नाम'), T('सार', 'पाठ की मुख्य बात')] },
        ],
      },
      {
        id: 'lekhan',
        name: 'लेखन',
        glyph: 'लेख',
        description: 'सुलेख, अनुच्छेद और पत्र लेखन',
        keywords: ['लेखन', 'लिखना', 'पत्र', 'निबंध', 'अनुच्छेद'],
        chapters: [
          { title: 'लेखन', min: 2, max: 12, about: 'सुंदर लिखावट और छोटे अनुच्छेद लिखना।', objective: 'किसी विषय पर छोटा अनुच्छेद लिखना', lessons: ['सुलेख', 'वाक्य लिखना', 'अनुच्छेद लेखन', 'चित्र वर्णन'], terms: [T('सुलेख', 'सुंदर और साफ़ लिखावट'), T('अनुच्छेद', 'एक विषय पर लिखे गए कुछ वाक्य'), T('वर्णन', 'किसी चीज़ के बारे में विस्तार से बताना'), T('विषय', 'जिस बात पर लिखा जाए')] },
          { title: 'पत्र लेखन', min: 5, max: 12, about: 'औपचारिक और अनौपचारिक पत्र लिखना।', objective: 'सही रूप में पत्र लिखना', lessons: ['अनौपचारिक पत्र', 'औपचारिक पत्र', 'संदेश लेखन', 'निबंध की रूपरेखा'], terms: [T('पत्र', 'किसी को लिखा गया संदेश'), T('संबोधन', 'पत्र की शुरुआत में पाने वाले को पुकारना'), T('निबंध', 'किसी विषय पर विस्तार से लेख'), T('रूपरेखा', 'लिखने से पहले मुख्य बातों की सूची')] },
        ],
      },
      {
        id: 'sahitya',
        name: 'कहानी और कविता',
        glyph: 'क़',
        description: 'कहानियाँ और कविताएँ पढ़ना और समझना',
        keywords: ['कहानी', 'कविता', 'कहानियाँ', 'कविताएँ', 'साहित्य'],
        chapters: [
          { title: 'कहानी', min: 1, max: 12, about: 'कहानियाँ पढ़ना, सुनाना और उनकी सीख समझना।', objective: 'कहानी के पात्र और उसकी सीख बताना', lessons: ['कहानी सुनना', 'पात्र और घटनाएँ', 'कहानी की सीख', 'अपनी कहानी लिखना'], terms: [T('पात्र', 'कहानी में आने वाले लोग या जीव'), T('घटना', 'कहानी में होने वाली बात'), T('सीख', 'कहानी से मिलने वाली शिक्षा'), T('कथानक', 'कहानी की घटनाओं का क्रम')] },
          { title: 'कविता', min: 1, max: 12, about: 'कविताएँ पढ़ना, गाना और उनका भाव समझना।', objective: 'कविता को लय के साथ पढ़ना और उसका भाव बताना', lessons: ['कविता पाठ', 'तुकबंदी', 'कविता का भाव', 'अपनी कविता'], terms: [T('कविता', 'लय और भाव से भरी रचना'), T('तुक', 'पंक्तियों के अंत में मिलती-जुलती ध्वनि'), T('भाव', 'कविता में छिपी भावना'), T('कवि', 'कविता लिखने वाला')] },
        ],
      },
    ],
  },
  {
    id: 'computer',
    key: 'computer',
    name: 'Computer',
    glyph: '💻',
    description: 'Computer basics, digital safety and coding',
    keywords: ['computer', 'computers', 'coding', 'programming', 'technology', 'internet', 'digital', 'code', 'ict', 'it skills'],
    keepWhenFocused: true,
    topics: [
      {
        id: 'computer-basics',
        name: 'Computer Basics',
        glyph: '🖥️',
        description: 'Parts of a computer and using it well',
        keywords: ['computer basics', 'hardware', 'keyboard', 'mouse', 'typing'],
        chapters: [
          { title: 'Parts of a Computer', min: 1, max: 6, about: 'What a computer is and the parts we use.', objective: 'name computer parts and say what each does', lessons: ['What is a Computer?', 'Input Devices', 'Output Devices', 'Storing Our Work'], terms: [T('keyboard', 'used to type letters and numbers'), T('monitor', 'the screen that shows information'), T('mouse', 'used to point and click'), T('storage', 'where files are kept')] },
          { title: 'Using a Computer', min: 1, max: 8, about: 'Opening programs, saving files and taking care of devices.', objective: 'open, save and organise files safely', lessons: ['Starting and Shutting Down', 'Files and Folders', 'Typing Practice', 'Caring for Devices'], terms: [T('file', 'a saved piece of work'), T('folder', 'a place to keep files together'), T('program', 'a set of instructions a computer follows'), T('save', 'to keep work so it can be opened later')] },
        ],
      },
      {
        id: 'digital-safety',
        name: 'Internet & Digital Safety',
        glyph: '🛡️',
        description: 'Using the internet safely and wisely',
        keywords: ['internet', 'online safety', 'cyber', 'digital citizenship', 'online'],
        chapters: [
          { title: 'Internet Basics', min: 3, max: 12, about: 'How the internet works and how to search well.', objective: 'search for information and judge if it is reliable', lessons: ['What is the Internet?', 'Web Browsers', 'Searching Well', 'Is It Reliable?'], terms: [T('internet', 'a network that connects computers around the world'), T('browser', 'a program used to visit websites'), T('search engine', 'a tool that finds information on the web'), T('website', 'a group of pages on the internet')] },
          { title: 'Staying Safe Online', min: 3, max: 12, about: 'Protecting ourselves and others on the internet.', objective: 'follow rules that keep personal information safe', lessons: ['Personal Information', 'Strong Passwords', 'Being Kind Online', 'When to Ask an Adult'], terms: [T('password', 'a secret word or phrase that protects an account'), T('privacy', 'keeping personal information to yourself'), T('cyberbullying', 'being unkind to someone online'), T('scam', 'a trick to steal money or information')] },
        ],
      },
      {
        id: 'coding',
        name: 'Coding & Logic',
        glyph: '</>',
        description: 'Step-by-step thinking, algorithms and simple programs',
        keywords: ['coding', 'programming', 'code', 'algorithm', 'algorithms', 'scratch', 'python', 'logic'],
        chapters: [
          { title: 'Step-by-step Instructions', min: 1, max: 6, about: 'Giving clear instructions in the right order.', objective: 'write clear step-by-step instructions for a task', lessons: ['Following Instructions', 'Putting Steps in Order', 'Finding Mistakes', 'Instructions for a Robot'], terms: [T('instruction', 'a step that tells someone what to do'), T('sequence', 'steps in the right order'), T('bug', 'a mistake in instructions'), T('debug', 'to find and fix a mistake')] },
          { title: 'Coding Basics', min: 4, max: 12, about: 'Algorithms, loops and decisions in simple programs.', objective: 'build simple programs with loops and conditions', lessons: ['Algorithms', 'Loops', 'Conditions', 'Making a Simple Game'], terms: [T('algorithm', 'a set of steps to solve a problem'), T('loop', 'instructions that repeat'), T('condition', 'a check that decides what happens next'), T('program', 'instructions written for a computer')] },
        ],
      },
    ],
  },
  {
    id: 'social',
    key: 'social-science',
    name: 'Social Science',
    glyph: '🏛️',
    description: 'History, geography, civics and culture',
    keywords: ['social science', 'social studies', 'sst', 'society', 'community'],
    keepWhenFocused: true,
    topics: [
      {
        id: 'history',
        name: 'History',
        glyph: '🏺',
        description: 'How people lived in the past',
        keywords: ['history', 'historical', 'civilisation', 'civilization', 'ancient'],
        chapters: [
          { title: 'Our Past', min: 3, max: 12, about: 'How we learn about the past and how life has changed.', objective: 'describe how sources tell us about the past', lessons: ['Then and Now', 'Sources of History', 'Timelines', 'Changes Over Time'], terms: [T('history', 'the study of the past'), T('source', 'something that tells us about the past'), T('timeline', 'events shown in the order they happened'), T('century', 'a period of one hundred years')] },
          { title: 'Early Civilisations', min: 5, max: 12, about: 'Early cities, farming and trade.', objective: 'explain how farming and cities changed early human life', lessons: ['Early Humans', 'The Beginning of Farming', 'Early Cities', 'Trade and Travel'], terms: [T('civilisation', 'a large, organised society'), T('settlement', 'a place where people live together'), T('trade', 'buying, selling or exchanging goods'), T('archaeologist', 'a person who studies objects from the past')] },
        ],
      },
      {
        id: 'geography',
        name: 'Geography',
        glyph: '🗺️',
        description: 'Maps, landforms, climate and resources',
        keywords: ['geography', 'maps', 'map', 'landforms', 'continents', 'rivers', 'mountains', 'resources'],
        chapters: [
          { title: 'Maps and Directions', min: 3, max: 12, about: 'Reading maps and finding directions.', objective: 'read simple maps using directions, symbols and a key', lessons: ['What is a Map?', 'Directions', 'Map Symbols and Keys', 'Using a Globe'], terms: [T('map', 'a drawing of a place seen from above'), T('compass', 'a tool that shows directions'), T('key', 'the part of a map that explains its symbols'), T('globe', 'a round model of the Earth')] },
          { title: 'Landforms and Water Bodies', min: 4, max: 12, about: 'Mountains, plains, rivers and oceans.', objective: 'identify major landforms and water bodies', lessons: ['Mountains and Hills', 'Plains and Plateaus', 'Rivers and Lakes', 'Oceans and Seas'], terms: [T('plain', 'a large area of flat land'), T('plateau', 'a high area of flat land'), T('river', 'a large stream of flowing water'), T('continent', 'one of the large land masses of the Earth')] },
          { title: 'Climate and Resources', min: 5, max: 12, about: 'Climate zones and the resources people use.', objective: 'explain how climate and resources shape how people live', lessons: ['Weather and Climate', 'Natural Resources', 'Using Resources Wisely', 'People and Places'], terms: [T('climate', 'the usual weather of a place over many years'), T('resource', 'something useful that people need'), T('renewable resource', 'a resource that can be replaced naturally'), T('population', 'the number of people living in a place')] },
        ],
      },
      {
        id: 'civics',
        name: 'Civics',
        glyph: '⚖️',
        description: 'Communities, rules, rights and government',
        keywords: ['civics', 'government', 'rights', 'duties', 'rules', 'democracy', 'citizen', 'citizenship'],
        chapters: [
          { title: 'Our Community', min: 1, max: 8, about: 'Families, neighbours and community helpers.', objective: 'describe how people in a community help one another', lessons: ['My Family', 'My Neighbourhood', 'Community Helpers', 'Rules at Home and School'], terms: [T('community', 'people who live and work together in a place'), T('neighbour', 'a person who lives near us'), T('rule', 'a statement of what is allowed'), T('helper', 'a person who does work that helps others')] },
          { title: 'Government and Rules', min: 5, max: 12, about: 'How decisions are made and why we have laws.', objective: 'explain how local government works and why laws matter', lessons: ['Why We Need Rules', 'Local Government', 'Rights and Duties', 'Democracy'], terms: [T('government', 'the group that runs a country or place'), T('law', 'a rule made by the government'), T('democracy', 'government chosen by the people'), T('duty', 'something we should do for others')] },
        ],
      },
      {
        id: 'culture',
        name: 'Culture & Society',
        glyph: '🪔',
        description: 'Festivals, traditions and living together',
        keywords: ['culture', 'cultures', 'festivals', 'traditions', 'heritage'],
        chapters: [
          { title: 'Festivals and Traditions', min: 1, max: 8, about: 'How people celebrate and share their traditions.', objective: 'describe festivals and why traditions matter', lessons: ['Festivals We Celebrate', 'Food and Clothing', 'Languages of India', 'Respecting Differences'], terms: [T('festival', 'a special time of celebration'), T('tradition', 'a custom passed down over time'), T('heritage', 'what we receive from the past'), T('diversity', 'having many different kinds')] },
        ],
      },
    ],
  },
  {
    id: 'gk',
    key: 'general-knowledge',
    name: 'General Knowledge',
    glyph: '💡',
    description: 'Our body, animals, our country and the world around us',
    keywords: ['general knowledge', 'gk', 'general awareness', 'current affairs'],
    keepWhenFocused: true,
    topics: [
      {
        id: 'general-knowledge',
        name: 'General Knowledge',
        glyph: '💡',
        description: 'Interesting facts about the world around us',
        keywords: ['world around us', 'inventions', 'discoveries'],
        chapters: [
          { title: 'Our Body and Health', min: 1, max: 4, about: 'Keeping clean, eating well and staying active.', objective: 'name healthy habits for every day', lessons: ['Keeping Clean', 'Healthy Food', 'Exercise and Play', 'Rest and Sleep'], terms: [T('hygiene', 'keeping ourselves and our things clean'), T('exercise', 'activity that keeps the body fit'), T('healthy', 'well and strong'), T('germs', 'tiny living things that can make us ill')] },
          { title: 'Animals and Birds', min: 1, max: 4, about: 'Fascinating animals and birds and where they live.', objective: 'name animals and birds and say something special about each', lessons: ['Pet Animals', 'Wild Animals', 'Birds Around Us', 'Water Animals'], terms: [T('pet', 'an animal kept at home'), T('wild animal', 'an animal that lives in nature'), T('nest', 'a home a bird builds'), T('den', 'the home of some wild animals')] },
          { title: 'Our Country', min: 1, max: 8, about: 'National symbols, states and famous places of India.', objective: 'name national symbols and famous places in India', lessons: ['National Symbols', 'States and Capitals', 'Famous Places', 'Great Indians'], terms: [T('national flag', 'the flag that stands for a country'), T('capital', 'the city where a government works'), T('monument', 'a building or statue that helps us remember'), T('state', 'a part of a country with its own government')] },
          { title: 'Inventions and Discoveries', min: 4, max: 12, about: 'Inventions that changed how we live.', objective: 'describe important inventions and how they help us', lessons: ['Inventions at Home', 'Travel and Transport', 'Communication', 'Inventors and Ideas'], terms: [T('invention', 'something new that someone made'), T('discovery', 'finding something that already existed'), T('transport', 'ways of moving people and goods'), T('inventor', 'a person who invents something')] },
          { title: 'The World Around Us', min: 3, max: 12, about: 'Countries, continents and wonders of the world.', objective: 'name continents and some famous places around the world', lessons: ['Continents and Oceans', 'Countries and Flags', 'Wonders of the World', 'Sports and Games'], terms: [T('continent', 'one of the seven large land masses'), T('ocean', 'a very large body of salt water'), T('wonder', 'a place that amazes people'), T('flag', 'a piece of cloth that stands for a country')] },
        ],
      },
    ],
  },
  {
    id: 'reasoning',
    key: 'logical-reasoning',
    name: 'Logical Reasoning',
    glyph: '🧩',
    description: 'Patterns, analogies, puzzles and logical thinking',
    keywords: ['reasoning', 'logical reasoning', 'aptitude', 'puzzles', 'puzzle', 'olympiad', 'competitive'],
    keepWhenFocused: true,
    topics: [
      {
        id: 'logical-reasoning',
        name: 'Logical Reasoning',
        glyph: '🧩',
        description: 'Patterns, analogies and puzzles',
        keywords: ['analogies', 'analogy', 'odd one out', 'series', 'coding decoding'],
        chapters: [
          { title: 'Patterns and Series', min: 1, max: 12, numbers: 'pattern', about: 'Finding the next item in a pattern or number series.', objective: 'complete number and figure series', lessons: ['Figure Patterns', 'Number Series', 'Letter Series', 'Mixed Series'], terms: [T('series', 'items arranged by a rule'), T('next term', 'the item that comes after the last one'), T('rule', 'what changes from one item to the next'), T('repeat', 'to happen again')] },
          { title: 'Odd One Out and Classification', min: 1, max: 8, about: 'Grouping things and finding what does not belong.', objective: 'find the odd one out and explain why', lessons: ['Groups and Categories', 'Odd One Out', 'Sorting by Features', 'Explaining Our Choice'], terms: [T('category', 'a group of things that are alike'), T('odd one out', 'the item that does not belong'), T('feature', 'something special about a thing'), T('classify', 'to sort into groups')] },
          { title: 'Analogies and Puzzles', min: 3, max: 12, numbers: 'word', about: 'Seeing relationships and solving puzzles step by step.', objective: 'solve analogies and logic puzzles', lessons: ['Analogies', 'Direction Puzzles', 'Ranking and Ordering', 'Logic Grids'], terms: [T('analogy', 'a comparison showing how two pairs are related'), T('relationship', 'how two things are connected'), T('clue', 'a piece of information that helps solve a puzzle'), T('deduce', 'to work something out from clues')] },
        ],
      },
    ],
  },
];

/** Default subjects (by domain id) when nothing in the brief points anywhere. */
export function defaultDomains(classLevel: number): string[] {
  if (classLevel <= 2) return ['math', 'english', 'hindi', 'gk'];
  if (classLevel <= 5) return ['math', 'english', 'hindi', 'science', 'social'];
  return ['math', 'science', 'english', 'hindi', 'social'];
}

export const domainById = (id: string) => DOMAINS.find((d) => d.id === id);
