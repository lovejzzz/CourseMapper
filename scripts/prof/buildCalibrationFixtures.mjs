/**
 * scripts/prof/buildCalibrationFixtures.mjs — builds the KNOWN-BAD calibration
 * fixture for the persona calibration gate and the variance-kill run
 * (design doc §6/§13.1). Run via vite-node (extensionless src imports):
 *
 *   npx vite-node scripts/prof/buildCalibrationFixtures.mjs
 *
 * Known-bad = the same cs-python course compiled BARE (no kernel enrichment):
 * the mail-merge tier the grader's boilerplate nets exist to catch. The
 * fixture is the grader-extracted file list (path/featureId/lessonNumber/
 * text) produced by the real exporters — export-shaped text, honoring the
 * Artifact Bridge. Deterministic and free; regenerate any time.
 *
 * Known-good needs no builder: the 99/A zero-defect live round
 * (round-2026-07-02T04-17-40-825Z) is the fixture.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..');

const COURSE = {
  courseName: 'Introduction to Computer Science with Python',
  lessons: Array.from({ length: 15 }, (_, i) => ({
    title: `Lesson ${i + 1}: Python Topic ${i + 1}`,
    sections: [
      {
        topicSection: `${i + 1}.1: Core concept ${i + 1}`,
        learningGoals: `Understand topic ${i + 1}.`,
        learningObjectives: `Apply topic ${i + 1} in an exercise.`,
        weeklyAssessments: i === 10 ? 'Midterm exam' : `Autograded quiz ${i + 1}`,
        asyncActivities: 'Read the module.',
        syncActivities: 'Attend the session.',
        supportingResources: 'Course materials',
      },
    ],
  })),
};

async function main() {
  const { deriveCourseGraphFromCourseMap } = await import(
    path.join(repoRoot, 'src/lib/courseGraph/deriveFromCourseMap.js')
  );
  const { buildBlueprintFromGraph } = await import(path.join(repoRoot, 'src/lib/courseGraph/blueprintFromGraph.js'));
  const { compileBlueprintDeliverables } = await import(path.join(repoRoot, 'src/lib/courseBlueprintCompiler.js'));
  const { buildCourseMaterialsZip } = await import(path.join(repoRoot, 'src/lib/packageZipExporter.js'));
  const { extractPackage } = await import(path.join(repoRoot, 'src/lib/quality/deepQualityGrader.js'));
  const { createMemoryFileProvider } = await import(path.join(repoRoot, 'src/lib/quality/fileProviders.js'));

  const graph = deriveCourseGraphFromCourseMap(COURSE);
  const blueprint = buildBlueprintFromGraph(graph); // NO enrichment — the bare tier
  const featureIds = [
    'syllabus',
    'lessonPlans',
    'slideDecks',
    'assignments',
    'rubrics',
    'discussions',
    'quizBank',
    'studyGuides',
    'courseFaq',
  ];
  const deliverables = compileBlueprintDeliverables(blueprint, featureIds, {});
  const deliverableState = Object.fromEntries(featureIds.map((id) => [id, { status: 'done', data: deliverables[id] }]));

  // Real exporters → real binaries → the grader's own extraction: the
  // fixture text is exactly what a professor's eyes would meet.
  const assembled = await buildCourseMaterialsZip({
    courseMap: COURSE,
    deliverables: deliverableState,
    featureIds: ['courseMap', ...featureIds],
    assembleOnly: true,
    quality: false,
  });
  const extracted = await extractPackage(createMemoryFileProvider(assembled.fileContents));

  const fixture = {
    label: 'known-bad-bare-compile',
    builtAt: new Date().toISOString(),
    files: extracted.files.map((file) => ({
      path: file.path,
      featureId: file.featureId,
      lessonNumber: file.lessonNumber ?? null,
      text: file.text || '',
    })),
  };
  const nonEmpty = fixture.files.filter((file) => file.text.length > 100).length;
  const outDir = path.join(repoRoot, 'verification-output', 'prof', 'fixtures');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'known-bad-extracted.json');
  await fs.writeFile(outPath, JSON.stringify(fixture, null, 2));
  console.log(`[fixtures] known-bad: ${fixture.files.length} files (${nonEmpty} with substantive text)`);
  if (nonEmpty < 50) throw new Error('Fixture looks empty — extraction failed.');
  console.log(`[fixtures] wrote ${path.relative(repoRoot, outPath)}`);
}

main().catch((error) => {
  console.error(`[fixtures] FAILED: ${error.message}`);
  process.exitCode = 1;
});
