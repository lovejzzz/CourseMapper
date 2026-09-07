import { useCallback, useRef, useState } from 'react';
import {
  emptyTeachingReviewDrafts,
  restoreTeachingReviewDrafts,
  saveTeachingReviewDraft,
  removeTeachingReviewDraft,
} from '../lib/teachingReviewDrafts.js';

/** Project-scoped candidate work. It uses the existing project persistence
 * owner and is deliberately separate from confirmed course/edit history. */
export default function useTeachingReviewDrafts() {
  const [book, setBook] = useState(emptyTeachingReviewDrafts);
  const [session, setSession] = useState(0);
  const current = useRef(book);
  const update = useCallback((next) => {
    current.current = next;
    setBook(next);
  }, []);
  const save = useCallback(
    (draft, context) => update(saveTeachingReviewDraft(current.current, draft, context)),
    [update],
  );
  const remove = useCallback((taskId) => update(removeTeachingReviewDraft(current.current, taskId)), [update]);
  const restore = useCallback(
    (value) => {
      update(restoreTeachingReviewDrafts(value));
      setSession((value) => value + 1);
    },
    [update],
  );
  const snapshot = useCallback(() => current.current, []);
  return { book, session, save, remove, restore, snapshot };
}
