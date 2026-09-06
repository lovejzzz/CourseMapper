import { sha256HexSync } from './sha256Sync.js';
import { canonicalJson, sameJsonData } from './canonicalJson.js';
import { validTeachingTaskSource, TEACHING_TASK_SOURCE_VERSION } from './teachingTaskSourceSchema.js';

export const TEACHING_PROGRAM_VERSION = 1;

const record = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());

/** A change detector for data, not evidence of factual or educational validity. */
export function teachingProgramRevision(program) {
  const body = { ...program };
  delete body.revision;
  return sha256HexSync(canonicalJson(body));
}

function programError(issues) {
  const error = new Error(
    `The saved teaching structure needs review: ${issues.map((issue) => issue.message).join(' ')}`,
  );
  error.code = 'TEACHING_PROGRAM_INVALID';
  error.issues = issues;
  return error;
}

function taskSources(program) {
  const objectives = new Map(program.objectives.map((objective) => [objective.id, objective]));
  const sources = new Map(program.sources.map((source) => [source.id, source]));
  return program.tasks.map((task) => {
    const { objectiveRef, inputs, ...properties } = task;
    return {
      ...properties,
      version: TEACHING_TASK_SOURCE_VERSION,
      objective: objectives.get(objectiveRef)?.text,
      inputs: inputs.map(({ sourceRef, ...input }) => ({ ...input, text: sources.get(sourceRef)?.text })),
    };
  });
}

/** Reference and revision checks deliberately do not assert that a task is
 * solvable. Solving and classroom review are separate admission stages. */
export function validateTeachingProgram(program) {
  const issues = [];
  const push = (code, message) => issues.push({ code, message });
  if (!record(program) || program.version !== TEACHING_PROGRAM_VERSION) {
    push('teaching-program-version', 'This teaching structure version is not supported.');
    return { valid: false, issues };
  }
  const collections = ['objectives', 'sources', 'tasks'];
  if (collections.some((key) => !Array.isArray(program[key]))) {
    push('teaching-program-collections', 'Objectives, sources and tasks must be collections.');
    return { valid: false, issues };
  }
  const ids = new Set();
  for (const key of collections) {
    for (const entity of program[key]) {
      if (!record(entity) || !nonempty(entity.id)) {
        push('teaching-program-id', `An entry in ${key} has no stable identity.`);
        continue;
      }
      if (ids.has(entity.id)) push('teaching-program-duplicate', `The identity ${entity.id} is used more than once.`);
      ids.add(entity.id);
      if (key !== 'tasks' && !nonempty(entity.text))
        push('teaching-program-text', `The ${key} entry ${entity.id} has no text.`);
    }
  }
  // Malformed entities must produce a useful issue instead of an incidental
  // property-access exception during map construction or revision checking.
  if (issues.length) return { valid: false, issues };
  const objectives = new Set(program.objectives.map((objective) => objective.id));
  const sources = new Set(program.sources.map((source) => source.id));
  for (const task of program.tasks) {
    if (!objectives.has(task.objectiveRef))
      push('teaching-program-objective-ref', `Task ${task.id} has a missing objective.`);
    if (!Array.isArray(task.inputs) || !task.inputs.length || task.inputs.some((input) => !record(input))) {
      push('teaching-program-inputs', `Task ${task.id} has no valid input bindings.`);
      continue;
    }
    for (const input of task.inputs)
      if (!sources.has(input.sourceRef))
        push('teaching-program-source-ref', `Task ${task.id} references missing source ${input.sourceRef}.`);
  }
  if (!issues.length)
    for (const source of taskSources(program))
      if (!validTeachingTaskSource(source))
        push('teaching-program-task', `Task ${source.id} has invalid lesson, timing or input data.`);
  if (program.revision !== teachingProgramRevision(program))
    push('teaching-program-revision', 'The teaching structure changed without a matching revision.');
  return { valid: issues.length === 0, issues };
}

export function assertTeachingProgram(program) {
  const result = validateTeachingProgram(program);
  if (!result.valid) throw programError(result.issues);
  return program;
}

/** One-time import of the legacy ledger, also used by accepted edit
 * transactions. Unknown authored properties and stable input IDs survive.
 * Equal words in unrelated cases never imply shared source identity. */
export function teachingProgramFromSources(sources, previous = null) {
  if (!Array.isArray(sources) || sources.some((source) => !validTeachingTaskSource(source)))
    throw programError([
      { code: 'teaching-program-import', message: 'The task source ledger contains invalid records.' },
    ]);
  if (previous) assertTeachingProgram(previous);
  const priorTasks = new Map((previous?.tasks || []).map((task) => [task.id, task]));
  const priorObjectives = new Map((previous?.objectives || []).map((objective) => [objective.id, objective]));
  const priorSources = new Map((previous?.sources || []).map((source) => [source.id, source]));
  const program = {
    ...structuredClone(previous || {}),
    version: TEACHING_PROGRAM_VERSION,
    objectives: [],
    sources: [],
    tasks: [],
  };
  const usedObjectives = new Map();
  const usedSources = new Map();
  for (const source of sources) {
    const { version: _version, objective, inputs, ...properties } = structuredClone(source);
    const priorTask = priorTasks.get(source.id);
    const objectiveRef = priorTask?.objectiveRef || `${source.id}/objective`;
    const objectiveEntity = { ...priorObjectives.get(objectiveRef), id: objectiveRef, text: objective };
    if (usedObjectives.has(objectiveRef) && usedObjectives.get(objectiveRef).text !== objective)
      throw programError([
        {
          code: 'teaching-program-shared-objective',
          message: 'Linked tasks propose different changes to the same objective.',
        },
      ]);
    usedObjectives.set(objectiveRef, objectiveEntity);
    const bindings = inputs.map(({ text, ...input }) => {
      const sourceRef =
        priorTask?.inputs.find((binding) => binding.id === input.id)?.sourceRef || `${source.id}/${input.id}`;
      const sourceEntity = {
        ...priorSources.get(sourceRef),
        id: sourceRef,
        text,
        origin: priorSources.get(sourceRef)?.origin || {
          kind: 'legacy-task-input',
          taskId: source.id,
          inputId: input.id,
        },
      };
      if (usedSources.has(sourceRef) && usedSources.get(sourceRef).text !== text)
        throw programError([
          {
            code: 'teaching-program-shared-source',
            message: 'Linked tasks propose different text for the same source.',
          },
        ]);
      usedSources.set(sourceRef, sourceEntity);
      return { ...input, sourceRef };
    });
    program.tasks.push({ ...properties, objectiveRef, inputs: bindings });
  }
  program.objectives = [...usedObjectives.values()];
  program.sources = [...usedSources.values()];
  program.revision = teachingProgramRevision(program);
  return assertTeachingProgram(program);
}

