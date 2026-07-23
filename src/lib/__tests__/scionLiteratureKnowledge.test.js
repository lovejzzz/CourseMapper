import { describe, expect, it } from 'vitest';
import { resolveScionLiteratureKnowledge, resolveScionLiteratureSourceProfiles } from '../scionLiteratureKnowledge.js';

describe('Scion named-reading knowledge', () => {
  it('resolves The Odyssey to an attributed fact and concept contract', () => {
    const knowledge = resolveScionLiteratureKnowledge({ readings: ['The Odyssey'] });
    expect(knowledge).toMatchObject({
      source: {
        title: 'The Odyssey of Homer',
        license: 'Public domain in the USA',
        provider: 'gutenberg',
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

  it('returns every exact named-reading profile for source-ledger projection', () => {
    const profiles = resolveScionLiteratureSourceProfiles({
      readings: ['The Odyssey', 'Unprofiled course reader', 'The Library of Babel'],
    });

    expect(profiles.map((profile) => profile.source)).toEqual([
      expect.objectContaining({
        title: 'The Odyssey of Homer',
        provider: 'gutenberg',
        license: 'Public domain in the USA',
      }),
      expect.objectContaining({
        title: 'The Library of Babel',
        provider: 'wikipedia',
        license: 'CC BY-SA 4.0',
      }),
    ]);
  });

  it('covers the complete browser-audit World Literature reading sequence with attributed ledgers', () => {
    const profiles = resolveScionLiteratureSourceProfiles({
      readings: [
        'The Epic of Gilgamesh',
        'The Odyssey',
        'Antigone',
        'selected poems by Li Bai and Du Fu',
        'The Thousand and One Nights',
        'Dante’s Inferno',
        'Things Fall Apart',
        'The Library of Babel',
      ],
    });

    expect(profiles.map((profile) => profile.source.title)).toEqual([
      'Epic of Gilgamesh',
      'The Odyssey of Homer',
      'Antigone (Sophocles play)',
      'Tang poetry',
      'One Thousand and One Nights',
      'Inferno (Dante)',
      'Things Fall Apart',
      'The Library of Babel',
    ]);
    profiles.forEach((profile) => {
      expect(profile.facts).toHaveLength(5);
      expect(profile.concepts).toHaveLength(4);
      expect(profile.source).toMatchObject({
        provider: expect.stringMatching(/gutenberg|wikipedia/),
        license: expect.any(String),
        url: expect.stringMatching(/^https:\/\//),
      });
      expect(JSON.stringify(profile)).not.toMatch(/\b(?:page|line)\s+\d+|“[^”]{20,}”/i);
    });
  });
});
