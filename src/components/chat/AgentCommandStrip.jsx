import React from 'react';
import { resolveLabel } from './constants';

function isCourseMapTab(activeTab) {
  return !activeTab || activeTab === 'courseMap';
}

function buildFinishPrompt() {
  return [
    'Finish the course package until it is ready to download.',
    'Call inspect_workspace or plan_workspace_next_step first if package state is unclear, then run package finalization.',
    'Apply safe deterministic repairs, retry localized weak sections only where needed, and verify exports plus classroom readiness by reading the final state back.',
    'Do not invent missing deliverables; if a required deliverable does not exist, explain what must be generated before finishing.',
    'If broad concrete issues remain, fix them directly before summarizing.',
    'Finish with a concise ready/not-ready handoff that lists changed, skipped, failed, verified, and remaining instructor-decision items.',
  ].join(' ');
}

function buildImprovePrompt(activeTab, agentDryRun) {
  const tabLabel = resolveLabel(activeTab || 'courseMap');
  if (isCourseMapTab(activeTab)) {
    return agentDryRun
      ? 'Inspect the course map for sequencing gaps, vague lesson titles, weak objectives, assessment alignment, and missing throughline. Explain the safest improvements and ask before applying broad changes.'
      : 'Improve the course map for sequencing, concrete lesson titles, measurable objectives, assessment alignment, and a clearer course throughline. Apply safe changes directly, then summarize what changed.';
  }

  return agentDryRun
    ? `Inspect ${tabLabel} for specificity, classroom usability, alignment to the course map, appropriate difficulty, and missing instructor context. Explain concrete safe improvements and ask before applying broad changes.`
    : `Improve ${tabLabel} for specificity, classroom usability, alignment to the course map, appropriate difficulty, and missing instructor context. Apply safe changes directly, then verify the affected deliverable and summarize what changed.`;
}

function buildSyncPrompt(syncFeatureCount) {
  const scopeText =
    Number(syncFeatureCount) > 1
      ? `${syncFeatureCount} stale deliverables`
      : Number(syncFeatureCount) === 1
        ? '1 stale deliverable'
        : 'stale deliverables';
  return [
    `Sync ${scopeText} using the existing pending sync suggestion.`,
    'Apply only the already computed downstream sync plan; do not invent unrelated edits.',
    'After syncing, summarize which materials were updated and whether any items still need review.',
  ].join(' ');
}

