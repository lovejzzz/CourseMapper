/**
 * Tests for buildAgentChatHistory and generateDiffPreview pure logic.
 * Re-implements the functions since they live inside the useChatRouter hook.
 */
import { describe, it, expect } from 'vitest';
import { formatPackageSummaryForHistory } from '../packageFinalizerSummary';

// ─── Re-implement getArrayKey (from syncDependencies) ────────────────────────

function getArrayKey(featureId, parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const KNOWN_KEYS = {
    lessonPlans: 'lessonPlans',
    slideDecks: 'slideDecks',
    rubrics: 'rubrics',
    quizBank: 'quizzes',
    discussions: 'discussions',
    assignments: 'assignments',
    studyGuides: 'studyGuides',
    courseFaq: 'faqs',
  };
  const ALIASES = {
    slideDecks: ['decks', 'slides'],
    lessonPlans: ['plans', 'lessons'],
    studyGuides: ['guides'],
    courseFaq: ['faq', 'courseFAQ'],
  };
  const known = KNOWN_KEYS[featureId];
  if (known && parsed[known]) return known;
  const aliases = ALIASES[featureId];
  if (aliases) {
    for (const alias of aliases) {
      if (parsed[alias]) return alias;
    }
  }
  // Fallback: first array key
  const arrKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
  return arrKey || null;
}

function resolveLabel(featureId) {
  if (featureId === 'quizBank') return 'Quiz & Exam Bank';
  if (featureId === 'rubrics') return 'Rubrics';
  if (featureId === 'custom_peerReview') return 'Peer Review';
  return featureId;
}

// ─── Re-implement buildAgentChatHistory ──────────────────────────────────────

