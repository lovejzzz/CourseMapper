// J11 CATCH — a distractor that merely gestures at a misconception does not
// catch the student who holds it. For every documented misconception on a
// lesson's introduced concepts, at least one quiz item must carry a
// distractor that IS the misconception — matched by the SAME rule Prof's
// classroom uses (>=2 shared content tokens, or >=50% of the claim's
// tokens), so passing J11 is passing the instrument, not gaming it.
import { finding } from '../../graph/validate.mjs';
import { misconceptionsForConcept } from '../../graph/schema.mjs';

function tokensOf(value) {
  return new Set(
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3),
  );
}

export function distractorCatches(distractorText, misconceptionStatement) {
  const distractor = tokensOf(distractorText);
  const claim = tokensOf(misconceptionStatement);
  if (claim.size === 0 || distractor.size === 0) return false;
  let shared = 0;
  for (const token of claim) if (distractor.has(token)) shared += 1;
  return shared >= 2 || shared / claim.size >= 0.5;
}

// Which texts count as "catching" this misconception. Genome-sourced
// misconceptions (m-genome-*) must be caught against their SHARD statement —
// that is the exact text Prof's cast matches, and a beliefForm-only match
// could pass here while failing the instrument. Flywheel/authored ones are
// not in Prof's cast, so their (model-written) beliefForm counts too.
export function catchTextsFor(m) {
  return String(m.id ?? '').startsWith('m-genome-') ? [m.statement] : [m.statement, m.beliefForm].filter(Boolean);
}

export function j11Catch(graph, authored) {
  const findings = [];
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    for (const conceptId of lesson.introduces) {
      for (const m of misconceptionsForConcept(graph, conceptId)) {
        const catchTexts = catchTextsFor(m);
        const caught = art.quizItems.some((item) =>
          item.options.some(
            (option, oi) => oi !== item.correctIndex && catchTexts.some((t) => distractorCatches(option, t)),
          ),
        );
        if (!caught) {
          findings.push(
            finding(
              'block',
              'J11_CATCH',
              `authored/${lesson.id}`,
              `no quiz distractor catches the documented misconception — add an option stating this wrong belief with its key terms intact: "${(m.beliefForm ?? m.statement).slice(0, 110)}" (documented: "${m.statement.slice(0, 110)}")`,
            ),
          );
        }
      }
    }
  }
  return findings;
}
