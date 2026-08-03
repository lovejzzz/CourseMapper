/**
 * Language finalizer for blueprint-compiled deliverables.
 *
 * The compiler stitches deterministic templates around course-map values, which
 * historically produced three classes of reader-visible defects:
 *   1. full assessment/lesson titles repeated dozens of times per document,
 *   2. mechanical seams at template joins ("a Energy", "work..", "the the"),
 *   3. leading punctuation fragments from numbered section titles.
 *
 * This pass runs once per compiled deliverable, after compilation and before
 * validation/export, so every consumer (generation, finish, stale recompile)
 * sees the same finished language.
 */

import { isInternalExportMetadataKey } from './exporters/exporterUtils';
import { recordLegacyPathHit } from './legacyPathTelemetry';
import { artifactKindOf, shortArtifactReference, shortReferenceForKind, titleHeadNoun } from './artifactReference';
import { collapseMechanicalContentWordEchoes } from './mechanicalTextSeams.js';
import { renderedDeliverableCollection, renderedDeliverableContentRoot } from './renderedDeliverableRoot.js';

export { shortArtifactReference } from './artifactReference';
export { compressLessonPlanTitleReferences } from './lessonPlanTitleCompression.js';

const TITLE_LIKE_KEY_RE =
  /^(?:id|key|slug|tags|anchor|sourceColumns|relatedLessons|lessonNumbers|format|type|category|difficulty|bloomsLevel|weight|points)$/i;
// Speaker notes are presenter-facing: keep exact artifact names there so the
// instructor reads the precise deliverable being coached, and so per-lesson
// specificity stays visible to the classroom-readiness boilerplate gate.
// Review/trust surfaces also stay exact: a "spot-check X for <lesson>" line
// must keep its lesson-specific wording or readiness gates (rightly) flag it
// as generic guidance.
const REPLACEMENT_EXEMPT_KEY_RE =
  /^(?:notes|speakerNotes|instructorNotes|localReviewAction|reviewerAction|reviewFocus|localConfirmationCue|localReviewNeeded|assignedReadings|supportResources)$/i;

// ── v0.14.5 WS-D (D1): registry-keyed reference nouns ───────────────────────
// Targets that carry registry identity (assessmentId — the Phase 3a fields)
// derive the short-reference noun from REGISTRY KIND + TITLE HEAD-NOUN,
// retiring the 19-regex ARTIFACT_KIND_PATTERNS scan on the registry path.
// The phase-1 matrix (tests/v0143-compiler-diet.test.js) falsified the
// "inference is dead" hypothesis — the regex result was load-bearing for
// every 3rd+ mention because the registry kind vocabulary
// (graded-artifact/exam/oral/in-class) is too coarse for a readable noun —
// and queued exactly this rekey. The pre-colon label of a registry title is
// authored as the artifact's own genre ("Quiz: …" → 'quiz', "Lab
// Practical: …" → 'practical'), so its head noun beats a pattern guess.
// The regex scan remains ONLY for targets without registry identity
// (legacy/no-registry blueprints) and as the telemetry-counted fallback
// when a registry target arrives without a recognizable kind.
const REGISTRY_KIND_FALLBACK_NOUNS = {
  exam: 'exam',
  oral: 'oral check',
  'graded-artifact': 'assignment',
  'in-class': 'check',
};

// Label words that name the schedule slot, not the artifact genre — a
// pre-colon label like "Week 3" must never yield "the Week 3 week" — plus
// heads too generic to identify anything ("… artifact 4" → 'artifact').
function registryArtifactNoun(kind, title) {
  const fallback = REGISTRY_KIND_FALLBACK_NOUNS[kind] || '';
  // Unknown/missing kind: no derivation — the caller falls back to the
  // regex scan and records the (re-scoped) finalizer-kind-inference hit.
  if (!fallback) return '';
  if (kind === 'exam') return 'exam';
  const text = String(title || '').trim();
  const colonIndex = text.indexOf(':');
  if (kind === 'oral') {
    // "Final Oral Performance" → 'performance' (anywhere in the title — a
    // trailing phrase like "… with course vocabulary" must not hide it);
    // labeled heads keep their own noun ("Oral Presentation: …" →
    // 'presentation'); everything else reads as 'oral check'. Colon-less
    // heads other than 'performance' stay on the fallback — free-form
    // titles end in prepositional tails too often for a last-word guess.
    if (/\bperformances?\b/i.test(text)) return 'performance';
    const head = colonIndex > 0 ? titleHeadNoun(text.slice(0, colonIndex)) : '';
    return head || fallback;
  }
  // graded-artifact / in-class: the pre-colon label IS the authored genre.
  const head = colonIndex > 0 ? titleHeadNoun(text.slice(0, colonIndex)) : '';
  return head || fallback;
}

// v0.14.1 (1.1): artifact references no longer bake a week number into the
// target — twelve lessons sharing one minted title used to rewrite every
// document to "the Week 2 quiz" (1,064 occurrences in the OUTPUT-V014 CS
// course). The replacement is stored as a marker and the week number is
// resolved at replacement time from the enclosing document item.
const ARTIFACT_REFERENCE_MARKER = 'artifact-short-ref';

