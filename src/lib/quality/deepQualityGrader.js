/**
 * deepQualityGrader.js — the GRADER half of the Crucible.
 *
 * Codifies the V0.14 four-course manual audit (the one that found 28 defect
 * classes) into an automated, evidence-quoting grader. Every live run the
 * Crucible driver performs is graded the way a senior auditor would write it:
 * a scored, dimension-weighted findings report with verbatim evidence quotes.
 * v0.14.1 fixed all 28 classes — this grader is the permanent regression net.
 *
 * Plain ESM. No vitest imports, no node builtins — importable from vitest
 * specs, from the node-side Crucible driver (scripts/crucible.mjs, via the
 * tests/lib shim), AND from the browser export flow (v0.14.3 WS-A: the
 * package grades itself at finalize). The public surface:
 *
 *   grade({ fileProvider, consoleLogText, digest, course, honesty })
 *     → { scores: { dimension: 0-100 }, grades: { dimension: 'A'..'F' },
 *         overall: { score, grade }, findings: [...], stats }
 *
 *   renderReportMarkdown(result, { courseTitle, baselineResult })
 *     → the human report (findings by severity, score table, baseline delta).
 *
 * v0.14.3 WS-A A1 — the FileProvider seam. File access goes through
 *   { list() → relative forward-slashed paths,
 *     readBinary(path) → Uint8Array/Buffer (may be async),
 *     readText(path) → string (may be async) }.
 * Node callers use createFsFileProvider(dir) (fsFileProvider.node.js —
 * imported ONLY by the tests/lib shim so no node:fs/node:path is reachable
 * from the browser entry); the browser uses createMemoryFileProvider over
 * the in-memory file map packageZipExporter assembles before zipping. The
 * legacy grade({ extractedDir, … }) signature keeps working through the
 * tests/lib/deepQualityGrader.js shim, which wires the fs provider in.
 *
 * The grader reads docx/pptx/xlsx as zips-of-XML (jszip), the same
 * extraction approach as tests/output-artifact-gate.test.js, plus raw
 * md/txt/json. It cross-checks the rendered text against:
 *   - PACKAGE_MANIFEST.json (registry, readiness, pipeline, files)
 *   - the digest JSON (runDigest [CM][DIGEST] shape)
 *   - the console log ([CM] lines: genome, judgment, enrichment,
 *     export_verify) — Crucible mode — OR the in-app honesty source built
 *     by honestyFromDigest(budget, digest) (same assertions, object source;
 *     the console-only checks are excluded and named in
 *     IN_APP_EXCLUDED_CHECKS).
 *
 * Self-audit exclusions (v0.14.3 A3): the grader never grades its own
 * outputs — QUALITY_REPORT.md is skipped during extraction and the
 * manifest's `quality` block is ignored by every manifest check (none read
 * it; the ordering contract is grade-without-quality → inject → zip).
 *
 * Dimensions & weights (each finding carries verbatim evidence ≤200 chars):
 *   identity 20, substance 20, citations 15, honesty 15, discipline 15,
 *   consistency 10, structure 10, format 5  (sum 110 → normalized).
 * Scoring: dimension starts at 100; P0 −25, P1 −8, P2 −3 (floor 0).
 * Overall = weighted mean. Letter bands match the manual audit's instincts:
 *   A ≥90, B ≥80, C ≥70, D ≥60, F <60.
 */

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
  matchesKnownOffender,
  findPromptArtifactContamination,
  isInstructionalDesignPackage,
  blacklistYieldsToTopicalOverlap as offenderYieldsToTopicalOverlap,
} from './artifactDefectPatterns.js';
// V0.14.7 WS-D D1 introduced the texture metric; v0.15.6 makes it score-bearing.
import { computeTexture, textureDocsFromFiles, buildTextureAdvisories, TEXTURE_VERSION } from './textureMetric.js';

// v0.14.3 WS-A A3: the grader version stamped into manifest.quality. Bump on
// any change to checks, weights, or severity penalties so a package's quality
// block names the exact grader that produced it.
// 1.1.0 — v0.14.5 WS-A (A5): named-reading penetration + provenance-order
// checks over the manifest readings registry.
// 1.2.0 — v0.14.5 WS-C (C3): native-visual bar over slide decks. ARMING
// RULE: the check fires only when a deck in the package declares the
// v0.14.5 visual layer — a 'cmViz'-prefixed shape name in its slide XML
// (the exporter stamps 'cmVizLayer' on every deck's first slide, and names
// every rendered visual cmVizHub/Spoke/Conn/Chart/Table/Matrix). Packages
// exported before the visual layer carry no marker and are never graded on
// visuals, so stored Crucible rounds stay quiet; armed packages take a P2
// per enriched deck (kernel-derived slides present) that renders zero
// native visuals.
// 1.3.0 — V0.14.7 WS-D (D1): 'texture' joined as an advisory dimension.
// 1.4.0 — v0.15.4: required-asset genre plausibility, generic lesson artifact
// leaks, and unevaluated knowledge-judgment honesty for structured STEM.
// 1.5.0 — v0.15.6: texture counts lightly, template-phrase repetition joins
// findings, and A&P required assets reject geology/chemistry field-lab nouns.
// 1.6.0 — v0.15.8: run-digest caveats (partial enrichment/template fallback
// and map-assessment artifact coverage) become scored package findings.
// 1.7.0 — v0.15.11: prompt artifact labels used as lesson concepts become
// scored package findings.
// 1.7.1 — v0.15.12: "worked examples" remains suspicious as a numbered
// lesson topic but no longer creates false positives as a supporting resource.
// 1.7.2 — v0.15.13: digest-only native authoring prose fallback becomes an
// honesty finding when the package manifest/report would otherwise look clean.
// 1.7.3 — v0.15.108: legitimate capstone-presentation course deliverables no
// longer trip the prompt-artifact detector; explicit final-capstone prompt
// labels remain guarded; raw PPTX visual-planning note labels are a direct P0.
export const GRADER_VERSION = '1.7.3';

