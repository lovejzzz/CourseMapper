// J1 KEY_VALID — correct index in range, options distinct, exactly one keyed answer.
import { finding } from '../../graph/validate.mjs';

export function j1KeyValid(graph, authored) {
  const findings = [];
  for (const [lessonId, art] of Object.entries(authored)) {
    art.quizItems.forEach((item, i) => {
      const path = `authored/${lessonId}/quizItems[${i}]`;
      if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= item.options.length) {
        findings.push(finding('block', 'J1_KEY_VALID', path, `correctIndex ${item.correctIndex} out of range`));
        return;
      }
      const seen = new Set(item.options.map((o) => o.trim().toLowerCase()));
      if (seen.size !== item.options.length) {
        findings.push(finding('block', 'J1_KEY_VALID', path, 'duplicate options make the key ambiguous'));
      }
    });
  }
  return findings;
}
