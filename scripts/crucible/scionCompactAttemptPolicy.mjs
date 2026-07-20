import {
  SCION_ADAPTER_TASK_FAMILIES,
  SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
  SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
} from '../../src/lib/scionAdapterTaskScope.js';

export const SCION_COMPACT_KERNEL_DEFAULT_ATTEMPTS = 3;

export function scionCompactKernelMaxAttempts({ taskFamily, promptProtocol, routeReason } = {}) {
  if (
    taskFamily === SCION_ADAPTER_TASK_FAMILIES.SOURCE_GROUNDED_LESSON_KERNEL &&
    promptProtocol === SCION_LESSON_KERNEL_PROMPT_PROTOCOL
  ) {
    return 1;
  }
  if (
    taskFamily === SCION_ADAPTER_TASK_FAMILIES.LESSON_KERNEL_SYNTHESIS &&
    promptProtocol === SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL &&
    routeReason === 'grounded-stage-available'
  ) {
    return 1;
  }
  return SCION_COMPACT_KERNEL_DEFAULT_ATTEMPTS;
}
