import { describe, expect, it, vi } from 'vitest';
import { runScionLocalCompletion, SCION_LOCAL_MAX_GENERATION_RETRIES } from '../src/lib/scionLocalProvider';

function runtimeWith(outputs, { route = null, plannedRoute = null } = {}) {
  const queue = [...outputs];
  return {
    loadScionBrowserWllama: vi.fn(async ({ onProgress }) => {
      onProgress?.({ phase: 'ready', progress: 1, message: 'Scion local Gemma 4 is ready.' });
      return { status: { phase: 'ready' } };
    }),
    ...(plannedRoute
      ? {
          prepareScionBrowserWllamaTaskRoute: vi.fn(async () => plannedRoute),
        }
      : {}),
    completeScionBrowserWllama: vi.fn(async (_messages, options) => {
      if (route) options.onAdapterRoute?.(route);
      const output = queue.shift();
      options.onToken?.(String(output || '').slice(0, 12));
      return output;
    }),
  };
}

function completeKernelResponse(lessonId = 'lesson-4') {
  return JSON.stringify({
    lessons: [
      {
        lessonId,
        facts: [
          'Repeated task failures provide direct evidence for revising a tested interface flow.',
          'Interview comments can explain user expectations but do not replace observed behavior.',
          'A prototype represents selected interactions before every production detail is complete.',
          'Parallel alternatives help learners distinguish competing interpretations of the same evidence.',
          'Specific feedback supports the answer and corrects the strongest plausible misconception.',
        ],
        keyTerms: [0, 1, 2].map((index) => ({
          tr: `Term ${index + 1}`,
          df: `A precise disciplinary definition number ${index + 1} that is long enough for local admission.`,
          eg: `A concrete domain example number ${index + 1}.`,
          mi: `A plausible misunderstanding number ${index + 1}.`,
          cx: `The correction refutes misunderstanding number ${index + 1} with a distinct mechanism.`,
        })),
        scenario: {
          su: 'A design team must revise a checkout flow after repeated task failures. The fixed release date limits the team to one evidence-backed change.',
          ma: 'Task-failure log, interview notes, and annotated prototype screen.',
        },
        mc: [
          {
            q: 'Which evidence most directly supports revising the tested checkout flow when the team can make only one change before the fixed release date?',
            op: [
              'Repeated failures on the same checkout task',
              'One favorable comment about the visual colors',
              'A stakeholder preference for the existing layout',
              'A designer request for a larger brand mark',
            ],
            ai: 0,
            fi: [0],
            ex: 'Repeated task failure directly supports revising the flow. A favorable color comment does not demonstrate a checkout breakdown.',
          },
          {
            q: 'Which conclusion is best supported when interviews describe expectations but the observed task log records the same checkout failure across several sessions?',
            op: [
              'Behavioral evidence warrants testing a flow revision',
              'Interview comments prove every user prefers change',
              'The release deadline invalidates the task evidence',
              'Visual styling alone caused the recorded failures',
            ],
            ai: 0,
            fi: [1],
            ex: 'Observed repeated behavior supports testing a revision. Interview comments explain expectations but cannot replace the task evidence.',
          },
        ],
      },
    ],
  });
}

