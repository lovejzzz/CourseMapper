import {
  quantitySelectionMessages,
  quantitySelectionGrammar,
  normalizeQuantitySelection,
  QUANTITY_SELECTION_PROTOCOL,
} from '/src/lib/scionQuantitySelection.js';
import {
  assessTeachingProposal,
  SCION_TEACHING_PROPOSAL_PROTOCOL,
  teachingProposalInputRevision,
} from '/src/lib/scionTeachingProposal.js';
import * as runtime from '/src/lib/scionBrowserWllama.js';

// Research-only caller. No product import until independent real-run review.
export async function proposeSelectedCounts(request, onProgress) {
  const snapshot = structuredClone(request),
    started = performance.now();
  const receipt = {
    protocol: QUANTITY_SELECTION_PROTOCOL,
    inputRevision: teachingProposalInputRevision(snapshot),
    startedAt: new Date().toISOString(),
    attempts: [],
    modelCalls: 0,
  };
  try {
    onProgress?.('Loading local model');
    const loadStarted = performance.now();
    await runtime.loadScionBrowserWllama();
    receipt.loadMs = Math.round(performance.now() - loadStarted);
    receipt.runtime = runtime.getScionBrowserWllamaStatus();
    if (receipt.runtime?.runtime?.grammar !== 'gbnf-state-v1') throw Error('Verified grammar-state runtime required.');
    let feedback, best;
    for (let attempt = 0; attempt < 2; attempt++) {
      onProgress?.(`Selecting source roles: call ${attempt + 1}`);
      const entry = {
        messages: quantitySelectionMessages(snapshot, feedback),
        grammar: quantitySelectionGrammar(snapshot),
      };
      receipt.attempts.push(entry);
      receipt.modelCalls++;
      const time = performance.now();
      entry.raw = await runtime.completeScionBrowserWllama(entry.messages, {
        maxNewTokens: 1024,
        temperature: 0,
        topK: 1,
        topP: 1,
        seed: 7,
        thinking: false,
        grammar: entry.grammar,
        taskFamily: 'unclassified',
        promptProtocol: QUANTITY_SELECTION_PROTOCOL,
        onCompletion: (result) => {
          entry.completion = result;
        },
        onAdapterRoute: (route) => {
          entry.route = route;
        },
      });
      entry.inferenceMs = Math.round(performance.now() - time);
      if (entry.completion?.finishReason === 'length')
        return { status: 'needs-review', message: 'Output limit; no partial selection applied.', receipt };
      let assessed;
      try {
        entry.normalized = normalizeQuantitySelection(JSON.parse(entry.raw), snapshot);
        assessed = assessTeachingProposal(JSON.stringify(entry.normalized), snapshot, SCION_TEACHING_PROPOSAL_PROTOCOL);
      } catch (error) {
        assessed = { issues: [error.message], missing: [], repairable: true, bindings: {} };
      }
      entry.assessment = assessed;
      const score = Object.values(assessed.bindings).filter((b) => b.inputId).length - assessed.issues.length;
      if (!best || score > best.score || (!assessed.issues.length && best.assessment.issues.length))
        best = { score, assessment: assessed, attempt: attempt + 1 };
      if (!assessed.repairable) break;
      feedback = assessed.issues;
    }
    receipt.selectedAttempt = best.attempt;
    return { status: 'review', ...best.assessment, receipt };
  } catch (error) {
    receipt.error = error.message;
    return { status: 'failed', receipt };
  } finally {
    receipt.totalMs = Math.round(performance.now() - started);
    receipt.finishedAt = new Date().toISOString();
  }
}
