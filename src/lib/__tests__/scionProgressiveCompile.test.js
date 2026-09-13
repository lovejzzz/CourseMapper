import { expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverablesYielding } from '../courseBlueprintCompiler.js';

it('publishes complete features in order before the full compilation promise resolves', async () => {
  const blueprint = buildCourseBlueprint({
    courseName: 'Web development',
    lessons: [
      {
        title: 'HTML forms',
        sections: [{ topicSection: 'HTML forms', learningObjectives: 'Build and test an accessible form.' }],
      },
    ],
  });
  const published = [];
  let finished = false;
  const result = await compileBlueprintDeliverablesYielding(blueprint, ['lessonPlans', 'syllabus'], {
    onFeatureCompiled: (id, data) => {
      expect(finished).toBe(false);
      expect(data).toBeTruthy();
      published.push([id, data]);
    },
  });
  finished = true;
  expect(published.map(([id]) => id)).toEqual(['lessonPlans', 'syllabus']);
  for (const [id, data] of published) expect(result[id]).toBe(data);
});
