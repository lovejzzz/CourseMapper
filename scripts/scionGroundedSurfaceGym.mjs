import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const fixturePath = path.join(root, 'evaluation', 'scion-grounded-surface-gym-v1.json');
const outputDir = path.join(root, 'verification-output', 'scion-grounded-surface-gym');
const genericEvidencePattern = /\bsource-backed case example\b|\brelated claim\b|\bclaim-boundary note\b/i;

function courseMapForCase(entry) {
  return {
    courseName: entry.courseName,
    semester: 'Evaluation fixture',
    lessons: [
      {
        title: `Lesson 1: ${entry.lessonTitle}`,
        sections: [
          {
            topicSection: entry.topics,
            learningGoals: `Explain ${entry.lessonTitle} using admitted source evidence.`,
            learningObjectives: `Apply ${entry.lessonTitle} to one bounded course decision and justify the evidence used.`,
            weeklyAssessments: entry.assessment,
            asyncActivities: `Inspect the named source and annotate two claims about ${entry.lessonTitle}.`,
            syncActivities: `Compare two interpretations of ${entry.lessonTitle} and defend the stronger one.`,
            supportingResources: entry.sources.map((source) => source.displayTitle).join('; '),
            evaluateDesign: `Score source accuracy, decision logic, and the stated evidence boundary for ${entry.assessment}.`,
          },
        ],
      },
    ],
  };
}

