/**
 * promptModules.test.js — offline guard that every prompt module parses,
 * exports a valid `{ system, user }` shape, and user(courseMap) produces a
 * non-empty string without throwing.
 *
 * Why: a stray backtick inside a template literal (e.g. around `sl` when the
 * prompt is already a template-literal body) breaks the file at parse time,
 * not runtime. The full audit suite catches it but costs ~15 min and a
 * handful of Anthropic calls. This test catches the same class of typo
 * instantly, offline.
 */
import { describe, it, expect } from 'vitest';
import assignments from '../prompts/assignments.js';
import courseFaq from '../prompts/courseFaq.js';
import discussions from '../prompts/discussions.js';
import lessonPlans from '../prompts/lessonPlans.js';
import quizBank from '../prompts/quizBank.js';
import rubrics from '../prompts/rubrics.js';
import slideDecks from '../prompts/slideDecks.js';
import studyGuides from '../prompts/studyGuides.js';
import syllabus from '../prompts/syllabus.js';
import { getDeliverablePrompt } from '../deliverablePrompts.js';

const MODULES = {
  assignments,
  courseFaq,
  discussions,
  lessonPlans,
  quizBank,
  rubrics,
  slideDecks,
  studyGuides,
  syllabus,
};

const COURSE = {
  courseName: 'Test Course',
  semester: 'Fall 2026',
  lessons: [
    { title: 'L1', sections: [{ learningObjectives: 'x', topicSection: 'y' }] },
    { title: 'L2', sections: [{ learningObjectives: 'x', topicSection: 'y' }] },
  ],
};

describe('prompt modules — parse + shape', () => {
  it.each(Object.keys(MODULES))('%s exports { system: string, user: fn }', (name) => {
    const mod = MODULES[name];
    expect(mod, `${name} module is falsy`).toBeTruthy();
    expect(typeof mod.system, `${name}.system must be string`).toBe('string');
    expect(mod.system.length, `${name}.system is empty`).toBeGreaterThan(20);
    expect(typeof mod.user, `${name}.user must be function`).toBe('function');
  });

  it.each(Object.keys(MODULES))('%s user(courseMap) returns a non-empty string', (name) => {
    const mod = MODULES[name];
    const out = mod.user(COURSE, null, null, null);
    expect(typeof out, `${name}.user() must return string`).toBe('string');
    expect(out.length, `${name}.user() returned empty`).toBeGreaterThan(50);
    // Should interpolate the course name so downstream prompt has context.
    expect(out).toContain('Test Course');
  });

  it.each(Object.keys(MODULES))('%s prompt instructs the model to return ONLY JSON', (name) => {
    // Every prompt ends with some variant of "Return ONLY the JSON object".
    // A regression where this rule is accidentally dropped means the model
    // wraps output in markdown fences and parsePartialJSON has to salvage it.
    const mod = MODULES[name];
    const out = mod.user(COURSE, null, null, null);
    const combined = (mod.system + ' ' + out).toLowerCase();
    expect(combined, `${name} never tells the model to return only JSON`).toMatch(
      /only\s+(valid\s+)?json|no\s+prose|no\s+markdown/,
    );
  });

  it('courseFaq config injects FAQ-specific instructions', () => {
    const prompts = getDeliverablePrompt('courseFaq', COURSE, null, {
      questionsPerLesson: 3,
      categories: ['Concept Explanation', 'Assessment Prep'],
      answerDepth: 'Detailed',
      includeResourcePointers: false,
      useFirstPersonQuestions: false,
    });

    expect(prompts.userPrompt).toContain('Generate exactly 3 FAQ questions per lesson');
    expect(prompts.userPrompt).toContain('Concept Explanation, Assessment Prep');
    expect(prompts.userPrompt).toContain('3-4 sentences');
    expect(prompts.userPrompt).toContain('Do not invent campus resource names');
    expect(prompts.userPrompt).toContain('neutral student-facing wording');
  });

  it('courseFaq defaults to exactly five questions per lesson', () => {
    const prompts = getDeliverablePrompt('courseFaq', COURSE, null, {});

    expect(prompts.userPrompt).toContain('Generate exactly 5 FAQ questions per lesson');
  });

  it('deliverable prompts include anti-fabrication source rules', () => {
    const prompts = getDeliverablePrompt('syllabus', COURSE, null, {});

    expect(prompts.userPrompt).toContain('Do not invent instructor names');
    expect(prompts.userPrompt).toContain('Never emit bracketed placeholders');
    expect(prompts.userPrompt).toContain('Do not invent named LMS folders');
    expect(prompts.userPrompt).toContain('Course instructor');
    expect(prompts.userPrompt).toContain('course-relative language');
  });

  it('assignment continuation prompts preserve milestone feedback schema', () => {
    const prompts = getDeliverablePrompt('assignments', COURSE, [1], {}, 'lecture', null, null, null, null, null, 1);

    expect(prompts.userPrompt).toContain('"fb":"str"');
    expect(prompts.userPrompt).toContain('"pt":0');
    expect(prompts.userPrompt).toContain('"ul":["str"]');
    expect(prompts.userPrompt).toContain('Never swap fields');
  });

  it('production prompts include proven A-quality benchmark instructions', () => {
    const prompts = getDeliverablePrompt('lessonPlans', COURSE, null, {});

    expect(prompts.userPrompt).toContain('A-QUALITY BENCHMARK');
    expect(prompts.userPrompt).toContain('what strong work looks like');
    expect(prompts.userPrompt).toContain('shared course throughline');
    expect(prompts.userPrompt).toContain('assessmentProgressionMap');
    expect(prompts.userPrompt).toContain('student-facing summaries');
    expect(prompts.userPrompt).toContain('grading calibration cues');
  });

  it('assignment prompts include the proven portfolio map and performance-band fields', () => {
    const prompts = getDeliverablePrompt('assignments', COURSE, null, {});

    expect(prompts.userPrompt).toContain('courseAssignmentMap');
    expect(prompts.userPrompt).toContain('portfolioConnection');
    expect(prompts.userPrompt).toContain('expectedSubmissionFile');
    expect(prompts.userPrompt).toContain('performanceBands');
  });
});
