import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('CourseMapper discovery surfaces', () => {
  it('makes the bounded pilot discoverable from the README', () => {
    const readme = read('README.md');

    expect(readme).toContain('## Prefer a finished draft? $10 concierge pilot');
    expect(readme).toContain('one course map;');
    expect(readme).toContain('one lesson plan;');
    expect(readme).toContain('one consolidated revision;');
    expect(readme).toContain('issues/new?template=coursemapper-pilot.yml');
    expect(readme).toContain('never post a syllabus, student records, or confidential material');
    expect(readme).not.toContain('xingpicture@gmail.com');
  });

  it('ships canonical search and social metadata for the live offer', () => {
    const html = read('index.html');

    expect(html).toContain('<link rel="canonical" href="https://edutool.dev/" />');
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title" content="Course Mapper — $10 concierge pilot"');
    expect(html).toContain('property="og:image" content="https://edutool.dev/og.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain('xingpicture@gmail.com');
    expect(fs.statSync('public/og.png').size).toBeGreaterThan(100_000);
  });

  it('allows indexing and publishes a canonical sitemap', () => {
    const robots = read('public/robots.txt');
    const sitemap = read('public/sitemap.xml');

    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://edutool.dev/sitemap.xml');
    expect(sitemap).toContain('<loc>https://edutool.dev/</loc>');
    expect(sitemap).toContain('<lastmod>2026-08-19</lastmod>');
  });
});
