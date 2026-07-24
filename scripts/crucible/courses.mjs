// The Crucible fixed reference suite — faithful prompt reconstructions of the
// four V0.14 output-audit courses, six genome-covered courses (V0.14.3 WS-B1),
// and a rotating stranger pool (WS-B3).
//
// The original four are the regression bar: a refine-loop change is only an
// improvement if it improves THESE courses. The 'all' spec keeps meaning the
// original four so release rounds stay comparable; 'extended' is all ten
// genome+audit courses.
//
// Prompt wording note: each prompt opens with "a NN-lesson ... course" because
// src/lib/detectLessons.js treats the hyphenated "NN-lesson" form as a
// high-confidence match, which pins the lesson count deterministically and
// skips the extra lesson-detection AI call on landing continue.
//
// Genome courses (WS-B1): each lesson title is named after an actual shard
// concept term/alias (read from public/genome/<discipline>-intro.json) so the
// CurriculumOS linker resolves it. `expectGenome` is set ONLY where the shard
// covers the discipline AND the live linker actually links lessons (see the
// grader's genome-bar honesty check, deepQualityGrader checkHonesty). The
// original four carry expectGenome only where Round-4 PROVED linkage:
//   - cs-python: cs shard, Round-4 linked 13/15 lessons → expectGenome 'cs'.
//   - geology:   geo shard, Round-4 linked 13/14 lessons → expectGenome 'geo'.
//   - world-lit: lit shard exists but is thin (2 concepts: close reading,
//     literary argument); Round-4 linked 0/14 (lessons name authors/works, not
//     those concepts). NOT marked — marking it would fire a false genome-bar
//     P1 on regrade. Documented gap; revisit when the lit shard grows.
//   - mandarin:  no 'lang' shard → not eligible.

