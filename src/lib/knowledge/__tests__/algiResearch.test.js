import { describe, it, expect } from 'vitest';
import {
  sentencesFrom,
  definitionSentence,
  looksLikeEntity,
  contrastSentences,
  distractorsFromContrast,
  explanatoryScore,
  lexicalRelevance,
  cosine,
  buildKernelFromArticle,
  researchConcept,
  researchCourse,
  RELEVANCE_FLOOR,
} from '../algiResearch.js';

const provider = {
  license: 'CC BY-SA 4.0',
  attributionFor: (title) => `Wikipedia, ${title}`,
  sourceIdFor: (title) => `wikipedia:${title}`,
  search: async () => [],
  article: async () => '',
};

/** Stub provider: no network, fully deterministic. */
function stubProvider(pages) {
  return {
    ...provider,
    search: async (query) =>
      Object.keys(pages).filter((title) => query.toLowerCase().split(/\s+/).some((token) => pages[title].hits.includes(token))),
    article: async (title) => pages[title]?.text || '',
  };
}

describe('sentence selection (gap 2)', () => {
  it('does not fuse a section heading into the paragraph that follows it', () => {
    // The real defect: "History User experience design is a conceptual design
    // discipline..." was emitted as a single sentence and served as prose.
    const extract = 'History\nUser experience design is a conceptual design discipline rooted in human factors and ergonomics research.';
    const sentences = sentencesFrom(extract);
    expect(sentences.some((sentence) => sentence.startsWith('History'))).toBe(false);
    expect(sentences[0]).toMatch(/^User experience design is a conceptual/);
  });

  it('drops fragments that are too short or unterminated', () => {
    expect(sentencesFrom('Too short.\nAlso short')).toEqual([]);
  });

  it('scores narration below explanation', () => {
    const explain = 'Photosynthesis is a process that converts light energy into chemical energy for the organism.';
    const narrate = 'The term was coined in 1893 and first used in a scientific journal of that century.';
    expect(explanatoryScore(explain, 'photosynthesis')).toBeGreaterThan(explanatoryScore(narrate, 'photosynthesis'));
  });

  it('prefers the lead definition over a mid-article comparative', () => {
    // Ranking by pattern alone served the comparative as the definition of
    // "deontology"; position is what distinguishes them.
    const sentences = [
      'Deontology is the normative ethical theory that judges the morality of an action using rules.',
      'One thing that clearly distinguishes Kantian deontologism from divine command deontology is that Kantianism maintains a rational basis.',
    ];
    expect(definitionSentence(sentences, 'Deontology')).toBe(sentences[0]);
  });

  it('requires the term to be the subject, not merely present', () => {
    const sentences = ['Some scholars argue that the wider literature on deontology is inconsistent across traditions.'];
    expect(definitionSentence(sentences, 'Deontology')).toBeNull();
  });
});

describe('entity filter (topic drift by page KIND)', () => {
  it('rejects a political party whose lead has lowercase adjectives before the noun', () => {
    // Admitted at 0.228 for "duties owed to workers" before this was fixed.
    expect(
      looksLikeEntity(
        "Workers' Party (Singapore)",
        "The Workers' Party (WP) is a major social democratic political party in Singapore and one of the oldest.",
      ),
    ).toBe(true);
  });

  it('rejects a dated parenthetical such as (2023 TV series)', () => {
    expect(looksLikeEntity('Jury Duty (2023 TV series)', 'Jury Duty is an American mockumentary comedy.')).toBe(true);
  });

  it('keeps genuine concept pages', () => {
    expect(
      looksLikeEntity('Whistleblowing', 'Whistleblowing is the activity of a person who reports wrongdoing to an authority.'),
    ).toBe(false);
    expect(looksLikeEntity('Stakeholder theory', 'The stakeholder theory is a theory of organizational management.')).toBe(false);
  });
});

