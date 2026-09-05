const QUIZ_ANSWER_LETTERS = ['A', 'B', 'C', 'D'];
const CJK_PINYIN_PAIR_RE =
  /([\u3400-\u4dbf\u4e00-\u9fff]{1,12})\s*[（(]([^（）()]{1,64})[）)]\s+means\s+([^.;]{1,120})/i;
const CJK_SCRIPT_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const TONE_MARKED_PINYIN_TOKEN_RE = /[a-zü]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values, limit = Number.POSITIVE_INFINITY) {
  return [...new Set(values.map(cleanText).filter(Boolean))].slice(0, limit);
}

function stripLessonPrefix(value) {
  return cleanText(value).replace(/^(?:lesson|week|module)\s+\d+\s*[:.-]?\s*/i, '');
}

export function resolveScionAdmittedLanguagePair(lesson = {}) {
  const pair = lesson?.enrichment?.targetLanguagePair;
  const pairScript = cleanText(pair?.hanzi);
  const pairRomanization = cleanText(pair?.pinyin);
  const pairMeaning = cleanText(pair?.english).replace(/[.!?]+$/, '');
  if (
    pairScript &&
    pairRomanization &&
    pairMeaning &&
    CJK_SCRIPT_RE.test(pairScript) &&
    TONE_MARKED_PINYIN_TOKEN_RE.test(pairRomanization)
  ) {
    return {
      term: `${pairScript} (${pairRomanization})`,
      scriptTerm: pairScript,
      romanization: pairRomanization,
      definition: `${pairScript} means ${pairMeaning}.`,
      example: `${pairScript} (${pairRomanization}) means ${pairMeaning}.`,
      enrichmentSource: 'admitted-language-pair',
    };
  }
  const facts = Array.isArray(lesson?.enrichment?.kernel?.facts) ? lesson.enrichment.kernel.facts : [];
  for (const fact of facts) {
    const match = cleanText(fact).match(CJK_PINYIN_PAIR_RE);
    if (!match || !TONE_MARKED_PINYIN_TOKEN_RE.test(match[2])) continue;
    const scriptTerm = cleanText(match[1]);
    const romanization = cleanText(match[2]);
    const meaning = cleanText(match[3]);
    if (!scriptTerm || !romanization || !meaning) continue;
    return {
      term: `${scriptTerm} (${romanization})`,
      scriptTerm,
      romanization,
      definition: `${scriptTerm} means ${meaning}.`,
      example: cleanText(fact),
      enrichmentSource: 'admitted-language-pair',
    };
  }
  return null;
}

export function hasVisibleScionLanguagePair(terms = []) {
  return terms.some((term) => {
    const name = cleanText(term?.term);
    return CJK_SCRIPT_RE.test(name) && TONE_MARKED_PINYIN_TOKEN_RE.test(`${name} ${cleanText(term?.romanization)}`);
  });
}

function withQuizPlan(question, plan) {
  return {
    ...question,
    quizPlan: {
      source: plan.source,
      role: plan.role,
      bloom: plan.bloom,
      difficulty: plan.difficulty,
      intendedUse: plan.use,
      questionIndex: plan.questionIndex,
      bloomSource: plan.bloomSource,
      sourceSignal: plan.sourceSignal,
      objectiveAlignmentStrategy: plan.objectiveAlignmentStrategy,
      objectiveAlignmentRationale: plan.objectiveAlignmentRationale,
    },
  };
}

function correctLetterForQuestion(lesson, index) {
  const lessonNumber = Number(lesson?.lessonNumber || 1);
  return QUIZ_ANSWER_LETTERS[(lessonNumber + index) % QUIZ_ANSWER_LETTERS.length];
}

function labelQuizOption(letter, text) {
  return `${letter}. ${cleanText(text)}`;
}

function quizQuestionId(lesson, index) {
  return `lesson-${lesson.lessonNumber}-q${index + 1}`;
}