export const referenceCourses = [
  {
    id: 'mandarin',
    title: 'Elementary Mandarin Chinese I',
    lessonCount: 15,
    prompt:
      'Elementary Mandarin Chinese I, a 15-lesson first-semester college Mandarin course with weekly speaking practice, listening drills, and character writing homework. Lessons cover: the pinyin system and the four tones; greetings and self-introductions; classroom language; numbers, age, and dates; family members and possession with 的; daily routines and telling time; core SVO sentence patterns with 不, 没, and 吗; basic characters and short reading passages; food and dining; shopping and money; weather and clothing; transportation and directions; health and feelings; and a course review leading to a final oral performance. Course materials should contain actual hanzi alongside pinyin with tone marks throughout.',
  },
  {
    id: 'cs-python',
    title: 'Introduction to Computer Science with Python',
    lessonCount: 15,
    // cs shard: Round-4 linked 13/15 lessons. Genome bar enforced.
    expectGenome: 'cs',
    prompt:
      'Introduction to Computer Science with Python, a 15-lesson introductory college course with weekly autograded quizzes and hands-on coding labs. Lessons cover: orientation and environment setup; variables, expressions, and types; conditionals and boolean logic; while loops; for loops and range; functions and scope; lists; strings and text processing; dictionaries and nested data; file input and output; a midterm review and midterm exam; recursion; classes and objects; debugging and testing; an introduction to algorithms; and a final project integrating the full semester.',
  },
  {
    id: 'geology',
    title: 'Physical Geology',
    lessonCount: 14,
    // geo shard: Round-4 linked 13/14 lessons. Genome bar enforced.
    expectGenome: 'geo',
    prompt:
      'Physical Geology, a 14-lesson undergraduate course with weekly labs using hand-specimen kits. Lessons cover: introduction and earth systems; minerals and identification using Mohs hardness, streak, cleavage, and luster; silicate structures; igneous rocks and volcanism; sedimentary rocks and depositional environments; metamorphic rocks; the rock cycle; plate tectonics with a midterm exam covering minerals through metamorphic rocks; earthquakes and seismic waves; volcanic hazards; weathering and erosion; streams and groundwater; geologic time and relative dating; a field trip synthesis; and a comprehensive review with a final exam.',
  },
  {
    id: 'world-lit',
    title: 'World Literature',
    lessonCount: 14,
    // lit shard is thin (2 concepts); Round-4 linked 0/14. NOT genome-gated.
    prompt:
      'World Literature, a 14-lesson undergraduate seminar with weekly reading responses and close-reading checks; named primary texts are expected throughout. Lessons cover: what counts as world literature; the oral epic tradition with Gilgamesh and Homer; classical drama with Sophocles; Tang poetry with Li Bai and Du Fu; the Thousand and One Nights and frame narratives; Dante; comparative reading methods culminating in a comparative essay proposal; translation and cultural mediation; postcolonial literature with Achebe; magical realism with García Márquez; modernist poetry; the fantastic with Borges; contemporary global fiction; and a final paper with course synthesis.',
  },

  // ── V0.14.3 WS-B1: six genome-covered courses ───────────────────────────────

  {
    id: 'econ-intro',
    title: 'Principles of Microeconomics',
    lessonCount: 14,
    expectGenome: 'econ',
    // SEEDED GAP (WS-B1): the econ shard's edge
    // econ/price-elasticity-of-demand REQUIRES econ/demand-curve. The
    // elasticity lesson (5) is deliberately placed BEFORE the demand-curve
    // lesson (6), so prerequisite-gap judgment MUST diagnose the out-of-order
    // pair and render a cited primer. The grader's seeded-gap check (see
    // deepQualityGrader checkHonesty) fails the round if the judgment line
    // stays silent or no lesson plan carries the primer.
    seededGap: { lesson: 5, missingConcept: 'Demand curve' },
    prompt:
      'Principles of Microeconomics, a 14-lesson introductory college course with weekly problem sets and a midterm. Lessons cover: the economic model and simplifying assumptions; opportunity cost and trade-offs; comparative advantage and gains from trade; consumer choice and utility maximization; price elasticity of demand and elastic versus inelastic goods; the demand curve and the law of demand; the supply curve and the law of supply; market equilibrium where supply and demand balance; externalities and spillover costs; monopoly and market power; the circular flow of income; capital accumulation and net investment; labor force classification and who counts as unemployed; and a natural experiment approach to policy evaluation with a course review.',
  },
  {
    id: 'stats-intro',
    title: 'Introductory Statistics',
    lessonCount: 14,
    expectGenome: 'stats',
    prompt:
      'Introductory Statistics, a 14-lesson introductory college course with weekly data labs and a midterm. Lessons cover: data provenance and how the data were collected; observational studies, confounding variables, and spurious association; sampling and the sampling distribution of the sample mean; the central limit theorem; the p-value and significance probability; hypothesis testing logic; the statistical model and its assumptions; the regression model and least squares; correlation versus causation; reading and producing data visualizations; confidence intervals; data collection bias and survey design; a review of statistical inference; and a final data-analysis project with a written report.',
  },
  {
    id: 'psych-101',
    title: 'Introduction to Psychology',
    lessonCount: 15,
    expectGenome: 'psych',
    prompt:
      'Introduction to Psychology, a 15-lesson introductory college course with weekly reading quizzes and a midterm. Lessons cover: classical conditioning and Pavlovian learning; operant conditioning with reinforcement and punishment; observational learning and modeling; memory encoding, storage, and retrieval; short-term and working memory; long-term memory systems including explicit and implicit memory; forgetting and retrieval failure; the Ebbinghaus forgetting curve and interference; Piaget’s stages of cognitive development; Erikson’s psychosocial development; theories of intelligence including general intelligence and multiple intelligences; intrinsic and extrinsic motivation and the overjustification effect; problem-solving strategies with algorithms and heuristics; functional fixedness and mental set; and a course review with a final exam.',
  },
  {
    id: 'nursing-fundamentals',
    title: 'Foundations for Nursing Practice',
    lessonCount: 14,
    expectGenome: 'nursing',
    prompt:
      'Foundations for Nursing Practice, a 14-lesson introductory anatomy-and-physiology-for-nursing course with weekly clinical case studies and a midterm. Lessons cover: homeostasis and negative feedback; levels of structural organization from cells to organ systems; blood components and function; the cardiac cycle and cardiac output with stroke volume; blood pressure and its regulation; gas exchange in the lungs and alveolar diffusion; fluid and electrolyte balance; innate versus adaptive immunity; inflammation and the cardinal signs; bacterial cell structure and the Gram stain; viral replication and the viral life cycle; antimicrobial resistance; modes of disease transmission and the chain of infection; and a comprehensive review with a final exam.',
  },
  {
    id: 'nutrition-101',
    title: 'Human Nutrition',
    lessonCount: 14,
    expectGenome: 'nutrition',
    prompt:
      'Human Nutrition, a 14-lesson introductory college course with weekly diet-analysis labs and a midterm. Lessons cover: the six classes of nutrients and the difference between macronutrients and micronutrients; carbohydrates, simple and complex; dietary fiber, soluble and insoluble; proteins and amino acids; lipids including saturated, unsaturated, and trans fats; fat-soluble and water-soluble vitamins; major minerals and electrolytes; water and hydration; digestion and absorption in the GI tract; energy balance and metabolism with kcal worked examples of calories in versus calories out; healthy eating patterns and MyPlate; reading a Nutrition Facts label and percent daily value; a review of nutrient functions; and a final diet-analysis project.',
  },
  {
    id: 'astro-101',
    title: 'Introduction to Astronomy',
    lessonCount: 12,
    expectGenome: 'astro',
    prompt:
      'Introduction to Astronomy, a 12-lesson introductory college course with evening observing sessions and a midterm. Lessons cover: diurnal motion and the apparent daily motion of the sky; the celestial sphere and celestial coordinates; the seasons and axial tilt with solstice and equinox; phases of the Moon; Kepler’s third law and the laws of planetary motion; the electromagnetic spectrum and wavelengths of light; spectral lines, absorption and emission spectra of stars; telescope light-gathering power and aperture; stellar parallax and celestial distances measured in parsecs; apparent magnitude and the brightness of stars; the solar nebula hypothesis and the formation of the solar system; and Hubble’s law and the expanding universe with a course review.',
  },
];

