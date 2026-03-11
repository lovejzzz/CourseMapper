/**
 * useChatMessages.js — Message history routing: final response handling,
 * legacy JSON parsing, and research request / synthesis flow.
 *
 * Extracted from useChatRouter.js (Issue #5) to reduce file size.
 */

import { buildAgentSystemPrompt } from '../../lib/agentPrompts';
import { executeResearch } from '../../lib/academicSearch';
import { preValidateAction } from '../../lib/agentActions';
import {
  streamChat, buildAgentChatHistory,
} from './useStreamProcessor';

/**
 * Handle the final response from the agentic loop (unwrapped from the respond tool).
 *
 * @param {Object} response          - The parsed response args from the respond tool
 * @param {Object} ctx               - Shared context from useChatRouter
 * @param {Function} ctx.setMessages
 * @param {Object}   ctx.delivRef
 * @param {Object}   ctx.courseMap
 * @param {string}   ctx.provider
 * @param {string}   ctx.apiKey
 * @param {Function} ctx.sendAgentMessage
 */
export function handleAgentFinalResponse(response, ctx) {
  const { setMessages, delivRef, courseMap, provider, apiKey, sendAgentMessage } = ctx;

  if (!response) {
    setMessages(prev => [...prev, { role: 'assistant', text: "I couldn't generate a response." }]);
    return;
  }

  // Chat reply
  if (response.chatReply) {
    setMessages(prev => [...prev, { role: 'assistant', text: response.chatReply }]);
    return;
  }

  // Proposal — pre-validate options before showing
  if (response.proposal) {
    const options = response.proposal.options || [];
    const validationResults = options.map(opt => {
      if (!opt.action) return { opt, valid: true };
      const validation = preValidateAction(opt.action, {
        deliverables: delivRef.current,
        courseMap,
      });
      return { opt, valid: validation.valid, reason: validation.reason };
    });
    const validOptions = validationResults.filter(r => r.valid).map(r => r.opt);

    if (validOptions.length === 0 && options.length > 0) {
      const errors = validationResults
        .filter(r => !r.valid)
        .map(r => `${r.opt.label} "${r.opt.title}": ${r.reason}`)
        .join('; ');
      sendAgentMessage(
        `All proposal options were invalid: ${errors}. `
        + `Please re-generate targeting deliverables with status "done" and valid lesson indices.`,
        { silent: true },
      );
      return;
    }

    setMessages(prev => [...prev, {
      role: 'proposal',
      proposal: { ...response.proposal, options: validOptions },
      status: 'pending',
    }]);
    return;
  }

  // Chart
  if (response.chart) {
    setMessages(prev => [...prev, {
      role: 'chart',
      chart: response.chart,
      status: 'complete',
    }]);
    return;
  }

  // Diagram
  if (response.diagram) {
    setMessages(prev => [...prev, {
      role: 'diagram',
      diagram: response.diagram,
      status: 'complete',
    }]);
    return;
  }

  // Image generation
  if (response.imageSearch) {
    setMessages(prev => [...prev, {
      role: 'imageSearch',
      imageSearch: response.imageSearch,
      status: 'complete',
      provider,
      apiKey,
    }]);
    return;
  }

  // Fallback: try to extract any text
  const text = response.chatReply || response.message || JSON.stringify(response);
  setMessages(prev => [...prev, { role: 'assistant', text }]);
}

/**
 * Handle legacy JSON-in-text response (used only by research synthesis).
 */
export function handleLegacyResponse(fullText, ctx) {
  const { setMessages, provider, apiKey } = ctx;

  let parsed = null;
  try {
    let cleaned = (fullText || '').trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const start = cleaned.indexOf('{');
    if (start >= 0) {
      let depth = 0, end = -1, inStr = false, esc = false;
      for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end >= 0) parsed = JSON.parse(cleaned.slice(start, end + 1));
    }
  } catch { /* ignore parse errors */ }

  if (!parsed) {
    const fallbackText = (fullText && !fullText.trimStart().startsWith('{'))
      ? fullText
      : "I wasn't able to complete that request. Could you try asking about one specific aspect?";
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', text: fallbackText };
      return updated;
    });
    return;
  }

  // Route parsed response to appropriate handler
  if (parsed.chatReply) {
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', text: parsed.chatReply };
      return updated;
    });
  } else if (parsed.proposal) {
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'proposal', proposal: parsed.proposal, status: 'pending' };
      return updated;
    });
  } else if (parsed.diagram) {
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'diagram', diagram: parsed.diagram, status: 'complete' };
      return updated;
    });
  } else if (parsed.chart) {
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'chart', chart: parsed.chart, status: 'complete' };
      return updated;
    });
  } else if (parsed.imageSearch) {
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'imageSearch', imageSearch: parsed.imageSearch, status: 'complete', provider, apiKey };
      return updated;
    });
  } else {
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', text: parsed.chatReply || parsed.message || fullText };
      return updated;
    });
  }
}

