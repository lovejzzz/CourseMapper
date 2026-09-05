import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const planningSource = readFileSync('src/lib/prepareInstructionalPlan.js', 'utf8');
const nativeGenerationSource = readFileSync('src/lib/nativeSkeletonGenerationRuntime.js', 'utf8');

describe('instructional plan pre-draft architecture', () => {
  it('authorizes exact source lesson identities on both generation routes before either can return a course map', () => {
    const sharedAuthorization = planningSource.indexOf('enforceInstructionalPlanContract(courseMap, sourceBrief)');
    const intentProjection = planningSource.indexOf('deriveCourseGraphFromCourseMap(authorizedCourseMap)');
    expect(sharedAuthorization).toBeGreaterThan(0);
    expect(intentProjection).toBeGreaterThan(sharedAuthorization);

    const nativeAuthorization = nativeGenerationSource.indexOf(
      'enforceInstructionalPlanContract(nativeMap, skeletonSource)',
    );
    const nativeCompletion = nativeGenerationSource.indexOf('return completeCourseMapGeneration(', nativeAuthorization);
    expect(nativeAuthorization).toBeGreaterThan(0);
    expect(nativeCompletion).toBeGreaterThan(nativeAuthorization);
    expect(nativeGenerationSource).toContain('nativeAuthoring.stashNativeSkeleton(null)');
    expect(nativeGenerationSource).toContain('authorizedNativeMap');
  });
});