function buildAgentChatHistory(messages) {
  const history = [];

  for (const m of messages) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.text || m.content || '' });
    } else if (m.role === 'assistant') {
      const text = m.text || m.content || '';
      if (text) history.push({ role: 'assistant', content: text });
    } else if (m.role === 'proposal') {
      const options = m.proposal?.options || [];
      const isLastProposal = messages.findLastIndex((x) => x.role === 'proposal') === messages.indexOf(m);

      if (isLastProposal && m.status === 'pending') {
        const optionDetails = options
          .map((o) => {
            const itemJson = o.action?.item ? JSON.stringify(o.action.item) : '';
            return `${o.label}. "${o.title}" (${o.description || ''}) → ${o.action?.type} on ${o.action?.featureId || 'unknown'}${itemJson ? ` | item: ${itemJson}` : ''}`;
          })
          .join('\n');
        history.push({
          role: 'assistant',
          content: `[PROPOSAL (pending — user has not selected yet):\n${optionDetails}\n]`,
        });
      } else if (m.status === 'selected') {
        const chosen = options.find((o) => o.label === m.selectedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed options. User selected ${m.selectedLabel}: "${chosen?.title || '?'}". Applied successfully.]`,
        });
      } else if (m.status === 'failed') {
        const failedOpt = options.find((o) => o.label === m.failedLabel);
        history.push({
          role: 'assistant',
          content: `[I proposed options. User tried ${m.failedLabel}: "${failedOpt?.title || '?'}" but FAILED: ${m.failedMessage || 'unknown error'}. Other options still available.]`,
        });
      } else if (m.status === 'dismissed') {
        const optionSummary = options.map((o) => `${o.label}. "${o.title}" (${o.description || ''})`).join('; ');
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionSummary}. User dismissed and asked for changes.]`,
        });
      } else {
        const optionList = options.map((o) => `${o.label}. "${o.title}" → ${o.action?.type}`).join('; ');
        history.push({
          role: 'assistant',
          content: `[I proposed: ${optionList}. Awaiting user selection.]`,
        });
      }
    } else if (m.role === 'research') {
      const query = m.research?.query || 'unknown';
      const count = m.research?.results?.reduce((sum, g) => sum + (g.items?.length || 0), 0) || 0;
      history.push({
        role: 'assistant',
        content: `[I searched for "${query}" and found ${count} results from academic sources.]`,
      });
    } else if (m.role === 'validation') {
      const r = m.report;
      if (r) {
        history.push({
          role: 'assistant',
          content: `[Course health: ${r.errorCount} errors, ${r.warningCount} warnings. ${r.findings
            .slice(0, 3)
            .map((f) => f.message)
            .join('; ')}]`,
        });
      }
    } else if (m.role === 'changeSummary') {
      const s = m.summary;
      const desc = (s?.changes || [])
        .map((c) => `${c.type} ${c.count} in ${resolveLabel(c.featureId)}${c.label ? ` (${c.label})` : ''}`)
        .join(', ');
      history.push({ role: 'assistant', content: `[Applied changes: ${desc}]` });
    } else if (m.role === 'packageSummary') {
      history.push({ role: 'assistant', content: formatPackageSummaryForHistory(m.summary) });
    } else if (m.role === 'diagram') {
      history.push({ role: 'assistant', content: `[Generated diagram: ${m.diagram?.title || 'concept diagram'}]` });
    } else if (m.role === 'chart') {
      history.push({ role: 'assistant', content: `[Generated chart: ${m.chart?.title || 'data visualization'}]` });
    } else if (m.role === 'imageSearch') {
      history.push({ role: 'assistant', content: `[Image search: ${m.imageSearch?.query || 'images'}]` });
    } else if (m.role === 'syncSuggestion') {
      const featureNames = (m.plan || []).map((p) => resolveLabel(p.featureId)).join(', ');
      const statusText = m.status === 'done' ? 'synced' : m.status === 'skipped' ? 'skipped' : 'pending';
      history.push({ role: 'assistant', content: `[Sync suggestion: ${featureNames} — ${statusText}]` });
    } else if (m.role === 'agentProgress') {
      const steps = m.steps || [];
      if (steps.length > 0) {
        const stepSummary = steps.map((s) => `${s.tool}: ${s.summary || 'done'}`).join(', ');
        history.push({
          role: 'assistant',
          content: `[Agent used ${steps.length} tool${steps.length !== 1 ? 's' : ''}: ${stepSummary}]`,
        });
      }
    } else if (m.role === 'error') {
      history.push({ role: 'assistant', content: `[Error: ${m.text || 'unknown error'}]` });
    }
  }

  // Smart trimming: keep the most valuable messages for context.
  const MAX_MESSAGES = 20;
  const MAX_CHARS = 12000;

  if (history.length <= MAX_MESSAGES) return history;

  const scored = history.map((m, i) => {
    let score = 0;
    if (m.role === 'user') score += 5;
    else if (m.role === 'assistant' && m.content?.length > 50) score += 3;
    else score += 1;
    if (m.role === 'user' && i === history.findIndex((h) => h.role === 'user')) score += 4;
    if (i >= history.length - 6) score += 4;
    if (m.content?.startsWith('[PROPOSAL')) score += 2;
    if (m.content?.includes('FAILED') || m.content?.includes('Error')) score += 2;
    return { ...m, _idx: i, _score: score };
  });

  const sorted = [...scored].sort((a, b) => b._score - a._score);
  const kept = new Set(sorted.slice(0, MAX_MESSAGES).map((m) => m._idx));

  const result = [];
  let chars = 0;
  for (let i = 0; i < history.length; i++) {
    if (!kept.has(i)) continue;
    const len = (history[i].content || '').length;
    if (chars + len > MAX_CHARS && result.length >= 6) break;
    result.push(history[i]);
    chars += len;
  }
  return result;
}

// ─── Re-implement generateDiffPreview ────────────────────────────────────────

