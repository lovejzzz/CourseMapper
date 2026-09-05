import { Validator } from '@cfworker/json-schema';

// The schemas come from the application's contract builders. Interpret them
// without eval/new Function so production's Content Security Policy stays intact.
const validators = new WeakMap();

const classroomSchema = {
  type: 'object',
  required: ['lessons'],
  properties: {
    lessons: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['assignmentCore', 'studyGuide'],
        properties: {
          assignmentCore: {
            type: 'object',
            required: ['td', 'pa'],
            properties: {
              td: { type: 'string', minLength: 1 },
              pa: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', minLength: 1 } },
            },
          },
          studyGuide: {
            type: 'object',
            required: ['sm', 'rs'],
            properties: {
              sm: { type: 'string', minLength: 1 },
              rs: { type: 'string', minLength: 1 },
            },
          },
          workedExample: {
            type: 'object',
            required: ['wp', 'ws', 'wr'],
            properties: {
              wp: { type: 'string', minLength: 1 },
              ws: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string', minLength: 1 } },
              wr: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  },
};

export function assessScionClassroomResponse(text) {
  const result = assessScionStructuredResponse(text, classroomSchema);
  return {
    ...result,
    issues: result.issues.map((issue) => issue.replace('response-contract:', 'classroom-contract:')),
  };
}

export function assessScionStructuredResponse(text, schema) {
  if (!schema) return { needsRetry: false, issues: [] };
  // Production callers pass { name, schema, strict }; tests and smaller
  // callers may pass the bare JSON Schema. Validate the actual contract.
  schema = schema.schema || schema;
  let value;
  try {
    value = JSON.parse(
      String(text)
        .trim()
        .replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1'),
    );
  } catch {
    return { needsRetry: true, issues: ['response-contract:invalid-json'] };
  }
  let validator = validators.get(schema);
  if (!validator) {
    validator = new Validator(schema, '7', false);
    validators.set(schema, validator);
  }
  const result = validator.validate(value);
  return {
    needsRetry: !result.valid,
    issues: result.errors
      .slice(0, 8)
      .map((error) => `response-contract:${error.instanceLocation || '#'}:${error.error}`),
  };
}
