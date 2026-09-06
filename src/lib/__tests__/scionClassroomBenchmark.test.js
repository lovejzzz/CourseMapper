import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import fixture from '../../../benchmarks/classroom/v1/cases/local-proportions.json';
import { completeNativeKernelSurfaces } from '../nativeGraphAuthoring.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { extractInstructorProvidedFacts } from '../sourceBriefConstraints.js';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter.js';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';

describe('classroom defects found in the frozen local Scion output', () => {
  let completed;
  let outputs;
  beforeAll(() => {
    const payload = structuredClone(fixture.lessonContent['lesson-1']);
    for (const field of payload.surfaceFallbacks) delete payload[field];
    completed = completeNativeKernelSurfaces(payload, fixture.map.lessons[0]);
    const blueprint = buildCourseBlueprint(fixture.map, {
      sourceBrief: fixture.sourceBrief,
      sessionMinutes: fixture.sessionMinutes,
      instructorProvidedFacts: extractInstructorProvidedFacts(fixture.sourceBrief),
      enrichment: { lessonContent: { 'lesson-1': completed } },
    });
    outputs = compileBlueprintDeliverables(blueprint, [
      'syllabus',
      'lessonPlans',
      'assignments',
      'discussions',
      'slideDecks',
      'quizBank',
      'courseFaq',
    ]);
  });
  it('rebuilds compiler-owned phantom materials while preserving authored scenario inputs', () => {
    expect(JSON.stringify(outputs)).not.toContain('two Worked calculation: 16/20 solution paths');
    expect(completed.kernel.facts).toEqual(fixture.lessonContent['lesson-1'].kernel.facts);
    const authored = {
      setup: 'Compare the supplied teacher solutions and explain the disagreement.',
      materials: 'two teacher-provided solution paths',
      source: 'instructor-authored',
    };
    const payload = structuredClone(fixture.lessonContent['lesson-1']);
    payload.kernel.scenario = authored;
    expect(completeNativeKernelSurfaces(payload, fixture.map.lessons[0]).kernel.scenario).toEqual(authored);
  });
  it('keeps the short workshop scope and makes the arithmetic task proportionate', () => {
    expect(outputs.syllabus.syllabus.meetingPattern).toContain('45');
    expect(JSON.stringify(outputs.syllabus)).not.toMatch(/weekly course sessions|later course topics/);
    expect(outputs.lessonPlans.lessonPlans[0].homework.connectionToNext).not.toContain('final course synthesis');
    expect(JSON.stringify(outputs.assignments)).not.toContain('750–1,250 words');
    expect(JSON.stringify(outputs.assignments)).toContain('2–4-sentence');
    expect(outputs.discussions.discussions[0].prompt).toMatch(
      /source limitation|additional evidence a wider claim would require/,
    );
  });
  it('shows numerical reasoning in order before independent work, with bounded slide density', () => {
    const deck = outputs.slideDecks.decks[0];
    const worked = deck.slides.filter((slide) => slide.taskRole?.startsWith('worked:'));
    const visible = worked.flatMap((slide) => slide.bullets).join(' ');
    const steps = ['16 ÷ 20 = 0.80', '0.80 × 100 = 80%', '0.80 × 20 = 16'];
    for (const step of steps) expect(visible).toContain(step);
    expect(visible.indexOf(steps[0])).toBeLessThan(visible.indexOf(steps[1]));
    expect(visible.indexOf(steps[1])).toBeLessThan(visible.indexOf(steps[2]));
    for (const slide of worked) {
      expect(slide.type).toBe('content');
      expect(slide.bullets.join(' ').split(/\s+/).length).toBeLessThanOrEqual(60);
      expect(deck.slides.indexOf(slide)).toBeLessThan(deck.slides.findIndex((s) => s.taskRole === 'activity'));
    }
    expect(worked[0].notes).toContain('sample completion proportion');
  });
  it('exports all visible steps using content layouts without substituting an evidence table', async () => {
    const deck = outputs.slideDecks.decks[0];
    const slides = deck.slides.filter((slide) => slide.taskRole?.startsWith('worked:'));
    const blob = await buildSlideDeckPptxBlob({ decks: [{ ...deck, slides }] }, 'Sample proportions', 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const visibleXml = (
      await Promise.all(slides.map((_, i) => zip.file(`ppt/slides/slide${i + 1}.xml`).async('string')))
    ).join(' ');
    expect(visibleXml).toContain('16 ÷ 20 = 0.80');
    expect(visibleXml).toContain('0.80 × 100 = 80%');
    expect(visibleXml).toContain('0.80 × 20 = 16');
    expect(visibleXml).not.toContain('SOURCE POINT');
    expect(visibleXml).not.toContain('LAST TIME');
  });
  it('asks for calculation in the quiz and exports the complete matching answer', async () => {
    const questions = outputs.quizBank.quizzes[0].questions;
    expect(questions).toHaveLength(8);
    const q = questions.find(
      (q) => q.enrichmentSource === 'shared-teaching-task' && q.practiceKind !== 'independent-transfer',
    );
    expect(q.question).toMatch(/Calculate 16\/20 as a decimal and percentage/i);
    expect(q.answer).toContain('0.80 × 20 = 16');
    const blob = await buildDeliverableDocxBlob('quizBank', outputs.quizBank, 'Sample proportions');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('Calculate 16/20 as a decimal and percentage');
    expect(xml).toContain('(16/20) × 100 = 80%');
    expect(xml).toContain('0.80 × 20 = 16');
    expect(xml).toContain('<w:pageBreakBefore/>');
  });
});
