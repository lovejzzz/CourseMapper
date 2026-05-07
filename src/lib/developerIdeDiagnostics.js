import { getDeveloperSecretFindings } from './developerSecretDiagnostics.js';

export const COURSE_MAP_PLACEHOLDER = '{{courseMap}}';

const VALID_DELIVERABLE_STATUSES = new Set(['idle', 'queued', 'generating', 'done', 'error']);
const LESSON_SCOPE_TYPES = new Set(['all', 'specific']);
const MAX_DIFF_ITEMS = 60;

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addFinding(findings, level, path, message) {
  findings.push({ level, path, message });
}

function childPath(basePath, key) {
  return basePath ? `${basePath}.${key}` : key;
}

function indexPath(basePath, index) {
  return `${basePath}[${index}]`;
}

function validateCourseMap(courseMap, findings, basePath = 'courseMap') {
  if (!isPlainObject(courseMap)) {
    addFinding(findings, 'error', basePath, 'Course map must be an object.');
    return;
  }

  if (courseMap.courseName !== undefined && typeof courseMap.courseName !== 'string') {
    addFinding(findings, 'warning', childPath(basePath, 'courseName'), 'Course name should be text.');
  }

  const lessonsPath = childPath(basePath, 'lessons');
  if (!Array.isArray(courseMap.lessons)) {
    addFinding(findings, 'error', lessonsPath, 'Lessons must be an array.');
    return;
  }

  if (courseMap.lessons.length === 0) {
    addFinding(findings, 'warning', lessonsPath, 'Course map has no lessons.');
  }

  courseMap.lessons.forEach((lesson, lessonIndex) => {
    const lessonPath = indexPath(lessonsPath, lessonIndex);
    if (!isPlainObject(lesson)) {
      addFinding(findings, 'error', lessonPath, 'Lesson must be an object.');
      return;
    }

    if (lesson.title !== undefined && typeof lesson.title !== 'string') {
      addFinding(findings, 'warning', childPath(lessonPath, 'title'), 'Lesson title should be text.');
    } else if (!lesson.title?.trim()) {
      addFinding(findings, 'warning', childPath(lessonPath, 'title'), 'Lesson is missing a title.');
    }

    if (lesson.sections === undefined) {
      addFinding(findings, 'warning', childPath(lessonPath, 'sections'), 'Lesson is missing sections.');
      return;
    }

    if (!Array.isArray(lesson.sections)) {
      addFinding(findings, 'error', childPath(lessonPath, 'sections'), 'Lesson sections must be an array.');
      return;
    }

    if (lesson.sections.length === 0) {
      addFinding(findings, 'warning', childPath(lessonPath, 'sections'), 'Lesson has no sections.');
    }

    lesson.sections.forEach((section, sectionIndex) => {
      if (!isPlainObject(section)) {
        addFinding(findings, 'error', indexPath(childPath(lessonPath, 'sections'), sectionIndex), 'Section must be an object.');
      }
    });
  });
}

function validateSelectedFeatures(selectedFeatures, findings, basePath = 'selectedFeatures') {
  if (selectedFeatures === undefined) return;
  if (!Array.isArray(selectedFeatures)) {
    addFinding(findings, 'error', basePath, 'Selected features must be an array.');
    return;
  }

  const seen = new Set();
  selectedFeatures.forEach((featureId, index) => {
    const path = indexPath(basePath, index);
    if (typeof featureId !== 'string' || !featureId.trim()) {
      addFinding(findings, 'error', path, 'Feature id must be non-empty text.');
      return;
    }
    if (seen.has(featureId)) {
      addFinding(findings, 'warning', path, `"${featureId}" is selected more than once.`);
    }
    seen.add(featureId);
  });

  if (selectedFeatures.length > 0 && !selectedFeatures.includes('courseMap')) {
    addFinding(findings, 'warning', basePath, 'Course Map should stay in selected features.');
  }
}

