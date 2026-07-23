import { findMechanicalContentWordEcho } from '../mechanicalTextSeams.js';

// High-signal finish checks live in this lazy leaf so adding a premium polish
// rule never expands the grader's control-flow chunk or the initial route.
function repeatedLongParagraphs(file, minimumCopies = 3) {
  const counts = new Map();
  for (const paragraph of file.paragraphs || []) {
    const normalized = String(paragraph || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (normalized.length < 40) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= minimumCopies).sort((left, right) => right[1] - left[1]);
}

export function comparativeAssessmentContractFinding({ assessment = {}, artifactText = '', readingTitles = [] }) {
  const assessmentTitle = String(assessment.title || '').toLowerCase();
  const text = String(artifactText || '');
  const normalizedText = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const namedReadingHits = readingTitles.filter((title) =>
    normalizedText.includes(
      String(title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    ),
  );
  if (/\bcomparative reading responses?\b/.test(assessmentTitle)) {
    const complete =
      namedReadingHits.length >= 2 &&
      /\b(?:two comparative reading responses|response 1)\b/i.test(text) &&
      /\bresponse 2\b/i.test(text) &&
      /\b(?:locatable|passage|formal feature)\b/i.test(text) &&
      /\b(?:counter-reading|alternative reading|competing interpretation)\b/i.test(text) &&
      /\b(?:explicit limit|cannot establish|evidence limit|claim limit)\b/i.test(text);
    return complete
      ? null
      : 'comparative reading responses do not compile as two explicit text pairings with locatable evidence, a credible counter-reading, and a claim limit';
  }
  if (/\bfinal\s+(?:comparative\s+)?(?:paper|essay)\b/.test(assessmentTitle)) {
    const complete =
      /\b(?:sustained comparative|comparative thesis|comparative argument)\b/i.test(text) &&
      /\b(?:multiple assigned texts|two assigned texts|every text central|each central text)\b/i.test(text) &&
      /\b(?:locatable|cite and analyze passages|textual evidence)\b/i.test(text) &&
      /\b(?:counter-reading|counterargument|competing interpretation)\b/i.test(text) &&
      /\b(?:explicit claim limits?|evidence limit|cannot establish|cannot sustain)\b/i.test(text);
    return complete
      ? null
      : 'final comparative paper lacks a sustained multi-text argument contract with paired evidence, a credible counter-reading, and explicit claim limits';
  }
  return null;
}

export function buildAdditionalSubstanceFindings({ files = [], course = {}, quoteEvidence }) {
  const findings = [];
  // Mechanical echoes are small on screen but expensive in perceived
  // quality: one "allusion and allusion" makes an otherwise polished package
  // feel unedited. The compiler repairs this before export; this check makes
  // any future escape score-bearing.
  for (const file of files) {
    const echo = findMechanicalContentWordEcho(file.text);
    if (!echo) continue;
    findings.push({
      severity: 'P1',
      dimension: 'substance',
      file: file.path,
      detail: 'learner-facing sentence repeats the same content word on both sides of a conjunction',
      evidence: echo[0],
    });
  }

  // A study guide that prints the same misconception three times does not
  // provide three review targets. Restrict this to long, exact paragraph
  // copies so ordinary repeated table headings remain valid.
  for (const guide of files.filter((file) => file.featureId === 'studyGuides')) {
    const repeated = repeatedLongParagraphs(guide);
    if (repeated.length === 0) continue;
    findings.push({
      severity: 'P1',
      dimension: 'substance',
      file: guide.path,
      detail: `study guide repeats the same substantive paragraph ${repeated[0][1]} times`,
      evidence: quoteEvidence(repeated[0][0]),
    });
  }

  const courseIdentity = `${course?.title || ''} ${course?.courseName || ''} ${course?.prompt || ''}`;
  const interpretiveLiteratureCourse = /\b(literature|literary|close reading|world lit)\b/i.test(courseIdentity);
  const creativeWritingRequested =
    /\b(creative writing|writing workshop|poetry workshop|fiction workshop|draft poems?|draft fiction|manuscript|creative portfolio)\b/i.test(
      courseIdentity,
    );
  if (interpretiveLiteratureCourse && !creativeWritingRequested) {
    const creativeRubric = files.find(
      (file) =>
        ['assignments', 'rubrics', 'courseFaq'].includes(file.featureId) &&
        /\bcreative portfolio\b|\bcraft intentionality\b|\brisk[- ]taking\b/i.test(file.text || ''),
    );
    if (creativeRubric) {
      findings.push({
        severity: 'P1',
        dimension: 'discipline',
        file: creativeRubric.path,
        detail:
          'interpretive literature package applies a creative-writing portfolio genre without an instructor request',
        evidence: quoteEvidence(creativeRubric.text),
      });
    }
  }
  return findings;
}
