import { describe, expect, it } from 'vitest';
import {
  buildLandingAgentContextMessages,
  ensureLandingAgentContextMessages,
  getLandingMaterialNotes,
  getLandingFileNames,
  hasLandingAgentContext,
  isLandingAgentContextText,
  LANDING_AGENT_CONTEXT_SOURCE,
  summarizeLandingAgentContext,
  upsertLandingAgentContextMessages,
} from '../landingAgentContext';

describe('landing agent context', () => {
  it('formats the landing prompt and uploaded file names as a visible chat turn', () => {
    const messages = buildLandingAgentContextMessages({
      promptText: 'Build an 8-week applied machine learning lab.',
      files: [{ name: 'syllabus.pdf' }, { name: 'datasets.zip' }],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', source: LANDING_AGENT_CONTEXT_SOURCE });
    expect(messages[0].meta).toMatchObject({
      source: LANDING_AGENT_CONTEXT_SOURCE,
      hasPrompt: true,
      fileCount: 2,
      fileNames: ['syllabus.pdf', 'datasets.zip'],
    });
    expect(messages[0].text).toContain('Here is what I am starting with.');
    expect(messages[0].text).toContain('Starting request:');
    expect(messages[0].text).toContain('Build an 8-week applied machine learning lab.');
    expect(messages[0].text).toContain('- syllabus.pdf');
    expect(messages[0].text).toContain('- datasets.zip');
    expect(messages[1]).toMatchObject({ role: 'assistant', source: LANDING_AGENT_CONTEXT_SOURCE });
    expect(messages[1].text).toContain('starting request');
    expect(messages[1].text).toContain('2 uploaded materials');
  });

  it('supports file-only starts without inventing a prompt', () => {
    const messages = buildLandingAgentContextMessages({
      files: [{ name: 'course-outline.docx' }],
    });

    expect(messages[0].text).toContain('Here is what I am starting with.');
    expect(messages[0].text).toContain('I uploaded course materials to start this project.');
    expect(messages[0].text).toContain('- course-outline.docx');
  });

  it('adds compact source notes from parsed uploaded materials', () => {
    const messages = buildLandingAgentContextMessages({
      promptText: 'Build an applied ML lab.',
      files: [{ name: 'starter-notebook-outline.txt' }],
      parsedFiles: [
        {
          name: 'starter-notebook-outline.txt',
          text: 'Week 1 notebook: validation split and leakage checks.\nWeek 2 notebook: model card review.',
        },
      ],
    });

    expect(messages[0].meta).toMatchObject({
      materialNoteCount: 1,
      materialNoteFileNames: ['starter-notebook-outline.txt'],
    });
    expect(messages[0].materialNotes).toEqual([
      {
        name: 'starter-notebook-outline.txt',
        excerpt: 'Week 1 notebook: validation split and leakage checks. Week 2 notebook: model card review.',
      },
    ]);
    expect(messages[0].text).toContain('Source notes from uploaded materials:');
    expect(messages[0].text).toContain('starter-notebook-outline.txt: Week 1 notebook');
    expect(messages[1].text).toContain('1 compact source note');
    expect(summarizeLandingAgentContext(messages)).toMatchObject({
      hasMaterialNotes: true,
      materialNoteCount: 1,
      promptExcerpt: 'Build an applied ML lab.',
      materialNotes: [
        {
          name: 'starter-notebook-outline.txt',
          excerpt: 'Week 1 notebook: validation split and leakage checks. Week 2 notebook: model card review.',
        },
      ],
    });
  });

  it('extracts bounded material notes without keeping empty parsed files', () => {
    const notes = getLandingMaterialNotes(
      [
        { name: 'empty.txt', text: '' },
        { name: 'syllabus.txt', text: 'A'.repeat(100) },
        { name: 'syllabus.txt', text: 'duplicate should not appear' },
        { name: 'rubric.txt', text: 'Rubric criteria.' },
      ],
      { maxNotes: 2, maxChars: 20 },
    );

    expect(notes).toEqual([
      { name: 'syllabus.txt', excerpt: 'AAAAAAAAAAAAAAAAA...' },
      { name: 'rubric.txt', excerpt: 'Rubric criteria.' },
    ]);
  });

  it('detects landing context text after metadata is stripped', () => {
    expect(isLandingAgentContextText('Here is what I am starting with.\n\nStarting request:\nA course.')).toBe(true);
    expect(isLandingAgentContextText('I uploaded course materials to start this project.\n- syllabus.pdf')).toBe(true);
    expect(isLandingAgentContextText('Make Lesson 1 shorter.')).toBe(false);
  });

  it('deduplicates and limits file names', () => {
    const names = getLandingFileNames([{ name: 'a.pdf' }, { name: 'a.pdf' }, { name: '  ' }, 'b.docx', null]);

    expect(names).toEqual(['a.pdf', 'b.docx']);

    const messages = buildLandingAgentContextMessages({
      files: Array.from({ length: 10 }, (_, index) => ({ name: `file-${index + 1}.pdf` })),
      maxFileNames: 3,
    });

    expect(messages[0].text).toContain('- file-1.pdf');
    expect(messages[0].text).toContain('- file-3.pdf');
    expect(messages[0].text).toContain('- +7 more files');
    expect(messages[0].text).not.toContain('- file-4.pdf');
  });

  it('shortens long prompts before putting them in chat history', () => {
    const messages = buildLandingAgentContextMessages({
      promptText: 'a'.repeat(80),
      maxPromptChars: 40,
    });

    expect(messages[0].text.length).toBeLessThan(140);
    expect(messages[0].text).toContain('[Prompt shortened for chat]');
  });

  it('prepends context once and preserves existing messages', () => {
    const existing = [{ role: 'user', text: 'Make Lesson 1 shorter.' }];
    const withContext = ensureLandingAgentContextMessages(existing, { promptText: 'A 12-week policy course.' });
    const secondPass = ensureLandingAgentContextMessages(withContext, { promptText: 'A 12-week policy course.' });

    expect(withContext).toHaveLength(3);
    expect(withContext[0].source).toBe(LANDING_AGENT_CONTEXT_SOURCE);
    expect(withContext[2]).toEqual(existing[0]);
    expect(secondPass).toBe(withContext);
    expect(hasLandingAgentContext(secondPass)).toBe(true);
  });

  it('replaces earlier name-only context after uploaded files are parsed', () => {
    const existing = [{ role: 'user', text: 'Make Lesson 1 shorter.' }];
    const nameOnly = ensureLandingAgentContextMessages(existing, {
      promptText: 'A 12-week policy course.',
      files: [{ name: 'syllabus.txt' }],
    });
    const withNotes = upsertLandingAgentContextMessages(nameOnly, {
      promptText: 'A 12-week policy course.',
      files: [{ name: 'syllabus.txt' }],
      parsedFiles: [{ name: 'syllabus.txt', text: 'Week 1 covers eligibility and benefit cliffs.' }],
    });

    expect(withNotes).toHaveLength(3);
    expect(withNotes[0].text).toContain('Source notes from uploaded materials:');
    expect(withNotes[0].text).toContain('benefit cliffs');
    expect(withNotes[2]).toEqual(existing[0]);
  });

  it('summarizes structured landing context for adaptive agent copy', () => {
    const messages = buildLandingAgentContextMessages({
      promptText: 'A lab course.',
      files: [{ name: 'notebook.ipynb' }, { name: 'dataset.csv' }],
    });

    expect(summarizeLandingAgentContext(messages)).toMatchObject({
      hasContext: true,
      hasPrompt: true,
      fileCount: 2,
      fileNames: ['notebook.ipynb', 'dataset.csv'],
      promptExcerpt: 'A lab course.',
    });
  });

  it('recovers material notes from persisted text when structured notes are unavailable', () => {
    const summary = summarizeLandingAgentContext([
      {
        role: 'user',
        text: [
          'Here is what I am starting with.',
          '',
          'Starting request:',
          'Build a course from uploaded source files.',
          '',
          'Uploaded materials:',
          '- syllabus.pdf',
          '',
          'Source notes from uploaded materials:',
          '- syllabus.pdf: Week 1 covers policy foundations.',
        ].join('\n'),
      },
    ]);

    expect(summary).toMatchObject({
      hasContext: true,
      hasPrompt: true,
      promptExcerpt: 'Build a course from uploaded source files.',
      fileCount: 1,
      fileNames: ['syllabus.pdf'],
      materialNoteCount: 1,
      materialNotes: [{ name: 'syllabus.pdf', excerpt: 'Week 1 covers policy foundations.' }],
    });
  });
});
