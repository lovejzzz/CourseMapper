import { describe, expect, it } from 'vitest';
import {
  buildSourceLedgerFromCourseGraph,
  buildSourceReportMarkdown,
  sourceLedgerFromOpenAlex,
  sourceLedgerFromOpenLibrary,
  sourceLedgerFromOpenStax,
} from '../sourceLedger.js';

describe('trusted source ledger', () => {
  it('normalizes academic and OER provider results into auditable source rows', () => {
    const checkedAt = '2026-06-20T00:00:00.000Z';
    const openAlex = sourceLedgerFromOpenAlex(
      {
        id: 'https://openalex.org/W1',
        title: 'Limits and the Derivative',
        authors: 'A. Author, B. Scholar',
        doi: '10.1000/calculus',
        license: 'cc-by',
      },
      { fallbackId: 'SL1', checkedAt, conceptLinks: [{ id: 'C1', label: 'Limit' }] },
    );
    const openLibrary = sourceLedgerFromOpenLibrary(
      {
        title: 'Calculus Volume 1',
        authors: ['OpenStax'],
        url: 'https://openlibrary.org/works/OL1',
      },
      { fallbackId: 'SL2', checkedAt },
    );
    const openStax = sourceLedgerFromOpenStax(
      {
        title: 'Calculus Volume 1',
        url: 'https://openstax.org/books/calculus-volume-1',
      },
      { fallbackId: 'SL3', checkedAt },
    );

    expect(openAlex).toMatchObject({
      provider: 'openalex',
      doi: '10.1000/calculus',
      accessStatus: 'reference-present',
      trustLevel: 'academic-metadata',
      licenseAmbiguous: false,
      conceptLinks: [{ id: 'C1', label: 'Limit' }],
    });
    expect(openLibrary).toMatchObject({
      provider: 'openlibrary',
      trustLevel: 'bibliographic-metadata',
      licenseAmbiguous: true,
    });
    expect(openStax).toMatchObject({
      provider: 'openstax',
      license: 'CC BY-NC-SA 4.0',
      trustLevel: 'open-educational-resource',
    });
  });

  it('recovers source references embedded in rendered resource text', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        sessions: [{ id: 's1', number: 1, sections: [{ topic: 'Socialization', resourceRefs: ['r1'] }] }],
        resources: [
          {
            id: 'r1',
            origin: 'syllabus',
            citation:
              'OpenStax Introduction to Sociology 3e, Socialization, https://openstax.org/books/introduction-sociology-3e/pages/5-introduction-to-socialization, CC BY 4.0',
            sessionRefs: [1],
          },
        ],
      },
      { checkedAt: '2026-06-20T00:00:00.000Z' },
    );

    expect(ledger.rows[0]).toMatchObject({
      id: 'r1',
      provider: 'openstax',
      url: 'https://openstax.org/books/introduction-sociology-3e/pages/5-introduction-to-socialization',
      license: 'CC BY 4.0',
      accessStatus: 'reference-present',
      trustLevel: 'open-educational-resource',
    });
  });

  it('does not promote package labels or placeholder course-map resources into source rows', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ topic: 'Institutions', resourceRefs: ['r1', 'r2', 'r3', 'r4'] }],
          },
        ],
        resources: [
          { id: 'r1', origin: 'syllabus', citation: 'course map', sessionRefs: [1] },
          { id: 'r2', origin: 'syllabus', citation: 'lesson plans', sessionRefs: [1] },
          {
            id: 'r3',
            origin: 'syllabus',
            citation: 'Worked examples, readings, or activity sheets aligned to institutions.',
            sessionRefs: [1],
          },
          {
            id: 'r4',
            origin: 'syllabus',
            citation:
              'OpenStax Introduction to Sociology 3e, Social Institutions, https://openstax.org/books/introduction-sociology-3e/pages/4-introduction-to-society-and-social-interaction, CC BY 4.0',
            sessionRefs: [1],
          },
        ],
      },
      { checkedAt: '2026-06-20T00:00:00.000Z' },
    );

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      id: 'r4',
      provider: 'openstax',
      accessStatus: 'reference-present',
    });
  });

  it('returns no source ledger when fallback resources are only non-source placeholders', () => {
    const ledger = buildSourceLedgerFromCourseGraph({
      sessions: [{ id: 's1', number: 1, sections: [{ topic: 'Inequality', resourceRefs: ['r1', 'r2'] }] }],
      resources: [
        { id: 'r1', origin: 'syllabus', citation: 'study guides', sessionRefs: [1] },
        {
          id: 'r2',
          origin: 'syllabus',
          citation: 'Course materials students need to prepare and show evidence about inequality.',
          sessionRefs: [1],
        },
      ],
    });

    expect(ledger).toBeNull();
  });

  it('quarantines CourseIR assumption rows as review notes instead of bibliography', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        courseIR: {
          sourceLedger: [
            {
              id: 'SL1',
              scope: 'course',
              status: 'source-provided',
              evidence: 'Existing course map fields.',
              provider: 'courseir',
            },
          ],
        },
      },
      { checkedAt: '2026-06-20T00:00:00.000Z' },
    );

    expect(ledger.rows).toHaveLength(0);
    expect(ledger.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SL1',
          provider: 'courseir',
          accessStatus: 'no-url-or-doi',
          licenseAmbiguous: true,
        }),
      ]),
    );
    expect(ledger.summary).toMatchObject({ sourceCount: 0, reviewRequiredCount: 1 });

    const report = buildSourceReportMarkdown({ courseName: 'Sociology', sourceLedger: ledger });
    expect(report).toContain('Source Review Notes');
    expect(report).toContain('trustedBibliography=false');
    expect(report).not.toContain('## Source Ledger');
  });

  it('builds a graph ledger and human source report from CourseGraph resources', () => {
    const checkedAt = '2026-06-20T00:00:00.000Z';
    const graph = {
      concepts: [{ id: 'c1', term: 'Limits' }],
      sessions: [
        {
          id: 's1',
          number: 1,
          sections: [{ id: 'sec1', topic: 'Limits', conceptRefs: ['c1'], resourceRefs: ['kr1'] }],
        },
      ],
      resources: [
        {
          id: 'kr1',
          citation: 'OpenStax Calculus Volume 1 §2.2',
          origin: 'genome',
          kind: 'textbook section',
          url: 'https://openstax.org/books/calculus-volume-1/pages/2-2-the-limit-of-a-function',
          license: 'CC BY-NC-SA 4.0',
          attribution: 'OpenStax, Rice University',
          sessionRefs: ['s1'],
        },
      ],
      readings: [],
      courseIR: {
        sourceLedger: [
          {
            id: 'SL1',
            title: 'Instructor course brief',
            scope: 'course',
            status: 'source-provided',
            evidence: 'Instructor requested a limits package.',
            provider: 'instructor',
            license: 'instructor review required',
          },
        ],
      },
    };

    const ledger = buildSourceLedgerFromCourseGraph(graph, { checkedAt });
    expect(ledger.summary).toMatchObject({
      sourceCount: 2,
      accessibleCount: 1,
      licenseAmbiguousCount: 1,
    });
    expect(ledger.rows[1]).toMatchObject({
      id: 'kr1',
      provider: 'genome',
      conceptLinks: [{ id: 'c1', label: 'Limits' }],
      checkedAt,
    });
    const report = buildSourceReportMarkdown({
      courseName: 'Calculus I',
      sourceLedger: ledger,
      sourceRefCoverage: {
        categories: {
          outcomes: { total: 1, withRefs: 1, missing: 0, danglingRefs: 0, missingIds: [] },
        },
      },
    });
    expect(report).toContain('Source Ledger');
    expect(report).toContain('kr1');
    expect(report).toContain('outcomes: 1/1 with sourceRefs');
  });

  it('recovers concept-linked source rows from a source-finder mini-shard when resource cells are sparse', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        concepts: [{ id: 'c1', term: 'Gene expression' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Gene expression', conceptRefs: ['c1'], resourceRefs: [] }],
          },
        ],
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'gene expression regulation',
              sources: [
                {
                  provider: 'openalex',
                  kind: 'peer-reviewed reading',
                  title: 'Gene Expression Regulation in Society Courses',
                  authors: 'A. Scholar',
                  year: 2024,
                  url: 'https://openalex.org/W999',
                  license: 'cc-by',
                  snippet: 'Connects gene expression regulation to introductory genetics instruction.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-20T00:00:00.000Z' },
    );

    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sf-1-1',
          provider: 'openalex',
          url: 'https://openalex.org/W999',
          conceptLinks: [{ id: 'c1', label: 'Gene expression' }],
          trustLevel: 'academic-metadata',
        }),
      ]),
    );
  });
});
