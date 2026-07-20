import {
  SCION_ADAPTER_TASK_FAMILIES,
  SCION_LESSON_KERNEL_PROMPT_PROTOCOL,
  SCION_LESSON_KERNEL_SYNTHESIS_PROMPT_PROTOCOL,
} from '../../src/lib/scionAdapterTaskScope.js';

export const SCION_COMPACT_KERNEL_DEFAULT_ATTEMPTS = 3;

export function scionCompactKernelMaxAttempts({ taskFamily, promptProtocol, routeReason, recoveryAttempt = 0 } = {}) {
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
    // The normal synthesis pass only needs one valid frozen fact ledger before
    // the grounded adapter takes over. The second seat is conditional in
    // generateCompactLessonKernel: a valid first ledger returns immediately,
    // while a duplicate or malformed ledger receives one focused retry before
    // it can consume a scarce course-level recovery call. An explicit compiler
    // recovery keeps two issue-informed retries for a stubborn failure.
    return Number(recoveryAttempt) > 0 ? 3 : 2;
  }
  return SCION_COMPACT_KERNEL_DEFAULT_ATTEMPTS;
}