// ── WS-B3: the stranger pool ─────────────────────────────────────────────────
// One stranger appended per round when --stranger is passed, chosen
// DETERMINISTICALLY by day-of-year modulo (no Math.random — same stranger all
// day, so a re-run of the same day is reproducible). Strangers probe unknown
// disciplines: they grade on GENERIC dimensions only (probeProfile 'generic'
// suppresses the discipline probe + the genome bar) and never gate — their
// findings file separately as stranger-findings.md and are excluded from the
// P0 exit gate and the pass/fail summary.
export const strangerPool = [
  {
    id: 'ux-design-studio',
    title: 'User Experience Design Studio',
    lessonCount: 12,
    probeProfile: 'generic',
    prompt:
      'User Experience Design Studio, a 12-lesson project-based undergraduate course with critique sessions, design journals, usability testing labs, prototype reviews, and a final portfolio case study. Lessons cover: human-centered design foundations; research planning and ethics; contextual interviews and observation; affinity mapping and insight synthesis; personas; journey maps and service blueprints; information architecture; task flows and interaction patterns; low-fidelity wireframes; interactive prototyping; accessibility and usability evaluation; and design handoff with portfolio storytelling.',
  },
  {
    id: 'music-theory',
    title: 'Music Theory Fundamentals',
    lessonCount: 7,
    probeProfile: 'generic',
    prompt:
      'Music Theory Fundamentals, a 7-lesson introductory college course with weekly listening and notation exercises. Lessons cover: the staff, clefs, and pitch notation; intervals and how to hear them; major and minor scales and key signatures; triads and seventh chords; rhythm, meter, and time signatures; harmony and basic chord progressions; and musical form with a final analysis project.',
  },
  {
    id: 'art-history',
    title: 'Survey of Art History',
    lessonCount: 14,
    probeProfile: 'generic',
    prompt:
      'Survey of Art History, a 14-lesson introductory college course with weekly museum-style image analyses and a midterm. Lessons cover: how to look at and describe a work of art; prehistoric and ancient Near Eastern art; Egyptian art and architecture; Greek and Roman art; early Christian and Byzantine art; medieval and Gothic art; the Italian Renaissance; the Northern Renaissance; Baroque art; Rococo and Neoclassicism; Romanticism and Realism; Impressionism and Post-Impressionism; modernism and the twentieth-century avant-garde; and contemporary and global art with a final visual-analysis paper.',
  },
  {
    id: 'business-ethics',
    title: 'Business Ethics',
    lessonCount: 12,
    probeProfile: 'generic',
    prompt:
      'Business Ethics, a 12-lesson introductory college course with weekly case discussions and a midterm. Lessons cover: what business ethics is and why it matters; major ethical frameworks including utilitarianism, deontology, and virtue ethics; corporate social responsibility; stakeholder theory; whistleblowing and organizational loyalty; conflicts of interest; fair employment and workplace rights; consumer protection and product safety; environmental responsibility and sustainability; ethics in marketing and advertising; global business and cross-cultural ethics; and an integrative capstone case analysis.',
  },
  {
    id: 'k12-earth-science',
    title: 'Middle School Earth Science',
    lessonCount: 13,
    probeProfile: 'generic',
    prompt:
      'Middle School Earth Science, a 13-lesson grade 6–8 course with weekly hands-on investigations and a unit test. Lessons cover: what earth scientists study; rocks and the rock cycle; the water cycle; weather and the atmosphere; climate and climate zones; the layers of the Earth; plate tectonics and continental drift; volcanoes and earthquakes; the solar system and the planets; the Sun, Moon, and tides; natural resources and conservation; human impact on the environment; and a culminating earth-systems project.',
  },
  {
    id: 'intro-philosophy',
    title: 'Introduction to Philosophy',
    lessonCount: 12,
    probeProfile: 'generic',
    prompt:
      'Introduction to Philosophy, a 12-lesson introductory college course with weekly argument analyses and a midterm. Lessons cover: what philosophy is and how to read an argument; logic and the structure of valid arguments; the theory of knowledge and skepticism; the mind-body problem; personal identity; free will and determinism; arguments for and against the existence of God; the problem of evil; ethical theory and the good life; justice and political philosophy; the meaning of life; and a final philosophical essay.',
  },
  {
    // Distinct id from the 7-lesson 'music-theory' above — a duplicate id made
    // strangerPool non-unique and broke the day-of-year rotation test.
    id: 'music-theory-survey',
    title: 'Fundamentals of Music Theory',
    lessonCount: 14,
    probeProfile: 'generic',
    prompt:
      'Fundamentals of Music Theory, a 14-lesson introductory college course with weekly ear-training drills and a midterm. Lessons cover: reading pitch on the staff and clefs; note durations and rhythm; time signatures and meter; major scales and key signatures; minor scales; intervals; triads and chord qualities; seventh chords; diatonic harmony and Roman numerals; cadences; voice leading basics; non-chord tones; basic form and phrase structure; and a final analysis and composition project.',
  },
  {
    id: 'public-speaking',
    title: 'Public Speaking',
    lessonCount: 10,
    probeProfile: 'generic',
    prompt:
      'Public Speaking, a 10-lesson introductory college course with weekly delivered speeches and peer feedback. Lessons cover: overcoming speech anxiety and getting started; audience analysis; choosing and narrowing a topic; researching and supporting your ideas; organizing the speech and outlining; introductions and conclusions; language and style; delivery and the voice; using presentation aids; and the persuasive speech with a final graded presentation.',
  },
];

