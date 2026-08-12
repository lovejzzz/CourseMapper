/**
 * v0.16.1 — Linear Algebra package audit regressions (deck + syllabus).
 *
 * Three defects verified in a real generated v0.16.0 Linear Algebra package:
 *   1. 79 slide bullets across 14 decks shipped as "…"-marked mid-clause
 *      truncations ("…adapts the course pattern: move…"). conciseClause's
 *      ellipsis mode now composes to fit (sentence → clause → word boundary)
 *      and never emits an ellipsis.
 *   2. Every eligible content slide attached the SAME lesson-level
 *      claim/evidence rows (enrichedEvidenceTableRows), so decks rendered the
 *      identical key-terms table on two slides (e.g. slides 6 and 10 of a
 *      13-slide deck). compileSlideDecks now renders the table once per deck;
 *      repeats become a rows-free "evidence self-check" descriptor.
 *   3. The syllabus DOCX shipped the Word TOC field instruction
 *      (`TOC \h \o "1-3"`) where body text is expected — visible in every
 *      non-Word renderer/text extractor, and unpopulated even in Word because
 *      updateFields was never set. The TableOfContents block is removed.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverable,
  deduplicateSlideEvidenceTableVisual,
} from '../src/lib/courseBlueprintCompiler';
import { buildDeliverableDocxBlob } from '../src/lib/exporters/bulkDocxExporter';

const COURSE_NAME = 'Introduction to Linear Algebra';

const TOPICS = [
  ['Systems of Linear Equations and Row Reduction', 'Systems of linear equations', 'Row reduction strategies'],
  ['Vector Spaces and Linear Independence', 'Linear independence of vectors', 'Span and basis construction'],
  ['Matrix Transformations and Their Geometry', 'Matrix transformations', 'Kernel and image reasoning'],
  ['Determinants and Invertibility Conditions', 'Determinant computation', 'Invertibility criteria'],
  ['Eigenvalues, Eigenvectors, and Diagonalization', 'Eigenvalue decomposition', 'Diagonalization workflow'],
];

// Kernel-style key terms: each carries definition + example (so the evidence
// table gets >= 2 rows) and misconception + correction (so the pitfalls slide
// exercises the long-clause cut paths). The first correction is deliberately
// longer than the 88-char pitfalls budget — the audited defect class
// ("…transform the system while preserving…").
function linearAlgebraKeyTerms() {
  return [
    {
      term: 'Row reduction',
      definition: 'Elimination that rewrites a system without changing its solutions',
      example: 'subtracting twice row one from row two',
      misconception: 'Row operations change the solution set of the system whenever any entry of the matrix changes',
      correction:
        'Elementary row operations transform the system while preserving every solution, so the solution set stays invariant through the whole elimination',
    },
    {
      term: 'Pivot position',
      definition: 'A leading entry that marks a bound variable in reduced form',
      example: 'the first nonzero entry of row one',
      misconception:
        'Every column of a matrix must contain a pivot position for the linear system to be consistent at all',
      correction:
        'Consistency depends only on the augmented column, and pivot-free columns simply mean the system has free variables and infinitely many solutions',
    },
    {
      term: 'Span',
      definition: 'The set of all linear combinations of a collection of vectors',
      example: 'all multiples of one nonzero vector form a line',
      misconception: 'The span of two vectors is always a plane no matter how the two vectors are related',
      correction: 'Two parallel vectors span only a line, so the span depends on linear independence',
    },
  ];
}

function linearAlgebraCourseMap() {
  return {
    courseName: COURSE_NAME,
    lessons: TOPICS.map(([title, c1, c2], i) => ({
      title: `Lesson ${i + 1}: ${title}`,
      sections: [
        {
          learningGoals: `1. Build working command of ${title.toLowerCase()} for applied modeling decisions.`,
          topicSection: `${i + 1}.1: ${c1}`,
          learningObjectives: `Analyze ${c1.toLowerCase()} using worked matrix evidence from the course notes.\nEvaluate how ${c2.toLowerCase()} changes a concrete modeling decision in the weekly problem set.`,
          weeklyAssessments: `1. Week ${i + 1} quiz: applied ${c1.toLowerCase()} problems with full justification.`,
          asyncActivities: `1. Read: assigned chapter section on ${title.toLowerCase()} with the annotated worked examples.`,
          syncActivities: `1. Workshop: ${c2.toLowerCase()} case analysis where students defend each elimination and factorization move against the stated success criterion.`,
          supportingResources: `OpenStax chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

function linearAlgebraBlueprint() {
  const lessonContent = {};
  TOPICS.forEach((_, i) => {
    lessonContent[`lesson-${i + 1}`] = {
      quizItems: [],
      keyTerms: linearAlgebraKeyTerms(),
      mcWalkthrough: {
        question:
          'A 3 by 4 augmented matrix row reduces to a form with pivots in columns one and three only; decide whether the underlying system is consistent and how many free variables it has',
        options: [
          'The system is consistent with two free variables because the augmented column holds no pivot and two coefficient columns are pivot-free',
          'The system is inconsistent because at least one coefficient column of the matrix contains no pivot position after the reduction finishes',
        ],
        answerIndex: 0,
        explanation:
          'Consistency is decided by the augmented column alone, and each pivot-free coefficient column contributes exactly one free variable to the solution set of the reduced system',
      },
    };
  });
  return buildCourseBlueprint(linearAlgebraCourseMap(), {
    enrichment: { source: 'test-enrichment', lessonContent },
  });
}

function compiledDecks() {
  return compileBlueprintDeliverable('slideDecks', linearAlgebraBlueprint());
}

async function extractDocxParagraphs(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const paragraphs = [];
  let rawXml = '';
  for (const name of Object.keys(zip.files)) {
    if (!/\.xml$/.test(name)) continue;
    const xml = await zip.file(name).async('string');
    rawXml += `${xml}\n`;
    for (const para of xml.split(/<\/w:p>/)) {
      const line = para
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) paragraphs.push(line);
    }
  }
  return { paragraphs, rawXml };
}

describe('v0.16.1 deck integrity — no ellipsis-truncated bullets', () => {
  it('ships zero compiled slide bullets ending with "…"', () => {
    const decks = compiledDecks().decks;
    expect(decks.length).toBe(TOPICS.length);
    const bullets = decks.flatMap((deck) =>
      (deck.slides || []).flatMap((slide) => (slide.bullets || []).filter((b) => typeof b === 'string')),
    );
    expect(bullets.length).toBeGreaterThan(50);
    const truncated = bullets.filter((bullet) => bullet.trim().endsWith('…'));
    expect(truncated, `ellipsis-truncated bullets:\n${truncated.join('\n')}`).toEqual([]);
    // The long fixture clauses must actually exercise the cut paths: at least
    // one bullet sits at/near a budget cap, so this test is not vacuous.
    expect(bullets.some((bullet) => bullet.length >= 70)).toBe(true);
  }, 120000);

  it('never ships a bullet containing "…" anywhere (no mid-bullet marked cuts either)', () => {
    const bullets = compiledDecks().decks.flatMap((deck) =>
      (deck.slides || []).flatMap((slide) => (slide.bullets || []).filter((b) => typeof b === 'string')),
    );
    const marked = bullets.filter((bullet) => bullet.includes('…'));
    expect(marked, `ellipsis-marked bullets:\n${marked.join('\n')}`).toEqual([]);
  }, 120000);
});

describe('v0.16.1 deck integrity — key-terms/evidence table renders once per deck', () => {
  it('no two slides in one deck share an identical evidence-table row body', () => {
    const decks = compiledDecks().decks;
    let rowsBearingSlides = 0;
    for (const deck of decks) {
      const seen = new Map();
      for (const slide of deck.slides || []) {
        const rows = slide.visual?.rows;
        if (!Array.isArray(rows) || rows.length === 0) continue;
        rowsBearingSlides += 1;
        const key = JSON.stringify(rows);
        const priorTitle = seen.get(key);
        expect(
          priorTitle,
          `deck "${deck.lessonTitle}": slides "${priorTitle}" and "${slide.title}" carry the identical table body`,
        ).toBeUndefined();
        seen.set(key, slide.title);
      }
    }
    // The kernel key terms must have produced at least one real table, or the
    // dedup assertion above proved nothing.
    expect(rowsBearingSlides).toBeGreaterThan(0);
  }, 120000);

  it('a repeat table occurrence downgrades to a rows-free self-check descriptor, not a second table', () => {
    const lesson = linearAlgebraBlueprint().lessons[0];
    const rows = [
      ['Row reduction', 'Preserves the solution set'],
      ['Pivot position', 'Marks a bound variable'],
    ];
    const seenEvidenceRowKeys = new Set();
    const first = deduplicateSlideEvidenceTableVisual({
      visual: { kind: 'evidence table', rows, description: 'Claim and evidence table' },
      seenEvidenceRowKeys,
      lesson,
      slideTitle: 'First evidence view',
    });
    const repeat = deduplicateSlideEvidenceTableVisual({
      visual: { kind: 'evidence table', rows, description: 'Claim and evidence table' },
      seenEvidenceRowKeys,
      lesson,
      slideTitle: 'Repeated evidence view',
    });

    expect(first.rows).toEqual(rows);
    expect(repeat.kind).toBe('evidence self-check');
    expect(repeat.rows).toBeUndefined();
    expect(String(repeat.description)).not.toMatch(/\btable\b/i);
  }, 120000);
});

describe('v0.16.1 syllabus integrity — no TOC field code in body text', () => {
  it('renders no raw "TOC \\h" field instruction in any syllabus paragraph', async () => {
    const blueprint = linearAlgebraBlueprint();
    const syllabus = compileBlueprintDeliverable('syllabus', blueprint);
    const blob = await buildDeliverableDocxBlob('syllabus', syllabus, COURSE_NAME);
    const { paragraphs, rawXml } = await extractDocxParagraphs(blob);
    expect(paragraphs.length).toBeGreaterThan(10);
    const leaks = paragraphs.filter((line) => /TOC\s*\\[a-z]/i.test(line));
    expect(leaks, `TOC field code leaked into body text:\n${leaks.join('\n')}`).toEqual([]);
    // Belt and braces: no TOC field instruction anywhere in the package XML.
    expect(rawXml).not.toMatch(/TOC \\h/);
  }, 120000);
});
