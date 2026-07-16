#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessCorpusRow } from './scionPreferenceCorpusAudit.mjs';
import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';
import { assessHistoricalScionKeyTerm } from './lib/scionHistoricalAdmission.mjs';
import { deriveScionCourseGroup, SHA256_PATTERN } from './lib/scionCourseGroup.mjs';

const DEFAULT_SOURCES = ['evaluation/scion-review-candidates.jsonl'];
const DEFAULT_OUTPUT = 'verification-output/scion-blind-review';
const DEFAULT_APPROVED = 'evaluation/scion-reviewed-preferences.jsonl';
const DEFAULT_HELD_OUT_BENCHMARK = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';
export const SCION_BLIND_ATOM_PACKET_PROTOCOL = 'scion-blind-atom-packet-v4';
const REVIEW_PROTOCOL = SCION_BLIND_ATOM_PACKET_PROTOCOL;
const INSTRUCTOR_REVIEW_PROTOCOL = 'scion-blind-instructor-review-v3';
const FOUNDER_REVIEW_PROTOCOL = 'scion-blind-founder-review-v1';
const REVIEW_ROLES = new Set(['working-instructor']);
const REVIEW_CHOICES = new Set(['A', 'B', 'tie', 'both-bad']);
const SHA256 = SHA256_PATTERN;

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

function stablePairId(row, courseGroupSha256) {
  const first = row.chosen ?? row.left;
  const second = row.rejected ?? row.right;
  return `scion-${hash(JSON.stringify({ courseGroupSha256, kind: row.kind, prompt: row.prompt, sourceContext: row.sourceContext || null, first, second })).slice(0, 20)}`;
}

function canonicalDomain(value) {
  const domain = String(value || '').trim();
  if (domain === 'cs-python') return 'computer-science';
  return domain;
}

function resolveCandidateCourseGroup(row, domain) {
  const group = deriveScionCourseGroup({
    domain,
    courseGroupId: row.courseGroupId || row.courseId,
    courseInputSha256: row.pairSource?.courseInputSha256 || row.courseInputSha256,
    prompt: row.prompt,
  });
  const declaredSha256 = String(row.courseGroupSha256 || '');
  return {
    ...group,
    valid: !declaredSha256 || declaredSha256 === group.sha256,
    declaredSha256,
  };
}

function payloadAssessment(kind, value, { semanticAdmission = true } = {}) {
  if (kind === 'mc-item') return assessScionMcItem(value, { semanticAdmission });
  if (kind === 'key-term') return semanticAdmission ? assessScionKeyTerm(value) : assessHistoricalScionKeyTerm(value);
  return { eligible: false, issues: ['unsupported-review-kind'] };
}

