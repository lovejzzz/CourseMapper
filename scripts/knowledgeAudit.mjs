#!/usr/bin/env node
/**
 * knowledgeAudit.mjs — v0.13.5 P5: the backbone stays alive.
 *
 *   npm run knowledge:audit
 *
 * Walks every shipped genome shard and the curated pedagogy evidence base:
 *  1. LINK HEALTH — every shard's source books and every evidence DOI must
 *     resolve (HEAD/GET, OpenAlex lookup for DOIs).
 *  2. RETRACTIONS — every evidence citation is checked against OpenAlex
 *     is_retracted.
 *  3. FRESHNESS — shards older than the review window surface for re-review
 *     (fast-moving disciplines deserve earlier reviewBy dates).
 *
 * Exit code 1 on dead links or retractions (CI-fail-worthy); freshness is
 * warning-only. Build-time script — needs network.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PEDAGOGY_EVIDENCE } from '../src/lib/knowledge/pedagogyEvidence.js';
import { openStaxBookUrl } from '../src/lib/knowledge/readingListEngine.js';

const here = dirname(fileURLToPath(import.meta.url));
const genomeDir = join(here, '..', 'public', 'genome');
const REVIEW_WINDOW_DAYS = 365;
const MAILTO = 'coursemapper@nyu.edu';

let failures = 0;
let warnings = 0;

async function checkUrl(url, label) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    // Some hosts reject HEAD — retry with GET before declaring a dead link.
    if (!res.ok && (res.status === 405 || res.status === 403)) {
      res = await fetch(url, { method: 'GET', redirect: 'follow' });
    }
    if (!res.ok) {
      failures += 1;
      console.log(`  ✗ DEAD LINK (${res.status}) ${label}: ${url}`);
      return false;
    }
    console.log(`  ✓ ${label}: ${url}`);
    return true;
  } catch (err) {
    failures += 1;
    console.log(`  ✗ UNREACHABLE ${label}: ${url} (${err.message})`);
    return false;
  }
}

/** Map a shard kernel's anchor src ("openstax:astronomy-2e#2") to a book URL. */
function bookUrlFromSrc(src) {
  const openstax = String(src).match(/^openstax:([a-z0-9-]+)/i);
  if (openstax) return openStaxBookUrl(openstax[1]);
  if (/^uh-oer:human-nutrition/i.test(src)) return 'https://pressbooks.oer.hawaii.edu/humannutrition2/';
  // V0.14.1 4.1: OpenGeology "An Introduction to Geology" (CC BY-NC-SA 4.0).
  if (/^opengeology:introduction-to-geology/i.test(src)) return 'https://opengeology.org/textbook/';
  // v0.14.9 A2: Milne Open Textbooks (SUNY Geneseo) — "Literature, the
  // Humanities, and Humanity" (CC BY-NC-SA) and "Naming the Unnameable"
  // (CC BY), the literature foundry books.
  const milne = String(src).match(/^milne:([a-z0-9-]+)/i);
  if (milne) return `https://milnepublishing.geneseo.edu/${milne[1]}/`;
  const openMusicTheoryChapter = {
    'omt:texture': 'texture',
    'omt:other-notation': 'other-aspects-of-notation',
    'omt:phrase-archetypes': 'phrase-archetypes',
    'omt:modulation': 'modulation',
    'omt:simple-meter-and-time-signatures': 'simple-meter-and-time-signatures',
    'omt:compound-meter-and-time-signatures': 'compound-meters-and-time-signatures',
  }[String(src).toLowerCase()];
  if (openMusicTheoryChapter) {
    return `https://viva.pressbooks.pub/openmusictheory/chapter/${openMusicTheoryChapter}/`;
  }
  if (/^omt:/i.test(src)) return 'https://viva.pressbooks.pub/openmusictheory/';
  if (/^digitalgov:/i.test(src)) return 'https://digital.gov/guides/research-collaboration/';
  if (/^uswds:/i.test(src)) return 'https://designsystem.digital.gov/components/';
  // Curated in-genome reference srcs (e.g. "historical-thinking:reference")
  // have no web home by design — they are not dead links.
  if (/:reference$/i.test(src)) return 'internal';
  return null;
}

