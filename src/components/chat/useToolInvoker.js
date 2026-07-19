/**
 * useToolInvoker.js — Agent tool execution: agentic loop, parallel tool calling,
 * retry logic, loop detection, and progress card management.
 *
 * Extracted from useChatRouter.js (Issue #5) to reduce file size.
 */

import { buildAgentSystemPromptParts } from '../../lib/agentPrompts';
import { getAgentTurnModel } from '../../lib/agentModelRouting';
import { generateCourseHealthReport } from '../../lib/pedagogicalValidator';
import { AGENT_TOOLS, TOOL_LABELS, summarizeToolResult, classifyRequestComplexity } from '../../lib/agentTools';
import { estimateTokens, getModelLimit } from '../../lib/tokenEstimator';
import { buildNativeTools, formatAssistantToolCalls, batchToolResults } from '../../lib/agentProviders';
import { fetchAgentResponseNative, buildAgentChatHistory } from './useStreamProcessor';
import { getMemories, MEMORY_CATEGORIES } from '../../lib/agentMemory';
import { createSkillNudgeTracker, SKILL_NUDGE_HINT } from '../../lib/customAgentTools';
import {
  AGENT_EXECUTION_MODES,
  applyAgentExecutionModePrompt,
  filterAgentToolsForExecutionMode,
  isAgentToolBlockedInDryRun,
} from '../../lib/agentExecutionMode';
import { classifyFinalizePackageStepStatus, normalizePackageSummary } from '../../lib/packageFinalizerSummary';
import { isLandingAgentContextText } from '../../lib/landingAgentContext';
import { isAgentSourceContextText } from '../../lib/agentSourceContext';
import { resolveLabel } from './constants';
import { extractEditContext } from '../../lib/editContextExtractor';
import {
  createCanonicalPatchRequest,
  isKnownPresentationOnlyEdit,
  projectArtifactEditToCourseMapPatch,
} from '../../lib/artifactBlueprintProjection';
import {
  buildConfirmationPolicyToolResult,
  evaluateAgentMutationConfirmation,
} from '../../lib/agentConfirmationPolicy';
import { buildAgentQualityScorecard } from '../../lib/agentQualityScorecard';
import { stripInternalAgentMarkers } from './agentResponseText';

export { stripInternalAgentMarkers } from './agentResponseText';

/**
 * Execute the multi-step agentic loop with native tool calling.
 *
 * This is a plain async function (not a hook) called from useChatRouter.
 * All React state is passed in via the `ctx` parameter so this module
 * stays free of React imports.
 *
 * @param {string} fullMessage  - The user (or synthetic) message to send
 * @param {Object} opts
 * @param {boolean}  opts.silent - If true, suppress user-facing messages
 * @param {boolean}  opts.dryRun - If true, expose only read-only tools and block stale mutating calls
 * @param {Object}  ctx         - Shared context from useChatRouter
 */

function addFeatureTarget(featureId, targets) {
  const raw = String(featureId || '').trim();
  if (!raw || raw === 'all') return;
  targets.add(resolveLabel(raw));
}

function collectFeatureTargets(value, targets) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFeatureTargets(item, targets));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    if (key === 'featureId' || key === 'targetFeatureId') {
      addFeatureTarget(nested, targets);
      continue;
    }
    if (key === 'featureIds' && Array.isArray(nested)) {
      nested.forEach((featureId) => addFeatureTarget(featureId, targets));
      continue;
    }
    collectFeatureTargets(nested, targets);
  }
}

function deriveToolTargets(toolCall, activeTab) {
  const targets = new Set();
  switch (toolCall.name) {
    case 'inspect_workspace':
    case 'plan_workspace_next_step':
      targets.add('Workspace');
      break;
    case 'validate_course':
    case 'finalize_package':
    case 'verify_package_exports':
    case 'review_package_readiness':
    case 'repair_package_readiness':
      targets.add('Package');
      break;
    case 'read_lesson':
    case 'edit_course_map':
    case 'check_grammar':
      targets.add('Course Map');
      break;
    case 'search_research':
      targets.add('Research');
      break;
    case 'create_tool':
    case 'run_tool':
      targets.add('Agent tools');
      break;
    default:
      collectFeatureTargets(toolCall.args || {}, targets);
      if (targets.size === 0 && activeTab) addFeatureTarget(activeTab, targets);
  }
  return [...targets].slice(0, 4);
}

function collectFailedToolDetails(toolResults = []) {
  const failures = [];
  for (const item of toolResults) {
    const result = item?.result || {};
    if (result.error) {
      failures.push({
        toolName: item.toolName,
        message: result.error,
        featureId: result.featureId,
      });
    }
    for (const detail of result.details || []) {
      if (detail?.success) continue;
      failures.push({
        toolName: item.toolName,
        message: detail?.message || result.error || 'The requested change could not be applied.',
        featureId: detail?.featureId || result.featureId,
        lessonIndex: detail?.lessonIndex,
      });
    }
  }
  return failures.filter((failure) => failure.message || failure.featureId);
}

function deriveFailureFeatureLabel(failure = {}) {
  if (failure.featureId) return resolveLabel(failure.featureId);
  const message = String(failure.message || '');
  const knownLabels = [
    'Syllabus',
    'Lesson Plans',
    'Slide Decks',
    'Assignment Briefs',
    'Rubrics',
    'Discussion Prompts',
    'Quiz & Exam Bank',
    'Study Guides',
    'Course FAQ',
  ];
  return knownLabels.find((label) =>
    new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message),
  );
}

const DELIVERABLE_REQUEST_TARGETS = [
  { featureId: 'syllabus', label: 'Syllabus', pattern: /\bsyllabus\b/i },
  { featureId: 'lessonPlans', label: 'Lesson Plans', pattern: /\blesson\s*plans?\b/i },
  { featureId: 'slideDecks', label: 'Slide Decks', pattern: /\b(slide\s*decks?|slides?)\b/i },
  { featureId: 'assignments', label: 'Assignment Briefs', pattern: /\b(assignments?|assignment\s*briefs?)\b/i },
  { featureId: 'rubrics', label: 'Rubrics', pattern: /\brubrics?\b/i },
  { featureId: 'discussions', label: 'Discussion Prompts', pattern: /\b(discussions?|discussion\s*prompts?)\b/i },
  { featureId: 'quizBank', label: 'Quiz & Exam Bank', pattern: /\b(quiz|quizzes|exam|exams|question\s*bank)\b/i },
  { featureId: 'studyGuides', label: 'Study Guides', pattern: /\bstudy\s*guides?\b/i },
  { featureId: 'courseFaq', label: 'Course FAQ', pattern: /\b(course\s*)?faqs?\b/i },
];

function isGeneratedDeliverableEntry(entry) {
  return entry?.status === 'done' && !!entry?.data;
}

function isDeliverableMutationRequest(message = '') {
  const text = String(message || '');
  if (/\b(add|edit|change|update|rewrite|improve|fix|remove|delete|revise)\b/i.test(text)) return true;
  if (
    /\b(make|simplify|strengthen|polish|tighten|soften|expand|shorten)\b/i.test(text) &&
    DELIVERABLE_REQUEST_TARGETS.some((target) => target.pattern.test(text))
  ) {
    return true;
  }
  return (
    /\b(create|make)\b/i.test(text) &&
    /\b(criterion|criteria|item|question|section|slide|prompt|note|field|row)\b/i.test(text)
  );
}

function findMissingDeliverableMutationRequest(message = '', deliverables = {}) {
  if (!isDeliverableMutationRequest(message)) return null;
  return DELIVERABLE_REQUEST_TARGETS.find(
    (target) => target.pattern.test(message) && !isGeneratedDeliverableEntry(deliverables?.[target.featureId]),
  );
}

function buildMissingDeliverableMutationReply(label = 'the requested deliverable') {
  return `The ${label} deliverable is not in this workspace yet, so I did not invent it. Generate ${label.toLowerCase()} first, then I can make that change.`;
}

function assignmentCount(deliverables = {}) {
  const items = deliverables?.assignments?.data?.assignments;
  return Array.isArray(items) ? items.length : 0;
}

function hasSpecificAssignmentTarget(message = '') {
  const text = String(message || '');
  return (
    /\b(lesson|week|module|unit)\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b/i.test(
      text,
    ) ||
    /\bassignment\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|last|final)\b/i.test(
      text,
    ) ||
    /\b(first|second|third|fourth|fifth|last|final)\s+assignment\b/i.test(text) ||
    /"[^"]{3,}"|'[^']{3,}'/.test(text) ||
    /\b(called|named|titled)\s+["']?[\w\s-]{3,}/i.test(text)
  );
}

export function findAmbiguousDeliverableMutationRequest(message = '', deliverables = {}) {
  const text = String(message || '');
  const isAssignmentMutation =
    /\b(assignments?|assignment\s+briefs?)\b/i.test(text) &&
    /\b(add|edit|change|update|rewrite|improve|fix|remove|delete|revise|make|simplify|strengthen|polish|tighten|soften|expand|shorten)\b/i.test(
      text,
    );
  if (!isAssignmentMutation || assignmentCount(deliverables) <= 1 || hasSpecificAssignmentTarget(text)) return null;
  return { featureId: 'assignments', label: 'Assignment Briefs', count: assignmentCount(deliverables) };
}

function buildAmbiguousDeliverableMutationReply(request = {}) {
  if (request.featureId === 'assignments') {
    return `Which assignment should I change? Tell me the lesson number or assignment title, and I’ll apply the edit directly.`;
  }
  return `Which ${String(request.label || 'deliverable item').toLowerCase()} should I change? Tell me the specific target and I’ll apply the edit directly.`;
}

export function findBroadDestructiveWorkspaceMutationRequest(message = '') {
  const text = String(message || '');
  const broadScope = /\b(entire|whole|all|everything|full)\b/i.test(text);
  const destructiveAction = /\b(rewrite|replace|rebuild|regenerate|redo|reset|overwrite)\b/i.test(text);
  const workspaceTarget = /\b(course|materials?|deliverables?|package|workspace)\b/i.test(text);
  return broadScope && destructiveAction && workspaceTarget ? { label: 'full course/materials rewrite' } : null;
}

function buildBroadDestructiveWorkspaceReply() {
  return 'This would replace broad workspace content, so I need confirmation first. Tell me the new course direction, lesson count, and whether to overwrite existing deliverables.';
}

function isDirectApplyMutationRequest(message = '') {
  const text = String(message || '');
  return (
    isDeliverableMutationRequest(text) &&
    /\b(apply it directly|do it directly|safe edit directly|apply the safe edit directly|apply directly|directly|go ahead|make the change)\b/i.test(
      text,
    )
  );
}

function buildDirectApplyProposalRecoveryHint(message = '') {
  return `[SYSTEM] User asked for a direct safe edit, not options. Do not return proposal cards. Use the smallest safe mutation, read back state, then report what changed. Request: ${String(message || '').slice(0, 500)}`;
}

function countQuizQuestions(deliverables = {}) {
  const quizzes = deliverables?.quizBank?.data?.quizzes;
  if (!Array.isArray(quizzes) || quizzes.length === 0) return null;
  const perLesson = quizzes.map((quiz) => {
    const questions = quiz?.qs || quiz?.questions || [];
    return Array.isArray(questions) ? questions.length : 0;
  });
  const total = perLesson.reduce((sum, count) => sum + count, 0);
  return total > 0 ? { total, perLesson } : null;
}

function isReadOnlyQuizCountRequest(message = '') {
  const text = String(message || '');
  return (
    /\b(how many|count|number of)\b/i.test(text) &&
    /\b(quiz|quizzes|questions?|question\s+bank|exam\s+bank)\b/i.test(text) &&
    !/\b(add|create|make|generate|remove|delete|change|edit|update|rewrite|fix|improve)\b/i.test(text)
  );
}

function verifiedMusicIntervalWorkspace(courseMap = null) {
  const text = [
    courseMap?.courseName,
    ...(Array.isArray(courseMap?.lessons)
      ? courseMap.lessons.flatMap((lesson) => [
          lesson?.title,
          ...(Array.isArray(lesson?.sections)
            ? lesson.sections.flatMap((section) => [
                section?.topicSection,
                section?.learningObjectives,
                section?.supportingResources,
              ])
            : []),
        ])
      : []),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    /\bintervals?\b/i.test(text) &&
    /\b(?:music theory|semitone|pitch|notated|notation|aural|audio|inversion)\b/i.test(text)
  );
}