function resolveReplacement(target, contextLessonNumber = 0) {
  const { replacement } = target;
  if (typeof replacement === 'string') return replacement;
  // v0.14.5 WS-D (D1): replacement.artifactKind is fully decided at target
  // build time — registry kind + title head-noun for registry-identified
  // targets, ARTIFACT_KIND_PATTERNS for legacy targets — so consumption is
  // pure. (The v0.14.3 C1 'finalizer-kind-inference' telemetry used to fire
  // here on every registry-target consumption; it is re-scoped to the build
  // site and fires only when the regex scan runs DESPITE registry identity.)
  // The enclosing item's lesson wins; lesson-less scopes (syllabus,
  // course-level residue) fall back to the artifact's own lesson — unless
  // the same title is shared across lessons, where any single week number
  // would be wrong for most readers and the phrasing goes week-neutral.
  const lessonNumber =
    contextLessonNumber > 0 ? contextLessonNumber : target.multiLesson ? 0 : replacement.lessonNumber || 0;
  return shortReferenceForKind(replacement.artifactKind, lessonNumber, target.pattern);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeStudentFacingParameterClause(value) {
  return String(value || '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .replace(/^use brief written explanations$/i, 'write brief explanations')
    .replace(/^include at least (\d+) misconceptions$/i, 'address at least $1 common misunderstandings')
    .replace(/^focus on (.+)$/i, 'connect $1 to the submitted evidence')
    .replace(/^support answers with reasons$/i, 'justify each answer with a reason')
    .replace(/^include process and outcome$/i, 'show both process and outcome')
    .replace(/\s+/g, ' ');
}

function repairPromptParameterScaffolds(value) {
  return String(value || '').replace(/\bWork within these parameters:\s*([^.!?]*)([.!?]?)/gi, (_, body) => {
    const requirements = body
      .split(/\s*;\s*/)
      .map((part) => sanitizeStudentFacingParameterClause(part))
      .filter(Boolean);
    if (requirements.length === 0) return 'Follow the submission requirements.';
    return `Submission requirements: ${requirements.join('; ')}.`;
  });
}

const A_TO_AN_EXCEPTION_RE =
  /^(?:one(?:s|-)?|once|uni[a-z]*|usab[a-z]*|usag[a-z]*|use[a-z]*|usual[a-z]*|euro[a-z]*|ufo[a-z]*|utens[a-z]*)$/i;

// v0.14.1 round-2 (fix 5): 1-3 char code tokens that are ALSO common English
// words. A bare strip of `and`/`or` produced the unreadable "combine tests
// with and or" on a live CS slide — these wrap in single quotes instead.
const SHORT_CODE_WORD_RE = /^(?:a|an|and|or|not|in|is|if|as|for|on|at|to|by|of|do|no|the|all|any)$/i;

function fixMechanicalSeams(value) {
  let text = repairPromptParameterScaffolds(value);
  text = collapseMechanicalContentWordEchoes(text);
  // Compact-restored projects can carry historical fallback clauses that
  // were correct as internal constraints but read like unfinished compiler
  // notes. Repair them at the final reader-visible boundary without another
  // model call or any change to the underlying requirement.
  text = text
    .replace(/\blocally approved submission form\b/gi, 'submission format specified in the course site')
    .replace(
      /\bconfirm the course-specific limit with the instructor\b/gi,
      'follow the stated scope and length requirements',
    )
    .replace(/\bMake\s+([^.!?]{1,100}?)\s+defend\s+one\b/gi, 'Use $1 to defend one');
  text = text.replace(
    /\b(from|in|with|against|through)\s+assigned course materials\b/gi,
    '$1 the assigned course materials',
  );
  // v0.14.1 (5.1): markdown code spans render their backticks verbatim in
  // Office text ("`{'name': 'Ava', 'age': 19}` maps labels to data" shipped
  // on slides in the OUTPUT-V014 audit) — enriched key-term examples carry
  // them into slides, study guides, and quizzes. DOCX/PPTX have no code-span
  // concept, so paired delimiters are stripped and the content kept; a lone
  // backtick (a legitimate character) is left alone. Round-2 refinement: a
  // span holding a short code token that doubles as a common English word
  // ("`and`", "`or`") keeps a delimiter — single quotes — because the bare
  // strip destroyed readability ("combine tests with and or"). Longer or
  // symbol-bearing spans keep the plain strip.
  text = text.replace(/`([^`\n]+)`/g, (match, content) =>
    content.length <= 3 && SHORT_CODE_WORD_RE.test(content) ? `'${content}'` : content,
  );
  // Leading punctuation fragments ("# 1.1:" section titles stripped upstream).
  text = text.replace(/^\s*[:;,–—]\s+/, '');
  // Stitched double periods: "evidence move in X.." and "X. . Next".
  text = text.replace(/([A-Za-z0-9)'"’”])\.\s*\.(?!\.)/g, '$1.');
  // Exact echo chains from low-information labels: "X: X" / "X: For X".
  // Anchored to segment starts (line start or after sentence/colon
  // punctuation): a label whose LAST word merely coincides with the first
  // word of a deliberate colon-joined list ("Decision Case: case fact
  // sort, exhibit check") is not an echo, and collapsing it destroys the
  // list's leading item.
  text = text.replace(/(^|[.!?:]\s+)([A-Z][\w &'-]{3,50}):\s+(?:For\s+)?\2\b/gi, '$1$2');
  // Space before punctuation.
  text = text.replace(/[ \t]+([.,;:!?])(?=\s|$)/g, '$1');
  // Doubled connectives produced by reference replacement ("the the Week 2 check").
  text = text.replace(/\b(the|a|an|to|of|for|and|or|in|on|with|at|by)\s+\1\b/gi, '$1');
  text = text.replace(/\b(one targeted|a guided|one|the next)\s+the\s+(?=[A-Za-z])/gi, '$1 ');
  // Compacted proper-name surfaces can lose an apostrophe at an upstream
  // token boundary ("Earth s Structure", "Erikson s Psychosocial"). Restore
  // only the narrow title-case shape so ordinary plural words remain intact.
  text = text.replace(/\b([A-Z][A-Za-z]{2,})\s+s(?=\s+[A-Z][A-Za-z])/g, "$1's");
  // Template joins sometimes put a title's leading article inside an
  // existing noun phrase ("central The six classes", "today's the Erikson
  // work", "a solid the key ideas detail"). These are not stylistic issues:
  // they are visible grammar breaks in exported Office documents.
  text = text.replace(/\b(today|tonight|tomorrow|yesterday)'s\s+the\s+(?=[A-Za-z])/gi, "$1's ");
  text = text.replace(/\b(a|an)\s+(solid|clear|strong|specific|defensible)\s+the\s+(?=[A-Za-z])/gi, '$1 $2 ');
  text = text.replace(/\b(central|core|primary)\s+The(?=\s+[a-z])/g, '$1');
  text = text.replace(/\bThe(?=\s+[a-z])/g, (match, offset) => (isSentenceStart(text, offset) ? match : 'the'));
  text = text.replace(/(^|[.!?]\s+)the(?=\s+[A-Za-z])/g, '$1The');
  text = text.replace(/\b(The key ideas in [^.!?]{2,60}) is only\b/g, '$1 are only');
  text = text.replace(/\bexplain the psychological explanation\b/gi, 'explain the psychological account');
  // Some public standards prose treats the versioned acronym as a plural
  // shorthand ("WCAG 2.0 consist of..."). On a learner-facing surface the
  // named specification is singular. Repair this narrow agreement seam while
  // leaving the immutable source-ledger quote unchanged for audit.
  text = text.replace(/\b(WCAG\s+\d+(?:\.\d+)?)\s+consist of\b/gi, '$1 consists of');
  // Sentence/title casing in compact-model source atoms must not degrade
  // established accessibility and product-design acronyms on classroom
  // surfaces ("Wcag principles", "Html semantics", "Ux artifact").
  text = text
    .replace(/\bWcag\b/g, 'WCAG')
    .replace(/\bWai\b/g, 'WAI')
    .replace(/\bAria\b/g, 'ARIA')
    .replace(/\bHtml\b/g, 'HTML')
    .replace(/\bCss\b/g, 'CSS')
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bUx\b/g, 'UX');
  text = text.replace(
    /\bHow does ([A-Za-z][A-Za-z0-9 '&/-]{1,80}\b(?:forms|principles|guidelines|criteria|methods|techniques|standards|patterns|practices|requirements|roles)) actually work\?/gi,
    'How do $1 actually work?',
  );
  // Research snippets can quote obligations that apply only inside one
  // jurisdiction or policy. Learner-facing projections must retain that
  // boundary instead of universalizing the rule to every website.
  text = text
    .replace(
      /\bAll websites will need to adhere to the WCAG Principles\b/g,
      'In the cited policy context, covered websites are expected to follow the WCAG principles',
    )
    .replace(
      /\bFor example:\s+The regulations require compliance with\b/g,
      'For example, in that cited policy context, the regulations require compliance with',
    )
    .replace(
      /\bThe W3C's Techniques for WCAG 2\.0 is a list of techniques that\b/g,
      "W3C's Techniques for WCAG 2.0 lists techniques that",
    );
  // A due-window label can meet an artifact short reference after repetition
  // compaction ("Week 2" + "the Week 2 response"). Keep the one canonical
  // schedule label; this is an exact same-number seam, never a cross-week
  // reference.
  text = text.replace(/\b(Week\s+(\d{1,3}))\s+(?:the\s+)?\1\b/gi, '$1');
  // Article stacking when a short reference lands inside a noun phrase:
  // "the next the Week 1 check" → "the next Week 1 check".
  text = text.replace(/\b((?:the|a|an)\s+\w+\s+)the\s+(?=(?:Week|Lesson)\b)/gi, '$1');
  // Attributive positions read without the article: "Final the Week 1
  // artifact feedback" → "Final Week 1 artifact feedback". Words that also
  // work as verbs ("draft", "complete") stay out of this list — "Draft the
  // Week 3 artifact" is a correct imperative.
  text = text.replace(
    /\b(final|revised|initial|next|first|last|new|strong|partial|upcoming)\s+the\s+(?=(?:Week|Lesson)\b)/gi,
    '$1 ',
  );
  // v0.16: a short artifact reference ("the Week 4 sets") landing after a
  // possessive or determiner keeps its minted article — "Check your the
  // Week 4 sets", "strengthen their the Week 4 sets", "an evidence-backed
  // the Week 11 sets recommendation", "contrasting two the Week 4 sets
  // samples". Drop the "the" when the frame already supplies a determiner,
  // allowing up to two modifier words between them — but never across a
  // phrase boundary word ("a draft of the Week 4 sets" stays intact).
  text = text.replace(
    /\b(your|their|our|my|his|her|its|a|an|one|two|three|each|every|either|neither|another)\s+((?:(?!(?:to|of|for|in|on|with|from|about|and|or|nor|but|that|which|as|by|at|into|during|after|before|against|between|through|over|under|toward|towards|versus|via|within|without)\b)[a-z][a-z'’-]*\s+){0,2})the\s+(?=(?:Week|Lesson)\b)/g,
    '$1 $2',
  );
  // Article agreement at template joins: "a Energy decision" → "an Energy decision".
  // Require a content-length word so option letters stay untouched ("A is correct").
  // v0.16: a capital "A" mid-sentence is usually a NAME, not an article —
  // "pivot columns of A indicate independent columns" (matrix A in linear
  // algebra) shipped as "of An indicate…". Only sentence-initial "A" converts.
  text = text.replace(/\b(a|A)(\s+)([A-Za-z][a-z]{3,})/g, (match, article, gap, word, offset) => {
    if (!/^[aeiou]/i.test(word) || A_TO_AN_EXCEPTION_RE.test(word)) return match;
    if (article === 'A' && !isSentenceStart(text, offset)) return match;
    return `${article}n${gap}${word}`;
  });
  text = text.replace(/\b(an|An)(\s+)([A-Za-z][a-z]+)/g, (match, article, gap, word) => {
    if (/^[aeiouh]/i.test(word)) return match;
    return `${article === 'An' ? 'A' : 'a'}${gap}${word}`;
  });
  // Collapse runs of spaces introduced by the fixes above.
  text = text.replace(/ {2,}/g, ' ');
  return text;
}

function isSentenceStart(text, offset) {
  if (offset === 0) return true;
  return /[.!?:]\s+$|\n\s*$/.test(text.slice(Math.max(0, offset - 3), offset));
}

function firstStableTopicUnit(topic = '') {
  const text = String(topic || '').trim();
  // “Including …” commonly introduces examples, not the identity of the
  // lesson. Keeping the entire example list made every discussion and guide
  // repeat titles such as “theories of intelligence including general
  // intelligence and multiple intelligences.”
  const includingLead = (text.split(/\s+including\b/i)[0] || '').trim();
  const candidateSource = includingLead.length >= 8 && includingLead.length < text.length ? includingLead : text;
  const candidate = (candidateSource.split(/,|\band\b|[:—–]/i)[0] || '').trim();
  return /\b(?:and|or|for|of|to|with|in|on|from|against|between|through)$/i.test(candidate) ? '' : candidate;
}

function buildReferenceTargets(blueprint = {}) {
  const targets = [];
  const targetByPattern = new Map();
  const push = (target) => {
    if (target.pattern.length < 25) return;
    const key = target.pattern.toLowerCase();
    const existing = targetByPattern.get(key);
    if (existing) {
      // v0.14.1 (1.1): the same minted title arriving from a DIFFERENT
      // lesson means no single week number is right for course-level docs —
      // mark the surviving target multi-lesson so lesson-less scopes use
      // week-neutral phrasing instead of the first lesson's number.
      if (
        existing.replacement?.kind === ARTIFACT_REFERENCE_MARKER &&
        target.replacement?.kind === ARTIFACT_REFERENCE_MARKER &&
        existing.replacement.lessonNumber !== target.replacement.lessonNumber
      ) {
        existing.multiLesson = true;
      }
      return;
    }
    targetByPattern.set(key, target);
    targets.push(target);
  };
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  // Assessment records sometimes carry their own title/artifact phrasings
  // distinct from lesson.studentArtifact; cover both so cross-lesson
  // references ("carry into <next artifact>") shorten too.
  // v0.14.1 (3.3c): registry assessments key their targets on assessment
  // identity — registry titles are unique per assessment (one map atom each),
  // so the multi-lesson collision class of bug 1.1 disappears structurally
  // on the registry path. The week number still resolves at replacement time
  // (the Phase 1B mechanism); the id rides the replacement marker so two
  // different assessments arriving with the same text are detectably
  // distinct and fall back to week-neutral phrasing in course-level scopes.
  for (const assessment of Array.isArray(blueprint.assessments) ? blueprint.assessments : []) {
    const assessmentLesson = Array.isArray(assessment?.lessonNumbers) ? assessment.lessonNumbers[0] : 0;
    // v0.14.5 WS-D (D1): registry identity present → the noun comes from
    // registry kind + title head-noun; the 19-regex scan never runs. The
    // scan survives only for assessments without registry identity (legacy
    // blueprints) and as the counted fallback for a registry target whose
    // kind is missing/unrecognized.
    const hasRegistryIdentity = Boolean(assessment?.registryId);
    const registryNoun = hasRegistryIdentity ? registryArtifactNoun(assessment?.kind, assessment?.title) : '';
    for (const phrasing of [assessment?.title, assessment?.artifact]) {
      const text = String(phrasing || '')
        .trim()
        .replace(/[.!?]+$/, '');
      let artifactKind = registryNoun;
      if (!artifactKind && text) {
        if (hasRegistryIdentity) {
          // Re-scoped v0.14.3 C1 branch: the regex scan running DESPITE
          // registry identity. Zero on the registry path is the D1
          // regression net (tests/v0143-compiler-diet.test.js).
          recordLegacyPathHit(
            'finalizer-kind-inference',
            `registry-kind=${assessment?.kind || 'none'} pattern=${text}`,
          );
        }
        artifactKind = artifactKindOf(text);
      }
      push({
        pattern: text,
        replacement: {
          kind: ARTIFACT_REFERENCE_MARKER,
          artifactKind,
          lessonNumber: assessmentLesson,
          ...(hasRegistryIdentity ? { assessmentId: assessment.registryId } : {}),
        },
        startsWithArticle: true,
        keep: 2,
      });
    }
  }
  for (const lesson of lessons) {
    const lessonNumber = lesson?.lessonNumber || 0;
    const title = String(lesson?.title || '').trim();
    const topic = title.replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, '').trim();
    const artifact = String(lesson?.studentArtifact || '')
      .trim()
      .replace(/[.!?]+$/, '');
    push({
      pattern: artifact,
      replacement: { kind: ARTIFACT_REFERENCE_MARKER, artifactKind: artifactKindOf(artifact), lessonNumber },
      startsWithArticle: true,
      keep: 2,
    });
    // Shorten long lesson titles to the topic's first phrase unit (e.g.
    // "Climate Science" from "Climate Science, Justice Frameworks, and
    // Community Resilience Basics") so later mentions stay lesson-specific
    // instead of collapsing into a generic "Lesson N" that reads mechanical
    // and erases the per-lesson language the readiness gates look for.
    const firstTopicUnitCandidate = firstStableTopicUnit(topic);
    // A coordinating "and" is not always a safe phrase boundary. In titles
    // such as "Arguments for and against God", splitting on it leaves the
    // preposition "for" stranded and changes the topic's meaning. Fall back
    // to the complete short title when the candidate cannot stand alone.
    const firstTopicUnit = /\b(?:and|or|for|of|to|with|in|on|from|against|between|through)$/i.test(
      firstTopicUnitCandidate,
    )
      ? ''
      : firstTopicUnitCandidate;
    let topicShort;
    if (firstTopicUnit.length >= 8 && firstTopicUnit.length <= 42) {
      topicShort = firstTopicUnit;
    } else if (topic.length <= 48) {
      // Separator-less mid-length topics shorten to themselves: dropping the
      // "Lesson N: " prefix is still a win, and a "Lesson N" fallback would
      // erase the lesson-specific words quality gates look for.
      topicShort = topic;
    } else {
      const topicWords = topic.split(/\s+/).filter(Boolean);
      const initialLeadWords = topicWords.slice(0, 5);
      const trailingConnectorIndex = initialLeadWords.findLastIndex((word) =>
        /^(?:and|or|for|of|to|with|in|on|from|against|between|through)$/i.test(word),
      );
      // A five-word crop can turn a complete title such as “Data
      // visualization with matplotlib for policy audiences” into the
      // reader-visible fragment “... for”. When a connector lands near the
      // crop boundary, retain its short complement rather than amputating the
      // title at a mechanically convenient word count.
      const leadWordCount = trailingConnectorIndex >= 3 ? Math.min(topicWords.length, trailingConnectorIndex + 3) : 5;
      const leadWords = topicWords.slice(0, leadWordCount).join(' ');
      topicShort = leadWords.length >= 8 ? leadWords : `Lesson ${lessonNumber}`;
    }
    if (topic.length >= 25 && title.length > topic.length) {
      push({ pattern: title, replacement: topicShort, startsWithArticle: false, keep: 2 });
    }
    if (topic.length >= 40 && topicShort.toLowerCase() !== topic.toLowerCase()) {
      push({ pattern: topic, replacement: topicShort, startsWithArticle: false, keep: 2 });
    }
    // Source cues are inlined into nearly every template sentence; shorten the
    // long generated forms after their first mentions.
    for (const cue of [
      lesson?.evidencePlan?.sourceCue,
      ...(Array.isArray(lesson?.readings) ? lesson.readings.slice(0, 2) : []),
    ]) {
      const cueText = String(cue || '')
        .trim()
        .replace(/[.!?]+$/, '');
      if (/instructor-provided course materials|assigned readings, instructor notes/i.test(cueText)) {
        push({
          pattern: cueText,
          replacement: `the Lesson ${lessonNumber} materials`,
          startsWithArticle: true,
          keep: 1,
        });
      }
    }
    const evidencePacket = String(lesson?.throughlineCase?.evidencePacket || '')
      .trim()
      .replace(/[.!?]+$/, '');
    // v0.14.1 round-2 (fix 3): only MINTED packet descriptors ("<packet name>
    // for Lesson 5: <topic>") get the evidence-packet short reference. When
    // the v0.12.1 path picked a REAL reading as the packet, this target
    // rewrote every 3rd+ mention of that work's title — World Lit's "The
    // Thousand and One Nights" became "the Lesson 5 evidence packet" in topic
    // cells and success criteria. Real titles stay verbatim everywhere.
    if (/\bfor Lesson \d+\s*:|:\s*Lesson \d+\b/i.test(evidencePacket)) {
      push({
        pattern: evidencePacket,
        replacement: `the Lesson ${lessonNumber} evidence packet`,
        startsWithArticle: true,
        keep: 2,
      });
    }
    const projectName = String(lesson?.throughlineCase?.projectName || '').trim();
    // v0.14.1 (1.10): keep 0 — internal vocabulary like "Lab Evidence
    // Thread" must never survive into reader-facing text, so every mention
    // is replaced (keep: 1 used to let the first one through per document).
    push({
      pattern: projectName,
      replacement: 'the lesson materials',
      startsWithArticle: true,
      keep: 0,
    });
  }
  // Longest pattern first so "Lesson 1: Topic" wins over bare "Topic".
  targets.sort((a, b) => b.pattern.length - a.pattern.length);
  return targets.map((target) => ({
    ...target,
    // Trailing boundary: "…artifact 1" must not match inside "…artifact 10".
    regex: new RegExp(`(\\b(?:the|a|an)\\s+)?${escapeRegExp(target.pattern)}(?![A-Za-z0-9])`, 'gi'),
  }));
}

function replaceReferencesInString(value, targets, counts, contextLessonNumber = 0) {
  let text = value;
  for (const target of targets) {
    if (text.toLowerCase().indexOf(target.pattern.toLowerCase()) === -1) continue;
    // Exact-equal strings are headings/title fields; leave them whole.
    if (text.trim().toLowerCase() === target.pattern.toLowerCase()) continue;
    target.regex.lastIndex = 0;
    text = text.replace(target.regex, (match, article, offset, full) => {
      const used = counts.get(target.pattern) || 0;
      if (used < target.keep) {
        counts.set(target.pattern, used + 1);
        return match;
      }
      counts.set(target.pattern, used + 1);
      let replacement = resolveReplacement(target, contextLessonNumber);
      if (article) {
        if (target.startsWithArticle && /^the\s/i.test(replacement)) {
          return `${article}${replacement.replace(/^the\s+/i, '')}`;
        }
        // Topic-phrase replacements keep the original article ("the Climate
        // Science claim"); "Lesson N" labels drop it ("the Lesson 2" reads
        // wrong).
        if (!/^lesson\s/i.test(replacement)) {
          return `${article}${replacement}`;
        }
        return replacement;
      }
      // Mid-noun-phrase positions ("cite the exact <ref> item") already own
      // an article, so the replacement drops its leading "the".
      const before = full.slice(Math.max(0, offset - 24), offset);
      if (/\b(?:the|a|an)\s+\w+\s+$/i.test(before) && /^the\s/i.test(replacement)) {
        return replacement.replace(/^the\s+/i, '');
      }
      if (isSentenceStart(full, offset)) {
        replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return text;
}

const PROVENANCE_KEY_RE =
  /^(?:evidencePlan|sourceUsePlan|objectiveEvidencePlan|calibrationPlan|weightProvenance|gradingWeightProvenance)$/;

/**
 * True for subtrees the finalizer leaves byte-faithful to the blueprint
 * (provenance mirrors). Quality checks skip them for the same reason the
 * finalizer does: they never render and are compared verbatim by audits.
 */
export function isProvenanceMirrorKey(key) {
  return isInternalExportMetadataKey(key) || PROVENANCE_KEY_RE.test(String(key || ''));
}

function walkAndRewrite(node, rewrite, parentKey = '') {
  if (typeof node === 'string') return rewrite(node, parentKey);
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      node[index] = walkAndRewrite(node[index], rewrite, parentKey);
    }
    return node;
  }
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      // Provenance and grounding subtrees are compared byte-for-byte against
      // blueprint values by quality audits and never render in exports —
      // leave them completely untouched.
      if (isInternalExportMetadataKey(key) || PROVENANCE_KEY_RE.test(key)) continue;
      node[key] = walkAndRewrite(node[key], rewrite, key);
    }
    return node;
  }
  return node;
}

function preserveDraftingVocabulary(blueprint = {}) {
  const identity = [
    blueprint?.courseName,
    blueprint?.description,
    ...(Array.isArray(blueprint?.lessons) ? blueprint.lessons.map((lesson) => lesson?.title) : []),
  ]
    .filter(Boolean)
    .join(' ');
  return /\b(?:creative writing|fiction|poetry|screenwriting|playwriting|manuscript|writing workshop)\b/i.test(
    identity,
  );
}

function polishCompletionLanguage(value) {
  let text = String(value || '');
  // Outside courses where drafting is itself the discipline, present generated
  // materials as complete course work. The editing cycle still exists, but
  // learner-facing copy uses "work", "version", and "revision" rather than
  // repeatedly labeling the package unfinished.
  text = text
    .replace(/\bnext draft\b/gi, 'next revision')
    .replace(/\bfinal draft\b/gi, 'final submission')
    .replace(/\bdraft planning weights?\b/gi, 'proposed planning weights')
    .replace(/\bcompiler-distributed draft\b/gi, 'compiler-proposed')
    .replace(/\bdraft feedback\b/gi, 'revision feedback')
    .replace(/\bdraft detail\b/gi, 'artifact detail')
    .replace(/\bdraft section\b/gi, 'work-in-progress section')
    .replace(/\b(the Week \d+(?:\s+\w+)?) draft\b/gi, '$1 work')
    .replace(/\bthe draft\b/gi, 'the work')
    .replace(/\ba draft\b/gi, 'a working version')
    .replace(/\bdrafting\b/gi, 'developing')
    .replace(/\b(students|learners|teams|you) draft\b/gi, '$1 develop')
    .replace(/\bDraft (?=(?:the|a|an|one|your|this|each|Week\s+\d+|Lesson\s+\d+)\b)/g, 'Develop ')
    .replace(/\bdraft (?=(?:the|a|an|one|your|this|each|week\s+\d+|lesson\s+\d+)\b)/g, 'develop ');
  return text;
}

// v0.14.1 round-2 (fix 2): name/title fields render canonical identities —
// the geology syllabus grading table shipped "A1.1 — the Week 1 quiz" because
// the keep-count rewrote the NAME cell's registry title on its 3rd document
// mention. Registry titles in "id — title" renders must never shorten, so
// artifact-short-ref targets skip name/title keys entirely; topic-phrase
// shortenings and every other field (descriptions included) are unaffected.
const CANONICAL_NAME_KEY_RE = /^(?:name|title)$/i;

function targetsForKey(targets, key) {
  if (!CANONICAL_NAME_KEY_RE.test(key)) return targets;
  return targets.filter((target) => target.replacement?.kind !== ARTIFACT_REFERENCE_MARKER);
}

function rewriteScope(scope, targets, contextLessonNumber = 0) {
  const counts = new Map();
  walkAndRewrite(scope, (value, key) => {
    if (TITLE_LIKE_KEY_RE.test(key) || REPLACEMENT_EXEMPT_KEY_RE.test(key)) return fixMechanicalSeams(value);
    return fixMechanicalSeams(
      replaceReferencesInString(value, targetsForKey(targets, key), counts, contextLessonNumber),
    );
  });
}

// v0.14.1 (5.3): the compressed forms a speaker note's 3rd+ full lesson-title
// mention rotates through — alternating so a dense note never reads
// "this lesson … this lesson … this lesson".
const NOTE_TITLE_COMPRESSIONS = ['this lesson', "today's topic"];

/**
 * v0.14.1 (5.3): compiled speaker notes repeated the full lesson title 6-10×
 * per slide ("walls of mail-merge text" in the OUTPUT-V014 audit). The same
 * keep-count approach the reference machinery uses applies here, scoped to a
 * single note: the first 2 full-title mentions stay (per-lesson specificity
 * the readiness gates look for), later ones compress to a short alternating
 * form. Whole-mention matches only — word-bounded, so partial-word or
 * mid-phrase fragments are never compressed.
 */
function compressNoteLessonTitleMentions(note, lessonTitle) {
  const title = String(lessonTitle || '').trim();
  if (typeof note !== 'string' || title.length < 8) return note;
  const regex = new RegExp(`(\\b(?:the|a|an)\\s+)?\\b${escapeRegExp(title)}(?![A-Za-z0-9])`, 'gi');
  let seen = 0;
  return note.replace(regex, (match, article, offset, full) => {
    seen += 1;
    if (seen <= 2) return match;
    const compressed = NOTE_TITLE_COMPRESSIONS[(seen - 3) % NOTE_TITLE_COMPRESSIONS.length];
    // The article is consumed by the match ("the Lesson 2: Loops review" →
    // "this lesson review"); sentence starts re-capitalize.
    return isSentenceStart(full, offset) ? compressed.charAt(0).toUpperCase() + compressed.slice(1) : compressed;
  });
}

// Round-3 polish: study guides chant the lesson title — the live world-lit L4
// guide opened with FIVE full-title mentions in two paragraphs ("…checks on
// Tang Poetry and Lyrical Precision…", "Lesson 4: Tang Poetry and Lyrical
// Precision focuses on Tang Poetry and Lyrical Precision…"). The deck
// speaker-note compressor (5.3) extends to study-guide PROSE with a
// document-level budget: the first 2 full-title mentions stay, later ones
// compress to a short alternating form. Headings, key-term tables, and
// examScope/assessment-name fields stay exact — those surfaces are scanned
// by identity and readiness gates and must keep canonical wording.
function studyGuideTopicCompression(topic) {
  return firstStableTopicUnit(topic) || topic;
}
// Only the guide's OWN prose fields are compressed. Everything else is out of
// scope by construction:
//   - heading/scope surfaces (lessonTitle, examScope) and the key-term table
//     keep exact lesson/assessment wording for identity and readiness gates;
//   - blueprint-mirror subtrees (teachingIntent, prerequisitePlan,
//     modalityDecode, anchorExampleSet, learningTransferPlan, workedExample,
//     misconceptionMap-backed commonMisconceptions, …) are SHARED objects —
//     other deliverables embed the same references, so mutating them here
//     would rewrite lesson plans and slide decks at a distance.
const STUDY_GUIDE_COMPRESS_FIELDS = [
  'summary',
  'conceptConnections',
  'reviewQuestions',
  'practiceActivities',
  'studentResources',
  'examPrep',
  'reasoningRoutine',
];
// Inside those fields, canonical-name and topic-list keys stay exact.
const STUDY_GUIDE_COMPRESS_EXEMPT_KEY_RE = /^(?:keyTopicsToKnow|term|title|name|structure)$/i;

function walkStudyGuideProse(node, visit, parentKey = '') {
  if (typeof node === 'string') return visit(node, parentKey);
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      node[index] = walkStudyGuideProse(node[index], visit, parentKey);
    }
    return node;
  }
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      if (isInternalExportMetadataKey(key) || PROVENANCE_KEY_RE.test(key)) continue;
      if (STUDY_GUIDE_COMPRESS_EXEMPT_KEY_RE.test(key)) continue;
      node[key] = walkStudyGuideProse(node[key], visit, key);
    }
    return node;
  }
  return node;
}

function compressStudyGuideTitleMentions(guide) {
  const title = String(guide?.lessonTitle || '').trim();
  const topic = title.replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, '').trim();
  if (topic.length < 8) return;
  const topicCompression = studyGuideTopicCompression(topic);
  // "Lesson N: X focuses on X, …" — the sentence subject is the lesson title
  // and the first focus item repeats it verbatim; drop the redundant first
  // item (only when more items follow, so "focuses on" always keeps an
  // object).
  const echoRegex = new RegExp(
    `(\\b${escapeRegExp(topic)}\\b[^.!?\\n]{0,40}?focuses on )${escapeRegExp(topic)},\\s*`,
    'gi',
  );
  // Full-title mentions in prose: an optional determiner and an optional
  // "Lesson N:" prefix are consumed by the match so the compressed form
  // never yields "the this lesson".
  const mentionRegex = new RegExp(
    `(\\b(?:the|a|an|your|their|its|our)\\s+)?(?:Lesson\\s*\\d+\\s*[:.\\-–—]\\s*)?\\b${escapeRegExp(topic)}(?![A-Za-z0-9])`,
    'gi',
  );
  let seen = 0;
  const compressString = (value) => {
    let text = value.replace(echoRegex, '$1');
    text = text.replace(mentionRegex, (match, determiner, offset, full) => {
      seen += 1;
      if (seen <= 2) return match;
      let compressed = topicCompression;
      // Possessive determiners read as the lesson's own attribute:
      // "self-check your <title> evidence" → "self-check this lesson's
      // evidence" (plain articles are simply consumed, as in 5.3).
      if (determiner && /^(?:your|their|its|our)\s+$/i.test(determiner)) {
        compressed = /s$/i.test(compressed) ? `${compressed}'` : `${compressed}'s`;
      }
      return isSentenceStart(full, offset) ? compressed.charAt(0).toUpperCase() + compressed.slice(1) : compressed;
    });
    return text;
  };
  for (const field of STUDY_GUIDE_COMPRESS_FIELDS) {
    if (guide[field] === undefined) continue;
    guide[field] = walkStudyGuideProse(guide[field], compressString, field);
  }
}

function rewriteStudyGuideScope(guide, targets, contextLessonNumber = 0) {
  rewriteScope(guide, targets, contextLessonNumber);
  compressStudyGuideTitleMentions(guide);
  // Title compression can itself create an adjacent echo when a compact
  // topic meets the next named concept (for example, "Family and Family
  // Members Vocabulary"). Keep mechanical cleanup at the true final
  // reader-visible boundary rather than assuming earlier passes stay final.
  walkAndRewrite(guide, (value) => fixMechanicalSeams(value));
}

const DUPLICATE_SLIDE_TITLE_PURPOSES = {
  agenda: 'session roadmap',
  objectives: 'learning targets',
  bridge: 'concept bridge',
  content: 'guided analysis',
  activity: 'guided practice',
  discussion: 'discussion',
  example: 'worked example',
  keyterm: 'key concept',
  summary: 'synthesis',
  closing: 'transfer check',
};

export function dedupeDeckSlideTitles(deck) {
  const slides = Array.isArray(deck?.slides) ? deck.slides : [];
  const used = new Set();
  let changed = false;
  for (const slide of slides) {
    const title = String(slide?.title || '').trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      continue;
    }
    const purpose = DUPLICATE_SLIDE_TITLE_PURPOSES[String(slide?.type || '').toLowerCase()] || 'next step';
    const evidenceTitle = /\bevidence\s+(?:check|review|audit)\b/i.test(title);
    const stem = evidenceTitle ? `Evidence ${purpose}` : `${title} — ${purpose}`;
    let candidate = stem;
    let ordinal = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${stem} ${ordinal}`;
      ordinal += 1;
    }
    slide.title = candidate;
    changed = true;
    used.add(candidate.toLowerCase());
  }
  return changed;
}

