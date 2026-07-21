// One shared definition of compiler/meta prose. Compact transport admission
// and the final kernel parser must reject the same text; otherwise a response
// can clear the first pass only to disappear at canonical admission.
export const META_SURFACE_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|rubric|the (?:Week\s*\d+|weekly) \w+|this (?:course|lesson)|the lesson|artifact|submission|checkpoint)\b/i;

export function isMetaSurfaceText(value) {
  return META_SURFACE_RE.test(String(value || ''));
}
