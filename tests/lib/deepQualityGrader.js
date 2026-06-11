/**
 * deepQualityGrader.js — the GRADER half of the Crucible.
 *
 * Codifies the V0.14 four-course manual audit (the one that found 28 defect
 * classes) into an automated, evidence-quoting grader. Every live run the
 * Crucible driver performs is graded the way a senior auditor would write it:
 * a scored, dimension-weighted findings report with verbatim evidence quotes.
 * v0.14.1 fixed all 28 classes — this grader is the permanent regression net.
 *
 * Plain ESM. No vitest imports — importable from vitest specs AND from the
 * node-side Crucible driver (scripts/crucible.mjs). The driver imports ONE
 * thing:
 *
 *   grade({ extractedDir, consoleLogText, digest, course })
 *     → { scores: { dimension: 0-100 }, grades: { dimension: 'A'..'F' },
 *         overall: { score, grade }, findings: [...], stats }
 *
 *   renderReportMarkdown(result, { courseTitle, baselineResult })
 *     → the human report (findings by severity, score table, baseline delta).
 *
 * extractedDir is a directory tree of an UNZIPPED package (the driver unzips
 * the download). The grader reads docx/pptx/xlsx as zips-of-XML (jszip), the
 * same extraction approach as tests/output-artifact-gate.test.js, plus raw
 * md/txt/json. It cross-checks the rendered text against:
 *   - PACKAGE_MANIFEST.json (registry, readiness, pipeline, files)
 *   - the digest JSON (runDigest [CM][DIGEST] shape)
 *   - the console log ([CM] lines: genome, judgment, enrichment, export_verify)
 *
 * Dimensions & weights (each finding carries verbatim evidence ≤200 chars):
 *   identity 20, substance 20, citations 15, honesty 15, discipline 15,
 *   consistency 10, structure 10, format 5  (sum 110 → normalized).
 * Scoring: dimension starts at 100; P0 −25, P1 −8, P2 −3 (floor 0).
 * Overall = weighted mean. Letter bands match the manual audit's instincts:
 *   A ≥90, B ≥80, C ≥70, D ≥60, F <60.
 */

import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import {
  ARTIFACT_PATTERNS,
  JSON_SYNTAX_PATTERNS,
  FUSED_TITLE_PATTERNS,
  INTERNAL_VOCAB_PATTERNS,
  COVER_META_PATTERNS,
  BACKTICK_LEAK_PATTERNS,
  EAST_ASIA_OVERRIDE_PATTERN,
  SHOULD_BE_LESSON_ROOTED,
  isTruncatedBulletLine,
  scanText,
} from './artifactDefectPatterns.js';

// ── Dimension weights & letter bands (documented in the module header) ──────
export const DIMENSION_WEIGHTS = {
  identity: 20,
  substance: 20,
  citations: 15,
  honesty: 15,
  discipline: 15,
  consistency: 10,
  structure: 10,
  format: 5,
};
const SEVERITY_PENALTY = { P0: 25, P1: 8, P2: 3 };
const DIMENSIONS = Object.keys(DIMENSION_WEIGHTS);

export function letterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ── XML/text extraction (mirrors output-artifact-gate's helpers) ────────────

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTextNodes(xml) {
  const text = [];
  const pattern = /<(?:w:t|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|t)>/g;
  let match = pattern.exec(xml);
  while (match) {
    text.push(decodeXmlEntities(match[1]));
    match = pattern.exec(xml);
  }
  return text.join(' ').replace(/\s+/g, ' ').trim();
}

function paragraphLinesFromXml(xml) {
  const lines = [];
  for (const para of xml.split(/<\/(?:w|a):p>/)) {
    const inner = (para.match(/<(?:w:t|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|t)>/g) || [])
      .map((node) => decodeXmlEntities(node.replace(/<[^>]+>/g, '')))
      .join('');
    const line = inner.replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
  }
  return lines;
}

async function readOfficeZip(buffer) {
  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    return null;
  }
}

async function extractDocx(buffer) {
  const zip = await readOfficeZip(buffer);
  if (!zip) return { text: '', paragraphs: [], rawXml: '' };
  const parts = ['word/document.xml'];
  for (const name of Object.keys(zip.files)) {
    if (/^word\/(?:header|footer)\d+\.xml$/.test(name)) parts.push(name);
  }
  const textParts = [];
  const paragraphs = [];
  const xmls = [];
  for (const name of parts) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async('string');
    xmls.push(xml);
    textParts.push(extractTextNodes(xml));
    paragraphs.push(...paragraphLinesFromXml(xml));
  }
  return { text: textParts.join(' ').replace(/\s+/g, ' ').trim(), paragraphs, rawXml: xmls.join('\n') };
}

async function extractXlsx(buffer) {
  const zip = await readOfficeZip(buffer);
  if (!zip) return { text: '', cells: [], cellTexts: [], rawXml: '' };
  const xmls = [];
  // `cells` keeps its ORIGINAL shared-strings-only semantics — one entry per
  // <t> node in sharedStrings.xml (consumers like checkIdentity depend on this
  // exact shape; it is empty for inline-string workbooks, which have no shared
  // table). `cellTexts` below is the richer per-cell extraction the FORMAT scan
  // and discipline-vocab use.
  const cells = [];
  const sharedStrings = [];
  const shared = zip.file('xl/sharedStrings.xml');
  if (shared) {
    const xml = await shared.async('string');
    xmls.push(xml);
    for (const node of xml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []) {
      cells.push(
        decodeXmlEntities(node.replace(/<[^>]+>/g, ''))
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
    for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) || []) {
      const value = (si.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [])
        .map((siNode) => decodeXmlEntities(siNode.replace(/<[^>]+>/g, '')))
        .join('');
      sharedStrings.push(value);
    }
  }
  const cellTexts = [];
  for (const name of Object.keys(zip.files).sort()) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const xml = await zip.file(name).async('string');
    xmls.push(xml);
    for (const cellXml of xml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) || []) {
      const typeMatch = /\bt="([^"]+)"/.exec(cellXml);
      const type = typeMatch ? typeMatch[1] : 'n';
      let value = '';
      if (type === 's') {
        const index = Number((cellXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1]);
        value = sharedStrings[index] || '';
      } else {
        const textNodes = cellXml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g);
        value = textNodes
          ? textNodes.map((node) => decodeXmlEntities(node.replace(/<[^>]+>/g, ''))).join('')
          : decodeXmlEntities((cellXml.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
      }
      const trimmed = value
        .replace(/\r/g, '')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .trim();
      if (trimmed) cellTexts.push(trimmed);
    }
  }
  const text = xmls
    .map((xml) => extractTextNodes(xml))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, cells: cells.filter(Boolean), cellTexts, rawXml: xmls.join('\n') };
}

async function extractPptx(buffer) {
  const zip = await readOfficeZip(buffer);
  if (!zip) return { text: '', paragraphs: [], slides: [], rawXml: '' };
  const textParts = [];
  const paragraphs = [];
  const slides = [];
  const xmls = [];
  for (const name of Object.keys(zip.files).sort()) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(name) || /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)) {
      const xml = await zip.file(name).async('string');
      xmls.push(xml);
      const slideText = extractTextNodes(xml);
      textParts.push(slideText);
      paragraphs.push(...paragraphLinesFromXml(xml));
      if (/slides\/slide/.test(name)) {
        const titleMatch = paragraphLinesFromXml(xml)[0] || '';
        slides.push({ name, text: slideText, title: titleMatch });
      }
    }
  }
  return { text: textParts.join(' ').replace(/\s+/g, ' ').trim(), paragraphs, slides, rawXml: xmls.join('\n') };
}

// Walk the extracted directory, building a list of parsed files.
// Each: { path (relative, forward-slashed), top (top folder), kind, featureId,
//   lessonNumber, text, paragraphs, slides?, cells?, rawXml }.
const FOLDER_FEATURE = {
  'Lesson Plans': 'lessonPlans',
  'Slide Decks': 'slideDecks',
  'Assignment Briefs': 'assignments',
  Rubrics: 'rubrics',
  'Discussion Prompts': 'discussions',
  'Quiz & Exam Bank': 'quizBank',
  'Study Guides': 'studyGuides',
  Syllabus: 'syllabus',
  'Course FAQ': 'courseFaq',
  'Course Map': 'courseMap',
};

function lessonNumberFromName(name) {
  const match = /Lesson (\d{1,3})\b/.exec(name);
  return match ? Number(match[1]) : null;
}

function walkFiles(dir) {
  const out = [];
  const recurse = (current, rel) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) recurse(abs, relPath);
      else out.push({ abs, relPath });
    }
  };
  recurse(dir, '');
  return out;
}

export async function extractPackage(extractedDir) {
  const files = [];
  let manifest = null;
  const requiredAssetsText = [];
  for (const { abs, relPath } of walkFiles(extractedDir)) {
    const lower = relPath.toLowerCase();
    const top = relPath.split('/')[0];
    const featureId = FOLDER_FEATURE[top] || null;
    const lessonNumber = lessonNumberFromName(relPath);
    if (lower.endsWith('package_manifest.json')) {
      try {
        manifest = JSON.parse(fs.readFileSync(abs, 'utf8'));
      } catch {
        manifest = null;
      }
      continue;
    }
    if (lower.endsWith('.docx')) {
      const parsed = await extractDocx(fs.readFileSync(abs));
      files.push({ path: relPath, top, kind: 'docx', featureId, lessonNumber, ...parsed });
    } else if (lower.endsWith('.pptx')) {
      const parsed = await extractPptx(fs.readFileSync(abs));
      files.push({ path: relPath, top, kind: 'pptx', featureId, lessonNumber, ...parsed });
    } else if (lower.endsWith('.xlsx')) {
      const parsed = await extractXlsx(fs.readFileSync(abs));
      files.push({ path: relPath, top, kind: 'xlsx', featureId, lessonNumber, ...parsed });
    } else if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      const text = fs.readFileSync(abs, 'utf8');
      files.push({
        path: relPath,
        top,
        kind: 'text',
        featureId,
        lessonNumber,
        text,
        paragraphs: text.split('\n'),
        rawXml: '',
      });
      if (top === 'Required Assets') requiredAssetsText.push(text);
    }
  }
  return { files, manifest, requiredAssetsText: requiredAssetsText.join('\n') };
}

