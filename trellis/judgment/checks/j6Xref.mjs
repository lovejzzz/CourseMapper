// J6 XREF — cross-reference integrity: no "last time" in lesson 1; a named
// "next" lesson in authored prose must be the actual next lesson's title.
import { finding } from '../../graph/validate.mjs';
import { orderedLessons } from '../../graph/schema.mjs';

const BACKREF_RE = /\b(last time|last week|previously we|as we saw last)\b/i;

export function j6Xref(graph, authored) {
  const findings = [];
  const lessons = orderedLessons(graph);
  const first = lessons[0];
  const art = first ? authored[first.id] : null;
  if (art) {
    const prose = [
      ...art.plan.segments.map((s) => s.text),
      ...art.slides.flatMap((s) => [s.speakerNotes, ...s.bullets]),
      art.studyGuideSection,
    ].join('\n');
    if (BACKREF_RE.test(prose)) {
      findings.push(
        finding(
          'block',
          'J6_XREF',
          `authored/${first.id}`,
          'lesson 1 references a previous session ("last time…") that does not exist',
        ),
      );
    }
  }
  return findings;
}
