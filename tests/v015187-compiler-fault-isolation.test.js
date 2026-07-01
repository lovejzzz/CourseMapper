// v0.15.187 — per-feature fault isolation in the blueprint compiler.
//
// One renderer throwing used to escape compileBlueprintDeliverables and the
// caller marked every feature errored: one malformed lesson voided all nine
// deliverables. The contract now: blueprint-level failures (prepare/contract)
// still fail the whole compile, but a single deliverable's renderer failure
// is isolated — loud on the symbol error channel, absent from the result,
// and every other deliverable still compiles.
import { describe, expect, it, vi } from 'vitest';
import {
  BLUEPRINT_COMPILE_ERRORS,
  buildCourseBlueprint,
  compileBlueprintDeliverables,
} from '../src/lib/courseBlueprintCompiler';

const COURSE_MAP = {
  courseName: 'Fault Isolation Course',
  lessons: [1, 2, 3].map((n) => ({
    title: `Lesson ${n}: Resilient Compilation Topic ${n}`,
    sections: [
      {
        topicSection: `${n}.1: Renderer isolation`,
        learningGoals: `Explain how per-feature isolation protects deliverable ${n}.`,
        learningObjectives: `Describe the compile contract for lesson ${n}.`,
        weeklyAssessments: `Reliability memo ${n} with one failure-mode analysis`,
        asyncActivities: 'Read the compiler notes.',
        syncActivities: 'Workshop the failure modes.',
        supportingResources: 'Compiler handbook excerpt',
      },
    ],
  })),
};

function poisonedConfig() {
  // Any property access inside the renderer throws — a deterministic stand-in
  // for "one deliverable's code path hit a malformed value".
  return new Proxy(
    {},
    {
      get() {
        throw new Error('poisoned courseFaq config');
      },
    },
  );
}

describe('per-feature compile fault isolation', () => {
  it('isolates a throwing renderer: other deliverables compile, the error channel reports it', () => {
    const blueprint = buildCourseBlueprint(COURSE_MAP);
    const onFeatureCompileError = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const compiled = compileBlueprintDeliverables(blueprint, ['syllabus', 'slideDecks', 'courseFaq'], {
        configMap: { courseFaq: poisonedConfig() },
        onFeatureCompileError,
      });

      expect(compiled.syllabus).toBeTruthy();
      expect(compiled.slideDecks).toBeTruthy();
      expect(compiled.courseFaq).toBeUndefined();

      const errors = compiled[BLUEPRINT_COMPILE_ERRORS];
      expect(errors).toHaveLength(1);
      expect(errors[0].featureId).toBe('courseFaq');
      expect(errors[0].message).toContain('poisoned courseFaq config');
      expect(onFeatureCompileError).toHaveBeenCalledTimes(1);
      // The failure is loud, not silent.
      expect(errorSpy).toHaveBeenCalled();

      // The error channel is invisible to normal iteration — no consumer
      // that walks Object.entries(compiled) can mistake it for a feature.
      expect(Object.keys(compiled).sort()).toEqual(['slideDecks', 'syllabus']);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('compiles cleanly with no error channel when nothing throws', () => {
    const blueprint = buildCourseBlueprint(COURSE_MAP);
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus', 'courseFaq'], {
      configMap: { courseFaq: { questionsPerLesson: 5 } },
    });
    expect(compiled.syllabus).toBeTruthy();
    expect(compiled.courseFaq).toBeTruthy();
    expect(compiled[BLUEPRINT_COMPILE_ERRORS]).toBeUndefined();
  });
});
