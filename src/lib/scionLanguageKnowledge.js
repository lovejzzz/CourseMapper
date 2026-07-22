const MANDARIN_SOURCE = {
  title: 'CHN101: Elementary Mandarin I',
  author: 'Carl Polley, Kapiʻolani Community College',
  license: 'CC BY-NC-SA',
  url: 'https://human.libretexts.org/Courses/Kapiolani_Community_College/CHN101%3A_Elementary_Mandarin_I_(Polley)',
};

// These compact ledgers are compiler-owned language knowledge, not model
// output. Each one gives the weak local model an exact, cited source boundary
// to copy instead of asking it to invent Mandarin examples from a lesson
// title. The model may author pedagogy around the claims, but the canonical
// parser admits only the frozen claims and the matching structured pair.
const BEGINNER_MANDARIN_PAIRS = [
  {
    match: /\b(?:pinyin|four tones?|tone contours?)\b/i,
    pair: { hanzi: '妈', pinyin: 'mā', english: 'mother' },
    facts: [
      '妈 (mā) means "mother" and carries a first-tone mark over the vowel.',
      'The first tone in mā is produced with a high, level pitch contour.',
      'Tone-marked Pinyin records pronunciation; 妈 records the written form.',
    ],
  },
  {
    match: /\b(?:greetings?|self-introductions?)\b/i,
    pair: { hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello' },
    facts: [
      '你好 (nǐ hǎo) is a common Mandarin greeting meaning "hello".',
      '你 (nǐ) means "you" in the greeting 你好 (nǐ hǎo).',
      '好 (hǎo) means "good" and completes 你好 (nǐ hǎo).',
    ],
  },
  {
    match: /\bclassroom language\b/i,
    pair: { hanzi: '请再说一遍。', pinyin: 'Qǐng zài shuō yí biàn.', english: 'Please say it again' },
    facts: [
      '请再说一遍。 (Qǐng zài shuō yí biàn.) means "Please say it again".',
      '请 (qǐng) makes the request polite; 再 (zài) means "again".',
      '一遍 (yí biàn) counts one complete repetition of 说 (shuō), "to speak".',
    ],
  },
  {
    match: /\b(?:numbers?|age|dates?)\b/i,
    pair: { hanzi: '我今年二十岁。', pinyin: 'Wǒ jīnnián èrshí suì.', english: 'I am twenty years old' },
    facts: [
      '我今年二十岁。 (Wǒ jīnnián èrshí suì.) means "I am twenty years old this year".',
      '今年 (jīnnián) means "this year" and precedes the age.',
      '岁 (suì) follows the number 二十 (èrshí) to express twenty years of age.',
    ],
  },
  {
    match: /\b(?:family|possession)\b/i,
    pair: { hanzi: '这是我的妈妈。', pinyin: 'Zhè shì wǒ de māma.', english: 'This is my mother' },
    facts: [
      '这是我的妈妈。 (Zhè shì wǒ de māma.) means "This is my mother".',
      '我的 (wǒ de) means "my," with 的 (de) linking the possessor 我 to 妈妈.',
      '这 (zhè) identifies "this," and 是 (shì) links it to the noun phrase 我的妈妈.',
    ],
  },
  {
    match: /\b(?:daily routines?|telling time)\b/i,
    pair: { hanzi: '我每天七点起床。', pinyin: 'Wǒ měitiān qī diǎn qǐchuáng.', english: 'I get up at seven every day' },
    facts: [
      '我每天七点起床。 (Wǒ měitiān qī diǎn qǐchuáng.) means "I get up at seven every day".',
      '每天 (měitiān) means "every day" and sets the routine frame.',
      '七点 (qī diǎn) means "seven o’clock," while 起床 (qǐchuáng) means "to get up".',
    ],
  },
  {
    match: /\b(?:sentence patterns?|SVO|negation)\b/i,
    pair: { hanzi: '我不喜欢苹果。', pinyin: 'Wǒ bù xǐhuān píngguǒ.', english: 'I do not like apples' },
    facts: [
      '我不喜欢苹果。 (Wǒ bù xǐhuān píngguǒ.) means "I do not like apples".',
      '不 (bù) appears before the verb 喜欢 (xǐhuān) to negate "like".',
      'The sentence follows subject-negation-verb-object order: 我 + 不 + 喜欢 + 苹果.',
    ],
  },
  {
    match: /\b(?:vocabulary recall|grammar review)\b/i,
    pair: { hanzi: '我喜欢苹果。', pinyin: 'Wǒ xǐhuān píngguǒ.', english: 'I like apples' },
    facts: [
      '我喜欢苹果。 (Wǒ xǐhuān píngguǒ.) means "I like apples".',
      '我 (wǒ) is the subject, 喜欢 (xǐhuān) is the verb, and 苹果 (píngguǒ) is the object.',
      'Placing 不 (bù) before 喜欢 changes the affirmative sentence into a negative one.',
    ],
  },
  {
    match: /\b(?:basic characters?|short reading|reading passages?)\b/i,
    pair: { hanzi: '我是学生。', pinyin: 'Wǒ shì xuésheng.', english: 'I am a student' },
    facts: [
      '我是学生。 (Wǒ shì xuésheng.) means "I am a student".',
      '我 (wǒ) is the pronoun "I," and 学生 (xuésheng) is the noun "student".',
      '是 (shì) links the subject 我 to the identifying noun 学生 in this sentence.',
    ],
  },
  {
    match: /\b(?:food|dining|restaurant)\b/i,
    pair: { hanzi: '我喜欢吃米饭。', pinyin: 'Wǒ xǐhuān chī mǐfàn.', english: 'I like to eat rice' },
    facts: [
      '我喜欢吃米饭。 (Wǒ xǐhuān chī mǐfàn.) means "I like to eat rice".',
      '喜欢 (xǐhuān) can take the verb phrase 吃米饭 (chī mǐfàn) as what the speaker likes.',
      '吃 (chī) means "to eat," and 米饭 (mǐfàn) means cooked rice.',
    ],
  },
  {
    match: /\b(?:shopping|money|price)\b/i,
    pair: { hanzi: '这个多少钱？', pinyin: 'Zhège duōshao qián?', english: 'How much is this' },
    facts: [
      '这个多少钱？ (Zhège duōshao qián?) asks "How much is this?".',
      '这个 (zhège) identifies the item whose price the speaker wants to know.',
      '多少钱 (duōshao qián) asks for an amount of money and supplies the price question.',
    ],
  },
  {
    match: /\b(?:weather|clothing)\b/i,
    pair: { hanzi: '今天天气很冷。', pinyin: 'Jīntiān tiānqì hěn lěng.', english: 'The weather is cold today' },
    facts: [
      '今天天气很冷。 (Jīntiān tiānqì hěn lěng.) means "The weather is cold today".',
      '今天 (jīntiān) means "today," and 天气 (tiānqì) means "weather".',
      '很冷 (hěn lěng) is the adjectival predicate describing cold weather.',
    ],
  },
  {
    match: /\b(?:transportation|directions?|subway)\b/i,
    pair: { hanzi: '我坐地铁去学校。', pinyin: 'Wǒ zuò dìtiě qù xuéxiào.', english: 'I take the subway to school' },
    facts: [
      '我坐地铁去学校。 (Wǒ zuò dìtiě qù xuéxiào.) means "I take the subway to school".',
      '坐 (zuò) means to ride a vehicle, and 地铁 (dìtiě) means "subway".',
      '去学校 (qù xuéxiào) means "go to school" and states the destination of the trip.',
    ],
  },
  {
    match: /\b(?:health|feelings?)\b/i,
    pair: { hanzi: '我今天不舒服。', pinyin: 'Wǒ jīntiān bù shūfu.', english: 'I do not feel well today' },
    facts: [
      '我今天不舒服。 (Wǒ jīntiān bù shūfu.) means "I do not feel well today".',
      '不舒服 (bù shūfu) describes feeling physically unwell or uncomfortable.',
      '今天 (jīntiān) places the feeling in the time frame "today".',
    ],
  },
  {
    match: /\b(?:course review|final oral|oral performance)\b/i,
    pair: { hanzi: '你好，我叫李明。', pinyin: 'Nǐ hǎo, wǒ jiào Lǐ Míng.', english: 'Hello, my name is Li Ming' },
    facts: [
      '你好，我叫李明。 (Nǐ hǎo, wǒ jiào Lǐ Míng.) means "Hello, my name is Li Ming".',
      '你好 (nǐ hǎo) opens the introduction with the greeting "hello".',
      '我叫 (wǒ jiào) introduces the speaker’s name before the example name 李明.',
    ],
  },
];

function resolveBeginnerMandarinEntry(lesson = {}) {
  // Prefer the lesson itself. Review anchors are supporting context and must
  // never let an earlier lesson steal a later lesson's canonical identity.
  const directIdentity = [lesson?.title, lesson?.topics].filter(Boolean).join(' ');
  const direct = BEGINNER_MANDARIN_PAIRS.find((entry) => entry.match.test(directIdentity));
  if (direct) return direct;
  const reviewIdentity = (Array.isArray(lesson?.reviewAnchors) ? lesson.reviewAnchors : []).filter(Boolean).join(' ');
  return BEGINNER_MANDARIN_PAIRS.find((entry) => entry.match.test(reviewIdentity)) || null;
}

export function resolveScionTargetLanguagePair({ courseName = '', lesson = {} } = {}) {
  if (!/\b(?:mandarin|chinese)\b/i.test(String(courseName))) return null;
  const match = resolveBeginnerMandarinEntry(lesson);
  return match ? { ...match.pair } : null;
}

export function resolveScionTargetLanguageKnowledge({ courseName = '', lesson = {} } = {}) {
  if (!/\b(?:mandarin|chinese)\b/i.test(String(courseName))) return null;
  const match = resolveBeginnerMandarinEntry(lesson);
  if (!match || !Array.isArray(match.facts) || match.facts.length < 3) return null;
  return {
    pair: { ...match.pair },
    facts: match.facts.map((fact) => String(fact)),
    source: { ...MANDARIN_SOURCE },
  };
}

/**
 * Cumulative review lessons are compiler projections, so they bypass the
 * model-backed language-identity pass. Resolve the lesson-specific local pair
 * when one exists; otherwise reuse a pair already admitted in the reviewed
 * lessons. Returning a copy keeps the projection from mutating its source.
 */
export function resolveScionCumulativeTargetLanguagePair({ courseName = '', lesson = {}, entries = [] } = {}) {
  const direct = resolveScionTargetLanguagePair({ courseName, lesson });
  if (direct) return direct;
  const inherited = (Array.isArray(entries) ? entries : [])
    .map((entry) => entry?.payload?.targetLanguagePair)
    .find((pair) => pair?.hanzi && pair?.pinyin && pair?.english);
  return inherited ? { ...inherited } : null;
}
