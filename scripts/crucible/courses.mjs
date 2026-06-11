// The Crucible fixed reference suite — faithful prompt reconstructions of the
// four V0.14 output-audit courses. These exact shapes are the regression bar:
// a refine-loop change is only an improvement if it improves THESE courses.
//
// Prompt wording note: each prompt opens with "a NN-lesson ... course" because
// src/lib/detectLessons.js treats the hyphenated "NN-lesson" form as a
// high-confidence match, which pins the lesson count deterministically and
// skips the extra lesson-detection AI call on landing continue.

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
    prompt:
      'Introduction to Computer Science with Python, a 15-lesson introductory college course with weekly autograded quizzes and hands-on coding labs. Lessons cover: orientation and environment setup; variables, expressions, and types; conditionals and boolean logic; while loops; for loops and range; functions and scope; lists; strings and text processing; dictionaries and nested data; file input and output; a midterm review and midterm exam; recursion; classes and objects; debugging and testing; an introduction to algorithms; and a final project integrating the full semester.',
  },
  {
    id: 'geology',
    title: 'Physical Geology',
    lessonCount: 14,
    prompt:
      'Physical Geology, a 14-lesson undergraduate course with weekly labs using hand-specimen kits. Lessons cover: introduction and earth systems; minerals and identification using Mohs hardness, streak, cleavage, and luster; silicate structures; igneous rocks and volcanism; sedimentary rocks and depositional environments; metamorphic rocks; the rock cycle; plate tectonics with a midterm exam covering minerals through metamorphic rocks; earthquakes and seismic waves; volcanic hazards; weathering and erosion; streams and groundwater; geologic time and relative dating; a field trip synthesis; and a comprehensive review with a final exam.',
  },
  {
    id: 'world-lit',
    title: 'World Literature',
    lessonCount: 14,
    prompt:
      'World Literature, a 14-lesson undergraduate seminar with weekly reading responses and close-reading checks; named primary texts are expected throughout. Lessons cover: what counts as world literature; the oral epic tradition with Gilgamesh and Homer; classical drama with Sophocles; Tang poetry with Li Bai and Du Fu; the Thousand and One Nights and frame narratives; Dante; comparative reading methods culminating in a comparative essay proposal; translation and cultural mediation; postcolonial literature with Achebe; magical realism with García Márquez; modernist poetry; the fantastic with Borges; contemporary global fiction; and a final paper with course synthesis.',
  },
];

export const smokePool = referenceCourses.filter((course) => course.id === 'cs-python');

export function getCourseById(id) {
  return referenceCourses.find((course) => course.id === id) || null;
}

/**
 * Resolve a --courses spec into course objects.
 * Accepts 'all', 'smoke', or comma-separated ids (e.g. 'mandarin,geology').
 */
export function resolveCourses(spec) {
  const value = String(spec || 'all').trim();
  if (!value || value === 'all') return [...referenceCourses];
  if (value === 'smoke') return [...smokePool];
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const courses = ids.map((id) => {
    const course = getCourseById(id);
    if (!course) {
      const known = referenceCourses.map((c) => c.id).join(', ');
      throw new Error(`Unknown course id "${id}" — known ids: ${known} (or "all"/"smoke")`);
    }
    return course;
  });
  if (courses.length === 0) throw new Error('No courses resolved from --courses spec');
  return courses;
}
