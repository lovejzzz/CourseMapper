import { cleanText, stripTerminalPunctuation, unique } from './compilerText';
import { selectLessonVariant as lessonVariant } from './courseCompilerRealization';

const ALIGNMENT_STOP_WORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'using',
  'students',
  'lesson',
  'course',
  'will',
  'able',
  'criterion',
]);

function alignmentTokens(value) {
  return unique(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3 && !ALIGNMENT_STOP_WORDS.has(token)),
    12,
  );
}

function coverage(construct, taskText) {
  const expected = alignmentTokens(construct);
  if (expected.length === 0) return 0;
  const actual = new Set(alignmentTokens(taskText));
  return expected.filter((token) => actual.has(token)).length / expected.length;
}

export function appliedObjectiveCue(objective) {
  const normalizeClauseEdge = (value) =>
    cleanText(value)
      .replace(/^[,;:\s]+/, '')
      .replace(/[,;:\s]+$/, '');
  const source = normalizeClauseEdge(stripTerminalPunctuation(cleanText(objective)));
  const colonParts = source.split(/\s*:\s*/).filter(Boolean);
  if (colonParts.length >= 2) {
    return `${colonParts.slice(1).join(': ')} through ${colonParts[0].toLowerCase()}`;
  }
  // A bare "and" commonly coordinates nouns inside one construct ("center,
  // spread, and outliers"). Splitting it manufactures fragments and doubled
  // punctuation. Only explicit sequencing punctuation or "then" separates
  // application clauses.
  const clauses = source
    .split(
      /\s*(?:;|\bthen\b|\band\s+(?=(?:apply|analy[sz]e|compare|create|design|evaluate|explain|interpret|justify|produce|revise|summarize|use)\b))\s*/i,
    )
    .map(normalizeClauseEdge)
    .filter(Boolean);
  if (clauses.length >= 2) {
    const lowerLead = (value) => value.replace(/^[A-Z]/, (letter) => letter.toLowerCase());
    return `First, ${lowerLead(clauses[0])}; then ${clauses.slice(1).map(lowerLead).join(', then ')}`;
  }
  const imperative = source.match(
    /^(analy[sz]e|assess|audit|build|cite|compare|construct|create|design|develop|differentiate|distinguish|evaluate|explain|identify|inspect|interpret|produce|reference|revise|state|use|apply)\s+(.+)$/i,
  );
  if (imperative) {
    const verb = imperative[1].toLowerCase();
    const object = normalizeClauseEdge(imperative[2]);
    if (/^(?:differentiate|distinguish)$/.test(verb)) {
      const contrast = object.match(/^(.+?)\s+from\s+(.+)$/i);
      if (contrast) return `a clear distinction between ${contrast[1]} and ${contrast[2]}`;
    }
    const actionNoun = {
      analyze: 'analysis of',
      analyse: 'analysis of',
      assess: 'assessment of',
      audit: 'audit of',
      build: 'development of',
      cite: 'source support for',
      compare: 'comparison of',
      construct: 'construction of',
      create: 'creation of',
      design: 'design of',
      develop: 'development of',
      evaluate: 'evaluation of',
      explain: 'explanation of',
      identify: 'identification of',
      inspect: 'inspection of',
      interpret: 'interpretation of',
      produce: 'production of',
      reference: 'reference to',
      revise: 'revision of',
      state: 'statement of',
      use: 'application of',
      apply: 'application of',
    }[verb];
    if (actionNoun) return `${actionNoun} ${object}`;
  }
  const constructs = alignmentTokens(source).slice(0, 7);
  return constructs.length > 0 ? constructs.join(', ') : source;
}

