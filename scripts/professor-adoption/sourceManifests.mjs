export const PROFESSOR_ADOPTION_SMOKE_CASE_IDS = [
  'mit-1806-linear-algebra',
  'berkeley-data8-fa25',
  'yale-engl310-poetry',
];

function section(topics, objectives, activities, assessment, supportingResources = '') {
  return { topics, objectives, activities, assessment, supportingResources };
}

function lesson(title, rows) {
  return { title, sections: rows };
}

function makeCourseMap({ courseName, semester = 'Public-source benchmark', lessons }) {
  return { courseName, semester, lessons };
}

function signal(id, label, patterns, options = {}) {
  return {
    id,
    label,
    patterns,
    dimension: options.dimension || 'disciplineFit',
    scoreImpact: options.scoreImpact || 4,
    severity: options.severity || 'P2',
    targetArea: options.targetArea || 'compiler',
    actionId: options.actionId || `repair-${id}`,
    acceptanceCriteria: options.acceptanceCriteria || [`Compiled output preserves ${label}.`],
    sourceExpectation: options.sourceExpectation || label,
  };
}

function manifest({
  id,
  courseFamily,
  title,
  sourceUrl,
  publicInstructorNames,
  disciplineFamily,
  modality,
  sourceArtifacts,
  primaryStudentWorkProducts,
  assessmentArchitecture,
  supportAndOperationsModel = [],
  mustPreserveSignals,
  requiredSignalGroups,
  forbiddenSignals = [],
  courseMap,
}) {
  return {
    id,
    courseFamily,
    title,
    sourceUrl,
    publicInstructorNames,
    disciplineFamily,
    modality,
    sourceArtifacts,
    primaryStudentWorkProducts,
    assessmentArchitecture,
    supportAndOperationsModel,
    mustPreserveSignals,
    genericPhraseRejects: [
      {
        id: 'generic-course-evidence',
        label: 'generic course evidence language',
        patterns: ['\\bcourse evidence\\b', '\\bcourse artifact\\b', '\\bgeneric evidence\\b'],
        maxCount: 5,
        scoreImpact: 4,
        dimension: 'disciplineFit',
      },
      {
        id: 'unsupported-professor-approval',
        label: 'unsupported professor approval language',
        patterns: [
          '\\bprofessors? approved\\b',
          '\\binstructors? approved\\b',
          '\\bendorsed by\\b',
          '\\bexternal validation complete\\b',
        ],
        maxCount: 0,
        hardBlocker: true,
        scoreImpact: 20,
        dimension: 'sourceFidelity',
      },
    ],
    requiredSignalGroups,
    forbiddenSignals,
    courseMap,
  };
}

