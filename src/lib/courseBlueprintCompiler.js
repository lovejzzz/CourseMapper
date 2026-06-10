import { COLUMN_EXTRACTORS } from './prompts/promptUtils';
import { finalizeCompiledDeliverableLanguage } from './compiledLanguageFinalizer';
import { getChunkCount } from './parallelGenerator';
import { getCustomDeliverable } from './customDeliverableLibrary';
import { buildObservationProtocol } from './observationProtocols';
import { whyThisWorksNote, buildMethodsStatement } from './knowledge/pedagogyEvidence';
import {
  describeInstructorPreferenceForFeature,
  normalizeInstructorPreferenceProfile,
  summarizeInstructorPreferenceProfile,
} from './instructorPreferenceProfile';

export const BLUEPRINT_COMPILED_FEATURES = new Set([
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'rubrics',
  'assignments',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

const CUSTOM_REFLECTION_PATTERN = /\b(reflection|reflective|check[-\s]?in|journal|exit ticket|debrief)\b/i;
const CUSTOM_READING_RESPONSE_PATTERN =
  /\b(reading response|reading responses|reading reflection|reading journal|reading log|annotation response|annotated response|reading recap)\b/i;
const CUSTOM_FEEDBACK_FORM_PATTERN =
  /\b(feedback form|feedback forms|peer feedback|feedback worksheet|critique form|review form|peer review form|revision feedback)\b/i;
const CUSTOM_PROJECT_MILESTONE_PATTERN =
  /\b(project milestone|milestone checklist|project checkpoint|project status|project progress|project plan checkpoint)\b/i;
const CUSTOM_LAB_REPORT_PATTERN =
  /\b(lab report|laboratory report|lab worksheet|experiment report|experiment worksheet|lab notebook checkpoint)\b/i;
const CUSTOM_CASE_BRIEF_PATTERN =
  /\b(case brief|case memo|case analysis worksheet|case preparation|case prep|case briefing)\b/i;
const CUSTOM_POLICY_MEMO_PATTERN =
  /\b(policy memo|memo checkpoint|briefing memo|policy brief|policy analysis memo|decision memo checkpoint)\b/i;
const CUSTOM_OBSERVATION_CHECKLIST_PATTERN =
  /\b(observation checklist|observation form|observation protocol|field observation|clinical observation|site observation)\b/i;
const CUSTOM_SELF_ASSESSMENT_PATTERN =
  /\b(self[-\s]?assessment|participation assessment|participation tracker|participation reflection|participation check[-\s]?in)\b/i;
const CUSTOM_CAPSTONE_PROGRESS_PATTERN =
  /\b(capstone progress|capstone checkpoint|capstone status|capstone progress report|capstone milestone|capstone update)\b/i;
const CUSTOM_PROBLEM_SET_PATTERN =
  /\b(problem set worksheet|problem[-\s]?set|practice problem worksheet|calculation worksheet|quantitative worksheet|worked example worksheet)\b/i;
const CUSTOM_TEMPLATE_EXCLUDE_PATTERN = /\b(quiz|exam|rubric|slide|syllabus|faq|assignment|discussion)\b/i;
const CUSTOM_PER_LESSON_PATTERN = /\b(lesson|week|per lesson|per week|each lesson|each week)\b/i;
const CUSTOM_STRUCTURED_TEMPLATE_DEFINITIONS = [
  { kind: 'feedback-form', defaultName: 'Feedback Form', pattern: CUSTOM_FEEDBACK_FORM_PATTERN },
  {
    kind: 'project-milestone-checklist',
    defaultName: 'Project Milestone Checklist',
    pattern: CUSTOM_PROJECT_MILESTONE_PATTERN,
  },
  { kind: 'lab-report', defaultName: 'Lab Report', pattern: CUSTOM_LAB_REPORT_PATTERN },
  { kind: 'case-brief', defaultName: 'Case Brief', pattern: CUSTOM_CASE_BRIEF_PATTERN },
  { kind: 'policy-memo-checkpoint', defaultName: 'Policy Memo Checkpoint', pattern: CUSTOM_POLICY_MEMO_PATTERN },
  {
    kind: 'observation-checklist',
    defaultName: 'Observation Checklist',
    pattern: CUSTOM_OBSERVATION_CHECKLIST_PATTERN,
  },
  {
    kind: 'participation-self-assessment',
    defaultName: 'Participation Self-Assessment',
    pattern: CUSTOM_SELF_ASSESSMENT_PATTERN,
  },
  {
    kind: 'capstone-progress-report',
    defaultName: 'Capstone Progress Report',
    pattern: CUSTOM_CAPSTONE_PROGRESS_PATTERN,
  },
  { kind: 'problem-set-worksheet', defaultName: 'Problem Set Worksheet', pattern: CUSTOM_PROBLEM_SET_PATTERN },
];

const DEFAULT_CLASS_SESSION_MINUTES = 110;
const FAQ_CATEGORIES = [
  'Course Logistics',
  'Assignment Clarification',
  'Concept Explanation',
  'Technical Help',
  'Assessment Prep',
];
function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyCustomArrayKey(value) {
  return (
    cleanText(value, 'items')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'items'
  );
}

function stripLessonPrefix(value) {
  return cleanText(value).replace(/^(?:lesson|week)\s*\d+\s*[:.-]\s*/i, '');
}

const OBJECTIVE_STEM_RE = /^students?\s+will\s+be\s+able\s+to:?$/i;

function stripListPrefix(value) {
  return cleanText(value)
    .replace(/^\s*(?:[-*•]|\(?\d+(?:\.\d+)*[a-z]?[.):]?\)?|\(?[a-z][.)]\)?)\s*/i, '')
    .replace(/^\s*[:–—-]\s*/, '');
}

function normalizeObjectiveText(value) {
  const stripped = stripListPrefix(value);
  const withoutStem = stripped.replace(/^students?\s+will\s+(?:be\s+able\s+to:?\s*)?/i, '').trim();
  if (withoutStem !== stripped.trim() && withoutStem) {
    return withoutStem.charAt(0).toUpperCase() + withoutStem.slice(1);
  }
  return withoutStem;
}

function isObjectiveStemOnly(value) {
  return OBJECTIVE_STEM_RE.test(cleanText(value));
}

function wordCount(value) {
  return (cleanText(value).match(/[A-Za-z0-9]+/g) || []).length;
}

function lessonTitle(lesson, lessonNumber) {
  return `Lesson ${lessonNumber}: ${stripLessonPrefix(lesson?.title || lesson?.lessonTitle || lesson?.lt || '') || `Topic ${lessonNumber}`}`;
}

function splitList(value) {
  if (Array.isArray(value)) {
    return value.flatMap(splitList);
  }
  // Split on newlines, semicolons, pipes, and bullets — but never on a
  // semicolon inside parentheses, so citations like
  // "Duke University Press (copyrighted text; library access)" stay whole.
  const text = String(value || '');
  const items = [];
  let current = '';
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (char === '\n' || char === '|' || char === '\u2022' || (char === ';' && depth === 0)) {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  return items.map((item) => stripListPrefix(item).trim()).filter(Boolean);
}

function unique(values, limit = 12) {
  const seen = new Set();
  const result = [];
  for (const value of values.map((item) => cleanText(item)).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function extractColumn(lesson, key) {
  const sections = Array.isArray(lesson?.sections) ? lesson.sections : [];
  const extractor = COLUMN_EXTRACTORS[key];
  if (!extractor) return '';
  return extractor.extract(sections);
}

function wordsFromConcepts(values, limit = 8) {
  const stopWords = new Set([
    'and',
    'for',
    'the',
    'with',
    'from',
    'into',
    'about',
    'using',
    'students',
    'student',
    'course',
    'lesson',
    'week',
    'will',
    'able',
    'their',
    'this',
    'that',
    'through',
    'apply',
    'analyze',
    'evaluate',
    'create',
    'what',
    'why',
    'how',
    'matters',
    'overview',
    'introduction',
    'intro',
  ]);
  // Emit multi-word phrases, never bare title tokens: splitting on whitespace
  // turned "Climate Science, Justice Frameworks" into fake concepts like
  // "Climate" and "Frameworks" that read as word salad in compiled prose.
  const candidates = values
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(/\n|;|\||•|:|,|\(|\)|–|—|\band\b|\bor\b|\bversus\b|\bvs\.?\b/i)
        .map((part) => stripListPrefix(part))
        .map((part) =>
          part
            .replace(OBJECTIVE_STEM_LEAD_RE, '')
            .replace(
              /\s+(?:in|for|across|within|through)\s+(?:context|course activities|this course|the course)\.?$/i,
              '',
            )
            .replace(/[.!?]+$/, '')
            .trim(),
        ),
    )
    .filter((phrase) => {
      if (!phrase) return false;
      const words = phrase.split(/\s+/);
      if (words.length > 6) return false;
      if (words.every((word) => word.length <= 3 || stopWords.has(word.toLowerCase()))) return false;
      if (/^\d/.test(phrase)) return false;
      return phrase.length > 3;
    });
  return unique(candidates, limit);
}

const OBJECTIVE_STEM_LEAD_RE =
  /^(?:students?\s+(?:will\s+)?(?:be\s+able\s+to\s+)?)?(?:define|explain|describe|analyze|evaluate|create|design|compare|apply|synthesize|formulate|interpret|critique|develop|construct|identify|use|build|examine|assess|distinguish|review|practice|connect)\s+/i;

function isQuestionLikeTitle(value) {
  return /^(?:what|why|how|when|where|who)\b/i.test(cleanText(value)) || /\b(?:and why|why it matters)\b/i.test(value);
}

function splitConceptValues(value) {
  return splitList(value).flatMap((item) =>
    cleanText(item)
      .split(/,\s*/)
      .map((part) => part.trim().replace(/^(?:and|or)\s+/i, ''))
      .filter(Boolean),
  );
}

function isObjectiveLikeConcept(value) {
  return (
    /^(?:analyze|evaluate|create|design|explain|compare|apply|synthesize|formulate|interpret|critique|develop|construct|identify|describe|use)\b/i.test(
      cleanText(value),
    ) && wordCount(value) > 4
  );
}

function isOverlongConceptCandidate(value) {
  const text = cleanText(value);
  return wordCount(text) > 7 || (/[.!?]$/.test(text) && wordCount(text) > 3);
}

function isOverbroadLessonTitleConcept(value, title) {
  const text = cleanText(value);
  const titleText = stripLessonPrefix(title || '');
  if (!text || !titleText || text.toLowerCase() !== titleText.toLowerCase()) return false;
  return wordCount(text) > 6 || isQuestionLikeTitle(text);
}

function normalizeConceptCandidates(values, { title = '', limit = 8 } = {}) {
  const candidates = unique(
    asArray(values)
      .flatMap((value) => splitConceptValues(value))
      .map((value) => normalizeObjectiveText(value))
      .filter(
        (value) =>
          value &&
          !isWeakConcept(value) &&
          !isObjectiveLikeConcept(value) &&
          !isOverlongConceptCandidate(value) &&
          !isOverbroadLessonTitleConcept(value, title),
      ),
    limit * 2,
  );
  // Substring-dedupe: "Camera Style" adds nothing next to "Cinematography and
  // Camera Style". Prefer the longer phrasing — replace a kept substring when
  // a superstring arrives, skip candidates already covered.
  const kept = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const coveredBy = kept.findIndex((existing) => existing.toLowerCase().includes(lower));
    if (coveredBy !== -1) continue;
    const covers = kept.findIndex((existing) => lower.includes(existing.toLowerCase()));
    if (covers !== -1) {
      kept[covers] = candidate;
      continue;
    }
    kept.push(candidate);
  }
  return kept.slice(0, limit);
}

function firstNonEmpty(...values) {
  return values.map((value) => cleanText(value)).find(Boolean) || '';
}

function sentenceCase(value) {
  const text = cleanText(value);
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinCriteriaSentence(criteria = []) {
  const parts = asArray(criteria)
    .map((criterion) => stripTerminalPunctuation(criterion))
    .filter(Boolean)
    .map((criterion) => criterion.charAt(0).toLowerCase() + criterion.slice(1));
  if (parts.length === 0) return 'meets the published success criteria.';
  return `${parts.join('; ')}.`;
}

function stripTerminalPunctuation(value) {
  return cleanText(value).replace(/[.!?]+$/g, '');
}

function compactList(values, fallback = 'course evidence', limit = 3) {
  const items = unique(values, limit);
  return items.length > 0 ? items.join(', ') : fallback;
}

const DANGLING_TAIL_RE =
  /(?:\s+(?:and|or|but|for|in|of|to|the|a|an|with|into|onto|from|on|at|by|that|which|as|before|after|around|between|against|toward|towards|about|through|will|should|must|can|their|its|this|these|those|when|while|where|whether|because|so|than|then|also|both|each|per|via|plus|aligned|using)|[,:;–—-])+$/i;

function trimDanglingTail(value) {
  let text = cleanText(value);
  let previous;
  do {
    previous = text;
    text = text.replace(DANGLING_TAIL_RE, '').trim();
  } while (text && text !== previous);
  return text;
}

function conciseClause(value, fallback = 'course evidence', maxLength = 120) {
  const firstItem = splitList(value)[0] || cleanText(value, fallback);
  const text = stripTerminalPunctuation(firstItem || fallback);
  if (text.length <= maxLength) return text;
  // Prefer ending on a clause boundary; otherwise cut at a word boundary and
  // trim any dangling connective so the clause still reads as complete.
  const slice = text.slice(0, maxLength);
  const clauseEnd = Math.max(slice.lastIndexOf(','), slice.lastIndexOf(';'));
  if (clauseEnd >= Math.floor(maxLength * 0.6)) {
    return trimDanglingTail(stripTerminalPunctuation(slice.slice(0, clauseEnd))) || fallback;
  }
  const wordCut = slice.replace(/\s+\S*$/g, '');
  // v0.12.1: a word-boundary cut can still strand a phrase head ("…inspect
  // in Instructor-provided" — 62 hits in the v0.12 audit, because the final
  // token is a content word the dangling-tail pass keeps). Back up to before
  // the last connective when it strands 1–3 trailing tokens, so the kept
  // clause ends on a complete phrase.
  const strandedPhrase = wordCut.match(
    /^(.+)\s(?:and|or|but|for|in|of|to|the|a|an|with|into|onto|from|on|at|by|that|which|as|before|after|around|between|against|toward|towards|about|through|when|while|where|whether|because|so|than|then|using|aligned)(?:\s\S+){1,3}$/i,
  );
  const candidate =
    strandedPhrase && strandedPhrase[1].length >= Math.floor(maxLength * 0.5) ? strandedPhrase[1] : wordCut;
  return trimDanglingTail(stripTerminalPunctuation(candidate)) || fallback;
}

function customPracticeContext(blueprint, lens) {
  const courseText = cleanText(
    [
      blueprint?.courseName,
      ...(blueprint?.lessons || []).flatMap((lesson) => [lesson?.title, ...(lesson?.keyConcepts || [])]),
    ].join(' '),
  ).toLowerCase();
  const domain = cleanText(lens?.domain, 'course work');
  if (
    /community health evaluation/i.test(domain) &&
    !/\b(community health|public health|healthcare|health care)\b/i.test(courseText)
  ) {
    return 'your course-specific work';
  }
  if (/\b(work|practice|lab|studio|seminar|workshop|placement|rehearsal)\b/i.test(domain)) return `your ${domain}`;
  return `your ${domain} work`;
}

function alternateLessonConcept(lesson, primary) {
  const generic = new Set(['clinical', 'community', 'health', 'studio', 'lesson', 'topic', 'block']);
  return (
    lesson.keyConcepts.find((concept) => {
      const normalized = cleanText(concept).toLowerCase();
      return normalized && normalized !== cleanText(primary).toLowerCase() && !generic.has(normalized);
    }) ||
    lesson.keyConcepts.find((concept) => cleanText(concept).toLowerCase() !== cleanText(primary).toLowerCase()) ||
    primary
  );
}

function hasCreativeProductionEvidence(text = '') {
  return /\b(creative writing|poetry workshop|fiction workshop|screenwriting workshop|playwriting workshop|draft workshop|workshop critique|manuscript|creative draft|scene draft|poem draft|fiction draft|short story draft|screenplay draft|revision portfolio|artist statement|process journal|line[-\s]?level revision|craft essay|studio art)\b/.test(
    text,
  );
}

function hasPerformingArtsEvidence(text = '') {
  const hasPerformanceDomain =
    /\b(acting studio|acting|theatre performance|theater performance|performance studio|performance lab|scene study|monologue|voice and movement|dance technique|dance composition|choreography|music ensemble|vocal performance|instrumental performance|musicianship|rehearsal studio|stagecraft|blocking|staging)\b/.test(
      text,
    );
  const hasRehearsalPractice =
    /\b(rehearsal|run[-\s]?through|performance recording|performance critique|director note|ensemble cue|movement phrase|vocal warm[-\s]?up|score study|blocking note|stage picture|audition|technique drill|peer critique)\b/.test(
      text,
    );
  return hasPerformanceDomain && hasRehearsalPractice;
}

function hasCaseMethodEvidence(text = '') {
  return (
    /\b(business strategy|mba|business case|strategy case|management case|market entry|competitive advantage|go[-\s]?to[-\s]?market|business model|operating margin|customer segment|executive memo|financial tradeoff)\b/.test(
      text,
    ) &&
    /\b(case method|case analysis|case discussion|case memo|case packet|recommendation memo|decision memo|decision criteria|stakeholder tradeoff|implementation risk)\b/.test(
      text,
    )
  );
}

function hasLegalDoctrinalEvidence(text = '') {
  return (
    /\b(constitutional law|legal doctrine|doctrinal analysis|legal memo|legal rule|statute|statutory interpretation|jurisdiction|standing|strict scrutiny|intermediate scrutiny|rational basis|constitutional standard|precedent)\b/.test(
      text,
    ) &&
    /\b(case brief|issue spotting|irac|holding|rationale|rule statement|hypothetical application|doctrinal limit|policy rationale|dissent|legal conclusion)\b/.test(
      text,
    )
  );
}

function hasInterpretiveHumanitiesEvidence(text = '') {
  const hasHumanitiesDomain =
    /\b(comparative literature|literary studies|english literature|world literature|film studies|film|cinema|media studies|humanities|art history|theatre|theater|poetry|novel|short story|cultural studies|history seminar|history course|historiography|primary source analysis)\b/.test(
      text,
    ) ||
    (/\bliterature\b/.test(text) &&
      /\b(close[-\s]?reading|interpretive claim|interpretive argument|passage evidence|textual evidence|translation choice|critical lens|genre convention|poetic form|narrative voice)\b/.test(
        text,
      ));
  return (
    hasHumanitiesDomain &&
    /\b(close[-\s]?reading|interpretive claim|interpretive argument|passage evidence|textual evidence|historical context|translation choice|critical lens|genre convention|visual analysis|scene analysis|primary source analysis|historiography|archive note|reception context|source integrity)\b/.test(
      text,
    )
  );
}

function hasLectureExamEvidence(text = '') {
  const hasSurveyCourse =
    /\b(introduction to|introductory|principles of|survey course|general education|large lecture|lecture course|lecture|foundations of|intro psychology|psychology|economics|sociology|political science|biology survey)\b/.test(
      text,
    );
  const hasExamPractice =
    /\b(exam|midterm|final|unit test|test bank|practice quiz|concept check|clicker question|retrieval practice|lecture notes|study guide|misconception check|exam blueprint)\b/.test(
      text,
    );
  return hasSurveyCourse && hasExamPractice;
}

function hasWorldLanguageEvidence(text = '') {
  const hasLanguageDomain =
    /\b(world language|foreign language|second language|language proficiency|spanish|french|mandarin|chinese|arabic|german|italian|japanese|korean|asl|american sign language|esl|english language learner|bilingual|heritage speaker)\b/.test(
      text,
    );
  const hasCommunicativePractice =
    /\b(conversation|dialogue|oral proficiency|speaking|listening|pronunciation|grammar|vocabulary|interpersonal|interpretive|presentational|cultural comparison|language function|can[-\s]?do statement|proficiency task|comprehensible input)\b/.test(
      text,
    );
  return hasLanguageDomain && hasCommunicativePractice;
}

function hasProgrammingLabEvidence(text = '') {
  const hasProgrammingDomain =
    /\b(programming|computer science|software engineering|software development|web development|data structures|intro to python|python|javascript|typescript|java|coding lab|code lab|software design|software studio)\b/.test(
      text,
    );
  const hasCodePractice =
    /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/.test(
      text,
    );
  return hasProgrammingDomain && hasCodePractice;
}

function hasDataScienceLabEvidence(text = '') {
  const hasDataDomain =
    /\b(data science|data analytics|business analytics|analytics lab|applied machine learning|machine learning|machine learning lab|statistical learning|data mining|predictive modeling|predictive analytics|model evaluation|data visualization|analytics dashboard|jupyter notebook|r notebook|notebook analysis|dataframe)\b/.test(
      text,
    ) ||
    (/\b(dataset|data set|csv|spreadsheet|data table|dataframe)\b/.test(text) &&
      /\b(model|visualization|dashboard|cleaning|wrangling|eda|exploratory|feature|validation|bias|fairness|prediction|classification|regression)\b/.test(
        text,
      ));
  const hasAnalyticsPractice =
    /\b(data cleaning|data wrangling|exploratory data analysis|eda|visualization|dashboard|model validation|train[-\s]?test|cross[-\s]?validation|feature engineering|predictive model|classification model|regression model|confusion matrix|validation metric|bias audit|fairness audit|data story|reproducible analysis|notebook report)\b/.test(
      text,
    );
  return hasDataDomain && hasAnalyticsPractice;
}

function hasStatisticsInferenceEvidence(text = '') {
  const hasStatisticsDomain =
    /\b(inferential statistics|statistical inference|introductory statistics|introduction to statistics|intro statistics|biostatistics|business statistics|applied statistics|statistics inference)\b/.test(
      text,
    ) ||
    (/\bstatistics\b/.test(text) &&
      /\b(confidence interval|hypothesis test|hypothesis testing|p[-\s]?value|sampling distribution|standard error|margin of error|test statistic|statistical significance)\b/.test(
        text,
      ));
  const hasInferencePractice =
    /\b(confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|p value|statistical significance|sampling distribution|standard error|margin of error|test statistic|t[-\s]?test|chi[-\s]?square|anova|regression inference|assumption check|effect size|type i error|type ii error|inference decision)\b/.test(
      text,
    );
  return hasStatisticsDomain && hasInferencePractice;
}

function hasInformationLiteracyEvidence(text = '') {
  const hasInformationDomain =
    /\b(information literacy|library research|research instruction|academic research skills|source evaluation|database search|bibliographic research|citation management|annotated bibliography|research librarian|library database)\b/.test(
      text,
    ) ||
    (/\b(research|source|sources|library|database|bibliography|citation)\b/.test(text) &&
      /\b(source credibility|peer[-\s]?reviewed|search strategy|keyword search|controlled vocabulary|citation trail|source evaluation|research question|synthesis matrix|annotated bibliography)\b/.test(
        text,
      ));
  const hasSourcePractice =
    /\b(database search|search strategy|keyword search|controlled vocabulary|source evaluation|credibility check|peer[-\s]?reviewed|scholarly source|citation trail|citation management|annotated bibliography|synthesis matrix|literature search|research log|source-use decision)\b/.test(
      text,
    );
  return hasInformationDomain && hasSourcePractice;
}

function hasTeacherPreparationEvidence(text = '') {
  const hasTeacherDomain =
    /\b(teacher preparation|teacher education methods|teaching methods|instructional methods|curriculum and instruction|student teaching seminar|teacher candidate|preservice teacher|pre-service teacher|lesson study|classroom teaching|pedagogy practicum)\b/.test(
      text,
    ) ||
    (/\b(teacher|teaching|educator|classroom|curriculum|instruction|pedagogy)\b/.test(text) &&
      /\b(lesson plan|unit plan|microteaching|micro-teaching|differentiation|formative assessment|classroom management|student work analysis|standards alignment|learning target|exit ticket|instructional strategy|reteach plan)\b/.test(
        text,
      ));
  const hasTeachingPractice =
    /\b(lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|standards alignment|learning target|differentiation|formative assessment|student work analysis|classroom management|instructional strategy|assessment plan|rubric calibration|scaffolding|reteach plan|family communication|edTPA|lesson study)\b/.test(
      text,
    );
  return hasTeacherDomain && hasTeachingPractice;
}

function hasCounselingPracticeEvidence(text = '') {
  const hasCounselingDomain =
    /\b(counseling skills|counselling skills|counselor education|counsellor education|social work practice|clinical social work|human services practice|helping skills|case management|mental health counseling|school counseling|family therapy|client interview|intake interview)\b/.test(
      text,
    ) ||
    (/\b(counseling|counselling|client|casework|social worker|therapeutic|helping relationship)\b/.test(text) &&
      /\b(active listening|reflective listening|motivational interviewing|intake|case conceptualization|risk assessment|safety plan|referral|treatment plan|service plan|boundary|rapport|empathy|strengths assessment)\b/.test(
        text,
      ));
  const hasPracticeEvidence =
    /\b(active listening|reflective listening|motivational interviewing|open question|affirmation|reflection|summary|oars|intake note|case conceptualization|biopsychosocial|risk assessment|safety plan|mandated reporting|referral plan|treatment plan|service plan|case note|process recording|session note|supervision note|client goal|rapport building|crisis response)\b/.test(
      text,
    );
  return hasCounselingDomain && hasPracticeEvidence;
}

function hasAccountingFinanceEvidence(text = '') {
  const hasFinanceDomain =
    /\b(financial accounting|managerial accounting|principles of accounting|introductory accounting|introduction to accounting|accounting|bookkeeping|cost accounting|corporate finance|principles of finance|introduction to finance|introductory finance|finance course|financial statement analysis|financial management|budgeting and forecasting)\b/.test(
      text,
    ) ||
    (/\bfinance\b/.test(text) &&
      /\b(balance sheet|income statement|cash[-\s]?flow|journal entr|debit|credit|ledger|trial balance|ratio analysis|financial ratio|variance analysis|budget variance|net present value|npv|valuation|working capital|break[-\s]?even|contribution margin)\b/.test(
        text,
      ));
  const hasFinancePractice =
    /\b(balance sheet|income statement|cash[-\s]?flow statement|cash[-\s]?flow forecast|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|closing entr(?:y|ies)|ratio analysis|financial ratio|current ratio|debt[-\s]?to[-\s]?equity|gross margin|budget variance|variance analysis|cost[-\s]?volume[-\s]?profit|break[-\s]?even|contribution margin|net present value|npv|discounted cash flow|valuation|working capital|audit trail|internal control)\b/.test(
      text,
    );
  return hasFinanceDomain && hasFinancePractice;
}

function hasPolicyAnalysisEvidence(text = '') {
  const hasPolicyDomain =
    /\b(public policy|policy analysis|policy design|policy evaluation|policy implementation|public administration|public affairs|urban policy|social policy|education policy|health policy|environmental policy|regulatory policy|governance)\b/.test(
      text,
    );
  const hasPolicyPractice =
    /\b(policy memo|policy brief|policy option|policy options|policy evidence|policy lab|policy studio|stakeholder analysis|stakeholder mapping|stakeholder map|equity analysis|environmental justice|implementation context|implementation plan|implementation planning|implementation constraint|feasibility|cost[-\s]?benefit|impact assessment|regulatory analysis|regulatory impact|regulatory impact analysis|public comment|benefit[-\s]?cost|logic model|theory of change|program evaluation|administrative burden|public value|policy trade[-\s]?off)\b/.test(
      text,
    );
  return hasPolicyDomain && hasPolicyPractice;
}

function hasEconomicsAnalysisEvidence(text = '') {
  const hasEconomicsDomain =
    /\b(microeconomics|macroeconomics|principles of economics|introduction to economics|introductory economics|intro economics|managerial economics|labor economics|development economics|environmental economics|health economics|economics course|economic analysis|economic theory)\b/.test(
      text,
    ) ||
    (/\beconomics?\b/.test(text) &&
      /\b(supply and demand|supply curve|demand curve|elasticity|market equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare analysis|monopoly|perfect competition|aggregate demand|aggregate supply)\b/.test(
        text,
      ));
  const hasEconomicsPractice =
    /\b(supply and demand|supply curve|demand curve|elasticity|market equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare analysis|incentive|scarcity|trade[-\s]?off|monopoly|perfect competition|gdp|inflation|unemployment|monetary policy|fiscal policy|aggregate demand|aggregate supply)\b/.test(
      text,
    );
  return hasEconomicsDomain && hasEconomicsPractice;
}

function hasEthicsArgumentEvidence(text = '') {
  const hasEthicsDomain =
    /\b(ethics|ethical reasoning|moral philosophy|moral reasoning|normative ethics|applied ethics|bioethics|business ethics|technology ethics|data ethics|environmental ethics|professional ethics|medical ethics|philosophy course|introduction to philosophy|intro philosophy)\b/.test(
      text,
    );
  const hasArgumentPractice =
    /\b(moral argument|ethical argument|argument map|argument mapping|normative framework|utilitarianism|deontology|virtue ethics|care ethics|rights theory|justice theory|moral dilemma|thought experiment|objection|counterargument|reply|principle|moral judgment|ethical judgment|trolley problem|case dilemma)\b/.test(
      text,
    );
  return hasEthicsDomain && hasArgumentPractice;
}

function hasClinicalJudgmentEvidence(text = '') {
  const hasClinicalDomain =
    /\b(nursing|clinical judgment|clinical reasoning|patient care|patient safety|medical[-\s]?surgical|med[-\s]?surg|pharmacology|allied health|clinical practice|health assessment)\b/.test(
      text,
    );
  const hasCarePlanningPractice =
    /\b(care plan|nursing diagnosis|sbar|handoff|patient assessment|assessment data|clinical decision|prioritization|priority setting|intervention plan|medication administration|medication safety|vital signs|deterioration|clinical cue|charting|ehr|pathophysiology|risk assessment|adpie|monitoring plan)\b/.test(
      text,
    );
  return hasClinicalDomain && hasCarePlanningPractice;
}

function hasClinicalPlacementEvidence(text = '') {
  const hasClinicalDomain =
    /\b(nursing|clinical|patient care|patient safety|allied health|healthcare|health care|clinical practice|clinical rotation|clinical site)\b/.test(
      text,
    );
  const hasPlacementPractice =
    /\b(clinical placement|clinical practicum|clinical rotation|clinical hours|clinical site|preceptor|site supervisor|supervised practice|placement handbook|patient encounter log|competency log|skills checklist|preceptor feedback|site evaluation|deidentified patient|confidentiality|hipaa|scope of practice|clinical conference)\b/.test(
      text,
    );
  return hasClinicalDomain && hasPlacementPractice;
}

function hasEngineeringDesignEvidence(text = '') {
  const hasEngineeringDomain =
    /\b(engineering design|mechanical engineering|electrical engineering|civil engineering|biomedical engineering|engineering lab|design-build-test|design build test|manufacturing|mechatronics|robotics|cad|solidworks|prototype fabrication)\b/.test(
      text,
    );
  const hasDesignTestPractice =
    /\b(requirement|requirements|constraint|constraints|specification|tolerance|load test|stress test|prototype test|bench test|failure analysis|design verification|verification test|test data|test fixture|trade[-\s]?off matrix|design review|redesign|iteration|safety factor|fabrication|measurement evidence)\b/.test(
      text,
    );
  return hasEngineeringDomain && hasDesignTestPractice;
}

function hasProofSeminarEvidence(text = '') {
  const hasProofDomain =
    /\b(proof[-\s]?based mathematics|mathematical proof|proof seminar|real analysis|abstract algebra|number theory|topology|discrete mathematics|advanced calculus|mathematical logic|theorem proving|proof writing)\b/.test(
      text,
    );
  const hasProofPractice =
    /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof strategy|direct proof|proof by contradiction|induction proof|epsilon[-\s]?delta|quantifier|logical implication|formal proof|proof critique|proof revision|proof portfolio)\b/.test(
      text,
    );
  return hasProofDomain && hasProofPractice;
}

function inferDisciplineLens(courseName, concepts = []) {
  const text = `${courseName} ${concepts.join(' ')}`.toLowerCase();
  if (hasProofSeminarEvidence(text)) {
    return {
      domain: 'proof-based mathematics seminar',
      evidenceNoun: 'proof evidence',
      decisionNoun: 'proof-strategy decision',
      learnerRole: 'mathematical proof writer',
      exampleNoun: 'theorem proof scenario',
    };
  }
  if (hasEngineeringDesignEvidence(text)) {
    return {
      domain: 'engineering design test lab',
      evidenceNoun: 'engineering test evidence',
      decisionNoun: 'design-verification decision',
      learnerRole: 'engineering designer',
      exampleNoun: 'prototype test scenario',
    };
  }
  if (hasStatisticsInferenceEvidence(text)) {
    return {
      domain: 'statistical inference',
      evidenceNoun: 'statistical evidence',
      decisionNoun: 'inference decision',
      learnerRole: 'statistical analyst',
      exampleNoun: 'inference scenario',
    };
  }
  if (hasInformationLiteracyEvidence(text)) {
    return {
      domain: 'information literacy and source research',
      evidenceNoun: 'source evidence',
      decisionNoun: 'source-use decision',
      learnerRole: 'academic researcher',
      exampleNoun: 'database search scenario',
    };
  }
  if (hasTeacherPreparationEvidence(text)) {
    return {
      domain: 'teacher preparation and instructional practice',
      evidenceNoun: 'classroom evidence',
      decisionNoun: 'instructional decision',
      learnerRole: 'teacher candidate',
      exampleNoun: 'microteaching lesson scenario',
    };
  }
  if (hasCounselingPracticeEvidence(text)) {
    return {
      domain: 'counseling and helping-skills practice',
      evidenceNoun: 'client-interaction evidence',
      decisionNoun: 'helping response decision',
      learnerRole: 'helping professional',
      exampleNoun: 'client-conversation scenario',
    };
  }
  if (hasAccountingFinanceEvidence(text)) {
    return {
      domain: 'accounting and finance analysis',
      evidenceNoun: 'financial evidence',
      decisionNoun: 'financial decision',
      learnerRole: 'financial analyst',
      exampleNoun: 'financial statement scenario',
    };
  }
  if (hasPolicyAnalysisEvidence(text)) {
    return {
      domain: 'public policy analysis',
      evidenceNoun: 'policy evidence',
      decisionNoun: 'policy decision',
      learnerRole: 'policy analyst',
      exampleNoun: 'policy memo scenario',
    };
  }
  if (hasEconomicsAnalysisEvidence(text)) {
    return {
      domain: 'economics analysis',
      evidenceNoun: 'economic evidence',
      decisionNoun: 'economic decision',
      learnerRole: 'economic analyst',
      exampleNoun: 'market analysis scenario',
    };
  }
  if (hasEthicsArgumentEvidence(text)) {
    return {
      domain: 'ethics argumentation',
      evidenceNoun: 'moral argument evidence',
      decisionNoun: 'moral decision',
      learnerRole: 'ethical reasoner',
      exampleNoun: 'ethical dilemma scenario',
    };
  }
  if (hasClinicalPlacementEvidence(text)) {
    return {
      domain: 'clinical placement practice',
      evidenceNoun: 'supervised clinical evidence',
      decisionNoun: 'clinical placement decision',
      learnerRole: 'clinical placement practitioner',
      exampleNoun: 'patient-care placement scenario',
    };
  }
  if (hasClinicalJudgmentEvidence(text)) {
    return {
      domain: 'clinical judgment and care planning',
      evidenceNoun: 'patient-assessment evidence',
      decisionNoun: 'clinical care decision',
      learnerRole: 'clinical decision maker',
      exampleNoun: 'patient-care case',
    };
  }
  if (hasDataScienceLabEvidence(text)) {
    return {
      domain:
        /\b(machine learning|predictive model|classification|regression|model evaluation)\b/.test(text) &&
        !/\b(analytics|data analysis|statistical analysis|statistics)\b/.test(text)
          ? 'applied machine learning lab'
          : 'data science analytics lab',
      evidenceNoun: 'validation and model-performance evidence',
      decisionNoun:
        /\b(machine learning|predictive model|classification|regression|model evaluation)\b/.test(text) &&
        !/\b(analytics|data analysis|statistical analysis|statistics)\b/.test(text)
          ? 'modeling decision'
          : 'analytic decision',
      learnerRole: 'data analyst',
      exampleNoun: 'dataset and notebook scenario',
    };
  }
  if (hasProgrammingLabEvidence(text)) {
    return {
      domain: 'software programming lab',
      evidenceNoun: 'code evidence',
      decisionNoun: 'implementation decision',
      learnerRole: 'software developer',
      exampleNoun: 'code review scenario',
    };
  }
  if (
    /\b(ai|prompt|automation|machine learning|generative ai|llm|large language model)\b/.test(text) ||
    (/\bmodel\b/.test(text) && /\b(ai|prompt|machine learning|predictive|generative)\b/.test(text))
  ) {
    return {
      domain: 'AI course design',
      evidenceNoun: 'design evidence',
      decisionNoun: 'implementation decision',
      learnerRole: 'course designer',
      exampleNoun: 'AI-supported teaching scenario',
    };
  }
  if (
    /\b(clinical|healthcare|health care|patient|interpreter|symptom|discharge|triage|medication|dosage)\b/.test(text)
  ) {
    return {
      domain: 'healthcare communication',
      evidenceNoun: 'role-play evidence',
      decisionNoun: 'clinical communication decision',
      learnerRole: 'healthcare communicator',
      exampleNoun: 'patient-care scenario',
    };
  }
  if (hasWorldLanguageEvidence(text)) {
    return {
      domain: 'communicative language learning',
      evidenceNoun: 'language-use evidence',
      decisionNoun: 'communication choice',
      learnerRole: 'language learner',
      exampleNoun: 'communicative scenario',
    };
  }
  if (
    /\b(field placement|placement|practicum|internship|site evidence|supervision|case handoff|professional boundary)\b/.test(
      text,
    )
  ) {
    return {
      domain: 'field placement practice',
      evidenceNoun: 'field evidence',
      decisionNoun: 'placement decision',
      learnerRole: 'field practitioner',
      exampleNoun: 'site-based practice scenario',
    };
  }
  if (
    /\b(capstone|senior project|client project|sponsor|project charter|project milestone|final showcase|portfolio defense)\b/.test(
      text,
    )
  ) {
    return {
      domain: 'capstone project integration',
      evidenceNoun: 'project evidence',
      decisionNoun: 'capstone decision',
      learnerRole: 'capstone project lead',
      exampleNoun: 'client project scenario',
    };
  }
  if (
    /\b(competency|proficiency|accreditation|standards[-\s]?aligned|program standard|performance task|evidence portfolio|mastery demonstration|benchmark|remediation plan)\b/.test(
      text,
    )
  ) {
    return {
      domain: 'competency-based assessment',
      evidenceNoun: 'competency evidence',
      decisionNoun: 'proficiency decision',
      learnerRole: 'competency candidate',
      exampleNoun: 'standards-aligned performance task',
    };
  }
  if (hasPerformingArtsEvidence(text)) {
    return {
      domain: 'performing arts rehearsal',
      evidenceNoun: 'performance evidence',
      decisionNoun: 'rehearsal decision',
      learnerRole: 'performing artist',
      exampleNoun: 'rehearsal scenario',
    };
  }
  if (hasCreativeProductionEvidence(text)) {
    return {
      domain: 'creative arts workshop',
      evidenceNoun: 'craft evidence',
      decisionNoun: 'revision decision',
      learnerRole: 'creative practitioner',
      exampleNoun: 'workshop draft',
    };
  }
  if (hasCaseMethodEvidence(text)) {
    return {
      domain: 'business strategy case method',
      evidenceNoun: 'case evidence',
      decisionNoun: 'strategic recommendation',
      learnerRole: 'case analyst',
      exampleNoun: 'business case scenario',
    };
  }
  if (hasLegalDoctrinalEvidence(text)) {
    return {
      domain: 'legal doctrine and case analysis',
      evidenceNoun: 'doctrinal evidence',
      decisionNoun: 'legal conclusion',
      learnerRole: 'legal analyst',
      exampleNoun: 'case hypothetical',
    };
  }
  if (hasInterpretiveHumanitiesEvidence(text)) {
    return {
      domain: 'interpretive humanities seminar',
      evidenceNoun: 'textual evidence',
      decisionNoun: 'interpretive claim',
      learnerRole: 'humanities interpreter',
      exampleNoun: 'passage or scene case',
    };
  }
  if (hasLectureExamEvidence(text)) {
    return {
      domain: 'conceptual lecture and exam preparation',
      evidenceNoun: 'concept-check evidence',
      decisionNoun: 'exam-readiness decision',
      learnerRole: 'conceptual learner',
      exampleNoun: 'lecture concept example',
    };
  }
  if (
    /\b(interaction design|prototype|wireframe|usability|design system|portfolio rationale|journey map)\b/.test(text)
  ) {
    return {
      domain: 'interaction design studio',
      evidenceNoun: 'prototype evidence',
      decisionNoun: 'design decision',
      learnerRole: 'studio designer',
      exampleNoun: 'studio critique case',
    };
  }
  if (
    /\b(community health|public health|population health|health equity|community program|program evaluation|community evaluation|health program)\b/.test(
      text,
    ) ||
    (/\b(health|community)\b/.test(text) && /\b(evaluation|program|implementation|stakeholder)\b/.test(text))
  ) {
    return {
      domain: 'community health evaluation',
      evidenceNoun: 'community evidence',
      decisionNoun: 'program decision',
      learnerRole: 'evaluation practitioner',
      exampleNoun: 'community implementation case',
    };
  }
  if (/\b(research|sampling|survey|interview|statistics|qualitative|quantitative|irb|ethics)\b/.test(text)) {
    return {
      domain: 'applied research methods',
      evidenceNoun: 'research evidence',
      decisionNoun: 'methodological decision',
      learnerRole: 'research practitioner',
      exampleNoun: 'study-design scenario',
    };
  }
  return {
    domain: 'applied course practice',
    evidenceNoun: 'course evidence',
    decisionNoun: 'professional decision',
    learnerRole: 'course practitioner',
    exampleNoun: 'applied case',
  };
}

function appendLensPhrase(value, addition, joiner = 'and') {
  const base = cleanText(value);
  const extra = cleanText(addition);
  if (!base) return extra;
  if (!extra) return base;
  const normalizedBase = base.toLowerCase();
  const normalizedExtra = extra.toLowerCase();
  if (normalizedBase.includes(normalizedExtra) || normalizedExtra.includes(normalizedBase)) return base;
  return `${base} ${joiner} ${extra}`;
}

function prefixLensPhrase(value, prefix, fallback) {
  const base = cleanText(value, fallback);
  const normalizedBase = base.toLowerCase();
  const normalizedPrefix = cleanText(prefix).toLowerCase();
  if (!normalizedPrefix || normalizedBase.startsWith(`${normalizedPrefix} `)) return base;
  return `${prefix} ${base}`;
}

function pluralizeLensPhrase(value) {
  const text = cleanText(value);
  if (!text) return '';
  const pluralizePart = (part) => {
    const cleaned = cleanText(part);
    if (!cleaned || /s$/i.test(cleaned)) return cleaned;
    if (/\bdecision$/i.test(cleaned)) return cleaned.replace(/\bdecision$/i, 'decisions');
    if (/\by$/i.test(cleaned)) return cleaned.replace(/y$/i, 'ies');
    return `${cleaned}s`;
  };
  if (/\s+or\s+/i.test(text))
    return text
      .split(/\s+or\s+/i)
      .map(pluralizePart)
      .join(' or ');
  if (/\s+and\s+/i.test(text))
    return text
      .split(/\s+and\s+/i)
      .map(pluralizePart)
      .join(' and ');
  return pluralizePart(text);
}

function alignLensToCourseModality(lens = {}, courseModalityProfile = {}) {
  const primaryMode = courseModalityProfile?.primaryMode || '';
  if (primaryMode === 'data-science-lab') {
    const dataScienceLensText = [lens.domain, lens.evidenceNoun, lens.decisionNoun, lens.learnerRole, lens.exampleNoun]
      .join(' ')
      .toLowerCase();
    if (
      /\b(data science|analytics|machine learning|model|validation|dataset|notebook|data analyst)\b/.test(
        dataScienceLensText,
      )
    ) {
      return {
        ...lens,
        evidenceNoun: /validation|model-performance|data-quality|fairness/.test(
          cleanText(lens.evidenceNoun).toLowerCase(),
        )
          ? lens.evidenceNoun
          : 'validation and model-performance evidence',
        decisionNoun: /model|analytic|threshold/.test(cleanText(lens.decisionNoun).toLowerCase())
          ? lens.decisionNoun
          : 'modeling decision',
        exampleNoun: /dataset|notebook|analytics/.test(cleanText(lens.exampleNoun).toLowerCase())
          ? lens.exampleNoun
          : 'dataset and notebook scenario',
      };
    }

    return {
      ...lens,
      domain: 'applied machine learning and data science lab',
      evidenceNoun: 'validation and model-performance evidence',
      decisionNoun: 'modeling decision',
      learnerRole: 'data science practitioner',
      exampleNoun: 'dataset and notebook scenario',
    };
  }
  if (primaryMode === 'clinical-placement-practicum') {
    const placementLensText = [lens.domain, lens.evidenceNoun, lens.decisionNoun, lens.learnerRole, lens.exampleNoun]
      .join(' ')
      .toLowerCase();
    if (
      /\b(clinical placement|preceptor|supervised clinical|clinical site|placement practitioner)\b/.test(
        placementLensText,
      )
    ) {
      return lens;
    }

    return {
      ...lens,
      domain: prefixLensPhrase(lens.domain, 'clinical placement', 'clinical placement practice'),
      evidenceNoun: appendLensPhrase(lens.evidenceNoun, 'supervised clinical evidence'),
      decisionNoun: appendLensPhrase(lens.decisionNoun, 'clinical placement decision', 'or'),
      learnerRole: prefixLensPhrase(lens.learnerRole, 'clinical placement', 'clinical placement practitioner'),
      exampleNoun: appendLensPhrase(lens.exampleNoun, 'patient-care placement scenario'),
    };
  }
  if (primaryMode !== 'clinical-simulation') return lens;

  const clinicalLensText = [lens.domain, lens.evidenceNoun, lens.decisionNoun, lens.learnerRole, lens.exampleNoun]
    .join(' ')
    .toLowerCase();
  if (
    /\b(clinical|healthcare|health care|patient|role[-\s]?play|simulation|interpreter|communication)\b/.test(
      clinicalLensText,
    )
  ) {
    return lens;
  }

  return {
    ...lens,
    domain: prefixLensPhrase(lens.domain, 'clinical', 'healthcare communication'),
    evidenceNoun: appendLensPhrase(lens.evidenceNoun, 'role-play evidence'),
    decisionNoun: appendLensPhrase(lens.decisionNoun, 'clinical communication decision', 'or'),
    learnerRole: prefixLensPhrase(lens.learnerRole, 'clinical', 'healthcare communicator'),
    exampleNoun: appendLensPhrase(lens.exampleNoun, 'patient-care simulation'),
  };
}

function normalizeEnrichmentTeachingMoves(value = {}) {
  const requiredKeys = ['openingMove', 'practiceMove', 'feedbackMove', 'assessmentMove', 'reviewMove'];
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(requiredKeys.map((key) => [key, cleanText(value[key])]).filter(([, text]) => text));
}

function buildDefaultEnrichmentTeachingMoves({ lens }) {
  return {
    openingMove: `Open with a short ${lens.exampleNoun} and ask students to name the ${lens.evidenceNoun} they can inspect.`,
    practiceMove: `Move students from naming inspectable ${lens.evidenceNoun} into a brief peer check on the ${lens.decisionNoun}.`,
    feedbackMove: `Give feedback by pointing to one visible ${lens.evidenceNoun} strength and one artifact revision move.`,
    assessmentMove: `Use the ${lens.decisionNoun} as the assessment throughline before students submit their artifact.`,
    reviewMove: `Before handoff, confirm local examples, source permissions, and scoring expectations for the ${lens.domain} context.`,
  };
}

function normalizeBlueprintEnrichment({
  courseName,
  lessons,
  courseConcepts,
  provided = {},
  courseModalityProfile = null,
}) {
  const providedTerms = Array.isArray(provided.signatureTerms) ? provided.signatureTerms : [];
  const signatureTerms = unique([...providedTerms, ...courseConcepts], 12);
  const lens = alignLensToCourseModality(
    {
      ...inferDisciplineLens(courseName, signatureTerms),
      ...(provided.lens && typeof provided.lens === 'object' ? provided.lens : {}),
    },
    courseModalityProfile,
  );
  const lessonPhrases = Object.fromEntries(
    lessons.map((lesson) => [
      lesson.id,
      {
        context: compactList(lesson.keyConcepts, stripLessonPrefix(lesson.title), 3),
        evidenceMove: `use ${lens.evidenceNoun} about ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)}`,
        decisionMove: `explain the ${lens.decisionNoun} for ${stripLessonPrefix(lesson.title)}`,
      },
    ]),
  );
  const teachingMoves = {
    ...buildDefaultEnrichmentTeachingMoves({ lens, lessons }),
    ...normalizeEnrichmentTeachingMoves(provided.teachingMoves),
  };

  return {
    source: provided.source || 'deterministic-blueprint-enrichment',
    lens,
    signatureTerms,
    lessonPhrases: {
      ...lessonPhrases,
      ...(provided.lessonPhrases && typeof provided.lessonPhrases === 'object' ? provided.lessonPhrases : {}),
    },
    teachingMoves,
    styleNotes: unique(
      [
        ...(Array.isArray(provided.styleNotes) ? provided.styleNotes : []),
        `Prefer concrete ${lens.domain} nouns over generic course-language templates.`,
        `Name the ${lens.evidenceNoun}, student output, and feedback use in long-form guidance.`,
      ],
      6,
    ),
    ...(provided.quality && typeof provided.quality === 'object' ? { quality: provided.quality } : {}),
    // Per-lesson content payloads (v0.9.1 subject-matter enrichment): pass
    // through untouched; lesson normalization attaches them per lesson.
    ...(provided.lessonContent && typeof provided.lessonContent === 'object'
      ? { lessonContent: provided.lessonContent }
      : {}),
  };
}

export function mergeBlueprintEnrichment(blueprint, enrichment = {}) {
  if (!blueprint || typeof blueprint !== 'object') return blueprint;
  return {
    ...blueprint,
    enrichment: normalizeBlueprintEnrichment({
      courseName: blueprint.courseName,
      lessons: blueprint.lessons || [],
      courseConcepts: blueprint.courseConcepts || [],
      provided: enrichment,
    }),
  };
}

function buildAdaptiveRepairPlan(blueprint = {}, { mode = 'deterministic' } = {}) {
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const repairRows = lessons
    .filter((lesson) => lesson?.compilerDecision?.reviewRequired || lesson?.compilerDecision?.localRepairUsed)
    .map((lesson) => {
      const inferredFields = Array.isArray(lesson?.sourceEvidenceTrace?.inferredOrDerivedFields)
        ? lesson.sourceEvidenceTrace.inferredOrDerivedFields
        : [];
      const missingSignals = Array.isArray(lesson?.missingSignals) ? lesson.missingSignals : [];
      const assessmentSource = lesson?.compilerDecision?.evidence?.assessmentSource || lesson?.assessmentSource || '';
      const confidenceLevel = lesson?.compilerDecision?.evidence?.confidenceLevel || lesson?.confidence?.level || '';
      const sourceRiskLevel =
        lesson?.compilerDecision?.evidence?.sourceRiskLevel || lesson?.sourceRisk?.riskLevel || 'unknown';
      const repairKinds = unique(
        [
          confidenceLevel && confidenceLevel !== 'high' ? 'source-confidence-review' : '',
          ['high', 'medium'].includes(sourceRiskLevel) ? 'source-risk-review' : '',
          missingSignals.length > 0 ? 'missing-source-signal' : '',
          inferredFields.length > 0 ? 'source-inferred-field' : '',
          assessmentSource === 'sparse-fallback' ? 'synthesized-assessment' : '',
          assessmentSource === 'evaluation-design-derived' ? 'derived-assessment' : '',
          assessmentSource && assessmentSource !== 'course-map' ? 'assessment-source-review' : '',
          lesson?.sourceConflict?.status && lesson.sourceConflict.status !== 'clear' ? 'source-conflict' : '',
        ].filter(Boolean),
        8,
      );
      return {
        lessonNumber: lesson.lessonNumber,
        lessonTitle: lesson.title,
        generationPath: lesson?.compilerDecision?.generationPath || 'missing',
        publishGate: lesson?.compilerDecision?.publishGate || 'missing',
        reviewRequired: Boolean(lesson?.compilerDecision?.reviewRequired),
        localRepairUsed: Boolean(lesson?.compilerDecision?.localRepairUsed),
        repairKinds,
        assessmentSource: assessmentSource || 'unknown',
        sourceRiskLevel,
        inferredFieldCount: inferredFields.length,
        missingSignalCount: missingSignals.length,
        reviewerAction: lessonLocalReviewAction(lesson),
      };
    });
  const localRepairRows = repairRows.filter((row) => row.localRepairUsed);
  const synthesizedAssessmentCount = repairRows.filter((row) =>
    row.repairKinds.includes('synthesized-assessment'),
  ).length;
  const derivedAssessmentCount = repairRows.filter((row) => row.repairKinds.includes('derived-assessment')).length;
  const sourceConflictCount = repairRows.filter((row) => row.repairKinds.includes('source-conflict')).length;
  const status = repairRows.length > 0 ? 'deterministic-repair-with-local-review' : 'deterministic-compile-no-repair';
  return {
    version: 1,
    source: 'adaptive-compiler-repair-plan',
    status,
    selectedCompileMode: mode,
    deterministicRepairCount: localRepairRows.length,
    localReviewRequiredCount: repairRows.filter((row) => row.reviewRequired).length,
    synthesizedAssessmentCount,
    derivedAssessmentCount,
    sourceConflictCount,
    modelGeneratedFallbackCount: 0,
    repairPolicy:
      'Use deterministic, source-marked repairs only when the source map is sparse or structurally messy; preserve local-review gates instead of inventing course facts.',
    escalationPolicy:
      repairRows.length > 0
        ? 'Ask the instructor or instructional designer to confirm the listed rows before export-ready classroom use.'
        : 'Use deterministic compile with instructor spot-check; optional enrichment may polish phrasing only after source grounding passes.',
    modelFallbackPolicy: {
      status: 'not-used-for-blueprint-compiled-core',
      allowedAfter: [
        'blueprint contract passes',
        'source-risk and assumption-ledger review gates remain visible',
        'fallback is limited to unsupported optional add-ons or post-generation format repair',
      ],
      blockedFor: [
        'inventing missing official dates, grading weights, readings, clinical/safety requirements, or institution policy',
        'hiding sparse source gaps that require instructor confirmation',
        'overriding deterministic blueprint evidence without a reviewable source anchor',
      ],
    },
    repairRows,
  };
}

function buildCompilerPathReceipt(blueprint, options = {}) {
  const enriched =
    blueprint?.enrichment?.source === 'model-blueprint-enrichment' &&
    blueprint?.enrichment?.quality?.status === 'accepted';
  const mode = options.compilerPath?.mode || options.compilePath?.mode || (enriched ? 'enriched' : 'deterministic');
  const reviewFlagCount = Number(blueprint?.qualitySignals?.reviewFlagCount || 0);
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const locallyRepairedLessonCount = lessons.filter((lesson) => (lesson.missingSignals || []).length > 0).length;
  const synthesizedAssessmentCount = lessons.filter((lesson) => lesson.assessmentSource === 'sparse-fallback').length;
  const derivedAssessmentCount = lessons.filter(
    (lesson) => lesson.assessmentSource === 'evaluation-design-derived',
  ).length;
  return {
    mode,
    source: enriched ? 'enriched-blueprint' : 'deterministic-blueprint',
    deterministicCompiler: true,
    enrichmentCallCount: enriched ? 1 : 0,
    repairPolicy:
      'safe deterministic repairs before compile; model repair only for unsupported or failed generated items',
    reason:
      options.compilerPath?.reason ||
      options.compilePath?.reason ||
      (enriched
        ? 'Accepted source-grounded blueprint enrichment before deterministic compilation.'
        : 'Compiled directly from the source-grounded course blueprint.'),
    reviewPolicy:
      reviewFlagCount > 0
        ? 'Review flagged sparse, repaired, duplicate, or conflicting source inputs before classroom handoff.'
        : 'Spot-check institution-specific facts, official dates, and local policy language before handoff.',
    adaptiveSafety: {
      status: reviewFlagCount > 0 ? 'review-required' : 'ready-with-spot-check',
      localRepair:
        reviewFlagCount > 0
          ? 'source-inferred or source-conflict fields compiled with local review required'
          : 'no source-inferred local repair needed',
      locallyRepairedLessonCount,
      synthesizedAssessmentCount,
      derivedAssessmentCount,
      humanReview:
        reviewFlagCount > 0
          ? 'required for flagged source gaps or conflicts before classroom handoff'
          : 'recommended for institution-specific facts and dates',
      modelFallback: 'not used for blueprint-compiled deliverables',
      recommendedPath:
        reviewFlagCount > 0 ? `${mode}-compile-with-local-review` : `${mode}-compile-with-instructor-spot-check`,
    },
    adaptiveRepairPlan: buildAdaptiveRepairPlan(blueprint, { mode }),
  };
}

function buildLessonCompilerDecision({ lesson, sourceRiskRow = {}, assessment = {} }) {
  const missingSignals = Array.isArray(lesson?.missingSignals) ? lesson.missingSignals : [];
  const inferredFields = Array.isArray(lesson?.sourceEvidenceTrace?.inferredOrDerivedFields)
    ? lesson.sourceEvidenceTrace.inferredOrDerivedFields
    : [];
  const confidenceLevel = lesson?.confidence?.level || 'unknown';
  const sourceRiskLevel = sourceRiskRow?.riskLevel || lesson?.sourceRisk?.riskLevel || 'unknown';
  const assessmentSource = assessment?.source || lesson?.assessmentSource || 'unknown';
  const needsSourceReview =
    confidenceLevel !== 'high' ||
    ['high', 'medium'].includes(sourceRiskLevel) ||
    missingSignals.length > 0 ||
    inferredFields.length > 0 ||
    assessmentSource !== 'course-map';
  const hasLocalRepair =
    missingSignals.length > 0 ||
    inferredFields.length > 0 ||
    ['sparse-fallback', 'evaluation-design-derived', 'compiler-inferred'].includes(assessmentSource);
  const generationPath = needsSourceReview
    ? hasLocalRepair
      ? 'deterministic-compile-with-source-repair-review'
      : 'deterministic-compile-with-local-review'
    : 'deterministic-compile';
  const publishGate = needsSourceReview
    ? 'local-review-required-before-publish'
    : 'instructor-spot-check-before-publish';
  const reviewFocus = unique(
    [
      ...(Array.isArray(sourceRiskRow?.reviewFocus) ? sourceRiskRow.reviewFocus : []),
      ...missingSignals.map((signal) => `Confirm ${signal.replace(/\.$/, '').toLowerCase()} before publishing.`),
      assessmentSource !== 'course-map'
        ? `Confirm the ${assessment?.title || lesson?.studentArtifact || 'assessment'} artifact, criteria, and weight against the official course plan.`
        : '',
      `Spot-check official dates, source permissions, institution policies, and local examples for ${stripLessonPrefix(lesson?.title)}.`,
    ],
    5,
  );

  return {
    version: 1,
    source: 'deterministic-compiler-decision',
    generationPath,
    safePath:
      generationPath === 'deterministic-compile'
        ? 'compile-from-blueprint-with-spot-check'
        : 'compile-from-blueprint-but-hold-for-local-review',
    publishGate,
    reviewRequired: needsSourceReview,
    localRepairUsed: hasLocalRepair,
    modelUsePolicy:
      'Do not use a model to invent missing course facts; use model enrichment only for source-grounded phrasing after the blueprint contract passes.',
    repairPolicy:
      'Compiler repairs may normalize structure, derive conservative source-marked fields, and preserve review flags; official facts must come from the instructor or course source.',
    reason: needsSourceReview
      ? `Compiled deterministically, but ${stripLessonPrefix(lesson?.title)} needs local review because source confidence is ${confidenceLevel}, source risk is ${sourceRiskLevel}, and assessment source is ${assessmentSource}.`
      : `Compiled deterministically from high-confidence source fields; instructor spot-check still confirms local facts before publishing.`,
    evidence: {
      confidenceLevel,
      confidenceScore: lesson?.confidence?.score ?? null,
      sourceRiskLevel,
      assessmentSource,
      directCourseMapFieldCount: lesson?.sourceEvidenceTrace?.directCourseMapFieldCount ?? null,
      inferredFieldCount: inferredFields.length,
      missingSignalCount: missingSignals.length,
    },
    reviewFocus,
  };
}

function buildCompilerDecisionMatrix(lessons = []) {
  const lessonRows = lessons.map((lesson) => ({
    lessonNumber: lesson.lessonNumber,
    lessonTitle: lesson.title,
    generationPath: lesson.compilerDecision?.generationPath || 'missing',
    publishGate: lesson.compilerDecision?.publishGate || 'missing',
    reviewRequired: Boolean(lesson.compilerDecision?.reviewRequired),
    localRepairUsed: Boolean(lesson.compilerDecision?.localRepairUsed),
    sourceRiskLevel: lesson.compilerDecision?.evidence?.sourceRiskLevel || 'missing',
    assessmentSource: lesson.compilerDecision?.evidence?.assessmentSource || 'missing',
    reviewFocus: lesson.compilerDecision?.reviewFocus || [],
  }));
  const reviewRequiredCount = lessonRows.filter((row) => row.reviewRequired).length;
  const localRepairCount = lessonRows.filter((row) => row.localRepairUsed).length;
  const missingDecisionCount = lessonRows.filter(
    (row) => row.generationPath === 'missing' || row.publishGate === 'missing',
  ).length;
  return {
    version: 1,
    source: 'deterministic-compiler-decision-matrix',
    status:
      missingDecisionCount > 0 ? 'blocked' : reviewRequiredCount > 0 ? 'review-required' : 'ready-with-spot-check',
    deterministicCompiler: true,
    modelFallback: 'not used for blueprint-compiled deliverables',
    reviewRequiredCount,
    localRepairCount,
    readyLessonCount: lessonRows.length - reviewRequiredCount,
    missingDecisionCount,
    lessonRows,
  };
}

function lessonPhrase(blueprint, lesson) {
  return (
    blueprint?.enrichment?.lessonPhrases?.[lesson.id] || {
      context: compactList(lesson.keyConcepts, stripLessonPrefix(lesson.title), 3),
      evidenceMove: `use course evidence about ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)}`,
      decisionMove: `explain the decision for ${stripLessonPrefix(lesson.title)}`,
    }
  );
}

function blueprintLens(blueprint) {
  return blueprint?.enrichment?.lens || inferDisciplineLens(blueprint?.courseName, blueprint?.courseConcepts || []);
}

function blueprintTeachingMoves(blueprint) {
  return (
    blueprint?.enrichment?.teachingMoves ||
    buildDefaultEnrichmentTeachingMoves({
      lens: blueprintLens(blueprint),
      lessons: blueprint?.lessons || [],
    })
  );
}

function lessonTeachingMoves(blueprint, lesson = {}) {
  const moves = blueprintTeachingMoves(blueprint);
  const lessonTitle = stripLessonPrefix(lesson.title || 'this lesson');
  const concept = lesson.keyConcepts?.[0] || lessonTitle;
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'student artifact');
  // v0.12.1: no "For ${lessonTitle}," prefix — every consumer already sits in
  // a lesson context, and the prefix produced "Practice with X: For X, …"
  // chains plus a mid-sentence period (the base moves end with one).
  return {
    openingMove: `${stripTerminalPunctuation(moves.openingMove)} around ${concept}.`,
    // The concept anchor keeps each lesson's move distinct — courses with a
    // single course-wide artifact would otherwise repeat one identical
    // sentence across every lesson (boilerplate gate).
    practiceMove: `${stripTerminalPunctuation(moves.practiceMove)}, anchored in ${concept}, before students revise ${artifact}.`,
    feedbackMove: `${stripTerminalPunctuation(moves.feedbackMove)} tied to ${artifact}.`,
    assessmentMove: `${stripTerminalPunctuation(moves.assessmentMove)} using ${artifact}.`,
    reviewMove: `${stripTerminalPunctuation(moves.reviewMove)} before publishing ${artifact}.`,
  };
}

function blueprintPreferenceProfile(blueprint) {
  return normalizeInstructorPreferenceProfile(blueprint?.instructorPreferenceProfile);
}

function featurePreference(blueprint, featureId) {
  return describeInstructorPreferenceForFeature(blueprintPreferenceProfile(blueprint), featureId);
}

function preferenceReceipt(profile) {
  const normalized = normalizeInstructorPreferenceProfile(profile);
  if (!normalized) return null;
  return {
    source: normalized.source,
    confidence: normalized.confidence,
    signalCount: normalized.signalCount,
    summary: summarizeInstructorPreferenceProfile(normalized),
    styleDirectives: normalized.styleDirectives,
    reviewNotes: normalized.reviewNotes,
  };
}

const BLOOM_TEXT_PATTERNS = [
  {
    level: 'Create',
    pattern:
      /\b(create|design|develop|construct|produce|compose|build|propose|formulate|generate|prototype|draft|revise|synthesize)\b/i,
  },
  {
    level: 'Evaluate',
    pattern:
      /\b(evaluate|assess|critique|judge|score|defend|justify|recommend|select|prioritize|argue|validate|test|calibrate)\b/i,
  },
  {
    level: 'Analyze',
    pattern:
      /\b(analyze|compare|differentiate|examine|investigate|interpret|categorize|map|trace|diagnose|distinguish)\b/i,
  },
  {
    level: 'Apply',
    pattern:
      /\b(apply|use|demonstrate|practice|implement|perform|calculate|complete|conduct|ask|respond|identify|explain)\b/i,
  },
];

function inferBloomLevelFromSignals(signals = [], fallback = 'Apply') {
  const entries = signals
    .map((signal) => ({
      source: signal?.source || 'source text',
      text: cleanText(signal?.text || ''),
    }))
    .filter((signal) => signal.text);

  for (const signal of entries) {
    for (const candidate of BLOOM_TEXT_PATTERNS) {
      const match = signal.text.match(candidate.pattern);
      if (match) {
        return {
          level: candidate.level,
          source: signal.source,
          matchedVerb: match[0].toLowerCase(),
          matchedSignal: signal.text.slice(0, 220),
          fallbackUsed: false,
        };
      }
    }
  }

  return {
    level: fallback,
    source: 'compiler-default',
    matchedVerb: '',
    matchedSignal: entries[0]?.text.slice(0, 220) || '',
    fallbackUsed: true,
  };
}

function syntheticAssessmentPatternForBloom(bloomsLevel) {
  const patterns = {
    Apply: { label: 'Concept check', verb: 'apply', output: 'short concept-check response' },
    Analyze: { label: 'Evidence memo', verb: 'analyze', output: 'brief evidence memo' },
    Evaluate: { label: 'Case worksheet', verb: 'evaluate', output: 'case worksheet' },
    Create: { label: 'Design note', verb: 'create', output: 'one-page design note' },
  };
  return patterns[bloomsLevel] || patterns.Apply;
}

function buildSyntheticAssessment({ title, concepts, outcomes, activities, bloomsLevel }) {
  const pattern = syntheticAssessmentPatternForBloom(bloomsLevel);
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson topic';
  const activity = activities[0] || `practice with ${concept}`;
  const objective = outcomes[0] || objectiveForLesson(title, concepts);
  return `${pattern.label}: ${pattern.verb} ${concept} through ${activity}; submit a ${pattern.output} that shows ${stripTerminalPunctuation(objective).toLowerCase()}.`;
}

const CRITERION_OBJECTIVE_ALIGNMENT_PATTERNS = [
  {
    strategy: 'source-evidence-objective-match',
    criterionPattern: /\b(accuracy|evidence|selection|source|grounded|concept)\b/i,
    objectivePattern: /\b(analyze|use|cite|source|evidence|identify|explain)\b/i,
  },
  {
    strategy: 'analysis-decision-objective-match',
    criterionPattern: /\b(analysis|logic|decision|reasoning|tradeoff|justify)\b/i,
    objectivePattern: /\b(evaluate|analyze|justify|decision|tradeoff|compare|reason)\b/i,
  },
  {
    strategy: 'communication-format-objective-match',
    criterionPattern: /\b(communication|organized|professional|format|audience|presentation)\b/i,
    objectivePattern: /\b(communicate|present|organize|explain|write|draft|compose|produce)\b/i,
  },
  {
    strategy: 'feedback-revision-objective-match',
    criterionPattern: /\b(feedback|revision|revise|improve|iterate)\b/i,
    objectivePattern: /\b(revise|feedback|improve|reflect|evaluate|iterate)\b/i,
  },
];

function alignmentTokens(value) {
  const stopWords = new Set([
    'and',
    'the',
    'for',
    'with',
    'that',
    'this',
    'from',
    'into',
    'using',
    'students',
    'lesson',
    'course',
    'will',
    'able',
    'criterion',
  ]);
  return unique(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 3 && !stopWords.has(token)),
    12,
  );
}

function buildCriterionObjectiveAlignment({ lesson, criteria, criterionWeightPlan = [], criterionEvidenceMap = [] }) {
  const objectives =
    Array.isArray(lesson?.outcomes) && lesson.outcomes.length > 0
      ? lesson.outcomes.map((objective) => cleanText(objective)).filter(Boolean)
      : [objectiveForLesson(lesson?.title, lesson?.keyConcepts || [])];
  const conceptText = (lesson?.keyConcepts || []).join(' ');

  return criteria.map((criterion, index) => {
    const planEntry = criterionWeightPlan[index] || {};
    const evidenceEntry = criterionEvidenceMap[index] || {};
    const criterionPurposeSignal = [criterion, planEntry.priority].filter(Boolean).join(' ');
    const criterionSignal = [criterion, planEntry.priority, evidenceEntry.evidenceNeeded, evidenceEntry.strongSignal]
      .filter(Boolean)
      .join(' ');
    const pattern =
      CRITERION_OBJECTIVE_ALIGNMENT_PATTERNS.find((entry) => entry.criterionPattern.test(criterionPurposeSignal)) ||
      CRITERION_OBJECTIVE_ALIGNMENT_PATTERNS.find((entry) => entry.criterionPattern.test(criterionSignal)) ||
      null;
    const criterionTokens = alignmentTokens(`${criterionSignal} ${conceptText}`);
    const ranked = objectives
      .map((objective) => {
        const objectiveTokens = alignmentTokens(objective);
        const overlap = objectiveTokens.filter((token) => criterionTokens.includes(token));
        const patternScore = pattern?.objectivePattern.test(objective) ? 3 : 0;
        const bloomSignal = inferBloomLevelFromSignals([{ source: 'objective', text: objective }]).level;
        const bloomScore =
          pattern?.strategy === 'analysis-decision-objective-match' && bloomSignal === 'Evaluate'
            ? 3
            : pattern?.strategy === 'analysis-decision-objective-match' && bloomSignal === 'Analyze'
              ? 1
              : pattern?.strategy === 'feedback-revision-objective-match' &&
                  ['Evaluate', 'Create'].includes(bloomSignal)
                ? 2
                : pattern?.strategy === 'source-evidence-objective-match' && ['Analyze', 'Apply'].includes(bloomSignal)
                  ? 1
                  : 0;
        return {
          objective,
          score: overlap.length + patternScore + bloomScore,
          matchedKeywords: overlap,
          bloomSignal,
        };
      })
      .sort((left, right) => right.score - left.score);
    const best = ranked[0] || { objective: objectives[0] || '', score: 0, matchedKeywords: [], bloomSignal: 'Apply' };
    const strategy =
      best.score > 0 ? pattern?.strategy || 'source-text-overlap-objective-match' : 'primary-source-objective-fallback';

    return {
      criterion,
      objective: best.objective,
      strategy,
      matchedKeywords: best.matchedKeywords,
      bloomSignal: best.bloomSignal,
      rationale:
        strategy === 'primary-source-objective-fallback'
          ? `No stronger source-text objective match was found, so this criterion stays tied to the primary lesson objective for local review.`
          : `Matched "${criterion}" to a source objective using criterion language, evidence cues, and cognitive demand rather than criterion position.`,
    };
  });
}

function objectiveForLesson(title, concepts) {
  const concept = normalizeConceptCandidates(concepts, { title, limit: 1 })[0] || 'the lesson focus';
  return `Analyze ${concept} using course evidence and explain how it informs an instructional or professional decision.`;
}

function successCriteriaForLesson(title, concepts) {
  const concept = normalizeConceptCandidates(concepts, { title, limit: 1 })[0] || 'the lesson focus';
  // Rotate phrasing by lesson title so synthesized criteria do not stamp the
  // identical sentence stem into every grading row and rubric in the course.
  const seed = Array.from(cleanText(title)).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const accuracyVariants = [
    `Names the relevant ${concept} concept accurately.`,
    `Uses ${concept} terminology precisely and in context.`,
    `Identifies the ${concept} idea the task depends on.`,
  ];
  const evidenceVariants = [
    `Uses specific evidence from the ${concept} materials or activity.`,
    `Cites a concrete detail from the ${concept} materials.`,
    `Grounds each claim in inspectable ${concept} evidence.`,
  ];
  const decisionVariants = [
    `Explains a ${concept} decision, implication, or next step instead of only summarizing.`,
    `Connects ${concept} evidence to a decision or next step rather than summary alone.`,
    `Justifies one ${concept} choice with evidence instead of restating the material.`,
  ];
  return [
    accuracyVariants[seed % accuracyVariants.length],
    evidenceVariants[(seed + 1) % evidenceVariants.length],
    decisionVariants[(seed + 2) % decisionVariants.length],
  ];
}

function containsWeakPlaceholder(value) {
  return /\b(?:tbd|to be determined|none|n\/a|not applicable)\b/i.test(cleanText(value));
}

function publishableCourseTerm(value) {
  const text = cleanText(value);
  if (
    !text ||
    /\b(?:tbd|to be determined|unknown|placeholder|replace with|semester year|course term|not specified|none|n\/a)\b/i.test(
      text,
    )
  ) {
    return 'Official term to confirm locally';
  }
  return text;
}

function meaningfulEntries(values) {
  return values.filter((value) => !isWeakConcept(value));
}

function hasMeaningfulAssessment(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return false;
  return !/^(none|n\/a|no assessment|not assessed|tbd|to be determined)$/i.test(text);
}

function fieldConfidence(source, derived = false) {
  if (source) return { source: 'course-map', confidence: 'high', score: 1 };
  if (derived) return { source: 'derived', confidence: 'medium', score: 0.75 };
  return { source: 'compiler-inferred', confidence: 'needs-review', score: 0.5 };
}

function confidenceLevel(score) {
  if (score >= 0.86) return 'high';
  if (score >= 0.68) return 'medium';
  return 'needs-review';
}

function assessmentConfidence({ hasWeeklyAssessment, hasEvaluationDesign, hasAssessmentPlaceholder }) {
  if (hasWeeklyAssessment && !hasAssessmentPlaceholder) {
    return { source: 'course-map', confidence: 'high', score: 1 };
  }
  if (hasWeeklyAssessment && hasAssessmentPlaceholder) {
    return { source: 'course-map-needs-review', confidence: 'medium', score: 0.7 };
  }
  if (hasEvaluationDesign) {
    return { source: 'evaluation-design-derived', confidence: 'medium', score: 0.75 };
  }
  return { source: 'sparse-fallback', confidence: 'needs-review', score: 0.55 };
}

function buildLessonConfidence({
  hasTitle,
  hasObjectives,
  hasGoals,
  hasTopics,
  hasActivities,
  hasResources,
  hasWeeklyAssessment,
  hasEvaluationDesign,
  hasAssessmentPlaceholder,
}) {
  const fields = {
    title: fieldConfidence(hasTitle, hasTopics),
    objectives: fieldConfidence(hasObjectives, hasGoals),
    topics: fieldConfidence(hasTopics, hasGoals),
    activities: fieldConfidence(hasActivities),
    resources: fieldConfidence(hasResources),
    assessment: assessmentConfidence({
      hasWeeklyAssessment,
      hasEvaluationDesign,
      hasAssessmentPlaceholder,
    }),
  };
  const scores = Object.values(fields).map((field) => field.score);
  const score = Number((scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length)).toFixed(2));
  return {
    level: confidenceLevel(score),
    score,
    fields,
  };
}

function sourceAnchor(field, source, text, confidence = 'medium') {
  return {
    field,
    source,
    confidence,
    anchor: cleanText(text).slice(0, 220),
  };
}

function sourceTraceField({
  field,
  sourceColumn,
  source,
  rawText,
  compiledValue,
  confidence = 'medium',
  purpose,
  fallbackReason = '',
}) {
  const raw = cleanText(rawText);
  const rawHasWeakPlaceholder = containsWeakPlaceholder(raw);
  const compiled = cleanText(Array.isArray(compiledValue) ? compiledValue.join('; ') : compiledValue);
  const safeRawText = rawHasWeakPlaceholder
    ? `Source field "${sourceColumn}" is unfinished and requires local review.`
    : raw || fallbackReason || 'Missing from course map.';
  return {
    field,
    sourceColumn,
    source,
    confidence,
    rawText: safeRawText.slice(0, 260),
    compiledValue: (compiled || raw || fallbackReason || 'Compiler review needed.').slice(0, 260),
    purpose,
    ...(rawHasWeakPlaceholder ? { rawStatus: 'unfinished-source-field' } : {}),
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}

const SECTION_COVERAGE_COLUMNS = [
  ['topicSection', 'topic'],
  ['learningObjectives', 'objectives'],
  ['learningGoals', 'goals'],
  ['weeklyAssessments', 'assessment'],
  ['evaluateDesign', 'evaluation'],
  ['asyncActivities', 'async'],
  ['syncActivities', 'sync'],
  ['supportingResources', 'resources'],
];

function buildSectionCoverageTrace(sourceSections = []) {
  const sections = Array.isArray(sourceSections) ? sourceSections : [];
  return sections.map((section, index) => {
    const allFields = SECTION_COVERAGE_COLUMNS.map(([sourceColumn, label]) => {
      const rawText = cleanText(section?.[sourceColumn]);
      return {
        sourceColumn,
        label,
        rawText,
        rawStatus: rawText && containsWeakPlaceholder(rawText) ? 'unfinished-source-field' : 'source-field',
      };
    }).filter((field) => field.rawText);
    const fields = allFields.filter((field) => field.rawStatus !== 'unfinished-source-field');
    const unfinishedSourceColumns = allFields
      .filter((field) => field.rawStatus === 'unfinished-source-field')
      .map((field) => field.sourceColumn);
    const rawText = fields.map((field) => `${field.label}: ${field.rawText}`).join('; ');
    const sectionLabel =
      [section?.topicSection, section?.learningGoals, section?.learningObjectives]
        .map((value) => cleanText(value))
        .find((value) => value && !containsWeakPlaceholder(value)) || `Section ${index + 1}`;
    return {
      sectionIndex: index,
      sectionNumber: index + 1,
      sectionLabel: sectionLabel.slice(0, 140),
      sourceColumns: fields.map((field) => field.sourceColumn),
      fieldCount: fields.length,
      rawText: rawText.slice(0, 700),
      ...(unfinishedSourceColumns.length > 0
        ? {
            unfinishedSourceColumns,
            unfinishedSourceColumnNote: `Section ${index + 1} had unfinished source fields removed from compiled package text.`,
          }
        : {}),
      preservedSignals: unique(
        wordsFromConcepts(
          fields.map((field) => field.rawText),
          10,
        ),
        10,
      ),
      coverageCue:
        fields.length > 0
          ? `Section ${index + 1} contributes ${fields.map((field) => field.label).join(', ')} evidence to the compiled lesson.`
          : `Section ${index + 1} needs local review because no source columns were available.`,
    };
  });
}

function buildSourceEvidenceTrace({
  lessonNumber,
  title,
  sourceSections,
  sourceLessonTitle,
  rawLessonTitle,
  objectiveText,
  goalText,
  topicText,
  resourceText,
  asyncActivityText,
  syncActivityText,
  weeklyAssessmentText,
  evaluationDesignText,
  outcomes,
  topics,
  activityPattern,
  readings,
  assessmentLink,
  confidence,
  hasTitle,
  hasObjectives,
  hasGoals,
  hasTopics,
  hasActivities,
  hasResources,
  hasWeeklyAssessment,
  hasEvaluationDesign,
  hasAssessmentPlaceholder,
}) {
  const assessmentSourceColumn = hasWeeklyAssessment
    ? 'weeklyAssessments'
    : hasEvaluationDesign
      ? 'evaluateDesign'
      : 'weeklyAssessments/evaluateDesign';
  const assessmentRawText = hasWeeklyAssessment ? weeklyAssessmentText : evaluationDesignText || weeklyAssessmentText;
  const fields = [
    sourceTraceField({
      field: 'lesson identity',
      sourceColumn: 'title',
      source: hasTitle ? 'course-map' : hasTopics ? 'derived-from-topicSection' : 'compiler-inferred',
      rawText: rawLessonTitle,
      compiledValue: title,
      confidence: confidence.fields.title.confidence,
      purpose: 'Sets the lesson label used across all compiled artifacts.',
      fallbackReason: hasTitle ? '' : 'Lesson title was weak or missing, so the compiler derived a publishable title.',
    }),
    sourceTraceField({
      field: 'learning objectives',
      sourceColumn: hasObjectives ? 'learningObjectives' : hasGoals ? 'learningGoals' : 'learningObjectives',
      source: hasObjectives ? 'course-map' : hasGoals ? 'derived-from-learningGoals' : 'compiler-inferred',
      rawText: hasObjectives ? objectiveText : goalText,
      compiledValue: outcomes,
      confidence: confidence.fields.objectives.confidence,
      purpose: 'Drives outcomes, quiz targets, lesson-plan goals, and syllabus alignment.',
      fallbackReason: hasObjectives ? '' : 'Objectives were absent or weak, so the compiler derived them from goals.',
    }),
    sourceTraceField({
      field: 'topic and concepts',
      sourceColumn: hasTopics ? 'topicSection' : 'learningGoals',
      source: hasTopics ? 'course-map' : hasGoals ? 'derived-from-learningGoals' : 'compiler-inferred',
      rawText: hasTopics ? topicText : goalText,
      compiledValue: topics,
      confidence: confidence.fields.topics.confidence,
      purpose: 'Seeds key concepts, slide sequence, discussion prompts, and study guide terms.',
      fallbackReason: hasTopics ? '' : 'Topic structure was absent or weak, so the compiler derived concepts.',
    }),
    sourceTraceField({
      field: 'learning activities',
      sourceColumn: 'syncActivities/asyncActivities',
      source: hasActivities ? 'course-map' : 'compiler-inferred',
      rawText: [syncActivityText, asyncActivityText].filter(Boolean).join('; '),
      compiledValue: activityPattern,
      confidence: confidence.fields.activities.confidence,
      purpose: 'Shapes teachable lesson flow, modality fit, discussion format, and slide practice.',
      fallbackReason: hasActivities
        ? ''
        : 'Activity details were missing, so the compiler used a conservative pattern.',
    }),
    sourceTraceField({
      field: 'readings and resources',
      sourceColumn: 'supportingResources',
      source: hasResources ? 'course-map' : 'compiler-inferred',
      rawText: resourceText,
      compiledValue: readings,
      confidence: confidence.fields.resources.confidence,
      purpose: 'Defines approved source cues, citation integrity guidance, and review flags.',
      fallbackReason: hasResources ? '' : 'Resources were missing, so official course materials require local review.',
    }),
    sourceTraceField({
      field: 'assessment artifact',
      sourceColumn: assessmentSourceColumn,
      source: confidence.fields.assessment.source,
      rawText: assessmentRawText,
      compiledValue: assessmentLink,
      confidence: confidence.fields.assessment.confidence,
      purpose: 'Anchors assignments, rubrics, quiz synthesis, feedback cycles, and package coherence.',
      fallbackReason:
        hasWeeklyAssessment && !hasAssessmentPlaceholder
          ? ''
          : hasEvaluationDesign
            ? 'Weekly assessment was derived from evaluation/design notes.'
            : 'Weekly assessment was synthesized from lesson goals and activities.',
    }),
  ];
  const preservedSignals = unique(
    fields.flatMap((field) => wordsFromConcepts([field.rawText, field.compiledValue], 5)),
    18,
  );

  const sourceRowLabel = cleanText(sourceLessonTitle || rawLessonTitle || `Lesson ${lessonNumber}`);
  const sectionCoverage = buildSectionCoverageTrace(sourceSections);
  const sourceSectionCount = Array.isArray(sourceSections) ? sourceSections.length : 0;
  return {
    version: 1,
    sourceKind: 'course-map-lesson-row',
    lessonNumber,
    lessonTitle: title,
    sourceRowLabel: containsWeakPlaceholder(sourceRowLabel)
      ? `Lesson ${lessonNumber} source title requires local review`
      : sourceRowLabel,
    sourceFields: fields,
    sourceSectionCount,
    sectionCoverageStatus: sourceSectionCount > 1 ? 'multi-section-traced' : 'single-section',
    sectionCoverage,
    preservedSignals,
    directCourseMapFieldCount: fields.filter((field) => field.source === 'course-map').length,
    inferredOrDerivedFields: fields
      .filter((field) => field.source !== 'course-map')
      .map((field) => ({ field: field.field, source: field.source, reason: field.fallbackReason || field.source })),
    unsupportedInferencePolicy:
      'Compiler-inferred fields preserve structure but must not be treated as official facts; local review must confirm missing readings, assessments, dates, policies, and source details before publishing.',
    reviewerUse:
      'Compare each rawText value against the compiledValue to confirm the package preserves source intent without inventing unsupported details.',
  };
}

const SOURCE_CONFLICT_FIELDS = ['lesson identity', 'learning objectives', 'topic and concepts', 'assessment artifact'];

function normalizeSourceConflictText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/source field "[^"]+" is unfinished and requires local review/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function sourceIdentityForConflictCheck(lesson = {}) {
  const sourceLabel = cleanText(lesson.sourceEvidenceTrace?.sourceRowLabel || lesson.title);
  const explicitPosition = sourceLabel.match(/\b(?:week|module|lesson)\s*0*(\d+)\b/i);
  if (explicitPosition) {
    const kind = explicitPosition[0].replace(/\s*\d+\s*$/i, '').trim() || 'Lesson';
    const number = Number(explicitPosition[1]);
    return {
      key: `position:${number}`,
      label: `${sentenceCase(kind)} ${number}`,
    };
  }
  const normalizedTitle = normalizeSourceConflictText(stripLessonPrefix(sourceLabel));
  return {
    key: normalizedTitle ? `title:${normalizedTitle}` : `row:${lesson.lessonNumber || lesson.id}`,
    label: stripLessonPrefix(sourceLabel) || lesson.title || `Lesson ${lesson.lessonNumber}`,
  };
}

function sourceConflictFieldValue(lesson = {}, fieldName) {
  const field = (lesson.sourceEvidenceTrace?.sourceFields || []).find((item) => item.field === fieldName);
  return normalizeSourceConflictText([field?.rawText, field?.compiledValue].filter(Boolean).join(' '));
}

function buildSourceConflictReport(lessons = []) {
  const groups = new Map();
  for (const lesson of lessons) {
    const identity = sourceIdentityForConflictCheck(lesson);
    if (!identity.key) continue;
    const group = groups.get(identity.key) || {
      key: identity.key,
      label: identity.label,
      lessons: [],
    };
    group.lessons.push(lesson);
    groups.set(identity.key, group);
  }

  const conflictGroups = [...groups.values()]
    .filter((group) => group.lessons.length > 1)
    .map((group) => {
      const conflictFields = SOURCE_CONFLICT_FIELDS.filter((fieldName) => {
        const values = unique(
          group.lessons.map((lesson) => sourceConflictFieldValue(lesson, fieldName)).filter(Boolean),
        );
        return values.length > 1;
      });
      const lessonNumbers = group.lessons.map((lesson) => lesson.lessonNumber);
      const status = conflictFields.length > 0 ? 'source-conflict' : 'duplicate-source-row';
      const issue =
        status === 'source-conflict'
          ? `Duplicate source row identity "${group.label}" appears in lessons ${lessonNumbers.join(
              ', ',
            )} and conflicts on ${conflictFields.join(', ')}.`
          : `Duplicate source row identity "${group.label}" appears in lessons ${lessonNumbers.join(', ')}.`;
      return {
        key: group.key,
        label: group.label,
        status,
        lessonNumbers,
        lessonTitles: group.lessons.map((lesson) => lesson.title),
        conflictFields,
        issue,
        reviewerAction: `${issue} Confirm whether these rows should be merged, split, renumbered, or replaced before publishing.`,
      };
    });

  const lessonRows = lessons.map((lesson) => {
    const group = conflictGroups.find((item) => item.lessonNumbers.includes(lesson.lessonNumber));
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      conflictStatus: group?.status || 'clear',
      conflictKey: group?.key || '',
      conflictLabel: group?.label || '',
      duplicateLessonNumbers: group?.lessonNumbers || [],
      conflictFields: group?.conflictFields || [],
      reviewerAction: group?.reviewerAction || '',
    };
  });

  return {
    version: 1,
    status:
      conflictGroups.length === 0
        ? 'clear'
        : conflictGroups.some((group) => group.status === 'source-conflict')
          ? 'source-conflicts-review-required'
          : 'duplicate-source-rows-review-required',
    policy:
      'Duplicate or conflicting source rows are preserved as local-review signals; the compiler may format them, but it must not silently merge or choose between contradictory official course-map rows.',
    duplicateGroupCount: conflictGroups.length,
    conflictingGroupCount: conflictGroups.filter((group) => group.status === 'source-conflict').length,
    duplicateLessonCount: lessonRows.filter((row) => row.conflictStatus !== 'clear').length,
    conflictGroups,
    lessonRows,
  };
}

function attachSourceConflictSignals(lessons = [], sourceConflictReport = {}) {
  const rowByLesson = new Map((sourceConflictReport.lessonRows || []).map((row) => [row.lessonNumber, row]));
  return lessons.map((lesson) => {
    const row = rowByLesson.get(lesson.lessonNumber);
    if (!row || row.conflictStatus === 'clear') {
      return {
        ...lesson,
        sourceConflict: {
          status: 'clear',
          duplicateLessonNumbers: [],
          conflictFields: [],
        },
      };
    }
    const conflictSignal =
      row.conflictStatus === 'source-conflict'
        ? `Source conflict: duplicate source row identity "${row.conflictLabel}" appears in lessons ${row.duplicateLessonNumbers.join(
            ', ',
          )} and conflicts on ${row.conflictFields.join(', ')}; local review must decide whether to merge, split, renumber, or replace the rows.`
        : `Duplicate source row: "${row.conflictLabel}" appears in lessons ${row.duplicateLessonNumbers.join(
            ', ',
          )}; local review must confirm whether this is intentional before publishing.`;
    const adjustedScore = Number(
      Math.min(lesson.confidence?.score || 0.75, row.conflictStatus === 'source-conflict' ? 0.66 : 0.74).toFixed(2),
    );
    const sourceConflict = {
      status: row.conflictStatus,
      conflictKey: row.conflictKey,
      conflictLabel: row.conflictLabel,
      duplicateLessonNumbers: row.duplicateLessonNumbers,
      conflictFields: row.conflictFields,
      issue: conflictSignal,
      reviewerAction: row.reviewerAction,
    };
    return {
      ...lesson,
      confidence: {
        ...lesson.confidence,
        level: confidenceLevel(adjustedScore),
        score: adjustedScore,
      },
      sourceAnchors: [
        ...(lesson.sourceAnchors || []),
        sourceAnchor('source conflict', 'compiler-detected', conflictSignal, 'needs-review'),
      ],
      sourceConflict,
      sourceEvidenceTrace: {
        ...lesson.sourceEvidenceTrace,
        sourceConflict,
        sourceConflictStatus: row.conflictStatus,
        reviewerUse: `${lesson.sourceEvidenceTrace?.reviewerUse || ''} ${row.reviewerAction}`.trim(),
      },
      missingSignals: unique([...(lesson.missingSignals || []), conflictSignal], 12),
    };
  });
}

function buildMissingSignals({
  hasTitle,
  hasObjectives,
  hasTopics,
  hasActivities,
  hasResources,
  hasWeeklyAssessment,
  hasEvaluationDesign,
  hasAssessmentPlaceholder,
}) {
  return [
    !hasTitle ? 'Lesson title was derived from topic or section fields.' : '',
    !hasObjectives ? 'Learning objectives were derived or inferred.' : '',
    !hasTopics ? 'Topic structure was derived from goals/title.' : '',
    !hasActivities ? 'Activity pattern was inferred from course context.' : '',
    !hasResources ? 'Readings/resources need local review.' : '',
    hasAssessmentPlaceholder ? 'Assessment source contained unfinished language and needs local review.' : '',
    !hasWeeklyAssessment && hasEvaluationDesign
      ? 'Weekly assessment was derived from evaluation/design notes and needs local review.'
      : '',
    !hasWeeklyAssessment && !hasEvaluationDesign
      ? 'Weekly assessment was synthesized from lesson goals and activities.'
      : '',
  ].filter(Boolean);
}

function buildWorkloadEstimate({ resources, hasAssessment, bloomsLevel }) {
  const beforeClassMinutes = resources.length > 0 ? Math.min(75, 20 + resources.length * 8) : 20;
  const afterClassBase = hasAssessment ? 55 : 35;
  const afterClassMinutes = ['Evaluate', 'Create'].includes(bloomsLevel) ? afterClassBase + 20 : afterClassBase;
  const inClassMinutes = DEFAULT_CLASS_SESSION_MINUTES;
  const totalStudentMinutes = beforeClassMinutes + inClassMinutes + afterClassMinutes;
  return {
    beforeClassMinutes,
    inClassMinutes,
    afterClassMinutes,
    totalStudentMinutes,
    studentFacingEstimate: `${Math.round(totalStudentMinutes / 30) / 2} hours including class time`,
    rationale: hasAssessment
      ? 'Includes preparation, live practice, and a concrete post-class artifact.'
      : 'Assessment details were sparse, so the after-class estimate stays conservative pending local review.',
  };
}

function classifyOutOfClassWorkload(outOfClassMinutes) {
  if (outOfClassMinutes > 150) return 'review-heavy-out-of-class-load';
  if (outOfClassMinutes > 120) return 'manageable-with-local-review';
  return 'manageable';
}

function buildClassSessionPlan({ lesson, modalityDecode, sessionMinutes = DEFAULT_CLASS_SESSION_MINUTES }) {
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the weekly artifact');
  const modality = modalityDecode || lesson.modalityDecode || {};
  const isOnlineHybrid = modality.mode === 'online-hybrid';
  const isInterpretiveHumanities = modality.mode === 'interpretive-humanities';
  const isLectureExam = modality.mode === 'lecture-exam';
  const isWorldLanguage = modality.mode === 'world-language';
  const isPerformingArts = modality.mode === 'performing-arts';
  const isProofSeminar = modality.mode === 'proof-seminar';
  const isEngineeringDesignLab = modality.mode === 'engineering-design-lab';
  const isStatisticsInference = modality.mode === 'statistics-inference';
  const isAccountingFinance = modality.mode === 'accounting-finance-analysis';
  const isPolicyAnalysis = modality.mode === 'policy-analysis';
  const isEconomicsAnalysis = modality.mode === 'economics-analysis';
  const isEthicsArgumentation = modality.mode === 'ethics-argumentation';
  const isInformationLiteracy = modality.mode === 'information-literacy';
  const isTeacherPreparation = modality.mode === 'teacher-preparation';
  const isCounselingPractice = modality.mode === 'counseling-practice';
  const isClinicalPlacement = modality.mode === 'clinical-placement-practicum';
  const isClinicalJudgment = modality.mode === 'clinical-judgment-simulation';
  const isDataScienceLab = modality.mode === 'data-science-lab';
  const isProgrammingLab = modality.mode === 'programming-lab';
  const segments = isOnlineHybrid
    ? [
        {
          phase: 'asynchronous readiness check',
          minutes: 10,
          purpose:
            lesson.prerequisitePlan?.diagnosticCheck ||
            `Use a low-stakes LMS prompt to check whether students can connect prior knowledge to ${stripLessonPrefix(lesson.title)}.`,
          evidenceOfLearning:
            lesson.readinessSupport?.readinessEvidence || `Students post one usable ${concept} cue before drafting.`,
        },
        {
          phase: 'model response or screencast',
          minutes: 15,
          purpose:
            lesson.teachingIntent?.modelingIntent ||
            `Show a short model response that explains how ${concept} changes one visible choice in ${artifact}.`,
          evidenceOfLearning:
            lesson.modelContrast?.contrastQuestion || `Students can explain why the stronger ${artifact} is stronger.`,
        },
        {
          phase: 'discussion-board evidence checkpoint',
          minutes: 20,
          purpose:
            modality.signaturePractice ||
            lesson.teachingIntent?.guidedPracticeIntent ||
            `Students practice applying ${concept} in a visible online checkpoint.`,
          evidenceOfLearning:
            modality.evidenceRoutine ||
            lesson.evidencePlan?.evidenceRequirement ||
            `Students cite evidence for ${concept} in the online checkpoint.`,
        },
        {
          phase: 'peer reply and revision cue',
          minutes: 25,
          purpose: `Students compare evidence choices in replies and improve ${artifact} before final submission.`,
          evidenceOfLearning:
            lesson.feedbackCycle?.formativeEvidence ||
            `Students identify one evidence-backed revision for ${artifact} from an online reply.`,
        },
        {
          phase: 'independent LMS artifact sprint',
          minutes: 25,
          purpose: `Students draft, rehearse, or revise ${artifact} using the lesson success criteria and LMS checklist.`,
          evidenceOfLearning:
            lesson.assessmentLink || lesson.studentArtifact || `Students submit a visible ${artifact} checkpoint.`,
        },
        {
          phase: 'feedback follow-up and transfer',
          minutes: Math.max(10, sessionMinutes - 95),
          purpose:
            lesson.learningTransferPlan?.transferTask ||
            `Students name how today's ${concept} work carries into the next online artifact.`,
          evidenceOfLearning:
            lesson.feedbackCycle?.closureCheck ||
            `Students submit or state one feedback-based revision to ${artifact}.`,
        },
      ]
    : isInterpretiveHumanities
      ? [
          {
            phase: 'evidence entry',
            minutes: 10,
            purpose:
              lesson.prerequisitePlan?.diagnosticCheck ||
              `Check whether students can point to a passage, scene, source, or context detail before interpreting ${concept}.`,
            evidenceOfLearning:
              lesson.readinessSupport?.readinessEvidence ||
              `Students name one specific evidence detail that could support or change an interpretation.`,
          },
          {
            phase: 'close-reading model',
            minutes: 15,
            purpose:
              lesson.teachingIntent?.modelingIntent ||
              `Model how a small evidence choice changes the interpretive claim in ${artifact}.`,
            evidenceOfLearning:
              lesson.modelContrast?.contrastQuestion ||
              `Students can explain why one interpretation is better anchored in evidence than another.`,
          },
          {
            phase: 'context and source check',
            minutes: 20,
            purpose:
              modality.signaturePractice ||
              lesson.teachingIntent?.guidedPracticeIntent ||
              `Students test how context, form, source limits, or medium changes the ${concept} interpretation.`,
            evidenceOfLearning:
              modality.evidenceRoutine ||
              lesson.evidencePlan?.evidenceRequirement ||
              `Students connect a specific evidence detail to a bounded interpretive claim.`,
          },
          {
            phase: 'competing interpretation challenge',
            minutes: 25,
            purpose: `Students compare interpretations and revise ${artifact} after a counter-reading or evidence challenge.`,
            evidenceOfLearning:
              lesson.feedbackCycle?.formativeEvidence ||
              `Students identify one evidence-backed claim revision for ${artifact}.`,
          },
          {
            phase: 'interpretive artifact sprint',
            minutes: 25,
            purpose: `Students draft or revise ${artifact} with visible evidence, context boundaries, and claim language.`,
            evidenceOfLearning:
              lesson.assessmentLink ||
              lesson.studentArtifact ||
              `Students produce a visible interpretive checkpoint for ${artifact}.`,
          },
          {
            phase: 'synthesis and transfer',
            minutes: Math.max(10, sessionMinutes - 95),
            purpose:
              lesson.learningTransferPlan?.transferTask ||
              `Students name how today's evidence move carries into the next interpretive artifact.`,
            evidenceOfLearning:
              lesson.feedbackCycle?.closureCheck ||
              `Students submit or state one source-grounded revision to the interpretation.`,
          },
        ]
      : isLectureExam
        ? [
            {
              phase: 'retrieval warm-up',
              minutes: 10,
              purpose:
                lesson.prerequisitePlan?.diagnosticCheck ||
                `Use a low-stakes prompt to retrieve the prior concept needed for ${concept}.`,
              evidenceOfLearning:
                lesson.readinessSupport?.readinessEvidence ||
                `Students answer one retrieval question and mark confidence before new instruction.`,
            },
            {
              phase: 'focused concept model',
              minutes: 15,
              purpose:
                lesson.teachingIntent?.modelingIntent ||
                `Explain ${concept} with one worked lecture example tied to the exam blueprint.`,
              evidenceOfLearning:
                lesson.modelContrast?.contrastQuestion ||
                `Students can explain why the stronger answer handles the misconception better.`,
            },
            {
              phase: 'guided concept check',
              minutes: 20,
              purpose:
                modality.signaturePractice ||
                lesson.teachingIntent?.guidedPracticeIntent ||
                `Students answer and explain an exam-style concept check for ${concept}.`,
              evidenceOfLearning:
                modality.evidenceRoutine ||
                lesson.evidencePlan?.evidenceRequirement ||
                `Students submit a concept-check answer plus reasoning and confidence.`,
            },
            {
              phase: 'misconception repair',
              minutes: 25,
              purpose: `Students sort common wrong answers, diagnose the misconception, and correct the explanation for ${artifact}.`,
              evidenceOfLearning:
                lesson.feedbackCycle?.formativeEvidence ||
                `Students write one corrected explanation after the misconception discussion.`,
            },
            {
              phase: 'exam-style transfer practice',
              minutes: 25,
              purpose: `Students apply ${concept} to a new exam-style prompt or quiz item using the success criteria.`,
              evidenceOfLearning:
                lesson.assessmentLink ||
                lesson.studentArtifact ||
                `Students complete a visible exam-practice checkpoint for ${artifact}.`,
            },
            {
              phase: 'study-guide handoff',
              minutes: Math.max(10, sessionMinutes - 95),
              purpose:
                lesson.learningTransferPlan?.transferTask ||
                `Students name how today's corrected explanation changes their next study-guide or practice-quiz move.`,
              evidenceOfLearning:
                lesson.feedbackCycle?.closureCheck ||
                `Students add one corrected concept statement to their study guide or retrieval log.`,
            },
          ]
        : isWorldLanguage
          ? [
              {
                phase: 'comprehensible input warm-up',
                minutes: 10,
                purpose:
                  lesson.prerequisitePlan?.diagnosticCheck ||
                  `Check whether students can understand one model utterance or short input sample for ${concept}.`,
                evidenceOfLearning:
                  lesson.readinessSupport?.readinessEvidence ||
                  `Students identify meaning, key vocabulary, and one uncertainty before speaking or writing.`,
              },
              {
                phase: 'language pattern noticing',
                minutes: 15,
                purpose:
                  lesson.teachingIntent?.modelingIntent ||
                  `Model the pronunciation, grammar, vocabulary, or cultural pattern students need for ${artifact}.`,
                evidenceOfLearning:
                  lesson.modelContrast?.contrastQuestion ||
                  `Students explain why one utterance is clearer, more accurate, or more culturally appropriate.`,
              },
              {
                phase: 'guided interpersonal rehearsal',
                minutes: 20,
                purpose:
                  modality.signaturePractice ||
                  lesson.teachingIntent?.guidedPracticeIntent ||
                  `Students rehearse ${concept} in paired or small-group target-language exchanges.`,
                evidenceOfLearning:
                  modality.evidenceRoutine ||
                  lesson.evidencePlan?.evidenceRequirement ||
                  `Students produce target-language utterances with meaning, accuracy, and comprehensibility evidence.`,
              },
              {
                phase: 'feedback and recast cycle',
                minutes: 25,
                purpose: `Students receive focused recasts or peer feedback, then revise the language choices in ${artifact}.`,
                evidenceOfLearning:
                  lesson.feedbackCycle?.formativeEvidence ||
                  `Students improve one utterance, phrase, or cultural choice after feedback.`,
              },
              {
                phase: 'presentational or interpretive transfer',
                minutes: 25,
                purpose: `Students transfer ${concept} into a short presentational, interpretive, or interpersonal performance.`,
                evidenceOfLearning:
                  lesson.assessmentLink ||
                  lesson.studentArtifact ||
                  `Students complete a visible proficiency checkpoint for ${artifact}.`,
              },
              {
                phase: 'proficiency reflection handoff',
                minutes: Math.max(10, sessionMinutes - 95),
                purpose:
                  lesson.learningTransferPlan?.transferTask ||
                  `Students name how today's language choice carries into the next communicative task.`,
                evidenceOfLearning:
                  lesson.feedbackCycle?.closureCheck ||
                  `Students submit or state one target-language revision and one next-use goal.`,
              },
            ]
          : isPerformingArts
            ? [
                {
                  phase: 'body voice or instrument readiness',
                  minutes: 10,
                  purpose:
                    lesson.prerequisitePlan?.diagnosticCheck ||
                    `Check whether students are physically, vocally, or instrumentally ready to rehearse ${concept}.`,
                  evidenceOfLearning:
                    lesson.readinessSupport?.readinessEvidence ||
                    `Students show one readiness cue before the rehearsal or performance run begins.`,
                },
                {
                  phase: 'technique model',
                  minutes: 15,
                  purpose:
                    lesson.teachingIntent?.modelingIntent ||
                    `Model the technique, staging, movement, musical, or interpretive choice students need for ${artifact}.`,
                  evidenceOfLearning:
                    lesson.modelContrast?.contrastQuestion ||
                    `Students can explain what changes between a weaker and stronger performance choice.`,
                },
                {
                  phase: 'guided rehearsal',
                  minutes: 20,
                  purpose:
                    modality.signaturePractice ||
                    lesson.teachingIntent?.guidedPracticeIntent ||
                    `Students rehearse ${concept} with instructor notes and observable performance evidence.`,
                  evidenceOfLearning:
                    modality.evidenceRoutine ||
                    lesson.evidencePlan?.evidenceRequirement ||
                    `Students produce a visible rehearsal attempt plus one note about the performance choice.`,
                },
                {
                  phase: 'critique and note uptake',
                  minutes: 25,
                  purpose: `Students receive director, instructor, or peer notes and revise one performance choice in ${artifact}.`,
                  evidenceOfLearning:
                    lesson.feedbackCycle?.formativeEvidence ||
                    `Students identify one note they will apply in the next run-through.`,
                },
                {
                  phase: 'performance run-through',
                  minutes: 25,
                  purpose: `Students perform ${artifact} again so the revised ${concept} choice is observable.`,
                  evidenceOfLearning:
                    lesson.assessmentLink ||
                    lesson.studentArtifact ||
                    `Students complete a visible performance run-through or recording for ${artifact}.`,
                },
                {
                  phase: 'rehearsal reflection and next cue',
                  minutes: Math.max(10, sessionMinutes - 95),
                  purpose:
                    lesson.learningTransferPlan?.transferTask ||
                    `Students name how today's rehearsal note carries into the next performance task.`,
                  evidenceOfLearning:
                    lesson.feedbackCycle?.closureCheck ||
                    `Students document one revised performance choice and one next rehearsal cue.`,
                },
              ]
            : isProofSeminar
              ? [
                  {
                    phase: 'definition and prerequisite check',
                    minutes: 10,
                    purpose:
                      lesson.prerequisitePlan?.diagnosticCheck ||
                      `Check whether students can state the relevant definition, hypothesis, or prior theorem for ${concept}.`,
                    evidenceOfLearning:
                      lesson.readinessSupport?.readinessEvidence ||
                      `Students identify one definition, hypothesis, or prior result before beginning the proof.`,
                  },
                  {
                    phase: 'theorem model and proof strategy',
                    minutes: 15,
                    purpose:
                      lesson.teachingIntent?.modelingIntent ||
                      `Model how to choose a proof strategy for ${artifact}, including hypotheses, conclusion, and logical path.`,
                    evidenceOfLearning:
                      lesson.modelContrast?.contrastQuestion ||
                      `Students can explain why one proof strategy fits the theorem statement better than another.`,
                  },
                  {
                    phase: 'guided proof construction',
                    minutes: 20,
                    purpose:
                      modality.signaturePractice ||
                      lesson.teachingIntent?.guidedPracticeIntent ||
                      `Students build a proof step-by-step with visible definition use and justified implications.`,
                    evidenceOfLearning:
                      modality.evidenceRoutine ||
                      lesson.evidencePlan?.evidenceRequirement ||
                      `Students produce a proof outline, lemma step, quantifier move, or justified implication tied to the claim.`,
                  },
                  {
                    phase: 'counterexample or edge-case test',
                    minutes: 25,
                    purpose: `Students test ${artifact} against boundary cases, missing hypotheses, or counterexamples before revising.`,
                    evidenceOfLearning:
                      lesson.feedbackCycle?.formativeEvidence ||
                      `Students identify one gap, edge case, counterexample, or hypothesis that changes the proof.`,
                  },
                  {
                    phase: 'proof critique and revision',
                    minutes: 25,
                    purpose: `Students revise ${artifact} after peer or instructor critique of logic, notation, and proof structure.`,
                    evidenceOfLearning:
                      lesson.assessmentLink ||
                      lesson.studentArtifact ||
                      `Students document one revised proof step with the definition or implication that justifies it.`,
                  },
                  {
                    phase: 'proof portfolio handoff',
                    minutes: Math.max(10, sessionMinutes - 95),
                    purpose:
                      lesson.learningTransferPlan?.transferTask ||
                      `Students name how today's proof move carries into the next theorem, lemma, or counterexample task.`,
                    evidenceOfLearning:
                      lesson.feedbackCycle?.closureCheck ||
                      `Students submit or state one valid proof step, one remaining risk, and one next proof-strategy decision.`,
                  },
                ]
              : isInformationLiteracy
                ? [
                    {
                      phase: 'research question and need check',
                      minutes: 10,
                      purpose:
                        lesson.prerequisitePlan?.diagnosticCheck ||
                        `Check whether students can state the information need, research question, and source boundary for ${concept}.`,
                      evidenceOfLearning:
                        lesson.readinessSupport?.readinessEvidence ||
                        `Students identify one research question, one source need, and one credibility risk before searching.`,
                    },
                    {
                      phase: 'database search model',
                      minutes: 15,
                      purpose:
                        lesson.teachingIntent?.modelingIntent ||
                        `Model one database or catalog search for ${artifact}, including keyword choice, controlled vocabulary, filters, and search refinement.`,
                      evidenceOfLearning:
                        lesson.modelContrast?.contrastQuestion ||
                        `Students can explain why one search strategy retrieves more relevant and credible source evidence than another.`,
                    },
                    {
                      phase: 'guided source retrieval',
                      minutes: 20,
                      purpose:
                        modality.signaturePractice ||
                        lesson.teachingIntent?.guidedPracticeIntent ||
                        `Students build the next ${concept} source set with visible search strings, database choices, filters, and citation-trail evidence.`,
                      evidenceOfLearning:
                        modality.evidenceRoutine ||
                        lesson.evidencePlan?.evidenceRequirement ||
                        `Students produce a research log entry, source-evaluation row, citation trail, or database-search trace tied to the question.`,
                    },
                    {
                      phase: 'credibility and relevance check',
                      minutes: 25,
                      purpose: `Students test ${artifact} against authority, relevance, evidence quality, bias, currency, and scholarly-source fit before accepting sources.`,
                      evidenceOfLearning:
                        lesson.feedbackCycle?.formativeEvidence ||
                        `Students revise one source choice after explaining which credibility, relevance, or citation-trail cue changed it.`,
                    },
                    {
                      phase: 'synthesis and attribution review',
                      minutes: 25,
                      purpose: `Students connect sources in ${artifact} through a synthesis matrix, attribution check, and source-use decision.`,
                      evidenceOfLearning:
                        lesson.assessmentLink ||
                        lesson.studentArtifact ||
                        `Students document one synthesis relationship, citation decision, or attribution correction with supporting source evidence.`,
                    },
                    {
                      phase: 'source-use handoff',
                      minutes: Math.max(10, sessionMinutes - 95),
                      purpose:
                        lesson.learningTransferPlan?.transferTask ||
                        `Students prepare the search strategy, selected sources, synthesis link, citation trail, and source-use decision that carry into the next research artifact.`,
                      evidenceOfLearning:
                        lesson.feedbackCycle?.closureCheck ||
                        `Students submit or state one defensible source-use decision, one source limit, and one next search refinement.`,
                    },
                  ]
                : isTeacherPreparation
                  ? [
                      {
                        phase: 'standards and learning-target check',
                        minutes: 10,
                        purpose:
                          lesson.prerequisitePlan?.diagnosticCheck ||
                          `Check whether teacher candidates can name the learning target, standard, and student evidence needed for ${concept}.`,
                        evidenceOfLearning:
                          lesson.readinessSupport?.readinessEvidence ||
                          `Candidates identify one learning target, one standard, and one student-evidence cue before planning instruction.`,
                      },
                      {
                        phase: 'teaching model or think-aloud',
                        minutes: 15,
                        purpose:
                          lesson.teachingIntent?.modelingIntent ||
                          `Model one instructional move for ${artifact}, including how the teacher checks student understanding.`,
                        evidenceOfLearning:
                          lesson.modelContrast?.contrastQuestion ||
                          `Candidates can explain why one teaching move better aligns the target, task, and student evidence.`,
                      },
                      {
                        phase: 'microteaching rehearsal',
                        minutes: 20,
                        purpose:
                          modality.signaturePractice ||
                          lesson.teachingIntent?.guidedPracticeIntent ||
                          `Teacher candidates rehearse the ${concept} teaching move with visible modeling, questioning, and student-response evidence.`,
                        evidenceOfLearning:
                          modality.evidenceRoutine ||
                          lesson.evidencePlan?.evidenceRequirement ||
                          `Candidates produce a lesson-plan segment, microteaching script, formative check, or student-response prompt tied to the learning target.`,
                      },
                      {
                        phase: 'student work and formative evidence analysis',
                        minutes: 25,
                        purpose: `Candidates inspect likely student responses for ${artifact}, diagnose misconceptions, and decide what evidence should trigger feedback or reteaching.`,
                        evidenceOfLearning:
                          lesson.feedbackCycle?.formativeEvidence ||
                          `Candidates revise one feedback or questioning move after analyzing student-work or formative-assessment evidence.`,
                      },
                      {
                        phase: 'differentiation and reteach planning',
                        minutes: 25,
                        purpose: `Candidates adapt ${artifact} for learner variability, accessibility, classroom management, and a targeted reteach decision.`,
                        evidenceOfLearning:
                          lesson.assessmentLink ||
                          lesson.studentArtifact ||
                          `Candidates document a differentiation support, assessment adjustment, or reteach plan with classroom evidence.`,
                      },
                      {
                        phase: 'lesson-plan handoff',
                        minutes: Math.max(10, sessionMinutes - 95),
                        purpose:
                          lesson.learningTransferPlan?.transferTask ||
                          `Candidates prepare the teaching plan, student-evidence check, and instructional decision that carry into the next classroom rehearsal.`,
                        evidenceOfLearning:
                          lesson.feedbackCycle?.closureCheck ||
                          `Candidates submit or state one defensible instructional decision, one student-evidence risk, and one next teaching revision.`,
                      },
                    ]
                  : isCounselingPractice
                    ? [
                        {
                          phase: 'client context and goal check',
                          minutes: 10,
                          purpose:
                            lesson.prerequisitePlan?.diagnosticCheck ||
                            `Check whether students can identify the client context, stated concern, and helping goal for ${concept}.`,
                          evidenceOfLearning:
                            lesson.readinessSupport?.readinessEvidence ||
                            `Students name one client cue, one helping goal, and one risk or ethics question before role-play.`,
                        },
                        {
                          phase: 'helping response model',
                          minutes: 15,
                          purpose:
                            lesson.teachingIntent?.modelingIntent ||
                            `Model one helping response for ${artifact}, including observable language, empathy, and boundary or safety reasoning.`,
                          evidenceOfLearning:
                            lesson.modelContrast?.contrastQuestion ||
                            `Students can explain why one response better fits the client cue, goal, and ethics boundary.`,
                        },
                        {
                          phase: 'role-play rehearsal and observation coding',
                          minutes: 20,
                          purpose:
                            modality.signaturePractice ||
                            lesson.teachingIntent?.guidedPracticeIntent ||
                            `Students rehearse the ${concept} helping move while peers code active listening, reflection, client goal alignment, and risk cues.`,
                          evidenceOfLearning:
                            modality.evidenceRoutine ||
                            lesson.evidencePlan?.evidenceRequirement ||
                            `Students produce a process note, transcript excerpt, or observation code tied to the client scenario.`,
                        },
                        {
                          phase: 'ethics risk and boundary review',
                          minutes: 25,
                          purpose: `Students test ${artifact} against confidentiality, mandated reporting, safety planning, boundaries, cultural humility, and referral needs.`,
                          evidenceOfLearning:
                            lesson.feedbackCycle?.formativeEvidence ||
                            `Students revise one helping response after naming the ethics, safety, or boundary evidence that changed it.`,
                        },
                        {
                          phase: 'case plan and referral decision',
                          minutes: 25,
                          purpose: `Students turn the role-play evidence into a case conceptualization, service plan, safety step, or referral decision for ${artifact}.`,
                          evidenceOfLearning:
                            lesson.assessmentLink ||
                            lesson.studentArtifact ||
                            `Students document one client-interaction evidence point, one helping response decision, and one referral or follow-up rationale.`,
                        },
                        {
                          phase: 'supervision handoff',
                          minutes: Math.max(10, sessionMinutes - 95),
                          purpose:
                            lesson.learningTransferPlan?.transferTask ||
                            `Students prepare the client-evidence summary, supervision question, and revised helping decision that carry into the next practice scenario.`,
                          evidenceOfLearning:
                            lesson.feedbackCycle?.closureCheck ||
                            `Students submit or state one defensible helping response decision, one risk to monitor, and one next supervision question.`,
                        },
                      ]
                    : isStatisticsInference
                      ? [
                          {
                            phase: 'question and assumption check',
                            minutes: 10,
                            purpose:
                              lesson.prerequisitePlan?.diagnosticCheck ||
                              `Check whether students can name the research question, variable or parameter, sample context, and assumption that shape ${concept}.`,
                            evidenceOfLearning:
                              lesson.readinessSupport?.readinessEvidence ||
                              `Students identify one question, variable or parameter, sample cue, and assumption before calculating.`,
                          },
                          {
                            phase: 'statistical model demonstration',
                            minutes: 15,
                            purpose:
                              lesson.teachingIntent?.modelingIntent ||
                              `Model one inference decision for ${artifact}, including the parameter, sampling distribution, assumption check, and uncertainty language.`,
                            evidenceOfLearning:
                              lesson.modelContrast?.contrastQuestion ||
                              `Students can explain why one confidence interval or hypothesis test interpretation is more defensible than another.`,
                          },
                          {
                            phase: 'guided calculation or software output',
                            minutes: 20,
                            purpose:
                              modality.signaturePractice ||
                              lesson.teachingIntent?.guidedPracticeIntent ||
                              `Students compute or inspect the next ${concept} result with visible formula, software output, and statistical evidence.`,
                            evidenceOfLearning:
                              modality.evidenceRoutine ||
                              lesson.evidencePlan?.evidenceRequirement ||
                              `Students produce a confidence interval, test statistic, p-value, effect-size note, or software-output trace tied to the question.`,
                          },
                          {
                            phase: 'interpretation and uncertainty check',
                            minutes: 25,
                            purpose: `Students interpret the interval, p-value, estimate, or effect size in ${artifact} using uncertainty and practical meaning.`,
                            evidenceOfLearning:
                              lesson.feedbackCycle?.formativeEvidence ||
                              `Students write one inference sentence that connects the numerical output to the sample, population, and uncertainty.`,
                          },
                          {
                            phase: 'assumption and limitation review',
                            minutes: 25,
                            purpose: `Students review ${artifact} for assumption fit, sampling limitations, statistical significance, and practical importance.`,
                            evidenceOfLearning:
                              lesson.assessmentLink ||
                              lesson.studentArtifact ||
                              `Students document one assumption risk, limitation, or alternate interpretation with a revised inference decision.`,
                          },
                          {
                            phase: 'inference handoff',
                            minutes: Math.max(10, sessionMinutes - 95),
                            purpose:
                              lesson.learningTransferPlan?.transferTask ||
                              `Students prepare the interpretation, assumption note, and limitation language that carry into the next inference task.`,
                            evidenceOfLearning:
                              lesson.feedbackCycle?.closureCheck ||
                              `Students submit or state one defensible inference decision, one uncertainty cue, and one remaining review question.`,
                          },
                        ]
                      : isAccountingFinance
                        ? [
                            {
                              phase: 'source document and account check',
                              minutes: 10,
                              purpose:
                                lesson.prerequisitePlan?.diagnosticCheck ||
                                `Check whether students can identify the transaction, statement line, account, or financial source that shapes ${concept}.`,
                              evidenceOfLearning:
                                lesson.readinessSupport?.readinessEvidence ||
                                `Students identify one source document, account classification, statement line, or assumption before calculating.`,
                            },
                            {
                              phase: 'financial statement or model demonstration',
                              minutes: 15,
                              purpose:
                                lesson.teachingIntent?.modelingIntent ||
                                `Model one financial decision for ${artifact}, including the account treatment, statement relationship, calculation logic, and control or assumption check.`,
                              evidenceOfLearning:
                                lesson.modelContrast?.contrastQuestion ||
                                `Students can explain why one journal entry, ratio, budget variance, cash-flow, or valuation treatment is more defensible than another.`,
                            },
                            {
                              phase: 'guided calculation and classification',
                              minutes: 20,
                              purpose:
                                modality.signaturePractice ||
                                lesson.teachingIntent?.guidedPracticeIntent ||
                                `Students classify, calculate, or model the next ${concept} step with visible financial evidence and formula logic.`,
                              evidenceOfLearning:
                                modality.evidenceRoutine ||
                                lesson.evidencePlan?.evidenceRequirement ||
                                `Students produce a journal entry, statement adjustment, ratio calculation, variance bridge, cash-flow forecast, or valuation trace tied to the source evidence.`,
                            },
                            {
                              phase: 'interpretation and control check',
                              minutes: 25,
                              purpose: `Students interpret the calculation or statement effect in ${artifact} and check whether the control, assumption, or classification holds.`,
                              evidenceOfLearning:
                                lesson.feedbackCycle?.formativeEvidence ||
                                `Students write one financial interpretation that connects the calculation to the account, statement, cash flow, budget, or valuation decision.`,
                            },
                            {
                              phase: 'assumption variance or risk review',
                              minutes: 25,
                              purpose: `Students review ${artifact} for assumption sensitivity, variance causes, control risk, classification errors, and decision consequences.`,
                              evidenceOfLearning:
                                lesson.assessmentLink ||
                                lesson.studentArtifact ||
                                `Students document one variance driver, control issue, assumption risk, or corrected financial treatment with the evidence that changed it.`,
                            },
                            {
                              phase: 'financial decision handoff',
                              minutes: Math.max(10, sessionMinutes - 95),
                              purpose:
                                lesson.learningTransferPlan?.transferTask ||
                                `Students prepare the statement effect, calculation trace, assumption note, and financial decision that carry into the next analysis task.`,
                              evidenceOfLearning:
                                lesson.feedbackCycle?.closureCheck ||
                                `Students submit or state one defensible financial decision, one key assumption or control, and one remaining review question.`,
                            },
                          ]
                        : isEngineeringDesignLab
                          ? [
                              {
                                phase: 'requirements and constraint check',
                                minutes: 10,
                                purpose:
                                  lesson.prerequisitePlan?.diagnosticCheck ||
                                  `Check whether students can name the design requirement, constraint, tolerance, or safety limit that shapes ${concept}.`,
                                evidenceOfLearning:
                                  lesson.readinessSupport?.readinessEvidence ||
                                  `Students identify one requirement, constraint, measurement target, or safety factor before building.`,
                              },
                              {
                                phase: 'engineering model or test demonstration',
                                minutes: 15,
                                purpose:
                                  lesson.teachingIntent?.modelingIntent ||
                                  `Model one engineering decision for ${artifact}, including the design rationale, test setup, and expected evidence.`,
                                evidenceOfLearning:
                                  lesson.modelContrast?.contrastQuestion ||
                                  `Students can explain why one prototype or test setup better verifies the requirement.`,
                              },
                              {
                                phase: 'guided prototype or calculation build',
                                minutes: 20,
                                purpose:
                                  modality.signaturePractice ||
                                  lesson.teachingIntent?.guidedPracticeIntent ||
                                  `Students build, calculate, simulate, or document the next ${concept} prototype step with visible engineering evidence.`,
                                evidenceOfLearning:
                                  modality.evidenceRoutine ||
                                  lesson.evidencePlan?.evidenceRequirement ||
                                  `Students produce a prototype note, CAD/schematic decision, calculation, or test setup tied to the requirement.`,
                              },
                              {
                                phase: 'test data and failure analysis',
                                minutes: 25,
                                purpose: `Students collect test data, compare it to requirements, and diagnose failure or margin in ${artifact}.`,
                                evidenceOfLearning:
                                  lesson.feedbackCycle?.formativeEvidence ||
                                  `Students record one test result, failure mode, tolerance issue, or measurement limitation.`,
                              },
                              {
                                phase: 'redesign review',
                                minutes: 25,
                                purpose: `Students revise ${artifact} after peer or instructor review of constraints, safety, performance, and tradeoffs.`,
                                evidenceOfLearning:
                                  lesson.assessmentLink ||
                                  lesson.studentArtifact ||
                                  `Students document one redesign decision with the evidence that changed it.`,
                              },
                              {
                                phase: 'verification handoff',
                                minutes: Math.max(10, sessionMinutes - 95),
                                purpose:
                                  lesson.learningTransferPlan?.transferTask ||
                                  `Students prepare verification evidence that carries into the next engineering design or test task.`,
                                evidenceOfLearning:
                                  lesson.feedbackCycle?.closureCheck ||
                                  `Students submit or state one verified requirement, unresolved risk, and next test decision.`,
                              },
                            ]
                          : isPolicyAnalysis
                            ? [
                                {
                                  phase: 'problem and authority check',
                                  minutes: 10,
                                  purpose:
                                    lesson.prerequisitePlan?.diagnosticCheck ||
                                    `Check whether students can define the public problem, affected population, authority, and evidence source that shape ${concept}.`,
                                  evidenceOfLearning:
                                    lesson.readinessSupport?.readinessEvidence ||
                                    `Students identify one policy problem, stakeholder, source, and decision authority before weighing options.`,
                                },
                                {
                                  phase: 'policy option demonstration',
                                  minutes: 15,
                                  purpose:
                                    lesson.teachingIntent?.modelingIntent ||
                                    `Model one policy decision for ${artifact}, including the problem definition, option logic, stakeholder effect, and feasibility constraint.`,
                                  evidenceOfLearning:
                                    lesson.modelContrast?.contrastQuestion ||
                                    `Students can explain why one policy option is more defensible than another under evidence, equity, feasibility, or implementation constraints.`,
                                },
                                {
                                  phase: 'stakeholder and evidence mapping',
                                  minutes: 20,
                                  purpose:
                                    modality.signaturePractice ||
                                    lesson.teachingIntent?.guidedPracticeIntent ||
                                    `Students map stakeholders, evidence, equity considerations, and implementation constraints for the next ${concept} decision.`,
                                  evidenceOfLearning:
                                    modality.evidenceRoutine ||
                                    lesson.evidencePlan?.evidenceRequirement ||
                                    `Students produce a stakeholder/evidence map, option matrix, cost-benefit note, or implementation-risk trace tied to the policy question.`,
                                },
                                {
                                  phase: 'equity feasibility and tradeoff review',
                                  minutes: 25,
                                  purpose: `Students test ${artifact} against equity, feasibility, cost, administrative burden, and stakeholder tradeoffs before recommending action.`,
                                  evidenceOfLearning:
                                    lesson.feedbackCycle?.formativeEvidence ||
                                    `Students revise one policy option after explaining the tradeoff, feasibility risk, or equity consequence that changed the recommendation.`,
                                },
                                {
                                  phase: 'implementation and risk check',
                                  minutes: 25,
                                  purpose: `Students review ${artifact} for implementation steps, unintended consequences, political or administrative risks, and local adaptation needs.`,
                                  evidenceOfLearning:
                                    lesson.assessmentLink ||
                                    lesson.studentArtifact ||
                                    `Students document one implementation risk, mitigation, local assumption, or revised policy design choice.`,
                                },
                                {
                                  phase: 'policy memo handoff',
                                  minutes: Math.max(10, sessionMinutes - 95),
                                  purpose:
                                    lesson.learningTransferPlan?.transferTask ||
                                    `Students prepare the problem definition, option comparison, equity/feasibility note, and policy decision that carry into the next memo or brief.`,
                                  evidenceOfLearning:
                                    lesson.feedbackCycle?.closureCheck ||
                                    `Students submit or state one defensible policy decision, one unresolved risk, and one next evidence need.`,
                                },
                              ]
                            : isEconomicsAnalysis
                              ? [
                                  {
                                    phase: 'economic question and market check',
                                    minutes: 10,
                                    purpose:
                                      lesson.prerequisitePlan?.diagnosticCheck ||
                                      `Check whether students can name the market, actors, constraint, and economic concept that shape ${concept}.`,
                                    evidenceOfLearning:
                                      lesson.readinessSupport?.readinessEvidence ||
                                      `Students identify one market condition, incentive, or tradeoff before modeling the decision.`,
                                  },
                                  {
                                    phase: 'economic model demonstration',
                                    minutes: 15,
                                    purpose:
                                      lesson.teachingIntent?.modelingIntent ||
                                      `Model one economic decision for ${artifact}, including assumptions, diagram or calculation logic, and predicted effect.`,
                                    evidenceOfLearning:
                                      lesson.modelContrast?.contrastQuestion ||
                                      `Students can explain why one economic interpretation is more defensible under the assumptions and evidence.`,
                                  },
                                  {
                                    phase: 'comparative statics or calculation build',
                                    minutes: 20,
                                    purpose:
                                      modality.signaturePractice ||
                                      lesson.teachingIntent?.guidedPracticeIntent ||
                                      `Students build the supply-demand, elasticity, surplus, incidence, or macro model step that supports the next ${concept} decision.`,
                                    evidenceOfLearning:
                                      modality.evidenceRoutine ||
                                      lesson.evidencePlan?.evidenceRequirement ||
                                      `Students produce a diagram, calculation trace, or assumption note tied to the economic question.`,
                                  },
                                  {
                                    phase: 'welfare incentive and assumption review',
                                    minutes: 25,
                                    purpose: `Students interpret ${artifact} through welfare effects, incentives, distributional burden, or assumption limits before recommending an action.`,
                                    evidenceOfLearning:
                                      lesson.feedbackCycle?.formativeEvidence ||
                                      `Students revise one economic explanation after naming the assumption, incentive, or welfare effect that changed it.`,
                                  },
                                  {
                                    phase: 'market failure or policy-effect check',
                                    minutes: 25,
                                    purpose: `Students review ${artifact} for externality, market power, price-control, tax-incidence, or macro-policy effects and identify the strongest evidence limit.`,
                                    evidenceOfLearning:
                                      lesson.assessmentLink ||
                                      lesson.studentArtifact ||
                                      `Students document one economic effect, caveat, or revised model choice with the evidence that changed it.`,
                                  },
                                  {
                                    phase: 'economic analysis handoff',
                                    minutes: Math.max(10, sessionMinutes - 95),
                                    purpose:
                                      lesson.learningTransferPlan?.transferTask ||
                                      `Students prepare the model, assumption, evidence limit, and economic decision that carry into the next analysis brief.`,
                                    evidenceOfLearning:
                                      lesson.feedbackCycle?.closureCheck ||
                                      `Students submit or state one defensible economic decision, one assumption to monitor, and one remaining evidence need.`,
                                  },
                                ]
                              : isEthicsArgumentation
                                ? [
                                    {
                                      phase: 'ethical issue and stakeholder check',
                                      minutes: 10,
                                      purpose:
                                        lesson.prerequisitePlan?.diagnosticCheck ||
                                        `Check whether students can name the moral issue, affected parties, values, and decision context that shape ${concept}.`,
                                      evidenceOfLearning:
                                        lesson.readinessSupport?.readinessEvidence ||
                                        `Students identify one moral issue, stakeholder, value conflict, and decision point before argument work.`,
                                    },
                                    {
                                      phase: 'normative framework model',
                                      minutes: 15,
                                      purpose:
                                        lesson.teachingIntent?.modelingIntent ||
                                        `Model one moral decision for ${artifact}, including the claim, reasons, framework, and evidence limit.`,
                                      evidenceOfLearning:
                                        lesson.modelContrast?.contrastQuestion ||
                                        `Students can explain why one moral argument is more defensible under a named framework than another.`,
                                    },
                                    {
                                      phase: 'argument map construction',
                                      minutes: 20,
                                      purpose:
                                        modality.signaturePractice ||
                                        lesson.teachingIntent?.guidedPracticeIntent ||
                                        `Students map claim, reasons, principle, example, and assumption before defending the next ${concept} decision.`,
                                      evidenceOfLearning:
                                        modality.evidenceRoutine ||
                                        lesson.evidencePlan?.evidenceRequirement ||
                                        `Students produce an argument map, principle comparison, thought-experiment note, or dilemma analysis tied to the ethical question.`,
                                    },
                                    {
                                      phase: 'objection reply and case pressure',
                                      minutes: 25,
                                      purpose: `Students test ${artifact} against a serious objection, counterexample, competing framework, or case variation before revising the judgment.`,
                                      evidenceOfLearning:
                                        lesson.feedbackCycle?.formativeEvidence ||
                                        `Students revise one moral argument after explaining which objection, counterexample, or framework pressure changed it.`,
                                    },
                                    {
                                      phase: 'application and judgment review',
                                      minutes: 25,
                                      purpose: `Students review ${artifact} for moral principle fit, stakeholder harm, rights or justice implications, and limits of the judgment.`,
                                      evidenceOfLearning:
                                        lesson.assessmentLink ||
                                        lesson.studentArtifact ||
                                        `Students document one ethical judgment, one unresolved tradeoff, and one argument revision supported by evidence.`,
                                    },
                                    {
                                      phase: 'ethical argument handoff',
                                      minutes: Math.max(10, sessionMinutes - 95),
                                      purpose:
                                        lesson.learningTransferPlan?.transferTask ||
                                        `Students prepare the claim, framework, objection, reply, and moral decision that carry into the next argument brief.`,
                                      evidenceOfLearning:
                                        lesson.feedbackCycle?.closureCheck ||
                                        `Students submit or state one defensible moral decision, one objection they can answer, and one remaining review question.`,
                                    },
                                  ]
                                : isClinicalPlacement
                                  ? [
                                      {
                                        phase: 'clinical site readiness and confidentiality check',
                                        minutes: 10,
                                        purpose:
                                          lesson.prerequisitePlan?.diagnosticCheck ||
                                          `Check whether students can name the site expectation, scope limit, confidentiality rule, and patient-safety cue that shape ${concept}.`,
                                        evidenceOfLearning:
                                          lesson.readinessSupport?.readinessEvidence ||
                                          `Students identify one clinical-site expectation, one confidentiality risk, and one patient-safety cue before discussing placement evidence.`,
                                      },
                                      {
                                        phase: 'preceptor evidence model',
                                        minutes: 15,
                                        purpose:
                                          lesson.teachingIntent?.modelingIntent ||
                                          `Model how to turn preceptor feedback, patient-care observation, or site evidence into a defensible ${artifact}.`,
                                        evidenceOfLearning:
                                          lesson.modelContrast?.contrastQuestion ||
                                          `Students can explain why one placement note is safer, more evidence-grounded, and more scope-aware than another.`,
                                      },
                                      {
                                        phase: 'supervised practice evidence review',
                                        minutes: 20,
                                        purpose:
                                          modality.signaturePractice ||
                                          lesson.teachingIntent?.guidedPracticeIntent ||
                                          `Students review deidentified patient-care evidence, site feedback, or competency evidence for ${concept}.`,
                                        evidenceOfLearning:
                                          modality.evidenceRoutine ||
                                          lesson.evidencePlan?.evidenceRequirement ||
                                          `Students produce a competency-log entry, patient encounter note, preceptor-feedback response, or site-evidence claim tied to safe practice.`,
                                      },
                                      {
                                        phase: 'competency log and safety feedback',
                                        minutes: 25,
                                        purpose: `Students test ${artifact} against competency expectations, patient safety, confidentiality, and scope-of-practice boundaries.`,
                                        evidenceOfLearning:
                                          lesson.feedbackCycle?.formativeEvidence ||
                                          `Students revise one competency claim, safety action, or placement reflection after feedback.`,
                                      },
                                      {
                                        phase: 'handoff boundary and debrief',
                                        minutes: 25,
                                        purpose: `Students debrief ${artifact} for handoff clarity, boundary awareness, preceptor follow-up, and next safe action.`,
                                        evidenceOfLearning:
                                          lesson.assessmentLink ||
                                          lesson.studentArtifact ||
                                          `Students document one deidentified handoff, placement decision, or preceptor-feedback response with supporting site evidence.`,
                                      },
                                      {
                                        phase: 'placement transfer plan',
                                        minutes: Math.max(10, sessionMinutes - 95),
                                        purpose:
                                          lesson.learningTransferPlan?.transferTask ||
                                          `Students prepare the site evidence, preceptor feedback, competency target, and safety boundary that carry into the next clinical placement shift.`,
                                        evidenceOfLearning:
                                          lesson.feedbackCycle?.closureCheck ||
                                          `Students submit or state one defensible clinical placement decision, one supervision question, and one patient-safety action to monitor.`,
                                      },
                                    ]
                                  : isClinicalJudgment
                                    ? [
                                        {
                                          phase: 'patient cue and safety check',
                                          minutes: 10,
                                          purpose:
                                            lesson.prerequisitePlan?.diagnosticCheck ||
                                            `Check whether students can identify the patient-assessment cues, risk level, and safety priority that shape ${concept}.`,
                                          evidenceOfLearning:
                                            lesson.readinessSupport?.readinessEvidence ||
                                            `Students name one patient cue, one likely risk, and one immediate safety concern before care planning.`,
                                        },
                                        {
                                          phase: 'clinical judgment model',
                                          minutes: 15,
                                          purpose:
                                            lesson.teachingIntent?.modelingIntent ||
                                            `Model one clinical care decision for ${artifact}, including assessment data, priority, intervention rationale, and monitoring cue.`,
                                          evidenceOfLearning:
                                            lesson.modelContrast?.contrastQuestion ||
                                            `Students can explain why one intervention or priority is safer and better supported by patient evidence than another.`,
                                        },
                                        {
                                          phase: 'prioritization and care-plan build',
                                          minutes: 20,
                                          purpose:
                                            modality.signaturePractice ||
                                            lesson.teachingIntent?.guidedPracticeIntent ||
                                            `Students build the next ${concept} care-plan step with visible patient-assessment evidence and rationale.`,
                                          evidenceOfLearning:
                                            modality.evidenceRoutine ||
                                            lesson.evidencePlan?.evidenceRequirement ||
                                            `Students produce a nursing diagnosis, priority list, intervention rationale, or SBAR element tied to patient cues.`,
                                        },
                                        {
                                          phase: 'intervention safety and monitoring review',
                                          minutes: 25,
                                          purpose: `Students test ${artifact} against safety risks, medication or intervention constraints, monitoring needs, and escalation cues.`,
                                          evidenceOfLearning:
                                            lesson.feedbackCycle?.formativeEvidence ||
                                            `Students revise one intervention, monitoring plan, or escalation cue after safety review.`,
                                        },
                                        {
                                          phase: 'SBAR handoff and debrief',
                                          minutes: 25,
                                          purpose: `Students communicate ${artifact} through an SBAR handoff and debrief how the patient evidence changed the care decision.`,
                                          evidenceOfLearning:
                                            lesson.assessmentLink ||
                                            lesson.studentArtifact ||
                                            `Students document one SBAR handoff, care-plan revision, or clinical judgment note with supporting patient evidence.`,
                                        },
                                        {
                                          phase: 'clinical transfer handoff',
                                          minutes: Math.max(10, sessionMinutes - 95),
                                          purpose:
                                            lesson.learningTransferPlan?.transferTask ||
                                            `Students prepare the cue, priority, intervention, monitoring, and handoff evidence that carry into the next patient-care case.`,
                                          evidenceOfLearning:
                                            lesson.feedbackCycle?.closureCheck ||
                                            `Students submit or state one defensible clinical care decision, one safety risk to monitor, and one remaining patient-data question.`,
                                        },
                                      ]
                                    : isDataScienceLab
                                      ? [
                                          {
                                            phase: 'dataset readiness and provenance check',
                                            minutes: 10,
                                            purpose:
                                              lesson.prerequisitePlan?.diagnosticCheck ||
                                              `Check whether students can open the dataset, name its source, and identify one data-quality risk for ${concept}.`,
                                            evidenceOfLearning:
                                              lesson.readinessSupport?.readinessEvidence ||
                                              `Students document dataset provenance, a missingness or quality cue, and one analysis question before modeling.`,
                                          },
                                          {
                                            phase: 'analysis or model demonstration',
                                            minutes: 15,
                                            purpose:
                                              lesson.teachingIntent?.modelingIntent ||
                                              `Model one notebook step that turns raw data into an interpretable ${concept} output for ${artifact}.`,
                                            evidenceOfLearning:
                                              lesson.modelContrast?.contrastQuestion ||
                                              `Students can explain why one cleaning, visualization, or model choice is more defensible than another.`,
                                          },
                                          {
                                            phase: 'guided notebook build',
                                            minutes: 20,
                                            purpose:
                                              modality.signaturePractice ||
                                              lesson.teachingIntent?.guidedPracticeIntent ||
                                              `Students build the next analysis step with visible dataset, code, output, and interpretation evidence.`,
                                            evidenceOfLearning:
                                              modality.evidenceRoutine ||
                                              lesson.evidencePlan?.evidenceRequirement ||
                                              `Students produce a notebook cell, data table, visualization, or model output tied to the question.`,
                                          },
                                          {
                                            phase: 'validation and interpretation check',
                                            minutes: 25,
                                            purpose: `Students test whether the output in ${artifact} supports the interpretation, metric, or recommendation.`,
                                            evidenceOfLearning:
                                              lesson.feedbackCycle?.formativeEvidence ||
                                              `Students record a validation metric, comparison, or interpretation check before revising the analysis.`,
                                          },
                                          {
                                            phase: 'bias limitation and decision review',
                                            minutes: 25,
                                            purpose: `Students review ${artifact} for data limitations, bias or fairness risk, and decision consequences.`,
                                            evidenceOfLearning:
                                              lesson.assessmentLink ||
                                              lesson.studentArtifact ||
                                              `Students document one limitation, bias check, or alternate interpretation with a revised analytic decision.`,
                                          },
                                          {
                                            phase: 'insight handoff',
                                            minutes: Math.max(10, sessionMinutes - 95),
                                            purpose:
                                              lesson.learningTransferPlan?.transferTask ||
                                              `Students prepare the notebook, dashboard, or data story evidence that carries into the next analytics task.`,
                                            evidenceOfLearning:
                                              lesson.feedbackCycle?.closureCheck ||
                                              `Students submit or state one validation or model-performance evidence claim, one limitation, and one next analysis risk.`,
                                          },
                                        ]
                                      : isProgrammingLab
                                        ? [
                                            {
                                              phase: 'environment and test setup',
                                              minutes: 10,
                                              purpose:
                                                lesson.prerequisitePlan?.diagnosticCheck ||
                                                `Check whether students can open the repository, run the starter code, and execute the test harness for ${concept}.`,
                                              evidenceOfLearning:
                                                lesson.readinessSupport?.readinessEvidence ||
                                                `Students produce one setup check, failing test, or environment note before implementation begins.`,
                                            },
                                            {
                                              phase: 'live code model',
                                              minutes: 15,
                                              purpose:
                                                lesson.teachingIntent?.modelingIntent ||
                                                `Model one small implementation decision for ${artifact}, including the code, test, and reasoning trace.`,
                                              evidenceOfLearning:
                                                lesson.modelContrast?.contrastQuestion ||
                                                `Students can explain why one code path is clearer, safer, or better tested than another.`,
                                            },
                                            {
                                              phase: 'guided implementation',
                                              minutes: 20,
                                              purpose:
                                                modality.signaturePractice ||
                                                lesson.teachingIntent?.guidedPracticeIntent ||
                                                `Students implement the next ${concept} step with visible code evidence and instructor check-ins.`,
                                              evidenceOfLearning:
                                                modality.evidenceRoutine ||
                                                lesson.evidencePlan?.evidenceRequirement ||
                                                `Students produce a code diff, function, notebook cell, or script segment tied to the requirement.`,
                                            },
                                            {
                                              phase: 'debugging and test loop',
                                              minutes: 25,
                                              purpose: `Students run tests, inspect failures, debug the implementation, and revise ${artifact}.`,
                                              evidenceOfLearning:
                                                lesson.feedbackCycle?.formativeEvidence ||
                                                `Students capture a failing or passing test, debugging trace, and one corrected implementation choice.`,
                                            },
                                            {
                                              phase: 'code review and refactor',
                                              minutes: 25,
                                              purpose: `Students review ${artifact} for correctness, readability, edge cases, and refactor opportunities.`,
                                              evidenceOfLearning:
                                                lesson.assessmentLink ||
                                                lesson.studentArtifact ||
                                                `Students document one code review note plus a refactor, test, or edge-case improvement.`,
                                            },
                                            {
                                              phase: 'commit handoff',
                                              minutes: Math.max(10, sessionMinutes - 95),
                                              purpose:
                                                lesson.learningTransferPlan?.transferTask ||
                                                `Students prepare the repository, notebook, or pull-request evidence that carries into the next coding task.`,
                                              evidenceOfLearning:
                                                lesson.feedbackCycle?.closureCheck ||
                                                `Students submit or state one commit, test result, and next implementation risk.`,
                                            },
                                          ]
                                        : [
                                            {
                                              phase: 'readiness diagnostic',
                                              minutes: 10,
                                              purpose:
                                                lesson.prerequisitePlan?.diagnosticCheck ||
                                                `Check whether students can connect prior knowledge to ${stripLessonPrefix(lesson.title)}.`,
                                              evidenceOfLearning:
                                                lesson.readinessSupport?.readinessEvidence ||
                                                `Students can name one usable ${concept} cue.`,
                                            },
                                            {
                                              phase: 'focused model',
                                              minutes: 15,
                                              purpose:
                                                lesson.teachingIntent?.modelingIntent ||
                                                `Model how ${concept} changes one visible choice in ${artifact}.`,
                                              evidenceOfLearning:
                                                lesson.modelContrast?.contrastQuestion ||
                                                `Students can explain why the stronger ${artifact} is stronger.`,
                                            },
                                            {
                                              phase: 'guided practice',
                                              minutes: 20,
                                              purpose:
                                                modality.signaturePractice ||
                                                lesson.teachingIntent?.guidedPracticeIntent ||
                                                `Students practice applying ${concept} with instructor support.`,
                                              evidenceOfLearning:
                                                modality.evidenceRoutine ||
                                                lesson.evidencePlan?.evidenceRequirement ||
                                                `Students cite evidence for ${concept}.`,
                                            },
                                            {
                                              phase: 'collaborative application',
                                              minutes: 25,
                                              purpose: `Students compare evidence choices and improve ${artifact} with peers.`,
                                              evidenceOfLearning:
                                                lesson.feedbackCycle?.formativeEvidence ||
                                                `Students identify one evidence-backed revision for ${artifact}.`,
                                            },
                                            {
                                              phase: 'independent artifact sprint',
                                              minutes: 25,
                                              purpose: `Students draft, rehearse, or revise ${artifact} using the lesson success criteria.`,
                                              evidenceOfLearning:
                                                lesson.assessmentLink ||
                                                lesson.studentArtifact ||
                                                `Students produce a visible ${artifact} checkpoint.`,
                                            },
                                            {
                                              phase: 'debrief and transfer',
                                              minutes: Math.max(10, sessionMinutes - 95),
                                              purpose:
                                                lesson.learningTransferPlan?.transferTask ||
                                                `Students name how today's ${concept} work carries into the next course artifact.`,
                                              evidenceOfLearning:
                                                lesson.feedbackCycle?.closureCheck ||
                                                `Students submit or state one feedback-based revision to ${artifact}.`,
                                            },
                                          ];
  const plannedClassMinutes = segments.reduce((sum, segment) => sum + Number(segment.minutes || 0), 0);
  const overageMinutes = Math.max(0, plannedClassMinutes - sessionMinutes);
  const outOfClassMinutes =
    Number(lesson.workloadEstimate?.beforeClassMinutes || 0) + Number(lesson.workloadEstimate?.afterClassMinutes || 0);
  const outOfClassStatus = classifyOutOfClassWorkload(outOfClassMinutes);
  return {
    version: 1,
    deliveryMode: isOnlineHybrid ? 'online-hybrid-module' : 'live-or-blended-class-session',
    synchronousAssumption: isOnlineHybrid
      ? 'Do not assume live facilitation; every phase needs asynchronous directions, evidence, and feedback timing.'
      : 'Live or blended facilitation can use the phases as a class-session sequence.',
    sessionMinutes,
    plannedClassMinutes,
    bufferMinutes: Math.max(0, sessionMinutes - plannedClassMinutes),
    overageMinutes,
    feasibilityStatus: overageMinutes > 0 ? 'needs-timing-review' : 'fits-session',
    segmentCount: segments.length,
    segments,
    studentWorkloadFit: {
      beforeClassMinutes: lesson.workloadEstimate?.beforeClassMinutes || 0,
      inClassMinutes: lesson.workloadEstimate?.inClassMinutes || sessionMinutes,
      afterClassMinutes: lesson.workloadEstimate?.afterClassMinutes || 0,
      outOfClassMinutes,
      status: outOfClassStatus,
      reviewCue:
        outOfClassStatus === 'review-heavy-out-of-class-load'
          ? `Review whether ${artifact} needs scaffolding, staging, or a reduced reading load before publishing.`
          : `Confirm local expectations for preparation and post-class work before publishing ${artifact}.`,
    },
    adjustmentPlan:
      overageMinutes > 0
        ? [
            `Shorten the guided model or collaborative application by ${overageMinutes} minute(s).`,
            `Move one low-stakes ${concept} practice item to pre-class preparation.`,
          ]
        : isOnlineHybrid
          ? [
              `Keep all six online phases visible in the LMS and use any local buffer for accessibility, questions, or instructor follow-up.`,
            ]
          : [
              `Keep all six phases in the live session and use any local buffer for accessibility, questions, or reteaching.`,
            ],
  };
}

function buildDifficultyProfile({ originalIndex, bloomsLevel, hasAssessment, concepts }) {
  const demand = {
    Apply: 'applied practice',
    Analyze: 'analysis and comparison',
    Evaluate: 'judgment with criteria',
    Create: 'synthesis or original production',
  }[bloomsLevel || 'Apply'];
  const stage = originalIndex < 2 ? 'foundation' : originalIndex < 9 ? 'development' : 'synthesis';
  return {
    stage,
    bloomsLevel,
    cognitiveDemand: demand,
    difficulty: originalIndex < 2 ? 'moderate' : ['Evaluate', 'Create'].includes(bloomsLevel) ? 'high' : 'moderate',
    riskToMonitor: hasAssessment
      ? `Students may use ${concepts[0] || 'the main concept'} as a label without evidence.`
      : 'Assessment details are sparse and should be reviewed before publishing.',
  };
}

function buildEvidencePlan({ title, concepts, resources, activities, artifact }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const secondary = concepts[1] || concept;
  const sourceCue = resources[0] || activities[0] || `${stripLessonPrefix(title)} course materials`;
  return {
    sourceCue,
    evidenceRequirement: `Use a concrete detail from ${sourceCue} to explain ${concept}.`,
    limitationCue: `Name one limitation, assumption, or boundary condition before applying ${secondary}.`,
    artifactConnection: `Evidence should change a visible choice in ${stripTerminalPunctuation(artifact)}.`,
  };
}

function buildSourceUsePlan({ title, concepts, resources, evidencePlan, artifact }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(artifact);
  const sourceCue = evidencePlan?.sourceCue || resources?.[0] || `${stripLessonPrefix(title)} course materials`;
  const approvedSources =
    Array.isArray(resources) && resources.length > 0
      ? resources.slice(0, 4)
      : ['Instructor-provided course materials and notes'];
  return {
    approvedSources,
    citationExpectation: `Use instructor-provided materials for ${stripLessonPrefix(title)}. When source details are available, name the author, title, page, slide, case, dataset, or activity label used for ${artifactName}.`,
    studentAttributionMove: `Before explaining ${concept}, name where the evidence came from: ${sourceCue}, an assigned reading, a class activity, or instructor-provided notes.`,
    noInventedSources: `Do not invent authors, titles, URLs, page numbers, studies, cases, or data for ${stripLessonPrefix(title)}. If ${artifactName} needs a missing citation detail from ${sourceCue}, mark that source gap for instructor review instead of filling it in.`,
    sourceEvaluationPrompt: `Ask what makes ${sourceCue} relevant for ${concept}, what it can support, and what it cannot prove for ${artifactName}.`,
    localReplacementCue: `Before publishing ${artifactName}, replace ${sourceCue} with the official local reading, case, dataset, or policy document that best supports ${concept} if the instructor uses a different source.`,
    copyrightReviewCue: `Verify that any copied reading, image, dataset, case, or media excerpt for ${stripLessonPrefix(title)} is licensed or institutionally approved before distribution.`,
  };
}

function assessmentTaskLabel(value, fallback = 'Weekly artifact') {
  const text = stripTerminalPunctuation(value || fallback);
  if (!text) return fallback;
  const colonIndex = text.indexOf(':');
  const label = colonIndex > 4 && colonIndex <= 64 ? text.slice(0, colonIndex) : conciseClause(text, fallback, 54);
  return sentenceCase(label);
}

function buildStudentArtifactLabel(assessmentText, title, fallback) {
  const parts = meaningfulEntries(splitList(assessmentText)).slice(0, 2);
  if (parts.length === 0) return fallback || `${stripLessonPrefix(title)} artifact`;
  const labels = parts.map((part) => assessmentTaskLabel(part, `${stripLessonPrefix(title)} artifact`));
  if (labels.length === 1) return labels[0];
  const combined = `${labels[0]} and ${labels[1].charAt(0).toLowerCase()}${labels[1].slice(1)}`;
  return combined.length <= 82 ? combined : labels[0];
}

function instructorProvidedThroughlineProfile(courseName, domainLabel, setting) {
  const courseLabel = cleanText(courseName, 'Course');
  return {
    projectName: `${courseLabel} ${domainLabel}`,
    clientName: 'the course audience',
    datasetName: '',
    casePacketName: 'Instructor-provided course materials',
    stakeholderGroup: 'students, instructors, peer reviewers, and relevant course audiences',
    setting,
    sourceMode: 'instructor-provided',
  };
}

function selectThroughlineProfile({ courseName = '', courseConcepts = [], lens = {}, courseModalityProfile = {} }) {
  const text = cleanText(
    [courseName, lens.domain, lens.exampleNoun, courseModalityProfile.primaryMode, ...courseConcepts].join(' '),
  ).toLowerCase();

  if (
    courseModalityProfile?.primaryMode === 'data-science-lab' ||
    /\b(applied machine learning|machine learning|data science|data analytics|predictive modeling|model evaluation|classification model|regression model|jupyter|notebook analysis|dataframe)\b/.test(
      text,
    )
  ) {
    return {
      projectName: 'Riverton Civic Services Modeling Project',
      clientName: 'Riverton Analytics Team',
      datasetName: 'Riverton Civic Services Triage Dataset',
      casePacketName: 'Riverton Model Evidence Packet',
      stakeholderGroup: 'residents, service coordinators, data analysts, program managers, and fairness reviewers',
      setting:
        'a civic-services analytics project where students build, validate, and audit a triage model from a course-created dataset',
      sourceMode: 'data-science-lab',
    };
  }
  if (/\b(social policy|welfare|benefits|human services|social work|poverty|public assistance)\b/.test(text)) {
    return instructorProvidedThroughlineProfile(
      courseName,
      'Policy Evidence Thread',
      'a course-specific policy or practice context supplied by the instructor',
    );
  }
  if (/\b(environment|climate|sustainability|resilience|urban|planning)\b/.test(text)) {
    return instructorProvidedThroughlineProfile(
      courseName,
      'Sustainability Evidence Thread',
      'an instructor-provided environmental, planning, or sustainability context',
    );
  }
  if (/\b(policy|public administration|governance|regulatory|stakeholder|equity)\b/.test(text)) {
    return instructorProvidedThroughlineProfile(
      courseName,
      'Policy Analysis Thread',
      'an instructor-provided policy decision context',
    );
  }
  if (/\b(healthcare|health care|clinical|patient|nursing|medical|care coordination)\b/.test(text)) {
    return instructorProvidedThroughlineProfile(
      courseName,
      'Clinical Evidence Thread',
      'an instructor-provided care, safety, or clinical reasoning context',
    );
  }
  if (/\b(research methods|survey|interview|ethnography|statistics|mixed methods|data collection)\b/.test(text)) {
    return instructorProvidedThroughlineProfile(
      courseName,
      'Research Design Thread',
      'an instructor-provided research question, source set, or methods example',
    );
  }
  if (/\b(lab|chemistry|biology|experiment|synthesis|chromatography|spectroscopy)\b/.test(text)) {
    return instructorProvidedThroughlineProfile(
      courseName,
      'Lab Evidence Thread',
      'an instructor-provided lab procedure, observation, or results context',
    );
  }
  if (/\b(design|studio|prototype|user experience|ux|product)\b/.test(text)) {
    return instructorProvidedThroughlineProfile(
      courseName,
      'Design Evidence Thread',
      'an instructor-provided user, prototype, or design critique context',
    );
  }

  return instructorProvidedThroughlineProfile(
    courseName,
    'Evidence Thread',
    'the instructor-provided course context and assigned materials',
  );
}

function buildCourseThroughlineContext({
  courseName,
  lessons = [],
  courseConcepts = [],
  lens = {},
  courseModalityProfile,
}) {
  const profile = selectThroughlineProfile({ courseName, courseConcepts, lens, courseModalityProfile });
  const first = lessons[0];
  const last = lessons[lessons.length - 1];
  const firstFocus = stripLessonPrefix(first?.title || courseName || 'the opening lesson');
  const lastFocus = stripLessonPrefix(last?.title || 'final synthesis');
  // v0.12.1: how often each resource string appears across lessons — a
  // resource shared by many lessons is a course-wide packet, not a
  // lesson-specific citation (buildLessonThroughlineCase uses this to decide
  // whether a real resource can replace the evidence-packet descriptor).
  const resourceCounts = {};
  for (const lesson of lessons) {
    const seen = new Set();
    for (const reading of [...(lesson?.readings || []), ...(lesson?.resources || [])]) {
      const normalized = cleanText(reading).toLowerCase();
      if (normalized) seen.add(normalized);
    }
    seen.forEach((normalized) => {
      resourceCounts[normalized] = (resourceCounts[normalized] || 0) + 1;
    });
  }
  return {
    version: 1,
    source: 'course-throughline',
    resourceCounts,
    ...profile,
    recurringQuestion: `What should ${profile.clientName} do next in ${profile.setting}, and what evidence makes that decision defensible?`,
    sequenceSummary:
      first && last
        ? `${profile.projectName} starts with ${firstFocus} and returns through ${lastFocus} as students revise evidence, tradeoffs, and recommendations.`
        : `${profile.projectName} gives the course a recurring evidence case across lessons.`,
    evidenceBoundary:
      profile.sourceMode === 'data-science-lab'
        ? 'This is a fictional course-created case for classroom practice; replace it with official local sources when the instructor has a required case, dataset, or policy document.'
        : 'Use instructor-provided readings, examples, cases, media, notes, or local materials. Do not invent source titles, datasets, authors, URLs, or official facts.',
  };
}

function buildLessonThroughlineCase(context, lesson) {
  const lessonTitle = stripLessonPrefix(lesson?.title || 'this lesson');
  const concept = primaryConceptForLesson(lesson);
  const artifact = stripTerminalPunctuation(lesson?.studentArtifact || 'the lesson artifact');
  // v0.12.1: prefer the lesson's real resource as the evidence packet — the
  // generic "Instructor-provided course materials for Lesson N" fallback
  // shipped as an unresolved citation on 112 slides plus lesson plans,
  // rubrics, and discussions in the v0.12 audit. Only LESSON-SPECIFIC
  // resources qualify (appearing in at most 2 lessons): citing one
  // course-wide packet verbatim in every lesson would trade the placeholder
  // for boilerplate repetition.
  const resourceCounts = context.resourceCounts || {};
  const isLessonSpecific = (reading) => (resourceCounts[cleanText(reading).toLowerCase()] ?? 1) <= 2;
  const lessonResource =
    context.sourceMode === 'instructor-provided'
      ? (lesson?.readings || [])
          .map((reading) => stripTerminalPunctuation(cleanText(reading)))
          .find(
            (reading) =>
              reading &&
              reading.length >= 8 &&
              reading.length <= 90 &&
              !/instructor-provided course/i.test(reading) &&
              isLessonSpecific(reading),
          )
      : null;
  const evidencePacket =
    context.sourceMode === 'instructor-provided'
      ? lessonResource || `${context.casePacketName} for Lesson ${lesson.lessonNumber}: ${lessonTitle}`
      : `${context.casePacketName}: Lesson ${lesson.lessonNumber} ${lessonTitle}`;
  const isDataScienceCase = /\b(model|analytics|dataset|notebook|data science|machine learning|triage)\b/i.test(
    [context.projectName, context.clientName, context.datasetName, context.casePacketName, context.setting].join(' '),
  );
  return {
    projectName: context.projectName,
    clientName: context.clientName,
    datasetName: context.datasetName,
    evidencePacket,
    lessonCaseName: `${context.projectName} ${lessonTitle} decision`,
    stakeholderCue: context.stakeholderGroup,
    decisionPrompt: isDataScienceCase
      ? `Advise ${context.clientName} on the ${concept} modeling decision using ${context.datasetName}, notebook outputs, validation metrics, and evidence from ${evidencePacket}.`
      : `Advise ${context.clientName} on the ${concept} decision using evidence from ${evidencePacket}.`,
    artifactConnection: isDataScienceCase
      ? `${artifact} should show how ${context.datasetName} records, validation results, and model limitations change the student's modeling choice or analytic recommendation.`
      : `${artifact} should show how ${context.projectName} evidence changes the student's recommendation, design choice, or analysis.`,
    sourceBoundary: context.evidenceBoundary,
  };
}

function attachThroughlineCaseToLesson(lesson, context) {
  if (!context || !lesson) return lesson;
  const throughlineCase = buildLessonThroughlineCase(context, lesson);
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const sourceCue = throughlineCase.evidencePacket;
  const readings = unique([sourceCue, ...(lesson.readings || [])], 8);
  const evidencePlan = {
    ...(lesson.evidencePlan || {}),
    sourceCue,
    evidenceRequirement: `Use a concrete detail from ${sourceCue} to explain ${concept} for ${context.clientName}.`,
    limitationCue:
      lesson.evidencePlan?.limitationCue ||
      `Name one limitation, assumption, or boundary condition before applying ${concept}.`,
    artifactConnection: throughlineCase.artifactConnection,
  };
  const approvedSources = unique([sourceCue, ...asArray(lesson.sourceUsePlan?.approvedSources)], 6);
  const sourceUsePlan = {
    ...(lesson.sourceUsePlan || {}),
    approvedSources,
    studentAttributionMove: `Before explaining ${concept}, cite the exact ${context.projectName} packet item, assigned reading, class activity, or instructor note used for ${artifact}.`,
    noInventedSources: `Do not invent authors, URLs, page numbers, studies, legal authority, or real agency data when citing ${concept} sources from ${sourceCue}. Treat the ${concept} throughline case as classroom practice evidence unless the instructor replaces it with an official source.`,
    sourceEvaluationPrompt: `Ask what ${sourceCue} can support for ${context.clientName}, what it cannot prove, and what local evidence would be needed before publication.`,
    localReplacementCue: `Before publishing ${artifact}, replace or supplement ${sourceCue} with the official local reading, case, dataset, policy document, or agency guidance required by the instructor.`,
    copyrightReviewCue:
      lesson.sourceUsePlan?.copyrightReviewCue ||
      `Verify that any copied reading, image, dataset, case, or media excerpt for ${stripLessonPrefix(lesson.title)} is licensed or institutionally approved before distribution.`,
  };
  return {
    ...lesson,
    readings,
    throughlineCase,
    evidencePlan,
    sourceUsePlan,
    slideNarrative: `Introduce ${stripLessonPrefix(lesson.title)}, model the core concept with ${throughlineCase.lessonCaseName}, and close with a decision checkpoint.`,
    faqNeeds: [
      `How does ${stripLessonPrefix(lesson.title)} connect to ${context.projectName}?`,
      `What evidence from ${sourceCue} should I use?`,
    ],
    sourceAnchors: [
      ...(lesson.sourceAnchors || []),
      sourceAnchor('throughline case', 'course-created-case', sourceCue, 'medium'),
    ],
  };
}

function buildMisconceptionMap({ title, concepts, artifact }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const secondary = concepts[1] || concept;
  const shortTitle = stripLessonPrefix(title);
  return [
    {
      misconception: `${concept} is only a definition to memorize.`,
      correction: `Students should use ${concept} to make, revise, or justify a choice in ${stripTerminalPunctuation(artifact)}.`,
      check: `Ask students to point to the exact evidence that makes their ${concept} claim credible.`,
    },
    {
      misconception: `One example is enough to prove the ${shortTitle} claim.`,
      correction: [
        `Students should compare ${shortTitle} evidence, name a limitation, and explain why ${secondary} changes the decision.`,
        `Strong ${shortTitle} answers weigh more than one piece of evidence and say where ${secondary} would bend the conclusion.`,
        `Students should test the ${shortTitle} claim against a second source and state how ${secondary} shifts the decision.`,
      ][Array.from(cleanText(shortTitle)).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 3],
      check: `Ask what would change their ${secondary} answer if the evidence source or context changed.`,
    },
  ];
}

function buildModelContrast({ title, concepts, artifact, evidencePlan }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(artifact);
  const sourceCue = evidencePlan?.sourceCue || `${stripLessonPrefix(title)} course materials`;
  const shortTitle = stripLessonPrefix(title);
  return {
    exemplarMove: `Strong ${artifactName} work uses a specific detail from ${sourceCue} to explain ${concept}, names why the evidence matters, and states one limitation before making the decision.`,
    nonExemplarMove: `Weak ${artifactName} work summarizes ${concept} generally, cites no inspectable evidence, and makes the decision sound automatic.`,
    contrastQuestion: `Which sentence makes the evidence for ${concept} inspectable, and what limitation keeps the claim honest?`,
    transferPrompt: `In ${shortTitle}, revise one ${artifactName} sentence into evidence-backed ${concept} reasoning by making the ${sourceCue} support visible.`,
  };
}

function buildReadinessSupportPlan({ title, concepts, artifact, evidencePlan }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(artifact);
  const sourceCue = evidencePlan?.sourceCue || `${stripLessonPrefix(title)} course materials`;
  return {
    diagnosticPrompt: `Before the main task, ask students to explain ${concept} using one concrete detail from ${sourceCue}.`,
    readinessEvidence: `Students are ready when they can cite inspectable evidence, explain why it matters, and connect it to ${artifactName}.`,
    supportMove: `If students cannot cite evidence for ${concept}, give them a worked sentence frame and have them annotate one detail from ${sourceCue} before drafting ${artifactName}.`,
    extensionMove: `If students are ready, ask them to compare two possible evidence choices and justify which one makes ${artifactName} more defensible.`,
    groupingCue: `Use the ${concept} diagnostic response to form ready, partial, and needs-support groups before ${artifactName} work begins.`,
  };
}

function buildInstructionalRationale({ title, concepts, artifact, evidencePlan, readinessSupport, difficultyProfile }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(artifact);
  const sourceCue = evidencePlan?.sourceCue || `${stripLessonPrefix(title)} course materials`;
  const cognitiveDemand = difficultyProfile?.cognitiveDemand || 'applied reasoning';
  return {
    sequenceRationale: `Begin ${stripLessonPrefix(title)} with diagnostic evidence work before modeling so students connect ${concept} to ${sourceCue} before producing ${artifactName}.`,
    practiceRationale: `Guided and collaborative practice ask students to compare evidence choices because ${cognitiveDemand} depends on explaining why ${concept} makes ${artifactName} more defensible.`,
    assessmentRationale: `${artifactName} is appropriate performance evidence because it makes students use ${concept}, cite inspectable course evidence, and make the decision visible for feedback.`,
    supportRationale:
      readinessSupport?.supportMove ||
      `Use targeted sentence-frame support for students who cannot yet connect ${concept} evidence to ${artifactName}.`,
    reviewCue: `Before publishing, confirm the local examples, evidence sources, and expectations for ${stripLessonPrefix(title)} match the instructor's actual materials.`,
  };
}

function buildAccessibilityPlan({ title, concepts, artifact, evidencePlan, readinessSupport }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(artifact);
  const sourceCue = evidencePlan?.sourceCue || `${stripLessonPrefix(title)} course materials`;
  return {
    representation: `Present ${concept} through spoken explanation, a text checklist, and one visual organizer tied to ${sourceCue}.`,
    engagement: `Give students a quiet think-write entry point before discussion, then let them choose partner, small-group, or individual evidence rehearsal for ${artifactName}.`,
    expression: `Allow ${artifactName} evidence to be shown as a memo, annotated outline, slide, table, or brief recording when the same criteria are met.`,
    participationProtocol: `Use wait time, written or spoken response options, and sentence frames so students can cite ${concept} evidence without being rushed.`,
    supportBridge:
      readinessSupport?.supportMove ||
      `Provide a sentence frame and annotated ${sourceCue} detail before students continue ${artifactName}.`,
    accommodationReviewCue: `Before publishing ${stripLessonPrefix(title)}, verify local accommodation needs, captions or alt text, readable document structure, and non-color-only cues for all required materials.`,
  };
}

function buildFeedbackCycle({ title, concepts, artifact, evidencePlan }) {
  const concept = concepts[0] || stripLessonPrefix(title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(artifact);
  const sourceCue = evidencePlan?.sourceCue || `${stripLessonPrefix(title)} course materials`;
  return {
    formativeEvidence: `Collect one annotated ${artifactName} line or checkpoint response showing how ${concept} evidence from ${stripTerminalPunctuation(sourceCue)} supports the decision.`,
    feedbackMethod: `Give criterion-level feedback that names the strongest evidence move, the weakest reasoning link, and one revision priority for ${artifactName}.`,
    studentRevisionAction: `Students revise ${artifactName} by replacing a general ${concept} claim with evidence-backed ${concept} reasoning, one limitation, and one next decision.`,
    nextUse: `Carry the revised ${concept} evidence move into the next course artifact, discussion, or synthesis task.`,
    closureCheck: `Before moving on from ${stripLessonPrefix(title)}, students submit a brief note naming what feedback changed and what evidence still needs review.`,
  };
}

function buildPrerequisitePlan({ lesson, previous }) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(lesson.studentArtifact);
  const previousConcept = previous?.keyConcepts?.[0] || 'prior course experience';
  const previousArtifact = stripTerminalPunctuation(previous?.studentArtifact || 'prior course work');
  const assumedKnowledge = previous
    ? unique([previousConcept, ...(previous.keyConcepts || []).slice(1, 3)], 3)
    : unique(
        [
          `Baseline vocabulary or lived example for ${concept}`,
          'Ability to locate assigned materials and submit work through the course site',
        ],
        3,
      );

  return {
    assumedKnowledge,
    prerequisiteEvidence: previous
      ? `Students should bring forward ${previousConcept} evidence from ${previousArtifact} before working on ${artifactName}.`
      : `Students should be able to name one prior example, course goal, or baseline experience that makes ${concept} meaningful before working on ${artifactName}.`,
    diagnosticCheck: previous
      ? `Ask students to explain how ${previousConcept} from ${previousArtifact} changes today's ${concept} decision.`
      : `Ask students to define ${concept} in their own words and connect it to one concrete example before new instruction begins.`,
    studentReadinessCheck: previous
      ? `Before drafting, explain in your own words how ${previousConcept} from ${previousArtifact} shapes today's ${concept} decision.`
      : `Before drafting, define ${concept} in your own words and connect it to one concrete example.`,
    reteachMove: previous
      ? `If students cannot use ${previousConcept}, revisit one strong ${previousArtifact} example and annotate the evidence move before starting ${artifactName}.`
      : `If students cannot explain ${concept}, model one source-backed example and give a sentence frame before starting ${artifactName}.`,
    accelerationMove: previous
      ? `If students are ready, ask them to compare how ${previousConcept} and ${concept} change the next decision in ${artifactName}.`
      : `If students are ready, ask them to predict where ${concept} will become harder when evidence, audience, or context changes.`,
    localAssumptionReview: `Before publishing ${stripLessonPrefix(lesson.title)}, confirm students have access to the prior materials, tools, vocabulary, and examples needed for this prerequisite check.`,
  };
}

function buildLearningTransferPlan({ lesson, previous, next }) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(lesson.studentArtifact);
  const previousConcept = previous?.keyConcepts?.[0] || 'prior course evidence';
  const nextTarget = next?.studentArtifact || 'the final course synthesis';
  const nextConcept = next?.keyConcepts?.[0] || 'the next course decision';
  return {
    retrievalCue: previous
      ? `Start by asking students to retrieve ${previousConcept} and explain one way it changes today's ${concept} decision.`
      : `Start by asking students to retrieve a prior experience, course goal, or baseline example that makes ${concept} worth studying.`,
    spacedPracticeCue: `Revisit ${concept} after ${artifactName} through one low-stakes quiz item, study-guide prompt, or discussion follow-up before the next major artifact.`,
    transferTask: `Students carry one ${concept} evidence move from ${artifactName} into ${stripTerminalPunctuation(nextTarget)}.`,
    cumulativeConnection: next
      ? `${artifactName} prepares students for ${stripTerminalPunctuation(nextTarget)} by making ${nextConcept} easier to justify with evidence.`
      : `${artifactName} closes the course arc by helping students synthesize evidence, feedback, and revision into a final transfer explanation.`,
    metacognitivePrompt: `Ask students which ${concept} move they can reuse, which context would change it, and what evidence would make the transfer stronger.`,
    studentMetacognitivePrompt: `Which ${concept} move can you reuse, what context would change it, and what evidence would make the transfer stronger?`,
  };
}

function buildTeachingIntent({ lesson, previous, next }) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifactName = stripTerminalPunctuation(lesson.studentArtifact);
  const previousConcept = previous?.keyConcepts?.[0] || 'prior course evidence';
  const nextTarget = next?.studentArtifact || 'the next course artifact';
  return {
    version: 1,
    teachingGoal: `${stripLessonPrefix(lesson.title)} moves students from ${previousConcept} into evidence-backed ${concept} decisions for ${artifactName}.`,
    diagnosticMove:
      lesson.readinessSupport?.diagnosticPrompt ||
      `Ask students to explain ${concept} with one concrete source detail before new instruction begins.`,
    modelingMove:
      lesson.modelContrast?.exemplarMove ||
      `Model a strong ${artifactName} move and contrast it with unsupported summary.`,
    guidedPracticeMove: `Students use ${lesson.activityPattern} to test which ${concept} evidence makes ${artifactName} more defensible.`,
    evidenceOfLearning:
      lesson.evidencePlan?.evidenceRequirement ||
      `Students show learning by connecting ${concept} evidence to ${artifactName}.`,
    feedbackDecision:
      lesson.feedbackCycle?.feedbackMethod ||
      `Use criterion-level feedback to decide what students should revise in ${artifactName}.`,
    studentRevisionMove:
      lesson.feedbackCycle?.studentRevisionAction ||
      `Students revise ${artifactName} by replacing a general claim with an evidence-backed ${concept} move.`,
    transferMove:
      lesson.learningTransferPlan?.transferTask ||
      `Students carry one ${concept} evidence move into ${stripTerminalPunctuation(nextTarget)}.`,
    localReviewQuestion:
      lesson.instructionalRationale?.reviewCue ||
      `Confirm the local examples and source expectations for ${stripLessonPrefix(lesson.title)} before publishing.`,
  };
}

function primaryConceptForLesson(lesson = {}) {
  return (
    normalizeConceptCandidates(lesson.keyConcepts || [], { title: lesson.title, limit: 1 })[0] ||
    normalizeConceptCandidates(lesson.outcomes || [], { title: lesson.title, limit: 1 })[0] ||
    wordsFromConcepts([lesson.outcomes?.join(' '), lesson.title], 3).find((word) => !isWeakConcept(word)) ||
    'the lesson focus'
  );
}

function buildConceptDependencyGraph({ lessons = [], assessments = [] }) {
  const nodes = lessons.map((lesson, index) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[index] || {};
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      concept: primaryConceptForLesson(lesson),
      supportingConcepts: unique(lesson.keyConcepts || [], 6),
      stage: lesson.pacing?.stage || lesson.difficultyProfile?.stage || '',
      bloomLevel: lesson.bloomsLevel || '',
      cognitiveDemand: lesson.difficultyProfile?.cognitiveDemand || '',
      assessmentArtifact: lesson.studentArtifact || assessment.artifact || '',
      sourceConfidence: lesson.confidence?.level || 'unknown',
      sourceRisk: lesson.sourceRisk?.riskLevel || 'none',
    };
  });
  const edges = lessons.flatMap((lesson, index) => {
    const previous = lessons[index - 1];
    const next = lessons[index + 1];
    const currentConcept = primaryConceptForLesson(lesson);
    const lessonEdges = [];
    if (previous) {
      lessonEdges.push({
        type: 'prerequisite',
        fromLessonNumber: previous.lessonNumber,
        toLessonNumber: lesson.lessonNumber,
        fromConcept: primaryConceptForLesson(previous),
        toConcept: currentConcept,
        evidence: lesson.prerequisitePlan?.prerequisiteEvidence || '',
        diagnosticCheck: lesson.prerequisitePlan?.diagnosticCheck || '',
        reteachMove: lesson.prerequisitePlan?.reteachMove || '',
      });
    }
    if (next) {
      lessonEdges.push({
        type: 'transfer',
        fromLessonNumber: lesson.lessonNumber,
        toLessonNumber: next.lessonNumber,
        fromConcept: currentConcept,
        toConcept: primaryConceptForLesson(next),
        transferTask: lesson.learningTransferPlan?.transferTask || '',
        cumulativeConnection: lesson.learningTransferPlan?.cumulativeConnection || '',
        metacognitivePrompt: lesson.learningTransferPlan?.metacognitivePrompt || '',
      });
    }
    return lessonEdges;
  });
  const practiceRows = lessons.map((lesson, index) => {
    const previous = lessons[index - 1];
    const next = lessons[index + 1];
    const currentConcept = primaryConceptForLesson(lesson);
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      stage: lesson.pacing?.stage || lesson.difficultyProfile?.stage || '',
      priorConcept: previous ? primaryConceptForLesson(previous) : 'course entry point',
      currentConcept,
      nextConcept: next ? primaryConceptForLesson(next) : 'final course transfer',
      retrievalCue: lesson.learningTransferPlan?.retrievalCue || '',
      practiceFocus: lesson.modalityDecode?.signaturePractice || lesson.activityPattern || '',
      evidenceRoutine: lesson.modalityDecode?.evidenceRoutine || lesson.evidencePlan?.evidenceRequirement || '',
      feedbackRoutine: lesson.modalityDecode?.feedbackRoutine || lesson.feedbackCycle?.feedbackMethod || '',
      assessmentArtifact: lesson.studentArtifact || '',
      transferTask: lesson.learningTransferPlan?.transferTask || '',
      metacognitivePrompt: lesson.learningTransferPlan?.metacognitivePrompt || '',
      reviewerCue: `Check whether ${currentConcept} builds from ${previous ? primaryConceptForLesson(previous) : 'course entry readiness'} and prepares ${next ? primaryConceptForLesson(next) : 'final transfer'} through visible practice and feedback.`,
    };
  });
  const hasCompleteRows =
    nodes.length === lessons.length &&
    practiceRows.length === lessons.length &&
    practiceRows.every(
      (row) =>
        row.currentConcept &&
        row.practiceFocus &&
        row.evidenceRoutine &&
        row.feedbackRoutine &&
        row.transferTask &&
        row.retrievalCue,
    );
  return {
    version: 1,
    status: hasCompleteRows ? 'sequenced' : 'needs-review',
    policy:
      'The compiler should treat the course as a concept dependency graph: each lesson names what prior concept it depends on, what practice makes the current concept visible, and what later task reuses it.',
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    practiceRows,
    conceptThread: practiceRows.map((row) => `${row.lessonNumber}. ${row.currentConcept}`).join(' -> '),
  };
}

function attachConceptGraphToLessons(lessons = [], conceptDependencyGraph = {}) {
  const nodes = Array.isArray(conceptDependencyGraph.nodes) ? conceptDependencyGraph.nodes : [];
  const edges = Array.isArray(conceptDependencyGraph.edges) ? conceptDependencyGraph.edges : [];
  const practiceRows = Array.isArray(conceptDependencyGraph.practiceRows) ? conceptDependencyGraph.practiceRows : [];
  return lessons.map((lesson) => {
    const node = nodes.find((item) => item.lessonNumber === lesson.lessonNumber) || {};
    const incomingEdges = edges
      .filter((edge) => edge.toLessonNumber === lesson.lessonNumber)
      .sort((left, right) => (left.type === 'prerequisite' ? -1 : 0) - (right.type === 'prerequisite' ? -1 : 0));
    const outgoingEdges = edges
      .filter((edge) => edge.fromLessonNumber === lesson.lessonNumber)
      .sort((left, right) => (left.type === 'transfer' ? -1 : 0) - (right.type === 'transfer' ? -1 : 0));
    const practiceRow = practiceRows.find((row) => row.lessonNumber === lesson.lessonNumber) || {};
    return {
      ...lesson,
      conceptDependencyPlan: {
        node,
        incomingEdges,
        outgoingEdges,
        dependencyCue:
          incomingEdges[0]?.diagnosticCheck ||
          `Start ${stripLessonPrefix(lesson.title)} by checking readiness for ${node.concept || primaryConceptForLesson(lesson)}.`,
        transferCue:
          outgoingEdges[0]?.transferTask ||
          `Use ${node.concept || primaryConceptForLesson(lesson)} in final course transfer.`,
      },
      practiceProgressionPlan: practiceRow,
    };
  });
}

function buildLessonMasteryEvidencePlan({ lesson = {}, assessment = {} }) {
  const concept = primaryConceptForLesson(lesson);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || assessment.artifact || 'the lesson artifact');
  const diagnosticEvidence =
    lesson.readinessSupport?.readinessEvidence ||
    lesson.prerequisitePlan?.diagnosticCheck ||
    `Students can explain ${concept} with one concrete source detail before new instruction begins.`;
  const guidedPracticeEvidence =
    lesson.practiceProgressionPlan?.evidenceRoutine ||
    lesson.modalityDecode?.evidenceRoutine ||
    lesson.evidencePlan?.evidenceRequirement ||
    `Students use guided practice to make ${concept} evidence visible.`;
  const independentPerformanceEvidence =
    assessment.validityEvidence?.targetConstruct ||
    lesson.artifactGenre?.evidenceRequirement ||
    `Students demonstrate ${concept} by completing ${artifact} with source-backed reasoning.`;
  const feedbackRevisionEvidence =
    lesson.feedbackCycle?.studentRevisionAction ||
    assessment.feedbackUse ||
    `Students revise ${artifact} after criterion-level feedback.`;
  const transferEvidence =
    lesson.learningTransferPlan?.transferTask ||
    lesson.conceptDependencyPlan?.transferCue ||
    `Students transfer one ${concept} evidence move to the next course task.`;
  const misconceptionRepairEvidence =
    lesson.misconceptionMap?.[0]?.check ||
    `Ask students to identify and repair one unsupported ${concept} claim before submission.`;
  const masteryThreshold =
    assessment.anchorExampleSet?.strongSignal ||
    `Ready work cites inspectable ${concept} evidence, explains the decision, names a limitation, and shows a revision move in ${artifact}.`;
  const evidencePortfolio = [
    {
      stage: 'diagnostic',
      evidence: diagnosticEvidence,
      teacherDecision:
        lesson.readinessSupport?.groupingCue ||
        `Sort responses into ready, partial, and needs-support groups for ${concept}.`,
    },
    {
      stage: 'guided-practice',
      evidence: guidedPracticeEvidence,
      teacherDecision:
        lesson.modalityDecode?.instructorMove ||
        `Model and coach the ${concept} evidence move before independent work.`,
    },
    {
      stage: 'independent-performance',
      evidence: independentPerformanceEvidence,
      teacherDecision:
        assessment.calibrationPlan?.scorerNorming ||
        `Score ${artifact} against the shared criteria and anchor examples.`,
    },
    {
      stage: 'feedback-revision',
      evidence: feedbackRevisionEvidence,
      teacherDecision:
        lesson.feedbackCycle?.feedbackMethod ||
        `Give feedback that names the strongest evidence move and next revision.`,
    },
    {
      stage: 'transfer',
      evidence: transferEvidence,
      teacherDecision:
        lesson.learningTransferPlan?.metacognitivePrompt ||
        `Ask students to name what they will reuse from ${concept} in later work.`,
    },
    {
      stage: 'misconception-repair',
      evidence: misconceptionRepairEvidence,
      teacherDecision:
        lesson.misconceptionMap?.[0]?.correction ||
        `Reteach the difference between naming ${concept} and using it to make a defensible decision.`,
    },
  ];
  return {
    version: 1,
    concept,
    artifact,
    diagnosticEvidence,
    guidedPracticeEvidence,
    independentPerformanceEvidence,
    feedbackRevisionEvidence,
    transferEvidence,
    misconceptionRepairEvidence,
    masteryThreshold,
    masteryDecision: `Treat ${artifact} as classroom-ready only when diagnostic, guided-practice, independent-performance, feedback-revision, transfer, and misconception-repair evidence all support ${concept} mastery.`,
    evidencePortfolio,
    reviewerCue: `Check whether ${artifact} gives enough evidence to judge ${concept} mastery before students move on.`,
  };
}

function attachMasteryEvidenceToLessons(lessons = [], assessments = []) {
  return lessons.map((lesson, index) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[index] || {};
    return {
      ...lesson,
      masteryEvidencePlan: buildLessonMasteryEvidencePlan({ lesson, assessment }),
    };
  });
}

function buildMasteryEvidenceMap(lessons = []) {
  const requiredFields = [
    'diagnosticEvidence',
    'guidedPracticeEvidence',
    'independentPerformanceEvidence',
    'feedbackRevisionEvidence',
    'transferEvidence',
    'misconceptionRepairEvidence',
    'masteryThreshold',
  ];
  const lessonRows = lessons.map((lesson) => {
    const plan = lesson.masteryEvidencePlan || {};
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      concept: plan.concept || primaryConceptForLesson(lesson),
      artifact: plan.artifact || stripTerminalPunctuation(lesson.studentArtifact || ''),
      diagnosticEvidence: plan.diagnosticEvidence || '',
      guidedPracticeEvidence: plan.guidedPracticeEvidence || '',
      independentPerformanceEvidence: plan.independentPerformanceEvidence || '',
      feedbackRevisionEvidence: plan.feedbackRevisionEvidence || '',
      transferEvidence: plan.transferEvidence || '',
      misconceptionRepairEvidence: plan.misconceptionRepairEvidence || '',
      masteryThreshold: plan.masteryThreshold || '',
      evidencePortfolioStages: (plan.evidencePortfolio || []).map((entry) => entry.stage).filter(Boolean),
      reviewerCue: plan.reviewerCue || '',
    };
  });
  const missingFieldCount = lessonRows.reduce(
    (sum, row) =>
      sum + requiredFields.filter((field) => !row[field]).length + (row.evidencePortfolioStages.length < 6 ? 1 : 0),
    0,
  );
  return {
    version: 1,
    status: missingFieldCount === 0 && lessonRows.length === lessons.length ? 'complete' : 'needs-review',
    policy:
      'The compiler should prove mastery through diagnostic, guided-practice, independent-performance, feedback-revision, transfer, and misconception-repair evidence before treating a lesson as classroom-ready.',
    checkedStages: [
      'diagnostic',
      'guided-practice',
      'independent-performance',
      'feedback-revision',
      'transfer',
      'misconception-repair',
    ],
    missingFieldCount,
    lessonRows,
  };
}

function buildLessonEvidenceResponsePlan({ lesson = {} }) {
  const mastery = lesson.masteryEvidencePlan || {};
  const concept = mastery.concept || primaryConceptForLesson(lesson);
  const artifact = mastery.artifact || stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const readySignal =
    mastery.masteryThreshold || `Students cite evidence, explain the decision, and show revision in ${artifact}.`;
  const partialSignal =
    mastery.guidedPracticeEvidence ||
    lesson.feedbackCycle?.formativeEvidence ||
    `Students show some ${concept} evidence but need stronger reasoning before ${artifact} is ready.`;
  const supportSignal =
    mastery.diagnosticEvidence ||
    mastery.misconceptionRepairEvidence ||
    `Students cannot yet connect ${concept} to inspectable evidence.`;
  const readyMove =
    lesson.readinessSupport?.extensionMove ||
    lesson.prerequisitePlan?.accelerationMove ||
    `Ask ready students to compare two evidence choices and explain which one strengthens ${artifact}.`;
  const partialMove =
    lesson.feedbackCycle?.feedbackMethod ||
    `Give criterion-level feedback that names the strongest evidence move and one revision priority for ${artifact}.`;
  const supportMove =
    lesson.readinessSupport?.supportMove ||
    lesson.prerequisitePlan?.reteachMove ||
    `Reteach ${concept} with one worked evidence sentence before students continue ${artifact}.`;
  const recheckCue =
    lesson.feedbackCycle?.closureCheck ||
    `Recheck ${artifact} by asking students what evidence changed and what still needs review.`;
  const decisionStates = [
    {
      state: 'ready',
      evidenceSignal: readySignal,
      instructorMove: readyMove,
      studentMove:
        lesson.learningTransferPlan?.transferTask ||
        `Extend ${artifact} by transferring one ${concept} evidence move to the next course task.`,
      nextStep: mastery.transferEvidence || lesson.conceptDependencyPlan?.transferCue || '',
    },
    {
      state: 'partial',
      evidenceSignal: partialSignal,
      instructorMove: partialMove,
      studentMove:
        lesson.feedbackCycle?.studentRevisionAction ||
        `Revise ${artifact} by replacing one general claim with inspectable ${concept} evidence.`,
      nextStep: `Recheck the revised ${artifact} before moving to transfer.`,
    },
    {
      state: 'needs-support',
      evidenceSignal: supportSignal,
      instructorMove: supportMove,
      studentMove:
        lesson.modelContrast?.transferPrompt ||
        `Annotate one source detail and rebuild one ${concept} sentence before independent work.`,
      nextStep: `Return to guided practice before scoring ${artifact}.`,
    },
  ];
  return {
    version: 1,
    concept,
    artifact,
    readySignal,
    partialSignal,
    supportSignal,
    readyMove,
    partialMove,
    supportMove,
    recheckCue,
    escalationCue: `If the support signal persists after reteaching, pause publication or grading of ${artifact} and review the source materials, task directions, and support assumptions with the instructor.`,
    decisionStates,
    reviewerCue: `Check whether ${stripLessonPrefix(lesson.title)} gives the instructor distinct ready, partial, and needs-support responses instead of a single generic feedback note.`,
  };
}

function attachEvidenceResponseToLessons(lessons = []) {
  return lessons.map((lesson) => ({
    ...lesson,
    evidenceResponsePlan: buildLessonEvidenceResponsePlan({ lesson }),
  }));
}

function buildEvidenceResponseMap(lessons = []) {
  const requiredFields = [
    'readySignal',
    'partialSignal',
    'supportSignal',
    'readyMove',
    'partialMove',
    'supportMove',
    'recheckCue',
  ];
  const lessonRows = lessons.map((lesson) => {
    const plan = lesson.evidenceResponsePlan || {};
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      concept: plan.concept || primaryConceptForLesson(lesson),
      artifact: plan.artifact || stripTerminalPunctuation(lesson.studentArtifact || ''),
      readySignal: plan.readySignal || '',
      partialSignal: plan.partialSignal || '',
      supportSignal: plan.supportSignal || '',
      readyMove: plan.readyMove || '',
      partialMove: plan.partialMove || '',
      supportMove: plan.supportMove || '',
      recheckCue: plan.recheckCue || '',
      decisionStateCount: Array.isArray(plan.decisionStates) ? plan.decisionStates.length : 0,
      reviewerCue: plan.reviewerCue || '',
    };
  });
  const missingFieldCount = lessonRows.reduce(
    (sum, row) => sum + requiredFields.filter((field) => !row[field]).length + (row.decisionStateCount < 3 ? 1 : 0),
    0,
  );
  return {
    version: 1,
    status: missingFieldCount === 0 && lessonRows.length === lessons.length ? 'complete' : 'needs-review',
    policy:
      'The compiler should turn mastery evidence into distinct ready, partial, and needs-support instructional responses so teachers can adapt without inventing a new remediation plan.',
    checkedStates: ['ready', 'partial', 'needs-support'],
    missingFieldCount,
    lessonRows,
  };
}

function isWeakConcept(value) {
  if (isObjectiveStemOnly(value)) return true;
  return /^(?:tbd|to be determined|none|n\/a|lesson|week|topic|topic\s*\d+|lesson\s*\d+\s*focus|block|clinical|community|health|studio|seminar|placement)$/i.test(
    cleanText(value),
  );
}

function titleCandidateFromTopic(value) {
  const text = cleanText(value);
  if (!text) return '';
  const slashParts = text
    .split('/')
    .map((part) => cleanText(part))
    .filter(Boolean);
  const candidate =
    slashParts.length > 1
      ? /^(?:studio\s+seminar|clinical\s+placement|field\s+application)$/i.test(slashParts[0])
        ? slashParts[slashParts.length - 1]
        : slashParts.join(' and ')
      : text;
  return candidate.replace(/^(?:studio\s+seminar|clinical\s+placement|field\s+application)\s*[:.-]?\s*/i, '').trim();
}

function titleFallbackFromTopics(topics = []) {
  const candidates = topics.map(titleCandidateFromTopic).filter((topic) => topic && !isWeakConcept(topic));
  if (candidates.length === 0) return '';
  return candidates
    .map((candidate, index) => {
      const wordLength = candidate.split(/\s+/).filter(Boolean).length;
      const punctuationPenalty = /[,;]/.test(candidate) ? 4 : 0;
      const lengthPenalty = wordLength > 8 ? wordLength - 8 : 0;
      const specificityBonus = /^[A-Z]/.test(candidate) && wordLength >= 2 && wordLength <= 8 ? -2 : 0;
      return {
        candidate,
        score: punctuationPenalty + lengthPenalty + specificityBonus + index * 0.01,
      };
    })
    .sort((a, b) => a.score - b.score)[0].candidate;
}

function addCourseSequenceSemantics(lessons) {
  return lessons.map((lesson, index) => {
    const previous = lessons[index - 1];
    const next = lessons[index + 1];
    const stage = index === 0 ? 'launch' : index >= lessons.length - 2 ? 'synthesis' : lesson.difficultyProfile.stage;
    const prerequisitePlan = buildPrerequisitePlan({ lesson, previous });
    const sequencedLesson = {
      ...lesson,
      prerequisitePlan,
      pacing: {
        stage,
        bridgeFrom: previous
          ? `Carry forward ${previous.keyConcepts[0] || stripLessonPrefix(previous.title)} into ${stripLessonPrefix(lesson.title)}.`
          : `Launch the course arc through ${stripLessonPrefix(lesson.title)}.`,
        bridgeTo: next
          ? `Prepare students to use ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)} in ${stripLessonPrefix(next.title)}.`
          : 'Prepare students for final synthesis, revision, and transfer.',
        prerequisiteConcepts: prerequisitePlan.assumedKnowledge,
        transferTarget: next ? next.studentArtifact : 'final course synthesis',
      },
      learningTransferPlan: buildLearningTransferPlan({ lesson, previous, next }),
    };
    return {
      ...sequencedLesson,
      teachingIntent: buildTeachingIntent({ lesson: sequencedLesson, previous, next }),
    };
  });
}

function buildCourseArc(lessons, conceptDependencyGraph = null, throughlineContext = null) {
  const first = lessons[0];
  const last = lessons[lessons.length - 1];
  const stageOrder = unique(lessons.map((lesson) => lesson.pacing?.stage).filter(Boolean), lessons.length);
  const defaultThroughline =
    first && last
      ? `The course moves from ${stripLessonPrefix(first.title)} toward ${stripLessonPrefix(last.title)} through repeated evidence, practice, feedback, and revision cycles.`
      : 'The course uses repeated evidence, practice, feedback, and revision cycles.';
  return {
    throughline: throughlineContext
      ? `Students return to ${throughlineContext.projectName} for ${throughlineContext.clientName} as the course moves from ${stripLessonPrefix(first?.title || 'the opening lesson')} toward ${stripLessonPrefix(last?.title || 'final synthesis')} through repeated evidence, practice, feedback, and revision cycles.`
      : defaultThroughline,
    caseThroughline: throughlineContext
      ? {
          projectName: throughlineContext.projectName,
          clientName: throughlineContext.clientName,
          datasetName: throughlineContext.datasetName,
          recurringQuestion: throughlineContext.recurringQuestion,
        }
      : null,
    stages: stageOrder.map((stage) => ({
      stage,
      lessonNumbers: lessons.filter((lesson) => lesson.pacing?.stage === stage).map((lesson) => lesson.lessonNumber),
    })),
    conceptThread: conceptDependencyGraph?.conceptThread || '',
    dependencyEdgeCount: conceptDependencyGraph?.edgeCount || 0,
  };
}

function buildCourseWorkload(lessons) {
  const totalStudentMinutes = lessons.reduce(
    (sum, lesson) => sum + (lesson.workloadEstimate?.totalStudentMinutes || 0),
    0,
  );
  const totalPlannedClassMinutes = lessons.reduce(
    (sum, lesson) =>
      sum + (lesson.classSessionPlan?.plannedClassMinutes || lesson.workloadEstimate?.inClassMinutes || 0),
    0,
  );
  const averagePerLessonMinutes = lessons.length ? Math.round(totalStudentMinutes / lessons.length) : 0;
  const averagePlannedClassMinutes = lessons.length ? Math.round(totalPlannedClassMinutes / lessons.length) : 0;
  const lessonRows = lessons.map((lesson) => {
    const beforeClassMinutes = Number(lesson.workloadEstimate?.beforeClassMinutes || 0);
    const inClassMinutes = Number(lesson.workloadEstimate?.inClassMinutes || 0);
    const afterClassMinutes = Number(lesson.workloadEstimate?.afterClassMinutes || 0);
    const outOfClassMinutes = beforeClassMinutes + afterClassMinutes;
    const totalMinutes =
      Number(lesson.workloadEstimate?.totalStudentMinutes || 0) ||
      beforeClassMinutes + inClassMinutes + afterClassMinutes;
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      beforeClassMinutes,
      inClassMinutes,
      afterClassMinutes,
      outOfClassMinutes,
      totalStudentMinutes: totalMinutes,
      workloadFit: classifyOutOfClassWorkload(outOfClassMinutes),
      studentFacingEstimate:
        lesson.workloadEstimate?.studentFacingEstimate ||
        (totalMinutes ? `${Math.round(totalMinutes / 30) / 2} hours including class time` : ''),
    };
  });
  const totalOutOfClassMinutes = lessonRows.reduce((sum, row) => sum + row.outOfClassMinutes, 0);
  const averageOutOfClassMinutes = lessonRows.length ? Math.round(totalOutOfClassMinutes / lessonRows.length) : 0;
  const maxOutOfClassMinutes = lessonRows.length ? Math.max(...lessonRows.map((row) => row.outOfClassMinutes)) : 0;
  const maxTotalStudentMinutes = lessonRows.length ? Math.max(...lessonRows.map((row) => row.totalStudentMinutes)) : 0;
  const spikeThreshold = Math.max(150, Math.round(averageOutOfClassMinutes * 1.6));
  const workloadRows = lessonRows.map((row) => ({
    ...row,
    workloadSpike: averageOutOfClassMinutes > 0 && row.outOfClassMinutes > spikeThreshold,
  }));
  const workloadReviewCount = workloadRows.filter(
    (row) => row.workloadFit === 'review-heavy-out-of-class-load' || row.workloadSpike,
  ).length;
  const timingReviewCount = lessons.filter(
    (lesson) => lesson.classSessionPlan?.feasibilityStatus !== 'fits-session',
  ).length;
  return {
    totalStudentMinutes,
    totalOutOfClassMinutes,
    averagePerLessonMinutes,
    averagePerLessonHours: Number((averagePerLessonMinutes / 60).toFixed(1)),
    averageOutOfClassMinutes,
    averagePlannedClassMinutes,
    maxOutOfClassMinutes,
    maxTotalStudentMinutes,
    workloadBalanceStatus: workloadReviewCount > 0 ? 'needs-workload-review' : 'balanced',
    workloadReviewCount,
    spikeThreshold,
    lessonRows: workloadRows,
    timingStatus: timingReviewCount > 0 ? 'needs-timing-review' : 'fits-session',
    timingReviewCount,
  };
}

function buildLearnerContextProfile({
  courseName,
  courseConcepts,
  lessons,
  lens: providedLens = null,
  courseModalityProfile = null,
}) {
  const lens = alignLensToCourseModality(
    {
      ...inferDisciplineLens(courseName, courseConcepts),
      ...(providedLens && typeof providedLens === 'object' ? providedLens : {}),
    },
    courseModalityProfile,
  );
  const firstLesson = lessons[0] || {};
  const firstConcept = firstLesson.keyConcepts?.[0] || stripLessonPrefix(firstLesson.title) || 'the course focus';
  const firstArtifact = stripTerminalPunctuation(firstLesson.studentArtifact || 'the first course artifact');
  const localReviewNeeds = unique(
    lessons.flatMap((lesson) => lesson.missingSignals || []),
    8,
  );
  return {
    source: 'compiler-derived-from-course-map',
    domain: lens.domain,
    evidenceNoun: lens.evidenceNoun,
    decisionNoun: lens.decisionNoun,
    exampleNoun: lens.exampleNoun,
    learnerRole: lens.learnerRole,
    expectedPriorKnowledge: unique(
      [
        `Baseline familiarity with ${firstConcept} vocabulary or examples`,
        'Ability to access official course readings, activities, and submission tools',
        'Readiness to revise work after criterion-level feedback',
      ],
      5,
    ),
    coursePerformanceRole: `Students work as ${pluralizeLensPhrase(lens.learnerRole)} who use ${lens.evidenceNoun} to make ${pluralizeLensPhrase(lens.decisionNoun)} across the course.`,
    supportAssumptions: [
      `Model ${firstConcept} evidence use before asking students to complete ${firstArtifact}.`,
      'Provide sentence frames, quiet think-write time, and explicit source cues before peer discussion or submission.',
      'Treat missing official readings, dates, policy language, and accommodations as instructor-review items, not compiler facts.',
    ],
    participationModes: [
      'individual think-write',
      'paired evidence rehearsal',
      'small-group critique',
      'written or spoken exit ticket',
    ],
    localReviewNeeds:
      localReviewNeeds.length > 0
        ? localReviewNeeds
        : [
            'Confirm official dates, policies, source access, platform names, and accommodation details before publishing.',
          ],
    instructorUse: `Use this learner context to tune pacing, examples, support moves, and review flags before finalizing ${courseName}.`,
  };
}

function buildCourseModalityProfile({ courseName, lessons }) {
  const courseNameText = cleanText(courseName).toLowerCase();
  const text = `${courseName} ${lessons
    .flatMap((lesson) => [
      lesson.title,
      lesson.activityPattern,
      lesson.studentArtifact,
      ...(lesson.keyConcepts || []),
      ...(lesson.readings || []),
    ])
    .join(' ')}`.toLowerCase();
  const countPattern = (pattern) => (text.match(pattern) || []).length;
  const clinicalCoreScore = countPattern(
    /\b(clinical|patient|healthcare|health care|interpreter|discharge|symptom|medication|dosage)\b/g,
  );
  const clinicalSimulationScore =
    clinicalCoreScore > 0
      ? countPattern(/\b(simulation|role[-\s]?play|encounter|oral performance|teach[-\s]?back|triage)\b/g)
      : 0;
  const clinicalScore = clinicalCoreScore + clinicalSimulationScore;
  const clinicalJudgmentCoreScore = hasClinicalJudgmentEvidence(text)
    ? countPattern(
        /\b(nursing|clinical judgment|clinical reasoning|patient care|patient safety|medical[-\s]?surgical|med[-\s]?surg|pharmacology|allied health|clinical practice|health assessment)\b/g,
      )
    : 0;
  const clinicalJudgmentPracticeScore =
    clinicalJudgmentCoreScore > 0
      ? countPattern(
          /\b(care plan|nursing diagnosis|sbar|handoff|patient assessment|assessment data|clinical decision|prioritization|priority setting|intervention plan|medication administration|medication safety|vital signs|deterioration|clinical cue|charting|ehr|pathophysiology|risk assessment|adpie|monitoring plan)\b/g,
        )
      : 0;
  const clinicalJudgmentScore = clinicalJudgmentCoreScore + clinicalJudgmentPracticeScore;
  const clinicalPlacementCoreScore = hasClinicalPlacementEvidence(text)
    ? countPattern(
        /\b(nursing|clinical|patient care|patient safety|allied health|healthcare|health care|clinical practice|clinical rotation|clinical site)\b/g,
      )
    : 0;
  const clinicalPlacementPracticeScore =
    clinicalPlacementCoreScore > 0
      ? countPattern(
          /\b(clinical placement|clinical practicum|clinical rotation|clinical hours|clinical site|preceptor|site supervisor|supervised practice|placement handbook|patient encounter log|competency log|skills checklist|preceptor feedback|site evaluation|deidentified patient|confidentiality|hipaa|scope of practice|clinical conference)\b/g,
        )
      : 0;
  const clinicalPlacementScore = clinicalPlacementCoreScore + clinicalPlacementPracticeScore;
  const clinicalPlacementStrongScore =
    clinicalPlacementCoreScore > 0
      ? countPattern(
          /\b(clinical practicum|clinical rotation|clinical hours|clinical site|preceptor|site supervisor|supervised practice|patient encounter log|competency log|skills checklist|preceptor feedback|site evaluation|deidentified patient|confidentiality|hipaa|scope of practice)\b/g,
        )
      : 0;
  const studioScore =
    countPattern(
      /\b(interaction design|course design studio|course design|instructional design|prototype|usability|design system|journey map|wireframe|affinity)\b/g,
    ) +
    (/\bcritique\b/.test(text) &&
    /\b(studio|prototype|usability|portfolio rationale|wireframe|design system|interaction design)\b/.test(text)
      ? 2
      : 0) +
    (/\bstudio\b/.test(text) && /\b(prototype|wireframe|usability|interaction design|design system)\b/.test(text)
      ? 1
      : 0);
  const fieldScore = countPattern(
    /\b(field placement|placement|community|stakeholder|site visit|site evidence|implementation|public health|program|supervisor|supervision|professional boundary|case handoff|referral|asset map)\b/g,
  );
  const capstoneScore = countPattern(
    /\b(capstone|senior project|client project|sponsor|project charter|project milestone|portfolio defense|final showcase|proposal defense|stakeholder brief)\b/g,
  );
  const hasExplicitStudioCourseSignal =
    /\b(course design studio|design studio|interaction design studio|instructional design|studio)\b/.test(
      courseNameText,
    ) || /\b(course design studio|design studio|interaction design studio)\b/.test(text);
  const competencyScore = countPattern(
    /\b(competency|proficiency|accreditation|standards[-\s]?aligned|program standard|performance task|evidence portfolio|mastery demonstration|benchmark|calibration panel|remediation plan)\b/g,
  );
  const performingArtsCoreScore = hasPerformingArtsEvidence(text)
    ? countPattern(
        /\b(acting studio|acting|theatre performance|theater performance|performance studio|performance lab|scene study|monologue|voice and movement|dance technique|dance composition|choreography|music ensemble|vocal performance|instrumental performance|musicianship|rehearsal studio|stagecraft|blocking|staging)\b/g,
      )
    : 0;
  const performingArtsPracticeScore =
    performingArtsCoreScore > 0
      ? countPattern(
          /\b(rehearsal|run[-\s]?through|performance recording|performance critique|director note|ensemble cue|movement phrase|vocal warm[-\s]?up|score study|blocking note|stage picture|audition|technique drill|peer critique)\b/g,
        )
      : 0;
  const performingArtsScore = performingArtsCoreScore + performingArtsPracticeScore;
  const creativeProductionScore = countPattern(
    /\b(creative writing|poetry workshop|fiction workshop|screenwriting workshop|playwriting workshop|draft workshop|workshop critique|manuscript|creative draft|scene draft|poem draft|fiction draft|short story draft|screenplay draft|revision portfolio|artist statement|process journal|line[-\s]?level revision|craft essay|studio art)\b/g,
  );
  const creativeScore =
    creativeProductionScore +
    (/\b(creative writing|poetry workshop|fiction workshop|screenwriting workshop|playwriting workshop|studio art)\b/.test(
      text,
    )
      ? 2
      : 0);
  const caseCoreScore = countPattern(
    /\b(business strategy|mba|business case|strategy case|management case|market entry|competitive advantage|go[-\s]?to[-\s]?market|business model|operating margin|customer segment|executive memo|financial tradeoff)\b/g,
  );
  const casePracticeScore =
    caseCoreScore > 0
      ? countPattern(
          /\b(case method|case analysis|case discussion|case memo|case packet|recommendation memo|decision memo|decision criteria|stakeholder tradeoff|implementation risk)\b/g,
        )
      : 0;
  const caseScore = caseCoreScore + casePracticeScore;
  const legalCoreScore = countPattern(
    /\b(constitutional law|legal doctrine|doctrinal analysis|legal memo|legal rule|statute|statutory interpretation|jurisdiction|standing|strict scrutiny|intermediate scrutiny|rational basis|constitutional standard|precedent)\b/g,
  );
  const legalPracticeScore =
    legalCoreScore > 0
      ? countPattern(
          /\b(case brief|issue spotting|irac|holding|rationale|rule statement|hypothetical application|doctrinal limit|policy rationale|dissent|legal conclusion)\b/g,
        )
      : 0;
  const legalScore = legalCoreScore + legalPracticeScore;
  const proofCoreScore = hasProofSeminarEvidence(text)
    ? countPattern(
        /\b(proof[-\s]?based mathematics|mathematical proof|proof seminar|real analysis|abstract algebra|number theory|topology|discrete mathematics|advanced calculus|mathematical logic|theorem proving|proof writing)\b/g,
      )
    : 0;
  const proofPracticeScore =
    proofCoreScore > 0
      ? countPattern(
          /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof strategy|direct proof|proof by contradiction|induction proof|epsilon[-\s]?delta|quantifier|logical implication|formal proof|proof critique|proof revision|proof portfolio)\b/g,
        )
      : 0;
  const proofScore = proofCoreScore + proofPracticeScore;
  const engineeringCoreScore = hasEngineeringDesignEvidence(text)
    ? countPattern(
        /\b(engineering design|mechanical engineering|electrical engineering|civil engineering|biomedical engineering|engineering lab|design-build-test|design build test|manufacturing|mechatronics|robotics|cad|solidworks|prototype fabrication)\b/g,
      )
    : 0;
  const engineeringPracticeScore =
    engineeringCoreScore > 0
      ? countPattern(
          /\b(requirement|requirements|constraint|constraints|specification|tolerance|load test|stress test|prototype test|bench test|failure analysis|design verification|verification test|test data|test fixture|trade[-\s]?off matrix|design review|redesign|iteration|safety factor|fabrication|measurement evidence)\b/g,
        )
      : 0;
  const engineeringScore = engineeringCoreScore + engineeringPracticeScore;
  const statisticsInferenceCoreScore = hasStatisticsInferenceEvidence(text)
    ? countPattern(
        /\b(inferential statistics|statistical inference|introductory statistics|introduction to statistics|intro statistics|biostatistics|business statistics|applied statistics|statistics inference|hypothesis testing|confidence interval)\b/g,
      )
    : 0;
  const statisticsInferencePracticeScore =
    statisticsInferenceCoreScore > 0
      ? countPattern(
          /\b(confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|p value|statistical significance|sampling distribution|standard error|margin of error|test statistic|t[-\s]?test|chi[-\s]?square|anova|regression inference|assumption check|effect size|type i error|type ii error|inference decision)\b/g,
        )
      : 0;
  const statisticsInferenceScore = statisticsInferenceCoreScore + statisticsInferencePracticeScore;
  const informationLiteracyCoreScore = hasInformationLiteracyEvidence(text)
    ? countPattern(
        /\b(information literacy|library research|research instruction|academic research skills|source evaluation|database search|bibliographic research|citation management|annotated bibliography|research librarian|library database)\b/g,
      )
    : 0;
  const informationLiteracyPracticeScore =
    informationLiteracyCoreScore > 0
      ? countPattern(
          /\b(database search|search strategy|keyword search|controlled vocabulary|source evaluation|credibility check|peer[-\s]?reviewed|scholarly source|citation trail|citation management|annotated bibliography|synthesis matrix|literature search|research log|source-use decision)\b/g,
        )
      : 0;
  const informationLiteracyScore = informationLiteracyCoreScore + informationLiteracyPracticeScore;
  const hasExplicitInformationLiteracySignal =
    /\b(information literacy|library research|library instruction|research instruction|academic research skills)\b/.test(
      courseNameText,
    );
  const teacherPreparationCoreScore = hasTeacherPreparationEvidence(text)
    ? countPattern(
        /\b(teacher preparation|teacher education methods|teaching methods|instructional methods|curriculum and instruction|student teaching seminar|teacher candidate|preservice teacher|pre-service teacher|lesson study|classroom teaching|pedagogy practicum)\b/g,
      )
    : 0;
  const teacherPreparationPracticeScore =
    teacherPreparationCoreScore > 0
      ? countPattern(
          /\b(lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|standards alignment|learning target|differentiation|formative assessment|student work analysis|classroom management|instructional strategy|assessment plan|rubric calibration|scaffolding|reteach plan|family communication|edTPA|lesson study)\b/g,
        )
      : 0;
  const teacherPreparationScore = teacherPreparationCoreScore + teacherPreparationPracticeScore;
  const counselingPracticeCoreScore = hasCounselingPracticeEvidence(text)
    ? countPattern(
        /\b(counseling skills|counselling skills|counselor education|counsellor education|social work practice|clinical social work|human services practice|helping skills|case management|mental health counseling|school counseling|family therapy|client interview|intake interview)\b/g,
      )
    : 0;
  const counselingPracticeSkillScore =
    counselingPracticeCoreScore > 0
      ? countPattern(
          /\b(active listening|reflective listening|motivational interviewing|open question|affirmation|reflection|summary|oars|intake note|case conceptualization|biopsychosocial|risk assessment|safety plan|mandated reporting|referral plan|treatment plan|service plan|case note|process recording|session note|supervision note|client goal|rapport building|crisis response)\b/g,
        )
      : 0;
  const counselingPracticeScore = counselingPracticeCoreScore + counselingPracticeSkillScore;
  const accountingFinanceCoreScore = hasAccountingFinanceEvidence(text)
    ? countPattern(
        /\b(financial accounting|managerial accounting|principles of accounting|introductory accounting|introduction to accounting|accounting|bookkeeping|cost accounting|corporate finance|principles of finance|introduction to finance|introductory finance|finance course|financial statement analysis|financial management|budgeting and forecasting)\b/g,
      )
    : 0;
  const accountingFinancePracticeScore =
    accountingFinanceCoreScore > 0
      ? countPattern(
          /\b(balance sheet|income statement|cash[-\s]?flow statement|cash[-\s]?flow forecast|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|closing entr(?:y|ies)|ratio analysis|financial ratio|current ratio|debt[-\s]?to[-\s]?equity|gross margin|budget variance|variance analysis|cost[-\s]?volume[-\s]?profit|break[-\s]?even|contribution margin|net present value|npv|discounted cash flow|valuation|working capital|audit trail|internal control)\b/g,
        )
      : 0;
  const accountingFinanceScore = accountingFinanceCoreScore + accountingFinancePracticeScore;
  const policyAnalysisCoreScore = hasPolicyAnalysisEvidence(text)
    ? countPattern(
        /\b(public policy|policy analysis|policy design|policy evaluation|policy implementation|public administration|public affairs|urban policy|social policy|education policy|health policy|environmental policy|regulatory policy|governance)\b/g,
      )
    : 0;
  const policyAnalysisPracticeScore =
    policyAnalysisCoreScore > 0
      ? countPattern(
          /\b(policy memo|policy brief|policy option|policy options|stakeholder analysis|equity analysis|implementation plan|implementation constraint|feasibility|cost[-\s]?benefit|impact assessment|regulatory analysis|benefit[-\s]?cost|logic model|theory of change|program evaluation|administrative burden|public value|policy trade[-\s]?off)\b/g,
        )
      : 0;
  const policyAnalysisScore = policyAnalysisCoreScore + policyAnalysisPracticeScore;
  const economicsAnalysisCoreScore = hasEconomicsAnalysisEvidence(text)
    ? countPattern(
        /\b(microeconomics|macroeconomics|principles of economics|introduction to economics|introductory economics|intro economics|managerial economics|labor economics|development economics|environmental economics|health economics|economics course|economic analysis|economic theory|market equilibrium|supply and demand)\b/g,
      )
    : 0;
  const economicsAnalysisPracticeScore =
    economicsAnalysisCoreScore > 0
      ? countPattern(
          /\b(supply and demand|supply curve|demand curve|elasticity|market equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare analysis|incentive|scarcity|trade[-\s]?off|monopoly|perfect competition|gdp|inflation|unemployment|monetary policy|fiscal policy|aggregate demand|aggregate supply)\b/g,
        )
      : 0;
  const economicsAnalysisScore = economicsAnalysisCoreScore + economicsAnalysisPracticeScore;
  const ethicsArgumentCoreScore = hasEthicsArgumentEvidence(text)
    ? countPattern(
        /\b(ethics|ethical reasoning|moral philosophy|moral reasoning|normative ethics|applied ethics|bioethics|business ethics|technology ethics|data ethics|environmental ethics|professional ethics|medical ethics|philosophy course|introduction to philosophy|intro philosophy)\b/g,
      )
    : 0;
  const ethicsArgumentPracticeScore =
    ethicsArgumentCoreScore > 0
      ? countPattern(
          /\b(moral argument|ethical argument|argument map|argument mapping|normative framework|utilitarianism|deontology|virtue ethics|care ethics|rights theory|justice theory|moral dilemma|thought experiment|objection|counterargument|reply|principle|moral judgment|ethical judgment|trolley problem|case dilemma)\b/g,
        )
      : 0;
  const ethicsArgumentScore = ethicsArgumentCoreScore + ethicsArgumentPracticeScore;
  const dataScienceCoreScore = hasDataScienceLabEvidence(text)
    ? countPattern(
        /\b(data science|data analytics|business analytics|analytics lab|applied machine learning|machine learning|machine learning lab|statistical learning|data mining|predictive modeling|predictive analytics|model evaluation|model validation|data visualization|analytics dashboard|jupyter notebook|r notebook|notebook analysis|dataframe)\b/g,
      )
    : 0;
  const dataSciencePracticeScore =
    dataScienceCoreScore > 0
      ? countPattern(
          /\b(data cleaning|data wrangling|exploratory data analysis|eda|visualization|dashboard|model validation|train[-\s]?test|cross[-\s]?validation|feature engineering|predictive model|classification model|regression model|confusion matrix|validation metric|bias audit|fairness audit|data story|reproducible analysis|notebook report)\b/g,
        )
      : 0;
  const dataScienceScore = dataScienceCoreScore + dataSciencePracticeScore;
  const programmingCoreScore = hasProgrammingLabEvidence(text)
    ? countPattern(
        /\b(programming|computer science|software engineering|software development|web development|data structures|intro to python|python|javascript|typescript|java|coding lab|code lab|software design|software studio)\b/g,
      )
    : 0;
  const programmingPracticeScore =
    programmingCoreScore > 0
      ? countPattern(
          /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/g,
        )
      : 0;
  const programmingScore = programmingCoreScore + programmingPracticeScore;
  const lectureExamCoreScore = hasLectureExamEvidence(text)
    ? countPattern(
        /\b(introduction to|introductory|principles of|survey course|general education|large lecture|lecture course|lecture|foundations of|intro psychology|psychology|economics|sociology|political science|biology survey)\b/g,
      )
    : 0;
  const lectureExamPracticeScore =
    lectureExamCoreScore > 0
      ? countPattern(
          /\b(exam|midterm|final|unit test|test bank|practice quiz|concept check|clicker question|retrieval practice|lecture notes|study guide|misconception check|exam blueprint)\b/g,
        )
      : 0;
  const lectureExamScore = lectureExamCoreScore + lectureExamPracticeScore;
  const worldLanguageCoreScore = hasWorldLanguageEvidence(text)
    ? countPattern(
        /\b(world language|foreign language|second language|language proficiency|spanish|french|mandarin|chinese|arabic|german|italian|japanese|korean|asl|american sign language|esl|english language learner|bilingual|heritage speaker)\b/g,
      )
    : 0;
  const worldLanguagePracticeScore =
    worldLanguageCoreScore > 0
      ? countPattern(
          /\b(conversation|dialogue|oral proficiency|speaking|listening|pronunciation|grammar|vocabulary|interpersonal|interpretive|presentational|cultural comparison|language function|can[-\s]?do statement|proficiency task|comprehensible input)\b/g,
        )
      : 0;
  const worldLanguageScore = worldLanguageCoreScore + worldLanguagePracticeScore;
  const humanitiesCoreScore = hasInterpretiveHumanitiesEvidence(text)
    ? countPattern(
        /\b(comparative literature|literary studies|english literature|world literature|film studies|film|cinema|media studies|humanities|art history|theatre|theater|poetry|novel|short story|cultural studies|history seminar|history course|historiography|primary source analysis)\b/g,
      )
    : 0;
  const humanitiesPracticeScore =
    humanitiesCoreScore > 0
      ? countPattern(
          /\b(close[-\s]?reading|interpretive claim|interpretive argument|passage evidence|textual evidence|historical context|translation choice|critical lens|genre convention|visual analysis|scene analysis|primary source analysis|historiography|archive note|reception context|source integrity)\b/g,
        )
      : 0;
  const humanitiesScore = humanitiesCoreScore + humanitiesPracticeScore;
  const labScore = countPattern(
    /\b(lab|laboratory|dataset|data set|experiment|coding|field note|observation|instrument|survey|statistics|data-cleaning|method)\b/g,
  );
  const capstoneDominatesStudio =
    capstoneScore >= 2 &&
    (!hasExplicitStudioCourseSignal || capstoneScore >= studioScore + 3) &&
    capstoneScore >= Math.max(fieldScore, labScore);
  const hasOnline =
    /\b(online|asynchronous|discussion board|self[-\s]?paced|lms|remote|virtual)\b/.test(text) ||
    lessons.some((lesson) => /asynchronous|online|discussion board|lms/i.test(lesson.activityPattern || ''));
  const dataScienceLabShouldWin =
    dataScienceScore >= 3 &&
    (dataScienceScore >= lectureExamScore - 1 ||
      programmingScore >= lectureExamScore ||
      /\b(applied machine learning|machine learning|predictive modeling|model evaluation|classification model|regression model|jupyter|notebook)\b/.test(
        courseNameText,
      ));
  const lectureExamShouldWin =
    lectureExamScore >= 3 &&
    !hasOnline &&
    lectureExamScore >= Math.max(labScore, fieldScore, studioScore) &&
    !dataScienceLabShouldWin;

  const primaryMode =
    worldLanguageScore >= 3 && clinicalScore < 2 && !hasOnline
      ? 'world-language'
      : accountingFinanceScore >= 3 && !hasOnline
        ? 'accounting-finance-analysis'
        : policyAnalysisScore >= 3 && !hasOnline
          ? 'policy-analysis'
          : economicsAnalysisScore >= 3 && !hasOnline
            ? 'economics-analysis'
            : ethicsArgumentScore >= 3 && !hasOnline
              ? 'ethics-argumentation'
              : informationLiteracyScore >= 3 && hasExplicitInformationLiteracySignal
                ? 'information-literacy'
                : teacherPreparationScore >= 3
                  ? 'teacher-preparation'
                  : counselingPracticeScore >= 3
                    ? 'counseling-practice'
                    : statisticsInferenceScore >= 3 && !hasOnline
                      ? 'statistics-inference'
                      : dataScienceLabShouldWin
                        ? 'data-science-lab'
                        : lectureExamShouldWin
                          ? 'lecture-exam'
                          : clinicalPlacementScore >= 3 && clinicalPlacementStrongScore >= 2
                            ? 'clinical-placement-practicum'
                            : clinicalJudgmentScore >= 3
                              ? 'clinical-judgment-simulation'
                              : clinicalScore >= 2
                                ? 'clinical-simulation'
                                : capstoneDominatesStudio
                                  ? 'capstone-project'
                                  : competencyScore >= 2 &&
                                      competencyScore >= Math.max(labScore, fieldScore, studioScore)
                                    ? 'competency-based'
                                    : performingArtsScore >= 3 && !hasOnline
                                      ? 'performing-arts'
                                      : creativeScore >= 2 && !hasOnline
                                        ? 'creative-studio'
                                        : caseScore >= 2
                                          ? 'case-method'
                                          : legalScore >= 2
                                            ? 'legal-doctrinal'
                                            : proofScore >= 3
                                              ? 'proof-seminar'
                                              : engineeringScore >= 3
                                                ? 'engineering-design-lab'
                                                : dataScienceScore >= 3
                                                  ? 'data-science-lab'
                                                  : programmingScore >= 3
                                                    ? 'programming-lab'
                                                    : humanitiesScore >= 3 && !hasOnline
                                                      ? 'interpretive-humanities'
                                                      : studioScore >= 2 &&
                                                          studioScore >= fieldScore &&
                                                          studioScore >= labScore
                                                        ? 'studio-lab'
                                                        : fieldScore >= 2 && fieldScore >= labScore
                                                          ? 'field-applied'
                                                          : labScore >= 2
                                                            ? 'applied-lab'
                                                            : hasOnline
                                                              ? 'online-hybrid'
                                                              : 'weekly-applied-seminar';
  const modeDetails = {
    'clinical-simulation': {
      sessionPattern: 'simulation, role-play, debrief, and performance feedback',
      environment: 'clinical or healthcare communication practice setting',
      interactionPattern: 'structured patient, peer, interpreter, and instructor exchanges',
      artifactEnvironment: 'simulation scripts, encounter notes, oral performance, and debrief artifacts',
      riskToMonitor: 'Do not let written artifacts replace observable patient-communication performance evidence.',
      teachingPattern: {
        signaturePractice: 'run a brief patient-simulation or role-play with observable communication evidence',
        evidenceRoutine: 'capture exact phrases, response choices, and patient-safety cues before students revise',
        feedbackRoutine: 'debrief performance with communication, accuracy, safety, and cultural-humility criteria',
        instructorMove: 'pause the simulation to model a safer phrase, then restart the encounter for another attempt',
        studentProduct: 'simulation script, encounter note, oral performance, or debrief reflection',
      },
    },
    'clinical-judgment-simulation': {
      sessionPattern: 'patient case assessment, prioritization, care planning, safety check, and clinical debrief',
      environment: 'nursing, allied-health, or clinical judgment simulation setting',
      interactionPattern:
        'patient-data review, cue recognition, prioritization, care-plan comparison, SBAR handoff, and instructor debrief',
      artifactEnvironment:
        'care plans, nursing diagnoses, patient-assessment notes, SBAR handoffs, medication-safety checks, EHR/charting notes, and intervention rationales',
      riskToMonitor:
        'Do not let clinical courses become generic role-play or reflection; patient-assessment evidence, safety priorities, intervention rationale, and handoff clarity must stay visible.',
      teachingPattern: {
        signaturePractice:
          'work through a patient case by recognizing cues, prioritizing risks, choosing interventions, and defending a care decision',
        evidenceRoutine:
          'collect patient-assessment data, clinical cues, diagnosis or priority, safety risk, intervention rationale, monitoring plan, and SBAR handoff evidence before accepting the care plan',
        feedbackRoutine:
          'debrief clinical judgment with safety, prioritization, rationale, monitoring, and handoff criteria',
        instructorMove:
          'pause the case at a decision point and ask which patient cue, risk, or safety priority changes the next intervention',
        studentProduct:
          'clinical care plan, nursing diagnosis, SBAR handoff, patient-assessment note, medication-safety rationale, or debrief revision',
      },
    },
    'clinical-placement-practicum': {
      sessionPattern:
        'clinical site readiness, preceptor evidence review, supervised practice reflection, competency logging, safety debrief, and placement transfer planning',
      environment: 'supervised clinical placement, practicum, rotation, or allied-health field site',
      interactionPattern:
        'preceptor feedback review, deidentified patient-care evidence, competency-log calibration, scope-of-practice check, site-supervision debrief, and handoff planning',
      artifactEnvironment:
        'clinical hours logs, competency logs, preceptor observation notes, deidentified patient encounter notes, skills checklists, site evaluations, and placement reflection evidence',
      riskToMonitor:
        'Do not flatten clinical placements into classroom simulation; preceptor evidence, deidentified patient-care evidence, confidentiality, scope limits, site expectations, and competency progression must stay visible.',
      teachingPattern: {
        signaturePractice:
          'review supervised clinical placement evidence with preceptor feedback, patient-safety cues, competency targets, and scope-of-practice boundaries before choosing a next placement action',
        evidenceRoutine:
          'collect site expectation, deidentified patient-care evidence, preceptor feedback, competency target, confidentiality check, safety action, and handoff or follow-up plan before accepting the placement artifact',
        feedbackRoutine:
          'debrief placement evidence with patient safety, confidentiality, scope of practice, preceptor feedback, competency progression, and next-shift transfer criteria',
        instructorMove:
          'ask students to separate deidentified site evidence from assumptions, then name which preceptor cue or safety boundary changes the next placement decision',
        studentProduct:
          'clinical hours log, competency log, preceptor-feedback response, deidentified patient encounter note, skills checklist, site evaluation, or clinical placement reflection',
      },
    },
    'studio-lab': {
      sessionPattern: 'studio critique, prototype work, usability evidence, and revision review',
      environment: 'studio, lab, or critique-based design workspace',
      interactionPattern: 'individual making, peer critique, testing, and instructor desk critique',
      artifactEnvironment: 'prototypes, design rationale, critique notes, test evidence, and portfolio artifacts',
      riskToMonitor: 'Do not let generic discussion replace visible artifact critique and iteration evidence.',
      teachingPattern: {
        signaturePractice: 'critique a visible prototype or design artifact, then revise one concrete element',
        evidenceRoutine: 'collect critique notes, usability evidence, and rationale changes before the next iteration',
        feedbackRoutine: 'use desk critique and peer review to name the strongest design move and next revision',
        instructorMove: 'mark up the artifact in front of students and ask what evidence justifies the change',
        studentProduct: 'prototype revision, critique note, design rationale, or portfolio-ready artifact',
      },
    },
    'applied-lab': {
      sessionPattern: 'lab demonstration, guided analysis, hands-on practice, and evidence log review',
      environment: 'lab, data, observation, or field-note analysis setting',
      interactionPattern: 'guided technical practice, evidence comparison, and instructor check-ins',
      artifactEnvironment: 'datasets, instruments, field notes, logs, and analysis artifacts',
      riskToMonitor: 'Do not let procedural completion replace evidence quality and interpretation checks.',
      teachingPattern: {
        signaturePractice: 'run a hands-on analysis or evidence-log check using the lesson data or instrument',
        evidenceRoutine:
          'record the data choice, observation, field note, or instrument decision that supports the claim',
        feedbackRoutine:
          'compare evidence logs for accuracy, method fit, limitation language, and interpretation quality',
        instructorMove:
          'model one technical decision, then ask students to justify the next step with inspectable evidence',
        studentProduct: 'analysis log, instrument revision, field-note excerpt, or evidence-backed interpretation',
      },
    },
    'proof-seminar': {
      sessionPattern:
        'definition check, theorem modeling, guided proof construction, counterexample testing, proof critique, and portfolio handoff',
      environment:
        'proof-based mathematics, logic, real analysis, abstract algebra, topology, or theory seminar setting',
      interactionPattern:
        'definition unpacking, theorem statement analysis, proof strategy comparison, counterexample testing, peer proof critique, and revision defense',
      artifactEnvironment:
        'proof write-ups, theorem annotations, lemma maps, counterexample analyses, proof critiques, formal notation, and revision portfolios',
      riskToMonitor:
        'Do not let proof-based courses become calculation problem sets; definitions, hypotheses, logical implications, counterexamples, and proof revision must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a theorem-to-proof cycle where students parse definitions, choose a proof strategy, justify each implication, test edge cases, and revise the proof',
        evidenceRoutine:
          'collect theorem statement, definitions, hypotheses, proof strategy, justified steps, counterexample or edge-case checks, notation choices, and revision rationale before accepting the proof',
        feedbackRoutine:
          'review definition use, quantifier precision, logical validity, counterexample pressure, notation clarity, and one required proof revision',
        instructorMove:
          'model one proof-strategy decision, then ask students which definition, hypothesis, or counterexample would change the next step',
        studentProduct:
          'theorem proof, lemma proof, counterexample analysis, definition map, proof critique, or proof revision portfolio',
      },
    },
    'engineering-design-lab': {
      sessionPattern:
        'requirements review, engineering model or prototype build, test data collection, failure analysis, redesign review, and verification handoff',
      environment: 'engineering design, fabrication, CAD, mechatronics, robotics, or design-build-test lab setting',
      interactionPattern:
        'constraint review, technical modeling, prototype fabrication, test measurement, failure analysis, peer design review, and verification planning',
      artifactEnvironment:
        'CAD models, schematics, prototype logs, test fixtures, test data, tradeoff matrices, failure analyses, redesign notes, and verification reports',
      riskToMonitor:
        'Do not let engineering design courses become generic ideation or prototype display; requirements, test data, failure analysis, safety, and verification must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a design-build-test cycle where students translate requirements into a prototype, measure performance, diagnose failure, redesign, and verify the requirement',
        evidenceRoutine:
          'collect requirements, constraints, CAD or schematic decisions, test setup, measurement data, failure mode, safety factor, and redesign rationale before accepting the design',
        feedbackRoutine:
          'review requirement fit, test validity, measurement quality, failure diagnosis, safety or tolerance risk, and one required redesign decision',
        instructorMove:
          'model one test or failure-analysis decision, then ask students what measurement evidence would change the design choice',
        studentProduct:
          'engineering prototype, CAD or schematic note, test report, tradeoff matrix, failure analysis, redesign log, or verification memo',
      },
    },
    'statistics-inference': {
      sessionPattern:
        'statistical question framing, assumption check, model demonstration, calculation or software-output interpretation, limitation review, and inference handoff',
      environment: 'statistics, biostatistics, business statistics, or inferential statistics classroom or lab setting',
      interactionPattern:
        'variable identification, sample and assumption checks, guided calculation or software-output review, uncertainty interpretation, peer explanation, and limitation review',
      artifactEnvironment:
        'inference reports, confidence-interval interpretations, hypothesis-test write-ups, assumption checks, p-value explanations, effect-size notes, and statistical memos',
      riskToMonitor:
        'Do not let inferential statistics courses become formula plugging; question, sample, assumptions, uncertainty, interpretation, effect size, and limitation language must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run an inference cycle where students frame the question, identify variables and sample context, check assumptions, compute or inspect output, interpret uncertainty, and revise the inference decision',
        evidenceRoutine:
          'collect research question, variable or parameter, sample context, assumption check, confidence interval or test statistic, p-value or effect size when relevant, interpretation, and limitation before accepting the inference',
        feedbackRoutine:
          'review question fit, assumption validity, calculation or software-output accuracy, uncertainty interpretation, effect size, limitation language, and one required inference revision',
        instructorMove:
          'model one assumption or p-value interpretation decision, then ask students what sample or uncertainty evidence would change the inference',
        studentProduct:
          'statistical inference report, confidence-interval interpretation, hypothesis-test write-up, assumption-check memo, p-value explanation, or regression-inference memo',
      },
    },
    'information-literacy': {
      sessionPattern:
        'research question framing, database search, source evaluation, citation-trail check, synthesis planning, and source-use handoff',
      environment: 'library research, information literacy, academic research skills, or source-evaluation setting',
      interactionPattern:
        'search strategy modeling, database filter use, credibility checks, citation chasing, source comparison, synthesis-matrix revision, and attribution planning',
      artifactEnvironment:
        'research logs, database-search strings, source-evaluation dossiers, annotated bibliographies, citation trails, synthesis matrices, and source-use plans',
      riskToMonitor:
        'Do not let library research courses become generic research-methods summaries; search strategy, source credibility, citation trail, synthesis decisions, and attribution integrity must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a question-to-source cycle where students frame the information need, search databases, evaluate credibility, follow citation trails, and justify a source-use decision',
        evidenceRoutine:
          'collect research question, search string, database or catalog choice, filter decision, source credibility evidence, citation-trail note, synthesis link, and attribution plan before accepting the source set',
        feedbackRoutine:
          'review search fit, source authority, evidence relevance, citation-trail quality, synthesis usefulness, and one required source-use revision',
        instructorMove:
          'model one search refinement or source-evaluation decision, then ask students what source evidence would change their research plan',
        studentProduct:
          'source-evaluation dossier, research log, annotated bibliography, citation-trail map, synthesis matrix, or source-use plan',
      },
    },
    'teacher-preparation': {
      sessionPattern:
        'lesson-study planning, teaching model, microteaching rehearsal, student-work analysis, differentiation planning, and reflection',
      environment:
        'teacher preparation, methods course, curriculum and instruction, or student-teaching seminar setting',
      interactionPattern:
        'learning-target check, standards alignment, instructional modeling, microteaching, formative assessment review, and reteach planning',
      artifactEnvironment:
        'lesson plans, unit plans, teaching demonstrations, student-work samples, formative assessments, classroom-management plans, and reflection notes',
      riskToMonitor:
        'Do not let teaching-methods courses become generic education essays; learning targets, standards, student evidence, differentiation, formative assessment, and reteach decisions must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a lesson-study cycle where teacher candidates align a learning target, rehearse instruction, inspect student evidence, and revise the teaching move',
        evidenceRoutine:
          'collect standards alignment, learning target, student-work evidence, formative-assessment data, differentiation notes, and reteach rationale before accepting the lesson plan',
        feedbackRoutine:
          'give feedback on target-task alignment, student evidence, accessibility, differentiation, classroom feasibility, and one required instructional revision',
        instructorMove:
          'model one teaching move, pause for student-evidence analysis, then ask candidates to revise the next instructional decision',
        studentProduct:
          'lesson plan, unit plan, microteaching demonstration, student-work analysis, formative assessment plan, or reflective teaching portfolio',
      },
    },
    'counseling-practice': {
      sessionPattern:
        'client-scenario intake, helping-skills model, role-play rehearsal, observation coding, ethics and safety review, and referral handoff',
      environment:
        'counseling skills, social-work practice, human-services, school counseling, or helping-profession classroom setting',
      interactionPattern:
        'client scenario analysis, active-listening rehearsal, process observation, case conceptualization, risk/ethics review, supervision feedback, and referral planning',
      artifactEnvironment:
        'intake notes, process recordings, case conceptualizations, helping-skills transcripts, safety plans, service plans, referral notes, and supervision reflections',
      riskToMonitor:
        'Do not let counseling or social-work practice become generic reflection or healthcare role-play; client goals, observable helping skills, ethics, risk, boundaries, supervision feedback, and referral decisions must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a helping-skills cycle where students analyze a client scenario, practice a response, code observable skills, check ethics and risk, and revise the helping decision',
        evidenceRoutine:
          'collect client context, stated concern, observable response language, empathy or reflection evidence, risk/safety cue, boundary or ethics note, supervision feedback, and referral rationale before accepting the case plan',
        feedbackRoutine:
          'give feedback on rapport, active listening, client goal alignment, risk recognition, ethical boundaries, referral fit, and one required helping-response revision',
        instructorMove:
          'model one helping response, pause to code client cues and risk, then ask students which response or referral decision should change',
        studentProduct:
          'intake note, process recording, case conceptualization, helping-skills transcript, safety plan, service plan, referral note, or supervision reflection',
      },
    },
    'accounting-finance-analysis': {
      sessionPattern:
        'source document check, account or statement classification, calculation/model demonstration, interpretation, risk review, and financial decision handoff',
      environment:
        'accounting, corporate finance, managerial accounting, financial statement analysis, or budgeting classroom setting',
      interactionPattern:
        'transaction/source review, account classification, statement linkage, ratio or variance calculation, assumption/control challenge, peer explanation, and financial decision revision',
      artifactEnvironment:
        'journal entries, ledgers, trial balances, statement analyses, ratio memos, cash-flow forecasts, variance reports, valuation models, budget notes, and control reviews',
      riskToMonitor:
        'Do not let accounting or finance courses become generic business cases or arithmetic worksheets; source documents, account treatment, statement effects, calculation traces, controls, assumptions, and decision usefulness must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a source-to-decision cycle where students inspect source documents or statements, classify accounts, calculate ratios or model cash flows, check assumptions or controls, interpret the result, and revise the financial decision',
        evidenceRoutine:
          'collect source transaction or statement line, account classification, journal entry or calculation trace, statement effect, assumption or control check, financial interpretation, and decision consequence before accepting the analysis',
        feedbackRoutine:
          'review classification accuracy, statement linkage, calculation trace, assumption/control validity, variance or ratio interpretation, and one required financial decision revision',
        instructorMove:
          'model one account classification or ratio interpretation decision, then ask students what source, control, or assumption evidence would change the financial conclusion',
        studentProduct:
          'journal-entry worksheet, financial statement analysis, ratio-analysis memo, cash-flow forecast, budget variance report, valuation model, or control-review note',
      },
    },
    'policy-analysis': {
      sessionPattern:
        'problem framing, policy option comparison, stakeholder/equity analysis, feasibility review, implementation-risk check, and policy memo handoff',
      environment:
        'public policy, public administration, public affairs, governance, urban policy, social policy, health policy, education policy, or environmental policy setting',
      interactionPattern:
        'problem definition, evidence appraisal, stakeholder mapping, option comparison, equity and feasibility tradeoff review, implementation planning, and memo revision',
      artifactEnvironment:
        'policy memos, policy briefs, option matrices, stakeholder maps, cost-benefit notes, impact assessments, implementation plans, regulatory analyses, and equity reviews',
      riskToMonitor:
        'Do not let policy courses become generic business recommendations or broad civic reflection; public problem framing, policy authority, stakeholder/equity effects, feasibility, implementation, and evidence limits must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a problem-to-policy cycle where students frame the public problem, compare options, map stakeholders and equity effects, test feasibility, plan implementation, and revise the policy recommendation',
        evidenceRoutine:
          'collect problem definition, affected population, policy authority, evidence source, option comparison, stakeholder/equity effect, feasibility constraint, implementation risk, and decision rationale before accepting the memo',
        feedbackRoutine:
          'review problem fit, evidence credibility, stakeholder representation, equity reasoning, feasibility, implementation risk, and one required policy recommendation revision',
        instructorMove:
          'model one option comparison or stakeholder tradeoff, then ask students what equity, feasibility, or implementation evidence would change the policy decision',
        studentProduct:
          'policy memo, policy brief, option matrix, stakeholder analysis, equity review, implementation plan, impact assessment, or regulatory analysis note',
      },
    },
    'economics-analysis': {
      sessionPattern:
        'economic question framing, model demonstration, comparative statics or calculation, welfare/incentive review, assumption check, and analysis handoff',
      environment:
        'microeconomics, macroeconomics, managerial economics, market analysis, or applied economics classroom setting',
      interactionPattern:
        'market definition, assumption checks, supply-demand or macro-model work, elasticity or surplus calculation, comparative-statics explanation, and economic-decision revision',
      artifactEnvironment:
        'economic analysis briefs, supply-demand diagrams, elasticity notes, surplus or welfare analyses, tax-incidence memos, market-failure reviews, and macro-policy effect explanations',
      riskToMonitor:
        'Do not let economics courses become generic policy reflection or arithmetic worksheets; models, assumptions, incentives, welfare effects, and decision limits must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a model-to-decision cycle where students define the market, state assumptions, trace the model or calculation, interpret incentives and welfare, and revise the economic decision',
        evidenceRoutine:
          'collect market context, actors, assumptions, supply-demand or macro-model evidence, elasticity or surplus calculation, comparative-static effect, welfare or distributional implication, and decision limit before accepting the analysis',
        feedbackRoutine:
          'review model fit, assumption clarity, diagram or calculation accuracy, incentive logic, welfare interpretation, and one required economic-decision revision',
        instructorMove:
          'model one comparative-static or elasticity decision, then ask students what assumption, price signal, or welfare evidence would change the conclusion',
        studentProduct:
          'economic analysis brief, supply-demand diagram, elasticity memo, welfare analysis, tax-incidence note, market-failure review, or macro-policy effect explanation',
      },
    },
    'ethics-argumentation': {
      sessionPattern:
        'ethical issue framing, normative framework modeling, argument mapping, objection/reply testing, case application, and moral-decision handoff',
      environment:
        'ethics, philosophy, bioethics, technology ethics, professional ethics, or applied moral-reasoning classroom setting',
      interactionPattern:
        'dilemma framing, normative-framework comparison, claim-reason argument maps, thought experiments, objection and reply, case pressure, and judgment revision',
      artifactEnvironment:
        'ethical argument briefs, argument maps, dilemma analyses, framework comparison notes, objection/reply memos, thought-experiment responses, and case-application judgments',
      riskToMonitor:
        'Do not let ethics courses become opinion sharing or generic reflection; claims, reasons, normative frameworks, objections, replies, and limits of judgment must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run an argument-to-judgment cycle where students frame the dilemma, apply a normative framework, map reasons, answer objections, test a case variation, and revise the moral decision',
        evidenceRoutine:
          'collect moral issue, affected parties, value conflict, normative framework, claim, reasons, objection, reply, case evidence, and decision limit before accepting the judgment',
        feedbackRoutine:
          'review claim clarity, framework fit, reason support, objection strength, reply quality, stakeholder sensitivity, and one required moral-decision revision',
        instructorMove:
          'model one objection-and-reply move, then ask students what principle, case detail, or stakeholder effect would change the moral decision',
        studentProduct:
          'ethical argument brief, argument map, dilemma analysis, framework comparison note, objection/reply memo, thought-experiment response, or case-application judgment',
      },
    },
    'data-science-lab': {
      sessionPattern:
        'dataset provenance check, notebook analysis, visualization or model build, validation, bias review, and insight handoff',
      environment: 'data science, analytics, machine-learning, notebook, dashboard, or data-story lab setting',
      interactionPattern:
        'dataset inspection, cleaning decisions, notebook walkthroughs, visualization critique, model validation, bias or fairness review, and analytic-decision debrief',
      artifactEnvironment:
        'datasets, notebooks, cleaning logs, visualizations, dashboards, validation metrics, model cards, and data-story artifacts',
      riskToMonitor:
        'Do not let analytics courses become generic coding or chart production; dataset provenance, validation, interpretation, and bias or limitation evidence must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a dataset-to-insight cycle where students inspect data, clean or transform it, build an analysis or model, validate the output, and defend the analytic decision',
        evidenceRoutine:
          'collect dataset provenance, cleaning decisions, notebook outputs, validation metrics, visualization or model evidence, and bias or limitation checks before accepting the insight',
        feedbackRoutine:
          'review data quality, model or visualization fit, interpretation accuracy, validation evidence, bias risk, and one required analytic revision',
        instructorMove:
          'model one data-quality or validation decision, then ask students what evidence would change the analytic conclusion',
        studentProduct:
          'analytics notebook, data-cleaning log, visualization, dashboard, model evaluation, data story, or bias-audit note',
      },
    },
    'programming-lab': {
      sessionPattern: 'environment setup, live coding, implementation practice, test/debug loop, and code review',
      environment: 'programming, computer science, software engineering, notebook, or repository-based lab setting',
      interactionPattern:
        'setup checks, live coding, pair programming, test execution, debugging traces, code review, and commit handoff',
      artifactEnvironment:
        'repositories, scripts, modules, notebooks, test suites, debugging logs, pull requests, and commit notes',
      riskToMonitor:
        'Do not let programming courses become conceptual summaries only; code, tests, debugging evidence, and review decisions must stay inspectable.',
      teachingPattern: {
        signaturePractice:
          'run a test-driven coding cycle where students implement, run tests, debug, review, and commit a working change',
        evidenceRoutine:
          'collect code diffs, failing and passing tests, debugging traces, edge-case checks, and code review notes before accepting the implementation',
        feedbackRoutine:
          'review correctness, readability, tests, edge cases, and refactor opportunities before requiring a revised commit or pull-request note',
        instructorMove:
          'model one failing test or debugging step, then ask students to explain the implementation decision before they revise the code',
        studentProduct: 'code lab, repository commit, notebook, test suite, debugging log, or pull-request note',
      },
    },
    'field-applied': {
      sessionPattern: 'community or field application, stakeholder evidence, and implementation debrief',
      environment: 'community, field, program, or stakeholder-facing setting',
      interactionPattern: 'case discussion, stakeholder analysis, field evidence review, and applied decisions',
      artifactEnvironment: 'field notes, stakeholder maps, implementation memos, and program artifacts',
      riskToMonitor: 'Do not let broad reflection replace locally grounded stakeholder or field evidence.',
      teachingPattern: {
        signaturePractice: 'analyze a stakeholder or field evidence case before making an implementation decision',
        evidenceRoutine:
          'trace whose evidence is represented, whose is missing, and what local constraint changes the decision',
        feedbackRoutine: 'debrief field evidence for equity, feasibility, stakeholder fit, and implementation risk',
        instructorMove: 'ask students to separate observed evidence from assumptions before recommending an action',
        studentProduct: 'stakeholder map, field note, implementation memo, or community-facing recommendation',
      },
    },
    'capstone-project': {
      sessionPattern: 'project milestone review, sponsor constraint check, integration work, and defense rehearsal',
      environment: 'capstone, client-project, or senior-project workspace',
      interactionPattern: 'milestone critique, stakeholder evidence review, integration planning, and defense practice',
      artifactEnvironment:
        'project charters, milestone briefs, implementation plans, portfolios, and showcase artifacts',
      riskToMonitor:
        'Do not let generic project enthusiasm replace sponsor constraints, integration evidence, and defensible milestones.',
      teachingPattern: {
        signaturePractice:
          'run a milestone design review where students connect sponsor constraints, evidence, risks, and next deliverables',
        evidenceRoutine:
          'collect project evidence, decision logs, stakeholder constraints, and integration risks before approving the next milestone',
        feedbackRoutine:
          'use milestone critique to name the strongest project decision, the highest risk, and the next revision commitment',
        instructorMove:
          'ask teams to defend what evidence justifies the milestone decision before moving toward implementation or showcase',
        studentProduct:
          'project charter, milestone brief, implementation plan, portfolio defense, or final showcase artifact',
      },
    },
    'competency-based': {
      sessionPattern: 'competency demonstration, evidence portfolio review, calibration, and reassessment planning',
      environment: 'competency-based, accreditation, or professional-standards course setting',
      interactionPattern:
        'performance evidence review, standards mapping, calibration discussion, coaching, and reassessment planning',
      artifactEnvironment:
        'competency checklists, performance tasks, evidence portfolios, calibration notes, and remediation plans',
      riskToMonitor:
        'Do not let completion checklists replace observable proficiency evidence, calibrated criteria, and reassessment opportunities.',
      teachingPattern: {
        signaturePractice:
          'run a standards-aligned performance review where students connect evidence to proficiency descriptors',
        evidenceRoutine:
          'collect competency evidence, benchmark descriptors, assessor notes, and gaps before making a proficiency decision',
        feedbackRoutine:
          'calibrate evidence against the standard, name the proficiency level, and assign a remediation or extension action',
        instructorMove:
          'ask students to point to the exact evidence that proves readiness before recording proficiency or remediation',
        studentProduct: 'competency checklist, performance task, evidence portfolio, or remediation plan',
      },
    },
    'performing-arts': {
      sessionPattern:
        'physical or vocal readiness, technique modeling, guided rehearsal, critique, performance run, and revision reflection',
      environment: 'acting, theatre, dance, music, or performance-studio setting',
      interactionPattern:
        'warm-up, technique drill, ensemble or scene rehearsal, director or peer notes, performance run-through, and revision reflection',
      artifactEnvironment:
        'monologues, scene work, choreography studies, score excerpts, rehearsal journals, performance recordings, and critique notes',
      riskToMonitor:
        'Do not let performance courses become written reflection only; observable rehearsal evidence, critique uptake, and revised performance choices must stay visible.',
      teachingPattern: {
        signaturePractice:
          'run a rehearsal-to-performance cycle where students prepare, perform, receive notes, revise, and document the next artistic choice',
        evidenceRoutine:
          'collect rehearsal notes, recorded performance evidence, technique observations, ensemble cues, and critique uptake before judging readiness',
        feedbackRoutine:
          'give director, instructor, or peer notes on technique, interpretation, timing, ensemble awareness, and one required performance revision',
        instructorMove:
          'pause the rehearsal to model one technique or interpretive choice, then restart the run so students can apply the note',
        studentProduct:
          'monologue, scene run, choreography phrase, score performance, rehearsal journal, or performance recording',
      },
    },
    'creative-studio': {
      sessionPattern: 'craft demonstration, studio or workshop critique, revision planning, and portfolio reflection',
      environment: 'creative writing, studio arts, performance, or craft-based workshop setting',
      interactionPattern:
        'draft sharing, close observation, critique protocol, craft revision, and portfolio reflection',
      artifactEnvironment:
        'draft manuscripts, creative artifacts, critique notes, process journals, artist statements, and revision portfolios',
      riskToMonitor:
        'Do not let generic reflection replace visible craft choices, critique evidence, revision decisions, and portfolio curation.',
      teachingPattern: {
        signaturePractice: 'run a workshop critique where students name craft choices and revise one visible element',
        evidenceRoutine:
          'collect draft evidence, critique notes, craft vocabulary, and revision intentions before portfolio submission',
        feedbackRoutine:
          'respond to the work through craft criteria, audience effect, peer critique, and a concrete revision plan',
        instructorMove:
          'model one craft reading of the work, then ask what revision would change the audience experience',
        studentProduct: 'creative draft, craft reflection, artist statement, process journal, or revision portfolio',
      },
    },
    'case-method': {
      sessionPattern: 'case preparation, case discussion, decision-board debate, and recommendation debrief',
      environment: 'business, management, strategy, or professional case-method setting',
      interactionPattern:
        'case fact sorting, stakeholder tradeoff analysis, decision-criteria debate, recommendation defense, and implementation-risk review',
      artifactEnvironment:
        'case packets, exhibits, stakeholder maps, tradeoff tables, recommendation memos, and implementation notes',
      riskToMonitor:
        'Do not let case summary replace decision criteria, stakeholder tradeoffs, evidence-supported recommendation, and implementation risk.',
      teachingPattern: {
        signaturePractice:
          'run a case-method decision discussion where students defend a recommendation against case evidence and tradeoffs',
        evidenceRoutine:
          'collect case facts, exhibit evidence, stakeholder priorities, decision criteria, and implementation risks before the recommendation',
        feedbackRoutine:
          'challenge the recommendation with missing evidence, alternative criteria, tradeoff pressure, and a required memo revision',
        instructorMove:
          'ask students what case evidence changes the decision before accepting a strategic recommendation',
        studentProduct: 'case analysis memo, executive recommendation, tradeoff table, or implementation-risk brief',
      },
    },
    'legal-doctrinal': {
      sessionPattern:
        'case briefing, Socratic questioning, rule synthesis, hypothetical application, and memo revision',
      environment: 'law, legal studies, paralegal, policy-law, or doctrine-focused casebook setting',
      interactionPattern:
        'case brief comparison, holding and rationale extraction, rule synthesis, issue spotting, hypothetical application, and doctrinal memo revision',
      artifactEnvironment:
        'case briefs, rule statements, issue-spotting charts, IRAC memos, precedent maps, and hypothetical applications',
      riskToMonitor:
        'Do not let case summary replace the holding, rule, rationale, doctrinal limit, and application to a new fact pattern.',
      teachingPattern: {
        signaturePractice:
          'run a doctrinal case discussion where students extract the rule, test its limits, and apply it to a new hypothetical',
        evidenceRoutine:
          'collect case facts, procedural posture, holding, rationale, rule statement, and distinguishing facts before legal application',
        feedbackRoutine:
          'challenge the rule statement with a counterexample, ambiguous fact, or precedent limit before memo revision',
        instructorMove: 'ask students which fact changes the legal conclusion before accepting the rule application',
        studentProduct: 'case brief, IRAC memo, rule synthesis chart, issue-spotting response, or precedent map',
      },
    },
    'interpretive-humanities': {
      sessionPattern:
        'close reading, contextual framing, evidence challenge, claim revision, and interpretive synthesis',
      environment: 'literature, film, history, art history, media studies, or humanities seminar setting',
      interactionPattern:
        'passage or scene annotation, context check, competing interpretation debate, source-integrity review, and claim revision',
      artifactEnvironment:
        'close-reading memos, passage annotations, scene analyses, context notes, interpretive portfolios, and source-integrity rationales',
      riskToMonitor:
        'Do not let thematic summary replace passage, scene, source, or context evidence that can support an arguable interpretation.',
      teachingPattern: {
        signaturePractice:
          'run a humanities interpretation seminar where students annotate evidence, test competing claims, and revise the interpretive argument',
        evidenceRoutine:
          'collect passage, scene, source, translation, context, or form evidence before students defend an interpretation',
        feedbackRoutine:
          'challenge the claim with a counter-reading, source limit, or context boundary before revision',
        instructorMove:
          'ask which textual, visual, historical, or source detail would change the interpretation before accepting the claim',
        studentProduct:
          'close-reading memo, scene analysis, passage annotation, context note, interpretive portfolio, or source-integrity rationale',
      },
    },
    'lecture-exam': {
      sessionPattern:
        'retrieval warm-up, concise concept model, misconception check, guided exam practice, and transfer debrief',
      environment: 'lecture, survey, general-education, or exam-preparation course setting',
      interactionPattern:
        'retrieval prompts, mini-lecture checkpoints, clicker-style concept checks, worked examples, misconception repair, and exam-blueprint review',
      artifactEnvironment:
        'practice quizzes, concept-check worksheets, exam-blueprint notes, study guides, retrieval logs, and corrected explanations',
      riskToMonitor:
        'Do not let lecture coverage replace retrieval practice, misconception repair, worked examples, and exam-transfer evidence.',
      teachingPattern: {
        signaturePractice:
          'run a retrieval-to-exam practice cycle where students answer, explain, diagnose, and correct a concept-check item',
        evidenceRoutine:
          'collect concept-check answers, confidence ratings, misconception patterns, and corrected explanations before moving to the next concept',
        feedbackRoutine:
          'reteach the weakest misconception with a worked example, then require a corrected explanation or exam-style transfer',
        instructorMove:
          'pause the lecture after the model example and ask which evidence would change an exam answer before revealing the explanation',
        studentProduct:
          'concept-check response, practice quiz correction, exam-blueprint note, retrieval log, or corrected explanation',
      },
    },
    'world-language': {
      sessionPattern:
        'comprehensible input, guided language noticing, interpersonal practice, proficiency feedback, and transfer performance',
      environment: 'world-language, ESL, heritage-language, or communicative language classroom setting',
      interactionPattern:
        'input processing, pronunciation or grammar noticing, paired dialogue, interpretive checks, presentational rehearsal, and cultural comparison',
      artifactEnvironment:
        'dialogues, oral recordings, listening logs, vocabulary notebooks, cultural comparisons, proficiency tasks, and presentational scripts',
      riskToMonitor:
        'Do not let grammar coverage replace actual interpretive, interpersonal, and presentational language-use evidence.',
      teachingPattern: {
        signaturePractice:
          'run a communicative proficiency cycle where students interpret input, rehearse meaning, perform for an audience, and revise language choices',
        evidenceRoutine:
          'collect target-language utterances, comprehension checks, pronunciation or grammar evidence, and cultural-context choices before scoring proficiency',
        feedbackRoutine:
          'give focused feedback on meaning, accuracy, comprehensibility, cultural fit, and one required language-choice revision',
        instructorMove:
          'model the communicative function, ask students to notice the language pattern, then require a revised target-language exchange',
        studentProduct:
          'dialogue, oral recording, interpretive response, presentational script, cultural comparison, or proficiency reflection',
      },
    },
    'online-hybrid': {
      sessionPattern: 'asynchronous preparation, online discussion, applied checkpoint, and feedback follow-up',
      environment: 'online or hybrid course workspace',
      interactionPattern: 'written discussion, self-paced preparation, live or asynchronous feedback, and revision',
      artifactEnvironment: 'discussion posts, LMS submissions, shared documents, and feedback records',
      riskToMonitor: 'Do not assume live facilitation when asynchronous directions, timing, and support are needed.',
      teachingPattern: {
        signaturePractice: 'stage an asynchronous checkpoint before live or written feedback and revision',
        evidenceRoutine:
          'collect timestamped posts, shared-document comments, or LMS submissions that show the reasoning path',
        feedbackRoutine: 'return targeted feedback with a clear revision deadline and an online follow-up prompt',
        instructorMove:
          'seed the discussion with one model response and intervene when posts need evidence or clarification',
        studentProduct: 'discussion post, shared document, LMS checkpoint, or revised online submission',
      },
    },
    'weekly-applied-seminar': {
      sessionPattern: 'weekly seminar, applied practice, discussion, and feedback checkpoint',
      environment: 'seminar or classroom-based applied course',
      interactionPattern: 'guided discussion, peer exchange, instructor modeling, and independent artifact work',
      artifactEnvironment: 'readings, course notes, discussion evidence, and written or presentation artifacts',
      riskToMonitor: 'Do not let weekly topics drift away from assessed evidence and feedback use.',
      teachingPattern: {
        signaturePractice: 'move from guided seminar discussion into a short applied artifact checkpoint',
        evidenceRoutine: 'name the reading, case, or course-note evidence students use before they defend a decision',
        feedbackRoutine: 'use whole-class synthesis and a quick exit ticket to decide what needs revision',
        instructorMove:
          'model the reasoning move, invite a contrasting interpretation, and anchor both in course evidence',
        studentProduct: 'seminar note, short response, presentation sketch, or written artifact checkpoint',
      },
    },
  }[primaryMode];

  return {
    source: 'compiler-inferred-from-course-map',
    primaryMode,
    modalitySignals: {
      clinicalScore,
      capstoneScore,
      competencyScore,
      performingArtsScore,
      creativeScore,
      caseScore,
      legalScore,
      proofScore,
      engineeringScore,
      statisticsInferenceScore,
      informationLiteracyScore,
      teacherPreparationScore,
      counselingPracticeScore,
      accountingFinanceScore,
      policyAnalysisScore,
      economicsAnalysisScore,
      ethicsArgumentScore,
      dataScienceScore,
      programmingScore,
      lectureExamScore,
      worldLanguageScore,
      humanitiesScore,
      studioScore,
      fieldScore,
      labScore,
      onlineSignal: Boolean(hasOnline),
    },
    ...modeDetails,
    participationDesign: [
      `Plan participation around ${modeDetails.interactionPattern}.`,
      'Provide equivalent written, spoken, individual, and paired entry points when possible.',
      'Keep instructor-review notes visible when local setting, tools, or accommodations affect participation.',
    ],
    localReviewNeeds: [
      `Confirm the actual ${modeDetails.environment} and required tools before publishing.`,
      'Confirm whether sessions are synchronous, asynchronous, hybrid, field-based, clinical, studio, or lab-based.',
      'Confirm safety, privacy, accessibility, equipment, room, LMS, or site-specific requirements.',
    ],
    compilerUse: `Compile lesson plans, slides, discussions, assignments, rubrics, quizzes, study guides, and FAQ so they fit a ${primaryMode} course instead of a generic lecture sequence.`,
  };
}

function buildLessonModalityCue(profile = {}, lesson = {}) {
  const mode = profile.primaryMode || 'weekly-applied-seminar';
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  return `${stripLessonPrefix(lesson.title)} should run as ${mode}: students use ${profile.interactionPattern || 'guided practice and feedback'} to produce ${artifact} evidence for ${concept}.`;
}

function lessonRotationIndex(lesson = {}, offset = 0) {
  const lessonNumber = Number(lesson.lessonNumber);
  const lessonIndex = Number(lesson.lessonIndex);
  const base = Number.isFinite(lessonNumber) ? lessonNumber - 1 : Number.isFinite(lessonIndex) ? lessonIndex : 0;
  return Math.abs(base + offset);
}

function rotatedLessonTemplate(templates = [], lesson = {}, offset = 0) {
  if (templates.length === 0) return '';
  return templates[lessonRotationIndex(lesson, offset) % templates.length];
}

function contextualizeModalityRoutine(kind, base, { lesson = {}, concept = '', artifact = '', mode = '' } = {}) {
  const routine = stripTerminalPunctuation(base);
  if (!routine) return '';
  const title = stripLessonPrefix(lesson.title) || `Lesson ${lesson.lessonNumber || 1}`;
  const secondary = alternateLessonConcept(lesson, concept);
  const templates = {
    signaturePractice: [
      `${sentenceCase(routine)} for ${title}, with ${artifact} as the visible product.`,
      `Use the ${mode} pattern to ${routine}, then connect the result to ${title}.`,
      `${title} adapts the course pattern: ${routine}, focused on ${concept}.`,
    ],
    evidenceRoutine: [
      `${sentenceCase(routine)}; in ${title}, the checkout is a visible ${concept} evidence move in ${artifact}.`,
      `For ${title}, ${routine}; students label the ${secondary} detail that makes ${artifact} credible.`,
      `${sentenceCase(routine)} while students show which ${concept} evidence changes the ${artifact} decision.`,
    ],
    feedbackRoutine: [
      `${sentenceCase(routine)}; calibrate feedback against ${concept}, ${secondary}, and ${artifact}.`,
      `For ${title}, ${routine}; the feedback target is the most fragile evidence link in ${artifact}.`,
      `${sentenceCase(routine)} and require one revision that makes ${concept} reasoning inspectable.`,
    ],
    instructorMove: [
      `${sentenceCase(routine)} for ${title}, then ask which ${concept} evidence changes ${artifact}.`,
      `Model the ${title} decision by using the routine to test ${secondary} evidence before students revise ${artifact}.`,
      `${sentenceCase(routine)}; close by having students name the next ${concept} move in ${artifact}.`,
    ],
  };
  return rotatedLessonTemplate(templates[kind] || [`${sentenceCase(routine)} for ${title}.`], lesson, kind.length);
}

function contextualizeModalityProduct(base, { lesson = {}, concept = '', artifact = '' } = {}) {
  const productFamily = stripTerminalPunctuation(base || artifact || 'lesson artifact');
  const artifactName = stripTerminalPunctuation(artifact || productFamily);
  if (!base || normalizeAuditComparable(productFamily).includes(normalizeAuditComparable(artifactName))) {
    return artifactName;
  }
  return `${artifactName} with visible ${concept} evidence (${productFamily})`;
}

function normalizeAuditComparable(value) {
  return cleanText(value).toLowerCase();
}

function buildLessonModalityDecode(profile = {}, lesson = {}) {
  const pattern = profile.teachingPattern || {};
  const mode = profile.primaryMode || 'weekly-applied-seminar';
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || pattern.studentProduct || 'the lesson artifact');
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  return {
    mode,
    signaturePractice:
      contextualizeModalityRoutine('signaturePractice', pattern.signaturePractice, {
        lesson,
        concept,
        artifact,
        mode,
      }) || `run ${stripLessonPrefix(lesson.title)} as applied practice with visible evidence`,
    evidenceRoutine:
      contextualizeModalityRoutine('evidenceRoutine', pattern.evidenceRoutine, { lesson, concept, artifact, mode }) ||
      `collect one inspectable ${concept} evidence move before students finalize ${artifact}`,
    feedbackRoutine:
      contextualizeModalityRoutine('feedbackRoutine', pattern.feedbackRoutine, { lesson, concept, artifact, mode }) ||
      `debrief ${artifact} with criterion-level feedback and one required revision`,
    instructorMove:
      contextualizeModalityRoutine('instructorMove', pattern.instructorMove, { lesson, concept, artifact, mode }) ||
      `model one ${concept} decision, then coach students as they revise ${artifact}`,
    studentProduct: contextualizeModalityProduct(pattern.studentProduct, { lesson, concept, artifact }),
    artifactCheck: `Confirm ${artifact} shows ${concept} through the ${mode} evidence routine, not only topic recall.`,
    localReviewQuestion: `Confirm the local setting supports this ${mode} practice pattern before publishing ${stripLessonPrefix(lesson.title)}.`,
  };
}

function buildArtifactGenreDecode(lesson = {}, profile = {}, modalityDecode = {}) {
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifactText = `${lesson.studentArtifact || ''} ${lesson.title || ''}`.toLowerCase();
  // Outcomes are part of the decode context: genre signals like
  // "target-language vocabulary" live in objective sentences that phrase-based
  // concept extraction may legitimately drop from keyConcepts.
  const contextText =
    `${lesson.title || ''} ${lesson.studentArtifact || ''} ${lesson.activityPattern || ''} ${(lesson.keyConcepts || []).join(' ')} ${(lesson.outcomes || []).join(' ')}`.toLowerCase();
  const artifactMatches = (pattern) => pattern.test(artifactText);
  const contextMatches = (pattern) => pattern.test(contextText);
  let genre = 'applied-artifact';
  if (
    profile.primaryMode === 'lecture-exam' &&
    (artifactMatches(
      /\b(quiz|check|worksheet|test|exam|retrieval|study[-\s]?guide|exam blueprint|corrected explanation|practice item|confidence rating|wrong[-\s]?answer|misconception)\b/,
    ) ||
      contextMatches(
        /\b(quiz|check|worksheet|test|exam|retrieval|study[-\s]?guide|exam blueprint|corrected explanation|practice item|confidence rating|wrong[-\s]?answer|misconception)\b/,
      ))
  ) {
    genre = 'checkpoint-response';
  } else if (
    profile.primaryMode === 'world-language' &&
    (artifactMatches(
      /\b(dialogue|conversation|oral|speaking|listening|pronunciation|vocabulary|grammar|interpersonal|interpretive|presentational|cultural comparison|proficiency task|can[-\s]?do|language portfolio|target[-\s]?language|narration|recording|story)\b/,
    ) ||
      contextMatches(
        /\b(dialogue|conversation|oral proficiency|speaking|listening|pronunciation|vocabulary|grammar|interpersonal|interpretive|presentational|cultural comparison|proficiency task|can[-\s]?do|comprehensible input|target[-\s]?language|narration|recording|story)\b/,
      ))
  ) {
    genre = 'language-performance';
  } else if (
    profile.primaryMode === 'performing-arts' &&
    (artifactMatches(
      /\b(monologue|scene|rehearsal|performance recording|performance journal|run[-\s]?through|choreography|movement phrase|score excerpt|ensemble cue|blocking note|stage picture|vocal performance|instrumental performance|audition|technique drill|director note)\b/,
    ) ||
      contextMatches(
        /\b(monologue|scene study|scene work|rehearsal|performance recording|performance critique|run[-\s]?through|choreography|movement phrase|score study|ensemble cue|blocking|staging|stage picture|vocal warm[-\s]?up|audition|technique drill|director note)\b/,
      ))
  ) {
    genre = 'performance-rehearsal';
  } else if (
    profile.primaryMode === 'capstone-project' &&
    (artifactMatches(
      /\b(capstone|project charter|project milestone|milestone brief|client project|sponsor brief|portfolio defense|final showcase|project portfolio|integration portfolio|proposal defense)\b/,
    ) ||
      artifactMatches(
        /\b(project|charter|milestone|brief|plan|portfolio|showcase|defense|deliverable|roadmap|matrix)\b/,
      ))
  ) {
    genre = 'capstone-project';
  } else if (
    artifactMatches(
      /\b(clinical placement|clinical practicum|clinical rotation|clinical hours|preceptor feedback|preceptor observation|patient encounter log|deidentified patient|competency log|skills checklist|site evaluation|placement reflection|scope of practice|confidentiality check|hipaa|clinical conference)\b/,
    ) ||
    (profile.primaryMode === 'clinical-placement-practicum' &&
      contextMatches(
        /\b(clinical placement|clinical practicum|clinical rotation|clinical hours|clinical site|preceptor|site supervisor|supervised practice|patient encounter|deidentified|competency|skills checklist|site evaluation|confidentiality|hipaa|scope of practice|patient safety|handoff)\b/,
      ))
  ) {
    genre = 'clinical-placement-evidence';
  } else if (
    artifactMatches(
      /\b(competency|proficiency|accreditation|standards[-\s]?aligned|program standard|performance task|evidence portfolio|mastery demonstration|benchmark|calibration note|remediation plan|competency checklist)\b/,
    ) ||
    (profile.primaryMode === 'competency-based' &&
      artifactMatches(
        /\b(evidence|portfolio|task|checklist|demonstration|standard|benchmark|proficiency|remediation)\b/,
      ))
  ) {
    genre = 'competency-evidence';
  } else if (
    artifactMatches(
      /\b(creative writing|poetry workshop|fiction workshop|writing workshop|screenwriting workshop|playwriting workshop|scene draft|poem draft|fiction draft|short story draft|screenplay draft|manuscript|craft essay|workshop critique|revision portfolio|artist statement|process journal|creative draft|line[-\s]?level revision)\b/,
    ) ||
    (profile.primaryMode === 'creative-studio' &&
      artifactMatches(/\b(draft|portfolio|workshop|critique|craft|revision|artist statement|journal|manuscript)\b/))
  ) {
    genre = 'creative-portfolio';
  } else if (
    artifactMatches(
      /\b(financial statement analysis|ratio analysis memo|cash[-\s]?flow forecast|cash[-\s]?flow statement analysis|journal entr(?:y|ies) worksheet|trial balance review|ledger reconciliation|budget variance report|variance analysis report|valuation model|npv analysis|discounted cash[-\s]?flow|cost[-\s]?volume[-\s]?profit analysis|break[-\s]?even analysis|control review note)\b/,
    ) ||
    (profile.primaryMode === 'accounting-finance-analysis' &&
      (artifactMatches(
        /\b(balance sheet|income statement|cash[-\s]?flow|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|ratio|financial ratio|budget variance|variance analysis|contribution margin|break[-\s]?even|net present value|npv|valuation|working capital|internal control|audit trail)\b/,
      ) ||
        contextMatches(
          /\b(balance sheet|income statement|cash[-\s]?flow|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|ratio|financial ratio|budget variance|variance analysis|contribution margin|break[-\s]?even|net present value|npv|valuation|working capital|internal control|audit trail)\b/,
        )))
  ) {
    genre = 'financial-analysis-report';
  } else if (
    artifactMatches(
      /\b(ethical argument brief|moral argument brief|ethics argument memo|argument map|argument mapping|dilemma analysis|normative framework comparison|objection reply memo|objection\/reply memo|thought experiment response|case application judgment|moral reasoning portfolio|ethical judgment memo)\b/,
    ) ||
    (profile.primaryMode === 'ethics-argumentation' &&
      (artifactMatches(
        /\b(ethic|ethical|moral|argument|claim|reason|normative|framework|utilitarian|deontolog|virtue ethics|care ethics|rights|justice|dilemma|thought experiment|objection|counterargument|reply|principle|judgment|case application)\b/,
      ) ||
        contextMatches(
          /\b(ethic|ethical|moral|argument|claim|reason|normative|framework|utilitarian|deontolog|virtue ethics|care ethics|rights|justice|dilemma|thought experiment|objection|counterargument|reply|principle|judgment|case application)\b/,
        )))
  ) {
    genre = 'ethical-argument-brief';
  } else if (
    artifactMatches(
      /\b(economic analysis brief|economic decision brief|market analysis memo|elasticity memo|supply[-\s]?demand analysis|supply and demand analysis|consumer surplus analysis|producer surplus analysis|welfare analysis|deadweight loss analysis|externality analysis|market failure analysis|tax incidence note|comparative statics memo|price ceiling analysis|price floor analysis|macro policy effect explanation)\b/,
    ) ||
    (profile.primaryMode === 'economics-analysis' &&
      (artifactMatches(
        /\b(economic|economics|market|supply|demand|elasticity|equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare|incentive|scarcity|monopoly|perfect competition|gdp|inflation|unemployment|monetary|fiscal)\b/,
      ) ||
        contextMatches(
          /\b(economic|economics|market|supply|demand|elasticity|equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare|incentive|scarcity|monopoly|perfect competition|gdp|inflation|unemployment|monetary|fiscal)\b/,
        )))
  ) {
    genre = 'economic-analysis-brief';
  } else if (
    artifactMatches(
      /\b(policy memo|policy brief|policy option matrix|policy option|stakeholder policy analysis|equity policy analysis|policy implementation plan|policy cost[-\s]?benefit analysis|policy impact assessment|regulatory analysis|public value memo|administrative burden review)\b/,
    ) ||
    (profile.primaryMode === 'policy-analysis' &&
      (artifactMatches(
        /\b(policy|memo|brief|option|stakeholder|equity|feasibility|implementation|cost[-\s]?benefit|impact|regulatory|public value|administrative burden|trade[-\s]?off)\b/,
      ) ||
        contextMatches(
          /\b(policy|memo|brief|option|stakeholder|equity|feasibility|implementation|cost[-\s]?benefit|impact|regulatory|public value|administrative burden|trade[-\s]?off)\b/,
        )))
  ) {
    genre = 'policy-brief';
  } else if (
    hasCaseMethodEvidence(artifactText) ||
    (profile.primaryMode === 'case-method' &&
      artifactMatches(/\b(case|memo|brief|recommendation|tradeoff|criteria|stakeholder|implementation|exhibit)\b/))
  ) {
    genre = 'case-analysis';
  } else if (
    hasLegalDoctrinalEvidence(artifactText) ||
    (profile.primaryMode === 'legal-doctrinal' &&
      artifactMatches(/\b(case|brief|memo|rule|issue|irac|precedent|hypothetical|holding|application)\b/))
  ) {
    genre = 'legal-analysis';
  } else if (
    artifactMatches(
      /\b(proof portfolio|proof write[-\s]?up|theorem proof|lemma proof|counterexample analysis|definition map|induction proof|contradiction proof|epsilon[-\s]?delta proof|formal proof|proof critique|proof revision)\b/,
    ) ||
    (profile.primaryMode === 'proof-seminar' &&
      (artifactMatches(
        /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof|quantifier|induction|contradiction|epsilon[-\s]?delta|logical implication|formal notation|proof strategy|proof revision)\b/,
      ) ||
        contextMatches(
          /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof|quantifier|induction|contradiction|epsilon[-\s]?delta|logical implication|formal notation|proof strategy|proof revision)\b/,
        )))
  ) {
    genre = 'proof-portfolio';
  } else if (
    (profile.primaryMode !== 'engineering-design-lab' &&
      artifactMatches(
        /\b(prototype|wireframe|design system|design-system|design artifact|design brief|portfolio rationale|journey map|usability|accessibility audit|inclusive interaction|design decision|screen|component)\b/,
      )) ||
    (profile.primaryMode === 'studio-lab' &&
      (artifactMatches(
        /\b(design|prototype|wireframe|journey map|usability|accessibility|inclusive interaction|critique|revision plan|rationale|artifact|portfolio|decision|recommendation|memo|brief)\b/,
      ) ||
        contextMatches(
          /\b(design|prototype|wireframe|journey map|usability|accessibility|inclusive interaction|critique|revision|rationale|artifact|portfolio|studio)\b/,
        )))
  ) {
    genre = 'design-prototype';
  } else if (
    artifactMatches(
      /\b(engineering prototype|prototype test|bench test|load test|stress test|test fixture|design verification|cad model|schematic|fabrication log|tolerance check|safety factor)\b/,
    ) ||
    (profile.primaryMode === 'engineering-design-lab' &&
      (artifactMatches(
        /\b(requirement|requirements|constraint|constraints|specification|tolerance|prototype|test data|test report|measurement|failure|failure analysis|redesign|redesign log|verification|verification report|trade[-\s]?off|cad|schematic|fabrication|safety factor|test fixture)\b/,
      ) ||
        contextMatches(
          /\b(requirement|requirements|constraint|constraints|specification|tolerance|prototype|test data|test report|measurement|failure|failure analysis|redesign|redesign log|verification|verification report|trade[-\s]?off|cad|schematic|fabrication|safety factor|test fixture)\b/,
        )))
  ) {
    genre = 'engineering-design-test';
  } else if (
    artifactMatches(
      /\b(statistical inference report|inference question memo|statistical question memo|hypothesis test write[-\s]?up|hypothesis-test write[-\s]?up|confidence interval interpretation|p[-\s]?value explanation|assumption check memo|test statistic report|effect size interpretation|regression inference memo|chi[-\s]?square (?:report|inference memo|test memo)|categorical association memo|t[-\s]?test report)\b/,
    ) ||
    (profile.primaryMode === 'statistics-inference' &&
      (artifactMatches(
        /\b(statistical question|inference question|inference claim|sample context|sample|population|variable|parameter|confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|test statistic|standard error|margin of error|assumption|effect size|statistical significance|sampling distribution|inference decision|regression inference|chi[-\s]?square|categorical variable|expected count|contingency table|association|independence)\b/,
      ) ||
        contextMatches(
          /\b(statistical question|inference question|inference claim|sample context|sample|population|variable|parameter|confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|test statistic|standard error|margin of error|assumption|effect size|statistical significance|sampling distribution|inference decision|regression inference|chi[-\s]?square|categorical variable|expected count|contingency table|association|independence)\b/,
        )))
  ) {
    genre = 'statistical-inference-report';
  } else if (
    artifactMatches(
      /\b(source[-\s]?evaluation dossier|source evaluation dossier|research log|database search log|search strategy log|citation[-\s]?trail map|source-use plan|credibility review)\b/,
    ) ||
    (profile.primaryMode === 'information-literacy' &&
      (artifactMatches(
        /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|authority|peer[-\s]?reviewed|scholarly|citation|bibliography|synthesis|research log|source-use)\b/,
      ) ||
        contextMatches(
          /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|authority|peer[-\s]?reviewed|scholarly|citation|bibliography|synthesis|research log|source-use)\b/,
        )))
  ) {
    genre = 'source-evaluation-dossier';
  } else if (
    artifactMatches(
      /\b(teaching plan portfolio|lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|learning target|standards alignment|differentiation plan|formative assessment plan|student work analysis|classroom management plan|reteach plan|instructional sequence|lesson study|edTPA)\b/,
    ) ||
    (profile.primaryMode === 'teacher-preparation' &&
      (artifactMatches(
        /\b(lesson|unit|microteaching|teaching|instruction|learning target|standard|differentiation|formative assessment|student work|classroom management|reteach|scaffold|family communication)\b/,
      ) ||
        contextMatches(
          /\b(lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|learning target|standards alignment|differentiation|formative assessment|student work analysis|classroom management|instructional strategy|assessment plan|scaffolding|reteach plan)\b/,
        )))
  ) {
    genre = 'teaching-plan-portfolio';
  } else if (
    profile.primaryMode === 'counseling-practice' &&
    (artifactMatches(
      /\b(case conceptualization|case formulation|intake note|process recording|session note|helping-skills transcript|helping skills transcript|active-listening transcript|reflective listening note|motivational interviewing plan|safety plan|risk assessment|service plan|referral note|supervision reflection|client goal plan|biopsychosocial assessment)\b/,
    ) ||
      artifactMatches(
        /\b(client|intake|case|counseling|counselling|helping|listening|reflection|oars|risk|safety|referral|service plan|treatment plan|process recording|supervision)\b/,
      ) ||
      contextMatches(
        /\b(client|intake|case conceptualization|case formulation|helping skill|active listening|reflective listening|motivational interviewing|risk assessment|safety plan|referral|service plan|process recording|supervision note)\b/,
      ))
  ) {
    genre = 'case-conceptualization';
  } else if (
    artifactMatches(
      /\b(data science notebook|analytics notebook|jupyter notebook|model evaluation|validation report|bias audit|fairness audit|confusion matrix|predictive model|model card)\b/,
    ) ||
    (profile.primaryMode === 'data-science-lab' &&
      (artifactMatches(
        /\b(dataset|data set|dataframe|csv|notebook|visualization|dashboard|model|metric|validation|train[-\s]?test|cross[-\s]?validation|bias|fairness|feature|prediction|classification|regression|data story)\b/,
      ) ||
        contextMatches(
          /\b(dataset|data set|dataframe|csv|notebook|visualization|dashboard|model|metric|validation|train[-\s]?test|cross[-\s]?validation|bias|fairness|feature|prediction|classification|regression|data story)\b/,
        )))
  ) {
    genre = 'data-science-notebook';
  } else if (
    artifactMatches(
      /\b(code lab|programming lab|software project|repository commit|pull request|unit test|test suite|debugging log|refactor plan|implementation trace|code review)\b/,
    ) ||
    (profile.primaryMode === 'programming-lab' &&
      (artifactMatches(
        /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/,
      ) ||
        contextMatches(
          /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/,
        )))
  ) {
    genre = 'code-lab';
  } else if (
    artifactMatches(
      /\b(lab report|lab notebook|lab safety|laboratory|specimen|microscopy|serial dilution|dilution|enzyme assay|assay|pipette|pipetting|aseptic|contamination|variable[-\s]?control|safety observation)\b/,
    )
  ) {
    genre = 'lab-report';
  } else if (
    artifactMatches(
      /\b(problem[-\s]?set|worked solution|solution set|solution rationale|calculation|equation|formula|derivation|proof|graphing|optimization|quantitative exercise|homework set|practice problems)\b/,
    )
  ) {
    genre = 'problem-set';
  } else if (
    profile.primaryMode === 'interpretive-humanities' &&
    (artifactMatches(
      /\b(close[-\s]?reading|context annotation|translation comparison|narrative voice|genre convention|poetic form|critical lens|archive note|adaptation comparison|reception annotation|comparative passage|scholarly conversation|interpretive portfolio|public[-\s]?facing rationale|scene analysis|visual analysis|primary source|source[-\s]?integrity|passage|annotation|memo|portfolio|rationale)\b/,
    ) ||
      contextMatches(
        /\b(close[-\s]?reading|interpretive claim|interpretive argument|passage evidence|textual evidence|translation choice|critical lens|genre convention|scene analysis|visual analysis|primary source analysis|historiography|archive note|reception context|source integrity)\b/,
      ))
  ) {
    genre = 'close-reading-analysis';
  } else if (
    artifactMatches(
      /\b(clinical care plan|care plan|nursing diagnosis|sbar|patient handoff|handoff note|patient assessment|assessment data|clinical judgment map|concept map|intervention plan|medication safety|medication administration|monitoring plan|ehr note|charting note|clinical decision rationale)\b/,
    ) ||
    (profile.primaryMode === 'clinical-judgment-simulation' &&
      contextMatches(
        /\b(patient|clinical|nursing|care plan|nursing diagnosis|sbar|handoff|assessment data|intervention|prioritization|priority|medication|safety|monitoring|charting|ehr|deterioration|clinical cue)\b/,
      ))
  ) {
    genre = 'clinical-care-plan';
  } else if (artifactMatches(/\b(memo|brief|recommendation|rationale)\b/)) {
    genre = 'memo-brief';
  } else if (
    profile.primaryMode === 'information-literacy' &&
    artifactMatches(
      /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|peer[-\s]?reviewed|citation|bibliography|synthesis|research log|source-use)\b/,
    )
  ) {
    genre = 'source-evaluation-dossier';
  } else if (artifactMatches(/\b(literature|matrix|source|annotated bibliography|gap statement)\b/)) {
    genre = 'literature-synthesis';
  } else if (
    artifactMatches(/\b(dataset|data set|data|statistics|analysis|coding|log|instrument|survey|observation)\b/)
  ) {
    genre = 'analysis-log';
  } else if (artifactMatches(/\b(field note|field|stakeholder|community|implementation|program|placement)\b/)) {
    genre = 'field-evidence';
  } else if (artifactMatches(/\b(presentation|slide|pitch)\b/)) {
    genre = 'presentation';
  } else if (
    artifactMatches(
      /\b(role[-\s]?play|simulation|interview|oral|encounter|dialogue|performance|scenario|teach[-\s]?back)\b/,
    ) ||
    (profile.primaryMode === 'clinical-simulation' && artifactMatches(/\b(script|conversation|instruction)\b/))
  ) {
    genre = 'performance-simulation';
  } else if (artifactMatches(/\b(quiz|check|worksheet|test|exam)\b/)) {
    genre = 'checkpoint-response';
  } else if (artifactMatches(/\b(reflection|discussion|post|journal)\b/)) {
    genre = 'reflection-response';
  } else if (contextMatches(/\b(memo|brief|recommendation|rationale)\b/)) {
    genre = 'memo-brief';
  } else if (
    profile.primaryMode === 'capstone-project' &&
    contextMatches(
      /\b(capstone|project charter|project milestone|milestone brief|client project|sponsor brief|portfolio defense|final showcase|project portfolio|integration portfolio|proposal defense)\b/,
    )
  ) {
    genre = 'capstone-project';
  } else if (
    contextMatches(
      /\b(competency|proficiency|accreditation|standards[-\s]?aligned|program standard|performance task|evidence portfolio|mastery demonstration|benchmark|calibration note|remediation plan|competency checklist)\b/,
    )
  ) {
    genre = 'competency-evidence';
  } else if (
    contextMatches(
      /\b(creative writing|poem|poetry|fiction|short story|screenplay|scene draft|playwriting|manuscript|craft essay|workshop critique|revision portfolio|artist statement|process journal|creative draft)\b/,
    )
  ) {
    genre = 'creative-portfolio';
  } else if (
    contextMatches(
      /\b(financial statement analysis|ratio analysis memo|cash[-\s]?flow forecast|cash[-\s]?flow statement analysis|journal entr(?:y|ies) worksheet|trial balance review|ledger reconciliation|budget variance report|variance analysis report|valuation model|npv analysis|discounted cash[-\s]?flow|cost[-\s]?volume[-\s]?profit analysis|break[-\s]?even analysis|control review note)\b/,
    ) ||
    (profile.primaryMode === 'accounting-finance-analysis' &&
      contextMatches(
        /\b(balance sheet|income statement|cash[-\s]?flow|journal entr(?:y|ies)|debit|credit|ledger|trial balance|adjusting entr(?:y|ies)|ratio|financial ratio|budget variance|variance analysis|contribution margin|break[-\s]?even|net present value|npv|valuation|working capital|internal control|audit trail)\b/,
      ))
  ) {
    genre = 'financial-analysis-report';
  } else if (
    contextMatches(
      /\b(ethical argument brief|moral argument brief|ethics argument memo|argument map|argument mapping|dilemma analysis|normative framework comparison|objection reply memo|objection\/reply memo|thought experiment response|case application judgment|moral reasoning portfolio|ethical judgment memo)\b/,
    ) ||
    (profile.primaryMode === 'ethics-argumentation' &&
      contextMatches(
        /\b(ethic|ethical|moral|argument|claim|reason|normative|framework|utilitarian|deontolog|virtue ethics|care ethics|rights|justice|dilemma|thought experiment|objection|counterargument|reply|principle|judgment|case application)\b/,
      ))
  ) {
    genre = 'ethical-argument-brief';
  } else if (
    contextMatches(
      /\b(economic analysis brief|economic decision brief|market analysis memo|elasticity memo|supply[-\s]?demand analysis|supply and demand analysis|consumer surplus analysis|producer surplus analysis|welfare analysis|deadweight loss analysis|externality analysis|market failure analysis|tax incidence note|comparative statics memo|price ceiling analysis|price floor analysis|macro policy effect explanation)\b/,
    ) ||
    (profile.primaryMode === 'economics-analysis' &&
      contextMatches(
        /\b(economic|economics|market|supply|demand|elasticity|equilibrium|consumer surplus|producer surplus|deadweight loss|externality|market failure|marginal cost|marginal benefit|opportunity cost|comparative statics|tax incidence|price ceiling|price floor|welfare|incentive|scarcity|monopoly|perfect competition|gdp|inflation|unemployment|monetary|fiscal)\b/,
      ))
  ) {
    genre = 'economic-analysis-brief';
  } else if (
    contextMatches(
      /\b(policy memo|policy brief|policy option matrix|policy option|stakeholder policy analysis|equity policy analysis|policy implementation plan|policy cost[-\s]?benefit analysis|policy impact assessment|regulatory analysis|public value memo|administrative burden review)\b/,
    ) ||
    (profile.primaryMode === 'policy-analysis' &&
      contextMatches(
        /\b(policy|memo|brief|option|stakeholder|equity|feasibility|implementation|cost[-\s]?benefit|impact|regulatory|public value|administrative burden|trade[-\s]?off)\b/,
      ))
  ) {
    genre = 'policy-brief';
  } else if (hasCaseMethodEvidence(contextText)) {
    genre = 'case-analysis';
  } else if (hasLegalDoctrinalEvidence(contextText)) {
    genre = 'legal-analysis';
  } else if (
    contextMatches(
      /\b(proof portfolio|proof write[-\s]?up|theorem proof|lemma proof|counterexample analysis|definition map|induction proof|contradiction proof|epsilon[-\s]?delta proof|formal proof|proof critique|proof revision)\b/,
    ) ||
    (profile.primaryMode === 'proof-seminar' &&
      contextMatches(
        /\b(theorem|lemma|definition|hypothesis|axiom|conjecture|counterexample|proof|quantifier|induction|contradiction|epsilon[-\s]?delta|logical implication|formal notation|proof strategy|proof revision)\b/,
      ))
  ) {
    genre = 'proof-portfolio';
  } else if (hasInterpretiveHumanitiesEvidence(contextText)) {
    genre = 'close-reading-analysis';
  } else if (
    profile.primaryMode !== 'engineering-design-lab' &&
    contextMatches(
      /\b(prototype|wireframe|design system|portfolio rationale|journey map|usability|accessibility audit|inclusive interaction|design decision)\b/,
    )
  ) {
    genre = 'design-prototype';
  } else if (
    contextMatches(
      /\b(engineering prototype|prototype test|bench test|load test|stress test|test fixture|design verification|cad model|schematic|fabrication log|tolerance check|safety factor)\b/,
    ) ||
    (profile.primaryMode === 'engineering-design-lab' &&
      contextMatches(
        /\b(requirement|requirements|constraint|constraints|specification|tolerance|prototype|test data|test report|measurement|failure|failure analysis|redesign|redesign log|verification|verification report|trade[-\s]?off|cad|schematic|fabrication|safety factor|test fixture)\b/,
      ))
  ) {
    genre = 'engineering-design-test';
  } else if (
    contextMatches(
      /\b(statistical inference report|inference question memo|statistical question memo|hypothesis test write[-\s]?up|hypothesis-test write[-\s]?up|confidence interval interpretation|p[-\s]?value explanation|assumption check memo|test statistic report|effect size interpretation|regression inference memo|chi[-\s]?square (?:report|inference memo|test memo)|categorical association memo|t[-\s]?test report)\b/,
    ) ||
    (profile.primaryMode === 'statistics-inference' &&
      contextMatches(
        /\b(statistical question|inference question|inference claim|sample context|sample|population|variable|parameter|confidence interval|hypothesis test|hypothesis testing|null hypothesis|alternative hypothesis|p[-\s]?value|test statistic|standard error|margin of error|assumption|effect size|statistical significance|sampling distribution|inference decision|regression inference|chi[-\s]?square|categorical variable|expected count|contingency table|association|independence)\b/,
      ))
  ) {
    genre = 'statistical-inference-report';
  } else if (
    contextMatches(
      /\b(source[-\s]?evaluation dossier|source evaluation dossier|research log|database search log|search strategy log|citation[-\s]?trail map|source-use plan|credibility review)\b/,
    ) ||
    (profile.primaryMode === 'information-literacy' &&
      contextMatches(
        /\b(source|sources|database|search|keyword|controlled vocabulary|credibility|authority|peer[-\s]?reviewed|scholarly|citation|bibliography|synthesis|research log|source-use)\b/,
      ))
  ) {
    genre = 'source-evaluation-dossier';
  } else if (
    contextMatches(
      /\b(teaching plan portfolio|lesson plan|unit plan|microteaching|micro-teaching|teaching demonstration|learning target|standards alignment|differentiation plan|formative assessment plan|student work analysis|classroom management plan|reteach plan|instructional sequence|lesson study|edTPA)\b/,
    ) ||
    (profile.primaryMode === 'teacher-preparation' &&
      contextMatches(
        /\b(lesson|unit|microteaching|teaching|instruction|learning target|standard|differentiation|formative assessment|student work|classroom management|reteach|scaffold|family communication)\b/,
      ))
  ) {
    genre = 'teaching-plan-portfolio';
  } else if (
    profile.primaryMode === 'counseling-practice' &&
    (contextMatches(
      /\b(case conceptualization|case formulation|intake note|process recording|session note|helping-skills transcript|helping skills transcript|active-listening transcript|reflective listening note|motivational interviewing plan|safety plan|risk assessment|service plan|referral note|supervision reflection|client goal plan|biopsychosocial assessment)\b/,
    ) ||
      contextMatches(
        /\b(client|intake|case|counseling|counselling|helping|listening|reflection|oars|risk|safety|referral|service plan|treatment plan|process recording|supervision)\b/,
      ))
  ) {
    genre = 'case-conceptualization';
  } else if (
    contextMatches(
      /\b(data science notebook|analytics notebook|jupyter notebook|model evaluation|validation report|bias audit|fairness audit|confusion matrix|predictive model|model card)\b/,
    ) ||
    (profile.primaryMode === 'data-science-lab' &&
      contextMatches(
        /\b(dataset|data set|dataframe|csv|notebook|visualization|dashboard|model|metric|validation|train[-\s]?test|cross[-\s]?validation|bias|fairness|feature|prediction|classification|regression|data story)\b/,
      ))
  ) {
    genre = 'data-science-notebook';
  } else if (
    contextMatches(
      /\b(code lab|programming lab|software project|repository commit|pull request|unit test|test suite|debugging log|refactor plan|implementation trace|code review)\b/,
    ) ||
    (profile.primaryMode === 'programming-lab' &&
      contextMatches(
        /\b(code|coding|debug|debugging|unit test|test suite|automated test|repository|repo|git|commit|pull request|code review|implementation|algorithm|function|module|script|notebook|refactor|edge case)\b/,
      ))
  ) {
    genre = 'code-lab';
  } else if (
    contextMatches(
      /\b(problem[-\s]?set|worked solution|solution set|calculation|equation|formula|derivation|proof|graphing|optimization|quantitative exercise|homework set|practice problems)\b/,
    )
  ) {
    genre = 'problem-set';
  } else if (contextMatches(/\b(dataset|data set|statistics|analysis|coding|instrument|survey|observation)\b/)) {
    genre = 'analysis-log';
  } else if (contextMatches(/\b(role[-\s]?play|simulation|interview|oral|encounter|dialogue|performance)\b/)) {
    genre = 'performance-simulation';
  }

  const details = {
    'clinical-placement-evidence': {
      outputFormat:
        'clinical hours log, competency log, preceptor-feedback response, deidentified patient encounter note, skills checklist, site evaluation, or clinical placement reflection',
      evidenceRequirement:
        'site expectation, deidentified patient-care evidence, preceptor or site-supervisor feedback, competency target, confidentiality check, patient-safety action, scope-of-practice boundary, and next placement decision',
      qualityFocus:
        'patient safety, confidentiality, scope awareness, supervised practice evidence, preceptor-feedback uptake, competency progression, and handoff usefulness',
      reviewProtocol:
        'confirm deidentification and confidentiality, trace the site evidence, compare the competency target to preceptor feedback, inspect patient-safety and scope boundaries, and require a next-shift action or handoff revision',
      commonFailure:
        'students submit broad clinical reflections without deidentified site evidence, preceptor feedback, competency targets, patient-safety reasoning, or scope-of-practice boundaries',
    },
    'clinical-care-plan': {
      outputFormat:
        'clinical care plan, nursing diagnosis, patient-assessment note, SBAR handoff, medication-safety rationale, EHR/charting note, or clinical judgment map',
      evidenceRequirement:
        'patient-assessment data, relevant clinical cue, priority or nursing diagnosis, safety risk, intervention rationale, monitoring plan, escalation cue, and handoff evidence',
      qualityFocus:
        'cue recognition, prioritization, patient safety, intervention fit, rationale quality, monitoring clarity, and handoff usefulness',
      reviewProtocol:
        'trace the patient assessment data, verify the priority or nursing diagnosis, inspect safety and medication risks, test the intervention rationale, and require a revised monitoring or SBAR handoff decision',
      commonFailure:
        'students list interventions or generic reflections without tying them to patient cues, safety priorities, monitoring evidence, or handoff clarity',
    },
    'performance-simulation': {
      outputFormat: 'observable performance plus brief debrief note',
      evidenceRequirement: 'exact phrase choices, response moves, safety or accuracy cues, and debrief evidence',
      qualityFocus: 'communication accuracy, responsiveness, professionalism, and recovery after feedback',
      reviewProtocol:
        'observe or review the performance, mark evidence against the rubric, then require one coached reattempt or debrief revision',
      commonFailure: 'students submit polished notes without showing observable performance evidence',
    },
    'design-prototype': {
      outputFormat: 'prototype or design artifact plus rationale and revision trace',
      evidenceRequirement: 'visible design change, critique note, user/usability evidence, and rationale',
      qualityFocus: 'artifact specificity, usability evidence, design reasoning, and iteration quality',
      reviewProtocol:
        'compare the before/after artifact, inspect critique evidence, and require one named next iteration',
      commonFailure: 'students describe design intentions without changing or testing the artifact',
    },
    'analysis-log': {
      outputFormat: 'analysis log, worksheet, dataset note, or instrument revision',
      evidenceRequirement:
        'data choice, method decision, observation, calculation, or instrument change tied to the claim',
      qualityFocus: 'method fit, evidence traceability, limitation language, and interpretation accuracy',
      reviewProtocol:
        'trace the evidence step-by-step, verify the method choice, and ask for one limitation or correction',
      commonFailure: 'students complete procedures without explaining why the evidence supports the conclusion',
    },
    'engineering-design-test': {
      outputFormat:
        'engineering prototype, CAD or schematic note, test report, tradeoff matrix, failure analysis, redesign log, verification memo, or fabrication record',
      evidenceRequirement:
        'design requirement, constraint or tolerance, prototype or model decision, test setup, measurement data, failure or margin analysis, safety consideration, and redesign rationale',
      qualityFocus:
        'requirement fit, technical reasoning, test validity, measurement quality, failure diagnosis, safety or tolerance risk, tradeoff reasoning, and verification readiness',
      reviewProtocol:
        'compare the prototype or model to the requirement, inspect the test setup and measurement data, diagnose one failure mode or margin, check safety or tolerance risk, and require a redesign or verification decision',
      commonFailure:
        'students display a prototype without proving which requirement it meets, how it was tested, what failed, or why the redesign is justified',
    },
    'financial-analysis-report': {
      outputFormat:
        'journal-entry worksheet, ledger or trial-balance review, financial statement analysis, ratio-analysis memo, cash-flow forecast, budget variance report, cost-volume-profit analysis, valuation model, or control-review note',
      evidenceRequirement:
        'source transaction or statement line, account classification, calculation or model trace, statement or cash-flow effect, assumption or control check, interpretation, and decision consequence',
      qualityFocus:
        'source-document fit, account classification, statement linkage, calculation accuracy, assumption or control validity, ratio or variance interpretation, and decision usefulness',
      reviewProtocol:
        'trace the source document or statement line, verify the account classification and calculation, check the statement or cash-flow effect, inspect the assumption or control, and require a financial interpretation tied to the decision',
      commonFailure:
        'students submit calculations, entries, or ratios without source evidence, statement linkage, assumption/control checks, or decision interpretation',
    },
    'economic-analysis-brief': {
      outputFormat:
        'economic analysis brief, supply-demand diagram, elasticity memo, welfare analysis, tax-incidence note, market-failure review, comparative-statics explanation, or macro-policy effect note',
      evidenceRequirement:
        'market context, actors, assumptions, model or diagram evidence, calculation trace when relevant, incentive or welfare effect, comparative-static or policy effect, limitation, and economic decision',
      qualityFocus:
        'model fit, assumption clarity, diagram or calculation accuracy, incentive reasoning, welfare or distributional interpretation, limitation language, and decision usefulness',
      reviewProtocol:
        'check the market definition and assumptions, inspect the model or calculation, trace the comparative-static effect, test incentive or welfare reasoning, and require a revised economic decision with a named limitation',
      commonFailure:
        'students state an opinion or final answer without showing the economic model, assumptions, incentives, welfare effects, or decision limit',
    },
    'ethical-argument-brief': {
      outputFormat:
        'ethical argument brief, argument map, dilemma analysis, normative framework comparison, objection/reply memo, thought-experiment response, case-application judgment, or moral reasoning portfolio entry',
      evidenceRequirement:
        'moral issue, affected parties, value conflict, normative framework, claim, reasons, objection, reply, case evidence, decision limit, and revised moral judgment',
      qualityFocus:
        'claim clarity, framework fit, reason support, objection strength, reply quality, stakeholder sensitivity, case application, and judgment revision',
      reviewProtocol:
        'check the moral issue and framework, trace claim and reasons, test a serious objection or counterexample, inspect the reply, and require a revised judgment with a named limit',
      commonFailure:
        'students state personal opinion or broad values without mapping reasons, applying a framework, answering objections, or naming the limit of the judgment',
    },
    'policy-brief': {
      outputFormat:
        'policy memo, policy brief, option matrix, stakeholder analysis, equity review, cost-benefit note, impact assessment, implementation plan, regulatory analysis, or administrative-burden review',
      evidenceRequirement:
        'public problem definition, affected population, policy authority or decision maker, evidence source, option comparison, stakeholder/equity effect, feasibility or cost constraint, implementation risk, and recommendation rationale',
      qualityFocus:
        'problem framing, source credibility, stakeholder representation, equity reasoning, option tradeoff logic, feasibility, implementation realism, and decision usefulness',
      reviewProtocol:
        'check the problem definition and authority, trace each option to evidence, test stakeholder and equity effects, inspect feasibility and implementation risks, and require a revised recommendation with a named evidence limit',
      commonFailure:
        'students write a persuasive recommendation without a precise public problem, policy authority, evidence trace, stakeholder/equity analysis, feasibility check, or implementation plan',
    },
    'data-science-notebook': {
      outputFormat:
        'analytics notebook, data-cleaning log, visualization, dashboard, model evaluation, model card, data story, or bias-audit note',
      evidenceRequirement:
        'dataset provenance, cleaning or transformation decision, notebook output, visualization or model evidence, validation metric, interpretation, and bias or limitation check',
      qualityFocus:
        'data integrity, reproducibility, visualization or model fit, validation evidence, interpretation accuracy, bias or fairness reasoning, and decision usefulness',
      reviewProtocol:
        'inspect the dataset source and cleaning steps, run or review the notebook output, compare the validation metric to the claim, check one bias or limitation risk, and require a revised analytic conclusion',
      commonFailure:
        'students present a polished chart or model result without proving data provenance, cleaning choices, validation, interpretation limits, or bias risk',
    },
    'statistical-inference-report': {
      outputFormat:
        'statistical inference report, hypothesis-test write-up, confidence-interval interpretation, assumption-check memo, p-value explanation, regression-inference memo, or statistical decision brief',
      evidenceRequirement:
        'research question, variable or parameter, sample context, assumption check, calculation or software output, confidence interval or test statistic, p-value or effect size when relevant, interpretation, and limitation',
      qualityFocus:
        'question fit, assumption validity, calculation or output accuracy, uncertainty interpretation, effect size reasoning, limitation language, and decision usefulness',
      reviewProtocol:
        'check the question, variable or parameter, and sample; inspect assumptions; verify the interval, test statistic, p-value, effect size, or software output; and require an interpretation with uncertainty and limitation language',
      commonFailure:
        'students report formulas, p-values, or statistical significance without assumptions, uncertainty, practical interpretation, effect size, or limitations',
    },
    'source-evaluation-dossier': {
      outputFormat:
        'source-evaluation dossier, research log, database-search strategy, annotated bibliography, citation-trail map, synthesis matrix, or source-use plan',
      evidenceRequirement:
        'research question, database or catalog choice, search string and filter decision, source authority, relevance and credibility evidence, citation-trail note, synthesis relationship, attribution plan, and source-use decision',
      qualityFocus:
        'search strategy fit, source authority, relevance, credibility, citation-trail reasoning, synthesis usefulness, attribution integrity, and source-use judgment',
      reviewProtocol:
        'inspect the search strategy and database choice, verify the source authority and relevance, follow one citation trail, compare sources in the synthesis matrix, and require a revised source-use decision with attribution notes',
      commonFailure:
        'students list sources or summaries without showing how the search was built, why sources are credible and relevant, how sources connect, or how attribution will be handled',
    },
    'teaching-plan-portfolio': {
      outputFormat:
        'lesson plan, unit plan, microteaching demonstration, student-work analysis, formative-assessment plan, differentiation plan, classroom-management note, reteach plan, or reflective teaching portfolio',
      evidenceRequirement:
        'learning target, standard or objective alignment, instructional move, student-work or formative-assessment evidence, differentiation or accessibility support, classroom feasibility cue, feedback response, and revised instructional decision',
      qualityFocus:
        'target-task alignment, student evidence, pedagogical reasoning, differentiation, classroom feasibility, formative feedback, and reteach readiness',
      reviewProtocol:
        'check the learning target and standard, compare the task to student evidence, inspect formative assessment and differentiation, test classroom feasibility, and require a revised teaching move or reteach decision',
      commonFailure:
        'teacher candidates submit a polished lesson narrative without student evidence, target-task alignment, differentiation, formative assessment, or a defensible reteach decision',
    },
    'case-conceptualization': {
      outputFormat:
        'case conceptualization, intake note, process recording, helping-skills transcript, safety plan, service plan, referral note, treatment-plan rationale, or supervision reflection',
      evidenceRequirement:
        'client context, stated concern, observable helping response, client-goal evidence, empathy or reflection evidence, risk/safety cue, ethics or boundary note, supervision feedback, referral rationale, and revised helping response decision',
      qualityFocus:
        'client-centered evidence, active listening, helping-skill fit, ethics and boundaries, risk recognition, cultural humility, referral reasoning, supervision uptake, and next-response readiness',
      reviewProtocol:
        'check client context and goals, inspect the exact helping response, code listening or reflection evidence, verify risk/safety and ethics boundaries, compare referral options, and require a revised helping response or service decision',
      commonFailure:
        'students write broad empathy reflections without client-specific evidence, observable helping skills, risk or ethics reasoning, supervision feedback, or referral rationale',
    },
    'code-lab': {
      outputFormat:
        'repository commit, notebook, script or module, test suite, debugging log, pull-request note, or code review response',
      evidenceRequirement:
        'source code, failing and passing test result, debugging trace, edge-case check, code review note, and implementation rationale',
      qualityFocus:
        'correctness, readability, test coverage, edge-case reasoning, debugging discipline, refactor quality, and commit clarity',
      reviewProtocol:
        'run or inspect the tests, compare the code diff to the requirement, review one edge case and one readability concern, and require a revised commit or pull-request note',
      commonFailure:
        'students submit code that appears complete without test evidence, debugging trace, edge-case reasoning, or reviewable implementation rationale',
    },
    'lab-report': {
      outputFormat: 'lab notebook entry, protocol log, data table, analysis note, or concise lab report',
      evidenceRequirement:
        'safety or protocol check, controlled variable or specimen evidence, recorded observation, data interpretation, and limitation',
      qualityFocus: 'procedural accuracy, data integrity, safety reasoning, variable control, and conclusion limits',
      reviewProtocol:
        'verify the protocol step, inspect the notebook evidence or data table, check safety and variable controls, and require one corrected interpretation',
      commonFailure:
        'students report that the procedure was completed without preserving raw observations, safety checks, or limits on the conclusion',
    },
    'problem-set': {
      outputFormat: 'worked problem set, solution trace, graph/equation annotation, or proof rationale',
      evidenceRequirement:
        'setup choice, equation or representation, intermediate reasoning, answer check, and error or limitation note',
      qualityFocus:
        'mathematical setup, step-by-step reasoning, representation accuracy, answer verification, and error analysis',
      reviewProtocol:
        'inspect the setup, trace each solution step, compare alternate representations, and require one corrected or verified step',
      commonFailure:
        'students submit final answers without showing the setup, reasoning path, verification, or error diagnosis',
    },
    'proof-portfolio': {
      outputFormat:
        'theorem proof, lemma proof, counterexample analysis, definition map, proof critique, formal proof note, or proof revision portfolio',
      evidenceRequirement:
        'precise definition, hypotheses, claim, proof strategy, justified logical steps, counterexample or edge-case check, notation choice, and revision rationale',
      qualityFocus:
        'definition use, hypothesis tracking, quantifier precision, logical validity, proof strategy, counterexample reasoning, notation clarity, and revision quality',
      reviewProtocol:
        'check definitions and hypotheses, trace each implication, test boundary cases or counterexamples, inspect notation, and require one revised proof step with justification',
      commonFailure:
        'students present intuition, symbolic manipulation, or a final theorem statement without justified proof steps, hypothesis checks, counterexample testing, or revision evidence',
    },
    'capstone-project': {
      outputFormat: 'project charter, milestone brief, implementation plan, portfolio defense, or showcase artifact',
      evidenceRequirement:
        'sponsor or stakeholder need, integrated course evidence, project decision, risk or constraint, milestone status, and revision commitment',
      qualityFocus:
        'project coherence, stakeholder fit, integration across course concepts, feasibility, risk management, and defense readiness',
      reviewProtocol:
        'inspect the milestone evidence, compare it to sponsor constraints and success criteria, identify the highest implementation risk, and require a next-milestone revision',
      commonFailure:
        'students describe project progress without proving the decision, constraint, risk, or next milestone with evidence',
    },
    'competency-evidence': {
      outputFormat:
        'competency checklist, standards-aligned performance task, evidence portfolio, calibration note, or remediation plan',
      evidenceRequirement:
        'target competency, observable performance evidence, benchmark descriptor, assessor calibration note, proficiency decision, and reassessment or extension step',
      qualityFocus:
        'standards alignment, evidence sufficiency, calibrated proficiency judgment, feedback precision, remediation fit, and reassessment readiness',
      reviewProtocol:
        'map evidence to the competency descriptor, compare it against the benchmark, calibrate the proficiency decision, and require a remediation or extension step',
      commonFailure:
        'students list completed activities without showing observable evidence, benchmark alignment, calibration, or reassessment planning',
    },
    'creative-portfolio': {
      outputFormat:
        'creative draft, craft annotation, workshop response, process journal, artist statement, or revision portfolio',
      evidenceRequirement:
        'specific craft choice, draft evidence, critique note, revision decision, audience effect, and portfolio reflection',
      qualityFocus:
        'craft intentionality, visible revision, critique uptake, audience effect, risk-taking, and portfolio coherence',
      reviewProtocol:
        'read or view the draft closely, identify the craft move, compare critique notes to the revision, and require one targeted next draft decision',
      commonFailure:
        'students describe inspiration or feelings without showing the craft choice, critique evidence, or revision change',
    },
    'case-analysis': {
      outputFormat:
        'case analysis memo, executive recommendation, stakeholder tradeoff table, decision criteria brief, or implementation-risk note',
      evidenceRequirement:
        'case facts, exhibit evidence, stakeholder tradeoffs, decision criteria, strategic recommendation, and implementation risk',
      qualityFocus:
        'case specificity, tradeoff reasoning, defensible recommendation, audience fit, financial or operational implication, and implementation realism',
      reviewProtocol:
        'check the recommendation against case facts and exhibits, test it against at least one alternative, inspect stakeholder tradeoffs, and require one implementation-risk revision',
      commonFailure:
        'students summarize the case or choose an attractive option without decision criteria, tradeoff evidence, or implementation risk',
    },
    'legal-analysis': {
      outputFormat:
        'case brief, rule synthesis chart, issue-spotting response, IRAC memo, precedent map, or hypothetical application',
      evidenceRequirement:
        'material facts, procedural posture or legal context, holding, rationale, rule statement, doctrinal limit, and application to a new fact pattern',
      qualityFocus:
        'rule accuracy, holding/rationale distinction, precedent use, issue spotting, fact-sensitive application, counterargument, and doctrinal limits',
      reviewProtocol:
        'check the rule against the case holding and rationale, test it with a hypothetical or counterexample, inspect distinguishing facts, and require one revised application paragraph',
      commonFailure:
        'students summarize the case without extracting the rule, distinguishing the rationale, or applying doctrine to a new fact pattern',
    },
    'close-reading-analysis': {
      outputFormat:
        'close-reading memo, passage annotation, scene analysis, context note, interpretive portfolio, or source-integrity rationale',
      evidenceRequirement:
        'specific passage, scene, form, source, translation, or context evidence; bounded interpretive claim; counter-reading or source limit; and revision move',
      qualityFocus:
        'evidence specificity, claim arguability, context restraint, source integrity, counter-interpretation, and revision of the reading',
      reviewProtocol:
        'check the claim against the passage or source evidence, test one counter-reading or context boundary, and require a revised interpretive sentence or paragraph',
      commonFailure:
        'students summarize the text, film, or context without proving how specific evidence supports an arguable interpretation',
    },
    'field-evidence': {
      outputFormat: 'field note, stakeholder map, implementation memo, or community-facing recommendation',
      evidenceRequirement:
        'local observation, stakeholder evidence, implementation constraint, and equity or feasibility check',
      qualityFocus: 'local grounding, stakeholder fit, equity reasoning, and feasible action',
      reviewProtocol:
        'separate observed evidence from assumptions, check who is represented, and require one locally grounded revision',
      commonFailure: 'students write broad reflection without enough field or stakeholder evidence',
    },
    'literature-synthesis': {
      outputFormat: 'literature matrix, source synthesis, gap statement, or annotated evidence table',
      evidenceRequirement: 'source claim, comparison point, gap or limitation, and implication for the course artifact',
      qualityFocus: 'source accuracy, synthesis across sources, gap logic, and attribution integrity',
      reviewProtocol:
        'check every claim against the source list, compare at least two sources, and revise the gap statement',
      commonFailure: 'students summarize sources one by one without making a synthesis decision',
    },
    'memo-brief': {
      outputFormat: 'focused memo, brief, rationale, or recommendation document',
      evidenceRequirement: 'clear claim, course evidence, decision logic, limitation, and recommended next step',
      qualityFocus: 'claim clarity, evidence quality, decision logic, audience fit, and revision use',
      reviewProtocol: 'read for claim-evidence-fit, mark one weak reasoning link, and require a targeted revision',
      commonFailure: 'students make a recommendation that is polished but under-evidenced',
    },
    'checkpoint-response': {
      outputFormat: 'short checkpoint, quiz response, worksheet, or test-selection answer',
      evidenceRequirement: 'selected answer or short response plus reasoning, misconception check, and correction path',
      qualityFocus: 'concept accuracy, retrieval strength, explanation quality, and readiness for the next artifact',
      reviewProtocol:
        'sort responses by misconception pattern, reteach the weakest concept, and require a corrected explanation',
      commonFailure: 'students choose an answer without explaining the reasoning or correcting the misconception',
    },
    'language-performance': {
      outputFormat:
        'dialogue, oral recording, interpretive response, presentational script, cultural comparison, or language portfolio entry',
      evidenceRequirement:
        'target-language sample, meaning/comprehension evidence, accuracy or pronunciation focus, cultural-context choice, and feedback-based revision',
      qualityFocus:
        'comprehensibility, communicative function, language accuracy, cultural fit, confidence, and revised target-language use',
      reviewProtocol:
        'listen to or read the language sample, check meaning and accuracy against the communicative purpose, give one focused recast, and require a revised utterance or script',
      commonFailure:
        'students complete grammar or vocabulary drills without proving they can use the language to communicate meaning',
    },
    'performance-rehearsal': {
      outputFormat:
        'monologue, scene run, choreography phrase, score performance, rehearsal journal, performance recording, or critique-response note',
      evidenceRequirement:
        'observable performance attempt, technique or interpretive choice, rehearsal note, critique uptake, revised run, and next rehearsal cue',
      qualityFocus:
        'technique accuracy, artistic intention, ensemble awareness, critique uptake, performance presence, and revision visibility',
      reviewProtocol:
        'watch or listen to the performance evidence, name the technique or interpretive choice, compare notes to the revised run, and require one next rehearsal decision',
      commonFailure:
        'students describe performance intentions without showing the rehearsal evidence, critique uptake, or revised performance choice',
    },
    presentation: {
      outputFormat: 'brief presentation, slide, pitch, or spoken explanation with support notes',
      evidenceRequirement:
        'clear audience claim, organized evidence, visual or spoken support, and response to feedback',
      qualityFocus: 'audience fit, evidence organization, clarity, timing, and response to questions',
      reviewProtocol:
        'rehearse with a timing and evidence checklist, capture peer questions, and revise one slide or speaking move',
      commonFailure: 'students present polished slides that do not make the evidence decision visible',
    },
    'reflection-response': {
      outputFormat: 'reflection, discussion post, journal entry, or short response',
      evidenceRequirement: 'specific experience or course evidence, named learning move, limitation, and next action',
      qualityFocus: 'specificity, metacognition, evidence connection, and actionable transfer',
      reviewProtocol: 'ask for one concrete evidence detail, one feedback-based change, and one next-use commitment',
      commonFailure: 'students write general feelings without tying them to course evidence or transfer',
    },
    'applied-artifact': {
      outputFormat: 'course-specific applied artifact with evidence and revision trace',
      evidenceRequirement:
        'course evidence, visible decision, success criteria, limitation, and feedback-informed revision',
      qualityFocus: 'concept accuracy, evidence specificity, decision logic, and revision quality',
      reviewProtocol:
        'check the artifact against success criteria, identify one missing evidence link, and require revision',
      commonFailure: 'students complete the task format without making the evidence decision inspectable',
    },
  }[genre];

  const feedbackRoutine =
    modalityDecode?.feedbackRoutine ||
    profile?.teachingPattern?.feedbackRoutine ||
    'criterion-level feedback and one required revision';

  return {
    genre,
    label: sentenceCase(genre.replace(/-/g, ' ')),
    outputFormat: `${artifact}: ${details.outputFormat}`,
    evidenceRequirement: `For ${artifact}, require ${details.evidenceRequirement} about ${concept}.`,
    evidenceStandard: `Strong ${artifact} work makes ${details.evidenceRequirement} inspectable for ${concept}.`,
    qualityFocus: `${details.qualityFocus} for ${artifact}`,
    reviewProtocol: `${details.reviewProtocol} for ${stripLessonPrefix(lesson.title)}.`,
    commonFailure: details.commonFailure,
    revisionMove: `Revise ${artifact} by strengthening one ${concept} evidence link, naming what feedback changed, and using this feedback routine: ${feedbackRoutine}.`,
    modalityFit: `This ${genre} should be reviewed inside the ${profile.primaryMode || 'course'} pattern, not as a generic submission.`,
  };
}

function sourceRiskRank(level) {
  return { none: 0, low: 1, medium: 2, high: 3 }[level] || 0;
}

function highestSourceRisk(levels = []) {
  return levels.reduce((highest, level) => (sourceRiskRank(level) > sourceRiskRank(highest) ? level : highest), 'none');
}

function riskLevelForSourceField(field = {}) {
  if (field.rawStatus === 'unfinished-source-field') return 'high';
  if (field.source === 'sparse-fallback' || field.confidence === 'needs-review') return 'high';
  if (field.source && field.source !== 'course-map') return 'medium';
  if (field.confidence === 'medium') return 'medium';
  return 'low';
}

function buildSourceRiskRegister({ lessons, assessments }) {
  const reviewItems = [];
  const lessonRows = lessons.map((lesson) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[0] || {};
    const fields = Array.isArray(lesson.sourceEvidenceTrace?.sourceFields)
      ? lesson.sourceEvidenceTrace.sourceFields
      : [];
    const fieldRisks = fields
      .map((field) => ({
        field: field.field,
        sourceColumn: field.sourceColumn,
        source: field.source,
        confidence: field.confidence,
        riskLevel: riskLevelForSourceField(field),
        issue:
          field.rawStatus === 'unfinished-source-field'
            ? `${field.field} came from unfinished source text.`
            : field.source === 'sparse-fallback'
              ? `${field.field} was synthesized because the course map did not supply a usable value.`
              : field.source !== 'course-map'
                ? `${field.field} was ${field.source || 'derived'} instead of directly supplied.`
                : '',
        reviewerAction:
          field.source === 'course-map' && field.rawStatus !== 'unfinished-source-field'
            ? `Spot-check that ${field.field} still matches the official course source.`
            : `Confirm or replace ${field.field} for ${lesson.title} before publishing.`,
      }))
      .filter((fieldRisk) => fieldRisk.riskLevel !== 'low');
    const missingSignalRisks = (lesson.missingSignals || [])
      .filter((signal) => !/^Source (?:conflict|duplicate source row)/i.test(signal))
      .map((signal) => ({
        field: 'local review flag',
        sourceColumn: 'compiler-review',
        source: 'compiler-detected',
        confidence: 'needs-review',
        riskLevel: /assessment|unfinished|synthesized|resource|reading|duplicate|conflict|contradict/i.test(signal)
          ? 'high'
          : 'medium',
        issue: signal,
        reviewerAction: `Resolve this local-review flag for ${lesson.title}: ${signal}`,
      }));
    const sourceConflictRisks =
      lesson.sourceConflict?.status && lesson.sourceConflict.status !== 'clear'
        ? [
            {
              field: 'source row conflict',
              sourceColumn: 'sourceConflictReport',
              source: 'compiler-detected-source-conflict',
              confidence: 'needs-review',
              riskLevel: lesson.sourceConflict.status === 'source-conflict' ? 'high' : 'medium',
              issue: lesson.sourceConflict.issue,
              reviewerAction:
                lesson.sourceConflict.reviewerAction ||
                `Resolve duplicate source row identity for ${lesson.title} before publishing.`,
            },
          ]
        : [];
    const assessmentRisk =
      assessment.source && assessment.source !== 'course-map'
        ? [
            {
              field: 'assessment anchor',
              sourceColumn: 'weeklyAssessments/evaluateDesign',
              source: assessment.source,
              confidence: assessment.source === 'sparse-fallback' ? 'needs-review' : 'medium',
              riskLevel: assessment.source === 'sparse-fallback' ? 'high' : 'medium',
              issue: `${assessment.title || lesson.studentArtifact} was not directly anchored in weekly assessment text.`,
              reviewerAction: `Confirm the Week ${lesson.lessonNumber} assessment artifact, weight, and criteria before publishing.`,
            },
          ]
        : [];
    const risks = [...fieldRisks, ...missingSignalRisks, ...sourceConflictRisks, ...assessmentRisk];
    const riskLevel = highestSourceRisk(risks.map((risk) => risk.riskLevel));
    const row = {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      riskLevel,
      sourceConfidence: lesson.confidence?.level || 'unknown',
      sourceFieldCount: fields.length,
      directCourseMapFieldCount: lesson.sourceEvidenceTrace?.directCourseMapFieldCount || 0,
      inferredFieldCount: lesson.sourceEvidenceTrace?.inferredOrDerivedFields?.length || 0,
      sourceConflictStatus: lesson.sourceConflict?.status || 'clear',
      sourceConflictFields: lesson.sourceConflict?.conflictFields || [],
      assessmentSource: assessment.source || lesson.assessmentSource || 'unknown',
      reviewRequired: riskLevel === 'high' || riskLevel === 'medium',
      reviewFocus:
        risks.length > 0
          ? risks.map((risk) => risk.reviewerAction).slice(0, 4)
          : [`Spot-check official dates, policies, source permissions, and local examples for ${lesson.title}.`],
    };
    reviewItems.push(
      ...risks.map((risk) => ({
        lessonNumber: lesson.lessonNumber,
        lessonTitle: lesson.title,
        ...risk,
      })),
    );
    return row;
  });
  const highRiskCount = reviewItems.filter((item) => item.riskLevel === 'high').length;
  const mediumRiskCount = reviewItems.filter((item) => item.riskLevel === 'medium').length;
  const lowRiskLessonCount = lessonRows.filter((row) => row.riskLevel === 'low' || row.riskLevel === 'none').length;

  return {
    version: 1,
    status:
      highRiskCount > 0
        ? 'source-review-required'
        : mediumRiskCount > 0
          ? 'local-confirmation-required'
          : 'clear-with-spot-check',
    riskPolicy:
      'High and medium source risks must be confirmed by the instructor or instructional designer before classroom handoff; low-risk packages still need spot-checks for official facts, dates, policies, and permissions.',
    highRiskCount,
    mediumRiskCount,
    lowRiskLessonCount,
    reviewItemCount: reviewItems.length,
    lessonRows,
    reviewItems: reviewItems.slice(0, 40),
  };
}

function buildClassroomHandoffPlan({
  courseName,
  lessons,
  assessments,
  learnerContextProfile,
  courseModalityProfile,
  sourceRiskRegister,
  assessmentArchitecture,
}) {
  const localReviewNeeds = unique(
    [
      ...(learnerContextProfile?.localReviewNeeds || []),
      ...lessons.flatMap((lesson) => lesson.missingSignals || []),
      ...(sourceRiskRegister?.reviewItems || []).map((item) => item.reviewerAction),
      'Confirm official dates, LMS links, instructor contact details, grading policy language, and institution policies.',
      'Confirm copied readings, media, datasets, and cases are licensed or institutionally approved.',
    ],
    12,
  );
  const sourceReviewLessonCount = lessons.filter(
    (lesson) =>
      lesson.confidence?.level !== 'high' ||
      lesson.sourceConflict?.status !== 'clear' ||
      (lesson.missingSignals || []).some((signal) =>
        /reading|resource|assessment|policy|local review|duplicate|conflict/i.test(signal),
      ),
  ).length;
  const assessmentReviewLessonCount = assessments.filter((assessment) => assessment.source !== 'course-map').length;
  return {
    status:
      sourceReviewLessonCount > 0 || assessmentReviewLessonCount > 0
        ? 'ready-with-local-confirmation'
        : 'ready-with-spot-check',
    audience: 'instructor or instructional designer final-reviewing the compiled package',
    reviewOrder: [
      'Confirm official course facts and institution-specific policies.',
      `Confirm delivery mode, setting, tools, safety/privacy needs, and participation expectations for ${courseModalityProfile?.primaryMode || 'the course modality'}.`,
      'Review source-risk register items and resolve high/medium provenance risks before publishing.',
      'Check source/copyright permissions and replace generic source cues with official materials.',
      'Review assessment roles, weights, feedback windows, and revision uses before publishing the grading plan.',
      'Review the assessment calendar, weights, rubrics, calibration notes, and feedback windows.',
      'Walk one representative lesson from lesson plan to slides, assignment, rubric, quiz, study guide, discussion, FAQ, and export files.',
      'Confirm accessibility, participation options, and learner support assumptions before publishing.',
    ],
    requiredLocalConfirmations: localReviewNeeds,
    packageCoherenceChecks: [
      'Every lesson-facing artifact should preserve the same objective, assessment artifact, evidence requirement, success criteria, learner context, and source-use rule.',
      'Every high/medium source-risk register item should have a reviewer decision before classroom publication.',
      'Rubrics and assignments should use the same criterion-level evidence expectations and grading-calibration language.',
      'Slides, lesson plans, discussions, quizzes, study guides, and FAQ should reinforce the same transfer target and feedback cycle.',
    ],
    sourceReviewLessonCount,
    assessmentReviewLessonCount,
    sourceRiskRegister,
    assessmentArchitecture,
    lessonReviewOrder: lessons.map((lesson) => ({
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      artifact: lesson.studentArtifact,
      compilerDecision: lesson.compilerDecision,
      learnerContextCue: lesson.learnerContextCue,
      localReviewNeeded: lesson.missingSignals || [],
      sourceRisk:
        sourceRiskRegister?.lessonRows?.find((row) => row.lessonNumber === lesson.lessonNumber)?.riskLevel || 'none',
      reviewFocus: unique(
        [
          ...(sourceRiskRegister?.lessonRows?.find((row) => row.lessonNumber === lesson.lessonNumber)?.reviewFocus ||
            []),
          lesson.sourceUsePlan?.localReplacementCue || '',
          lesson.sourceUsePlan?.copyrightReviewCue || '',
          lesson.accessibilityPlan?.accommodationReviewCue || '',
          lesson.modalityCue || '',
          lesson.feedbackCycle?.closureCheck || '',
        ],
        4,
      ).filter(Boolean),
    })),
    courseModalityProfile,
    publishBoundary: `Do not publish ${courseName} until official dates, source permissions, institutional policies, accessibility accommodations, and instructor-specific grading decisions have been confirmed.`,
  };
}

function buildClassroomDryRunPlan({ courseName, lessons, courseModalityProfile, classroomHandoffPlan }) {
  const lessonRows = lessons.map((lesson) => {
    const segments = Array.isArray(lesson.classSessionPlan?.segments) ? lesson.classSessionPlan.segments : [];
    const firstSegment = segments[0] || {};
    const evidenceSegment =
      segments.find((segment) =>
        /\b(practice|checkpoint|artifact|feedback|revision|sprint|challenge)\b/i.test(
          `${segment.phase || ''} ${segment.purpose || ''}`,
        ),
      ) ||
      segments[2] ||
      firstSegment;
    const misconception = Array.isArray(lesson.misconceptionMap) ? lesson.misconceptionMap[0] : null;
    const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
    const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const handoffRow = Array.isArray(classroomHandoffPlan?.lessonReviewOrder)
      ? classroomHandoffPlan.lessonReviewOrder.find((row) => row.lessonNumber === lesson.lessonNumber)
      : null;
    return {
      version: 1,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      dryRunFocus: `Rehearse how students move from ${concept} readiness into visible work on ${artifact}.`,
      setupChecks: unique(
        [
          `Confirm students can access the materials, tools, examples, and submission path for ${stripLessonPrefix(lesson.title)}.`,
          lesson.sourceUsePlan?.localReplacementCue || '',
          lesson.accessibilityPlan?.accommodationReviewCue || '',
          lesson.prerequisitePlan?.localAssumptionReview || '',
          lessonLocalReviewAction(lesson),
        ],
        5,
      ),
      firstTenMinutes: firstSegment.purpose || lesson.prerequisitePlan?.diagnosticCheck || '',
      firstTenEvidence: firstSegment.evidenceOfLearning || lesson.readinessSupport?.readinessEvidence || '',
      evidenceCheckpoint: evidenceSegment.evidenceOfLearning || lesson.evidencePlan?.evidenceRequirement || '',
      likelyFailureMode:
        misconception?.misconception ||
        lesson.artifactGenre?.commonFailure ||
        `Students describe ${concept} without showing how evidence changes ${artifact}.`,
      instructorAdjustment:
        lesson.evidenceResponsePlan?.supportMove ||
        lesson.readinessSupport?.supportMove ||
        `Pause and model one evidence-backed ${concept} move before students continue ${artifact}.`,
      extensionMove:
        lesson.evidenceResponsePlan?.readyMove ||
        lesson.readinessSupport?.extensionMove ||
        `Ask ready students to compare two evidence choices and justify which one strengthens ${artifact}.`,
      adjustmentTrigger:
        lesson.feedbackCycle?.closureCheck ||
        lesson.evidenceResponsePlan?.recheckCue ||
        `If students cannot explain the evidence behind ${artifact}, reteach ${concept} before publishing or continuing.`,
      timingCheck: {
        status: lesson.classSessionPlan?.feasibilityStatus || 'missing',
        plannedClassMinutes: lesson.classSessionPlan?.plannedClassMinutes ?? null,
        sessionMinutes: lesson.classSessionPlan?.sessionMinutes ?? null,
        segmentCount: lesson.classSessionPlan?.segmentCount ?? segments.length,
      },
      workloadFit: lesson.classSessionPlan?.studentWorkloadFit?.status || 'workload review pending',
      sourceRiskLevel: lesson.sourceRisk?.riskLevel || 'unknown',
      publishGate: lesson.compilerDecision?.publishGate || handoffRow?.compilerDecision?.publishGate || '',
      reviewerAction: lessonLocalReviewAction(lesson),
      readyEvidence:
        lesson.masteryEvidencePlan?.masteryThreshold ||
        `Ready work cites evidence, explains the decision, and shows revision in ${artifact}.`,
    };
  });
  const reviewRequiredCount = lessonRows.filter(
    (row) => row.publishGate === 'local-review-required-before-publish' || row.sourceRiskLevel !== 'none',
  ).length;
  const timingReviewCount = lessonRows.filter((row) => row.timingCheck.status !== 'fits-session').length;
  return {
    version: 1,
    source: 'deterministic-classroom-dry-run-plan',
    status:
      reviewRequiredCount > 0 || timingReviewCount > 0 ? 'dry-run-with-local-review' : 'ready-for-classroom-dry-run',
    courseName,
    modality: courseModalityProfile?.primaryMode || 'course-specific',
    rehearsalPolicy:
      'Before classroom handoff, rehearse the opening readiness check, the central evidence checkpoint, and the instructor adjustment for every lesson.',
    failureResponsePolicy:
      'If dry-run evidence shows students cannot produce the lesson artifact with source-backed reasoning, reteach locally before publishing the package.',
    lessonRowCount: lessonRows.length,
    reviewRequiredCount,
    timingReviewCount,
    lessonRows,
  };
}

function buildClassroomEvidenceLoopPlan({
  courseName,
  lessons,
  courseModalityProfile,
  classroomDryRunPlan,
  classroomHandoffPlan,
}) {
  const lessonRows = lessons.map((lesson) => {
    const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
    const dryRunRow = Array.isArray(classroomDryRunPlan?.lessonRows)
      ? classroomDryRunPlan.lessonRows.find((row) => row.lessonNumber === lesson.lessonNumber)
      : null;
    const handoffRow = Array.isArray(classroomHandoffPlan?.lessonReviewOrder)
      ? classroomHandoffPlan.lessonReviewOrder.find((row) => row.lessonNumber === lesson.lessonNumber)
      : null;
    const segmentSignals = unique(
      (lesson.classSessionPlan?.segments || [])
        .map((segment) => segment.evidenceOfLearning || segment.purpose || '')
        .filter(Boolean),
      4,
    );
    return {
      version: 1,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      implementationFocus: `After teaching ${stripLessonPrefix(lesson.title)}, record whether students could use ${concept} evidence to improve ${artifact}.`,
      evidenceToCollect: unique(
        [
          dryRunRow?.firstTenEvidence || lesson.readinessSupport?.readinessEvidence || '',
          dryRunRow?.evidenceCheckpoint || lesson.evidencePlan?.evidenceRequirement || '',
          lesson.feedbackCycle?.formativeEvidence || '',
          lesson.masteryEvidencePlan?.independentPerformanceEvidence || '',
          lesson.masteryEvidencePlan?.feedbackRevisionEvidence || '',
        ],
        5,
      ),
      duringClassSignals: segmentSignals,
      studentWorkSampleCue: `Save one ready, one partial, and one needs-support ${artifact} sample or note so the next run can calibrate examples without inventing evidence.`,
      pacingSignal: `${lesson.classSessionPlan?.plannedClassMinutes ?? 'Planned'} of ${
        lesson.classSessionPlan?.sessionMinutes ?? 'available'
      } class minutes planned; record where students needed more or less time.`,
      misconceptionSignal:
        lesson.misconceptionMap?.[0]?.misconception ||
        dryRunRow?.likelyFailureMode ||
        `Students may describe ${concept} without evidence.`,
      adjustmentDecision:
        dryRunRow?.adjustmentTrigger ||
        lesson.evidenceResponsePlan?.recheckCue ||
        `Decide whether to reteach, shorten, extend, or keep the ${concept} sequence before the next course run.`,
      nextLessonFeedForward:
        lesson.learningTransferPlan?.transferTask ||
        lesson.conceptDependencyPlan?.transferCue ||
        `Carry the strongest ${concept} evidence move into the next lesson or artifact.`,
      sourceUpdateCue:
        lesson.sourceUsePlan?.localReplacementCue ||
        `If the source, case, dataset, reading, or local example did not work for ${artifact}, replace it before reusing the package.`,
      preferenceLearningSignal: `Record any instructor edits to ${artifact} wording, pacing, examples, support moves, rubric language, quiz difficulty, or slide phrasing so the next compiler run can preserve those preferences.`,
      readyForNextRunCriteria:
        lesson.masteryEvidencePlan?.masteryThreshold ||
        dryRunRow?.readyEvidence ||
        `The lesson is ready to reuse when student evidence shows accurate ${concept} use, source-backed reasoning, and a visible revision to ${artifact}.`,
      reviewCadence:
        courseModalityProfile?.primaryMode === 'online-hybrid'
          ? 'Review LMS activity, submissions, and feedback notes before opening the next module.'
          : 'Review exit tickets, artifact samples, pacing notes, and instructor adjustments before teaching the next lesson.',
      publishGate: lesson.compilerDecision?.publishGate || handoffRow?.compilerDecision?.publishGate || '',
      reviewerAction: lessonLocalReviewAction(lesson),
    };
  });
  const reviewRequiredCount = lessonRows.filter(
    (row) => row.publishGate === 'local-review-required-before-publish',
  ).length;
  return {
    version: 1,
    source: 'deterministic-classroom-evidence-loop',
    status: reviewRequiredCount > 0 ? 'evidence-loop-with-local-review' : 'ready-for-implementation-evidence',
    courseName,
    modality: courseModalityProfile?.primaryMode || 'course-specific',
    evidencePolicy:
      'After each lesson, collect observable student work, pacing, misconception, feedback, and instructor-adjustment evidence before reusing or improving the compiled package.',
    preferenceLearningPolicy:
      'Instructor edits and classroom evidence should become preference signals for future compiler runs only when they are concrete, repeated, and tied to visible learning evidence.',
    lessonRowCount: lessonRows.length,
    reviewRequiredCount,
    lessonRows,
  };
}

function estimateFeedbackMinutes(assessment = {}, lesson = {}) {
  const role = `${assessment.role || ''} ${assessment.roleLabel || ''} ${assessment.stakes || ''} ${assessment.title || ''}`;
  if (/\b(high[-\s]?stakes|summative|final|portfolio|capstone)\b/i.test(role)) return 14;
  if (/\b(quiz|check|diagnostic|retrieval)\b/i.test(role)) return 4;
  if (/\b(draft|checkpoint|formative|discussion|reflection)\b/i.test(role)) return 7;
  if (lesson.artifactGenre?.genre && /project|design|case|clinical|portfolio/i.test(lesson.artifactGenre.genre))
    return 10;
  return 8;
}

function buildInstructorFeedbackLoadPlan({
  courseName,
  lessons,
  assessments,
  courseModalityProfile,
  classroomEvidenceLoopPlan,
}) {
  const lessonRows = lessons.map((lesson, index) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[index] || {};
    const evidenceLoopRow = Array.isArray(classroomEvidenceLoopPlan?.lessonRows)
      ? classroomEvidenceLoopPlan.lessonRows.find((row) => row.lessonNumber === lesson.lessonNumber)
      : null;
    const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const artifact = stripTerminalPunctuation(lesson.studentArtifact || assessment.title || 'the lesson artifact');
    const feedbackMinutes = estimateFeedbackMinutes(assessment, lesson);
    return {
      version: 1,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      assessmentTitle: assessment.title || artifact,
      assessmentRole: assessment.roleLabel || assessment.role || 'Course evidence checkpoint',
      gradingMode: assessment.gradingMode || 'criteria-based feedback',
      stakes: assessment.stakes || 'formative',
      feedbackWindow: assessment.cadence?.feedbackWindow || 'Return feedback before the next dependent task.',
      estimatedFeedbackMinutes: feedbackMinutes,
      feedbackFocus:
        lesson.feedbackCycle?.feedbackMethod ||
        assessment.criterionEvidenceMap?.[0]?.feedbackMove ||
        `Focus feedback on whether ${concept} evidence clearly improves ${artifact}.`,
      highestLeverageCriterion:
        assessment.criterionWeightPlan?.[0]?.criterion ||
        assessment.criteria?.[0] ||
        lesson.successCriteria?.[0] ||
        `${concept} evidence quality`,
      calibrationCue:
        assessment.calibrationPlan?.scorerNorming ||
        assessment.anchorExampleSet?.scorerCalibrationUse ||
        `Before grading ${artifact}, compare a strong and partial sample and name the visible evidence difference.`,
      studentSelfCheck:
        assessment.anchorExampleSet?.studentFacingUse ||
        lesson.objectiveEvidencePlan?.policy ||
        `Before submitting ${artifact}, students self-check evidence, reasoning, feedback use, and revision quality.`,
      batchingStrategy:
        feedbackMinutes <= 5
          ? `Use quick whole-class pattern feedback for ${artifact}, then respond individually only where evidence is missing.`
          : `Batch feedback for ${artifact} by criterion so repeated issues become reusable comments plus one student-specific next move.`,
      reusableCommentCue:
        assessment.criterionEvidenceMap?.[0]?.partialSignal ||
        `Use a reusable comment when students name ${concept} but do not explain how evidence changes ${artifact}.`,
      nextInstructionCue:
        evidenceLoopRow?.nextLessonFeedForward ||
        lesson.learningTransferPlan?.transferTask ||
        `Use feedback patterns from ${artifact} to decide what to reteach before the next lesson.`,
      loadRisk: feedbackMinutes > 12 ? 'heavy-feedback-checkpoint' : 'manageable-feedback-load',
      publishGate: lesson.compilerDecision?.publishGate || '',
      reviewerAction: lessonLocalReviewAction(lesson),
    };
  });
  const totalEstimatedFeedbackMinutes = lessonRows.reduce((sum, row) => sum + row.estimatedFeedbackMinutes, 0);
  const heavyFeedbackLessonCount = lessonRows.filter((row) => row.loadRisk === 'heavy-feedback-checkpoint').length;
  return {
    version: 1,
    source: 'deterministic-instructor-feedback-load-plan',
    status:
      heavyFeedbackLessonCount > Math.ceil(lessonRows.length * 0.35) ? 'feedback-load-review' : 'feedback-load-ready',
    courseName,
    modality: courseModalityProfile?.primaryMode || 'course-specific',
    feedbackLoadPolicy:
      'Classroom-ready packages must make instructor feedback work visible, paced, calibrated, and reusable before handoff.',
    calibrationPolicy:
      'High-value feedback should use criteria, anchor examples, and observed classroom evidence instead of one-off freeform comments.',
    lessonRowCount: lessonRows.length,
    totalEstimatedFeedbackMinutes,
    averageEstimatedFeedbackMinutes: lessonRows.length
      ? Math.round(totalEstimatedFeedbackMinutes / lessonRows.length)
      : 0,
    heavyFeedbackLessonCount,
    lessonRows,
  };
}

function buildBlueprintAssumptionLedger({
  courseName,
  lessons,
  learnerContextProfile,
  courseModalityProfile,
  sourceConflictReport,
  sourceRiskRegister,
  assessmentArchitecture,
  compilerDecisionMatrix,
  classroomHandoffPlan,
}) {
  const rows = [];
  const addRow = ({
    category,
    lessonNumber = null,
    lessonTitle = '',
    assumption,
    evidence,
    source,
    confidence = 'medium',
    affectedArtifacts = [],
    reviewRequired = false,
    reviewerAction,
  }) => {
    const cleanAssumption = cleanText(assumption);
    if (!cleanAssumption) return;
    rows.push({
      id: `assumption-${rows.length + 1}`,
      category,
      lessonNumber,
      lessonTitle: cleanText(lessonTitle),
      assumption: cleanAssumption,
      evidence: cleanText(evidence, 'Compiler-derived from available course-map signals.'),
      source: cleanText(source, 'compiler-derived'),
      confidence: cleanText(confidence, reviewRequired ? 'needs-review' : 'medium'),
      affectedArtifacts: unique(affectedArtifacts.filter(Boolean), 10),
      reviewRequired: Boolean(reviewRequired),
      reviewerAction: cleanText(
        reviewerAction,
        reviewRequired
          ? 'Confirm or revise this assumption before classroom publication.'
          : 'Spot-check this assumption during final instructor review.',
      ),
      resolutionStatus: reviewRequired ? 'pending-local-confirmation' : 'spot-check',
    });
  };

  addRow({
    category: 'learner-context',
    assumption: `${courseName} learners are treated as ${learnerContextProfile?.learnerRole || 'course participants'} who need to produce ${learnerContextProfile?.evidenceNoun || 'evidence'} for ${learnerContextProfile?.decisionNoun || 'course decisions'}.`,
    evidence: [
      learnerContextProfile?.source,
      learnerContextProfile?.coursePerformanceRole,
      ...(learnerContextProfile?.supportAssumptions || []).slice(0, 2),
    ]
      .filter(Boolean)
      .join('; '),
    source: learnerContextProfile?.source || 'compiler-derived-from-course-map',
    confidence: 'medium',
    affectedArtifacts: ['syllabus', 'lessonPlans', 'assignments', 'rubrics', 'discussions', 'quizBank', 'studyGuides'],
    reviewRequired: false,
    reviewerAction:
      'Confirm the learner role, prior-knowledge assumptions, and participation modes match the actual enrolled students.',
  });

  addRow({
    category: 'course-modality',
    assumption: `${courseName} is decoded as ${courseModalityProfile?.primaryMode || 'the inferred course modality'} with ${courseModalityProfile?.teachingPattern?.signaturePractice || 'course-specific practice'}.`,
    evidence: [
      courseModalityProfile?.source,
      courseModalityProfile?.sessionPattern,
      courseModalityProfile?.teachingPattern?.evidenceRoutine,
    ]
      .filter(Boolean)
      .join('; '),
    source: courseModalityProfile?.source || 'compiler-inferred-from-course-map',
    confidence: 'medium',
    affectedArtifacts: ['lessonPlans', 'slideDecks', 'assignments', 'discussions', 'quizBank'],
    reviewRequired: false,
    reviewerAction:
      'Confirm the inferred modality, interaction pattern, and signature practice fit the real delivery setting.',
  });

  for (const lesson of lessons || []) {
    const inferredFields = Array.isArray(lesson.sourceEvidenceTrace?.inferredOrDerivedFields)
      ? lesson.sourceEvidenceTrace.inferredOrDerivedFields
      : [];
    for (const field of inferredFields) {
      addRow({
        category: 'source-provenance',
        lessonNumber: lesson.lessonNumber,
        lessonTitle: lesson.title,
        assumption: `${field.field} was ${field.source} for ${lesson.title}.`,
        evidence: field.reason || lesson.sourceEvidenceTrace?.unsupportedInferencePolicy,
        source: field.source,
        confidence: field.source === 'sparse-fallback' ? 'needs-review' : 'medium',
        affectedArtifacts: ['syllabus', 'lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'quizBank'],
        reviewRequired: true,
        reviewerAction: `Confirm or replace ${field.field} for ${lesson.title} before publishing.`,
      });
    }
  }

  for (const item of sourceRiskRegister?.reviewItems || []) {
    addRow({
      category: 'source-risk',
      lessonNumber: item.lessonNumber,
      lessonTitle: item.lessonTitle,
      assumption: item.issue || `${item.field} needs local source review.`,
      evidence: [item.sourceColumn, item.source, item.confidence].filter(Boolean).join('; '),
      source: item.source || 'compiler-detected',
      confidence: item.confidence || item.riskLevel || 'needs-review',
      affectedArtifacts: ['syllabus', 'lessonPlans', 'assignments', 'rubrics', 'exportPackage'],
      reviewRequired: item.riskLevel === 'high' || item.riskLevel === 'medium',
      reviewerAction: item.reviewerAction,
    });
  }

  for (const row of sourceConflictReport?.lessonRows || []) {
    if (row.conflictStatus === 'clear') continue;
    addRow({
      category: 'source-conflict',
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      assumption: row.issue || `Duplicate source rows affect ${row.lessonTitle}.`,
      evidence: [
        row.conflictLabel,
        (row.duplicateLessonNumbers || []).join(', '),
        (row.conflictFields || []).join(', '),
      ]
        .filter(Boolean)
        .join('; '),
      source: 'compiler-detected-source-conflict',
      confidence: 'needs-review',
      affectedArtifacts: ['syllabus', 'lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'exportPackage'],
      reviewRequired: true,
      reviewerAction: row.reviewerAction,
    });
  }

  for (const row of assessmentArchitecture?.weightRows || []) {
    addRow({
      category: 'assessment-weight',
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      assumption: `${row.assessmentTitle || row.lessonTitle} uses ${row.weightPercent}% grading weight.`,
      evidence: row.sourceEvidence || row.rationale || assessmentArchitecture?.weightConfirmationPolicy,
      source: row.source || 'compiler-distributed-by-assessment-role',
      confidence: row.source === 'course-map-explicit' ? 'high' : 'needs-review',
      affectedArtifacts: ['syllabus', 'assignments', 'rubrics', 'exportPackage'],
      reviewRequired: Boolean(row.reviewRequired),
      reviewerAction:
        row.reviewerAction || `Confirm the official grading weight for ${row.lessonTitle} before publishing.`,
    });
  }

  for (const row of compilerDecisionMatrix?.lessonRows || []) {
    if (!row.reviewRequired && row.publishGate === 'instructor-spot-check-before-publish') continue;
    addRow({
      category: 'compiler-decision',
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      assumption: `${row.lessonTitle} will use ${row.generationPath} with publish gate ${row.publishGate}.`,
      evidence: (row.reviewFocus || []).join('; '),
      source: 'deterministic-compiler-decision',
      confidence: row.reviewRequired ? 'needs-review' : 'medium',
      affectedArtifacts: ['lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'quizBank', 'studyGuides'],
      reviewRequired: Boolean(row.reviewRequired),
      reviewerAction: (row.reviewFocus || [])[0] || 'Spot-check the compiler decision before publishing.',
    });
  }

  addRow({
    category: 'handoff-boundary',
    assumption: classroomHandoffPlan?.publishBoundary,
    evidence: (classroomHandoffPlan?.reviewOrder || []).join('; '),
    source: 'classroom-handoff-policy',
    confidence: 'needs-review',
    affectedArtifacts: ['syllabus', 'exportPackage', 'allDeliverables'],
    reviewRequired: true,
    reviewerAction:
      'Confirm official facts, institution policies, source permissions, accessibility accommodations, and grading decisions before publishing.',
  });

  const reviewRequiredCount = rows.filter((row) => row.reviewRequired).length;
  const compilerInferredCount = rows.filter((row) => /compiler|derived|fallback/i.test(row.source)).length;
  const sourceExplicitCount = rows.filter(
    (row) => row.source === 'course-map' || row.source === 'course-map-explicit',
  ).length;
  const categories = unique(
    rows.map((row) => row.category),
    12,
  );

  return {
    version: 1,
    status: reviewRequiredCount > 0 ? 'local-confirmation-required' : 'ready-for-spot-check',
    reviewerPolicy:
      'Use this ledger as the human-readable explanation of what the blueprint believed, inferred, or needs confirmed before classroom publication.',
    rowCount: rows.length,
    reviewRequiredCount,
    compilerInferredCount,
    sourceExplicitCount,
    categories,
    rows,
  };
}

function buildPackageCoherenceMatrix({ lessons, assessments, classroomHandoffPlan }) {
  const lessonRows = lessons.map((lesson) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[0] || {};
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      assessmentTitle: assessment.title || lesson.studentArtifact,
      assessmentArtifact: lesson.studentArtifact,
      assessmentWeight: assessment.weight || '',
      assessmentRole: assessment.roleLabel || assessment.role || '',
      assessmentCadenceCue:
        [assessment.cadence?.dueWindow, assessment.cadence?.feedbackWindow, assessment.cadence?.revisionWindow]
          .filter(Boolean)
          .join('; ') || '',
      criterionWeightCue:
        (assessment.criterionWeightPlan || [])
          .map((entry) => `${entry.priority || entry.criterion}: ${entry.weight}%`)
          .join('; ') || '',
      successCriteria: lesson.successCriteria || [],
      evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
      sourceEvidenceCue:
        lesson.sourceEvidenceTrace?.sourceFields?.map((field) => `${field.field}: ${field.source}`).join('; ') || '',
      sourceConflictCue:
        lesson.sourceConflict?.status && lesson.sourceConflict.status !== 'clear'
          ? lesson.sourceConflict.issue || lesson.sourceConflict.reviewerAction || lesson.sourceConflict.status
          : 'clear',
      sourceRiskLevel:
        classroomHandoffPlan?.sourceRiskRegister?.lessonRows?.find((row) => row.lessonNumber === lesson.lessonNumber)
          ?.riskLevel || 'none',
      compilerDecisionCue: lesson.compilerDecision?.generationPath || '',
      publishGate: lesson.compilerDecision?.publishGate || '',
      sourceUseCue: lesson.sourceUsePlan?.noInventedSources || '',
      learnerContextCue: lesson.learnerContextCue || '',
      prerequisiteCue: lesson.prerequisitePlan?.diagnosticCheck || '',
      conceptDependencyCue: lesson.conceptDependencyPlan?.dependencyCue || '',
      practiceProgressionCue: lesson.practiceProgressionPlan?.practiceFocus || '',
      masteryEvidenceCue: lesson.masteryEvidencePlan?.independentPerformanceEvidence || '',
      masteryRevisionCue: lesson.masteryEvidencePlan?.feedbackRevisionEvidence || '',
      masteryTransferCue: lesson.masteryEvidencePlan?.transferEvidence || '',
      evidenceResponseCue: lesson.evidenceResponsePlan?.partialMove || '',
      evidenceSupportCue: lesson.evidenceResponsePlan?.supportMove || '',
      evidenceExtensionCue: lesson.evidenceResponsePlan?.readyMove || '',
      modalityCue: lesson.modalityCue || '',
      modalityDecodeCue: lesson.modalityDecode?.signaturePractice || '',
      artifactGenreCue: lesson.artifactGenre?.genre || '',
      artifactGenreOutputFormat: lesson.artifactGenre?.outputFormat || '',
      artifactGenreEvidenceRequirement: lesson.artifactGenre?.evidenceRequirement || '',
      classSessionCue:
        lesson.classSessionPlan?.feasibilityStatus === 'fits-session'
          ? `${lesson.classSessionPlan.plannedClassMinutes}/${lesson.classSessionPlan.sessionMinutes} minutes planned across ${lesson.classSessionPlan.segmentCount} phases`
          : '',
      teachingIntentCue: lesson.teachingIntent?.teachingGoal || '',
      feedbackAction: lesson.feedbackCycle?.studentRevisionAction || '',
      transferTarget: lesson.learningTransferPlan?.transferTask || '',
      localReviewNeeded: lesson.missingSignals || [],
      handoffReviewFocus:
        classroomHandoffPlan?.lessonReviewOrder?.find((item) => item.lessonNumber === lesson.lessonNumber)
          ?.reviewFocus || [],
    };
  });
  const requiredFields = [
    'lessonTitle',
    'assessmentArtifact',
    'assessmentWeight',
    'assessmentRole',
    'assessmentCadenceCue',
    'criterionWeightCue',
    'evidenceRequirement',
    'sourceEvidenceCue',
    'sourceConflictCue',
    'sourceRiskLevel',
    'compilerDecisionCue',
    'publishGate',
    'sourceUseCue',
    'learnerContextCue',
    'prerequisiteCue',
    'conceptDependencyCue',
    'practiceProgressionCue',
    'masteryEvidenceCue',
    'masteryRevisionCue',
    'masteryTransferCue',
    'evidenceResponseCue',
    'evidenceSupportCue',
    'evidenceExtensionCue',
    'modalityCue',
    'modalityDecodeCue',
    'artifactGenreCue',
    'classSessionCue',
    'teachingIntentCue',
    'feedbackAction',
    'transferTarget',
  ];
  const missingFieldCount = lessonRows.reduce(
    (sum, row) => sum + requiredFields.filter((field) => !row[field]).length,
    0,
  );
  return {
    version: 1,
    status: missingFieldCount === 0 ? 'coherent' : 'needs-review',
    invariantSet: [
      'lesson identity',
      'assessment artifact and weight',
      'assessment role and cadence',
      'criterion-level weights and calibration',
      'success criteria',
      'evidence requirement',
      'source evidence provenance',
      'source conflict status',
      'source risk level',
      'compiler decision path',
      'publish gate',
      'source-use rule',
      'learner context',
      'prerequisite readiness',
      'concept dependency graph',
      'practice progression',
      'mastery evidence sequence',
      'evidence response decisions',
      'course modality',
      'course modality teaching pattern',
      'student artifact genre',
      'class session feasibility',
      'teaching intent',
      'feedback/revision action',
      'transfer target',
      'local handoff review focus',
    ],
    checkedArtifacts: [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'assignments',
      'rubrics',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ],
    missingFieldCount,
    lessonRows,
  };
}

function buildBlueprintReviewSurface({
  courseName,
  lessons,
  assessments,
  courseArc,
  enrichment,
  learnerContextProfile,
  courseModalityProfile,
  sourceRiskRegister,
  sourceConflictReport,
  compilerDecisionMatrix,
  assessmentArchitecture,
  blueprintAssumptionLedger,
  packageCoherenceMatrix,
}) {
  const sourceReviewRequiredCount = (lessons || []).filter((lesson) => {
    const riskLevel =
      sourceRiskRegister?.lessonRows?.find((row) => row.lessonNumber === lesson.lessonNumber)?.riskLevel || 'none';
    return (
      riskLevel !== 'none' ||
      (lesson.missingSignals || []).length > 0 ||
      lesson.compilerDecision?.publishGate === 'source-review-required-before-publish' ||
      lesson.sourceConflict?.status === 'conflicting-source-rows'
    );
  }).length;
  const conflictCount = Number(sourceConflictReport?.duplicateLessonCount || 0);
  const localConfirmationCount = Number(blueprintAssumptionLedger?.reviewRequiredCount || 0);
  const status =
    sourceReviewRequiredCount > 0 || conflictCount > 0
      ? 'source-review-required'
      : 'review-ready-with-local-confirmations';
  const assumptionRows = Array.isArray(blueprintAssumptionLedger?.rows) ? blueprintAssumptionLedger.rows : [];
  const instructionalMoves = normalizeEnrichmentTeachingMoves(enrichment?.teachingMoves);
  const instructionalMoveSource = enrichment?.source || 'deterministic-blueprint-enrichment';
  const instructionalMoveDecode = {
    status: ['openingMove', 'practiceMove', 'feedbackMove', 'assessmentMove', 'reviewMove'].every(
      (key) => instructionalMoves[key],
    )
      ? 'reviewable'
      : 'needs-review',
    source: instructionalMoveSource,
    openingMove: instructionalMoves.openingMove || '',
    practiceMove: instructionalMoves.practiceMove || '',
    feedbackMove: instructionalMoves.feedbackMove || '',
    assessmentMove: instructionalMoves.assessmentMove || '',
    reviewMove: instructionalMoves.reviewMove || '',
    sourceGrounding: [
      learnerContextProfile?.evidenceNoun,
      learnerContextProfile?.decisionNoun,
      courseModalityProfile?.teachingPattern?.signaturePractice,
      courseModalityProfile?.teachingPattern?.feedbackRoutine,
    ]
      .filter(Boolean)
      .join('; '),
    reviewPolicy:
      'Confirm these reusable teaching moves fit the actual course modality, learner role, artifacts, and local teaching constraints before trusting expanded lesson plans or slides.',
  };

  const lessonRows = (lessons || []).map((lesson) => {
    const moveTrace = lessonTeachingMoves({ enrichment, lessons }, lesson);
    const sourceRisk =
      sourceRiskRegister?.lessonRows?.find((row) => row.lessonNumber === lesson.lessonNumber)?.riskLevel || 'none';
    const reviewState =
      sourceRisk !== 'none' || (lesson.missingSignals || []).length > 0 ? 'source-review-required' : 'spot-check-ready';
    const primaryAnchor =
      lesson.sourceAnchors?.find((anchor) => anchor?.source === 'course-map') || lesson.sourceAnchors?.[0] || null;
    const sourceSignal = primaryAnchor?.label || lesson.evidencePlan?.sourceCue || '';
    const relatedAssumptions = assumptionRows
      .filter(
        (row) =>
          row.lessonNumber === lesson.lessonNumber ||
          ['learner-context', 'course-modality', 'handoff-boundary'].includes(row.category),
      )
      .slice(0, 5);
    const localConfirmationCue =
      lesson.compilerDecision?.reviewFocus?.[0] ||
      relatedAssumptions.find((row) => row.reviewRequired)?.reviewerAction ||
      relatedAssumptions[0]?.reviewerAction ||
      '';
    const sourceFields = (lesson.sourceEvidenceTrace?.sourceFields || [])
      .slice(0, 5)
      .map((field) => `${field.field}: ${field.sourceColumn} (${field.source})`);
    const compilerReason = lesson.compilerDecision?.reason || '';
    const evidenceRequirement = lesson.evidencePlan?.evidenceRequirement || '';
    const answerabilityStatus =
      sourceSignal && sourceFields.length > 0 && evidenceRequirement && compilerReason && localConfirmationCue
        ? reviewState === 'source-review-required'
          ? 'answerable-with-source-review'
          : 'answerable-from-blueprint'
        : 'not-answerable';
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      sourceConfidence: lesson.confidence?.level || 'unknown',
      sourceSignal,
      assessmentArtifact: lesson.studentArtifact,
      artifactGenre: lesson.artifactGenre?.genre || 'unknown',
      teachingGoal: lesson.teachingIntent?.teachingGoal || '',
      modalityPractice: lesson.modalityDecode?.signaturePractice || '',
      compilerDecision: lesson.compilerDecision?.generationPath || '',
      publishGate: lesson.compilerDecision?.publishGate || '',
      sourceRisk,
      reviewState,
      reviewerQuestion:
        reviewState === 'source-review-required'
          ? lesson.compilerDecision?.reviewFocus?.[0] ||
            `Confirm the source evidence for ${stripLessonPrefix(lesson.title)} before publishing.`
          : `Confirm ${stripLessonPrefix(lesson.title)} preserves the source topic, assessment artifact, and local classroom fit.`,
      answerabilityStatus,
      teachingMoveTrace: {
        source: instructionalMoveSource,
        openingMove: moveTrace.openingMove,
        practiceMove: moveTrace.practiceMove,
        feedbackMove: moveTrace.feedbackMove,
        assessmentMove: moveTrace.assessmentMove,
        reviewMove: moveTrace.reviewMove,
        sourceAnchor: sourceSignal,
        artifactCue: lesson.studentArtifact,
        modalityCue: lesson.modalityDecode?.signaturePractice || '',
      },
      sourceTrace: {
        sourceAnchor: sourceSignal,
        sourceFields,
        evidenceRequirement,
        compilerReason,
        localConfirmationCue,
        assumptionRefs: relatedAssumptions.map((row) => `${row.id}:${row.category}`),
      },
    };
  });
  const traceableRows = lessonRows.filter(
    (row) =>
      row.sourceTrace?.sourceAnchor &&
      row.sourceTrace?.sourceFields?.length > 0 &&
      row.sourceTrace?.evidenceRequirement &&
      row.sourceTrace?.compilerReason &&
      row.sourceTrace?.localConfirmationCue &&
      row.answerabilityStatus !== 'not-answerable',
  ).length;
  const localConfirmationRows = lessonRows.filter(
    (row) => row.answerabilityStatus === 'answerable-with-source-review',
  ).length;
  const untraceableRows = lessonRows.length - traceableRows;

  return {
    version: 1,
    status,
    audience: 'instructor-review-before-package-expansion',
    summary: `${courseName}: ${courseArc?.throughline || 'Review the course arc before publishing.'}`,
    humanReadablePolicy:
      'Use this review surface to inspect the compact blueprint before trusting the compiler-expanded package.',
    compressionClaim: `The blueprint compresses ${(lessons || []).length} lesson row(s) into course arc, modality, learner context, assessment architecture, source risk, compiler decisions, and package coherence signals.`,
    courseDecode: {
      modality: courseModalityProfile?.primaryMode || 'unknown',
      learnerRole: learnerContextProfile?.learnerRole || '',
      evidenceNoun: learnerContextProfile?.evidenceNoun || '',
      decisionNoun: learnerContextProfile?.decisionNoun || '',
      signaturePractice: courseModalityProfile?.teachingPattern?.signaturePractice || '',
      artifactEnvironment: courseModalityProfile?.artifactEnvironment || '',
    },
    instructionalMoveDecode,
    localConfirmationSummary: {
      localConfirmationCount,
      sourceReviewRequiredCount,
      sourceConflictLessonCount: conflictCount,
      assessmentWeightReviewRequiredCount: Number(assessmentArchitecture?.weightReviewRequiredCount || 0),
      publishBoundary:
        'Official dates, institution policies, source permissions, accessibility accommodations, and instructor grading decisions still require local confirmation.',
    },
    reviewerChecklist: [
      'Confirm the course modality and learner role match the actual classroom.',
      'Check each lesson row against the original source map for topic, assessment, and activity identity.',
      'Confirm the reusable teaching moves fit the actual class meeting pattern before trusting expanded lesson plans or slides.',
      'Confirm source-risk and conflict rows before exporting classroom-facing files.',
      'Confirm grading weights and local policy language before publishing.',
    ],
    machineDecodeCompleteness: {
      lessonRows: lessonRows.length,
      assessmentRows: Array.isArray(assessments) ? assessments.length : 0,
      compilerDecisionRows: Number(compilerDecisionMatrix?.lessonRows?.length || 0),
      sourceRiskRows: Number(sourceRiskRegister?.lessonRows?.length || 0),
      assumptionRows: Number(blueprintAssumptionLedger?.rowCount || 0),
      coherenceRows: Number(packageCoherenceMatrix?.lessonRows?.length || 0),
      checkedArtifacts: Number(packageCoherenceMatrix?.checkedArtifacts?.length || 0),
    },
    traceabilitySummary: {
      status: untraceableRows === 0 ? 'traceable' : 'needs-review',
      traceableRows,
      localConfirmationRows,
      untraceableRows,
      instructionalMoveRows: lessonRows.filter(
        (row) =>
          row.teachingMoveTrace?.openingMove &&
          row.teachingMoveTrace?.practiceMove &&
          row.teachingMoveTrace?.feedbackMove &&
          row.teachingMoveTrace?.assessmentMove &&
          row.teachingMoveTrace?.reviewMove,
      ).length,
      answerabilityPolicy:
        'Every reviewer question must be answerable from source anchors, source-field provenance, evidence requirements, compiler decisions, and local-confirmation cues.',
      instructionalMovePolicy:
        'Every lesson row must expose the opening, practice, feedback, assessment, and review moves the compiler will reuse downstream.',
    },
    lessonRows,
  };
}

function buildCourseAlignmentMatrix(lessons, assessments) {
  return lessons.map((lesson) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[0] || {};
    const rubricCriteria = Array.isArray(assessment.criteria) ? assessment.criteria : [];
    const successCriteria = Array.isArray(lesson.successCriteria) ? lesson.successCriteria : [];
    const aligned =
      lesson.outcomes.length > 0 &&
      Boolean(lesson.activityPattern) &&
      Boolean(lesson.studentArtifact) &&
      rubricCriteria.length >= 4 &&
      successCriteria.length >= 3 &&
      Boolean(lesson.evidencePlan?.evidenceRequirement) &&
      Array.isArray(lesson.sourceEvidenceTrace?.sourceFields) &&
      lesson.sourceEvidenceTrace.sourceFields.length >= 6 &&
      Boolean(lesson.sourceUsePlan?.noInventedSources) &&
      Boolean(lesson.compilerDecision?.generationPath) &&
      Boolean(lesson.compilerDecision?.publishGate) &&
      Boolean(lesson.compilerDecision?.modelUsePolicy) &&
      Boolean(lesson.modelContrast?.contrastQuestion) &&
      Boolean(lesson.readinessSupport?.supportMove) &&
      Boolean(lesson.instructionalRationale?.assessmentRationale) &&
      Boolean(lesson.accessibilityPlan?.participationProtocol) &&
      Boolean(lesson.feedbackCycle?.studentRevisionAction) &&
      Boolean(lesson.prerequisitePlan?.diagnosticCheck) &&
      Boolean(lesson.learningTransferPlan?.transferTask) &&
      Boolean(lesson.conceptDependencyPlan?.node?.concept) &&
      Boolean(lesson.practiceProgressionPlan?.practiceFocus) &&
      Boolean(lesson.practiceProgressionPlan?.transferTask) &&
      lesson.objectiveEvidencePlan?.status === 'complete' &&
      Array.isArray(lesson.objectiveEvidencePlan?.objectiveRows) &&
      lesson.objectiveEvidencePlan.objectiveRows.length >= lesson.outcomes.length &&
      Boolean(lesson.masteryEvidencePlan?.diagnosticEvidence) &&
      Boolean(lesson.masteryEvidencePlan?.guidedPracticeEvidence) &&
      Boolean(lesson.masteryEvidencePlan?.independentPerformanceEvidence) &&
      Boolean(lesson.masteryEvidencePlan?.feedbackRevisionEvidence) &&
      Boolean(lesson.masteryEvidencePlan?.transferEvidence) &&
      Boolean(lesson.masteryEvidencePlan?.masteryThreshold) &&
      Boolean(lesson.evidenceResponsePlan?.readyMove) &&
      Boolean(lesson.evidenceResponsePlan?.partialMove) &&
      Boolean(lesson.evidenceResponsePlan?.supportMove) &&
      Boolean(lesson.evidenceResponsePlan?.recheckCue) &&
      Boolean(lesson.modalityCue) &&
      Boolean(lesson.modalityDecode?.signaturePractice) &&
      Boolean(lesson.artifactGenre?.genre) &&
      Boolean(lesson.artifactGenre?.evidenceRequirement) &&
      lesson.classSessionPlan?.feasibilityStatus === 'fits-session' &&
      Boolean(lesson.teachingIntent?.teachingGoal) &&
      Boolean(lesson.teachingIntent?.feedbackDecision) &&
      Boolean(assessment.role) &&
      Number.isFinite(assessment.weightPercent) &&
      Boolean(assessment.cadence?.feedbackWindow) &&
      Boolean(assessment.revisionUse) &&
      Boolean(assessment.calibrationPlan?.biasCheck) &&
      Boolean(assessment.criterionEvidenceMap?.[0]?.evidenceNeeded) &&
      Array.isArray(assessment.criterionWeightPlan) &&
      assessment.criterionWeightPlan.length >= rubricCriteria.length &&
      assessment.criterionWeightPlan.reduce((sum, entry) => sum + Number(entry.weight || 0), 0) === 100 &&
      Array.isArray(assessment.criterionObjectiveAlignment) &&
      assessment.criterionObjectiveAlignment.length >= rubricCriteria.length &&
      assessment.criterionObjectiveAlignment.every(
        (entry) => entry?.objective && entry.strategy && entry.strategy !== 'index-rotation',
      ) &&
      Boolean(assessment.anchorExampleSet?.strongSample) &&
      Boolean(assessment.feedbackUse);

    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      objectives: lesson.outcomes,
      inClassPractice: lesson.activityPattern,
      assessmentArtifact: lesson.studentArtifact,
      rubricCriteria,
      successCriteria,
      evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
      sourceEvidenceCue:
        lesson.sourceEvidenceTrace?.sourceFields?.map((field) => `${field.field}: ${field.source}`).join('; ') || '',
      sourceConflictCue:
        lesson.sourceConflict?.status && lesson.sourceConflict.status !== 'clear'
          ? lesson.sourceConflict.issue || lesson.sourceConflict.reviewerAction || lesson.sourceConflict.status
          : 'clear',
      sourceRiskLevel: lesson.sourceRisk?.riskLevel || 'none',
      compilerDecisionCue: lesson.compilerDecision?.generationPath || '',
      publishGate: lesson.compilerDecision?.publishGate || '',
      sourceUseCue: lesson.sourceUsePlan?.noInventedSources || '',
      prerequisiteCue: lesson.prerequisitePlan?.diagnosticCheck || '',
      conceptDependencyCue: lesson.conceptDependencyPlan?.dependencyCue || '',
      conceptTransferCue: lesson.conceptDependencyPlan?.transferCue || '',
      practiceProgressionCue: lesson.practiceProgressionPlan?.practiceFocus || '',
      practiceProgressionTransferCue: lesson.practiceProgressionPlan?.transferTask || '',
      objectiveEvidenceCue:
        lesson.objectiveEvidencePlan?.objectiveRows
          ?.map((entry) => `${entry.objective}: ${entry.practiceEvidence}; ${entry.assessmentEvidence}`)
          .join('; ') || '',
      masteryDiagnosticCue: lesson.masteryEvidencePlan?.diagnosticEvidence || '',
      masteryGuidedPracticeCue: lesson.masteryEvidencePlan?.guidedPracticeEvidence || '',
      masteryPerformanceCue: lesson.masteryEvidencePlan?.independentPerformanceEvidence || '',
      masteryRevisionCue: lesson.masteryEvidencePlan?.feedbackRevisionEvidence || '',
      masteryTransferCue: lesson.masteryEvidencePlan?.transferEvidence || '',
      masteryThresholdCue: lesson.masteryEvidencePlan?.masteryThreshold || '',
      evidenceReadyResponseCue: lesson.evidenceResponsePlan?.readyMove || '',
      evidencePartialResponseCue: lesson.evidenceResponsePlan?.partialMove || '',
      evidenceSupportResponseCue: lesson.evidenceResponsePlan?.supportMove || '',
      evidenceRecheckCue: lesson.evidenceResponsePlan?.recheckCue || '',
      modalityCue: lesson.modalityCue || '',
      modalityDecodeCue: lesson.modalityDecode?.signaturePractice || '',
      artifactGenreCue: lesson.artifactGenre?.genre || '',
      artifactGenreOutputFormat: lesson.artifactGenre?.outputFormat || '',
      artifactGenreEvidenceRequirement: lesson.artifactGenre?.evidenceRequirement || '',
      classSessionCue:
        lesson.classSessionPlan?.feasibilityStatus === 'fits-session'
          ? `${lesson.classSessionPlan.plannedClassMinutes}/${lesson.classSessionPlan.sessionMinutes} minutes planned`
          : '',
      assessmentRoleCue: assessment.roleLabel || assessment.role || '',
      assessmentCadenceCue:
        [assessment.weight, assessment.cadence?.feedbackWindow, assessment.revisionUse].filter(Boolean).join('; ') ||
        '',
      criterionWeightCue:
        (assessment.criterionWeightPlan || [])
          .map((entry) => `${entry.priority || entry.criterion}: ${entry.weight}%`)
          .join('; ') || '',
      criterionObjectiveCue:
        (assessment.criterionObjectiveAlignment || [])
          .map((entry) => `${entry.criterion}: ${entry.objective}`)
          .join('; ') || '',
      teachingIntentCue: lesson.teachingIntent?.teachingGoal || '',
      feedbackUse: assessment.feedbackUse || lesson.feedbackMoment,
      misconceptionCheck: lesson.misconceptionMap?.[0]?.check || '',
      modelContrastCue: lesson.modelContrast?.contrastQuestion || '',
      readinessSupportCue: lesson.readinessSupport?.supportMove || '',
      instructionalRationaleCue: lesson.instructionalRationale?.assessmentRationale || '',
      accessibilityCue: lesson.accessibilityPlan?.participationProtocol || '',
      feedbackCycleCue: `${stripTerminalPunctuation(lesson.studentArtifact)} revision uses evidence-backed ${primaryConceptForLesson(lesson)} reasoning after feedback.`,
      learningTransferCue: lesson.learningTransferPlan?.transferTask || '',
      gradingCalibrationCue: assessment.calibrationPlan?.biasCheck || '',
      criterionEvidenceCue: assessment.criterionEvidenceMap?.[0]?.evidenceNeeded || '',
      anchorExampleCue: assessment.anchorExampleSet?.strongSample || '',
      localReviewNeeded: lesson.missingSignals || [],
      alignmentStatus: aligned ? 'aligned' : 'needs-review',
      alignmentRationale: aligned
        ? `Objectives, practice, assessment role/cadence, criteria, criterion weights, criterion-objective alignment, source evidence, compiler decision, source-use rules, criterion evidence, prerequisite readiness, concept dependencies, practice progression, mastery evidence, evidence-response decisions, modality fit, modality teaching pattern, artifact genre, class-session timing, teaching intent, feedback, revision, retrieval, transfer, misconception checks, exemplar contrast, readiness support, accessibility, design rationale, and grading calibration all point to ${stripTerminalPunctuation(lesson.studentArtifact)}.`
        : `Review ${lesson.title} because one or more alignment signals is missing or inferred.`,
    };
  });
}

function normalizeObjectiveKey(value) {
  return normalizeObjectiveText(value).toLowerCase();
}

function objectiveOverlapScore(left, right) {
  const leftTokens = alignmentTokens(left);
  const rightTokens = alignmentTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const rightSet = new Set(rightTokens);
  return leftTokens.filter((token) => rightSet.has(token)).length;
}

function objectiveRowsForAssessment(assessment = {}, objective = '', index = 0) {
  const objectiveKey = normalizeObjectiveKey(objective);
  const alignments = Array.isArray(assessment.criterionObjectiveAlignment)
    ? assessment.criterionObjectiveAlignment
    : [];
  const exactMatches = alignments.filter((entry) => normalizeObjectiveKey(entry?.objective) === objectiveKey);
  if (exactMatches.length > 0) return exactMatches;

  const scoredMatches = alignments
    .map((entry) => ({
      entry,
      score: objectiveOverlapScore(objective, [entry?.objective, entry?.criterion, entry?.rationale].join(' ')),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  if (scoredMatches.length > 0) return scoredMatches.slice(0, 2).map((item) => item.entry);

  const criteria = Array.isArray(assessment.criteria) ? assessment.criteria : [];
  const fallbackCriterion =
    criteria[index % Math.max(1, criteria.length)] || assessment.title || 'assessment criterion';
  return [
    {
      criterion: fallbackCriterion,
      objective,
      strategy: 'artifact-level-objective-coverage',
      rationale:
        'No direct criterion-objective wording match was available, so the objective is covered through the lesson artifact criterion and marked for local review.',
    },
  ];
}

function buildLessonObjectiveEvidencePlan({ lesson = {}, assessment = {} }) {
  const objectives =
    Array.isArray(lesson.outcomes) && lesson.outcomes.length > 0
      ? lesson.outcomes.map((objective) => cleanText(objective)).filter(Boolean)
      : [objectiveForLesson(lesson.title, lesson.keyConcepts || [])];
  const quizPlan = buildQuizQuestionPlan({ lesson, assessment, targetCount: 6 });
  const objectiveAnchor =
    (lesson.sourceAnchors || []).find((anchor) => /objective/i.test(anchor?.field || '')) ||
    (lesson.sourceAnchors || [])[0] ||
    null;
  const objectiveRows = objectives.map((objective, index) => {
    const criterionRows = objectiveRowsForAssessment(assessment, objective, index);
    const objectiveKey = normalizeObjectiveKey(objective);
    const quizRows = quizPlan.filter((entry) => normalizeObjectiveKey(entry.objective) === objectiveKey);
    const practiceEvidence =
      lesson.teachingIntent?.guidedPracticeMove ||
      lesson.practiceProgressionPlan?.practiceFocus ||
      lesson.activityPattern ||
      '';
    const assessmentEvidence =
      assessment.artifact || lesson.studentArtifact || lesson.masteryEvidencePlan?.independentPerformanceEvidence || '';
    const feedbackEvidence =
      lesson.feedbackCycle?.feedbackMethod || assessment.feedbackCycle?.feedbackMethod || assessment.feedbackUse || '';
    const revisionEvidence =
      lesson.feedbackCycle?.studentRevisionAction ||
      assessment.feedbackCycle?.studentRevisionAction ||
      assessment.revisionUse ||
      '';
    const rowStatus =
      objective &&
      practiceEvidence &&
      assessmentEvidence &&
      criterionRows.length > 0 &&
      quizRows.length > 0 &&
      feedbackEvidence &&
      revisionEvidence
        ? 'complete'
        : 'needs-review';
    return {
      objectiveIndex: index + 1,
      objective,
      bloomLevel: inferBloomLevelFromSignals([{ source: 'objective', text: objective }]).level,
      sourceAnchor: objectiveAnchor?.source || '',
      sourceAnchorConfidence: objectiveAnchor?.confidence || lesson.confidence?.level || '',
      practiceEvidence,
      assessmentEvidence,
      rubricCriteria: criterionRows.map((entry) => entry.criterion).filter(Boolean),
      criterionObjectiveStrategies: unique(criterionRows.map((entry) => entry.strategy).filter(Boolean), 4),
      quizQuestionRoles: quizRows.map((entry) => entry.role),
      quizQuestionBlooms: quizRows.map((entry) => entry.bloom),
      feedbackEvidence,
      revisionEvidence,
      reviewerQuestion: `Can a reviewer point to where students practice, submit, receive feedback on, and are checked on "${objective}"?`,
      status: rowStatus,
    };
  });
  return {
    version: 1,
    status: objectiveRows.every((row) => row.status === 'complete') ? 'complete' : 'needs-review',
    policy:
      'Each objective must have visible practice evidence, an assessment artifact, rubric evidence, quiz/check evidence, feedback, and a revision use before the lesson is classroom-ready.',
    objectiveCount: objectiveRows.length,
    missingEvidenceCount: objectiveRows.filter((row) => row.status !== 'complete').length,
    objectiveRows,
  };
}

function attachObjectiveEvidenceToLessons(lessons, assessments) {
  return lessons.map((lesson, index) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[index] || {};
    return {
      ...lesson,
      objectiveEvidencePlan: buildLessonObjectiveEvidencePlan({ lesson, assessment }),
    };
  });
}

function buildObjectiveEvidenceMap({ lessons = [], assessments = [] }) {
  const lessonRows = lessons.map((lesson, index) => {
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[index] || {};
    const objectivePlan = lesson.objectiveEvidencePlan || buildLessonObjectiveEvidencePlan({ lesson, assessment });
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      assessmentTitle: assessment.title || '',
      artifact: assessment.artifact || lesson.studentArtifact || '',
      objectiveCount: objectivePlan.objectiveCount || 0,
      missingEvidenceCount: objectivePlan.missingEvidenceCount || 0,
      objectiveRows: clonePlain(objectivePlan.objectiveRows || []),
      status: objectivePlan.status || 'needs-review',
    };
  });
  const totalObjectiveRows = lessonRows.reduce((sum, row) => sum + Number(row.objectiveCount || 0), 0);
  const missingEvidenceCount = lessonRows.reduce((sum, row) => sum + Number(row.missingEvidenceCount || 0), 0);
  return {
    version: 1,
    status: missingEvidenceCount === 0 && lessonRows.length === lessons.length ? 'complete' : 'needs-review',
    policy:
      'Objective coverage is checked at the blueprint layer before expansion: every objective needs practice, assessment, rubric, quiz/check, feedback, and revision evidence.',
    lessonRows,
    totalObjectiveRows,
    missingEvidenceCount,
    checkedEvidenceTypes: ['practice', 'assessment', 'rubric', 'quiz-check', 'feedback', 'revision'],
  };
}

function objectiveEvidenceChecklist(plan = {}) {
  return (plan.objectiveRows || []).map((row) => ({
    objective: row.objective,
    practice: row.practiceEvidence,
    assessment: row.assessmentEvidence,
    rubricCriteria: row.rubricCriteria || [],
    quizChecks: row.quizQuestionRoles || [],
    feedback: row.feedbackEvidence,
    revision: row.revisionEvidence,
    status: row.status,
  }));
}

function buildBlueprintQualitySignals(lessons) {
  const averageConfidenceScore = lessons.length
    ? Number(
        (
          lessons.reduce((sum, lesson) => sum + (lesson.confidence?.score || 0), 0) / Math.max(1, lessons.length)
        ).toFixed(2),
      )
    : 0;
  const reviewFlags = lessons.flatMap((lesson) =>
    (lesson.missingSignals || []).map((signal) => `Lesson ${lesson.lessonNumber}: ${signal}`),
  );
  return {
    averageConfidenceScore,
    confidenceLevel: confidenceLevel(averageConfidenceScore),
    sourceGroundedLessonCount: lessons.filter(
      (lesson) => lesson.confidence?.level === 'high' && (lesson.missingSignals || []).length === 0,
    ).length,
    reviewFlagCount: reviewFlags.length,
    reviewFlags: reviewFlags.slice(0, 12),
  };
}

function makeContractFinding(severity, code, message, lessonNumber = null) {
  return {
    severity,
    code,
    message,
    ...(lessonNumber ? { lessonNumber } : {}),
  };
}

function contractStatus(findings) {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'blocked';
  if (findings.some((finding) => finding.severity === 'warning')) return 'warnings';
  return 'pass';
}

function lessonContractNumber(lesson = {}) {
  return lesson.lessonNumber || (Number.isFinite(lesson.lessonIndex) ? lesson.lessonIndex + 1 : null);
}

function findAssessmentForLesson(assessments = [], lesson = {}, index = 0) {
  return (
    assessments.find((assessment) => (assessment.lessonNumbers || []).includes(lesson.lessonNumber)) ||
    assessments[index] ||
    null
  );
}

export function validateBlueprintSemanticContract(blueprint = {}) {
  const findings = [];
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  const assessments = Array.isArray(blueprint.assessments) ? blueprint.assessments : [];
  const expectedLessonCount = Number.isFinite(Number(blueprint.totalLessons))
    ? Number(blueprint.totalLessons)
    : lessons.length;

  if (!cleanText(blueprint.courseName)) {
    findings.push(makeContractFinding('blocker', 'courseName', 'Blueprint is missing a course name.'));
  }
  if (lessons.length === 0) {
    findings.push(makeContractFinding('blocker', 'lessonCoverage', 'Blueprint has no lessons.'));
  }
  if (expectedLessonCount !== lessons.length) {
    findings.push(
      makeContractFinding(
        'blocker',
        'lessonCoverage',
        `Blueprint totalLessons is ${expectedLessonCount}, but ${lessons.length} lesson(s) are present.`,
      ),
    );
  }
  if (assessments.length === 0) {
    findings.push(makeContractFinding('blocker', 'assessmentCoverage', 'Blueprint has no assessment anchors.'));
  }

  lessons.forEach((lesson, index) => {
    const lessonNumber = lessonContractNumber(lesson);
    const sourceFields = Array.isArray(lesson.sourceEvidenceTrace?.sourceFields)
      ? lesson.sourceEvidenceTrace.sourceFields
      : [];
    const sourceAnchors = Array.isArray(lesson.sourceAnchors) ? lesson.sourceAnchors : [];
    const assessment = findAssessmentForLesson(assessments, lesson, index);

    if (!lesson.id || !lessonNumber || !cleanText(lesson.title)) {
      findings.push(
        makeContractFinding('blocker', 'lessonIdentity', 'Lesson is missing id, number, or title.', lessonNumber),
      );
    }
    if (!Array.isArray(lesson.outcomes) || lesson.outcomes.length === 0) {
      findings.push(makeContractFinding('blocker', 'outcomes', 'Lesson is missing learning outcomes.', lessonNumber));
    }
    if (!Array.isArray(lesson.keyConcepts) || lesson.keyConcepts.length === 0) {
      findings.push(
        makeContractFinding('blocker', 'keyConcepts', 'Lesson is missing source-grounded concepts.', lessonNumber),
      );
    }
    if (!cleanText(lesson.studentArtifact)) {
      findings.push(
        makeContractFinding(
          'blocker',
          'studentArtifact',
          'Lesson is missing the student-facing artifact.',
          lessonNumber,
        ),
      );
    }
    if (!Array.isArray(lesson.successCriteria) || lesson.successCriteria.length < 2) {
      findings.push(
        makeContractFinding('blocker', 'successCriteria', 'Lesson is missing success criteria.', lessonNumber),
      );
    }
    if (!lesson.confidence?.level || !Number.isFinite(lesson.confidence?.score)) {
      findings.push(makeContractFinding('blocker', 'confidence', 'Lesson is missing source confidence.', lessonNumber));
    }
    if (
      sourceAnchors.length === 0 ||
      sourceFields.length < 4 ||
      !lesson.sourceEvidenceTrace?.sourceRowLabel ||
      !lesson.sourceEvidenceTrace?.unsupportedInferencePolicy ||
      sourceFields.some((field) => !field?.field || !field.sourceColumn || !field.source || !field.compiledValue)
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'sourceTrace',
          'Lesson is missing inspectable source anchors and field-level provenance.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.evidencePlan?.sourceCue ||
      !lesson.evidencePlan?.evidenceRequirement ||
      !lesson.evidencePlan?.limitationCue
    ) {
      findings.push(makeContractFinding('blocker', 'evidencePlan', 'Lesson is missing evidence plan.', lessonNumber));
    }
    if (
      !Array.isArray(lesson.sourceUsePlan?.approvedSources) ||
      lesson.sourceUsePlan.approvedSources.length === 0 ||
      !lesson.sourceUsePlan?.citationExpectation ||
      !lesson.sourceUsePlan?.noInventedSources ||
      !lesson.sourceUsePlan?.localReplacementCue ||
      !lesson.sourceUsePlan?.copyrightReviewCue
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'sourceUsePlan',
          'Lesson is missing source-use, citation, and no-invention boundaries.',
          lessonNumber,
        ),
      );
    }
    if (lesson.compilerDecision && !isUsableLessonCompilerDecision(lesson.compilerDecision)) {
      findings.push(
        makeContractFinding(
          'warning',
          'compilerDecision',
          'Stored compiler decision is incomplete; the compiler will rebuild it during hydration.',
          lessonNumber,
        ),
      );
    }
    if (!assessment) {
      findings.push(
        makeContractFinding(
          'blocker',
          'assessmentCoverage',
          'Lesson has no assessment anchor for downstream assignments and rubrics.',
          lessonNumber,
        ),
      );
    } else if (!cleanText(assessment.artifact || lesson.studentArtifact)) {
      findings.push(
        makeContractFinding('blocker', 'assessmentAnchor', 'Assessment anchor is missing an artifact.', lessonNumber),
      );
    } else if (!Array.isArray(assessment.criteria) || assessment.criteria.length < 3) {
      findings.push(
        makeContractFinding(
          'warning',
          'assessmentCriteria',
          'Assessment anchor has sparse criteria; compiler will derive rubric structure from lesson criteria.',
          lessonNumber,
        ),
      );
    }
  });

  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  return {
    version: 1,
    contractType: 'semantic-blueprint',
    status: contractStatus(findings),
    blockerCount,
    warningCount,
    lessonCount: lessons.length,
    assessmentCount: assessments.length,
    minimumBlueprintFields: [
      'courseName',
      'lessons.id',
      'lessons.title',
      'lessons.outcomes',
      'lessons.keyConcepts',
      'lessons.studentArtifact',
      'lessons.successCriteria',
      'lessons.sourceEvidenceTrace',
      'lessons.sourceUsePlan',
      'lessons.evidencePlan',
      'assessments.artifact',
    ],
    compilerOwnedFields: [
      'courseArc',
      'conceptDependencyGraph',
      'masteryEvidenceMap',
      'evidenceResponseMap',
      'objectiveEvidenceMap',
      'courseWorkload',
      'assessmentArchitecture',
      'classroomHandoffPlan',
      'classroomDryRunPlan',
      'classroomEvidenceLoopPlan',
      'instructorFeedbackLoadPlan',
      'blueprintAssumptionLedger',
      'packageCoherenceMatrix',
      'blueprintReviewSurface',
      'compilerDecisionMatrix',
      'receipts',
    ],
    findings,
  };
}

export function validateCourseBlueprintContract(blueprint = {}) {
  const findings = [];
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  const assessments = Array.isArray(blueprint.assessments) ? blueprint.assessments : [];
  const alignmentMatrix = Array.isArray(blueprint.alignmentMatrix) ? blueprint.alignmentMatrix : [];
  const expectedLessonCount = Number(blueprint.totalLessons || lessons.length);

  if (!blueprint.courseName) {
    findings.push(makeContractFinding('blocker', 'courseName', 'Blueprint is missing a course name.'));
  }
  if (lessons.length === 0) {
    findings.push(makeContractFinding('blocker', 'lessonCoverage', 'Blueprint has no lessons.'));
  }
  if (expectedLessonCount !== lessons.length) {
    findings.push(
      makeContractFinding(
        'blocker',
        'lessonCoverage',
        `Blueprint totalLessons is ${expectedLessonCount}, but ${lessons.length} lesson(s) are present.`,
      ),
    );
  }
  if (!blueprint.courseArc?.throughline || !Array.isArray(blueprint.courseArc?.stages)) {
    findings.push(makeContractFinding('blocker', 'courseArc', 'Blueprint is missing course arc stages.'));
  }
  if (
    blueprint.conceptDependencyGraph?.status !== 'sequenced' ||
    !Array.isArray(blueprint.conceptDependencyGraph?.nodes) ||
    blueprint.conceptDependencyGraph.nodes.length !== lessons.length ||
    !Array.isArray(blueprint.conceptDependencyGraph?.practiceRows) ||
    blueprint.conceptDependencyGraph.practiceRows.length !== lessons.length ||
    (lessons.length > 1 &&
      (!Array.isArray(blueprint.conceptDependencyGraph?.edges) ||
        blueprint.conceptDependencyGraph.edges.length < lessons.length - 1)) ||
    !blueprint.conceptDependencyGraph?.conceptThread
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'conceptDependencyGraph',
        'Blueprint is missing concept dependency graph and practice progression evidence.',
      ),
    );
  }
  if (
    blueprint.masteryEvidenceMap?.status !== 'complete' ||
    !Array.isArray(blueprint.masteryEvidenceMap?.lessonRows) ||
    blueprint.masteryEvidenceMap.lessonRows.length !== lessons.length ||
    !Array.isArray(blueprint.masteryEvidenceMap?.checkedStages) ||
    blueprint.masteryEvidenceMap.checkedStages.length < 6 ||
    blueprint.masteryEvidenceMap.missingFieldCount !== 0
  ) {
    findings.push(
      makeContractFinding('blocker', 'masteryEvidenceMap', 'Blueprint is missing a complete mastery-evidence map.'),
    );
  }
  if (
    blueprint.evidenceResponseMap?.status !== 'complete' ||
    !Array.isArray(blueprint.evidenceResponseMap?.lessonRows) ||
    blueprint.evidenceResponseMap.lessonRows.length !== lessons.length ||
    !Array.isArray(blueprint.evidenceResponseMap?.checkedStates) ||
    blueprint.evidenceResponseMap.checkedStates.length < 3 ||
    blueprint.evidenceResponseMap.missingFieldCount !== 0
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'evidenceResponseMap',
        'Blueprint is missing a complete evidence-response decision map.',
      ),
    );
  }
  if (
    blueprint.objectiveEvidenceMap?.status !== 'complete' ||
    !Array.isArray(blueprint.objectiveEvidenceMap?.lessonRows) ||
    blueprint.objectiveEvidenceMap.lessonRows.length !== lessons.length ||
    !Array.isArray(blueprint.objectiveEvidenceMap?.checkedEvidenceTypes) ||
    blueprint.objectiveEvidenceMap.checkedEvidenceTypes.length < 6 ||
    blueprint.objectiveEvidenceMap.missingEvidenceCount !== 0 ||
    blueprint.objectiveEvidenceMap.totalObjectiveRows < lessons.length
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'objectiveEvidenceMap',
        'Blueprint is missing complete objective-level practice, assessment, rubric, quiz, feedback, and revision evidence.',
      ),
    );
  }
  if (
    !blueprint.courseWorkload?.averagePerLessonMinutes ||
    !blueprint.courseWorkload?.averagePlannedClassMinutes ||
    !blueprint.courseWorkload?.timingStatus ||
    !blueprint.courseWorkload?.workloadBalanceStatus ||
    !Array.isArray(blueprint.courseWorkload?.lessonRows) ||
    blueprint.courseWorkload.lessonRows.length !== lessons.length
  ) {
    findings.push(makeContractFinding('blocker', 'courseWorkload', 'Blueprint is missing course workload estimates.'));
  }
  if (
    !blueprint.learnerContextProfile?.learnerRole ||
    !blueprint.learnerContextProfile?.coursePerformanceRole ||
    !Array.isArray(blueprint.learnerContextProfile?.supportAssumptions) ||
    blueprint.learnerContextProfile.supportAssumptions.length === 0 ||
    !Array.isArray(blueprint.learnerContextProfile?.participationModes) ||
    blueprint.learnerContextProfile.participationModes.length === 0
  ) {
    findings.push(
      makeContractFinding('blocker', 'learnerContextProfile', 'Blueprint is missing learner-context assumptions.'),
    );
  }
  if (
    !blueprint.courseModalityProfile?.primaryMode ||
    !blueprint.courseModalityProfile?.sessionPattern ||
    !blueprint.courseModalityProfile?.interactionPattern ||
    !blueprint.courseModalityProfile?.artifactEnvironment ||
    !blueprint.courseModalityProfile?.teachingPattern?.signaturePractice ||
    !blueprint.courseModalityProfile?.teachingPattern?.evidenceRoutine ||
    !blueprint.courseModalityProfile?.teachingPattern?.feedbackRoutine ||
    !blueprint.courseModalityProfile?.teachingPattern?.instructorMove ||
    !Array.isArray(blueprint.courseModalityProfile?.participationDesign) ||
    blueprint.courseModalityProfile.participationDesign.length === 0
  ) {
    findings.push(
      makeContractFinding('blocker', 'courseModalityProfile', 'Blueprint is missing course modality fit evidence.'),
    );
  }
  if (
    !blueprint.classroomHandoffPlan?.status ||
    !Array.isArray(blueprint.classroomHandoffPlan?.reviewOrder) ||
    blueprint.classroomHandoffPlan.reviewOrder.length === 0 ||
    !Array.isArray(blueprint.classroomHandoffPlan?.requiredLocalConfirmations) ||
    blueprint.classroomHandoffPlan.requiredLocalConfirmations.length === 0 ||
    !Array.isArray(blueprint.classroomHandoffPlan?.lessonReviewOrder) ||
    blueprint.classroomHandoffPlan.lessonReviewOrder.length !== lessons.length ||
    !blueprint.classroomHandoffPlan?.publishBoundary
  ) {
    findings.push(
      makeContractFinding('blocker', 'classroomHandoffPlan', 'Blueprint is missing classroom handoff plan.'),
    );
  }
  if (
    !blueprint.classroomDryRunPlan?.status ||
    blueprint.classroomDryRunPlan?.source !== 'deterministic-classroom-dry-run-plan' ||
    !blueprint.classroomDryRunPlan?.rehearsalPolicy ||
    !blueprint.classroomDryRunPlan?.failureResponsePolicy ||
    !Array.isArray(blueprint.classroomDryRunPlan?.lessonRows) ||
    blueprint.classroomDryRunPlan.lessonRows.length !== lessons.length ||
    blueprint.classroomDryRunPlan.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.dryRunFocus ||
        !Array.isArray(row.setupChecks) ||
        row.setupChecks.length === 0 ||
        !row.firstTenMinutes ||
        !row.firstTenEvidence ||
        !row.evidenceCheckpoint ||
        !row.likelyFailureMode ||
        !row.instructorAdjustment ||
        !row.adjustmentTrigger ||
        !row.readyEvidence ||
        !row.timingCheck?.status ||
        !row.publishGate ||
        !row.reviewerAction,
    )
  ) {
    findings.push(
      makeContractFinding('blocker', 'classroomDryRunPlan', 'Blueprint is missing classroom dry-run plan.'),
    );
  }
  if (
    !blueprint.classroomEvidenceLoopPlan?.status ||
    blueprint.classroomEvidenceLoopPlan?.source !== 'deterministic-classroom-evidence-loop' ||
    !blueprint.classroomEvidenceLoopPlan?.evidencePolicy ||
    !blueprint.classroomEvidenceLoopPlan?.preferenceLearningPolicy ||
    !Array.isArray(blueprint.classroomEvidenceLoopPlan?.lessonRows) ||
    blueprint.classroomEvidenceLoopPlan.lessonRows.length !== lessons.length ||
    blueprint.classroomEvidenceLoopPlan.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.implementationFocus ||
        !Array.isArray(row.evidenceToCollect) ||
        row.evidenceToCollect.length === 0 ||
        !Array.isArray(row.duringClassSignals) ||
        row.duringClassSignals.length === 0 ||
        !row.studentWorkSampleCue ||
        !row.pacingSignal ||
        !row.misconceptionSignal ||
        !row.adjustmentDecision ||
        !row.nextLessonFeedForward ||
        !row.sourceUpdateCue ||
        !row.preferenceLearningSignal ||
        !row.readyForNextRunCriteria ||
        !row.reviewCadence ||
        !row.publishGate ||
        !row.reviewerAction,
    )
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'classroomEvidenceLoopPlan',
        'Blueprint is missing classroom implementation evidence loop.',
      ),
    );
  }
  if (
    !blueprint.instructorFeedbackLoadPlan?.status ||
    blueprint.instructorFeedbackLoadPlan?.source !== 'deterministic-instructor-feedback-load-plan' ||
    !blueprint.instructorFeedbackLoadPlan?.feedbackLoadPolicy ||
    !blueprint.instructorFeedbackLoadPlan?.calibrationPolicy ||
    !Number.isFinite(blueprint.instructorFeedbackLoadPlan?.totalEstimatedFeedbackMinutes) ||
    !Number.isFinite(blueprint.instructorFeedbackLoadPlan?.averageEstimatedFeedbackMinutes) ||
    !Array.isArray(blueprint.instructorFeedbackLoadPlan?.lessonRows) ||
    blueprint.instructorFeedbackLoadPlan.lessonRows.length !== lessons.length ||
    blueprint.instructorFeedbackLoadPlan.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.assessmentTitle ||
        !row.assessmentRole ||
        !row.gradingMode ||
        !row.feedbackWindow ||
        !Number.isFinite(row.estimatedFeedbackMinutes) ||
        !row.feedbackFocus ||
        !row.highestLeverageCriterion ||
        !row.calibrationCue ||
        !row.studentSelfCheck ||
        !row.batchingStrategy ||
        !row.reusableCommentCue ||
        !row.nextInstructionCue ||
        !row.loadRisk ||
        !row.publishGate ||
        !row.reviewerAction,
    )
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'instructorFeedbackLoadPlan',
        'Blueprint is missing instructor feedback-load plan.',
      ),
    );
  }
  if (
    !blueprint.sourceRiskRegister?.status ||
    !Array.isArray(blueprint.sourceRiskRegister?.lessonRows) ||
    blueprint.sourceRiskRegister.lessonRows.length !== lessons.length ||
    !Number.isFinite(blueprint.sourceRiskRegister?.highRiskCount) ||
    !Number.isFinite(blueprint.sourceRiskRegister?.mediumRiskCount) ||
    !blueprint.sourceRiskRegister?.riskPolicy ||
    blueprint.sourceRiskRegister.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.riskLevel ||
        !Array.isArray(row.reviewFocus) ||
        row.reviewFocus.length === 0,
    )
  ) {
    findings.push(makeContractFinding('blocker', 'sourceRiskRegister', 'Blueprint is missing source-risk register.'));
  }
  if (
    !blueprint.sourceConflictReport?.status ||
    !Array.isArray(blueprint.sourceConflictReport?.lessonRows) ||
    blueprint.sourceConflictReport.lessonRows.length !== lessons.length ||
    !Number.isFinite(blueprint.sourceConflictReport?.duplicateGroupCount) ||
    !Number.isFinite(blueprint.sourceConflictReport?.conflictingGroupCount) ||
    !Number.isFinite(blueprint.sourceConflictReport?.duplicateLessonCount) ||
    !blueprint.sourceConflictReport?.policy ||
    blueprint.sourceConflictReport.lessonRows.some(
      (row) => !row?.lessonNumber || !row.lessonTitle || !row.conflictStatus,
    )
  ) {
    findings.push(
      makeContractFinding('blocker', 'sourceConflictReport', 'Blueprint is missing source-conflict report.'),
    );
  }
  if (
    blueprint.sourceConflictReport?.duplicateLessonCount > 0 &&
    lessons.some((lesson) => {
      const row = blueprint.sourceConflictReport.lessonRows.find((item) => item.lessonNumber === lesson.lessonNumber);
      return row?.conflictStatus !== 'clear' && lesson.sourceConflict?.status !== row.conflictStatus;
    })
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'sourceConflictTrace',
        'Duplicate or conflicting source rows are not attached to the affected lessons.',
      ),
    );
  }
  if (
    !blueprint.compilerDecisionMatrix?.status ||
    blueprint.compilerDecisionMatrix?.deterministicCompiler !== true ||
    blueprint.compilerDecisionMatrix?.modelFallback !== 'not used for blueprint-compiled deliverables' ||
    !Array.isArray(blueprint.compilerDecisionMatrix?.lessonRows) ||
    blueprint.compilerDecisionMatrix.lessonRows.length !== lessons.length ||
    !Number.isFinite(blueprint.compilerDecisionMatrix?.reviewRequiredCount) ||
    !Number.isFinite(blueprint.compilerDecisionMatrix?.localRepairCount) ||
    blueprint.compilerDecisionMatrix.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.generationPath ||
        !row.publishGate ||
        !row.sourceRiskLevel ||
        !row.assessmentSource ||
        !Array.isArray(row.reviewFocus) ||
        row.reviewFocus.length === 0,
    )
  ) {
    findings.push(
      makeContractFinding('blocker', 'compilerDecisionMatrix', 'Blueprint is missing compiler decision matrix.'),
    );
  }
  if (
    blueprint.packageCoherenceMatrix?.status !== 'coherent' ||
    !Array.isArray(blueprint.packageCoherenceMatrix?.lessonRows) ||
    blueprint.packageCoherenceMatrix.lessonRows.length !== lessons.length ||
    !Array.isArray(blueprint.packageCoherenceMatrix?.checkedArtifacts) ||
    blueprint.packageCoherenceMatrix.checkedArtifacts.length < 9 ||
    blueprint.packageCoherenceMatrix.missingFieldCount !== 0
  ) {
    findings.push(
      makeContractFinding('blocker', 'packageCoherenceMatrix', 'Blueprint is missing package coherence matrix.'),
    );
  }
  if (
    !blueprint.blueprintReviewSurface?.status ||
    !blueprint.blueprintReviewSurface?.summary ||
    !blueprint.blueprintReviewSurface?.humanReadablePolicy ||
    !blueprint.blueprintReviewSurface?.courseDecode?.modality ||
    !blueprint.blueprintReviewSurface?.courseDecode?.learnerRole ||
    !blueprint.blueprintReviewSurface?.courseDecode?.signaturePractice ||
    blueprint.blueprintReviewSurface?.instructionalMoveDecode?.status !== 'reviewable' ||
    !blueprint.blueprintReviewSurface?.instructionalMoveDecode?.openingMove ||
    !blueprint.blueprintReviewSurface?.instructionalMoveDecode?.practiceMove ||
    !blueprint.blueprintReviewSurface?.instructionalMoveDecode?.feedbackMove ||
    !blueprint.blueprintReviewSurface?.instructionalMoveDecode?.assessmentMove ||
    !blueprint.blueprintReviewSurface?.instructionalMoveDecode?.reviewMove ||
    !blueprint.blueprintReviewSurface?.instructionalMoveDecode?.sourceGrounding ||
    !blueprint.blueprintReviewSurface?.instructionalMoveDecode?.reviewPolicy ||
    !Array.isArray(blueprint.blueprintReviewSurface?.reviewerChecklist) ||
    blueprint.blueprintReviewSurface.reviewerChecklist.length < 5 ||
    !Array.isArray(blueprint.blueprintReviewSurface?.lessonRows) ||
    blueprint.blueprintReviewSurface.lessonRows.length !== lessons.length ||
    blueprint.blueprintReviewSurface?.traceabilitySummary?.status !== 'traceable' ||
    blueprint.blueprintReviewSurface?.traceabilitySummary?.traceableRows !== lessons.length ||
    blueprint.blueprintReviewSurface?.traceabilitySummary?.untraceableRows !== 0 ||
    !blueprint.blueprintReviewSurface?.traceabilitySummary?.answerabilityPolicy ||
    blueprint.blueprintReviewSurface.lessonRows.some(
      (row) =>
        !row?.lessonNumber ||
        !row.lessonTitle ||
        !row.sourceConfidence ||
        !row.assessmentArtifact ||
        !row.artifactGenre ||
        !row.teachingGoal ||
        !row.modalityPractice ||
        !row.compilerDecision ||
        !row.publishGate ||
        !row.reviewState ||
        !row.reviewerQuestion ||
        !row.answerabilityStatus ||
        row.answerabilityStatus === 'not-answerable' ||
        !row.sourceTrace?.sourceAnchor ||
        !Array.isArray(row.sourceTrace?.sourceFields) ||
        row.sourceTrace.sourceFields.length === 0 ||
        !row.sourceTrace?.evidenceRequirement ||
        !row.sourceTrace?.compilerReason ||
        !row.sourceTrace?.localConfirmationCue ||
        !Array.isArray(row.sourceTrace?.assumptionRefs) ||
        row.sourceTrace.assumptionRefs.length === 0 ||
        !row.teachingMoveTrace?.openingMove ||
        !row.teachingMoveTrace?.practiceMove ||
        !row.teachingMoveTrace?.feedbackMove ||
        !row.teachingMoveTrace?.assessmentMove ||
        !row.teachingMoveTrace?.reviewMove ||
        !row.teachingMoveTrace?.sourceAnchor ||
        !row.teachingMoveTrace?.artifactCue ||
        !row.teachingMoveTrace?.modalityCue,
    ) ||
    blueprint.blueprintReviewSurface?.traceabilitySummary?.instructionalMoveRows !== lessons.length ||
    !blueprint.blueprintReviewSurface?.traceabilitySummary?.instructionalMovePolicy ||
    blueprint.blueprintReviewSurface?.machineDecodeCompleteness?.lessonRows !== lessons.length ||
    blueprint.blueprintReviewSurface?.machineDecodeCompleteness?.assessmentRows !== assessments.length ||
    !Number.isFinite(blueprint.blueprintReviewSurface?.machineDecodeCompleteness?.checkedArtifacts) ||
    blueprint.blueprintReviewSurface.machineDecodeCompleteness.checkedArtifacts < 9
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'blueprintReviewSurface',
        'Blueprint is missing a human-readable review surface for the compact decode.',
      ),
    );
  }
  if (
    !blueprint.blueprintAssumptionLedger?.status ||
    !Array.isArray(blueprint.blueprintAssumptionLedger?.rows) ||
    blueprint.blueprintAssumptionLedger.rows.length === 0 ||
    blueprint.blueprintAssumptionLedger.rowCount !== blueprint.blueprintAssumptionLedger.rows.length ||
    !Array.isArray(blueprint.blueprintAssumptionLedger?.categories) ||
    !blueprint.blueprintAssumptionLedger.categories.includes('handoff-boundary') ||
    !Number.isFinite(blueprint.blueprintAssumptionLedger?.reviewRequiredCount) ||
    !blueprint.blueprintAssumptionLedger?.reviewerPolicy ||
    blueprint.blueprintAssumptionLedger.rows.some(
      (row) =>
        !row?.id ||
        !row.category ||
        !row.assumption ||
        !row.evidence ||
        !row.source ||
        !row.confidence ||
        !Array.isArray(row.affectedArtifacts) ||
        row.affectedArtifacts.length === 0 ||
        !row.reviewerAction ||
        !row.resolutionStatus,
    )
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'blueprintAssumptionLedger',
        'Blueprint is missing a human-reviewable assumption ledger.',
      ),
    );
  }
  const assessmentArchitectureMissing =
    blueprint.assessmentArchitecture?.totalWeightPercent !== 100 ||
    !Array.isArray(blueprint.assessmentArchitecture?.lessonRows) ||
    blueprint.assessmentArchitecture.lessonRows.length !== lessons.length ||
    !Array.isArray(blueprint.assessmentArchitecture?.weightRows) ||
    blueprint.assessmentArchitecture.weightRows.length !== lessons.length ||
    !blueprint.assessmentArchitecture?.weightSourceStatus ||
    !Number.isFinite(blueprint.assessmentArchitecture?.explicitWeightCount) ||
    !Number.isFinite(blueprint.assessmentArchitecture?.compilerDistributedWeightCount) ||
    !Number.isFinite(blueprint.assessmentArchitecture?.weightReviewRequiredCount) ||
    !blueprint.assessmentArchitecture?.weightConfirmationPolicy ||
    !blueprint.assessmentArchitecture?.policy;
  if (assessmentArchitectureMissing) {
    findings.push(
      makeContractFinding('blocker', 'assessmentArchitecture', 'Blueprint is missing assessment architecture.'),
    );
  } else if (blueprint.assessmentArchitecture.status !== 'balanced') {
    findings.push(
      makeContractFinding(
        'warning',
        'assessmentArchitecture',
        'Assessment architecture is complete but needs instructor review before publishing.',
      ),
    );
  }
  if (
    !blueprint.qualitySignals?.confidenceLevel ||
    !Number.isFinite(blueprint.qualitySignals?.averageConfidenceScore)
  ) {
    findings.push(makeContractFinding('blocker', 'qualitySignals', 'Blueprint is missing quality signals.'));
  }

  for (const lesson of lessons) {
    const lessonNumber = lesson.lessonNumber || lesson.lessonIndex + 1 || null;
    if (!lesson.id || !lessonNumber || !lesson.title) {
      findings.push(
        makeContractFinding('blocker', 'lessonIdentity', 'Lesson is missing id, number, or title.', lessonNumber),
      );
    }
    if (!Array.isArray(lesson.outcomes) || lesson.outcomes.length === 0) {
      findings.push(makeContractFinding('blocker', 'outcomes', 'Lesson is missing outcomes.', lessonNumber));
    }
    if (!Array.isArray(lesson.keyConcepts) || lesson.keyConcepts.length === 0) {
      findings.push(makeContractFinding('blocker', 'keyConcepts', 'Lesson is missing key concepts.', lessonNumber));
    }
    if (!lesson.confidence?.level || !Number.isFinite(lesson.confidence?.score)) {
      findings.push(makeContractFinding('blocker', 'confidence', 'Lesson is missing source confidence.', lessonNumber));
    }
    if (!Array.isArray(lesson.sourceAnchors) || lesson.sourceAnchors.length < 4) {
      findings.push(makeContractFinding('blocker', 'sourceAnchors', 'Lesson needs source anchors.', lessonNumber));
    }
    if (
      lesson.compilerDecision?.source !== 'deterministic-compiler-decision' ||
      !lesson.compilerDecision?.generationPath ||
      !lesson.compilerDecision?.safePath ||
      !lesson.compilerDecision?.publishGate ||
      !lesson.compilerDecision?.modelUsePolicy ||
      !lesson.compilerDecision?.repairPolicy ||
      !lesson.compilerDecision?.reason ||
      !lesson.compilerDecision?.evidence?.sourceRiskLevel ||
      !lesson.compilerDecision?.evidence?.assessmentSource ||
      !Array.isArray(lesson.compilerDecision?.reviewFocus) ||
      lesson.compilerDecision.reviewFocus.length === 0
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'compilerDecision',
          'Lesson is missing deterministic compiler decision and publish gate.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.sourceEvidenceTrace?.sourceRowLabel ||
      !Array.isArray(lesson.sourceEvidenceTrace?.sourceFields) ||
      lesson.sourceEvidenceTrace.sourceFields.length < 6 ||
      !lesson.sourceEvidenceTrace?.unsupportedInferencePolicy ||
      lesson.sourceEvidenceTrace.sourceFields.some(
        (field) => !field?.field || !field.sourceColumn || !field.source || !field.compiledValue || !field.purpose,
      )
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'sourceEvidenceTrace',
          'Lesson is missing raw course-map provenance and compiler-use trace.',
          lessonNumber,
        ),
      );
    }
    if (
      Number(lesson.sourceEvidenceTrace?.sourceSectionCount || 0) > 1 &&
      (!Array.isArray(lesson.sourceEvidenceTrace?.sectionCoverage) ||
        lesson.sourceEvidenceTrace.sectionCoverage.length !== lesson.sourceEvidenceTrace.sourceSectionCount ||
        lesson.sourceEvidenceTrace.sectionCoverage.some(
          (section) =>
            !section?.sectionNumber ||
            !Array.isArray(section.sourceColumns) ||
            section.sourceColumns.length === 0 ||
            !Array.isArray(section.preservedSignals) ||
            section.preservedSignals.length === 0,
        ))
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'sectionCoverageTrace',
          'Multi-section lesson is missing inspectable section-by-section source coverage.',
          lessonNumber,
        ),
      );
    }
    if (!lesson.workloadEstimate?.totalStudentMinutes) {
      findings.push(makeContractFinding('blocker', 'workload', 'Lesson is missing workload estimates.', lessonNumber));
    }
    if (
      !lesson.classSessionPlan?.feasibilityStatus ||
      !lesson.classSessionPlan?.plannedClassMinutes ||
      !lesson.classSessionPlan?.sessionMinutes ||
      !Array.isArray(lesson.classSessionPlan?.segments) ||
      lesson.classSessionPlan.segments.length < 6 ||
      lesson.classSessionPlan.overageMinutes > 0
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'classSessionPlan',
          'Lesson is missing feasible class-session timing plan.',
          lessonNumber,
        ),
      );
    }
    if (!lesson.difficultyProfile?.cognitiveDemand || !lesson.difficultyProfile?.stage) {
      findings.push(
        makeContractFinding('blocker', 'difficulty', 'Lesson is missing difficulty profile.', lessonNumber),
      );
    }
    if (
      !lesson.bloomsLevel ||
      !lesson.bloomInference?.level ||
      lesson.bloomInference.level !== lesson.bloomsLevel ||
      !lesson.bloomInference?.source ||
      lesson.bloomInference.source === 'index-rotation'
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'bloomInference',
          'Lesson is missing source-text Bloom inference.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.evidencePlan?.sourceCue ||
      !lesson.evidencePlan?.evidenceRequirement ||
      !lesson.evidencePlan?.limitationCue
    ) {
      findings.push(makeContractFinding('blocker', 'evidencePlan', 'Lesson is missing evidence plan.', lessonNumber));
    }
    if (
      !Array.isArray(lesson.sourceUsePlan?.approvedSources) ||
      lesson.sourceUsePlan.approvedSources.length === 0 ||
      !lesson.sourceUsePlan?.citationExpectation ||
      !lesson.sourceUsePlan?.studentAttributionMove ||
      !lesson.sourceUsePlan?.noInventedSources ||
      !lesson.sourceUsePlan?.sourceEvaluationPrompt ||
      !lesson.sourceUsePlan?.localReplacementCue ||
      !lesson.sourceUsePlan?.copyrightReviewCue
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'sourceUsePlan',
          'Lesson is missing source-use and citation-integrity planning.',
          lessonNumber,
        ),
      );
    }
    if (!Array.isArray(lesson.misconceptionMap) || lesson.misconceptionMap.length < 2) {
      findings.push(
        makeContractFinding('blocker', 'misconceptionMap', 'Lesson is missing misconception mapping.', lessonNumber),
      );
    }
    if (
      !lesson.modelContrast?.exemplarMove ||
      !lesson.modelContrast?.nonExemplarMove ||
      !lesson.modelContrast?.transferPrompt
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'modelContrast',
          'Lesson is missing exemplar/non-exemplar contrast.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.readinessSupport?.diagnosticPrompt ||
      !lesson.readinessSupport?.supportMove ||
      !lesson.readinessSupport?.extensionMove
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'readinessSupport',
          'Lesson is missing diagnostic support and extension planning.',
          lessonNumber,
        ),
      );
    }
    if (
      !Array.isArray(lesson.prerequisitePlan?.assumedKnowledge) ||
      lesson.prerequisitePlan.assumedKnowledge.length === 0 ||
      !lesson.prerequisitePlan?.prerequisiteEvidence ||
      !lesson.prerequisitePlan?.diagnosticCheck ||
      !lesson.prerequisitePlan?.reteachMove ||
      !lesson.prerequisitePlan?.accelerationMove ||
      !lesson.prerequisitePlan?.localAssumptionReview
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'prerequisitePlan',
          'Lesson is missing prerequisite-readiness planning.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.conceptDependencyPlan?.node?.concept ||
      !Array.isArray(lesson.conceptDependencyPlan?.incomingEdges) ||
      !Array.isArray(lesson.conceptDependencyPlan?.outgoingEdges) ||
      !lesson.conceptDependencyPlan?.dependencyCue ||
      !lesson.conceptDependencyPlan?.transferCue ||
      !lesson.practiceProgressionPlan?.currentConcept ||
      !lesson.practiceProgressionPlan?.practiceFocus ||
      !lesson.practiceProgressionPlan?.evidenceRoutine ||
      !lesson.practiceProgressionPlan?.feedbackRoutine ||
      !lesson.practiceProgressionPlan?.transferTask
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'conceptDependencyPlan',
          'Lesson is missing concept dependency and practice progression planning.',
          lessonNumber,
        ),
      );
    }
    if (
      lesson.objectiveEvidencePlan?.status !== 'complete' ||
      !Array.isArray(lesson.objectiveEvidencePlan?.objectiveRows) ||
      lesson.objectiveEvidencePlan.objectiveRows.length < lesson.outcomes.length ||
      lesson.objectiveEvidencePlan.missingEvidenceCount !== 0 ||
      lesson.objectiveEvidencePlan.objectiveRows.some(
        (row) =>
          !row?.objective ||
          !row.practiceEvidence ||
          !row.assessmentEvidence ||
          !Array.isArray(row.rubricCriteria) ||
          row.rubricCriteria.length === 0 ||
          !Array.isArray(row.quizQuestionRoles) ||
          row.quizQuestionRoles.length === 0 ||
          !row.feedbackEvidence ||
          !row.revisionEvidence,
      )
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'objectiveEvidencePlan',
          'Lesson is missing objective-level practice, assessment, rubric, quiz/check, feedback, and revision evidence.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.masteryEvidencePlan?.diagnosticEvidence ||
      !lesson.masteryEvidencePlan?.guidedPracticeEvidence ||
      !lesson.masteryEvidencePlan?.independentPerformanceEvidence ||
      !lesson.masteryEvidencePlan?.feedbackRevisionEvidence ||
      !lesson.masteryEvidencePlan?.transferEvidence ||
      !lesson.masteryEvidencePlan?.misconceptionRepairEvidence ||
      !lesson.masteryEvidencePlan?.masteryThreshold ||
      !lesson.masteryEvidencePlan?.masteryDecision ||
      !Array.isArray(lesson.masteryEvidencePlan?.evidencePortfolio) ||
      lesson.masteryEvidencePlan.evidencePortfolio.length < 6
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'masteryEvidencePlan',
          'Lesson is missing diagnostic, practice, performance, revision, transfer, and misconception-repair mastery evidence.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.evidenceResponsePlan?.readySignal ||
      !lesson.evidenceResponsePlan?.partialSignal ||
      !lesson.evidenceResponsePlan?.supportSignal ||
      !lesson.evidenceResponsePlan?.readyMove ||
      !lesson.evidenceResponsePlan?.partialMove ||
      !lesson.evidenceResponsePlan?.supportMove ||
      !lesson.evidenceResponsePlan?.recheckCue ||
      !Array.isArray(lesson.evidenceResponsePlan?.decisionStates) ||
      lesson.evidenceResponsePlan.decisionStates.length < 3
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'evidenceResponsePlan',
          'Lesson is missing ready, partial, and needs-support evidence-response decisions.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.instructionalRationale?.sequenceRationale ||
      !lesson.instructionalRationale?.practiceRationale ||
      !lesson.instructionalRationale?.assessmentRationale ||
      !lesson.instructionalRationale?.reviewCue
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'instructionalRationale',
          'Lesson is missing instructional design rationale.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.accessibilityPlan?.representation ||
      !lesson.accessibilityPlan?.engagement ||
      !lesson.accessibilityPlan?.expression ||
      !lesson.accessibilityPlan?.participationProtocol ||
      !lesson.accessibilityPlan?.accommodationReviewCue
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'accessibilityPlan',
          'Lesson is missing accessibility and participation planning.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.feedbackCycle?.formativeEvidence ||
      !lesson.feedbackCycle?.feedbackMethod ||
      !lesson.feedbackCycle?.studentRevisionAction ||
      !lesson.feedbackCycle?.nextUse ||
      !lesson.feedbackCycle?.closureCheck
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'feedbackCycle',
          'Lesson is missing structured feedback and revision cycle.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.learningTransferPlan?.retrievalCue ||
      !lesson.learningTransferPlan?.spacedPracticeCue ||
      !lesson.learningTransferPlan?.transferTask ||
      !lesson.learningTransferPlan?.cumulativeConnection ||
      !lesson.learningTransferPlan?.metacognitivePrompt
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'learningTransferPlan',
          'Lesson is missing retrieval and transfer planning.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.teachingIntent?.teachingGoal ||
      !lesson.teachingIntent?.diagnosticMove ||
      !lesson.teachingIntent?.modelingMove ||
      !lesson.teachingIntent?.guidedPracticeMove ||
      !lesson.teachingIntent?.evidenceOfLearning ||
      !lesson.teachingIntent?.feedbackDecision ||
      !lesson.teachingIntent?.studentRevisionMove ||
      !lesson.teachingIntent?.transferMove ||
      !lesson.teachingIntent?.localReviewQuestion
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'teachingIntent',
          'Lesson is missing explicit teaching-intent sequencing.',
          lessonNumber,
        ),
      );
    }
    if (!lesson.pacing?.bridgeFrom || !lesson.pacing?.bridgeTo) {
      findings.push(makeContractFinding('blocker', 'pacing', 'Lesson is missing pacing bridges.', lessonNumber));
    }
    if (!lesson.learnerContextCue) {
      findings.push(
        makeContractFinding('blocker', 'learnerContextCue', 'Lesson is missing learner-context trace.', lessonNumber),
      );
    }
    if (!lesson.modalityCue) {
      findings.push(
        makeContractFinding('blocker', 'modalityCue', 'Lesson is missing course-modality trace.', lessonNumber),
      );
    }
    if (
      !lesson.modalityDecode?.signaturePractice ||
      !lesson.modalityDecode?.evidenceRoutine ||
      !lesson.modalityDecode?.feedbackRoutine ||
      !lesson.modalityDecode?.instructorMove ||
      !lesson.modalityDecode?.artifactCheck
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'modalityDecode',
          'Lesson is missing course-modality teaching decode.',
          lessonNumber,
        ),
      );
    }
    if (
      !lesson.artifactGenre?.genre ||
      !lesson.artifactGenre?.outputFormat ||
      !lesson.artifactGenre?.evidenceRequirement ||
      !lesson.artifactGenre?.qualityFocus ||
      !lesson.artifactGenre?.reviewProtocol ||
      !lesson.artifactGenre?.commonFailure ||
      !lesson.artifactGenre?.revisionMove
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'artifactGenre',
          'Lesson is missing student-artifact genre decode.',
          lessonNumber,
        ),
      );
    }
  }

  if (assessments.length !== lessons.length) {
    findings.push(
      makeContractFinding(
        'blocker',
        'assessmentCoverage',
        `Expected ${lessons.length} assessment anchor(s), found ${assessments.length}.`,
      ),
    );
  }
  for (const lesson of lessons) {
    const matchedAssessment = assessments.find((assessment) =>
      (assessment.lessonNumbers || []).includes(lesson.lessonNumber),
    );
    if (
      !matchedAssessment?.artifact ||
      !Array.isArray(matchedAssessment.criteria) ||
      matchedAssessment.criteria.length < 4 ||
      !matchedAssessment.role ||
      !matchedAssessment.roleLabel ||
      !matchedAssessment.stakes ||
      !Number.isFinite(matchedAssessment.weightPercent) ||
      !matchedAssessment.gradingMode ||
      !matchedAssessment.roleRationale ||
      !matchedAssessment.studentFacingPurpose ||
      !matchedAssessment.weightProvenance?.source ||
      !matchedAssessment.weightProvenance?.planStatus ||
      !matchedAssessment.weightProvenance?.planPolicy ||
      !matchedAssessment.weightProvenance?.reviewerAction ||
      !matchedAssessment.revisionUse ||
      !matchedAssessment.cadence?.dueWindow ||
      !matchedAssessment.cadence?.feedbackWindow ||
      !matchedAssessment.cadence?.revisionWindow ||
      !matchedAssessment.validityEvidence?.targetConstruct ||
      !matchedAssessment.validityEvidence?.validityThreat ||
      !matchedAssessment.validityEvidence?.calibrationCheck ||
      !matchedAssessment.calibrationPlan?.anchorComparison ||
      !matchedAssessment.calibrationPlan?.scorerNorming ||
      !matchedAssessment.calibrationPlan?.biasCheck ||
      !matchedAssessment.calibrationPlan?.studentTransparency ||
      !matchedAssessment.calibrationPlan?.postScoreReview ||
      !Array.isArray(matchedAssessment.criterionEvidenceMap) ||
      matchedAssessment.criterionEvidenceMap.length < matchedAssessment.criteria.length ||
      !Array.isArray(matchedAssessment.criterionWeightPlan) ||
      matchedAssessment.criterionWeightPlan.length < matchedAssessment.criteria.length ||
      matchedAssessment.criterionWeightPlan.reduce((sum, entry) => sum + Number(entry?.weight || 0), 0) !== 100 ||
      !Array.isArray(matchedAssessment.criterionObjectiveAlignment) ||
      matchedAssessment.criterionObjectiveAlignment.length < matchedAssessment.criteria.length ||
      !matchedAssessment.anchorExampleSet?.strongSample ||
      !matchedAssessment.anchorExampleSet?.partialSample ||
      !matchedAssessment.anchorExampleSet?.strongSignal ||
      !matchedAssessment.anchorExampleSet?.partialSignal ||
      !matchedAssessment.anchorExampleSet?.scoringRationale ||
      !matchedAssessment.anchorExampleSet?.revisionPrompt ||
      !matchedAssessment.anchorExampleSet?.scorerCalibrationUse ||
      !matchedAssessment.anchorExampleSet?.studentFacingUse ||
      matchedAssessment.criterionEvidenceMap.some(
        (entry) =>
          !entry?.criterion ||
          !entry.evidenceNeeded ||
          !entry.strongSignal ||
          !entry.partialSignal ||
          !entry.feedbackMove ||
          !entry.calibrationQuestion,
      ) ||
      matchedAssessment.criterionWeightPlan.some(
        (entry) =>
          !entry?.criterion ||
          !Number.isFinite(entry.weight) ||
          !Number.isFinite(entry.points) ||
          !entry.priority ||
          !entry.rationale ||
          !entry.evidenceSignal ||
          !entry.calibrationUse ||
          !entry.feedbackUse ||
          !entry.studentTransparency,
      ) ||
      matchedAssessment.criterionObjectiveAlignment.some(
        (entry) =>
          !entry?.criterion ||
          !entry.objective ||
          !entry.strategy ||
          entry.strategy === 'index-rotation' ||
          !entry.rationale,
      )
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'assessmentAnchor',
          'Lesson assessment anchor is missing artifact, role, cadence, rubric criteria, criterion weights, criterion-objective alignment, anchor examples, criterion evidence, validity evidence, or grading calibration.',
          lesson.lessonNumber,
        ),
      );
    }
  }

  if (alignmentMatrix.length !== lessons.length) {
    findings.push(
      makeContractFinding(
        'blocker',
        'alignmentCoverage',
        `Expected ${lessons.length} alignment row(s), found ${alignmentMatrix.length}.`,
      ),
    );
  }
  for (const row of alignmentMatrix) {
    if (row.alignmentStatus !== 'aligned') {
      findings.push(
        makeContractFinding('blocker', 'alignmentStatus', 'Alignment row is not marked aligned.', row.lessonNumber),
      );
    }
    if (
      !row.evidenceRequirement ||
      !row.feedbackUse ||
      !row.misconceptionCheck ||
      !row.modelContrastCue ||
      !row.readinessSupportCue ||
      !row.prerequisiteCue ||
      !row.conceptDependencyCue ||
      !row.practiceProgressionCue ||
      !row.objectiveEvidenceCue ||
      !row.masteryDiagnosticCue ||
      !row.masteryGuidedPracticeCue ||
      !row.masteryPerformanceCue ||
      !row.masteryRevisionCue ||
      !row.masteryTransferCue ||
      !row.masteryThresholdCue ||
      !row.evidenceReadyResponseCue ||
      !row.evidencePartialResponseCue ||
      !row.evidenceSupportResponseCue ||
      !row.evidenceRecheckCue ||
      !row.sourceEvidenceCue ||
      !row.instructionalRationaleCue ||
      !row.accessibilityCue ||
      !row.feedbackCycleCue ||
      !row.learningTransferCue ||
      !row.modalityCue ||
      !row.modalityDecodeCue ||
      !row.artifactGenreCue ||
      !row.assessmentRoleCue ||
      !row.assessmentCadenceCue ||
      !row.teachingIntentCue ||
      !row.gradingCalibrationCue ||
      !row.criterionEvidenceCue ||
      !row.anchorExampleCue ||
      !row.compilerDecisionCue ||
      !row.publishGate ||
      !row.sourceUseCue
    ) {
      findings.push(
        makeContractFinding(
          'blocker',
          'alignmentLoop',
          'Alignment row is missing evidence, assessment role/cadence, source evidence, compiler decision, source-use, criterion evidence, anchor-example, prerequisite-readiness, concept-dependency, practice-progression, objective-evidence, mastery-evidence, evidence-response decisions, modality-fit, modality teaching pattern, artifact genre, teaching-intent, feedback, revision, retrieval/transfer, misconception, exemplar-contrast, readiness-support, instructional-rationale, accessibility, or grading-calibration checks.',
          row.lessonNumber,
        ),
      );
    }
  }

  if (
    blueprint.enrichment?.source === 'model-blueprint-enrichment' &&
    blueprint.enrichment?.quality?.status !== 'accepted'
  ) {
    findings.push(
      makeContractFinding(
        'blocker',
        'enrichmentQuality',
        'Model blueprint enrichment is missing accepted quality evidence.',
      ),
    );
  }
  const enrichmentTeachingMoves = normalizeEnrichmentTeachingMoves(blueprint.enrichment?.teachingMoves);
  const requiredTeachingMoveKeys = ['openingMove', 'practiceMove', 'feedbackMove', 'assessmentMove', 'reviewMove'];
  const missingTeachingMoveKeys = requiredTeachingMoveKeys.filter((key) => !enrichmentTeachingMoves[key]);
  if (missingTeachingMoveKeys.length > 0) {
    findings.push(
      makeContractFinding(
        'blocker',
        'enrichmentTeachingMoves',
        `Blueprint enrichment is missing reusable compiler teaching moves: ${missingTeachingMoveKeys.join(', ')}.`,
      ),
    );
  }
  if (
    blueprint.instructorPreferenceProfile &&
    (!blueprint.instructorPreferenceProfile.signalCount || !blueprint.instructorPreferenceProfile.confidence)
  ) {
    findings.push(
      makeContractFinding(
        'warning',
        'instructorPreferences',
        'Instructor preference profile is present but missing signal count or confidence.',
      ),
    );
  }

  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  return {
    version: 1,
    status: contractStatus(findings),
    blockerCount,
    warningCount,
    lessonCount: lessons.length,
    assessmentCount: assessments.length,
    alignmentRowCount: alignmentMatrix.length,
    sourceGroundedLessonCount: blueprint.qualitySignals?.sourceGroundedLessonCount ?? null,
    reviewFlagCount: blueprint.qualitySignals?.reviewFlagCount ?? null,
    conceptGraphStatus: blueprint.conceptDependencyGraph?.status || 'missing',
    masteryEvidenceStatus: blueprint.masteryEvidenceMap?.status || 'missing',
    evidenceResponseStatus: blueprint.evidenceResponseMap?.status || 'missing',
    objectiveEvidenceStatus: blueprint.objectiveEvidenceMap?.status || 'missing',
    objectiveEvidenceRows: blueprint.objectiveEvidenceMap?.totalObjectiveRows ?? null,
    objectiveEvidenceMissingCount: blueprint.objectiveEvidenceMap?.missingEvidenceCount ?? null,
    sourceConflictStatus: blueprint.sourceConflictReport?.status || 'missing',
    sourceConflictDuplicateLessonCount: blueprint.sourceConflictReport?.duplicateLessonCount ?? null,
    compilerDecisionStatus: blueprint.compilerDecisionMatrix?.status || 'missing',
    compilerReviewRequiredCount: blueprint.compilerDecisionMatrix?.reviewRequiredCount ?? null,
    classroomDryRunStatus: blueprint.classroomDryRunPlan?.status || 'missing',
    classroomDryRunLessonRows: blueprint.classroomDryRunPlan?.lessonRowCount ?? null,
    classroomDryRunReviewRequiredCount: blueprint.classroomDryRunPlan?.reviewRequiredCount ?? null,
    classroomEvidenceLoopStatus: blueprint.classroomEvidenceLoopPlan?.status || 'missing',
    classroomEvidenceLoopLessonRows: blueprint.classroomEvidenceLoopPlan?.lessonRowCount ?? null,
    classroomEvidenceLoopReviewRequiredCount: blueprint.classroomEvidenceLoopPlan?.reviewRequiredCount ?? null,
    instructorFeedbackLoadStatus: blueprint.instructorFeedbackLoadPlan?.status || 'missing',
    instructorFeedbackLoadLessonRows: blueprint.instructorFeedbackLoadPlan?.lessonRowCount ?? null,
    instructorFeedbackLoadAverageMinutes: blueprint.instructorFeedbackLoadPlan?.averageEstimatedFeedbackMinutes ?? null,
    blueprintReviewSurfaceStatus: blueprint.blueprintReviewSurface?.status || 'missing',
    blueprintReviewSourceRequiredCount:
      blueprint.blueprintReviewSurface?.localConfirmationSummary?.sourceReviewRequiredCount ?? null,
    blueprintReviewTraceabilityStatus: blueprint.blueprintReviewSurface?.traceabilitySummary?.status || 'missing',
    blueprintReviewUntraceableRows: blueprint.blueprintReviewSurface?.traceabilitySummary?.untraceableRows ?? null,
    blueprintReviewInstructionalMoveStatus:
      blueprint.blueprintReviewSurface?.instructionalMoveDecode?.status || 'missing',
    blueprintReviewInstructionalMoveRows:
      blueprint.blueprintReviewSurface?.traceabilitySummary?.instructionalMoveRows ?? null,
    findings,
  };
}

function compactBlueprintContract(contract = {}) {
  return {
    status: contract.status || 'unknown',
    blockerCount: contract.blockerCount || 0,
    warningCount: contract.warningCount || 0,
    lessonCount: contract.lessonCount || 0,
    assessmentCount: contract.assessmentCount || 0,
    alignmentRowCount: contract.alignmentRowCount || 0,
    sourceGroundedLessonCount: contract.sourceGroundedLessonCount ?? null,
    reviewFlagCount: contract.reviewFlagCount ?? null,
    conceptGraphStatus: contract.conceptGraphStatus || 'unknown',
    masteryEvidenceStatus: contract.masteryEvidenceStatus || 'unknown',
    evidenceResponseStatus: contract.evidenceResponseStatus || 'unknown',
    objectiveEvidenceStatus: contract.objectiveEvidenceStatus || 'unknown',
    objectiveEvidenceRows: contract.objectiveEvidenceRows ?? null,
    objectiveEvidenceMissingCount: contract.objectiveEvidenceMissingCount ?? null,
    compilerDecisionStatus: contract.compilerDecisionStatus || 'unknown',
    compilerReviewRequiredCount: contract.compilerReviewRequiredCount ?? null,
    classroomDryRunStatus: contract.classroomDryRunStatus || 'unknown',
    classroomDryRunLessonRows: contract.classroomDryRunLessonRows ?? null,
    classroomDryRunReviewRequiredCount: contract.classroomDryRunReviewRequiredCount ?? null,
    classroomEvidenceLoopStatus: contract.classroomEvidenceLoopStatus || 'unknown',
    classroomEvidenceLoopLessonRows: contract.classroomEvidenceLoopLessonRows ?? null,
    classroomEvidenceLoopReviewRequiredCount: contract.classroomEvidenceLoopReviewRequiredCount ?? null,
    instructorFeedbackLoadStatus: contract.instructorFeedbackLoadStatus || 'unknown',
    instructorFeedbackLoadLessonRows: contract.instructorFeedbackLoadLessonRows ?? null,
    instructorFeedbackLoadAverageMinutes: contract.instructorFeedbackLoadAverageMinutes ?? null,
    blueprintReviewSurfaceStatus: contract.blueprintReviewSurfaceStatus || 'unknown',
    blueprintReviewSourceRequiredCount: contract.blueprintReviewSourceRequiredCount ?? null,
    blueprintReviewTraceabilityStatus: contract.blueprintReviewTraceabilityStatus || 'unknown',
    blueprintReviewUntraceableRows: contract.blueprintReviewUntraceableRows ?? null,
    blueprintReviewInstructionalMoveStatus: contract.blueprintReviewInstructionalMoveStatus || 'unknown',
    blueprintReviewInstructionalMoveRows: contract.blueprintReviewInstructionalMoveRows ?? null,
    sourceConflictStatus: contract.sourceConflictStatus || 'unknown',
    sourceConflictDuplicateLessonCount: contract.sourceConflictDuplicateLessonCount ?? null,
  };
}

function compactEnrichmentLanguage(enrichment = {}) {
  if (!enrichment || typeof enrichment !== 'object') return null;
  const lens = enrichment.lens && typeof enrichment.lens === 'object' ? enrichment.lens : {};
  const signatureTerms = unique(enrichment.signatureTerms || [], 10);
  const styleNotes = unique(enrichment.styleNotes || [], 3);
  const teachingMoves = normalizeEnrichmentTeachingMoves(enrichment.teachingMoves);
  const hasLessonContent =
    enrichment.lessonContent &&
    typeof enrichment.lessonContent === 'object' &&
    Object.keys(enrichment.lessonContent).length > 0;
  if (
    signatureTerms.length === 0 &&
    Object.keys(lens).length === 0 &&
    styleNotes.length === 0 &&
    Object.keys(teachingMoves).length === 0 &&
    !hasLessonContent
  ) {
    return null;
  }
  return {
    source: enrichment.source || 'deterministic-blueprint-enrichment',
    signatureTerms,
    lens: {
      domain: lens.domain || '',
      evidenceNoun: lens.evidenceNoun || '',
      decisionNoun: lens.decisionNoun || '',
      learnerRole: lens.learnerRole || '',
      exampleNoun: lens.exampleNoun || '',
    },
    teachingMoves,
    styleNotes,
    // Per-lesson content payloads (v0.9.1 subject-matter enrichment) pass
    // through untouched; lesson normalization attaches them per lesson.
    ...(enrichment.lessonContent && typeof enrichment.lessonContent === 'object'
      ? { lessonContent: enrichment.lessonContent }
      : {}),
  };
}

function compactConceptDependencyGraph(graph = {}) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const practiceRows = Array.isArray(graph.practiceRows) ? graph.practiceRows : [];
  return {
    status: graph.status || 'unknown',
    nodeCount: nodes.length,
    edgeCount: Number.isFinite(graph.edgeCount) ? graph.edgeCount : edges.length,
    practiceRowCount: practiceRows.length,
    conceptThread: graph.conceptThread || '',
    lessonConcepts: nodes.map((node) => ({
      lessonNumber: node.lessonNumber,
      concept: node.concept,
      stage: node.stage,
      dependencyCount: edges.filter((edge) => edge.toLessonNumber === node.lessonNumber).length,
      transferCount: edges.filter((edge) => edge.fromLessonNumber === node.lessonNumber).length,
    })),
  };
}

function compactMasteryEvidenceMap(map = {}) {
  const rows = Array.isArray(map.lessonRows) ? map.lessonRows : [];
  return {
    status: map.status || 'unknown',
    lessonRowCount: rows.length,
    missingFieldCount: map.missingFieldCount ?? null,
    checkedStages: unique(map.checkedStages || [], 8),
    lessonReadiness: rows.map((row) => ({
      lessonNumber: row.lessonNumber,
      concept: row.concept,
      artifact: row.artifact,
      evidencePortfolioStages: unique(row.evidencePortfolioStages || [], 8),
      hasMasteryThreshold: Boolean(row.masteryThreshold),
    })),
  };
}

function compactEvidenceResponseMap(map = {}) {
  const rows = Array.isArray(map.lessonRows) ? map.lessonRows : [];
  return {
    status: map.status || 'unknown',
    lessonRowCount: rows.length,
    missingFieldCount: map.missingFieldCount ?? null,
    checkedStates: unique(map.checkedStates || [], 5),
    lessonResponseCoverage: rows.map((row) => ({
      lessonNumber: row.lessonNumber,
      concept: row.concept,
      artifact: row.artifact,
      decisionStateCount: row.decisionStateCount || 0,
      reviewerCue: row.reviewerCue || '',
    })),
  };
}

function compactObjectiveEvidenceMap(map = {}) {
  const rows = Array.isArray(map.lessonRows) ? map.lessonRows : [];
  return {
    status: map.status || 'unknown',
    lessonRowCount: rows.length,
    totalObjectiveRows: map.totalObjectiveRows ?? null,
    missingEvidenceCount: map.missingEvidenceCount ?? null,
    checkedEvidenceTypes: unique(map.checkedEvidenceTypes || [], 8),
    lessonObjectiveCoverage: rows.map((row) => ({
      lessonNumber: row.lessonNumber,
      objectiveCount: row.objectiveCount,
      missingEvidenceCount: row.missingEvidenceCount,
      artifact: row.artifact,
      objectiveStatuses: (row.objectiveRows || []).map((entry) => ({
        objectiveIndex: entry.objectiveIndex,
        status: entry.status,
        rubricCriteria: entry.rubricCriteria?.length || 0,
        quizQuestionRoles: entry.quizQuestionRoles?.length || 0,
      })),
    })),
  };
}

function compactSourceRiskRegister(register = {}) {
  const lessonRows = Array.isArray(register.lessonRows) ? register.lessonRows : [];
  return {
    status: register.status || 'unknown',
    riskPolicy: register.riskPolicy || '',
    highRiskCount: register.highRiskCount || 0,
    reviewRequiredCount: register.reviewRequiredCount || 0,
    lessonRows: lessonRows.map((row) => ({
      lessonNumber: row.lessonNumber,
      riskLevel: row.riskLevel,
      confidence: row.confidence,
      reviewRequired: Boolean(row.reviewRequired),
    })),
  };
}

function compactCompilerDecisionMatrix(matrix = {}) {
  const lessonRows = Array.isArray(matrix.lessonRows) ? matrix.lessonRows : [];
  return {
    status: matrix.status || 'unknown',
    reviewRequiredCount: matrix.reviewRequiredCount || 0,
    deterministicCount: lessonRows.filter((row) => row.generationPath === 'deterministic-compile').length,
    lessonRows: lessonRows.map((row) => ({
      lessonNumber: row.lessonNumber,
      generationPath: row.generationPath,
      publishGate: row.publishGate,
      reviewRequired: Boolean(row.reviewRequired),
    })),
  };
}

function compactAssessmentArchitecture(architecture = {}) {
  const rows = Array.isArray(architecture.lessonRows) ? architecture.lessonRows : [];
  return {
    status: architecture.status || 'unknown',
    totalWeightPercent: architecture.totalWeightPercent ?? null,
    highStakesWeightPercent: architecture.highStakesWeightPercent ?? null,
    formativeWeightPercent: architecture.formativeWeightPercent ?? null,
    weightSourceStatus: architecture.weightSourceStatus || '',
    explicitWeightCount: architecture.explicitWeightCount || 0,
    compilerDistributedWeightCount: architecture.compilerDistributedWeightCount || 0,
    weightReviewRequiredCount: architecture.weightReviewRequiredCount || 0,
    lessonRows: rows.map((row) => ({
      lessonNumber: row.lessonNumber,
      assessmentTitle: row.assessmentTitle,
      roleLabel: row.roleLabel,
      stakes: row.stakes,
      weightPercent: row.weightPercent,
      dueWindow: row.dueWindow,
      feedbackWindow: row.feedbackWindow,
      revisionUse: row.revisionUse,
    })),
  };
}

function compactWeightProvenance(provenance = {}) {
  if (!provenance || typeof provenance !== 'object') return null;
  const planStatus = provenance.planStatus || provenance.sourceStatus || 'unknown';
  const source = provenance.source || 'unknown';
  const reviewRequired = Boolean(provenance.reviewRequired);
  return {
    version: provenance.version || 1,
    planStatus,
    source,
    sourceStatus: provenance.sourceStatus || planStatus,
    sourceWeightPercent: provenance.sourceWeightPercent ?? null,
    sourceEvidence: provenance.sourceEvidence || '',
    reviewRequired,
    reviewCode: reviewRequired ? 'confirm-weight-before-publish' : 'source-weight-spot-check',
    rationale: provenance.rationale || '',
    reviewerAction: provenance.reviewerAction || '',
  };
}

function compactClassroomHandoffPlan(plan = {}) {
  const lessonReviewOrder = Array.isArray(plan.lessonReviewOrder) ? plan.lessonReviewOrder : [];
  return {
    status: plan.status || 'unknown',
    publishBoundary: plan.publishBoundary || '',
    reviewOrder: unique(plan.reviewOrder || [], 8),
    localConfirmationSummary: plan.localConfirmationSummary || null,
    lessonReviewCount: lessonReviewOrder.length,
    lessonReviewOrder: lessonReviewOrder.map((row) => ({
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      confidence: row.confidence,
      sourceRiskLevel: row.sourceRiskLevel,
      publishGate: row.publishGate,
    })),
  };
}

function compactClassroomDryRunPlan(plan = {}) {
  const lessonRows = Array.isArray(plan.lessonRows) ? plan.lessonRows : [];
  return {
    status: plan.status || 'unknown',
    source: plan.source || '',
    modality: plan.modality || '',
    rehearsalPolicy: plan.rehearsalPolicy || '',
    failureResponsePolicy: plan.failureResponsePolicy || '',
    lessonRowCount: lessonRows.length,
    reviewRequiredCount: plan.reviewRequiredCount || 0,
    timingReviewCount: plan.timingReviewCount || 0,
    lessonRows: lessonRows.map((row) => ({
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      dryRunFocus: row.dryRunFocus,
      firstTenMinutes: row.firstTenMinutes,
      evidenceCheckpoint: row.evidenceCheckpoint,
      likelyFailureMode: row.likelyFailureMode,
      instructorAdjustment: row.instructorAdjustment,
      publishGate: row.publishGate,
      reviewerAction: row.reviewerAction,
    })),
  };
}

function compactClassroomEvidenceLoopPlan(plan = {}) {
  const lessonRows = Array.isArray(plan.lessonRows) ? plan.lessonRows : [];
  return {
    status: plan.status || 'unknown',
    source: plan.source || '',
    modality: plan.modality || '',
    evidencePolicy: plan.evidencePolicy || '',
    preferenceLearningPolicy: plan.preferenceLearningPolicy || '',
    lessonRowCount: lessonRows.length,
    reviewRequiredCount: plan.reviewRequiredCount || 0,
    lessonRows: lessonRows.map((row) => ({
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      implementationFocus: row.implementationFocus,
      evidenceToCollect: unique(row.evidenceToCollect || [], 5),
      studentWorkSampleCue: row.studentWorkSampleCue,
      adjustmentDecision: row.adjustmentDecision,
      nextLessonFeedForward: row.nextLessonFeedForward,
      preferenceLearningSignal: row.preferenceLearningSignal,
      publishGate: row.publishGate,
      reviewerAction: row.reviewerAction,
    })),
  };
}

function compactInstructorFeedbackLoadPlan(plan = {}) {
  const lessonRows = Array.isArray(plan.lessonRows) ? plan.lessonRows : [];
  return {
    status: plan.status || 'unknown',
    source: plan.source || '',
    modality: plan.modality || '',
    feedbackLoadPolicy: plan.feedbackLoadPolicy || '',
    calibrationPolicy: plan.calibrationPolicy || '',
    lessonRowCount: lessonRows.length,
    totalEstimatedFeedbackMinutes: plan.totalEstimatedFeedbackMinutes || 0,
    averageEstimatedFeedbackMinutes: plan.averageEstimatedFeedbackMinutes || 0,
    heavyFeedbackLessonCount: plan.heavyFeedbackLessonCount || 0,
    lessonRows: lessonRows.map((row) => ({
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      assessmentTitle: row.assessmentTitle,
      feedbackWindow: row.feedbackWindow,
      estimatedFeedbackMinutes: row.estimatedFeedbackMinutes,
      feedbackFocus: row.feedbackFocus,
      highestLeverageCriterion: row.highestLeverageCriterion,
      calibrationCue: row.calibrationCue,
      batchingStrategy: row.batchingStrategy,
      loadRisk: row.loadRisk,
      publishGate: row.publishGate,
      reviewerAction: row.reviewerAction,
    })),
  };
}

function compactAssumptionLedger(ledger = {}) {
  const rows = Array.isArray(ledger.rows) ? ledger.rows : [];
  return {
    status: ledger.status || 'unknown',
    reviewerPolicy: ledger.reviewerPolicy || '',
    rowCount: rows.length,
    reviewRequiredCount: ledger.reviewRequiredCount || rows.filter((row) => row.reviewRequired).length,
    categories: unique(
      rows.map((row) => row.category),
      12,
    ),
    rows: rows.map((row) => ({
      category: row.category,
      lessonNumber: row.lessonNumber,
      lessonTitle: row.lessonTitle,
      confidence: row.confidence,
      source: row.source,
      reviewRequired: Boolean(row.reviewRequired),
      reviewerAction: row.reviewerAction,
    })),
  };
}

function compactPackageCoherenceMatrix(matrix = {}) {
  const rows = Array.isArray(matrix.lessonRows) ? matrix.lessonRows : [];
  return {
    status: matrix.status || 'unknown',
    missingFieldCount: matrix.missingFieldCount || 0,
    lessonRowCount: rows.length,
    sourceConflictCount: rows.filter((row) => row.sourceConflictCue).length,
    publishGateCount: rows.filter((row) => row.publishGate).length,
    lessonRows: rows.map((row) => ({
      lessonNumber: row.lessonNumber,
      assessmentArtifact: row.assessmentArtifact,
      assessmentRole: row.assessmentRole,
      assessmentCadenceCue: row.assessmentCadenceCue,
      sourceEvidenceCue: row.sourceEvidenceCue,
      sourceRiskLevel: row.sourceRiskLevel,
      compilerDecisionCue: row.compilerDecisionCue,
      publishGate: row.publishGate,
      sourceUseCue: row.sourceUseCue,
      prerequisiteCue: row.prerequisiteCue,
      teachingIntentCue: row.teachingIntentCue,
      modalityCue: row.modalityCue,
      modalityDecodeCue: row.modalityDecodeCue,
      artifactGenreCue: row.artifactGenreCue,
      classSessionCue: row.classSessionCue,
      localReviewNeeded: row.localReviewNeeded,
    })),
  };
}

function compactBlueprintReviewSurface(surface = {}) {
  return {
    status: surface.status || 'unknown',
    localConfirmationSummary: surface.localConfirmationSummary || null,
    traceabilitySummary: surface.traceabilitySummary || null,
    instructionalMoveDecode: surface.instructionalMoveDecode || null,
    courseDecode: surface.courseDecode || null,
  };
}

function compactSourceConflictReport(report = {}) {
  return {
    status: report.status || 'unknown',
    duplicateGroupCount: report.duplicateGroupCount || 0,
    duplicateLessonCount: report.duplicateLessonCount || 0,
    conflictLessonNumbers: unique(report.conflictLessonNumbers || [], 20),
  };
}

function shouldRebuildAssessmentAnchors(lessons = [], assessments = []) {
  if (!Array.isArray(assessments) || assessments.length !== lessons.length) return true;
  return lessons.some((lesson, index) => {
    const assessment = findAssessmentForLesson(assessments, lesson, index);
    return (
      !assessment?.artifact ||
      !Array.isArray(assessment.criteria) ||
      assessment.criteria.length < 3 ||
      !Number.isFinite(assessment.weightPercent) ||
      !assessment.weightProvenance?.source
    );
  });
}

function deriveRoutineFieldsForLesson(lesson = {}, index = 0) {
  const title = lesson.title || `Lesson ${index + 1}`;
  const concepts = normalizeConceptCandidates(
    Array.isArray(lesson.keyConcepts) && lesson.keyConcepts.length > 0
      ? lesson.keyConcepts
      : wordsFromConcepts([lesson.outcomes?.join(' '), title], 6),
    { title, limit: 8 },
  );
  const safeConcepts = concepts.length > 0 ? concepts : ['the lesson focus'];
  const suppliedOutcomes =
    Array.isArray(lesson.outcomes) && lesson.outcomes.length > 0
      ? unique(
          lesson.outcomes
            .map((objective) => normalizeObjectiveText(objective))
            .filter((objective) => objective && !isWeakConcept(objective)),
          5,
        )
      : [];
  const outcomes = suppliedOutcomes.length > 0 ? suppliedOutcomes : [objectiveForLesson(title, safeConcepts)];
  const readings =
    Array.isArray(lesson.readings) && lesson.readings.length > 0
      ? lesson.readings
      : ['Instructor-provided course materials and notes'];
  const activityPattern =
    lesson.activityPattern ||
    `Concept model, applied practice, peer discussion, and individual reflection for ${stripLessonPrefix(title)}.`;
  const activities = splitList(activityPattern);
  const artifact =
    lesson.studentArtifact ||
    buildSyntheticAssessment({
      title,
      concepts: safeConcepts,
      outcomes,
      activities,
      bloomsLevel: lesson.bloomsLevel || 'Apply',
    });
  const bloomInference =
    lesson.bloomInference?.level && lesson.bloomInference.source
      ? lesson.bloomInference
      : inferBloomLevelFromSignals(
          [
            { source: 'learning objectives', text: outcomes.join('; ') },
            { source: 'assessment artifact', text: artifact },
            { source: 'learning activities', text: activityPattern },
            { source: 'lesson title', text: title },
          ],
          lesson.bloomsLevel || 'Apply',
        );
  const bloomsLevel = lesson.bloomsLevel || bloomInference.level;
  const workloadEstimate = lesson.workloadEstimate?.totalStudentMinutes
    ? lesson.workloadEstimate
    : buildWorkloadEstimate({ resources: readings, hasAssessment: Boolean(artifact), bloomsLevel });
  const difficultyProfile =
    lesson.difficultyProfile?.cognitiveDemand && lesson.difficultyProfile?.stage
      ? lesson.difficultyProfile
      : buildDifficultyProfile({
          originalIndex: index,
          bloomsLevel,
          hasAssessment: Boolean(artifact),
          concepts: safeConcepts,
        });
  const evidencePlan =
    lesson.evidencePlan?.sourceCue && lesson.evidencePlan?.evidenceRequirement && lesson.evidencePlan?.limitationCue
      ? lesson.evidencePlan
      : buildEvidencePlan({ title, concepts: safeConcepts, resources: readings, activities, artifact });
  const sourceUsePlan =
    Array.isArray(lesson.sourceUsePlan?.approvedSources) &&
    lesson.sourceUsePlan.approvedSources.length > 0 &&
    lesson.sourceUsePlan?.noInventedSources
      ? lesson.sourceUsePlan
      : buildSourceUsePlan({ title, concepts: safeConcepts, resources: readings, evidencePlan, artifact });
  const misconceptionMap =
    Array.isArray(lesson.misconceptionMap) && lesson.misconceptionMap.length > 0
      ? lesson.misconceptionMap
      : buildMisconceptionMap({ title, concepts: safeConcepts, artifact });
  const modelContrast =
    lesson.modelContrast?.exemplarMove && lesson.modelContrast?.nonExemplarMove
      ? lesson.modelContrast
      : buildModelContrast({ title, concepts: safeConcepts, artifact, evidencePlan });
  const readinessSupport =
    lesson.readinessSupport?.diagnosticPrompt && lesson.readinessSupport?.supportMove
      ? lesson.readinessSupport
      : buildReadinessSupportPlan({ title, concepts: safeConcepts, artifact, evidencePlan });
  const instructionalRationale =
    lesson.instructionalRationale?.sequenceRationale && lesson.instructionalRationale?.assessmentRationale
      ? lesson.instructionalRationale
      : buildInstructionalRationale({
          title,
          concepts: safeConcepts,
          artifact,
          evidencePlan,
          readinessSupport,
          difficultyProfile,
        });
  const accessibilityPlan =
    lesson.accessibilityPlan?.representation && lesson.accessibilityPlan?.accommodationReviewCue
      ? lesson.accessibilityPlan
      : buildAccessibilityPlan({ title, concepts: safeConcepts, artifact, evidencePlan, readinessSupport });
  const feedbackCycle =
    lesson.feedbackCycle?.formativeEvidence && lesson.feedbackCycle?.studentRevisionAction
      ? lesson.feedbackCycle
      : buildFeedbackCycle({ title, concepts: safeConcepts, artifact, evidencePlan });

  return {
    ...lesson,
    outcomes,
    keyConcepts: safeConcepts,
    readings,
    activityPattern,
    studentArtifact: artifact,
    successCriteria:
      Array.isArray(lesson.successCriteria) && lesson.successCriteria.length > 0
        ? lesson.successCriteria
        : successCriteriaForLesson(title, safeConcepts),
    bloomsLevel,
    bloomInference,
    workloadEstimate,
    difficultyProfile,
    evidencePlan,
    sourceUsePlan,
    misconceptionMap,
    modelContrast,
    readinessSupport,
    instructionalRationale,
    accessibilityPlan,
    feedbackCycle,
    feedbackMoment: lesson.feedbackMoment || feedbackCycle.nextUse,
  };
}

function normalizeLessonsForCompiler(blueprint = {}, context = {}) {
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  const routineReadyLessons = lessons.map((lesson, index) => deriveRoutineFieldsForLesson(lesson, index));
  return routineReadyLessons.map((lesson) => {
    const modalityDecode =
      lesson.modalityDecode || buildLessonModalityDecode(context.courseModalityProfile || {}, lesson);
    const contentEnrichment =
      lesson.enrichment ||
      context.lessonContentEnrichment?.[`lesson-${(lesson.lessonIndex ?? 0) + 1}`] ||
      context.lessonContentEnrichment?.[lesson.id] ||
      null;
    const lessonWithCompilerKnobs = {
      ...lesson,
      ...(contentEnrichment ? { enrichment: contentEnrichment } : {}),
      learnerContextCue:
        lesson.learnerContextCue || buildLessonLearnerContextCue(context.learnerContextProfile || {}, lesson),
      modalityCue: lesson.modalityCue || buildLessonModalityCue(context.courseModalityProfile || {}, lesson),
      modalityDecode,
      artifactGenre:
        lesson.artifactGenre || buildArtifactGenreDecode(lesson, context.courseModalityProfile || {}, modalityDecode),
      classSessionPlan: lesson.classSessionPlan || buildClassSessionPlan({ lesson, modalityDecode }),
    };
    if (lessonWithCompilerKnobs.throughlineCase) {
      return lessonWithCompilerKnobs;
    }
    return attachThroughlineCaseToLesson(lessonWithCompilerKnobs, context.courseThroughlineContext);
  });
}

function isUsableLessonCompilerDecision(decision = {}) {
  return (
    decision?.source === 'deterministic-compiler-decision' &&
    Boolean(decision.generationPath) &&
    Boolean(decision.safePath) &&
    Boolean(decision.publishGate) &&
    Boolean(decision.modelUsePolicy)
  );
}

function attachCompilerDecisionsToLessons(lessons = [], assessments = [], sourceRiskRegister = {}) {
  return lessons.map((lesson, index) => {
    const sourceRiskRow =
      sourceRiskRegister.lessonRows?.find((row) => row.lessonNumber === lesson.lessonNumber) || lesson.sourceRisk || {};
    const assessment = findAssessmentForLesson(assessments, lesson, index) || {};
    return {
      ...lesson,
      sourceRisk: lesson.sourceRisk || sourceRiskRow,
      compilerDecision: isUsableLessonCompilerDecision(lesson.compilerDecision)
        ? lesson.compilerDecision
        : buildLessonCompilerDecision({ lesson, sourceRiskRow, assessment }),
    };
  });
}

function deriveBlueprintForCompiler(blueprint = {}, options = {}) {
  const courseName = cleanText(blueprint.courseName, 'Untitled Course');
  const rawLessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  const rawConcepts = unique(
    rawLessons.flatMap((lesson) => lesson.keyConcepts || []),
    16,
  );
  const courseConcepts =
    Array.isArray(blueprint.courseConcepts) && blueprint.courseConcepts.length > 0
      ? blueprint.courseConcepts
      : rawConcepts;
  const courseModalityProfile =
    blueprint.courseModalityProfile?.primaryMode && blueprint.courseModalityProfile?.teachingPattern
      ? blueprint.courseModalityProfile
      : buildCourseModalityProfile({ courseName, lessons: rawLessons });
  const hasUsableEnrichment =
    blueprint.enrichment?.lens || blueprint.enrichment?.teachingMoves || blueprint.enrichment?.source;
  const enrichment = hasUsableEnrichment
    ? blueprint.enrichment
    : normalizeBlueprintEnrichment({
        courseName,
        lessons: rawLessons,
        courseConcepts,
        provided: options.enrichment || {},
        courseModalityProfile,
      });
  const learnerContextProfile =
    blueprint.learnerContextProfile?.learnerRole && blueprint.learnerContextProfile?.coursePerformanceRole
      ? blueprint.learnerContextProfile
      : buildLearnerContextProfile({
          courseName,
          courseConcepts,
          lessons: rawLessons,
          lens: enrichment.lens,
          courseModalityProfile,
        });
  const courseThroughlineContext =
    blueprint.courseThroughlineContext ||
    buildCourseThroughlineContext({
      courseName,
      lessons: rawLessons,
      courseConcepts,
      lens: enrichment.lens,
      courseModalityProfile,
    });

  let lessons = normalizeLessonsForCompiler(blueprint, {
    lessonContentEnrichment: options.enrichment?.lessonContent || enrichment.lessonContent || null,
    courseModalityProfile,
    learnerContextProfile,
    courseThroughlineContext,
  });
  if (
    lessons.some(
      (lesson) =>
        !lesson.prerequisitePlan?.diagnosticCheck ||
        !lesson.pacing?.bridgeFrom ||
        !lesson.learningTransferPlan?.transferTask ||
        !lesson.teachingIntent?.teachingGoal,
    )
  ) {
    lessons = addCourseSequenceSemantics(lessons);
  }
  let assessments = shouldRebuildAssessmentAnchors(lessons, blueprint.assessments)
    ? buildAssessmentAnchors(lessons)
    : blueprint.assessments;
  const sourceConflictReport =
    blueprint.sourceConflictReport?.status && Array.isArray(blueprint.sourceConflictReport?.lessonRows)
      ? blueprint.sourceConflictReport
      : buildSourceConflictReport(lessons);
  if (lessons.some((lesson) => !lesson.sourceConflict?.status)) {
    lessons = attachSourceConflictSignals(lessons, sourceConflictReport);
  }
  const sourceRiskRegister =
    blueprint.sourceRiskRegister?.status && Array.isArray(blueprint.sourceRiskRegister?.lessonRows)
      ? blueprint.sourceRiskRegister
      : buildSourceRiskRegister({ lessons, assessments });
  lessons = attachCompilerDecisionsToLessons(lessons, assessments, sourceRiskRegister);
  const conceptDependencyGraph =
    blueprint.conceptDependencyGraph?.status && Array.isArray(blueprint.conceptDependencyGraph?.nodes)
      ? blueprint.conceptDependencyGraph
      : buildConceptDependencyGraph({ lessons, assessments });
  if (lessons.some((lesson) => !lesson.conceptDependencyPlan?.node?.concept || !lesson.practiceProgressionPlan)) {
    lessons = attachConceptGraphToLessons(lessons, conceptDependencyGraph);
  }
  if (lessons.some((lesson) => !lesson.masteryEvidencePlan?.diagnosticEvidence)) {
    lessons = attachMasteryEvidenceToLessons(lessons, assessments);
  }
  if (lessons.some((lesson) => !lesson.evidenceResponsePlan?.readyMove)) {
    lessons = attachEvidenceResponseToLessons(lessons);
  }
  if (lessons.some((lesson) => !lesson.objectiveEvidencePlan?.objectiveRows)) {
    lessons = attachObjectiveEvidenceToLessons(lessons, assessments);
  }
  if (shouldRebuildAssessmentAnchors(lessons, assessments)) {
    assessments = buildAssessmentAnchors(lessons);
  }

  const assessmentArchitecture =
    blueprint.assessmentArchitecture?.status && Array.isArray(blueprint.assessmentArchitecture?.lessonRows)
      ? blueprint.assessmentArchitecture
      : buildAssessmentArchitecture({ lessons, assessments });
  const compilerDecisionMatrix =
    blueprint.compilerDecisionMatrix?.status && Array.isArray(blueprint.compilerDecisionMatrix?.lessonRows)
      ? blueprint.compilerDecisionMatrix
      : buildCompilerDecisionMatrix(lessons);
  const alignmentMatrix =
    Array.isArray(blueprint.alignmentMatrix) && blueprint.alignmentMatrix.length === lessons.length
      ? blueprint.alignmentMatrix
      : buildCourseAlignmentMatrix(lessons, assessments);
  const courseArc =
    blueprint.courseArc?.throughline && Array.isArray(blueprint.courseArc?.stages)
      ? blueprint.courseArc
      : buildCourseArc(lessons, conceptDependencyGraph, courseThroughlineContext);
  const classroomHandoffPlan =
    blueprint.classroomHandoffPlan?.status && Array.isArray(blueprint.classroomHandoffPlan?.lessonReviewOrder)
      ? blueprint.classroomHandoffPlan
      : buildClassroomHandoffPlan({
          courseName,
          lessons,
          assessments,
          learnerContextProfile,
          courseModalityProfile,
          sourceRiskRegister,
          assessmentArchitecture,
        });
  const classroomDryRunPlan =
    blueprint.classroomDryRunPlan?.source === 'deterministic-classroom-dry-run-plan'
      ? blueprint.classroomDryRunPlan
      : buildClassroomDryRunPlan({ courseName, lessons, courseModalityProfile, classroomHandoffPlan });
  const classroomEvidenceLoopPlan =
    blueprint.classroomEvidenceLoopPlan?.source === 'deterministic-classroom-evidence-loop'
      ? blueprint.classroomEvidenceLoopPlan
      : buildClassroomEvidenceLoopPlan({
          courseName,
          lessons,
          courseModalityProfile,
          classroomDryRunPlan,
          classroomHandoffPlan,
        });
  const instructorFeedbackLoadPlan =
    blueprint.instructorFeedbackLoadPlan?.source === 'deterministic-instructor-feedback-load-plan'
      ? blueprint.instructorFeedbackLoadPlan
      : buildInstructorFeedbackLoadPlan({
          courseName,
          lessons,
          assessments,
          courseModalityProfile,
          classroomEvidenceLoopPlan,
        });
  const blueprintAssumptionLedger =
    blueprint.blueprintAssumptionLedger?.status && Array.isArray(blueprint.blueprintAssumptionLedger?.rows)
      ? blueprint.blueprintAssumptionLedger
      : buildBlueprintAssumptionLedger({
          courseName,
          lessons,
          learnerContextProfile,
          courseModalityProfile,
          sourceConflictReport,
          sourceRiskRegister,
          assessmentArchitecture,
          compilerDecisionMatrix,
          classroomHandoffPlan,
        });
  const packageCoherenceMatrix =
    blueprint.packageCoherenceMatrix?.status && Array.isArray(blueprint.packageCoherenceMatrix?.lessonRows)
      ? blueprint.packageCoherenceMatrix
      : buildPackageCoherenceMatrix({ lessons, assessments, classroomHandoffPlan });
  const blueprintReviewSurface =
    blueprint.blueprintReviewSurface?.status && Array.isArray(blueprint.blueprintReviewSurface?.lessonRows)
      ? blueprint.blueprintReviewSurface
      : buildBlueprintReviewSurface({
          courseName,
          lessons,
          assessments,
          courseArc,
          enrichment,
          learnerContextProfile,
          courseModalityProfile,
          sourceRiskRegister,
          sourceConflictReport,
          compilerDecisionMatrix,
          assessmentArchitecture,
          blueprintAssumptionLedger,
          packageCoherenceMatrix,
        });

  const preparedWithoutPath = {
    ...blueprint,
    version: blueprint.version || 1,
    source: blueprint.source || 'deterministic-course-map',
    courseName,
    semester: blueprint.semester || publishableCourseTerm(),
    totalLessons: Number.isFinite(Number(blueprint.totalLessons)) ? Number(blueprint.totalLessons) : lessons.length,
    lessons,
    assessments,
    assessmentArchitecture,
    alignmentMatrix,
    courseConcepts,
    courseArc,
    courseThroughlineContext,
    conceptDependencyGraph,
    masteryEvidenceMap: blueprint.masteryEvidenceMap?.status
      ? blueprint.masteryEvidenceMap
      : buildMasteryEvidenceMap(lessons),
    evidenceResponseMap: blueprint.evidenceResponseMap?.status
      ? blueprint.evidenceResponseMap
      : buildEvidenceResponseMap(lessons),
    objectiveEvidenceMap: blueprint.objectiveEvidenceMap?.status
      ? blueprint.objectiveEvidenceMap
      : buildObjectiveEvidenceMap({ lessons, assessments }),
    courseWorkload:
      blueprint.courseWorkload?.averagePerLessonMinutes && Array.isArray(blueprint.courseWorkload?.lessonRows)
        ? blueprint.courseWorkload
        : buildCourseWorkload(lessons),
    learnerContextProfile,
    courseModalityProfile,
    sourceConflictReport,
    sourceRiskRegister,
    compilerDecisionMatrix,
    classroomHandoffPlan,
    classroomDryRunPlan,
    classroomEvidenceLoopPlan,
    instructorFeedbackLoadPlan,
    blueprintAssumptionLedger,
    packageCoherenceMatrix,
    blueprintReviewSurface,
    qualitySignals: blueprint.qualitySignals?.confidenceLevel
      ? blueprint.qualitySignals
      : buildBlueprintQualitySignals(lessons),
    enrichment,
  };
  return {
    ...preparedWithoutPath,
    compilerPath: preparedWithoutPath.compilerPath || buildCompilerPathReceipt(preparedWithoutPath, options),
  };
}

export function buildCompilerProofBundle(blueprint = {}, options = {}) {
  const prepared = deriveBlueprintForCompiler(blueprint, options);
  const semanticContract = options.semanticContract || validateBlueprintSemanticContract(prepared);
  const heavyContract = options.compilerContract || validateCourseBlueprintContract(prepared);
  const proofFindings = [];
  const lessons = Array.isArray(prepared.lessons) ? prepared.lessons : [];
  const lessonCount = lessons.length;

  if (semanticContract.status === 'blocked') {
    proofFindings.push(
      makeContractFinding('blocker', 'semanticContract', 'Semantic blueprint contract blocked compiler proof.'),
    );
  }
  if (prepared.classroomDryRunPlan?.lessonRows?.length !== lessonCount) {
    proofFindings.push(
      makeContractFinding('blocker', 'classroomDryRunPlan', 'Compiler proof has incomplete dry-run rows.'),
    );
  }
  if (prepared.classroomEvidenceLoopPlan?.lessonRows?.length !== lessonCount) {
    proofFindings.push(
      makeContractFinding('blocker', 'classroomEvidenceLoopPlan', 'Compiler proof has incomplete evidence-loop rows.'),
    );
  }
  if (prepared.instructorFeedbackLoadPlan?.lessonRows?.length !== lessonCount) {
    proofFindings.push(
      makeContractFinding('blocker', 'instructorFeedbackLoadPlan', 'Compiler proof has incomplete feedback-load rows.'),
    );
  }
  if (prepared.packageCoherenceMatrix?.lessonRows?.length !== lessonCount) {
    proofFindings.push(
      makeContractFinding('blocker', 'packageCoherenceMatrix', 'Compiler proof has incomplete coherence rows.'),
    );
  }
  if (prepared.blueprintReviewSurface?.traceabilitySummary?.untraceableRows > 0) {
    proofFindings.push(
      makeContractFinding('warning', 'blueprintReviewSurface', 'Compiler proof has untraceable review rows.'),
    );
  }

  const proofStatus = contractStatus(proofFindings);
  return {
    version: 1,
    source: 'deterministic-compiler-proof-bundle',
    status: proofStatus,
    modelFallback: 'not used for blueprint-compiled deliverables',
    semanticContract,
    legacyCompilerContract: compactBlueprintContract(heavyContract),
    compilerPath: prepared.compilerPath,
    sourceConflictReport: prepared.sourceConflictReport,
    sourceRiskRegister: prepared.sourceRiskRegister,
    compilerDecisionMatrix: prepared.compilerDecisionMatrix,
    assessmentArchitecture: prepared.assessmentArchitecture,
    classroomHandoffPlan: prepared.classroomHandoffPlan,
    classroomDryRunPlan: prepared.classroomDryRunPlan,
    classroomEvidenceLoopPlan: prepared.classroomEvidenceLoopPlan,
    instructorFeedbackLoadPlan: prepared.instructorFeedbackLoadPlan,
    blueprintAssumptionLedger: prepared.blueprintAssumptionLedger,
    packageCoherenceMatrix: prepared.packageCoherenceMatrix,
    blueprintReviewSurface: prepared.blueprintReviewSurface,
    courseWorkload: prepared.courseWorkload,
    proofSummary: {
      lessonCount,
      assessmentCount: prepared.assessments.length,
      semanticStatus: semanticContract.status,
      legacyCompilerStatus: heavyContract.status,
      dryRunRows: prepared.classroomDryRunPlan?.lessonRows?.length || 0,
      evidenceLoopRows: prepared.classroomEvidenceLoopPlan?.lessonRows?.length || 0,
      feedbackLoadRows: prepared.instructorFeedbackLoadPlan?.lessonRows?.length || 0,
      coherenceRows: prepared.packageCoherenceMatrix?.lessonRows?.length || 0,
      reviewSurfaceTraceability: prepared.blueprintReviewSurface?.traceabilitySummary?.status || 'missing',
      verificationStatus: proofStatus === 'blocked' ? 'blocked' : 'verified-by-reading-derived-state',
    },
    findings: proofFindings,
  };
}

function prepareBlueprintForCompilation(blueprint = {}, options = {}) {
  const prepared = deriveBlueprintForCompiler(blueprint, options);
  const semanticContract = validateBlueprintSemanticContract(prepared);
  const compilerContract = validateCourseBlueprintContract(prepared);
  const compilerProofBundle = buildCompilerProofBundle(prepared, {
    ...options,
    semanticContract,
    compilerContract,
  });
  return {
    ...prepared,
    semanticContract,
    compilerContract,
    compilerProofBundle,
  };
}

export function hydrateBlueprintForCompilation(blueprint = {}, options = {}) {
  return prepareBlueprintForCompilation(blueprint, options);
}

export function validateCompilerOutputContract({ blueprint = {}, compiled = {}, featureIds = [], options = {} } = {}) {
  const prepared = prepareBlueprintForCompilation(blueprint, options);
  const proofBundle = prepared.compilerProofBundle;
  const requestedFeatures =
    featureIds.length > 0 ? getBlueprintCompiledFeatures(featureIds, options) : Object.keys(compiled);
  const findings = [];

  if (prepared.semanticContract.status === 'blocked') {
    findings.push(
      makeContractFinding('blocker', 'semanticContract', 'Compiled output is based on a blocked semantic blueprint.'),
    );
  }
  if (proofBundle.status === 'blocked') {
    findings.push(makeContractFinding('blocker', 'proofBundle', 'Compiler proof bundle is blocked.'));
  }
  for (const featureId of requestedFeatures) {
    if (!compiled?.[featureId]) {
      findings.push(
        makeContractFinding('blocker', 'compiledFeatureMissing', `Compiled output is missing ${featureId}.`),
      );
    }
  }

  const lessonCount = prepared.lessons.length;
  if (compiled.lessonPlans?.lessonPlans && compiled.lessonPlans.lessonPlans.length !== lessonCount) {
    findings.push(
      makeContractFinding('blocker', 'lessonPlanCoverage', 'Compiled lesson plans do not cover every lesson.'),
    );
  }
  if (compiled.syllabus?.syllabus?.blueprintQualityReceipt) {
    const receipt = compiled.syllabus.syllabus.blueprintQualityReceipt;
    if (receipt.compilerProofBundle?.proofSummary?.verificationStatus !== 'verified-by-reading-derived-state') {
      findings.push(
        makeContractFinding('warning', 'receiptVerification', 'Syllabus receipt is missing proof-bundle verification.'),
      );
    }
  }

  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  return {
    version: 1,
    contractType: 'compiler-output',
    status: contractStatus(findings),
    blockerCount,
    warningCount,
    lessonCount,
    requestedFeatureCount: requestedFeatures.length,
    compiledFeatureCount: requestedFeatures.filter((featureId) => compiled?.[featureId]).length,
    proofBundleStatus: proofBundle.status,
    semanticStatus: prepared.semanticContract.status,
    findings,
  };
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map((item) => clonePlain(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.getOwnPropertyNames(value).map((key) => [key, clonePlain(value[key])]));
  }
  return value;
}

const BLUEPRINT_STORAGE_VERSION = 2;

const TOP_LEVEL_HYDRATED_BLUEPRINT_KEYS = [
  'assessmentArchitecture',
  'alignmentMatrix',
  'courseArc',
  'courseThroughlineContext',
  'conceptDependencyGraph',
  'masteryEvidenceMap',
  'evidenceResponseMap',
  'objectiveEvidenceMap',
  'courseWorkload',
  'sourceConflictReport',
  'sourceRiskRegister',
  'compilerDecisionMatrix',
  'classroomHandoffPlan',
  'classroomDryRunPlan',
  'classroomEvidenceLoopPlan',
  'instructorFeedbackLoadPlan',
  'blueprintAssumptionLedger',
  'packageCoherenceMatrix',
  'blueprintReviewSurface',
  'compilerPath',
  'semanticContract',
  'compilerContract',
  'compilerProofBundle',
];

const LESSON_STORAGE_KEYS = new Set([
  'id',
  'lessonIndex',
  'lessonNumber',
  'enrichment',
  'title',
  'outcomes',
  'keyConcepts',
  'readings',
  'activityPattern',
  'assessmentLink',
  'assessmentDetails',
  'hasAssessment',
  'assessmentSource',
  'studentArtifact',
  'successCriteria',
  'bloomsLevel',
  'confidence',
  'sourceAnchors',
  'sourceEvidenceTrace',
  'missingSignals',
  'evidencePlan',
  'sourceUsePlan',
]);

const ASSESSMENT_ANCHOR_STORAGE_KEYS = new Set([
  'id',
  'title',
  'artifact',
  'lessonNumbers',
  'relatedLessons',
  'source',
]);

const SOURCE_TRACE_STORAGE_KEYS = new Set([
  'version',
  'sourceKind',
  'lessonNumber',
  'lessonTitle',
  'sourceRowLabel',
  'sourceFields',
  'directCourseMapFieldCount',
  'inferredOrDerivedFields',
  'unsupportedInferencePolicy',
]);

function defineHydratedField(target, key, value) {
  if (!target || value === undefined) return;
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

function attachHydratedFields(target, source, keys) {
  if (!target || !source) return target;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      defineHydratedField(target, key, source[key]);
    }
  }
  return target;
}

function compactObjectByKeys(source = {}, keys = new Set()) {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, value]) => keys.has(key) && value !== undefined)
      .map(([key, value]) => [key, clonePlain(value)]),
  );
}

function compactSourceEvidenceTraceForStorage(trace = {}) {
  if (!trace || typeof trace !== 'object') return trace || null;
  const compact = compactObjectByKeys(trace, SOURCE_TRACE_STORAGE_KEYS);
  const hydratedKeys = Object.getOwnPropertyNames(trace).filter((key) => !SOURCE_TRACE_STORAGE_KEYS.has(key));
  return attachHydratedFields(compact, trace, hydratedKeys);
}

function compactLessonForStorage(lesson = {}) {
  const compact = compactObjectByKeys(lesson, LESSON_STORAGE_KEYS);
  if (lesson.sourceEvidenceTrace) {
    compact.sourceEvidenceTrace = compactSourceEvidenceTraceForStorage(lesson.sourceEvidenceTrace);
  }
  const hydratedKeys = Object.getOwnPropertyNames(lesson).filter((key) => !LESSON_STORAGE_KEYS.has(key));
  return attachHydratedFields(compact, lesson, hydratedKeys);
}

function compactAssessmentAnchorForStorage(assessment = {}) {
  const compact = compactObjectByKeys(assessment, ASSESSMENT_ANCHOR_STORAGE_KEYS);
  const hydratedKeys = Object.getOwnPropertyNames(assessment).filter((key) => !ASSESSMENT_ANCHOR_STORAGE_KEYS.has(key));
  return attachHydratedFields(compact, assessment, hydratedKeys);
}

export function compactBlueprintForStorage(blueprint = {}) {
  const compact = {
    blueprintStorageVersion: BLUEPRINT_STORAGE_VERSION,
    version: blueprint.version || 1,
    source: blueprint.source || 'deterministic-course-map',
    courseName: blueprint.courseName,
    semester: blueprint.semester,
    totalLessons: blueprint.totalLessons,
    lessons: Array.isArray(blueprint.lessons) ? blueprint.lessons.map(compactLessonForStorage) : [],
    assessments: Array.isArray(blueprint.assessments)
      ? blueprint.assessments.map(compactAssessmentAnchorForStorage)
      : [],
    courseConcepts: clonePlain(blueprint.courseConcepts || []),
    learnerContextProfile: clonePlain(blueprint.learnerContextProfile || null),
    courseModalityProfile: clonePlain(blueprint.courseModalityProfile || null),
    enrichment: clonePlain(blueprint.enrichment || null),
    localization: clonePlain(blueprint.localization || null),
    qualitySignals: clonePlain(blueprint.qualitySignals || null),
    policies: clonePlain(blueprint.policies || null),
    designRules: clonePlain(blueprint.designRules || null),
  };
  if (blueprint.instructorPreferenceProfile) {
    compact.instructorPreferenceProfile = clonePlain(blueprint.instructorPreferenceProfile);
  }
  // v0.13.5: knowledge resources stay ENUMERABLE (hydrated fields are dropped
  // by deriveBlueprintForCompiler's spread) and persist with the project —
  // citations are small and exports must survive restore.
  if (Array.isArray(blueprint.knowledgeResources) && blueprint.knowledgeResources.length > 0) {
    compact.knowledgeResources = clonePlain(blueprint.knowledgeResources);
  }
  return attachHydratedFields(compact, blueprint, TOP_LEVEL_HYDRATED_BLUEPRINT_KEYS);
}

function blueprintContractForCompilation(blueprint) {
  return blueprint?.semanticContract || validateBlueprintSemanticContract(blueprint);
}

function formatContractFailure(contract) {
  const findings = Array.isArray(contract?.findings) ? contract.findings : [];
  const firstFindings = findings
    .filter((finding) => finding.severity === 'blocker')
    .slice(0, 3)
    .map((finding) => `${finding.code}${finding.lessonNumber ? ` L${finding.lessonNumber}` : ''}`)
    .join(', ');
  return firstFindings || contract?.status || 'unknown contract failure';
}

function assertBlueprintCompilerContract(blueprint, options = {}) {
  const contract = blueprintContractForCompilation(blueprint);
  if (options.enforceCompilerContract === false) return contract;
  if (contract.status === 'blocked') {
    throw new Error(`Blueprint compiler contract blocked compilation: ${formatContractFailure(contract)}.`);
  }
  return contract;
}

function compactWorkloadEstimate(workload = {}) {
  const total = Number(workload.totalStudentMinutes || 0);
  const beforeClassMinutes = Number(workload.beforeClassMinutes || 0);
  const inClassMinutes = Number(workload.inClassMinutes || 0);
  const afterClassMinutes = Number(workload.afterClassMinutes || 0);
  const outOfClassMinutes = beforeClassMinutes + afterClassMinutes;
  return {
    beforeClassMinutes,
    inClassMinutes,
    afterClassMinutes,
    outOfClassMinutes,
    totalStudentMinutes: total,
    estimatedHours: total ? Number((total / 60).toFixed(1)) : 0,
    studentFacingEstimate:
      workload.studentFacingEstimate ||
      (total ? `${Math.round(total / 30) / 2} hours including class time` : 'Instructor-confirmed workload'),
  };
}

function compactCourseWorkloadBalance(courseWorkload = {}) {
  const rows = Array.isArray(courseWorkload.lessonRows) ? courseWorkload.lessonRows : [];
  return {
    status: courseWorkload.workloadBalanceStatus || 'missing',
    averagePerLessonHours: courseWorkload.averagePerLessonHours || 0,
    averageOutOfClassMinutes: courseWorkload.averageOutOfClassMinutes || 0,
    maxOutOfClassMinutes: courseWorkload.maxOutOfClassMinutes || 0,
    maxTotalStudentMinutes: courseWorkload.maxTotalStudentMinutes || 0,
    workloadReviewCount: courseWorkload.workloadReviewCount || 0,
    spikeThreshold: courseWorkload.spikeThreshold || 0,
    lessonRows: rows.map((row) => ({
      lessonNumber: row.lessonNumber,
      outOfClassMinutes: row.outOfClassMinutes,
      totalStudentMinutes: row.totalStudentMinutes,
      workloadFit: row.workloadFit,
      workloadSpike: Boolean(row.workloadSpike),
      studentFacingEstimate: row.studentFacingEstimate,
    })),
  };
}

function hoursLabelFromMinutes(minutes) {
  const total = Number(minutes || 0);
  if (!total) return '';
  const hours = Math.round((total / 60) * 10) / 10;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${label} ${hours === 1 ? 'hour' : 'hours'}`;
}

function assignmentTypeForArtifactGenre(artifactGenre = {}, assessment = {}) {
  const genre = artifactGenre.genre || '';
  const typeByGenre = {
    'clinical-placement-evidence': 'Clinical placement evidence and preceptor-feedback record',
    'clinical-care-plan': 'Clinical care plan and safety rationale',
    'performance-simulation': 'Performance simulation',
    'design-prototype': 'Prototype and rationale',
    'analysis-log': 'Analysis log',
    'engineering-design-test': 'Engineering design test report',
    'ethical-argument-brief': 'Ethical argument brief',
    'economic-analysis-brief': 'Economic analysis brief',
    'statistical-inference-report': 'Statistical inference report',
    'financial-analysis-report': 'Financial analysis report',
    'policy-brief': 'Policy analysis memo',
    'source-evaluation-dossier': 'Source evaluation dossier',
    'teaching-plan-portfolio': 'Teaching plan portfolio',
    'case-conceptualization': 'Case conceptualization and helping-skills record',
    'data-science-notebook': 'Data science notebook and validation evidence',
    'code-lab': 'Code lab and test evidence',
    'lab-report': 'Lab report and notebook entry',
    'problem-set': 'Worked problem set',
    'proof-portfolio': 'Proof portfolio and theorem justification',
    'capstone-project': 'Capstone project milestone',
    'competency-evidence': 'Competency evidence portfolio',
    'creative-portfolio': 'Creative revision portfolio',
    'case-analysis': 'Case analysis memo',
    'legal-analysis': 'Legal analysis memo',
    'close-reading-analysis': 'Interpretive analysis portfolio',
    'language-performance': 'Communicative language performance',
    'performance-rehearsal': 'Performance rehearsal portfolio',
    'field-evidence': 'Field evidence memo',
    'literature-synthesis': 'Literature synthesis',
    'memo-brief': 'Focused memo or brief',
    'checkpoint-response': 'Checkpoint response',
    presentation: 'Presentation with support notes',
    'reflection-response': 'Reflective response',
    'applied-artifact': 'Applied artifact',
  };
  return typeByGenre[genre] || sentenceCase(assessment.roleLabel || 'Applied artifact');
}

function assignmentTypeWithArticle(assignmentType = 'applied artifact') {
  const label = cleanText(assignmentType).toLowerCase();
  if (!label) return 'an applied artifact';
  const article = /^[aeiou]/.test(label) ? 'an' : 'a';
  return `${article} ${label}`;
}

function buildAssignmentWorkloadProfile(lesson = {}) {
  const compact = compactWorkloadEstimate(lesson.workloadEstimate || {});
  const outOfClass = compact.outOfClassMinutes;
  const outsideLabel = hoursLabelFromMinutes(outOfClass);
  const classLabel = hoursLabelFromMinutes(compact.inClassMinutes);
  return {
    ...compact,
    studentFacingEstimate: compact.studentFacingEstimate,
    outOfClassEstimate: outsideLabel
      ? `${outsideLabel} outside class (${compact.beforeClassMinutes} min prep, ${compact.afterClassMinutes} min revision/submission)`
      : 'Out-of-class workload should be confirmed locally',
    classSupportedPractice: classLabel
      ? `${classLabel} of class-supported practice`
      : 'Class-supported practice follows the local meeting pattern',
    workloadFit: classifyOutOfClassWorkload(outOfClass),
  };
}

function buildAssignmentSubmissionProfile({ lesson = {}, assessment = {}, lens = {} }) {
  const artifactGenre = lesson.artifactGenre || {};
  const assignmentType = assignmentTypeForArtifactGenre(artifactGenre, assessment);
  const workload = buildAssignmentWorkloadProfile(lesson);
  const artifact = stripTerminalPunctuation(assessment.artifact || lesson.studentArtifact || assessment.title);
  const lessonTitle = stripLessonPrefix(lesson.title || assessment.relatedLessons?.[0] || assessment.title);
  const expectedFormat =
    artifactGenre.outputFormat ||
    `${artifact}: course-specific applied artifact with evidence, decision logic, and revision trace`;
  const evidenceRequirement =
    artifactGenre.evidenceRequirement ||
    `For ${artifact}, require specific ${lens.evidenceNoun || 'course evidence'}, a visible decision, and one revision note.`;
  const reviewProtocol =
    artifactGenre.reviewProtocol ||
    `Check ${artifact} against the success criteria, identify one missing evidence link, and revise before submission.`;
  const qualityFocus =
    artifactGenre.qualityFocus ||
    `concept accuracy, evidence specificity, decision logic, and revision quality for ${artifact}`;
  return {
    assignmentType,
    artifactGenre: artifactGenre.genre || 'applied-artifact',
    artifactGenreLabel: artifactGenre.label || assignmentType,
    artifact,
    domainContext: lens.domain || '',
    expectedFormat,
    evidenceRequirement,
    qualityFocus,
    reviewProtocol,
    commonFailure:
      artifactGenre.commonFailure ||
      'students complete the task format without making the evidence decision inspectable',
    revisionMove:
      artifactGenre.revisionMove ||
      assessment.feedbackCycle?.studentRevisionAction ||
      assessment.feedbackUse ||
      `Revise ${artifact} by strengthening one ${lessonTitle} evidence link.`,
    submissionMode: `Submit ${artifact} through the official course site as ${assignmentTypeWithArticle(assignmentType)} with headings or sections that make the evidence standard visible.`,
    estimatedTime: workload.studentFacingEstimate,
    workload,
    localAdaptationCue: `Confirm local length, tool, accessibility, privacy, and LMS expectations before publishing ${artifact}.`,
    localReviewAction: lessonLocalReviewAction(lesson),
  };
}

function assignmentChecklistResourceLabel({ submissionProfile = {}, lesson = {}, assessment = {} } = {}) {
  const artifactLabel = cleanText(
    submissionProfile.artifactGenreLabel || submissionProfile.assignmentType || 'Assignment',
    'Assignment',
  );
  const lessonFocus = conciseClause(
    stripLessonPrefix(lesson.title || assessment.relatedLessons?.[0] || assessment.title),
    'this lesson',
    42,
  );
  return `${artifactLabel} checklist for ${lessonFocus}: evidence, reasoning, format, revision.`;
}

function lessonSourceGrounding(lesson, extras = {}) {
  return {
    lessonNumber: lesson?.lessonNumber || null,
    lessonTitle: lesson?.title || '',
    confidence: lesson?.confidence?.level || 'medium',
    sourceAnchors: clonePlain(lesson?.sourceAnchors || []),
    sourceEvidenceTrace: clonePlain(lesson?.sourceEvidenceTrace || null),
    sourceRisk: clonePlain(lesson?.sourceRisk || null),
    compilerDecision: clonePlain(lesson?.compilerDecision || null),
    localReviewNeeded: clonePlain(lesson?.missingSignals || []),
    evidencePlan: clonePlain(lesson?.evidencePlan || null),
    sourceUsePlan: clonePlain(lesson?.sourceUsePlan || null),
    throughlineCase: clonePlain(lesson?.throughlineCase || null),
    classSessionPlan: clonePlain(lesson?.classSessionPlan || null),
    misconceptionFocus: lesson?.misconceptionMap?.[0]?.misconception || '',
    modelContrast: clonePlain(lesson?.modelContrast || null),
    readinessSupport: clonePlain(lesson?.readinessSupport || null),
    prerequisitePlan: clonePlain(lesson?.prerequisitePlan || null),
    conceptDependencyPlan: clonePlain(lesson?.conceptDependencyPlan || null),
    practiceProgressionPlan: clonePlain(lesson?.practiceProgressionPlan || null),
    objectiveEvidencePlan: clonePlain(lesson?.objectiveEvidencePlan || null),
    masteryEvidencePlan: clonePlain(lesson?.masteryEvidencePlan || null),
    evidenceResponsePlan: clonePlain(lesson?.evidenceResponsePlan || null),
    instructionalRationale: clonePlain(lesson?.instructionalRationale || null),
    accessibilityPlan: clonePlain(lesson?.accessibilityPlan || null),
    feedbackCycle: clonePlain(lesson?.feedbackCycle || null),
    learningTransferPlan: clonePlain(lesson?.learningTransferPlan || null),
    teachingIntent: clonePlain(lesson?.teachingIntent || null),
    workloadEstimate: compactWorkloadEstimate(lesson?.workloadEstimate || {}),
    difficultyProfile: clonePlain(lesson?.difficultyProfile || null),
    artifactConnection: lesson?.studentArtifact || '',
    successCriteria: clonePlain(lesson?.successCriteria || []),
    feedbackUse: lesson?.feedbackCycle?.nextUse || lesson?.feedbackMoment || '',
    bloomInference: clonePlain(lesson?.bloomInference || null),
    learnerContextCue: lesson?.learnerContextCue || '',
    modalityCue: lesson?.modalityCue || '',
    modalityDecode: clonePlain(lesson?.modalityDecode || null),
    artifactGenre: clonePlain(lesson?.artifactGenre || null),
    reviewActionability: buildLessonReviewActionability(lesson),
    ...extras,
  };
}

function lessonLocalReviewAction(lesson) {
  const rawAction = cleanText(
    lesson?.compilerDecision?.reviewFocus?.[0] ||
      lesson?.sourceRisk?.reviewFocus?.[0] ||
      lesson?.sourceUsePlan?.localReplacementCue ||
      lesson?.accessibilityPlan?.accommodationReviewCue ||
      '',
  );
  const lessonTitle = stripLessonPrefix(lesson?.title || 'this lesson');
  const artifact = stripTerminalPunctuation(lesson?.studentArtifact || 'the lesson artifact');
  const fallback = lesson?.compilerDecision?.reviewRequired
    ? `Confirm source evidence, assessment details, and local constraints for ${lessonTitle} before publishing.`
    : `Spot-check official dates, policies, source permissions, local examples, and ${artifact} expectations for ${lessonTitle} before publishing.`;
  const base = rawAction || fallback;
  const lowered = base.toLowerCase();
  const hasLessonCue = lessonTitle && lowered.includes(lessonTitle.toLowerCase());
  const hasArtifactCue = artifact && lowered.includes(artifact.toLowerCase());
  if (hasLessonCue || hasArtifactCue) return base;
  return `${stripTerminalPunctuation(base)} Review ${lessonTitle} and ${artifact} before publishing.`;
}

function buildLessonReviewActionability(lesson) {
  const publishGate = lesson?.compilerDecision?.publishGate || '';
  const reviewRequired = Boolean(lesson?.compilerDecision?.reviewRequired);
  const reviewerAction = lessonLocalReviewAction(lesson);
  return {
    version: 1,
    status: reviewRequired ? 'local-review-required' : 'spot-check-ready',
    reviewRequired,
    publishGate,
    reviewerAction,
    sourceRiskLevel: lesson?.sourceRisk?.riskLevel || lesson?.compilerDecision?.evidence?.sourceRiskLevel || 'unknown',
    assessmentSource: lesson?.compilerDecision?.evidence?.assessmentSource || lesson?.assessmentSource || 'unknown',
    localReviewNeeded: clonePlain(lesson?.missingSignals || []),
    publishBoundary: reviewRequired
      ? `Hold ${stripLessonPrefix(lesson?.title)} for local confirmation before classroom publication.`
      : `Publish ${stripLessonPrefix(lesson?.title)} after instructor spot-check of official facts and source permissions.`,
  };
}

function buildLessonLearnerContextCue(profile = {}, lesson = {}) {
  const role = profile.learnerRole || 'course learner';
  const evidenceNoun = profile.evidenceNoun || 'course evidence';
  const decisionNoun = profile.decisionNoun || 'course decision';
  const concept = lesson?.keyConcepts?.[0] || stripLessonPrefix(lesson?.title) || 'the lesson focus';
  const artifact = stripTerminalPunctuation(lesson?.studentArtifact || 'the lesson artifact');
  const support =
    lesson?.readinessSupport?.supportMove ||
    profile.supportAssumptions?.[0] ||
    'provide a concrete model before asking students to work independently';
  return `${stripLessonPrefix(lesson?.title)} treats students as ${role}s: they need to connect ${concept} ${evidenceNoun} to ${artifact}, make a ${decisionNoun}, and use support such as ${support}`;
}

function lessonLearnerContextCue(blueprint, lesson) {
  return lesson?.learnerContextCue || buildLessonLearnerContextCue(blueprint?.learnerContextProfile || {}, lesson);
}

function extractLessonBlueprint(lesson, originalIndex) {
  const lessonNumber = originalIndex + 1;
  const sourceLessonTitle = cleanText(lesson?.title || lesson?.lessonTitle || lesson?.lt || '');
  const rawLessonTitle = stripLessonPrefix(lesson?.title || lesson?.lessonTitle || lesson?.lt || '');
  const hasTitle = Boolean(rawLessonTitle) && !isWeakConcept(rawLessonTitle);
  let title = lessonTitle(lesson, lessonNumber);
  const objectiveText = extractColumn(lesson, 'learningObjectives');
  const goalText = extractColumn(lesson, 'learningGoals');
  const topicText = extractColumn(lesson, 'topicSection');
  const resourceText = extractColumn(lesson, 'supportingResources');
  const asyncActivityText = extractColumn(lesson, 'asyncActivities');
  const syncActivityText = extractColumn(lesson, 'syncActivities');
  const objectiveEntries = meaningfulEntries(splitList(objectiveText).map((item) => normalizeObjectiveText(item)));
  const goalEntries = meaningfulEntries(splitList(goalText));
  const hasObjectives = objectiveEntries.length > 0;
  const hasGoals = goalEntries.length > 0;
  const objectives = unique(objectiveEntries.length > 0 ? objectiveEntries : goalEntries, 5);
  const topicEntries = meaningfulEntries(splitList(topicText));
  const hasTopics = topicEntries.length > 0;
  const topics = normalizeConceptCandidates(topicEntries.length > 0 ? topicEntries : goalEntries, { title, limit: 8 });
  const topicTitleFallback = titleFallbackFromTopics(topicEntries.length > 0 ? topicEntries : topics);
  if (isWeakConcept(stripLessonPrefix(title)) && topicTitleFallback) {
    title = `Lesson ${lessonNumber}: ${topicTitleFallback}`;
  }
  const rawTitleConcept = stripLessonPrefix(title);
  const titleConcepts =
    isWeakConcept(rawTitleConcept) || isOverbroadLessonTitleConcept(rawTitleConcept, title)
      ? wordsFromConcepts([rawTitleConcept], 4)
      : unique([rawTitleConcept].concat(wordsFromConcepts([rawTitleConcept], 4)), 4);
  const resources = unique(meaningfulEntries(splitList(resourceText)), 6);
  const asyncActivities = meaningfulEntries(splitList(asyncActivityText));
  const syncActivities = meaningfulEntries(splitList(syncActivityText));
  const activities = [...syncActivities, ...asyncActivities];
  const hasActivities = activities.length > 0;
  const hasResources = resources.length > 0;
  const weeklyAssessmentText = extractColumn(lesson, 'weeklyAssessments');
  const evaluationDesignText = extractColumn(lesson, 'evaluateDesign');
  const weeklyAssessmentEntries = meaningfulEntries(splitList(weeklyAssessmentText));
  const evaluationDesignEntries = meaningfulEntries(splitList(evaluationDesignText));
  const hasWeeklyAssessment = weeklyAssessmentEntries.length > 0 && hasMeaningfulAssessment(weeklyAssessmentText);
  const hasEvaluationDesign = evaluationDesignEntries.length > 0 && hasMeaningfulAssessment(evaluationDesignText);
  const hasAssessmentPlaceholder = containsWeakPlaceholder(weeklyAssessmentText);
  const assessmentText = hasWeeklyAssessment
    ? weeklyAssessmentEntries.join('; ')
    : hasEvaluationDesign
      ? evaluationDesignEntries.join('; ')
      : firstNonEmpty(weeklyAssessmentText, evaluationDesignText);
  const hasAssessment = hasWeeklyAssessment || hasEvaluationDesign;
  const concepts = normalizeConceptCandidates(
    [...titleConcepts, ...topics, ...wordsFromConcepts([...titleConcepts, ...topics, ...objectives], 5)],
    { title, limit: 8 },
  );
  const keyConcepts =
    concepts.length > 0
      ? concepts
      : [
          topics.find((topic) => !isWeakConcept(topic)) ||
            wordsFromConcepts([objectiveText, topicText, title], 1)[0] ||
            'the lesson focus',
        ];
  const outcomes = objectives.length > 0 ? objectives : [objectiveForLesson(title, keyConcepts)];
  const bloomInference = inferBloomLevelFromSignals([
    { source: hasObjectives ? 'learning objectives' : 'derived objectives', text: outcomes.join('; ') },
    {
      source: hasWeeklyAssessment
        ? 'weekly assessment'
        : hasEvaluationDesign
          ? 'evaluation design'
          : 'assessment fallback',
      text: assessmentText,
    },
    { source: hasActivities ? 'learning activities' : 'activity fallback', text: activities.join('; ') },
    { source: hasGoals ? 'learning goals' : 'goal fallback', text: goalText },
    { source: hasTopics ? 'topics' : 'topic fallback', text: topics.join('; ') },
    { source: hasTitle ? 'lesson title' : 'title fallback', text: title },
  ]);
  const bloomsLevel = bloomInference.level;
  const synthesizedAssessment = buildSyntheticAssessment({
    title,
    concepts: keyConcepts,
    outcomes,
    activities,
    bloomsLevel,
  });
  const assessmentLink = hasAssessment ? assessmentText : synthesizedAssessment;
  const studentArtifact = hasAssessment
    ? buildStudentArtifactLabel(assessmentText, title, synthesizedAssessment)
    : synthesizedAssessment;
  const confidence = buildLessonConfidence({
    hasTitle,
    hasObjectives,
    hasGoals,
    hasTopics,
    hasActivities,
    hasResources,
    hasWeeklyAssessment,
    hasEvaluationDesign,
    hasAssessmentPlaceholder,
  });
  const missingSignals = buildMissingSignals({
    hasTitle,
    hasObjectives,
    hasTopics,
    hasActivities,
    hasResources,
    hasWeeklyAssessment,
    hasEvaluationDesign,
    hasAssessmentPlaceholder,
  });
  const sourceAnchors = [
    sourceAnchor(
      'title',
      isWeakConcept(rawLessonTitle) ? 'derived-from-topics' : lesson?.title ? 'course-map' : 'compiler-inferred',
      title,
      confidence.fields.title.confidence,
    ),
    sourceAnchor(
      'objectives',
      hasObjectives ? 'course-map' : hasGoals ? 'derived-from-goals' : 'compiler-inferred',
      outcomes.join('; '),
      confidence.fields.objectives.confidence,
    ),
    sourceAnchor(
      'topics',
      hasTopics ? 'course-map' : hasGoals ? 'derived-from-goals' : 'compiler-inferred',
      topics.join('; '),
      confidence.fields.topics.confidence,
    ),
    sourceAnchor(
      'assessment',
      confidence.fields.assessment.source,
      assessmentLink,
      confidence.fields.assessment.confidence,
    ),
    sourceAnchor(
      'resources',
      hasResources ? 'course-map' : 'compiler-inferred',
      resources.join('; ') || 'Instructor-provided course materials and notes',
      confidence.fields.resources.confidence,
    ),
  ];
  const workloadEstimate = buildWorkloadEstimate({ resources, hasAssessment, bloomsLevel });
  const difficultyProfile = buildDifficultyProfile({
    originalIndex,
    bloomsLevel,
    hasAssessment,
    concepts: keyConcepts,
  });
  const evidencePlan = buildEvidencePlan({
    title,
    concepts: keyConcepts,
    resources: resources.length > 0 ? resources : ['Instructor-provided course materials and notes'],
    activities,
    artifact: studentArtifact,
  });
  const sourceUsePlan = buildSourceUsePlan({
    title,
    concepts: keyConcepts,
    resources: resources.length > 0 ? resources : ['Instructor-provided course materials and notes'],
    evidencePlan,
    artifact: studentArtifact,
  });
  const misconceptionMap = buildMisconceptionMap({ title, concepts: keyConcepts, artifact: studentArtifact });
  const modelContrast = buildModelContrast({
    title,
    concepts: keyConcepts,
    artifact: studentArtifact,
    evidencePlan,
  });
  const readinessSupport = buildReadinessSupportPlan({
    title,
    concepts: keyConcepts,
    artifact: studentArtifact,
    evidencePlan,
  });
  const instructionalRationale = buildInstructionalRationale({
    title,
    concepts: keyConcepts,
    artifact: studentArtifact,
    evidencePlan,
    readinessSupport,
    difficultyProfile,
  });
  const accessibilityPlan = buildAccessibilityPlan({
    title,
    concepts: keyConcepts,
    artifact: studentArtifact,
    evidencePlan,
    readinessSupport,
  });
  const feedbackCycle = buildFeedbackCycle({
    title,
    concepts: keyConcepts,
    artifact: studentArtifact,
    evidencePlan,
  });
  const activityPattern = firstNonEmpty(
    activities.join('; '),
    `Concept model, applied practice, peer discussion, and individual reflection for ${stripLessonPrefix(title)}.`,
  );
  const readings = resources.length > 0 ? resources : ['Instructor-provided course materials and notes'];
  const sourceEvidenceTrace = buildSourceEvidenceTrace({
    lessonNumber,
    title,
    sourceSections: lesson?.sections,
    sourceLessonTitle,
    rawLessonTitle,
    objectiveText,
    goalText,
    topicText,
    resourceText,
    asyncActivityText,
    syncActivityText,
    weeklyAssessmentText,
    evaluationDesignText,
    outcomes,
    topics,
    activityPattern,
    readings,
    assessmentLink,
    confidence,
    hasTitle,
    hasObjectives,
    hasGoals,
    hasTopics,
    hasActivities,
    hasResources,
    hasWeeklyAssessment,
    hasEvaluationDesign,
    hasAssessmentPlaceholder,
  });

  return {
    id: `lesson-${lessonNumber}`,
    lessonIndex: originalIndex,
    lessonNumber,
    title,
    outcomes,
    keyConcepts,
    readings,
    activityPattern,
    assessmentLink,
    assessmentDetails: assessmentText,
    hasAssessment,
    assessmentSource: confidence.fields.assessment.source,
    studentArtifact,
    successCriteria: successCriteriaForLesson(title, concepts),
    feedbackMoment: feedbackCycle.nextUse,
    slideNarrative: `Introduce ${stripLessonPrefix(title)}, model the core concept, apply it to a case, and close with a decision checkpoint.`,
    quizTargets: outcomes.slice(0, 3),
    faqNeeds: [`What should I focus on in ${title}?`, `How does ${stripLessonPrefix(title)} connect to graded work?`],
    bloomsLevel,
    bloomInference,
    confidence,
    sourceAnchors,
    sourceEvidenceTrace,
    missingSignals,
    workloadEstimate,
    difficultyProfile,
    evidencePlan,
    sourceUsePlan,
    misconceptionMap,
    modelContrast,
    readinessSupport,
    instructionalRationale,
    accessibilityPlan,
    feedbackCycle,
  };
}

function selectedLessonEntries(courseMap, scopeIndices = null) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (Array.isArray(scopeIndices) && scopeIndices.length > 0) {
    return scopeIndices
      .map((originalIndex, position) => ({
        lesson: lessons[originalIndex] || lessons[position],
        originalIndex: Number.isInteger(originalIndex) ? originalIndex : position,
      }))
      .filter(({ lesson }) => lesson);
  }
  return lessons.map((lesson, originalIndex) => ({ lesson, originalIndex }));
}

function distributePercent(count) {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? 100 - base * (count - 1) : base));
}

function distributeWeightedPercent(rawWeights = []) {
  if (rawWeights.length === 0) return [];
  const safeWeights = rawWeights.map((weight) => Math.max(1, Number(weight || 0)));
  const total = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const exact = safeWeights.map((weight) => (weight / total) * 100);
  const floored = exact.map((weight) => Math.floor(weight));
  let remainder = 100 - floored.reduce((sum, weight) => sum + weight, 0);
  const order = exact
    .map((weight, index) => ({ index, fraction: weight - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const item of order) {
    if (remainder <= 0) break;
    floored[item.index] += 1;
    remainder -= 1;
  }
  return floored;
}

function extractPercentWeights(text = '') {
  const source = cleanText(text);
  if (!source) return [];
  const matches = [...source.matchAll(/\b(\d{1,3})(?:\s*%(?=\s|$|[),.;:])|\s+percent\b)/gi)]
    .map((match) => ({
      value: Number(match[1]),
      evidence: source.slice(Math.max(0, match.index - 50), Math.min(source.length, match.index + 80)),
    }))
    .filter((match) => Number.isFinite(match.value) && match.value > 0 && match.value <= 100);
  return matches;
}

function sourceWeightEvidenceTextForLesson(lesson = {}) {
  const sourceFields = Array.isArray(lesson.sourceEvidenceTrace?.sourceFields)
    ? lesson.sourceEvidenceTrace.sourceFields
    : [];
  const assessmentField = sourceFields.find((field) => field.field === 'assessment artifact');
  return [
    lesson.studentArtifact,
    assessmentField?.rawText,
    assessmentField?.compiledValue,
    lesson.sourceEvidenceTrace?.sourceRowLabel,
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(' ');
}

function extractSourceWeightPercent(lesson = {}) {
  const evidenceText = sourceWeightEvidenceTextForLesson(lesson);
  const matches = extractPercentWeights(evidenceText);
  if (matches.length === 0) return null;
  const selected =
    matches.find((match) => /\b(weight|worth|grade|grading|percent|%)\b/i.test(match.evidence)) || matches[0];
  return {
    percent: selected.value,
    evidence: selected.evidence,
  };
}

function buildAssessmentWeightPlan(lessons = [], roleDescriptors = []) {
  const explicitWeights = lessons.map(extractSourceWeightPercent);
  const explicitCount = explicitWeights.filter(Boolean).length;
  const roleWeights = distributeWeightedPercent(roleDescriptors.map((descriptor) => descriptor.rawWeight));
  if (lessons.length === 0) {
    return {
      sourceStatus: 'missing',
      weights: [],
      rows: [],
      explicitWeightCount: 0,
      compilerDistributedWeightCount: 0,
      reviewRequiredCount: 0,
      sourceWeightTotal: 0,
      policy: 'No assessment rows were available; local grading weights must be supplied before publication.',
    };
  }

  const sourceWeightTotal = explicitWeights.reduce((sum, item) => sum + Number(item?.percent || 0), 0);
  let sourceStatus = 'compiler-distributed-draft';
  let weights = roleWeights.length > 0 ? roleWeights : distributePercent(lessons.length);
  let reviewReason =
    'No source grading percentages were detected, so the compiler distributed draft weights from assessment roles.';

  if (explicitCount === lessons.length && sourceWeightTotal === 100) {
    sourceStatus = 'source-explicit';
    weights = explicitWeights.map((item) => item.percent);
    reviewReason = 'Every assessment had source-map grading percentages totaling 100%.';
  } else if (explicitCount > 0 && sourceWeightTotal < 100) {
    sourceStatus = 'mixed-source-and-compiler-distributed';
    const remaining = 100 - sourceWeightTotal;
    const missingIndexes = explicitWeights
      .map((item, index) => (item ? null : index))
      .filter((index) => Number.isInteger(index));
    const missingRawWeights = missingIndexes.map((index) => roleDescriptors[index]?.rawWeight || 1);
    const missingDistributed = distributeWeightedPercent(missingRawWeights).map((weight) =>
      Math.round((weight / 100) * remaining),
    );
    const distributedSum = missingDistributed.reduce((sum, value) => sum + value, 0);
    if (missingDistributed.length > 0 && distributedSum !== remaining) {
      missingDistributed[missingDistributed.length - 1] += remaining - distributedSum;
    }
    weights = lessons.map((_, index) => {
      if (explicitWeights[index]) return explicitWeights[index].percent;
      const missingPosition = missingIndexes.indexOf(index);
      return missingDistributed[missingPosition] || 0;
    });
    reviewReason =
      'Some assessments had source-map percentages; the compiler distributed the remaining weight across unweighted assessments.';
  } else if (explicitCount > 0) {
    sourceStatus = 'source-weight-conflict-normalized-draft';
    weights = roleWeights.length > 0 ? roleWeights : distributePercent(lessons.length);
    reviewReason =
      'Source-map percentages were present but did not form a usable 100% plan, so the compiler kept a balanced draft and requires instructor confirmation.';
  }

  const rows = lessons.map((lesson, index) => {
    const explicit = explicitWeights[index];
    const source =
      sourceStatus === 'source-explicit' && explicit
        ? 'course-map-explicit'
        : explicit && sourceStatus === 'mixed-source-and-compiler-distributed'
          ? 'course-map-explicit'
          : 'compiler-distributed-by-assessment-role';
    const reviewRequired = source !== 'course-map-explicit' || sourceStatus !== 'source-explicit';
    return {
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      assessmentTitle: lesson.studentArtifact,
      weightPercent: weights[index] || 0,
      sourceWeightPercent: explicit?.percent ?? null,
      source,
      sourceStatus,
      reviewRequired,
      sourceEvidence: explicit?.evidence || '',
      rationale:
        source === 'course-map-explicit'
          ? `Weight ${weights[index] || 0}% came from source assessment text.`
          : `Weight ${weights[index] || 0}% is a compiler-distributed draft based on assessment role and course sequence.`,
      reviewerAction: reviewRequired
        ? `Confirm the official grading weight for ${lesson.title} before publishing.`
        : `Spot-check that the ${weights[index] || 0}% weight still matches the official course source.`,
    };
  });

  return {
    sourceStatus,
    weights,
    rows,
    explicitWeightCount: explicitCount,
    compilerDistributedWeightCount: rows.filter((row) => row.source !== 'course-map-explicit').length,
    reviewRequiredCount: rows.filter((row) => row.reviewRequired).length,
    sourceWeightTotal,
    reviewReason,
    policy:
      'Assessment weights are publishable only after instructor confirmation; source-explicit weights are preserved, while compiler-distributed weights are draft planning weights.',
  };
}

function assessmentMilestoneIndexes(count) {
  if (count <= 3) return new Set([]);
  const indexes = new Set([Math.max(1, Math.floor(count / 2) - 1)]);
  if (count >= 10) indexes.add(Math.max(2, Math.floor((count * 2) / 3) - 1));
  return indexes;
}

function buildAssessmentRoleDescriptor({ lesson, index, lessonCount }) {
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the weekly artifact');
  const milestoneIndexes = assessmentMilestoneIndexes(lessonCount);
  if (lessonCount <= 1 || index === lessonCount - 1) {
    return {
      role: 'summative-synthesis',
      label: 'Summative synthesis',
      stakes: 'high',
      rawWeight: 18,
      gradingMode: 'summative rubric scoring with anchor calibration',
      roleRationale: `${artifact} should show cumulative command of ${concept} and the course performance role.`,
      studentFacingPurpose: `Show how your course learning has developed into a defensible ${artifact}.`,
      feedbackWindow:
        'Return summary feedback within one week, with revision guidance for final reflection or portfolio use.',
      revisionUse: `Use scored feedback from ${artifact} to name one transfer goal beyond the course.`,
    };
  }
  if (index === 0) {
    return {
      role: 'diagnostic-checkpoint',
      label: 'Diagnostic checkpoint',
      stakes: 'low',
      rawWeight: 4,
      gradingMode: 'low-stakes completion plus targeted readiness feedback',
      roleRationale: `${artifact} should reveal baseline readiness for ${concept} without over-penalizing early uncertainty.`,
      studentFacingPurpose: `Show your starting point with ${concept} so feedback can target the next practice step.`,
      feedbackWindow: 'Return readiness feedback before the next class session.',
      revisionUse: `Use readiness feedback to repair one prerequisite or evidence-use gap before the next artifact.`,
    };
  }
  if (milestoneIndexes.has(index)) {
    return {
      role: 'portfolio-milestone',
      label: 'Portfolio milestone',
      stakes: 'medium',
      rawWeight: 11,
      gradingMode: 'criterion scoring with required revision note',
      roleRationale: `${artifact} should mark a visible course milestone where students consolidate ${concept} before later synthesis.`,
      studentFacingPurpose: `Demonstrate milestone-level progress and prepare evidence you can reuse later.`,
      feedbackWindow: 'Return criterion feedback before the next major milestone or synthesis task.',
      revisionUse: `Use feedback from ${artifact} to revise one claim, evidence choice, or decision before later portfolio work.`,
    };
  }
  if (index >= lessonCount - 2 || lesson.pacing?.stage === 'synthesis') {
    return {
      role: 'synthesis-checkpoint',
      label: 'Synthesis checkpoint',
      stakes: 'medium-high',
      rawWeight: 13,
      gradingMode: 'applied rubric scoring with calibration check',
      roleRationale: `${artifact} should prepare students to combine earlier evidence and make a stronger ${concept} decision.`,
      studentFacingPurpose: `Connect prior lessons into a more complete ${artifact} before final synthesis.`,
      feedbackWindow: 'Return feedback before the final synthesis or next cumulative checkpoint.',
      revisionUse: `Use feedback from ${artifact} to strengthen the final or cumulative course artifact.`,
    };
  }
  if (lesson.pacing?.stage === 'foundation') {
    return {
      role: 'foundation-practice',
      label: 'Foundation practice',
      stakes: 'low-medium',
      rawWeight: 6,
      gradingMode: 'practice scoring focused on evidence, clarity, and revision readiness',
      roleRationale: `${artifact} should help students practice ${concept} before assessment stakes rise.`,
      studentFacingPurpose: `Practice the core evidence move for ${concept} and receive usable feedback.`,
      feedbackWindow: 'Return practice feedback before students start the next applied artifact.',
      revisionUse: `Use feedback from ${artifact} to revise one evidence or reasoning move in the next task.`,
    };
  }
  return {
    role: 'applied-practice',
    label: 'Applied practice',
    stakes: 'medium',
    rawWeight: 8,
    gradingMode: 'criterion scoring with feedback-forward revision',
    roleRationale: `${artifact} should let students apply ${concept} in a course-specific performance context.`,
    studentFacingPurpose: `Apply ${concept} to a concrete artifact and use feedback to improve later work.`,
    feedbackWindow: 'Return feedback within one week or before the next connected artifact is due.',
    revisionUse: `Use feedback from ${artifact} to improve the next related course artifact.`,
  };
}

function buildAssessmentCadence({ assessment, lesson, index, lessonCount, roleDescriptor, weightPercent }) {
  const nextWeek = index < lessonCount - 1 ? `Week ${lesson.lessonNumber + 1}` : 'the final course handoff';
  return {
    dueWindow: `Week ${lesson.lessonNumber}`,
    feedbackWindow: roleDescriptor.feedbackWindow,
    revisionWindow: index < lessonCount - 1 ? `Before ${nextWeek}` : 'Before final portfolio or course reflection use',
    sequencePosition:
      index === 0
        ? 'opening evidence of readiness'
        : index === lessonCount - 1
          ? 'final synthesis evidence'
          : roleDescriptor.role.includes('milestone')
            ? 'mid-course consolidation evidence'
            : 'weekly applied evidence',
    workloadFit: lesson.classSessionPlan?.studentWorkloadFit?.status || 'workload review pending',
    weightPercent,
    weightSource: assessment.weightProvenance?.source || 'unknown',
    weightReviewRequired: Boolean(assessment.weightProvenance?.reviewRequired),
    feedbackUse: assessment.feedbackUse,
    revisionUse: roleDescriptor.revisionUse,
  };
}

function buildAssessmentArchitecture({ lessons, assessments }) {
  const totalWeightPercent = assessments.reduce((sum, assessment) => sum + Number(assessment.weightPercent || 0), 0);
  const roleCounts = assessments.reduce((counts, assessment) => {
    counts[assessment.role] = (counts[assessment.role] || 0) + 1;
    return counts;
  }, {});
  const highStakesWeightPercent = assessments
    .filter((assessment) => assessment.stakes === 'high')
    .reduce((sum, assessment) => sum + Number(assessment.weightPercent || 0), 0);
  const formativeWeightPercent = assessments
    .filter((assessment) =>
      ['diagnostic-checkpoint', 'foundation-practice', 'applied-practice'].includes(assessment.role),
    )
    .reduce((sum, assessment) => sum + Number(assessment.weightPercent || 0), 0);
  const weightRows = assessments.map((assessment, index) => ({
    lessonNumber: assessment.lessonNumbers?.[0] || lessons[index]?.lessonNumber || index + 1,
    lessonTitle: assessment.relatedLessons?.[0] || lessons[index]?.title || assessment.title,
    assessmentTitle: assessment.title,
    weightPercent: assessment.weightPercent,
    source: assessment.weightProvenance?.source || 'unknown',
    sourceStatus: assessment.weightProvenance?.sourceStatus || 'unknown',
    sourceWeightPercent: assessment.weightProvenance?.sourceWeightPercent ?? null,
    sourceEvidence: assessment.weightProvenance?.sourceEvidence || '',
    reviewRequired: Boolean(assessment.weightProvenance?.reviewRequired),
    reviewerAction: assessment.weightProvenance?.reviewerAction || '',
    rationale: assessment.weightProvenance?.rationale || '',
  }));
  const explicitWeightCount = weightRows.filter((row) => row.source === 'course-map-explicit').length;
  const compilerDistributedWeightCount = weightRows.filter((row) => row.source !== 'course-map-explicit').length;
  const weightReviewRequiredCount = weightRows.filter((row) => row.reviewRequired).length;
  const weightSourceStatus =
    assessments[0]?.weightProvenance?.planStatus ||
    (explicitWeightCount === assessments.length ? 'source-explicit' : 'compiler-distributed-draft');
  const architectureFindings = [];
  if (totalWeightPercent !== 100) architectureFindings.push('Assessment weights must total 100%.');
  if (!assessments.some((assessment) => assessment.role === 'summative-synthesis')) {
    architectureFindings.push('Assessment plan needs a summative synthesis role.');
  }
  if (!assessments.some((assessment) => ['diagnostic-checkpoint', 'foundation-practice'].includes(assessment.role))) {
    architectureFindings.push('Assessment plan needs low-stakes foundation evidence.');
  }
  const highStakesCap = assessments.length <= 3 ? 60 : assessments.length <= 4 ? 50 : 45;
  if (highStakesWeightPercent > highStakesCap) {
    architectureFindings.push('High-stakes assessment weight should not dominate the course without local review.');
  }
  return {
    version: 1,
    status: architectureFindings.length === 0 ? 'balanced' : 'needs-review',
    policy:
      'Assessment architecture should move from low-stakes readiness checks into applied practice, milestone evidence, and final synthesis without hiding grading weight, feedback windows, or revision use.',
    totalWeightPercent,
    highStakesWeightPercent,
    formativeWeightPercent,
    weightSourceStatus,
    explicitWeightCount,
    compilerDistributedWeightCount,
    weightReviewRequiredCount,
    weightConfirmationPolicy:
      'Official grading weights must be confirmed by the instructor; compiler-distributed weights are draft planning weights, not institutional policy.',
    weightRows,
    roleCounts,
    assessmentCount: assessments.length,
    lessonRows: assessments.map((assessment, index) => ({
      lessonNumber: assessment.lessonNumbers?.[0] || lessons[index]?.lessonNumber || index + 1,
      lessonTitle: assessment.relatedLessons?.[0] || lessons[index]?.title || assessment.title,
      assessmentTitle: assessment.title,
      role: assessment.role,
      roleLabel: assessment.roleLabel,
      stakes: assessment.stakes,
      weightPercent: assessment.weightPercent,
      weightProvenance: assessment.weightProvenance,
      dueWindow: assessment.cadence?.dueWindow || '',
      feedbackWindow: assessment.cadence?.feedbackWindow || '',
      revisionWindow: assessment.cadence?.revisionWindow || '',
      revisionUse: assessment.revisionUse,
      gradingMode: assessment.gradingMode,
      workloadFit: assessment.cadence?.workloadFit || '',
      criterionWeightPlan: assessment.criterionWeightPlan || [],
      criterionWeightCue:
        (assessment.criterionWeightPlan || [])
          .map((entry) => `${entry.priority || entry.criterion}: ${entry.weight}%`)
          .join('; ') || '',
    })),
    reviewFindings: architectureFindings,
  };
}

function buildAssessmentCriteria(lesson) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  return [
    `${concept} accuracy and evidence selection for ${artifact}`,
    `Analysis logic that connects ${concept} to the lesson decision`,
    `Professional communication organized around ${stripLessonPrefix(lesson.title)}`,
    `Feedback and revision use documented for ${artifact}`,
  ];
}

function buildAssessmentValidityEvidence(lesson) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const title = stripLessonPrefix(lesson.title);
  const sourceCue =
    lesson.evidencePlan?.sourceCue || lesson.readings?.[0] || `${stripLessonPrefix(lesson.title)} materials`;
  return {
    targetConstruct: `${artifact} shows whether students can use ${concept} evidence to make a defensible course decision.`,
    authenticPerformance: `The task asks students to produce ${artifact}, not only recall vocabulary, so performance evidence comes from applied reasoning in ${stripLessonPrefix(lesson.title)}.`,
    validityThreat: `A polished but unsupported ${artifact} could hide weak ${concept} reasoning if scoring does not require inspectable evidence from ${sourceCue}.`,
    calibrationCheck: `Before scoring ${title}, compare one strong and one partial ${artifact} sample; the stronger sample should cite ${sourceCue}, explain the ${concept} decision, and name a limitation.`,
  };
}

function buildAssessmentCalibrationPlan(lesson, validityEvidence) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  return {
    anchorComparison:
      lesson.modelContrast?.contrastQuestion ||
      `Compare a strong and partial ${artifact} sample before scoring and name the visible ${concept} evidence difference.`,
    scorerNorming:
      validityEvidence?.calibrationCheck ||
      `Score two sample ${artifact} responses with the rubric, then reconcile any criterion-level score differences before grading student work.`,
    biasCheck: `Check whether score differences come from rubric evidence for ${concept}, not writing polish, confidence, accent, format preference, or prior assumptions about the student.`,
    studentTransparency: `Share the ${artifact} criteria, success criteria, and anchor-example contrast before students submit so expectations are inspectable.`,
    postScoreReview:
      lesson.feedbackCycle?.closureCheck ||
      `After scoring ${artifact}, identify one common evidence gap and convert it into a reteaching, revision, or study-guide prompt.`,
  };
}

function buildCriterionEvidenceMap(lesson, criteria, validityEvidence) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const sourceCue =
    lesson.evidencePlan?.sourceCue || lesson.readings?.[0] || `${stripLessonPrefix(lesson.title)} materials`;
  return criteria.map((criterion, index) => ({
    criterion,
    evidenceNeeded: `For "${criterion}", look for an inspectable ${concept} detail from ${sourceCue} that changes a visible choice in ${artifact}.`,
    strongSignal:
      index === 0
        ? `Strong evidence names the relevant ${concept} detail, explains why it matters, and connects it directly to ${artifact}.`
        : `Strong evidence connects ${criterion.toLowerCase()} to a specific decision, limitation, or revision in ${artifact}.`,
    partialSignal: `Partial evidence mentions ${concept} or ${artifact} but leaves the reasoning, limitation, or criterion connection implicit.`,
    feedbackMove: buildCriterionFeedbackMove({ lesson, criterion, index }),
    calibrationQuestion: buildCriterionCalibrationQuestion({ lesson, criterion, index, validityEvidence }),
  }));
}

function buildCriterionCalibrationQuestion({ lesson = {}, criterion = '', index = 0, validityEvidence = {} }) {
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const criterionLabel = cleanText(criterion, `criterion ${index + 1}`);
  const baseCheck =
    validityEvidence?.calibrationCheck ||
    `Before scoring ${artifact}, compare one strong and one partial ${artifact} response.`;
  if (index === 0 || /\b(accuracy|evidence|source)\b/i.test(criterionLabel)) {
    return `${baseCheck} For "${criterionLabel}", ask whether two scorers cite the same ${concept} source detail and agree that it supports ${artifact}.`;
  }
  if (index === 1 || /\b(analysis|logic|reasoning|decision)\b/i.test(criterionLabel)) {
    return `${baseCheck} For "${criterionLabel}", ask whether two scorers can point to the same reasoning step between ${concept} evidence and the ${artifact} decision.`;
  }
  if (index === 2 || /\b(communication|format|organization)\b/i.test(criterionLabel)) {
    return `${baseCheck} For "${criterionLabel}", ask whether the evidence, limitation, and decision are easy for another reader to locate in ${artifact}.`;
  }
  if (/\b(feedback|revision)\b/i.test(criterionLabel)) {
    return `${baseCheck} For "${criterionLabel}", ask whether the submitted ${artifact} marks a concrete feedback-informed change and explains its effect.`;
  }
  return `${baseCheck} For "${criterionLabel}", ask whether two scorers identify the same criterion-specific evidence, limitation, and next decision.`;
}

function buildCriterionFeedbackMove({ lesson = {}, criterion = '', index = 0 }) {
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const sourceCue =
    lesson.evidencePlan?.sourceCue || lesson.readings?.[0] || `${stripLessonPrefix(lesson.title)} materials`;
  const criterionLabel = cleanText(criterion, `criterion ${index + 1}`);
  if (index === 0 || /\b(accuracy|evidence|source)\b/i.test(criterionLabel)) {
    return `Revise ${artifact} by tying the ${concept} evidence for "${criterionLabel}" to ${sourceCue}, one limitation, and the visible decision.`;
  }
  if (index === 1 || /\b(analysis|logic|reasoning|decision)\b/i.test(criterionLabel)) {
    return `Strengthen "${criterionLabel}" by adding the missing reasoning step between the ${concept} evidence, the tradeoff, and the ${artifact} decision.`;
  }
  if (index === 2 || /\b(communication|format|organization)\b/i.test(criterionLabel)) {
    return `Revise the organization for "${criterionLabel}" so the ${concept} evidence, decision, and limitation are easy to locate in ${artifact}.`;
  }
  if (/\b(feedback|revision)\b/i.test(criterionLabel)) {
    return `Mark the feedback-informed change for "${criterionLabel}" and explain how it improved the ${concept} evidence link in ${artifact}.`;
  }
  return `Revise "${criterionLabel}" in ${artifact} by adding criterion-specific ${concept} evidence, one limitation, and the next decision.`;
}

function criterionWeightDescriptor({ criterion, index, lesson, evidenceEntry }) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const lower = cleanText(criterion).toLowerCase();
  if (index === 0) {
    return {
      rawWeight: 30,
      priority: 'source-grounded concept evidence',
      rationale: `This criterion carries the largest share because ${artifact} is only valid when students use accurate ${concept} evidence from the course source.`,
      evidenceSignal:
        evidenceEntry?.evidenceNeeded ||
        `Look for a course-grounded ${concept} detail that changes a visible decision in ${artifact}.`,
    };
  }
  if (index === 1) {
    return {
      rawWeight: 30,
      priority: 'analysis and decision logic',
      rationale: `This criterion carries the largest share because students must explain how ${concept} evidence supports the decision in ${artifact}.`,
      evidenceSignal:
        evidenceEntry?.strongSignal ||
        `Look for reasoning that connects ${concept} evidence to a defensible decision in ${artifact}.`,
    };
  }
  if (index === 2) {
    return {
      rawWeight: 20,
      priority: 'professional communication and format fit',
      rationale: `This criterion supports clarity and genre fit while keeping the main grading emphasis on ${concept} evidence and reasoning.`,
      evidenceSignal:
        evidenceEntry?.strongSignal ||
        `Look for organization, language, and format choices that make ${artifact} usable for the course context.`,
    };
  }
  if (index === 3) {
    return {
      rawWeight: 20,
      priority: 'feedback-informed revision',
      rationale: `This criterion is weighted for revision quality so feedback visibly improves ${artifact} instead of becoming an afterthought.`,
      evidenceSignal:
        evidenceEntry?.feedbackMove ||
        `Look for a concrete change to ${artifact} based on rubric, peer, instructor, or self-review feedback.`,
    };
  }
  if (/^feedback\b/.test(lower) || /\b(revision use|feedback and revision)\b/.test(lower)) {
    return {
      rawWeight: 20,
      priority: 'feedback-informed revision',
      rationale: `This criterion is weighted for revision quality so feedback visibly improves ${artifact} instead of becoming an afterthought.`,
      evidenceSignal:
        evidenceEntry?.feedbackMove ||
        `Look for a concrete change to ${artifact} based on rubric, peer, instructor, or self-review feedback.`,
    };
  }
  if (/^analysis\b/.test(lower) || /\b(decision logic|reasoning)\b/.test(lower)) {
    return {
      rawWeight: 30,
      priority: 'analysis and decision logic',
      rationale: `This criterion carries the largest share because students must explain how ${concept} evidence supports the decision in ${artifact}.`,
      evidenceSignal:
        evidenceEntry?.strongSignal ||
        `Look for reasoning that connects ${concept} evidence to a defensible decision in ${artifact}.`,
    };
  }
  if (/^professional communication\b/.test(lower) || /\bcommunication organized\b/.test(lower)) {
    return {
      rawWeight: 20,
      priority: 'professional communication and format fit',
      rationale: `This criterion supports clarity and genre fit while keeping the main grading emphasis on ${concept} evidence and reasoning.`,
      evidenceSignal:
        evidenceEntry?.strongSignal ||
        `Look for organization, language, and format choices that make ${artifact} usable for the course context.`,
    };
  }
  if (/\b(accuracy|evidence selection|source-grounded)\b/.test(lower)) {
    return {
      rawWeight: 30,
      priority: 'source-grounded concept evidence',
      rationale: `This criterion carries the largest share because ${artifact} is only valid when students use accurate ${concept} evidence from the course source.`,
      evidenceSignal:
        evidenceEntry?.evidenceNeeded ||
        `Look for a course-grounded ${concept} detail that changes a visible decision in ${artifact}.`,
    };
  }
  return {
    rawWeight: 20,
    priority: 'professional communication and format fit',
    rationale: `This criterion supports clarity and genre fit while keeping the main grading emphasis on ${concept} evidence and reasoning.`,
    evidenceSignal:
      evidenceEntry?.strongSignal ||
      `Look for organization, language, and format choices that make ${artifact} usable for the course context.`,
  };
}

function buildCriterionWeightPlan(lesson, criteria, criterionEvidenceMap, points = 100) {
  const descriptors = criteria.map((criterion, index) =>
    criterionWeightDescriptor({
      criterion,
      index,
      lesson,
      evidenceEntry: criterionEvidenceMap?.[index],
    }),
  );
  const weights = distributeWeightedPercent(descriptors.map((descriptor) => descriptor.rawWeight));
  return criteria.map((criterion, index) => {
    const descriptor = descriptors[index] || {};
    const weight = weights[index] || 0;
    return {
      criterion,
      priority: descriptor.priority || `Criterion ${index + 1}`,
      weight,
      points: Math.round((weight / 100) * points),
      rationale: descriptor.rationale || `Weight reflects the relative grading importance of "${criterion}".`,
      evidenceSignal: descriptor.evidenceSignal || criterionEvidenceMap?.[index]?.evidenceNeeded || '',
      calibrationUse:
        criterionEvidenceMap?.[index]?.calibrationQuestion ||
        `During scorer norming, compare strong and partial samples for "${criterion}" before assigning points.`,
      feedbackUse:
        criterionEvidenceMap?.[index]?.feedbackMove ||
        `Return feedback that names the next concrete improvement for "${criterion}".`,
      studentTransparency: `Tell students that "${criterion}" is worth ${weight}% before they draft, and show the evidence signal used for scoring.`,
    };
  });
}

function buildCriterionPerformanceBand({ assessment, lesson, criterion, planEntry, evidenceEntry, lens }) {
  const concept = lesson?.keyConcepts?.[0] || stripLessonPrefix(lesson?.title || assessment.relatedLessons?.[0] || '');
  const artifact = stripTerminalPunctuation(assessment.artifact || assessment.title);
  const sourceCue =
    lesson?.evidencePlan?.sourceCue || lesson?.readings?.[0] || `${stripLessonPrefix(lesson?.title || '')} materials`;
  const priority = planEntry.priority || 'criterion evidence';
  const evidenceSignal =
    planEntry.evidenceSignal ||
    evidenceEntry?.evidenceNeeded ||
    `Look for ${concept} evidence that changes a visible choice in ${artifact}.`;
  const calibrationUse =
    planEntry.calibrationUse ||
    evidenceEntry?.calibrationQuestion ||
    `Ask whether two scorers can point to the same evidence for "${criterion}" in ${artifact}.`;
  const revisionTarget =
    planEntry.feedbackUse ||
    evidenceEntry?.feedbackMove ||
    `Revise ${artifact} by adding criterion-specific evidence and one limitation.`;
  const commonPitfall =
    priority === 'analysis and decision logic'
      ? `Do not give full credit for naming ${concept} terms without explaining the decision logic in ${artifact}.`
      : priority === 'feedback-informed revision'
        ? `Do not give full credit for saying feedback was used without showing what changed in ${artifact}.`
        : priority === 'professional communication and format fit'
          ? `Do not give full credit for polished prose if organization or format hides the ${concept} evidence in ${artifact}.`
          : `Do not give full credit for broad summary, invented source detail, or unsupported ${concept} claims in ${artifact}.`;

  if (priority === 'analysis and decision logic') {
    return {
      exemplary: `Explains how specific ${lens.evidenceNoun} for ${concept} changes the decision in ${artifact}, names the tradeoff or limitation, and makes the reasoning inspectable for another scorer.`,
      proficient: `Connects relevant ${lens.evidenceNoun} for ${concept} to the main ${artifact} decision with mostly clear reasoning and only minor gaps in limitation language.`,
      developing: `Mentions ${lens.evidenceNoun} or ${concept} but leaves part of the decision logic, tradeoff, or limitation implicit in ${artifact}.`,
      beginning: `Lists ideas or opinions about ${concept} without showing how ${lens.evidenceNoun} supports the decision required by ${artifact}.`,
      performanceBandEvidence: {
        priority,
        evidenceSignal,
        scorerQuestion: calibrationUse,
        commonPitfall,
        revisionTarget,
      },
    };
  }

  if (priority === 'feedback-informed revision') {
    return {
      exemplary: `Shows a concrete feedback-informed change to ${artifact}, explains why the change improves ${lens.evidenceNoun} or ${concept} reasoning, and names the remaining limitation.`,
      proficient: `Identifies a relevant revision to ${artifact} and explains how feedback improved one important ${lens.evidenceNoun} or reasoning move.`,
      developing: `Refers to feedback or revision but does not make the change, rationale, or connection to ${artifact} fully visible.`,
      beginning: `Submits ${artifact} with little evidence that feedback was reviewed, applied, or used to improve the criterion.`,
      performanceBandEvidence: {
        priority,
        evidenceSignal,
        scorerQuestion: calibrationUse,
        commonPitfall,
        revisionTarget,
      },
    };
  }

  if (priority === 'professional communication and format fit') {
    return {
      exemplary: `Organizes ${artifact} in the expected ${lesson?.artifactGenre?.label || lens.domain} format so the ${concept} claim, ${lens.evidenceNoun}, limitation, and next action are easy to locate.`,
      proficient: `Uses a clear structure for ${artifact} and communicates the main ${lens.evidenceNoun} for ${concept} with only minor gaps in format, headings, or audience fit.`,
      developing: `Includes useful ${concept} content, but organization, format, or audience language makes the ${lens.evidenceNoun} harder to follow in ${artifact}.`,
      beginning: `Presents ${artifact} in a form that obscures the required ${lens.evidenceNoun}, decision, or submission expectations.`,
      performanceBandEvidence: {
        priority,
        evidenceSignal,
        scorerQuestion: calibrationUse,
        commonPitfall,
        revisionTarget,
      },
    };
  }

  return {
    exemplary: `Uses precise ${lens.evidenceNoun} about ${concept} from ${sourceCue}, applies it to a visible choice in ${artifact}, names a limitation, and avoids invented source detail.`,
    proficient: `Uses relevant ${lens.evidenceNoun} for ${concept} in ${artifact} with a mostly clear source connection and only minor gaps in precision or limitation language.`,
    developing: `Mentions ${concept} or ${sourceCue}, but the ${lens.evidenceNoun} link, source boundary, or implication for ${artifact} remains partly implicit.`,
    beginning: `Relies on general summary, unsupported claims, or missing source evidence instead of using inspectable ${lens.evidenceNoun} for ${artifact}.`,
    performanceBandEvidence: {
      priority,
      evidenceSignal,
      scorerQuestion: calibrationUse,
      commonPitfall,
      revisionTarget,
    },
  };
}

function buildAssessmentAnchorExamples(lesson, criteria, criterionEvidenceMap, validityEvidence) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const sourceCue =
    lesson.evidencePlan?.sourceCue || lesson.readings?.[0] || `${stripLessonPrefix(lesson.title)} materials`;
  const primaryCriterion = criteria[0] || `${concept} evidence quality`;
  const strongSignal =
    criterionEvidenceMap?.[0]?.strongSignal ||
    `Strong evidence names a relevant ${concept} detail and connects it directly to ${artifact}.`;
  const partialSignal =
    criterionEvidenceMap?.[0]?.partialSignal ||
    `Partial evidence mentions ${concept} or ${artifact} but leaves the reasoning implicit.`;
  return {
    strongSample: `Strong ${artifact} anchor: cites a concrete detail from ${sourceCue}, explains how it changes the ${concept} decision, names one limitation, and states the revision made before submission.`,
    partialSample: `Partial ${artifact} anchor: summarizes ${concept}, mentions ${sourceCue} generally, but does not make the evidence link, limitation, or revision decision inspectable.`,
    criterionFocus: primaryCriterion,
    strongSignal,
    partialSignal,
    scoringRationale: `Score the strong anchor higher because the evidence is inspectable, tied to ${primaryCriterion}, and aligned with ${validityEvidence?.targetConstruct || `${artifact} performance evidence`}.`,
    revisionPrompt: `Revise the partial ${artifact} anchor by making the ${primaryCriterion} evidence from ${sourceCue} inspectable, naming one limitation, and stating what changed before submission.`,
    scorerCalibrationUse: `Before grading, scorers compare the strong and partial ${artifact} anchors, point to the exact evidence difference, and reconcile disagreements before scoring student work.`,
    studentFacingUse: `Compare the strong and partial ${artifact} anchor examples before you submit, and self-check your ${concept} evidence, reasoning, limitation, and revision quality against them.`,
    instructorAnchorShare: `Share the strong/partial ${artifact} anchor contrast before students submit so they can self-check evidence, reasoning, limitation, and revision quality.`,
  };
}

function buildAssessmentAnchors(lessons) {
  const source = lessons;
  const roleDescriptors = source.map((lesson, index) =>
    buildAssessmentRoleDescriptor({ lesson, index, lessonCount: source.length || 1 }),
  );
  const weightPlan = buildAssessmentWeightPlan(source, roleDescriptors);
  const weights = weightPlan.weights.length > 0 ? weightPlan.weights : distributePercent(source.length || 1);
  return source.map((lesson, index) => {
    const validityEvidence = buildAssessmentValidityEvidence(lesson);
    const criteria = buildAssessmentCriteria(lesson);
    const criterionEvidenceMap = buildCriterionEvidenceMap(lesson, criteria, validityEvidence);
    const criterionWeightPlan = buildCriterionWeightPlan(lesson, criteria, criterionEvidenceMap, 100);
    const criterionObjectiveAlignment = buildCriterionObjectiveAlignment({
      lesson,
      criteria,
      criterionWeightPlan,
      criterionEvidenceMap,
    });
    const roleDescriptor = roleDescriptors[index] || buildAssessmentRoleDescriptor({ lesson, index, lessonCount: 1 });
    const weightPercent = weights[index] || 0;
    const weightProvenanceRow = weightPlan.rows[index] || {};
    const assessment = {
      id: `assessment-${index + 1}`,
      title: cleanText(lesson.studentArtifact, `${stripLessonPrefix(lesson.title)} applied assessment`),
      artifact: cleanText(lesson.studentArtifact, 'Applied course artifact'),
      lessonNumbers: [lesson.lessonNumber],
      relatedLessons: [lesson.title],
      weight: `${weightPercent}%`,
      weightPercent,
      weightProvenance: {
        version: 1,
        planStatus: weightPlan.sourceStatus,
        planPolicy: weightPlan.policy,
        planReviewReason: weightPlan.reviewReason,
        source: weightProvenanceRow.source || 'compiler-distributed-by-assessment-role',
        sourceStatus: weightProvenanceRow.sourceStatus || weightPlan.sourceStatus,
        sourceWeightPercent: weightProvenanceRow.sourceWeightPercent ?? null,
        sourceEvidence: weightProvenanceRow.sourceEvidence || '',
        reviewRequired: Boolean(weightProvenanceRow.reviewRequired),
        rationale: weightProvenanceRow.rationale || '',
        reviewerAction:
          weightProvenanceRow.reviewerAction ||
          `Confirm the official grading weight for ${lesson.title} before publishing.`,
      },
      points: 100,
      role: roleDescriptor.role,
      roleLabel: roleDescriptor.label,
      stakes: roleDescriptor.stakes,
      gradingMode: roleDescriptor.gradingMode,
      roleRationale: roleDescriptor.roleRationale,
      studentFacingPurpose: roleDescriptor.studentFacingPurpose,
      revisionUse: roleDescriptor.revisionUse,
      bloomsLevel: lesson.bloomsLevel,
      objectives: lesson.outcomes,
      criteria,
      successCriteria: lesson.successCriteria,
      feedbackUse: lesson.feedbackCycle?.nextUse || lesson.feedbackMoment,
      feedbackCycle: lesson.feedbackCycle,
      validityEvidence,
      calibrationPlan: buildAssessmentCalibrationPlan(lesson, validityEvidence),
      criterionEvidenceMap,
      criterionWeightPlan,
      criterionObjectiveAlignment,
      anchorExampleSet: buildAssessmentAnchorExamples(lesson, criteria, criterionEvidenceMap, validityEvidence),
      source: lesson.assessmentSource,
    };
    return {
      ...assessment,
      cadence: buildAssessmentCadence({
        assessment,
        lesson,
        index,
        lessonCount: source.length || 1,
        roleDescriptor,
        weightPercent,
      }),
    };
  });
}

export function buildCourseBlueprint(courseMap, options = {}) {
  const extractedLessons = selectedLessonEntries(courseMap, options.scopeIndices).map(({ lesson, originalIndex }) =>
    extractLessonBlueprint(lesson, originalIndex),
  );
  const sourceConflictReport = buildSourceConflictReport(extractedLessons);
  const conflictAwareLessons = attachSourceConflictSignals(extractedLessons, sourceConflictReport);
  const sequencedLessons = addCourseSequenceSemantics(conflictAwareLessons);
  const instructorPreferenceProfile = normalizeInstructorPreferenceProfile(
    options.instructorPreferences || options.preferenceProfile,
  );
  const courseConcepts = unique(
    sequencedLessons.flatMap((lesson) => lesson.keyConcepts),
    16,
  );
  const courseName = cleanText(courseMap?.courseName, 'Untitled Course');
  const courseModalityProfile = buildCourseModalityProfile({
    courseName,
    lessons: sequencedLessons,
  });
  const normalizedEnrichment = normalizeBlueprintEnrichment({
    courseName,
    lessons: sequencedLessons,
    courseConcepts,
    provided: options.enrichment || {},
    courseModalityProfile,
  });
  const learnerContextProfile = buildLearnerContextProfile({
    courseName,
    courseConcepts,
    lessons: sequencedLessons,
    lens: normalizedEnrichment.lens,
    courseModalityProfile,
  });
  const courseThroughlineContext = buildCourseThroughlineContext({
    courseName,
    lessons: sequencedLessons,
    courseConcepts,
    lens: normalizedEnrichment.lens,
    courseModalityProfile,
  });
  const baseLessons = sequencedLessons.map((lesson) => {
    const modalityDecode = buildLessonModalityDecode(courseModalityProfile, lesson);
    const lessonWithContext = {
      ...lesson,
      learnerContextCue: buildLessonLearnerContextCue(learnerContextProfile, lesson),
      modalityCue: buildLessonModalityCue(courseModalityProfile, lesson),
      modalityDecode,
      artifactGenre: buildArtifactGenreDecode(lesson, courseModalityProfile, modalityDecode),
    };
    return attachThroughlineCaseToLesson(
      {
        ...lessonWithContext,
        classSessionPlan: buildClassSessionPlan({ lesson: lessonWithContext, modalityDecode }),
      },
      courseThroughlineContext,
    );
  });
  const assessments = buildAssessmentAnchors(baseLessons);
  const sourceRiskRegister = buildSourceRiskRegister({ lessons: baseLessons, assessments });
  const localization =
    options.localization && typeof options.localization === 'object'
      ? Object.fromEntries(
          Object.entries(options.localization).filter(([, value]) => typeof value === 'string' && value.trim()),
        )
      : null;
  const lessonContentEnrichment =
    options.enrichment?.lessonContent && typeof options.enrichment.lessonContent === 'object'
      ? options.enrichment.lessonContent
      : null;
  let lessons = baseLessons.map((lesson) => {
    const sourceRiskRow = sourceRiskRegister.lessonRows.find((row) => row.lessonNumber === lesson.lessonNumber) || null;
    const assessment =
      assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) || assessments[0] || {};
    const contentEnrichment =
      lessonContentEnrichment?.[lesson.id] || lessonContentEnrichment?.[`lesson-${lesson.lessonNumber}`] || null;
    return {
      ...lesson,
      ...(contentEnrichment ? { enrichment: contentEnrichment } : {}),
      sourceRisk: sourceRiskRow,
      compilerDecision: buildLessonCompilerDecision({ lesson, sourceRiskRow, assessment }),
    };
  });
  const conceptDependencyGraph = buildConceptDependencyGraph({ lessons, assessments });
  lessons = attachConceptGraphToLessons(lessons, conceptDependencyGraph);
  lessons = attachMasteryEvidenceToLessons(lessons, assessments);
  lessons = attachEvidenceResponseToLessons(lessons);
  lessons = attachObjectiveEvidenceToLessons(lessons, assessments);
  const masteryEvidenceMap = buildMasteryEvidenceMap(lessons);
  const evidenceResponseMap = buildEvidenceResponseMap(lessons);
  const objectiveEvidenceMap = buildObjectiveEvidenceMap({ lessons, assessments });
  const compilerDecisionMatrix = buildCompilerDecisionMatrix(lessons);
  const assessmentArchitecture = buildAssessmentArchitecture({ lessons, assessments });
  const alignmentMatrix = buildCourseAlignmentMatrix(lessons, assessments);
  const courseArc = buildCourseArc(lessons, conceptDependencyGraph, courseThroughlineContext);
  const classroomHandoffPlan = buildClassroomHandoffPlan({
    courseName,
    lessons,
    assessments,
    learnerContextProfile,
    courseModalityProfile,
    sourceConflictReport,
    sourceRiskRegister,
    assessmentArchitecture,
  });
  const classroomDryRunPlan = buildClassroomDryRunPlan({
    courseName,
    lessons,
    courseModalityProfile,
    classroomHandoffPlan,
  });
  const classroomEvidenceLoopPlan = buildClassroomEvidenceLoopPlan({
    courseName,
    lessons,
    courseModalityProfile,
    classroomDryRunPlan,
    classroomHandoffPlan,
  });
  const instructorFeedbackLoadPlan = buildInstructorFeedbackLoadPlan({
    courseName,
    lessons,
    assessments,
    courseModalityProfile,
    classroomEvidenceLoopPlan,
  });
  const blueprintAssumptionLedger = buildBlueprintAssumptionLedger({
    courseName,
    lessons,
    learnerContextProfile,
    courseModalityProfile,
    sourceConflictReport,
    sourceRiskRegister,
    assessmentArchitecture,
    compilerDecisionMatrix,
    classroomHandoffPlan,
  });
  const packageCoherenceMatrix = buildPackageCoherenceMatrix({
    lessons,
    assessments,
    classroomHandoffPlan,
  });
  const blueprintReviewSurface = buildBlueprintReviewSurface({
    courseName,
    lessons,
    assessments,
    courseArc,
    enrichment: normalizedEnrichment,
    learnerContextProfile,
    courseModalityProfile,
    sourceRiskRegister,
    sourceConflictReport,
    compilerDecisionMatrix,
    assessmentArchitecture,
    blueprintAssumptionLedger,
    packageCoherenceMatrix,
  });

  const blueprint = {
    version: 1,
    source: 'deterministic-course-map',
    courseName,
    semester: publishableCourseTerm(options.localization?.termLabel || courseMap?.semester),
    totalLessons: lessons.length,
    lessons,
    assessments,
    assessmentArchitecture,
    alignmentMatrix,
    courseConcepts,
    courseArc,
    courseThroughlineContext,
    conceptDependencyGraph,
    masteryEvidenceMap,
    evidenceResponseMap,
    objectiveEvidenceMap,
    courseWorkload: buildCourseWorkload(lessons),
    learnerContextProfile,
    courseModalityProfile,
    sourceConflictReport,
    sourceRiskRegister,
    compilerDecisionMatrix,
    classroomHandoffPlan,
    classroomDryRunPlan,
    classroomEvidenceLoopPlan,
    instructorFeedbackLoadPlan,
    blueprintAssumptionLedger,
    packageCoherenceMatrix,
    blueprintReviewSurface,
    qualitySignals: buildBlueprintQualitySignals(lessons),
    ...(Array.isArray(options.knowledgeResources) && options.knowledgeResources.length > 0
      ? {
          knowledgeResources: options.knowledgeResources.map((resource) => ({
            citation: cleanText(resource?.citation),
            kind: cleanText(resource?.kind),
            origin: cleanText(resource?.origin),
            url: cleanText(resource?.url),
            license: cleanText(resource?.license),
            attribution: cleanText(resource?.attribution),
          })),
        }
      : {}),
    ...(localization && Object.keys(localization).length > 0 ? { localization } : {}),
    policies: {
      lateWork:
        'Submit work by the listed due week. If you need an extension, contact the instructor before the deadline with a concrete completion plan.',
      communication:
        'Use the official course communication channel for questions. Expect professional, respectful communication and allow a standard academic response window.',
      accessibility:
        'Students who need accommodations should contact the institution accessibility office and the instructor early so course activities can be adjusted appropriately.',
      academicIntegrity:
        'All submitted work must represent the student or team effort and cite outside sources or approved tools. Course-specific AI use must be disclosed when it contributes to submitted work.',
    },
    designRules: {
      alignment: 'Every artifact must connect objectives, practice, assessment, feedback, and support.',
      support: 'Name concrete success criteria and feedback use instead of generic encouragement.',
    },
  };
  if (instructorPreferenceProfile) {
    blueprint.instructorPreferenceProfile = instructorPreferenceProfile;
    blueprint.qualitySignals = {
      ...blueprint.qualitySignals,
      instructorPreferenceSignals: instructorPreferenceProfile.signalCount,
      instructorPreferenceConfidence: instructorPreferenceProfile.confidence,
    };
  }
  const enrichedBlueprint = {
    ...blueprint,
    enrichment: normalizedEnrichment,
  };
  const blueprintWithPath = {
    ...enrichedBlueprint,
    compilerPath: buildCompilerPathReceipt(enrichedBlueprint, options),
  };
  const semanticContract = validateBlueprintSemanticContract(blueprintWithPath);
  const compilerContract = validateCourseBlueprintContract(blueprintWithPath);
  const hydratedBlueprint = {
    ...blueprintWithPath,
    semanticContract,
    compilerContract,
    compilerProofBundle: buildCompilerProofBundle(blueprintWithPath, {
      ...options,
      semanticContract,
      compilerContract,
    }),
  };
  return compactBlueprintForStorage(hydratedBlueprint);
}

export function isBlueprintCompiledFeature(featureId, options = {}) {
  return BLUEPRINT_COMPILED_FEATURES.has(featureId) || isCompiledCustomDeliverable(featureId, options);
}

export function getBlueprintCompiledFeatures(featureIds = [], options = {}) {
  if (options.enabled === false) return [];
  return [...new Set(featureIds)].filter((featureId) => isBlueprintCompiledFeature(featureId, options));
}

export function estimateBlueprintCompilerSavings(
  featureIds = [],
  lessonCount = 0,
  generationPlan = null,
  scopeIndices = null,
) {
  return getBlueprintCompiledFeatures(featureIds).reduce(
    (sum, featureId) => sum + Math.max(1, getChunkCount(featureId, lessonCount, scopeIndices, generationPlan)),
    0,
  );
}

function getCustomDeliverableDefinition(featureId, options = {}) {
  if (!featureId?.startsWith('custom_')) return null;
  if (options.customDeliverables && typeof options.customDeliverables === 'object') {
    return options.customDeliverables[featureId] || null;
  }
  return getCustomDeliverable(featureId);
}

function getCompiledCustomTemplateKind(featureId, options = {}) {
  if (!featureId?.startsWith('custom_')) return null;
  const custom = getCustomDeliverableDefinition(featureId, options);
  if (!custom) return null;

  const combinedText = [
    custom.name,
    custom.description,
    custom.systemPrompt,
    custom.userPromptTemplate,
    custom.outputFormat,
  ]
    .map((value) => cleanText(value).toLowerCase())
    .join(' ');

  if (!CUSTOM_PER_LESSON_PATTERN.test(combinedText)) return null;

  const customName = cleanText(custom.name).toLowerCase();
  if (CUSTOM_TEMPLATE_EXCLUDE_PATTERN.test(customName)) return null;
  if (CUSTOM_READING_RESPONSE_PATTERN.test(combinedText)) return 'reading-response';
  if (CUSTOM_REFLECTION_PATTERN.test(combinedText)) return 'reflection-check-in';
  const structuredTemplate = CUSTOM_STRUCTURED_TEMPLATE_DEFINITIONS.find((definition) =>
    definition.pattern.test(combinedText),
  );
  if (structuredTemplate) return structuredTemplate.kind;
  return null;
}

function isCompiledCustomDeliverable(featureId, options = {}) {
  return getCompiledCustomTemplateKind(featureId, options) !== null;
}

function compileCustomReflectionDeliverable(featureId, blueprint, options = {}) {
  const custom = getCustomDeliverableDefinition(featureId, options);
  if (!custom || getCompiledCustomTemplateKind(featureId, options) !== 'reflection-check-in') return null;

  const deliverableName = cleanText(custom.name, 'Weekly Reflection');
  const arrayKey = slugifyCustomArrayKey(deliverableName);
  const lens = blueprintLens(blueprint);
  const items = blueprint.lessons.map((lesson) => {
    const focus = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const alternate = alternateLessonConcept(lesson, focus);
    const phrase = lessonPhrase(blueprint, lesson);
    const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
    const contextCue = conciseClause(phrase.context, stripLessonPrefix(lesson.title), 110);
    const activityCue = conciseClause(lesson.activityPattern, `${stripLessonPrefix(lesson.title)} activity`, 110);
    const successCue = conciseClause(lesson.successCriteria, 'the lesson success criteria', 120);

    return {
      lessonTitle: lesson.title,
      weekNumber: `Week ${lesson.lessonNumber}`,
      deliverableName,
      promptTitle: `${deliverableName} ${lesson.lessonNumber}`,
      sourceGrounding: lessonSourceGrounding(lesson, {
        compiledPattern: 'reflection-check-in',
        evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
        learnerContextProfile: blueprint.learnerContextProfile,
      }),
      reflectionPrompt: `Explain how ${focus} changes your next ${lens.decisionNoun}. Use one example from ${contextCue} and connect it to the lesson artifact: ${artifact}.`,
      checkInQuestion: `What is one move you can make this week to apply ${alternate} more deliberately in ${customPracticeContext(blueprint, lens)}?`,
      evidenceToReference: [
        `Use one detail from ${activityCue.toLowerCase()}.`,
        `Name one success criterion, such as: ${successCue}.`,
        `Describe one uncertainty, risk, or feedback target you still need to work on.`,
      ],
      responseStructure: [
        `Part 1: summarize the most important insight about ${focus} in 2-3 sentences.`,
        `Part 2: explain how that insight changes your approach to ${stripLessonPrefix(artifact)}.`,
        `Part 3: name one next step you will take before the next class session.`,
      ],
      successCriteria: [
        `${deliverableName} names a concrete ${focus} takeaway from the lesson.`,
        `${deliverableName} uses specific course evidence instead of generic filler.`,
        `${deliverableName} ends with a realistic next action tied to the next assignment or feedback cycle.`,
      ],
      instructorReviewFocus: `Look for whether the student can connect ${focus} to ${alternate}, cite lesson evidence, and identify a concrete next step before the next checkpoint.`,
    };
  });

  return {
    deliverableName,
    deliverableType: 'compiled-reflection-check-in',
    source: 'deterministic-course-blueprint',
    [arrayKey]: items,
  };
}

function compileCustomReadingResponseDeliverable(featureId, blueprint, options = {}) {
  const custom = getCustomDeliverableDefinition(featureId, options);
  if (!custom || getCompiledCustomTemplateKind(featureId, options) !== 'reading-response') return null;

  const deliverableName = cleanText(custom.name, 'Reading Response');
  const arrayKey = slugifyCustomArrayKey(deliverableName);
  const lens = blueprintLens(blueprint);
  const items = blueprint.lessons.map((lesson) => {
    const focus = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const alternate = alternateLessonConcept(lesson, focus);
    const phrase = lessonPhrase(blueprint, lesson);
    const reading = lesson.readings[0] || 'Assigned lesson materials';

    return {
      lessonTitle: lesson.title,
      weekNumber: `Week ${lesson.lessonNumber}`,
      deliverableName,
      promptTitle: `${deliverableName} ${lesson.lessonNumber}`,
      focusReading: reading,
      sourceGrounding: lessonSourceGrounding(lesson, {
        compiledPattern: 'reading-response',
        focusReading: reading,
        evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
        learnerContextProfile: blueprint.learnerContextProfile,
      }),
      responsePrompt: `Write a focused response explaining how ${focus} from ${reading} changes your approach to ${stripTerminalPunctuation(lesson.studentArtifact)} in ${lesson.title}. Reference ${phrase.context} and make one clear ${lens.decisionNoun}.`,
      quoteOrDetailRequirement: `Use one concrete detail, quote, or example from ${reading} and explain why it matters for ${alternate} in ${lesson.title}.`,
      connectionPrompt: `Connect the reading to this week's practice by naming how it should shape ${stripTerminalPunctuation(lesson.studentArtifact)} before the next class session.`,
      submissionChecklist: [
        `Name the reading focus for ${lesson.title}.`,
        `Use one specific piece of ${lens.evidenceNoun} from the reading or lesson materials.`,
        `Explain one decision, implication, or revision move for ${lesson.studentArtifact}.`,
      ],
      successCriteria: [
        `${deliverableName} uses an actual reading detail instead of generic summary.`,
        `${deliverableName} connects the reading to ${lesson.studentArtifact} or the weekly practice task.`,
        `${deliverableName} ends with a concrete implication, next step, or question for class discussion.`,
      ],
      instructorReviewFocus: `Look for whether the student cites ${reading}, connects ${focus} to ${lesson.studentArtifact}, and makes a usable ${lens.decisionNoun} for the next checkpoint.`,
    };
  });

  return {
    deliverableName,
    deliverableType: 'compiled-reading-response',
    source: 'deterministic-course-blueprint',
    [arrayKey]: items,
  };
}

function getStructuredCustomTemplateDefinition(templateKind) {
  return CUSTOM_STRUCTURED_TEMPLATE_DEFINITIONS.find((definition) => definition.kind === templateKind) || null;
}

function buildStructuredCustomFamilyFields(templateKind, context) {
  const { alternate, artifact, concept, contextCue, evidenceNoun, lesson, lessonTitle, lens, sourceCue, successCue } =
    context;
  const artifactLabel = stripTerminalPunctuation(artifact || 'lesson artifact');

  switch (templateKind) {
    case 'feedback-form':
      return {
        feedbackPrompts: [
          `Name one place where the ${artifactLabel} uses strong ${evidenceNoun} for ${concept}.`,
          `Identify one place where the ${artifactLabel} needs clearer reasoning, support, or audience fit.`,
          `Suggest one revision that would make the ${artifactLabel} more useful for the next ${lens.decisionNoun}.`,
        ],
        feedbackCriteria: [
          `Feedback cites visible evidence from ${sourceCue}.`,
          `Feedback connects ${concept} to ${alternate} instead of giving generic praise.`,
          `Feedback ends with a revision move the author can apply before submission.`,
        ],
        revisionUse: `Students use the feedback to revise ${artifactLabel} before the next checkpoint.`,
      };
    case 'project-milestone-checklist':
      return {
        milestoneChecklist: [
          `Define the ${lessonTitle} project goal in one sentence.`,
          `Attach the current ${artifactLabel} draft, prototype, memo, or planning evidence.`,
          `Show which ${concept} decision has been made and what evidence supports it.`,
          `Name one blocker, risk, or dependency that could delay the next milestone.`,
        ],
        riskCheck: `Flag any missing ${evidenceNoun}, stakeholder input, tool access, or instructor decision needed before the next milestone.`,
        nextMilestone:
          lesson.pacing?.bridgeTo || `Prepare the next ${lens.decisionNoun} using feedback from this checkpoint.`,
      };
    case 'lab-report':
      return {
        labReportSections: [
          `Question or purpose: explain what ${concept} is testing or demonstrating.`,
          `Method: describe the procedure, materials, data, or setup used in ${lessonTitle}.`,
          `Results: report observations, measurements, outputs, or errors from ${sourceCue}.`,
          `Analysis: explain what the results show about ${alternate} and what limitations remain.`,
        ],
        dataQualityCheck: `Confirm the record includes enough detail for another student to inspect the ${artifactLabel} evidence without inventing missing data.`,
        safetyAndAccessNote:
          lesson.accessibilityPlan?.accommodationReviewCue ||
          `Confirm local lab safety, access, privacy, and equipment rules before publishing this report shell.`,
      };
    case 'case-brief':
      return {
        caseBriefSections: [
          `Case context: summarize the situation or source problem from ${contextCue}.`,
          `Issue or decision: state the central ${lens.decisionNoun} students must make.`,
          `Evidence: cite the strongest ${evidenceNoun} for ${concept} and one limitation.`,
          `Recommendation: explain the action, interpretation, or next step supported by the case.`,
        ],
        decisionQuestion: `What should the decision-maker do next, and how does ${alternate} change that answer?`,
        discussionCarryForward:
          lesson.learningTransferPlan?.transferTask ||
          `Use this brief to prepare for the next case discussion or artifact revision.`,
      };
    case 'policy-memo-checkpoint':
      return {
        policyMemoSections: [
          `Problem statement: define the policy problem or decision from ${lessonTitle}.`,
          `Evidence summary: present the most relevant ${evidenceNoun} from ${sourceCue}.`,
          `Options and tradeoffs: compare at least two plausible choices for ${concept}.`,
          `Recommendation: make a defensible ${lens.decisionNoun} and name the implementation risk.`,
        ],
        stakeholderCheck: `Name who is affected, what they need to know, and which evidence limitation should be disclosed.`,
        memoReadinessCriteria: [
          `The memo uses course evidence instead of invented policy facts.`,
          `The recommendation is actionable for the stated audience.`,
          `The limitation or uncertainty is visible before the conclusion.`,
        ],
      };
    case 'observation-checklist':
      return {
        observationTargets: [
          `Record where ${concept} appears in the setting, source, performance, or interaction.`,
          `Capture one concrete behavior, quote, measurement, or artifact connected to ${alternate}.`,
          `Separate direct observation from inference or interpretation.`,
          `Note one accessibility, ethics, privacy, or context factor that affects interpretation.`,
        ],
        fieldNotesProtocol: `Use timestamped or source-located notes from ${sourceCue}; do not add details that were not observed or provided.`,
        debriefPrompt: `After observation, explain what the evidence suggests for the next ${lens.decisionNoun}.`,
      };
    case 'participation-self-assessment':
      return {
        selfAssessmentPrompts: [
          `What did you contribute to the ${lessonTitle} work session or preparation?`,
          `Which ${concept} idea can you now explain or use more confidently?`,
          `Where did you need support, feedback, or more source evidence?`,
          `What is one concrete action you will take before the next lesson?`,
        ],
        participationEvidence: [
          `Reference a discussion contribution, draft move, question, peer-support action, or practice artifact.`,
          `Connect the contribution to ${successCue}.`,
          `Avoid generic attendance-only evidence.`,
        ],
        instructorUse: `Use responses to identify participation barriers, feedback needs, and readiness for ${artifactLabel}.`,
      };
    case 'capstone-progress-report':
      return {
        progressReportSections: [
          `Completed work: summarize the ${artifactLabel} progress visible this week.`,
          `Evidence used: identify the strongest ${evidenceNoun} supporting the current direction.`,
          `Decision made: explain the ${lens.decisionNoun} connected to ${concept}.`,
          `Next risk: name the blocker, assumption, or review need before the next milestone.`,
        ],
        nextMilestone:
          lesson.pacing?.bridgeTo || `Move from ${lessonTitle} toward the next capstone deliverable checkpoint.`,
        advisorReviewFocus: `Check whether the student can justify progress with inspectable evidence and a realistic next action.`,
      };
    case 'problem-set-worksheet':
      return {
        worksheetTasks: [
          `Set up: define the quantities, variables, claims, or conditions for ${concept}.`,
          `Worked example: solve one model problem or reasoning step using ${sourceCue}.`,
          `Independent practice: complete a parallel problem that applies ${alternate}.`,
          `Error analysis: explain one likely mistake and how to detect it.`,
        ],
        answerCheck: `Show the reasoning, not only the final answer, and connect the result to ${artifactLabel}.`,
        extensionPrompt: `Create one variation that changes an assumption, dataset, constraint, or context for ${lessonTitle}.`,
      };
    default:
      return {};
  }
}

function compileStructuredCustomDeliverable(featureId, blueprint, options = {}) {
  const custom = getCustomDeliverableDefinition(featureId, options);
  const templateKind = getCompiledCustomTemplateKind(featureId, options);
  const definition = getStructuredCustomTemplateDefinition(templateKind);
  if (!custom || !definition) return null;

  const deliverableName = cleanText(custom.name, definition.defaultName);
  const arrayKey = slugifyCustomArrayKey(deliverableName);
  const lens = blueprintLens(blueprint);
  const items = blueprint.lessons.map((lesson) => {
    const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
    const alternate = alternateLessonConcept(lesson, concept);
    const phrase = lessonPhrase(blueprint, lesson);
    const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
    const lessonTitle = stripLessonPrefix(lesson.title);
    const contextCue = conciseClause(phrase.context, lessonTitle, 110);
    const activityCue = conciseClause(lesson.activityPattern, `${lessonTitle} activity`, 110);
    const sourceCue = lesson.evidencePlan?.sourceCue || lesson.readings?.[0] || `${lessonTitle} course materials`;
    const successCue = conciseClause(lesson.successCriteria, 'the lesson success criteria', 120);
    const common = {
      lessonTitle: lesson.title,
      weekNumber: `Week ${lesson.lessonNumber}`,
      deliverableName,
      promptTitle: `${deliverableName} ${lesson.lessonNumber}`,
      purposePrompt: `Use ${deliverableName} to connect ${concept} from ${contextCue} to ${artifact} in ${customPracticeContext(blueprint, lens)}.`,
      courseContext: contextCue,
      evidenceToUse: [
        `Use one concrete detail from ${sourceCue}.`,
        `Connect the detail to ${alternate} or ${artifact}.`,
        `Name one uncertainty, limitation, or local-review item before finalizing.`,
      ],
      completionChecklist: [
        `The response is specific to ${lesson.title}.`,
        `The response uses visible course evidence rather than vague summary.`,
        `The response ends with a next action tied to feedback, revision, practice, or assessment.`,
      ],
      instructorReviewFocus: `Check whether the student links ${concept}, ${alternate}, and ${artifact} with inspectable evidence from ${activityCue}.`,
      localReviewNote: lessonLocalReviewAction(lesson),
      sourceGrounding: lessonSourceGrounding(lesson, {
        compiledPattern: templateKind,
        evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
        learnerContextProfile: blueprint.learnerContextProfile,
      }),
    };
    return {
      ...common,
      ...buildStructuredCustomFamilyFields(templateKind, {
        alternate,
        artifact,
        concept,
        contextCue,
        evidenceNoun: lens.evidenceNoun || 'evidence',
        lesson,
        lessonTitle,
        lens,
        sourceCue,
        successCue,
      }),
    };
  });

  return {
    deliverableName,
    deliverableType: `compiled-${templateKind}`,
    source: 'deterministic-course-blueprint',
    compilerTrustReceipt: {
      source: 'deterministic-custom-template',
      compiledPattern: templateKind,
      modelFallback: 'not used',
      boundary: 'One item per lesson/week compiled only when the custom definition matches a supported family.',
      localReviewPolicy:
        'Review official dates, policies, source permissions, safety rules, and local examples before publishing.',
    },
    [arrayKey]: items,
  };
}

// v0.13.5 P3: which evidence-cited teaching moves does this course's compiled
// package actually use? Derived from lesson data, never asserted blindly —
// the methods statement only claims moves the deliverables contain.
function collectCourseTeachingMoves(blueprint) {
  const moves = new Set(['retrieval-warmup', 'peer-discussion']);
  for (const lesson of blueprint.lessons || []) {
    const kernelPayload = lesson.enrichment || null;
    const hasMisconception =
      (kernelPayload?.keyTerms || []).some((term) => term.misconception) ||
      (Array.isArray(lesson.misconceptionMap) && lesson.misconceptionMap.length > 0);
    if (hasMisconception) moves.add('misconception-poll');
    if (kernelPayload?.workedExample) moves.add('worked-example');
    if ((kernelPayload?.keyTerms || []).length >= 3) moves.add('concept-map');
  }
  return [...moves];
}

// v0.13.5 P3: one "why this works" note per teaching move present in THIS
// lesson — real citations from the curated evidence base. Each note is
// anchored to the lesson's concept (boilerplate-gate rule: course-wide
// statements need per-lesson anchors or readiness flags them as template
// sludge).
function buildLessonEvidenceBase(lesson) {
  const kernelPayload = lesson.enrichment || null;
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title || '') || 'the lesson focus';
  const hasMisconception =
    (kernelPayload?.keyTerms || []).some((term) => term.misconception) ||
    (Array.isArray(lesson.misconceptionMap) && lesson.misconceptionMap.length > 0);
  const moves = [hasMisconception ? 'misconception-poll' : 'retrieval-warmup', 'peer-discussion'];
  if (kernelPayload?.workedExample) moves.push('worked-example');
  if ((kernelPayload?.keyTerms || []).length >= 3) moves.push('concept-map');
  return moves.map((move) => whyThisWorksNote(move, { anchor: concept })).filter(Boolean);
}

const KNOWLEDGE_ORIGIN_LABELS = {
  genome: 'Open textbook sections (quote-anchored in the curriculum library)',
  openalex: 'Peer-reviewed readings (open access)',
  openlibrary: 'Books and reference texts',
  syllabus: 'Instructor-listed materials',
};

// v0.13.5 P4: the Sources & Licenses appendix — CC-BY compliance generated,
// not hoped for. Renders in the syllabus DOCX and the package.
function buildSourcesAndLicenses(blueprint) {
  const resources = Array.isArray(blueprint.knowledgeResources) ? blueprint.knowledgeResources : [];
  if (resources.length === 0) return null;
  const groups = [];
  const grouped = new Set();
  for (const [origin, label] of Object.entries(KNOWLEDGE_ORIGIN_LABELS)) {
    const entries = resources.filter((resource) => resource.origin === origin);
    if (entries.length === 0) continue;
    entries.forEach((resource) => grouped.add(resource));
    groups.push({
      origin,
      label,
      entries: entries.map((resource) => ({
        citation: resource.citation,
        license: resource.license,
        attribution: resource.attribution,
        url: resource.url,
      })),
    });
  }
  const other = resources.filter((resource) => !grouped.has(resource));
  if (other.length > 0) {
    groups.push({
      origin: 'other',
      label: 'Other course resources',
      entries: other.map((resource) => ({
        citation: resource.citation,
        license: resource.license,
        attribution: resource.attribution,
        url: resource.url,
      })),
    });
  }
  return {
    title: 'Sources & Licenses',
    note: 'Open educational resources used in this course package, with their licenses and attribution. Attribution must remain with redistributed materials for CC BY sources.',
    groups,
  };
}

// v0.13.5 P2: real required texts from knowledge resources — the open
// textbook(s) the genome anchors quote, plus Open Library book metadata —
// replacing the "Instructor-provided course reading packet" placeholder.
function buildRequiredTextsFromKnowledge(blueprint) {
  const resources = Array.isArray(blueprint.knowledgeResources) ? blueprint.knowledgeResources : [];
  const texts = [];
  const seen = new Set();
  for (const resource of resources) {
    if (resource.origin === 'genome') {
      // Collapse section-level citations ("OpenStax astronomy 2e §2.1 …")
      // to one book-level required text.
      const book = cleanText(resource.citation.replace(/\s*§.*$/, '').replace(/\s*\(open textbook.*$/i, ''));
      if (!book || seen.has(book.toLowerCase())) continue;
      seen.add(book.toLowerCase());
      texts.push({
        title: book,
        author: resource.attribution || 'Open textbook authors',
        edition: '',
        isbn: '',
        note: `Open textbook (${resource.license})${resource.url ? ` — ${resource.url}` : ''}. Free to read and redistribute with attribution.`,
      });
    } else if (resource.kind === 'book') {
      const book = cleanText(resource.citation);
      if (!book || seen.has(book.toLowerCase())) continue;
      seen.add(book.toLowerCase());
      texts.push({
        title: book,
        author: resource.attribution || '',
        edition: '',
        isbn: '',
        note: `Reference text (metadata via ${resource.attribution || 'Open Library'}). Confirm the edition with the instructor.`,
      });
    }
  }
  return texts;
}

function compileSyllabus(blueprint) {
  const instructorPreferenceReceipt = preferenceReceipt(blueprintPreferenceProfile(blueprint));
  const compilerProofBundle = blueprint.compilerProofBundle || buildCompilerProofBundle(blueprint);
  const criteriaSignatures = blueprint.assessments.map((assessment) =>
    joinCriteriaSentence(assessment.successCriteria),
  );
  const requirements = blueprint.assessments.map((assessment, index) => {
    const signature = criteriaSignatures[index];
    const firstUseIndex = criteriaSignatures.indexOf(signature);
    // When several assessments share identical success criteria, state them
    // once instead of stamping the same sentence into every grading row.
    const criteriaText =
      firstUseIndex === index
        ? `Strong work: ${signature}`
        : `Strong work follows the same success criteria as ${blueprint.assessments[firstUseIndex].title}.`;
    // The feedback-loop reminder reads once for the whole table, not per row.
    const feedbackText = index === 0 ? ' Feedback is used to improve later course artifacts.' : '';
    return {
      name: assessment.title,
      weight: assessment.weight,
      description: `${assessment.artifact}. ${criteriaText}${feedbackText}`,
    };
  });
  const compactConceptGraph = compactConceptDependencyGraph(blueprint.conceptDependencyGraph);
  const compactMasteryMap = compactMasteryEvidenceMap(blueprint.masteryEvidenceMap);
  const compactResponseMap = compactEvidenceResponseMap(blueprint.evidenceResponseMap);
  const compactObjectiveEvidence = compactObjectiveEvidenceMap(blueprint.objectiveEvidenceMap);
  const compactRiskRegister = compactSourceRiskRegister(compilerProofBundle.sourceRiskRegister);
  const compactDecisionMatrix = compactCompilerDecisionMatrix(compilerProofBundle.compilerDecisionMatrix);
  const compactAssessmentPlan = compactAssessmentArchitecture(compilerProofBundle.assessmentArchitecture);
  const compactSourceConflicts = compactSourceConflictReport(compilerProofBundle.sourceConflictReport);
  const compactHandoffPlan = compactClassroomHandoffPlan(compilerProofBundle.classroomHandoffPlan);
  const compactDryRunPlan = compactClassroomDryRunPlan(compilerProofBundle.classroomDryRunPlan);
  const compactEvidenceLoopPlan = compactClassroomEvidenceLoopPlan(compilerProofBundle.classroomEvidenceLoopPlan);
  const compactFeedbackLoadPlan = compactInstructorFeedbackLoadPlan(compilerProofBundle.instructorFeedbackLoadPlan);
  const compactAssumptions = compactAssumptionLedger(compilerProofBundle.blueprintAssumptionLedger);
  const compactCoherence = compactPackageCoherenceMatrix(compilerProofBundle.packageCoherenceMatrix);
  const compactReviewSurface = compactBlueprintReviewSurface(compilerProofBundle.blueprintReviewSurface);
  const compactWorkloadBalance = compactCourseWorkloadBalance(compilerProofBundle.courseWorkload);
  const assessmentForLesson = (lesson) =>
    blueprint.assessments.find((assessment) => assessment.lessonNumbers.includes(lesson.lessonNumber)) || {};

  return {
    syllabus: {
      courseTitle: blueprint.courseName,
      semester: blueprint.semester,
      credits: '3 credits',
      meetingPattern:
        blueprint.localization?.meetingPattern ||
        'Weekly course sessions with applied practice and feedback checkpoints',
      location: blueprint.localization?.classLocation || 'Official course site and assigned class meeting space',
      deliveryMode: blueprint.courseModalityProfile?.sessionPattern || 'Course format listed by the program',
      prerequisites: 'No formal prerequisites listed; students should review program requirements.',
      instructor: blueprint.localization?.instructorName || 'Course instructor',
      instructorEmail: blueprint.localization?.instructorEmail || 'Use the contact method listed in the course site',
      officeHours:
        blueprint.localization?.officeHours || 'Office hours are available through the course communication channel',
      officeLocation:
        blueprint.localization?.officeLocation ||
        'Office hours location or meeting link is available in the course site',
      instructorBio:
        'The instructor supports rigorous, applied learning and expects students to connect course ideas to professional decisions. Office hours and course messages are available for clarification, planning, and feedback on work in progress.',
      courseDescription: `In ${blueprint.courseName}, students work through ${blueprint.totalLessons} connected lessons that build from core concepts to applied decisions. ${blueprint.courseArc.throughline} The course emphasizes evidence use, structured practice, and feedback-informed improvement across the major assessments.`,
      gettingStarted:
        'Begin by reviewing the course site, syllabus, weekly schedule, and first lesson materials. Check the assessment calendar, confirm technology access, and post any Week 1 questions through the official course communication channel.',
      learnerIntroActivity:
        'Students introduce themselves in Week 1 by naming one course goal, one relevant experience, and one question they want the course to help answer.',
      blueprintQualityReceipt: {
        source: blueprint.source,
        confidenceLevel: blueprint.qualitySignals.confidenceLevel,
        averageConfidenceScore: blueprint.qualitySignals.averageConfidenceScore,
        reviewFlagCount: blueprint.qualitySignals.reviewFlagCount,
        reviewFlags: blueprint.qualitySignals.reviewFlags,
        workloadAverageHours: blueprint.courseWorkload.averagePerLessonHours,
        workloadBalance: compactWorkloadBalance,
        timingStatus: blueprint.courseWorkload.timingStatus,
        averagePlannedClassMinutes: blueprint.courseWorkload.averagePlannedClassMinutes,
        courseArc: blueprint.courseArc.throughline,
        conceptDependencyGraph: compactConceptGraph,
        masteryEvidenceMap: compactMasteryMap,
        evidenceResponseMap: compactResponseMap,
        objectiveEvidenceMap: compactObjectiveEvidence,
        learnerContextProfile: blueprint.learnerContextProfile,
        courseModalityProfile: blueprint.courseModalityProfile,
        sourceConflictReport: compactSourceConflicts,
        sourceRiskRegister: compactRiskRegister,
        compilerDecisionMatrix: compactDecisionMatrix,
        assessmentArchitecture: compactAssessmentPlan,
        classroomHandoffPlan: compactHandoffPlan,
        classroomDryRunPlan: compactDryRunPlan,
        classroomEvidenceLoopPlan: compactEvidenceLoopPlan,
        instructorFeedbackLoadPlan: compactFeedbackLoadPlan,
        blueprintAssumptionLedger: compactAssumptions,
        packageCoherenceMatrix: compactCoherence,
        blueprintReviewSurface: compactReviewSurface,
        compilerPath: blueprint.compilerPath,
        semanticContract: compactBlueprintContract(blueprint.semanticContract),
        compilerContract: compactBlueprintContract(blueprint.compilerContract),
        compilerProofBundle: {
          source: compilerProofBundle.source,
          status: compilerProofBundle.status,
          modelFallback: compilerProofBundle.modelFallback,
          proofSummary: compilerProofBundle.proofSummary,
          findings: compilerProofBundle.findings,
        },
        enrichmentLanguage: compactEnrichmentLanguage(blueprint.enrichment),
        ...(blueprint.enrichment?.quality ? { enrichmentQuality: blueprint.enrichment.quality } : {}),
        ...(instructorPreferenceReceipt ? { instructorPreferenceProfile: instructorPreferenceReceipt } : {}),
      },
      learnerContextProfile: blueprint.learnerContextProfile,
      courseModalityProfile: blueprint.courseModalityProfile,
      conceptDependencyGraph: compactConceptGraph,
      masteryEvidenceMap: compactMasteryMap,
      evidenceResponseMap: compactResponseMap,
      objectiveEvidenceMap: compactObjectiveEvidence,
      workloadBalance: compactWorkloadBalance,
      sourceConflictReport: compactSourceConflicts,
      sourceRiskRegister: compactRiskRegister,
      compilerDecisionMatrix: compactDecisionMatrix,
      assessmentArchitecture: compactAssessmentPlan,
      classroomHandoffPlan: compactHandoffPlan,
      classroomDryRunPlan: compactDryRunPlan,
      classroomEvidenceLoopPlan: compactEvidenceLoopPlan,
      instructorFeedbackLoadPlan: compactFeedbackLoadPlan,
      blueprintAssumptionLedger: compactAssumptions,
      packageCoherenceMatrix: compactCoherence,
      learningOutcomes: unique(
        blueprint.lessons.flatMap((lesson) => lesson.outcomes),
        7,
      ),
      courseAtAGlance: blueprint.lessons.map((lesson) => {
        const assessment = assessmentForLesson(lesson);
        return {
          week: `Week ${lesson.lessonNumber}`,
          topic: stripLessonPrefix(lesson.title),
          inClassFocus: `${stripLessonPrefix(lesson.title)}: ${lesson.activityPattern}`,
          studentOutput: lesson.studentArtifact,
          pointsOrWeight: assessment.weight,
          assessmentRole: assessment.roleLabel,
          assessmentCadence: {
            dueWindow: assessment.cadence?.dueWindow,
            feedbackWindow: assessment.cadence?.feedbackWindow,
            revisionUse: assessment.revisionUse,
          },
          criterionWeightSummary:
            (assessment.criterionWeightPlan || [])
              .map((entry) => `${entry.priority || entry.criterion}: ${entry.weight}%`)
              .join('; ') || '',
          successCriteria: lesson.successCriteria[0],
          readinessCue: lesson.readinessSupport?.readinessEvidence || '',
          feedbackUse: lesson.feedbackCycle?.nextUse || lesson.feedbackMoment,
          transferCue: lesson.learningTransferPlan?.transferTask || '',
          modalityCue: lesson.modalityCue,
          artifactGenre: lesson.artifactGenre?.label || lesson.artifactGenre?.genre || '',
          classSessionFit: lesson.classSessionPlan?.feasibilityStatus || '',
          workload: lesson.workloadEstimate.studentFacingEstimate,
          difficulty: lesson.difficultyProfile.difficulty,
          sourceConfidence: lesson.confidence.level,
          sourceRiskLevel: lesson.sourceRisk?.riskLevel || '',
          publishGate: lesson.compilerDecision?.publishGate || '',
          localReviewNeeded: lesson.missingSignals,
          localReviewAction: lessonLocalReviewAction(lesson),
        };
      }),
      outcomeAlignmentMatrix: unique(
        blueprint.lessons.flatMap((lesson) => lesson.outcomes),
        7,
      ).map((outcome) => ({
        outcome,
        bloomsLevel: inferBloomLevelFromSignals([{ source: 'course outcome', text: outcome }]).level,
        assessedBy: blueprint.assessments
          .filter((assessment) =>
            assessment.objectives.some(
              (objective) => cleanText(objective).toLowerCase() === cleanText(outcome).toLowerCase(),
            ),
          )
          .map((assessment) => assessment.title)
          .slice(0, 3),
        practicedIn: blueprint.lessons
          .filter((lesson) => lesson.outcomes.includes(outcome))
          .map((lesson) => lesson.title)
          .slice(0, 4),
      })),
      lessonAlignmentMatrix: (blueprint.alignmentMatrix || []).map((row) => ({
        week: `Week ${row.lessonNumber}`,
        lesson: stripLessonPrefix(row.lessonTitle),
        assessmentArtifact: row.assessmentArtifact,
        evidenceRequirement: row.evidenceRequirement,
        sourceEvidenceCue: row.sourceEvidenceCue,
        sourceRiskLevel: row.sourceRiskLevel,
        compilerDecisionCue: row.compilerDecisionCue,
        publishGate: row.publishGate,
        sourceUseCue: row.sourceUseCue,
        prerequisiteCue: row.prerequisiteCue,
        conceptDependencyCue: row.conceptDependencyCue,
        conceptTransferCue: row.conceptTransferCue,
        practiceProgressionCue: row.practiceProgressionCue,
        practiceProgressionTransferCue: row.practiceProgressionTransferCue,
        objectiveEvidenceCue: row.objectiveEvidenceCue,
        feedbackUse: row.feedbackUse,
        misconceptionCheck: row.misconceptionCheck,
        modelContrastCue: row.modelContrastCue,
        readinessSupportCue: row.readinessSupportCue,
        instructionalRationaleCue: row.instructionalRationaleCue,
        accessibilityCue: row.accessibilityCue,
        feedbackCycleCue: row.feedbackCycleCue,
        learningTransferCue: row.learningTransferCue,
        modalityCue: row.modalityCue,
        modalityDecodeCue: row.modalityDecodeCue,
        artifactGenreCue: row.artifactGenreCue,
        artifactGenreOutputFormat: row.artifactGenreOutputFormat,
        artifactGenreEvidenceRequirement: row.artifactGenreEvidenceRequirement,
        classSessionCue: row.classSessionCue,
        assessmentRoleCue: row.assessmentRoleCue,
        assessmentCadenceCue: row.assessmentCadenceCue,
        criterionWeightCue: row.criterionWeightCue,
        teachingIntentCue: row.teachingIntentCue,
        gradingCalibrationCue: row.gradingCalibrationCue,
        criterionEvidenceCue: row.criterionEvidenceCue,
        anchorExampleCue: row.anchorExampleCue,
        successCriteria: row.successCriteria,
        status: row.alignmentStatus,
        localReviewNeeded: row.localReviewNeeded,
        localReviewAction: lessonLocalReviewAction(
          blueprint.lessons.find((lesson) => lesson.lessonNumber === row.lessonNumber) || {},
        ),
      })),
      requiredTexts:
        buildRequiredTextsFromKnowledge(blueprint).length > 0
          ? buildRequiredTextsFromKnowledge(blueprint)
          : [
              {
                title: 'Instructor-provided course reading packet',
                author: 'Course instructor',
                edition: '',
                isbn: '',
                note: 'Required course materials are distributed through the official course site or assigned in class.',
              },
            ],
      sourceUsePolicy: {
        citationExpectation:
          'Use instructor-provided readings, datasets, cases, slides, activities, and notes. Name the source used when making evidence-based claims.',
        noInventedSources:
          'Do not invent authors, titles, URLs, page numbers, studies, cases, or data. Missing source details require instructor review before publishing or submission.',
        localReview:
          'Before handoff, verify official readings, copyrighted materials, media permissions, datasets, and local policy documents.',
      },
      courseRequirements: requirements,
      assessmentCalendar: blueprint.assessments.map((assessment) => ({
        week: `Week ${assessment.lessonNumbers[0]}`,
        assessmentOrMilestone: assessment.title,
        pointsOrWeight: assessment.weight,
        gradingWeightProvenance: compactWeightProvenance(assessment.weightProvenance),
        assessmentRole: assessment.roleLabel,
        stakes: assessment.stakes,
        gradingMode: assessment.gradingMode,
        roleRationale: assessment.roleRationale,
        studentFacingPurpose: assessment.studentFacingPurpose,
        cadence: {
          dueWindow: assessment.cadence?.dueWindow,
          feedbackWindow: assessment.cadence?.feedbackWindow,
          revisionWindow: assessment.cadence?.revisionWindow,
        },
        revisionUse: assessment.revisionUse,
        rubricCriteria: assessment.criteria,
        feedbackAndRevisionUse: assessment.feedbackUse,
        calibrationCue:
          assessment.calibrationPlan?.studentTransparency || assessment.validityEvidence?.calibrationCheck,
        criterionWeightSummary:
          (assessment.criterionWeightPlan || [])
            .map((entry) => `${entry.priority || entry.criterion}: ${entry.weight}%`)
            .join('; ') || '',
        validitySummary: assessment.validityEvidence?.targetConstruct || '',
        anchorExampleSummary: assessment.anchorExampleSet?.strongSignal || '',
      })),
      gradingScale: [
        { grade: 'A', range: '93-100' },
        { grade: 'A-', range: '90-92' },
        { grade: 'B+', range: '87-89' },
        { grade: 'B', range: '83-86' },
        { grade: 'B-', range: '80-82' },
        { grade: 'C+', range: '77-79' },
        { grade: 'C', range: '73-76' },
        { grade: 'C-', range: '70-72' },
        { grade: 'D+', range: '67-69' },
        { grade: 'D', range: '63-66' },
        { grade: 'F', range: 'Below 63' },
      ],
      latePolicy: blueprint.policies.lateWork,
      attendancePolicy:
        'Students are expected to participate in scheduled course activities and complete weekly work. If an absence affects participation or submission, contact the instructor promptly and follow the course communication process.',
      communicationPolicy: blueprint.policies.communication,
      technologyPolicy:
        'Students need reliable access to the course site, assigned readings, document submission tools, and any discipline-specific software named in weekly materials.',
      technicalSkills:
        'Students should be able to navigate the course site, submit files, participate in discussions, access readings, and use feedback to revise work.',
      aiPolicy:
        'Generative AI tools may be used only as the instructor allows for each task. When approved AI assistance contributes to submitted work, name the tool and describe how it was used. AI output must be verified against course sources, and students remain responsible for accuracy, citations, and final judgment.',
      weeklySchedule: blueprint.lessons.map((lesson) => ({
        week: `Week ${lesson.lessonNumber}`,
        dates: `Week ${lesson.lessonNumber}`,
        topic: stripLessonPrefix(lesson.title),
        readings: lesson.readings.join('; '),
        assignments: `${lesson.studentArtifact}. Success criterion: ${lesson.successCriteria[0]} Estimated workload: ${lesson.workloadEstimate.studentFacingEstimate}.`,
      })),
      academicIntegrity: blueprint.policies.academicIntegrity,
      technicalSupport:
        'For technical issues, document the problem, try the recommended course-site troubleshooting steps, and contact institutional technical support or the instructor as appropriate.',
      accommodations: blueprint.policies.accessibility,
      mentalHealth:
        'Students are encouraged to use campus wellness and counseling resources when academic or personal challenges affect learning. Contact the instructor early if course planning support would help.',
      titleIX:
        'The course follows institutional non-discrimination and Title IX policies. Use official university reporting and support resources for concerns.',
      supportServices:
        'Students can use academic support, writing support, library research help, advising, and accessibility resources to strengthen course performance.',
      dataPrivacy:
        'Course technologies should be used according to institutional privacy expectations. Avoid sharing private student information outside approved course spaces.',
      importantDates: blueprint.assessments.map((assessment) => ({
        date: `Week ${assessment.lessonNumbers[0]}`,
        event: assessment.title,
      })),
      // v0.13.5 P3/P4: the accreditor-facing receipts — evidence-based design
      // with real citations, and generated license compliance.
      ...(buildMethodsStatement(collectCourseTeachingMoves(blueprint))
        ? { methodsStatement: buildMethodsStatement(collectCourseTeachingMoves(blueprint)) }
        : {}),
      ...(buildSourcesAndLicenses(blueprint) ? { sourcesAndLicenses: buildSourcesAndLicenses(blueprint) } : {}),
      tags: unique([blueprint.courseName, ...blueprint.courseConcepts, 'assessment alignment', 'student support'], 12),
    },
  };
}

function compileAssignments(blueprint) {
  const lens = blueprintLens(blueprint);
  const preference = featurePreference(blueprint, 'assignments');
  return {
    courseAssignmentMap: blueprint.assessments.map((assessment) => ({
      week: assessment.lessonNumbers[0],
      artifact: assessment.title,
      assessmentRole: assessment.roleLabel,
      weight: assessment.weight,
      gradingWeightProvenance: compactWeightProvenance(assessment.weightProvenance),
      criterionWeightCue:
        (assessment.criterionWeightPlan || [])
          .map((entry) => `${entry.priority || entry.criterion}: ${entry.weight}%`)
          .join('; ') || '',
      feedbackWindow: assessment.cadence?.feedbackWindow,
      expectedFile: 'Document, presentation, or course-site submission as assigned',
      length: 'Course-appropriate length with enough evidence to address every criterion',
      nextPortfolioUse: assessment.feedbackUse,
    })),
    assignments: blueprint.assessments.map((assessment, index) => {
      const lesson = blueprint.lessons[index] || {};
      const submissionProfile = buildAssignmentSubmissionProfile({ lesson, assessment, lens });
      const assessmentTitle = stripTerminalPunctuation(assessment.title);
      const assessmentArtifact = stripTerminalPunctuation(
        assessment.artifact || submissionProfile.artifact || assessment.title,
      );
      const feedbackPriority = preference
        ? `${assessment.feedbackUse} Preference profile: ${preference}.`
        : assessment.feedbackUse;
      const finalMilestoneFeedback = `Final feedback on ${assessmentTitle} should identify one criterion strength, one revision priority, and the next use of the submitted evidence. ${assessment.feedbackUse}`;
      return {
        title: assessment.title,
        assignmentType: submissionProfile.assignmentType,
        relatedLessons: assessment.relatedLessons,
        dueWeek: `Week ${assessment.lessonNumbers[0]}`,
        estimatedTime: submissionProfile.estimatedTime,
        totalPoints: assessment.points,
        percentOfGrade: assessment.weight,
        weightPercent: assessment.weightPercent,
        assessmentRole: assessment.roleLabel,
        assessmentStakes: assessment.stakes,
        assessmentArchitecture: {
          role: assessment.role,
          roleLabel: assessment.roleLabel,
          stakes: assessment.stakes,
          gradingMode: assessment.gradingMode,
          weightProvenance: compactWeightProvenance(assessment.weightProvenance),
          roleRationale: assessment.roleRationale,
          studentFacingPurpose: assessment.studentFacingPurpose,
          cadence: assessment.cadence,
          revisionUse: assessment.revisionUse,
          criterionWeightPlan: assessment.criterionWeightPlan,
        },
        bloomsLevel: assessment.bloomsLevel,
        portfolioConnection: `This artifact documents how students apply ${assessment.relatedLessons.join(', ')} to a course-relevant decision for ${assessmentTitle}.`,
        expectedSubmissionFormat: `Submit ${submissionProfile.artifact} through the official course site using the weekly ${lens.domain} format. ${submissionProfile.submissionMode} Expected format: ${submissionProfile.expectedFormat}. Evidence standard: ${submissionProfile.evidenceRequirement}. Review before submission: ${submissionProfile.reviewProtocol}`,
        submissionProfile,
        highValueSuccessCriteria: assessment.successCriteria,
        instructorFeedbackPriority: feedbackPriority,
        sourceGrounding: lessonSourceGrounding(lesson, {
          assessmentArtifact: assessment.artifact,
          assessmentTitle: assessment.title,
          submissionProfile,
          feedbackUse: assessment.feedbackUse,
          feedbackCycle: assessment.feedbackCycle,
          assessmentValidity: assessment.validityEvidence,
          gradingCalibrationPlan: assessment.calibrationPlan,
          criterionEvidenceMap: assessment.criterionEvidenceMap,
          criterionWeightPlan: assessment.criterionWeightPlan,
          criterionObjectiveAlignment: assessment.criterionObjectiveAlignment,
          anchorExampleSet: assessment.anchorExampleSet,
          assessmentArchitecture: {
            role: assessment.role,
            roleLabel: assessment.roleLabel,
            stakes: assessment.stakes,
            cadence: assessment.cadence,
            weightProvenance: compactWeightProvenance(assessment.weightProvenance),
            revisionUse: assessment.revisionUse,
            criterionWeightPlan: assessment.criterionWeightPlan,
          },
          learnerContextProfile: blueprint.learnerContextProfile,
          courseModalityProfile: blueprint.courseModalityProfile,
          learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
          ...(preference ? { instructorPreference: preference } : {}),
        }),
        workloadEstimate: submissionProfile.workload,
        difficultyProfile: lesson.difficultyProfile || null,
        evidencePlan: lesson.evidencePlan || null,
        sourceUsePlan: lesson.sourceUsePlan || null,
        misconceptionToWatch: lesson.misconceptionMap?.[0] || null,
        modelContrast: lesson.modelContrast || null,
        readinessSupport: lesson.readinessSupport || null,
        prerequisitePlan: lesson.prerequisitePlan || null,
        instructionalRationale: lesson.instructionalRationale || null,
        accessibilityPlan: lesson.accessibilityPlan || null,
        feedbackCycle: assessment.feedbackCycle || lesson.feedbackCycle || null,
        teachingIntent: lesson.teachingIntent || null,
        modalityCue: lesson.modalityCue || '',
        modalityDecode: lesson.modalityDecode || null,
        artifactGenre: lesson.artifactGenre || null,
        artifactGenreReviewProtocol: submissionProfile.reviewProtocol,
        artifactGenreCommonFailure: submissionProfile.commonFailure,
        courseModalityProfile: blueprint.courseModalityProfile,
        assessmentValidity: assessment.validityEvidence,
        gradingCalibrationPlan: assessment.calibrationPlan,
        criterionEvidenceMap: assessment.criterionEvidenceMap,
        criterionWeightPlan: assessment.criterionWeightPlan,
        criterionWeightGuidance: `Use the weighted criteria to prioritize feedback: ${(
          assessment.criterionWeightPlan || []
        )
          .map((entry) => `${entry.priority} ${entry.weight}%`)
          .join('; ')}.`,
        anchorExampleSet: assessment.anchorExampleSet,
        learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
        performanceBands: {
          excellent: `${assessmentTitle} uses precise ${lens.evidenceNoun}, clear analysis for ${assessment.relatedLessons[0]}, polished communication, and explicit revision use.`,
          proficient: `${assessmentTitle} includes accurate evidence and understandable analysis tied to ${assessment.relatedLessons[0]} with minor gaps in depth or polish.`,
          revisionNeeded: `${assessmentTitle} needs stronger evidence for ${assessment.relatedLessons[0]}, clearer reasoning, or a closer connection to the listed criteria.`,
        },
        overview: lesson.enrichment?.assignmentCore?.taskDescription
          ? `${lesson.enrichment.assignmentCore.taskDescription} ${assessmentArtifact} is worth ${assessment.weight}. Genre-specific quality focus: ${submissionProfile.qualityFocus}.`
          : `${assessmentArtifact} is a ${assessment.roleLabel || 'course assessment'} worth ${assessment.weight}; it asks students to turn ${assessment.relatedLessons[0]} concepts into a concrete ${submissionProfile.assignmentType.toLowerCase()}. The task is designed to show how students use evidence for ${assessmentTitle}, make decisions, and prepare for later work. Genre-specific quality focus: ${submissionProfile.qualityFocus}.`,
        ...(lesson.enrichment?.assignmentCore ? { enrichmentSource: 'lesson-content-enrichment' } : {}),
        gradingWeightProvenance: compactWeightProvenance(assessment.weightProvenance),
        objectives: assessment.objectives,
        objectiveEvidenceChecklist: objectiveEvidenceChecklist(lesson.objectiveEvidencePlan),
        instructions: [
          lesson.prerequisitePlan?.studentReadinessCheck ||
            `Confirm you can connect prerequisite knowledge to ${assessmentTitle} before drafting.`,
          ...(lesson.enrichment?.assignmentCore?.parameters?.length > 0
            ? [`Work within these parameters: ${lesson.enrichment.assignmentCore.parameters.join('; ')}.`]
            : []),
          `Review the materials for ${assessment.relatedLessons.join(', ')} and identify the central problem or decision.`,
          `Select specific ${lens.evidenceNoun} from course readings, activities, or discussion notes for ${assessmentTitle}.`,
          lesson.sourceUsePlan?.studentAttributionMove ||
            `Name the reading, activity, or course note used before explaining the evidence for ${assessmentTitle}.`,
          lesson.evidencePlan?.limitationCue
            ? `${stripTerminalPunctuation(lesson.evidencePlan.limitationCue)}, then revisit it when finalizing ${assessmentTitle}.`
            : `Name one limitation before finalizing ${assessmentTitle}.`,
          `For ${stripLessonPrefix(lesson.title)}, ${submissionProfile.reviewProtocol}.`,
          assessment.anchorExampleSet?.studentFacingUse ||
            `Compare a strong and partial sample before finalizing ${assessmentTitle}.`,
          `Draft ${assessmentTitle} so each section addresses one rubric criterion.`,
          `Use feedback or self-review to revise one evidence link, limitation, or decision step in ${assessmentArtifact} before posting it.`,
        ],
        formatRequirements: {
          length: 'Enough detail to address each criterion; follow instructor length guidance when provided.',
          format: submissionProfile.expectedFormat,
          reviewProtocol: `For ${stripLessonPrefix(lesson.title)}, ${submissionProfile.reviewProtocol}.`,
          workloadFit: submissionProfile.workload.outOfClassEstimate,
          citationStyle: `Use the citation style specified for ${assessmentTitle} or the course assignment prompt.`,
          submissionPlatform: 'Official course site',
          latePolicy: `For ${assessmentTitle}, follow the course late work policy and contact the instructor before the deadline when needed.`,
        },
        deliverables: [
          `Completed ${submissionProfile.artifact} as ${assignmentTypeWithArticle(
            submissionProfile.assignmentType,
          )} with clear headings.`,
          `${sentenceCase(lens.evidenceNoun)} or citation notes tied to ${assessment.relatedLessons[0]} course materials.`,
          `Brief reflection naming one revision decision for ${assessmentTitle}.`,
        ],
        scaffoldingMilestones: [
          {
            milestone: 'Prerequisite readiness check',
            dueDate: `Before Week ${assessment.lessonNumbers[0]} work begins`,
            description:
              lesson.prerequisitePlan?.prerequisiteEvidence ||
              `Confirm prerequisite knowledge needed for ${assessmentTitle}.`,
            feedback:
              lesson.prerequisitePlan?.reteachMove ||
              `Use instructor feedback to repair prerequisite gaps before drafting ${assessmentArtifact}.`,
            points: 0,
            uploadChecklist: lesson.prerequisitePlan?.assumedKnowledge || [
              `${assessment.relatedLessons[0]} prerequisite knowledge checked`,
            ],
          },
          {
            milestone: 'Evidence checkpoint',
            dueDate: `Before Week ${assessment.lessonNumbers[0]} submission`,
            description: `Identify the concept, ${lens.evidenceNoun}, and decision ${assessmentTitle} will address.`,
            feedback:
              assessment.feedbackCycle?.feedbackMethod ||
              `Use instructor, peer, or self-review feedback to focus ${assessmentArtifact}.`,
            points: 10,
            uploadChecklist: [
              `${assessment.relatedLessons[0]} concept named`,
              `${lens.evidenceNoun} selected`,
              'criterion checked',
            ],
          },
          {
            milestone: 'Final submission',
            dueDate: `Week ${assessment.lessonNumbers[0]}`,
            description: `Submit the complete ${assessmentArtifact} with all rubric criteria addressed.`,
            feedback: finalMilestoneFeedback,
            points: 90,
            uploadChecklist: [`${assessmentTitle} complete`, 'criteria addressed', 'reflection included'],
          },
        ],
        gradingCriteria: assessment.criteria,
        weightedGradingCriteria: assessment.criterionWeightPlan || [],
        supportResources: [
          `${assessment.relatedLessons[0]} notes and assigned readings`,
          `Rubric criteria for ${assessmentTitle}`,
          assignmentChecklistResourceLabel({ submissionProfile, lesson, assessment }),
          'Office hours or course communication channel',
        ],
        progressTracking: `Use the ${assessmentTitle} milestone checklist, rubric criteria, ${submissionProfile.assignmentType.toLowerCase()} format, and ${submissionProfile.workload.outOfClassEstimate} to monitor readiness before submission for ${assessment.relatedLessons[0]}.`,
        assessmentCadence: assessment.cadence,
        assessmentPurpose: assessment.studentFacingPurpose,
        assessmentRoleRationale: assessment.roleRationale,
        revisionUse: assessment.revisionUse,
        validityCheck: assessment.validityEvidence,
        gradingCalibration: assessment.calibrationPlan,
        criterionEvidenceChecklist: Array.isArray(assessment.criterionEvidenceMap)
          ? assessment.criterionEvidenceMap
          : [],
        anchorExampleGuidance: [
          assessment.anchorExampleSet?.strongSample || '',
          assessment.anchorExampleSet?.partialSample || '',
          assessment.anchorExampleSet?.revisionPrompt || '',
        ].filter(Boolean),
        citationAndSourceUse: lesson.sourceUsePlan || null,
        academicIntegrityStatement:
          `Submitted work must represent the student or team effort. Cite outside sources or approved tools, and disclose course-specific AI use when it contributes to the submission. ` +
          `${lesson.sourceUsePlan?.noInventedSources || 'Do not invent source details; mark missing citation details for instructor review.'}`,
        accessibilityAndUDL:
          lesson.accessibilityPlan?.accommodationReviewCue ||
          `For ${assessmentTitle}, use accessible document structure, descriptive headings, readable contrast, and captions or alt text for media.`,
        selfAssessmentRubric: (Array.isArray(assessment.criterionWeightPlan) &&
        assessment.criterionWeightPlan.length > 0
          ? assessment.criterionWeightPlan
          : assessment.criteria.map((criterion) => ({
              criterion,
              weight: '',
              evidenceSignal: 'Criterion evidence needs review.',
            }))
        ).map((entry) => {
          // 220 chars fits the full evidence sentence; tighter caps cut the
          // sentence right after the quoted criterion name. The bullet already
          // starts with the criterion name, so the quoted restatement inside
          // the evidence sentence collapses to "this criterion".
          const evidenceCheck = conciseClause(
            String(entry.evidenceSignal || entry.evidenceNeeded || '').replace(
              `"${entry.criterion}"`,
              'this criterion',
            ),
            'Show criterion-specific evidence',
            220,
          );
          return `${entry.criterion}${entry.weight ? ` (${entry.weight}%)` : ''}: ${evidenceCheck}.`;
        }),
        feedbackLoop: assessment.feedbackUse,
        revisionCheck: assessment.feedbackCycle?.closureCheck || assessment.feedbackUse,
        tags: unique(['assignment', assessment.title, ...assessment.relatedLessons, ...assessment.criteria], 10),
      };
    }),
  };
}

function compileRubrics(blueprint) {
  const lens = blueprintLens(blueprint);
  const preference = featurePreference(blueprint, 'rubrics');
  return {
    rubrics: blueprint.assessments.map((assessment) => {
      const lesson = blueprint.lessons.find((item) => item.lessonNumber === assessment.lessonNumbers[0]);
      const validityEvidence = assessment.validityEvidence || {};
      const criterionWeightPlan = Array.isArray(assessment.criterionWeightPlan)
        ? assessment.criterionWeightPlan
        : buildCriterionWeightPlan(
            lesson || {
              keyConcepts: [],
              title: assessment.relatedLessons?.[0] || assessment.title,
              studentArtifact: assessment.artifact,
            },
            assessment.criteria || [],
            assessment.criterionEvidenceMap || [],
            assessment.points || 100,
          );
      const criteria = assessment.criteria.map((criterion, index) => {
        const planEntry =
          criterionWeightPlan.find(
            (entry) => cleanText(entry.criterion).toLowerCase() === cleanText(criterion).toLowerCase(),
          ) ||
          criterionWeightPlan[index] ||
          {};
        const weight = Number(planEntry.weight || 0);
        const evidenceEntry = assessment.criterionEvidenceMap?.[index] || {};
        const objectiveAlignment =
          assessment.criterionObjectiveAlignment?.find(
            (entry) => cleanText(entry.criterion).toLowerCase() === cleanText(criterion).toLowerCase(),
          ) ||
          assessment.criterionObjectiveAlignment?.[index] ||
          buildCriterionObjectiveAlignment({
            lesson,
            criteria: [criterion],
            criterionWeightPlan: [planEntry],
            criterionEvidenceMap: [evidenceEntry],
          })[0];
        const performanceBand = buildCriterionPerformanceBand({
          assessment,
          lesson,
          criterion,
          planEntry,
          evidenceEntry,
          lens,
        });
        return {
          criterion,
          objectiveAligned: objectiveAlignment?.objective || assessment.objectives[0] || '',
          objectiveAlignmentEvidence: objectiveAlignment || null,
          weight,
          points: Math.round((weight / 100) * assessment.points),
          priority: planEntry.priority || '',
          weightingRationale: planEntry.rationale || '',
          evidenceSignal: planEntry.evidenceSignal || assessment.criterionEvidenceMap?.[index]?.evidenceNeeded || '',
          calibrationUse:
            planEntry.calibrationUse || assessment.criterionEvidenceMap?.[index]?.calibrationQuestion || '',
          feedbackUse: planEntry.feedbackUse || assessment.criterionEvidenceMap?.[index]?.feedbackMove || '',
          exemplary: performanceBand.exemplary,
          proficient: performanceBand.proficient,
          developing: performanceBand.developing,
          beginning: performanceBand.beginning,
          performanceBandEvidence: performanceBand.performanceBandEvidence,
        };
      });
      return {
        title: `${assessment.title} Rubric`,
        lessonTitle: assessment.relatedLessons.join(', '),
        gradedWork: assessment.artifact,
        assessmentType: 'Assignment',
        totalPoints: assessment.points,
        percentOfGrade: assessment.weight,
        weightPercent: assessment.weightPercent,
        assessmentRole: assessment.roleLabel,
        assessmentStakes: assessment.stakes,
        assessmentArchitecture: {
          role: assessment.role,
          roleLabel: assessment.roleLabel,
          stakes: assessment.stakes,
          gradingMode: assessment.gradingMode,
          weightProvenance: compactWeightProvenance(assessment.weightProvenance),
          roleRationale: assessment.roleRationale,
          studentFacingPurpose: assessment.studentFacingPurpose,
          cadence: assessment.cadence,
          revisionUse: assessment.revisionUse,
          criterionWeightPlan,
        },
        bloomsLevel: assessment.bloomsLevel,
        blueprintGrounding: lessonSourceGrounding(lesson, {
          source: assessment.source,
          assessmentArtifact: assessment.artifact,
          assessmentTitle: assessment.title,
          feedbackUse: assessment.feedbackUse,
          feedbackCycle: assessment.feedbackCycle,
          assessmentValidity: validityEvidence,
          gradingCalibrationPlan: assessment.calibrationPlan,
          criterionEvidenceMap: assessment.criterionEvidenceMap,
          criterionWeightPlan,
          criterionObjectiveAlignment: assessment.criterionObjectiveAlignment,
          anchorExampleSet: assessment.anchorExampleSet,
          assessmentArchitecture: {
            role: assessment.role,
            roleLabel: assessment.roleLabel,
            stakes: assessment.stakes,
            cadence: assessment.cadence,
            weightProvenance: compactWeightProvenance(assessment.weightProvenance),
            revisionUse: assessment.revisionUse,
            criterionWeightPlan,
          },
          learnerContextProfile: blueprint.learnerContextProfile,
          courseModalityProfile: blueprint.courseModalityProfile,
          ...(preference ? { instructorPreference: preference } : {}),
        }),
        gradingScale: {
          exemplary: '90-100%',
          proficient: '80-89%',
          developing: '70-79%',
          beginning: 'Below 70%',
        },
        criteria,
        assessmentValidity: validityEvidence,
        gradingCalibrationPlan: assessment.calibrationPlan,
        criterionEvidenceMap: assessment.criterionEvidenceMap,
        criterionWeightPlan,
        criterionObjectiveAlignment: assessment.criterionObjectiveAlignment,
        objectiveEvidenceChecklist: objectiveEvidenceChecklist(lesson?.objectiveEvidencePlan),
        criterionWeightGuidance: `Weight criterion feedback by instructional importance: ${criterionWeightPlan
          .map((entry) => `${entry.priority} ${entry.weight}%`)
          .join('; ')}.`,
        anchorExampleSet: assessment.anchorExampleSet,
        instructionalRationale: lesson?.instructionalRationale || null,
        sourceUsePlan: lesson?.sourceUsePlan || null,
        prerequisitePlan: lesson?.prerequisitePlan || null,
        accessibilityPlan: lesson?.accessibilityPlan || null,
        feedbackCycle: assessment.feedbackCycle || lesson?.feedbackCycle || null,
        teachingIntent: lesson?.teachingIntent || null,
        modalityCue: lesson?.modalityCue || '',
        modalityDecode: lesson?.modalityDecode || null,
        artifactGenre: lesson?.artifactGenre || null,
        artifactGenreReviewProtocol: lesson?.artifactGenre?.reviewProtocol || '',
        artifactGenreCommonFailure: lesson?.artifactGenre?.commonFailure || '',
        courseModalityProfile: blueprint.courseModalityProfile,
        learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
        taskDirections: `Score the ${assessment.artifact} for ${assessment.relatedLessons.join(', ')} using the criteria below. Treat it as ${lesson?.artifactGenre?.label || lesson?.artifactGenre?.genre || 'the named artifact genre'} and look for this evidence standard: ${lesson?.artifactGenre?.evidenceStandard || lesson?.artifactGenre?.evidenceRequirement || 'criterion-specific evidence tied to the course artifact'}.`,
        instructorFacilitationNote: `Share the ${assessment.title} rubric before students draft, then use criterion-level feedback for ${assessment.artifact} revision guidance. Prerequisite check: ${lesson?.prerequisitePlan?.diagnosticCheck || `confirm students can connect prior knowledge to ${assessment.artifact}.`} Calibration check: ${assessment.calibrationPlan?.scorerNorming || validityEvidence.calibrationCheck || `review whether ${assessment.artifact} evidence matches the intended learning target before scoring`} Bias check: ${assessment.calibrationPlan?.biasCheck || `confirm scores reflect rubric evidence for ${assessment.artifact}.`} Source check: ${lesson?.sourceUsePlan?.noInventedSources || `confirm ${assessment.artifact} cites only approved course sources.`}${preference ? ` Preference profile: ${preference}.` : ''}`,
        calibrationProtocol: assessment.calibrationPlan,
        accessibilityAndUDL:
          `${lesson?.accessibilityPlan?.expression || `For ${assessment.title}, allow equivalent accessible formats when students demonstrate the same ${lens.evidenceNoun}, reasoning, and communication criteria.`} ${lesson?.accessibilityPlan?.accommodationReviewCue || ''}`.trim(),
        anchorExamples: {
          strongSample:
            assessment.anchorExampleSet?.strongSample ||
            assessment.criterionEvidenceMap?.[0]?.strongSignal ||
            `Names relevant ${lens.evidenceNoun}, explains the ${lens.decisionNoun}, and reflects on revision use for ${assessment.title}.`,
          partialSample:
            assessment.anchorExampleSet?.partialSample ||
            assessment.criterionEvidenceMap?.[0]?.partialSignal ||
            `Mentions ${assessment.relatedLessons[0]} ideas but needs clearer evidence or stronger decision logic.`,
          scoringRationale:
            assessment.anchorExampleSet?.scoringRationale ||
            `Score the stronger sample higher when its evidence is inspectable and tied to the rubric criteria.`,
          revisionPrompt:
            assessment.anchorExampleSet?.revisionPrompt ||
            `Revise the partial sample by adding specific evidence, limitation language, and one feedback-based change.`,
          exemplary:
            assessment.criterionEvidenceMap?.[0]?.strongSignal ||
            `Names relevant ${lens.evidenceNoun}, explains the ${lens.decisionNoun}, and reflects on revision use for ${assessment.title}.`,
          proficient:
            assessment.criterionEvidenceMap?.[1]?.strongSignal ||
            `Uses relevant evidence and answers the ${assessment.artifact} prompt with clear organization.`,
          developing:
            assessment.criterionEvidenceMap?.[2]?.partialSignal ||
            `Mentions ${assessment.relatedLessons[0]} ideas but needs clearer evidence or stronger decision logic.`,
          beginning:
            assessment.criterionEvidenceMap?.[3]?.partialSignal ||
            `Provides general description with little ${assessment.title} evidence or criterion alignment.`,
        },
        scorerCalibrationUse: assessment.anchorExampleSet?.scorerCalibrationUse || '',
        gradePolicyConnection: `${assessment.title} carries ${assessment.weight} of the course grade as a ${assessment.roleLabel || assessment.role}, with feedback due in this window: ${assessment.cadence?.feedbackWindow || 'local LMS feedback window'}.`,
        assessmentCadence: assessment.cadence,
        revisionUse: assessment.revisionUse,
        teacherNotes: preference
          ? `${assessment.feedbackUse} Apply the learned preference profile: ${preference}.`
          : assessment.feedbackUse,
        tags: unique(['rubric', assessment.title, ...assessment.relatedLessons, ...assessment.criteria], 10),
      };
    }),
  };
}

function isDataScienceLabLesson(blueprint, lesson = {}) {
  return (
    blueprint?.courseModalityProfile?.primaryMode === 'data-science-lab' ||
    lesson?.modalityDecode?.mode === 'data-science-lab' ||
    lesson?.artifactGenre?.genre === 'data-science-notebook'
  );
}

function dataScienceTermGuide(term, lesson = {}) {
  const cleanTerm = cleanText(term);
  const normalized = cleanTerm.toLowerCase();
  const lessonTitle = stripLessonPrefix(lesson.title || 'this lab');
  const datasetName = lesson.throughlineCase?.datasetName || 'the course dataset';
  const modelEvidence = 'validation metrics, model outputs, data-quality checks, and limitation notes';
  const guides = [
    {
      pattern: /\b(confusion matrix|false positive|false negative|classification|threshold)\b/,
      definition:
        'A classification decision is evaluated by comparing predicted labels with actual labels; threshold changes trade off false positives, false negatives, precision, and recall.',
      example: `In ${lessonTitle}, students inspect the confusion matrix for ${datasetName} and explain which threshold best fits the decision risk.`,
    },
    {
      pattern: /\b(precision|recall|sensitivity|specificity|f1|classification metric)\b/,
      definition:
        'Precision asks how many predicted positives were correct; recall asks how many actual positives were found. The better metric depends on the cost of false positives and false negatives.',
      example: `In ${lessonTitle}, students choose the metric that matches the stakeholder risk before recommending a model output.`,
    },
    {
      pattern: /\b(train|test|validation|cross[-\s]?validation|holdout|generaliz)\b/,
      definition:
        'Validation checks whether a model performs on data it did not learn from, so students can separate memorized fit from useful generalization.',
      example: `In ${lessonTitle}, students compare train/test or cross-validation results before accepting a model claim.`,
    },
    {
      pattern: /\b(data quality|missing|missingness|clean|wrangl|leakage|provenance|feature)\b/,
      definition:
        'Data-quality evidence includes missingness, measurement limits, leakage risk, feature definitions, and whether the dataset can support the intended model use.',
      example: `In ${lessonTitle}, students name one ${datasetName} quality issue that could change the model conclusion.`,
    },
    {
      pattern: /\b(fairness|bias|subgroup|equity|model card|limitation)\b/,
      definition:
        'Fairness evidence compares model behavior across relevant groups and records limits, intended use, and review needs in a model-card style explanation.',
      example: `In ${lessonTitle}, students add a fairness or limitation note before handing the model recommendation to a reviewer.`,
    },
    {
      pattern: /\b(regression|residual|prediction error|rmse|mae|r[-\s]?squared)\b/,
      definition:
        'Regression evidence compares predicted numeric values with actual outcomes using residuals and error metrics, then checks whether the errors are acceptable for the decision.',
      example: `In ${lessonTitle}, students use residual or error evidence to decide whether the model is useful enough for the case.`,
    },
    {
      pattern: /\b(eda|exploratory|visualization|dashboard|data story)\b/,
      definition:
        'Exploratory analysis uses visual patterns and summary statistics to form bounded claims; it should not be treated as final proof without validation.',
      example: `In ${lessonTitle}, students use a chart or dashboard from ${datasetName} to state what the data can and cannot support.`,
    },
  ];
  const guide = guides.find((item) => item.pattern.test(normalized));
  if (guide) return { term: cleanTerm, definition: guide.definition, example: guide.example };
  return {
    term: cleanTerm,
    definition: `${cleanTerm} is the lab concept students test against ${datasetName} by checking ${modelEvidence}.`,
    example: `In ${lessonTitle}, students use ${cleanTerm} to make a bounded modeling or analytic decision from notebook evidence.`,
  };
}

function studyGuideTermsForLesson(lesson = {}) {
  const terms = normalizeConceptCandidates(lesson.keyConcepts || [], { title: lesson.title, limit: 8 });
  const titleWords = new Set(
    stripLessonPrefix(lesson.title || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
  const withoutTitleFragments = terms.filter(
    (term) => !(wordCount(term) === 1 && titleWords.has(cleanText(term).toLowerCase())),
  );
  if (withoutTitleFragments.length >= 4) return withoutTitleFragments;
  if (terms.length >= 3) return terms;
  return unique(
    [...terms, ...wordsFromConcepts([lesson.outcomes?.join(' '), lesson.successCriteria?.join(' ')], 8)],
    8,
  );
}

function generalTermGuide(term, lesson = {}, lens = {}, termIndex = 0) {
  const cleanTerm = cleanText(term, 'lesson concept');
  const lessonTitle = stripLessonPrefix(lesson.title || 'this lesson');
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const evidenceNoun = lens.evidenceNoun || 'course evidence';
  const decisionNoun = lens.decisionNoun || 'course decision';
  const sourceCue = lesson.evidencePlan?.sourceCue || 'the assigned materials';
  const patterns = [
    {
      definition: `${cleanTerm} names the evidence focus students use when deciding what counts as support for ${artifact}.`,
      example: `In ${lessonTitle}, students connect ${cleanTerm} to one detail from ${sourceCue} before explaining the ${decisionNoun}.`,
    },
    {
      definition: `${cleanTerm} helps students separate description from evidence-backed reasoning in ${lessonTitle}.`,
      example: `A strong ${artifact} response uses ${cleanTerm} to compare evidence, state a limitation, and choose the next step.`,
    },
    {
      definition: `Use ${cleanTerm} as a self-check: the claim should name context, cite ${evidenceNoun}, and avoid overstatement.`,
      example: `During ${lessonTitle}, students test whether ${cleanTerm} changes the evidence they select for ${artifact}.`,
    },
    {
      definition: `${cleanTerm} is the part of the lesson students must apply to the weekly artifact, not just define from memory.`,
      example: `For ${artifact}, students show ${cleanTerm} by explaining why one evidence choice supports the ${decisionNoun}.`,
    },
  ];
  return { term: cleanTerm, ...patterns[termIndex % patterns.length] };
}

/**
 * v0.9.1 subject-matter enrichment: model-written key terms (real
 * disciplinary definitions with examples and misconceptions) replace the
 * deterministic role-based term guides when present; fallback otherwise.
 */
function enrichedKeyTermsForLesson(lesson, { fallback }) {
  const enriched = lesson?.enrichment?.keyTerms;
  if (!Array.isArray(enriched) || enriched.length === 0) return fallback();
  // CurriculumOS V1: a genome-linked term carries a source citation; surface it
  // so the study guide can render "Source: …". Compiler-only terms have none.
  const linked = lesson?.enrichment?.conceptProvenance?.source === 'genome-linked';
  return enriched.map((term) => ({
    term: term.term,
    definition: term.definition,
    example: term.example || '',
    ...(term.source ? { source: term.source } : {}),
    enrichmentSource: linked ? 'genome-linked' : 'lesson-content-enrichment',
  }));
}

function compileStudyGuides(blueprint) {
  const lens = blueprintLens(blueprint);
  return {
    studyGuides: blueprint.lessons.map((lesson, index) => {
      const phrase = lessonPhrase(blueprint, lesson);
      const isDataScience = isDataScienceLabLesson(blueprint, lesson);
      const datasetName = lesson.throughlineCase?.datasetName || 'the course dataset';
      const casePacket = lesson.throughlineCase?.evidencePacket || `${stripLessonPrefix(lesson.title)} lab packet`;
      const primaryConcept = primaryConceptForLesson(lesson);
      const keyTerms = studyGuideTermsForLesson(lesson);
      const dataScienceEvidenceCue =
        'validation metrics, model-performance evidence, data-quality checks, threshold tradeoffs, and fairness or limitation evidence';
      const enrichedMisconceptions = (lesson.enrichment?.keyTerms || [])
        .filter((term) => term.misconception)
        .slice(0, 3)
        .map((term) => ({
          misconception: term.misconception,
          // v0.13.3: the correction is the corrective statement when the
          // kernel/genome supplies one — never the definition restated. The
          // fallback phrases the definition as a counter, which at least
          // reads as a correction instead of a glossary entry.
          correction: term.correction || `In fact: ${stripTerminalPunctuation(term.definition)}.`,
        }));
      const misconceptionMap =
        enrichedMisconceptions.length > 0
          ? enrichedMisconceptions
          : Array.isArray(lesson.misconceptionMap)
            ? lesson.misconceptionMap
            : [];
      const assessment =
        blueprint.assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) ||
        blueprint.assessments[index] ||
        {};
      return {
        lessonTitle: lesson.title,
        examScope: `Use this guide to prepare for Week ${lesson.lessonNumber} checks on ${phrase.context} and later assessments.`,
        summary: isDataScience
          ? `${lesson.title} focuses on ${lesson.keyConcepts.slice(0, 3).join(', ')}. Students should inspect ${datasetName}, read notebook outputs, use ${dataScienceEvidenceCue}, and explain how the evidence changes the modeling decision.`
          : `${lesson.title} focuses on ${lesson.keyConcepts.slice(0, 3).join(', ')}. Students should connect those ideas to the weekly activity pattern, ${phrase.evidenceMove}, and ${phrase.decisionMove}.`,
        sourceGrounding: lessonSourceGrounding(lesson, {
          anchorExampleSet: assessment.anchorExampleSet,
          learnerContextProfile: blueprint.learnerContextProfile,
          courseModalityProfile: blueprint.courseModalityProfile,
        }),
        learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
        modalityCue: lesson.modalityCue,
        modalityDecode: lesson.modalityDecode,
        artifactGenre: lesson.artifactGenre,
        prerequisitePlan: lesson.prerequisitePlan,
        anchorExampleSet: assessment.anchorExampleSet || null,
        learningTransferPlan: lesson.learningTransferPlan,
        teachingIntent: lesson.teachingIntent,
        keyTerms: enrichedKeyTermsForLesson(lesson, {
          fallback: () =>
            isDataScience
              ? keyTerms.map((term) => dataScienceTermGuide(term, lesson))
              : keyTerms.map((term, termIndex) => generalTermGuide(term, lesson, lens, termIndex)),
        }),
        // CurriculumOS Layer 2: the expert's reasoning routine for this deep
        // structure — metacognitive scaffolding that teaches HOW to think
        // about the kind of problem, not just the facts. Genome-linked only.
        ...(Array.isArray(lesson.enrichment?.reasoningScaffolds) && lesson.enrichment.reasoningScaffolds.length > 0
          ? {
              reasoningRoutine: lesson.enrichment.reasoningScaffolds.map((scaffold) => ({
                structure: scaffold.archetypeName,
                howToReason: `To reason about ${scaffold.term} as ${String(scaffold.archetypeName).toLowerCase()}: ${scaffold.moves.join('; ')}.`,
              })),
            }
          : {}),
        conceptConnections: [
          // Layer 2: analogical bridges lead — structural transfer is the
          // highest-value connection a study guide can name.
          ...(Array.isArray(lesson.enrichment?.structuralConnections) ? lesson.enrichment.structuralConnections : []),
          `${lesson.title} connects to the assessment artifact: ${lesson.studentArtifact}.`,
          lesson.prerequisitePlan?.prerequisiteEvidence ||
            `Prerequisite readiness should be checked before students prepare ${lesson.studentArtifact}.`,
          assessment.anchorExampleSet?.studentFacingUse ||
            `Compare strong and partial anchor examples before preparing ${lesson.studentArtifact}.`,
          `The lesson prepares students to meet this success criterion: ${lesson.successCriteria[0]}`,
        ],
        ...(lesson.enrichment?.workedExample ? { workedExample: lesson.enrichment.workedExample } : {}),
        commonMisconceptions:
          misconceptionMap.length > 0
            ? misconceptionMap
            : isDataScience
              ? [
                  {
                    misconception: `A high model score means the ${stripLessonPrefix(lesson.title)} result is ready to use.`,
                    correction: `Strong work checks the validation setup, precision/recall or error tradeoffs, data-quality risks, and fairness limits before recommending a model decision.`,
                  },
                  {
                    misconception: `Notebook output alone proves the claim for ${stripLessonPrefix(lesson.title)}.`,
                    correction: `Notebook output must be tied to ${casePacket}, the dataset fields used, the metric chosen, and one limitation or review need.`,
                  },
                ]
              : [
                  {
                    misconception: `For ${stripLessonPrefix(lesson.title)}, summarizing the topic is enough for strong work.`,
                    correction: `Strong ${lesson.title} work applies ${phrase.context} to evidence and explains the decision or implication.`,
                  },
                  {
                    misconception: `One ${lens.exampleNoun} proves the whole ${stripLessonPrefix(lesson.title)} claim.`,
                    correction: `Use enough ${lens.evidenceNoun} in ${lesson.title} to show the pattern and name the limits of the example.`,
                  },
                ],
        reviewQuestions: [
          ...(isDataScience
            ? [
                {
                  question: `Which validation metric or notebook output would change the modeling decision in ${stripLessonPrefix(lesson.title)}?`,
                  bloomsLevel: 'Analyze',
                  hint: `Name the metric, the model output, and what decision risk it reveals.`,
                },
                {
                  question: `How do false positives, false negatives, threshold choice, or prediction error affect the ${primaryConcept} recommendation?`,
                  bloomsLevel: 'Evaluate',
                  hint: `Connect the metric tradeoff to the stakeholder or classroom case, not just to a score.`,
                },
                {
                  question: `What data-quality, fairness, or limitation note should be included before ${lesson.studentArtifact} is submitted?`,
                  bloomsLevel: 'Apply',
                  hint: `Use ${datasetName}, ${casePacket}, and one model-card style limitation.`,
                },
              ]
            : [
                {
                  question: `How would you explain the central idea of ${stripLessonPrefix(lesson.title)} using ${lens.evidenceNoun}?`,
                  bloomsLevel: 'Analyze',
                  hint: `Name ${phrase.context}, cite evidence, and explain why it matters.`,
                },
                // v0.13.3: when the lesson carries kernel facts, the second
                // review question asks about the SUBJECT, not the assessment
                // process (the v0.13.1 audit's "what would strong work need
                // to show" meta-question).
                ...(lesson.enrichment?.kernel?.facts?.[0]
                  ? [
                      {
                        question: `Explain why this is true and what evidence supports it: “${stripTerminalPunctuation(lesson.enrichment.kernel.facts[0])}.”`,
                        bloomsLevel: 'Analyze',
                        hint: `Use ${lesson.keyConcepts.slice(0, 2).join(' and ') || 'the lesson concepts'} in your explanation, and name one observation that backs the claim.`,
                      },
                    ]
                  : [
                      {
                        question: `What would strong work on ${lesson.studentArtifact} need to show?`,
                        bloomsLevel: 'Evaluate',
                        hint: `${lesson.successCriteria.join(' ')} Artifact genre check: ${lesson.artifactGenre?.qualityFocus || 'evidence specificity and revision quality'}.`,
                      },
                    ]),
                {
                  // Student-facing study guides ask the student directly; the
                  // instructor-voice metacognitive prompt stays in lesson plans.
                  question:
                    lesson.learningTransferPlan?.studentMetacognitivePrompt ||
                    `How does feedback from ${lesson.title} improve a later artifact?`,
                  bloomsLevel: 'Apply',
                  hint: lesson.learningTransferPlan?.transferTask || lesson.feedbackMoment,
                },
              ]),
        ],
        practiceActivities: [
          ...(isDataScience
            ? [
                `Open the lesson notebook or dataset card and identify the target/outcome, two important features, and one data-quality risk for ${stripLessonPrefix(lesson.title)}.`,
                `Write a ${primaryConcept} metric note that explains what the validation result proves, what it does not prove, and which threshold or model setting you would review next.`,
                `Self-check ${lesson.studentArtifact} for a model-card style limitation, a fairness or subgroup question, and one concrete revision based on notebook evidence.`,
              ]
            : [
                `Create a three-column note with concept, ${lens.evidenceNoun}, and decision for ${stripLessonPrefix(lesson.title)}.`,
                `Self-check a ${lesson.studentArtifact} draft against this criterion: ${lesson.successCriteria[0]}`,
                lesson.learningTransferPlan?.spacedPracticeCue ||
                  `Revisit ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)} before the next assessment.`,
              ]),
        ],
        examPrep: {
          keyTopicsToKnow: lesson.keyConcepts.slice(0, 5),
          timeline: `Review ${lesson.title} notes after Week ${lesson.lessonNumber}, then revisit before the next assessment.`,
          commonErrors: isDataScience
            ? `Avoid treating accuracy as enough, ignoring false-positive/false-negative costs, skipping data-quality checks, or submitting ${lesson.studentArtifact} without a limitation note.`
            : `Avoid unsupported claims, vague ${phrase.context} definitions, and responses that omit ${lesson.studentArtifact}.`,
          reviewStrategy: isDataScience
            ? `Practice explaining how ${primaryConcept} uses one dataset issue, one validation metric, one threshold or model-performance tradeoff, and one fairness or limitation note.`
            : `Practice explaining one ${lesson.keyConcepts[0] || 'concept'}, one ${lens.evidenceNoun} source, and one implication out loud.`,
        },
        studentResources: `Use ${lesson.title} readings, instructor notes, office hours, peer discussion, and the rubric criteria for this lesson.`,
        tags: unique(['study guide', lesson.title, ...lesson.keyConcepts], 10),
      };
    }),
  };
}

function quizQuestionId(lesson, index) {
  return `lesson-${lesson.lessonNumber}-q${index + 1}`;
}

function quizTags(lesson, type, bloom, use) {
  return unique(
    [
      'quiz',
      ...normalizeConceptCandidates(lesson.keyConcepts || [], { title: lesson.title, limit: 4 }),
      // v0.12.1: tags print in student-facing documents — never the raw
      // enum id ("multiple_choice").
      String(type || '').replace(/[_-]+/g, ' '),
      bloom,
      use,
    ],
    8,
  );
}

function nextHigherBloom(level) {
  const order = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
  const index = order.indexOf(level);
  return order[Math.min(order.length - 1, Math.max(0, index) + 1)] || 'Analyze';
}

function quizObjectiveAlignmentForRole(lesson, assessment = {}, role = '') {
  const alignments = Array.isArray(assessment.criterionObjectiveAlignment)
    ? assessment.criterionObjectiveAlignment
    : [];
  const objective = (strategyPattern, fallbackIndex = 0) =>
    alignments.find((entry) => strategyPattern.test(entry?.strategy || '')) || alignments[fallbackIndex] || null;

  if (/retrieval|source-application/i.test(role)) {
    return objective(/source-evidence/i, 0);
  }
  if (/analysis|written-analysis|quality-evaluation/i.test(role)) {
    return objective(/analysis-decision/i, 1);
  }
  if (/transfer|synthesis/i.test(role)) {
    return objective(/feedback-revision|analysis-decision/i, alignments.length - 1);
  }
  return alignments[0] || null;
}

function buildQuizQuestionPlan({ lesson, assessment = {}, targetCount = 6 }) {
  const lessonBloom = lesson.bloomsLevel || lesson.difficultyProfile?.bloomsLevel || 'Apply';
  const lessonObjectives =
    Array.isArray(lesson.outcomes) && lesson.outcomes.length > 0
      ? lesson.outcomes
          .map((objective) => normalizeObjectiveText(objective))
          .filter((objective) => objective && !isWeakConcept(objective))
      : [objectiveForLesson(lesson.title, lesson.keyConcepts)];
  const objectiveFallback = lessonObjectives[0] || objectiveForLesson(lesson.title, lesson.keyConcepts);
  const sourceSignal = lesson.bloomInference?.matchedSignal || lesson.outcomes?.join('; ') || lesson.title;
  const highDemandBloom = ['Evaluate', 'Create'].includes(lessonBloom) ? lessonBloom : nextHigherBloom(lessonBloom);
  const analysisBloom = 'Analyze';
  const evaluationBloom = 'Evaluate';
  const transferBloom = 'Create';
  const planRows = [
    {
      role: 'diagnostic-retrieval',
      bloom: lesson.prerequisitePlan?.diagnosticCheck ? 'Remember' : 'Understand',
      difficulty: 'Easy',
      bloomSource: 'prerequisite diagnostic',
      sourceSignal: lesson.prerequisitePlan?.diagnosticCheck || sourceSignal,
      use: 'diagnostic retrieval practice',
    },
    {
      role: 'source-application',
      bloom: 'Apply',
      difficulty: 'Medium',
      bloomSource: 'evidence plan',
      sourceSignal: lesson.evidencePlan?.evidenceRequirement || sourceSignal,
      use: 'formative quiz',
    },
    {
      role: 'artifact-analysis',
      bloom: analysisBloom,
      difficulty: 'Medium',
      bloomSource: 'artifact genre and cognitive demand',
      sourceSignal: lesson.artifactGenre?.evidenceRequirement || lesson.bloomInference?.matchedSignal || sourceSignal,
      use: 'exam review',
    },
    {
      role: 'written-analysis',
      bloom: analysisBloom,
      difficulty: 'Medium',
      bloomSource: 'source-text cognitive demand',
      sourceSignal,
      use: 'formative check',
    },
    {
      role: 'quality-evaluation',
      bloom: evaluationBloom,
      difficulty: 'Hard',
      bloomSource: 'success criteria and calibration plan',
      sourceSignal: assessment.calibrationPlan?.biasCheck || lesson.successCriteria?.join('; ') || sourceSignal,
      use: 'summative assessment',
    },
    {
      role: 'transfer-synthesis',
      bloom: transferBloom,
      difficulty: 'Hard',
      bloomSource: 'transfer plan and lesson cognitive demand',
      sourceSignal: lesson.learningTransferPlan?.transferTask || sourceSignal,
      use: 'exam synthesis',
    },
  ];

  const usedObjectiveKeys = new Set();
  return planRows.slice(0, targetCount).map((row, index) => {
    const objectiveAlignment = quizObjectiveAlignmentForRole(lesson, assessment, row.role);
    const alignedObjective = objectiveAlignment?.objective || '';
    const alignedKey = normalizeObjectiveKey(alignedObjective);
    const nextUncoveredObjective = lessonObjectives.find(
      (objective) => !usedObjectiveKeys.has(normalizeObjectiveKey(objective)),
    );
    const usesCoverageObjective = Boolean(
      nextUncoveredObjective && (!alignedObjective || usedObjectiveKeys.has(alignedKey)),
    );
    const objective = usesCoverageObjective ? nextUncoveredObjective : alignedObjective || objectiveFallback;
    usedObjectiveKeys.add(normalizeObjectiveKey(objective));
    return {
      ...row,
      questionIndex: index,
      objective,
      objectiveAlignmentStrategy: usesCoverageObjective
        ? 'lesson-objective-coverage'
        : objectiveAlignment?.strategy || 'lesson-primary-objective',
      objectiveAlignmentRationale: usesCoverageObjective
        ? 'Question plan rotates through lesson objectives so every objective receives at least one quiz/check item before repeating.'
        : objectiveAlignment?.rationale ||
          'Question uses the primary lesson objective because no stronger criterion match was available.',
      source: 'source-grounded-quiz-plan',
    };
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

const QUIZ_ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

function correctLetterForQuestion(lesson, index) {
  const lessonNumber = Number(lesson?.lessonNumber || 1);
  return QUIZ_ANSWER_LETTERS[(lessonNumber + index) % QUIZ_ANSWER_LETTERS.length];
}

function labelQuizOption(letter, text) {
  return `${letter}. ${cleanText(text)}`;
}

function quizCorrectExplanation({ answer, concept, artifact, objective, lesson, index }) {
  const lessonNumber = Number(lesson?.lessonNumber || 1);
  const fullObjective = stripTerminalPunctuation(cleanText(objective, 'the lesson objective'));
  const clipped = conciseClause(objective, 'the lesson objective', 90);
  const compactObjective = clipped.length < fullObjective.length ? `${clipped}…` : clipped;
  // Six variants, each anchored to the artifact or quoted objective: with six
  // questions per lesson no two same-lesson questions share a variant, and
  // cross-lesson collisions differ through the artifact reference.
  const variants = [
    `${answer} is correct because it connects ${concept} to ${artifact}, uses lesson evidence, and supports the objective "${objective}".`,
    `${answer} is the strongest move: it grounds ${concept} in inspectable course evidence and advances the objective behind ${artifact}.`,
    `${answer} works because it ties ${concept} evidence to a visible decision in ${artifact} instead of stopping at recall.`,
    `${answer} best fits the objective (${compactObjective}): it selects relevant evidence and explains why the evidence changes ${artifact}.`,
    `${answer} holds up because it treats ${concept} as a working tool for ${artifact}, not a definition to restate.`,
    `${answer} earns the point by pairing ${concept} evidence with the specific decision required by ${artifact}.`,
  ];
  return variants[(lessonNumber + index) % variants.length];
}

function buildMultipleChoiceOptions({ lesson, index, concept, artifact, use, correct }) {
  const correctLetter = correctLetterForQuestion(lesson, index);
  const sourceCue = lesson?.evidencePlan?.sourceCue || 'the assigned course materials';
  const lessonFocus = stripLessonPrefix(lesson?.title || 'this lesson');
  // A rotating pool of plausible-but-flawed moves, phrased in parallel with
  // typical correct options so the right answer is not the stylistic odd one
  // out and adjacent lessons do not reuse the same three distractors.
  const distractorPool = [
    `Define ${concept} accurately but stop before connecting it to evidence from ${sourceCue}.`,
    `Choose a familiar ${lessonFocus} example first, even when it does not support ${artifact}.`,
    `Recommend the next step for ${artifact} before comparing evidence or naming a limitation.`,
    `Summarize ${lessonFocus} thoroughly without taking a position the evidence can support.`,
    `Cite ${sourceCue} from memory instead of checking what it actually says about ${concept}.`,
    `Treat one strong example as proof that the ${concept} claim holds in every case.`,
    `Match the response to personal experience rather than to the ${lessonFocus} success criteria.`,
    `Repeat the strongest ${lessonFocus} claim from class discussion without naming its evidence or limits.`,
  ];
  const lessonNumber = Number(lesson?.lessonNumber || 1);
  const start = (lessonNumber * 3 + index * 2) % distractorPool.length;
  const rotated = distractorPool.slice(start).concat(distractorPool.slice(0, start));
  const distractors = unique(rotated, 3);
  let distractorIndex = 0;
  return {
    answer: correctLetter,
    options: QUIZ_ANSWER_LETTERS.map((letter) =>
      labelQuizOption(letter, letter === correctLetter ? correct : distractors[distractorIndex++]),
    ),
  };
}

function buildMultipleChoiceQuestion({
  lesson,
  index,
  bloom,
  difficulty,
  objective,
  concept,
  use,
  prompt,
  correct,
  plan,
}) {
  const id = quizQuestionId(lesson, index);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const { answer, options } = buildMultipleChoiceOptions({ lesson, index, concept, artifact, use, correct });
  return withQuizPlan(
    {
      id,
      type: 'multiple_choice',
      bloomsLevel: bloom,
      difficulty,
      estimatedMinutes: difficulty === 'Hard' ? 3 : 2,
      points: 2,
      objectiveAligned: objective,
      intendedUse: `${use} for ${lesson.title}; review distractor choices before the next ${artifact}.`,
      question: prompt,
      options,
      answer,
      distractorRationale: `${sentenceCase(use)} distractors test evidence use, example fit, recommendation timing, and reasoning quality for ${stripLessonPrefix(lesson.title)}.`,
      explanation: quizCorrectExplanation({ answer, concept, artifact, objective, lesson, index }),
      tags: quizTags(lesson, 'multiple_choice', bloom, use),
    },
    plan,
  );
}

function buildShortAnswerQuestion({ lesson, index, bloom, objective, concept, lens, plan }) {
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const sourceCue = lesson.throughlineCase?.evidencePacket || `${lesson.title} evidence`;
  return withQuizPlan(
    {
      id: quizQuestionId(lesson, index),
      type: 'short_answer',
      bloomsLevel: bloom,
      difficulty: 'Medium',
      estimatedMinutes: 5,
      points: 4,
      objectiveAligned: objective,
      intendedUse: `Formative written check after ${lesson.title}; use responses to identify review needs before ${artifact}.`,
      question: `In 2-3 sentences, explain how ${concept} should shape ${artifact} and name one ${lens.evidenceNoun} source from ${sourceCue} students should use.`,
      answer: `${concept} should guide the evidence students select and the decision they justify in ${artifact}. A strong ${lesson.title} answer names a specific detail from ${sourceCue}, explains why it fits, and states how the evidence changes the next step.`,
      sampleAnswer: `For this lesson, I would use ${concept} to choose evidence from ${sourceCue} that directly supports ${artifact}. I would cite the exact source detail that shows what that evidence changes about ${artifact} and the ${lens.decisionNoun}.`,
      explanation: `A complete response links ${concept}, ${artifact}, and a concrete ${lens.evidenceNoun} source instead of only defining the term.`,
      scoringGuidance: `Full credit requires accurate use of ${concept}, one concrete evidence source, and a decision implication. Partial credit is appropriate when the answer names ${concept} but omits the evidence or the implication. Flag answers that summarize ${stripLessonPrefix(lesson.title)} without applying it.`,
      tags: quizTags(lesson, 'short_answer', bloom, 'formative check'),
    },
    plan,
  );
}

function buildEssayQuestion({ lesson, index, bloom, objective, concept, lens, plan }) {
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const scenario =
    lesson.throughlineCase?.lessonCaseName ||
    [lens.exampleNoun, concept].filter(Boolean).map(stripTerminalPunctuation).join(' focused on ');
  const clientCue = lesson.throughlineCase?.clientName || 'the course audience';
  return withQuizPlan(
    {
      id: quizQuestionId(lesson, index),
      type: 'essay',
      bloomsLevel: bloom,
      difficulty: 'Hard',
      estimatedMinutes: 12,
      points: 8,
      objectiveAligned: objective,
      intendedUse: `Summative or exam-prep synthesis for ${lesson.title}; score with the rubric hints before students revise related work.`,
      question: `${bloom === 'Create' ? 'Create' : 'Evaluate'} a defensible next step for ${artifact} in the ${scenario} for ${clientCue}. In 2-3 organized paragraphs, use ${concept}, cite lesson evidence, and explain one limitation.`,
      rubricHints: `Strong responses define ${concept}, use at least two pieces of ${lens.evidenceNoun}, justify a ${lens.decisionNoun}, and acknowledge a limitation or risk.`,
      sampleAnswer: `A strong response for ${lesson.title} would identify how ${concept} changes the artifact, cite evidence from ${lesson.throughlineCase?.evidencePacket || 'the lesson activity or readings'}, and propose a next step that is feasible for ${artifact}. It would also name a ${lesson.title} limitation so the recommendation is not overstated.`,
      explanation: `The essay is scored for synthesis: students must turn ${concept} and evidence into a defensible ${lens.decisionNoun}, not merely list lesson facts.`,
      scoringGuidance: `Full credit for ${lesson.title} requires concept accuracy, evidence use, a justified next step, and a limitation. Partial credit is appropriate when the response has ${concept} evidence but weak decision logic. Flag responses that ignore ${artifact}.`,
      tags: quizTags(lesson, 'essay', bloom, 'exam synthesis'),
    },
    plan,
  );
}

export function buildQuizAtomsForLesson(lesson, blueprint, options = {}) {
  const lens = blueprintLens(blueprint);
  const concept = primaryConceptForLesson(lesson);
  const secondary =
    normalizeConceptCandidates((lesson.keyConcepts || []).slice(1), { title: lesson.title, limit: 1 })[0] || concept;
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const targetCount = Math.max(5, Math.min(7, Number(options.questionsPerLesson) || 6));
  const assessment =
    options.assessment ||
    blueprint.assessments?.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) ||
    {};
  const quizPlan = buildQuizQuestionPlan({ lesson, assessment, targetCount: 6 });
  const atoms = [
    buildMultipleChoiceQuestion({
      lesson,
      index: 0,
      bloom: quizPlan[0].bloom,
      difficulty: quizPlan[0].difficulty,
      objective: quizPlan[0].objective,
      concept,
      use: quizPlan[0].use,
      prompt: `Which statement best explains why ${concept} matters for ${artifact}?`,
      correct: `${sentenceCase(concept)} helps students choose relevant evidence and justify the decision in ${artifact}.`,
      plan: quizPlan[0],
    }),
    buildMultipleChoiceQuestion({
      lesson,
      index: 1,
      bloom: quizPlan[1].bloom,
      difficulty: quizPlan[1].difficulty,
      objective: quizPlan[1].objective,
      concept,
      use: quizPlan[1].use,
      prompt: `A student is preparing ${artifact}. Which action best applies ${concept} from this lesson?`,
      correct: `Use ${concept} to select a concrete example, connect it to the objective, and revise the artifact before submission.`,
      plan: quizPlan[1],
    }),
    buildMultipleChoiceQuestion({
      lesson,
      index: 2,
      bloom: quizPlan[2].bloom,
      difficulty: quizPlan[2].difficulty,
      objective: quizPlan[2].objective,
      concept: secondary,
      use: quizPlan[2].use,
      prompt: `Which instructor question would best reveal whether students can analyze ${secondary} in ${lesson.title}?`,
      correct: `Ask students to compare two pieces of evidence and explain which one better supports ${artifact}.`,
      plan: quizPlan[2],
    }),
    buildShortAnswerQuestion({
      lesson,
      index: 3,
      bloom: quizPlan[3].bloom,
      objective: quizPlan[3].objective,
      concept,
      lens,
      plan: quizPlan[3],
    }),
    buildMultipleChoiceQuestion({
      lesson,
      index: 4,
      bloom: quizPlan[4].bloom,
      difficulty: quizPlan[4].difficulty,
      objective: quizPlan[4].objective,
      concept,
      use: quizPlan[4].use,
      prompt: `Which feedback move best helps students evaluate the quality of ${artifact}?`,
      correct: `Compare ${artifact} against the ${concept} success criteria, identify the weakest evidence link, and choose one revision priority.`,
      plan: quizPlan[4],
    }),
    buildEssayQuestion({
      lesson,
      index: 5,
      bloom: quizPlan[5].bloom,
      objective: quizPlan[5].objective,
      concept,
      lens,
      plan: quizPlan[5],
    }),
  ];
  const framed = atoms.slice(0, targetCount).map((atom, index) => ({ ...atom, id: quizQuestionId(lesson, index) }));
  return overlayEnrichedQuizItems(framed, lesson);
}

/**
 * v0.9.1 subject-matter enrichment: when the lesson carries model-written
 * quiz content, overlay stems/options/answers onto the compiler's frames.
 * The frame keeps everything structural — ids, points, minutes, tags, plan
 * metadata, intended use, and the deterministic answer-letter rotation — so
 * trust records and gates treat enriched items like any compiled item.
 */
function overlayEnrichedQuizItems(framedAtoms, lesson) {
  const enrichedItems = lesson?.enrichment?.quizItems;
  if (!Array.isArray(enrichedItems) || enrichedItems.length === 0) return framedAtoms;
  const byIndex = new Map(enrichedItems.map((item) => [Number(item.index), item]));
  return framedAtoms.map((atom, index) => {
    const enriched = byIndex.get(index);
    if (!enriched || cleanText(enriched.question).length === 0) return atom;
    const next = { ...atom, question: enriched.question, enrichmentSource: 'lesson-content-enrichment' };
    if (atom.type === 'multiple_choice' && Array.isArray(enriched.options) && enriched.options.length === 4) {
      const keyText = enriched.options[enriched.answerIndex] || enriched.options[0];
      const distractors = enriched.options.filter((_, optionIndex) => optionIndex !== enriched.answerIndex);
      // Preserve the compiler's deterministic key rotation.
      const targetLetter = atom.answer;
      const targetSlot = QUIZ_ANSWER_LETTERS.indexOf(targetLetter);
      const ordered = [...distractors];
      ordered.splice(targetSlot < 0 ? 0 : targetSlot, 0, keyText);
      next.options = ordered.map((text, optionIndex) => labelQuizOption(QUIZ_ANSWER_LETTERS[optionIndex], text));
      next.answer = targetLetter;
      if (enriched.distractorRationales?.length > 0) {
        next.distractorRationale = enriched.distractorRationales.join(' ');
      }
      if (enriched.explanation) next.explanation = `${next.answer}. ${enriched.explanation}`;
    } else if (atom.type !== 'multiple_choice') {
      if (enriched.answer) next.answer = enriched.answer;
      if (enriched.answer) next.sampleAnswer = enriched.answer;
      if (enriched.explanation) next.explanation = enriched.explanation;
      if (enriched.scoringGuidance) next.scoringGuidance = enriched.scoringGuidance;
    }
    return next;
  });
}

function compileQuizBank(blueprint, config = {}) {
  const preference = featurePreference(blueprint, 'quizBank');
  const quizzes = blueprint.lessons.map((lesson, index) => {
    const assessment =
      blueprint.assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) ||
      blueprint.assessments[index] ||
      {};
    const questions = buildQuizAtomsForLesson(lesson, blueprint, { ...config, assessment });
    const totalPoints = questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
    const totalMinutes = questions.reduce((sum, question) => sum + Number(question.estimatedMinutes || 0), 0);
    return {
      lessonTitle: lesson.title,
      totalQuestions: questions.length,
      totalPoints,
      blueprintGrounding: lessonSourceGrounding(lesson, {
        difficultyProfile: lesson.difficultyProfile,
        misconceptionFocus: lesson.misconceptionMap?.[0]?.misconception || '',
        anchorExampleSet: assessment.anchorExampleSet,
        quizBlueprint: questions.map((question) => question.quizPlan),
        learnerContextProfile: blueprint.learnerContextProfile,
        courseModalityProfile: blueprint.courseModalityProfile,
        ...(preference ? { instructorPreference: preference } : {}),
      }),
      learningTransferPlan: lesson.learningTransferPlan,
      prerequisitePlan: lesson.prerequisitePlan,
      anchorExampleSet: assessment.anchorExampleSet || null,
      teachingIntent: lesson.teachingIntent,
      modalityCue: lesson.modalityCue,
      modalityDecode: lesson.modalityDecode,
      artifactGenre: lesson.artifactGenre,
      learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
      pointPlan: `${lesson.title} uses ${questions.filter((question) => question.type === 'multiple_choice').length} multiple-choice item(s) at 2 points, ${questions.filter((question) => question.type === 'short_answer').length} short-answer item(s) at 4 points, and ${questions.filter((question) => question.type === 'essay').length} essay item(s) at 8 points for ${totalPoints} total points.`,
      bloomsCoverage: unique(
        questions.map((question) => question.bloomsLevel),
        6,
      ),
      quizBlueprint: {
        source: 'source-grounded-quiz-plan',
        lessonBloom: lesson.bloomsLevel,
        bloomInference: lesson.bloomInference || null,
        questionPlan: questions.map((question) => question.quizPlan),
      },
      objectiveEvidenceChecklist: objectiveEvidenceChecklist(lesson.objectiveEvidencePlan),
      formativeFeedbackNote: `For ${lesson.title}, administer these questions after students practice ${compactList(lesson.keyConcepts, 'the lesson concepts', 3)}. ${lesson.prerequisitePlan?.diagnosticCheck || 'Check prerequisite understanding before scoring readiness.'} ${assessment.anchorExampleSet?.scorerCalibrationUse || 'Compare responses against strong and partial anchor examples before scoring.'} ${lesson.learningTransferPlan?.spacedPracticeCue || 'Use the results as spaced retrieval before the next artifact.'} Review missed items within one class session, allow screen-reader-friendly text formats or extended time as needed, and ask students to use results to revise ${lesson.studentArtifact}. Estimated completion time is ${totalMinutes} minutes.${preference ? ` Preference profile: ${preference}.` : ''}`,
      questions,
      assessmentBlueprint: `${lesson.title} covers ${lesson.outcomes.join('; ')} with a source-grounded quiz plan for ${compactList(lesson.keyConcepts, stripLessonPrefix(lesson.title), 3)} and ${stripTerminalPunctuation(lesson.studentArtifact)}: ${questions.map((question) => `${question.quizPlan.role} -> ${question.bloomsLevel}`).join('; ')}. ${lesson.learningTransferPlan?.transferTask || `Students transfer quiz evidence into ${lesson.studentArtifact}.`} Results indicate which parts of ${lesson.studentArtifact} need reteaching or feedback.${preference ? ` Instructor preference: ${preference}.` : ''}`,
      tags: unique(['quiz bank', lesson.title, ...lesson.keyConcepts, lesson.studentArtifact], 8),
    };
  });

  return {
    quizzes,
    bankIndex: quizzes.flatMap((quiz) =>
      quiz.questions.map((question) => ({
        id: question.id,
        lessonTitle: quiz.lessonTitle,
        type: question.type,
        bloomsLevel: question.bloomsLevel,
        difficulty: question.difficulty,
        estimatedMinutes: question.estimatedMinutes,
        intendedUse: question.intendedUse,
        tags: question.tags,
      })),
    ),
  };
}

const SLIDE_STRUCTURAL_LABEL_RE =
  /^(?:clinical\s+block\s*\d*|block\s*\d+|studio\s+seminar|clinical\s+placement|field\s+application|course\s+goals)$/i;
const SLIDE_WEAK_PHRASE_RE = /^(?:tbd|to be determined|none|n\/a|lesson|week|topic|clinical|block|studio|seminar)$/i;

function normalizeSlidePhrase(value) {
  const raw = stripTerminalPunctuation(stripLessonPrefix(value))
    .replace(/\bTBD\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';

  const parts = raw
    .split(/\s*\/\s*/)
    .map((part) =>
      stripTerminalPunctuation(part)
        .replace(/^(?:clinical\s+block\s*\d+|block\s*\d+)\s*[:.-]?\s*/i, '')
        .trim(),
    )
    .filter(Boolean);

  const phrase =
    parts.length > 1
      ? parts.filter((part) => !SLIDE_STRUCTURAL_LABEL_RE.test(part)).join(' and ') || parts[parts.length - 1]
      : parts[0] || raw;

  return cleanText(
    phrase
      .replace(/^(?:studio\s+seminar|clinical\s+placement|field\s+application)\s*[:.-]?\s*/i, '')
      .replace(/\s+/g, ' '),
  );
}

function isWeakSlidePhrase(value) {
  const text = cleanText(value);
  if (!text) return true;
  if (SLIDE_WEAK_PHRASE_RE.test(text)) return true;
  return text.length > 95;
}

function slideConceptCandidates(lesson) {
  return unique(
    [
      ...asArray(lesson?.keyConcepts),
      lesson?.title,
      ...(lesson?.outcomes || []),
      ...(lesson?.readings || []),
      lesson?.activityPattern,
    ]
      .map(normalizeSlidePhrase)
      .filter((phrase) => !isWeakSlidePhrase(phrase)),
    6,
  );
}

function primarySlideConcept(lesson) {
  return slideConceptCandidates(lesson)[0] || `Week ${lesson?.lessonNumber || ''} focus`.trim();
}

function secondarySlideConcept(lesson, primary = primarySlideConcept(lesson)) {
  return (
    slideConceptCandidates(lesson).find(
      (candidate) => cleanText(candidate).toLowerCase() !== cleanText(primary).toLowerCase(),
    ) || primary
  );
}

function slideConceptList(lesson, fallback = primarySlideConcept(lesson)) {
  return compactList(slideConceptCandidates(lesson), fallback, 3);
}

function slideLessonTitle(lesson) {
  const title = normalizeSlidePhrase(lesson?.title);
  const display = isWeakSlidePhrase(title) ? primarySlideConcept(lesson) : title;
  return `Lesson ${lesson?.lessonNumber || ''}: ${sentenceCase(display)}`.replace(/\s+:/, ':').trim();
}

function slideArtifact(lesson) {
  const parts = cleanText(lesson?.studentArtifact)
    .split(/\s*;\s*/)
    .map(stripTerminalPunctuation)
    .filter((part) => part && !/\b(TBD|to be determined)\b/i.test(part));
  return parts[0] || `${primarySlideConcept(lesson)} artifact`;
}

function slideSourceCue(lesson) {
  return (
    asArray(lesson?.readings)
      .map(normalizeSlidePhrase)
      .find((part) => !isWeakSlidePhrase(part)) || `${primarySlideConcept(lesson)} course materials`
  );
}

function slideSuccessCriterion(lesson) {
  return (
    asArray(lesson?.successCriteria).find((criterion) => criterion && !/\b(TBD|to be determined)\b/i.test(criterion)) ||
    `Uses specific evidence about ${primarySlideConcept(lesson)} to improve ${slideArtifact(lesson)}.`
  );
}

function slideDeckPhrase(blueprint, lesson) {
  const lens = blueprintLens(blueprint);
  const concept = primarySlideConcept(lesson);
  const source = slideSourceCue(lesson);
  // v0.12.1: cite the source only when it resolved to something real — never
  // the "… course materials" placeholder.
  const realSource = !/(?:instructor-provided\s+)?course materials(?:\s+and notes)?$/i.test(cleanText(source));
  return {
    context: slideConceptList(lesson, concept),
    evidenceMove: realSource
      ? `use ${lens.evidenceNoun} from ${source} to test ${concept}`
      : `use ${lens.evidenceNoun} to test ${concept}`,
    decisionMove: `choose the ${lens.decisionNoun} for ${slideArtifact(lesson)}`,
  };
}

function slideVisual(lesson, slide) {
  const { type, title } = slide;
  if (['title', 'agenda', 'objectives', 'closing'].includes(type)) {
    return { kind: 'none', description: '', altText: '' };
  }
  const concept = primarySlideConcept(lesson);
  const secondary = secondarySlideConcept(lesson, concept);
  const artifact = slideArtifact(lesson);
  const source = slideSourceCue(lesson);
  const modality = lesson.modalityDecode || {};
  const artifactGenre = lesson.artifactGenre || {};
  const visualByType = {
    bridge: {
      kind: 'learning-thread timeline',
      purpose: `Show how prior work, ${concept}, and the next artifact connect.`,
      evidenceUse: `Trace the evidence thread from ${source} into ${artifact}.`,
    },
    keyTerm: {
      kind: 'concept map',
      purpose: `Define ${concept} as a decision tool, not a vocabulary-only term.`,
      evidenceUse: `Link ${concept} to evidence cues and decision cues students will use in ${artifact}.`,
      // v0.13.3: explicit hub/spokes from the lesson's kernel key terms —
      // short disciplinary terms the exporter can render as a native
      // hub-and-spoke group (full-sentence bullets always failed its guard).
      ...(() => {
        const hub = conciseClause(concept, concept, 36);
        const spokes = unique(
          [
            ...(lesson.enrichment?.keyTerms || []).map((term) => cleanText(term.term)),
            ...(lesson.keyConcepts || []).map((term) => cleanText(term)),
            cleanText(secondary),
          ].filter((term) => term && term.length <= 26 && term.toLowerCase() !== hub.toLowerCase()),
          4,
        );
        return spokes.length >= 2 ? { hub, spokes } : {};
      })(),
    },
    content: {
      kind: /limit|honest|gap/i.test(title) ? 'constraint map' : 'evidence table',
      purpose: `Make the evidence standard for ${artifact} inspectable.`,
      evidenceUse: `Compare ${concept}, ${secondary}, and the success criterion before students draft.`,
    },
    example: {
      kind: 'annotated example',
      purpose: `Mark where a strong ${concept} example uses ${source} evidence to change the decision for ${artifact}.`,
      evidenceUse: `Annotate the ${source} detail that supports or complicates ${artifact}.`,
    },
    activity: {
      kind: 'practice workflow',
      purpose: `Show the ${concept} practice steps students follow during ${modality.mode || 'practice'}.`,
      evidenceUse: `Connect ${modality.signaturePractice || 'practice'} to the revision evidence for ${artifact}.`,
    },
    discussion: {
      kind: 'decision matrix',
      purpose: `Compare competing ${concept} evidence choices for ${artifact} before students commit to a revision.`,
      evidenceUse: `Use ${concept} evidence to choose the stronger ${artifact} move.`,
    },
    summary: {
      kind: 'readiness checklist',
      purpose: `Help students self-check whether ${concept} is ready to transfer.`,
      evidenceUse: `Confirm the feedback action students will carry into ${artifact}.`,
    },
  };
  const selected = visualByType[type] || {
    kind: 'evidence organizer',
    purpose: `Organize ${concept} evidence for ${artifact}.`,
    evidenceUse: `Connect source evidence, decision logic, and artifact revision.`,
  };
  const visualPlan = {
    slidePurpose: selected.purpose,
    evidenceSource: source,
    artifactConnection: artifact,
    modalityFit:
      modality.signaturePractice ||
      modality.evidenceRoutine ||
      `Use the course practice pattern to make ${concept} evidence visible.`,
    artifactGenreFit:
      artifactGenre.qualityFocus ||
      artifactGenre.evidenceRequirement ||
      `Show how the visual supports ${artifact} as a ${artifactGenre.label || artifactGenre.genre || 'course artifact'}.`,
    studentAction: slide.activity
      ? `Students use the visual during ${slide.activity} to revise or defend ${artifact}.`
      : `Students use the visual to decide what evidence changes ${artifact}.`,
    accessibilityCheck: `Alt text names the visual purpose, ${concept} evidence source, and ${artifact} connection without relying on color alone.`,
  };
  const visualEvidence = conciseClause(
    selected.evidenceUse,
    `Connect ${concept} evidence to ${artifact}`,
    type === 'activity' ? 84 : 100,
  );
  return {
    kind: selected.kind,
    description: `${sentenceCase(selected.kind)}: ${visualEvidence}.`,
    altText: `${sentenceCase(selected.kind)} for "${title}" showing ${concept} evidence for ${artifact}.`,
    // v0.13.3: renderable concept-map data (hub + short spoke terms) rides
    // the descriptor so the PPTX exporter can draw a native group.
    ...(selected.hub && Array.isArray(selected.spokes) ? { hub: selected.hub, spokes: selected.spokes } : {}),
    visualPlan,
  };
}

function slideTypeFocus(type, lesson, lens) {
  const concept = primarySlideConcept(lesson);
  const secondary = secondarySlideConcept(lesson, concept);
  const displayTitle = slideLessonTitle(lesson);
  const artifact = slideArtifact(lesson);
  const source = slideSourceCue(lesson);
  const successCriterion = slideSuccessCriterion(lesson);
  switch (type) {
    case 'title':
      return {
        opening: `Frame ${displayTitle} as a working session on ${slideConceptList(lesson)}, with ${artifact} as the visible product.`,
        evidence: `Preview the ${lens.evidenceNoun} from ${source} that students will inspect before they revise ${artifact}.`,
        misconception: `Set the expectation that students will leave with one concrete move they can use in ${artifact}.`,
      };
    case 'agenda':
      return {
        opening: `Walk through the lesson flow so students can see where ${concept}, practice, and feedback each appear in ${displayTitle}.`,
        evidence: `Point to the work block where students test ${secondary} against live ${lens.evidenceNoun} for ${artifact}.`,
        misconception: `Clarify that preparation, practice, and debrief all support ${artifact} rather than disconnected tasks.`,
      };
    case 'objectives':
      return {
        opening: `Translate the objectives into actions students should demonstrate by the end of ${displayTitle}.`,
        evidence: `Tie each objective to the evidence move students need for ${artifact}.`,
        misconception: `If students treat the objectives as vocabulary only, restate them as decisions they must justify in ${artifact}.`,
      };
    case 'bridge':
      return {
        opening: `Connect the prior lesson to today's ${concept} decision so the course arc feels cumulative.`,
        evidence: `Name what prior ${lens.evidenceNoun} still matters for ${artifact} and what new evidence students need to add today.`,
        misconception: `Prevent compartmentalized thinking by showing how today's ${concept} revision changes the ongoing ${artifact} sequence.`,
      };
    case 'keyTerm':
      return {
        opening: `Define ${concept} with language students can reuse in notes, field observations, critique, or draft feedback.`,
        evidence: `Model one sentence that applies ${concept} to ${artifact} using course evidence.`,
        misconception: `Correct any tendency to use ${concept} as a label without showing what evidence makes it credible.`,
      };
    case 'example':
      return {
        opening: `Use the scenario to show how a practitioner notices ${concept} inside a realistic course situation.`,
        evidence: `Pause on the example long enough for students to identify which detail counts as usable ${lens.evidenceNoun} for ${artifact}.`,
        misconception: `If students jump to recommendations about ${artifact} too early, bring them back to what the ${concept} example actually shows.`,
      };
    case 'activity':
      return {
        opening: `Give students a short work window to revise ${artifact} with a partner before the debrief.`,
        evidence: `Circulate for whether pairs can point to one concrete ${lens.evidenceNoun} move and one ${concept} revision choice in ${artifact}.`,
        misconception: `When groups stay abstract, require them to annotate the exact sentence, note, or claim they would change in ${artifact}.`,
      };
    case 'discussion':
      return {
        opening: `Use the discussion to compare competing interpretations before students lock in their next ${artifact} move.`,
        evidence: `Push students to cite specific ${lens.evidenceNoun} instead of general impressions when they defend a ${concept} choice in ${artifact}.`,
        misconception: `If the conversation turns into opinion-sharing, redirect to ${artifact} and ask what ${concept} evidence would change the decision.`,
      };
    case 'summary':
      return {
        opening: `Treat the ${concept} self-check for ${artifact} as a quick readiness check, not as a formality before dismissal.`,
        evidence: `Ask students to name which ${lens.evidenceNoun} now feels strongest for ${artifact}.`,
        misconception: `If they can only repeat vocabulary, prompt for the specific ${artifact} revision or next step they can now justify.`,
      };
    case 'closing':
      return {
        opening: `End by naming the exact follow-through students should complete after ${displayTitle}.`,
        evidence: `Remind them which note, example, or feedback move should carry forward into ${artifact}.`,
        misconception: `Avoid vague homework language; specify that the next step is to improve ${artifact} with today's evidence and feedback.`,
      };
    default:
      return {
        opening: `Use this slide to keep ${displayTitle} tied to ${slideConceptList(lesson)}.`,
        evidence: `Connect the slide to one visible ${lens.evidenceNoun} move in ${artifact}.`,
        misconception: `Redirect abstract discussion back to the evidence and decision work students must complete in ${artifact}.`,
      };
  }
}

function slideNoteAnchor({ type, anchor, concept, artifact, displayTitle }) {
  switch (type) {
    case 'title':
      return `Open the working session by naming the product students are building: ${artifact}. Use "${anchor}" to connect the topic to the decisions they will make today.`;
    case 'agenda':
      return `Keep the pacing visible and point to the first ${concept} checkpoint: ${anchor}. Students should know when they will listen, practice, compare, and revise ${artifact}.`;
    case 'objectives':
      return `Turn "${anchor}" into an observable performance target; ask students what evidence would prove they can do it.`;
    case 'bridge':
      return `Use "${anchor}" as the continuity cue between prior work and today's ${concept} decision.`;
    case 'keyTerm':
      return `Put "${anchor}" into a sentence students could write in their own notes before showing a formal definition.`;
    case 'example':
      return `Treat "${anchor}" as the ${concept} detail to inspect, then ask what it reveals about ${artifact} and what it does not prove.`;
    case 'activity':
      return `Set up the activity with a visible output: each pair must leave a marked revision, not just a conversation about ${concept}.`;
    case 'discussion':
      return `Start the discussion from a concrete contrast in "${anchor}" so the exchange does not drift into general opinion.`;
    case 'summary':
      return `Use "${anchor}" as a quick oral or written check for ${concept} readiness before students leave ${displayTitle}.`;
    case 'closing':
      return `Close with the handoff: students should know exactly what to revise, prepare, or submit for ${artifact}.`;
    default:
      return `Use "${anchor}" as the claim students need to test with evidence, not as a heading to copy.`;
  }
}

function slideNoteCriterionCue(type, criterion) {
  const cues = {
    title: `Keep the success test visible from the start: ${criterion}`,
    agenda: `Use the agenda to show when students will practice this criterion: ${criterion}`,
    objectives: `Make the criterion measurable in student language: ${criterion}`,
    bridge: `Ask which prior move already supports the criterion and which part still needs work: ${criterion}`,
    keyTerm: `Check that students can use the term to meet this criterion: ${criterion}`,
    example: `Score the example against the criterion before moving on: ${criterion}`,
    activity: `During circulation, look for evidence that pairs are improving this criterion: ${criterion}`,
    discussion: `Use the criterion to decide which argument is strongest: ${criterion}`,
    summary: `Have students self-rate readiness against this criterion: ${criterion}`,
    closing: `Make the after-class task point directly back to this criterion: ${criterion}`,
  };
  return cues[type] || `Tie the explanation back to this criterion: ${criterion}`;
}

function slideNoteTransition({ type, nextCue, lens, concept, artifact }) {
  if (nextCue) {
    const transitions = {
      title: `Then move into "${nextCue}" by asking what students need to notice first about ${concept}.`,
      agenda: `Before "${nextCue}", confirm students can name the ${concept} evidence they will use for ${artifact}.`,
      objectives: `Transition to "${nextCue}" by choosing one ${concept} objective to watch during practice.`,
      bridge: `Use that ${concept} carry-forward point to launch "${nextCue}" without restarting the lesson from scratch.`,
      keyTerm: `Move to "${nextCue}" by asking students where ${concept} would show up in ${artifact}.`,
      content: `Move next to "${nextCue}" by naming how ${concept} changes the ${lens.decisionNoun} for ${artifact}.`,
      example: `Carry the strongest ${concept} detail into "${nextCue}" as the next piece of evidence for ${artifact}.`,
      activity: `Use one ${artifact} revision as the bridge into "${nextCue}".`,
      discussion: `Close the exchange by selecting the ${concept} claim that should guide "${nextCue}".`,
      summary: `Use the ${concept} self-check result to decide what needs reinforcement in "${nextCue}".`,
      closing: `Point students to "${nextCue}" as the next place their ${artifact} revision decision will matter.`,
    };
    return transitions[type] || `Move next to "${nextCue}" by naming how it changes the ${lens.decisionNoun}.`;
  }
  return `End by asking how this point changes the ${lens.decisionNoun} students will make for ${artifact}.`;
}

function slideNotes({ lesson, title, type, bullets, nextCue, lens }) {
  const anchor = bullets[0] || title;
  const focus = slideTypeFocus(type, lesson, lens);
  const concept = primarySlideConcept(lesson);
  const artifact = slideArtifact(lesson);
  const displayTitle = slideLessonTitle(lesson);
  const criterion = slideSuccessCriterion(lesson);
  const activitySequence =
    type === 'activity'
      ? `Detailed activity sequence: ${bullets
          .map((bullet) => stripTerminalPunctuation(bullet))
          .filter(Boolean)
          .join(' ')}`
      : '';
  return [
    `${focus.opening} ${slideNoteAnchor({ type, anchor, concept, artifact, displayTitle })}`,
    focus.evidence,
    `${focus.misconception} ${slideNoteCriterionCue(type, criterion)}`,
    activitySequence,
    slideNoteTransition({ type, nextCue, lens, concept, artifact }),
  ]
    .filter(Boolean)
    .join(' ');
}

function compactSlideDisplayBullet(slide, bullet, index, lesson) {
  const type = cleanText(slide?.type).toLowerCase();
  const maxLength = type === 'activity' || type === 'discussion' ? 78 : 112;
  const fallback = type === 'activity' ? 'Complete the practice step' : 'Use course evidence';
  const concept = primarySlideConcept(lesson);
  const artifact = slideArtifact(lesson);
  const compact = conciseClause(bullet, fallback, maxLength)
    .replace(/^students?\s+/i, '')
    .replace(/^use\s+/i, 'Use ');
  // v0.12.1: never prepend the concept when the bullet already names it —
  // activity slides used to render "Practice: Constructivism: Constructivism
  // adapts…" because the cue was unconditional for that slide type.
  const conceptAlreadyNamed = cleanText(compact).toLowerCase().includes(cleanText(concept).toLowerCase());
  const needsLessonCue = !conceptAlreadyNamed && (type === 'activity' || type === 'discussion' || compact.length >= 70);
  const lessonSpecific = needsLessonCue
    ? conciseClause(`${concept}: ${compact}`, compact, maxLength)
    : conciseClause(compact, fallback, maxLength);
  if (type !== 'activity') return lessonSpecific;
  const labels = ['Practice', 'Evidence', 'Debrief'];
  const activityCue =
    index === 1
      ? conciseClause(`${concept} evidence for ${artifact}`, lessonSpecific, maxLength)
      : index === 2
        ? conciseClause(`${concept} decision for ${artifact}`, lessonSpecific, maxLength)
        : lessonSpecific;
  return `${labels[index] || `Step ${index + 1}`}: ${activityCue}`;
}

function displayBulletsForSlide(slide, lesson) {
  return asArray(slide?.bullets)
    .slice(0, slide?.type === 'agenda' ? 5 : 3)
    .map((bullet, index) => compactSlideDisplayBullet(slide, bullet, index, lesson))
    .filter(Boolean);
}

function discussionDurationForFormat(format) {
  if (format === 'Asynchronous Online') return 'Initial post by midweek; replies by week end';
  if (format === 'Gallery Walk') return '25 min';
  if (format === 'Debate / Structured Academic Controversy') return '30 min';
  if (/simulation|role play/i.test(format)) return '30 min';
  if (/communicative|language/i.test(format)) return '25-30 min';
  if (/critique|clinic|roundtable|synthesis/i.test(format)) return '25-30 min';
  return '20-25 min';
}

function buildDiscussionProtocol({ lesson = {}, blueprint = {}, phrase = {}, lens = {} }) {
  const mode = lesson.modalityDecode?.mode || blueprint.courseModalityProfile?.primaryMode || 'weekly-applied-seminar';
  const genre = lesson.artifactGenre?.genre || 'applied-artifact';
  const artifact = stripTerminalPunctuation(lesson.studentArtifact || 'the lesson artifact');
  const concept = lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title) || 'the lesson focus';
  const evidenceMove = phrase.evidenceMove || `use ${lens.evidenceNoun || 'course evidence'} to test ${concept}`;
  const decisionMove = stripTerminalPunctuation(
    phrase.decisionMove || `make a defensible ${lens.decisionNoun || 'course decision'} for ${artifact}`,
  ).toLowerCase();
  const protocolByGenre = {
    'clinical-placement-evidence': {
      format: 'Clinical Placement Conference',
      participationPattern:
        'site-evidence check, confidentiality screen, preceptor-feedback review, competency calibration, safety-boundary challenge, and next-shift action plan',
      artifactUse: `Students inspect the deidentified site evidence, preceptor feedback, competency target, confidentiality check, safety action, and handoff decision in ${artifact}.`,
      reviewFocus: `patient safety, confidentiality, scope of practice, preceptor-feedback uptake, competency progression, and placement transfer for ${concept}`,
    },
    'clinical-care-plan': {
      format: 'Clinical Judgment Conference',
      participationPattern:
        'patient-cue sort, priority ranking, safety challenge, intervention rationale, SBAR handoff, and debrief revision',
      artifactUse: `Students inspect the patient assessment data, priority, intervention, monitoring cue, and handoff evidence in ${artifact}.`,
      reviewFocus: `cue recognition, prioritization, patient safety, intervention rationale, monitoring plan, and handoff clarity for ${concept}`,
    },
    'performance-simulation': {
      format: 'Role Play / Simulation',
      participationPattern: 'paired rehearsal, observation notes, debrief, and coached reattempt',
      artifactUse: `Students test exact language and response moves before revising ${artifact}.`,
      reviewFocus: `observable performance evidence, recovery after feedback, and safe or accurate ${concept} communication`,
    },
    'design-prototype': {
      format: 'Studio Critique',
      participationPattern: 'artifact walk-through, critique notes, revision commitment, and peer challenge',
      artifactUse: `Students inspect the visible design decision in ${artifact} before selecting the next iteration.`,
      reviewFocus: `visible change, critique evidence, usability reasoning, and the next ${concept} revision`,
    },
    'analysis-log': {
      format: 'Method Clinic',
      participationPattern: 'method trace, peer check, limitation naming, and corrected interpretation',
      artifactUse: `Students trace how the method choice in ${artifact} supports or weakens the conclusion.`,
      reviewFocus: `method fit, evidence traceability, limitation language, and interpretation accuracy for ${concept}`,
    },
    'engineering-design-test': {
      format: 'Engineering Design Review',
      participationPattern:
        'requirement check, prototype or model walkthrough, test-data review, failure-mode diagnosis, redesign critique, and verification handoff',
      artifactUse: `Students inspect the requirement, prototype or model, test setup, measurement data, and redesign rationale in ${artifact}.`,
      reviewFocus: `requirement fit, test validity, measurement evidence, failure analysis, safety or tolerance risk, and verification readiness for ${concept}`,
    },
    'statistical-inference-report': {
      format: 'Inference Interpretation Clinic',
      participationPattern:
        'question framing, assumption check, output trace, p-value or interval interpretation, limitation challenge, and revised inference decision',
      artifactUse: `Students inspect the question, sample context, assumptions, interval or test output, interpretation, and limitation in ${artifact}.`,
      reviewFocus: `question fit, assumption validity, calculation or output accuracy, uncertainty interpretation, effect size reasoning, limitation language, and inference decision quality for ${concept}`,
    },
    'source-evaluation-dossier': {
      format: 'Source Evaluation Clinic',
      participationPattern:
        'research-question check, database-search trace, credibility screen, citation-trail comparison, synthesis-matrix challenge, and revised source-use decision',
      artifactUse: `Students inspect the search string, database choice, source authority, relevance evidence, citation trail, and synthesis relationship in ${artifact}.`,
      reviewFocus: `search strategy fit, source authority, relevance, credibility, citation-trail reasoning, synthesis usefulness, attribution integrity, and source-use judgment for ${concept}`,
    },
    'teaching-plan-portfolio': {
      format: 'Microteaching Lesson Study',
      participationPattern:
        'learning-target check, standards alignment, microteaching rehearsal, student-work analysis, differentiation challenge, and revised instructional decision',
      artifactUse: `Teacher candidates inspect the learning target, instructional move, student evidence, formative check, and differentiation plan in ${artifact}.`,
      reviewFocus: `target-task alignment, student evidence, pedagogical reasoning, differentiation, formative feedback, classroom feasibility, and reteach readiness for ${concept}`,
    },
    'case-conceptualization': {
      format: 'Helping Skills Case Conference',
      participationPattern:
        'client-scenario read, helping-response rehearsal, observation coding, risk and ethics check, referral comparison, and revised helping decision',
      artifactUse: `Students inspect the client cue, exact helping response, observation code, risk or ethics note, and referral rationale in ${artifact}.`,
      reviewFocus: `client-centered evidence, active listening, helping-skill fit, risk recognition, ethics and boundaries, referral reasoning, supervision uptake, and next-response readiness for ${concept}`,
    },
    'financial-analysis-report': {
      format: 'Financial Analysis Clinic',
      participationPattern:
        'source document check, account classification, calculation trace, statement-effect review, assumption or control challenge, and revised financial decision',
      artifactUse: `Students inspect the source document or statement line, calculation trace, statement effect, assumption or control, and decision logic in ${artifact}.`,
      reviewFocus: `source fit, account classification, statement linkage, calculation accuracy, assumption or control validity, ratio or variance interpretation, and financial decision quality for ${concept}`,
    },
    'economic-analysis-brief': {
      format: 'Economic Model Clinic',
      participationPattern:
        'market definition check, assumption statement, diagram or calculation trace, comparative-static challenge, welfare or incentive review, and revised economic decision',
      artifactUse: `Students inspect the market, assumptions, model or calculation, incentive effect, welfare implication, and decision limit in ${artifact}.`,
      reviewFocus: `model fit, assumption clarity, supply-demand or macro reasoning, elasticity or surplus interpretation, incentive logic, welfare or distributional effect, and economic decision quality for ${concept}`,
    },
    'ethical-argument-brief': {
      format: 'Ethical Argument Seminar',
      participationPattern:
        'dilemma framing, normative-framework comparison, argument-map share, objection and reply, case variation test, and revised moral judgment',
      artifactUse: `Students inspect the claim, reasons, framework, objection, reply, case evidence, and judgment limit in ${artifact}.`,
      reviewFocus: `claim clarity, framework fit, reason support, objection strength, reply quality, stakeholder sensitivity, case application, and moral decision quality for ${concept}`,
    },
    'policy-brief': {
      format: 'Policy Option Clinic',
      participationPattern:
        'problem definition check, stakeholder map, option comparison, equity and feasibility challenge, implementation-risk review, and revised policy recommendation',
      artifactUse: `Students inspect the public problem, affected population, option evidence, stakeholder/equity effect, feasibility constraint, and implementation risk in ${artifact}.`,
      reviewFocus: `problem framing, evidence credibility, stakeholder representation, equity reasoning, option tradeoffs, feasibility, implementation realism, and policy decision quality for ${concept}`,
    },
    'data-science-notebook': {
      format: 'Analytics Review Clinic',
      participationPattern:
        'dataset provenance check, cleaning trace, notebook output review, validation comparison, bias or limitation challenge, and revised analytic conclusion',
      artifactUse: `Students inspect the dataset, notebook output, visualization or model evidence, and validation logic in ${artifact}.`,
      reviewFocus: `data integrity, reproducibility, validation evidence, interpretation accuracy, bias or fairness risk, and analytic usefulness for ${concept}`,
    },
    'code-lab': {
      format: 'Code Review Clinic',
      participationPattern:
        'test setup, pair implementation, failing or passing test trace, code review, refactor note, and commit handoff',
      artifactUse: `Students inspect the code, tests, debugging trace, and implementation rationale in ${artifact}.`,
      reviewFocus: `correctness, readability, test coverage, edge-case handling, debugging evidence, and commit clarity for ${concept}`,
    },
    'lab-report': {
      format: 'Lab Evidence Clinic',
      participationPattern: 'protocol trace, safety check, notebook evidence comparison, and corrected interpretation',
      artifactUse: `Students inspect the protocol, raw observations, and data evidence in ${artifact} before revising the conclusion.`,
      reviewFocus: `protocol accuracy, safety reasoning, data integrity, variable control, and conclusion limits for ${concept}`,
    },
    'problem-set': {
      format: 'Problem-Solving Clinic',
      participationPattern: 'setup comparison, step trace, answer check, error diagnosis, and corrected solution',
      artifactUse: `Students inspect the equation setup, representation, and reasoning path in ${artifact} before revising the solution.`,
      reviewFocus: `mathematical setup, step logic, representation accuracy, verification, and error analysis for ${concept}`,
    },
    'proof-portfolio': {
      format: 'Proof Clinic',
      participationPattern:
        'definition unpacking, theorem statement check, proof-strategy comparison, counterexample test, peer proof critique, and revised proof step',
      artifactUse: `Students inspect the definitions, hypotheses, proof strategy, logical steps, and revision evidence in ${artifact}.`,
      reviewFocus: `definition use, hypothesis tracking, quantifier precision, logical validity, counterexample reasoning, notation clarity, and proof revision for ${concept}`,
    },
    'capstone-project': {
      format: 'Milestone Design Review',
      participationPattern:
        'milestone evidence share, sponsor constraint check, risk triage, decision defense, and revision commitment',
      artifactUse: `Students inspect how ${artifact} connects project evidence, stakeholder constraints, and next milestone decisions.`,
      reviewFocus: `project coherence, stakeholder fit, integration evidence, feasibility risk, and defense readiness for ${concept}`,
    },
    'competency-evidence': {
      format: 'Competency Calibration Panel',
      participationPattern:
        'performance evidence review, benchmark comparison, proficiency calibration, remediation planning, and reassessment commitment',
      artifactUse: `Students map ${artifact} to the target competency, benchmark descriptor, and next evidence step.`,
      reviewFocus: `standards alignment, evidence sufficiency, calibrated proficiency judgment, remediation fit, and reassessment readiness for ${concept}`,
    },
    'creative-portfolio': {
      format: 'Creative Workshop Critique',
      participationPattern:
        'silent read or viewing, craft observation, peer critique, revision question, and next-draft commitment',
      artifactUse: `Students inspect the craft choices, critique notes, and revision evidence in ${artifact}.`,
      reviewFocus: `craft intentionality, audience effect, critique uptake, visible revision, and portfolio coherence for ${concept}`,
    },
    'case-analysis': {
      format: 'Case Decision Board',
      participationPattern:
        'case fact sort, exhibit check, stakeholder tradeoff challenge, recommendation defense, and implementation-risk revision',
      artifactUse: `Students test the recommendation, decision criteria, exhibits, and stakeholder tradeoffs in ${artifact}.`,
      reviewFocus: `case evidence, tradeoff reasoning, decision criteria, recommendation defense, and implementation realism for ${concept}`,
    },
    'legal-analysis': {
      format: 'Socratic Rule Application',
      participationPattern:
        'case brief comparison, holding extraction, rule statement challenge, hypothetical application, and revised IRAC paragraph',
      artifactUse: `Students test the rule statement, holding, rationale, distinguishing facts, and application logic in ${artifact}.`,
      reviewFocus: `rule accuracy, precedent use, issue spotting, fact-sensitive application, counterargument, and doctrinal limits for ${concept}`,
    },
    'close-reading-analysis': {
      format: 'Interpretive Evidence Seminar',
      participationPattern:
        'passage or scene annotation, context boundary check, competing interpretation challenge, source-integrity review, and revised claim',
      artifactUse: `Students test the evidence, context boundary, counter-reading, and revised interpretive claim in ${artifact}.`,
      reviewFocus: `evidence specificity, claim arguability, context restraint, source integrity, counter-interpretation, and revision for ${concept}`,
    },
    'field-evidence': {
      format: 'Field Evidence Roundtable',
      participationPattern: 'observed evidence share, stakeholder check, equity question, and feasible action',
      artifactUse: `Students separate local evidence from assumptions before revising ${artifact}.`,
      reviewFocus: `stakeholder grounding, feasibility, equity reasoning, and the local action in ${artifact}`,
    },
    'literature-synthesis': {
      format: 'Source Synthesis Seminar',
      participationPattern: 'source comparison, gap challenge, attribution check, and synthesis revision',
      artifactUse: `Students compare source claims before revising the synthesis decision in ${artifact}.`,
      reviewFocus: `source accuracy, cross-source synthesis, gap logic, and attribution integrity for ${concept}`,
    },
    'memo-brief': {
      format: 'Claim-Evidence Critique',
      participationPattern: 'claim share, evidence challenge, limitation check, and memo revision decision',
      artifactUse: `Students test whether the claim, evidence, limitation, and next step in ${artifact} fit together.`,
      reviewFocus: `claim clarity, evidence quality, decision logic, audience fit, and revision use for ${concept}`,
    },
    'checkpoint-response': {
      format: 'Misconception Clinic',
      participationPattern: 'answer sort, reasoning explanation, misconception repair, and corrected response',
      artifactUse: `Students use ${artifact} to expose a misconception before writing a corrected explanation.`,
      reviewFocus: `concept accuracy, reasoning quality, correction path, and readiness for the next artifact`,
    },
    'language-performance': {
      format: 'Communicative Practice Lab',
      participationPattern:
        'input comprehension check, paired target-language rehearsal, focused recast, cultural-context check, and revised performance',
      artifactUse: `Students use ${artifact} to show what they can understand, say, interpret, or present in the target language.`,
      reviewFocus: `comprehensibility, language accuracy, communicative function, cultural fit, and revised target-language use for ${concept}`,
    },
    'performance-rehearsal': {
      format: 'Rehearsal Critique Lab',
      participationPattern:
        'warm-up, first run, director or peer notes, targeted rehearsal, revised performance run, and next-cue reflection',
      artifactUse: `Students use ${artifact} to make the performance choice, critique uptake, and revised run visible.`,
      reviewFocus: `technique accuracy, artistic intention, ensemble awareness, note uptake, and revised performance evidence for ${concept}`,
    },
    presentation: {
      format: 'Peer Presentation Critique',
      participationPattern: 'timed explanation, audience question, evidence check, and speaking or slide revision',
      artifactUse: `Students rehearse the audience claim and support evidence before revising ${artifact}.`,
      reviewFocus: 'audience fit, evidence organization, clarity, timing, and response to questions',
    },
    'reflection-response': {
      format: 'Structured Reflection Circle',
      participationPattern: 'individual write, evidence share, peer connection, and next-use commitment',
      artifactUse: `Students tie the reflection in ${artifact} to a concrete learning move and next action.`,
      reviewFocus: `specificity, metacognition, evidence connection, and actionable transfer for ${concept}`,
    },
    'applied-artifact': {
      format: mode === 'online-hybrid' ? 'Asynchronous Online' : 'Case-Based Discussion',
      participationPattern: 'evidence share, peer challenge, limitation naming, and revision commitment',
      artifactUse: `Students use ${artifact} to make the course evidence decision visible.`,
      reviewFocus: `concept accuracy, evidence specificity, decision logic, and revision quality for ${concept}`,
    },
  };
  const modeOverride =
    mode === 'online-hybrid'
      ? {
          ...(protocolByGenre[genre] || protocolByGenre['applied-artifact']),
          format: 'Asynchronous Online',
          participationPattern:
            'initial post, evidence-based reply, instructor checkpoint, and LMS revision commitment',
          artifactUse: `Students make the ${artifact} reasoning visible online before revising from feedback.`,
        }
      : mode === 'clinical-simulation'
        ? protocolByGenre['performance-simulation']
        : mode === 'clinical-placement-practicum'
          ? protocolByGenre['clinical-placement-evidence']
          : mode === 'clinical-judgment-simulation'
            ? protocolByGenre['clinical-care-plan']
            : mode === 'lecture-exam' && genre === 'checkpoint-response'
              ? {
                  ...protocolByGenre['checkpoint-response'],
                  format: 'Exam Readiness Clinic',
                  participationPattern:
                    'retrieval attempt, confidence check, wrong-answer sort, misconception repair, and exam-style transfer item',
                  artifactUse: `Students use ${artifact} to diagnose what they know, correct the misconception, and prepare for an exam-style transfer prompt.`,
                  reviewFocus: `concept accuracy, retrieval strength, misconception repair, confidence calibration, and exam-transfer readiness for ${concept}`,
                }
              : mode === 'world-language'
                ? protocolByGenre['language-performance']
                : mode === 'performing-arts'
                  ? protocolByGenre['performance-rehearsal']
                  : mode === 'engineering-design-lab'
                    ? protocolByGenre['engineering-design-test']
                    : mode === 'statistics-inference'
                      ? protocolByGenre['statistical-inference-report']
                      : mode === 'information-literacy'
                        ? protocolByGenre['source-evaluation-dossier']
                        : mode === 'teacher-preparation'
                          ? protocolByGenre['teaching-plan-portfolio']
                          : mode === 'counseling-practice'
                            ? protocolByGenre['case-conceptualization']
                            : mode === 'accounting-finance-analysis'
                              ? protocolByGenre['financial-analysis-report']
                              : mode === 'economics-analysis'
                                ? protocolByGenre['economic-analysis-brief']
                                : mode === 'ethics-argumentation'
                                  ? protocolByGenre['ethical-argument-brief']
                                  : mode === 'policy-analysis'
                                    ? protocolByGenre['policy-brief']
                                    : mode === 'proof-seminar'
                                      ? protocolByGenre['proof-portfolio']
                                      : mode === 'data-science-lab'
                                        ? protocolByGenre['data-science-notebook']
                                        : mode === 'programming-lab'
                                          ? protocolByGenre['code-lab']
                                          : mode === 'studio-lab' && genre === 'applied-artifact'
                                            ? protocolByGenre['design-prototype']
                                            : null;
  const selected = modeOverride || protocolByGenre[genre] || protocolByGenre['applied-artifact'];
  return {
    ...selected,
    estimatedDuration: discussionDurationForFormat(selected.format),
    modality: mode,
    artifactGenre: genre,
    evidenceMove,
    decisionMove,
    facilitationMove: `Use ${selected.participationPattern} so students ${evidenceMove} and then ${decisionMove}.`,
    modalityFit: `This discussion runs as ${mode}, using ${lesson.modalityDecode?.signaturePractice || 'the course practice pattern'} instead of a generic seminar exchange.`,
    artifactGenreFit: `This discussion treats ${artifact} as ${lesson.artifactGenre?.label || genre}, with review focused on ${selected.reviewFocus}.`,
    localAdaptationCue: `Confirm participation mode, privacy, accessibility, and time limits before running the ${selected.format.toLowerCase()} for ${stripLessonPrefix(lesson.title)}.`,
  };
}

function buildDiscussionArtifactSet(lesson, phrase) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  return [
    {
      title: `${stripLessonPrefix(lesson.title)} Reading Notes`,
      locator: lesson.readings.slice(0, 2).join('; '),
      use: `Pull one concrete claim or data point that clarifies ${concept} in the main prompt.`,
    },
    {
      title: `${stripLessonPrefix(lesson.title)} Assessment Brief`,
      locator: cleanText(lesson.studentArtifact, `${stripLessonPrefix(lesson.title)} weekly artifact`),
      use: `Use this artifact expectation to test whether the proposed decision would hold up in assessed work and ${phrase.decisionMove}.`,
    },
  ];
}

function buildDiscussionPrompt(lesson, phrase, lens) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const secondary = lesson.keyConcepts[1] || concept;
  return `Which ${concept} choice should students defend in ${lesson.studentArtifact}, and how does ${secondary} strengthen or complicate that decision?`;
}

function buildDiscussionFollowUps(lesson, phrase) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  return [
    `What evidence from ${lesson.title} most strongly supports your position on ${concept}?`,
    `Which alternative reading of the same evidence about ${concept} would challenge your claim, and why might another student prefer it for ${artifact}?`,
    `If the ${concept} evidence changed, what part of ${lesson.studentArtifact} would you revise first?`,
    `Where is the strongest limitation, risk, or ethical concern in your current reasoning about ${artifact}?`,
    `How does this discussion help students ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()}?`,
  ];
}

function buildDiscussionFacilitationTips(lesson, protocol) {
  const format = protocol.format;
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  return {
    opening: `Launch with two minutes of silent note-making on which ${concept} evidence source seems strongest for ${artifact}, then name the protocol: ${protocol.participationPattern}.`,
    ifStalls: `Ask students to compare the strongest and weakest evidence choices for ${artifact}, or switch to a quick pair exchange before reopening the ${format.toLowerCase()}.`,
    ifDominates: `Pause the ${format.toLowerCase()}, invite a new voice to paraphrase the current ${concept} claim, then require the next response to add evidence or a limitation that would sharpen ${artifact}.`,
    closure: `Close by naming one claim the class can defend with evidence, one unresolved limitation in ${concept}, and one revision students should make before completing ${artifact}: ${protocol.reviewFocus}.`,
    revisionCapture:
      lesson.feedbackCycle?.closureCheck ||
      `Ask each student to name one ${artifact} revision they will make because of the discussion.`,
  };
}

function buildDiscussionResponseStems(lesson) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  return [
    `The evidence I find most convincing for ${concept} is...`,
    `I agree with that conclusion about ${concept} only if the evidence also shows...`,
    `A limitation in this reasoning about ${lesson.studentArtifact} is...`,
    `If I were revising ${lesson.studentArtifact} after this ${concept} discussion, I would change...`,
  ];
}

function buildDiscussionCriteriaSet(lesson) {
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  return [
    `Uses specific evidence from ${lesson.title} instead of unsupported opinion.`,
    `Explains the reasoning behind the claim and connects it to ${lesson.studentArtifact}.`,
    `Responds to a peer by extending, questioning, or refining the evidence used about ${concept}.`,
    `Names one limitation, ethical concern, or revision step that would improve ${lesson.studentArtifact}.`,
  ];
}

function buildDiscussionGuidelinesForFormat(lesson, protocol) {
  const format = protocol.format;
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const lessonFocus = stripLessonPrefix(lesson.title);
  if (format === 'Asynchronous Online') {
    return `For ${lessonFocus}, post one evidence-based response by Wednesday 11:59 PM and two substantive replies by Sunday 11:59 PM. Your initial post should be about 175-225 words, cite at least one lesson source, and take a clear position on ${lesson.studentArtifact}. A substantive reply extends or challenges a peer's evidence, reasoning, or limitation statement about ${concept} rather than simply agreeing. Use this ${protocol.artifactGenre} protocol for ${lessonFocus}: ${protocol.participationPattern}. Discussion credit depends on timeliness, evidence use, ${protocol.reviewFocus}, and the quality of peer engagement around ${lesson.title}.`;
  }

  return `For ${lessonFocus}, come prepared with one brief ${concept} evidence note before class, speak or post at least twice during the ${format}, and respond directly to one peer by building on or challenging their evidence for ${lesson.studentArtifact}. Use this ${protocol.artifactGenre} protocol for ${lessonFocus}: ${protocol.participationPattern}. Reference a course concept, case detail, or reading when you contribute, and connect at least one comment to ${lesson.studentArtifact}. If you need an alternative participation mode, use the instructor-approved written or chat response option during the same activity window for ${lesson.title}. Participation is judged by evidence use, reasoning, peer response quality, ${protocol.reviewFocus}, and whether you name a limitation or revision move tied to ${concept}.`;
}

/**
 * v0.9.1 subject-matter enrichment: replace the scaffold bullets of the
 * teaching slides (keyTerm, content, example) with model-written assertion
 * titles and evidence-bearing bullets. Deck shape, timing, objectives, and
 * activity slides stay compiler-owned.
 */
function overlayEnrichedSlideContent(slides, lesson) {
  const enriched = lesson?.enrichment?.slideContent;
  if (!Array.isArray(enriched) || enriched.length === 0) return;
  const targets = slides.filter((slide) => ['keyTerm', 'content', 'example'].includes(slide.type));
  targets.forEach((slide, index) => {
    const content = enriched[index];
    if (!content || !content.title || !Array.isArray(content.bullets) || content.bullets.length === 0) return;
    slide.title = content.title;
    slide.bullets = content.bullets.slice(0, 4);
    if (content.notes) slide.notes = content.notes;
    slide.enrichmentSource = 'lesson-content-enrichment';
  });
}

/**
 * v0.9.1 Phase 3: deck length follows content instead of a fixed 12-slide
 * template. Lessons with extra enriched teaching content gain up to two
 * content slides; light lessons (a single concept, no enrichment) drop the
 * second generic content slide. Range stays a teachable 11-14.
 */
function adjustDeckLengthForContent(slides, lesson) {
  const enriched = Array.isArray(lesson?.enrichment?.slideContent) ? lesson.enrichment.slideContent : [];
  const teachingSlots = slides.filter((slide) => ['keyTerm', 'content', 'example'].includes(slide.type)).length;
  // Extra enriched assertions beyond the standard teaching slots become
  // additional content slides placed before the activity slide.
  const extras = enriched.slice(teachingSlots, teachingSlots + 2);
  if (extras.length > 0) {
    const activityIndex = slides.findIndex((slide) => slide.type === 'activity');
    const insertAt = activityIndex > 0 ? activityIndex : slides.length - 2;
    extras.forEach((content, offset) => {
      if (!content?.title || !Array.isArray(content.bullets) || content.bullets.length === 0) return;
      slides.splice(insertAt + offset, 0, {
        type: 'content',
        title: content.title,
        bullets: content.bullets.slice(0, 4),
        ...(content.notes ? { notes: content.notes } : {}),
        minutes: 5,
        bloom: 'Understand',
        objective: slides[insertAt]?.objective || null,
        activity: null,
        enrichmentSource: 'lesson-content-enrichment',
      });
    });
    return;
  }
  // Light lesson: one concept, no enrichment — drop the second generic
  // content slide instead of padding the deck.
  if ((lesson?.keyConcepts || []).length < 2) {
    const contentIndexes = slides
      .map((slide, index) => (slide.type === 'content' && !slide.enrichmentSource ? index : -1))
      .filter((index) => index >= 0);
    if (contentIndexes.length > 1) slides.splice(contentIndexes[1], 1);
  }
}

function compileDiscussions(blueprint) {
  const lens = blueprintLens(blueprint);
  const preference = featurePreference(blueprint, 'discussions');
  return {
    discussionDesign: {
      courseThroughline: `Each discussion moves students from naming ${lens.evidenceNoun} to defending a ${lens.decisionNoun} they will need in later course artifacts.`,
      modalityFit: blueprint.courseModalityProfile,
      sharedParticipationNorms:
        'Use evidence before opinion, listen for contrasting interpretations, paraphrase before rebutting, and leave space for written, spoken, or chat-based entry points.',
      scoringApproach:
        'Discussion quality is judged by evidence use, reasoning, peer response quality, and the ability to name a limitation or revision step.',
    },
    discussions: blueprint.lessons.map((lesson, index) => {
      const phrase = lessonPhrase(blueprint, lesson);
      const discussionProtocol = buildDiscussionProtocol({ lesson, blueprint, phrase, lens });
      const format = discussionProtocol.format;
      const assessment =
        blueprint.assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) ||
        blueprint.assessments[index] ||
        {};
      return {
        lessonTitle: lesson.title,
        bloomsLevel: lesson.bloomsLevel,
        format,
        estimatedDuration: discussionProtocol.estimatedDuration,
        discussionProtocol,
        sourceGrounding: lessonSourceGrounding(lesson, {
          sourceCue: lesson.evidencePlan?.sourceCue || '',
          evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
          misconceptionFocus: lesson.misconceptionMap?.[0]?.misconception || '',
          anchorExampleSet: assessment.anchorExampleSet,
          discussionProtocol,
          learnerContextProfile: blueprint.learnerContextProfile,
          courseModalityProfile: blueprint.courseModalityProfile,
          ...(preference ? { instructorPreference: preference } : {}),
        }),
        learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
        modalityCue: lesson.modalityCue,
        modalityDecode: lesson.modalityDecode,
        artifactGenre: lesson.artifactGenre,
        prerequisitePlan: lesson.prerequisitePlan,
        anchorExampleSet: assessment.anchorExampleSet || null,
        context: lesson.enrichment?.discussionPrompt?.tension
          ? `${lesson.enrichment.discussionPrompt.tension} ${lesson.title} asks students to take and defend a position with course evidence.`
          : `${lesson.title} asks students to work with ${phrase.context}. The discussion should test how students ${phrase.evidenceMove} and whether they can ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()} before they finalize ${lesson.studentArtifact}.`,
        prompt: lesson.enrichment?.discussionPrompt?.prompt || buildDiscussionPrompt(lesson, phrase, lens),
        ...(lesson.enrichment?.discussionPrompt?.positions?.length > 0
          ? {
              positionMap: lesson.enrichment.discussionPrompt.positions,
              enrichmentSource: 'lesson-content-enrichment',
            }
          : {}),
        evidenceRequirement: `Use at least one ${lens.evidenceNoun} source from ${lesson.title} and one concrete detail from ${lesson.studentArtifact} or its success criteria.`,
        sourceArtifacts: buildDiscussionArtifactSet(lesson, phrase),
        followUpProbes: buildDiscussionFollowUps(lesson, phrase),
        facilitationTips: buildDiscussionFacilitationTips(lesson, discussionProtocol),
        responseStems: buildDiscussionResponseStems(lesson),
        evaluationCriteria: buildDiscussionCriteriaSet(lesson),
        feedbackCycle: lesson.feedbackCycle,
        teachingIntent: lesson.teachingIntent,
        prerequisitePrompt:
          lesson.prerequisitePlan?.diagnosticCheck ||
          `Begin by checking prerequisite knowledge for ${stripLessonPrefix(lesson.title)} before discussion.`,
        anchorExamplePrompt:
          assessment.anchorExampleSet?.revisionPrompt ||
          `Compare a strong and partial ${lesson.studentArtifact} response before discussion closes.`,
        equityConsiderations:
          lesson.accessibilityPlan?.participationProtocol ||
          `Begin with two minutes of individual think time on ${lesson.studentArtifact}, allow written or spoken entry, invite quieter voices before a second comment from the same student, and provide sentence frames so students can cite ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)} evidence without rushing.`,
        guidelines: `${buildDiscussionGuidelinesForFormat(lesson, discussionProtocol)}${preference ? ` Preference profile: ${preference}.` : ''}`,
        tags: unique(['discussion', format, lesson.bloomsLevel, ...lesson.keyConcepts.slice(0, 4)], 8),
      };
    }),
  };
}

// v0.12.1: the activity slide's duration comes from the lesson's actual
// session plan (which varies by modality) instead of a hardcoded constant.
// Picks the longest practice-flavored segment, clamped to slide scale.
function activityMinutesFromSessionPlan(classSessionPlan) {
  const segments = Array.isArray(classSessionPlan?.segments) ? classSessionPlan.segments : [];
  const practice = segments
    .filter((segment) =>
      /practice|sprint|workshop|appl|rehears|drill|simulat|lab|studio|build/i.test(segment?.phase || ''),
    )
    .map((segment) => Number(segment?.minutes))
    .filter((minutes) => Number.isFinite(minutes) && minutes > 0);
  if (practice.length === 0) return null;
  return Math.max(6, Math.min(25, Math.max(...practice)));
}

function buildSlideDeckIrForLesson(blueprint, lesson, index) {
  const lens = blueprintLens(blueprint);
  const teachingMoves = lessonTeachingMoves(blueprint, lesson);
  const preference = featurePreference(blueprint, 'slideDecks');
  const phrase = slideDeckPhrase(blueprint, lesson);
  const previous = blueprint.lessons[index - 1];
  const next = blueprint.lessons[index + 1];
  const assessment =
    blueprint.assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) ||
    blueprint.assessments[index] ||
    {};
  const displayTitle = slideLessonTitle(lesson);
  const concept = primarySlideConcept(lesson);
  // v0.12.1: a slide must never cite the unresolved source placeholder —
  // "Instructor-provided course materials" shipped on 112 slides in the
  // v0.12 audit. With no real source, drop the citation clause instead.
  const hasRealSource = !/(?:instructor-provided\s+)?course materials(?:\s+and notes)?$/i.test(
    cleanText(slideSourceCue(lesson)),
  );
  const secondary = secondarySlideConcept(lesson, concept);
  const artifact = slideArtifact(lesson);
  const sourceCue = slideSourceCue(lesson);
  const successCriterion = slideSuccessCriterion(lesson);
  const modality = lesson.modalityDecode || buildLessonModalityDecode(blueprint.courseModalityProfile || {}, lesson);
  const artifactGenre = lesson.artifactGenre || {};
  const classSessionPlan = lesson.classSessionPlan || buildClassSessionPlan({ lesson, modalityDecode: modality });
  const sequenceArtifact = /\b(TBD|to be determined)\b/i.test(cleanText(lesson.studentArtifact))
    ? artifact
    : cleanText(lesson.studentArtifact, artifact);
  const sequenceCriterion = stripTerminalPunctuation(successCriterion);
  const objectiveOne =
    lesson.outcomes.find((outcome) => outcome && !/\b(TBD|to be determined)\b/i.test(outcome)) ||
    `Analyze ${concept} using course evidence and explain how it informs ${artifact}.`;
  const objectiveTwo =
    lesson.outcomes.find((outcome) => outcome !== objectiveOne && !/\b(TBD|to be determined)\b/i.test(outcome)) ||
    `Evaluate how ${secondary} evidence changes ${artifact}.`;
  const slides = [
    {
      type: 'title',
      title: displayTitle,
      bullets: [`${blueprint.courseName}: ${phrase.context}`, `Today students improve: ${artifact}`],
      minutes: 1,
      bloom: null,
      objective: null,
      activity: null,
    },
    {
      type: 'agenda',
      title: 'Session Plan',
      bullets: [
        hasRealSource ? `Frame ${concept} through ${sourceCue}.` : `Frame ${concept} with one inspectable example.`,
        `Model the evidence decision for ${artifact}.`,
        `Practice with ${concept}: ${teachingMoves.practiceMove}`,
        `Debrief against this criterion: ${successCriterion}`,
        next
          ? `Carry forward to ${primarySlideConcept(next)}.`
          : 'Carry forward to final synthesis and revision planning.',
      ],
      minutes: 2,
      bloom: null,
      objective: null,
      activity: null,
    },
    {
      type: 'objectives',
      title: 'Objectives',
      bullets: [objectiveOne, objectiveTwo, `Use feedback to improve ${lesson.studentArtifact}.`],
      minutes: 3,
      bloom: null,
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'bridge',
      title: `${sentenceCase(concept)} carries the evidence thread forward`,
      bullets: [
        previous
          ? `Last time: ${primarySlideConcept(previous)}`
          : `Last time: course goals and ${blueprint.courseName}`,
        `Today: ${phrase.decisionMove}`,
        next ? `Next: ${primarySlideConcept(next)}` : `Next: final synthesis and revision planning`,
      ],
      minutes: 4,
      bloom: 'Apply',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'keyTerm',
      title: `What counts as ${concept}?`,
      bullets: [
        `${concept}: a decision tool for ${artifact}.`,
        `Evidence cue: ${phrase.evidenceMove}.`,
        `Decision cue: ${phrase.decisionMove}.`,
      ],
      minutes: 5,
      bloom: 'Understand',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'content',
      title: `Evidence that can actually support ${artifact}`,
      bullets: [
        `${concept} focuses attention on evidence quality, not just topic coverage.`,
        `${secondary} helps students avoid unsupported claims in ${artifact}.`,
        successCriterion,
      ],
      minutes: 6,
      bloom: 'Analyze',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'example',
      title: `${sentenceCase(concept)} in a ${lens.exampleNoun}`,
      bullets: [
        hasRealSource ? `Start with a short scenario from ${sourceCue}.` : 'Start with a short, concrete scenario.',
        hasRealSource
          ? `Identify the ${concept} evidence students can actually inspect in ${sourceCue}.`
          : `Identify the ${concept} evidence students can actually inspect.`,
        `Key insight: the strongest answer explains why the evidence changes ${artifact}.`,
      ],
      minutes: 7,
      bloom: 'Analyze',
      objective: objectiveTwo,
      activity: null,
    },
    {
      type: 'activity',
      title: `${sentenceCase(modality.mode.replace(/-/g, ' '))}: revise one evidence move for ${artifact}`,
      // v0.12.1: signaturePractice and practiceMove both derive from the
      // modality routine — when they open with the same phrase, keep only
      // the move ("Annotated example. Annotated example: annotate…").
      bullets: [
        cleanText(sentenceCase(modality.signaturePractice)).slice(0, 24).toLowerCase() ===
        cleanText(teachingMoves.practiceMove).slice(0, 24).toLowerCase()
          ? teachingMoves.practiceMove
          : `${sentenceCase(modality.signaturePractice)}. ${teachingMoves.practiceMove}`,
        modality.evidenceRoutine,
        `${teachingMoves.feedbackMove} Debrief by naming the revision choice for ${artifact}.`,
      ],
      // v0.12.1: real practice timing from the lesson's session plan — the
      // hardcoded 10 printed "Duration: 10 min" on slide 8 of all 58 audited
      // decks, regardless of modality or session length.
      minutes: activityMinutesFromSessionPlan(classSessionPlan) || 10,
      bloom: 'Apply',
      objective: objectiveOne,
      activity: sentenceCase(modality.mode.replace(/-/g, ' ')),
    },
    {
      type: 'content',
      title: `Use ${secondary} to keep claims honest`,
      bullets: [
        `${secondary} asks students to state limits.`,
        `Limit language protects the credibility of ${artifact}.`,
        `Feedback on ${artifact} should point to the ${secondary} evidence gap, not only grammar.`,
      ],
      minutes: 6,
      bloom: 'Evaluate',
      objective: objectiveTwo,
      activity: null,
    },
    {
      type: 'discussion',
      title: `Which ${modality.mode} evidence choice holds up?`,
      bullets: [
        `Compare two evidence choices for ${artifact}.`,
        `Vote on the stronger choice and explain why.`,
        modality.feedbackRoutine,
      ],
      minutes: 8,
      bloom: 'Evaluate',
      objective: objectiveTwo,
      activity: 'Small Group Discussion',
    },
    {
      type: 'summary',
      title: `${sentenceCase(concept)} readiness check`,
      bullets: [
        `Can you now ${stripTerminalPunctuation(objectiveOne).toLowerCase()}?`,
        `Can you explain how ${concept} improves ${artifact}?`,
        `Can you name one feedback action for ${stripTerminalPunctuation(artifact)} before the next submission?`,
      ],
      minutes: 4,
      bloom: 'Evaluate',
      objective: objectiveOne,
      activity: null,
    },
    {
      type: 'closing',
      title: 'Carry Forward',
      bullets: [
        `Prepare or submit ${artifact}; timing is set by the instructor in the local LMS.`,
        next ? `Preview: ${primarySlideConcept(next)}.` : `Preview: portfolio synthesis and final reflection.`,
        `Use feedback from ${displayTitle} to strengthen the next artifact.`,
      ],
      minutes: 3,
      bloom: null,
      objective: null,
      activity: null,
    },
  ];
  overlayEnrichedSlideContent(slides, lesson);
  adjustDeckLengthForContent(slides, lesson);
  const slideMinutes = slides.reduce((sum, slide) => sum + Number(slide.minutes || 0), 0);
  const slideTimingFit = {
    slideMinutes,
    sessionMinutes: classSessionPlan.sessionMinutes,
    livePracticeMinutes: Math.max(0, classSessionPlan.sessionMinutes - slideMinutes),
    status: slideMinutes <= classSessionPlan.sessionMinutes ? 'fits-session-with-activity-time' : 'needs-timing-review',
  };

  return {
    id: lesson.id,
    lessonTitle: displayTitle,
    tags: unique(['slide deck', displayTitle, ...slideConceptCandidates(lesson), lens.domain], 8),
    sequenceGuide: {
      accessibilityStandards:
        `${lesson.accessibilityPlan?.representation || `${displayTitle} should offer spoken, written, and visual entry points around ${phrase.context}`}; ${lesson.accessibilityPlan?.participationProtocol || 'visuals include alt text, activity directions can be completed without color-only cues, and speaker notes identify how to support learners who need more processing time or text-first participation'}; ${lesson.accessibilityPlan?.accommodationReviewCue || ''}`.trim(),
      localReviewAction: lessonLocalReviewAction(lesson),
      cumulativeAssessmentMap: [
        `${displayTitle} prepares students for ${sequenceArtifact}; the deck moves from ${phrase.evidenceMove} to ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()}, while practice slides reinforce ${sequenceCriterion} and the ${artifactGenre.label || artifactGenre.genre || 'artifact'} quality focus before feedback carries into the next artifact.`,
        `${displayTitle} builds toward ${sequenceArtifact}: the deck opens with ${phrase.evidenceMove}, then ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()}; practice slides rehearse ${sequenceCriterion} so feedback transfers into the next artifact.`,
        `Across this deck, ${sequenceArtifact} stays the visible product for ${displayTitle}; slides progress from ${phrase.evidenceMove} toward ${stripTerminalPunctuation(phrase.decisionMove).toLowerCase()}, with ${sequenceCriterion} as the practice focus before the next artifact.`,
      ][(Number(lesson.lessonNumber) || 1) % 3],
      pacingBridge: `${lesson.pacing?.bridgeFrom || ''} ${lesson.pacing?.bridgeTo || ''}`.trim(),
      classSessionPlan,
      slideTimingFit,
      instructionalMoveGuide: teachingMoves,
      prerequisitePlan: lesson.prerequisitePlan,
      anchorExampleSet: assessment.anchorExampleSet || null,
      learningTransferPlan: lesson.learningTransferPlan,
      teachingIntent: lesson.teachingIntent,
      modalityFit: {
        courseModalityProfile: blueprint.courseModalityProfile,
        modalityCue: lesson.modalityCue,
        modalityDecode: modality,
      },
      artifactGenreFit: {
        artifactGenre,
        reviewProtocol: artifactGenre.reviewProtocol || '',
        commonFailure: artifactGenre.commonFailure || '',
        revisionMove: artifactGenre.revisionMove || '',
      },
      ...(preference ? { instructorPreference: preference } : {}),
    },
    sourceGrounding: lessonSourceGrounding(lesson, {
      sourceCue: lesson.evidencePlan?.sourceCue || '',
      evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
      totalStudentMinutes: lesson.workloadEstimate?.totalStudentMinutes || null,
      classSessionPlan,
      slideTimingFit,
      difficulty: lesson.difficultyProfile?.difficulty || '',
      cognitiveDemand: lesson.difficultyProfile?.cognitiveDemand || '',
      localReviewNeeded: lesson.missingSignals || [],
      anchorExampleSet: assessment.anchorExampleSet,
      learnerContextProfile: blueprint.learnerContextProfile,
      courseModalityProfile: blueprint.courseModalityProfile,
      ...(preference ? { instructorPreference: preference } : {}),
    }),
    slides,
  };
}

export function buildSlideDeckIntermediateRepresentation(blueprint) {
  return {
    version: 1,
    source: 'course-blueprint-slide-ir',
    decks: blueprint.lessons.map((lesson, index) => buildSlideDeckIrForLesson(blueprint, lesson, index)),
  };
}

function compileSlideDecks(blueprint) {
  const ir = buildSlideDeckIntermediateRepresentation(blueprint);
  const lens = blueprintLens(blueprint);
  // v0.12.1: the same genome concept can link in several lessons — the v0.12
  // audit found one "How Experts Think" body repeated verbatim across four
  // Micro lessons. Each expert routine / structural bridge renders once per
  // course, in the first lesson that earns it.
  const seenScaffolds = new Set();
  const seenBridges = new Set();
  return {
    decks: ir.decks.map((deck) => {
      const lesson = blueprint.lessons.find((item) => item.id === deck.id) || blueprint.lessons[0];
      const slides = deck.slides.map((slide, index) => {
        const visual = slideVisual(lesson, slide);
        // Enriched teaching slides keep their model-written assertion bullets
        // and explanatory notes verbatim; the display rewriter only shapes
        // compiler-template bullets.
        const isEnriched = slide.enrichmentSource === 'lesson-content-enrichment';
        const displayBullets = isEnriched ? slide.bullets : displayBulletsForSlide(slide, lesson);
        return {
          title: slide.title,
          type: slide.type,
          bullets: displayBullets,
          notes:
            isEnriched && slide.notes
              ? slide.notes
              : slideNotes({
                  lesson,
                  title: slide.title,
                  type: slide.type,
                  bullets: slide.bullets,
                  nextCue: deck.slides[index + 1]?.title,
                  lens,
                }),
          visual,
          activityType: slide.activity,
          timer: `${slide.minutes} min`,
          bloomsLevel: slide.bloom,
          objectiveLink: slide.objective,
          ...(isEnriched ? { enrichmentSource: slide.enrichmentSource } : {}),
        };
      });
      // CurriculumOS Layer 2: bring the expert reasoning routine for this
      // lesson's deep structure onto a lecture slide ("How Experts Think"),
      // not only the study guide (iteration 10). Modeling the thinking routine
      // aloud — making the invisible expert process visible — is the
      // metacognitive move that turns recall into understanding (A+ pedagogy at
      // the point of instruction). Number-safe; provenance tag never rendered.
      const reasoningScaffolds = Array.isArray(lesson.enrichment?.reasoningScaffolds)
        ? lesson.enrichment.reasoningScaffolds
        : [];
      for (const scaffold of reasoningScaffolds.slice(0, 1)) {
        const moves = (scaffold.moves || []).map((m) => String(m).trim()).filter(Boolean);
        if (moves.length < 2) continue;
        const scaffoldKey = `${scaffold.term}::${scaffold.archetypeName}`;
        if (seenScaffolds.has(scaffoldKey)) continue;
        seenScaffolds.add(scaffoldKey);
        const structure = String(scaffold.archetypeName || '').toLowerCase();
        slides.push({
          title: `How Experts Think: ${scaffold.term}`,
          type: 'content',
          bullets: [
            `Reason about ${scaffold.term} as ${structure} — the expert routine:`,
            ...moves.map((m) => `${m.charAt(0).toUpperCase()}${m.slice(1)}`),
          ],
          notes: `Model this routine aloud on a worked example before students try it: walk through "${moves.join('", then "')}". Naming the steps an expert runs — instead of only showing the answer — is what makes the thinking transferable.`,
          visual: null,
          activityType: 'worked example',
          timer: '4 min',
          bloomsLevel: 'Apply',
          objectiveLink: `Apply the expert reasoning routine for ${scaffold.term}`,
          enrichmentSource: 'archetype-reasoning',
        });
      }
      // CurriculumOS Layer 2: when this lesson bridges to a deep structure
      // taught earlier in the course, add a "Same Structure" slide so the
      // transfer is taught at the point of instruction, not just in the study
      // guide. Structural transfer is the highest-evidence teaching move; this
      // puts it on screen during the lecture.
      const structuralBridges = Array.isArray(lesson.enrichment?.structuralBridges)
        ? lesson.enrichment.structuralBridges
        : [];
      for (const bridge of structuralBridges.slice(0, 1)) {
        const pairBullets = (bridge.mappingPairs || [])
          .filter((pair) => pair.from && pair.to)
          .map((pair) => {
            const to = String(pair.to);
            return `${to.charAt(0).toUpperCase()}${to.slice(1)} ↔ ${pair.from}`;
          });
        if (pairBullets.length < 2) continue;
        const bridgeKey = `${bridge.fromTerm}::${bridge.toTerm}::${bridge.archetypeName}`;
        if (seenBridges.has(bridgeKey)) continue;
        seenBridges.add(bridgeKey);
        slides.push({
          title: `Same Structure: ${bridge.toTerm} and ${bridge.fromTerm}`,
          type: 'content',
          bullets: [
            `Both are instances of ${bridge.archetypeName.toLowerCase()} — the same deep structure in different disciplines.`,
            ...pairBullets,
          ],
          notes: `Draw the analogy explicitly: ${bridge.note} Ask students to predict one place where the analogy breaks down — naming the limit of a structural mapping deepens transfer.`,
          visual: null,
          activityType: 'discussion',
          timer: '4 min',
          bloomsLevel: 'Analyze',
          objectiveLink: `Transfer the structure of ${bridge.fromTerm} to ${bridge.toTerm}`,
          enrichmentSource: 'archetype-bridge',
        });
      }
      return {
        lessonTitle: deck.lessonTitle,
        totalSlides: slides.length,
        learningObjectives: unique(slides.map((slide) => slide.objectiveLink).filter(Boolean), 5),
        slides,
        slideDeckSequenceGuide: deck.sequenceGuide,
        slideTimingFit: deck.sequenceGuide?.slideTimingFit || null,
        sourceGrounding: deck.sourceGrounding,
        artifactGenre: lesson.artifactGenre,
        anchorExampleSet: deck.sequenceGuide?.anchorExampleSet || null,
        tags: deck.tags,
      };
    }),
  };
}

function compileCourseFaq(blueprint, config = {}) {
  const target = Math.max(3, Math.min(8, Number(config.questionsPerLesson) || 5));
  const lens = blueprintLens(blueprint);
  const builders = [
    (lesson) => ({
      q: `What should I focus on for ${lesson.title}?`,
      an: `Focus on ${lesson.keyConcepts.slice(0, 3).join(', ')}, then connect those ideas to ${stripTerminalPunctuation(lesson.studentArtifact)}. Strong work uses ${stripTerminalPunctuation(lesson.throughlineCase?.evidencePacket || lens.evidenceNoun)} and explains a decision or implication.`,
      ca: 'Concept Explanation',
      rc: lesson.keyConcepts.slice(0, 4),
      df: 'Basic',
    }),
    (lesson) => ({
      q: `How does ${stripLessonPrefix(lesson.title)} connect to graded work?`,
      an: `${lesson.title} prepares you for ${stripTerminalPunctuation(lesson.studentArtifact)}. Use the ${stripTerminalPunctuation(lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title))} success criteria as a checklist before submitting or discussing your work.`,
      ca: 'Assignment Clarification',
      rc: ['success criteria checklist', ...lesson.keyConcepts.slice(0, 2)],
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: `What does strong work on ${stripLessonPrefix(lesson.title)} look like?`,
      an: `Strong work on ${lesson.title}: ${joinCriteriaSentence(lesson.successCriteria)} It should be specific enough that another reader can see how ${lesson.throughlineCase?.projectName || lesson.title} evidence about ${lesson.keyConcepts[0] || stripLessonPrefix(lesson.title)} supports the decision. For this ${lesson.artifactGenre?.label || lesson.artifactGenre?.genre || 'artifact'}, also check: ${lesson.artifactGenre?.qualityFocus || 'evidence specificity and revision quality'}. Anchor contrast: ${stripTerminalPunctuation(lesson.assessmentAnchorExamples?.strongSample || 'compare strong and partial evidence examples before submitting')}.`,
      ca: 'Assessment Prep',
      rc: ['rubric criteria', 'anchor examples', ...lesson.keyConcepts.slice(0, 2)],
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: `Where should I ask questions about ${stripLessonPrefix(lesson.title)}?`,
      an: `Use the official course communication channel, office hours, peer discussion spaces, and ${lesson.title} support resources. Bring a specific question about ${stripTerminalPunctuation(lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title))}, one ${lens.evidenceNoun} point, or a draft section when asking for help.`,
      ca: 'Course Logistics',
      rc: [`${lesson.title} support`, 'office hours', 'course communication'],
      df: 'Basic',
    }),
    (lesson) => ({
      q: `What common mistake should I avoid in ${stripLessonPrefix(lesson.title)}?`,
      an: `Do not stop at summary. Explain how ${stripTerminalPunctuation(lesson.keyConcepts?.[0] || stripLessonPrefix(lesson.title))} works, what evidence supports it, and how it changes the artifact or decision.`,
      ca: 'Assessment Prep',
      rc: lesson.keyConcepts.slice(0, 4),
      df: 'Advanced',
    }),
    (lesson) => ({
      q: 'How should I use feedback from this lesson?',
      an: lesson.feedbackMoment,
      ca: 'Assignment Clarification',
      rc: ['feedback', 'revision', ...lesson.keyConcepts.slice(0, 2)],
      df: 'Intermediate',
    }),
    (lesson) => ({
      q: `What ${stripLessonPrefix(lesson.title)} materials should I review first?`,
      an: `Start with ${lesson.throughlineCase?.evidencePacket || lesson.readings[0] || 'the lesson packet'}, then review ${lesson.readings.slice(1, 3).join(' and ') || 'the assigned lesson materials'}. Compare your notes against the weekly success criteria.`,
      ca: 'Technical Help',
      rc: lesson.readings.slice(0, 3),
      df: 'Basic',
    }),
    (lesson) => ({
      q: `How can I check readiness for ${stripLessonPrefix(lesson.title)} before class or submission?`,
      an:
        lesson.prerequisitePlan?.diagnosticCheck ||
        `You are ready when you can define ${lesson.keyConcepts[0] || 'the main concept'}, cite lesson evidence, and explain one implication for ${stripTerminalPunctuation(lesson.studentArtifact)}.`,
      ca: 'Assessment Prep',
      rc: lesson.keyConcepts.slice(0, 4),
      df: 'Intermediate',
    }),
  ];

  return {
    faqGuide: {
      purpose: 'Student-facing support FAQ compiled from the shared course blueprint.',
      reviewGuidance: 'Review local dates, platform names, and instructor-specific policy details before publishing.',
      categories: FAQ_CATEGORIES,
      sourceGroundingPolicy:
        'Each lesson FAQ item includes blueprint confidence, source anchors, evidence plan, and local-review flags so support language remains traceable to the course map.',
    },
    faqs: blueprint.lessons.map((lesson, index) => {
      const assessment =
        blueprint.assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) ||
        blueprint.assessments[index] ||
        {};
      const lessonForFaq = {
        ...lesson,
        assessmentAnchorExamples: assessment.anchorExampleSet || null,
      };
      return {
        lt: lesson.title,
        tg: unique(['faq', lesson.title, ...lesson.keyConcepts], 10),
        sourceGrounding: lessonSourceGrounding(lesson, {
          evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
          artifactConnection: lesson.evidencePlan?.artifactConnection || '',
          anchorExampleSet: assessment.anchorExampleSet,
          learnerContextProfile: blueprint.learnerContextProfile,
          courseModalityProfile: blueprint.courseModalityProfile,
        }),
        learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
        modalityCue: lesson.modalityCue,
        modalityDecode: lesson.modalityDecode,
        artifactGenre: lesson.artifactGenre,
        prerequisitePlan: lesson.prerequisitePlan,
        anchorExampleSet: assessment.anchorExampleSet || null,
        teachingIntent: lesson.teachingIntent,
        qs: builders.slice(0, target).map((build) => build(lessonForFaq)),
      };
    }),
  };
}

function buildLessonPlanDurations(sessionMinutes = DEFAULT_CLASS_SESSION_MINUTES) {
  const base = [10, 15, 20, 25, 25];
  const used = base.reduce((sum, value) => sum + value, 0);
  return [...base, Math.max(10, sessionMinutes - used)];
}

function formatDuration(minutes) {
  return `${minutes} minutes`;
}

function buildLessonPlanMaterials(lesson) {
  return unique(
    [
      ...lesson.readings,
      'Course site agenda and lesson handout',
      'Shared notes or collaboration document',
      'Submission template for the weekly artifact',
    ],
    6,
  );
}

function buildLessonPlanOutline(blueprint, lesson) {
  const lens = blueprintLens(blueprint);
  const phrase = lessonPhrase(blueprint, lesson);
  const sessionSegments = Array.isArray(lesson.classSessionPlan?.segments) ? lesson.classSessionPlan.segments : [];
  const [warmUp, context, guided, collaborative, independent, debrief] =
    sessionSegments.length >= 6
      ? sessionSegments.slice(0, 6).map((segment) => Number(segment.minutes || 0))
      : buildLessonPlanDurations(lesson.classSessionPlan?.sessionMinutes || DEFAULT_CLASS_SESSION_MINUTES);
  const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
  const artifact = stripTerminalPunctuation(lesson.studentArtifact);
  const misconception = lesson.misconceptionMap?.[0];
  const evidencePlan = lesson.evidencePlan;
  const modality = lesson.modalityDecode || buildLessonModalityDecode(blueprint.courseModalityProfile || {}, lesson);
  // v0.13.3: kernel-aware teaching script — when this lesson carries authored
  // or genome-linked subject matter, the script teaches THAT content instead
  // of the generic process frame (the v0.13.1 live audit's weakest surface).
  const kernelPayload = lesson.enrichment || null;
  const kernelMisconception = (kernelPayload?.keyTerms || []).find((term) => term.misconception) || null;
  const kernelFact = (kernelPayload?.kernel?.facts || [])[0] || '';
  const kernelScenario = kernelPayload?.kernel?.scenario || null;
  const kernelWorkedExample = kernelPayload?.workedExample || null;

  return [
    {
      time: formatDuration(warmUp),
      activity: 'Warm-up retrieval and framing',
      type: 'Warm-up',
      description: kernelMisconception
        ? `Misconception poll: display “${stripTerminalPunctuation(kernelMisconception.misconception)}” and have students vote true or false, then defend the vote with one observation or example.`
        : `Students respond to a short prompt that asks them to ${phrase.decisionMove} using prior course evidence before the day’s lesson work begins.`,
      instructorNotes: kernelMisconception
        ? `Reveal the correction only after the vote: ${stripTerminalPunctuation(kernelMisconception.correction || `in fact, ${kernelMisconception.definition}`)}. Connect the discussion to ${lesson.outcomes[0]}.`
        : `Collect two fast examples about ${concept}, name the evidence move worth imitating, and connect the prompt to ${lesson.outcomes[0]}.`,
      instructorRole: `Facilitate retrieval, surface misconceptions about ${concept}, and set the purpose for ${stripLessonPrefix(lesson.title)}.`,
      grouping: 'Whole class, then quick pair share',
      bloomsLevel: 'Apply',
    },
    {
      time: formatDuration(context),
      activity: 'Model the weekly concept',
      type: 'Mini-lesson',
      description: kernelWorkedExample
        ? `Work the example step by step on the board: ${stripTerminalPunctuation(kernelWorkedExample.problem)}.`
        : kernelFact
          ? `Introduce ${concept} from its anchor fact — “${stripTerminalPunctuation(kernelFact)}” — and build the explanation students will reuse in ${artifact}.`
          : `Introduce ${concept} with a concise worked example that shows how ${lens.learnerRole}s ${phrase.evidenceMove}.`,
      instructorNotes: kernelWorkedExample
        ? `Solution path: ${kernelWorkedExample.steps.join(' → ')}. Result: ${kernelWorkedExample.result}. Have students annotate each step, then assign one variation with different numbers.`
        : `Keep the model concrete, point to ${evidencePlan?.sourceCue || 'one source cue'}, and show one line of reasoning students should reuse in ${artifact}.`,
      instructorRole: `Model thinking aloud and annotate the exemplar for ${concept}.`,
      grouping: 'Instructor model with guided notes',
      bloomsLevel: 'Understand',
    },
    {
      time: formatDuration(guided),
      activity: 'Guided analysis',
      type: sentenceCase(modality.mode.replace(/-/g, ' ')),
      description: kernelScenario?.setup
        ? `${stripTerminalPunctuation(kernelScenario.setup)}. Students identify which evidence, assumptions, and constraints matter most.`
        : `${sentenceCase(stripTerminalPunctuation(modality.signaturePractice))}. Students identify which evidence, assumptions, and constraints matter most for ${stripLessonPrefix(lesson.title)}.`,
      instructorNotes: `${stripTerminalPunctuation(modality.instructorMove)}; press for ${artifact} evidence about ${concept}. Watch for this misconception: ${misconception?.misconception || `students may use ${concept} without evidence`}.`,
      instructorRole: `Coach the ${modality.mode} evidence routine and press for specificity in ${artifact}.`,
      grouping: 'Pairs with instructor check-ins',
      bloomsLevel: 'Analyze',
    },
    {
      time: formatDuration(collaborative),
      activity: 'Collaborative application',
      type: 'Discussion',
      // v0.12.1: strip a leading "For <lesson>," from the routine variant —
      // after "use this routine:" it produced an "X … : For X," echo.
      description: `Teams apply ${concept} to a new scenario, compare options, and use this routine: ${stripTerminalPunctuation(cleanText(modality.evidenceRoutine)).replace(/^For [^,]{2,70},\s*/i, '')}.`,
      instructorNotes: `Require each group to cite at least one reading, example, or class note about ${concept} before they report out. ${modality.artifactCheck}`,
      instructorRole: `Moderate the ${stripLessonPrefix(lesson.title)} tradeoff discussion and calibrate ${artifact} against ${modality.studentProduct}.`,
      grouping: 'Small groups then share-out',
      bloomsLevel: 'Evaluate',
    },
    {
      time: formatDuration(independent),
      activity: 'Independent artifact sprint',
      type: 'Workshop',
      description: `Students draft ${artifact} while using the lesson success criteria, feedback prompts, and exemplar moves as a checklist.`,
      instructorNotes: `Conference with students who need support on ${artifact}; redirect them to the exact ${concept} criterion and this modality check: ${modality.artifactCheck}`,
      instructorRole: `Provide targeted feedback on ${artifact} and confirm readiness for submission.`,
      grouping: 'Independent work with spot coaching',
      bloomsLevel: lesson.bloomsLevel,
    },
    {
      time: formatDuration(debrief),
      activity: 'Debrief and exit ticket',
      type: 'Closure',
      description: `Students share one revision they made to ${artifact}, one question they still have about ${concept}, and one way today’s ${modality.mode} work prepares them for the next artifact.`,
      instructorNotes: `${stripTerminalPunctuation(modality.feedbackRoutine)}; ground the debrief in ${artifact} evidence about ${concept}. Use exit-ticket responses to decide whether the next lesson should review ${concept} before extending it.`,
      instructorRole: `Synthesize patterns from ${stripLessonPrefix(lesson.title)} and set up the next lesson.`,
      grouping: 'Whole class plus individual exit ticket',
      bloomsLevel: 'Evaluate',
    },
  ];
}

function compileLessonPlans(blueprint) {
  const lens = blueprintLens(blueprint);
  const preference = featurePreference(blueprint, 'lessonPlans');
  const compilerProofBundle = blueprint.compilerProofBundle || buildCompilerProofBundle(blueprint);
  return {
    lessonPlans: blueprint.lessons.map((lesson, index) => {
      const teachingMoves = lessonTeachingMoves(blueprint, lesson);
      const phrase = lessonPhrase(blueprint, lesson);
      const artifact = stripTerminalPunctuation(lesson.studentArtifact);
      const concept = lesson.keyConcepts[0] || stripLessonPrefix(lesson.title);
      const modality =
        lesson.modalityDecode || buildLessonModalityDecode(blueprint.courseModalityProfile || {}, lesson);
      const artifactGenre = lesson.artifactGenre || {};
      const materials = buildLessonPlanMaterials(lesson);
      const misconceptionMap = Array.isArray(lesson.misconceptionMap) ? lesson.misconceptionMap : [];
      const assessment =
        blueprint.assessments.find((item) => (item.lessonNumbers || []).includes(lesson.lessonNumber)) ||
        blueprint.assessments[index] ||
        {};
      const classSessionPlan = lesson.classSessionPlan || buildClassSessionPlan({ lesson, modalityDecode: modality });
      const outline = buildLessonPlanOutline(blueprint, { ...lesson, classSessionPlan });
      const outlineMinutes = outline.reduce((sum, item) => sum + (Number.parseInt(item.time, 10) || 0), 0);
      const dryRunRow =
        compilerProofBundle.classroomDryRunPlan?.lessonRows?.find((row) => row.lessonNumber === lesson.lessonNumber) ||
        {};
      const evidenceLoopRow =
        compilerProofBundle.classroomEvidenceLoopPlan?.lessonRows?.find(
          (row) => row.lessonNumber === lesson.lessonNumber,
        ) || {};
      const feedbackLoadRow =
        compilerProofBundle.instructorFeedbackLoadPlan?.lessonRows?.find(
          (row) => row.lessonNumber === lesson.lessonNumber,
        ) || {};

      return {
        lessonTitle: lesson.title,
        weekNumber: `Week ${lesson.lessonNumber}`,
        duration: `${classSessionPlan.sessionMinutes} minutes`,
        blueprintGrounding: lessonSourceGrounding(lesson, {
          pacing: lesson.pacing,
          assessmentValidity: assessment.validityEvidence,
          gradingCalibrationPlan: assessment.calibrationPlan,
          criterionEvidenceMap: assessment.criterionEvidenceMap,
          criterionObjectiveAlignment: assessment.criterionObjectiveAlignment,
          anchorExampleSet: assessment.anchorExampleSet,
          learnerContextProfile: blueprint.learnerContextProfile,
          courseModalityProfile: blueprint.courseModalityProfile,
          learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
          ...(preference ? { instructorPreference: preference } : {}),
        }),
        workloadEstimate: compactWorkloadEstimate(lesson.workloadEstimate),
        classSessionPlan,
        classroomDryRun: dryRunRow,
        classroomEvidenceLoop: evidenceLoopRow,
        instructorFeedbackLoad: feedbackLoadRow,
        outlineTiming: {
          sessionMinutes: classSessionPlan.sessionMinutes,
          plannedClassMinutes: classSessionPlan.plannedClassMinutes,
          outlineMinutes,
          status:
            outlineMinutes <= classSessionPlan.sessionMinutes && outlineMinutes === classSessionPlan.plannedClassMinutes
              ? 'fits-session'
              : 'needs-timing-review',
        },
        difficultyProfile: lesson.difficultyProfile,
        instructionalRationale: lesson.instructionalRationale,
        // v0.13.5 P3: "why this works" — each teaching move in this plan
        // cites its learning-science research base.
        evidenceBase: buildLessonEvidenceBase(lesson),
        sourceUsePlan: lesson.sourceUsePlan,
        accessibilityPlan: lesson.accessibilityPlan,
        feedbackCycle: lesson.feedbackCycle,
        learningTransferPlan: lesson.learningTransferPlan,
        prerequisitePlan: lesson.prerequisitePlan,
        conceptDependencyPlan: lesson.conceptDependencyPlan,
        practiceProgressionPlan: lesson.practiceProgressionPlan,
        masteryEvidencePlan: lesson.masteryEvidencePlan,
        evidenceResponsePlan: lesson.evidenceResponsePlan,
        teachingIntent: lesson.teachingIntent,
        instructionalMoveGuide: teachingMoves,
        modalityCue: lesson.modalityCue,
        modalityDecode: modality,
        artifactGenre: lesson.artifactGenre,
        courseModalityProfile: blueprint.courseModalityProfile,
        studentFacingSummary: {
          beforeClass: `Review ${materials[0]} and arrive ready to ${phrase.evidenceMove}.`,
          duringClass: `Use class discussion and practice time to ${phrase.decisionMove} with peers before drafting your own response.`,
          afterClass:
            lesson.feedbackCycle?.studentRevisionAction ||
            `Revise your work using the feedback notes and submit the final ${artifact}.`,
          submittedArtifact: artifact,
        },
        artifactLength: `One focused ${stripLessonPrefix(lesson.title)} artifact, usually 350-500 words or an equivalent applied format that demonstrates ${concept}. Artifact genre format: ${artifactGenre.outputFormat || 'course-specific applied artifact with evidence and revision trace'}.`,
        prerequisiteKnowledge:
          lesson.prerequisitePlan?.prerequisiteEvidence ||
          `Students should know the core terms from earlier course materials and be ready to connect them to ${stripLessonPrefix(lesson.title)}.`,
        commonMisconceptions:
          misconceptionMap.length > 0
            ? misconceptionMap.map((item) => `${item.misconception} ${item.correction}`)
            : [
                `Treating ${concept} as summary work instead of a decision-making process.`,
                `Listing evidence without explaining why it matters for ${artifact}.`,
                `Using generic claims instead of course-specific examples or criteria for ${concept}.`,
              ],
        weeklySubmissionCriteria:
          `Submit ${artifact} with concrete evidence, a clear claim or recommendation, and one explicit revision move based on feedback. ${artifactGenre.evidenceRequirement || ''} Quality focus: ${artifactGenre.qualityFocus || 'concept accuracy, evidence specificity, decision logic, and revision quality'}.`.trim(),
        localCaseReplacementNote: `If the named case for ${stripLessonPrefix(lesson.title)} is not locally relevant, replace it with a comparable ${lens.exampleNoun} that still requires students to use evidence about ${concept} and defend the same decision moves.`,
        assessmentCriteria: lesson.successCriteria,
        calibrationCue:
          `${assessment.calibrationPlan?.scorerNorming || `Before collecting work, compare two sample responses and name what makes the stronger ${artifact} more defensible.`} ${assessment.calibrationPlan?.biasCheck || ''}${preference ? ` Preference profile: ${preference}.` : ''}`.trim(),
        bloomsLevels: unique(
          ['Remember', 'Understand', 'Apply', 'Analyze', lesson.bloomsLevel, 'Evaluate', 'Create'],
          6,
        ),
        objectives: lesson.outcomes,
        objectiveEvidenceChecklist: objectiveEvidenceChecklist(lesson.objectiveEvidencePlan),
        materials,
        warmUp: {
          duration: '10 minutes',
          type: 'Retrieval and framing',
          prompt:
            lesson.prerequisitePlan?.diagnosticCheck ||
            lesson.learningTransferPlan?.retrievalCue ||
            `What evidence best helps you ${stripTerminalPunctuation(phrase.decisionMove)}?`,
          purpose: `Activate prior knowledge and focus students on the central ${concept} decision.`,
          facilitation: `${teachingMoves.openingMove} Then name the quality cue students should carry into ${artifact}.`,
        },
        outline,
        // v0.13.3: the quantitative walkthrough the mini-lesson references —
        // authored once (genome exemplar or kernel call), rendered in full.
        ...(lesson.enrichment?.workedExample ? { workedExample: lesson.enrichment.workedExample } : {}),
        // v0.13.3 G6: signature pedagogy — when the course promises sky
        // observation, every lesson plan carries the concrete protocol.
        ...(() => {
          const observationProtocol = buildObservationProtocol({
            courseName: blueprint.courseName,
            lessons: blueprint.lessons,
            lesson,
          });
          return observationProtocol ? { observationProtocol } : {};
        })(),
        formativeCheck: {
          type: 'Formative exit ticket',
          prompt:
            lesson.feedbackCycle?.formativeEvidence ||
            lesson.readinessSupport?.diagnosticPrompt ||
            `State one claim from ${stripLessonPrefix(lesson.title)} and cite the evidence that makes it credible.`,
          objectiveAligned: lesson.outcomes[0],
          instructorAction:
            `${lesson.feedbackCycle?.feedbackMethod || ''} ` +
            `${lesson.readinessSupport?.groupingCue || `Sort ${stripLessonPrefix(lesson.title)} responses into ready, partial, and needs-support groups before new content begins.`} ` +
            `Success criteria for ${stripLessonPrefix(lesson.title)}: accurate concept use, specific evidence, and clear reasoning with one concrete example. ${teachingMoves.feedbackMove}`,
        },
        udlNotes: {
          representation:
            lesson.accessibilityPlan?.representation ||
            `Provide the concept model in text, spoken explanation, and one visual organizer tied to ${concept}.`,
          engagement:
            lesson.accessibilityPlan?.engagement ||
            `Offer a choice between speaking, annotating, or drafting in writing during the ${stripLessonPrefix(lesson.title)} collaborative application task.`,
          expression:
            lesson.accessibilityPlan?.expression ||
            `Allow students to show ${artifact} progress through a memo, slide, table, or annotated outline when the same criteria are met.`,
        },
        homework: {
          title: artifact,
          description:
            lesson.feedbackCycle?.closureCheck ||
            `Complete ${artifact}, use the lesson criteria as a checklist, and add one note explaining how feedback changed your draft.`,
          estimatedTime: `${lesson.workloadEstimate.afterClassMinutes} minutes`,
          connectionToNext:
            lesson.learningTransferPlan?.transferTask ||
            lesson.feedbackCycle?.nextUse ||
            `Bring your submitted work forward so the next lesson can build on today’s ${concept} reasoning.`,
        },
        closingActivity: `Close by having students name one strong evidence move from today and one revision they still need before ${artifact} is fully ready.`,
        tags: unique(['lesson-plan', lesson.title, concept, lens.domain, ...lesson.keyConcepts], 10),
        readyToTeachSupport: {
          localReviewAction: lessonLocalReviewAction(lesson),
          dryRunChecklist: dryRunRow.setupChecks || [],
          dryRunOpeningCheck: dryRunRow.firstTenMinutes || '',
          dryRunEvidenceCheckpoint: dryRunRow.evidenceCheckpoint || '',
          dryRunFailureMode: dryRunRow.likelyFailureMode || '',
          dryRunAdjustmentTrigger: dryRunRow.adjustmentTrigger || '',
          dryRunInstructorAdjustment: dryRunRow.instructorAdjustment || '',
          implementationEvidenceToCollect: evidenceLoopRow.evidenceToCollect || [],
          implementationStudentWorkSampleCue: evidenceLoopRow.studentWorkSampleCue || '',
          implementationAdjustmentDecision: evidenceLoopRow.adjustmentDecision || '',
          implementationNextLessonFeedForward: evidenceLoopRow.nextLessonFeedForward || '',
          implementationPreferenceLearningSignal: evidenceLoopRow.preferenceLearningSignal || '',
          feedbackLoadEstimate: feedbackLoadRow.estimatedFeedbackMinutes
            ? `${feedbackLoadRow.estimatedFeedbackMinutes} minutes per ${feedbackLoadRow.assessmentTitle || artifact}`
            : '',
          feedbackBatchingStrategy: feedbackLoadRow.batchingStrategy || '',
          feedbackCalibrationCue: feedbackLoadRow.calibrationCue || '',
          feedbackHighestLeverageCriterion: feedbackLoadRow.highestLeverageCriterion || '',
          feedbackNextInstructionCue: feedbackLoadRow.nextInstructionCue || '',
          workedExample:
            lesson.modelContrast?.exemplarMove ||
            `Show a brief exemplar for ${artifact} and annotate where the evidence, reasoning, and revision move appear.`,
          nonExample:
            lesson.modelContrast?.nonExemplarMove ||
            `Contrast the exemplar with a weak ${artifact} that summarizes the topic without evidence or revision logic.`,
          contrastQuestion:
            lesson.modelContrast?.contrastQuestion ||
            `Ask students what makes the stronger ${artifact} more defensible than the weaker version.`,
          transferPrompt:
            lesson.modelContrast?.transferPrompt ||
            `Have students revise one line of ${artifact} using the stronger evidence move.`,
          targetedSupport:
            lesson.readinessSupport?.supportMove ||
            `Give students who need support a sentence frame and one annotated evidence source before they continue ${artifact}.`,
          extensionChallenge:
            lesson.readinessSupport?.extensionMove ||
            `Ask ready students to compare two evidence choices and justify which one strengthens ${artifact}.`,
          feedbackProtocol:
            lesson.feedbackCycle?.feedbackMethod ||
            `Give criterion-level feedback and ask students to revise one evidence move in ${artifact}.`,
          revisionClosure:
            lesson.feedbackCycle?.closureCheck ||
            `Students name one feedback-based revision before leaving ${stripLessonPrefix(lesson.title)}.`,
          retrievalPractice:
            lesson.learningTransferPlan?.spacedPracticeCue ||
            `Revisit ${concept} in a low-stakes question before the next artifact.`,
          prerequisiteDiagnostic:
            lesson.prerequisitePlan?.diagnosticCheck ||
            `Check whether students can connect prior course knowledge to ${stripLessonPrefix(lesson.title)} before new instruction begins.`,
          prerequisiteReteach:
            lesson.prerequisitePlan?.reteachMove ||
            `Reteach the prior concept with one worked example before students continue ${artifact}.`,
          prerequisiteAcceleration:
            lesson.prerequisitePlan?.accelerationMove ||
            `Ask ready students to compare how prerequisite knowledge changes the next ${artifact} decision.`,
          prerequisiteLocalReview:
            lesson.prerequisitePlan?.localAssumptionReview ||
            `Confirm the prerequisite materials and tools are available before publishing ${stripLessonPrefix(lesson.title)}.`,
          conceptDependencyCue:
            lesson.conceptDependencyPlan?.dependencyCue ||
            `Check the prior concept before students begin ${stripLessonPrefix(lesson.title)}.`,
          conceptTransferCue:
            lesson.conceptDependencyPlan?.transferCue || `Name where ${concept} will be reused after this lesson.`,
          practiceProgressionCue:
            lesson.practiceProgressionPlan?.practiceFocus ||
            `Make the ${concept} practice move visible before feedback.`,
          practiceProgressionReviewerCue:
            lesson.practiceProgressionPlan?.reviewerCue ||
            `Confirm the lesson builds from prior knowledge, visible practice, feedback, and transfer.`,
          objectiveEvidenceCheck:
            lesson.objectiveEvidencePlan?.policy ||
            `Confirm each objective is visible in practice, assessment, scoring, quiz/check evidence, feedback, and revision for ${artifact}.`,
          masteryDiagnosticEvidence:
            lesson.masteryEvidencePlan?.diagnosticEvidence ||
            `Check whether students can explain ${concept} before new instruction begins.`,
          masteryGuidedPracticeEvidence:
            lesson.masteryEvidencePlan?.guidedPracticeEvidence ||
            `Look for visible guided-practice evidence before independent ${artifact} work.`,
          masteryPerformanceEvidence:
            lesson.masteryEvidencePlan?.independentPerformanceEvidence ||
            `Use ${artifact} as the independent performance evidence for ${concept}.`,
          masteryRevisionEvidence:
            lesson.masteryEvidencePlan?.feedbackRevisionEvidence ||
            `Require a feedback-based revision before treating ${artifact} as complete.`,
          masteryTransferEvidence:
            lesson.masteryEvidencePlan?.transferEvidence ||
            `Ask students to transfer one ${concept} move to later course work.`,
          masteryThreshold:
            lesson.masteryEvidencePlan?.masteryThreshold ||
            `Ready work cites evidence, explains the decision, and shows revision in ${artifact}.`,
          evidenceReadyResponse:
            lesson.evidenceResponsePlan?.readyMove ||
            `Extend ready work by asking students to compare two evidence choices for ${artifact}.`,
          evidencePartialResponse:
            lesson.evidenceResponsePlan?.partialMove ||
            `Give criterion-level feedback and ask students to revise one evidence link in ${artifact}.`,
          evidenceSupportResponse:
            lesson.evidenceResponsePlan?.supportMove ||
            `Reteach ${concept} with a worked evidence sentence before students continue ${artifact}.`,
          evidenceResponseRecheck:
            lesson.evidenceResponsePlan?.recheckCue ||
            `Recheck ${artifact} after students revise the evidence decision.`,
          transferTask:
            lesson.learningTransferPlan?.transferTask ||
            `Carry one ${concept} evidence move into the next course artifact.`,
          modalityFit:
            lesson.modalityCue ||
            `Run ${stripLessonPrefix(lesson.title)} as ${blueprint.courseModalityProfile?.primaryMode || 'an applied session'} with participation matched to the course environment.`,
          modalityPractice: modality.signaturePractice,
          modalityEvidenceRoutine: modality.evidenceRoutine,
          modalityFeedbackRoutine: modality.feedbackRoutine,
          modalityInstructorMove: modality.instructorMove,
          timingFit: `${classSessionPlan.plannedClassMinutes}/${classSessionPlan.sessionMinutes} live minutes across ${classSessionPlan.segmentCount} phases; ${classSessionPlan.studentWorkloadFit?.status || 'workload review pending'}.`,
          artifactGenreFit:
            artifactGenre.modalityFit ||
            `Review ${artifact} as a course-specific artifact, not as a generic submission.`,
          genreReviewProtocol:
            artifactGenre.reviewProtocol ||
            `Check ${artifact} against the genre expectations and success criteria before final feedback.`,
          genreCommonFailure:
            artifactGenre.commonFailure ||
            `Students may complete the format without making the evidence decision inspectable.`,
          genreRevisionMove:
            artifactGenre.revisionMove ||
            `Ask students to revise ${artifact} by strengthening one ${concept} evidence link.`,
          teachingIntentSummary:
            lesson.teachingIntent?.teachingGoal ||
            `Teach ${stripLessonPrefix(lesson.title)} as evidence-backed ${concept} decision practice for ${artifact}.`,
          gradingCalibration:
            assessment.calibrationPlan?.studentTransparency ||
            `Share criteria and anchor examples before students submit ${artifact}.`,
          criterionEvidencePrompt:
            assessment.criterionEvidenceMap?.[0]?.evidenceNeeded ||
            `Ask students to point to criterion-specific evidence before submitting ${artifact}.`,
          assessmentAnchorExamples: assessment.anchorExampleSet || null,
          anchorExampleStrong:
            assessment.anchorExampleSet?.strongSample ||
            `Show a strong ${artifact} sample with inspectable evidence and a clear decision.`,
          anchorExamplePartial:
            assessment.anchorExampleSet?.partialSample ||
            `Show a partial ${artifact} sample that summarizes without enough evidence.`,
          anchorExampleRevision:
            assessment.anchorExampleSet?.revisionPrompt ||
            `Ask students to revise the partial sample before drafting their own ${artifact}.`,
          sourceIntegrityCheck:
            lesson.sourceUsePlan?.noInventedSources ||
            `Confirm students use only approved sources and flag missing citation details for local review.`,
          learnerContextCue: lessonLearnerContextCue(blueprint, lesson),
          methodSpecificMiniRubric: `Mini-rubric: Score ${artifact} for concept accuracy, evidence quality, reasoning strength, and feedback-informed revision.`,
          studentHandout: `One-page guide with the lesson objective, success criteria, outline, and submission checklist for ${stripLessonPrefix(lesson.title)}.`,
          instructorPrep: `Prepare the exemplar, one misconception check, and one targeted feedback prompt before teaching ${stripLessonPrefix(lesson.title)}.${preference ? ` Apply learned instructor preferences: ${preference}.` : ''}`,
          accessibilityAndUDL:
            lesson.accessibilityPlan?.accommodationReviewCue ||
            `Keep the ${stripLessonPrefix(lesson.title)} directions chunked, provide plain-language criteria, and let students choose an equivalent response format that still demonstrates ${concept}.`,
        },
      };
    }),
  };
}

export function compileBlueprintDeliverable(featureId, blueprint, options = {}) {
  const compilerBlueprint = options.skipPrepareBlueprint
    ? blueprint
    : prepareBlueprintForCompilation(blueprint, options);
  if (!options.skipCompilerContractCheck) {
    assertBlueprintCompilerContract(compilerBlueprint, options);
  }
  const compiled = compileBlueprintDeliverableRaw(featureId, compilerBlueprint, options);
  if (!compiled || options.skipLanguageFinalizer) return compiled;
  return finalizeCompiledDeliverableLanguage(featureId, compiled, compilerBlueprint);
}

function compileBlueprintDeliverableRaw(featureId, compilerBlueprint, options = {}) {
  if (featureId?.startsWith('custom_')) {
    const templateKind = getCompiledCustomTemplateKind(featureId, options);
    if (templateKind === 'reflection-check-in') {
      return compileCustomReflectionDeliverable(featureId, compilerBlueprint, options);
    }
    if (templateKind === 'reading-response') {
      return compileCustomReadingResponseDeliverable(featureId, compilerBlueprint, options);
    }
    const structuredCustom = compileStructuredCustomDeliverable(featureId, compilerBlueprint, options);
    if (structuredCustom) return structuredCustom;
    return null;
  }
  switch (featureId) {
    case 'syllabus':
      return compileSyllabus(compilerBlueprint, options);
    case 'lessonPlans':
      return compileLessonPlans(compilerBlueprint, options);
    case 'slideDecks':
      return compileSlideDecks(compilerBlueprint, options.configMap?.slideDecks || {});
    case 'assignments':
      return compileAssignments(compilerBlueprint, options);
    case 'rubrics':
      return compileRubrics(compilerBlueprint, options);
    case 'discussions':
      return compileDiscussions(compilerBlueprint, options);
    case 'quizBank':
      return compileQuizBank(compilerBlueprint, options.configMap?.quizBank || {});
    case 'studyGuides':
      return compileStudyGuides(compilerBlueprint, options);
    case 'courseFaq':
      return compileCourseFaq(compilerBlueprint, options.configMap?.courseFaq || {});
    default:
      return null;
  }
}

export function compileBlueprintDeliverables(blueprint, featureIds = [], options = {}) {
  const compilerBlueprint = prepareBlueprintForCompilation(blueprint, options);
  assertBlueprintCompilerContract(compilerBlueprint, options);
  const result = {};
  for (const featureId of getBlueprintCompiledFeatures(featureIds, options)) {
    const data = compileBlueprintDeliverable(featureId, compilerBlueprint, {
      ...options,
      skipCompilerContractCheck: true,
      skipPrepareBlueprint: true,
    });
    if (data) result[featureId] = data;
  }
  return result;
}
