import React from 'react';
import { lessonSourceReviewItems } from '../lib/lessonSourceReview.js';

export default function LessonSourceReview({ courseMap, courseGraph, onIssueClick, onOpenReport }) {
  const items = lessonSourceReviewItems(courseMap, courseGraph);
  if (!items.length) return null;
  return (
    <section
      data-testid="lesson-source-review"
      aria-label="Lesson source checks"
      className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <h3 className="font-bold">
        Before teaching: check {items.length} {items.length === 1 ? 'lesson' : 'lessons'}
      </h3>
      <p className="mt-1">Files can be generated while source checks remain unfinished.</p>
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li key={item.lessonIndex}>
            <p className="font-semibold">
              Lesson {item.lessonIndex + 1}: {item.title.replace(/^Lesson\s+\d+:\s*/i, '')}
            </p>
            <p className="mt-1">{item.message}</p>
            {onIssueClick && (
              <button
                type="button"
                onClick={() => onIssueClick(item)}
                className="mt-1 rounded underline underline-offset-2 focus-visible:outline focus-visible:outline-2"
              >
                Check lesson {item.lessonIndex + 1} sources
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3">
        Check the listed reading against the lesson claims. Add the relevant source material in Agent before requesting
        a targeted revision. Your existing materials remain available.
      </p>
      {onOpenReport && (
        <button
          type="button"
          onClick={onOpenReport}
          className="mt-2 rounded font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2"
        >
          View all review notes
        </button>
      )}
    </section>
  );
}
