/**
 * courseGraph/blueprintFromGraph.js — v0.13 P0: compile FROM the graph.
 *
 * The blueprint compiler stays the proven projection engine; this adapter
 * feeds it from the graph instead of from prose. Concept entities that
 * carry authored or genome-linked kernels are assembled into the
 * lessonContent enrichment overlay the compiler already consumes — Concept
 * ≡ kernel, so the graph IS the enrichment source.
 *
 * P6 progressively bypasses the compiler's prose-inference heuristics where
 * graph data answers directly; until then equivalence with the map-driven
 * path is guaranteed by construction (render → same compile path).
 */

import { buildCourseBlueprint } from '../courseBlueprintCompiler.js';
import { detectForeignLanguageTeachingContent } from '../languageIdentityGuard.js';
import {
  isLessonResearchSurfaceBound,
  sanitizeGenomeEnrichmentForLesson,
  semanticIdentityTokens,
  sourceIdentityScopeMismatch,
} from '../lessonSemanticRelevance.js';
import { isCourseAwareWeakSource } from '../knowledge/sourceLedger.js';
import { repairScionEnrichmentAnswerKeys } from '../scionAnswerKeyAlignment.js';
import { renderCourseMapFromGraph } from './renderCourseMap.js';
import { sha256HexSync } from '../sha256Sync.js';
import { EXACT_SOURCE_LEDGER_PROVENANCE, SOURCE_LEDGER_AUTHORITIES } from '../sourceLedgerProvenance.js';
import {
  createAuthenticLanguageEvidenceAuthorityByLessonId,
  evidenceMatchesLanguageDemand,
  enrichAuthenticLanguageDataPacket,
  languageEvidenceDemand,
} from './authenticLanguageEvidenceLibrary.js';

/**
 * Assemble the enrichment overlay from the graph: the stored overlay
 * (course-level lens, signature terms, per-session composed content) plus
 * any per-concept kernel payloads keyed to their sessions.
 */
export function enrichmentFromGraph(graph) {
  if (!graph || typeof graph !== 'object') return null;
  const storedOverlay =
    graph.enrichmentOverlay && typeof graph.enrichmentOverlay === 'object' ? { ...graph.enrichmentOverlay } : {};
  const { enrichment: overlay } = repairScionEnrichmentAnswerKeys(storedOverlay);
  const lessonContent = { ...(overlay.lessonContent || {}) };

  // Concepts carrying kernels contribute to the sessions that teach them.
  const sessionById = new Map((graph.sessions || []).map((session) => [session.id, session]));
  for (const edge of graph.edges?.teaches || []) {
    const session = sessionById.get(edge?.from);
    const concept = (graph.concepts || []).find((entry) => entry.id === edge?.to);
    if (!session || !concept?.kernel || typeof concept.kernel !== 'object') continue;
    const key = `lesson-${session.number}`;
    // Session-level composed content (from the overlay) wins; per-concept
    // kernels fill sessions the overlay does not cover.
    if (!lessonContent[key]) lessonContent[key] = concept.kernel;
  }

  const authenticLanguageDataCoverage =
    graph.authenticLanguageDataCoverage && typeof graph.authenticLanguageDataCoverage === 'object'
      ? graph.authenticLanguageDataCoverage
      : null;
  const hasOverlayContent = Object.keys(lessonContent).length > 0;
  if (!hasOverlayContent && Object.keys(overlay).length === 0 && !authenticLanguageDataCoverage) return null;
  return {
    ...overlay,
    ...(hasOverlayContent ? { lessonContent } : {}),
    ...(authenticLanguageDataCoverage ? { authenticLanguageDataCoverage } : {}),
  };
}

// v0.14.1 (4.4): payloads from these sources carry conceptProvenance with
// genome concept ids — the linker's full compositions ('genome-linked',
// including ones replayed from the own-kernel cache) and the 4.5 merge of a
// genome partial with a model kernel ('genome-augmented').
const GENOME_PAYLOAD_SOURCES = new Set(['genome-linked', 'genome-augmented']);

/**
 * Attach a generation-time enrichment result to the graph: the full object
 * becomes the overlay (so enrichmentFromGraph reproduces it exactly — the
 * compile path stays byte-equivalent with the legacy options.enrichment
 * call), and per-lesson kernel payloads are ALSO distributed onto each
 * session's primary Concept entity so agent operations, stats, and future
 * entity-level features see Concept ≡ kernel.
 */
export function attachEnrichmentToGraph(graph, enrichment) {
  if (!graph || typeof graph !== 'object') return graph;
  if (!enrichment || typeof enrichment !== 'object') return graph;
  const { enrichment: alignedEnrichment } = repairScionEnrichmentAnswerKeys(enrichment);
  graph.enrichmentOverlay = alignedEnrichment;

  const lessonContent =
    alignedEnrichment.lessonContent && typeof alignedEnrichment.lessonContent === 'object'
      ? alignedEnrichment.lessonContent
      : {};
  const sessionByNumber = new Map((graph.sessions || []).map((session) => [session.number, session]));
  const sessionById = new Map((graph.sessions || []).map((session) => [session.id, session]));
  const conceptsById = new Map((graph.concepts || []).map((concept) => [concept.id, concept]));
  const primaryConceptBySessionId = new Map();
  for (const edge of graph.edges?.teaches || []) {
    if (edge?.from && !primaryConceptBySessionId.has(edge.from)) primaryConceptBySessionId.set(edge.from, edge.to);
  }

  for (const [key, payload] of Object.entries(lessonContent)) {
    if (!payload || typeof payload !== 'object') continue;
    const numberMatch = String(key).match(/^lesson-(\d+)$/);
    const session = numberMatch ? sessionByNumber.get(Number(numberMatch[1])) : sessionById.get(key);
    const conceptId = session ? primaryConceptBySessionId.get(session.id) : null;
    const concept = conceptId ? conceptsById.get(conceptId) : null;
    if (concept) {
      concept.kernel = payload;
      concept.source = concept.source || alignedEnrichment.quality?.source || alignedEnrichment.source || 'enrichment';
      // v0.14.1 (4.4): write the genomeLink edges. Created empty at
      // schema.js:41 and read by courseGraphStats, but written by nobody —
      // the v0.14 audit's "(0 genome-linked)" digest lie while the linker
      // had resolved 3 lessons. Edges are { from, to } OBJECTS, never
      // tuples: Firestore rejects directly nested arrays and the cloud
      // project snapshot carries the graph (v0.13.1 production rule).
      const provenanceIds = GENOME_PAYLOAD_SOURCES.has(payload.enrichmentSource)
        ? payload.conceptProvenance?.conceptIds || []
        : [];
      if (provenanceIds.length > 0) {
        if (!graph.edges || typeof graph.edges !== 'object') graph.edges = {};
        // Older graphs predate the genomeLink collection — initialize.
        if (!Array.isArray(graph.edges.genomeLink)) graph.edges.genomeLink = [];
        for (const genomeConceptId of provenanceIds) {
          if (typeof genomeConceptId !== 'string' || genomeConceptId.length === 0) continue;
          const exists = graph.edges.genomeLink.some(
            (edge) => edge?.from === concept.id && edge?.to === genomeConceptId,
          );
          if (!exists) graph.edges.genomeLink.push({ from: concept.id, to: genomeConceptId });
        }
      }
    }
  }
  return graph;
}

// Origins minted by the knowledge backbone (v0.13.5). Cell-parsed
// 'syllabus'-origin resources are NOT included: they already render in
// supportingResources, and passing them would make the graph path diverge
// from the map path (golden equivalence).
const KNOWLEDGE_BACKBONE_ORIGINS = new Set([
  'authentic-language-data',
  'genome',
  'algi-research',
  'genome-prerequisite',
  'openalex',
  'openlibrary',
  'openstax',
  'source-finder',
]);

