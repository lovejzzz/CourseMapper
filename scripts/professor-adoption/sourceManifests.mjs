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
  sourceEvidenceUrls = [],
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
    sourceEvidenceUrls,
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
    sourceArtifacts: [
      'lecture videos',
      'instructor insights',
      'problem sets',
      'problem set solutions',
      'exams',
      'exam solutions',
    ],
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
    mustPreserveSignals: [
      'convergence',
      'sequences',
      'series',
      'continuity',
      'differentiability',
      'Riemann integral',
      'proofs',
    ],
    requiredSignalGroups: [
      signal(
        'proof-course-work-products',
        'sequences, convergence, continuity, differentiability, Riemann integral, functions, and proof tasks',
        [
          '\\bsequence\\b',
          '\\bconvergence\\b',
          '\\bcontinuity\\b',
          '\\bdifferentiability\\b',
          '\\bRiemann\\b',
          '\\bfunction\\b',
          '\\bproof\\b',
        ],
      ),
      signal('proof-rigor-criteria', 'proof rigor criteria', [
        '\\blogical implication\\b',
        '\\bquantifier\\b',
        '\\bproof strategy\\b',
        '\\bargument\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 18.100A Real Analysis public-source benchmark: convergence, sequences, series, continuity, differentiability, Riemann integral, rigorous proof writing',
      lessons: [
        lesson('Week 1: Real numbers, sequences, functions, and proof language', [
          section(
            'Real numbers, sequences, functions, quantifiers, logical implication',
            'Write a proof about a sequence or function without skipping assumptions.',
            'Sequence example unpacking and proof strategy comparison.',
            'Proof write-up with assumption checklist',
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
        lesson('Week 4: Differentiability and Riemann integration', [
          section(
            'Differentiability, Riemann integral, functions, limit operations',
            'Explain how differentiability or Riemann integrability depends on precise limiting arguments.',
            'Students compare proof outlines for differentiability and Riemann integral claims.',
            'Problem set proof with exam-style reflection',
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
    sourceEvidenceUrls: [
      'https://data8.org/fa25/staff/',
      'https://data8.org/fa25/syllabus/',
      'https://data8.org/fa25/schedule/',
    ],
    publicInstructorNames: ['Jeremy Sanchez'],
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
        patterns: [
          '\\bpipette\\b',
          '\\bwet lab\\b',
          '\\b(?:physical|biological|tissue|rock|mineral) specimens?\\b',
          '\\bchemical safety\\b',
        ],
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
    primaryStudentWorkProducts: [
      'activity assignments',
      'active communication practice',
      'vocabulary work',
      'language lab practice',
    ],
    assessmentArchitecture: ['assignments', 'language lab practice', 'oral and written checks'],
    supportAndOperationsModel: ['coordinated language lab', 'calendar', 'related resources'],
    mustPreserveSignals: [
      'active communication',
      'vocabulary',
      'grammatical concepts',
      'French',
      'culture',
      'language lab',
    ],
    requiredSignalGroups: [
      signal(
        'language-practice-products',
        'active communication, vocabulary, grammatical concepts, French language use, culture, or language lab work',
        [
          '\\bactive communication\\b',
          '\\bvocabulary\\b',
          '\\bgrammatical concept\\b',
          '\\bFrench\\b',
          '\\bculture\\b',
          '\\blanguage lab\\b',
        ],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT French I public-source benchmark: active communication, vocabulary, grammatical concepts, French language and culture, language lab',
      lessons: [
        lesson('Week 1: Greetings and classroom communication', [
          section(
            'French greetings, classroom phrases, active communication, vocabulary',
            'Use target-language greetings and classroom requests in French.',
            'Paired communication rehearsal, vocabulary feedback, and language lab check.',
            'Activity assignment and vocabulary check',
          ),
        ]),
        lesson('Week 2: Describing people and routines', [
          section(
            'Vocabulary, grammatical concepts, present tense, cultural comparison',
            'Describe a routine in French and respond to a partner question.',
            'Language lab practice and guided grammatical-concept noticing.',
            'Language lab activity assignment',
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
    sourceEvidenceUrls: ['https://cs61a.org/instructor'],
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
  manifest({
    id: 'mit-5111sc-chemical-science',
    courseFamily: 'Chemistry lecture, problem sets, exams, and molecular reasoning',
    title: 'MIT 5.111SC Principles of Chemical Science',
    sourceUrl: 'https://ocw.mit.edu/courses/5-111sc-principles-of-chemical-science-fall-2014/',
    publicInstructorNames: ['Catherine Drennan'],
    disciplineFamily: 'chemistry-physical-organic-inorganic',
    modality: 'lecture-problem-set-exam',
    sourceArtifacts: [
      'syllabus',
      'lecture videos',
      'lecture notes',
      'problem sets',
      'problem set solutions',
      'exams',
      'exam solutions',
      'instructor insights',
    ],
    primaryStudentWorkProducts: [
      'problem sets',
      'molecular explanations',
      'equilibrium calculations',
      'exam responses',
    ],
    assessmentArchitecture: ['problem sets', 'exams', 'exam solutions'],
    supportAndOperationsModel: ['self-paced sequence', 'problem set solution review', 'exam preparation'],
    mustPreserveSignals: [
      'electronic structure',
      'thermodynamics',
      'acid-base',
      'redox',
      'kinetics',
      'catalysis',
      'problem sets',
      'exams',
    ],
    requiredSignalGroups: [
      signal(
        'chemistry-content-signals',
        'electronic structure, thermodynamics, acid-base, redox, kinetics, or catalysis',
        [
          '\\belectronic structure\\b',
          '\\bthermodynamics\\b',
          '\\bacid[-\\s]?base\\b',
          '\\bredox\\b',
          '\\bkinetics\\b',
          '\\bcatalysis\\b',
        ],
      ),
      signal('chemistry-work-products', 'problem sets, molecular explanations, calculations, exams, or solutions', [
        '\\bproblem set\\b',
        '\\bmolecular\\b',
        '\\bcalculation\\b',
        '\\bexam\\b',
        '\\bsolution\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 5.111SC Principles of Chemical Science public-source benchmark: electronic structure, thermodynamics, acid-base and redox equilibria, kinetics, catalysis, problem sets, exams, solutions',
      lessons: [
        lesson('Week 1: Electronic structure and molecular shape', [
          section(
            'Electronic structure, orbitals, bonding, molecular geometry',
            'Use electronic structure to explain why a molecule has a particular three-dimensional shape.',
            'Lecture-video analysis, molecular model comparison, and problem set solution critique.',
            'Problem set explanation with molecular structure evidence',
            '5.111SC electronic structure lecture notes, molecular geometry video, problem set solution key',
          ),
        ]),
        lesson('Week 2: Thermodynamics and equilibria', [
          section(
            'Thermodynamics, acid-base equilibrium, redox equilibrium, chemical systems',
            'Calculate an equilibrium condition and explain the thermodynamic reason for the direction of change.',
            'Students solve an acid-base calculation, compare a redox setup, and annotate one solution path.',
            'Equilibrium calculation and exam-style rationale',
            'Thermodynamics notes, acid-base problem set, redox exam review problems',
          ),
        ]),
        lesson('Week 3: Kinetics and catalysis', [
          section(
            'Chemical kinetics, reaction rates, catalysis, biological and environmental applications',
            'Interpret rate evidence and explain how a catalyst changes a reaction pathway.',
            'Rate-law worked example followed by catalysis case discussion.',
            'Kinetics problem set and catalysis short answer',
            'Kinetics lecture video, catalysis lecture notes, exam solution examples',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-1401-microeconomics',
    courseFamily: 'Economics lecture, problem sets, and exams',
    title: 'MIT 14.01 Principles of Microeconomics',
    sourceUrl: 'https://ocw.mit.edu/courses/14-01-principles-of-microeconomics-fall-2023/',
    publicInstructorNames: ['Jonathan Gruber'],
    disciplineFamily: 'economics-quantitative-social-science',
    modality: 'lecture-problem-set-exam',
    sourceArtifacts: [
      'syllabus',
      'lecture notes',
      'lecture videos',
      'instructor insights',
      'problem sets',
      'problem set solutions',
      'exams',
      'exam solutions',
    ],
    primaryStudentWorkProducts: ['problem sets', 'graphs', 'economic model explanations', 'exam responses'],
    assessmentArchitecture: ['problem sets', 'exams', 'exam solutions'],
    supportAndOperationsModel: ['lecture sequence', 'problem set solution review', 'exam review cadence'],
    mustPreserveSignals: [
      'supply and demand',
      'market equilibrium',
      'consumer theory',
      'firms',
      'monopoly',
      'externalities',
      'problem sets',
    ],
    requiredSignalGroups: [
      signal(
        'microeconomics-content-signals',
        'supply and demand, equilibrium, consumer theory, firms, monopoly, or externalities',
        [
          '\\bsupply and demand\\b',
          '\\bequilibrium\\b',
          '\\bconsumer theory\\b',
          '\\bfirms?\\b',
          '\\bmonopoly\\b',
          '\\bexternalit(?:y|ies)\\b',
        ],
      ),
      signal('microeconomics-work-products', 'problem sets, diagrams, graphs, model explanations, or exams', [
        '\\bproblem set\\b',
        '\\bdiagram\\b',
        '\\bgraph\\b',
        '\\bmodel\\b',
        '\\bexam\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 14.01 Principles of Microeconomics public-source benchmark: supply and demand, market equilibrium, consumer theory, firms, monopoly, externalities, problem sets, exams, solutions',
      lessons: [
        lesson('Week 1: Supply, demand, and equilibrium', [
          section(
            'Supply and demand, market equilibrium, comparative statics, surplus',
            'Use a graph to predict how a market changes after a demand or supply shock.',
            'Instructor graph model, peer diagram check, and problem set solution comparison.',
            'Problem set graph with economic explanation',
            '14.01 lecture notes on supply and demand, problem set solution, exam graph item',
          ),
        ]),
        lesson('Week 2: Consumer and firm decisions', [
          section(
            'Consumer theory, budget constraints, production, costs, firm behavior',
            'Explain a consumer or firm decision using the relevant microeconomic model.',
            'Students compare two model assumptions and solve a cost-curve exercise.',
            'Model explanation and calculation checkpoint',
            'Consumer theory lecture video, firm behavior notes, problem set cost exercise',
          ),
        ]),
        lesson('Week 3: Market power and policy', [
          section(
            'Monopoly, oligopoly, welfare economics, public goods, externalities',
            'Evaluate a policy intervention by comparing welfare before and after the market failure.',
            'Policy case discussion with graph annotation and exam-style short answer.',
            'Externalities exam response with welfare diagram',
            'Monopoly lecture notes, public goods problem set, exam solution on externalities',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-psyc110-intro-psychology',
    courseFamily: 'Psychology lecture, reading responses, experiments, and exams',
    title: 'Yale PSYC 110 Introduction to Psychology',
    sourceUrl: 'https://oyc.yale.edu/introduction-psychology/psyc-110',
    publicInstructorNames: ['Paul Bloom'],
    disciplineFamily: 'psychology-cognitive-social-science',
    modality: 'lecture-reading-response-exam',
    sourceArtifacts: ['about', 'syllabus', 'sessions', 'texts', 'reading responses', 'book review', 'exams'],
    primaryStudentWorkProducts: ['reading responses', 'book review', 'experimental participation', 'exam responses'],
    assessmentArchitecture: ['reading responses', 'book review', 'midterm examination', 'final examination'],
    supportAndOperationsModel: [
      'lecture sequence',
      'sample exams',
      'course website',
      'experimental participation routine',
    ],
    mustPreserveSignals: [
      'perception',
      'learning',
      'memory',
      'decision-making',
      'development',
      'brain',
      'reading responses',
      'book review',
      'experiments',
    ],
    requiredSignalGroups: [
      signal(
        'psychology-content-signals',
        'perception, learning, memory, decision-making, development, or brain evidence',
        [
          '\\bperception\\b',
          '\\blearning\\b',
          '\\bmemory\\b',
          '\\bdecision[-\\s]?making\\b',
          '\\bdevelopment\\b',
          '\\bbrain\\b',
        ],
      ),
      signal(
        'psychology-work-products',
        'reading responses, book review, experimental participation, midterm, or final exam',
        [
          '\\breading response\\b',
          '\\bbook review\\b',
          '\\bexperiment(?:al)? participation\\b',
          '\\bmidterm\\b',
          '\\bfinal exam\\b',
        ],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale PSYC 110 Introduction to Psychology public-source benchmark: perception, learning, memory, decision-making, development, brain, reading responses, book review, experimental participation, midterm, final exam',
      lessons: [
        lesson('Week 1: Brain, development, and psychological evidence', [
          section(
            'Brain, development, thought, behavior, scientific psychology',
            'Explain how psychological evidence links a behavior claim to development or brain function.',
            'Lecture analysis followed by short reading-response planning.',
            'Reading response with evidence claim',
            'PSYC 110 lecture sessions on brain and development, Gray psychology reading, reading response instructions',
          ),
        ]),
        lesson('Week 2: Perception, language, and memory', [
          section(
            'Perception, language, memory, communication, experimental evidence',
            'Compare two explanations for a perception or memory finding using experiment evidence.',
            'Students annotate a sample exam item and connect it to a reading response.',
            'Midterm-style response and experimental participation reflection',
            'Perception lecture session, memory lecture session, sample midterm materials',
          ),
        ]),
        lesson('Week 3: Social life, morality, and mental illness', [
          section(
            'Decision-making, morality, emotion, mental illness, individual differences',
            'Use psychological concepts to analyze a book-review claim about behavior.',
            'Book review workshop with concept-evidence map and final exam planning.',
            'Book review thesis and final exam outline',
            'Morality lecture session, mental illness lecture session, book review requirements',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-18650-statistics-applications',
    courseFamily: 'Statistics theory, problem sets, and applications',
    title: 'MIT 18.650 Statistics for Applications',
    sourceUrl: 'https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/',
    publicInstructorNames: ['Philippe Rigollet'],
    disciplineFamily: 'statistics-applications',
    modality: 'lecture-problem-set',
    sourceArtifacts: ['syllabus', 'lecture slides', 'lecture videos', 'assignments', 'problem sets'],
    primaryStudentWorkProducts: [
      'problem sets',
      'statistical derivations',
      'data-fitting analyses',
      'estimation arguments',
    ],
    assessmentArchitecture: ['assignments', 'problem sets'],
    supportAndOperationsModel: ['lecture slide sequence', 'video lectures', 'assignment cadence'],
    mustPreserveSignals: [
      'statistical methods',
      'probability',
      'estimation',
      'confidence intervals',
      'hypothesis testing',
      'regression',
      'problem sets',
    ],
    requiredSignalGroups: [
      signal(
        'statistics-content-signals',
        'probability, estimation, confidence intervals, hypothesis testing, regression, or statistical methods',
        [
          '\\bprobability\\b',
          '\\bestimation\\b',
          '\\bconfidence interval\\b',
          '\\bhypothesis test\\b',
          '\\bregression\\b',
          '\\bstatistical method\\b',
        ],
      ),
      signal('statistics-work-products', 'problem sets, derivations, data-fitting analyses, or estimation arguments', [
        '\\bproblem set\\b',
        '\\bderivation\\b',
        '\\bdata[-\\s]?fitting\\b',
        '\\bestimat(?:e|ion)\\b',
        '\\bargument\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 18.650 Statistics for Applications public-source benchmark: probability, estimation, confidence intervals, hypothesis testing, regression, nonparametric data fitting, problem sets',
      lessons: [
        lesson('Week 1: Estimation and uncertainty', [
          section(
            'Probability models, estimators, bias, variance, confidence intervals',
            'Construct an estimator and explain its uncertainty with a confidence interval.',
            'Lecture-slide walkthrough, derivation check, and problem set comparison.',
            'Problem set derivation with estimation argument',
            '18.650 lecture slides on estimation, video lecture, assignment problem on confidence intervals',
          ),
        ]),
        lesson('Week 2: Hypothesis testing and decisions', [
          section(
            'Hypothesis testing, p-values, error rates, decision rules',
            'Choose a test and justify what the result can and cannot conclude.',
            'Students compare two decision rules and audit one statistical claim.',
            'Hypothesis test problem set response',
            'Hypothesis testing lecture slides, video lecture, assignment solution outline',
          ),
        ]),
        lesson('Week 3: Regression and applications', [
          section(
            'Regression, nonparametric regression, data fitting, model assumptions',
            'Fit a statistical model and evaluate whether the assumptions support the inference.',
            'Data-fitting example followed by assumption critique.',
            'Regression analysis with model limitation note',
            'Regression lecture slides, nonparametric data fitting example, assignment problem set',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-phil176-death',
    courseFamily: 'Philosophy lecture, discussion sections, and short papers',
    title: 'Yale PHIL 176 Death',
    sourceUrl: 'https://oyc.yale.edu/death/phil-176',
    publicInstructorNames: ['Shelly Kagan'],
    disciplineFamily: 'philosophy-ethics-writing',
    modality: 'lecture-discussion-paper',
    sourceArtifacts: ['about', 'syllabus', 'sessions', 'texts', 'discussion sections', 'short papers'],
    primaryStudentWorkProducts: ['short papers', 'philosophical arguments', 'discussion participation'],
    assessmentArchitecture: ['discussion section attendance and participation', 'three short papers'],
    supportAndOperationsModel: ['lecture sequence', 'discussion sections', 'paper revision opportunities'],
    mustPreserveSignals: [
      'personal identity',
      'immortality',
      'death',
      'suicide',
      'morality',
      'discussion section',
      'short papers',
    ],
    requiredSignalGroups: [
      signal(
        'philosophy-death-content',
        'personal identity, immortality, death, suicide, morality, or philosophical argument',
        [
          '\\bpersonal identity\\b',
          '\\bimmortality\\b',
          '\\bdeath\\b',
          '\\bsuicide\\b',
          '\\bmoral(?:ity)?\\b',
          '\\bphilosophical argument\\b',
        ],
      ),
      signal('philosophy-paper-products', 'short papers, arguments, textual evidence, and discussion sections', [
        '\\bshort paper\\b',
        '\\bargument\\b',
        '\\btextual evidence\\b',
        '\\bdiscussion section\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale PHIL 176 Death public-source benchmark: Shelly Kagan, personal identity, immortality, nature and badness of death, suicide, discussion sections, three short papers',
      lessons: [
        lesson('Week 1: Persons, souls, and personal identity', [
          section(
            'Dualism, physicalism, personal identity, soul theory, body theory',
            'Build a philosophical argument about whether personal identity depends on a soul, body, or personality.',
            'Lecture argument map, text comparison, and discussion-section question drafting.',
            'Short paper argument outline',
            'PHIL 176 sessions on persons and personal identity, Plato Phaedo reading, discussion section prompt',
          ),
        ]),
        lesson('Week 2: Death, immortality, and value', [
          section(
            'Nature of death, badness of death, immortality, value of life',
            'Evaluate whether death is bad by comparing deprivation and immortality arguments.',
            'Argument reconstruction followed by paper revision conference.',
            'Short paper draft with objection and reply',
            'Death lecture sessions, Nagel Death reading, Williams Makropulos case reading',
          ),
        ]),
        lesson('Week 3: Suicide and moral judgment', [
          section(
            'Rationality of suicide, morality of suicide, uncertainty, course conclusion',
            'Analyze a suicide argument with attention to rationality, morality, and uncertainty.',
            'Discussion-section debate and final paper evidence check.',
            'Final short paper revision memo',
            'Suicide lecture sessions, Hume On Suicide reading, paper grading criteria',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'yale-plsc114-political-philosophy',
    courseFamily: 'Political philosophy lecture, sections, papers, and final exam',
    title: 'Yale PLSC 114 Introduction to Political Philosophy',
    sourceUrl: 'https://oyc.yale.edu/political-science/plsc-114',
    publicInstructorNames: ['Steven B. Smith'],
    disciplineFamily: 'political-philosophy-writing',
    modality: 'lecture-discussion-paper-exam',
    sourceArtifacts: ['about', 'syllabus', 'sessions', 'texts', 'short papers', 'final exam', 'discussion sections'],
    primaryStudentWorkProducts: ['short papers', 'discussion participation', 'final exam essays'],
    assessmentArchitecture: [
      'three short papers',
      'final examination',
      'discussion section attendance and participation',
    ],
    supportAndOperationsModel: ['lecture sequence', 'weekly discussion sections', 'paper preparation'],
    mustPreserveSignals: [
      'Plato',
      'Aristotle',
      'Machiavelli',
      'Hobbes',
      'Locke',
      'Rousseau',
      'short papers',
      'final exam',
    ],
    requiredSignalGroups: [
      signal('political-philosophy-content', 'Plato, Aristotle, Machiavelli, Hobbes, Locke, Rousseau, or Tocqueville', [
        '\\bPlato\\b',
        '\\bAristotle\\b',
        '\\bMachiavelli\\b',
        '\\bHobbes\\b',
        '\\bLocke\\b',
        '\\bRousseau\\b',
        '\\bTocqueville\\b',
      ]),
      signal(
        'political-philosophy-work-products',
        'short papers, discussion sections, final exam, and textual argument',
        ['\\bshort paper\\b', '\\bdiscussion section\\b', '\\bfinal exam\\b', '\\bargument\\b'],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'Yale PLSC 114 Introduction to Political Philosophy public-source benchmark: Plato, Aristotle, Machiavelli, Hobbes, Locke, Rousseau, Tocqueville, short papers, discussion sections, final exam',
      lessons: [
        lesson('Week 1: The polis and Socratic citizenship', [
          section(
            'Plato, Socrates, citizenship, polis, political philosophy',
            'Use a Platonic text to define a political-philosophy problem about citizenship.',
            'Text discussion, passage annotation, and section-question workshop.',
            'Short paper passage analysis',
            'PLSC 114 Plato sessions, Trial and Death of Socrates reading, paper prompt',
          ),
        ]),
        lesson('Week 2: Sovereignty, law, and consent', [
          section(
            'Machiavelli, Hobbes, Locke, sovereignty, law, constitutional government',
            'Compare two theories of political authority using textual evidence.',
            'Seminar debate with argument map and counterclaim check.',
            'Short paper comparative argument',
            'Machiavelli session, Hobbes Leviathan reading, Locke Second Treatise reading',
          ),
        ]),
        lesson('Week 3: Democracy and modern political life', [
          section(
            'Rousseau, Tocqueville, democracy, institutions, ways of life',
            'Explain how a theory of democracy shapes institutions and civic life.',
            'Discussion-section synthesis and final exam essay planning.',
            'Final exam essay outline',
            'Rousseau political writings, Tocqueville Democracy in America reading, final exam review',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-2009-product-engineering',
    courseFamily: 'Engineering design studio and product prototype teams',
    title: 'MIT 2.009 Product Engineering Process',
    sourceUrl: 'https://ocw.mit.edu/courses/2-009-product-engineering-process-fall-2021/',
    publicInstructorNames: ['David Wallace'],
    disciplineFamily: 'engineering-design-studio',
    modality: 'large-team-design-prototype',
    sourceArtifacts: ['lecture notes', 'image gallery', 'projects with examples', 'design process examples'],
    primaryStudentWorkProducts: ['sketch models', 'spreadsheets', 'geometric models', 'mockups', 'alpha prototypes'],
    assessmentArchitecture: ['team milestones', 'design reviews', 'prototype demonstrations', 'final presentation'],
    supportAndOperationsModel: [
      'large teams',
      'team roles',
      'consensus building',
      'design reviews',
      'live audience presentation',
    ],
    mustPreserveSignals: [
      'product opportunities',
      'design alternatives',
      'sketch models',
      'mockups',
      'prototypes',
      'large teams',
      'presentation',
    ],
    requiredSignalGroups: [
      signal(
        'product-engineering-products',
        'sketch models, mockups, prototypes, design alternatives, or product opportunities',
        [
          '\\bsketch model\\b',
          '\\bmockup\\b',
          '\\bprototype\\b',
          '\\bdesign alternative\\b',
          '\\bproduct opportunit(?:y|ies)\\b',
        ],
      ),
      signal(
        'product-engineering-operations',
        'large teams, team roles, consensus, design reviews, or final presentation operations',
        ['\\blarge team\\b', '\\bteam role\\b', '\\bconsensus\\b', '\\bdesign review\\b', '\\bfinal presentation\\b'],
        { dimension: 'courseOperations', scoreImpact: 7, severity: 'P1' },
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 2.009 Product Engineering Process public-source benchmark: large teams, product opportunities, design alternatives, sketch models, spreadsheets, geometric models, mockups, alpha prototypes, design reviews, final presentation',
      lessons: [
        lesson('Week 1: Opportunity framing and team roles', [
          section(
            'Product opportunities, user needs, team roles, consensus building',
            'Frame a product opportunity and assign team roles that support a design process.',
            'Opportunity scan, role negotiation, and design-review criteria setup.',
            'Team opportunity brief and role map',
            '2.009 lecture notes on product opportunities, team-role guidance, project example gallery',
          ),
        ]),
        lesson('Week 2: Models, mockups, and design alternatives', [
          section(
            'Sketch models, spreadsheets, geometric models, mockups, design alternatives',
            'Compare design alternatives using models that make tradeoffs visible.',
            'Sketch model build, spreadsheet estimate, and peer critique of mockups.',
            'Design alternative matrix with prototype evidence',
            '2.009 model examples, mockup image gallery, design review notes',
          ),
        ]),
        lesson('Week 3: Alpha prototype and final presentation', [
          section(
            'Alpha prototypes, working product models, presentation media, live audience',
            'Demonstrate a working alpha prototype and explain the evidence behind design decisions.',
            'Prototype rehearsal, failure-mode review, and live presentation storyboard.',
            'Prototype demonstration and final presentation deck',
            '2.009 project examples, prototype documentation, final presentation expectations',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-24235j-philosophy-law',
    courseFamily: 'Law and political philosophy writing seminar',
    title: 'MIT 24.235J Philosophy of Law',
    sourceUrl: 'https://ocw.mit.edu/courses/24-235j-philosophy-of-law-spring-2012/',
    publicInstructorNames: ['Julia Markovits', 'Jennifer Carr'],
    disciplineFamily: 'law-policy-philosophy-writing',
    modality: 'seminar-written-assignments',
    sourceArtifacts: ['syllabus', 'readings', 'written assignments with examples'],
    primaryStudentWorkProducts: ['legal-philosophy essays', 'case arguments', 'interpretation analyses'],
    assessmentArchitecture: ['written assignments', 'essay examples'],
    supportAndOperationsModel: ['reading sequence', 'argument-focused writing assignments', 'example papers'],
    mustPreserveSignals: [
      'law',
      'morality',
      'legal interpretation',
      'obligation',
      'punishment',
      'responsibility',
      'liberty',
      'legal ethics',
    ],
    requiredSignalGroups: [
      signal(
        'philosophy-law-content',
        'law, morality, legal interpretation, obligation, punishment, responsibility, liberty, or legal ethics',
        [
          '\\blaw\\b',
          '\\bmorality\\b',
          '\\blegal interpretation\\b',
          '\\bobligation\\b',
          '\\bpunishment\\b',
          '\\bresponsibility\\b',
          '\\bliberty\\b',
          '\\blegal ethics\\b',
        ],
      ),
      signal(
        'philosophy-law-work-products',
        'written assignments, essays, case arguments, and interpretation analyses',
        ['\\bwritten assignment\\b', '\\bessay\\b', '\\bcase argument\\b', '\\binterpretation\\b'],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 24.235J Philosophy of Law public-source benchmark: nature of law, morality, legal interpretation, obligation, punishment, responsibility, liberty, legal ethics, written assignments with examples',
      lessons: [
        lesson('Week 1: Nature of law and morality', [
          section(
            'Nature of law, morality, obligation to obey the law',
            'Use a legal-philosophy argument to explain whether law depends on morality.',
            'Reading discussion, argument reconstruction, and written-assignment example review.',
            'Written assignment thesis with objection',
            'Philosophy of Law syllabus, readings on law and morality, written assignment example',
          ),
        ]),
        lesson('Week 2: Interpretation and legal reasoning', [
          section(
            'Legal interpretation, theories of interpretation, case argument',
            'Analyze a legal interpretation problem and defend the reasoning standard used.',
            'Case argument workshop with peer critique of interpretive assumptions.',
            'Interpretation analysis essay paragraph',
            'Legal interpretation readings, case argument example, assignment criteria',
          ),
        ]),
        lesson('Week 3: Punishment, liberty, and ethics', [
          section(
            'Punishment, responsibility, liberty, legal ethics',
            'Evaluate a punishment or liberty claim using responsibility and ethics concepts.',
            'Ethics debate, counterargument map, and essay revision conference.',
            'Legal ethics essay revision memo',
            'Punishment readings, liberty readings, written assignment with example response',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-15501-accounting',
    courseFamily: 'Business accounting lecture, problem sets, and exams',
    title: 'MIT 15.501 Introduction to Financial and Managerial Accounting',
    sourceUrl: 'https://ocw.mit.edu/courses/15-501-introduction-to-financial-and-managerial-accounting-spring-2004/',
    publicInstructorNames: ['Sugata Roychowdhury'],
    disciplineFamily: 'business-accounting',
    modality: 'lecture-problem-set-exam',
    sourceArtifacts: ['syllabus', 'lecture notes', 'problem sets', 'problem set solutions', 'exams', 'exam solutions'],
    primaryStudentWorkProducts: [
      'problem sets',
      'financial statement analyses',
      'managerial reports',
      'exam responses',
    ],
    assessmentArchitecture: ['problem sets', 'exams', 'exam solutions'],
    supportAndOperationsModel: ['lecture sequence', 'problem set solution review', 'exam preparation'],
    mustPreserveSignals: [
      'financial accounting',
      'managerial accounting',
      'financial statements',
      'reports',
      'problem sets',
      'exams',
    ],
    requiredSignalGroups: [
      signal(
        'accounting-content-signals',
        'financial accounting, managerial accounting, financial statements, reports, or accounting readers',
        [
          '\\bfinancial accounting\\b',
          '\\bmanagerial accounting\\b',
          '\\bfinancial statement\\b',
          '\\breport\\b',
          '\\baccounting\\b',
        ],
      ),
      signal('accounting-work-products', 'problem sets, statement analyses, managerial reports, or exam responses', [
        '\\bproblem set\\b',
        '\\bstatement analysis\\b',
        '\\bmanagerial report\\b',
        '\\bexam\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 15.501 Introduction to Financial and Managerial Accounting public-source benchmark: financial accounting, managerial accounting, financial statements, managerial reports, lecture notes, problem sets, exams, solutions',
      lessons: [
        lesson('Week 1: Financial statements and exchange of resources', [
          section(
            'Financial accounting, financial statements, assets, liabilities, equity',
            'Read a financial statement and explain how accounting supports resource exchange.',
            'Lecture-note diagram analysis and problem set statement classification.',
            'Problem set financial statement analysis',
            '15.501 lecture 1 diagram, financial accounting notes, problem set solution',
          ),
        ]),
        lesson('Week 2: Accruals and performance measurement', [
          section(
            'Accrual accounting, revenue, expenses, performance reports',
            'Use accrual logic to explain why accounting income differs from cash movement.',
            'Worked accounting entries followed by exam-style correction exercise.',
            'Accounting entries problem set and exam rationale',
            'Accrual lecture notes, problem set entries, exam solution key',
          ),
        ]),
        lesson('Week 3: Managerial accounting and control', [
          section(
            'Managerial accounting, cost behavior, internal reports, control decisions',
            'Prepare a managerial report that supports a business control decision.',
            'Cost report workshop with peer review of decision implications.',
            'Managerial report and problem set calculation',
            'Managerial accounting lecture notes, cost problem set, exam review problem',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-4301-visual-arts',
    courseFamily: 'Studio art, critique, and project examples',
    title: 'MIT 4.301 Introduction to the Visual Arts',
    sourceUrl: 'https://ocw.mit.edu/courses/4-301-introduction-to-the-visual-arts-spring-2007/',
    publicInstructorNames: ['Joe Zane'],
    disciplineFamily: 'studio-art-visual-practice',
    modality: 'studio-project-critique',
    sourceArtifacts: ['syllabus', 'lecture videos', 'image gallery', 'projects with examples'],
    primaryStudentWorkProducts: ['video pieces', 'sculpture work', 'public-space projects', 'artist statements'],
    assessmentArchitecture: ['studio projects', 'project examples', 'critique participation'],
    supportAndOperationsModel: [
      'studio practice',
      'critique sequence',
      'image documentation',
      'public art project presentation',
    ],
    mustPreserveSignals: [
      'visual language',
      'contemporary art',
      'video',
      'sculpture',
      'public space',
      'projects',
      'critique',
    ],
    requiredSignalGroups: [
      signal(
        'visual-arts-content-signals',
        'visual language, contemporary art, video, sculpture, public space, or real/unreal practice',
        [
          '\\bvisual language\\b',
          '\\bcontemporary art\\b',
          '\\bvideo\\b',
          '\\bsculpture\\b',
          '\\bpublic space\\b',
          '\\breal\\/unreal\\b',
        ],
      ),
      signal(
        'visual-arts-work-products',
        'studio projects, image documentation, critique, artist statements, or project examples',
        [
          '\\bstudio project\\b',
          '\\bimage documentation\\b',
          '\\bcritique\\b',
          '\\bartist statement\\b',
          '\\bproject example\\b',
        ],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 4.301 Introduction to the Visual Arts public-source benchmark: visual language, contemporary art practices, video, sculpture, public space, projects with examples, image gallery, critique',
      lessons: [
        lesson('Week 1: Visual language and contemporary practice', [
          section(
            'Visual language, contemporary art, artistic practice, seeing and meaning',
            'Use visual-language vocabulary to explain how an artwork makes meaning.',
            'Image-gallery observation, visual vocabulary discussion, and critique protocol setup.',
            'Artist statement draft with visual evidence',
            '4.301 lecture video, image gallery, visual language project example',
          ),
        ]),
        lesson('Week 2: Video, sculpture, and the real/unreal', [
          section(
            'Video, sculpture, real/unreal, material choices, installation context',
            'Develop a project concept that uses medium and context to question the real/unreal boundary.',
            'Studio experiment with video or sculpture followed by peer critique.',
            'Studio project proposal and process documentation',
            '4.301 video project example, sculpture project example, critique notes',
          ),
        ]),
        lesson('Week 3: Public space and final project documentation', [
          section(
            'Public space, performance, audience, documentation, critique',
            'Present a public-space project with documentation that supports the artistic intent.',
            'Public art rehearsal, image documentation review, and final critique.',
            'Final project documentation and critique reflection',
            '4.301 public art image gallery, project example, final critique prompt',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-21m011-western-music',
    courseFamily: 'Music history, listening, written, media, and presentation assignments',
    title: 'MIT 21M.011 Introduction to Western Music',
    sourceUrl: 'https://ocw.mit.edu/courses/21m-011-introduction-to-western-music-fall-2024/',
    publicInstructorNames: ['Teresa M. Neff', 'Michael Goetjen'],
    disciplineFamily: 'music-history-listening',
    modality: 'listening-writing-presentation',
    sourceArtifacts: [
      'readings',
      'written assignments',
      'media assignments',
      'editable files',
      'presentation assignments',
    ],
    primaryStudentWorkProducts: ['listening analyses', 'written assignments', 'media assignments', 'presentations'],
    assessmentArchitecture: ['written assignments', 'media assignments', 'presentation assignments'],
    supportAndOperationsModel: [
      'listening sequence',
      'repertoire history',
      'assignment files',
      'presentation workflow',
    ],
    mustPreserveSignals: [
      'Western classical music',
      'plainchant',
      'concert music',
      'opera',
      'composers',
      'listening',
      'presentation',
    ],
    requiredSignalGroups: [
      signal(
        'western-music-content',
        'Western classical music, plainchant, opera, concert music, composers, or repertoire history',
        [
          '\\bWestern classical music\\b',
          '\\bplainchant\\b',
          '\\bopera\\b',
          '\\bconcert music\\b',
          '\\bcomposer\\b',
          '\\brepertoire\\b',
        ],
      ),
      signal('music-work-products', 'listening analysis, written assignments, media assignments, or presentations', [
        '\\blistening analysis\\b',
        '\\bwritten assignment\\b',
        '\\bmedia assignment\\b',
        '\\bpresentation\\b',
      ]),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 21M.011 Introduction to Western Music public-source benchmark: Western classical music, plainchant, concert music, opera, composers, listening analysis, written assignments, media assignments, presentation assignments',
      lessons: [
        lesson('Week 1: Notation, plainchant, and listening method', [
          section(
            'Western classical music, plainchant, notation, listening vocabulary',
            'Write a listening analysis that connects musical evidence to historical context.',
            'Guided listening, notation cue identification, and assignment file walkthrough.',
            'Listening analysis written assignment',
            '21M.011 readings on early notation, plainchant listening example, written assignment file',
          ),
        ]),
        lesson('Week 2: Form, repertoire, and composers', [
          section(
            'Repertoire history, composers, concert music, style, form',
            'Compare two repertoire examples using form, style, and historical evidence.',
            'Listening comparison, media annotation, and peer response.',
            'Media assignment with annotated listening notes',
            '21M.011 repertoire readings, concert music listening example, media assignment template',
          ),
        ]),
        lesson('Week 3: Opera and contemporary concert music', [
          section(
            'Opera, contemporary composers, concert culture, presentation argument',
            'Build a presentation that explains how a musical work reflects its cultural context.',
            'Presentation storyboard, listening excerpt selection, and claim-evidence review.',
            'Presentation assignment with listening excerpts',
            '21M.011 opera readings, contemporary concert music prompt, presentation assignment file',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-11124-intro-education',
    courseFamily: 'Education theory, media, games, and policy assignments',
    title: 'MIT 11.124 Introduction to Education: Looking Forward and Looking Back on Education',
    sourceUrl:
      'https://ocw.mit.edu/courses/11-124-introduction-to-education-looking-forward-and-looking-back-on-education-fall-2011/',
    publicInstructorNames: ['Eric Klopfer', 'Wendy Huang', 'Jo-Ann Graziano', 'Jason Haas'],
    disciplineFamily: 'education-teaching-policy',
    modality: 'activity-writing-presentation',
    sourceArtifacts: [
      'syllabus',
      'activity assignments',
      'presentation assignments',
      'written assignments',
      'instructor insights',
    ],
    primaryStudentWorkProducts: [
      'activity assignments',
      'written assignments',
      'presentation assignments',
      'education analyses',
    ],
    assessmentArchitecture: ['activity assignments', 'written assignments', 'presentation assignments'],
    supportAndOperationsModel: ['K-12 case settings', 'media and simulation activities', 'education reform discussion'],
    mustPreserveSignals: [
      'teaching',
      'learning',
      'K-12',
      'education reform',
      'simulations',
      'games',
      'digital divide',
      'assignments',
    ],
    requiredSignalGroups: [
      signal(
        'education-content-signals',
        'teaching, learning, K-12, education reform, simulations, games, or digital divide',
        [
          '\\bteaching\\b',
          '\\blearning\\b',
          '\\bK[-\\s]?12\\b',
          '\\beducation reform\\b',
          '\\bsimulation\\b',
          '\\bgame\\b',
          '\\bdigital divide\\b',
        ],
      ),
      signal(
        'education-work-products',
        'activity assignments, written assignments, presentations, or education analyses',
        [
          '\\bactivity assignment\\b',
          '\\bwritten assignment\\b',
          '\\bpresentation assignment\\b',
          '\\beducation analysis\\b',
        ],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 11.124 Introduction to Education public-source benchmark: teaching and learning science and mathematics in K-12 settings, education reform, media, simulations, games, digital divide, activity assignments, written assignments, presentations',
      lessons: [
        lesson('Week 1: Looking back at teaching and learning', [
          section(
            'Teaching, learning, K-12 settings, history of education, education reform',
            'Analyze how a historical view of schooling shapes a current reform argument.',
            'Case discussion, reform timeline, and written-assignment planning.',
            'Written education analysis',
            '11.124 instructor insights, history of education reading, written assignment prompt',
          ),
        ]),
        lesson('Week 2: Media, simulations, and games', [
          section(
            'Education media, simulations, games, science and mathematics learning',
            'Evaluate a simulation or game as a learning tool for a K-12 concept.',
            'Activity assignment with media critique and peer testing protocol.',
            'Activity assignment and classroom-use reflection',
            '11.124 simulation activity, games reading, activity assignment instructions',
          ),
        ]),
        lesson('Week 3: Digital divide and future education', [
          section(
            'Digital divide, education technology, access, future learning environments',
            'Design a presentation that addresses access and learning quality in an education technology proposal.',
            'Presentation rehearsal with access-risk review and learner-impact check.',
            'Presentation assignment with digital-divide argument',
            '11.124 digital divide reading, presentation assignment prompt, education reform discussion notes',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-20104j-toxicology-public-health',
    courseFamily: 'Public health toxicology, risk assessment, and case studies',
    title: 'MIT 20.104J Chemicals in the Environment: Toxicology and Public Health',
    sourceUrl:
      'https://ocw.mit.edu/courses/20-104j-chemicals-in-the-environment-toxicology-and-public-health-be-104j-spring-2005/',
    publicInstructorNames: ['James Sherley', 'Laura Green', 'Steven Tannenbaum'],
    disciplineFamily: 'public-health-toxicology',
    modality: 'lecture-problem-set-project-exam',
    sourceArtifacts: [
      'syllabus',
      'lecture notes',
      'projects with examples',
      'written assignments with examples',
      'problem sets',
      'problem set solutions',
      'exams',
      'exam solutions',
    ],
    primaryStudentWorkProducts: [
      'risk assessments',
      'case studies',
      'problem sets',
      'written assignments',
      'exam responses',
    ],
    assessmentArchitecture: ['projects', 'written assignments', 'problem sets', 'exams'],
    supportAndOperationsModel: ['case-study sequence', 'problem set solution review', 'risk assessment examples'],
    mustPreserveSignals: [
      'toxicology',
      'public health',
      'epidemiology',
      'biostatistics',
      'exposure',
      'risk assessment',
      'case studies',
    ],
    requiredSignalGroups: [
      signal(
        'public-health-toxicology-content',
        'toxicology, public health, epidemiology, biostatistics, exposure, or risk assessment',
        [
          '\\btoxicology\\b',
          '\\bpublic health\\b',
          '\\bepidemiology\\b',
          '\\bbiostatistics\\b',
          '\\bexposure\\b',
          '\\brisk assessment\\b',
        ],
      ),
      signal(
        'public-health-work-products',
        'risk assessments, case studies, problem sets, written assignments, or exams',
        [
          '\\brisk assessment\\b',
          '\\bcase stud(?:y|ies)\\b',
          '\\bproblem set\\b',
          '\\bwritten assignment\\b',
          '\\bexam\\b',
        ],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 20.104J Chemicals in the Environment public-source benchmark: toxicology, public health, epidemiology, biostatistics, exposure, metabolism, biological effects, risk assessment, case studies, problem sets, written assignments, exams',
      lessons: [
        lesson('Week 1: Exposure, disease, and epidemiology', [
          section(
            'Chemical exposure, epidemiology, disease causation, biostatistics',
            'Explain how exposure evidence and epidemiology support or limit a disease-causation claim.',
            'Lecture-note case analysis, biostatistics check, and problem set solution review.',
            'Problem set response with exposure-evidence rationale',
            '20.104J lecture notes on exposure, epidemiology case study, problem set solution',
          ),
        ]),
        lesson('Week 2: Toxicology and internal dose', [
          section(
            'Toxicology, internal distribution, metabolism, cellular reactions, biological effects',
            'Trace a chemical from exposure through metabolism to a possible biological effect.',
            'Pathway diagram, case-study discussion, and written-assignment example critique.',
            'Written toxicology case analysis',
            'Toxicology lecture notes, written assignment example, case-study project prompt',
          ),
        ]),
        lesson('Week 3: Risk assessment and regulation', [
          section(
            'Qualitative risk assessment, quantitative risk assessment, regulatory decision-making',
            'Build a risk assessment and explain how uncertainty affects a regulatory decision.',
            'Risk assessment workshop followed by exam-style policy question.',
            'Risk assessment project and exam response',
            'Risk assessment notes, project example, exam solution materials',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-12103-environmental-policy',
    courseFamily: 'Environmental science-policy controversy writing and presentations',
    title: 'MIT 12.103 Strange Bedfellows: Science and Environmental Policy',
    sourceUrl: 'https://ocw.mit.edu/courses/12-103-strange-bedfellows-science-and-environmental-policy-fall-2005/',
    publicInstructorNames: ['Stephen M. Meyer', 'Kip Hodges'],
    disciplineFamily: 'environmental-science-policy',
    modality: 'case-study-position-statement-presentation',
    sourceArtifacts: ['syllabus', 'written assignments with examples', 'presentation assignments with examples'],
    primaryStudentWorkProducts: ['position statements', 'environmental controversy analyses', 'presentations'],
    assessmentArchitecture: ['written assignments', 'position statements', 'presentation assignments'],
    supportAndOperationsModel: ['case-study sequence', 'science-policy debate', 'presentation practice'],
    mustPreserveSignals: [
      'scientific knowledge',
      'environmental policymaking',
      'global warming',
      'biodiversity loss',
      'nuclear waste',
      'position statements',
    ],
    requiredSignalGroups: [
      signal(
        'environmental-policy-content',
        'scientific knowledge, environmental policymaking, global warming, biodiversity loss, or nuclear waste',
        [
          '\\bscientific knowledge\\b',
          '\\benvironmental policymaking\\b',
          '\\bglobal warming\\b',
          '\\bbiodiversity loss\\b',
          '\\bnuclear waste\\b',
        ],
      ),
      signal(
        'environmental-policy-work-products',
        'position statements, controversy analyses, presentations, or science-policy arguments',
        [
          '\\bposition statement\\b',
          '\\bcontroversy analysis\\b',
          '\\bpresentation\\b',
          '\\bscience[-\\s]?policy argument\\b',
        ],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 12.103 Strange Bedfellows public-source benchmark: scientific knowledge, discovery, environmental policymaking, global warming, biodiversity loss, nuclear waste disposal siting, position statements, presentation assignments',
      lessons: [
        lesson('Week 1: Science in environmental policymaking', [
          section(
            'Scientific knowledge, discovery, method, argument, environmental policymaking',
            'Explain how a scientific argument can be used or misused in an environmental policy dispute.',
            'Case framing, evidence-role map, and position-statement example critique.',
            'Position statement claim and evidence map',
            '12.103 syllabus, science-policy case description, position statement example',
          ),
        ]),
        lesson('Week 2: Climate and biodiversity controversies', [
          section(
            'Global warming, biodiversity loss, policy controversy, uncertainty',
            'Write a position statement that distinguishes scientific uncertainty from policy disagreement.',
            'Global warming case discussion, biodiversity argument review, and peer response.',
            'Environmental controversy analysis',
            'Global warming assignment example, biodiversity case notes, written assignment criteria',
          ),
        ]),
        lesson('Week 3: Nuclear waste and public presentation', [
          section(
            'Nuclear waste disposal siting, public risk, science-policy presentation',
            'Present a science-policy argument about nuclear waste with evidence and stakeholder implications.',
            'Presentation rehearsal, stakeholder question round, and evidence audit.',
            'Presentation assignment with science-policy argument',
            'Nuclear waste case materials, presentation assignment example, position statement rubric',
          ),
        ]),
      ],
    }),
  }),
  manifest({
    id: 'mit-67960-deep-learning',
    courseFamily: 'Advanced AI/ML theory, problem sets, projects, and applications',
    title: 'MIT 6.7960 Deep Learning',
    sourceUrl: 'https://ocw.mit.edu/courses/6-7960-deep-learning-fall-2024/',
    publicInstructorNames: ['Phillip Isola', 'Sara Beery', 'Jeremy Bernstein'],
    disciplineFamily: 'advanced-ai-machine-learning',
    modality: 'lecture-problem-set-project',
    sourceArtifacts: ['readings', 'problem sets', 'lecture videos', 'lecture notes', 'projects with examples'],
    primaryStudentWorkProducts: ['problem sets', 'model analyses', 'implementation projects', 'project reports'],
    assessmentArchitecture: ['problem sets', 'projects with examples'],
    supportAndOperationsModel: ['lecture notes', 'readings', 'problem set cadence', 'project example workflow'],
    mustPreserveSignals: [
      'deep learning',
      'MLPs',
      'CNNs',
      'RNNs',
      'graph nets',
      'transformers',
      'backpropagation',
      'projects',
    ],
    requiredSignalGroups: [
      signal(
        'deep-learning-content',
        'MLPs, CNNs, RNNs, graph nets, transformers, backpropagation, or automatic differentiation',
        [
          '\\bMLPs?\\b',
          '\\bCNNs?\\b',
          '\\bRNNs?\\b',
          '\\bgraph nets?\\b',
          '\\btransformer\\b',
          '\\bbackpropagation\\b',
          '\\bautomatic differentiation\\b',
        ],
      ),
      signal(
        'deep-learning-work-products',
        'problem sets, projects, model analyses, implementations, or project reports',
        ['\\bproblem set\\b', '\\bproject\\b', '\\bmodel analysis\\b', '\\bimplementation\\b', '\\bproject report\\b'],
      ),
    ],
    courseMap: makeCourseMap({
      courseName:
        'MIT 6.7960 Deep Learning public-source benchmark: MLPs, CNNs, RNNs, graph nets, transformers, geometry and invariances, backpropagation, automatic differentiation, computer vision, NLP, robotics, problem sets, projects',
      lessons: [
        lesson('Week 1: Neural networks and backpropagation', [
          section(
            'MLPs, neural networks, backpropagation, automatic differentiation',
            'Implement a neural network component and explain how backpropagation updates its parameters.',
            'Lecture-note derivation, implementation trace, and problem set debugging.',
            'Problem set implementation with model analysis',
            '6.7960 lecture notes on MLPs, backpropagation video, problem set starter code',
          ),
        ]),
        lesson('Week 2: Architectures for vision, sequence, and graph data', [
          section(
            'CNNs, RNNs, graph nets, transformers, invariances',
            'Choose an architecture and justify how its inductive bias matches the data structure.',
            'Architecture comparison, reading discussion, and project example critique.',
            'Model analysis memo and architecture-selection problem',
            'CNN/RNN/graph net readings, transformer lecture notes, project example',
          ),
        ]),
        lesson('Week 3: Applications and project reports', [
          section(
            'Computer vision, natural language processing, robotics, generalization, project reports',
            'Evaluate a deep learning application by connecting model behavior to data, training, and generalization.',
            'Project report workshop with failure-mode review and application ethics check.',
            'Project report and presentation checkpoint',
            'Computer vision lecture video, NLP lecture notes, robotics project example',
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