function generateDiffPreview(action, courseMap, deliverables) {
  const preview = {};
  const type = action?.type;
  try {
    if (type === 'editCell') {
      const lesson = courseMap?.lessons?.[action.lessonIndex];
      const section = lesson?.sections?.[action.sectionIndex];
      preview.oldValue = section?.[action.field] ?? '';
    } else if (type === 'editTitle') {
      const lesson = courseMap?.lessons?.[action.lessonIndex];
      preview.oldValue = lesson?.title ?? '';
    } else if (type === 'removeItem') {
      const entry = deliverables?.[action.featureId];
      if (entry?.data) {
        const arrKey = Object.keys(entry.data).find((k) => Array.isArray(entry.data[k]));
        if (arrKey) {
          const lessonItems = entry.data[arrKey]?.[action.lessonIndex];
          const items = Array.isArray(lessonItems) ? lessonItems : lessonItems?.items;
          preview.removedItem = items?.[action.itemIndex] ?? null;
        }
      }
    } else if (type === 'editItem') {
      const entry = deliverables?.[action.featureId];
      if (entry?.data && action.path) {
        let val = entry.data;
        const parts = Array.isArray(action.path) ? [...action.path] : String(action.path).split('.');
        if (parts.length >= 1 && typeof parts[0] === 'string' && val[parts[0]] == null) {
          const actualKey = getArrayKey(action.featureId, val);
          if (actualKey) parts[0] = actualKey;
        }
        for (const p of parts) {
          if (val == null) break;
          val = val[p];
        }
        preview.oldValue = val ?? '';
      }
    } else if (type === 'deleteLesson') {
      const lesson = courseMap?.lessons?.[action.lessonIndex];
      preview.lessonTitle = lesson?.title ?? `Lesson ${(action.lessonIndex ?? 0) + 1}`;
    }
  } catch {
    /* preview is best-effort */
  }
  return preview;
}

// ═════════════════════════════════════════════════════════════════════════════
// buildAgentChatHistory tests
// ═════════════════════════════════════════════════════════════════════════════

