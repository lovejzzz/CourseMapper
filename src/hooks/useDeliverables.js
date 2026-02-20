import { useState, useCallback, useRef, useContext } from 'react';
import useStreamReader from './useStreamReader';
import { getDeliverablePrompt } from '../lib/deliverablePrompts';
import { getArrayKey } from '../lib/syncDependencies';
import { getCustomDeliverable } from '../lib/customDeliverableLibrary';
import { scoreHeuristic } from '../lib/deliverableQualityScorer';
import { notifyDone } from '../lib/notifyDone';
import { CourseStateContext, CourseDispatchContext, actions } from '../model/courseStore.jsx';

// ── Post-process scoped deliverable output to fix lesson/week numbering ──
// When the user generates a subset of lessons (e.g., lesson 6 only), the AI may
// still label it as "Week 1" / "Lesson 1" because it's the first item in its output.
// This function patches each item to use the correct original lesson numbers.
function patchScopeNumbering(parsed, featureId, scopeIndices, courseMap) {
  if (!Array.isArray(scopeIndices) || scopeIndices.length === 0) return parsed;
  const k = getArrayKey(featureId, parsed);
  const arr = k ? (parsed[k] || []) : [];
  if (arr.length === 0) return parsed;

  const allLessons = courseMap?.lessons || [];

  // Same pattern as condenseCourseMap / buildScopePreamble:
  // When the course map was already scoped (e.g., only 1 lesson for scope index 4),
  // origIdx will be >= allLessons.length.  In that case, the lesson at array position i
  // corresponds to scopeIndices[i], and we can still correct its week/lesson number
  // even though the courseMap only has the scoped subset.
  const alreadyScoped = scopeIndices.every(i => i >= allLessons.length);

  const patched = arr.map((item, i) => {
    const origIdx = scopeIndices[i];
    if (origIdx == null) return item;

    const weekLabel = `Week ${origIdx + 1}`;
    const updates = {};

    // Fix weekNumber (lessonPlans, etc.)
    if ('weekNumber' in item) updates.weekNumber = weekLabel;

    // Fix lessonTitle — use the original course map title if available
    if ('lessonTitle' in item) {
      if (!alreadyScoped && origIdx < allLessons.length && allLessons[origIdx]?.title) {
        updates.lessonTitle = allLessons[origIdx].title;
      } else if (alreadyScoped && i < allLessons.length && allLessons[i]?.title) {
        // Already-scoped: lesson at position i in the scoped map
        updates.lessonTitle = allLessons[i].title;
      }
    }

    return Object.keys(updates).length > 0 ? { ...item, ...updates } : item;
  });

  return { ...parsed, [k]: patched };
}

// Human-readable labels for logging (built-ins only)
const FEATURE_LABELS_MAP = {
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  rubrics: 'Rubrics',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
};

function getFeatureLabel(featureId) {
  if (FEATURE_LABELS_MAP[featureId]) return FEATURE_LABELS_MAP[featureId];
  if (featureId?.startsWith('custom_')) {
    const custom = getCustomDeliverable(featureId);
    return custom?.name || featureId;
  }
  return featureId;
}

// ── Feature 6.1: Coherence Summary Builder ──
const MAX_COHERENCE_CHARS = 2000;

