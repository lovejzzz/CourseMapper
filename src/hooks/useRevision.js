import { useState, useRef, useCallback } from 'react';
import useStreamReader from './useStreamReader';
import applyPatches from '../lib/applyPatches';
import { REVISION_SYSTEM_PROMPT, buildRevisionUserPrompt } from '../lib/prompts';

/**
 * Handles course map revision with patch-based edits, stop/resume, and retry.
 */
export default function useRevision({
  provider, modelId, apiKey,
  courseMap, setCourseMap, setOldCourseMap,
  pushVersion,
  userEdits, setUserEdits,
  // Shared streaming state from useGeneration
  setIsStreaming, setStreamDetail, setStreamProgress,
  setProgressStep, setIsStopped, setStatus, setError,
  setRetryInfo,
}) {
  const [isRevising, setIsRevising] = useState(false);

  const stoppedRevisionTextRef = useRef('');
  const stoppedRevisionMsgRef = useRef('');
  const stoppedRevisionOldMapRef = useRef(null);
  const fullTextRef = useRef('');
  const lastUIUpdateRef = useRef(0);

  const { streamProvider, parsePartialJSON, abort, abortControllerRef } = useStreamReader();

  // ── Main Revision ──
  const handleRevision = useCallback(async (userMessage, chatHistory) => {
    if (!courseMap) throw new Error('No course map to revise.');
    setIsRevising(true);
    setIsStreaming(true);
    setError('');
    setProgressStep('generating');
    setStreamDetail('Revising course map...');
    setStreamProgress(0);
    setRetryInfo(null);

    const oldMap = JSON.parse(JSON.stringify(courseMap));
    setOldCourseMap(oldMap);

    fullTextRef.current = '';

    try {
      const revisionUserPrompt = buildRevisionUserPrompt(
        courseMap,
        userMessage,
        userEdits.length > 0 ? userEdits : undefined,
        chatHistory && chatHistory.length > 1 ? chatHistory.slice(0, -1) : undefined,
      );
      const result = await streamProvider(provider, apiKey, modelId, REVISION_SYSTEM_PROMPT, revisionUserPrompt, {
        onChunk: (text, count) => {
          fullTextRef.current = text;
          const now = performance.now();
          if (now - lastUIUpdateRef.current < 150) return;
          lastUIUpdateRef.current = now;

          // Try to parse as patches first
          const partial = parsePartialJSON(text);
          if (partial && partial.patches) {
            // Patch mode — apply incrementally
            try {
              const patched = applyPatches(oldMap, partial.patches);
              setCourseMap({ ...patched });
              setStreamDetail(`Applying ${partial.patches.length} change${partial.patches.length > 1 ? 's' : ''}...`);
              const estTotal = Math.max(text.length * 1.3, 2000);
              setStreamProgress(Math.min(Math.round((text.length / estTotal) * 90), 90));
            } catch { /* partial patches, keep going */ }
          } else if (partial && partial.lessons) {
            // Full map mode (fallback)
            setCourseMap({ ...partial });
            const lessons = partial.lessons;
            const lastLesson = lessons[lessons.length - 1];
            if (lastLesson) {
              const sections = lastLesson.sections || [];
              const lastSection = sections[sections.length - 1];
              const lessonNum = lessons.length;
              const estTotal = Math.max(text.length * 1.3, 8000);
              setStreamProgress(Math.min(Math.round((text.length / estTotal) * 90), 90));
              if (lastSection) {
                const filledKeys = Object.keys(lastSection).filter(k => lastSection[k]);
                const lastKey = filledKeys[filledKeys.length - 1];
                const keyLabel = lastKey ? lastKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim() : '';
                setStreamDetail(`Revising Lesson ${lessonNum} ${keyLabel}...`);
              } else {
                setStreamDetail(`Revising Lesson ${lessonNum}...`);
              }
            }
          }
        },
        onRetry: (attempt, max, delay) => {
          setRetryInfo({ attempt, max, delay });
          setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
        },
      });

      setRetryInfo(null);
      const fullText = result.fullText;
      fullTextRef.current = fullText;

      // Final parse
      const finalResult = parsePartialJSON(fullText);

      // Chat reply (not a revision)
      if (finalResult && finalResult.chatReply && !finalResult.lessons && !finalResult.patches) {
        setIsRevising(false);
        setIsStreaming(false);
        setStreamDetail('');
        setStreamProgress(100);
        setProgressStep('done');
        setOldCourseMap(null);
        return { chatReply: finalResult.chatReply };
      }

      // Patch-based response
      if (finalResult && finalResult.patches && Array.isArray(finalResult.patches)) {
        const patched = applyPatches(oldMap, finalResult.patches);
        setCourseMap(patched);
        setIsStreaming(false);
        setStreamDetail('');
        setStreamProgress(100);
        setProgressStep('done');
        pushVersion(patched, 'Revision');
        setUserEdits([]);
        setTimeout(() => setOldCourseMap(null), 4000);
        return patched;
      }

      // Full map response (fallback)
      if (!finalResult || !finalResult.lessons) {
        throw new Error('Invalid revision response from AI.');
      }

      setCourseMap(finalResult);
      setIsStreaming(false);
      setStreamDetail('');
      setStreamProgress(100);
      setProgressStep('done');
      pushVersion(finalResult, 'Revision');
      setUserEdits([]);
      setTimeout(() => setOldCourseMap(null), 4000);
      return finalResult;
    } catch (err) {
      setRetryInfo(null);
      if (err.name === 'AbortError') {
        stoppedRevisionTextRef.current = fullTextRef.current;
        stoppedRevisionMsgRef.current = userMessage;
        stoppedRevisionOldMapRef.current = oldMap;
        const partial = parsePartialJSON(fullTextRef.current);
        if (partial && partial.lessons) setCourseMap(partial);
        setIsStreaming(false);
        setIsRevising(false);
        setStreamDetail('');
        setIsStopped(true);
        setStatus('stopped');
        return;
      }
      setError('Revision failed: ' + err.message);
      setOldCourseMap(null);
      setProgressStep('done');
      throw err;
    } finally {
      setIsRevising(false);
      setIsStreaming(false);
      setStreamDetail('');
    }
  }, [provider, modelId, apiKey, courseMap, userEdits, setCourseMap, setOldCourseMap, pushVersion, setUserEdits, streamProvider, parsePartialJSON, setIsStreaming, setStreamDetail, setStreamProgress, setProgressStep, setIsStopped, setStatus, setError, setRetryInfo]);

  // ── Resume Revision ──
  const handleResumeRevision = useCallback(async () => {
    const savedText = stoppedRevisionTextRef.current;
    const savedMsg = stoppedRevisionMsgRef.current;
    const savedOldMap = stoppedRevisionOldMapRef.current;
    if (!savedText || !savedMsg) return;

    setIsStopped(false);
    setIsRevising(true);
    setIsStreaming(true);
    setStatus('generating');
    setProgressStep('generating');
    setStreamDetail('Resuming revision...');
    setError('');
    setRetryInfo(null);
    if (savedOldMap) setOldCourseMap(savedOldMap);

    try {
      const continuationPrompt = `You were revising a Course Map based on this user request: "${savedMsg}"\n\nHere is the PARTIAL JSON output you generated so far (it was cut off):\n\n${savedText}\n\nContinue generating from EXACTLY where this left off. Output ONLY the remaining JSON text that comes after the last character above. Do NOT repeat any content. Do NOT start with a new JSON object. Just continue the JSON from the exact point it stopped.`;

      const { fullText } = await streamProvider(provider, apiKey, modelId, REVISION_SYSTEM_PROMPT, continuationPrompt, {
        existingText: savedText,
        onChunk: (text) => {
          const partial = parsePartialJSON(text);
          if (partial && partial.lessons) {
            setCourseMap({ ...partial });
            setStreamDetail(`Revising Lesson ${partial.lessons.length}...`);
            const estTotal = Math.max(text.length * 1.3, 8000);
            setStreamProgress(Math.min(Math.round((text.length / estTotal) * 90), 90));
          }
        },
        onRetry: (attempt, max, delay) => {
          setRetryInfo({ attempt, max, delay });
          setStreamDetail(`Connection lost — retrying (${attempt}/${max})...`);
        },
      });

      setRetryInfo(null);
      const finalResult = parsePartialJSON(fullText);
      if (!finalResult || !finalResult.lessons) {
        throw new Error('Invalid revision response from AI.');
      }

      setCourseMap(finalResult);
      setIsStreaming(false);
      setStreamDetail('');
      setStreamProgress(100);
      setProgressStep('done');
      setStatus('done');
      pushVersion(finalResult, 'Revision');
      setUserEdits([]);
      stoppedRevisionTextRef.current = '';
      stoppedRevisionMsgRef.current = '';
      stoppedRevisionOldMapRef.current = null;
      setTimeout(() => setOldCourseMap(null), 6000);
    } catch (err) {
      setRetryInfo(null);
      if (err.name === 'AbortError') {
        setIsStreaming(false);
        setIsRevising(false);
        setStreamDetail('');
        setIsStopped(true);
        setStatus('stopped');
        return;
      }
      setError('Resume revision failed: ' + err.message);
      setStatus('error');
      setIsStreaming(false);
      setStreamDetail('');
      setStreamProgress(0);
      setIsStopped(false);
      stoppedRevisionTextRef.current = '';
      stoppedRevisionMsgRef.current = '';
      stoppedRevisionOldMapRef.current = null;
    } finally {
      setIsRevising(false);
      setIsStreaming(false);
    }
  }, [provider, modelId, apiKey, courseMap, setCourseMap, setOldCourseMap, pushVersion, setUserEdits, streamProvider, parsePartialJSON, setIsStreaming, setStreamDetail, setStreamProgress, setProgressStep, setIsStopped, setStatus, setError, setRetryInfo]);

  const resetRevision = useCallback(() => {
    setIsRevising(false);
    stoppedRevisionTextRef.current = '';
    stoppedRevisionMsgRef.current = '';
    stoppedRevisionOldMapRef.current = null;
  }, []);

  return {
    isRevising,
    handleRevision,
    handleResumeRevision,
    resetRevision,
    revisionAbortRef: abortControllerRef,
  };
}