async function readRows(source) {
  try {
    const raw = await fs.readFile(source, 'utf8');
    const sourceSha256 = hash(raw);
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ row: JSON.parse(line), source, sourceSha256, line: index + 1 }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function readHeldOutBenchmark(file) {
  const raw = await fs.readFile(file, 'utf8');
  const benchmark = JSON.parse(raw);
  const domains = new Set(
    (Array.isArray(benchmark?.courses) ? benchmark.courses : [])
      .map((course) => canonicalDomain(course?.domain))
      .filter(Boolean),
  );
  if (domains.size === 0) throw new Error('Held-out benchmark must declare at least one course domain');
  return { path: file, sha256: hash(raw), domains };
}

export function publicCaseDigest(caseRow) {
  return hash(
    JSON.stringify({
      protocol: REVIEW_PROTOCOL,
      pairId: caseRow.pairId,
      domain: caseRow.domain,
      courseGroupSha256: caseRow.courseGroupSha256,
      lessonId: caseRow.lessonId,
      kind: caseRow.kind,
      prompt: caseRow.prompt,
      sourceContext: caseRow.sourceContext || null,
      A: caseRow.A,
      B: caseRow.B,
    }),
  );
}

export function organizerKeyDigest(keys) {
  return hash(
    JSON.stringify({
      protocol: REVIEW_PROTOCOL,
      keys: keys.map((key) => ({
        pairId: key.pairId,
        caseDigest: key.caseDigest,
        mapping: key.mapping,
        source: key.source,
        sourceSha256: key.sourceSha256,
        sourceRowSha256: key.sourceRowSha256,
        line: key.line,
        domain: key.domain,
        courseGroupId: key.courseGroupId,
        courseGroupSha256: key.courseGroupSha256,
        sourceRow: key.sourceRow,
      })),
    }),
  );
}

export function packetDigest(cases, organizerDigest) {
  return hash(JSON.stringify({ protocol: REVIEW_PROTOCOL, organizerDigest, cases }));
}

export function organizerKeyIntegrity(key) {
  if (!key?.case || key.caseDigest !== key.case.caseDigest || key.caseDigest !== publicCaseDigest(key.case)) {
    return false;
  }
  if (key.pairId !== key.case.pairId || key.domain !== key.case.domain) return false;
  if (!key.sourceRow || key.sourceRowSha256 !== hash(JSON.stringify(key.sourceRow))) return false;
  if (JSON.stringify(key.case.sourceContext || null) !== JSON.stringify(key.sourceRow.sourceContext || null))
    return false;
  if (!SHA256.test(String(key.sourceSha256 || ''))) return false;
  const group = resolveCandidateCourseGroup(key.sourceRow, key.domain);
  if (
    !group.valid ||
    key.courseGroupId !== group.id ||
    key.courseGroupSha256 !== group.sha256 ||
    key.case.courseGroupSha256 !== group.sha256
  ) {
    return false;
  }
  return ['A', 'B'].every((side) => {
    const role = key.mapping?.[side];
    if (!['left', 'right', 'chosen', 'rejected'].includes(role)) return false;
    return JSON.stringify(parseJson(key.sourceRow[role])) === JSON.stringify(key.case[side]);
  });
}

function roundRobin(candidates, limit) {
  const buckets = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.domain}|${candidate.courseGroupSha256}|${candidate.kind}`;
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

function sourceFirstRoundRobin(candidates, limit) {
  const sourceBacked = roundRobin(
    candidates.filter((candidate) => candidate.sourceContext),
    limit,
  );
  if (sourceBacked.length >= limit) return sourceBacked;
  const selectedIds = new Set(sourceBacked.map((candidate) => candidate.pairId));
  const fill = roundRobin(
    candidates.filter((candidate) => !selectedIds.has(candidate.pairId)),
    limit - sourceBacked.length,
  );
  return [...sourceBacked, ...fill];
}

export function createBlankScionReview(caseRow, reviewPacketId = '', reviewPacketDigest = '') {
  return {
    pairId: caseRow.pairId,
    caseDigest: caseRow.caseDigest,
    domain: caseRow.domain,
    courseGroupSha256: caseRow.courseGroupSha256,
    reviewPacketId,
    reviewPacketDigest,
    reviewProtocol: INSTRUCTOR_REVIEW_PROTOCOL,
    evidenceClass: 'qualified-human',
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

export function createBlankScionFounderReview(caseRow, reviewPacketId = '', reviewPacketDigest = '') {
  return {
    pairId: caseRow.pairId,
    caseDigest: caseRow.caseDigest,
    domain: caseRow.domain,
    courseGroupSha256: caseRow.courseGroupSha256,
    reviewPacketId,
    reviewPacketDigest,
    reviewProtocol: FOUNDER_REVIEW_PROTOCOL,
    evidenceClass: 'founder-review',
    reviewerId: '',
    reviewerRole: 'product-founder',
    reviewerDomain: '',
    disciplineFamiliarity: 'self-declared',
    independent: false,
    conflictOfInterest: true,
    claimEligible: false,
    claimBoundary:
      'Founder review can guide research and compiler repair, but it is not independent instructor evidence and cannot promote an adapter.',
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

function sourceContextHtml(sourceContext) {
  if (!sourceContext) return '';
  const claims = (sourceContext.claims || [])
    .map((claim, index) => `<li><span>${index + 1}</span>${escapeHtml(claim)}</li>`)
    .join('');
  const attribution = (sourceContext.attribution || []).map(escapeHtml).join(' · ');
  return `<aside class="source-context"><h2>Neutral source claims</h2><p>Judge both packages against these same supplied claims.</p><ol>${claims}</ol><small>${escapeHtml(sourceContext.term || sourceContext.kernelId)} · ${escapeHtml(sourceContext.license)}${attribution ? ` · ${attribution}` : ''}</small></aside>`;
}

export function buildScionReviewerHtml({ meta, domain, cases, mode = 'instructor' }) {
  const founderMode = mode === 'founder';
  const templates = cases.map((caseRow) =>
    founderMode
      ? createBlankScionFounderReview(caseRow, meta.packetId, meta.packetDigest)
      : createBlankScionReview(caseRow, meta.packetId, meta.packetDigest),
  );
  const packet = {
    packetId: meta.packetId,
    domain,
    cases,
    templates,
    reviewMode: founderMode ? 'founder' : 'instructor',
  };
  const pageCopy = founderMode
    ? {
        eyebrow: `Founder research · ${domain}`,
        heading: 'Blind founder review',
        lede: 'Judge A and B without the organizer key or model-judge results. This evidence can guide Scion research, but it cannot promote an adapter.',
        sectionHeading: 'Review provenance',
        reviewerPlaceholder: 'Example: founder-reviewer-01',
        eligibility: `You do not need to claim that you teach ${domain}. Record your real familiarity in the rationale when it affects a decision.`,
        attestation:
          'I completed this review without seeing the organizer key or model-judge decisions, and I understand that founder review is non-independent research evidence.',
      }
    : {
        eyebrow: `Independent instructor benchmark · ${domain}`,
        heading: 'Blind atom review',
        lede: 'Review A and B on their own merits. Do not try to identify the system that produced either package.',
        sectionHeading: 'Reviewer eligibility',
        reviewerPlaceholder: 'Example: ux-instructor-07',
        eligibility: `Complete this form only if you are a working instructor who currently teaches ${domain}.`,
        attestation:
          'I attest that I currently teach this domain, completed this review independently, and have no conflict of interest with either package.',
      };
  const cards = cases
    .map(
      (caseRow, index) => `<section class="case-card" data-case-index="${index}"${index === 0 ? '' : ' hidden'}>
        <div class="case-heading"><span>Case ${index + 1} of ${cases.length}</span><code>${escapeHtml(caseRow.pairId)}</code></div>
        <p class="kind">${escapeHtml(caseRow.kind === 'mc-item' ? 'Multiple-choice item' : 'Key term')}</p>
        <h2>Prompt</h2><p class="prompt">${escapeHtml(caseRow.prompt)}</p>
        ${sourceContextHtml(caseRow.sourceContext)}
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
:root{color-scheme:light;--ink:#17223b;--muted:#5d6880;--line:#d6ddeb;--panel:#f5f7fb;--accent:#2356a8;--good:#176b50}*{box-sizing:border-box}body{margin:0;background:#eef2f8;color:var(--ink);font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1120px;margin:0 auto;padding:32px 20px 80px}header,.case-card,.reviewer{background:white;border:1px solid var(--line);border-radius:16px;box-shadow:0 8px 28px #1e315414}header,.reviewer,.case-card{padding:24px;margin-bottom:22px}h1{margin:0 0 8px;font-size:clamp(28px,4vw,44px)}h2{font-size:17px;margin:18px 0 6px}h3{margin-top:0}.lede,.kind,.privacy{color:var(--muted)}.privacy{border-left:4px solid var(--good);padding-left:12px}.source-context{background:#f2f7f5;border:1px solid #b9d8cd;border-radius:12px;margin:18px 0;padding:16px}.source-context h2{margin-top:0}.source-context p,.source-context small{color:var(--muted)}.source-context ol{display:grid;gap:8px;padding:0;list-style:none}.source-context li{display:grid;grid-template-columns:24px 1fr;gap:8px}.source-context li span{align-items:center;background:#d8eee6;border-radius:50%;display:flex;font-size:12px;font-weight:750;height:22px;justify-content:center}.reviewer-grid,.packages,.ratings{display:grid;gap:16px}.reviewer-grid{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.packages{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}.packages article{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px}.ratings{grid-template-columns:1fr 1fr}.case-heading{display:flex;justify-content:space-between;gap:16px;align-items:center}.case-heading span{font-weight:750;font-size:18px}.case-heading code{font-size:12px;color:var(--muted)}label{display:grid;gap:6px;font-weight:650}input[type=text],select,textarea{width:100%;font:inherit;border:1px solid #aab5c8;border-radius:8px;padding:10px;background:white}textarea{min-height:110px;resize:vertical}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;border:1px solid var(--line);border-radius:8px;padding:14px;font-size:13px}fieldset{margin:18px 0;border:1px solid var(--line);border-radius:10px;padding:14px}.choice{display:inline-flex;align-items:center;margin:5px 18px 5px 0;font-weight:550}.choice input{margin-right:7px}.attestation{display:flex;align-items:flex-start;gap:10px;font-weight:600}.attestation input{margin-top:5px}.actions{position:sticky;bottom:16px;background:#17223bee;color:white;border-radius:14px;padding:14px 18px;display:flex;gap:14px;align-items:center;justify-content:space-between;box-shadow:0 8px 30px #10192d55}.actions button{border:0;border-radius:9px;background:white;color:var(--accent);font:700 16px system-ui;padding:11px 18px;cursor:pointer}.status{font-size:14px}@media(max-width:650px){main{padding:16px 10px 70px}.packages{grid-template-columns:1fr}.ratings{grid-template-columns:1fr}.case-heading{align-items:flex-start;flex-direction:column}.actions{align-items:stretch;flex-direction:column}.actions button{width:100%}}
</style><style>
[hidden]{display:none!important}.review-progress{display:grid;gap:8px;margin-top:18px}.progress-track{height:8px;background:#dfe6f1;border-radius:999px;overflow:hidden}.progress-fill{height:100%;width:0;background:var(--good);transition:width .2s ease}.case-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.case-nav button,.case-nav select{border:1px solid #d7deea;border-radius:8px;background:white;color:var(--ink);font:650 14px system-ui;padding:9px 12px}.case-nav button{cursor:pointer}.case-nav button:disabled{cursor:not-allowed;opacity:.45}.case-nav .flagged{background:#fff3cf;border-color:#dba900;color:#6b4c00}.actions-copy{display:grid;gap:2px}.actions-copy strong{font-size:14px}.actions-copy .status{color:#e7edf8}.actions .case-nav{justify-content:flex-end}.actions .primary{background:white;color:var(--accent)}@media(max-width:650px){.actions .case-nav{display:grid;grid-template-columns:1fr 1fr;width:100%}.actions .case-nav select,.actions .case-nav .primary{grid-column:1/-1;width:100%}}
</style></head><body><main>
<header><p class="kind">${escapeHtml(pageCopy.eyebrow)}</p><h1>${escapeHtml(pageCopy.heading)}</h1><p class="lede">${escapeHtml(pageCopy.lede)}</p><p class="privacy">This page is self-contained and makes no network requests. Draft answers stay in this browser. The final button downloads a JSON file for you to return to the organizer.</p><div class="review-progress"><strong id="progress-label">Case 1 of ${cases.length} · 0 complete</strong><div class="progress-track" aria-hidden="true"><div class="progress-fill" id="progress-fill"></div></div></div></header>
<form id="review-form"><section class="reviewer"><h2>${escapeHtml(pageCopy.sectionHeading)}</h2><div class="reviewer-grid"><label>Pseudonymous reviewer ID<input type="text" name="reviewerId" minlength="3" required placeholder="${escapeHtml(pageCopy.reviewerPlaceholder)}"></label><label>Domain<input type="text" value="${escapeHtml(domain)}" disabled></label></div><p>${escapeHtml(pageCopy.eligibility)}</p><label class="attestation"><input type="checkbox" name="attestation" required> ${escapeHtml(pageCopy.attestation)}</label></section>
${cards}
<div class="actions"><div class="actions-copy"><strong id="case-state">Case 1 of ${cases.length}</strong><span class="status" id="status">Draft saves locally as you work.</span></div><div class="case-nav"><button type="button" id="previous-case">Back</button><button type="button" id="flag-case">Flag for later</button><select id="case-jump" aria-label="Jump to case">${cases.map((_, index) => `<option value="${index}">Case ${index + 1}</option>`).join('')}</select><button type="button" class="primary" id="next-case">Next case</button><button type="submit" class="primary" id="download-review" hidden>Download completed review JSON</button></div></div></form>
<script id="review-packet" type="application/json">${safeJsonForHtml(packet)}</script>
<script>
(() => {
  const packet = JSON.parse(document.getElementById('review-packet').textContent);
  const form = document.getElementById('review-form');
  const status = document.getElementById('status');
  const cards = [...form.querySelectorAll('.case-card')];
  const previousButton = document.getElementById('previous-case');
  const nextButton = document.getElementById('next-case');
  const flagButton = document.getElementById('flag-case');
  const jumpSelect = document.getElementById('case-jump');
  const downloadButton = document.getElementById('download-review');
  const progressLabel = document.getElementById('progress-label');
  const progressFill = document.getElementById('progress-fill');
  const caseState = document.getElementById('case-state');
  const storageKey = 'scion-blind-review:' + packet.reviewMode + ':' + packet.packetId + ':' + packet.domain;
  const flaggedCases = new Set();
  let activeCase = 0;

  const controls = () => [...form.querySelectorAll('input[name],select[name],textarea[name]')];
  const caseControl = (name, index) => form.elements[name + '-' + index];
  const selectedChoice = (index) => form.querySelector('[name="choice-' + index + '"]:checked');
  const caseComplete = (index) =>
    ['factualCorrectnessA', 'factualCorrectnessB', 'teachabilityA', 'teachabilityB'].every(
      (name) => Boolean(caseControl(name, index)?.value),
    ) &&
    Boolean(selectedChoice(index)) &&
    String(caseControl('rationale', index)?.value || '').trim().length >= 30;

  function saveDraft(message = 'Draft saved locally.') {
    const draft = { __activeCase: activeCase, __flaggedCases: [...flaggedCases] };
    for (const control of controls()) {
      if (control.type === 'radio') {
        if (control.checked) draft[control.name] = control.value;
      } else if (control.type === 'checkbox') draft[control.name] = control.checked;
      else draft[control.name] = control.value;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      status.textContent = message;
    } catch {
      status.textContent = 'Draft could not be saved; keep this page open.';
    }
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(localStorage.getItem(storageKey) || '{}');
      for (const control of controls()) {
        if (!(control.name in draft)) continue;
        if (control.type === 'radio') control.checked = draft[control.name] === control.value;
        else if (control.type === 'checkbox') control.checked = draft[control.name] === true;
        else control.value = draft[control.name];
      }
      activeCase = Math.max(0, Math.min(cards.length - 1, Number(draft.__activeCase) || 0));
      for (const index of Array.isArray(draft.__flaggedCases) ? draft.__flaggedCases : []) {
        if (Number.isInteger(index) && index >= 0 && index < cards.length) flaggedCases.add(index);
      }
    } catch {}
  }

  function render() {
    cards.forEach((card, index) => {
      card.hidden = index !== activeCase;
      card.dataset.complete = caseComplete(index) ? 'true' : 'false';
    });
    const completeCount = cards.filter((_, index) => caseComplete(index)).length;
    const percentage = cards.length ? Math.round((completeCount / cards.length) * 100) : 0;
    progressLabel.textContent =
      'Case ' + (activeCase + 1) + ' of ' + cards.length + ' · ' + completeCount + ' complete';
    progressFill.style.width = percentage + '%';
    caseState.textContent =
      'Case ' + (activeCase + 1) + ' of ' + cards.length + (flaggedCases.has(activeCase) ? ' · flagged' : '');
    previousButton.disabled = activeCase === 0;
    nextButton.hidden = activeCase === cards.length - 1;
    downloadButton.hidden = activeCase !== cards.length - 1;
    jumpSelect.value = String(activeCase);
    flagButton.textContent = flaggedCases.has(activeCase) ? 'Remove flag' : 'Flag for later';
    flagButton.classList.toggle('flagged', flaggedCases.has(activeCase));
  }

  function showCase(index, message = '') {
    activeCase = Math.max(0, Math.min(cards.length - 1, Number(index) || 0));
    render();
    saveDraft(message || 'Draft saved locally.');
    cards[activeCase]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('input', () => {
    saveDraft();
    render();
  });
  previousButton.addEventListener('click', () => showCase(activeCase - 1));
  nextButton.addEventListener('click', () => {
    if (!caseComplete(activeCase) && !flaggedCases.has(activeCase)) {
      status.textContent = 'Complete this case or flag it for later before continuing.';
      return;
    }
    showCase(activeCase + 1);
  });
  flagButton.addEventListener('click', () => {
    if (flaggedCases.has(activeCase)) flaggedCases.delete(activeCase);
    else flaggedCases.add(activeCase);
    saveDraft(flaggedCases.has(activeCase) ? 'Case flagged for later.' : 'Flag removed.');
    render();
  });
  jumpSelect.addEventListener('change', () => showCase(Number(jumpSelect.value)));
  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (event.key === 'ArrowLeft') showCase(activeCase - 1);
    if (event.key === 'ArrowRight' && activeCase < cards.length - 1) showCase(activeCase + 1);
  });

  restoreDraft();
  render();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const incomplete = cards.findIndex((_, index) => !caseComplete(index));
    if (incomplete !== -1) {
      showCase(incomplete, 'Finish every case before downloading. The first incomplete case is open.');
      return;
    }
    if (!form.reportValidity()) {
      status.textContent = 'Add a reviewer ID and complete the provenance attestation.';
      return;
    }
    const reviewerId = form.elements.reviewerId.value.trim();
    const reviewedAt = new Date().toISOString();
    const rows = packet.templates.map((template, index) => ({
      ...template,
      reviewerId,
      reviewerDomain: packet.domain,
      disciplineFamiliarity: packet.reviewMode === 'founder' ? 'self-declared' : 'teaches-domain',
      independent: packet.reviewMode === 'instructor',
      conflictOfInterest: packet.reviewMode === 'founder',
      reviewedAt,
      choice: selectedChoice(index).value,
      factualCorrectnessA: Number(caseControl('factualCorrectnessA', index).value),
      factualCorrectnessB: Number(caseControl('factualCorrectnessB', index).value),
      teachabilityA: Number(caseControl('teachabilityA', index).value),
      teachabilityB: Number(caseControl('teachabilityB', index).value),
      rationale: caseControl('rationale', index).value.trim(),
      attestation: true,
    }));
    const blob = new Blob([JSON.stringify(rows, null, 2) + '\\n'], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download =
      'scion-' +
      (packet.reviewMode === 'founder' ? 'founder-review-' : 'review-') +
      packet.domain +
      '-' +
      reviewerId.replace(/[^a-z0-9_-]+/gi, '-') +
      '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    status.textContent =
      packet.reviewMode === 'founder'
        ? 'Founder-review JSON downloaded. This remains non-independent research evidence.'
        : 'Review JSON downloaded. Return it to the organizer.';
  });
})();
</script></main></body></html>`;
}

export async function buildScionBlindReviewPacket({
  sources = DEFAULT_SOURCES,
  outputDir = DEFAULT_OUTPUT,
  limit = 50,
  perDomainLimit = 0,
  heldOutBenchmark = DEFAULT_HELD_OUT_BENCHMARK,
  receiptOutput,
  requireSourceContext = false,
  generatedAt = new Date().toISOString(),
  semanticAdmission = true,
} = {}) {
  const [loadedRows, benchmark] = await Promise.all([
    Promise.all(sources.map(readRows)).then((rows) => rows.flat()),
    readHeldOutBenchmark(heldOutBenchmark),
  ]);
  const loaded = loadedRows;
  const seen = new Set();
  const candidates = [];
  const excludedHeldOut = {};
  const excludedInvalidCourseGroups = [];
  for (const { row, source, sourceSha256, line } of loaded) {
    if (!['mc-item', 'key-term'].includes(row?.kind)) continue;
    const domain = canonicalDomain(row.domain || row.courseId);
    if (!domain) continue;
    if (benchmark.domains.has(domain)) {
      excludedHeldOut[domain] = (excludedHeldOut[domain] || 0) + 1;
      continue;
    }
    const neutral =
      Object.prototype.hasOwnProperty.call(row, 'left') && Object.prototype.hasOwnProperty.call(row, 'right');
    const firstRole = neutral ? 'left' : 'chosen';
    const secondRole = neutral ? 'right' : 'rejected';
    const first = parseJson(row[firstRole]);
    const second = parseJson(row[secondRole]);
    if (!String(row.prompt || '').trim() || !first || !second) continue;
    if (!payloadAssessment(row.kind, first, { semanticAdmission }).eligible) continue;
    if (neutral && !payloadAssessment(row.kind, second, { semanticAdmission }).eligible) continue;
    const courseGroup = resolveCandidateCourseGroup(row, domain);
    if (!courseGroup.valid) {
      excludedInvalidCourseGroups.push({
        source,
        line,
        courseGroupId: courseGroup.id,
        declaredSha256: courseGroup.declaredSha256,
        expectedSha256: courseGroup.sha256,
      });
      continue;
    }
    const pairId = stablePairId(row, courseGroup.sha256);
    if (seen.has(pairId)) continue;
    seen.add(pairId);
    candidates.push({
      pairId,
      domain,
      courseGroupId: courseGroup.id,
      courseGroupSha256: courseGroup.sha256,
      courseGroupSource: courseGroup.source,
      lessonId: String(row.lessonId || ''),
      kind: row.kind,
      prompt: row.prompt,
      sourceContext: row.sourceContext || null,
      first,
      second,
      firstRole,
      secondRole,
      source,
      sourceSha256,
      sourceRowSha256: hash(JSON.stringify(row)),
      line,
      sourceRow: row,
    });
  }

  const selectionCandidates = requireSourceContext
    ? candidates.filter((candidate) => candidate.sourceContext)
    : candidates;
  const candidateDomains = [...new Set(selectionCandidates.map((candidate) => candidate.domain))].sort();
  const requestedCases =
    Number(perDomainLimit) > 0 ? candidateDomains.length * Number(perDomainLimit) : Number(limit) || 50;
  const selected =
    Number(perDomainLimit) > 0
      ? candidateDomains.flatMap((domain) =>
          sourceFirstRoundRobin(
            selectionCandidates.filter((candidate) => candidate.domain === domain),
            Number(perDomainLimit),
          ),
        )
      : sourceFirstRoundRobin(selectionCandidates, Math.max(1, Number(limit) || 50));
  if (requireSourceContext && selected.length !== requestedCases) {
    throw new Error(
      `Source-only review packet is incomplete: selected ${selected.length}/${requestedCases} admissible cases`,
    );
  }
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
    const caseRow = {
      pairId: candidate.pairId,
      domain: candidate.domain,
      courseGroupSha256: candidate.courseGroupSha256,
      lessonId: candidate.lessonId,
      kind: candidate.kind,
      prompt: candidate.prompt,
      ...(candidate.sourceContext ? { sourceContext: candidate.sourceContext } : {}),
      A: sides.A,
      B: sides.B,
    };
    caseRow.caseDigest = publicCaseDigest(caseRow);
    cases.push(caseRow);
    keys.push({
      pairId: candidate.pairId,
      caseDigest: caseRow.caseDigest,
      case: caseRow,
      mapping: sides.mapping,
      source: candidate.source,
      sourceSha256: candidate.sourceSha256,
      sourceRowSha256: candidate.sourceRowSha256,
      line: candidate.line,
      domain: candidate.domain,
      courseGroupId: candidate.courseGroupId,
      courseGroupSha256: candidate.courseGroupSha256,
      courseGroupSource: candidate.courseGroupSource,
      sourceRow: candidate.sourceRow,
    });
  }

  const domains = [...new Set(cases.map((row) => row.domain))].sort();
  const domainCounts = Object.fromEntries(
    domains.map((domain) => [domain, cases.filter((row) => row.domain === domain).length]),
  );
  const selectedCourseGroups = [
    ...new Map(
      keys.map((key) => [
        key.courseGroupSha256,
        {
          domain: key.domain,
          courseGroupId: key.courseGroupId,
          courseGroupSha256: key.courseGroupSha256,
        },
      ]),
    ).values(),
  ].sort((left, right) =>
    `${left.domain}|${left.courseGroupId}`.localeCompare(`${right.domain}|${right.courseGroupId}`),
  );
  const domainGroupCounts = Object.fromEntries(
    domains.map((domain) => [domain, selectedCourseGroups.filter((group) => group.domain === domain).length]),
  );
  const kindCounts = Object.fromEntries(
    ['mc-item', 'key-term'].map((kind) => [kind, cases.filter((row) => row.kind === kind).length]),
  );
  const availableSourceContextCandidates = candidates.filter((candidate) => candidate.sourceContext).length;
  const selectedSourceContextCases = cases.filter((row) => row.sourceContext).length;
  const sourceContextDomainCounts = Object.fromEntries(
    domains.map((domain) => [domain, cases.filter((row) => row.domain === domain && row.sourceContext).length]),
  );
  const sourceContextKindCounts = Object.fromEntries(
    ['mc-item', 'key-term'].map((kind) => [kind, cases.filter((row) => row.kind === kind && row.sourceContext).length]),
  );
  const reviewOrganizerDigest = organizerKeyDigest(keys);
  const reviewPacketDigest = packetDigest(cases, reviewOrganizerDigest);
  const packetId = `scion-review-${reviewPacketDigest.slice(0, 20)}`;
  const targetResearchDomainCount = 4;
  const targetDomainCount = 5;
  const targetCourseGroupsPerDomain = 3;
  const researchDomainCoverageStatus = domains.length >= targetResearchDomainCount ? 'ready' : 'needs-more-domains';
  const domainCoverageStatus = domains.length >= targetDomainCount ? 'ready' : 'needs-more-domains';
  const groupCoverageStatus =
    domains.length > 0 && Object.values(domainGroupCounts).every((count) => count >= targetCourseGroupsPerDomain)
      ? 'ready'
      : 'needs-more-course-groups';
  const combinedCoverageStatus = (domainStatus) =>
    domainStatus === 'ready' && groupCoverageStatus === 'ready'
      ? 'ready'
      : domainStatus !== 'ready' && groupCoverageStatus !== 'ready'
        ? 'needs-more-domains-and-course-groups'
        : domainStatus !== 'ready'
          ? domainStatus
          : groupCoverageStatus;
  const researchCoverageStatus = combinedCoverageStatus(researchDomainCoverageStatus);
  const coverageStatus = combinedCoverageStatus(domainCoverageStatus);
  const meta = {
    protocol: REVIEW_PROTOCOL,
    packetId,
    packetDigest: reviewPacketDigest,
    organizerDigest: reviewOrganizerDigest,
    generatedAt: generatedAt || new Date().toISOString(),
    requestedCases,
    perDomainLimit: Number(perDomainLimit) > 0 ? Number(perDomainLimit) : null,
    selectedCases: cases.length,
    availableCandidates: candidates.length,
    selectionEligibleCandidates: selectionCandidates.length,
    requireSourceContext,
    excludedMissingSourceContext: requireSourceContext
      ? candidates.filter((candidate) => !candidate.sourceContext).length
      : 0,
    availableSourceContextCandidates,
    selectedSourceContextCases,
    sourceContextDomainCounts,
    sourceContextKindCounts,
    blind: true,
    primaryPreferenceEvidence: 'single-model-judge',
    requiredModelJudgeOrdersPerCase: 2,
    requiredIndependentReviewsPerCase: 2,
    domains,
    domainCounts,
    courseGroupCount: selectedCourseGroups.length,
    domainGroupCounts,
    targetCourseGroupsPerDomain,
    groupCoverageStatus,
    kindCounts,
    domainCount: domains.length,
    targetResearchDomainCount,
    researchDomainCoverageStatus,
    researchCoverageStatus,
    researchCampaignReady: researchCoverageStatus === 'ready',
    targetDomainCount,
    domainCoverageStatus,
    coverageStatus,
    campaignReady: coverageStatus === 'ready',
    heldOutBenchmark: {
      path: benchmark.path,
      sha256: benchmark.sha256,
      domains: [...benchmark.domains].sort(),
      excluded: excludedHeldOut,
      excludedCount: Object.values(excludedHeldOut).reduce((sum, count) => sum + count, 0),
    },
    excludedInvalidCourseGroups,
    sourceFiles: [...new Map(loaded.map((entry) => [entry.source, entry.sourceSha256])).entries()]
      .map(([source, sha256]) => ({ source, sha256 }))
      .sort((left, right) => left.source.localeCompare(right.source)),
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
        `${JSON.stringify(
          {
            meta: {
              ...meta,
              selectedCases: domainCases.length,
              domains: [domain],
              domainCounts: { [domain]: domainCases.length },
              courseGroupCount: domainGroupCounts[domain],
              domainGroupCounts: { [domain]: domainGroupCounts[domain] },
            },
            cases: domainCases,
          },
          null,
          2,
        )}\n`,
      ),
      fs.writeFile(
        path.join(domainDir, 'review-form-1.json'),
        `${JSON.stringify(
          domainCases.map((caseRow) => createBlankScionReview(caseRow, packetId, reviewPacketDigest)),
          null,
          2,
        )}\n`,
      ),
      fs.writeFile(
        path.join(domainDir, 'review-form-2.json'),
        `${JSON.stringify(
          domainCases.map((caseRow) => createBlankScionReview(caseRow, packetId, reviewPacketDigest)),
          null,
          2,
        )}\n`,
      ),
      fs.writeFile(
        path.join(domainDir, 'founder-review-form.json'),
        `${JSON.stringify(
          domainCases.map((caseRow) => createBlankScionFounderReview(caseRow, packetId, reviewPacketDigest)),
          null,
          2,
        )}\n`,
      ),
      fs.writeFile(path.join(domainDir, 'review.html'), buildScionReviewerHtml({ meta, domain, cases: domainCases })),
      fs.writeFile(
        path.join(domainDir, 'founder-review.html'),
        buildScionReviewerHtml({ meta, domain, cases: domainCases, mode: 'founder' }),
      ),
      fs.writeFile(
        path.join(domainDir, 'README.md'),
        `# Scion blind atom review — ${domain}\n\n## Primary Codex lane\n\nThis model-neutral packet feeds the separate \`build:scion:codex-training-reviews\` workflow. Codex is the declared primary judge. Its A/B and B/A passes run in separate contexts, score both sides before preference, bind exact artifacts and scorecards, and remain explicitly single-model evidence.\n\n## Optional qualified-human lane\n\nOpen \`review.html\` only if a working instructor who currently teaches ${domain} volunteers calibration evidence. The form is self-contained, saves a local draft, and downloads ingestion-compatible JSON. Human review is optional and is never implied by the Codex lane.\n\n## Optional founder-research lane\n\nOpen \`founder-review.html\` for explicitly non-independent founder diagnostics. Founder review can guide compiler repair, but it does not become Codex, instructor, or promotion evidence.\n\nAll lanes use the same anonymous, hash-bound cases. Never describe Codex results as human, instructor, independent, classroom, or multi-judge validation.\n`,
      ),
    ];
  });
  await Promise.all([
    fs.writeFile(path.join(reviewerDir, 'packet.json'), `${JSON.stringify({ meta, cases }, null, 2)}\n`),
    fs.writeFile(
      path.join(reviewerDir, 'README.md'),
      `# Scion blind atom packet\n\nThis is a model-neutral organizer overview over anonymous, hash-bound atom pairs. Codex is Scion's declared primary judge. Run \`build:scion:codex-training-reviews\` to create separate A/B and B/A batches; ingestion requires fresh sessions, scoring before preference, stable unblinded outcomes, source context, score floors, concrete defects, and exact hashes.\n\nThe \`review.html\` and \`founder-review.html\` pages remain optional calibration and diagnostic lanes. Their evidence classes stay separate. Codex results are single-model evidence and are never human, instructor, independent, classroom, or multi-judge validation.\n`,
    ),
    fs.writeFile(path.join(organizerDir, 'key.json'), `${JSON.stringify({ meta, keys }, null, 2)}\n`),
    ...domainWrites,
  ]);
  if (receiptOutput) {
    const receipt = {
      schemaVersion: 2,
      protocol: REVIEW_PROTOCOL,
      status:
        cases.length === 0
          ? 'blocked-no-cases'
          : meta.campaignReady
            ? 'ready-for-model-judge'
            : meta.researchCampaignReady
              ? 'ready-for-model-judge-research'
              : 'reviewable-incomplete-coverage',
      generatedAt: meta.generatedAt,
      packetId,
      packetDigest: reviewPacketDigest,
      organizerDigest: reviewOrganizerDigest,
      requestedCases: meta.requestedCases,
      perDomainLimit: meta.perDomainLimit,
      selectedCases: cases.length,
      availableCandidates: candidates.length,
      selectionEligibleCandidates: meta.selectionEligibleCandidates,
      requireSourceContext: meta.requireSourceContext,
      excludedMissingSourceContext: meta.excludedMissingSourceContext,
      availableSourceContextCandidates,
      selectedSourceContextCases,
      sourceContextDomainCounts,
      sourceContextKindCounts,
      primaryPreferenceEvidence: meta.primaryPreferenceEvidence,
      requiredModelJudgePasses: cases.length * meta.requiredModelJudgeOrdersPerCase,
      optionalQualifiedHumanReviews: cases.length * meta.requiredIndependentReviewsPerCase,
      domains,
      domainCounts,
      courseGroupCount: meta.courseGroupCount,
      domainGroupCounts,
      targetCourseGroupsPerDomain,
      groupCoverageStatus,
      researchCoverageStatus,
      coverageStatus,
      kindCounts,
      heldOutBenchmark: meta.heldOutBenchmark,
      excludedInvalidCourseGroups,
      sourceFiles: meta.sourceFiles,
      claimBoundary:
        'This receipt proves a frozen, holdout-disjoint, hash-bound blind atom packet exists. It proves no Codex judgment, human judgment, approved training pair, adapter quality, or promotion result.',
    };
    await fs.mkdir(path.dirname(receiptOutput), { recursive: true });
    await fs.writeFile(receiptOutput, `${JSON.stringify(receipt, null, 2)}\n`);
  }
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

