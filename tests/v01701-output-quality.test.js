import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { resolvePreciseDisciplineLens } from '../src/lib/courseCompilerLensProfiles.js';
import { getContentFallbackTelemetry, resetContentFallbackTelemetry } from '../src/lib/contentFallbackTelemetry.js';
import { PIPELINE_FEATURES } from '../scripts/hybridPipelineAudit.mjs';
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
    let blueprintLensDefaultHits = 0;
    let deliverableCompileLensDefaultHits = 0;
    for (const brief of CROSS_PACKAGE_UNTUNED_BRIEFS) {
      const evidence = [brief.courseName, ...brief.lessonTitles].join(' ');
      expect(resolvePreciseDisciplineLens(evidence)).toBeNull();

      resetContentFallbackTelemetry();
      const blueprint = buildCourseBlueprint(buildUntunedBriefCourseMap(brief));
      const blueprintHits = Number(getContentFallbackTelemetry()['lens-default']?.hits || 0);
      compileBlueprintDeliverables(blueprint, PIPELINE_FEATURES, { configMap: {} });
      const totalHits = Number(getContentFallbackTelemetry()['lens-default']?.hits || 0);
      blueprintLensDefaultHits += blueprintHits;
      deliverableCompileLensDefaultHits += totalHits - blueprintHits;
      if (totalHits > 0) packagesWithLensDefault++;
    }
    expect(blueprintLensDefaultHits).toBe(20);
    expect(deliverableCompileLensDefaultHits).toBe(10);
    expect(blueprintLensDefaultHits + deliverableCompileLensDefaultHits).toBe(30);
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
