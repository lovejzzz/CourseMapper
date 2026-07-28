import { composeAlgiSkeleton, extractExpectedSessions, extractSourceFromPrompt } from './algiComposer';
import { extractExplicitLessonSequence } from './explicitLessonSequence';

export const SCION_EXPLICIT_SEQUENCE_ROUTE_PROTOCOL = 'scion-compiler-explicit-sequence-route-v1';

/**
 * Admit the smallest sufficient Scion capability before loading model weights.
 *
 * This route is intentionally narrow: the native-skeleton prompt must pin an
 * exact session count and the instructor source must contain the same number
 * of explicitly ordered lesson topics. Ordinary prose and partial coverage
 * lists still go to Gemma because the compiler is not allowed to infer a
 * schedule the instructor did not state.
 */
export function composeScionExplicitSequenceSkeleton(userPrompt = '') {
  const expectedSessions = extractExpectedSessions(userPrompt);
  if (!Number.isInteger(expectedSessions) || expectedSessions < 2 || expectedSessions > 52) return null;

  const source = extractSourceFromPrompt(userPrompt);
  const topics = extractExplicitLessonSequence(source, { expectedCount: expectedSessions });
  if (topics.length !== expectedSessions) return null;
  const distinctTopics = new Set(topics.map((topic) => String(topic).trim().toLocaleLowerCase()));
  if (distinctTopics.size !== expectedSessions) return null;

  const text = composeAlgiSkeleton(userPrompt);
  let compiledTitles = [];
  try {
    compiledTitles = JSON.parse(text).sessions?.map((session) => String(session?.title || '').trim()) || [];
  } catch {
    return null;
  }
  if (compiledTitles.length !== expectedSessions || compiledTitles.some((title, index) => title !== topics[index])) {
    return null;
  }

  return {
    text,
    topics,
    route: {
      protocol: SCION_EXPLICIT_SEQUENCE_ROUTE_PROTOCOL,
      mode: 'base-only',
      taskFamily: 'course-map',
      reason: 'compiler-owned-explicit-lesson-sequence',
      adapterId: null,
      nativeAdapterActive: false,
      exactLessonSequence: true,
      modelCalls: 0,
      voicePassSkipped: true,
    },
  };
}

export function runScionExplicitSequencePreflight({
  userPrompt = '',
  existingText = '',
  onChunk,
  traceBase = {},
  recordApiCallEvent,
} = {}) {
  const compiledStructure = composeScionExplicitSequenceSkeleton(userPrompt);
  if (!compiledStructure?.text) return null;
  const routeEvent = {
    type: 'scionAdapterRoute',
    label: 'Scion explicit course sequence compiled',
    detail: `${compiledStructure.topics.length} instructor-listed lessons · no model activation`,
    stage: 'local-compiler',
    ...traceBase,
    routeProtocol: compiledStructure.route.protocol,
    routeMode: compiledStructure.route.mode,
    taskFamily: compiledStructure.route.taskFamily,
    routeReason: compiledStructure.route.reason,
    exactLessonSequence: true,
    nativeAdapterActive: false,
    routeModelCalls: 0,
    voicePassSkipped: true,
    execution: 'browser-compiler',
  };
  recordApiCallEvent?.({
    type: 'scionAdaptiveRoute',
    label: 'Scion compiled the instructor lesson sequence',
    detail: `Explicit ${compiledStructure.topics.length}-lesson structure · zero model download · zero model inference`,
    stage: 'local-compiler',
    ...traceBase,
    routeReason: compiledStructure.route.reason,
    progress: 1,
    modelRequests: 0,
    spendUsd: 0,
    execution: 'browser-compiler',
  });
  recordApiCallEvent?.(routeEvent);
  const fullText = existingText + compiledStructure.text;
  onChunk?.(fullText, 1);
  recordApiCallEvent?.({
    type: 'providerResponseDone',
    label: 'Scion course structure compiled',
    detail: `${compiledStructure.text.length} chars from the instructor sequence`,
    stage: 'local-compiler',
    ...traceBase,
    outputChars: compiledStructure.text.length,
    streamChunkCount: 0,
    finishReason: 'stop',
    execution: 'browser-compiler',
  });
  return {
    routeEvent,
    response: {
      fullText,
      finishReason: 'stop',
      adaptiveRoute: 'scion-explicit-sequence-compiler',
      modelRequests: 0,
      adapterRoutes: [routeEvent],
    },
  };
}

export function attachScionCompilerRoute(target, route) {
  if (!target || typeof target !== 'object' || !route || typeof route !== 'object') return target;
  Object.defineProperty(target, 'scionRoute', {
    configurable: true,
    enumerable: false,
    value: { ...route },
    writable: false,
  });
  return target;
}

export function readScionCompilerRoute(target) {
  const route = target?.scionRoute;
  return route && typeof route === 'object' ? { ...route } : null;
}
