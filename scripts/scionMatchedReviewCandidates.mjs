#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parseSavedCourseGraph } from '../src/lib/quality/quizContrast.js';
import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';
import { normalizeScionMcItem } from '../src/lib/scionAnswerKeyAlignment.js';

const DEFAULT_MANIFEST = 'evaluation/scion-contrast-matrix.json';
const DEFAULT_OUTPUT = 'evaluation/scion-review-candidates.jsonl';
const DEFAULT_REPORT = 'verification-output/scion-review-candidates';
const TITLE_STOP_WORDS = new Set(['and', 'course', 'final', 'for', 'lesson', 'methods', 'the', 'with']);

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function text(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(value) {
  return new Set(
    text(value)
      .toLowerCase()
      .replace(/^lesson\s*\d+\s*[:.\-–—]?\s*/i, '')
      .match(/[a-z]{3,}/g)
      ?.filter((token) => !TITLE_STOP_WORDS.has(token)) || [],
  );
}

function overlapScore(left, right) {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (const token of a) if (b.has(token)) matches += 1;
  return matches / Math.min(a.size, b.size);
}

function lessonRows(graph) {
  const content = graph?.enrichmentOverlay?.lessonContent || {};
  return (Array.isArray(graph?.sessions) ? graph.sessions : []).map((session, index) => {
    const number = Number(session?.number);
    const lessonId = `lesson-${Number.isInteger(number) && number > 0 ? number : index + 1}`;
    return { lessonId, title: text(session?.title || `Lesson ${index + 1}`), content: content[lessonId] || {} };
  });
}

function matchLessons(leftRows, rightRows) {
  const available = new Set(rightRows.map((_, index) => index));
  const matches = [];
  for (const left of leftRows) {
    let bestIndex = -1;
    let bestScore = 0;
    for (const index of available) {
      const score = overlapScore(left.title, rightRows[index].title);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0 || bestScore < 0.5) continue;
    available.delete(bestIndex);
    matches.push({ left, right: rightRows[bestIndex], titleMatch: Number(bestScore.toFixed(3)) });
  }
  return matches;
}

function compactMc(item) {
  const normalized = normalizeScionMcItem(item);
  return {
    q: normalized.question,
    op: normalized.options,
    ai: normalized.answerIndex,
    ex: normalized.explanation,
  };
}

function compactKeyTerm(term = {}) {
  return {
    tr: text(term.tr || term.term),
    df: text(term.df || term.definition),
    eg: text(term.eg || term.example),
    mi: text(term.mi || term.misconception),
    cx: text(term.cx || term.correction),
  };
}

function cleanMcItems(content = {}) {
  return (Array.isArray(content.quizItems) ? content.quizItems : [])
    .filter((item) => item?.type === 'multiple_choice' || Array.isArray(item?.op) || Array.isArray(item?.options))
    .map(compactMc)
    .filter((item) => assessScionMcItem(item).eligible);
}

function cleanKeyTerms(content = {}) {
  return (Array.isArray(content.keyTerms) ? content.keyTerms : [])
    .map(compactKeyTerm)
    .filter((term) => assessScionKeyTerm(term).eligible);
}

function promptFor({ domain, kind, leftTitle, rightTitle }) {
  const focus = leftTitle === rightTitle ? leftTitle : `${leftTitle} / ${rightTitle}`;
  if (kind === 'mc-item') {
    return `Course domain: ${domain}. Lesson focus: ${focus}. Write ONE factually correct, evidence-bearing multiple-choice item as JSON with q, op (exactly four options), ai, and ex.`;
  }
  return `Course domain: ${domain}. Lesson focus: ${focus}. Write ONE factually correct key term as JSON with tr, df, eg, mi, and cx.`;
}

function addPairs(rows, seen, { pair, match, kind, leftItems, rightItems }) {
  const count = Math.min(leftItems.length, rightItems.length);
  for (let index = 0; index < count; index += 1) {
    const left = leftItems[index];
    const right = rightItems[index];
    if (JSON.stringify(left) === JSON.stringify(right)) continue;
    const row = {
      schemaVersion: 1,
      kind,
      prompt: promptFor({
        domain: pair.domain,
        kind,
        leftTitle: match.left.title,
        rightTitle: match.right.title,
      }),
      left: JSON.stringify(left),
      right: JSON.stringify(right),
      domain: pair.domain,
      courseId: pair.domain,
      lessonId: match.left.lessonId,
      pairSource: {
        pairId: pair.id,
        leftRoute: pair.candidateRoute,
        leftModel: pair.candidateModel,
        rightModel: pair.referenceModel,
        leftLessonId: match.left.lessonId,
        rightLessonId: match.right.lessonId,
        titleMatch: match.titleMatch,
      },
    };
    const id = hash(JSON.stringify({ kind, prompt: row.prompt, left: row.left, right: row.right }));
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(row);
  }
}

export function buildMatchedReviewCandidates(pairs = []) {
  const rows = [];
  const seen = new Set();
  const pairReports = [];
  for (const pair of pairs) {
    const leftGraph = parseSavedCourseGraph(pair.candidateProject);
    const rightGraph = parseSavedCourseGraph(pair.referenceProject);
    const matches = matchLessons(lessonRows(leftGraph), lessonRows(rightGraph));
    const before = rows.length;
    for (const match of matches) {
      addPairs(rows, seen, {
        pair,
        match,
        kind: 'mc-item',
        leftItems: cleanMcItems(match.left.content),
        rightItems: cleanMcItems(match.right.content),
      });
      addPairs(rows, seen, {
        pair,
        match,
        kind: 'key-term',
        leftItems: cleanKeyTerms(match.left.content),
        rightItems: cleanKeyTerms(match.right.content),
      });
    }
    pairReports.push({
      id: pair.id,
      domain: pair.domain,
      matchedLessons: matches.length,
      candidates: rows.length - before,
    });
  }
  const domains = [...new Set(rows.map((row) => row.domain))].sort();
  return {
    rows,
    summary: {
      pairs: pairs.length,
      candidates: rows.length,
      domains,
      domainCount: domains.length,
      kinds: Object.fromEntries(
        ['mc-item', 'key-term'].map((kind) => [kind, rows.filter((row) => row.kind === kind).length]),
      ),
      pairReports,
      claimBoundary:
        'These are neutral matched candidates for blind review. Candidate/reference identity supplies no preference label.',
    },
  };
}

async function run({ manifestPath = DEFAULT_MANIFEST, output = DEFAULT_OUTPUT, reportDir = DEFAULT_REPORT } = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const pairs = await Promise.all(
    (manifest.pairs || []).map(async (pair) => {
      const [candidateProject, referenceProject] = await Promise.all([
        fs.readFile(pair.candidate, 'utf8').then(JSON.parse),
        fs.readFile(pair.reference, 'utf8').then(JSON.parse),
      ]);
      return { ...pair, candidateProject, referenceProject };
    }),
  );
  const result = buildMatchedReviewCandidates(pairs);
  await Promise.all([fs.mkdir(path.dirname(output), { recursive: true }), fs.mkdir(reportDir, { recursive: true })]);
  await Promise.all([
    fs.writeFile(output, result.rows.map((row) => JSON.stringify(row)).join('\n') + (result.rows.length ? '\n' : '')),
    fs.writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify(result.summary, null, 2)}\n`),
  ]);
  return result;
}

function parseArgs(argv) {
  const args = { manifestPath: DEFAULT_MANIFEST, output: DEFAULT_OUTPUT, reportDir: DEFAULT_REPORT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--manifest') args.manifestPath = argv[++index] || args.manifestPath;
    else if (argv[index] === '--output') args.output = argv[++index] || args.output;
    else if (argv[index] === '--report') args.reportDir = argv[++index] || args.reportDir;
  }
  return args;
}

async function main() {
  const result = await run(parseArgs(process.argv.slice(2)));
  console.log(
    `Scion matched review candidates: ${result.summary.candidates} across ${result.summary.domainCount} domains`,
  );
  for (const pair of result.summary.pairReports) {
    console.log(`${pair.domain}: ${pair.matchedLessons} matched lessons / ${pair.candidates} candidates`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
