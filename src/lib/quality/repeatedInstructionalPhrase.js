import { formatScanUnits } from './deepQualityFormatDetails.js';

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
      (Array.isArray(manifest?.lessons) ? manifest.lessons : [])
        .flatMap((lesson) => (Array.isArray(lesson?.objectives) ? lesson.objectives : []))
        .map((value) =>
          String(value || '')
            .replace(/[.!?]+$/, '')
            .trim(),
        )
        .filter((value) => words(value).length >= SHORT_DIRECTIVE_SHINGLE_SIZE),
    ),
  ];
  const maskedIdentities = [...new Set([...registeredAssessmentIdentities, ...registeredObjectiveIdentities])];
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
            const entry = identityCounts.get(registeredIdentity) || { count: 0, files: new Map() };
            entry.count += matches.length;
            entry.files.set(file.path, (entry.files.get(file.path) || 0) + matches.length);
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
