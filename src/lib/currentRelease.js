import { APP_VERSION } from './appVersion.js';

/** Small current-release copy; historical details load with the changelog. */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'September 6, 2026',
  title: 'Shared Teaching Tasks, Precise Updates',
  landingTitle: 'EDUTOOL V0.19.0: Better Materials That Stay Connected',
  highlights: [
    'Update shared source inputs across materials while preserving teacher edits, reviewing conflicts, and undoing or restoring the complete change.',
    'Teach concrete reasoning with worked examples, a separate practice case, matching answers, diagnostic feedback and four-level rubrics. Improve real Word and PowerPoint exports.',
    'Keep local Scion, the original ten materials and the 0.18.7 interface. Publish the 30-case benchmark and actual model failures; broad source understanding and learning outcomes remain unverified.',
  ],
  landingHighlights: [
    'Keep source edits and material answers connected.',
    'Use specific tasks, feedback and scoring criteria.',
    'Retain local Scion and the familiar interface.',
  ],
};
