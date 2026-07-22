import { describe, expect, it } from 'vitest';
import { grade } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';

describe('source-ledger quality checks', () => {
  it('flags biomedical and timing false friends trusted by a music-interval ledger', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Interval Evidence Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          assessments: [
            {
              title: 'Interval classification and inversion analysis with inspectable pitch and semitone evidence',
            },
          ],
          sourceLedger: [
            {
              id: 'kr1',
              title: 'Biochemistry Changes That Occur after Death: Post-Mortem Interval',
              provider: 'openalex',
              url: 'https://example.org/post-mortem-interval',
              license: 'CC BY',
              conceptLinks: [{ id: 'c2', label: 'Compound Intervals' }],
            },
            {
              id: 'sf2',
              title: 'Metronome',
              evidence: 'A click at a uniform interval measured in beats per minute.',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Metronome',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c2', label: 'Compound Intervals' }],
            },
            {
              id: 'good',
              title: 'Interval (music)',
              evidence: 'Music theory description of pitch distance, semitones, and interval quality.',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Interval_(music)',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c2', label: 'Compound Intervals' }],
            },
          ],
          sourceReport: { path: 'SOURCE_REPORT.md', sourceCount: 3 },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report',
      }),
      course: { title: 'Interval Evidence Studio', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).toContain('source ledger row kr1 is off-discipline for Music Theory intervals');
    expect(details).toContain('source ledger row sf2 is off-discipline for Music Theory intervals');
    expect(details).not.toContain('source ledger row good is off-discipline for Music Theory intervals');
  });

  it('counts cached knowledge lessons when checking cross-surface honesty', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Cached UX Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          pipeline: {
            genomeLinker: '0 genome + 3 cached of 3 lessons (0 concepts, 0 citations, 0 bridges)',
            knowledgeBackbone: '3/3 lessons genome-linked · 2 cited open resources',
          },
          files: [],
        }),
      }),
      honesty: {
        genomeLinker: '0 genome + 3 cached of 3 lessons (0 concepts, 0 citations, 0 bridges)',
        knowledgeBackbone: '3/3 lessons genome-linked · 2 cited open resources',
        flaggedChecks: [],
      },
      course: { title: 'Cached UX Studio', featureIds: [] },
    });

    expect(
      result.findings.some((finding) => /genome-linked count disagrees across surfaces/i.test(finding.detail)),
    ).toBe(false);
  });

  it('counts only genome-backed cached lessons against knowledge-backbone coverage', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Cached UX Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          pipeline: {
            genomeLinker: '0 genome + 3 cached (1 genome-backed) of 3 lessons (0 concepts, 0 citations, 0 bridges)',
            knowledgeBackbone: '1/3 lessons genome-linked · 2 cited open resources',
          },
          files: [],
        }),
      }),
      honesty: {
        genomeLinker: '0 genome + 3 cached (1 genome-backed) of 3 lessons (0 concepts, 0 citations, 0 bridges)',
        knowledgeBackbone: '1/3 lessons genome-linked · 2 cited open resources',
        flaggedChecks: [],
      },
      course: { title: 'Cached UX Studio', featureIds: [] },
    });

    expect(
      result.findings.some((finding) => /genome-linked count disagrees across surfaces/i.test(finding.detail)),
    ).toBe(false);
  });

  it('flags source-backed pipeline packages that omit exported source proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Sociology Missing Source Proof',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          pipeline: {
            genomeLinker: '1 genome + 0 cached of 4 lessons (1 concepts, 1 citations, 0 bridges)',
            judgment: 'limited knowledge check (1 linked concept across 1 genome-linked lesson)',
          },
          files: [],
        }),
      }),
      course: { title: 'Sociology Missing Source Proof', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'honesty',
          detail: 'source-backed pipeline did not export sourceLedger, sourceRef coverage, or SOURCE_REPORT.md proof',
        }),
      ]),
    );
  });

  it('flags trusted source ledger rows with malformed URL proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'syllabus-src-4-1',
              title: 'Persona (user experience)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Persona_(user_experience',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c1', label: 'user profiles' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': [
          '# Source Report',
          '',
          '## Source Ledger',
          '- syllabus-src-4-1: Persona (user experience). https://en.wikipedia.org/wiki/Persona_(user_experience',
        ].join('\n'),
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P2',
          dimension: 'citations',
          detail: 'source ledger row syllabus-src-4-1 has malformed URL proof',
        }),
      ]),
    );
  });

  it('flags incomplete source refs, inaccessible sources, and ambiguous licenses from manifest proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Source Ledger Audit',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'SL1',
              title: 'A real open textbook section',
              provider: 'openstax',
              url: 'https://openstax.org/books/calculus-volume-1',
              license: 'CC BY-NC-SA 4.0',
            },
            {
              id: 'SL2',
              title: 'Unverified course packet',
              provider: 'source-finder',
              license: 'open access',
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 2,
            sourceRefCoverage: {
              categories: {
                outcomes: { total: 2, withRefs: 1, missing: 1, danglingRefs: 0, missingIds: ['L1-O2'] },
                factualClaims: { total: 1, withRefs: 0, missing: 1, danglingRefs: 0, missingIds: ['C1-fact-1'] },
                rubricCriteria: { total: 1, withRefs: 1, missing: 0, danglingRefs: 1, missingIds: [] },
              },
            },
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- SL1: A real open textbook section\n',
      }),
      course: { title: 'Source Ledger Audit', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).toEqual(
      expect.arrayContaining([
        'source ledger row SL2 has no accessible URL or DOI',
        'source ledger row SL2 has ambiguous or missing license',
        'outcomes sourceRef coverage is incomplete (1/2)',
        'factualClaims sourceRef coverage is incomplete (0/1)',
        'rubricCriteria contains 1 sourceRef(s) that do not resolve to the source ledger',
      ]),
    );
  });

  it('flags in-copyright rights statements as ambiguous source-ledger licenses', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'SL1',
              title: 'Accessibility Evaluation in Design Studios',
              provider: 'openalex',
              url: 'https://doi.org/10.1000/accessibility-studio',
              doi: '10.1000/accessibility-studio',
              license: 'http://rightsstatements.org/vocab/InC/1.0/',
              conceptLinks: [{ id: 'C1', label: 'Accessibility review' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- SL1: Accessibility Evaluation in Design Studios\n',
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P2',
          dimension: 'citations',
          detail: 'source ledger row SL1 has ambiguous or missing license',
        }),
      ]),
    );
  });

  it('flags publisher TDM license URLs as ambiguous source-ledger proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'sf3',
              title: 'Test Plans',
              provider: 'crossref',
              url: 'https://doi.org/10.1002/9780470316795.ch6',
              doi: '10.1002/9780470316795.ch6',
              license: 'http://doi.wiley.com/10.1002/tdm_license_1.1',
              conceptLinks: [{ id: 'c16', label: 'test plans' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- sf3: Test Plans\n',
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P2',
          dimension: 'citations',
          detail: 'source ledger row sf3 has ambiguous or missing license',
          evidence: 'http://doi.wiley.com/10.1002/tdm_license_1.1',
        }),
      ]),
    );
  });

  it('flags CourseIR review rows without treating them as trusted bibliography rows', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'CourseIR Review Source Proof',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceReviewRows: [
            {
              id: 'SL1',
              title: 'Existing course map fields.',
              provider: 'courseir',
              accessStatus: 'no-url-or-doi',
              licenseAmbiguous: true,
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 0,
            sourceReviewCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Review Notes\n- SL1: Existing course map fields.\n',
      }),
      course: { title: 'CourseIR Review Source Proof', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).toContain('source review row SL1 is not trusted bibliography proof');
    expect(details).not.toContain('source ledger row SL1 has ambiguous or missing license');
  });

  it('accepts hydrated OpenStax section rows as trusted concept-linked source proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Computer Science with Python',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'kr1',
              title:
                'OpenStax introduction python programming §10.1 (open textbook, CC BY 4.0 — https://openstax.org/books/introduction-python-programming)',
              provider: 'genome',
              url: 'https://openstax.org/books/introduction-python-programming',
              license: 'CC BY 4.0',
              conceptLinks: [
                { id: 'c6', label: 'dictionaries' },
                { id: 'c8', label: 'file input' },
              ],
            },
            {
              id: 'syllabus-src-3-3',
              title: 'OpenStax introduction python programming §4.2 (open textbook)',
              provider: 'openstax',
              url: 'https://openstax.org/books/introduction-python-programming',
              license: 'CC BY 4.0',
              conceptLinks: [{ id: 'c1', label: 'Boolean logic' }],
            },
            {
              id: 'syllabus-src-1-1',
              title: 'OpenStax introduction python programming §1.3 (open textbook)',
              provider: 'openstax',
              url: 'https://openstax.org/books/introduction-python-programming',
              license: 'CC BY 4.0',
              conceptLinks: [{ id: 'c2', label: 'Programming fundamentals' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 2,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': [
          '# Source Report',
          '',
          '## Source Ledger',
          '- kr1: OpenStax introduction python programming §10.1 (open textbook)',
          '- syllabus-src-3-3: OpenStax introduction python programming §4.2 (open textbook)',
          '- syllabus-src-1-1: OpenStax introduction python programming §1.3 (open textbook)',
        ].join('\n'),
      }),
      course: { title: 'Introduction to Computer Science with Python', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/source ledger row syllabus-src-.*(?:no accessible URL|ambiguous or missing license)/),
      ]),
    );
    expect(details).not.toContain('source ledger row syllabus-src-3-3 is off-discipline for Computer Science/Python');
    expect(details).not.toContain('source ledger row syllabus-src-1-1 is off-discipline for Computer Science/Python');
    expect(details).not.toContain('source ledger row kr1 is off-discipline for Computer Science/Python');
  });

  it('accepts licensed Open Music Theory rows as trusted concept-linked source proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Interval Evidence Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'music-omt-intervals',
              title: 'Open Music Theory: Intervals',
              provider: 'open-music-theory',
              url: 'https://viva.pressbooks.pub/openmusictheory/chapter/intervals/',
              license: 'CC BY-SA 4.0',
              conceptLinks: [
                { id: 'c1', label: 'generic interval' },
                { id: 'c2', label: 'interval quality' },
              ],
            },
            {
              id: 'music-omt-intervals-worksheet-e',
              title: 'Open Music Theory: Intervals E worksheet',
              provider: 'open-music-theory',
              url: 'https://viva.pressbooks.pub/app/uploads/sites/12/2025/07/WK-Intervals-E.pdf',
              license: 'CC BY-SA 4.0',
              conceptLinks: [
                { id: 'c3', label: 'compound interval' },
                { id: 'c4', label: 'interval inversion' },
              ],
            },
          ],
          courseIR: {
            sourceLedgerRows: 2,
            sourceRefCoverage: {
              sourceLedgerRows: 2,
              totals: { total: 22, withRefs: 22, missing: 0, danglingRefs: 0 },
            },
          },
          sourceReport: { path: 'SOURCE_REPORT.md', sourceCount: 2 },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- Open Music Theory: Intervals\n',
      }),
      course: { title: 'Interval Evidence Studio', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).not.toContain(
      'sourceRef coverage is too thin: 22 atom(s) rely on 0 trusted concept-linked source row(s)',
    );
    expect(details).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/open-music-theory.*(?:ambiguous|off-discipline|no accessible URL)/i),
      ]),
    );
  });

  it('keeps quarantined review rows advisory when trusted concept-linked source rows cover the bibliography', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'kr1',
              title: 'Re-examining Whether, Why, and How Human-AI Interaction Is Uniquely Difficult to Design',
              provider: 'openalex',
              url: 'https://dl.acm.org/doi/pdf/10.1145/3313831.3376301',
              doi: '10.1145/3313831.3376301',
              license: 'CC BY',
              conceptLinks: [{ id: 'c1', label: 'interaction design' }],
            },
            {
              id: 'sf1',
              title: 'Inclusive design',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Inclusive_design',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c2', label: 'accessibility' }],
            },
          ],
          sourceReviewRows: [
            {
              id: 'kr2',
              title: 'Characterising and measuring user experiences in digital games',
              provider: 'openalex',
              status: 'source-provided',
              url: 'https://pure.tue.nl/ws/files/2944578/Metis215134.pdf',
              license: 'other-oa',
              trustedBibliography: false,
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 2,
            sourceReviewCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': [
          '# Source Report',
          '',
          '## Source Ledger',
          '- kr1: Re-examining Whether, Why, and How Human-AI Interaction Is Uniquely Difficult to Design',
          '- sf1: Inclusive design',
          '',
          '## Source Review Notes',
          '- kr2: Characterising and measuring user experiences in digital games',
        ].join('\n'),
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).not.toContain('source review row kr2 is not trusted bibliography proof');
    expect(details).not.toContain('source ledger row kr2 has ambiguous or missing license');
  });

  it('still scores review-only rows when the trusted concept-linked bibliography is too thin', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Thin UX Source Ledger',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'kr1',
              title: 'Re-examining Whether, Why, and How Human-AI Interaction Is Uniquely Difficult to Design',
              provider: 'openalex',
              url: 'https://dl.acm.org/doi/pdf/10.1145/3313831.3376301',
              doi: '10.1145/3313831.3376301',
              license: 'CC BY',
              conceptLinks: [{ id: 'c1', label: 'interaction design' }],
            },
          ],
          sourceReviewRows: [
            {
              id: 'kr2',
              title: 'Characterising and measuring user experiences in digital games',
              provider: 'openalex',
              status: 'source-provided',
              url: 'https://pure.tue.nl/ws/files/2944578/Metis215134.pdf',
              license: 'other-oa',
              trustedBibliography: false,
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 1,
            sourceReviewCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': [
          '# Source Report',
          '',
          '## Source Ledger',
          '- kr1: Re-examining Whether, Why, and How Human-AI Interaction Is Uniquely Difficult to Design',
          '',
          '## Source Review Notes',
          '- kr2: Characterising and measuring user experiences in digital games',
        ].join('\n'),
      }),
      course: { title: 'Thin UX Source Ledger', featureIds: [] },
    });

    expect(result.findings.map((finding) => finding.detail)).toContain(
      'source review row kr2 is not trusted bibliography proof',
    );
  });

  it('flags bare refinement false friends in UX source-ledger proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'sf5',
              title: 'Relating Data Refinement and Failures-Divergences Refinement',
              provider: 'crossref',
              url: 'https://doi.org/10.1007/978-3-319-92711-4_10',
              doi: '10.1007/978-3-319-92711-4_10',
              license: 'http://www.springer.com/tdm',
              conceptLinks: [{ id: 'c1', label: 'refinement' }],
            },
            {
              id: 'sf-8-2',
              title: 'Vehicle refinement: purpose and targets',
              provider: 'crossref',
              url: 'https://doi.org/10.1016/b978-075066129-4/50003-1',
              doi: '10.1016/b978-075066129-4/50003-1',
              license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
              conceptLinks: [{ id: 'c2', label: 'critique response' }],
            },
            {
              id: 'sf-good',
              title: 'Iterative design',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Iterative_design',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c3', label: 'implementation' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 3,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': [
          '# Source Report',
          '',
          '## Source Ledger',
          '- sf5: Relating Data Refinement and Failures-Divergences Refinement',
          '- sf-8-2: Vehicle refinement: purpose and targets',
          '- sf-good: Iterative design',
        ].join('\n'),
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf5 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-8-2 is off-discipline for User Experience Design Studio',
        }),
      ]),
    );
  });

  it('flags sourceRef coverage that looks complete but rests on one thin source row', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'AI Governance Source Thinness',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          pipeline: {
            knowledgeBackbone:
              '0/4 lessons genome-linked · 9 open resources (openalex: 4, openlibrary: 1, source-finder: 4)',
            nativeAuthoring: 'assembled 4 sessions · CurriculumV1 source 4 lessons',
          },
          sourceLedger: [
            {
              id: 'kr5',
              title: 'Seven AI Laws The Future of Mankind',
              provider: 'openlibrary',
              url: 'https://openlibrary.org/works/OL45142895W',
              license: 'Open Library public metadata',
              licenseAmbiguous: true,
            },
          ],
          sourceReviewRows: [
            {
              id: 'SL1',
              title: 'Existing course map fields.',
              provider: 'courseir',
              accessStatus: 'no-url-or-doi',
              licenseAmbiguous: true,
            },
          ],
          courseIR: {
            sourceRefCoverage: {
              totals: { total: 56, withRefs: 56, missing: 0, danglingRefs: 0 },
              categories: {
                outcomes: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
                activities: { total: 14, withRefs: 14, missing: 0, danglingRefs: 0 },
                factualClaims: { total: 14, withRefs: 14, missing: 0, danglingRefs: 0 },
              },
            },
          },
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 1,
            sourceReviewCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- kr5: Seven AI Laws The Future of Mankind\n',
      }),
      course: { title: 'AI Governance Source Thinness', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).toEqual(
      expect.arrayContaining([
        'pipeline reported 9 open resource(s) but the package exported 2 source proof row(s)',
        'sourceRef coverage is too thin: 56 atom(s) rely on 0 trusted concept-linked source row(s)',
      ]),
    );
  });

  it('does not count trusted-but-unlinked source rows as atom sourceRef proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Project Management Unlinked Source Proof',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'sf1',
              title: 'Project charter and stakeholder governance',
              provider: 'openalex',
              url: 'https://openalex.org/W-linked',
              license: 'cc-by',
              conceptLinks: [{ id: 'c1', label: 'Project charter' }],
            },
            {
              id: 'sf2',
              title: 'Project management overview without lesson linkage',
              provider: 'openalex',
              url: 'https://openalex.org/W-unlinked',
              license: 'cc-by',
            },
          ],
          sourceReviewRows: [
            {
              id: 'SL1',
              title: 'Existing course map fields.',
              provider: 'courseir',
              accessStatus: 'no-url-or-doi',
              licenseAmbiguous: true,
            },
          ],
          courseIR: {
            sourceRefCoverage: {
              sourceLedgerRows: 1,
              totals: { total: 24, withRefs: 24, missing: 0, danglingRefs: 0 },
              categories: {
                outcomes: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
                factualClaims: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
                rubricCriteria: { total: 8, withRefs: 8, missing: 0, danglingRefs: 0 },
              },
            },
          },
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 2,
            sourceReviewCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- sf1: Project charter\n- sf2: Overview\n',
      }),
      course: { title: 'Project Management Unlinked Source Proof', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).toEqual(
      expect.arrayContaining([
        'source ledger row sf2 is trusted metadata but is not concept-linked',
        'sourceRef coverage is too thin: 24 atom(s) rely on 1 trusted concept-linked source row(s)',
      ]),
    );
    expect(details).not.toContain(
      'sourceRef coverage is not wired to trusted source ledger rows: 24 atom(s) report coverage through 1 CourseIR source row(s) while 2 trusted exported source row(s) exist',
    );
  });

  it('flags accounting audit-quality rows trusted for Project Management concepts', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Project Management',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'kr1',
              title: 'Jere R. Francis (2004). What do we know about audit quality?',
              provider: 'openalex',
              url: 'https://repub.eur.nl/pub/94446/MAB-special-issue-What-do-we-know-about-audit-quality-September-2016.pdf',
              license: 'public-domain',
              conceptLinks: [{ id: 'c6', label: 'risk register and mitigation planning' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- kr1: What do we know about audit quality?\n',
      }),
      course: { title: 'Project Management', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row kr1 is off-discipline for Project Management',
        }),
      ]),
    );
  });

  it('flags UX false-friend rows trusted for design-studio concepts', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'sf2',
              title: 'Positive feedback',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Positive_feedback',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c4', label: 'project feedback' }],
            },
            {
              id: 'kr2',
              title:
                'Yogesh K. Dwivedi, Laurie Hughes, Abdullah M. Baabdullah et al. (2022). Metaverse beyond the hype: Multidisciplinary perspectives on emerging challenges, opportunities, and agenda for research, practice and policy.',
              provider: 'openalex',
              url: 'https://doi.org/10.1016/j.ijinfomgt.2022.102542',
              doi: '10.1016/j.ijinfomgt.2022.102542',
              license: 'CC BY-NC-ND',
              conceptLinks: [{ id: 'c7', label: 'personas' }],
            },
            {
              id: 'sf1',
              title: 'The Green Studio Handbook: Environmental Strategies for Schematic Design',
              provider: 'openalex',
              url: 'https://www.arcc-journal.org/index.php/arccjournal/article/download/47/46',
              doi: '10.17831/enq:arcc.v4i2.47',
              license: 'CC BY-NC-SA',
              conceptLinks: [{ id: 'c9', label: 'critique sessions' }],
            },
            {
              id: 'kr7',
              title:
                'Collaborative learning in architectural education: Benefits of combining conventional studio, virtual design studio and live projects',
              provider: 'openalex',
              url: 'https://pureadmin.qub.ac.uk/ws/files/164352510/BLIND_REVIEW_Collaborative_Distance_learning_in_Architecture_final_submission_.pdf',
              license: 'other-oa',
              conceptLinks: [
                { id: 'c30', label: 'project work' },
                { id: 'c31', label: 'revision' },
                { id: 'c32', label: 'preparation' },
              ],
            },
            {
              id: 'sf-2-2',
              title: 'National Design Studio',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/National_Design_Studio',
              license: 'CC BY-SA 4.0',
              conceptLinks: [
                { id: 'c4', label: 'studio critique' },
                { id: 'c5', label: 'peer feedback' },
                { id: 'c6', label: 'iteration' },
              ],
            },
            {
              id: 'sf-6-2',
              title: 'Le Mans Prototype',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Le_Mans_Prototype',
              license: 'CC BY-SA 4.0',
              conceptLinks: [
                { id: 'c16', label: 'prototypes' },
                { id: 'c17', label: 'interaction' },
                { id: 'c6', label: 'iteration' },
              ],
            },
            {
              id: 'sf-6-3',
              title: 'List of In Living Color sketches',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/List_of_In_Living_Color_sketches',
              license: 'CC BY-SA 4.0',
              conceptLinks: [
                { id: 'c16', label: 'sketches' },
                { id: 'c17', label: 'low-fidelity layouts' },
                { id: 'c18', label: 'screen structure' },
              ],
            },
            {
              id: 'sf-7-2',
              title: 'Prototype-based programming',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Prototype-based_programming',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c16', label: 'prototypes' }],
            },
            {
              id: 'sf-fixed-point-iteration',
              title: 'Fixed-point iteration',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Fixed-point_iteration',
              license: 'CC BY-SA 4.0',
              evidence: 'A mathematics page about computing fixed points of functions.',
              conceptLinks: [
                { id: 'c19', label: 'design iteration' },
                { id: 'c20', label: 'peer critique' },
              ],
            },
            {
              id: 'sf-generic-iteration',
              title: 'Iteration',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Iteration',
              license: 'CC BY-SA 4.0',
              evidence: 'The repetition of a process in order to generate a sequence of outcomes.',
              conceptLinks: [
                { id: 'c19', label: 'design iteration' },
                { id: 'c21', label: 'revision planning' },
              ],
            },
            {
              id: 'sf-7-3',
              title: 'Prototype (video game)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Prototype_(video_game)',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c16', label: 'prototypes' }],
            },
            {
              id: 'sf-1-2',
              title: 'Mercator projection',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Mercator_projection',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c2', label: 'critique sessions' }],
            },
            {
              id: 'sf-3-3',
              title: 'Persona 4 Revival',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Persona_4_Revival',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c7', label: 'personas' }],
            },
            {
              id: 'sf-3-4',
              title: 'Revelations: Persona',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Revelations:_Persona',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c7', label: 'personas' }],
            },
            {
              id: 'sf-2026-persona',
              title: "A network of enterprise's study of Tim Minchin and the creation of a creative public persona",
              provider: 'crossref',
              url: 'https://doi.org/10.21153/psj2026vol12no1art2272',
              doi: '10.21153/psj2026vol12no1art2272',
              license: 'https://creativecommons.org/licenses/by-nc/4.0',
              evidence: 'A celebrity public persona case study about Tim Minchin and creative work.',
              conceptLinks: [{ id: 'c7', label: 'personas' }],
            },
            {
              id: 'sf-sketches-spain',
              title: 'Sketches of Spain',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Sketches_of_Spain',
              license: 'CC BY-SA 4.0',
              evidence: 'A studio album by jazz musician Miles Davis.',
              conceptLinks: [{ id: 'c16', label: 'sketches' }],
            },
            {
              id: 'sf-prototype-mdt',
              title: 'One Prototype Three Prototype Five Prototype Seven Prototype',
              provider: 'crossref',
              url: 'https://doi.org/10.1109/mdt.1986.295018',
              doi: '10.1109/mdt.1986.295018',
              license: 'https://ieeexplore.ieee.org/Xplorehelp/downloads/license-information/IEEE.html',
              conceptLinks: [{ id: 'c16', label: 'prototypes' }],
            },
            {
              id: 'sf-poeme',
              title: 'Le poème, critique de la critique',
              provider: 'crossref',
              url: 'https://doi.org/10.4000/books.pur.28695',
              doi: '10.4000/books.pur.28695',
              license: 'https://www.openedition.org/12554',
              evidence: 'critique',
              conceptLinks: [{ id: 'c2', label: 'critique sessions' }],
            },
            {
              id: 'sf-kant',
              title: 'Critique of Pure Reason',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Critique_of_Pure_Reason',
              license: 'CC BY-SA 4.0',
              evidence: 'A book by Immanuel Kant about metaphysics.',
              conceptLinks: [{ id: 'c2', label: 'critique sessions' }],
            },
            {
              id: 'sf-star-trek',
              title: 'Prototype (Star Trek: Voyager)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Prototype_(Star_Trek:_Voyager)',
              license: 'CC BY-SA 4.0',
              evidence: 'A science fiction television series episode.',
              conceptLinks: [{ id: 'c16', label: 'prototypes' }],
            },
            {
              id: 'sf3',
              title:
                'Optimizing the digital customer journey—Improving user experience by exploiting emotions, personas and situations for individualized user interface adaptations',
              provider: 'openalex',
              url: 'https://onlinelibrary.wiley.com/doi/pdfdirect/10.1002/cb.1964',
              doi: '10.1002/cb.1964',
              license: 'CC BY-NC-ND',
              conceptLinks: [{ id: 'c7', label: 'personas' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 8,
          },
          files: [],
        }),
        'SOURCE_REPORT.md':
          '# Source Report\n\n## Source Ledger\n- sf2: Positive feedback\n- kr2: Metaverse beyond the hype\n- sf1: The Green Studio Handbook\n- kr7: Collaborative learning in architectural education\n- sf-2-2: National Design Studio\n- sf-6-2: Le Mans Prototype\n- sf-6-3: List of In Living Color sketches\n- sf-7-2: Prototype-based programming\n- sf-7-3: Prototype (video game)\n- sf-1-2: Mercator projection\n- sf-3-3: Persona 4 Revival\n- sf-3-4: Revelations: Persona\n- sf-2026-persona: Tim Minchin creative public persona\n- sf-sketches-spain: Sketches of Spain\n- sf-prototype-mdt: One Prototype Three Prototype Five Prototype Seven Prototype\n- sf-poeme: Le poème, critique de la critique\n- sf-kant: Critique of Pure Reason\n- sf-star-trek: Prototype (Star Trek: Voyager)\n- sf3: Optimizing the digital customer journey\n',
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row kr2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf1 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row kr7 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-2-2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-6-2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-6-3 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-7-2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-fixed-point-iteration is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-generic-iteration is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-7-3 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-1-2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-3-3 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-3-4 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-2026-persona is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-sketches-spain is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-prototype-mdt is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-poeme is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-kant is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-star-trek is off-discipline for User Experience Design Studio',
        }),
      ]),
    );
    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: 'source ledger row sf3 is off-discipline for User Experience Design Studio',
        }),
      ]),
    );
  });

  it('flags health gamification reviews linked to UX critique concepts as off-discipline source proof', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'sf-health-gamification',
              title: 'Gamification for health and wellbeing: A systematic review of the literature',
              provider: 'openalex',
              url: 'https://doi.org/10.1016/j.invent.2016.10.002',
              doi: '10.1016/j.invent.2016.10.002',
              license: 'CC BY',
              evidence:
                'Compared to persuasive technology and health games, gamification motivates behaviour change for health and wellbeing.',
              conceptLinks: [
                { id: 'c7', label: 'concept review' },
                { id: 'c8', label: 'peer feedback' },
                { id: 'c9', label: 'iteration' },
              ],
            },
            {
              id: 'sf-ux-collaboration',
              title: 'Understanding Collaborative Practices and Tools of Professional UX Practitioners',
              provider: 'openalex',
              url: 'https://dl.acm.org/doi/pdf/10.1145/3544548.3581273',
              doi: '10.1145/3544548.3581273',
              license: 'CC BY',
              evidence: 'User experience practitioners use critique, peer feedback, and collaboration tools.',
              conceptLinks: [{ id: 'c7', label: 'concept review' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 2,
          },
          files: [],
        }),
        'SOURCE_REPORT.md':
          '# Source Report\n\n## Source Ledger\n- sf-health-gamification: Gamification for health and wellbeing\n- sf-ux-collaboration: Understanding Collaborative Practices and Tools of Professional UX Practitioners\n',
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-health-gamification is off-discipline for User Experience Design Studio',
        }),
      ]),
    );
    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: 'source ledger row sf-ux-collaboration is off-discipline for User Experience Design Studio',
        }),
      ]),
    );
  });

  it('flags v0.15.113 UX source-ledger false friends even when licensed and concept-linked', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'User Experience Design Studio',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          sourceLedger: [
            {
              id: 'sf4',
              title: 'A Critique of Private Sessions in Family Mediation',
              provider: 'crossref',
              url: 'https://doi.org/10.1177/2158244013478950',
              doi: '10.1177/2158244013478950',
              license: 'https://journals.sagepub.com/page/policies/text-and-data-mining-license',
              evidence: 'A critical examination of private sessions in family mediation with mediators.',
              conceptLinks: [{ id: 'c2', label: 'critique sessions' }],
            },
            {
              id: 'sf-3-2',
              title: 'Accessibility of the Metropolitan Transportation Authority',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Accessibility_of_the_Metropolitan_Transportation_Authority',
              license: 'CC BY-SA 4.0',
              evidence: 'Physical accessibility of the Metropolitan Transportation Authority public transit network.',
              conceptLinks: [{ id: 'c7', label: 'accessibility review' }],
            },
            {
              id: 'sf-5-2',
              title:
                'The efficacy of booster maintenance sessions in behavior therapy: Review and methodological critique',
              provider: 'crossref',
              url: 'https://doi.org/10.1016/0272-7358(90)90055-f',
              doi: '10.1016/0272-7358(90)90055-f',
              license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
              evidence: 'A behavior therapy review about booster maintenance sessions.',
              conceptLinks: [{ id: 'c2', label: 'critique sessions' }],
            },
            {
              id: 'sf6',
              title: 'Design Research (store)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Design_Research_(store)',
              license: 'CC BY-SA 4.0',
              evidence: 'Design Research was a retail lifestyle store.',
              conceptLinks: [{ id: 'c5', label: 'design research' }],
            },
            {
              id: 'sf-good',
              title: 'International usability testing',
              provider: 'crossref',
              url: 'https://doi.org/10.1016/b978-0-12-816942-1.00010-1',
              doi: '10.1016/b978-0-12-816942-1.00010-1',
              license: 'https://www.elsevier.com/tdm/userlicense/1.0/',
              evidence: 'International usability testing methods for user research and prototyping.',
              conceptLinks: [{ id: 'c4', label: 'usability testing' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 5,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': [
          '# Source Report',
          '',
          '## Source Ledger',
          '- sf4: A Critique of Private Sessions in Family Mediation',
          '- sf-3-2: Accessibility of the Metropolitan Transportation Authority',
          '- sf-5-2: The efficacy of booster maintenance sessions in behavior therapy',
          '- sf6: Design Research (store)',
          '- sf-good: International usability testing',
        ].join('\n'),
      }),
      course: { title: 'User Experience Design Studio', featureIds: [] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf4 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-3-2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf-5-2 is off-discipline for User Experience Design Studio',
        }),
        expect.objectContaining({
          severity: 'P1',
          dimension: 'citations',
          detail: 'source ledger row sf6 is off-discipline for User Experience Design Studio',
        }),
      ]),
    );
    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: 'source ledger row sf-good is off-discipline for User Experience Design Studio',
        }),
      ]),
    );
  });

  it('flags complete atom coverage that is not wired to the exported trusted ledger rows', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Genetics and Society',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          pipeline: {
            knowledgeBackbone:
              '0/4 lessons genome-linked · 9 cited open resources (openalex: 4, openlibrary: 1, source-finder: 4)',
            nativeAuthoring: 'assembled 4 sessions · CurriculumV1 source 4 lessons',
          },
          sourceLedger: [
            {
              id: 'kr2',
              title: 'Current Challenges and New Opportunities for Gene-Environment Interaction Studies',
              provider: 'openalex',
              url: 'https://academic.oup.com/aje/article-pdf/186/7/753/24330718/kwx227.pdf',
              license: 'public-domain',
              conceptLinks: [{ id: 'c1', label: 'Gene-environment interaction' }],
            },
            {
              id: 'kr4',
              title: 'The CRISPR tool kit for genome editing and beyond',
              provider: 'openalex',
              url: 'https://www.nature.com/articles/s41467-018-04252-2.pdf',
              license: 'cc-by',
              conceptLinks: [{ id: 'c2', label: 'CRISPR' }],
            },
            {
              id: 'sf1',
              title: 'Wikipedia contributors. DNA.',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/DNA',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c3', label: 'DNA' }],
            },
          ],
          sourceReviewRows: [
            {
              id: 'SL1',
              title: 'Existing course map fields.',
              provider: 'courseir',
              accessStatus: 'no-url-or-doi',
              licenseAmbiguous: true,
            },
          ],
          courseIR: {
            sourceRefCoverage: {
              sourceLedgerRows: 1,
              totals: { total: 55, withRefs: 55, missing: 0, danglingRefs: 0 },
              categories: {
                outcomes: { total: 9, withRefs: 9, missing: 0, danglingRefs: 0 },
                activities: { total: 14, withRefs: 14, missing: 0, danglingRefs: 0 },
                examples: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0 },
                assessments: { total: 4, withRefs: 4, missing: 0, danglingRefs: 0 },
                rubricCriteria: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
                factualClaims: { total: 12, withRefs: 12, missing: 0, danglingRefs: 0 },
              },
            },
          },
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 3,
            sourceReviewCount: 1,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- kr2: Gene-environment interaction\n',
      }),
      course: { title: 'Genetics and Society', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).toContain(
      'sourceRef coverage is not wired to trusted concept-linked source ledger rows: 55 atom(s) report coverage through 1 CourseIR source row(s) while 3 trusted concept-linked exported source row(s) exist',
    );
  });

  it('flags CS/Python source-ledger false friends even when licensed and concept-linked', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Computer Science with Python',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          pipeline: {
            knowledgeBackbone: '3/15 lessons genome-linked · 12 cited open resources (source-finder: 8)',
          },
          sourceLedger: [
            {
              id: 'sf2',
              title: 'Correlation',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Correlation',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c2', label: 'variables' }],
            },
            {
              id: 'sf5',
              title: 'Lists of American colleges and universities',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Lists_of_American_colleges_and_universities',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c5', label: 'lists' }],
            },
            {
              id: 'sf7',
              title: 'No Strings Attached (NSYNC album)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/No_Strings_Attached_(NSYNC_album)',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c7', label: 'strings' }],
            },
            {
              id: 'sf-good',
              title: 'String (computer science)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/String_(computer_science)',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c7', label: 'strings' }],
            },
            {
              id: 'sf8',
              title: 'English conditional sentences',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/English_conditional_sentences',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c8', label: 'conditionals' }],
            },
            {
              id: 'sf9',
              title: 'Game loops, Game design loops, Game Terakoya loops and Ludic Language Pedagogy loops',
              provider: 'crossref',
              url: 'https://doi.org/10.55853/llp_v4pg1',
              doi: '10.55853/llp_v4pg1',
              license: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
              conceptLinks: [{ id: 'c9', label: 'loops' }],
            },
            {
              id: 'sf-good-conditional',
              title: 'Conditional (computer programming)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Conditional_(computer_programming)',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c8', label: 'conditionals' }],
            },
            {
              id: 'sf10',
              title: 'Module (mathematics)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Module_(mathematics)',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c10', label: 'modules' }],
            },
            {
              id: 'sf11',
              title: 'Exception (law)',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Exception_(law)',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c11', label: 'exceptions' }],
            },
            {
              id: 'sf-good-module',
              title: 'Modular programming',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Modular_programming',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c10', label: 'modules' }],
            },
            {
              id: 'sf-good-exception',
              title: 'Exception handling',
              provider: 'wikipedia',
              url: 'https://en.wikipedia.org/wiki/Exception_handling',
              license: 'CC BY-SA 4.0',
              conceptLinks: [{ id: 'c11', label: 'exceptions' }],
            },
          ],
          sourceReport: {
            path: 'SOURCE_REPORT.md',
            sourceCount: 3,
          },
          files: [],
        }),
        'SOURCE_REPORT.md': '# Source Report\n\n## Source Ledger\n- sf5: Lists of American colleges and universities\n',
      }),
      course: { title: 'Introduction to Computer Science with Python', featureIds: [] },
    });

    const details = result.findings.map((finding) => finding.detail);
    expect(details).toEqual(
      expect.arrayContaining([
        'source ledger row sf5 is off-discipline for Computer Science/Python',
        'source ledger row sf7 is off-discipline for Computer Science/Python',
        'source ledger row sf8 is off-discipline for Computer Science/Python',
        'source ledger row sf9 is off-discipline for Computer Science/Python',
        'source ledger row sf2 is off-discipline for Computer Science/Python',
        'source ledger row sf10 is off-discipline for Computer Science/Python',
        'source ledger row sf11 is off-discipline for Computer Science/Python',
      ]),
    );
    expect(details).not.toContain('source ledger row sf-good is off-discipline for Computer Science/Python');
    expect(details).not.toContain(
      'source ledger row sf-good-conditional is off-discipline for Computer Science/Python',
    );
    expect(details).not.toContain('source ledger row sf-good-module is off-discipline for Computer Science/Python');
    expect(details).not.toContain('source ledger row sf-good-exception is off-discipline for Computer Science/Python');
  });

  // v0.16.1 regression: encyclopedic reading lines used to be INVISIBLE to
  // checkCitations (no author-head/year/DOI), so a Linear Algebra syllabus
  // that listed "Wikipedia contributors. Independent politician." as a reading
  // scored citations 100/100. The grader now admits and relevance-checks
  // Wikipedia/archive lines.
  it('flags off-discipline Wikipedia readings embedded in a syllabus for a math course', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Linear Algebra',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [{ path: 'Syllabus/Linear Algebra - Syllabus.txt', feature: 'syllabus' }],
        }),
        'Syllabus/Linear Algebra - Syllabus.txt': [
          'LINEAR ALGEBRA — SYLLABUS',
          '',
          'WEEKLY READINGS',
          'Week 4: Wikipedia contributors. Independent politician. https://en.wikipedia.org/wiki/Independent_politician (CC BY-SA 4.0)',
          'Week 5: Wikipedia contributors. Lewis acids and bases. https://en.wikipedia.org/wiki/Lewis_acids_and_bases (CC BY-SA 4.0)',
        ].join('\n'),
      }),
      course: { title: 'Linear Algebra', featureIds: ['syllabus'] },
    });

    const citationFindings = result.findings.filter((finding) => finding.dimension === 'citations');
    expect(citationFindings.length).toBeGreaterThan(0);
    const evidence = citationFindings.map((finding) => finding.evidence || '').join(' ');
    expect(evidence).toMatch(/Independent politician|Lewis acids and bases/);
  });

  it('does not reinterpret an inline source cue in an activity as a reading citation', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Music Theory Fundamentals',
          lessonScope: 'all',
          requestedFeatures: ['lessonPlans'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [{ path: 'Lesson Plans/Lesson 01 - Staff and Notation - Lesson Plans.txt', feature: 'lessonPlans' }],
        }),
        'Lesson Plans/Lesson 01 - Staff and Notation - Lesson Plans.txt': [
          'LESSON PLANS',
          'Music Theory Fundamentals - Lesson 01 - Staff and Notation',
          "Teams take a position on the lesson's live question and defend it with evidence from https://en.wikipedia.org/wiki/Staff_(music) §extract.",
        ].join('\n'),
      }),
      course: { title: 'Music Theory Fundamentals', featureIds: ['lessonPlans'] },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'citations' &&
          finding.detail === 'citation shares zero vocabulary with the course discipline (possible off-topic reading)',
      ),
    ).toBe(false);
  });

  it('does not judge a shared license-and-attribution paragraph as a standalone reading', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Elementary Mandarin Chinese I',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [{ path: 'Syllabus/Elementary Mandarin Chinese I - Syllabus.txt', feature: 'syllabus' }],
        }),
        'Syllabus/Elementary Mandarin Chinese I - Syllabus.txt': [
          'ELEMENTARY MANDARIN CHINESE I — SYLLABUS',
          'SOURCES & LICENSES',
          'License and attribution: CC BY-SA 4.0 · Wikipedia contributors.',
          'Wikipedia contributors. Bopomofo. Wikipedia: https://en.wikipedia.org/wiki/Bopomofo — CC BY-SA 4.0',
        ].join('\n'),
      }),
      course: { id: 'mandarin', title: 'Elementary Mandarin Chinese I', featureIds: ['syllabus'] },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'citations' &&
          finding.evidence === 'License and attribution: CC BY-SA 4.0 · Wikipedia contributors.',
      ),
    ).toBe(false);
  });

  it('recognizes Bopomofo as an on-discipline Mandarin citation', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Elementary Mandarin Chinese I',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [{ path: 'Syllabus/Elementary Mandarin Chinese I - Syllabus.txt', feature: 'syllabus' }],
        }),
        'Syllabus/Elementary Mandarin Chinese I - Syllabus.txt': [
          'ELEMENTARY MANDARIN CHINESE I — SYLLABUS',
          'WEEKLY READINGS',
          'Week 1: Wikipedia contributors. Bopomofo. Wikipedia: https://en.wikipedia.org/wiki/Bopomofo (CC BY-SA 4.0)',
        ].join('\n'),
      }),
      course: { id: 'mandarin', title: 'Elementary Mandarin Chinese I', featureIds: ['syllabus'] },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'citations' &&
          finding.detail === 'citation shares zero vocabulary with the course discipline (possible off-topic reading)',
      ),
    ).toBe(false);
  });

  it('uses the exported reading registry to recognize newly assigned works in browser and offline grading', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'World Literature',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          readings: [
            { id: 'R3.1', title: 'The Odyssey', lesson: 3, provenance: 'instructor-named' },
            {
              id: 'R5.1',
              title: 'selected poems of Li Bai and Du Fu',
              lesson: 5,
              provenance: 'instructor-named',
            },
          ],
          files: [{ path: 'Syllabus/World Literature - Syllabus.txt', feature: 'syllabus' }],
        }),
        'Syllabus/World Literature - Syllabus.txt': [
          'WORLD LITERATURE — SYLLABUS',
          'SOURCES & LICENSES',
          'Wikipedia contributors. Li Bai. Wikipedia: https://en.wikipedia.org/wiki/Li_Bai (CC BY-SA 4.0)',
          'Wikipedia contributors. Translations of the Odyssey. Wikipedia: https://en.wikipedia.org/wiki/Translations_of_the_Odyssey (CC BY-SA 4.0)',
        ].join('\n'),
      }),
      course: {
        title: 'World Literature',
        featureIds: ['syllabus'],
      },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'citations' &&
          finding.detail === 'citation shares zero vocabulary with the course discipline (possible off-topic reading)',
      ),
    ).toBe(false);
  });

  it('recognizes the Hardy-Weinberg principle as an on-discipline genetics citation', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Genetics',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [{ path: 'Syllabus/Introduction to Genetics - Syllabus.txt', feature: 'syllabus' }],
        }),
        'Syllabus/Introduction to Genetics - Syllabus.txt': [
          'INTRODUCTION TO GENETICS — SYLLABUS',
          'WEEKLY READINGS',
          'Week 7: Wikipedia contributors. Hardy-Weinberg principle. Wikipedia: https://en.wikipedia.org/wiki/Hardy%E2%80%93Weinberg_principle (CC BY-SA 4.0)',
        ].join('\n'),
      }),
      course: { id: 'genetics', title: 'Introduction to Genetics', featureIds: ['syllabus'] },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'citations' &&
          finding.detail === 'citation shares zero vocabulary with the course discipline (possible off-topic reading)',
      ),
    ).toBe(false);
  });

  it('recognizes cell division as an on-discipline genetics citation', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Genetics',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [{ path: 'Syllabus/Introduction to Genetics - Syllabus.txt', feature: 'syllabus' }],
        }),
        'Syllabus/Introduction to Genetics - Syllabus.txt': [
          'INTRODUCTION TO GENETICS — SYLLABUS',
          'WEEKLY READINGS',
          'Week 2: Wikipedia contributors. Cell division. Wikipedia: https://en.wikipedia.org/wiki/Cell_division (CC BY-SA 4.0)',
        ].join('\n'),
      }),
      course: { id: 'genetics', title: 'Introduction to Genetics', featureIds: ['syllabus'] },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'citations' &&
          finding.detail === 'citation shares zero vocabulary with the course discipline (possible off-topic reading)',
      ),
    ).toBe(false);
  });

  it('recognizes questionnaire and informed-consent readings in a social-science research-methods course', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Research Methods in the Social Sciences',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [
            {
              path: 'Syllabus/Research Methods in the Social Sciences - Syllabus.txt',
              feature: 'syllabus',
            },
          ],
        }),
        'Syllabus/Research Methods in the Social Sciences - Syllabus.txt': [
          'RESEARCH METHODS IN THE SOCIAL SCIENCES — SYLLABUS',
          'WEEKLY READINGS',
          'Week 3: Wikipedia contributors. Questionnaire. Wikipedia: https://en.wikipedia.org/wiki/Questionnaire (CC BY-SA 4.0)',
          'Week 7: Wikipedia contributors. Informed consent. Wikipedia: https://en.wikipedia.org/wiki/Informed_consent (CC BY-SA 4.0)',
        ].join('\n'),
      }),
      course: { id: 'research-methods', title: 'Research Methods in the Social Sciences', featureIds: ['syllabus'] },
    });

    const citationFindings = result.findings.filter((finding) => finding.dimension === 'citations');
    expect(citationFindings.some((finding) => /Questionnaire/i.test(finding.evidence || ''))).toBe(false);
    expect(citationFindings.some((finding) => /Informed consent/i.test(finding.evidence || ''))).toBe(false);
  });

  it('accepts physical model-organism assets for a genetics course', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Introduction to Genetics',
          lessonScope: 'all',
          requestedFeatures: [],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [
            {
              path: 'Required Assets/Introduction to Genetics - Required Lab Assets.md',
              feature: 'requiredAssets',
            },
          ],
        }),
        'Required Assets/Introduction to Genetics - Required Lab Assets.md': [
          '# Required assets',
          '- Model-organism materials and source sheet (physical)',
          '- Organism handling and lab safety briefing (physical, PDF)',
        ].join('\n'),
      }),
      course: { id: 'genetics', title: 'Introduction to Genetics', featureIds: [] },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.detail === 'Required Assets list cites physical wet-lab materials for a non-wet-lab course',
      ),
    ).toBe(false);
  });

  it('recognizes the Dodd-Frank Act as a consumer-protection reading in Business Ethics', async () => {
    const result = await grade({
      fileProvider: createMemoryFileProvider({
        'PACKAGE_MANIFEST.json': JSON.stringify({
          courseName: 'Business Ethics',
          lessonScope: 'all',
          requestedFeatures: ['syllabus'],
          readiness: { status: 'ready', blockers: 0, warnings: 0, checkedSections: null },
          files: [{ path: 'Syllabus/Business Ethics - Syllabus.txt', feature: 'syllabus' }],
        }),
        'Syllabus/Business Ethics - Syllabus.txt': [
          'BUSINESS ETHICS — SYLLABUS',
          'WEEKLY READINGS',
          'Week 8: Wikipedia contributors. Dodd–Frank Act. Wikipedia: https://en.wikipedia.org/wiki/Dodd%E2%80%93Frank_Act (CC BY-SA 4.0)',
        ].join('\n'),
      }),
      course: { id: 'business-ethics', title: 'Business Ethics', featureIds: ['syllabus'] },
    });

    expect(
      result.findings.some(
        (finding) =>
          finding.dimension === 'citations' &&
          finding.detail === 'citation shares zero vocabulary with the course discipline (possible off-topic reading)',
      ),
    ).toBe(false);
  });
});