// ── small helpers ───────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'at',
  'as',
  'is',
  'are',
  'this',
  'that',
  'these',
  'those',
  'how',
  'what',
  'why',
  'which',
  'when',
  'into',
  'using',
  'use',
  'your',
  'you',
  'students',
  'student',
  'lesson',
  'week',
  'course',
  'quiz',
  'exam',
  'final',
  'midterm',
  'will',
  'can',
  'be',
  'one',
  'each',
  'their',
  'its',
  'it',
  'about',
  'between',
  'across',
  'over',
  'than',
  'then',
  'they',
  'them',
]);

function tokens(text) {
  return (
    String(text || '')
      .toLowerCase()
      .match(/[a-z][a-z'-]{2,}/g) || []
  );
}

function contentTokens(text) {
  return tokens(text).filter((token) => !STOPWORDS.has(token));
}

function quote(text, limit = 200) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

// Normalize a title to tokens for subset matching (mirrors packageFinalizer).
function titleTokens(text) {
  return contentTokens(text);
}
function isTokenSubset(needleTokens, haystackTokenSet) {
  return needleTokens.length > 0 && needleTokens.every((token) => haystackTokenSet.has(token));
}

// ── Finding accumulator ─────────────────────────────────────────────────────

function createFindings() {
  const list = [];
  let counter = 0;
  return {
    add({ severity, dimension, file = '', detail, evidence = '' }) {
      counter += 1;
      list.push({
        id: `F${String(counter).padStart(3, '0')}`,
        severity,
        dimension,
        file,
        detail,
        evidence: quote(evidence),
      });
    },
    list,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DIMENSION CHECKS
// ════════════════════════════════════════════════════════════════════════════

// STRUCTURE — folders, per-lesson counts, manifest, readiness, required assets.
function checkStructure(findings, { files, manifest }, course) {
  const requested = (course?.featureIds || course?.features || []).filter((id) => id && id !== 'courseMap');
  const topFolders = new Set(files.map((file) => file.top));
  for (const featureId of requested) {
    const folder = Object.keys(FOLDER_FEATURE).find((key) => FOLDER_FEATURE[key] === featureId);
    if (folder && !topFolders.has(folder)) {
      findings.add({
        severity: 'P1',
        dimension: 'structure',
        file: folder,
        detail: `Requested feature "${featureId}" has no folder in the package`,
        evidence: `expected folder "${folder}"`,
      });
    }
  }

  if (!manifest) {
    findings.add({
      severity: 'P0',
      dimension: 'structure',
      file: 'PACKAGE_MANIFEST.json',
      detail: 'PACKAGE_MANIFEST.json missing or did not parse',
      evidence: 'no manifest',
    });
  } else {
    const lessonCount =
      manifest.lessonScope === 'all' ? null : Array.isArray(manifest.lessonScope) ? manifest.lessonScope.length : null;
    // Per-lesson file counts should match for split-by-lesson features.
    for (const featureId of SHOULD_BE_LESSON_ROOTED) {
      if (!requested.includes(featureId)) continue;
      const folder = Object.keys(FOLDER_FEATURE).find((key) => FOLDER_FEATURE[key] === featureId);
      const featureFiles = files.filter((file) => file.featureId === featureId);
      const declared = (manifest.files || []).filter(
        (entry) => entry.featureId === featureId || entry.featureId === 'custom',
      );
      if (lessonCount && featureFiles.length > 0 && featureFiles.length !== lessonCount) {
        findings.add({
          severity: 'P1',
          dimension: 'structure',
          file: folder,
          detail: `${featureId}: ${featureFiles.length} lesson files but course scope is ${lessonCount} lessons`,
          evidence: `${featureFiles.length} vs ${lessonCount}`,
        });
      }
      if (declared.length > 0 && featureFiles.length > 0 && declared.length !== featureFiles.length) {
        findings.add({
          severity: 'P2',
          dimension: 'structure',
          file: 'PACKAGE_MANIFEST.json',
          detail: `${featureId}: manifest lists ${declared.length} files, ${featureFiles.length} present on disk`,
          evidence: `${declared.length} vs ${featureFiles.length}`,
        });
      }
    }
    // Only a genuinely bad readiness verdict is a finding. "unknown" means
    // readiness wasn't recorded in this export (a packaging detail, not a
    // quality defect); "ready"/"needs_review" are fine.
    const status = manifest.readiness?.status;
    if (status === 'blocked' || (manifest.readiness?.blockers || 0) > 0) {
      findings.add({
        severity: 'P1',
        dimension: 'structure',
        file: 'PACKAGE_MANIFEST.json',
        detail: `package readiness reports ${manifest.readiness?.blockers || 0} blocker(s) (status "${status}")`,
        evidence: JSON.stringify(manifest.readiness).slice(0, 180),
      });
    }
  }

  // Required Assets genre plausibility: no ".parquet"/"model card" outside a
  // data-science course (item 1.12 regression net).
  const requiredAsset = files.find((file) => file.top === 'Required Assets');
  if (requiredAsset) {
    const md = requiredAsset.text;
    const dsGenre = isDataScienceCourse(course);
    if (!dsGenre && /\.parquet\b|\bmodel cards?\b|\.ipynb\b/i.test(md)) {
      const match = /(.{0,40}(?:\.parquet|model cards?|\.ipynb).{0,40})/i.exec(md);
      findings.add({
        severity: 'P1',
        dimension: 'structure',
        file: requiredAsset.path,
        detail:
          'Required Assets list cites data-science assets (.parquet / model card / .ipynb) for a non-data-science course',
        evidence: match ? match[1] : 'data-science asset noun',
      });
    }
  }
}

function isDataScienceCourse(course) {
  const text = `${course?.title || ''} ${course?.id || ''}`.toLowerCase();
  return /data science|machine learning|applied ml|\bstatistic|analytics|deep learning/.test(text);
}

// IDENTITY — the assessment registry (v0.14.1 Phase 3).
function checkIdentity(findings, { files, manifest }, course) {
  const assessments = Array.isArray(manifest?.assessments) ? manifest.assessments : [];
  const filePaths = new Set(files.map((file) => file.path));
  const HIGH_STAKES = /\b(midterm|final|exam|oral|performance)\b/i;

  // (a) every registry artifact path must exist in the package.
  for (const assessment of assessments) {
    if (assessment.artifact && !filePaths.has(assessment.artifact)) {
      const stakes = HIGH_STAKES.test(assessment.title || '');
      findings.add({
        severity: stakes ? 'P0' : 'P1',
        dimension: 'identity',
        file: 'PACKAGE_MANIFEST.json',
        detail: `registry entry ${assessment.id || ''} "${assessment.title}" names artifact "${assessment.artifact}" which is not in the package`,
        evidence: assessment.artifact,
      });
    }
  }

  // (b) every Course Map xlsx Weekly Assessments title must resolve to some
  // brief/exam/syllabus artifact (token-subset, mirroring reconciliation).
  const xlsx = files.find((file) => file.featureId === 'courseMap' && file.kind === 'xlsx');
  if (xlsx) {
    const downstream = collectDownstreamTitleTokenSets(files);
    const assessmentLines = extractWeeklyAssessmentLines(xlsx.cells || []);
    for (const line of assessmentLines) {
      const lineTokens = titleTokens(line.replace(/→.*$/, ''));
      if (lineTokens.length === 0) continue;
      const resolved = downstream.some((set) => isTokenSubset(lineTokens, set));
      if (!resolved) {
        const stakes = HIGH_STAKES.test(line);
        findings.add({
          severity: stakes ? 'P0' : 'P2',
          dimension: 'identity',
          file: xlsx.path,
          detail: `course-map assessment "${quote(line, 80)}" resolves to no downstream brief/exam/syllabus artifact`,
          evidence: line,
        });
      }
    }
  }

  // (e — round 2) registered exams must SHIP exam content inside their
  // artifact, not just an artifact file. The Round-1 live geology/cs-python
  // packages registered midterms/finals whose quiz-bank docx contained only
  // the weekly quiz section (the finish-pass repair had retitled the exam
  // entry to a lesson-1 heading) — and this dimension still scored 100.
  // Proof: the exam title (punctuation-normalized, so "Midterm Exam:
  // minerals…" matches the rendered "Midterm Exam — minerals…") appears in
  // the extracted text, OR an exam-styled section heading (NOT a "Lesson N:"
  // week heading) plus an answer key.
  const normalizeForExamMatch = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  for (const assessment of assessments) {
    if (assessment.kind !== 'exam' || !assessment.artifact) continue;
    const artifactFile = fileByPath.get(assessment.artifact);
    if (!artifactFile) continue; // (a) already flagged the missing file
    const normalizedText = normalizeForExamMatch(artifactFile.text);
    const normalizedTitle = normalizeForExamMatch(assessment.title);
    const titlePresent = normalizedTitle.length > 0 && normalizedText.includes(normalizedTitle);
    // An exam-TITLE heading starts the line (optionally behind "Answer Key —")
    // with no sentence punctuation or hyphen-joined file-stem segments before
    // the word "exam", and a title separator right after it. This stays quiet
    // on footers ("… - Midterm Review and Exam — Quiz & Exam Bank"), week
    // headings ("Lesson 8: Midterm Review and Exam"), and prose/metadata
    // mentions ("Intended use: Exam-prep synthesis …") — all present in the
    // Round-1 live artifacts that shipped WITHOUT exam content.
    const examHeading = (artifactFile.paragraphs || []).some(
      (line) =>
        /^(?:answer key\s*[—–-]\s*)?[^—–:;.-]{0,60}\bexam\b\s*[—–:]/i.test(line.trim()) &&
        !/^\s*lesson\s+\d+\s*[:.]/i.test(line.trim()),
    );
    const hasAnswerKey = /answer key/i.test(artifactFile.text);
    if (!titlePresent && !(examHeading && hasAnswerKey)) {
      findings.add({
        severity: 'P0',
        dimension: 'identity',
        file: assessment.artifact,
        detail: `registered exam artifact contains no exam content: ${assessment.id || 'exam'} "${assessment.title}" never appears in the document`,
        evidence: quote(artifactFile.text, 160),
      });
    }
  }

  // (c) briefs carry "Course Map L<N>" stamps.
  for (const file of files.filter((file) => file.featureId === 'assignments' && file.kind === 'docx')) {
    if (!/Course Map\s+L?\d+/i.test(file.text) && !/Course Map row\s+\d+/i.test(file.text)) {
      findings.add({
        severity: 'P2',
        dimension: 'identity',
        file: file.path,
        detail: 'assignment brief carries no "Course Map L<N>" reverse stamp',
        evidence: quote(file.text, 120),
      });
    }
  }

  // (d) syllabus grading rows carry registry ids (A<N>.<M>) and weights → 100.
  const syllabus = files.find((file) => file.featureId === 'syllabus' && file.kind === 'docx');
  if (syllabus) {
    const ids = syllabus.text.match(/\bA\d+\.\d+\b/g) || [];
    if (assessments.length > 0 && ids.length === 0) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: syllabus.path,
        detail: 'syllabus grading table carries no registry ids (A<N>.<M>) although the manifest registry is populated',
        evidence: quote(syllabus.text, 120),
      });
    }
    const weights = (syllabus.text.match(/\b(\d{1,3})\s?%/g) || []).map((value) => Number(value.replace(/\D/g, '')));
    // Use the manifest registry as the authoritative weight sum when present.
    const registryWeightSum = assessments.reduce((sum, entry) => sum + (Number(entry.weightPct) || 0), 0);
    if (registryWeightSum > 0 && Math.abs(registryWeightSum - 100) > 0.5) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: 'PACKAGE_MANIFEST.json',
        detail: `registry assessment weights sum to ${registryWeightSum} (expected 100 ±0.5)`,
        evidence: `sum=${registryWeightSum}`,
      });
    } else if (registryWeightSum === 0 && weights.length >= 3) {
      const total = weights.reduce((sum, value) => sum + value, 0);
      // Only flag a clearly-incomplete grading table (well under 100).
      if (total > 0 && total < 90) {
        findings.add({
          severity: 'P2',
          dimension: 'identity',
          file: syllabus.path,
          detail: `syllabus grading weights sum to ${total}% (under 100%)`,
          evidence: `weights ${weights.join(', ')}`,
        });
      }
    }
  }
}