function validateDeliverables(deliverables, findings, basePath = 'deliverables') {
  if (deliverables === undefined) return;
  if (!isPlainObject(deliverables)) {
    addFinding(findings, 'error', basePath, 'Deliverables must be an object.');
    return;
  }

  Object.entries(deliverables).forEach(([featureId, output]) => {
    const outputPath = childPath(basePath, featureId);
    if (!isPlainObject(output)) {
      addFinding(findings, 'error', outputPath, 'Deliverable output must be an object.');
      return;
    }

    if (output.status !== undefined && !VALID_DELIVERABLE_STATUSES.has(output.status)) {
      addFinding(findings, 'warning', childPath(outputPath, 'status'), `Unknown deliverable status "${output.status}".`);
    }
    if (output.status === 'done' && output.data === undefined) {
      addFinding(findings, 'warning', childPath(outputPath, 'data'), 'Done deliverable has no data.');
    }
    if (output.status === 'error' && !output.error) {
      addFinding(findings, 'warning', childPath(outputPath, 'error'), 'Errored deliverable has no error message.');
    }
  });
}

function validateDeliverableConfig(deliverableConfig, findings, basePath = 'deliverableConfig') {
  if (deliverableConfig === undefined) return;
  if (!isPlainObject(deliverableConfig)) {
    addFinding(findings, 'error', basePath, 'Deliverable config must be an object.');
    return;
  }

  Object.entries(deliverableConfig).forEach(([featureId, config]) => {
    const configPath = childPath(basePath, featureId);
    if (!isPlainObject(config)) {
      addFinding(findings, 'error', configPath, 'Deliverable config entry must be an object.');
      return;
    }

    ['customSystemPrompt', 'customUserPrompt', 'extraInstructions'].forEach((key) => {
      const value = config[key];
      if (value !== undefined && typeof value !== 'string') {
        addFinding(findings, 'error', childPath(configPath, key), `${key} must be text.`);
      }
    });

    if (typeof config.customUserPrompt === 'string'
      && config.customUserPrompt.trim()
      && !config.customUserPrompt.includes(COURSE_MAP_PLACEHOLDER)) {
      addFinding(
        findings,
        'warning',
        childPath(configPath, 'customUserPrompt'),
        `Custom user prompt should include ${COURSE_MAP_PLACEHOLDER}.`,
      );
    }
  });
}

function validateLessonScope(lessonScope, findings, lessonCount, basePath = 'lessonScope') {
  if (lessonScope === undefined) return;
  if (!isPlainObject(lessonScope)) {
    addFinding(findings, 'error', basePath, 'Lesson scope must be an object.');
    return;
  }

  if (lessonScope.type !== undefined && !LESSON_SCOPE_TYPES.has(lessonScope.type)) {
    addFinding(findings, 'warning', childPath(basePath, 'type'), 'Lesson scope type should be "all" or "specific".');
  }

  if (lessonScope.type === 'specific') {
    const indicesPath = childPath(basePath, 'indices');
    if (!Array.isArray(lessonScope.indices)) {
      addFinding(findings, 'error', indicesPath, 'Specific lesson scope needs an indices array.');
      return;
    }
    if (lessonScope.indices.length === 0) {
      addFinding(findings, 'warning', indicesPath, 'Specific lesson scope has no selected lessons.');
    }
    lessonScope.indices.forEach((index, offset) => {
      if (!Number.isInteger(index) || index < 0) {
        addFinding(findings, 'error', indexPath(indicesPath, offset), 'Lesson index must be a non-negative integer.');
      } else if (Number.isInteger(lessonCount) && lessonCount > 0 && index >= lessonCount) {
        addFinding(findings, 'warning', indexPath(indicesPath, offset), 'Lesson index is outside the current course map.');
      }
    });
  }
}

