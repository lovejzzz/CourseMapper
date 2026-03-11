/**
 * Tests for slideTextFit.js — element tracker (bounds/overlap validation).
 * The createElementTracker function is pure logic that does not require
 * Canvas or DOM APIs.
 */
import { describe, it, expect } from 'vitest';
import { createElementTracker, SLIDE_W, SLIDE_H } from '../exporters/slideTextFit';

// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════

describe('slide constants', () => {
  it('has standard 16:9 dimensions', () => {
    expect(SLIDE_W).toBe(10);
    expect(SLIDE_H).toBe(5.625);
    // Verify 16:9 ratio
    expect(SLIDE_W / SLIDE_H).toBeCloseTo(16 / 9, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createElementTracker — bounds checking
// ═════════════════════════════════════════════════════════════════════════════

describe('createElementTracker — bounds', () => {
  it('returns no warnings for elements within bounds', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 0.5, y: 0.5, w: 4, h: 2, label: 'title' });
    tracker.add({ x: 5, y: 0.5, w: 4.5, h: 2, label: 'subtitle' });
    const warnings = tracker.validate();
    expect(warnings).toHaveLength(0);
  });

  it('detects element extending past right edge', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 8, y: 0, w: 3, h: 1, label: 'wide box' });
    const warnings = tracker.validate();
    expect(warnings.some(w => w.includes('[OOB]') && w.includes('wide box') && w.includes('right'))).toBe(true);
  });

  it('detects element extending past bottom edge', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 0, y: 4, w: 2, h: 2, label: 'tall box' });
    const warnings = tracker.validate();
    expect(warnings.some(w => w.includes('[OOB]') && w.includes('tall box') && w.includes('below'))).toBe(true);
  });

  it('allows elements exactly at the boundary (within 0.05 tolerance)', () => {
    const tracker = createElementTracker();
    // x + w = 10.04, which is within 0.05 tolerance of SLIDE_W (10)
    tracker.add({ x: 0, y: 0, w: 10.04, h: 5.625, label: 'full slide' });
    const warnings = tracker.validate();
    expect(warnings).toHaveLength(0);
  });

  it('flags elements just beyond tolerance', () => {
    const tracker = createElementTracker();
    // x + w = 10.06, which exceeds SLIDE_W + 0.05
    tracker.add({ x: 0, y: 0, w: 10.06, h: 1, label: 'too wide' });
    const warnings = tracker.validate();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('detects both right and bottom overflow simultaneously', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 9, y: 5, w: 2, h: 2, label: 'corner box' });
    const warnings = tracker.validate();
    expect(warnings.filter(w => w.includes('[OOB]'))).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createElementTracker — overlap detection
// ═════════════════════════════════════════════════════════════════════════════

describe('createElementTracker — overlap', () => {
  it('detects overlapping elements', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 0, y: 0, w: 5, h: 3, label: 'box A' });
    tracker.add({ x: 4, y: 2, w: 5, h: 3, label: 'box B' });
    const warnings = tracker.validate();
    expect(warnings.some(w => w.includes('[OVERLAP]') && w.includes('box A') && w.includes('box B'))).toBe(true);
  });

  it('does not flag non-overlapping elements', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 0, y: 0, w: 3, h: 2, label: 'left' });
    tracker.add({ x: 5, y: 0, w: 3, h: 2, label: 'right' });
    const warnings = tracker.validate();
    expect(warnings.filter(w => w.includes('[OVERLAP]'))).toHaveLength(0);
  });

  it('does not flag elements that share an edge but do not overlap', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 0, y: 0, w: 5, h: 3, label: 'left' });
    tracker.add({ x: 5, y: 0, w: 5, h: 3, label: 'right' });
    const warnings = tracker.validate();
    expect(warnings.filter(w => w.includes('[OVERLAP]'))).toHaveLength(0);
  });

  it('detects complete containment as overlap', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 1, y: 1, w: 8, h: 3, label: 'outer' });
    tracker.add({ x: 3, y: 2, w: 2, h: 1, label: 'inner' });
    const warnings = tracker.validate();
    expect(warnings.some(w => w.includes('[OVERLAP]'))).toBe(true);
  });

  it('detects all pairwise overlaps among multiple elements', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 0, y: 0, w: 5, h: 5, label: 'A' });
    tracker.add({ x: 4, y: 0, w: 5, h: 5, label: 'B' });
    tracker.add({ x: 2, y: 2, w: 3, h: 3, label: 'C' });
    const warnings = tracker.validate();
    const overlaps = warnings.filter(w => w.includes('[OVERLAP]'));
    // A-B overlap, A-C overlap, B-C overlap = 3 pairs
    expect(overlaps).toHaveLength(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// createElementTracker — empty / single element
// ═════════════════════════════════════════════════════════════════════════════

describe('createElementTracker — edge cases', () => {
  it('returns no warnings with no elements', () => {
    const tracker = createElementTracker();
    expect(tracker.validate()).toEqual([]);
  });

  it('tracks elements in the elements array', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 1, y: 1, w: 2, h: 2, label: 'test' });
    expect(tracker.elements).toHaveLength(1);
    expect(tracker.elements[0].label).toBe('test');
  });

  it('single in-bounds element produces no warnings', () => {
    const tracker = createElementTracker();
    tracker.add({ x: 2, y: 2, w: 3, h: 2, label: 'solo' });
    expect(tracker.validate()).toEqual([]);
  });
});
