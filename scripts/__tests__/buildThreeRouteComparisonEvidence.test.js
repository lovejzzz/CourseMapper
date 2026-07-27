import { describe, expect, it } from 'vitest';
import { timingFromConsole } from '../buildThreeRouteComparisonEvidence.mjs';

describe('three-route evidence builder', () => {
  it('measures warm Scion preparation separately from generation', () => {
    const consoleText = [
      '2026-07-27T20:42:01.601Z [info] {"type":"localModelProgress","progress":0}',
      '2026-07-27T20:42:03.634Z [info] {"type":"scionAdapterRoute"}',
      '2026-07-27T20:42:16.893Z [info] {"type":"providerResponseDone"}',
    ].join('\n');
    expect(timingFromConsole(consoleText)).toEqual({ modelLoadMs: 2033, sourceRequests: 0 });
  });

  it('takes the terminal Algi source-request receipt', () => {
    const consoleText = [
      '2026-07-27T20:39:38.000Z [info] {"sourceRequests":2}',
      '2026-07-27T20:39:39.000Z [info] {"sourceRequests":8}',
    ].join('\n');
    expect(timingFromConsole(consoleText)).toEqual({ modelLoadMs: 0, sourceRequests: 8 });
  });
});
