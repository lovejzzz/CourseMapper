#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessCorpusRow } from './scionPreferenceCorpusAudit.mjs';
import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';

const DEFAULT_SOURCES = [
  'trellis/tendril/distill/data-g4-orpo/train.jsonl',
  'trellis/tendril/distill/data-g4-orpo/app-flywheel.jsonl',
  'evaluation/scion-review-candidates.jsonl',
];
const DEFAULT_OUTPUT = 'verification-output/scion-blind-review';
const DEFAULT_APPROVED = 'evaluation/scion-reviewed-preferences.jsonl';
const REVIEW_ROLES = new Set(['working-instructor']);
const REVIEW_CHOICES = new Set(['A', 'B', 'tie', 'both-bad']);

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parseJson(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stablePairId(row) {
  const first = row.chosen ?? row.left;
  const second = row.rejected ?? row.right;
  return `scion-${hash(JSON.stringify({ kind: row.kind, prompt: row.prompt, first, second })).slice(0, 20)}`;
}

function canonicalDomain(value) {
  const domain = String(value || '').trim();
  if (domain === 'cs-python') return 'computer-science';
  return domain;
}

function payloadAssessment(kind, value) {
  if (kind === 'mc-item') return assessScionMcItem(value);
  if (kind === 'key-term') return assessScionKeyTerm(value);
  return { eligible: false, issues: ['unsupported-review-kind'] };
}

async function readRows(source) {
  try {
    const raw = await fs.readFile(source, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ row: JSON.parse(line), source, line: index + 1 }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function roundRobin(candidates, limit) {
  const buckets = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.domain}|${candidate.kind}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(candidate);
  }
  for (const bucket of buckets.values()) bucket.sort((left, right) => left.pairId.localeCompare(right.pairId));
  const keys = [...buckets.keys()].sort();
  const selected = [];
  while (selected.length < limit) {
    let moved = false;
    for (const key of keys) {
      const next = buckets.get(key)?.shift();
      if (!next) continue;
      selected.push(next);
      moved = true;
      if (selected.length >= limit) break;
    }
    if (!moved) break;
  }
  return selected;
}

export function createBlankScionReview(caseRow, reviewPacketId = '') {
  return {
    pairId: caseRow.pairId,
    domain: caseRow.domain,
    reviewPacketId,
    reviewerId: '',
    reviewerRole: 'working-instructor',
    reviewerDomain: '',
    disciplineFamiliarity: '',
    independent: false,
    conflictOfInterest: null,
    reviewedAt: '',
    choice: '',
    factualCorrectnessA: null,
    factualCorrectnessB: null,
    teachabilityA: null,
    teachabilityB: null,
    rationale: '',
    attestation: false,
  };
}

function safeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function ratingSelect(name, label) {
  return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}" required><option value="">Select 1–5</option>${[1, 2, 3, 4, 5].map((value) => `<option value="${value}">${value}</option>`).join('')}</select></label>`;
}

