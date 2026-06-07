/**
 * @vitest-environment happy-dom
 */
import React, { useEffect, useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportSidePanel from '../ExportSidePanel.jsx';
import { CourseProvider, useCourse } from '../../contexts/CourseContext.jsx';

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

function ExportPanelHarness({
  isPackageGenerationRunning = false,
  onAutoRepairReadiness = vi.fn(),
  preferPackageScope = false,
}) {
  const { courseMap, setCourseMap, setSelectedFeatures, setColumns } = useCourse();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCourseMap(courseMapWithObjectiveStem);
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
  }, [setColumns, setCourseMap, setSelectedFeatures]);

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
      onFinishPackage={vi.fn()}
      canFinishPackage={false}
      packageQualityPass={{ status: 'idle', message: '' }}
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
    expect(container.textContent).toContain('Finishing package');
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
});
