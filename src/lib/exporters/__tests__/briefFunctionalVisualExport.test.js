/** @vitest-environment happy-dom */

import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../../courseBlueprintCompiler.js';
import { auditOfficeBlobRepetition, extractOfficeVisibleText } from '../../exportRenderedTextAudit.js';
import { buildSingleDeckPptxBlob } from '../pptxExporter.js';

beforeAll(() => {
  const context = {
    font: '12px sans',
    measureText(text) {
      const px = Number(String(this.font).match(/(\d+(?:\.\d+)?)px/)?.[1] || 12);
      return { width: String(text || '').length * px * 0.55 };
    },
    fillText() {},
    strokeText() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  if (globalThis.HTMLCanvasElement) {
    HTMLCanvasElement.prototype.getContext = function (type) {
      return type === '2d' ? context : null;
    };
  }
});

describe('brief functional visual PPTX export', () => {
  it('renders the required task as a concrete native specimen with visible action and provenance', async () => {
    const courseMap = {
      courseName: 'Visual Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Composition and Attention',
          sections: [
            {
              topicSection: 'Composition and attention',
              learningObjectives: 'Analyze composition evidence and justify an interpretation.',
              weeklyAssessments: 'Composition evidence memo',
              asyncActivities: 'Annotate one composition example.',
              syncActivities: 'Compare two interpretations.',
              supportingResources: 'Open composition source packet',
            },
          ],
        },
      ],
    };
    const brief =
      'Every lesson must require students to analyze a concrete visual and produce an evidence-based annotation or comparison. Use only open-licensed or public-domain visuals and preserve attribution and license boundaries.';
    const blueprint = buildCourseBlueprint(courseMap, { sourceBrief: brief });
    const deck = compileBlueprintDeliverables(blueprint, ['slideDecks']).slideDecks.decks[0];
    const blob = await buildSingleDeckPptxBlob(deck, 0, courseMap.courseName);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slides = await Promise.all(
      Object.entries(zip.files)
        .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .map(async ([name, entry]) => ({ name, xml: await entry.async('string') })),
    );
    const functional = slides.find(({ xml }) => xml.includes('Visual provenance'));

    expect(functional).toBeTruthy();
    expect(functional.xml).toMatch(/analyze/i);
    expect(functional.xml).toMatch(/annotate|compare/i);
    expect(functional.xml).toContain('Visual provenance');
    expect((functional.xml.match(/name="cmSpecimenPanel"/g) || []).length).toBe(1);
    expect((functional.xml.match(/name="cmEntity_[a-z0-9-]+"/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((functional.xml.match(/name="cmRelation_[a-z0-9-]+"/g) || []).length).toBeGreaterThanOrEqual(1);
    expect(functional.xml).toContain('<cm:specimenContract');
    expect(functional.xml).toContain('encoding="uri-json"');
    expect(functional.xml).not.toMatch(/descr="CM_SPECIMEN_CONTRACT_V1:/);
    expect(functional.xml).toContain('ORIGINAL NATIVE');
    expect(functional.xml).toContain(
      '<a:t>VERIFY LESSON 1 EVIDENCE · CM-SRC-L01 · APPLY TO LESSON 1 APPLICATION · CM-PROD-L01</a:t>',
    );
    const slideNumber = Number(functional.name.match(/slide(\d+)/)?.[1]);
    const notes = await zip.file(`ppt/notesSlides/notesSlide${slideNumber}.xml`)?.async('string');
    expect(notes).toMatch(/EXPECTED OBSERVATION/);
    expect(notes).toMatch(/ANSWER\/RUBRIC LINK/);
    const visibleText = await extractOfficeVisibleText(blob, 'pptx');
    expect(visibleText).not.toMatch(/specimenContract|uri-json|22geometry/i);
    expect(await auditOfficeBlobRepetition(blob, 'pptx')).toBeNull();
  });

  it('keeps typed specimen geometry when the visible observation prompt is longer than the layout limit', async () => {
    const courseMap = {
      courseName: 'Visual Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Perspective and Context Boundaries',
          sections: [
            {
              topicSection: 'Perspective, framing, and ethical context boundaries',
              learningObjectives: 'Analyze perspective evidence and justify a bounded interpretation.',
              weeklyAssessments: 'Perspective evidence memo',
              asyncActivities: 'Annotate one perspective example.',
              syncActivities: 'Compare two contextual interpretations.',
              supportingResources:
                'An intentionally long evidence packet label that preserves source identity, attribution, contextual limits, framing decisions, and the exact observation boundary learners must test before making any interpretive claim',
            },
          ],
        },
      ],
    };
    const brief =
      'Every lesson must require students to analyze a concrete visual and produce an evidence-based annotation or comparison. Use only open-licensed or public-domain visuals and preserve attribution and license boundaries.';
    const blueprint = buildCourseBlueprint(courseMap, { sourceBrief: brief });
    const deck = compileBlueprintDeliverables(blueprint, ['slideDecks']).slideDecks.decks[0];
    const functionalSlide = deck.slides.find((slide) => slide.visual?.typedSpecimen);
    functionalSlide.visual.observationPrompt +=
      ' Preserve every contextual qualifier from the governing source before accepting the interpretation.';
    expect(functionalSlide.visual.observationPrompt.length).toBeGreaterThan(260);

    const blob = await buildSingleDeckPptxBlob(deck, 0, courseMap.courseName);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slides = await Promise.all(
      Object.entries(zip.files)
        .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .map(async ([name, entry]) => ({ name, xml: await entry.async('string') })),
    );
    const functional = slides.find(({ xml }) => xml.includes('<cm:specimenContract'));

    expect(functional).toBeTruthy();
    expect((functional.xml.match(/name="cmEntity_[a-z0-9-]+"/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((functional.xml.match(/name="cmRelation_[a-z0-9-]+"/g) || []).length).toBeGreaterThanOrEqual(1);
  });
});
