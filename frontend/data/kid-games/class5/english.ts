import type {
  BuildQuestion,
  ChoiceQuestion,
  MatchQuestion,
  OrderQuestion,
  SortQuestion,
  SubjectContent,
} from '../../../lib/kid-games/types';

/** Class 5 English: continuous and perfect tenses, subject–verb agreement, correction, vocabulary and comprehension. */

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
  pick('Choose the missing word or words.', options, answer, { sentence, ...(explain ? { explain } : {}) });
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

const DICT = 'Put the words in dictionary order.';
const COUNT = 'Is it countable or uncountable?';

const KALAM =
  'Dr A. P. J. Abdul Kalam was born in Rameswaram, a small town in Tamil Nadu. As a boy, he sold newspapers to help his family. He loved to study and dreamt of flying. He became a great scientist and worked on rockets and missiles for India. Later, he became the President of India. Children loved him because he always told them to dream big and work hard.';
const PLASTIC =
  'Plastic bags are cheap and easy to carry, but they are harmful to nature. They do not rot for hundreds of years. When animals eat them by mistake, they fall sick. Plastic also blocks drains and causes flooding during the rains. We can help by carrying cloth or jute bags when we go shopping. Small steps like this can keep our Earth clean and green.';
const SHIMLA =
  'Last summer, Anaya visited Shimla with her parents. They travelled on the toy train from Kalka, which climbs slowly through tunnels and pine forests. Anaya counted more than twenty tunnels on the way! In Shimla, the air was cool and fresh. They walked on the Mall Road and ate hot roasted corn. Anaya wrote about the trip in her diary so that she would never forget it.';

