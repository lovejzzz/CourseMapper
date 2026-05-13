import { describe, expect, it } from 'vitest';
import {
  AGENT_DRY_RUN_INSTRUCTIONS,
  AGENT_EXECUTION_MODES,
  applyAgentExecutionModePrompt,
  filterAgentToolsForExecutionMode,
  isAgentToolBlockedInDryRun,
  normalizeAgentExecutionMode,
} from '../agentExecutionMode';

describe('agentExecutionMode', () => {
  const tools = {
    validate_course: { description: 'read' },
    read_deliverable: { description: 'read' },
    edit_course_map: { description: 'write' },
    edit_deliverables: { description: 'write' },
    repair_package_readiness: { description: 'write' },
    generate_slide_images: { description: 'write' },
    respond: { description: 'final' },
  };

  it('normalizes unknown modes to apply', () => {
    expect(normalizeAgentExecutionMode('anything')).toBe(AGENT_EXECUTION_MODES.APPLY);
    expect(normalizeAgentExecutionMode(AGENT_EXECUTION_MODES.DRY_RUN)).toBe(AGENT_EXECUTION_MODES.DRY_RUN);
  });

  it('filters mutating tools in dry-run mode', () => {
    const filtered = filterAgentToolsForExecutionMode(tools, AGENT_EXECUTION_MODES.DRY_RUN);

    expect(filtered.validate_course).toBe(tools.validate_course);
    expect(filtered.read_deliverable).toBe(tools.read_deliverable);
    expect(filtered.edit_course_map).toBeUndefined();
    expect(filtered.edit_deliverables).toBeUndefined();
    expect(filtered.repair_package_readiness).toBeUndefined();
    expect(filtered.generate_slide_images).toBeUndefined();
  });

  it('keeps the full tool registry in apply mode', () => {
    expect(filterAgentToolsForExecutionMode(tools, AGENT_EXECUTION_MODES.APPLY)).toBe(tools);
  });

  it('marks mutating tools as blocked', () => {
    expect(isAgentToolBlockedInDryRun('edit_course_map')).toBe(true);
    expect(isAgentToolBlockedInDryRun('repair_package_readiness')).toBe(true);
    expect(isAgentToolBlockedInDryRun('remember')).toBe(true);
    expect(isAgentToolBlockedInDryRun('validate_course')).toBe(false);
  });

  it('appends dry-run instructions to string and multipart prompts', () => {
    expect(applyAgentExecutionModePrompt('base', AGENT_EXECUTION_MODES.DRY_RUN)).toContain(AGENT_DRY_RUN_INSTRUCTIONS);

    const parts = applyAgentExecutionModePrompt(
      { staticPart: 'static', dynamicPart: 'dynamic' },
      AGENT_EXECUTION_MODES.DRY_RUN,
    );
    expect(parts.staticPart).toBe('static');
    expect(parts.dynamicPart).toContain('dynamic');
    expect(parts.dynamicPart).toContain(AGENT_DRY_RUN_INSTRUCTIONS);
  });
});
