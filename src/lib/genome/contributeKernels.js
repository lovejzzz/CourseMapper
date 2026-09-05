/**
 * contributeKernels.js — v0.15 F2: the flywheel feeds the commons.
 *
 * Kernels extracted on-miss (genomeExtraction.js) live in ONE browser's
 * localStorage cache ('coursemapper-genome-local'). This module packages
 * them as a foundry SOURCE FILE — the exact shape scripts/foundry/sources/
 * takes — so a contribution is a download the user can send in, and the
 * maintainer review is the same validateSource → buildShards pipeline every
 * hand-authored source passes. Human review stays in the loop by design:
 * nothing auto-merges into shipped shards.
 *
 * Privacy boundary (unchanged from the commons design): KERNELS ONLY — the
 * file carries no course name, no prompt, no instructor content. Kernel
 * prose is tier-1 consensus (model-generated, anchor-less by construction);
 * attributions are provider-verified COVERAGE references, not quoted
 * sources — the _comment says so explicitly so a reviewer reads the file
 * cold with the right expectations.
 *
 * Proven round-trip (June 12, 2026): the Beginning Korean 8 → this shape →
 * validateSource 8/8 → buildShards → public/genome/lang-intro.json — the
 * first shard the genome taught itself.
 */

const LOCAL_CACHE_KEY = 'coursemapper-genome-local';

/** Read the extracted-kernel cache. Returns [] when absent/unparsable. */
export function readExtractedKernels(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage?.getItem(LOCAL_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.kernels) ? parsed.kernels : [];
  } catch {
    return [];
  }
}

/** The foundry-source shape, byte-compatible with scripts/foundry/sources/. */
export function buildContributionSource(kernels = [], { appVersion = '' } = {}) {
  return {
    _comment:
      `CONTRIBUTED from a CourseMapper workspace (app v${appVersion || 'unknown'}) via the ` +
      'on-miss extraction flywheel. TIER-1 CONSENSUS kernels: prose is model-generated and ' +
      'carries NO source anchors; every attribution names a published work verified to EXIST ' +
      'via Open Library/OpenAlex at extraction time (coverage references, not quoted sources). ' +
      'Already admitted in-app by the same admitKernel gate hand-authored sources pass. ' +
      'HUMAN REVIEW REQUIRED before genome:build.',
    _contributedFrom: 'coursemapper-genome-local (extraction cache)',
    sourceSnapshots: {},
    kernels,
  };
}

/** Browser download helper — the More-menu action's executable half. */
export function downloadContribution({ appVersion = '', storage } = {}) {
  const kernels = readExtractedKernels(storage);
  if (kernels.length === 0) return { downloaded: false, kernelCount: 0 };
  const source = buildContributionSource(kernels, { appVersion });
  const disciplines = [...new Set(kernels.map((kernel) => String(kernel.id || '').split('/')[0]).filter(Boolean))];
  const fileName = `contributed-kernels-${disciplines.join('-') || 'mixed'}.json`;
  const blob = new Blob([JSON.stringify(source, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { downloaded: true, kernelCount: kernels.length, fileName };
}
