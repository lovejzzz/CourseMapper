import test from 'node:test';
import assert from 'node:assert/strict';
import { gateScionLiveRuns, scoreScionLiveRun } from './scionLiveScore.mjs';

const input = { id: 'A1-en-poem', lang: 'en' };
const checks = { quoted: 'My name is Ozymandias', sands: 'lone and level sands' };
const quiz = (questions) => ({ quizBank: { data: { quizzes: [{ questions }] } } });

test('a grounded quiz in the right language is usable', () => {
  const result = scoreScionLiveRun({
    input,
    checks,
    deliverables: quiz([
      { question: 'Complete the line: “My name is Ozymandias, King of ____”', answer: 'Kings' },
      { question: 'What do “the lone and level sands” suggest?', answer: 'Emptiness.' },
    ]),
  });
  assert.equal(result.usable, true);
  assert.equal(result.score, '2/2');
});

test('template questions, pipeline words or the wrong language make a run unusable', () => {
  const template = scoreScionLiveRun({
    input,
    checks,
    deliverables: quiz([
      { question: 'Use Records A-D: My name is Ozymandias; lone and level sands.', answer: 'Record C.' },
    ]),
  });
  assert.equal(template.usable, false);
  const jargon = scoreScionLiveRun({
    input,
    checks,
    deliverables: quiz([
      { question: 'My name is Ozymandias; lone and level sands.', answer: 'Use admitted evidence.' },
    ]),
  });
  assert.equal(jargon.usable, false);
  const chinese = scoreScionLiveRun({
    input,
    checks,
    deliverables: quiz([
      {
        question: '这首诗写了什么？My name is Ozymandias lone and level sands 这首诗写了什么这首诗写了什么',
        answer: '',
      },
    ]),
  });
  assert.equal(chinese.languageOk, false);
});

test('the gate needs three quarters overall and two per family', () => {
  const run = (id, usable) => ({ id, family: id[0], usable });
  const all = ['Q1', 'Q2', 'Q3', 'Q4', 'T1', 'T2', 'T3', 'T4', 'A1', 'A2', 'A3', 'A4'];
  assert.equal(gateScionLiveRuns(all.map((id) => run(id, true))).passed, true);
  assert.equal(gateScionLiveRuns(all.map((id) => run(id, !id.startsWith('A') || id === 'A1'))).passed, false);
});
