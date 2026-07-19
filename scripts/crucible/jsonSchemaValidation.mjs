function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

/**
 * Validate the JSON-Schema subset emitted by CourseMapper's Scion contracts.
 *
 * The local grammar can accept EOS at a legal JSON boundary before every
 * required property has been written. JSON.parse alone therefore proves only
 * syntax. This validator keeps those partial objects out of the kernel cache.
 * It intentionally supports the contract vocabulary used by this shim rather
 * than attempting to be a general-purpose JSON-Schema implementation.
 */
export function valueConformsToSchema(value, schema) {
  if (schema === true || schema == null) return true;
  if (schema === false || typeof schema !== 'object') return false;

  if ('const' in schema && !sameJsonValue(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => sameJsonValue(value, candidate))) return false;
  if (Array.isArray(schema.allOf) && !schema.allOf.every((branch) => valueConformsToSchema(value, branch)))
    return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((branch) => valueConformsToSchema(value, branch))) return false;
  if (
    Array.isArray(schema.oneOf) &&
    schema.oneOf.filter((branch) => valueConformsToSchema(value, branch)).length !== 1
  ) {
    return false;
  }
  if (schema.not && valueConformsToSchema(value, schema.not)) return false;

  const declaredTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (declaredTypes.length > 0 && !declaredTypes.some((type) => matchesType(value, type))) return false;

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) return false;
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern, 'u').test(value)) return false;
      } catch {
        return false;
      }
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return false;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return false;
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) return false;
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) return false;
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) return false;
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) return false;
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    for (let index = 0; index < Math.min(prefixItems.length, value.length); index += 1) {
      if (!valueConformsToSchema(value[index], prefixItems[index])) return false;
    }
    if (schema.items === false && value.length > prefixItems.length) return false;
    if (schema.items && typeof schema.items === 'object') {
      const start = prefixItems.length > 0 ? prefixItems.length : 0;
      for (let index = start; index < value.length; index += 1) {
        if (!valueConformsToSchema(value[index], schema.items)) return false;
      }
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) return false;
    if (Number.isInteger(schema.minProperties) && Object.keys(value).length < schema.minProperties) return false;
    if (Number.isInteger(schema.maxProperties) && Object.keys(value).length > schema.maxProperties) return false;
    for (const [key, entry] of Object.entries(value)) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        if (!valueConformsToSchema(entry, properties[key])) return false;
      } else if (schema.additionalProperties === false) {
        return false;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        if (!valueConformsToSchema(entry, schema.additionalProperties)) return false;
      }
    }
  }

  return true;
}

export function jsonTextConformsToSchema(text, schema) {
  try {
    return valueConformsToSchema(JSON.parse(String(text || '')), schema);
  } catch {
    return false;
  }
}