export function buildAgentCommandItems({
  activeTab = 'courseMap',
  agentDryRun = false,
  syncFeatureCount = 0,
  localOnly = false,
  canUndo = false,
} = {}) {
  const tabLabel = resolveLabel(activeTab || 'courseMap');
  const activeTarget = isCourseMapTab(activeTab) ? 'Course Map' : tabLabel;
  const items = [
    {
      id: 'finish-package',
      icon: 'check',
      label: 'Finish',
      displayText: 'Finish package',
      title: 'Repair, verify, and prepare the package',
      aliases: [
        'fix',
        'repair',
        'ready',
        'finalize',
        'export',
        'download',
        'package',
        'complete',
        'finish my package',
        'final pass',
        'ready for class',
        'prepare export',
      ],
      prompt: buildFinishPrompt(),
    },
    canUndo
      ? {
          id: 'undo-last',
          icon: 'undo',
          label: 'Undo',
          displayText: 'Undo last change',
          title: 'Restore the previous deliverable state',
          aliases: ['revert', 'restore', 'back', 'rollback', 'cancel'],
          prompt:
            'Undo the most recent deliverable edit using undo_last. Do not make any new changes. After undoing, briefly state what was restored and whether the workspace needs another check.',
        }
      : null,
    {
      id: 'improve-active',
      icon: 'edit',
      label: 'Improve',
      displayText: `Improve ${activeTarget}`,
      title: `Improve ${activeTarget}`,
      aliases: ['edit', 'revise', 'polish', 'strengthen', 'better', 'rewrite', 'refine'],
      prompt: buildImprovePrompt(activeTab, agentDryRun),
    },
    {
      id: 'audit-quality',
      icon: 'search',
      label: 'Audit',
      displayText: 'Audit quality',
      title: 'Inspect quality before changing anything',
      aliases: ['check', 'inspect', 'review', 'quality', 'validate', 'verify', 'issues'],
      prompt:
        'Audit this workspace without applying changes. Check course-map alignment, generated deliverable quality, readiness, classroom usefulness, export risks, and the biggest cost/quality tradeoffs. Return the exact next fixes in priority order.',
    },
    {
      id: 'plan-next',
      icon: 'list',
      label: 'Plan',
      displayText: 'Plan next step',
      title: 'Find the highest-impact next action',
      aliases: ['next', 'todo', 'roadmap', 'recommend', 'prioritize', 'strategy'],
      prompt:
        'Call inspect_workspace first, then call plan_workspace_next_step. Use the plan tool result to identify the single highest-impact next improvement from the current workspace state. Explain why it matters, what you would change, and whether it is safe to apply automatically or should stay as an instructor decision. Do not apply changes yet.',
    },
    {
      id: 'agent-help',
      icon: 'help',
      label: 'Help',
      displayText: 'Show agent help',
      title: 'See what the Agent can do in this workspace',
      aliases: ['commands', 'capabilities', 'what can you do', 'what can the agent do', '?'],
      prompt: '',
    },
  ].filter(Boolean);

  if (Number(syncFeatureCount) > 0 && !agentDryRun) {
    items.splice(1, 0, {
      id: 'sync-stale',
      icon: 'sync',
      label: 'Sync',
      displayText: 'Sync stale deliverables',
      title: 'Update downstream materials affected by recent edits',
      aliases: ['update', 'stale', 'refresh', 'downstream', 'propagate'],
      prompt: buildSyncPrompt(syncFeatureCount),
    });
  }

  if (!localOnly) return items;

  return [
    ...items.filter((item) =>
      ['undo-last', 'sync-stale', 'audit-quality', 'plan-next', 'agent-help'].includes(item.id),
    ),
    {
      id: 'configure-agent',
      icon: 'settings',
      label: 'Configure',
      displayText: 'Configure agent',
      title: 'Connect an AI provider for chat and model-based edits',
      aliases: ['connect', 'setup', 'api', 'key', 'model', 'provider'],
      prompt: '',
    },
  ];
}

