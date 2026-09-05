import { instanceByLessonId } from './instructionalInstanceContract.js';
import { sourceLedgerAuthority } from './sourceLedgerProvenance.js';

export const SEMANTIC_CLAIM_INVENTORY_PROTOCOL = 'coursemapper-semantic-claim-inventory-v1';

const SOURCE_BEARING_ORIGIN_RE =
  /(?:lesson-content-enrichment|fact-ledger|source-grounded|kernel-bank|algi-research|scion-research|model-authored)/i;
const DEFINITION_KEYS = new Set(['definition']);
const RATIONALE_KEYS = new Set(['explanation', 'distractorRationale', 'rationale']);
const SCORING_KEYS = new Set(['scoringGuidance']);
const RUBRIC_SCORING_KEYS = new Set([
  'criterion',
  'excellent',
  'exemplary',
  'proficient',
  'developing',
  'beginning',
  'strongSample',
  'partialSample',
  'scoringRationale',
  'revisionPrompt',
]);
const MODEL_PROVISIONAL_AUTHORITY_RE = /^model-provisional$/i;
const SOURCE_ACCOUNTABLE_AUTHORITY_RE = /^(?:model-provisional|shipped-source-library|verified-open-research)$/i;
const DECLARATIVE_PREDICATE_RE =
  /\b(?:is|are|was|were|means|refers|describes|involves|causes|shows|indicates|demonstrates|consists|contains|represents|equals|differs|occurs|happens|results|leads|supports|establishes|proves)\b/i;
const PROCEDURAL_OR_INTERFACE_START_RE =
  /^(?:add|answer|apply|ask|attach|bring|calculate|check|choose|cite|click|close|collect|compare|complete|connect|consider|continue|create|define|describe|discuss|display|draft|draw|edit|enter|evaluate|explain|export|find|follow|give|identify|include|inspect|invite|keep|label|list|make|mark|model|name|note|open|organize|pair|pause|point|prepare|present|press|provide|read|record|reflect|respond|return|review|revise|run|save|score|select|share|show|state|study|submit|summarize|test|trace|treat|turn|upload|use|verify|watch|work|write)\b/i;
const RUBRIC_DESCRIPTOR_START_RE =
  /^(?:acknowledges|analyzes|applies|cites|communicates|compares|connects|demonstrates|describes|evaluates|explains|identifies|includes|interprets|lists|names|organizes|provides|revises|shows|states|uses)\b/i;
const PROCEDURAL_OR_POLICY_RE =
  /\b(?:students?|learners?|instructors?|full credit|partial credit|submission|due date|office hours|class format|instructor notes?|learning objective|course policy|grading|rubric|points?\b|minutes?\b|lesson \d+|week \d+|session \d+)\b/i;
const PEDAGOGICAL_META_RE =
  /\b(?:assigned source|source cue|source packet|source brief|course evidence|lesson materials?|learning objective|artifact|graded[- ]work|assignment|rubric|criterion|criteria|response|answer|question|prompt|revision|submit|participation|bloom|hint|accessible|accessibility|alt[- ]text|nonvisual|visual support note|teaching move|misconception|full credit|partial credit|points?|minutes?|students?|learners?|instructors?|work)\b/i;
const INSTRUCTIONAL_EVIDENCE_REFERENCE_RE =
  /^(?:after that|then),?\s+(?:they|students?|learners?)\s+(?:cite|identify|explain)\b|^(?:then|next),?\s+(?:use|apply|cite|compare|identify|explain)\b|^one cited course detail supports\b|^in\s+cm-src-l\d+\b|^shows relevant\b|\b(?:cite|cites|citing)\b.{0,120}\b(?:detail|evidence|source)\b|\b(?:evidence|source)\s+brief\s+(?:shows|supports|indicates)\b/i;
const CONTEXTUALIZED_DIRECTIVE_RE =
  /^for\s+.{2,160},\s+(?:analyze|apply|compare|connect|describe|explain|identify|inspect|name|record|separate|test|trace|use|verify)\b/i;
const ARTIFACT_FAMILIES = [
  'Course Map',
  'Syllabus',
  'Lesson Plans',
  'Slide Decks',
  'Assignment Briefs',
  'Rubrics',
  'Discussion Prompts',
  'Quiz & Exam Bank',
  'Study Guides',
  'Course FAQ',
];
const STRUCTURED_FEATURE_ARTIFACT_FAMILY = Object.freeze({
  courseMap: 'Course Map',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  assignments: 'Assignment Briefs',
  rubrics: 'Rubrics',
  discussions: 'Discussion Prompts',
  quizBank: 'Quiz & Exam Bank',
  studyGuides: 'Study Guides',
  faq: 'Course FAQ',
  courseFaq: 'Course FAQ',
});
const NON_LEARNER_SEMANTIC_SUBTREES = new Set(['sourceGrounding', 'blueprintGrounding']);

