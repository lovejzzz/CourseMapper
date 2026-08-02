/**
 * @vitest-environment happy-dom
 */
import React, { useEffect, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportSidePanel, { hasDownloadableVerifiedPackage } from '../ExportSidePanel.jsx';
import { CourseProvider, useCourse } from '../../contexts/CourseContext.jsx';
import { downloadCourseMaterialsZip } from '../../lib/packageZipExporter.js';
import { CURRENT_FINALIZER_REVISION } from '../../lib/packageTrustStatus.js';

const readinessProbe = vi.hoisted(() => vi.fn());

vi.mock('../../lib/packageFinalizer', async () => {
  const actual = await vi.importActual('../../lib/packageFinalizer');
  return {
    ...actual,
    evaluateStrictPackageReadiness: (...args) => {
      const result = actual.evaluateStrictPackageReadiness(...args);
      readinessProbe(args[0], result);
      return result;
    },
  };
});

vi.mock('../../lib/packageZipExporter.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    downloadCourseMaterialsZip: vi.fn(async () => ({
      fileName: 'Review Surface Course - Course Materials.zip',
      files: ['PACKAGE_MANIFEST.json', 'QUALITY_REPORT.md'],
    })),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const courseMapWithObjectiveStem = {
  courseName: 'Readiness Race Course',
  lessons: [
    {
      title: 'Lesson 1: Export Readiness',
      sections: [
        {
          learningGoals: 'Evaluate readiness before export.',
          topicSection: 'Readiness checks',
          learningObjectives: 'Students will be able to:\n1a. Explain export readiness blockers.',
          weeklyAssessments: 'Readiness checkpoint',
          asyncActivities: 'Review the export notes.',
          syncActivities: 'Discuss blocker repair options.',
        },
      ],
    },
  ],
};

const cleanCourseMap = {
  courseName: 'Review Surface Course',
  lessons: [
    {
      title: 'Lesson 1: Export Readiness',
      sections: [
        {
          learningGoals: 'Evaluate readiness before export.',
          topicSection: 'Readiness checks',
          learningObjectives: 'Explain export readiness blockers.',
          weeklyAssessments: 'Readiness checkpoint',
          asyncActivities: 'Review the export notes.',
          syncActivities: 'Discuss blocker repair options.',
        },
      ],
    },
  ],
};

const EMPTY_DELIVERABLES = {};
const EMPTY_DELIVERABLE_CONFIG = {};
const COURSE_MAP_FEATURES = ['courseMap'];

it('requires actual export checks and honors receipt-v2 download safety', () => {
  const base = {
    status: 'ready',
    receipt: { finalStatus: 'ready', exportStatus: 'passed', exportFailed: 0 },
    quality: { status: 'graded', score: 95, grade: 'A' },
  };
  expect(hasDownloadableVerifiedPackage(base)).toBe(false);
  expect(
    hasDownloadableVerifiedPackage({
      ...base,
      status: 'blocked',
      receipt: { ...base.receipt, exportChecked: 8 },
      quality: { ...base.quality, findingCounts: { p0: 1, p1: 0, p2: 0 } },
    }),
  ).toBe(false);
  expect(
    hasDownloadableVerifiedPackage({
      ...base,
      status: 'blocked',
      receipt: {
        ...base.receipt,
        finalizerRevision: CURRENT_FINALIZER_REVISION,
        exportChecked: 8,
      },
      quality: { ...base.quality, findingCounts: { p0: 1, p1: 0, p2: 0 } },
    }),
  ).toBe(true);
  expect(
    hasDownloadableVerifiedPackage({
      ...base,
      receipt: {
        ...base.receipt,
        exportChecked: 8,
        packageReadinessReceipt: {
          protocol: 'coursemapper-package-readiness-receipt-v2',
          exportVerification: { status: 'passed', checked: 8, failed: 0 },
          downloadSafety: { status: 'blocked', blockerCount: 1 },
        },
      },
    }),
  ).toBe(false);

  const freshFinish = {
    quality: { status: 'graded', score: 95, grade: 'A' },
    exportVerification: { status: 'passed', checked: 8, failed: 0 },
    readiness: {
      blockers: [{ source: 'classroomReadiness', message: 'Resolve the structural package gap.' }],
    },
  };
  expect(hasDownloadableVerifiedPackage(base, freshFinish)).toBe(false);
  expect(
    hasDownloadableVerifiedPackage(base, {
      ...freshFinish,
      readiness: { blockers: [{ source: 'qualityGate', message: 'Review content quality in Agent.' }] },
    }),
  ).toBe(true);
});

function ExportPanelHarness({
  isPackageGenerationRunning = false,
  onAutoRepairReadiness = vi.fn(),
  onFinishPackage = vi.fn(),
  canFinishPackage = false,
  preferPackageScope = false,
  courseMapInput = courseMapWithObjectiveStem,
  activeTab = 'courseMap',
  activeTabLabel = 'Course Map',
  deliverablesInput = EMPTY_DELIVERABLES,
  deliverableConfigInput = EMPTY_DELIVERABLE_CONFIG,
  readinessDeliverableConfigInput = null,
  selectedFeaturesInput = COURSE_MAP_FEATURES,
  columnsInput = null,
  slideThemeInput = null,
  courseGraphInput = null,
  getPipelineState = null,
  getQualityContext = null,
  packageQualityPass = { status: 'idle', message: '' },
  onPackageQualityPassUpdate = null,
  qualityReportOpen = false,
}) {
  const { courseMap, setCourseMap, setSelectedFeatures, setDeliverableConfig, setColumns, setSlideTheme } = useCourse();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCourseMap(courseMapInput);
    setSelectedFeatures(selectedFeaturesInput);
    setDeliverableConfig(deliverableConfigInput);
    setColumns(
      columnsInput || [
        { key: 'learningGoals', label: 'Learning Goals', enabled: true },
        { key: 'topicSection', label: 'Topic', enabled: true },
        { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
        { key: 'weeklyAssessments', label: 'Assessments', enabled: true },
        { key: 'asyncActivities', label: 'Async Activities', enabled: true },
        { key: 'syncActivities', label: 'Sync Activities', enabled: true },
      ],
    );
    setSlideTheme(slideThemeInput);
    setReady(true);
  }, [
    courseMapInput,
    columnsInput,
    deliverableConfigInput,
    selectedFeaturesInput,
    setColumns,
    setCourseMap,
    setDeliverableConfig,
    setSelectedFeatures,
    setSlideTheme,
    slideThemeInput,
  ]);

  if (!ready || !courseMap) return null;

  return (
    <ExportSidePanel
      activeTab={activeTab}
      activeTabLabel={activeTabLabel}
      deliverables={deliverablesInput}
      readinessDeliverableConfig={readinessDeliverableConfigInput}
      onCourseMapExport={vi.fn()}
      onSaveProject={vi.fn()}
      onReadinessIssueClick={vi.fn()}
      onAutoRepairReadiness={onAutoRepairReadiness}
      onFinishPackage={onFinishPackage}
      canFinishPackage={canFinishPackage}
      packageQualityPass={packageQualityPass}
      onPackageQualityPassUpdate={onPackageQualityPassUpdate}
      qualityModalOpen={qualityReportOpen}
      onQualityModalOpenChange={vi.fn()}
      isPackageGenerationRunning={isPackageGenerationRunning}
      preferPackageScope={preferPackageScope}
      courseGraph={courseGraphInput}
      getPipelineState={getPipelineState}
      getQualityContext={getQualityContext}
    />
  );
}