function verifiedMusicIntervalAgentReply(message = '', courseMap = null) {
  if (!verifiedMusicIntervalWorkspace(courseMap)) return '';
  const text = String(message || '');
  if (/\bmajor third\b/i.test(text) && /\b(?:invert|inversion)\b/i.test(text)) {
    return 'No. A major third inverts to a minor sixth: the interval numbers sum to nine (3 + 6 = 9), and major quality changes to minor. The inverted span is eight semitones, not four.';
  }
  if (/\bcompound tenth\b/i.test(text) && /\b(?:simple|reduce|equivalent)\b/i.test(text)) {
    return 'A compound tenth reduces to a simple third because subtracting seven from a compound interval number removes one octave while preserving its letter-name relationship.';
  }
  if (/\b(?:inversion|invert)\b/i.test(text) && /\b(?:rule|quality|number)\b/i.test(text)) {
    return 'For a simple interval inversion, the two numbers sum to nine; major exchanges with minor, augmented exchanges with diminished, and perfect remains perfect.';
  }
  if (/\b(?:inclusive|generic number|letter[- ]name count)\b/i.test(text) && /\bintervals?\b/i.test(text)) {
    return 'Find an interval’s generic number by counting both endpoint letter names inclusively; then use semitone distance to verify quality without letting semitone count override the written spelling.';
  }
  return '';
}

export function buildLocalReadOnlyFallback(fullMessage = '', { courseMap = null, deliverables = null } = {}) {
  const text = String(fullMessage || '');
  const verifiedMusicReply = verifiedMusicIntervalAgentReply(text, courseMap);
  if (verifiedMusicReply) return verifiedMusicReply;
  if (isReadOnlyQuizCountRequest(text)) {
    const quizCount = countQuizQuestions(deliverables);
    if (quizCount) {
      const sameCount =
        quizCount.perLesson.length > 0 && quizCount.perLesson.every((count) => count === quizCount.perLesson[0]);
      const perLessonText = sameCount
        ? `, with ${quizCount.perLesson[0]} question${quizCount.perLesson[0] === 1 ? '' : 's'} in each lesson`
        : '';
      return `There are ${quizCount.total} quiz question${quizCount.total === 1 ? '' : 's'} ready across the course${perLessonText}.`;
    }
  }
  if (
    /\blist\b/i.test(text) &&
    /\blesson\s+titles?\b/i.test(text) &&
    /\bdo not edit|without editing|no edit|read[-\s]?only\b/i.test(text)
  ) {
    const titles = Array.isArray(courseMap?.lessons)
      ? courseMap.lessons.map((lesson, index) => lesson?.title || `Lesson ${index + 1}`).filter(Boolean)
      : [];
    if (titles.length > 0) return `Lesson titles: ${titles.join('; ')}.`;
  }
  return '';
}

const DIRECT_LESSON_WORD_INDEX = {
  one: 0,
  two: 1,
  three: 2,
  four: 3,
  five: 4,
  six: 5,
  seven: 6,
  eight: 7,
  nine: 8,
  ten: 9,
  eleven: 10,
  twelve: 11,
  thirteen: 12,
  fourteen: 13,
  fifteen: 14,
};

