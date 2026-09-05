import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildCourseMaterialsZip } from '../packageZipExporter.js';
import { extractPackage } from '../quality/deepQualityGrader.js';
import { createMemoryFileProvider } from '../quality/fileProviders.js';

const courseMap = {
  courseName: 'Rendered Root Isolation',
  lessons: [
    {
      title: 'Lesson 1: Questions',
      sections: [{ learningObjectives: 'Evaluate a policy question using explicit evidence.' }],
    },
    {
      title: 'Lesson 2: Sampling',
      sections: [{ learningObjectives: 'Compare sampling choices using explicit evidence.' }],
    },
  ],
};

function lessonPlan(lessonNumber) {
  return {
    lessonTitle: courseMap.lessons[lessonNumber - 1].title,
    duration: '75 minutes',
    objectives: [`Objective marker ${lessonNumber}`],
    outline: [
      {
        time: '20 minutes',
        activity: `Plan activity ${lessonNumber}`,
        description: `PLAN-ONLY-${lessonNumber} appears in exactly one exported lesson plan.`,
      },
    ],
  };
}

function faq(lessonNumber, prefix = 'FAQ-ONLY') {
  return {
    lessonTitle: courseMap.lessons[lessonNumber - 1].title,
    questions: [
      {
        question: `Where does ${prefix}-${lessonNumber} belong?`,
        answer: `${prefix}-${lessonNumber} appears in exactly one exported FAQ document.`,
      },
    ],
  };
}

async function renderedDocxFiles(featureId, data) {
  const result = await buildCourseMaterialsZip({
    courseMap,
    featureIds: [featureId],
    deliverables: { [featureId]: { status: 'done', data } },
    quality: false,
  });
  const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const files = {};
  for (const path of Object.keys(zip.files).filter((name) => name.endsWith('.docx'))) {
    files[path] = await zip.file(path).async('uint8array');
  }
  return extractPackage(createMemoryFileProvider(files));
}

function assertLessonIsolation(pkg, firstMarker, secondMarker) {
  const [first, second] = [...pkg.files].sort((left, right) => left.path.localeCompare(right.path));

  expect(pkg.files).toHaveLength(2);
  expect(first.text).toContain(firstMarker);
  expect(first.text).not.toContain(secondMarker);
  expect(second.text).toContain(secondMarker);
  expect(second.text).not.toContain(firstMarker);
}

describe('package ZIP rendered-root lesson isolation', () => {
  it('scopes the legacy lessonPlans.lessons root before real DOCX serialization', async () => {
    const pkg = await renderedDocxFiles('lessonPlans', {
      lessonPlans: { malformed: true },
      lessons: [lessonPlan(1), lessonPlan(2)],
    });

    assertLessonIsolation(pkg, 'PLAN-ONLY-1', 'PLAN-ONLY-2');
  });

  it.each(['faq', 'courseFAQ'])('scopes the legacy courseFaq.%s root before real DOCX serialization', async (key) => {
    const pkg = await renderedDocxFiles('courseFaq', { [key]: [faq(1), faq(2)] });

    assertLessonIsolation(pkg, 'FAQ-ONLY-1', 'FAQ-ONLY-2');
  });

  it('keeps canonical precedence while scoping every competing alias in the ZIP slice', async () => {
    const pkg = await renderedDocxFiles('courseFaq', {
      courseFaq: [faq(1, 'CANONICAL'), faq(2, 'CANONICAL')],
      faq: [faq(1, 'STALE'), faq(2, 'STALE')],
    });

    assertLessonIsolation(pkg, 'CANONICAL-1', 'CANONICAL-2');
    expect(pkg.files.map((file) => file.text).join(' ')).not.toContain('STALE-');
  });
});
