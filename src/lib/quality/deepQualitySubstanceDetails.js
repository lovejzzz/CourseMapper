import { findLearnerFacingCompilerLeak, findMechanicalContentWordEcho } from '../mechanicalTextSeams.js';

function filmEditingMusicMetreFinding(courseTitle, file) {
  const identity = `${file.path || ''} ${file.text || ''}`;
  if (!/\b(?:film|cinema|cinematic|screen studies|filmmaking)\b/i.test(courseTitle)) return null;
  if (!/\b(?:editing|montage|cutting|continuity|cross[-\s]?cutting)\b/i.test(identity)) return null;
  const markers =
    String(file.text || '').match(
      /\b(?:Metre \((?:music|poetry)\)|tala|taal|regular recurring pattern of strong and weak beats|triple metre|additive rhythm|divisive rhythm|hypermetre)\b/gi,
    ) || [];
  if (new Set(markers.map((marker) => marker.toLowerCase())).size < 2) return false;
  return {
    code: 'film-editing-music-metre-contamination',
    severity: 'P0',
    dimension: 'discipline',
    file: file.path,
    detail: 'foreign music/poetry metre content appears in a film-editing lesson',
    evidence: String(file.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200),
  };
}

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

const EXPERIENTIAL_ACTIVITY_TITLE_RE =
  /\b(?:simulation|role[- ]?play|mock (?:hearing|trial|briefing|negotiation|interview)|case (?:exercise|workshop|conference)|studio critique|design (?:charrette|sprint|review)|lab (?:practical|investigation|challenge)|field (?:exercise|observation)|structured debate)\b/i;
const EXPERIENTIAL_ACTIVITY_RENDER_MARKERS = [
  /\bactivity clock\b/i,
  /\bparticipant or working roles\b/i,
  /\bsafety and evidence boundary\b/i,
  /\bstudent artifact\b|\bartifact requirements\b/i,
];
const EXPERIENTIAL_ACTIVITY_REQUIREMENTS = [
  {
    label: 'a course-specific situation',
    pattern: /\b(?:situation|scenario|briefing|case|problem|challenge)\b[\s\S]{40,}/i,
  },
  {
    label: 'participant or working roles with explicit constraints',
    pattern:
      /\b(?:participant|working|assigned|team|stakeholder|clinical|observer|operator|designer|analyst)?\s*roles?\b[\s\S]{0,700}\b(?:constraints?|responsibilit(?:y|ies)|trade-?offs?|boundary|limitations?)\b|\b(?:constraints?|responsibilit(?:y|ies)|trade-?offs?|boundary|limitations?)\b[\s\S]{0,700}\broles?\b/i,
  },
  {
    label: 'inspectable evidence',
    pattern:
      /\b(?:inspect(?: the| this| shared)? evidence before acting|evidence set|supplied evidence|records?|observations?|measurements?|passages?|design evidence|case evidence)\b/i,
  },
  {
    label: 'evolving phases or updates',
    pattern:
      /\b(?:phases? and updates?|activity phases?|phase information|later phase|new information|synchronized updates?|updates?)\b/i,
  },
  {
    label: 'a required decision, action, interpretation, or revision',
    pattern:
      /\b(?:required decision or action|required decision|required action|record an evidence-traceable action|decision, action, interpretation, or revision)\b/i,
  },
  {
    label: 'a named student artifact with inspectable requirements',
    pattern:
      /\b(?:student artifact|named artifact|artifact requirements?|complete .{3,100}(?:required evidence|requirements?))\b/i,
  },
  {
    label: 'a structured debrief',
    pattern: /\bdebrief\b[\s\S]{0,500}\b(?:evidence|constraints?|decisions?|actions?|revisions?)\b/i,
  },
  {
    label: 'a safety, evidence, or realism boundary',
    pattern:
      /\b(?:safety and evidence boundary|safety boundary|evidence boundary|realism boundary|activity boundary)\b/i,
  },
  {
    label: 'an exact activity clock',
    pattern: /\b(?:activity clock|total time|minutes across|minutes in class)\b/i,
  },
];

export function buildExperientialActivityFindings({ files = [], titleForFile = () => '' }) {
  const findings = [];
  for (const file of files.filter(
    (candidate) =>
      ['lessonPlans', 'slideDecks', 'assignments'].includes(candidate.featureId) &&
      (candidate.lessonNumber != null || candidate.featureId === 'assignments'),
  )) {
    const text = String(file.text || '');
    const titleRequestsActivity = EXPERIENTIAL_ACTIVITY_TITLE_RE.test(titleForFile(file));
    const renderedMarkerCount = EXPERIENTIAL_ACTIVITY_RENDER_MARKERS.filter((pattern) => pattern.test(text)).length;
    // Course-level context can mention a later lesson's activity inside every
    // exported lesson plan. Treat only an activity-titled document or a
    // document carrying at least two canonical rendering markers as an
    // experiential surface.
    // Marker-only detection must include the compiler's exact clock. Ordinary
    // comparison lessons can mention roles, evidence, and an artifact without
    // being experiential activities; two generic markers mislabeled those
    // lessons as incomplete simulations in the live v0.16.77 browser audit.
    const carriesCanonicalActivityClock = /\bactivity clock\b|\btotal time:\s*\d+\s*minutes\b/i.test(text);
    if (!titleRequestsActivity && !(renderedMarkerCount >= 2 && carriesCanonicalActivityClock)) continue;
    const missing = EXPERIENTIAL_ACTIVITY_REQUIREMENTS.filter(({ pattern }) => !pattern.test(text)).map(
      ({ label }) => label,
    );
    if (missing.length === 0) continue;
    findings.push({
      severity: 'P1',
      dimension: 'substance',
      file: file.path,
      detail: `experiential activity ${file.featureId} is missing ${missing.length} required run mechanic${missing.length === 1 ? '' : 's'}`,
      evidence: missing.join('; '),
    });
  }
  return findings;
}

export function buildAdditionalSubstanceFindings({ files = [], course = {}, quoteEvidence }) {
  const findings = [];
  const courseTitle = String(course?.title || course?.courseName || course?.id || '');
  for (const file of files) {
    const finding = filmEditingMusicMetreFinding(courseTitle, file);
    if (finding) {
      findings.push(finding);
      break;
    }
  }
  for (const file of files) {
    const leak = findLearnerFacingCompilerLeak(file.text);
    if (!leak) continue;
    findings.push({
      severity: 'P1',
      dimension: 'substance',
      file: file.path,
      detail: `learner-facing copy exposes a compiler seam (${leak.code})`,
      evidence: leak.evidence,
    });
  }
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
