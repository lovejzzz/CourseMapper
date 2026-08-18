import React, { useState, useCallback, useEffect, useRef } from 'react';
import ModelConfig from '../components/ModelConfig';
import { useAuth } from '../contexts/AuthContext';
import { useAIConfig } from '../contexts/AIConfigContext';
import { useCourse } from '../contexts/CourseContext';
import UserMenu from '../components/UserMenu';
import DarkModeToggle from '../components/DarkModeToggle';
import AppLogo from '../components/AppLogo';
import SetupProgress from '../components/SetupProgress';
import { LATEST_RELEASE } from '../lib/latestRelease';
import { formatCoverageTopicLabel } from '../lib/algiCoverageForecast';
import { shouldOfferCurrentSourceResearch } from '../lib/scionEvidenceForecastAction';
import { PUBLIC_SCION_MODEL_NAME, PUBLIC_SCION_PROVIDER_ID } from '../lib/publicScionIdentity';
import {
  SCION_RESEARCH_CHANGE_EVENT,
  readScionResearchEnabled,
  saveScionResearchEnabled,
} from '../lib/scionResearchPolicy';
import useScionDeviceCapability from '../hooks/useScionDeviceCapability';

const ACCEPTED_EXTENSIONS = [
  '.doc',
  '.docx',
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.rtf',
  '.html',
  '.htm',
  '.xlsx',
  '.xls',
  '.ods',
  '.ppt',
  '.pptx',
  '.odp',
  '.odt',
  '.epub',
  '.key',
  '.pages',
  '.zip',
];

const PROJECT_EXTENSIONS = ['.coursemapper', '.json'];

function formatResearchProviderOrder(providerOrder = []) {
  const labels = {
    'w3c-wai': 'W3C/WAI',
    'europe-pmc': 'Europe PMC',
    doaj: 'DOAJ',
    wikipedia: 'Wikipedia',
  };
  return (Array.isArray(providerOrder) ? providerOrder : [])
    .map((providerId) => labels[providerId] || providerId)
    .join(' → ');
}

