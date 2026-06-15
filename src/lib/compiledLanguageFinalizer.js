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

const TITLE_LIKE_KEY_RE =
  /^(?:id|key|slug|tags|anchor|sourceColumns|relatedLessons|lessonNumbers|format|type|category|difficulty|bloomsLevel|weight|points)$/i;
// Speaker notes are presenter-facing: keep exact artifact names there so the
// instructor reads the precise deliverable being coached, and so per-lesson
// specificity stays visible to the classroom-readiness boilerplate gate.
// Review/trust surfaces also stay exact: a "spot-check X for <lesson>" line
// must keep its lesson-specific wording or readiness gates (rightly) flag it
// as generic guidance.
const REPLACEMENT_EXEMPT_KEY_RE =
  /^(?:notes|speakerNotes|instructorNotes|localReviewAction|reviewerAction|reviewFocus|localConfirmationCue|localReviewNeeded)$/i;

const ARTIFACT_KIND_PATTERNS = [
  [/\bdiscussion\b.*\bquiz\b|\bquiz\b.*\bdiscussion\b/, 'discussion-and-quiz'],
  [/\bdiscussion post\b|\bdiscussion\b/, 'discussion post'],
  [/\bquiz\b/, 'quiz'],
  [/\bcheck for understanding\b|\blow-stakes check\b|\bcheck-in\b|\bcheck\b/, 'check'],
  [/\bmemo\b/, 'memo'],
  [/\bpresentation\b/, 'presentation'],
  [/\bportfolio\b/, 'portfolio'],
  [/\bexam\b|\bmidterm\b|\bfinal test\b/, 'exam'],
  [/\bessay\b|\bpaper\b/, 'paper'],
  [/\bnotebook\b|\blab\b|\bworksheet\b/, 'lab work'],
  [/\brecording\b/, 'recording'],
  [/\bperformance\b|\brehearsal\b/, 'performance'],
  [/\breflection\b/, 'reflection'],
  [/\bproject\b/, 'project'],
  [/\baction plan\b|\bplan\b/, 'plan'],
  [/\bbrief\b/, 'brief'],
  [/\breport\b/, 'report'],
  [/\bmap\b/, 'mapping work'],
  [/\banalysis\b/, 'analysis'],
];

