import { isMusicIntervalWeakSource } from '../knowledge/musicSourceRelevance.js';

function rows(manifest) {
  return Array.isArray(manifest?.sourceLedger) ? manifest.sourceLedger : [];
}

function reviewRows(manifest) {
  return Array.isArray(manifest?.sourceReviewRows) ? manifest.sourceReviewRows : [];
}

function hasRef(row) {
  return /^https?:\/\//i.test(String(row?.url || '')) || /\S/.test(String(row?.doi || ''));
}

function hasMalformedUrl(row) {
  const url = String(row?.url || '').trim();
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return true;
  if (/\s|[<>"{}|\\^`]/.test(url)) return true;
  const opens = (url.match(/\(/g) || []).length;
  const closes = (url.match(/\)/g) || []).length;
  return opens !== closes;
}

const TRUST_ELIGIBLE_PROVIDERS = new Set([
  'genome',
  'genome-prerequisite',
  'openalex',
  'openstax',
  'open-music-theory',
  'gutenberg',
  'eric',
  'source-finder',
  'crossref',
  'doaj',
  'europe-pmc',
  'wikipedia',
  'w3c-wai',
]);

const REVIEW_ONLY_PROVIDERS = new Set(['courseir', 'instructor', 'instructor-provided', 'openlibrary']);
const RESTRICTED_RIGHTS_STATEMENT_RE = /rightsstatements\.org\/vocab\/inc(?:[-/]|$)/i;
const PUBLISHER_POLICY_LICENSE_RE =
  /(?:\/tdm(?:[_/-]|$)|\btdm(?:[_-]?license)?\b|text[-\s]?and[-\s]?data[-\s]?mining|policy-029|springernature\.com\/gp\/researchers\/text-and-data-mining|elsevier\.com\/tdm|sagepub\.com\/page\/policies\/text-and-data-mining-license|doi\.wiley\.com\/10\.1002\/tdm_license)/i;

const PROJECT_MANAGEMENT_COURSE_RE =
  /\b(?:project\s+management|project\s+manager|pmbok|project\s+charter|scope\s+management|work\s+breakdown|critical\s+path|risk\s+register|stakeholder\s+analysis|project\s+scheduling|project\s+life\s+cycle)\b/i;
const PROJECT_MANAGEMENT_SOURCE_ANCHOR_RE =
  /\b(?:project\s+management|project\s+manager|pmbok|project\s+charter|scope\s+management|work\s+breakdown|critical\s+path|risk\s+register|project\s+risk|project\s+controls|project\s+scheduling|earned\s+value|agile|scrum|kanban|project\s+governance|project\s+life\s+cycle|resource\s+planning|procurement\s+management|deliverable\s+acceptance|portfolio\s+management|construction\s+project|software\s+project)\b/i;
const PROJECT_MANAGEMENT_FALSE_FRIEND_RE =
  /\b(?:audit\s+quality|auditor\s+independence|audit\s+firm|financial\s+reporting|financial\s+statements?|earnings\s+management|external\s+audit|internal\s+audit|accounting\s+audit)\b/i;
const USER_EXPERIENCE_COURSE_RE =
  /\b(?:user\s+experience|ux\b|human[-\s]?centered\s+design|interaction\s+design|interface\s+design|usability|design\s+studio)\b/i;
const USER_EXPERIENCE_SOURCE_ANCHOR_RE =
  /\b(?:user[-\s]+experience|ux\b|human[-\s]?centered\s+design|user[-\s]?centered\s+design|human[-\s]?computer\s+interaction|human[-\s]?ai\s+interaction|hci\b|hai\b|user\s+interfaces?|interface\s+design|usability|design\s+research|user\s+research|contextual\s+inquiry|field\s*notes?|fieldnotes?|field\s+research|personas?\b(?!\s*5)|journey\s+maps?|customer\s+journey|information\s+architecture|wirefram|prototype|prototyping|iterative\s+design|interaction\s+design|accessibility|inclusive\s+design|design\s+rationale|design\s+handoff|design\s+studio|co[-\s]?design|service\s+design|material\s+experience|design\s+patterns?|screen\s+flows?|navigation|portfolio\s+case\s+study|critique\s+session|a\/b\s+test(?:ing)?)\b/i;
const USER_EXPERIENCE_FALSE_FRIEND_RE =
  /(?:\bstudio\s+ghibli\b|\bspiritual\s+practice\b|\bstrategic\s+planning\b|\bchuck\s+swindoll\b|\bpre[-\s]?service\s+teachers?\b|\bteacher\s+education\b|\bprototype\s+\(video\s+game\)|\bprototype\s+\(star\s+trek:\s*voyager\)|\bstar\s+trek:\s*voyager\b|\bscience\s+fiction\s+television\s+series\b|\baction[-\s]?adventure\s+video\s+game\b|\bradical\s+entertainment\b|\bactivision\b|\bplaystation\b|\bxbox\b|\bone\s+prototype\s+three\s+prototype\s+five\s+prototype\s+seven\s+prototype\b|\bprototype[-\s]?based\s+programming\b|\bprototype[-\s]?oriented\s+programming\b|\bprototypal\s+inheritance\b|\bclassless\s+programming\b|\bobject[-\s]?oriented\s+programming\b|\bmercator\s+projection\b|\bmap\s+projection\b|\bcylindrical\s+map\s+projection\b|\brhumb\s+lines?\b|\bmechatronics\b|\bmachine\s+design\b|\bmanufacturing\b|\bdata\s+refinement\b|\bfailures[-\s]?divergences\s+refinement\b|\bvehicle\s+refinement\b|\bautomotive\s+engineering\b|\bpositive\s+feedback\b|\bnegative\s+feedback\b|\bclimate\s+change\s+feedbacks?\b|\bpersona\s+\d+(?:\s+(?:golden|revival))?\b|\bpersona\s+\(series\)|\brevelations:\s*persona\b|\bmegami\s+tensei\b|\batlus\b|\bp[-\s]?studio\b|\brole[-\s]?playing\s+video\s+game\b|\btim\s+minchin\b|\bpublic\s+persona\b|\bcelebrity\b|\bnetwork\s+of\s+enterprises?\b|\bbrief\s+interviews\s+with\s+hideous\s+men\b|\bsketches\s+of\s+spain\b|\bmiles\s+davis\b|\bstudio\s+album\b|\bjazz\s+musician\b|\bconcierto\s+de\s+aranjuez\b|\ble\s+po[eè]me\b|\bpo[eè]me\b|\bpoetry\b|\bmarxisms?\b|\bcritique\s+&\s+struggle\b|\bcritique\s+of\s+pure\s+reason\b|\bimmanuel\s+kant\b|\bmetaphysics\b|\bfamily\s+mediation\b|\bprivate\s+sessions?\s+in\s+family\s+mediation\b|\bmediators?\b|\bdisputants?\b|\bbehavior\s+therapy\b|\bbooster\s+maintenance\s+sessions?\b|\bmetropolitan\s+transportation\s+authority\b|\bdesign\s+research\s+\(store\)|\blifestyle\s+store\b|\baircraft\s+design\s+process\b|\bprocess\s+design\s+and\s+process\s+control\b|\bifac\s+workshop\b|\bshoe\s+production\s+facilities\b|\bblocplan\b|\bsystematic\s+layout\s+planning\b|\blayout\s+of\s+shoe\s+production\b|\blayout\s+editor\s+configuration\b|\bmetaverse\s+beyond\s+the\s+hype\b|\bpatterns\s+2\.0\b|\blead[-\s]?user\s+theory\b|\bcommercially\s+attractive\s+user\s+innovations\b|\bweb\s+gis\s+in\s+practice\b|\bmicrosoft\s+kinect\b|\bintralogistics\s+processes\b|\bgreen\s+studio\s+handbook\b|\benvironmental\s+strategies\s+for\s+schematic\s+design\b|\bnational\s+design\s+studio\b|\ble\s+mans\s+prototype\b|\bin\s+living\s+color\s+sketches\b|\bsketch\s+comedy\b|\bcomedy\s+sketch(?:es)?\b|\btelevision\s+sketch(?:es)?\b|\barchitectural\s+education\b|\bcollaborative\s+learning\s+in\s+architectur(?:e|al)\b)/i;
const USER_EXPERIENCE_TOPIC_ANCHORS = [
  {
    concept: /\b(?:design\s+process|critique\s+sessions?|design\s+journals?|studio\s+workflow)\b/i,
    source:
      /\b(?:material\s+driven\s+design|design\s+process|design\s+studio|critique|design\s+journals?|studio\s+workflow|service\s+design|co[-\s]?design)\b/i,
  },
  {
    concept:
      /\b(?:interviews?|observations?|synthesis|contextual\s+inquiry|field\s*notes?|fieldnotes?|field\s+research)\b/i,
    source:
      /\b(?:user\s+research|user\s+interviews?|research\s+interviews?|qualitative\s+interviews?|contextual\s+inquiry|field\s*notes?|fieldnotes?|field\s+research|observational\s+research|affinity\s+mapping|thematic\s+synthesis)\b/i,
  },
  {
    concept: /\b(?:personas?|journey\s+maps?|design\s+questions?)\b/i,
    source:
      /\b(?:personas?\b(?!\s*(?:series|5))|journey\s+maps?|customer\s+journey|user\s+needs?|design\s+questions?)\b/i,
  },
  {
    concept: /\b(?:information\s+architecture|sketches|low[-\s]?fidelity\s+layouts?)\b/i,
    source: /\b(?:information\s+architecture|wirefram|low[-\s]?fidelity|sketch(?:es|ing)?|sitemap|content\s+model)\b/i,
  },
  {
    concept: /\b(?:navigation|components?|screen\s+flow)\b/i,
    source:
      /\b(?:navigation|screen\s+flow|user\s+interface|interaction\s+design|mobile\s+screens?|interface\s+adaptation|design\s+patterns?)\b/i,
  },
  {
    concept: /\b(?:clickable\s+prototypes?|tool\s+workflows?|iteration)\b/i,
    source:
      /\b(?:clickable\s+prototypes?|functional\s+prototypes?|prototyp|tool\s+workflow|usability\s+testing|(?:design|prototype|usability|critique|feedback|studio|ux|user[-\s]?experience|interface|interaction)[-\s]+iterat(?:ion|ive)|iterat(?:ion|ive)[-\s]+(?:design|prototype|usability|critique|feedback|studio|ux|user[-\s]?experience|interface|interaction))\b/i,
  },
  {
    concept: /\b(?:test\s+plans?|task\s+scenarios?|findings)\b/i,
    source:
      /\b(?:usability\s+test(?:ing)?|a\/b\s+test(?:ing)?|split\s+test(?:ing)?|test\s+plans?|task\s+scenarios?|research\s+findings?)\b/i,
  },
  {
    concept: /\b(?:evidence[-\s]+based\s+design\s+recommendations?|design\s+recommendations?)\b/i,
    source:
      /\b(?:user[-\s]?centered\s+design|human[-\s]?centered\s+design|user\s+research|design\s+research|research\s+findings?|usability\s+test(?:ing)?|design\s+rationale)\b/i,
  },
  {
    concept: /\b(?:inclusive\s+design|evaluation|remediation|accessibility)\b/i,
    source: /\b(?:inclusive\s+design|accessibility|evaluation|remediation|transformative\s+services?)\b/i,
  },
  {
    concept: /\b(?:process\s+narrative|visuals|case\s+study\s+structure|studio\s+work|refinement|review)\b/i,
    source:
      /\b(?:design\s+studio|studio\s+practice|portfolio\s+case\s+stud(?:y|ies)|case\s+study\s+structure|visuals?|design\s+review|work[-\s]?in[-\s]?progress\s+review|portfolio\s+review|(?:design|prototype|studio|ux|user[-\s]?experience|interface|interaction|portfolio)[-\s]+(?:critique|refinement)|(?:critique|refinement)[-\s]+(?:design|prototype|studio|ux|user[-\s]?experience|interface|interaction|portfolio)|iterative\s+design|prototyping)\b/i,
  },
];
const COMPUTER_SCIENCE_COURSE_RE =
  /\b(?:computer\s+science|python\b|programming|coding|software\s+development|software\s+engineering|intro(?:duction)?\s+to\s+cs|cs\s*(?:1|101)\b)\b/i;
const COMPUTER_SCIENCE_SOURCE_ANCHOR_RE =
  /\b(?:computer\s+science|computing|programming|software|python\b|code\b|coding|algorithm|data\s+structures?|control\s+flow|branching|iteration|conditional\s+(?:statement|expression|operator|construct|computer|programming)|if\s+statements?|if[-\s]then(?:[-\s]else)?|loops?\s+(?:in\s+python|in\s+programming|programming|statement|construct)|for\s+loops?|while\s+loops?|variables?\s+(?:in\s+python|in\s+programming)|data\s+types?|strings?\s+(?:in\s+python|in\s+programming|type|object|processing|computer\s+science)|lists?\s+(?:in\s+python|in\s+programming|data\s+structure|abstract\s+data\s+type|array|sequence)|dictionar(?:y|ies)\s+(?:in\s+python|data\s+structure|mapping|hash\s+table)|functions?\s+(?:in\s+python|in\s+programming|programming)|subroutine|procedure|method|modules?\s+(?:in\s+python|programming|software)|exceptions?\s+(?:in\s+python|programming|handling)|debugg(?:ing|er)|unit\s+tests?|software\s+testing|file\s+(?:i\/o|input|output|handling)|input\/output|openstax\s+introduction\s+python\s+programming|python\s+\(programming\s+language\)|computer\s+program|programming\s+language)\b/i;
const COMPUTER_SCIENCE_FALSE_FRIEND_RE =
  /\b(?:correlation|statistical\s+variables?|dependent\s+variables?|independent\s+variables?|random\s+variables?|lists?\s+of\s+(?:american\s+colleges|box\s+office|universities|films|songs|albums|people)|list\s+of\s+dictionaries\s+by\s+number\s+of\s+words|no\s+strings\s+attached|n'?sync|string\s+theory|trigonometric\s+functions?|function\s+\(mathematics\)|continuous\s+or\s+discrete\s+variable|frontiers\s+of\s+flow\s+control|file\s+explorer|file\s+manager|environment\s+variable|conditional\s+sentences?|english\s+conditional\s+sentences?|natural\s+language|subordinate\s+clause|protasis|apodosis|game\s+loops?|game\s+design\s+loops?|game\s+terakoya|ludic\s+language\s+pedagogy|module\s+\(mathematics\)|module\s+theory|modules?\s+over\s+(?:a\s+)?rings?|abstract\s+algebra|exception\s+\(law\)|legal\s+exceptions?|exception\s+clauses?|exceptions?\s+to\s+(?:rules?|laws?))\b/i;
const COMPUTER_SCIENCE_AMBIGUOUS_CONCEPT_RE =
  /\b(?:variables?|types?|data\s+types?|control\s+flow|conditionals?|loops?|functions?|lists?|dictionar(?:y|ies)|strings?|file\s+(?:input|output|i\/o)|files?|modules?|exceptions?|testing|debugging|algorithms?)\b/i;
const COMPUTER_SCIENCE_TOPIC_ANCHORS = [
  {
    concept: /\b(?:variables?|types?|data\s+types?)\b/i,
    source:
      /\b(?:python|programming|computer\s+science|data\s+types?|variables?\s+(?:in\s+python|in\s+programming)|type\s+systems?)\b/i,
  },
  {
    concept: /\b(?:control\s+flow|conditionals?|loops?)\b/i,
    source:
      /\b(?:control\s+flow|branching|iteration|python|programming|conditional\s+(?:statement|expression|operator|construct|computer|programming)|if\s+statements?|if[-\s]then(?:[-\s]else)?|loops?\s+(?:in\s+python|in\s+programming|programming|statement|construct)|for\s+loops?|while\s+loops?)\b/i,
  },
  {
    concept: /\bfunctions?\b/i,
    source: /\b(?:functions?\s+(?:in\s+python|in\s+programming|programming)|subroutine|procedure|method|python)\b/i,
  },
  {
    concept: /\blists?\b/i,
    source:
      /(?:\b(?:lists?\s+(?:in\s+python|in\s+programming|data\s+structure|abstract\s+data\s+type|array|sequence)|python\s+lists?|list\s+comprehensions?)\b|\blist\s+\(abstract\s+data\s+type\))/i,
  },
  {
    concept: /\bdictionar(?:y|ies)\b/i,
    source:
      /\b(?:dictionar(?:y|ies)\s+(?:in\s+python|data\s+structure|mapping)|hash\s+table|associative\s+array|python\s+dictionar(?:y|ies))\b/i,
  },
  {
    concept: /\bstrings?\b/i,
    source:
      /(?:\b(?:strings?\s+(?:in\s+python|in\s+programming|computer\s+science|processing|type|object)|text\s+processing|python\s+strings?)\b|\bstring\s+\(computer\s+science\))/i,
  },
  {
    concept: /\bfile\s+(?:input|output)|file\s+i\/o|files?\b/i,
    source:
      /\b(?:file\s+(?:input|output|i\/o|handling)|input\/output|read(?:ing)?\s+files?|writ(?:ing|e)\s+files?|python\s+files?)\b/i,
  },
  {
    concept: /\bmodules?\b/i,
    source:
      /\b(?:modules?\s+(?:in\s+python|in\s+programming|programming|software)|python\s+modules?|import\s+statements?|package\s+modules?|module\s+systems?|modular\s+programming)\b/i,
  },
  {
    concept: /\bexceptions?\b/i,
    source:
      /\b(?:exceptions?\s+(?:in\s+python|in\s+programming|handling)|exception\s+handling|try\s*\/?\s*except|try[-\s]catch|python\s+exceptions?)\b/i,
  },
  {
    concept: /\btesting\b/i,
    source: /\b(?:unit\s+tests?|software\s+testing|programming\s+tests?|test[-\s]driven|pytest|unittest|python)\b/i,
  },
  {
    concept: /\bdebugging\b/i,
    source: /\b(?:debugg(?:ing|er)|software\s+debugging|programming\s+debugging|python)\b/i,
  },
  {
    concept: /\balgorithms?\b/i,
    source:
      /\b(?:algorithms?\s+(?:in\s+computer\s+science|in\s+programming|design|analysis)|computer\s+science|programming|software|pseudocode|complexity|data\s+structures?)\b/i,
  },
];

function ambiguousLicense(row) {
  const license = String(row?.license || '')
    .trim()
    .toLowerCase();
  return (
    row?.licenseAmbiguous === true ||
    !license ||
    /^(open access|open license|unknown|(?:[\w.-]+\s+)*public metadata|metadata only|instructor review required|review required|varies|mixed|in copyright|all rights reserved)$/.test(
      license,
    ) ||
    /^other[-\s]?oa$/.test(license) ||
    RESTRICTED_RIGHTS_STATEMENT_RE.test(license) ||
    PUBLISHER_POLICY_LICENSE_RE.test(license)
  );
}

function isTrustedBibliographyRow(row) {
  const provider = String(row?.provider || '').toLowerCase();
  return (
    TRUST_ELIGIBLE_PROVIDERS.has(provider) &&
    !REVIEW_ONLY_PROVIDERS.has(provider) &&
    hasRef(row) &&
    !ambiguousLicense(row)
  );
}

function hasConceptLinks(row) {
  return (
    Array.isArray(row?.conceptLinks) && row.conceptLinks.some((link) => String(link?.id || link?.label || link).trim())
  );
}

function isTrustedConceptLinkedBibliographyRow(row) {
  return isTrustedBibliographyRow(row) && hasConceptLinks(row);
}

function isProjectManagementManifest(manifest) {
  const courseText = [
    manifest?.courseName,
    manifest?.title,
    manifest?.packageTitle,
    manifest?.pipeline?.knowledgeBackbone,
    manifest?.pipeline?.courseGraph,
  ]
    .filter(Boolean)
    .join(' ');
  return PROJECT_MANAGEMENT_COURSE_RE.test(courseText);
}

function isUserExperienceManifest(manifest) {
  const courseText = [
    manifest?.courseName,
    manifest?.title,
    manifest?.packageTitle,
    manifest?.pipeline?.knowledgeBackbone,
    manifest?.pipeline?.courseGraph,
  ]
    .filter(Boolean)
    .join(' ');
  return USER_EXPERIENCE_COURSE_RE.test(courseText);
}

function isComputerScienceManifest(manifest) {
  const courseText = [
    manifest?.courseName,
    manifest?.title,
    manifest?.packageTitle,
    manifest?.pipeline?.knowledgeBackbone,
    manifest?.pipeline?.courseGraph,
  ]
    .filter(Boolean)
    .join(' ');
  return COMPUTER_SCIENCE_COURSE_RE.test(courseText);
}

function musicIntervalManifestContext(manifest) {
  return [
    manifest?.courseName,
    manifest?.title,
    manifest?.packageTitle,
    ...(manifest?.assessments || []).map((assessment) => assessment?.title || ''),
    ...rows(manifest).flatMap((row) =>
      (row?.conceptLinks || []).map((link) => (typeof link === 'string' ? link : link?.label || link?.id || '')),
    ),
  ]
    .filter(Boolean)
    .join(' ');
}

function rowSearchText(row) {
  return [row?.title, row?.citation, row?.evidence, row?.sourceType, row?.scope].filter(Boolean).join(' ');
}

function rowConceptText(row) {
  return (Array.isArray(row?.conceptLinks) ? row.conceptLinks : [])
    .map((link) => (typeof link === 'string' ? link : link?.label || link?.id || ''))
    .filter(Boolean)
    .join(' ');
}

function isProjectManagementFalseFriendSource(row, manifest) {
  if (!isProjectManagementManifest(manifest)) return false;
  const text = rowSearchText(row);
  if (!PROJECT_MANAGEMENT_FALSE_FRIEND_RE.test(text)) return false;
  return !PROJECT_MANAGEMENT_SOURCE_ANCHOR_RE.test(text);
}

function hasUserExperienceTopicAnchor(row) {
  const conceptText = rowConceptText(row);
  const text = rowSearchText(row);
  return USER_EXPERIENCE_TOPIC_ANCHORS.some(({ concept, source }) => concept.test(conceptText) && source.test(text));
}

function isUserExperienceWeakSource(row, manifest) {
  if (!isUserExperienceManifest(manifest)) return false;
  const text = rowSearchText(row);
  if (USER_EXPERIENCE_FALSE_FRIEND_RE.test(text)) return true;
  return !USER_EXPERIENCE_SOURCE_ANCHOR_RE.test(text) && !hasUserExperienceTopicAnchor(row);
}

function hasComputerScienceTopicAnchor(row) {
  const conceptText = rowConceptText(row);
  const text = rowSearchText(row);
  return COMPUTER_SCIENCE_TOPIC_ANCHORS.some(({ concept, source }) => concept.test(conceptText) && source.test(text));
}

function isCanonicalComputerScienceOerSource(row) {
  const provider = String(row?.provider || row?.origin || '').toLowerCase();
  if (!['openstax', 'genome', 'genome-prerequisite'].includes(provider)) return false;
  const text = [row?.url, row?.title, row?.citation, row?.evidence, row?.sourceType].filter(Boolean).join(' ');
  return (
    /openstax\.org\/books\/introduction-python-programming\b/i.test(text) ||
    /\bopenstax\s+introduction\s+python\s+programming\b/i.test(text)
  );
}

function isComputerScienceWeakSource(row, manifest) {
  if (!isComputerScienceManifest(manifest)) return false;
  if (isCanonicalComputerScienceOerSource(row)) return false;
  const text = rowSearchText(row);
  if (COMPUTER_SCIENCE_FALSE_FRIEND_RE.test(text)) return true;
  if (COMPUTER_SCIENCE_AMBIGUOUS_CONCEPT_RE.test(rowConceptText(row))) return !hasComputerScienceTopicAnchor(row);
  return !COMPUTER_SCIENCE_SOURCE_ANCHOR_RE.test(text) && !hasComputerScienceTopicAnchor(row);
}

function isMusicTheoryIntervalWeakSource(row, manifest) {
  return isMusicIntervalWeakSource(rowSearchText(row), musicIntervalManifestContext(manifest), rowConceptText(row));
}

function sourceCoverageTotal(coverage) {
  if (!coverage || typeof coverage !== 'object') return 0;
  const explicit = Number(coverage?.totals?.total);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Object.values(coverage?.categories || {}).reduce((sum, proof) => sum + (Number(proof?.total) || 0), 0);
}

function sourceCoverageLedgerRows(coverage) {
  const explicit = Number(coverage?.sourceLedgerRows);
  return Number.isFinite(explicit) && explicit >= 0 ? explicit : null;
}

function parseReportedOpenResourceCount(manifest) {
  const pipeline = manifest?.pipeline;
  if (!pipeline || typeof pipeline !== 'object') return null;
  const text = Object.values(pipeline)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value || '')))
    .join(' ');
  const match = text.match(/\b(\d+)\s+open resources?\b/i);
  return match ? Number(match[1]) : null;
}

