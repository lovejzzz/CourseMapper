/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import LessonScopeSelector from '../src/components/config/LessonScopeSelector.jsx';

function renderSelector({ courseMap = null } = {}) {
  return renderToStaticMarkup(
    <LessonScopeSelector
      lessonCount={3}
      isDetectingLessons={false}
      courseMap={courseMap}
      lessonScope={{ type: 'specific', indices: [0] }}
      setLessonScope={() => {}}
    />,
  );
}

describe('LessonScopeSelector provisional lesson slots', () => {
  it('explains numbered slots before Scion has created the course map', () => {
    const html = renderSelector();
    expect(html).toContain('data-testid="provisional-lesson-scope-note"');
    expect(html).toContain('Lesson topics are assigned when Scion creates the course map.');
    expect(html).toContain('Choose numbered slots now');
  });

  it('removes the provisional note once real lesson titles exist', () => {
    const html = renderSelector({
      courseMap: {
        lessons: [{ title: 'Supply and demand' }, { title: 'Elasticity' }, { title: 'Market structures' }],
      },
    });
    expect(html).not.toContain('provisional-lesson-scope-note');
    expect(html).toContain('Supply and demand');
  });
});
