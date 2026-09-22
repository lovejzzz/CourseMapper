const BLOOM_ORDER = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

// v0.20.06: show the levels this lesson's activities actually use. The plan's
// bloomsLevels list historically contained all six levels for every lesson,
// which made the chips carry no information.
export function lessonBloomsTags(plan = {}) {
  const used = new Set(
    (Array.isArray(plan.outline) ? plan.outline : [])
      .map((step) => String(step?.bloomsLevel || '').trim())
      .map((level) => BLOOM_ORDER.find((name) => name.toLowerCase() === level.toLowerCase()))
      .filter(Boolean),
  );
  if (used.size === 0) return Array.isArray(plan.bloomsLevels) ? plan.bloomsLevels : [];
  return BLOOM_ORDER.filter((level) => used.has(level));
}
