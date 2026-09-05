import { formatScanUnits } from './deepQualityFormatDetails.js';
import { verifiedAuthenticEvidenceIdentitySurfaces } from '../authenticEvidenceQualityUtils.js';

const SHINGLE_SIZE = 10;
const SHORT_DIRECTIVE_SHINGLE_SIZE = 7;
const PACKAGE_REPEAT_LIMIT = 24;
const SINGLE_FILE_REPEAT_LIMIT = 18;
const DIRECTIVE_VERB_RE =
  /\b(?:cite|compare|connect|explain|identify|justify|limit|mark|name|note|revise|show|state|support|verify)\b/i;

function words(value) {
  return (
    String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/https?:\/\/\S+|\bdoi\s*:\s*\S+/gi, ' ')
      // A required asset path is a stable citation identity, not reusable
      // instructional prose. A well-aligned course should name the same data
      // packet across every lesson that uses it; counting that path as a
      // ten-word boilerplate phrase creates a false P1 precisely when coverage
      // improves. The surrounding directions remain in the scan.
      .replace(/\b(?:required\s+assets?|source\s+materials?)\/[^\s,;]+/gi, ' xresourcex ')
      .match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || []
  );
}

function shingles(value, size = SHINGLE_SIZE) {
  const tokens = words(value);
  const result = [];
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.push(tokens.slice(index, index + size).join(' '));
  }
  return result;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Detect long repeated phrases embedded inside otherwise different artifacts.
