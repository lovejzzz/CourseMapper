// src/lib/scionPassB.js — the Scion Pass B orchestration (V2.1 Workstream D),
// lazy-loaded so the local-provider-only wiring stays out of the main AppFlow
// chunk (the bundle budget ratchets down; feature work code-splits).
//
// Two entry points the compiler calls only when provider === 'local':
//   scionKernelSchemaProfile — the declared json_schema contract for the call
//   runScionPasses           — the D3 quality passes + D4 flywheel on the raw
//                              batch JSON, returning the processed text
import { kernelBatchSchemaProfile, scionPassesEnabled } from './scionContracts';
import { applyScionKernelPasses, formatScionPassSummary } from './scionPasses';
import { postFlywheelEvents } from './scionFlywheel';

/**
 * The D1/D2 request options for the main Pass B call: the declared
 * json_schema contract + greedy-default temperature (recovery retries sample).
 */
export function scionCallOpts({
  prompt,
  expectedLessonIds,
  contentSourcedLessonIds,
  includeCourseLevel,
  recoveryAttempt,
}) {
  const mcCount = (prompt.itemPlan || []).filter((slot) => slot.type === 'multiple_choice').length || 4;
  return {
    schema: kernelBatchSchemaProfile({ expectedLessonIds, contentSourcedLessonIds, includeCourseLevel, mcCount }),
    temperature: recoveryAttempt > 0 ? 0.7 : 0,
  };
}

/**
 * Apply the D3 passes to a raw Pass B batch and bank D4 flywheel pairs.
 * Self-guarding: returns rawText unchanged if passes are disabled or anything
 * throws — the compiler calls this without its own try/catch.
 * @returns {Promise<string>} the processed batch JSON
 */
export async function runScionPasses({
  rawText,
  streamProvider,
  provider,
  apiKey,
  modelId,
  modelCapabilities,
  generationPlan,
  signal,
  recordEvent,
  prompt,
  expectedLessonIds,
  contentSourcedLessonIds,
  courseName,
}) {
  if (!scionPassesEnabled()) return rawText;
  try {
    return await applyPasses();
  } catch {
    return rawText; // passes are best-effort — the draft ships
  }
  async function applyPasses() {
    const generateJson = async ({ system, user, schemaProfile, maxOutputTokens, temperature }) => {
      const passResult = await streamProvider(provider, apiKey, modelId, system, user, {
        modelCapabilities,
        generationPlan,
        featureId: 'blueprintEnrichment',
        task: 'scionPass',
        schema: schemaProfile,
        ...(temperature ? { temperature } : {}),
        maxOutputTokens: maxOutputTokens || 2000,
        allowProviderFallback: false,
        onApiCallEvent: recordEvent,
        signal,
      });
      return {
        text: passResult?.fullText || '',
        finishReason: passResult?.finishReason || passResult?.stopReason || '',
        constrainedTier: passResult?.constrainedTier || passResult?.constrained || '',
      };
    };
    const passOutcome = await applyScionKernelPasses(rawText, {
      promptLessons: prompt.lessons,
      generateJson,
      contentSourcedLessonIds,
    });
    if (passOutcome.events.length > 0) {
      recordEvent({
        type: 'pipelineDecision',
        label: 'Scion quality passes',
        detail: passOutcome.events
          .map((event) => `${event.pass}:${event.lessonId}${event.action ? ` ${event.action}` : ''}`)
          .join(' · '),
        featureId: 'blueprintEnrichment',
        task: 'scionPass',
      });
    }
    recordEvent({
      type: 'scionPassTelemetry',
      label: 'Scion pass telemetry',
      detail: formatScionPassSummary(passOutcome.telemetry),
      featureId: 'blueprintEnrichment',
      task: 'scionPass',
      scionQuality: passOutcome.telemetry,
    });
    postFlywheelEvents(passOutcome.events, { course: courseName, chunk: expectedLessonIds });
    return passOutcome.text;
  }
}
