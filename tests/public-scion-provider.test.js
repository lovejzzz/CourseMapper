import { describe, expect, it } from 'vitest';
import { buildProviderTextRequest } from '../src/lib/modelRequestBuilders';
import { estimateUsageCost } from '../src/lib/apiUsageCost';
import { createBaseModelCapabilities, createGenerationPlan } from '../src/lib/modelCapabilities';
import { buildLessonKernelPrompt } from '../src/lib/blueprintEnrichmentPass';
import {
  PUBLIC_SCION_BACKING_MODEL,
  PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS,
  PUBLIC_SCION_KERNEL_CONCURRENCY,
  PUBLIC_SCION_KERNEL_LESSONS_PER_CALL,
  PUBLIC_SCION_MAX_COMPLETION_TOKENS,
  PUBLIC_SCION_MIN_RETRIES,
  PUBLIC_SCION_MODEL_ID,
  PUBLIC_SCION_MODEL_NAME,
  PUBLIC_SCION_PROVIDER_ID,
  publicScionEnrichmentRecoveryCallLimit,
  publicScionAdmissionRisk,
  assessPublicScionKernelResponse,
  buildPublicScionRetryFeedback,
  buildPublicScionMessages,
  extractPublicScionKernelLessons,
  extractPublicScionLessonWindow,
  extractPublicScionPriorLessonTitles,
  extractPublicScionExplicitTopicSequence,
  extractPublicScionTotalLessonCount,
  extractPublicScionVoiceSurfaces,
  mergePublicScionKernelAttempts,
  publicScionModelOption,
  publicScionKernelResponseNeedsRetry,
  publicScionRetryDelay,
  repairPublicScionJson,
  repairPublicScionJsonText,
  shufflePublicScionKernelOptions,
} from '../src/lib/publicScionProvider';
import {
  SCION_LESSON_KERNEL_LOCAL_PILOT_RESPONSE,
  SCION_LESSON_KERNEL_PILOT_PROMPT,
  SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE,
} from './fixtures/scionLessonKernelAdmissionV01654.js';

