import { describe, expect, it } from 'vitest';
import { checkExplicitLessonSequenceReuse } from '../lessonSequenceQualityChecks.js';

function collector() {
  const list = [];
  return { list, add: (finding) => list.push(finding) };
}

describe('explicit lesson-sequence quality checks', () => {
  it('blocks three repeated capstone sessions when the brief names an ordered topic sequence', () => {
    const findings = collector();
    const byLesson = new Map([
      [11, [{ title: 'Final project', path: 'Lesson 11.docx' }]],
      [13, [{ title: 'Final project', path: 'Lesson 13.docx' }]],
      [14, [{ title: 'Final project', path: 'Lesson 14.docx' }]],
    ]);

    checkExplicitLessonSequenceReuse(findings, byLesson, {
      prompt: 'Lessons cover: healthy eating; nutrition labels; nutrient review; and a final diet-analysis project.',
    });

    expect(findings.list).toEqual([
      expect.objectContaining({
        severity: 'P0',
        dimension: 'consistency',
        detail: 'Explicit source lesson sequence collapsed into repeated "Final project" sessions',
        evidence: expect.stringContaining('Lessons 11, 13, 14'),
      }),
    ]);
  });

  it('stays quiet without an explicit ordered lesson sequence', () => {
    const findings = collector();
    checkExplicitLessonSequenceReuse(
      findings,
      new Map([
        [1, [{ title: 'Studio', path: 'L1.docx' }]],
        [2, [{ title: 'Studio', path: 'L2.docx' }]],
        [3, [{ title: 'Studio', path: 'L3.docx' }]],
      ]),
      { prompt: 'An open studio course with recurring work sessions.' },
    );
    expect(findings.list).toEqual([]);
  });

  it('blocks omitted and shifted ordered topics even when the lesson titles are unique', () => {
    const findings = collector();
    const titles = [
      'Diurnal motion',
      'Celestial coordinates',
      'Seasons and tilt',
      'Moon phases',
      'Planetary motion',
      'Electromagnetic spectrum',
      'Stellar spectra',
      'Stellar brightness',
      'Solar system formation',
      'Hubble’s law',
      'Course review',
      'Midterm exam',
    ];
    checkExplicitLessonSequenceReuse(
      findings,
      new Map(titles.map((title, index) => [index + 1, [{ title, path: `L${index + 1}.docx` }]])),
      {
        prompt:
          'Lessons cover: diurnal motion and the apparent daily motion of the sky; the celestial sphere and celestial coordinates; the seasons and axial tilt with solstice and equinox; phases of the Moon; Kepler’s third law and the laws of planetary motion; the electromagnetic spectrum and wavelengths of light; spectral lines, absorption and emission spectra of stars; telescope light-gathering power and aperture; stellar parallax and celestial distances measured in parsecs; apparent magnitude and the brightness of stars; the solar nebula hypothesis and the formation of the solar system; and Hubble’s law and the expanding universe with a course review.',
      },
    );

    expect(findings.list).toEqual([
      expect.objectContaining({
        severity: 'P0',
        detail: 'Explicit source lesson sequence omits or shifts 5 ordered topic(s)',
        evidence: expect.stringContaining('L8 expected "telescope light-gathering power and aperture"'),
      }),
    ]);
  });

  it('accepts concise titles that preserve the ordered source topics', () => {
    const findings = collector();
    checkExplicitLessonSequenceReuse(
      findings,
      new Map([
        [1, [{ title: 'Stellar spectra', path: 'L1.docx' }]],
        [2, [{ title: 'Moon phases', path: 'L2.docx' }]],
      ]),
      { prompt: 'Lessons cover: spectral lines and spectra of stars; and phases of the Moon.' },
    );
    expect(findings.list).toEqual([]);
  });

  it('blocks the real six-week Scion collapse from a “with these lessons” brief', () => {
    const findings = collector();
    const titles = [
      'World Literature Scope',
      'Oral Epic Tradition',
      'Homeric Epic and Classical Drama',
      'World Literature Scope',
      'Oral Epic Tradition',
      'Homeric Epic and Classical Drama',
    ];
    checkExplicitLessonSequenceReuse(
      findings,
      new Map(titles.map((title, index) => [index + 1, [{ title, path: `Lesson ${index + 1}.docx` }]])),
      {
        prompt:
          'Create a 6-week college World Literature course with these lessons: World Literature Scope; Oral Epic Tradition using Gilgamesh; Homeric Epic using The Odyssey; Classical Drama using Antigone; Tang Poetry using selected poems by Li Bai and Du Fu; and Frame Narratives using The Thousand and One Nights. Focus on textual analysis.',
      },
    );

    expect(findings.list).toEqual([
      expect.objectContaining({
        severity: 'P0',
        detail: 'Explicit source lesson sequence omits or shifts 3 ordered topic(s)',
        evidence: expect.stringContaining('L4 expected "Classical Drama using Antigone"'),
      }),
    ]);
  });
});
