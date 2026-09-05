import { describe, expect, it } from 'vitest';
import { buildContributionCandidate, stripForContribution } from '../contributionStrip.js';
import {
  buildVerificationEvent,
  instructorVerificationEligibility,
  isAcademicEmail,
} from '../instructorVerification.js';

const COURSE_CONTEXT = {
  courseName: 'Riverside Policy Seminar SOCW-5001',
  instructorName: 'Dr. Tian Xing',
  instructorEmail: 'tian.xing@riverside.edu',
  termLabel: 'Fall 2026',
  discipline: 'econ',
};

// A generated lesson payload mixing generic knowledge with course-specific data.
const GENERATED = {
  keyTerms: [
    {
      term: 'Price elasticity of demand',
      definition:
        'Price elasticity of demand is the percentage change in quantity demanded over the percentage change in price.',
      example: 'Insulin has highly inelastic demand because patients have no substitute.',
      misconception: 'Students confuse the slope of the demand curve with its elasticity.',
    },
  ],
  facts: [
    { text: 'Demand is elastic when the absolute value of elasticity exceeds one.' },
    // Course-specific contamination that MUST be dropped:
    { text: 'In the Riverside Policy Seminar SOCW-5001 students analyze the campus dining case.' },
    { text: 'Dr. Tian Xing will grade the Fall 2026 memo by week six.' },
  ],
};

describe('contributionStrip (privacy boundary, red-team)', () => {
  it('keeps generic knowledge and drops every course-specific string', () => {
    const { kernel, dropped } = stripForContribution(GENERATED, COURSE_CONTEXT);
    expect(kernel).toBeTruthy();
    const serialized = JSON.stringify(kernel).toLowerCase();

    // Generic disciplinary knowledge survives.
    expect(serialized).toContain('elasticity');
    expect(kernel.facts.some((f) => f.text.includes('absolute value'))).toBe(true);

    // No course-specific token may survive anywhere in the kernel.
    expect(serialized).not.toContain('riverside');
    expect(serialized).not.toContain('socw-5001');
    expect(serialized).not.toContain('tian xing');
    expect(serialized).not.toContain('fall 2026');
    expect(serialized).not.toContain('dining case');
    expect(dropped.some((d) => d.startsWith('forbidden:'))).toBe(true);
  });

  it('never contributes scenario, assignment, or discussion fields even if present', () => {
    const withCourseLayer = {
      ...GENERATED,
      scenario: { setup: 'Riverside campus dining raised prices last term.' },
      assignmentCore: { taskDescription: 'Write a memo to the Riverside provost.' },
      discussionPrompt: { prompt: 'Should Riverside raise dining prices?' },
    };
    const { kernel } = stripForContribution(withCourseLayer, COURSE_CONTEXT);
    const serialized = JSON.stringify(kernel);
    expect(serialized).not.toMatch(/scenario|assignment|discussion|provost|dining/i);
  });

  it('returns null when nothing contributable remains after stripping', () => {
    const allCourseSpecific = {
      keyTerms: [
        { term: 'Riverside Policy Seminar SOCW-5001', definition: 'The Fall 2026 Riverside seminar by Dr. Tian Xing.' },
      ],
      facts: [{ text: 'Dr. Tian Xing teaches the Riverside seminar.' }],
    };
    expect(stripForContribution(allCourseSpecific, COURSE_CONTEXT).kernel).toBeNull();
  });

  it('builds a T0 candidate envelope for the moderation queue', () => {
    const candidate = buildContributionCandidate(GENERATED, COURSE_CONTEXT, {
      provider: 'openai',
      modelId: 'gpt-5-mini',
    });
    expect(candidate.tier).toBe(0);
    expect(candidate.kernel.id).toMatch(/^econ\//);
    expect(candidate.meta.generatedBy).toBe('openai');
  });
});

describe('instructorVerification', () => {
  it('recognizes academic emails and rejects the rest', () => {
    expect(isAcademicEmail('prof@nyu.edu')).toBe(true);
    expect(isAcademicEmail('lecturer@ox.ac.uk')).toBe(true);
    expect(isAcademicEmail('teacher@uni.edu.au')).toBe(true);
    expect(isAcademicEmail('person@gmail.com')).toBe(false);
    expect(isAcademicEmail('notanemail')).toBe(false);
  });

  it('gates verification eligibility on a signed-in, verified academic user', () => {
    expect(instructorVerificationEligibility(null).eligible).toBe(false);
    expect(instructorVerificationEligibility({ email: 'p@gmail.com', emailVerified: true }).eligible).toBe(false);
    expect(instructorVerificationEligibility({ email: 'p@nyu.edu', emailVerified: false }).eligible).toBe(false);
    expect(instructorVerificationEligibility({ email: 'p@nyu.edu', emailVerified: true }).eligible).toBe(true);
  });

  it('builds low-PII verification events (institution domain only)', () => {
    const user = { email: 'prof@nyu.edu', emailVerified: true };
    const confirm = buildVerificationEvent({
      user,
      conceptId: 'econ/price-elasticity-of-demand',
      rev: 1,
      verdict: 'confirm',
    });
    expect(confirm.ok).toBe(true);
    expect(confirm.event.institutionDomain).toBe('nyu.edu');
    expect(JSON.stringify(confirm.event)).not.toContain('prof@');

    const ineligible = buildVerificationEvent({
      user: { email: 'x@gmail.com', emailVerified: true },
      conceptId: 'a/b',
      verdict: 'confirm',
    });
    expect(ineligible.ok).toBe(false);
  });
});