export const COURSE_EXAMPLES = [
  {
    label: '🧠 Intro to Psychology',
    text: 'Introduction to Psychology, 15-week undergraduate survey course with weekly lectures, discussion sections, low-stakes quizzes, a midterm, and a final applied reflection. Covers history of psychology, research methods, biological bases of behavior, sensation and perception, learning, memory, cognition, development, social psychology, and abnormal psychology.',
  },
  {
    label: '📊 Research Methods',
    text: 'Research Methods in the Social Sciences, 12-week graduate seminar with scaffolded proposal milestones, peer review workshops, mixed-methods labs, and a final research design portfolio. Covers qualitative and quantitative approaches, sampling, survey design, interviewing, ethnography, descriptive statistics, ethics, and research proposal writing.',
  },
  {
    label: '🌍 Social Policy',
    text: 'Social Policy and Welfare, 14-week undergraduate course with weekly case briefs, policy memos, debate activities, and a final advocacy project. Covers social welfare history, policy analysis frameworks, healthcare policy, housing policy, income support, child welfare, aging policy, disability policy, and legislative advocacy.',
  },
  {
    label: '🤖 Machine Learning',
    text: 'Applied Machine Learning, 10-week graduate technical course with Python notebooks, weekly dataset labs, model critique discussions, and a final predictive modeling project. Covers supervised learning, train/test splits, regression, classification, decision trees, random forests, neural networks, evaluation metrics, overfitting, fairness, and model documentation.',
  },
  {
    label: '🧪 Organic Chemistry Lab',
    text: 'Organic Chemistry Laboratory, 8-week in-person undergraduate lab course with pre-lab checks, bench experiments, lab notebook grading, safety briefings, and formal lab reports. Covers purification, chromatography, spectroscopy, substitution and elimination reactions, synthesis planning, yield analysis, and lab safety practices.',
  },
  {
    label: '🏛️ Art History',
    text: 'Global Art History: 1400 to Present, 13-week undergraduate seminar with visual analysis exercises, museum object studies, short comparison papers, and a final curatorial proposal. Covers Renaissance art, colonial visual culture, modernism, photography, architecture, protest art, global contemporary movements, and methods for interpreting material culture.',
  },
  {
    label: '💼 Startup Finance',
    text: 'Startup Finance and Venture Strategy, 6-week executive certificate course with async finance primers, live case workshops, valuation spreadsheets, investor memo practice, and a capstone pitch deck. Covers unit economics, runway, fundraising stages, cap tables, term sheets, valuation methods, scenario planning, and board-level financial storytelling.',
  },
  {
    label: '🧑‍⚕️ Public Health',
    text: 'Public Health Program Planning, 11-week hybrid graduate course with community needs assessment, logic model studios, evaluation plan checkpoints, and team presentations. Covers epidemiologic thinking, social determinants of health, stakeholder mapping, intervention design, health equity, implementation barriers, evaluation metrics, and grant-style planning.',
  },
  {
    label: '⚖️ Business Law',
    text: 'Business Law for Managers, 9-week online MBA course with short legal issue briefs, contract annotation drills, scenario-based quizzes, and a final risk advisory memo. Covers contracts, torts, employment law, intellectual property, data privacy, entity formation, regulatory compliance, negotiation ethics, and legal risk communication.',
  },
  {
    label: '🧩 UX Design Studio',
    text: 'User Experience Design Studio, 12-week project-based undergraduate course with critique sessions, design journals, usability testing labs, prototype reviews, and a final portfolio case study. Covers design research, personas, journey maps, information architecture, wireframing, interaction patterns, accessibility, usability testing, and design handoff.',
  },
  {
    label: '🎬 Film Studies',
    text: 'Film Form and Cultural Analysis, 10-week undergraduate humanities course with weekly screenings, shot-analysis workshops, short response papers, and a final scene analysis essay. Covers mise-en-scene, cinematography, editing, sound, genre, spectatorship, documentary form, global cinema, authorship, and ideology critique.',
  },
  {
    label: '🌱 Climate Justice',
    text: 'Climate Justice and Community Resilience, 7-week intensive seminar with policy labs, community case studies, environmental justice mapping, and a final resilience action plan. Covers climate science basics, environmental racism, adaptation planning, disaster recovery, energy transitions, Indigenous sovereignty, public participation, and climate policy tradeoffs.',
  },
  {
    label: '🧮 Data Analytics',
    text: 'Data Analytics for Decision-Making, 15-week undergraduate course with spreadsheet labs, dashboard critiques, statistics quizzes, and a final analytics report. Covers data cleaning, descriptive statistics, visualization, SQL basics, spreadsheet modeling, correlation, regression, dashboard design, uncertainty, and communicating findings to nontechnical audiences.',
  },
  {
    label: '🗣️ Spanish for Healthcare',
    text: 'Spanish for Healthcare Professionals, 8-week skills course with role-play clinics, vocabulary practice, cultural humility reflections, oral proficiency checks, and a final patient-interview simulation. Covers intake questions, symptoms, medication instructions, family history, pain description, consent language, interpreter collaboration, and respectful patient communication.',
  },
  {
    label: '🏙️ Urban Planning',
    text: 'Urban Planning and Community Development, 14-week graduate studio with neighborhood fieldwork, zoning analysis, stakeholder interviews, planning memo drafts, and a final community development plan. Covers land use, housing affordability, transportation equity, zoning, participatory planning, GIS mapping, economic development, and public meeting facilitation.',
  },
  {
    label: '📐 Calculus I',
    text: 'Calculus I: Limits and Derivatives, 15-week undergraduate course with weekly problem sets, recitation worksheets, two midterms, and a cumulative final. Covers limits, continuity, the definition of the derivative, differentiation rules, the chain rule, implicit differentiation, related rates, optimization, curve sketching, and an introduction to integration.',
  },
  {
    label: '➗ Linear Algebra',
    text: 'Linear Algebra, 14-week undergraduate course with proof-based problem sets, computational labs in Python, a midterm, and a final exam. Covers systems of linear equations, matrices, vector spaces, linear independence, bases and dimension, determinants, eigenvalues and eigenvectors, orthogonality, and the singular value decomposition.',
  },
  {
    label: '🎲 Probability & Statistics',
    text: 'Probability and Statistics for Engineers, 13-week undergraduate course with weekly homework, simulation labs, a data project, and a final exam. Covers sample spaces, conditional probability, random variables, common distributions, expectation and variance, the central limit theorem, estimation, hypothesis testing, and linear regression.',
  },
  {
    label: '🧮 Discrete Mathematics',
    text: 'Discrete Mathematics, 15-week undergraduate computer-science course with proof problem sets, weekly quizzes, a midterm, and a final. Covers logic and proofs, sets, functions, mathematical induction, combinatorics, recurrence relations, graph theory, trees, relations, and Boolean algebra.',
  },
  {
    label: '⚛️ Physics: Mechanics',
    text: "Introductory Physics I: Mechanics, 15-week calculus-based undergraduate course with weekly labs, problem sets, two midterms, and a final. Covers kinematics, Newton's laws of motion, work and energy, momentum and collisions, rotational motion, torque, angular momentum, gravitation, oscillations, and an introduction to fluids.",
  },
  {
    label: '🔌 Physics: Electricity & Magnetism',
    text: "Introductory Physics II: Electricity and Magnetism, 15-week calculus-based course with circuit labs, problem sets, midterms, and a final. Covers electric charge and fields, Gauss's law, electric potential, capacitance, current and resistance, DC circuits, magnetic fields, Faraday's law of induction, inductance, and Maxwell's equations.",
  },
  {
    label: '🧫 General Chemistry',
    text: 'General Chemistry I, 15-week undergraduate course with weekly labs, online homework, three midterms, and a final exam. Covers atomic structure, the periodic table, chemical bonding, stoichiometry, the gas laws, thermochemistry, electron configuration, molecular geometry, intermolecular forces, and solutions.',
  },
  {
    label: '🧬 Genetics',
    text: 'Genetics, 14-week undergraduate biology course with problem sets, a model-organism lab, two midterms, and a final. Covers Mendelian inheritance, meiosis, linkage and gene mapping, the molecular structure of DNA, gene expression, mutation, population genetics, epigenetics, and modern genetic technologies.',
  },
  {
    label: '🦠 Microbiology',
    text: 'Microbiology, 13-week undergraduate course with aseptic-technique labs, lab practicals, weekly quizzes, and a final. Covers prokaryotic cell structure, microbial metabolism, microbial growth, control of microorganisms, bacterial genetics, viruses, host-pathogen interactions, the basics of immunology, and antibiotic resistance.',
  },
  {
    label: '🫀 Anatomy & Physiology',
    text: 'Human Anatomy and Physiology I, 15-week undergraduate course with model and microscope labs, lab practicals, lecture exams, and a final. Covers tissue types, the integumentary system, the skeletal system, the muscular system, the nervous system, sensory physiology, and the principles of homeostasis and feedback regulation.',
  },
  {
    label: '🌲 Ecology',
    text: 'Ecology, 13-week undergraduate course with field sampling exercises, data analysis labs, a research poster, and a final. Covers population dynamics, life-history strategies, species interactions, community structure, ecological succession, energy flow, nutrient cycling, biodiversity, and conservation biology.',
  },
  {
    label: '🔭 Introductory Astronomy',
    text: 'Introduction to Astronomy, 12-week undergraduate course with night-sky observation logs, planetarium activities, quizzes, and a final project. Covers the celestial sphere, the solar system, stellar formation and evolution, the Hertzsprung-Russell diagram, galaxies, the interstellar medium, cosmology, and the search for exoplanets.',
  },
  {
    label: '🪨 Physical Geology',
    text: 'Physical Geology, 14-week undergraduate course with mineral and rock identification labs, a field-trip report, exams, and a final. Covers minerals, the rock cycle, igneous, sedimentary, and metamorphic rocks, plate tectonics, earthquakes, volcanism, weathering and erosion, surface water, and geologic time.',
  },
  {
    label: '💻 Intro to Programming',
    text: 'Introduction to Computer Science with Python, 15-week undergraduate course with weekly coding labs, autograded assignments, a midterm, and a final project. Covers variables and types, control flow, functions, lists and dictionaries, strings, file input and output, recursion, object-oriented basics, debugging, and algorithmic thinking.',
  },
  {
    label: '🧱 Data Structures & Algorithms',
    text: 'Data Structures and Algorithms, 15-week undergraduate course with programming assignments, problem sets, a midterm, and a final. Covers asymptotic analysis, arrays and linked lists, stacks and queues, trees, hash tables, heaps, graphs, sorting and searching, dynamic programming, and algorithm design strategies.',
  },
  {
    label: '🖥️ Operating Systems',
    text: 'Operating Systems, 14-week undergraduate course with C programming projects, a systems lab, a midterm, and a final. Covers processes and threads, CPU scheduling, synchronization, deadlock, memory management, virtual memory, file systems, input and output, and an introduction to virtualization.',
  },
  {
    label: '🗄️ Database Systems',
    text: 'Database Systems, 13-week undergraduate course with SQL labs, a schema design project, quizzes, and a final. Covers the relational model, SQL queries, entity-relationship modeling, normalization, indexing, transactions, concurrency control, recovery, and an introduction to NoSQL stores.',
  },
  {
    label: '🔐 Cybersecurity',
    text: 'Introduction to Cybersecurity, 12-week undergraduate course with hands-on labs in a sandbox, a defensive capture-the-flag exercise, quizzes, and a final report. Covers the confidentiality-integrity-availability triad, cryptography basics, authentication, network security, common vulnerabilities, threat modeling, secure coding, incident response, and security policy.',
  },
  {
    label: '🤝 Software Engineering',
    text: 'Software Engineering, 14-week project-based undergraduate course with an agile team project, sprint demos, code reviews, and a final release. Covers requirements engineering, version control, agile methods, design patterns, testing, continuous integration, code quality, refactoring, documentation, and team collaboration.',
  },
  {
    label: '🌐 Web Development',
    text: 'Full-Stack Web Development, 12-week project-based course with weekly build labs, code reviews, a portfolio site, and a final application. Covers HTML and CSS, responsive design, JavaScript, the document object model, working with APIs, a front-end framework, server-side basics, databases, authentication, and deployment.',
  },
  {
    label: '🤖 Artificial Intelligence',
    text: 'Introduction to Artificial Intelligence, 14-week undergraduate course with programming assignments, problem sets, a midterm, and a final project. Covers search algorithms, heuristics, constraint satisfaction, adversarial games, logic and knowledge representation, planning, probabilistic reasoning, machine learning basics, and the ethics of AI.',
  },
  {
    label: '📊 Microeconomics',
    text: 'Principles of Microeconomics, 15-week undergraduate course with weekly problem sets, graphing exercises, two midterms, and a final. Covers scarcity and opportunity cost, supply and demand, elasticity, consumer choice, production and costs, perfect competition, monopoly, externalities, public goods, and labor markets.',
  },
  {
    label: '📈 Macroeconomics',
    text: 'Principles of Macroeconomics, 15-week undergraduate course with problem sets, data interpretation exercises, midterms, and a final. Covers gross domestic product, the circular flow of income, inflation and the consumer price index, unemployment, aggregate demand and supply, fiscal policy, money and banking, monetary policy, and economic growth.',
  },
  {
    label: '👥 Introduction to Sociology',
    text: 'Introduction to Sociology, 14-week undergraduate course with reading responses, a community observation paper, quizzes, and a final project. Covers the sociological imagination, culture, socialization, social structure, deviance, social stratification, race and ethnicity, gender, family, and social change.',
  },
  {
    label: '🌏 Cultural Anthropology',
    text: 'Cultural Anthropology, 13-week undergraduate course with ethnographic reading journals, a mini-fieldwork exercise, exams, and a final ethnography. Covers culture and ethnocentrism, fieldwork methods, language and communication, kinship, economic systems, political organization, religion and ritual, globalization, and cultural change.',
  },
  {
    label: '🏛️ American Government',
    text: 'American Government and Politics, 15-week undergraduate course with current-events briefs, a policy debate, exams, and a final paper. Covers the Constitution, federalism, civil liberties, civil rights, Congress, the presidency, the judiciary, the bureaucracy, political parties, elections, interest groups, and public opinion.',
  },
  {
    label: '🌍 International Relations',
    text: 'Introduction to International Relations, 14-week undergraduate course with position papers, a crisis simulation, exams, and a final analysis. Covers realism, liberalism, and constructivism, the state system, war and security, international institutions, global political economy, human rights, the environment, and contemporary global challenges.',
  },
  {
    label: '⚖️ Ethics',
    text: 'Introduction to Ethics, 14-week undergraduate philosophy course with argument-analysis exercises, short response papers, a debate, and a final paper. Covers metaethics, consequentialism, deontology, virtue ethics, social contract theory, moral relativism, applied ethics cases, moral psychology, and constructing ethical arguments.',
  },
  {
    label: '🧠 Logic',
    text: 'Introduction to Logic, 13-week undergraduate course with weekly proof exercises, quizzes, a midterm, and a final. Covers arguments and validity, informal fallacies, categorical logic, propositional logic, truth tables, natural deduction, predicate logic, quantifiers, and an introduction to inductive reasoning.',
  },
  {
    label: '📜 Western Civilization',
    text: 'Western Civilization to 1500, 15-week undergraduate history survey with primary-source analyses, map exercises, exams, and a research essay. Covers Mesopotamia and Egypt, ancient Greece, the Roman Republic and Empire, early Christianity, the Byzantine world, the rise of Islam, the early Middle Ages, feudalism, and the late medieval crises.',
  },
  {
    label: '🇺🇸 U.S. History',
    text: 'United States History since 1865, 15-week undergraduate survey with document-based questions, a historiography paper, exams, and a final project. Covers Reconstruction, industrialization, immigration, Progressivism, the world wars, the Great Depression and the New Deal, the Cold War, the civil rights movement, and the modern era.',
  },
  {
    label: '📖 World Literature',
    text: 'World Literature, 14-week undergraduate humanities course with reading responses, close-reading exercises, a comparative essay, and a final paper. Covers epic and oral tradition, classical drama, lyric poetry, the rise of the novel, postcolonial literature, magical realism, translation, narrative perspective, and methods of literary analysis.',
  },
  {
    label: '✍️ English Composition',
    text: 'College Writing and Rhetoric, 15-week first-year course with drafting workshops, peer review, a research paper, and a reflective portfolio. Covers the writing process, thesis development, paragraphing, rhetorical appeals, audience and purpose, argumentation, source evaluation, citation, revision, and academic style.',
  },
  {
    label: '🎭 Introduction to Theater',
    text: 'Introduction to Theater, 13-week undergraduate arts course with performance responses, a scene study, a production analysis, and a final project. Covers the elements of drama, theater history, dramatic structure, acting fundamentals, directing, scenic and lighting design, dramaturgy, genre, and critiquing live performance.',
  },
  {
    label: '🎼 Music Theory',
    text: 'Music Theory I, 15-week undergraduate course with part-writing exercises, ear-training drills, weekly quizzes, and a final. Covers notation, scales and key signatures, intervals, triads and seventh chords, diatonic harmony, voice leading, cadences, nonchord tones, phrase structure, and basic analysis.',
  },
  {
    label: '🎨 Drawing Studio',
    text: 'Foundations of Drawing, 12-week studio course with weekly drawing assignments, sketchbook reviews, group critiques, and a final portfolio. Covers line and contour, proportion, linear perspective, value and shading, composition, gesture, still life, the figure, texture, and developing a personal visual vocabulary.',
  },
  {
    label: '📷 Digital Photography',
    text: 'Digital Photography, 12-week studio course with weekly shooting assignments, editing labs, critiques, and a final portfolio. Covers exposure, aperture and shutter speed, ISO, composition, lighting, color and white balance, the RAW workflow, editing software, genres of photography, and building a cohesive body of work.',
  },
  {
    label: '💰 Financial Accounting',
    text: 'Financial Accounting, 15-week undergraduate business course with problem sets, spreadsheet exercises, two midterms, and a final. Covers the accounting equation, the double-entry system, journal entries, adjusting entries, the income statement, the balance sheet, the statement of cash flows, inventory, receivables, and financial statement analysis.',
  },
  {
    label: '📣 Principles of Marketing',
    text: 'Principles of Marketing, 14-week undergraduate course with case analyses, a marketing-plan project, quizzes, and a final presentation. Covers the marketing concept, market research, consumer behavior, segmentation and targeting, positioning, the marketing mix, branding, pricing, distribution channels, and digital marketing.',
  },
  {
    label: '🏢 Organizational Behavior',
    text: 'Organizational Behavior, 13-week undergraduate management course with case discussions, a team project, reflection memos, and a final. Covers individual differences, motivation, perception, decision-making, group dynamics, teams, communication, leadership, organizational culture, power and politics, and managing change.',
  },
  {
    label: '💵 Corporate Finance',
    text: 'Corporate Finance, 14-week undergraduate course with spreadsheet problem sets, a valuation case, two midterms, and a final. Covers the time value of money, reading financial statements, risk and return, the cost of capital, capital budgeting, net present value, capital structure, dividend policy, and working capital management.',
  },
  {
    label: '📋 Project Management',
    text: 'Project Management, 12-week professional course with a project charter, a scheduling lab, scenario quizzes, and a final project plan. Covers the project life cycle, scope management, work breakdown structures, scheduling and the critical path, budgeting, risk management, stakeholder management, agile approaches, and project closure.',
  },
  {
    label: '🩺 Nursing Fundamentals',
    text: 'Fundamentals of Nursing, 15-week course with skills-lab checkoffs, clinical simulations, dosage-calculation quizzes, and a final. Covers the nursing process, patient assessment, vital signs, infection control, patient safety, medication administration, documentation, therapeutic communication, basic care skills, and professional and ethical practice.',
  },
  {
    label: '💊 Pharmacology',
    text: 'Introduction to Pharmacology, 13-week health-sciences course with drug-classification worksheets, case studies, exams, and a final. Covers pharmacokinetics, pharmacodynamics, routes of administration, dosage calculation, autonomic nervous system drugs, cardiovascular drugs, antibiotics, analgesics, adverse effects, and patient education.',
  },
  {
    label: '🥗 Nutrition',
    text: 'Introduction to Nutrition, 14-week undergraduate course with diet-analysis logs, a case project, quizzes, and a final. Covers macronutrients, micronutrients, digestion and absorption, energy balance, dietary guidelines, nutrition across the life span, weight management, food safety, reading nutrition labels, and evaluating nutrition claims.',
  },
  {
    label: '🏃 Exercise Science',
    text: 'Foundations of Exercise Science, 13-week undergraduate course with laboratory measurements, a training-program project, exams, and a final. Covers bioenergetics, the muscular and cardiovascular response to exercise, the principles of training, strength and endurance adaptations, flexibility, body composition, fitness assessment, and program design.',
  },
  {
    label: '🍎 Educational Psychology',
    text: 'Educational Psychology, 14-week course for future teachers with classroom observation logs, a case analysis, quizzes, and a final lesson plan. Covers cognitive development, learning theories, motivation, individual differences, assessment, classroom management, instructional design, culturally responsive teaching, and supporting diverse learners.',
  },
  {
    label: '🗞️ Journalism',
    text: 'Introduction to Journalism, 13-week course with reporting assignments, interview practice, a beat project, and a final multimedia story. Covers news values, story structure, interviewing, sourcing and verification, AP style, media ethics, the basics of media law, investigative methods, multimedia storytelling, and writing on deadline.',
  },
  {
    label: '🗣️ Public Speaking',
    text: 'Public Speaking, 13-week undergraduate communication course with graded speeches, peer feedback, a self-evaluation, and a final persuasive speech. Covers audience analysis, topic selection, research and support, organization, outlining, delivery, language, visual aids, managing speech anxiety, and the principles of persuasion.',
  },
  {
    label: '🇨🇳 Elementary Mandarin',
    text: 'Elementary Mandarin Chinese I, 15-week beginner language course with daily character practice, speaking drills, listening quizzes, and an oral final. Covers pinyin and tones, basic characters, greetings and introductions, numbers and dates, family and daily routines, food and shopping, simple sentence patterns, and foundational listening and speaking.',
  },
];

