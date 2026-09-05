import { cleanText, unique } from './compilerText';
import { selectLessonVariant as lessonVariant } from './courseCompilerRealization';

const PRACTICE_INSTRUCTION_FRAMES = [
  'Label the evidence, state the decision it supports, and mark one remaining limitation.',
  'Point to the source detail, explain the inference, and identify the next revision.',
  'Separate observation from judgment, then note what the current evidence cannot establish.',
  'Make the evidence-to-decision link visible and flag the weakest step for feedback.',
  'Annotate the supporting record, the resulting choice, and one boundary on the claim.',
  'Show where the evidence changes the work, then name one question the draft leaves open.',
  'Trace one inspectable detail through reasoning to a bounded conclusion or revision.',
];

const PRACTICE_ACCESS_FRAMES = [
  'Offer an accessible equivalent only when it preserves the same evidence, reasoning, and success criteria.',
  'Accept a different accessible format when the scorer can inspect the same objective evidence and decision.',
  'Provide an accessible response route without changing the evidence standard or criterion expectations.',
  'Let learners use an equivalent accessible medium while keeping every required evidence link visible.',
  'Keep accommodations format-flexible and the assessed evidence contract unchanged.',
  'Support an accessible alternative that makes the same reasoning and revision trace inspectable.',
  'Use accessible structure and an equivalent response mode without lowering the stated criteria.',
];

function practiceIdentity(lesson = {}) {
  const intent = lesson?.instructionalIntent || {};
  return {
    intent,
    lessonNumber: Number(lesson.lessonNumber) || 1,
    artifact: cleanText(intent?.expectedEvidence?.artifact || lesson.studentArtifact, 'lesson practice artifact'),
    criteria: unique(intent?.expectedEvidence?.successCriteria || lesson.successCriteria || [], 5),
  };
}

export function plannedPracticeBriefForLesson(lesson = {}) {
  const { intent, lessonNumber, artifact, criteria } = practiceIdentity(lesson);
  return {
    title: artifact,
    lessonNumber,
    courseMapRef: `Course Map L${lessonNumber} · formative practice`,
    assignmentType: 'Formative practice brief',
    relatedLessons: [lesson.title],
    dueWeek: `Week ${lessonNumber}`,
    estimatedTime: 'Complete during the lesson or the instructor-designated practice window',
    assessmentRole: 'Formative evidence rehearsal',
    assessmentStakes: 'Formative; no course-grade weight is inferred',
    objectives: [...(intent?.targetObjectives || lesson.outcomes || [])],
    overview: lessonVariant(lesson, [
      `Use ${artifact} to test the lesson's evidence-to-decision move before higher-stakes work.`,
      `Build ${artifact} as a low-stakes rehearsal of the lesson's observable evidence and reasoning.`,
      `Treat ${artifact} as a practice record: make the evidence, inference, and remaining limitation easy to inspect.`,
      `Develop ${artifact} far enough to receive criterion-level feedback before the next submission.`,
      `Use ${artifact} to expose the lesson reasoning while revision is still low stakes.`,
      `Prepare ${artifact} as visible practice evidence, then improve the weakest criterion link.`,
      `Make ${artifact} a compact rehearsal of the exact evidence and judgment the lesson teaches.`,
    ]),
    instructions: [
      cleanText(intent?.learnerAction),
      cleanText(intent?.expectedEvidence?.evidenceRequirement),
      lessonVariant(lesson, PRACTICE_INSTRUCTION_FRAMES),
    ].filter(Boolean),
    deliverables: [artifact],
    gradingCriteria: criteria,
    selfAssessmentRubric: criteria.map((criterion) => `${criterion}: point to the evidence in ${artifact}.`),
    progressTracking: lessonVariant(lesson, [
      `Before the practice window closes, mark where ${artifact} satisfies each criterion.`,
      `Use the criterion list to flag the strongest and weakest evidence links in ${artifact}.`,
      `Record which ${artifact} criterion is ready and which still needs evidence.`,
      `Add a short completion trace showing where each criterion appears in ${artifact}.`,
      `Check ${artifact} against the listed criteria and circle the next repair.`,
      `Track ${artifact} by naming the criterion completed after each revision.`,
      `Leave an evidence-location note beside every satisfied ${artifact} criterion.`,
    ]),
    feedbackLoop: lessonVariant(lesson, [
      `Use one criterion-level note to revise ${artifact} before the next lesson task.`,
      `Choose the weakest evidence link in ${artifact}, revise it, and record what changed.`,
      `Apply one piece of feedback to ${artifact} and explain why the revision is stronger.`,
      `Recheck ${artifact} after feedback and preserve a visible before-and-after change.`,
      `Turn the most actionable criterion comment into one documented ${artifact} revision.`,
      `Revise ${artifact} from a specific scoring note, then verify the affected criterion again.`,
      `Carry one evidence-based improvement from ${artifact} into the next lesson task.`,
    ]),
    accessibilityAndUDL: lessonVariant(lesson, PRACTICE_ACCESS_FRAMES),
    tags: unique(['formative-practice', lesson.title, artifact, ...criteria], 10),
  };
}

