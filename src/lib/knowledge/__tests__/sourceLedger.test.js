import { describe, expect, it } from 'vitest';
import {
  buildSourceLedgerFromCourseGraph,
  buildSourceReportMarkdown,
  isLicenseAmbiguous,
  isTrustedSourceLedgerRow,
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
      license: 'CC BY',
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

  it('treats in-copyright rights statements as review-only license proof', () => {
    const source = sourceLedgerFromOpenAlex(
      {
        id: 'https://openalex.org/W2',
        title: 'Accessibility Evaluation in Design Studios',
        authors: 'A. Researcher',
        doi: '10.1000/accessibility-studio',
        license: 'http://rightsstatements.org/vocab/InC/1.0/',
      },
      { fallbackId: 'SL1', conceptLinks: [{ id: 'C1', label: 'Accessibility review' }] },
    );

    expect(source).toMatchObject({
      provider: 'openalex',
      doi: '10.1000/accessibility-studio',
      license: 'http://rightsstatements.org/vocab/InC/1.0/',
      licenseAmbiguous: true,
      conceptLinks: [{ id: 'C1', label: 'Accessibility review' }],
    });
    expect(isLicenseAmbiguous(source.license)).toBe(true);
    expect(isTrustedSourceLedgerRow(source)).toBe(false);
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

  it('normalizes hyphenated Creative Commons licenses recovered from source text', () => {
    const ledger = buildSourceLedgerFromCourseGraph({
      sessions: [{ id: 's1', number: 1, sections: [{ topic: 'Scope definition', resourceRefs: ['r1', 'r2'] }] }],
      resources: [
        {
          id: 'r1',
          origin: 'syllabus',
          citation: 'OpenAlex - Scope Management, DOI: 10.1002/example (cc-by)',
          sessionRefs: [1],
        },
        {
          id: 'r2',
          origin: 'syllabus',
          citation: 'OpenStax Example, https://openstax.org/books/example, CC BY-NC-SA 4.0',
          sessionRefs: [1],
        },
      ],
    });

    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'r1', license: 'CC BY', licenseAmbiguous: false }),
        expect.objectContaining({ id: 'r2', license: 'CC BY-NC-SA 4.0', licenseAmbiguous: false }),
      ]),
    );
  });

  it('recovers Crossref DOI and publisher policy URLs without trusting them as reusable licenses', () => {
    const ledger = buildSourceLedgerFromCourseGraph({
      sessions: [{ id: 's1', number: 1, sections: [{ topic: 'Runway', resourceRefs: ['r1', 'r2'] }] }],
      resources: [
        {
          id: 'r1',
          origin: 'syllabus',
          citation:
            'Masanao Aoki (1987). No unit root conditions for bivariate series when a component univariate series has a unit root. Crossref: https://doi.org/10.1016/0165-1765(87)90086-3 (https://www.elsevier.com/tdm/userlicense/1.0/)',
          sessionRefs: [1],
        },
        {
          id: 'r2',
          origin: 'syllabus',
          citation:
            'Test Plans. Crossref: https://doi.org/10.1002/9780470316795.ch6 (http://doi.wiley.com/10.1002/tdm_license_1.1)',
          sessionRefs: [1],
        },
      ],
    });

    expect(ledger.rows).toHaveLength(0);
    expect(ledger.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'r1',
          provider: 'crossref',
          doi: '10.1016/0165-1765(87)90086-3',
          url: 'https://doi.org/10.1016/0165-1765(87)90086-3',
          license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
          licenseAmbiguous: true,
          accessStatus: 'reference-present',
        }),
        expect.objectContaining({
          id: 'r2',
          provider: 'crossref',
          doi: '10.1002/9780470316795.ch6',
          url: 'https://doi.org/10.1002/9780470316795.ch6',
          licenseAmbiguous: true,
          accessStatus: 'reference-present',
        }),
      ]),
    );
    expect(isLicenseAmbiguous('http://doi.wiley.com/10.1002/tdm_license_1.1')).toBe(true);
  });

  it('quarantines accessible source resources when license proof is missing', () => {
    const ledger = buildSourceLedgerFromCourseGraph({
      concepts: [{ id: 'c1', term: 'studio critique' }],
      sessions: [
        {
          id: 's1',
          number: 1,
          sections: [{ topic: 'studio critique', conceptRefs: ['c1'], resourceRefs: ['r1'] }],
        },
      ],
      resources: [
        {
          id: 'r1',
          origin: 'syllabus',
          title: 'Guiding Principles for the UX Practitioner',
          url: 'https://example.edu/ux-practitioner',
          citation: 'Guiding Principles for the UX Practitioner',
          sessionRefs: [1],
        },
      ],
    });

    expect(ledger.rows).toHaveLength(0);
    expect(ledger.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'r1',
          accessStatus: 'reference-present',
          licenseAmbiguous: true,
          conceptLinks: [{ id: 'c1', label: 'studio critique' }],
        }),
      ]),
    );
    expect(ledger.summary).toMatchObject({ sourceCount: 0, trustedCount: 0, reviewRequiredCount: 1 });
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
      sourceCount: 1,
      accessibleCount: 1,
      licenseAmbiguousCount: 0,
      reviewRequiredCount: 1,
    });
    expect(ledger.rows[0]).toMatchObject({
      id: 'kr1',
      provider: 'genome',
      conceptLinks: [{ id: 'c1', label: 'Limits' }],
      checkedAt,
    });
    expect(ledger.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SL1',
          provider: 'instructor',
          licenseAmbiguous: true,
        }),
      ]),
    );
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
    expect(report).toContain('Source Review Notes');
    expect(report).toContain('kr1');
    expect(report).toContain('trustedBibliography=false');
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

  it('prefers trustworthy source-finder candidates over first metadata-only rows', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        concepts: [{ id: 'c1', term: 'Earned value management' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [
              {
                id: 'sec1',
                topic: 'Earned value management',
                conceptRefs: ['c1'],
                resourceRefs: [],
              },
            ],
          },
        ],
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'earned value',
              sources: [
                {
                  provider: 'openlibrary',
                  kind: 'book metadata',
                  title: 'Earned Value Project Management',
                  url: 'https://openlibrary.org/works/OL3289640W',
                  license: 'Open Library public metadata',
                  snippet: 'Bibliographic metadata for an earned value book.',
                },
                {
                  provider: 'openalex',
                  kind: 'peer-reviewed reading',
                  title: 'Earned Value Management in Project Controls',
                  doi: '10.1000/evm-controls',
                  url: 'https://doi.org/10.1000/evm-controls',
                  license: 'cc-by',
                  snippet: 'Connects earned value management to schedule and cost control decisions.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-27T00:00:00.000Z' },
    );

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      provider: 'openalex',
      title: 'Earned Value Management in Project Controls',
      trustLevel: 'academic-metadata',
      licenseAmbiguous: false,
      conceptLinks: [{ id: 'c1', label: 'Earned value management' }],
    });
    expect(ledger.summary).toMatchObject({
      sourceCount: 1,
      trustedCount: 1,
      trustedConceptLinkedCount: 1,
      licenseAmbiguousCount: 0,
    });
  });

  it('bridges multiple trusted concept-linked source-finder rows from one topic', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        concepts: [{ id: 'c1', term: 'Critical path method' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [
              {
                id: 'sec1',
                topic: 'Critical path method',
                conceptRefs: ['c1'],
                resourceRefs: [],
              },
            ],
          },
        ],
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'critical path project scheduling',
              sources: [
                {
                  provider: 'openlibrary',
                  kind: 'book metadata',
                  title: 'Critical Path Project Management',
                  url: 'https://openlibrary.org/works/OL111W',
                  license: 'Open Library public metadata',
                  snippet: 'Bibliographic metadata for a critical path book.',
                },
                {
                  provider: 'openalex',
                  kind: 'peer-reviewed reading',
                  title: 'Critical Path Scheduling in Project Controls',
                  doi: '10.1000/critical-path-openalex',
                  url: 'https://doi.org/10.1000/critical-path-openalex',
                  license: 'CC BY 4.0',
                  snippet: 'Critical path scheduling evidence for project control decisions.',
                },
                {
                  provider: 'crossref',
                  kind: 'scholarly work',
                  title: 'Network Scheduling and Critical Path Method',
                  doi: '10.1000/critical-path-crossref',
                  url: 'https://doi.org/10.1000/critical-path-crossref',
                  license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
                  snippet: 'Critical path network scheduling for project management.',
                },
                {
                  provider: 'crossref',
                  kind: 'scholarly work',
                  title: 'Test Plans',
                  doi: '10.1002/9780470316795.ch6',
                  url: 'https://doi.org/10.1002/9780470316795.ch6',
                  license: 'http://doi.wiley.com/10.1002/tdm_license_1.1',
                  snippet: 'Critical path test planning and schedule verification.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-27T00:00:00.000Z' },
    );

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows.map((row) => row.provider)).toEqual(['openalex']);
    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openalex',
          licenseAmbiguous: false,
          conceptLinks: [{ id: 'c1', label: 'Critical path method' }],
        }),
      ]),
    );
    expect(ledger.summary).toMatchObject({
      sourceCount: 1,
      trustedCount: 1,
      conceptLinkedCount: 1,
      trustedConceptLinkedCount: 1,
      licenseAmbiguousCount: 0,
    });
    expect(ledger.rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Test Plans',
          license: 'http://doi.wiley.com/10.1002/tdm_license_1.1',
        }),
      ]),
    );
  });

  it('counts only accessible non-ambiguous source-finder rows as trusted bibliography', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        concepts: [{ id: 'c1', term: 'Project charter' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Project charter', conceptRefs: ['c1'], resourceRefs: [] }],
          },
        ],
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'project charter',
              sources: [
                {
                  provider: 'wikipedia',
                  kind: 'encyclopedia background',
                  title: 'Project charter',
                  authors: 'Wikipedia contributors',
                  url: 'https://en.wikipedia.org/wiki/Project_charter',
                  license: 'CC BY-SA 4.0',
                  snippet: 'A project charter formally authorizes project work.',
                },
              ],
            },
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'project scheduling',
              sources: [
                {
                  provider: 'crossref',
                  kind: 'scholarly work',
                  title: 'Project Scheduling with DOI Metadata',
                  doi: '10.1000/project-schedule',
                  url: 'https://doi.org/10.1000/project-schedule',
                  license: 'Crossref public metadata',
                  snippet: 'Bibliographic metadata for a project scheduling source.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-26T00:00:00.000Z' },
    );

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({
      sourceCount: 1,
      trustedCount: 1,
      conceptLinkedCount: 1,
      trustedConceptLinkedCount: 1,
      accessibleCount: 1,
      licenseAmbiguousCount: 0,
    });
    expect(ledger.rows[0]).toMatchObject({
      provider: 'wikipedia',
      trustLevel: 'licensed-background-source',
      licenseAmbiguous: false,
      conceptLinks: [{ id: 'c1', label: 'Project charter' }],
    });
    expect(ledger.summary.reviewRequiredCount || 0).toBe(0);
  });

  it('drops metadata-only source-finder fallbacks instead of exporting review debt', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        concepts: [{ id: 'c1', term: 'Project charter' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [{ id: 'sec1', topic: 'Project charter', conceptRefs: ['c1'], resourceRefs: [] }],
          },
        ],
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 1,
              topic: 'project charter',
              sources: [
                {
                  provider: 'openlibrary',
                  kind: 'book metadata',
                  title: 'Project Management Metadata',
                  url: 'https://openlibrary.org/works/OL3429343W',
                  license: 'Open Library public metadata',
                  snippet: 'Bibliographic metadata for a project management title.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-27T00:00:00.000Z' },
    );

    expect(ledger).toBeNull();
    const report = buildSourceReportMarkdown({ courseName: 'Project Management', sourceLedger: ledger });
    expect(report).toBe('');
  });

  it('drops unused UX source-finder false friends when trusted topic sources exist', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [{ id: 'c1', term: 'project feedback' }],
        sessions: [
          {
            id: 's1',
            number: 2,
            title: 'Critique session',
            sections: [{ id: 'sec1', topic: 'project feedback', conceptRefs: ['c1'], resourceRefs: [] }],
          },
        ],
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 2,
              topic: 'project feedback',
              sources: [
                {
                  provider: 'wikipedia',
                  kind: 'background source',
                  title: 'Positive feedback',
                  url: 'https://en.wikipedia.org/wiki/Positive_feedback',
                  license: 'CC BY-SA 4.0',
                  snippet: 'Positive feedback is a system process that amplifies change.',
                },
                {
                  provider: 'openalex',
                  kind: 'journal article',
                  title: 'The Green Studio Handbook: Environmental Strategies for Schematic Design',
                  url: 'https://www.arcc-journal.org/index.php/arccjournal/article/download/47/46',
                  doi: '10.17831/enq:arcc.v4i2.47',
                  license: 'CC BY-NC-SA',
                  snippet:
                    'Environmental strategies for schematic design covers daylight, airflow, and green building decisions.',
                },
                {
                  provider: 'wikipedia',
                  kind: 'background source',
                  title: 'National Design Studio',
                  url: 'https://en.wikipedia.org/wiki/National_Design_Studio',
                  license: 'CC BY-SA 4.0',
                  snippet: 'The National Design Studio is an agency of the White House Office.',
                },
                {
                  provider: 'wikipedia',
                  kind: 'background source',
                  title: 'Le Mans Prototype',
                  url: 'https://en.wikipedia.org/wiki/Le_Mans_Prototype',
                  license: 'CC BY-SA 4.0',
                  snippet: 'A Le Mans Prototype is a sports prototype race car class.',
                },
                {
                  provider: 'wikipedia',
                  kind: 'background source',
                  title: 'List of In Living Color sketches',
                  url: 'https://en.wikipedia.org/wiki/List_of_In_Living_Color_sketches',
                  license: 'CC BY-SA 4.0',
                  snippet: 'This is a list of sketches on In Living Color.',
                },
                {
                  provider: 'openalex',
                  kind: 'journal article',
                  title:
                    'Collaborative learning in architectural education: Benefits of combining conventional studio, virtual design studio and live projects',
                  url: 'https://pureadmin.qub.ac.uk/ws/files/164352510/BLIND_REVIEW_Collaborative_Distance_learning_in_Architecture_final_submission_.pdf',
                  license: 'other-oa',
                  snippet: 'Architectural education studio projects and distance learning in architecture.',
                },
                {
                  provider: 'openalex',
                  kind: 'journal article',
                  title: 'Understanding Collaborative Practices and Tools of Professional UX Practitioners',
                  url: 'https://dl.acm.org/doi/pdf/10.1145/3544548.3581273',
                  doi: '10.1145/3544548.3581273',
                  license: 'CC BY',
                  snippet: 'Study of user experience practitioners, design handoff, critique, and collaboration.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-27T00:00:00.000Z' },
    );

    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openalex',
          title: expect.stringContaining('UX Practitioners'),
          conceptLinks: [{ id: 'c1', label: 'project feedback' }],
        }),
      ]),
    );
    expect(ledger.rows.map((row) => row.title)).not.toContain('Positive feedback');
    expect(ledger.rows.map((row) => row.title)).not.toContain(
      'The Green Studio Handbook: Environmental Strategies for Schematic Design',
    );
    expect(ledger.rows.map((row) => row.title)).not.toContain('National Design Studio');
    expect(ledger.rows.map((row) => row.title)).not.toContain('Le Mans Prototype');
    expect(ledger.rows.map((row) => row.title)).not.toContain('List of In Living Color sketches');
    expect(ledger.rows.map((row) => row.title)).not.toContain(
      'Collaborative learning in architectural education: Benefits of combining conventional studio, virtual design studio and live projects',
    );
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1 });
    expect(ledger.summary.reviewRequiredCount || 0).toBe(0);
  });

  it('drops bare refinement false friends from UX source proof', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'refinement' },
          { id: 'c2', term: 'critique response' },
          { id: 'c3', term: 'implementation' },
        ],
        sessions: [
          {
            id: 's8',
            number: 8,
            title: 'Design iteration',
            sections: [{ id: 'sec8', topic: 'refinement', conceptRefs: ['c1', 'c2', 'c3'], resourceRefs: [] }],
          },
        ],
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's8',
              lessonNumber: 8,
              topic: 'refinement, critique response, implementation',
              sources: [
                {
                  provider: 'crossref',
                  kind: 'chapter',
                  title: 'Relating Data Refinement and Failures-Divergences Refinement',
                  url: 'https://doi.org/10.1007/978-3-319-92711-4_10',
                  doi: '10.1007/978-3-319-92711-4_10',
                  license: 'http://www.springer.com/tdm',
                  snippet: 'Formal methods chapter about data refinement and failures-divergences refinement.',
                },
                {
                  provider: 'crossref',
                  kind: 'chapter',
                  title: 'Vehicle refinement: purpose and targets',
                  url: 'https://doi.org/10.1016/b978-075066129-4/50003-1',
                  doi: '10.1016/b978-075066129-4/50003-1',
                  license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
                  snippet: 'Automotive engineering chapter about vehicle refinement targets.',
                },
                {
                  provider: 'wikipedia',
                  kind: 'encyclopedia background',
                  title: 'Iterative design',
                  url: 'https://en.wikipedia.org/wiki/Iterative_design',
                  license: 'CC BY-SA 4.0',
                  snippet:
                    'Iterative design is a design methodology based on prototyping, testing, analysis, and refinement.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-28T00:00:00.000Z' },
    );

    expect(ledger.rows.map((row) => row.title)).toEqual(['Iterative design']);
    expect(ledger.rows.map((row) => row.title)).not.toContain(
      'Relating Data Refinement and Failures-Divergences Refinement',
    );
    expect(ledger.rows.map((row) => row.title)).not.toContain('Vehicle refinement: purpose and targets');
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1 });
  });

  it('drops health gamification reviews from UX critique source proof', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c7', term: 'concept review' },
          { id: 'c8', term: 'peer feedback' },
          { id: 'c9', term: 'iteration' },
        ],
        sessions: [
          {
            id: 's3',
            number: 3,
            title: 'Critique session',
            sections: [
              {
                id: 'sec3',
                topic: 'concept review',
                conceptRefs: ['c7', 'c8', 'c9'],
                resourceRefs: ['sf-health-gamification', 'sf-ux-collaboration'],
              },
            ],
          },
        ],
        resources: [
          {
            id: 'sf-health-gamification',
            origin: 'source-finder',
            provider: 'openalex',
            kind: 'journal article',
            title: 'Gamification for health and wellbeing: A systematic review of the literature',
            url: 'https://doi.org/10.1016/j.invent.2016.10.002',
            doi: '10.1016/j.invent.2016.10.002',
            license: 'CC BY',
            snippet:
              'Compared to traditional persuasive technology and health games, gamification is used for motivating behaviour change for health and wellbeing.',
            sessionRefs: ['s3'],
          },
          {
            id: 'sf-ux-collaboration',
            origin: 'source-finder',
            provider: 'openalex',
            kind: 'journal article',
            title: 'Understanding Collaborative Practices and Tools of Professional UX Practitioners',
            url: 'https://dl.acm.org/doi/pdf/10.1145/3544548.3581273',
            doi: '10.1145/3544548.3581273',
            license: 'CC BY',
            snippet: 'Study of user experience practitioners, design handoff, critique, and collaboration.',
            sessionRefs: ['s3'],
          },
        ],
      },
      { checkedAt: '2026-06-28T00:00:00.000Z' },
    );

    expect(ledger.rows.map((row) => row.title)).toContain(
      'Understanding Collaborative Practices and Tools of Professional UX Practitioners',
    );
    expect(ledger.rows.map((row) => row.title)).not.toContain(
      'Gamification for health and wellbeing: A systematic review of the literature',
    );
    expect(ledger.reviewRows || []).toHaveLength(0);
  });

  it('drops source-finder bycatch review rows from the v0.15.93 UX audit shape', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'studio process' },
          { id: 'c2', term: 'critique sessions' },
          { id: 'c3', term: 'design journals' },
          { id: 'c4', term: 'test planning' },
          { id: 'c5', term: 'task design' },
          { id: 'c6', term: 'results' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            title: 'Course overview',
            sections: [{ id: 'sec1', topic: 'studio process', conceptRefs: ['c1', 'c2', 'c3'], resourceRefs: [] }],
          },
          {
            id: 's8',
            number: 8,
            title: 'Usability testing',
            sections: [{ id: 'sec8', topic: 'test planning', conceptRefs: ['c4', 'c5', 'c6'], resourceRefs: [] }],
          },
        ],
        resources: [
          {
            id: 'sf1',
            origin: 'source-finder',
            provider: 'wikipedia',
            kind: 'encyclopedia background',
            title: 'List of Studio Ghibli works',
            url: 'https://en.wikipedia.org/wiki/List_of_Studio_Ghibli_works',
            license: 'CC BY-SA 4.0',
            snippet: 'This is a list of works by the Japanese animation studio Studio Ghibli.',
            sessionRefs: ['s1'],
          },
          {
            id: 'sf-prototype-programming',
            origin: 'source-finder',
            provider: 'wikipedia',
            kind: 'encyclopedia background',
            title: 'Prototype-based programming',
            url: 'https://en.wikipedia.org/wiki/Prototype-based_programming',
            license: 'CC BY-SA 4.0',
            snippet:
              'Prototype-based programming is a style of object-oriented programming in which behavior reuse uses existing objects as prototypes.',
            sessionRefs: ['s8'],
          },
          {
            id: 'sf-personas-metadata',
            origin: 'source-finder',
            provider: 'crossref',
            kind: 'book-chapter',
            title: 'Personas',
            url: 'https://doi.org/10.2307/j.ctvm7bc5k.4',
            doi: '10.2307/j.ctvm7bc5k.4',
            license: 'Crossref public metadata',
            snippet: 'Crossref public metadata for a persona chapter.',
            sessionRefs: ['s1'],
          },
          {
            id: 'sf-mercator',
            origin: 'source-finder',
            provider: 'wikipedia',
            kind: 'encyclopedia background',
            title: 'Mercator projection',
            url: 'https://en.wikipedia.org/wiki/Mercator_projection',
            license: 'CC BY-SA 4.0',
            snippet:
              'The Mercator projection is a conformal cylindrical map projection used for navigation and rhumb lines.',
            sessionRefs: ['s1'],
          },
          {
            id: 'sf-persona-4-revival',
            origin: 'source-finder',
            provider: 'wikipedia',
            kind: 'encyclopedia background',
            title: 'Persona 4 Revival',
            url: 'https://en.wikipedia.org/wiki/Persona_4_Revival',
            license: 'CC BY-SA 4.0',
            snippet:
              'Persona 4 Revival is an upcoming role-playing video game developed by P-Studio and published by Atlus.',
            sessionRefs: ['s1'],
          },
          {
            id: 'sf-revelations-persona',
            origin: 'source-finder',
            provider: 'wikipedia',
            kind: 'encyclopedia background',
            title: 'Revelations: Persona',
            url: 'https://en.wikipedia.org/wiki/Revelations:_Persona',
            license: 'CC BY-SA 4.0',
            snippet: 'Revelations: Persona is a 1996 role-playing video game and part of the Megami Tensei franchise.',
            sessionRefs: ['s1'],
          },
          {
            id: 'sf-prototype-video-game',
            origin: 'source-finder',
            provider: 'wikipedia',
            kind: 'encyclopedia background',
            title: 'Prototype (video game)',
            url: 'https://en.wikipedia.org/wiki/Prototype_(video_game)',
            license: 'CC BY-SA 4.0',
            snippet: 'Prototype is a 2009 action-adventure video game developed by Radical Entertainment.',
            sessionRefs: ['s8'],
          },
          {
            id: 'sf2',
            origin: 'source-finder',
            provider: 'wikipedia',
            kind: 'encyclopedia background',
            title: 'A/B testing',
            url: 'https://en.wikipedia.org/wiki/A/B_testing',
            license: 'CC BY-SA 4.0',
            snippet: 'A/B testing is a user-experience research method for comparing interface variants.',
            sessionRefs: ['s8'],
          },
        ],
      },
      { checkedAt: '2026-06-28T00:00:00.000Z' },
    );

    expect(ledger.rows.map((row) => row.title)).toContain('A/B testing');
    expect(ledger.rows.map((row) => row.title)).not.toContain('List of Studio Ghibli works');
    expect(ledger.rows.map((row) => row.title)).not.toContain('Prototype-based programming');
    expect(ledger.rows.map((row) => row.title)).not.toContain('Personas');
    expect(ledger.rows.map((row) => row.title)).not.toContain('Mercator projection');
    expect(ledger.rows.map((row) => row.title)).not.toContain('Persona 4 Revival');
    expect(ledger.rows.map((row) => row.title)).not.toContain('Revelations: Persona');
    expect(ledger.rows.map((row) => row.title)).not.toContain('Prototype (video game)');
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1 });
    expect(ledger.summary.reviewRequiredCount || 0).toBe(0);
  });

  it('promotes DOI-backed licensed syllabus readings instead of exporting them as review notes', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'UX design studio overview' },
          { id: 'c2', term: 'project scope' },
          { id: 'c3', term: 'critique culture' },
        ],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [
              {
                id: 'sec1',
                topic: 'UX design studio overview',
                conceptRefs: ['c1', 'c2', 'c3'],
                resourceRefs: ['syllabus-src-1-1'],
              },
            ],
          },
        ],
        resources: [
          {
            id: 'syllabus-src-1-1',
            origin: 'syllabus',
            kind: 'weekly reading',
            citation:
              'Qian Yang, Aaron Steinfeld, Carolyn Penstein Rosé et al. (2020). Re-examining Whether, Why, and How Human-AI Interaction Is Uniquely Difficult to Design. Open-access via https://dl.acm.org/doi/pdf/10.1145/3313831.3376301 (cc-by)',
            sessionRefs: [1],
          },
        ],
      },
      { checkedAt: '2026-06-28T00:00:00.000Z' },
    );

    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'syllabus-src-1-1',
          provider: 'crossref',
          doi: '10.1145/3313831.3376301',
          license: 'CC BY',
          licenseAmbiguous: false,
          conceptLinks: expect.arrayContaining([{ id: 'c1', label: 'UX design studio overview' }]),
        }),
      ]),
    );
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({
      sourceCount: 1,
      trustedCount: 1,
      trustedConceptLinkedCount: 1,
      licenseAmbiguousCount: 0,
    });
  });

  it('drops generated syllabus public-metadata false friends from UX source review rows', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [{ id: 'c1', term: 'Design journals' }],
        sessions: [
          {
            id: 's1',
            number: 1,
            sections: [
              { id: 'sec1', topic: 'Design journals', conceptRefs: ['c1'], resourceRefs: ['syllabus-src-1-1'] },
            ],
          },
        ],
        resources: [
          {
            id: 'syllabus-src-1-1',
            origin: 'syllabus',
            kind: 'weekly reading',
            title:
              'Crossref public metadata (2022). Journals of Mechatronics Machine Design and Manufacturing. Crossref: https://doi.org/10.46610/jmmdm (Crossref public metadata)',
            url: 'https://doi.org/10.46610/jmmdm',
            doi: '10.46610/jmmdm',
            license: 'Crossref public metadata',
            sessionRefs: [1],
          },
        ],
      },
      { checkedAt: '2026-06-28T00:00:00.000Z' },
    );

    expect(ledger).toBeNull();
  });

  it('drops generic iteration background pages from UX source-finder trusted proof', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'design iteration' },
          { id: 'c2', term: 'peer critique' },
          { id: 'c3', term: 'revision planning' },
        ],
        sessions: [
          {
            id: 's1',
            number: 7,
            title: 'Lesson 7: Design iteration',
            sections: [{ id: 'sec1', topic: 'design iteration', conceptRefs: ['c1', 'c2', 'c3'] }],
          },
        ],
        edges: {
          teaches: [
            { from: 's1', to: 'c1' },
            { from: 's1', to: 'c2' },
            { from: 's1', to: 'c3' },
          ],
        },
        resources: [],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 7,
              topic: 'design iteration',
              sources: [
                {
                  provider: 'wikipedia',
                  kind: 'encyclopedia background',
                  title: 'Fixed-point iteration',
                  url: 'https://en.wikipedia.org/wiki/Fixed-point_iteration',
                  license: 'CC BY-SA 4.0',
                  snippet: 'In mathematics, fixed-point iteration is a method of computing fixed points of functions.',
                },
                {
                  provider: 'wikipedia',
                  kind: 'encyclopedia background',
                  title: 'Iteration',
                  url: 'https://en.wikipedia.org/wiki/Iteration',
                  license: 'CC BY-SA 4.0',
                  snippet: 'Iteration is the repetition of a process in order to generate a sequence of outcomes.',
                },
                {
                  provider: 'wikipedia',
                  kind: 'encyclopedia background',
                  title: 'Iterative design',
                  url: 'https://en.wikipedia.org/wiki/Iterative_design',
                  license: 'CC BY-SA 4.0',
                  snippet:
                    'Iterative design is a design methodology based on prototyping, testing, analysis, and refinement.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-28T00:00:00.000Z' },
    );

    expect(ledger.rows.map((row) => row.title)).toEqual(['Iterative design']);
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1 });
  });

  it('drops covered weak UX knowledge bycatch instead of exporting it as instructor review debt', () => {
    const ledger = buildSourceLedgerFromCourseGraph(
      {
        course: { name: 'User Experience Design Studio' },
        concepts: [
          { id: 'c1', term: 'personas' },
          { id: 'c2', term: 'journey maps' },
          { id: 'c3', term: 'design questions' },
        ],
        sessions: [
          {
            id: 's1',
            number: 3,
            title: 'Research insights and problem framing',
            sections: [
              { id: 'sec1', topic: 'personas', conceptRefs: ['c1', 'c2', 'c3'], resourceRefs: ['bad', 'good'] },
            ],
          },
        ],
        resources: [
          {
            id: 'bad',
            provider: 'openalex',
            title:
              'Metaverse beyond the hype: Multidisciplinary perspectives on emerging challenges, opportunities, and agenda for research, practice and policy',
            doi: '10.1016/j.ijinfomgt.2022.102542',
            license: 'CC BY-NC-ND',
            url: 'https://doi.org/10.1016/j.ijinfomgt.2022.102542',
          },
          {
            id: 'good',
            provider: 'openalex',
            title:
              'Optimizing the digital customer journey with personas for individualized user interface adaptations',
            doi: '10.1002/cb.1964',
            license: 'CC BY-NC-ND',
            url: 'https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/cb.1964',
          },
        ],
        sourceFinderMiniShard: {
          topics: [
            {
              sessionId: 's1',
              lessonNumber: 3,
              topic: 'personas',
              sources: [
                {
                  provider: 'wikipedia',
                  kind: 'background source',
                  title: 'Persona (series)',
                  url: 'https://en.wikipedia.org/wiki/Persona_(series)',
                  license: 'CC BY-SA 4.0',
                  snippet: 'Persona is a role-playing video game series.',
                },
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-27T00:00:00.000Z' },
    );

    expect(ledger.rows.map((row) => row.title)).toEqual([
      'Optimizing the digital customer journey with personas for individualized user interface adaptations',
    ]);
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1 });
    expect(ledger.summary.reviewRequiredCount).toBeUndefined();
  });

  it('drops v0.15.113 UX licensed false friends while keeping discipline-matched source proof', () => {
    const graph = {
      course: { name: 'User Experience Design Studio' },
      concepts: [
        { id: 'c2', term: 'critique sessions' },
        { id: 'c3', term: 'design journals' },
        { id: 'c4', term: 'usability testing' },
        { id: 'c5', term: 'design research' },
        { id: 'c6', term: 'prototyping' },
        { id: 'c7', term: 'accessibility review' },
      ],
      sessions: [
        {
          id: 's1',
          number: 1,
          title: 'Critique and accessibility review',
          sections: [{ id: 'sec1', topic: 'critique sessions', conceptRefs: ['c2', 'c3', 'c7'] }],
        },
        {
          id: 's2',
          number: 2,
          title: 'Research and prototyping',
          sections: [{ id: 'sec2', topic: 'design research', conceptRefs: ['c4', 'c5', 'c6'] }],
        },
      ],
      edges: {
        teaches: [
          { from: 's1', to: 'c2' },
          { from: 's1', to: 'c3' },
          { from: 's1', to: 'c7' },
          { from: 's2', to: 'c4' },
          { from: 's2', to: 'c5' },
          { from: 's2', to: 'c6' },
        ],
      },
      resources: [],
      sourceFinderMiniShard: {
        topics: [
          {
            sessionId: 's1',
            lessonNumber: 1,
            topic: 'critique sessions, design journals, accessibility review',
            sources: [
              {
                provider: 'crossref',
                kind: 'journal-article',
                title: 'A Critique of Private Sessions in Family Mediation',
                doi: '10.1177/2158244013478950',
                url: 'https://doi.org/10.1177/2158244013478950',
                license: 'https://journals.sagepub.com/page/policies/text-and-data-mining-license',
                snippet:
                  'A critical examination of private sessions and caucuses in family mediation with mediators and disputants.',
              },
              {
                provider: 'crossref',
                kind: 'journal-article',
                title:
                  'The efficacy of booster maintenance sessions in behavior therapy: Review and methodological critique',
                doi: '10.1016/0272-7358(90)90055-f',
                url: 'https://doi.org/10.1016/0272-7358(90)90055-f',
                license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
                snippet: 'A behavior therapy review about booster maintenance sessions and methodological critique.',
              },
              {
                provider: 'wikipedia',
                kind: 'encyclopedia background',
                title: 'Accessibility of the Metropolitan Transportation Authority',
                url: 'https://en.wikipedia.org/wiki/Accessibility_of_the_Metropolitan_Transportation_Authority',
                license: 'CC BY-SA 4.0',
                snippet: 'Physical accessibility of the Metropolitan Transportation Authority public transit network.',
              },
              {
                provider: 'openalex',
                kind: 'conference paper',
                title: 'Understanding Collaborative Practices and Tools of Professional UX Practitioners',
                doi: '10.1145/3544548.3581273',
                url: 'https://dl.acm.org/doi/pdf/10.1145/3544548.3581273',
                license: 'CC BY',
                snippet: 'Study of user experience practitioners, critique, design handoff, and collaboration.',
              },
            ],
          },
          {
            sessionId: 's2',
            lessonNumber: 2,
            topic: 'design research, usability testing, prototyping',
            sources: [
              {
                provider: 'wikipedia',
                kind: 'encyclopedia background',
                title: 'Design Research (store)',
                url: 'https://en.wikipedia.org/wiki/Design_Research_(store)',
                license: 'CC BY-SA 4.0',
                snippet: 'Design Research was a retail lifestyle store founded in Cambridge, Massachusetts.',
              },
              {
                provider: 'crossref',
                kind: 'book-chapter',
                title: 'International usability testing',
                doi: '10.1016/b978-0-12-816942-1.00010-1',
                url: 'https://doi.org/10.1016/b978-0-12-816942-1.00010-1',
                license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
                snippet: 'International usability testing methods for user research and prototyping.',
              },
            ],
          },
        ],
      },
    };

    const ledger = buildSourceLedgerFromCourseGraph(graph, { checkedAt: '2026-06-29T00:00:00.000Z' });
    const titles = ledger.rows.map((row) => row.title);

    expect(titles).toContain('Understanding Collaborative Practices and Tools of Professional UX Practitioners');
    expect(titles).not.toContain('International usability testing');
    expect(titles).not.toContain('A Critique of Private Sessions in Family Mediation');
    expect(titles).not.toContain(
      'The efficacy of booster maintenance sessions in behavior therapy: Review and methodological critique',
    );
    expect(titles).not.toContain('Accessibility of the Metropolitan Transportation Authority');
    expect(titles).not.toContain('Design Research (store)');
    expect(ledger.reviewRows || []).toHaveLength(0);
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1 });
  });

  it('drops v0.15.97 UX false-friend sources even when they are licensed and concept-linked', () => {
    const graph = {
      course: { name: 'User Experience Design Studio' },
      concepts: [
        { id: 'c1', term: 'critique' },
        { id: 'c2', term: 'personas' },
        { id: 'c3', term: 'sketches' },
        { id: 'c4', term: 'prototypes' },
      ],
      sessions: [
        { id: 's1', number: 1, title: 'Lesson 1: Critique', sections: [{ conceptRefs: ['c1'] }] },
        { id: 's2', number: 2, title: 'Lesson 2: Personas', sections: [{ conceptRefs: ['c2'] }] },
        { id: 's3', number: 3, title: 'Lesson 3: Sketches', sections: [{ conceptRefs: ['c3'] }] },
        { id: 's4', number: 4, title: 'Lesson 4: Prototypes', sections: [{ conceptRefs: ['c4'] }] },
      ],
      edges: {
        teaches: [
          { from: 's1', to: 'c1' },
          { from: 's2', to: 'c2' },
          { from: 's3', to: 'c3' },
          { from: 's4', to: 'c4' },
        ],
      },
      resources: [],
      sourceFinderMiniShard: {
        topics: [
          {
            sessionId: 's1',
            lessonNumber: 1,
            topic: 'critique',
            sources: [
              {
                provider: 'crossref',
                kind: 'book-chapter',
                title: 'Le poème, critique de la critique',
                doi: '10.4000/books.pur.28695',
                url: 'https://doi.org/10.4000/books.pur.28695',
                license: 'https://www.openedition.org/12554',
                snippet: 'critique',
              },
              {
                provider: 'wikipedia',
                kind: 'encyclopedia background',
                title: 'Critique of Pure Reason',
                url: 'https://en.wikipedia.org/wiki/Critique_of_Pure_Reason',
                license: 'CC BY-SA 4.0',
                snippet: 'A book by Immanuel Kant about metaphysics.',
              },
            ],
          },
          {
            sessionId: 's2',
            lessonNumber: 2,
            topic: 'persona creation',
            sources: [
              {
                provider: 'crossref',
                kind: 'journal-article',
                title: "A network of enterprise's study of Tim Minchin and the creation of a creative public persona",
                doi: '10.21153/psj2026vol12no1art2272',
                url: 'https://doi.org/10.21153/psj2026vol12no1art2272',
                license: 'https://creativecommons.org/licenses/by-nc/4.0',
                snippet: 'A celebrity public persona case study about Tim Minchin and creative work.',
              },
              {
                provider: 'crossref',
                kind: 'journal-article',
                title: 'Why Are Personas the Way They Are?',
                doi: '10.21153/psj2025vol11noart2002',
                url: 'https://doi.org/10.21153/psj2025vol11noart2002',
                license: 'https://creativecommons.org/licenses/by-nc/4.0',
                snippet: 'User personas are well-established in user-centered design and persona creation.',
              },
            ],
          },
          {
            sessionId: 's3',
            lessonNumber: 3,
            topic: 'sketches',
            sources: [
              {
                provider: 'wikipedia',
                kind: 'encyclopedia background',
                title: 'Sketches of Spain',
                url: 'https://en.wikipedia.org/wiki/Sketches_of_Spain',
                license: 'CC BY-SA 4.0',
                snippet: 'A studio album by jazz musician Miles Davis.',
              },
              {
                provider: 'crossref',
                kind: 'book-chapter',
                title: 'Information Architecture and Wireframe Sketching',
                doi: '10.1000/ux-sketching',
                url: 'https://doi.org/10.1000/ux-sketching',
                license: 'CC BY',
                snippet: 'Wireframe sketching and information architecture for user interface design.',
              },
            ],
          },
          {
            sessionId: 's4',
            lessonNumber: 4,
            topic: 'prototype',
            sources: [
              {
                provider: 'crossref',
                kind: 'journal-article',
                title: 'One Prototype Three Prototype Five Prototype Seven Prototype',
                doi: '10.1109/mdt.1986.295018',
                url: 'https://doi.org/10.1109/mdt.1986.295018',
                license: 'https://ieeexplore.ieee.org/Xplorehelp/downloads/license-information/IEEE.html',
                snippet: '',
              },
              {
                provider: 'wikipedia',
                kind: 'encyclopedia background',
                title: 'Prototype (Star Trek: Voyager)',
                url: 'https://en.wikipedia.org/wiki/Prototype_(Star_Trek:_Voyager)',
                license: 'CC BY-SA 4.0',
                snippet: 'A science fiction television series episode.',
              },
              {
                provider: 'crossref',
                kind: 'book-chapter',
                title: 'Functional Prototypes for Usability Testing',
                doi: '10.1000/ux-prototypes',
                url: 'https://doi.org/10.1000/ux-prototypes',
                license: 'CC BY',
                snippet: 'Clickable prototypes and usability testing for interaction design iteration.',
              },
            ],
          },
        ],
      },
    };

    const ledger = buildSourceLedgerFromCourseGraph(graph, { checkedAt: '2026-06-28T00:00:00.000Z' });

    expect(ledger.rows.map((row) => row.title)).toEqual([
      'Why Are Personas the Way They Are?',
      'Information Architecture and Wireframe Sketching',
      'Functional Prototypes for Usability Testing',
    ]);
    expect(ledger.reviewRows || []).toHaveLength(0);
  });
});