/**
 * Handle a research request — execute search, then stream a synthesis call.
 *
 * @param {Object} researchReq       - { query, sources, reason }
 * @param {Object} ctx               - Shared context from useChatRouter
 */
export async function handleResearchRequest(researchReq, ctx) {
  const {
    messages,
    setMessages,
    setStreaming,
    abortRef,
    apiKey, provider, modelId,
    courseMap, activeTab,
    delivRef,
  } = ctx;

  const { query, sources, reason } = researchReq;

  // 1. Show research card in "searching" state
  setMessages(prev => {
    const updated = [...prev];
    updated[updated.length - 1] = {
      role: 'research',
      research: { query, reason, sources },
      status: 'searching',
    };
    return updated;
  });

  setStreaming(true);
  try {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 2. Execute the research
    const { results, formatted } = await executeResearch(researchReq, controller.signal);

    // 3. Update the research card to "complete" state
    setMessages(prev => {
      const updated = [...prev];
      const researchIdx = updated.findLastIndex(m => m.role === 'research' && m.status === 'searching');
      if (researchIdx >= 0) {
        updated[researchIdx] = {
          ...updated[researchIdx],
          status: 'complete',
          research: { ...updated[researchIdx].research, results },
        };
      }
      updated.push({ role: 'assistant', text: '' });
      return updated;
    });

    // 4. Build chat history with research results injected
    const chatHistory = buildAgentChatHistory(
      messages.filter(m => m.role !== 'research')
    );
    chatHistory.push({
      role: 'user',
      content: `[SYSTEM: Research results for your query "${query}"]\n${formatted}\n\n[SYSTEM: Synthesize a response using these results. Use [N] citations. When proposing content (quizzes, assignments, discussions), embed research findings directly — e.g., use paper titles as recommended readings, cite findings in activity descriptions, or reference studies in discussion prompts. Respond with your normal JSON format — do NOT emit another research request.]`,
    });

    // 5. Stream the synthesis call
    const systemPrompt = buildAgentSystemPrompt(courseMap, activeTab, delivRef.current);
    const { reader, parseChunk } = await streamChat(
      chatHistory, systemPrompt, controller.signal, apiKey, provider, modelId,
      16384,
    );

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let chunkCount = 0;
    let detectedType = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const chunk = parseChunk(parsed);
          if (chunk) {
            fullText += chunk;
            chunkCount++;

            // Live-stream chatReply content during synthesis
            if (chunkCount % 8 === 0) {
              if (!detectedType) {
                const lower = fullText.toLowerCase();
                if (lower.includes('"chatreply"')) detectedType = 'chatReply';
                else if (lower.includes('"proposal"')) detectedType = 'proposal';
                else if (lower.includes('"actions"')) detectedType = 'batchAction';
                else if (lower.includes('"action"')) detectedType = 'action';
                else if (lower.includes('"diagram"')) detectedType = 'diagram';
                else if (lower.includes('"chart"')) detectedType = 'chart';
                else if (lower.includes('"imagesearch"')) detectedType = 'imageSearch';
              }

              if (detectedType === 'chatReply') {
                const match = fullText.match(/"chatReply"\s*:\s*"([\s\S]*?)(?:"|$)/);
                if (match) {
                  const partial = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                  setMessages(prev => {
                    const u = [...prev];
                    u[u.length - 1] = { role: 'assistant', text: partial };
                    return u;
                  });
                }
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    // 6. Parse the synthesis response — guard against infinite loops
    let synthParsed = null;
    try { synthParsed = JSON.parse(fullText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')); } catch { /* ignore */ }
    if (synthParsed?.research) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          text: synthParsed.chatReply || synthParsed.message || 'I found some research results above but could not synthesize further. Please review the sources directly.',
        };
        return updated;
      });
      return;
    }

    // Normal handling of the synthesis response
    handleLegacyResponse(fullText, ctx);

  } catch (err) {
    if (err.name === 'AbortError') {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.text) return prev.slice(0, -1);
        return prev;
      });
      return;
    }
    setMessages(prev => {
      const updated = [...prev];
      const researchIdx = updated.findLastIndex(m => m.role === 'research');
      if (researchIdx >= 0) {
        updated[researchIdx] = {
          ...updated[researchIdx],
          status: 'error',
          research: { ...updated[researchIdx].research, error: err.message },
        };
      }
      const lastMsg = updated[updated.length - 1];
      if (lastMsg?.role === 'assistant' && !lastMsg.text) {
        updated[updated.length - 1] = {
          role: 'assistant',
          text: `I tried to search for "${researchReq.query}" but the search failed. Let me answer based on what I know.`,
        };
      } else {
        updated.push({
          role: 'assistant',
          text: `I tried to search for "${researchReq.query}" but the search failed. Let me answer based on what I know.`,
        });
      }
      return updated;
    });
  } finally {
    setStreaming(false);
  }
}
