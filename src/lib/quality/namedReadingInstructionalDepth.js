const READING_INSTRUCTIONAL_FEATURES = new Set([
  'lessonPlans',
  'slideDecks',
  'assignments',
  'discussions',
  'quizBank',
  'studyGuides',
]);
const READING_EVIDENCE_FEATURES = new Set(['assignments', 'discussions', 'quizBank', 'studyGuides']);
const READING_EVIDENCE_ACTION_RE =
  /\b(?:annotat|analy[sz]|cite|close[- ]read|compare|contrast|explain|interpret|quote|trace|passage|line|stanza|scene|speaker|character|imagery?|motif|form|diction|syntax|structure|detail)\w*\b/i;
const READING_RETRIEVED_RE = /open-access via/i;
const MATERIALS_BLOCK_END_RE =
  /^(assessments this week|session outline|worked example|observation protocol|key terms|formative check|homework|closing activity)$/i;
const PRIMARY_READING_KIND_RE = /^(?:article|book|chapter|essay|film|novel|play|poem|primary[- ]?text|short[- ]?story)$/i;
const TITLE_FUNCTION_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);

function normalizeReadingMatchText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function readingTitleVariants(title) {
  const normalized = normalizeReadingMatchText(title);
  if (!normalized) return [];
  const variants = [normalized];
  // Dropping an initial English article is a normal rendered-title variation
  // ("The Odyssey" → "Odyssey"). Internal words remain exact so a corrupted
  // multi-author title cannot masquerade as the canonical registry title.
  if (normalized.startsWith('the ')) variants.push(normalized.slice(4));
  return variants;
}

function fileMentionsReading(file, variants) {
  const text = normalizeReadingMatchText(file?.text);
  return variants.some((variant) => variant && text.includes(variant));
}

function titleHasWorkIdentity(title) {
  const words = String(title || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’:-]*/gu) || [];
  const contentWords = words.filter((word) => !TITLE_FUNCTION_WORDS.has(word.toLowerCase()));
  // A lone capitalized word is too ambiguous to self-arm this severe gate:
  // both canonical works ("Inferno") and ordinary lesson topics ("Memory")
  // have that shape. Explicit course/reading metadata handles the former.
  if (contentWords.length < 2) return false;
  const identityWords = contentWords.filter((word) => {
    const first = Array.from(word)[0] || '';
    return first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase();
  });
  return identityWords.length >= 2 && identityWords.length / contentWords.length >= 0.6;
}

function isCrediblePrimaryReading(entry, course) {
  if (!entry || typeof entry !== 'object') return false;
  // Frozen/reference courses can declare the contract explicitly. Uploaded
  // reading-list items and typed primary works carry equivalent provenance.
  if (course?.expectReadings === true) return true;
  if (entry.provenance === 'instructor-provided') return true;
  if (String(entry.author || '').trim()) return true;
  if (PRIMARY_READING_KIND_RE.test(String(entry.kind || '').trim())) return true;
  // The graph's broad `readings` slot can also contain lesson-topic labels.
  // Only strong title identity may self-arm the work-depth rule without an
  // explicit reading contract; sentence-case topical phrases stay out.
  return titleHasWorkIdentity(entry.title);
}

function namedPrimaryReadings(manifest, course) {
  return (Array.isArray(manifest?.readings) ? manifest.readings : []).filter((entry) =>
    isCrediblePrimaryReading(entry, course),
  );
}

export function addReadingInstructionalDepthFindings(findings, { files, manifest }, course = {}) {
  const readings = namedPrimaryReadings(manifest, course);
  if (readings.length === 0) return;

  const availableFeatures = new Set(
    files
      .filter(
        (file) =>
          Number.isFinite(file.lessonNumber) &&
          READING_INSTRUCTIONAL_FEATURES.has(file.featureId),
      )
      .map((file) => file.featureId),
  );
  // A small/partial export cannot prove cross-surface penetration. Arm only
  // when a package ships a representative instructional bundle.
  if (availableFeatures.size < 4) return;

  const absentFromInstruction = [];
  const shallowInstruction = [];
  const missingEvidenceTask = [];
  for (const entry of readings) {
    const lessonNumber = Number(entry.lesson);
    const variants = readingTitleVariants(entry.title);
    if (!Number.isFinite(lessonNumber) || variants.length === 0) continue;
    const lessonFiles = files.filter(
      (file) =>
        file.lessonNumber === lessonNumber &&
        READING_INSTRUCTIONAL_FEATURES.has(file.featureId),
    );
    const mentionedFeatures = [
      ...new Set(
        lessonFiles
          .filter((file) => fileMentionsReading(file, variants))
          .map((file) => file.featureId),
      ),
    ];
    const hasEvidenceTask = lessonFiles.some(
      (file) =>
        READING_EVIDENCE_FEATURES.has(file.featureId) &&
        fileMentionsReading(file, variants) &&
        READING_EVIDENCE_ACTION_RE.test(file.text),
    );
    const summary = `L${lessonNumber} "${entry.title}": ${mentionedFeatures.length}/${availableFeatures.size} surfaces${
      mentionedFeatures.length > 0 ? ` (${mentionedFeatures.join(', ')})` : ''
    }`;
    if (mentionedFeatures.length <= 1) absentFromInstruction.push(summary);
    else if (mentionedFeatures.length === 2) shallowInstruction.push(summary);
    if (!hasEvidenceTask) missingEvidenceTask.push(summary);
  }

  if (absentFromInstruction.length > 0) {
    findings.add({
      severity: 'P0',
      dimension: 'substance',
      file: 'named readings',
      detail: `${absentFromInstruction.length} instructor-named primary text(s) reach at most one instructional surface; title-only inheritance cannot support the assigned reading`,
      evidence: absentFromInstruction.slice(0, 3).join(' | '),
    });
  }
  if (shallowInstruction.length > 0) {
    findings.add({
      severity: 'P1',
      dimension: 'substance',
      file: 'named readings',
      detail: `${shallowInstruction.length} instructor-named primary text(s) reach only two instructional surfaces`,
      evidence: shallowInstruction.slice(0, 3).join(' | '),
    });
  }
  if (missingEvidenceTask.length > 0) {
    findings.add({
      severity: 'P0',
      dimension: 'substance',
      file: 'named readings',
      detail: `${missingEvidenceTask.length} instructor-named primary text(s) appear in no assessed or discussed evidence task`,
      evidence: missingEvidenceTask.slice(0, 3).join(' | '),
    });
  }
}