export const PROFESSOR_ADOPTION_MANIFESTS = [
  manifest({
    id: 'mit-1806-linear-algebra',
    courseFamily: 'Math and quantitative proof/problem solving',
    title: 'MIT 18.06 Linear Algebra',
    sourceUrl: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/',
    publicInstructorNames: ['Gilbert Strang'],
    disciplineFamily: 'math-quantitative',
    modality: 'lecture-problem-set',
    sourceArtifacts: ['syllabus', 'calendar', 'readings', 'assignments', 'exams', 'study materials'],
    primaryStudentWorkProducts: ['problem sets', 'worked solutions', 'exam responses'],
    assessmentArchitecture: ['problem sets', 'midterm exams', 'final exam'],
    supportAndOperationsModel: ['lecture sequence', 'study materials', 'problem set cadence'],
    mustPreserveSignals: ['matrices', 'systems', 'vector spaces', 'eigenvalues', 'problem sets', 'exams'],
    requiredSignalGroups: [
      signal('math-work-products', 'problem sets, proofs, calculations, or exams', [
        '\\bproblem[-\\s]?set\\b',
        '\\bworked solution\\b',
        '\\bcalculation\\b',
        '\\bexam\\b',
        '\\bproof\\b',
      ]),
      signal('linear-algebra-vocabulary', 'linear algebra vocabulary', [
        '\\bmatrix\\b',
        '\\bmatrices\\b',
        '\\bvector\\b',
        '\\bvector space\\b',
        '\\beigen(?:value|vector)s?\\b',
        '\\brow reduction\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 18.06 Linear Algebra public-source benchmark: matrices, vector spaces, eigenvalues, problem sets, exams',
      lessons: [
        lesson('Week 1: Systems and row reduction', [
          section(
            'Linear systems, augmented matrices, row operations, pivots, consistency',
            'Solve a linear system with row reduction and justify whether the system has no, one, or infinitely many solutions.',
            'Instructor works two matrix examples; students compare a correct reduction with an error and explain the pivot decision.',
            'Problem set checkpoint with worked solution rationale',
          ),
        ]),
        lesson('Week 2: Vector spaces and subspaces', [
          section(
            'Vector spaces, subspaces, span, basis, dimension',
            'Prove or disprove whether a set is a subspace and compute a basis for a span.',
            'Proof critique on subspace conditions followed by calculation practice.',
            'Proof and calculation problem set',
          ),
        ]),
        lesson('Week 3: Orthogonality and least squares', [
          section(
            'Orthogonal projections, normal equations, least-squares solution',
            'Compute a least-squares approximation and explain the geometric reason for the projection.',
            'Worked example with projection diagram and peer check of normal-equation setup.',
            'Exam-style calculation with solution explanation',
          ),
        ]),
        lesson('Week 4: Eigenvalues and diagonalization', [
          section(
            'Eigenvalues, eigenvectors, diagonalization, characteristic polynomial',
            'Find eigenvalues and use them to decide whether a matrix can be diagonalized.',
            'Students solve an eigenvalue problem and justify each algebraic step.',
            'Problem set and exam review problems',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-18100a-real-analysis',
    courseFamily: 'Math proof',
    title: 'MIT 18.100A Real Analysis',
    sourceUrl: 'https://ocw.mit.edu/courses/18-100a-real-analysis-fall-2020/',
    publicInstructorNames: ['Casey Rodriguez'],
    disciplineFamily: 'math-proof',
    modality: 'proof-seminar',
    sourceArtifacts: ['syllabus', 'calendar', 'lecture notes', 'recitations', 'assignments', 'exams'],
    primaryStudentWorkProducts: ['proof write-ups', 'counterexample analyses', 'exam proofs'],
    assessmentArchitecture: ['problem sets', 'recitation work', 'exams'],
    supportAndOperationsModel: ['lecture sequence', 'recitation sequence', 'proof problem cadence'],
    mustPreserveSignals: ['definitions', 'theorems', 'hypotheses', 'counterexamples', 'proofs'],
    requiredSignalGroups: [
      signal('proof-course-work-products', 'definitions, theorem statements, proof tasks, and counterexamples', [
        '\\bdefinition\\b',
        '\\btheorem\\b',
        '\\bhypothes(?:is|es)\\b',
        '\\bcounterexample\\b',
        '\\bproof\\b',
      ]),
      signal('proof-rigor-criteria', 'proof rigor criteria', [
        '\\blogical implication\\b',
        '\\bquantifier\\b',
        '\\bproof strategy\\b',
        '\\bargument\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 18.100A Real Analysis public-source benchmark: definitions, theorems, counterexamples, rigorous proof writing',
      lessons: [
        lesson('Week 1: Sets, functions, and proof language', [
          section(
            'Definitions, quantifiers, functions, logical implication',
            'Write a proof that uses definitions and quantifiers without skipping hypotheses.',
            'Definition unpacking and proof strategy comparison.',
            'Proof write-up with hypothesis checklist',
          ),
        ]),
        lesson('Week 2: Sequences and convergence', [
          section(
            'Sequences, limits, convergence, epsilon arguments',
            'Prove convergence of a sequence using an epsilon definition.',
            'Instructor models an epsilon proof; students revise a flawed proof.',
            'Problem set proof and counterexample item',
          ),
        ]),
        lesson('Week 3: Continuity', [
          section(
            'Continuity, inverse images, compactness signals',
            'Use the definition of continuity to prove or disprove a claim.',
            'Counterexample workshop with proof critique.',
            'Recitation proof portfolio entry',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-60001-python',
    courseFamily: 'CS programming course',
    title: 'MIT 6.0001 Introduction to Computer Science and Programming in Python',
    sourceUrl:
      'https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/',
    publicInstructorNames: ['Ana Bell', 'Eric Grimson', 'John Guttag'],
    disciplineFamily: 'cs-programming',
    modality: 'programming-lab',
    sourceArtifacts: [
      'syllabus',
      'readings',
      'lecture videos',
      'lecture slides',
      'code',
      'in-class questions',
      'assignments',
    ],
    primaryStudentWorkProducts: ['Python programs', 'problem set submissions', 'debugging traces', 'tests'],
    assessmentArchitecture: ['problem sets', 'in-class questions', 'exams'],
    supportAndOperationsModel: ['Python environment', 'assignment specifications', 'testing and debugging workflow'],
    mustPreserveSignals: ['Python', 'code', 'tests', 'debugging', 'problem sets'],
    requiredSignalGroups: [
      signal('programming-work-products', 'code, tests, debugging, edge cases, or problem set specs', [
        '\\bcode\\b',
        '\\bPython\\b',
        '\\bdebug\\b',
        '\\btest(?:s|ing)?\\b',
        '\\bedge case\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 6.0001 Python programming public-source benchmark: code, functions, debugging, tests, problem sets',
      lessons: [
        lesson('Week 1: Python basics and control flow', [
          section(
            'Python expressions, variables, conditionals, loops',
            'Implement a Python function and explain its input-output behavior.',
            'Live coding followed by debugging a small loop error.',
            'Problem set code submission with tests',
          ),
        ]),
        lesson('Week 2: Functions and decomposition', [
          section(
            'Functions, scope, decomposition, docstrings',
            'Write modular Python code and test edge cases.',
            'Pair programming with unit-test checklist.',
            'Code lab with debugging log',
          ),
        ]),
        lesson('Week 3: Algorithms and complexity intuition', [
          section(
            'Search, bisection, algorithmic efficiency',
            'Compare two algorithms using traces and basic complexity reasoning.',
            'Students trace code and explain which input changes runtime.',
            'Exam-style code reading and implementation item',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'berkeley-data8-fa25',
    courseFamily: 'Data science lab and large-course operations',
    title: 'UC Berkeley Data 8 Fall 2025',
    sourceUrl: 'https://data8.org/fa25/',
    publicInstructorNames: ['Jeremy Sanchez', 'Data 8 course staff'],
    disciplineFamily: 'data-science-lab',
    modality: 'large-course-data-lab',
    sourceArtifacts: [
      'weekly calendar',
      'office hours',
      'syllabus',
      'staff',
      'resources',
      'FAQ',
      'textbook',
      'labs',
      'homework',
      'projects',
    ],
    primaryStudentWorkProducts: ['notebooks', 'datasets', 'labs', 'homework', 'projects', 'visualizations'],
    assessmentArchitecture: ['labs', 'homework', 'projects', 'exams'],
    supportAndOperationsModel: [
      'office hours',
      'Ed discussion',
      'Python reference',
      'debugging FAQ',
      'deadlines',
      'score release',
    ],
    mustPreserveSignals: ['notebooks', 'datasets', 'Python', 'labs', 'homework', 'projects', 'office hours'],
    requiredSignalGroups: [
      signal('data-lab-work-products', 'notebooks, datasets, labs, projects, Python, or validation evidence', [
        '\\bnotebook\\b',
        '\\bdataset\\b',
        '\\bPython\\b',
        '\\blab\\b',
        '\\bproject\\b',
        '\\bvalidation\\b',
      ]),
      signal(
        'large-course-operations',
        'office hours, support channels, deadlines, staff model, or submission workflow',
        [
          '\\boffice hours\\b',
          '\\bEd Discussion\\b',
          '\\bsupport\\b',
          '\\bdeadline\\b',
          '\\bstaff\\b',
          '\\bsubmission\\b',
        ],
        { dimension: 'courseOperations', scoreImpact: 6, severity: 'P1' },
      ),
    ],
    forbiddenSignals: [
      {
        id: 'data-science-wet-lab-leak',
        label: 'wet-lab language in data science',
        patterns: ['\\bpipette\\b', '\\bwet lab\\b', '\\bspecimen\\b', '\\bchemical safety\\b'],
        severity: 'P1',
        dimension: 'disciplineFit',
      },
    ],
    courseMap: makeCourseMap({
      courseName:
        'UC Berkeley Data 8 public-source benchmark: data science notebooks, datasets, Python labs, homework, projects, office hours, Ed Discussion, deadlines',
      lessons: [
        lesson('Week 1: Computational notebooks and course operations', [
          section(
            'Jupyter notebooks, Python reference, course website, office hours, Ed Discussion, deadlines',
            'Use the course toolchain and identify where to submit, ask questions, and check support resources.',
            'Notebook setup check, support-channel tour, and deadline/submission walkthrough.',
            'Lab notebook setup checkpoint',
          ),
        ]),
        lesson('Week 2: Tables and dataset provenance', [
          section(
            'Datasets, tables, data provenance, cleaning decisions',
            'Use a notebook to inspect a dataset and explain one data-quality limitation.',
            'Students run Python cells, inspect a table, and annotate a cleaning choice.',
            'Homework notebook with data-quality note',
          ),
        ]),
        lesson('Week 3: Visualization and interpretation', [
          section(
            'Visualizations, distributions, comparisons, data story evidence',
            'Build a visualization and defend what the chart can and cannot claim.',
            'Lab pairs compare charts and revise one interpretation.',
            'Project checkpoint with visualization and limitation statement',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-engl300-theory',
    courseFamily: 'Humanities seminar and writing',
    title: 'Yale ENGL 300 Introduction to Theory of Literature',
    sourceUrl: 'https://oyc.yale.edu/english/engl-300',
    publicInstructorNames: ['Paul H. Fry'],
    disciplineFamily: 'humanities-writing',
    modality: 'interpretive-humanities',
    sourceArtifacts: ['about', 'syllabus', 'sessions', 'texts', 'papers', 'final exam', 'discussion participation'],
    primaryStudentWorkProducts: ['papers', 'interpretive claims', 'textual evidence notes', 'discussion participation'],
    assessmentArchitecture: ['papers', 'final exam', 'participation'],
    supportAndOperationsModel: ['reading sequence', 'lecture sessions', 'paper prompts'],
    mustPreserveSignals: ['theory', 'texts', 'interpretive claims', 'textual evidence', 'papers'],
    requiredSignalGroups: [
      signal('humanities-work-products', 'readings, interpretive claims, textual evidence, papers, or discussion', [
        '\\btextual evidence\\b',
        '\\binterpretive claim\\b',
        '\\bpaper\\b',
        '\\bclose[-\\s]?reading\\b',
        '\\bdiscussion\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale ENGL 300 literary theory public-source benchmark: theoretical texts, interpretive claims, papers, final exam, discussion participation',
      lessons: [
        lesson('Week 1: What is literary theory?', [
          section(
            'Theory of literature, interpretation, text, method, critical lens',
            'Use a theoretical term to frame an interpretive claim about a text.',
            'Close-reading seminar with competing claims and passage evidence.',
            'Short interpretive response paper',
          ),
        ]),
        lesson('Week 2: Author, reader, and text', [
          section(
            'Author, reader response, textual evidence, argument',
            'Compare two theoretical approaches and revise a claim using passage evidence.',
            'Discussion participation with claim-evidence challenge.',
            'Paper prompt and revision memo',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-engl310-poetry',
    courseFamily: 'Literature and close reading',
    title: 'Yale ENGL 310 Modern Poetry',
    sourceUrl: 'https://oyc.yale.edu/english/engl-310',
    publicInstructorNames: ['Langdon Hammer'],
    disciplineFamily: 'humanities-writing',
    modality: 'interpretive-humanities',
    sourceArtifacts: [
      'about',
      'syllabus',
      'sessions',
      'texts',
      'informal writing',
      'papers',
      'exams',
      'discussion participation',
    ],
    primaryStudentWorkProducts: ['close readings', 'paper drafts', 'passage annotations', 'exam essays'],
    assessmentArchitecture: ['informal writing', 'papers', 'exams', 'discussion participation'],
    supportAndOperationsModel: ['poem/text sequence', 'lecture sessions', 'discussion participation'],
    mustPreserveSignals: ['poems', 'passages', 'close reading', 'interpretive claims', 'papers'],
    requiredSignalGroups: [
      signal('poetry-close-reading', 'poems, passages, close reading, interpretive claims, and papers', [
        '\\bpoem\\b',
        '\\bpassage\\b',
        '\\bclose[-\\s]?reading\\b',
        '\\binterpretive claim\\b',
        '\\bpaper\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale ENGL 310 Modern Poetry public-source benchmark: poems, passages, close reading, interpretive claims, papers, exams',
      lessons: [
        lesson('Week 1: Modern poetry and close reading', [
          section(
            'Poem, speaker, image, line, stanza, passage evidence',
            'Make an interpretive claim about a poem using passage-level textual evidence.',
            'Students annotate a poem, compare two readings, and revise the claim.',
            'Close-reading paper paragraph',
          ),
        ]),
        lesson('Week 2: Form, voice, and argument', [
          section(
            'Poetic form, voice, meter, image pattern, interpretive argument',
            'Explain how a formal feature changes the interpretation of a passage.',
            'Seminar discussion with passage evidence and counter-reading.',
            'Informal writing and paper revision',
          ),
        ]),
        lesson('Week 3: Exam essay preparation', [
          section(
            'Exam essay, poem comparison, textual evidence, thesis',
            'Draft an exam-style essay claim that compares two poems with specific textual evidence.',
            'Timed claim workshop followed by peer response.',
            'Exam essay outline',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-french-i',
    courseFamily: 'Language learning',
    title: 'MIT 21G.301/351 French I',
    sourceUrl: 'https://ocw.mit.edu/courses/21g-301-french-i-fall-2004/',
    publicInstructorNames: [
      'Cathy Culot',
      'Gilberte Furstenberg',
      'Johann Sadock',
      'Laura Ceia-Minjares',
      'Sabine Levet',
    ],
    disciplineFamily: 'world-language',
    modality: 'communicative-language',
    sourceArtifacts: ['syllabus', 'calendar', 'readings', 'assignments', 'related resources', 'language lab'],
    primaryStudentWorkProducts: ['dialogues', 'oral practice', 'listening logs', 'vocabulary and grammar tasks'],
    assessmentArchitecture: ['assignments', 'language lab practice', 'oral and written checks'],
    supportAndOperationsModel: ['coordinated language lab', 'calendar', 'related resources'],
    mustPreserveSignals: ['speaking', 'listening', 'vocabulary', 'grammar', 'culture', 'dialogue'],
    requiredSignalGroups: [
      signal('language-practice-products', 'speaking, listening, pronunciation, vocabulary, grammar, or dialogue', [
        '\\bspeaking\\b',
        '\\blistening\\b',
        '\\bpronunciation\\b',
        '\\bvocabulary\\b',
        '\\bgrammar\\b',
        '\\bdialogue\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT French I public-source benchmark: communicative language learning, speaking, listening, vocabulary, grammar, culture, language lab',
      lessons: [
        lesson('Week 1: Greetings and classroom communication', [
          section(
            'French greetings, pronunciation, classroom phrases, listening comprehension',
            'Use target-language greetings and classroom requests in a short dialogue.',
            'Paired speaking rehearsal, pronunciation feedback, and listening check.',
            'Oral dialogue and vocabulary quiz',
          ),
        ]),
        lesson('Week 2: Describing people and routines', [
          section(
            'Vocabulary, grammar, present tense, cultural comparison',
            'Describe a routine in French and respond to a partner question.',
            'Language lab listening practice and guided grammar noticing.',
            'Presentational script with oral recording',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-japanese-i',
    courseFamily: 'Language learning with script and oral assessment',
    title: 'MIT 21G.501 Japanese I',
    sourceUrl: 'https://ocw.mit.edu/courses/21g-501-japanese-i-fall-2019/',
    publicInstructorNames: ['Takako Aikawa', 'Masami Ikeda-Lamm', 'Wakana Maekawa', 'Emiko Rafique'],
    disciplineFamily: 'world-language',
    modality: 'communicative-language',
    sourceArtifacts: [
      'syllabus',
      'instructor insights',
      'in-class activities',
      'assignments',
      'quizzes',
      'interview tests',
    ],
    primaryStudentWorkProducts: ['dialogues', 'script practice', 'quizzes', 'interview tests'],
    assessmentArchitecture: ['assignments', 'quizzes', 'interview tests'],
    supportAndOperationsModel: ['in-class activities', 'interview test routines', 'feedback on script and speech'],
    mustPreserveSignals: ['speaking', 'listening', 'script', 'interview tests', 'dialogue'],
    requiredSignalGroups: [
      signal('japanese-language-products', 'speaking, listening, script practice, dialogue, and interview tests', [
        '\\bspeaking\\b',
        '\\blistening\\b',
        '\\bscript\\b',
        '\\bdialogue\\b',
        '\\binterview test\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT Japanese I public-source benchmark: script practice, speaking, listening, dialogue, quizzes, interview tests',
      lessons: [
        lesson('Week 1: Hiragana, greetings, and classroom dialogue', [
          section(
            'Hiragana script, greetings, pronunciation, classroom expressions',
            'Read and write basic script and perform a short greeting dialogue.',
            'Script practice, paired oral rehearsal, and pronunciation feedback.',
            'Script quiz and dialogue check',
          ),
        ]),
        lesson('Week 2: Interview test preparation', [
          section(
            'Question-answer patterns, listening comprehension, cultural politeness routines',
            'Answer interview questions in Japanese with accurate language and appropriate politeness.',
            'Mock interview rotations with feedback and listening checks.',
            'Interview test practice and oral reflection',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-beng100-biomed',
    courseFamily: 'Biomedical engineering and professional practice',
    title: 'Yale BENG 100 Frontiers of Biomedical Engineering',
    sourceUrl: 'https://oyc.yale.edu/biomedical-engineering/beng-100',
    publicInstructorNames: ['W. Mark Saltzman'],
    disciplineFamily: 'biomedical-engineering',
    modality: 'engineering-health-science',
    sourceArtifacts: ['about', 'syllabus', 'sessions', 'readings', 'homework', 'term paper', 'midterm', 'final exam'],
    primaryStudentWorkProducts: ['homework', 'term paper', 'exam responses', 'biomedical case analyses'],
    assessmentArchitecture: ['homework', 'term paper', 'midterm', 'final exam'],
    supportAndOperationsModel: ['lecture sequence', 'readings', 'homework/exam cadence'],
    mustPreserveSignals: ['biomedical engineering', 'FDA', 'patent', 'product testing', 'physiology', 'term paper'],
    requiredSignalGroups: [
      signal(
        'biomedical-professional-products',
        'biomedical cases, design constraints, testing, regulation, or term paper work',
        ['\\bbiomedical\\b', '\\bcase\\b', '\\bdesign constraint\\b', '\\bFDA\\b', '\\bpatent\\b', '\\bterm paper\\b'],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale BENG 100 biomedical engineering public-source benchmark: physiology, product testing, patents, FDA, homework, term paper, exams',
      lessons: [
        lesson('Week 1: Biomedical engineering translation', [
          section(
            'Biomedical engineering, physiology, product testing, patient perspective',
            'Explain how an engineering design choice translates into a biomedical use case.',
            'Case discussion on device testing and patient constraints.',
            'Homework case analysis',
          ),
        ]),
        lesson('Week 2: Patents, FDA, and regulation', [
          section(
            'Patents, FDA review, design constraints, safety and efficacy',
            'Evaluate how regulation changes the evidence needed for a biomedical product.',
            'Students map design evidence to FDA and patent questions.',
            'Term paper proposal and exam-style response',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-hst161-modern-medicine',
    courseFamily: 'Health sciences, genetics, and clinical translation',
    title: 'MIT HST.161 Molecular Biology and Genetics in Modern Medicine',
    sourceUrl: 'https://ocw.mit.edu/courses/hst-161-molecular-biology-and-genetics-in-modern-medicine-fall-2007/',
    publicInstructorNames: ['David Housman', 'Anne Giersch'],
    disciplineFamily: 'health-science',
    modality: 'health-science-translation',
    sourceArtifacts: ['syllabus', 'readings', 'lecture notes', 'assignments', 'exams'],
    primaryStudentWorkProducts: ['case analyses', 'genetics problem responses', 'exam answers'],
    assessmentArchitecture: ['assignments', 'exams'],
    supportAndOperationsModel: ['lecture notes', 'readings', 'medical translation cases'],
    mustPreserveSignals: [
      'molecular biology',
      'genetics',
      'genomics',
      'bioinformatics',
      'medicine',
      'patient perspective',
    ],
    requiredSignalGroups: [
      signal('medicine-translation-products', 'genetics, genomics, bioinformatics, medicine, or patient translation', [
        '\\bgenetics\\b',
        '\\bgenomics\\b',
        '\\bbioinformatics\\b',
        '\\bmedicine\\b',
        '\\bpatient\\b',
        '\\bclinical translation\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT HST.161 modern medicine public-source benchmark: molecular biology, genetics, genomics, bioinformatics, patient perspective, clinical translation',
      lessons: [
        lesson('Week 1: Genetics in modern medicine', [
          section(
            'Molecular biology, genetics, genomics, patient perspective',
            'Explain how genetic evidence changes a medical interpretation.',
            'Case analysis connecting molecular evidence to patient context.',
            'Genetics problem response',
          ),
        ]),
        lesson('Week 2: Bioinformatics and clinical translation', [
          section(
            'Bioinformatics, genomic data, clinical translation, limits of evidence',
            'Interpret a genomic data claim with a clinical limitation.',
            'Students compare data evidence and medical decision boundaries.',
            'Exam-style case analysis',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'harvard-cs50x-2026',
    courseFamily: 'Massive online/hybrid course operations',
    title: 'Harvard CS50x 2026',
    sourceUrl: 'https://cs50.harvard.edu/x/',
    publicInstructorNames: ['David J. Malan', 'CS50 course staff'],
    disciplineFamily: 'large-online-cs',
    modality: 'large-online-programming',
    sourceArtifacts: [
      'weeks',
      'problem sets',
      'final project',
      'CS50.ai',
      'Ed Discussion',
      'VS Code',
      'communities',
      'academic honesty',
      'staff',
      'certificate and credit pathways',
    ],
    primaryStudentWorkProducts: ['problem sets', 'programs', 'final project', 'submit/check workflow artifacts'],
    assessmentArchitecture: ['problem sets', 'labs', 'final project'],
    supportAndOperationsModel: [
      'CS50.ai',
      'Ed Discussion',
      'VS Code',
      'communities',
      'academic honesty',
      'submit/check workflow',
      'staff',
    ],
    mustPreserveSignals: ['problem sets', 'final project', 'VS Code', 'submit', 'check', 'academic honesty', 'support'],
    requiredSignalGroups: [
      signal(
        'cs50-large-course-operations',
        'onboarding, toolchain, support channels, academic honesty, submit/check workflow',
        [
          '\\bVS Code\\b',
          '\\bsubmit\\b',
          '\\bcheck\\b',
          '\\bacademic honesty\\b',
          '\\bEd Discussion\\b',
          '\\bsupport\\b',
        ],
        { dimension: 'courseOperations', scoreImpact: 7, severity: 'P1' },
      ),
      signal('cs50-work-products', 'problem sets, code, final project, and programs', [
        '\\bproblem set\\b',
        '\\bcode\\b',
        '\\bprogram\\b',
        '\\bfinal project\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Harvard CS50x public-source benchmark: problem sets, code, final project, VS Code, submit, check, Ed Discussion, CS50.ai, academic honesty',
      lessons: [
        lesson('Week 0: Onboarding, tools, and academic honesty', [
          section(
            'CS50x onboarding, VS Code, submit/check workflow, Ed Discussion, CS50.ai, academic honesty',
            'Set up the course toolchain and explain where support, submissions, and honesty rules live.',
            'Toolchain walkthrough, support-channel scenario, and submit/check practice.',
            'Setup checklist and academic honesty acknowledgment',
          ),
        ]),
        lesson('Week 1: C programming problem set', [
          section(
            'Code, C programming, problem set specification, tests, debugging',
            'Implement a program and use check-style feedback to debug it.',
            'Live coding, test run, edge-case review, and staff support note.',
            'Problem set code submission',
          ),
        ]),
        lesson('Week 2: Final project path', [
          section(
            'Final project idea, milestone planning, implementation, community support',
            'Plan a final project with milestones, support questions, and submit/check expectations.',
            'Project pitch and implementation-risk review.',
            'Final project proposal',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-7012-intro-biology',
    courseFamily: 'Biology lecture, recitation, problem sets, and optional lab',
    title: 'MIT 7.012 Introduction to Biology',
    sourceUrl: 'https://ocw.mit.edu/courses/7-012-introduction-to-biology-fall-2004/',
    publicInstructorNames: ['Claudette Gardel', 'Eric Lander', 'Robert Weinberg', 'Andrew Chess'],
    disciplineFamily: 'biology-life-science',
    modality: 'lecture-recitation-problem-set-lab',
    sourceArtifacts: [
      'syllabus',
      'calendar',
      'readings',
      'recitations',
      'assignments',
      'exams',
      'study materials',
      'video lectures',
    ],
    primaryStudentWorkProducts: [
      'graded problem sets',
      'quiz responses',
      'final exam responses',
      'recitation preparation',
      'voluntary lab observations',
    ],
    assessmentArchitecture: ['problem sets', 'quizzes', 'final exam'],
    supportAndOperationsModel: [
      'recitation sections',
      'tutors',
      'problem set due dates',
      'quiz review sessions',
      'late-work policy',
    ],
    mustPreserveSignals: [
      'biochemistry',
      'genetics',
      'molecular biology',
      'cell biology',
      'problem sets',
      'quizzes',
      'final exam',
      'recitation',
    ],
    requiredSignalGroups: [
      signal('biology-content-signals', 'biochemistry, genetics, molecular biology, cell biology, or genomics', [
        '\\bbiochemistry\\b',
        '\\bgenetics\\b',
        '\\bmolecular biology\\b',
        '\\bcell biology\\b',
        '\\bgene regulation\\b',
        '\\bprotein\\b',
        '\\bgenomics\\b',
      ]),
      signal('biology-work-products', 'problem sets, quizzes, final exam, recitations, or lab observations', [
        '\\bproblem set\\b',
        '\\bquiz\\b',
        '\\bfinal exam\\b',
        '\\brecitation\\b',
        '\\blab\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 7.012 Introduction to Biology public-source benchmark: biochemistry, genetics, molecular biology, cell biology, problem sets, quizzes, final exam, recitations, tutors, optional lab',
      lessons: [
        lesson('Week 1: Biochemistry and molecular evidence', [
          section(
            'Biochemistry, molecular structure, proteins, chemical foundations for biology',
            'Explain how molecular structure evidence supports a biological function claim.',
            'Lecture model, recitation problem comparison, and tutor-supported problem set review.',
            'Problem set response with molecular evidence rationale',
            'Biochemistry lecture notes, Freeman Biological Science reading, problem set 1 handout',
          ),
        ]),
        lesson('Week 2: Genetics and gene regulation', [
          section(
            'Genetics, gene regulation, DNA, transcription, inheritance',
            'Use genetic evidence to explain a phenotype or regulation pattern.',
            'Students analyze a genetics problem and compare quiz-style distractors.',
            'Quiz preparation item and graded problem set checkpoint',
            'Genetics lecture notes, recitation worksheet, quiz 1 review materials',
          ),
        ]),
        lesson('Week 3: Cells, immunology, and molecular medicine', [
          section(
            'Cell biology, immunology, genomics, molecular medicine, lab observation',
            'Connect cellular evidence to a molecular medicine or immunology decision.',
            'Recitation discussion, optional lab observation debrief, and final exam synthesis review.',
            'Final exam synthesis response',
            'Cell biology and immunology lecture notes, optional lab observation notes, final exam review materials',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'berkeley-cs61a-spring2026',
    courseFamily: 'Large introductory programming course',
    title: 'UC Berkeley CS 61A Spring 2026',
    sourceUrl: 'https://cs61a.org/',
    publicInstructorNames: ['Dan Garcia', 'Manuel A Sabin'],
    disciplineFamily: 'large-course-programming',
    modality: 'lecture-lab-discussion-project',
    sourceArtifacts: [
      'lectures',
      'syllabus',
      'Ed',
      'office hours',
      'extension requests',
      'regrade requests',
      'Gradescope',
      'sections',
      'Python Tutor',
      'code editors',
      'textbook',
      'staff pages',
    ],
    primaryStudentWorkProducts: [
      'homework code',
      'lab code',
      'projects',
      'quiz and exam responses',
      'oral exam explanations',
    ],
    assessmentArchitecture: ['homework', 'labs', 'projects', 'quizzes', 'exams', 'oral exams'],
    supportAndOperationsModel: [
      'Ed',
      'office hours',
      'office hours queue',
      'Gradescope',
      'sections',
      'Python Tutor',
      'code editors',
      'extensions',
      'regrades',
      'staff',
    ],
    mustPreserveSignals: [
      'Python',
      'Scheme',
      'homework',
      'labs',
      'projects',
      'office hours',
      'Gradescope',
      'Ed',
      'Python Tutor',
    ],
    requiredSignalGroups: [
      signal('cs61a-programming-products', 'homework, lab, project, code, Python, or Scheme work products', [
        '\\bhomework\\b',
        '\\blab\\b',
        '\\bproject\\b',
        '\\bcode\\b',
        '\\bPython\\b',
        '\\bScheme\\b',
      ]),
      signal(
        'cs61a-large-course-operations',
        'office hours, Ed, Gradescope, sections, Python Tutor, staff, extensions, or regrades',
        [
          '\\boffice hours\\b',
          '\\bEd\\b',
          '\\bGradescope\\b',
          '\\bsections?\\b',
          '\\bPython Tutor\\b',
          '\\bstaff\\b',
          '\\bextension\\b',
          '\\bregrade\\b',
        ],
        { dimension: 'courseOperations', scoreImpact: 7, severity: 'P1' },
      ),
    ],
    forbiddenSignals: [
      {
        id: 'cs61a-wet-lab-substitution',
        label: 'wet-lab or physical specimen language in programming course',
        patterns: ['\\bpipette\\b', '\\bspecimen\\b', '\\bwet lab\\b', '\\blab coat\\b'],
        severity: 'P1',
        scoreImpact: 8,
      },
    ],
    courseMap: makeCourseMap({
      courseName:
        'UC Berkeley CS 61A public-source benchmark: Python, Scheme, homework, labs, projects, quizzes, exams, oral exams, Ed, office hours, Gradescope, sections, Python Tutor, code editors',
      lessons: [
        lesson('Week 1: Python functions and course operations', [
          section(
            'Python functions, expressions, environments, Ed, office hours, Gradescope, Python Tutor',
            'Write Python functions and explain how to use course support, submission, and regrade channels.',
            'Live coding, Python Tutor trace, office-hours scenario, and Gradescope submission walkthrough.',
            'Homework code submission with support-channel reflection',
            'CS61A lectures, Python Tutor trace, Gradescope submission guide, office hours policy',
          ),
        ]),
        lesson('Week 2: Recursion and lab practice', [
          section(
            'Recursion, debugging, lab code, sections, staff feedback, extension requests',
            'Trace recursive code and decide when to use lab, discussion, or office-hours support.',
            'Pair trace, lab debugging, section discussion, and extension-policy case.',
            'Lab code checkpoint and quiz explanation',
            'CS61A lab worksheet, sections guide, office hours queue, extension request policy',
          ),
        ]),
        lesson('Week 3: Scheme project and oral exam explanation', [
          section(
            'Scheme, project design, abstraction, oral exam explanation, exam preparation',
            'Implement a Scheme project milestone and explain the design choices orally.',
            'Project planning, oral-exam rehearsal, staff feedback, and exam-style trace review.',
            'Project code milestone and oral exam explanation',
            'CS61A Scheme project specification, Ed logistics post, oral exam guide, Gradescope project submission',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-hist119-civil-war',
    courseFamily: 'History lecture, document analysis, papers, and discussion sections',
    title: 'Yale HIST 119 The Civil War and Reconstruction Era, 1845-1877',
    sourceUrl: 'https://oyc.yale.edu/history/hist-119',
    publicInstructorNames: ['David W. Blight'],
    disciplineFamily: 'history-primary-source-writing',
    modality: 'lecture-discussion-paper-exam',
    sourceArtifacts: [
      'about',
      'syllabus',
      'sessions',
      'texts',
      'document anthologies',
      'films',
      'papers',
      'final exam',
    ],
    primaryStudentWorkProducts: [
      '5-6 page papers',
      'document analysis',
      'discussion section participation',
      'final exam responses',
    ],
    assessmentArchitecture: ['two papers', 'final exam', 'discussion section attendance and participation'],
    supportAndOperationsModel: [
      'twice-weekly lectures',
      'discussion sections',
      'assigned texts',
      'document anthologies',
    ],
    mustPreserveSignals: [
      'Civil War',
      'Reconstruction',
      'slavery',
      'emancipation',
      'papers',
      'discussion section',
      'final exam',
      'documents',
    ],
    requiredSignalGroups: [
      signal('history-content-signals', 'Civil War, Reconstruction, slavery, emancipation, Union, or Confederacy', [
        '\\bCivil War\\b',
        '\\bReconstruction\\b',
        '\\bslavery\\b',
        '\\bemancipation\\b',
        '\\bUnion\\b',
        '\\bConfederacy\\b',
      ]),
      signal('history-work-products', 'papers, documents, discussion sections, and final exam responses', [
        '\\bpaper\\b',
        '\\bdocument\\b',
        '\\bdiscussion section\\b',
        '\\bfinal exam\\b',
        '\\bprimary source\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale HIST 119 Civil War and Reconstruction public-source benchmark: David W. Blight, slavery, emancipation, Union, Confederacy, Reconstruction, document anthologies, two papers, discussion section participation, final exam',
      lessons: [
        lesson('Week 1: Causes of the Civil War and document evidence', [
          section(
            'Union, disunion, slavery, sectional crisis, document anthology evidence',
            'Use a primary document to explain one cause of the Civil War.',
            'Lecture framing, document annotation, and discussion-section question drafting.',
            'Document analysis paragraph for Paper 1',
          ),
        ]),
        lesson('Week 2: Emancipation, total war, and historical argument', [
          section(
            'Emancipation, total war, Lincoln, race, military and social meanings',
            'Build a historical argument about emancipation using assigned texts and documents.',
            'Source comparison, thesis workshop, and paper evidence conference.',
            '5-6 page paper draft with document citations',
          ),
        ]),
        lesson('Week 3: Reconstruction and memory', [
          section(
            'Reconstruction, citizenship, race, redemption, Civil War memory',
            'Evaluate Reconstruction using evidence from lectures, texts, and final exam themes.',
            'Discussion section debate and final exam essay planning.',
            'Final exam essay outline',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-phys200-large-lecture',
    courseFamily: 'Quantitative large lecture',
    title: 'Yale PHYS 200 Fundamentals of Physics I',
    sourceUrl: 'https://oyc.yale.edu/physics/phys-200',
    publicInstructorNames: ['Ramamurti Shankar'],
    disciplineFamily: 'physics-lecture',
    modality: 'lecture-problem-set',
    sourceArtifacts: [
      'about',
      'syllabus',
      'sessions',
      'texts',
      'homework',
      'posted solutions',
      'midterm',
      'final exam',
    ],
    primaryStudentWorkProducts: ['homework problem sets', 'solutions', 'midterm responses', 'final exam responses'],
    assessmentArchitecture: ['homework', 'midterm', 'final exam'],
    supportAndOperationsModel: ['lecture sequence', 'homework cadence', 'posted solutions', 'exam preparation'],
    mustPreserveSignals: ['homework', 'problem sets', 'solutions', 'midterm', 'final exam', 'quantitative reasoning'],
    requiredSignalGroups: [
      signal('physics-large-lecture-products', 'homework, solutions, exams, and quantitative reasoning', [
        '\\bhomework\\b',
        '\\bproblem set\\b',
        '\\bsolution\\b',
        '\\bmidterm\\b',
        '\\bfinal exam\\b',
        '\\bcalculation\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale PHYS 200 large lecture public-source benchmark: quantitative physics, homework problem sets, posted solutions, midterm, final exam',
      lessons: [
        lesson('Week 1: Motion and problem-solving setup', [
          section(
            'Kinematics, equations of motion, diagrams, quantitative reasoning',
            'Solve a physics problem by choosing variables, equations, and units.',
            'Worked example followed by homework problem comparison.',
            'Homework problem set with solution rationale',
          ),
        ]),
        lesson('Week 2: Newton laws and exam practice', [
          section(
            'Newton laws, forces, free-body diagrams, midterm-style problems',
            'Use a free-body diagram to justify a force calculation.',
            'Lecture model, peer problem solving, posted-solution review.',
            'Midterm practice and final exam review item',
          ),
        ]),
      ],
    }),
  }),
];

export function sanitizeProfessorAdoptionManifest(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

export function getProfessorAdoptionManifest(id) {
  return PROFESSOR_ADOPTION_MANIFESTS.find((manifest) => manifest.id === id) || null;
}

export function selectProfessorAdoptionManifests({ profile = 'full', caseIds = [] } = {}) {
  const ids =
    Array.isArray(caseIds) && caseIds.length > 0
      ? caseIds
      : profile === 'smoke'
        ? PROFESSOR_ADOPTION_SMOKE_CASE_IDS
        : PROFESSOR_ADOPTION_MANIFESTS.map((manifest) => manifest.id);
  const missing = ids.filter((id) => !getProfessorAdoptionManifest(id));
  if (missing.length > 0) throw new Error(`Unknown professor-adoption case id(s): ${missing.join(', ')}`);
  return ids.map((id) => getProfessorAdoptionManifest(id));
}

export function validateProfessorAdoptionManifest(manifest) {
  const required = [
    'id',
    'title',
    'sourceUrl',
    'publicInstructorNames',
    'sourceArtifacts',
    'primaryStudentWorkProducts',
    'assessmentArchitecture',
    'mustPreserveSignals',
    'requiredSignalGroups',
    'courseMap',
  ];
  const missing = required.filter((key) => {
    const value = manifest?.[key];
    return Array.isArray(value) ? value.length === 0 : !value;
  });
  if (missing.length > 0) return { valid: false, blockers: missing.map((key) => `Missing ${key}`) };
  if (!Array.isArray(manifest.courseMap.lessons) || manifest.courseMap.lessons.length === 0) {
    return { valid: false, blockers: ['Manifest courseMap has no lessons'] };
  }
  return { valid: true, blockers: [] };
}
