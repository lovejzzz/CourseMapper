// Algi V0 composer — answers the pipeline's typed requests from the uploaded
// source instead of from model weights.
//
// The generation pipeline funnels every model request through one call site and
// only ever consumes the returned TEXT, so a composed response is
// indistinguishable downstream from a sampled one. Everything after this
// module — skeleton admission, the genome linker, the compiler, the grader, the
// exporters — runs exactly as it does for Scion.
//
// Scope, stated honestly: Algi V0 composes the Pass A course skeleton. It does
// not author new subject knowledge. Lessons are grounded by the genome linker
// downstream (the same linker Scion relies on), and any request this module
// cannot answer from the source is declined so the compiler's deterministic
// path owns it rather than a fabricated payload.
import { extractExplicitCoverageTopics, extractExplicitLessonSequence } from './explicitLessonSequence';
import { ALGI_RESEARCH_FLAG, readAlgiResearchEnabled } from './algiResearchPolicy';

export { ALGI_RESEARCH_FLAG } from './algiResearchPolicy';

// The skeleton contract caps titles at 60 chars and section titles at 60.
const MAX_TITLE = 60;
const MAX_SECTION = 60;
const MAX_COURSE_NAME = 120;
const MIN_TITLE = 5;

/** Tasks Algi answers itself; anything else defers to the compiler. */
export const ALGI_COMPOSED_TASKS = new Set(['nativeSkeleton', 'blueprintEnrichment']);

/** Facts-per-lesson the batch contract pins, read from the declared schema. */
export function factCountFromSchema(schema) {
  const facts = schema?.schema?.properties?.lessons?.items?.properties?.facts;
  return Number(facts?.minItems) || 5;
}

function clamp(text, max, min = 0) {
  const value = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length <= max) return value.length >= min ? value : '';
  // Cut on a word boundary so a truncated title still reads as a phrase.
  const cut = value.slice(0, max);
  const spaced = cut.slice(0, cut.lastIndexOf(' '));
  const chosen = spaced.length >= Math.floor(max * 0.6) ? spaced : cut;
  return chosen.length >= min ? chosen : '';
}

function titleCase(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  return (value.charAt(0).toUpperCase() + value.slice(1)).replace(
    /\b(?:ai|api|ar|css|html|llm|lms|ml|sql|ui|ux|vr|wcag)\b/gi,
    (word) => word.toUpperCase(),
  );
}

/** Recover the raw source the prompt builder embedded after its instructions. */
export function extractSourceFromPrompt(userPrompt) {
  const text = String(userPrompt || '');
  const marker = text.indexOf('SOURCE MATERIALS:');
  if (marker === -1) return text;
  const tail = text.slice(marker + 'SOURCE MATERIALS:'.length);
  return tail.replace(/\n*Return ONLY the skeleton JSON object now:\s*$/i, '').trim();
}

/** Session count the contract pins, read from the prompt's own instruction. */
export function extractExpectedSessions(userPrompt) {
  const text = String(userPrompt || '');
  const exact = /exactly (\d+) sessions/i.exec(text);
  if (exact) return Number(exact[1]);
  const about = /around (\d+) sessions/i.exec(text);
  if (about) return Number(about[1]);
  return null;
}