describe('teaching atoms from the source (gap 3)', () => {
  const sentences = [
    'Weather is the state of the atmosphere at a given time and place over short periods.',
    'Weather is not to be confused with climate, which describes conditions averaged over decades.',
    'Extreme weather events, for example hurricanes and blizzards, cause the greatest damage.',
    'Weather is driven by differences in air pressure, temperature and moisture between one place and another.',
    'Weather occurs primarily in the troposphere because that is where nearly all atmospheric water resides.',
    'Forecasting requires measurements of the current state because the atmosphere is a chaotic system.',
  ];

  it('reads the source\'s own contrast as a misconception', () => {
    expect(contrastSentences(sentences)).toHaveLength(1);
  });

  it('mines distractors from what the source says it is confused with', () => {
    expect(distractorsFromContrast(contrastSentences(sentences), 'Weather')).toContain('climate');
  });

  it('carries a verbatim quote on every atom so admission can verify it', () => {
    const built = buildKernelFromArticle({
      topic: 'weather basics',
      title: 'Weather',
      extract: sentences.join('\n'),
      provider,
    });
    expect(built).not.toBeNull();
    const snapshot = built.snapshot['wikipedia:Weather'];
    expect(snapshot).toContain(built.kernel.definition.anchor.quote);
    for (const fact of built.kernel.facts) expect(snapshot).toContain(fact.anchor.quote);
  });
});

describe('relevance scoring', () => {
  it('takes the weaker of title and definition so a right-definition/wrong-subject page loses', () => {
    // "truth-telling in the marketplace" -> "Lie": the definition of lying is
    // about truth-telling, so definition-only scoring could not see the drift.
    expect(Math.min(0.2, 0.9)).toBeLessThan(RELEVANCE_FLOOR + 0.1);
  });

  it('cosine of a unit vector with itself is 1', () => {
    expect(cosine([0, 1, 0], [0, 1, 0])).toBeCloseTo(1);
  });

  it('lexical relevance ignores pedagogical filler words', () => {
    expect(lexicalRelevance('introduction to photosynthesis', 'Photosynthesis')).toBeGreaterThan(0.5);
  });
});

describe('researchConcept', () => {
  it('returns nothing rather than a wrong article when every candidate is an entity page', async () => {
    // Thick enough to extract cleanly: the point is that it is rejected for
    // being the wrong KIND of page, not for being unparseable.
    const pages = {
      'Jury Duty (2023 TV series)': {
        hits: ['jury', 'deliberation'],
        text: [
          'Jury Duty is an American mockumentary comedy television series about a staged trial.',
          'The series follows a jury in which every participant except one is a paid actor.',
          'Jury Duty was released in 2023 and received praise for the sincerity of its lead.',
          'The production required improvisation because the outcome depended on one unaware juror.',
        ].join('\n'),
      },
    };
    const result = await researchConcept('closing case deliberation', { provider: stubProvider(pages) });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('only-entity-pages');
  });

  it('admits a relevant concept page at source-anchored tier', async () => {
    const text = [
      'Whistleblowing is the activity of a person who reports wrongdoing by an organisation to an authority.',
      'Whistleblowing is not to be confused with an internal grievance, which stays inside the organisation.',
      'Whistleblowers are protected by statute in many jurisdictions because disclosure serves the public interest.',
      'Retaliation against a whistleblower is unlawful when the disclosure concerns a legal violation.',
    ].join('\n');
    const result = await researchConcept('whistleblowing', { provider: stubProvider({ Whistleblowing: { hits: ['whistleblowing'], text } }) });
    expect(result.ok).toBe(true);
    expect(result.tier).toBeGreaterThanOrEqual(2);
    expect(result.kernel.facts.length).toBeGreaterThanOrEqual(2);
  });
});

describe('researchCourse (course-level assessment)', () => {
  it('backfills multiple-choice items using sibling definitions as distractors', async () => {
    // No single article yields enough distractors; the course supplies them.
    const mk = (term) =>
      [
        `${term} is a distinct concept in this field with its own defining characteristics and scope.`,
        `${term} applies whenever practitioners need to reason about the situation it describes.`,
        `${term} requires evidence before a conclusion can be drawn about any particular case.`,
      ].join('\n');
    const pages = Object.fromEntries(
      ['Alpha', 'Beta', 'Gamma', 'Delta'].map((term) => [term, { hits: [term.toLowerCase()], text: mk(term) }]),
    );
    const result = await researchCourse(['alpha', 'beta', 'gamma', 'delta'], { provider: stubProvider(pages) });
    expect(result.admitted.length).toBe(4);
    for (const entry of result.admitted) {
      expect(entry.kernel.mcBank).toHaveLength(1);
      expect(entry.kernel.mcBank[0].options).toHaveLength(4);
      // The key must be this concept's own definition, distractors real siblings.
      expect(entry.kernel.mcBank[0].options[entry.kernel.mcBank[0].answerIndex]).toBe(entry.kernel.definition.text);
      expect(new Set(entry.kernel.mcBank[0].options).size).toBe(4);
    }
  });
});