export function pickCourseExamples(examples = COURSE_EXAMPLES, count = 3) {
  const shuffled = [...examples];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function isProjectFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return PROJECT_EXTENSIONS.includes(ext);
}

function isValidFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function Landing({
  onGenerate,
  canGenerate,
  isGenerating,
  // v0.14.7 WS-F2: quick start — generate the full package with defaults,
  // straight from the prompt box (skips FeatureSelect/Config).
  onQuickStart,
  setupRecoveryNotice = null,
  // Session restore
  hasSavedSession,
  onRestoreSession,
  onDismissSavedSession,
  // Import course map
  onImportCourseMap,
  // Open full .coursemapper project file
  onOpenProject,
  // Quick-fill example chips — sets prompt + pre-parses lesson hints
  onExampleSelect,
  // Cloud project management
  onOpenProjects,
  developerMode = false,
  onDeveloperModeChange,
}) {
  const { user } = useAuth();
  const { provider, apiKey, modelId, modelName, apiStatus } = useAIConfig();
  const { files, setFiles, promptText, setPromptText, columns, setColumns } = useCourse();
  const [isDragging, setIsDragging] = useState(false);
  const [projectDragging, setProjectDragging] = useState(false);
  const [visibleCourseExamples, setVisibleCourseExamples] = useState(() => pickCourseExamples(COURSE_EXAMPLES, 3));
  const [scionResearchEnabled, setScionResearchEnabled] = useState(readScionResearchEnabled);
  const [scionCoverageForecast, setScionCoverageForecast] = useState(null);
  const [scionForecastStatus, setScionForecastStatus] = useState('idle');
  const missingRecoveryAttachments = (setupRecoveryNotice?.attachmentNames || []).filter(
    (name) => !files.some((file) => file?.name === name),
  );
  const scionSelected = provider === PUBLIC_SCION_PROVIDER_ID;
  const scionDeviceCapability = useScionDeviceCapability(scionSelected);

  useEffect(() => {
    const handleResearchChange = (event) => {
      setScionResearchEnabled(Boolean(event?.detail?.enabled ?? readScionResearchEnabled()));
    };
    globalThis.addEventListener?.(SCION_RESEARCH_CHANGE_EVENT, handleResearchChange);
    return () => globalThis.removeEventListener?.(SCION_RESEARCH_CHANGE_EVENT, handleResearchChange);
  }, []);

  useEffect(() => {
    let active = true;
    if (!scionSelected || promptText.trim().length < 3) {
      setScionCoverageForecast(null);
      setScionForecastStatus('idle');
      return () => {
        active = false;
      };
    }
    setScionForecastStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { forecastAlgiCoverage } = await import('../lib/algiCoverageForecast.js');
        const forecast = await forecastAlgiCoverage({
          source: promptText,
          researchEnabled: scionResearchEnabled,
        });
        if (!active) return;
        setScionCoverageForecast(forecast);
        setScionForecastStatus('ready');
      } catch {
        if (!active) return;
        setScionCoverageForecast(null);
        setScionForecastStatus('unavailable');
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [scionResearchEnabled, scionSelected, promptText]);

  // ── Auto-collapse AI config when already connected ──
  const isReady = apiStatus === 'connected';
  const [configCollapsed, setConfigCollapsed] = useState(isReady);
  const configManuallyExpandedRef = useRef(false);

  // Auto-collapse only when apiStatus transitions TO 'connected' (not on mount).
  // This prevents the panel from re-collapsing when the user clicks "Edit".
  const prevApiStatusRef = useRef(apiStatus);
  useEffect(() => {
    const prev = prevApiStatusRef.current;
    prevApiStatusRef.current = apiStatus;
    if (apiStatus === 'connected' && prev !== 'connected' && !configManuallyExpandedRef.current) {
      setConfigCollapsed(true);
    }
  }, [apiStatus, provider]);

  const expandConfigForEditing = useCallback(() => {
    configManuallyExpandedRef.current = true;
    setConfigCollapsed(false);
  }, []);

  const collapseConfig = useCallback(() => {
    configManuallyExpandedRef.current = false;
    setConfigCollapsed(true);
  }, []);

  const shuffleCourseExamples = useCallback(() => {
    setVisibleCourseExamples((current) => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const next = pickCourseExamples(COURSE_EXAMPLES, 3);
        if (next.map((item) => item.label).join('|') !== current.map((item) => item.label).join('|')) return next;
      }
      return pickCourseExamples(COURSE_EXAMPLES, 3);
    });
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      setProjectDragging(false);
      const allFiles = Array.from(e.dataTransfer.files);
      // If a .coursemapper file is dropped, open it as a full project
      const projectFile = allFiles.find(isProjectFile);
      if (projectFile && onOpenProject) {
        onOpenProject(projectFile);
        return;
      }
      const dropped = allFiles.filter(isValidFile);
      if (dropped.length > 0) setFiles((prev) => [...prev, ...dropped]);
    },
    [setFiles, onOpenProject],
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.items || []);
    const hasProject = files.some((item) => {
      const name = item.getAsFile?.()?.name || '';
      return name.endsWith('.coursemapper') || name.endsWith('.json');
    });
    setProjectDragging(hasProject);
    setIsDragging(!hasProject);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    setProjectDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e) => {
      const allFiles = Array.from(e.target.files);
      // If a .coursemapper file is selected, open it as a full project
      const projectFile = allFiles.find(isProjectFile);
      if (projectFile && onOpenProject) {
        onOpenProject(projectFile);
        e.target.value = '';
        return;
      }
      const selected = allFiles.filter(isValidFile);
      if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
      e.target.value = '';
    },
    [setFiles, onOpenProject],
  );

  const removeFile = useCallback(
    (index) => {
      setFiles((prev) => prev.filter((_, i) => i !== index));
    },
    [setFiles],
  );

  // v0.14.7 WS-F2: quick start shows only when there is a prompt to act on
  // AND a stored API key ('coursemapper-apikey', surfaced via useAIConfig) —
  // one decision to first value, defaults for everything else.
  const providerIsKeyless = provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID;
  const hasCourseInput = files.length > 0 || promptText.trim().length > 0;
  const canQuickStart =
    Boolean(onQuickStart) &&
    promptText.trim().length > 0 &&
    (providerIsKeyless ? apiStatus === 'connected' : Boolean(apiKey?.trim()));
  const quickStartNeedsCurrentSources = shouldOfferCurrentSourceResearch({
    scionSelected,
    researchEnabled: scionResearchEnabled,
    forecast: scionCoverageForecast,
  });
  const handleQuickStartClick = useCallback(() => {
    if (quickStartNeedsCurrentSources) {
      // The visible source notice names this network boundary before the click.
      // Persist the choice for later runs, and also hand it to this run explicitly. The
      // explicit handoff prevents a fresh-origin build from depending on a
      // storage read across the lazy Landing -> AppFlow transition.
      saveScionResearchEnabled(true);
    }
    onQuickStart({
      scionResearchEnabled: quickStartNeedsCurrentSources || scionResearchEnabled,
    });
  }, [onQuickStart, quickStartNeedsCurrentSources, scionResearchEnabled]);
  const providerLabel =
    { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek' }[provider] ||
    'selected provider';
  const landingRequirement = !hasCourseInput
    ? 'Describe a course or attach a syllabus to continue.'
    : !providerIsKeyless && !apiKey?.trim()
      ? `Add your ${providerLabel} API key to continue.`
      : apiStatus === 'validating'
        ? 'Checking the selected AI connection…'
        : apiStatus === 'no_funds'
          ? `Add ${providerLabel} credits or choose another provider to continue.`
          : apiStatus === 'error'
            ? 'Fix the AI connection above or choose another provider to continue.'
            : !modelId
              ? 'Select an AI model to continue.'
              : 'Finish connecting the selected AI provider to continue.';

  // Build a summary label for the collapsed AI config bar
  const configSummaryLabel = (() => {
    if (provider === 'webllm') return 'Choose an AI provider';
    if (provider === 'openai') return `OpenAI · ${modelName || modelId || 'GPT'}`;
    if (provider === 'anthropic') return `Anthropic · ${modelName || modelId || 'Claude'}`;
    if (provider === 'google') return `Google · ${modelName || modelId || 'Gemini'}`;
    if (provider === 'deepseek') return `DeepSeek · ${modelName || modelId || 'V3'}`;
    if (provider === PUBLIC_SCION_PROVIDER_ID) return modelName || PUBLIC_SCION_MODEL_NAME;
    if (provider === 'local') return `Scion Local · ${modelName || modelId || 'Scion-1'}`;
    return modelName || modelId || provider || 'AI Model';
  })();

  return (
    <div className="landing-shell noise-overlay flex min-h-screen flex-col text-slate-900 dark:text-slate-100">
      <header className="px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <a href="#/" className="flex items-center" aria-label="EduTool.dev home">
            <AppLogo className="h-12 w-auto object-contain sm:h-14" />
          </a>
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <UserMenu
              onOpenProjects={onOpenProjects}
              developerMode={developerMode}
              onDeveloperModeChange={onDeveloperModeChange}
            />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col">
          <section className="text-center animate-fade-up">
            <h1 className="text-3xl font-semibold leading-[1.08] text-slate-950 dark:text-white sm:text-4xl md:whitespace-nowrap">
              Turn a syllabus into a teachable course.
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-body-lg text-ink-muted sm:text-sm">
              Build the course map, instructor materials, and student resources as one aligned workspace.
            </p>
          </section>

          <div className="mt-7">
            <section className="rounded-[28px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-950/70 dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5">
              <SetupProgress current="brief" />
              <p className="mt-5 text-center text-body text-ink-muted">
                Describe the course or attach what you already have.
              </p>

              {missingRecoveryAttachments.length > 0 && (
                <div
                  data-testid="setup-recovery-notice"
                  role="status"
                  className="mt-5 flex items-start gap-3 rounded-xl border border-blue-200/80 bg-blue-50/75 px-4 py-3 text-left dark:border-blue-400/25 dark:bg-blue-400/10"
                >
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-blue-600 dark:bg-slate-950 dark:text-blue-200">
                    i
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                      App updated — your course brief is restored
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-blue-700 dark:text-blue-200">
                      Reattach {missingRecoveryAttachments.join(', ')} to continue with the same source material.
                    </p>
                  </div>
                </div>
              )}

              {!promptText && files.length === 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    data-testid="sample-courses-shuffle"
                    onClick={shuffleCourseExamples}
                    title="Shuffle sample courses"
                    className="tactile min-h-11 min-w-11 rounded-full px-2 text-xs font-semibold text-slate-500 transition-colors hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-slate-400 dark:hover:text-blue-200 dark:focus:ring-blue-500/50"
                  >
                    Try
                  </button>
                  {visibleCourseExamples.map(({ label, text }) => (
                    <button
                      key={label}
                      data-testid="course-example-chip"
                      data-example-text={text}
                      onClick={() => (onExampleSelect ? onExampleSelect(text) : setPromptText(text))}
                      className="tactile flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {hasSavedSession && (
                <div
                  data-testid="saved-session-banner"
                  className="mt-5 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-lg border border-blue-200/70 bg-blue-50/70 px-4 py-3 animate-spring-in sm:flex sm:gap-3 dark:border-blue-400/20 dark:bg-blue-400/10"
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 dark:bg-slate-950 dark:text-blue-200">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div data-testid="saved-session-copy" className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Previous session found</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Resume it or start fresh.</p>
                  </div>
                  <button
                    onClick={onRestoreSession}
                    className="tactile col-start-2 col-end-4 row-start-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-110 sm:w-auto dark:bg-white dark:text-slate-950"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Resume
                  </button>
                  <button
                    onClick={onDismissSavedSession}
                    className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/70 hover:text-red-500 dark:hover:bg-slate-950/60"
                    title="Dismiss and start fresh"
                    aria-label="Dismiss saved session"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                data-testid="landing-course-composer"
                className={`relative mt-5 rounded-[22px] transition-[border-color,box-shadow,transform] duration-300 ${
                  isDragging
                    ? 'scale-[1.01] border-2 border-blue-400 bg-blue-50/60 shadow-glow-indigo dark:bg-blue-400/10'
                    : 'border-2 border-slate-200 bg-white/80 focus-within:border-blue-400/70 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-within:border-blue-400/70'
                }`}
              >
                <textarea
                  aria-label="Describe your course"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder={
                    files.length > 0
                      ? 'Describe what you want to build from the attached syllabus or source files...'
                      : 'Describe your course, or drop a syllabus here...'
                  }
                  rows={files.length > 0 ? 2 : 4}
                  className="w-full resize-none bg-transparent px-4 pb-2 pt-4 text-sm text-slate-800 placeholder:text-slate-500/80 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                />

                {files.length > 0 && (
                  <div className="space-y-1 px-3 pb-2">
                    {files.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 animate-spring-in dark:bg-slate-800"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileIcon ext={file.name.split('.').pop()} />
                          <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                            {file.name}
                          </span>
                          {file.size > 0 && (
                            <span className="flex-shrink-0 text-xs text-slate-400">{formatSize(file.size)}</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(i);
                          }}
                          className="ml-2 flex-shrink-0 text-slate-300 transition-colors hover:text-red-400"
                          aria-label={`Remove ${file.name}`}
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col items-stretch gap-1.5 px-3 pb-3 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <button
                    type="button"
                    onClick={() => document.getElementById('landing-file-input').click()}
                    className="tactile flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                    {files.length > 0 ? 'Add files' : 'Attach files'}
                  </button>
                  <span className="px-3 text-left text-xs leading-4 text-slate-500 dark:text-slate-400 sm:px-0 sm:text-right">
                    {isDragging ? (
                      'Drop to attach'
                    ) : (
                      <>
                        .pdf .docx .xlsx .pptx .txt and more
                        <br />
                        <span className="text-slate-400 dark:text-slate-500">
                          drop a{' '}
                          <span className="font-medium text-emerald-600 dark:text-emerald-300">.coursemapper</span> file
                          to resume
                        </span>
                      </>
                    )}
                  </span>
                </div>

                <input
                  id="landing-file-input"
                  type="file"
                  multiple
                  accept={[...ACCEPTED_EXTENSIONS, ...PROJECT_EXTENSIONS].join(',')}
                  onChange={handleFileInput}
                  aria-label="Attach course files or open a Course Mapper project"
                  className="hidden"
                />

                {isDragging && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[22px] bg-blue-500/5">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-200">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      Drop course files or .coursemapper project
                    </div>
                  </div>
                )}

                {projectDragging && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[22px] border-2 border-dashed border-emerald-400/50 bg-emerald-500/5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                      <span>📂</span>
                      Open project
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5">
                {configCollapsed ? (
                  <div
                    data-testid="ai-config-summary"
                    className="flex items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface-alt/80 px-3 py-2 text-sm text-ink-muted"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink-secondary">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                      <span className="truncate">{configSummaryLabel} · Connected</span>
                    </span>
                    <button
                      onClick={expandConfigForEditing}
                      className="tactile flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-blue-600 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-400/10 dark:hover:text-blue-100"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                      Edit
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    {isReady && (
                      <button
                        onClick={collapseConfig}
                        className="tactile absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        title="Collapse AI config"
                        aria-label="Collapse AI configuration"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                    )}
                    <ModelConfig reserveTrailingActionSpace />
                  </div>
                )}
              </div>

              {scionSelected && promptText.trim().length >= 3 && (
                <details
                  data-testid="scion-evidence-forecast"
                  className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/55 px-4 py-3 text-left dark:border-indigo-400/20 dark:bg-indigo-400/10"
                >
                  {scionForecastStatus === 'checking' ? (
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-indigo-700 [&::-webkit-details-marker]:hidden dark:text-indigo-200">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                      Checking private source coverage…
                    </summary>
                  ) : scionCoverageForecast?.status === 'ready' ? (
                    <>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {scionCoverageForecast.externalNeeded === 0
                            ? `Private evidence ready for all ${scionCoverageForecast.requested} lessons`
                            : `${scionCoverageForecast.privateCovered}/${scionCoverageForecast.requested} lessons ready on this device`}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            scionCoverageForecast.externalNeeded === 0
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                              : scionResearchEnabled
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {scionCoverageForecast.externalNeeded === 0
                            ? 'No research needed'
                            : scionResearchEnabled
                              ? `${scionCoverageForecast.externalNeeded} source check${scionCoverageForecast.externalNeeded === 1 ? '' : 's'} planned`
                              : `${scionCoverageForecast.externalNeeded} source gap${scionCoverageForecast.externalNeeded === 1 ? '' : 's'}`}
                        </span>
                      </summary>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {scionCoverageForecast.externalNeeded === 0
                          ? 'Scion can ground these lesson knowledge kernels in EduTool’s source-anchored teaching library without an external request.'
                          : scionResearchEnabled
                            ? `Scion will check ${formatResearchProviderOrder(
                                scionCoverageForecast.researchPlan?.providerOrder,
                              )}, verify admitted claims against source passages, cache compact evidence on this device, and keep course authoring local.`
                            : `Choose “Use current sources & generate” to send only the course title and ${scionCoverageForecast.externalNeeded} uncovered lesson topic${scionCoverageForecast.externalNeeded === 1 ? '' : 's'} to ${formatResearchProviderOrder(
                                scionCoverageForecast.researchPlan?.providerOrder,
                              )}. Scion verifies source passages, saves compact evidence on this device, and gives that evidence to the local course writer.`}
                        {files.length > 0
                          ? ' Attached files are evaluated during the build and may close additional gaps.'
                          : ''}
                      </p>
                      {scionCoverageForecast.externalNeeded > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {scionCoverageForecast.lessons
                            .filter((lesson) => lesson.status !== 'private-ready')
                            .slice(0, 4)
                            .map((lesson) => (
                              <span
                                key={lesson.lessonId}
                                className="max-w-full truncate rounded-full border border-indigo-200/80 bg-white/70 px-2 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-300/20 dark:bg-slate-950/25 dark:text-indigo-100"
                              >
                                {formatCoverageTopicLabel(lesson.title)}
                              </span>
                            ))}
                          {scionCoverageForecast.externalNeeded > 4 && (
                            <span className="rounded-full px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                              +{scionCoverageForecast.externalNeeded - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <summary className="cursor-pointer list-none text-xs text-slate-600 [&::-webkit-details-marker]:hidden dark:text-slate-300">
                      Coverage will be checked again when the build starts.
                    </summary>
                  )}
                </details>
              )}

              {scionSelected &&
                (scionResearchEnabled ||
                  (scionCoverageForecast?.status === 'ready' && scionCoverageForecast.externalNeeded > 0)) && (
                  <p
                    data-testid="scion-external-source-notice"
                    className="mt-2 text-center text-xs leading-relaxed text-slate-600 dark:text-slate-300"
                  >
                    {scionCoverageForecast?.status === 'ready' && scionCoverageForecast.externalNeeded > 0 ? (
                      <>
                        Generating sends only the course title and {scionCoverageForecast.externalNeeded} uncovered
                        lesson topic{scionCoverageForecast.externalNeeded === 1 ? '' : 's'} to{' '}
                        {formatResearchProviderOrder(scionCoverageForecast.researchPlan?.providerOrder)}.
                      </>
                    ) : (
                      <>
                        Current-source research may send the course title and uncovered lesson topics to web providers.
                      </>
                    )}
                  </p>
                )}

              {canQuickStart && (
                <>
                  <button
                    type="button"
                    data-testid="landing-quick-start"
                    onClick={handleQuickStartClick}
                    disabled={isGenerating}
                    className="tactile btn-glow mt-5 w-full rounded-lg bg-slate-950 px-8 py-4 text-sm font-semibold tracking-wide text-white shadow-lg shadow-slate-950/15 transition-all duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:shadow-white/10"
                  >
                    <span className="flex items-center justify-center gap-2.5">
                      {quickStartNeedsCurrentSources ? 'Use sources & prepare plan' : 'Prepare full course plan'}
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </span>
                  </button>
                </>
              )}

              <button
                data-testid="landing-setup-button"
                onClick={onGenerate}
                disabled={!canGenerate || isGenerating}
                className={`tactile w-full rounded-lg px-8 py-3 text-sm font-semibold transition-all duration-200 ${
                  canQuickStart
                    ? 'mt-3 border border-line-strong bg-surface text-ink-tertiary hover:bg-surface-alt'
                    : 'mt-5'
                } ${
                  canGenerate && !isGenerating
                    ? canQuickStart
                      ? ''
                      : 'bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:brightness-110 dark:bg-white dark:text-slate-950'
                    : 'cursor-not-allowed bg-slate-200/90 text-slate-500 shadow-none dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                <span className="flex items-center justify-center gap-2.5">
                  {isGenerating ? 'Preparing…' : canQuickStart ? 'Customize package' : 'Continue to materials'}
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </span>
              </button>

              {!canGenerate && !isGenerating && (
                <p data-testid="landing-requirement" className="mt-2 text-center text-body text-ink-muted">
                  {landingRequirement}
                </p>
              )}
            </section>
          </div>
        </div>
      </main>

      <footer className="px-5 py-4 text-center">
        <div className="flex items-center justify-center gap-3 text-xs text-slate-500/80 dark:text-slate-400">
          {/* v0.13: the version number carries a "what's new" popover — the
              latest release summary on hover/focus, full history on click. */}
          <span className="group relative inline-block">
            <a
              href="#/changelog"
              className="font-medium transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300"
              aria-describedby="latest-release-popover"
            >
              v{LATEST_RELEASE.version}
            </a>
            <div
              id="latest-release-popover"
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-72 -translate-x-1/2 rounded-lg border border-slate-200/80 bg-white/95 p-3 text-left opacity-0 shadow-xl backdrop-blur-sm transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 dark:border-slate-700 dark:bg-slate-900/95"
            >
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                What's new in v{LATEST_RELEASE.version} · {LATEST_RELEASE.date}
              </p>
              <p className="mt-1 text-xs font-semibold leading-snug text-slate-700 dark:text-slate-200">
                {LATEST_RELEASE.title}
              </p>
              <ul className="mt-1.5 space-y-1">
                {LATEST_RELEASE.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                    <span className="mt-0.5 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#/changelog"
                className="mt-2 inline-block text-xs font-semibold text-blue-600 hover:underline dark:text-blue-300"
              >
                Read the full changelog →
              </a>
            </div>
          </span>
          <span>·</span>
          <a href="#/privacy" className="transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300">
            Privacy
          </a>
          <span>·</span>
          <a href="#/terms" className="transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300">
            Terms
          </a>
          <span>·</span>
          <a href="#/contact" className="transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300">
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}

function FileIcon({ ext }) {
  const colors = {
    doc: 'text-blue-500',
    docx: 'text-blue-500',
    odt: 'text-blue-400',
    rtf: 'text-blue-400',
    pdf: 'text-red-500',
    txt: 'text-slate-500',
    md: 'text-slate-500',
    csv: 'text-slate-500',
    html: 'text-orange-500',
    htm: 'text-orange-500',
    xlsx: 'text-green-500',
    xls: 'text-green-500',
    ods: 'text-green-400',
    ppt: 'text-amber-500',
    pptx: 'text-amber-500',
    odp: 'text-amber-400',
    epub: 'text-purple-500',
    zip: 'text-slate-600',
  };
  return (
    <div className={`flex-shrink-0 ${colors[ext] || 'text-slate-400'}`}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </div>
  );
}
