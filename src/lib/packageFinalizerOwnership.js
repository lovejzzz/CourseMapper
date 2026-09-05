export function detachPackageFinalizer(ref) {
  ref.current = null;
}

export function releasePackageFinalizer(ref, promise) {
  if (ref.current === promise) detachPackageFinalizer(ref);
}

export async function continuePackageFinalizer(prior, epochRef, epoch, run) {
  try {
    await prior;
  } catch {}
  if (epochRef.current !== epoch) return null;
  return run();
}