export function findRepeatedInstructionalPhrase(files = [], manifest = {}, identity = {}) {
  const documentLessonTitle = identity.documentLessonTitle || (() => '');
  const lessonTitleFromPath = identity.lessonTitleFromPath || (() => '');
  const registeredAssessmentIdentities = [
    ...new Set(
      [
        ...(Array.isArray(manifest?.assessments) ? manifest.assessments : []),
        ...(Array.isArray(manifest?.assessmentRegistry) ? manifest.assessmentRegistry : []),
      ]
        .flatMap((entry) => [entry?.title, entry?.artifact, entry?.label])
        .map((value) =>
          String(value || '')
            .replace(/[.!?]+$/, '')
            .trim(),
        )
        .filter((value) => words(value).length >= SHINGLE_SIZE),
    ),
  ];
  const registeredObjectiveIdentities = [
    ...new Set(
      [
        ...(Array.isArray(manifest?.lessons) ? manifest.lessons : []).flatMap((lesson) =>
          Array.isArray(lesson?.objectives) ? lesson.objectives : [],
        ),
        ...(Array.isArray(manifest?.functionalVisualBindings) ? manifest.functionalVisualBindings : [])
          .filter((binding) => binding?.visibleTask?.hashBound === true)
          .map((binding) => binding.visibleTask.successCriterion),
      ]
        .map((value) =>
          String(value || '')
            .replace(/[.!?]+$/, '')
            .trim(),
        )
        .filter((value) => words(value).length >= SHORT_DIRECTIVE_SHINGLE_SIZE),
    ),
  ];
  const registeredCourseIdentities = [manifest?.courseName, manifest?.course?.title, manifest?.title]
    .map((value) =>
      String(value || '')
        .replace(/[.!?]+$/, '')
        .trim(),
    )
    .filter((value) => words(value).length >= 4);
  const registeredSourceIdentities = (Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [])
    .flatMap((source) => [source?.displayTitle, source?.title, source?.key])
    .map((value) =>
      String(value || '')
        .replace(/\s+§.+$/, '')
        .replace(/[.!?]+$/, '')
        .trim(),
    )
    .filter((value) => words(value).length >= 4);
  const registeredVerifiedSourceClaims = [
    ...new Set(
      (Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [])
        .flatMap((source) => (Array.isArray(source?.supportReceipt?.checks) ? source.supportReceipt.checks : []))
        .filter(
          (check) =>
            check?.semanticSupport === true &&
            check?.entailed === true &&
            check?.sourceIdentityVerified === true &&
            check?.artifactVisibilityVerified === true,
        )
        .map((check) =>
          String(check?.claim || '')
            .replace(/[.!?]+$/, '')
            .trim(),
        )
        .filter((value) => words(value).length >= SHINGLE_SIZE),
    ),
  ];
  const registeredVerifiedAuthenticEvidence = verifiedAuthenticEvidenceIdentitySurfaces(manifest).filter(
    (value) => words(value).length >= 3,
  );
  const maskedIdentities = [
    ...new Set([
      ...registeredCourseIdentities,
      ...registeredAssessmentIdentities,
      ...registeredObjectiveIdentities,
      ...registeredSourceIdentities,
      // Exact source claims are deliberately repeated across aligned artifact
      // families. Only receipt-backed, semantically entailed, visibly
      // rendered claims are masked; surrounding directions and unsupported
      // model prose remain fully subject to the repetition gate.
      ...registeredVerifiedSourceClaims,
      // Fingerprinted authentic-data payloads must recur verbatim wherever a
      // learner is asked to inspect them. Mask only the exact bound fields
      // from a complete truth-proof receipt; the directions around those
      // fields remain subject to both repetition gates.
      ...registeredVerifiedAuthenticEvidence,
    ]),
    // Mask the most specific fingerprinted surface first. A shorter field
    // such as the airflow value can be a substring of the complete
    // articulatory-evidence record; replacing that substring first prevents
    // the full hash-bound identity from matching and leaves a false repeated
    // phrase around the marker.
  ].sort((left, right) => right.length - left.length);
  const identityCounts = new Map();
  const excluded = new Set();
  const excludedShortDirectives = new Set();
  for (const file of files) {
    const identities = [
      documentLessonTitle(file),
      lessonTitleFromPath(file.path),
      ...(Array.isArray(file.slides) ? file.slides.map((slide) => slide?.title) : []),
    ];
    for (const value of identities.filter(Boolean)) {
      for (const shingle of shingles(value)) excluded.add(shingle);
      for (const shingle of shingles(value, SHORT_DIRECTIVE_SHINGLE_SIZE)) {
        excludedShortDirectives.add(shingle);
      }
    }
  }

  const counts = new Map();
  const shortDirectiveCounts = new Map();
  for (const file of files) {
    if (!file || /(?:QUALITY_REPORT|PACKAGE_MANIFEST|RUN_DIGEST)/i.test(file.path || '')) continue;
    for (const unit of formatScanUnits(file)) {
      if (/\b(?:https?:\/\/|doi\b|isbn\b|retrieved from)\b/i.test(unit)) continue;
      let instructionalUnit = unit;
      for (const registeredIdentity of maskedIdentities) {
        const pattern = new RegExp(escapeRegExp(registeredIdentity), 'gi');
        const matches = instructionalUnit.match(pattern) || [];
        if (matches.length > 0) {
          if (registeredAssessmentIdentities.includes(registeredIdentity)) {
            const entry = identityCounts.get(registeredIdentity) || { count: 0, files: new Map(), contexts: new Map() };
            const fileContexts = entry.contexts.get(file.path) || new Set();
            const contextKey = instructionalUnit.toLowerCase();
            // Office parsers can surface one table paragraph through both its
            // cell and paragraph projections. Count the visible instructional
            // context once, while still counting repeated identity mentions
            // inside that context and distinct contexts in the same file.
            if (!fileContexts.has(contextKey)) {
              entry.count += matches.length;
              entry.files.set(file.path, (entry.files.get(file.path) || 0) + matches.length);
              fileContexts.add(contextKey);
              entry.contexts.set(file.path, fileContexts);
            }
            identityCounts.set(registeredIdentity, entry);
          }
          instructionalUnit = instructionalUnit.replace(pattern, ' xartifactx ');
        }
      }
      for (const phrase of shingles(instructionalUnit)) {
        if (excluded.has(phrase)) continue;
        const entry = counts.get(phrase) || { count: 0, files: new Map() };
        entry.count += 1;
        entry.files.set(file.path, (entry.files.get(file.path) || 0) + 1);
        counts.set(phrase, entry);
      }
      for (const phrase of shingles(instructionalUnit, SHORT_DIRECTIVE_SHINGLE_SIZE)) {
        if (excludedShortDirectives.has(phrase) || !DIRECTIVE_VERB_RE.test(phrase)) continue;
        const entry = shortDirectiveCounts.get(phrase) || { count: 0, files: new Map() };
        entry.count += 1;
        entry.files.set(file.path, (entry.files.get(file.path) || 0) + 1);
        shortDirectiveCounts.set(phrase, entry);
      }
    }
  }

  let overusedIdentity = null;
  for (const [phrase, entry] of identityCounts) {
    const excessByFile = [...entry.files.values()].map((count) => Math.max(0, count - 2));
    const excessCount = excessByFile.reduce((sum, count) => sum + count, 0);
    const maxExcess = Math.max(0, ...excessByFile);
    if (excessCount < 12 && maxExcess < 8) continue;
    if (overusedIdentity && entry.count <= overusedIdentity.count) continue;
    const [worstFile] = [...entry.files.entries()].sort((left, right) => right[1] - left[1])[0] || ['package'];
    overusedIdentity = {
      phrase,
      count: entry.count,
      wordCount: words(phrase).length,
      file: entry.files.size > 1 ? `package (${entry.files.size} files)` : worstFile,
    };
  }
  if (overusedIdentity) return overusedIdentity;

  let worst = null;
  for (const [phrase, entry] of counts) {
    const maxInOneFile = Math.max(0, ...entry.files.values());
    const qualifies = entry.count >= PACKAGE_REPEAT_LIMIT || maxInOneFile >= SINGLE_FILE_REPEAT_LIMIT;
    if (!qualifies || (worst && entry.count <= worst.count)) continue;
    const [worstFile] = [...entry.files.entries()].sort((left, right) => right[1] - left[1])[0] || ['package'];
    worst = {
      phrase,
      count: entry.count,
      wordCount: SHINGLE_SIZE,
      file: entry.files.size > 1 ? `package (${entry.files.size} files)` : worstFile,
    };
  }
  if (worst) return worst;

  for (const [phrase, entry] of shortDirectiveCounts) {
    const maxInOneFile = Math.max(0, ...entry.files.values());
    const qualifies = entry.count >= PACKAGE_REPEAT_LIMIT || maxInOneFile >= SINGLE_FILE_REPEAT_LIMIT;
    if (!qualifies || (worst && entry.count <= worst.count)) continue;
    const [worstFile] = [...entry.files.entries()].sort((left, right) => right[1] - left[1])[0] || ['package'];
    worst = {
      phrase,
      count: entry.count,
      wordCount: SHORT_DIRECTIVE_SHINGLE_SIZE,
      file: entry.files.size > 1 ? `package (${entry.files.size} files)` : worstFile,
    };
  }
  return worst;
}

export function addRepeatedInstructionalPhraseFinding(findings, files, manifest, identity) {
  const repeated = findRepeatedInstructionalPhrase(files, manifest, identity);
  if (!repeated) return;
  findings.add({
    severity: 'P1',
    dimension: 'substance',
    file: repeated.file,
    detail: `A ${repeated.wordCount}-word instructional phrase repeats ${repeated.count} times across exported artifacts`,
    evidence: repeated.phrase,
  });
}