function classifyLanguageFact(fact) {
  const text = cleanText(fact);
  if (/\b(?:tone|pitch|pronunciation|pronounced|pinyin)\b/i.test(text)) return 'pronunciation';
  if (
    /\b(?:subject|verb|object|order|negat|predicate|phrase|before|after|follows|links?|locates?|completes?|counts?)\b/i.test(
      text,
    )
  ) {
    return 'grammar';
  }
  if (/\b(?:written form|character|script)\b/i.test(text)) return 'written form';
  return 'meaning';
}

export function buildScionLanguageAssessmentFrames({ lesson, quizPlan = [], admitted, exact = false } = {}) {
  if (!exact || !admitted) return [];
  const structured = lesson?.enrichment?.targetLanguagePair || {};
  const hanzi = cleanText(structured.hanzi || admitted.scriptTerm);
  const pinyin = cleanText(structured.pinyin || admitted.romanization);
  const english = cleanText(structured.english).replace(/[.!?]+$/, '');
  const facts = (lesson?.enrichment?.kernel?.facts || []).map(cleanText).filter(Boolean);
  if (!hanzi || !pinyin || !english || facts.length < 3) return [];

  const objective = `Recognize, pronounce, interpret, and use ${hanzi} to communicate “${english}” in the beginner lesson context.`;
  const tags = (type, bloom, index = 0) =>
    unique(['quiz', type, bloom, 'target language', hanzi, ...(index < 6 ? [pinyin] : [])], 8);
  const planFor = (index, bloom, difficulty, role) => ({
    ...(quizPlan[index] || {}),
    source: 'compiler-owned-language-ledger',
    role,
    bloom,
    difficulty,
    use: role,
    questionIndex: index,
    bloomSource: 'explicit target-language task demand',
    sourceSignal:
      index < 6
        ? `${hanzi} — ${english}; use the pronunciation in the admitted lesson pair`
        : 'Use the admitted target-language pair and keep transfer within the verified lesson facts.',
    objectiveAlignmentStrategy: 'exact-form-pronunciation-meaning-match',
    objectiveAlignmentRationale:
      'The item directly assesses the admitted written form, Pinyin, meaning, and cited lesson facts.',
  });
  const mc = ({ index, bloom, difficulty, question, correct, distractors, explanation, role }) => {
    const answer = correctLetterForQuestion(lesson, index);
    const alternatives = unique(
      distractors.filter((value) => cleanText(value) && cleanText(value) !== cleanText(correct)),
      3,
    );
    while (alternatives.length < 3) alternatives.push(`Unsupported choice ${alternatives.length + 1}`);
    let distractorIndex = 0;
    return withQuizPlan(
      {
        id: quizQuestionId(lesson, index),
        type: 'multiple_choice',
        bloomsLevel: bloom,
        difficulty,
        estimatedMinutes: difficulty === 'Hard' ? 3 : 2,
        points: 2,
        objectiveAligned: objective,
        intendedUse: `Beginner-language retrieval for ${lesson.title}; verify the exact form, pronunciation, and meaning before adding new language.`,
        question,
        options: QUIZ_ANSWER_LETTERS.map((letter) =>
          labelQuizOption(letter, letter === answer ? correct : alternatives[distractorIndex++]),
        ),
        answer,
        distractorRationale:
          'The distractors deliberately swap the written form, pronunciation guide, and English meaning or claim the admitted match is absent.',
        explanation: `${answer} is correct. ${explanation}`,
        tags: tags('multiple choice', bloom, index),
        enrichmentSource: 'admitted-language-assessment',
      },
      planFor(index, bloom, difficulty, role),
    );
  };
  const response = ({ index, type = 'short_answer', bloom, difficulty, question, answer, guidance, role }) =>
    withQuizPlan(
      {
        id: quizQuestionId(lesson, index),
        type,
        bloomsLevel: bloom,
        difficulty,
        estimatedMinutes: type === 'essay' ? 12 : 5,
        points: type === 'essay' ? 10 : 4,
        objectiveAligned: objective,
        intendedUse: `Source-grounded ${role} for ${lesson.title}; accept only the admitted target-language form and facts.`,
        question,
        answer: guidance,
        sampleAnswer: answer,
        explanation:
          'Compare the response with the admitted lesson fact and the scoring guidance; do not reward unsupported Mandarin.',
        scoringGuidance: guidance,
        ...(type === 'essay'
          ? {
              rubricHints: [
                'Check the exact written form, tone-marked pronunciation, English meaning, admitted facts, and bounded use context.',
              ],
            }
          : {}),
        tags: tags(type === 'essay' ? 'essay' : 'short answer', bloom, index),
        enrichmentSource: 'admitted-language-assessment',
      },
      planFor(index, bloom, difficulty, role),
    );

  const exactTriple = `${hanzi} — ${pinyin} — ${english}`;
  const factOneCategory = classifyLanguageFact(facts[1]);
  const factTwoCategory = classifyLanguageFact(facts[2]);
  return [
    mc({
      index: 0,
      bloom: 'Remember',
      difficulty: 'Medium',
      role: 'meaning retrieval',
      question: `What does ${hanzi} (${pinyin}) mean in this lesson?`,
      correct: english,
      distractors: [hanzi, pinyin, 'The meaning is not specified in this lesson'],
      explanation: facts[0],
    }),
    mc({
      index: 1,
      bloom: 'Understand',
      difficulty: 'Medium',
      role: 'form-pronunciation-meaning match',
      question:
        'A student is preparing a three-column language card for this lesson. Which response correctly completes the written-form, tone-marked-Pinyin, and English-meaning columns?',
      correct: exactTriple,
      distractors: [
        `${pinyin} — ${hanzi} — ${english}`,
        `${hanzi} — ${english} — ${pinyin}`,
        `${english} — ${pinyin} — ${hanzi}`,
      ],
      explanation: 'The three fields remain in written-form, pronunciation, then meaning order.',
    }),
    response({
      index: 2,
      bloom: 'Apply',
      difficulty: 'Medium',
      role: 'exact language reconstruction',
      question: `Without looking back, write the exact tone-marked Pinyin and English meaning for ${hanzi}.`,
      answer: `${hanzi} is written ${pinyin} in tone-marked Pinyin and means “${english}.”`,
      guidance:
        'Full credit requires the exact written form, tone marks, and English meaning shown in the sample answer.',
    }),
    response({
      index: 3,
      bloom: 'Analyze',
      difficulty: 'Medium',
      role: 'fact-to-language analysis',
      question: `Choose the language principle—pronunciation, written form, grammar, or meaning—that best organizes this lesson detail: “${facts[1]}” Cite the exact detail as evidence, explain what it establishes about ${hanzi} (${pinyin}), and state one boundary: what the detail does not establish about other Mandarin forms.`,
      answer: `The strongest principle is ${factOneCategory}. Evidence: “${facts[1]}” This establishes the stated ${factOneCategory} relationship for ${hanzi} (${pinyin}), meaning “${english}”; it does not establish that other Mandarin forms follow the same relationship.`,
      guidance: `Full credit independently selects ${factOneCategory}, cites “${facts[1]},” explains only the supported relationship, and names the boundary on generalizing beyond this target form.`,
    }),
    response({
      index: 4,
      bloom: 'Apply',
      difficulty: 'Hard',
      role: 'spoken and written transfer',
      question: `A learner reads ${hanzi} as ${pinyin} and gives the meaning “${english}.” Identify the language principle—pronunciation, written form, grammar, or meaning—best supported by this lesson detail: “${facts[2]}” Use the exact detail as evidence, explain how it strengthens or qualifies the learner’s response, and state one limitation: what the evidence does not establish about a new context.`,
      answer: `The strongest principle is ${factTwoCategory}. Evidence: “${facts[2]}” It ${factTwoCategory === 'pronunciation' ? 'strengthens the pronunciation account' : `adds a supported ${factTwoCategory} relationship`} for ${exactTriple}; it does not establish how an unverified Mandarin form works in a new context.`,
      guidance: `Full credit independently selects ${factTwoCategory}, uses “${facts[2]}” as evidence, connects it accurately to this target form, and states the limit on transfer to an unverified form or context.`,
    }),
    response({
      index: 5,
      type: 'essay',
      bloom: 'Create',
      difficulty: 'Hard',
      role: 'beginner micro-performance',
      question: `Prepare a short beginner-language micro-performance for ${stripLessonPrefix(lesson.title)}. Present ${hanzi}, its tone-marked Pinyin, and its English meaning; use two exact lesson facts to annotate how the form works; then describe in English one situation where the expression or sentence would be appropriate. Do not add an unverified Mandarin form.`,
      answer: `${exactTriple}. ${facts[1]} ${facts[2]} An appropriate context is one in which the speaker needs to communicate “${english}”; the performance does not add any unverified Mandarin form.`,
      guidance:
        'Score for the exact written-form, pronunciation, and meaning match; accurate use of two admitted facts; a plausible English-language use context; and no unsupported Mandarin.',
    }),
    mc({
      index: 6,
      bloom: 'Evaluate',
      difficulty: 'Hard',
      role: 'evidence-bound language evaluation',
      question: `A learner writes the admitted expression, gives its verified pronunciation and meaning, then adds a new Mandarin phrase not present in the lesson. Which evaluation is most accurate?`,
      correct:
        'The admitted written form, pronunciation, and meaning are supported, but the added Mandarin phrase must be removed until a source verifies it.',
      distractors: [
        'The entire response is unsupported because a lesson can never verify pronunciation.',
        'The new phrase is acceptable whenever its English context is plausible.',
        'The written form alone proves every added Mandarin phrase is correct.',
      ],
      explanation:
        'The exact admitted triple is supported, while an additional target-language form crosses the evidence boundary.',
    }),
    response({
      index: 7,
      bloom: 'Create',
      difficulty: 'Hard',
      role: 'bounded language revision',
      question: `Revise a beginner practice card so it transfers the admitted expression to a new English-language situation without inventing Mandarin. Preserve the exact meaning “${english},” use one admitted lesson fact, and label the boundary on what the lesson has not established.`,
      answer: `Preserve the exact admitted written-form, pronunciation, and “${english}” meaning match plus one cited lesson fact. The new English-language situation may change, but the card adds no unverified Mandarin form and does not claim that another expression follows the same rule.`,
      guidance:
        'Full credit preserves the exact written-form, pronunciation, and meaning match, uses an admitted fact accurately, changes only the English-language context, and explicitly rejects unsupported transfer to another Mandarin form.',
    }),
  ];
}

