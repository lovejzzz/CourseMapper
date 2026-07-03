// Readings — docs/TRELLIS.md item 1 of the quality plan.
// Borrows the app's v0.16.1-hardened source-finder (subject-anchored
// queries, per-provider gates, OpenAlex backoff) by import, then applies
// Trellis's own trust discipline: every found reading enters the graph as
// trust:'candidate' (NEVER 'verified' — machine proposals don't get to
// claim verification), J10 relevance-gates the candidates, and drops are
// disclosed. Offline or slow providers degrade honestly: the run proceeds
// with zero readings and says so, it never hangs and never invents.

import { findCourseSources } from '../../src/lib/knowledge/sourceFinder.js';
import { j10Relevance } from '../judgment/checks/j10Relevance.mjs';
import { orderedLessons } from '../graph/schema.mjs';

export function sourceInputFromGraph(graph) {
  const lessons = orderedLessons(graph);
  return {
    course: { name: graph.course.title },
    courseName: graph.course.title,
    concepts: graph.concepts.map((c) => ({ id: c.id, term: c.name })),
    sessions: lessons.map((lesson, index) => ({ id: lesson.id, number: index + 1, title: lesson.title })),
    edges: {
      teaches: lessons.flatMap((lesson) => lesson.introduces.map((conceptId) => ({ from: lesson.id, to: conceptId }))),
    },
  };
}

export async function findReadings(graph, { deadlineMs = 20000, maxTopics = 8, providers = undefined } = {}) {
  const lessonsById = new Map(graph.lessons.map((lesson) => [lesson.id, lesson]));
  let packet;
  try {
    packet = await findCourseSources(sourceInputFromGraph(graph), {
      maxTopics,
      providers,
      signal: AbortSignal.timeout(deadlineMs),
    });
  } catch (error) {
    return {
      sources: [],
      found: 0,
      kept: 0,
      dropped: 0,
      degraded: `source-finder unavailable (${String(error.message).slice(0, 80)})`,
    };
  }

  const seenUrls = new Set(graph.sources.map((s) => s.url));
  const candidates = [];
  let counter = 0;
  for (const topic of packet.topics ?? []) {
    const lesson = lessonsById.get(topic.sessionId);
    const conceptIds = lesson ? [...lesson.introduces] : [];
    for (const raw of topic.sources ?? []) {
      if (!raw?.url || !raw?.title || seenUrls.has(raw.url)) continue;
      seenUrls.add(raw.url);
      counter += 1;
      candidates.push({
        kind: 'source',
        id: `s-finder-${counter}`,
        title: raw.title,
        url: raw.url,
        provider: raw.provider || 'unknown',
        license: raw.license || 'public metadata; verify rights',
        trust: 'candidate',
        conceptIds,
        topics: [topic.topic, topic.query, raw.snippet ?? ''].filter(Boolean).join(' '),
      });
    }
  }

  // Relevance-gate the candidates with J10 on a scratch graph, then keep
  // only the survivors — a dropped reading is disclosed, never shipped.
  const scratch = { ...graph, sources: [...graph.sources, ...candidates] };
  const flagged = new Set(j10Relevance(scratch, {}).map((f) => f.path.replace('source/', '')));
  const kept = candidates.filter((s) => !flagged.has(s.id));
  return {
    sources: kept,
    found: candidates.length,
    kept: kept.length,
    dropped: candidates.length - kept.length,
    degraded: packet.stats?.topicsWithSources === 0 ? 'providers returned no usable sources' : null,
  };
}
