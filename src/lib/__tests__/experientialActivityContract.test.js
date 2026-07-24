import { describe, expect, it } from 'vitest';
import {
  buildExperientialActivityAssignmentBrief,
  buildExperientialActivityLessonPlanProfile,
  buildExperientialActivityMaterials,
  buildExperientialActivityOutline,
  buildExperientialActivityPacket,
  buildExperientialActivitySlideFrames,
  mergeExperientialActivityBriefs,
  normalizeExperientialActivityTiming,
} from '../compilerExperientialActivity';
import {
  EXPERIENTIAL_ACTIVITY_PROTOCOL,
  compactActivityBlueprintJsonSchema,
  experientialActivityTypeHint,
  normalizeExperientialActivityBlueprint,
  requestsExperientialActivity,
} from '../experientialActivityContract';
import { selectExperientialActivityBrief } from '../blueprintEnrichmentPass';
import { compactLessonKernelSchemaProfile } from '../scionContracts';
import { buildExperientialActivityFindings } from '../quality/deepQualitySubstanceDetails';

const ACTIVITY_CASES = [
  {
    name: 'international-relations negotiation',
    minutes: 50,
    lesson: {
      lessonId: 'lesson-ir',
      title: 'Maritime Security Negotiation Simulation',
      topics: ['maritime monitoring', 'attribution under uncertainty'],
      objectives: ['Negotiate a monitored corridor protocol from incomplete collision records.'],
      sync: ['Multi-party negotiation simulation'],
    },
    activity: {
      lessonId: 'lesson-ir',
      activityType: 'Maritime monitoring negotiation simulation',
      scenario:
        'Two coastal delegations dispute responsibility for a patrol collision while a civilian convoy approaches the same corridor. A neutral mediation team must secure monitored passage before the convoy deadline.',
      roles: [
        {
          name: 'Coastal navigation delegation',
          goal: 'Keep civilian passage open without accepting unsupported responsibility.',
          constraint: 'Cannot authorize another state to command its patrol vessel.',
          privateInformation: 'Its shore radar record contains a six-minute outage.',
        },
        {
          name: 'Convoy access delegation',
          goal: 'Secure independently monitored passage for the civilian convoy.',
          constraint: 'Cannot accept a route that omits inspection access for the damaged vessel.',
          privateInformation: 'The convoy has only one safe arrival window.',
        },
      ],
      evidence: [
        'The collision record timestamps the impact but does not establish which patrol crossed first.',
        'The civilian convoy log records two unanswered radio calls before the impact.',
      ],
      updates: [
        {
          title: 'Radar outage confirmed',
          information: 'A technician confirms that the shore radar record was unavailable for six minutes.',
          requiredDecision: 'Revise the attribution claim and record whether monitored passage remains acceptable.',
        },
      ],
      artifact: {
        title: 'Monitored corridor protocol',
        requirements: [
          'State the permitted route and timing window.',
          'Assign one neutral monitoring action.',
          'Name the evidence threshold that triggers revision.',
        ],
      },
      timing: [
        { phase: 'Briefing', minutes: 8 },
        { phase: 'Role preparation', minutes: 12 },
        { phase: 'Negotiation update', minutes: 18 },
        { phase: 'Protocol and debrief', minutes: 12 },
      ],
      debriefPrompts: [
        'Which collision record changed the attribution claim, and which uncertainty remained?',
        'Which constraint most shaped the monitored corridor protocol?',
      ],
      safetyBoundary:
        'Use only the fictional maritime record supplied here and do not map participant roles onto a current conflict.',
    },
  },
  {
    name: 'science engineering lab',
    minutes: 60,
    lesson: {
      lessonId: 'lesson-lab',
      title: 'RC Circuit Discharge Lab Investigation',
      topics: ['capacitor discharge curve', 'time constant', 'measurement uncertainty'],
      objectives: ['Estimate the RC time constant from voltage measurements and explain uncertainty.'],
      sync: ['Laboratory investigation with measurement roles'],
    },
    activity: {
      lessonId: 'lesson-lab',
      activityType: 'RC circuit discharge laboratory investigation',
      scenario:
        'A test bench produces capacitor-discharge measurements that do not align perfectly with the nominal resistor and capacitor labels. The lab team must determine a defensible time constant and explain the mismatch.',
      roles: [
        {
          name: 'Circuit operator',
          goal: 'Run each capacitor discharge trial using the shared start and stop procedure.',
          constraint: 'Must de-energize the circuit before changing a component or probe.',
          privateInformation: '',
        },
        {
          name: 'Measurement analyst',
          goal: 'Estimate the time constant from recorded voltage and time pairs.',
          constraint: 'Must preserve outlying measurements until the team documents a reason to exclude them.',
          privateInformation: '',
        },
      ],
      evidence: [
        'The capacitor discharge table lists voltage measurements at equal time intervals for three trials.',
        'The resistor and capacitor labels imply a nominal RC time constant that differs from the fitted curve.',
      ],
      updates: [
        {
          title: 'Probe offset check',
          information: 'A zero-input check shows a small voltage probe offset that affects every discharge trial.',
          requiredDecision:
            'Decide whether and how to correct the voltage measurements before fitting the discharge curve.',
        },
      ],
      artifact: {
        title: 'RC discharge analysis sheet',
        requirements: [
          'Plot the measured capacitor discharge curve.',
          'Report the fitted time constant with units.',
          'Explain one measurement uncertainty and its likely effect.',
        ],
      },
      timing: [
        { phase: 'Safety and setup', minutes: 10 },
        { phase: 'Discharge trials', minutes: 20 },
        { phase: 'Offset update and analysis', minutes: 20 },
        { phase: 'Analysis sheet and debrief', minutes: 10 },
      ],
      debriefPrompts: [
        'How did the probe offset change the fitted RC time constant?',
        'Which measurement uncertainty most limits the discharge conclusion?',
      ],
      safetyBoundary:
        'Use the low-voltage bench procedure, de-energize before rewiring, and treat the supplied measurements as the evidence boundary.',
    },
  },
  {
    name: 'UX studio critique',
    minutes: 75,
    lesson: {
      lessonId: 'lesson-ux',
      title: 'Checkout Flow Studio Critique',
      topics: ['checkout usability', 'error recovery', 'critique evidence'],
      objectives: ['Revise a checkout flow from observed usability evidence.'],
      sync: ['Structured UX studio critique'],
    },
    activity: {
      lessonId: 'lesson-ux',
      activityType: 'Checkout flow UX studio critique',
      scenario:
        'A mobile checkout prototype loses users after an address-validation error and gives weak confirmation after payment. The design studio must identify the strongest evidence and choose one coherent revision direction.',
      roles: [
        {
          name: 'Presenting design team',
          goal: 'Explain the current checkout flow and select a feasible revision direction.',
          constraint: 'May defend a choice only with visible prototype or usability-session evidence.',
          privateInformation: '',
        },
        {
          name: 'Critique evidence team',
          goal: 'Test whether each critique claim is supported by an observed checkout behavior.',
          constraint: 'Must separate user observation from personal design preference.',
          privateInformation: '',
        },
      ],
      evidence: [
        'The usability notes show three participants abandoning checkout after the address-validation error.',
        'The prototype displays payment confirmation below the fold without a persistent order reference.',
      ],
      updates: [
        {
          title: 'Constraint update',
          information:
            'Engineering can change validation copy and confirmation hierarchy but cannot replace the address service.',
          requiredDecision: 'Prioritize one checkout revision and record the evidence and constraint that justify it.',
        },
      ],
      artifact: {
        title: 'Checkout critique revision board',
        requirements: [
          'Pair each critique claim with observed usability evidence.',
          'Show the selected checkout-flow revision.',
          'Name one constraint and one question for the next usability test.',
        ],
      },
      timing: [
        { phase: 'Evidence walk', minutes: 15 },
        { phase: 'Studio critique', minutes: 25 },
        { phase: 'Constraint update', minutes: 15 },
        { phase: 'Revision board and debrief', minutes: 20 },
      ],
      debriefPrompts: [
        'Which usability observation most changed the checkout revision?',
        'Where did the studio separate design preference from user evidence?',
      ],
      safetyBoundary:
        'Critique the checkout work rather than its designers, protect participant privacy, and use only the supplied usability record.',
    },
  },
  {
    name: 'clinical counseling role-play',
    minutes: 90,
    lesson: {
      lessonId: 'lesson-clinical',
      title: 'Motivational Interviewing Counseling Role-Play',
      topics: ['open questions', 'reflective listening', 'change talk'],
      objectives: ['Practice a bounded motivational interviewing response and document feedback.'],
      sync: ['Triad counseling role-play'],
    },
    activity: {
      lessonId: 'lesson-clinical',
      activityType: 'Motivational interviewing counseling role-play',
      scenario:
        'A fictional client is considering a change in sleep habits but expresses ambivalence about losing late-night social time. A counseling triad must practice reflective listening without diagnosing or directing the client.',
      roles: [
        {
          name: 'Counselor',
          goal: 'Elicit the client perspective through open questions and reflective listening.',
          constraint: 'Must not diagnose, prescribe, or pressure the client toward a choice.',
          privateInformation: '',
        },
        {
          name: 'Fictional client',
          goal: 'Express both reasons for change and reasons to preserve the current sleep routine.',
          constraint: 'May disclose only the details provided in the fictional client brief.',
          privateInformation: 'Social connection is the strongest reason for staying up late.',
        },
        {
          name: 'Process observer',
          goal: 'Record open questions, reflections, and examples of change talk.',
          constraint: 'Comments on observable counseling moves rather than judging the client.',
          privateInformation: '',
        },
      ],
      evidence: [
        'The fictional client brief describes fatigue alongside valued late-night social connection.',
        'The observer checklist distinguishes open questions, reflections, advice, and change talk.',
      ],
      updates: [
        {
          title: 'Ambivalence deepens',
          information: 'The fictional client adds that an earlier schedule could reduce contact with close friends.',
          requiredDecision: 'Choose and record a reflective response that acknowledges both sides of the ambivalence.',
        },
      ],
      artifact: {
        title: 'Motivational interviewing process note',
        requirements: [
          'Record two open questions and two reflections.',
          'Identify one example of change talk without diagnosing.',
          'Name one feedback-based revision for the next role-play.',
        ],
      },
      timing: [
        { phase: 'Boundary and role briefing', minutes: 15 },
        { phase: 'First role-play', minutes: 25 },
        { phase: 'Update and second role-play', minutes: 30 },
        { phase: 'Process note and debrief', minutes: 20 },
      ],
      debriefPrompts: [
        'Which reflection acknowledged both sides of the fictional client ambivalence?',
        'Which observer evidence should change the next counseling response?',
      ],
      safetyBoundary:
        'Use a fictional client only, allow anyone to pause or change roles, and do not invite personal disclosure, diagnosis, or treatment advice.',
    },
  },
  {
    name: 'business policy case',
    minutes: 120,
    lesson: {
      lessonId: 'lesson-case',
      title: 'Transit Pricing Policy Case Exercise',
      topics: ['transit pricing', 'equity impact', 'budget constraint'],
      objectives: ['Recommend a transit pricing option from ridership, equity, and budget evidence.'],
      sync: ['Business policy case exercise'],
    },
    activity: {
      lessonId: 'lesson-case',
      activityType: 'Transit pricing business policy case exercise',
      scenario:
        'A transit authority must close a projected operating gap without sharply reducing access for riders with low incomes. The case team must recommend one pricing package from a bounded set of ridership and budget records.',
      roles: [
        {
          name: 'Finance analysis team',
          goal: 'Identify a pricing package that addresses the projected operating gap.',
          constraint: 'Must show the revenue assumption and cannot treat projected ridership as certain.',
          privateInformation: '',
        },
        {
          name: 'Access impact team',
          goal: 'Test how each transit pricing package affects riders with low incomes.',
          constraint: 'Must use the supplied ridership distribution rather than a generic equity claim.',
          privateInformation: '',
        },
      ],
      evidence: [
        'The transit budget table compares the operating gap with projected revenue under three pricing packages.',
        'The ridership distribution shows that riders with low incomes transfer more often than the system average.',
      ],
      updates: [
        {
          title: 'Ridership sensitivity update',
          information:
            'A revised forecast widens the possible ridership response for the highest transit fare increase.',
          requiredDecision: 'Revise the pricing recommendation or defend it with an explicit uncertainty condition.',
        },
      ],
      artifact: {
        title: 'Transit pricing recommendation brief',
        requirements: [
          'Recommend one pricing package.',
          'Cite one budget result and one access result.',
          'State an uncertainty condition that would trigger revision.',
        ],
      },
      timing: [
        { phase: 'Case briefing', minutes: 20 },
        { phase: 'Team analysis', minutes: 35 },
        { phase: 'Forecast update', minutes: 25 },
        { phase: 'Recommendation and debrief', minutes: 40 },
      ],
      debriefPrompts: [
        'Which transit budget evidence carried the most weight in the recommendation?',
        'How did the ridership sensitivity update change the equity or revenue trade-off?',
      ],
      safetyBoundary:
        'Treat the transit records as a bounded instructional case and label every forecast assumption rather than presenting it as a fact.',
    },
  },
];