export function buildScionLanguageLessonPlanProfile({
  language,
  facts = [],
  materials = [],
  hasStandaloneAssessment = false,
  hasAuthoredAssignment = false,
} = {}) {
  if (!language) return null;
  const { hanzi, pinyin, english } = language;
  const objective = `Recognize, pronounce, interpret, and use ${hanzi} (${pinyin}) as “${english}” using the exact lesson facts.`;
  const artifact = `form–sound–meaning practice card for ${hanzi} (${pinyin})`;
  return {
    objective,
    artifact,
    materials: unique(
      [
        `Instructor reference card: ${hanzi} — ${pinyin} — ${english}.`,
        `Audio or live instructor model of ${hanzi} (${pinyin}) at careful and natural speed.`,
        'Three-column written-form, pronunciation, and meaning practice card with space for self-correction.',
        ...facts.map((fact) => `Source-grounded lesson fact: ${fact}`),
        ...materials.filter((item) => /https?:|wikipedia|libretexts|license|cc by/i.test(cleanText(item))),
      ],
      8,
    ),
    studentFacingSummary: {
      beforeClass: `Review ${hanzi} (${pinyin}) and its English meaning, “${english}.”`,
      duringClass:
        'Practice the exact form–sound–meaning match with a partner, explain one admitted lesson fact, and complete a brief micro-performance without adding unsupported Mandarin.',
      afterClass: hasStandaloneAssessment
        ? `Revise the ${artifact} so the written form, tone-marked Pinyin, meaning, and lesson-fact annotation are exact.`
        : `Reproduce ${hanzi} (${pinyin}) from memory and bring one corrected example to the next lesson.`,
      submittedArtifact: artifact,
    },
    artifactLength: `One focused beginner-language artifact showing ${hanzi}, ${pinyin}, “${english},” one exact lesson-fact annotation, and one bounded use context.`,
    prerequisiteKnowledge:
      'Students should be ready to distinguish a written form, a tone-marked pronunciation guide, and an English meaning; no additional Mandarin is assumed.',
    commonMisconceptions: [
      `Treating ${pinyin} as the English meaning instead of the pronunciation guide for ${hanzi}.`,
      `Giving the meaning “${english}” without matching it to the exact written form and tone-marked Pinyin.`,
      'Adding a new Mandarin form that the lesson source has not established.',
    ],
    weeklySubmissionCriteria: `Submit the ${artifact} with the exact ${hanzi} — ${pinyin} — ${english} match, one accurate lesson-fact annotation, and one appropriate use context. Do not add unsupported Mandarin.`,
    localCaseReplacementNote: `Use a familiar beginner context for “${english}.” If the suggested situation is culturally or locally unsuitable, change only the English-language context; preserve the admitted Mandarin form, pronunciation, and meaning.`,
    assessmentCriteria: [
      `The written form is exactly ${hanzi}.`,
      `The tone-marked Pinyin is exactly ${pinyin}.`,
      `The English meaning is “${english}.”`,
      'The explanation uses only an admitted lesson fact and keeps its conclusion within that fact.',
    ],
    calibrationCue:
      'Before scoring, compare an exact three-part match with a one-field mismatch. Apply the same correction rule to written form, tone-marked Pinyin, meaning, and lesson-fact use.',
    warmUp: {
      duration: '10 minutes',
      type: 'Form–sound–meaning retrieval',
      prompt: `Without notes, write the tone-marked Pinyin and English meaning for ${hanzi}.`,
      purpose: `Activate the exact ${hanzi} — ${pinyin} — ${english} match before guided practice.`,
      facilitation:
        'Collect individual attempts, compare in pairs, then model the exact pronunciation before students revise.',
    },
    formativeCheck: {
      type: 'Formative closure check',
      prompt: `Present ${hanzi} with ${pinyin}, give the English meaning “${english},” and explain one exact lesson fact that supports the match.`,
      objectiveAligned: objective,
      instructorAction:
        'Check the written form, tone-marked Pinyin, and meaning separately. Mark the first mismatched field, model it once, let the learner self-correct, and record whether another pronunciation or meaning rehearsal is needed.',
    },
    udlNotes: {
      representation: `Present ${hanzi} visually, model ${pinyin} aloud at two speeds, and display the English meaning separately so each field can be checked.`,
      engagement:
        'Allow private rehearsal before pair work, repeat the audio model on request, and use low-stakes correction before the individual performance.',
      expression:
        'Assess pronunciation orally or by recording and assess written-form recognition on the three-column card; keep the same accuracy criteria in either mode.',
    },
    homework: {
      title: `Form–Sound–Meaning Practice Card for ${hanzi} (${pinyin})`,
      description: `Reproduce ${hanzi}, ${pinyin}, and “${english}”; annotate one exact lesson fact and rehearse the line aloud before submission.`,
      connectionToNext:
        'Bring the corrected card and pronunciation rehearsal forward. Begin the next lesson by retrieving this exact form before adding the next target expression.',
      ...(hasAuthoredAssignment ? { enrichmentSource: 'lesson-content-enrichment' } : {}),
    },
    closing: `Exit micro-performance: present ${hanzi} with ${pinyin}, give its English meaning, and state one admitted fact that helps a beginner use or interpret it accurately.`,
  };
}