function rewriteDeckScope(deck, targets, contextLessonNumber = 0) {
  // Slide surfaces (titles, subtitles, bullets) carry the projection-space
  // cost of long titles, so they get short references. Deck-internal
  // pedagogy fields — speaker notes, alt text, readiness cues, homework —
  // keep exact artifact and lesson names: presenters and screen readers
  // want precision there, and the classroom-readiness boilerplate gate
  // reads those fields for lesson-specific guidance. Exception (5.3): a
  // note's 3rd+ full lesson-title mention compresses — two exact mentions
  // per note keep the specificity, the rest was repetition.
  const counts = new Map();
  const rewriteText = (value) =>
    typeof value === 'string'
      ? fixMechanicalSeams(replaceReferencesInString(value, targets, counts, contextLessonNumber))
      : value;
  for (const slide of Array.isArray(deck?.slides) ? deck.slides : []) {
    if (typeof slide.title === 'string') slide.title = rewriteText(slide.title);
    if (typeof slide.subtitle === 'string') slide.subtitle = rewriteText(slide.subtitle);
    if (Array.isArray(slide.bullets)) slide.bullets = slide.bullets.map((bullet) => rewriteText(bullet));
    if (typeof slide.notes === 'string') {
      slide.notes = compressNoteLessonTitleMentions(slide.notes, deck?.lessonTitle);
    }
  }
  // Reference shortening and content repair can collapse independently
  // authored titles onto the same final wording. Resolve that at the last
  // deck-local boundary so the exported PPTX never carries duplicate title
  // identities even when upstream atoms were distinct.
  dedupeDeckSlideTitles(deck);
  walkAndRewrite(deck, (value) => fixMechanicalSeams(value));
}

