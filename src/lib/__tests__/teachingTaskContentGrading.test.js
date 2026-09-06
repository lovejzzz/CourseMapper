import { describe, it, expect } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { deriveCourseGraphFromCourseMap, buildBlueprintFromGraph } from '../courseGraph/index.js';

const mapWith = (titles) => ({
  courseName: 'Source reasoning workshop',
  lessons: titles.map((title, index) => ({
    title: `Lesson ${index + 1}: Compare sources`,
    sections: [
      {
        topicSection: 'Compare accounts of the same event',
        learningObjectives: 'Compare claims using the supplied records and justify a bounded conclusion.',
        weeklyAssessments: title,
      },
    ],
  })),
});
const compile = (map, graph = false) =>
  compileBlueprintDeliverables(
    graph ? buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(map)) : buildCourseBlueprint(map),
    ['syllabus', 'assignments', 'rubrics'],
  );

describe('course grades require a supplied policy', () => {
  it.each([false, true])('does not invent a course grade for an unweighted workshop (graph=%s)', (graph) => {
    const outputs = compile(mapWith(['A short source comparison']), graph);
    const assignment = outputs.assignments.assignments[0];
    expect(assignment.weightPercent).toBeNull();
    expect(assignment.percentOfGrade).toMatch(/formative/i);
    expect(assignment.assessmentRole).toBe('Formative practice');
    expect(assignment.assessmentStakes).toBe('low');
    expect(assignment.totalPoints || assignment.points).toBeGreaterThan(0);
    expect(outputs.rubrics.rubrics[0].weightPercent).toBeNull();
    expect(JSON.stringify(outputs)).not.toMatch(/null%|undefined%|proposed planning weights/);
  });
  it.each([false, true])(
    'preserves partial and conflicting stated grades without redistributing (graph=%s)',
    (graph) => {
      const partial = compile(mapWith(['Source comparison (20%)', 'Revision reflection']), graph);
      expect(partial.assignments.assignments.map((a) => a.weightPercent)).toEqual([20, null]);
      const conflict = compile(mapWith(['Source comparison (80%)', 'Revision reflection (80%)']), graph);
      expect(conflict.assignments.assignments.map((a) => a.weightPercent)).toEqual([80, 80]);
    },
  );
  it('does not turn a selected 20% assignment into the entire course grade', () => {
    const single = compile(mapWith(['Source comparison (20%)']), true);
    expect(single.assignments.assignments[0].weightPercent).toBe(20);
  });
  it.each([false, true])('does not interpret a task percentage as course grading policy (graph=%s)', (graph) => {
    const result = compile(mapWith(['Calculate 40% of the observed sample']), graph);
    expect(result.assignments.assignments[0].weightPercent).toBeNull();
  });
});
