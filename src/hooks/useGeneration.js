import { useState, useRef, useCallback } from 'react';
import { parseFiles } from '../lib/fileParser';
import {
  SYSTEM_PROMPT,
  RECONSTRUCT_SYSTEM_PROMPT,
  buildUserPrompt,
  EXAMINE_SYSTEM_PROMPT,
  buildExamineUserPrompt,
} from '../lib/prompts';
import { readAuthoringMode } from '../lib/authoringMode';
import { checkTokenLimit, truncateToFit } from '../lib/tokenEstimator';
import { detectExpectedLessons } from '../lib/detectLessons';
import useStreamReader from './useStreamReader';

import applyPatches from '../lib/applyPatches';
import { filterExaminePatches } from '../lib/examinePatchFilter';
import { failureEventFields } from '../lib/failureClassification';
import { log, warn, error as logError } from '../lib/logger';
import { getModeSystemAddition, getModeCourseMapNote } from '../lib/pedagogicalModes';
import {
  LEAN_SYSTEM_ADDITION,
  deriveCompilerOwnedColumns,
  expandLeanCourseMap,
  isLeanCourseMapEnabled,
} from '../lib/leanCourseMap';
import { validateCourseMap } from '../lib/validateCourseMap';
import { preserveMaterializedLessonNumbers } from '../lib/materializedLessonScope';
import { getScionReviewFailureMessage } from '../lib/scionUserFacingError';
import { PUBLIC_SCION_PROVIDER_ID } from '../lib/publicScionIdentity';
import { applyPublicScionBriefDirectives, projectPublicScionCourseMapContinuations } from '../lib/publicScionProvider';
import { admitCourseMapContinuationLessons, buildCourseMapContinuationPrompt } from '../lib/courseMapContinuation';

export { admitCourseMapContinuationLessons, buildCourseMapContinuationPrompt } from '../lib/courseMapContinuation';

function cellText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(cellText).join(' ');
  if (typeof value === 'object') return Object.values(value).map(cellText).join(' ');
  return String(value);
}

function hasMeaningfulCellValue(value) {
  const text = cellText(value).trim();
  if (!text) return false;
  return !/^(tbd|n\/a|none|null|undefined|untitled)$/i.test(text);
}

function getEnabledColumnKeys(columns = []) {
  return (Array.isArray(columns) ? columns : [])
    .filter((column) => column?.key && column.enabled !== false)
    .map((column) => column.key);
}

export function getCourseMapExamineScan({ courseMap, columns, validationWarnings = [], expectedInfo = null } = {}) {
  const triggers = [];
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const columnKeys = getEnabledColumnKeys(columns);

  // Global problems require the model to see the whole course map.
  let globalReview = false;
  if (validationWarnings.length > 0) {
    triggers.push(`${validationWarnings.length} structural fix${validationWarnings.length === 1 ? '' : 'es'} applied`);
    globalReview = true;
  }
  if (lessons.length === 0) {
    triggers.push('no lessons were generated');
    globalReview = true;
  }
  if (expectedInfo?.expected && expectedInfo.confidence === 'high' && lessons.length < expectedInfo.expected) {
    triggers.push(`expected ${expectedInfo.expected} lessons but generated ${lessons.length}`);
    globalReview = true;
  }

  let emptyFieldCount = 0;
  let structuralGapCount = 0;
  const problemLessonIndices = new Set();
  lessons.forEach((lesson, lessonIndex) => {
    if (!hasMeaningfulCellValue(lesson?.title) || /^lesson\s+\d+:\s*untitled$/i.test(String(lesson?.title || ''))) {
      structuralGapCount += 1;
      problemLessonIndices.add(lessonIndex);
    }
    if (!Array.isArray(lesson?.sections) || lesson.sections.length === 0) {
      structuralGapCount += 1;
      problemLessonIndices.add(lessonIndex);
      return;
    }
    lesson.sections.forEach((section) => {
      columnKeys.forEach((key) => {
        if (!hasMeaningfulCellValue(section?.[key])) {
          emptyFieldCount += 1;
          problemLessonIndices.add(lessonIndex);
        }
      });
    });
  });

  if (structuralGapCount > 0) {
    triggers.push(`${structuralGapCount} lesson structure gap${structuralGapCount === 1 ? '' : 's'}`);
  }
  if (emptyFieldCount > 0) {
    triggers.push(`${emptyFieldCount} empty enabled course-map field${emptyFieldCount === 1 ? '' : 's'}`);
  }

  // Focused review: when problems are local to a minority of lessons, the
  // examine call only needs to send those lessons (plus course-level fields).
  const focusLessonIndices =
    !globalReview && problemLessonIndices.size > 0 && problemLessonIndices.size < lessons.length
      ? [...problemLessonIndices].sort((a, b) => a - b)
      : null;

  return { triggers: [...new Set(triggers)], focusLessonIndices };
}

export function getLessonCount(courseMap) {
  return Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
}

export function buildIncompleteCourseMapErrorMessage(actual, expected) {
  return `Course map generation stopped at ${actual} of ${expected} lessons. Try generating again, reducing the lesson scope, or switching models.`;
}

export function assertExpectedLessonCount(courseMap, expectedCount) {
  const expected = Number(expectedCount) || 0;
  const actual = getLessonCount(courseMap);
  if (expected > 0 && actual < expected) {
    throw new Error(buildIncompleteCourseMapErrorMessage(actual, expected));
  }
  return courseMap;
}

export function constrainHighConfidenceLessonCount(courseMap, expectedInfo) {
  const expected = Number(expectedInfo?.expected) || 0;
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (expectedInfo?.confidence !== 'high' || expected <= 0 || lessons.length <= expected) {
    return { courseMap, removedCount: 0 };
  }
  return {
    courseMap: { ...courseMap, lessons: lessons.slice(0, expected) },
    removedCount: lessons.length - expected,
  };
}

export function displayGenerationModelName(provider, modelName) {
  return provider === 'public' || modelName === 'scion-public' ? 'Scion' : modelName;
}

function recordClassifiedFailedCall(recordApiCallEvent, err, event = {}, context = {}) {
  if (err?.apiCallBudgetRecorded) return;
  recordApiCallEvent({
    type: 'failedCall',
    ...event,
    detail: event.detail || err?.message || '',
    ...failureEventFields(err, context),
  });
}

/**
 * Handles course map generation, examination, stop/resume, and retry.
 */