async function readApprovedRows(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function approvedRowIdentity(row) {
  const caseDigest = String(row?.preferenceEvidence?.caseDigest || '');
  if (SHA256.test(caseDigest)) return caseDigest;
  return hash(JSON.stringify({ kind: row?.kind, prompt: row?.prompt, chosen: row?.chosen, rejected: row?.rejected }));
}

export function validateScionBlindReview(review) {
  const issues = [];
  if (!String(review?.pairId || '').trim()) issues.push('missing-pair-id');
  if (!SHA256.test(String(review?.caseDigest || ''))) issues.push('invalid-case-digest');
  if (!SHA256.test(String(review?.courseGroupSha256 || ''))) issues.push('invalid-course-group-sha256');
  if (!String(review?.reviewPacketId || '').trim()) issues.push('missing-review-packet-id');
  if (!SHA256.test(String(review?.reviewPacketDigest || ''))) issues.push('invalid-review-packet-digest');
  if (review?.reviewProtocol !== INSTRUCTOR_REVIEW_PROTOCOL) issues.push('invalid-instructor-review-protocol');
  if (review?.evidenceClass !== 'qualified-human') issues.push('invalid-instructor-evidence-class');
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

export function validateScionFounderReview(review) {
  const issues = [];
  if (!String(review?.pairId || '').trim()) issues.push('missing-pair-id');
  if (!SHA256.test(String(review?.caseDigest || ''))) issues.push('invalid-case-digest');
  if (!SHA256.test(String(review?.courseGroupSha256 || ''))) issues.push('invalid-course-group-sha256');
  if (!String(review?.reviewPacketId || '').trim()) issues.push('missing-review-packet-id');
  if (!SHA256.test(String(review?.reviewPacketDigest || ''))) issues.push('invalid-review-packet-digest');
  if (review?.reviewProtocol !== FOUNDER_REVIEW_PROTOCOL) issues.push('invalid-founder-review-protocol');
  if (review?.evidenceClass !== 'founder-review') issues.push('invalid-founder-evidence-class');
  if (!String(review?.reviewerId || '').trim()) issues.push('missing-reviewer-id');
  if (review?.reviewerRole !== 'product-founder') issues.push('reviewer-not-product-founder');
  if (review?.disciplineFamiliarity !== 'self-declared') issues.push('invalid-founder-familiarity');
  if (!String(review?.reviewerDomain || '').trim()) issues.push('missing-reviewer-domain');
  if (review?.independent !== false) issues.push('founder-review-must-be-non-independent');
  if (review?.conflictOfInterest !== true) issues.push('founder-conflict-must-be-declared');
  if (review?.claimEligible !== false) issues.push('founder-review-must-be-claim-ineligible');
  if (!String(review?.claimBoundary || '').includes('not independent instructor evidence')) {
    issues.push('missing-founder-claim-boundary');
  }
  if (!String(review?.reviewedAt || '').trim() || Number.isNaN(Date.parse(review.reviewedAt))) {
    issues.push('invalid-reviewed-at');
  }
  if (!REVIEW_CHOICES.has(review?.choice)) issues.push('invalid-choice');
  for (const field of ['factualCorrectnessA', 'factualCorrectnessB', 'teachabilityA', 'teachabilityB']) {
    if (!Number.isInteger(review?.[field]) || review[field] < 1 || review[field] > 5) {
      issues.push(field + '-range');
    }
  }
  if (String(review?.rationale || '').trim().length < 30) issues.push('rationale-too-short');
  if (review?.attestation !== true) issues.push('missing-attestation');
  return issues;
}

export function verifyScionBlindAtomOrganizerPacket(keyPacket) {
  const keys = Array.isArray(keyPacket?.keys) ? keyPacket.keys : [];
  const keyCases = keys.map((key) => key.case);
  const recomputedOrganizerDigest = organizerKeyDigest(keys);
  return Boolean(
    keyPacket?.meta?.protocol === REVIEW_PROTOCOL &&
    SHA256.test(String(keyPacket?.meta?.packetDigest || '')) &&
    SHA256.test(String(keyPacket?.meta?.organizerDigest || '')) &&
    keys.length > 0 &&
    keyCases.length === keys.length &&
    keys.every(organizerKeyIntegrity) &&
    keyPacket.meta.organizerDigest === recomputedOrganizerDigest &&
    keyPacket.meta.packetDigest === packetDigest(keyCases, recomputedOrganizerDigest) &&
    keyPacket.meta.packetId === `scion-review-${keyPacket.meta.packetDigest.slice(0, 20)}`,
  );
}

export async function ingestScionBlindReviews({
  outputDir = DEFAULT_OUTPUT,
  reviewFiles = [],
  approvedOutput = DEFAULT_APPROVED,
} = {}) {
  const keyPacket = JSON.parse(await fs.readFile(path.join(outputDir, 'organizer', 'key.json'), 'utf8'));
  const keys = Array.isArray(keyPacket?.keys) ? keyPacket.keys : [];
  if (!verifyScionBlindAtomOrganizerPacket(keyPacket)) {
    throw new Error('Blind review organizer packet failed integrity verification');
  }
  const keyById = new Map(keys.map((row) => [row.pairId, row]));
  const reviews = (await Promise.all(reviewFiles.map(readReviewFile))).flat();
  const grouped = new Map();
  const invalidReviews = [];
  for (const review of reviews) {
    const issues = validateScionBlindReview(review);
    const key = keyById.get(review?.pairId);
    if (!key) issues.push('unknown-pair-id');
    else {
      if (review?.reviewPacketId !== keyPacket.meta.packetId) issues.push('review-packet-id-mismatch');
      if (review?.reviewPacketDigest !== keyPacket.meta.packetDigest) issues.push('review-packet-digest-mismatch');
      if (review?.caseDigest !== key.caseDigest) issues.push('review-case-digest-mismatch');
      if (review?.courseGroupSha256 !== key.courseGroupSha256) issues.push('review-course-group-mismatch');
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
      courseId: key.courseGroupId,
      courseGroupId: key.courseGroupId,
      courseGroupSha256: key.courseGroupSha256,
      lessonId: sourceRow.lessonId,
      reviewPairId: pairId,
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
        caseDigest: key.caseDigest,
        courseGroupSha256: key.courseGroupSha256,
        reviewPacketDigest: keyPacket.meta.packetDigest,
        sourceRowSha256: key.sourceRowSha256,
      },
    };
    const assessment = assessCorpusRow(row, approvedOutput);
    if (!assessment.eligible) {
      quarantined.push({ pairId, issues: assessment.issues });
      continue;
    }
    approved.push(row);
  }

  const existingApproved = await readApprovedRows(approvedOutput);
  const mergedByIdentity = new Map();
  for (const row of [...existingApproved, ...approved]) {
    const identity = approvedRowIdentity(row);
    const serialized = JSON.stringify(row);
    const existing = mergedByIdentity.get(identity);
    if (existing && existing.serialized !== serialized) {
      throw new Error(`Approved corpus identity collision: ${identity}`);
    }
    mergedByIdentity.set(identity, { row, serialized });
  }
  const mergedApproved = [...mergedByIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entry]) => entry.row);
  await fs.mkdir(path.dirname(approvedOutput), { recursive: true });
  const temporaryApprovedOutput = `${approvedOutput}.tmp-${process.pid}`;
  await fs.writeFile(
    temporaryApprovedOutput,
    mergedApproved.map((row) => JSON.stringify(row)).join('\n') + (mergedApproved.length ? '\n' : ''),
  );
  await fs.rename(temporaryApprovedOutput, approvedOutput);
  const report = {
    packetId: keyPacket.meta.packetId,
    reviewedCases: grouped.size,
    approved: approved.length,
    approvedExisting: existingApproved.length,
    approvedTotal: mergedApproved.length,
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
    perDomainLimit: 0,
    heldOutBenchmark: DEFAULT_HELD_OUT_BENCHMARK,
    requireSourceContext: false,
    generatedAt: '',
    semanticAdmission: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ingest') args.ingest = true;
    else if (arg === '--source') args.sources.push(argv[++index]);
    else if (arg === '--output') args.outputDir = argv[++index] || args.outputDir;
    else if (arg === '--approved-output') args.approvedOutput = argv[++index] || args.approvedOutput;
    else if (arg === '--review') args.reviewFiles.push(argv[++index]);
    else if (arg === '--limit') args.limit = Number(argv[++index]) || args.limit;
    else if (arg === '--per-domain') args.perDomainLimit = Number(argv[++index]) || 0;
    else if (arg === '--source-only' || arg === '--require-source-context') args.requireSourceContext = true;
    else if (arg === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (arg === '--legacy-semantic-admission') args.semanticAdmission = false;
    else if (arg === '--held-out-benchmark') args.heldOutBenchmark = argv[++index] || args.heldOutBenchmark;
    else if (arg === '--receipt') args.receiptOutput = argv[++index];
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
  console.log(
    `Course groups: ${packet.meta.courseGroupCount} (${packet.meta.groupCoverageStatus}; target ${packet.meta.targetCourseGroupsPerDomain}/domain)`,
  );
  console.log(`Reviewer folders: ${path.join(args.outputDir, 'reviewer', 'by-domain')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
