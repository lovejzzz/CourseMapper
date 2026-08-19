import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('CourseMapper concierge pilot offer', () => {
  it('states the exact paid scope and uses a non-submitting project inquiry handoff', () => {
    const landing = read('src/screens/Landing.jsx');

    expect(landing).toContain('data-testid="concierge-pilot-offer"');
    expect(landing).toContain('Prefer a finished draft? Try the $10 pilot.');
    expect(landing).toContain('one course map, one lesson plan, and one revision within 48 hours');
    expect(landing).toContain('AI-assisted; you keep final academic judgment.');
    expect(landing).toContain('issues/new?template=coursemapper-pilot.yml');
    expect(landing).toContain('rel="noopener noreferrer"');
    expect(landing).not.toContain('paypal.me/');
    expect(landing).not.toContain('@gmail.com');
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