export default function useGeneration({
  provider,
  modelId,
  apiKey,
  maxOutputTokens,
  modelCapabilities,
  generationPlan,
  files,
  columns,
  promptText,
  setCourseMap,
  setOldCourseMap,
  pushVersion,
  userEdits,
  setUserEdits,
  lessonScope,
  pedagogicalMode, // Feature 4.2 — e.g. 'lecture' | 'flipped' | 'pbl' | 'seminar' | 'competency'
  courseMapConfig, // Optional config for the course map deliverable (referenceFile, extraInstructions)
  onApiCallEvent,
}) {
  const [status, setStatus] = useState('idle');
  const [progressStep, setProgressStep] = useState(null);
  const [error, setError] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamDetail, setStreamDetail] = useState('');
  const [streamProgress, setStreamProgress] = useState(0);
  const [isStopped, setIsStopped] = useState(false);
  const [examChanges, setExamChanges] = useState([]);
  const [pendingExamPatches, setPendingExamPatches] = useState(null); // { patches, baseMap } — waiting for instructor review
  const [retryInfo, setRetryInfo] = useState(null); // { attempt, max, delay }
  const [completenessInfo, setCompletenessInfo] = useState(null); // { expected, actual, confidence, status }
  const [generationLog, setGenerationLog] = useState([]); // [{ model, message, type }]
  const [activeModelName, setActiveModelName] = useState(''); // dynamically tracks which model is working

  const stoppedTextRef = useRef('');
  const stoppedPromptRef = useRef(null);
  const syllabusTextRef = useRef('');
  const fullTextRef = useRef('');
  const lastUIUpdateRef = useRef(0);
  const courseMapRef = useRef(null);
  const expectedLessonsRef = useRef(null);
  const lastGoodParseRef = useRef(null);
  const workingModelRef = useRef({ provider: null, apiKey: null, modelId: null }); // tracks which model to use for examine

  const { streamProvider, parsePartialJSON, abort, abortControllerRef } = useStreamReader();

  const recordApiCallEvent = useCallback(
    (event) => {
      if (typeof onApiCallEvent === 'function') onApiCallEvent(event);
    },
    [onApiCallEvent],
  );

  // ── Apply pending user edits onto a course map ──
  function applyUserEdits(map) {
    if (!userEdits || userEdits.length === 0) return map;
    const merged = structuredClone(map);
    for (const edit of userEdits) {
      try {
        if (edit.key === 'title' && merged.lessons[edit.lessonIdx]) {
          merged.lessons[edit.lessonIdx].title = edit.newValue;
        } else if (merged.lessons[edit.lessonIdx]?.sections?.[edit.sectionIdx]) {
          merged.lessons[edit.lessonIdx].sections[edit.sectionIdx][edit.key] = edit.newValue;
        }
      } catch {
        /* skip invalid edits */
      }
    }
    return merged;
  }

  const STREAM_SAVE_KEY = 'coursemapper-stream';

  // ── Helpers for stream progress updates (time-based throttle) ──
  const lastSaveRef = useRef(0);
  function updateGenerationProgress(fullText, chunkCount) {
    const now = performance.now();
    // Throttle UI updates to ~150ms intervals for smooth streaming
    if (now - lastUIUpdateRef.current < 150) return;
    lastUIUpdateRef.current = now;

    // Save partial text to localStorage every ~3s for crash recovery
    if (now - lastSaveRef.current > 3000) {
      lastSaveRef.current = now;
      try {
        localStorage.setItem(STREAM_SAVE_KEY, fullText);
      } catch {}
    }

    const partial = parsePartialJSON(fullText);
    if (partial && partial.lessons) {
      lastGoodParseRef.current = partial;
      setCourseMap({ ...partial });
      const lessons = partial.lessons;
      const lastLesson = lessons[lessons.length - 1];
      if (lastLesson) {
        const sections = lastLesson.sections || [];
        const lastSection = sections[sections.length - 1];
        const lessonNum = lessons.length;
        const estTotal = Math.max(fullText.length * 1.3, 8000);
        setStreamProgress(Math.min(Math.round((fullText.length / estTotal) * 90), 90));
        if (lastSection) {
          const filledKeys = Object.keys(lastSection).filter((k) => lastSection[k]);
          const lastKey = filledKeys[filledKeys.length - 1];
          const keyLabel = lastKey
            ? lastKey
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, (s) => s.toUpperCase())
                .trim()
            : '';
          setStreamDetail(`Mapping Lesson ${lessonNum} · ${keyLabel}…`);
        } else {
          setStreamDetail(`Starting Lesson ${lessonNum}…`);
        }
      }
    }
  }

  // ── Compute diff between two course maps ──
  function computeExamDiff(preMap, postMap) {
    const changes = [];
    const pre = preMap.lessons || [];
    const post = postMap.lessons || [];
    const maxLessons = Math.max(pre.length, post.length);
    for (let li = 0; li < maxLessons; li++) {
      const preLesson = pre[li];
      const postLesson = post[li];
      if (!preLesson && postLesson) {
        changes.push(`Added Lesson ${li + 1}: ${postLesson.title || 'Untitled'}`);
        continue;
      }
      if (!postLesson) continue;
      if (preLesson.title !== postLesson.title) {
        changes.push(`Lesson ${li + 1} title: "${preLesson.title}" → "${postLesson.title}"`);
      }
      const preSections = preLesson.sections || [];
      const postSections = postLesson.sections || [];
      const maxSec = Math.max(preSections.length, postSections.length);
      for (let si = 0; si < maxSec; si++) {
        const preSec = preSections[si] || {};
        const postSec = postSections[si] || {};
        const allKeys = new Set([...Object.keys(preSec), ...Object.keys(postSec)]);
        for (const key of allKeys) {
          const oldVal = (preSec[key] || '').trim();
          const newVal = (postSec[key] || '').trim();
          if (oldVal !== newVal) {
            const label = key
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (s) => s.toUpperCase())
              .trim();
            if (!oldVal && newVal) {
              changes.push(`Lesson ${li + 1}, Section ${si + 1} — filled ${label}`);
            } else {
              changes.push(`Lesson ${li + 1}, Section ${si + 1} — updated ${label}`);
            }
          }
        }
      }
    }
    return changes;
  }

  // ── Build human-readable label for a single patch ──
  function buildPatchLabel(p) {
    const label = (p.field || '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
    if (p.action === 'addLesson') return `Add Lesson ${(p.lessonIndex || 0) + 1}`;
    if (p.action === 'addSection') return `Add section in Lesson ${(p.lessonIndex || 0) + 1}`;
    if (p.action === 'removeLesson') return `Remove Lesson ${(p.lessonIndex || 0) + 1}`;
    if (p.field === 'title') return `Lesson ${(p.lessonIndex || 0) + 1} title`;
    if (p.field === 'courseName' || p.field === 'semester') return label;
    return `Lesson ${(p.lessonIndex || 0) + 1}, Section ${(p.sectionIndex || 0) + 1} — ${label}`;
  }

  // ── Run the Examine step (patch-based) — stores proposals for instructor review ──
  async function runExamine(
    finalResult,
    { reason = 'automatic', triggers = [], focusLessonIndices = null, background = false } = {},
  ) {
    // v0.15.186: background mode — the review runs concurrently with the
    // deliverables phase (its only output is pending review patches, which
    // deliverables never consume), so it must not drive the generation-phase
    // progress UI.
    if (!background) {
      setProgressStep('examining');
      setStreamDetail('Reviewing for missing or inaccurate content...');
    }
    setExamChanges([]);
    setPendingExamPatches(null);
    const preExamineMap = structuredClone(finalResult);
    if (!background) setOldCourseMap(preExamineMap);

    // Resolve lesson scope so the examiner knows which lessons are in scope
    const scopeIndices = Array.isArray(lessonScope) ? lessonScope : null;

    // Use whichever model actually succeeded during generation
    const examProvider = workingModelRef.current.provider || provider;
    const examApiKey = workingModelRef.current.apiKey || apiKey;
    const examModelId = workingModelRef.current.modelId || modelId;

    try {
      const examUserPrompt = buildExamineUserPrompt(finalResult, syllabusTextRef.current, scopeIndices, {
        focusLessonIndices,
      });
      const focusedDetail =
        Array.isArray(focusLessonIndices) && focusLessonIndices.length > 0
          ? ` (focused on ${focusLessonIndices.length} lesson${focusLessonIndices.length === 1 ? '' : 's'})`
          : '';
      recordApiCallEvent({
        type: 'courseMapCall',
        label: reason === 'manual' ? 'Manual course-map review' : 'Conditional course-map review',
        detail: triggers.join('; ') + focusedDetail,
      });
      const { fullText: examineText } = await streamProvider(
        examProvider,
        examApiKey,
        examModelId,
        EXAMINE_SYSTEM_PROMPT,
        examUserPrompt,
        {
          maxOutputTokens: generationPlan?.courseMapOutputTokens || maxOutputTokens,
          modelCapabilities,
          generationPlan,
          task: 'verification',
          onApiCallEvent: recordApiCallEvent,
          onChunk: (text) => {
            if (background) return;
            if (text.length % 200 < 10) {
              const partial = parsePartialJSON(text);
              if (partial && partial.patches) {
                setStreamDetail(
                  `Found ${partial.patches.length} suggestion${partial.patches.length !== 1 ? 's' : ''} so far...`,
                );
              }
            }
          },
          onRetry: (attempt, max, delay) => {
            recordApiCallEvent({
              type: 'streamRetryCall',
              label: 'Course-map review stream retry',
              detail: `${attempt}/${max}`,
            });
            if (background) return;
            setRetryInfo({ attempt, max, delay });
            setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
          },
        },
      );

      setRetryInfo(null);
      const patchResult = parsePartialJSON(examineText);

      if (patchResult && Array.isArray(patchResult.patches) && patchResult.patches.length > 0) {
        let filteredPatches = filterExaminePatches(patchResult.patches, finalResult, scopeIndices);
        if (Array.isArray(focusLessonIndices) && focusLessonIndices.length > 0) {
          // Focused review may only patch the focus lessons or course-level fields.
          const focusSet = new Set(focusLessonIndices);
          filteredPatches = filteredPatches.filter(
            (patch) =>
              patch.action !== 'addLesson' &&
              patch.action !== 'removeLesson' &&
              (patch.lessonIndex == null || focusSet.has(patch.lessonIndex)),
          );
        }
        if (filteredPatches.length === 0) {
          setOldCourseMap(null);
          return;
        }
        // ── Store as pending — do NOT apply; wait for instructor review ──
        setPendingExamPatches({ patches: filteredPatches, baseMap: finalResult });
        setOldCourseMap(null); // clear diff highlight — review UI handles this
      } else if (patchResult && patchResult.lessons) {
        // Fallback: AI returned a full course map instead of patches
        const currentLessonCount = finalResult.lessons?.length || 0;
        if (patchResult.lessons.length >= currentLessonCount) {
          // Diff it into synthetic patches for the review UI
          const changes = computeExamDiff(preExamineMap, patchResult);
          if (changes.length > 0) {
            // We can't do per-patch accept/reject for the full-map fallback;
            // treat as a single "structural" patch the instructor can Accept All or Reject All
            setPendingExamPatches({
              patches: [
                { action: '_fullMapFallback', value: patchResult, reason: 'AI returned a revised full course map' },
              ],
              baseMap: finalResult,
            });
          } else {
            setOldCourseMap(null);
          }
        } else {
          warn(`Examine returned ${patchResult.lessons.length} lessons vs current ${currentLessonCount} — skipping`);
          setOldCourseMap(null);
        }
      } else {
        // No patches needed or empty response — nothing to review
        setOldCourseMap(null);
      }
    } catch (examErr) {
      setRetryInfo(null);
      if (examErr.name === 'AbortError') {
        setOldCourseMap(null);
      } else {
        recordClassifiedFailedCall(
          recordApiCallEvent,
          examErr,
          {
            label: reason === 'manual' ? 'Manual course-map review failed' : 'Conditional course-map review failed',
          },
          { provider: examProvider, modelId: examModelId },
        );
        console.warn('Examine step failed:', examErr.message);
        setOldCourseMap(null);
        setExamChanges(['__EXAM_FAILED__:' + getScionReviewFailureMessage(examErr)]);
      }
    }
  }

  // ── Accept a subset of pending exam patches (by index array, or all if omitted) ──
  const onAcceptPatches = useCallback(
    (indices) => {
      if (!pendingExamPatches) return;
      const { patches, baseMap } = pendingExamPatches;
      const toApply = indices != null ? patches.filter((_, i) => indices.includes(i)) : patches;
      const toReject = indices != null ? patches.filter((_, i) => !indices.includes(i)) : [];

      let resultMap = baseMap;

      if (toApply.length > 0) {
        // Handle _fullMapFallback synthetic patch
        if (toApply.length === 1 && toApply[0].action === '_fullMapFallback') {
          resultMap = toApply[0].value;
        } else {
          resultMap = applyPatches(baseMap, toApply);
        }
        setCourseMap(resultMap);

        const acceptedLabels = toApply.map((p) => buildPatchLabel(p));
        const rejectedLabels = toReject.map((p) => buildPatchLabel(p));

        // Build examChanges: accepted = regular entries, rejected = strikethrough marker
        const changes = [
          ...acceptedLabels.map((loc, i) => {
            const p = toApply[i];
            return p.reason ? `${loc}: ${p.reason}` : loc;
          }),
          ...rejectedLabels.map((loc) => `__REJECTED__:${loc}`),
        ];
        setExamChanges(changes);
        pushVersion(resultMap, `Examined — ${toApply.length} accepted, ${toReject.length} rejected`);
      } else {
        // All rejected — nothing to apply
        setExamChanges(toReject.map((p) => `__REJECTED__:${buildPatchLabel(p)}`));
      }

      setPendingExamPatches(null);
    },
    [pendingExamPatches, setCourseMap, pushVersion],
  );

  // ── Reject a single patch by index (removes it from pending) ──
  const onRejectPatch = useCallback(
    (index) => {
      if (!pendingExamPatches) return;
      const remaining = pendingExamPatches.patches.filter((_, i) => i !== index);
      if (remaining.length === 0) {
        // Last patch rejected — build examChanges directly to avoid stale closure
        // in onAcceptPatches (which would see the original full patches array, not
        // just the one being rejected here).
        const allLabels = pendingExamPatches.patches.map((p) => `__REJECTED__:${buildPatchLabel(p)}`);
        setExamChanges(allLabels);
        setPendingExamPatches(null);
      } else {
        setPendingExamPatches({ ...pendingExamPatches, patches: remaining });
      }
    },
    [pendingExamPatches],
  );

  // ── Helper: add a log entry ──
  function addLog(model, message, type = 'info') {
    setGenerationLog((prev) => [...prev, { model, message, type, time: new Date().toLocaleTimeString() }]);
  }

  // ── Normalize lessons: if a model returns flat lessons (fields on lesson instead of nested sections), wrap into sections ──
  function normalizeLessons(lessons, colDefs) {
    return lessons.map((lesson) => {
      // Already has populated sections — keep as-is
      if (
        Array.isArray(lesson.sections) &&
        lesson.sections.length > 0 &&
        lesson.sections.some((s) => Object.keys(s).length > 0)
      ) {
        return lesson;
      }
      // Check if column keys exist directly on the lesson object (flat structure)
      const flatKeys = colDefs.filter((k) => lesson[k] !== undefined);
      if (flatKeys.length > 0) {
        const section = {};
        for (const k of colDefs) {
          if (lesson[k] !== undefined) section[k] = lesson[k];
        }
        const cleaned = { title: lesson.title, sections: [section] };
        return cleaned;
      }
      // No sections and no flat keys — return with empty sections
      return { ...lesson, sections: Array.isArray(lesson.sections) ? lesson.sections : [] };
    });
  }

  // ── Try one continuation call with a specific model ──
  async function tryContinuation(
    useProvider,
    useApiKey,
    useModelId,
    modelName,
    workingMap,
    expectedCount,
    syllabusText,
    colDefs,
    systemPromptOverride,
    rejectedTopics = [],
  ) {
    const actual = workingMap.lessons.length;
    const contPrompt = buildCourseMapContinuationPrompt(
      workingMap,
      expectedCount,
      syllabusText,
      colDefs,
      rejectedTopics,
    );

    fullTextRef.current = '';
    lastGoodParseRef.current = null;
    let lastContUIUpdate = 0;
    // Use the active system prompt (with pedagogical mode additions) instead of bare SYSTEM_PROMPT
    const contSystemPrompt = systemPromptOverride || SYSTEM_PROMPT;
    recordApiCallEvent({
      type: 'courseMapCall',
      label: 'Course-map continuation',
      detail: `${modelName}: lessons ${actual + 1}-${expectedCount}`,
    });
    const { fullText: contText } = await streamProvider(
      useProvider,
      useApiKey,
      useModelId,
      contSystemPrompt,
      contPrompt,
      {
        maxOutputTokens: generationPlan?.courseMapOutputTokens || maxOutputTokens,
        modelCapabilities,
        generationPlan,
        // This is still course planning, not semantic repair. The old label
        // routed every continuation through the compiler-repair family and
        // made browser-local Scion repeat its first three lessons verbatim.
        task: 'course-map',
        onApiCallEvent: recordApiCallEvent,
        onChunk: (text) => {
          fullTextRef.current = text;
          const now = performance.now();
          if (now - lastContUIUpdate < 150) return;
          lastContUIUpdate = now;
          const partial = parsePartialJSON(text);
          if (partial && partial.lessons) {
            lastGoodParseRef.current = partial;
            const newCount = actual + partial.lessons.length;
            setStreamDetail(
              `${displayGenerationModelName(useProvider, modelName)} generated ${newCount} of ${expectedCount} lessons…`,
            );
            setStreamProgress(Math.round((newCount / expectedCount) * 85));
            // Do not publish streaming continuation rows before topic-identity
            // admission. A real Scion run briefly showed a repeated tenth
            // lesson, then failed the admission gate while the untrusted row
            // remained in React state and made the UI claim 10/10 mapped.
            // The progress copy can describe the candidate count; the preview
            // updates only after `admitCourseMapContinuationLessons` accepts it.
          }
        },
        onRetry: (att, max, delay) => {
          recordApiCallEvent({
            type: 'streamRetryCall',
            label: 'Course-map continuation stream retry',
            detail: `${att}/${max}`,
          });
          setRetryInfo({ attempt: att, max, delay });
          setStreamDetail(`Connection lost — retrying (${att}/${max})...`);
        },
      },
    );

    setRetryInfo(null);
    let contResult = parsePartialJSON(contText);
    if (!contResult || !contResult.lessons) {
      contResult = lastGoodParseRef.current;
    }
    return contResult;
  }

  // ── Auto-continue with multi-model fallback ──
  async function continueForMissingLessons(
    currentMap,
    expectedCount,
    syllabusText,
    colDefs,
    initialModelId,
    initialModelName,
    systemPromptOverride,
  ) {
    // A deterministic browser model will usually repeat the same bad topic
    // after focused feedback. Two bounded attempts are enough to use an exact
    // uncovered source topic and then fail honestly; four identical calls
    // added minutes without adding a new course-map atom.
    const MAX_ATTEMPTS_PER_MODEL = 2;
    let workingMap = currentMap;

    const model = { id: initialModelId, name: initialModelName, backend: provider, apiKey };
    const modelDisplayName = displayGenerationModelName(provider, model.name);
    setActiveModelName(modelDisplayName);
    let rejectedTopics = [];

    // Source-locked Scion continuations are compiler work, not provider
    // retries. A public call is intentionally capped at three lessons, so a
    // ten-lesson map may need more than two deterministic chunks. Project all
    // exact user-authored chunks first without spending the model retry budget.
    if (provider === PUBLIC_SCION_PROVIDER_ID) {
      const projection = projectPublicScionCourseMapContinuations({
        currentMap: workingMap,
        expectedCount,
        buildPrompt: (map, rejected) =>
          buildCourseMapContinuationPrompt(map, expectedCount, syllabusText, colDefs, rejected),
        normalizeLessons: (lessons) => normalizeLessons(lessons, colDefs),
        admitLessons: admitCourseMapContinuationLessons,
      });
      workingMap = projection.workingMap;
      rejectedTopics = projection.rejectedTopics;
      if (workingMap.lessons.length >= expectedCount) return workingMap;
    }

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const actual = workingMap.lessons.length;
      if (actual >= expectedCount) break;

      const missing = expectedCount - actual;
      setStreamDetail(`${modelDisplayName} is completing ${missing} remaining lessons · attempt ${attempt + 1}…`);
      setStreamProgress(Math.round((actual / expectedCount) * 85));
      setCompletenessInfo({
        expected: expectedCount,
        actual,
        confidence: expectedLessonsRef.current?.confidence,
        status: 'continuing',
      });

      try {
        const contResult = await tryContinuation(
          provider,
          apiKey,
          model.id,
          model.name,
          workingMap,
          expectedCount,
          syllabusText,
          colDefs,
          systemPromptOverride,
          rejectedTopics,
        );

        if (contResult && contResult.lessons && contResult.lessons.length > 0) {
          const prevCount = workingMap.lessons.length;
          // Normalize flat→nested sections, then reject any topic identity the
          // course already owns. Repeated local responses are feedback for the
          // next bounded attempt, never rows we silently append.
          const normalized = normalizeLessons(contResult.lessons, colDefs);
          const admission = admitCourseMapContinuationLessons(workingMap.lessons, normalized);
          const sanitized = admission.lessons;
          rejectedTopics = [...new Set([...rejectedTopics, ...admission.rejectedTopics])].slice(-12);
          if (sanitized.length === 0) {
            addLog(
              modelDisplayName,
              `Rejected a repeated continuation${attempt + 1 < MAX_ATTEMPTS_PER_MODEL ? ' — asking for distinct topics' : ''}`,
              'warning',
            );
            continue;
          }
          workingMap = {
            ...workingMap,
            lessons: [...workingMap.lessons, ...sanitized],
          };
          setCourseMap(workingMap);
          courseMapRef.current = workingMap;
          const added = workingMap.lessons.length - prevCount;
          addLog(modelDisplayName, `Added ${added} lessons (${prevCount + 1}–${workingMap.lessons.length})`, 'success');
          pushVersion(workingMap, `${modelDisplayName}: added lessons ${prevCount + 1}–${workingMap.lessons.length}`);
        } else {
          addLog(modelDisplayName, `No new lessons produced`, 'warning');
          break; // this model can't help, try next
        }
      } catch (contErr) {
        if (contErr.name === 'AbortError') throw contErr;
        recordClassifiedFailedCall(
          recordApiCallEvent,
          contErr,
          { label: 'Course-map continuation failed' },
          { provider, modelId: model.id },
        );
        addLog(modelDisplayName, `Failed: ${contErr.message}`, 'error');
        break;
      }
    }

    return workingMap;
  }

  // ── In-flight guard to prevent rapid-fire generate calls ──
  const generateInFlightRef = useRef(false);

  // ── Main Generate ──
  // scopeOverride: if provided, uses this instead of the lessonScope from props (avoids async state lag)
  const handleGenerate = useCallback(
    async (scopeOverride) => {
      // Prevent duplicate calls while a generation is already in progress
      if (generateInFlightRef.current) {
        log('[useGeneration] Generate call blocked — already in flight');
        return null;
      }
      generateInFlightRef.current = true;
      recordApiCallEvent({ type: 'reset', label: 'New course package generation' });

      try {
        setError('');
        setCourseMap(null);
        setRetryInfo(null);
        setCompletenessInfo(null);
        setGenerationLog([]);

        // Resolve model display name
        const currentModelName = modelId;

        // Step 1: Parse files
        setStatus('parsing');
        setProgressStep('parsing');
        let parsedFiles = [];
        let errors = [];
        if (files.length > 0) {
          try {
            parsedFiles = await parseFiles(files);
          } catch (err) {
            setError('Failed to parse files: ' + err.message);
            setStatus('error');
            setProgressStep('error');
            return null;
          }
          errors = parsedFiles.filter((f) => f.error);
        }

        let combinedText = parsedFiles
          .filter((f) => f.text)
          .map((f) => `=== File: ${f.name} ===\n${f.text}`)
          .join('\n\n');

        // Incorporate prompt text
        const prompt = (promptText || '').trim();
        if (prompt) {
          if (combinedText.trim()) {
            combinedText = `=== Instructor Notes ===\n${prompt}\n\n${combinedText}`;
          } else {
            combinedText = prompt;
          }
        }

        if (!combinedText.trim()) {
          const errMsg =
            errors.length > 0
              ? errors.map((f) => `${f.name}: ${f.error}`).join('\n')
              : 'No text content could be extracted. Upload files or describe your course.';
          setError('Failed to parse files:\n' + errMsg);
          setStatus('error');
          setProgressStep('error');
          return null;
        }

        // Append course map reference file content if provided
        if (courseMapConfig?.referenceFile) {
          try {
            const refParsed = await parseFiles([courseMapConfig.referenceFile]);
            const refText = refParsed
              .filter((f) => f.text)
              .map((f) => f.text)
              .join('\n\n');
            if (refText.trim()) {
              combinedText = combinedText
                ? `${combinedText}\n\n=== Course Map Reference Example ===\n${refText}`
                : `=== Course Map Reference Example ===\n${refText}`;
            }
          } catch (err) {
            console.warn('Course map reference file parse failed:', err);
          }
        }

        // Append course map extra instructions if provided
        if (courseMapConfig?.extraInstructions?.trim()) {
          combinedText = combinedText
            ? `${combinedText}\n\n=== Instructor Extra Instructions ===\n${courseMapConfig.extraInstructions.trim()}`
            : `=== Instructor Extra Instructions ===\n${courseMapConfig.extraInstructions.trim()}`;
        }

        syllabusTextRef.current = combinedText;

        // Convert lessonScope to scopeIndices: null/'all' means generate all, number[] means specific lessons
        // Use scopeOverride if provided (avoids React async state lag when called immediately after setLessonScope)
        const effectiveScope = scopeOverride !== undefined ? scopeOverride : lessonScope;
        const scopeIndices = Array.isArray(effectiveScope) ? effectiveScope : null;

        // Detect expected lesson/week count from syllabus (or use scope count if specific lessons are selected)
        let detected;
        if (scopeIndices && scopeIndices.length > 0) {
          // Scope overrides auto-detection — we expect exactly the scoped lessons
          detected = { expected: scopeIndices.length, confidence: 'high' };
        } else {
          detected = detectExpectedLessons(combinedText);
        }
        expectedLessonsRef.current = detected;
        if (detected.expected) {
          setCompletenessInfo({
            expected: detected.expected,
            actual: 0,
            confidence: detected.confidence,
            status: 'generating',
          });
        }

        setProgressStep('sending');
        setStatus('generating');

        // Step 2: Check token limits
        // Auto-detect mode: use reconstruct prompt when files are present but no freeform prompt text.
        // If both files + prompt text exist, use standard prompt (instructor notes are prepended above).
        const hasFiles = parsedFiles.filter((f) => f.text).length > 0;
        const hasPrompt = (promptText || '').trim().length > 0;
        const isReconstruct = hasFiles && !hasPrompt;
        // Feature 4.2 — Append pedagogical mode instructions to the system prompt
        const modeAddition = getModeSystemAddition(pedagogicalMode || 'lecture');
        const modeCourseMapNote = getModeCourseMapNote(pedagogicalMode || 'lecture');
        const baseSystemPrompt = isReconstruct ? RECONSTRUCT_SYSTEM_PROMPT : SYSTEM_PROMPT;
        const leanCourseMap = isLeanCourseMapEnabled(generationPlan);
        const systemAdditions = [modeAddition, modeCourseMapNote, leanCourseMap ? LEAN_SYSTEM_ADDITION : null].filter(
          Boolean,
        );
        const activeSystemPrompt = systemAdditions.length
          ? `${baseSystemPrompt}\n\n${systemAdditions.join('\n')}`
          : baseSystemPrompt;
        const userPrompt = buildUserPrompt(
          combinedText,
          columns,
          scopeIndices,
          isReconstruct,
          detected?.expected || null,
          detected?.confidence,
          { lean: leanCourseMap },
        );
        const fullPromptText = activeSystemPrompt + userPrompt;
        const tokenCheck = checkTokenLimit(fullPromptText, modelId);

        let finalUserPrompt = userPrompt;
        let parseWarning = '';
        if (errors.length > 0) {
          parseWarning = `Note: ${errors.length} file(s) could not be parsed (${errors.map((f) => f.name).join(', ')}). Continuing with the rest.`;
        }
        if (!tokenCheck.fits) {
          const { text: truncatedContent, wasTruncated } = truncateToFit(combinedText, modelId);
          if (wasTruncated) {
            finalUserPrompt = buildUserPrompt(
              truncatedContent,
              columns,
              scopeIndices,
              isReconstruct,
              detected?.expected || null,
              detected?.confidence,
              { lean: leanCourseMap },
            );
            parseWarning =
              (parseWarning ? parseWarning + '\n' : '') +
              `Content was ~${tokenCheck.estimatedTokens.toLocaleString()} tokens (model limit: ~${tokenCheck.availableTokens.toLocaleString()} available). Auto-truncated to fit.`;
          }
        }
        if (parseWarning) setError(parseWarning);

        setIsStreaming(true);
        setStreamDetail('');
        setStreamProgress(0);

        // Build column keys for continuation prompts
        const colKeys =
          columns && columns.length > 0
            ? columns.map((c) => c.key)
            : [
                'learningGoals',
                'topicSection',
                'learningObjectives',
                'weeklyAssessments',
                'asyncActivities',
                'syncActivities',
                'technologyNeeded',
                'presentationFormat',
                'supportingResources',
                'evaluateDesign',
              ];

        fullTextRef.current = '';
        let finalResult = null;
        let usedModelName = currentModelName;
        let usedModelId = modelId;

        // Update active model label for ProgressPanel
        setActiveModelName(currentModelName);

        try {
          setProgressStep('generating');

          // ── v0.15.17: CourseIR direct authoring — the intended one-call
          // CurriculumV1 path. It runs only when the model/output planner says
          // a whole-course IR object fits; thin or malformed CourseIR falls
          // through to the existing native skeleton/prose fallback loudly.
          const nativeAuthoringRequested =
            readAuthoringMode() === 'native' &&
            !scopeIndices &&
            leanCourseMap &&
            !generationPlan?.planDegraded &&
            !isReconstruct;
          if (nativeAuthoringRequested) {
            const { runNativeAuthoring } = await import('../lib/courseIRAuthoringRuntime');
            const nativeMap = await runNativeAuthoring(
              [
                tokenCheck.fits ? combinedText : truncateToFit(combinedText, modelId).text,
                provider,
                apiKey,
                modelId,
                maxOutputTokens,
                modelCapabilities,
                generationPlan,
                currentModelName,
                streamProvider,
                recordApiCallEvent,
                updateGenerationProgress,
                fullTextRef,
                detected,
                STREAM_SAVE_KEY,
              ],
              [
                workingModelRef,
                setCourseMap,
                courseMapRef,
                setIsStreaming,
                setStreamDetail,
                stoppedTextRef,
                stoppedPromptRef,
                pushVersion,
                addLog,
                setCompletenessInfo,
                setOldCourseMap,
                setExamChanges,
                setPendingExamPatches,
                setStreamProgress,
                setProgressStep,
                setStatus,
                setUserEdits,
              ],
            );
            if (nativeMap) return nativeMap;
          }

          fullTextRef.current = '';
          lastGoodParseRef.current = null;
          recordApiCallEvent({
            type: 'courseMapCall',
            label: 'Course-map generation',
            detail: `${currentModelName}${leanCourseMap ? ' · lean atoms + compiler-derived columns' : ' · verbose contract'}`,
          });
          const { fullText } = await streamProvider(provider, apiKey, modelId, activeSystemPrompt, finalUserPrompt, {
            maxOutputTokens: generationPlan?.courseMapOutputTokens || maxOutputTokens,
            modelCapabilities,
            generationPlan,
            task: 'course-map',
            onApiCallEvent: recordApiCallEvent,
            onChunk: (text, count) => {
              fullTextRef.current = text;
              updateGenerationProgress(text, count);
            },
            onRetry: (attempt, max, delay) => {
              recordApiCallEvent({
                type: 'streamRetryCall',
                label: 'Course-map generation stream retry',
                detail: `${attempt}/${max}`,
              });
              setRetryInfo({ attempt, max, delay });
              setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
            },
          });

          setRetryInfo(null);

          // Final parse — fall back to last successful streaming parse if needed
          let result = parsePartialJSON(fullText);
          if (!result || !result.lessons) {
            result = lastGoodParseRef.current;
          }
          if (result && result.lessons && result.lessons.length > 0) {
            finalResult = result;
            // Store working model so examine and continuation use it
            workingModelRef.current = { provider, apiKey, modelId };
          }

          if (!finalResult || !finalResult.lessons) {
            throw new Error('Failed to generate a course map. Please check your API key and try again.');
          }

          // Sanitize: ensure every lesson has a sections array
          finalResult = {
            ...finalResult,
            lessons: finalResult.lessons.map((l) => ({
              ...l,
              sections: Array.isArray(l.sections) ? l.sections : [],
            })),
          };

          // Lean mode: deterministically render instructor-facing cell prose
          // from compact model atoms. Idempotent — string cells pass through.
          finalResult = expandLeanCourseMap(finalResult);
          // Compiler-owned columns (evaluateDesign, presentationFormat,
          // technologyNeeded) were not requested in lean mode — derive them
          // before validation so the examine scan never flags them as gaps.
          if (leanCourseMap) finalResult = deriveCompilerOwnedColumns(finalResult);

          // A high-confidence scope is a user contract, not a suggestion.
          // Small models sometimes append a generic review or capstone even
          // after being told the exact count; discard only that unrequested
          // tail before it can expand into every downstream deliverable.
          const constrainedLessonCount = constrainHighConfidenceLessonCount(finalResult, expectedLessonsRef.current);
          finalResult = constrainedLessonCount.courseMap;
          if (constrainedLessonCount.removedCount > 0) {
            addLog(
              usedModelName,
              `Removed ${constrainedLessonCount.removedCount} unrequested lesson${
                constrainedLessonCount.removedCount === 1 ? '' : 's'
              } to honor the explicit ${expectedLessonsRef.current.expected}-lesson scope`,
              'warning',
            );
          }
          finalResult = preserveMaterializedLessonNumbers(finalResult, scopeIndices);

          // Post-generation structural validation — auto-fix missing titles, sections, column keys
          let { warnings: validationWarnings } = validateCourseMap(finalResult, columns);
          if (validationWarnings.length > 0) {
            addLog(usedModelName, `Validation: ${validationWarnings.length} issue(s) found or fixed`, 'warning');
          }

          setCourseMap(finalResult);
          courseMapRef.current = finalResult;
          setIsStreaming(false);
          setStreamDetail('');
          setStreamProgress(95);
          stoppedTextRef.current = '';
          stoppedPromptRef.current = null;
          pushVersion(finalResult, 'Initial generation');

          // Log initial generation result
          addLog(usedModelName, `Generated ${finalResult.lessons.length} lessons`, 'success');

          // Step 3: Completeness check — auto-continue if lessons are missing
          const expected = expectedLessonsRef.current?.expected;
          const generatedLessonCountBeforeContinuation = finalResult.lessons.length;
          if (expected && finalResult.lessons.length < expected) {
            addLog(
              usedModelName,
              `Expected ${expected} lessons but got ${finalResult.lessons.length} — auto-completing`,
              'warning',
            );
            setIsStreaming(true);
            setProgressStep('continuing');
            try {
              finalResult = await continueForMissingLessons(
                finalResult,
                expected,
                syllabusTextRef.current,
                colKeys,
                usedModelId,
                usedModelName,
                activeSystemPrompt,
              );
            } catch (contErr) {
              if (contErr.name === 'AbortError') {
                const partial = courseMapRef.current;
                if (partial) setCourseMap(partial);
                setIsStreaming(false);
                setStreamDetail('');
                setIsStopped(true);
                setStatus('stopped');
                setCompletenessInfo((prev) =>
                  prev ? { ...prev, actual: partial?.lessons?.length || 0, status: 'incomplete' } : null,
                );
                return null;
              }
              throw contErr;
            }
            setIsStreaming(false);
            // Continuation chunks may also carry lean atoms — expand again (idempotent).
            finalResult = expandLeanCourseMap(finalResult);
            if (leanCourseMap) finalResult = deriveCompilerOwnedColumns(finalResult);
            finalResult = preserveMaterializedLessonNumbers(finalResult, scopeIndices);
            if (finalResult.lessons.length < expected) {
              setCompletenessInfo({
                expected,
                actual: finalResult.lessons.length,
                confidence: expectedLessonsRef.current?.confidence,
                status: 'incomplete',
                continuationUsed: finalResult.lessons.length > generatedLessonCountBeforeContinuation,
              });
              finalResult = assertExpectedLessonCount(finalResult, expected);
            }

            // Continuation output used to bypass course-map validation entirely.
            // Validate the final merged map so missing fields and repeated topic
            // identities can trigger the same focused review as the first call.
            const { warnings: continuationWarnings } = validateCourseMap(finalResult, columns);
            const newContinuationWarnings = continuationWarnings.filter(
              (warning) => !validationWarnings.includes(warning),
            );
            validationWarnings = [...new Set([...validationWarnings, ...continuationWarnings])];
            if (newContinuationWarnings.length > 0) {
              addLog(
                displayGenerationModelName(provider, usedModelName),
                `Continuation review: ${newContinuationWarnings.length} issue(s) found or fixed`,
                'warning',
              );
            }
            setCourseMap(finalResult);
            courseMapRef.current = finalResult;
          }

          if (provider === PUBLIC_SCION_PROVIDER_ID) {
            finalResult = applyPublicScionBriefDirectives(finalResult, combinedText);
            setCourseMap(finalResult);
            courseMapRef.current = finalResult;
          }

          // Update completeness info
          const actualCount = finalResult.lessons.length;
          const continuationUsed = expected && finalResult.lessons.length > generatedLessonCountBeforeContinuation;
          if (expected) {
            const cStatus = actualCount >= expected ? 'complete' : 'incomplete';
            setCompletenessInfo({
              expected,
              actual: actualCount,
              confidence: expectedLessonsRef.current.confidence,
              status: cStatus,
              continuationUsed: !!continuationUsed,
            });
          } else {
            setCompletenessInfo({
              expected: null,
              actual: actualCount,
              confidence: 'low',
              status: 'unknown',
              continuationUsed: false,
            });
          }

          courseMapRef.current = finalResult;

          // Examine step: only spend this call when deterministic checks found a reason.
          const examineScan = getCourseMapExamineScan({
            courseMap: finalResult,
            columns,
            validationWarnings,
            expectedInfo: expectedLessonsRef.current,
          });
          const examineTriggers = examineScan.triggers;
          if (examineTriggers.length > 0) {
            addLog(
              usedModelName,
              `Reviewing course map: ${examineTriggers.slice(0, 2).join('; ')}${examineTriggers.length > 2 ? '...' : ''}`,
              'warning',
            );
            // v0.15.186: fire-and-forget. The review's only output is pending
            // patches for the instructor review UI — the compiled deliverables
            // never consume it — yet awaiting it here used to delay the entire
            // deliverables phase by a full model call.
            void runExamine(finalResult, {
              reason: 'automatic',
              triggers: examineTriggers,
              focusLessonIndices: examineScan.focusLessonIndices,
              background: true,
            }).catch(() => {});
          } else {
            setOldCourseMap(null);
            setExamChanges([]);
            setPendingExamPatches(null);
            recordApiCallEvent({
              type: 'skippedExamine',
              label: 'Skipped course-map review',
              detail: 'Deterministic checks passed',
            });
            addLog(usedModelName, 'Skipped course-map review — deterministic checks passed', 'success');
          }

          setStreamDetail('');
          setStreamProgress(100);
          setProgressStep('done');
          setStatus('done');
          setUserEdits([]);
          try {
            localStorage.removeItem(STREAM_SAVE_KEY);
          } catch {}
          return finalResult;
        } catch (err) {
          setRetryInfo(null);
          if (err.name === 'AbortError') {
            stoppedTextRef.current = fullTextRef.current;
            const partial = parsePartialJSON(fullTextRef.current);
            if (partial && partial.lessons) setCourseMap(partial);
            setIsStreaming(false);
            setStreamDetail('');
            setIsStopped(true);
            setStatus('stopped');
            return null;
          }
          recordClassifiedFailedCall(
            recordApiCallEvent,
            err,
            { label: 'Course-map generation failed' },
            { provider, modelId },
          );
          setError('AI generation failed: ' + err.message);
          setStatus('error');
          setProgressStep('error');
          setIsStreaming(false);
          setStreamDetail('');
          setStreamProgress(0);
          return null;
        }
      } finally {
        generateInFlightRef.current = false;
      }
    },
    [
      provider,
      modelId,
      apiKey,
      maxOutputTokens,
      modelCapabilities,
      generationPlan,
      files,
      columns,
      promptText,
      lessonScope,
      pedagogicalMode,
      setCourseMap,
      setOldCourseMap,
      pushVersion,
      setUserEdits,
      streamProvider,
      parsePartialJSON,
      recordApiCallEvent,
    ],
  );

  // ── Resume Generation ──
  const handleResume = useCallback(async () => {
    const savedText = stoppedTextRef.current;
    if (import.meta.env.DEV)
      console.log('[Resume] stoppedText length:', savedText?.length || 0, 'provider:', provider, 'modelId:', modelId);
    if (!savedText) {
      setError('Nothing to resume — no saved generation data found.');
      return null;
    }

    const resumeProvider = provider;
    const resumeKey = apiKey;
    const resumeModel = modelId;

    if (!resumeKey) {
      setError('No API key provided — please enter your API key and try again.');
      return null;
    }
    if (!resumeModel) {
      setError('No model selected — please select a model and try again.');
      return null;
    }

    if (import.meta.env.DEV)
      console.log('[Resume] using:', resumeProvider, resumeModel, 'key length:', resumeKey?.length || 0);

    setIsStopped(false);
    setStatus('generating');
    setProgressStep('generating');
    setIsStreaming(true);
    setStreamDetail('Resuming generation...');
    setError('');
    setRetryInfo(null);

    // Parse what we already have so we can merge later
    const existingMap = parsePartialJSON(savedText);
    const existingLessons = existingMap?.lessons || [];
    const existingLessonCount = existingLessons.length;
    const colKeys = columns.map((c) => c.key);
    if (import.meta.env.DEV)
      console.log('[Resume] existing map has', existingLessonCount, 'lessons, rawLen:', savedText.length);

    // Separate complete vs incomplete lessons
    let completeLessons = [...existingLessons];
    let incompleteLesson = null;
    if (existingLessonCount > 0) {
      const lastLesson = existingLessons[existingLessonCount - 1];
      const lastSections = lastLesson.sections || [];
      const lastSection = lastSections[lastSections.length - 1];
      const filledKeys = lastSection ? colKeys.filter((k) => lastSection[k] && String(lastSection[k]).trim()) : [];
      if (!lastSection || filledKeys.length < colKeys.length) {
        incompleteLesson = lastLesson;
        completeLessons = existingLessons.slice(0, -1);
        if (import.meta.env.DEV)
          console.log(
            '[Resume] last lesson incomplete:',
            lastLesson.title,
            'filled:',
            filledKeys.length,
            '/',
            colKeys.length,
          );
      }
    }

    try {
      let continuationPrompt;

      if (existingLessonCount === 0) {
        // ── Stopped very early (no complete lessons parsed) — give AI the raw partial text ──
        // Truncate raw text to last 3000 chars to avoid token limits
        const rawContext = savedText.length > 3000 ? '...' + savedText.slice(-3000) : savedText;
        continuationPrompt = `You were generating a Course Map JSON but the output was interrupted very early. Here is the raw partial output that was generated before interruption:\n\n${rawContext}\n\nPlease generate the COMPLETE course map as a valid JSON object. Include ALL lessons for the entire course. The JSON must have: "courseName" (string), "semester" (string), "lessons" (array).\n\nEach lesson must have: "title" (string), "sections" (array of section objects). Each section must contain ALL of these keys: ${colKeys.join(', ')}.\n\nIncorporate any content from the partial output above — do not discard what was already started. Output ONLY valid JSON, no markdown fences.`;
        if (import.meta.env.DEV) console.log('[Resume] using raw-text approach (0 lessons parsed)');
      } else {
        // ── Have some lessons — ask AI for remaining ──
        const completedSummary =
          completeLessons
            .map((l, i) => `  Lesson ${i + 1}: ${l.title || 'Untitled'} (${l.sections?.length || 0} sections)`)
            .join('\n') || '(none)';

        let incompleteInfo = '';
        if (incompleteLesson) {
          incompleteInfo = `\n\nIMPORTANT: The last lesson was INCOMPLETE when interrupted. Here is what was generated so far for it:\n${JSON.stringify(incompleteLesson, null, 2)}\n\nYou MUST first output a COMPLETE version of this lesson (title: "${incompleteLesson.title}") with ALL section keys filled in. Then continue with the remaining lessons.`;
        }

        continuationPrompt = `You were generating a Course Map JSON and the output was interrupted. Here is a summary of what was already generated:\n\nCourse: ${existingMap?.courseName || 'Unknown'}\nSemester: ${existingMap?.semester || 'Unknown'}\nFully completed lessons:\n${completedSummary}${incompleteInfo}\n\nPlease output a valid JSON object with this structure:\n{"lessons": [ ...array of the remaining lesson objects... ]}\n\nEach lesson must have: "title" (string), "sections" (array of section objects). Each section must contain ALL of these keys: ${colKeys.join(', ')}.\n\n${incompleteLesson ? `Start by completing "${incompleteLesson.title}" (Lesson ${completeLessons.length + 1}), then continue.` : `Start from Lesson ${completeLessons.length + 1}.`} Generate content that logically continues the course. Output ONLY valid JSON, no markdown fences.`;
      }

      if (import.meta.env.DEV)
        console.log('[Resume] calling streamProvider, prompt length:', continuationPrompt.length);
      fullTextRef.current = '';
      recordApiCallEvent({
        type: 'courseMapCall',
        label: 'Course-map resume',
        detail: resumeModel,
      });
      const { fullText } = await streamProvider(
        resumeProvider,
        resumeKey,
        resumeModel,
        SYSTEM_PROMPT,
        continuationPrompt,
        {
          maxOutputTokens: generationPlan?.courseMapOutputTokens || maxOutputTokens,
          modelCapabilities,
          generationPlan,
          task: 'repair',
          onApiCallEvent: recordApiCallEvent,
          onChunk: (text, count) => {
            fullTextRef.current = text;
            if (import.meta.env.DEV && (count <= 3 || count % 20 === 0))
              console.log('[Resume] chunk', count, 'totalLen:', text.length);
            const now = performance.now();
            if (now - lastUIUpdateRef.current < 150) return;
            lastUIUpdateRef.current = now;
            const newPart = parsePartialJSON(text);
            if (newPart && newPart.lessons && newPart.lessons.length > 0) {
              if (existingLessonCount === 0) {
                // Early-stop case: AI is generating the full map
                setCourseMap({ ...newPart });
              } else {
                // Normal case: merge with existing complete lessons
                const merged = { ...existingMap, lessons: [...completeLessons, ...newPart.lessons] };
                setCourseMap({ ...merged });
              }
              const displayed =
                existingLessonCount === 0 ? newPart : { lessons: [...completeLessons, ...newPart.lessons] };
              const totalLessons = displayed.lessons.length;
              const lastL = displayed.lessons[displayed.lessons.length - 1];
              setStreamDetail(`Mapping ${lastL?.title || `Lesson ${totalLessons}`}...`);
              setStreamProgress(Math.min(90, Math.round((text.length / Math.max(text.length * 1.3, 4000)) * 90)));
            }
          },
          onRetry: (attempt, max, delay) => {
            recordApiCallEvent({
              type: 'streamRetryCall',
              label: 'Course-map resume stream retry',
              detail: `${attempt}/${max}`,
            });
            setRetryInfo({ attempt, max, delay });
            setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
          },
        },
      );

      setRetryInfo(null);
      const newPart = parsePartialJSON(fullText);
      let finalResult;
      if (existingLessonCount === 0 && newPart && newPart.lessons) {
        // Early-stop: AI generated the full map
        finalResult = newPart;
      } else if (newPart && newPart.lessons && newPart.lessons.length > 0) {
        finalResult = { ...existingMap, lessons: [...completeLessons, ...newPart.lessons] };
      } else if (existingMap && existingMap.lessons && existingMap.lessons.length > 0) {
        warn('[Resume] AI did not produce new lessons, keeping existing map');
        finalResult = existingMap;
      } else {
        throw new Error('Invalid response structure from AI.');
      }

      // Merge any edits the user made while stopped
      const merged = applyUserEdits(finalResult);
      setCourseMap(merged);
      setIsStreaming(false);
      setStreamDetail('');
      setStreamProgress(100);
      stoppedTextRef.current = '';
      stoppedPromptRef.current = null;
      pushVersion(merged, 'Resumed generation');
      setProgressStep('done');
      setStatus('done');
      try {
        localStorage.removeItem(STREAM_SAVE_KEY);
      } catch {}
      return merged;
    } catch (err) {
      setRetryInfo(null);
      if (err.name === 'AbortError') {
        // Merge whatever the AI produced so far
        const newPart = parsePartialJSON(fullTextRef.current);
        if (newPart && newPart.lessons && newPart.lessons.length > 0) {
          let merged;
          if (existingLessonCount === 0) {
            merged = newPart;
          } else {
            merged = { ...(existingMap || {}), lessons: [...completeLessons, ...newPart.lessons] };
          }
          setCourseMap(merged);
          // Save merged JSON so next resume has the accumulated progress
          stoppedTextRef.current = JSON.stringify(merged);
        }
        setIsStreaming(false);
        setStreamDetail('');
        setIsStopped(true);
        setStatus('stopped');
        return null;
      }
      // Resume failed — go back to stopped state so user can retry
      recordClassifiedFailedCall(
        recordApiCallEvent,
        err,
        { label: 'Course-map resume failed' },
        { provider: resumeProvider, modelId: resumeModel },
      );
      setError('Resume failed: ' + err.message);
      setStatus('stopped');
      setIsStreaming(false);
      setStreamDetail('');
      setIsStopped(true);
      setProgressStep('generating');
      // Keep stoppedTextRef so user can retry
      return null;
    }
  }, [
    provider,
    modelId,
    apiKey,
    maxOutputTokens,
    modelCapabilities,
    generationPlan,
    columns,
    setCourseMap,
    pushVersion,
    userEdits,
    streamProvider,
    parsePartialJSON,
    recordApiCallEvent,
  ]);

  const handleStop = useCallback(() => {
    abort();
  }, [abort]);

  const handleClearAll = useCallback(() => {
    setIsStopped(false);
    setCourseMap(null);
    setStatus('idle');
    setProgressStep(null);
    setStreamProgress(0);
    setStreamDetail('');
    setError('');
    setOldCourseMap(null);
    stoppedTextRef.current = '';
    stoppedPromptRef.current = null;
    setRetryInfo(null);
    setCompletenessInfo(null);
    setGenerationLog([]);
    setExamChanges([]);
    setPendingExamPatches(null);
    try {
      localStorage.removeItem(STREAM_SAVE_KEY);
    } catch {}
  }, [setCourseMap, setOldCourseMap]);

  const resetGeneration = useCallback(() => {
    setStatus('idle');
    setProgressStep(null);
    setError('');
    setIsStreaming(false);
    setStreamDetail('');
    setStreamProgress(0);
    setIsStopped(false);
    setExamChanges([]);
    setPendingExamPatches(null);
    setRetryInfo(null);
    setCompletenessInfo(null);
    setGenerationLog([]);
    stoppedTextRef.current = '';
    stoppedPromptRef.current = null;
    syllabusTextRef.current = '';
    expectedLessonsRef.current = null;
    abort();
    try {
      localStorage.removeItem(STREAM_SAVE_KEY);
    } catch {}
  }, [abort]);

  // ── Restore interrupted generation from localStorage (called on mount) ──
  const restoreStoppedState = useCallback(() => {
    try {
      const savedText = localStorage.getItem(STREAM_SAVE_KEY);
      if (!savedText || savedText.length < 50) return false;
      stoppedTextRef.current = savedText;
      fullTextRef.current = savedText;
      // Parse the partial text and show the in-progress courseMap
      const partial = parsePartialJSON(savedText);
      if (partial && partial.lessons) {
        setCourseMap(partial);
      }
      setIsStopped(true);
      setStatus('stopped');
      setProgressStep('generating');
      setStreamDetail('Generation was interrupted — click Resume to continue');
      localStorage.removeItem(STREAM_SAVE_KEY);
      return true;
    } catch {
      return false;
    }
  }, [parsePartialJSON, setCourseMap]);

  const handleRetryExamine = useCallback(async () => {
    if (!courseMapRef.current) return;
    await runExamine(courseMapRef.current, { reason: 'manual', triggers: ['user requested a review'] });
    setStreamDetail('');
    setStreamProgress(100);
    setProgressStep('done');
    setStatus('done');
  }, [
    provider,
    modelId,
    apiKey,
    maxOutputTokens,
    modelCapabilities,
    generationPlan,
    lessonScope,
    streamProvider,
    parsePartialJSON,
    recordApiCallEvent,
  ]);

  return {
    status,
    setStatus,
    progressStep,
    setProgressStep,
    error,
    setError,
    isStreaming,
    setIsStreaming,
    streamDetail,
    setStreamDetail,
    streamProgress,
    setStreamProgress,
    isStopped,
    setIsStopped,
    examChanges,
    pendingExamPatches,
    onAcceptPatches,
    onRejectPatch,
    retryInfo,
    setRetryInfo,
    completenessInfo,
    generationLog,
    activeModelName,
    abortControllerRef,
    parsePartialJSON,
    handleGenerate,
    handleResume,
    handleStop,
    handleClearAll,
    resetGeneration,
    handleRetryExamine,
    restoreStoppedState,
  };
}