// ── V0.14.5 WS-A (A5): the Grounding proof fixture ──────────────────────────
// World Lit EXTENDED with an explicit per-week reading list naming the real
// canon — the texts the V0.14 audit found missing. Deliberately NOT in
// 'all'/'extended' (those stay comparable across loop history): it runs by
// its own id in Grounding proof rounds. `expectReadings: true` arms the
// grader's named-reading penetration check (deepQualityGrader checkReadings)
// — an empty manifest readings registry fails the round.
export const groundingCourses = [
  {
    id: 'world-lit-readings',
    title: 'World Literature',
    lessonCount: 14,
    expectReadings: true,
    prompt:
      'World Literature, a 14-lesson undergraduate seminar with weekly reading responses and close-reading checks; the syllabus assigns a named primary text nearly every week and course materials must name those texts. Lessons cover: what counts as world literature; the oral epic tradition; the Homeric epic; classical drama; Tang poetry; frame narratives; the medieval journey narrative; comparative reading methods culminating in a comparative essay proposal; postcolonial literature; magical realism; modernist poetry; the fantastic and the infinite library; contemporary global fiction; and a final paper with course synthesis. Required readings as named on the syllabus: Week 2 reads Gilgamesh; Week 3 reads The Odyssey; Week 4 reads Antigone; Week 5 reads selected poems of Li Bai and Du Fu; Week 6 reads The Thousand and One Nights; Week 7 reads Inferno; Week 9 reads Things Fall Apart; Week 10 reads One Hundred Years of Solitude; Week 11 reads The Waste Land; Week 12 reads The Library of Babel.',
  },
];

