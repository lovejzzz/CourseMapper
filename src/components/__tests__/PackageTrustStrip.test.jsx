import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PackageTrustStrip, { summarizePackageTrust } from '../PackageTrustStrip.jsx';

const deliverables = {
  syllabus: { status: 'done', data: {}, stale: false },
  quizBank: { status: 'done', data: {}, stale: true },
  custom_feedback: { status: 'done', data: {}, stale: false },
  rubrics: { status: 'error', data: null, error: 'failed' },
};
const selectedFeatures = ['courseMap', 'syllabus', 'quizBank', 'custom_feedback', 'rubrics'];

describe('summarizePackageTrust', () => {
  it('counts compiled, custom, stale, failed, and repairs', () => {
    const trust = summarizePackageTrust({
      deliverables,
      selectedFeatures,
      packageQualityPass: { status: 'done', repairsApplied: 3 },
    });
    expect(trust).toMatchObject({
      done: 3,
      compiled: 2,
      custom: 1,
      failed: 1,
      stale: 1,
      repairsApplied: 3,
    });
  });

  it('handles empty workspaces', () => {
    expect(summarizePackageTrust({})).toMatchObject({ done: 0, compiled: 0, failed: 0 });
  });
});

describe('PackageTrustStrip', () => {
  it('renders provenance chips for a generated package', () => {
    const html = renderToStaticMarkup(
      <PackageTrustStrip
        deliverables={deliverables}
        selectedFeatures={selectedFeatures}
        packageQualityPass={{ status: 'done', repairsApplied: 2 }}
      />,
    );
    expect(html).toContain('data-testid="package-trust-strip"');
    expect(html).toContain('2 compiled');
    expect(html).toContain('1 custom');
    expect(html).toContain('2 auto-fixed');
    expect(html).toContain('1 stale');
    expect(html).toContain('1 failed');
  });

  it('renders nothing before any deliverable exists', () => {
    const html = renderToStaticMarkup(
      <PackageTrustStrip deliverables={{}} selectedFeatures={['courseMap']} packageQualityPass={null} />,
    );
    expect(html).toBe('');
  });
});
