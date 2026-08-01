// Narrow shared source-scope guard. Keep this module dependency-free so the
// compiler and repair pipeline can reject known cross-discipline evidence
// without pulling the complete grader pattern table into generation chunks.

export const KNOWN_OFFENDER_CITATIONS = [
  'MNIST',
  'Gradient-Based Learning Applied to Document Recognition',
  'Global cancer statistics',
  'QUANTUM ESPRESSO',
  'PRISMA',
  'R: A Language',
  'SHELX',
  'Lowry',
  'protein measurement',
  'xgboost',
  'XGBoost',
  'ImageJ',
  'Molecule Archive',
  'FSL',
  'Pascal VOC',
  'IoT vision',
  'gradient boosting',
  'data clustering',
  'NIA-AA',
  'Alzheimer',
  'hypertension guidelines',
  'CES-D',
];

const KNOWN_OFFENDER_PATTERNS = [
  /\bMNIST\b/i,
  /\bGradient-Based Learning Applied to Document Recognition\b/i,
  /\bGlobal cancer statistics\b/i,
  /\bQUANTUM ESPRESSO\b/i,
  /\bPRISMA\b/i,
  /\bR:\s*A Language\b/i,
  /\bSHELX\b/i,
  /\bLowry\b(?=[^.!?]{0,80}\b(?:protein|assay|measurement|biochem))/i,
  /\bprotein measurement\b/i,
  /\bxgboost\b/i,
  /\bXGBoost\b/i,
  /\bImageJ(?:2)?\b/i,
  /\bMolecule Archives?\b/i,
  /\bFSL\b/i,
  /\bPascal VOC\b/i,
  /\bIoT vision\b/i,
  /\bgradient boosting\b/i,
  /\bdata clustering\b/i,
  /\bNIA-AA\b/i,
  /\bAlzheimer(?:'s)?\b/i,
  /\bhypertension guidelines\b/i,
  /\bCES-D\b/i,
];

const OFFENDER_SCOPE_HINTS = [
  [/mnist|document recognition/, ['machine', 'learning', 'vision', 'recognition', 'digit', 'handwriting']],
  [/cancer statistics/, ['cancer', 'oncology', 'tumor', 'tumour']],
  [/quantum espresso|shelx/, ['quantum', 'materials', 'crystallography', 'crystal', 'chemistry', 'physics']],
  [/prisma/, ['systematic', 'synthesis', 'metaanalysis', 'meta-analysis']],
  [/lowry|protein measurement/, ['protein', 'biochemistry', 'biochemical', 'assay']],
  [/xgboost|gradient boosting/, ['boosting', 'machine', 'learning', 'classification', 'regression']],
  [/imagej|molecule archive/, ['image', 'imaging', 'microscopy', 'biomedical', 'bioimage', 'scijava', 'molecule']],
  [/\bfsl\b/, ['neuroimaging', 'neuroscience', 'brain', 'imaging']],
  [/pascal voc|iot vision/, ['vision', 'detection', 'imaging', 'iot', 'robotics']],
  [/nia-aa|alzheimer/, ['alzheimer', 'dementia', 'cognitive', 'neurology', 'gerontology']],
  [/hypertension/, ['hypertension', 'cardiovascular', 'blood', 'pressure']],
  [/ces-d/, ['depression', 'depressive', 'mental', 'psychology', 'screening']],
];

export function matchesKnownOffender(title) {
  const text = String(title || '');
  if (!text) return null;
  for (let index = 0; index < KNOWN_OFFENDER_PATTERNS.length; index += 1) {
    if (KNOWN_OFFENDER_PATTERNS[index].test(text)) return KNOWN_OFFENDER_CITATIONS[index];
  }
  return null;
}

export function knownOffenderFitsScope(offender, conceptTokenSet) {
  const normalized = String(offender || '').toLowerCase();
  const tokens = conceptTokenSet instanceof Set ? conceptTokenSet : new Set(conceptTokenSet || []);
  const row = OFFENDER_SCOPE_HINTS.find(([pattern]) => pattern.test(normalized));
  if (!row) return false;
  return row[1].some((token) => tokens.has(token));
}

const OFFENDER_YIELD_GENERIC_TOKENS = new Set([
  'statistics',
  'statistical',
  'statistic',
  'analysis',
  'analyses',
  'analytic',
  'study',
  'studies',
  'data',
  'dataset',
  'review',
  'research',
  'method',
  'methods',
  'methodology',
  'model',
  'models',
  'modeling',
  'modelling',
  'evidence',
  'finding',
  'findings',
  'result',
  'results',
  'approach',
  'survey',
  'introduction',
  'global',
  'world',
  'general',
  'application',
  'applications',
  'applied',
  'system',
  'systems',
  'theory',
  'framework',
  'measurement',
  'estimate',
  'estimates',
  'estimation',
]);

export function blacklistYieldsToTopicalOverlap(
  titleTokenSet,
  conceptTokenSet,
  { disciplineNameTokens = [], minShared = 2 } = {},
) {
  if (!titleTokenSet || titleTokenSet.size === 0) return false;
  if (!conceptTokenSet || conceptTokenSet.size === 0) return false;
  const ignored = new Set(OFFENDER_YIELD_GENERIC_TOKENS);
  for (const token of disciplineNameTokens) ignored.add(String(token || '').toLowerCase());
  let shared = 0;
  for (const token of titleTokenSet) {
    if (ignored.has(token)) continue;
    if (conceptTokenSet.has(token)) shared += 1;
    if (shared >= minShared) return true;
  }
  return false;
}