// Production regressions are intentionally opt-in. They preserve the smallest
// prompt that reproduced a real user-visible failure without changing the
// release-comparable `all`, `extended`, or rotating stranger suites.
export const regressionCourses = [
  {
    id: 'experiential-ir-simulation',
    title: 'International Crisis Bargaining',
    lessonCount: 5,
    probeProfile: 'generic',
    prompt:
      'International Crisis Bargaining, a 5-lesson undergraduate course with policy memos and structured evidence review. Lessons cover: signaling and commitment under uncertainty; escalation risks and de-escalation tools; monitoring mandates and evidence limits; a 75-minute maritime crisis simulation in which participant roles inspect a fictional patrol log and civilian convoy notice, receive synchronized updates, revise a negotiated response, submit a decision log, and debrief; and a final comparison of crisis-management strategies. The fourth lesson explicitly requires the simulation and its complete participant activity packet.',
  },
  {
    id: 'genetics-production-regression',
    title: 'Introduction to Genetics',
    lessonCount: 15,
    probeProfile: 'generic',
    prompt:
      'Introduction to Genetics, a 15-lesson undergraduate biology course with problem sets, a model-organism lab, two midterms, and a final. Covers Mendelian inheritance, meiosis, linkage and gene mapping, the molecular structure of DNA, gene expression, mutation, population genetics, epigenetics, and modern genetic technologies.',
  },
];

export const smokePool = referenceCourses.filter((course) => course.id === 'cs-python');

// The original four audit courses — 'all' resolves to exactly these so release
// rounds stay comparable across the whole loop history.
const AUDIT_COURSE_IDS = ['mandarin', 'cs-python', 'geology', 'world-lit'];

export function getCourseById(id) {
  return (
    referenceCourses.find((course) => course.id === id) ||
    groundingCourses.find((course) => course.id === id) ||
    regressionCourses.find((course) => course.id === id) ||
    strangerPool.find((course) => course.id === id) ||
    null
  );
}

/**
 * WS-B3: deterministic stranger pick — day-of-year modulo the pool length, so
 * the same calendar day always selects the same stranger (no Math.random; a
 * re-run mid-day is reproducible). dayOfYear is 1-based.
 */
export function dayOfYear(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((now - start) / 86_400_000);
}

export function pickStranger(date = new Date(), pool = strangerPool) {
  if (!pool || pool.length === 0) return null;
  return pool[(dayOfYear(date) - 1) % pool.length] || pool[0];
}

/**
 * Resolve a --courses spec into course objects.
 * Accepts:
 *   'all'      → the original four audit courses (release-comparable bar).
 *   'extended' → all ten (the four audit + six genome courses).
 *   'smoke'    → the smoke pool (cs-python).
 *   comma ids  → any subset, e.g. 'econ-intro,astro-101' or 'mandarin,geology'.
 */
export function resolveCourses(spec) {
  const value = String(spec || 'all').trim();
  if (!value || value === 'all') {
    return AUDIT_COURSE_IDS.map((id) => getCourseById(id));
  }
  if (value === 'extended') return [...referenceCourses];
  if (value === 'smoke') return [...smokePool];
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const courses = ids.map((id) => {
    const course = getCourseById(id);
    if (!course) {
      const known = [...referenceCourses, ...groundingCourses, ...regressionCourses, ...strangerPool]
        .map((c) => c.id)
        .join(', ');
      throw new Error(`Unknown course id "${id}" — known ids: ${known} (or "all"/"extended"/"smoke")`);
    }
    return course;
  });
  if (courses.length === 0) throw new Error('No courses resolved from --courses spec');
  return courses;
}
