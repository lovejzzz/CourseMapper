import { normalizeAssignmentAssessmentAlignment } from '../deliverablePostProcess.js';
import { findPublishabilityPlaceholders } from '../publishabilityPlaceholders.js';
import { projectSharedTeachingTasks } from '../compilerTeachingTaskProjection.js';
import JSZip from 'jszip';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter.js';
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { CODING_PRACTICE } from '../codingPracticeCatalog.js';
import { codingPracticeInputs, explicitCodingPracticeTask, selectCodingPracticeInputs } from '../codingPractice.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { teachingTaskSourceFromLesson, rebuildTeachingTaskSource } from '../teachingTaskSource.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  hydrateBlueprintForCompilation,
} from '../courseBlueprintCompiler.js';
import { Validator } from '@cfworker/json-schema';
import { skeletonSchemaProfile } from '../scionContracts.js';
import { parseNativeSkeletonResponse } from '../nativeGraphAuthoring.js';

const example = (id) => CODING_PRACTICE.find((row) => row.id === id);
const run = (id, test) =>
  execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `import assert from 'node:assert/strict';\n${example(id).solution}\n${test}`],
    { timeout: 10000 },
  );
const titles = [
  'HTML and CSS',
  'JavaScript and DOM',
  'APIs and Front End Frameworks',
  'Responsive Design',
  'Document Object Model',
  'Working With Apis',
  'Server-side Basics',
  'Databases',
  'Authentication',
  'Front End Frameworks',
  'Deployment',
  'Final Application',
];
const map = {
  courseName: 'Full-Stack Web Development',
  lessons: titles.map((title) => ({
    title,
    sections: [{ topicSection: title, learningObjectives: `Implement ${title} and verify its behavior.` }],
  })),
};
const features = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

