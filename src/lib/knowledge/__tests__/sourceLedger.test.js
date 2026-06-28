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

  it('recovers Crossref license URLs and full DOI URLs from rendered source text', () => {
    const ledger = buildSourceLedgerFromCourseGraph({
      sessions: [{ id: 's1', number: 1, sections: [{ topic: 'Runway', resourceRefs: ['r1'] }] }],
      resources: [
        {
          id: 'r1',
          origin: 'syllabus',
          citation:
            'Masanao Aoki (1987). No unit root conditions for bivariate series when a component univariate series has a unit root. Crossref: https://doi.org/10.1016/0165-1765(87)90086-3 (https://www.elsevier.com/tdm/userlicense/1.0/)',
          sessionRefs: [1],
        },
      ],
    });

    expect(ledger.rows[0]).toMatchObject({
      id: 'r1',
      provider: 'crossref',
      doi: '10.1016/0165-1765(87)90086-3',
      url: 'https://doi.org/10.1016/0165-1765(87)90086-3',
      license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
      licenseAmbiguous: false,
      accessStatus: 'reference-present',
    });
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
              ],
            },
          ],
        },
      },
      { checkedAt: '2026-06-27T00:00:00.000Z' },
    );

    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows.map((row) => row.provider)).toEqual(['openalex', 'crossref']);
    expect(ledger.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openalex',
          licenseAmbiguous: false,
          conceptLinks: [{ id: 'c1', label: 'Critical path method' }],
        }),
        expect.objectContaining({
          provider: 'crossref',
          licenseAmbiguous: false,
          conceptLinks: [{ id: 'c1', label: 'Critical path method' }],
        }),
      ]),
    );
    expect(ledger.summary).toMatchObject({
      sourceCount: 2,
      trustedCount: 2,
      conceptLinkedCount: 2,
      trustedConceptLinkedCount: 2,
      licenseAmbiguousCount: 0,
    });
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
    expect(ledger.reviewRows).toHaveLength(1);
    expect(ledger.summary).toMatchObject({
      sourceCount: 1,
      trustedCount: 1,
      conceptLinkedCount: 1,
      trustedConceptLinkedCount: 1,
      accessibleCount: 1,
      licenseAmbiguousCount: 0,
      reviewRequiredCount: 1,
    });
    expect(ledger.rows[0]).toMatchObject({
      provider: 'wikipedia',
      trustLevel: 'licensed-background-source',
      licenseAmbiguous: false,
      conceptLinks: [{ id: 'c1', label: 'Project charter' }],
    });
    expect(ledger.reviewRows[0]).toMatchObject({
      provider: 'crossref',
      trustLevel: 'academic-metadata',
      licenseAmbiguous: true,
    });
  });

  it('quarantines metadata-only source-finder fallbacks as review notes', () => {
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

    expect(ledger.rows).toHaveLength(0);
    expect(ledger.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openlibrary',
          licenseAmbiguous: true,
          conceptLinks: [{ id: 'c1', label: 'Project charter' }],
        }),
      ]),
    );
    expect(ledger.summary).toMatchObject({ sourceCount: 0, trustedCount: 0, reviewRequiredCount: 1 });
    const report = buildSourceReportMarkdown({ courseName: 'Project Management', sourceLedger: ledger });
    expect(report).toContain('Source Review Notes');
    expect(report).toContain('trustedBibliography=false');
    expect(report).not.toContain('## Source Ledger');
  });

  it('quarantines UX source-finder false friends as review notes', () => {
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
    expect(ledger.rows.map((row) => row.title)).not.toContain(
      'Collaborative learning in architectural education: Benefits of combining conventional studio, virtual design studio and live projects',
    );
    expect(ledger.reviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'wikipedia',
          title: 'Positive feedback',
          conceptLinks: [{ id: 'c1', label: 'project feedback' }],
        }),
        expect.objectContaining({
          provider: 'openalex',
          title: 'The Green Studio Handbook: Environmental Strategies for Schematic Design',
          conceptLinks: [{ id: 'c1', label: 'project feedback' }],
        }),
        expect.objectContaining({
          provider: 'wikipedia',
          title: 'National Design Studio',
          conceptLinks: [{ id: 'c1', label: 'project feedback' }],
        }),
        expect.objectContaining({
          provider: 'wikipedia',
          title: 'Le Mans Prototype',
          conceptLinks: [{ id: 'c1', label: 'project feedback' }],
        }),
        expect.objectContaining({
          provider: 'openalex',
          title:
            'Collaborative learning in architectural education: Benefits of combining conventional studio, virtual design studio and live projects',
          conceptLinks: [{ id: 'c1', label: 'project feedback' }],
        }),
      ]),
    );
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1, reviewRequiredCount: 5 });
  });

  it('quarantines weak UX knowledge resources before they become trusted ledger rows', () => {
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
    expect(ledger.reviewRows.map((row) => row.title)).toEqual(
      expect.arrayContaining([expect.stringContaining('Metaverse beyond the hype'), 'Persona (series)']),
    );
    expect(ledger.summary).toMatchObject({ sourceCount: 1, trustedConceptLinkedCount: 1, reviewRequiredCount: 2 });
  });
});