export function normalizeAgentCommandQuery(query = '') {
  return String(query || '')
    .replace(/^\/+/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getAgentCommandSearchText(item = {}) {
  return [item.id, item.label, item.title, item.displayText, ...(Array.isArray(item.aliases) ? item.aliases : [])]
    .join(' ')
    .toLowerCase();
}

export function filterAgentCommandItems(items = [], query = '') {
  const normalized = normalizeAgentCommandQuery(query);
  if (!normalized) return Array.isArray(items) ? items : [];
  const terms = normalized.split(' ').filter(Boolean);
  return (Array.isArray(items) ? items : []).filter((item) => {
    const haystack = getAgentCommandSearchText(item);
    return terms.every((term) => haystack.includes(term));
  });
}

const NATURAL_COMMAND_MATCHERS = [
  {
    id: 'agent-help',
    patterns: [
      /^(?:help|agent help|show help|show agent help|commands|show commands|show me commands|show agent commands|show me agent commands|what can you do|what can the agent do|\?)$/,
    ],
  },
  {
    id: 'plan-next',
    patterns: [
      /^(?:plan|plan next|plan next step|plan the next step|plan my next step|next|next step|what next|what should i do next|what should we do next|what should i fix next|what should we fix next|what's next|whats next|recommend next step|recommend the next step)$/,
    ],
  },
  {
    id: 'audit-quality',
    patterns: [
      /^(?:audit|audit quality|run audit|local audit|check|check quality|quality check|review quality|inspect quality|validate package|verify package)$/,
      /^(?:audit|check|review|inspect|validate|verify)\s+(?:(?:this|my|the|current)\s+)?(?:workspace|package|course|materials|deliverables)(?:\s+for\s+(?:issues|problems|quality|readiness|alignment))?$/,
      /^(?:audit|check|review|inspect|validate|verify)\s+(?:for\s+)?(?:issues|problems|quality|readiness|alignment)$/,
    ],
  },
  {
    id: 'finish-package',
    patterns: [
      /^(?:finish|finish package|finish my package|fix|fix package|repair package|finalize|finalize package|make ready|ready to download|prepare download|prepare package|prepare export|final pass|do the final pass|make this ready for class)$/,
      /^(?:finish|fix|repair|finalize|prepare|make ready)\s+(?:(?:this|my|the|current)\s+)?(?:workspace|package|course|materials|deliverables|export)?(?:\s+(?:for|to)\s+(?:download|class|export))?$/,
    ],
  },
  {
    id: 'sync-stale',
    patterns: [
      /^(?:sync|sync stale|sync stale deliverables|update stale|refresh stale|update downstream|sync downstream)$/,
    ],
  },
  {
    id: 'undo-last',
    patterns: [
      /^(?:undo|undo last|undo last change|revert|revert last|revert last change|restore last|rollback)$/,
      /^(?:undo|revert|restore|rollback)\s+(?:that|this|that last thing|that last change|the last thing|the last change|last change)$/,
    ],
  },
  {
    id: 'improve-active',
    patterns: [
      /^(?:improve|improve this|improve active|improve current|make better|make it better|polish|polish this|revise|revise this)$/,
    ],
  },
  {
    id: 'configure-agent',
    patterns: [/^(?:configure|configure ai|configure agent|connect ai|connect model|set api key|setup api key)$/],
  },
];

export function findAgentCommandByText(items = [], text = '') {
  const normalized = normalizeNaturalAgentCommandText(text);
  if (!normalized || normalized.startsWith('/')) return null;

  const safeItems = Array.isArray(items) ? items : [];
  for (const matcher of NATURAL_COMMAND_MATCHERS) {
    const item = safeItems.find((candidate) => candidate?.id === matcher.id);
    if (!item) continue;
    if (matcher.patterns.some((pattern) => pattern.test(normalized))) return item;
  }
  return null;
}

export function normalizeNaturalAgentCommandText(text = '') {
  let normalized = normalizeAgentCommandQuery(text)
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized.startsWith('/')) return normalized;
  if (/^(?:what|why|how|when|where|who)\b/.test(normalized) && !/^what should (?:i|we)\b/.test(normalized)) {
    return normalized;
  }

  normalized = normalized
    .replace(/^(?:please|pls)\s+/, '')
    .replace(/^(?:(?:can|could|would|will)\s+you|can\s+we|could\s+we|would\s+we)\s+/, '')
    .replace(/^(?:help\s+me\s+|i\s+need\s+you\s+to\s+|i\s+want\s+you\s+to\s+|let'?s\s+)/, '')
    .replace(/\s+(?:please|pls)$/g, '')
    .trim();

  return normalized;
}

function getVisibleCommandStripItems(items = [], { isAgentProviderReady = true } = {}) {
  const visibleIds = isAgentProviderReady
    ? ['sync-stale', 'undo-last']
    : ['configure-agent', 'audit-quality', 'plan-next', 'sync-stale', 'undo-last'];

  return visibleIds.map((id) => items.find((item) => item?.id === id)).filter(Boolean);
}

export function CommandIcon({ icon }) {
  if (icon === 'check') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.3}
          d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    );
  }
  if (icon === 'search') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        />
      </svg>
    );
  }
  if (icon === 'edit') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
        />
      </svg>
    );
  }
  if (icon === 'sync') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M16.5 3.75 20.25 7.5m0 0-3.75 3.75M20.25 7.5H8.75A5.75 5.75 0 0 0 3 13.25m.75 3.25 3.75 3.75m0 0 3.75-3.75M7.5 20.25h5.75A5.75 5.75 0 0 0 19 14.5"
        />
      </svg>
    );
  }
  if (icon === 'undo') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M9 14 4 9m0 0 5-5M4 9h10.25A5.75 5.75 0 0 1 20 14.75v.75"
        />
      </svg>
    );
  }
  if (icon === 'settings') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.063.378.318.694.663.86.074.036.148.074.22.113.325.176.717.169 1.032-.012l.802-.463a1.125 1.125 0 0 1 1.366.176l.773.773c.389.389.46.997.176 1.366l-.463.802c-.181.315-.188.707-.012 1.032.04.072.077.146.113.22.166.345.482.6.86.663l.894.149c.542.09.94.56.94 1.11v1.093c0 .55-.398 1.02-.94 1.11l-.894.149c-.378.063-.694.318-.86.663a6.52 6.52 0 0 1-.113.22c-.176.325-.169.717.012 1.032l.463.802c.284.493.213 1.101-.176 1.49l-.773.773a1.125 1.125 0 0 1-1.366.176l-.802-.463c-.315-.181-.707-.188-1.032-.012a6.52 6.52 0 0 1-.22.113c-.345.166-.6.482-.663.86l-.149.894c-.09.542-.56.94-1.11.94h-1.093c-.55 0-1.02-.398-1.11-.94l-.149-.894c-.063-.378-.318-.694-.663-.86a6.52 6.52 0 0 1-.22-.113c-.325-.176-.717-.169-1.032.012l-.802.463a1.125 1.125 0 0 1-1.366-.176l-.773-.773a1.125 1.125 0 0 1-.176-1.366l.463-.802c.181-.315.188-.707.012-1.032a6.52 6.52 0 0 1-.113-.22c-.166-.345-.482-.6-.86-.663l-.894-.149A1.125 1.125 0 0 1 3 12.546v-1.093c0-.55.398-1.02.94-1.11l.894-.149c.378-.063.694-.318.86-.663.036-.074.074-.148.113-.22.176-.325.169-.717-.012-1.032l-.463-.802a1.125 1.125 0 0 1 .176-1.366l.773-.773a1.125 1.125 0 0 1 1.366-.176l.802.463c.315.181.707.188 1.032.012.072-.04.146-.077.22-.113.345-.166.6-.482.663-.86l.149-.894Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    );
  }
  if (icon === 'mode') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M12 3.75 5.25 6.75v5.25c0 4.19 2.86 7.82 6.75 8.82 3.89-1 6.75-4.63 6.75-8.82V6.75L12 3.75Zm0 4.5v8.25"
        />
      </svg>
    );
  }
  if (icon === 'help') {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M9.09 9a3 3 0 1 1 4.82 2.39c-.97.67-1.41 1.03-1.41 2.11m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
        />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
        d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.008v.008H3.75V6.75Zm0 5.25h.008v.008H3.75V12Zm0 5.25h.008v.008H3.75v-.008Z"
      />
    </svg>
  );
}