/** A saved program always outranks legacy material/map copies. An invalid
 * program is never silently replaced by an older, apparently usable ledger. */
export function readTeachingTaskSources(container = {}) {
  if (container?.teachingProgram !== undefined) return taskSources(assertTeachingProgram(container.teachingProgram));
  const sources = container?.teachingTaskSources || container?.course?.meta?.teachingTaskSources || [];
  if (!Array.isArray(sources))
    throw programError([{ code: 'teaching-program-import', message: 'The task source ledger is not a collection.' }]);
  return structuredClone(sources);
}

/** The course map is a transport/view. Its legacy ledger is always generated
 * from the same program revision for older editors and material renderers. */
export function withTeachingTaskSources(container, sources) {
  const program = teachingProgramFromSources(sources, container?.teachingProgram);
  return { ...container, teachingProgram: program, teachingTaskSources: taskSources(program) };
}

export function migrateGraphTeachingProgram(graph) {
  if (!graph || (graph.teachingProgram === undefined && !graph.course?.meta?.teachingTaskSources)) return graph;
  const program =
    graph.teachingProgram !== undefined
      ? assertTeachingProgram(graph.teachingProgram)
      : teachingProgramFromSources(graph.course.meta.teachingTaskSources);
  const meta = { ...graph.course?.meta };
  delete meta.teachingTaskSources;
  delete meta.teachingProgram;
  return { ...graph, teachingProgram: structuredClone(program), course: { ...graph.course, meta } };
}

/** Normalize restore transports before AppFlow's map write-back effect runs.
 * A disagreement between saved authorities needs review, not an arbitrary
 * preference followed by silently re-deriving the graph from a stale map. */
export function restoreSnapshotTeachingProgram(snapshot) {
  const graphProgram = snapshot.courseGraph?.teachingProgram;
  const mapProgram = snapshot.courseMap?.teachingProgram;
  if (graphProgram === undefined && mapProgram === undefined) return snapshot;
  if (graphProgram !== undefined) assertTeachingProgram(graphProgram);
  if (mapProgram !== undefined) assertTeachingProgram(mapProgram);
  if (graphProgram && mapProgram && graphProgram.revision !== mapProgram.revision)
    throw programError([
      {
        code: 'teaching-program-restore-conflict',
        message:
          'The saved course graph and map contain different teaching revisions. Reopen the last consistent project or review these versions before replacing your current work.',
      },
    ]);
  const program = graphProgram || mapProgram;
  const sources = taskSources(program);
  const ledgers = [
    graphProgram === undefined ? snapshot.courseGraph?.course?.meta?.teachingTaskSources : null,
    mapProgram === undefined ? snapshot.courseMap?.teachingTaskSources : null,
  ];
  const sameLedger = (left, right) => {
    if (!Array.isArray(left) || left.length !== right.length) return false;
    const byId = new Map(left.map((item) => [item?.id, item]));
    return right.every((item) => sameJsonData(item, byId.get(item.id)));
  };
  if (ledgers.some((ledger) => ledger && !sameLedger(ledger, sources)))
    throw programError([
      {
        code: 'teaching-program-restore-conflict',
        message:
          'The saved teaching structure disagrees with a legacy source ledger. Review the conflicting saved versions; the older copy has not replaced the teaching structure.',
      },
    ]);
  const restored = { ...snapshot };
  if (snapshot.courseGraph)
    restored.courseGraph = migrateGraphTeachingProgram({ ...snapshot.courseGraph, teachingProgram: program });
  if (snapshot.courseMap)
    restored.courseMap = {
      ...snapshot.courseMap,
      teachingProgram: structuredClone(program),
      teachingTaskSources: structuredClone(sources),
    };
  const canonicalSources = new Map(sources.map((source) => [source.id, source]));
  if (snapshot.deliverables)
    restored.deliverables = Object.fromEntries(
      Object.entries(snapshot.deliverables).map(([id, entry]) => {
        const copies = entry?.data?.teachingTaskSources;
        if (!Array.isArray(copies) || copies.every((copy) => sameJsonData(copy, canonicalSources.get(copy?.id))))
          return [id, entry];
        return [
          id,
          {
            ...entry,
            stale: true,
            data: {
              ...entry.data,
              taskSourceReview:
                'This saved material uses a different source revision. Review or regenerate it from the current teaching structure before sharing; your saved text has been preserved.',
            },
          },
        ];
      }),
    );
  return restored;
}
