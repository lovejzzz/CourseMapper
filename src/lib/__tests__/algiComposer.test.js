// Algi V0 composes the Pass A skeleton from the uploaded source instead of
// sampling it. These tests pin the contract the pipeline admits downstream.
import { describe, expect, it } from 'vitest';
import {
  composeAlgiResponse,
  composeAlgiSkeleton,
  extractCourseName,
  extractExpectedSessions,
  extractSourceFromPrompt,
  planSessionTopics,
} from '../algiComposer.js';
import { skeletonSchemaProfile } from '../scionContracts.js';
import { algiModelOption, isAlgiModel } from '../algiIdentity.js';
import { publicScionProviderModelOptions } from '../publicScionIdentity.js';

const SYLLABUS = `Course: Introduction to Environmental Policy

Week 1: How environmental problems reach public agendas
Week 2: Common-pool resources and collective action
Week 3: Environmental justice and unequal exposure
Week 4: Risk assessment under uncertainty
Week 5: Command-and-control regulation
Week 6: Market instruments including carbon taxes`;

const promptFor = (source, sessions) =>
  [
    'Extract the typed course skeleton from the following source materials.',
    `The course has exactly ${sessions} sessions — return exactly that many entries in "sessions".`,
    '',
    'SOURCE MATERIALS:',
    source,
    '',
    'Return ONLY the skeleton JSON object now:',
  ].join('\n');

// Minimal structural validation against the shipped contract: the pipeline
// rejects a skeleton whose counts or field lengths fall outside these bounds.
function validateAgainstSchema(skeleton, sessionCount) {
  // skeletonSchemaProfile returns the json_schema envelope the provider sends.
  const { schema } = skeletonSchemaProfile({ sessionCount });
  const problems = [];
  const sessions = schema.properties.sessions;
  if (skeleton.sessions.length < sessions.minItems || skeleton.sessions.length > sessions.maxItems) {
    problems.push(`sessions ${skeleton.sessions.length} outside ${sessions.minItems}..${sessions.maxItems}`);
  }
  const assessments = schema.properties.assessments;
  if (skeleton.assessments.length < assessments.minItems || skeleton.assessments.length > assessments.maxItems) {
    problems.push(
      `assessments ${skeleton.assessments.length} outside ${assessments.minItems}..${assessments.maxItems}`,
    );
  }
  const titleRule = schema.properties.sessions.items.properties.title;
  for (const session of skeleton.sessions) {
    if (session.title.length < titleRule.minLength || session.title.length > titleRule.maxLength) {
      problems.push(`title "${session.title}" outside ${titleRule.minLength}..${titleRule.maxLength}`);
    }
    if (session.sectionTitles.length < 2 || session.sectionTitles.length > 4) {
      problems.push(`sectionTitles ${session.sectionTitles.length} outside 2..4`);
    }
  }
  const goals = schema.properties.course.properties.goals;
  if (skeleton.course.goals.length < goals.minItems) problems.push('too few goals');
  return problems;
}

describe('Algi V0 identity', () => {
  it('is offered inside the Scion provider, listed after the downloaded base', () => {
    const options = publicScionProviderModelOptions();
    expect(options).toHaveLength(2);
    expect(options[0].id).toBe('scion-public');
    expect(options[1].id).toBe('algi-v0');
    expect(options[1].name).toBe('Algi V0');
  });

  it('claims no sampling capability, because nothing is sampled', () => {
    const option = algiModelOption();
    expect(option.source).toBe('genome-local');
    expect(option.capabilities.streaming).toBe(false);
    expect(option.capabilities.temperature).toBe(false);
    expect(isAlgiModel('algi-v0')).toBe(true);
    expect(isAlgiModel('scion-public')).toBe(false);
  });
});

describe('Algi V0 prompt reading', () => {
  it('recovers the source and the pinned session count', () => {
    const prompt = promptFor(SYLLABUS, 6);
    expect(extractSourceFromPrompt(prompt)).toContain('Week 1: How environmental problems');
    expect(extractSourceFromPrompt(prompt)).not.toContain('Return ONLY the skeleton');
    expect(extractExpectedSessions(prompt)).toBe(6);
  });

  it('reads the course name from an explicit label', () => {
    expect(extractCourseName(SYLLABUS)).toBe('Introduction to Environmental Policy');
  });
});

describe('Algi V0 skeleton composition', () => {
  it('transcribes the instructor’s own weekly topics', () => {
    const topics = planSessionTopics(SYLLABUS, 6);
    expect(topics).toHaveLength(6);
    expect(topics[0].toLowerCase()).toContain('environmental problems');
    expect(topics[1].toLowerCase()).toContain('common-pool');
    expect(new Set(topics.map((t) => t.toLowerCase())).size).toBe(6);
  });

  it('satisfies the same skeleton contract Scion is asked for', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(SYLLABUS, 6)));
    expect(validateAgainstSchema(skeleton, 6)).toEqual([]);
    expect(skeleton.course.name).toBe('Introduction to Environmental Policy');
    expect(skeleton.sessions.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('fills a session count larger than the source outline without repeating a title', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(SYLLABUS, 10)));
    expect(validateAgainstSchema(skeleton, 10)).toEqual([]);
    const titles = skeleton.sessions.map((s) => s.title.toLowerCase());
    expect(new Set(titles).size).toBe(10);
  });

  it('varies the opening section frame between consecutive sessions', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor(SYLLABUS, 6)));
    const openers = skeleton.sessions.map((s) => s.sectionTitles[0].replace(/\s.*$/, ''));
    // Repetition starts in the frame, not the noun: neighbours must differ.
    expect(openers[0]).not.toBe(openers[1]);
    expect(new Set(openers).size).toBeGreaterThan(1);
  });

  it('survives a source with no recognizable outline', () => {
    const skeleton = JSON.parse(composeAlgiSkeleton(promptFor('A short course about soil.', 3)));
    expect(validateAgainstSchema(skeleton, 3)).toEqual([]);
    expect(skeleton.sessions).toHaveLength(3);
  });
});

describe('Algi V0 request routing', () => {
  it('composes the Pass A skeleton', () => {
    expect(composeAlgiResponse({ task: 'nativeSkeleton', userPrompt: promptFor(SYLLABUS, 6) })).toContain('"sessions"');
  });

  it('declines every other task so the compiler owns it, rather than inventing content', () => {
    expect(composeAlgiResponse({ task: 'enrichment', userPrompt: 'anything' })).toBe('');
    expect(composeAlgiResponse({ task: 'lessonKernel', userPrompt: 'anything' })).toBe('');
    expect(composeAlgiResponse({})).toBe('');
  });
});
