import { describe, expect, it } from 'vitest';

import { quarantineUnadmittedResearchClaims } from '../courseBlueprintCompiler';
import { sourceClaimDefinesTerm } from '../verifiedDraftCompilerContracts.js';

function citation(title, claims) {
  return {
    displayTitle: title,
    provider: 'wikipedia',
    evidence: claims[0],
    supportReceipt: {
      checks: claims.map((claim) => ({
        claim,
        quote: claim,
        semanticSupport: true,
        quoteInSnapshot: true,
      })),
    },
  };
}

function researchPayload({ facts, terms, citations }) {
  return {
    enrichmentSource: 'algi-researched',
    keyTerms: terms.map(({ term, definition }) => ({ term, definition })),
    quizItems: [],
    slideContent: [],
    kernel: { facts, provenance: { factCount: facts.length } },
    conceptProvenance: { source: 'algi-researched', citations },
  };
}

describe('verified-draft research instructional admission', () => {
  it('distinguishes genuine definitions from uses, properties, and neighboring concepts', () => {
    for (const [term, claim] of [
      [
        'Normal distribution',
        'In probability and statistics, a normal distribution or Gaussian distribution is a type of continuous probability distribution for a real-valued random variable.',
      ],
      [
        'Contingency table',
        'In statistics, a contingency table (also known as a cross tabulation or crosstab) is a type of table in a matrix format.',
      ],
      ['Latin hypercube sampling', 'Latin hypercube sampling (LHS) is a statistical method for generating samples.'],
      ['Nonprobability sampling', 'Nonprobability sampling is a form of sampling that does not use random selection.'],
      ['Scatterplots', 'Scatterplots are graphical displays used to visualize two quantitative variables.'],
      ['Elliptical distribution', 'An elliptical distribution is any member of a broad family of distributions.'],
    ]) {
      expect(sourceClaimDefinesTerm({ term, claim }), `${term}: ${claim}`).toBe(true);
    }

    for (const [term, claim] of [
      [
        'Mixture distribution',
        'The number of components in a mixture distribution is often restricted to being finite.',
      ],
      ['Regression analysis', 'Regression analysis is primarily used for two conceptually distinct purposes.'],
      ['Gumbel distribution', 'The Gumbel distribution is used to model the maximum of a number of samples.'],
      ['Confidence intervals', 'Credible intervals are a Bayesian analog to confidence intervals.'],
    ]) {
      expect(sourceClaimDefinesTerm({ term, claim }), `${term}: ${claim}`).toBe(false);
    }
  });

  it('keeps a visual-media licensing source while rejecting a one-word government-license detour', () => {
    const governmentClaim =
      'In the case of a license issued by a government, the license is obtained by applying for it.';
    const commonsClaim =
      'A Creative Commons license is a public copyright license that lets an author permit sharing and reuse of a work.';
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 5: Ethical Contextual Interpretation',
        keyConcepts: ['Source Attribution and License', 'Bias in visual representation'],
        outcomes: ['Analyze source attribution and reuse rights for visual media.'],
        sections: [{ topicSection: 'Source Attribution and License' }],
      },
      researchPayload({
        facts: [governmentClaim, commonsClaim],
        terms: [
          { term: 'License', definition: governmentClaim },
          { term: 'Creative Commons license', definition: commonsClaim },
        ],
        citations: [citation('License', [governmentClaim]), citation('Creative Commons license', [commonsClaim])],
      }),
    );

    expect(result.kernel.facts).toEqual([commonsClaim]);
    expect(result.keyTerms.map((term) => term.term)).toEqual(['Creative Commons license']);
    expect(result.conceptProvenance.citations.map((row) => row.displayTitle)).toEqual([
      'License',
      'Creative Commons license',
    ]);
    expect(result.conceptProvenance.admittedCitations.map((row) => row.displayTitle)).toEqual([
      'Creative Commons license',
    ]);
    expect(result.semanticAdmissionReceipt.quarantinedResearchSources).toEqual([
      expect.objectContaining({ title: 'License' }),
    ]);
  });

  it('rejects an advanced method whose source title is outside an elementary lesson identity', () => {
    const tableClaim =
      'A contingency table displays the joint frequency distribution of two categorical variables in rows and columns.';
    const poissonClaim =
      'A Poisson regression model is sometimes known as a log-linear model, especially when used to model contingency tables.';
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 6: Two-Way Tables',
        keyConcepts: ['Contingency Tables and Data Organization', 'Analyzing relationships in categorical data'],
        outcomes: ['Calculate and interpret conditional proportions from a two-way table.'],
        sections: [{ topicSection: 'Contingency Tables and Data Organization' }],
      },
      researchPayload({
        facts: [tableClaim, poissonClaim],
        terms: [
          { term: 'Contingency table', definition: tableClaim },
          { term: 'Poisson regression', definition: poissonClaim },
        ],
        citations: [citation('Contingency table', [tableClaim]), citation('Poisson regression', [poissonClaim])],
      }),
    );

    expect(result.kernel.facts).toEqual([tableClaim]);
    expect(result.keyTerms.map((term) => term.term)).toEqual(['Contingency table']);
    expect(result.conceptProvenance.citations.map((row) => row.displayTitle)).toEqual([
      'Contingency table',
      'Poisson regression',
    ]);
    expect(result.conceptProvenance.admittedCitations.map((row) => row.displayTitle)).toEqual(['Contingency table']);
    expect(result.semanticAdmissionReceipt.quarantinedResearchSources).toEqual([
      expect.objectContaining({ title: 'Poisson regression' }),
    ]);
  });

  it('rejects distribution names that match only generic descriptors in a descriptive-summary lesson', () => {
    const gumbelClaim =
      'The Gumbel distribution is used to model the distribution of the maximum or minimum of a number of samples.';
    const mixtureClaim = 'The number of components in a mixture distribution is often restricted to being finite.';
    const summaryClaim =
      'In descriptive statistics, summary statistics are used to summarize a set of observations as simply as possible.';
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 2: Describing Distributions with Numbers',
        keyConcepts: ['Describing Distributions with Numbers'],
        outcomes: ['Explain how numerical descriptions summarize a supplied distribution.'],
        sections: [{ topicSection: 'Describing Distributions with Numbers' }],
        sourceEvidenceTrace: {
          sourceFields: [
            {
              field: 'topic and concepts',
              rawText: 'Describing Distributions with Numbers',
              compiledValue: 'Describing Distributions with Numbers',
            },
          ],
        },
      },
      researchPayload({
        facts: [gumbelClaim, mixtureClaim, summaryClaim],
        terms: [
          { term: 'Gumbel distribution', definition: gumbelClaim },
          { term: 'Mixture distribution', definition: mixtureClaim },
          { term: 'Summary statistics', definition: summaryClaim },
        ],
        citations: [
          citation('Gumbel distribution', [gumbelClaim]),
          citation('Mixture distribution', [mixtureClaim]),
          citation('Summary statistics', [summaryClaim]),
        ],
      }),
    );

    expect(result.kernel.facts).toEqual([summaryClaim]);
    expect(result.keyTerms.map((term) => term.term)).toEqual(['Summary statistics']);
    expect(result.conceptProvenance.admittedCitations.map((row) => row.displayTitle)).toEqual(['Summary statistics']);
    expect(result.semanticAdmissionReceipt.quarantinedResearchTerms).toEqual(
      expect.arrayContaining(['gumbel distribution', 'mixture distribution']),
    );
  });

  it('does not admit undeclared specializations through an exact broad head noun', () => {
    const rootClaim =
      'A normal distribution is a continuous probability distribution for a real-valued random variable.';
    const advancedClaims = [
      'A truncated normal distribution bounds a normally distributed variable above, below, or both.',
      'A normal-gamma distribution is a bivariate four-parameter family of continuous distributions.',
      'A normal-Wishart distribution is a multivariate four-parameter family of continuous distributions.',
    ];
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 3: The Normal Distribution',
        keyConcepts: ['Normal distribution', 'z-scores and the empirical rule'],
        outcomes: ['Use a normal model to interpret a supplied introductory data display.'],
        sections: [{ topicSection: 'The Normal Distribution' }],
      },
      researchPayload({
        facts: [rootClaim, ...advancedClaims],
        terms: [
          { term: 'Normal distribution', definition: rootClaim },
          { term: 'Truncated normal distribution', definition: advancedClaims[0] },
          { term: 'Normal-gamma distribution', definition: advancedClaims[1] },
          { term: 'Normal-Wishart distribution', definition: advancedClaims[2] },
        ],
        citations: [
          citation('Normal distribution', [rootClaim]),
          citation('Truncated normal distribution', [advancedClaims[0]]),
          citation('Normal-gamma distribution', [advancedClaims[1]]),
          citation('Normal-Wishart distribution', [advancedClaims[2]]),
        ],
      }),
    );
    expect(result.kernel.facts).toEqual([rootClaim]);
    expect(result.keyTerms.map((term) => term.term)).toEqual(['Normal distribution']);
    expect(result.conceptProvenance.admittedCitations.map((row) => row.displayTitle)).toEqual(['Normal distribution']);
    expect(result.semanticAdmissionReceipt.quarantinedResearchSources.map((row) => row.title)).toEqual([
      'Truncated normal distribution',
      'Normal-gamma distribution',
      'Normal-Wishart distribution',
    ]);
  });

  it('keeps the canonical analysis title but rejects specialized regression families', () => {
    const rootClaim = 'Regression analysis estimates relationships between a response and explanatory variables.';
    const poissonClaim = 'Poisson regression is a generalized linear model used for count data.';
    const robustClaim = 'Robust regression limits the effect of assumption violations on estimates.';
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 5: Regression',
        keyConcepts: ['Regression', 'least-squares line', 'residual interpretation'],
        outcomes: ['Interpret a fitted line and inspect residuals.'],
        sections: [{ topicSection: 'Regression' }],
      },
      researchPayload({
        facts: [rootClaim, poissonClaim, robustClaim],
        terms: [
          { term: 'Regression analysis', definition: rootClaim },
          { term: 'Poisson regression', definition: poissonClaim },
          { term: 'Robust regression', definition: robustClaim },
        ],
        citations: [
          citation('Regression analysis', [rootClaim]),
          citation('Poisson regression', [poissonClaim]),
          citation('Robust regression', [robustClaim]),
        ],
      }),
    );

    expect(result.kernel.facts).toEqual([rootClaim]);
    expect(result.conceptProvenance.admittedCitations.map((row) => row.displayTitle)).toEqual(['Regression analysis']);
  });

  it('does not substitute second-language or heritage-learning sources for first-language acquisition', () => {
    const firstClaim = 'First-language acquisition describes how a child acquires an initial language system.';
    const secondClaim = 'Second-language acquisition studies how people learn another language after a first language.';
    const heritageClaim = 'Heritage language learning concerns a language connected to family or community background.';
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 9: First-Language Acquisition',
        keyConcepts: ['First-language acquisition', 'child language evidence'],
        outcomes: ['Evaluate a bounded first-language acquisition claim using child-language evidence.'],
        sections: [{ topicSection: 'First-Language Acquisition' }],
      },
      researchPayload({
        facts: [firstClaim, secondClaim, heritageClaim],
        terms: [
          { term: 'First-language acquisition', definition: firstClaim },
          { term: 'Second-language acquisition', definition: secondClaim },
          { term: 'Heritage language learning', definition: heritageClaim },
        ],
        citations: [
          citation('First-language acquisition', [firstClaim]),
          citation('Theories of second-language acquisition', [secondClaim]),
          citation('Heritage language learning', [heritageClaim]),
        ],
      }),
    );

    expect(result.kernel.facts).toEqual([firstClaim]);
    expect(result.conceptProvenance.admittedCitations.map((row) => row.displayTitle)).toEqual([
      'First-language acquisition',
    ]);
  });

  it('rejects source-title adjacency, advanced scope inflation, and case-specific research details', () => {
    const hierarchyClaim =
      'The detection of a face in a visual scene is the first stage in the face processing hierarchy.';
    const bayesianClaim =
      'Bayesian methods for exact small-sample analysis with categorical data in contingency tables are considered.';
    const morphologyStudyClaim =
      'From the overall average score, it was found that there were only 2 students who had very good morphological awareness.';
    const morphemeClaim =
      'Morphological structure describes how morphemes combine into words and express grammatical function.';

    const visual = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 2: Visual Hierarchy',
        keyConcepts: ['Color Contrast Effects', 'Visual Hierarchy and Contrast'],
        outcomes: ['Analyze how contrast and placement establish visual hierarchy.'],
        sections: [{ topicSection: 'Color Contrast Effects' }],
      },
      researchPayload({
        facts: [hierarchyClaim],
        terms: [{ term: 'Face processing hierarchy', definition: hierarchyClaim }],
        citations: [citation('Own-race and own-age biases facilitate visual awareness of faces', [hierarchyClaim])],
      }),
    );
    expect(visual.kernel.facts).toEqual([]);
    expect(visual.conceptProvenance.admittedCitations).toEqual([]);

    const statistics = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 6: Two-Way Tables',
        keyConcepts: ['Two-Way Tables Analysis'],
        outcomes: ['Interpret conditional proportions in a two-way table.'],
        sections: [{ topicSection: 'Two-Way Tables Analysis' }],
      },
      researchPayload({
        facts: [bayesianClaim],
        terms: [{ term: 'Conditional Bayesian method', definition: bayesianClaim }],
        citations: [
          citation('A conditional Bayesian approach for testing independence in two-way tables', [bayesianClaim]),
        ],
      }),
    );
    expect(statistics.kernel.facts).toEqual([]);
    expect(statistics.conceptProvenance.admittedCitations).toEqual([]);

    const morphology = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 4: Morphological Structure',
        keyConcepts: ['Morpheme Identification', 'Morphological Structure'],
        outcomes: ['Identify morphemes and justify a structural analysis.'],
        sections: [{ topicSection: 'Morpheme Identification' }],
      },
      researchPayload({
        facts: [morphologyStudyClaim, morphemeClaim],
        terms: [
          { term: 'Morphological awareness', definition: morphologyStudyClaim },
          { term: 'Morphological structure', definition: morphemeClaim },
        ],
        citations: [
          citation('An Analysis of Students’ Morphological Awareness', [morphologyStudyClaim]),
          citation('Morphological structure', [morphemeClaim]),
        ],
      }),
    );
    expect(morphology.kernel.facts).toEqual([morphemeClaim]);
    expect(morphology.keyTerms.map((term) => term.term)).toEqual(['Morphological structure']);
  });

  it('rejects homonymous computing sources from non-computing lessons', () => {
    const dialogClaim = 'Semantic interpretation is an important component in dialog systems.';
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 6: Semantic Interpretation',
        keyConcepts: ['Lexical Semantics', 'Semantic Interpretation'],
        outcomes: ['Compare lexical meanings using observable language data.'],
        sections: [{ topicSection: 'Lexical Semantics' }],
      },
      researchPayload({
        facts: [dialogClaim],
        terms: [{ term: 'Semantic interpretation', definition: dialogClaim }],
        citations: [citation('Semantic interpretation', [dialogClaim])],
      }),
    );

    expect(result.kernel.facts).toEqual([]);
    expect(result.conceptProvenance.admittedCitations).toEqual([]);
  });

  it('does not let a broad sampling source authorize an unplanned Bayesian method', () => {
    const samplingClaim = 'Sampling is the selection of a subset of individuals from a population.';
    const gibbsClaim =
      'Gibbs sampling is commonly used as a means of statistical inference, especially Bayesian inference.';
    const result = quarantineUnadmittedResearchClaims(
      {
        title: 'Lesson 7: Sampling',
        keyConcepts: ['Sampling methods', 'Representative samples'],
        outcomes: ['Compare sampling methods and identify likely sources of sampling bias.'],
        sections: [{ topicSection: 'Sampling methods' }],
      },
      researchPayload({
        facts: [samplingClaim, gibbsClaim],
        terms: [
          { term: 'Sampling', definition: samplingClaim },
          { term: 'Gibbs sampling', definition: gibbsClaim },
        ],
        citations: [citation('Sampling', [samplingClaim, gibbsClaim])],
      }),
    );

    expect(result.kernel.facts).toEqual([samplingClaim]);
    expect(result.keyTerms.map((term) => term.term)).toEqual(['Sampling']);
  });
});
