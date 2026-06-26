import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DigestCard from '../DigestCard';

const DIGEST = {
  observations: [
    {
      id: 'objective-coverage',
      observation: 'Lesson 2 objective has no clear echo in assessments.',
      whyItMatters: 'Assessment alignment should stay inspectable.',
      prompts: [],
    },
  ],
};

function cleanReadyPackage() {
  return {
    status: 'ready',
    blockers: 0,
    warnings: 0,
    receipt: {
      exportFailed: 0,
      exportWarningCount: 0,
    },
    quality: {
      status: 'graded',
      score: 100,
      grade: 'A',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    },
  };
}

describe('DigestCard', () => {
  it('renders clean-package observations as optional polish instead of warning attention', () => {
    const html = renderToStaticMarkup(
      <DigestCard digest={DIGEST} status="pending" onOpenInQueue={() => {}} packageQualityPass={cleanReadyPackage()} />,
    );

    expect(html).toContain('data-severity="info"');
    expect(html).toContain('Optional polish');
    expect(html).toContain('Polish');
    expect(html).not.toContain('Worth a look');
    expect(html).not.toContain('Review</span>');
  });

  it('keeps amber review treatment when the package is not clean-ready', () => {
    const html = renderToStaticMarkup(
      <DigestCard
        digest={DIGEST}
        status="pending"
        onOpenInQueue={() => {}}
        packageQualityPass={{ ...cleanReadyPackage(), warnings: 1 }}
      />,
    );

    expect(html).toContain('data-severity="warning"');
    expect(html).toContain('Worth a look');
    expect(html).toContain('Review');
  });
});