function migrateCompilerGeneratedAssessmentIdentity(assessment = {}) {
  const migrate = (value) =>
    String(value || '')
      .replace(
        /\bmini-brief with one stakeholder, one constraint, and one recommended action\.?$/i,
        'brief: stakeholder, constraint, recommendation.',
      )
      .replace(/^(.{2,120}) exit reflection: connect evidence to \1 task\.?$/i, '$1 exit reflection.')
      .replace(
        /^(.{2,120}) application check: apply one example and name one limitation\.?$/i,
        '$1 application check.',
      );
  const title = migrate(assessment.title);
  const sourceText = migrate(assessment.sourceText);
  if (title === assessment.title && sourceText === assessment.sourceText) return assessment;
  return { ...assessment, title, ...(assessment.sourceText ? { sourceText } : {}) };
}

function stableAuthenticExamplePayload(example = {}) {
  return JSON.stringify({
    id: String(example.id || ''),
    language: String(example.language || ''),
    form: String(example.form || ''),
    gloss: String(example.gloss || ''),
    translation: String(example.translation || ''),
    analysisFocus: String(example.analysisFocus || ''),
    sourceId: String(example.sourceId || ''),
    sourceLocator: String(example.sourceLocator || ''),
    communityContext: String(example.communityContext || ''),
    articulatoryProfile:
      example?.articulatoryProfile && typeof example.articulatoryProfile === 'object'
        ? {
            voicing: String(example.articulatoryProfile.voicing || ''),
            constrictionPlace: String(example.articulatoryProfile.constrictionPlace || ''),
            manner: String(example.articulatoryProfile.manner || ''),
            airflow: String(example.articulatoryProfile.airflow || ''),
          }
        : null,
    comparisonRelation:
      example?.comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1'
        ? {
            protocol: 'coursemapper-authentic-evidence-relation-v1',
            relationId: String(example.comparisonRelation.relationId || ''),
            kind: String(example.comparisonRelation.kind || ''),
            operandLabels: (example.comparisonRelation.operandLabels || []).map(String),
            sharedFeature: String(example.comparisonRelation.sharedFeature || ''),
            discriminatingFeature: String(example.comparisonRelation.discriminatingFeature || ''),
          }
        : null,
  });
}

function completeAuthenticExample(example = {}) {
  return ['id', 'language', 'form', 'gloss', 'translation', 'analysisFocus', 'sourceId', 'sourceLocator'].every(
    (field) => String(example?.[field] || '').trim(),
  );
}

