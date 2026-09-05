export const SCION_ADAPTER_TASK_SCOPE_PROTOCOL = 'scion-adapter-task-scope-v1';
export const SCION_ADAPTER_TASK_SCOPE_IDENTITY_ALGORITHM = 'sha256-canonical-scion-adapter-task-scope-v1';
export const SCION_LESSON_KERNEL_PROMPT_PROTOCOL = 'production-lesson-kernel-prompt-v1';
export const SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL = 'production-lesson-kernel-synthesis-prompt-v1';
export const SCION_EXPERIENTIAL_ACTIVITY_PROMPT_PROTOCOL = 'production-experiential-activity-prompt-v1';

export const SCION_ADAPTER_TASK_FAMILIES = Object.freeze({
  SOURCE_KEY_TERM_ATOM: 'source-key-term-atom',
  SOURCE_MC_ITEM_ATOM: 'source-mc-item-atom',
  SOURCE_GROUNDED_LESSON_KERNEL: 'source-grounded-lesson-kernel',
  LESSON_KERNEL_SYNTHESIS: 'lesson-kernel-synthesis',
  // Historical manifests used this broad family for two materially different
  // jobs. Keep it parseable for provenance, but current runtime requests never
  // route to it; an adapter must declare the exact prompt contract it learned.
  LESSON_KERNEL: 'lesson-kernel',
  COURSE_MAP: 'course-map',
  AGENT_ADVISORY: 'agent-advisory',
  COMPILER_REPAIR: 'compiler-repair',
  VOICE_REVISION: 'voice-revision',
  GENOME_EXTRACTION: 'genome-extraction',
  UNCLASSIFIED: 'unclassified',
});

const TASK_FAMILY_IDS = new Set(Object.values(SCION_ADAPTER_TASK_FAMILIES));
const TRAINABLE_TASK_FAMILY_IDS = new Set(
  [...TASK_FAMILY_IDS].filter((family) => family !== SCION_ADAPTER_TASK_FAMILIES.UNCLASSIFIED),
);
const SHA256_RE = /^[a-f0-9]{64}$/;

function clean(value) {
  return String(value ?? '').trim();
}

export function normalizeScionAdapterTaskFamily(value) {
  const family = clean(value);
  return TASK_FAMILY_IDS.has(family) ? family : SCION_ADAPTER_TASK_FAMILIES.UNCLASSIFIED;
}

export function scionAdapterTaskFamilyForPairKind(value) {
  switch (clean(value)) {
    case 'key-term':
      return SCION_ADAPTER_TASK_FAMILIES.SOURCE_KEY_TERM_ATOM;
    case 'mc-item':
      return SCION_ADAPTER_TASK_FAMILIES.SOURCE_MC_ITEM_ATOM;
    case 'lesson':
    case 'lesson-kernel':
      return SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL;
    default:
      return SCION_ADAPTER_TASK_FAMILIES.UNCLASSIFIED;
  }
}

export function scionAdapterTaskFamilyForProviderTask(value, { promptProtocol } = {}) {
  const task = clean(value).toLowerCase();
  if (['blueprintenrichment', 'lesson-kernel', 'lessonkernel'].includes(task)) {
    return [SCION_LESSON_KERNEL_PROMPT_PROTOCOL, SCION_EXPERIENTIAL_ACTIVITY_PROMPT_PROTOCOL].includes(
      clean(promptProtocol),
    )
      ? SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL
      : SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS;
  }
  if (['course-map', 'coursemap', 'native-skeleton', 'nativeskeleton', 'course-ir', 'courseir'].includes(task)) {
    return SCION_ADAPTER_TASK_FAMILIES.COURSE_MAP;
  }
  if (['chat', 'agent', 'agent-advisory', 'agentadvisory'].includes(task)) {
    return SCION_ADAPTER_TASK_FAMILIES.AGENT_ADVISORY;
  }
  if (['repair', 'compiler-repair', 'compilerrepair', 'verification', 'scionpass'].includes(task)) {
    return SCION_ADAPTER_TASK_FAMILIES.COMPILER_REPAIR;
  }
  if (['voicepass', 'voice-pass', 'voice-revision', 'voicerevision'].includes(task)) {
    return SCION_ADAPTER_TASK_FAMILIES.VOICE_REVISION;
  }
  if (['genomeextract', 'genome-extract', 'genome-extraction', 'genomeextraction'].includes(task)) {
    return SCION_ADAPTER_TASK_FAMILIES.GENOME_EXTRACTION;
  }
  return SCION_ADAPTER_TASK_FAMILIES.UNCLASSIFIED;
}

