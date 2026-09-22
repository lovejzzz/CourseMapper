// v0.20.08: the teacher's own material, read from the brief.
//
// The live quality test (12 briefs, v0.20.07) found that only an English
// "Source facts:" label reached the quiz. Poems, dialogues, data sets,
// equations and Chinese labels (史料事实：, 材料事实：) were dropped, so the
// compiler fell back to content-free templates. This reader keeps anything the
// teacher explicitly gave students to work with, verbatim, in four kinds:
//   passage  - quoted lines or a titled text (《静夜思》：床前明月光…)
//   dialogue - two or more quoted turns after a dialogue cue
//   facts    - labeled statements (Source facts:, 史料事实：…)
//   data     - numbers, formulas or reactions the lesson should use
// It never summarizes and never guesses from unlabeled topic prose.

import { COURSE_SHAPE_LINE_RE } from './courseShape.js';
import { detectBriefLanguage } from './briefLanguage.js';
import { extractInstructorProvidedFacts } from './sourceBriefConstraints.js';

const MAX_BLOCKS = 6;
const MAX_LINES = 16;

const QUOTE_RE = /“([^”]{2,600})”|"([^"]{2,600})"|「([^」]{2,600})」/g;
const DIALOGUE_CUE_RE = /\b(?:dialogue|conversation|exchange)\b|对话|会话/i;
const PASSAGE_CUE_RE =
  /\b(?:lines?|poem|passage|excerpt|quotation|quote|stanza|text|verse|speech|sentence)\s*:?\s*$|(?:原文|诗句|诗|选段|段落|句子)\s*[:：]?\s*$/i;
const ZH_FACT_LABEL_RE = /(史料事实|材料事实|已知事实|事实|史料|材料|已知条件|条件|数据|资料|原文|案例)\s*[:：]\s*/u;
const INSTRUCTION_START_RE =
  /^(?:include|please|create|make|generate|write|produce|build|add|give|provide|students?\s+(?:should|will|must)|请|要求|包括|包含|需要|生成|制作)/i;
const ZH_INSTRUCTION_RE = /请|要求学生|包含每节|包括每节/;
// Phrases that set the course shape or audience, never lesson material.
const SHAPE_PHRASE_RES = [
  /\b\d{1,3}\s+(?:lessons?|sessions?|classes|weeks?|modules?)\b(?:\s+(?:of|lasting)\s+\d{1,3}\s+minutes?)?/gi,
  /\b\d{1,3}\s*-\s*(?:weeks?|lessons?|sessions?|modules?|days?|units?|hours?|hrs?)\b/gi,
  /\b\d{1,3}\s*-?\s*minutes?\b(?:\s+(?:each|per\s+\w+))?/gi,
  /\b(?:quiz|test|exam)\s+(?:with|of)\s+\d{1,2}\s+questions?(?:\s+per\s+\w+)?/gi,
  /\b\d{1,2}\s+questions?\s+per\s+\w+/gi,
  /\b\d{1,2}(?:st|nd|rd|th)\s+(?:graders?|grade|year)\b|\bgrades?\s+\d{1,2}\b|\byear\s+\d{1,2}\b|\bage[sd]?\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?\b/gi,
  /\d{1,3}\s*(?:节课|课时|次课|分钟|道题|讲)/g,
  /[初高]中|[一二三四五六七八九]年级|高[一二三]|初[一二三]/g,
];
const DATA_CUE_RE =
  /^(?:use|using|given|with|suppose|consider|take|let|a\s+|an\s+|the\s+|使用|用|已知|给定|假设|设|数据|某)/i;
const FORMULA_RE =
  /->|→|⇌|×|÷|=|\^|√|[A-Z][a-z]?\d|\b\d+(?:\.\d+)?\s*(?:mol|g|kg|mg|m\/s\^?2?|m\/s|km|cm|mm|m|s|min|h|n|j|w|v|°c|k|%|l|ml|hz|pa)\b/i;
const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeMaterialText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”"'‘’「」『』《》〈〉()（）[\]【】.,;:!?¿¡，。；：！？、…—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripShapeLine(brief) {
  return String(brief || '')
    .replace(/\r\n?/g, '\n')
    .replace(COURSE_SHAPE_LINE_RE, '')
    .trim();
}

