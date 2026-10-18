import type { CourseBrief, CourseOutline } from './course';

/**
 * What an AI provider is told. The class level decides the language, length and difficulty of
 * everything it writes; the subject decides what a sensible curriculum covers. The administrator's
 * own description and instructions come last, as the specific request inside those bounds.
 */

/** How to write for a class: the band it falls in. */
export function ageBand(level: number): { age: string; style: string } {
  if (level <= 2)
    return {
      age: `${level + 5}–${level + 6} years`,
      style:
        'Very young children who are just learning to read. Use very short sentences (5–8 words), everyday words, one idea at a time, ' +
        'concrete things they can see or touch (fruit, animals, toys, family), and picture-friendly examples. Explanations: 2–4 short sentences. ' +
        'Questions: recognising, naming, matching, counting, choosing — never multi-step reasoning.',
    };
  if (level <= 5)
    return {
      age: `${level + 5}–${level + 6} years`,
      style:
        'Primary-school children. Use clear, simple sentences and familiar contexts (home, school, market, nature). Explanations: a short paragraph or two ' +
        'with a worked example. Questions mix recall with simple application and short word problems; avoid abstract jargon.',
    };
  if (level <= 8)
    return {
      age: `${level + 5}–${level + 6} years`,
      style:
        'Middle-school students. Explain concepts properly with definitions, reasons and two or three worked examples. Questions include application ' +
        'and reasoning, multi-step problems and short written answers.',
    };
  return {
    age: `${level + 5}–${level + 6} years`,
    style:
      'Secondary-school students. Explain precisely with correct terminology, derivations or reasoning where relevant, and real-world applications. ' +
      'Questions include analysis, multi-step problems and justification.',
  };
}

/** What a curriculum in this subject is made of (the subject's library key or its name). */
export function subjectGuide(subject: { key: string; title: string }, level: number): string {
  const name = `${subject.key} ${subject.title}`.toLowerCase();
  if (/hindi|हिंदी|हिन्दी/.test(name))
    return level <= 2
      ? 'Hindi for beginners: वर्णमाला, स्वर (अ–औ), व्यंजन, मात्राएँ (ा ि ी ु ू े ै ो ौ), दो और तीन अक्षर के शब्द, सरल शब्द पढ़ना, छोटे वाक्य, अभ्यास. Write all learning content in Hindi (Devanagari).'
      : level <= 5
        ? 'Hindi: मात्राएँ और शब्द निर्माण, संज्ञा, सर्वनाम, विशेषण, क्रिया, लिंग, वचन, पर्यायवाची, विलोम, वाक्य निर्माण, अपठित गद्यांश, कहानी, कविता, पत्र/अनुच्छेद लेखन. Write in Hindi (Devanagari).'
        : 'Hindi: व्याकरण (संधि, समास, काल, वाच्य, मुहावरे, लोकोक्तियाँ), गद्य और पद्य, अपठित गद्यांश, निबंध और पत्र लेखन. Write in Hindi (Devanagari).';
  if (/english/.test(name))
    return level <= 2
      ? 'English for beginners: the alphabet (capital and small letters), phonics and letter sounds, simple CVC words, sight words, vocabulary (colours, animals, family), naming and action words, short sentences, picture reading.'
      : level <= 5
        ? 'English: vocabulary, nouns, pronouns, verbs, adjectives, articles, tenses, punctuation, sentence formation, reading comprehension with short passages, and guided writing.'
        : 'English: grammar (tenses, voice, reported speech, clauses), vocabulary, reading comprehension, literature, and formal and creative writing.';
  if (/math|गणित/.test(name))
    return level <= 2
      ? 'Mathematics for beginners: counting and numbers to 100, comparing numbers, addition and subtraction with small numbers, shapes, patterns, simple measurement (longer/shorter), money and time basics, and picture word problems. Every numeric answer must be correct.'
      : level <= 5
        ? 'Mathematics: place value, the four operations, multiplication tables, fractions, decimals (Class 4+), geometry and shapes, perimeter and area, measurement, time, money, data handling and word problems. Every numeric answer must be correct.'
        : 'Mathematics: integers, fractions and decimals, ratio and percentage, algebraic expressions and equations, geometry, mensuration, data handling and probability, with multi-step problems. Every numeric answer must be correct — check each one.';
  if (/science|evs|environment/.test(name))
    return level <= 5
      ? 'Science / EVS: living and non-living things, plants, animals, our body, food, water, air, weather, our environment and safety — observation-based and with everyday examples.'
      : 'Science: physics, chemistry and biology concepts appropriate to the class, with experiments described safely (no dangerous procedures), observations and explanations.';
  if (/social|history|geography|civics/.test(name))
    return 'Social Studies: family and community, our country, maps and geography, history stories, civics and how we live together — appropriate to the class level.';
  return `${subject.title}: plan a balanced, age-appropriate curriculum for this subject, building from basics to application.`;
}

