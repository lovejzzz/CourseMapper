import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAgentChatHistory, fetchAgentResponseNative, getSystemPrompt, streamChat } from '../useStreamProcessor';
import { runScionLocalCompletion } from '../../../lib/scionLocalProvider';

vi.mock('../../../lib/scionLocalProvider', () => ({
  runScionLocalCompletion: vi.fn(async ({ onToken, task }) => {
    const fullText = task === 'agent' ? 'Scion agent advice.' : 'Scion chat answer.';
    onToken?.(fullText);
    return { fullText };
  }),
}));

function responseWithStream() {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n'),
        );
        controller.close();
      },
    }),
    json: async () => ({}),
  };
}

describe('chat system prompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists DeepSeek with the other API-key providers', () => {
    const prompt = getSystemPrompt(null, null);

    expect(prompt).toContain('OpenAI');
    expect(prompt).toContain('Anthropic');
    expect(prompt).toContain('Google');
    expect(prompt).toContain('DeepSeek');
    expect(prompt).toContain('https://platform.deepseek.com/api_keys');
  });

  it('streams Google AI Studio chat through the Gemini endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWithStream());

    await streamChat([{ role: 'user', content: 'Hi' }], 'System', null, 'AIza-test', 'google', 'gemini-2.5-flash');

    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash');
  });

  it('streams Google Vertex chat through the Vertex endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseWithStream());

    await streamChat(
      [{ role: 'user', content: 'Hi' }],
      'System',
      null,
      'AQ.testVertexKeyForRoutingOnly0000000000000000000000',
      'google',
      'publishers/google/models/gemini-2.5-pro',
    );

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toContain('aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-pro');
    expect(JSON.parse(request.body).systemInstruction.parts[0].text).toBe('System');
  });

  it('streams keyless chat through the browser-local Scion runtime', async () => {
    const { reader, parseChunk } = await streamChat(
      [{ role: 'user', content: 'Review Lesson 2' }],
      'Course context',
      null,
      '',
      'public',
      'scion-public',
    );
    const { value } = await reader.read();
    const line = new TextDecoder().decode(value).trim();
    const parsed = JSON.parse(line.slice('data: '.length));

    expect(parseChunk(parsed)).toBe('Scion chat answer.');
    expect(runScionLocalCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'chat', systemPrompt: 'Course context', maxRetries: 0 }),
    );
  });

  it('connects Agent advisory turns to Scion without pretending native tools exist', async () => {
    const result = await fetchAgentResponseNative(
      [{ role: 'user', content: 'Audit this course' }],
      'Workspace context',
      null,
      '',
      'public',
      'scion-public',
      [],
    );

    expect(result).toEqual({ toolCalls: null, textContent: 'Scion agent advice.', stopReason: 'stop' });
    expect(runScionLocalCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'agent', systemPrompt: 'Workspace context', maxRetries: 0 }),
    );
  });
});