function extractWeeklyAssessmentLines(cells) {
  // Heuristic: assessment cells contain a genre keyword or a registry arrow.
  const ASSESS_RE =
    /\b(quiz|exam|midterm|final|assignment|project|brief|lab|paper|essay|oral|performance|presentation|portfolio|problem set|discussion)\b/i;
  const lines = [];
  for (const cell of cells) {
    for (const raw of String(cell).split('\n')) {
      const line = raw.replace(/^\s*\d+[.)]\s*/, '').trim();
      if (line && ASSESS_RE.test(line)) lines.push(line);
    }
  }
  return lines;
}

function collectDownstreamTitleTokenSets(files) {
  const sets = [];
  for (const file of files) {
    if (!['assignments', 'quizBank', 'syllabus'].includes(file.featureId)) continue;
    const set = new Set(contentTokens(file.text));
    if (set.size > 0) sets.push(set);
  }
  return sets;
}

// CONSISTENCY — week labels, lesson-title cross-deliverable, objectives match.
function checkConsistency(findings, { files }) {
  // Week-label check on every lesson-rooted document. Scanned PER paragraph so
  // a "the Week N quiz" reference can't be fabricated across a paragraph join.
  for (const file of files) {
    if (file.lessonNumber == null) continue;
    let flagged = false;
    for (const para of file.paragraphs || []) {
      if (flagged) break;
      const line = String(para);
      for (const ref of line.matchAll(/\bthe Week (\d+) (?:quiz|check|exam|paper)\b/gi)) {
        if (Number(ref[1]) !== file.lessonNumber) {
          findings.add({
            severity: 'P0',
            dimension: 'consistency',
            file: file.path,
            detail: `Lesson ${file.lessonNumber} document references "${ref[0]}" — week label disagrees with the enclosing lesson`,
            evidence: contextAround(line, ref.index),
          });
          flagged = true;
          break;
        }
      }
    }
  }

  // Lesson titles consistent across deliverables: gather the per-lesson title
  // each deliverable file declares (the document cover), compare across types.
  const byLesson = new Map();
  for (const file of files) {
    if (file.lessonNumber == null || file.featureId === 'courseMap') continue;
    const title = inferDocumentLessonTitle(file);
    if (!title) continue;
    if (!byLesson.has(file.lessonNumber)) byLesson.set(file.lessonNumber, []);
    byLesson.get(file.lessonNumber).push({ featureId: file.featureId, title, path: file.path });
  }
  for (const [lessonNumber, entries] of byLesson) {
    if (entries.length < 2) continue;
    const normalized = entries.map((entry) => ({ ...entry, norm: normalizeLessonTitle(entry.title) }));
    const distinct = new Set(normalized.map((entry) => entry.norm));
    if (distinct.size > 1) {
      // One representative per DISTINCT title so the divergent one is always
      // visible in the evidence (the first-three sample could show only the
      // agreeing deliverables).
      const sample = [...new Map(normalized.map((entry) => [entry.norm, entry])).values()]
        .slice(0, 3)
        .map((entry) => `${entry.featureId}: "${entry.title}"`)
        .join(' | ');
      findings.add({
        severity: 'P1',
        dimension: 'consistency',
        file: `Lesson ${lessonNumber}`,
        detail: `Lesson ${lessonNumber} title differs across deliverable types`,
        evidence: sample,
      });
    }
  }
}

function contextAround(text, index, span = 90) {
  const at = Math.max(0, (index || 0) - 50);
  return quote(text.slice(at, (index || 0) + span));
}

function inferDocumentLessonTitle(file) {
  // ONLY the document's Title line counts: the cover renders
  // "<Course> - Lesson NN - <Lesson Title>" identically across deliverable
  // types. Round-2 FP class: the old extractor matched ANY "Lesson N: …"
  // prose — and when the genuine cover title ran long (geology L13's
  // 8-word title failed the old ≤6-word cap) it fell through to body prose
  // like "… Lesson 13: Geologic Time using the criteria below" (rubrics) or
  // "… Lesson 13: Geologic Time to strengthen the next …" (deck notes) and
  // reported the lesson titles as divergent. A document with no parseable
  // Title line is EXCLUDED from the comparison instead of compared on prose.
  for (const line of (file.paragraphs || []).slice(0, 6)) {
    const match = /\s[-–—]\sLesson\s+(\d{1,3})\s[-–—]\s(.+)$/.exec(String(line).trim());
    if (!match) continue;
    if (file.lessonNumber != null && Number(match[1]) !== file.lessonNumber) continue;
    // Drop a trailing deliverable label the title line may append.
    const cleaned = match[2]
      .replace(/\s+/g, ' ')
      .replace(
        /\s*-\s*(?:Lesson Plans?|Assignment Briefs?|Rubrics?|Quiz & Exam Bank|Study Guides?|Slide Decks?|Syllabus|Discussion Prompts?|Course FAQ)$/i,
        '',
      )
      .trim();
    if (cleaned.length > 2) return cleaned;
  }
  return null;
}

function normalizeLessonTitle(title) {
  return contentTokens(title).sort().join(' ');
}