describe('bounded programming practice', () => {
  it('covers fresh generated integration and project lesson titles without matching unrelated courses', () => {
    for (const [title, id] of [
      ['Asynchronous Data Flow Integration', 'fetch-status'],
      ['Full-Stack Project Application', 'full-stack-health'],
      ['Project Application', 'full-stack-health'],
    ]) {
      expect(selectCodingPracticeInputs(map, { title })[0]).toContain(id);
      expect(selectCodingPracticeInputs({ courseName: 'Biology' }, { title })).toEqual([]);
    }
  });
  it('executes the API adapter on success, empty data, HTTP failure and network failure', () => {
    run(
      'fetch-status',
      `
      assert.deepEqual(await loadTitles(async()=>({ok:true,json:async()=>[{title:'Portfolio'},{title:'Tracker'}]}),'/items'),['Portfolio','Tracker']);
      assert.deepEqual(await loadTitles(async()=>({ok:true,json:async()=>[]}),'/items'),[]);
      await assert.rejects(loadTitles(async()=>({ok:false,status:404,json:()=>{throw new Error('body must not be read')}}),'/items'),/HTTP 404/);
      await assert.rejects(loadTitles(async()=>{throw new Error('Offline')},'/items'),/Offline/);
    `,
    );
  });
  it('validates API payload shape and never treats a string false as published', () => {
    run(
      'validated-api',
      `
      const ok = rows => async () => ({ok:true,json:async()=>rows});
      assert.deepEqual(await publishedTitles(ok([{title:'Portfolio',published:true},{title:'Draft',published:false}]),'/items'),['Portfolio']);
      assert.deepEqual(await publishedTitles(ok([]),'/items'),[]);
      for (const rows of [{},[null],[{title:'Draft',published:'false'}]]) await assert.rejects(publishedTitles(ok(rows),'/items'),/Invalid items/);
      await assert.rejects(publishedTitles(async()=>({ok:false,status:403,json:()=>{throw new Error('body must not be read')}}),'/items'),/HTTP 403/);
    `,
    );
  });

  it('serves the HTTP route over a real local socket', () => {
    run(
      'http-router',
      `
      const {createServer}=await import('node:http');
      const server=createServer(handler); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      try {const url='http://127.0.0.1:'+server.address().port;
        for (const [path,method,status,body] of [['/health','GET',200,{ok:true}],['/missing','GET',404,{error:'Not found'}],['/health','POST',404,{error:'Not found'}]]) {
          const response=await fetch(url+path,{method}); assert.equal(response.status,status); assert.equal(response.headers.get('content-type'),'application/json'); assert.deepEqual(await response.json(),body);
        }
      } finally {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
    `,
    );
  });
  it('checks session expiration exactly at the boundary and after logout', () => {
    run(
      'session-guard',
      `const sessions=new Map([['sample',{userId:'u1',expiresAt:100}]]);
      assert.equal(currentUser(sessions,'sample',99),'u1'); assert.equal(currentUser(sessions,'sample',100),null);
      assert.equal(currentUser(sessions,'unknown',99),null); assert.equal(currentUser(sessions,'u1',99),null);
      sessions.delete('sample'); assert.equal(currentUser(sessions,'sample',99),null);`,
    );
  });
  it('rejects stale releases, HTTP failures and network failures', () => {
    run(
      'release-check',
      `
      assert.equal(await verifyRelease(async(url,options)=>{assert.equal(options.cache,'no-store');return {ok:true,json:async()=>({commit:'abc'})}},'/release.json','abc'),true);
      await assert.rejects(verifyRelease(async()=>({ok:true,json:async()=>({commit:'old'})}),'/release.json','abc'),/Stale release/);
      await assert.rejects(verifyRelease(async()=>({ok:false,status:503}),'/release.json','abc'),/HTTP 503/);
      await assert.rejects(verifyRelease(async()=>{throw new Error('Offline')},'/release.json','abc'),/Offline/);
    `,
    );
  });
  it('executes the SQL answer on the actual fixture and all-completed case', () => {
    const row = example('sql-filter');
    execFileSync(process.execPath, [
      '--experimental-sqlite',
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(':memory:');db.exec(${JSON.stringify(row.starter)});assert.deepEqual(db.prepare(${JSON.stringify(row.solution)}).all().map(r=>[r.id,r.title]),[[3,'Deploy'],[1,'Portfolio']]);db.exec('UPDATE tasks SET done=1');assert.equal(db.prepare(${JSON.stringify(row.solution)}).all().length,0);db.close();`,
    ]);
  });
  it('retains exact source bindings and never executes user-edited code during compilation', () => {
    for (const row of CODING_PRACTICE) {
      const claims = codingPracticeInputs(row);
      const task = buildSharedTeachingTask({ lessonId: 'lesson-1', objective: row.goal, claims, admitted: true });
      expect(task?.codingPractice).toBe(true);
      expect(task.answer).toContain(row.solution);
      const source = teachingTaskSourceFromLesson({
        id: 'lesson-1',
        lessonNumber: 1,
        title: row.title,
        teachingTask: task,
        teachingTaskScope: 'primary-task',
      });
      expect(rebuildTeachingTaskSource(source)?.revision).toBe(task.revision);
      source.inputs[2].text += '\nChanged starter';
      expect(rebuildTeachingTaskSource(source)).toBeNull();
      expect(explicitCodingPracticeTask([claims[0]])).toBeNull();
    }
    expect(
      selectCodingPracticeInputs({ courseName: 'Authentication in medieval manuscripts' }, { title: 'Authentication' }),
    ).toEqual([]);
  });
  it('projects coding work, specific keys and matching rubrics across all twelve lessons', () => {
    const blueprint = buildCourseBlueprint(map);
    const prepared = hydrateBlueprintForCompilation(blueprint);
    expect(prepared.lessons.every((l) => l.teachingTask?.codingPractice)).toBe(true);
    const data = compileBlueprintDeliverables(blueprint, features);
    for (let i = 0; i < 12; i++) {
      const task = prepared.lessons[i].teachingTask;
      expect(data.studyGuides.studyGuides[i].workedExample.result).toContain(task.answer);
      expect(data.lessonPlans.lessonPlans[i].workedExample.result).toContain(task.answer);
      expect(data.quizBank.quizzes[i].questions.length).toBeGreaterThan(3);
      for (const q of data.quizBank.quizzes[i].questions) {
        expect(q.sampleAnswer || q.answer).toBeTruthy();
        expect(JSON.stringify(q)).not.toMatch(/replace general guidance|teacher review required replace|Use Records A/);
      }
      expect(data.rubrics.rubrics[i].criteria.map((c) => c.exemplary).join(' ')).toContain(
        task.criteria[0].levels.exemplary,
      );
      expect(data.assignments.assignments[i].taskId).toBe(task.id);
      expect(data.assignments.assignments[i].taskRevision).toBe(data.studyGuides.studyGuides[i].taskRevision);
    }
    expect(JSON.stringify(data)).toContain('instructor review required for course fit');
  });
  it('does not replace instructor-authored assignment content with a catalog task', () => {
    const blueprint = buildCourseBlueprint(
      { ...map, lessons: [map.lessons[0]] },
      {
        enrichment: {
          lessonContent: {
            'lesson-1': {
              assignmentCore: {
                taskDescription: 'Build the instructor-specified museum page with the supplied collection data.',
              },
            },
          },
        },
      },
    );
    expect(hydrateBlueprintForCompilation(blueprint).lessons[0].teachingTask?.codingPractice).not.toBe(true);
  });

  it('exports literal code and linked API references in real Office files', async () => {
    const single = { ...map, lessons: [map.lessons[6]] };
    const compiled = compileBlueprintDeliverables(buildCourseBlueprint(single), features);
    for (const feature of features.filter((id) => id !== 'slideDecks')) {
      const blob = await buildDeliverableDocxBlob(feature, compiled[feature], map.courseName);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('word/document.xml').async('string');
      expect(xml).toContain('http');
      if (['studyGuides', 'lessonPlans', 'quizBank'].includes(feature)) expect(xml).toContain('res.writeHead');
      expect(xml).not.toContain('Teacher review required: replace general guidance');
    }
    const blob = await buildSlideDeckPptxBlob(compiled.slideDecks, map.courseName, 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const notes = await Promise.all(
      Object.values(zip.files)
        .filter((file) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(file.name))
        .map((file) => file.async('string')),
    );
    expect(notes.join(' ')).toContain('res.writeHead');
  });

  it('admits seven assessment rows for twelve sessions before restoring the source cadence', () => {
    const raw = {
      course: {
        name: map.courseName,
        term: '12 weeks',
        goals: ['Build websites with code', 'Test observable behavior', 'Review and revise implementations'],
      },
      sessions: titles.map((title, i) => ({
        id: `s${i + 1}`,
        order: i + 1,
        title,
        sectionTitles: [title, 'Implementation practice'],
      })),
      assessments: titles
        .slice(0, 7)
        .map((title, i) => ({ id: `a${i + 1}`, title: `Build lab: ${title}`, dueSession: i + 1 })),
    };
    const validator = new Validator(skeletonSchemaProfile({ sessionCount: 12 }).schema);
    expect(validator.validate(raw).valid).toBe(true);
    expect(validator.validate({ ...raw, sessions: raw.sessions.slice(0, 11) }).valid).toBe(false);
    const parsed = parseNativeSkeletonResponse(JSON.stringify(raw), {
      expectedLessons: 12,
      sourceText: 'Full-Stack Web Development, 12-week project-based course with weekly build labs and code reviews.',
    });
    expect(parsed.sessions).toHaveLength(12);
    expect(new Set(parsed.assessments.map((a) => a.dueSession)).size).toBe(12);
  });
});

it('replaces generic compiler recovery questions with the selected coding task and preserves authored questions', () => {
  const blueprint = hydrateBlueprintForCompilation(buildCourseBlueprint({ ...map, lessons: [map.lessons[0]] }));
  const quiz = {
    lessonNumber: 1,
    questions: [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `q${i}`,
        type: 'short_answer',
        question: 'Use Records A-D to evaluate a claim.',
        answer: 'General guidance',
        enrichmentSource: 'compiler-created-practice-recovery',
        points: 4,
      })),
      {
        id: 'teacher',
        type: 'short_answer',
        question: 'Instructor authored question',
        answer: 'Instructor authored key',
        enrichmentSource: 'instructor-authored',
        points: 2,
      },
    ],
  };
  const data = { quizzes: [quiz] };
  projectSharedTeachingTasks('quizBank', data, blueprint);
  expect(quiz.questions.filter((q) => q.taskId === blueprint.lessons[0].teachingTask.id)).toHaveLength(6);
  expect(quiz.questions).toHaveLength(7);
  expect(JSON.stringify(quiz.questions)).not.toContain('Use Records A-D');
  expect(quiz.questions.find((q) => q.id === 'teacher').answer).toBe('Instructor authored key');
  expect(quiz.totalPoints).toBe(quiz.questions.reduce((n, q) => n + q.points, 0));
});

it('preserves concise coding criteria and labels the actual failed behavior', () => {
  const data = compileBlueprintDeliverables(buildCourseBlueprint({ ...map, lessons: [map.lessons[0]] }), [
    'assignments',
  ]).assignments;
  const before = data.assignments[0].gradingCriteria;
  expect(normalizeAssignmentAssessmentAlignment(data, map).data.assignments[0].gradingCriteria).toEqual(before);
  expect(data.assignments[0].anchorExampleGuidance[2]).toContain('Accessible label');
  expect(data.assignments[0].anchorExampleGuidance[2]).not.toContain('fails Document structure');
});
it('does not confuse the exact unfinished starter with missing teacher content', () => {
  const starter = codingPracticeInputs(example('semantic-page'))[2];
  expect(findPublishabilityPlaceholders({ source: starter })).toEqual([]);
  expect(findPublishabilityPlaceholders({ source: starter, answer: 'TODO: write the answer' })).toContain('TODO');
  expect(findPublishabilityPlaceholders(starter.replace('two project articles', 'unknown replacement'))).toContain(
    'TODO',
  );
});