describe('ExportSidePanel readiness repair timing', () => {
  let container;
  let root;

  beforeEach(() => {
    vi.useFakeTimers();
    readinessProbe.mockClear();
    downloadCourseMaterialsZip.mockReset().mockResolvedValue({
      fileName: 'Review Surface Course - Course Materials.zip',
      files: ['PACKAGE_MANIFEST.json', 'QUALITY_REPORT.md'],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function renderPanel(props) {
    await act(async () => {
      root.render(
        <CourseProvider>
          <ExportPanelHarness {...props} />
        </CourseProvider>,
      );
    });
    await act(async () => {});
  }

  async function prepareReceiptHandoff() {
    const liveCourseMap = structuredClone(cleanCourseMap);
    liveCourseMap.lessons.push({
      ...structuredClone(liveCourseMap.lessons[0]),
      title: 'Lesson 2: Parent Receipt Handoff',
    });
    const finalizedCourseMap = structuredClone(liveCourseMap);
    finalizedCourseMap.courseName = 'Exact finalizer snapshot';
    const quality = {
      status: 'graded',
      score: 96,
      grade: 'A',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    };
    const receiptA = {
      finalizerRevision: CURRENT_FINALIZER_REVISION,
      finalStatus: 'ready',
      exportStatus: 'passed',
      exportChecked: 38,
      exportFailed: 0,
      generation: 'A',
    };
    const receiptB = { ...receiptA, generation: 'B', adversarialValue: null };
    const onFinishPackage = vi.fn(async () => ({
      courseMap: finalizedCourseMap,
      deliverables: {},
      readiness: { status: 'ready', blockers: [], warnings: [], issues: [], featureCount: 1 },
      quality,
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      receipt: receiptB,
    }));
    const props = {
      courseMapInput: liveCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
    };

    await renderPanel({
      ...props,
      packageQualityPass: { status: 'ready', blockers: 0, warnings: 0, receipt: receiptA, quality },
    });
    await act(async () => {
      container
        .querySelector('[data-testid="lesson-scope-edit"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const firstLessonButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Lesson 1: Export Readiness'),
    );
    expect(firstLessonButton).toBeDefined();
    await act(async () => {
      firstLessonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="export-download-zip"]')?.textContent).toContain('Prepare package');
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });
    expect(onFinishPackage).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();

    return { props, liveCourseMap, finalizedCourseMap, quality, receiptA, receiptB, onFinishPackage };
  }

  it('waits to auto-repair readiness blockers while package generation is still running', async () => {
    const onAutoRepairReadiness = vi.fn();

    await renderPanel({ isPackageGenerationRunning: true, onAutoRepairReadiness });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(onAutoRepairReadiness).not.toHaveBeenCalled();
    // v0.14.4 WS-B3: the panel no longer narrates the running stage (that is
    // the build ribbon's job) — it simply withholds the readiness card while
    // the workflow runs instead of rendering a "Finishing package" card.
    expect(container.querySelector('[data-testid="readiness-panel"]')).toBeNull();
    expect(container.textContent).not.toContain('Finishing package is repairing');
  });

  it('auto-repairs readiness blockers once the package is idle', async () => {
    const onAutoRepairReadiness = vi.fn(() => ({
      changed: true,
      applied: 1,
      repairs: [],
      courseMap: courseMapWithObjectiveStem,
      deliverables: {},
    }));

    await renderPanel({ isPackageGenerationRunning: false, onAutoRepairReadiness });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(onAutoRepairReadiness).toHaveBeenCalledTimes(1);
    expect(onAutoRepairReadiness).toHaveBeenCalledWith({
      selectedFeatureIds: ['courseMap'],
      lessonFilter: null,
    });
  });

  it('passes configured question targets into rendered export readiness', async () => {
    const quizDeliverables = {
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              lessonTitle: 'Lesson 1: Export Readiness',
              questions: Array.from({ length: 5 }, (_, index) => ({
                question: `Which readiness check applies to case ${index + 1}?`,
                options: ['Evidence fit', 'Guessing', 'Omission', 'Duplication'],
                answer: 'Evidence fit',
                explanation: 'Evidence fit is the only option that checks the generated package against its brief.',
                type: 'multiple_choice',
                difficulty: 'Medium',
                points: 2,
              })),
            },
          ],
        },
      },
    };

    await renderPanel({
      activeTab: 'quizBank',
      activeTabLabel: 'Quiz & Exam Bank',
      courseMapInput: cleanCourseMap,
      deliverablesInput: quizDeliverables,
      selectedFeaturesInput: ['quizBank'],
      deliverableConfigInput: { quizBank: { questionsPerLesson: 5 } },
      readinessDeliverableConfigInput: { quizBank: { questionsPerLesson: 8 } },
    });

    const quizEvaluation = [...readinessProbe.mock.calls]
      .reverse()
      .find(([options]) => options.selectedFeatures?.length === 1 && options.selectedFeatures[0] === 'quizBank');
    expect(quizEvaluation?.[0].deliverableConfig).toEqual({ quizBank: { questionsPerLesson: 8 } });
    expect(quizEvaluation?.[1].warnings.map((issue) => issue.message).join(' ')).toContain('fewer than 8 questions');
  });

  it('does not apply the default FAQ target to a configured three-question export', async () => {
    const faqDeliverables = {
      courseFaq: {
        status: 'done',
        data: {
          faqs: [
            {
              lessonTitle: 'Lesson 1: Export Readiness',
              questions: [
                {
                  question: 'Where is the checklist?',
                  answer: 'Open the lesson workspace and select the readiness checklist.',
                  category: 'Course Logistics',
                },
                {
                  question: 'How is readiness evaluated?',
                  answer: 'Compare each package artifact with the requested course brief.',
                  category: 'Concept Explanation',
                },
                {
                  question: 'What should I submit?',
                  answer: 'Submit the package named in the Course Map assessment.',
                  category: 'Assignment Clarification',
                },
              ],
            },
          ],
        },
      },
    };

    await renderPanel({
      activeTab: 'courseFaq',
      activeTabLabel: 'Course FAQ',
      courseMapInput: cleanCourseMap,
      deliverablesInput: faqDeliverables,
      selectedFeaturesInput: ['courseFaq'],
      deliverableConfigInput: { courseFaq: { questionsPerLesson: 3 } },
    });

    const faqEvaluation = [...readinessProbe.mock.calls]
      .reverse()
      .find(([options]) => options.selectedFeatures?.length === 1 && options.selectedFeatures[0] === 'courseFaq');
    expect(faqEvaluation?.[0].deliverableConfig).toEqual({ courseFaq: { questionsPerLesson: 3 } });
    expect(faqEvaluation?.[1].warnings.map((issue) => issue.message).join(' ')).not.toMatch(
      /FAQ has fewer than [35] questions/i,
    );
  });

  it('uses the configured target in the click-time ZIP readiness snapshot', async () => {
    const onFinishPackage = vi.fn(async () => false);
    const quizDeliverables = {
      quizBank: {
        status: 'done',
        data: {
          quizzes: [
            {
              lessonTitle: 'Lesson 1: Export Readiness',
              questions: Array.from({ length: 5 }, (_, index) => ({
                question: `Which evidence check applies to case ${index + 1}?`,
                options: ['Trace the claim', 'Guess', 'Skip', 'Duplicate'],
                answer: 'Trace the claim',
                explanation: 'Tracing the claim checks the generated artifact against its evidence.',
                type: 'multiple_choice',
                difficulty: 'Medium',
                points: 2,
              })),
            },
          ],
        },
      },
    };

    await renderPanel({
      activeTab: 'quizBank',
      activeTabLabel: 'Quiz & Exam Bank',
      courseMapInput: cleanCourseMap,
      deliverablesInput: quizDeliverables,
      selectedFeaturesInput: ['quizBank'],
      deliverableConfigInput: { quizBank: { questionsPerLesson: 8 } },
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
    });

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    await act(async () => {
      zipButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onFinishPackage).toHaveBeenCalledTimes(1);
    const readiness = onFinishPackage.mock.calls[0][0].readiness;
    expect(readiness.warnings.map((issue) => issue.message).join(' ')).toContain('fewer than 8 questions');
  });

  it('names download formats for people while retaining the exact extensions', async () => {
    await renderPanel({ courseMapInput: cleanCourseMap });

    expect(container.querySelector('[data-testid="export-format-xlsx"]')?.textContent).toContain('Excel (.xlsx)');
    expect(container.querySelector('[data-testid="export-format-docx"]')?.textContent).toContain('Word (.docx)');
    expect(container.querySelector('[data-testid="export-format-pdf"]')?.textContent).toContain('PDF (.pdf)');
    expect(container.querySelector('[data-testid="export-format-csv"]')?.textContent).toContain('CSV (.csv)');
  });

  it('shows a calm ready state and keeps honest quality details out of Export', async () => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        repairsApplied: 2,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          exportStatus: 'warnings',
          exportChecked: 38,
          exportFailed: 0,
          exportWarningCount: 1,
          exportWarning: 'PPTX export generated, but rendered text repeats one phrase 22 times.',
        },
        quality: {
          status: 'graded',
          score: 96,
          grade: 'A',
          findingCounts: { p0: 0, p1: 3, p2: 1 },
          texture: { score: 92 },
          readiness: {
            score: 61,
            maxScore: 100,
            evidenceCeiling: 69,
            band: 'strong-automated-signal',
            claimBoundary: 'Automated signals cannot prove instructor validation.',
          },
        },
      },
    });

    const panel = container.querySelector('[data-testid="readiness-panel"]');
    expect(panel?.textContent).toContain('Ready to download');
    expect(panel?.className).toContain('emerald');
    expect(panel?.textContent).not.toContain('Download available');
    expect(panel?.textContent).not.toContain('Download is ready. Review notes are saved');
    expect(panel?.textContent).not.toContain('Show notes');
    expect(panel?.textContent).not.toContain('4 quality issues');
    expect(panel?.textContent).toContain('2 safe repairs applied');
    expect(panel?.textContent).not.toContain('export warning');
    expect(panel?.textContent).not.toContain('3 P1 · 1 P2');
    expect(panel?.textContent).not.toContain('PPTX export generated');
    expect(container.querySelector('[data-testid="export-panel-title"]')?.textContent).toBe('Export package');
    expect(container.querySelector('[data-testid="quality-stamp"]')).toBeNull();
    expect(panel?.textContent).not.toContain('61/100');
    expect(panel?.textContent).not.toContain('96');
    expect(container.querySelector('[data-testid="export-download-zip"]')?.disabled).toBe(false);
  });

  it('portals the quality report to the viewport instead of clipping it inside the export panel', async () => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'ready',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
          exportWarningCount: 0,
        },
        quality: {
          status: 'graded',
          score: 96,
          grade: 'A',
          graderVersion: '1.10.27',
          findingCounts: { p0: 0, p1: 1, p2: 0 },
          findings: [{ id: 'one', severity: 'P1', dimension: 'citations', detail: 'Review one citation.' }],
          dimensions: { citations: 90, structure: 100 },
          readiness: {
            score: 61,
            maxScore: 100,
            evidenceCeiling: 69,
            band: 'strong-automated-signal',
            claimBoundary: 'Automated signals cannot prove instructor validation.',
            components: {
              curriculumFidelity: { score: 100, weight: 25 },
              evidenceGrounding: { score: 56, weight: 25 },
            },
          },
        },
      },
      qualityReportOpen: true,
    });

    const modal = document.body.querySelector('[data-testid="quality-report-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.parentElement).toBe(document.body);
    expect(container.querySelector('[data-testid="quality-report-modal"]')).toBeNull();
    expect(modal?.textContent).toContain('Deterministic package evidence — 61/100 earned');
    expect(modal?.textContent).toContain('Package conformance 96/100 (A)');
    expect(modal?.textContent).toContain('Missing evidence stays in the fixed 100-point potential');
  });

  it.each([
    ['a missing score', { status: 'graded', grade: 'A' }],
    ['a missing grade', { status: 'graded', score: 96 }],
    ['a whitespace-only grade', { status: 'graded', score: 96, grade: '   ' }],
  ])('fails closed instead of opening the quality modal for %s', async (_label, quality) => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: { exportWarningCount: 0 },
        quality,
      },
      qualityReportOpen: true,
    });

    expect(document.body.querySelector('[data-testid="quality-report-modal"]')).toBeNull();
  });

  it('names the ZIP preparation work while the package is being assembled', async () => {
    downloadCourseMaterialsZip.mockImplementationOnce(() => new Promise(() => {}));
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'ready',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
          exportWarningCount: 0,
        },
        quality: {
          status: 'graded',
          score: 100,
          grade: 'A',
          findingCounts: { p0: 0, p1: 0, p2: 0 },
        },
      },
    });

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(zipButton?.textContent).toContain('Preparing ZIP…');
    expect(zipButton?.disabled).toBe(true);
    expect(zipButton?.getAttribute('aria-busy')).toBe('true');
    expect(container.textContent).toContain('Assembling the verified course files locally');
  });

  it('prepares first, then downloads with the exact proof and snapshot from that finish', async () => {
    const finishQuality = {
      status: 'graded',
      score: 98,
      grade: 'A',
      graderVersion: 'same-click-proof',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    };
    const finishReceipt = {
      finalizerRevision: CURRENT_FINALIZER_REVISION,
      finalStatus: 'ready',
      exportStatus: 'passed',
      exportChecked: 38,
      exportFailed: 0,
    };
    const onFinishPackage = vi.fn(async () => ({
      courseMap: cleanCourseMap,
      deliverables: {},
      readiness: { blockers: [], warnings: [], featureCount: 1 },
      quality: finishQuality,
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      receipt: finishReceipt,
    }));
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: { status: 'idle', message: '' },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(onFinishPackage).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();

    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: { status: 'ready', blockers: 0, warnings: 0, receipt: finishReceipt, quality: finishQuality },
    });
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip.mock.calls[0][0].quality.precomputed).toMatchObject(finishQuality);
    expect(downloadCourseMaterialsZip.mock.calls[0][0].quality.precomputed).toMatchObject({
      packageReadinessBinding: {
        protocol: 'coursemapper-package-readiness-binding-v1',
        blockerCount: 0,
        warningCount: 0,
        issues: [],
      },
    });
    expect(finishQuality).not.toHaveProperty('packageReadinessBinding');
  });

  it('freezes every ZIP argument against prop replacement and in-place mutation after preparation', async () => {
    const preparedCourseMap = structuredClone(cleanCourseMap);
    const preparedDeliverables = {
      lessonPlans: { status: 'done', data: { lessonPlans: [{ lessonTitle: 'Prepared lesson', outline: [] }] } },
    };
    const preparedCourseGraph = { nodes: [{ id: 'prepared-node' }] };
    const preparedColumns = [{ key: 'learningGoals', label: 'Prepared goals', enabled: true }];
    const pipelineState = { revision: 1, stages: ['prepared'] };
    const qualityContext = { digest: 'prepared-digest', budget: { max: 12 } };
    const finishQuality = {
      status: 'graded',
      score: 97,
      grade: 'A',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    };
    const finishReceipt = {
      finalizerRevision: CURRENT_FINALIZER_REVISION,
      finalStatus: 'ready',
      exportStatus: 'passed',
      exportChecked: 38,
      exportFailed: 0,
    };
    const finishReadiness = { status: 'ready', blockers: [], warnings: [], issues: [], featureCount: 2 };
    const onFinishPackage = vi.fn(async () => ({
      courseMap: preparedCourseMap,
      deliverables: preparedDeliverables,
      courseGraph: preparedCourseGraph,
      readiness: finishReadiness,
      quality: finishQuality,
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      receipt: finishReceipt,
    }));
    const getPipelineState = vi.fn(() => pipelineState);
    const getQualityContext = vi.fn(() => qualityContext);

    await renderPanel({
      courseMapInput: cleanCourseMap,
      deliverablesInput: preparedDeliverables,
      selectedFeaturesInput: ['courseMap', 'lessonPlans'],
      columnsInput: preparedColumns,
      slideThemeInput: 2,
      courseGraphInput: preparedCourseGraph,
      getPipelineState,
      getQualityContext,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: { status: 'idle', message: '' },
    });
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    const parentReceipt = structuredClone(finishReceipt);
    preparedCourseMap.courseName = 'Mutated live course';
    preparedDeliverables.lessonPlans.data.lessonPlans[0].lessonTitle = 'Mutated live lesson';
    preparedCourseGraph.nodes[0].id = 'mutated-node';
    preparedColumns[0].label = 'Mutated goals';
    pipelineState.revision = 2;
    pipelineState.stages.push('mutated');
    qualityContext.digest = 'mutated-digest';
    qualityContext.budget.max = 99;
    finishReceipt.exportChecked = 0;
    finishQuality.score = 1;
    finishQuality.findingCounts.p0 = 1;
    finishReadiness.status = 'blocked';
    finishReadiness.blockers.push({ message: 'Mutated readiness blocker.' });

    await renderPanel({
      courseMapInput: preparedCourseMap,
      deliverablesInput: preparedDeliverables,
      selectedFeaturesInput: ['courseMap'],
      columnsInput: [{ key: 'learningGoals', label: 'Replacement goals', enabled: true }],
      slideThemeInput: 4,
      courseGraphInput: preparedCourseGraph,
      getPipelineState,
      getQualityContext,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: parentReceipt,
        quality: finishQuality,
      },
    });
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(onFinishPackage).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
    const options = downloadCourseMaterialsZip.mock.calls[0][0];
    expect(options.courseMap.courseName).toBe('Review Surface Course');
    expect(options.deliverables.lessonPlans.data.lessonPlans[0].lessonTitle).toBe('Prepared lesson');
    expect(options.courseGraph.nodes[0].id).toBe('prepared-node');
    expect(options.columns).toEqual([{ key: 'learningGoals', label: 'Prepared goals', enabled: true }]);
    expect(options.featureIds).toEqual(['courseMap', 'lessonPlans']);
    expect(options.slideTheme).toBe(2);
    expect(options.pipelineState).toEqual({ revision: 1, stages: ['prepared'] });
    expect(options.quality).toMatchObject({ digest: 'prepared-digest', budget: { max: 12 } });
    expect(options.quality.precomputed).toMatchObject({ score: 97, findingCounts: { p0: 0, p1: 0, p2: 0 } });
    expect(options.readiness).toMatchObject({ status: 'ready', blockers: [] });
  });

  it('retains the exact finalizer snapshot while the parent receipt advances from A to B', async () => {
    const { props, liveCourseMap, quality, receiptB } = await prepareReceiptHandoff();
    const reorderedReceiptB = Object.fromEntries(Object.entries(receiptB).reverse());

    await renderPanel({
      ...props,
      courseMapInput: liveCourseMap,
      packageQualityPass: { status: 'ready', blockers: 0, warnings: 0, receipt: reorderedReceiptB, quality },
    });
    const downloadButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(downloadButton?.textContent).toContain('Download ZIP');
    await act(async () => {
      downloadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip.mock.calls[0][0].courseMap.courseName).toBe('Exact finalizer snapshot');
  });

  it('re-downloads the exact frozen package after the ZIP publishes its trusted successor receipt', async () => {
    const { props, liveCourseMap, quality, receiptB } = await prepareReceiptHandoff();
    let parentState = { status: 'ready', blockers: 0, warnings: 0, receipt: receiptB, quality };
    const onPackageQualityPassUpdate = vi.fn((updater) => {
      parentState = updater(parentState);
    });
    downloadCourseMaterialsZip.mockResolvedValue({
      fileName: 'Review Surface Course - Course Materials.zip',
      files: ['PACKAGE_MANIFEST.json', 'QUALITY_REPORT.md'],
      quality,
      qualityResult: { grades: {}, findings: [], stats: { findingCount: 0, fileCount: 2 } },
      packageReadinessReceipt: {
        exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      },
    });

    await renderPanel({
      ...props,
      packageQualityPass: parentState,
      onPackageQualityPassUpdate,
    });
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });
    expect(onPackageQualityPassUpdate).toHaveBeenCalledTimes(1);
    expect(parentState.receipt.packageReadinessReceipt).toBeDefined();

    const replacedLiveCourseMap = structuredClone(liveCourseMap);
    replacedLiveCourseMap.courseName = 'Mutated live state after download';
    await renderPanel({
      ...props,
      courseMapInput: replacedLiveCourseMap,
      packageQualityPass: parentState,
      onPackageQualityPassUpdate,
    });
    expect(container.querySelector('[data-testid="export-download-zip"]')?.textContent).toContain('Download ZIP');
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(2);
    expect(downloadCourseMaterialsZip.mock.calls[1][0]).toEqual(downloadCourseMaterialsZip.mock.calls[0][0]);
    expect(downloadCourseMaterialsZip.mock.calls[1][0].courseMap.courseName).toBe('Exact finalizer snapshot');
  });

  it('requires preparation again after scope invalidation interrupts an A to B handoff', async () => {
    const { props, liveCourseMap, quality, receiptB } = await prepareReceiptHandoff();
    const firstLessonButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent.includes('Lesson 1: Export Readiness'),
    );
    expect(firstLessonButton).toBeDefined();
    await act(async () => {
      firstLessonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await renderPanel({
      ...props,
      courseMapInput: liveCourseMap,
      packageQualityPass: { status: 'ready', blockers: 0, warnings: 0, receipt: receiptB, quality },
    });
    expect(container.querySelector('[data-testid="export-download-zip"]')?.textContent).toContain('Prepare package');
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('fails closed when the parent receipt disappears during an A to B handoff', async () => {
    const { props, liveCourseMap, quality, receiptB } = await prepareReceiptHandoff();
    await renderPanel({
      ...props,
      courseMapInput: liveCourseMap,
      packageQualityPass: { status: 'idle', message: '' },
    });
    await renderPanel({
      ...props,
      courseMapInput: liveCourseMap,
      packageQualityPass: { status: 'ready', blockers: 0, warnings: 0, receipt: receiptB, quality },
    });
    expect(container.querySelector('[data-testid="export-download-zip"]')?.textContent).toContain('Prepare package');
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('fails closed when an unrelated receipt replaces an A to B handoff', async () => {
    const { props, liveCourseMap, quality, receiptB } = await prepareReceiptHandoff();
    const receiptC = { ...receiptB, adversarialValue: Number.NaN };
    await renderPanel({
      ...props,
      courseMapInput: liveCourseMap,
      packageQualityPass: { status: 'ready', blockers: 0, warnings: 0, receipt: receiptC, quality },
    });
    expect(container.querySelector('[data-testid="export-download-zip"]')?.textContent).toContain('Prepare package');
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it.each([
    ['bigint', (receipt) => ({ ...receipt, adversarialValue: 1n })],
    [
      'circular',
      (receipt) => {
        const circular = { ...receipt };
        circular.self = circular;
        return circular;
      },
    ],
  ])('tombstones an unsupported %s receipt until explicit finalization', async (_label, makeInvalidReceipt) => {
    const { props, liveCourseMap, quality, receiptB, onFinishPackage } = await prepareReceiptHandoff();
    await renderPanel({
      ...props,
      courseMapInput: liveCourseMap,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: makeInvalidReceipt(receiptB),
        quality,
      },
    });
    await renderPanel({
      ...props,
      courseMapInput: liveCourseMap,
      packageQualityPass: { status: 'ready', blockers: 0, warnings: 0, receipt: receiptB, quality },
    });
    expect(container.querySelector('[data-testid="export-download-zip"]')?.textContent).toContain('Prepare package');
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });
    expect(onFinishPackage).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-testid="export-download-zip"]')?.textContent).toContain('Download ZIP');
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('prepares an obsolete P0 receipt once and binds the refreshed package into the later download', async () => {
    const repairedDeliverables = {
      slideDecks: { status: 'done', data: { decks: [{ lessonTitle: 'Repaired lesson', slides: [] }] } },
    };
    const refreshedQuality = {
      status: 'graded',
      score: 91,
      grade: 'A',
      graderVersion: 'revision-2-proof',
      findingCounts: { p0: 0, p1: 0, p2: 1 },
    };
    const refreshedReceipt = {
      finalizerRevision: CURRENT_FINALIZER_REVISION,
      finalStatus: 'ready',
      exportStatus: 'passed',
      exportChecked: 38,
      exportFailed: 0,
    };
    const onFinishPackage = vi.fn(async () => ({
      courseMap: cleanCourseMap,
      deliverables: repairedDeliverables,
      readiness: { status: 'ready', blockers: [], warnings: [], issues: [], featureCount: 1 },
      quality: refreshedQuality,
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      receipt: refreshedReceipt,
    }));

    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        receipt: { finalStatus: 'blocked', exportStatus: 'passed', exportChecked: 38, exportFailed: 0 },
        quality: {
          status: 'graded',
          score: 34,
          grade: 'F',
          findingCounts: { p0: 5, p1: 1, p2: 6 },
        },
      },
    });

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Prepare package');
    expect(zipButton?.disabled).toBe(false);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(onFinishPackage).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();

    await renderPanel({
      courseMapInput: cleanCourseMap,
      deliverablesInput: repairedDeliverables,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: refreshedReceipt,
        quality: refreshedQuality,
      },
    });
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip.mock.calls[0][0].deliverables).toStrictEqual(repairedDeliverables);
    expect(downloadCourseMaterialsZip.mock.calls[0][0].deliverables).not.toBe(repairedDeliverables);
    expect(downloadCourseMaterialsZip.mock.calls[0][0].quality.precomputed).toMatchObject(refreshedQuality);
  });

  it('keeps review warnings in ZIP evidence while Export presents a calm ready state', async () => {
    const warning = {
      severity: 'warning',
      source: 'classroomReadiness',
      featureId: 'quizBank',
      message: 'Review the question count before publishing.',
    };
    const warningReceipt = {
      finalizerRevision: CURRENT_FINALIZER_REVISION,
      finalStatus: 'ready',
      exportStatus: 'passed',
      exportChecked: 38,
      exportFailed: 0,
    };
    const warningQuality = {
      status: 'graded',
      score: 91,
      grade: 'A',
      graderVersion: 'warning-proof',
      findingCounts: { p0: 0, p1: 1, p2: 0 },
    };
    const onFinishPackage = vi.fn(async () => ({
      courseMap: cleanCourseMap,
      deliverables: {},
      readiness: { status: 'warnings', blockers: [], warnings: [warning], issues: [warning], featureCount: 1 },
      quality: warningQuality,
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      receipt: warningReceipt,
    }));
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: { status: 'idle', message: '' },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 1,
        receipt: warningReceipt,
        quality: warningQuality,
      },
    });
    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
    const options = downloadCourseMaterialsZip.mock.calls[0][0];
    expect(options.readiness).toMatchObject({ status: 'warnings', warnings: [warning] });
    expect(options.quality.precomputed.packageReadinessBinding).toMatchObject({
      warningCount: 1,
      issues: [warning],
    });
  });

  it('does not download or fall back to stale proof when preparation returns no current grade', async () => {
    const staleQuality = {
      status: 'graded',
      score: 100,
      grade: 'A',
      graderVersion: 'stale-before-repair',
      findingCounts: { p0: 0, p1: 0, p2: 0 },
    };
    const onFinishPackage = vi.fn(async () => ({
      courseMap: cleanCourseMap,
      deliverables: {},
      repairsApplied: 2,
      readiness: { blockers: [], warnings: [], featureCount: 1 },
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      receipt: { finalStatus: 'ready', exportStatus: 'passed', exportChecked: 38, exportFailed: 0 },
    }));
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: { status: 'idle', quality: staleQuality },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(onFinishPackage).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('returns calmly to preparation while Agent receives a ZIP-time quality-proof failure', async () => {
    const onPackageQualityPassUpdate = vi.fn();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    downloadCourseMaterialsZip.mockResolvedValueOnce({
      downloaded: false,
      downloadFailure: { code: 'quality-proof-unavailable' },
      files: ['PACKAGE_MANIFEST.json', 'QUALITY_REPORT.md'],
      quality: { status: 'not-graded', reason: 'quality check timed out' },
    });
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      onPackageQualityPassUpdate,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        blockerDomains: { schemaVersion: 1, readiness: 0, quality: 0, export: 0, total: 0 },
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'ready',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
        },
        quality: { status: 'graded', score: 99, grade: 'A', findingCounts: { p0: 0, p1: 0, p2: 0 } },
      },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="export-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="export-notice"]')).toBeNull();
    expect(container.querySelector('[data-testid="export-success"]')).toBeNull();
    expect(onPackageQualityPassUpdate).toHaveBeenCalledTimes(1);
    const blockedPass = onPackageQualityPassUpdate.mock.calls[0][0]({
      status: 'ready',
      blockers: 0,
      blockerDomains: { schemaVersion: 1, readiness: 0, quality: 0, export: 0, total: 0 },
    });
    expect(blockedPass).toMatchObject({
      status: 'blocked',
      blockers: 1,
      blockerDomains: { readiness: 0, quality: 1, export: 0, total: 1 },
      quality: { status: 'not-graded' },
    });
  });

  it('stops a same-click structural blocker before ZIP assembly and keeps Export calm', async () => {
    const structuralBlocker = {
      severity: 'blocker',
      source: 'classroomReadiness',
      featureId: 'lessonPlans',
      message: 'Add the missing lesson-plan evidence before export.',
    };
    const onFinishPackage = vi.fn(async () => ({
      courseMap: cleanCourseMap,
      deliverables: {},
      readiness: {
        status: 'blocked',
        blockers: [structuralBlocker],
        warnings: [],
        issues: [structuralBlocker],
        featureCount: 1,
      },
      quality: { status: 'graded', score: 92, grade: 'A', findingCounts: { p0: 0, p1: 1, p2: 0 } },
      exportVerification: { status: 'passed', checked: 38, failed: 0, warningCount: 0 },
      receipt: { finalStatus: 'ready', exportStatus: 'passed', exportChecked: 38, exportFailed: 0 },
    }));
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      onFinishPackage,
      packageQualityPass: { status: 'idle', message: '' },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(onFinishPackage).toHaveBeenCalledTimes(1);
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="readiness-confirm"]')).toBeNull();
    expect(container.querySelector('[data-testid="readiness-status"]')?.textContent).toContain('Prepare package');
    expect(container.querySelector('[data-testid="export-side-panel"]')?.textContent).not.toMatch(/score \d+/i);
    expect(container.querySelector('[data-testid="export-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="export-notice"]')).toBeNull();
  });

  it('routes a graded structural download block to readiness without a false quality warning', async () => {
    const onPackageQualityPassUpdate = vi.fn();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    downloadCourseMaterialsZip.mockResolvedValueOnce({
      downloaded: false,
      downloadFailure: { code: 'package-safety-unverified' },
      quality: { status: 'graded', score: 92, grade: 'A', findingCounts: { p0: 0, p1: 1, p2: 0 } },
      packageReadinessReceipt: {
        protocol: 'coursemapper-package-readiness-receipt-v2',
        downloadSafety: { status: 'blocked', blockerCount: 1, structuralBlockerCount: 1 },
      },
    });
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      onPackageQualityPassUpdate,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        blockerDomains: { schemaVersion: 1, readiness: 0, quality: 0, export: 0, total: 0 },
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'ready',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
        },
        quality: { status: 'graded', score: 92, grade: 'A', findingCounts: { p0: 0, p1: 1, p2: 0 } },
      },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="export-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="export-notice"]')).toBeNull();
    const blockedPass = onPackageQualityPassUpdate.mock.calls[0][0]({
      status: 'ready',
      blockers: 0,
      blockerDomains: { schemaVersion: 1, readiness: 0, quality: 0, export: 0, total: 0 },
      quality: { status: 'graded', score: 92, grade: 'A' },
    });
    expect(blockedPass).toMatchObject({
      status: 'blocked',
      blockers: 1,
      blockerDomains: { readiness: 1, quality: 0, export: 0, total: 1 },
      quality: { status: 'graded', score: 92 },
      receipt: {
        packageReadinessReceipt: {
          downloadSafety: { status: 'blocked', blockerCount: 1, structuralBlockerCount: 1 },
        },
      },
    });
  });

  it('reports safe automatic fixes as part of the green download receipt, not an amber warning', async () => {
    let finishDownload;
    const onAutoRepairReadiness = vi.fn(() => ({
      applied: 7,
      courseMap: cleanCourseMap,
      deliverables: {},
    }));
    downloadCourseMaterialsZip.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDownload = resolve;
        }),
    );
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      onAutoRepairReadiness,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        repairsApplied: 1,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'ready',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
          exportWarningCount: 0,
        },
        quality: {
          status: 'graded',
          score: 99,
          grade: 'A',
          findingCounts: { p0: 0, p1: 0, p2: 0 },
        },
      },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
    expect(onAutoRepairReadiness).not.toHaveBeenCalled();
    await act(async () => {
      finishDownload({
        fileName: 'Review Surface Course - Course Materials.zip',
        files: ['PACKAGE_MANIFEST.json', 'QUALITY_REPORT.md'],
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const success = container.querySelector('[data-testid="export-success"]');
    expect(success?.textContent).toContain('1 safe fix applied');
    expect(success?.className).toContain('text-emerald-800');
    expect(success?.className).toContain('border-emerald-200');
    expect(success?.className).not.toContain('animate-spring-in');
    expect(success?.getAttribute('role')).toBe('status');
    expect(container.querySelector('[data-testid="export-notice"]')).toBeNull();
  });

  it('does not race a verified reviewed package back into auto-repair before ZIP download', async () => {
    const onAutoRepairReadiness = vi.fn();
    await renderPanel({
      // This map intentionally retains a strict-readiness issue. The verified
      // export receipt must still freeze the package at download time.
      courseMapInput: courseMapWithObjectiveStem,
      preferPackageScope: true,
      onAutoRepairReadiness,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'blocked',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
          exportWarningCount: 0,
        },
        quality: {
          status: 'graded',
          score: 89,
          grade: 'B',
          findingCounts: { p0: 0, p1: 1, p2: 0 },
        },
      },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onAutoRepairReadiness).not.toHaveBeenCalled();

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Download ZIP');
    expect(zipButton?.disabled).toBe(false);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });
    expect(onAutoRepairReadiness).not.toHaveBeenCalled();
    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
  });

  it('downloads a ready package with a saved review note without rerunning the finalizer', async () => {
    const onAutoRepairReadiness = vi.fn();
    const onFinishPackage = vi.fn(async () => {
      throw new Error('finish should not rerun after a verified ready receipt');
    });
    await renderPanel({
      courseMapInput: courseMapWithObjectiveStem,
      preferPackageScope: true,
      canFinishPackage: true,
      onAutoRepairReadiness,
      onFinishPackage,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        // Saved review notes are honest package metadata, not evidence that
        // the already-verified physical export is unfinished.
        warnings: 1,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'ready',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
          exportWarningCount: 0,
        },
        quality: {
          status: 'graded',
          score: 99,
          grade: 'A',
          findingCounts: { p0: 0, p1: 0, p2: 1 },
        },
      },
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(onAutoRepairReadiness).not.toHaveBeenCalled();

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Download ZIP');
    expect(zipButton?.disabled).toBe(false);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
    });

    expect(onFinishPackage).not.toHaveBeenCalled();
    expect(onAutoRepairReadiness).not.toHaveBeenCalled();
    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
  });

  it('blocks ZIP download when the finish receipt records an export verification failure', async () => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      canFinishPackage: true,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        repairsApplied: 7,
        receipt: {
          finalStatus: 'blocked',
          exportStatus: 'failed',
          exportFailed: 1,
          exportFailures: [
            {
              featureId: 'quizBank',
              message: 'DOCX export exposes internal source grounding language.',
            },
          ],
        },
        quality: {
          status: 'not-graded',
        },
      },
    });

    const panel = container.querySelector('[data-testid="readiness-panel"]');
    expect(panel?.textContent).toContain('Prepare package');
    expect(panel?.className).toContain('sky');
    expect(panel?.className).not.toContain('red');
    expect(panel?.textContent).toContain('Quiz & Exam Bank: 1 export issue must be fixed before the ZIP is available.');

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Prepare package');
    expect(zipButton?.disabled).toBe(true);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('keeps blocker counts and quality reasons in Agent instead of the Export card', async () => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 1,
        blockerDomains: {
          schemaVersion: 1,
          readiness: 0,
          quality: 2,
          export: 0,
          total: 2,
        },
        warningDomains: {
          schemaVersion: 1,
          readiness: 0,
          retry: 0,
          export: 0,
          quality: 1,
          source: 0,
          total: 1,
        },
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'blocked',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
        },
        quality: {
          status: 'graded',
          findingCount: 3,
          findingCounts: { p0: 2, p1: 1, p2: 0 },
          findings: [
            { severity: 'P0', dimension: 'safety', detail: 'First blocker.' },
            { severity: 'P0', dimension: 'identity', detail: 'Second blocker.' },
            { severity: 'P1', dimension: 'format', detail: 'Advisory note.' },
          ],
        },
      },
    });

    const panelText = container.querySelector('[data-testid="readiness-panel"]')?.textContent || '';
    expect(panelText).toContain('Ready to download');
    expect(panelText).not.toContain('affected items');
    expect(panelText).not.toContain('items to refine');
    expect(panelText).not.toContain('First blocker');
    expect(panelText).not.toContain('Second blocker');
  });

  it('keeps a terminal quality finding honest while allowing a verified ZIP', async () => {
    const onFinishPackage = vi.fn(async () => {
      throw new Error('finish should not rerun for a terminal reviewed package');
    });

    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      onFinishPackage,
      canFinishPackage: true,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        repairsApplied: 0,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          exportWarningCount: 0,
          finalStatus: 'blocked',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
        },
        quality: {
          status: 'graded',
          score: 74,
          grade: 'C',
          findingCounts: { p0: 1, p1: 1, p2: 0 },
          findings: [
            {
              priority: 'P0',
              message: 'Prompt artifact labels used as lesson concepts.',
            },
          ],
          texture: { score: 92 },
        },
      },
    });

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(container.querySelector('[data-testid="readiness-panel"]')?.textContent).toContain('Ready to download');
    expect(zipButton?.textContent).toContain('Download ZIP');
    expect(container.textContent).not.toMatch(/draft zip/i);
    expect(zipButton?.disabled).toBe(false);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(onFinishPackage).not.toHaveBeenCalled();
    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
  });

  it('does not let verified export files override an unavailable package grade', async () => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        blockerDomains: {
          schemaVersion: 1,
          readiness: 0,
          quality: 1,
          export: 0,
          total: 1,
        },
        receipt: {
          finalStatus: 'blocked',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
        },
        quality: {
          status: 'not-graded',
          reason: 'quality grading timed out after 60000ms',
        },
      },
    });

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Prepare package');
    expect(zipButton?.disabled).toBe(true);
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('downloads a repeated-topic package after export verification and preserves blocked readiness', async () => {
    const repeatedCourseMap = {
      courseName: 'Genetics',
      lessons: [
        { ...cleanCourseMap.lessons[0], title: 'Lesson 1: DNA Structure' },
        { ...cleanCourseMap.lessons[0], title: 'Lesson 2: DNA Structure' },
      ],
    };
    await renderPanel({
      courseMapInput: repeatedCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        // Legacy v0.16.61-0.16.63 receipt: exportStatus was omitted even
        // though the verifier persisted its counters.
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'blocked',
          exportChecked: 38,
          exportFailed: 0,
        },
        quality: {
          status: 'graded',
          score: 89,
          grade: 'B',
          findingCounts: { p0: 0, p1: 2, p2: 1 },
        },
      },
    });

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Download ZIP');
    expect(zipButton?.disabled).toBe(false);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).toHaveBeenCalledTimes(1);
    const readiness = downloadCourseMaterialsZip.mock.calls[0][0].readiness;
    expect(readiness.status).toBe('blocked');
    expect(readiness.blockers.length).toBeGreaterThan(0);
  });

  it('updates the visible quality receipt to the score embedded in the downloaded ZIP', async () => {
    const onPackageQualityPassUpdate = vi.fn();
    downloadCourseMaterialsZip.mockResolvedValueOnce({
      fileName: 'Review Surface Course - Course Materials.zip',
      files: ['PACKAGE_MANIFEST.json', 'QUALITY_REPORT.md'],
      quality: {
        status: 'graded',
        score: 87,
        grade: 'B',
        findingCounts: { p0: 0, p1: 1, p2: 0 },
        readiness: { score: 52, maxScore: 100 },
      },
      qualityResult: {
        grades: { substance: 'B' },
        findings: [{ severity: 'P1', message: 'Review one source gap.' }],
        stats: { findingCount: 1, fileCount: 27 },
        texture: { score: 94 },
      },
      packageReadinessReceipt: {
        protocol: 'coursemapper-package-readiness-receipt-v2',
        exportVerification: { status: 'warnings', checked: 38, failed: 0, warningCount: 2 },
        downloadSafety: { status: 'verified', blockerCount: 0 },
      },
    });

    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      onPackageQualityPassUpdate,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: {
          finalizerRevision: CURRENT_FINALIZER_REVISION,
          finalStatus: 'ready',
          exportStatus: 'passed',
          exportChecked: 38,
          exportFailed: 0,
        },
        quality: { status: 'graded', score: 89, grade: 'B', readiness: { score: 56, maxScore: 100 } },
      },
    });

    await act(async () => {
      container
        .querySelector('[data-testid="export-download-zip"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await vi.runAllTimersAsync();
      await Promise.resolve();
    });

    expect(onPackageQualityPassUpdate).toHaveBeenCalledTimes(1);
    const updater = onPackageQualityPassUpdate.mock.calls[0][0];
    expect(
      updater({
        status: 'ready',
        receipt: { finalStatus: 'ready', exportWarningCount: 3 },
        warningDomains: { schemaVersion: 1, retry: 1 },
      }),
    ).toMatchObject({
      status: 'ready',
      warnings: 4,
      warningDomains: { schemaVersion: 1, retry: 1, export: 2, quality: 1, total: 4 },
      blockerDomains: { schemaVersion: 1, readiness: 0, quality: 0, export: 0, total: 0 },
      receipt: {
        finalStatus: 'ready',
        exportStatus: 'warnings',
        exportChecked: 38,
        exportFailed: 0,
        exportWarningCount: 2,
      },
      quality: {
        score: 87,
        readiness: { score: 52 },
        findings: [{ severity: 'P1' }],
        fileCount: 27,
      },
    });
  });
});
