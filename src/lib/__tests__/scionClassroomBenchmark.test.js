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
  it('shows every numerical reasoning step on the slide, with full source context in notes', () => {
    const slide = outputs.slideDecks.decks[0].slides.find((s) => s.workedExample?.verification?.numerator === '16');
    expect(slide.bullets.join(' ')).toContain('16 ÷ 20 = 0.80');
    expect(slide.bullets.join(' ')).toContain('0.80 × 100 = 80%');
    expect(slide.bullets.join(' ')).toContain('0.80 × 20 = 16');
    expect(slide.bullets.join(' ').split(/\s+/).length).toBeLessThan(85);
    expect(slide.notes).toContain('sample completion proportion');
  });
  it('exports the visible steps instead of silently substituting a different evidence table', async () => {
    const deck = outputs.slideDecks.decks[0];
    const slide = deck.slides.find((s) => s.workedExample?.verification?.numerator === '16');
    const blob = await buildSlideDeckPptxBlob({ decks: [{ ...deck, slides: [slide] }] }, 'Sample proportions', 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const visibleXml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(visibleXml).toContain('16 ÷ 20 = 0.80');
    expect(visibleXml).toContain('0.80 × 100 = 80%');
    expect(visibleXml).toContain('0.80 × 20 = 16');
    expect(visibleXml).not.toContain('SOURCE POINT');
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
  });
});
