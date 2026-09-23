// v0.20.08: quiz questions written from the teacher's material.
//
// Scion writes one question per call (small prompt, fits the 8k context of
// the in-browser model). Every question is checked before it is kept:
//   - it is valid JSON with the fields its type needs;
//   - it is in the course language;
//   - it contains no pipeline words ("admitted evidence", "Record C" ...);
//   - it is grounded: its quote or its numbers come from the material;
//   - it does not repeat an earlier question.
// A question that fails twice is replaced by a deterministic question built
// directly from the material (fill in a line, compare two statements, compute
// a value). Those never mention the pipeline and always contain the material.

import { hasLearnerFacingJargon } from './learnerFacingText.js';
import { normalizeMaterialText, materialNumbers } from './suppliedMaterial.js';
import {
  CAUSAL_TOPIC_RE,
  attributionProblem,
  dialogueSpeakers,
  sourceRecords,
  changeItems,
  conflictingFigureItems,
  confoundItems,
  keyedText,
  reasoningProblem,
  selectionProblem,
  sourceFigureItems,
} from './materialQuestionChecks.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const CJK_RE = /[㐀-鿿]/g;
const EN_STOPWORDS = new Set(
  'that this with from have were they their there these those which what when where while would could should about into over under upon your yours ours mine been being than then them also only just very such more most some many much each other'.split(
    ' ',
  ),
);

const COPY = {
  en: {
    complete: (title) => `Complete the line from ${title ? `“${title}”` : 'the material'}:`,
    completeFact: 'Fill in the blank using the material:',
    explainLine: (line) =>
      `In your own words, explain what the line “${line}” tells the reader. Quote at least one word from the line in your answer.`,
    explainLineAnswer: (line) =>
      `A complete answer quotes from “${line}” and explains its meaning in context, not just a paraphrase of the words.`,
    compareFacts: (a, b) =>
      `Compare these two statements from the material: “${a}” and “${b}”. What do they agree on, and where do they differ?`,
    compareFactsAnswer:
      'A complete answer names one point both statements share and one specific difference, quoting each.',
    limitFacts: (a) =>
      `The material says: “${a}”. What does this statement show, and what can it not prove on its own?`,
    limitFactsAnswer:
      'A complete answer restates what the statement records and names one conclusion it does not support without more evidence.',
    translate: (line, target) => `Translate into ${target}: “${line}”`,
    translateAnswer: 'Check that the meaning of every part of the line is kept.',
    solve: (line, numeric) =>
      numeric
        ? `Using only the given information — “${line}” — work out the quantity this lesson focuses on. Show each step and state the units.`
        : `Using only the given information — “${line}” — solve the problem this lesson sets. Show each step.`,
    solveAnswer: (line) => `The working must use the given information from “${line}”.`,
    explainValues: (line) => `Explain what each given value means in this situation: “${line}”.`,
    explainValuesAnswer: 'A complete answer names every given value and what it describes, with its unit.',
    mean: (values) => `Find the mean of ${values}.`,
    median: (values) => `Find the median of ${values}.`,
    range: (values) => `Find the range of ${values}.`,
    variance: (values) => `Find the (population) variance of ${values}.`,
    sampleVariance: (values) => `Find the sample variance of ${values} (divide by n − 1).`,
    mode: (values) => `Find the mode of ${values}.`,
    statLabel: {
      mode: 'mode',
      mean: 'mean',
      median: 'median',
      range: 'range',
      variance: 'population variance',
      sampleVariance: 'sample variance',
    },
    squares: 'sum of squared deviations',
    blankAnswer: (answer, line) => `${answer} — from “${line}”.`,
    reviewNote: 'Write the worked answer before class; the material does not fix a single correct wording.',
  },
  zh: {
    complete: (title) => `根据${title ? `《${title}》` : '材料'}补全句子：`,
    completeFact: '根据材料填空：',
    explainLine: (line) => `用自己的话说一说“${line}”这句写了什么，回答中至少引用这句中的一个词。`,
    explainLineAnswer: (line) => `完整的回答要引用“${line}”中的词语，并结合上下文说明它的意思，而不只是复述字面。`,
    compareFacts: (a, b) => `比较材料中的两句话：“${a}”和“${b}”。它们在哪一点上一致？又在哪里不同？`,
    compareFactsAnswer: '完整的回答要说出两句话的一个共同点和一个具体不同点，并分别引用原文。',
    limitFacts: (a) => `材料写道：“${a}”。这句话能说明什么？仅凭这句话又不能证明什么？`,
    limitFactsAnswer: '完整的回答要说明这句话记录了什么，并指出一个没有更多证据就不能得出的结论。',
    translate: (line, target) => `把这句话翻译成${target}：“${line}”`,
    translateAnswer: '检查译文是否保留了原句每一部分的意思。',
    solve: (line, numeric) =>
      numeric
        ? `只使用给出的条件“${line}”，求出本节课关注的量。写出每一步，并注明单位。`
        : `只使用给出的条件“${line}”，完成本节课的问题。写出每一步。`,
    solveAnswer: (line) => `解题过程必须使用“${line}”中给出的条件。`,
    explainValues: (line) => `说明“${line}”中每个已知量在情境中表示什么。`,
    explainValuesAnswer: '完整的回答要说出每个已知量及其含义，并带上单位。',
    mean: (values) => `求数据 ${values} 的平均数。`,
    median: (values) => `求数据 ${values} 的中位数。`,
    range: (values) => `求数据 ${values} 的极差。`,
    variance: (values) => `求数据 ${values} 的方差（总体方差）。`,
    sampleVariance: (values) => `求数据 ${values} 的样本方差（除以 n − 1）。`,
    mode: (values) => `求数据 ${values} 的众数。`,
    statLabel: {
      mean: '平均数',
      median: '中位数',
      range: '极差',
      variance: '总体方差',
      sampleVariance: '样本方差',
      mode: '众数',
    },
    squares: '离差平方和',
    blankAnswer: (answer, line) => `${answer}（原文：“${line}”）`,
    reviewNote: '课前请写好参考答案；材料本身不能确定唯一的标准表述。',
  },
};

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripEdgePunctuation(value) {
  return clean(value).replace(/^[，。；：、,.;:!?！？\s]+|[，。；：、,.;:!?！？\s]+$/gu, '');
}

