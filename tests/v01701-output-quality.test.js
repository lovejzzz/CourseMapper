import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
    let lensDefaultHits = 0;
    for (const brief of CROSS_PACKAGE_UNTUNED_BRIEFS) {
      const evidence = [brief.courseName, ...brief.lessonTitles].join(' ');
      expect(resolvePreciseDisciplineLens(evidence)).toBeNull();

      resetContentFallbackTelemetry();
      buildCourseBlueprint(buildUntunedBriefCourseMap(brief));
      const telemetry = getContentFallbackTelemetry();
      const hits = Number(telemetry['lens-default']?.hits || 0);
      lensDefaultHits += hits;
      if (hits > 0) packagesWithLensDefault++;
    }
    expect(lensDefaultHits).toBe(20);
    expect(packagesWithLensDefault).toBe(10);
    resetContentFallbackTelemetry();
  });

  it('binds the shipped untuned figures to a frozen canonical receipt', () => {
    const receipt = JSON.parse(readFileSync('evaluation/cross-package-texture/untuned-v0.17.01-receipt.json', 'utf8'));
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;

    expect(receipt).toMatchObject({
      schema: 'coursemapper.cross-package-texture.release-receipt.v1',
      appVersion: '0.17.01',
      profile: 'untuned',
      packageCount: 12,
      clusterCount: 468,
      lensDefaultHits: 30,
      packagesWithLensDefault: 10,
      unclassifiedPathCount: 0,
    });
    expect(receipt.canonicalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(scripts['audit:texture:cross-package:untuned']).toContain(
      '--receipt evaluation/cross-package-texture/untuned-v0.17.01-receipt.json',
    );
  });
});