/** Course name from an explicit title line, else the first substantial line. */
export function extractCourseName(source) {
  const lines = String(source || '')
    .split('\n')
    .map((line) => line.replace(/^[#\s>*-]+/, '').trim())
    .filter(Boolean);
  const labelled = lines.find((line) => /^(course|title)\s*[:\-—]/i.test(line));
  if (labelled) {
    const value = clamp(labelled.replace(/^(course|title)\s*[:\-—]\s*/i, ''), MAX_COURSE_NAME, 3);
    if (value) return value;
  }
  const describedCourse = lines.find((line) =>
    /^(?:(?:beginner|introductory|intermediate|advanced|undergraduate|graduate|doctoral|professional)\s+){0,4}(?:course|class|seminar|studio|workshop)\s*[:\-—]/i.test(
      line,
    ),
  );
  if (describedCourse) {
    const descriptionPrefix =
      /^(?:(?:beginner|introductory|intermediate|advanced|undergraduate|graduate|doctoral|professional)\s+){0,4}(?:course|class|seminar|studio|workshop)\s*[:\-—]\s*/i;
    const candidate = describedCourse
      .replace(descriptionPrefix, '')
      .split(/\.\s+(?=(?:use|include|generate|create|build|compose|design|make|produce)\b)/i)[0]
      .trim();
    const value = clamp(candidate, MAX_COURSE_NAME, 3);
    if (value) return value;
  }
  for (const line of lines) {
    if (/^(week|lesson|session|unit|module)\b/i.test(line)) break;
    const briefDivider =
      /\s+[—–-]\s+(?=(?:an?\s+)?(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})[- ]lesson\s+)?(?:\w+[- ]division\s+)?(?:course|class|seminar|studio)\b)/i.exec(
        line,
      );
    const briefSuffix =
      /\s*,?\s+(?=(?:an?\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})[- ]lesson\b)/i.exec(
        line,
      );
    const exactLessonSuffix =
      /\s*,?\s+(?=exactly\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\s+lessons?\b)/i.exec(
        line,
      );
    const timedBriefSuffix =
      /\s*,?\s+(?=(?:an?\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})[- ]week\b[^,.;]{0,32}\b(?:course|class|seminar|studio|workshop)\b)/i.exec(
        line,
      );
    const timedBriefDivider =
      /\s+[—–-]\s+(?=(?:an?\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})[- ]week\b[^,.;]{0,48}\b(?:course|class|seminar|studio|workshop)\b)/i.exec(
        line,
      );
    const commandDivider = /\s+[—–-]\s+(?=(?:build|compose|create|design|generate|make|produce)\b)/i.exec(line);
    const splitAt =
      briefDivider?.index ??
      timedBriefDivider?.index ??
      commandDivider?.index ??
      exactLessonSuffix?.index ??
      briefSuffix?.index ??
      timedBriefSuffix?.index ??
      -1;
    const candidate = splitAt > 0 ? line.slice(0, splitAt) : line;
    const value = clamp(candidate, MAX_COURSE_NAME, 3);
    if (value && value.split(' ').length >= 2) return value;
  }
  return 'Course';
}

// Section titles are the two-to-four beats a session is taught in. The compiler
// owns pedagogy; this only has to name the beats distinctly enough that the
// contract admits them and the linker can attach concepts.
const SECTION_SHAPES = [
  (topic) => `${topic} foundations`,
  (topic) => `${topic} mechanisms`,
  (topic) => `${topic} practice`,
  (topic) => `${topic} limits`,
];

function sectionTitlesFor(topic, order) {
  // The longest suffix is twelve characters (" foundations"), leaving the
  // rest of the schema for the actual subject. Noun phrases travel cleanly
  // through objectives, resources, rubrics, and activity directions; question
  // frames such as "What X is" became awkward after projection ("Use What X
  // is") even though the standalone heading was grammatical.
  // The old 34-character cap turned "information architecture and interaction
  // flows" into the broken phrase "How information architecture and works".
  const subject =
    clamp(topic, MAX_SECTION - 12, 1)
      .replace(/\b(?:and|or|of|with|for|to)$/i, '')
      .trim() || 'the topic';
  // Lowercase ordinary sentence starts ("Privacy regulation" → "privacy
  // regulation") without corrupting initialisms ("AI governance" must never
  // become the visibly broken "aI governance").
  const lowered = /^[A-Z]{2}(?:\b|[A-Z])/.test(subject) ? subject : subject.charAt(0).toLowerCase() + subject.slice(1);
  // Rotate the opening beat so consecutive sessions do not share a frame — the
  // repetition defect the texture metric measures starts here.
  const rotation = order % SECTION_SHAPES.length;
  const shapes = [...SECTION_SHAPES.slice(rotation), ...SECTION_SHAPES.slice(0, rotation)];
  const titles = shapes
    .slice(0, 3)
    .map((shape) => clamp(shape(subject), MAX_SECTION, 3))
    .filter(Boolean);
  return titles.length >= 2 ? titles : [`Core ideas`, `Working with ${lowered}`];
}

