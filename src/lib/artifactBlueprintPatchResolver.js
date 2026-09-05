import { streamChat } from '../components/chat/useStreamProcessor';
import { normalizeCanonicalPatchFromModel } from './artifactBlueprintProjection';

const CANONICAL_PATCH_RESOLVER_SYSTEM = `You convert one localized CourseMapper artifact edit into one compact course blueprint patch.
Return JSON only. Use this exact shape:
{"sync":true,"field":"learningObjectives|learningGoals|weeklyAssessments|topicSection|asyncActivities|syncActivities|supportingResources|technologyNeeded|presentationFormat|title","value":"concise course-map value","sectionIndex":0}
If the edit is presentation-only and should stay local, return {"sync":false,"reason":"local-only"}.
Do not regenerate deliverable content. Do not include markdown.`;

async function collectProviderStreamText(streamResponse) {
  const reader = streamResponse?.reader;
  const parseChunk = streamResponse?.parseChunk;
  if (!reader || typeof parseChunk !== 'function') return '';
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

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
        if (chunk) text += chunk;
      } catch {
        // Ignore partial provider chunks.
      }
    }
  }
  return text.trim();
}

function parseFirstJsonObject(text = '') {
  const source = String(text || '').trim();
  const first = source.indexOf('{');
  if (first < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = first; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(first, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function resolveArtifactBlueprintPatchRequestsWithProvider({
  requests = [],
  courseMap,
  apiKey,
  provider,
  modelId,
  onBeforeRequest,
} = {}) {
  const validRequests = Array.isArray(requests) ? requests.filter(Boolean) : [];
  const patches = [];
  let providerCallCount = 0;
  let lastError = '';

  for (const request of validRequests) {
    providerCallCount += 1;
    onBeforeRequest?.(request);
    try {
      const compactRequest = {
        sourceFeatureId: request.sourceFeatureId,
        lessonIndex: request.lessonIndex,
        currentLessonTitle: request.currentLessonTitle,
        editPath: request.editPath,
        previousArtifactValue: request.previousArtifactValue,
        editedArtifactValue: request.artifactValue,
        editContext: request.editContext,
        allowedFields: request.allowedFields,
        currentFields: request.currentFields,
      };
      const streamResponse = await streamChat(
        [{ role: 'user', content: JSON.stringify(compactRequest) }],
        CANONICAL_PATCH_RESOLVER_SYSTEM,
        undefined,
        apiKey,
        provider,
        modelId,
        700,
      );
      const text = await collectProviderStreamText(streamResponse);
      const rawPatch = parseFirstJsonObject(text);
      const patch = normalizeCanonicalPatchFromModel(rawPatch, request, courseMap);
      if (patch) patches.push(patch);
      else lastError = rawPatch?.reason || 'Provider did not return a usable canonical patch.';
    } catch (err) {
      lastError = err?.message || 'Blueprint patch resolver failed.';
    }
  }

  return {
    patches,
    providerCallCount,
    requestsResolved: patches.length,
    requestsAttempted: validRequests.length,
    ...(patches.length === 0 && lastError ? { error: lastError } : {}),
  };
}
