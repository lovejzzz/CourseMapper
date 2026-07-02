/**
 * scripts/prof/buildStructuredPackages.mjs — materialize STRUCTURED packages
 * for the P1 zero-token classroom (design §3). Run via vite-node:
 *
 *   npx vite-node scripts/prof/buildStructuredPackages.mjs
 *
 * The student MIND consumes structure (concepts, items, options,
 * explanations), not rendered prose — the Artifact Bridge rule governs
 * persona mouths, not the state machine's substrate (§3a). Two packages:
 *   1. research-methods — the first gold-audit project (realistic, curated)
 *   2. cs-python-bare  — the mail-merge tier (the known-bad twin)
 * Both deterministic, $0. Workload ratios ride along from the accountant
 * over the same assembled exports.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..');

const BARE_CS_COURSE = {
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

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function conceptTermForItem(item, lessonConcepts) {
  const tags = item.tags || [];
  for (const tag of tags) {
    if (lessonConcepts.some((concept) => concept.term.toLowerCase() === String(tag).toLowerCase())) return tag;
  }
  return lessonConcepts[0]?.term || tags[1] || 'unknown';
}

async function buildOne({ id, courseMap }) {
  const { deriveCourseGraphFromCourseMap } = await import(
    path.join(repoRoot, 'src/lib/courseGraph/deriveFromCourseMap.js')
  );
  const { buildBlueprintFromGraph } = await import(path.join(repoRoot, 'src/lib/courseGraph/blueprintFromGraph.js'));
  const { compileBlueprintDeliverables } = await import(path.join(repoRoot, 'src/lib/courseBlueprintCompiler.js'));
  const { buildCourseMaterialsZip } = await import(path.join(repoRoot, 'src/lib/packageZipExporter.js'));
  const { extractPackage } = await import(path.join(repoRoot, 'src/lib/quality/deepQualityGrader.js'));
  const { createMemoryFileProvider } = await import(path.join(repoRoot, 'src/lib/quality/fileProviders.js'));
  const { buildWorkloadAccount } = await import(path.join(moduleDir, 'workloadAccountant.mjs'));

  const graph = deriveCourseGraphFromCourseMap(courseMap);
  const blueprint = buildBlueprintFromGraph(graph);
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

  // Structured layer for the mind.
  const lessons = blueprint.lessons.map((lesson) => ({
    lesson: lesson.lessonNumber,
    concepts: (lesson.keyConcepts || []).slice(0, 6).map((term) => ({
      id: `L${lesson.lessonNumber}:${slug(term)}`,
      term,
    })),
    hasStudyGuide: true,
    hasAssignment: true,
    hasLessonPlan: true,
  }));
  const conceptIdByLessonTerm = new Map();
  for (const lesson of lessons) {
    for (const concept of lesson.concepts) {
      conceptIdByLessonTerm.set(`${lesson.lesson}|${concept.term.toLowerCase()}`, concept.id);
    }
  }

  const items = [];
  for (const quiz of deliverables.quizBank?.quizzes || []) {
    const lessonNumber = quiz.lessonNumber || 1;
    const kind = quiz.kind === 'exam' ? 'exam' : 'weekly';
    const lessonConcepts = lessons.find((lesson) => lesson.lesson === lessonNumber)?.concepts || [];
    for (const question of quiz.questions || []) {
      if (question.type !== 'multiple_choice' && kind === 'weekly') continue;
      const options = Array.isArray(question.options) ? question.options : [];
      if (options.length < 2) continue;
      const term = conceptTermForItem(question, lessonConcepts);
      const conceptId =
        conceptIdByLessonTerm.get(`${lessonNumber}|${String(term).toLowerCase()}`) ||
        lessonConcepts[0]?.id ||
        `L${lessonNumber}:unknown`;
      const answerIndex = 'ABCDEF'.indexOf(
        String(question.answer || 'A')
          .trim()
          .charAt(0),
      );
      items.push({
        itemId: question.id || `${id}-${lessonNumber}-${items.length}`,
        lesson: lessonNumber,
        conceptId,
        conceptTerm: term,
        optionCount: options.length,
        difficulty: question.difficulty || 'Medium',
        stem: String(question.question || ''),
        options: options.map(String),
        answerLetter: 'ABCDEF'.charAt(Math.max(0, answerIndex)),
        distractorTexts: options.filter((_, index) => index !== answerIndex).map((option) => String(option)),
        explanationText: String(question.explanation || ''),
        explanationGrounded: Boolean(question.enrichmentSource || quiz.enrichmentSource),
        kind,
      });
    }
  }

  // Workload account over the REAL assembled exports.
  const deliverableState = Object.fromEntries(
    featureIds.map((fid) => [fid, { status: 'done', data: deliverables[fid] }]),
  );
  const assembled = await buildCourseMaterialsZip({
    courseMap,
    deliverables: deliverableState,
    featureIds: ['courseMap', ...featureIds],
    assembleOnly: true,
    quality: false,
  });
  const extracted = await extractPackage(createMemoryFileProvider(assembled.fileContents));
  const workload = buildWorkloadAccount(extracted);

  // Mouth materials (P2): rendered brief/rubric text per lesson (the mouths
  // read what students read — Artifact Bridge), FAQ questions and discussion
  // prompts/positions from the structured deliverables.
  const textFor = (featureId, lessonNumber) =>
    extracted.files.find((file) => file.featureId === featureId && file.lessonNumber === lessonNumber)?.text || '';
  const mouthMaterials = {
    faqQuestions: (deliverables.courseFaq?.faqs || []).flatMap((faq) => (faq.qs || []).map((entry) => entry.q)),
    byLesson: Object.fromEntries(
      lessons.map((lesson) => {
        // Discussion entries carry no lessonNumber — they are ordered by lesson.
        const discussion = (deliverables.discussions?.discussions || [])[lesson.lesson - 1];
        return [
          lesson.lesson,
          {
            briefText: textFor('assignments', lesson.lesson).slice(0, 4000),
            rubricText: textFor('rubrics', lesson.lesson).slice(0, 4000),
            discussionPrompt: discussion?.prompt || '',
            positions: discussion?.positionMap || [],
          },
        ];
      }),
    ),
  };

  return {
    id,
    builtAt: new Date().toISOString(),
    lessons,
    items,
    mouthMaterials,
    weekRatios: Object.fromEntries(workload.weeks.map((week) => [week.lesson, week.ratio])),
    workloadFinding: workload.finding,
  };
}

async function main() {
  const { DEFAULT_AUDIT_PROJECTS } = await import(path.join(repoRoot, 'scripts/hybridPipelineAudit.mjs'));
  const gold = DEFAULT_AUDIT_PROJECTS[0];
  const outDir = path.join(repoRoot, 'verification-output', 'prof', 'fixtures');
  await fs.mkdir(outDir, { recursive: true });
  for (const spec of [
    { id: 'research-methods-gold', courseMap: gold.courseMap },
    { id: 'cs-python-bare', courseMap: BARE_CS_COURSE },
  ]) {
    const structured = await buildOne(spec);
    const outPath = path.join(outDir, `structured-${spec.id}.json`);
    await fs.writeFile(outPath, JSON.stringify(structured, null, 2));
    console.log(
      `[structured] ${spec.id}: ${structured.lessons.length} lessons, ${structured.items.length} items (${
        structured.items.filter((item) => item.kind === 'exam').length
      } exam) → ${path.relative(repoRoot, outPath)}`,
    );
  }
}

main().catch((error) => {
  console.error(`[structured] FAILED: ${error.message}`);
  process.exitCode = 1;
});
