#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parseSavedCourseGraph } from '../src/lib/quality/quizContrast.js';
import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';
import { normalizeScionMcItem } from '../src/lib/scionAnswerKeyAlignment.js';
import { canonicalScionCourseInput, deriveScionCourseGroup } from './lib/scionCourseGroup.mjs';

const DEFAULT_MANIFEST = 'evaluation/scion-contrast-matrix.json';
const DEFAULT_OUTPUT = 'evaluation/scion-review-candidates.jsonl';
const DEFAULT_REPORT = 'verification-output/scion-review-candidates';
const TITLE_STOP_WORDS = new Set(['and', 'course', 'final', 'for', 'lesson', 'methods', 'the', 'with']);

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function inspectPairInput(pair) {
  const candidateInput = canonicalScionCourseInput(pair.candidateProject);
  const referenceInput = canonicalScionCourseInput(pair.referenceProject);
  const issues = [];
  if (!candidateInput.promptText.trim() || !referenceInput.promptText.trim()) issues.push('missing-course-input');
  if (JSON.stringify(candidateInput) !== JSON.stringify(referenceInput)) issues.push('course-input-mismatch');
  if (
    (candidateInput.fileNames.length > 0 || referenceInput.fileNames.length > 0) &&
    !/^[a-f0-9]{64}$/.test(String(pair.sourcePacketSha256 || ''))
  ) {
    issues.push('unbound-source-attachments');
  }
  if (candidateInput.fileNames.length > 0 || referenceInput.fileNames.length > 0) {
    const packetDigests = [
      String(pair.sourcePacketSha256 || ''),
      String(candidateInput.sourcePacketSha256 || ''),
      String(referenceInput.sourcePacketSha256 || ''),
    ];
    if (!packetDigests.every((digest) => /^[a-f0-9]{64}$/.test(digest))) {
      issues.push('missing-project-source-packet-digest');
    } else if (new Set(packetDigests).size !== 1) {
      issues.push('source-packet-digest-mismatch');
    }
  }
  return {
    pass: issues.length === 0,
    issues,
    sha256: hash(JSON.stringify(candidateInput)),
    candidateSha256: hash(JSON.stringify(candidateInput)),
    referenceSha256: hash(JSON.stringify(referenceInput)),
  };
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

function sourceContextForLesson(project, lessonId) {
  const capture = project?.scionSourceCapture;
  if (!capture?.sourcePacketSha256 || !capture?.sourcePacket) return null;
  const lessonNumber = Number(String(lessonId || '').replace(/^lesson-/, ''));
  const promptId = capture.admittedPromptIds?.[lessonNumber - 1];
  const prefix = `${capture.courseGroupId}:`;
  const kernelId = String(promptId || '').startsWith(prefix) ? String(promptId).slice(prefix.length) : '';
  const kernel = capture.sourcePacket.kernels?.find((entry) => entry?.id === kernelId);
  if (!kernel) return null;
  return {
    sourcePacketSha256: capture.sourcePacketSha256,
    kernelId,
    term: text(kernel.term),
    claims: [kernel.definition, ...(kernel.facts || []).map((fact) => fact?.text)].map(text).filter(Boolean),
    attribution: (kernel.attribution || []).map(text).filter(Boolean),
    license: text(kernel.license),
  };
}

function lessonRows(graph, project) {
  const content = graph?.enrichmentOverlay?.lessonContent || {};
  return (Array.isArray(graph?.sessions) ? graph.sessions : []).map((session, index) => {
    const number = Number(session?.number);
    const lessonId = `lesson-${Number.isInteger(number) && number > 0 ? number : index + 1}`;
    return {
      lessonId,
      title: text(session?.title || `Lesson ${index + 1}`),
      content: content[lessonId] || {},
      sourceContext: sourceContextForLesson(project, lessonId),
    };
  });
}

function repeatedNormalizedTitles(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = [...titleTokens(row.title)].sort().join(' ');
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
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
    matches.push({
      left,
      right: rightRows[bestIndex],
      titleMatch: Number(bestScore.toFixed(3)),
      matchMethod: 'title-overlap',
    });
  }
  const matchedLeft = new Set(matches.map((match) => match.left.lessonId));
  const repeatedLeft = repeatedNormalizedTitles(leftRows);
  const repeatedRight = repeatedNormalizedTitles(rightRows);
  for (const left of leftRows) {
    if (matchedLeft.has(left.lessonId)) continue;
    const rightIndex = [...available].find((index) => rightRows[index].lessonId === left.lessonId);
    if (rightIndex == null) continue;
    const right = rightRows[rightIndex];
    const leftKey = [...titleTokens(left.title)].sort().join(' ');
    const rightKey = [...titleTokens(right.title)].sort().join(' ');
    if (!repeatedLeft.has(leftKey) && !repeatedRight.has(rightKey)) continue;
    available.delete(rightIndex);
    matches.push({ left, right, titleMatch: 0, matchMethod: 'lesson-number-generic-title-fallback' });
  }
  return matches.sort((left, right) =>
    left.left.lessonId.localeCompare(right.left.lessonId, undefined, { numeric: true }),
  );
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

function cleanMcItems(content = {}, { semanticAdmission = true } = {}) {
  return (Array.isArray(content.quizItems) ? content.quizItems : [])
    .filter((item) => item?.type === 'multiple_choice' || Array.isArray(item?.op) || Array.isArray(item?.options))
    .map(compactMc)
    .filter((item) => assessScionMcItem(item, { semanticAdmission }).eligible);
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
      schemaVersion: 3,
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
      courseId: pair.courseGroupId,
      courseGroupId: pair.courseGroupId,
      courseGroupSha256: pair.courseGroupSha256,
      lessonId: match.left.lessonId,
      ...(match.left.sourceContext ? { sourceContext: match.left.sourceContext } : {}),
      pairSource: {
        pairId: pair.id,
        leftRoute: pair.candidateRoute,
        leftModel: pair.candidateModel,
        rightModel: pair.referenceModel,
        leftLessonId: match.left.lessonId,
        rightLessonId: match.right.lessonId,
        titleMatch: match.titleMatch,
        matchMethod: match.matchMethod,
        courseInputSha256: pair.courseInputSha256,
        courseGroupId: pair.courseGroupId,
        courseGroupSha256: pair.courseGroupSha256,
        courseGroupSource: pair.courseGroupSource,
        candidateArtifactSha256: pair.candidateArtifactSha256,
        referenceArtifactSha256: pair.referenceArtifactSha256,
        ...(pair.sourcePacketSha256 ? { sourcePacketSha256: pair.sourcePacketSha256 } : {}),
        ...(match.left.sourceContext?.kernelId ? { sourceKernelId: match.left.sourceContext.kernelId } : {}),
      },
    };
    const id = hash(
      JSON.stringify({
        courseGroupSha256: row.courseGroupSha256,
        kind,
        prompt: row.prompt,
        sourceContext: row.sourceContext || null,
        left: row.left,
        right: row.right,
      }),
    );
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(row);
  }
}

