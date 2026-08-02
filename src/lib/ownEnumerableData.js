export function setOwnEnumerableData(target, key, value) {
  Object.defineProperty(target, String(key), {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return target;
}
