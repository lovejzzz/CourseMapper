import { CURRENT_RELEASE } from './releaseManifest.js';

export const LATEST_RELEASE = {
  version: CURRENT_RELEASE.version,
  date: CURRENT_RELEASE.date,
  title: CURRENT_RELEASE.landingTitle,
  highlights: CURRENT_RELEASE.landingHighlights,
};
