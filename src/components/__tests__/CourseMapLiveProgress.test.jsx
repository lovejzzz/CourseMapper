/** @vitest-environment happy-dom */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CourseMapLiveProgress from '../CourseMapLiveProgress.jsx';
import {
  startCourseMapActivity,
  receiveCourseMapText,
  receiveCourseMapActivityEvent,
} from '../../lib/courseMapActivity.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T20:00:00Z'));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});
function render(activity, props = {}) {
  act(() => root.render(<CourseMapLiveProgress activity={activity} {...props} />));
}
it('shows elapsed time and a delayed update without inventing a completion percentage', () => {
  render(startCourseMapActivity(12));
  expect(container.querySelector('[role="progressbar"]').hasAttribute('aria-valuenow')).toBe(false);
  act(() => vi.advanceTimersByTime(31000));
  expect(container.textContent).toContain('31s elapsed');
  expect(container.textContent).toContain('No new update for 31s');
  act(() => vi.advanceTimersByTime(60000));
  expect(container.textContent).toContain('1m 31s elapsed');
  expect(container.textContent).toContain('This step is taking longer');
});
it('uses arriving native session titles as provisional feedback and clears a delay when text resumes', () => {
  const start = startCourseMapActivity(12);
  render(start);
  act(() => vi.advanceTimersByTime(40000));
  const activity = receiveCourseMapText(start, '{"sessions":[{"title":"HTML foundations"', {
    sessions: [{ order: 1, title: 'HTML foundations' }],
  });
  render(activity);
  expect(container.textContent).toContain('1 of 12 lesson titles received');
  expect(container.textContent).toContain('HTML foundations');
  expect(container.textContent).toContain('Preview only');
  expect(container.textContent).not.toContain('No new update');
  expect(container.querySelector('[aria-current="step"]').textContent).toContain('Write outline');
});
it('clears rejected previews on retry, reports the next attempt, and transitions to checks', () => {
  let activity = receiveCourseMapText(startCourseMapActivity(12), 'draft', { sessions: [{ title: 'Rejected draft' }] });
  activity = receiveCourseMapActivityEvent(activity, { type: 'streamRetryCall', task: 'nativeSkeleton' });
  render(activity);
  expect(container.textContent).toContain('Retrying automatically');
  expect(container.textContent).not.toContain('Rejected draft');
  activity = receiveCourseMapActivityEvent(activity, {
    type: 'providerRequestStart',
    task: 'nativeSkeleton',
    attempt: 2,
  });
  render(activity);
  expect(container.textContent).toContain('Attempt 2');
  render(receiveCourseMapActivityEvent(activity, { type: 'providerResponseDone', task: 'nativeSkeleton' }));
  expect(container.querySelector('[aria-current="step"]').textContent).toContain('Check outline');
});
it('reports actual model setup and ignores unrelated material requests', () => {
  const start = startCourseMapActivity(12);
  const downloading = receiveCourseMapActivityEvent(start, {
    type: 'localModelProgress',
    task: 'nativeSkeleton',
    label: 'Downloading AI',
    progress: 0.4,
  });
  render(downloading);
  expect(container.textContent).toContain('Downloading AI');
  expect(receiveCourseMapActivityEvent(downloading, { type: 'providerResponseDone', task: 'quizBank' })).toBe(
    downloading,
  );
});
it('throttles token rendering and leaves stop immediately usable', () => {
  const start = startCourseMapActivity(12);
  const first = receiveCourseMapText(start, 'first', null);
  expect(receiveCourseMapText(first, 'first second', null, Date.now() + 100)).toBe(first);
  expect(receiveCourseMapText(first, 'first second', null, Date.now() + 1100)).not.toBe(first);
  const stop = vi.fn();
  render(first, { onStop: stop });
  act(() => container.querySelector('button').click());
  expect(stop).toHaveBeenCalledOnce();
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  root = createRoot(container);
});
