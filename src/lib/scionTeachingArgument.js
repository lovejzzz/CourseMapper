import {
  inspectTeachingArgumentProposal,
  teachingArgumentProposalMessages,
  TEACHING_ARGUMENT_PROPOSAL_PROTOCOL,
} from './teachingArgumentProposal.js';
import { canonicalJson } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';

let running = false;

/** One local call; malformed or truncated output never becomes a teaching task. */
export async function proposeTeachingArgument(
  request,
  { signal, onProgress, runtimeLoader = () => import('./scionBrowserWllama.js') } = {},
) {
  const receipt = {
    protocol: TEACHING_ARGUMENT_PROPOSAL_PROTOCOL,
    startedAt: new Date().toISOString(),
    modelCalls: 0,
    settings: { maxNewTokens: 2048, temperature: 0, topK: 1, topP: 1, seed: 7, thinking: false },
  };
  const started = performance.now();
  let ownsRun = false;
  const cancelled = () => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  try {
    cancelled();
    // Snapshot only model-facing fields before yielding; evaluator references
    // and later edits must not change this run or enter its recorded prompt.
    const messages = teachingArgumentProposalMessages(request);
    const { objective, sources: inputs } = JSON.parse(messages[1].content);
    receipt.inputRevision = sha256HexSync(canonicalJson({ objective, inputs }));
    receipt.messages = messages;
    if (running) return { status: 'busy', approved: false, receipt };
    running = true;
    ownsRun = true;
    const api = await runtimeLoader();
    cancelled();
    onProgress?.('Loading local model…');
    const loadStarted = performance.now();
    await api.loadScionBrowserWllama({ signal });
    receipt.loadMs = Math.round(performance.now() - loadStarted);
    cancelled();
    receipt.runtime = structuredClone(api.getScionBrowserWllamaStatus?.() ?? null);
    onProgress?.('Drafting task and reasoning…');
    const inferenceStarted = performance.now();
    receipt.modelCalls = 1;
    try {
      receipt.raw = await api.completeScionBrowserWllama(messages, {
        ...receipt.settings,
        signal,
        taskFamily: 'unclassified',
        promptProtocol: receipt.protocol,
        onCompletion: (value) => {
          receipt.completion = structuredClone(value);
        },
        onAdapterRoute: (value) => {
          receipt.route = structuredClone(value);
        },
      });
    } finally {
      receipt.inferenceMs = Math.round(performance.now() - inferenceStarted);
    }
    cancelled();
    if (receipt.completion?.finishReason === 'length')
      return { status: 'invalid', approved: false, message: 'The proposal exceeded its output limit.', receipt };
    let proposal;
    try {
      proposal = JSON.parse(receipt.raw);
    } catch {
      return { status: 'invalid', approved: false, message: 'The proposal is not complete JSON.', receipt };
    }
    const inspection = inspectTeachingArgumentProposal(proposal, inputs);
    receipt.inspection = structuredClone(inspection);
    return { ...inspection, receipt };
  } catch (error) {
    receipt.error = error.message;
    return {
      status: signal?.aborted || error.name === 'AbortError' ? 'cancelled' : 'unavailable',
      approved: false,
      message: error.message,
      receipt,
    };
  } finally {
    receipt.elapsedMs = Math.round(performance.now() - started);
    if (ownsRun) running = false;
  }
}