/**
 * Recover the named subject areas from a compact brief such as:
 * "a six-week seminar on AI governance, platform accountability, privacy
 * regulation, algorithmic audits, and emerging policy proposals."
 *
 * The shared coverage parser intentionally accepts only explicit
 * cover/include language. Algi also needs this equally explicit "course on"
 * form because it has no language model to infer the list before research.
 * Reusing the shared parser keeps the same three-item and phrase-length gates.
 */
function extractCompactBriefCoverage(source) {
  const match =
    /\b(?:course|class|seminar|studio|workshop)\b[^.!?\n]{0,80}?\b(?:focused\s+on|on|about|covering|including)\s+([^.!?\n]{8,500})[.!?](?:\s|$)/i.exec(
      String(source || ''),
    );
  return match?.[1] ? extractExplicitCoverageTopics(`Cover ${match[1]}.`) : [];
}

/** Topics for every session: transcribed where the source says, derived where it does not. */
export function planSessionTopics(source, sessionCount) {
  const explicit = extractExplicitLessonSequence(source, { expectedCount: sessionCount });
  if (explicit.length === sessionCount) return explicit;
  // The count-matched call is all-or-nothing: a brief that lists thirteen
  // coverage areas for a fifteen-lesson course returns NOTHING, and Algi then
  // had only "Session 3 topic" to offer. A model reading the same prose is
  // unaffected, which is why this never surfaced on the Scion path. Take the
  // listed topics at whatever length they come, and extend from there.
  const listed = explicit.length > 0 ? explicit : extractExplicitLessonSequence(source);
  const coverage = [...extractExplicitCoverageTopics(source), ...extractCompactBriefCoverage(source)];
  const topics = [];
  const seen = new Set();
  for (const topic of [...listed, ...coverage]) {
    const value = clamp(titleCase(topic), MAX_TITLE, MIN_TITLE);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    topics.push(value);
    if (topics.length === sessionCount) return topics;
  }
  // When an instructor names a substantial sequence but leaves one final
  // meeting open, close with synthesis instead of mechanically repeating the
  // first topic through an arbitrary lens. The kernel composer recognizes the
  // synthesis title and reuses evidence admitted by the preceding lessons, so
  // the capstone costs no extra source request and represents the whole course.
  if (topics.length >= 3 && topics.length === sessionCount - 1) {
    const synthesis = clamp(`${extractCourseName(source)} synthesis`, MAX_TITLE, MIN_TITLE);
    const key = synthesis.toLowerCase();
    if (synthesis && !seen.has(key)) {
      seen.add(key);
      topics.push(synthesis);
      return topics;
    }
  }
  // Deepening passes over named coverage, never invented subject matter: each
  // remaining session revisits a named topic through a distinct lens.
  const lenses = ['in practice', 'evidence and methods', 'comparisons', 'limitations', 'applications'];
  const baseTopics = [...topics];
  let lensIndex = 0;
  while (topics.length < sessionCount && topics.length > 0) {
    const base = baseTopics[lensIndex % baseTopics.length] || topics[0];
    const lens = lenses[Math.floor(lensIndex / baseTopics.length) % lenses.length];
    lensIndex += 1;
    const candidate = clamp(`${base}: ${lens}`, MAX_TITLE, MIN_TITLE);
    const key = candidate.toLowerCase();
    if (candidate && !seen.has(key)) {
      seen.add(key);
      topics.push(candidate);
    } else if (lensIndex > lenses.length * baseTopics.length + 2) {
      break;
    }
  }
  while (topics.length < sessionCount) topics.push(clamp(`Session ${topics.length + 1} topic`, MAX_TITLE, MIN_TITLE));
  return topics.slice(0, sessionCount);
}

// One graded artifact per session keeps the registry inside the contract's
// count..count*3 window; the compiler redistributes weights and roles.
function planAssessments(topics) {
  const total = topics.length;
  return topics.map((topic, index) => {
    const order = index + 1;
    const isFinal = order === total;
    const subject = clamp(topic, 70, 1) || 'the course topic';
    return {
      id: `a${order}`,
      title: clamp(isFinal ? `Final project: ${subject}` : `Evidence brief ${order}: ${subject}`, 120, 5),
      kind: isFinal ? 'graded-artifact' : order % 4 === 0 ? 'in-class' : 'graded-artifact',
      dueSession: order,
      weightPct: 0,
    };
  });
}

