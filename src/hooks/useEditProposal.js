import { useState, useCallback, useRef } from 'react';
import useStreamReader from './useStreamReader';
import { getDeliverablePrompt } from '../lib/deliverablePrompts';
import { getArrayKey } from '../lib/syncDependencies';

/**
 * useEditProposal — Edit-Aware AI Proposal Engine
 *
 * When a user edits text in a deliverable, instead of auto-regenerating,
 * this hook streams an AI revision proposal that the user can Accept,
 * Regenerate, or Dismiss.
 *
 * Proposals are local state only — never persisted to localStorage.
 *
 * State shape:
 *   proposals: {
 *     [featureId]: {
 *       [lessonIndex]: {
 *         status: 'streaming' | 'ready' | 'dismissed',
 *         proposedData: object | null,    // full lesson object from AI
 *         editContext: string | null,     // e.g. 'homework: "3" → "4"'
 *       }
 *     }
 *   }
 *
 * Exposes:
 *   { proposals, proposeLesson, acceptProposal, dismissProposal, regenerateProposal }
 */
export default function useEditProposal({ provider, modelId, apiKey, deliverableConfig, pedagogicalMode }) {
  const [proposals, setProposals] = useState({});
  const { streamProvider, parsePartialJSON } = useStreamReader();

  // Ref to prevent multiple concurrent streams for the same lesson
  // Map<"featureId:lessonIndex", AbortController>
  const activeStreamsRef = useRef(new Map());

  /**
   * Set a single proposal entry immutably.
   */
  const setProposal = useCallback((featureId, lessonIndex, update) => {
    setProposals(prev => {
      const featureProposals = prev[featureId] || {};
      const existing = featureProposals[lessonIndex] || {};
      return {
        ...prev,
        [featureId]: {
          ...featureProposals,
          [lessonIndex]: { ...existing, ...update },
        },
      };
    });
  }, []);

  /**
   * Remove a proposal entry entirely.
   */
  const clearProposal = useCallback((featureId, lessonIndex) => {
    setProposals(prev => {
      const featureProposals = { ...(prev[featureId] || {}) };
      delete featureProposals[lessonIndex];
      return { ...prev, [featureId]: featureProposals };
    });
  }, []);

  /**
   * proposeLesson — stream an AI revision incorporating the user's edit.
   *
   * @param {string}      featureId      — e.g. 'assignments'
   * @param {object}      courseMap      — current course map
   * @param {number}      lessonIndex    — 0-based lesson index
   * @param {string|null} editContext    — human-readable change summary
   * @param {object|null} existingData   — current full deliverable data (for merge)
   */
  const proposeLesson = useCallback(async (featureId, courseMap, lessonIndex, editContext, existingData) => {
    if (!courseMap || lessonIndex == null) return;

    const streamKey = `${featureId}:${lessonIndex}`;

    // Abort any existing stream for this lesson
    if (activeStreamsRef.current.has(streamKey)) {
      activeStreamsRef.current.get(streamKey).abort();
    }
    const controller = new AbortController();
    activeStreamsRef.current.set(streamKey, controller);

    // Mark as streaming immediately so the panel appears
    setProposal(featureId, lessonIndex, {
      status: 'streaming',
      proposedData: null,
      editContext: editContext || null,
    });

    const config = deliverableConfig?.[featureId] || {};
    const mode = pedagogicalMode || 'lecture';

    // Build prompt with edit context injected as the highest-priority constraint
    const prompts = getDeliverablePrompt(
      featureId, courseMap, [lessonIndex], config, mode, null, editContext
    );

    if (!prompts) {
      clearProposal(featureId, lessonIndex);
      activeStreamsRef.current.delete(streamKey);
      return;
    }

    // Capture existing array for merge context
    const existingKey = getArrayKey(featureId, existingData);
    const existingArr = existingData?.[existingKey] || [];

    try {
      let fullText = '';
      let lastParseTime = 0;

      await streamProvider(provider, apiKey, modelId, prompts.systemPrompt, prompts.userPrompt, {
        signal: controller.signal,
        onChunk: (accumulatedText) => {
          fullText = accumulatedText;
          const now = Date.now();
          if (now - lastParseTime > 150) {
            lastParseTime = now;
            const partial = parsePartialJSON(fullText);
            if (partial) {
              // Extract the proposed lesson from the partial result
              const partialKey = getArrayKey(featureId, partial);
              const partialArr = partialKey ? (partial[partialKey] || []) : [];
              if (partialArr.length > 0) {
                // The AI returns 1 lesson (the scoped one); grab it
                const proposedLesson = partialArr[0];
                setProposal(featureId, lessonIndex, {
                  status: 'streaming',
                  proposedData: proposedLesson,
                  editContext: editContext || null,
                });
              }
            }
          }
        },
        maxRetries: 1,
      });

      // Finalize
      const finalParsed = parsePartialJSON(fullText);
      if (finalParsed) {
        const finalKey = getArrayKey(featureId, finalParsed);
        const finalArr = finalKey ? (finalParsed[finalKey] || []) : [];
        const proposedLesson = finalArr[0] || null;
        setProposal(featureId, lessonIndex, {
          status: 'ready',
          proposedData: proposedLesson,
          editContext: editContext || null,
        });
      } else {
        // Stream completed but couldn't parse — clear silently
        clearProposal(featureId, lessonIndex);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn(`[useEditProposal] proposeLesson failed for ${featureId}[${lessonIndex}]:`, err);
        // Clear proposal on failure — don't leave a broken panel
        clearProposal(featureId, lessonIndex);
      }
    } finally {
      activeStreamsRef.current.delete(streamKey);
    }
  }, [provider, modelId, apiKey, deliverableConfig, pedagogicalMode, streamProvider, parsePartialJSON, setProposal, clearProposal]);

  /**
   * acceptProposal — merge the proposed lesson into the full deliverable data
   * and update state via the setDeliverables shim (to stay consistent with
   * how App.jsx manages deliverable state).
   *
   * @param {string}   featureId
   * @param {number}   lessonIndex
   * @param {object}   currentFullData  — The current full deliverable data from the store
   * @param {function} setDeliverables  — The setDeliverables shim from useDeliverables
   */
  const acceptProposal = useCallback((featureId, lessonIndex, currentFullData, setDeliverables) => {
    setProposals(prev => {
      const proposal = prev[featureId]?.[lessonIndex];
      if (!proposal || proposal.status !== 'ready' || !proposal.proposedData) return prev;

      // Merge proposed lesson into the full array
      const existingKey = getArrayKey(featureId, currentFullData);
      if (existingKey && currentFullData) {
        const existingArr = currentFullData[existingKey] || [];
        const merged = [...existingArr];
        if (lessonIndex < merged.length) {
          merged[lessonIndex] = proposal.proposedData;
        } else {
          merged.push(proposal.proposedData);
        }
        const mergedData = { ...currentFullData, [existingKey]: merged };

        // Update the deliverable store
        setDeliverables(prev2 => ({
          ...prev2,
          [featureId]: { ...prev2[featureId], data: mergedData, status: 'done', stale: false },
        }));
      }

      // Remove the proposal entry
      const featureProposals = { ...(prev[featureId] || {}) };
      delete featureProposals[lessonIndex];
      return { ...prev, [featureId]: featureProposals };
    });
  }, []);

  /**
   * dismissProposal — discard the proposal, preserve the user's raw edit.
   */
  const dismissProposal = useCallback((featureId, lessonIndex) => {
    // Abort any active stream
    const streamKey = `${featureId}:${lessonIndex}`;
    if (activeStreamsRef.current.has(streamKey)) {
      activeStreamsRef.current.get(streamKey).abort();
    }
    // Animate out: set dismissed, then clear after 300ms
    setProposal(featureId, lessonIndex, { status: 'dismissed' });
    setTimeout(() => clearProposal(featureId, lessonIndex), 300);
  }, [setProposal, clearProposal]);

  /**
   * regenerateProposal — re-run proposeLesson with the same edit context.
   */
  const regenerateProposal = useCallback((featureId, courseMap, lessonIndex, editContext, existingData) => {
    proposeLesson(featureId, courseMap, lessonIndex, editContext, existingData);
  }, [proposeLesson]);

  return { proposals, proposeLesson, acceptProposal, dismissProposal, regenerateProposal };
}
