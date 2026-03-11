/**
 * useProposalHandler.js — Proposal card logic: selection, diff preview, accept/reject.
 *
 * Extracted from useChatRouter.js (Issue #5) to reduce file size.
 * Contains:
 *  - generateDiffPreview()     — builds before/after preview for an action
 *  - handleSelectProposal()    — user clicks a proposal option
 *  - handleAcceptDiff()        — user confirms the diff
 *  - handleRejectDiff()        — user rejects the diff
 */

import { useRef } from 'react';
import { preValidateAction } from '../../lib/agentActions';
import { getArrayKey } from '../../lib/syncDependencies';

/**
 * @param {Object} params
 * @param {Object}   params.courseMap
 * @param {React.MutableRefObject} params.delivRef
 * @param {React.MutableRefObject} params.executeActionRef
 * @param {Function} params.setMessages
 * @param {React.MutableRefObject} params.messagesRef
 * @param {Function} params.sendAgentMessage — for silent re-prompts on failure
 * @param {Function} params.maybeRunValidation
 */
export default function useProposalHandler({
  courseMap,
  delivRef,
  executeActionRef,
  setMessages,
  messagesRef,
  sendAgentMessage,
  maybeRunValidation,
}) {
  const proposalLockRef = useRef(false);

  // ── Generate diff preview for an action (before applying) ─────────────────
  function generateDiffPreview(action) {
    const preview = {};
    const type = action?.type;
    try {
      if (type === 'editCell') {
        const lesson = courseMap?.lessons?.[action.lessonIndex];
        const section = lesson?.sections?.[action.sectionIndex];
        preview.oldValue = section?.[action.field] ?? '';
      } else if (type === 'editTitle') {
        const lesson = courseMap?.lessons?.[action.lessonIndex];
        preview.oldValue = lesson?.title ?? '';
      } else if (type === 'removeItem') {
        const deliv = delivRef.current;
        const entry = deliv?.[action.featureId];
        if (entry?.data) {
          const arrKey = Object.keys(entry.data).find(k => Array.isArray(entry.data[k]));
          if (arrKey) {
            const lessonItems = entry.data[arrKey]?.[action.lessonIndex];
            const items = Array.isArray(lessonItems) ? lessonItems : lessonItems?.items;
            preview.removedItem = items?.[action.itemIndex] ?? null;
          }
        }
      } else if (type === 'editItem') {
        const deliv = delivRef.current;
        const entry = deliv?.[action.featureId];
        if (entry?.data && action.path) {
          let val = entry.data;
          const parts = Array.isArray(action.path) ? [...action.path] : String(action.path).split('.');
          // Resolve root key: agent may send "slideDecks" but data uses "decks" etc.
          if (parts.length >= 1 && typeof parts[0] === 'string' && val[parts[0]] == null) {
            const actualKey = getArrayKey(action.featureId, val);
            if (actualKey) parts[0] = actualKey;
          }
          for (const p of parts) {
            if (val == null) break;
            val = val[p];
          }
          preview.oldValue = val ?? '';
        }
      } else if (type === 'deleteLesson') {
        const lesson = courseMap?.lessons?.[action.lessonIndex];
        preview.lessonTitle = lesson?.title ?? `Lesson ${(action.lessonIndex ?? 0) + 1}`;
      }
    } catch { /* preview is best-effort */ }
    return preview;
  }

  // ── Handle proposal selection -> show diff review first ──────────────────
  function handleSelectProposal(messageIndex, optionLabel) {
    if (proposalLockRef.current) return;

    const msg = messagesRef.current[messageIndex];
    if (!msg || msg.role !== 'proposal') return;
    if (msg.status !== 'pending' && msg.status !== 'failed' && msg.status !== 'reviewing') return;

    const option = msg.proposal?.options?.find(o => o.label === optionLabel);
    if (!option) return;

    const exec = executeActionRef.current;
    if (!exec) {
      setMessages(prev => [...prev, { role: 'error', text: 'Action executor not available.' }]);
      return;
    }

    proposalLockRef.current = true;

    // Pre-validate before executing
    const validation = preValidateAction(option.action, {
      deliverables: delivRef.current,
      courseMap,
    });
    if (!validation.valid) {
      setMessages(prev => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          status: 'failed',
          failedLabel: optionLabel,
          failedMessage: validation.reason,
        };
        return updated;
      });
      proposalLockRef.current = false;
      sendAgentMessage(
        `Option "${option.title}" is invalid: ${validation.reason}. `
        + `Please propose a new option that addresses this issue.`,
        { silent: true },
      );
      return;
    }

    // Generate a diff preview BEFORE applying
    const preview = generateDiffPreview(option.action);

    // Mark proposal as "reviewing" and push a diffReview message
    setMessages(prev => {
      const updated = [...prev];
      // Remove any existing pending diffReview for this proposal (user changed mind)
      const existingDiffIdx = updated.findIndex(
        m => m.role === 'diffReview' && m._proposalIndex === messageIndex && m.status === 'pending'
      );
      if (existingDiffIdx >= 0) updated.splice(existingDiffIdx, 1);

      updated[messageIndex] = {
        ...updated[messageIndex],
        status: 'reviewing',
        selectedLabel: optionLabel,
      };
      updated.push({
        role: 'diffReview',
        diff: {
          action: option.action,
          preview,
          optionTitle: option.title,
        },
        status: 'pending',
        _proposalIndex: messageIndex,
        _optionLabel: optionLabel,
      });
      return updated;
    });

    proposalLockRef.current = false;
  }

  // ── Accept diff -> apply the change ────────────────────────────────────────
  function handleAcceptDiff(diffMessageIndex) {
    const msg = messagesRef.current[diffMessageIndex];
    if (!msg || msg.role !== 'diffReview' || msg.status !== 'pending') return;

    const exec = executeActionRef.current;
    if (!exec) return;

    const { action, optionTitle } = msg.diff;
    const proposalIndex = msg._proposalIndex;
    const optionLabel = msg._optionLabel;

    const result = exec(action);

    if (result.success) {
      setMessages(prev => {
        const updated = [...prev];
        // Mark diff as accepted
        updated[diffMessageIndex] = { ...updated[diffMessageIndex], status: 'accepted' };
        // Mark parent proposal as selected
        if (proposalIndex != null && updated[proposalIndex]?.role === 'proposal') {
          updated[proposalIndex] = {
            ...updated[proposalIndex],
            status: 'selected',
            selectedLabel: optionLabel,
            failedLabel: null,
            failedMessage: null,
          };
        }
        // Add change summary
        const actionType = (action?.type === 'addItem' || action?.type === 'addLesson') ? 'added'
          : (action?.type === 'removeItem' || action?.type === 'deleteLesson') ? 'removed' : 'edited';
        const target = action?.featureId || 'courseMap';
        updated.push({
          role: 'changeSummary',
          summary: {
            changes: [{ type: actionType, featureId: target, count: 1, label: optionTitle }],
            message: `Applied "${optionTitle}" to your course.`,
          },
        });
        return updated;
      });
      maybeRunValidation();
    } else {
      const errorDetail = result.message || 'Unknown error';
      const isCourseMapAction = ['editCell', 'editTitle', 'addLesson', 'deleteLesson'].includes(action?.type);
      setMessages(prev => {
        const updated = [...prev];
        updated[diffMessageIndex] = { ...updated[diffMessageIndex], status: 'rejected' };
        // Mark proposal as failed (not dismissed) — other options remain clickable
        if (proposalIndex != null && updated[proposalIndex]?.role === 'proposal') {
          updated[proposalIndex] = {
            ...updated[proposalIndex],
            status: 'failed',
            failedLabel: optionLabel,
            failedMessage: errorDetail,
          };
        }
        return updated;
      });
      sendAgentMessage(
        `I tried to apply "${optionTitle}" but it failed: ${errorDetail}. `
        + (isCourseMapAction
          ? `The course map edit could not be applied. Please try a different approach.`
          : `The deliverable "${action?.featureId || 'unknown'}" may not be available. Please target a deliverable that IS generated (status "done"), or suggest an alternative approach.`),
        { silent: true },
      );
    }
  }

  // ── Reject diff -> dismiss and optionally ask agent for alternative ────────
  function handleRejectDiff(diffMessageIndex) {
    const msg = messagesRef.current[diffMessageIndex];
    if (!msg || msg.role !== 'diffReview' || msg.status !== 'pending') return;

    const proposalIndex = msg._proposalIndex;

    setMessages(prev => {
      const updated = [...prev];
      updated[diffMessageIndex] = { ...updated[diffMessageIndex], status: 'rejected' };
      // Restore parent proposal to pending so user can pick another option
      if (proposalIndex != null && updated[proposalIndex]?.role === 'proposal') {
        updated[proposalIndex] = {
          ...updated[proposalIndex],
          status: 'pending',
          selectedLabel: null,
        };
      }
      return updated;
    });
  }

  return {
    handleSelectProposal,
    handleAcceptDiff,
    handleRejectDiff,
  };
}