function splitPassageLines(text, language) {
  const source = clean(text);
  if (!source) return [];
  const parts =
    language === 'zh' || /[一-鿿]/.test(source)
      ? source.split(/(?<=[，。！？；])/u)
      : source.split(/(?<=[.;!?:])\s+(?=[A-Z¿¡"“])/u);
  return parts.map((part) => clean(part)).filter((part) => part.length >= 2);
}

function splitFacts(text) {
  return clean(text)
    .split(/[；;]|(?<=[。！？])|(?<=[.!?])\s+(?=[A-Z0-9])/u)
    .map((part) => clean(part).replace(/[，,。]$/u, ''))
    .filter((part) => part.length >= 4);
}

function sentenceSegments(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[。！？!?])|(?<=\.)\s+(?=[A-Z])/u))
    .map((part) => clean(part))
    .filter(Boolean);
}

function stripShapePhrases(sentence) {
  return SHAPE_PHRASE_RES.reduce((text, pattern) => text.replace(pattern, ' '), sentence);
}

// Remove the leading "Subject for 10th graders: 1 lesson of 45 minutes on"
// frame so the remaining words are only what students work with.
// "Session 3 must prove …", "Students know algebra", "每节课要…" state what
// the course must do, not material students work with.
const REQUIREMENT_RE =
  /\b(?:must|should|needs? to|has to|will|is required to)\b|\b(?:students|learners)\s+(?:already\s+)?(?:know|have|can)\b|必须|应该|需要|要求/i;

function isDataSentence(sentence) {
  const text = clean(sentence);
  if (!text || INSTRUCTION_START_RE.test(text) || ZH_INSTRUCTION_RE.test(text)) return false;
  if (REQUIREMENT_RE.test(text) && !/^(?:use|using|given|使用|用|已知|给定)/i.test(text)) return false;
  if (text.length > 400) return false;
  const residue = stripShapePhrases(text);
  const numbers = residue.match(NUMBER_RE) || [];
  const formula = FORMULA_RE.test(residue);
  if (numbers.length === 0 && !formula) return false;
  // "主题是平均数" or "on limiting reagents" carries no data by itself.
  return formula || numbers.length >= 2 || DATA_CUE_RE.test(text);
}

function dataPayload(sentence) {
  // Drop the "Use the data" / "使用数据" lead-in but keep the numbers.
  return clean(sentence)
    .replace(/^(?:use|using)\s+(?:the\s+)?(?:data|dataset|numbers|values|reaction|equation|formula)\s*:?\s*/i, '')
    .replace(/^(?:使用|用)(?:数据|数值|方程|公式|反应)?\s*[:：]?\s*/u, '')
    .replace(/[。.]$/, '');
}