// HONESTY — console + manifest cross-checks.
function checkHonesty(findings, { manifest }, consoleLogText, digest) {
  const log = String(consoleLogText || '');

  // genomeLinker counts consistent across the three surfaces.
  const linkerLineCount = firstNumber(log, /([0-9]+)\s+genome\s*\+\s*[0-9]+\s+cached/i);
  const backboneLineCount = firstNumber(log, /([0-9]+)\/[0-9]+\s+lessons genome-linked/i);
  const manifestLinker = manifest?.pipeline?.genomeLinker || '';
  const manifestLinkerCount = firstNumber(manifestLinker, /([0-9]+)\s+genome/i);
  const seen = [linkerLineCount, backboneLineCount, manifestLinkerCount].filter((value) => value != null);
  if (seen.length >= 2 && new Set(seen).size > 1) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'console + manifest',
      detail: `genome-linked count disagrees across surfaces (linker=${linkerLineCount}, backbone=${backboneLineCount}, manifest=${manifestLinkerCount})`,
      evidence: quote(manifestLinker || log.match(/[0-9]+ genome[^\n]*/i)?.[0] || ''),
    });
  }

  // Enrichment: full coverage OR an explicit fallback warning must be present.
  const enrichment = String(manifest?.pipeline?.enrichment || '');
  const partial = /\(\s*(\d+)\s*\/\s*(\d+)/.exec(enrichment);
  if (partial && partial[1] !== partial[2]) {
    const fellBack = /fell back|fall back|template/i.test(enrichment) || /partial enrichment/i.test(log);
    if (!fellBack) {
      findings.add({
        severity: 'P1',
        dimension: 'honesty',
        file: 'PACKAGE_MANIFEST.json',
        detail: `partial enrichment (${partial[1]}/${partial[2]}) with no explicit fallback warning`,
        evidence: enrichment,
      });
    }
  }

  // Judgment line present (any of its three states).
  const judgmentManifest = manifest?.pipeline?.judgment;
  const judgmentInLog = /Course judgment|prerequisite gap|no gaps across|not evaluated \(0 genome/i.test(log);
  if (!judgmentManifest && !judgmentInLog) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'console + manifest',
      detail: 'no judgment line in the manifest pipeline or the console log (the v0.14 audit’s silent judgment layer)',
      evidence: quote(JSON.stringify(manifest?.pipeline || {}), 160),
    });
  }

  // export_verify passed with 0 failed.
  const exportFailed = digest?.gates?.exportFailed;
  const exportStatus = digest?.gates?.exportStatus;
  if ((Number.isFinite(exportFailed) && exportFailed > 0) || /export_verify_failed/i.test(log)) {
    findings.add({
      severity: 'P0',
      dimension: 'honesty',
      file: 'digest / console',
      detail: `export verification reported failures (status=${exportStatus || '?'}, failed=${exportFailed ?? '?'})`,
      evidence: quote(log.match(/export_verify_failed[^\n]*/i)?.[0] || JSON.stringify(digest?.gates || {}), 160),
    });
  }

  // Unexplained console errors/warnings (allowlist dev noise).
  const ALLOWLIST =
    /DALL-E|GPT Image|Imagen|image generation|vite|HMR|sourcemap|Download the React DevTools|punycode|ExperimentalWarning|localstorage-file/i;
  // Round-3 polish: browser network noise says nothing about the app — QUIC
  // protocol flaps, connection changes, and failed favicon/static-asset loads
  // are environment artifacts of the headless run. Kept surgical: only the
  // named net:: codes and resource-load failures that carry a net:: code or a
  // static-asset path; a bare "[error] Failed to load resource" with an app
  // API in it still flags.
  const NETWORK_NOISE_RE =
    /net::ERR_(?:QUIC_PROTOCOL_ERROR|NETWORK_CHANGED|INTERNET_DISCONNECTED)|Failed to load resource:.*(?:net::ERR_|favicon|\.ico\b|\.png\b|\.svg\b|\.woff2?\b)/i;
  for (const line of log.split('\n')) {
    if (!/\b(error|warning|✗|failed)\b/i.test(line)) continue;
    if (ALLOWLIST.test(line)) continue;
    if (NETWORK_NOISE_RE.test(line)) continue; // browser network noise, not the app
    if (/\[CM\]\[(?:API|GEN|FINISH|DIGEST)\]/.test(line)) continue; // structured trace, not noise
    // The digest pretty-print is the app's structured self-report, not noise:
    // its gates summary line trips \bfailed\b on "0 failed, 0 warnings" (the
    // round-3 world-lit/mandarin/geology FP) and its indented flagged-check
    // lines open with [warning]/[info]. Both surfaces are cross-checked by
    // the dedicated gate checks above, so the noise scan skips them.
    if (/^gates:\s+(?:ready|needs_review|blocked)\b/.test(line)) continue;
    if (/^\s+\[(?:warning|info|blocker)\]\s+[A-Za-z][\w-]*:/.test(line)) continue;
    if (/⚠|warn/i.test(line) && /skipped|fell back|cap|rejected|repaired/i.test(line)) continue; // explained
    findings.add({
      severity: 'P2',
      dimension: 'honesty',
      file: 'console',
      detail: 'unexplained console error/warning not on the dev-noise allowlist',
      evidence: quote(line, 160),
    });
    break; // one representative finding — avoid log spam
  }

  // blueprint_course_map_repaired: raw mass-fill of all LO fields = P1.
  const repairMatch = /blueprint_course_map_repaired[^\n]*?"repairedFieldCount":\s*(\d+)/.exec(log);
  if (repairMatch) {
    const count = Number(repairMatch[1]);
    const formattingOnly = /\(formatting\)/i.test(log);
    if (count >= 10 && !formattingOnly) {
      findings.add({
        severity: 'P1',
        dimension: 'honesty',
        file: 'console',
        detail: `course-map repair filled ${count} fields with no "(formatting)" justification (mass LO-field fill)`,
        evidence: quote(repairMatch[0], 160),
      });
    }
  }
}

function firstNumber(text, regex) {
  const match = regex.exec(String(text || ''));
  return match ? Number(match[1]) : null;
}

// CITATIONS — blacklist offenders, relevance heuristic, hygiene.
const KNOWN_OFFENDER_TITLES = [
  'MNIST',
  'Gradient-Based Learning Applied to Document Recognition',
  'Global cancer statistics',
  'QUANTUM ESPRESSO',
  'PRISMA',
  'R: A Language',
  'SHELX',
  'Lowry',
  'protein measurement',
  'xgboost',
  'XGBoost',
  'ImageJ',
  'FSL',
  'Pascal VOC',
  'IoT vision',
  'gradient boosting',
  'data clustering',
  'NIA-AA',
  'Alzheimer',
  'hypertension guidelines',
  'CES-D',
];

// Off-discipline subject markers: strong signals that a reading belongs to a
// DIFFERENT field (medicine / clinical methods / business-marketing / applied
// linguistics / disability studies). When one of these heads a student reading
// slot it is off-topic for a humanities or STEM-foundations course REGARDLESS
// of an incidental keyword overlap with the lesson title — the v0.14 finding's
// real shape ("Knowledge translation of research findings" pinned to a literary
// translation week shares "translation" yet is an implementation-science paper).
// Gated by the course's own discipline (see markerAppliesToCourse) so a
// medical/business course never trips on its own subject matter.
const OFF_DISCIPLINE_SUBJECT_MARKERS = [
  { re: /\bcardiovascular\b/i, domain: 'medicine' },
  { re: /\bdiabetes\b/i, domain: 'medicine' },
  { re: /\bprevalence\b/i, domain: 'medicine' },
  { re: /\bepidemiolog/i, domain: 'medicine' },
  { re: /\bcomorbid/i, domain: 'medicine' },
  { re: /\bautism\b/i, domain: 'disability' },
  { re: /\bintellectual disabilit/i, domain: 'disability' },
  { re: /\bspectrum disorder\b/i, domain: 'disability' },
  { re: /\bdestination marketing\b/i, domain: 'business' },
  { re: /\bmarketing organi[sz]ations?\b/i, domain: 'business' },
  { re: /\bPICO\b/, domain: 'clinical-methods' },
  { re: /\bsystematic (?:literature )?review\b/i, domain: 'clinical-methods' },
  { re: /\bevidence search\b/i, domain: 'clinical-methods' },
  { re: /\bincidental vocabulary\b/i, domain: 'applied-linguistics' },
  { re: /\bvocabulary acquisition\b/i, domain: 'applied-linguistics' },
  { re: /\bknowledge translation\b/i, domain: 'implementation-science' },
  { re: /\bimplementation science\b/i, domain: 'implementation-science' },
];
// A marker's domain must not BE the course's discipline (so a nursing course's
// "cardiovascular" readings are not flagged as off-discipline).
const COURSE_DOMAIN_RE = {
  medicine:
    /\b(medicine|medical|nursing|health|clinical|pharmac|epidemiolog|public health|anatomy|physiology|pathology)\b/i,
  disability: /\b(disability|special education|special ed|inclusive education|rehabilitation)\b/i,
  business: /\b(business|marketing|management|commerce|tourism|hospitality|economics|finance)\b/i,
  'clinical-methods':
    /\b(evidence-based|systematic review|research methods|nursing|medicine|public health|epidemiolog)\b/i,
  'applied-linguistics': /\b(linguistics|second language acquisition|tesol|applied linguistics)\b/i,
  'implementation-science': /\b(implementation science|health services|public health|knowledge translation)\b/i,
};
function offDisciplineMarker(text, course) {
  const courseText = `${course?.title || ''} ${course?.id || ''}`;
  for (const marker of OFF_DISCIPLINE_SUBJECT_MARKERS) {
    if (!marker.re.test(text)) continue;
    const courseRe = COURSE_DOMAIN_RE[marker.domain];
    if (courseRe && courseRe.test(courseText)) continue; // the course IS that field
    return marker.domain;
  }
  return null;
}

