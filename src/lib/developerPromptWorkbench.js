export const COURSE_MAP_PLACEHOLDER = '{{courseMap}}';

const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
const SUPPORTED_PLACEHOLDERS = new Set(['courseMap']);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function wordCount(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ').length : 0;
}

export function estimatePromptTokens(value) {
  const text = String(value || '');
  if (!text.trim()) return 0;
  return Math.ceil(text.length / 4);
}

export function extractPromptPlaceholders(value) {
  const text = String(value || '');
  const seen = new Set();
  const placeholders = [];
  let match = PLACEHOLDER_PATTERN.exec(text);

  while (match) {
    const raw = match[0];
    const name = match[1];
    const key = `${raw}:${name}`;
    if (!seen.has(key)) {
      placeholders.push({
        raw,
        name,
        supported: SUPPORTED_PLACEHOLDERS.has(name),
        exact: raw === COURSE_MAP_PLACEHOLDER,
      });
      seen.add(key);
    }
    match = PLACEHOLDER_PATTERN.exec(text);
  }

  return placeholders;
}

export function summarizePromptDiff(basePrompt, activePrompt) {
  const base = String(basePrompt || '');
  const active = String(activePrompt || '');
  return {
    changed: normalizeText(base) !== normalizeText(active),
    baseTokens: estimatePromptTokens(base),
    activeTokens: estimatePromptTokens(active),
    tokenDelta: estimatePromptTokens(active) - estimatePromptTokens(base),
    wordDelta: wordCount(active) - wordCount(base),
  };
}

function addFinding(findings, level, message, actionId = null) {
  findings.push({ level, message, actionId });
}

export function analyzeDeveloperPrompt({
  systemPrompt = '',
  userPrompt = '',
  extraInstructions = '',
  effectiveSystemPrompt = systemPrompt,
  effectiveUserPrompt = userPrompt,
  hasSystemOverride = false,
  hasUserOverride = false,
} = {}) {
  const templateText = [systemPrompt, userPrompt, extraInstructions].filter(Boolean).join('\n\n');
  const effectiveText = [effectiveSystemPrompt, effectiveUserPrompt].filter(Boolean).join('\n\n');
  const placeholders = extractPromptPlaceholders(templateText);
  const findings = [];

  if (!normalizeText(systemPrompt)) {
    addFinding(findings, 'warning', 'System prompt is empty.');
  }

  if (hasSystemOverride && wordCount(systemPrompt) < 12) {
    addFinding(findings, 'warning', 'Custom system prompt is very short.');
  }

  if (hasUserOverride && !String(userPrompt || '').includes(COURSE_MAP_PLACEHOLDER)) {
    addFinding(findings, 'warning', `Custom user prompt should include ${COURSE_MAP_PLACEHOLDER}.`, 'insertCourseMap');
  }

  placeholders.forEach((placeholder) => {
    if (!placeholder.supported) {
      addFinding(findings, 'warning', `Unknown placeholder ${placeholder.raw}.`);
    } else if (!placeholder.exact) {
      addFinding(findings, 'warning', `${placeholder.raw} will not be replaced; use ${COURSE_MAP_PLACEHOLDER}.`);
    }
  });

  const templateTokens = estimatePromptTokens(templateText);
  const effectiveTokens = estimatePromptTokens(effectiveText);
  if (effectiveTokens > 24000) {
    addFinding(findings, 'warning', 'Generated prompt is very large; consider narrowing lesson scope.');
  } else if (effectiveTokens > 12000) {
    addFinding(findings, 'info', 'Generated prompt is large; provider limits and cost may matter.');
  }

  if (estimatePromptTokens(extraInstructions) > 800) {
    addFinding(findings, 'info', 'Extra instructions are long enough to compete with the base prompt.');
  }

  return {
    stats: {
      templateTokens,
      effectiveTokens,
      systemTokens: estimatePromptTokens(systemPrompt),
      userTokens: estimatePromptTokens(userPrompt),
      extraTokens: estimatePromptTokens(extraInstructions),
      systemWords: wordCount(systemPrompt),
      userWords: wordCount(userPrompt),
      extraWords: wordCount(extraInstructions),
    },
    placeholders,
    findings,
  };
}
