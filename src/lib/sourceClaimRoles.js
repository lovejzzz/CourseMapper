function normalizedDefinitionIdentity(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Exact quotation proves source support, not pedagogical role. Only an
// explicit grammatical definition may populate a glossary definition field.
export function sourceClaimDefinesTerm({ term = '', claim = '' } = {}) {
  const termIdentity = normalizedDefinitionIdentity(term).replace(/^(?:a|an|the)\s+/, '');
  let surface = String(claim || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!termIdentity || !surface) return false;
  surface = surface.replace(/^(?:in|within)\s+[^,]{2,140},\s*/i, '');

  const definitionalCopula =
    /\b(?:is|are)\s+(?:(?:commonly|formally|generally|also)\s+)*(?:(?:a|an|the|any)\s+|one\s+of\b|defined\s+as\b)|\bare\s+(?!(?:often|primarily|typically|usually|sometimes|widely|used)\b)(?:[\p{L}-]+\s+){0,3}(?:categories|classes|definitions|displays|distributions|entities|estimates|forms|frameworks|intervals|measures|methods|models|objects|processes|relationships|representations|structures|summaries|systems|types|values)\b|\b(?:refers?\s+to|means?|denotes?|describes?\s+(?:a|an|the)\b)/iu;
  const match = definitionalCopula.exec(surface);
  if (!match || match.index <= 0) return false;

  const subject = normalizedDefinitionIdentity(surface.slice(0, match.index))
    .replace(/^(?:a|an|the)\s+/, '')
    .replace(/\b(?:also known as|abbreviated as|called)\b.*$/, '')
    .trim();
  if (!subject) return false;
  return (
    subject === termIdentity ||
    subject.startsWith(`${termIdentity} `) ||
    subject.endsWith(` ${termIdentity}`) ||
    subject.includes(` ${termIdentity} `)
  );
}