function buildCoherenceSummary(deliverablesSoFar) {
  const parts = [];

  const quiz = deliverablesSoFar.quizBank?.data;
  if (quiz) {
    const quizzes = quiz.quizzes || quiz.quizBank || [];
    const stems = [];
    quizzes.forEach(lesson => {
      (lesson.tiers?.standard || lesson.questions || []).slice(0, 3).forEach(q => {
        if (q.question) stems.push(q.question.slice(0, 80));
      });
    });
    if (stems.length > 0) {
      parts.push(`Quiz questions already used (do not repeat):\n${stems.slice(0, 10).map(s => `- ${s}`).join('\n')}`);
    }
  }

  const asgn = deliverablesSoFar.assignments?.data;
  if (asgn) {
    const list = asgn.assignments || [];
    const titles = list.flatMap(l => (l.tiers?.standard || l.assignments || [l]).map(a => a.title).filter(Boolean)).slice(0, 8);
    if (titles.length > 0) {
      parts.push(`Assignment titles already used:\n${titles.map(t => `- ${t}`).join('\n')}`);
    }
  }

  const rub = deliverablesSoFar.rubrics?.data;
  if (rub) {
    const list = rub.rubrics || [];
    const criteria = list.flatMap(l => (l.criteria || []).map(c => c.name).filter(Boolean)).slice(0, 10);
    if (criteria.length > 0) {
      parts.push(`Rubric criteria already defined:\n${criteria.map(c => `- ${c}`).join('\n')}`);
    }
  }

  const lp = deliverablesSoFar.lessonPlans?.data;
  if (lp) {
    const list = lp.lessonPlans || [];
    const goals = list.flatMap(l => {
      const plan = l.tiers?.standard || l;
      return (plan.learningObjectives || []).slice(0, 1);
    }).filter(Boolean).slice(0, 5);
    if (goals.length > 0) {
      parts.push(`Learning objectives already defined (maintain terminology consistency):\n${goals.map(g => `- ${g}`).join('\n')}`);
    }
  }

  const summary = parts.join('\n\n');
  if (!summary) return '';
  const truncated = summary.length > MAX_COHERENCE_CHARS
    ? summary.slice(0, MAX_COHERENCE_CHARS) + '…'
    : summary;
  return `\n\nALREADY GENERATED CONTEXT (for consistency — do not repeat these items):\n${truncated}`;
}

/**
 * Hook for generating additional deliverables (lesson plans, rubrics, etc.)
 * Deliverables state lives in the course store; this hook owns only transient
 * streaming/progress state.
 */