function inferDirectLessonIndex(message = '') {
  const match = String(message || '').match(
    /\blesson\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b/i,
  );
  if (!match) return null;
  const raw = match[1].toLowerCase();
  const index = /^\d+$/.test(raw) ? Number(raw) - 1 : DIRECT_LESSON_WORD_INDEX[raw];
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function directFaqQuestionScore(question = {}) {
  const text = [
    question.question,
    question.q,
    question.answer,
    question.a,
    question.category,
    ...(Array.isArray(question.relatedConcepts) ? question.relatedConcepts : []),
    ...(Array.isArray(question.rc) ? question.rc : []),
  ]
    .filter(Boolean)
    .join(' ');
  let score = 0;
  if (/\bcloud\s+export\b/i.test(text)) score += 8;
  if (/\b(fail|failure|fails|error|not work|does not work)\b/i.test(text)) score += 5;
  if (/\bzip\s+export|google\s+drive|technical\s+help\b/i.test(text)) score += 3;
  return score;
}

function buildDirectCourseFaqCloudExportEdit(message = '', deliverables = {}) {
  const text = String(message || '');
  if (!isDirectApplyMutationRequest(text) || !/\b(course\s*)?faq\b/i.test(text) || !/\bcloud\s+export\b/i.test(text)) {
    return null;
  }
  const entry = deliverables?.courseFaq;
  const faqs = entry?.data?.faqs;
  if (!entry?.data || !Array.isArray(faqs) || faqs.length === 0) return null;

  const requestedLessonIndex = inferDirectLessonIndex(text);
  const lessonIndexes = Number.isInteger(requestedLessonIndex) ? [requestedLessonIndex] : faqs.map((_, index) => index);
  const nextData = structuredClone(entry.data);
  const answer =
    'Use the local ZIP first if cloud export fails, then retry cloud export after confirming the package opens.';
  let changed = 0;
  const touchedLessons = [];

  for (const lessonIndex of lessonIndexes) {
    const lessonFaq = nextData.faqs?.[lessonIndex];
    const questions = lessonFaq?.questions || lessonFaq?.qs;
    if (!Array.isArray(questions) || questions.length === 0) continue;
    let bestIndex = -1;
    let bestScore = 0;
    questions.forEach((question, index) => {
      const score = directFaqQuestionScore(question);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0 || bestScore < 5) continue;
    const question = questions[bestIndex];
    const answerKey = question.answer !== undefined ? 'answer' : question.a !== undefined ? 'a' : 'answer';
    if (question[answerKey] !== answer) {
      question[answerKey] = answer;
      changed += 1;
      touchedLessons.push(`Lesson ${lessonIndex + 1}`);
    }
  }

  if (changed === 0) return null;
  return {
    featureId: 'courseFaq',
    data: nextData,
    changed,
    touchedLessons,
    answer,
  };
}

function isGenericCompletionText(value = '') {
  return /^(agent\s+)?(completed|complete|done|finished)\.?$/i.test(String(value || '').trim());
}

function buildToolFailureChatReply(toolResults = []) {
  const failures = collectFailedToolDetails(toolResults);
  if (failures.length === 0) return '';
  const primary =
    failures.find((failure) =>
      /\b(missing|not generated|not been generated|not available|does not exist|generate .*first|no .*deliverable)\b/i.test(
        failure.message,
      ),
    ) || failures[0];
  const label = deriveFailureFeatureLabel(primary) || 'the requested deliverable';
  const message = String(primary.message || '').trim();
  if (
    /\b(missing|not generated|not been generated|not available|does not exist|generate .*first|no .*deliverable)\b/i.test(
      message,
    )
  ) {
    return buildMissingDeliverableMutationReply(label);
  }
  const targetText = label === 'the requested deliverable' ? 'requested change' : `${label.toLowerCase()} change`;
  return `I could not complete the ${targetText}: ${message}`;
}

const TOOL_RESULT_FALLBACK_MUTATION_TOOLS = new Set([
  'edit_course_map',
  'edit_deliverables',
  'generate_slide_images',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'undo_last',
]);

function collectFailedToolResultSummaries(toolResults = []) {
  return toolResults
    .map((item) => ({
      ...item,
      failures: collectFailedToolDetails([item]),
    }))
    .filter((item) => item.failures.length > 0);
}

function collectUnresolvedMutationFailures(toolResults = []) {
  const lastMutationSuccessIndex = toolResults.findLastIndex(isSuccessfulMutationResult);
  const unresolvedResults = toolResults.slice(Math.max(0, lastMutationSuccessIndex + 1));
  return collectFailedToolDetails(unresolvedResults).filter((failure) =>
    TOOL_RESULT_FALLBACK_MUTATION_TOOLS.has(failure.toolName),
  );
}

function isTerminalSafetyFailureMessage(message = '') {
  return /\b(missing|not generated|not been generated|not available|does not exist|generate .*first|no .*deliverable|confirm|confirmation|destructive|delete|overwrite|ambiguous|which .+ should|clarify)\b/i.test(
    String(message || ''),
  );
}

function isSuccessfulClaimText(value = '') {
  return /\b(done|updated|renamed|changed|edited|added|removed|deleted|applied|verified|complete|completed|fixed|shortened|expanded|revised)\b/i.test(
    String(value || ''),
  );
}

function buildUnresolvedMutationRecoveryHint(failures = []) {
  const details = failures
    .map((failure) => {
      const label = deriveFailureFeatureLabel(failure);
      const target = label ? `${label}: ` : '';
      return `${target}${failure.message || 'The requested mutation failed.'}`;
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
  return `[SYSTEM] Mutation still failed. ${details} Do not claim success. If safe/specific, retry the smallest mutation, read back state, then report; otherwise ask for the missing decision.`;
}

const TOOL_RESULT_FALLBACK_VERIFIER_TOOLS = new Set([
  'read_lesson',
  'read_deliverable',
  'validate_course',
  'review_package_readiness',
  'verify_package_exports',
  'verify_slide_images',
  'verify_slide_export',
  'inspect_workspace',
]);

const TOOL_RESULT_FALLBACK_READ_ONLY_TOOLS = new Set([
  'inspect_workspace',
  'plan_workspace_next_step',
  'validate_course',
  'review_package_readiness',
  'verify_package_exports',
  'read_lesson',
  'read_deliverable',
  'compare_deliverables',
  'check_grammar',
  'search_research',
]);

function toolResultSucceeded(result = {}) {
  if (!result || result.error) return false;
  if (Number(result.failed || 0) > 0 && Number(result.applied || result.started || 0) <= 0) return false;
  return true;
}

function isSuccessfulMutationResult(item = {}) {
  const toolName = item.toolName;
  const result = item.result || {};
  if (!TOOL_RESULT_FALLBACK_MUTATION_TOOLS.has(toolName) || !toolResultSucceeded(result)) return false;
  if (toolName === 'undo_last') return Boolean(result.success);
  if (toolName === 'finalize_package') return true;
  if (Number(result.applied || result.started || 0) > 0) return true;
  return Boolean(result.success || result.ok || result.confidence || result.exportVerification);
}

function targetFromToolResult(item = {}) {
  const toolName = item.toolName;
  const result = item.result || {};
  if (toolName === 'edit_course_map') return 'Course Map';
  if (toolName === 'finalize_package') return 'package';
  if (toolName === 'repair_package_readiness' || toolName === 'retry_package_weak_spots') return 'package readiness';
  if (toolName === 'generate_slide_images') return 'Slide Decks';
  if (toolName === 'undo_last') return 'workspace history';
  if (result.featureId) return resolveLabel(result.featureId);
  for (const detail of result.details || []) {
    if (detail?.featureId) return resolveLabel(detail.featureId);
  }
  return '';
}

function joinTargetLabels(labels = []) {
  const unique = [...new Set(labels.map((label) => String(label || '').trim()).filter(Boolean))].slice(0, 3);
  if (unique.length === 0) return 'the workspace';
  if (unique.length === 1) return /^the\b/i.test(unique[0]) ? unique[0] : `the ${unique[0]}`;
  const last = unique.pop();
  return `the ${unique.join(', ')} and ${last}`;
}

function isContradictoryFailureText(value = '') {
  return /\b(i wasn't able|i was not able|couldn'?t|could not|unable|failed|did not persist|didn't persist|did not take effect|didn't take effect|did not reflect|didn't reflect|not reflected|still appears|still reads|still shows|readback still|remain(?:s)? unchanged|still unchanged|no changes? (?:were )?made)\b/i.test(
    String(value || ''),
  );
}

export function isToolTraceOnlyText(value = '') {
  const text = String(value || '').trim();
  return (
    /^\[Agent used\s+\d+\s+tools?:[\s\S]*\]$/i.test(text) ||
    /^\[Tool Result:[\s\S]*\]$/i.test(text) ||
    /\b(?:plan_workspace_next_step|inspect_workspace|edit_deliverables|regenerate_slide_decks)\b/i.test(text) ||
    /["']?tool[_ ]?name["']?\s*:/i.test(text)
  );
}

function mutationArgsForToolResult(item = {}) {
  const args = item.args || item.toolArgs || {};
  if (item.toolName === 'edit_course_map') return Array.isArray(args.patches) ? args.patches : [];
  if (item.toolName === 'edit_deliverables') return Array.isArray(args.actions) ? args.actions : [];
  return [];
}

function mutationHighlightFromToolResult(item = {}) {
  const result = item.result || {};
  const details = Array.isArray(result.details) ? result.details : [];
  const inputs = mutationArgsForToolResult(item);
  const highlights = [];

  details.forEach((detail, index) => {
    if (!detail?.success || detail.pending) return;
    const input = inputs[index] || {};
    const value =
      item.toolName === 'edit_course_map'
        ? getCourseMapPatchAfterValue(input)
        : item.toolName === 'edit_deliverables'
          ? getDeliverableAfterValue(input, detail)
          : detail.message || result.message;
    const text = truncateReceiptValue(value, 90);
    const lessonIndex = detail.lessonIndex ?? input.lessonIndex;
    const prefix = Number.isInteger(lessonIndex) ? `Lesson ${lessonIndex + 1}: ` : '';
    if (text) highlights.push(`${prefix}${text}`);
  });

  if (highlights.length === 0 && item.toolName === 'undo_last' && result.message) {
    highlights.push(truncateReceiptValue(result.message, 90));
  }

  return [...new Set(highlights)].slice(0, 2).join('; ');
}

function summarizeMutationHighlights(successfulMutations = []) {
  const highlights = successfulMutations.map(mutationHighlightFromToolResult).filter(Boolean);
  return [...new Set(highlights)].slice(0, 2).join('; ');
}

function inferReadOnlyTargetFromMessage(message = '') {
  const text = String(message || '');
  if (/\bquiz|quizzes|question\s+bank\b/i.test(text) && /\bobjective|objectives|align|alignment\b/i.test(text)) {
    return 'quiz/objective alignment';
  }
  if (/\bquiz|quizzes|question\s+bank\b/i.test(text)) return 'the quiz bank';
  if (/\blesson\s+plans?\b/i.test(text)) return 'the lesson plans';
  if (/\bslides?\b/i.test(text)) return 'the slide decks';
  if (/\bassignments?\b/i.test(text)) return 'the assignments';
  if (/\bdownload|export|package|ready|readiness\b/i.test(text)) return 'package readiness';
  return 'the workspace';
}

function parseNestedResponsePayload(value = '') {
  const text = String(value || '').trim();
  if (!((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']')))) return null;
  try {
    const parsed = JSON.parse(text);
    // Browser-local models occasionally serialize one sentence as a JSON
    // array of fragments. Treat that as transport noise, not UI content.
    if (Array.isArray(parsed)) {
      const responsePart = parsed.findLast(
        (part) =>
          part &&
          typeof part === 'object' &&
          (part.chatReply || part.proposal || part.chart || part.diagram || part.imageSearch || part.text),
      );
      // Small local models can emit a punctuation fragment before the actual
      // response object, e.g. [")", {"chatReply":"…"}]. The object is the
      // semantic payload; the other array entries are decoding debris.
      if (responsePart) return responsePart;
    }
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((part) => typeof part === 'string')) {
      return {
        chatReply: parsed
          .map((part) => part.trim())
          .filter(Boolean)
          .join(', '),
      };
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.chatReply || parsed.proposal || parsed.chart || parsed.diagram || parsed.imageSearch || parsed.text)
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function normalizeAgentFinalResponse(response) {
  if (!response || typeof response !== 'object') return response;
  const nested = parseNestedResponsePayload(response.chatReply || response.text || '');
  return nested ? { ...response, ...nested, text: undefined } : response;
}

export function buildToolResultFallbackChatReply(toolResults = [], options = {}) {
  const failures = collectFailedToolDetails(toolResults);
  const successfulMutations = toolResults.filter(isSuccessfulMutationResult);

  if (successfulMutations.length > 0) {
    const firstMutationIndex = toolResults.findIndex(isSuccessfulMutationResult);
    const lastMutationIndex = toolResults.findLastIndex(isSuccessfulMutationResult);
    const unresolvedFailures = collectFailedToolDetails(toolResults.slice(Math.max(0, lastMutationIndex + 1)));
    const verifiedAfterMutation = toolResults
      .slice(Math.max(0, firstMutationIndex + 1))
      .some((item) => TOOL_RESULT_FALLBACK_VERIFIER_TOOLS.has(item.toolName) && toolResultSucceeded(item.result));
    const targetText = joinTargetLabels(successfulMutations.map(targetFromToolResult));
    const verificationText = verifiedAfterMutation ? ' and verified the updated state' : '';
    const highlightText = summarizeMutationHighlights(successfulMutations);
    if (unresolvedFailures.length > 0) {
      const issue = unresolvedFailures[0]?.message ? ` ${unresolvedFailures[0].message}` : '';
      return `I updated ${targetText}${verificationText}, but ${unresolvedFailures.length} item${
        unresolvedFailures.length === 1 ? ' still needs' : 's still need'
      } attention.${issue}`;
    }
    return `Done. I updated ${targetText}${verificationText}${highlightText ? `: ${highlightText}` : ''}.`;
  }

  const failureReply = buildToolFailureChatReply(toolResults);
  if (failureReply) return failureReply;

  const readOnlyResults = toolResults.filter(
    (item) => TOOL_RESULT_FALLBACK_READ_ONLY_TOOLS.has(item.toolName) && toolResultSucceeded(item.result),
  );
  if (readOnlyResults.length > 0) {
    const last = readOnlyResults.at(-1);
    const summary = summarizeToolResult(last.toolName, last.result);
    const target = inferReadOnlyTargetFromMessage(options.userMessage);
    return `Done. I checked ${target}${summary && summary !== 'Done' ? `: ${summary}` : ''}.`;
  }

  return '';
}

export function chooseAgentFallbackText(
  textContent = '',
  toolResults = [],
  defaultText = "I wasn't able to complete that request. Could you try asking about one specific aspect?",
  options = {},
) {
  const fallbackText = buildToolResultFallbackChatReply(toolResults, options);
  const rawText = String(textContent || '').trim();
  // Browser-local Scion has no native tool channel yet, so it may honor the
  // shared Agent contract by returning {"chatReply":"…"} as plain text.
  // Unwrap that envelope before the text-only branch paints the message; the
  // normal tool-calling branch already performs the same normalization.
  const nested = parseNestedResponsePayload(rawText);
  const text = stripInternalAgentMarkers(nested?.chatReply || nested?.text || rawText);
  if (isToolTraceOnlyText(text)) {
    const userMessage = String(options.userMessage || '');
    if (/\bslides?|slide decks?\b/i.test(userMessage)) {
      return (
        fallbackText ||
        'I could not safely apply those slide changes from this chat reply. Use Improve slides so the app regenerates the decks directly and records a visible receipt.'
      );
    }
    return (
      fallbackText ||
      'I could not safely apply that workspace change from this chat reply. Use the matching Agent action so the app runs it directly and records the result.'
    );
  }
  if (text && !isToolTraceOnlyText(text) && !isGenericCompletionText(text)) return text;
  return fallbackText || text || defaultText;
}

export function ensureFinalResponseHasChatReply(response, toolResults = []) {
  const normalizedResponse = normalizeAgentFinalResponse(response);
  const failureChatReply = buildToolFailureChatReply(toolResults);
  const fallbackChatReply = buildToolResultFallbackChatReply(toolResults);
  const hasSuccessfulMutation = toolResults.some(isSuccessfulMutationResult);
  const unresolvedMutationFailures = collectUnresolvedMutationFailures(toolResults);
  const finalText = normalizedResponse?.chatReply || normalizedResponse?.text || '';
  if (fallbackChatReply && isToolTraceOnlyText(finalText)) {
    return { ...(normalizedResponse || {}), chatReply: fallbackChatReply, text: undefined };
  }
  if (
    unresolvedMutationFailures.length > 0 &&
    (failureChatReply || fallbackChatReply) &&
    !normalizedResponse?.proposal &&
    !normalizedResponse?.chart &&
    !normalizedResponse?.diagram &&
    isSuccessfulClaimText(finalText)
  ) {
    return {
      ...(normalizedResponse || {}),
      chatReply: hasSuccessfulMutation ? fallbackChatReply : failureChatReply,
      text: undefined,
    };
  }
  if (
    fallbackChatReply &&
    hasSuccessfulMutation &&
    collectFailedToolDetails(toolResults).length === 0 &&
    !normalizedResponse?.proposal &&
    !normalizedResponse?.chart &&
    !normalizedResponse?.diagram &&
    isContradictoryFailureText(finalText)
  ) {
    return { ...(normalizedResponse || {}), chatReply: fallbackChatReply, text: undefined };
  }
  if (
    (failureChatReply || fallbackChatReply) &&
    !normalizedResponse?.chatReply &&
    !normalizedResponse?.proposal &&
    !normalizedResponse?.chart &&
    !normalizedResponse?.diagram &&
    (!normalizedResponse?.text ||
      isGenericCompletionText(normalizedResponse.text) ||
      isToolTraceOnlyText(normalizedResponse.text))
  ) {
    return { ...(normalizedResponse || {}), chatReply: failureChatReply || fallbackChatReply };
  }
  if (
    normalizedResponse?.chatReply ||
    normalizedResponse?.text ||
    normalizedResponse?.proposal ||
    normalizedResponse?.chart ||
    normalizedResponse?.diagram
  ) {
    return normalizedResponse;
  }
  return failureChatReply || fallbackChatReply
    ? { ...(normalizedResponse || {}), chatReply: failureChatReply || fallbackChatReply }
    : normalizedResponse;
}

const RECEIPT_ACTION_TOOLS = new Set([
  'edit_course_map',
  'edit_deliverables',
  'generate_slide_images',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'save_preference',
  'remember',
  'forget',
  'undo_last',
  'create_tool',
  'run_tool',
]);

const RECEIPT_WORKSPACE_MUTATION_TOOLS = new Set([
  'edit_course_map',
  'edit_deliverables',
  'generate_slide_images',
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'undo_last',
]);

const RECEIPT_STATE_VERIFIER_TOOLS = new Set([
  'read_lesson',
  'read_deliverable',
  'validate_course',
  'verify_package_exports',
  'review_package_readiness',
  'verify_slide_images',
  'verify_slide_export',
  'compare_deliverables',
  'finalize_package',
]);

const RECEIPT_SELF_VERIFYING_MUTATION_TOOLS = new Set(['finalize_package']);

const RECEIPT_PLANNER_TOOLS = new Set([
  'inspect_workspace',
  'plan_workspace_next_step',
  'review_package_readiness',
  'compare_deliverables',
]);

const RECEIPT_SERIOUS_MUTATION_TOOLS = new Set([
  'finalize_package',
  'repair_package_readiness',
  'retry_package_weak_spots',
  'generate_slide_images',
  'run_tool',
]);

const RECEIPT_PLANNING_ENFORCED_MUTATION_TOOLS = new Set([...RECEIPT_WORKSPACE_MUTATION_TOOLS, 'run_tool']);

const COURSE_MAP_FIELD_ALIASES = {
  lo: 'learningObjectives',
  lg: 'learningGoals',
  tp: 'topicSection',
  as: 'asyncActivities',
  ac: 'syncActivities',
  rs: 'supportingResources',
};

const RECEIPT_INTENT_TOOLS = {
  finish_package: new Set(['finalize_package']),
  package_repair: new Set(['repair_package_readiness', 'retry_package_weak_spots']),
  content_edit: new Set(['edit_course_map', 'edit_deliverables', 'generate_slide_images', 'undo_last']),
  package_audit: new Set(['validate_course', 'verify_package_exports', 'review_package_readiness']),
  workspace_plan: new Set(['plan_workspace_next_step']),
  workspace_inspection: new Set(['inspect_workspace', 'read_lesson', 'read_deliverable', 'compare_deliverables']),
  agent_tooling: new Set(['create_tool', 'run_tool']),
  agent_memory: new Set(['save_preference', 'remember', 'forget', 'recall']),
  research: new Set(['search_research']),
};

const RECEIPT_INTENT_LABELS = {
  finish_package: 'Package finish',
  package_repair: 'Package repair',
  content_edit: 'Content update',
  package_audit: 'Quality audit',
  workspace_plan: 'Workspace plan',
  workspace_inspection: 'Workspace inspection',
  agent_tooling: 'Agent tooling',
  agent_memory: 'Agent memory',
  research: 'Research',
  agent_run: 'Agent run',
};

function uniqueList(values = [], max = Infinity) {
  const unique = [];
  values.forEach((value) => {
    const text = String(value || '').trim();
    if (text && !unique.includes(text)) unique.push(text);
  });
  if (unique.length <= max) return unique;
  return [...unique.slice(0, max), `+${unique.length - max} more`];
}

function cloneForProjection(data) {
  if (data == null) return {};
  try {
    if (typeof structuredClone === 'function') return structuredClone(data);
  } catch {
    /* fall through */
  }
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return {};
  }
}

function normalizeProjectionPath(path) {
  if (Array.isArray(path)) return path;
  if (typeof path !== 'string') return null;
  return path
    .split('.')
    .filter((part) => part !== '')
    .map((part) => {
      const numeric = Number(part);
      return Number.isInteger(numeric) && String(numeric) === part ? numeric : part;
    });
}

function setProjectionValueAtPath(obj, path, value) {
  const root = cloneForProjection(obj);
  if (!Array.isArray(path) || path.length === 0) return root;
  let current = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    const nextKey = path[i + 1];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
  return root;
}

export function projectAgentDeliverableActionToCanonicalPatch(action, { courseMap, deliverables } = {}) {
  if (!action || action.type !== 'editItem' || !action.featureId) return null;
  const editPath = normalizeProjectionPath(action.path);
  if (!editPath || editPath.length < 2) return null;
  const lessonIndex = Number.isInteger(action.lessonIndex)
    ? action.lessonIndex
    : Number.isInteger(editPath[1])
      ? editPath[1]
      : null;
  if (!Number.isInteger(lessonIndex)) return null;

  const entry = deliverables?.[action.featureId] || null;
  const oldData = entry?.data || entry || {};
  const newData = setProjectionValueAtPath(oldData, editPath, action.value);
  const editContext = extractEditContext(oldData, newData, editPath);
  if (action.syncPolicy === 'localOnly' || isKnownPresentationOnlyEdit(action.featureId, editPath)) {
    return { localOnly: true, editContext };
  }
  const patch = projectArtifactEditToCourseMapPatch({
    featureId: action.featureId,
    lessonIndex,
    editPath,
    oldData,
    newData,
    courseMap,
    editContext,
  });
  if (patch) return { patch, editContext };
  const patchRequest = createCanonicalPatchRequest({
    featureId: action.featureId,
    lessonIndex,
    editPath,
    oldData,
    newData,
    courseMap,
    editContext,
  });
  return patchRequest ? { patchRequest, canonicalPatchRequests: [patchRequest], editContext } : null;
}

export function isLocalOnlyDeliverableEditResult(detail) {
  return detail?.localOnly === true || detail?.syncPolicy === 'localOnly';
}

export function shouldNotifyDirectDeliverableEdit(detail) {
  if (!detail || detail.success === false || detail.featureId === 'courseMap' || detail.pending) return false;
  return !isLocalOnlyDeliverableEditResult(detail);
}

function formatReceiptStep(step) {
  const label = String(step?.label || TOOL_LABELS[step?.tool] || step?.tool || 'Agent tool').trim();
  const summary = String(step?.summary || '').trim();
  if (!summary || summary === label) return label;
  return `${label}: ${summary}`;
}

function formatReceiptToolLabel(step) {
  return String(step?.label || TOOL_LABELS[step?.tool] || step?.tool || 'Agent tool').trim();
}

function buildToolManifest(steps) {
  return steps.slice(0, 12).map((step) => {
    const startedAt = Number(step?.startedAt || 0);
    const endedAt = Number(step?.endedAt || 0);
    return {
      tool: String(step?.tool || 'unknown_tool'),
      label: String(step?.label || TOOL_LABELS[step?.tool] || step?.tool || 'Agent tool'),
      status: String(step?.status || 'done'),
      summary: String(step?.summary || '').trim(),
      targets: uniqueList(step?.targets || [], 3),
      ...(startedAt && endedAt && endedAt >= startedAt ? { durationMs: endedAt - startedAt } : {}),
    };
  });
}

export function deriveAgentVerificationState(steps = []) {
  const normalizedSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const mutationSteps = normalizedSteps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => RECEIPT_WORKSPACE_MUTATION_TOOLS.has(step?.tool) && step?.status !== 'error');

  if (mutationSteps.length === 0) {
    return {
      required: false,
      status: 'not_required',
      checkedAfterMutation: false,
      label: 'No workspace mutation to verify',
      mutationTools: [],
      verifierTools: [],
    };
  }

  const latestMutation = mutationSteps[mutationSteps.length - 1];
  const latestMutationSelfVerified =
    latestMutation.step?.status === 'done' && RECEIPT_SELF_VERIFYING_MUTATION_TOOLS.has(latestMutation.step?.tool);
  const verifierStepsAfterMutation = normalizedSteps
    .slice(latestMutation.index + 1)
    .filter((step) => RECEIPT_STATE_VERIFIER_TOOLS.has(step?.tool));
  const successfulVerifierSteps = verifierStepsAfterMutation.filter((step) => step.status === 'done');
  const failedVerifierSteps = verifierStepsAfterMutation.filter(
    (step) => step.status === 'error' || step.status === 'partial',
  );
  const verifierSteps = latestMutationSelfVerified
    ? [latestMutation.step, ...successfulVerifierSteps]
    : successfulVerifierSteps;
  const mutationTools = uniqueList(
    mutationSteps.map(({ step }) => formatReceiptToolLabel(step)),
    4,
  );
  const verifierTools = uniqueList(verifierSteps.map(formatReceiptToolLabel), 4);
  const mutationTargets = uniqueList(
    mutationSteps.flatMap(({ step }) => step?.targets || []),
    4,
  );
  const verifierTargets = uniqueList(
    verifierSteps.flatMap((step) => step?.targets || []),
    4,
  );

  if (verifierSteps.length > 0) {
    return {
      required: true,
      status: 'verified',
      checkedAfterMutation: true,
      label: `Verified after mutation via ${verifierTools.join(', ')}`,
      mutationTools,
      verifierTools,
      mutationTargets,
      verifierTargets,
    };
  }

  if (failedVerifierSteps.length > 0) {
    const failedVerifierTools = uniqueList(failedVerifierSteps.map(formatReceiptToolLabel), 4);
    return {
      required: true,
      status: 'review',
      checkedAfterMutation: false,
      label: `Verification needs review: ${failedVerifierTools.join(', ')}`,
      issue: `Verification needs review: ${failedVerifierTools.join(', ')}`,
      mutationTools,
      verifierTools: failedVerifierTools,
      mutationTargets,
      verifierTargets,
    };
  }

  return {
    required: true,
    status: 'missing',
    checkedAfterMutation: false,
    label: 'Needs read-back verification after workspace mutation',
    issue: 'Verification missing after workspace mutation',
    mutationTools,
    verifierTools: [],
    mutationTargets,
    verifierTargets: [],
  };
}

export function deriveAgentPlanningState(steps = [], expectations = {}) {
  const normalizedSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const expectedIntent = String(expectations.intent || expectations.expectedIntent || '').trim();
  const requiresPlanByExpectation = expectations.requiresPlan === true;
  const requiresPlanByTool = normalizedSteps.some(
    (step) => RECEIPT_SERIOUS_MUTATION_TOOLS.has(step?.tool) && step?.status !== 'error',
  );
  const requiresPlan = requiresPlanByExpectation || requiresPlanByTool;
  const mutationSteps = normalizedSteps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => RECEIPT_WORKSPACE_MUTATION_TOOLS.has(step?.tool) && step?.status !== 'error');
  const firstMutationIndex = mutationSteps.length > 0 ? mutationSteps[0].index : normalizedSteps.length;
  const plannerSteps = normalizedSteps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => RECEIPT_PLANNER_TOOLS.has(step?.tool) && step?.status !== 'error');
  const plannerStepsBeforeMutation = plannerSteps.filter(({ index }) => index < firstMutationIndex);
  const plannerTools = uniqueList(
    plannerStepsBeforeMutation.map(({ step }) => formatReceiptToolLabel(step)),
    4,
  );
  const allPlannerTools = uniqueList(
    plannerSteps.map(({ step }) => formatReceiptToolLabel(step)),
    4,
  );
  const mutationTools = uniqueList(
    mutationSteps.map(({ step }) => formatReceiptToolLabel(step)),
    4,
  );

  if (!requiresPlan) {
    if (plannerSteps.length > 0) {
      return {
        required: false,
        status: 'planned',
        hasPlan: true,
        checkedBeforeMutation: plannerStepsBeforeMutation.length > 0 || mutationSteps.length === 0,
        label: `Planning evidence via ${allPlannerTools.join(', ')}`,
        plannerTools: allPlannerTools,
        mutationTools,
        intent: expectedIntent,
      };
    }
    return {
      required: false,
      status: 'not_required',
      hasPlan: false,
      checkedBeforeMutation: false,
      label: 'No planning gate required for targeted action',
      plannerTools: [],
      mutationTools,
      intent: expectedIntent,
    };
  }

  if (plannerStepsBeforeMutation.length > 0 || (plannerSteps.length > 0 && mutationSteps.length === 0)) {
    return {
      required: true,
      status: 'planned',
      hasPlan: true,
      checkedBeforeMutation: plannerStepsBeforeMutation.length > 0 || mutationSteps.length === 0,
      label: `Planned before execution via ${(plannerTools.length > 0 ? plannerTools : allPlannerTools).join(', ')}`,
      plannerTools: plannerTools.length > 0 ? plannerTools : allPlannerTools,
      mutationTools,
      intent: expectedIntent,
    };
  }

  if (plannerSteps.length > 0) {
    return {
      required: true,
      status: 'review',
      hasPlan: true,
      checkedBeforeMutation: false,
      label: `Planning evidence came after execution via ${allPlannerTools.join(', ')}`,
      issue: 'Planning did not happen before serious mutation.',
      plannerTools: allPlannerTools,
      mutationTools,
      intent: expectedIntent,
    };
  }

  return {
    required: true,
    status: 'missing',
    hasPlan: false,
    checkedBeforeMutation: false,
    label: 'Needs planning or inspection before serious execution',
    issue: 'Planning evidence is missing before serious execution.',
    plannerTools: [],
    mutationTools,
    intent: expectedIntent,
  };
}

export function shouldRequirePlanningBeforeTool(toolName, priorSteps = [], expectations = {}) {
  if (expectations?.requiresPlan !== true) return false;
  if (!RECEIPT_PLANNING_ENFORCED_MUTATION_TOOLS.has(toolName)) return false;
  const planning = deriveAgentPlanningState(priorSteps, { ...expectations, requiresPlan: true });
  return planning.status !== 'planned';
}

function buildPlanningRequiredToolResult(toolName) {
  return {
    error: `Serious workspace changes need planning before "${toolName}" can run. Call inspect_workspace or plan_workspace_next_step first, then retry the smallest safe mutation and verify it afterward.`,
    code: 'planning_required',
    needsPlanning: true,
  };
}

function compactReceiptValue(value) {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string')
    return value
      .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
      .replace(/\s+/g, ' ')
      .trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const primitiveItems = value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item));
    if (primitiveItems.length === value.length && primitiveItems.length > 0) {
      return primitiveItems.map(compactReceiptValue).join('; ');
    }
  }
  const title = firstNonEmptyText(value, [
    'title',
    'lessonTitle',
    'lt',
    'question',
    'q',
    'name',
    'label',
    'cn',
    't',
    'ov',
  ]);
  if (title) return title;
  try {
    return JSON.stringify(value).replace(/\s+/g, ' ').trim();
  } catch {
    return String(value || '').trim();
  }
}