const RUBRIC_DESCRIPTOR_FRAMES = [
  (artifact, criterion) => ({
    excellent: `${artifact} makes ${criterion} precise, complete, and directly inspectable in the submitted evidence.`,
    proficient: `${criterion} is visible in ${artifact}; only a minor precision or evidence gap remains.`,
    developing: `${artifact} addresses ${criterion}, but the evidence-to-decision link is incomplete.`,
    beginning: `A scorer cannot yet locate sufficient evidence of ${criterion} in ${artifact}.`,
  }),
  (artifact, criterion) => ({
    excellent: `The evidence in ${artifact} fully demonstrates ${criterion} and states its boundary.`,
    proficient: `${artifact} demonstrates ${criterion} with one small boundary or support issue.`,
    developing: `Some evidence for ${criterion} appears, but ${artifact} leaves the inference underexplained.`,
    beginning: `${artifact} names ideas related to ${criterion} without making the required evidence inspectable.`,
  }),
  (artifact, criterion) => ({
    excellent: `Readers can trace ${criterion} from the source detail through the judgment in ${artifact}.`,
    proficient: `The main ${criterion} trace is defensible in ${artifact}, though one step needs sharpening.`,
    developing: `${artifact} contains a partial ${criterion} trace but does not yet justify the resulting choice.`,
    beginning: `No usable source-to-decision trace for ${criterion} is visible in ${artifact}.`,
  }),
  (artifact, criterion) => ({
    excellent: `${artifact} applies ${criterion} accurately and uses it to improve a visible decision.`,
    proficient: `${artifact} applies ${criterion} appropriately with a minor revision still needed.`,
    developing: `The attempted use of ${criterion} in ${artifact} needs clearer evidence or reasoning.`,
    beginning: `${criterion} is absent, inaccurate, or unsupported in the current ${artifact}.`,
  }),
];

export function plannedPracticeRubricForLesson(lesson = {}) {
  const { intent, lessonNumber, artifact, criteria } = practiceIdentity(lesson);
  const weightedCriteria = criteria.length > 0 ? criteria : ['Evidence-linked lesson performance'];
  const weightBase = Math.floor(100 / weightedCriteria.length);
  let assigned = 0;
  const rows = weightedCriteria.map((criterion, index, all) => {
    const weight = index === all.length - 1 ? 100 - assigned : weightBase;
    assigned += weight;
    return {
      criterion,
      weight,
      ...RUBRIC_DESCRIPTOR_FRAMES[(lessonNumber + index) % RUBRIC_DESCRIPTOR_FRAMES.length](artifact, criterion),
    };
  });
  return {
    title: `${artifact} Formative Rubric`,
    lessonNumber,
    courseMapRef: `Course Map L${lessonNumber} · formative practice`,
    lessonTitle: lesson.title,
    gradedWork: artifact,
    assessmentType: 'Formative practice rubric',
    totalPoints: 100,
    taskDirections: cleanText(intent?.learnerAction),
    criteria: rows,
    instructorFacilitationNote: `Score ${artifact} only against the listed lesson criteria. Give one criterion-level revision note and recheck the changed evidence.`,
    accessibilityAndUDL:
      'Accept equivalent accessible evidence formats when they preserve the same objective and criterion standard.',
    teacherNotes:
      'This practice rubric does not create a course-grade weight; confirm any local grading decision before publication.',
    tags: unique(['formative-rubric', lesson.title, artifact, ...criteria], 10),
  };
}
