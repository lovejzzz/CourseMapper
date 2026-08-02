import { describe, expect, it } from 'vitest';
import {
  inferSavedLessonPlanSessionMinutes,
  prepareProjectSnapshotForRestore,
  restoreAuthoredOverlayForSnapshot,
  sanitizeProjectSnapshot,
} from '../projectSnapshotSanitizer';

describe('restoreAuthoredOverlayForSnapshot', () => {
  it('reattaches the compiler-owned overlay when a re-derived graph lost it', () => {
    const graph = {
      sessions: [{ id: 's1', number: 1 }],
      enrichmentOverlay: null,
    };
    const overlay = {
      lessonContent: { 'lesson-1': { quizItems: [{ type: 'short_answer' }] } },
    };
    expect(restoreAuthoredOverlayForSnapshot(graph, overlay)).toEqual({
      ...graph,
      enrichmentOverlay: overlay,
    });
    expect(restoreAuthoredOverlayForSnapshot({ ...graph, enrichmentOverlay: { kept: true } }, overlay)).toEqual({
      ...graph,
      enrichmentOverlay: { kept: true },
    });
  });
});

describe('sanitizeProjectSnapshot', () => {
  it('removes secret fields recursively without dropping model configuration', () => {
    const snapshot = {
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      modelName: 'GPT-5.4 Mini',
      deliverableConfig: {
        slideDecks: {
          apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
          prompt: 'Build a deck.',
        },
      },
      deliverables: {
        slideDecks: {
          data: {
            generatedImage: {
              accessToken: 'image-token',
              url: 'data:image/png;base64,abc',
            },
          },
        },
      },
      chatHistory: [
        {
          role: 'assistant',
          authorization: 'Bearer hidden-token',
          text: 'Done.',
        },
      ],
    };

    const sanitized = sanitizeProjectSnapshot(snapshot);

    expect(sanitized).toMatchObject({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
      modelName: 'GPT-5.4 Mini',
      deliverableConfig: { slideDecks: { prompt: 'Build a deck.' } },
      deliverables: {
        slideDecks: {
          data: { generatedImage: { url: 'data:image/png;base64,abc' } },
        },
      },
      chatHistory: [{ role: 'assistant', text: 'Done.' }],
    });
    expect(JSON.stringify(sanitized)).not.toContain('sk-proj');
    expect(JSON.stringify(sanitized)).not.toContain('image-token');
    expect(JSON.stringify(sanitized)).not.toContain('hidden-token');
  });

  it('redacts key-like text values in exported project content', () => {
    const sanitized = sanitizeProjectSnapshot({
      promptText: 'Never persist sk-ant-abcdefghijklmnopqrstuvwxyz123456 in a project backup.',
      courseMap: {
        lessons: [
          {
            title: 'API Design',
            sections: [
              {
                topicSection: 'Use Bearer abcdefghijklmnopqrstuvwxyz1234567890 only in local setup.',
              },
            ],
          },
        ],
      },
    });

    expect(sanitized.promptText).toBe('Never persist [redacted secret] in a project backup.');
    expect(sanitized.courseMap.lessons[0].title).toBe('API Design');
    expect(sanitized.courseMap.lessons[0].sections[0].topicSection).toBe('Use [redacted secret] only in local setup.');
  });

  it('does not mutate the original snapshot', () => {
    const snapshot = {
      apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      promptText: 'Keep course text.',
    };
    const sanitized = sanitizeProjectSnapshot(snapshot);

    expect(sanitized).toEqual({ promptText: 'Keep course text.' });
    expect(snapshot).toEqual({
      apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      promptText: 'Keep course text.',
    });
  });

  it('preserves non-plain objects such as Firestore timestamps', () => {
    const timestampLike = {
      toDate: () => new Date('2026-06-01T00:00:00Z'),
    };
    Object.setPrototypeOf(timestampLike, {
      constructor: { name: 'Timestamp' },
    });

    const sanitized = sanitizeProjectSnapshot({
      updatedAt: timestampLike,
      nested: {
        apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
        title: 'Keep this',
      },
    });

    expect(sanitized.updatedAt).toBe(timestampLike);
    expect(sanitized.nested).toEqual({ title: 'Keep this' });
  });
});

