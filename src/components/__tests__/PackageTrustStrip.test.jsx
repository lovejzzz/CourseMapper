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

describe('PackageTrustStrip — alerts only since v0.14.9 B3', () => {
  it('renders ONLY the attention chips; provenance receipts stay out of the crown', () => {
    const html = renderToStaticMarkup(
      <PackageTrustStrip
        deliverables={deliverables}
        selectedFeatures={selectedFeatures}
        packageQualityPass={{ status: 'done', repairsApplied: 2 }}
      />,
    );
    expect(html).toContain('data-testid="package-trust-strip"');
    expect(html).toContain('1 stale');
    expect(html).toContain('1 failed');
    // Receipts (compiled / custom / auto-fixed / cited) live in the digest
    // and finish receipt now — never in the header.
    expect(html).not.toContain('compiled');
    expect(html).not.toContain('custom');
    expect(html).not.toContain('auto-fixed');
    expect(html).not.toContain('cited sources');
  });

  it('renders nothing when nothing needs attention — a calm package wears no chips', () => {
    const healthy = {
      syllabus: { status: 'done', data: {}, stale: false },
      quizBank: { status: 'done', data: {}, stale: false },
    };
    const html = renderToStaticMarkup(
      <PackageTrustStrip
        deliverables={healthy}
        selectedFeatures={['courseMap', 'syllabus', 'quizBank']}
        packageQualityPass={{ status: 'done', repairsApplied: 4 }}
      />,
    );
    expect(html).toBe('');
  });

  it('renders nothing before any deliverable exists', () => {
    const html = renderToStaticMarkup(
      <PackageTrustStrip deliverables={{}} selectedFeatures={['courseMap']} packageQualityPass={null} />,
    );
    expect(html).toBe('');
  });
});