// The lesson a per-lesson document item belongs to, read from the item's own
// fields (full and compact key forms). 0 means "no enclosing lesson" —
// course-level scopes like the syllabus residue.
const ITEM_LESSON_NUMBER_KEYS = ['lessonNumber', 'ln', 'weekNumber', 'wk'];
const ITEM_LESSON_TEXT_KEYS = ['lessonTitle', 'lt', 'title', 't'];

function itemLessonNumberOf(item) {
  if (!item || typeof item !== 'object') return 0;
  for (const key of ITEM_LESSON_NUMBER_KEYS) {
    const value = Number(item[key]);
    if (Number.isInteger(value) && value > 0) return value;
  }
  for (const key of ITEM_LESSON_TEXT_KEYS) {
    const match = String(item[key] || '').match(/\b(?:lesson|week|module|session)\s*(\d{1,3})\b/i);
    if (match) return Number(match[1]);
  }
  return 0;
}

/**
 * Finalize the language of one compiled deliverable in place.
 * Scopes the repetition budget per lesson item (elements of root-level arrays)
 * so each document keeps its first full-title mentions and shortens the rest.
 */
// ── v0.14.7.1: lesson-title mention budget ──────────────────────────────────
// A long lesson title ("Crisis and Conservatism in the Late 20th Century")
// repeated by every templated field of every brief in its lesson hit the
// export audit's 12-per-section shingle limit live (4-5 briefs/lesson × 2-3
// mentions). Within ONE item, the full title may appear at most twice; later
// mentions become "this lesson" — which is also just better prose. Only
// LONG titles (≥4 words) are budgeted: short ones can't form an 8-word
// shingle and repeat naturally. Identity fields are never touched.
const TITLE_MENTION_FEATURES = new Set(['assignments', 'discussions']);
const TITLE_MENTION_BUDGET = 2;
const TITLE_MENTION_SKIP_KEYS = new Set([
  'title',
  'lessonTitle',
  'assessmentTitle',
  'assignmentTitle',
  'rubricTitle',
  'registryId',
  'assessmentId',
  'id',
  'name',
  // Identity REFERENCES keep the full title by design — and must not eat
  // the prose budget slots.
  'relatedLessons',
  'courseMapRef',
]);