function parseReportedLessonCount(manifest) {
  const pipeline = manifest?.pipeline;
  if (!pipeline || typeof pipeline !== 'object') return null;
  const text = Object.values(pipeline)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value || '')))
    .join(' ');
  const fractionPatterns = [
    /\bknowledge kernels? (?:admitted|covered|ready)\s+\d+\s*\/\s*(\d+)\b/i,
    /\b(?:genome|course map|enrichment)[^.;|]{0,50}\b\d+\s*\/\s*(\d+)\s+(?:lessons?|sessions?)\b/i,
    /\b\d+\s*\/\s*(\d+)\s+(?:lesson|session) kernels?\b/i,
  ];
  for (const pattern of fractionPatterns) {
    const match = pattern.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

function normalizedSourceSessionRef(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text) return '';
  const numbered = text.match(/(?:^|\b)(?:s|session|lesson|week)?\s*0*(\d{1,3})(?:\b|$)/i);
  return numbered ? `s${Number(numbered[1])}` : text;
}

function sourceScopedLessonCount(sourceRows = []) {
  const refs = new Set();
  for (const row of sourceRows) {
    for (const ref of Array.isArray(row?.sessionRefs) ? row.sessionRefs : []) {
      const normalized = normalizedSourceSessionRef(ref);
      if (normalized) refs.add(normalized);
    }
  }
  return refs.size;
}