export function buildScionReviewerHtml({ meta, domain, cases }) {
  const templates = cases.map((caseRow) => createBlankScionReview(caseRow, meta.packetId));
  const packet = { packetId: meta.packetId, domain, cases, templates };
  const cards = cases
    .map(
      (caseRow, index) => `<section class="case-card" data-case-index="${index}">
        <div class="case-heading"><span>Case ${index + 1} of ${cases.length}</span><code>${escapeHtml(caseRow.pairId)}</code></div>
        <p class="kind">${escapeHtml(caseRow.kind === 'mc-item' ? 'Multiple-choice item' : 'Key term')}</p>
        <h2>Prompt</h2><p class="prompt">${escapeHtml(caseRow.prompt)}</p>
        <div class="packages">
          <article><h3>Package A</h3><pre>${escapeHtml(JSON.stringify(caseRow.A, null, 2))}</pre>
            <div class="ratings">${ratingSelect(`factualCorrectnessA-${index}`, 'Factual correctness A')}${ratingSelect(`teachabilityA-${index}`, 'Teachability A')}</div>
          </article>
          <article><h3>Package B</h3><pre>${escapeHtml(JSON.stringify(caseRow.B, null, 2))}</pre>
            <div class="ratings">${ratingSelect(`factualCorrectnessB-${index}`, 'Factual correctness B')}${ratingSelect(`teachabilityB-${index}`, 'Teachability B')}</div>
          </article>
        </div>
        <fieldset><legend>Your judgment</legend>
          ${['A', 'B', 'tie', 'both-bad'].map((choice) => `<label class="choice"><input type="radio" name="choice-${index}" value="${choice}" required> ${choice === 'both-bad' ? 'Both need substantial repair' : choice === 'tie' ? 'Tie' : `Package ${choice}`}</label>`).join('')}
        </fieldset>
        <label class="rationale">Concrete rationale (30 characters minimum)<textarea name="rationale-${index}" minlength="30" required placeholder="Name the factual or teaching-quality evidence that determined your judgment."></textarea></label>
      </section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scion blind review — ${escapeHtml(domain)}</title>
<style>
:root{color-scheme:light;--ink:#17223b;--muted:#5d6880;--line:#d6ddeb;--panel:#f5f7fb;--accent:#2356a8;--good:#176b50}*{box-sizing:border-box}body{margin:0;background:#eef2f8;color:var(--ink);font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1120px;margin:0 auto;padding:32px 20px 80px}header,.case-card,.reviewer{background:white;border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 28px #1e315414}header,.reviewer,.case-card{padding:24px;margin-bottom:22px}h1{margin:0 0 8px;font-size:clamp(28px,4vw,44px)}h2{font-size:17px;margin:18px 0 6px}h3{margin-top:0}.lede,.kind,.privacy{color:var(--muted)}.privacy{border-left:4px solid var(--good);padding-left:12px}.reviewer-grid,.packages,.ratings{display:grid;gap:16px}.reviewer-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.packages{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}.packages article{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}.ratings{grid-template-columns:1fr 1fr}.case-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.case-heading span{font-weight:750;font-size:18px}.case-heading code{font-size:12px;color:var(--muted)}label{display:grid;gap:6px;font-weight:650}input[type=text],select,textarea{width:100%;font:inherit;border:1px solid #aab5c8;border-radius:8px;padding:10px;background:white}textarea{min-height:110px;resize:vertical}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;border:1px solid var(--line);border-radius:8px;padding:14px;font-size:13px}fieldset{margin:18px 0;border:1px solid var(--line);border-radius:10px;padding:14px}.choice{display:inline-flex;align-items:center;margin:5px 18px 5px 0;font-weight:550}.choice input{margin-right:7px}.attestation{display:flex;align-items:flex-start;gap:10px;font-weight:600}.attestation input{margin-top:5px}.actions{position:sticky;bottom:16px;background:#17223bee;color:white;border-radius:14px;padding:14px 18px;display:flex;gap:14px;align-items:center;justify-content:space-between;box-shadow:0 8px 30px #10192d55}.actions button{border:0;border-radius:9px;background:white;color:var(--accent);font:700 16px system-ui;padding:11px 18px;cursor:pointer}.status{font-size:14px}@media(max-width:650px){main{padding:16px 10px 70px}.packages{grid-template-columns:1fr}.ratings{grid-template-columns:1fr}.case-heading{align-items:flex-start;flex-direction:column}.actions{align-items:stretch;flex-direction:column}.actions button{width:100%}}
</style></head><body><main>
<header><p class="kind">Independent instructor benchmark · ${escapeHtml(domain)}</p><h1>Blind atom review</h1><p class="lede">Review A and B on their own merits. Do not try to identify the system that produced either package.</p><p class="privacy">This page is self-contained and makes no network requests. Draft answers stay in this browser. The final button downloads a JSON file for you to return to the organizer.</p></header>
<form id="review-form"><section class="reviewer"><h2>Reviewer eligibility</h2><div class="reviewer-grid"><label>Pseudonymous reviewer ID<input type="text" name="reviewerId" minlength="3" required placeholder="Example: ux-instructor-07"></label><label>Domain<input type="text" value="${escapeHtml(domain)}" disabled></label></div><p>Complete this form only if you are a working instructor who currently teaches ${escapeHtml(domain)}.</p><label class="attestation"><input type="checkbox" name="attestation" required> I attest that I currently teach this domain, completed this review independently, and have no conflict of interest with either package.</label></section>
${cards}
<div class="actions"><span class="status" id="status">Draft saves locally as you work.</span><button type="submit">Download completed review JSON</button></div></form>
<script id="review-packet" type="application/json">${safeJsonForHtml(packet)}</script>
<script>
(() => { const packet=JSON.parse(document.getElementById('review-packet').textContent); const form=document.getElementById('review-form'); const status=document.getElementById('status'); const storageKey='scion-blind-review:'+packet.packetId+':'+packet.domain;
const controls=()=>[...form.querySelectorAll('input[name],select[name],textarea[name]')];
function saveDraft(){const draft={};for(const control of controls()){if(control.type==='radio'){if(control.checked)draft[control.name]=control.value}else if(control.type==='checkbox')draft[control.name]=control.checked;else draft[control.name]=control.value}try{localStorage.setItem(storageKey,JSON.stringify(draft));status.textContent='Draft saved locally.'}catch{status.textContent='Draft could not be saved; keep this page open.'}}
function restoreDraft(){try{const draft=JSON.parse(localStorage.getItem(storageKey)||'{}');for(const control of controls()){if(!(control.name in draft))continue;if(control.type==='radio')control.checked=draft[control.name]===control.value;else if(control.type==='checkbox')control.checked=draft[control.name]===true;else control.value=draft[control.name]}}catch{}}
form.addEventListener('input',saveDraft);restoreDraft();
form.addEventListener('submit',(event)=>{event.preventDefault();if(!form.reportValidity()){status.textContent='Complete every rating, judgment, rationale, and attestation.';return}const reviewerId=form.elements.reviewerId.value.trim();const reviewedAt=new Date().toISOString();const rows=packet.templates.map((template,index)=>({...template,reviewerId,reviewerDomain:packet.domain,disciplineFamiliarity:'teaches-domain',independent:true,conflictOfInterest:false,reviewedAt,choice:form.querySelector('[name="choice-'+index+'"]:checked').value,factualCorrectnessA:Number(form.elements['factualCorrectnessA-'+index].value),factualCorrectnessB:Number(form.elements['factualCorrectnessB-'+index].value),teachabilityA:Number(form.elements['teachabilityA-'+index].value),teachabilityB:Number(form.elements['teachabilityB-'+index].value),rationale:form.elements['rationale-'+index].value.trim(),attestation:true}));const blob=new Blob([JSON.stringify(rows,null,2)+'\\n'],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='scion-review-'+packet.domain+'-'+reviewerId.replace(/[^a-z0-9_-]+/gi,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);status.textContent='Review JSON downloaded. Return it to the organizer.'}); })();
</script></main></body></html>`;
}

export async function buildScionBlindReviewPacket({
  sources = DEFAULT_SOURCES,
  outputDir = DEFAULT_OUTPUT,
  limit = 50,
} = {}) {
  const loaded = (await Promise.all(sources.map(readRows))).flat();
  const seen = new Set();
  const candidates = [];
  for (const { row, source, line } of loaded) {
    if (!['mc-item', 'key-term'].includes(row?.kind)) continue;
    const domain = canonicalDomain(row.domain || row.courseId);
    if (!domain) continue;
    const neutral =
      Object.prototype.hasOwnProperty.call(row, 'left') && Object.prototype.hasOwnProperty.call(row, 'right');
    const firstRole = neutral ? 'left' : 'chosen';
    const secondRole = neutral ? 'right' : 'rejected';
    const first = parseJson(row[firstRole]);
    const second = parseJson(row[secondRole]);
    if (!String(row.prompt || '').trim() || !first || !second) continue;
    if (!payloadAssessment(row.kind, first).eligible) continue;
    if (neutral && !payloadAssessment(row.kind, second).eligible) continue;
    const pairId = stablePairId(row);
    if (seen.has(pairId)) continue;
    seen.add(pairId);
    candidates.push({
      pairId,
      domain,
      lessonId: String(row.lessonId || ''),
      kind: row.kind,
      prompt: row.prompt,
      first,
      second,
      firstRole,
      secondRole,
      source,
      line,
      sourceRow: row,
    });
  }

  const selected = roundRobin(candidates, Math.max(1, Number(limit) || 50));
  const cases = [];
  const keys = [];
  for (const candidate of selected) {
    const flip = Number.parseInt(hash(`${candidate.pairId}|scion-review-v1`).slice(0, 2), 16) % 2 === 1;
    const sides = flip
      ? {
          A: candidate.second,
          B: candidate.first,
          mapping: { A: candidate.secondRole, B: candidate.firstRole },
        }
      : {
          A: candidate.first,
          B: candidate.second,
          mapping: { A: candidate.firstRole, B: candidate.secondRole },
        };
    cases.push({
      pairId: candidate.pairId,
      domain: candidate.domain,
      lessonId: candidate.lessonId,
      kind: candidate.kind,
      prompt: candidate.prompt,
      A: sides.A,
      B: sides.B,
    });
    keys.push({
      pairId: candidate.pairId,
      mapping: sides.mapping,
      source: candidate.source,
      line: candidate.line,
      domain: candidate.domain,
      sourceRow: candidate.sourceRow,
    });
  }

  const domains = [...new Set(cases.map((row) => row.domain))].sort();
  const domainCounts = Object.fromEntries(
    domains.map((domain) => [domain, cases.filter((row) => row.domain === domain).length]),
  );
  const kindCounts = Object.fromEntries(
    ['mc-item', 'key-term'].map((kind) => [kind, cases.filter((row) => row.kind === kind).length]),
  );
  const packetId = `scion-review-${hash(cases.map((row) => row.pairId).join('|')).slice(0, 16)}`;
  const meta = {
    packetId,
    generatedAt: new Date().toISOString(),
    requestedCases: Number(limit) || 50,
    selectedCases: cases.length,
    availableCandidates: candidates.length,
    blind: true,
    requiredIndependentReviewsPerCase: 2,
    domains,
    domainCounts,
    kindCounts,
    domainCount: domains.length,
    targetDomainCount: 5,
    coverageStatus: domains.length >= 5 ? 'ready' : 'needs-more-domains',
  };
  const reviewerDir = path.join(outputDir, 'reviewer');
  const organizerDir = path.join(outputDir, 'organizer');
  await fs.rm(reviewerDir, { recursive: true, force: true });
  await Promise.all([fs.mkdir(reviewerDir, { recursive: true }), fs.mkdir(organizerDir, { recursive: true })]);
  await Promise.all(
    domains.map((domain) => fs.mkdir(path.join(reviewerDir, 'by-domain', domain), { recursive: true })),
  );
  const domainWrites = domains.flatMap((domain) => {
    const domainCases = cases.filter((entry) => entry.domain === domain);
    const domainDir = path.join(reviewerDir, 'by-domain', domain);
    return [
      fs.writeFile(
        path.join(domainDir, 'packet.json'),
        `${JSON.stringify({ meta: { ...meta, selectedCases: domainCases.length, domains: [domain] }, cases: domainCases }, null, 2)}\n`,
      ),
      fs.writeFile(
        path.join(domainDir, 'review-form-1.json'),
        `${JSON.stringify(
          domainCases.map((caseRow) => createBlankScionReview(caseRow, packetId)),
          null,
          2,
        )}\n`,
      ),
      fs.writeFile(
        path.join(domainDir, 'review-form-2.json'),
        `${JSON.stringify(
          domainCases.map((caseRow) => createBlankScionReview(caseRow, packetId)),
          null,
          2,
        )}\n`,
      ),
      fs.writeFile(path.join(domainDir, 'review.html'), buildScionReviewerHtml({ meta, domain, cases: domainCases })),
      fs.writeFile(
        path.join(domainDir, 'README.md'),
        `# Scion blind atom review — ${domain}\n\nOpen \`review.html\` in a browser. It is a self-contained offline form that saves a local draft and downloads ingestion-compatible JSON when complete. Review Package A and B without trying to identify their source. Complete this packet only if you are a working instructor who currently teaches ${domain}; the final attestation confirms current domain teaching, independent review, and no conflict of interest. For every case, score factual correctness and teachability from 1 to 5, choose A, B, tie, or both-bad, and give a concrete rationale of at least 30 characters. Two distinct domain-qualified instructors must agree on a winner, and both must score that side at least 4/5 on factual correctness and teachability before the pair can enter the curated corpus. The JSON templates remain available for reviewers who prefer to complete them directly.\n`,
      ),
    ];
  });
  await Promise.all([
    fs.writeFile(path.join(reviewerDir, 'packet.json'), `${JSON.stringify({ meta, cases }, null, 2)}\n`),
    fs.writeFile(
      path.join(reviewerDir, 'README.md'),
      `# Scion blind atom review\n\nThe full packet is an organizer overview. Send reviewers only the matching folder under by-domain/. Each domain folder includes a self-contained offline \`review.html\` page and JSON templates. A reviewer must be a working instructor who currently teaches that domain, complete the work independently, and declare no conflict of interest. For every case, score factual correctness and teachability from 1 to 5, choose A, B, tie, or both-bad, and give a concrete rationale of at least 30 characters. Two distinct domain-qualified instructors must agree on a winner, and both must score that side at least 4/5 on factual correctness and teachability before the pair can enter the curated corpus.\n`,
    ),
    fs.writeFile(path.join(organizerDir, 'key.json'), `${JSON.stringify({ meta, keys }, null, 2)}\n`),
    ...domainWrites,
  ]);
  return { meta, cases, keys };
}

async function readReviewFile(file) {
  const raw = await fs.readFile(file, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

export function validateScionBlindReview(review) {
  const issues = [];
  if (!String(review?.pairId || '').trim()) issues.push('missing-pair-id');
  if (!String(review?.reviewPacketId || '').trim()) issues.push('missing-review-packet-id');
  if (!String(review?.reviewerId || '').trim()) issues.push('missing-reviewer-id');
  if (!REVIEW_ROLES.has(review?.reviewerRole)) issues.push('reviewer-not-working-instructor');
  if (review?.disciplineFamiliarity !== 'teaches-domain') issues.push('reviewer-not-domain-teaching');
  if (!String(review?.reviewerDomain || '').trim()) issues.push('missing-reviewer-domain');
  if (review?.independent !== true) issues.push('review-not-independent');
  if (review?.conflictOfInterest !== false) issues.push('reviewer-conflict-not-cleared');
  if (!String(review?.reviewedAt || '').trim() || Number.isNaN(Date.parse(review.reviewedAt))) {
    issues.push('invalid-reviewed-at');
  }
  if (!REVIEW_CHOICES.has(review?.choice)) issues.push('invalid-choice');
  for (const field of ['factualCorrectnessA', 'factualCorrectnessB', 'teachabilityA', 'teachabilityB']) {
    if (!Number.isInteger(review?.[field]) || review[field] < 1 || review[field] > 5) issues.push(`${field}-range`);
  }
  if (String(review?.rationale || '').trim().length < 30) issues.push('rationale-too-short');
  if (review?.attestation !== true) issues.push('missing-attestation');
  return issues;
}

export async function ingestScionBlindReviews({
  outputDir = DEFAULT_OUTPUT,
  reviewFiles = [],
  approvedOutput = DEFAULT_APPROVED,
} = {}) {
  const keyPacket = JSON.parse(await fs.readFile(path.join(outputDir, 'organizer', 'key.json'), 'utf8'));
  const keyById = new Map(keyPacket.keys.map((row) => [row.pairId, row]));
  const reviews = (await Promise.all(reviewFiles.map(readReviewFile))).flat();
  const grouped = new Map();
  const invalidReviews = [];
  for (const review of reviews) {
    const issues = validateScionBlindReview(review);
    const key = keyById.get(review?.pairId);
    if (!key) issues.push('unknown-pair-id');
    else {
      if (review?.reviewPacketId !== keyPacket.meta.packetId) issues.push('review-packet-id-mismatch');
      if (review?.domain !== key.domain) issues.push('review-case-domain-mismatch');
      if (review?.reviewerDomain !== key.domain) issues.push('reviewer-domain-mismatch');
    }
    if (issues.length > 0) {
      invalidReviews.push({ pairId: review?.pairId || '', reviewerId: review?.reviewerId || '', issues });
      continue;
    }
    if (!grouped.has(review.pairId)) grouped.set(review.pairId, []);
    grouped.get(review.pairId).push(review);
  }

  const approved = [];
  const quarantined = [];
  for (const [pairId, pairReviews] of grouped) {
    const unique = [...new Map(pairReviews.map((review) => [review.reviewerId, review])).values()];
    const choices = new Set(unique.map((review) => review.choice));
    if (unique.length < 2 || choices.size !== 1 || !['A', 'B'].includes(unique[0]?.choice)) {
      quarantined.push({ pairId, issues: ['missing-unanimous-independent-winner'] });
      continue;
    }
    const winner = unique[0].choice;
    const winnerRatingsClean = unique.every(
      (review) => review[`factualCorrectness${winner}`] >= 4 && review[`teachability${winner}`] >= 4,
    );
    if (!winnerRatingsClean) {
      quarantined.push({ pairId, issues: ['winning-side-below-quality-floor'] });
      continue;
    }
    const key = keyById.get(pairId);
    const winnerRole = key.mapping[winner];
    const loserSide = winner === 'A' ? 'B' : 'A';
    const loserRole = key.mapping[loserSide];
    const sourceRow = key.sourceRow;
    const row = {
      kind: sourceRow.kind,
      prompt: sourceRow.prompt,
      chosen: sourceRow[winnerRole],
      rejected: sourceRow[loserRole],
      courseId: sourceRow.courseId,
      lessonId: sourceRow.lessonId,
      reviewPacketId: keyPacket.meta.packetId,
      preferenceEvidence: {
        kind: 'blind-instructor-preference',
        verified: true,
        preferred: 'chosen',
        unanimous: true,
        reviewerIds: unique.map((review) => review.reviewerId),
        reviewerRoles: unique.map((review) => review.reviewerRole),
        reviewHashes: unique.map((review) => hash(JSON.stringify(review))),
        winningSideInBlindPacket: winner,
      },
    };
    const assessment = assessCorpusRow(row, approvedOutput);
    if (!assessment.eligible) {
      quarantined.push({ pairId, issues: assessment.issues });
      continue;
    }
    approved.push(row);
  }

  await fs.mkdir(path.dirname(approvedOutput), { recursive: true });
  await fs.writeFile(
    approvedOutput,
    approved.map((row) => JSON.stringify(row)).join('\n') + (approved.length ? '\n' : ''),
  );
  const report = {
    packetId: keyPacket.meta.packetId,
    reviewedCases: grouped.size,
    approved: approved.length,
    quarantined: quarantined.length,
    invalidReviews,
    quarantine: quarantined,
    approvedOutput,
  };
  await fs.writeFile(
    path.join(outputDir, 'organizer', 'ingestion-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function parseArgs(argv) {
  const args = {
    ingest: false,
    sources: [],
    outputDir: DEFAULT_OUTPUT,
    approvedOutput: DEFAULT_APPROVED,
    reviewFiles: [],
    limit: 50,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ingest') args.ingest = true;
    else if (arg === '--source') args.sources.push(argv[++index]);
    else if (arg === '--output') args.outputDir = argv[++index] || args.outputDir;
    else if (arg === '--approved-output') args.approvedOutput = argv[++index] || args.approvedOutput;
    else if (arg === '--review') args.reviewFiles.push(argv[++index]);
    else if (arg === '--limit') args.limit = Number(argv[++index]) || args.limit;
  }
  if (args.sources.length === 0) args.sources = DEFAULT_SOURCES;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ingest) {
    if (args.reviewFiles.length < 2) throw new Error('Provide two independent review files with --review.');
    const report = await ingestScionBlindReviews(args);
    console.log(`Scion blind reviews: ${report.approved} approved / ${report.quarantined} quarantined`);
    console.log(`Approved corpus: ${report.approvedOutput}`);
    return;
  }
  const packet = await buildScionBlindReviewPacket(args);
  console.log(`Scion blind review packet: ${packet.meta.selectedCases}/${packet.meta.requestedCases} cases`);
  console.log(`Domains: ${packet.meta.domains.join(', ') || 'none'} (${packet.meta.coverageStatus})`);
  console.log(`Reviewer folders: ${path.join(args.outputDir, 'reviewer', 'by-domain')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