function capLessonTitleMentions(featureId, data, blueprint) {
  if (!TITLE_MENTION_FEATURES.has(featureId)) return;
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const focusByNumber = new Map();
  const fullTitleByNumber = new Map();
  lessons.forEach((lesson, index) => {
    const fullTitle = String(lesson?.title || '').trim();
    const focus = fullTitle.replace(/^lesson\s*\d+\s*[:.\-\u2013\u2014]\s*/i, '').trim();
    if (focus.split(/\s+/).filter(Boolean).length >= 4) {
      focusByNumber.set(index + 1, focus);
      if (fullTitle.toLowerCase() !== focus.toLowerCase()) fullTitleByNumber.set(index + 1, fullTitle);
    }
  });
  if (focusByNumber.size === 0) return;
  // v0.15.187 (live crucible P1): identity spans are never compressed. The
  // cap once rewrote the focus INSIDE full-title and registry-title
  // occurrences — "Lesson 10: file input and output" became "Lesson 10: the
  // lesson" and "Autograded quiz: file input and output criterion" became
  // "Autograded quiz: the lesson criterion" — a generic placeholder in
  // student-facing wording. Registry titles are verbatim by contract, so any
  // occurrence of a full lesson title or an assessment-registry title is
  // masked before capping and restored after (and never eats a budget slot,
  // matching TITLE_MENTION_SKIP_KEYS' identity rule).
  const registryTitles = [
    ...(Array.isArray(blueprint?.assessmentRegistry) ? blueprint.assessmentRegistry : []),
    ...(Array.isArray(blueprint?.assessments) ? blueprint.assessments : []),
    ...(Array.isArray(blueprint?.readingsRegistry) ? blueprint.readingsRegistry : []),
  ]
    .map((entry) => String(entry?.title || '').trim())
    .filter(Boolean);
  const items = renderedDeliverableCollection(featureId, data);
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const lessonNumber = itemLessonNumberOf(item);
    const focus = focusByNumber.get(lessonNumber);
    if (!focus) continue;
    const identitySpans = [
      fullTitleByNumber.get(lessonNumber) || '',
      ...registryTitles.filter((title) => title.toLowerCase().includes(focus.toLowerCase())),
    ].filter(Boolean);
    // TOP-LEVEL string fields only: compiled items share nested structures
    // (evidence plans, grounding traces) across features — recursing into
    // them once leaked "this lesson" into Lesson Plans that were never a
    // target. Top-level fields are the item's own prose and the only text
    // the section renderers stamp repeatedly.
    const regex = new RegExp(`\\b${escapeRegExp(focus)}(?![A-Za-z0-9])`, 'gi');
    let used = 0;
    for (const [key, fieldValue] of Object.entries(item)) {
      if (typeof fieldValue !== 'string' || TITLE_MENTION_SKIP_KEYS.has(key)) continue;
      const masked = [];
      let working = fieldValue;
      for (const span of identitySpans) {
        const spanRegex = new RegExp(escapeRegExp(span), 'gi');
        working = working.replace(spanRegex, (match) => {
          masked.push(match);
          return `\u0000${masked.length - 1}\u0000`;
        });
      }
      working = working.replace(regex, (match, offset, whole) => {
        used += 1;
        if (used <= TITLE_MENTION_BUDGET) return match;
        const before = whole.slice(0, offset);
        // Position-aware compression so every capped mention stays
        // grammatical: sentence subjects become "This lesson", positions
        // already inside a determiner phrase ("the revised <Title>
        // evidence") become bare "lesson", everything else takes
        // "the lesson".
        if (offset === 0 || /[.!?]\s+$|\n\s*$/.test(before)) return 'This lesson';
        if (/\b(?:the|a|an|your|their|its|our|this|each|every)\b[^.!?\n]{0,24}$/i.test(before)) return 'lesson';
        return 'the lesson';
      });
      item[key] = masked.length
        ? working.replace(/\u0000(\d+)\u0000/g, (_, maskIndex) => masked[Number(maskIndex)])
        : working;
    }
  }
}