export default function AgentCommandStrip({
  activeTab,
  agentDryRun = false,
  disabled = false,
  syncFeatureCount = 0,
  canUndo = false,
  isAgentProviderReady = true,
  onCommand,
  onConfigureAI,
}) {
  const items = buildAgentCommandItems({
    activeTab,
    agentDryRun,
    syncFeatureCount,
    localOnly: !isAgentProviderReady,
    canUndo,
  });
  const visibleItems = getVisibleCommandStripItems(items, { isAgentProviderReady });

  if (visibleItems.length === 0) return null;

  const stripTitle = isAgentProviderReady ? 'Workspace updates' : 'Agent recovery';
  const stripHint = isAgentProviderReady ? 'Review pending state changes.' : 'Local checks still work.';

  return (
    <div data-testid="agent-command-strip" className="flex-shrink-0 border-b border-slate-200/70 px-3.5 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stripTitle}</p>
        <p className="text-[10px] font-medium text-slate-400">{stripHint}</p>
      </div>
      <div data-testid="agent-command-strip-actions" className="flex min-w-0 flex-wrap items-center gap-1.5 pb-0.5">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`agent-command-${item.id}`}
            onClick={() => (item.id === 'configure-agent' ? onConfigureAI?.() : onCommand?.(item))}
            disabled={item.id === 'configure-agent' ? false : disabled}
            title={item.title}
            className={`tactile inline-flex min-h-[28px] max-w-full shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              item.id === 'configure-agent'
                ? 'border-amber-200/70 bg-amber-50 text-amber-700 hover:bg-amber-100/80'
                : item.id === 'finish-package'
                  ? 'border-slate-900 bg-slate-950 text-white hover:bg-slate-800'
                  : 'border-slate-200/70 bg-white/65 text-slate-600 hover:border-indigo-200/80 hover:bg-indigo-50/80 hover:text-indigo-700'
            }`}
          >
            <CommandIcon icon={item.icon} />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