function validateColumns(columns, findings, basePath = 'columns') {
  if (columns === undefined) return;
  if (!Array.isArray(columns)) {
    addFinding(findings, 'error', basePath, 'Columns must be an array.');
    return;
  }

  const seenKeys = new Set();
  columns.forEach((column, index) => {
    const columnPath = indexPath(basePath, index);
    if (!isPlainObject(column)) {
      addFinding(findings, 'error', columnPath, 'Column must be an object.');
      return;
    }

    if (typeof column.key !== 'string' || !column.key.trim()) {
      addFinding(findings, 'error', childPath(columnPath, 'key'), 'Column key must be non-empty text.');
    } else if (seenKeys.has(column.key)) {
      addFinding(findings, 'warning', childPath(columnPath, 'key'), `Duplicate column key "${column.key}".`);
    }
    seenKeys.add(column.key);

    if (column.label !== undefined && typeof column.label !== 'string') {
      addFinding(findings, 'warning', childPath(columnPath, 'label'), 'Column label should be text.');
    }
    if (column.title !== undefined && typeof column.title !== 'string') {
      addFinding(findings, 'warning', childPath(columnPath, 'title'), 'Column title should be text.');
    }
    if (column.enabled !== undefined && typeof column.enabled !== 'boolean') {
      addFinding(findings, 'warning', childPath(columnPath, 'enabled'), 'Column enabled flag should be boolean.');
    }
  });
}

function addCrossFieldFindings(snapshot, findings) {
  const selectedFeatures = Array.isArray(snapshot.selectedFeatures)
    ? snapshot.selectedFeatures.filter(feature => typeof feature === 'string')
    : [];
  const deliverables = isPlainObject(snapshot.deliverables) ? snapshot.deliverables : {};
  const deliverableConfig = isPlainObject(snapshot.deliverableConfig) ? snapshot.deliverableConfig : {};

  if (typeof snapshot.activeTab === 'string'
    && selectedFeatures.length > 0
    && !selectedFeatures.includes(snapshot.activeTab)) {
    addFinding(findings, 'warning', 'activeTab', `"${snapshot.activeTab}" is not selected.`);
  }

  Object.keys(deliverableConfig).forEach((featureId) => {
    if (selectedFeatures.length > 0 && !selectedFeatures.includes(featureId)) {
      addFinding(findings, 'info', childPath('deliverableConfig', featureId), 'Config exists for a deliverable that is not selected.');
    }
  });

  Object.keys(deliverables).forEach((featureId) => {
    if (featureId !== 'courseMap' && selectedFeatures.length > 0 && !selectedFeatures.includes(featureId)) {
      addFinding(findings, 'info', childPath('deliverables', featureId), 'Generated output exists for a deliverable that is not selected.');
    }
  });
}

export function getDeveloperSnapshotFindings(snapshot) {
  const findings = [];
  if (!isPlainObject(snapshot)) {
    addFinding(findings, 'error', 'root', 'Project code must be a JSON object.');
    return findings;
  }

  findings.push(...getDeveloperSecretFindings(snapshot));
  validateCourseMap(snapshot.courseMap, findings, 'courseMap');
  validateSelectedFeatures(snapshot.selectedFeatures, findings, 'selectedFeatures');
  validateDeliverables(snapshot.deliverables, findings, 'deliverables');
  validateDeliverableConfig(snapshot.deliverableConfig, findings, 'deliverableConfig');
  validateLessonScope(
    snapshot.lessonScope,
    findings,
    Array.isArray(snapshot.courseMap?.lessons) ? snapshot.courseMap.lessons.length : null,
    'lessonScope',
  );
  validateColumns(snapshot.columns, findings, 'columns');
  addCrossFieldFindings(snapshot, findings);
  return findings;
}

