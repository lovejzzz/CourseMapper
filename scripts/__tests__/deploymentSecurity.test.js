import fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readFirebaseConfig() {
  const raw = await fs.readFile(new URL('../../firebase.json', import.meta.url), 'utf8');
  return JSON.parse(raw);
}

async function readRepoFile(path) {
  return fs.readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function hostingHeaders(config) {
  const entries = config.hosting?.headers?.[0]?.headers || [];
  return new Map(entries.map((entry) => [entry.key, entry.value]));
}

describe('deployment security configuration', () => {
  it('defines static hosting headers for controlled pilot deployments', async () => {
    const config = await readFirebaseConfig();
    const headers = hostingHeaders(config);

    expect(config.hosting).toMatchObject({
      public: 'dist',
      rewrites: [{ source: '**', destination: '/index.html' }],
    });
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('keeps CSP aligned with provider APIs and pinned runtime CDNs', async () => {
    const csp = hostingHeaders(await readFirebaseConfig()).get('Content-Security-Policy') || '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('https://api.openai.com');
    expect(csp).toContain('https://api.anthropic.com');
    expect(csp).toContain('https://generativelanguage.googleapis.com');
    expect(csp).toContain('https://api.deepseek.com');
    expect(csp).toContain('https://openrouter.ai');
    expect(csp).toContain('https://cdn.jsdelivr.net');
    expect(csp).toContain('https://cdnjs.cloudflare.com');
  });

  it('enforces a CSP on GitHub Pages without loading blocked Google fonts', async () => {
    const html = await readRepoFile('index.html');
    const firebaseCsp = hostingHeaders(await readFirebaseConfig()).get('Content-Security-Policy') || '';

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain('sha256-zojt58hOk26YGVGYiUWVtveB86wB9IEVJ2YUs6LR+Do=');
    expect(firebaseCsp).toContain('sha256-zojt58hOk26YGVGYiUWVtveB86wB9IEVJ2YUs6LR+Do=');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });

  it('keeps one automatic production deployment path', async () => {
    const productionWorkflow = await readRepoFile('.github/workflows/deploy-pages.yml');
    const firebaseWorkflow = await readRepoFile('.github/workflows/deploy.yml');

    expect(productionWorkflow).toContain('name: Deploy edutool.dev');
    expect(productionWorkflow).toContain('workflow_run:');
    expect(firebaseWorkflow).toContain('name: Firebase preview (manual)');
    expect(firebaseWorkflow).not.toContain('workflow_run:');
  });

  it('keeps the archived Express proxy out of the repo root and development-only', async () => {
    // v0.8.6: the dormant dev proxy moved to archive/ so the deployable
    // surface contains no server code.
    await expect(fs.access(new URL('../../server.js', import.meta.url))).rejects.toThrow();

    const source = await fs.readFile(new URL('../../archive/dev-proxy/server.js', import.meta.url), 'utf8');
    expect(source).toContain('COURSEMAPPER_ENABLE_DEV_PROXY');
    expect(source).toMatch(/development-only proxy/i);
    expect(source).toContain("process.env.NODE_ENV === 'production'");
  });
});
