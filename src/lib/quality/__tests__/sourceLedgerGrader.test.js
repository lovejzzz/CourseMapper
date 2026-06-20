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
        'sourceRef coverage is too thin: 56 atom(s) rely on 1 trusted source row(s)',
      ]),
    );
  });
});