function normalized(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function artifactFamilyForPath(value) {
  const normalizedPath = clean(value).replace(/\\/g, '/');
  return (
    ARTIFACT_FAMILIES.find((family) => normalizedPath === family || normalizedPath.startsWith(`${family}/`)) || 'Other'
  );
}

function artifactFamilyForFieldPath(value) {
  const featureId = clean(value).match(/^deliverables\.([A-Za-z0-9_-]+)/)?.[1] || '';
  return STRUCTURED_FEATURE_ARTIFACT_FAMILY[featureId] || '';
}

function comparableClaimSurface(value) {
  return (
    normalized(value)
      // Office text extraction flattens a styled paragraph label and its body
      // into one sentence (for example, "KEY CONCEPT <claim>"). These labels
      // are document structure, not surrounding semantic prose. Remove only the
      // exporter-owned, closed vocabulary so an arbitrary leading assertion can
      // never turn a supported fragment into an admitted whole sentence.
      .replace(
        /^(?:(?:assigned evidence packet|concept summary|content evidence used for scoring|evidence ledger|key concept|key takeaway\s*:\s*evidence|source evidence for this lesson|verified evidence)\s*:?[\s-]+)/,
        '',
      )
      // Exporter-owned prose/table wrappers can share a paragraph with an
      // exact admitted claim after Office text extraction. Remove only these
      // anchored structural prefixes; arbitrary surrounding assertions still
      // cannot certify a supported fragment.
      .replace(
        /^(?:a concrete case|source claim \d{1,3}|claim \d{1,3}|definition for [^:]{1,120}|start with this [a-z0-9 :'&()/-]{1,120} evidence)\s*:\s+/,
        '',
      )
      .replace(
        /^(?:put this anchor on the board|analyze this statement from [^:]{1,120}|before deciding, evaluate what this source statement supports)\s*:\s+/,
        '',
      )
      .replace(/^the source frames [a-z0-9 '&()/-]{1,120} through this source-backed statement\s*:\s+/, '')
      .replace(/^(?:https?:\/\/\S+|\S*\/\S+)\s+(?:[—-]\s*)?license:\s+.{1,160}?(?=\s+key terms?\b)/, '')
      .replace(/^(?:https?:\/\/\S+|\S*\/\S+)\s+/, '')
      .replace(
        /^key terms?\s+term\s+definition\s+(.{2,80}?)\s+(?:a|an|the)?\s*\1(?=\s+(?:is|are|means|refers|describes|involves)\b)/,
        '$1',
      )
      .replace(/^(.{2,80}?)\s+(?:a|an|the)\s+\1(?=\s+(?:is|are|means|refers|describes|involves)\b)/, '$1')
      .replace(/^(.{2,80}?)\s+\1(?=\s*(?:,|\s+(?:is|are|means|refers|describes|involves)\b))/, '$1')
      .replace(/^[\s"'“‘([{]+/, '')
      .replace(/[\s"'”’\])}.!?;:]+$/, '')
      // Exporter-owned labels sometimes omit a sentence-initial determiner.
      // Normalize only this closed class on both sides of an exact match.
      .replace(/^(?:a|an|the)\s+(?=[a-z0-9])/, '')
      .trim()
  );
}

function exactAdmittedClause(surface, admittedClaim) {
  const target = comparableClaimSurface(surface);
  const whole = comparableClaimSurface(admittedClaim);
  if (!target || !whole || target === whole || target.length < 60 || target.split(/\s+/).length < 10) return false;
  const start = whole.indexOf(target);
  if (start < 0) return false;
  const before = whole.slice(0, start);
  const after = whole.slice(start + target.length);
  const startsAtClauseBoundary =
    start === 0 || /(?:^|\s)(?:and|but|while|whereas)\s*$/.test(before) || /(?:;|:)\s*$/.test(before);
  const endsAtClauseBoundary = after.length === 0 || /^\s*(?:(?:and|but|while|whereas)(?:\s|$)|[;:])/.test(after);
  return startsAtClauseBoundary && endsAtClauseBoundary;
}

function closedKeyTermTableWrapsExactClaim(surface, claim, artifactPath = '') {
  const exactClaim = comparableClaimSurface(claim);
  if (!exactClaim) return false;
  const candidate = normalized(surface)
    .replace(/^(?:https?:\/\/\S+|\S*\/\S+)\s+(?:[—-]\s*)?license:\s+.{1,160}?(?=\s+key terms?\b)/, '')
    .replace(/^(?:https?:\/\/\S+|\S*\/\S+)\s+/, '')
    .replace(/[\s"'”’\])}.!?;:]+$/, '')
    .trim();
  if (!candidate.endsWith(exactClaim)) return false;
  const prefix = candidate.slice(0, -exactClaim.length).trim();
  if (/^key terms?\s+term\s+definition\s+.{1,100}$/.test(prefix)) return true;
  return (
    /^Study Guides\//.test(clean(artifactPath)) &&
    prefix.split(/\s+/).length <= 8 &&
    /^[a-z0-9][a-z0-9 ()/&'-]{1,100}$/i.test(prefix) &&
    !DECLARATIVE_PREDICATE_RE.test(prefix)
  );
}

function closedSourceWrapperContainsExactClaim(surface, claim) {
  const exactClaim = comparableClaimSurface(claim);
  const candidate = normalized(surface)
    .replace(/[\s"'”’\])}.!?;:]+$/, '')
    .trim();
  if (!exactClaim || !candidate.endsWith(exactClaim)) return false;
  const prefix = candidate.slice(0, -exactClaim.length).trim();
  return /^(?:key supporting evidence:|build the model from these source-supported statements:\s*\d+[.)]|what the evidence shows about .{1,140} before deciding, evaluate what this source statement supports:|concept trace: .{1,240} before deciding, evaluate what this source statement supports:|concept summary (?:recheck the documented evidence on|return to the source statement about) .{1,140})$/i.test(
    prefix,
  );
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function lessonNumberFrom(value, fallback = null) {
  const direct = Number(value?.lessonNumber ?? value?.lesson ?? value?.dueSession);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const text = clean(value?.lessonId || value?.id || value?.lessonTitle || value?.title);
  const match = text.match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i);
  return match ? Number(match[1]) : fallback;
}

function sourceAuthorityByLesson(courseGraph) {
  const map = new Map();
  const lessonContent = courseGraph?.enrichmentOverlay?.lessonContent || {};
  for (const [key, payload] of Object.entries(lessonContent)) {
    const lessonNumber = Number(String(key).match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i)?.[1]);
    if (!lessonNumber) continue;
    map.set(
      lessonNumber,
      clean(
        payload?.sourceFactAuthority ||
          payload?.conceptProvenance?.authority ||
          payload?.kernel?.provenance?.authority ||
          sourceLedgerAuthority(payload),
      ),
    );
  }
  return map;
}

function semanticSurfacesByLesson(courseGraph, authorityByLesson) {
  const map = new Map();
  const lessonContent = courseGraph?.enrichmentOverlay?.lessonContent || {};
  const semanticFields = new Set([
    'kernel',
    'facts',
    'scenario',
    'keyTerms',
    'slideContent',
    'discussionPrompt',
    'assignmentCore',
    'studyGuide',
    'workedExample',
    'mcWalkthrough',
    'dialogue',
    'reasoningScaffolds',
    'structuralConnections',
    'structuralBridges',
  ]);
  const collectStrings = (value, output) => {
    if (typeof value === 'string') {
      const surface = clean(value);
      if (surface.length >= 24) output.push(normalized(surface));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collectStrings(entry, output));
      return;
    }
    if (!value || typeof value !== 'object') return;
    Object.values(value).forEach((entry) => collectStrings(entry, output));
  };
  for (const [key, payload] of Object.entries(lessonContent)) {
    const lessonNumber = Number(String(key).match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i)?.[1]);
    if (!lessonNumber || !SOURCE_ACCOUNTABLE_AUTHORITY_RE.test(authorityByLesson.get(lessonNumber) || '')) continue;
    const surfaces = [];
    for (const [field, value] of Object.entries(payload || {})) {
      if (semanticFields.has(field)) collectStrings(value, surfaces);
    }
    map.set(lessonNumber, [...new Set(surfaces.filter(Boolean))]);
  }
  return map;
}

function sourceAtoms(sourceLedger) {
  const atoms = [];
  const seen = new Set();
  for (const row of Array.isArray(sourceLedger) ? sourceLedger : []) {
    for (const check of row?.supportReceipt?.checks || []) {
      const claim = clean(check?.claim);
      if (!claim) continue;
      // One admitted claim can be rendered in several lesson artifacts. Keep
      // one atom per rendered location: deduplicating only by claim identity
      // made the first (often capstone) occurrence hide the same verified
      // claim from its originating lesson's inventory.
      const identity = `${row?.id || check?.sourceId || ''}|${check?.claimId || ''}|${normalized(claim)}|${clean(check?.renderedLocation)}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const atom = {
        claim,
        normalizedClaim: normalized(claim),
        sourceLedgerId: clean(row?.id || check?.sourceId),
        sourceClaimId: clean(check?.claimId),
        sourceLocator: clean(check?.locator),
        sourcePassageSha256: clean(check?.sourcePassageSha256),
        sourceIdentityVerified:
          check?.sourceIdentityVerified === true && row?.supportReceipt?.sourceIdentityVerified === true,
        semanticEntailmentVerified:
          check?.entailed === true &&
          check?.semanticAdmissionVerified === true &&
          check?.semanticSupport === true &&
          row?.supportReceipt?.semanticAdmissionVerified === true &&
          row?.supportReceipt?.semanticSupport === true,
        artifactVisibilityVerified:
          check?.artifactVisibilityVerified === true && row?.supportReceipt?.artifactVisibilityVerified === true,
        artifactPath: clean(check?.renderedLocation),
      };
      // A row retained for source-report disclosure is not automatically an
      // admitted semantic source. Only authoritative, entailing atoms belong
      // in the inventory's factual-claim boundary.
      if (atom.sourceIdentityVerified && atom.semanticEntailmentVerified) atoms.push(atom);
    }
  }
  return atoms;
}

function findSourceBindings(surface, atoms, lessonNumber, artifactPath = '') {
  const target = comparableClaimSurface(surface);
  if (!target) return [];
  return (
    atoms
      // A supported fragment cannot certify unsupported surrounding prose.
      // The upstream receipt may itself contain an admitted curated paraphrase,
      // but the learner-visible claim must still be byte-semantically identical
      // to that admitted claim apart from case and boundary punctuation.
      .filter(
        (atom) =>
          atom.normalizedClaim &&
          (target === comparableClaimSurface(atom.claim) ||
            exactAdmittedClause(surface, atom.claim) ||
            closedKeyTermTableWrapsExactClaim(surface, atom.claim, artifactPath) ||
            closedSourceWrapperContainsExactClaim(surface, atom.claim)),
      )
      .filter((atom) => {
        if (!lessonNumber || !atom.artifactPath) return true;
        const artifactLesson = Number(atom.artifactPath.match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i)?.[1]);
        return !artifactLesson || artifactLesson === lessonNumber;
      })
      .map(({ normalizedClaim: _normalizedClaim, ...atom }) => ({
        ...atom,
        sourceArtifactPath: atom.artifactPath,
        artifactPath: artifactPath || atom.artifactPath,
        artifactVisibilityVerified: atom.artifactVisibilityVerified && Boolean(artifactPath || atom.artifactPath),
      }))
  );
}

function visibleArtifactPaths(surface, renderedArtifacts) {
  const target = normalized(surface);
  if (!target) return [];
  return (Array.isArray(renderedArtifacts) ? renderedArtifacts : [])
    .filter((artifact) => normalized(artifact?.text).includes(target))
    .map((artifact) => clean(artifact?.path))
    .filter(Boolean);
}

function lessonNumberFromArtifactPath(value) {
  const match = clean(value).match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function renderedSentenceCandidates(text) {
  return (
    String(text || '')
      .replace(/\r/g, '\n')
      // Office alt text and lesson titles routinely contain section numbers such
      // as "3.4". Splitting on that decimal point discarded the leading
      // "Nonvisual summary" boundary and turned the remaining template tail
      // into a fake factual claim. Protect decimal points until sentence
      // segmentation is complete.
      .replace(/(\d)\.(?=\d)/g, '$1\uE000')
      // Keep initialisms such as "U.S." inside their sentence. Protect inner
      // dots, then protect the final dot only when lowercase prose continues.
      .replace(/\b(?:U\.S|U\.K|e\.g|i\.e)\./gi, (initialism) => initialism.replace(/\./g, '\uE000'))
      .replace(/\b([A-Za-z])\.(?=[A-Za-z]\.)/g, '$1\uE000')
      .replace(/\b([A-Z])\.(?=\s+[a-z])/g, '$1\uE000')
      .split(/\n+/)
      .flatMap((line) => clean(line).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
      .map((sentence) =>
        clean(sentence)
          .replace(/\uE000/g, '.')
          .replace(/^[\s•*\-–—\d.)]+/, '')
          .replace(/^(?:instructor notes?|speaker notes?|notes?|summary|anchor fact)\s*:\s*/i, ''),
      )
      .filter(Boolean)
  );
}

function isLearnerVisibleDeclarativeClaim(surface) {
  const sentence = clean(surface);
  if (sentence.length < 35 || sentence.length > 700 || sentence.endsWith('?')) return false;
  if (sentence.split(/\s+/).length < 6) return false;
  if (
    /^(?:q\d+|example|typed specimen|expected observation|common misconceptions?|concept connections?|sample answer)\b/i.test(
      sentence,
    )
  ) {
    return false;
  }
  if (
    /^(?:rights\s*·|vtask sha256:|for .{1,120}, the tempting error is|i thought for .{1,120}, the tempting error is)/i.test(
      sentence,
    )
  )
    return false;
  if (/^["')/:;,]|^[a-z]+\s+to\s+/i.test(sentence)) return false;
  if (/\bis only a definition to memorize\.?$/i.test(sentence)) return false;
  if (/shows the condition, input, source detail, or design choice that changes the result/i.test(sentence))
    return false;
  if (PEDAGOGICAL_META_RE.test(sentence)) return false;
  if (INSTRUCTIONAL_EVIDENCE_REFERENCE_RE.test(sentence)) return false;
  if (
    /^those are the (?:load-bearing|governing|key) claims\b/i.test(sentence) &&
    /\b(?:connect|evidence|be ready)\b/i.test(sentence)
  ) {
    return false;
  }
  if (CONTEXTUALIZED_DIRECTIVE_RE.test(sentence)) return false;
  if (/^you are ready when\b/i.test(sentence)) return false;
  if (
    /^what the evidence shows about .{1,180}\s+before deciding, evaluate what this source statement supports:/i.test(
      sentence,
    )
  ) {
    return false;
  }
  // The slide exporter may join its structural takeaway label to a compiler-
  // authored learner action. A "decision check" tells the learner what to do;
  // an embedded verb such as "supports" does not turn the direction into a
  // subject-matter assertion that needs its own source passage.
  if (/^(?:key takeaway\s*:\s*)?decision check\s*:/i.test(sentence)) return false;
  // The course compiler owns a closed set of labelled slide directions. Their
  // action clauses can contain declarative-looking verbs ("explain what X
  // shows", "state the claim it supports"), but the sentence asks the learner
  // to inspect evidence; it does not itself assert the result of that
  // inspection. Keep the exemption tied to the exact label/action pairs so a
  // factual sentence merely prefixed with "Evidence check:" remains source
  // accountable.
  if (
    /^(?:key takeaway\s*:\s*)?(?:evidence check\s*:\s*locate|inference check\s*:\s*explain|relation check\s*:\s*connect|viewpoint check\s*:\s*identify|publication check\s*:\s*use)\b/i.test(
      sentence,
    )
  )
    return false;
  if (PROCEDURAL_OR_INTERFACE_START_RE.test(sentence)) return false;
  // Rubric level descriptors conventionally omit their subject ("Lists
  // ideas...", "Explains the decision..."). Their third-person verb shape can
  // look declarative to a predicate scanner, but they score student work; they
  // do not assert a course-content fact.
  if (RUBRIC_DESCRIPTOR_START_RE.test(sentence)) return false;
  if (PROCEDURAL_OR_POLICY_RE.test(sentence)) return false;
  if (
    /^(?:problem|step \d+|result|example|source|materials?|objective|topic|activity|assessment|criterion|criteria)\s*:/i.test(
      sentence,
    )
  ) {
    return false;
  }
  return DECLARATIVE_PREDICATE_RE.test(sentence);
}

/**
 * Learner-visible prose used to sit outside the structured-field inventory.
 * Restrict extraction to lessons whose semantic authority is accountable to a
 * source passage: model-provisional, shipped-source-library, or verified open
 * research. Compiler directions and instructor-owned policy remain outside
 * this boundary. Every declarative candidate still needs an admitted passage;
 * the extractor never guesses that a paraphrase is entailed.
 */
function collectRenderedSourceAccountableClaims(
  renderedArtifacts,
  authorityByLesson,
  semanticSurfacesByLessonMap,
  sourceClaimAtoms,
) {
  const claims = [];
  for (const artifact of Array.isArray(renderedArtifacts) ? renderedArtifacts : []) {
    const artifactPath = clean(artifact?.path);
    const lessonNumber = Number(artifactPath.match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i)?.[1]) || null;
    const authority = authorityByLesson.get(lessonNumber) || '';
    if (!lessonNumber || !SOURCE_ACCOUNTABLE_AUTHORITY_RE.test(authority)) continue;
    const semanticSurfaces = semanticSurfacesByLessonMap.get(lessonNumber) || [];
    if (semanticSurfaces.length === 0) continue;
    renderedSentenceCandidates(artifact?.text).forEach((surface, index) => {
      if (!isLearnerVisibleDeclarativeClaim(surface)) return;
      const comparableSurface = comparableClaimSurface(surface);
      const exactSourceAtom = (Array.isArray(sourceClaimAtoms) ? sourceClaimAtoms : []).find(
        (atom) =>
          (comparableSurface === comparableClaimSurface(atom.claim) ||
            exactAdmittedClause(surface, atom.claim) ||
            closedKeyTermTableWrapsExactClaim(surface, atom.claim, artifactPath) ||
            closedSourceWrapperContainsExactClaim(surface, atom.claim)) &&
          (!atom.artifactPath || clean(atom.artifactPath) === artifactPath),
      );
      // Office extraction can flatten a URL, licence line, table headers, or
      // exporter label into the same sentence as an admitted claim. The
      // learner-visible semantic unit is the exact source atom, not that
      // structural wrapper. Preserve the exact authored casing while keeping
      // the artifact occurrence as the review location.
      const learnerSurface = exactSourceAtom?.claim || surface;
      const candidate = normalized(learnerSurface);
      const preservesSemanticSurface = semanticSurfaces.some(
        (semanticSurface) =>
          semanticSurface.length >= 24 &&
          (candidate.includes(semanticSurface) || (candidate.length >= 35 && semanticSurface.includes(candidate))),
      );
      if (!preservesSemanticSurface) return;
      claims.push({
        category: 'factualClaims',
        surface: learnerSurface,
        lessonNumber,
        origin: MODEL_PROVISIONAL_AUTHORITY_RE.test(authority)
          ? 'rendered-model-provisional-prose'
          : `rendered-${authority}-prose`,
        fieldPath: `renderedArtifacts.${artifactPath || 'unknown'}#sentence-${index + 1}`,
        artifactPath,
      });
    });
  }
  return claims;
}

function collectStructuredClaims(deliverables) {
  const claims = [];
  const visited = new WeakSet();
  const visit = (value, context = {}) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        visit(entry, { ...context, path: `${context.path || 'deliverables'}[${index}]` }),
      );
      return;
    }
    const lessonNumber = lessonNumberFrom(value, context.lessonNumber);
    const origin = clean(
      value.enrichmentSource || value.projectionKind || value.source || value.provenance?.source || context.origin,
    );
    const pathPrefix = context.path || 'deliverables';
    const artifactFamily = artifactFamilyForFieldPath(pathPrefix);
    const renderedRubricCriterionRow = artifactFamily === 'Rubrics' && /\.criteria\[\d+\]$/.test(pathPrefix);
    const renderedRubricAnchorObject = artifactFamily === 'Rubrics' && /\.anchorExamples$/.test(pathPrefix);
    if (renderedRubricCriterionRow) {
      const criterion = clean(value.criterion || value.name);
      const weight = Number(value.weight);
      if (criterion && Number.isFinite(weight) && weight > 0) {
        claims.push({
          category: 'scoringClaims',
          surface: `${criterion} ${String(weight).replace(/%$/, '')}%`,
          lessonNumber,
          origin,
          fieldPath: `${pathPrefix}.criterion+weight`,
        });
      }
    }
    if (
      value.protocol === 'coursemapper-operation-qualified-evidence-v1' &&
      value.authority === 'compiler-verified-calculation'
    ) {
      for (const key of ['problem', 'result', 'interpretation', 'boundary']) {
        const surface = clean(value[key]);
        if (surface) {
          claims.push({
            category: 'factualClaims',
            surface,
            lessonNumber,
            origin: 'compiler-verified-calculation',
            fieldPath: `${pathPrefix}.${key}`,
          });
        }
      }
      (Array.isArray(value.steps) ? value.steps : []).forEach((step, index) => {
        const surface = clean(step);
        if (surface) {
          claims.push({
            category: 'factualClaims',
            surface,
            lessonNumber,
            origin: 'compiler-verified-calculation',
            fieldPath: `${pathPrefix}.steps[${index}]`,
          });
        }
      });
    }
    const options = Array.isArray(value.options) ? value.options.map(clean).filter(Boolean) : [];
    const answerIndex = Number(value.answerIndex);
    const answerLetter = clean(value.answer);
    const letterIndex = /^[A-D]$/i.test(answerLetter) ? answerLetter.toUpperCase().charCodeAt(0) - 65 : -1;
    const correctOption =
      Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length
        ? options[answerIndex]
        : letterIndex >= 0 && letterIndex < options.length
          ? options[letterIndex]
          : '';
    if (correctOption) {
      claims.push({
        category: 'keyedAnswers',
        surface: correctOption.replace(/^[A-D][.)]\s*/i, ''),
        lessonNumber,
        origin,
        fieldPath: `${pathPrefix}.options[correct]`,
      });
    }
    for (const [key, entry] of Object.entries(value)) {
      // Grounding objects are compiler/audit receipts mirrored beside the
      // learner deliverable. Traversing them can bind an internal rationale to
      // an unrelated visible heading that happens to reuse the same words.
      // Learner-visible prose from the actual Office bytes is inventoried by
      // the rendered-source path above.
      if (NON_LEARNER_SEMANTIC_SUBTREES.has(key)) continue;
      const surface = clean(entry);
      if (
        artifactFamily === 'Discussion Prompts' &&
        /\.discussions\[\d+\]$/.test(pathPrefix) &&
        key === 'evaluationCriteria' &&
        Array.isArray(entry)
      ) {
        entry
          .map(clean)
          .filter(Boolean)
          .forEach((criterion, index) => {
            claims.push({
              category: 'scoringClaims',
              surface: criterion,
              lessonNumber,
              origin,
              fieldPath: `${pathPrefix}.${key}[${index}]`,
            });
          });
      }
      if (typeof entry === 'string' && surface) {
        if (DEFINITION_KEYS.has(key)) {
          claims.push({ category: 'definitions', surface, lessonNumber, origin, fieldPath: `${pathPrefix}.${key}` });
        } else if (key === 'answer' || key === 'sampleAnswer') {
          if (!/^[A-D]$/i.test(surface)) {
            claims.push({ category: 'keyedAnswers', surface, lessonNumber, origin, fieldPath: `${pathPrefix}.${key}` });
          }
        } else if (RATIONALE_KEYS.has(key)) {
          claims.push({ category: 'rationales', surface, lessonNumber, origin, fieldPath: `${pathPrefix}.${key}` });
        } else if (
          SCORING_KEYS.has(key) ||
          ((renderedRubricCriterionRow || renderedRubricAnchorObject) && RUBRIC_SCORING_KEYS.has(key))
        ) {
          claims.push({ category: 'scoringClaims', surface, lessonNumber, origin, fieldPath: `${pathPrefix}.${key}` });
        }
      }
      if (entry && typeof entry === 'object') {
        visit(entry, { lessonNumber, origin, path: `${pathPrefix}.${key}` });
      }
    }
  };
  // The syllabus payload contains compiler receipts and mirrors of every
  // lesson's enrichment state. Those objects are audit metadata, not separate
  // learner-facing semantic claims; traversing them double-counted claims and
  // even classified fields such as FAQ `df` (difficulty) as definitions.
  for (const [featureId, payload] of Object.entries(deliverables || {})) {
    if (featureId === 'syllabus') continue;
    visit(payload, { path: `deliverables.${featureId}` });
  }
  return claims;
}

function collectAssessmentTuples(deliverables) {
  const tuples = [];
  const visited = new WeakSet();
  const visit = (value, context = {}) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        visit(entry, { ...context, path: `${context.path || 'deliverables'}[${index}]` }),
      );
      return;
    }
    const options = Array.isArray(value.options) ? value.options.map(clean).filter(Boolean) : [];
    if (options.length >= 2) {
      const stem = clean(value.question || value.prompt || value.stem);
      const answerIndex = Number(value.answerIndex);
      const answerLetter = clean(value.answer);
      const letterIndex = /^[A-Z]$/i.test(answerLetter) ? answerLetter.toUpperCase().charCodeAt(0) - 65 : -1;
      const correctIndex = Number.isInteger(answerIndex) ? answerIndex : letterIndex;
      tuples.push({
        fieldPath: context.path || 'deliverables',
        lessonNumber: lessonNumberFrom(value, context.lessonNumber) || null,
        stem,
        options,
        correctIndex,
      });
    }
    const lessonNumber = lessonNumberFrom(value, context.lessonNumber);
    for (const [key, entry] of Object.entries(value)) {
      if (NON_LEARNER_SEMANTIC_SUBTREES.has(key)) continue;
      if (entry && typeof entry === 'object')
        visit(entry, { lessonNumber, path: `${context.path || 'deliverables'}.${key}` });
    }
  };
  for (const [featureId, payload] of Object.entries(deliverables || {})) {
    if (featureId === 'syllabus') continue;
    visit(payload, { path: `deliverables.${featureId}` });
  }
  return tuples;
}

