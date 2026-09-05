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

  it('never invents a means relationship around an admitted source statement', () => {
    const sourceClaim = 'The number of components in a mixture distribution is often restricted to being finite.';
    const copy = constructedResponseRelationshipSampleCopy({
      lessonNumber: 2,
      conceptA: 'Mixture distribution',
      conceptB: 'Poisson regression',
      definitionA: sourceClaim,
      definitionB: 'In statistics, Poisson regression is a generalized linear model used to model count data.',
      factA: '',
      factB: '',
    });

    expect(copy).toContain(sourceClaim);
    expect(copy).toContain(
      'Definition for Poisson regression: In statistics, Poisson regression is a generalized linear model used to model count data.',
    );
    expect(copy).not.toContain('Mixture distribution means');
    expect(copy).not.toContain('Poisson regression means');
  });

  it('keeps exact source facts behind structural labels without inventing support relationships', () => {
    const first = 'The first source sentence states a bounded observation.';
    const second = 'The second source sentence states a different bounded observation.';
    const copy = constructedResponseRelationshipSampleCopy({
      lessonNumber: 2,
      conceptA: 'First concept',
      conceptB: 'Second concept',
      definitionA: 'First concept has a source-bound definition.',
      definitionB: 'Second concept has a source-bound definition.',
      factA: first,
      factB: second,
    });

    expect(copy).toContain(`Source claim 1: ${first}`);
    expect(copy).toContain(`Source claim 2: ${second}`);
    expect(copy).not.toMatch(/\b(?:grounds|demonstrates|supports) (?:First|Second) concept\b/);
  });
});
