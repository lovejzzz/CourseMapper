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
});
