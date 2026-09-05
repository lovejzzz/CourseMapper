import { describe, expect, it } from 'vitest';
import { repairCourseIdentityTypography, repairCourseMapIdentityTypography } from '../courseIdentityTypography.js';

describe('course identity typography', () => {
  it('repairs split all-caps function words from PDF text extraction', () => {
    expect(repairCourseIdentityTypography('INTRODUCTION TO T HE PRACTICE OF STATISTICS')).toBe(
      'INTRODUCTION TO THE PRACTICE OF STATISTICS',
    );
    expect(repairCourseIdentityTypography('LAW A ND PUBLIC POLICY')).toBe('LAW AND PUBLIC POLICY');
  });

  it('does not join initials, acronyms, or content words speculatively', () => {
    expect(repairCourseIdentityTypography('A I Studio')).toBe('A I Studio');
    expect(repairCourseIdentityTypography('T HEORY OF DESIGN')).toBe('T HEORY OF DESIGN');
    expect(repairCourseMapIdentityTypography({ courseName: 'Plain Title', lessons: [] })).toEqual({
      courseName: 'Plain Title',
      lessons: [],
    });
  });
});
