// v0.20.09: checks that catch the answer-key errors a small model makes on
// English material, plus exact questions the app can build itself.
//
// Found in live English tests (v0.20.08):
//   - a line or place given to the wrong speaker ("What does Marie say about
//     where she lives? → J'habite à Lyon" — Paul lives in Lyon);
//   - a figure given to the wrong source ("According to the owners'
//     newspaper … → 1,200", the union's count);
//   - "more reliable because it reports a larger number";
//   - "the 8-point rise proves the tablets caused it";
//   - several questions on the same fact, or four look-up questions and no
//     reasoning.
// Everything here is deterministic and works on the material as written.

import { normalizeMaterialText } from './suppliedMaterial.js';

const STOPWORDS = new Set(
  'that this with from have were they their there these those which what when where while would could should about into over under upon your yours been being than then them also only just very such more most some many much each other after before during same does said says according material text line lines question answer'.split(
    ' ',
  ),
);
const NUMBER_RE = /(?<![A-Za-z\d.,])\d{1,3}(?:,\d{3})+(?:\.\d+)?|(?<![A-Za-z\d.,])\d+(?:\.\d+)?(?![A-Za-z\d])/g;

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function numbersIn(text) {
  return [...new Set((String(text || '').match(NUMBER_RE) || []).map((n) => n.replace(/,/g, '')))];
}

