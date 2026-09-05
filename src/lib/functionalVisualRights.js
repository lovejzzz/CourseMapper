const OPEN_ASSET_RIGHTS = new Set(['open-licensed', 'public-domain']);

function clean(value) {
  return String(value || '').trim();
}

export function functionalVisualAssetRightsClass(specimen = {}) {
  const declared = clean(specimen?.rightsBinding?.assetRightsClass);
  if (declared) return declared;
  if (specimen?.sourceBinding?.resolution === 'native-evidence-specimen') {
    return 'original-native-owner-controlled';
  }
  return 'unverified-external';
}

export function evaluateFunctionalVisualRights(contract = {}, specimen = {}) {
  const nativeSourceStructurallyResolved = Boolean(
    specimen?.sourceBinding?.resolution === 'native-evidence-specimen' &&
    clean(specimen?.sourceBinding?.verificationRule) &&
    clean(specimen?.rightsBinding?.disclosure),
  );
  const assetRightsClass = functionalVisualAssetRightsClass(specimen);
  const openRightsRequired = contract?.rightsBoundary?.externalAssetAllowedOnlyWithInspectableRights === true;
  const originalNativeAllowed = contract?.rightsBoundary?.originalNativeAllowed !== false;
  const isOpenAsset = OPEN_ASSET_RIGHTS.has(assetRightsClass);
  const isOriginalNative = specimen?.sourceBinding?.resolution === 'native-evidence-specimen';
  const rightsRequirementSatisfied = openRightsRequired
    ? isOpenAsset || (originalNativeAllowed && isOriginalNative)
    : isOpenAsset || isOriginalNative;
  const attributionRequired = contract?.rightsBoundary?.attributionRequired === true;
  const attributionRequirementSatisfied = attributionRequired
    ? isOriginalNative
      ? /\b(?:original|native)\b/i.test(clean(specimen?.rightsBinding?.disclosure))
      : Boolean(clean(specimen?.rightsBinding?.attribution))
    : true;
  return {
    assetRightsClass,
    nativeSourceStructurallyResolved,
    openRightsRequired,
    originalNativeAllowed,
    rightsRequirementSatisfied,
    attributionRequired,
    attributionRequirementSatisfied,
    promotionEligible: rightsRequirementSatisfied && attributionRequirementSatisfied,
  };
}
