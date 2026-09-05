// Narrow shared source-scope guard. Use the same semantic-token normalization
// as callers so calibrated hints cannot drift from stemmed course tokens.
import { semanticIdentityTokens } from '../lessonSemanticRelevance.js';

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
  [/mnist|document recognition/, ['vision', 'recognition', 'digit', 'handwriting']],
  [/cancer statistics/, ['cancer', 'oncology', 'tumor', 'tumour']],
  [/quantum espresso|shelx/, ['quantum', 'materials science', 'crystallography', 'crystal', 'chemistry', 'physics']],
  [/prisma/, ['systematic', 'synthesis', 'syntheses', 'meta-analysis', 'meta-analyses', 'metaanalysis']],
  [/r:\s*a language/, ['programming', 'rstats']],
  [/lowry|protein measurement/, ['protein', 'biochemistry', 'biochemical', 'assay']],
  [
    /xgboost|gradient boosting/,
    ['boosting', 'classification', 'regression', 'machine learning foundation', 'applied machine learning'],
  ],
  [
    /imagej|molecule archive/,
    ['microscopy', 'bioimage', 'scijava', 'molecule', 'biomedical image', 'bioimage analysis'],
  ],
  [/\bfsl\b/, ['neuroimaging', 'neuroscience', 'brain', 'brain imaging']],
  [/pascal voc|iot vision/, ['vision', 'detection', 'imaging', 'iot', 'robotics']],
  [/data clustering/, ['clustering', 'cluster', 'unsupervised', 'segmentation', 'machine learning foundation']],
  [
    /nia-aa|alzheimer/,
    ['alzheimer', 'dementia', 'neurology', 'gerontology', 'cognitive aging', 'cognitive neuroscience'],
  ],
  [/hypertension/, ['hypertension', 'cardiovascular', 'blood pressure']],
  [/ces-d/, ['depression', 'depressive', 'mental health']],
];

const CALIBRATED_OFFENDER_SCOPE_HINTS = OFFENDER_SCOPE_HINTS.map(([pattern, hints]) => [
  pattern,
  hints.map((hint) => {
    const tokens = semanticIdentityTokens(hint);
    if (tokens.length === 0) {
      throw new Error(`Known-offender scope hint must normalize to at least one token: ${hint}`);
    }
    return tokens;
  }),
]);

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
  const inputTokens = conceptTokenSet instanceof Set ? [...conceptTokenSet] : conceptTokenSet || [];
  // Callers pass token sets produced by several established tokenizers. Keep
  // their existing identities as well as the shared semantic normalization:
  // re-stemming an already stemmed plural (for example `analys`) is not
  // idempotent and would otherwise erase a valid calibrated match.
  const tokens = new Set(
    inputTokens.flatMap((token) => {
      const literal = String(token || '')
        .trim()
        .toLowerCase();
      return literal ? [literal, ...semanticIdentityTokens(literal)] : [];
    }),
  );
  const row = CALIBRATED_OFFENDER_SCOPE_HINTS.find(([pattern]) => pattern.test(normalized));
  if (!row) return false;
  return row[1].some((hintTokens) => hintTokens.every((token) => tokens.has(token)));
}

const OFFENDER_YIELD_GENERIC_TOKENS = new Set(
  [
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
  ].flatMap((token) => semanticIdentityTokens(token)),
);

for (const [, hints] of CALIBRATED_OFFENDER_SCOPE_HINTS) {
  for (const hintTokens of hints) {
    if (hintTokens.every((token) => OFFENDER_YIELD_GENERIC_TOKENS.has(token))) {
      throw new Error(`Known-offender scope hint cannot be entirely generic: ${hintTokens.join(' ')}`);
    }
  }
}

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
