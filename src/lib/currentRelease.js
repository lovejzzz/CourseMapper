import { APP_VERSION } from './appVersion.js';

/** Small current-release copy; historical details load with the changelog. */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'September 6, 2026',
  title: 'Connected Lessons, Concrete Answers',
  landingTitle: 'EDUTOOL V0.18.9: Make Each Lesson Build on the Last',
  highlights: [
    'Keep distinct lesson objectives and connect a sourced diagnosis to the next design task, including after restore and single-lesson regeneration.',
    'Align task names, answers and rubric criteria across materials; replace generic quiz answers and empty slide concepts with source-specific reasoning.',
    'The unchanged five-input benchmark now passes 295 defect probes. This is a compiler replay, not proof of learning outcomes. Scion stays local and the 0.18.7 interface remains.',
  ],
  landingHighlights: [
    'Build the next task on the previous answer.',
    'Keep syllabus, questions and scoring aligned.',
    'Retain local Scion and the familiar interface.',
  ],
};
