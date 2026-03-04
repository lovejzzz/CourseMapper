import { useState, useCallback, useRef, useContext, useEffect } from 'react';
import useStreamReader from './useStreamReader';
import { getDeliverablePrompt } from '../lib/deliverablePrompts';
import { getArrayKey } from '../lib/syncDependencies';
import { getCustomDeliverable } from '../lib/customDeliverableLibrary';
import { scoreHeuristic, computeAvgScore } from '../lib/deliverableQualityScorer';
import { notifyDone } from '../lib/notifyDone';
import { CourseStateContext, CourseDispatchContext, actions } from '../model/courseStore.jsx';
import {
  pLimit, createChunkPlan, mergeChunkResults, findMissingIndices,
  chunkArray, CHUNK_SIZE, MAX_CONCURRENT, MAX_RETRY_ROUNDS,
} from '../lib/parallelGenerator';

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
  courseFaq: 'Course FAQ',
};

function getFeatureLabel(featureId) {
  if (FEATURE_LABELS_MAP[featureId]) return FEATURE_LABELS_MAP[featureId];
  if (featureId?.startsWith('custom_')) {
    const custom = getCustomDeliverable(featureId);
    return custom?.name || featureId;
  }
  return featureId;
}

/**
 * Hook for generating additional deliverables (lesson plans, rubrics, etc.)
 * Deliverables state lives in the course store; this hook owns only transient
 * streaming/progress state.
 *
 * V2.0: Parallel chunked generation — all features fire simultaneously,
 * each split into chunks of CHUNK_SIZE lessons running sequentially per feature.
 * This eliminates live-preview "flashing" (one active stream per feature).
 */