function artifactKindOf(artifactTitle = '') {
  const text = String(artifactTitle).toLowerCase();
  for (const [pattern, kind] of ARTIFACT_KIND_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return 'artifact';
}

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
// pre-colon label like "Week 3" must never yield "the Week 3 week".
const HEAD_NOUN_BLOCKLIST_RE = /^(?:week|lesson|session|module|unit|part|day)$/;

// Head noun of a label: the last word, trailing numerals stripped
// ("Lab Practical 2" → 'practical'); empty when the word is too short or
// names a schedule slot instead of a genre.
function titleHeadNoun(label) {
  const match = String(label || '')
    .replace(/[\s\d.)#-]+$/g, '')
    .match(/[A-Za-z][A-Za-z'-]*$/);
  const head = match ? match[0].toLowerCase() : '';
  if (head.length < 3 || HEAD_NOUN_BLOCKLIST_RE.test(head)) return '';
  return head;
}

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

function shortReferenceForKind(kind, lessonNumber = 0) {
  const week = lessonNumber > 0 ? `Week ${lessonNumber}` : 'weekly';
  if (kind === 'discussion-and-quiz') return `the ${week} discussion and quiz`;
  return `the ${week} ${kind || 'artifact'}`;
}

export function shortArtifactReference(artifactTitle = '', lessonNumber = 0) {
  return shortReferenceForKind(artifactKindOf(artifactTitle), lessonNumber);
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
  return shortReferenceForKind(replacement.artifactKind, lessonNumber);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const A_TO_AN_EXCEPTION_RE =
  /^(?:one(?:s|-)?|once|uni[a-z]*|usab[a-z]*|usag[a-z]*|use[a-z]*|usual[a-z]*|euro[a-z]*|ufo[a-z]*|utens[a-z]*)$/i;

// v0.14.1 round-2 (fix 5): 1-3 char code tokens that are ALSO common English
// words. A bare strip of `and`/`or` produced the unreadable "combine tests
// with and or" on a live CS slide — these wrap in single quotes instead.
const SHORT_CODE_WORD_RE = /^(?:a|an|and|or|not|in|is|if|as|for|on|at|to|by|of|do|no|the|all|any)$/i;

function fixMechanicalSeams(value) {
  let text = value;
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
  // Space before punctuation.
  text = text.replace(/[ \t]+([.,;:!?])(?=\s|$)/g, '$1');
  // Doubled connectives produced by reference replacement ("the the Week 2 check").
  text = text.replace(/\b(the|a|an|to|of|for|and|or|in|on|with|at|by)\s+\1\b/gi, '$1');
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
  // Article agreement at template joins: "a Energy decision" → "an Energy decision".
  // Require a content-length word so option letters stay untouched ("A is correct").
  text = text.replace(/\b(a|A)(\s+)([A-Za-z][a-z]{3,})/g, (match, article, gap, word) => {
    if (!/^[aeiou]/i.test(word) || A_TO_AN_EXCEPTION_RE.test(word)) return match;
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
    const firstTopicUnit = (topic.split(/,|\band\b|[:—–]/i)[0] || '').trim();
    let topicShort;
    if (firstTopicUnit.length >= 8 && firstTopicUnit.length <= 42) {
      topicShort = firstTopicUnit;
    } else if (topic.length <= 48) {
      // Separator-less mid-length topics shorten to themselves: dropping the
      // "Lesson N: " prefix is still a win, and a "Lesson N" fallback would
      // erase the lesson-specific words quality gates look for.
      topicShort = topic;
    } else {
      const leadWords = topic.split(/\s+/).slice(0, 5).join(' ');
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
      replacement: 'the lesson evidence thread',
      startsWithArticle: true,
      keep: 0,
    });
  }
  // Longest pattern first so "Lesson 1: Topic" wins over bare "Topic".
  targets.sort((a, b) => b.pattern.length - a.pattern.length);
  return targets.map((target) => ({
    ...target,
    regex: new RegExp(`(\\b(?:the|a|an)\\s+)?${escapeRegExp(target.pattern)}`, 'gi'),
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
  const units = String(topic || '')
    .split(/,|\band\b|[:—–]/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
  return units[0] || topic;
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
      if (determiner && /^(?:your|their|its|our)\s+$/i.test(determiner)) compressed = `${compressed}'s`;
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
  lessons.forEach((lesson, index) => {
    const focus = String(lesson?.title || '')
      .replace(/^lesson\s*\d+\s*[:.\-\u2013\u2014]\s*/i, '')
      .trim();
    if (focus.split(/\s+/).filter(Boolean).length >= 4) {
      focusByNumber.set(index + 1, focus);
    }
  });
  if (focusByNumber.size === 0) return;
  for (const value of Object.values(data)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const focus = focusByNumber.get(itemLessonNumberOf(item));
      if (!focus) continue;
      // TOP-LEVEL string fields only: compiled items share nested structures
      // (evidence plans, grounding traces) across features — recursing into
      // them once leaked "this lesson" into Lesson Plans that were never a
      // target. Top-level fields are the item's own prose and the only text
      // the section renderers stamp repeatedly.
      const regex = new RegExp(`\\b${escapeRegExp(focus)}(?![A-Za-z0-9])`, 'gi');
      let used = 0;
      for (const [key, fieldValue] of Object.entries(item)) {
        if (typeof fieldValue !== 'string' || TITLE_MENTION_SKIP_KEYS.has(key)) continue;
        item[key] = fieldValue.replace(regex, (match, offset, whole) => {
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
      }
    }
  }
}

export function finalizeCompiledDeliverableLanguage(featureId, data, blueprint = {}) {
  if (!data || typeof data !== 'object') return data;
  const targets = buildReferenceTargets(blueprint);
  if (targets.length === 0) {
    walkAndRewrite(data, (value) => fixMechanicalSeams(value));
    capLessonTitleMentions(featureId, data, blueprint);
    return data;
  }
  const rewriteItem =
    featureId === 'slideDecks' ? rewriteDeckScope : featureId === 'studyGuides' ? rewriteStudyGuideScope : rewriteScope;
  const rootResidue = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.every((item) => item && typeof item === 'object')) {
      for (const item of value) rewriteItem(item, targets, itemLessonNumberOf(item));
    } else {
      rootResidue[key] = value;
    }
  }
  rewriteScope(rootResidue, targets, 0);
  for (const [key, value] of Object.entries(rootResidue)) {
    data[key] = value;
  }
  capLessonTitleMentions(featureId, data, blueprint);
  return data;
}