/**
 * Compose a Pass A skeleton that satisfies the same JSON contract Scion is
 * asked for. Returns a JSON string, matching what the pipeline expects from a
 * model response.
 */
export function composeAlgiSkeleton(userPrompt) {
  const source = extractSourceFromPrompt(userPrompt);
  const expected = extractExpectedSessions(userPrompt);
  const topics = planSessionTopics(source, Math.max(1, expected || 8));
  const courseName = extractCourseName(source);
  const sessions = topics.map((topic, index) => ({
    id: `s${index + 1}`,
    order: index + 1,
    title: topic,
    sectionTitles: sectionTitlesFor(topic, index),
  }));
  const goals = [
    clamp(`Explain the core ideas of ${courseName}`, 120, 8),
    clamp(`Apply ${topics[0] || 'course methods'} to new cases`, 120, 8),
    clamp(`Evaluate evidence and name its limits`, 120, 8),
  ].filter(Boolean);
  return JSON.stringify({
    course: { name: courseName, term: 'Term', goals },
    sessions,
    assessments: planAssessments(topics),
    readings: [],
  });
}

/**
 * A small, honest advisory turn for the built-in Help/Agent surface.
 *
 * Algi has no language model, so it must not pretend to answer open-domain
 * questions or silently download Scion. It can still orient the user inside
 * the course structure already present in the workspace.
 */
