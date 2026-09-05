import { describe, expect, it } from 'vitest';

import { assessScionKeyTermContract } from '../scionKeyTermContract.js';

function completeTerm(overrides = {}) {
  return {
    tr: 'Realism and Liberalism',
    df: 'Realism explains international outcomes through power under anarchy.',
    eg: 'An analyst compares a security dilemma before choosing an explanation.',
    mi: 'Students may assume that every international outcome has one cause.',
    cx: 'The correction is to test the explanation against the case evidence.',
    ...overrides,
  };
}

describe('Scion key-term composite integrity', () => {
  it('distinguishes quoting a rejected belief from repeating it as the correction', () => {
    const misconception = 'The population is the observed subset of a group';
    const term = completeTerm({
      tr: 'Population',
      df: 'A population is the entire group that a research question concerns.',
      eg: 'The 100 residents of the fictional town.',
      mi: misconception + '.',
      cx: `The claim “${misconception}” is incorrect. Use “A sample is the observed subset of a population” instead.`,
    });
    expect(assessScionKeyTermContract(term, { semanticProfile: 'strict-v6' }).issues).not.toContain(
      'correction-repeats-misconception',
    );
    expect(
      assessScionKeyTermContract(
        { ...term, cx: `The claim “${misconception}” is incorrect. Use “${misconception}” instead.` },
        { semanticProfile: 'strict-v6' },
      ).issues,
    ).toContain('correction-repeats-misconception');
  });
  it('admits a complete seven-word concept that exceeds the former 60-character limit', () => {
    const assessment = assessScionKeyTermContract(
      completeTerm({
        tr: 'Evidence-based policy memo with limitations and recommendations',
        df: 'A policy memo connects bounded evidence, affected stakeholders, limitations, and a feasible recommendation.',
        eg: 'An analyst cites a public dataset, states what it cannot prove, and recommends one feasible action.',
        mi: 'A polished recommendation is sufficient even when its evidence boundary and affected stakeholders are missing.',
        cx: 'The memo must connect the recommendation to bounded evidence, limitations, stakeholders, and feasibility.',
      }),
      { lessonTitle: 'Policy memo synthesis', semanticProfile: 'strict-v6' },
    );

    expect(assessment.issues).not.toContain('tr-length');
  });

  it('rejects a tone-marked Pinyin syllable mislabeled as an initial', () => {
    const assessment = assessScionKeyTermContract(
      completeTerm({
        tr: 'Pinyin initials',
        df: 'Pinyin initials are consonant sounds that begin Mandarin syllables.',
        eg: 'In 你好, nǐ is the Pinyin initial.',
        mi: 'Pinyin initials are the syllable-ending sounds.',
        cx: 'Initials begin syllables, while finals complete the remaining sound.',
      }),
      { lessonTitle: 'Pinyin and Tones', semanticProfile: 'strict-v6' },
    );
    expect(assessment.issues).toContain('example-confuses-pinyin-syllable-with-initial');

    const corrected = assessScionKeyTermContract(
      completeTerm({
        tr: 'Pinyin initials',
        df: 'Pinyin initials are consonant sounds that begin Mandarin syllables.',
        eg: 'In the syllable nǐ, n is the Pinyin initial.',
        mi: 'Pinyin initials are the syllable-ending sounds.',
        cx: 'Initials begin syllables, while finals complete the remaining sound.',
      }),
      { lessonTitle: 'Pinyin and Tones', semanticProfile: 'strict-v6' },
    );
    expect(corrected.issues).not.toContain('example-confuses-pinyin-syllable-with-initial');
  });

  it.each([
    'Here we',
    'In addition, visual rhetoric',
    'In the main experiment, the task',
    'Since visual and proprioceptive sensory modalities',
  ])('rejects source-sentence residue masquerading as the key term: %s', (tr) => {
    const assessment = assessScionKeyTermContract(completeTerm({ tr }), {
      lessonTitle: 'Ethical contextual interpretation',
      semanticProfile: 'source-strict-v6',
      sourceTerm: tr,
      knownFacts: [`${tr} is a phrase copied from a source sentence rather than a stable disciplinary concept.`],
    });

    expect(assessment.issues).toContain('term-is-source-sentence-fragment');
    expect(assessment.eligible).toBe(false);
  });

  it('rejects a joined concept label when its definition covers only one member', () => {
    const assessment = assessScionKeyTermContract(completeTerm(), {
      lessonTitle: 'Theories of International Relations',
      semanticProfile: 'strict-v6',
    });

    expect(assessment.eligible).toBe(false);
    expect(assessment.issues).toContain('definition-omits-composite-member');
  });

  it('admits a joined concept label when its definition distinguishes both members', () => {
    const assessment = assessScionKeyTermContract(
      completeTerm({
        df: 'Realism emphasizes power under anarchy, whereas liberalism explains how institutions support cooperation.',
      }),
      {
        lessonTitle: 'Theories of International Relations',
        semanticProfile: 'strict-v6',
      },
    );

    expect(assessment.issues).not.toContain('definition-omits-composite-member');
    expect(assessment.eligible).toBe(true);
  });

  it('keeps the bounded composite rule out of legacy compatibility mode', () => {
    const assessment = assessScionKeyTermContract(completeTerm(), {
      lessonTitle: 'Theories of International Relations',
      semanticProfile: 'legacy',
    });

    expect(assessment.issues).not.toContain('definition-omits-composite-member');
  });

  it('accepts a repeated definition only when the correction adds misconception-specific contrast', () => {
    const base = {
      tr: 'Learning objectives',
      df: 'Learning objectives are specific, actionable goals derived from the research plan.',
      eg: 'A team states what it must learn before selecting the study details.',
      mi: 'Learning objectives are vague hopes that should remain open to interpretation.',
      cx: 'Learning objectives must be specific, actionable goals derived from the research plan, not vague hopes.',
    };
    const options = {
      lessonTitle: 'Research planning',
      knownFacts: ['Team agreement on learning goals must precede the selection of specific study details.'],
      sourceTerm: 'Learning objectives',
      semanticProfile: 'source-strict-v6',
    };

    expect(assessScionKeyTermContract(base, options).issues).not.toContain('correction-repeats-definition');
    expect(
      assessScionKeyTermContract({ ...base, cx: `${base.df} This statement is not incorrect.` }, options).issues,
    ).toContain('correction-repeats-definition');
  });
});