function wordTokens(text, min = 4) {
  return new Set(
    (normalizeMaterialText(text).match(/[\p{L}']+/gu) || [])
      .map((word) => word.replace(/'s$/, ''))
      .filter((word) => word.length >= min && !STOPWORDS.has(word)),
  );
}

export function keyedText(item) {
  if (item?.type !== 'multiple_choice') return clean(item?.answer);
  const option = (item.options || []).find((entry) => String(entry).startsWith(`${item.answer}.`));
  return option ? clean(option.slice(3)) : '';
}

// ─── Who said what ────────────────────────────────────────────────────────

const SELF_NAME_RE =
  /\b(?:je m'appelle|je suis|me llamo|soy|my name is|i am|i'm|ich heiße|ich bin|mi chiamo|sono|chamo-me|eu sou)\s+([\p{L}-]+)/giu;

// The introduction phrase may start the sentence ("Me llamo Luis"); the name
// itself must be capitalised, so "Soy de España" names nobody.
function selfName(line) {
  for (const match of String(line).matchAll(SELF_NAME_RE)) if (/^\p{Lu}/u.test(match[1])) return match[1];
  return null;
}

/**
 * Speakers of a two-person dialogue: turns alternate, and each speaker is
 * named by their own introduction ("Je m'appelle Marie"). Returns null when
 * the names cannot be read.
 */
export function dialogueSpeakers(material) {
  const block = material?.blocks?.find((entry) => entry.kind === 'dialogue');
  if (!block || block.lines.length < 2) return null;
  const names = [null, null];
  block.lines.forEach((line, index) => {
    const name = selfName(line);
    if (name && !names[index % 2]) names[index % 2] = name;
  });
  if (!names[0] || !names[1] || names[0] === names[1]) return null;
  const turns = [[], []];
  block.lines.forEach((line, index) => turns[index % 2].push(line));
  const nameSet = new Set(names.map((name) => name.toLowerCase()));
  const tokensOf = (lines) =>
    new Set([...wordTokens(lines.join(' '), 3), ...numbersIn(lines.join(' '))].filter((token) => !nameSet.has(token)));
  const own = turns.map(tokensOf);
  return names.map((name, index) => ({
    name,
    lines: turns[index],
    // Words only this speaker says (places, details), not shared phrases.
    unique: new Set([...own[index]].filter((token) => !own[1 - index].has(token))),
  }));
}

const REPORT_VERB_RE =
  /\b(reported|reports|says|said|states|stated|lists|listed|records|recorded|describes|described|wrote|writes|claims|claimed|estimates|estimated|shows|showed|counted|counts|puts|gives|notes|noted)\b/i;

/** "A city newspaper reported … 3,000" → { source, claim, sourceWords, claimNumbers }. */
export function sourceRecords(material) {
  const lines = (material?.blocks || []).filter((block) => block.kind === 'facts').flatMap((block) => block.lines);
  const parsed = lines
    .map((line) => {
      const match = line.match(REPORT_VERB_RE);
      if (!match || match.index < 3) return null;
      const source = clean(line.slice(0, match.index)).replace(/^(?:a|an|the)\s+/i, '');
      const claim = clean(line.slice(match.index + match[0].length)).replace(/^that\s+/i, '');
      // A year inside a claim ("joined the 1912 strike") dates it; the figure
      // is the other number.
      const numbers = numbersIn(claim);
      const figures = numbers.filter((n) => !/^(?:1[5-9]|20)\d\d$/.test(n));
      return { line, source, verb: match[0], claim, claimNumbers: figures.length ? figures : numbers };
    })
    .filter(Boolean);
  if (parsed.length < 2) return [];
  const allSourceWords = parsed.map((record) => wordTokens(record.source, 4));
  return parsed.map((record, index) => ({
    ...record,
    // Words that name this source and no other ("memoir", "police").
    sourceWords: new Set(
      [...allSourceWords[index]].filter((word) => allSourceWords.every((other, k) => k === index || !other.has(word))),
    ),
  }));
}

function mentioned(tokens, text) {
  const words = wordTokens(text, 3);
  const numbers = new Set(numbersIn(text));
  return [...tokens].some((token) => words.has(token) || numbers.has(token));
}

/**
 * The reason a question attributes something to the wrong speaker or source,
 * or '' when it is consistent. Only the question and its keyed answer are
 * read; distractors are meant to be wrong.
 */
export function attributionProblem(item, material) {
  const text = `${clean(item?.question)} ${keyedText(item)}`;
  const speakers = dialogueSpeakers(material);
  if (speakers) {
    // "If Ana says, “Soy de México,” …": a quote put in a named speaker's mouth.
    for (const self of speakers) {
      const other = speakers.find((speaker) => speaker !== self);
      const quoted = new RegExp(
        `\\b${self.name}\\s+(?:says|said|asks|asked|replies|replied|answers|answered)[,:]?\\s*["“']([^"”]+)["”]`,
        'gi',
      );
      for (const match of text.matchAll(quoted))
        if (mentioned(other.unique, match[1]) && !mentioned(self.unique, match[1]))
          return `it gave ${other.name}'s words to ${self.name}`;
    }
    const named = speakers.filter((speaker) => new RegExp(`\\b${speaker.name}\\b`, 'i').test(text));
    if (named.length === 1) {
      const self = named[0];
      const other = speakers.find((speaker) => speaker !== self);
      if (mentioned(other.unique, text) && !mentioned(self.unique, text))
        return `it gave ${other.name}'s words to ${self.name}`;
    }
  }
  const records = sourceRecords(material);
  if (records.length >= 2) {
    const named = records.filter((record) => record.sourceWords.size && mentioned(record.sourceWords, text));
    if (named.length === 1) {
      const own = new Set(named[0].claimNumbers);
      const said = numbersIn(text);
      const borrowed = records
        .filter((record) => record !== named[0])
        .flatMap((record) => record.claimNumbers)
        .filter((number) => said.includes(number) && !own.has(number));
      if (borrowed.length) return `it gave another source's figure (${borrowed[0]}) to the ${named[0].source}`;
    }
  }
  return '';
}

// ─── Reasoning errors ─────────────────────────────────────────────────────

const RELIABLE_BY_SIZE_RE =
  /\bmore (?:reliable|accurate|trustworthy|believable)\b[^.]{0,160}\b(?:because|since|as)\b[^.]{0,80}\b(?:larger|higher|bigger|greater|more (?:people|workers|marchers|strikers))\b/i;
const CAUSAL_PROOF_RE = /\b(?:proves?|proven|is the cause|caused|causes|shows? that [^.]{0,60}\bcaus)/i;
const NEGATION_RE = /\b(?:not|cannot|can't|doesn't|does not|no|without|unless|only if|may|might|could)\b/i;

export const CAUSAL_TOPIC_RE =
  /\b(?:caus(?:e|al|ation)|confound\w*|experiment\w*|control group|correlat\w*|fair test)\b|因果|混杂|对照|实验|相关/i;

// Shared words over all words: long answers about the same material share
// many words (fluoride, clinics) without testing the same point.
function jaccard(a, b) {
  const left = wordTokens(a, 3);
  const right = wordTokens(b, 3);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function tokenOverlap(a, b) {
  const left = wordTokens(a, 3);
  const right = wordTokens(b, 3);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

export function reasoningProblem(item, { material, causalTopic = false } = {}) {
  const question = clean(item?.question);
  const answer = keyedText(item);
  const explanation = clean(item?.explanation);
  const said = `${answer} ${explanation}`;
  if (RELIABLE_BY_SIZE_RE.test(said)) return 'it judged reliability by the size of the number';
  if (causalTopic && item?.type !== 'multiple_choice' && CAUSAL_PROOF_RE.test(answer) && !NEGATION_RE.test(answer))
    return 'it treated a correlation as proof of the cause';
  if (item?.type !== 'multiple_choice' && answer.length > 20 && tokenOverlap(question, answer) > 0.85)
    return 'the question gave away its own answer';
  const same = String(material?.text || '').match(/\bthe same (\w+)/i);
  if (same && new RegExp(`\\b(?:two|second|another|different) ${same[1]}s?\\b`, 'i').test(`${question} ${answer}`))
    return `it treated the same ${same[1]} as two`;
  return '';
}

// ─── Look-up questions and repeats ────────────────────────────────────────

const REASONING_ASK_RE =
  /\b(?:why|explain|how (?:does|do|did|might|could|would)|compare|contrast|suggest|imply|mean|meaning|reliable|conclude|prove|evidence|affect|effect|predict|what would|what if|infer|tone|feeling|purpose|translate)\b/i;

/** A question a student can answer by finding one phrase or number in the material. */
export function isLookupItem(item, material) {
  if (item?.computed) return false;
  if (REASONING_ASK_RE.test(item?.question || '')) return false;
  const keyed = normalizeMaterialText(keyedText(item));
  if (!keyed) return false;
  const body = normalizeMaterialText(material?.text || '');
  if (body.includes(keyed)) return true;
  const words = [...wordTokens(keyed, 3)];
  const numbers = numbersIn(keyed);
  const bodyWords = wordTokens(body, 3);
  const found = words.filter((word) => bodyWords.has(word)).length + numbers.filter((n) => body.includes(n)).length;
  return (
    words.length + numbers.length > 0 && found / (words.length + numbers.length) >= 0.75 && keyed.split(' ').length <= 8
  );
}

/** Two questions whose keyed answers are about the same thing. */
export function testsSamePoint(a, b) {
  // Exact questions are built to ask different things (speed vs distance),
  // even when two answers happen to share a number.
  if (a?.computed && b?.computed) return false;
  // "How does the contrast between the pedestal and the landscape…" twice.
  if (jaccard(a?.question, b?.question) >= 0.6) return true;
  const ka = keyedText(a);
  const kb = keyedText(b);
  if (!ka || !kb) return false;
  const na = numbersIn(ka);
  const nb = numbersIn(kb);
  // Two look-ups of the same figure ("20%" three times).
  if (na.length && na.length === nb.length && na.every((n) => nb.includes(n)) && (ka.length < 60 || kb.length < 60))
    return true;
  return jaccard(ka, kb) >= 0.6;
}

/** The problem with adding `item` to `chosen`, or ''. */
export function selectionProblem(item, chosen, material, { maxLookups = 1 } = {}) {
  if (chosen.some((prior) => testsSamePoint(prior, item))) return 'it tested the same point as an earlier question';
  if (isLookupItem(item, material) && chosen.filter((prior) => isLookupItem(prior, material)).length >= maxLookups)
    return 'it was another look-up question; ask one that needs reasoning';
  return '';
}

// ─── Exact questions the app can build ────────────────────────────────────

const LETTERS = ['A', 'B', 'C', 'D'];

function formatNumber(value) {
  return Number.isInteger(value) ? value.toLocaleString('en-US') : String(Number(value.toFixed(2)));
}

/** "Which pairing of source and figure is correct?" for two or three sourced figures. */
export function sourceFigureItems(material) {
  if (material?.language === 'zh') return [];
  const records = sourceRecords(material).filter((record) => record.claimNumbers.length === 1);
  if (records.length < 2 || records.length > 3) return [];
  const figures = records.map((record) => record.claimNumbers[0]);
  if (new Set(figures).size !== figures.length) return [];
  const label = (record) => record.source.replace(/\s+(?:published|dated|written|for)\b.*$/i, '');
  const pairing = (order) =>
    records.map((record, index) => `${label(record)}: ${formatNumber(Number(figures[order[index]]))}`).join('; ');
  const orders =
    records.length === 3
      ? [
          [0, 1, 2],
          [1, 2, 0],
          [2, 0, 1],
          [1, 0, 2],
        ]
      : [
          [0, 1],
          [1, 0],
        ];
  const choices = orders.map(pairing);
  if (records.length === 2) choices.push('Both give the same figure', 'The material does not give figures');
  const correct = choices[0];
  const position = records.length % 4;
  const shuffled = choices.slice(1);
  shuffled.splice(position, 0, correct);
  return [
    {
      type: 'multiple_choice',
      bloomsLevel: 'Remember',
      question: 'Which pairing of each account with the figure it gives is correct?',
      options: shuffled.slice(0, 4).map((choice, k) => `${LETTERS[k]}. ${choice}`),
      answer: LETTERS[shuffled.indexOf(correct)],
      explanation: records.map((record) => record.line).join(' '),
      materialQuote: records[0].line,
      computed: true,
    },
  ];
}

/**
 * When sources disagree on a figure, the reason is who made each account
 * and why — a small model tends to say "the larger number is more reliable".
 * This question carries a correct model answer for any such pair.
 */
export function conflictingFigureItems(material) {
  if (material?.language === 'zh') return [];
  const records = sourceRecords(material).filter((record) => record.claimNumbers.length >= 1);
  const figures = new Set(records.map((record) => record.claimNumbers[0]));
  if (records.length < 2 || figures.size < 2) return [];
  const [first, second] = records;
  const name = (record) => `the ${record.source.replace(/\s+(?:published|dated|written|for)\b.*$/i, '')}`;
  return [
    {
      type: 'short_answer',
      bloomsLevel: 'Evaluate',
      question: `Why might ${name(first)} and ${name(second)} give different figures, and what would you need before deciding which is closer to the truth?`,
      answer: `Each account was made by someone with a different position, purpose or distance from the event, and that can shape the figure they give; a bigger or smaller number is not more reliable in itself. You would need an independent count or other evidence made at the time to check them against.`,
      explanation: records.map((record) => record.line).join(' '),
      materialQuote: `${first.line} ${second.line}`,
      computed: true,
    },
  ];
}

/**
 * A cause-and-effect lesson whose material gives an outcome and a second
 * change at the same time: the core question has one correct answer.
 */
export function confoundItems(material, topicText = '') {
  if (material?.language === 'zh' || !CAUSAL_TOPIC_RE.test(topicText)) return [];
  const lines = (material?.blocks || []).filter((block) => block.kind === 'facts').flatMap((block) => block.lines);
  if (lines.length !== 2) return [];
  return [
    {
      type: 'short_answer',
      bloomsLevel: 'Evaluate',
      question: `The material says: “${lines[0]}” It also says: “${lines[1]}” Can we conclude that the first change caused the result? Explain, and describe a fairer comparison.`,
      answer:
        'Not from this material alone. The second change happened at the same time and could also explain the result, so the two cannot be separated. A fairer comparison would look at similar groups that differ in only one of the two changes.',
      explanation: `${lines[0]} ${lines[1]}`,
      materialQuote: lines[1],
      computed: true,
    },
  ];
}

const FROM_TO_RE =
  /((?:[\p{L}'$-]+\s+){0,6})from\s+(\$?)(\d+(?:,\d{3})*(?:\.\d+)?)\s+to\s+(\$?)(\d+(?:,\d{3})*(?:\.\d+)?)(\s+[a-z]+)?/giu;

/** Percentage changes (and revenue) for "from A to B" data. */
export function changeItems(material) {
  if (material?.language === 'zh') return [];
  const text = (material?.blocks || [])
    .filter((block) => block.kind === 'data' || block.kind === 'facts')
    .flatMap((block) => block.lines)
    .join(' ');
  const pairs = [...text.matchAll(FROM_TO_RE)].map((match) => ({
    money: Boolean(match[2] || match[4]),
    from: Number(match[3].replace(/,/g, '')),
    to: Number(match[5].replace(/,/g, '')),
    // "weekly sales fell from 200 to 150 sandwiches"
    phrase: clean(match[0])
      .replace(/^(?:and|but|then|so|use|using|this|data)\s+/gi, '')
      .replace(/[,.;:]+$/, ''),
  }));
  const usable = pairs.filter((pair) => pair.from > 0 && pair.from !== pair.to);
  if (!usable.length) return [];
  const items = usable.slice(0, 2).map((pair) => {
    const change = ((pair.to - pair.from) / pair.from) * 100;
    const direction = change > 0 ? 'increase' : 'decrease';
    const shown = (value) => (pair.money ? `$${formatNumber(value)}` : formatNumber(value));
    return {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: `The material says: “${pair.phrase}”. What is the percentage change? Show your working.`,
      answer: `a ${formatNumber(Math.abs(change))}% ${direction}`,
      explanation: `(${shown(pair.to)} − ${shown(pair.from)}) ÷ ${shown(pair.from)} × 100 = ${formatNumber(change)}%`,
      materialQuote: pair.phrase,
      computed: true,
    };
  });
  const price = usable.find((pair) => pair.money);
  const quantity = usable.find((pair) => !pair.money);
  if (price && quantity) {
    const before = price.from * quantity.from;
    const after = price.to * quantity.to;
    items.push({
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: 'How did total revenue (price × quantity sold) change?',
      answer: `Revenue ${after > before ? 'rose' : after < before ? 'fell' : 'stayed'} from $${formatNumber(before)} to $${formatNumber(after)}.`,
      explanation: `$${formatNumber(price.from)} × ${formatNumber(quantity.from)} = $${formatNumber(before)}; $${formatNumber(price.to)} × ${formatNumber(quantity.to)} = $${formatNumber(after)}`,
      materialQuote: `${price.phrase}; ${quantity.phrase}`,
      computed: true,
    });
  }
  return items;
}
