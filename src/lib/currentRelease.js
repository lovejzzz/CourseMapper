import { APP_VERSION } from './appVersion.js';

/** Small current-release copy; historical details load with the changelog. */
export const CURRENT_RELEASE = {
  version: APP_VERSION,
  date: 'September 6, 2026',
  title: 'Count, Combine, and Respect What Is Unknown',
  landingTitle: 'EDUTOOL V0.19.1: Better Reasoning About Quantities',
  highlights: [
    'Combine group counts with the right denominator. Explain overlap bounds and distinguish count shares from measured quantities.',
    'Keep source calculations, independent practice, teacher answers and scoring connected across all ten materials.',
    'Retain local Scion and the 0.18.7 interface. Three exposed arithmetic failures are repaired; eight other source operations remain unsupported; broad source understanding and learning outcomes remain unverified.',
  ],
  landingHighlights: [
    'Calculate combined proportions correctly.',
    'Explain missing information and quantity limits.',
    'Keep matching practice, answers and rubrics.',
  ],
};
