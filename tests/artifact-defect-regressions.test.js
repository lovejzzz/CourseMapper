import { describe, expect, it } from 'vitest';
import { ARTIFACT_PATTERNS } from '../src/lib/quality/artifactDefectPatterns.js';

function pattern(name) {
  const entry = ARTIFACT_PATTERNS.find((candidate) => candidate.name === name);
  expect(entry, `missing defect pattern ${name}`).toBeTruthy();
  return entry.regex;
}

describe('browser-discovered artifact defect regressions', () => {
  it('catches malformed one-the joins and plural possessives', () => {
    expect('Arrive ready to cite one the lesson example.').toMatch(pattern('slot-grammar-one-the'));
    expect('Have students mark one the lesson detail.').toMatch(pattern('slot-grammar-one-the'));
    expect('Identify one the lesson detail worth testing.').toMatch(pattern('slot-grammar-one-the'));
    expect("Mark where Seasons's evidence is visible.").toMatch(pattern('malformed-plural-possessive'));
    expect("The Thousand and One Nights's narrative frame is visible.").toMatch(pattern('malformed-plural-possessive'));
    expect("Earth's rotation provides the evidence.").not.toMatch(pattern('malformed-plural-possessive'));
    expect("Odysseus's account changes the reader's judgment.").not.toMatch(pattern('malformed-plural-possessive'));
    expect("James's notes preserve the passage context.").not.toMatch(pattern('malformed-plural-possessive'));
  });

  it('catches assessment sentence seams and internal modality ids', () => {
    expect('The Week 3 reflection. is formative practice.').toMatch(pattern('assessment-sentence-seam'));
    expect('Close with a one-line check. Is this fact true?').not.toMatch(pattern('assessment-sentence-seam'));
    expect('Trace the evidence into the lesson task., then test the alternative.').toMatch(
      pattern('period-comma-seam'),
    );
    expect('Posner et al., 1982').not.toMatch(pattern('period-comma-seam'));
    expect('Use retrieval practice, e.g., a one-minute check.').not.toMatch(pattern('period-comma-seam'));
    expect('Which lecture-exam evidence choice holds up?').toMatch(pattern('internal-lecture-exam'));
    expect('The lecture exam uses an answer key.').not.toMatch(pattern('internal-lecture-exam'));
  });

  it('catches the subject-free discussion frame seen in the browser audit', () => {
    expect(
      'Which interpretation of the lesson is best supported by the lesson case example, and what detail could change that conclusion?',
    ).toMatch(pattern('generic-discussion-prompt'));
    expect('Which interpretation of lunar phases is supported by the half-lit Moon model?').not.toMatch(
      pattern('generic-discussion-prompt'),
    );
  });

  it('catches browser-rendered objectives clipped before their predicate object', () => {
    expect('Analyze a passage and explain how one formal choice shapes.').toMatch(
      pattern('clipped-formal-choice-objective'),
    );
    expect('Can you explain how one formal choice?').toMatch(pattern('clipped-formal-choice-objective'));
    expect('Analyze a passage and explain how one formal choice shapes its meaning.').not.toMatch(
      pattern('clipped-formal-choice-objective'),
    );
  });
});
