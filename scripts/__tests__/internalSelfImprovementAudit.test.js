import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SELF_IMPROVEMENT_FIXTURES,
  auditSelfImprovementFixture,
  buildInternalSelfImprovementAudit,
  renderInternalSelfImprovementMarkdown,
} from '../internalSelfImprovementAudit.mjs';

function fakeRuntime({ compiledText, blueprint = null }) {
  return {
    buildCourseBlueprint: (courseMap) => blueprint || { courseMap },
    getBlueprintCompiledFeatures: (features) => features,
    compileBlueprintDeliverables: (_blueprint, features) =>
      Object.fromEntries(features.map((featureId) => [featureId, { text: compiledText }])),
    validateDeliverableGeneration: () => ({ valid: true, blockers: [] }),
    findPublishabilityPlaceholders: () => [],
  };
}

describe('internal self-improvement audit', () => {
  it('blocks when an adversarial fixture loses required review-boundary signals', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({ compiledText: 'Students complete polished activities with no local review boundary.' }),
      features: ['lessonPlans'],
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers).toBeGreaterThan(0);
    expect(result.findings.some((finding) => finding.check === 'review-boundary')).toBe(true);
  });

  it('passes when compiled output keeps required review actions visible', async () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const payload = await buildInternalSelfImprovementAudit({
      fixtures: [fixture],
      runtime: fakeRuntime({
        compiledText:
          'Before publication, confirm official dates with the local calendar and confirm assessment weights with the instructor grading decision.',
      }),
      features: ['lessonPlans'],
    });

    expect(payload.summary.status).toBe('pass');
    expect(payload.summary.blockers).toBe(0);
    expect(payload.summary.warnings).toBe(0);
    expect(payload.summary.receiptCount).toBe(1);
    expect(payload.results[0].inputRiskCount).toBeGreaterThan(0);
    expect(payload.results[0].compactReceipt.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'compiled', label: 'Compiled' }),
        expect.objectContaining({ id: 'live-calls', value: '0' }),
      ]),
    );
  });

  it('blocks impossible timing with lesson artifact and repair path context', () => {
    const fixture = DEFAULT_SELF_IMPROVEMENT_FIXTURES[0];
    const result = auditSelfImprovementFixture({
      fixture,
      runtime: fakeRuntime({
        compiledText:
          'Confirm official dates with the registrar and confirm assessment weights before students receive the package.',
        blueprint: {
          lessons: [
            {
              lessonNumber: 1,
              title: 'Lesson 1: Overloaded simulation',
              studentArtifact: 'simulation readiness packet',
              workloadEstimate: { totalStudentMinutes: 900, inClassMinutes: 300 },
              classSessionPlan: { plannedMinutes: 300, feasibilityStatus: 'impossible' },
            },
          ],
          compilerPath: { adaptiveSafety: { locallyRepairedLessonCount: 0 } },
          qualitySignals: { sourceGroundedLessonCount: 1 },
        },
      }),
      features: ['lessonPlans'],
    });

    expect(result.status).toBe('blocked');
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          check: 'timing-workload',
          severity: 'blocker',
          lessonTitle: 'Lesson 1: Overloaded simulation',
          artifact: 'simulation readiness packet',
          repairPath: expect.stringContaining('Adjust the lesson workload'),
        }),
      ]),
    );
  });

  it('renders a concise report with fixture matrix and findings', async () => {
    const payload = await buildInternalSelfImprovementAudit({
      fixtures: [DEFAULT_SELF_IMPROVEMENT_FIXTURES[0]],
      runtime: fakeRuntime({
        compiledText:
          'Confirm official dates with the registrar and confirm assessment weights before students receive the package.',
      }),
      features: ['lessonPlans'],
    });

    const markdown = renderInternalSelfImprovementMarkdown(payload);

    expect(markdown).toContain('# CourseMapper Internal Self-Improvement Audit');
    expect(markdown).toContain('## Fixture Matrix');
    expect(markdown).toContain('## Compact Receipt Matrix');
    expect(markdown).toContain('## Accepted Risks');
    expect(markdown).toContain('sparse-official-dates-and-assessments');
  });
});
