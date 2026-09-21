import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { patchScionSharedModelReads } from '../../../scripts/buildScionRuntime.mjs';
import { classifyScionBrowserModelLoadError } from '../scionBrowserWllama.js';
import { requiredCourseSourceScope, sourceMatchesCourseScope } from '../courseSourceScope.js';
import { buildScionEvidenceLessonPrompt } from '../scionEvidenceLayer.js';
import { composeLessonFromKernels, composeResearchLedgerOnlyPayload } from '../algiKernelComposer.js';
import { buildVerifiedQuantitativePractice, describeNumericSample } from '../verifiedQuantitativePractice.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  compactBlueprintForStorage,
} from '../courseBlueprintCompiler.js';
const statsBrief =
  'Descriptive Statistics. Students know arithmetic. Each session has a 4-question quiz. Use data [2,4,4,6,9].';
const econBrief =
  'Supply Demand and Price Controls. Each session has a 4-question quiz. Use Qd=100-2P and Qs=20+2P. At price ceiling P=10 calculate shortage.';
describe('ten-course field regressions', () => {
  it('calculates sample quantities including duplicates and even-sized data', () => {
    expect(describeNumericSample([2, 4, 4, 6, 9])).toMatchObject({
      mean: 5,
      median: 4,
      populationVariance: 5.6,
      sampleVariance: 7,
      range: 7,
    });
    expect(describeNumericSample([-3, 0, 8, 11])).toMatchObject({
      mean: 4,
      median: 4,
      populationVariance: 32.5,
      sampleVariance: 130 / 3,
    });
    expect(describeNumericSample([7, 7, 7])).toMatchObject({ populationVariance: 0, sampleVariance: 0 });
    expect(describeNumericSample([1])).toBeNull();
    expect(describeNumericSample([1, NaN])).toBeNull();
  });
  it('uses actual supplied data and rejects ambiguous or unsupported numeric lists', () => {
    const lesson = { title: 'Mean and median' };
    expect(buildVerifiedQuantitativePractice(lesson, statsBrief).questions[0].answer).toBe('5');
    expect(buildVerifiedQuantitativePractice(lesson, 'Use data [-3,0,8,11].').questions[0].answer).toBe('4');
    expect(buildVerifiedQuantitativePractice(lesson, 'Use data [2,3] and data [8,9].')).toBeNull();
    expect(
      buildVerifiedQuantitativePractice(
        { title: 'Variance and outliers' },
        statsBrief + ' Discuss adding an outlier 100.',
      ).questions[3].answer,
    ).toBe('Mean 20.83333333; median 5.');
    expect(buildVerifiedQuantitativePractice(lesson, 'Use data [1,eval(x)].')).toBeNull();
    expect(buildVerifiedQuantitativePractice({ title: 'Literary interpretations' }, statsBrief)).toBeNull();
  });
  it('solves supplied market curves and distinguishes nonbinding ceilings', () => {
    const normal = buildVerifiedQuantitativePractice({ title: 'Market equilibrium' }, econBrief);
    expect(normal.questions.slice(0, 4).map((q) => q.answer)).toEqual(['20', '60', '80', '40']);
    const cap = buildVerifiedQuantitativePractice({ title: 'Binding price ceilings' }, econBrief);
    expect(cap.questions.slice(0, 3).map((q) => q.answer)).toEqual(['Yes.', '40', '40']);
    const free = buildVerifiedQuantitativePractice(
      { title: 'Binding price ceilings' },
      econBrief.replace('P=10', 'P=30'),
    );
    expect(free.questions.slice(0, 3).map((q) => q.answer)).toEqual(['No.', '0', '60']);
    expect(
      buildVerifiedQuantitativePractice({ title: 'Market equilibrium' }, econBrief.replace('100-2P', '120-3P'))
        .questions[0].answer,
    ).toBe('20');
    expect(
      buildVerifiedQuantitativePractice({ title: 'Market equilibrium' }, econBrief.replace('100-2P', '100-0P')),
    ).toBeNull();
  });
  it.each([
    ['statistics', statsBrief, ['Mean and median', 'Variance and outliers'], ['5', '28']],
    ['economics', econBrief, ['Market equilibrium', 'Binding price ceilings'], ['20', 'Yes.']],
  ])(
    'projects checked %s tasks through restored blueprints without putting keys in assignments',
    (_name, brief, titles, answers) => {
      const map = {
        courseName: _name,
        lessons: titles.map((title) => ({
          title,
          sections: [{ topicSection: title, learningObjectives: `Apply ${title}.` }],
        })),
      };
      const bp = compactBlueprintForStorage(buildCourseBlueprint(map, { sourceBrief: brief }));
      const outputs = compileBlueprintDeliverables(bp, [
        'quizBank',
        'studyGuides',
        'lessonPlans',
        'slideDecks',
        'assignments',
        'rubrics',
      ]);
      expect(outputs.quizBank.quizzes.map((q) => q.questions.length)).toEqual([4, 4]);
      expect(outputs.quizBank.quizzes.map((q) => q.questions[0].answer)).toEqual(answers);
      expect(outputs.quizBank.quizzes.every((q) => q.questions.every((x) => !x.sourceReviewRequired))).toBe(true);
      expect(outputs.studyGuides.studyGuides.every((g) => g.workedExample?.steps.length >= 4)).toBe(true);
      expect(outputs.slideDecks.decks.every((d) => d.slides.some((s) => s.visual?.kind === 'table'))).toBe(true);
      expect(outputs.slideDecks.decks.every((d) => d.slides[2].type === 'content')).toBe(true);
      expect(outputs.assignments.assignments.every((a) => !JSON.stringify(a.instructions).includes('Answer:'))).toBe(
        true,
      );
      const protectedBp = buildCourseBlueprint(map, { sourceBrief: brief + ' Use only instructor-provided sources.' });
      const protectedOut = compileBlueprintDeliverables(protectedBp, ['quizBank']);
      expect(
        protectedOut.quizBank.quizzes
          .flatMap((q) => q.questions)
          .some((q) => q.enrichmentSource === 'compiler-checked-explicit-inputs'),
      ).toBe(false);
    },
  );
  it('keeps named works and target languages in retrieval scope without restricting unrelated courses', () => {
    expect(requiredCourseSourceScope('Close Reading of Ozymandias')).toEqual({
      kind: 'named-reading',
      label: 'Ozymandias',
    });
    expect(sourceMatchesCourseScope('Close Reading of Ozymandias', 'All three translators used irony.')).toBe(false);
    expect(sourceMatchesCourseScope('Close Reading of Ozymandias', 'Shelley: Ozymandias, text and commentary.')).toBe(
      true,
    );
    expect(
      sourceMatchesCourseScope('Spanish Introductions for Beginners', 'Name: the name of a specific entity.'),
    ).toBe(false);
    expect(sourceMatchesCourseScope('Spanish Introductions for Beginners', 'Spanish greetings and pronouns')).toBe(
      true,
    );
    expect(sourceMatchesCourseScope('Spanish Civil War', 'Historical testimony')).toBe(true);
    expect(sourceMatchesCourseScope('Industrial Revolution Source Analysis', 'Quest for the historical Jesus')).toBe(
      false,
    );
    expect(
      sourceMatchesCourseScope(
        'Industrial Revolution Source Analysis',
        'British factory testimony in the textile mills',
      ),
    ).toBe(true);
    const p = buildScionEvidenceLessonPrompt(
      { courseName: 'Close Reading of Ozymandias', lessons: [{ title: 'Imagery and irony' }] },
      0,
    );
    expect(p.topics).toContain('Ozymandias');
    expect(p.evidenceIntent.join(' ')).toContain('Required named-reading');
  });
  it('rejects unrelated research before composing a fact ledger, including cached candidates', () => {
    const diagnostics = {};
    const lesson = { title: 'Greetings and names', requiredCourseName: 'Spanish Introductions for Beginners' };
    const kernels = [
      {
        term: 'Name',
        definition: 'A name identifies a specific entity.',
        provenance: { origin: 'algi-research', title: 'Name', topic: 'Greetings and names' },
      },
    ];
    expect(composeLessonFromKernels(lesson, kernels, { diagnostics })).toBeNull();
    expect(diagnostics.reason).toBe('course-source-scope');
    expect(composeResearchLedgerOnlyPayload(lesson, kernels)).toBeNull();
  });
  it('allows two actual patched worker readers while leaving cache writes exclusive', async () => {
    const original = readFileSync('public/scion/runtime/v3/wllama.js', 'utf8');
    const patched = patchScionSharedModelReads(original);
    expect(patched).toBe(readFileSync('public/scion/runtime/v4/wllama.js', 'utf8'));
    expect(patched).toContain('accessHandle = await fileHandler.createSyncAccessHandle();');
    const encoded = patched.match(/var LLAMA_CPP_WORKER_CODE = ("(?:[^"\\]|\\.)*");/)[1];
    const worker = JSON.parse(encoded);
    const start = worker.indexOf('const opfsAlloc');
    const end = worker.indexOf('////////////////////////////////////////////////', start);
    let opened = 0;
    const handle = {
      createSyncAccessHandle: async (options) => {
        if (options?.mode !== 'read-only' && opened) throw Error('locked');
        opened++;
        return {
          getSize: () => 16,
          close: () => {
            opened--;
          },
        };
      },
    };
    const root = { getDirectoryHandle: async () => ({ getFileHandle: async () => handle }) };
    const make = () =>
      runInNewContext(`const opfsHandles={}; ${worker.slice(start, end)}; ({opfsAlloc,opfsFreeAll})`, {
        navigator: { storage: { getDirectory: async () => root } },
        console: { log() {}, warn() {} },
        Module: { FS_createDataFile() {}, FS: { lookupPath: () => ({ node: {} }), unlink() {} } },
        Uint8Array,
      });
    const a = make(),
      b = make();
    await a.opfsAlloc('a', 'same-model');
    await b.opfsAlloc('b', 'same-model');
    expect(opened).toBe(2);
    a.opfsFreeAll();
    b.opfsFreeAll();
    expect(opened).toBe(0);
    expect(
      classifyScionBrowserModelLoadError(new Error('createSyncAccessHandle: another open Access Handle')),
    ).toMatchObject({ code: 'SCION_WLLAMA_CACHE_BUSY', clearCache: false });
  });
});
