import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

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

  it('hash-binds every exact automated-readiness benchmark score', () => {
    const fixture = JSON.parse(readFileSync('evaluation/automated-readiness/v1/cases.json', 'utf8'));
    const { canonicalSha256, ...canonical } = fixture;
    const observedSha256 = createHash('sha256').update(stableJson(canonical)).digest('hex');

    expect(canonicalSha256).toBe('fdc8b032e676ae7a7e9307731036b51a845eebe6eece68952f56d243c7d50d8a');
    expect(observedSha256).toBe(canonicalSha256);
    expect(fixture.cases.map((entry) => entry.expected.score)).toEqual([26, 59, 68]);
    expect(fixture.cases.every((entry) => Number.isFinite(entry.expected.score))).toBe(true);
  });
});
