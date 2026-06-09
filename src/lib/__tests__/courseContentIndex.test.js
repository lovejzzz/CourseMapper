import { describe, expect, it } from 'vitest';
import {
  buildCourseContentIndex,
  capRenderedText,
  renderDeliverableItemText,
  searchCourseContent,
} from '../courseContentIndex.js';
import { AGENT_TOOLS } from '../agentTools.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';

function makeCompiledWorkspace() {
  const courseMap = {
    courseName: 'Index Probe Course',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Lesson 1: Sampling Strategy and Survey Design Fundamentals',
        sections: [
          {
            topicSection: '1.1: Sampling Strategy Basics',
            learningObjectives: 'Analyze sampling bias in survey design; evaluate recruitment tradeoffs.',
            learningGoals: 'Connect sampling strategy to credible survey conclusions.',
            weeklyAssessments: 'Survey design memo 1: sampling plan with bias analysis.',
            asyncActivities: 'Read the sampling chapter and annotate one bias example.',
            syncActivities: 'Workshop: critique a flawed recruitment plan.',
            technologyNeeded: 'Course LMS.',
            supportingResources: 'Sampling strategy reading packet.',
            evaluateDesign: 'Aligned.',
          },
        ],
      },
      {
        title: 'Lesson 2: Interview Protocols and Question Wording',
        sections: [
          {
            topicSection: '2.1: Interview Protocol Design',
            learningObjectives: 'Design interview protocols; critique leading question wording.',
            learningGoals: 'Build reliable interview instruments.',
            weeklyAssessments: 'Interview protocol draft 2 with wording rationale.',
            asyncActivities: 'Draft three interview questions.',
            syncActivities: 'Pair critique of question wording.',
            technologyNeeded: 'Course LMS.',
            supportingResources: 'Interview protocol exemplars.',
            evaluateDesign: 'Aligned.',
          },
        ],
      },
    ],
  };
  const blueprint = JSON.parse(JSON.stringify(buildCourseBlueprint(courseMap)));
  const compiled = compileBlueprintDeliverables(blueprint, ['quizBank', 'studyGuides', 'assignments'], {});
  const deliverables = {};
  for (const [featureId, data] of Object.entries(compiled)) {
    deliverables[featureId] = { status: 'done', data };
  }
  return { courseMap, deliverables };
}

describe('courseContentIndex', () => {
  const { courseMap, deliverables } = makeCompiledWorkspace();

  it('renders deliverable items as labeled instructor-facing text', () => {
    const text = renderDeliverableItemText('quizBank', deliverables.quizBank.data, 0);
    expect(text).toContain('Question');
    expect(text.length).toBeGreaterThan(400);
    expect(text).not.toMatch(/"qs"|"op"|lessonIndex/);
  });

  it('indexes the course map and all done deliverables with stable anchors', () => {
    const index = buildCourseContentIndex({ courseMap, deliverables });
    const featureIds = new Set(index.entries.map((entry) => entry.anchor.featureId));
    expect(featureIds).toContain('courseMap');
    expect(featureIds).toContain('quizBank');
    expect(featureIds).toContain('studyGuides');
    expect(index.entries.every((entry) => Number.isInteger(entry.anchor.itemIndex))).toBe(true);
  });

  it('search finds where a concept is introduced and returns anchored snippets', () => {
    const index = buildCourseContentIndex({ courseMap, deliverables });
    const hits = searchCourseContent(index, 'sampling bias');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].snippet.toLowerCase()).toContain('sampling');
    expect(hits[0].anchor.featureId).toBeTruthy();
    const lesson2Hits = searchCourseContent(index, 'interview protocol wording');
    expect(lesson2Hits[0].anchor.itemIndex).toBe(1);
  });

  it('search reports honestly when the course does not cover a topic', () => {
    const index = buildCourseContentIndex({ courseMap, deliverables });
    expect(searchCourseContent(index, 'quantum chromodynamics')).toHaveLength(0);
  });

  it('caps rendered text at a line boundary with an honest remainder note', () => {
    const long = Array.from({ length: 500 }, (_, i) => `Line ${i} of rendered artifact text.`).join('\n');
    const capped = capRenderedText(long, 2000);
    expect(capped.truncated).toBe(true);
    expect(capped.text.length).toBeLessThan(2200);
    expect(capped.text).toMatch(/more characters/);
  });
});

describe('course-native agent tools', () => {
  const { courseMap, deliverables } = makeCompiledWorkspace();
  const ctx = { courseMap, deliverables, activeTab: 'quizBank' };

  it('read_rendered returns full instructor-facing text with an anchor', async () => {
    const result = await AGENT_TOOLS.read_rendered.execute({ featureId: 'quizBank', lessonIndex: 0 }, ctx);
    expect(result.renderedText).toContain('Question');
    expect(result.anchor).toEqual({ featureId: 'quizBank', itemIndex: 0 });
    expect(result.renderedText.length).toBeGreaterThan(400);
  });

  it('read_rendered outlines a whole deliverable when no index given', async () => {
    const result = await AGENT_TOOLS.read_rendered.execute({ featureId: 'studyGuides' }, ctx);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].anchor.featureId).toBe('studyGuides');
  });

  it('read_rendered reads the course map', async () => {
    const result = await AGENT_TOOLS.read_rendered.execute({ featureId: 'courseMap', lessonIndex: 1 }, ctx);
    expect(result.renderedText).toContain('Interview');
  });

  it('search_course returns anchored hits across artifacts', async () => {
    const result = await AGENT_TOOLS.search_course.execute({ query: 'sampling bias' }, ctx);
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.indexedItems).toBeGreaterThan(2);
  });

  it('explain_design surfaces compiler records for a compiled item', async () => {
    const result = await AGENT_TOOLS.explain_design.execute({ featureId: 'assignments', lessonIndex: 0 }, ctx);
    expect(result.anchor).toEqual({ featureId: 'assignments', itemIndex: 0 });
    // Compiled assignments carry grounding/genre/intent records.
    expect(Object.keys(result).length).toBeGreaterThan(1);
    expect(result.error).toBeUndefined();
  });

  it('explain_design says so when no records exist instead of inventing', async () => {
    const bare = {
      courseMap,
      deliverables: { quizBank: { status: 'done', data: { quizzes: [{ lessonTitle: 'L1', questions: [] }] } } },
    };
    const result = await AGENT_TOOLS.explain_design.execute({ featureId: 'quizBank', lessonIndex: 0 }, bare);
    expect(result.note).toMatch(/No compiler design records/);
  });
});