async function auditShards() {
  const manifestPath = join(genomeDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.log('No genome manifest — run npm run genome:build first.');
    failures += 1;
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  console.log('\n— Shard freshness —');
  const builtAt = new Date(manifest.version);
  const ageDays = Math.floor((Date.now() - builtAt.getTime()) / 86400000);
  if (Number.isFinite(ageDays) && ageDays > REVIEW_WINDOW_DAYS) {
    warnings += 1;
    console.log(`  ⚠ genome built ${ageDays} days ago (> ${REVIEW_WINDOW_DAYS}d review window) — re-verify anchors`);
  } else {
    console.log(`  ✓ genome built ${Number.isFinite(ageDays) ? `${ageDays} days ago` : manifest.version}`);
  }

  console.log('\n— Shard source-book link health —');
  const bookUrls = new Map();
  for (const shardMeta of manifest.shards || []) {
    const shard = JSON.parse(readFileSync(join(genomeDir, shardMeta.path), 'utf8'));
    for (const kernel of shard.kernels || []) {
      const anchors = [kernel.definition?.anchor, ...(kernel.facts || []).map((fact) => fact.anchor)].filter(Boolean);
      for (const anchor of anchors) {
        const url = bookUrlFromSrc(anchor.src);
        if (url && !bookUrls.has(url)) bookUrls.set(url, `${shard.discipline} (${anchor.src})`);
        if (!url && anchor.src && !bookUrls.has(`unknown:${anchor.src}`)) {
          bookUrls.set(`unknown:${anchor.src}`, '');
          warnings += 1;
          console.log(`  ⚠ no URL mapping for anchor src "${anchor.src}" (${kernel.id}) — add to bookUrlFromSrc`);
        }
      }
    }
  }
  for (const [url, label] of bookUrls) {
    if (url === 'internal' || url.startsWith('unknown:')) continue;
    await checkUrl(url, label);
  }

  // v0.14 P2: standards-framework link health — every curated standards tag's
  // URL must resolve, same bar as shard books and pedagogy DOIs.
  console.log('\n— Standards framework link health —');
  const standardsUrls = new Map();
  for (const shardMeta of manifest.shards || []) {
    const shard = JSON.parse(readFileSync(join(genomeDir, shardMeta.path), 'utf8'));
    for (const kernel of shard.kernels || []) {
      for (const standard of kernel.standards || []) {
        if (standard.url && !standardsUrls.has(standard.url)) {
          standardsUrls.set(standard.url, `${standard.framework} ${standard.code}`);
        }
      }
    }
  }
  if (standardsUrls.size === 0) {
    console.log('  (no standards tags in genome yet)');
  } else {
    for (const [url, label] of standardsUrls) await checkUrl(url, label);
  }
}

async function auditEvidence() {
  console.log('\n— Pedagogy evidence: DOI resolution + retraction status —');
  for (const entry of PEDAGOGY_EVIDENCE) {
    for (const citation of entry.citations) {
      const doi = citation.doi.replace(/,+$/, '');
      try {
        const res = await fetch(
          `https://api.openalex.org/works/https://doi.org/${doi}?select=id,display_name,is_retracted&mailto=${MAILTO}`,
        );
        if (!res.ok) {
          failures += 1;
          console.log(`  ✗ DOI NOT FOUND in OpenAlex (${res.status}): ${doi} [${entry.move}]`);
          continue;
        }
        const work = await res.json();
        if (work.is_retracted) {
          failures += 1;
          console.log(`  ✗ RETRACTED: ${doi} — "${work.display_name}" [${entry.move}] — replace this citation`);
        } else {
          console.log(`  ✓ ${entry.move}: ${doi} (“${String(work.display_name).slice(0, 60)}…”)`);
        }
      } catch (err) {
        failures += 1;
        console.log(`  ✗ LOOKUP FAILED: ${doi} (${err.message})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function main() {
  console.log('CourseMapper knowledge audit — link health, retractions, freshness');
  await auditShards();
  await auditEvidence();
  console.log(`\n${failures} failure(s), ${warnings} warning(s)`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