/**
 * Enumerate every structured, answer-bearing semantic surface plus factual and
 * definitional prose in source-accountable rendered lessons before package
 * promotion. Procedural directions and instructor/compiler policy are
 * excluded by construction; source-backed prose is never trusted merely
 * because it rendered successfully.
 */
export async function buildSemanticClaimInventory({
  courseGraph = null,
  deliverables = null,
  sourceLedger = [],
  renderedArtifacts = [],
} = {}) {
  const instructionalInstancesByLessonId = instanceByLessonId(
    courseGraph?.instructionalIntentGraph?.instructionalInstanceContract ||
      courseGraph?.evidenceGroundedInstructionalPlan?.instructionalInstanceContract ||
      courseGraph?.preDraftInstructionalPlan?.instructionalInstanceContract,
  );
  const atoms = sourceAtoms(sourceLedger);
  const authorityByLesson = sourceAuthorityByLesson(courseGraph);
  const semanticSurfacesByLessonMap = semanticSurfacesByLesson(courseGraph, authorityByLesson);
  const candidates = collectStructuredClaims(deliverables);
  const assessmentTupleCandidates = collectAssessmentTuples(deliverables);
  candidates.push(
    ...collectRenderedSourceAccountableClaims(renderedArtifacts, authorityByLesson, semanticSurfacesByLessonMap, atoms),
  );
  for (const atom of atoms) {
    candidates.push({
      category: 'factualClaims',
      surface: atom.claim,
      lessonNumber: Number(atom.artifactPath.match(/(?:lesson|week|session)[-_ ]*0*(\d+)/i)?.[1]) || null,
      origin: 'admitted-source-ledger',
      fieldPath: `sourceLedger.${atom.sourceLedgerId}.${atom.sourceClaimId}`,
      artifactPath: atom.artifactPath,
    });
  }
  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const surface = clean(candidate.surface);
    if (!surface) continue;
    // The same atomic claim can legitimately appear in several lessons. Keep
    // one inventory row per lesson so a later/capstone occurrence cannot hide
    // a missing binding at its originating lesson.
    const identity = `${candidate.category}|${candidate.lessonNumber || 0}|${normalized(surface)}|${clean(candidate.artifactPath)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push({ ...candidate, surface });
  }

  const items = [];
  const itemOccurrences = new Set();
  for (const candidate of unique) {
    const visiblePaths = visibleArtifactPaths(candidate.surface, renderedArtifacts);
    const expectedArtifactFamily = artifactFamilyForFieldPath(candidate.fieldPath);
    const artifactPaths = candidate.artifactPath
      ? String(candidate.origin || '').startsWith('rendered-')
        ? [clean(candidate.artifactPath)].filter(Boolean)
        : visiblePaths.filter((artifactPath) => clean(artifactPath) === clean(candidate.artifactPath))
      : candidate.lessonNumber
        ? visiblePaths.filter((artifactPath) => {
            const artifactLessonNumber = lessonNumberFromArtifactPath(artifactPath);
            const lessonMatches = !artifactLessonNumber || artifactLessonNumber === Number(candidate.lessonNumber);
            const familyMatches =
              !expectedArtifactFamily || artifactFamilyForPath(artifactPath) === expectedArtifactFamily;
            return lessonMatches && familyMatches;
          })
        : expectedArtifactFamily
          ? visiblePaths.filter((artifactPath) => artifactFamilyForPath(artifactPath) === expectedArtifactFamily)
          : visiblePaths;
    // The checkpoint inventories the semantic content a learner can actually
    // encounter. Compiler-only diagnostics remain available in the saved
    // project and quality receipts, but cannot create hundreds of impossible
    // review obligations when they do not occur in rendered Office bytes.
    if (artifactPaths.length === 0) continue;
    for (const artifactPath of [...new Set(artifactPaths)]) {
      const occurrenceIdentity = `${candidate.category}|${candidate.lessonNumber || 0}|${normalized(
        candidate.surface,
      )}|${clean(artifactPath)}`;
      if (itemOccurrences.has(occurrenceIdentity)) continue;
      itemOccurrences.add(occurrenceIdentity);
      const sourceBindings = findSourceBindings(candidate.surface, atoms, candidate.lessonNumber, artifactPath);
      const authority = authorityByLesson.get(candidate.lessonNumber) || '';
      const sourceBearingOrigin = SOURCE_BEARING_ORIGIN_RE.test(candidate.origin);
      const compilerVerifiedCalculation = candidate.origin === 'compiler-verified-calculation';
      const compilerScoringPolicy = candidate.category === 'scoringClaims';
      const requiresSourcePassage =
        !compilerVerifiedCalculation &&
        !compilerScoringPolicy &&
        (candidate.category === 'definitions' ||
          candidate.category === 'factualClaims' ||
          sourceBearingOrigin ||
          sourceBindings.length > 0);
      const provenanceVerified = requiresSourcePassage
        ? sourceBindings.some((binding) => binding.sourceIdentityVerified)
        : compilerVerifiedCalculation ||
          compilerScoringPolicy ||
          /^(?:compiler-policy|instructor-supplied)$/i.test(authority) ||
          !sourceBearingOrigin;
      const artifactVisibilityVerified =
        !requiresSourcePassage || sourceBindings.some((binding) => binding.artifactVisibilityVerified);
      const semanticEntailmentVerified = requiresSourcePassage
        ? sourceBindings.some((binding) => binding.semanticEntailmentVerified)
        : compilerVerifiedCalculation
          ? true
          : null;
      const authorityResolution = compilerVerifiedCalculation
        ? 'compiler-verified-calculation'
        : requiresSourcePassage &&
            sourceBindings.some(
              (binding) =>
                binding.sourceIdentityVerified === true &&
                binding.semanticEntailmentVerified === true &&
                clean(binding.sourceLedgerId) &&
                clean(binding.sourceClaimId) &&
                clean(binding.sourcePassageSha256),
            )
          ? 'source-passage-bound'
          : compilerScoringPolicy
            ? 'compiler-policy'
            : 'unresolved';
      // “Verified” is reserved for a positive semantic result. Structural
      // presence, compiler ownership, or a null entailment result can support
      // an independent review, but must not be presented as semantic proof.
      const status = requiresSourcePassage
        ? provenanceVerified &&
          artifactVisibilityVerified &&
          semanticEntailmentVerified === true &&
          authorityResolution === 'source-passage-bound'
          ? 'verified'
          : 'review-required'
        : compilerVerifiedCalculation && provenanceVerified && artifactVisibilityVerified
          ? 'verified'
          : provenanceVerified && artifactVisibilityVerified
            ? 'structurally-verified'
            : 'review-required';
      const contentSha256 = await sha256(
        `${candidate.category}|${candidate.lessonNumber || 0}|${candidate.fieldPath}|${candidate.surface}|${artifactPath}`,
      );
      items.push({
        id: `claim-${contentSha256.slice(0, 20)}`,
        category: candidate.category,
        lessonNumber: candidate.lessonNumber || null,
        instructionalInstanceId: candidate.lessonNumber
          ? instructionalInstancesByLessonId[`lesson-${candidate.lessonNumber}`]?.instructionalInstanceId || ''
          : '',
        fieldPath: candidate.fieldPath,
        artifactPath,
        surface: candidate.surface,
        surfaceSha256: await sha256(candidate.surface),
        origin: candidate.origin || 'compiler-structured-surface',
        authority: compilerVerifiedCalculation
          ? 'compiler-verified-calculation'
          : authority || (requiresSourcePassage ? 'unresolved' : 'compiler-policy'),
        authorityResolution,
        requiresSourcePassage,
        provenanceVerified,
        artifactVisibilityVerified,
        semanticEntailmentVerified,
        artifactPaths: [artifactPath],
        sourceBindings,
        status,
      });
    }
  }
  items.sort(
    (left, right) =>
      Number(left.lessonNumber || 0) - Number(right.lessonNumber || 0) ||
      left.category.localeCompare(right.category) ||
      left.id.localeCompare(right.id),
  );
  const byCategory = Object.fromEntries(
    ['definitions', 'keyedAnswers', 'rationales', 'scoringClaims', 'factualClaims'].map((category) => {
      const rows = items.filter((item) => item.category === category);
      return [
        category,
        {
          total: rows.length,
          verified: rows.filter((item) => item.status === 'verified').length,
          structurallyVerified: rows.filter((item) => item.status === 'structurally-verified').length,
          reviewRequired: rows.filter((item) => item.status === 'review-required').length,
        },
      ];
    }),
  );
  const byArtifactFamily = Object.fromEntries(
    [...ARTIFACT_FAMILIES, 'Other'].map((family) => {
      const rows = items.filter((item) => artifactFamilyForPath(item.artifactPath) === family);
      return [
        family,
        {
          total: rows.length,
          verified: rows.filter((item) => item.status === 'verified').length,
          structurallyVerified: rows.filter((item) => item.status === 'structurally-verified').length,
          reviewRequired: rows.filter((item) => item.status === 'review-required').length,
        },
      ];
    }),
  );
  const assessmentTupleRows = await Promise.all(
    assessmentTupleCandidates.map(async (tuple) => {
      const normalizedOptions = tuple.options.map(normalized);
      const uniqueOptionCount = new Set(normalizedOptions).size;
      const correctIndexValid = tuple.correctIndex >= 0 && tuple.correctIndex < tuple.options.length;
      const visiblePaths = tuple.stem ? visibleArtifactPaths(tuple.stem, renderedArtifacts) : [];
      const structurallyComplete = Boolean(
        tuple.stem &&
        tuple.options.length >= 4 &&
        uniqueOptionCount === tuple.options.length &&
        correctIndexValid &&
        tuple.options.length - 1 >= 3,
      );
      const body = `${tuple.fieldPath}|${tuple.lessonNumber || 0}|${tuple.stem}|${tuple.options.join('|')}|${tuple.correctIndex}`;
      return {
        id: `assessment-tuple-${(await sha256(body)).slice(0, 20)}`,
        lessonNumber: tuple.lessonNumber,
        fieldPath: tuple.fieldPath,
        stemSha256: await sha256(tuple.stem),
        optionSha256: await Promise.all(tuple.options.map((option) => sha256(option))),
        optionCount: tuple.options.length,
        uniqueOptionCount,
        correctIndex: correctIndexValid ? tuple.correctIndex : null,
        correctOptionSha256: correctIndexValid ? await sha256(tuple.options[tuple.correctIndex]) : null,
        distractorCount: correctIndexValid ? tuple.options.length - 1 : 0,
        renderedArtifactPaths: visiblePaths,
        artifactVisibilityVerified: visiblePaths.length > 0,
        status: structurallyComplete && visiblePaths.length > 0 ? 'structurally-complete' : 'review-required',
        semanticBoundary:
          'This receipt proves tuple completeness, key mapping, option uniqueness, and rendered stem visibility; it does not establish disciplinary correctness or distractor quality.',
      };
    }),
  );
  return {
    protocol: SEMANTIC_CLAIM_INVENTORY_PROTOCOL,
    scope: {
      enumeratedFields: [
        'definitions',
        'keyed answers',
        'assessment stems, distractors, and answer-key mappings',
        'answer rationales',
        'scoring guidance',
        'rendered rubric criteria, weights, performance descriptors, and anchor-scoring examples',
        'rendered discussion evaluation criteria',
        'learner-visible factual and definitional prose in source-accountable lessons',
      ],
      sourceLedgerClaimsIncluded: true,
      proceduralDirectionsExcluded: true,
      boundary:
        'The inventory covers each artifact occurrence of compiler-structured semantic fields, explicit rendered scoring criteria/descriptors, admitted atomic source claims, and declarative factual or definitional sentences rendered from model-provisional, shipped-source-library, or verified-open-research lesson content. Repetition across Office families creates separate review obligations. Scoring claims are compiler-policy obligations and do not require a subject-matter source passage. Commands, classroom logistics, interface copy, non-evaluative discussion directions, grading policy, and instructor-authored policy are excluded because they are neither subject-matter truth claims nor explicit scoring criteria.',
    },
    summary: {
      total: items.length,
      verified: items.filter((item) => item.status === 'verified').length,
      structurallyVerified: items.filter((item) => item.status === 'structurally-verified').length,
      reviewRequired: items.filter((item) => item.status === 'review-required').length,
      sourceRequired: items.filter((item) => item.requiresSourcePassage).length,
      sourceRequiredVerified: items.filter((item) => item.requiresSourcePassage && item.status === 'verified').length,
      byCategory,
      byArtifactFamily,
    },
    assessmentTupleIntegrity: {
      protocol: 'coursemapper-assessment-tuple-integrity-v1',
      total: assessmentTupleRows.length,
      structurallyComplete: assessmentTupleRows.filter((row) => row.status === 'structurally-complete').length,
      reviewRequired: assessmentTupleRows.filter((row) => row.status === 'review-required').length,
      rows: assessmentTupleRows,
    },
    items,
  };
}