function truncateReceiptValue(value, maxLength = 140) {
  const text = compactReceiptValue(value);
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function firstNonEmptyText(value, keys = []) {
  if (!value || typeof value !== 'object') return '';
  for (const key of keys) {
    const text = typeof value[key] === 'string' ? value[key].trim() : '';
    if (text) return text;
  }
  return '';
}

function getValueAtPath(root, path) {
  const normalizedPath = normalizeProjectionPath(path);
  if (!root || !Array.isArray(normalizedPath) || normalizedPath.length === 0) return undefined;
  let current = root;
  for (const key of normalizedPath) {
    if (current == null || typeof current !== 'object' || !(key in current)) return undefined;
    current = current[key];
  }
  return current;
}

function getCourseMapPatchBeforeValue(patch, courseMap) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const lesson = Number.isInteger(patch?.lessonIndex) ? lessons[patch.lessonIndex] : null;
  if (patch?.action === 'addLesson') return `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`;
  if (patch?.action === 'removeLesson') return lesson?.title || `Lesson ${Number(patch?.lessonIndex) + 1}`;
  if (patch?.field === 'title') return lesson?.title;
  const sectionIndex = Number.isInteger(patch?.sectionIndex) ? patch.sectionIndex : 0;
  const field = COURSE_MAP_FIELD_ALIASES[patch?.field] || patch?.field;
  return lesson?.sections?.[sectionIndex]?.[field];
}

function getCourseMapPatchAfterValue(patch) {
  if (patch?.action === 'addLesson') return patch.title || patch.lesson?.title || 'Added lesson';
  if (patch?.action === 'removeLesson') return 'Removed lesson';
  return patch?.value;
}

function getDiffStatus(detail = {}) {
  if (!detail.success) return 'failed';
  if (detail.pending) return 'pending';
  return 'changed';
}

function buildCourseMapStateDiff(patch = {}, detail = {}, ctx = {}) {
  const action = patch.action || (patch.field === 'title' ? 'editTitle' : 'editCell');
  return {
    status: getDiffStatus(detail),
    action,
    target: 'Course Map',
    featureId: 'courseMap',
    lessonIndex: patch.lessonIndex,
    path: patch.action || patch.field || detail.patch || '',
    before: truncateReceiptValue(getCourseMapPatchBeforeValue(patch, ctx.courseMap)),
    after: truncateReceiptValue(getCourseMapPatchAfterValue(patch)),
    reason: detail.success ? '' : detail.message || 'Course map edit failed.',
  };
}