function cjkShare(text) {
  const source = String(text || '').replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (!source) return 0;
  return (source.match(CJK_RE) || []).length / source.length;
}

export function isInLanguage(text, language) {
  const share = cjkShare(text);
  return language === 'zh' ? share >= 0.3 : share <= 0.2;
}

function similarity(a, b) {
  const tokens = (value) =>
    new Set(
      normalizeMaterialText(value)
        .split(/\s+|(?=[一-鿿])/u)
        .filter(Boolean),
    );
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

// ─── Deterministic questions ──────────────────────────────────────────────

const STANDALONE_NUMBER_RE = /(?<![A-Za-z\d.,])\d{1,4}(?:[.,]\d+)?(?![A-Za-z\d]|[.,]\d)/g;

function stripEdgePunctuationKeepMarks(value) {
  return clean(value).replace(/^[，。；：、,.;:\s]+|[，。；：、,.;:\s]+$/gu, '');
}

// Words a line can hide for a fill-in-the-blank question, best first. Numbers
// win (dates, counts, measured values) unless they sit inside a formula (O2).
function blankCandidates(line, language, limit = 1) {
  const text = stripEdgePunctuationKeepMarks(line);
  const numbers = [...new Set(text.match(STANDALONE_NUMBER_RE) || [])];
  if (numbers.length) {
    const ranked = [...numbers].sort((a, b) => Number(/^\d{4}$/.test(b)) - Number(/^\d{4}$/.test(a)));
    return ranked.slice(0, limit).map((answer) => ({ answer, kind: 'number' }));
  }
  if (language === 'zh' || cjkShare(text) > 0.5) {
    const chars = text.replace(/[^\u4e00-\u9fff]/gu, '');
    if (chars.length < 3) return [];
    // A five-character poem line hides its last character; longer lines hide
    // the last two.
    const size = chars.length <= 7 ? 1 : 2;
    return [{ answer: chars.slice(-size), kind: 'zh' }];
  }
  const words = text.match(/[\p{L}'’]+/gu) || [];
  const candidates = words.filter((word) => word.length >= 4 && !EN_STOPWORDS.has(word.toLowerCase()));
  return candidates.length ? [{ answer: candidates.at(-1), kind: 'word' }] : [];
}

function blankLine(line, answer) {
  const text = stripEdgePunctuationKeepMarks(line);
  const pattern = /^\d/.test(answer)
    ? new RegExp(`(?<![A-Za-z\\d.,])${answer.replace(/[.,]/g, '\\$&')}(?![A-Za-z\\d])`)
    : null;
  const match = pattern ? pattern.exec(text) : null;
  const index = match ? match.index : text.lastIndexOf(answer);
  if (index < 0) return null;
  return `${text.slice(0, index)}____${text.slice(index + answer.length)}`;
}

function distractorPool(material, kind, exclude, language) {
  const pool = new Set();
  const lines = material.blocks.flatMap((block) => block.lines);
  // Same-slot words from other lines first (the end of each poem line, the
  // year in each record), then other words from the material.
  for (const line of lines)
    for (const candidate of blankCandidates(line, language, 3))
      if (candidate.kind === kind && candidate.answer !== exclude && candidate.answer.length === exclude.length)
        pool.add(candidate.answer);
  for (const line of lines) {
    if (kind === 'number') for (const n of line.match(STANDALONE_NUMBER_RE) || []) if (n !== exclude) pool.add(n);
    if (kind === 'word')
      for (const word of line.match(/[\p{L}'’]{4,}/gu) || [])
        if (word !== exclude && !EN_STOPWORDS.has(word.toLowerCase())) pool.add(word);
    if (kind === 'zh') {
      const chars = stripEdgePunctuation(line).replace(/[^\u4e00-\u9fff]/gu, '');
      for (let i = 0; i + exclude.length <= chars.length; i += exclude.length) {
        const piece = chars.slice(i, i + exclude.length);
        if (piece !== exclude) pool.add(piece);
      }
    }
  }
  if (kind === 'number' && /^\d+$/.test(exclude)) {
    const value = Number(exclude);
    for (const delta of [1, 2, 10, -1, -2]) if (value + delta > 0) pool.add(String(value + delta));
  }
  return [...pool];
}

function seededOrder(seed, count) {
  // Deterministic placement of the correct letter so answers are not all "A".
  return (((seed * 7 + 3) % count) + count) % count;
}

function clozeItem(material, line, block, index, language, candidate) {
  const copy = COPY[language];
  if (!candidate) return null;
  const blanked = blankLine(line, candidate.answer);
  if (!blanked) return null;
  const lead = block.kind === 'passage' || block.kind === 'dialogue' ? copy.complete(block.title) : copy.completeFact;
  const pool = distractorPool(material, candidate.kind, candidate.answer, language).slice(0, 3);
  const quote = stripEdgePunctuationKeepMarks(line);
  if (pool.length === 3) {
    const correctIndex = seededOrder(index, 4);
    const choices = [...pool];
    choices.splice(correctIndex, 0, candidate.answer);
    return {
      type: 'multiple_choice',
      bloomsLevel: 'Remember',
      question: `${lead}${lead.endsWith(':') ? ' ' : ''}“${blanked}”`,
      options: choices.map((choice, k) => `${LETTERS[k]}. ${choice}`),
      answer: LETTERS[correctIndex],
      explanation: copy.blankAnswer(candidate.answer, quote),
      materialQuote: quote,
    };
  }
  return {
    type: 'short_answer',
    bloomsLevel: 'Remember',
    question: `${lead}${lead.endsWith(':') ? ' ' : ''}“${blanked}”`,
    answer: copy.blankAnswer(candidate.answer, quote),
    materialQuote: quote,
  };
}

function numberList(line) {
  const values = (line.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  return values.length >= 3 && /^[\d\s,，、.;；-]+$/.test(stripEdgePunctuation(line)) ? values : null;
}

// A single-gene cross written as "Aa × Aa" has exact answers (Punnett square).
function geneticsCrossItems(line, language) {
  const match = String(line).match(/\b([A-Za-z])([A-Za-z])\s*[×xX*]\s*([A-Za-z])([A-Za-z])\b/u);
  if (!match) return [];
  const [, a1, a2, b1, b2] = match;
  const letter = a1.toUpperCase();
  if (![a1, a2, b1, b2].every((allele) => allele.toUpperCase() === letter)) return [];
  const counts = {};
  for (const x of [a1, a2])
    for (const y of [b1, b2]) {
      const genotype = [x, y]
        .sort((p, q) => (p === p.toUpperCase() ? -1 : 1) - (q === q.toUpperCase() ? -1 : 1))
        .join('');
      counts[genotype] = (counts[genotype] || 0) + 1;
    }
  const dominant = letter;
  const recessive = letter.toLowerCase();
  const order = [`${dominant}${dominant}`, `${dominant}${recessive}`, `${recessive}${recessive}`].filter(
    (g) => counts[g],
  );
  const genotypeRatio = `${order.join(' : ')} = ${order.map((g) => counts[g]).join(' : ')}`;
  const dominantCount = order.filter((g) => g.includes(dominant)).reduce((sum, g) => sum + counts[g], 0);
  const recessiveCount = counts[`${recessive}${recessive}`] || 0;
  const cross = match[0];
  const zh = language === 'zh';
  const phenotypeRatio = zh
    ? `显性 : 隐性 = ${dominantCount} : ${recessiveCount}（显性占 ${dominantCount}/4）`
    : `dominant : recessive = ${dominantCount} : ${recessiveCount} (${dominantCount}/4 dominant)`;
  const recessiveShare = recessiveCount === 0 ? '0' : `${recessiveCount}/4`;
  return [
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh
        ? `画出 ${cross} 的棋盘格（Punnett 方格），写出子代的基因型及比例。`
        : `Draw the Punnett square for ${cross} and give the offspring genotype ratio.`,
      answer: genotypeRatio,
      explanation: zh
        ? `配子 ${a1}/${a2} 与 ${b1}/${b2} 两两组合，共 4 种等可能结果。`
        : `Gametes ${a1}/${a2} and ${b1}/${b2} combine in 4 equally likely ways.`,
      materialQuote: cross,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh
        ? `${cross} 杂交，${dominant} 为显性。子代的表现型比例是多少？`
        : `In ${cross}, ${dominant} is dominant. What is the offspring phenotype ratio?`,
      answer: phenotypeRatio,
      explanation: zh
        ? `含 ${dominant} 的基因型都表现显性性状。`
        : `Every genotype with ${dominant} shows the dominant trait.`,
      materialQuote: cross,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh
        ? `${cross} 杂交，子代表现为隐性性状的概率是多少？`
        : `In ${cross}, what is the probability that an offspring shows the recessive trait?`,
      answer: recessiveShare,
      explanation: zh
        ? `只有 ${recessive}${recessive} 表现隐性，占 4 种组合中的 ${recessiveCount} 种。`
        : `Only ${recessive}${recessive} shows the recessive trait: ${recessiveCount} of 4 combinations.`,
      materialQuote: cross,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Understand',
      question: zh
        ? `两个亲本都表现显性性状，为什么 ${cross} 的子代中仍会出现隐性性状？`
        : `Both parents in ${cross} show the dominant trait. Why can some offspring show the recessive trait?`,
      answer: zh
        ? `两个亲本都携带隐性基因 ${recessive}，各有 1/2 的概率把 ${recessive} 传给子代；子代同时得到两个 ${recessive}（${recessive}${recessive}）时表现隐性性状。`
        : `Both parents carry the recessive allele ${recessive}; each passes it on with probability 1/2, and an offspring that receives two (${recessive}${recessive}) shows the recessive trait.`,
      materialQuote: cross,
    },
  ];
}

// Uniform acceleration from rest: "starts from rest and accelerates at 3 m/s^2 for 4 s".
function kinematicsItems(line, language) {
  const text = String(line);
  if (!/from rest|静止|由静止/i.test(text)) return [];
  const acceleration = text.match(/(\d+(?:\.\d+)?)\s*m\/s(?:\^?2|²)/i);
  const time = text.match(/(\d+(?:\.\d+)?)\s*(?:s|seconds?|秒)(?![\p{L}/])/iu);
  if (!acceleration || !time) return [];
  const a = Number(acceleration[1]);
  const t = Number(time[1]);
  const v = a * t;
  const d = 0.5 * a * t * t;
  const zh = language === 'zh';
  return [
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh
        ? `物体由静止开始以 ${a} m/s² 匀加速运动 ${t} s，末速度是多少？`
        : `An object starts from rest and accelerates at ${a} m/s² for ${t} s. What is its final speed?`,
      answer: `${formatNumber(v)} m/s`,
      explanation: `v = at = ${a} × ${t} = ${formatNumber(v)} m/s`,
      materialQuote: line,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh
        ? `同一物体在这 ${t} s 内通过的位移是多少？`
        : `How far does the same object travel in those ${t} s?`,
      answer: `${formatNumber(d)} m`,
      explanation: `d = ½at² = 0.5 × ${a} × ${t}² = ${formatNumber(d)} m`,
      materialQuote: line,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh ? `这 ${t} s 内的平均速度是多少？` : `What is its average speed over those ${t} s?`,
      answer: `${formatNumber(d / t)} m/s`,
      explanation: zh
        ? `平均速度 = 位移 ÷ 时间 = ${formatNumber(d)} ÷ ${t} = ${formatNumber(d / t)} m/s（由静止匀加速时等于末速度的一半）`
        : `average speed = distance ÷ time = ${formatNumber(d)} ÷ ${t} = ${formatNumber(d / t)} m/s (half the final speed, because it starts from rest)`,
      materialQuote: line,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Analyze',
      question: zh
        ? `前一半时间（${formatNumber(t / 2)} s）内它通过多少位移？为什么不是总位移的一半？`
        : `How far does it travel in the first half of the time (${formatNumber(t / 2)} s), and why is that not half of the total distance?`,
      answer: zh
        ? `${formatNumber(d / 4)} m，只有总位移的四分之一，因为速度一直在增大。`
        : `${formatNumber(d / 4)} m — only a quarter of the total, because the object keeps speeding up.`,
      explanation: `d = ½ × ${a} × ${formatNumber(t / 2)}² = ${formatNumber(d / 4)} m`,
      materialQuote: line,
    },
  ];
}

function parseSide(side) {
  return side
    .split('+')
    .map((term) => term.trim().match(/^(\d*)\s*([A-Z][A-Za-z0-9()]*)$/))
    .filter(Boolean)
    .map((m) => ({ coefficient: Number(m[1] || 1), formula: m[2] }));
}

// Limiting reagent: "2H2 + O2 -> 2H2O with 4 mol H2 and 3 mol O2".
function stoichiometryItems(line, language) {
  const equation = String(line).match(
    /([0-9A-Za-z()+\s]+?)\s*(?:->|→|=)\s*([0-9A-Za-z()+\s]+?)(?=\s+(?:with|and|using|,|，|;|；)|$)/u,
  );
  if (!equation) return [];
  const reactants = parseSide(equation[1]);
  const products = parseSide(equation[2]);
  if (reactants.length !== 2 || products.length < 1) return [];
  const amounts = reactants.map(({ formula }) => {
    const found = String(line).match(
      new RegExp(`(\\d+(?:\\.\\d+)?)\\s*mol\\s+${formula.replace(/[()]/g, '\\$&')}(?![A-Za-z0-9])`),
    );
    return found ? Number(found[1]) : null;
  });
  if (amounts.some((amount) => amount == null)) return [];
  const ratios = reactants.map((reactant, i) => amounts[i] / reactant.coefficient);
  const limitingIndex = ratios[0] <= ratios[1] ? 0 : 1;
  const limiting = reactants[limitingIndex];
  const excess = reactants[1 - limitingIndex];
  const extent = ratios[limitingIndex];
  const product = products[0];
  const productMol = extent * product.coefficient;
  const leftover = amounts[1 - limitingIndex] - extent * excess.coefficient;
  const zh = language === 'zh';
  const given = `${amounts[0]} mol ${reactants[0].formula}, ${amounts[1]} mol ${reactants[1].formula}`;
  return [
    {
      type: 'multiple_choice',
      bloomsLevel: 'Apply',
      question: zh
        ? `对于 ${equation[1].trim()} → ${equation[2].trim()}，已知 ${given}，哪种反应物是限量试剂？`
        : `For ${equation[1].trim()} → ${equation[2].trim()} with ${given}, which reactant is the limiting reagent?`,
      options: [
        `A. ${reactants[0].formula}`,
        `B. ${reactants[1].formula}`,
        zh ? 'C. 两者同时耗尽' : 'C. Both run out together',
        zh ? 'D. 无法判断' : 'D. It cannot be determined',
      ],
      answer: limitingIndex === 0 ? 'A' : 'B',
      explanation: `${reactants.map((r, i) => `${amounts[i]} ÷ ${r.coefficient} = ${formatNumber(ratios[i])}`).join('; ')}. ${
        zh
          ? `${limiting.formula} 是限量试剂：${amounts[limitingIndex]} mol ${limiting.formula} 只需要 ${formatNumber(extent * excess.coefficient)} mol ${excess.formula}。`
          : `${limiting.formula} is the limiting reagent: ${amounts[limitingIndex]} mol ${limiting.formula} needs only ${formatNumber(extent * excess.coefficient)} mol ${excess.formula}.`
      }`,
      materialQuote: line,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh
        ? `最多能生成多少 mol ${product.formula}？`
        : `What is the maximum amount of ${product.formula} that can form, in mol?`,
      answer: `${formatNumber(productMol)} mol ${product.formula}`,
      explanation: `${amounts[limitingIndex]} mol ${limiting.formula} × ${product.coefficient}/${limiting.coefficient} = ${formatNumber(productMol)} mol`,
      materialQuote: line,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh ? `反应结束后剩余多少 mol ${excess.formula}？` : `How much ${excess.formula} is left over, in mol?`,
      answer: `${formatNumber(leftover)} mol ${excess.formula}`,
      explanation: `${amounts[1 - limitingIndex]} − ${formatNumber(extent)} × ${excess.coefficient} = ${formatNumber(leftover)} mol`,
      materialQuote: line,
    },
    {
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question: zh
        ? `要让 ${amounts[limitingIndex]} mol ${limiting.formula} 完全反应，需要多少 mol ${excess.formula}？`
        : `How many mol of ${excess.formula} are needed to react with all ${amounts[limitingIndex]} mol of ${limiting.formula}?`,
      answer: `${formatNumber(extent * excess.coefficient)} mol ${excess.formula}`,
      explanation: `${amounts[limitingIndex]} mol ${limiting.formula} × ${excess.coefficient}/${limiting.coefficient} = ${formatNumber(extent * excess.coefficient)} mol ${excess.formula}`,
      materialQuote: line,
    },
  ];
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function statisticsItems(line, language, topicText) {
  const values = numberList(line);
  if (!values) return [];
  const copy = COPY[language];
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const list = stripEdgePunctuation(line);
  const wants = (en, zh) => new RegExp(`${en}|${zh}`, 'i').test(topicText);
  const items = [];
  const add = (question, answer, working, label) =>
    items.push({
      type: 'short_answer',
      bloomsLevel: 'Apply',
      question,
      // "平均数 = 6" reads as an answer key; a bare "6" does not.
      answer: label ? `${label} = ${formatNumber(answer)}` : formatNumber(answer),
      explanation: working,
      materialQuote: list,
    });
  const squares = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const squaresWorking = `${copy.squares} = ${values.map((value) => `(${value} − ${formatNumber(mean)})²`).join(' + ')} = ${formatNumber(squares)}`;
  const joined = values.join(' + ');
  const specific = wants('mean|average|median|variance|spread|standard deviation|range', '平均|中位|方差|标准差|极差');
  if (!specific) {
    add(copy.mean(list), mean, `(${joined}) ÷ ${values.length} = ${formatNumber(mean)}`, copy.statLabel.mean);
    add(copy.median(list), median, `${sorted.join(', ')} → ${formatNumber(median)}`, copy.statLabel.median);
    add(
      copy.range(list),
      sorted.at(-1) - sorted[0],
      `${sorted.at(-1)} − ${sorted[0]} = ${formatNumber(sorted.at(-1) - sorted[0])}`,
      copy.statLabel.range,
    );
    modeItem();
    return items;
  }
  if (wants('mean|average', '平均'))
    add(copy.mean(list), mean, `(${joined}) ÷ ${values.length} = ${formatNumber(mean)}`, copy.statLabel.mean);
  if (wants('median', '中位'))
    add(copy.median(list), median, `${sorted.join(', ')} → ${formatNumber(median)}`, copy.statLabel.median);
  if (wants('variance|spread|standard deviation', '方差|标准差')) {
    add(
      copy.variance(list),
      variance,
      `${squaresWorking}; ${formatNumber(squares)} ÷ ${values.length} = ${formatNumber(variance)}`,
      copy.statLabel.variance,
    );
    const sampleVariance = squares / (values.length - 1);
    add(
      copy.sampleVariance(list),
      sampleVariance,
      `${squaresWorking}; ${formatNumber(squares)} ÷ ${values.length - 1} = ${formatNumber(sampleVariance)}`,
      copy.statLabel.sampleVariance,
    );
  }
  // The mode, when exactly one value repeats most often.
  const modeItem = () => {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    const top = Math.max(...counts.values());
    const modes = [...counts].filter(([, n]) => n === top).map(([value]) => value);
    if (top < 2 || modes.length !== 1) return;
    add(copy.mode(list), modes[0], `${modes[0]} appears ${top} times`, copy.statLabel.mode);
  };
  const rangeItem = () =>
    add(
      copy.range(list),
      sorted.at(-1) - sorted[0],
      `${sorted.at(-1)} − ${sorted[0]} = ${formatNumber(sorted.at(-1) - sorted[0])}`,
      copy.statLabel.range,
    );
  if (wants('range|spread', '极差')) rangeItem();
  // The range is always a fair extra question on a data set.
  if (items.length && !wants('range|spread', '极差')) rangeItem();
  modeItem();
  return items;
}

function openItems(material, block, language) {
  const copy = COPY[language];
  const lines = block.lines.map(stripEdgePunctuationKeepMarks).filter(Boolean);
  const items = [];
  if (block.kind === 'passage') {
    // Spread the questions over the whole text: opening, middle and close.
    const spread = (list) =>
      list.length <= 3 ? list : [...new Set([list[0], list[Math.floor((list.length - 1) / 2)], list.at(-1)])];
    const chosen = language === 'zh' && lines.length >= 2 ? [`${lines[0]}，${lines[1]}`, lines.at(-1)] : spread(lines);
    for (const line of chosen.slice(0, 3))
      items.push({
        type: 'short_answer',
        bloomsLevel: 'Understand',
        question: copy.explainLine(line),
        answer: copy.explainLineAnswer(line),
        materialQuote: line,
        reviewNote: copy.reviewNote,
      });
  } else if (block.kind === 'facts') {
    if (lines.length >= 2)
      items.push({
        type: 'short_answer',
        bloomsLevel: 'Analyze',
        question: copy.compareFacts(lines[0], lines[1]),
        answer: copy.compareFactsAnswer,
        materialQuote: lines[0],
        reviewNote: copy.reviewNote,
      });
    for (const line of lines.slice(0, 2))
      items.push({
        type: 'short_answer',
        bloomsLevel: 'Evaluate',
        question: copy.limitFacts(line),
        answer: copy.limitFactsAnswer,
        materialQuote: line,
        reviewNote: copy.reviewNote,
      });
  } else if (block.kind === 'dialogue') {
    const target = language === 'zh' ? '中文' : 'English';
    for (const line of lines.slice(0, 3))
      items.push({
        type: 'short_answer',
        bloomsLevel: 'Understand',
        question: copy.translate(line, target),
        answer: copy.translateAnswer,
        materialQuote: line,
        reviewNote: copy.reviewNote,
      });
  } else if (block.kind === 'data') {
    for (const line of lines.slice(0, 2)) {
      if (numberList(line)) continue;
      const numeric = (line.match(STANDALONE_NUMBER_RE) || []).length > 0;
      items.push({
        type: 'short_answer',
        bloomsLevel: 'Apply',
        question: copy.solve(line, numeric),
        answer: copy.solveAnswer(line),
        materialQuote: line,
        reviewNote: copy.reviewNote,
      });
      if (numeric && (line.match(STANDALONE_NUMBER_RE) || []).length >= 2)
        items.push({
          type: 'short_answer',
          bloomsLevel: 'Understand',
          question: copy.explainValues(line),
          answer: copy.explainValuesAnswer,
          materialQuote: line,
          reviewNote: copy.reviewNote,
        });
    }
  }
  return items;
}

/**
 * Questions built directly from the material, without a model. Every one
 * quotes the material; open questions carry a review note for the teacher.
 */
export function buildMaterialFallbackItems(material, { count = 4, topicText = '' } = {}) {
  if (!material?.blocks?.length) return [];
  const language = material.language === 'zh' ? 'zh' : 'en';
  // Exact questions built from the whole material (who gave which figure,
  // percentage change and revenue) come before per-line calculations.
  const computed = [
    ...sourceFigureItems(material),
    ...conflictingFigureItems(material),
    ...confoundItems(material, topicText),
    ...changeItems(material),
  ];
  const closed = [];
  const open = [];
  let index = 0;
  for (const block of material.blocks) {
    for (const line of block.lines)
      computed.push(
        ...statisticsItems(line, language, `${topicText} ${material.text}`),
        ...geneticsCrossItems(line, language),
        ...kinematicsItems(line, language),
        ...stoichiometryItems(line, language),
      );
    // A fill-in-the-blank only makes sense for words or numbers students read;
    // "A 为显____" in a data line tests nothing.
    if (
      block.kind !== 'data' ||
      block.lines.some((line) => (line.match(STANDALONE_NUMBER_RE) || []).length && !numberList(line))
    )
      for (const line of block.lines)
        for (const candidate of blankCandidates(line, language, block.kind === 'data' ? 2 : 1)) {
          const item = clozeItem(material, line, block, index, language, candidate);
          if (item) {
            closed.push(item);
            index += 1;
          }
        }
    open.push(...openItems(material, block, language));
  }
  // Exact computed answers lead; then recall and reasoning alternate so a
  // short quiz still asks for both. A generic "solve it" prompt is dropped
  // once the problem already has computed questions.
  // Recall questions alternate between the start and the end of the text so
  // a four-question quiz does not only cover the first two lines.
  const spreadClosed = [];
  for (let low = 0, high = closed.length - 1; low <= high; low += 1, high -= 1) {
    spreadClosed.push(closed[low]);
    if (high !== low) spreadClosed.push(closed[high]);
  }
  closed.splice(0, closed.length, ...spreadClosed);
  const ordered = [...computed.map((item) => ({ ...item, computed: true }))];
  const reasoning = computed.length ? open.filter((item) => item.bloomsLevel !== 'Apply') : open;
  while (ordered.length < count && (closed.length || reasoning.length)) {
    if (reasoning.length && (ordered.length % 2 === 1 || !closed.length)) ordered.push(reasoning.shift());
    else if (closed.length) ordered.push(closed.shift());
  }
  const seen = [];
  return ordered
    .filter((item) => {
      const key = `${item.question}|${item.answer}`;
      if (seen.some((prior) => prior === key || similarity(prior, key) > 0.95)) return false;
      seen.push(key);
      return true;
    })
    .slice(0, count)
    .map((item) => ({ ...item, source: 'material-fallback' }));
}

// ─── Scion-written questions ──────────────────────────────────────────────

const FOCUS = {
  passage: {
    en: [
      'the meaning of one image or word choice in a quoted line',
      'the feeling or tone of the speaker, supported by a quoted line',
      'a contrast or change between two lines, and what it shows',
      'what the whole passage suggests, supported by two quoted lines',
      'what one specific line says (recall of the exact words)',
    ],
    zh: [
      '某一句的原文（记忆）',
      '某个意象或用词的含义',
      '诗人/作者的情感，并引用原句说明',
      '两句之间的对比或变化',
      '整段文字表达的主旨，并引用两句说明',
    ],
  },
  dialogue: {
    en: [
      'the English meaning of one line of the dialogue (the answer is the translation)',
      'how a verb in the dialogue changes for a different person (for example "I" versus "you")',
      'choosing the correct reply to a line',
      'what one named speaker says about themselves (check which speaker said it)',
      'completing a line with the correct word',
    ],
    zh: [
      '对话中某一句的意思',
      '对话中用到的语法形式（指出句子）',
      '选择正确的回答',
      '某个说话人介绍了自己什么',
      '用正确的词补全一句',
    ],
  },
  facts: {
    en: [
      'why two of the accounts might disagree (who made each one, when, and for what purpose)',
      'which account was made closest to the event, and why that matters',
      'what the material cannot prove on its own, and what further evidence would help',
      'the order of events or the time between them',
      'a specific date, number or name stated in the material',
    ],
    zh: [
      '材料中的具体日期、数字或名称',
      '事件的先后顺序或相隔时间',
      '哪一条记录更可靠，为什么',
      '仅凭材料不能证明什么',
      '两条记录为什么可能不一致',
    ],
  },
  // Science and statistics briefs about cause and effect ("did the tablets
  // raise scores?") need causal reasoning, not source reliability.
  causal: {
    en: [
      'another event in the material that could explain the change',
      'what changed, and by how much, according to the material',
      'whether the material proves the cause (and why not)',
      'how to design a fair test or comparison group to check the cause',
      'what extra data would separate the two explanations',
    ],
    zh: [
      '材料中什么发生了变化，变化了多少',
      '材料中还有哪件事也可能造成这个变化',
      '材料能否证明因果关系，为什么',
      '如何设计对照组或公平的比较来检验原因',
      '还需要哪些数据才能区分两种解释',
    ],
  },
  data: {
    en: [
      'computing one value from the given numbers (give the numeric answer)',
      'a second calculation that uses the first result',
      'what the result means in context',
      'a common mistake when working with these values',
      'predicting what changes if one given value changes',
    ],
    zh: [
      '用给出的数据计算一个值（给出数值答案）',
      '在第一步结果上再算一步',
      '结果在情境中的含义',
      '处理这些数据时的常见错误',
      '如果某个数据改变，结果会怎样变化',
    ],
  },
};

function materialForPrompt(material) {
  return material.blocks
    .map((block) => `${block.title ? `${block.title}\n` : ''}${block.lines.join('\n')}`)
    .join('\n\n');
}

// The same material restated as "who said what", so a small model keeps each
// statement with its own speaker or source.
function whoSaidWhat(material) {
  const speakers = dialogueSpeakers(material);
  if (speakers)
    return `Who says what:\n${speakers.map((speaker) => speaker.lines.map((line) => `- ${speaker.name}: ${line}`).join('\n')).join('\n')}`;
  const records = sourceRecords(material);
  if (records.length >= 2)
    return `Who says what:\n${records.map((record) => `- ${record.source} ${record.verb}: ${record.claim}`).join('\n')}`;
  return '';
}

export function buildMaterialItemPrompt({
  material,
  lessonTitle = '',
  courseTitle = '',
  index = 0,
  total = 4,
  type = 'multiple_choice',
  previous = [],
  retryReason = '',
  avoidCalculations = false,
  topicText = '',
  requireReasoning = false,
}) {
  const language = material?.language === 'zh' ? 'zh' : 'en';
  const kind = material?.blocks?.[0]?.kind || 'facts';
  const causal = CAUSAL_TOPIC_RE.test(`${topicText} ${lessonTitle} ${courseTitle}`);
  const focus = (causal ? FOCUS.causal : FOCUS[kind])?.[language] || FOCUS.facts[language];
  const shape =
    type === 'multiple_choice'
      ? '{"question":"...","options":["...","...","...","..."],"answer":"A|B|C|D","explanation":"...","quote":"exact words copied from the material"}'
      : '{"question":"...","answer":"a full-sentence model answer (never a letter)","explanation":"...","quote":"exact words copied from the material"}';
  const hasMaterial = Boolean(material?.blocks?.length);
  const lines = [
    `Write question ${index + 1} of ${total} for the lesson "${lessonTitle}"${courseTitle ? ` in the course "${courseTitle}"` : ''}.`,
    hasMaterial ? 'Use ONLY this material from the teacher:' : '',
    hasMaterial ? `<<<\n${materialForPrompt(material)}\n>>>` : '',
    language === 'en' && hasMaterial ? whoSaidWhat(material) : '',
    `Question type: ${type === 'multiple_choice' ? 'multiple choice with 4 options and one correct answer' : 'short answer (no options; students write a sentence)'}.`,
    `Focus: ${focus[index % focus.length]}.`,
    'Ask about the content itself (words, facts, numbers, meaning). Never ask about "evidence", "records", "sources" or "claims" in general.',
    hasMaterial ? 'The correct answer must follow from the material. Put the exact words it relies on in "quote".' : '',
    language === 'zh'
      ? 'Write the question, options, answer and explanation in Simplified Chinese. Keep quoted material exactly as written.'
      : 'Write in English. Keep quoted material exactly as written (including any other language).',
    avoidCalculations
      ? 'The calculations are already covered. Ask a conceptual question (meaning, reasoning, a common mistake) whose answer needs no new number.'
      : '',
    language === 'en' && requireReasoning
      ? 'This question must need reasoning (why, how, what it shows, what would change). A student must not be able to answer by copying one phrase or number from the material.'
      : '',
    language === 'en'
      ? 'Keep every statement with the person or source who made it. Judge reliability by who made an account, when and why, never by how large its number is.'
      : '',
    previous.length ? `Do not repeat these questions:\n${previous.map((q) => `- ${q}`).join('\n')}` : '',
    retryReason ? `Your last answer was rejected: ${retryReason}. Fix that.` : '',
    `Return only JSON: ${shape}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export const MATERIAL_ITEM_SYSTEM_PROMPT =
  'You are an experienced teacher writing one clear, classroom-ready quiz question. Reply with one JSON object only.';

export function parseMaterialItemReply(text) {
  const source = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Small models sometimes return options as {"A": "...", ...} or one string.
export function optionList(value) {
  if (Array.isArray(value))
    return value.map((entry) => (typeof entry === 'string' ? entry : String(entry?.text ?? entry ?? '')));
  if (value && typeof value === 'object') return Object.values(value).map((entry) => String(entry ?? ''));
  if (typeof value === 'string')
    return value
      .split(/\n+|(?=\b[B-D][.)．、:：]\s)/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
  return [];
}

function normalizeOption(option) {
  return clean(option).replace(/^[A-D][.)．、:：]\s*/u, '');
}

function groundedIn(material, item) {
  if (!material?.blocks?.length) return true;
  const body = normalizeMaterialText(material.text);
  const quote = normalizeMaterialText(item.quote);
  if (quote && quote.length >= 2 && body.includes(quote)) return true;
  const numbers = materialNumbers(material);
  // The explanation often carries the quoted line ("Marie says 'Je m'appelle Marie'").
  const said = `${item.question} ${item.answer} ${item.explanation || ''} ${optionList(item.options).join(' ')}`;
  if (numbers.some((number) => said.includes(number))) return true;
  // A question that reproduces a stretch of the material is grounded too.
  const saidNormal = normalizeMaterialText(said);
  if (material.language === 'zh') {
    const chars = body.replace(/[^一-鿿]/gu, '');
    for (let i = 0; i + 4 <= chars.length; i += 1) if (saidNormal.includes(chars.slice(i, i + 4))) return true;
    return false;
  }
  const words = body.split(' ');
  for (let i = 0; i + 3 <= words.length; i += 1) if (saidNormal.includes(words.slice(i, i + 3).join(' '))) return true;
  return false;
}

/**
 * Check one model reply. Returns {item} when it can be used, or {reason}.
 */
// Numbers a keyed answer may state without a check: the ones in the material.
// When the app has already computed the calculations exactly, Scion writes the
// conceptual questions and any newly calculated number it keys is rejected —
// the live test caught it keying "2 mol H2O" for a reaction that yields 4 mol.
export function verifiedAnswerNumbers(material) {
  const numbers = new Set();
  for (const line of material?.blocks?.flatMap((block) => block.lines) || [])
    for (const n of line.match(STANDALONE_NUMBER_RE) || []) numbers.add(n.replace(/,/g, ''));
  return numbers;
}

function unverifiedNumbers(text, verified) {
  return (String(text || '').match(/(?<![A-Za-z\d.])\d+(?:[.,]\d+)?(?![A-Za-z\d])/g) || [])
    .map((n) => n.replace(/,/g, ''))
    .filter((n) => !verified.has(n));
}

export function validateMaterialItem(raw, options) {
  const result = validateMaterialItemShape(raw, options);
  if (!result.item || options.language === 'zh') return result;
  // v0.20.09: who-said-what and reasoning checks (English material).
  const wrongSource = attributionProblem(result.item, options.material);
  if (wrongSource) return { reason: wrongSource };
  const reasoning = reasoningProblem(result.item, {
    material: options.material,
    causalTopic: Boolean(options.causalTopic),
  });
  if (reasoning) return { reason: reasoning };
  return result;
}

function validateMaterialItemShape(
  raw,
  { material, type, previous = [], previousAnswers = [], language, verifiedNumbers = null, hasComputed = false },
) {
  if (!raw) return { reason: 'the reply was not valid JSON' };
  const question = clean(raw.question);
  const explanation = clean(raw.explanation);
  const quote = clean(raw.quote);
  if (question.length < 8) return { reason: 'the question was empty or too short' };
  if (!isInLanguage(question, language))
    return { reason: language === 'zh' ? 'the question was not in Chinese' : 'the question was not in English' };
  const learnerText = [question, explanation, raw.answer, ...optionList(raw.options)].join(' ');
  if (hasLearnerFacingJargon(learnerText))
    return { reason: 'it used internal words such as "record" or "admitted evidence"' };
  if (previous.some((prior) => similarity(prior, question) > 0.6)) return { reason: 'it repeated an earlier question' };
  // Two differently worded questions with the same answer test the same thing.
  const keyedText = clean(raw.answer);
  if (keyedText.length > 12 && previousAnswers.some((prior) => similarity(prior, keyedText) > 0.6))
    return { reason: 'it asked for the same answer as an earlier question' };
  if (!groundedIn(material, { ...raw, question })) return { reason: 'the answer did not come from the material' };
  if (type === 'multiple_choice') {
    const options = optionList(raw.options).map(normalizeOption).filter(Boolean);
    if (options.length !== 4 || new Set(options.map((o) => o.toLowerCase())).size !== 4)
      return { reason: 'it needs exactly 4 different options' };
    let letter = clean(raw.answer)
      .toUpperCase()
      .match(/^[A-D]\b/)?.[0];
    if (!letter) {
      const byText = options.findIndex((option) => normalizeMaterialText(option) === normalizeMaterialText(raw.answer));
      letter = byText >= 0 ? LETTERS[byText] : null;
    }
    if (!letter) return { reason: 'the answer must be one of the letters A-D' };
    const keyed = options[LETTERS.indexOf(letter)];
    // "12 March 1850" vs "The year 1850": when the options are bare values,
    // two that share the key's number could both be right. Longer options
    // (whole statements about the 1937 diary) may share a year legitimately.
    const keyIndex = LETTERS.indexOf(letter);
    const keyedNumbers = keyed.match(STANDALONE_NUMBER_RE) || [];
    if (
      keyedNumbers.length &&
      keyed.length <= 24 &&
      options.some((option, k) => k !== keyIndex && option.length <= 24 && keyedNumbers.some((n) => option.includes(n)))
    )
      return { reason: 'two options could both be correct' };
    const numberCheck = checkKeyedNumbers(keyed, { verifiedNumbers, hasComputed });
    if (numberCheck.reason) return numberCheck;
    return {
      item: {
        type,
        bloomsLevel: 'Understand',
        question,
        options: options.map((option, k) => `${LETTERS[k]}. ${option}`),
        answer: letter,
        explanation: explanation || '',
        materialQuote: quote,
        source: 'scion-material-item',
        ...(numberCheck.reviewNote ? { reviewNote: numberCheck.reviewNote } : {}),
      },
    };
  }
  const answer = clean(raw.answer);
  // A short answer keyed as "c" or "B" is a multiple-choice reflex, not a key.
  if (answer.replace(/[\s\p{P}]/gu, '').length < 2 || /^[A-Da-d][.)]?$/.test(answer))
    return { reason: 'the answer was empty or only a letter' };
  if (answer.length > 6 && !/\d/.test(answer) && !isInLanguage(answer, language))
    return { reason: language === 'zh' ? 'the answer was not in Chinese' : 'the answer was not in English' };
  const numberCheck = checkKeyedNumbers(answer, { verifiedNumbers, hasComputed });
  if (numberCheck.reason) return numberCheck;
  return {
    item: {
      type,
      bloomsLevel: 'Apply',
      question,
      answer,
      explanation: explanation && explanation !== answer ? explanation : '',
      materialQuote: quote,
      source: 'scion-material-item',
      ...(numberCheck.reviewNote ? { reviewNote: numberCheck.reviewNote } : {}),
    },
  };
}

function checkKeyedNumbers(keyed, { verifiedNumbers, hasComputed }) {
  if (!verifiedNumbers) return {};
  const unknown = unverifiedNumbers(keyed, verifiedNumbers);
  if (unknown.length === 0) return {};
  // Calculations are covered by the exactly computed questions.
  if (hasComputed) return { reason: `the keyed answer ${unknown.join(', ')} is a calculation the app did not verify` };
  return { reviewNote: 'Check this answer: Scion calculated it and the app could not verify the number.' };
}

const keyedAnswerText = keyedText;

/** Planned type for each slot: mostly multiple choice, ending with a short answer. */
export function plannedItemTypes(count) {
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 && count > 1 ? 'short_answer' : index % 3 === 2 ? 'short_answer' : 'multiple_choice',
  );
}

/**
 * Write the questions for one lesson. `callModel(system, prompt)` returns the
 * raw text. Failures fall back per question; nothing here throws except an
 * abort, which the caller must see.
 */
export async function authorMaterialItems({
  material,
  lessonTitle,
  courseTitle,
  count = 4,
  callModel,
  maxCalls = count * 2,
  onItem,
  isAborted = () => false,
  topicText = '',
}) {
  const language = material?.language === 'zh' ? 'zh' : 'en';
  const fallback = material?.blocks?.length
    ? buildMaterialFallbackItems(material, {
        count: count + 4,
        topicText: `${courseTitle} ${lessonTitle} ${topicText}`,
      })
    : [];
  const computedItems = fallback.filter((item) => item.computed);
  const verifiedNumbers = material?.blocks?.length ? verifiedAnswerNumbers(material) : null;
  const causalTopic = CAUSAL_TOPIC_RE.test(`${topicText} ${lessonTitle} ${courseTitle}`);
  // One look-up question per short quiz; the rest must need reasoning.
  const maxLookups = count <= 4 ? 1 : 2;
  // Exactly computed questions are never re-asked of the model.
  const items = computedItems.slice(0, count);
  items.forEach((item, index) => onItem?.(item, index));
  const types = plannedItemTypes(count);
  const rejections = [];
  let calls = 0;
  for (let index = items.length; index < count; index += 1) {
    const type = types[index];
    let accepted = null;
    let retryReason = '';
    for (let attempt = 0; attempt < 2 && typeof callModel === 'function' && calls < maxCalls; attempt += 1) {
      if (isAborted()) return { items, rejections, calls };
      calls += 1;
      let reply = '';
      try {
        reply = await callModel(
          MATERIAL_ITEM_SYSTEM_PROMPT,
          buildMaterialItemPrompt({
            material,
            lessonTitle,
            courseTitle,
            index,
            total: count,
            type,
            previous: items.map((item) => item.question),
            retryReason,
            avoidCalculations: computedItems.length > 0,
            topicText,
            requireReasoning: index > 0,
          }),
        );
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        rejections.push({ index, reason: `model call failed: ${error?.message || error}` });
        break;
      }
      let result;
      try {
        result = validateMaterialItem(parseMaterialItemReply(reply), {
          material,
          type,
          previous: items.map((item) => item.question),
          previousAnswers: items.filter((item) => item.type !== 'multiple_choice').map((item) => String(item.answer)),
          language,
          verifiedNumbers,
          hasComputed: computedItems.length > 0,
          causalTopic,
        });
        const choice =
          result.item && language === 'en' ? selectionProblem(result.item, items, material, { maxLookups }) : '';
        if (choice) result = { reason: choice };
      } catch (error) {
        // One malformed draft must never stop the rest of the quiz.
        result = { reason: `the reply could not be read (${error?.message || error})` };
      }
      if (result.item) {
        accepted = result.item;
        break;
      }
      retryReason = result.reason;
      rejections.push({ index, reason: result.reason, reply: String(reply).slice(0, 400) });
    }
    if (!accepted) {
      const keyedSoFar = items.map(keyedAnswerText).join(' ');
      const fresh = (item) =>
        !items.includes(item) &&
        !items.some((prior) => similarity(prior.question, item.question) > 0.6) &&
        // Do not ask again for an answer an earlier question already keys.
        !(item.type === 'multiple_choice' && keyedSoFar.includes(keyedAnswerText(item)));
      accepted =
        fallback.find((item) => fresh(item) && !selectionProblem(item, items, material, { maxLookups })) ||
        fallback.find(fresh);
      if (accepted) fallback.splice(fallback.indexOf(accepted), 1);
    }
    if (accepted) {
      items.push(accepted);
      onItem?.(accepted, index);
    }
  }
  return { items, rejections, calls };
}
