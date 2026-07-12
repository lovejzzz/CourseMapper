import {
  compareQuizProjects,
  crossArtifactContrastDimensions,
  quizContrastDimensions,
  surfaceContrastDimensions,
} from './quizContrast.js';

function sumOutcomeCounts(rows, labKey) {
  const outcomes = ['learn', 'preserve', 'repair', 'parity', 'uncertain'];
  return Object.fromEntries(
    outcomes.map((outcome) => [
      outcome,
      rows.reduce((sum, row) => sum + Number(row.report?.[labKey]?.outcomes?.[outcome] || 0), 0),
    ]),
  );
}

function aggregateDimensions(rows, labKey, dimensions) {
  return dimensions.map(({ key, label }) => {
    const records = rows.flatMap((row) =>
      (row.report?.[labKey]?.records || []).filter((record) => record.dimension === key),
    );
    const candidateCount = records.reduce((sum, record) => sum + Number(record.candidate?.count || 0), 0);
    const candidateTotal = records.reduce((sum, record) => sum + Number(record.candidate?.total || 0), 0);
    const referenceCount = records.reduce((sum, record) => sum + Number(record.reference?.count || 0), 0);
    const referenceTotal = records.reduce((sum, record) => sum + Number(record.reference?.total || 0), 0);
    const candidateShare = candidateTotal > 0 ? candidateCount / candidateTotal : 0;
    const referenceShare = referenceTotal > 0 ? referenceCount / referenceTotal : 0;
    return {
      key,
      label,
      candidate: { count: candidateCount, total: candidateTotal, share: candidateShare },
      reference: { count: referenceCount, total: referenceTotal, share: referenceShare },
      candidateDeltaPoints: Number(((candidateShare - referenceShare) * 100).toFixed(1)),
    };
  });
}

function groupByCandidateRoute(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.candidateRoute || 'unspecified';
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return Object.fromEntries(
    [...groups.entries()].map(([route, routeRows]) => [
      route,
      {
        pairs: routeRows.length,
        domains: [...new Set(routeRows.map((row) => row.domain))],
        quizOutcomes: sumOutcomeCounts(routeRows, 'differenceLab'),
        surfaceOutcomes: sumOutcomeCounts(routeRows, 'surfaceDifferenceLab'),
        crossArtifactOutcomes: sumOutcomeCounts(routeRows, 'crossArtifactDifferenceLab'),
        quizDimensions: aggregateDimensions(routeRows, 'differenceLab', quizContrastDimensions),
        surfaceDimensions: aggregateDimensions(routeRows, 'surfaceDifferenceLab', surfaceContrastDimensions),
        crossArtifactDimensions: aggregateDimensions(
          routeRows,
          'crossArtifactDifferenceLab',
          crossArtifactContrastDimensions,
        ),
      },
    ]),
  );
}

export function buildScionContrastMatrix(pairs = []) {
  const rows = pairs.map((pair) => ({
    id: pair.id,
    domain: pair.domain,
    candidateRoute: pair.candidateRoute,
    candidateModel: pair.candidateModel,
    referenceModel: pair.referenceModel,
    artifactStatus: pair.artifactStatus || 'unknown',
    report: compareQuizProjects(pair.candidateProject, pair.referenceProject, {
      candidateLabel: pair.candidateModel || 'candidate',
      referenceLabel: pair.referenceModel || 'reference',
    }),
  }));
  return {
    generatedAt: new Date().toISOString(),
    pairCount: rows.length,
    domainCount: new Set(rows.map((row) => row.domain)).size,
    routes: groupByCandidateRoute(rows),
    rows,
    claimBoundary:
      'This matrix combines diagnostic pairs from different Scion routes, reference models, compiler snapshots, and capture dates. Report every route separately. It identifies repeated behaviors to test; it does not support a pooled model-superiority or instructor-readiness claim.',
  };
}
