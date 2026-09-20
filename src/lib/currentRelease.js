import { APP_VERSION } from './appVersion.js';

/** Current copy stays small; prior release details load with the changelog. */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'September 20, 2026',
  title: 'External AI Authoring, WebMCP Debugging and Reliable Recovery',
  landingTitle: `EDUTOOL V${APP_VERSION}: Create, Review and Recover`,
  highlights: [
    'Create and revise linked lesson plans, assignments and rubrics with external AI; review drafts before applying them to your course.',
    'Use native WebMCP tools to inspect requests, diagnose content errors and verify repairs, with scoped access and version protection.',
    'Recover interrupted applications and full-cache saves, keep accounts isolated, and browse the complete release history.',
  ],
  landingHighlights: [
    'Author with external AI, then review and apply.',
    'Diagnose drafts through native WebMCP tools.',
    'Recover saved work and browse every release.',
  ],
};