async function loadRuntime() {
  const server = await createServer({
    appType: 'custom',
    cacheDir: path.join(root, 'node_modules', '.vite', `scion-grounded-surface-gym-${process.pid}`),
    logLevel: 'error',
    optimizeDeps: { entries: [], noDiscovery: true },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  await server.pluginContainer.buildStart({});
  try {
    const [compiler, grounding] = await Promise.all([
      server.ssrLoadModule('/src/lib/courseBlueprintCompiler.js'),
      server.ssrLoadModule('/src/lib/quality/groundedFraction.js'),
    ]);
    return { server, compiler, grounding };
  } catch (error) {
    await server.close();
    throw error;
  }
}

function compileCase(entry, compiler) {
  const blueprint = compiler.buildCourseBlueprint(courseMapForCase(entry));
  blueprint.lessons[0].enrichment = {
    enrichmentSource: 'algi-researched',
    conceptProvenance: {
      source: 'algi-researched',
      fullyAnchored: true,
      citations: entry.sources,
    },
    kernel: {
      facts: entry.facts,
      scenario: {
        materials: 'the source-backed case example, related claim, and claim-boundary note',
      },
    },
    keyTerms: entry.keyTerms,
    studyGuide: { summary: entry.summary },
  };
  return compiler.compileBlueprintDeliverables(blueprint, ['syllabus', 'lessonPlans', 'rubrics', 'studyGuides']);
}

function withoutEvidenceBriefs(value) {
  if (Array.isArray(value)) return value.map((item) => withoutEvidenceBriefs(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'sourceEvidenceBrief')
      .map(([key, child]) => [key, withoutEvidenceBriefs(child)]),
  );
}

function sentenceKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function duplicateSummarySentence(summary) {
  const keys = String(summary || '')
    .split(/(?<=[.!?])\s+/)
    .map(sentenceKey)
    .filter(Boolean);
  return new Set(keys).size !== keys.length;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function evaluateCase(entry, runtime) {
  const compiled = compileCase(entry, runtime.compiler);
  const plan = compiled.lessonPlans.lessonPlans[0];
  const rubric = compiled.rubrics.rubrics[0];
  const guide = compiled.studyGuides.studyGuides[0];
  const syllabus = compiled.syllabus.syllabus;
  const packetJson = JSON.stringify(plan.sourceEvidenceBrief || null);
  const current = runtime.grounding.measurePackageGroundedFraction(compiled);
  const counterfactual = runtime.grounding.measurePackageGroundedFraction(withoutEvidenceBriefs(compiled));
  const visibleGuide = {
    summary: guide.summary,
    sourceEvidenceBrief: guide.sourceEvidenceBrief,
    keyTerms: guide.keyTerms,
    conceptConnections: guide.conceptConnections,
    commonMisconceptions: guide.commonMisconceptions,
    reviewQuestions: guide.reviewQuestions,
    practiceActivities: guide.practiceActivities,
    examPrep: guide.examPrep,
  };
  const specializedMusicFrame = entry.domain === 'music-theory';
  const firstReviewQuestion = guide.reviewQuestions?.[0]?.question || '';
  const firstPracticeActivity = guide.practiceActivities?.[0] || '';
  const checks = {
    canonicalPacketParity:
      packetJson === JSON.stringify(rubric.sourceEvidenceBrief || null) &&
      packetJson === JSON.stringify(guide.sourceEvidenceBrief || null),
    fourDistinctClaims:
      plan.sourceEvidenceBrief?.claims?.length >= 4 &&
      new Set(plan.sourceEvidenceBrief.claims.map(sentenceKey)).size === plan.sourceEvidenceBrief.claims.length,
    retainedSources: plan.sourceEvidenceBrief?.sources?.length >= 1,
    summaryDeduplicated: !duplicateSummarySentence(guide.summary),
    placeholderRemoved: !genericEvidencePattern.test(JSON.stringify(visibleGuide)),
    comparativeQuestion:
      /compare these two source claims/i.test(firstReviewQuestion) ||
      (specializedMusicFrame &&
        /inclusive letter-name count/i.test(firstReviewQuestion) &&
        /semitone/i.test(firstReviewQuestion)),
    comparativePractice:
      /compare these source claims/i.test(firstPracticeActivity) ||
      (specializedMusicFrame &&
        /inclusive letter-name count/i.test(firstPracticeActivity) &&
        /semitone/i.test(firstPracticeActivity)),
    syllabusUsesEvidence:
      syllabus.courseDescription.includes(entry.facts[0].replace(/[.!?]+$/, '')) ||
      (specializedMusicFrame &&
        /inclusive count of letter names|count letter names inclusively/i.test(syllabus.courseDescription)),
    lessonPlanGroundingIncreased:
      current.perFeature.lessonPlans.groundedBytes > counterfactual.perFeature.lessonPlans.groundedBytes,
    rubricGroundingIncreased:
      current.perFeature.rubrics.groundedBytes > counterfactual.perFeature.rubrics.groundedBytes,
    studyGuideGroundingIncreased:
      current.perFeature.studyGuides.groundedBytes > counterfactual.perFeature.studyGuides.groundedBytes,
  };
  return {
    id: entry.id,
    domain: entry.domain,
    status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
    checks,
    evidence: {
      claimCount: plan.sourceEvidenceBrief?.claims?.length || 0,
      sourceCount: plan.sourceEvidenceBrief?.sources?.length || 0,
      summary: guide.summary,
      firstReviewQuestion,
      firstPracticeActivity,
      courseDescription: syllabus.courseDescription,
    },
    grounding: {
      counterfactual: Object.fromEntries(
        ['syllabus', 'lessonPlans', 'rubrics', 'studyGuides'].map((featureId) => [
          featureId,
          counterfactual.perFeature[featureId],
        ]),
      ),
      current: Object.fromEntries(
        ['syllabus', 'lessonPlans', 'rubrics', 'studyGuides'].map((featureId) => [
          featureId,
          current.perFeature[featureId],
        ]),
      ),
    },
  };
}

function markdownReport(report) {
  const lines = [
    '# Scion grounded-surface gym',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    'This is a deterministic compiler/application test. It proves canonical admitted evidence reaches visible surfaces; it does not prove the fixture claims independently, instructor preference, accessibility, or classroom outcomes.',
    '',
    `Status: **${report.status}** (${report.summary.passed}/${report.summary.total} cases)`,
    '',
    '| Domain | Result | Claims | Sources | Lesson plan | Rubric | Study guide |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const entry of report.cases) {
    const delta = (featureId) => {
      const before = entry.grounding.counterfactual[featureId]?.fraction || 0;
      const after = entry.grounding.current[featureId]?.fraction || 0;
      return `${percent(before)} → ${percent(after)}`;
    };
    lines.push(
      `| ${entry.domain} | ${entry.status} | ${entry.evidence.claimCount} | ${entry.evidence.sourceCount} | ${delta(
        'lessonPlans',
      )} | ${delta('rubrics')} | ${delta('studyGuides')} |`,
    );
  }
  lines.push('', '## Acceptance boundary', '');
  lines.push(
    '- Every case must carry one byte-identical evidence packet across Lesson Plans, Rubrics, and Study Guides.',
    '- Each packet must retain at least four distinct admitted claims and one source.',
    '- Duplicate summary sentences and internal source-placeholder language must be absent.',
    '- The first study question and practice activity must compare distinct admitted claims.',
    '- Grounded bytes must increase on all three historically weak surfaces only because the visible packet exists.',
    '',
  );
  return `${lines.join('\n')}\n`;
}

const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
const runtime = await loadRuntime();
let cases;
try {
  cases = fixture.cases.map((entry) => evaluateCase(entry, runtime));
} finally {
  await runtime.server.close();
}
const report = {
  schemaVersion: 1,
  benchmarkId: fixture.id,
  generatedAt: new Date().toISOString(),
  status: cases.every((entry) => entry.status === 'passed') ? 'passed' : 'failed',
  summary: {
    total: cases.length,
    passed: cases.filter((entry) => entry.status === 'passed').length,
    failed: cases.filter((entry) => entry.status === 'failed').length,
  },
  cases,
};

if (process.argv.includes('--write')) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), markdownReport(report));
}

process.stdout.write(`${markdownReport(report)}\n`);
if (report.status !== 'passed') process.exitCode = 1;
