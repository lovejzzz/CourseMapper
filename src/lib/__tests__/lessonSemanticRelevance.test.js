import { describe, expect, it } from 'vitest';

import {
  isLessonRelevantSemanticSurface,
  isLessonResearchSurfaceBound,
  quarantineSourceIdentityMismatchedEnrichment,
  semanticIdentityTokens,
  sourceIdentityScopeMismatch,
} from '../lessonSemanticRelevance.js';

describe('lesson semantic relevance', () => {
  it('distinguishes human-language lessons from computing-source false friends', () => {
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Waunana imperative language · Authentic Data Application',
        sourceIdentity: 'Imperative programming · https://en.wikipedia.org/wiki/Imperative_programming',
      }),
    ).toMatchObject({ mismatch: true, reason: 'human-language-computing-source-identity' });
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Programming languages and imperative programming',
        sourceIdentity: 'Imperative programming',
      }).mismatch,
    ).toBe(false);
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Natural language processing',
        sourceIdentity: 'Computer programming',
      }).mismatch,
    ).toBe(false);
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'First-language acquisition and semantic bootstrapping',
        sourceIdentity: 'Semantic Segmentation via Visual Domain Prompt in Remote Sensing Data',
      }),
    ).toMatchObject({ mismatch: true, reason: 'human-language-computer-vision-source-identity' });
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Computer vision and semantic segmentation',
        sourceIdentity: 'Semantic Segmentation via Visual Domain Prompt in Remote Sensing Data',
      }).mismatch,
    ).toBe(false);
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Language change and diachronic linguistics',
        sourceIdentity: 'Mutation — National Human Genome Research Institute Genetics Glossary',
      }),
    ).toMatchObject({ mismatch: true, reason: 'human-language-genetics-source-identity' });
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Genetic mutation and heredity',
        sourceIdentity: 'Mutation — National Human Genome Research Institute Genetics Glossary',
      }).mismatch,
    ).toBe(false);
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity:
          'Cross-Linguistic Comparison · Typological Approaches to Language Comparison · Comparative Analysis of Grammatical Structures',
        sourceIdentity:
          'Comparative linguistics · compares languages to establish historical relatedness and reconstruct proto-languages',
      }),
    ).toMatchObject({
      mismatch: true,
      reason: 'typological-language-historical-reconstruction-source-identity',
    });
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Diachronic language change and comparative reconstruction',
        sourceIdentity: 'Comparative linguistics reconstructs proto-languages from historical evidence',
      }).mismatch,
    ).toBe(false);
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Morphology · Word formation · Derivational processes',
        sourceIdentity: 'Word Formation',
        sourceContent: 'The Word Formation is a geologic formation in Texas with Permian strata.',
      }),
    ).toMatchObject({ mismatch: true, reason: 'human-language-geology-source-meaning' });
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Geology of Texas and Permian strata',
        sourceIdentity: 'Word Formation',
        sourceContent: 'The Word Formation is a geologic formation in Texas with Permian strata.',
      }).mismatch,
    ).toBe(false);
  });

  it('does not reinterpret verification notes as a citation identity', () => {
    const enrichment = {
      sourceFactAuthority: 'admitted-evidence-authority',
      kernel: {
        facts: [
          'Linguistic typology compares structural patterns across human languages.',
          'The same feature must be observed in each compared sample.',
          'A bounded sample cannot establish a universal claim.',
        ],
        provenance: {
          source: 'compiler-owned-exact-source-ledger',
          authority: 'admitted-evidence-authority',
          copiedFactsVerbatim: true,
          factCount: 3,
        },
      },
      conceptProvenance: {
        citations: [
          {
            displayTitle: 'Linguistic typology',
            topic: 'Cross-linguistic comparison',
            sourceUrl: 'https://example.edu/linguistic-typology',
            supportReceipt: {
              status: 'passed',
              note: 'The audit rejected an unrelated result about programming languages.',
            },
          },
        ],
      },
      evidenceAuthorityReceipt: {
        sources: [
          {
            title: 'Linguistic typology',
            topic: 'Cross-linguistic comparison',
            url: 'https://example.edu/linguistic-typology',
            supportReceipt: {
              note: 'Computer programming was an excluded neighboring discipline.',
            },
          },
        ],
      },
    };

    expect(
      quarantineSourceIdentityMismatchedEnrichment(
        {
          title: 'Lesson 12: Cross-Linguistic Comparison',
          keyConcepts: ['Linguistic typology'],
        },
        enrichment,
      ),
    ).toBe(enrichment);
  });
  it('treats overloaded graph language as generic unless the full identity matches', () => {
    expect(
      isLessonRelevantSemanticSurface('Graph theory', {
        title: 'Lesson 1: Picturing Distributions',
        sections: [{ topicSection: 'Graphs and Data Visualization' }],
      }),
    ).toBe(false);
    expect(
      isLessonRelevantSemanticSurface('Graph theory', {
        title: 'Lesson 1: Graph Theory',
        sections: [{ topicSection: 'Graph Theory' }],
      }),
    ).toBe(true);
  });

  it('normalizes linguistic to the generic language family before judging scope', () => {
    expect(semanticIdentityTokens('Linguistic prescription')).toEqual(['language', 'prescription']);
    expect(
      isLessonRelevantSemanticSurface('Linguistic prescription', {
        title: 'Lesson 1: Linguistic Evidence Basis',
        sections: [{ topicSection: 'Defining Linguistic Evidence' }],
      }),
    ).toBe(false);
  });

  it('treats two-way tables, contingency tables, and cross-tabulation as one bounded data object', () => {
    expect(semanticIdentityTokens('Two-Way Tables')).toEqual(['crosstab']);
    expect(semanticIdentityTokens('Contingency table')).toEqual(['crosstab']);
    expect(semanticIdentityTokens('Cross-tabulation')).toEqual(['crosstab']);
    expect(
      isLessonResearchSurfaceBound('Contingency table', {
        title: 'Lesson 6: Two-Way Tables',
        sections: [{ topicSection: 'Two-Way Tables Analysis' }],
      }),
    ).toBe(true);
    expect(
      isLessonResearchSurfaceBound('Table (information)', {
        title: 'Lesson 6: Two-Way Tables',
        sections: [{ topicSection: 'Two-Way Tables Analysis' }],
      }),
    ).toBe(false);
  });

  it('admits research only from stable lesson identity, never retrieved objective echoes', () => {
    const descriptiveLesson = {
      title: 'Lesson 2: Describing Distributions Numerically',
      outcomes: ['Use Gamma distribution to analyze one example.'],
      sections: [{ topicSection: 'Describing Distributions with Numbers' }],
    };
    expect(isLessonResearchSurfaceBound('Gamma distribution', descriptiveLesson)).toBe(false);
    expect(isLessonResearchSurfaceBound('Summary statistics', descriptiveLesson)).toBe(true);
    expect(
      isLessonResearchSurfaceBound('Semantic interpretation', {
        title: 'Lesson 6: Lexical Semantics',
        sections: [{ topicSection: 'Lexical meaning and semantic relations' }],
      }),
    ).toBe(false);
    expect(
      isLessonResearchSurfaceBound('Semantic interpretation', {
        title: 'Lesson 6: Semantic Interpretation',
        sections: [{ topicSection: 'Lexical Semantics' }],
      }),
    ).toBe(false);
  });

  it('does not treat describe or summarize as a distinguishing source identity', () => {
    expect(semanticIdentityTokens('Describing a probability distribution')).toEqual([
      'summary',
      'probability',
      'distribution',
    ]);
    expect(
      isLessonResearchSurfaceBound('Probability distribution', {
        title: 'Lesson 2: Describing Distributions Numerically',
        sections: [{ topicSection: 'Describing Distributions with Numbers' }],
      }),
    ).toBe(false);
  });
});
