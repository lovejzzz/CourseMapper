import { describe, expect, it } from 'vitest';

import {
  SCION_ADAPTER_TASK_FAMILIES,
  SCION_ADAPTER_TASK_SCOPE_IDENTITY_ALGORITHM,
  SCION_ADAPTER_TASK_SCOPE_PROTOCOL,
  SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
  SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
  resolveScionAdapterTaskRoute,
  normalizeScionAdapterTaskFamily,
  scionAdapterTaskFamilyForPairKind,
  scionAdapterTaskFamilyForProviderTask,
  validateScionAdapterTaskScope,
} from '../src/lib/scionAdapterTaskScope.js';

const HASH = 'a'.repeat(64);

function scope() {
  return {
    protocol: SCION_ADAPTER_TASK_SCOPE_PROTOCOL,
    mode: 'allowlist',
    families: [
      { id: SCION_ADAPTER_TASK_FAMILIES.SOURCE_KEY_TERM_ATOM, rows: 93 },
      { id: SCION_ADAPTER_TASK_FAMILIES.SOURCE_MC_ITEM_ATOM, rows: 50 },
    ].sort((left, right) => left.id.localeCompare(right.id)),
    unclassifiedPolicy: 'base-only',
    compositePolicy: 'exact-family-only',
    identity: { algorithm: SCION_ADAPTER_TASK_SCOPE_IDENTITY_ALGORITHM, sha256: HASH },
  };
}

describe('Scion adapter task scope', () => {
  it('maps training atoms and runtime calls to explicit, non-interchangeable families', () => {
    expect(scionAdapterTaskFamilyForPairKind('key-term')).toBe('source-key-term-atom');
    expect(scionAdapterTaskFamilyForPairKind('mc-item')).toBe('source-mc-item-atom');
    expect(scionAdapterTaskFamilyForPairKind('lesson-kernel')).toBe('source-grounded-lesson-kernel');
    expect(
      scionAdapterTaskFamilyForProviderTask('blueprintEnrichment', {
        promptProtocol: SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
      }),
    ).toBe('source-grounded-lesson-kernel');
    expect(
      scionAdapterTaskFamilyForProviderTask('blueprintEnrichment', {
        promptProtocol: SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
      }),
    ).toBe('lesson-kernel-synthesis');
    expect(scionAdapterTaskFamilyForProviderTask('blueprintEnrichment')).toBe('lesson-kernel-synthesis');
    expect(scionAdapterTaskFamilyForProviderTask('scionPass')).toBe('compiler-repair');
    expect(scionAdapterTaskFamilyForProviderTask('course-map')).toBe('course-map');
    expect(scionAdapterTaskFamilyForProviderTask('chat')).toBe('agent-advisory');
    expect(scionAdapterTaskFamilyForProviderTask('verification')).toBe('compiler-repair');
    expect(scionAdapterTaskFamilyForProviderTask('something-new')).toBe('unclassified');
    expect(normalizeScionAdapterTaskFamily('made-up')).toBe('unclassified');
  });

  it('accepts a sorted, row-complete allowlist', () => {
    expect(validateScionAdapterTaskScope(scope(), { expectedRows: 143 })).toMatchObject({
      valid: true,
      issues: [],
      totalRows: 143,
    });
  });

  it('routes only an exact trained family to the adapter', () => {
    const manifest = { training: { pairCount: 143, taskScope: scope() } };
    expect(
      resolveScionAdapterTaskRoute({ manifest, taskFamily: SCION_ADAPTER_TASK_FAMILIES.SOURCE_MC_ITEM_ATOM }),
    ).toMatchObject({ mode: 'adapter', adapterActive: true, reason: 'exact-task-family-match' });
    expect(
      resolveScionAdapterTaskRoute({ manifest, taskFamily: SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL }),
    ).toMatchObject({ mode: 'base-only', adapterActive: false, reason: 'legacy-task-family-too-broad' });
    expect(resolveScionAdapterTaskRoute({ manifest, taskFamily: 'made-up' })).toMatchObject({
      mode: 'base-only',
      adapterActive: false,
      taskFamily: 'unclassified',
      reason: 'unclassified-task',
    });
  });

  it('fails a lesson-kernel adapter closed unless the serving prompt protocol is exact', () => {
    const lessonScope = scope();
    lessonScope.families = [{ id: SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL, rows: 143 }];
    const manifest = { training: { pairCount: 143, taskScope: lessonScope } };
    expect(
      resolveScionAdapterTaskRoute({
        manifest,
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL,
      }),
    ).toMatchObject({
      mode: 'base-only',
      reason: 'prompt-protocol-mismatch',
      expectedPromptProtocol: SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
    });
    expect(
      resolveScionAdapterTaskRoute({
        manifest,
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL,
        promptProtocol: SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
      }),
    ).toMatchObject({
      mode: 'adapter',
      reason: 'exact-task-family-match',
      promptProtocol: SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
    });
    expect(
      resolveScionAdapterTaskRoute({
        manifest,
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS,
        promptProtocol: SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
      }),
    ).toMatchObject({
      mode: 'base-only',
      reason: 'grounded-stage-available',
    });
    expect(
      resolveScionAdapterTaskRoute({
        manifest,
        taskFamily: SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS,
        promptProtocol: SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
      }),
    ).toMatchObject({ mode: 'base-only', reason: 'task-family-out-of-scope' });
  });

  it('fails closed when row totals or identity fields are invalid', () => {
    const invalid = scope();
    invalid.families[0].rows = 1;
    invalid.identity.sha256 = 'not-a-hash';
    expect(validateScionAdapterTaskScope(invalid, { expectedRows: 143 })).toMatchObject({ valid: false });
    expect(validateScionAdapterTaskScope(invalid, { expectedRows: 143 }).issues).toEqual(
      expect.arrayContaining(['task-scope-row-total', 'task-scope-identity-sha256']),
    );
  });
});
