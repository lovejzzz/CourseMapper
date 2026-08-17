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
import {
  preValidateAction,
  resolveDeliverableReplacementTarget,
  resolveDeliverableSubArray,
} from '../../lib/agentActions';
import { getArrayKey } from '../../lib/syncDependencies';
import { recordEditPattern } from '../../lib/agentMemory';
import { isRenderedDeliverableCollectionFeature } from '../../lib/renderedDeliverableCollection.js';
import { createAgentActionEnvelope, resolveAgentActionEnvelope } from '../../lib/agentActionEnvelope.js';

export function resolveProposalArrayKey(featureId, data) {
  const key = getArrayKey(featureId, data);
  if (key || isRenderedDeliverableCollectionFeature(featureId)) return key;
  return Object.keys(data || {}).find((candidate) => Array.isArray(data[candidate])) || null;
}

export function resolveProposalEditPath(featureId, data, path) {
  const parts = Array.isArray(path) ? [...path] : String(path || '').split('.');
  if (parts.length < 1 || typeof parts[0] !== 'string') return parts;
  const actualKey = getArrayKey(featureId, data);
  if (isRenderedDeliverableCollectionFeature(featureId)) {
    if (!actualKey) return null;
    parts[0] = actualKey;
  } else if (data?.[parts[0]] == null && actualKey) {
    parts[0] = actualKey;
  }
  return parts;
}

export function resolveProposalReplacementItem(featureId, data, lessonIndex, itemIndex, subKey) {
  return resolveDeliverableReplacementTarget(featureId, data, lessonIndex, itemIndex, subKey)?.item ?? null;
}

export function resolveProposalRemovedItem(featureId, data, lessonIndex, itemIndex, subKey) {
  if (!Number.isInteger(itemIndex)) return null;
  const arrayKey = resolveProposalArrayKey(featureId, data);
  if (!arrayKey) return null;
  const rootItems = data?.[arrayKey];
  if (featureId === 'assignments') return rootItems?.[itemIndex] ?? null;
  const lessonItem = rootItems?.[lessonIndex];
  const { items } = resolveDeliverableSubArray(featureId, lessonItem, subKey);
  return items?.[itemIndex] ?? null;
}

/**
 * @param {Object} params
 * @param {Object}   params.courseMap
 * @param {Object}   params.courseGraph
 * @param {React.MutableRefObject} params.delivRef
 * @param {React.MutableRefObject} params.executeActionRef
 * @param {Function} params.setMessages
 * @param {React.MutableRefObject} params.messagesRef
 * @param {Function} params.sendAgentMessage — for silent re-prompts on failure
 * @param {Function} params.maybeRunValidation
 */
