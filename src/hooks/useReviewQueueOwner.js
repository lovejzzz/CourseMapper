/**
 * useReviewQueueOwner — v0.15.1 C1: the review queue's single owner,
 * extracted from AppFlow (where v0.14.9 B1 built it).
 *
 * One hook builds THE queue object (spot-check checklist included), owns
 * persisted review progress, and selects the outstanding view — the header
 * CTA, the panel-hosted drawer, and the digest entry all read this one
 * result. counts.headline = judgment items (syncs + observations +
 * structural); spot-checks confirm-all in the drawer only.
 *
 * The pending sync suggestion is read from BOTH sources deliberately
 * (v0.15 sync-proof fix): the live hook state covers the pre-consumption
 * window; the durable chat message (role 'syncSuggestion', status
 * 'pending') covers everything after ChatPanel consumes-and-clears it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyReviewMark,
  buildReviewQueue,
  loadReviewProgress,
  resolveReviewRunId,
  saveReviewProgress,
  selectOutstandingQueue,
} from '../lib/reviewQueueModel';
import { buildPreExportChecklist } from '../lib/preExportChecklist';

export default function useReviewQueueOwner({
  courseMap,
  deliverables,
  reviewObservations,
  lastRunDigest,
  packageQualityPass,
  pendingSyncSuggestion,
  chatHistory,
}) {
  const pendingSyncFromChat = useMemo(() => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const message = chatHistory[i];
      if (message?.role === 'syncSuggestion') {
        return message.status === 'pending' ? message : null;
      }
    }
    return null;
  }, [chatHistory]);

  const reviewChecklistItems = useMemo(() => {
    try {
      return buildPreExportChecklist({ courseMap, deliverables });
    } catch {
      return [];
    }
  }, [courseMap, deliverables]);

  const reviewQueue = useMemo(
    () =>
      buildReviewQueue({
        reviewItems: reviewChecklistItems,
        observations: reviewObservations,
        finalizerResult: lastRunDigest,
        qualityPass: packageQualityPass,
        syncSuggestion: pendingSyncSuggestion || pendingSyncFromChat,
      }),
    [
      reviewChecklistItems,
      reviewObservations,
      lastRunDigest,
      packageQualityPass,
      pendingSyncSuggestion,
      pendingSyncFromChat,
    ],
  );

  const reviewRunId = useMemo(
    () =>
      resolveReviewRunId({
        finalizerResult: lastRunDigest,
        qualityPass: packageQualityPass,
        courseName: courseMap?.courseName || '',
      }),
    [lastRunDigest, packageQualityPass, courseMap?.courseName],
  );

  const [reviewProgress, setReviewProgress] = useState(() => loadReviewProgress(reviewRunId));
  useEffect(() => {
    // A NEW finish pass carries a new run id — progress resets honestly.
    setReviewProgress(loadReviewProgress(reviewRunId));
  }, [reviewRunId]);

  const outstandingReview = useMemo(
    () => selectOutstandingQueue(reviewQueue, reviewProgress),
    [reviewQueue, reviewProgress],
  );

  const handleReviewMark = useCallback((item, mark) => {
    setReviewProgress((prev) => {
      const next = applyReviewMark(prev, item.id, mark);
      saveReviewProgress(next);
      return next;
    });
  }, []);

  // Confirm-all for the spot-check class: one state update, one persist.
  const handleReviewMarkAll = useCallback((items, mark) => {
    setReviewProgress((prev) => {
      let next = prev;
      for (const item of Array.isArray(items) ? items : []) next = applyReviewMark(next, item.id, mark);
      saveReviewProgress(next);
      return next;
    });
  }, []);

  return {
    reviewQueue,
    reviewProgress,
    outstandingReview,
    pendingSyncFromChat,
    handleReviewMark,
    handleReviewMarkAll,
  };
}
