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
            sourceCount: 3,
          },
          files: [],
        }),
        'SOURCE_REPORT.md':
          '# Source Report\n\n## Source Ledger\n- sf2: Positive feedback\n- kr2: Metaverse beyond the hype\n- sf3: Optimizing the digital customer journey\n',
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
