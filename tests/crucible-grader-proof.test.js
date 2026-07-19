/**
 * crucible-grader-proof.test.js — the offline proof for the Crucible GRADER.
 *
 * Builds a FULL real package zip through the actual exporters from a compiled
 * fixture course (the v0141-phase3 registry/links pattern), extracts it to a
 * temp dir, synthesizes a plausible console log + digest, and runs the deep
 * quality grader:
 *
 *   (a) a healthy v0.14.1-compiled package scores ≥85 overall with ZERO P0s;
 *   (b) deliberately seeded defects (week-label drift, MNIST citation,
 *       topicSection JSON fragment, stripped CJK on a mandarin-labeled
 *       fixture) each produce their exact P0 finding with evidence;
 *   (c) renderReportMarkdown produces parseable markdown with the scores table
 *       and findings.
 *
 * Fully offline, no network, no API keys. Runtime kept under ~60s by compiling
 * a small (3–4 lesson) course and reusing the extracted tree across the
 * healthy assertions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import {
  buildBlueprintFromGraph,
  deriveCourseGraphFromCourseMap,
  renderCourseMapFromGraph,
} from '../src/lib/courseGraph';
import { buildCourseMaterialsZip } from '../src/lib/packageZipExporter.js';
import { buildRunDigest, formatRunDigest } from '../src/lib/runDigest.js';
import { formatEnrichmentOutcomeLabel } from '../src/lib/apiCallBudget.js';
import { grade, renderReportMarkdown } from './lib/deepQualityGrader.js';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders.js';
import { ARTIFACT_PATTERNS, isTruncatedBulletLine } from '../src/lib/quality/artifactDefectPatterns.js';
import { buildJudgePrompt, truncateArtifactForJudge, JUDGE_TEXT_CHARS } from '../scripts/lib/crucibleRound.mjs';

// ── OffscreenCanvas stub for the pptx text-fit pass (node env) ──────────────
beforeAll(() => {
  const context = { font: '', measureText: (text) => ({ width: String(text || '').length * 7 }) };
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    getContext() {
      return context;
    }
  };
});

const GEO_FEATURES = ['syllabus', 'lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'quizBank', 'studyGuides'];

function geologyCourseMap() {
  const topics = [
    ['Minerals', 'mineral identification'],
    ['Igneous Rocks', 'igneous textures'],
    ['Sedimentary Rocks', 'sedimentary environments'],
    ['Metamorphic Rocks', 'metamorphic grade'],
  ];
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: topics.map(([title, concept], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `1. Build field-ready understanding of ${concept}.`,
          learningObjectives: `Analyze ${concept} using specimen evidence.\nEvaluate how ${concept} changes a field decision.`,
          weeklyAssessments: `Quiz: ${concept} problems`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${concept} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

// Build a full package zip through the real exporters and return the blob.
async function buildGeologyPackageZip() {
  const courseMap = geologyCourseMap();
  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, GEO_FEATURES);
  const displayMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });
  const deliverables = {};
  for (const featureId of GEO_FEATURES) {
    deliverables[featureId] = { status: 'done', data: compiled[featureId] };
  }
  const result = await buildCourseMaterialsZip({
    courseMap: displayMap,
    courseName: 'Physical Geology',
    deliverables,
    featureIds: ['courseMap', ...GEO_FEATURES],
    courseGraph: graph,
  });
  return result.blob;
}

async function extractZipToDir(blob, dir) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const dest = path.join(dir, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, await entry.async('nodebuffer'));
  }
}

// A realistic clean console log + digest for the healthy run.
function healthyConsoleLog() {
  const digest = buildRunDigest({
    budget: {
      runId: 'run-geo-1',
      usageLedger: [],
      pipeline: {
        courseMap: 'compiled',
        genomeLinker: '2 genome + 0 cached of 4 lessons (8 concepts, 6 citations, 1 bridges)',
        enrichmentModelStage: 'ran',
        judgment: 'no gaps across 8 linked concepts',
      },
    },
    exportVerification: { status: 'passed', checked: 12, failed: 0, warningCount: 0, checks: [] },
    finish: { finalStatus: 'ready', blockers: 0, warnings: 0, repairsApplied: 0, retryCallCount: 0 },
    generation: { provider: 'anthropic', lessonCount: 4, featureIds: GEO_FEATURES },
  });
  const enrichment = formatEnrichmentOutcomeLabel({
    modelStage: 'ran',
    enrichedLessons: 4,
    requestedLessons: 4,
    missingLessons: [],
  });
  return [
    formatRunDigest(digest),
    `[CM][API] genomeLink {"label":"CurriculumOS linker","detail":"2 genome + 0 cached of 4 lessons (8 concepts, 6 citations, 1 bridges)"}`,
    `[CM][API] pipelineDecision {"label":"Course judgment","detail":"no gaps across 8 linked concepts"}`,
    `[CM][FINISH][finish-x] export_verify_done {"checked":12,"failed":0}`,
    `2/4 lessons genome-linked · 6 cited open resources`,
    `enrichment: ${enrichment}`,
    `[CM][API] DALL-E generation failed: ignored dev noise`,
    `[vite] hmr update /src/App.jsx`,
    `console.warn [CM] LanguageTool check timed out`,
    `[CM][DIGEST] ${JSON.stringify(digest)}`,
  ].join('\n');
}

function healthyDigest() {
  return buildRunDigest({
    budget: { runId: 'run-geo-1', usageLedger: [], pipeline: { genomeLinker: '2 genome + 0 cached of 4 lessons' } },
    exportVerification: { status: 'passed', checked: 12, failed: 0, warningCount: 0, checks: [] },
    finish: { finalStatus: 'ready', blockers: 0, warnings: 0 },
    generation: { provider: 'anthropic', lessonCount: 4, featureIds: GEO_FEATURES },
  });
}

const GEO_COURSE = { id: 'geology', title: 'Physical Geology', featureIds: GEO_FEATURES };

let healthyDir;

describe('Crucible grader — healthy v0.14.1 package', () => {
  beforeAll(async () => {
    healthyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-healthy-'));
    await extractZipToDir(await buildGeologyPackageZip(), healthyDir);
  }, 120000);

  afterAll(() => {
    if (healthyDir) fs.rmSync(healthyDir, { recursive: true, force: true });
  });

  it('scores >= 85 overall with ZERO P0 findings', async () => {
    const result = await grade({
      extractedDir: healthyDir,
      consoleLogText: healthyConsoleLog(),
      digest: healthyDigest(),
      course: GEO_COURSE,
    });
    const p0s = result.findings.filter((finding) => finding.severity === 'P0');
    expect(p0s, p0s.map((finding) => `${finding.id} [${finding.dimension}] ${finding.detail}`).join('\n')).toEqual([]);
    expect(result.overall.score, JSON.stringify(result.scores)).toBeGreaterThanOrEqual(85);
    // Identity resolves: the registry is populated and every artifact exists.
    expect(result.stats.registryCount).toBeGreaterThan(0);
    expect(result.scores.identity).toBeGreaterThanOrEqual(85);
  }, 120000);

  it('renderReportMarkdown emits a parseable scores table and findings sections', async () => {
    const result = await grade({
      extractedDir: healthyDir,
      consoleLogText: healthyConsoleLog(),
      digest: healthyDigest(),
      course: GEO_COURSE,
    });
    const md = renderReportMarkdown(result, { courseTitle: 'Physical Geology' });
    expect(md).toContain('# Crucible Deep Quality Report — Physical Geology');
    expect(md).toContain('## Scores');
    expect(md).toContain('| Dimension | Weight | Score | Grade |');
    expect(md).toContain('| identity | 20 |');
    expect(md).toContain('| **overall** |');
    expect(md).toContain('### P0 (0)');
    expect(md).toContain('## Findings');

    // Baseline-delta column appears when a baseline is supplied.
    const baseline = {
      scores: { ...result.scores, identity: result.scores.identity - 10 },
      overall: { score: result.overall.score - 5 },
    };
    const mdDelta = renderReportMarkdown(result, { courseTitle: 'Physical Geology', baselineResult: baseline });
    expect(mdDelta).toContain('Δ baseline');
    expect(mdDelta).toMatch(/\| identity \| 20 \| \d+ \| [A-F] \| \+10 \|/);
  }, 120000);

  // v0.14.3 D4: the depth slice ships enriched decks (the D1 "Common pitfalls"
  // slide), so the new content-slide floor must (a) fire on these decks at all
  // and (b) find them well above the ≥5 average — no substance finding.
  it('D4 content-slide floor: enriched decks pass the ≥5 average with no substance finding', async () => {
    const result = await grade({
      extractedDir: healthyDir,
      consoleLogText: healthyConsoleLog(),
      digest: healthyDigest(),
      course: GEO_COURSE,
    });
    const contentSlideFindings = result.findings.filter(
      (f) => f.dimension === 'substance' && /content-bearing slides/i.test(f.detail),
    );
    expect(contentSlideFindings, JSON.stringify(contentSlideFindings)).toEqual([]);
  }, 120000);
});

describe('Crucible grader — seeded defects each produce their exact P0 finding', () => {
  // Each seed re-extracts a fresh package, mutates ONE file's rendered text,
  // and asserts the matching P0 with verbatim evidence.

  async function freshDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    await extractZipToDir(await buildGeologyPackageZip(), dir);
    return dir;
  }

  function findDocx(dir, folder) {
    const folderDir = path.join(dir, folder);
    const name = fs.readdirSync(folderDir).find((file) => file.endsWith('.docx'));
    return path.join(folderDir, name);
  }

  // Rewrite a docx's document.xml by injecting raw text into the first <w:t>.
  async function injectIntoDocx(docxPath, injected) {
    const buffer = fs.readFileSync(docxPath);
    const zip = await JSZip.loadAsync(buffer);
    let xml = await zip.file('word/document.xml').async('string');
    xml = xml.replace(/(<w:t(?:\s[^>]*)?>)/, `$1${injected} `);
    zip.file('word/document.xml', xml);
    fs.writeFileSync(docxPath, await zip.generateAsync({ type: 'nodebuffer' }));
  }

  it('week-label drift: "the Week 2 quiz" inside a Lesson 4 doc → consistency P0', async () => {
    const dir = await freshDir('crucible-week-');
    try {
      // Lesson 04 lesson-plan doc referencing the wrong week.
      const lessonPlansDir = path.join(dir, 'Lesson Plans');
      const lesson4 = fs.readdirSync(lessonPlansDir).find((file) => /Lesson 04/.test(file));
      await injectIntoDocx(
        path.join(lessonPlansDir, lesson4),
        'Submit the result before the Week 2 quiz to plan a revision.',
      );
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const finding = result.findings.find(
        (f) => f.severity === 'P0' && f.dimension === 'consistency' && /the Week 2 quiz/i.test(f.detail),
      );
      expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'consistency'))).toBeTruthy();
      expect(finding.evidence).toMatch(/the Week 2 quiz/i);
      expect(finding.file).toMatch(/Lesson 04/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('MNIST citation in a lesson plan → citations P0', async () => {
    const dir = await freshDir('crucible-mnist-');
    try {
      const lessonPlansDir = path.join(dir, 'Lesson Plans');
      const lesson1 = fs.readdirSync(lessonPlansDir).find((file) => /Lesson 01/.test(file));
      await injectIntoDocx(
        path.join(lessonPlansDir, lesson1),
        'Required reading: LeCun, Y. (1998). Gradient-Based Learning Applied to Document Recognition. Retrieved from https://doi.org/10.1109/5.726791',
      );
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const finding = result.findings.find(
        (f) => f.severity === 'P0' && f.dimension === 'citations' && /off-discipline citation offender/i.test(f.detail),
      );
      expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'citations'))).toBeTruthy();
      expect(finding.evidence).toMatch(/Gradient-Based Learning|Document Recognition/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('topicSection JSON fragment in a cell → format P0', async () => {
    const dir = await freshDir('crucible-json-');
    try {
      // Inject the Mandarin row-26-class corruption into the study-guide text.
      const docx = findDocx(dir, 'Study Guides');
      await injectIntoDocx(docx, 'Estimated speaking practice topicSection": "1.1: Oral assessment prep');
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const finding = result.findings.find(
        (f) => f.severity === 'P0' && f.dimension === 'format' && /JSON/i.test(f.detail),
      );
      expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'format'))).toBeTruthy();
      expect(finding.evidence).toMatch(/topicSection"\s*:/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  // ── Round-2 false-positive regressions (Crucible Round-1 grader FPs) ──────
  // Inject discrete <w:p> paragraphs at the top of a docx body so each renders
  // as its own extracted line (mirrors how the real packages are structured).
  async function injectParagraphsIntoDocx(docxPath, lines) {
    const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
    let xml = await zip.file('word/document.xml').async('string');
    const block = lines
      .map((line) => {
        const escaped = String(line).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
      })
      .join('');
    xml = xml.replace(/(<w:body[^>]*>)/, `$1${block}`);
    zip.file('word/document.xml', xml);
    fs.writeFileSync(docxPath, await zip.generateAsync({ type: 'nodebuffer' }));
  }

  it('FP-1: adjacent benign lines must NOT fabricate a fused-title format finding across the paragraph join', async () => {
    const dir = await freshDir('crucible-fp1-');
    try {
      // Two adjacent, individually-clean lines. Joined into one flat blob they
      // read "…Quiz: methods and self Code lab checklist…" — the Round-1 FP that
      // tripped the colon-title pattern across a paragraph boundary. Per-line
      // scoping must keep them quiet. A second pair reproduces the non-colon
      // "…variables Variables and assignment Expressions…" join FP.
      const docx = findDocx(dir, 'Lesson Plans');
      await injectParagraphsIntoDocx(docx, [
        'Rubric criteria for Quiz: methods and self',
        'Code lab checklist for Classes and Objects: evidence, reasoning, format.',
        'Names are case-sensitive, so total and Total are two different variables',
        'Variables and assignment',
        'Expressions and data types',
      ]);
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const fused = result.findings.filter(
        (f) =>
          f.dimension === 'format' && /fused/i.test(f.detail) && f.file === docx.split(path.sep).slice(-2).join('/'),
      );
      const allFused = result.findings.filter((f) => f.dimension === 'format' && /fused/i.test(f.detail));
      expect(allFused, allFused.map((f) => `${f.file}: ${f.evidence}`).join('\n')).toEqual([]);
      expect(fused).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('FP-2: boilerplate header + on-topic Scheherazade reading must NOT flag, but the diabetes reading MUST (graded as world-lit)', async () => {
    const dir = await freshDir('crucible-fp2-');
    try {
      const docx = findDocx(dir, 'Lesson Plans');
      await injectParagraphsIntoDocx(docx, [
        // (1) the Sources & Licenses boilerplate header — NOT a citation.
        'Open educational resources used in this course package, with their licenses and attribution. Attribution must remain with redistributed materials for CC BY sources.',
        // (2) an on-topic literary reading for the 1001 Nights week — relevant.
        'Ouyang, Wen-chin (2003). Metamorphoses of Scheherazade in literature and film. Cambridge University Press.',
        // (3) a genuinely off-discipline medical reading — MUST flag.
        'Thomas R. Einarson, Annabel Acs, Craig Ludwig et al. (2018). Prevalence of cardiovascular disease in type 2 diabetes: a systematic literature review. Open-access via https://doi.org/10.1186/s12933-018-0728-6 (cc-by).',
      ]);
      const worldLitCourse = { id: 'world-lit', title: 'World Literature', featureIds: GEO_FEATURES };
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: worldLitCourse,
      });
      const citationFindings = result.findings.filter((f) => f.dimension === 'citations');
      // The boilerplate header is never scored as a citation.
      expect(citationFindings.some((f) => /Open educational resources used/i.test(f.evidence))).toBe(false);
      // The on-topic Scheherazade reading shares "literature" with the course — not flagged.
      expect(citationFindings.some((f) => /Scheherazade/i.test(f.evidence))).toBe(false);
      // The diabetes reading is off-discipline (medicine) for a literature course — flagged.
      const diabetes = citationFindings.find((f) => /diabetes|cardiovascular/i.test(f.evidence));
      expect(diabetes, JSON.stringify(citationFindings.map((f) => f.evidence))).toBeTruthy();
      expect(diabetes.severity).toBe('P1');
      expect(diabetes.detail).toMatch(/off-discipline/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('FP-3: rubric/deck prose mentioning "Lesson N: <topic> …" must NOT fabricate a title-consistency finding when Title lines agree', async () => {
    const dir = await freshDir('crucible-fp3-');
    try {
      // The Round-2 live FP: the grader extracted geology rubrics' lesson
      // title as "Geologic Time using the criteria below" and the deck's as
      // "Geologic Time to strengthen the next…" — body PROSE, not the Title
      // line. Inject both prose shapes; the per-deliverable Title lines
      // ("Physical Geology - Lesson 01 - Minerals") still agree, so no
      // consistency finding may appear.
      await injectParagraphsIntoDocx(findDocx(dir, 'Rubrics'), [
        'Evaluate the deliverable for Lesson 01: Minerals using the criteria below. Treat it as Checkpoint response.',
      ]);
      await injectParagraphsIntoDocx(findDocx(dir, 'Study Guides'), [
        'Revisit Lesson 01: Minerals to strengthen the next field decision before the quiz.',
      ]);
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const titleFindings = result.findings.filter(
        (f) => f.dimension === 'consistency' && /title differs/i.test(f.detail),
      );
      expect(titleFindings, titleFindings.map((f) => `${f.file}: ${f.evidence}`).join('\n')).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('TP guard: a Title line that genuinely disagrees across deliverables still produces the consistency finding', async () => {
    const dir = await freshDir('crucible-tp-title-');
    try {
      // A canonical-form Title line with the WRONG lesson title, injected
      // ABOVE the real one, becomes the document's declared title.
      await injectParagraphsIntoDocx(findDocx(dir, 'Rubrics'), [
        'Physical Geology - Lesson 01 - A Completely Different Topic',
      ]);
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const finding = result.findings.find(
        (f) => f.dimension === 'consistency' && /Lesson 1 title differs/i.test(f.detail),
      );
      expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'consistency'))).toBeTruthy();
      expect(finding.evidence).toMatch(/A Completely Different Topic/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('flags a foreign lesson payload inserted beside the document cover', async () => {
    const dir = await freshDir('crucible-foreign-cover-payload-');
    try {
      const docx = findDocx(dir, 'Quiz & Exam Bank');
      await injectParagraphsIntoDocx(docx, [
        'Lesson 15: Course conclusion',
        'Q1 (Multiple choice): Which statement best summarizes the conclusion?',
      ]);
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const finding = result.findings.find(
        (entry) => entry.dimension === 'consistency' && /starts with a Lesson 15 payload/i.test(entry.detail),
      );
      expect(
        finding,
        JSON.stringify(result.findings.filter((entry) => entry.dimension === 'consistency')),
      ).toBeTruthy();
      expect(finding.severity).toBe('P0');
      expect(finding.evidence).toBe('Lesson 15: Course conclusion');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  // ── Round-2 grader gap: registered exam CONTENT must be inside the file ──
  // The Round-1 live geology/cs-python packages registered midterms/finals
  // whose artifact files existed but contained ONLY the weekly quiz (the
  // finish-pass repair had retitled the exam section to "Lesson 1: …") — and
  // identity still scored 100. The grader now proves exam content shipped.
  function midtermCourseMap() {
    const base = geologyCourseMap();
    base.lessons.push({
      title: 'Lesson 5: Midterm Review and Exam',
      sections: [
        {
          topicSection: '5.1: Midterm review',
          learningGoals: '1. Consolidate minerals through metamorphic rocks before the midterm.',
          learningObjectives:
            'Demonstrate understanding of minerals through metamorphic rocks.\nJustify answers with observable evidence.',
          weeklyAssessments: 'Quiz: review readiness\nMidterm Exam: minerals through metamorphic rocks',
          asyncActivities: 'Re-work one practice set per covered lesson.',
          syncActivities: 'Review stations: covered concepts.',
          supportingResources: 'Review guide',
        },
      ],
    });
    return base;
  }

  async function buildMidtermPackageZip() {
    const courseMap = midtermCourseMap();
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    const blueprint = buildBlueprintFromGraph(graph);
    const compiled = compileBlueprintDeliverables(blueprint, GEO_FEATURES);
    const displayMap = renderCourseMapFromGraph(graph, { assessmentReferences: true });
    const deliverables = {};
    for (const featureId of GEO_FEATURES) {
      deliverables[featureId] = { status: 'done', data: compiled[featureId] };
    }
    const result = await buildCourseMaterialsZip({
      courseMap: displayMap,
      courseName: 'Physical Geology',
      deliverables,
      featureIds: ['courseMap', ...GEO_FEATURES],
      courseGraph: graph,
    });
    return result.blob;
  }

  it('registered exam: content present → no finding; decapitated exam section → identity P0', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-exam-'));
    try {
      await extractZipToDir(await buildMidtermPackageZip(), dir);
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'PACKAGE_MANIFEST.json'), 'utf8'));
      const registeredExam = (manifest.assessments || []).find((entry) => entry.kind === 'exam');
      expect(registeredExam, 'fixture must register a kind-exam assessment').toBeTruthy();
      expect(registeredExam.title).toBe('Midterm Exam: minerals through metamorphic rocks');

      const examFindingsOf = (result) =>
        result.findings.filter((finding) => /registered exam artifact contains no exam content/i.test(finding.detail));

      // (1) the healthy package ships the exam content → NO finding.
      const before = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      expect(examFindingsOf(before), JSON.stringify(examFindingsOf(before))).toEqual([]);

      // (2) seed the live Round-1 defect: the exam section loses its identity
      // (retitled to a lesson heading), leaving only weekly-quiz-shaped text.
      const quizDir = path.join(dir, 'Quiz & Exam Bank');
      const lesson5 = fs.readdirSync(quizDir).find((file) => /Lesson 05/.test(file));
      const docxPath = path.join(quizDir, lesson5);
      const zip = await JSZip.loadAsync(fs.readFileSync(docxPath));
      let xml = await zip.file('word/document.xml').async('string');
      xml = xml
        .split('Midterm Exam — minerals through metamorphic rocks')
        .join('Lesson 1: Minerals')
        .split('Midterm Exam: minerals through metamorphic rocks')
        .join('Lesson 1 review')
        .split('Covers Lessons')
        .join('Lessons')
        .split('Midterm Exam')
        .join('Lesson 1 review');
      zip.file('word/document.xml', xml);
      fs.writeFileSync(docxPath, await zip.generateAsync({ type: 'nodebuffer' }));

      const after = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: GEO_COURSE,
      });
      const finding = examFindingsOf(after).find((entry) => entry.severity === 'P0');
      expect(finding, JSON.stringify(after.findings.filter((entry) => entry.dimension === 'identity'))).toBeTruthy();
      expect(finding.dimension).toBe('identity');
      expect(finding.file).toMatch(/Lesson 05/);
      expect(finding.detail).toMatch(/Midterm Exam: minerals through metamorphic rocks/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 180000);

  it('mandarin course with zero per-lesson CJK/pinyin coverage → discipline P0', async () => {
    // Reuse the same geology package text but grade it AS a mandarin course:
    // the language probe must fire because the materials contain no hanzi or
    // tone-marked pinyin (exactly the v0.14 Mandarin finding's structural
    // shape — the language missing from its own materials).
    const dir = await freshDir('crucible-mandarin-');
    try {
      const mandarinCourse = { id: 'mandarin', title: 'Elementary Mandarin Chinese I', featureIds: GEO_FEATURES };
      const result = await grade({
        extractedDir: dir,
        consoleLogText: healthyConsoleLog(),
        digest: healthyDigest(),
        course: mandarinCourse,
      });
      const finding = result.findings.find(
        (f) =>
          f.severity === 'P0' &&
          f.dimension === 'discipline' &&
          /(?:CJK\/pinyin|hanzi with tone-marked pinyin)/i.test(f.detail),
      );
      expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'discipline'))).toBeTruthy();
      expect(finding.detail).toMatch(/coverage reaches 0\/4 lessons/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});

// ── Round-3 polish (R3.2): the console honesty scan's dev-noise allowlist ───
// Round 3 flagged all four courses with "unexplained console error/warning":
// cs-python on browser QUIC noise ("net::ERR_QUIC_PROTOCOL_ERROR") and the
// other three on the digest pretty-print's gates summary line — "export
// passed (38 files, 0 failed, 0 warnings)" trips \bfailed\b even though it
// REPORTS zero failures (no mis-windowing: the line itself matched). Both
// classes are structured/environment noise; genuine app errors must still
// flag.
describe('Crucible grader — round-3 dev-noise allowlist (network noise + digest pretty-print)', () => {
  let dir;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crucible-noise-'));
    await extractZipToDir(await buildGeologyPackageZip(), dir);
  }, 120000);

  afterAll(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  const consoleNoiseFindings = (result) =>
    result.findings.filter((f) => f.dimension === 'honesty' && /unexplained console error\/warning/i.test(f.detail));

  it('QUIC/network resource-load noise and the gates pretty-print never flag', async () => {
    const log = [
      healthyConsoleLog(),
      // The exact round-3 cs-python evidence line.
      '2026-06-11T17:00:25.506Z [error] Failed to load resource: net::ERR_QUIC_PROTOCOL_ERROR',
      '[error] Failed to load resource: net::ERR_NETWORK_CHANGED',
      '[error] Failed to load resource: net::ERR_INTERNET_DISCONNECTED',
      '[error] Failed to load resource: the server responded with a status of 404 () http://localhost:5173/favicon.ico',
      // The exact round-3 world-lit/mandarin/geology evidence line + its
      // indented flagged-check sub-lines (the digest pretty-print).
      'gates: ready · export passed (38 files, 0 failed, 0 warnings) · 3 repairs · 0 retry calls',
      '  [warning] alignment: Final Discussion — promised in course map (Lesson 14), no matching assignment or exam was generated',
      '  [info] alignment: 1 additional map assessment has no dedicated artifact (in-class activities)',
      'gates: ready · export warnings (38 files, 0 failed, 1 warnings) · 0 repairs · 0 retry calls',
      '  [warning] quizBank: DOCX export generated, but Rendered text repeats the phrase "multiple choice 2 pts" 14 times within one section.',
    ].join('\n');
    const result = await grade({ extractedDir: dir, consoleLogText: log, digest: healthyDigest(), course: GEO_COURSE });
    expect(consoleNoiseFindings(result), JSON.stringify(consoleNoiseFindings(result))).toEqual([]);
    expect(result.scores.honesty).toBe(100);
  }, 120000);

  it('a genuine app error still produces the honesty P2 with its evidence', async () => {
    const log = [
      healthyConsoleLog(),
      "[error] Uncaught TypeError: Cannot read properties of undefined (reading 'lessons') at compileBlueprint",
    ].join('\n');
    const result = await grade({ extractedDir: dir, consoleLogText: log, digest: healthyDigest(), course: GEO_COURSE });
    const findings = consoleNoiseFindings(result);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('P2');
    expect(findings[0].evidence).toMatch(/Uncaught TypeError/);
  }, 120000);

  it('a resource-load failure pointing at an app API (not a static asset) still flags', async () => {
    const log = [
      healthyConsoleLog(),
      '[error] Failed to load resource: the server responded with a status of 500 () http://localhost:5173/api/generate',
    ].join('\n');
    const result = await grade({ extractedDir: dir, consoleLogText: log, digest: healthyDigest(), course: GEO_COURSE });
    const findings = consoleNoiseFindings(result);
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toMatch(/api\/generate/);
  }, 120000);
});

// ── V0.14.3 WS-B2: the genome bar (honesty dimension) ───────────────────────
// Small in-memory fixtures (manifest + a study guide + a lesson plan) exercise
// the three genome-bar checks directly: the resolver-drift P1, the cited-term
// regression net, and the seeded-gap diagnosis. No real export needed — the
// bar reads manifest.pipeline + featureId-tagged files.
describe('Crucible grader — the genome bar (WS-B2)', () => {
  const FEATURES = ['lessonPlans', 'studyGuides'];

  // A minimal but well-formed package: a manifest with a genomeLinker line, one
  // study guide (with a cited key term), one lesson plan, plus the econ
  // discipline vocabulary so the density probe stays quiet.
  function genomeFileMap({ genomeLinker, judgment, studyGuideExtra = '', lessonPlanExtra = '' } = {}) {
    const econTerms =
      'demand supply equilibrium market elasticity consumer utility opportunity cost monopoly externality';
    return {
      'PACKAGE_MANIFEST.json': JSON.stringify({
        courseName: 'Principles of Microeconomics',
        lessonScope: 'all',
        assessments: [],
        files: [],
        readiness: { status: 'ready', blockers: 0 },
        pipeline: { genomeLinker, ...(judgment ? { judgment } : {}) },
      }),
      'Study Guides/Lesson 01 - Demand - Study Guides.md': [
        'Principles of Microeconomics - Lesson 01 - Demand',
        'KEY TERMS',
        `Demand curve ${econTerms}`,
        'Source: openstax:microeconomics-3e §3.1',
        studyGuideExtra,
      ].join('\n'),
      'Lesson Plans/Lesson 05 - Price elasticity of demand - Lesson Plans.md': [
        'Principles of Microeconomics - Lesson 05 - Price elasticity of demand',
        `Price elasticity of demand. ${econTerms}.`,
        lessonPlanExtra,
      ].join('\n'),
    };
  }

  const genomeFindings = (result) =>
    result.findings.filter(
      (f) =>
        f.dimension === 'honesty' && /genome shard exists|cited \(Source\)|seeded prerequisite gap/i.test(f.detail),
    );

  it('(a) expectGenome set + manifest shows 0 linked → P1 "shard exists but never linked"', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        genomeFileMap({
          genomeLinker: '0 genome + 0 cached of 14 lessons (0 concepts, 0 citations, 0 bridges)',
          judgment: 'not evaluated (0 genome-linked lessons)',
        }),
      ),
      course: { id: 'econ-intro', title: 'Principles of Microeconomics', expectGenome: 'econ', featureIds: FEATURES },
    });
    const finding = result.findings.find(
      (f) => f.severity === 'P1' && f.dimension === 'honesty' && /never linked/i.test(f.detail),
    );
    expect(finding, JSON.stringify(genomeFindings(result))).toBeTruthy();
    expect(finding.detail).toMatch(/discipline "econ"/);
    expect(finding.evidence).toMatch(/0 genome \+ 0 cached/);
  });

  it('(a) a course WITHOUT expectGenome never fires the genome bar even at 0 linked', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        genomeFileMap({ genomeLinker: '0 genome + 0 cached of 14 lessons', judgment: 'not evaluated' }),
      ),
      // No expectGenome — world-lit-style (thin shard) or mandarin (no shard).
      course: { id: 'world-lit', title: 'World Literature', featureIds: FEATURES },
    });
    expect(genomeFindings(result)).toEqual([]);
  });

  it('(b) a genome-linked course with a cited (Source) study-guide term stays quiet', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        genomeFileMap({
          genomeLinker: '8 genome + 0 cached of 14 lessons (16 concepts, 12 citations, 1 bridges)',
          judgment: 'no gaps across 16 linked concepts',
        }),
      ),
      course: { id: 'econ-intro', title: 'Principles of Microeconomics', expectGenome: 'econ', featureIds: FEATURES },
    });
    // No "never linked" and no "no cited (Source) key term" finding.
    expect(result.findings.filter((f) => /never linked|no cited \(Source\)/i.test(f.detail))).toEqual([]);
  });

  it('(b) a genome-linked course whose study guides carry NO Source line → P1', async () => {
    const fileMap = genomeFileMap({
      genomeLinker: '8 genome + 0 cached of 14 lessons',
      judgment: 'no gaps across 16 linked concepts',
    });
    // Strip the Source line out of the study guide.
    fileMap['Study Guides/Lesson 01 - Demand - Study Guides.md'] = fileMap[
      'Study Guides/Lesson 01 - Demand - Study Guides.md'
    ].replace(/Source:.*$/m, '');
    const result = await grade({
      fileProvider: createMemoryFileProvider(fileMap),
      course: { id: 'econ-intro', title: 'Principles of Microeconomics', expectGenome: 'econ', featureIds: FEATURES },
    });
    const finding = result.findings.find((f) => /no cited \(Source\) key term/i.test(f.detail));
    expect(finding, JSON.stringify(genomeFindings(result))).toBeTruthy();
    expect(finding.severity).toBe('P1');
  });

  it('(c) a seeded-gap course with a diagnosed gap AND a rendered primer stays quiet', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        genomeFileMap({
          genomeLinker: '8 genome + 0 cached of 14 lessons',
          judgment:
            '1 prerequisite gap (1 bridgeable with cited primers, 0 assumed background) · 1 out-of-order · 1 primer built',
          // The lesson plan carries a prerequisite primer naming the missing concept.
          lessonPlanExtra: 'Prerequisite primer — Demand curve: the schedule of quantities demanded at each price.',
        }),
      ),
      course: {
        id: 'econ-intro',
        title: 'Principles of Microeconomics',
        expectGenome: 'econ',
        seededGap: { lesson: 5, missingConcept: 'Demand curve' },
        featureIds: FEATURES,
      },
    });
    expect(result.findings.filter((f) => /seeded prerequisite gap/i.test(f.detail))).toEqual([]);
  });

  it('(c) a seeded-gap course with a SILENT judgment line → P1 "seeded prerequisite gap not diagnosed"', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        genomeFileMap({
          genomeLinker: '8 genome + 0 cached of 14 lessons',
          // Judgment reports NO gap, and no primer is rendered.
          judgment: 'no gaps across 16 linked concepts',
        }),
      ),
      course: {
        id: 'econ-intro',
        title: 'Principles of Microeconomics',
        expectGenome: 'econ',
        seededGap: { lesson: 5, missingConcept: 'Demand curve' },
        featureIds: FEATURES,
      },
    });
    const finding = result.findings.find((f) => /seeded prerequisite gap not diagnosed/i.test(f.detail));
    expect(finding, JSON.stringify(genomeFindings(result))).toBeTruthy();
    expect(finding.severity).toBe('P1');
    expect(finding.detail).toMatch(/Demand curve/);
  });

  it('strangers (probeProfile generic) never fire the genome bar', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        genomeFileMap({ genomeLinker: '0 genome + 0 cached of 12 lessons', judgment: 'not evaluated' }),
      ),
      course: {
        id: 'art-history',
        title: 'Survey of Art History',
        probeProfile: 'generic',
        expectGenome: 'econ', // even if set, generic profile suppresses it
        featureIds: FEATURES,
      },
    });
    expect(genomeFindings(result)).toEqual([]);
  });
});

// ── V0.14.3 discipline-breadth calibration (FP-1..5) ────────────────────────
// The six new genome disciplines (econ, stats, psych, nursing, nutrition,
// astro) surfaced grader FALSE POSITIVES from four-original-course-tuned
// heuristics. Each case below proves the FP is now quiet AND the original
// audit defect it guards is still catchable (the OVERRIDING constraint).
describe('Crucible grader — discipline-breadth calibration (FP-1..5)', () => {
  const FEATURES = ['syllabus', 'lessonPlans', 'slideDecks', 'studyGuides'];

  function citationFileMap({
    courseName,
    lessonTitle,
    lessonNumber,
    citationLine,
    genomeLinker = '13 genome + 0 cached of 14 lessons',
    judgment = 'no gaps across 28 linked concepts',
    disciplineFiller = '',
    extraFiles = {},
  }) {
    const lp = `Lesson Plans/Lesson ${String(lessonNumber).padStart(2, '0')} - ${lessonTitle} - Lesson Plans.docx`;
    return {
      'PACKAGE_MANIFEST.json': JSON.stringify({
        courseName,
        lessonScope: 'all',
        assessments: [],
        files: [],
        readiness: { status: 'ready', blockers: 0 },
        pipeline: { genomeLinker, judgment },
      }),
      // .md so the in-memory provider reads it as text paragraphs.
      [lp.replace('.docx', '.md')]: [
        `${courseName} - Lesson ${String(lessonNumber).padStart(2, '0')} - ${lessonTitle}`,
        `This lesson covers ${lessonTitle.toLowerCase()}. ${disciplineFiller}`,
        'PEER-REVIEWED READINGS (OPEN ACCESS)',
        citationLine,
      ].join('\n'),
      ...extraFiles,
    };
  }

  // FP-1: a blacklisted keyword ("Alzheimer") in a citation whose TITLE shares
  // the lesson's concept ("innate immunity") is a real reading — must NOT fire.
  it('FP-1: "innate immunity in Alzheimer\'s" attached to an immunology lesson does NOT fire the blacklist', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Foundations for Nursing Practice',
          lessonTitle: 'Innate versus Adaptive Immunity',
          lessonNumber: 8,
          disciplineFiller:
            'innate adaptive immunity inflammation bacterial viral homeostasis circulation physiology anatomy pressure diffusion',
          citationLine:
            "Rebecca Sims, GERAD/PERADES, Sven J. van der Lee et al. (2017). Rare coding variants in PLCG2, ABI3, and TREM2 implicate microglial-mediated innate immunity in Alzheimer's disease. Open-access via https://doi.org/10.1038/ng.3916 (cc-by).",
        }),
      ),
      course: {
        id: 'nursing-fundamentals',
        title: 'Foundations for Nursing Practice',
        expectGenome: 'nursing',
        featureIds: FEATURES,
      },
    });
    const offenders = result.findings.filter((f) => /off-discipline citation offender/i.test(f.detail));
    expect(offenders, JSON.stringify(offenders)).toEqual([]);
  });

  // FP-1 GUARD: the zero-overlap blacklist case (MNIST for a geology lesson)
  // still fires P0 — the blacklist stays absolute when there's NO topical tie.
  it('FP-1 guard: MNIST attached to a geology lesson (zero overlap) still fires the blacklist P0', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Physical Geology',
          lessonTitle: 'Geologic Time',
          lessonNumber: 13,
          disciplineFiller: 'mineral rock igneous sedimentary metamorphic strata erosion fossil stratigraphy',
          citationLine:
            'LeCun, Y., Bottou, L. et al. (1998). Gradient-Based Learning Applied to Document Recognition (MNIST). Open-access via https://doi.org/10.1109/5.726791.',
          genomeLinker: '14 genome + 0 cached of 14 lessons',
        }),
      ),
      course: { id: 'geology', title: 'Physical Geology', featureIds: FEATURES },
    });
    const offender = result.findings.find(
      (f) => f.severity === 'P0' && /off-discipline citation offender/i.test(f.detail),
    );
    expect(offender, JSON.stringify(result.findings.filter((f) => f.dimension === 'citations'))).toBeTruthy();
    expect(offender.evidence).toMatch(/Document Recognition|Gradient-Based/i);
  });

  // v0.14.3 round-2 FIX-1 defense-in-depth: even though the engine now rejects
  // the cancer-statistics offender at attach time, the grader's blacklist must
  // still fire P0 if one ever slips through — the only overlap with a sampling
  // lesson is the generic, discipline-name token "statistics", so the yield
  // rule does NOT rescue it (the exact stats-intro round offender).
  it('FIX-1 grader: "Global Cancer Statistics, 2002" on a stats sampling lesson still fires the blacklist P0', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Introductory Statistics',
          lessonTitle: 'P-Values and Significance Probability',
          lessonNumber: 5,
          disciplineFiller:
            'sampling distribution significance hypothesis null alternative estimator probability inference confidence',
          citationLine:
            'Donald Maxwell Parkin, Freddie Bray, Jacques Ferlay et al. (2005). Global Cancer Statistics, 2002. Open-access via https://onlinelibrary.wiley.com/doi/pdfdirect/10.3322/canjclin.55.2.74 (open access)',
          genomeLinker: '14 genome + 0 cached of 14 lessons',
        }),
      ),
      course: { id: 'stats-intro', title: 'Introductory Statistics', expectGenome: 'stats', featureIds: FEATURES },
    });
    const offender = result.findings.find(
      (f) => f.severity === 'P0' && /off-discipline citation offender/i.test(f.detail),
    );
    expect(offender, JSON.stringify(result.findings.filter((f) => f.dimension === 'citations'))).toBeTruthy();
    expect(offender.detail).toContain('Global cancer statistics');
  });

  // FP-2: the seeded prerequisite issue diagnosed as OUT-OF-ORDER (the correct
  // v0.14 classification — no primer expected) must NOT fire.
  it('FP-2: a seeded gap diagnosed as out-of-order (no primer) does NOT fire', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Principles of Microeconomics',
          lessonTitle: 'Price Elasticity of Demand',
          lessonNumber: 5,
          disciplineFiller:
            'elasticity demand supply equilibrium market consumer utility opportunity cost monopoly externality',
          citationLine:
            'OpenStax microeconomics 3e §5.1 (open textbook, CC BY 4.0 — https://openstax.org/books/microeconomics-3e)',
          genomeLinker: '14 genome + 0 cached of 14 lessons',
          judgment:
            '0 prerequisite gaps (0 bridgeable with cited primers, 0 assumed background) · 2 out-of-order · 0 primers built',
        }),
      ),
      course: {
        id: 'econ-intro',
        title: 'Principles of Microeconomics',
        expectGenome: 'econ',
        seededGap: { lesson: 5, missingConcept: 'Demand curve' },
        featureIds: FEATURES,
      },
    });
    expect(result.findings.filter((f) => /seeded prerequisite gap/i.test(f.detail))).toEqual([]);
  });

  // FP-2 GUARD: a genuinely SILENT judgment (zero gaps of any kind) still fires.
  it('FP-2 guard: a silent judgment (0 gaps, 0 out-of-order, 0 assumed) still fires P1', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Principles of Microeconomics',
          lessonTitle: 'Price Elasticity of Demand',
          lessonNumber: 5,
          disciplineFiller:
            'elasticity demand supply equilibrium market consumer utility opportunity cost monopoly externality',
          citationLine:
            'OpenStax microeconomics 3e §5.1 (open textbook, CC BY 4.0 — https://openstax.org/books/microeconomics-3e)',
          genomeLinker: '14 genome + 0 cached of 14 lessons',
          judgment:
            '0 prerequisite gaps (0 bridgeable with cited primers, 0 assumed background) · 0 out-of-order · 0 primers built',
        }),
      ),
      course: {
        id: 'econ-intro',
        title: 'Principles of Microeconomics',
        expectGenome: 'econ',
        seededGap: { lesson: 5, missingConcept: 'Demand curve' },
        featureIds: FEATURES,
      },
    });
    const finding = result.findings.find((f) => /seeded prerequisite gap not diagnosed/i.test(f.detail));
    expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'honesty'))).toBeTruthy();
    expect(finding.severity).toBe('P1');
    expect(finding.detail).toMatch(/Demand curve/);
  });

  // FP-3: a topically-relevant medical paper (STROBE for a stats lesson;
  // saturated-fat for a nutrition lesson) must NOT be flagged off-discipline.
  it('FP-3: STROBE attached to a stats observational-studies lesson does NOT fire (medicine allowed for stats)', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Introduction to Statistics',
          lessonTitle: 'Observational Studies, Confounding, and Spurious Association',
          lessonNumber: 2,
          disciplineFiller:
            'observational confounding spurious correlation causation sampling regression hypothesis significance inference population',
          citationLine:
            'Jan P. Vandenbroucke, Erik von Elm, Douglas G. Altman et al. (2007). Strengthening the Reporting of Observational Studies in Epidemiology (STROBE): Explanation and Elaboration. Open-access via https://doi.org/10.1371/journal.pmed.0040297.',
          genomeLinker: '12 genome + 0 cached of 13 lessons',
        }),
      ),
      course: { id: 'stats-intro', title: 'Introduction to Statistics', expectGenome: 'stats', featureIds: FEATURES },
    });
    expect(result.findings.filter((f) => f.dimension === 'citations' && /off-discipline/i.test(f.detail))).toEqual([]);
  });

  it('FP-3: saturated-fat review attached to a nutrition lipids lesson does NOT fire', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Introduction to Nutrition',
          lessonTitle: 'Lipids and Dietary Fat',
          lessonNumber: 5,
          disciplineFiller:
            'lipids saturated unsaturated triglycerides fatty acids nutrients macronutrients carbohydrates proteins vitamins minerals digestion',
          citationLine:
            'Russell J. de Souza, Andrew Mente, Adriana Maroleanu et al. (2015). Intake of saturated and trans unsaturated fatty acids and risk of all cause mortality, cardiovascular disease, and type 2 diabetes. Open-access via https://doi.org/10.1136/bmj.h3978.',
          genomeLinker: '12 genome + 0 cached of 12 lessons',
        }),
      ),
      course: {
        id: 'nutrition-101',
        title: 'Introduction to Nutrition',
        expectGenome: 'nutrition',
        featureIds: FEATURES,
      },
    });
    expect(result.findings.filter((f) => f.dimension === 'citations' && /off-discipline/i.test(f.detail))).toEqual([]);
  });

  it('FP-3: Business Ethics recognizes ethical frameworks and product-safety sources', async () => {
    const syllabus = [
      'Business Ethics - Syllabus',
      'COURSE READINGS',
      'Wikipedia contributors. Utilitarianism. Wikipedia: https://en.wikipedia.org/wiki/Utilitarianism (CC BY-SA 4.0)',
      'Wikipedia contributors. UL (safety organization). Wikipedia: https://en.wikipedia.org/wiki/UL_(safety_organization) (CC BY-SA 4.0)',
    ].join('\n');
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        ...citationFileMap({
          courseName: 'Business Ethics',
          lessonTitle: 'Product Safety and Consumer Rights',
          lessonNumber: 6,
          disciplineFiller:
            'utilitarianism deontology virtue ethics stakeholder responsibility governance compliance consumer rights product safety',
          citationLine:
            'Wikipedia contributors. Business ethics. Wikipedia: https://en.wikipedia.org/wiki/Business_ethics (CC BY-SA 4.0)',
        }),
        'Syllabus/Business Ethics - Syllabus.md': syllabus,
      }),
      course: { id: 'business-ethics', title: 'Business Ethics', featureIds: FEATURES },
    });
    expect(result.findings.filter((f) => f.dimension === 'citations' && /off-discipline/i.test(f.detail))).toEqual([]);
  });

  // FP-3 GUARD: a genuinely off-topic medical paper for a CS lesson STILL rejects.
  it('FP-3 guard: a medical (cardiovascular/diabetes) paper for a CS lesson still fires off-discipline', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider(
        citationFileMap({
          courseName: 'Introduction to Python Programming',
          lessonTitle: 'Functions and Scope',
          lessonNumber: 3,
          disciplineFiller: 'def return import print range loop variable function list dictionary',
          citationLine:
            'Thomas R. Einarson, Annabel Acs et al. (2018). Prevalence of cardiovascular disease in type 2 diabetes: a systematic literature review. Open-access via https://doi.org/10.1186/s12933-018-0728-6.',
        }),
      ),
      course: { id: 'cs-python', title: 'Introduction to Python Programming', featureIds: FEATURES },
    });
    const offTopic = result.findings.find((f) => f.dimension === 'citations' && /off-discipline/i.test(f.detail));
    expect(offTopic, JSON.stringify(result.findings.filter((f) => f.dimension === 'citations'))).toBeTruthy();
    expect(offTopic.detail).toMatch(/medicine/i);
  });

  // FP-4: author initials ("F. F. S. van der Tak") must NOT trip the
  // doubled-option-letters pattern; a real "A. A. Option" doubling still does.
  it('FP-4: author initials "F. F. S." never match doubled-option-letters; real option doubling still does', () => {
    const pattern = ARTIFACT_PATTERNS.find((p) => p.name === 'doubled-option-letters').regex;
    expect(pattern.test('F. F. S. van der Tak, J. H. Black, F. L. Schöier et al. (2007).')).toBe(false);
    expect(
      pattern.test('(open textbook, CC BY 4.0 — https://openstax.org/books/astronomy-2e); F. F. S. van der Tak'),
    ).toBe(false);
    expect(pattern.test('A. A. The mitochondria is the powerhouse of the cell')).toBe(true);
  });

  // FP-5: a concept-map relationship bullet (A ↔ B) is exempt from truncation;
  // a genuine mid-clause truncation still flags.
  it('FP-5: a relationship-arrow bullet is exempt from truncation; a true cut still flags', () => {
    expect(
      isTruncatedBulletLine(
        'The population under the null hypothesis ↔ the full population the samples are drawn from',
      ),
    ).toBe(false);
    // a genuine mid-clause cut (no arrow, ends mid-clause, ≥60 chars).
    expect(isTruncatedBulletLine('adapts the course pattern for this checkpoint so the reviewer should')).toBe(true);
  });
});

// ── V0.14.3 D4: the content-slide floor (substance) ─────────────────────────
// Proves the new check BITES: an enriched deck (carries the D1 "Common
// pitfalls" slide) whose remaining slides are scaffold-only — no domain tokens
// — averages below the ≥5 content-slide floor and earns a P1. The positive
// case (real depth-slice decks stay quiet) lives in the healthy-package suite.
describe('Crucible grader — D4 content-slide floor (substance)', () => {
  // Minimal pptx: each slide is its own ppt/slides/slideN.xml; the first
  // paragraph is the title, the rest are body bullets (matches extractPptx).
  async function buildPptxBlob(slides) {
    const zip = new JSZip();
    slides.forEach((slide, index) => {
      const paras = [slide.title, ...(slide.bullets || [])]
        .map((line) => `<a:p><a:r><a:t>${String(line).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a:t></a:r></a:p>`)
        .join('');
      const xml = `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${paras}</p:spTree></p:cSld></p:sld>`;
      zip.file(`ppt/slides/slide${index + 1}.xml`, xml);
    });
    return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
  }

  // A starved enriched deck: a "Common pitfalls" title (enrichment signal) +
  // scaffold slides with ZERO geology domain tokens → ~0 content slides.
  function starvedSlides() {
    return [
      { title: 'LESSON 2', bullets: [] },
      { title: 'TODAY’S AGENDA', bullets: ['warm up', 'discuss', 'wrap up'] },
      { title: 'LEARNING OBJECTIVES', bullets: ['be able to do the thing'] },
      { title: 'READINESS CHECK', bullets: ['are you ready'] },
      { title: 'Common pitfalls in this topic', bullets: ['it is tempting to think one thing'] },
      { title: 'ACTIVITY', bullets: ['work together'] },
    ];
  }

  const PACKAGE_MANIFEST = JSON.stringify({
    courseName: 'Physical Geology',
    lessonScope: 'all',
    assessments: [],
    files: [],
    readiness: { status: 'ready', blockers: 0 },
  });

  it('fires a P1 when enriched decks average below the ≥5 content-slide floor', async () => {
    const fileMap = { 'PACKAGE_MANIFEST.json': PACKAGE_MANIFEST };
    for (const lessonNumber of [1, 2, 3]) {
      const padded = String(lessonNumber).padStart(2, '0');
      fileMap[`Slide Decks/Lesson ${padded} - Minerals - Slide Decks.pptx`] = await buildPptxBlob(starvedSlides());
    }
    const result = await grade({
      fileProvider: createMemoryFileProvider(fileMap),
      course: { id: 'geology', title: 'Physical Geology', featureIds: ['slideDecks'] },
    });
    const finding = result.findings.find(
      (f) => f.severity === 'P1' && f.dimension === 'substance' && /content-bearing slides/i.test(f.detail),
    );
    expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'substance'))).toBeTruthy();
    expect(finding.detail).toMatch(/average .* content-bearing slides \(<5\)/);
    expect(finding.evidence).toMatch(/content slide/);
  });

  it('stays quiet when an enriched deck carries ≥5 domain-token slides', async () => {
    const rich = [
      { title: 'LESSON 2', bullets: [] },
      {
        title: 'Minerals are identified by physical tests',
        bullets: ['streak shows powder color', 'hardness ranks scratch resistance'],
      },
      { title: 'Quartz versus calcite hardness', bullets: ['quartz scratches glass', 'calcite does not'] },
      {
        title: 'Cleavage reveals crystal bonding planes',
        bullets: ['halite cleaves into cubes', 'mica peels in sheets'],
      },
      {
        title: 'Streak is more diagnostic than surface color',
        bullets: ['hematite streaks red-brown', 'specimen color varies'],
      },
      {
        title: 'Silicate structures organize the rock-forming minerals',
        bullets: ['feldspar and quartz dominate granite'],
      },
      {
        title: 'Common pitfalls in mineral identification',
        bullets: ['it is tempting to read surface color as streak'],
      },
    ];
    const fileMap = { 'PACKAGE_MANIFEST.json': PACKAGE_MANIFEST };
    for (const lessonNumber of [1, 2, 3]) {
      const padded = String(lessonNumber).padStart(2, '0');
      fileMap[`Slide Decks/Lesson ${padded} - Minerals - Slide Decks.pptx`] = await buildPptxBlob(rich);
    }
    const result = await grade({
      fileProvider: createMemoryFileProvider(fileMap),
      course: { id: 'geology', title: 'Physical Geology', featureIds: ['slideDecks'] },
    });
    expect(
      result.findings.filter((f) => f.dimension === 'substance' && /content-bearing slides/i.test(f.detail)),
    ).toEqual([]);
  });

  it('exempts un-enriched/legacy decks (no kernel slide → never fires)', async () => {
    // Same starved slides but WITHOUT the "Common pitfalls" enrichment signal:
    // the deck never claimed kernel depth, so the floor does not apply.
    const legacy = starvedSlides().filter((s) => !/common pitfalls/i.test(s.title));
    const fileMap = { 'PACKAGE_MANIFEST.json': PACKAGE_MANIFEST };
    for (const lessonNumber of [1, 2, 3]) {
      const padded = String(lessonNumber).padStart(2, '0');
      fileMap[`Slide Decks/Lesson ${padded} - Minerals - Slide Decks.pptx`] = await buildPptxBlob(legacy);
    }
    const result = await grade({
      fileProvider: createMemoryFileProvider(fileMap),
      course: { id: 'geology', title: 'Physical Geology', featureIds: ['slideDecks'] },
    });
    expect(
      result.findings.filter((f) => f.dimension === 'substance' && /content-bearing slides/i.test(f.detail)),
    ).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// v0.14.3 round-2 FIX 3 — the advisory judge truncates samples for review; the
// truncation must (a) cut at a paragraph boundary, (b) carry an explicit
// marker, (c) instruct the judge not to penalize truncation, and (d) use the
// bumped 6000-char per-artifact cap. (verification-output/crucible/
// round-2026-06-11T20-21-08-130Z — every judged course scored documents as
// "cut off mid-sentence / truncated", an instrumentation artifact.)
// ════════════════════════════════════════════════════════════════════════════

describe('round-2 FIX 3 — judge truncation marker and boundary', () => {
  it('the per-artifact cap is bumped to 6000 chars', () => {
    expect(JUDGE_TEXT_CHARS).toBe(6000);
  });

  it('short text is returned unmarked and not truncated', () => {
    const text = 'A complete short lesson plan.\nIt fits comfortably under the cap.';
    const { text: out, truncated } = truncateArtifactForJudge(text, 6000);
    expect(truncated).toBe(false);
    expect(out).toBe(text);
    expect(out).not.toMatch(/truncated for this review/);
  });

  it('over-cap text cuts at the last paragraph boundary and appends the marker', () => {
    // Three paragraphs; a 40-char cap forces a cut after paragraph one (which
    // ends before char 40) rather than mid-sentence inside paragraph two.
    const para1 = 'First paragraph ends cleanly here.'; // 34 chars
    const para2 = 'Second paragraph would be cut mid-sentence without a boundary cut.';
    const para3 = 'Third paragraph never appears in the excerpt at all.';
    const { text: out, truncated } = truncateArtifactForJudge(`${para1}\n${para2}\n${para3}`, 40);
    expect(truncated).toBe(true);
    // The kept body ends at the paragraph boundary — no mid-sentence fragment.
    expect(out).toContain(para1);
    expect(out).not.toContain('Second paragraph would be cut mid-sentence');
    // The explicit marker names the cut with both char counts.
    expect(out).toMatch(/\[…document continues — truncated for this review at \d+ of \d+ chars\]/);
  });

  it('the marker reports the kept-vs-total char counts honestly', () => {
    const body = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1} of the long sampled artifact body.`).join(
      '\n',
    );
    const { text: out } = truncateArtifactForJudge(body, 200);
    const match = out.match(/truncated for this review at (\d+) of (\d+) chars/);
    expect(match).toBeTruthy();
    const kept = Number(match[1]);
    const total = Number(match[2]);
    expect(kept).toBeLessThan(total);
    expect(total).toBe(body.length);
  });

  it('the judge prompt tells the model not to penalize truncation', () => {
    const prompt = buildJudgePrompt({ title: 'Introductory Statistics' }, [
      { name: 'Lesson 5 lesson plan', text: 'A'.repeat(8000) },
    ]);
    expect(prompt).toContain(
      'Artifacts are excerpts truncated for review — do NOT penalize truncation or judge completeness beyond the excerpt; judge quality of what is shown.',
    );
    // The over-cap artifact body carries the marker inside the prompt.
    expect(prompt).toMatch(/\[…document continues — truncated for this review at \d+ of \d+ chars\]/);
  });
});

describe('Scion process-glossary quality gate', () => {
  it('caps a package below A when key-term definitions teach coursework instead of the subject', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Simple Interval Quality',
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Study Guides/Lesson 01 - Simple Interval Quality - Study Guides.md': [
          'KEY TERMS',
          'Interval quality names the evidence focus students use when deciding what counts as support.',
          'Generic number helps students separate description from evidence-backed reasoning in the lesson.',
          'Semitone is used as a self-check before the weekly artifact.',
        ].join('\n'),
      }),
      course: { title: 'Simple Interval Quality', featureIds: ['studyGuides'] },
    });

    const finding = result.findings.find((entry) => /course process instead of subject knowledge/i.test(entry.detail));
    expect(finding).toMatchObject({ severity: 'P1', dimension: 'substance' });
    expect(result.overall.score).toBeLessThanOrEqual(89);
  });

  it('caps a package below A when quiz questions retain compact-prompt residue', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Simple Interval Quality',
          files: [],
          readiness: { status: 'ready', blockers: 0 },
        }),
        'Quiz & Exam Bank/Lesson 01 - Simple Interval Quality - Quiz.md': [
          'Which option correctly distinguishes the two lesson concepts?',
          'A. Plausible methodological claim or action A',
          'B. Plausible methodological claim or action B',
          'C. Plausible methodological claim or action C',
          'D. Plausible methodological claim or action D',
        ].join('\n'),
      }),
      course: { title: 'Simple Interval Quality', featureIds: ['quizBank'] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'substance',
          detail: expect.stringMatching(/unfilled authoring-template language/i),
        }),
      ]),
    );
    expect(result.overall.score).toBeLessThanOrEqual(89);
  });
});