describe('experiential activity admission and deterministic projection', () => {
  it.each(ACTIVITY_CASES)('admits and preserves the $name blueprint across compiler surfaces', (fixture) => {
    const facts = fixture.activity.evidence.map((item) => item);
    const admitted = normalizeExperientialActivityBlueprint(fixture.activity, {
      expectedLessonIds: [fixture.lesson.lessonId],
      promptLesson: fixture.lesson,
      facts,
    });
    expect(admitted.issues).toEqual([]);
    expect(admitted.blueprint).toMatchObject({
      protocol: EXPERIENTIAL_ACTIVITY_PROTOCOL,
      lessonId: fixture.lesson.lessonId,
      scenario: fixture.activity.scenario,
    });

    const packet = buildExperientialActivityPacket({
      activity: admitted.blueprint,
      sessionMinutes: fixture.minutes,
    });
    const outline = buildExperientialActivityOutline({
      activity: admitted.blueprint,
      sessionMinutes: fixture.minutes,
    });
    const slides = buildExperientialActivitySlideFrames({
      title: fixture.lesson.title,
      activity: admitted.blueprint,
      sessionMinutes: fixture.minutes,
    });
    const brief = buildExperientialActivityAssignmentBrief({
      lessonNumber: 1,
      relatedLessonTitle: fixture.lesson.title,
      activity: admitted.blueprint,
      sessionMinutes: fixture.minutes,
      outcomes: fixture.lesson.objectives,
    });
    const profile = buildExperientialActivityLessonPlanProfile({
      activity: admitted.blueprint,
      sessionMinutes: fixture.minutes,
      outcomes: fixture.lesson.objectives,
    });
    const materials = buildExperientialActivityMaterials({ activity: admitted.blueprint });
    const surfaceText = JSON.stringify({ packet, outline, slides, brief, profile, materials });

    expect(packet.totalMinutes).toBe(fixture.minutes);
    expect(new Set(packet.roles.map((role) => role.constraint.toLowerCase())).size).toBe(packet.roles.length);
    expect(packet.artifact.requirements.join(' ')).toMatch(
      /evidence.*role constraint.*synchronized update.*unresolved uncertainty.*next evidence check/i,
    );
    expect(outline.reduce((sum, row) => sum + Number.parseInt(row.time, 10), 0)).toBe(fixture.minutes);
    expect(slides.reduce((sum, slide) => sum + slide.minutes, 0)).toBe(fixture.minutes);
    expect(slides).toHaveLength(fixture.activity.timing.length);
    expect(slides[0]).toMatchObject({ type: 'activity', title: fixture.lesson.title });
    expect(slides[0].bullets.join(' ')).toContain(`Activity clock:`);
    expect(slides[0].bullets.join(' ')).toContain(`Total time: ${fixture.minutes} minutes`);
    expect(slides.map(({ activity, minutes }) => ({ phase: activity, minutes }))).toEqual(packet.timing);
    expect(surfaceText).toContain(fixture.activity.scenario);
    fixture.activity.roles.forEach((role) => {
      expect(surfaceText).toContain(role.name);
      expect(surfaceText).toContain(role.constraint);
    });
    fixture.activity.evidence.forEach((item) => expect(surfaceText).toContain(item));
    fixture.activity.updates.forEach((update) => {
      expect(surfaceText).toContain(update.information);
      expect(surfaceText).toContain(update.requiredDecision);
      expect(JSON.stringify(outline)).toContain(update.information);
      expect(JSON.stringify(slides)).toContain(update.information);
    });
    expect(surfaceText).toContain(fixture.activity.artifact.title);
    fixture.activity.debriefPrompts.forEach((prompt) => expect(surfaceText).toContain(prompt));
    expect(surfaceText).toContain(fixture.activity.safetyBoundary);
    expect(profile.formativeCheck.instructorAction).toMatch(/^Ask students to revise/i);
    expect(profile.udlNotes.engagement).not.toMatch(/while preserving the same evidence/i);
  });

  it('keeps a merged activity packet complete without repeating a page of generic directions', () => {
    const fixture = ACTIVITY_CASES[0];
    const packetBrief = buildExperientialActivityAssignmentBrief({
      lessonNumber: 1,
      relatedLessonTitle: fixture.lesson.title,
      activity: fixture.activity,
      sessionMinutes: fixture.minutes,
      outcomes: fixture.lesson.objectives,
    });
    const originalInstructions = Array.from({ length: 12 }, (_, index) => `Assessment direction ${index + 1}`);
    const merged = mergeExperientialActivityBriefs([
      {
        lessonNumber: 1,
        title: 'Companion analysis.',
        overview: 'Test a course-specific claim against a sentence fragment from the generated source.',
        objectives: ['Analyze Maritime Crisis focus using course evidence.'],
        instructions: originalInstructions,
        deliverables: ['Analysis'],
      },
      packetBrief,
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].activityPacket).toBeTruthy();
    expect(merged[0].instructions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/situation.*role constraints.*clock/i),
        expect.stringMatching(/supplied evidence.*initial decision.*before any update/i),
        expect.stringMatching(/synchronized update.*changed decision or conclusion/i),
        expect.stringMatching(/activity evidence log/i),
      ]),
    );
    expect(merged[0].instructions).toHaveLength(7);
    expect(merged[0].title).toBe(fixture.activity.artifact.title);
    expect(merged[0].overview).toContain(fixture.activity.scenario);
    expect(merged[0].overview).toContain(fixture.activity.artifact.title);
    expect(merged[0].overview).toMatch(/supplied evidence.*update-responsive revision/i);
    expect(merged[0].objectives.join(' ')).not.toMatch(/\bMaritime Crisis focus\b/i);
    expect(merged[0].deliverables).toEqual([
      fixture.activity.artifact.title,
      'Completed activity evidence log',
      'Concise debrief note',
    ]);
    expect(merged[0].selfAssessmentRubric).toHaveLength(4);
    expect(merged[0].academicIntegrityStatement).toMatch(/credit outside sources and approved tools/i);
    expect(merged[0].scaffoldingMilestones.map((entry) => entry.milestone)).toEqual([
      'Briefing and initial record',
      'Update-responsive revision',
      'Artifact and debrief',
    ]);
    expect(JSON.stringify(merged[0])).not.toMatch(
      /\bdraft\b|\bevidence evidence\b|\bWeek 1 assignment\b|\bMaritime Crisis focus\b/i,
    );
    expect(merged[0].description).toMatch(/^This experiential activity combines/i);
    expect(merged[0].supportResources[0]).toBe('Activity briefing, synchronized update, and supplied evidence');
  });

  it('normalizes and removes redundant activity materials without losing distinct resources', () => {
    const materials = buildExperientialActivityMaterials({
      activity: ACTIVITY_CASES[0].activity,
      readings: [
        'The Maritime Crisis focus activity directions',
        'The Maritime Crisis focus activity directions, reference note, and feedback guide',
        'Maritime Crisis source packet',
      ],
    });

    expect(materials).toContain('Maritime Crisis activity directions, reference note, and feedback guide');
    expect(materials).toContain('Maritime Crisis source packet');
    expect(materials).not.toContain('Maritime Crisis activity directions');
    expect(materials.join(' ')).not.toMatch(/\bThe Maritime Crisis focus activity\b/);
  });

  it('detects only explicitly requested activity lessons', () => {
    ACTIVITY_CASES.forEach(({ lesson }) => expect(requestsExperientialActivity(lesson)).toBe(true));
    expect(
      requestsExperientialActivity({
        lessonId: 'lesson-biology-lab',
        title: 'Cell Transport Lab',
        objectives: ['Measure osmosis across a semipermeable membrane.'],
      }),
    ).toBe(true);
    expect(
      requestsExperientialActivity({
        lessonId: 'lesson-chemistry-laboratory',
        title: 'Acid-Base Titration Laboratory',
        objectives: ['Estimate an unknown concentration from a titration curve.'],
      }),
    ).toBe(true);
    expect(
      requestsExperientialActivity({
        lessonId: 'lesson-ordinary',
        title: 'Introduction to Cost Concepts',
        objectives: ['Explain fixed and variable costs.'],
        sync: ['Worked examples and discussion'],
      }),
    ).toBe(false);
    expect(experientialActivityTypeHint({ title: 'Lesson 4: Checkout Design Review' })).toBe('Checkout design review');
    expect(experientialActivityTypeHint({ title: 'Lesson 5: Policy Mock Hearing' })).toBe('Policy mock hearing');
  });

  it('rejects placeholders, ungrounded evidence, incomplete roles, and mistimed phases', () => {
    const fixture = ACTIVITY_CASES[2];
    const result = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        roles: [{ name: 'Role A', goal: 'Review it', constraint: 'TBD', privateInformation: '' }],
        evidence: ['Evidence item 1', 'An unrelated volcano pressure record from another course.'],
        timing: [
          { phase: 'Review', minutes: 0 },
          { phase: 'Review', minutes: 5 },
        ],
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(result.blueprint).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'roles-count',
        'placeholder-content',
        'evidence-2-grounding',
        'timing-count',
        'timing-row',
        'timing-duplicate-phase',
      ]),
    );
  });

  it('grounds a generic activity label from the exact lesson title, preserves the requested mode, and rejects drift', () => {
    const fixture = ACTIVITY_CASES[2];
    const result = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        activityType: 'Case Exercise',
        scenario:
          'Participants revise the checkout flow from observed usability evidence while working within the stated project constraint.',
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(result.blueprint).toBeNull();
    expect(result.issues).not.toContain('scenario-sentence-count');
    expect(result.issues).toContain('activity-type-mode-mismatch');
    expect(result.issues).not.toContain('activity-type-generic');
    expect(result.issues).not.toContain('activity-type-grounding');

    const normalizedShortScenario = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        scenario:
          'Participants revise the checkout flow from observed usability evidence within the project constraint.',
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(normalizedShortScenario.issues).toEqual([]);
    expect(normalizedShortScenario.blueprint.scenario).toContain(
      'Explain the current checkout flow and select a feasible revision direction',
    );
    expect(normalizedShortScenario.blueprint.scenario).not.toContain(
      'Engineering can change validation copy and confirmation hierarchy',
    );

    const drifted = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        activityType: 'Case Exercise',
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(drifted.blueprint).toBeNull();
    expect(drifted.issues).toContain('activity-type-mode-mismatch');

    const grounded = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        activityType: 'Studio Critique',
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(grounded.issues).toEqual([]);
    expect(grounded.blueprint.activityType.toLowerCase()).toContain('checkout flow');
    expect(grounded.blueprint.activityType).toContain('Studio Critique');

    const simulationFixture = ACTIVITY_CASES[0];
    const wrongSimulationForm = normalizeExperientialActivityBlueprint(
      {
        ...simulationFixture.activity,
        activityType: 'Maritime crisis bargaining case exercise',
      },
      {
        expectedLessonIds: [simulationFixture.lesson.lessonId],
        promptLesson: simulationFixture.lesson,
        facts: simulationFixture.activity.evidence,
      },
    );
    expect(wrongSimulationForm.blueprint).toBeNull();
    expect(wrongSimulationForm.issues).toContain('activity-type-mode-mismatch');

    const groundedSimulationSubject = normalizeExperientialActivityBlueprint(
      {
        ...simulationFixture.activity,
        activityType: 'Simulation and decision-making',
      },
      {
        expectedLessonIds: [simulationFixture.lesson.lessonId],
        promptLesson: simulationFixture.lesson,
        facts: simulationFixture.activity.evidence,
      },
    );
    expect(groundedSimulationSubject.issues).toEqual([]);
    expect(groundedSimulationSubject.blueprint.activityType.toLowerCase()).toContain('maritime security');
    expect(groundedSimulationSubject.blueprint.activityType).toContain('Simulation and decision-making');

    const duplicateForm = normalizeExperientialActivityBlueprint(
      {
        ...simulationFixture.activity,
        activityType: 'Maritime monitoring simulation simulation',
      },
      {
        expectedLessonIds: [simulationFixture.lesson.lessonId],
        promptLesson: simulationFixture.lesson,
        facts: simulationFixture.activity.evidence,
      },
    );
    expect(duplicateForm.issues).toEqual([]);
    expect(duplicateForm.blueprint.activityType).toBe('Maritime monitoring simulation');
  });

  it('rejects update leakage and generic artifacts, while repairing legacy packets at projection time', () => {
    const fixture = ACTIVITY_CASES[0];
    const leakedUpdate = fixture.activity.updates[0];
    const invalid = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        scenario: `${fixture.activity.scenario} ${leakedUpdate.information} ${leakedUpdate.requiredDecision}`,
        artifact: {
          title: 'Role Assignment',
          requirements: fixture.activity.artifact.requirements,
        },
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );

    expect(invalid.blueprint).toBeNull();
    expect(invalid.issues).toEqual(expect.arrayContaining(['update-1-leaked-in-scenario', 'artifact-title-generic']));

    const vagueArtifact = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        artifact: {
          title: 'Evidence Analysis Requirements',
          requirements: fixture.activity.artifact.requirements,
        },
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(vagueArtifact.blueprint).toBeNull();
    expect(vagueArtifact.issues).toContain('artifact-title-generic');

    const genericForeshadow = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        scenario:
          'Two coastal delegations dispute responsibility for a patrol collision while a civilian convoy approaches the same corridor. Participants must revise their response after synchronized evidence updates change the credible risks.',
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(genericForeshadow.blueprint).toBeNull();
    expect(genericForeshadow.issues).toContain('scenario-foreshadows-update');

    const repaired = buildExperientialActivityPacket({
      activity: {
        ...fixture.activity,
        scenario: `${leakedUpdate.information} ${leakedUpdate.requiredDecision}`,
        artifact: {
          title: 'Role Assignment',
          requirements: fixture.activity.artifact.requirements,
        },
      },
      sessionMinutes: fixture.minutes,
    });
    expect(repaired.scenario).toMatch(/initial decision.*later update is released/i);
    expect(repaired.scenario).not.toContain(leakedUpdate.information);
    expect(repaired.artifact.title).toMatch(/decision record/i);
    expect(repaired.artifact.requirements).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/supplied evidence.*role constraint/i),
        expect.stringMatching(/synchronized update/i),
        expect.stringMatching(/unresolved uncertainty/i),
      ]),
    );

    const repeatedDecision = `${leakedUpdate.information} The response must incorporate the confirmed radar outage.`;
    const repeatedInvalid = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        updates: [
          {
            ...leakedUpdate,
            requiredDecision: repeatedDecision,
          },
        ],
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(repeatedInvalid.blueprint).toBeNull();
    expect(repeatedInvalid.issues).toContain('update-1-decision-repeats-information');

    const repeatedRepaired = buildExperientialActivityPacket({
      activity: {
        ...fixture.activity,
        updates: [
          {
            ...leakedUpdate,
            requiredDecision: repeatedDecision,
          },
        ],
      },
      sessionMinutes: fixture.minutes,
    });
    expect(repeatedRepaired.phases[0].requiredDecision).toMatch(
      /changes or confirms Monitored corridor protocol.*remaining uncertainty/i,
    );
    expect(repeatedRepaired.phases[0].requiredDecision).not.toContain(repeatedDecision);
  });

  it('rejects copied activity-template instructions while accepting an exact short evidence label', () => {
    const fixture = ACTIVITY_CASES[0];
    const grounded = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        evidence: [...fixture.activity.evidence, 'Decision log'],
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: {
          ...fixture.lesson,
          readings: 'Collision record; civilian convoy log; decision log',
        },
        facts: fixture.activity.evidence,
      },
    );
    expect(grounded.issues).toEqual([]);

    const copiedTemplate = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        updates: [
          {
            title: 'Evidence update phase',
            information: 'The new information, task condition, critique input, or observation released in this phase.',
            requiredDecision: 'The concrete decision, action, revision, or interpretation participants must record.',
          },
        ],
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(copiedTemplate.blueprint).toBeNull();
    expect(copiedTemplate.issues).toContain('placeholder-content');

    const concretePacketReference = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        scenario: `${fixture.activity.scenario} The inspectable evidence packet contains the collision record and civilian convoy log.`,
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(concretePacketReference.issues).toEqual([]);
  });

  it('carries only the exact qualifying activity clause from a multi-lesson source brief', () => {
    const lesson = {
      title: 'Lesson 4: Maritime Crisis Simulation',
      topics: 'crisis bargaining and monitored passage',
      objectives: 'Revise a negotiated response after synchronized evidence updates.',
      syncActivities: 'Run a maritime crisis simulation.',
    };
    const sourceBrief =
      'International Crisis Bargaining, a 5-lesson undergraduate course; signaling and commitment; monitoring mandates; a 75-minute maritime crisis simulation in which participant roles inspect a fictional patrol log and civilian convoy notice, receive synchronized updates, revise a negotiated response, submit a decision log, and debrief; final strategy comparison.';

    expect(selectExperientialActivityBrief(sourceBrief, lesson)).toBe(
      'a 75-minute maritime crisis simulation in which participant roles inspect a fictional patrol log and civilian convoy notice, receive synchronized updates, revise a negotiated response, submit a decision log, and debrief',
    );
    expect(
      selectExperientialActivityBrief(sourceBrief, {
        ...lesson,
        title: 'Monitoring mandates',
        topics: 'monitoring evidence',
        syncActivities: 'Compare two monitoring records.',
      }),
    ).toBe('');
  });

  it('recovers an explicitly numbered source activity when the course map shortens its form', () => {
    const sourceBrief =
      'Create a 3-lesson UX research course. Lesson 1 teaches usability evidence and observation quality. Lesson 2 must be a structured studio critique of a mobile onboarding prototype using usability observations, working roles with constraints, an inspectable evidence packet, a synchronized update, a revision artifact, and a debrief. Lesson 3 teaches test planning.';
    const shortenedCourseMapLesson = {
      title: 'Lesson 2: Mobile Prototype Critique',
      topics: 'role-based observation; constraint analysis; evidence packet synchronization',
      objectives: 'Revise the mobile onboarding prototype from inspectable usability evidence.',
      syncActivities: 'Use studio feedback to revise the prototype.',
    };

    expect(selectExperientialActivityBrief(sourceBrief, shortenedCourseMapLesson)).toBe(
      'Lesson 2 must be a structured studio critique of a mobile onboarding prototype using usability observations, working roles with constraints, an inspectable evidence packet, a synchronized update, a revision artifact, and a debrief',
    );
    expect(
      selectExperientialActivityBrief(sourceBrief, {
        ...shortenedCourseMapLesson,
        title: 'Lesson 1: Usability Evidence Quality',
        topics: 'usability evidence and observation quality',
      }),
    ).toBe('');
  });

  it('does not grade an ordinary lesson from a later activity mentioned in course context', () => {
    expect(
      buildExperientialActivityFindings({
        files: [
          {
            featureId: 'lessonPlans',
            lessonNumber: 1,
            path: 'Lesson Plans/Lesson 01 - Usability Evidence Quality.txt',
            text: [
              'Course context: Lesson 2 must be a structured studio critique with participant or working roles.',
              'Lesson 1: Usability Evidence Quality',
              'Students compare two observations and justify which one supports the stronger design claim.',
            ].join('\n'),
          },
        ],
        titleForFile: () => 'Lesson 1: Usability Evidence Quality',
      }),
    ).toEqual([]);
  });

  it('rejects coercible timing strings and overfilled compact arrays instead of silently narrowing them', () => {
    const fixture = ACTIVITY_CASES[1];
    const result = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        evidence: [
          ...fixture.activity.evidence,
          ...Array.from({ length: 5 }, (_, index) => `Extra RC measurement ${index}`),
        ],
        timing: fixture.activity.timing.map((row) => ({ ...row, minutes: String(row.minutes) })),
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(result.blueprint).toBeNull();
    expect(result.issues).toEqual(expect.arrayContaining(['evidence-count', 'timing-row']));
  });

  it('rejects duplicate mechanics instead of silently deduplicating an apparently complete activity', () => {
    const fixture = ACTIVITY_CASES[4];
    const result = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        roles: [...fixture.activity.roles, { ...fixture.activity.roles[0] }],
        evidence: [...fixture.activity.evidence, fixture.activity.evidence[0]],
        updates: [...fixture.activity.updates, { ...fixture.activity.updates[0] }],
        artifact: {
          ...fixture.activity.artifact,
          requirements: [...fixture.activity.artifact.requirements, fixture.activity.artifact.requirements[0]],
        },
        debriefPrompts: [...fixture.activity.debriefPrompts, fixture.activity.debriefPrompts[0]],
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );
    expect(result.blueprint).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'roles-duplicate-name',
        'evidence-duplicate',
        'updates-duplicate-title',
        'artifact-requirements-duplicate',
        'debrief-duplicate',
      ]),
    );
  });

  it('retains every update exactly once when one canonical clock has fewer active phases', () => {
    const fixture = ACTIVITY_CASES[0];
    const updates = [
      fixture.activity.updates[0],
      {
        title: 'Convoy window narrows',
        information: 'The civilian convoy reports that the remaining safe passage window is now shorter.',
        requiredDecision: 'Record whether the proposed corridor timing remains feasible under the shorter window.',
      },
      {
        title: 'Inspection record arrives',
        information: 'A neutral inspection record confirms damage without resolving which patrol crossed first.',
        requiredDecision: 'Revise the protocol language so the damage record is used without overstating attribution.',
      },
      {
        title: 'Monitoring offer changes',
        information: 'The neutral team can monitor only one end of the corridor during the passage window.',
        requiredDecision: 'Choose the monitoring location and document the evidence-based trade-off.',
      },
    ];
    const slides = buildExperientialActivitySlideFrames({
      title: fixture.lesson.title,
      activity: { protocol: EXPERIENTIAL_ACTIVITY_PROTOCOL, ...fixture.activity, updates },
      sessionMinutes: fixture.minutes,
    });
    const text = JSON.stringify(slides);
    expect(slides).toHaveLength(fixture.activity.timing.length);
    expect(slides.reduce((sum, slide) => sum + slide.minutes, 0)).toBe(fixture.minutes);
    updates.forEach((update) => expect(text.match(new RegExp(update.title, 'g'))).toHaveLength(1));
  });

  it('normalizes arbitrary positive timing weights to the exact session length', () => {
    for (const target of [50, 60, 75, 90, 120]) {
      const timing = normalizeExperientialActivityTiming(
        [
          { phase: 'Open', minutes: 3 },
          { phase: 'Work', minutes: 7 },
          { phase: 'Update', minutes: 5 },
          { phase: 'Close', minutes: 2 },
        ],
        target,
      );
      expect(timing.reduce((sum, row) => sum + row.minutes, 0)).toBe(target);
      expect(timing.every((row) => row.minutes >= 1)).toBe(true);
    }
  });

  it('adds a strict top-level activity array only for the qualifying lesson ids', () => {
    const activitySchema = compactActivityBlueprintJsonSchema(['lesson-ux']);
    expect(activitySchema).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(activitySchema.items.properties.lessonId.enum).toEqual(['lesson-ux']);
    expect(activitySchema.items.properties.ty.minLength).toBe(16);
    expect(activitySchema.items.properties.ro).toMatchObject({ minItems: 2, maxItems: 2 });
    expect(activitySchema.items.properties.ev).toMatchObject({ minItems: 2, maxItems: 2 });
    expect(activitySchema.items.properties.up).toMatchObject({ minItems: 1, maxItems: 1 });
    expect(activitySchema.items.properties.up.items.properties.rd.enum).toEqual([
      'Update the artifact, cite the new evidence, and record one changed decision or conclusion.',
    ]);
    expect(activitySchema.items.properties.ar.properties.rq).toMatchObject({ minItems: 3, maxItems: 3 });
    const artifactTitleSchema = activitySchema.items.properties.ar.properties.ti;
    expect(artifactTitleSchema.enum).toEqual(
      expect.arrayContaining(['decision record', 'protocol', 'analysis sheet', 'revision board']),
    );
    expect(artifactTitleSchema.enum).not.toContain('Evidence Analysis Requirements');
    expect(activitySchema.items.properties.tm).toMatchObject({ minItems: 4, maxItems: 4 });
    expect(activitySchema.items.properties.tm.items.required).toEqual(['ph', 'mn']);
    expect(activitySchema.items.properties.db).toMatchObject({ minItems: 2, maxItems: 2 });

    const profile = compactLessonKernelSchemaProfile({
      expectedLessonIds: ['lesson-ordinary', 'lesson-ux'],
      activityLessonIds: ['lesson-ux'],
      factCount: 5,
    });
    expect(profile.schema.required).toContain('activityBlueprints');
    expect(Object.keys(profile.schema.properties)[0]).toBe('activityBlueprints');
    expect(profile.schema.required[0]).toBe('activityBlueprints');
    expect(profile.schema.properties.activityBlueprints.items.properties.lessonId.enum).toEqual(['lesson-ux']);
  });

  it('grounds a constrained artifact product in the requested lesson subject', () => {
    const fixture = ACTIVITY_CASES[0];
    const result = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        artifact: {
          ...fixture.activity.artifact,
          title: 'decision record',
        },
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );

    expect(result.issues).toEqual([]);
    expect(result.blueprint.artifact.title).toBe('Maritime Security Negotiation decision record');
  });

  it('grounds a constrained update action in the visible artifact title', () => {
    const fixture = ACTIVITY_CASES[0];
    const result = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        updates: [
          {
            ...fixture.activity.updates[0],
            requiredDecision:
              'Update the artifact, cite the new evidence, and record one changed decision or conclusion.',
          },
        ],
        artifact: {
          ...fixture.activity.artifact,
          title: 'decision record',
        },
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );

    expect(result.issues).toEqual([]);
    expect(result.blueprint.updates[0].requiredDecision).toBe(
      'Update the Maritime Security Negotiation decision record, cite the new evidence, and record one changed decision or conclusion.',
    );
  });

  it('turns compact debrief directives into visible questions', () => {
    const fixture = ACTIVITY_CASES[0];
    const result = normalizeExperientialActivityBlueprint(
      {
        ...fixture.activity,
        debriefPrompts: ['Compare patrol log and convoy notice', 'Analyze signaling under uncertainty'],
      },
      {
        expectedLessonIds: [fixture.lesson.lessonId],
        promptLesson: fixture.lesson,
        facts: fixture.activity.evidence,
      },
    );

    expect(result.issues).toEqual([]);
    expect(result.blueprint.debriefPrompts).toEqual([
      'How did comparing patrol log and convoy notice change the final decision?',
      'What did the analysis of signaling under uncertainty reveal, and what remained uncertain?',
    ]);
  });

  it.each(ACTIVITY_CASES)('deep-grades complete $name surfaces and blocks a hollow substitute', (fixture) => {
    const activity = {
      protocol: EXPERIENTIAL_ACTIVITY_PROTOCOL,
      ...fixture.activity,
    };
    const outline = buildExperientialActivityOutline({ activity, sessionMinutes: fixture.minutes });
    const slides = buildExperientialActivitySlideFrames({
      title: fixture.lesson.title,
      activity,
      sessionMinutes: fixture.minutes,
    });
    expect(slides.at(-1).bullets[0]).not.toMatch(/\.\s*;/);
    const brief = buildExperientialActivityAssignmentBrief({
      lessonNumber: 1,
      relatedLessonTitle: fixture.lesson.title,
      activity,
      sessionMinutes: fixture.minutes,
    });
    const files = [
      {
        featureId: 'lessonPlans',
        lessonNumber: 1,
        path: `Lesson Plans/${fixture.name}.txt`,
        text: JSON.stringify(outline),
      },
      {
        featureId: 'slideDecks',
        lessonNumber: 1,
        path: `Slide Decks/${fixture.name}.txt`,
        text: JSON.stringify(slides),
      },
      {
        featureId: 'assignments',
        lessonNumber: 1,
        path: `Assignment Briefs/${fixture.name}.txt`,
        text: JSON.stringify(brief),
      },
    ];
    expect(
      buildExperientialActivityFindings({
        files,
        titleForFile: () => fixture.lesson.title,
      }),
    ).toEqual([]);

    const hollow = buildExperientialActivityFindings({
      files: [
        {
          featureId: 'lessonPlans',
          lessonNumber: 1,
          path: 'Lesson Plans/hollow.txt',
          text: 'Students discuss the topic and write a reflection.',
        },
      ],
      titleForFile: () => fixture.lesson.title,
    });
    expect(hollow).toEqual([
      expect.objectContaining({
        severity: 'P1',
        detail: expect.stringContaining('experiential activity lessonPlans is missing'),
      }),
    ]);
  });
});
