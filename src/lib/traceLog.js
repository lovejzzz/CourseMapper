export function traceLog(prefix, payload = {}, level = 'info') {
  if (typeof console === 'undefined') return;
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
  const seen = new WeakSet();
  let serialized = '';
  try {
    serialized = JSON.stringify(payload, (_key, value) => {
      if (typeof value === 'bigint') return String(value);
      if (typeof value === 'string' && value.length > 1200) return `${value.slice(0, 1200)}...[${value.length}]`;
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  } catch (err) {
    serialized = JSON.stringify({ traceError: err?.message || String(err || 'trace serialization failed') });
  }
  console[method](`${prefix} ${serialized || '{}'}`);
}