describe('Scion Public provider', () => {
  const completeTerms = [0, 1, 2].map((index) => ({
    tr: `Term ${index + 1}`,
    df: `A precise disciplinary definition number ${index + 1} that is long enough for local admission.`,
    eg: `A concrete domain example number ${index + 1}.`,
    mi: `A plausible misunderstanding number ${index + 1}.`,
    cx: `The correction refutes misunderstanding number ${index + 1} with a distinct mechanism.`,
  }));

  function completeLesson(overrides = {}) {
    return {
      lessonId: 'lesson-9',
      facts: [
        'Repeated task failures provide direct evidence for revising a tested interface flow.',
        'Interview comments can explain user expectations but do not replace observed behavior.',
        'A prototype represents selected interactions before every production detail is complete.',
        'Parallel alternatives help a learner distinguish competing interpretations of the same evidence.',
        'Specific feedback supports the answer and corrects the strongest plausible misconception.',
      ],
      keyTerms: completeTerms,
      scenario: {
        su: 'A design team must decide whether to revise a checkout flow after repeated task failures while the release deadline remains fixed.',
        ma: 'Interview transcript, task-failure log, and annotated prototype screen.',
      },
      mc: [
        {
          q: 'Which evidence most directly supports revising the tested checkout flow when the team must choose one change before the fixed release deadline?',
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
          fi: [0],
          ex: 'The repeated behavior warrants testing a revision. Interview comments alone cannot prove a universal preference or cause.',
        },
      ],
      ...overrides,
    };
  }

  it('reserves bounded compiler recovery calls for browser-local Scion', () => {
    expect(PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS).toBe(4);
    expect(publicScionEnrichmentRecoveryCallLimit(1)).toBe(1);
    expect(publicScionEnrichmentRecoveryCallLimit(2)).toBe(2);
    expect(publicScionEnrichmentRecoveryCallLimit(10)).toBe(4);
  });

  it('uses a short bounded retry ladder for malformed local generations', () => {
    expect(PUBLIC_SCION_MIN_RETRIES).toBe(2);
    expect([1, 2, 3, 4, 5].map(publicScionRetryDelay)).toEqual([250, 500, 1000, 2000, 2000]);
  });

  it('ranks a missing lesson core as riskier than a complete lesson with bounded option defects', () => {
    const missingCore = publicScionAdmissionRisk({
      issues: [
        'lesson-1:facts-count:1/5',
        'lesson-1:key-terms-count:0/3',
        'lesson-1:scenario:scenario-missing',
        'lesson-1:mc-count:0/2',
      ],
    });
    const completeButDefective = publicScionAdmissionRisk({
      issues: ['lesson-1:mc-0:option-length', 'lesson-1:mc-0:truncated-option', 'lesson-1:mc-0:duplicate-options'],
    });

    expect(missingCore.criticalIssues).toBe(4);
    expect(missingCore.score).toBeGreaterThan(completeButDefective.score);
  });

  it('gives local chat and Agent turns a grounded prose contract instead of the course-map JSON contract', () => {
    const chat = buildPublicScionMessages('Course: Interaction Design', 'How should I improve Lesson 2?', {
      task: 'chat',
    });
    expect(chat[0].content).toContain('browser-local pedagogical assistant');
    expect(chat[0].content).toContain('concise Markdown');
    expect(chat[1].content).toBe('How should I improve Lesson 2?');
    expect(chat[1].content).not.toContain('TEMPLATE TO FILL');

    const agent = buildPublicScionMessages('Workspace: lesson plans are ready.', 'Audit the activities.', {
      task: 'agent',
    });
    expect(agent[0].content).toContain('browser-local course workspace agent');
    expect(agent[0].content).toContain('never claim that you changed the workspace');
    expect(agent[1].content).toBe('Audit the activities.');
  });

  it('preserves Scion semantic-pass repair instructions instead of rewriting them as a course-map task', () => {
    const system = 'You repair one multiple-choice seat. Keep the facts immutable and return {"repairs":[...]} only.';
    const user = JSON.stringify({
      facts: ['A change in input costs shifts the whole supply curve.'],
      repairs: [{ index: 0, issues: ['explanation-key-conflict'] }],
    });
    const messages = buildPublicScionMessages(system, user, {
      task: 'scionPass',
      schema: { name: 'mc_admission_batch', schema: { type: 'object' }, strict: true },
    });

    expect(messages[0].content).toContain('browser-local semantic repair worker');
    expect(messages[0].content).toContain(system);
    expect(messages[1].content).toBe(user);
    expect(messages.map((message) => message.content).join('\n')).not.toContain('compact CourseMapper lesson');
    expect(messages.map((message) => message.content).join('\n')).not.toContain('SOURCE:');
  });

  it('retries incomplete public kernel envelopes instead of accepting cached empty output', () => {
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    expect(publicScionKernelResponseNeedsRetry('{"lessons":[]}', prompt, 'blueprintEnrichment')).toBe(true);
    expect(
      publicScionKernelResponseNeedsRetry('{"lessons":[{"lessonId":"lesson-8"}]}', prompt, 'blueprintEnrichment'),
    ).toBe(true);
    const complete = JSON.stringify({ lessons: [completeLesson()] });
    expect(publicScionKernelResponseNeedsRetry(complete, prompt, 'blueprintEnrichment')).toBe(false);
    const repeated = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-9',
          keyTerms: completeTerms.map((term, index) => (index === 1 ? { ...term, cx: term.df } : term)),
        },
      ],
    });
    const assessment = assessPublicScionKernelResponse(repeated, prompt, 'blueprintEnrichment');
    expect(assessment.needsRetry).toBe(true);
    expect(assessment.issues).toContain('lesson-9:key-term-1:correction-repeats-definition');
    const hiddenCopy = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-9',
          keyTerms: completeTerms.map((term, index) =>
            index === 1 ? { ...term, df: `${term.cx} It also has a second defining property.` } : term,
          ),
        },
      ],
    });
    expect(assessPublicScionKernelResponse(hiddenCopy, prompt, 'blueprintEnrichment').issues).toContain(
      'lesson-9:key-term-1:correction-repeats-definition',
    );
    expect(buildPublicScionRetryFeedback(assessment)).toContain('cx must directly refute mi');
    expect(publicScionKernelResponseNeedsRetry('{"lessons":[]}', prompt, 'course-map')).toBe(false);
  });

  it('rejects the live v0.16.54 base pilot defects while admitting the matched reference artifact', () => {
    const repairedLocal = repairPublicScionJson(JSON.stringify(SCION_LESSON_KERNEL_LOCAL_PILOT_RESPONSE));
    const local = assessPublicScionKernelResponse(
      repairedLocal.text,
      SCION_LESSON_KERNEL_PILOT_PROMPT,
      'blueprintEnrichment',
    );
    const reference = assessPublicScionKernelResponse(
      JSON.stringify(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE),
      SCION_LESSON_KERNEL_PILOT_PROMPT,
      'blueprintEnrichment',
    );

    expect(local.needsRetry).toBe(true);
    expect(repairedLocal.repairs).toEqual(
      expect.arrayContaining([expect.objectContaining({ pass: 'completeFactSentence', trainingEligible: false })]),
    );
    expect(local.issues).toEqual(
      expect.arrayContaining([
        'lesson-3:key-term-0:unanchored-named-example',
        'lesson-3:scenario:scenario-missing-evidence-packet',
        'lesson-3:mc-0:stem-length',
        'lesson-3:mc-0:absolute-option',
        'lesson-3:mc-0:answer-position-residue',
      ]),
    );
    expect(buildPublicScionRetryFeedback(local)).toContain('Never mention the key');
    expect(reference).toEqual({ needsRetry: false, issues: [] });
  });

  it('rejects duplicate alternatives and an explanation that supports a different answer index', () => {
    const response = structuredClone(SCION_LESSON_KERNEL_REFERENCE_PILOT_RESPONSE);
    response.lessons[0].mc[1] = {
      q: 'Which boundary type is supported when measurements show plates separating and new lithosphere forming along the observed margin during the survey?',
      op: [
        'Transform boundaries accommodate plates moving side by side',
        'Divergent boundaries move apart and form new crust',
        'Convergent boundaries move together and subduct crust',
        'Transform boundaries accommodate plates moving side by side',
      ],
      ai: 0,
      fi: [1],
      ex: 'The first option is supported because divergent boundaries match separation and new crust formation, while transform boundaries only accommodate lateral motion.',
    };

    const assessment = assessPublicScionKernelResponse(
      JSON.stringify(response),
      SCION_LESSON_KERNEL_PILOT_PROMPT,
      'blueprintEnrichment',
    );
    expect(assessment.issues).toEqual(
      expect.arrayContaining([
        'lesson-3:mc-1:duplicate-options',
        'lesson-3:mc-1:answer-position-residue',
        'lesson-3:mc-1:explanation-key-conflict',
      ]),
    );
  });

  it('rejects invented quantities on source-rich kernels while preserving quantities supplied by the source', () => {
    const sourceLesson = {
      lessonId: 'lesson-9',
      title: 'Checkout evidence',
      objectives: 'Use observed task failures to choose a defensible interface revision.',
      topics: 'Ten participants are not stated; the supplied evidence names task failures and interview comments only.',
      readings: 'Supplied checkout research packet',
    };
    const unsupportedPrompt = `Course: Interface Design\nLessons:\n${JSON.stringify([sourceLesson])}\nReturn ONLY valid JSON.`;
    const unsupported = completeLesson({
      scenario: {
        su: 'A design team must choose a checkout revision after 10 users encounter repeated payment errors. The release deadline remains fixed.',
        ma: 'Interview transcript, task-failure log, and annotated prototype screen.',
      },
    });
    const unsupportedAssessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [unsupported] }),
      unsupportedPrompt,
      'blueprintEnrichment',
    );

    expect(unsupportedAssessment.issues).toContain('lesson-9:scenario:source-unsupported-quantity');
    expect(buildPublicScionRetryFeedback(unsupportedAssessment)).toContain('not explicitly present');

    const latexArtifact = completeLesson({
      scenario: {
        su: 'A design team must choose between a $0.5 \\text{ m}^2$ prototype and the current checkout flow. The release deadline remains fixed.',
        ma: 'Interview transcript, task-failure log, and annotated prototype screen.',
      },
    });
    expect(
      assessPublicScionKernelResponse(
        JSON.stringify({ lessons: [latexArtifact] }),
        unsupportedPrompt,
        'blueprintEnrichment',
      ).issues,
    ).toContain('lesson-9:scenario:source-unsupported-quantity');

    const currencyArtifact = completeLesson({
      scenario: {
        su: 'A design team must choose between a 2 dollar prototype and the current checkout flow. The release deadline remains fixed.',
        ma: 'Interview transcript, task-failure log, and annotated prototype screen.',
      },
    });
    expect(
      assessPublicScionKernelResponse(
        JSON.stringify({ lessons: [currencyArtifact] }),
        unsupportedPrompt,
        'blueprintEnrichment',
      ).issues,
    ).toContain('lesson-9:scenario:source-unsupported-quantity');

    const spelledArtifact = completeLesson({
      scenario: {
        su: 'A design team must choose a revision after ten users encounter the same error. The release deadline remains fixed.',
        ma: 'Interview transcript, task-failure log, and annotated prototype screen.',
      },
    });
    expect(
      assessPublicScionKernelResponse(
        JSON.stringify({ lessons: [spelledArtifact] }),
        unsupportedPrompt,
        'blueprintEnrichment',
      ).issues,
    ).toContain('lesson-9:scenario:source-unsupported-quantity');

    const proportionalArtifact = completeLesson({
      scenario: {
        su: 'A design team must decide whether doubled task time warrants a checkout revision. The release deadline remains fixed.',
        ma: 'Interview transcript, task-failure log, and annotated prototype screen.',
      },
    });
    expect(
      assessPublicScionKernelResponse(
        JSON.stringify({ lessons: [proportionalArtifact] }),
        unsupportedPrompt,
        'blueprintEnrichment',
      ).issues,
    ).toContain('lesson-9:scenario:source-unsupported-quantity');

    const supportedPrompt = `Course: Interface Design\nLessons:\n${JSON.stringify([
      { ...sourceLesson, topics: 'Task logs record the same checkout failure across 10 users.' },
    ])}\nReturn ONLY valid JSON.`;
    const supportedAssessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [unsupported] }),
      supportedPrompt,
      'blueprintEnrichment',
    );
    expect(supportedAssessment.issues).not.toContain('lesson-9:scenario:source-unsupported-quantity');
  });

  it('rejects a punctuated fact that ends with a dangling learner-description adjective', () => {
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    const lesson = completeLesson();
    lesson.facts[1] = 'A journey map should start from research about the steps users actual.';

    expect(
      assessPublicScionKernelResponse(JSON.stringify({ lessons: [lesson] }), prompt, 'blueprintEnrichment').issues,
    ).toContain('lesson-9:fact-1:truncated-fact');
  });

  it('accepts code identifiers as sentence subjects and grammatical relative-clause preposition endings', () => {
    const prompt = `Course: Python\nLessons:\n[{"lessonId":"lesson-9","title":"File input and output"}]\nReturn ONLY valid JSON.`;
    const lesson = completeLesson();
    lesson.facts[1] = 'open() returns a file object that the program then reads from or writes to.';
    lesson.facts[2] = 'read() reads the entire contents of a file and returns one single string.';
    lesson.facts[3] = 'readlines() returns a list that keeps every file line available for later work.';

    const issues = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [lesson] }),
      prompt,
      'blueprintEnrichment',
    ).issues;

    expect(issues).not.toContain('lesson-9:fact-1:truncated-fact');
    expect(issues).not.toContain('lesson-9:fact-2:truncated-fact');
    expect(issues).not.toContain('lesson-9:fact-3:truncated-fact');
  });

  it('rejects repeated facts and punctuated lowercase sentence fragments', () => {
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    const lesson = completeLesson();
    lesson.facts[1] = 'movement along the task flow reveals where users abandon the current checkout process.';
    lesson.facts[4] = lesson.facts[3];
    const assessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [lesson] }),
      prompt,
      'blueprintEnrichment',
    );

    expect(assessment.issues).toEqual(
      expect.arrayContaining(['lesson-9:duplicate-facts', 'lesson-9:fact-1:truncated-fact']),
    );
    expect(buildPublicScionRetryFeedback(assessment)).toContain('five distinct facts');
  });

  it('rejects a generated comparative relationship that reverses the supplied direction', () => {
    const sourceLesson = {
      lessonId: 'lesson-9',
      title: 'Capacitance',
      objectives: 'Use only the supplied claims without adding outside facts.',
      topics:
        'Claim 0: Increasing plate area increases capacitance. Claim 1: Increasing plate separation decreases capacitance.',
      readings: 'Supplied physics packet',
    };
    const prompt = `Course: Physics\nLessons:\n${JSON.stringify([sourceLesson])}\nReturn ONLY valid JSON.`;
    const wrong = completeLesson();
    wrong.facts[0] = 'Decreasing the separation between capacitor plates leads to a decrease in capacitance.';
    const correct = structuredClone(wrong);
    correct.facts[0] = 'Decreasing the separation between capacitor plates leads to an increase in capacitance.';
    const unrelated = structuredClone(wrong);
    unrelated.facts[0] = 'Increasing practice time decreases the number of avoidable calculation errors.';

    expect(
      assessPublicScionKernelResponse(JSON.stringify({ lessons: [wrong] }), prompt, 'blueprintEnrichment').issues,
    ).toContain('lesson-9:fact-0:source-direction-conflict');
    expect(
      assessPublicScionKernelResponse(JSON.stringify({ lessons: [correct] }), prompt, 'blueprintEnrichment').issues,
    ).not.toContain('lesson-9:fact-0:source-direction-conflict');
    expect(
      assessPublicScionKernelResponse(JSON.stringify({ lessons: [unrelated] }), prompt, 'blueprintEnrichment').issues,
    ).not.toContain('lesson-9:fact-0:source-direction-conflict');
  });

  it('retries judged key-term leakage and cross-field paraphrase instead of compiling it', () => {
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    const contaminatedTerms = completeTerms.map((term, index) => {
      if (index === 0) return { ...term, cx: term.eg };
      if (index === 1) return { ...term, df: `Definition: ${term.df} Example: ${term.eg}` };
      return { ...term, cx: `${term.cx} (Claim 0).` };
    });
    const assessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-9', keyTerms: contaminatedTerms }] }),
      prompt,
      'blueprintEnrichment',
    );

    expect(assessment).toMatchObject({ needsRetry: true });
    expect(assessment.issues).toEqual(
      expect.arrayContaining([
        'lesson-9:key-term-0:correction-repeats-example',
        'lesson-9:key-term-1:embedded-field-label',
        'lesson-9:key-term-2:claim-marker-residue',
      ]),
    );
    const feedback = buildPublicScionRetryFeedback(assessment);
    expect(feedback).toContain('Every df, eg, mi, and cx field must make a different instructional move');
    expect(feedback).toContain('Never embed labels');
    expect(feedback).toContain('claim numbers');
  });

  it('retries a misconception that merely relabels the lesson own fact as false', () => {
    const prompt = `Course: Music Theory\nLessons:\n[{"lessonId":"lesson-9","title":"Musical Form"}]\nReturn ONLY valid JSON.`;
    const response = {
      lessons: [
        {
          lessonId: 'lesson-9',
          facts: [
            'Musical form is the audible structure of a composition or performance across time.',
            'Listeners recognize sections through repetition and contrast.',
            'A return can remain recognizable even when details vary.',
            'Section boundaries can be supported by several musical cues.',
            'Analysis connects local events to the piece overall.',
          ],
          keyTerms: completeTerms.map((term, index) =>
            index === 0
              ? {
                  ...term,
                  mi: 'Believing musical form is the audible structure of a composition or performance across time.',
                }
              : term,
          ),
        },
      ],
    };
    const assessment = assessPublicScionKernelResponse(JSON.stringify(response), prompt, 'blueprintEnrichment');

    expect(assessment.issues).toContain('lesson-9:key-term-0:misconception-repeats-known-fact');
    expect(buildPublicScionRetryFeedback(assessment)).toContain('genuinely false learner belief');
  });

  it('keeps a source-overlapping misconception when explicit contrast makes the belief false', () => {
    const prompt = `Course: Interaction Design\nLessons:\n[{"lessonId":"lesson-9","title":"Interactive Prototyping"}]\nReturn ONLY valid JSON.`;
    const response = {
      lessons: [
        {
          lessonId: 'lesson-9',
          facts: [
            'Interactive prototyping builds a testable representation of how a planned experience looks and works without requiring every production detail.',
          ],
          keyTerms: completeTerms.map((term, index) =>
            index === 0
              ? {
                  ...term,
                  mi: 'A testable representation must include every production detail.',
                }
              : term,
          ),
        },
      ],
    };

    const assessment = assessPublicScionKernelResponse(JSON.stringify(response), prompt, 'blueprintEnrichment');
    expect(assessment.issues).not.toContain('lesson-9:key-term-0:misconception-repeats-known-fact');
  });

  it('keeps retry artifacts atomic instead of splicing unverified fields across attempts', () => {
    const previousTerms = completeTerms.map((term, index) => (index === 0 ? { ...term, cx: term.df } : term));
    const currentTerms = completeTerms.map((term, index) =>
      index === 0
        ? {
            ...term,
            tr: 'A term name accidentally expanded into a complete sentence that exceeds the compact field limit',
            cx: 'This correction directly refutes the misconception without copying the definition.',
          }
        : term,
    );
    const prompt = `Course: Interface Design\nLessons:\n[{"lessonId":"lesson-9","title":"Wireframes"}]\nReturn ONLY valid JSON.`;
    const merged = mergePublicScionKernelAttempts(
      JSON.stringify({ lessons: [{ lessonId: 'lesson-9', keyTerms: previousTerms }] }),
      JSON.stringify({ lessons: [{ lessonId: 'lesson-9', keyTerms: currentTerms }] }),
      prompt,
    );
    const first = JSON.parse(merged.text).lessons[0].keyTerms[0];
    expect(first.tr).toBe(currentTerms[0].tr);
    expect(first.cx).toBe(currentTerms[0].cx);
    expect(merged.repairs).toEqual([]);
    const completeMerged = JSON.stringify({
      lessons: [completeLesson({ keyTerms: JSON.parse(merged.text).lessons[0].keyTerms })],
    });
    expect(publicScionKernelResponseNeedsRetry(completeMerged, prompt, 'blueprintEnrichment')).toBe(true);
  });

  it('retains a whole coherent retry group only when it removes issues without introducing any', () => {
    const prompt = `Course: Interface Design
Lessons:
[{"lessonId":"lesson-9","title":"Wireframes"}]
Return ONLY valid JSON.`;
    const previous = completeLesson();
    const current = completeLesson({
      mc: completeLesson().mc.map((item) => ({
        ...item,
        op: [item.op[0], item.op[1], item.op[1], item.op[3]],
      })),
    });
    const merged = mergePublicScionKernelAttempts(
      JSON.stringify({ lessons: [previous] }),
      JSON.stringify({ lessons: [current] }),
      prompt,
    );

    expect(JSON.parse(merged.text).lessons[0].mc).toEqual(previous.mc);
    expect(merged.repairs).toEqual([
      expect.objectContaining({
        pass: 'crossAttemptAtomicRetention',
        field: 'assessmentCore',
        issueCountAfter: 0,
        trainingEligible: false,
      }),
    ]);
    expect(publicScionKernelResponseNeedsRetry(merged.text, prompt, 'blueprintEnrichment')).toBe(false);
  });

  it('retains source-valid key terms independently from the citation-coupled facts and assessments', () => {
    const prompt = `Course: Interface Design
Lessons:
[{"lessonId":"lesson-9","title":"Wireframes"}]
Return ONLY valid JSON.`;
    const previous = completeLesson();
    const current = completeLesson({
      keyTerms: completeTerms.map((term, index) => (index === 0 ? { ...term, cx: term.df } : term)),
    });

    const merged = mergePublicScionKernelAttempts(
      JSON.stringify({ lessons: [previous] }),
      JSON.stringify({ lessons: [current] }),
      prompt,
    );

    expect(JSON.parse(merged.text).lessons[0].keyTerms).toEqual(previous.keyTerms);
    expect(JSON.parse(merged.text).lessons[0].facts).toEqual(current.facts);
    expect(JSON.parse(merged.text).lessons[0].mc).toEqual(current.mc);
    expect(merged.repairs).toEqual([
      expect.objectContaining({
        pass: 'crossAttemptAtomicRetention',
        field: 'keyTerms',
        issueCountAfter: 0,
        trainingEligible: false,
      }),
    ]);
  });

  it('ships a keyless browser-local model option with prompt-only structure support', () => {
    const option = publicScionModelOption();
    expect(option.id).toBe(PUBLIC_SCION_MODEL_ID);
    expect(option.name).toBe(PUBLIC_SCION_MODEL_NAME);
    expect(option.capabilities.jsonMode).toBe(false);
    expect(option.capabilities.jsonSchema).toBe(false);
    expect(option.source).toBe('browser-local');
    expect(option.maxInputTokens).toBe(8192);
    expect(option.capabilities.streaming).toBe(true);
    expect(PUBLIC_SCION_BACKING_MODEL).toBe('google/gemma-4-E2B-it-qat-q4_0-gguf');

    const profile = createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, option);
    expect(profile.structuredOutput.defaultMode).toBe('prompt_only');
    expect(profile.supportsTools).toBe(false);
    expect(profile.supportsStreaming).toBe(true);
    expect(profile.maxOutputTokens).toBe(PUBLIC_SCION_MAX_COMPLETION_TOKENS);

    const plan = createGenerationPlan(profile);
    expect(plan.leanCourseMapAtoms).toBe(true);
    expect(plan.apiMode).toBe('browser-local-gguf');
  });

  it('forbids constructing a remote generation request for Scion', () => {
    const profile = createBaseModelCapabilities(PUBLIC_SCION_PROVIDER_ID, publicScionModelOption());
    expect(() =>
      buildProviderTextRequest({
        provider: PUBLIC_SCION_PROVIDER_ID,
        apiKey: '',
        modelId: PUBLIC_SCION_MODEL_ID,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Build a music course map.',
        modelCapabilities: profile,
        generationPlan: createGenerationPlan(profile),
        maxOutputTokens: 12000,
      }),
    ).toThrow(/browser-local/);

    const messages = buildPublicScionMessages('Return JSON.', 'Build a music course map.');
    expect(messages[0].content).toContain('browser-local');
    expect(messages[1].content).toContain('exactly 1 section object');
    expect(messages[1].content).not.toContain('presentationFormat');
  });

  it('builds a dedicated one-lesson knowledge-kernel request for public enrichment', () => {
    const userPrompt = `Course: User Experience Design Studio
Lessons:
[{"lessonId":"lesson-4","title":"Lesson 4: Affinity Mapping","objectives":"Synthesize interview observations into patterns","topics":"4.1: Affinity Mapping","readings":"Handout: synthesis guide"}]
Also include the courseLevel object once (not per lesson), grounded in the same source facts.
Return ONLY valid JSON matching the kernel shape from the instructions.`;
    expect(extractPublicScionKernelLessons(userPrompt)).toEqual([
      {
        lessonId: 'lesson-4',
        title: 'Lesson 4: Affinity Mapping',
        objectives: 'Synthesize interview observations into patterns',
        topics: '4.1: Affinity Mapping',
        readings: 'Handout: synthesis guide',
      },
    ]);

    const messages = buildPublicScionMessages(
      'Verbose kernel instructions that the local route replaces.',
      userPrompt,
      {
        task: 'blueprintEnrichment',
      },
    );

    expect(PUBLIC_SCION_KERNEL_LESSONS_PER_CALL).toBe(1);
    expect(PUBLIC_SCION_KERNEL_CONCURRENCY).toBe(1);
    expect(messages[0].content).toContain('subject-matter and assessment writer');
    expect(messages[1].content).toContain('LESSONS TO AUTHOR');
    expect(messages[1].content).toContain('Lesson 4: Affinity Mapping');
    expect(messages[1].content).toContain('Write exactly 2 mc items');
    expect(messages[1].content).toContain('Every mc item includes fi=sourceFactIndexes as [n] or [n,m]');
    expect(messages[1].content).toContain('set ai=0; the compiler shuffles answer positions after admission');
    expect(messages[1].content).toContain('without referring to any position');
    expect(messages[1].content).toContain('mi is a genuinely false learner belief');
    expect(messages[1].content).toContain('Never embed field labels or internal claim numbers');
    expect(messages[1].content).toContain('Never infer motive or cause from one ambiguous observation');
    expect(messages[1].content).toContain('one decision-ready scenario');
    expect(messages[1].content).toContain('at least 2 inspectable details');
    expect(messages[1].content).toContain(
      'The local compiler will derive discussion, assignment, slides, and study-guide surfaces',
    );
    expect(messages[1].content).toContain('Return only lessonId, facts, keyTerms, scenario, and mc');
    expect(messages[1].content).not.toContain('Also return one compact courseLevel object');
    const templateJson = messages[1].content.split('TEMPLATE TO FILL:\n')[1];
    const lessonTemplate = JSON.parse(templateJson).lessons[0];
    expect(lessonTemplate.facts).toHaveLength(5);
    expect(lessonTemplate.keyTerms).toHaveLength(3);
    expect(lessonTemplate.mc).toHaveLength(2);
    expect(lessonTemplate.mc.every((item) => item.ai === 0)).toBe(true);
    expect(lessonTemplate.scenario.ma).toBe('REPLACE');
    expect(messages[1].content).toContain('never call them "source detail one/two"');
    expect(messages[1].content).toContain('distinct 1-4 word subject term');
    expect(messages[1].content).toContain('never copy the full lesson title');
    expect(templateJson).not.toContain('discussionPrompt');
    expect(templateJson).not.toContain('assignmentCore');
    expect(templateJson).not.toContain('studyGuide');
    expect(messages[1].content).not.toContain('compact CourseMapper lessons');
    expect(messages[1].content).not.toMatch(/key wins|Option B correctly/i);
    expect(messages[1].content).not.toContain('supporting the first option');

    const recoveryMessages = buildPublicScionMessages(
      'kernel system',
      `${userPrompt}\nRecovery attempt 2: the previous response was incomplete.`,
      { task: 'blueprintEnrichment' },
    );
    expect(recoveryMessages[1].content).toContain('lesson-4');
    expect(recoveryMessages[1].content).toContain('RECOVERY 2');
    expect(recoveryMessages[1].content).toContain('Returning {"lessons":[]}');
  });

  it('tells the compact course-map pass to preserve exact named sources', () => {
    const messages = buildPublicScionMessages(
      'system',
      'Create a two-lesson course that uses Notated Example A, Recording B, and Listening Pair C.',
    );

    expect(messages[1].content).toContain('copy its exact name into supportingResources');
    expect(messages[1].content).toContain('Never replace a named source with a generic handout');
    expect(messages[1].content).toContain('Exact named source from SOURCE');
  });

  it('preserves voice surfaces while shrinking the public rewrite contract', () => {
    const surface = {
      surfaceId: 'assignments:lesson-1:overview',
      directive: { register: 'direct and brisk', length: '30-70 words' },
      text: 'Analyze the interview notes, then explain which behavioral pattern should shape the first prototype.',
      grounding: {
        lessonTitle: 'Lesson 1: Contextual Interviews',
        kernel: { terms: [{ term: 'contextual inquiry', definition: 'Observation and interviewing in context.' }] },
      },
    };
    const prompt = `Rewrite each surface.

Surfaces (JSON):
${JSON.stringify([surface], null, 2)}

Respond with JSON only, exactly this shape:
{"rewrites":[]}`;
    expect(extractPublicScionVoiceSurfaces(prompt)).toEqual([surface]);

    const messages = buildPublicScionMessages('voice system', prompt, { task: 'voicePass' });
    expect(messages[0].content).toContain('instructor and prose editor');
    expect(messages[1].content).toContain(surface.surfaceId);
    expect(messages[1].content).toContain('between 25 and 70 words');
    expect(messages[1].content).toContain('no two rewrites may begin with the same three words');
    expect(messages[1].content).not.toContain('compact CourseMapper lesson');
  });

  it('extracts a bounded public lesson window from generation and continuation prompts', () => {
    expect(
      extractPublicScionLessonWindow(
        'The syllabus contains approximately 14 lessons/weeks. Generate exactly that many.',
      ),
    ).toEqual({ start: 1, count: 3, continuation: false });
    expect(
      extractPublicScionLessonWindow('Continue generating the REMAINING lessons (Lesson 4 through Lesson 14).'),
    ).toEqual({
      start: 4,
      count: 3,
      continuation: true,
    });

    const messages = buildPublicScionMessages('system', 'Create a 3-lesson music theory course.');
    expect(messages[1].content).toContain('Create 3 compact CourseMapper lessons');
    expect(messages[1].content).toContain('Create a 3-lesson music theory course.');
  });

  it('carries prior lesson titles into continuation prompts and forbids repeats', () => {
    const prompt = `Here are the lessons already generated:
1. Lesson 1: Design Research
2. Lesson 2: Personas and Journey Maps
3. Lesson 3: Information Architecture and Wireframes

Continue generating the REMAINING lessons (Lesson 4 through Lesson 12).`;
    expect(extractPublicScionPriorLessonTitles(prompt)).toEqual([
      'Lesson 1: Design Research',
      'Lesson 2: Personas and Journey Maps',
      'Lesson 3: Information Architecture and Wireframes',
    ]);
    const messages = buildPublicScionMessages('system', prompt);
    expect(messages[1].content).toContain('PRIOR LESSONS (do not repeat)');
    expect(messages[1].content).toContain('Lesson 3: Information Architecture and Wireframes');
    expect(messages[1].content).toContain('must introduce a distinct topic');
    expect(messages[1].content).toContain('one combined lesson and name both concepts in its title');
    expect(messages[1].content).toContain('normal spaced words');
  });

  it('turns an explicit source topic list into an indexed plan for each bounded window', () => {
    const source =
      'Create a 6-week course. Use six distinct weekly focuses: scarcity and choice; supply and demand; measuring inflation with CPI; unemployment and labor markets; aggregate demand and aggregate supply; fiscal and monetary policy comparison.';
    expect(extractPublicScionExplicitTopicSequence(source)).toEqual([
      'scarcity and choice',
      'supply and demand',
      'measuring inflation with CPI',
      'unemployment and labor markets',
      'aggregate demand and aggregate supply',
      'fiscal and monetary policy comparison',
    ]);

    const continuation = `You previously generated a partial Course Map with 3 lessons, but the syllabus has 6 lessons/weeks total.

Here are the lessons already generated:
1. Lesson 1: Scarcity and Choice
2. Lesson 2: Supply and Demand
3. Lesson 3: Measuring Inflation with CPI

Continue generating the REMAINING lessons (Lesson 4 through Lesson 6).

SYLLABUS CONTENT (for reference — focusing on later content for remaining lessons):
${source}

Generate lessons 4 through 6 now as JSON:`;
    const messages = buildPublicScionMessages('system', continuation);
    expect(messages[1].content).toContain('REQUIRED TOPIC PLAN (one exact focus per lesson)');
    expect(messages[1].content).toContain('- Lesson 4: unemployment and labor markets');
    expect(messages[1].content).toContain('- Lesson 6: fiscal and monetary policy comparison');
    expect(messages[1].content).toContain('substitution is not');
  });

  it('marks the last continuation as a final window and pins the final source item', () => {
    const prompt = `You previously generated a partial Course Map with 9 lessons, but the syllabus has 12 lessons/weeks total.

Here are the lessons already generated:
1. Lesson 1: Foundations

Continue generating the REMAINING lessons (Lesson 10 through Lesson 12).`;
    expect(extractPublicScionTotalLessonCount(prompt)).toBe(12);
    const messages = buildPublicScionMessages('system', prompt);
    expect(messages[1].content).toContain('FINAL WINDOW: Lessons 10-12 of 12');
    expect(messages[1].content).toContain('Lesson 12 MUST name the final source outline item');
  });

  it('reports browser-local Scion generations as $0', () => {
    const cost = estimateUsageCost({
      provider: PUBLIC_SCION_PROVIDER_ID,
      modelId: PUBLIC_SCION_MODEL_ID,
      usage: { prompt_tokens: 10000, completion_tokens: 10000 },
    });
    expect(cost.costUsd).toBe(0);
  });

  it('repairs only common public JSON syntax defects before strict content linting', () => {
    const missingMcBrace =
      '{"lessons":[{"lessonId":"lesson-2","mc":[{"q":"Which choice is correct?","op":["A","B","C","D"],"ai":1,"ex":"Because B matches the source."]],"studyGuide":{"sm":"A sufficiently long subject summary for the study guide body.","rs":"Compare the four choices and explain the distinction."}}]}';
    const bareQuote =
      '{"lessons":[{"lessonId":"lesson-4","facts":["A design insight explains the "why" behind a recurring pattern."]}]}';
    const missingFinalStringQuote =
      '{"lessons":[{"lessonId":"lesson-10","studyGuide":{"sm":"A sufficiently long subject summary for the study guide body.","rs":"Compare prototype fidelity levels and explain when each is useful.}}]}';

    expect(() => JSON.parse(missingMcBrace)).toThrow();
    expect(JSON.parse(repairPublicScionJsonText(missingMcBrace)).lessons[0].mc).toHaveLength(1);
    expect(() => JSON.parse(bareQuote)).toThrow();
    expect(JSON.parse(repairPublicScionJsonText(bareQuote)).lessons[0].facts[0]).toContain('"why"');
    expect(() => JSON.parse(missingFinalStringQuote)).toThrow();
    expect(JSON.parse(repairPublicScionJsonText(missingFinalStringQuote)).lessons[0].studyGuide.rs).toContain(
      'prototype fidelity',
    );
  });

  it('repairs malformed MC option-array and item closers without changing content', () => {
    const malformed =
      '{"lessons":[{"lessonId":"lesson-2","mc":[{"q":"Which action is best?","op":["A","B","C","D"]","ai":1,"ex":"B uses the evidence."]},{"q":"Which flaw matters?","op":["A","B","C","D"]","ai":0,"ex":"A identifies the sampling flaw."]],"studyGuide":{"sm":"A sufficiently long subject summary connecting research planning with ethical safeguards.","rs":"Compare each decision with the supplied evidence before choosing an answer."}}]}';

    const repaired = JSON.parse(repairPublicScionJsonText(malformed));
    expect(repaired.lessons[0].lessonId).toBe('lesson-2');
    expect(repaired.lessons[0].mc).toHaveLength(2);
    expect(repaired.lessons[0].mc[0]).toMatchObject({ ai: 1, ex: 'B uses the evidence.' });
    expect(repaired.lessons[0].mc[1].op).toEqual(['A', 'B', 'C', 'D']);
    expect(repaired.lessons[0].studyGuide.rs).toContain('supplied evidence');
  });

  it('keeps the first complete valid fact sentence when a local decode runs into a truncated tail', () => {
    const firstSentence =
      'Transform boundaries let plates slide alongside each other without creating or destroying crust.';
    const response = {
      lessons: [
        {
          lessonId: 'lesson-tectonics',
          facts: [`${firstSentence} A repeated continuation begins another claim but the constrained decode trunc`],
        },
      ],
    };

    const repaired = repairPublicScionJson(JSON.stringify(response));
    expect(JSON.parse(repaired.text).lessons[0].facts[0]).toBe(firstSentence);
    expect(repaired.repairs).toEqual([
      expect.objectContaining({
        pass: 'completeFactSentence',
        lessonId: 'lesson-tectonics',
        item: 0,
        trainingEligible: false,
      }),
    ]);
  });

  it('keeps one complete definition when a local decode continues into redundant or truncated prose', () => {
    const firstSentence =
      'Recursion is a problem-solving technique that reduces a complex problem into a simpler version of itself.';
    const response = {
      lessons: [
        {
          lessonId: 'lesson-recursion',
          keyTerms: [
            {
              tr: 'recursion',
              df: `${firstSentence} This continuation repeats the idea before the constrained decode trunc`,
              eg: 'A factorial function calls itself with a smaller input.',
              mi: 'Recursion can continue safely without any stopping condition.',
              cx: 'A base case must stop the chain of self-calls.',
            },
          ],
        },
      ],
    };

    const repaired = repairPublicScionJson(JSON.stringify(response));
    expect(JSON.parse(repaired.text).lessons[0].keyTerms[0].df).toBe(firstSentence);
    expect(repaired.repairs).toEqual([
      expect.objectContaining({
        pass: 'completeDefinitionSentence',
        lessonId: 'lesson-recursion',
        item: 0,
        field: 'df',
        trainingEligible: false,
      }),
    ]);
  });

  it('deterministically shuffles admitted answer positions without changing the supported option', () => {
    const response = {
      lessons: [
        {
          lessonId: 'lesson-compact',
          mc: [
            {
              q: 'Which observation best supports revising the interface after repeated failures under a fixed deadline?',
              op: ['Supported compact answer', 'Compact distractor B', 'Compact distractor C', 'Compact distractor D'],
              ai: 0,
              ex: 'Repeated failures support revision, while a visual preference does not establish a task breakdown.',
            },
          ],
        },
        {
          lessonId: 'lesson-full',
          mc: [
            {
              question: 'Which record provides the strongest evidence for the decision when the two accounts conflict?',
              options: ['Full distractor A', 'Supported full answer', 'Full distractor C', 'Full distractor D'],
              answerIndex: 1,
              explanation:
                'The observed record supports the decision, while the isolated account cannot establish the repeated pattern.',
            },
          ],
        },
      ],
    };

    const first = shufflePublicScionKernelOptions(JSON.stringify(response));
    const second = shufflePublicScionKernelOptions(JSON.stringify(response));
    expect(first).toEqual(second);
    expect(first.repairs).toHaveLength(2);
    expect(first.repairs.every((repair) => repair.pass === 'deterministicOptionShuffle')).toBe(true);
    expect(first.repairs.every((repair) => repair.trainingEligible === false)).toBe(true);
    expect(first.repairs.every((repair) => repair.permutation.some((value, index) => value !== index))).toBe(true);

    const shuffled = JSON.parse(first.text);
    const compact = shuffled.lessons[0].mc[0];
    const full = shuffled.lessons[1].mc[0];
    expect(compact.op[compact.ai]).toBe('Supported compact answer');
    expect(full.options[full.answerIndex]).toBe('Supported full answer');
    expect(new Set(compact.op)).toEqual(new Set(response.lessons[0].mc[0].op));
    expect(new Set(full.options)).toEqual(new Set(response.lessons[1].mc[0].options));
  });

  it('does not move a public mc key from explanation-only lexical support', () => {
    const mismatched = {
      lessons: [
        {
          lessonId: 'lesson-2',
          mc: [
            {
              q: 'What is the primary purpose of a sampling frame?',
              op: [
                'To list all potential participants',
                'To ensure random selection',
                'To define the study budget',
                'To schedule interview times',
              ],
              ai: 1,
              ex: 'A sampling frame provides a complete list of potential participants for accurate sampling.',
            },
          ],
        },
      ],
    };
    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(mismatched)));
    expect(repaired.lessons[0].mc[0].ai).toBe(1);

    mismatched.lessons[0].mc[0].ex = 'This option is correct under the stated conditions.';
    const ambiguous = JSON.parse(repairPublicScionJsonText(JSON.stringify(mismatched)));
    expect(ambiguous.lessons[0].mc[0].ai).toBe(1);
  });

  it('does not move a public key from an unverified question/steps paraphrase', () => {
    const response = {
      lessons: [
        {
          lessonId: 'lesson-3',
          mc: [
            {
              q: 'Which contextual follow-up is best?',
              op: [
                'Ask about the specific steps taken during that session',
                'Ask how the participant felt overall',
                'Ask about unrelated library resources',
                'Ask what they would change generally',
              ],
              ai: 1,
              ex: 'Following up with step-by-step questions targets contextual detail; other options are broader.',
            },
          ],
        },
      ],
    };
    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(response)));
    expect(repaired.lessons[0].mc[0].ai).toBe(1);
    expect(repairPublicScionJson(JSON.stringify(response)).repairs).toEqual([]);
  });

  it('gives an MC item’s exact cited lesson facts precedence over a conflicting rationale', () => {
    const response = {
      lessons: [
        {
          lessonId: 'lesson-source-key',
          facts: [
            'Relative dating orders events while absolute dating assigns numerical ages.',
            'Absolute numerical dating assigns specific ages in years to mineral grains within a rock.',
            'Superposition orders undisturbed layers from oldest to youngest.',
          ],
          mc: [
            {
              q: 'What does absolute dating provide regarding mineral grains in a rock?',
              op: [
                'A numerical age in years',
                'A relative order of events',
                "The span of Earth's history",
                'The sequence of deposition',
              ],
              ai: 1,
              fi: [1],
              ex: 'The correct choice gives a relative ordering for the sampled mineral grains.',
            },
          ],
        },
      ],
    };

    const detailed = repairPublicScionJson(JSON.stringify(response));
    expect(JSON.parse(detailed.text).lessons[0].mc[0].ai).toBe(0);
    expect(detailed.repairs).toEqual([
      expect.objectContaining({
        pass: 'sourceAnswerAlignment',
        lessonId: 'lesson-source-key',
        item: 0,
        trainingEligible: false,
      }),
    ]);

    response.lessons[0].mc[0].fi = [9];
    expect(JSON.parse(repairPublicScionJsonText(JSON.stringify(response))).lessons[0].mc[0].ai).toBe(1);

    response.lessons[0].keyTerms = completeTerms;
    const assessment = assessPublicScionKernelResponse(
      JSON.stringify(response),
      `Course: Geology\nLessons:\n[{"lessonId":"lesson-source-key","title":"Dating Rocks"}]\nReturn ONLY valid JSON.`,
      'blueprintEnrichment',
    );
    expect(assessment.issues).toContain('lesson-source-key:mc-0:source-fact-index');
    expect(buildPublicScionRetryFeedback(assessment)).toContain(
      'sourceFactIndexes is required and may cite only supplied zero-based claim indexes',
    );
  });

  it('repairs a strict cited-fact key only when that fact has supplied-source lineage', () => {
    const citedFact =
      'readline() returns the next single line, while readlines() returns a list with every line of the file.';
    const lesson = {
      lessonId: 'lesson-file-io',
      facts: [citedFact],
      mc: [
        {
          q: 'A developer wants to process a very large data file line by line to conserve memory; which method should they use?',
          op: [
            'read() reads the entire contents of a file and returns a single string.',
            citedFact,
            'open() returns a file object that the program then reads from or writes to.',
            'read() reads only the first line of the file and returns that single line as a string.',
          ],
          ai: 0,
          fi: [0],
          ex: `${citedFact.slice(0, -1)}, which is appropriate for processing a very large data file line by line.`,
        },
      ],
    };
    const anchoredPrompt = `Course: Python File Processing
Lessons:
[{"lessonId":"lesson-file-io","title":"File input","topics":"Claim 0: ${citedFact}"}]
Return ONLY valid JSON.`;
    const anchored = repairPublicScionJson(JSON.stringify({ lessons: [lesson] }), { userPrompt: anchoredPrompt });

    expect(JSON.parse(anchored.text).lessons[0].mc[0].ai).toBe(1);
    expect(anchored.repairs).toEqual([
      expect.objectContaining({
        pass: 'sourceAnswerAlignment',
        trainingEligible: false,
        preferenceEvidence: expect.objectContaining({
          sourceAlignmentProfile: 'strict-cited-source',
          minimumQuestionClaimScore: 2,
          minimumMargin: 3,
        }),
      }),
    ]);

    const unrelatedPrompt = `Course: Python File Processing
Lessons:
[{"lessonId":"lesson-file-io","title":"File input","topics":"Claim 0: open() returns a file object for later operations."}]
Return ONLY valid JSON.`;
    const unanchored = repairPublicScionJson(JSON.stringify({ lessons: [lesson] }), {
      userPrompt: unrelatedPrompt,
    });
    expect(JSON.parse(unanchored.text).lessons[0].mc[0].ai).toBe(0);
    expect(unanchored.repairs).toEqual([]);
  });

  it('retries when a valid fact index cites the wrong lesson fact for the key', () => {
    const lesson = completeLesson({ lessonId: 'lesson-citation-mismatch' });
    lesson.mc[0].fi = [2];
    const assessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [lesson] }),
      `Course: UX Design\nLessons:\n[{"lessonId":"lesson-citation-mismatch","title":"Checkout Evidence"}]\nReturn ONLY valid JSON.`,
      'blueprintEnrichment',
    );
    expect(assessment.issues).toContain('lesson-citation-mismatch:mc-0:source-fact-key-mismatch');
    expect(buildPublicScionRetryFeedback(assessment)).toContain(
      "Each fi must cite the one or two facts that directly support the keyed option and the explanation's first sentence.",
    );
  });

  it('retries browser-local questions with incomplete feedback or multiple source-supported answers', () => {
    const prompt = `Course: UX Design\nLessons:\n[{"lessonId":"lesson-task-flow","title":"Task flow analysis"}]\nReturn ONLY valid JSON.`;
    const response = {
      lessons: [
        {
          lessonId: 'lesson-task-flow',
          facts: [
            'Task flow analysis diagrams the steps and decision points used to reach a goal.',
            'Task flow analysis validates user goals, common scenarios, and tasks.',
            'Task flow diagrams show how a user progresses through tasks.',
            'Task flow analysis surfaces obstacles between users and their goals.',
          ],
          keyTerms: completeTerms,
          mc: [
            {
              q: 'What is the primary function of a task flow analysis?',
              op: [
                'To build a polished production interface',
                'To surface obstacles between users and goals',
                'To diagram steps and decision points for reaching a goal',
                'To document the historical development of software',
              ],
              ai: 2,
              fi: [0, 3],
              ex: 'Option 1 is incorrect because it concerns production. Option 2 is incorrect because it concerns obstacles. Option 4 is incorrect because it concerns history.',
            },
          ],
        },
      ],
    };

    const assessment = assessPublicScionKernelResponse(JSON.stringify(response), prompt, 'blueprintEnrichment');
    expect(assessment.issues).toContain('lesson-task-flow:mc-0:explanation-omits-key-support');
    expect(assessment.issues).toContain('lesson-task-flow:mc-0:multiple-source-supported-options');
    const feedback = buildPublicScionRetryFeedback(assessment);
    expect(feedback).toContain('eliminating distractors alone is incomplete feedback');
    expect(feedback).toContain('exactly one option is supported by the lesson facts');
  });

  it('reports a quarantined null quiz seat as an item defect instead of misclassifying valid JSON', () => {
    const lesson = completeLesson({ mc: [completeLesson().mc[0], null] });
    const prompt = `Course: UX Design
Lessons:
[{"lessonId":"lesson-9","title":"Checkout Evidence"}]
Return ONLY valid JSON.`;

    const assessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [lesson] }),
      prompt,
      'blueprintEnrichment',
    );

    expect(assessment.issues).not.toContain('invalid-json');
    expect(assessment.issues).toEqual(
      expect.arrayContaining([
        'lesson-9:mc-1:stem-length',
        'lesson-9:mc-1:option-count',
        'lesson-9:mc-1:source-fact-index',
      ]),
    );
  });

  it('detects overlong and visibly unfinished browser-model options before retry selection', () => {
    const lesson = completeLesson();
    lesson.mc[0].op[1] =
      'A favorable comment that becomes a long explanation about visual color preferences without establishing task success or';
    const prompt = `Course: UX Design
Lessons:
[{"lessonId":"lesson-9","title":"Checkout Evidence"}]
Return ONLY valid JSON.`;

    const assessment = assessPublicScionKernelResponse(
      JSON.stringify({ lessons: [lesson] }),
      prompt,
      'blueprintEnrichment',
    );

    expect(assessment.issues).toContain('lesson-9:mc-0:option-length');
    expect(assessment.issues).toContain('lesson-9:mc-0:truncated-option');
    expect(buildPublicScionRetryFeedback(assessment)).toContain('one complete, parallel 4-10 word proposition');
  });

  it('retries when the browser model copies an unfilled compact-prompt question', () => {
    const prompt = `Course: Music Theory\nLessons:\n[{"lessonId":"lesson-intervals","title":"Interval quality"}]\nReturn ONLY valid JSON.`;
    const response = {
      lessons: [
        {
          lessonId: 'lesson-intervals',
          facts: [
            'Generic interval number counts both endpoint letter names.',
            'Three semitones form a minor third when the spelling is C to E flat.',
            'Four semitones form a major third when the spelling is C to E.',
            'Accidentals change chromatic size without changing the generic number.',
            'Semitone counting verifies the quality after the generic number is known.',
          ],
          keyTerms: completeTerms,
          mc: [
            {
              q: 'Which option correctly distinguishes the two lesson concepts?',
              op: [
                'Plausible methodological claim or action A',
                'Plausible methodological claim or action B',
                'Plausible methodological claim or action C',
                'Plausible methodological claim or action D',
              ],
              ai: 0,
              fi: [0],
              ex: 'The first option is keyed because it distinguishes the intended ideas and the second does not.',
            },
          ],
        },
      ],
    };

    const assessment = assessPublicScionKernelResponse(JSON.stringify(response), prompt, 'blueprintEnrichment');
    expect(assessment.issues).toContain('lesson-intervals:mc-0:template-residue');
    expect(buildPublicScionRetryFeedback(assessment)).toContain('Each q must name exact lesson concepts');
  });

  it('removes only an unfinished explanation tail before browser-local admission', () => {
    const response = {
      lessons: [
        {
          lessonId: 'lesson-4',
          mc: [
            {
              q: 'What is the primary role of a class in programming?',
              op: [
                'To store data for a single object',
                'To serve as a template for creating objects',
                'To execute a specific sequence of instructions',
                'To hold the shared behavior of all objects',
              ],
              ai: 1,
              ex: 'A class acts as a template for creating objects. Execution is handled by methods rather than the class definition. Shared behavior is',
            },
          ],
        },
      ],
    };

    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(response)));
    expect(repaired.lessons[0].mc[0]).toMatchObject({
      ai: 1,
      ex: 'A class acts as a template for creating objects. Execution is handled by methods rather than the class definition.',
    });

    response.lessons[0].mc[0].ex = 'A class acts as a template for creating objects without a completed sentence';
    const noBoundary = JSON.parse(repairPublicScionJsonText(JSON.stringify(response)));
    expect(noBoundary.lessons[0].mc[0].ex).toBe(response.lessons[0].mc[0].ex);

    response.lessons[0].mc[0].ex = 'A class acts as a template for creating objects. Shared behavior is';
    const detailed = repairPublicScionJson(JSON.stringify(response));
    expect(detailed.repairs).toEqual([
      expect.objectContaining({
        pass: 'incompleteExplanationTail',
        lessonId: 'lesson-4',
        item: 0,
        trainingEligible: false,
      }),
    ]);
  });

  it('lifts lesson fields that anonymous JSON accidentally nests under a sibling field', () => {
    const malformedShape = {
      lessons: [
        {
          lessonId: 'lesson-3',
          discussionPrompt: {
            pr: 'Which interpretation is defensible?',
            assignmentCore: {
              td: 'Analyze the supplied observation and produce a concise evidence-backed recommendation.',
              mc: [
                {
                  q: 'A participant reports success but reopens the same screen twice. Which conclusion is best supported?',
                  op: ['A', 'B', 'C', 'D'],
                  ai: 0,
                  ex: 'A is best supported because it accounts for the observed reopening behavior.',
                },
              ],
              studyGuide: {
                sm: 'A sufficiently long summary that connects observation with interpretation.',
                rs: 'Compare every claim with the supplied observation before selecting it.',
              },
            },
          },
        },
      ],
    };

    const repaired = JSON.parse(repairPublicScionJsonText(JSON.stringify(malformedShape)));
    expect(repaired.lessons[0].assignmentCore.td).toContain('supplied observation');
    expect(repaired.lessons[0].mc).toHaveLength(1);
    expect(repaired.lessons[0].studyGuide.rs).toContain('Compare every claim');
  });

  it('teaches the model the same fact-index citation contract the transport enforces', () => {
    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'Design',
        lessons: [
          {
            title: 'Lesson 1: Affinity Mapping',
            sections: [{ topicSection: 'Affinity Mapping', learningObjectives: 'Synthesize observations.' }],
          },
        ],
      },
      [0],
      { questionsPerLesson: 6 },
    );
    const messages = buildPublicScionMessages(prompt.systemPrompt, prompt.userPrompt, {
      task: 'blueprintEnrichment',
    });
    const text = messages.map((message) => message.content).join('\n');

    expect(text).toMatch(/fi=sourceFactIndexes/);
    expect(text).toMatch(/\[n\] or \[n,m\]: one or two distinct zero-based integers from 0 through 4/);
    expect(text).toMatch(/appears verbatim in at least one of that lesson's facts/);
  });

  it('carries the private instructor brief into the kernel source without changing the visible map', () => {
    const courseMap = {
      courseName: 'Elementary Mandarin',
      lessons: [
        {
          title: 'Lesson 1: Pinyin and Tones',
          sections: [
            {
              topicSection: 'Pinyin and Tones',
              learningObjectives: 'Distinguish tone contours.',
              supportingResources: 'Tone recording set.',
            },
          ],
        },
      ],
    };
    const sourceBrief = 'The first tone is high and level; mā means mother and mà means scold.';
    const prompt = buildLessonKernelPrompt(courseMap, [0], { questionsPerLesson: 6, sourceBrief });
    const extracted = extractPublicScionKernelLessons(prompt.userPrompt);
    const messages = buildPublicScionMessages(prompt.systemPrompt, prompt.userPrompt, {
      task: 'blueprintEnrichment',
    });

    expect(extracted[0].readings).toContain(`Instructor source brief: ${sourceBrief}`);
    expect(messages[1].content).toContain(sourceBrief);
    expect(courseMap.lessons[0].sections[0].supportingResources).toBe('Tone recording set.');
  });

  it('activates the exact fact ledger for explicit instructor-only facts in the production prompt', () => {
    const facts = [
      'A usability test observes representative users attempting realistic tasks.',
      'A test script gives each session a repeatable structure.',
      'Recruitment identifies appropriate users before the session.',
    ];
    const prompt = buildLessonKernelPrompt(
      {
        courseName: 'Usability Testing',
        lessons: [
          {
            title: 'Lesson 1: Test planning',
            sections: [{ topicSection: 'Usability test scripts and recruitment', learningObjectives: 'Plan a test.' }],
          },
        ],
      },
      [0],
      { questionsPerLesson: 6, instructorProvidedFacts: facts },
    );
    const extracted = extractPublicScionKernelLessons(prompt.userPrompt);
    const messages = buildPublicScionMessages(prompt.systemPrompt, prompt.userPrompt, {
      task: 'blueprintEnrichment',
    });

    expect(extracted[0]).toMatchObject({
      sourceFactPolicy: 'numbered-source-ledger-v1',
      sourceFacts: facts,
    });
    expect(messages[1].content).toContain('SOURCE FACT LEDGER');
    expect(messages[1].content).toContain('Copy that facts array exactly');
  });
});
