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

  it('uses a neutral information state when a downloadable package has quality and export caveats', async () => {
    await renderPanel({
      courseMapInput: cleanCourseMap,
      preferPackageScope: true,
      packageQualityPass: {
        status: 'ready',
        blockers: 0,
        warnings: 0,
        repairsApplied: 0,
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
    expect(panel?.textContent).not.toContain('1 export warning');
    expect(panel?.textContent).not.toContain('3 P1 · 1 P2');
    expect(panel?.textContent).not.toContain('PPTX export generated');
    const qualityStamp = container.querySelector('[data-testid="quality-stamp"]');
    expect(qualityStamp?.textContent).toContain('96 · A');
    expect(qualityStamp?.className).toContain('sky');
    expect(qualityStamp?.className).not.toContain('amber');
    expect(container.querySelector('[data-testid="export-download-zip"]')?.disabled).toBe(false);
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
    expect(panel?.textContent).toContain('1 blocker');
    expect(panel?.textContent).toContain('Quiz & Exam Bank: 1 export issue must be fixed before the ZIP is available.');

    const zipButton = container.querySelector('[data-testid="export-download-zip"]');
    expect(zipButton?.textContent).toContain('Needs attention');
    expect(zipButton?.disabled).toBe(true);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });

  it('keeps a terminal quality blocker honest in both the card and ZIP action', async () => {
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
    expect(zipButton?.textContent).toContain('Needs attention');
    expect(zipButton?.disabled).toBe(true);

    await act(async () => {
      zipButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {});

    expect(onFinishPackage).not.toHaveBeenCalled();
    expect(downloadCourseMaterialsZip).not.toHaveBeenCalled();
  });
});
