import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('CourseMapper concierge pilot offer', () => {
  it('states the exact paid scope and uses a non-submitting project inquiry handoff', () => {
    const landing = read('src/screens/Landing.jsx');
    const normalizedLanding = landing.replace(/\s+/g, ' ');

    expect(landing).toContain('data-testid="concierge-pilot-offer"');
    expect(landing).toContain('Prefer a finished draft? Try the $10 pilot.');
    expect(normalizedLanding).toContain('one course map, one lesson plan, and one revision within 48 hours');
    expect(landing).toContain('AI-assisted; you keep final academic judgment.');
    expect(landing).toContain('data-testid="concierge-pilot-sample"');
    expect(landing).toContain('href="/pilot-sample.html"');
    expect(landing).toContain('issues/new?template=coursemapper-pilot.yml');
    expect(landing).toContain('rel="noopener noreferrer"');
    expect(landing).not.toContain('paypal.me/');
    expect(landing).not.toContain('@gmail.com');
  });

  it('publishes a reviewable synthetic sample without implying customer results', () => {
    const sample = read('public/pilot-sample.html');
    const normalizedSample = sample.replace(/\s+/g, ' ');

    expect(sample).toContain('CourseMapper $10 pilot — synthetic sample deliverable');
    expect(sample).toContain('Synthetic example:');
    expect(normalizedSample).toContain('this was not produced from a customer submission');
    expect(sample).toContain('Deliverable 1');
    expect(sample).toContain('Course map');
    expect(sample).toContain('Deliverable 2');
    expect(sample).toContain('Lesson plan — Week 2: Evaluating AI output');
    expect(normalizedSample).toContain(
      'within 48 hours after scope, payment, and usable source material are confirmed',
    );
    expect(sample).toContain('issues/new?template=coursemapper-pilot.yml');
    expect(sample).toContain('The GitHub inquiry is public');
    expect(sample).not.toContain('xingpicture@gmail.com');
  });

  it('keeps the payout address out of every public customer-facing surface', () => {
    for (const path of [
      'src/screens/Landing.jsx',
      'src/pages/Contact.jsx',
      'src/pages/PrivacyPolicy.jsx',
      'src/pages/TermsOfService.jsx',
    ]) {
      expect(read(path)).not.toContain('xingpicture@gmail.com');
    }
  });

  it('publishes a bounded public inquiry form without requesting private course materials', () => {
    const form = read('.github/ISSUE_TEMPLATE/coursemapper-pilot.yml');

    expect(form).toContain('name: CourseMapper $10 pilot inquiry');
    expect(form).toContain('This GitHub issue will be public');
    expect(form).toContain('I will not post syllabus files, student records, or confidential material');
    expect(form).not.toContain('email');
  });
});