export function scionAdapterTaskScopePayload(scope) {
  return {
    protocol: scope?.protocol,
    mode: scope?.mode,
    families: Array.isArray(scope?.families)
      ? scope.families.map((entry) => ({ id: entry?.id, rows: entry?.rows }))
      : [],
    unclassifiedPolicy: scope?.unclassifiedPolicy,
    compositePolicy: scope?.compositePolicy,
  };
}

export function validateScionAdapterTaskScope(scope, { expectedRows } = {}) {
  const issues = [];
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    return { valid: false, issues: ['task-scope-not-object'] };
  }
  if (scope.protocol !== SCION_ADAPTER_TASK_SCOPE_PROTOCOL) issues.push('task-scope-protocol');
  if (scope.mode !== 'allowlist') issues.push('task-scope-mode');
  if (scope.unclassifiedPolicy !== 'base-only') issues.push('task-scope-unclassified-policy');
  if (scope.compositePolicy !== 'exact-family-only') issues.push('task-scope-composite-policy');
  const families = Array.isArray(scope.families) ? scope.families : [];
  if (families.length === 0) issues.push('task-scope-families-empty');
  const ids = families.map((entry) => clean(entry?.id));
  if (new Set(ids).size !== ids.length) issues.push('task-scope-family-duplicate');
  if (ids.some((id) => !TRAINABLE_TASK_FAMILY_IDS.has(id))) issues.push('task-scope-family-id');
  if (JSON.stringify(ids) !== JSON.stringify([...ids].sort())) issues.push('task-scope-family-order');
  if (families.some((entry) => !Number.isSafeInteger(entry?.rows) || entry.rows <= 0)) {
    issues.push('task-scope-family-rows');
  }
  const totalRows = families.reduce(
    (sum, entry) => sum + (Number.isSafeInteger(entry?.rows) && entry.rows > 0 ? entry.rows : 0),
    0,
  );
  if (expectedRows != null && totalRows !== expectedRows) issues.push('task-scope-row-total');
  if (scope.identity?.algorithm !== SCION_ADAPTER_TASK_SCOPE_IDENTITY_ALGORITHM) {
    issues.push('task-scope-identity-algorithm');
  }
  if (!SHA256_RE.test(clean(scope.identity?.sha256))) issues.push('task-scope-identity-sha256');
  return { valid: issues.length === 0, issues: [...new Set(issues)], totalRows };
}

export function resolveScionAdapterTaskRoute({ manifest, taskFamily, promptProtocol } = {}) {
  const family = normalizeScionAdapterTaskFamily(taskFamily);
  const validation = validateScionAdapterTaskScope(manifest?.training?.taskScope, {
    expectedRows: manifest?.training?.pairCount,
  });
  if (!validation.valid) {
    return {
      mode: 'base-only',
      adapterActive: false,
      taskFamily: family,
      reason: 'invalid-task-scope',
      issues: validation.issues,
    };
  }
  if (family === SCION_ADAPTER_TASK_FAMILIES.UNCLASSIFIED) {
    return {
      mode: 'base-only',
      adapterActive: false,
      taskFamily: family,
      reason: 'unclassified-task',
      issues: [],
    };
  }
  if (family === SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL) {
    return {
      mode: 'base-only',
      adapterActive: false,
      taskFamily: family,
      reason: 'legacy-task-family-too-broad',
      issues: [],
    };
  }
  const eligible = manifest.training.taskScope.families.some((entry) => entry.id === family);
  const groundedStageAvailable =
    !eligible &&
    family === SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS &&
    clean(promptProtocol) === SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL &&
    manifest.training.taskScope.families.some(
      (entry) => entry.id === SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL,
    );
  const requiredPromptProtocol =
    family === SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL
      ? SCION_LESSON_KERNEL_PROMPT_PROTOCOL
      : family === SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS
        ? SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL
        : '';
  if (eligible && requiredPromptProtocol && clean(promptProtocol) !== requiredPromptProtocol) {
    return {
      mode: 'base-only',
      adapterActive: false,
      taskFamily: family,
      reason: 'prompt-protocol-mismatch',
      expectedPromptProtocol: requiredPromptProtocol,
      promptProtocol: clean(promptProtocol) || null,
      scopeIdentitySha256: manifest.training.taskScope.identity.sha256,
      issues: [],
    };
  }
  return eligible
    ? {
        mode: 'adapter',
        adapterActive: true,
        taskFamily: family,
        reason: 'exact-task-family-match',
        promptProtocol: clean(promptProtocol) || null,
        scopeIdentitySha256: manifest.training.taskScope.identity.sha256,
        issues: [],
      }
    : {
        mode: 'base-only',
        adapterActive: false,
        taskFamily: family,
        reason: groundedStageAvailable ? 'grounded-stage-available' : 'task-family-out-of-scope',
        promptProtocol: clean(promptProtocol) || null,
        scopeIdentitySha256: manifest.training.taskScope.identity.sha256,
        issues: [],
      };
}