function authenticEvidenceDisplayLabel(example = {}, index = 0) {
  const language = String(example.language || 'Language').trim() || 'Language';
  const languageTokens = new Set(
    language
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
  const noise = new Set(['wals', 'mit', 'ocw', 'example', 'record']);
  const tokens = String(example.id || '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token && !/^\d+$/.test(token) && !noise.has(token) && !languageTokens.has(token));
  const descriptor = tokens
    .map((token) => (/^(?:sov|svo|vso|vos|ovs|osv)$/.test(token) ? token.toUpperCase() : token))
    .join(' ')
    .replace(/\bv adv\b/i, 'verb–adverb')
    .trim();
  return `${language} ${descriptor || `record ${index + 1}`} example`;
}

function buildAuthenticEvidenceTaskBinding({ lessonNumber, sessionId, operation, examples = [] } = {}) {
  if (!examples.length || !examples.every(completeAuthenticExample)) return null;
  const boundExamples = examples.map((example, index) => {
    const payload = stableAuthenticExamplePayload(example);
    const language = String(example.language);
    return {
      id: String(example.id),
      language,
      displayLabel: authenticEvidenceDisplayLabel(example, index),
      form: String(example.form),
      gloss: String(example.gloss),
      translation: String(example.translation),
      analysisFocus: String(example.analysisFocus),
      sourceId: String(example.sourceId),
      sourceLocator: String(example.sourceLocator),
      communityContext: String(example.communityContext || ''),
      ...(example?.articulatoryProfile && typeof example.articulatoryProfile === 'object'
        ? { articulatoryProfile: structuredClone(example.articulatoryProfile) }
        : {}),
      ...(example?.comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1'
        ? { comparisonRelation: structuredClone(example.comparisonRelation) }
        : {}),
      payloadSha256: sha256HexSync(payload),
    };
  });
  const normalizedRelationText = (value) =>
    String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const intrinsicRelationExample = boundExamples.find(
    (example) =>
      example?.comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1' &&
      String(example.comparisonRelation.relationId || '').trim() &&
      Array.isArray(example.comparisonRelation.operandLabels) &&
      example.comparisonRelation.operandLabels.length >= 2 &&
      String(example.comparisonRelation.sharedFeature || '').trim() &&
      String(example.comparisonRelation.discriminatingFeature || '').trim(),
  );
  const distinctAnalysisExamples = boundExamples.filter(
    (example, index, rows) =>
      normalizedRelationText(example.analysisFocus) &&
      rows.findIndex(
        (candidate) =>
          normalizedRelationText(candidate.analysisFocus) === normalizedRelationText(example.analysisFocus),
      ) === index,
  );
  const relationRequired = ['comparison', 'mechanism-explanation'].includes(operation);
  const comparisonRelation = !relationRequired
    ? null
    : intrinsicRelationExample
      ? {
          protocol: 'coursemapper-authentic-evidence-relation-v1',
          relationId: String(intrinsicRelationExample.comparisonRelation.relationId),
          kind: String(intrinsicRelationExample.comparisonRelation.kind),
          evidenceItemIds: [String(intrinsicRelationExample.id)],
          operandLabels: intrinsicRelationExample.comparisonRelation.operandLabels.map(String),
          sharedFeature: String(intrinsicRelationExample.comparisonRelation.sharedFeature),
          discriminatingFeature: String(intrinsicRelationExample.comparisonRelation.discriminatingFeature),
        }
      : distinctAnalysisExamples.length >= 2
        ? {
            protocol: 'coursemapper-authentic-evidence-relation-v1',
            relationId: `cross-record-${distinctAnalysisExamples
              .slice(0, 2)
              .map((example) => example.id)
              .join('-')}`,
            kind: 'cross-record-contrast',
            evidenceItemIds: distinctAnalysisExamples.slice(0, 2).map((example) => String(example.id)),
            operandLabels: distinctAnalysisExamples.slice(0, 2).map((example) => String(example.displayLabel)),
            sharedFeature: 'Both operands are source-bound form, gloss, and translation records.',
            discriminatingFeature: distinctAnalysisExamples
              .slice(0, 2)
              .map((example) => `${example.displayLabel}: ${example.analysisFocus}`)
              .join(' By contrast, '),
          }
        : null;
  if (relationRequired && !comparisonRelation) return null;
  const payloadSha256 = sha256HexSync(JSON.stringify(boundExamples));
  const specimen = boundExamples
    .map(
      (example) =>
        `${example.displayLabel}: “${example.form}” | gloss: ${example.gloss} | translation: ${example.translation}${example.articulatoryProfile ? ` | articulatory evidence: ${example.articulatoryProfile.voicing}; ${example.articulatoryProfile.constrictionPlace}; ${example.articulatoryProfile.manner}; ${example.articulatoryProfile.airflow}` : ''} | source: ${example.sourceLocator}`,
    )
    .join(' Compare with ');
  const variant = (values) => values[(Math.max(1, Number(lessonNumber) || 1) - 1) % values.length];
  const action =
    operation === 'evidence-audit'
      ? variant([
          'Separate the visible form, gloss, and translation from the interpretation attached to each record; cite the locator and identify one broader claim the displayed evidence cannot establish.',
          'Audit each record as linguistic evidence: mark the observation, the source-bounded inference, and the point where an unsupported generalization would begin.',
          'Build an evidence ladder from displayed form to gloss to interpretation, then name the additional record needed before transferring the claim.',
        ])
      : operation === 'dataset-audit'
        ? variant([
            'Treat the displayed records as a candidate mini-corpus: state an inclusion rule, define two annotation fields, identify one comparability risk, and propose a reproducible quality check.',
            'Audit the sample before analysis: document how records enter the corpus, specify an annotation protocol, and flag the sampling limit that constrains any conclusion.',
            'Design a small corpus workflow from these records by naming the selection rule, annotation unit, second-review check, and boundary on cross-language comparison.',
          ])
        : operation === 'proposal-defense'
          ? variant([
              'Use the displayed records to defend a feasible project question, sampling rule, annotation plan, comparison method, and claim boundary; name the evidence that would make the proposal stronger.',
              'Propose an analysis that can be executed on the packet: connect the question to selected rows, define coding and verification steps, and defend what the resulting sample could and could not establish.',
              'Build a defensible project plan around these records, including the analytic unit, inclusion criteria, reliability check, expected comparison, and a limitation that survives the final claim.',
            ])
          : operation === 'mechanism-explanation'
            ? variant([
                'Use the observable form and gloss order to explain the competing structural mechanism; state what the contrast supports and what it does not prove.',
                'Trace the form-to-gloss alignment, distinguish the competing mechanisms, and identify the observation that would decide between them.',
                'Explain the structural mechanism from the displayed order, then mark the inference that these records alone cannot establish.',
              ])
            : operation === 'generalization'
              ? variant([
                  'Compare all records, formulate one bounded cross-linguistic generalization, and identify a counterexample that would weaken it.',
                  'Synthesize the displayed records into a limited generalization, then name the additional record that could overturn it.',
                  'State the pattern shared across the records, preserve any exception, and keep the generalization inside the cited sample.',
                ])
              : operation === 'comparison'
                ? variant([
                    'Compare the observable pattern in the records, explain the relevant difference, and keep the conclusion within the cited data.',
                    'Align the forms and glosses, identify the decisive contrast, and state what the comparison cannot show beyond these records.',
                    'Name one similarity and one difference in the displayed records, then justify a bounded comparison from the source details.',
                  ])
                : variant([
                    'Identify the observable pattern in this record, support the identification from its form and gloss, and state one evidence boundary.',
                    'Read the displayed form against its gloss, name the pattern you can inspect, and distinguish that observation from a broader claim.',
                    'Point to the exact segment or order that supports the identification, then state what this single record leaves unresolved.',
                    'Use the form, gloss, and translation together to identify the pattern; keep the conclusion limited to the cited record.',
                    'Mark the decisive detail in the displayed record, explain the identification, and name the evidence needed before transfer.',
                    'Describe what is observable in the form and gloss, connect it to the requested identification, and reject one unsupported extension.',
                  ]);
  const recordAnswerKey = boundExamples
    .map(
      (example) =>
        `${example.displayLabel}: ${example.analysisFocus}${example.communityContext ? ` Boundary: ${example.communityContext}` : ''}`,
    )
    .join(' ');
  const answerKey =
    operation === 'evidence-audit'
      ? `A complete evidence audit preserves each displayed form, gloss, translation, and locator; distinguishes observation from source-bounded interpretation; and rejects transfer beyond the cited records without new data. ${recordAnswerKey}`
      : operation === 'dataset-audit'
        ? `A complete audit names a reproducible inclusion rule, preserves each form/gloss/translation as recorded, defines at least two annotation fields, adds an independent consistency check, and limits conclusions to the selected rows. ${recordAnswerKey}`
        : operation === 'proposal-defense'
          ? `A defensible proposal connects a bounded question to named rows, states its sampling and annotation decisions, identifies the comparison to be made, includes a verification step, and preserves a claim limitation. ${recordAnswerKey}`
          : relationRequired
            ? `${comparisonRelation.operandLabels.join(' · ')}. Shared feature: ${comparisonRelation.sharedFeature} Discriminating feature: ${comparisonRelation.discriminatingFeature} ${recordAnswerKey}`
            : recordAnswerKey;
  const evidenceLabels = boundExamples.map((example) => example.displayLabel);
  const evidenceLabelText = evidenceLabels.join(', ');
  const locatorText = boundExamples.map((example) => `${example.displayLabel}: ${example.sourceLocator}`).join('; ');
  const successCriterion =
    operation === 'evidence-audit'
      ? variant([
          `Distinguish observation, interpretation, and unsupported transfer for ${evidenceLabelText}.`,
          `Make the evidence boundary auditable from ${evidenceLabelText} and its recorded locations.`,
          `Trace a bounded linguistic claim from ${evidenceLabelText} without substituting a topic label for data.`,
        ])
      : operation === 'dataset-audit'
        ? variant([
            `Produce a replayable sample-and-annotation audit for ${evidenceLabelText}.`,
            `Document a selection, coding, and verification workflow for ${evidenceLabelText}.`,
            `Make the corpus decision traceable from ${evidenceLabelText} to a bounded analysis claim.`,
          ])
        : operation === 'proposal-defense'
          ? variant([
              `Defend a feasible, source-traceable analysis proposal using ${evidenceLabelText}.`,
              `Connect the research question, method, and claim limit to ${evidenceLabelText}.`,
              `Show that the proposed analysis can be replayed from ${evidenceLabelText}.`,
            ])
          : variant([
              `Analyze ${evidenceLabelText} without extending the conclusion beyond the cited records.`,
              `Use ${evidenceLabelText} to perform the declared ${operation} and preserve the source boundary.`,
              `Trace the ${operation} from ${evidenceLabelText} to an evidence-limited conclusion.`,
              `Ground the requested ${operation} in ${evidenceLabelText} and state what remains unresolved.`,
              `Make the ${operation} auditable from ${evidenceLabelText} and its recorded locations.`,
              `Support the ${operation} with ${evidenceLabelText} while retaining the packet's limitations.`,
            ]);
  const assessmentCriteria =
    operation === 'evidence-audit'
      ? [
          `Form, gloss, and translation fidelity for ${evidenceLabelText}.`,
          `Observation separated from interpretation for each cited record.`,
          `Source-location accuracy for ${locatorText}.`,
          `Transfer boundary and next evidence need stated explicitly.`,
        ]
      : operation === 'dataset-audit'
        ? [
            `Selection-rule transparency for ${evidenceLabelText}.`,
            `Annotation fidelity to the forms, glosses, and translations in ${evidenceLabelText}.`,
            `Reproducible consistency check tied to ${locatorText}.`,
            `Sampling and comparison limits stated for the selected rows.`,
          ]
        : operation === 'proposal-defense'
          ? [
              `Question-to-evidence alignment for ${evidenceLabelText}.`,
              `Executable sampling, annotation, and comparison plan.`,
              `Verification and source traceability through ${locatorText}.`,
              `Feasible claim scope and explicit evidence limits.`,
            ]
          : [
              `Form-and-gloss fidelity for ${evidenceLabelText}.`,
              `${operation} using ${evidenceLabelText}.`,
              `Source-location accuracy for ${locatorText}.`,
              `Conclusion boundaries supported by ${evidenceLabelText}.`,
            ];
  const taskCore = {
    protocol: 'coursemapper-authentic-evidence-task-binding-v1',
    lessonNumber,
    sessionId,
    operation,
    evidenceItemIds: boundExamples.map((example) => example.id),
    evidenceLabels,
    payloadSha256,
    examples: boundExamples,
    ...(comparisonRelation ? { comparisonRelation } : {}),
    objective: `Source-bound ${operation}: ${evidenceLabelText}.`,
    prompt: `${specimen}. ${action}`,
    answerKey,
    successCriterion,
    assessmentCriteria,
    sourceCue: `Authentic language-data packet for ${evidenceLabelText}`,
  };
  const taskContractSha256 = sha256HexSync(JSON.stringify(taskCore));
  return {
    ...taskCore,
    taskContractSha256,
    truthProof: {
      protocol: 'coursemapper-authentic-evidence-truth-proof-v1',
      payloadSha256,
      taskContractSha256,
      evidenceItemIds: boundExamples.map((example) => example.id),
      promptDisplaysBoundPayload: true,
      answerKeyOperatesOnBoundPayload: true,
      rubricScoresDeclaredOperation: true,
      comparisonRelationVerified: relationRequired ? Boolean(comparisonRelation) : null,
    },
  };
}

function uniqueText(values = [], limit = 12) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function selectOperationQualifiedExamples(
  examples = [],
  lessonNumber = 1,
  requiredExamples = 1,
  requiredLanguages = 1,
  operation = 'identification',
) {
  if (examples.length === 0) return [];
  const exampleOffset = (Math.max(1, Number(lessonNumber) || 1) - 1) % examples.length;
  const rotated = [...examples.slice(exampleOffset), ...examples.slice(0, exampleOffset)];
  if (operation === 'comparison') {
    const intrinsic = rotated.find(
      (example) =>
        example?.comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1' &&
        Array.isArray(example.comparisonRelation.operandLabels) &&
        example.comparisonRelation.operandLabels.length >= 2 &&
        String(example.comparisonRelation.sharedFeature || '').trim() &&
        String(example.comparisonRelation.discriminatingFeature || '').trim(),
    );
    if (intrinsic) return [intrinsic];
    for (let leftIndex = 0; leftIndex < rotated.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rotated.length; rightIndex += 1) {
        const left = rotated[leftIndex];
        const right = rotated[rightIndex];
        const leftFocus = String(left?.analysisFocus || '')
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        const rightFocus = String(right?.analysisFocus || '')
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        if (!leftFocus || !rightFocus || leftFocus === rightFocus) continue;
        if (!left?.id || !right?.id || String(left.id) === String(right.id)) continue;
        return [left, right];
      }
    }
    return [];
  }
  const selected = [];
  const selectedIds = new Set();
  const selectedLanguages = new Set();
  for (const example of rotated) {
    const language = String(example?.language || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase();
    if (!language || selectedLanguages.has(language)) continue;
    selected.push(example);
    selectedIds.add(String(example?.id || ''));
    selectedLanguages.add(language);
    if (selectedLanguages.size >= requiredLanguages || selected.length >= requiredExamples) break;
  }
  for (const example of rotated) {
    if (selected.length >= requiredExamples) break;
    if (selectedIds.has(String(example?.id || ''))) continue;
    selected.push(example);
    selectedIds.add(String(example?.id || ''));
  }
  return selected.slice(0, requiredExamples);
}

function withAuthenticLanguageDataResource(graph) {
  const courseIdentity = graph?.course?.name || graph?.courseName || graph?.title || '';
  const packet = enrichAuthenticLanguageDataPacket(graph?.authenticLanguageData, graph?.sessions, courseIdentity);
  const examples = Array.isArray(packet?.examples) ? packet.examples : [];
  const sourceIds = new Set(examples.map((example) => example?.sourceId).filter(Boolean));
  const languageNames = new Set(examples.map((example) => example?.language).filter(Boolean));
  if (
    packet?.protocol !== 'coursemapper-authentic-language-data-v1' ||
    examples.length < 2 ||
    sourceIds.size < 1 ||
    languageNames.size < 2
  ) {
    return graph;
  }

  const resourceId = 'authentic-language-data-packet';
  const resources = Array.isArray(graph.resources) ? graph.resources : [];
  const packetResource = {
    id: resourceId,
    title: 'Documented multilingual data packet',
    citation: 'Required Assets/AUTHENTIC_LANGUAGE_DATA.csv and AUTHENTIC_LANGUAGE_DATA_GUIDE.md',
    attribution: `${examples.length} attested examples across ${languageNames.size} languages; see the packet source ledger.`,
    kind: 'course data packet',
    origin: 'authentic-language-data',
    evidence:
      'Use the recorded forms, glosses, translations, source locators, and analysis boundaries; do not generalize one example to an entire language.',
    sourceType: 'structured-authentic-data',
  };
  const nextResources = resources.some((resource) => resource?.id === resourceId)
    ? resources
    : [...resources, packetResource];
  const sessionsInput = graph.sessions || [];
  const normalized = (value) =>
    String(value || '')
      .normalize('NFKC')
      .toLowerCase();
  const coverageLessons = sessionsInput
    .map((session, index) => {
      const text = [
        session?.title,
        ...(session?.sections || []).flatMap((section) => [section?.topic, section?.objective]),
      ]
        .filter(Boolean)
        .join(' ');
      const demand = languageEvidenceDemand(text, { courseContext: courseIdentity });
      if (!demand) return null;
      const { family, subtype: evidenceSubtype, ...operation } = demand;
      // Discipline admission must come from the source's declared analysis
      // claim. Glosses, translations, and boundary notes contain incidental
      // words such as "segment", "clause", and "meaning"; treating those as
      // topical proof can bind phonology evidence to morphology or syntax.
      const relevantExamples = examples.filter((example) => evidenceMatchesLanguageDemand(example, demand));
      const completeRelevantExamples = relevantExamples.filter(completeAuthenticExample);
      const operationQualifiedExamples = completeRelevantExamples;
      const relevantLanguages = new Set(
        operationQualifiedExamples.map((example) => normalized(example?.language)).filter(Boolean),
      );
      const admitted =
        operationQualifiedExamples.length >= operation.requiredExamples &&
        relevantLanguages.size >= operation.requiredLanguages;
      const lessonNumber = Number(session?.number) || index + 1;
      const taskExamples = admitted
        ? selectOperationQualifiedExamples(
            operationQualifiedExamples,
            lessonNumber,
            operation.requiredExamples,
            operation.requiredLanguages,
            operation.operation,
          )
        : [];
      const taskBinding = admitted
        ? buildAuthenticEvidenceTaskBinding({
            lessonNumber,
            sessionId: session?.id || `s${index + 1}`,
            operation: operation.operation,
            examples: taskExamples,
          })
        : null;
      return {
        lessonNumber,
        sessionId: session?.id || `s${index + 1}`,
        ...(evidenceSubtype ? { evidenceSubtype } : {}),
        ...operation,
        relevantExampleIds: operationQualifiedExamples.map((example) => String(example.id)),
        relevantLanguages: [...relevantLanguages],
        admitted: admitted && Boolean(taskBinding),
        ...(taskBinding ? { taskBinding } : {}),
      };
    })
    .filter(Boolean);
  const admittedSessionIds = new Set(
    coverageLessons.filter((lesson) => lesson.admitted).map((lesson) => lesson.sessionId),
  );
  const sessions = sessionsInput.map((session, index) =>
    admittedSessionIds.has(session?.id || `s${index + 1}`)
      ? {
          ...session,
          sections: (session.sections || []).map((section) => ({
            ...section,
            resourceRefs: Array.from(new Set([...(section.resourceRefs || []), resourceId])),
          })),
        }
      : session,
  );
  const admittedLessons = coverageLessons.filter((lesson) => lesson.admitted).length;
  return {
    ...graph,
    authenticLanguageData: packet,
    resources: nextResources,
    sessions,
    authenticLanguageDataCoverage: {
      protocol: 'coursemapper-authentic-language-data-coverage-v1',
      requiredLessonCount: coverageLessons.length,
      admittedLessonCount: admittedLessons,
      coverage: coverageLessons.length > 0 ? admittedLessons / coverageLessons.length : 1,
      lessons: coverageLessons,
      claimBoundary:
        'A packet is attached only to lessons whose operation-specific example and language thresholds are met; presence elsewhere in the course does not establish lesson support.',
    },
  };
}

function compilerSafeKnowledgeGraph(graph) {
  graph = withAuthenticLanguageDataResource(graph);
  let migratedOperationResourceCount = 0;
  const migratedResources = (graph?.resources || []).map((resource) => {
    const citation = String(resource?.citation || '');
    const migratedCitation = citation.replace(
      /\bAdmitted (.+?) source record plus a CourseMapper-native worked specimen with inspectable inputs and answer key\.?$/i,
      'Admitted $1 source record and verified CourseMapper operation specimen.',
    );
    if (migratedCitation === citation) return resource;
    migratedOperationResourceCount += 1;
    return { ...resource, citation: migratedCitation };
  });
  if (migratedOperationResourceCount > 0) graph = { ...graph, resources: migratedResources };
  const courseIdentity = graph?.course?.name || graph?.courseName || graph?.title || '';
  const foreignLanguageResourceIds = new Set(
    (graph?.resources || [])
      .filter((resource) => KNOWLEDGE_BACKBONE_ORIGINS.has(resource?.origin))
      .filter((resource) => resource?.origin !== 'authentic-language-data')
      .filter((resource) =>
        detectForeignLanguageTeachingContent({
          courseIdentity,
          text: `${resource?.title || ''} ${resource?.citation || ''} ${resource?.snippet || ''} ${
            resource?.evidence || ''
          }`,
        }),
      )
      .map((resource) => resource.id)
      .filter(Boolean),
  );
  const courseAwareWeakResourceIds = new Set(
    (graph?.resources || [])
      .filter((resource) => KNOWLEDGE_BACKBONE_ORIGINS.has(resource?.origin))
      // This resource is produced only from a separately validated authentic
      // language-data packet. Its terse file label is intentionally not a
      // prose citation, so the generic weak-source heuristic must not erase it
      // from later relevant lessons.
      .filter((resource) => resource?.origin !== 'authentic-language-data')
      .filter((resource) => isCourseAwareWeakSource(resource, graph))
      .map((resource) => resource.id)
      .filter(Boolean),
  );
  const lessonContent = graph?.enrichmentOverlay?.lessonContent || {};
  const renderedLessons = renderCourseMapFromGraph(graph)?.lessons || [];
  const resourcesById = new Map((graph?.resources || []).map((resource) => [resource.id, resource]));
  const originallyReferencedResourceIds = new Set(
    (graph?.sessions || []).flatMap((session) =>
      (session.sections || []).flatMap((section) => section.resourceRefs || []),
    ),
  );
  let changed =
    migratedOperationResourceCount > 0 || foreignLanguageResourceIds.size > 0 || courseAwareWeakResourceIds.size > 0;
  const retainedResourceIds = new Set();
  const rejectedLessonContentKeys = new Set();
  const researchRejectedResourceIdsBySessionId = new Map();

  const hasCurrentEvidenceAuthority = (lessonKey, payload) => {
    const authority = payload?.evidenceAuthorityReceipt;
    if (
      authority?.protocol !== 'coursemapper-evidence-authority-v1' ||
      authority?.status !== 'admitted' ||
      authority?.lessonId !== lessonKey ||
      !authority?.receiptSha256
    ) {
      return false;
    }
    const { receiptSha256, ...exactPayload } = authority;
    return sha256HexSync(JSON.stringify(exactPayload)) === receiptSha256;
  };

  for (const [lessonKey, payload] of Object.entries(lessonContent)) {
    const lessonNumber = Number(String(lessonKey).match(/(\d+)$/)?.[1]) || 0;
    const session = (graph?.sessions || []).find((entry) => entry?.number === lessonNumber);
    const lesson = renderedLessons[Math.max(0, lessonNumber - 1)] || session || {};
    const conceptLinks = [
      { label: session?.title || '' },
      ...(session?.sections || []).map((section) => ({ label: section?.topic || '' })),
      ...(Array.isArray(payload?.keyTerms) ? payload.keyTerms.map((term) => ({ label: term?.term || '' })) : []),
    ].filter((link) => link.label);
    const citations = Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [];
    const rejectedResearchIds = new Set(
      citations
        .filter((citation) =>
          /^(?:wikipedia|doaj|openalex|crossref|pubmed|eric)$/i.test(String(citation?.provider || '').trim()),
        )
        .filter(
          (citation) =>
            !isLessonResearchSurfaceBound(citation?.displayTitle || citation?.title || citation?.key, lesson),
        )
        .flatMap((citation) => [citation?.id, citation?.sourceId])
        .filter(Boolean),
    );
    if (rejectedResearchIds.size > 0 && session?.id) {
      researchRejectedResourceIdsBySessionId.set(session.id, rejectedResearchIds);
      changed = true;
    }
    // Stage-2 admission already bound exact passage claims to this exact
    // lesson intent. Re-running a broader title heuristic here produced a
    // split-brain pipeline: planning approved research, then graph projection
    // silently erased it. A fresh hash-bound authority receipt is the stronger
    // decision; legacy or stale payloads still pass through every replay guard.
    const hasWeakCitation =
      !hasCurrentEvidenceAuthority(lessonKey, payload) &&
      citations.some((citation) =>
        isCourseAwareWeakSource(
          {
            title: citation?.displayTitle || citation?.title || citation?.key,
            citation: citation?.text || citation?.label || citation?.source,
            evidence: citation?.evidence,
            sourceType: citation?.kind,
            conceptLinks: [...conceptLinks, ...(Array.isArray(citation?.conceptLinks) ? citation.conceptLinks : [])],
          },
          graph,
        ),
      );
    if (hasWeakCitation) {
      rejectedLessonContentKeys.add(lessonKey);
      changed = true;
    }
  }

  const resourceMatchesRejectedGenomeContent = (resource, receipt) => {
    if (!resource || !KNOWLEDGE_BACKBONE_ORIGINS.has(resource.origin)) return false;
    if (resource.origin === 'authentic-language-data') return false;
    const rejectedConceptIds = new Set(receipt.rejectedConceptIds || []);
    if (
      (resource.conceptLinks || []).some((link) => rejectedConceptIds.has(typeof link === 'string' ? link : link?.id))
    ) {
      return true;
    }
    const resourceTokens = new Set(
      semanticIdentityTokens(
        [resource.title, resource.citation, resource.attribution, resource.dedupeKey, resource.evidence]
          .filter(Boolean)
          .join(' '),
      ),
    );
    return (receipt.rejectedGenomeTerms || []).some((term) => {
      const termTokens = semanticIdentityTokens(term);
      const distinguishingTokens = termTokens.filter(
        (token) => !['analysi', 'concept', 'form', 'literary', 'poetic', 'read', 'theory'].includes(token),
      );
      return distinguishingTokens.some((token) => resourceTokens.has(token));
    });
  };

  const sessions = (graph?.sessions || []).map((session, index) => {
    const lesson = renderedLessons[index] || session;
    const payload = lessonContent[`lesson-${session.number || index + 1}`] || lessonContent[session.id] || null;
    const semanticReceipt = sanitizeGenomeEnrichmentForLesson(lesson, payload).receipt;
    const rejectedResearchIds = researchRejectedResourceIdsBySessionId.get(session?.id) || new Set();
    let sessionChanged = false;
    const sections = (session.sections || []).map((section) => {
      const resourceRefs = (section.resourceRefs || []).filter((id) => {
        if (rejectedResearchIds.has(id)) {
          sessionChanged = true;
          return false;
        }
        if (foreignLanguageResourceIds.has(id) || courseAwareWeakResourceIds.has(id)) {
          sessionChanged = true;
          return false;
        }
        if (resourceMatchesRejectedGenomeContent(resourcesById.get(id), semanticReceipt)) {
          sessionChanged = true;
          return false;
        }
        retainedResourceIds.add(id);
        return true;
      });
      return resourceRefs.length === (section.resourceRefs || []).length ? section : { ...section, resourceRefs };
    });
    if (!sessionChanged) return session;
    changed = true;
    return { ...session, sections };
  });

  if (!changed) return graph;
  const safeLessonContent = Object.fromEntries(
    Object.entries(lessonContent).filter(([lessonKey]) => !rejectedLessonContentKeys.has(lessonKey)),
  );
  return {
    ...graph,
    enrichmentOverlay: graph?.enrichmentOverlay
      ? { ...graph.enrichmentOverlay, lessonContent: safeLessonContent }
      : graph?.enrichmentOverlay,
    resources: (graph.resources || []).filter((resource) => {
      if (foreignLanguageResourceIds.has(resource?.id) || courseAwareWeakResourceIds.has(resource?.id)) return false;
      if (!KNOWLEDGE_BACKBONE_ORIGINS.has(resource?.origin)) return true;
      return !originallyReferencedResourceIds.has(resource?.id) || retainedResourceIds.has(resource?.id);
    }),
    sessions,
  };
}

function withFrozenAuthenticLanguageDataTransaction(graph, packet, coverage) {
  if (!packet && !coverage) return graph;
  if (
    packet?.protocol !== 'coursemapper-authentic-language-data-v1' ||
    coverage?.protocol !== 'coursemapper-authentic-language-data-coverage-v1'
  ) {
    throw new Error('Authentic language evidence transaction is incomplete or invalid.');
  }
  const admittedLessons = (coverage.lessons || []).filter((lesson) => lesson?.admitted);
  const authorityByLessonId = createAuthenticLanguageEvidenceAuthorityByLessonId({ coverage, packet });
  const admittedLessonIds = admittedLessons.map((lesson) => `lesson-${Number(lesson.lessonNumber)}`);
  if (
    admittedLessons.length !== Number(coverage.admittedLessonCount) ||
    admittedLessonIds.some((lessonId) => !authorityByLessonId[lessonId])
  ) {
    throw new Error('Authentic language evidence transaction failed its task and source receipt recheck.');
  }

  const sessionIds = new Set((graph?.sessions || []).map((session, index) => session?.id || `s${index + 1}`));
  const admittedSessionIds = new Set(admittedLessons.map((lesson) => lesson?.sessionId).filter(Boolean));
  if ([...admittedSessionIds].some((sessionId) => !sessionIds.has(sessionId))) {
    throw new Error('Authentic language evidence transaction no longer matches the planned lesson identities.');
  }

  const resourceId = 'authentic-language-data-packet';
  const examples = Array.isArray(packet.examples) ? packet.examples : [];
  const languageNames = new Set(examples.map((example) => example?.language).filter(Boolean));
  const packetResource = {
    id: resourceId,
    title: 'Documented multilingual data packet',
    citation: 'Required Assets/AUTHENTIC_LANGUAGE_DATA.csv and AUTHENTIC_LANGUAGE_DATA_GUIDE.md',
    attribution: `${examples.length} attested examples across ${languageNames.size} languages; see the packet source ledger.`,
    kind: 'course data packet',
    origin: 'authentic-language-data',
    evidence:
      'Use the recorded forms, glosses, translations, source locators, and analysis boundaries; do not generalize one example to an entire language.',
    sourceType: 'structured-authentic-data',
  };
  const resources = [...(graph?.resources || []).filter((resource) => resource?.id !== resourceId), packetResource];
  const sessions = (graph?.sessions || []).map((session, index) => {
    const sessionId = session?.id || `s${index + 1}`;
    return {
      ...session,
      sections: (session.sections || []).map((section) => ({
        ...section,
        resourceRefs: Array.from(
          new Set([
            ...(section.resourceRefs || []).filter((reference) => reference !== resourceId),
            ...(admittedSessionIds.has(sessionId) ? [resourceId] : []),
          ]),
        ),
      })),
    };
  });
  return {
    ...graph,
    authenticLanguageData: structuredClone(packet),
    authenticLanguageDataCoverage: structuredClone(coverage),
    resources,
    sessions,
  };
}

/** Persist the exact authentic-language evidence transaction before any UI or save callback sees the graph. */
export function attachAuthenticLanguageDataTransactionToGraph(
  graph,
  { authenticLanguageDataPacket = null, authenticLanguageDataCoverage = null } = {},
) {
  return withFrozenAuthenticLanguageDataTransaction(graph, authenticLanguageDataPacket, authenticLanguageDataCoverage);
}

function receiptMatchesEvidenceAuthority(authority = {}, lessonId = '') {
  if (
    authority?.protocol !== 'coursemapper-evidence-authority-v1' ||
    authority?.status !== 'admitted' ||
    authority?.lessonId !== lessonId ||
    !/^[a-f0-9]{64}$/i.test(String(authority?.receiptSha256 || ''))
  ) {
    return false;
  }
  const { receiptSha256, ...exactPayload } = authority;
  return sha256HexSync(JSON.stringify(exactPayload)) === receiptSha256;
}

function nonRedundantAuthorityClaims(claims = []) {
  const texts = claims
    .map((claim) =>
      String(claim?.text || '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((text) => text.length >= 20 && text.length <= 400);
  const exact = new Set(texts.map((text) => text.toLowerCase()));
  return [
    ...new Set(
      texts.filter((text) => {
        // Compare from the first label separator. A greedy regex stopped at
        // the final colon in strings such as `Variation: Variation is a
        // characteristic of language: ...`, so the labelled duplicate
        // survived beside its exact source sentence and rendered as X: X.
        const separator = text.indexOf(':');
        const suffix = separator >= 2 && separator <= 80 ? text.slice(separator + 1).trim() : '';
        return !suffix || !exact.has(suffix.toLowerCase());
      }),
    ),
  ];
}

function lessonEvidenceIdentity(lesson = {}) {
  return [
    lesson.title,
    ...(lesson.sections || []).flatMap((section) => [
      section.topicSection || section.topic,
      section.learningObjectives,
      section.learningGoals,
      section.weeklyAssessments,
    ]),
  ]
    .filter(Boolean)
    .join(' ');
}

function evidenceAuthorityHasSourceIdentityMismatch(authority = {}, lesson = {}) {
  const lessonIdentity = lessonEvidenceIdentity(lesson);
  return (authority?.sources || []).some(
    (source) =>
      sourceIdentityScopeMismatch({
        lessonIdentity,
        // Replay inspects only source identity plus the exact verified passages
        // that earned admission—not abstracts or arbitrary retrieval metadata.
        // This mirrors initial admission and reveals a broad title whose checked
        // claims belong to a neighboring specialization.
        sourceIdentity: [
          source?.title,
          source?.topic,
          source?.url,
          ...(source?.supportReceipt?.checks || [])
            .filter(
              (check) => check?.quoteInSnapshot === true && check?.entailed === true && check?.semanticSupport === true,
            )
            .flatMap((check) => [check?.claim, check?.quote]),
        ]
          .filter(Boolean)
          .join(' · '),
      }).mismatch,
  );
}

function replayableAuthorityClaimTexts(authority = {}) {
  const claims = nonRedundantAuthorityClaims(authority.claims);
  if (authority?.authorityKind !== 'verified-open-research') return claims;
  const verifiedPassages = new Set(
    (authority?.sources || [])
      .flatMap((source) => source?.supportReceipt?.checks || [])
      .filter(
        (check) =>
          check?.quoteInSnapshot === true &&
          check?.entailed === true &&
          check?.semanticSupport === true &&
          String(check?.claim || '').trim() === String(check?.quote || '').trim(),
      )
      .map((check) => String(check.claim).replace(/\s+/g, ' ').trim()),
  );
  return claims.filter((claim) => verifiedPassages.has(claim));
}

function replayEvidencePlanInputs(graph = {}, options = {}) {
  const plan = graph?.evidenceGroundedInstructionalPlan || graph?.preDraftInstructionalPlan || null;
  const optionAuthorities =
    options?.evidenceAuthorityByLessonId && typeof options.evidenceAuthorityByLessonId === 'object'
      ? options.evidenceAuthorityByLessonId
      : {};
  const lessonIntents = Array.isArray(plan?.lessonIntents)
    ? plan.lessonIntents
    : Object.keys(optionAuthorities).map((id) => ({ id }));
  if (lessonIntents.length === 0) return {};
  const resourcesByIdentity = new Map(
    (graph.resources || []).flatMap((resource) =>
      [resource?.id, resource?.sourceWorkId, resource?.url]
        .filter(Boolean)
        .map((identity) => [String(identity), resource]),
    ),
  );
  const evidenceAuthorityByLessonId = {};
  const lessonContent = {};
  const renderedLessons = renderCourseMapFromGraph(graph)?.lessons || [];
  for (const intent of lessonIntents) {
    const lessonId = String(intent?.id || `lesson-${Number(intent?.lessonNumber) || 0}`);
    const lessonNumber = Number(intent?.lessonNumber) || Number(lessonId.match(/(\d+)$/)?.[1]) || 0;
    const lesson = renderedLessons[Math.max(0, lessonNumber - 1)] || {};
    const authority =
      graph?.governingSourceContract?.byLessonId?.[lessonId] ||
      intent?.evidenceBoundary?.authority ||
      optionAuthorities[lessonId];
    if (!receiptMatchesEvidenceAuthority(authority, lessonId)) continue;
    if (evidenceAuthorityHasSourceIdentityMismatch(authority, lesson)) continue;
    evidenceAuthorityByLessonId[lessonId] = structuredClone(authority);
    const facts = replayableAuthorityClaimTexts(authority).slice(0, 8);
    if (facts.length < 3) continue;
    const citations = (authority.sources || []).map((source) => {
      const bound =
        resourcesByIdentity.get(String(source?.id || '')) || resourcesByIdentity.get(String(source?.url || '')) || null;
      return {
        id: source?.id || bound?.id || '',
        displayTitle: source?.title || bound?.title || '',
        sourceUrl: source?.url || bound?.url || '',
        authorityKind: source?.authorityKind || authority.authorityKind || '',
        ...(source?.provider || bound?.provider ? { provider: source?.provider || bound.provider } : {}),
        ...(source?.license || bound?.license ? { license: source?.license || bound.license } : {}),
        ...(source?.attribution || bound?.attribution ? { attribution: source?.attribution || bound.attribution } : {}),
        ...(source?.supportReceipt || bound?.supportReceipt
          ? { supportReceipt: structuredClone(source?.supportReceipt || bound.supportReceipt) }
          : {}),
      };
    });
    lessonContent[lessonId] = {
      lessonId,
      facts: [...facts],
      sourceFacts: [...facts],
      keyTerms: [],
      kernel: {
        facts: [...facts],
        keyTerms: [],
        provenance: {
          source: EXACT_SOURCE_LEDGER_PROVENANCE,
          authority: SOURCE_LEDGER_AUTHORITIES.ADMITTED_EVIDENCE_AUTHORITY,
          copiedFactsVerbatim: true,
          factCount: facts.length,
        },
      },
      sourceFactPolicy: 'evidence-authority-replay-v1',
      sourceFactAuthority: SOURCE_LEDGER_AUTHORITIES.ADMITTED_EVIDENCE_AUTHORITY,
      enrichmentSource: 'evidence-authority-replay',
      conceptProvenance: {
        source: 'evidence-authority-replay',
        authority: SOURCE_LEDGER_AUTHORITIES.ADMITTED_EVIDENCE_AUTHORITY,
        fullyAnchored: citations.length > 0,
        citations,
      },
      evidenceAuthorityReceipt: structuredClone(authority),
      replayRecoveryReceipt: {
        protocol: 'coursemapper-evidence-authority-replay-v1',
        status: 'exact-authority-ledger-restored',
        admittedFactCount: facts.length,
        sourceCount: citations.length,
      },
    };
  }
  return {
    planningAuthority: plan?.planningAuthority || options?.planningAuthority || null,
    evidenceAuthorityByLessonId,
    lessonContent,
  };
}

function coverageAfterEvidenceReplay(coverage = null, lessonCount = 0, replayLessonContent = {}) {
  const recoveredLessonNumbers = Object.keys(replayLessonContent)
    .map((lessonId) => Number(String(lessonId).match(/(\d+)$/)?.[1]))
    .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0)
    .sort((left, right) => left - right);
  if (recoveredLessonNumbers.length === 0) return coverage;
  const requestedLessons = Math.max(
    Number(coverage?.requestedLessons) || 0,
    Number(lessonCount) || 0,
    recoveredLessonNumbers.at(-1) || 0,
  );
  const baseMissingLessons = Array.isArray(coverage?.missingLessons)
    ? coverage.missingLessons.map(Number).filter(Number.isInteger)
    : Array.from({ length: requestedLessons }, (_, index) => index + 1);
  const recovered = new Set(recoveredLessonNumbers);
  const missingLessons = baseMissingLessons.filter((lessonNumber) => !recovered.has(lessonNumber));
  return {
    ...(coverage && typeof coverage === 'object' ? coverage : {}),
    requestedLessons,
    enrichedLessons: Math.max(0, requestedLessons - missingLessons.length),
    missingLessons,
    evidenceReplayRecovery: {
      protocol: 'coursemapper-evidence-authority-coverage-recovery-v1',
      status: missingLessons.length === 0 ? 'complete' : 'partial',
      recoveredLessonNumbers,
      recoveredLessonCount: recoveredLessonNumbers.length,
      claimBoundary:
        'Coverage is recovered only from fresh lesson-matched evidence-authority receipts with at least three exact admitted claims.',
    },
  };
}

/** Compile a course blueprint from the graph (render + enrichment overlay). */
export function buildBlueprintFromGraph(graph, options = {}) {
  let safeGraph = compilerSafeKnowledgeGraph(graph);
  safeGraph = withFrozenAuthenticLanguageDataTransaction(
    safeGraph,
    options.authenticLanguageDataPacket,
    options.authenticLanguageDataCoverage,
  );
  const canonicalFrozenGraph = withFrozenAuthenticLanguageDataTransaction(
    graph,
    options.authenticLanguageDataPacket,
    options.authenticLanguageDataCoverage,
  );
  // Persist the admission receipt beside the authentic packet so project
  // saves and later package exports can audit the exact per-lesson coverage
  // decision. The compiler-safe copy still owns temporary resource links;
  // only the small receipt is written back to the canonical graph.
  if (graph && safeGraph?.authenticLanguageDataCoverage) {
    graph.authenticLanguageDataCoverage = structuredClone(safeGraph.authenticLanguageDataCoverage);
  }
  if (graph && safeGraph?.authenticLanguageData) {
    graph.authenticLanguageData = structuredClone(safeGraph.authenticLanguageData);
  }
  if (graph && canonicalFrozenGraph !== graph) {
    graph.resources = structuredClone(canonicalFrozenGraph.resources);
    graph.sessions = structuredClone(canonicalFrozenGraph.sessions);
  }
  // The compile render is CANONICAL (no display reference suffixes) — the
  // registry, not cell text, carries assessment identity into the compiler.
  const courseMap = renderCourseMapFromGraph(safeGraph);
  const graphEnrichment = enrichmentFromGraph(safeGraph);
  const replayPlan = replayEvidencePlanInputs(safeGraph, options);
  const candidateInstructionalPlan =
    options.instructionalPlan ||
    (safeGraph?.evidenceGroundedInstructionalPlan?.admission?.status === 'approved'
      ? safeGraph.evidenceGroundedInstructionalPlan
      : safeGraph?.preDraftInstructionalPlan?.admission?.status === 'approved'
        ? safeGraph.preDraftInstructionalPlan
        : null);
  // Keep the signed lesson architecture so valid lessons do not lose their
  // pre-draft task/evidence model. Source replay and compiler enrichment
  // admission independently quarantine any mismatched authority rows.
  const authoritativeInstructionalPlan = candidateInstructionalPlan;
  const replayCoverage = coverageAfterEvidenceReplay(
    graphEnrichment?.coverage,
    courseMap?.lessons?.length || safeGraph?.sessions?.length || 0,
    replayPlan.lessonContent,
  );
  const persistedGraphEnrichment =
    Object.keys(replayPlan.lessonContent || {}).length > 0
      ? {
          ...(graphEnrichment || {}),
          lessonContent: {
            ...(graphEnrichment?.lessonContent || {}),
            ...replayPlan.lessonContent,
          },
          ...(replayCoverage ? { coverage: replayCoverage } : {}),
        }
      : graphEnrichment;
  // Evidence replay is not a temporary compiler convenience. Once exact
  // lesson-matched authority receipts restore the lesson ledger, persist that
  // admitted state on the canonical graph so save/reload, package readiness,
  // and rendered-claim binding all audit the same facts and sources.
  if (graph && persistedGraphEnrichment && Object.keys(replayPlan.lessonContent || {}).length > 0) {
    attachEnrichmentToGraph(graph, persistedGraphEnrichment);
  }
  const knowledgeResources = (safeGraph?.resources || []).filter((resource) =>
    KNOWLEDGE_BACKBONE_ORIGINS.has(resource?.origin),
  );
  // v0.14.1 (3.2): the assessment registry IS the blueprint's assessment
  // identity — one brief per graded artifact, real exam documents, oral
  // prompt sheets. Entries must carry a title and an integer dueSession;
  // legacy graphs whose assessments predate the registry (no kind) still
  // pass through and default to graded-artifact in the compiler.
  const assessmentRegistry = (graph?.assessments || [])
    .filter(
      (assessment) =>
        assessment && typeof assessment === 'object' && assessment.title && Number.isInteger(assessment.dueSession),
    )
    .map(migrateCompilerGeneratedAssessmentIdentity);
  // v0.14.5 (A2): the readings registry rides into the blueprint the same
  // way — instructor-named titles become the leading items of every readings
  // surface (lesson-plan materials, syllabus week rows, briefs, discussion
  // anchors). Strictly additive: an empty registry changes nothing.
  const readingsRegistry = (graph?.readings || []).filter(
    (reading) => reading && typeof reading === 'object' && reading.title && Number.isInteger(reading.dueSession),
  );
  const replayLessonContent = replayPlan.lessonContent || {};
  const graphLessonContent = persistedGraphEnrichment?.lessonContent || {};
  const optionLessonContent = options.enrichment?.lessonContent || {};
  const enrichment = {
    ...(persistedGraphEnrichment || {}),
    ...(options.enrichment && typeof options.enrichment === 'object' ? options.enrichment : {}),
    ...(Object.keys(replayLessonContent).length > 0 ||
    Object.keys(graphLessonContent).length > 0 ||
    Object.keys(optionLessonContent).length > 0
      ? {
          lessonContent: {
            ...graphLessonContent,
            ...replayLessonContent,
            ...optionLessonContent,
          },
        }
      : {}),
  };
  const blueprint = buildCourseBlueprint(courseMap, {
    ...options,
    ...(authoritativeInstructionalPlan ? { instructionalPlan: authoritativeInstructionalPlan } : {}),
    ...(enrichment ? { enrichment } : {}),
    // v0.13.5: Resource entities (genome anchor sections, open readings,
    // book metadata) ride into the blueprint for the syllabus appendix and
    // required texts. Explicit options win.
    ...(knowledgeResources.length > 0 && !options.knowledgeResources ? { knowledgeResources } : {}),
    ...(assessmentRegistry.length > 0 && !options.assessmentRegistry ? { assessmentRegistry } : {}),
    ...(readingsRegistry.length > 0 && !options.readingsRegistry ? { readingsRegistry } : {}),
    ...(replayPlan.planningAuthority && !options.planningAuthority
      ? { planningAuthority: replayPlan.planningAuthority }
      : {}),
    ...(options.evidenceAuthorityByLessonId || replayPlan.evidenceAuthorityByLessonId
      ? { evidenceAuthorityByLessonId: replayPlan.evidenceAuthorityByLessonId || {} }
      : {}),
    ...(safeGraph?.authenticLanguageDataCoverage && !options.authenticLanguageDataCoverage
      ? { authenticLanguageDataCoverage: safeGraph.authenticLanguageDataCoverage }
      : {}),
  });
  return blueprint;
}

function registryEntityKey(entry = {}) {
  return `${Number(entry.dueSession) || 0}|${String(entry.title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()}`;
}

/**
 * Native assembly can legitimately have fewer registry entities than the
 * already-visible Course Map when a small Pass-A response omits a named
 * reading or assessment. The Course Map is the instructor-facing source in
 * that conflict. Return complete registry overrides for any entity the graph
 * dropped so downstream compilers do not silently turn a named primary text
 * into a generic lesson shell.
 */
export function selectCompilerRegistryBridges(graph, mapDerivedGraph) {
  const graphAssessments = Array.isArray(graph?.assessments) ? graph.assessments : [];
  const mapAssessments = Array.isArray(mapDerivedGraph?.assessments) ? mapDerivedGraph.assessments : [];
  const graphReadings = Array.isArray(graph?.readings) ? graph.readings : [];
  const mapReadings = Array.isArray(mapDerivedGraph?.readings) ? mapDerivedGraph.readings : [];
  const graphAssessmentKeys = new Set(graphAssessments.map(registryEntityKey));
  const missingAssessments = mapAssessments.filter((entry) => !graphAssessmentKeys.has(registryEntityKey(entry)));
  const graphReadingKeys = new Set(graphReadings.map(registryEntityKey));
  const missingReadings = mapReadings.filter((entry) => !graphReadingKeys.has(registryEntityKey(entry)));

  return {
    // Count equality is not identity equality. Native small-model assembly
    // can preserve the number of assessments while clipping a long formative
    // direction at its output-field boundary. The visible Course Map still
    // owns the complete text in that conflict; bridge whenever even one
    // canonical map identity is absent, not only when the graph has fewer
    // rows. This also lets the compiler classify and shorten its own
    // formative signatures before they become reusable artifact titles.
    ...(missingAssessments.length > 0 ? { assessmentRegistry: mapAssessments } : {}),
    ...(missingReadings.length > 0 ? { readingsRegistry: mapReadings } : {}),
    stats: {
      graphAssessmentCount: graphAssessments.length,
      mapAssessmentCount: mapAssessments.length,
      missingAssessmentCount: missingAssessments.length,
      graphReadingCount: graphReadings.length,
      mapReadingCount: mapReadings.length,
      missingReadingCount: missingReadings.length,
    },
  };
}