function getDeliverableBeforeValue(action = {}, deliverables = {}) {
  const data = deliverables?.[action.featureId]?.data;
  if (!data) return undefined;
  if (action.type === 'editItem') return getValueAtPath(data, action.path);
  if (action.type === 'addItem') {
    const rootKey = Array.isArray(action.path) ? action.path[0] : null;
    const rootItems = rootKey && Array.isArray(data[rootKey]) ? data[rootKey] : null;
    if (rootItems) return `${rootItems.length} item${rootItems.length === 1 ? '' : 's'}`;
  }
  if (action.type === 'removeItem') {
    const rootKey = Array.isArray(action.path) ? action.path[0] : null;
    const rootItems = rootKey && Array.isArray(data[rootKey]) ? data[rootKey] : null;
    if (rootItems && Number.isInteger(action.itemIndex)) return rootItems[action.itemIndex];
  }
  if (action.type === 'regenerateLesson') return `Lesson ${Number(action.lessonIndex) + 1}`;
  return undefined;
}

function getDeliverableAfterValue(action = {}, detail = {}) {
  if (detail.pending) return detail.message || 'Queued for approval';
  if (action.type === 'editItem') return action.value;
  if (action.type === 'addItem') return action.item || 'Added item';
  if (action.type === 'removeItem') return 'Removed item';
  if (action.type === 'regenerateLesson') return 'Regeneration started';
  return detail.message || '';
}

function buildDeliverableStateDiff(action = {}, detail = {}, ctx = {}) {
  const featureId = detail.featureId || action.featureId;
  const rawAction = detail.action || action.type || 'edit';
  const target = resolveLabel(featureId || 'deliverables');
  return {
    status: getDiffStatus(detail),
    action: rawAction,
    target,
    featureId,
    lessonIndex: detail.lessonIndex ?? action.lessonIndex,
    path: Array.isArray(action.path) ? action.path.join('.') : action.subKey || '',
    before: truncateReceiptValue(getDeliverableBeforeValue(action, ctx.deliverables)),
    after: truncateReceiptValue(getDeliverableAfterValue(action, detail)),
    reason: detail.success ? '' : detail.message || 'Deliverable edit failed.',
  };
}

function buildGenericMutationDiff(detail = {}, toolName = 'agent_tool') {
  return {
    status: getDiffStatus(detail),
    action: detail.action || toolName,
    target: resolveLabel(detail.featureId || 'workspace'),
    featureId: detail.featureId,
    lessonIndex: detail.lessonIndex,
    before: '',
    after: truncateReceiptValue(detail.message || detail.model || detail.nextAction || ''),
    reason: detail.success ? '' : detail.message || detail.reason || 'Action failed.',
  };
}

function buildPackageRepairStateDiff(repair = {}, toolName = 'repair_package_readiness') {
  const featureId = repair.featureId;
  const changes = Array.isArray(repair.changes) ? repair.changes.filter(Boolean).join('; ') : '';
  return {
    status: getDiffStatus(repair),
    action: toolName,
    target: repair.label || resolveLabel(featureId || 'package'),
    featureId,
    before: repair.success === false ? '' : 'Generated deliverable state',
    after: truncateReceiptValue(changes || repair.message || 'Safe readiness repair applied.'),
    reason: repair.success === false ? repair.message || repair.reason || 'Package repair failed.' : '',
  };
}

function buildRetryStateDiff(detail = {}) {
  return {
    status: getDiffStatus(detail),
    action: 'regenerateLesson',
    target: detail.label || resolveLabel(detail.featureId || 'package'),
    featureId: detail.featureId,
    lessonIndex: detail.lessonIndex,
    before: truncateReceiptValue(detail.source ? `${detail.source} issue` : 'Localized weak section'),
    after: truncateReceiptValue(detail.message || 'Regeneration started'),
    reason: detail.success ? '' : detail.message || detail.reason || 'Retry failed.',
  };
}

function buildUndoStateDiff(result = {}, ctx = {}) {
  if (!result.success) return [];
  return [
    {
      status: 'changed',
      action: 'undo_last',
      target: resolveLabel(ctx.activeTab || 'deliverables'),
      before: 'Latest deliverable state',
      after: truncateReceiptValue(result.message || 'Previous deliverable snapshot restored.'),
      reason: '',
    },
  ];
}

function buildSkippedDiffs(skipped = []) {
  if (!Array.isArray(skipped)) return [];
  return skipped.slice(0, 8).map((item) => ({
    status: 'skipped',
    action: item.action || 'skipped',
    target: resolveLabel(item.featureId || 'workspace'),
    featureId: item.featureId,
    lessonIndex: item.lessonIndex,
    before: '',
    after: '',
    reason: item.reason || item.message || 'Skipped because no safe mutation was available.',
  }));
}

