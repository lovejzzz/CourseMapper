import { cleanText } from './compilerText.js';

function uniqueText(values = []) {
  const seen = new Set();
  return values.map(cleanText).filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function intentForLesson(instructionalPlan = {}, lesson = {}, index = 0) {
  const intents = Array.isArray(instructionalPlan?.lessonIntents) ? instructionalPlan.lessonIntents : [];
  const lessonNumber = Number(lesson?.lessonNumber) || index + 1;
  return (
    intents.find((intent) => Number(intent?.lessonNumber) === lessonNumber) ||
    intents.find((intent) => intent?.id && intent.id === lesson?.id) ||
    intents[index] ||
    null
  );
}

function distributeObjectives(objectives, sectionCount, sectionIndex) {
  // Keep each section's assignment contiguous so flattening section text on
  // the next planning pass reconstructs the same objective order. Round-robin
  // distribution made an overflow objective jump ahead of the middle
  // objectives (0,3,1,2 for four objectives across three sections), creating
  // a non-converging synchronization cycle for otherwise valid plans.
  const start = Math.floor((sectionIndex * objectives.length) / sectionCount);
  const end = Math.floor(((sectionIndex + 1) * objectives.length) / sectionCount);
  const assigned = objectives.slice(start, end);
  if (assigned.length > 0) return assigned;
  return [objectives[Math.min(start, objectives.length - 1)]];
}

/**
 * Project the admitted instructional plan back onto the instructor-facing
 * Course Map. The plan is the final pre-draft authority: package manifests
 * must never grade objectives that the compiler did not authorize and render.
 */
export function synchronizeCourseMapWithInstructionalPlan(courseMap = {}, instructionalPlan = {}) {
  const synchronized = structuredClone(courseMap);
  synchronized.lessons = (Array.isArray(synchronized.lessons) ? synchronized.lessons : []).map((lesson, index) => {
    const objectives = uniqueText(intentForLesson(instructionalPlan, lesson, index)?.targetObjectives || []);
    const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
    if (objectives.length === 0 || sections.length === 0) return lesson;
    return {
      ...lesson,
      sections: sections.map((section, sectionIndex) => ({
        ...section,
        learningObjectives: distributeObjectives(objectives, sections.length, sectionIndex).join('\n'),
      })),
    };
  });
  return synchronized;
}

function bloomVerb(objective = '') {
  return cleanText(objective).split(/\s+/)[0]?.toLowerCase() || '';
}

function stableOutcomeId(session = {}, lessonNumber = 0, objectiveIndex = 0, usedIds = new Set()) {
  const stem = `plan-outcome-${cleanText(session?.id, `lesson-${lessonNumber}`).replace(/[^a-z0-9_-]+/gi, '-')}`;
  let candidate = `${stem}-${objectiveIndex + 1}`;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${stem}-${objectiveIndex + 1}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

/**
 * Apply the same authority to CourseGraph without discarding evidence,
 * resources, registries, or enrichment attached to the saved graph.
 */
export function synchronizeCourseGraphWithInstructionalPlan(courseGraph = {}, instructionalPlan = {}) {
  const synchronized = structuredClone(courseGraph);
  const sessions = Array.isArray(synchronized.sessions) ? synchronized.sessions : [];
  const outcomes = Array.isArray(synchronized.outcomes) ? synchronized.outcomes : [];
  const outcomesById = new Map(outcomes.map((outcome) => [outcome?.id, outcome]));
  const allReferencedIds = new Set(
    sessions.flatMap((session) =>
      (Array.isArray(session?.sections) ? session.sections : []).flatMap((section) => section?.objectiveRefs || []),
    ),
  );
  const usedIds = new Set(outcomes.map((outcome) => outcome?.id).filter(Boolean));
  const replacedIds = new Set();
  const replacementOutcomes = [];

  synchronized.sessions = sessions.map((session, index) => {
    const intent = intentForLesson(instructionalPlan, session, index);
    const objectives = uniqueText(intent?.targetObjectives || []);
    const sections = Array.isArray(session?.sections) ? session.sections : [];
    if (objectives.length === 0 || sections.length === 0) return session;

    const existingIds = uniqueText(sections.flatMap((section) => section?.objectiveRefs || []));
    existingIds.forEach((id) => replacedIds.add(id));
    const objectiveIds = objectives.map((objective, objectiveIndex) => {
      const existingId = existingIds[objectiveIndex];
      const id = existingId || stableOutcomeId(session, intent?.lessonNumber || index + 1, objectiveIndex, usedIds);
      replacementOutcomes.push({
        ...(outcomesById.get(id) || {}),
        id,
        text: objective,
        label: outcomesById.get(id)?.label || '',
        bloomVerb: bloomVerb(objective),
        level: 'session',
        sessionRef: session.id,
      });
      return id;
    });
    return {
      ...session,
      sections: sections.map((section, sectionIndex) => ({
        ...section,
        objectiveRefs: distributeObjectives(objectiveIds, sections.length, sectionIndex),
      })),
    };
  });

  const retainedOutcomes = outcomes.filter(
    (outcome) => !replacedIds.has(outcome?.id) || !allReferencedIds.has(outcome?.id),
  );
  synchronized.outcomes = [...retainedOutcomes, ...replacementOutcomes];
  return synchronized;
}

export function instructionalPlanCurriculumMatches(courseMap = {}, instructionalPlan = {}) {
  return (
    JSON.stringify(courseMap) ===
    JSON.stringify(synchronizeCourseMapWithInstructionalPlan(courseMap, instructionalPlan))
  );
}
