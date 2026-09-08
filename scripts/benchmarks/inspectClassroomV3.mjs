// Corpus integrity/completeness only. This never runs or scores the product.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dimensions = ['quantity', 'source', 'experiment'];
const splits = ['development', 'reserved'];
const languages = ['en', 'zh'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function inspectCorpus(root) {
  const errors = [];
  const missing = [];
  const cases = [];
  const families = new Map();
  const bodies = new Map();
  const inputNames = (await fs.readdir(path.join(root, 'inputs'))).filter((name) => name.endsWith('.json')).sort();
  const referenceNames = (await fs.readdir(path.join(root, 'references')))
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const name of new Set([...inputNames, ...referenceNames])) {
    if (!inputNames.includes(name) || !referenceNames.includes(name)) {
      errors.push(`${name}: missing input/reference pair`);
      continue;
    }
    const inputBytes = await fs.readFile(path.join(root, 'inputs', name));
    const referenceBytes = await fs.readFile(path.join(root, 'references', name));
    let input, reference;
    try {
      input = JSON.parse(inputBytes);
      reference = JSON.parse(referenceBytes);
    } catch {
      errors.push(`${name}: invalid JSON`);
      continue;
    }
    const id = name.slice(0, -5);
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      !reference ||
      typeof reference !== 'object' ||
      Array.isArray(reference)
    ) {
      errors.push(`${id}: input and reference must be objects`);
      continue;
    }
    if (
      reference.id !== id ||
      !dimensions.includes(reference.family) ||
      !splits.includes(reference.split) ||
      !languages.includes(reference.language) ||
      !['supported', 'needs-input', 'out-of-scope'].includes(reference.scope)
    )
      errors.push(`${id}: invalid identity/dimensions`);
    if (!reference.sourceFamily || !reference.authorKind || !reference.reviewerKind)
      errors.push(`${id}: missing provenance`);
    // The narrow input contract keeps evaluator-only labels and solutions out
    // of the product payload. Source prose may legitimately contain calculations.
    if (
      Object.keys(input).some((key) => !['request', 'objective', 'sources'].includes(key)) ||
      typeof input.request !== 'string' ||
      !input.request.trim() ||
      typeof input.objective !== 'string' ||
      !input.objective.trim() ||
      !Array.isArray(input.sources) ||
      !input.sources.length
    )
      errors.push(`${id}: invalid product input contract`);
    const sourceIds = new Set();
    for (const source of Array.isArray(input.sources) ? input.sources : []) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        errors.push(`${id}: invalid source record`);
        continue;
      }
      if (
        !source.id ||
        typeof source.text !== 'string' ||
        !source.text.trim() ||
        Object.keys(source).some((key) => !['id', 'text'].includes(key)) ||
        sourceIds.has(source.id)
      )
        errors.push(`${id}: invalid/duplicate source record`);
      sourceIds.add(source.id);
    }
    for (const key of ['judgment', 'editCheck', 'inputIsolation'])
      if (typeof reference[key] !== 'string' || !reference[key].trim()) errors.push(`${id}: missing ${key}`);
    for (const key of [
      reference.acceptableReasoning ? 'acceptableReasoning' : 'acceptableProcedure',
      'reject',
      'requiredScoring',
    ])
      if (
        !Array.isArray(reference[key]) ||
        !reference[key].length ||
        reference[key].some((text) => typeof text !== 'string' || !text.trim())
      )
        errors.push(`${id}: invalid ${key}`);
    const contrasts = reference.contrastResponses;
    if (
      contrasts !== undefined &&
      (!Array.isArray(contrasts) ||
        contrasts.some(
          (item) =>
            !item ||
            typeof item.response !== 'string' ||
            !item.response.trim() ||
            typeof item.judgment !== 'string' ||
            !item.judgment.trim(),
        ))
    )
      errors.push(`${id}: invalid contrast responses`);
    if (!Array.isArray(contrasts) || contrasts.length < 4) missing.push(`${id}: fewer than four contrast responses`);
    const previousFamily = families.get(reference.sourceFamily);
    if (previousFamily)
      errors.push(
        `${id}: source family also used by ${previousFamily}; variants cannot count as independent base cases`,
      );
    families.set(reference.sourceFamily, id);
    const body = (Array.isArray(input.sources) ? input.sources : [])
      .map((source) => source?.text || '')
      .join('\n')
      .normalize('NFKC')
      .replace(/\s+/gu, ' ')
      .trim();
    if (bodies.has(body)) errors.push(`${id}: duplicate source prose with ${bodies.get(body)}`);
    bodies.set(body, id);
    cases.push({
      id,
      family: reference.family,
      split: reference.split,
      language: reference.language,
      scope: reference.scope,
      sourceFamily: reference.sourceFamily,
      inputSha256: sha256(inputBytes),
      referenceSha256: sha256(referenceBytes),
    });
  }
  const distribution = [];
  for (const family of dimensions)
    for (const split of splits) {
      const expectedSupported = split === 'development' ? 5 : 3;
      const group = cases.filter((item) => item.family === family && item.split === split);
      for (const language of languages) {
        const rows = group.filter((item) => item.language === language);
        const supported = rows.filter((item) => item.scope === 'supported').length;
        const limits = rows.length - supported;
        distribution.push({ family, split, language, supported, limits, expectedSupported, expectedLimits: 1 });
        if (supported !== expectedSupported || limits !== 1)
          missing.push(
            `${family}/${split}/${language}: need ${expectedSupported} supported + 1 limit, have ${supported} + ${limits}`,
          );
      }
      for (const scope of ['needs-input', 'out-of-scope'])
        if (group.filter((item) => item.scope === scope).length !== 1)
          missing.push(`${family}/${split}: need exactly one ${scope}`);
    }
  if (cases.length !== 60) missing.push(`Need 60 base cases; found ${cases.length}`);
  // No inspection result certifies pedagogical quality, semantic family
  // independence, model completion, or a frozen release manifest.
  return {
    status: errors.length ? 'invalid' : missing.length ? 'incomplete' : 'structurally-complete-unreviewed',
    productRuns: 0,
    frozen: false,
    errors,
    missing,
    distribution,
    cases,
    limitation:
      'Human content/family review and an immutable manifest are still required. This is not a model or classroom pass.',
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || 'benchmarks/classroom/v3';
  const report = await inspectCorpus(root);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
