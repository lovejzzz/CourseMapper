import { APP_VERSION } from './appVersion.js';

/** Small current-release copy; historical details load with the changelog. */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'September 5, 2026',
  title: 'Shared Tasks, Specific Answers',
  landingTitle: 'EDUTOOL V0.18.8: One Task Across Your Materials',
  highlights: [
    'Supported source-bound tasks share their question, reasoning, answer, error feedback and four-level rubric across the original ten material types.',
    'The same five-input benchmark improves from 13 to 5 detected defects. Two-session quality gaps remain; this is not a universal classroom-readiness claim.',
    'Scion remains local, the 0.18.7 interface stays in place, and cancelling new-course setup preserves the previous recoverable course.',
  ],
  landingHighlights: [
    'Keep tasks, answers and rubrics aligned.',
    'Preserve your course while trying a new setup.',
    'Keep the familiar interface and local Scion.',
  ],
};
