const BEGINNER_MANDARIN_PAIRS = [
  { match: /(?:pinyin|four tones?|tone contours?)/i, pair: { hanzi: '妈', pinyin: 'mā', english: 'mother' } },
  {
    match: /(?:greetings?|introductions?|self-introductions?)/i,
    pair: { hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello' },
  },
  {
    match: /classroom language/i,
    pair: { hanzi: '请再说一遍。', pinyin: 'Qǐng zài shuō yí biàn.', english: 'Please say it again' },
  },
  {
    match: /(?:numbers?|age|dates?)/i,
    pair: { hanzi: '我今年二十岁。', pinyin: 'Wǒ jīnnián èrshí suì.', english: 'I am twenty years old' },
  },
  {
    match: /(?:family|possession)/i,
    pair: { hanzi: '这是我的妈妈。', pinyin: 'Zhè shì wǒ de māma.', english: 'This is my mother' },
  },
  {
    match: /(?:daily routines?|telling time)/i,
    pair: { hanzi: '我每天七点起床。', pinyin: 'Wǒ měitiān qī diǎn qǐchuáng.', english: 'I get up at seven every day' },
  },
  {
    match: /(?:sentence patterns?|\bSVO\b|negation)/i,
    pair: { hanzi: '我喜欢苹果。', pinyin: 'Wǒ xǐhuān píngguǒ.', english: 'I like apples' },
  },
  {
    match: /(?:vocabulary recall|grammar review)/i,
    pair: { hanzi: '我喜欢苹果。', pinyin: 'Wǒ xǐhuān píngguǒ.', english: 'I like apples' },
  },
  {
    match: /(?:basic characters?|short reading|reading passages?)/i,
    pair: { hanzi: '我是学生。', pinyin: 'Wǒ shì xuésheng.', english: 'I am a student' },
  },
  {
    match: /(?:food|dining|restaurant)/i,
    pair: { hanzi: '我喜欢吃米饭。', pinyin: 'Wǒ xǐhuān chī mǐfàn.', english: 'I like to eat rice' },
  },
  {
    match: /(?:shopping|money|price)/i,
    pair: { hanzi: '这个多少钱？', pinyin: 'Zhège duōshao qián?', english: 'How much is this' },
  },
  {
    match: /(?:weather|clothing)/i,
    pair: { hanzi: '今天天气很冷。', pinyin: 'Jīntiān tiānqì hěn lěng.', english: 'The weather is cold today' },
  },
  {
    match: /(?:transportation|directions?|subway)/i,
    pair: { hanzi: '我坐地铁去学校。', pinyin: 'Wǒ zuò dìtiě qù xuéxiào.', english: 'I take the subway to school' },
  },
  {
    match: /(?:health|feelings?)/i,
    pair: { hanzi: '我今天不舒服。', pinyin: 'Wǒ jīntiān bù shūfu.', english: 'I do not feel well today' },
  },
  {
    match: /(?:course review|final oral|oral performance)/i,
    pair: { hanzi: '你好，我叫李明。', pinyin: 'Nǐ hǎo, wǒ jiào Lǐ Míng.', english: 'Hello, my name is Li Ming' },
  },
];

export function resolveScionTargetLanguagePair({ courseName = '', lesson = {} } = {}) {
  if (!/\b(?:mandarin|chinese)\b/i.test(String(courseName))) return null;
  const identity = [lesson?.title, lesson?.topics, ...(lesson?.reviewAnchors || [])].filter(Boolean).join(' ');
  const match = BEGINNER_MANDARIN_PAIRS.find((entry) => entry.match.test(identity));
  return match ? { ...match.pair } : null;
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