const content: SubjectContent = {
  'alphabet-adventure': {
    learn: 'Dictionary order for long words, and ordering events',
    questions: [
      order(DICT, ['conserve', 'consider', 'constant', 'construct']),
      order(DICT, ['preface', 'prefer', 'prefix', 'prepare', 'present']),
      order(DICT, ['interest', 'internal', 'internet', 'interval', 'interview']),
      order(DICT, ['comfort', 'comic', 'command', 'comment', 'common']),
      order(DICT, ['there', 'these', 'they', 'thick', 'thief']),
      order(DICT, ['discover', 'discuss', 'dish', 'dishonest', 'distance']),
      order(DICT, ['pain', 'paint', 'painter', 'painting', 'pair']),
      order(DICT, ['season', 'seat', 'second', 'secret', 'section']),
      order(DICT, ['rain', 'rainbow', 'raincoat', 'rainfall', 'rainy']),
      order(DICT, ['knee', 'kneel', 'knife', 'knight', 'knit', 'knock']),
      order(DICT, ['photo', 'photograph', 'photographer', 'physical', 'physics']),
      order(DICT, ['accept', 'accident', 'account', 'accurate', 'ache']),
      order('Put the events of the story in order.', [
        'The hare laughed at the slow tortoise.',
        'They agreed to run a race.',
        'The hare took a nap under a tree.',
        'The tortoise kept walking and crossed the finish line.',
        'The hare woke up and found that he had lost.',
      ]),
      order('Put the stages of the water cycle in order.', [
        'The sun heats the water in seas and rivers.',
        'The water turns into vapour and rises.',
        'The vapour cools and forms clouds.',
        'The water falls back as rain.',
      ]),
      order('Put the sentences in order to make a paragraph.', [
        'Last Sunday, our school held a sports day.',
        'The day began with a march past.',
        'Then there were races and games.',
        'At the end, the principal gave away the prizes.',
      ]),
    ],
  },

  'word-match': {
    learn: 'Past participles, meanings, idioms and one-word answers',
    questions: [
      match('Match each verb to its past participle.', [['write', 'written'], ['go', 'gone'], ['eat', 'eaten'], ['speak', 'spoken']]),
      match('Match each verb to its past participle.', [['begin', 'begun'], ['choose', 'chosen'], ['fly', 'flown'], ['take', 'taken']]),
      match('Match each word to its meaning.', [
        ['fragile', 'easily broken'],
        ['generous', 'happy to give and share'],
        ['curious', 'eager to know'],
        ['humble', 'not proud'],
      ]),
      match('Match each meaning to one word.', [
        ['one who flies an aircraft', 'pilot'],
        ['a book of words and their meanings', 'dictionary'],
        ['able to speak two languages', 'bilingual'],
        ['the story of your life written by you', 'autobiography'],
      ]),
      match('Match each idiom to its meaning.', [
        ['a piece of cake', 'very easy'],
        ['once in a blue moon', 'very rarely'],
        ['over the moon', 'very happy'],
        ['break the ice', 'start a friendly talk'],
      ]),
      match('Match the verb to its noun.', [['decide', 'decision'], ['arrive', 'arrival'], ['grow', 'growth'], ['invite', 'invitation']]),
      match('Match each word to its opposite.', [['accept', 'reject'], ['victory', 'defeat'], ['maximum', 'minimum'], ['expand', 'shrink']]),
    ],
  },

  'picture-word-match': {
    learn: 'Science words, synonyms, opposites and homophones',
    questions: [
      match('Find the picture and its word.', [['🔋', 'battery'], ['💡', 'bulb'], ['🧪', 'test tube'], ['🛰️', 'satellite']]),
      match('Find the picture and its word.', [['🪐', 'Saturn'], ['☄️', 'comet'], ['🌌', 'galaxy'], ['🚀', 'rocket']]),
      match('Find the picture and its word.', [['🦏', 'rhinoceros'], ['🦛', 'hippopotamus'], ['🐊', 'crocodile'], ['🦎', 'lizard']]),
      match('Find the picture and its word.', [['🌪️', 'tornado'], ['🌫️', 'fog'], ['⛈️', 'thunderstorm'], ['🌅', 'sunrise']]),
      match('Find the pairs of words that mean the same.', [['enormous', 'gigantic'], ['rapid', 'swift'], ['courageous', 'brave'], ['weary', 'tired']]),
      match('Find the pairs of opposites.', [['generous', 'selfish'], ['permanent', 'temporary'], ['expand', 'contract'], ['ancient', 'modern']]),
      match('Find the pairs of words that sound the same.', [['pair', 'pear'], ['hear', 'here'], ['whole', 'hole'], ['weak', 'week']]),
    ],
  },

  'spell-it': {
    learn: 'Spelling long and difficult words',
    questions: [
      spell('🦏', 'rhinoceros', ['rhinoseros', 'rhinocerous', 'rinoceros']),
      spell('🦛', 'hippopotamus', ['hipopotamus', 'hippopotamous', 'hippopotomus']),
      spell('🐊', 'crocodile', ['crocodial', 'crocadile', 'crokodile']),
      spell('🛰️', 'satellite', ['satelite', 'sattelite', 'satallite']),
      spell('🔋', 'battery', ['battary', 'batery', 'battry']),
      spell('🌪️', 'tornado', ['tornedo', 'tornadoe', 'tornardo']),
      spell('🥒', 'cucumber', ['cucumbar', 'cucamber', 'kukumber']),
      spell('📰', 'newspaper', ['newpaper', 'newspapper', 'newsppaper']),
      spell('🏆', 'trophy', ['trophie', 'trofy', 'trophey']),
      spell('🧳', 'suitcase', ['suitcace', 'sootcase', 'suitecase']),
      spell('🪂', 'parachute', ['parashoot', 'parachoot', 'parachut']),
      spell('🥥', 'coconut', ['coconutt', 'kokonut', 'cocunut']),
      spell('🐙', 'octopus', ['octapus', 'octopuss', 'octupus']),
      spell('🗓️', 'calendar', ['calender', 'calandar', 'calindar']),
      spell('🚁', 'helicopter', ['helicoptor', 'helecopter', 'hellicopter']),
      spell('🦖', 'dinosaur', ['dinasaur', 'dinosour', 'dynosaur']),
    ],
  },

  'missing-letter': {
    learn: 'Continuous and perfect tenses, agreement and prepositions',
    questions: [
      gap('She ___ in this school since 2022.', ['has studied', 'studies', 'is studying', 'studied'], 'has studied', '"Since" goes with the present perfect: has studied.'),
      gap('Look! It ___ heavily.', ['is raining', 'rains', 'rained', 'has rain'], 'is raining', '"Look!" shows it is happening now.'),
      gap('Each of the students ___ a new book.', ['has', 'have', 'are having'], 'has', '"Each" is singular, so it takes "has".'),
      gap('The box of pencils ___ on the table.', ['is', 'are'], 'is', 'The subject is "the box", which is singular.'),
      gap('We ___ dinner when the lights went out.', ['were having', 'are having', 'have had', 'will have'], 'were having'),
      gap('By the time we reached the station, the train ___.', ['had left', 'has left', 'leaves', 'will leave'], 'had left'),
      gap('I ___ my homework already.', ['have finished', 'finish', 'will finish', 'am finishing'], 'have finished'),
      gap('My brother and I ___ cricket every evening.', ['play', 'plays', 'is playing'], 'play'),
      gap('The news ___ very good.', ['is', 'are'], 'is', '"News" is uncountable and takes a singular verb.'),
      gap('Mathematics ___ my favourite subject.', ['is', 'are'], 'is'),
      gap('Riya ___ a new dress yesterday.', ['bought', 'has bought', 'buys'], 'bought', '"Yesterday" needs the simple past.'),
      gap('He divided the sweets ___ his two sisters.', ['between', 'among'], 'between', 'Use "between" for two.'),
      gap('The teacher shared the books ___ all the students.', ['among', 'between'], 'among', 'Use "among" for more than two.'),
      gap('The Ganga flows ___ the Bay of Bengal.', ['into', 'in', 'at'], 'into'),
      gap('Listen! Someone ___ at the door.', ['is knocking', 'knocks', 'knocked'], 'is knocking'),
      gap('If it rains, we ___ indoors.', ['will play', 'played', 'had played'], 'will play'),
    ],
  },

  'sentence-builder': {
    learn: 'Building longer sentences with correct tense and agreement',
    questions: [
      build('She has lived in Pune since 2020.', ['have']),
      build('We were watching a film when it rained.', ['was']),
      build('The children have planted trees around the school.', ['has']),
      build('Every student must wear the school uniform.'),
      build('My grandfather has visited many countries.', ['visit']),
      build('The book on the shelf belongs to Meera.', ['belong']),
      build('Have you finished your science project yet?', ['Has']),
      build('Neither of the answers is correct.', ['are']),
      build('The team is practising for the final match.'),
      build('Water boils at one hundred degrees Celsius.', ['boil']),
      build('Rahul had already left when I arrived.'),
      build('Our country celebrates Independence Day on 15 August.'),
      build('Mother is making kheer for the guests.', ['are']),
      build('Could you please lend me your dictionary?', ['borrow']),
      build('The old lighthouse stands on a rocky island.', ['an']),
      build('Reading good books improves our vocabulary.', ['improve']),
    ],
  },

  'grammar-quest': {
    learn: 'Countable nouns, agreement and tense forms',
    questions: [
      sort(COUNT, { Countable: ['chair', 'apple', 'coin'], Uncountable: ['water', 'sugar', 'advice'] }),
      sort(COUNT, { Countable: ['book', 'idea', 'bottle'], Uncountable: ['milk', 'furniture', 'information'] }),
      sort('Does the subject take "is" or "are"?', {
        is: ['The dog', 'Everyone', 'The news'],
        are: ['The dogs', 'My parents', 'Ravi and Sita'],
      }),
      sort('Which tense is it?', {
        'Present continuous': ['is eating', 'are running'],
        'Present perfect': ['has eaten', 'have run'],
        'Past continuous': ['was eating', 'were running'],
      }),
      sort('Which tense is it?', {
        'Simple past': ['She cooked.', 'They danced.'],
        'Past continuous': ['She was cooking.', 'They were dancing.'],
        'Past perfect': ['She had cooked.', 'They had danced.'],
      }),
      sort('Is it a noun, an adjective or an adverb?', { Noun: ['kindness', 'honesty'], Adjective: ['brave', 'careful'], Adverb: ['bravely', 'carefully'] }),
      sort('Is the sentence correct or incorrect?', {
        Correct: ['He goes to school.', 'They were late.', 'She has two sisters.'],
        Incorrect: ['He go to school.', 'They was late.', 'She have two sisters.'],
      }),
    ],
  },

  'vocabulary-challenge': {
    learn: 'Synonyms, antonyms, idioms, word forms and spelling',
    questions: [
      pick('Which word is a synonym of "courageous"?', ['brave', 'fearful', 'gentle', 'clever'], 'brave'),
      pick('Which word is an antonym of "generous"?', ['selfish', 'kind', 'humble', 'wealthy'], 'selfish'),
      pick('What does "fragile" mean?', ['easily broken', 'very strong', 'very heavy', 'very old'], 'easily broken'),
      pick('What is one word for "a person who does not eat meat"?', ['vegetarian', 'butcher', 'carnivore', 'chef'], 'vegetarian'),
      pick('What is one word for "a place where films are shown"?', ['cinema', 'museum', 'gallery', 'library'], 'cinema'),
      pick('What does "to be all ears" mean?', ['to listen carefully', 'to have big ears', 'to hear nothing', 'to talk a lot'], 'to listen carefully'),
      pick('What does "to let the cat out of the bag" mean?', ['to tell a secret', 'to free a pet', 'to go shopping', 'to lose something'], 'to tell a secret'),
      pick('Which word is spelt correctly?', ['accommodation', 'accomodation', 'acommodation', 'accommodasion'], 'accommodation'),
      pick('Which word is spelt correctly?', ['environment', 'enviroment', 'envirnment', 'environmant'], 'environment'),
      pick('Which is the noun form of "brave"?', ['bravery', 'bravely', 'braver', 'braved'], 'bravery'),
      pick('Which ending turns "comfort" into an adjective?', ['-able', '-ment', '-ness', '-ly'], '-able', { explain: 'comfort + able = comfortable, a describing word.' }),
      pick('Which word means "to make something bigger"?', ['enlarge', 'reduce', 'shrink', 'divide'], 'enlarge'),
      pick('Which is the odd one out?', ['delighted', 'joyful', 'cheerful', 'gloomy'], 'gloomy', { explain: 'Gloomy means sad. The others mean happy.' }),
      pick('Which word completes "I can ___ the birds singing."?', ['hear', 'here'], 'hear'),
      pick('Which word is a synonym of "rapid"?', ['quick', 'slow', 'steady', 'late'], 'quick'),
      pick('Which word has a silent letter?', ['knife', 'nice', 'nose', 'fine'], 'knife', { explain: 'The k in "knife" is silent.' }),
    ],
  },

  'reading-challenge': {
    learn: 'Reading longer passages and thinking about them',
    questions: [
      read(KALAM, 'Where was Dr Kalam born?', ['in Rameswaram', 'in Delhi', 'in Mumbai', 'in Kolkata'], 'in Rameswaram'),
      read(KALAM, 'Why did young Kalam sell newspapers?', ['to help his family', 'to buy toys', 'to become famous', 'to meet people'], 'to help his family'),
      read(KALAM, 'What did he work on as a scientist?', ['rockets and missiles', 'trains and buses', 'ships and boats', 'cars and bikes'], 'rockets and missiles'),
      read(KALAM, 'What did Dr Kalam tell children?', ['to dream big and work hard', 'to play all day', 'to read only newspapers', 'to stay at home'], 'to dream big and work hard'),
      read(KALAM, 'Which word best describes Dr Kalam?', ['hardworking', 'lazy', 'careless', 'unkind'], 'hardworking'),
      read(PLASTIC, 'Why are plastic bags harmful to nature?', ['They do not rot for hundreds of years.', 'They are too heavy.', 'They are very costly.', 'They tear easily.'], 'They do not rot for hundreds of years.'),
      read(PLASTIC, 'What happens when animals eat plastic?', ['They fall sick.', 'They grow strong.', 'They sleep well.'], 'They fall sick.'),
      read(PLASTIC, 'What does plastic cause during the rains?', ['flooding', 'fires', 'dry weather'], 'flooding'),
      read(PLASTIC, 'What should we carry when we go shopping?', ['cloth or jute bags', 'more plastic bags', 'paper plates', 'nothing at all'], 'cloth or jute bags'),
      read(PLASTIC, 'What does "harmful" mean?', ['causing damage', 'very useful', 'full of colour', 'easy to carry'], 'causing damage'),
      read(SHIMLA, 'How did Anaya travel to Shimla?', ['by toy train', 'by aeroplane', 'by ship', 'by bus'], 'by toy train'),
      read(SHIMLA, 'Where did the toy train start from?', ['Kalka', 'Delhi', 'Shimla', 'Manali'], 'Kalka'),
      read(SHIMLA, 'How was the air in Shimla?', ['cool and fresh', 'hot and dusty', 'wet and smoky'], 'cool and fresh'),
      read(SHIMLA, 'Why did Anaya write in her diary?', ['so that she would never forget the trip', 'because her teacher asked her to', 'to send it to a friend'], 'so that she would never forget the trip'),
      read(SHIMLA, 'In which season did Anaya visit Shimla?', ['summer', 'winter', 'monsoon', 'spring'], 'summer'),
    ],
  },

  'english-quiz': {
    learn: 'A mixed quiz on tenses, agreement and vocabulary',
    questions: [
      pick('Which sentence is in the present perfect tense?', ['I have eaten my lunch.', 'I ate my lunch.', 'I am eating my lunch.', 'I will eat my lunch.'], 'I have eaten my lunch.'),
      pick('Which sentence is in the past continuous tense?', ['They were playing chess.', 'They played chess.', 'They have played chess.', 'They play chess.'], 'They were playing chess.'),
      pick('Which sentence uses the future continuous tense?', ['I will be travelling tomorrow.', 'I will travel tomorrow.', 'I travelled yesterday.', 'I am travelling now.'], 'I will be travelling tomorrow.'),
      pick('Which sentence is correct?', ['The list of names is long.', 'The list of names are long.', 'The list of names were long.'], 'The list of names is long.'),
      pick('Which sentence is correct?', ['Everybody likes ice cream.', 'Everybody like ice cream.', 'Everybody are liking ice cream.'], 'Everybody likes ice cream.'),
      pick('Find the correction: "She don\'t know the answer."', ["don't → doesn't", 'know → knows', 'the → a', 'answer → answers'], "don't → doesn't"),
      pick('What is the past participle of "break"?', ['broken', 'broke', 'breaked', 'braked'], 'broken'),
      pick('Which noun is uncountable?', ['rice', 'pencil', 'chair', 'bird'], 'rice'),
      pick('Which word is an abstract noun?', ['honesty', 'table', 'river', 'teacher'], 'honesty', { explain: 'An abstract noun names something we cannot see or touch.' }),
      pick('Which word is a synonym of "silent"?', ['quiet', 'loud', 'noisy', 'busy'], 'quiet'),
      pick('Which word is an antonym of "permanent"?', ['temporary', 'lasting', 'constant', 'solid'], 'temporary'),
      pick('Fill in: He has been ill ___ Monday.', ['since', 'for', 'at'], 'since', { explain: 'Use "since" with a starting point in time.' }),
      pick('Fill in: I have lived here ___ five years.', ['for', 'since', 'at'], 'for', { explain: 'Use "for" with a length of time.' }),
      pick('Which question is correct?', ['Where do you live?', 'Where you live?', 'Where does you live?', 'Where you do live?'], 'Where do you live?'),
      pick('Change to the plural: "This is my book."', ['These are my books.', 'This are my books.', 'These is my books.', 'Those is my book.'], 'These are my books.'),
      pick('Which word is the conjunction in "I stayed home because it was raining."?', ['because', 'home', 'stayed', 'raining'], 'because'),
      pick('Which spelling is correct?', ['separate', 'seperate', 'separete', 'saparate'], 'separate'),
    ],
  },
};

export default content;
