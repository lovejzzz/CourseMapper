import { describe, expect, it } from 'vitest';
import {
  AGENT_SOURCE_CONTEXT_ROLE,
  buildAgentSourceContextMessage,
  formatAgentSourceContextForHistory,
  getAgentSourceContextSummary,
  isAgentSourceContextText,
} from '../agentSourceContext';

describe('agent source context', () => {
  it('builds a compact source context message from attached files', () => {
    const message = buildAgentSourceContextMessage([
      { name: 'syllabus.txt', text: 'Week 1 covers model validation and leakage checks.' },
      { name: 'dataset-card.md', text: 'Dataset card: target variable, missingness, and fairness notes.' },
    ]);

    expect(message).toMatchObject({
      role: AGENT_SOURCE_CONTEXT_ROLE,
      source: 'agent-attachment',
      label: 'Source added',
      meta: {
        fileCount: 2,
        fileNames: ['syllabus.txt', 'dataset-card.md'],
        materialNoteCount: 2,
      },
    });
    expect(message.materialNotes[0]).toMatchObject({
      name: 'syllabus.txt',
      excerpt: expect.stringContaining('model validation'),
    });
  });

  it('formats source context for future Agent turns without dumping full files', () => {
    const message = buildAgentSourceContextMessage([
      { name: 'long.txt', text: 'A'.repeat(600) },
      { name: 'rubric.txt', text: 'Rubric criteria for model-card evidence.' },
    ]);

    const historyText = formatAgentSourceContextForHistory(message);
    expect(historyText).toContain('[Source context added: 2 reference materials');
    expect(historyText).toContain('files: long.txt, rubric.txt');
    expect(historyText).toContain('long.txt:');
    expect(historyText.length).toBeLessThan(900);
    expect(isAgentSourceContextText(historyText)).toBe(true);
  });

  it('summarizes hidden file counts for display', () => {
    const message = buildAgentSourceContextMessage(
      Array.from({ length: 10 }, (_, index) => ({
        name: `file-${index + 1}.txt`,
        text: `Source note ${index + 1}`,
      })),
      { maxFileNames: 3, maxNotes: 2 },
    );

    expect(getAgentSourceContextSummary(message)).toMatchObject({
      fileCount: 10,
      fileNames: ['file-1.txt', 'file-2.txt', 'file-3.txt'],
      hiddenFileCount: 7,
      materialNoteCount: 2,
    });
  });
});
