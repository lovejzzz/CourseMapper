// Deployment controls, not authorization. Invalid configured values fail closed.
export function readAuthoringFlags(env = {}) {
  const enabled = (key) => env[key] === undefined || env[key] === 'true';
  return Object.freeze({
    pageTools: enabled('VITE_AUTHORING_PAGE_TOOLS_ENABLED'),
    localWrites: enabled('VITE_AUTHORING_LOCAL_WRITES_ENABLED'),
    apply: enabled('VITE_AUTHORING_APPLY_ENABLED'),
  });
}
export const authoringFlags = readAuthoringFlags(import.meta.env);