// ── Dimension weights & letter bands (documented in the module header) ──────
// texture now has a small score-bearing weight. It should be able to pull a
// heavily templated package below 100/A without overpowering substantive gates.
export const DIMENSION_WEIGHTS = {
  identity: 20,
  substance: 20,
  citations: 15,
  honesty: 15,
  discipline: 15,
  consistency: 10,
  structure: 10,
  format: 5,
  texture: 10,
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

/**
 * v0.14.3 WS-A A1: extraction reads through a FileProvider —
 * { list(), readBinary(path), readText(path) } — so the same grader runs
 * over an unzipped directory tree (Node fs provider, Crucible path) and over
 * the in-memory file map the browser export flow assembles before zipping.
 */
export async function extractPackage(fileProvider) {
  if (!fileProvider || typeof fileProvider.list !== 'function') {
    throw new Error('extractPackage requires FileProvider.');
  }
  const files = [];
  let manifest = null;
  const requiredAssetsText = [];
  for (const rawPath of await fileProvider.list()) {
    const relPath = String(rawPath).replace(/\\/g, '/').replace(/^\/+/, '');
    const lower = relPath.toLowerCase();
    const top = relPath.split('/')[0];
    const featureId = FOLDER_FEATURE[top] || null;
    const lessonNumber = lessonNumberFromName(relPath);
    if (lower.endsWith('package_manifest.json')) {
      try {
        manifest = JSON.parse(await fileProvider.readText(rawPath));
      } catch {
        manifest = null;
      }
      continue;
    }
    // The package's own audit report is never graded (v0.14.3 A3): the report
    // quotes finding evidence verbatim (backticks, defect strings), so grading
    // it would feed the grader its own output.
    if (lower.endsWith('quality_report.md')) continue;
    if (lower.endsWith('.docx')) {
      const parsed = await extractDocx(await fileProvider.readBinary(rawPath));
      files.push({ path: relPath, top, kind: 'docx', featureId, lessonNumber, ...parsed });
    } else if (lower.endsWith('.pptx')) {
      const parsed = await extractPptx(await fileProvider.readBinary(rawPath));
      files.push({ path: relPath, top, kind: 'pptx', featureId, lessonNumber, ...parsed });
    } else if (lower.endsWith('.xlsx')) {
      const parsed = await extractXlsx(await fileProvider.readBinary(rawPath));
      files.push({ path: relPath, top, kind: 'xlsx', featureId, lessonNumber, ...parsed });
    } else if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      const text = await fileProvider.readText(rawPath);
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

function checkPromptArtifactContamination(findings, { files, manifest }, course) {
  if (isInstructionalDesignPackage(course, manifest)) return;
  const hits = [];
  for (const file of files) {
    const units = formatScanUnits(file);
    for (const unit of units) {
      const hit = findPromptArtifactContamination(unit);
      if (!hit) continue;
      hits.push({ file, ...hit });
      if (hits.length >= 80) break;
    }
    if (hits.length >= 80) break;
  }
  if (hits.length === 0) return;
  const evidenceHit = hits.find((entry) => entry.file.featureId === 'courseMap') || hits[0];
  const courseMapHitCount = hits.filter((entry) => entry.file.featureId === 'courseMap').length;
  const severe = courseMapHitCount >= 2 || hits.length >= 3;
  findings.add({
    severity: severe ? 'P0' : 'P1',
    dimension: 'substance',
    file: evidenceHit.file.path || 'package',
    detail: 'prompt artifact labels used as lesson concepts',
    evidence: evidenceHit.evidence,
  });
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
    const anatomyGenre = isAnatomyPhysiologyCourse(course, manifest);
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
    if (anatomyGenre && ANATOMY_WRONG_REQUIRED_ASSET_RE.test(md)) {
      const match =
        /(.{0,60}(?:rock|mineral|chemical samples?|streak plates?|hand lenses?|field notebook|field activities).{0,60})/i.exec(
          md,
        );
      findings.add({
        severity: 'P1',
        dimension: 'structure',
        file: requiredAsset.path,
        detail: 'Required Assets list cites geology/chemistry field-lab materials for an anatomy and physiology course',
        evidence: match ? match[1] : 'wrong-discipline lab asset noun',
      });
    }
    if (!isWetLabCourse(course, manifest) && WET_LAB_REQUIRED_ASSET_RE.test(md)) {
      const match =
        /(.{0,50}(?:specimen|sample kit|goggles|gloves|hand lenses?|streak plates?|field notebook|lab safety|bench|field activities).{0,50})/i.exec(
          md,
        );
      findings.add({
        severity: 'P1',
        dimension: 'structure',
        file: requiredAsset.path,
        detail: 'Required Assets list cites physical wet-lab materials for a non-wet-lab course',
        evidence: match ? match[1] : 'physical wet-lab asset noun',
      });
    }
  }
}

function isDataScienceCourse(course) {
  const text = `${course?.title || ''} ${course?.id || ''}`.toLowerCase();
  return /data science|machine learning|applied ml|\bstatistic|analytics|deep learning/.test(text);
}

function isWetLabCourse(course, manifest) {
  const text = `${course?.title || ''} ${course?.id || ''} ${manifest?.courseName || ''}`.toLowerCase();
  if (
    /\b(linear algebra|calculus|mathematics|computer science|python|statistics|data science|machine learning)\b/.test(
      text,
    )
  ) {
    return false;
  }
  return /\b(geology|chemistry|biology|microbiology|anatomy|physiology|wet lab|laboratory)\b/.test(text);
}

function isAnatomyPhysiologyCourse(course, manifest) {
  const text = `${course?.title || ''} ${course?.id || ''} ${manifest?.courseName || ''}`.toLowerCase();
  return /\b(?:anatomy|physiology|a&p|histology|integumentary|skeletal system|muscular system|nervous system|sensory physiology)\b/.test(
    text,
  );
}

const WET_LAB_REQUIRED_ASSET_RE =
  /\b(specimen|sample kit|rock, mineral|biological, or chemical samples|goggles|gloves|hand lenses?|streak plates?|field notebook|lab safety|bench|field activities)\b/i;
const ANATOMY_WRONG_REQUIRED_ASSET_RE =
  /\b(rock|mineral|chemical samples?|streak plates?|hand lenses?|field notebook|field activities)\b/i;

// IDENTITY — the assessment registry (v0.14.1 Phase 3).
function checkIdentity(findings, { files, manifest }, _course) {
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
  for (const file of files.filter((file) => file.featureId === 'assignments' && ['docx', 'text'].includes(file.kind))) {
    const wordCount = contentTokens(file.text).length;
    const isExplicitNoBriefNote = /No standalone assignment brief scheduled/i.test(file.text);
    if (!isExplicitNoBriefNote && wordCount < 35) {
      findings.add({
        severity: 'P1',
        dimension: 'substance',
        file: file.path,
        detail: 'assignment brief has no substantive student-facing body',
        evidence: quote(file.text, 160),
      });
    }
  }
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

// ── v0.14.5 WS-A (A5): the readings registry receipts ───────────────────────
// (1) Named-reading penetration: every manifest readings[] entry appears
//     VERBATIM (whitespace-normalized, case-insensitive — never shortened,
//     never fused) in its week's lesson plan AND in the syllabus schedule.
//     P1 per missing surface.
// (2) Provenance order: in a week's rendered materials, no retrieved-tier
//     item (an "Open-access via …" OpenAlex citation) lists ABOVE an
//     instructor-named reading. P1. Checked inside the lesson plan's
//     "Materials & Resources" block and inside each syllabus schedule row.
// Self-arming: the checks run whenever manifest.readings is populated; a
// course fixture with expectReadings: true additionally fails the round when
// the registry never materialized at all.

const READING_RETRIEVED_RE = /open-access via/i;
// Lesson-plan sub-headings that terminate the materials block (docxExporter
// rendering order: Materials & Resources → Assessments This Week → Session
// Outline → …).
const MATERIALS_BLOCK_END_RE =
  /^(assessments this week|session outline|worked example|observation protocol|key terms|formative check|homework|closing activity)$/i;

function normalizeReadingMatchText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function checkReadings(findings, { files, manifest }, course) {
  const readings = Array.isArray(manifest?.readings) ? manifest.readings : [];
  if (readings.length === 0) {
    if (course?.expectReadings) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: 'PACKAGE_MANIFEST.json',
        detail:
          'course names per-week readings (expectReadings) but the manifest carries no readings registry — extraction or inheritance dropped the instructor readings',
        evidence: 'manifest.readings missing or empty',
      });
    }
    return;
  }

  // Any extracted syllabus file qualifies (docx in production packages;
  // text fixtures in synthetic grader tests read identically).
  const syllabusFile = files.find((file) => file.featureId === 'syllabus');
  const lessonPlanFiles = files.filter((file) => file.featureId === 'lessonPlans');
  const syllabusText = syllabusFile ? normalizeReadingMatchText(syllabusFile.text) : '';

  // (1) Penetration — each registry title must reach both surfaces verbatim.
  for (const entry of readings) {
    const title = normalizeReadingMatchText(entry.title);
    if (!title) continue;
    const plan = lessonPlanFiles.find((file) => file.lessonNumber === entry.lesson);
    if (plan && !normalizeReadingMatchText(plan.text).includes(title)) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: plan.path,
        detail: `named reading ${entry.id || ''} "${entry.title}" (L${entry.lesson}) does not appear verbatim in its week's lesson plan materials`,
        evidence: entry.title,
      });
    }
    if (syllabusFile && !syllabusText.includes(title)) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: syllabusFile.path,
        detail: `named reading ${entry.id || ''} "${entry.title}" (L${entry.lesson}) does not appear verbatim in the syllabus schedule`,
        evidence: entry.title,
      });
    }
  }

  // (2) Provenance order — lesson-plan materials block.
  for (const plan of lessonPlanFiles) {
    const lessonTitles = readings
      .filter((entry) => entry.lesson === plan.lessonNumber)
      .map((entry) => normalizeReadingMatchText(entry.title))
      .filter(Boolean);
    if (lessonTitles.length === 0) continue;
    const lines = (plan.paragraphs || []).map((line) => normalizeReadingMatchText(line));
    const start = lines.findIndex((line) => line === 'materials & resources');
    if (start === -1) continue;
    let firstInstructor = -1;
    let firstRetrieved = -1;
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (MATERIALS_BLOCK_END_RE.test(line)) break;
      if (firstRetrieved === -1 && READING_RETRIEVED_RE.test(line)) firstRetrieved = index;
      if (firstInstructor === -1 && lessonTitles.some((title) => line.includes(title))) firstInstructor = index;
    }
    if (firstRetrieved !== -1 && firstInstructor !== -1 && firstRetrieved < firstInstructor) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: plan.path,
        detail: `provenance order violated in L${plan.lessonNumber} materials: a retrieved open reading lists above the instructor-named reading`,
        evidence: (plan.paragraphs || [])[firstRetrieved] || 'retrieved item listed first',
      });
    }
  }

  // (2b) Provenance order — syllabus schedule rows (one extracted line per
  // cell, so a retrieved citation and a registry title on the same line
  // belong to the same week's readings cell).
  if (syllabusFile) {
    for (const rawLine of syllabusFile.paragraphs || []) {
      const line = normalizeReadingMatchText(rawLine);
      const retrievedMatch = line.match(READING_RETRIEVED_RE);
      if (!retrievedMatch) continue;
      const retrievedIndex = line.search(READING_RETRIEVED_RE);
      for (const entry of readings) {
        const title = normalizeReadingMatchText(entry.title);
        if (!title) continue;
        const titleIndex = line.indexOf(title);
        if (titleIndex !== -1 && retrievedIndex < titleIndex) {
          findings.add({
            severity: 'P1',
            dimension: 'citations',
            file: syllabusFile.path,
            detail: `provenance order violated in the syllabus schedule: a retrieved open reading lists above instructor-named "${entry.title}"`,
            evidence: rawLine,
          });
          break;
        }
      }
    }
  }
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
function scopeConsoleLogToDigest(consoleLogText, digest) {
  const log = String(consoleLogText || '');
  const id = digest?.finishRunId || digest?.runId;
  if (!log || !id) return log;
  const at = log.lastIndexOf(String(id));
  const start = at >= 0 ? log.lastIndexOf('\n', at) + 1 : 0;
  return at >= 0 ? log.slice(start) : log;
}