export function hasSourceLedgerProof(manifest) {
  return Boolean(
    rows(manifest).length ||
    reviewRows(manifest).length ||
    manifest?.courseIR?.sourceRefCoverage ||
    manifest?.sourceReport?.sourceRefCoverage,
  );
}

export function expectsSourceLedgerProof(manifest) {
  const pipeline = manifest?.pipeline;
  if (!pipeline || typeof pipeline !== 'object') return false;
  const text = Object.values(pipeline)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value || '')))
    .join(' ')
    .toLowerCase();
  return /\b(?:genome|openalex|openlibrary|openstax|source-finder|source ledger|sourceref|source ref|knowledgebackbone|citation|limited knowledge check|native authoring|courseir)\b/.test(
    text,
  );
}

export function shouldCheckSourceLedger(manifest) {
  return hasSourceLedgerProof(manifest) || expectsSourceLedgerProof(manifest);
}

export function checkSourceLedger(findings, { files, manifest }) {
  const ledger = rows(manifest);
  const review = reviewRows(manifest);
  const coverage = manifest?.courseIR?.sourceRefCoverage || manifest?.sourceReport?.sourceRefCoverage || null;
  const reportPath = manifest?.sourceReport?.path || 'SOURCE_REPORT.md';
  const reportedOpenResources = parseReportedOpenResourceCount(manifest);
  const reportedLessonCount = parseReportedLessonCount(manifest);
  const exportedSourceRows = ledger.length + review.length;
  const coverageTotal = sourceCoverageTotal(coverage);
  const coverageLedgerRows = sourceCoverageLedgerRows(coverage);
  const trustedBibliographyRows = ledger.filter(isTrustedBibliographyRow);
  const trustedConceptLinkedBibliographyRows = ledger.filter(isTrustedConceptLinkedBibliographyRow);
  const sourceScopedLessons = sourceScopedLessonCount(trustedConceptLinkedBibliographyRows);
  const evidenceClaimedLessonCount =
    sourceScopedLessons > 0 ? sourceScopedLessons : Number.isFinite(reportedLessonCount) ? reportedLessonCount : 0;

  if (ledger.length === 0 && review.length === 0 && !coverage) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'PACKAGE_MANIFEST.json',
      detail: 'source-backed pipeline did not export sourceLedger, sourceRef coverage, or SOURCE_REPORT.md proof',
      evidence: JSON.stringify(manifest?.pipeline || {}).slice(0, 200),
    });
    return;
  }

  if (!files.some((file) => file.path === reportPath)) {
    findings.add({
      severity: 'P1',
      dimension: 'structure',
      file: reportPath,
      detail: 'source ledger proof is present but the package does not include the declared source report',
      evidence: reportPath,
    });
  }

  const ids = new Set();
  for (const row of ledger) {
    const id = String(row?.id || '').trim();
    if (!id || ids.has(id)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: 'source ledger row has a missing or duplicate id',
        evidence: JSON.stringify(row).slice(0, 160),
      });
    }
    if (id) ids.add(id);
    if (!String(row?.title || row?.evidence || '').trim()) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has no title or evidence`,
        evidence: JSON.stringify(row).slice(0, 160),
      });
    }
    if (!hasRef(row) && !['courseir', 'instructor', 'instructor-provided'].includes(row?.provider)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has no accessible URL or DOI`,
        evidence: row?.title || row?.evidence || JSON.stringify(row).slice(0, 120),
      });
    }
    if (hasMalformedUrl(row)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has malformed URL proof`,
        evidence: row?.url || row?.title || row?.evidence || id,
      });
    }
    if (ambiguousLicense(row)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} has ambiguous or missing license`,
        evidence: row?.license || row?.title || row?.evidence || id,
      });
    }
    if (coverageTotal >= 12 && isTrustedBibliographyRow(row) && !hasConceptLinks(row)) {
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is trusted metadata but is not concept-linked`,
        evidence: row?.title || row?.evidence || id,
      });
    }
    if (hasConceptLinks(row) && isProjectManagementFalseFriendSource(row, manifest)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is off-discipline for Project Management`,
        evidence: row?.title || row?.citation || row?.evidence || id,
      });
    }
    if (hasConceptLinks(row) && isUserExperienceWeakSource(row, manifest)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is off-discipline for User Experience Design Studio`,
        evidence: row?.title || row?.citation || row?.evidence || id,
      });
    }
    if (hasConceptLinks(row) && isComputerScienceWeakSource(row, manifest)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is off-discipline for Computer Science/Python`,
        evidence: row?.title || row?.citation || row?.evidence || id,
      });
    }
    if (hasConceptLinks(row) && isMusicTheoryIntervalWeakSource(row, manifest)) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source ledger row ${id || '(missing id)'} is off-discipline for Music Theory intervals`,
        evidence: row?.title || row?.citation || row?.evidence || id,
      });
    }
  }

  if (trustedConceptLinkedBibliographyRows.length < 2) {
    for (const row of review) {
      const id = String(row?.id || '').trim();
      findings.add({
        severity: 'P2',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `source review row ${id || '(missing id)'} is not trusted bibliography proof`,
        evidence: row?.title || row?.evidence || JSON.stringify(row).slice(0, 120),
      });
    }
  }

  if (Number.isFinite(reportedOpenResources) && reportedOpenResources > exportedSourceRows) {
    findings.add({
      severity: 'P1',
      dimension: 'honesty',
      file: 'PACKAGE_MANIFEST.json',
      detail: `pipeline reported ${reportedOpenResources} open resource(s) but the package exported ${exportedSourceRows} source proof row(s)`,
      evidence: JSON.stringify(manifest?.pipeline || {}).slice(0, 200),
    });
  }

  if (trustedConceptLinkedBibliographyRows.length <= 1 && (coverageTotal >= 12 || evidenceClaimedLessonCount >= 2)) {
    findings.add({
      severity: 'P1',
      dimension: 'citations',
      file: 'PACKAGE_MANIFEST.json',
      detail:
        coverageTotal >= 12
          ? `sourceRef coverage is too thin: ${coverageTotal} atom(s) rely on ${trustedConceptLinkedBibliographyRows.length} trusted concept-linked source row(s)`
          : `source evidence is too thin: ${evidenceClaimedLessonCount} lesson(s) rely on ${trustedConceptLinkedBibliographyRows.length} trusted concept-linked source row(s)`,
      evidence: JSON.stringify({
        sourceLedgerRows: ledger.length,
        trustedSourceLedgerRows: trustedBibliographyRows.length,
        trustedConceptLinkedSourceLedgerRows: trustedConceptLinkedBibliographyRows.length,
        coverageTotal,
        reportedLessonCount,
        sourceScopedLessons,
        providers: ledger.map((row) => row.provider).filter(Boolean),
      }).slice(0, 200),
    });
  }

  if (
    coverageTotal >= 12 &&
    trustedConceptLinkedBibliographyRows.length > 1 &&
    Number.isFinite(coverageLedgerRows) &&
    coverageLedgerRows <= 1 &&
    review.length > 0
  ) {
    findings.add({
      severity: 'P1',
      dimension: 'citations',
      file: 'PACKAGE_MANIFEST.json',
      detail: `sourceRef coverage is not wired to trusted concept-linked source ledger rows: ${coverageTotal} atom(s) report coverage through ${coverageLedgerRows} CourseIR source row(s) while ${trustedConceptLinkedBibliographyRows.length} trusted concept-linked exported source row(s) exist`,
      evidence: JSON.stringify({
        sourceLedgerRows: ledger.length,
        trustedSourceLedgerRows: trustedBibliographyRows.length,
        trustedConceptLinkedSourceLedgerRows: trustedConceptLinkedBibliographyRows.length,
        courseIrSourceLedgerRows: coverageLedgerRows,
        sourceReviewRows: review.length,
        coverageTotal,
      }).slice(0, 200),
    });
  }

  for (const [category, proof] of Object.entries(coverage?.categories || {})) {
    const total = Number(proof?.total) || 0;
    const withRefs = Number(proof?.withRefs) || 0;
    const danglingRefs = Number(proof?.danglingRefs) || 0;
    if (total > 0 && withRefs < total) {
      findings.add({
        severity: category === 'factualClaims' ? 'P1' : 'P2',
        dimension: category === 'factualClaims' ? 'honesty' : 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `${category} sourceRef coverage is incomplete (${withRefs}/${total})`,
        evidence: (proof?.missingIds || []).join(', ') || `${withRefs}/${total}`,
      });
    }
    if (danglingRefs > 0) {
      findings.add({
        severity: 'P1',
        dimension: 'citations',
        file: 'PACKAGE_MANIFEST.json',
        detail: `${category} contains ${danglingRefs} sourceRef(s) that do not resolve to the source ledger`,
        evidence: JSON.stringify(proof).slice(0, 160),
      });
    }
  }
}
