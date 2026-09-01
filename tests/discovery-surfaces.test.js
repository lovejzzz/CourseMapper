import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('EduTool discovery surfaces', () => {
  it('states the permanent free-product promise without an upsell', () => {
    const readme = read('README.md');

    expect(readme).toContain('Course Mapper is free—and will stay free.');
    expect(readme).toContain('There is no paid tier, subscription, or concierge upsell.');
    expect(readme).not.toContain('$10 concierge pilot');
    expect(readme).not.toContain('pilot-sample.html');
    expect(readme).not.toContain('coursemapper-pilot.yml');
  });

  it('ships canonical search and social metadata for the free product', () => {
    const html = read('index.html');

    expect(html).toContain('<link rel="canonical" href="https://edutool.dev/" />');
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title" content="EduTool — Free course maps and teaching materials"');
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).toContain('one free, local-first browser workspace');
    expect(html).not.toContain('$10');
    expect(html).not.toContain('concierge pilot');
    expect(html).not.toContain('pilot-sample.html');
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
      name: 'EduTool',
      alternateName: ['Course Mapper', 'CourseMapper', 'edutool.dev'],
    });
    expect(application).toMatchObject({
      url: 'https://edutool.dev/',
      name: 'EduTool',
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
    expect(sitemap).not.toContain('pilot-sample.html');
    expect(sitemap.match(/<url>/g)).toHaveLength(1);
    expect(sitemap).toContain('<lastmod>2026-08-19</lastmod>');
  });

  it('removes the paid pilot from every public product surface', () => {
    const publicSurfaces = [
      'README.md',
      'index.html',
      'src/screens/Landing.jsx',
      'src/pages/Contact.jsx',
      'src/pages/PrivacyPolicy.jsx',
      'src/pages/TermsOfService.jsx',
      'public/sitemap.xml',
    ];

    for (const path of publicSurfaces) {
      const surface = read(path);
      expect(surface).not.toContain('$10 pilot');
      expect(surface).not.toContain('$10 concierge');
      expect(surface).not.toContain('coursemapper-pilot.yml');
      expect(surface).not.toContain('pilot-sample.html');
    }
    expect(fs.existsSync('public/pilot-sample.html')).toBe(false);
    expect(fs.existsSync('public/og.png')).toBe(false);
    expect(fs.existsSync('.github/ISSUE_TEMPLATE/coursemapper-pilot.yml')).toBe(false);
  });
});
