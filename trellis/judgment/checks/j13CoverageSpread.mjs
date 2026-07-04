// J13 COVERAGE SPREAD (roadmap v0.1.4 A5) — the bench11 head-to-head's
// unanimous finding, made deterministic: four good items orbiting ONE
// misconception family while the lesson's other documented wrong beliefs
// go untested is recognition practice posing as assessment. For any
// introduced concept with ≥2 misconception families, no single family may
// hold more than half of that concept's catching items.
//
// Severity is WARN, deliberately: the fix lives in bank selection and
// splice targeting (deterministic, $0), never in paid repair rounds —
// a blocking J13 would re-create the run-5 thrashing economics.

import { finding } from '../../graph/validate.mjs';
import { misconceptionsForConcept } from '../../graph/schema.mjs';
import { distractorCatches } from './j11Catch.mjs';
import { familyKeyOf } from '../../knowledge/itemBank.mjs';

export function j13CoverageSpread(graph, authored) {
  const findings = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    for (const conceptId of lesson.introduces) {
      const misconceptions = misconceptionsForConcept(graph, conceptId);
      const families = new Set(misconceptions.map((m) => familyKeyOf(m.statement)).filter(Boolean));
      if (families.size < 2) continue;

      const byFamily = new Map();
      let catchingItems = 0;
      art.quizItems.forEach((item) => {
        const caught = new Set();
        item.options.forEach((option, oi) => {
          if (oi === item.correctIndex) return;
          for (const m of misconceptions) {
            if (distractorCatches(option, m.statement)) caught.add(familyKeyOf(m.statement));
          }
        });
        if (caught.size === 0) return;
        catchingItems += 1;
        for (const key of caught) byFamily.set(key, (byFamily.get(key) ?? 0) + 1);
      });
      if (catchingItems < 2) continue;

      // v0.1.5 recalibration: fire on NEGLECT, not imbalance — the bench11
      // finding was families with ZERO items while another had four, and
      // the first J13 fired even when every family had coverage (2:1
      // ratios). A tested family is a tested family.
      const untested = [...families].filter((key) => !(byFamily.get(key) > 0));
      if (untested.length > 0 && Math.max(...byFamily.values()) >= 2) {
        findings.push(
          finding(
            'warn',
            'J13_COVERAGE_SPREAD',
            `authored/${lesson.id}`,
            `${untested.length} documented misconception famil${untested.length === 1 ? 'y has' : 'ies have'} ZERO catching items ("${untested[0].slice(0, 50)}…") while another family holds ${Math.max(...byFamily.values())} — fill the neglected family via bank selection/splicing`,
          ),
        );
      }
    }
  }
  return findings;
}