export function projectScionLanguageLessonOutline(outline = [], { lesson = {}, pair = null, exact = false } = {}) {
  if (!pair || !exact) return outline;
  const structured = lesson?.enrichment?.targetLanguagePair || {};
  const hanzi = cleanText(structured.hanzi || pair.scriptTerm);
  const pinyin = cleanText(structured.pinyin || pair.romanization);
  const english = cleanText(structured.english).replace(/[.!?]+$/, '');
  const facts = (lesson?.enrichment?.kernel?.facts || []).map(cleanText).filter(Boolean);
  if (!hanzi || !pinyin || !english || facts.length < 3) return outline;
  const exactTriple = `${hanzi} — ${pinyin} — ${english}`;
  const replacements = [
    {
      activity: 'Form–sound–meaning retrieval',
      type: 'Warm-up',
      description: `Display ${hanzi} without the answer. Students recall or predict its tone-marked Pinyin and English meaning, then check the complete match: ${exactTriple}.`,
      instructorNotes: `Keep written form, pronunciation, and meaning in separate columns. Correct the match with this admitted fact: ${facts[0]}`,
      instructorRole: 'Elicit prior knowledge, model the exact pronunciation, and correct the three-part match.',
      grouping: 'Individual recall, partner check, then whole-class pronunciation',
      bloomsLevel: 'Remember',
    },
    {
      activity: 'Model the target language',
      type: 'Mini-lesson',
      description: `Model ${hanzi} (${pinyin}) aloud and in writing, then establish its English meaning: “${english}.” Students mark the feature described by the lesson facts.`,
      instructorNotes: `Teach from the exact source-grounded set: 1) ${facts[0]} 2) ${facts[1]} 3) ${facts[2]} Keep the three claims visible while students annotate the form.`,
      instructorRole: 'Model pronunciation and form, then think aloud through the admitted facts.',
      grouping: 'Instructor model with choral and individual response checks',
      bloomsLevel: 'Understand',
    },
    {
      activity: 'Guided pronunciation and form practice',
      type: 'World language',
      description: `Partner A reads or says ${hanzi} using ${pinyin}; Partner B gives the English meaning and explains the relationship stated in “${facts[1]}.” Partners switch roles and verify against the displayed model.`,
      instructorNotes: `Listen for the exact tone-marked form and require students to distinguish the written form from the pronunciation guide. Use ${facts[0]} as the correction key.`,
      instructorRole: 'Coach pronunciation, prompt self-correction, and verify form–meaning accuracy.',
      grouping: 'Pairs with two role switches and instructor check-ins',
      bloomsLevel: 'Apply',
    },
    {
      activity: 'Partner use-and-meaning check',
      type: 'World language',
      description: `Pairs prepare a compact language card showing ${exactTriple}. One student presents the target-language form; the other states an appropriate use context in English and explains what “${facts[2]}” adds to the interpretation.`,
      instructorNotes:
        'Do not reward invented Mandarin. Strong work preserves the exact form and uses the admitted facts to explain how it works.',
      instructorRole: 'Monitor accuracy, ask for one meaningful use context, and stop unsupported language additions.',
      grouping: 'Pairs exchange cards, verify, and revise once',
      bloomsLevel: 'Analyze',
    },
    {
      activity: 'Independent retrieval and transfer',
      type: 'Workshop',
      description: `Students reproduce ${hanzi}, ${pinyin}, and “${english}” from memory; annotate one pronunciation, form, or grammar feature using an exact lesson fact; then rehearse the line once aloud.`,
      instructorNotes: `Conference against the exact match ${exactTriple}. Ask students to correct the first mismatched field before adding any explanation.`,
      instructorRole: 'Give brief corrective feedback on pronunciation, written form, and meaning.',
      grouping: 'Independent work with individual pronunciation check-ins',
      bloomsLevel: 'Apply',
    },
    {
      activity: 'Exit micro-performance',
      type: 'Closure',
      description: `Without notes, students present ${hanzi} with its tone-marked Pinyin and English meaning, then state one admitted fact that helps a beginner use or interpret it accurately.`,
      instructorNotes:
        'Sort responses into exact, one-field mismatch, and needs reteaching; use the mismatch pattern to open the next lesson.',
      instructorRole: 'Verify the three-part match and record the next pronunciation or meaning need.',
      grouping: 'Individual exit response with rapid instructor check',
      bloomsLevel: 'Apply',
    },
  ];
  return outline.map((step, index) => ({ ...step, ...(replacements[index] || {}) }));
}