export function nonRedundantObjectiveDeclarations(objectives, limit = 5) {
  const candidates = unique(
    (Array.isArray(objectives) ? objectives : [objectives]).map(cleanText).filter(Boolean),
    Math.max(limit * 3, limit),
  );
  const normalizedCandidates = candidates.map((objective) => ({
    objective,
    normalized: objective
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim(),
  }));
  return normalizedCandidates
    .filter((candidate, index, entries) => {
      const containedObjectives = entries.filter(
        (entry, entryIndex) =>
          entryIndex !== index && entry.normalized.length >= 12 && candidate.normalized.includes(entry.normalized),
      );
      // Source material sometimes publishes one concatenated objective beside
      // the same atomic objectives. Printing both makes every atom look like a
      // duplicated declaration. Prefer the independently assessable atoms only
      // when at least two of them reconstruct the longer sentence.
      return containedObjectives.length < 2;
    })
    .map((entry) => entry.objective)
    .slice(0, limit);
}

export function objectiveConstructApplicationInstruction(
  objectives,
  { artifact = '', lessonTitle = '', existingTaskText = '', lesson = null } = {},
) {
  const objectiveStatements = unique(
    (Array.isArray(objectives) ? objectives : [objectives])
      .map((objective) => stripTerminalPunctuation(cleanText(objective)))
      .filter(Boolean),
    4,
  );
  const missingObjectives = objectiveStatements.filter((objective) => coverage(objective, existingTaskText) < 1);
  if (missingObjectives.length === 0) return '';
  const target = stripTerminalPunctuation(artifact) || 'the submitted artifact';
  // The document already prints each objective once in its Learning
  // Objectives section. Repeat-copying the exact sentence here rewards a
  // declaration without proving application and makes independent coherence
  // checks fail closed. Reorder the same course-specific constructs into an
  // action cue so the task applies the objective without duplicating it.
  const objectiveList = missingObjectives
    .slice(0, 2)
    .map((objective) => `“${appliedObjectiveCue(objective)}”`)
    // Keep neighboring transformed cues from accidentally reconstructing an
    // exact objective across the punctuation boundary (for example, one cue
    // ending in “source-bound identification” and the next beginning with
    // “Mandarin SVO example”). The coherence verifier correctly treats that
    // as a duplicated declaration even though no author intended one.
    .join('; next, ');
  return lessonVariant(lesson || { title: lessonTitle }, [
    `Use this objective to guide ${target}: ${objectiveList}. Label the evidence, analysis, decision, or revision where it becomes visible.`,
    `Make this objective visible in ${target}: ${objectiveList}. Show both the supporting evidence and the decision it warrants.`,
    `Organize ${target} around this objective: ${objectiveList}. Point to the evidence and the judgment that demonstrate it.`,
    `In ${target}, demonstrate this objective rather than only repeating it: ${objectiveList}. Connect one inspectable detail to the resulting decision.`,
    `Show how ${target} fulfills this objective: ${objectiveList}. Mark the evidence, reasoning, and resulting revision or decision.`,
    `Build one traceable evidence-to-decision move in ${target} for this objective: ${objectiveList}.`,
    `Demonstrate this objective through ${target}: ${objectiveList}. Identify the source detail, the inference it supports, and the choice that follows.`,
    `Treat this objective as a requirement for ${target}: ${objectiveList}. Annotate where the observation becomes analysis and where the analysis changes the work.`,
    `Use ${target} to make this objective assessable: ${objectiveList}. Pair a concrete piece of evidence with the claim or revision it justifies.`,
    `Translate this objective into visible work in ${target}: ${objectiveList}. Name the evidence used, the reasoning step, and the bounded conclusion.`,
    `Let this objective control one substantive section of ${target}: ${objectiveList}. Show the relevant record and explain how it changes the decision.`,
    `Make ${target} answer this objective directly: ${objectiveList}. Trace one inspectable detail through interpretation to a defensible action or revision.`,
    `Build ${target} around a verifiable response to this objective: ${objectiveList}. Distinguish what the evidence shows from what you decide because of it.`,
    `Use this objective as an audit check for ${target}: ${objectiveList}. Flag the evidence, warrant, limitation, and resulting improvement a scorer should inspect.`,
  ]);
}
