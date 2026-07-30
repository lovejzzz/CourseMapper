import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint } from '../src/lib/courseBlueprintCompiler.js';
import { resolvePreciseDisciplineLens } from '../src/lib/courseCompilerLensProfiles.js';
import { getContentFallbackTelemetry, resetContentFallbackTelemetry } from '../src/lib/contentFallbackTelemetry.js';
import { CROSS_PACKAGE_THIN_BRIEFS } from '../scripts/panels/crossPackageThinBriefs.mjs';
import {
  CROSS_PACKAGE_UNTUNED_BRIEFS,
  buildUntunedBriefCourseMap,
} from '../scripts/panels/crossPackageUntunedBriefs.mjs';

describe('V0.17.01 output-quality evidence', () => {
  it('keeps the untuned lens panel disjoint from the tuned thin panel', () => {
    const thinIds = new Set(CROSS_PACKAGE_THIN_BRIEFS.map((brief) => brief.id));
    const untunedIds = CROSS_PACKAGE_UNTUNED_BRIEFS.map((brief) => brief.id);

    expect(new Set(untunedIds).size).toBe(12);
    expect(untunedIds.every((id) => !thinIds.has(id))).toBe(true);
  });

  it('measures real lens-default fallthrough instead of matching precise panel lenses', () => {
    let packagesWithLensDefault = 0;
    for (const brief of CROSS_PACKAGE_UNTUNED_BRIEFS) {
      const evidence = [brief.courseName, ...brief.lessonTitles].join(' ');
      expect(resolvePreciseDisciplineLens(evidence)).toBeNull();

      resetContentFallbackTelemetry();
      buildCourseBlueprint(buildUntunedBriefCourseMap(brief));
      const telemetry = getContentFallbackTelemetry();
      if (Number(telemetry['lens-default']?.hits || 0) > 0) packagesWithLensDefault++;
    }
    expect(packagesWithLensDefault).toBeGreaterThanOrEqual(6);
    resetContentFallbackTelemetry();
  });
});