describe('buildAgentChatHistory', () => {
  it('uses hidden agent prompt overrides for command bubbles', () => {
    const history = buildAgentChatHistory([
      {
        role: 'user',
        text: 'Improve Lesson Plans',
        agentPromptOverride: 'Improve Lesson Plans with detailed classroom-readiness instructions.',
      },
      { role: 'assistant', text: 'Done.' },
    ]);

    expect(history).toEqual([
      { role: 'user', content: 'Improve Lesson Plans with detailed classroom-readiness instructions.' },
      { role: 'assistant', content: 'Done.' },
    ]);
  });

  it('keeps workspace plan context available to the next agent turn', () => {
    const history = buildAgentChatHistory([
      {
        role: 'workspacePlan',
        actionStates: {
          'sync_stale_deliverables|P0|Sync stale deliverables: Quiz & Exam Bank|Quiz & Exam Bank|quizBank': {
            status: 'done',
          },
          'audit_package|P1|Audit package warnings|Package|lessonPlans': {
            status: 'sent',
          },
        },
        plan: {
          evidence: { generatedFeatureCount: 3, staleFeatureCount: 1, failedFeatureCount: 0 },
          highestImpactAction: { title: 'Sync stale deliverables: Quiz & Exam Bank' },
          actions: [
            {
              priority: 'P0',
              title: 'Sync stale deliverables: Quiz & Exam Bank',
              safeMode: 'needs-approval',
              target: 'Quiz & Exam Bank',
              reason: 'The quiz bank is stale after a lesson-title edit.',
              toolHint: 'Approve the pending sync suggestion.',
              intent: { type: 'sync_stale_deliverables', featureIds: ['quizBank'] },
            },
            {
              priority: 'P1',
              title: 'Audit package warnings',
              safeMode: 'review-only',
              target: 'Package',
              reason: 'Warnings remain after local repairs.',
              intent: { type: 'audit_package', featureIds: ['lessonPlans'] },
            },
          ],
        },
      },
    ]);

    expect(history[0].content).toContain('Workspace plan');
    expect(history[0].content).toContain('Sync stale deliverables');
    expect(history[0].content).toContain('3 generated, 1 stale, 0 failed');
    expect(history[0].content).toContain('status=done');
    expect(history[0].content).toContain('status=sent');
    expect(history[0].content).toContain('intent=sync_stale_deliverables');
    expect(history[0].content).toContain('target=Quiz & Exam Bank');
    expect(history[0].content).toContain('reason=The quiz bank is stale after a lesson-title edit.');
    expect(history[0].content).toContain('toolHint=Approve the pending sync suggestion.');
  });

  it('keeps Agent action receipts available to the next agent turn', () => {
    const history = buildAgentChatHistory([
      {
        role: 'agentReceipt',
        actionStates: {
          'audit-quality|Check package|audit-package|agent-receipt': { status: 'done' },
        },
        receipt: {
          title: 'Package receipt',
          status: 'done',
          intent: { type: 'finish_package' },
          mode: 'Auto-fix',
          target: 'Package',
          runStats: {
            toolCount: 2,
            actionCount: 1,
            checkCount: 1,
            providerCallCount: 2,
            stopReason: 'respond',
          },
          toolManifest: [
            {
              tool: 'finalize_package',
              label: 'Finish package',
              status: 'done',
              summary: 'Package ready',
              targets: ['Package'],
            },
            {
              tool: 'verify_package_exports',
              label: 'Verify exports',
              status: 'done',
              summary: 'Exports verified',
              targets: ['Package'],
            },
          ],
          changed: ['No safe repairs needed'],
          checked: ['Readiness', 'Export files'],
          next: 'Safe checks passed and the package is ready.',
        },
      },
    ]);

    expect(history[0]).toMatchObject({ role: 'assistant' });
    expect(history[0].content).toContain('Package receipt');
    expect(history[0].content).toContain('status=done');
    expect(history[0].content).toContain('intent=finish_package');
    expect(history[0].content).toContain('tools=2, actions=1, checks=1');
    expect(history[0].content).toContain('modelCalls=2');
    expect(history[0].content).toContain('stop=respond');
    expect(history[0].content).toContain('changed=No safe repairs needed');
    expect(history[0].content).toContain('checked=Readiness; Export files');
    expect(history[0].content).toContain(
      'toolManifest=Finish package status=done summary=Package ready target=Package',
    );
    expect(history[0].content).toContain('receiptActions=audit-quality=status:done');
    expect(history[0].content).toContain('next=Safe checks passed');
  });

  it('keeps the landing project brief when long chat history is trimmed', () => {
    const landingContext = {
      role: 'user',
      text: [
        'Here is what I am starting with.',
        '',
        'Starting request:',
        'Build a 12-week applied machine learning lab with weekly notebooks and a final model card.',
        '',
        'Uploaded materials:',
        '- starter-notebook-outline.txt',
        '- model-card-template.docx',
      ].join('\n'),
    };
    const longConversation = Array.from({ length: 28 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      text: `Follow-up ${index + 1}: adjust the generated course package section ${index + 1}.`,
    }));

    const history = buildAgentChatHistory([landingContext, ...longConversation]);

    expect(history.length).toBeLessThanOrEqual(20);
    expect(history[0]).toMatchObject({ role: 'user' });
    expect(history[0].content).toContain('Here is what I am starting with.');
    expect(history[0].content).toContain('starter-notebook-outline.txt');
  });

  it('serializes attached source context into future Agent chat history', () => {
    const history = buildAgentChatHistory([
      {
        role: 'sourceContext',
        label: 'Source added',
        meta: {
          fileCount: 1,
          fileNames: ['model-card-template.docx'],
          materialNoteCount: 1,
        },
        materialNotes: [
          {
            name: 'model-card-template.docx',
            excerpt: 'Template asks for validation evidence, limitations, and fairness notes.',
          },
        ],
      },
      { role: 'user', text: 'Use that template to improve the study guides.' },
    ]);

    expect(history[0]).toMatchObject({ role: 'user' });
    expect(history[0].content).toContain('[Source context added: 1 reference material');
    expect(history[0].content).toContain('model-card-template.docx');
    expect(history[0].content).toContain('validation evidence');
    expect(history[1].content).toContain('Use that template');
  });

  it('keeps attached source context when long Agent history is trimmed', () => {
    const sourceContext = {
      role: 'sourceContext',
      label: 'Source added',
      meta: {
        fileCount: 1,
        fileNames: ['dataset-card.md'],
        materialNoteCount: 1,
      },
      materialNotes: [
        {
          name: 'dataset-card.md',
          excerpt: 'Dataset has missingness, threshold tradeoffs, and fairness concerns.',
        },
      ],
    };
    const longConversation = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? 'assistant' : 'user',
      text: `Follow-up ${index + 1}: revise generated material section ${index + 1}.`,
    }));

    const history = buildAgentChatHistory([sourceContext, ...longConversation]);

    expect(history.length).toBeLessThanOrEqual(20);
    expect(history.some((message) => message.content.includes('dataset-card.md'))).toBe(true);
    expect(history.some((message) => message.content.includes('threshold tradeoffs'))).toBe(true);
  });
});
