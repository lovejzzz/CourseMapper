import { getArrayKey } from './syncDependencies';
import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  isBlueprintCompiledFeature,
} from './courseBlueprintCompiler';

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLessonMatch(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCourseLessonTitle(courseMap, lessonIndex) {
  const lesson = courseMap?.lessons?.[lessonIndex] || {};
  return cleanText(
    lesson.title || lesson.lessonTitle || lesson.topicSection || lesson.topic || `Lesson ${lessonIndex + 1}`,
  );
}

function getItemLessonNumbers(item) {
  const values = [
    item?.lessonNumber,
    item?.lessonIndex != null ? Number(item.lessonIndex) + 1 : null,
    item?.week,
    item?.weekNumber,
    item?.lesson,
    item?.module,
    item?.title,
    item?.lessonTitle,
    item?.topic,
    item?.name,
  ];
  const numbers = [];
  for (const value of values) {
    const text = String(value ?? '');
    const match = text.match(/\b(?:lesson|week|module)?\s*(\d{1,2})\b/i);
    if (match) numbers.push(Number(match[1]));
  }
  return [...new Set(numbers.filter((n) => Number.isFinite(n) && n > 0))];
}

function collectLessonIdentityText(item) {
  return [
    item?.lessonTitle,
    item?.title,
    item?.topic,
    item?.name,
    item?.assessment,
    item?.assignmentTitle,
    item?.rubricTitle,
    item?.deckTitle,
    item?.studyGuideTitle,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ');
}

function itemMatchesLesson(item, lessonNumber, normalizedLessonTitle) {
  const numbers = getItemLessonNumbers(item);
  if (numbers.includes(lessonNumber)) return true;
  if (!normalizedLessonTitle) return false;
  return normalizeLessonMatch(collectLessonIdentityText(item)).includes(normalizedLessonTitle);
}

export function buildCompiledLessonPatchData(featureId, compiledData, courseMap, lessonIndex) {
  if (!compiledData) return null;
  const compiledKey = getArrayKey(featureId, compiledData);
  if (!compiledKey) return compiledData;
  const compiledItems = compiledData?.[compiledKey] || [];
  const lessonNumber = lessonIndex + 1;
  const normalizedLessonTitle = normalizeLessonMatch(getCourseLessonTitle(courseMap, lessonIndex));
  const lessonItems = compiledItems.filter((item) => itemMatchesLesson(item, lessonNumber, normalizedLessonTitle));
  const patchItems =
    lessonItems.length > 0 ? lessonItems : compiledItems[lessonIndex] ? [compiledItems[lessonIndex]] : [];
  return patchItems.length > 0 ? { ...compiledData, [compiledKey]: patchItems } : null;
}

export function compileBlueprintLessonPatch({ featureId, courseMap, lessonIndex, config, instructorPreferences }) {
  if (!isBlueprintCompiledFeature(featureId)) return null;
  const blueprint = compactBlueprintForStorage(buildCourseBlueprint(courseMap, { instructorPreferences }));
  const compiled = compileBlueprintDeliverables(blueprint, [featureId], {
    configMap: { [featureId]: config || {} },
  });
  return buildCompiledLessonPatchData(featureId, compiled?.[featureId], courseMap, lessonIndex);
}
