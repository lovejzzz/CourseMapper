/**
 * Close only JSON containers that the model has already opened.
 *
 * Grammar-constrained local generation can accept EOS after a complete inner
 * value while the enclosing array/object still needs its final delimiters.
 * This repair is intentionally structural: it never invents a string, scalar,
 * key, comma, or field. If appending the exact open-container stack does not
 * make the original prefix valid JSON, the prefix is returned unchanged and
 * the application's parser/admission layer rejects it normally.
 */
import { valueConformsToSchema } from './jsonSchemaValidation.mjs';

export function closeJsonContainersAtEof(value, { schema = null } = {}) {
  const text = String(value || '').trim();
  if (!text) return { text, addedClosers: '' };
  try {
    JSON.parse(text);
    return { text, addedClosers: '' };
  } catch {
    // Continue only when exact structural closure can make the prefix valid.
  }

  const stack = [];
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') {
      if (stack.pop() !== char) return { text, addedClosers: '' };
    }
  }
  if (inString || escaped || stack.length === 0) return { text, addedClosers: '' };

  const addedClosers = stack.reverse().join('');
  const closed = `${text}${addedClosers}`;
  try {
    const parsed = JSON.parse(closed);
    if (schema && !valueConformsToSchema(parsed, schema)) return { text, addedClosers: '' };
    return { text: closed, addedClosers };
  } catch {
    return { text, addedClosers: '' };
  }
}
