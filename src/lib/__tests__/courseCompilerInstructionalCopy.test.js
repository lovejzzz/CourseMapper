import { describe, expect, it } from 'vitest';
import { ARTIFACT_PATTERNS } from '../quality/artifactDefectPatterns';
import {
  admittedEvidenceDefinitionCue,
  constructedResponseRelationshipSampleCopy,
} from '../compilerAssessmentEvidenceCopy';

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

  it('does not repeat a fact-projected definition as a second evidence quotation', () => {
    const fact = 'Missing values require a documented treatment decision.';
    const copy = constructedResponseRelationshipSampleCopy({
      lessonNumber: 2,
      conceptA: 'Missing values',
      conceptB: 'Cleaning logs',
      definitionA: fact,
      definitionB: 'Cleaning logs record transformations.',
      factA: fact,
      factB: 'Cleaning logs record transformations.',
    });

    expect(copy.split(fact).length - 1).toBe(1);
    expect(admittedEvidenceDefinitionCue({ concept: 'Missing values', definition: fact, fact })).not.toContain(fact);
  });
});