export function finalizeCompiledDeliverableLanguage(featureId, data, blueprint = {}) {
  if (!data || typeof data !== 'object') return data;
  const content = renderedDeliverableContentRoot(featureId, data);

  const targets = buildReferenceTargets(blueprint);
  if (targets.length === 0) {
    walkAndRewrite(content, (value) => fixMechanicalSeams(value));
    if (featureId === 'slideDecks') {
      for (const deck of renderedDeliverableCollection(featureId, data)) dedupeDeckSlideTitles(deck);
    }
    if (!preserveDraftingVocabulary(blueprint)) {
      walkAndRewrite(content, (value) => polishCompletionLanguage(value));
    }
    capLessonTitleMentions(featureId, data, blueprint);
    return data;
  }
  const rewriteItem =
    featureId === 'slideDecks' ? rewriteDeckScope : featureId === 'studyGuides' ? rewriteStudyGuideScope : rewriteScope;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === 'object') rewriteItem(item, targets, itemLessonNumberOf(item));
    }
  } else if (content && typeof content === 'object') {
    rewriteScope(content, targets, 0);
  }
  capLessonTitleMentions(featureId, data, blueprint);
  if (!preserveDraftingVocabulary(blueprint)) {
    walkAndRewrite(content, (value) => polishCompletionLanguage(value));
  }
  return data;
}
