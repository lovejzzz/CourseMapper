// J7 ECHO — the sameness disease as one deterministic gate: same-surface
// prose across lessons must not share too many 5-gram shingles. Warn at 0.30
// Jaccard, block at 0.50 (mock frames sit near the warn line by design;
// live authored prose should sit far below).
import { finding } from '../../graph/validate.mjs';
import { shingles, jaccard } from '../text.mjs';

const SURFACES = [
  ['studyGuide', (art) => art.studyGuideSection],
  ['discussion', (art) => `${art.discussion.prompt} ${art.discussion.followUps.join(' ')}`],
  ['assignment', (art) => `${art.assignment.task} ${art.assignment.steps.join(' ')}`],
  ['plan', (art) => art.plan.segments.map((s) => s.text).join(' ')],
];

export function j7Echo(graph, authored, { warnAt = 0.3, blockAt = 0.5 } = {}) {
  const findings = [];
  const lessonIds = graph.lessons.map((lesson) => lesson.id).filter((id) => authored[id]);
  for (const [surface, pickText] of SURFACES) {
    const sets = lessonIds.map((id) => [id, shingles(pickText(authored[id]))]);
    for (let a = 0; a < sets.length; a += 1) {
      for (let b = a + 1; b < sets.length; b += 1) {
        const similarity = jaccard(sets[a][1], sets[b][1]);
        if (similarity >= blockAt) {
          findings.push(
            finding(
              'block',
              'J7_ECHO',
              `authored/${sets[a][0]}+${sets[b][0]}/${surface}`,
              `${surface} prose ${Math.round(similarity * 100)}% shingle-identical between lessons`,
            ),
          );
        } else if (similarity >= warnAt) {
          findings.push(
            finding(
              'warn',
              'J7_ECHO',
              `authored/${sets[a][0]}+${sets[b][0]}/${surface}`,
              `${surface} prose ${Math.round(similarity * 100)}% shingle-similar between lessons`,
            ),
          );
        }
      }
    }
  }
  return findings;
}
