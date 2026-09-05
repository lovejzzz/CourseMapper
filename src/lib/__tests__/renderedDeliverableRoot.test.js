import { describe, expect, it } from 'vitest';

import {
  renderedDeliverableCollection,
  renderedDeliverableCollectionKey,
  renderedDeliverableContentRoot,
} from '../renderedDeliverableRoot.js';

describe('renderedDeliverableRoot', () => {
  it.each([
    ['lessonPlans', 'plans', 'lessonPlans'],
    ['slideDecks', 'decks', 'slideDecks'],
    ['studyGuides', 'guides', 'studyGuides'],
  ])('uses canonical precedence for %s when dual roots coexist', (featureId, alias, canonical) => {
    const canonicalItems = [{ id: 'rendered' }];
    const data = { [canonical]: canonicalItems, [alias]: [{ id: 'stale' }] };

    expect(renderedDeliverableCollectionKey(featureId, data)).toBe(canonical);
    expect(renderedDeliverableCollection(featureId, data)).toBe(canonicalItems);
  });

  it.each([
    ['lessonPlans', 'plans'],
    ['slideDecks', 'decks'],
    ['studyGuides', 'guides'],
  ])('supports a legacy alias for %s-only payloads', (featureId, alias) => {
    const aliasItems = [{ id: 'rendered' }];

    expect(renderedDeliverableCollectionKey(featureId, { [alias]: aliasItems })).toBe(alias);
    expect(renderedDeliverableCollection(featureId, { [alias]: aliasItems })).toBe(aliasItems);
  });

  it.each([
    ['lessonPlans', 'plans', 'lessonPlans'],
    ['slideDecks', 'decks', 'slideDecks'],
    ['studyGuides', 'guides', 'studyGuides'],
  ])('ignores a malformed truthy alias for %s', (featureId, alias, canonical) => {
    const canonicalItems = [{ id: 'rendered' }];
    const data = { [alias]: { malformed: true }, [canonical]: canonicalItems };

    expect(renderedDeliverableCollectionKey(featureId, data)).toBe(canonical);
    expect(renderedDeliverableCollection(featureId, data)).toBe(canonicalItems);
  });

  it.each([
    ['lessonPlans', 'plans', 'lessonPlans'],
    ['slideDecks', 'decks', 'slideDecks'],
    ['studyGuides', 'guides', 'studyGuides'],
  ])('falls back to a valid alias when the canonical %s root is malformed', (featureId, alias, canonical) => {
    const aliasItems = [{ id: 'rendered' }];
    const data = { [canonical]: { malformed: true }, [alias]: aliasItems };

    expect(renderedDeliverableCollectionKey(featureId, data)).toBe(alias);
    expect(renderedDeliverableCollection(featureId, data)).toBe(aliasItems);
  });

  it('declares canonical quiz and FAQ roots before their legacy aliases', () => {
    expect(renderedDeliverableCollectionKey('quizBank', { quizBank: [], quizzes: [] })).toBe('quizBank');
    expect(renderedDeliverableCollectionKey('courseFaq', { courseFaq: [], faqs: [] })).toBe('courseFaq');
  });

  it('does not guess an incidental array for object-rooted or custom deliverables', () => {
    const data = { metadata: ['not rendered'], body: { title: 'Document' } };

    expect(renderedDeliverableCollectionKey('syllabus', data)).toBeNull();
    expect(renderedDeliverableCollectionKey('custom_brief', data)).toBeNull();
    expect(renderedDeliverableCollection('custom_brief', data)).toEqual([]);
    expect(renderedDeliverableContentRoot('syllabus', data)).toBe(data);
    expect(renderedDeliverableContentRoot('custom_brief', data)).toBe(data);
  });

  it('uses the exact inner document for a wrapped syllabus content root', () => {
    const syllabus = { title: 'Rendered syllabus' };
    const data = { metadata: ['not rendered'], syllabus };

    expect(renderedDeliverableContentRoot('syllabus', data)).toBe(syllabus);
  });

  it('gives a declared collection feature no authority when every declared root is absent', () => {
    const data = { metadata: { sourceEvidenceBrief: { claims: ['Not rendered'] } } };

    expect(renderedDeliverableCollection('studyGuides', data)).toEqual([]);
    expect(renderedDeliverableContentRoot('studyGuides', data)).toEqual([]);
  });
});
