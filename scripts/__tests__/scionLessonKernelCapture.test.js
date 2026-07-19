import { describe, expect, it } from 'vitest';

import { buildCodexReferencePrompt, parseArgs, parseCodexReferenceEvents } from '../scionLessonKernelCapture.mjs';

describe('Scion lesson-kernel reference capture', () => {
  it('requires an explicit valid reference runtime and preserves the API default', () => {
    expect(parseArgs(['--capture', '--arm', 'reference'])).toMatchObject({
      referenceRuntime: 'api',
      referenceModel: 'gpt-5.4-mini',
    });
    expect(parseArgs(['--capture', '--arm', 'reference', '--reference-runtime', 'codex-cli'])).toMatchObject({
      referenceRuntime: 'codex-cli',
    });
    expect(() => parseArgs(['--capture', '--arm', 'reference', '--reference-runtime', 'browser'])).toThrow(
      '--reference-runtime must be api or codex-cli',
    );
  });

  it('embeds the production messages while explicitly forbidding external tools and facts', () => {
    const prompt = buildCodexReferencePrompt([
      { role: 'system', content: 'Use facts [0] and [1].' },
      { role: 'user', content: 'Write lesson L1.' },
    ]);

    expect(prompt).toContain('Do not inspect files, browse, execute commands, call tools, or use outside facts.');
    expect(prompt).toContain('GOVERNING_INSTRUCTIONS="Use facts [0] and [1]."');
    expect(prompt).toContain('AUTHORING_REQUEST="Write lesson L1."');
  });

  it('extracts a schema-bound final message and binds thread, usage, and event lineage', () => {
    const parsed = parseCodexReferenceEvents(
      [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
        JSON.stringify({ type: 'turn.started' }),
        JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'private' } }),
        JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"lessons":[]}' } }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }),
      ].join('\n'),
    );

    expect(parsed).toEqual({
      text: '{"lessons":[]}',
      threadId: 'thread-1',
      usage: { input_tokens: 10, output_tokens: 5 },
      eventTypes: ['item.completed', 'thread.started', 'turn.completed', 'turn.started'],
      itemTypes: ['agent_message', 'reasoning'],
    });
  });

  it('rejects captures that invoke a command or do not finish the turn', () => {
    expect(() =>
      parseCodexReferenceEvents(
        [
          JSON.stringify({ type: 'thread.started', thread_id: 'thread-2' }),
          JSON.stringify({
            type: 'item.completed',
            item: { type: 'command_execution', command: 'ls' },
          }),
          JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{}' } }),
          JSON.stringify({ type: 'turn.completed', usage: {} }),
        ].join('\n'),
      ),
    ).toThrow('forbidden tool activity: command_execution');

    expect(() =>
      parseCodexReferenceEvents(
        [
          JSON.stringify({ type: 'thread.started', thread_id: 'thread-3' }),
          JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{}' } }),
        ].join('\n'),
      ),
    ).toThrow('did not complete');
  });
});