describe('buildAgentChatHistory', () => {
  // ── Basic message roles ──────────────────────────────────────────────────

  it('converts user messages with text field', () => {
    const result = buildAgentChatHistory([{ role: 'user', text: 'Hello' }]);
    expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('converts user messages with content field', () => {
    const result = buildAgentChatHistory([{ role: 'user', content: 'Hi there' }]);
    expect(result).toEqual([{ role: 'user', content: 'Hi there' }]);
  });

  it('converts assistant messages', () => {
    const result = buildAgentChatHistory([{ role: 'assistant', text: 'Sure!' }]);
    expect(result).toEqual([{ role: 'assistant', content: 'Sure!' }]);
  });

  it('skips assistant messages with empty text', () => {
    const result = buildAgentChatHistory([{ role: 'assistant', text: '' }]);
    expect(result).toEqual([]);
  });

  it('skips assistant messages with null text and no content', () => {
    const result = buildAgentChatHistory([{ role: 'assistant' }]);
    expect(result).toEqual([]);
  });

  // ── Proposal states ──────────────────────────────────────────────────────

  describe('proposal — pending (last proposal)', () => {
    it('serializes with full option details', () => {
      const messages = [
        {
          role: 'proposal',
          status: 'pending',
          proposal: {
            options: [
              {
                label: 'A',
                title: 'Add quiz',
                description: 'Adds a quiz to lesson 1',
                action: { type: 'addItem', featureId: 'quizBank', item: { question: 'What is AI?' } },
              },
            ],
          },
        },
      ];
      const result = buildAgentChatHistory(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      expect(result[0].content).toContain('PROPOSAL (pending');
      expect(result[0].content).toContain('Add quiz');
      expect(result[0].content).toContain('addItem');
      expect(result[0].content).toContain('quizBank');
      expect(result[0].content).toContain('What is AI?');
    });
  });

  describe('proposal — selected', () => {
    it('shows which option was chosen', () => {
      const messages = [
        {
          role: 'proposal',
          status: 'selected',
          selectedLabel: 'B',
          proposal: {
            options: [
              { label: 'A', title: 'Option A', action: { type: 'addItem' } },
              { label: 'B', title: 'Option B', action: { type: 'editItem' } },
            ],
          },
        },
      ];
      const result = buildAgentChatHistory(messages);
      expect(result[0].content).toContain('User selected B');
      expect(result[0].content).toContain('Option B');
      expect(result[0].content).toContain('Applied successfully');
    });
  });

  describe('proposal — failed', () => {
    it('shows failure message', () => {
      const messages = [
        {
          role: 'proposal',
          status: 'failed',
          failedLabel: 'A',
          failedMessage: 'Index out of range',
          proposal: {
            options: [{ label: 'A', title: 'Delete row', action: { type: 'removeItem' } }],
          },
        },
      ];
      const result = buildAgentChatHistory(messages);
      expect(result[0].content).toContain('FAILED');
      expect(result[0].content).toContain('Index out of range');
      expect(result[0].content).toContain('Delete row');
    });
  });

  describe('proposal — dismissed', () => {
    it('shows dismissed text with option summary', () => {
      const messages = [
        {
          role: 'proposal',
          status: 'dismissed',
          proposal: {
            options: [
              { label: 'A', title: 'Plan A', description: 'first plan', action: { type: 'addItem' } },
              { label: 'B', title: 'Plan B', description: 'second plan', action: { type: 'editItem' } },
            ],
          },
        },
      ];
      const result = buildAgentChatHistory(messages);
      expect(result[0].content).toContain('dismissed');
      expect(result[0].content).toContain('Plan A');
      expect(result[0].content).toContain('Plan B');
    });
  });

  // ── Other message types ──────────────────────────────────────────────────

  describe('research', () => {
    it('shows query and total result count', () => {
      const messages = [
        {
          role: 'research',
          research: {
            query: 'bloom taxonomy',
            results: [{ items: [{ title: 'A' }, { title: 'B' }] }, { items: [{ title: 'C' }] }],
          },
        },
      ];
      const result = buildAgentChatHistory(messages);
      expect(result[0].content).toContain('bloom taxonomy');
      expect(result[0].content).toContain('3 results');
    });

    it('defaults to 0 results when results are empty', () => {
      const messages = [{ role: 'research', research: { query: 'test' } }];
      const result = buildAgentChatHistory(messages);
      expect(result[0].content).toContain('0 results');
    });
  });

  describe('validation', () => {
    it('shows error and warning counts', () => {
      const messages = [
        {
          role: 'validation',
          report: {
            errorCount: 2,
            warningCount: 5,
            findings: [{ message: 'Missing title' }, { message: 'Empty section' }, { message: 'No objectives' }],
          },
        },
      ];
      const result = buildAgentChatHistory(messages);
      expect(result[0].content).toContain('2 errors');
      expect(result[0].content).toContain('5 warnings');
      expect(result[0].content).toContain('Missing title');
    });

    it('skips validation with no report', () => {
      const result = buildAgentChatHistory([{ role: 'validation' }]);
      expect(result).toEqual([]);
    });
  });

  describe('changeSummary', () => {
    it('shows change details', () => {
      const messages = [
        {
          role: 'changeSummary',
          summary: {
            changes: [
              { type: 'added', count: 3, featureId: 'quizBank', label: 'Quiz Bank' },
              { type: 'edited', count: 1, featureId: 'syllabus' },
            ],
          },
        },
      ];
      const result = buildAgentChatHistory(messages);
      expect(result[0].content).toContain('added 3 in Quiz & Exam Bank (Quiz Bank)');
      expect(result[0].content).toContain('edited 1 in syllabus');
    });

    it('uses custom deliverable names instead of internal IDs', () => {
      const result = buildAgentChatHistory([
        {
          role: 'changeSummary',
          summary: {
            changes: [{ type: 'edited', count: 1, featureId: 'custom_peerReview' }],
          },
        },
      ]);

      expect(result[0].content).toContain('edited 1 in Peer Review');
      expect(result[0].content).not.toContain('custom_peerReview');
    });
  });

  describe('packageSummary', () => {
    it('keeps finalizer state available to the next agent turn', () => {
      const result = buildAgentChatHistory([
        {
          role: 'packageSummary',
          summary: {
            confidence: 'Good with assumptions',
            repairsApplied: 2,
            blockerCount: 0,
            warningCount: 1,
            validationErrorCount: 0,
            validationWarningCount: 1,
          },
        },
      ]);

      expect(result[0].content).toContain('Package check');
      expect(result[0].content).toContain('Good with assumptions');
      expect(result[0].content).toContain('2 safe repair');
    });
  });

  describe('diagram / chart / imageSearch', () => {
    it('diagram shows title', () => {
      const result = buildAgentChatHistory([{ role: 'diagram', diagram: { title: 'Module overview' } }]);
      expect(result[0].content).toContain('Module overview');
    });

    it('diagram defaults title to "concept diagram"', () => {
      const result = buildAgentChatHistory([{ role: 'diagram', diagram: {} }]);
      expect(result[0].content).toContain('concept diagram');
    });

    it('chart shows title', () => {
      const result = buildAgentChatHistory([{ role: 'chart', chart: { title: 'Grade distribution' } }]);
      expect(result[0].content).toContain('Grade distribution');
    });

    it('chart defaults title to "data visualization"', () => {
      const result = buildAgentChatHistory([{ role: 'chart' }]);
      expect(result[0].content).toContain('data visualization');
    });

    it('imageSearch shows query', () => {
      const result = buildAgentChatHistory([{ role: 'imageSearch', imageSearch: { query: 'neural networks' } }]);
      expect(result[0].content).toContain('neural networks');
    });

    it('imageSearch defaults to "images"', () => {
      const result = buildAgentChatHistory([{ role: 'imageSearch' }]);
      expect(result[0].content).toContain('images');
    });
  });

  describe('syncSuggestion', () => {
    it('shows feature names and status', () => {
      const result = buildAgentChatHistory([
        {
          role: 'syncSuggestion',
          plan: [{ featureId: 'quizBank' }, { featureId: 'rubrics' }],
          status: 'done',
        },
      ]);
      expect(result[0].content).toContain('Quiz & Exam Bank, Rubrics');
      expect(result[0].content).toContain('synced');
    });

    it('uses custom deliverable names instead of internal IDs', () => {
      const result = buildAgentChatHistory([
        {
          role: 'syncSuggestion',
          plan: [{ featureId: 'custom_peerReview' }],
          status: 'done',
        },
      ]);

      expect(result[0].content).toContain('Peer Review');
      expect(result[0].content).not.toContain('custom_peerReview');
    });

    it('maps "skipped" status', () => {
      const result = buildAgentChatHistory([
        {
          role: 'syncSuggestion',
          plan: [{ featureId: 'quizBank' }],
          status: 'skipped',
        },
      ]);
      expect(result[0].content).toContain('skipped');
    });

    it('maps unknown status to "pending"', () => {
      const result = buildAgentChatHistory([
        {
          role: 'syncSuggestion',
          plan: [{ featureId: 'quizBank' }],
          status: 'waiting',
        },
      ]);
      expect(result[0].content).toContain('pending');
    });
  });

  describe('agentProgress', () => {
    it('shows tool summary', () => {
      const result = buildAgentChatHistory([
        {
          role: 'agentProgress',
          steps: [
            { tool: 'search', summary: 'found 5 results' },
            { tool: 'edit', summary: 'updated quiz' },
          ],
        },
      ]);
      expect(result[0].content).toContain('Agent used 2 tools');
      expect(result[0].content).toContain('search: found 5 results');
      expect(result[0].content).toContain('edit: updated quiz');
    });

    it('uses singular "tool" for 1 step', () => {
      const result = buildAgentChatHistory([
        {
          role: 'agentProgress',
          steps: [{ tool: 'search', summary: 'done' }],
        },
      ]);
      expect(result[0].content).toContain('1 tool:');
    });

    it('skips when steps array is empty', () => {
      const result = buildAgentChatHistory([{ role: 'agentProgress', steps: [] }]);
      expect(result).toEqual([]);
    });
  });

  describe('error', () => {
    it('shows error text', () => {
      const result = buildAgentChatHistory([{ role: 'error', text: 'API rate limited' }]);
      expect(result[0].content).toBe('[Error: API rate limited]');
    });

    it('defaults to "unknown error"', () => {
      const result = buildAgentChatHistory([{ role: 'error' }]);
      expect(result[0].content).toBe('[Error: unknown error]');
    });
  });

  // ── Skipped roles ────────────────────────────────────────────────────────

  it('skips progress messages', () => {
    const result = buildAgentChatHistory([{ role: 'progress', text: 'Loading...' }]);
    expect(result).toEqual([]);
  });

  // ── Smart history trimming ──────────────────────────────────────────────

  it('returns all messages when under MAX_MESSAGES (20)', () => {
    const messages = Array.from({ length: 18 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `msg-${i}`,
    }));
    const result = buildAgentChatHistory(messages);
    expect(result).toHaveLength(18);
  });

  it('returns all messages when exactly at the limit', () => {
    const messages = [
      { role: 'user', text: 'Hi' },
      { role: 'assistant', text: 'Hello' },
    ];
    const result = buildAgentChatHistory(messages);
    expect(result).toHaveLength(2);
  });

  it('trims to MAX_MESSAGES when exceeding 20 converted messages', () => {
    // 25 user messages → all convert → should trim to 20
    const messages = Array.from({ length: 25 }, (_, i) => ({
      role: 'user',
      text: `msg-${i}`,
    }));
    const result = buildAgentChatHistory(messages);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.length).toBeGreaterThanOrEqual(6); // at least minimum kept
  });

  it('preserves the first user message (original intent)', () => {
    const messages = [
      { role: 'user', text: 'Create a full ML course' },
      ...Array.from({ length: 24 }, (_, i) => ({
        role: i % 2 === 0 ? 'assistant' : 'user',
        text: `filler message ${i} — some padding text to give it substance`,
      })),
    ];
    const result = buildAgentChatHistory(messages);
    expect(result[0].content).toBe('Create a full ML course');
  });

  it('preserves recent messages (last 6)', () => {
    const messages = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `msg-${i}`,
    }));
    const result = buildAgentChatHistory(messages);
    // The last few messages should be present
    const contents = result.map((r) => r.content);
    expect(contents).toContain('msg-29');
    expect(contents).toContain('msg-28');
  });

  it('prioritizes user messages over assistant summaries during trim', () => {
    const messages = [
      { role: 'user', text: 'Design my course on data science' },
      // Bunch of low-value assistant status messages
      ...Array.from({ length: 15 }, (_, i) => ({
        role: 'changeSummary',
        summary: { changes: [{ type: 'edited', count: 1, featureId: `feat-${i}` }] },
      })),
      // A few more user messages
      { role: 'user', text: 'Now add quizzes' },
      { role: 'user', text: 'Make them harder' },
      ...Array.from({ length: 5 }, (_, i) => ({
        role: 'assistant',
        text: `Response ${i}`,
      })),
    ];
    const result = buildAgentChatHistory(messages);
    const userContents = result.filter((r) => r.role === 'user').map((r) => r.content);
    // Critical user messages should survive the trim
    expect(userContents).toContain('Design my course on data science');
    expect(userContents).toContain('Now add quizzes');
  });

  // ── Mixed message types ──────────────────────────────────────────────────

  it('preserves correct ordering across mixed types', () => {
    const messages = [
      { role: 'user', text: 'Add a quiz' },
      { role: 'assistant', text: 'I can help with that.' },
      {
        role: 'proposal',
        status: 'selected',
        selectedLabel: 'A',
        proposal: { options: [{ label: 'A', title: 'Quiz option', action: { type: 'addItem' } }] },
      },
      { role: 'changeSummary', summary: { changes: [{ type: 'added', count: 1, featureId: 'quizBank' }] } },
      { role: 'user', text: 'Thanks!' },
    ];
    const result = buildAgentChatHistory(messages);
    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ role: 'user', content: 'Add a quiz' });
    expect(result[1]).toEqual({ role: 'assistant', content: 'I can help with that.' });
    expect(result[2].role).toBe('assistant');
    expect(result[2].content).toContain('User selected A');
    expect(result[3].content).toContain('Applied changes');
    expect(result[4]).toEqual({ role: 'user', content: 'Thanks!' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// generateDiffPreview tests
// ═════════════════════════════════════════════════════════════════════════════

describe('generateDiffPreview', () => {
  const sampleCourseMap = {
    lessons: [
      {
        title: 'Intro to ML',
        sections: [
          { topic: 'What is ML?', objectives: 'Understand basics' },
          { topic: 'Supervised learning', objectives: 'Learn classification' },
        ],
      },
      {
        title: 'Neural Networks',
        sections: [{ topic: 'Perceptrons', objectives: 'Build simple models' }],
      },
    ],
  };

  const sampleDeliverables = {
    quizBank: {
      data: {
        quizzes: [
          [{ question: 'What is ML?', answer: 'Machine Learning' }],
          [{ question: 'What is a neuron?', answer: 'A node' }],
        ],
      },
    },
    slideDecks: {
      data: {
        decks: [[{ title: 'Slide 1', content: 'Intro' }]],
      },
    },
    discussions: {
      data: {
        discussions: [[{ prompt: 'Discuss ML ethics' }]],
      },
    },
  };

  // ── editCell ─────────────────────────────────────────────────────────────

  describe('editCell', () => {
    it('reads old value from courseMap section', () => {
      const action = { type: 'editCell', lessonIndex: 0, sectionIndex: 0, field: 'topic' };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.oldValue).toBe('What is ML?');
    });

    it('reads objectives field', () => {
      const action = { type: 'editCell', lessonIndex: 0, sectionIndex: 1, field: 'objectives' };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.oldValue).toBe('Learn classification');
    });

    it('returns empty string for missing field', () => {
      const action = { type: 'editCell', lessonIndex: 0, sectionIndex: 0, field: 'nonexistent' };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.oldValue).toBe('');
    });

    it('returns empty string for out-of-range lesson', () => {
      const action = { type: 'editCell', lessonIndex: 99, sectionIndex: 0, field: 'topic' };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.oldValue).toBe('');
    });
  });

  // ── editTitle ────────────────────────────────────────────────────────────

  describe('editTitle', () => {
    it('reads old title from courseMap', () => {
      const action = { type: 'editTitle', lessonIndex: 1 };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.oldValue).toBe('Neural Networks');
    });

    it('returns empty string for missing lesson', () => {
      const action = { type: 'editTitle', lessonIndex: 99 };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.oldValue).toBe('');
    });
  });

  // ── removeItem ───────────────────────────────────────────────────────────

  describe('removeItem', () => {
    it('reads item from deliverable data', () => {
      const action = { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 0 };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview.removedItem).toEqual({ question: 'What is ML?', answer: 'Machine Learning' });
    });

    it('returns null for out-of-range itemIndex', () => {
      const action = { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 99 };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview.removedItem).toBeNull();
    });

    it('handles missing featureId gracefully', () => {
      const action = { type: 'removeItem', featureId: 'nonexistent', lessonIndex: 0, itemIndex: 0 };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview.removedItem).toBeUndefined();
    });

    it('handles nested items with .items property', () => {
      const deliverables = {
        quizBank: {
          data: {
            quizzes: [{ items: [{ question: 'Q1' }, { question: 'Q2' }] }],
          },
        },
      };
      const action = { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 1 };
      const preview = generateDiffPreview(action, sampleCourseMap, deliverables);
      expect(preview.removedItem).toEqual({ question: 'Q2' });
    });
  });

  // ── editItem ─────────────────────────────────────────────────────────────

  describe('editItem', () => {
    it('navigates path through deliverable data', () => {
      const action = { type: 'editItem', featureId: 'quizBank', path: ['quizzes', 0, 0, 'question'] };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview.oldValue).toBe('What is ML?');
    });

    it('handles string path (dot-separated)', () => {
      const action = { type: 'editItem', featureId: 'quizBank', path: 'quizzes.0.0.question' };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview.oldValue).toBe('What is ML?');
    });

    it('resolves root key alias when agent sends "slideDecks" but data uses "decks"', () => {
      const action = { type: 'editItem', featureId: 'slideDecks', path: ['slideDecks', 0, 0, 'title'] };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview.oldValue).toBe('Slide 1');
    });

    it('returns empty string when path leads nowhere', () => {
      const action = { type: 'editItem', featureId: 'quizBank', path: ['quizzes', 99, 0, 'question'] };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview.oldValue).toBe('');
    });

    it('returns empty string when no data and no path', () => {
      const action = { type: 'editItem', featureId: 'quizBank' };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview).toEqual({});
    });
  });

  // ── deleteLesson ─────────────────────────────────────────────────────────

  describe('deleteLesson', () => {
    it('gets lesson title', () => {
      const action = { type: 'deleteLesson', lessonIndex: 0 };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.lessonTitle).toBe('Intro to ML');
    });

    it('falls back to "Lesson N" when lesson is missing', () => {
      const action = { type: 'deleteLesson', lessonIndex: 5 };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview.lessonTitle).toBe('Lesson 6');
    });

    it('falls back correctly when lessonIndex is 0 and lesson is missing', () => {
      const action = { type: 'deleteLesson', lessonIndex: 0 };
      const preview = generateDiffPreview(action, { lessons: [] }, {});
      expect(preview.lessonTitle).toBe('Lesson 1');
    });
  });

  // ── addItem / addLesson — nothing to preview ────────────────────────────

  describe('addItem', () => {
    it('returns empty preview', () => {
      const action = { type: 'addItem', featureId: 'quizBank', lessonIndex: 0, item: { q: '?' } };
      const preview = generateDiffPreview(action, sampleCourseMap, sampleDeliverables);
      expect(preview).toEqual({});
    });
  });

  describe('addLesson', () => {
    it('returns empty preview', () => {
      const action = { type: 'addLesson', title: 'New lesson' };
      const preview = generateDiffPreview(action, sampleCourseMap, {});
      expect(preview).toEqual({});
    });
  });

  // ── Missing / null data — graceful fallback ──────────────────────────────

  describe('graceful fallback with missing data', () => {
    it('handles null courseMap', () => {
      const action = { type: 'editCell', lessonIndex: 0, sectionIndex: 0, field: 'topic' };
      const preview = generateDiffPreview(action, null, {});
      expect(preview.oldValue).toBe('');
    });

    it('handles null deliverables', () => {
      const action = { type: 'removeItem', featureId: 'quizBank', lessonIndex: 0, itemIndex: 0 };
      const preview = generateDiffPreview(action, sampleCourseMap, null);
      expect(preview.removedItem).toBeUndefined();
    });

    it('handles null action', () => {
      const preview = generateDiffPreview(null, sampleCourseMap, sampleDeliverables);
      expect(preview).toEqual({});
    });

    it('handles undefined action', () => {
      const preview = generateDiffPreview(undefined, sampleCourseMap, sampleDeliverables);
      expect(preview).toEqual({});
    });
  });
});
