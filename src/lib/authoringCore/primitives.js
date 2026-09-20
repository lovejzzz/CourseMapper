export const PROTOCOL = 'coursemapper.authoring.v2';
export const FEATURES = ['lessonPlans', 'assignments', 'rubrics'];
export const LIMITS = { submitBytes: 131072, draftBytes: 5242880, pageBytes: 12288, maxLessons: 52 };
export class AuthoringError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
export function assert(condition, code, message, details) {
  if (!condition) throw new AuthoringError(code, message, details);
}
export const clone = (value) => structuredClone(value);
export const bytes = (value) =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export async function hash(value) {
  return Array.from(
    new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export const id = () => globalThis.crypto.randomUUID();
