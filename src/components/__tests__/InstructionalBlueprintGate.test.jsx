/**
 * @vitest-environment happy-dom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import InstructionalBlueprintGate from '../InstructionalBlueprintGate.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const review = {
  status: 'awaiting-approval',
  canApprove: true,
  course: {
    title: 'Data Decisions',
    lessonCount: 2,
    throughlineConcepts: ['evidence', 'interpretation'],
    culminatingEvidence: 'A defensible data memo',
  },
  researchRequiredCount: 1,
  questions: [
    {
      id: 'lesson-2-source',
      lessonId: 'lesson-2',
      prompt: 'Which source should govern factual teaching in Comparing distributions?',
    },
  ],
  assumptions: [{ lessonId: 'lesson-2', signal: 'assessment' }],
  lessonIntents: [
    {
      id: 'lesson-1',
      lessonNumber: 1,
      title: 'Lesson 1: Describing distributions',
      learnerAction: 'Calculate center and spread and justify one interpretation.',
      focusConcepts: ['center', 'spread'],
      expectedEvidence: {
        artifact: 'Distribution analysis',
        evidenceRequirement: 'Show the calculation and interpretation.',
        successCriteria: ['Correct statistic', 'Bounded interpretation'],
      },
      evidence: { status: 'admitted', publicationBoundary: 'Use only the admitted operation specimen.' },
    },
    {
      id: 'lesson-2',
      lessonNumber: 2,
      title: 'Lesson 2: Comparing distributions',
      learnerAction: 'Compare two distributions and defend the conclusion.',
      focusConcepts: ['comparison'],
      expectedEvidence: {
        artifact: 'Comparison memo',
        evidenceRequirement: 'Cite the deciding evidence.',
        successCriteria: ['Visible evidence', 'Qualified conclusion'],
      },
      evidence: { status: 'research-required', publicationBoundary: 'Admit a source before factual drafting.' },
    },
  ],
  claimBoundary: 'This review authorizes the instructional direction only.',
};

describe('InstructionalBlueprintGate', () => {
  it('renders a compact plan, evidence status, and honest claim boundary', () => {
    const html = renderToStaticMarkup(<InstructionalBlueprintGate review={review} />);

    expect(html).toContain('Review the course plan');
    expect(html).toContain('Course plan ready');
    expect(html).toContain('Needs your attention');
    expect(html).toContain('Brief');
    expect(html).toContain('Materials');
    expect(html).toContain('Review');
    expect(html).toContain('Generate');
    expect(html).toContain('2 lessons');
    expect(html).toContain('1 lesson will receive source research');
    expect(html).toContain('Describing distributions');
    expect(html).toContain('Confirmed');
    expect(html).toContain('Inferred');
    expect(html).toContain('A defensible data memo');
    expect(html).toContain('instructional direction only');
  });

  it('exposes separate edit and approval actions', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onApprove = vi.fn();
    const onEditMap = vi.fn();

    await act(async () => {
      root.render(<InstructionalBlueprintGate review={review} onApprove={onApprove} onEditMap={onEditMap} />);
    });

    const buttons = [...container.querySelectorAll('button')];
    const editButton = buttons.find((button) => button.textContent === 'Edit Course Map');
    const approveButton = buttons.find((button) => button.textContent === 'Approve plan and generate');
    expect(editButton).toBeTruthy();
    expect(approveButton).toBeTruthy();

    await act(async () => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      approveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onEditMap).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('disables approval while the next stage is starting', () => {
    const html = renderToStaticMarkup(<InstructionalBlueprintGate review={review} busy />);
    expect(html).toContain('Starting generation…');
    expect(html).toMatch(/disabled=""/);
  });
});
