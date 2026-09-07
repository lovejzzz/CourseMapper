import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StudyGuidesView from '../StudyGuidesView.jsx';

describe('study guide terms and practice presentation', () => {
  it.each([false, true])('renders editable term examples for old and reviewed guides (reviewed: %s)', (reviewed) => {
    const guide = {
      lessonTitle: 'Workshop',
      ...(reviewed ? { teachingGuideVersion: 1, language: 'zh' } : {}),
      keyTerms: [{ term: '分母', definition: '指定整体的计数。', example: '已检查的 80 台设备。' }],
      reviewQuestions: [{ question: '说明分母。', answer: '限定已检查群体。', practiceKind: 'independent-transfer' }],
    };
    const html = renderToStaticMarkup(<StudyGuidesView data={{ guides: [guide] }} onEdit={() => {}} />);
    expect(html).toContain('已检查的 80 台设备。');
    expect(html).toContain(reviewed ? '例子' : 'Ex:');
    expect(html).toContain(reviewed ? '独立练习' : 'Check your answer');
    expect(html).toMatch(/<details\s+class=/);
    expect(html).not.toMatch(/<details[^>]*\sopen[\s=>]/);
  });
});
