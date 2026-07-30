/**
 * @vitest-environment happy-dom
 */
import React, { useEffect, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportSidePanel from '../ExportSidePanel.jsx';
import { CourseProvider, useCourse } from '../../contexts/CourseContext.jsx';
import { downloadCourseMaterialsZip } from '../../lib/packageZipExporter.js';

vi.mock('../../lib/packageZipExporter.js', () => ({
  downloadCourseMaterialsZip: vi.fn(async () => ({
    fileName: 'Review Surface Course - Course Materials.zip',
    files: ['PACKAGE_MANIFEST.json', 'QUALITY_REPORT.md'],
  })),
}));

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

function ExportPanelHarness({
  isPackageGenerationRunning = false,
  onAutoRepairReadiness = vi.fn(),
  onFinishPackage = vi.fn(),
  canFinishPackage = false,
  preferPackageScope = false,
  courseMapInput = courseMapWithObjectiveStem,
  packageQualityPass = { status: 'idle', message: '' },
  onPackageQualityPassUpdate = null,
}) {
  const { courseMap, setCourseMap, setSelectedFeatures, setColumns } = useCourse();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCourseMap(courseMapInput);
    setSelectedFeatures(['courseMap']);
    setColumns([
      { key: 'learningGoals', label: 'Learning Goals', enabled: true },
      { key: 'topicSection', label: 'Topic', enabled: true },
      { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
      { key: 'weeklyAssessments', label: 'Assessments', enabled: true },
      { key: 'asyncActivities', label: 'Async Activities', enabled: true },
      { key: 'syncActivities', label: 'Sync Activities', enabled: true },
    ]);
    setReady(true);
  }, [courseMapInput, setColumns, setCourseMap, setSelectedFeatures]);

  if (!ready || !courseMap) return null;

  return (
    <ExportSidePanel
      activeTab="courseMap"
      activeTabLabel="Course Map"
      deliverables={{}}
      onCourseMapExport={vi.fn()}
      onSaveProject={vi.fn()}
      onReadinessIssueClick={vi.fn()}
      onAutoRepairReadiness={onAutoRepairReadiness}
      onFinishPackage={onFinishPackage}
      canFinishPackage={canFinishPackage}
      packageQualityPass={packageQualityPass}
      onPackageQualityPassUpdate={onPackageQualityPassUpdate}
      isPackageGenerationRunning={isPackageGenerationRunning}
      preferPackageScope={preferPackageScope}
    />
  );
}

describe('ExportSidePanel readiness repair timing', () => {
  let container;
  let root;

  beforeEach(() => {
    vi.useFakeTimers();
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

  it('names download formats for people while retaining the exact extensions', async () => {
    await renderPanel({ courseMapInput: cleanCourseMap });

    expect(container.querySelector('[data-testid="export-format-xlsx"]')?.textContent).toContain('Excel (.xlsx)');
    expect(container.querySelector('[data-testid="export-format-docx"]')?.textContent).toContain('Word (.docx)');
    expect(container.querySelector('[data-testid="export-format-pdf"]')?.textContent).toContain('PDF (.pdf)');
    expect(container.querySelector('[data-testid="export-format-csv"]')?.textContent).toContain('CSV (.csv)');
  });

  it('uses a neutral information state when a downloadable package has quality and export caveats', async () => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        repairsApplied: 2,
        receipt: {
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
    expect(panel?.textContent).toContain('Review notes in Agent');
    expect(panel?.className).toContain('sky');
    expect(panel?.textContent).not.toContain('Download available');
    expect(panel?.textContent).not.toContain('Download is ready. Review notes are saved');
    expect(panel?.textContent).not.toContain('Show notes');
    expect(panel?.textContent).not.toContain('4 quality issues');
    expect(panel?.textContent).toContain('2 safe repairs applied · 1 export warning');
    expect(panel?.textContent).not.toContain('3 P1 · 1 P2');
    expect(panel?.textContent).not.toContain('PPTX export generated');
    expect(container.querySelector('[data-testid="export-panel-title"]')?.textContent).toBe('Export package');
    const qualityStamp = container.querySelector('[data-testid="quality-stamp"]');
    expect(qualityStamp?.textContent).toContain('61/100');
    expect(qualityStamp?.className).toContain('sky');
    expect(qualityStamp?.className).not.toContain('amber');
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
        receipt: { exportWarningCount: 0 },
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
    });

    await act(async () => {
      container
        .querySelector('[data-testid="quality-stamp"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const modal = document.body.querySelector('[data-testid="quality-report-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.parentElement).toBe(document.body);
    expect(container.querySelector('[data-testid="quality-report-modal"]')).toBeNull();
    expect(modal?.textContent).toContain('Automated readiness — 61/100');
    expect(modal?.textContent).toContain('Package conformance 96/100 (A)');
    expect(modal?.textContent).toContain('Scores from 70–100 require');
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
        receipt: { exportWarningCount: 0 },
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
    expect(panel?.textContent).toContain('Finish package');
    expect(panel?.textContent).toContain('1 item to refine');
    expect(panel?.textContent).toContain('Quiz & Exam Bank: 1 export issue must be fixed before the ZIP is available.');

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Refine package');
    expect(zipButton?.disabled).toBe(true);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('keeps a terminal quality finding honest while allowing a verified ZIP', async () => {
    const onFinishPackage = vi.fn(async () => {
      throw new Error('finish should not rerun for a terminal reviewed package');
    });

    await renderPanel({
      courseMapInput: cleanCourseMap,
      onFinishPackage,
      canFinishPackage: true,
      packageQualityPass: {
        status: 'blocked',
        blockers: 1,
        warnings: 0,
        repairsApplied: 0,
        receipt: {
          exportWarningCount: 0,
          finalStatus: 'blocked',
          exportStatus: 'passed',
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

    await act(async () => {
      container
        .querySelector('[data-testid="export-scope-all"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(container.querySelector('[data-testid="readiness-panel"]')?.textContent).toContain('Finish package');
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
        receipt: { finalStatus: 'blocked', exportChecked: 38, exportFailed: 0 },
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
    });

    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      onPackageQualityPassUpdate,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        receipt: { finalStatus: 'ready', exportStatus: 'passed', exportChecked: 38, exportFailed: 0 },
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
    expect(updater({ status: 'ready', receipt: { finalStatus: 'ready' } })).toMatchObject({
      status: 'ready',
      receipt: { finalStatus: 'ready' },
      quality: {
        score: 87,
        readiness: { score: 52 },
        findings: [{ severity: 'P1' }],
        fileCount: 27,
      },
    });
  });
});
