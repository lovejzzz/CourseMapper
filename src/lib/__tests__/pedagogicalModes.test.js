import { describe, it, expect } from 'vitest';
import {
  PEDAGOGICAL_MODES,
  getMode,
  getModeSystemAddition,
  getModeLessonPlanNote,
  getModeCourseMapNote,
} from '../pedagogicalModes';

describe('PEDAGOGICAL_MODES', () => {
  it('contains exactly 5 modes', () => {
    expect(PEDAGOGICAL_MODES).toHaveLength(5);
  });

  it('has all expected mode ids', () => {
    const ids = PEDAGOGICAL_MODES.map((m) => m.id);
    expect(ids).toContain('lecture');
    expect(ids).toContain('flipped');
    expect(ids).toContain('pbl');
    expect(ids).toContain('seminar');
    expect(ids).toContain('competency');
  });

  it('each mode has required properties', () => {
    for (const mode of PEDAGOGICAL_MODES) {
      expect(mode.id).toBeTruthy();
      expect(mode.name).toBeTruthy();
      expect(mode.label).toBeTruthy();
      expect(mode.icon).toBeTruthy();
      expect(mode.description).toBeTruthy();
      expect(mode.color).toBeTruthy();
      expect(typeof mode.systemPromptAddition).toBe('string');
      expect(typeof mode.lessonPlanStructureNote).toBe('string');
      expect(typeof mode.courseMapNote).toBe('string');
    }
  });

  it('lecture mode has empty prompt additions (default)', () => {
    const lecture = PEDAGOGICAL_MODES.find((m) => m.id === 'lecture');
    expect(lecture.systemPromptAddition).toBe('');
    expect(lecture.lessonPlanStructureNote).toBe('');
    expect(lecture.courseMapNote).toBe('');
  });

  it('non-lecture modes have non-empty prompt additions', () => {
    const nonLecture = PEDAGOGICAL_MODES.filter((m) => m.id !== 'lecture');
    for (const mode of nonLecture) {
      expect(mode.systemPromptAddition.length).toBeGreaterThan(0);
      expect(mode.lessonPlanStructureNote.length).toBeGreaterThan(0);
      expect(mode.courseMapNote.length).toBeGreaterThan(0);
    }
  });
});

describe('getMode', () => {
  it('returns the correct mode by id', () => {
    expect(getMode('flipped').name).toBe('Flipped Classroom');
    expect(getMode('pbl').name).toBe('Problem-Based Learning');
    expect(getMode('seminar').name).toBe('Seminar');
    expect(getMode('competency').name).toBe('Competency-Based');
  });

  it('defaults to lecture for unknown id', () => {
    expect(getMode('nonexistent').id).toBe('lecture');
    expect(getMode(null).id).toBe('lecture');
    expect(getMode(undefined).id).toBe('lecture');
  });
});

describe('getModeSystemAddition', () => {
  it('returns empty string for lecture', () => {
    expect(getModeSystemAddition('lecture')).toBe('');
  });

  it('returns non-empty for flipped', () => {
    const addition = getModeSystemAddition('flipped');
    expect(addition).toContain('Flipped Classroom');
    expect(addition).toContain('preClassContent');
  });

  it('returns non-empty for pbl', () => {
    const addition = getModeSystemAddition('pbl');
    expect(addition).toContain('Problem-Based');
    expect(addition).toContain('caseStudy');
  });
});

describe('getModeLessonPlanNote', () => {
  it('returns empty for lecture', () => {
    expect(getModeLessonPlanNote('lecture')).toBe('');
  });

  it('returns seminar structure for seminar mode', () => {
    const note = getModeLessonPlanNote('seminar');
    expect(note).toContain('Socratic');
    expect(note).toContain('OPENING QUESTION');
  });

  it('returns competency structure for CBE mode', () => {
    const note = getModeLessonPlanNote('competency');
    expect(note).toContain('COMPETENCY STATEMENT');
    expect(note).toContain('MASTERY');
  });
});

describe('getModeCourseMapNote', () => {
  it('returns empty for lecture', () => {
    expect(getModeCourseMapNote('lecture')).toBe('');
  });

  it('returns field notes for flipped', () => {
    const note = getModeCourseMapNote('flipped');
    expect(note).toContain('preClassContent');
    expect(note).toContain('inClassApplication');
  });
});
