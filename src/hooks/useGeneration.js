import { useState, useRef, useCallback } from 'react';
import { parseFiles } from '../lib/fileParser';
import { SYSTEM_PROMPT, buildUserPrompt, EXAMINE_SYSTEM_PROMPT, buildExamineUserPrompt } from '../lib/prompts';
import { checkTokenLimit, truncateToFit } from '../lib/tokenEstimator';
import useStreamReader from './useStreamReader';
import { notifyDone } from '../lib/notifyDone';
import applyPatches from '../lib/applyPatches';

/**
 * Handles course map generation, examination, stop/resume, and retry.
 */
export default function useGeneration({
  provider, modelId, apiKey, files, columns,
  setCourseMap, setOldCourseMap, pushVersion, userEdits, setUserEdits,
}) {
  const [status, setStatus] = useState('idle');
  const [progressStep, setProgressStep] = useState(null);
  const [error, setError] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamDetail, setStreamDetail] = useState('');
  const [streamProgress, setStreamProgress] = useState(0);
  const [isStopped, setIsStopped] = useState(false);
  const [examChanges, setExamChanges] = useState([]);
  const [retryInfo, setRetryInfo] = useState(null); // { attempt, max, delay }

  const stoppedTextRef = useRef('');
  const stoppedPromptRef = useRef(null);
  const syllabusTextRef = useRef('');
  const fullTextRef = useRef('');
  const lastUIUpdateRef = useRef(0);
  const courseMapRef = useRef(null);

  const { streamProvider, parsePartialJSON, abort, abortControllerRef } = useStreamReader();

  // ── Apply pending user edits onto a course map ──
  function applyUserEdits(map) {
    if (!userEdits || userEdits.length === 0) return map;
    const merged = JSON.parse(JSON.stringify(map));
    for (const edit of userEdits) {
      try {
        if (edit.key === 'title' && merged.lessons[edit.lessonIdx]) {
          merged.lessons[edit.lessonIdx].title = edit.newValue;
        } else if (merged.lessons[edit.lessonIdx]?.sections?.[edit.sectionIdx]) {
          merged.lessons[edit.lessonIdx].sections[edit.sectionIdx][edit.key] = edit.newValue;
        }
      } catch { /* skip invalid edits */ }
    }
    return merged;
  }

  // ── Helpers for stream progress updates (time-based throttle) ──
  function updateGenerationProgress(fullText, chunkCount) {
    const now = performance.now();
    // Throttle UI updates to ~150ms intervals for smooth streaming
    if (now - lastUIUpdateRef.current < 150) return;
    lastUIUpdateRef.current = now;

    const partial = parsePartialJSON(fullText);
    if (partial && partial.lessons) {
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
          const filledKeys = Object.keys(lastSection).filter(k => lastSection[k]);
          const lastKey = filledKeys[filledKeys.length - 1];
          const keyLabel = lastKey ? lastKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim() : '';
          setStreamDetail(`Mapping Lesson ${lessonNum} ${keyLabel}...`);
        } else {
          setStreamDetail(`Starting Lesson ${lessonNum}...`);
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
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
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

  // ── Run the Examine step (patch-based) ──
  async function runExamine(finalResult) {
    setProgressStep('examining');
    setStreamDetail('Reviewing for missing or inaccurate content...');
    setExamChanges([]);
    const preExamineMap = JSON.parse(JSON.stringify(finalResult));
    setOldCourseMap(preExamineMap);

    try {
      const examUserPrompt = buildExamineUserPrompt(finalResult, syllabusTextRef.current);
      const { fullText: examineText } = await streamProvider(provider, apiKey, modelId, EXAMINE_SYSTEM_PROMPT, examUserPrompt, {
        onChunk: (text) => {
          if (text.length % 200 < 10) {
            // Try to parse partial patches for progress feedback
            const partial = parsePartialJSON(text);
            if (partial && partial.patches) {
              setStreamDetail(`Found ${partial.patches.length} fix${partial.patches.length !== 1 ? 'es' : ''} so far...`);
            }
          }
        },
        onRetry: (attempt, max, delay) => {
          setRetryInfo({ attempt, max, delay });
          setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
        },
      });

      setRetryInfo(null);
      const patchResult = parsePartialJSON(examineText);

      if (patchResult && Array.isArray(patchResult.patches) && patchResult.patches.length > 0) {
        const patched = applyPatches(finalResult, patchResult.patches);
        setCourseMap(patched);

        // Build change descriptions — use AI-provided reason when available
        const changes = patchResult.patches.map((p) => {
          const label = (p.field || '').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
          let location;
          if (p.action === 'addLesson') location = `Added Lesson ${(p.lessonIndex || 0) + 1}`;
          else if (p.action === 'addSection') location = `Added section in Lesson ${(p.lessonIndex || 0) + 1}`;
          else if (p.action === 'removeLesson') location = `Removed Lesson ${(p.lessonIndex || 0) + 1}`;
          else if (p.field === 'title') location = `Lesson ${(p.lessonIndex || 0) + 1} title`;
          else if (p.field === 'courseName' || p.field === 'semester') location = label;
          else location = `Lesson ${(p.lessonIndex || 0) + 1}, Section ${(p.sectionIndex || 0) + 1} — ${label}`;

          // Prefer the AI's specific reason; fall back to generic location
          return p.reason ? `${location}: ${p.reason}` : location;
        });
        setExamChanges(changes);
        pushVersion(patched, `Examined — ${changes.length} fix${changes.length > 1 ? 'es' : ''}`);
        setTimeout(() => setOldCourseMap(null), 3000);
      } else if (patchResult && patchResult.lessons) {
        // Fallback: AI returned a full course map instead of patches
        setCourseMap(patchResult);
        const changes = computeExamDiff(preExamineMap, patchResult);
        setExamChanges(changes);
        if (changes.length > 0) {
          pushVersion(patchResult, `Examined — ${changes.length} fix${changes.length > 1 ? 'es' : ''}`);
          setTimeout(() => setOldCourseMap(null), 3000);
        } else {
          pushVersion(patchResult, 'Examined — no changes needed');
          setOldCourseMap(null);
        }
      } else {
        // No patches needed or empty response
        setExamChanges([]);
        setOldCourseMap(null);
      }
    } catch (examErr) {
      setRetryInfo(null);
      if (examErr.name === 'AbortError') {
        setOldCourseMap(null);
      } else {
        console.warn('Examine step failed:', examErr.message);
        setOldCourseMap(null);
        // Surface the failure so user can see it and optionally retry
        setExamChanges(['__EXAM_FAILED__:' + (examErr.message || 'Unknown error')]);
      }
    }
  }

  // ── Main Generate ──
  const handleGenerate = useCallback(async () => {
    setError('');
    setCourseMap(null);
    setRetryInfo(null);

    // Step 1: Parse files
    setStatus('parsing');
    setProgressStep('parsing');
    let parsedFiles;
    try {
      parsedFiles = await parseFiles(files);
    } catch (err) {
      setError('Failed to parse files: ' + err.message);
      setStatus('error');
      return;
    }

    const errors = parsedFiles.filter((f) => f.error);
    const combinedText = parsedFiles
      .filter((f) => f.text)
      .map((f) => `=== File: ${f.name} ===\n${f.text}`)
      .join('\n\n');

    if (!combinedText.trim()) {
      const errMsg = errors.length > 0
        ? errors.map((f) => `${f.name}: ${f.error}`).join('\n')
        : 'No text content could be extracted.';
      setError('Failed to parse files:\n' + errMsg);
      setStatus('error');
      return;
    }

    syllabusTextRef.current = combinedText;
    setProgressStep('sending');
    setStatus('generating');

    // Step 2: Check token limits
    const userPrompt = buildUserPrompt(combinedText, columns);
    const fullPromptText = SYSTEM_PROMPT + userPrompt;
    const tokenCheck = checkTokenLimit(fullPromptText, modelId);

    let finalUserPrompt = userPrompt;
    let parseWarning = '';
    if (errors.length > 0) {
      parseWarning = `Note: ${errors.length} file(s) could not be parsed (${errors.map(f => f.name).join(', ')}). Continuing with the rest.`;
    }
    if (!tokenCheck.fits) {
      const { text: truncatedContent, wasTruncated } = truncateToFit(combinedText, modelId);
      if (wasTruncated) {
        finalUserPrompt = buildUserPrompt(truncatedContent, columns);
        parseWarning = (parseWarning ? parseWarning + '\n' : '') +
          `Content was ~${tokenCheck.estimatedTokens.toLocaleString()} tokens (model limit: ~${tokenCheck.availableTokens.toLocaleString()} available). Auto-truncated to fit.`;
      }
    }
    if (parseWarning) setError(parseWarning);

    setIsStreaming(true);
    setStreamDetail('');
    setStreamProgress(0);

    fullTextRef.current = '';
    try {
      await new Promise((r) => setTimeout(r, 400));
      setProgressStep('generating');

      const { fullText } = await streamProvider(provider, apiKey, modelId, SYSTEM_PROMPT, finalUserPrompt, {
        onChunk: (text, count) => {
          fullTextRef.current = text;
          updateGenerationProgress(text, count);
        },
        onRetry: (attempt, max, delay) => {
          setRetryInfo({ attempt, max, delay });
          setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
        },
      });

      setRetryInfo(null);

      // Final parse
      const finalResult = parsePartialJSON(fullText);
      if (!finalResult || !finalResult.lessons) {
        throw new Error('Invalid response structure from AI.');
      }

      setCourseMap(finalResult);
      courseMapRef.current = finalResult;
      setIsStreaming(false);
      setStreamDetail('');
      setStreamProgress(95);
      stoppedTextRef.current = '';
      stoppedPromptRef.current = null;
      pushVersion(finalResult, 'Initial generation');

      // Examine step
      await runExamine(finalResult);

      setStreamDetail('');
      setStreamProgress(100);
      setProgressStep('done');
      setStatus('done');
      setUserEdits([]);
      notifyDone('Course map is ready!');
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
        return;
      }
      setError('AI generation failed: ' + err.message);
      setStatus('error');
      setIsStreaming(false);
      setStreamDetail('');
      setStreamProgress(0);
    }
  }, [provider, modelId, apiKey, files, columns, setCourseMap, setOldCourseMap, pushVersion, setUserEdits, streamSSE, parsePartialJSON]);

  // ── Resume Generation ──
  const handleResume = useCallback(async () => {
    const savedText = stoppedTextRef.current;
    if (!savedText) return;

    setIsStopped(false);
    setStatus('generating');
    setProgressStep('generating');
    setIsStreaming(true);
    setStreamDetail('Resuming generation...');
    setError('');
    setRetryInfo(null);

    try {
      fullTextRef.current = savedText;
      const continuationPrompt = `You were generating a Course Map JSON and the output was interrupted. Here is the partial JSON you generated so far:\n\n${savedText}\n\nContinue generating from EXACTLY where this left off. Output ONLY the remaining JSON text that comes after the last character above. Do NOT repeat any content. Do NOT start with a new JSON object. Just continue the JSON from the exact point it stopped.`;

      const { fullText } = await streamProvider(provider, apiKey, modelId, SYSTEM_PROMPT, continuationPrompt, {
        existingText: savedText,
        onChunk: (text, count) => {
          fullTextRef.current = text;
          updateGenerationProgress(text, count);
        },
        onRetry: (attempt, max, delay) => {
          setRetryInfo({ attempt, max, delay });
          setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
        },
      });

      setRetryInfo(null);
      const finalResult = parsePartialJSON(fullText);
      if (!finalResult || !finalResult.lessons) {
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
      notifyDone('Course map is ready!');
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
        return;
      }
      setError('Resume failed: ' + err.message);
      setStatus('error');
      setIsStreaming(false);
      setStreamDetail('');
      setStreamProgress(0);
      setIsStopped(false);
      stoppedTextRef.current = '';
    }
  }, [provider, modelId, apiKey, setCourseMap, pushVersion, userEdits, streamProvider, parsePartialJSON]);

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
    setRetryInfo(null);
    stoppedTextRef.current = '';
    stoppedPromptRef.current = null;
    syllabusTextRef.current = '';
    abort();
  }, [abort]);

  const handleRetryExamine = useCallback(async () => {
    if (!courseMapRef.current) return;
    await runExamine(courseMapRef.current);
    setStreamDetail('');
    setStreamProgress(100);
    setProgressStep('done');
    setStatus('done');
  }, [provider, modelId, apiKey]);

  return {
    status, setStatus,
    progressStep, setProgressStep,
    error, setError,
    isStreaming, setIsStreaming,
    streamDetail, setStreamDetail,
    streamProgress, setStreamProgress,
    isStopped, setIsStopped,
    examChanges,
    retryInfo,
    abortControllerRef,
    parsePartialJSON,
    handleGenerate,
    handleResume,
    handleStop,
    handleClearAll,
    resetGeneration,
    handleRetryExamine,
  };
}
