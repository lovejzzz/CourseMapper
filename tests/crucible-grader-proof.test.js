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

  it('mandarin course with zero CJK/pinyin → discipline P0', async () => {
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
        (f) => f.severity === 'P0' && f.dimension === 'discipline' && /CJK\/pinyin/i.test(f.detail),
      );
      expect(finding, JSON.stringify(result.findings.filter((f) => f.dimension === 'discipline'))).toBeTruthy();
      expect(finding.detail).toMatch(/<5/);
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
