export const AGENT_EXECUTION_MODES = Object.freeze({
  APPLY: 'apply',
  DRY_RUN: 'dryRun',
});

export const AGENT_EXECUTION_MODE_STORAGE_KEY = 'coursemapper-agent-execution-mode';

export const AGENT_DRY_RUN_BLOCKED_TOOLS = new Set([
  'edit_course_map',
  'edit_deliverables',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'generate_slide_images',
  'save_preference',
  'remember',
  'forget',
  'undo_last',
  'create_tool',
  'run_tool',
]);

export const AGENT_DRY_RUN_INSTRUCTIONS = `## CURRENT AGENT MODE: SUGGEST ONLY / READ-ONLY
- Do not mutate course maps, generated deliverables, memories, preferences, custom tools, or slide image assets.
- Available behavior: read, validate, compare, verify, search, and then respond with analysis or user-approved proposal cards.
- Do not call edit_course_map, edit_deliverables, finalize_package, repair_package_readiness, retry_package_weak_spots, generate_slide_images, save_preference, remember, forget, undo_last, create_tool, or run_tool.
- If the user asks for a change, describe the exact recommended change or return proposal options; do not apply anything automatically.`;

export function normalizeAgentExecutionMode(mode) {
  return mode === AGENT_EXECUTION_MODES.DRY_RUN ? AGENT_EXECUTION_MODES.DRY_RUN : AGENT_EXECUTION_MODES.APPLY;
}

export function isAgentDryRunMode(mode) {
  return normalizeAgentExecutionMode(mode) === AGENT_EXECUTION_MODES.DRY_RUN;
}

export function isAgentToolBlockedInDryRun(toolName) {
  return AGENT_DRY_RUN_BLOCKED_TOOLS.has(toolName);
}

export function filterAgentToolsForExecutionMode(agentTools, mode) {
  if (!isAgentDryRunMode(mode)) return agentTools;
  return Object.fromEntries(
    Object.entries(agentTools || {}).filter(([toolName]) => !isAgentToolBlockedInDryRun(toolName)),
  );
}

export function applyAgentExecutionModePrompt(systemPrompt, mode) {
  if (!isAgentDryRunMode(mode)) return systemPrompt;

  if (systemPrompt && typeof systemPrompt === 'object' && !Array.isArray(systemPrompt)) {
    return {
      ...systemPrompt,
      dynamicPart: [systemPrompt.dynamicPart, AGENT_DRY_RUN_INSTRUCTIONS].filter(Boolean).join('\n\n'),
    };
  }

  return [systemPrompt, AGENT_DRY_RUN_INSTRUCTIONS].filter(Boolean).join('\n\n');
}
