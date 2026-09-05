import { COMPACT_SCHEMAS } from './deliverablePrompts';

const SCHEMA_CACHE = new Map();

function skeletonToJsonSchema(value) {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: skeletonToJsonSchema(value[0] ?? ''),
    };
  }
  if (value && typeof value === 'object') {
    const properties = Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, skeletonToJsonSchema(nested)]),
    );
    return {
      type: 'object',
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    };
  }
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

function safeSchemaName(featureId) {
  return `coursemapper_${String(featureId || 'deliverable').replace(/[^a-z0-9_]+/gi, '_')}`;
}

export function getDeliverableResponseSchema(featureId) {
  if (!featureId || featureId.startsWith('custom_')) return null;
  if (SCHEMA_CACHE.has(featureId)) return SCHEMA_CACHE.get(featureId);

  const compactSchema = COMPACT_SCHEMAS[featureId];
  if (!compactSchema) return null;

  try {
    const skeleton = JSON.parse(compactSchema);
    const schema = {
      name: safeSchemaName(featureId),
      strict: true,
      schema: skeletonToJsonSchema(skeleton),
    };
    SCHEMA_CACHE.set(featureId, schema);
    return schema;
  } catch {
    return null;
  }
}
