import { describe, expect, it } from 'vitest';
import {
  buildPackageBlockerDomains,
  buildPackageFinishDomains,
  buildPackageWarningDomains,
} from '../packageFinishEvidence';

describe('package finish warning evidence', () => {
  it('assigns every warning to one named domain without double-counting source findings', () => {
    const quality = {
      status: 'graded',
      findings: [
        {
          severity: 'P1',
          dimension: 'citations',
          detail: 'One source reference is missing.',
        },
        {
          severity: 'P2',
          dimension: 'format',
          detail: 'One slide needs a visual scan.',
        },
      ],
    };
    const sourceEvidence = {
      schemaVersion: 1,
      reviewRequiredCount: 1,
      refCoverage: { missing: 1, danglingRefs: 0 },
      findings: [quality.findings[0]],
    };

    expect(
      buildPackageWarningDomains({
        readinessWarningCount: 2,
        retryWarningCount: 1,
        exportWarningCount: 1,
        quality,
        sourceEvidence,
      }),
    ).toEqual({
      schemaVersion: 1,
      readiness: 2,
      retry: 1,
      export: 1,
      quality: 1,
      source: 2,
      total: 7,
    });
  });

  it('owns structural, quality, and export blockers exactly once', () => {
    const quality = {
      status: 'graded',
      findingCounts: { p0: 2, p1: 0, p2: 0 },
      findings: [
        { severity: 'P0', dimension: 'safety', detail: 'First blocker.' },
        { severity: 'P0', dimension: 'identity', detail: 'Second blocker.' },
      ],
    };
    const readiness = {
      blockers: [
        { source: 'structure', message: 'A required file is missing.' },
        { source: 'qualityGate', message: 'The package has two P0 findings.' },
      ],
    };

    expect(buildPackageBlockerDomains({ readiness, quality, exportFailureCount: 1 })).toEqual({
      schemaVersion: 1,
      readiness: 1,
      quality: 2,
      export: 1,
      total: 4,
    });
  });

  it('does not misclassify an unavailable quality proof as an advisory', () => {
    expect(
      buildPackageWarningDomains({
        quality: { status: 'not-graded', reason: 'grader unavailable' },
      }),
    ).toEqual({
      schemaVersion: 1,
      readiness: 0,
      retry: 0,
      export: 0,
      quality: 0,
      source: 0,
      total: 0,
    });
  });

  it('owns an unavailable quality proof exactly once inside the blocker ledger', () => {
    expect(
      buildPackageBlockerDomains({
        readiness: {
          blockers: [{ source: 'qualityGate', message: 'Quality proof unavailable.' }],
        },
        quality: { status: 'not-graded', reason: 'grader unavailable' },
      }),
    ).toEqual({
      schemaVersion: 1,
      readiness: 0,
      quality: 1,
      export: 0,
      total: 1,
    });
  });

  it('assembles both canonical ledgers from the finalizer shape', () => {
    expect(
      buildPackageFinishDomains({
        readiness: {
          warnings: [{ source: 'structure' }],
          blockers: [{ source: 'qualityGate' }],
        },
        retryWarningCount: 1,
        exportWarningCount: 1,
        exportFailureCount: 0,
        quality: {
          status: 'graded',
          findingCounts: { p0: 1, p1: 0, p2: 0 },
          findings: [{ severity: 'P0', dimension: 'safety', detail: 'Fix this.' }],
        },
      }),
    ).toEqual({
      warningDomains: {
        schemaVersion: 1,
        readiness: 1,
        retry: 1,
        export: 1,
        quality: 0,
        source: 0,
        total: 3,
      },
      blockerDomains: {
        schemaVersion: 1,
        readiness: 0,
        quality: 1,
        export: 0,
        total: 1,
      },
    });
  });
});