export function composeAlgiAdvisoryResponse({ messages = [], systemPrompt = '' } = {}) {
  const workspacePromptText =
    typeof systemPrompt === 'object' ? String(systemPrompt.dynamicPart || '') : String(systemPrompt || '');
  const question = String([...messages].reverse().find((message) => message?.role === 'user')?.content || '').trim();
  const courseTitle =
    /\*\*Course Title:\*\*\s*([^\n]+)/i.exec(workspacePromptText)?.[1]?.trim() ||
    /^## COURSE\s*\n\*\*(.+?)\*\*\s*\|/im.exec(workspacePromptText)?.[1]?.trim() ||
    /(?:courseName|course title|workspace)\s*[:=]\s*["']?([^"'\n,}]+)/i.exec(workspacePromptText)?.[1]?.trim() ||
    'this course';
  // The full agent system prompt contains several other numbered rule lists.
  // Reading every "1." line made Algi describe tool-policy prose as the first
  // and last lessons. Scope the parser to the explicit Course Outline block;
  // retain the narrow fallback for the compact test/legacy prompt.
  const courseOutlineBlock =
    /\*\*Course Outline:\*\*\s*\n([\s\S]*?)(?=\n\s*\n|\n\*\*|\n##|$)/i.exec(workspacePromptText)?.[1] || '';
  const agentLessonBlock =
    /\*\*Lessons:\*\*\s*\n([\s\S]*?)(?=\n\*\*Fields:\*\*|\n\*\*Active:\*\*|\n##|$)/i.exec(workspacePromptText)?.[1] ||
    '';
  const outline = courseOutlineBlock
    ? [...courseOutlineBlock.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim())
    : agentLessonBlock
      ? [...agentLessonBlock.matchAll(/^\s*Lesson\s+\d+\s*:\s*"([^"]+)"/gim)].map((match) => match[1].trim())
      : [...workspacePromptText.matchAll(/^\s*\d+\.\s+(.+)$/gm)].map((match) => match[1].trim());
  outline.splice(20);
  const questionTokens = new Set(
    question
      .toLowerCase()
      .match(/[a-z0-9]{4,}/g)
      ?.filter((token) => !['this', 'that', 'with', 'from', 'what', 'which', 'course', 'lesson'].includes(token)) || [],
  );
  const nearest = outline
    .map((title, index) => ({
      title,
      index,
      score: (title.toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((token) => questionTokens.has(token)).length,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0];
  const focus = nearest?.score > 0 ? ` The closest mapped area is “${nearest.title}.”` : '';
  const outlineLabels = outline.map((title) => title.replace(/^Lesson\s+\d+\s*:\s*/i, '').trim()).filter(Boolean);
  const sequenceLabel = (() => {
    if (outlineLabels.length <= 6) return outlineLabels.join(' → ');
    return [...outlineLabels.slice(0, 3), '…', ...outlineLabels.slice(-2)].join(' → ');
  })();
  const evidenceBlock =
    /\*\*Compiled evidence cards[^:]*:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n##|$)/i.exec(workspacePromptText)?.[1] || '';
  const evidenceCards = evidenceBlock
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(
      (card) =>
        card &&
        Number.isInteger(Number(card.lesson)) &&
        String(card.title || '').trim() &&
        String(card.term || '').trim() &&
        String(card.definition || '').trim(),
    );
  const normalizedQuestion = question.toLowerCase();
  const scoredEvidence = evidenceCards
    .map((card, index) => {
      const title = String(card.title).trim();
      const term = String(card.term).trim();
      const cardTokens = new Set(`${title} ${term}`.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
      const tokenOverlap = [...questionTokens].filter((token) => cardTokens.has(token)).length;
      return {
        ...card,
        index,
        score:
          tokenOverlap +
          (normalizedQuestion.includes(term.toLowerCase()) ? 6 : 0) +
          (normalizedQuestion.includes(title.toLowerCase()) ? 4 : 0),
      };
    })
    .filter((card) => card.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const matchedEvidence = [];
  for (const card of scoredEvidence) {
    const sameLesson = matchedEvidence.some((match) => Number(match.lesson) === Number(card.lesson));
    const sameTerm = matchedEvidence.some((match) => match.term.toLowerCase() === card.term.toLowerCase());
    if (sameTerm || (sameLesson && matchedEvidence.length < 2)) continue;
    matchedEvidence.push(card);
    if (matchedEvidence.length >= 2) break;
  }
  if (/\b(?:compare|contrast|difference|different|versus|vs\.?)\b/i.test(question) && matchedEvidence.length >= 2) {
    const [left, right] = matchedEvidence;
    const leftDefinition = String(left.definition).replace(/[.!?]+$/, '');
    const rightDefinition = String(right.definition).replace(/[.!?]+$/, '');
    return `From the compiled evidence: Lesson ${left.lesson} (${left.title}) defines ${left.term} as “${leftDefinition}.” Lesson ${right.lesson} (${right.title}) defines ${right.term} as “${rightDefinition}.” These are separate evidence cards with different scopes; the package does not treat one as a substitute for the other.`;
  }
  if (matchedEvidence.length > 0 && /\b(?:what|explain|define|how|where|evidence|mean)\b/i.test(question)) {
    const card = matchedEvidence[0];
    const definition = String(card.definition).replace(/[.!?]+$/, '');
    return `In Lesson ${card.lesson} (${card.title}), the compiled evidence defines ${card.term} as “${definition}.” Open Study Guides for the full card and its lesson example.`;
  }
  if (
    /\b(download|model|offline)\b|source research|research mode|(?:data|browser|device|local)\s+privacy|privacy\s+(?:policy|mode|settings|data)/i.test(
      question,
    )
  ) {
    return 'Algi uses no model weights and performs no inference. Private mode keeps course topics on this device; optional Source research sends only the course title and uncovered lesson topics to reusable open scholarly sources, then Wikipedia when needed, and preserves source attribution in the package.';
  }
  if (/\b(?:summari[sz]e|sequence|outline|progression|order)\b/i.test(question) && outlineLabels.length > 0) {
    return `${courseTitle} has ${outlineLabels.length} mapped lesson${outlineLabels.length === 1 ? '' : 's'}: ${sequenceLabel}. The sequence is the course’s structural spine; open Course Map to inspect each lesson’s objective, activity, evidence source, and assessment alignment.`;
  }
  if (/\b(?:assessment|grading|grade|rubric)\b/i.test(question) && outlineLabels.length > 0) {
    return `${courseTitle} uses one aligned checkpoint for each of the ${outlineLabels.length} lessons, moving from “${outlineLabels[0]}” to “${outlineLabels.at(-1)}”. Assignment Briefs state the student artifact, Rubrics make the success criteria inspectable, and the Quiz & Exam Bank supplies retrieval and application checks. Confirm official weights before publishing.`;
  }
  if (/\b(?:audit|review|gap|coverage|duplicate)\b/i.test(question) && outlineLabels.length > 0) {
    const normalized = outlineLabels.map((title) =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    );
    const duplicateCount = normalized.length - new Set(normalized).size;
    const genericCount = outlineLabels.filter((title) =>
      /^(?:untitled|session\s+\d+\s+topic|lesson\s+\d+|topic)$/i.test(title),
    ).length;
    if (duplicateCount > 0 || genericCount > 0) {
      return `I found ${duplicateCount} repeated lesson title${duplicateCount === 1 ? '' : 's'} and ${genericCount} generic title${genericCount === 1 ? '' : 's'} in ${courseTitle}. Fix those structural gaps before judging source coverage or assessment alignment.`;
    }
    return `The ${outlineLabels.length}-lesson outline has no repeated or generic lesson titles. A deeper review should now verify four things in each row: a measurable objective, a source-backed learning activity, an observable student artifact, and a rubric criterion that measures that same artifact.${focus}`;
  }
  if (/\b(change|edit|rewrite|revise|update|fix)\b/i.test(question)) {
    return `I can help inspect ${courseTitle}, but Algi’s advisory turn is source-grounded and read-only.${focus} Name the exact lesson or deliverable to revise; Course Mapper’s deterministic workspace tools will apply supported edits without inventing subject knowledge.`;
  }
  return `I’m connected to ${courseTitle} in Algi’s source-grounded advisory mode.${focus} I can point to course structure, coverage gaps, and export checks, but I will not invent subject facts that are absent from the uploaded source or admitted genome.`;
}

/**
 * Answer one pipeline request. Composed tasks return JSON text; everything else
 * returns '' so the caller's existing model-unavailable path hands the work to
 * the deterministic compiler rather than to invented content.
 */
export async function composeAlgiResponse({
  task,
  userPrompt,
  structuredPrompt,
  schema,
  researchEnabled,
  signal,
  onResearchProgress = null,
} = {}) {
  const name = String(task || '');
  if (!ALGI_COMPOSED_TASKS.has(name)) return { text: '', coverage: null };
  if (name === 'nativeSkeleton') return { text: composeAlgiSkeleton(userPrompt), coverage: null };
  // Lesson kernels are retrieved from the genome, where the facts, key terms,
  // misconceptions, and question banks already carry source anchors.
  const { composeAlgiLessonKernels } = await import('./algiKernelComposer.js');
  const result = await composeAlgiLessonKernels({
    structuredPrompt,
    factCount: factCountFromSchema(schema),
    // Public Scion owns a separate, explicit privacy toggle. Its adaptive
    // evidence/compiler lane must pass that resolved consent through instead
    // of accidentally consulting Algi's retired public-model flag. Without
    // this handoff the setup UI could say "current-source research on" while
    // every adaptive Pass B call still remained offline.
    researchProvider: buildResearchProvider({
      signal,
      ...(typeof researchEnabled === 'boolean' ? { enabled: researchEnabled } : {}),
    }),
    // The Pass B prompt object carries lessons, not a course title, so the
    // subject is read from the prose instead. Without it a lesson researches
    // its bare title ("information architecture" returned enterprise-software
    // pages) and, worse, the discipline cannot be inferred, so no shard kernels
    // are available to complete the lesson's key terms.
    courseContext: researchCourseContext(userPrompt),
    onResearchProgress,
    signal,
  });
  return {
    text: result.text,
    coverage: {
      covered: result.covered,
      requested: result.requested,
      uncovered: result.uncovered,
      researched: result.researched || 0,
      researchNote: result.researchNote || '',
      ...(result.cachedResearch ? { cachedResearch: result.cachedResearch } : {}),
      ...(result.researchReceipt ? { researchReceipt: result.researchReceipt } : {}),
    },
  };
}

/**
 * The subject name only, for use as a search disambiguator.
 *
 * extractCourseName returns the whole opening sentence, which is right for
 * titling and wrong here: prepending "UX Design Studio, a 12-lesson studio
 * course with weekly critiques." to every lesson query buries the actual topic
 * and returns worse results than no context at all.
 */
export function researchCourseContext(userPrompt) {
  const name = String(extractCourseName(userPrompt) || '').split(/[,.;:(]/)[0];
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
}

/**
 * Open-source research over the app's own fetch, throttled per provider.
 *
 * Research remains opt-in because the course title and uncovered lesson topics
 * leave the device. The cascade prefers explicitly licensed scholarly sources
 * before Wikipedia, and every admitted claim must keep provider, URL, license,
 * attribution, source passage, and entailment receipts through export.
 * Requests are spaced because rate-limit safety is a correctness property.
 */
function algiAbortError(reason = 'Algi research stopped') {
  if (reason instanceof Error) return reason;
  return Object.assign(new Error(String(reason || 'Algi research stopped')), { name: 'AbortError' });
}

function throwIfAlgiAborted(signal) {
  if (signal?.aborted) throw algiAbortError(signal.reason);
}

function waitForResearchGap(ms, signal) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      reject(algiAbortError(signal?.reason));
    };
    function done() {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

export function buildResearchProvider({
  storage = globalThis.localStorage,
  enabled = readAlgiResearchEnabled(storage),
  gapMs = 300,
  signal,
  timeoutMs = 8000,
  maxRequests = 20,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!enabled) return null;
  if (typeof fetchImpl !== 'function') return null;
  let requestCount = 0;
  const requestCountByOrigin = {};
  const lastByOrigin = new Map();
  const cache = new Map();
  const requestPayload = async (url, { kind = 'json', accept = 'application/json' } = {}) => {
    throwIfAlgiAborted(signal);
    const cacheKey = `${kind}:${url}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (requestCount >= maxRequests) throw new Error(`algi-research-budget-exhausted:${maxRequests}`);
    const request = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (requestCount >= maxRequests) throw new Error(`algi-research-budget-exhausted:${maxRequests}`);
        let origin = 'unknown';
        try {
          origin = new URL(url).origin;
        } catch {}
        // DOAJ asks automated clients to leave roughly half a second between
        // calls; Wikipedia's batched read path is safe at the default gap.
        const providerGapMs = origin.includes('doaj.org') ? Math.max(600, gapMs) : gapMs;
        const wait = (lastByOrigin.get(origin) || 0) + providerGapMs - Date.now();
        await waitForResearchGap(wait, signal);
        throwIfAlgiAborted(signal);
        lastByOrigin.set(origin, Date.now());
        requestCount += 1;
        requestCountByOrigin[origin] = (requestCountByOrigin[origin] || 0) + 1;

        const controller = new AbortController();
        const onAbort = () => controller.abort(algiAbortError(signal?.reason));
        signal?.addEventListener?.('abort', onAbort, { once: true });
        const timer = setTimeout(
          () =>
            controller.abort(Object.assign(new Error(`algi-research-timeout:${timeoutMs}`), { name: 'TimeoutError' })),
          timeoutMs,
        );
        try {
          const response = await fetchImpl(url, {
            headers: { Accept: accept },
            signal: controller.signal,
          });
          if (response.status === 429 && attempt === 0) {
            const retryAfterSeconds = Number(response.headers?.get?.('retry-after'));
            const retryMs = Number.isFinite(retryAfterSeconds)
              ? Math.min(4000, Math.max(750, retryAfterSeconds * 1000))
              : Math.max(1200, gapMs * 4);
            await waitForResearchGap(retryMs, signal);
            continue;
          }
          if (!response.ok) throw new Error(`research-http-${response.status}`);
          return kind === 'text' ? response.text() : response.json();
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener?.('abort', onAbort);
        }
      }
      throw new Error('research-http-429');
    })();
    cache.set(cacheKey, request);
    try {
      return await request;
    } catch (error) {
      cache.delete(cacheKey);
      throw error;
    }
  };
  const httpJson = (url) => requestPayload(url);
  const httpText = (url) => requestPayload(url, { kind: 'text', accept: 'text/html, text/plain;q=0.9' });
  // Imported lazily by the composer; built here so the network surface has one owner.
  return {
    httpJson,
    httpText,
    diagnostics: () => ({
      requestCount,
      maxRequests,
      cachedRequestCount: cache.size,
      requestCountByOrigin: { ...requestCountByOrigin },
    }),
  };
}