function titleBefore(text, index) {
  const before = text.slice(Math.max(0, index - 80), index);
  const zhTitle = before.match(/《([^》]{1,30})》[^《]*$/u);
  if (zhTitle) return zhTitle[1];
  const enTitle = before.match(/(?:of|from|in)\s+([A-Z][\w'’ ]{2,60}?)(?:[.:]|\s*$)/u);
  return enTitle ? clean(enTitle[1]) : '';
}

function pushBlock(blocks, block) {
  if (!block.lines.length || blocks.length >= MAX_BLOCKS) return;
  const key = normalizeMaterialText(block.lines.join(' '));
  if (!key || blocks.some((existing) => normalizeMaterialText(existing.lines.join(' ')).includes(key))) return;
  blocks.push({ ...block, lines: block.lines.slice(0, MAX_LINES) });
}

/**
 * Read the teacher's material from a course brief.
 * @returns {{language: 'zh'|'en', blocks: Array<{kind: string, title: string, lines: string[]}>, text: string}}
 */
export function extractSuppliedMaterial(brief = '') {
  const source = stripShapeLine(brief);
  const language = detectBriefLanguage(source);
  const blocks = [];
  let remainder = source;

  // 1. Quoted text. Consecutive quotes after a dialogue cue are turns; a
  // single quote after "lines:" / "poem:" is a passage split into lines.
  const quotes = [...source.matchAll(QUOTE_RE)].map((match) => ({
    text: clean(match[1] || match[2] || match[3]),
    index: match.index,
    end: match.index + match[0].length,
  }));
  if (quotes.length) {
    const groups = [];
    for (const quote of quotes) {
      const last = groups.at(-1);
      if (last && /^[\s,，、;；]*(?:and|和|与)?[\s,，、;；]*$/i.test(source.slice(last.end, quote.index))) {
        last.quotes.push(quote);
        last.end = quote.end;
      } else groups.push({ quotes: [quote], index: quote.index, end: quote.end });
    }
    for (const group of groups) {
      const lead = source.slice(Math.max(0, group.index - 60), group.index);
      const words = group.quotes.map((quote) => quote.text);
      const substantial = words.join(' ').length >= 12;
      if (!substantial) continue;
      const dialogue = group.quotes.length >= 2 && (DIALOGUE_CUE_RE.test(lead) || group.quotes.length >= 3);
      const cued = PASSAGE_CUE_RE.test(clean(lead)) || DIALOGUE_CUE_RE.test(lead);
      // A short quoted phrase inside a sentence ("the word 'justice'") is not
      // lesson material unless the teacher introduced it as such.
      if (!dialogue && !cued && words.join(' ').length < 40) continue;
      pushBlock(blocks, {
        kind: dialogue ? 'dialogue' : 'passage',
        title: titleBefore(source, group.index),
        lines: dialogue ? words : words.flatMap((text) => splitPassageLines(text, language)),
      });
      remainder = remainder.replace(source.slice(group.index, group.end), ' ');
    }
  }

  // 2. A titled Chinese text: 学习李白《静夜思》：床前明月光，疑是地上霜。…
  for (const match of remainder.matchAll(/《([^》]{1,30})》\s*[:：]\s*([^\n]+)/gu)) {
    const body = match[2].split(/请|要求|包含每|包括每/u)[0];
    const lines = splitPassageLines(body, 'zh');
    if (lines.join('').length >= 8) {
      pushBlock(blocks, { kind: 'passage', title: match[1], lines });
      remainder = remainder.replace(match[0], ' ');
    }
  }

  // 3. Labeled facts, in English (existing contract) and Chinese.
  const englishFacts = extractInstructorProvidedFacts(remainder);
  if (englishFacts.length) {
    pushBlock(blocks, { kind: 'facts', title: '', lines: englishFacts.map((fact) => clean(fact)) });
    const marker = remainder.search(/\b(?:source|instructor[- ]provided|provided|following|these) facts?\s*:/i);
    if (marker >= 0) remainder = remainder.slice(0, marker);
  }
  const zhLabel = remainder.match(ZH_FACT_LABEL_RE);
  if (zhLabel) {
    const start = zhLabel.index + zhLabel[0].length;
    const tail = remainder.slice(start).split(/请|要求学生|包含每|包括每/u)[0];
    const facts = splitFacts(tail);
    if (facts.length) {
      pushBlock(blocks, { kind: /数据/.test(zhLabel[1]) ? 'data' : 'facts', title: '', lines: facts });
      remainder = remainder.slice(0, zhLabel.index) + remainder.slice(start + tail.length);
    }
  }

  // 4. Data: sentences that give students numbers or formulas to work with.
  const dataLines = sentenceSegments(remainder)
    .flatMap((sentence) => {
      // "Chemistry for 10th graders: 1 lesson of 45 minutes on X. Use …" —
      // only the part after the last colon of a framing sentence can be data.
      const parts = sentence.split(/[:：](?=\s*\S)/u);
      return parts.length > 1 && !isDataSentence(parts[0]) ? [parts.slice(1).join(':')] : [sentence];
    })
    .filter(isDataSentence)
    .map(dataPayload)
    .filter((line) => line.length >= 3);
  if (dataLines.length) pushBlock(blocks, { kind: 'data', title: '', lines: dataLines });

  const text = blocks.flatMap((block) => block.lines).join('\n');
  return { language, blocks, text };
}

export function hasSuppliedMaterial(material) {
  return Boolean(material?.blocks?.some((block) => block.lines.length > 0));
}

/** Numbers that appear in the material, as written (used for grounding). */
export function materialNumbers(material) {
  return [...new Set(String(material?.text || '').match(NUMBER_RE) || [])];
}
