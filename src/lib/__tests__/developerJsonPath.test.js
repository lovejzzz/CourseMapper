import { describe, expect, it } from 'vitest';
import { findJsonPathLocation, parseJsonPath } from '../developerJsonPath';

describe('developerJsonPath', () => {
  it('parses dotted and indexed JSON paths', () => {
    expect(parseJsonPath('courseMap.lessons[2].title')).toEqual(['courseMap', 'lessons', 2, 'title']);
  });

  it('finds the matching repeated key occurrence in section JSON', () => {
    const text = JSON.stringify(
      {
        lessons: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
      },
      null,
      2,
    );

    const location = findJsonPathLocation(text, 'courseMap.lessons[2].title', 'courseMap');

    expect(location.line).toBe(10);
    expect(text.slice(location.index, location.endIndex)).toBe('"title"');
  });

  it('keeps raw snapshot roots intact', () => {
    const text = JSON.stringify({ courseMap: { lessons: [{ title: 'One' }] } }, null, 2);

    const location = findJsonPathLocation(text, 'courseMap.lessons[0].title', 'raw');

    expect(text.slice(location.index, location.endIndex)).toBe('"title"');
  });
});
