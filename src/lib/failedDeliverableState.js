// Failed replacement attempts keep the last saved artifact available for
// editing and recovery. Error status still prevents claiming a fresh export.
export function failedDeliverableState(previous, error) {
  return {
    ...previous,
    status: 'error',
    data: previous?.data ?? null,
    error,
    stale: Boolean(previous?.data),
    staleConfidence: previous?.staleConfidence ?? null,
    regeneratingIndex: null,
  };
}
