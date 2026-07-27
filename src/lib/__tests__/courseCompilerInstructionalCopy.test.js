import { describe, expect, it } from 'vitest';
import { ARTIFACT_PATTERNS } from '../quality/artifactDefectPatterns';
import { constructedResponseRelationshipSampleCopy } from '../courseCompilerInstructionalCopy';

describe('constructedResponseRelationshipSampleCopy', () => {
  it('does not create an X: X evidence echo when a source fact starts with the concept name', () => {
    const copy = constructedResponseRelationshipSampleCopy({
      lessonNumber: 3,
      conceptA: 'Personas',
      conceptB: 'Research planning',
      definitionA: 'A persona represents a recurring user pattern.',
      definitionB: 'Research planning defines how evidence will be collected.',
      factA: 'Personas are one way to communicate user evidence.',
      factB: 'Research planning aligns questions, participants, and methods.',
    });

    const echoPattern = ARTIFACT_PATTERNS.find((pattern) => pattern.name === 'echo-chain-x-x');

    expect(copy).not.toContain('Evidence for Personas: Personas');
    expect(echoPattern).toBeDefined();
    expect(echoPattern.regex.test(copy)).toBe(false);
  });
});