function addReadingRegistryFindings(findings, { files, manifest }, course) {
  const registry = Array.isArray(manifest?.readings) ? manifest.readings : [];
  if (registry.length === 0) {
    if (course?.expectReadings) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: 'PACKAGE_MANIFEST.json',
        detail:
          'course names per-week readings (expectReadings) but the manifest carries no readings registry — extraction or inheritance dropped the instructor readings',
        evidence: 'manifest.readings missing or empty',
      });
    }
    return;
  }
  const readings = namedPrimaryReadings(manifest, course);
  if (readings.length === 0) return;

  const syllabusFile = files.find((file) => file.featureId === 'syllabus');
  const lessonPlanFiles = files.filter((file) => file.featureId === 'lessonPlans');
  const syllabusText = syllabusFile ? normalizeReadingMatchText(syllabusFile.text) : '';

  for (const entry of readings) {
    const title = normalizeReadingMatchText(entry.title);
    if (!title) continue;
    const plan = lessonPlanFiles.find((file) => file.lessonNumber === entry.lesson);
    if (plan && !normalizeReadingMatchText(plan.text).includes(title)) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: plan.path,
        detail: `named reading ${entry.id || ''} "${entry.title}" (L${entry.lesson}) does not appear verbatim in its week's lesson plan materials`,
        evidence: entry.title,
      });
    }
    if (syllabusFile && !syllabusText.includes(title)) {
      findings.add({
        severity: 'P1',
        dimension: 'identity',
        file: syllabusFile.path,
        detail: `named reading ${entry.id || ''} "${entry.title}" (L${entry.lesson}) does not appear verbatim in the syllabus schedule`,
        evidence: entry.title,
      });
    }
  }

  for (const plan of lessonPlanFiles) {
    const lessonTitles = readings
      .filter((entry) => entry.lesson === plan.lessonNumber)
      .map((entry) => normalizeReadingMatchText(entry.title))
      .filter(Boolean);
    if (lessonTitles.length === 0) continue;
    const lines = (plan.paragraphs || []).map((line) => normalizeReadingMatchText(line));
    const start = lines.findIndex((line) => line === 'materials & resources');
    if (start === -1) continue;
    let firstInstructor = -1;
    let firstRetrieved = -1;
    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (MATERIALS_BLOCK_END_RE.test(line)) break;
      if (firstRetrieved === -1 && READING_RETRIEVED_RE.test(line)) firstRetrieved = index;
      if (firstInstructor === -1 && lessonTitles.some((title) => line.includes(title))) firstInstructor = index;
    }
    if (firstRetrieved !== -1 && firstInstructor !== -1 && firstRetrieved < firstInstructor) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: plan.path,
        detail: `provenance order violated in L${plan.lessonNumber} materials: a retrieved open reading lists above the instructor-named reading`,
        evidence: (plan.paragraphs || [])[firstRetrieved] || 'retrieved item listed first',
      });
    }
  }

  if (syllabusFile) {
    for (const rawLine of syllabusFile.paragraphs || []) {
      const line = normalizeReadingMatchText(rawLine);
      if (!READING_RETRIEVED_RE.test(line)) continue;
      const retrievedIndex = line.search(READING_RETRIEVED_RE);
      for (const entry of readings) {
        const title = normalizeReadingMatchText(entry.title);
        if (!title) continue;
        const titleIndex = line.indexOf(title);
        if (titleIndex !== -1 && retrievedIndex < titleIndex) {
          findings.add({
            severity: 'P1',
            dimension: 'citations',
            file: syllabusFile.path,
            detail: `provenance order violated in the syllabus schedule: a retrieved open reading lists above instructor-named "${entry.title}"`,
            evidence: rawLine,
          });
          break;
        }
      }
    }
  }
}

export function checkNamedReadings(findings, pkg, course) {
  addReadingRegistryFindings(findings, pkg, course);
  addReadingInstructionalDepthFindings(findings, pkg, course);
}
