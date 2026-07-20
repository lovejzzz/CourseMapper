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
    // the grounded adapter takes over. An explicit compiler recovery means
    // that ledger already failed once, so allow two issue-informed retries
    // inside the same recovery seat. Real-model evidence showed that the
    // first retry can fix the original defect while introducing one bounded
    // fact-length violation; the second retry closes that last admission gap.
    return Number(recoveryAttempt) > 0 ? 3 : 1;
  }
  return SCION_COMPACT_KERNEL_DEFAULT_ATTEMPTS;
}
