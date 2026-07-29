import { cleanText, sentenceCase } from './compilerText';

export function finalArtifactLabel(artifact) {
  return /^final\b/i.test(artifact) ? sentenceCase(artifact) : `Final ${artifact}`;
}

export function mergeFinalRegistryEntries(entries = []) {
  const consumed = new Set();
  const merged = [];
  entries.forEach((entry, index) => {
    if (consumed.has(index)) return;
    const title = cleanText(entry?.title);
    const generic = title.match(/^final\s+(?:course\s+)?(portfolio|project|paper|presentation|report|performance)$/i);
    if (!generic) {
      merged.push(entry);
      return;
    }
    const family = generic[1].toLowerCase();
    const partnerIndex = entries.findIndex((candidate, candidateIndex) => {
      if (candidateIndex === index || consumed.has(candidateIndex)) return false;
      if (Number(candidate?.dueSession) !== Number(entry?.dueSession)) return false;
      const candidateTitle = cleanText(candidate?.title);
      return (
        candidateTitle.length > title.length + 4 &&
        new RegExp(`\\b${family}\\b`, 'i').test(candidateTitle) &&
        !/^final\s+(?:course\s+)?(?:portfolio|project|paper|presentation|report|performance)$/i.test(candidateTitle)
      );
    });
    if (partnerIndex < 0) {
      merged.push(entry);
      return;
    }
    const partner = entries[partnerIndex];
    consumed.add(partnerIndex);
    entries.forEach((candidate, candidateIndex) => {
      if (
        candidateIndex !== index &&
        Number(candidate?.dueSession) === Number(entry?.dueSession) &&
        cleanText(candidate?.title).toLowerCase() === title.toLowerCase()
      ) {
        consumed.add(candidateIndex);
      }
    });
    const weights = [entry.weightPct, partner.weightPct].filter(Number.isFinite);
    merged.push({
      ...entry,
      ...partner,
      title: partner.title,
      kind: partner.kind || entry.kind,
      dueSession: partner.dueSession,
      ...(weights.length > 0 ? { weightPct: weights.reduce((sum, weight) => sum + weight, 0) } : {}),
      compilerMergedAssessmentTitles: [title, partner.title],
    });
  });
  return merged;
}
