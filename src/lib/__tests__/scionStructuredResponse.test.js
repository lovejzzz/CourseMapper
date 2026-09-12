import { skeletonSchemaProfile } from '../scionContracts.js';
import { parseNativeSkeletonResponse } from '../nativeGraphAuthoring.js';
import { describe, expect, it } from 'vitest';
import { assessScionStructuredResponse, assessScionClassroomResponse } from '../scionStructuredResponse';

const schema = {
  type: 'object',
  required: ['answerIndex'],
  additionalProperties: false,
  properties: { answerIndex: { type: 'integer', enum: [-1, 0, 1, 2, 3] } },
};

describe('Scion structured response admission', () => {
  it('does not accept a knowledge-only response as a completed online teaching task', () => {
    expect(
      assessScionClassroomResponse(JSON.stringify({ lessons: [{ lessonId: 'lesson-1', facts: ['Known fact.'] }] }))
        .issues,
    ).toEqual(expect.arrayContaining([expect.stringContaining('classroom-contract:')]));
    const lesson = {
      assignmentCore: {
        td: 'Explain why the daytime survey cannot establish town-wide support.',
        pa: ['One survey', 'Written response', 'Supplied survey record', '15 minutes'],
      },
      studyGuide: { sm: 'A sample is a subset of a population.', rs: 'Identify who was excluded from the survey.' },
    };
    expect(assessScionClassroomResponse(JSON.stringify({ lessons: [lesson] })).needsRetry).toBe(false);
    expect(
      assessScionClassroomResponse(
        JSON.stringify({
          lessons: [{ ...lesson, workedExample: { wp: 'Calculate support.', ws: ['Divide 16 by 20.'] } }],
        }),
      ).needsRetry,
    ).toBe(true);
  });
  it('validates the schema inside a production { name, schema, strict } profile', () => {
    const profile = { name: 'answer_check', schema, strict: true };
    expect(assessScionStructuredResponse('{}', profile).needsRetry).toBe(true);
    expect(assessScionStructuredResponse('{"answerIndex":2}', profile).needsRetry).toBe(false);
  });
  it.each(['{"answerIndex":2}', '```json\n{"answerIndex":-1}\n```'])(
    'accepts the declared response contract: %s',
    (text) => {
      expect(assessScionStructuredResponse(text, schema)).toEqual({ needsRetry: false, issues: [] });
    },
  );
  it.each([
    '[]',
    '{}',
    '{"answerIndex":"2"}',
    '{"answerIndex":4}',
    '{"answerIndex":2,"extra":"invented"}',
    '{"answerIndex":',
  ])('rejects malformed or mismatched responses without coercing values: %s', (text) => {
    expect(assessScionStructuredResponse(text, schema).needsRetry).toBe(true);
  });
  it('checks exact array lengths and nested identifiers', () => {
    const nested = {
      type: 'object',
      required: ['lessons'],
      properties: {
        lessons: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: { type: 'object', required: ['lessonId'], properties: { lessonId: { enum: ['lesson-1'] } } },
        },
      },
    };
    expect(assessScionStructuredResponse('{"lessons":[]}', nested).needsRetry).toBe(true);
    expect(assessScionStructuredResponse('{"lessons":[{"lessonId":"lesson-2"}]}', nested).needsRetry).toBe(true);
    expect(assessScionStructuredResponse('{"lessons":[{"lessonId":"lesson-1"}]}', nested).needsRetry).toBe(false);
  });
});

describe('native skeleton optional source policy', () => {
  const skeleton = () => ({
    course: {
      name: 'Web Development',
      term: 'TBD',
      goals: ['Build pages', 'Test behavior', 'Explain code'],
      prerequisites: [{ text: 'Calculus is required.', status: 'required' }],
      gradingPolicy: {
        categories: [{ id: 'g1', title: 'Exams', weightPct: 100, extraCredit: false }],
        gradeBands: [{ label: 'A', range: '93–100' }],
        baseTotalPct: 100,
        extraCreditTotalPct: 0,
      },
    },
    sessions: [
      { id: 's1', order: 1, title: 'HTML Structure', sectionTitles: ['Semantic Markup', 'Accessible Labels'] },
    ],
    assessments: [],
    readings: [],
    resources: [],
  });
  it('admits fields requested by the prompt but does not grant unsupported policy authority', () => {
    const data = skeleton();
    expect(
      assessScionStructuredResponse(JSON.stringify(data), skeletonSchemaProfile({ sessionCount: 1 })).needsRetry,
    ).toBe(false);
    const parsed = parseNativeSkeletonResponse(JSON.stringify(data), {
      expectedLessons: 1,
      sourceText: 'Web Development, one lesson on HTML structure.',
    });
    expect(parsed.course.prerequisites || []).toEqual([]);
    expect(parsed.course.gradingPolicy).toBeUndefined();
  });
  it('still rejects invalid field types, unknown fields and missing sessions', () => {
    for (const change of [
      (data) => {
        data.course.gradingPolicy.categories[0].weightPct = '100';
      },
      (data) => {
        data.course.prerequisites[0].status = 'invented';
      },
      (data) => {
        data.course.unrequested = true;
      },
      (data) => {
        data.sessions = [];
      },
    ]) {
      const data = skeleton();
      change(data);
      expect(
        assessScionStructuredResponse(JSON.stringify(data), skeletonSchemaProfile({ sessionCount: 1 })).needsRetry,
      ).toBe(true);
    }
  });
});