export default function useDeliverables({ provider, modelId, apiKey, deliverableConfig, lockedLessons, pedagogicalMode }) {
  // ── Read deliverables from the store ──
  const storeState = useContext(CourseStateContext);
  const dispatch   = useContext(CourseDispatchContext);
  const deliverables = storeState?.deliverables || {};

  // ── Transient / streaming-only state (not persisted) ──
  const [isGenerating, setIsGenerating]   = useState(false);
  const [currentFeature, setCurrentFeature] = useState(null);
  const [progress, setProgress]           = useState({ done: 0, total: 0 });
  const [generationLog, setGenerationLog] = useState([]);
  const [qualityScores, setQualityScores] = useState({});
  const [delivTimings, setDelivTimings]   = useState({});  // { featureId: { startedAt, endedAt, durationMs } }
  const abortRef    = useRef(null);
  const startedRef  = useRef(false);

  const deliverableConfigRef = useRef(deliverableConfig);
  deliverableConfigRef.current = deliverableConfig;
  const pedagogicalModeRef = useRef(pedagogicalMode || 'lecture');
  pedagogicalModeRef.current = pedagogicalMode || 'lecture';
  const lockedLessonsRef = useRef(lockedLessons);
  lockedLessonsRef.current = lockedLessons;

  const { streamProvider, parsePartialJSON } = useStreamReader();

  const appendLog = useCallback((message, type = 'info') => {
    setGenerationLog(prev => [...prev, { message, type, at: Date.now() }]);
  }, []);

  const generateAll = useCallback(async (courseMap, features, scopeIndices = null) => {
    const toGenerate = features.filter(f => f !== 'courseMap');
    if (toGenerate.length === 0 || !courseMap) return;

    startedRef.current = true;
    setIsGenerating(true);
    setProgress({ done: 0, total: toGenerate.length });
    setGenerationLog([]);
    setDelivTimings({});

    const lessonCount = (courseMap.lessons || []).length;
    const scopeDesc = scopeIndices
      ? `${scopeIndices.length} lesson${scopeIndices.length !== 1 ? 's' : ''}`
      : `all ${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}`;

    appendLog(`Starting generation of ${toGenerate.length} deliverable${toGenerate.length !== 1 ? 's' : ''} for ${scopeDesc}`, 'start');

    const completedDeliverables = {};

    for (let i = 0; i < toGenerate.length; i++) {
      const featureId = toGenerate[i];
      const label = getFeatureLabel(featureId);
      const delivStartTime = Date.now();
      setCurrentFeature(featureId);
      dispatch(actions.setDeliverableStreaming(featureId));
      setDelivTimings(prev => ({ ...prev, [featureId]: { startedAt: delivStartTime, endedAt: null, durationMs: null } }));

      appendLog(`Generating ${label} (${i + 1}/${toGenerate.length}) — asking AI for ${scopeDesc}...`, 'progress');

      const config = deliverableConfigRef.current?.[featureId] || {};
      const prompts = getDeliverablePrompt(featureId, courseMap, scopeIndices, config, pedagogicalModeRef.current);
      if (!prompts) {
        dispatch(actions.setDeliverableError(featureId, 'No prompt template'));
        setProgress(prev => ({ ...prev, done: prev.done + 1 }));
        appendLog(`✗ ${label}: No prompt template available`, 'error');
        continue;
      }

      const coherenceCtx = buildCoherenceSummary(completedDeliverables);
      const coherentSystemPrompt = coherenceCtx
        ? prompts.systemPrompt + coherenceCtx
        : prompts.systemPrompt;

      let tokenCount = 0;
      let logTimer = null;

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        let fullText = '';
        let lastParseTime = 0;
        let streamStarted = false;

        const result = await streamProvider(
          provider, apiKey, modelId,
          coherentSystemPrompt, prompts.userPrompt,
          {
            onChunk: (accumulatedText) => {
              fullText = accumulatedText;
              tokenCount = Math.round(accumulatedText.length / 4);

              if (!streamStarted) {
                streamStarted = true;
                appendLog(`Receiving ${label} response from AI...`, 'progress');
                logTimer = setInterval(() => {
                  appendLog(`Still generating ${label}… (~${tokenCount} tokens received)`, 'progress');
                }, 3000);
              }

              const now = Date.now();
              if (now - lastParseTime > 150) {
                lastParseTime = now;
                const partial = parsePartialJSON(fullText);
                if (partial) {
                  // Streaming preview — dispatch as streaming with partial data
                  dispatch({ type: 'SET_DELIVERABLE', payload: { featureId, status: 'streaming', data: partial, error: null, stale: false } });
                }
              }
            },
            maxRetries: 2,
            onRetry: (attempt) => {
              appendLog(`⚠ ${label}: Connection interrupted — retrying (attempt ${attempt}/2)...`, 'warn');
            },
          }
        );

        if (logTimer) clearInterval(logTimer);

        const text = result?.fullText || fullText;
        const parsed = parsePartialJSON(text);

        if (parsed) {
          // Post-process: fix lesson/week numbering for scoped generation
          const finalData = patchScopeNumbering(parsed, featureId, scopeIndices, courseMap);
          let itemCount = 0;
          const k = getArrayKey(featureId, finalData);
          const arr = k ? (finalData[k] || []) : [];
          itemCount = arr.length;
          const delivEndTime = Date.now();
          const delivDuration = delivEndTime - delivStartTime;
          setDelivTimings(prev => ({ ...prev, [featureId]: { startedAt: delivStartTime, endedAt: delivEndTime, durationMs: delivDuration } }));
          const durStr = delivDuration < 60000 ? `${(delivDuration / 1000).toFixed(1)}s` : `${(delivDuration / 60000).toFixed(1)}m`;
          const countDesc = itemCount > 0 ? ` — ${itemCount} item${itemCount !== 1 ? 's' : ''} generated` : '';
          appendLog(`✓ ${label} complete${countDesc} (${durStr})`, 'done');
          dispatch(actions.setDeliverableDone(featureId, finalData));
          completedDeliverables[featureId] = { data: finalData };

          try {
            const quality = scoreHeuristic(featureId, parsed);
            setQualityScores(prev => ({ ...prev, [featureId]: quality }));
          } catch { /* ignore scoring errors */ }
        } else {
          appendLog(`⚠ ${label}: AI response was incomplete or could not be parsed`, 'warn');
          dispatch(actions.setDeliverableError(featureId, 'Failed to parse AI response'));
        }
      } catch (err) {
        if (logTimer) clearInterval(logTimer);
        const delivEndTime = Date.now();
        setDelivTimings(prev => ({ ...prev, [featureId]: { startedAt: delivStartTime, endedAt: delivEndTime, durationMs: delivEndTime - delivStartTime } }));
        if (err.name === 'AbortError') {
          appendLog(`${label}: Generation stopped by user`, 'warn');
          break;
        }
        const errMsg = err.message || 'Generation failed';
        appendLog(`✗ ${label}: ${errMsg}`, 'error');
        dispatch(actions.setDeliverableError(featureId, errMsg));
      }

      setProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    setIsGenerating(false);
    setCurrentFeature(null);
    appendLog('All deliverables generated', 'done');
    notifyDone('All deliverables are ready!');
  }, [provider, modelId, apiKey, streamProvider, parsePartialJSON, appendLog, dispatch]);

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    setCurrentFeature(null);
  }, []);

  const resetDeliverables = useCallback(() => {
    stopGenerating();
    dispatch(actions.resetDeliverables());
    setProgress({ done: 0, total: 0 });
    setGenerationLog([]);
    startedRef.current = false;
  }, [stopGenerating, dispatch]);

  const markAllStale = useCallback(() => {
    dispatch(actions.markAllStale());
  }, [dispatch]);

  const resyncAll = useCallback(async (courseMap, features, scopeIndices = null) => {
    const staleIds = features.filter(f =>
      f !== 'courseMap' && deliverables[f]?.stale
    );
    if (staleIds.length === 0 || !courseMap) return;
    await generateAll(courseMap, staleIds, scopeIndices);
  }, [deliverables, generateAll]);

  const regenerateLesson = useCallback(async (featureId, courseMap, lessonIndex) => {
    if (!courseMap) return;
    if (lockedLessonsRef.current?.has(lessonIndex)) {
      appendLog(`⚠ Lesson ${lessonIndex + 1} is locked — skipping regeneration`, 'warn');
      return;
    }
    const label = getFeatureLabel(featureId);

    // Mark as regenerating (use SET_DELIVERABLE to preserve existing data)
    const existing = deliverables[featureId];
    if (existing) {
      dispatch({ type: 'SET_DELIVERABLE', payload: { featureId, status: existing.status, data: existing.data, error: null, stale: existing.stale, regeneratingIndex: lessonIndex } });
    }

    appendLog(`Regenerating Lesson ${lessonIndex + 1} in ${label}...`, 'progress');

    const regenConfig = deliverableConfigRef.current?.[featureId] || {};
    const prompts = getDeliverablePrompt(featureId, courseMap, [lessonIndex], regenConfig, pedagogicalModeRef.current);
    if (!prompts) {
      if (existing) {
        dispatch({ type: 'SET_DELIVERABLE', payload: { featureId, status: existing.status, data: existing.data, error: null, stale: existing.stale, regeneratingIndex: null } });
      }
      appendLog(`✗ ${label}: No prompt for lesson ${lessonIndex + 1}`, 'error');
      return;
    }

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      let fullText = '';
      await streamProvider(
        provider, apiKey, modelId,
        prompts.systemPrompt, prompts.userPrompt,
        {
          onChunk: (accumulatedText) => { fullText = accumulatedText; },
          maxRetries: 2,
        }
      );

      const parsed = parsePartialJSON(fullText);
      if (parsed) {
        // Post-process: fix lesson/week numbering for single-lesson regeneration
        const finalParsed = patchScopeNumbering(parsed, featureId, [lessonIndex], courseMap);
        // Merge regenerated lesson(s) into existing data
        const existingData = deliverables[featureId]?.data;
        const existingKey = getArrayKey(featureId, existingData);
        const newKey = getArrayKey(featureId, finalParsed);
        if (existingKey && existingData) {
          const existingArr = existingData[existingKey] || [];
          const newArr = finalParsed[newKey] || [];
          const merged = [...existingArr];
          newArr.forEach((item, i) => {
            const targetIdx = lessonIndex + i;
            if (targetIdx < merged.length) merged[targetIdx] = item;
            else merged.push(item);
          });
          dispatch(actions.setDeliverableDone(featureId, { ...existingData, [existingKey]: merged }));
        } else {
          dispatch(actions.setDeliverableDone(featureId, finalParsed));
        }
        appendLog(`✓ Lesson ${lessonIndex + 1} in ${label} regenerated`, 'done');
      } else {
        appendLog(`⚠ ${label}: Lesson ${lessonIndex + 1} regeneration response was incomplete`, 'warn');
        if (existing) {
          dispatch({ type: 'SET_DELIVERABLE', payload: { featureId, status: existing.status, data: existing.data, error: null, stale: existing.stale, regeneratingIndex: null } });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn(`Regenerate lesson ${lessonIndex} failed:`, err);
        appendLog(`✗ ${label}: Lesson ${lessonIndex + 1} regeneration failed — ${err.message || 'Unknown error'}`, 'error');
      }
      if (existing) {
        dispatch({ type: 'SET_DELIVERABLE', payload: { featureId, status: existing.status, data: existing.data, error: null, stale: existing.stale, regeneratingIndex: null } });
      }
    }
  }, [provider, modelId, apiKey, streamProvider, parsePartialJSON, appendLog, dispatch, deliverables]);

  // ── Surgical resync: handles non-per-lesson deliverables (syllabus, custom) ──
  // Per-lesson deliverables are handled by useSmartSync's queue via handleCourseMapResync.
  const surgicalResync = useCallback(async (courseMap, features) => {
    if (!courseMap) return;
    const nonPerLesson = [];
    // Syllabus is never per-lesson — full regen
    if (features.includes('syllabus') && deliverables['syllabus']?.stale) {
      nonPerLesson.push('syllabus');
    }
    // Custom deliverables that lack per-lesson structure also get full regen
    for (const f of features) {
      if (f.startsWith('custom_') && deliverables[f]?.stale) {
        const data = deliverables[f]?.data;
        const arrayKey = getArrayKey(f, data);
        const arr = data?.[arrayKey];
        // If no array or array is empty, treat as non-per-lesson
        if (!Array.isArray(arr) || arr.length === 0) {
          nonPerLesson.push(f);
        }
      }
    }
    if (nonPerLesson.length > 0) {
      await generateAll(courseMap, nonPerLesson, null);
    }
  }, [deliverables, generateAll]);

  // staleCount as a computed value from store
  const staleCount = Object.values(deliverables).filter(d => d?.stale).length;

  // setDeliverables shim for legacy call sites in App.jsx (handleRestoreSession etc.)
  // Maps from { [id]: entry } bulk set → individual dispatches
  const setDeliverables = useCallback((updaterOrObj) => {
    const obj = typeof updaterOrObj === 'function'
      ? updaterOrObj(deliverables)
      : updaterOrObj;
    for (const [featureId, entry] of Object.entries(obj)) {
      if (entry) {
        dispatch(actions.setDeliverable(featureId, entry.status || 'done', entry.data || null, entry.error || null, entry.stale || false));
      }
    }
  }, [deliverables, dispatch]);

  return {
    deliverables,
    setDeliverables,  // shim — remove after App.jsx is fully migrated
    isGenerating,
    currentFeature,
    progress,
    generateAll,
    stopGenerating,
    resetDeliverables,
    markAllStale,
    resyncAll,
    regenerateLesson,
    surgicalResync,
    staleCount,
    started: startedRef.current,
    generationLog,
    qualityScores,
    delivTimings,
  };
}
