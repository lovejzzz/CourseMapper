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
    expect(readme).toContain('https://edutool.dev/pilot-sample.html');
    expect(readme).toContain('issues/new?template=coursemapper-pilot.yml');
    expect(readme).toContain('never post a syllabus, student records, or confidential material');
    expect(readme).not.toContain('xingpicture@gmail.com');
  });

  it('ships canonical search and social metadata for the live offer', () => {
    const html = read('index.html');
    const sample = read('public/pilot-sample.html');

    expect(html).toContain('<link rel="canonical" href="https://edutool.dev/" />');
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title" content="Course Mapper — $10 concierge pilot"');
    expect(html).toContain('property="og:image" content="https://edutool.dev/og.png"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain('xingpicture@gmail.com');
    expect(fs.statSync('public/og.png').size).toBeGreaterThan(100_000);
    expect(sample).toContain('<link rel="canonical" href="https://edutool.dev/pilot-sample.html" />');
    expect(sample).toContain('name="description"');
    expect(sample).not.toContain('xingpicture@gmail.com');
  });

  it('publishes truthful site-name and free web-app structured data', () => {
    const html = read('index.html');
    const landing = read('src/screens/Landing.jsx');
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);

    expect(jsonLdMatch).not.toBeNull();
    const structuredData = JSON.parse(jsonLdMatch[1]);
    const website = structuredData['@graph'].find((entry) => entry['@type'] === 'WebSite');
    const application = structuredData['@graph'].find((entry) => entry['@type'] === 'WebApplication');

    expect(website).toMatchObject({
      url: 'https://edutool.dev/',
      name: 'Course Mapper',
      alternateName: ['CourseMapper', 'edutool.dev'],
    });
    expect(application).toMatchObject({
      url: 'https://edutool.dev/',
      name: 'Course Mapper',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any',
      offers: {
        '@type': 'Offer',
        url: 'https://edutool.dev/',
        price: 0,
        priceCurrency: 'USD',
      },
    });
    expect(landing.replace(/\s+/g, ' ')).toContain('one free, local-first browser workspace');
    expect(JSON.stringify(structuredData)).not.toContain('xingpicture@gmail.com');
  });

  it('allows indexing and publishes a canonical sitemap', () => {
    const robots = read('public/robots.txt');
    const sitemap = read('public/sitemap.xml');

    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://edutool.dev/sitemap.xml');
    expect(sitemap).toContain('<loc>https://edutool.dev/</loc>');
    expect(sitemap).toContain('<loc>https://edutool.dev/pilot-sample.html</loc>');
    expect(sitemap.match(/<url>/g)).toHaveLength(2);
    expect(sitemap).toContain('<lastmod>2026-08-19</lastmod>');
  });
});
