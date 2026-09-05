import { describe, expect, it } from 'vitest';

import {
  attachScionCompilerRoute,
  composeScionExplicitSequenceSkeleton,
  readScionCompilerRoute,
  runScionExplicitSequencePreflight,
  SCION_EXPLICIT_SEQUENCE_ROUTE_PROTOCOL,
} from '../scionCompilerRoute';

function nativePrompt(source, expected = 4) {
  return `Build exactly ${expected} sessions.

SOURCE MATERIALS:
${source}

Return ONLY the skeleton JSON object now:`;
}

describe('Scion compiler-first structure route', () => {
  it('projects an exact instructor sequence without model inference', () => {
    const result = composeScionExplicitSequenceSkeleton(
      nativePrompt(
        'Digital Accessibility for Product Teams — create exactly 4 lessons: WCAG principles and conformance, semantic HTML and keyboard accessibility, accessible forms, and evidence-based accessibility testing and remediation.',
      ),
    );

    expect(result?.route).toMatchObject({
      protocol: SCION_EXPLICIT_SEQUENCE_ROUTE_PROTOCOL,
      exactLessonSequence: true,
      modelCalls: 0,
      voicePassSkipped: true,
    });
    expect(JSON.parse(result.text).sessions.map((session) => session.title)).toEqual([
      'WCAG principles and conformance',
      'semantic HTML and keyboard accessibility',
      'accessible forms',
      'evidence-based accessibility testing and remediation',
    ]);
  });

  it('compiles the six-week civic-data evaluation brief without letting Gemma rename lessons', () => {
    const source =
      'Create a six-week advanced undergraduate course called Applied Civic Data Analysis for public-policy students. Use this exact lesson sequence: 1) Python data types and expressions; 2) Conditional branching and loops; 3) Functions and automated tests; 4) Pandas tabular data cleaning; 5) Reproducible visualization and uncertainty; 6) Integrative policy memo capstone. Each class meets for 75 minutes. Require source-backed reasoning, practical coding evidence, revision, and a final policy memo.';
    const result = composeScionExplicitSequenceSkeleton(nativePrompt(source, 6));

    expect(JSON.parse(result.text).sessions.map((session) => session.title)).toEqual([
      'Python data types and expressions',
      'Conditional branching and loops',
      'Functions and automated tests',
      'Pandas tabular data cleaning',
      'Reproducible visualization and uncertainty',
      'Integrative policy memo capstone',
    ]);
    expect(result.route.modelCalls).toBe(0);
  });

  it('declines ambiguous and count-mismatched briefs so Gemma can plan them', () => {
    expect(
      composeScionExplicitSequenceSkeleton(
        nativePrompt('A practical accessibility course covering standards, implementation, and testing.'),
      ),
    ).toBeNull();
    expect(
      composeScionExplicitSequenceSkeleton(
        nativePrompt('Create exactly 3 lessons: standards, implementation, and testing.', 4),
      ),
    ).toBeNull();
    expect(
      composeScionExplicitSequenceSkeleton(
        nativePrompt('Create exactly 4 lessons: standards, implementation, standards, and testing.'),
      ),
    ).toBeNull();
  });

  it('carries a non-enumerable route receipt across the Pass A handoff', () => {
    const target = { course: { name: 'Accessibility' } };
    const route = { protocol: SCION_EXPLICIT_SEQUENCE_ROUTE_PROTOCOL, modelCalls: 0 };

    attachScionCompilerRoute(target, route);

    expect(readScionCompilerRoute(target)).toEqual(route);
    expect(JSON.stringify(target)).not.toContain(SCION_EXPLICIT_SEQUENCE_ROUTE_PROTOCOL);
  });

  it('emits compiler-owned telemetry without a provider start or token estimate', () => {
    const events = [];
    const chunks = [];
    const result = runScionExplicitSequencePreflight({
      userPrompt: nativePrompt('Create exactly 4 lessons: standards, implementation, testing, and remediation.'),
      existingText: '',
      onChunk: (...args) => chunks.push(args),
      traceBase: { provider: 'public', modelId: 'scion-public' },
      recordApiCallEvent: (event) => events.push(event),
    });

    expect(result?.response).toMatchObject({
      adaptiveRoute: 'scion-explicit-sequence-compiler',
      modelRequests: 0,
    });
    expect(events.map((event) => event.type)).toEqual([
      'scionAdaptiveRoute',
      'scionAdapterRoute',
      'providerResponseDone',
    ]);
    expect(events.some((event) => event.type === 'providerRequestStart')).toBe(false);
    expect(events.every((event) => event.execution === 'browser-compiler')).toBe(true);
    expect(chunks).toHaveLength(1);
    expect(result.routeEvent.voicePassSkipped).toBe(true);
  });
});