function checkCitations(findings, { files }, course) {
  const citationFiles = files.filter((file) => ['syllabus', 'lessonPlans'].includes(file.featureId));
  const disciplineVocab = buildDisciplineVocab(course, files);
  const citationStrings = [];
  for (const file of citationFiles) {
    for (const cite of extractCitationStrings(file)) {
      citationStrings.push({ ...cite, path: file.path });
    }
  }

  // (a) known-offender blacklist exact hits → P0 each.
  for (const cite of citationStrings) {
    for (const offender of KNOWN_OFFENDER_TITLES) {
      if (cite.text.toLowerCase().includes(offender.toLowerCase())) {
        findings.add({
          severity: 'P0',
          dimension: 'citations',
          file: cite.path,
          detail: `known off-discipline citation offender "${offender}" attached to a reading slot`,
          evidence: cite.text,
        });
        break;
      }
    }
  }

  // (b) relevance heuristic. A citation is off-topic when it carries an
  // off-discipline subject marker (a wrong-field reading whose only tie to the
  // lesson is an incidental keyword), OR shares zero vocabulary with the broad
  // course discipline (lesson titles + course title + named primary works +
  // discipline probe vocab). Findings are deduped by citation text so a reading
  // listed in BOTH the syllabus and its lesson plan counts once. Exemptions:
  //   - the teaching-methods bibliography (retrieval practice, peer instruction,
  //     …) lesson plans legitimately cite in the instructor rationale;
  //   - course-named primary texts (e.g. "Sophocles, Antigone") — the works the
  //     course teaches, not relevance-checkable secondary readings.
  const seenRelevance = new Set();
  for (const cite of citationStrings) {
    if (KNOWN_OFFENDER_TITLES.some((offender) => cite.text.toLowerCase().includes(offender.toLowerCase()))) continue;
    if (isPedagogyCitation(cite.text)) continue;
    if (isPrimaryTextLine(cite.text, disciplineVocab)) continue;
    const dedupeKey = citationDedupeKey(cite.text);
    if (seenRelevance.has(dedupeKey)) continue;
    const cTokens = citationTokens(cite.text);
    if (cTokens.length === 0) continue;
    const marker = offDisciplineMarker(cite.text, course);
    if (marker) {
      seenRelevance.add(dedupeKey);
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: cite.path,
        detail: `off-discipline reading (${marker}) attached to a student reading slot`,
        evidence: cite.text,
      });
      continue;
    }
    if (!overlapsVocab(cTokens, disciplineVocab)) {
      seenRelevance.add(dedupeKey);
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: cite.path,
        detail: 'citation shares zero vocabulary with the course discipline (possible off-topic reading)',
        evidence: cite.text,
      });
    }
  }

  // (c) hygiene: no <i></i>, no ":reference §" shard keys, author lists >3 → et al.
  for (const cite of citationStrings) {
    if (/<\/?i>/i.test(cite.text)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: cite.path,
        detail: 'citation contains raw HTML italic tags',
        evidence: cite.text,
      });
    }
    if (/:reference\s*§/i.test(cite.text)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: cite.path,
        detail: 'citation renders a raw shard key (":reference §")',
        evidence: cite.text,
      });
    }
    const authorList = cite.text.split(/[.,]/).filter((part) => /[A-Z]\.\s?[A-Z]?[a-z]/.test(part));
    if (authorList.length > 3 && !/et al\.?/i.test(cite.text)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: cite.path,
        detail: 'author list of >3 names does not end in "et al."',
        evidence: cite.text,
      });
    }
  }
}