export function buildMatchedReviewCandidates(pairs = [], { semanticAdmission = true } = {}) {
  const rows = [];
  const seen = new Set();
  const pairReports = [];
  const preparedPairs = pairs.map((pair) => {
    const input = inspectPairInput(pair);
    const courseGroup = input.pass
      ? deriveScionCourseGroup({
          domain: pair.domain,
          courseGroupId: pair.courseGroupId,
          courseInputSha256: input.sha256,
        })
      : null;
    return { pair, input, courseGroup };
  });
  const inputHashesByGroupLabel = new Map();
  for (const { pair, input, courseGroup } of preparedPairs) {
    if (!input.pass || !courseGroup) continue;
    const key = `${pair.domain}|${courseGroup.id}`;
    if (!inputHashesByGroupLabel.has(key)) inputHashesByGroupLabel.set(key, new Set());
    inputHashesByGroupLabel.get(key).add(input.sha256);
  }
  const courseGroupIdCollisions = [...inputHashesByGroupLabel.entries()]
    .filter(([, inputHashes]) => inputHashes.size > 1)
    .map(([key, inputHashes]) => {
      const [domain, ...idParts] = key.split('|');
      return { domain, courseGroupId: idParts.join('|'), courseInputSha256: [...inputHashes].sort() };
    })
    .sort((left, right) =>
      `${left.domain}|${left.courseGroupId}`.localeCompare(`${right.domain}|${right.courseGroupId}`),
    );
  const collidingKeys = new Set(courseGroupIdCollisions.map((row) => `${row.domain}|${row.courseGroupId}`));

  for (const { pair, input, courseGroup } of preparedPairs) {
    if (!input.pass) {
      pairReports.push({
        id: pair.id,
        domain: pair.domain,
        status: 'excluded',
        issues: input.issues,
        candidateInputSha256: input.candidateSha256,
        referenceInputSha256: input.referenceSha256,
        matchedLessons: 0,
        candidates: 0,
      });
      continue;
    }
    if (collidingKeys.has(`${pair.domain}|${courseGroup.id}`)) {
      pairReports.push({
        id: pair.id,
        domain: pair.domain,
        status: 'excluded',
        issues: ['course-group-id-input-mismatch'],
        courseInputSha256: input.sha256,
        courseGroupId: courseGroup.id,
        courseGroupSha256: courseGroup.sha256,
        courseGroupSource: courseGroup.source,
        matchedLessons: 0,
        candidates: 0,
      });
      continue;
    }
    const qualifiedPair = {
      ...pair,
      courseInputSha256: input.sha256,
      courseGroupId: courseGroup.id,
      courseGroupSha256: courseGroup.sha256,
      courseGroupSource: courseGroup.source,
    };
    const leftGraph = parseSavedCourseGraph(pair.candidateProject);
    const rightGraph = parseSavedCourseGraph(pair.referenceProject);
    const matches = matchLessons(
      lessonRows(leftGraph, pair.candidateProject),
      lessonRows(rightGraph, pair.referenceProject),
    );
    if (pair.sourcePacketSha256) {
      const sourceContextMismatch = matches.some(
        (match) =>
          !match.left.sourceContext ||
          !match.right.sourceContext ||
          JSON.stringify(match.left.sourceContext) !== JSON.stringify(match.right.sourceContext) ||
          match.left.sourceContext.sourcePacketSha256 !== pair.sourcePacketSha256,
      );
      if (sourceContextMismatch) {
        pairReports.push({
          id: pair.id,
          domain: pair.domain,
          status: 'excluded',
          issues: ['source-context-mismatch'],
          courseInputSha256: input.sha256,
          courseGroupId: courseGroup.id,
          courseGroupSha256: courseGroup.sha256,
          courseGroupSource: courseGroup.source,
          matchedLessons: matches.length,
          candidates: 0,
        });
        continue;
      }
    }
    const before = rows.length;
    for (const match of matches) {
      addPairs(rows, seen, {
        pair: qualifiedPair,
        match,
        kind: 'mc-item',
        leftItems: cleanMcItems(match.left.content, { semanticAdmission }),
        rightItems: cleanMcItems(match.right.content, { semanticAdmission }),
      });
      addPairs(rows, seen, {
        pair: qualifiedPair,
        match,
        kind: 'key-term',
        leftItems: cleanKeyTerms(match.left.content),
        rightItems: cleanKeyTerms(match.right.content),
      });
    }
    pairReports.push({
      id: pair.id,
      domain: pair.domain,
      status: 'included',
      issues: [],
      courseInputSha256: input.sha256,
      courseGroupId: courseGroup.id,
      courseGroupSha256: courseGroup.sha256,
      courseGroupSource: courseGroup.source,
      matchedLessons: matches.length,
      candidates: rows.length - before,
    });
  }
  const domains = [...new Set(rows.map((row) => row.domain))].sort();
  const courseGroups = [
    ...new Map(
      rows.map((row) => [
        row.courseGroupSha256,
        { domain: row.domain, courseGroupId: row.courseGroupId, courseGroupSha256: row.courseGroupSha256 },
      ]),
    ).values(),
  ].sort((left, right) =>
    `${left.domain}|${left.courseGroupId}`.localeCompare(`${right.domain}|${right.courseGroupId}`),
  );
  const domainGroupCounts = Object.fromEntries(
    domains.map((domain) => [domain, courseGroups.filter((group) => group.domain === domain).length]),
  );
  const sourceContextCandidates = rows.filter((row) => row.sourceContext).length;
  const sourceContextDomainCounts = Object.fromEntries(
    domains.map((domain) => [domain, rows.filter((row) => row.domain === domain && row.sourceContext).length]),
  );
  return {
    rows,
    summary: {
      pairs: pairs.length,
      eligiblePairs: pairReports.filter((pair) => pair.status === 'included').length,
      excludedPairs: pairReports.filter((pair) => pair.status === 'excluded').length,
      candidates: rows.length,
      sourceContextCandidates,
      domains,
      domainCount: domains.length,
      courseGroups,
      courseGroupCount: courseGroups.length,
      domainGroupCounts,
      sourceContextDomainCounts,
      courseGroupIdCollisions,
      groupIntegrityStatus: courseGroupIdCollisions.length === 0 ? 'pass' : 'blocked-course-group-id-collision',
      targetCourseGroupsPerDomain: 3,
      groupCoverageStatus:
        domains.length > 0 && Object.values(domainGroupCounts).every((count) => count >= 3)
          ? 'ready'
          : 'needs-more-course-groups',
      kinds: Object.fromEntries(
        ['mc-item', 'key-term'].map((kind) => [kind, rows.filter((row) => row.kind === kind).length]),
      ),
      pairReports,
      claimBoundary:
        'These are neutral matched candidates for blind review. Candidate/reference identity supplies no preference label.',
    },
  };
}

