// Development output inspection, not the v3 benchmark or a model receipt.
// Run with vite-node. Uses the app's actual creation transaction and exporters.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { proportionPresentationFixture } from '../../tests/fixtures/teaching/proportionPresentation.js';
import { comparisonDesignFixture } from '../../tests/fixtures/teaching/comparisonDesign.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../../src/lib/courseBlueprintCompiler.js';
import {
  createNewTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../../src/lib/teachingTaskReview.js';
import { normalizeRestoredDeliverables } from '../../src/model/courseStore.jsx';
import { readTeachingTaskSources } from '../../src/lib/teachingProgram.js';
import { rebuildTeachingTaskSource } from '../../src/lib/teachingTaskSource.js';
import { deriveCourseGraphFromCourseMap } from '../../src/lib/courseGraph/index.js';
import { buildDeliverableDocxBlob } from '../../src/lib/exporters/bulkDocxExporter.js';
import { buildClassroomPdfBlob, deliverablePdfDefinition } from '../../src/lib/exporters/classroomPdf.js';

const root = process.argv[2];
if (!root) throw new Error('Provide a new output directory; existing captures are never overwritten.');
// Keep the original default for reproducing prior proportion captures.
const operation = process.argv[3] || 'observed-proportion';
if (!['observed-proportion', 'paired-condition-confound'].includes(operation))
  throw new Error('Unsupported capture operation.');
const experiment = operation === 'paired-condition-confound';
const outputFeatures =
  process.argv[4]?.split(',') || (experiment ? ['assignments', 'rubrics', 'studyGuides'] : ['rubrics', 'studyGuides']);
if (outputFeatures.some((feature) => !['assignments', 'rubrics', 'studyGuides', 'quizBank'].includes(feature)))
  throw new Error('Unsupported inspection feature.');
await fs.mkdir(root, { recursive: false });
const actualFetch = globalThis.fetch;
// A CLI has no Vite asset server. Load only the same shipped font bytes that
// the browser exporter fetches; all layout and content still use product code.
globalThis.fetch = async (url, options) => {
  if (typeof url === 'string' && /^\/studio-public\/fonts\/[A-Za-z0-9-]+\.otf(?:\?|$)/.test(url))
    return new Response(await fs.readFile(path.resolve(url.split('?')[0].slice(1))));
  return actualFetch(url, options);
};
const features = [
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
const report = [];
try {
  for (const zh of [false, true]) {
    const f = (experiment ? comparisonDesignFixture : proportionPresentationFixture)(zh);
    const name = experiment
      ? zh
        ? '保温套与温降的比较设计'
        : 'Designing a comparison of ink drying'
      : zh
        ? '维修记录与观察范围'
        : 'Repair records and observation limits';
    const map = {
      courseName: name,
      lessons: [
        {
          title: name,
          sections: [{ topicSection: name, learningObjectives: f.objective, weeklyAssessments: f.objective }],
        },
      ],
    };
    const facts = f.inputs.map((input) => input.text);
    const blueprint = buildCourseBlueprint(map, {
      sourceBrief: `${f.objective}\nSource facts:\n${facts.map((text, i) => `${i + 1}. ${text}`).join('\n')}`,
      sessionMinutes: 50,
      instructorProvidedFacts: facts,
    });
    const compiled = compileBlueprintDeliverables(blueprint, features);
    const courseMap = reconcileCourseMapWithBlueprintSemanticAdmission(map, compiled[BLUEPRINT_COMPILE_CONTEXT]);
    const deliverables = normalizeRestoredDeliverables(
      Object.fromEntries(features.map((id) => [id, { status: 'done', stale: false, data: compiled[id] }])),
    );
    const draft = createNewTeachingTaskReviewDraft(courseMap, { lessonNumber: 1, operation });
    assert(draft.creation, draft.message);
    draft.inputs = f.inputs;
    draft.objective = f.objective;
    draft.bindings = Object.fromEntries(
      Object.entries(f.bindings).map(([role, span]) => [
        role,
        {
          inputId: span.inputId,
          quote: f.inputs.find((input) => input.id === span.inputId).text.slice(span.start, span.end),
          occurrence: 0,
        },
      ]),
    );
    const preview = previewTeachingTaskReview({ courseMap, deliverables, draft });
    assert.equal(preview.status, 'preview', preview.message);
    // Explicit structure fixture reviewed by its implementer, not independent
    // teacher validation and not an automatically accepted Scion proposal.
    const applied = commitTeachingTaskReview({ courseMap, deliverables, preview, teacherConfirmed: true });
    assert.equal(applied.status, 'applied', applied.message);
    assert.equal(applied.modelCalls, 0);
    assert.deepEqual(applied.conflicts, []);
    assert.deepEqual(Object.keys(applied.changed).sort(), features.toSorted());
    const current = { ...deliverables, ...applied.changed };
    const task = rebuildTeachingTaskSource(readTeachingTaskSources(applied.courseMap)[0]);
    const dir = path.join(root, zh ? 'zh' : 'en');
    await fs.mkdir(dir);
    await fs.writeFile(path.join(dir, 'task.json'), JSON.stringify(task, null, 2));
    await fs.writeFile(
      path.join(dir, 'project.coursemapper'),
      JSON.stringify(
        {
          formatVersion: 2,
          courseMap: applied.courseMap,
          courseGraph: deriveCourseGraphFromCourseMap(applied.courseMap),
          deliverables: current,
          userEdits: [],
          selectedFeatures: ['courseMap', ...features],
          hasGenerated: true,
          activeTab: 'rubrics',
          provider: 'public',
          modelId: 'scion-public',
          promptText: f.objective,
        },
        null,
        2,
      ),
    );
    for (const feature of outputFeatures) {
      const data = current[feature].data;
      const docx = await buildDeliverableDocxBlob(feature, data, name);
      await fs.writeFile(path.join(dir, `${feature}.docx`), Buffer.from(await docx.arrayBuffer()));
      const pdf = await buildClassroomPdfBlob(deliverablePdfDefinition(feature, data, name));
      await fs.writeFile(path.join(dir, `${feature}.pdf`), Buffer.from(await pdf.arrayBuffer()));
    }
    report.push({
      language: zh ? 'zh' : 'en',
      path: dir,
      taskId: task.id,
      taskRevision: task.revision,
      modelCalls: 0,
      changedMaterials: Object.keys(applied.changed),
      input: f.inputs,
      reviewBasis: 'implementer-constructed explicit structure',
      answer: task.answer,
      alternative: task.contrastResponses[3].response,
    });
  }
  await fs.writeFile(
    path.join(root, 'capture.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        operation,
        scope: `Two development tasks and ${2 * outputFeatures.length} actual DOCX/PDF export pairs. Not a full course or held-out/model evaluation.`,
        report,
      },
      null,
      2,
    ),
  );
  console.log(`Captured ${report.length} development tasks with the production creation and export paths at ${root}`);
} finally {
  globalThis.fetch = actualFetch;
}