export default function useDeliverables({ provider, modelId, apiKey, maxOutputTokens, deliverableConfig, lockedLessons, pedagogicalMode, examChanges, columns }) {
  // ── Read deliverables from the store ──
  const storeState = useContext(CourseStateContext);
  const dispatch = useContext(CourseDispatchContext);
  const deliverables = storeState?.deliverables || {};

  // ── Transient / streaming-only state (not persisted) ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentFeatures, setCurrentFeatures] = useState(new Set()); // tracks ALL active features (parallel)
  const [progress, setProgress] = useState({ done: 0, total: 0, perFeature: {} });
  const [generationLog, setGenerationLog] = useState([]);
  const [qualityScores, setQualityScores] = useState({});
  const [delivTimings, setDelivTimings] = useState({});  // { featureId: { startedAt, endedAt, durationMs } }
  // freshLessons: tracks which lesson indices were just AI-regenerated (for green highlight)
  // Shape: { [featureId]: Set<number> }
  const [freshLessons, setFreshLessons] = useState({});
  // Ref-tracked timers so we can cancel them on unmount (avoids setState-on-unmounted-component)
  // Map<"featureId:lessonIdx", timeoutId>
  const freshTimersRef = useRef(new Map());
  // Per-feature/chunk abort controllers: Map<"featureId" | "featureId:chunkN", AbortController>
  const abortMapRef = useRef(new Map());
  const startedRef = useRef(false);
  // Track the active sync generation ID so stale results can be discarded
  const activeSyncGenRef = useRef(0);

  const deliverableConfigRef = useRef(deliverableConfig);
  deliverableConfigRef.current = deliverableConfig;
  const pedagogicalModeRef = useRef(pedagogicalMode || 'lecture');
  pedagogicalModeRef.current = pedagogicalMode || 'lecture';
  const examChangesRef = useRef(examChanges || null);
  examChangesRef.current = examChanges || null;
  const columnsRef = useRef(columns || null);
  columnsRef.current = columns || null;
  // Normalize lockedLessons to a Set so .has() always works
  const lockedLessonsRef = useRef(null);
  lockedLessonsRef.current = lockedLessons
    ? (lockedLessons instanceof Set ? lockedLessons : new Set(lockedLessons))
    : null;

  const { streamProvider, parsePartialJSON } = useStreamReader();

  const appendLog = useCallback((message, type = 'info') => {
    setGenerationLog(prev => [...prev, { message, type, at: Date.now() }]);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // generateAll — Parallel Chunked Generation
  // ═══════════════════════════════════════════════════════════════════════════

  const generateAll = useCallback(async (courseMap, features, scopeIndices = null, syncGenId = null) => {
    const toGenerate = features.filter(f => f && f !== 'courseMap');
    if (toGenerate.length === 0 || !courseMap) return;

    startedRef.current = true;
    if (syncGenId !== null) activeSyncGenRef.current = syncGenId;
    setIsGenerating(true);
    setGenerationLog([]);
    setDelivTimings({});
    const generationStartTime = Date.now();

    const lessonCount = (courseMap.lessons || []).length;
    const lessonIndices = scopeIndices ?? Array.from({ length: lessonCount }, (_, i) => i);

    // ── 1. Create chunk plan ──
    const tasks = createChunkPlan(toGenerate, lessonCount, scopeIndices);

    // ── 2. Initialize per-feature progress ──
    const perFeatureInit = {};
    for (const fid of toGenerate) {
      const featureTasks = tasks.filter(t => t.featureId === fid);
      perFeatureInit[fid] = { chunksTotal: featureTasks.length, chunksDone: 0, status: 'pending' };
    }
    setProgress({ done: 0, total: toGenerate.length, perFeature: perFeatureInit });

    // Mark all features as streaming
    for (const fid of toGenerate) {
      dispatch(actions.setDeliverableStreaming(fid));
    }

    const scopeDesc = scopeIndices
      ? `${scopeIndices.length} lesson${scopeIndices.length !== 1 ? 's' : ''}`
      : `all ${lessonCount} lesson${lessonCount !== 1 ? 's' : ''}`;

    appendLog(`Starting parallel generation of ${toGenerate.length} deliverable${toGenerate.length !== 1 ? 's' : ''} (${tasks.length} tasks) for ${scopeDesc}`, 'start');

    // ── 3. Chunk result accumulators ──
    const chunkResults = {};  // { [featureId]: Map<chunkIndex, parsedData> }
    for (const fid of toGenerate) {
      chunkResults[fid] = new Map();
    }

    // ── 4. Run chunks sequentially within each feature, all features in parallel ──
    // This eliminates live-preview "flashing": each feature streams one chunk at a
    // time, so the preview shows stable L1→L2→L3→… typing in order.
    const featureStartTimes = {};

    const runChunk = async ({ featureId, chunkIndex, chunkScope, isWholeCourse }) => {
      const label = getFeatureLabel(featureId);
      const chunkLabel = isWholeCourse ? label : `${label} [${chunkScope[0] + 1}-${chunkScope[chunkScope.length - 1] + 1}]`;
      const taskStartTime = Date.now();

      // Track feature start time (first chunk to start)
      if (!featureStartTimes[featureId]) {
        featureStartTimes[featureId] = taskStartTime;
        setDelivTimings(prev => ({
          ...prev,
          [featureId]: { startedAt: taskStartTime, endedAt: null, durationMs: null },
        }));
      }

      // Add to active features set
      setCurrentFeatures(prev => new Set([...prev, featureId]));

      // Update per-feature status to generating
      setProgress(prev => ({
        ...prev,
        perFeature: {
          ...prev.perFeature,
          [featureId]: { ...prev.perFeature[featureId], status: 'generating' },
        },
      }));

      const totalChunksForFeature = tasks.filter(t => t.featureId === featureId).length;
      if (isWholeCourse || totalChunksForFeature === 1) {
        appendLog(`Generating ${label}…`, 'start');
      } else {
        appendLog(`Generating ${label} — lessons ${chunkScope[0] + 1}–${chunkScope[chunkScope.length - 1] + 1} (chunk ${chunkIndex + 1}/${totalChunksForFeature})`, 'start');
      }

      // Build prompt — for chunks after the first, inject style exemplar from chunk 0
      // Uses first + last items from the previous chunk to provide a quality gradient
      const config = deliverableConfigRef.current?.[featureId] || {};
      let styleExemplar = null;
      if (chunkIndex > 0 && chunkResults[featureId]?.has(0)) {
        const firstChunk = chunkResults[featureId].get(0);
        const arrKey = getArrayKey(featureId, firstChunk);
        const chunkArr = arrKey ? (firstChunk[arrKey] || []) : [];
        const firstItem = chunkArr[0] || null;
        const lastItem = chunkArr.length > 1 ? chunkArr[chunkArr.length - 1] : null;
        if (firstItem) {
          const parts = [JSON.stringify(firstItem, null, 2)];
          if (lastItem) parts.push(JSON.stringify(lastItem, null, 2));
          styleExemplar = parts.join('\n---\n').slice(0, 3000);
        }
      }
      const prompts = getDeliverablePrompt(
        featureId, courseMap, chunkScope, config,
        pedagogicalModeRef.current, examChangesRef.current, null,
        columnsRef.current, deliverableConfigRef.current,
        styleExemplar,
      );
      if (!prompts) {
        appendLog(`✗ ${chunkLabel}: No prompt template available`, 'error');
        return;
      }

      // Create abort controller
      const abortKey = isWholeCourse ? featureId : `${featureId}:chunk${chunkIndex}`;
      const controller = new AbortController();
      abortMapRef.current.set(abortKey, controller);

      let tokenCount = 0;

      try {
        let fullText = '';
        let lastParseTime = 0;

        const result = await streamProvider(
          provider, apiKey, modelId,
          prompts.systemPrompt, prompts.userPrompt,
          {
            maxOutputTokens,
            onChunk: (accumulatedText) => {
              fullText = accumulatedText;
              tokenCount = Math.round(accumulatedText.length / 4);

              // Throttled streaming preview
              const now = Date.now();
              if (now - lastParseTime > 200) {
                lastParseTime = now;
                const partial = parsePartialJSON(fullText);
                if (partial) {
                  // Merge completed chunks + this partial for live preview
                  const tempMap = new Map(chunkResults[featureId]);
                  tempMap.set(chunkIndex, partial);
                  const merged = mergeChunkResults(featureId, tempMap);
                  if (merged) {
                    dispatch({ type: 'SET_DELIVERABLE', featureId, status: 'streaming', data: merged, error: null, stale: false });
                  }
                }
              }
            },
            maxRetries: 2,
            signal: controller.signal,
            onRetry: (attempt) => {
              appendLog(`⚠ ${chunkLabel}: Connection interrupted — retrying (${attempt}/2)...`, 'warn');
            },
          }
        );

        // Parse final result
        const text = result?.fullText || fullText;
        const parsed = parsePartialJSON(text);

        if (parsed) {
          // Discard if superseded by newer sync cycle
          if (syncGenId !== null && syncGenId !== activeSyncGenRef.current) {
            appendLog(`⚠ ${chunkLabel}: discarded (superseded)`, 'warn');
            return;
          }

          // Store chunk result
          chunkResults[featureId].set(chunkIndex, parsed);
          const _k = getArrayKey(featureId, parsed);
          const _items = _k ? (parsed[_k] || []) : [];
          console.log(`[CM] ✓ ${chunkLabel}: parsed ${_items.length} items`, _items.map(it => ({ title: it?.lessonTitle || it?.title || '?', items: it?.questions?.length || it?.slides?.length || '–' })));

          // For whole-course features, dispatch done immediately
          if (isWholeCourse) {
            const finalData = patchScopeNumbering(parsed, featureId, chunkScope, courseMap);
            dispatch(actions.setDeliverableDone(featureId, finalData));
            try {
              const quality = scoreHeuristic(featureId, finalData);
              setQualityScores(prev => ({ ...prev, [featureId]: quality }));
            } catch { /* ignore */ }
          } else {
            // Dispatch merged streaming preview
            const merged = mergeChunkResults(featureId, chunkResults[featureId]);
            if (merged) {
              dispatch({ type: 'SET_DELIVERABLE', featureId, status: 'streaming', data: merged, error: null, stale: false });
            }
          }

          const k = getArrayKey(featureId, parsed);
          const itemCount = k ? (parsed[k]?.length || 0) : 0;
          const durStr = formatDuration(Date.now() - taskStartTime);
          const tokenDesc = tokenCount > 0 ? `, ~${formatTokens(tokenCount)} tokens` : '';
          appendLog(`✓ ${chunkLabel} — ${itemCount} item${itemCount !== 1 ? 's' : ''}${tokenDesc} (${durStr})`, 'done');
        } else {
          appendLog(`⚠ ${chunkLabel}: AI response could not be parsed (lessons ${chunkScope ? chunkScope.map(i => i + 1).join(', ') : '?'})`, 'warn');
          console.warn(`[CM] ✗ ${chunkLabel}: PARSE FAILED. Response length: ${text?.length || 0} chars. First 500 chars:`, text?.slice(0, 500));
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          appendLog(`${chunkLabel}: stopped`, 'warn');
        } else {
          appendLog(`✗ ${chunkLabel}: ${err.message || 'Generation failed'}`, 'error');
        }
      } finally {
        abortMapRef.current.delete(abortKey);
      }

      // Update per-feature chunk progress
      setProgress(prev => {
        const pf = prev.perFeature[featureId];
        if (!pf) return prev;
        const newChunksDone = pf.chunksDone + 1;
        const allChunksDone = newChunksDone >= pf.chunksTotal;
        return {
          ...prev,
          done: allChunksDone ? prev.done + 1 : prev.done,
          perFeature: {
            ...prev.perFeature,
            [featureId]: {
              ...pf,
              chunksDone: newChunksDone,
              status: allChunksDone ? 'merging' : 'generating',
            },
          },
        };
      });
    };

    const tasksByFeature = {};
    for (const task of tasks) {
      (tasksByFeature[task.featureId] ||= []).push(task);
    }

    const featurePromises = Object.values(tasksByFeature).map(async (featureTasks) => {
      for (const task of featureTasks) {
        await runChunk(task);
      }
    });

    // ── 5. Wait for all feature chains ──
    await Promise.allSettled(featurePromises);

    // ── 6. Post-generation: merge, verify, retry ──
    for (const fid of toGenerate) {
      const chunks = chunkResults[fid];
      const featureTasks = tasks.filter(t => t.featureId === fid);

      // Whole-course features were already dispatched as done
      if (featureTasks.length === 1 && featureTasks[0].isWholeCourse) {
        const delivEndTime = Date.now();
        setDelivTimings(prev => ({
          ...prev,
          [fid]: {
            startedAt: featureStartTimes[fid] || delivEndTime,
            endedAt: delivEndTime,
            durationMs: delivEndTime - (featureStartTimes[fid] || delivEndTime),
          },
        }));
        setProgress(prev => ({
          ...prev,
          perFeature: {
            ...prev.perFeature,
            [fid]: { ...prev.perFeature[fid], status: 'done' },
          },
        }));
        continue;
      }

      if (chunks.size === 0) {
        // No chunks completed — set error
        dispatch(actions.setDeliverableError(fid, 'All chunks failed'));
        setProgress(prev => ({
          ...prev,
          perFeature: {
            ...prev.perFeature,
            [fid]: { ...prev.perFeature[fid], status: 'error' },
          },
        }));
        continue;
      }

      // Merge chunks
      console.log(`[CM] ── MERGE ${fid} ──`, { chunkCount: chunks.size, chunkKeys: [...chunks.keys()] });
      let merged = mergeChunkResults(fid, chunks);
      if (!merged) {
        dispatch(actions.setDeliverableError(fid, 'Failed to merge chunks'));
        continue;
      }

      // Completeness check + retry
      const expectedCount = lessonIndices.length;
      const arrayKey = getArrayKey(fid, merged);
      let mergedArr = arrayKey ? (merged[arrayKey] || []) : [];
      console.log(`[CM] ${fid}: merged ${mergedArr.length}/${expectedCount} items (key: ${arrayKey})`, mergedArr.map(it => ({ title: it?.lessonTitle || it?.title || '?', questions: it?.questions?.length, slides: it?.slides?.length })));

      // ── Post-merge cleanup: prune near-empty items (parsing artifacts) ──
      // Items with < 30 words of JSON content are artifacts of failed chunk parsing
      if (mergedArr.length > 0) {
        const MIN_ITEM_WORDS = 30;
        const emptyBefore = mergedArr.length;
        mergedArr = mergedArr.filter(item => {
          const content = JSON.stringify(item || {});
          const wordCount = content.split(/\s+/).length;
          return wordCount >= MIN_ITEM_WORDS;
        });
        if (mergedArr.length < emptyBefore) {
          const label = getFeatureLabel(fid);
          console.warn(`[CM] ${fid}: PRUNED ${emptyBefore - mergedArr.length} near-empty items (< ${MIN_ITEM_WORDS} words)`);
          appendLog(`⚠ ${label}: pruned ${emptyBefore - mergedArr.length} near-empty item(s)`, 'warn');
          merged = { ...merged, [arrayKey]: mergedArr };
        }
      }

      // ── Post-merge cleanup: detect oversized quiz items ──
      // When the model merges multiple lessons into one entry (e.g., 36 questions
      // in a single lesson), remove it so the retry loop regenerates correctly.
      // Uses a hard cap because dynamic thresholds still allow retries to produce
      // the same oversized result.
      if (fid === 'quizBank' && mergedArr.length > 0) {
        const HARD_CAP_QUESTIONS = 10;
        const oversizedIndices = [];
        mergedArr = mergedArr.filter((quiz, i) => {
          const qc = quiz?.questions?.length || 0;
          if (qc > HARD_CAP_QUESTIONS) {
            oversizedIndices.push(lessonIndices[i] ?? i);
            return false;
          }
          return true;
        });
        if (oversizedIndices.length > 0) {
          const label = getFeatureLabel(fid);
          console.warn(`[CM] ${fid}: OVERSIZED quiz items removed:`, oversizedIndices, `(>${HARD_CAP_QUESTIONS} questions)`);
          appendLog(`⚠ ${label}: removed ${oversizedIndices.length} oversized item(s) (>${HARD_CAP_QUESTIONS} questions) — will retry individually`, 'warn');
          merged = { ...merged, [arrayKey]: mergedArr };
        }

        // Enforce consistent question count per lesson: trim to median
        const qCounts = mergedArr.map(q => q?.questions?.length || 0).filter(c => c > 0);
        if (qCounts.length > 0) {
          const sorted = [...qCounts].sort((a, b) => a - b);
          const targetQ = sorted[Math.floor(sorted.length / 2)]; // median
          let trimmed = 0;
          mergedArr = mergedArr.map(quiz => {
            if (quiz?.questions && quiz.questions.length > targetQ) {
              trimmed++;
              return { ...quiz, questions: quiz.questions.slice(0, targetQ) };
            }
            return quiz;
          });
          if (trimmed > 0) {
            console.log(`[CM] quizBank: trimmed ${trimmed} lesson(s) to ${targetQ} questions each for consistency`);
            merged = { ...merged, [arrayKey]: mergedArr };
          }
        }

        // Quiz validation: enforce explanations and distractor rationale
        let missingExplanations = 0;
        let missingDistractors = 0;
        mergedArr = mergedArr.map(quiz => {
          if (!quiz?.questions) return quiz;
          const questions = quiz.questions.map(q => {
            const isMC = q.type === 'multiple_choice';
            let patched = { ...q };

            if (!patched.explanation || patched.explanation.trim() === '') {
              missingExplanations++;
              patched.explanation = isMC
                ? `The correct answer is ${patched.answer || '?'} because... [Explanation needed - review this question]`
                : `[Explanation needed - model response required]`;
            }

            if (isMC && (!patched.distractorRationale || patched.distractorRationale.trim() === '')) {
              missingDistractors++;
              patched.distractorRationale = `[Distractor rationale needed to explain why incorrect options are plausible]`;
            }

            return patched;
          });
          return { ...quiz, questions };
        });

        if (missingExplanations > 0 || missingDistractors > 0) {
          const label = getFeatureLabel(fid);
          console.warn(`[CM] ${fid}: patched ${missingExplanations} missing explanations and ${missingDistractors} missing distractor rationales`);
          appendLog(`⚠ ${label}: patched ${missingExplanations} missing explanations and ${missingDistractors} missing distractors to meet quality standard`, 'warn');
          merged = { ...merged, [arrayKey]: mergedArr };
        }
      }

      // Per-lesson completeness: for slide decks, detect truncated lessons using dynamic threshold
      if (fid === 'slideDecks' && mergedArr.length > 0) {
        // Dynamic threshold: 50% of median slide count (min 6) to catch partial generations
        const slideCounts = mergedArr
          .map(d => d?.slides?.length || 0)
          .filter(c => c > 0)
          .sort((a, b) => a - b);
        const median = slideCounts.length > 0
          ? slideCounts[Math.floor(slideCounts.length / 2)]
          : 10;
        const truncThreshold = Math.max(6, Math.floor(median * 0.5));

        const truncatedIndices = [];
        mergedArr.forEach((deck, i) => {
          const slideCount = deck?.slides?.length || 0;
          if (slideCount > 0 && slideCount < truncThreshold) {
            truncatedIndices.push(lessonIndices[i]);
          }
        });
        if (truncatedIndices.length > 0) {
          const label = getFeatureLabel(fid);
          appendLog(`⚠ ${label}: ${truncatedIndices.length} lesson(s) appear truncated (< ${truncThreshold} slides, median ${median}) — retrying`, 'warn');
          mergedArr = mergedArr.filter((deck) => {
            const slideCount = deck?.slides?.length || 0;
            return slideCount === 0 || slideCount >= truncThreshold;
          });
          merged = { ...merged, [arrayKey]: mergedArr };
        }
      }

      // Per-lesson completeness: for slide decks, detect OVERSIZED lessons (merged content)
      if (fid === 'slideDecks' && mergedArr.length > 0) {
        const HARD_CAP_SLIDES = 25;
        const oversizedSlideIndices = [];
        mergedArr = mergedArr.filter((deck, i) => {
          const sc = deck?.slides?.length || 0;
          if (sc > HARD_CAP_SLIDES) {
            oversizedSlideIndices.push(lessonIndices[i] ?? i);
            return false;
          }
          return true;
        });
        if (oversizedSlideIndices.length > 0) {
          const label = getFeatureLabel(fid);
          console.warn(`[CM] ${fid}: OVERSIZED slide decks removed:`, oversizedSlideIndices, `(>${HARD_CAP_SLIDES} slides)`);
          appendLog(`⚠ ${label}: removed ${oversizedSlideIndices.length} oversized deck(s) (>${HARD_CAP_SLIDES} slides) — will retry individually`, 'warn');
          merged = { ...merged, [arrayKey]: mergedArr };
        }
      }

      // Per-lesson completeness: for quiz bank, detect lessons with fewer than 5 questions
      if (fid === 'quizBank' && mergedArr.length > 0) {
        const minQuestions = 5;
        const truncatedQuizIndices = [];
        mergedArr.forEach((quiz, i) => {
          const qCount = quiz?.questions?.length || 0;
          if (qCount > 0 && qCount < minQuestions) {
            truncatedQuizIndices.push(lessonIndices[i]);
          }
        });
        if (truncatedQuizIndices.length > 0) {
          const label = getFeatureLabel(fid);
          appendLog(`⚠ ${label}: ${truncatedQuizIndices.length} lesson(s) have < ${minQuestions} questions — retrying`, 'warn');
          // Remove truncated lessons so the retry loop below will re-generate them
          mergedArr = mergedArr.filter((quiz) => {
            const qCount = quiz?.questions?.length || 0;
            return qCount === 0 || qCount >= minQuestions;
          });
          merged = { ...merged, [arrayKey]: mergedArr };
        }
      }

      // Post-merge grade normalization: ensure assignment percentOfGrade sums to 100%
      if (fid === 'assignments' && mergedArr.length > 0) {
        let gradeTotal = 0;
        const grades = mergedArr.map(a => {
          const pct = parseFloat(String(a?.percentOfGrade || '0').replace('%', ''));
          gradeTotal += pct;
          return pct;
        });
        if (gradeTotal > 0 && Math.abs(gradeTotal - 100) > 2) {
          const label = getFeatureLabel(fid);
          appendLog(`⚠ ${label}: grade weights sum to ${Math.round(gradeTotal)}% — normalizing to 100%`, 'warn');
          mergedArr.forEach((a, i) => {
            const normalized = Math.round((grades[i] / gradeTotal) * 100);
            a.percentOfGrade = `${normalized}%`;
          });
          merged = { ...merged, [arrayKey]: mergedArr };
        }
      }

      // Rubrics/assignments generate per-assessment, not per-lesson — use relaxed threshold
      const isPerAssessment = fid === 'rubrics' || fid === 'assignments';
      const adjustedExpected = isPerAssessment ? Math.ceil(expectedCount * 0.6) : expectedCount;

      if (mergedArr.length < adjustedExpected) {
        const label = getFeatureLabel(fid);
        let retryRound = 0;
        while (mergedArr.length < adjustedExpected && retryRound < MAX_RETRY_ROUNDS) {
          retryRound++;
          const missing = findMissingIndices(mergedArr, lessonIndices);
          console.warn(`[CM] ${fid}: RETRY round ${retryRound} — have ${mergedArr.length}/${adjustedExpected} (expected ${expectedCount}). Missing indices:`, missing);
          appendLog(`⚠ ${label}: ${mergedArr.length}/${expectedCount} items — retrying ${missing.length} missing (round ${retryRound})`, 'warn');

          // Create retry tasks — use smaller chunks to reduce token pressure on retries
          // Quiz bank, slide decks, rubrics use individual lessons (size 1) to prevent merging
          const useIndividualRetry = fid === 'quizBank' || fid === 'slideDecks' || fid === 'rubrics';
          const retryChunkSize = useIndividualRetry ? 1 : Math.max(2, Math.floor(CHUNK_SIZE / 2));
          const retryChunks = chunkArray(missing, retryChunkSize);
          const retryLimit = pLimit(MAX_CONCURRENT);
          const retryPromises = retryChunks.map((retryScope, idx) => retryLimit(async () => {
            const retryChunkIndex = chunks.size + idx + (retryRound - 1) * 100; // unique index
            const retryLabel = `${label} retry [${retryScope[0] + 1}-${retryScope[retryScope.length - 1] + 1}]`;
            appendLog(`Retrying ${retryLabel}...`, 'progress');

            const config = deliverableConfigRef.current?.[fid] || {};
            const prompts = getDeliverablePrompt(
              fid, courseMap, retryScope, config,
              pedagogicalModeRef.current, examChangesRef.current, null,
              columnsRef.current, deliverableConfigRef.current,
            );
            if (!prompts) return;

            const _sysLen = prompts.systemPrompt?.length || 0;
            const _usrLen = prompts.userPrompt?.length || 0;
            console.log(`[CM] ${retryLabel}: prompt sizes — system: ${_sysLen} chars (~${Math.round(_sysLen / 4)} tokens), user: ${_usrLen} chars (~${Math.round(_usrLen / 4)} tokens), total: ~${Math.round((_sysLen + _usrLen) / 4)} tokens`);

            const controller = new AbortController();
            const retryAbortKey = `${fid}:retry${retryChunkIndex}`;
            abortMapRef.current.set(retryAbortKey, controller);

            try {
              let fullText = '';
              const result = await streamProvider(
                provider, apiKey, modelId,
                prompts.systemPrompt, prompts.userPrompt,
                { maxOutputTokens, onChunk: (t) => { fullText = t; }, maxRetries: 3, signal: controller.signal }
              );
              const text = result?.fullText || fullText;
              const parsed = parsePartialJSON(text);
              if (parsed) {
                chunkResults[fid].set(retryChunkIndex, parsed);
                const _rk = getArrayKey(fid, parsed);
                const _ritems = _rk ? (parsed[_rk] || []) : [];
                console.log(`[CM] ✓ ${retryLabel}: parsed ${_ritems.length} items`, _ritems.map(it => ({ title: it?.lessonTitle || it?.title || '?', questions: it?.questions?.length, slides: it?.slides?.length })));
                appendLog(`✓ ${retryLabel} complete`, 'done');
              } else {
                console.warn(`[CM] ✗ ${retryLabel}: RETRY PARSE FAILED. Response length: ${text?.length || 0}. First 500 chars:`, text?.slice(0, 500));
                appendLog(`⚠ ${retryLabel}: parse failed`, 'warn');
              }
            } catch (err) {
              if (err.name !== 'AbortError') {
                console.error(`[CM] ✗ ${retryLabel}: ${err.message}`);
                appendLog(`✗ ${retryLabel}: ${err.message}`, 'error');
              }
            } finally {
              abortMapRef.current.delete(retryAbortKey);
            }
          }));

          await Promise.allSettled(retryPromises);

          // Re-merge with retry results
          merged = mergeChunkResults(fid, chunkResults[fid]);
          mergedArr = merged && arrayKey ? (merged[arrayKey] || []) : [];
        }
      }

      // ── Coverage-based retry: retry specific missing lessons even if count is met ──
      // e.g., rubrics may have 14 items (above adjustedExpected=9) but lesson 7 is
      // missing because GPT merged lessons in one chunk. Detect and retry missing ones.
      // NOTE: rubrics/assignments are per-assessment (not per-lesson), so their items
      // may not have lesson numbers at all — the coveredLessons check below handles this
      // gracefully (size===0 → per-assessment warning, not a retry loop).
      const extractLessonNum = (item) => {
        const title = item?.lessonTitle || item?.title || item?.lesson || '';
        const m = title.match(/(?:Lesson|Week)\s*(\d+)/i);
        if (m) return parseInt(m[1], 10);
        // For per-assessment items (assignments/rubrics), check relatedLessons/lessonNumber
        const related = item?.relatedLessons || item?.relatedLesson || '';
        const relM = String(related).match(/(\d+)/g);
        if (relM && relM.length > 0) return parseInt(relM[0], 10);
        if (item?.lessonNumber) return parseInt(item.lessonNumber, 10);
        if (item?.week) return parseInt(item.week, 10);
        return null;
      };

      // Coverage retry is allowed for all deliverables, including rubrics/assignments.
      // For per-assessment deliverables, it only fires when specific lesson numbers ARE
      // present in the output (coveredSet.size > 0) and some are missing.
      if (mergedArr.length > 0 && expectedCount > 1) {
        const coveredSet = new Set();
        mergedArr.forEach(item => {
          // Check multiple fields for lesson number
          const num = extractLessonNum(item);
          if (num !== null) coveredSet.add(num);
          // Catch additional related lessons for assignments that span multiple weeks
          const related = item?.relatedLessons || item?.relatedLesson || '';
          const relM = String(related).match(/(\d+)/g);
          if (relM) relM.forEach(n => coveredSet.add(parseInt(n, 10)));
        });
        const missingLessons = Array.from({ length: expectedCount }, (_, i) => i + 1)
          .filter(n => !coveredSet.has(n));

        if (coveredSet.size > 0 && missingLessons.length > 0 && missingLessons.length <= 8) {
          const label = getFeatureLabel(fid);
          console.warn(`[CM] ${fid}: coverage retry — ${missingLessons.length} lesson(s) missing: ${missingLessons.join(', ')}`);
          appendLog(`⚠ ${label}: retrying missing lesson(s): ${missingLessons.join(', ')}`, 'warn');

          const missingIndices = missingLessons.map(n => n - 1); // 0-based
          const retryLimit = pLimit(MAX_CONCURRENT);
          const retryPromises = missingIndices.map((idx) => retryLimit(async () => {
            const retryChunkIndex = chunks.size + 500 + idx;
            const retryLabel = `${label} coverage-retry [${idx + 1}]`;
            appendLog(`Retrying ${retryLabel}...`, 'progress');

            const config = deliverableConfigRef.current?.[fid] || {};
            // For rubric coverage retries, inject the expected lesson title as an edit
            // context hint so GPT knows which specific assessment to target (not a generic
            // re-run that might produce a different assessment for the same lesson block).
            let retryEditContext = null;
            if (fid === 'rubrics' || fid === 'assignments') {
              const lesson = courseMap?.lessons?.[idx];
              if (lesson?.title) {
                retryEditContext = `Regenerate the rubric/assignment for the assessment associated with: "${lesson.title}". Do not change other assessments.`;
              }
            }
            const prompts = getDeliverablePrompt(
              fid, courseMap, [idx], config,
              pedagogicalModeRef.current, examChangesRef.current, retryEditContext,
              columnsRef.current, deliverableConfigRef.current,
            );
            if (!prompts) return;

            const controller = new AbortController();
            const retryAbortKey = `${fid}:covretry${idx}`;
            abortMapRef.current.set(retryAbortKey, controller);

            try {
              let fullText = '';
              const result = await streamProvider(
                provider, apiKey, modelId,
                prompts.systemPrompt, prompts.userPrompt,
                { maxOutputTokens, onChunk: (t) => { fullText = t; }, maxRetries: 3, signal: controller.signal }
              );
              const text = result?.fullText || fullText;
              const parsed = parsePartialJSON(text);
              if (parsed) {
                chunkResults[fid].set(retryChunkIndex, parsed);
                const _rk = getArrayKey(fid, parsed);
                const _ritems = _rk ? (parsed[_rk] || []) : [];
                console.log(`[CM] ✓ ${retryLabel}: parsed ${_ritems.length} items`);
                appendLog(`✓ ${retryLabel} complete`, 'done');
              } else {
                console.warn(`[CM] ✗ ${retryLabel}: parse failed`);
              }
            } catch (err) {
              if (err.name !== 'AbortError') {
                console.error(`[CM] ✗ ${retryLabel}: ${err.message}`);
                // Bubble up API exhaustion/rate limit errors so the UI can show them
                if (err.message.toLowerCase().includes('429') || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('budget')) {
                  // throw to be caught by the outer loop
                  throw err;
                }
              }
            } finally {
              abortMapRef.current.delete(retryAbortKey);
            }
          }));

          const results = await Promise.allSettled(retryPromises);

          let retryError = null;
          for (const result of results) {
            if (result.status === 'rejected' && result.reason) {
              retryError = result.reason;
              break;
            }
          }

          if (retryError) {
            console.error(`[CM] ${fid} coverage retry aborted due to API error:`, retryError.message);
            dispatch(actions.setDeliverableError(fid, 'API budget exhausted or rate limit hit during retry.'));
            setProgress(prev => ({
              ...prev,
              perFeature: {
                ...prev.perFeature,
                [fid]: { ...prev.perFeature[fid], status: 'error' },
              },
            }));
            // Stop processing this feature so we don't mark it as done
            return;
          }

          merged = mergeChunkResults(fid, chunkResults[fid]);
          mergedArr = merged && arrayKey ? (merged[arrayKey] || []) : [];
        }
      }

      // ── Post-retry: sort items by lesson number ──
      if (mergedArr.length > 1) {
        const wasSorted = mergedArr.every((item, i) =>
          i === 0 || (extractLessonNum(mergedArr[i - 1]) || 0) <= (extractLessonNum(item) || 0)
        );
        if (!wasSorted) {
          mergedArr.sort((a, b) => (extractLessonNum(a) || 9999) - (extractLessonNum(b) || 9999));
          if (arrayKey && merged) {
            merged = { ...merged, [arrayKey]: mergedArr };
          }
          console.log(`[CM] ${fid}: sorted items by lesson number`);
        }
      }

      // ── Coverage validation: log which lessons are present/missing ──
      if (mergedArr.length > 0 && expectedCount > 1) {
        const coveredLessons = new Set();
        mergedArr.forEach(item => {
          // Check multiple fields for lesson number
          const num = extractLessonNum(item);
          if (num !== null) { coveredLessons.add(num); return; }
          // For per-assessment items (assignments), check relatedLessons/lessonNumber
          const related = item?.relatedLessons || item?.relatedLesson || '';
          const relM = String(related).match(/(\d+)/g);
          if (relM) relM.forEach(n => coveredLessons.add(parseInt(n, 10)));
          if (item?.lessonNumber) coveredLessons.add(parseInt(item.lessonNumber, 10));
          if (item?.week) coveredLessons.add(parseInt(item.week, 10));
        });
        const allExpected = Array.from({ length: expectedCount }, (_, i) => i + 1);
        const missing = allExpected.filter(n => !coveredLessons.has(n));
        if (coveredLessons.size === 0 && isPerAssessment) {
          // Per-assessment items don't use lesson numbers in titles — this is correct.
          // Log without a MISSING warning to avoid false-alarm console noise.
          console.log(`[CM] ${fid}: ${mergedArr.length} item${mergedArr.length !== 1 ? 's' : ''} (per-assessment — lesson coverage N/A, not linked by lesson number)`);
        } else if (missing.length > 0) {
          console.warn(`[CM] ${fid}: MISSING lessons in output: ${missing.join(', ')} (have ${coveredLessons.size}/${expectedCount})`);
          appendLog(`⚠ ${getFeatureLabel(fid)}: lessons ${missing.join(', ')} not found in output`, 'warn');
        } else {
          console.log(`[CM] ${fid}: all ${coveredLessons.size} lessons covered ✓`);
        }
      }

      // Apply scope numbering.
      // Skip rubrics and assignments — they are per-assessment (not 1 item per lesson),
      // so the index-based mapping in patchScopeNumbering would corrupt lessonTitle fields.
      const finalData = (fid === 'rubrics' || fid === 'assignments')
        ? merged
        : patchScopeNumbering(merged, fid, scopeIndices, courseMap);
      const delivEndTime = Date.now();

      // Feature-level completion summary for multi-chunk features
      const featureTotalChunks = tasks.filter(t => t.featureId === fid).length;
      if (featureTotalChunks > 1) {
        const totalItems = mergedArr.length;
        const featureDur = formatDuration(delivEndTime - (featureStartTimes[fid] || delivEndTime));
        console.log(`[CM] ✓✓ ${fid} COMPLETE: ${totalItems} items in ${featureDur}`, mergedArr.map(it => it?.lessonTitle || it?.title || '?'));
        appendLog(`✓ ${getFeatureLabel(fid)} complete — ${totalItems} item${totalItems !== 1 ? 's' : ''} total (${featureDur})`, 'done');
      }

      // Dispatch final result
      dispatch(actions.setDeliverableDone(fid, finalData));

      // Quality scoring + quality gate
      try {
        const quality = scoreHeuristic(fid, finalData);
        setQualityScores(prev => ({ ...prev, [fid]: quality }));
        const avg = computeAvgScore(quality);
        console.log(`[CM] ${fid} quality: ${avg}/10`, quality);
        if (avg !== null && avg < 6) {
          appendLog(`⚠ ${getFeatureLabel(fid)}: quality score ${avg}/10 — consider regenerating for better results`, 'warn');
        }
      } catch { /* ignore */ }

      // Update timing
      setDelivTimings(prev => ({
        ...prev,
        [fid]: {
          startedAt: featureStartTimes[fid] || delivEndTime,
          endedAt: delivEndTime,
          durationMs: delivEndTime - (featureStartTimes[fid] || delivEndTime),
        },
      }));

      // Mark feature as done in progress
      setProgress(prev => ({
        ...prev,
        perFeature: {
          ...prev.perFeature,
          [fid]: { ...prev.perFeature[fid], status: 'done' },
        },
      }));
    }

    // ── 7. Finalize ──
    setIsGenerating(false);
    setCurrentFeatures(new Set());
    const totalDur = formatDuration(Date.now() - generationStartTime);
    appendLog(`All ${toGenerate.length} deliverable${toGenerate.length !== 1 ? 's' : ''} generated (${totalDur})`, 'done');
    notifyDone('All deliverables are ready!');
  }, [provider, modelId, apiKey, streamProvider, parsePartialJSON, appendLog, dispatch]);

  // ── Stop by featureId or stop all ──
  const stopGenerating = useCallback((featureId = null) => {
    if (featureId) {
      // Abort all entries for this feature (featureId, featureId:chunk0, etc.)
      for (const [key, ctrl] of abortMapRef.current) {
        if (key === featureId || key.startsWith(featureId + ':')) {
          ctrl.abort();
          abortMapRef.current.delete(key);
        }
      }
    } else {
      for (const [, ctrl] of abortMapRef.current) ctrl.abort();
      abortMapRef.current.clear();
    }
    setIsGenerating(false);
    setCurrentFeatures(new Set());
  }, []);

  const resetDeliverables = useCallback(() => {
    stopGenerating();
    dispatch(actions.resetDeliverables());
    setProgress({ done: 0, total: 0, perFeature: {} });
    setGenerationLog([]);
    startedRef.current = false;
  }, [stopGenerating, dispatch]);

  const restoreDeliverables = useCallback((savedDeliverables) => {
    stopGenerating();
    dispatch(actions.restoreDeliverables(savedDeliverables));
    // Compute progress from restored data
    const entries = Object.entries(savedDeliverables || {});
    const done = entries.filter(([, e]) => e?.status === 'done').length;
    setProgress({ done, total: done, perFeature: {} });
    setGenerationLog([]);
    startedRef.current = false;
  }, [stopGenerating, dispatch]);

  const markAllStale = useCallback(() => {
    dispatch(actions.markAllStale());
  }, [dispatch]);

  const markFeatureStale = useCallback((featureId, staleConfidence = null, staleEdits = null) => {
    dispatch(actions.markFeatureStale(featureId, staleConfidence, staleEdits));
  }, [dispatch]);

  // Optimistic update — instantly patch deliverable data (e.g. title rename)
  const optimisticUpdate = useCallback((featureId, patchedData) => {
    const existing = deliverables[featureId];
    if (!existing) return;
    dispatch({
      type: 'SET_DELIVERABLE', featureId,
      status: existing.status,
      data: patchedData,
      error: existing.error,
      stale: existing.stale,
      staleConfidence: existing.staleConfidence ?? null,
      regeneratingIndex: existing.regeneratingIndex ?? null,
    });
  }, [deliverables, dispatch]);

  const resyncAll = useCallback(async (courseMap, features, scopeIndices = null) => {
    const staleIds = features.filter(f =>
      f !== 'courseMap' && deliverables[f]?.stale
    );
    if (staleIds.length === 0 || !courseMap) return;
    await generateAll(courseMap, staleIds, scopeIndices);
  }, [deliverables, generateAll]);

  // ── Single-lesson regeneration (used by smart sync) ──
  // This function is UNCHANGED from the sequential version — it already handles
  // single-lesson scope via scopeIndices=[lessonIndex].
  const regenerateLesson = useCallback(async (featureId, courseMap, lessonIndex, syncGenId = null) => {
    if (!courseMap) return;
    if (lockedLessonsRef.current?.has(lessonIndex)) {
      appendLog(`⚠ Lesson ${lessonIndex + 1} is locked — skipping regeneration`, 'warn');
      return;
    }
    const label = getFeatureLabel(featureId);

    if (syncGenId !== null) activeSyncGenRef.current = syncGenId;

    // Signal that this feature is actively regenerating
    setCurrentFeatures(prev => new Set([...prev, featureId]));
    setIsGenerating(true);

    // Capture CURRENT data snapshot NOW (before any async work) to prevent snap-back
    const existingDataSnapshot = deliverables[featureId]?.data ?? null;
    const existingKey = getArrayKey(featureId, existingDataSnapshot);
    const existingArr = existingDataSnapshot?.[existingKey] || [];

    dispatch({ type: 'MARK_LESSON_REGENERATING', featureId, lessonIndex });

    appendLog(`Regenerating Lesson ${lessonIndex + 1} in ${label}...`, 'progress');

    const regenConfig = deliverableConfigRef.current?.[featureId] || {};
    const prompts = getDeliverablePrompt(featureId, courseMap, [lessonIndex], regenConfig, pedagogicalModeRef.current, examChangesRef.current, null, columnsRef.current, deliverableConfigRef.current);
    if (!prompts) {
      if (existingDataSnapshot) {
        dispatch({ type: 'SET_DELIVERABLE', featureId, status: 'done', data: existingDataSnapshot, error: null, stale: false, regeneratingIndex: null });
      }
      appendLog(`✗ ${label}: No prompt for lesson ${lessonIndex + 1}`, 'error');
      setCurrentFeatures(prev => { const s = new Set(prev); s.delete(featureId); return s; });
      if (abortMapRef.current.size === 0) setIsGenerating(false);
      return;
    }

    try {
      const controller = new AbortController();
      abortMapRef.current.set(featureId, controller);

      let fullText = '';
      let lastParseTime = 0;

      await streamProvider(
        provider, apiKey, modelId,
        prompts.systemPrompt, prompts.userPrompt,
        {
          maxOutputTokens,
          onChunk: (accumulatedText) => {
            fullText = accumulatedText;
            const now = Date.now();
            if (now - lastParseTime > 150) {
              lastParseTime = now;
              const partial = parsePartialJSON(fullText);
              if (partial && existingDataSnapshot && existingKey) {
                const partialKey = getArrayKey(featureId, partial);
                const partialArr = partialKey ? (partial[partialKey] || []) : [];
                const merged = [...existingArr];
                // First item always targets the requested lesson index.
                // Extra items (rare — AI may return neighbours) match by title.
                if (partialArr.length > 0 && lessonIndex < merged.length) {
                  merged[lessonIndex] = partialArr[0];
                }
                for (let i = 1; i < partialArr.length; i++) {
                  const itemTitle = partialArr[i]?.lessonTitle || partialArr[i]?.title || '';
                  const matchIdx = itemTitle ? merged.findIndex(m =>
                    m !== partialArr[0] && (m?.lessonTitle === itemTitle || m?.title === itemTitle)
                  ) : -1;
                  if (matchIdx >= 0) merged[matchIdx] = partialArr[i];
                }
                dispatch({
                  type: 'SET_DELIVERABLE', featureId, status: 'streaming',
                  data: { ...existingDataSnapshot, [existingKey]: merged },
                  error: null, stale: false, regeneratingIndex: lessonIndex,
                });
              }
            }
          },
          maxRetries: 2,
          signal: controller.signal,
        }
      );

      const parsed = parsePartialJSON(fullText);
      if (parsed) {
        if (syncGenId !== null && syncGenId !== activeSyncGenRef.current) {
          appendLog(`⚠ ${label}: Lesson ${lessonIndex + 1} result discarded (superseded)`, 'warn');
          if (existingDataSnapshot) {
            dispatch({ type: 'SET_DELIVERABLE', featureId, status: 'done', data: existingDataSnapshot, error: null, stale: false, regeneratingIndex: null });
          }
          return;
        }
        const finalParsed = patchScopeNumbering(parsed, featureId, [lessonIndex], courseMap);
        if (existingKey && existingDataSnapshot) {
          const newKey = getArrayKey(featureId, finalParsed);
          const newArr = (newKey ? finalParsed[newKey] : null) || [];
          const merged = [...existingArr];
          // First item always replaces the target lesson index.
          // Any extra items returned by the AI are matched by lessonTitle
          // to avoid overwriting the wrong lesson in the array.
          if (newArr.length > 0 && lessonIndex < merged.length) {
            merged[lessonIndex] = newArr[0];
          } else if (newArr.length > 0) {
            merged.push(newArr[0]);
          }
          for (let i = 1; i < newArr.length; i++) {
            const itemTitle = newArr[i]?.lessonTitle || newArr[i]?.title || '';
            const matchIdx = itemTitle ? merged.findIndex((m, idx) =>
              idx !== lessonIndex && (m?.lessonTitle === itemTitle || m?.title === itemTitle)
            ) : -1;
            if (matchIdx >= 0) merged[matchIdx] = newArr[i];
            // If no title match, don't blindly push — skip to prevent corruption
          }
          dispatch(actions.setDeliverableDone(featureId, { ...existingDataSnapshot, [existingKey]: merged }));
        } else {
          dispatch(actions.setDeliverableDone(featureId, finalParsed));
        }
        appendLog(`✓ Lesson ${lessonIndex + 1} in ${label} regenerated`, 'done');

        // Green highlight (3s)
        setFreshLessons(prev => ({
          ...prev,
          [featureId]: new Set([...(prev[featureId] || []), lessonIndex]),
        }));
        const freshKey = `${featureId}:${lessonIndex}`;
        if (freshTimersRef.current.has(freshKey)) {
          clearTimeout(freshTimersRef.current.get(freshKey));
        }
        const freshTimer = setTimeout(() => {
          setFreshLessons(prev => {
            const s = new Set(prev[featureId] || []);
            s.delete(lessonIndex);
            return { ...prev, [featureId]: s };
          });
          freshTimersRef.current.delete(freshKey);
        }, 3000);
        freshTimersRef.current.set(freshKey, freshTimer);
      } else {
        appendLog(`⚠ ${label}: Lesson ${lessonIndex + 1} regeneration response was incomplete`, 'warn');
        if (existingDataSnapshot) {
          dispatch({ type: 'SET_DELIVERABLE', featureId, status: 'done', data: existingDataSnapshot, error: null, stale: false, regeneratingIndex: null });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn(`Regenerate lesson ${lessonIndex} failed:`, err);
        appendLog(`✗ ${label}: Lesson ${lessonIndex + 1} regeneration failed — ${err.message || 'Unknown error'}`, 'error');
      }
      if (existingDataSnapshot) {
        dispatch({ type: 'SET_DELIVERABLE', featureId, status: 'done', data: existingDataSnapshot, error: null, stale: false, regeneratingIndex: null });
      }
    } finally {
      abortMapRef.current.delete(featureId);
      // Remove from active features
      setCurrentFeatures(prev => { const s = new Set(prev); s.delete(featureId); return s; });
      if (abortMapRef.current.size === 0) {
        setIsGenerating(false);
      }
    }
  }, [provider, modelId, apiKey, streamProvider, parsePartialJSON, appendLog, dispatch, deliverables]);

  // ── Surgical resync: handles non-per-lesson deliverables (syllabus, custom) ──
  const surgicalResync = useCallback(async (courseMap, features) => {
    if (!courseMap) return;
    const nonPerLesson = [];
    if (features.includes('syllabus') && deliverables['syllabus']?.stale) {
      nonPerLesson.push('syllabus');
    }
    for (const f of features) {
      if (f.startsWith('custom_') && deliverables[f]?.stale) {
        const data = deliverables[f]?.data;
        const arrayKey = getArrayKey(f, data);
        const arr = data?.[arrayKey];
        if (!Array.isArray(arr) || arr.length === 0) {
          nonPerLesson.push(f);
        }
      }
    }
    if (nonPerLesson.length > 0) {
      await generateAll(courseMap, nonPerLesson, null);
    }
  }, [deliverables, generateAll]);

  // ── Cleanup: cancel any pending freshLessons timers on unmount ──
  useEffect(() => {
    return () => {
      freshTimersRef.current.forEach(id => clearTimeout(id));
      freshTimersRef.current.clear();
    };
  }, []);

  // staleCount as a computed value from store
  const staleCount = Object.values(deliverables).filter(d => d?.stale).length;

  // setDeliverables shim for legacy call sites in App.jsx
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

  // Backward compat: expose currentFeature as first active feature (for consumers that need a single string)
  const currentFeature = currentFeatures.size > 0
    ? currentFeatures.values().next().value
    : null;

  return {
    deliverables,
    setDeliverables,
    isGenerating,
    currentFeature,       // backward compat: first active feature (string|null)
    currentFeatures,      // new: all active features (Set<string>)
    progress,
    generateAll,
    stopGenerating,
    resetDeliverables,
    restoreDeliverables,
    markAllStale,
    resyncAll,
    regenerateLesson,
    surgicalResync,
    markFeatureStale,
    optimisticUpdate,
    staleCount,
    started: startedRef.current,
    generationLog,
    qualityScores,
    delivTimings,
    freshLessons,
  };
}

// ── Helpers ──

function formatDuration(ms) {
  return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}