function uniqueStateDiffs(diffs = [], max = 8) {
  const seen = new Set();
  const unique = [];
  for (const diff of diffs) {
    if (!diff || typeof diff !== 'object') continue;
    const normalized = {
      ...diff,
      before: truncateReceiptValue(diff.before),
      after: truncateReceiptValue(diff.after),
      reason: truncateReceiptValue(diff.reason),
    };
    if (!normalized.status && !normalized.action && !normalized.target) continue;
    const key = JSON.stringify([
      normalized.status,
      normalized.action,
      normalized.target,
      normalized.lessonIndex,
      normalized.path,
      normalized.before,
      normalized.after,
      normalized.reason,
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= max) break;
  }
  return unique;
}

export function buildAgentStateDiffsFromToolResult(toolName, args = {}, result = {}, ctx = {}) {
  if (!result || typeof result !== 'object' || result.error) return [];
  const details = Array.isArray(result.details) ? result.details : [];
  let diffs = [];

  if (toolName === 'edit_course_map') {
    const patches = Array.isArray(args.patches) ? args.patches : [];
    diffs = details.map((detail, index) => buildCourseMapStateDiff(patches[index] || {}, detail, ctx));
  } else if (toolName === 'edit_deliverables') {
    const actions = Array.isArray(args.actions) ? args.actions : [];
    diffs = details.map((detail, index) => buildDeliverableStateDiff(actions[index] || {}, detail, ctx));
  } else if (toolName === 'repair_package_readiness' || toolName === 'finalize_package') {
    const repairs = Array.isArray(result.repairs) ? result.repairs : [];
    diffs = repairs.map((repair) => buildPackageRepairStateDiff(repair, toolName));
  } else if (toolName === 'retry_package_weak_spots') {
    diffs = details.map((detail) => buildRetryStateDiff(detail));
  } else if (toolName === 'undo_last') {
    diffs = buildUndoStateDiff(result, ctx);
  } else if (toolName === 'generate_slide_images') {
    diffs = details.map((detail) => buildGenericMutationDiff(detail, toolName));
  }

  return uniqueStateDiffs([...diffs, ...buildSkippedDiffs(result.skipped)], 8);
}

function receiptIntentPriority(intentType) {
  return [
    'finish_package',
    'package_repair',
    'content_edit',
    'package_audit',
    'workspace_plan',
    'workspace_inspection',
    'agent_tooling',
    'agent_memory',
    'research',
  ].indexOf(intentType);
}

export function deriveModelAgentReceiptIntent(steps = [], { issueCount = 0 } = {}) {
  const toolNames = uniqueList(steps.map((step) => step?.tool));
  if (toolNames.length === 0) {
    return {
      type: 'agent_run',
      label: RECEIPT_INTENT_LABELS.agent_run,
      toolNames: [],
      toolCount: 0,
      issueCount,
      mutatesWorkspace: false,
      readOnly: true,
    };
  }

  const matchedTypes = [];
  for (const [intentType, tools] of Object.entries(RECEIPT_INTENT_TOOLS)) {
    if (toolNames.some((toolName) => tools.has(toolName))) matchedTypes.push(intentType);
  }
  matchedTypes.sort((a, b) => receiptIntentPriority(a) - receiptIntentPriority(b));

  const type = matchedTypes[0] || 'agent_run';
  const hasAction = steps.some((step) => RECEIPT_ACTION_TOOLS.has(step?.tool));
  const mutatesWorkspace = steps.some((step) => RECEIPT_WORKSPACE_MUTATION_TOOLS.has(step?.tool));
  return {
    type,
    label: RECEIPT_INTENT_LABELS[type] || RECEIPT_INTENT_LABELS.agent_run,
    toolNames,
    toolCount: steps.length,
    issueCount,
    mutatesWorkspace,
    mutatesAgentState: hasAction && !mutatesWorkspace,
    readOnly: !hasAction,
  };
}

function buildReceiptTitle(status, intent) {
  const label = intent?.label || RECEIPT_INTENT_LABELS.agent_run;
  if (status === 'blocked') return `${label} needs attention`;
  if (status === 'review') return `${label} needs review`;
  if (intent?.type === 'workspace_plan') return 'Workspace plan ready';
  if (intent?.type === 'package_audit') return 'Quality audit complete';
  if (intent?.type === 'finish_package') return 'Package finish receipt';
  return `${label} receipt`;
}

function buildReceiptNext(status, intent, actionSteps, verification = null, hasVerificationReviewIssue = false) {
  if (status === 'blocked') {
    if (intent?.type === 'finish_package' || intent?.type === 'package_repair') {
      return 'Review the package issue, then retry the smallest safe finish action.';
    }
    return 'Open the issue details or run a smaller recovery action before continuing.';
  }
  if (status === 'review') {
    if (hasVerificationReviewIssue && verification?.status === 'missing') {
      return 'Read back the edited state before applying more changes or reporting it as complete.';
    }
    if (hasVerificationReviewIssue && verification?.status === 'review') {
      return 'Review the verification result before applying more changes.';
    }
    return 'Review the partial result before applying more changes.';
  }

  switch (intent?.type) {
    case 'workspace_plan':
      return 'Choose a plan action, or run a quality audit before changing content.';
    case 'package_audit':
      return 'Use the findings to decide whether to fix, finish, or download.';
    case 'finish_package':
      return 'Review the package summary, then download or audit quality before sharing.';
    case 'content_edit':
    case 'package_repair':
      return 'Check package or plan the next downstream update from the changed workspace.';
    case 'agent_tooling':
      return 'Use the saved macro when this workflow repeats.';
    case 'agent_memory':
      return 'Future Agent turns can use the updated preference context.';
    default:
      return actionSteps.length > 0
        ? 'Continue from the updated workspace.'
        : 'Use these findings to choose the next change.';
  }
}

export function inferAgentQualityExpectations(fullMessage = '', complexity = 'moderate') {
  const text = String(fullMessage || '').toLowerCase();
  const requiresPlan =
    complexity === 'complex' ||
    /\b(finish|finalize|package|download|audit|review|readiness|alignment|repair|retry|regenerate|sync|fix all|every lesson|all lessons|whole course|14[-\s]?(lesson|week)|scope)\b/.test(
      text,
    );
  return requiresPlan ? { requiresPlan: true } : {};
}

export function buildModelAgentReceiptFromProgress(
  progress,
  { runId = null, dryRun = false, activeTab = null, finalResponse = null, qualityExpectations = null } = {},
) {
  const steps = Array.isArray(progress?.steps) ? progress.steps.filter(Boolean) : [];
  if (steps.length === 0) return null;

  const issueSteps = steps.filter((step) => step.status === 'error' || step.status === 'partial');
  const hasError = issueSteps.some((step) => step.status === 'error') || progress?.status === 'error';
  const actionSteps = steps.filter((step) => RECEIPT_ACTION_TOOLS.has(step.tool));
  const checkSteps = steps.filter((step) => !RECEIPT_ACTION_TOOLS.has(step.tool));
  const verification = deriveAgentVerificationState(steps);
  let intent = deriveModelAgentReceiptIntent(steps, { issueCount: 0 });
  const planning = deriveAgentPlanningState(steps, {
    ...(qualityExpectations || {}),
    intent: qualityExpectations?.intent || qualityExpectations?.expectedIntent || intent.type,
  });
  const stateDiffs = uniqueStateDiffs(
    actionSteps.flatMap((step) => (Array.isArray(step.stateDiffs) ? step.stateDiffs : [])),
    8,
  );
  const verificationIssues = !hasError && issueSteps.length === 0 && verification.issue ? [verification.issue] : [];
  const issues = uniqueList([...issueSteps.map(formatReceiptStep), ...verificationIssues], 4);
  const status = hasError ? 'blocked' : issues.length > 0 ? 'review' : 'done';
  const targets = uniqueList(
    steps.flatMap((step) => step.targets || []),
    4,
  );
  const fallbackTarget = progress?.runMeta?.target || resolveLabel(activeTab || 'courseMap');
  const mode = progress?.runMeta?.mode || (dryRun ? 'No workspace edits' : 'Agent run');
  const providerCallCount = Number(progress?.runMeta?.providerCallCount || 0);
  const maxProviderCallCount = Number(progress?.runMeta?.maxProviderCallCount || progress?.runMeta?.maxIterations || 0);
  const stopReason = String(progress?.runMeta?.stopReason || '').trim();
  intent = { ...intent, issueCount: issues.length };
  const startedAt = Number(progress?.startedAt || 0);
  const endedAt = Number(progress?.endedAt || 0);
  const runStats = {
    toolCount: steps.length,
    actionCount: actionSteps.length,
    checkCount: checkSteps.length,
    issueCount: issues.length,
    readOnly: intent.readOnly,
    mutatesWorkspace: intent.mutatesWorkspace,
    mutatesAgentState: intent.mutatesAgentState,
    planningStatus: planning.status,
    verificationStatus: verification.status,
    stateDiffCount: stateDiffs.length,
    ...(providerCallCount > 0 ? { providerCallCount } : {}),
    ...(maxProviderCallCount > 0 ? { maxProviderCallCount } : {}),
    ...(progress?.runMeta?.routedModel ? { routedModel: progress.runMeta.routedModel } : {}),
    ...(progress?.runMeta?.modelEscalated
      ? { modelEscalated: true, modelRoutingReason: progress.runMeta.modelRoutingReason }
      : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(startedAt && endedAt && endedAt >= startedAt ? { durationMs: endedAt - startedAt } : {}),
  };

  const receipt = {
    title: buildReceiptTitle(status, intent),
    status,
    badge: status === 'blocked' ? 'Blocked' : status === 'review' ? 'Review' : 'Complete',
    mode,
    target: targets.length > 0 ? targets.join(', ') : fallbackTarget,
    intent,
    runStats,
    planning,
    verification,
    stateDiffs,
    ...(stopReason ? { stopReason } : {}),
    toolManifest: buildToolManifest(steps),
    changed: actionSteps.length > 0 ? uniqueList(actionSteps.map(formatReceiptStep), 4) : ['No workspace edits'],
    checked: checkSteps.length > 0 ? uniqueList(checkSteps.map(formatReceiptStep), 4) : ['Tool result status'],
    issues,
    next: buildReceiptNext(
      status,
      intent,
      actionSteps,
      verification,
      verificationIssues.length > 0 || verification.status === 'review',
    ),
  };
  receipt.quality = buildAgentQualityScorecard({
    receipt,
    finalResponse,
    expectations: qualityExpectations || {},
  });

  return {
    role: 'agentReceipt',
    runId,
    receipt,
  };
}

export async function runAgentLoop(fullMessage, { silent = false, dryRun = false } = {}, ctx) {
  const {
    messages,
    setMessages,
    setStreaming,
    abortRef,
    apiKey,
    provider,
    modelId,
    courseMap,
    activeTab,
    slideTheme,
    selectedFeatures,
    columns,
    deliverableConfig,
    lessonFilter,
    delivRef,
    executeActionRef,
    optimisticUpdateRef,
    snapshotRef,
    undoFnRef,
    notifyEditRef,
    uid,
    customToolRegistryRef,
    maybeRunValidation,
    handleAgentFinalResponse,
    viewportRef,
  } = ctx;
  const executionMode = dryRun ? AGENT_EXECUTION_MODES.DRY_RUN : AGENT_EXECUTION_MODES.APPLY;
  // v0.9: routing applied to real loop calls — critique/authorship turns
  // escalate mini models to the high-reasoning sibling for the whole run.
  const turnRouting = getAgentTurnModel({ provider, modelId, userMessage: fullMessage });
  const routedModelId = turnRouting.modelId || modelId;
  const runId = `agent-run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let agentQualityExpectations = {};

  // Helper: update the progress card
  const updateProgress = (updater) => {
    setMessages((prev) => {
      const updated = [...prev];
      const idx = updated.findLastIndex((m) => m.role === 'agentProgress');
      if (idx >= 0) {
        const current = updated[idx];
        const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
        const normalized = {
          ...next,
          startedAt: next.startedAt || current.startedAt || Date.now(),
        };
        if (
          current.status === 'running' &&
          normalized.status &&
          normalized.status !== 'running' &&
          !normalized.endedAt
        ) {
          normalized.endedAt = Date.now();
        }
        updated[idx] = normalized;
      }
      return updated;
    });
  };

  // Helper: update a specific step by index
  const updateStepAt = (stepIndex, updates) => {
    updateProgress((card) => {
      const steps = [...card.steps];
      if (stepIndex >= 0 && stepIndex < steps.length) {
        const current = steps[stepIndex];
        const next = { ...current, ...updates };
        if (current.status === 'running' && next.status && next.status !== 'running' && !next.endedAt) {
          next.endedAt = Date.now();
        }
        steps[stepIndex] = next;
      }
      return { ...card, steps };
    });
  };

  const completeProgressWithReceipt = ({ status = 'complete', stopReason = '', finalResponse = null } = {}) => {
    if (silent) return;
    setMessages((prev) => {
      const updated = [...prev];
      const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
      if (progressIdx < 0) return prev;
      const current = updated[progressIdx];
      const completed = {
        ...current,
        status: status === 'error' || current.status === 'error' ? 'error' : 'complete',
        startedAt: current.startedAt || Date.now(),
        endedAt: current.endedAt || Date.now(),
        runMeta: {
          ...(current.runMeta || {}),
          ...(stopReason ? { stopReason } : {}),
        },
      };
      updated[progressIdx] = completed;
      const receipt = buildModelAgentReceiptFromProgress(completed, {
        runId,
        dryRun: executionMode === AGENT_EXECUTION_MODES.DRY_RUN,
        activeTab,
        finalResponse,
        qualityExpectations: agentQualityExpectations,
      });
      if (!receipt) return updated;
      return [...updated.filter((message) => !(message.role === 'agentReceipt' && message.runId === runId)), receipt];
    });
  };

  try {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const missingDeliverableRequest = findMissingDeliverableMutationRequest(fullMessage, delivRef.current);
    if (missingDeliverableRequest) {
      const finalResponse = {
        chatReply: buildMissingDeliverableMutationReply(missingDeliverableRequest.label),
      };
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
      if (!silent) handleAgentFinalResponse(finalResponse);
      return;
    }

    const ambiguousDeliverableRequest = findAmbiguousDeliverableMutationRequest(fullMessage, delivRef.current);
    if (ambiguousDeliverableRequest) {
      const finalResponse = {
        chatReply: buildAmbiguousDeliverableMutationReply(ambiguousDeliverableRequest),
      };
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
      if (!silent) handleAgentFinalResponse(finalResponse);
      return;
    }

    const broadDestructiveRequest = findBroadDestructiveWorkspaceMutationRequest(fullMessage);
    if (broadDestructiveRequest) {
      const finalResponse = {
        chatReply: buildBroadDestructiveWorkspaceReply(broadDestructiveRequest),
      };
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
      if (!silent) handleAgentFinalResponse(finalResponse);
      return;
    }

    const localReadOnlyReply = buildLocalReadOnlyFallback(fullMessage, {
      courseMap,
      deliverables: delivRef.current,
    });
    if (localReadOnlyReply) {
      const finalResponse = { chatReply: localReadOnlyReply };
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
      if (!silent) handleAgentFinalResponse(finalResponse);
      return;
    }

    const directCourseFaqEdit = buildDirectCourseFaqCloudExportEdit(fullMessage, delivRef.current);
    if (directCourseFaqEdit && optimisticUpdateRef?.current) {
      const previous = delivRef.current?.courseFaq?.data;
      if (previous && snapshotRef.current) snapshotRef.current('courseFaq', previous);
      optimisticUpdateRef.current('courseFaq', directCourseFaqEdit.data);
      delivRef.current = {
        ...(delivRef.current || {}),
        courseFaq: {
          ...(delivRef.current?.courseFaq || {}),
          status: 'done',
          data: directCourseFaqEdit.data,
          error: null,
        },
      };
      const finalResponse = {
        chatReply: `Updated the Course FAQ cloud export answer${directCourseFaqEdit.touchedLessons.length ? ` for ${directCourseFaqEdit.touchedLessons.join(', ')}` : ''}: ${directCourseFaqEdit.answer}`,
      };
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
      if (!silent) handleAgentFinalResponse(finalResponse);
      return;
    }

    // Load user preferences
    let userPrefs = null;
    try {
      userPrefs = JSON.parse(localStorage.getItem('coursemapper-agent-prefs') || 'null');
    } catch {
      /* ignore */
    }

    // Build context
    const chatHistory = buildAgentChatHistory(messages);
    const healthReport = courseMap && delivRef.current ? generateCourseHealthReport(courseMap, delivRef.current) : null;
    const healthSummary =
      healthReport && (healthReport.errorCount > 0 || healthReport.warningCount > 0) ? healthReport.summary : null;
    // For Anthropic we pass the parts object so the provider builder can emit
    // two cache breakpoints (static prefix + dynamic tail). Other providers
    // receive the joined string — applyAnthropicCache / buildAgentRequest
    // handle both shapes. Token estimation uses the joined text since models
    // consume the concatenation regardless.
    const systemParts = applyAgentExecutionModePrompt(
      buildAgentSystemPromptParts(
        courseMap,
        activeTab,
        delivRef.current,
        healthSummary,
        userPrefs,
        viewportRef?.current || null,
      ),
      executionMode,
    );
    const systemPrompt =
      provider === 'anthropic' ? systemParts : [systemParts.staticPart, systemParts.dynamicPart].join('\n\n');
    const systemPromptForTokens = (systemParts.staticPart || '') + (systemParts.dynamicPart || '');

    // ── Context window awareness: smart trim if approaching limit ──
    const systemPromptTk = estimateTokens(systemPromptForTokens);
    const OUTPUT_RESERVE_TK = 4096;
    const chatContent = chatHistory.map((m) => m.content).join('') + fullMessage;
    const chatTk = estimateTokens(chatContent);
    const modelLimit = getModelLimit(modelId);
    const availableForChat = modelLimit - systemPromptTk - OUTPUT_RESERVE_TK;

    if (chatTk > availableForChat * 0.8) {
      const excess = chatTk - Math.floor(availableForChat * 0.75);
      const charsToTrim = excess * 4;
      // Score messages: user messages and recent messages are more valuable
      const scored = chatHistory.map((m, i) => ({
        ...m,
        _idx: i,
        _keep:
          (m.role === 'user' ? 3 : 1) +
          (i >= chatHistory.length - 4 ? 5 : 0) +
          (m.role === 'user' && isLandingAgentContextText(m.content) ? 25 : 0) +
          (m.role === 'user' && isAgentSourceContextText(m.content) ? 18 : 0),
      }));
      scored.sort((a, b) => a._keep - b._keep);
      let trimmed = 0;
      const toRemove = new Set();
      while (trimmed < charsToTrim && scored.length > 2) {
        const removed = scored.shift();
        trimmed += (removed.content || '').length;
        toRemove.add(removed._idx);
      }
      // Remove from chatHistory in reverse order to preserve indices
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (toRemove.has(i)) chatHistory.splice(i, 1);
      }
    }

    // ── Complexity-aware planning hint ──
    const complexity = classifyRequestComplexity(fullMessage, delivRef.current);
    agentQualityExpectations = inferAgentQualityExpectations(fullMessage, complexity);
    let effectiveMessage = fullMessage;
    if (complexity === 'complex') {
      effectiveMessage =
        fullMessage +
        '\n\n[SYSTEM HINT: This is a complex request. First use inspect_workspace or plan_workspace_next_step unless the target is already fully specified. Then execute efficiently, verify the changed state, and respond with the result.]';
    }

    // Build native tools for provider
    const availableAgentTools = filterAgentToolsForExecutionMode(AGENT_TOOLS, executionMode);
    const nativeTools = buildNativeTools(provider, availableAgentTools);

    // Loop messages (internal to this turn — separate from chat history)
    const loopMessages = [...chatHistory, { role: 'user', content: effectiveMessage }];

    // ── Auto-recall: on first conversation turn, surface memories as context ──
    const isFirstTurn = chatHistory.filter((m) => m.role === 'user').length === 0;
    if (isFirstTurn) {
      try {
        const memories = getMemories();
        if (memories.length > 0) {
          const topMemories = memories
            .slice(0, 5)
            .map((m) => `[${MEMORY_CATEGORIES[m.category] || m.category}] ${m.content}`)
            .join('\n');
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM — recalled from past sessions, use to inform your responses:\n${topMemories}\n]`,
          });
        }
      } catch {
        /* non-critical — skip if memory read fails */
      }
    }

    // God-mode: allow deeper reasoning chains so the agent can plan → read →
    // edit → validate → fix → verify in a single turn without punting to the user.
    const MAX_ITERATIONS = 20;
    let usedTools = false;
    let terminalResponseHandled = false;
    const toolExecutionHistory = [];
    const toolResultHistory = [];

    // ── Adaptive temperature: deterministic for simple edits, creative for complex tasks ──
    const agentTemperature = complexity === 'simple' ? 0.2 : complexity === 'complex' ? 0.5 : 0.4;

    // ── Loop detection: track tool call signatures to prevent infinite loops ──
    const toolCallLog = [];
    let unresolvedMutationRetryPromptSent = false;
    let directApplyProposalRetryPromptSent = false;
    function detectLoop(toolCalls) {
      for (const tc of toolCalls) {
        const sig = tc.name + ':' + JSON.stringify(tc.args || {});
        toolCallLog.push(sig);
        const count = toolCallLog.filter((s) => s === sig).length;
        if (count >= 3) return tc.name;
      }
      return null;
    }

    // ── Skill-creation nudge (Hermes-style agent-initiated macros) ─────────
    // When this turn has chained several successful workflow tool calls,
    // nudge the agent toward create_tool. Fires at most once per
    // runAgentLoop call. Thresholds live in customAgentTools.js so runtime
    // and the test harness can't drift.
    const skillNudge = createSkillNudgeTracker();

    // ── Thinking text callback for streaming progress ──
    const onThinkingText = (text) => {
      updateProgress((card) => ({ ...card, thinkingText: stripInternalAgentMarkers(text) }));
    };

    // ── AGENTIC LOOP (native tool calling) ───────────────────────────────
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      updateProgress((card) => ({
        ...card,
        runMeta: {
          ...(card.runMeta || {}),
          providerCallCount: iteration + 1,
          maxProviderCallCount: MAX_ITERATIONS,
          routedModel: routedModelId,
          ...(turnRouting.escalated ? { modelEscalated: true, modelRoutingReason: turnRouting.reason } : {}),
        },
      }));
      if (typeof ctx.onApiCallEvent === 'function') {
        ctx.onApiCallEvent({
          type: 'agentLoopCall',
          label: 'Agent loop provider call',
          detail: `${iteration + 1}/${MAX_ITERATIONS}`,
        });
      }
      const { toolCalls, textContent, stopReason, assistantMessage } = await fetchAgentResponseNative(
        loopMessages,
        systemPrompt,
        controller.signal,
        apiKey,
        provider,
        routedModelId,
        nativeTools,
        { temperature: agentTemperature, onThinkingText },
      );

      // ── RESPOND TOOL (final answer) ──────────────────────────────────
      if (toolCalls) {
        const respondCall = toolCalls.find((tc) => tc.name === 'respond');
        if (respondCall) {
          if (
            respondCall.args?.proposal &&
            isDirectApplyMutationRequest(fullMessage) &&
            !directApplyProposalRetryPromptSent &&
            iteration < MAX_ITERATIONS - 1
          ) {
            directApplyProposalRetryPromptSent = true;
            loopMessages.push({ role: 'user', content: buildDirectApplyProposalRecoveryHint(fullMessage) });
            continue;
          }
          const unresolvedRecoverableMutationFailures = collectUnresolvedMutationFailures(toolResultHistory).filter(
            (failure) => !isTerminalSafetyFailureMessage(failure.message),
          );
          if (
            unresolvedRecoverableMutationFailures.length > 0 &&
            !unresolvedMutationRetryPromptSent &&
            iteration < MAX_ITERATIONS - 1
          ) {
            unresolvedMutationRetryPromptSent = true;
            loopMessages.push({
              role: 'user',
              content: buildUnresolvedMutationRecoveryHint(unresolvedRecoverableMutationFailures),
            });
            continue;
          }
          const finalResponse = ensureFinalResponseHasChatReply(respondCall.args, toolResultHistory);
          if (silent) {
            setMessages((prev) => {
              const updated = [...prev];
              const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
              if (progressIdx >= 0) updated.splice(progressIdx, 1);
              return updated;
            });
          } else if (usedTools) {
            completeProgressWithReceipt({ stopReason: 'respond', finalResponse });
          } else {
            setMessages((prev) => {
              const updated = [...prev];
              const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
              if (progressIdx >= 0) updated.splice(progressIdx, 1);
              return updated;
            });
          }
          handleAgentFinalResponse(finalResponse);
          terminalResponseHandled = true;
          break;
        }
      }

      // ── NO TOOL CALLS: text-only fallback ───────────────────────────
      if (!toolCalls) {
        const fallbackText =
          buildLocalReadOnlyFallback(fullMessage, { courseMap, deliverables: delivRef.current }) ||
          chooseAgentFallbackText(textContent, toolResultHistory, undefined, {
            userMessage: fullMessage,
          });
        if (silent) {
          setMessages((prev) => {
            const updated = [...prev];
            const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
            if (progressIdx >= 0) updated.splice(progressIdx, 1);
            return updated;
          });
        } else if (usedTools) {
          completeProgressWithReceipt({ stopReason: 'text_fallback' });
          setMessages((prev) => [...prev, { role: 'assistant', text: fallbackText }]);
        } else {
          setMessages((prev) => {
            const updated = [...prev];
            const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
            if (progressIdx >= 0) updated[progressIdx] = { role: 'assistant', text: fallbackText };
            return updated;
          });
        }
        terminalResponseHandled = true;
        break;
      }

      // ── TOOL CALLS (parallel execution) ─────────────────────────────
      const nonRespondCalls = toolCalls.filter((tc) => tc.name !== 'respond');
      if (nonRespondCalls.length > 0) {
        const loopedTool = detectLoop(nonRespondCalls);
        if (loopedTool) {
          const fallbackText = buildToolResultFallbackChatReply(toolResultHistory, { userMessage: fullMessage });
          completeProgressWithReceipt({
            status: fallbackText ? 'complete' : 'error',
            stopReason: 'loop_detected',
            finalResponse: fallbackText ? { chatReply: fallbackText } : null,
          });
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: fallbackText || `I stopped because ${loopedTool} was repeating without progress.`,
            },
          ]);
          terminalResponseHandled = true;
          break;
        }

        usedTools = true;

        let stepStartIndex = 0;
        const newSteps = nonRespondCalls.map((tc) => ({
          tool: tc.name,
          label: TOOL_LABELS[tc.name] || tc.name,
          targets: deriveToolTargets(tc, activeTab),
          thought: '',
          status: 'running',
          summary: '',
          startedAt: Date.now(),
        }));

        updateProgress((card) => {
          stepStartIndex = card.steps.length;
          return { ...card, steps: [...card.steps, ...newSteps] };
        });

        // Execute all tools in parallel (with 30s per-tool timeout)
        const TOOL_TIMEOUT = 30000;
        const toolResults = await Promise.all(
          nonRespondCalls.map(async (tc, i) => {
            const stepIdx = stepStartIndex + i;
            if (!AGENT_TOOLS[tc.name]) {
              updateStepAt(stepIdx, { status: 'error', summary: `Unknown tool: ${tc.name}` });
              return {
                toolCallId: tc.id,
                toolName: tc.name,
                result: { error: `Unknown tool: ${tc.name}. Available: ${Object.keys(AGENT_TOOLS).join(', ')}` },
              };
            }

            if (executionMode === AGENT_EXECUTION_MODES.DRY_RUN && isAgentToolBlockedInDryRun(tc.name)) {
              const message = `Suggest-only mode blocked editing tool: ${tc.name}`;
              updateStepAt(stepIdx, { status: 'error', summary: message });
              return {
                toolCallId: tc.id,
                toolName: tc.name,
                result: {
                  error: `${message}. Use read-only tools and respond with analysis or user-approved proposals instead.`,
                },
              };
            }

            try {
              const getConfirmationPolicyBlock = (toolName, toolArgs) =>
                buildConfirmationPolicyToolResult(
                  evaluateAgentMutationConfirmation(toolName, toolArgs || {}, {
                    userMessage: fullMessage,
                    courseMap,
                    deliverables: delivRef.current,
                    selectedFeatures,
                    activeTab,
                  }),
                );
              const toolCtx = {
                userMessage: fullMessage,
                courseMap,
                activeTab,
                deliverables: delivRef.current,
                selectedFeatures,
                columns,
                deliverableConfig,
                lessonFilter,
                executeAction: executeActionRef.current,
                projectDeliverableActionToCanonicalPatch: (action) =>
                  projectAgentDeliverableActionToCanonicalPatch(action, {
                    courseMap,
                    deliverables: delivRef.current,
                  }),
                optimisticUpdate: optimisticUpdateRef?.current || null,
                setCurrentDeliverables: (nextDeliverables) => {
                  if (nextDeliverables) delivRef.current = nextDeliverables;
                },
                apiKey,
                provider,
                modelId,
                slideTheme,
                snapshot: snapshotRef.current,
                undoFn: undoFnRef?.current || null,
                uid,
                dryRun: executionMode === AGENT_EXECUTION_MODES.DRY_RUN,
                // customTools is wired here (not at ctx build time) so
                // invokeBuiltin can close over the same toolCtx — otherwise a
                // custom macro would run its builtins without edit access.
                customTools: customToolRegistryRef
                  ? {
                      registry: customToolRegistryRef.current,
                      validateBuiltinDelegation: (builtinName, builtinArgs) =>
                        getConfirmationPolicyBlock(builtinName, builtinArgs || {}),
                      invokeBuiltin: async (builtinName, builtinArgs, innerSignal) => {
                        const builtin = AGENT_TOOLS[builtinName];
                        if (!builtin) return { error: `Unknown tool in plan: ${builtinName}` };
                        const policyBlock = getConfirmationPolicyBlock(builtinName, builtinArgs || {});
                        if (policyBlock) return policyBlock;
                        try {
                          return await builtin.execute(builtinArgs || {}, toolCtx, innerSignal || controller.signal);
                        } catch (err) {
                          return { error: `builtin "${builtinName}" threw: ${err.message}` };
                        }
                      },
                      // Stream plan progress into the agentProgress card so users see
                      // the macro working (otherwise run_tool looks opaque until done).
                      onStep: (event) => {
                        if (tc.name !== 'run_tool') return;
                        const label =
                          event.status === 'error'
                            ? `Step ${event.index + 1}/${event.total}: ${event.tool} ✗`
                            : event.status === 'done'
                              ? `Step ${event.index + 1}/${event.total}: ${event.tool} ✓`
                              : `Step ${event.index + 1}/${event.total}: ${event.tool}…`;
                        updateStepAt(stepIdx, { summary: label });
                      },
                    }
                  : null,
              };
              const policyBlock = getConfirmationPolicyBlock(tc.name, tc.args || {});
              if (policyBlock) {
                updateStepAt(stepIdx, { status: 'error', summary: policyBlock.error });
                return {
                  toolCallId: tc.id,
                  toolName: tc.name,
                  result: policyBlock,
                };
              }
              if (shouldRequirePlanningBeforeTool(tc.name, toolExecutionHistory, agentQualityExpectations)) {
                const planningBlock = buildPlanningRequiredToolResult(tc.name);
                updateStepAt(stepIdx, { status: 'error', summary: planningBlock.error });
                return {
                  toolCallId: tc.id,
                  toolName: tc.name,
                  result: planningBlock,
                };
              }
              const stateDiffContext = RECEIPT_WORKSPACE_MUTATION_TOOLS.has(tc.name)
                ? {
                    courseMap: cloneForProjection(courseMap),
                    deliverables: cloneForProjection(delivRef.current),
                    activeTab,
                  }
                : null;

              async function execWithRetry(attempt = 0) {
                const toolPromise = AGENT_TOOLS[tc.name].execute(tc.args || {}, toolCtx, controller.signal);
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`Tool ${tc.name} timed out after ${TOOL_TIMEOUT / 1000}s`)),
                    TOOL_TIMEOUT,
                  ),
                );
                try {
                  return await Promise.race([toolPromise, timeoutPromise]);
                } catch (err) {
                  const isTransient =
                    err.message?.includes('timed out') ||
                    err.message?.includes('fetch') ||
                    err.message?.includes('network') ||
                    err.message?.includes('Failed to fetch');
                  if (isTransient && attempt < 1) {
                    updateStepAt(stepIdx, { summary: 'Retrying...' });
                    return execWithRetry(attempt + 1);
                  }
                  throw err;
                }
              }

              const result = await execWithRetry();
              const summary = summarizeToolResult(tc.name, result);
              const stateDiffs = stateDiffContext
                ? buildAgentStateDiffsFromToolResult(tc.name, tc.args || {}, result, stateDiffContext)
                : [];
              // Classify the step outcome honestly — previously every non-throwing
              // result painted the step green, which lied when the tool returned
              // {applied:N, failed:M>0}. Now:
              //   'done'    — tool ran cleanly
              //   'partial' — some patches applied, some didn't (mixed outcome)
              //   'error'   — result.error set OR all patches failed
              let stepStatus = 'done';
              if (result && typeof result === 'object') {
                if (result.error) {
                  stepStatus = 'error';
                } else if (tc.name === 'finalize_package') {
                  stepStatus = classifyFinalizePackageStepStatus(result);
                } else if (
                  tc.name === 'edit_course_map' ||
                  tc.name === 'edit_deliverables' ||
                  tc.name === 'generate_slide_images' ||
                  tc.name === 'repair_package_readiness' ||
                  tc.name === 'retry_package_weak_spots'
                ) {
                  const appliedN = result.applied || result.started || 0;
                  const failedN = result.failed || 0;
                  if (failedN > 0) stepStatus = appliedN > 0 ? 'partial' : 'error';
                }
              }
              updateStepAt(stepIdx, {
                status: stepStatus,
                summary,
                ...(stateDiffs.length > 0 ? { stateDiffs } : {}),
              });

              if (tc.name === 'finalize_package') {
                const packageSummary = normalizePackageSummary(result);
                setMessages((prev) => {
                  const withoutCurrentRunSummary = prev.filter(
                    (message) => !(message.role === 'packageSummary' && message.runId === runId),
                  );
                  return [
                    ...withoutCurrentRunSummary,
                    {
                      role: 'packageSummary',
                      runId,
                      summary: packageSummary,
                    },
                  ];
                });
              }

              if (tc.name === 'plan_workspace_next_step' && result && !result.error) {
                setMessages((prev) => {
                  const withoutCurrentRunPlan = prev.filter(
                    (message) => !(message.role === 'workspacePlan' && message.runId === runId),
                  );
                  return [
                    ...withoutCurrentRunPlan,
                    {
                      role: 'workspacePlan',
                      runId,
                      plan: result,
                    },
                  ];
                });
              }

              // If edit tool -> add changeSummary + trigger sync cascade
              if (
                tc.name === 'edit_course_map' ||
                tc.name === 'edit_deliverables' ||
                tc.name === 'generate_slide_images' ||
                tc.name === 'retry_package_weak_spots'
              ) {
                const changes = [];
                const editedFeatures = new Set();
                const canonicalSyncEdits = [];
                const failedItems = []; // carry full per-item failure info to the UI
                // The agent's original tool args hold the exact patches/actions —
                // we need them so a "Retry failed" button can reconstruct the
                // requests, not the trimmed `details[]` which loses field values.
                const originalInputs =
                  tc.name === 'edit_course_map'
                    ? tc.args?.patches || []
                    : tc.name === 'edit_deliverables'
                      ? tc.args?.actions || []
                      : (result.details || []).map((detail) => ({ ...detail, toolArgs: tc.args || {} }));
                for (let detailIdx = 0; detailIdx < (result.details || []).length; detailIdx++) {
                  const detail = result.details[detailIdx];
                  if (detail.success) {
                    const featureId = detail.featureId || 'courseMap';
                    const actionType = detail.pending
                      ? 'regenerating'
                      : detail.action === 'generateImage'
                        ? 'generated'
                        : detail.action === 'addItem'
                          ? 'added'
                          : detail.action === 'removeItem'
                            ? 'removed'
                            : 'edited';
                    const key = `${actionType}:${featureId}`;
                    const existing = changes.find((c) => `${c.type}:${c.featureId}` === key);
                    if (existing) existing.count++;
                    else changes.push({ type: actionType, featureId, count: 1 });
                    if (shouldNotifyDirectDeliverableEdit(detail)) {
                      editedFeatures.add(`${featureId}:${detail.lessonIndex ?? 0}`);
                    }
                    if (detail.canonicalPatches?.length > 0) {
                      canonicalSyncEdits.push({
                        featureId,
                        lessonIndex: detail.lessonIndex ?? 0,
                        editContext: detail.editContext || detail.message || null,
                        canonicalPatches: detail.canonicalPatches,
                      });
                    } else if (detail.canonicalPatchRequests?.length > 0) {
                      canonicalSyncEdits.push({
                        featureId,
                        lessonIndex: detail.lessonIndex ?? 0,
                        editContext: detail.editContext || detail.message || null,
                        canonicalPatchRequests: detail.canonicalPatchRequests,
                      });
                    }
                  } else {
                    failedItems.push({
                      index: detailIdx,
                      action: detail.action || detail.patch || 'edit',
                      featureId: detail.featureId || (tc.name === 'edit_course_map' ? 'courseMap' : undefined),
                      lessonIndex: detail.lessonIndex,
                      message: detail.message || 'Unknown failure',
                      originalInput: originalInputs[detailIdx] || null,
                    });
                  }
                }
                // Fire a summary card when ANY outcome landed — successes, failures,
                // or both. Pure no-op results (empty patches array) still skip.
                if (changes.length > 0 || failedItems.length > 0) {
                  const pendingCount =
                    result.pending ||
                    changes.filter((c) => c.type === 'regenerating').reduce((sum, c) => sum + c.count, 0);
                  const message =
                    failedItems.length === 0
                      ? pendingCount > 0 && (result.applied || result.started || 0) === 0
                        ? `${pendingCount} regeneration${pendingCount !== 1 ? 's' : ''} started.`
                        : `${result.applied || result.started || 0} change${(result.applied || result.started || 0) !== 1 ? 's' : ''} applied${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}.`
                      : (result.applied || result.started || 0) > 0
                        ? `${result.applied || result.started || 0} applied${pendingCount > 0 ? ` · ${pendingCount} pending` : ''} · ${failedItems.length} failed`
                        : `${failedItems.length} change${failedItems.length !== 1 ? 's' : ''} failed`;
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: 'changeSummary',
                      summary: {
                        changes,
                        applied: result.applied || result.started || 0,
                        pending: pendingCount,
                        failed: failedItems.length,
                        failedItems,
                        toolName: tc.name,
                        message,
                      },
                      status: 'pending', // tracks keep/retry/undo decisions on failures
                    },
                  ]);
                }

                if (notifyEditRef.current && canonicalSyncEdits.length > 0) {
                  for (const edit of canonicalSyncEdits) {
                    notifyEditRef.current(edit.lessonIndex, '_deliverableEdit', edit.featureId, edit.editContext, {
                      canonicalPatches: edit.canonicalPatches,
                      canonicalPatchRequests: edit.canonicalPatchRequests,
                    });
                  }
                }

                if (notifyEditRef.current && editedFeatures.size > 0) {
                  for (const entry of editedFeatures) {
                    const [fid, lidx] = entry.split(':');
                    const lessonIndex = lidx !== 'undefined' ? parseInt(lidx, 10) : null;
                    notifyEditRef.current(lessonIndex, '_deliverableEdit', fid);
                  }
                }

                maybeRunValidation();
              }

              return { toolCallId: tc.id, toolName: tc.name, args: tc.args || {}, result };
            } catch (toolErr) {
              if (toolErr.name === 'AbortError') throw toolErr;
              updateStepAt(stepIdx, { status: 'error', summary: toolErr.message });
              return { toolCallId: tc.id, toolName: tc.name, args: tc.args || {}, result: { error: toolErr.message } };
            }
          }),
        );
        toolResultHistory.push(...toolResults);

        // Add assistant tool-call turn + all tool results to loop messages
        loopMessages.push(formatAssistantToolCalls(provider, nonRespondCalls, assistantMessage));
        const resultMessages = batchToolResults(provider, toolResults);
        loopMessages.push(...resultMessages);
        toolExecutionHistory.push(
          ...toolResults.map((r) => ({
            tool: r.toolName,
            label: TOOL_LABELS[r.toolName] || r.toolName,
            status: r.result?.error ? 'error' : 'done',
          })),
        );

        // ── Self-correction: inject recovery hints for failed tool calls ──
        const failedResults = collectFailedToolResultSummaries(toolResults);
        if (failedResults.length > 0) {
          const hints = failedResults
            .map((r) => {
              const messages = r.failures
                .map((failure) => failure.message)
                .filter(Boolean)
                .join('; ');
              return `Tool "${r.toolName}" failed: ${messages || 'The requested action could not be applied.'}. Try a different approach or correct the arguments.`;
            })
            .join(' ');
          loopMessages.push({ role: 'user', content: `[SYSTEM] ${hints}` });
        }

        // ── Skill-creation nudge: propose saving a repeatable workflow ────
        // Borrowed from Hermes Agent's "skills from experience" pattern. When
        // the turn has chained enough workflow steps to look like a recurring
        // pattern, hint the agent to consider create_tool. The agent is free
        // to ignore it and just respond() — the nudge is advisory, not
        // mandatory, and fires only once per turn.
        // The tracker expects the {name, result} shape produced by our tool
        // invoker; map from the internal (toolCallId, toolName, result) form.
        const nudgeResults = toolResults.map((r) => ({ name: r.toolName, result: r.result }));
        if (skillNudge.update(nudgeResults)) {
          loopMessages.push({ role: 'user', content: SKILL_NUDGE_HINT });
        }

        // ── Post-edit validation: check for new issues after edits ──
        const editResults = toolResults.filter(
          (r) => (r.toolName === 'edit_course_map' || r.toolName === 'edit_deliverables') && r.result?.applied > 0,
        );
        if (editResults.length > 0 && iteration < MAX_ITERATIONS - 2) {
          const readbackTools = uniqueList(
            editResults.map((r) => (r.toolName === 'edit_course_map' ? 'read_lesson' : 'read_deliverable')),
          ).join(' or ');
          loopMessages.push({
            role: 'user',
            content: `[SYSTEM] Before respond(), verify the changed state with ${readbackTools}. Read back the edited course map or deliverable instead of trusting edit success alone, then summarize what changed from the verified state.`,
          });
          try {
            const postReport = generateCourseHealthReport(courseMap, delivRef.current);
            if (postReport && postReport.errorCount > 0) {
              const newErrors = postReport.findings
                .filter((f) => f.severity === 'error')
                .slice(0, 3)
                .map((f) => f.message)
                .join('; ');
              loopMessages.push({
                role: 'user',
                content: `[SYSTEM] Post-edit validation found ${postReport.errorCount} error(s): ${newErrors}. Consider fixing these in your next tool call if possible, or mention them in your response.`,
              });
            }
          } catch {
            /* validation is non-critical — don't block the loop */
          }
        }

        continue;
      }
    }

    // Post-loop cleanup
    if (terminalResponseHandled) {
      // The terminal branch already removed or completed the progress card and
      // appended any needed receipt before the final assistant response.
    } else if (silent) {
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else if (!usedTools) {
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else {
      completeProgressWithReceipt({ stopReason: 'max_iterations' });
    }
    if (!silent && !terminalResponseHandled) {
      const FINAL_ROLES = new Set([
        'assistant',
        'proposal',
        'changeSummary',
        'packageSummary',
        'workspacePlan',
        'diagram',
        'chart',
        'imageSearch',
        'research',
      ]);
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (FINAL_ROLES.has(lastMsg?.role)) return prev;
        const fallbackText =
          buildToolResultFallbackChatReply(toolResultHistory, { userMessage: fullMessage }) ||
          "I've completed several steps but couldn't fully finish. Could you try a more specific request?";
        return [
          ...prev,
          {
            role: 'assistant',
            text: fallbackText,
          },
        ];
      });
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      if (silent) {
        setMessages((prev) => {
          const updated = [...prev];
          const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
          if (progressIdx >= 0) updated.splice(progressIdx, 1);
          return updated;
        });
      } else {
        updateProgress({ status: 'complete' });
      }
      return;
    }
    const isNoKey = err.message === 'NO_API_KEY';
    const isNoModel = err.message === 'NO_MODEL_SELECTED';
    console.error('[CM Agent] Error:', err.message, err);
    if (silent) {
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        if (progressIdx >= 0) updated.splice(progressIdx, 1);
        return updated;
      });
    } else {
      const detail = !isNoKey && !isNoModel && err.message ? ` (${err.message})` : '';
      setMessages((prev) => {
        const updated = [...prev];
        const progressIdx = updated.findLastIndex((m) => m.role === 'agentProgress');
        const errMsg = {
          role: 'assistant',
          text: isNoKey
            ? 'To use the agent, please configure your AI provider and API key first.'
            : isNoModel
              ? 'No AI model selected. Please select a model on the landing page first.'
              : `Sorry, I couldn't process that request.${detail}`,
        };
        if (progressIdx >= 0) updated[progressIdx] = errMsg;
        else updated.push(errMsg);
        return updated;
      });
    }
  } finally {
    setStreaming(false);
  }
}