async function run({
  manifestPath = DEFAULT_MANIFEST,
  output = DEFAULT_OUTPUT,
  reportDir = DEFAULT_REPORT,
  semanticAdmission = true,
} = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const pairs = await Promise.all(
    (manifest.pairs || []).map(async (pair) => {
      const [candidateRaw, referenceRaw] = await Promise.all([
        fs.readFile(pair.candidate, 'utf8'),
        fs.readFile(pair.reference, 'utf8'),
      ]);
      return {
        ...pair,
        candidateProject: JSON.parse(candidateRaw),
        referenceProject: JSON.parse(referenceRaw),
        candidateArtifactSha256: hash(candidateRaw),
        referenceArtifactSha256: hash(referenceRaw),
      };
    }),
  );
  const result = buildMatchedReviewCandidates(pairs, { semanticAdmission });
  await Promise.all([fs.mkdir(path.dirname(output), { recursive: true }), fs.mkdir(reportDir, { recursive: true })]);
  await Promise.all([
    fs.writeFile(output, result.rows.map((row) => JSON.stringify(row)).join('\n') + (result.rows.length ? '\n' : '')),
    fs.writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify(result.summary, null, 2)}\n`),
  ]);
  return result;
}

function parseArgs(argv) {
  const args = {
    manifestPath: DEFAULT_MANIFEST,
    output: DEFAULT_OUTPUT,
    reportDir: DEFAULT_REPORT,
    verify: false,
    semanticAdmission: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--manifest') args.manifestPath = argv[++index] || args.manifestPath;
    else if (argv[index] === '--output') args.output = argv[++index] || args.output;
    else if (argv[index] === '--report') args.reportDir = argv[++index] || args.reportDir;
    else if (argv[index] === '--verify') args.verify = true;
    else if (argv[index] === '--legacy-semantic-admission') args.semanticAdmission = false;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.verify) {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-review-candidates-'));
    try {
      const generatedOutput = path.join(temporaryRoot, 'scion-review-candidates.jsonl');
      result = await run({
        manifestPath: args.manifestPath,
        output: generatedOutput,
        reportDir: path.join(temporaryRoot, 'report'),
        semanticAdmission: args.semanticAdmission,
      });
      const [expected, generated] = await Promise.all([fs.readFile(args.output), fs.readFile(generatedOutput)]);
      if (!expected.equals(generated)) {
        throw new Error(
          `Tracked Scion review candidates are stale: ${args.output} does not match a fresh deterministic build`,
        );
      }
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  } else {
    result = await run(args);
  }
  console.log(
    `Scion matched review candidates${args.verify ? ' verified' : ''}: ${result.summary.candidates} total / ${result.summary.sourceContextCandidates} source-grounded across ${result.summary.domainCount} domains / ${result.summary.courseGroupCount} course groups`,
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