describe('prepareProjectSnapshotForRestore', () => {
  it('migrates a legacy exact package clock before the workspace is finalized again', () => {
    const legacy = {
      courseMap: { lessons: [{ title: 'Lesson 1' }, { title: 'Lesson 2' }] },
      deliverables: {
        lessonPlans: {
          status: 'done',
          data: {
            lessonPlans: [1, 2].map((lessonNumber) => ({
              lessonTitle: `Lesson ${lessonNumber}`,
              duration: '110 minutes',
              classSessionPlan: { sessionMinutes: 110 },
              outlineTiming: { sessionMinutes: 110 },
            })),
          },
        },
      },
    };

    expect(inferSavedLessonPlanSessionMinutes(legacy)).toBe(110);
    const restored = prepareProjectSnapshotForRestore(legacy);

    expect(restored.generationConstraints).toEqual({
      sessionMinutes: 110,
      sessionMinutesSource: 'legacy-exact-package',
    });
    expect(restored.deliverableConfig.lessonPlans.sessionLength).toBe('110 min');
  });

  it('infers the saved clock from the canonical lesson-plan root when a stale alias coexists', () => {
    const plan = (minutes) => ({
      duration: `${minutes} minutes`,
      classSessionPlan: { sessionMinutes: minutes },
      outlineTiming: { sessionMinutes: minutes },
    });
    const snapshot = {
      deliverables: {
        lessonPlans: {
          data: {
            lessonPlans: [plan(75)],
            plans: [plan(110)],
          },
        },
      },
    };

    expect(inferSavedLessonPlanSessionMinutes(snapshot)).toBe(75);
  });

  it('keeps an explicit saved generation clock authoritative over defective artifacts', () => {
    const restored = prepareProjectSnapshotForRestore({
      courseMap: { lessons: [{ title: 'Lesson 1' }] },
      generationConstraints: {
        sessionMinutes: 75,
        sessionMinutesSource: 'resolved-generation-default',
      },
      deliverables: {
        lessonPlans: {
          data: {
            lessonPlans: [
              {
                duration: '110 minutes',
                classSessionPlan: { sessionMinutes: 110 },
                outlineTiming: { sessionMinutes: 110 },
              },
            ],
          },
        },
      },
    });

    expect(restored.generationConstraints.sessionMinutes).toBe(75);
    expect(restored.deliverableConfig.lessonPlans.sessionLength).toBe('75 min');
  });

  it('does not infer a clock from inconsistent legacy lesson plans', () => {
    const legacy = {
      courseMap: { lessons: [{ title: 'Lesson 1' }, { title: 'Lesson 2' }] },
      deliverables: {
        lessonPlans: {
          data: {
            lessonPlans: [{ duration: '75 minutes' }, { duration: '110 minutes' }],
          },
        },
      },
    };

    expect(inferSavedLessonPlanSessionMinutes(legacy)).toBeNull();
    const restored = prepareProjectSnapshotForRestore(legacy);
    expect(restored).not.toHaveProperty('generationConstraints');
  });

  it('sanitizes legacy project snapshots before restoring them to app state', () => {
    const legacy = {
      courseMap: {
        courseName: 'Legacy sk-proj-abcdefghijklmnopqrstuvwxyz1234567890',
        lessons: [
          {
            title: 'Keep lesson title',
            apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890',
          },
        ],
      },
      promptText: 'Connected with Bearer abcdefghijklmnopqrstuvwxyz1234567890ABCDE',
      deliverables: {
        lessonPlans: {
          stale: true,
          data: {
            notes: 'Provider sk-ant-abcdefghijklmnopqrstuvwxyz1234567890',
            refreshToken: 'sk-ant-abcdefghijklmnopqrstuvwxyz1234567890',
          },
        },
      },
    };

    const restored = prepareProjectSnapshotForRestore(legacy);

    expect(restored.formatVersion).toBe(1);
    expect(restored.courseMap.courseName).toBe('Legacy [redacted secret]');
    expect(restored.courseMap.lessons[0]).toEqual({
      title: 'Keep lesson title',
    });
    expect(restored.promptText).toBe('Connected with [redacted secret]');
    expect(restored.deliverables.lessonPlans).toMatchObject({
      stale: true,
      staleConfidence: { level: 'high', maxWeight: 1.0, dominantField: null },
      data: {
        notes: 'Provider [redacted secret]',
      },
    });
    expect(restored.deliverables.lessonPlans.data).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(restored)).not.toContain('sk-proj-');
    expect(JSON.stringify(restored)).not.toContain('sk-ant-');
    expect(JSON.stringify(restored)).not.toContain('Bearer ');
  });

  it('does not mutate the legacy snapshot while applying restore migrations', () => {
    const legacy = {
      courseMap: { lessons: [] },
      deliverables: {
        slideDecks: { stale: true },
      },
    };

    const restored = prepareProjectSnapshotForRestore(legacy);

    expect(restored).not.toBe(legacy);
    expect(restored.deliverables.slideDecks.staleConfidence).toEqual({
      level: 'high',
      maxWeight: 1.0,
      dominantField: null,
    });
    expect(legacy).toEqual({
      courseMap: { lessons: [] },
      deliverables: {
        slideDecks: { stale: true },
      },
    });
  });

  it.each([
    ...[
      'exportFailed',
      'exportStatus',
      'finalizerRevision',
      'packageReadinessReceipt',
      'exportChecked',
      'autoFixedCount',
    ].map((field) => [
      field,
      (onRead) => {
        const receipt = { exportChecked: 11 };
        Object.defineProperty(receipt, field, {
          enumerable: true,
          get() {
            onRead();
            throw new Error(`${field} getter executed`);
          },
        });
        return receipt;
      },
    ]),
    ...['exportVerification', 'downloadSafety'].map((field) => [
      `nested ${field}`,
      (onRead) => {
        const packageReadinessReceipt = {};
        Object.defineProperty(packageReadinessReceipt, field, {
          enumerable: true,
          get() {
            onRead();
            throw new Error(`${field} getter executed`);
          },
        });
        return { exportChecked: 11, packageReadinessReceipt };
      },
    ]),
  ])('drops invalid package evidence before restore sanitation can read %s', (_label, makeReceipt) => {
    let reads = 0;
    const restored = prepareProjectSnapshotForRestore({
      courseMap: { lessons: [] },
      packageQualityPass: {
        status: 'ready',
        quality: { status: 'graded', score: 100, grade: 'A' },
        receipt: makeReceipt(() => {
          reads += 1;
        }),
      },
      lastRunDigest: { finishRunId: 'invalid-receipt' },
    });

    expect(reads).toBe(0);
    expect(restored).not.toHaveProperty('packageQualityPass');
    expect(restored).not.toHaveProperty('lastRunDigest');
  });

  it('drops a receiptless terminal judgment even when a stale digest is present', () => {
    const restored = prepareProjectSnapshotForRestore({
      courseMap: { lessons: [] },
      packageQualityPass: { status: 'ready', message: 'Stale terminal state.' },
      lastRunDigest: { finishRunId: 'old-run' },
    });

    expect(restored).not.toHaveProperty('packageQualityPass');
    expect(restored).not.toHaveProperty('lastRunDigest');
  });

  it.each(['status', 'quality', 'receipt'])(
    'drops package evidence without reading a package-judgment %s accessor',
    (field) => {
      let reads = 0;
      const packageQualityPass = {
        status: 'ready',
        quality: { status: 'graded', score: 100, grade: 'A' },
        receipt: { exportChecked: 11 },
      };
      Object.defineProperty(packageQualityPass, field, {
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter executed`);
        },
      });

      const restored = prepareProjectSnapshotForRestore({
        courseMap: { lessons: [] },
        packageQualityPass,
        lastRunDigest: { finishRunId: 'invalid-envelope' },
      });

      expect(reads).toBe(0);
      expect(restored).not.toHaveProperty('packageQualityPass');
      expect(restored).not.toHaveProperty('lastRunDigest');
    },
  );

  it('fails closed when the complete project snapshot is a revoked proxy', () => {
    const revoked = Proxy.revocable(
      {
        courseMap: { lessons: [] },
        packageQualityPass: {
          status: 'ready',
          receipt: { exportChecked: 11 },
        },
      },
      {},
    );
    revoked.revoke();

    expect(() => prepareProjectSnapshotForRestore(revoked.proxy)).not.toThrow();
    expect(prepareProjectSnapshotForRestore(revoked.proxy)).toMatchObject({ formatVersion: 1 });
  });

  it('drops a digest-only accessor before recursive sanitation can read it', () => {
    let reads = 0;
    const snapshot = { courseMap: { lessons: [] } };
    Object.defineProperty(snapshot, 'lastRunDigest', {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error('lastRunDigest getter executed');
      },
    });

    const restored = prepareProjectSnapshotForRestore(snapshot);
    expect(reads).toBe(0);
    expect(restored).not.toHaveProperty('lastRunDigest');
  });

  it('drops a digest-only proxy without semantically reading it', () => {
    let reads = 0;
    const digest = new Proxy(
      { finishRunId: 'proxy-run' },
      {
        get(target, property, receiver) {
          reads += 1;
          return Reflect.get(target, property, receiver);
        },
      },
    );

    const restored = prepareProjectSnapshotForRestore({
      courseMap: { lessons: [] },
      lastRunDigest: digest,
    });
    expect(reads).toBe(0);
    expect(restored).not.toHaveProperty('lastRunDigest');
  });
});
