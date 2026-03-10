import { describe, it, expect } from 'vitest';
import { detectExpectedLessons } from '../detectLessons';

describe('detectExpectedLessons', () => {
  // ── Null / empty input ──
  it('returns null with low confidence for empty input', () => {
    expect(detectExpectedLessons('')).toEqual({ expected: null, confidence: 'low', source: '' });
    expect(detectExpectedLessons(null)).toEqual({ expected: null, confidence: 'low', source: '' });
    expect(detectExpectedLessons(undefined)).toEqual({ expected: null, confidence: 'low', source: '' });
  });

  // ── Pattern 1a: "X-week" adjective form ──
  it('detects "12-week graduate seminar"', () => {
    const result = detectExpectedLessons('This is a 12-week graduate seminar on AI.');
    expect(result.expected).toBe(12);
    expect(result.confidence).toBe('high');
  });

  it('detects "15-week" hyphenated form', () => {
    const result = detectExpectedLessons('A 15-week course on data science.');
    expect(result.expected).toBe(15);
    expect(result.confidence).toBe('high');
  });

  // ── Pattern 1b: "X week course" ──
  it('detects "14 week semester"', () => {
    const result = detectExpectedLessons('This is a 14 week semester.');
    expect(result.expected).toBe(14);
    expect(result.confidence).toBe('high');
  });

  it('detects "10 week bootcamp"', () => {
    const result = detectExpectedLessons('A 10 week bootcamp on web development.');
    expect(result.expected).toBe(10);
    expect(result.confidence).toBe('high');
  });

  // ── Pattern 2: Range "Weeks 1-15" ──
  it('detects "Weeks 1-15"', () => {
    const result = detectExpectedLessons('Course covers Weeks 1-15 of the semester.');
    expect(result.expected).toBe(15);
    expect(result.confidence).toBe('high');
  });

  it('detects "Modules 1-10"', () => {
    const result = detectExpectedLessons('Content spans Modules 1-10.');
    expect(result.expected).toBe(10);
    expect(result.confidence).toBe('high');
  });

  it('detects "Weeks 1 through 12"', () => {
    const result = detectExpectedLessons('Weeks 1 through 12 are covered.');
    expect(result.expected).toBe(12);
    expect(result.confidence).toBe('high');
  });

  // ── Pattern 3: Distinct headers ──
  it('detects distinct Week headers', () => {
    const text = `
Week 1: Introduction
Week 2: Basics
Week 3: Advanced
Week 4: Applications
Week 5: Review
Week 6: Midterm
Week 7: Deep Dive
Week 8: Projects
    `;
    const result = detectExpectedLessons(text);
    expect(result.expected).toBe(8);
    expect(result.confidence).toBe('high');
  });

  it('detects module-only headers with medium confidence', () => {
    const text = `
Module 1: Introduction
Module 2: Foundations
Module 3: Applications
Module 4: Advanced
Module 5: Review
    `;
    const result = detectExpectedLessons(text);
    expect(result.expected).toBe(5);
    expect(result.confidence).toBe('medium');
  });

  // ── Pattern 5: Total count mentions ──
  it('detects "15 lessons" as total count', () => {
    const result = detectExpectedLessons('This course has 15 lessons covering all topics.');
    expect(result.expected).toBe(15);
    expect(result.confidence).toBe('medium');
  });

  it('detects "12 modules"', () => {
    const result = detectExpectedLessons('The program consists of 12 modules.');
    expect(result.expected).toBe(12);
    expect(result.confidence).toBe('medium');
  });

  // ── Edge cases ──
  it('ignores counts below 4', () => {
    const result = detectExpectedLessons('This is a 3-week workshop.');
    expect(result.expected).toBeNull();
  });

  it('ignores counts above 52', () => {
    const result = detectExpectedLessons('This is a 60-week program.');
    expect(result.expected).toBeNull();
  });

  it('returns low confidence when no pattern matches', () => {
    const result = detectExpectedLessons('An introductory course on philosophy.');
    expect(result.expected).toBeNull();
    expect(result.confidence).toBe('low');
  });
});
