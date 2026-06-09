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

const TITLE_LIKE_KEY_RE =
  /^(?:id|key|slug|tags|anchor|sourceColumns|relatedLessons|lessonNumbers|format|type|category|difficulty|bloomsLevel|weight|points)$/i;
// Speaker notes are presenter-facing: keep exact artifact names there so the
// instructor reads the precise deliverable being coached, and so per-lesson
// specificity stays visible to the classroom-readiness boilerplate gate.
const REPLACEMENT_EXEMPT_KEY_RE = /^(?:notes|speakerNotes|instructorNotes)$/i;

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

export function shortArtifactReference(artifactTitle = '', lessonNumber = 0) {
  const text = String(artifactTitle).toLowerCase();
  const week = lessonNumber > 0 ? `Week ${lessonNumber}` : 'weekly';
  for (const [pattern, kind] of ARTIFACT_KIND_PATTERNS) {
    if (pattern.test(text)) {
      if (kind === 'discussion-and-quiz') return `the ${week} discussion and quiz`;
      return `the ${week} ${kind}`;
    }
  }
  return `the ${week} artifact`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const A_TO_AN_EXCEPTION_RE =
  /^(?:one(?:s|-)?|once|uni[a-z]*|usab[a-z]*|usag[a-z]*|use[a-z]*|usual[a-z]*|euro[a-z]*|ufo[a-z]*|utens[a-z]*)$/i;

function fixMechanicalSeams(value) {
  let text = value;
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
  const seenPatterns = new Set();
  const push = (target) => {
    const key = target.pattern.toLowerCase();
    if (target.pattern.length < 25 || seenPatterns.has(key)) return;
    seenPatterns.add(key);
    targets.push(target);
  };
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  for (const lesson of lessons) {
    const lessonNumber = lesson?.lessonNumber || 0;
    const title = String(lesson?.title || '').trim();
    const topic = title.replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, '').trim();
    const artifact = String(lesson?.studentArtifact || '')
      .trim()
      .replace(/[.!?]+$/, '');
    push({
      pattern: artifact,
      replacement: shortArtifactReference(artifact, lessonNumber),
      startsWithArticle: true,
      keep: 2,
    });
    // Shorten long lesson titles to the topic's first phrase unit (e.g.
    // "Climate Science" from "Climate Science, Justice Frameworks, and
    // Community Resilience Basics") so later mentions stay lesson-specific
    // instead of collapsing into a generic "Lesson N" that reads mechanical
    // and erases the per-lesson language the readiness gates look for.
    const firstTopicUnit = (topic.split(/,|\band\b|[:—–]/i)[0] || '').trim();
    const topicShort =
      firstTopicUnit.length >= 8 && firstTopicUnit.length < topic.length && firstTopicUnit.length <= 42
        ? firstTopicUnit
        : `Lesson ${lessonNumber}`;
    if (topic.length >= 25 && title.length > topic.length) {
      push({ pattern: title, replacement: topicShort, startsWithArticle: false, keep: 2 });
    }
    if (topic.length >= 40) {
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
    push({
      pattern: evidencePacket,
      replacement: `the Lesson ${lessonNumber} evidence packet`,
      startsWithArticle: true,
      keep: 2,
    });
    const projectName = String(lesson?.throughlineCase?.projectName || '').trim();
    push({
      pattern: projectName,
      replacement: 'the course evidence thread',
      startsWithArticle: true,
      keep: 1,
    });
  }
  // Longest pattern first so "Lesson 1: Topic" wins over bare "Topic".
  targets.sort((a, b) => b.pattern.length - a.pattern.length);
  return targets.map((target) => ({
    ...target,
    regex: new RegExp(`(\\b(?:the|a|an)\\s+)?${escapeRegExp(target.pattern)}`, 'gi'),
  }));
}

function replaceReferencesInString(value, targets, counts) {
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
      let replacement = target.replacement;
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
      node[key] = walkAndRewrite(node[key], rewrite, key);
    }
    return node;
  }
  return node;
}

function rewriteScope(scope, targets) {
  const counts = new Map();
  walkAndRewrite(scope, (value, key) => {
    if (TITLE_LIKE_KEY_RE.test(key) || REPLACEMENT_EXEMPT_KEY_RE.test(key)) return fixMechanicalSeams(value);
    return fixMechanicalSeams(replaceReferencesInString(value, targets, counts));
  });
}

function rewriteDeckScope(deck, targets) {
  // Slide surfaces (titles, subtitles, bullets) carry the projection-space
  // cost of long titles, so they get short references. Deck-internal
  // pedagogy fields — speaker notes, alt text, readiness cues, homework —
  // keep exact artifact and lesson names: presenters and screen readers
  // want precision there, and the classroom-readiness boilerplate gate
  // reads those fields for lesson-specific guidance.
  const counts = new Map();
  const rewriteText = (value) =>
    typeof value === 'string' ? fixMechanicalSeams(replaceReferencesInString(value, targets, counts)) : value;
  for (const slide of Array.isArray(deck?.slides) ? deck.slides : []) {
    if (typeof slide.title === 'string') slide.title = rewriteText(slide.title);
    if (typeof slide.subtitle === 'string') slide.subtitle = rewriteText(slide.subtitle);
    if (Array.isArray(slide.bullets)) slide.bullets = slide.bullets.map((bullet) => rewriteText(bullet));
  }
  walkAndRewrite(deck, (value) => fixMechanicalSeams(value));
}

/**
 * Finalize the language of one compiled deliverable in place.
 * Scopes the repetition budget per lesson item (elements of root-level arrays)
 * so each document keeps its first full-title mentions and shortens the rest.
 */
export function finalizeCompiledDeliverableLanguage(featureId, data, blueprint = {}) {
  if (!data || typeof data !== 'object') return data;
  const targets = buildReferenceTargets(blueprint);
  if (targets.length === 0) {
    walkAndRewrite(data, (value) => fixMechanicalSeams(value));
    return data;
  }
  const rewriteItem = featureId === 'slideDecks' ? rewriteDeckScope : rewriteScope;
  const rootResidue = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.every((item) => item && typeof item === 'object')) {
      for (const item of value) rewriteItem(item, targets);
    } else {
      rootResidue[key] = value;
    }
  }
  rewriteScope(rootResidue, targets);
  for (const [key, value] of Object.entries(rootResidue)) {
    data[key] = value;
  }
  return data;
}
