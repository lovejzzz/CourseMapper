/**
 * @vitest-environment happy-dom
 */
import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CourseProvider, useCourse } from '../CourseContext.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ onValue }) {
  const value = useCourse();
  useEffect(() => {
    onValue(value);
  }, [onValue, value]);
  return null;
}

describe('CourseContext fresh-project boundary', () => {
  let container;
  let root;
  let course;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <CourseProvider>
          <Harness onValue={(value) => (course = value)} />
        </CourseProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the new brief and files while discarding every generated project field', async () => {
    const file = { name: 'new-ux-brief.pdf', size: 42 };
    await act(async () => {
      course.setPromptText('Build a new UX research course.');
      course.setFiles([file]);
      course.setSelectedFeatures(['courseMap', 'lessonPlans']);
      course.setDeliverableConfig({ lessonPlans: { depth: 'deep' } });
      course.setLessonScope({ type: 'specific', indices: [2] });
      course.setColumns([{ key: 'stale-column', label: 'Stale' }]);
      course.setCourseMap({ courseName: 'Old Python Course', lessons: [{ title: 'Loops' }] });
      course.setOldCourseMap({ courseName: 'Older Course', lessons: [] });
      course.setUserEdits([{ key: 'old-edit' }]);
      course.setHasGenerated(true);
      course.setSlideTheme(4);
    });

    await act(async () => course.resetGeneratedProjectState());

    expect(course.promptText).toBe('Build a new UX research course.');
    expect(course.files).toEqual([file]);
    expect(course.selectedFeatures).toEqual(['courseMap']);
    expect(course.deliverableConfig).toEqual({});
    expect(course.lessonScope).toEqual({ type: 'all' });
    expect(course.columns.some((column) => column.key === 'stale-column')).toBe(false);
    expect(course.courseMap).toBeNull();
    expect(course.oldCourseMap).toBeNull();
    expect(course.userEdits).toEqual([]);
    expect(course.hasGenerated).toBe(false);
    expect(course.slideTheme).toBeNull();
  });
});
