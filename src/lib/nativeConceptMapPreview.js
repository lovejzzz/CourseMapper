export function getNativeConceptMap(slide) {
  const visual = slide?.visual || slide?.vi || {};
  const kind = String(visual.kind || visual.k || '');
  const hub = String(visual.hub || '').trim();
  const spokes = (Array.isArray(visual.spokes) ? visual.spokes : [])
    .map((spoke) => String(spoke || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  if (!/\bconcept\s*map\b/i.test(kind) || !hub || spokes.length < 2) return null;
  return { hub, spokes };
}
