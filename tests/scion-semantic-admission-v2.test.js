import { describe, expect, it } from 'vitest';

import { repairScionMcItem } from '../src/lib/scionAnswerKeyAlignment.js';
import { assessScionKeyTerm, assessScionMcItem, assessScionPreferencePair } from '../src/lib/scionPreferenceGate.js';

const LIST_CLAIMS = [
  'A list is an ordered collection of values written in square brackets; each element has an index, beginning at 0.',
  'A list is written with square brackets holding comma-separated values.',
  'Individual elements are accessed directly using an index.',
];

describe('Scion strict semantic admission', () => {
  it('rejects a schema-ceiling option ending in a hard-truncated word fragment', () => {
    const item = {
      q: 'Which situation best fits a natural experiment?',
      op: [
        'A policy change affects one group but not another, letting you estimate a causal effect from-ob',
        'An experiment assigns people randomly and measures the result directly',
        'A survey asks people about their opinions after a change',
        'A group changes behavior for reasons unrelated to any external event',
      ],
      ai: 0,
      ex: 'A policy or external event affects one group, so comparable groups can support a causal estimate.',
    };

    expect(assessScionMcItem(item).issues).not.toContain('truncated-option');
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('truncated-option');

    item.op[0] = 'The GDP figures give a partial indicator, but they may miss unpaid work, distribution, and';
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('truncated-option');

    item.op[0] = 'Building a testable representation of the planned experience without every';
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('truncated-option');
  });

  it('rejects trailing list labels without treating code indexing as a label', () => {
    const labeled = {
      q: 'If a string has length five, which option gives the right-most character index?',
      op: ['0 [1]', '4 [2]', '5 [3]', 'len(s) [0]'],
      ai: 1,
      ex: 'Index 4 is correct because positions begin at zero. Index 5 would be outside the string.',
    };
    const code = {
      q: 'A program needs the second score from scores = [72, 81, 90]. Which expression retrieves it?',
      op: ['scores[0]', 'scores[1]', 'scores[2]', 'scores[3]'],
      ai: 1,
      ex: 'scores[1] is correct because list indexes begin at zero. scores[2] retrieves the third score.',
    };

    expect(assessScionMcItem(labeled, { semanticProfile: 'strict' }).issues).toContain('option-label-suffixes');
    expect(assessScionMcItem(code, { semanticProfile: 'strict' }).issues).not.toContain('option-label-suffixes');
  });

  it('rejects an answer key contradicted by a uniquely supported affirmative explanation', () => {
    const item = {
      q: 'If range(n) is used with a for loop, which integer sequence is produced?',
      op: ['It yields 0 through n.', 'It yields 1 through n.', 'It yields 0 through n-1.', 'It yields n through 2n.'],
      ai: 3,
      ex: 'The correct choice is that it yields 0 through n-1. The upper bound n is excluded.',
    };

    expect(assessScionMcItem(item).eligible).toBe(true);
    expect(assessScionMcItem(item, { semanticProfile: 'strict' }).issues).toContain('explanation-key-conflict');
    expect(repairScionMcItem(item).repairs).toHaveLength(0);
    const repaired = repairScionMcItem(item, { strictSourceAlignment: true });
    expect(repaired).toEqual({ item, repairs: [] });
  });

  it('uses a two-token question-to-claim anchor only when strict source support uniquely contradicts the key', () => {
    const sourceClaims = [
      'Earth is layered into a thin outer crust, a thick rocky mantle, and a metallic core.',
      'The crust is much thinner than the mantle.',
    ];
    const item = {
      q: "Which description accurately reflects the structural arrangement of Earth's interior layers?",
      op: [
        'The core is the outermost layer, followed by the mantle, and then the crust.',
        'The mantle is the outermost layer, followed by the core, and then the crust.',
        'The crust is the outermost layer, followed by the core, and then the mantle.',
        'Earth is layered into a thin outer crust, a thick rocky mantle, and a metallic core.',
      ],
      ai: 0,
      ex: 'The correct option describes the layering as crust, mantle, and core.',
    };

    expect(assessScionMcItem(item, { sourceClaims }).issues).not.toContain('source-answer-conflict');
    expect(assessScionMcItem(item, { sourceClaims, semanticProfile: 'strict' }).issues).toContain(
      'source-answer-conflict',
    );
    const repaired = repairScionMcItem(item, { sourceClaims, strictSourceAlignment: true });
    expect(repaired.item.ai).toBe(3);
    expect(repaired.repairs).toEqual([
      expect.objectContaining({
        pass: 'sourceAnswerAlignment',
        action: 'realigned',
        preferenceEvidence: expect.objectContaining({ supportedIndex: 3, declaredIndex: 0 }),
      }),
    ]);
  });

  it('rejects independently source-supported distractors, display labels, and leaked claim markers', () => {
    const item = {
      q: 'How are the relationships between successive notes of a scale referred to in music theory?',
      op: [
        'A) Intervals between successive notes',
        'B) Scale steps',
        'C) Ratios between sonic frequencies',
        'D) Differences in pitch between sounds',
      ],
      ai: 0,
      ex: 'Intervals between successive notes is correct (Claim 1). Scale steps are a related label.',
    };

    const strict = assessScionMcItem(item, {
      sourceClaims: ['Intervals between successive notes of a scale are called scale steps.'],
      semanticProfile: 'strict',
    });
    expect(strict.issues).toEqual(
      expect.arrayContaining(['option-label-prefixes', 'claim-marker-residue', 'multiple-source-supported-options']),
    );
  });

  it('rejects source-grounded key terms with token examples or self-repeating corrections', () => {
    const terse = {
      tr: 'Lithification',
      df: 'The process that turns sediment into rock through compaction and cementation.',
      eg: 'Sandstone formation.',
      mi: 'Only compaction is needed to turn sediment into rock.',
      cx: 'Compaction and cementation are both involved in lithification.',
    };
    const repetitive = {
      tr: 'Index access',
      df: 'A retrieval method that locates one list element by its numerical position.',
      eg: 'A program reads the second score with scores[1].',
      mi: 'A list element must be retrieved with a descriptive key.',
      cx: 'Elements use an index because elements use an index.',
    };

    expect(assessScionKeyTerm(terse, { knownFacts: LIST_CLAIMS }).eligible).toBe(true);
    expect(assessScionKeyTerm(terse, { knownFacts: LIST_CLAIMS, semanticProfile: 'strict' }).issues).toContain(
      'example-underdeveloped',
    );
    expect(assessScionKeyTerm(repetitive, { knownFacts: LIST_CLAIMS, semanticProfile: 'strict' }).issues).toContain(
      'cx-repeats-itself',
    );
  });

  it('keeps a clean applied item eligible', () => {
    const clean = {
      q: 'A program needs the third score from scores = [72, 81, 90]. Which expression retrieves it?',
      op: ['scores[0]', 'scores[1]', 'scores[2]', 'scores[3]'],
      ai: 2,
      ex: 'scores[2] is correct because list indexes begin at zero. scores[3] would request a fourth element.',
    };
    expect(assessScionMcItem(clean, { sourceClaims: LIST_CLAIMS, semanticProfile: 'strict' })).toMatchObject({
      eligible: true,
      issues: [],
    });
  });

  it('threads strict source semantics through pair-level corpus admission', () => {
    const conflicted = {
      q: 'If range(n) is used with a for loop, which integer sequence is produced?',
      op: ['It yields 0 through n.', 'It yields 1 through n.', 'It yields 0 through n-1.', 'It yields n through 2n.'],
      ai: 3,
      ex: 'The correct choice is that it yields 0 through n-1. The upper bound n is excluded.',
    };
    const clean = {
      ...conflicted,
      ai: 2,
    };
    const pair = assessScionPreferencePair(
      {
        kind: 'mc-item',
        chosen: conflicted,
        rejected: clean,
        preferenceEvidence: { kind: 'unsupported', verified: true },
      },
      {
        semanticProfile: 'strict',
        sourceClaims: ['range(n) yields integers from 0 through n-1 because the upper bound is excluded.'],
      },
    );

    expect(pair.chosen.issues).toContain('explanation-key-conflict');
    expect(pair.issues).toContain('chosen:explanation-key-conflict');
  });
});
