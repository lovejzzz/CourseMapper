const ALL_LESSONS_RE = /\b(?:every|each|all)\s+(?:lesson|session|module|week)s?\b/i;
const VISUAL_NOUN_RE = /\b(?:visual|image|photograph|photo|diagram|chart|graph|map|illustration|artwork|figure)s?\b/i;
const ANALYSIS_RE = /\b(?:analy[sz]e|inspect|interpret|evaluate|read)\b/i;
const ANNOTATION_RE = /\b(?:annotat(?:e|es|ed|ing|ion)|mark(?:s|ed|ing)?|label(?:s|ed|ing)?)\b/i;
const COMPARISON_RE = /\b(?:compar(?:e|es|ed|ing|ison)|contrast(?:s|ed|ing)?)\b/i;
const OPEN_RIGHTS_RE = /\b(?:open(?:ly)?[- ]licensed|public[- ]domain|creative commons|cc0)\b/i;
const STRICT_OPEN_RIGHTS_RE =
  /\b(?:only|exclusively)\b[^.!?]{0,96}\b(?:open(?:ly)?[- ]licensed|public[- ]domain|creative commons|cc0)\b|\b(?:open(?:ly)?[- ]licensed|public[- ]domain|creative commons|cc0)\b[^.!?]{0,96}\b(?:only|exclusively)\b/i;
const ORIGINAL_NATIVE_ALLOWED_RE =
  /\b(?:original|coursemapper[- ]native|native)\b[^.!?]{0,48}\b(?:visual|image|diagram|chart|graph|map|illustration|artwork|figure|asset)s?\b/i;
const ATTRIBUTION_RE = /\b(?:attribution|attribute|credit|citation|cite|license|rights?)\b/i;

function normalizeBrief(value = '') {
  return String(value || '')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function explicitFunctionalVisualClause(sourceBrief = '') {
  return String(sourceBrief || '')
    .replace(/[\u2010-\u2015]/g, '-')
    .split(/(?:\r?\n)+|(?<=[.!?])\s+/u)
    .map(normalizeBrief)
    .find(
      (clause) =>
        ALL_LESSONS_RE.test(clause) &&
        VISUAL_NOUN_RE.test(clause) &&
        ANALYSIS_RE.test(clause) &&
        (ANNOTATION_RE.test(clause) || COMPARISON_RE.test(clause)),
    );
}

/**
 * Recover only explicit, course-wide functional-visual requirements from a
 * source brief. This is a narrow contract parser, not a topic classifier: a
 * brief must name every/each/all lessons, a visual object, an analysis move,
 * and an annotation or comparison product before the compiler changes output.
 */
export function extractBriefQualityContract(sourceBrief = '', { lessonCount = 0 } = {}) {
  const text = normalizeBrief(sourceBrief);
  const requirementClause = explicitFunctionalVisualClause(sourceBrief);
  const normalizedLessonCount =
    Number.isInteger(Number(lessonCount)) && Number(lessonCount) > 0 ? Number(lessonCount) : 0;
  if (!text || !requirementClause) return null;

  const productActions = [
    ...(ANNOTATION_RE.test(requirementClause) ? ['annotate'] : []),
    ...(COMPARISON_RE.test(requirementClause) ? ['compare'] : []),
  ];
  if (productActions.length === 0) return null;

  const openRightsBoundary = OPEN_RIGHTS_RE.test(text);
  const strictOpenRightsBoundary = openRightsBoundary && STRICT_OPEN_RIGHTS_RE.test(text);
  const originalNativeAllowed = !strictOpenRightsBoundary || ORIGINAL_NATIVE_ALLOWED_RE.test(text);
  const attributionRequired = openRightsBoundary || ATTRIBUTION_RE.test(text);
  return {
    protocol: 'coursemapper-brief-quality-contract-v1',
    scope: 'all-lessons',
    requiredLessonNumbers: normalizedLessonCount
      ? Array.from({ length: normalizedLessonCount }, (_, index) => index + 1)
      : [],
    functionalVisual: {
      required: true,
      objectClass: 'concrete-visual',
      processAction: 'analyze',
      productActions,
      productRequirement: productActions.length > 1 ? 'one-or-more' : 'required',
      visibleTaskReferenceRequired: true,
      assessmentLinkRequired: true,
      provenanceRequired: true,
    },
    rightsBoundary: {
      mode:
        strictOpenRightsBoundary && !originalNativeAllowed
          ? 'open-or-public-domain'
          : openRightsBoundary
            ? 'open-or-public-domain-or-original-native'
            : 'attributed-or-original-native',
      attributionRequired,
      externalAssetAllowedOnlyWithInspectableRights: openRightsBoundary,
      originalNativeAllowed,
      originalNativeAssetDisclosure:
        'Original course-created vector; no external image asset. The course owner controls downstream reuse terms.',
    },
    claimBoundary:
      'This contract records explicit authoring requirements. It does not establish visual relevance, rights clearance, accessibility, or classroom effectiveness without artifact inspection.',
  };
}

export function lessonRequiresFunctionalVisual(contract, lessonNumber) {
  if (contract?.protocol !== 'coursemapper-brief-quality-contract-v1') return false;
  if (contract?.scope !== 'all-lessons' || contract?.functionalVisual?.required !== true) return false;
  const required = Array.isArray(contract.requiredLessonNumbers) ? contract.requiredLessonNumbers : [];
  return required.length === 0 || required.includes(Number(lessonNumber));
}