// The standard teaching-research bibliography compiled into lesson plans —
// retrieval practice, peer instruction, active learning, conceptual change.
// These are legitimately off-discipline (they are ABOUT teaching) and must
// not trip the topical-relevance gate, which targets student reading slots.
const PEDAGOGY_RE =
  /\b(retrieval practice|peer instruction|active learning|conceptual change|test-enhanced|formative (?:feedback|assessment)|cognitive load|spaced (?:practice|repetition)|self-explanation|worked example|metacognition|transfer of learning|deliberate practice|backward design|bloom['’]?s taxonomy)\b/i;
const PEDAGOGY_AUTHORS =
  /\b(Roediger|Karpicke|Mazur|Crouch|Freeman|Posner|Strike|Hewson|Gertzog|Adesope|Bjork|Dunlosky|Chi|Sweller|Hattie|Wiggins|McTighe|Ambrose|Brown,? Peter|Deslauriers|Muller|Bewes|Reimann|Kornell|Pashler|Rohrer)\b/;
function isPedagogyCitation(text) {
  return PEDAGOGY_RE.test(text) || PEDAGOGY_AUTHORS.test(text);
}

// Does a line PARSE as a scholarly/book citation? Only such lines are relevance-
// checked. This deliberately excludes the Sources & Licenses boilerplate header
// ("Open educational resources used in this course package…"), bare section
// headings ("PEER-REVIEWED READINGS (OPEN ACCESS)"), and orphan continuation
// fragments ("a model calculation. Open-access via <url>") — none of which are
// citations, all of which the Round-1 relevance heuristic wrongly flagged.
const CITATION_YEAR = /\((?:19|20)\d{2}[a-z]?\)/;
const CITATION_AUTHOR_HEAD =
  /(?:[A-ZÀ-Þ][\wÀ-ÿ’'-]+,\s+[A-ZÀ-Þ]\.|[A-ZÀ-Þ]\.\s*[A-ZÀ-Þ]?\.?\s+[A-ZÀ-Þ][\wÀ-ÿ’'-]+|[A-ZÀ-Þ][\wÀ-ÿ’'-]+\s+[A-ZÀ-Þ]\.\s|\bet al\.)/;
function isScholarlyCitationLine(line) {
  const text = String(line);
  const hasYear = CITATION_YEAR.test(text);
  const hasAuthorHead = CITATION_AUTHOR_HEAD.test(text);
  const hasIsbn = /\bISBN\b/i.test(text) || /openlibrary\.org/i.test(text);
  const hasDoi = /\bdoi\.org\b|\bdoi:\s*10\./i.test(text);
  const hasOpenAlex = /\bopenalex\b/i.test(text);
  // A real reference: an author head together with a publication year, or a
  // book with an ISBN/Open Library record, or a DOI/OpenAlex line with a year.
  if (hasAuthorHead && hasYear) return true;
  if (hasIsbn) return true;
  if ((hasDoi || hasOpenAlex) && hasYear) return true;
  // Raw shard-key leaks are a hygiene-only citation signal (checked separately).
  if (/:reference\s*§/i.test(text)) return true;
  return false;
}

// A course-named PRIMARY text (the work the course teaches), e.g. "Sophocles,
// Antigone", "Dante Alighieri, Inferno", "The Epic of Gilgamesh" — a line that
// names a work the course's own vocabulary references and carries NO publication
// year. These are not relevance-checkable secondary readings.
function isPrimaryTextLine(text, vocab) {
  if (CITATION_YEAR.test(text)) return false; // has a year → secondary citation
  const tokens = citationTokens(text);
  if (tokens.length === 0) return false;
  return overlapsVocab(tokens, vocab);
}

function citationDedupeKey(text) {
  // Collapse to the author+title core: drop the "Open-access via <url> …"
  // license tail and the per-lesson reading-list prefix so the same reading
  // listed in both the syllabus and a lesson plan dedupes to one finding.
  return String(text)
    .replace(/\bOpen-access via\b.*$/i, '')
    .replace(/^.*?;\s*(?=[A-ZÀ-Þ][\wÀ-ÿ’'-]+(?:,|\s+[A-ZÀ-Þ]))/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 90);
}

function extractCitationStrings(file) {
  const out = [];
  const seen = new Set();
  for (const line of file.paragraphs || []) {
    const trimmed = String(line).trim();
    if (trimmed.length < 16) continue;
    if (!isScholarlyCitationLine(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push({ text: quote(trimmed) });
  }
  return out;
}

// Tokenize a citation for relevance, splitting hyphenated compounds too so
// "geology-geobiology" contributes the discipline token "geology".
function citationTokens(text) {
  return contentTokens(String(text || '').replace(/[-–—/]/g, ' '));
}

// Overlap with discipline vocab, tolerating simple inflection via a shared
// 6-char prefix ("sediments" ↔ "sediment", "silicates" ↔ "silicate").
function overlapsVocab(tokens, vocab) {
  for (const token of tokens) {
    if (vocab.has(token)) return true;
    if (token.length >= 6) {
      const stem = token.slice(0, 6);
      for (const term of vocab) {
        if (term.length >= 6 && term.slice(0, 6) === stem) return true;
      }
    }
  }
  return false;
}

// Probe vocab is resolved at call time (GEOLOGY_VOCAB / WORLD_LIT_NAMES are
// declared later in the discipline-probe section) to avoid a TDZ reference.
function disciplineProbeVocab(probe) {
  if (probe === 'geology') return GEOLOGY_VOCAB;
  if (probe === 'world-lit') return WORLD_LIT_NAMES;
  return [];
}

function buildDisciplineVocab(course, files) {
  const vocab = new Set();
  const add = (text) => {
    for (const token of contentTokens(String(text || '').replace(/[-–—/]/g, ' '))) vocab.add(token);
  };
  add(course?.title || '');
  // Lesson titles from BOTH the document covers and the file paths (the path
  // carries the canonical "Lesson NN - <Title> - <Deliverable>" naming even
  // when a cover line is too long to infer).
  for (const file of files) {
    if (file.lessonNumber == null) continue;
    add(inferDocumentLessonTitle(file));
    add(lessonTitleFromPath(file.path));
  }
  // Course-map lesson titles.
  const xlsx = files.find((file) => file.featureId === 'courseMap' && file.kind === 'xlsx');
  if (xlsx) {
    for (const cell of (xlsx.cellTexts && xlsx.cellTexts.length ? xlsx.cellTexts : xlsx.cells) || []) {
      if (/Lesson\s+\d/i.test(cell)) add(cell);
    }
  }
  // Named primary texts: the reading-list context BEFORE the scholarly citation
  // year (e.g. "Sophocles, Antigone; Tragedy study notes" in a per-lesson
  // Readings line) names the works the course teaches.
  for (const file of files) {
    if (!['syllabus', 'lessonPlans'].includes(file.featureId)) continue;
    for (const para of file.paragraphs || []) {
      const yearAt = String(para).search(CITATION_YEAR);
      if (yearAt > 0) add(String(para).slice(0, yearAt));
    }
  }
  // Discipline probe vocabulary (mineral/rock terms, canonical author names …).
  for (const term of disciplineProbeVocab(inferDisciplineProbe(course))) add(term);
  return vocab;
}

function lessonTitleFromPath(relPath) {
  const match = /Lesson\s+\d{1,3}\s*-\s*(.+?)\s*-\s*[^/]+$/i.exec(
    String(relPath || '')
      .split('/')
      .pop() || '',
  );
  return match ? match[1] : '';
}

// SUBSTANCE — boilerplate ratio, meta-MCQ share, sample-answer engagement,
// kernel penetration.
const SUBSTANCE_BOILERPLATE_THRESHOLDS = {
  rubrics: { p1: 0.6, p0: 0.8 },
  courseFaq: { p1: 0.6, p0: 0.8 },
  discussions: { p1: 0.6, p0: 0.8 },
};

function checkSubstance(findings, { files }) {
  // (1) cross-lesson boilerplate ratio per deliverable type.
  for (const [featureId, thresholds] of Object.entries(SUBSTANCE_BOILERPLATE_THRESHOLDS)) {
    const lessonFiles = files.filter((file) => file.featureId === featureId && file.lessonNumber != null);
    if (lessonFiles.length < 3) continue;
    const ratio = boilerplateRatio(lessonFiles);
    if (ratio >= thresholds.p0) {
      findings.add({
        severity: 'P0',
        dimension: 'substance',
        file: featureId,
        detail: `${featureId}: ${(ratio * 100).toFixed(0)}% of lines are shared across ≥70% of lessons (mail-merge boilerplate)`,
        evidence: `ratio=${ratio.toFixed(2)} across ${lessonFiles.length} lessons`,
      });
    } else if (ratio >= thresholds.p1) {
      findings.add({
        severity: 'P1',
        dimension: 'substance',
        file: featureId,
        detail: `${featureId}: ${(ratio * 100).toFixed(0)}% of lines repeat across ≥70% of lessons (high boilerplate)`,
        evidence: `ratio=${ratio.toFixed(2)} across ${lessonFiles.length} lessons`,
      });
    }
  }

  // (2) meta-MCQ share in quiz banks.
  const quizFiles = files.filter((file) => file.featureId === 'quizBank');
  if (quizFiles.length > 0) {
    const allText = quizFiles.map((file) => file.text).join(' ');
    const stems = allText.match(/[^.?!]*\?/g) || [];
    if (stems.length >= 5) {
      const META_RE =
        /which (?:instructor|success criteri|of the following best describes the goal|learning objective)|recall the success criteri|the instructor['’]s question/i;
      const metaCount = stems.filter((stem) => META_RE.test(stem)).length;
      const share = metaCount / stems.length;
      if (share > 0.2) {
        const sample = stems.find((stem) => META_RE.test(stem)) || '';
        findings.add({
          severity: 'P1',
          dimension: 'substance',
          file: 'quizBank',
          detail: `${(share * 100).toFixed(0)}% of quiz stems are instructor-meta questions (>20% threshold)`,
          evidence: quote(sample),
        });
      }
    }
  }

  // (3) sample-answer engagement: Q4/Q6 answers sharing a content token with
  // their own stem's scenario.
  for (const file of quizFiles) {
    const engagement = sampleAnswerEngagement(file.text);
    if (engagement.pairs >= 3 && engagement.engagedRate < 0.5) {
      findings.add({
        severity: 'P1',
        dimension: 'substance',
        file: file.path,
        detail: `sample answers engage their own stem scenario only ${(engagement.engagedRate * 100).toFixed(0)}% of the time (<50%)`,
        evidence: quote(engagement.sample),
      });
    }
  }

  // (4) kernel penetration: study-guide key terms appearing in that lesson's
  // slides + quiz (<50% → P1).
  const studyFiles = files.filter((file) => file.featureId === 'studyGuides' && file.lessonNumber != null);
  for (const guide of studyFiles) {
    const keyTerms = extractKeyTerms(guide.text);
    if (keyTerms.length < 3) continue;
    const slide = files.find((file) => file.featureId === 'slideDecks' && file.lessonNumber === guide.lessonNumber);
    const quiz = files.find((file) => file.featureId === 'quizBank' && file.lessonNumber === guide.lessonNumber);
    const target = `${slide?.text || ''} ${quiz?.text || ''}`.toLowerCase();
    if (!target.trim()) continue;
    const hit = keyTerms.filter((term) => target.includes(term.toLowerCase())).length;
    const rate = hit / keyTerms.length;
    if (rate < 0.5) {
      findings.add({
        severity: 'P1',
        dimension: 'substance',
        file: guide.path,
        detail: `only ${(rate * 100).toFixed(0)}% of study-guide key terms appear in this lesson’s slides+quiz (<50% kernel penetration)`,
        evidence: keyTerms.slice(0, 5).join(', '),
      });
    }
  }
}

function normalizeLessonSpecificTokens(line) {
  return String(line)
    .replace(/\bWeek\s+\d+\b/gi, 'Week N')
    .replace(/\bLesson\s+\d+\b/gi, 'Lesson N')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function boilerplateRatio(lessonFiles) {
  const lineSets = lessonFiles.map((file) => {
    const set = new Set();
    for (const line of file.paragraphs || []) {
      const norm = normalizeLessonSpecificTokens(line);
      if (norm.length >= 16) set.add(norm);
    }
    return set;
  });
  const counts = new Map();
  for (const set of lineSets) {
    for (const line of set) counts.set(line, (counts.get(line) || 0) + 1);
  }
  const threshold = Math.ceil(lessonFiles.length * 0.7);
  const allLines = new Set();
  for (const set of lineSets) for (const line of set) allLines.add(line);
  if (allLines.size === 0) return 0;
  let repeated = 0;
  for (const [, count] of counts) if (count >= threshold) repeated += 1;
  return repeated / allLines.size;
}

function sampleAnswerEngagement(text) {
  // Find "Sample answer:"/"Answer:" segments and check token overlap with the
  // nearest preceding scenario/stem sentence.
  const segments = [
    ...text.matchAll(
      /((?:scenario|consider|suppose|imagine|given)[^.?!]{15,200}[.?!])([\s\S]{0,400}?(?:sample answer|answer)\s*:\s*([^.?!]{10,200}))/gi,
    ),
  ];
  let engaged = 0;
  let sample = '';
  for (const seg of segments) {
    const scenarioTokens = new Set(contentTokens(seg[1]));
    const answerTokens = contentTokens(seg[3]);
    const overlap = answerTokens.some((token) => scenarioTokens.has(token));
    if (overlap) engaged += 1;
    else if (!sample) sample = `${quote(seg[1], 80)} → ${quote(seg[3], 80)}`;
  }
  const pairs = segments.length;
  return { pairs, engagedRate: pairs > 0 ? engaged / pairs : 1, sample };
}

function extractKeyTerms(text) {
  // The study-guide docx renders a "KEY TERMS" two-column table: each row is
  // `<term> <definition>` and the definition re-states the term verbatim
  // ("sedimentary rocks using specimen evidence | sedimentary rocks using
  // specimen evidence names …"). The reliable signal is therefore the
  // immediately-repeated leading phrase of each row. Capture ONLY those —
  // heading words ("Quiz", "Example") never repeat, so they self-filter.
  const out = new Set();
  const region = /key terms?\s*[:\n ]([\s\S]{0,1500})/i.exec(text);
  if (!region) return [];
  const scope = region[1];
  for (const match of scope.matchAll(/\b([a-z][a-z]+(?:\s+[a-z][a-z]+){2,5})\b/gi)) {
    const phrase = match[1].trim();
    if (phrase.length < 12) continue;
    const after = scope.slice(match.index + phrase.length, match.index + phrase.length + 90);
    if (after.toLowerCase().includes(phrase.toLowerCase())) out.add(phrase.toLowerCase());
    if (out.size >= 10) break;
  }
  return [...out];
}

// DISCIPLINE PROBES — selected by course.id / inferred title.
const CJK_RE = /[一-鿿㐀-䶿]/;
const TONE_PINYIN_RE = /[a-zü]+[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;
const WORLD_LIT_NAMES = [
  'Homer',
  'Sophocles',
  'Euripides',
  'Aeschylus',
  'Virgil',
  'Ovid',
  'Dante',
  'Chaucer',
  'Shakespeare',
  'Cervantes',
  'Milton',
  'Molière',
  'Voltaire',
  'Goethe',
  'Austen',
  'Brontë',
  'Dickens',
  'Dostoevsky',
  'Tolstoy',
  'Chekhov',
  'Flaubert',
  'Baudelaire',
  'Whitman',
  'Dickinson',
  'Twain',
  'Melville',
  'Hawthorne',
  'Poe',
  'Kafka',
  'Joyce',
  'Woolf',
  'Eliot',
  'Proust',
  'Camus',
  'Borges',
  'García Márquez',
  'Marquez',
  'Neruda',
  'Achebe',
  'Soyinka',
  'Morrison',
  'Hurston',
  'Baldwin',
  'Murakami',
  'Tagore',
  'Rushdie',
  'Naipaul',
  'Walcott',
  'Coetzee',
  'Ibsen',
  'Beckett',
  'Brecht',
  'Lu Xun',
  'Cao Xueqin',
  'Basho',
  'Rumi',
  'Hafiz',
  'Confucius',
  'Sappho',
  'Pushkin',
];
const GEOLOGY_VOCAB = [
  'mineral',
  'rock',
  'igneous',
  'sedimentary',
  'metamorphic',
  'quartz',
  'feldspar',
  'basalt',
  'granite',
  'limestone',
  'plate',
  'tectonic',
  'fault',
  'fold',
  'magma',
  'lava',
  'volcano',
  'volcanic',
  'earthquake',
  'seismic',
  'erosion',
  'weathering',
  'strata',
  'sediment',
  'crystal',
  'silicate',
  'porosity',
  'permeability',
  'fossil',
  'stratigraphy',
  'subduction',
  'crust',
  'mantle',
  'deposition',
  'outcrop',
  'cleavage',
  'streak',
  'hardness',
  'unconformity',
  'deformation',
];

function inferDisciplineProbe(course) {
  const text = `${course?.id || ''} ${course?.title || ''}`.toLowerCase();
  if (/mandarin|chinese/.test(text) || course?.id === 'mandarin') return 'mandarin';
  if (/computer science|\bcs\b|python|programming/.test(text) || course?.id === 'cs') return 'cs';
  if (/world lit|literature|literary/.test(text) || course?.id === 'world-lit') return 'world-lit';
  if (/geolog|earth science|mineral/.test(text) || course?.id === 'geology') return 'geology';
  return null;
}

function checkDiscipline(findings, { files }, course) {
  const probe = inferDisciplineProbe(course);
  if (!probe) return;
  const lessonFiles = files.filter(
    (file) => ['lessonPlans', 'slideDecks'].includes(file.featureId) && file.lessonNumber != null,
  );
  const lessonCount = new Set(lessonFiles.map((file) => file.lessonNumber)).size || 1;

  if (probe === 'mandarin') {
    let cjk = 0;
    let pinyin = 0;
    for (const file of lessonFiles) {
      cjk += (file.text.match(/[一-鿿㐀-䶿]/g) || []).length;
      pinyin += (file.text.match(/[a-zü]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/gi) || []).length;
    }
    const perLesson = (cjk + pinyin) / lessonCount;
    if (perLesson < 5) {
      const sample =
        lessonFiles.map((file) => file.text).find((text) => CJK_RE.test(text) || TONE_PINYIN_RE.test(text)) || '(none)';
      findings.add({
        severity: 'P0',
        dimension: 'discipline',
        file: 'lessonPlans + slideDecks',
        detail: `Mandarin course averages ${perLesson.toFixed(1)} CJK/pinyin tokens per lesson (<5) — the language is missing from its own materials`,
        evidence: quote(sample),
      });
    }
    // hanzi+pinyin pairing in study-guide tables.
    const guides = files.filter((file) => file.featureId === 'studyGuides');
    const anyPairing = guides.some((guide) => CJK_RE.test(guide.text) && TONE_PINYIN_RE.test(guide.text));
    if (guides.length > 0 && !anyPairing) {
      findings.add({
        severity: 'P1',
        dimension: 'discipline',
        file: 'studyGuides',
        detail: 'no study guide pairs hanzi with tone-marked pinyin',
        evidence: quote(guides[0]?.text || '', 120),
      });
    }
  } else if (probe === 'cs') {
    const materialFiles = files.filter(
      (file) =>
        ['lessonPlans', 'slideDecks', 'studyGuides', 'assignments'].includes(file.featureId) &&
        file.lessonNumber != null,
    );
    const byLesson = new Map();
    for (const file of materialFiles) {
      if (!byLesson.has(file.lessonNumber)) byLesson.set(file.lessonNumber, '');
      byLesson.set(file.lessonNumber, `${byLesson.get(file.lessonNumber)} ${file.text}`);
    }
    const CODE_RE =
      /```|\b(def|for|while|if|elif|else|return|import|print|range|class|lambda|while|in)\s|=\s*\[|\bprint\s*\(/;
    let withCode = 0;
    for (const [, text] of byLesson) if (CODE_RE.test(text)) withCode += 1;
    const rate = byLesson.size > 0 ? withCode / byLesson.size : 0;
    if (byLesson.size >= 3 && rate < 0.6) {
      findings.add({
        severity: 'P1',
        dimension: 'discipline',
        file: 'lessonPlans + slideDecks',
        detail: `only ${(rate * 100).toFixed(0)}% of CS lessons contain code/python-shaped snippets (<60%)`,
        evidence: `${withCode}/${byLesson.size} lessons with code`,
      });
    }
  } else if (probe === 'world-lit') {
    const allText = files.map((file) => file.text).join(' ');
    const hits = WORLD_LIT_NAMES.filter((name) => allText.includes(name));
    if (hits.length === 0) {
      findings.add({
        severity: 'P0',
        dimension: 'discipline',
        file: 'package',
        detail: 'no canonical author or text name appears anywhere in the World Literature package (the v0.14 finding)',
        evidence: quote(allText, 160),
      });
    }
  } else if (probe === 'geology') {
    const allText = files
      .map((file) => file.text)
      .join(' ')
      .toLowerCase();
    const present = GEOLOGY_VOCAB.filter((term) => allText.includes(term));
    const density = present.length;
    if (density < 8) {
      findings.add({
        severity: density < 4 ? 'P0' : 'P1',
        dimension: 'discipline',
        file: 'package',
        detail: `geology term density is low (${density}/40 distinct mineral/rock/process terms present)`,
        evidence: present.slice(0, 10).join(', ') || '(none)',
      });
    }
    // last-two-lessons geology presence (Geo L13/L14 shipped with zero geology).
    const lessonNums = [
      ...new Set(files.filter((file) => file.lessonNumber != null).map((file) => file.lessonNumber)),
    ].sort((a, b) => a - b);
    for (const lessonNumber of lessonNums.slice(-2)) {
      const text = files
        .filter((file) => file.lessonNumber === lessonNumber)
        .map((file) => file.text)
        .join(' ')
        .toLowerCase();
      if (text && !GEOLOGY_VOCAB.some((term) => text.includes(term))) {
        findings.add({
          severity: 'P1',
          dimension: 'discipline',
          file: `Lesson ${lessonNumber}`,
          detail: `Lesson ${lessonNumber} materials contain zero geology vocabulary`,
          evidence: quote(text, 120),
        });
      }
    }
  }
}

// A bullet that ends mid-clause: the last word is a connective, preposition,
// article, subordinator, or auxiliary — the shape item 1.3's word-boundary cut
// left behind ("…the course pattern: run", "…checkpoint should point"). Two
// tiers keep this a TRUE-cut detector, not an awkward-phrasing detector:
//
//   FUNCTION_WORD_TAIL — words that can NEVER legitimately end a clause; a
//     trailing one is always a dangling cut.
//   BARE_VERB_TAIL — bare verbs that dangle only after a modal/auxiliary or an
//     action-introducing colon. These same words are common NOUNS ("shopping
//     list", "score tracker", "the point"), so a noun usage must NOT flag.
//
// Two complete-but-awkward shapes are explicitly exempted (FP, not a cut):
//   - operator enumerations "…combine tests with and or" (the product strips
//     the backticks around the `and`/`or` operators, leaving a real, complete
//     sentence);
//   - a tail that is a quoted operator/token "…with 'and' or 'or'".
const FUNCTION_WORD_TAIL = new Set([
  'and',
  'or',
  'but',
  'the',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'at',
  'as',
  'into',
  'that',
  'which',
  'who',
  'when',
  'while',
  'through',
  'over',
  'under',
  'between',
  'about',
  'against',
  'before',
  'after',
  'than',
  'then',
  'because',
  'should',
  'must',
  'can',
  'will',
  'may',
  'is',
  'are',
  'was',
  'were',
  'be',
]);
const BARE_VERB_TAIL = new Set([
  'run',
  'point',
  'asks',
  'move',
  'show',
  'name',
  'list',
  'use',
  'apply',
  'explain',
  'compare',
  'identify',
  'plan',
]);
const TAIL_AUXILIARIES = new Set(['should', 'must', 'can', 'will', 'may', 'to', 'would', 'could', 'might', 'shall']);
const TRAILING_OPERATOR_ENUM = /\b(?:and|or)(?:\s*[/&]\s*|\s+)(?:and|or)\s*$/i;
const QUOTED_OPERATOR_TAIL = /['`][^'`]{1,12}['`]\s*$/;
function endsMidClause(line) {
  const text = String(line);
  // Operator enumerations / quoted-operator tails are complete, not cuts.
  if (TRAILING_OPERATOR_ENUM.test(text) || QUOTED_OPERATOR_TAIL.test(text)) return false;
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const last = words[words.length - 1] || '';
  const prev = words[words.length - 2] || '';
  if (FUNCTION_WORD_TAIL.has(last)) return true;
  if (BARE_VERB_TAIL.has(last)) {
    // A bare verb is a real cut only when it dangles after a modal/auxiliary
    // ("should point") or a single bare verb introduced by a colon
    // ("pattern: run"). A noun usage ("shopping list", "score tracker") is
    // complete and must NOT flag.
    if (TAIL_AUXILIARIES.has(prev)) return true;
    if (/:\s+[a-z]+\s*$/.test(text)) return true;
    return false;
  }
  return false;
}

// The line/cell scan units for the FORMAT text-pattern dimension. Patterns are
// evaluated PER unit — never across a paragraph/cell join — so adjacent benign
// lines ("…two different variables" + "Variables and assignment") can't fabricate
// a fused-title/echo-chain match that spans the boundary (the Round-1 FP class).
function formatScanUnits(file) {
  const units = [];
  const push = (raw) => {
    const value = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (value) units.push(value);
  };
  if (file.kind === 'xlsx') {
    for (const cell of file.cellTexts || []) for (const sub of String(cell).split('\n')) push(sub);
  } else {
    for (const para of file.paragraphs || []) push(para);
  }
  return units;
}

// FORMAT — every artifactDefectPatterns check across text + raw XML.
function checkFormat(findings, { files }) {
  const TEXT_TABLES = [
    ...ARTIFACT_PATTERNS,
    ...JSON_SYNTAX_PATTERNS,
    ...FUSED_TITLE_PATTERNS,
    ...INTERNAL_VOCAB_PATTERNS,
    ...BACKTICK_LEAK_PATTERNS,
  ];
  for (const file of files) {
    // FORMAT text patterns are scanned PER paragraph/cell line, never on the
    // flattened blob, so a regex can't span a line/paragraph/cell boundary
    // (the fused-title + echo-chain Round-1 FP class). Dedupe per pattern per
    // file to preserve the prior one-finding-per-pattern-per-file volume.
    const units = formatScanUnits(file);
    if (units.length) {
      const seen = new Set();
      const coverScope = SHOULD_BE_LESSON_ROOTED.includes(file.featureId);
      for (const unit of units) {
        for (const hit of scanText(TEXT_TABLES, unit)) {
          if (seen.has(hit.name)) continue;
          seen.add(hit.name);
          findings.add({
            severity: hit.severity,
            dimension: 'format',
            file: file.path,
            detail: `${hit.label} (roadmap ${hit.roadmap})`,
            evidence: hit.match,
          });
        }
        if (coverScope) {
          // "N sections" cover meta only on lesson-rooted features.
          for (const hit of scanText(COVER_META_PATTERNS, unit)) {
            if (seen.has(hit.name)) continue;
            seen.add(hit.name);
            findings.add({
              severity: hit.severity,
              dimension: 'format',
              file: file.path,
              detail: `${hit.label} (roadmap ${hit.roadmap})`,
              evidence: hit.match,
            });
          }
        }
      }
    }
    // eastAsia font override on raw XML.
    const ea = (file.rawXml || '').match(EAST_ASIA_OVERRIDE_PATTERN);
    if (ea) {
      findings.add({
        severity: 'P1',
        dimension: 'format',
        file: file.path,
        detail: 'eastAsia font override pinned to a non-CJK body font (CJK tofu risk, roadmap 1.13)',
        evidence: ea[0],
      });
    }
    // truncated bullets on slide decks (with title exemption). The armed
    // isTruncatedBulletLine heuristic (>=60 chars ending in a bare lowercase
    // word) over-fires on the v0.14.1 compiler's legitimately-unpunctuated
    // complete instructional cues ("Model the evidence decision for Quiz:
    // minerals problems"). A live grader narrows to a TRUE truncation: the
    // bullet ends mid-clause — on a connective, preposition, article, or
    // auxiliary verb — which is the dangling-word shape item 1.3 left behind
    // ("…the course pattern: run", "…checkpoint should point").
    if (file.featureId === 'slideDecks') {
      const titleSet = new Set((file.slides || []).map((slide) => (slide.title || '').replace(/\s+/g, ' ').trim()));
      for (const line of file.paragraphs || []) {
        if (titleSet.has(line)) continue;
        if (isTruncatedBulletLine(line) && endsMidClause(line)) {
          findings.add({
            severity: 'P1',
            dimension: 'format',
            file: file.path,
            detail: 'truncated slide bullet ending mid-clause without terminal punctuation (roadmap 1.3)',
            evidence: quote(`…${line.slice(-90)}`),
          });
          break; // one per deck
        }
      }
      // duplicate slide titles within a deck.
      const titles = (file.slides || [])
        .map((slide) => (slide.title || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const dupes = titles.filter((title, index) => titles.indexOf(title) !== index);
      if (dupes.length > 0) {
        findings.add({
          severity: 'P2',
          dimension: 'format',
          file: file.path,
          detail: 'duplicate slide titles within one deck (roadmap 5.2)',
          evidence: quote([...new Set(dupes)].join(', ')),
        });
      }
    }
    // empty table cells in xlsx/docx (a:tc/w:tc with no text).
    const emptyCells = (file.rawXml || '').match(/<(?:a|w):tc[^>]*>\s*<\/(?:a|w):tc>/g);
    if (emptyCells && emptyCells.length >= 2) {
      findings.add({
        severity: 'P2',
        dimension: 'format',
        file: file.path,
        detail: `${emptyCells.length} empty table cells (roadmap 5.2)`,
        evidence: quote(emptyCells[0]),
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

export async function grade({ extractedDir, consoleLogText = '', digest = null, course = {} } = {}) {
  const pkg = await extractPackage(extractedDir);
  const findings = createFindings();

  checkStructure(findings, pkg, course);
  checkIdentity(findings, pkg, course);
  checkConsistency(findings, pkg);
  checkHonesty(findings, pkg, consoleLogText, digest);
  checkCitations(findings, pkg, course);
  checkSubstance(findings, pkg);
  checkDiscipline(findings, pkg, course);
  checkFormat(findings, pkg);

  // Score each dimension.
  const scores = {};
  const grades = {};
  for (const dimension of DIMENSIONS) {
    let score = 100;
    for (const finding of findings.list) {
      if (finding.dimension === dimension) score -= SEVERITY_PENALTY[finding.severity] || 0;
    }
    score = Math.max(0, Math.round(score));
    scores[dimension] = score;
    grades[dimension] = letterGrade(score);
  }

  const totalWeight = Object.values(DIMENSION_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const weighted =
    DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension] * DIMENSION_WEIGHTS[dimension], 0) / totalWeight;
  const overallScore = Math.round(weighted);

  const stats = {
    fileCount: pkg.files.length,
    findingCount: findings.list.length,
    p0: findings.list.filter((finding) => finding.severity === 'P0').length,
    p1: findings.list.filter((finding) => finding.severity === 'P1').length,
    p2: findings.list.filter((finding) => finding.severity === 'P2').length,
    byDimension: Object.fromEntries(
      DIMENSIONS.map((dimension) => [
        dimension,
        findings.list.filter((finding) => finding.dimension === dimension).length,
      ]),
    ),
    hasManifest: Boolean(pkg.manifest),
    registryCount: Array.isArray(pkg.manifest?.assessments) ? pkg.manifest.assessments.length : 0,
  };

  return {
    scores,
    grades,
    overall: { score: overallScore, grade: letterGrade(overallScore) },
    findings: findings.list,
    stats,
  };
}

export function renderReportMarkdown(result, { courseTitle = 'Course', baselineResult = null } = {}) {
  if (!result) return '';
  const lines = [];
  lines.push(`# Crucible Deep Quality Report — ${courseTitle}`);
  lines.push('');
  lines.push(
    `**Overall: ${result.overall.score}/100 (${result.overall.grade})** · ${result.stats.findingCount} findings (${result.stats.p0} P0 · ${result.stats.p1} P1 · ${result.stats.p2} P2) · ${result.stats.fileCount} files`,
  );
  lines.push('');

  // Score table (with baseline delta when given).
  const hasBaseline = Boolean(baselineResult);
  lines.push(`## Scores`);
  lines.push('');
  lines.push(
    hasBaseline ? '| Dimension | Weight | Score | Grade | Δ baseline |' : '| Dimension | Weight | Score | Grade |',
  );
  lines.push(hasBaseline ? '| --- | ---: | ---: | :---: | ---: |' : '| --- | ---: | ---: | :---: |');
  for (const dimension of DIMENSIONS) {
    const score = result.scores[dimension];
    const grade = result.grades[dimension];
    if (hasBaseline) {
      const delta = score - (baselineResult.scores?.[dimension] ?? score);
      const deltaText = delta === 0 ? '0' : delta > 0 ? `+${delta}` : `${delta}`;
      lines.push(`| ${dimension} | ${DIMENSION_WEIGHTS[dimension]} | ${score} | ${grade} | ${deltaText} |`);
    } else {
      lines.push(`| ${dimension} | ${DIMENSION_WEIGHTS[dimension]} | ${score} | ${grade} |`);
    }
  }
  if (hasBaseline) {
    const overallDelta = result.overall.score - (baselineResult.overall?.score ?? result.overall.score);
    lines.push(
      `| **overall** | ${Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0)} | **${result.overall.score}** | **${result.overall.grade}** | ${overallDelta >= 0 ? '+' : ''}${overallDelta} |`,
    );
  } else {
    lines.push(
      `| **overall** | ${Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0)} | **${result.overall.score}** | **${result.overall.grade}** | |`.replace(
        / \|$/,
        ' |',
      ),
    );
  }
  lines.push('');

  // Findings grouped by severity.
  lines.push(`## Findings`);
  lines.push('');
  for (const severity of ['P0', 'P1', 'P2']) {
    const group = result.findings.filter((finding) => finding.severity === severity);
    lines.push(`### ${severity} (${group.length})`);
    if (group.length === 0) {
      lines.push('');
      lines.push('_None._');
      lines.push('');
      continue;
    }
    for (const finding of group) {
      lines.push(`- **[${finding.dimension}] ${finding.detail}**`);
      lines.push(`  - file: \`${finding.file || '—'}\` · id: ${finding.id}`);
      if (finding.evidence) lines.push(`  - evidence: \`${finding.evidence.replace(/`/g, "'")}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}
