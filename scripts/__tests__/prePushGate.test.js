import { describe, expect, it } from 'vitest';
import {
  FAST_VERIFICATION_COMMANDS,
  formatCommand,
  mainPushFromUpdates,
  parsePrePushUpdates,
} from '../prePushGate.mjs';

describe('EduTool pre-push gate', () => {
  it('selects a non-deletion update to main', () => {
    const updates = parsePrePushUpdates(
      [
        'refs/heads/topic aaaaaaaa refs/heads/topic bbbbbbbb',
        'refs/heads/topic cccccccc refs/heads/main dddddddd',
      ].join('\n'),
    );

    expect(mainPushFromUpdates(updates)).toEqual({
      localRef: 'refs/heads/topic',
      localSha: 'cccccccc',
      remoteRef: 'refs/heads/main',
      remoteSha: 'dddddddd',
    });
  });

  it('ignores branch pushes and main deletion updates', () => {
    const updates = parsePrePushUpdates(
      ['refs/heads/topic aaaaaaaa refs/heads/topic bbbbbbbb', '(delete) 00000000 refs/heads/main cccccccc'].join('\n'),
    );

    expect(mainPushFromUpdates(updates)).toBeUndefined();
  });

  it('mirrors the gates that caught the recent UI regressions', () => {
    const commands = FAST_VERIFICATION_COMMANDS.map(formatCommand);

    expect(commands).toContain('npm test');
    expect(commands).toContain('npm run test:e2e');
    expect(commands).toContain('npm run format:check');
    expect(commands).toContain('npm run lint');
    expect(commands).toContain('npm run build');
    expect(commands).toContain('npm run bundle:check');
  });
});