describe('Scion browser-local provider', () => {
  it('loads the pinned runtime, streams locally, and repairs the final JSON', async () => {
    const runtime = runtimeWith(['```json\n{"courseName":"Design","lessons":[]}\n```']);
    const progress = vi.fn();
    const onToken = vi.fn();
    const controller = new AbortController();

    const result = await runScionLocalCompletion({
      systemPrompt: 'Return a course map.',
      userPrompt: 'Build a design course.',
      maxOutputTokens: 9000,
      signal: controller.signal,
      onProgress: progress,
      onToken,
      runtimeLoader: async () => runtime,
    });

    expect(result.fullText).toBe('{"courseName":"Design","lessons":[]}');
    expect(result.messages[0].content).toContain('browser-local');
    expect(runtime.loadScionBrowserWllama).toHaveBeenCalledWith({
      onProgress: progress,
      signal: controller.signal,
    });
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledWith(
      result.messages,
      expect.objectContaining({
        maxNewTokens: 2400,
        temperature: 0,
        topK: 1,
        topP: 1,
        seed: 7,
        signal: controller.signal,
      }),
    );
    expect(onToken).toHaveBeenCalled();
  });

  it('enforces an exact source-backed final topic before continuation admission', async () => {
    const repeated = JSON.stringify({
      lessons: [
        {
          title: 'Lesson 1: Environmental Justice',
          sections: [{ topicSection: '1.1: Environmental Justice' }],
        },
      ],
    });
    const runtime = runtimeWith([repeated]);
    const prompt = `This Course Map has 9 of 10 lessons.

Existing lessons:
1. Lesson 1: Atmospheric Chemistry
2. Lesson 2: Water Quality
3. Lesson 3: Soil Contaminants
4. Lesson 4: Toxicology
5. Lesson 5: Fate and Transport
6. Lesson 6: Green Chemistry
7. Lesson 7: Environmental Sampling
8. Lesson 8: Risk Assessment
9. Lesson 9: Environmental Justice

Generate ONLY Lessons 10-10.

LATER SYLLABUS CONTENT:
Create an Environmental Chemistry course with 10 lessons. Cover atmospheric chemistry, water quality, soil contaminants, toxicology, fate and transport, green chemistry, environmental sampling, risk assessment, and environmental justice. Include a midterm and a cumulative final exam.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'course-map',
      runtimeLoader: async () => runtime,
    });

    expect(result.repairs).toContain('course-map-topic-plan');
    expect(JSON.parse(result.fullText).lessons[0]).toMatchObject({
      title: 'Lesson 10: Cumulative Final Exam',
      sections: [{ topicSection: '10.1: Cumulative Final Exam' }],
    });
  });

  it('retries only incomplete kernel envelopes with bounded temperature escalation', async () => {
    const runtime = runtimeWith(['{"lessons":[]}', completeKernelResponse()]);
    const delays = [];
    const onRetry = vi.fn();
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      maxRetries: 99,
      onRetry,
      runtimeLoader: async () => runtime,
      sleep: async (delay) => delays.push(delay),
    });

    expect(SCION_LOCAL_MAX_GENERATION_RETRIES).toBe(2);
    expect(result.attempt).toBe(2);
    expect(result.retryCount).toBe(1);
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(2);
    expect(runtime.completeScionBrowserWllama.mock.calls[0][1]).toMatchObject({ temperature: 0, topK: 1, seed: 7 });
    expect(runtime.completeScionBrowserWllama.mock.calls[1][1]).toMatchObject({
      temperature: 0.15,
      topK: 40,
      topP: 0.9,
      seed: 8,
    });
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain('LOCAL ADMISSION RETRY');
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain('lesson-4:missing-lesson');
    expect(onRetry).toHaveBeenCalledWith(1, 2, 250, expect.objectContaining({ code: 'SCION_LOCAL_INCOMPLETE' }));
    expect(delays).toEqual([250]);
  });

  it('retries a correction that merely copies its definition and returns the repaired lesson', async () => {
    const valid = JSON.parse(completeKernelResponse());
    const repeated = structuredClone(valid);
    repeated.lessons[0].keyTerms[0].cx = repeated.lessons[0].keyTerms[0].df;
    const runtime = runtimeWith([JSON.stringify(repeated), JSON.stringify(valid)]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result.attempt).toBe(2);
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain(
      'correction-repeats-definition',
    );
  });

  it('stops facts-first synthesis after one usable draft when the grounded adapter stage is available', async () => {
    const incomplete = JSON.parse(completeKernelResponse());
    incomplete.lessons[0].keyTerms[0].cx = incomplete.lessons[0].keyTerms[0].df;
    const runtime = runtimeWith([JSON.stringify(incomplete), completeKernelResponse()], {
      route: {
        mode: 'base-only',
        taskFamily: 'lesson-kernel-synthesis',
        reason: 'grounded-stage-available',
        adapterId: 'scion-grounded-test',
        nativeAdapterActive: false,
      },
    });
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxRetries: 2,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 1, retryCount: 0, maxRetries: 1, contractIncomplete: true });
    expect(result.admissionIssues).toContain('lesson-4:key-term-0:correction-repeats-definition');
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(1);
  });

  it('plans a ledger-only base call before a verified grounded adapter stage', async () => {
    const route = {
      mode: 'base-only',
      taskFamily: 'lesson-kernel-synthesis',
      reason: 'grounded-stage-available',
      adapterId: 'scion-grounded-test',
      nativeAdapterActive: false,
    };
    const ledger = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-4',
          facts: [
            'Observed task failures reveal where an interface blocks a user goal.',
            'Interview comments explain expectations but cannot replace observed behavior.',
            'Audience evidence should guide which supporting details a speaker selects.',
            'A prototype represents chosen interactions before production details are complete.',
            'Specific feedback supports revision when it identifies an observable breakdown.',
          ],
        },
      ],
    });
    const runtime = runtimeWith([ledger], { route, plannedRoute: route });
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxOutputTokens: 2400,
      maxRetries: 2,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    const [messages, options] = runtime.completeScionBrowserWllama.mock.calls[0];
    const template = JSON.parse(messages.at(-1).content.split('TEMPLATE TO FILL:\n')[1]);
    expect(runtime.prepareScionBrowserWllamaTaskRoute).toHaveBeenCalledWith(
      expect.objectContaining({ taskFamily: 'lesson-kernel-synthesis' }),
    );
    expect(Object.keys(template.lessons[0])).toEqual(['lessonId', 'facts']);
    expect(options.maxNewTokens).toBe(800);
    expect(result).toMatchObject({ attempt: 1, retryCount: 0, contractIncomplete: true });
    expect(result.admissionIssues).toContain('lesson-4:key-terms-count:0/3');
  });

  it('plans the same ledger-only contract for a non-language base model without an adapter', async () => {
    const route = {
      mode: 'base-only',
      taskFamily: 'lesson-kernel-synthesis',
      reason: 'no-adapter-installed',
      adapterId: null,
      nativeAdapterActive: false,
    };
    const ledger = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-4',
          facts: [
            'Observed task failures reveal where an interface blocks a user goal.',
            'Interview comments explain expectations but cannot replace observed behavior.',
            'Audience evidence should guide which supporting details a speaker selects.',
            'A prototype represents chosen interactions before production details are complete.',
            'Specific feedback supports revision when it identifies an observable breakdown.',
          ],
        },
      ],
    });
    const runtime = runtimeWith([ledger], { route, plannedRoute: route });
    const onAdapterRoute = vi.fn();
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxOutputTokens: 2400,
      maxRetries: 2,
      onAdapterRoute,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    const [messages, options] = runtime.completeScionBrowserWllama.mock.calls[0];
    const template = JSON.parse(messages.at(-1).content.split('TEMPLATE TO FILL:\n')[1]);
    expect(Object.keys(template.lessons[0])).toEqual(['lessonId', 'facts']);
    expect(options.maxNewTokens).toBe(800);
    expect(onAdapterRoute).toHaveBeenCalledWith(expect.objectContaining({ factLedgerOnly: true }));
  });

  it('uses the compact fact ledger for Mandarin now that the compiler owns the admitted language pair', async () => {
    const route = {
      mode: 'base-only',
      taskFamily: 'lesson-kernel-synthesis',
      reason: 'no-adapter-installed',
      adapterId: null,
      nativeAdapterActive: false,
    };
    const ledger = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-4',
          facts: [
            'Mandarin numbers combine place-value words in a regular spoken sequence.',
            'Age questions use a number together with the age word sui.',
            'Calendar dates order the year, month, and day before optional time information.',
            'Tone marks distinguish the pronunciation of otherwise similar pinyin syllables.',
            'A complete beginner response pairs an intended meaning with its spoken form.',
          ],
        },
      ],
    });
    const runtime = runtimeWith([ledger], { route, plannedRoute: route });
    const onAdapterRoute = vi.fn();

    await runScionLocalCompletion({
      userPrompt:
        'Course: Elementary Mandarin Chinese I\nLessons:\n[{"lessonId":"lesson-4","title":"Numbers and Dates"}]\nReturn ONLY valid JSON.',
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxOutputTokens: 2400,
      maxRetries: 2,
      onAdapterRoute,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    const [messages, options] = runtime.completeScionBrowserWllama.mock.calls[0];
    const template = JSON.parse(messages.at(-1).content.split('TEMPLATE TO FILL:\n')[1]);
    expect(Object.keys(template.lessons[0])).toEqual(['lessonId', 'facts']);
    expect(messages.at(-1).content).toContain('factual ledger');
    expect(options.maxNewTokens).toBe(800);
    expect(onAdapterRoute).toHaveBeenCalledWith(expect.objectContaining({ factLedgerOnly: true }));
  });

  it('keeps a clean Mandarin fact core after one call and leaves bad atoms for compiler quarantine', async () => {
    const route = {
      mode: 'base-only',
      taskFamily: 'lesson-kernel-synthesis',
      reason: 'no-adapter-installed',
      adapterId: null,
      nativeAdapterActive: false,
    };
    const ledger = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-5',
          facts: [
            'Mandarin kinship terms distinguish generation, age, and family-side relationships.',
            'Possessive noun phrases place the possessor before de and the possessed noun.',
            'The lesson introduces vocabulary for common family relationships in Mandarin.',
            'The lesson covers the particle de for expressing possession.',
            'This lesson provides character-writing practice for family words.',
          ],
        },
      ],
    });
    const runtime = runtimeWith([ledger], { route, plannedRoute: route });

    const result = await runScionLocalCompletion({
      userPrompt:
        'Course: Elementary Mandarin Chinese I\nLessons:\n[{"lessonId":"lesson-5","title":"Family and Possession"}]\nReturn ONLY valid JSON.',
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxOutputTokens: 2400,
      maxRetries: 2,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ attempt: 1, retryCount: 0, contractIncomplete: true });
    expect(result.admissionIssues).toEqual(expect.arrayContaining(['lesson-5:fact-2:meta-fact']));
  });

  it('keeps three clean ordinary facts after one bad fact instead of retrying the whole lesson', async () => {
    const route = {
      mode: 'base-only',
      taskFamily: 'lesson-kernel-synthesis',
      reason: 'no-adapter-installed',
      adapterId: null,
      nativeAdapterActive: false,
    };
    const ledger = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-4',
          facts: [
            'Affinity mapping groups related observations into visible patterns.',
            'Cluster labels summarize patterns without replacing the underlying observations.',
            'Outliers remain visible when they do not fit a supported pattern.',
            'Teams revisit cluster boundaries when new evidence changes the pattern.',
            'an unfinished sentence about',
          ],
        },
      ],
    });
    const runtime = runtimeWith([ledger], { route, plannedRoute: route });

    const result = await runScionLocalCompletion({
      userPrompt:
        'Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.',
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxRetries: 2,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ attempt: 1, retryCount: 0, contractIncomplete: true });
    expect(result.admissionIssues).toContain('lesson-4:fact-4:truncated-fact');
  });

  it('uses the conditional synthesis retry when the first grounded-stage fact ledger is invalid', async () => {
    const invalidFacts = JSON.parse(completeKernelResponse());
    invalidFacts.lessons[0].facts[2] = invalidFacts.lessons[0].facts[1];
    const runtime = runtimeWith([JSON.stringify(invalidFacts), completeKernelResponse()], {
      route: {
        mode: 'base-only',
        taskFamily: 'lesson-kernel-synthesis',
        reason: 'grounded-stage-available',
        adapterId: 'scion-grounded-test',
        nativeAdapterActive: false,
      },
    });
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxRetries: 2,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 2, retryCount: 1, maxRetries: 1 });
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(2);
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain('duplicate-facts');
  });

  it('reserves two issue-informed retries when the compiler explicitly recovers a failed synthesis ledger', async () => {
    const invalidFacts = JSON.parse(completeKernelResponse());
    invalidFacts.lessons[0].facts = invalidFacts.lessons[0].facts.slice(0, 4);
    const runtime = runtimeWith([JSON.stringify(invalidFacts), completeKernelResponse()], {
      route: {
        mode: 'base-only',
        taskFamily: 'lesson-kernel-synthesis',
        reason: 'grounded-stage-available',
        adapterId: 'scion-grounded-test',
        nativeAdapterActive: false,
      },
    });
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nRecovery attempt 1: re-author the complete lesson.\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      promptProtocol: 'production-lesson-kernel-synthesis-prompt-v1',
      maxRetries: 2,
      temperature: 0.7,
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 2, retryCount: 1, maxRetries: 2 });
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(2);
    expect(runtime.completeScionBrowserWllama.mock.calls[0][1]).toMatchObject({ temperature: 0.45, seed: 7 });
    expect(runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content).toContain('facts-count:4/5');
  });

  it('carries an earlier defect into corrective feedback before a low-risk atomic deferral', async () => {
    const valid = JSON.parse(completeKernelResponse());
    const repeated = structuredClone(valid);
    repeated.lessons[0].keyTerms[0].cx = repeated.lessons[0].keyTerms[0].df;
    const runtime = runtimeWith(['{"lessons":[]}', JSON.stringify(repeated)]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 2, contractIncomplete: true });
    const correctiveFeedback = runtime.completeScionBrowserWllama.mock.calls[1][0].at(-1).content;
    expect(correctiveFeedback).toContain('lesson-4:missing-lesson');
    expect(result.admissionIssues).toContain('lesson-4:key-term-0:correction-repeats-definition');
  });

  it('keeps retry responses atomic instead of splicing an earlier term into a later artifact', async () => {
    const repeated = JSON.parse(completeKernelResponse());
    repeated.lessons[0].keyTerms[0].cx = repeated.lessons[0].keyTerms[0].df;
    const retry = JSON.parse(completeKernelResponse());
    retry.lessons[0].keyTerms[0].tr =
      'A term name accidentally expanded into a complete sentence that exceeds the compact field limit';
    retry.lessons[0].keyTerms[0].cx =
      'This correction directly refutes the misconception without copying the definition.';
    const runtime = runtimeWith([JSON.stringify(repeated), JSON.stringify(retry)]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 2, contractIncomplete: true });
    expect(result.selectedAttempt).toBe(1);
    expect(JSON.parse(result.fullText).lessons[0].keyTerms[0]).toEqual(repeated.lessons[0].keyTerms[0]);
    expect(result.repairs).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ pass: 'crossAttemptContractMerge' })]),
    );
  });

  it('uses the full retry budget before deferring answer-key conflicts to per-atom admission', async () => {
    const conflicted = JSON.parse(completeKernelResponse());
    conflicted.lessons[0].mc[0] = {
      q: 'When the observation shows plates sliding side by side without creating crust, which boundary classification is supported by the evidence in this field record?',
      op: [
        'Divergent boundaries form new crust as plates separate',
        'Convergent boundaries can subduct crust as plates approach',
        'Transform boundaries accommodate plates sliding side by side',
        'Divergent boundaries can subduct crust as plates approach',
      ],
      ai: 0,
      fi: [2],
      ex: 'Transform boundaries accommodate plates sliding side by side. Divergent boundaries require separation and new crust rather than lateral motion.',
    };
    const response = JSON.stringify(conflicted);
    const runtime = runtimeWith([response, response, response]);
    const prompt = `Course: Design
Lessons:
[{"lessonId":"lesson-4","title":"Affinity Mapping"}]
Return ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 3, retryCount: 2, contractIncomplete: true });
    expect(result.admissionIssues).toContain('lesson-4:mc-0:explanation-key-conflict');
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(3);
  });

  it('returns the lowest-risk complete attempt when a later corrective retry regresses', async () => {
    const first = JSON.parse(completeKernelResponse());
    first.lessons[0].mc[0].op[2] = first.lessons[0].mc[0].op[1];
    const best = JSON.parse(completeKernelResponse());
    best.lessons[0].facts[0] =
      'Repeated task failures provide direct evidence for revising a tested interface flow before a fixed release deadline requires one carefully prioritized change.';
    const regressed = JSON.parse(completeKernelResponse());
    regressed.lessons[0].mc[0].op[2] = regressed.lessons[0].mc[0].op[1];
    regressed.lessons[0].mc[1].ai = 1;
    const runtime = runtimeWith([JSON.stringify(first), JSON.stringify(best), JSON.stringify(regressed)]);
    const prompt = `Course: Design
Lessons:
[{"lessonId":"lesson-4","title":"Affinity Mapping"}]
Return ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({
      attempt: 3,
      selectedAttempt: 2,
      retryCount: 2,
      contractIncomplete: true,
      admissionIssues: ['lesson-4:fact-0:fact-length'],
    });
    expect(JSON.parse(result.fullText).lessons[0].facts[0]).toBe(best.lessons[0].facts[0]);
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(3);
  });

  it('uses the full bounded retry budget before deferring a missing lesson core to per-atom admission', async () => {
    const partial = {
      lessons: [
        {
          lessonId: 'lesson-4',
          facts: [
            'Affinity mapping groups related observations into visible patterns.',
            'Labels summarize a cluster without replacing the underlying notes.',
            'Outliers remain visible so teams do not erase conflicting evidence.',
            'Teams revisit cluster boundaries when new observations change the pattern.',
          ],
          keyTerms: [
            {
              tr: 'Affinity mapping',
              df: 'A synthesis method that groups observations by a meaningful relationship.',
              eg: 'A team clusters checkout notes around navigation, trust, and error recovery.',
              mi: 'Every note must fit the first cluster chosen by the facilitator.',
              cx: 'Notes can move or remain as outliers when the evidence does not support that cluster.',
            },
          ],
          mc: [
            {
              q: 'Which action best preserves conflicting observations during affinity mapping?',
              op: ['Keep an outlier visible', 'Delete the note', 'Rename the current cluster', 'Average the comments'],
              ai: 0,
              fi: [2],
              ex: 'Keeping the outlier visible preserves conflicting evidence; deleting it erases that evidence.',
            },
            {
              q: 'When should a team revisit an affinity-map cluster boundary?',
              op: [
                'When new observations change the pattern',
                'After deleting outliers',
                'Before reading notes',
                'After the map is finalized',
              ],
              ai: 0,
              fi: [3],
              ex: 'New observations can change the pattern, so the cluster boundary should be reconsidered.',
            },
          ],
        },
      ],
    };
    const response = JSON.stringify(partial);
    const runtime = runtimeWith([response, response, response]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 3, retryCount: 2, contractIncomplete: true });
    expect(result.admissionIssues).toContain('lesson-4:key-terms-count:1/3');
    expect(result.kernelShape).toEqual([
      expect.objectContaining({ lessonId: 'lesson-4', facts: 4, keyTerms: 1, mc: 2, hasScenario: false }),
    ]);
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(3);
  });

  it('preserves a grounded facts-plus-key-terms kernel when the model omits the trailing quiz surface', async () => {
    const partial = {
      lessons: [
        {
          lessonId: 'lesson-4',
          facts: [
            'Affinity mapping groups related observations into visible patterns.',
            'Labels summarize a cluster without replacing the underlying notes.',
            'Outliers remain visible so teams do not erase conflicting evidence.',
            'Teams revisit cluster boundaries when new observations change the pattern.',
          ],
          keyTerms: [
            {
              tr: 'Affinity mapping',
              df: 'A synthesis method that groups observations by a meaningful relationship.',
              eg: 'A team clusters checkout notes around navigation, trust, and error recovery.',
              mi: 'Every note must fit the first cluster chosen by the facilitator.',
              cx: 'Notes can move or remain as outliers when the evidence does not support that cluster.',
            },
          ],
        },
      ],
    };
    const response = JSON.stringify(partial);
    const runtime = runtimeWith([response, response, response]);
    const prompt = `Course: Design\nLessons:\n[{"lessonId":"lesson-4","title":"Affinity Mapping"}]\nReturn ONLY valid JSON.`;

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      runtimeLoader: async () => runtime,
      sleep: async () => {},
    });

    expect(result).toMatchObject({ attempt: 3, retryCount: 2, contractIncomplete: true });
    expect(result.admissionIssues).toContain('lesson-4:key-terms-count:1/3');
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(3);
  });

  it('forwards a complete three-fact source ledger to atomic admission after one bounded attempt', async () => {
    const sourceFacts = [
      'A usability test observes representative users attempting realistic tasks with a product or service.',
      'A test script gives each session a repeatable structure without turning the moderator into a teacher.',
      'Recruitment identifies appropriate users and obtains consent before the session.',
    ];
    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: sourceFacts,
          keyTerms: [
            {
              tr: 'usability test',
              df: 'A usability test observes representative users attempting realistic tasks.',
              eg: 'Representative users attempt realistic tasks with a product or service.',
              mi: 'A usability test replaces observation with moderator instruction.',
              cx: 'The moderator observes task attempts instead of teaching the user.',
            },
          ],
          mc: [
            {
              q: 'Which supplied relationship describes what happens during the planned session?',
              op: [
                'Representative users attempt realistic tasks',
                'The moderator teaches every task',
                'Recruitment writes the script',
                'The service grants consent',
              ],
              ai: 0,
              fi: [0],
              ex: 'Representative users attempt realistic tasks while the test observes them.',
            },
            {
              q: 'Which source-backed activity gives the session a repeatable structure?',
              op: [
                'Use the test script',
                'Replace users with teachers',
                'Skip recruitment and consent',
                'Observe without realistic tasks',
              ],
              ai: 0,
              fi: [1],
              ex: 'The test script gives each session a repeatable structure.',
            },
          ],
        },
      ],
    });
    const prompt = `Course: Design\nLessons:\n${JSON.stringify([
      {
        lessonId: 'lesson-1',
        title: 'Usability Testing',
        sourceFactPolicy: 'numbered-source-ledger-v1',
        sourceFacts,
      },
    ])}\nReturn ONLY valid JSON.`;
    const runtime = runtimeWith([response]);

    const result = await runScionLocalCompletion({
      userPrompt: prompt,
      task: 'blueprintEnrichment',
      maxRetries: 0,
      runtimeLoader: async () => runtime,
    });

    expect(result).toMatchObject({ attempt: 1, retryCount: 0, contractIncomplete: true });
    expect(JSON.parse(result.fullText).lessons[0].facts).toEqual(sourceFacts);
    expect(runtime.completeScionBrowserWllama).toHaveBeenCalledTimes(1);
  });

  it('returns compiler repair provenance with the repaired browser-local text', async () => {
    const response = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-2',
          mc: [
            {
              q: 'What does a sampling frame provide before participant selection?',
              op: [
                'A complete list of potential participants',
                'A guarantee that every participant responds',
                'A fixed interview schedule',
                'A final analysis budget',
              ],
              ai: 0,
              ex: 'A sampling frame provides a complete list of potential participants. A fixed schedule does not define the eligible population because',
            },
          ],
        },
      ],
    });
    const result = await runScionLocalCompletion({
      userPrompt: 'Build a course.',
      runtimeLoader: async () => runtimeWith([response]),
    });

    expect(JSON.parse(result.fullText).lessons[0].mc[0].ex).toBe(
      'A sampling frame provides a complete list of potential participants.',
    );
    expect(result.repairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pass: 'incompleteExplanationTail',
          lessonId: 'lesson-2',
          item: 0,
          trainingEligible: false,
        }),
        expect.objectContaining({ pass: 'deterministicOptionShuffle', lessonId: 'lesson-2', item: 0 }),
      ]),
    );
  });

  it('does not hide device or runtime failures behind generation retries', async () => {
    const runtimeError = Object.assign(new Error('WebGPU is unavailable.'), { code: 'SCION_WLLAMA_WEBGPU' });
    const runtime = {
      loadScionBrowserWllama: vi.fn(async () => {
        throw runtimeError;
      }),
      completeScionBrowserWllama: vi.fn(),
    };

    await expect(
      runScionLocalCompletion({
        userPrompt: 'Build a course.',
        runtimeLoader: async () => runtime,
      }),
    ).rejects.toBe(runtimeError);
    expect(runtime.completeScionBrowserWllama).not.toHaveBeenCalled();
  });
});
