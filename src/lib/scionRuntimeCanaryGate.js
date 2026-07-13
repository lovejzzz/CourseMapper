const QUERY = 'scion-runtime-canary';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function enabled(locationLike) {
  if (!LOCAL_HOSTS.has(String(locationLike?.hostname || '').toLowerCase())) return false;
  try {
    return new URL(locationLike.href).searchParams.get(QUERY) === '1';
  } catch {
    return false;
  }
}

export function armScionRuntimeCanary({
  locationLike = globalThis.location,
  globalLike = globalThis,
  loadBridge = () => import('./scionRuntimeCanaryBridge'),
} = {}) {
  if (!enabled(locationLike)) return null;
  const ready = Promise.resolve()
    .then(loadBridge)
    .then((bridge) => bridge.installScionRuntimeCanaryBridge({ locationLike, globalLike }));
  Object.defineProperty(globalLike, '__scionRuntimeCanaryReady', {
    value: ready,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return ready;
}
