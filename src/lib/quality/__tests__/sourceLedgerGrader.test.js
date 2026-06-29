import { describe, expect, it } from 'vitest';
import { grade } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';

describe('source-ledger quality checks', () => {
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
});
