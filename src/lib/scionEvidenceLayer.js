// Scion's private evidence prepass.
//
// This reuses the strongest source-consolidation machinery developed behind
// the historical Algi experiment, but exposes one product: Scion. Evidence is
// admitted before local inference, then bound to Scion's existing immutable
// source-ledger contract. External research is caller-controlled and OFF by
// default; this module never decides consent.

function clean(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function validFact(value) {
  const text = clean(value);
  return text.length >= 20 && text.length <= 400 && /[.!?]$/.test(text);
}

function normalizeCitation(entry = {}) {
  const sourceUrl = clean(entry.sourceUrl);
  const displayTitle = clean(entry.displayTitle || entry.key);
  if (!displayTitle || (sourceUrl && !/^https:\/\//i.test(sourceUrl))) return null;
  return {
    displayTitle,
    sourceUrl,
    license: clean(entry.license),
    attribution: clean(entry.attribution),
    kind: clean(entry.kind || 'open source'),
    evidence: clean(entry.evidence),
    ...(entry.supportReceipt ? { supportReceipt: entry.supportReceipt } : {}),
  };
}

export function scionEvidenceLessonFromComposedPayload(payload = {}) {
  const lessonId = clean(payload.lessonId);
  const facts = [...new Set((Array.isArray(payload.facts) ? payload.facts : []).map(clean).filter(validFact))].slice(
    0,
    5,
  );
  const sourceConcepts = (Array.isArray(payload.keyTerms) ? payload.keyTerms : []).filter(Boolean).slice(0, 6);
  const citations = (Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [])
    .map(normalizeCitation)
    .filter(Boolean)
    .slice(0, 8);
  if (
    !lessonId ||
    facts.length < 3 ||
    sourceConcepts.length < 3 ||
    citations.length === 0 ||
    payload?.conceptProvenance?.fullyAnchored !== true
  ) {
    return null;
  }
  const licenses = [...new Set(citations.map((citation) => citation.license).filter(Boolean))];
  const attribution = citations.map((citation) => citation.attribution).find(Boolean) || 'EduTool source library';
  return {
    lessonId,
    sourceFactPolicy: 'numbered-source-ledger-v1',
    sourceFacts: facts,
    sourceConcepts,
    sourceLedgerAttribution: {
      title: `Scion evidence ledger for ${lessonId}`,
      author: attribution,
      license: licenses.join('; '),
      url: citations.map((citation) => citation.sourceUrl).find(Boolean) || '',
    },
    scionEvidenceReceipts: citations,
    conceptProvenance: {
      ...payload.conceptProvenance,
      citations,
      fullyAnchored: true,
    },
    evidenceOrigin:
      payload?.conceptProvenance?.source === 'algi-researched' ? 'verified-open-research' : 'shipped-source-library',
  };
}

export function createScionEvidenceOverlay(composed = {}) {
  let parsed = { lessons: [] };
  try {
    parsed = typeof composed?.text === 'string' && composed.text.trim() ? JSON.parse(composed.text) : parsed;
  } catch {
    // A malformed optional prepass is an evidence miss, never a build failure.
  }
  const lessons = (Array.isArray(parsed?.lessons) ? parsed.lessons : [])
    .map(scionEvidenceLessonFromComposedPayload)
    .filter(Boolean);
  return {
    protocol: 'scion-evidence-prepass-v1',
    byLessonId: Object.fromEntries(lessons.map((lesson) => [lesson.lessonId, lesson])),
    admitted: lessons.length,
    requested: Math.max(0, Number(composed?.requested) || 0),
    uncovered: Array.isArray(composed?.uncovered) ? [...composed.uncovered] : [],
    researched: Math.max(0, Number(composed?.researched) || 0),
    cachedResearch: Math.max(0, Number(composed?.cachedResearch) || 0),
    researchReceipt: composed?.researchReceipt || null,
  };
}

export async function prepareScionEvidenceLayer({
  structuredPrompt,
  researchEnabled = false,
  signal,
  onResearchProgress,
} = {}) {
  const [{ composeAlgiLessonKernels }, { buildResearchProvider }] = await Promise.all([
    import('./algiKernelComposer'),
    import('./algiComposer'),
  ]);
  const researchProvider = buildResearchProvider({ enabled: researchEnabled, signal });
  const composed = await composeAlgiLessonKernels({
    structuredPrompt,
    factCount: 5,
    researchProvider,
    courseContext: structuredPrompt?.courseName || '',
    onResearchProgress,
    signal,
  });
  return createScionEvidenceOverlay(composed);
}

export function summarizeScionEvidenceOverlay(overlay = null) {
  if (!overlay) return null;
  return {
    protocol: overlay.protocol,
    requested: overlay.requested,
    admitted: overlay.admitted,
    researched: overlay.researched,
    cachedResearch: overlay.cachedResearch,
    uncovered: overlay.uncovered,
  };
}

export function bindScionEvidenceProvenance(overlay, lessonId, payload) {
  const evidence = overlay?.byLessonId?.[lessonId];
  if (!evidence?.conceptProvenance || !payload) return payload;
  return {
    ...payload,
    enrichmentSource:
      evidence.evidenceOrigin === 'verified-open-research' ? 'scion-source-researched' : 'scion-source-library',
    conceptProvenance: evidence.conceptProvenance,
  };
}

export async function prepareScionEvidenceForGeneration({
  courseMap,
  lessonIndices = [],
  genomeLessonContent = {},
  genomePartialOverlays = {},
  researchEnabled = false,
  signal,
  recordEvent,
  appendLog,
} = {}) {
  const unresolvedLessonIndices = lessonIndices.filter((lessonIndex) => {
    const lessonId = `lesson-${lessonIndex + 1}`;
    return !genomeLessonContent?.[lessonId] || Boolean(genomePartialOverlays?.[lessonId]);
  });
  if (unresolvedLessonIndices.length === 0) {
    return {
      overlay: null,
      summary: null,
      researchReady: false,
      stageDecision: 'not needed: shipped source library covered the course',
      bindProvenance: (_lessonId, payload) => payload,
    };
  }
  const structuredPrompt = {
    courseName: courseMap?.courseName || '',
    lessons: unresolvedLessonIndices.map((lessonIndex) => ({
      lessonId: `lesson-${lessonIndex + 1}`,
      title: courseMap?.lessons?.[lessonIndex]?.title || `Lesson ${lessonIndex + 1}`,
    })),
  };
  const overlay = await prepareScionEvidenceLayer({
    structuredPrompt,
    researchEnabled,
    signal,
    onResearchProgress: (progress = {}) => {
      recordEvent?.({
        type: 'scionEvidenceProgress',
        stage: 'scion-evidence',
        label: progress.label || 'Checking current lesson evidence',
        detail: progress.detail || '',
        featureId: 'blueprintEnrichment',
        task: 'blueprintEnrichment',
        progress: Math.max(0, Math.min(1, Number(progress.progress) || 0)),
      });
    },
  });
  recordEvent?.({
    type: 'pipelineDecision',
    stage: 'scionEvidence',
    label: 'Scion evidence layer',
    detail: `${overlay.admitted}/${overlay.requested} unresolved lesson ledgers admitted before local inference · ${overlay.researched} researched · ${overlay.cachedResearch} reused from local research memory`,
    featureId: 'blueprintEnrichment',
    task: 'blueprintEnrichment',
  });
  if (overlay.admitted > 0) {
    appendLog?.(
      `✓ Scion grounded ${overlay.admitted} additional lesson${overlay.admitted === 1 ? '' : 's'} before local authoring${overlay.researched > 0 ? ` (${overlay.researched} from verified current sources)` : ''}`,
      'done',
    );
  }
  return {
    overlay,
    summary: summarizeScionEvidenceOverlay(overlay),
    researchReady: overlay.researched > 0 || overlay.cachedResearch > 0,
    stageDecision: `ran (${overlay.admitted}/${overlay.requested} ledgers${researchEnabled ? `, ${overlay.researched} researched` : ', on-device'})`,
    bindProvenance: (lessonId, payload) => bindScionEvidenceProvenance(overlay, lessonId, payload),
  };
}

export async function prepareScionEvidenceGenerationHandoff(options = {}) {
  try {
    const result = await prepareScionEvidenceForGeneration(options);
    const evidenceByLessonId = result.overlay?.byLessonId;
    return {
      stageDecision: result.stageDecision,
      promptOptions: evidenceByLessonId && Object.keys(evidenceByLessonId).length > 0 ? { evidenceByLessonId } : {},
      bindProvenance: result.bindProvenance,
      knowledgeBackboneEvent: result.researchReady
        ? {
            type: 'pipelineDecision',
            stage: 'knowledgeBackbone',
            label: 'Scion source receipts ready',
            detail:
              'Skipped duplicate open-reading discovery · Scion research sources and verification receipts are already attached',
          }
        : null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {
      stageDecision: `failed open: ${error?.message || 'unknown'}`,
      promptOptions: {},
      bindProvenance: (_lessonId, payload) => payload,
      knowledgeBackboneEvent: null,
    };
  }
}
