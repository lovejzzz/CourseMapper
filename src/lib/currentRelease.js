import { APP_VERSION } from './appVersion.js';

/** Current copy stays small; prior release details load with the changelog. */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'September 8, 2026',
  title: 'Linked Materials, Reliable Revisions',
  landingTitle: 'EDUTOOL V0.19.99: Linked Materials, Reliable Revisions',
  highlights: [
    'Keep reviewed tasks, answers and scoring aligned when regenerating related materials, with protected teacher edits and recoverable review drafts.',
    'Preserve complete lesson objectives and original source records. Improve worked examples, feedback and student-copy exports.',
    'Keep local Scion, the 0.18.7 interface and existing export choices. This stabilization release does not claim the unfinished v0.20 roadmap or general classroom readiness.',
  ],
  landingHighlights: [
    'Keep reviewed task materials in sync.',
    'Preserve teacher edits and source-review drafts.',
    'Use local Scion with the familiar workspace.',
  ],
};