export default function useProposalHandler({
  courseMap,
  courseGraph,
  delivRef,
  executeActionRef,
  setMessages,
  messagesRef,
  sendAgentMessage,
  maybeRunValidation,
}) {
  const proposalLockRef = useRef(false);

  function resolveProposalEnvelope(diff, resolution) {
    const envelope =
      diff?.envelope ||
      createAgentActionEnvelope({
        actions: diff?.actions || diff?.action,
        previews: diff?.previews || [diff?.preview || {}],
        title: diff?.optionTitle,
      });
    return resolveAgentActionEnvelope(envelope, resolution);
  }

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
          preview.removedItem = resolveProposalRemovedItem(
            action.featureId,
            entry.data,
            action.lessonIndex,
            action.itemIndex,
            action.subKey,
          );
        }
      } else if (type === 'editItem') {
        const deliv = delivRef.current;
        const entry = deliv?.[action.featureId];
        if (entry?.data && action.path) {
          let val = entry.data;
          const parts = resolveProposalEditPath(action.featureId, val, action.path);
          for (const p of parts || []) {
            if (val == null) break;
            val = val[p];
          }
          if (!parts) val = null;
          preview.oldValue = val ?? '';
        }
      } else if (type === 'replaceItem') {
        const deliv = delivRef.current;
        const entry = deliv?.[action.featureId];
        if (entry?.data) {
          preview.replacedItem = resolveProposalReplacementItem(
            action.featureId,
            entry.data,
            action.lessonIndex,
            action.itemIndex,
            action.subKey,
          );
        }
      } else if (type === 'deleteLesson') {
        const lesson = courseMap?.lessons?.[action.lessonIndex];
        preview.lessonTitle = lesson?.title ?? `Lesson ${(action.lessonIndex ?? 0) + 1}`;
      }
    } catch {
      /* preview is best-effort */
    }
    return preview;
  }

  // Changeset support (v0.9.1): an option may carry actions[] instead of one
  // action. Normalize so select/accept paths handle both shapes.
  function optionActionList(option) {
    if (Array.isArray(option?.actions) && option.actions.length > 0) return option.actions;
    return option?.action ? [option.action] : [];
  }

  // ── Handle proposal selection -> show diff review first ──────────────────
  function handleSelectProposal(messageIndex, optionLabel) {
    if (proposalLockRef.current) return;

    const msg = messagesRef.current[messageIndex];
    if (!msg || msg.role !== 'proposal') return;
    if (msg.status !== 'pending' && msg.status !== 'failed' && msg.status !== 'reviewing') return;

    const option = msg.proposal?.options?.find((o) => o.label === optionLabel);
    if (!option) return;

    const exec = executeActionRef.current;
    if (!exec) {
      setMessages((prev) => [...prev, { role: 'error', text: 'Action executor not available.' }]);
      return;
    }

    proposalLockRef.current = true;

    // Pre-validate before executing (every action in the option)
    const actionList = optionActionList(option);
    const validation = actionList
      .map((entryAction) => preValidateAction(entryAction, { deliverables: delivRef.current, courseMap }))
      .find((result) => !result.valid) || { valid: true };
    if (!validation.valid) {
      setMessages((prev) => {
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
        `Option "${option.title}" is invalid: ${validation.reason}. ` +
          `Please propose a new option that addresses this issue.`,
        { silent: true },
      );
      return;
    }

    // Generate diff previews BEFORE applying (one per action)
    const previews = actionList.map((entryAction) => generateDiffPreview(entryAction));
    const preview = previews[0] || {};
    const planReceiptSha256 =
      courseGraph?.evidenceGroundedInstructionalPlan?.receipt?.exactInputSha256 ||
      courseGraph?.preDraftInstructionalPlan?.receipt?.exactInputSha256 ||
      null;
    const envelope = createAgentActionEnvelope({
      actions: actionList,
      previews,
      title: option.title,
      planReceiptSha256,
    });

    // Mark proposal as "reviewing" and push a diffReview message
    setMessages((prev) => {
      const updated = [...prev];
      // Remove any existing pending diffReview for this proposal (user changed mind)
      const existingDiffIdx = updated.findIndex(
        (m) => m.role === 'diffReview' && m._proposalIndex === messageIndex && m.status === 'pending',
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
          action: actionList[0],
          actions: actionList,
          preview,
          previews,
          optionTitle: option.title,
          envelope,
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
    const allActions = Array.isArray(msg.diff.actions) && msg.diff.actions.length > 0 ? msg.diff.actions : [action];
    const proposalIndex = msg._proposalIndex;
    const optionLabel = msg._optionLabel;

    let result = { success: true };
    let appliedCount = 0;
    for (const entryAction of allActions) {
      result = exec(entryAction);
      if (!result.success) break;
      appliedCount += 1;
    }
    if (!result.success && appliedCount > 0) {
      result = { ...result, message: `${result.message} (${appliedCount}/${allActions.length} changes applied)` };
    }

    if (result.success) {
      // Record accepted edit pattern so agent learns user preferences
      recordEditPattern({
        featureId: action?.featureId || 'courseMap',
        field:
          action?.field ||
          (Array.isArray(action?.path) ? action.path.join('.') : action?.path) ||
          action?.type ||
          'proposal',
        action: 'accepted',
        path: action?.path || null,
        lessonIndex: action?.lessonIndex ?? null,
      });

      setMessages((prev) => {
        const updated = [...prev];
        // Mark diff as accepted
        updated[diffMessageIndex] = {
          ...updated[diffMessageIndex],
          status: 'accepted',
          diff: {
            ...updated[diffMessageIndex].diff,
            envelope: resolveProposalEnvelope(updated[diffMessageIndex].diff, {
              status: 'applied',
              message: result.message,
              appliedCount,
            }),
          },
        };
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
        const actionType =
          action?.type === 'addItem' || action?.type === 'addLesson'
            ? 'added'
            : action?.type === 'removeItem' || action?.type === 'deleteLesson'
              ? 'removed'
              : 'edited';
        const target = action?.featureId || 'courseMap';
        updated.push({
          role: 'changeSummary',
          summary: {
            changes: [{ type: actionType, featureId: target, count: allActions.length, label: optionTitle }],
            message:
              allActions.length > 1
                ? `Applied "${optionTitle}" (${allActions.length} coordinated changes).`
                : `Applied "${optionTitle}" to your course.`,
          },
        });
        return updated;
      });
      maybeRunValidation();
    } else {
      const errorDetail = result.message || 'Unknown error';
      const isCourseMapAction = ['editCell', 'editTitle', 'addLesson', 'deleteLesson'].includes(action?.type);
      setMessages((prev) => {
        const updated = [...prev];
        updated[diffMessageIndex] = {
          ...updated[diffMessageIndex],
          status: 'rejected',
          diff: {
            ...updated[diffMessageIndex].diff,
            envelope: resolveProposalEnvelope(updated[diffMessageIndex].diff, {
              status: 'failed',
              message: errorDetail,
              appliedCount,
            }),
          },
        };
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
        `I tried to apply "${optionTitle}" but it failed: ${errorDetail}. ` +
          (isCourseMapAction
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

    // Record rejected edit pattern so agent learns what user doesn't want
    const action = msg.diff?.action;
    if (action) {
      recordEditPattern({
        featureId: action.featureId || 'courseMap',
        field:
          action.field ||
          (Array.isArray(action.path) ? action.path.join('.') : action.path) ||
          action.type ||
          'proposal',
        action: 'rejected',
        path: action.path || null,
        lessonIndex: action.lessonIndex ?? null,
      });
    }

    setMessages((prev) => {
      const updated = [...prev];
      updated[diffMessageIndex] = {
        ...updated[diffMessageIndex],
        status: 'rejected',
        diff: {
          ...updated[diffMessageIndex].diff,
          envelope: resolveProposalEnvelope(updated[diffMessageIndex].diff, { status: 'rejected' }),
        },
      };
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
