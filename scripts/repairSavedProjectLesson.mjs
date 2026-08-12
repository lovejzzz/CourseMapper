#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

const argv = process.argv.slice(2);
const projectPath = valueAfter(argv, '--project');
const outputPath = valueAfter(argv, '--output');
const lessonNumber = Number(valueAfter(argv, '--lesson-number'));
const title = valueAfter(argv, '--title');
const topic = valueAfter(argv, '--topic');
const objective = valueAfter(argv, '--objective');
if (!projectPath || !outputPath || !Number.isInteger(lessonNumber) || !title || !topic || !objective) {
  throw new Error(
    'Usage: node scripts/repairSavedProjectLesson.mjs --project <input.coursemapper> --output <output.coursemapper> --lesson-number <n> --title <title> --topic <topic> --objective <objective>',
  );
}

const project = JSON.parse(await fs.readFile(path.resolve(projectPath), 'utf8'));
const index = lessonNumber - 1;
const lesson = project?.courseMap?.lessons?.[index];
const session = project?.courseGraph?.sessions?.find(
  (candidate) => Number(candidate?.number) === lessonNumber || candidate?.id === `s${lessonNumber}`,
);
if (!lesson || !session) throw new Error(`Lesson ${lessonNumber} is absent from the saved course map or graph.`);

const displayTitle = /^lesson\s+\d+\s*:/i.test(title) ? title : `Lesson ${lessonNumber}: ${title}`;
const shortTitle = displayTitle.replace(/^lesson\s+\d+\s*:\s*/i, '');
const assessmentTitle = `weekly homework: ${shortTitle}`;
const sourceResourceId = `r${lessonNumber * 5 - 1}`;
const objectiveId = session.sections?.[0]?.objectiveRefs?.[0] || `o${lessonNumber}`;
const conceptId = session.sections?.[0]?.conceptRefs?.[0] || `c${lessonNumber}`;

project.courseMap.lessons[index] = {
  ...lesson,
  title: displayTitle,
  sections: [
    {
      ...(lesson.sections?.[0] || {}),
      topicSection: topic,
      learningGoals: `1. Explain the design logic of ${topic}.\n2. Apply ${topic} to a bounded decision and identify a threat to validity.`,
      learningObjectives: objective,
      weeklyAssessments: `1. ${assessmentTitle} → Assignment Briefs / Lesson ${String(lessonNumber).padStart(2, '0')}`,
      asyncActivities: `1. Annotate a study description for treatment, response, experimental units, and assignment method.\n2. Identify one confound or source of bias and propose a design correction.`,
      syncActivities: `1. Compare randomized and non-randomized study designs using a visible design map.\n2. Defend which causal conclusion the evidence can and cannot support.`,
      supportingResources: `Activity guide for ${topic} with design vocabulary, validity checks, and feedback cues.`,
      evaluateDesign: `Make the ${topic} task produce a study-design diagram and an evidence-bounded conclusion.`,
    },
  ],
};

session.title = displayTitle;
session.sections = [
  {
    ...(session.sections?.[0] || {}),
    topic,
    goals: [`Explain the design logic of ${topic}.`, `Apply ${topic} and identify a threat to validity.`],
    objectiveRefs: [objectiveId],
    assessmentRefs: [`A${lessonNumber}.1`],
    resourceRefs: [sourceResourceId],
    asyncActivities: [
      'Annotate a study description for treatment, response, experimental units, and assignment method.',
      'Identify one confound or source of bias and propose a design correction.',
    ],
    syncActivities: [
      'Compare randomized and non-randomized study designs using a visible design map.',
      'Defend which causal conclusion the evidence can and cannot support.',
    ],
    extras: {
      ...(session.sections?.[0]?.extras || {}),
      evaluateDesign: `Make the ${topic} task produce a study-design diagram and an evidence-bounded conclusion.`,
    },
    conceptRefs: [conceptId],
  },
];

const objectiveNode = (project.courseGraph.outcomes || []).find((candidate) => candidate?.id === objectiveId);
if (objectiveNode) objectiveNode.text = objective;
const conceptNode = (project.courseGraph.concepts || []).find((candidate) => candidate?.id === conceptId);
if (conceptNode) {
  for (const key of Object.keys(conceptNode)) delete conceptNode[key];
  Object.assign(conceptNode, { id: conceptId, term: topic, source: 'saved-project-lesson-repair' });
}
const resourceNode = (project.courseGraph.resources || []).find((candidate) => candidate?.id === sourceResourceId);
if (resourceNode) {
  resourceNode.citation = `Activity guide for ${topic} with design vocabulary, validity checks, and feedback cues.`;
  resourceNode.sessionRefs = [lessonNumber];
}
const assessment = (project.courseGraph.assessments || []).find((candidate) => candidate?.id === `A${lessonNumber}.1`);
if (assessment) {
  assessment.title = assessmentTitle;
  assessment.sourceText = assessmentTitle;
}
if (project.courseGraph.enrichmentOverlay?.lessonContent) {
  delete project.courseGraph.enrichmentOverlay.lessonContent[`lesson-${lessonNumber}`];
}
delete project.blueprint;
delete project.deliverables;
delete project.packageQualityPass;
delete project.lastRunDigest;

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(project, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ output: path.resolve(outputPath), lessonNumber, title: displayTitle, topic }, null, 2)}\n`,
);
