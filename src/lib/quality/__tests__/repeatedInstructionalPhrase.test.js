import { describe, expect, it } from 'vitest';

import { findRepeatedInstructionalPhrase } from '../repeatedInstructionalPhrase.js';

describe('findRepeatedInstructionalPhrase short directives', () => {
  it('does not let 38 repeated sub-ten-word directives disappear below the long-shingle window', () => {
    const directive = 'Correction: Cite supporting evidence and name its limit.';
    const files = Array.from({ length: 12 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: Array.from({ length: index < 2 ? 4 : 3 }, () => directive),
    }));

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({
      phrase: 'correction cite supporting evidence and name its',
      count: 38,
      wordCount: 7,
      file: 'package (12 files)',
    });
  });

  it('does not promote short repeated non-directive labels into a package P1', () => {
    const files = Array.from({ length: 12 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: Array.from({ length: 3 }, () => 'Course section context and supporting background overview.'),
    }));

    expect(findRepeatedInstructionalPhrase(files)).toBeNull();
  });

  it('masks disclosed canonical learning objectives without weakening other short-directive checks', () => {
    const objective = 'Explain Data cleansing using evidence from the assigned sources.';
    const files = Array.from({ length: 12 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [objective, objective],
    }));

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({ wordCount: 7, count: 24 });
    expect(
      findRepeatedInstructionalPhrase(files, {
        lessons: [{ lessonNumber: 1, title: 'Lesson 1: Data cleaning', objectives: [objective] }],
      }),
    ).toBeNull();
  });

  it('does not count duplicate Office parser projections as repeated assessment contexts', () => {
    const assessment =
      'The Normal Distribution: z-score calculation trace, standardized-observation interpretation, normal-model check, or comparison note';
    const paragraph = `${assessment}.`;
    const files = Array.from({ length: 8 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: Array.from({ length: 6 }, () => paragraph),
    }));

    expect(findRepeatedInstructionalPhrase(files, { assessments: [{ title: assessment }] })).toBeNull();
  });

  it('does not treat a shared required-asset path as repeated instructional prose', () => {
    const files = Array.from({ length: 14 }, (_, index) => ({
      path: `Lesson Plans/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [
        'Use Required Assets/AUTHENTIC_LANGUAGE_DATA.csv and Required Assets/AUTHENTIC_LANGUAGE_DATA_GUIDE.md for this lesson-specific analysis.',
      ],
    }));

    expect(findRepeatedInstructionalPhrase(files)).toBeNull();
  });

  it('masks a registered source title while continuing to scan its surrounding directions', () => {
    const sourceTitle = 'Perceived Emotional and Social Effects of TikTok Among Youth';
    const files = Array.from({ length: 24 }, (_, index) => ({
      path: `Lesson Plans/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [`Use ${sourceTitle} for the lesson-specific evidence comparison.`],
    }));

    expect(findRepeatedInstructionalPhrase(files)).not.toBeNull();
    expect(findRepeatedInstructionalPhrase(files, { sourceLedger: [{ displayTitle: sourceTitle }] })).toBeNull();
  });

  it('masks only receipt-backed source claims intentionally aligned across artifact families', () => {
    const claim =
      'The p-value is not the probability that the null hypothesis is true, and it does not measure effect size.';
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [claim],
    }));
    const verifiedCheck = {
      claim,
      semanticSupport: true,
      entailed: true,
      sourceIdentityVerified: true,
      artifactVisibilityVerified: true,
    };

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({ count: 25, wordCount: 10 });
    expect(
      findRepeatedInstructionalPhrase(files, {
        sourceLedger: [{ supportReceipt: { checks: [{ ...verifiedCheck, entailed: false }] } }],
      }),
    ).not.toBeNull();
    expect(
      findRepeatedInstructionalPhrase(files, {
        sourceLedger: [{ supportReceipt: { checks: [verifiedCheck] } }],
      }),
    ).toBeNull();
  });

  it('masks fingerprinted authentic evidence while retaining repeated directions around it', () => {
    const analysisFocus =
      'Phonetic and phonological identification: the forms differ initially, supporting a consonant inventory analysis.';
    const displayLabel = 'English example at Chapter 1, section 1, paragraph 2';
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [`${displayLabel}. ${analysisFocus}`],
    }));
    const manifest = {
      authenticLanguageDataCoverage: {
        lessons: [
          {
            taskBinding: {
              protocol: 'coursemapper-authentic-evidence-task-binding-v1',
              payloadSha256: 'a'.repeat(64),
              taskContractSha256: 'c'.repeat(64),
              truthProof: {
                taskContractSha256: 'c'.repeat(64),
                promptDisplaysBoundPayload: true,
                answerKeyOperatesOnBoundPayload: true,
                rubricScoresDeclaredOperation: true,
              },
              examples: [{ displayLabel, analysisFocus, payloadSha256: 'b'.repeat(64) }],
            },
          },
        ],
      },
    };

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({ count: 25, wordCount: 10 });
    expect(findRepeatedInstructionalPhrase(files, manifest)).toBeNull();

    const directedFiles = files.map((file) => ({
      ...file,
      paragraphs: [`Cite supporting evidence and state the conclusion boundary. ${displayLabel}. ${analysisFocus}`],
    }));
    expect(findRepeatedInstructionalPhrase(directedFiles, manifest)).toMatchObject({ count: 25 });
    expect(findRepeatedInstructionalPhrase(directedFiles, manifest)?.phrase).toContain('cite supporting evidence');
  });

  it('masks a fingerprinted authentic source locator together with its bound record fields', () => {
    const example = {
      displayLabel: 'Mandarin SVO example',
      form: 'Zhāngsān shōudǎo-le yi-fēng xìn.',
      gloss: 'Zhangsan receive-PERF one-CLF letter',
      translation: 'Zhangsan received a letter.',
      sourceLocator: 'Chapter 81, example 2b',
      payloadSha256: 'c'.repeat(64),
    };
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [
        `${example.displayLabel}: “${example.form}” | gloss: ${example.gloss} | translation: ${example.translation} | source: ${example.sourceLocator}`,
      ],
    }));
    const task = {
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      payloadSha256: 'a'.repeat(64),
      taskContractSha256: 'b'.repeat(64),
      examples: [example],
      truthProof: {
        taskContractSha256: 'b'.repeat(64),
        promptDisplaysBoundPayload: true,
        answerKeyOperatesOnBoundPayload: true,
        rubricScoresDeclaredOperation: true,
      },
    };

    expect(findRepeatedInstructionalPhrase(files)).not.toBeNull();
    expect(
      findRepeatedInstructionalPhrase(files, {
        authenticLanguageDataCoverage: { lessons: [{ taskBinding: task }] },
      }),
    ).toBeNull();
  });

  it('does not turn labels between hash-bound authentic records into synthetic boilerplate', () => {
    const first = {
      displayLabel: 'Mandarin SVO example',
      form: 'Zhāngsān shōudǎo-le yi-fēng xìn.',
      gloss: 'Zhangsan receive-PERF one-CLF letter',
      translation: 'Zhangsan received a letter.',
      sourceLocator: 'Chapter 81, example 2b',
      payloadSha256: 'c'.repeat(64),
    };
    const second = {
      displayLabel: 'Irish VSO example',
      form: 'Léann na sagairt na leabhair.',
      gloss: 'read.PRES the.PL priest.PL the.PL book.PL',
      translation: 'The priests are reading the books.',
      sourceLocator: 'Chapter 81, example 2c',
      payloadSha256: 'd'.repeat(64),
    };
    const task = {
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      payloadSha256: 'a'.repeat(64),
      taskContractSha256: 'b'.repeat(64),
      examples: [first, second],
      truthProof: {
        taskContractSha256: 'b'.repeat(64),
        promptDisplaysBoundPayload: true,
        answerKeyOperatesOnBoundPayload: true,
        rubricScoresDeclaredOperation: true,
      },
    };
    const record = (example) =>
      `${example.displayLabel}: “${example.form}” | gloss: ${example.gloss} | translation: ${example.translation} | source: ${example.sourceLocator}`;
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [`${record(first)} Compare with ${record(second)}`],
    }));

    expect(findRepeatedInstructionalPhrase(files)).not.toBeNull();
    expect(
      findRepeatedInstructionalPhrase(files, {
        authenticLanguageDataCoverage: { lessons: [{ taskBinding: task }] },
      }),
    ).toBeNull();
  });

  it('masks fingerprinted articulatory-profile fields as exact authentic evidence', () => {
    const articulatoryProfile = {
      voicing: 'voiced',
      constrictionPlace: 'dental or alveolar',
      manner: 'lateral approximant',
      airflow: 'air passes along the side of the tongue',
    };
    const renderedProfile = Object.values(articulatoryProfile).join('; ');
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [`Articulatory evidence: ${renderedProfile}`],
    }));
    const task = {
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      payloadSha256: 'a'.repeat(64),
      taskContractSha256: 'b'.repeat(64),
      examples: [{ payloadSha256: 'c'.repeat(64), articulatoryProfile }],
      truthProof: {
        taskContractSha256: 'b'.repeat(64),
        promptDisplaysBoundPayload: true,
        answerKeyOperatesOnBoundPayload: true,
        rubricScoresDeclaredOperation: true,
      },
    };

    expect(findRepeatedInstructionalPhrase(files)).not.toBeNull();
    expect(
      findRepeatedInstructionalPhrase(files, {
        authenticLanguageDataCoverage: { lessons: [{ taskBinding: task }] },
      }),
    ).toBeNull();
  });

  it('masks only a fingerprinted authentic task scoring contract, not nearby repeated teaching directions', () => {
    const successCriterion = 'Trace the comparison from the named records to an evidence-limited conclusion.';
    const repeatedDirection = 'Cite supporting evidence and state the conclusion boundary.';
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.docx`,
      kind: 'docx',
      paragraphs: [successCriterion, repeatedDirection],
    }));
    const task = {
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      payloadSha256: 'a'.repeat(64),
      taskContractSha256: 'b'.repeat(64),
      successCriterion,
      assessmentCriteria: [],
      examples: [],
      truthProof: {
        taskContractSha256: 'b'.repeat(64),
        promptDisplaysBoundPayload: true,
        answerKeyOperatesOnBoundPayload: true,
        rubricScoresDeclaredOperation: true,
      },
    };

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({ count: 25 });
    expect(
      findRepeatedInstructionalPhrase(files, {
        authenticLanguageDataCoverage: { lessons: [{ taskBinding: task }] },
      }),
    ).toMatchObject({ phrase: 'cite supporting evidence and state the conclusion', count: 25 });
  });

  it('masks only the exact success criterion from a fully hash-bound functional visual task', () => {
    const successCriterion = 'Identifies the contrast relationship the functional visual task depends on.';
    const repeatedDirection = 'Cite supporting evidence and state the conclusion boundary.';
    const files = Array.from({ length: 25 }, (_, index) => ({
      path: `Rendered/Lesson ${index + 1}.pptx`,
      kind: 'pptx',
      paragraphs: [successCriterion, repeatedDirection],
    }));
    const binding = {
      protocol: 'coursemapper-functional-visual-binding-v1',
      taskContract: {
        protocol: 'coursemapper-functional-visual-task-contract-v1',
        contractSha256: 'a'.repeat(64),
      },
      visibleTask: {
        protocol: 'coursemapper-visible-functional-task-v1',
        hashBound: true,
        cardTextSha256: 'b'.repeat(64),
        authoredSummarySha256: 'c'.repeat(64),
        authoredBulletsSha256: 'd'.repeat(64),
        successCriterion,
      },
    };

    expect(findRepeatedInstructionalPhrase(files)).toMatchObject({ count: 25 });
    expect(
      findRepeatedInstructionalPhrase(files, {
        functionalVisualBindings: [{ ...binding, visibleTask: { ...binding.visibleTask, hashBound: false } }],
      }),
    ).toMatchObject({ count: 25 });
    expect(findRepeatedInstructionalPhrase(files, { functionalVisualBindings: [binding] })).toMatchObject({
      phrase: 'cite supporting evidence and state the conclusion',
      count: 25,
    });
  });
});
