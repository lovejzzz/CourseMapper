import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter';
import { extractPackage } from '../quality/deepQualityGrader';
import { createMemoryFileProvider } from '../quality/fileProviders';

async function docxDocumentXml(blob) {
  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  return await zip.file('word/document.xml').async('string');
}

async function extractedDocxParagraphs(blob, filePath) {
  const pkg = await extractPackage(createMemoryFileProvider({ [filePath]: blob }));
  const file = pkg.files.find((entry) => entry.path === filePath);
  return file?.paragraphs || [];
}

describe('buildDeliverableDocxBlob', () => {
  it('omits internal compiler metadata from generic custom deliverable DOCX exports', async () => {
    const blob = await buildDeliverableDocxBlob(
      'custom_reflection',
      {
        items: [
          {
            lessonTitle: 'Lesson 1',
            promptTitle: 'Weekly Reflection 1',
            responsePrompt: 'Connect the lesson evidence to your next revision.',
            sourceGrounding: {
              compilerDecision: 'deterministic-compile',
              publishGate: 'ready-with-spot-check',
            },
            nestedEvidence: {
              studentCue: 'Use one concrete course detail.',
              sourceGrounding: 'Internal source-grounding trace.',
            },
            checklist: [
              {
                item: 'Name one revision priority.',
                blueprintGrounding: 'Internal blueprint trace.',
              },
            ],
            qualityReceipt: 'Internal proof packet only.',
          },
        ],
      },
      'Export Cleanliness',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('Weekly Reflection 1');
    expect(xml).toContain('Use one concrete course detail');
    expect(xml).toContain('Name one revision priority');
    expect(xml).not.toContain('Source Grounding');
    expect(xml).not.toContain('deterministic-compile');
    expect(xml).not.toContain('Internal source-grounding trace');
    expect(xml).not.toContain('Internal blueprint trace');
    expect(xml).not.toContain('Internal proof packet');
  });

  it('renders lesson-plan grouping as student-facing class format text', async () => {
    const blob = await buildDeliverableDocxBlob(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'Lesson 4: Usability testing',
            duration: '75 minutes',
            outline: [
              {
                time: '15 minutes',
                activity: 'Draft revision workshop',
                description: 'Students revise a usability testing artifact using task evidence.',
                grouping: 'Independent studio work with brief evidence check-ins',
              },
            ],
          },
        ],
      },
      'User Experience Design Studio',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('Class format: Independent studio work with brief evidence check-ins');
    expect(xml).not.toContain('Grouping: Independent studio work with brief evidence check-ins');
  });

  it('uses Word list structure instead of literal bullet glyphs for slide-deck bullets', async () => {
    const blob = await buildDeliverableDocxBlob(
      'slideDecks',
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Export Structure',
            slides: [
              {
                title: 'Structured Bullet Export',
                bullets: ['Review the generated DOCX.', 'Confirm list semantics survive export.'],
              },
            ],
          },
        ],
      },
      'Export Cleanliness',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('<w:numPr>');
    expect(xml).toContain('Review the generated DOCX.');
    expect(xml).not.toContain('• Review the generated DOCX.');
  });

  it('renders a handoff note instead of a title-only DOCX for empty assignment slices', async () => {
    const blob = await buildDeliverableDocxBlob(
      'assignments',
      { assignments: [] },
      'Introduction to Computer Science with Python - Lesson 14 - Midterm and project work',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('No standalone assignment brief scheduled');
    expect(xml).toContain('Course Map L14');
    expect(xml).toContain('No submitted assignment brief was generated');
    expect(xml).toContain('add or regenerate that assignment before publishing');
  });

  // v0.12.1 P3: quiz exports split into a distributable question paper and a
  // page-broken answer key; option letters never double; internal enum ids
  // never print; tables are percentage-width (the fixed 9360dxa tables
  // overflowed the A4 margins in every file of the v0.12 audit).
  it('renders quiz papers with a separate answer key, clean options, and pct tables', async () => {
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 3: Elasticity',
            questions: [
              {
                type: 'multiple_choice',
                question: 'A 10% price increase cuts quantity demanded by 25%. Demand is:',
                options: ['A. unit elastic', 'B. inelastic', 'C. perfectly inelastic', 'D. elastic'],
                answer: 'D',
                explanation: 'Elasticity is 2.5, which is greater than one.',
                tags: ['quiz', 'elasticity'],
              },
              {
                type: 'short_answer',
                question: 'Explain how elasticity shapes a revenue decision.',
                answer: 'Price cuts raise revenue only when demand is elastic, because quantity grows faster.',
                tags: ['quiz', 'revenue'],
              },
            ],
          },
        ],
      },
      'Microeconomics',
    );

    const xml = await docxDocumentXml(blob);
    // No doubled option letters; the option text appears exactly once.
    expect(xml).not.toContain('A. A.');
    expect(xml).toContain('unit elastic');
    // Internal enum ids are humanized.
    expect(xml).not.toContain('multiple_choice');
    expect(xml).not.toContain('short_answer');
    // Answer key exists on its own page, after the questions.
    expect(xml).toContain('Answer Key — Lesson 3: Elasticity');
    expect(xml.indexOf('Answer Key')).toBeGreaterThan(xml.indexOf('Demand is:'));
    expect(xml).toContain('<w:br w:type="page"/>');
    // Long short-answer keys stay sentence case (the callout label would
    // have uppercased them).
    expect(xml).toContain('Price cuts raise revenue only when demand is elastic');
    expect(xml).not.toContain('PRICE CUTS RAISE REVENUE');
    // Tags appear once per quiz, not after every question.
    expect(xml.match(/Tags: /g)?.length || 0).toBe(1);
    // Tables are pct-width, never the old fixed letter-width grid.
    expect(xml).not.toContain('w:w="9360"');
  });

  it('keeps quiz answer callout labels separated in extracted DOCX text', async () => {
    const filePath = 'Quiz & Exam Bank/Lesson 02 - Personas - Quiz & Exam Bank.docx';
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 2: Personas',
            questions: [
              {
                type: 'short_answer',
                question: 'How should a UX team summarize interviews when creating a persona?',
                answer:
                  'A defensible position: Personas should focus on the most common patterns to stay usable. In a scenario where a team has interviews with six students about managing assignments, deadlines, and notifications, the persona should name repeated scheduling pain points.',
                explanation:
                  'The response should connect persona scope to recurring user evidence rather than isolated preferences.',
              },
            ],
          },
        ],
      },
      'User Experience Design Studio',
    );

    const paragraphs = await extractedDocxParagraphs(blob, filePath);
    const text = paragraphs.join('\n');

    expect(text).toContain('ANSWER A defensible position');
    expect(text).not.toContain('ANSWERA defensible position');
  });
});