export function getDeveloperSectionFindings(sectionId, value) {
  const findings = [];

  if (sectionId === 'raw') return getDeveloperSnapshotFindings(value);
  if (sectionId === 'courseMap') {
    findings.push(...getDeveloperSecretFindings(value, 'courseMap'));
    validateCourseMap(value, findings, 'courseMap');
    return findings;
  }
  if (sectionId === 'deliverables') {
    findings.push(...getDeveloperSecretFindings(value, 'deliverables'));
    validateDeliverables(value, findings, 'deliverables');
    return findings;
  }
  if (sectionId === 'config') {
    if (!isPlainObject(value)) {
      addFinding(findings, 'error', 'config', 'Config must be an object.');
      return findings;
    }
    findings.push(...getDeveloperSecretFindings(value));
    validateSelectedFeatures(value.selectedFeatures, findings, 'selectedFeatures');
    validateDeliverableConfig(value.deliverableConfig, findings, 'deliverableConfig');
    validateLessonScope(value.lessonScope, findings, null, 'lessonScope');
    validateColumns(value.columns, findings, 'columns');
    if (typeof value.activeTab === 'string'
      && Array.isArray(value.selectedFeatures)
      && value.selectedFeatures.length > 0
      && !value.selectedFeatures.includes(value.activeTab)) {
      addFinding(findings, 'warning', 'activeTab', `"${value.activeTab}" is not selected.`);
    }
    return findings;
  }

  return findings;
}

export function assertDeveloperSnapshot(snapshot) {
  const error = getDeveloperSnapshotFindings(snapshot).find(finding => finding.level === 'error');
  if (error) {
    throw new Error(`${error.path}: ${error.message}`);
  }
}

export function assertDeveloperSection(sectionId, value) {
  const error = getDeveloperSectionFindings(sectionId, value).find(finding => finding.level === 'error');
  if (error) {
    throw new Error(`${error.path}: ${error.message}`);
  }
}

function valueSummary(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (isPlainObject(value)) return `Object(${Object.keys(value).length})`;
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > 32 ? `"${compact.slice(0, 29)}..."` : `"${compact}"`;
  }
  return String(value);
}

function valuesEqual(left, right) {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function addDiff(diffs, type, path, before, after) {
  if (diffs.length >= MAX_DIFF_ITEMS) return;
  diffs.push({
    type,
    path: path || 'root',
    beforeSummary: valueSummary(before),
    afterSummary: valueSummary(after),
  });
}

function walkDiff(before, after, diffs, path, depth) {
  if (diffs.length >= MAX_DIFF_ITEMS || valuesEqual(before, after)) return;

  if (before === undefined) {
    addDiff(diffs, 'added', path, before, after);
    return;
  }
  if (after === undefined) {
    addDiff(diffs, 'removed', path, before, after);
    return;
  }

  if (depth <= 0) {
    addDiff(diffs, 'changed', path, before, after);
    return;
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    keys.forEach((key) => {
      walkDiff(before[key], after[key], diffs, childPath(path, key), depth - 1);
    });
    return;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      addDiff(diffs, 'changed', childPath(path, 'length'), before.length, after.length);
    }
    const limit = Math.min(before.length, after.length, 30);
    for (let index = 0; index < limit; index += 1) {
      walkDiff(before[index], after[index], diffs, indexPath(path, index), depth - 1);
      if (diffs.length >= MAX_DIFF_ITEMS) return;
    }

    const edgeLimit = Math.min(Math.max(before.length, after.length), 30);
    for (let index = limit; index < edgeLimit; index += 1) {
      if (index >= before.length) {
        addDiff(diffs, 'added', indexPath(path, index), undefined, after[index]);
      } else if (index >= after.length) {
        addDiff(diffs, 'removed', indexPath(path, index), before[index], undefined);
      }
      if (diffs.length >= MAX_DIFF_ITEMS) return;
    }

    if (Math.max(before.length, after.length) > 30) {
      addDiff(diffs, 'changed', path, before, after);
    }
    return;
  }

  addDiff(diffs, 'changed', path, before, after);
}

export function diffDeveloperSnapshots(before, after, options = {}) {
  const diffs = [];
  const depth = options.depth ?? 7;
  walkDiff(before, after, diffs, '', depth);
  return diffs.slice(0, options.limit ?? 20);
}

export function formatDeveloperDiffItem(diff) {
  const action = diff.type === 'added' ? 'Added' : diff.type === 'removed' ? 'Removed' : 'Changed';
  return `${action} ${diff.path}`;
}
