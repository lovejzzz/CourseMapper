// J8 PACING — V4 re-checked at judgment time (post-authoring), because the
// authored week can still overload even when the graph passed at intake.
import { validateGraph } from '../../graph/validate.mjs';

export function j8Pacing(graph, _authored, { pacingCap = 3 } = {}) {
  return validateGraph(graph, { pacingCap })
    .filter((f) => f.code === 'V4_PACING')
    .map((f) => ({ ...f, code: 'J8_PACING' }));
}
