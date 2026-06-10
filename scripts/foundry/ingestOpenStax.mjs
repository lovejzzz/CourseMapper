#!/usr/bin/env node
/**
 * ingestOpenStax.mjs — v0.13.5 P1: the industrial foundry's intake step.
 *
 * Fetches OpenStax (or any open-textbook) section pages, strips them to
 * clean text, and stores per-section snapshots with checksums under
 * scripts/foundry/snapshots/<book>/. Snapshots are the quote substrate:
 * proposeKernels.mjs quotes from them, and the mechanical admission gate
 * verifies every anchor against them verbatim.
 *
 *   node scripts/foundry/ingestOpenStax.mjs astronomy-2e 2-1-the-sky-above [more-page-slugs…]
 *   node scripts/foundry/ingestOpenStax.mjs --url https://pressbooks.oer.hawaii.edu/humannutrition2/chapter/<slug>/ --book human-nutrition-2e
 *
 * Build-time only (Node, no CORS limits). Never runs in the browser.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotsDir = join(here, 'snapshots');

function checksum(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Strip an HTML page to readable text: main content only, tags removed. */
export function htmlToSnapshotText(html) {
  let scope = html;
  const main = html.match(/<main[\s>][\s\S]*?<\/main>/i) || html.match(/<article[\s>][\s\S]*?<\/article>/i);
  if (main) scope = main[0];
  return scope
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<(h[1-6]|p|li|div|section|figcaption|td|th)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

async function fetchSnapshot(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'CourseMapper-foundry (coursemapper@nyu.edu)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return htmlToSnapshotText(await res.text());
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: node scripts/foundry/ingestOpenStax.mjs <book-slug> <page-slug> [page-slug…]');
    console.error('   or: node scripts/foundry/ingestOpenStax.mjs --url <full-url> --book <book-slug>');
    process.exit(1);
  }

  const jobs = [];
  if (args[0] === '--url') {
    const url = args[1];
    const bookFlag = args.indexOf('--book');
    const book = bookFlag >= 0 ? args[bookFlag + 1] : 'custom';
    const slug = url.replace(/\/+$/, '').split('/').pop();
    jobs.push({ book, slug, url });
  } else {
    const [book, ...slugs] = args;
    for (const slug of slugs) jobs.push({ book, slug, url: `https://openstax.org/books/${book}/pages/${slug}` });
  }

  let failures = 0;
  for (const { book, slug, url } of jobs) {
    try {
      const text = await fetchSnapshot(url);
      if (text.length < 400) throw new Error(`extracted only ${text.length} chars — page likely needs manual capture`);
      const dir = join(snapshotsDir, book);
      mkdirSync(dir, { recursive: true });
      const snapshot = { url, book, slug, fetchedAt: new Date().toISOString(), checksum: checksum(text), text };
      writeFileSync(join(dir, `${slug}.json`), JSON.stringify(snapshot, null, 2));
      console.log(`[ingest] ${book}/${slug}: ${text.length} chars, checksum ${snapshot.checksum}`);
    } catch (err) {
      failures += 1;
      console.error(`[ingest] FAILED ${book}/${slug}: ${err.message}`);
    }
    // Etiquette: one page per second against the open commons.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.exit(failures > 0 ? 1 : 0);
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) main();
