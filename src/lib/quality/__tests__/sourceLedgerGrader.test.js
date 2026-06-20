import { describe, expect, it } from 'vitest';
import { grade } from '../deepQualityGrader.js';
import { createMemoryFileProvider } from '../fileProviders.js';

describe('source-ledger quality checks', () => {
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
});
