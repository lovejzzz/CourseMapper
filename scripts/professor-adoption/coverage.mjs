function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items || []) {
    const key = getKey(item) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function sourceHost(sourceUrl = '') {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'invalid-source-url';
  }
}

function disciplineCluster(disciplineFamily = '') {
  const value = String(disciplineFamily || '').toLowerCase();
  if (/\b(math|statistics|physics|chemistry|quantitative|economics|accounting)\b/.test(value)) {
    return 'quantitative-stem-business';
  }
  if (/\b(cs|programming|data|ai|machine|software)\b/.test(value)) return 'computing-data-ai';
  if (/\b(humanities|history|literature|philosophy|political|law|policy|music|art)\b/.test(value)) {
    return 'humanities-policy-arts';
  }
  if (/\b(biology|biomedical|medicine|health|toxicology|public-health)\b/.test(value)) {
    return 'life-health-sciences';
  }
  if (/\b(language|education|teaching)\b/.test(value)) return 'language-education';
  if (/\b(engineering|design|studio)\b/.test(value)) return 'engineering-design';
  return 'other';
}

function sortedIds(rows = []) {
  return rows.map((row) => row.id).sort();
}

export function buildProfessorAdoptionCoverage(manifests = []) {
  const disciplineFamilies = countBy(manifests, (manifest) => manifest.disciplineFamily);
  const modalityFamilies = countBy(manifests, (manifest) => manifest.modality);
  const sourceHosts = countBy(manifests, (manifest) => sourceHost(manifest.sourceUrl));
  const clusters = countBy(manifests, (manifest) => disciplineCluster(manifest.disciplineFamily));
  const singleCaseDisciplineFamilies = disciplineFamilies.filter((row) => row.count === 1);
  const thinClusters = clusters.filter((row) => row.count < 3);
  const dominantSourceHosts = sourceHosts.filter((row) => row.count / Math.max(1, manifests.length) >= 0.4);
  return {
    caseCount: manifests.length,
    disciplineFamilies,
    modalityFamilies,
    sourceHosts,
    clusters,
    singleCaseDisciplineFamilies,
    thinClusters,
    dominantSourceHosts,
    strategy: {
      nextStableGateSize: 30,
      nextExtendedPoolTarget: 60,
      recommendation:
        manifests.length >= 30
          ? 'Hold the full gate at 30 while adding source verification and harder quality dimensions before expanding the rotating pool.'
          : 'Grow the full gate toward 30 curated public-source cases before making university-readiness claims.',
      nextExpansionFocus:
        singleCaseDisciplineFamilies.length > 0 ? sortedIds(singleCaseDisciplineFamilies) : sortedIds(thinClusters),
    },
  };
}
