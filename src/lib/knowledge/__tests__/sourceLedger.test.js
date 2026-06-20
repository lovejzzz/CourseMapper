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
});