const LANGUAGE_RULE: Record<CourseBrief['language'], string> = {
  english: 'Write everything in English.',
  hindi: 'Write everything in Hindi (Devanagari script).',
  bilingual: 'Write explanations in simple English and give key words and examples in both English and Hindi (Devanagari).',
  hinglish: 'Write in Hinglish: simple Hindi written in Roman (English) letters, mixed naturally with everyday English words, the way it is spoken in Indian homes and classrooms. Keep subject terms in English where that is how they are taught.',
};

const LEVEL_RULE: Record<CourseBrief['level'], string> = {
  beginner: 'Difficulty: beginner — the very first steps of the topic.',
  basic: 'Difficulty: basic — core ideas, mostly recall and simple use.',
  intermediate: 'Difficulty: intermediate — solid understanding and application.',
  advanced: 'Difficulty: advanced — challenging application within what this class can do.',
};

/** The rules every request carries: who the learners are, safety, and the output contract. */
export function systemPrompt(brief: CourseBrief): string {
  const band = ageBand(brief.classLevel);
  return [
    `You write school curriculum content for Class ${brief.classLevel} (learners aged about ${band.age}).`,
    band.style,
    LANGUAGE_RULE[brief.language],
    LEVEL_RULE[brief.level],
    'The content must be educational, accurate, age-appropriate and on the subject. Never include adult, violent, frightening, political, ' +
      'commercial or unsafe content, dangerous instructions, or anything unrelated to learning. Do not copy textbooks; write original material.',
    'Questions: use the types mcq, true-false, fill-blank, short-answer, match and word-problem as they suit the topic. Every question has exactly one correct answer. ' +
      'For mcq and match, the answer must be exactly one of the options; for true-false the options are exactly ["True","False"] (or ["सही","गलत"] in Hindi). ' +
      'Fill-blank prompts mark the blank with "____". Give a one-sentence explanation of each answer.',
    'Reply only with JSON that matches the requested schema.',
  ].join('\n\n');
}

function adminRequest(brief: CourseBrief): string {
  const parts = [
    `Subject: ${brief.subject.title}. Course title: ${brief.title}.`,
    brief.description && `Course description: ${brief.description}`,
    `What a good curriculum covers here: ${subjectGuide(brief.subject, brief.classLevel)}`,
    brief.prompt && `The administrator's request: ${brief.prompt}`,
    brief.goals && `Learning goals: ${brief.goals}`,
    brief.include && `Topics to cover: ${brief.include}`,
    brief.avoid && `Topics to avoid: ${brief.avoid}`,
    brief.instructions && `Special instructions: ${brief.instructions}`,
  ];
  return parts.filter(Boolean).join('\n');
}

export function outlinePrompt(brief: CourseBrief): string {
  return [
    adminRequest(brief),
    `Plan the course: exactly ${brief.chapters} chapters, in teaching order from simplest to hardest, each with exactly ${brief.lessonsPerChapter} lesson titles. ` +
      'Give the course a title, a one- or two-sentence description and 3–5 learning objectives. Chapter titles must be distinct. ' +
      `Also return classLevel: ${brief.classLevel} and subject: "${brief.subject.title}" exactly.`,
  ].join('\n\n');
}

export function chapterPrompt(brief: CourseBrief, outline: CourseOutline, index: number): string {
  const ch = outline.chapters[index]!;
  return [
    adminRequest(brief),
    `The course plan (for context): ${outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join('; ')}.`,
    `Write chapter ${index + 1}: "${ch.title}" — ${ch.description}`,
    `Exactly ${brief.lessonsPerChapter} lessons, in this order: ${ch.lessonTitles.map((t, i) => `${i + 1}. ${t}`).join('; ')}.`,
    `Each lesson: a clear explanation, 2–4 worked examples, 3–5 key points, exactly ${brief.questionsPerLesson} questions (with answers), 2–3 extra practice questions, ` +
      'and an estimated learning time in minutes. The chapter also has a short introduction (description), 3–5 learning objectives, a quiz of 5–8 questions with answers covering all its lessons, ' +
      'a difficulty (easy, medium or hard) and a summary of 2–4 sentences recapping what the chapter taught. Never use placeholder text: every field must be real, finished content.',
  ].join('\n\n');
}

export function lessonPrompt(brief: CourseBrief, chapter: { title: string; description: string; lessonTitles: string[] }, index: number): string {
  return [
    adminRequest(brief),
    `Chapter: "${chapter.title}" — ${chapter.description}. Its lessons: ${chapter.lessonTitles.join('; ')}.`,
    `Write lesson ${index + 1}: "${chapter.lessonTitles[index]}". A clear explanation, 2–4 worked examples, 3–5 key points, exactly ${brief.questionsPerLesson} questions (with answers), ` +
      '2–3 extra practice questions and an estimated learning time in minutes.',
  ].join('\n\n');
}

export function questionsPrompt(brief: CourseBrief, lesson: { title: string; explanation: string }, count: number): string {
  return [
    adminRequest(brief),
    `Lesson: "${lesson.title}".\n${lesson.explanation.slice(0, 3000)}`,
    `Write exactly ${count} new questions (with answers) on this lesson, varied in type and suited to Class ${brief.classLevel}.`,
  ].join('\n\n');
}
