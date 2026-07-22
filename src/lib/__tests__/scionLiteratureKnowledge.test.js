import { describe, expect, it } from 'vitest';
import { resolveScionLiteratureKnowledge } from '../scionLiteratureKnowledge.js';

describe('Scion named-reading knowledge', () => {
  it('resolves The Odyssey to an attributed fact and concept contract', () => {
    const knowledge = resolveScionLiteratureKnowledge({ readings: ['The Odyssey'] });
    expect(knowledge).toMatchObject({
      source: {
        title: 'The Odyssey of Homer',
        license: 'Public domain in the USA',
        url: expect.stringContaining('gutenberg.org'),
      },
    });
    expect(knowledge.facts).toHaveLength(5);
    expect(knowledge.facts.join(' ')).toMatch(/invocation/i);
    expect(knowledge.concepts.map((concept) => concept.term)).toEqual([
      'invocation',
      'hospitality',
      'recognition scene',
      'embedded narration',
    ]);
  });

  it('corrects the finite-book/infinite-library distinction for The Library of Babel', () => {
    const knowledge = resolveScionLiteratureKnowledge({ readings: ['The Library of Babel'] });
    expect(knowledge.source).toMatchObject({ license: 'CC BY-SA 4.0' });
    expect(knowledge.facts.join(' ')).toMatch(/finite but unimaginably large/i);
    expect(knowledge.facts.join(' ')).not.toMatch(/infinite number of books/i);
    expect(knowledge.concepts.map((concept) => concept.term)).toContain('catalog problem');
  });

  it('does not attach a profile to an unknown or merely similar title', () => {
    expect(resolveScionLiteratureKnowledge({ readings: ['Odyssey-inspired marketing journeys'] })).toBeNull();
    expect(resolveScionLiteratureKnowledge({ readings: ['A Library of Babels'] })).toBeNull();
  });
});
