// Deterministic mock author — E0's zero-token voice. It derives every
// sentence from the graph slice (kernel facts, correctives, outcomes), so a
// rendered mock package is course-specific and machine-verifiable, while
// costing nothing. It is NOT a quality claim: E0 proves the ruler fits the
// lattice; live authoring is what the quality experiments measure.

function pick(list, index) {
  return list[index % list.length];
}

function conceptSentences(concept) {
  return concept.kernelFacts.length > 0
    ? concept.kernelFacts
    : [`${concept.name} (declared gap: kernel facts pending).`];
}

export function mockAuthorLesson(slice) {
  const { lesson, concepts, outcomes, sources, neighbors, constraints } = slice;
  const primary = concepts[0] ?? { name: lesson.title, kernelFacts: [], misconceptions: [] };
  const allMisconceptions = concepts.flatMap((concept) =>
    concept.misconceptions.map((m) => ({ ...m, conceptName: concept.name })),
  );
  const reading = sources[0] ?? null;
  const claims = [];

  // Plan — four segments, reteach mandatory.
  const segments = [
    {
      minutes: 10,
      mode: 'teach',
      text:
        `Open with the week's core idea: ${conceptSentences(primary)[0]} ` +
        `Connect it to ${outcomes[0] ? `the outcome "${outcomes[0].statement}"` : 'the course arc'} and name where students will use it this week.`,
    },
    {
      minutes: 15,
      mode: 'worked-example',
      text:
        `Work one example end to end on ${primary.name}: ${pick(conceptSentences(primary), 1)} ` +
        `Narrate each decision aloud and ask students to predict the next step before you take it.`,
    },
    {
      minutes: 15,
      mode: 'activity',
      text:
        `Pairs apply ${concepts
          .map((c) => c.name)
          .join(' and ')} to a fresh case, then defend their choice to a neighboring pair. ` +
        `${allMisconceptions[0] ? `Listen for the error "${allMisconceptions[0].statement}" and surface it for the whole room.` : 'Collect one open question per pair for the closing discussion.'}`,
    },
    {
      minutes: 10,
      mode: 'reteach',
      text:
        `For students who arrived without the reading${reading ? ` (${reading.title})` : ''}: re-teach ${primary.name} from zero with a live demonstration — ` +
        `${pick(conceptSentences(primary), 0)} Close by checking one retrieval question before the exit.`,
    },
  ];
  claims.push({ path: 'plan.segments[0].text', ref: `kernel:${primary.id ?? primary.name}` });

  // Slides — title, one to two per concept, misconception slide, bridge.
  const slides = [
    {
      title: `${lesson.title}`,
      bullets: [
        `Week ${lesson.week}: ${lesson.title}`,
        ...(outcomes[0] ? [`Outcome: ${outcomes[0].statement}`] : []),
        ...(reading ? [`Reading: ${reading.title}`] : []),
      ].slice(0, 5),
      speakerNotes: `Frame the week: why ${primary.name} matters and what students will be able to do by the exit ticket.`,
      altText: `Title slide for ${lesson.title}, week ${lesson.week}.`,
    },
  ];
  for (const [ci, concept] of concepts.entries()) {
    const facts = conceptSentences(concept);
    slides.push({
      title: concept.name,
      bullets: facts.slice(0, 4),
      speakerNotes: `Teach ${concept.name} through the anchored facts; pause after "${facts[0]}" and ask for a one-sentence restatement.`,
      altText: `Definition slide for ${concept.name} with ${Math.min(facts.length, 4)} anchored points.`,
    });
    if (facts.length > 1 || ci === 0) {
      slides.push({
        title: `${concept.name} in practice`,
        bullets: [pick(facts, 1), `Apply it: where does this show up in ${slice.course.subject}?`],
        speakerNotes: `Move ${concept.name} from definition to use; one worked case, one student-generated case.`,
        altText: `Application slide for ${concept.name}.`,
      });
    }
  }
  for (const m of allMisconceptions.slice(0, 1)) {
    slides.push({
      title: `Common error: ${m.conceptName}`,
      bullets: [`The trap: ${m.statement}`, `The repair: ${m.corrective}`].map((line) => line.slice(0, 240)),
      speakerNotes: `Name the misconception explicitly and let students argue against it before you do.`,
      altText: `Misconception-and-repair slide for ${m.conceptName}.`,
    });
    claims.push({ path: `slides[${slides.length - 1}].bullets[1]`, ref: `misconception:${m.id}` });
  }
  slides.push({
    title: neighbors.nextTitle ? `Bridge: next week` : 'Course synthesis',
    bullets: [
      neighbors.nextTitle
        ? `Next: ${neighbors.nextTitle} — carry ${primary.name} with you.`
        : `Synthesis: connect ${primary.name} back to week 1.`,
    ],
    speakerNotes: neighbors.nextTitle
      ? `Preview how ${neighbors.nextTitle} builds on this week's ${primary.name}.`
      : 'Close the arc; students name one concept they would re-teach a peer.',
    altText: 'Bridge slide connecting this lesson to the next.',
  });

  // Quiz items — one per concept cycle up to the constraint, distractors from
  // documented misconceptions, correctIndex rotated (the exam-rotation lesson),
  // explanations that CONFRONT the corrective (J3's requirement).
  const quizItems = [];
  const target = Math.max(constraints.quizItems ?? 6, 3);
  for (let i = 0; i < target; i += 1) {
    const concept = pick(concepts, i);
    const facts = conceptSentences(concept);
    const fact = pick(facts, i);
    const m = concept.misconceptions[0] ?? null;
    const correct = fact;
    const distractors = [
      m ? m.statement : `${concept.name} applies only when a textbook explicitly says so.`,
      `${concept.name} is a matter of style with no observable consequence.`,
      `The opposite: ${fact.split(' ').slice(0, 6).join(' ')} … is reversed in practice.`,
    ];
    const correctIndex = i % 4;
    const options = [...distractors];
    options.splice(correctIndex, 0, correct);
    quizItems.push({
      stem:
        i % 2 === 0
          ? `A study in this week's case work hinges on ${concept.name.toLowerCase()}. Which statement should guide the team's decision?`
          : `Which of the following correctly characterizes ${concept.name.toLowerCase()} as used in ${slice.course.subject}?`,
      options: options.slice(0, 4).map((o) => o.slice(0, 300)),
      correctIndex: Math.min(correctIndex, 3),
      explanation: m
        ? `${m.corrective} That is why "${correct.slice(0, 80)}…" is the defensible choice here.`
        : `${correct} The other options either reverse the relationship or reduce it to style.`,
      bloom: pick(['understand', 'apply', 'analyze'], i),
      difficulty: pick(['apply', 'transfer', 'recall'], i),
    });
    if (m) claims.push({ path: `quizItems[${i}].explanation`, ref: `misconception:${m.id}` });
    claims.push({
      path: `quizItems[${i}].options[${Math.min(correctIndex, 3)}]`,
      ref: `kernel:${concept.id ?? concept.name}`,
    });
  }

  // Study guide — summary, key terms with kernel definitions, self-check.
  const studyGuideSection = [
    `## Week ${lesson.week}: ${lesson.title}`,
    '',
    `This week centers on ${concepts.map((c) => c.name.toLowerCase()).join(', ')}. ${conceptSentences(primary)[0]}`,
    '',
    '### Key terms',
    ...concepts.map((c) => `- **${c.name}** — ${conceptSentences(c)[0]}`),
    '',
    '### Watch for',
    ...(allMisconceptions.length > 0
      ? allMisconceptions.map((m) => `- ${m.statement} → ${m.corrective}`)
      : ['- Bring one confusion to class; unresolved questions compound weekly.']),
    '',
    '### If you missed the reading',
    `Start here: ${conceptSentences(primary)[0]} Read the key terms above, then attempt the first self-check; the in-class reteach segment will walk a worked example.`,
    '',
    '### Check yourself',
    `- Restate ${primary.name.toLowerCase()} in one sentence without looking.`,
    ...(outcomes[0]
      ? [`- Can you ${outcomes[0].statement.charAt(0).toLowerCase()}${outcomes[0].statement.slice(1)}?`]
      : []),
  ].join('\n');

  const tension = allMisconceptions[0]
    ? `Intuition says "${allMisconceptions[0].statement}" — the evidence says otherwise.`
    : `Where does ${primary.name.toLowerCase()} break down at the edges of ${slice.course.subject}?`;

  const discussion = {
    prompt:
      `${tension} Take a position and defend it with one concrete example from this week's material` +
      `${reading ? ` or from ${reading.title}` : ''}. Then find one classmate whose example complicates yours.`,
    tension,
    followUps: [
      `What observable evidence would change your position on ${primary.name.toLowerCase()}?`,
      allMisconceptions[0]
        ? `Steelman the error first: why is "${allMisconceptions[0].statement}" so tempting?`
        : `Where in professional practice does ${primary.name.toLowerCase()} carry real stakes?`,
      `Connect this to ${neighbors.prevTitle ?? 'the course question'}: what changed in your understanding?`,
    ].slice(0, Math.max(constraints.discussionFollowUps ?? 3, 2)),
  };

  // Assignment genre rotates by lesson number — a deterministic voice must
  // still clear J7's sameness gate, so the frames themselves vary, not just
  // the nouns inside them.
  const conceptList = concepts.map((c) => c.name.toLowerCase()).join(' and ');
  const errorNote = allMisconceptions[0] ? allMisconceptions[0].statement.toLowerCase() : 'an unexamined assumption';
  const citeLine = reading ? `cite ${reading.title} once` : 'cite the week’s material once';
  const genres = [
    {
      task: `Diagnose a flawed study: below-average work on ${conceptList} usually fails at one specific joint. Find a published or invented study summary, locate where ${errorNote} enters it, and write a one-page diagnostic memo that names the failure and prescribes the fix.`,
      steps: [
        `Summarize the flawed study in three sentences (its claim, its method, its conclusion).`,
        `Locate the exact step where the error enters; quote or paraphrase that step.`,
        `Prescribe the repair and ${citeLine}.`,
        `End with the strongest defense the original authors could offer — and why it fails.`,
      ],
    },
    {
      task: `Build something small with ${conceptList}: design a miniature study, instrument, or protocol (one page) in which ${primary.name.toLowerCase()} does real work. The design must be concrete enough that a classmate could execute it next week.`,
      steps: [
        `State the goal of your design in one sentence a non-specialist could read.`,
        `Specify the design decisions where ${primary.name.toLowerCase()} constrained your choices; ${citeLine}.`,
        `Pre-register the failure mode: how would your design go wrong if ${errorNote}?`,
        `List the materials or data your classmate would need to run it.`,
      ],
    },
    {
      task: `Apply ${conceptList} to a case of your choosing from ${slice.course.subject}: state the case in two sentences, work the analysis, and flag the one step where the documented error (${errorNote}) would be easiest to commit.`,
      steps: [
        `Choose a concrete case and describe it in ≤2 sentences.`,
        `Work the analysis using ${primary.name.toLowerCase()}; ${citeLine}.`,
        `Identify where the common error could enter, and show how you avoided it.`,
        `Close with one open question your analysis cannot yet answer.`,
      ],
    },
    {
      task: `Write a referee report: a peer (real or constructed) has applied ${conceptList} and gotten it subtly wrong. Review their work the way a journal reviewer would — verdict first, then the two most consequential objections, each grounded in this week's material.`,
      steps: [
        `Open with your verdict in one sentence (accept / revise / reject and why).`,
        `Raise objection one: where the work conflicts with ${primary.name.toLowerCase()}; ${citeLine}.`,
        `Raise objection two: check specifically for ${errorNote}.`,
        `Recommend the single revision that would change your verdict.`,
      ],
    },
  ];
  const genre = genres[lesson.number % genres.length];
  const assignment = {
    task: genre.task,
    steps: genre.steps.slice(0, Math.max(constraints.assignmentSteps ?? 4, 3)),
    rubricBands: [
      {
        band: 'Exemplary',
        observableBehavior: `Applies the definition of ${primary.name.toLowerCase()} to the chosen case with a correct worked example and explicitly rules out the documented error.`,
      },
      {
        band: 'Proficient',
        observableBehavior: `Applies ${primary.name.toLowerCase()} correctly but the error check is asserted rather than shown.`,
      },
      {
        band: 'Developing',
        observableBehavior: allMisconceptions[0]
          ? `The work exhibits the documented misconception: ${allMisconceptions[0].statement.toLowerCase()}`
          : `Restates the definition without applying it to the case.`,
      },
    ],
  };

  const faqEntries = [
    allMisconceptions[0]
      ? {
          q: `Isn't it true that ${allMisconceptions[0].statement.charAt(0).toLowerCase()}${allMisconceptions[0].statement.slice(1, -1)}?`,
          a: allMisconceptions[0].corrective,
        }
      : {
          q: `How much time should week ${lesson.week} take outside class?`,
          a: `Plan on the reading plus the assignment: roughly 4–5 hours. Front-load the reading — the in-class activity assumes it.`,
        },
    {
      q: `What is the graded work for week ${lesson.week}?`,
      a:
        slice.assessments.length > 0
          ? `${slice.assessments.map((a) => `${a.registryKey} (${a.weightPct}% of the course grade)`).join('; ')}. See the syllabus grading table for the full registry.`
          : `No graded artifact this week; the assignment feeds the next graded checkpoint.`,
    },
  ];

  // Contract: every bullet is a complete statement with terminal punctuation.
  const punctuated = slides.map((slide) => ({
    ...slide,
    bullets: slide.bullets.map((b) => (/[.!?:;。！？：；…][\s"'”’」』）)\]]*$/u.test(b.trim()) ? b : `${b}.`)),
  }));
  return {
    plan: { segments },
    slides: punctuated,
    quizItems,
    studyGuideSection,
    discussion,
    assignment,
    faqEntries,
    claims,
  };
}

export function mockAuthorCourseWide(graph) {
  const conceptNames = graph.concepts.slice(0, 6).map((c) => c.name.toLowerCase());
  return {
    courseDescription:
      `${graph.course.title} is an ${graph.course.level}-level course in ${graph.course.subject} built around doing, not memorizing: ` +
      `over ${graph.course.weeks} weeks students move from ${conceptNames[0] ?? 'first principles'} to ${
        conceptNames[conceptNames.length - 1] ?? 'independent work'
      }, with every claim tied to evidence a beginner can check. ` +
      `The through-line is judgment: each week names the error practitioners actually make (${
        graph.misconceptions[0]?.statement.toLowerCase() ?? 'the unexamined assumption'
      }) and trains the repair until it is a habit. Graded work is announced in the registry below — no surprise assessments, ever.`,
    policies:
      `Accommodations: students with testing accommodations arrange them for the midterm and final in week 1 — both exams honor extended-time and separate-room arrangements; contact the instructor before the first graded item. ` +
      `Late work: one 48-hour extension per term, no questions asked; after that, 10% per day. ` +
      `Integrity and AI use: analysis you submit must be your own; where AI tools are permitted for drafting, disclose the use in one line. Undisclosed AI-generated submissions are treated as plagiarism. ` +
      `Attendance: the in-class activities are the course; two absences are absorbed by design, further absences need a conversation, not an excuse.`,
    materials: [
      ...new Set(graph.sources.filter((s) => s.trust === 'verified').map((s) => `${s.title} — free, ${s.url}`)),
      'A notebook or document for the weekly case log (any format).',
    ],
    faqIntro: `Answers below come from the questions students actually ask in ${graph.course.subject} — logistics first, then the conceptual traps, week by week.`,
    logisticsFaq: [
      {
        q: 'How is my grade calculated?',
        a: `${graph.assessments.map((a) => `${a.registryKey} — ${a.weightPct}%`).join('; ')}. Weights total 100%; nothing is graded that is not in this registry.`,
      },
      {
        q: 'When are the exams and what do they look like?',
        a:
          graph.assessments
            .filter((a) => a.kindOf === 'exam')
            .map(
              (a) =>
                `${a.registryKey} in week ${a.anchor.week}: apply/transfer items with an answer key and accommodations honored`,
            )
            .join('. ') || 'No exams; the registry carries the graded work.',
      },
      {
        q: 'What happens if I submit late?',
        a: 'One 48-hour extension per term, no questions asked; after that, 10% per day. Ask before the deadline, not after.',
      },
      {
        q: 'How much time should this course take each week?',
        a: `Plan for the reading plus the assignment: roughly 4–6 hours outside the ${graph.course.sessionsPerWeek} weekly session(s).`,
      },
    ],
  };
}

export function mockAuthorExamItems(graph, exam, concepts) {
  const target = Math.min(Math.max(concepts.length, 6), 12);
  return Array.from({ length: target }, (_, i) => {
    const concept = concepts[i % concepts.length];
    const fact = concept.kernelFacts[0] ?? `${concept.name} has consequences a novel case makes visible.`;
    const m = concept.misconceptions[0] ?? null;
    const correctIndex = i % 4;
    const options = [
      m ? m.statement : `${concept.name} only matters when an instructor says so.`,
      `${concept.name} reverses its meaning in exam conditions.`,
      `A novel case never changes how ${concept.name.toLowerCase()} applies.`,
    ];
    options.splice(correctIndex, 0, fact);
    return {
      stem: `A situation you have not seen in class hinges on ${concept.name.toLowerCase()}: given a fresh case, which reasoning holds?`,
      options: options.slice(0, 4),
      correctIndex: Math.min(correctIndex, 3),
      explanation: m
        ? `${m.corrective} Applied to this new case, that is why the keyed option follows.`
        : `${fact} The distractors either reverse it or make it authority-dependent.`,
      bloom: i % 2 === 0 ? 'apply' : 'analyze',
      difficulty: i % 2 === 0 ? 'apply' : 'transfer',
      conceptId: concept.id,
    };
  });
}