function checkHonesty(findings, { manifest }, consoleLogText, digest) {
  const log = scopeConsoleLogToDigest(consoleLogText, digest);
  const digestPipeline = digest?.pipeline || {};

  // genomeLinker counts consistent across the three surfaces.
  const linkerLineCount = firstNumber(digestPipeline.genomeLinker || log, /([0-9]+)\s+genome\s*\+\s*[0-9]+\s+cached/i);
  const backboneLineCount = firstNumber(
    digestPipeline.knowledgeBackbone || log,
    /([0-9]+)\/[0-9]+\s+lessons genome-linked/i,
  );
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
    const fellBack =
      /fell back|fall back|template/i.test(enrichment) ||
      /partial enrichment/i.test(log) ||
      (digest?.gates?.flaggedChecks || []).some((check) => /partial enrichment/i.test(String(check?.message || '')));
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
  const judgmentInLog =
    digestPipeline.judgment || /Course judgment|prerequisite gap|no gaps across|not evaluated \(0 genome/i.test(log);
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

  addDigestCaveatFindings(findings, [digest?.pipeline?.nativeAuthoring].concat(digest?.gates?.flaggedChecks || []));

  // Unexplained console errors/warnings (allowlist dev noise).
  const ALLOWLIST =
    /DALL-E|GPT Image|Imagen|image generation|vite|HMR|sourcemap|Download the React DevTools|punycode|ExperimentalWarning|localstorage-file|chrome-extension:\/\/|runtime\.lastError|Error handling response: TypeError: Cannot read properties of undefined \(reading 'config'\)/i;
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

// ── In-app honesty source (v0.14.3 WS-A A2) ────────────────────────────────
// The browser finalize path has no console transcript; its honesty evidence
// is BETTER — the live budget/digest objects the console lines are printed
// from. honestyFromDigest maps them onto the same four assertions the
// Crucible's console scan makes: genome-count consistency, enrichment
// coverage, judgment presence, export-verify status. The two console-ONLY
// checks have no object-source equivalent and are excluded by name:
export const IN_APP_EXCLUDED_CHECKS = [
  {
    id: 'console-noise',
    dimension: 'honesty',
    detailPattern: /unexplained console error\/warning/i,
    reason: 'dev-noise scan reads the console transcript, which only the Crucible captures',
  },
  {
    id: 'mass-repair-fill',
    dimension: 'honesty',
    detailPattern: /course-map repair filled \d+ fields/i,
    reason: 'blueprint_course_map_repaired is a console-trace-only signal with no digest field',
  },
];

/**
 * Build the in-app honesty source from the live budget + run-digest objects.
 * Pass the result as grade({ honesty }) — the console-log scan is replaced by
 * these direct object assertions (same checks, same severities, same detail
 * wording prefixes; see IN_APP_EXCLUDED_CHECKS for the two console-only
 * checks that cannot run in-app).
 */
export function honestyFromDigest(budget = null, digest = null) {
  const pipeline = { ...(digest?.pipeline || {}), ...(budget?.pipeline || {}) };
  return {
    genomeLinker: String(pipeline.genomeLinker || ''),
    knowledgeBackbone: String(pipeline.knowledgeBackbone || ''),
    judgment: pipeline.judgment ? String(pipeline.judgment) : '',
    exportStatus: digest?.gates?.exportStatus ?? null,
    exportFailed: Number.isFinite(digest?.gates?.exportFailed) ? digest.gates.exportFailed : null,
    flaggedChecks: [pipeline.nativeAuthoring].concat(digest?.gates?.flaggedChecks || []),
  };
}

function parsePartialCoverage(message) {
  const match = /partial enrichment\s*\(\s*(\d+)\s*\/\s*(\d+)\s*\)/i.exec(String(message || ''));
  if (!match) return null;
  const enriched = Number(match[1]);
  const requested = Number(match[2]);
  if (!Number.isFinite(enriched) || !Number.isFinite(requested) || requested <= 0) return null;
  return { enriched, requested, missing: Math.max(0, requested - enriched), coverage: enriched / requested };
}

function addDigestCaveatFindings(findings, flaggedChecks = []) {
  const seen = new Set();
  for (const check of flaggedChecks || []) {
    const message = check?.message || check || '';
    if (/fell back to prose|nativeAuthoringFellBack|degenerate-skeleton|native authoring.*fell back/i.test(message)) {
      findings.add({
        severity: 'P2',
        dimension: 'honesty',
        detail: 'native fallback missing manifest',
        evidence: message,
      });
    }
    if (/compiled without enrichment|mail-merge risk/i.test(message)) {
      const key = 'compiled-without-enrichment';
      if (seen.has(key)) continue;
      seen.add(key);
      findings.add({
        severity: 'P1',
        dimension: 'substance',
        file: 'run digest',
        detail: 'deliverables compiled without enrichment, creating mail-merge content risk',
        evidence: message,
      });
      continue;
    }

    const partial = parsePartialCoverage(message);
    if (partial) {
      const key = `partial-enrichment:${partial.enriched}/${partial.requested}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.add({
        severity: partial.coverage < 0.85 || partial.missing >= 3 ? 'P1' : 'P2',
        dimension: 'substance',
        file: 'run digest',
        detail: `partial enrichment left ${partial.missing} of ${partial.requested} lesson${
          partial.requested === 1 ? '' : 's'
        } on template fallback`,
        evidence: message,
      });
      continue;
    }

    const uncoveredAssessments = /(\d+)\s+additional map assessments have no dedicated artifact/i.exec(message);
    if (uncoveredAssessments) {
      const key = 'additional-map-assessments';
      if (seen.has(key)) continue;
      seen.add(key);
      findings.add({
        severity: 'P2',
        dimension: 'identity',
        file: 'run digest',
        detail: `${uncoveredAssessments[1]} course-map assessment${
          uncoveredAssessments[1] === '1' ? '' : 's'
        } are only covered as in-class lesson-plan activities, not dedicated artifacts`,
        evidence: message,
      });
    }
  }
}

// HONESTY (in-app mode) — the same assertions as checkHonesty, sourced from
// budget/digest objects instead of console text.
function checkHonestyFromDigest(findings, { manifest }, honesty) {
  // genomeLinker counts consistent across the three surfaces (budget/digest
  // pipeline line, knowledge-backbone coverage line, manifest pipeline).
  const linkerCount = firstNumber(honesty.genomeLinker, /([0-9]+)\s+genome/i);
  const backboneCount = firstNumber(
    honesty.knowledgeBackbone || manifest?.pipeline?.knowledgeBackbone || '',
    /([0-9]+)\/[0-9]+\s+lessons genome-linked/i,
  );
  const manifestLinker = manifest?.pipeline?.genomeLinker || '';
  const manifestLinkerCount = firstNumber(manifestLinker, /([0-9]+)\s+genome/i);
  const seen = [linkerCount, backboneCount, manifestLinkerCount].filter((value) => value != null);
  if (seen.length >= 2 && new Set(seen).size > 1) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'digest + manifest',
      detail: `genome-linked count disagrees across surfaces (linker=${linkerCount}, backbone=${backboneCount}, manifest=${manifestLinkerCount})`,
      evidence: quote(manifestLinker || honesty.genomeLinker),
    });
  }

  // Enrichment: full coverage OR an explicit fallback warning must be present.
  const enrichment = String(manifest?.pipeline?.enrichment || '');
  const partial = /\(\s*(\d+)\s*\/\s*(\d+)/.exec(enrichment);
  if (partial && partial[1] !== partial[2]) {
    const fellBack =
      /fell back|fall back|template/i.test(enrichment) ||
      honesty.flaggedChecks.some((check) => /partial enrichment/i.test(String(check?.message || '')));
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
  if (!manifest?.pipeline?.judgment && !honesty.judgment) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'digest + manifest',
      detail: 'no judgment line in the manifest pipeline or the run digest (the v0.14 audit’s silent judgment layer)',
      evidence: quote(JSON.stringify(manifest?.pipeline || {}), 160),
    });
  }

  // export_verify passed with 0 failed.
  if (
    (Number.isFinite(honesty.exportFailed) && honesty.exportFailed > 0) ||
    String(honesty.exportStatus || '') === 'failed'
  ) {
    findings.add({
      severity: 'P0',
      dimension: 'honesty',
      file: 'digest',
      detail: `export verification reported failures (status=${honesty.exportStatus || '?'}, failed=${honesty.exportFailed ?? '?'})`,
      evidence: quote(JSON.stringify({ status: honesty.exportStatus, failed: honesty.exportFailed }), 160),
    });
  }

  addDigestCaveatFindings(findings, honesty.flaggedChecks || []);

  // Console-noise scan + mass-repair-fill scan: console-only, excluded here —
  // see IN_APP_EXCLUDED_CHECKS for the documented reasons.
}

// ── V0.14.3 WS-B2: the genome bar (honesty dimension) ───────────────────────
// Fires ONLY for courses that declare a genome expectation (course.expectGenome
// set in scripts/crucible/courses.mjs) AND are not strangers (probeProfile
// 'generic'). The judgment line is read from the manifest pipeline, then the
// console transcript (Crucible mode), then the in-app honesty source. Three
// checks:
//   (a) the shard exists but never linked: manifest.pipeline.genomeLinker
//       "N genome + M cached of L lessons" with N+M === 0 → P1 (resolver or
//       alias drift — the live genome path silently produced nothing).
//   (b) a genome-linked course must carry at least one cited study-guide key
//       term (a Source line) → P1 (the v0.14 displacement-bug regression net,
//       now live at breadth).
//   (c) a seeded-gap course (course.seededGap) must DIAGNOSE the gap: the
//       judgment line shows ≥1 prerequisite gap bridged AND some lesson plan
//       carries a prerequisite primer naming the missing concept → P1 if the
//       gap is silent.
function genomeLinkerCounts(manifest) {
  const line = String(manifest?.pipeline?.genomeLinker || '');
  const match = /([0-9]+)\s+genome\s*\+\s*([0-9]+)\s+cached\s+of\s+([0-9]+)\s+lessons/i.exec(line);
  if (!match) return null;
  return { genome: Number(match[1]), cached: Number(match[2]), lessons: Number(match[3]), line };
}

function judgmentLineFor({ manifest }, consoleLogText, honesty) {
  return [
    manifest?.pipeline?.judgment ? String(manifest.pipeline.judgment) : '',
    honesty?.judgment ? String(honesty.judgment) : '',
    String(consoleLogText || ''),
  ]
    .filter(Boolean)
    .join('\n');
}

function checkGenomeBar(findings, pkg, course, consoleLogText, honesty) {
  if (probesSuppressed(course)) return; // strangers: genome bar off
  if (!course?.expectGenome) return; // only genome-expecting courses
  const { manifest, files } = pkg;
  const counts = genomeLinkerCounts(manifest);

  // (a) shard exists but never linked.
  if (counts && counts.genome + counts.cached === 0) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'PACKAGE_MANIFEST.json',
      detail: `genome shard exists for discipline "${course.expectGenome}" but never linked (resolver or alias drift): ${counts.genome} genome + ${counts.cached} cached of ${counts.lessons} lessons`,
      evidence: quote(counts.line, 160),
    });
    // No point checking cited terms / the gap when nothing linked at all.
    return;
  }

  const linked = counts ? counts.genome + counts.cached : 0;

  // (b) genome-linked courses must carry ≥1 cited study-guide key term — a
  // Source line in a study guide (the displacement-bug regression net).
  if (linked > 0) {
    const studyGuides = files.filter((file) => file.featureId === 'studyGuides');
    const hasCitedKeyTerm = studyGuides.some((guide) => /\bsource\b\s*[:—–-]/i.test(guide.text));
    if (studyGuides.length > 0 && !hasCitedKeyTerm) {
      findings.add({
        severity: 'P1',
        dimension: 'honesty',
        file: 'studyGuides',
        detail: `genome-linked course carries no cited (Source) key term in any study guide (the v0.14 displacement-bug regression net)`,
        evidence: quote(studyGuides[0]?.text || '', 160),
      });
    }
  }

  // (c) seeded-gap course: the seeded prerequisite issue must be DETECTED in
  // SOME category. v0.14's judgment classifies a prerequisite issue three ways,
  // and only one of them earns a cited primer:
  //   - a MISSING concept → bridgeable with a cited primer (count + a rendered
  //     primer in a lesson plan);
  //   - an OUT-OF-ORDER prerequisite (taught after the lesson that needs it) →
  //     detected and reported, but NOT primed (the concept IS in the course —
  //     it's a sequencing issue, so no external bridge is injected);
  //   - an ASSUMED-BACKGROUND prerequisite → detected, not primed.
  // The grader fires ONLY when judgment shows ZERO gaps of ANY kind despite the
  // seeded course (v0.14.3 econ FP-2: "0 prerequisite gaps · 2 out-of-order · 0
  // primers built" DETECTED the seeded elasticity/demand-curve issue as
  // out-of-order — the correct classification, which does not get a primer).
  if (course.seededGap) {
    const judgmentText = judgmentLineFor(pkg, consoleLogText, honesty);
    const countAfter = (re) => {
      const match = re.exec(judgmentText);
      return match ? Number(match[1]) : 0;
    };
    const bridgedGaps = countAfter(/([0-9]+)\s+bridgeable with cited primers/i);
    const assumedBackground = countAfter(/([0-9]+)\s+assumed background/i);
    const outOfOrder = countAfter(/([0-9]+)\s+out-of-order/i);
    // Fallback when the rich parenthetical is absent: a bare "N prerequisite
    // gap(s)" with N≥1 still counts as a (bridged) gap detection.
    const prereqGaps = bridgedGaps || countAfter(/([1-9][0-9]*)\s+prerequisite gap/i);
    const concept = String(course.seededGap.missingConcept || '');

    // A bridged (missing-concept) gap additionally requires a rendered primer;
    // out-of-order / assumed-background detections stand on their own.
    let detected = outOfOrder >= 1 || assumedBackground >= 1;
    if (!detected && prereqGaps >= 1) {
      const lessonPlans = files.filter((file) => file.featureId === 'lessonPlans');
      const primerTokens = contentTokens(concept);
      const primerRendered = lessonPlans.some((plan) => {
        if (!/prerequisite/i.test(plan.text)) return false;
        const planText = plan.text.toLowerCase();
        return primerTokens.length > 0 && primerTokens.every((token) => planText.includes(token));
      });
      detected = primerRendered;
    }

    if (!detected) {
      findings.add({
        severity: 'P1',
        dimension: 'honesty',
        file: 'console + lessonPlans',
        detail: `seeded prerequisite gap not diagnosed: the judgment line reports zero prerequisite gaps, out-of-order prerequisites, or assumed-background concepts despite the seeded "${concept}" gap`,
        evidence: quote(judgmentText.match(/[^\n]*prerequisite[^\n]*/i)?.[0] || judgmentText, 160),
      });
    }
  }
}

function isStructuredStemCourse(course, manifest) {
  const text = `${course?.title || ''} ${course?.id || ''} ${manifest?.courseName || ''}`.toLowerCase();
  return /\b(linear algebra|calculus|mathematics|statistics|physics|chemistry|biology|geology|astronomy|computer science)\b/.test(
    text,
  );
}

function checkUnevaluatedCourseJudgment(findings, pkg, course, consoleLogText, honesty) {
  if (probesSuppressed(course) || course?.expectGenome) return;
  const counts = genomeLinkerCounts(pkg.manifest);
  if (!counts || counts.genome + counts.cached > 0 || !isStructuredStemCourse(course, pkg.manifest)) return;
  const judgment = judgmentLineFor(pkg, consoleLogText, honesty);
  if (!/not evaluated/i.test(judgment)) return;
  findings.add({
    severity: 'P2',
    dimension: 'honesty',
    file: 'PACKAGE_MANIFEST.json',
    detail: `course judgment was not evaluated because no lessons linked to the knowledge backbone (${counts.genome} genome + ${counts.cached} cached of ${counts.lessons} lessons)`,
    evidence: quote([counts.line, judgment].filter(Boolean).join(' | '), 160),
  });
}

// CITATIONS — blacklist offenders, relevance heuristic, hygiene.
// v0.14.3 round-2: the famous-offender list + matcher + yield rule are now
// single-sourced in artifactDefectPatterns.js (KNOWN_OFFENDER_CITATIONS /
// matchesKnownOffender / blacklistYieldsToTopicalOverlap) so the reading-list
// engine rejects these at attach time off the exact same data; the grader keeps
// its defense-in-depth check here.

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
// v0.14.3 (FP-3 discipline-breadth calibration): four disciplines legitimately
// cite the medical / clinical-methods literature even though they are not
// themselves medicine — biostatistics/epidemiology (stats) cite the medical
// studies they analyze (STROBE, observational-study reporting); clinical
// nutrition (nutrition) cites diet–disease trials (saturated-fat ↔
// cardiovascular/diabetes outcomes); nursing and clinical psychology cite
// medical evidence directly. For these probes a 'medicine' or 'clinical-methods'
// marker is ON-discipline and must not flag. cs/geo/lit/econ/astro keep the
// markers absolute (a medical paper there is genuinely off-topic).
const MEDICAL_MARKER_ALLOWED_PROBES = {
  stats: new Set(['medicine', 'clinical-methods']),
  nutrition: new Set(['medicine', 'clinical-methods']),
  nursing: new Set(['medicine', 'clinical-methods']),
  psych: new Set(['medicine', 'clinical-methods']),
};
function offDisciplineMarker(text, course) {
  const courseText = `${course?.title || ''} ${course?.id || ''}`;
  const probe = inferDisciplineProbe(course);
  const allowedDomains = MEDICAL_MARKER_ALLOWED_PROBES[probe];
  for (const marker of OFF_DISCIPLINE_SUBJECT_MARKERS) {
    if (!marker.re.test(text)) continue;
    if (allowedDomains && allowedDomains.has(marker.domain)) continue; // on-discipline for this probe
    const courseRe = COURSE_DOMAIN_RE[marker.domain];
    if (courseRe && courseRe.test(courseText)) continue; // the course IS that field
    return marker.domain;
  }
  return null;
}

// The citation TITLE tokens — the work's own title, with the author/year head,
// the "Open-access via <url> …" license tail, and the per-lesson reading
// prefix stripped, so overlap is measured against the paper title (not its
// author names or boilerplate). Mirrors citationDedupeKey's trimming.
function citationTitleTokens(text) {
  const core = String(text || '')
    .replace(/\bOpen-access via\b.*$/i, '')
    .replace(/\(open textbook[^)]*\)/gi, '')
    .replace(/\((?:19|20)\d{2}[a-z]?\)/g, '')
    .replace(/https?:\/\/\S+/g, '');
  return new Set(contentTokens(core.replace(/[-–—/]/g, ' ')));
}

// One concept-token Set per lesson, built from the lesson title (file path +
// inferred document title). Keyed by lesson number; a special '*' entry unions
// every lesson's concept tokens for syllabus citations (which carry no lesson
// number — a global reading legitimately belongs to one of the course's
// lessons).
function buildLessonConceptTokenSets(files) {
  const byLesson = new Map();
  const all = new Set();
  const addTo = (set, text) => {
    for (const token of contentTokens(String(text || '').replace(/[-–—/]/g, ' '))) {
      set.add(token);
      all.add(token);
    }
  };
  for (const file of files) {
    if (file.lessonNumber == null) continue;
    if (!byLesson.has(file.lessonNumber)) byLesson.set(file.lessonNumber, new Set());
    const set = byLesson.get(file.lessonNumber);
    addTo(set, lessonTitleFromPath(file.path));
    addTo(set, inferDocumentLessonTitle(file));
  }
  byLesson.set('*', all);
  return byLesson;
}

// The discipline's own NAME tokens — dropped from the offender yield rule so a
// stats reading sharing only "statistics"/"statistical" with a stats course, or
// a nursing reading sharing "nursing", does not rescue a famous offender on the
// field label alone. Derived from the inferred probe and the course title.
function disciplineNameTokens(course) {
  const probe = inferDisciplineProbe(course) || '';
  const seed = `${probe} ${course?.title || ''} ${course?.id || ''}`;
  return new Set(contentTokens(seed.replace(/[-–—/]/g, ' ')));
}

// A blacklisted-keyword citation is NOT an off-discipline offender when its
// title shares STRONG topical overlap with the lesson concept it's attached to:
// ≥2 distinct NON-GENERIC content tokens (generic research words and the
// discipline's own name are ignored — the shared yield rule lives in
// artifactDefectPatterns.js). For a lesson-plan citation the overlap is checked
// against that lesson's concept tokens; for a syllabus citation (no lesson
// number) it's checked against the union of all lesson concepts. ZERO topical
// overlap (the Mandarin/MNIST case, or the stats cancer-statistics case whose
// only tie is the generic "statistics") keeps the blacklist absolute.
function blacklistYieldsForCitation(cite, lessonConceptTokenSets, disciplineTokens) {
  const titleTokenSet = citationTitleTokens(cite.text);
  if (titleTokenSet.size === 0) return false;
  const lessonNumber = cite.sourceFile?.lessonNumber;
  const conceptSet =
    lessonNumber != null && lessonConceptTokenSets.has(lessonNumber)
      ? lessonConceptTokenSets.get(lessonNumber)
      : lessonConceptTokenSets.get('*');
  return offenderYieldsToTopicalOverlap(titleTokenSet, conceptSet, { disciplineNameTokens: disciplineTokens });
}

function checkCitations(findings, { files }, course) {
  const citationFiles = files.filter((file) => ['syllabus', 'lessonPlans'].includes(file.featureId));
  const disciplineVocab = buildDisciplineVocab(course, files);
  const citationStrings = [];
  for (const file of citationFiles) {
    for (const cite of extractCitationStrings(file)) {
      citationStrings.push({ ...cite, path: file.path, sourceFile: file });
    }
  }

  // Per-lesson concept-term token sets (from each lesson's title) — used to
  // decide whether a blacklisted-keyword citation actually belongs to the
  // lesson it's attached to (v0.14.3 FP-1: an immunology paper whose title is
  // "… innate immunity in Alzheimer's disease" is a REAL reading for the Week 8
  // "Innate versus Adaptive Immunity" lesson; the "Alzheimer" blacklist hit must
  // yield to that topical overlap, while the zero-overlap Mandarin/MNIST case
  // stays an absolute P0).
  const lessonConceptTokenSets = buildLessonConceptTokenSets(files);
  const courseDisciplineTokens = disciplineNameTokens(course);

  // (a) known-offender blacklist exact hits → P0 each, UNLESS the citation
  // title strongly overlaps the lesson concept it's attached to.
  for (const cite of citationStrings) {
    const offender = matchesKnownOffender(cite.text);
    if (offender) {
      if (blacklistYieldsForCitation(cite, lessonConceptTokenSets, courseDisciplineTokens)) continue;
      findings.add({
        severity: 'P0',
        dimension: 'citations',
        file: cite.path,
        detail: `known off-discipline citation offender "${offender}" attached to a reading slot`,
        evidence: cite.text,
      });
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
    if (matchesKnownOffender(cite.text)) continue;
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
  if (probe === 'econ') return ECON_VOCAB;
  if (probe === 'stats') return STATS_VOCAB;
  if (probe === 'psych') return PSYCH_VOCAB;
  if (probe === 'nursing') return NURSING_VOCAB;
  if (probe === 'nutrition') return NUTRITION_VOCAB;
  if (probe === 'astro') return ASTRO_VOCAB;
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
// kernel penetration, content-slide floor.
//
// v0.14.3 D4 threshold raises (measured 2026-06-11 on Crucible round
// round-2026-06-11T19-22-04-185Z, 10 reference courses). The depth-slice
// content (D1–D3) lifted the floor so far above the new bars that the
// roadmap's halfway rule never fired — no reference course measured inside
// the [new-bar, old-bar] danger band — so every raise lands at the ideal:
//   - boilerplate P1: 0.60 → 0.50. Measured max across rubrics/FAQ/discussions
//     was 4% (astro discussions); every course ≤ 4% << 50%.
//   - meta-MCQ share: 0.20 → 0.15. Measured 0% on all 10 courses.
//   - sample-answer engagement: 0.50 → 0.60. Measured 100% engaged on all 10.
//   - NEW content-slide floor: enriched decks average ≥ CONTENT_SLIDE_MIN.
//     Measured enriched-deck averages 11.8–13.6; min single deck 5.
const SUBSTANCE_BOILERPLATE_THRESHOLDS = {
  rubrics: { p1: 0.5, p0: 0.8 },
  courseFaq: { p1: 0.5, p0: 0.8 },
  discussions: { p1: 0.5, p0: 0.8 },
};
const META_MCQ_SHARE_LIMIT = 0.15; // v0.14.3 D4 (was 0.20)
const SAMPLE_ANSWER_ENGAGEMENT_FLOOR = 0.6; // v0.14.3 D4 (was 0.50)
// v0.14.3 D4: an enriched deck (carries a D1 kernel-derived slide) must average
// at least this many content-bearing slides — the regression net for the pre-D1
// "~3 content slides in a 12-slide frame" state. Measured 11.8–13.6 live; the
// bar sits well below the floor so the depth content and the bar move together.
const CONTENT_SLIDE_MIN = 5;

function checkSubstance(findings, { files }, course = {}) {
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
      if (share > META_MCQ_SHARE_LIMIT) {
        const sample = stems.find((stem) => META_RE.test(stem)) || '';
        findings.add({
          severity: 'P1',
          dimension: 'substance',
          file: 'quizBank',
          detail: `${(share * 100).toFixed(0)}% of quiz stems are instructor-meta questions (>${(META_MCQ_SHARE_LIMIT * 100).toFixed(0)}% threshold)`,
          evidence: quote(sample),
        });
      }
    }
  }

  // (3) sample-answer engagement: Q4/Q6 answers sharing a content token with
  // their own stem's scenario.
  for (const file of quizFiles) {
    const engagement = sampleAnswerEngagement(file.text);
    if (engagement.pairs >= 3 && engagement.engagedRate < SAMPLE_ANSWER_ENGAGEMENT_FLOOR) {
      findings.add({
        severity: 'P1',
        dimension: 'substance',
        file: file.path,
        detail: `sample answers engage their own stem scenario only ${(engagement.engagedRate * 100).toFixed(0)}% of the time (<${(SAMPLE_ANSWER_ENGAGEMENT_FLOOR * 100).toFixed(0)}%)`,
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

  // (5) v0.14.3 D4 content-slide floor: enriched decks must AVERAGE at least
  // CONTENT_SLIDE_MIN content-bearing slides. A deck is "enriched" when it
  // carries a D1 kernel-derived slide (the rendered "Common pitfalls …" /
  // "Worked example: …" titles); un-enriched/legacy decks are exempt (they
  // never claimed kernel depth). Content-bearing = the slide's title+body
  // carry ≥2 distinct discipline tokens — scaffold slides (agenda, readiness,
  // objectives) talk about the course process and rarely accumulate two.
  const enrichedDecks = files.filter(
    (file) => file.featureId === 'slideDecks' && file.kind === 'pptx' && deckCarriesKernelSlide(file),
  );
  if (enrichedDecks.length > 0) {
    const domainTokens = [...buildDisciplineVocab(course, files)];
    const counts = enrichedDecks
      .map((deck) => ({ deck, count: countContentBearingSlides(deck, domainTokens) }))
      .sort((a, b) => a.count - b.count);
    const avg = counts.reduce((sum, entry) => sum + entry.count, 0) / counts.length;
    if (avg < CONTENT_SLIDE_MIN) {
      const worst = counts[0];
      findings.add({
        severity: 'P1',
        dimension: 'substance',
        file: 'slideDecks',
        detail: `enriched decks average ${avg.toFixed(1)} content-bearing slides (<${CONTENT_SLIDE_MIN}) across ${enrichedDecks.length} deck(s) — the kernel paid for more than the decks show`,
        evidence: `${worst.deck.path}: ${worst.count} content slide(s)`,
      });
    }
  }
}

// v0.14.3 D4: a rendered deck carries a D1 depth slide (the "Common pitfalls …"
// misconception slide or the "Worked example: …" walkthrough). The pptx loses
// the blueprint's enrichmentSource, so the slide title is the durable signal.
function deckCarriesKernelSlide(deck) {
  return (deck.slides || []).some((slide) => /\bcommon pitfalls\b|\bworked example\b/i.test(slide.title || ''));
}

// v0.14.3 D4: port of the WS-D countContentSlides counter (tests/v0143-depth-
// slice.test.js) to the rendered pptx. The export has no per-bullet split, so
// title + on-slide text IS the slide body (speaker notes are not in slide.text).
function countContentBearingSlides(deck, domainTokens) {
  return (deck.slides || []).filter((slide) => {
    const body = `${slide.title || ''} ${slide.text || ''}`.toLowerCase();
    let hits = 0;
    for (const token of domainTokens) {
      if (token && body.includes(token)) hits += 1;
      if (hits >= 2) return true;
    }
    return false;
  }).length;
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

// ── V0.14.3 WS-B2(d): per-discipline vocab packs for the six genome courses ──
// ~40 distinctive terms each, generated from the shard concept terms + aliases
// at grader-authoring time (source: public/genome/<discipline>-intro.json) and
// hardcoded here so the grader stays self-contained (no shard fetch). Generic
// words (model, data, value, …) were dropped so the density probe stays a
// discipline signal, not a prose detector.

// Source: public/genome/econ-intro.json (16 kernels).
const ECON_VOCAB = [
  'elasticity',
  'demand',
  'supply',
  'equilibrium',
  'market',
  'wage-price',
  'spiral',
  'inflation',
  'consumer',
  'utility',
  'maximization',
  'budget',
  'constraint',
  'economic',
  'opportunity',
  'cost',
  'trade-off',
  'comparative',
  'advantage',
  'specialization',
  'externality',
  'spillover',
  'monopoly',
  'circular',
  'leakages',
  'injections',
  'capital',
  'accumulation',
  'depreciation',
  'proxy',
  'labor',
  'unemployment',
  'participation',
  'natural',
  'quasi-experiment',
  'gains',
  'substitutes',
  'marginal',
  'scarcity',
];
// Source: public/genome/stats-intro.json (5 kernels) + introductory-stats canon.
const STATS_VOCAB = [
  'sampling',
  'central',
  'limit',
  'theorem',
  'p-value',
  'statistical',
  'regression',
  'least-squares',
  'observational',
  'confounding',
  'spurious',
  'correlation',
  'causation',
  'provenance',
  'hypothesis',
  'significance',
  'inference',
  'confidence',
  'interval',
  'standard',
  'error',
  'population',
  'parameter',
  'estimate',
  'variance',
  'residual',
  'predictor',
  'outcome',
  'survey',
  'randomization',
  'treatment',
  'control',
  'sampling-frame',
  'statistic',
  'normal',
  'distribution',
  'probability',
  'histogram',
  'scatterplot',
];
// Source: public/genome/psych-intro.json (12 kernels).
const PSYCH_VOCAB = [
  'classical',
  'conditioning',
  'pavlovian',
  'respondent',
  'operant',
  'reinforcement',
  'punishment',
  'observational',
  'modeling',
  'vicarious',
  'memory',
  'encoding',
  'retrieval',
  'rehearsal',
  'short-term',
  'long-term',
  'episodic',
  'semantic',
  'procedural',
  'forgetting',
  'interference',
  'ebbinghaus',
  'piaget',
  'sensorimotor',
  'preoperational',
  'erikson',
  'psychosocial',
  'identity',
  'intelligence',
  'triarchic',
  'crystallized',
  'fluid',
  'intrinsic',
  'extrinsic',
  'motivation',
  'overjustification',
  'heuristics',
  'algorithms',
  'functional-fixedness',
  'mental-set',
];
// Source: public/genome/nursing-intro.json (13 kernels).
const NURSING_VOCAB = [
  'homeostasis',
  'feedback',
  'organ',
  'tissues',
  'blood',
  'plasma',
  'cardiac',
  'systole',
  'diastole',
  'stroke-volume',
  'pressure',
  'systolic',
  'diastolic',
  'vascular',
  'resistance',
  'respiration',
  'pulmonary',
  'alveolar',
  'diffusion',
  'fluid',
  'electrolyte',
  'intracellular',
  'extracellular',
  'innate',
  'adaptive',
  'immunity',
  'inflammation',
  'bacterial',
  'peptidoglycan',
  'gram',
  'viral',
  'replication',
  'antimicrobial',
  'antibiotic',
  'transmission',
  'reservoir',
  'infection',
  'physiology',
  'anatomy',
  'circulation',
];
// Source: public/genome/nutrition-intro.json (12 kernels).
const NUTRITION_VOCAB = [
  'nutrients',
  'macronutrients',
  'micronutrients',
  'carbohydrates',
  'sugars',
  'starches',
  'monosaccharides',
  'polysaccharides',
  'fiber',
  'soluble',
  'insoluble',
  'proteins',
  'amino',
  'acids',
  'peptide',
  'lipids',
  'saturated',
  'unsaturated',
  'triglycerides',
  'fatty',
  'vitamins',
  'fat-soluble',
  'water-soluble',
  'minerals',
  'calcium',
  'electrolyte',
  'hydration',
  'digestion',
  'absorption',
  'metabolism',
  'calories',
  'kcal',
  'basal',
  'myplate',
  'adequacy',
  'moderation',
  'nutrition',
  'macrominerals',
  'micronutrient',
  'energy',
];
// Source: public/genome/astro-intro.json (12 kernels).
const ASTRO_VOCAB = [
  'diurnal',
  'celestial',
  'sphere',
  'seasons',
  'axial',
  'tilt',
  'solstice',
  'equinox',
  'lunar',
  'phases',
  'kepler',
  'orbital',
  'harmonic',
  'electromagnetic',
  'spectrum',
  'wavelengths',
  'radiation',
  'spectral',
  'absorption',
  'emission',
  'spectroscopy',
  'spectra',
  'telescope',
  'aperture',
  'parallax',
  'parsec',
  'magnitude',
  'brightness',
  'nebula',
  'protoplanetary',
  'accretion',
  'hubble',
  'expanding',
  'recession',
  'planetary',
  'orbit',
  'luminosity',
  'constellation',
  'galaxy',
  'cosmology',
];

const ASTRO_OBSERVING_CONTAMINATION_TERMS = [
  { label: 'naked-eye observing', re: /\bnaked[-\s]?eye observing\b/i },
  { label: 'light-pollution estimate', re: /\blight[-\s]?pollution estimate\b/i },
  { label: 'limiting magnitude', re: /\blimiting magnitude\b/i },
  { label: 'sky conditions', re: /\bsky conditions\b/i },
  { label: 'telescope', re: /\btelescope\b/i },
  { label: 'Stellarium', re: /\bStellarium\b/i },
  { label: 'dark adaptation', re: /\bdark adaptation\b/i },
  { label: 'altitude-in-fists', re: /\bone fist at arm[’']s length\b/i },
];

function inferDisciplineProbe(course) {
  // A course's expectGenome discipline (set in courses.mjs) takes precedence so
  // the probe always matches the genome the round expects.
  const expected = String(course?.expectGenome || '').toLowerCase();
  const EXPECTED_PROBE = {
    econ: 'econ',
    stats: 'stats',
    psych: 'psych',
    nursing: 'nursing',
    nutrition: 'nutrition',
    astro: 'astro',
    geo: 'geology',
    cs: 'cs',
  };
  if (EXPECTED_PROBE[expected]) return EXPECTED_PROBE[expected];
  const text = `${course?.id || ''} ${course?.title || ''}`.toLowerCase();
  if (/mandarin|chinese/.test(text) || course?.id === 'mandarin') return 'mandarin';
  if (/computer science|\bcs\b|python|programming/.test(text) || course?.id === 'cs') return 'cs';
  if (/world lit|literature|literary/.test(text) || course?.id === 'world-lit') return 'world-lit';
  if (/geolog|earth science|mineral/.test(text) || course?.id === 'geology') return 'geology';
  if (/microeconomic|macroeconomic|\beconomics\b/.test(text) || course?.id === 'econ-intro') return 'econ';
  if (/statistic/.test(text) || course?.id === 'stats-intro') return 'stats';
  if (/psycholog/.test(text) || course?.id === 'psych-101') return 'psych';
  if (/nursing|nurse/.test(text) || course?.id === 'nursing-fundamentals') return 'nursing';
  if (/nutrition|dietetic/.test(text) || course?.id === 'nutrition-101') return 'nutrition';
  if (
    /astronom|astrophysic|cosmolog|celestial|telescope|night sky|planetary|galax/.test(text) ||
    course?.id === 'astro-101'
  )
    return 'astro';
  return null;
}

// V0.14.3 WS-B3: strangers (probeProfile 'generic') grade on generic
// dimensions only — the discipline probe and genome bar are suppressed so an
// unknown discipline can't be punished for failing assumptions it never made.
function probesSuppressed(course) {
  return String(course?.probeProfile || '').toLowerCase() === 'generic';
}

// V0.14.3 WS-B2: the six genome disciplines share a term-density probe — at
// least 8 distinct discipline terms must appear across the package (the same
// shape as the geology probe, generalized to the new vocab packs).
const GENOME_DENSITY_PROBES = {
  econ: ECON_VOCAB,
  stats: STATS_VOCAB,
  psych: PSYCH_VOCAB,
  nursing: NURSING_VOCAB,
  nutrition: NUTRITION_VOCAB,
  astro: ASTRO_VOCAB,
};

const HISTORY_FALLBACK_LANGUAGE_RE =
  /\b(?:observe, label, calculate, or decide|lab materials|discipline-specific tools|course task or example|course activities|evidence of learning)\b/gi;
const HISTORY_COURSE_RE =
  /\b(?:western civilization|world history|u\.?s\.? history|ancient|medieval|renaissance|reformation|civilization|mesopotamia|egypt|greece|rome|byzantine|islamic|crusade)\b/i;

function checkHistoryFallbackLanguage(findings, { files }, course) {
  const title = `${course?.id || ''} ${course?.title || ''}`.toLowerCase();
  if (!HISTORY_COURSE_RE.test(title)) return;
  const matches =
    files
      .flatMap((file) => [file.text, ...(file.cellTexts || file.cells || [])])
      .join('\n')
      .match(HISTORY_FALLBACK_LANGUAGE_RE) || [];
  if (matches.length < 3) return;
  findings.add({
    severity: 'P1',
    dimension: 'discipline',
    file: 'Course Map',
    detail: `generic history fallback appears ${matches.length} times`,
    evidence: quote(matches[0]),
  });
}

function quoteAroundMatch(text, regex, limit = 200) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = regex.exec(clean);
  if (!match) return quote(clean, limit);
  const start = Math.max(0, match.index - 80);
  return clean.slice(start, start + limit).trim();
}

function checkForeignDomainContamination(findings, { files }, probe) {
  if (probe === 'astro') return;
  for (const file of files.filter((entry) => entry.featureId && entry.text)) {
    const hits = ASTRO_OBSERVING_CONTAMINATION_TERMS.filter((term) => term.re.test(file.text));
    const headerHit = /\bOBSERVATION PROTOCOL THIS WEEK\b/i.test(file.text);
    if (hits.length < 2 && !(headerHit && hits.length >= 1)) continue;
    findings.add({
      severity: 'P0',
      dimension: 'discipline',
      file: file.path,
      detail: `foreign astronomy observation protocol appears in ${probe || 'a non-astronomy'} package (${hits
        .map((hit) => hit.label)
        .join(', ')})`,
      evidence: quoteAroundMatch(file.text, hits[0]?.re || /\bOBSERVATION PROTOCOL THIS WEEK\b/i),
    });
    return;
  }
}

function checkDiscipline(findings, { files }, course) {
  if (probesSuppressed(course)) return;
  const probe = inferDisciplineProbe(course);
  checkForeignDomainContamination(findings, { files }, probe);
  checkHistoryFallbackLanguage(findings, { files }, course);
  if (!probe) return;

  // The six new genome disciplines: a term-density probe over the whole
  // package (mirrors geology). Low density means the discipline's own
  // vocabulary is missing from its own materials.
  if (GENOME_DENSITY_PROBES[probe]) {
    const vocab = GENOME_DENSITY_PROBES[probe];
    const allText = files
      .map((file) => file.text)
      .join(' ')
      .toLowerCase()
      .replace(/[-–—/]/g, ' ');
    const present = vocab.filter((term) => {
      const needle = term.replace(/[-–—/]/g, ' ');
      return allText.includes(needle);
    });
    if (present.length < 8) {
      findings.add({
        severity: present.length < 4 ? 'P0' : 'P1',
        dimension: 'discipline',
        file: 'package',
        detail: `${probe} term density is low (${present.length}/${vocab.length} distinct discipline terms present)`,
        evidence: present.slice(0, 10).join(', ') || '(none)',
      });
    }
    return;
  }

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
// ── v0.14.5 WS-C (C3): the native-visual bar over slide decks ───────────────
// Enriched decks (those carrying kernel-derived slides) should render at
// least one native visual — a concept-map shape group, worked-example chart,
// evidence table, or decision matrix. ARMING RULE: pre-v0.14.5 packages
// rendered visuals as text only, so the check arms ONLY when some deck in
// the package declares the visual layer via a 'cmViz'-prefixed shape name
// (the exporter stamps 'cmVizLayer' on every deck's first slide). No marker
// anywhere → the package pre-dates the feature → not graded on visuals (the
// stored Crucible rounds stay quiet). P2 initially — calibration severity.
const VISUAL_LAYER_MARKER = /name="cmViz/;
const NATIVE_VISUAL_SHAPE = /name="cmViz(?:Hub|Spoke|Conn|Chart|Table|Matrix)/;
// Kernel-derived slide titles the compiler emits deterministically — the
// "enriched deck" signal readable from rendered XML alone.
const ENRICHED_DECK_TITLE_PATTERNS = [/^Worked example: /i, /^Common pitfalls in /i, /^How Experts Think/i];

const PACKAGE_TEMPLATE_PHRASES = [
  { label: '"Lesson N application check"', pattern: /\bLesson\s+\d+\s+application check\b/gi, threshold: 3 },
  { label: '"Week N covering"', pattern: /\bWeek\s+\d+\s+covering\b/gi, threshold: 6 },
  {
    label: '"Instructor notes and selected readings"',
    pattern: /\bInstructor notes and selected readings\b/gi,
    threshold: 4,
  },
  {
    label: '"Course LMS and standard document tools"',
    pattern: /\bCourse LMS and standard document tools\b/gi,
    threshold: 4,
  },
  {
    label: '"Build a working understanding"',
    pattern: /\bBuild a working understanding of\b/gi,
    threshold: 4,
  },
  { label: '"Short formative check covering"', pattern: /\bShort formative check covering\b/gi, threshold: 4 },
];

function checkDeckVisuals(findings, { files }) {
  const decks = files.filter((file) => file.featureId === 'slideDecks' && file.kind === 'pptx');
  if (!decks.some((deck) => VISUAL_LAYER_MARKER.test(deck.rawXml || ''))) return;
  for (const deck of decks) {
    const enrichedTitles = (deck.slides || [])
      .map((slide) => (slide.title || '').replace(/\s+/g, ' ').trim())
      .filter((title) => ENRICHED_DECK_TITLE_PATTERNS.some((pattern) => pattern.test(title)));
    if (enrichedTitles.length === 0) continue;
    if (NATIVE_VISUAL_SHAPE.test(deck.rawXml || '')) continue;
    findings.add({
      severity: 'P2',
      dimension: 'format',
      file: deck.path,
      detail:
        'enriched deck renders no native visual (concept-map shapes, worked-example chart, table, or matrix) despite carrying kernel-derived slides (roadmap WS-C C3)',
      evidence: quote(enrichedTitles.join('; ')),
    });
  }
}

function checkFormat(findings, { files }) {
  const TEXT_TABLES = [
    ...ARTIFACT_PATTERNS,
    ...JSON_SYNTAX_PATTERNS,
    ...FUSED_TITLE_PATTERNS,
    ...INTERNAL_VOCAB_PATTERNS,
    ...BACKTICK_LEAK_PATTERNS,
  ];
  for (const file of files) {
    const templateArtifact =
      /\b(this this lesson|this the lesson|the lesson criterion|(?:Proof-based problem set|Computational lab in Python):\s*(?:This|The)\s+lesson)\b/i.exec(
        file.text || '',
      );
    if (templateArtifact) {
      findings.add({
        severity: 'P1',
        dimension: 'format',
        file: file.path,
        detail: 'generic lesson placeholder leaked into student-facing artifact wording',
        evidence: templateArtifact[0],
      });
    }
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
  const packageText = files.map((file) => file.text || '').join('\n');
  for (const phrase of PACKAGE_TEMPLATE_PHRASES) {
    const matches = packageText.match(phrase.pattern) || [];
    if (matches.length > phrase.threshold) {
      findings.add({
        severity: 'P2',
        dimension: 'format',
        file: 'package',
        detail: `${phrase.label} repeats ${matches.length} times across exported artifacts`,
        evidence: matches[0],
      });
    }
  }
}

function checkTextureFindings(findings, texture) {
  if (!texture?.measured || !Number.isFinite(texture.score) || texture.score >= 90) return;
  const topEvidence = Array.isArray(texture.evidence) && texture.evidence.length > 0 ? texture.evidence[0] : null;
  findings.add({
    severity: 'P2',
    dimension: 'texture',
    file: topEvidence?.feature ? `${topEvidence.feature} artifacts` : 'package',
    detail: `Texture score ${texture.score}/100 indicates repeated prose patterns across deliverables`,
    evidence: topEvidence?.shingle || 'low texture score',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

export async function grade({
  extractedDir = null,
  fileProvider = null,
  consoleLogText = '',
  digest = null,
  course = {},
  honesty = null,
} = {}) {
  if (!fileProvider && extractedDir) {
    // The browser-safe core never touches node:fs. The tests/lib shim (and
    // through it the Crucible) wraps grade() to wire createFsFileProvider for
    // the legacy extractedDir signature.
    throw new Error('grade({ extractedDir }) needs shim or fileProvider.');
  }
  const pkg = await extractPackage(fileProvider);
  const findings = createFindings();

  checkStructure(findings, pkg, course);
  checkIdentity(findings, pkg, course);
  // v0.14.5 (A5): named-reading penetration + provenance order. Self-arming
  // on manifest.readings; expectReadings courses also fail on an absent
  // registry.
  checkReadings(findings, pkg, course);
  {
    const { checkSourceLedger, shouldCheckSourceLedger } = await import('./sourceLedgerQualityChecks.js');
    if (shouldCheckSourceLedger(pkg.manifest)) {
      checkSourceLedger(findings, pkg);
    }
  }
  checkConsistency(findings, pkg);
  // Honesty source: the Crucible passes console text; the in-app finalize
  // path passes honestyFromDigest(budget, digest) (v0.14.3 WS-A A2).
  if (honesty) checkHonestyFromDigest(findings, pkg, honesty);
  else checkHonesty(findings, pkg, consoleLogText, digest);
  // V0.14.3 WS-B2: the genome bar (genome-expecting courses only).
  checkGenomeBar(findings, pkg, course, consoleLogText, honesty);
  checkUnevaluatedCourseJudgment(findings, pkg, course, consoleLogText, honesty);
  checkCitations(findings, pkg, course);
  checkPromptArtifactContamination(findings, pkg, course);
  checkSubstance(findings, pkg, course);
  checkDiscipline(findings, pkg, course);
  checkFormat(findings, pkg);
  // v0.14.5 WS-C (C3): native-visual bar — self-arming on the cmViz marker,
  // silent for packages exported before the visual layer existed.
  checkDeckVisuals(findings, pkg);

  // V0.15.6 — texture is score-bearing. Known slot values (course title +
  // registry titles) are masked so slot variation alone earns no texture
  // credit; low texture also becomes a finding before dimension scoring.
  const textureSlotValues = [
    course?.title,
    ...(Array.isArray(pkg.manifest?.assessments) ? pkg.manifest.assessments.map((entry) => entry?.title) : []),
    ...(Array.isArray(pkg.manifest?.readings) ? pkg.manifest.readings.map((entry) => entry?.title) : []),
  ].filter(Boolean);
  const texture = computeTexture(textureDocsFromFiles(pkg.files), { slotValues: textureSlotValues });
  checkTextureFindings(findings, texture);

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
  // texture's score comes from the metric and contributes through its light
  // dimension weight; the finding above exists to make the report actionable.
  scores.texture = texture.score;
  grades.texture = letterGrade(texture.score);

  const totalWeight = Object.values(DIMENSION_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const weighted =
    DIMENSIONS.reduce((sum, dimension) => sum + scores[dimension] * DIMENSION_WEIGHTS[dimension], 0) / totalWeight;
  let overallScore = Math.round(weighted);

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
    // v0.14.5 (A5): the manifest readings registry size.
    readingsCount: Array.isArray(pkg.manifest?.readings) ? pkg.manifest.readings.length : 0,
  };
  // A package with any P0 is not A-quality, even if the weighted dimensions
  // remain numerically high. P0 means instructor handoff is unsafe.
  if (stats.p0 > 0) overallScore = Math.min(overallScore, 74);

  return {
    scores,
    grades,
    overall: { score: overallScore, grade: letterGrade(overallScore) },
    findings: findings.list,
    stats,
    // Texture block — sub-scores, worst repeated-shingle evidence, and
    // backwards-compatible advisories beside the score-bearing finding.
    texture: {
      version: TEXTURE_VERSION,
      score: texture.score,
      grade: grades.texture,
      measured: texture.measured,
      subScores: texture.subScores,
      evidence: texture.evidence,
      groups: texture.groups,
      advisories: buildTextureAdvisories(texture),
    },
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
