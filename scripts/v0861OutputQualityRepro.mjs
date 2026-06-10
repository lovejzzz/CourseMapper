#!/usr/bin/env node
/**
 * v0.8.61 reproduction harness: compiles a sparse-repair course map shaped like
 * the audited Climate Justice export and runs the audit's language-integrity
 * checks against the compiled deliverables.
 *
 * Usage: node scripts/v0861OutputQualityRepro.mjs [--json] [--dump featureId]
 */
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { isProvenanceMirrorKey } from '../src/lib/compiledLanguageFinalizer.js';
import { auditSubstance } from '../src/lib/contentQualityChecks.js';

const LESSON_TOPICS = [
  'Climate Science, Justice Frameworks, and Community Resilience Basics',
  'Environmental Racism, Inequity, and Mapping Community Impacts',
  'Adaptation Planning, Disaster Recovery, and Public Decision-Making',
  'Energy Transitions, Emissions, and Just Transition Policy',
  'Indigenous Sovereignty, Knowledge Systems, and Climate Governance',
  'Public Participation, Community Case Studies, and Policy Tradeoffs',
  'Final Resilience Action Plan and Presentation',
];

const SECTION_TITLES = [
  ['1.1: Course Framing and Core Concepts'],
  [
    '2.1: Environmental Racism and Structural Inequality',
    '2.2: Environmental Justice Mapping Lab',
    '2.3: Community Case Study Analysis',
  ],
  ['3.1: Adaptation Planning Fundamentals', '3.2: Disaster Recovery Case Studies', '3.3: Public Decision Simulation'],
  ['4.1: Energy Systems and Climate Mitigation', '4.2: Just Transition Policy Analysis', '4.3: Energy Burden Workshop'],
  [
    '5.1: Indigenous Sovereignty and Rights',
    '5.2: Knowledge Systems in Climate Governance',
    '5.3: Ethical Engagement Protocols',
  ],
  [
    '6.1: Public Participation and Deliberative Practice',
    '6.2: Community Case Study Workshop',
    '6.3: Policy Tradeoff Analysis',
  ],
  ['7.1: Integrating Course Concepts'],
];

// Replicates getCourseMapFallbackValue() filler from deliverableReadiness.js —
// the exact text that filled 84 empty enabled fields in the audited run.
function fillerSection(sectionTitle) {
  return {
    topicSection: sectionTitle,
    learningObjectives: `Students will explain key ideas from ${sectionTitle} and apply them in course activities.`,
    learningGoals: `Build a working understanding of ${sectionTitle} and connect it to the course outcomes.`,
    weeklyAssessments: `Low-stakes check for understanding aligned to ${sectionTitle}.`,
    asyncActivities: `Review assigned materials and prepare notes on ${sectionTitle}.`,
    syncActivities: `Discuss examples and practice applying ${sectionTitle}.`,
    technologyNeeded: 'Course LMS and standard document tools.',
    supportingResources: `Assigned readings, instructor notes, and course examples related to ${sectionTitle}.`,
    evaluateDesign: 'Activities, resources, and assessments align to the stated goals and objectives.',
  };
}

function buildSparseCourseMap() {
  const lessons = LESSON_TOPICS.map((topic, i) => {
    const lessonNumber = i + 1;
    const sections = SECTION_TITLES[i].map((sectionTitle, sIdx) => {
      if (i === 0 && sIdx === 0) {
        // Lesson 1 was the only richly-filled lesson in the audited map.
        return {
          topicSection: sectionTitle,
          learningObjectives:
            'Define climate justice, resilience, vulnerability, and adaptive capacity in context.\nExplain how climate impacts are distributed unevenly across communities.\nAnalyze basic climate science concepts relevant to local decision-making.\nDescribe the relationship between policy choices and community resilience outcomes.',
          learningGoals:
            'Build a shared foundation in climate science, climate justice frameworks, and community resilience concepts.',
          weeklyAssessments:
            'Introductory discussion post: Define one core concept and connect it to a community example. Short diagnostic quiz on climate science basics.',
          asyncActivities:
            'Read assigned overview materials on climate science basics. Watch the course video on vulnerability and adaptive capacity.',
          syncActivities:
            'Seminar discussion: Share community examples of climate risk. Concept mapping activity in small groups.',
          technologyNeeded: 'LMS for readings, quiz, and discussion boards. Zoom or classroom projection.',
          supportingResources:
            'Introductory course overview handout on climate justice and resilience. Selected open-access primer on climate science basics. Short video lecture created for the course on vulnerability and adaptive capacity. Current article or report on uneven climate impacts and community risk.',
          evaluateDesign: 'Activities, resources, and assessments align to the stated goals and objectives.',
        };
      }
      return fillerSection(sectionTitle);
    });
    return { title: `Lesson ${lessonNumber}: ${topic}`, sections };
  });
  return {
    courseName: 'Climate Justice and Community Resilience',
    semester: 'Fall 2026',
    lessons,
  };
}

const FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

// ---------- audit checks ----------

function* walkStrings(node, path = '$') {
  if (typeof node === 'string') {
    yield [path, node];
  } else if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) yield* walkStrings(node[i], `${path}[${i}]`);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      // Provenance mirrors stay byte-faithful to the blueprint and never
      // render; the rendered-text audit below covers everything visible.
      if (isProvenanceMirrorKey(key)) continue;
      yield* walkStrings(value, `${path}.${key}`);
    }
  }
}

// Words that only appear inside multi-word title units (e.g. "Science" from
// "Climate Science") are fragments; standalone comma-units like "Inequity"
// are legitimate one-word concepts.
const FRAGMENT_TOKENS = new Set();
for (const topic of LESSON_TOPICS) {
  for (const unit of topic.split(/,|\band\b/i)) {
    const words = unit
      .trim()
      .replace(/[^A-Za-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    if (words.length > 1) {
      for (const word of words) FRAGMENT_TOKENS.add(word.toLowerCase());
    }
  }
}
for (const topic of LESSON_TOPICS) {
  for (const unit of topic.split(/,|\band\b/i)) {
    const words = unit
      .trim()
      .replace(/[^A-Za-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 1 && words[0]) FRAGMENT_TOKENS.delete(words[0].toLowerCase());
  }
}

function auditCompiled(compiled) {
  const findings = [];
  const add = (check, featureId, path, sample) => {
    findings.push({ check, featureId, path, sample: String(sample).slice(0, 160) });
  };

  for (const featureId of FEATURES) {
    const data = compiled[featureId];
    if (!data) continue;
    for (const [path, value] of walkStrings(data)) {
      // 1. Leading-colon or empty labels
      if (/^\s*:/.test(value)) add('leading-colon', featureId, path, value);
      // 2. Dangling clause: sentence ends in conjunction/preposition/article + period
      if (
        /\b(?:and|or|for|in|of|to|the|a|an|with|before|after|around)\s*[.]\s*$/i.test(value.trim()) &&
        !/\b(?:etc|e\.g|i\.e)[.]$/i.test(value.trim())
      ) {
        add('dangling-clause', featureId, path, value);
      }
      // 3. a/an mismatch before vowel/consonant
      if (/\ba\s+[AEIOU][a-z]/.test(value)) add('article-a-before-vowel', featureId, path, value);
      if (/\ban\s+[BCDFGJKLMNPQRSTVWXZ][a-z]/.test(value)) add('article-an-before-consonant', featureId, path, value);
      // 4. Double periods / run-on stitches
      if (/[a-z]\.\.(?!\.)/.test(value)) add('double-period', featureId, path, value);
      // (Repetition is measured on rendered export text below, not on internal
      // receipt/trace metadata that exporters never show instructors.)
      // 6. "Strong work Names" style run-together (lowercase word + capitalized template verb)
      if (/\bwork (?:Names|Uses|Explains)\b/.test(value)) add('run-together-criteria', featureId, path, value);
    }
  }

  // 7. Single-word fake concepts in quiz/studyGuide surfaces
  const conceptSurfaces = [];
  for (const [path, value] of walkStrings(compiled.quizBank || {})) {
    if (/\.tags\[/.test(path)) conceptSurfaces.push([path, value]);
  }
  for (const item of compiled.studyGuides?.studyGuides || compiled.studyGuides?.items || []) {
    for (const term of item?.keyTerms || []) {
      const t = typeof term === 'string' ? term : term?.term || '';
      conceptSurfaces.push(['studyGuides.keyTerms', t]);
    }
  }
  for (const [path, value] of conceptSurfaces) {
    const v = String(value).trim();
    if (/^[A-Za-z][a-z]*$/.test(v) && FRAGMENT_TOKENS.has(v.toLowerCase())) {
      add('single-word-title-concept', 'concepts', path, v);
    }
  }

  // 8. Quiz answer-key uniformity across lessons
  const quizzes = compiled.quizBank?.quizzes || compiled.quizBank?.items || compiled.quizBank?.lessons || [];
  const keys = [];
  for (const lessonQuiz of quizzes) {
    const qs = lessonQuiz?.questions || [];
    keys.push(qs.map((q) => q?.correctAnswer ?? q?.answer ?? '-').join(','));
  }
  if (keys.length > 1 && new Set(keys).size === 1) {
    add('uniform-quiz-answer-key', 'quizBank', `all ${keys.length} lessons`, keys[0]);
  }

  return findings;
}

// ---------- main ----------

// ---------- rendered-text audit (what instructors actually read) ----------

async function blobToBuffer(blob) {
  if (Buffer.isBuffer(blob)) return blob;
  if (blob?.arrayBuffer) return Buffer.from(await blob.arrayBuffer());
  return Buffer.from(blob);
}

function xmlToParagraphs(xml, splitTag) {
  return xml
    .split(splitTag)
    .map((chunk) =>
      chunk
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#8217;|&apos;/g, "'")
        .trim(),
    )
    .filter(Boolean);
}

function installCanvasStub() {
  if (typeof globalThis.OffscreenCanvas !== 'undefined') return;
  const context = {
    font: '',
    measureText: (text) => ({ width: String(text || '').length * 7 }),
  };
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    getContext() {
      return context;
    }
  };
}

async function renderFeatureTexts(compiled, courseName) {
  installCanvasStub();
  const { default: JSZip } = await import('jszip');
  const { buildDeliverableDocxBlob } = await import('../src/lib/exporters/bulkDocxExporter.js');
  const { buildSlideDeckPptxBlob } = await import('../src/lib/exporters/pptxExporter.js');
  const rendered = {};
  for (const featureId of FEATURES) {
    if (!compiled[featureId]) continue;
    if (featureId === 'slideDecks') {
      const blob = await buildSlideDeckPptxBlob(compiled[featureId], courseName, 0);
      const zip = await JSZip.loadAsync(await blobToBuffer(blob));
      const slideTexts = [];
      const noteTexts = [];
      for (const path of Object.keys(zip.files).sort()) {
        if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
          slideTexts.push(...xmlToParagraphs(await zip.file(path).async('string'), '</a:p>'));
        } else if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path)) {
          noteTexts.push(...xmlToParagraphs(await zip.file(path).async('string'), '</a:p>'));
        }
      }
      rendered.slideDecks = { paragraphs: slideTexts, notes: noteTexts };
    } else {
      const blob = await buildDeliverableDocxBlob(featureId, compiled[featureId], courseName);
      const zip = await JSZip.loadAsync(await blobToBuffer(blob));
      const xml = await zip.file('word/document.xml').async('string');
      rendered[featureId] = { paragraphs: xmlToParagraphs(xml, '</w:p>') };
    }
  }
  return rendered;
}

function auditRenderedText(rendered) {
  const findings = [];
  const add = (check, featureId, path, sample) =>
    findings.push({ check, featureId, path, sample: String(sample).slice(0, 160) });

  for (const [featureId, doc] of Object.entries(rendered)) {
    const phraseCounts = new Map();
    for (const para of doc.paragraphs) {
      if (/^\s*:/.test(para)) add('rendered-leading-colon', featureId, 'paragraph', para);
      if (
        /\b(?:and|or|for|in|of|to|the|with|before|after|around|aligned to)\s*[.]\s*$/i.test(para.trim()) &&
        !/\b(?:etc|e\.g|i\.e)[.]$/i.test(para.trim())
      ) {
        add('rendered-dangling-clause', featureId, 'paragraph', para);
      }
      if (/\ba\s+[AEIOU][a-z]/.test(para)) add('rendered-article', featureId, 'paragraph', para);
      if (/[a-z]\.\.(?!\.)/.test(para)) add('rendered-double-period', featureId, 'paragraph', para);
      if (/\bwork (?:Names|Uses|Explains)\b/.test(para)) add('rendered-run-together', featureId, 'paragraph', para);
      if (featureId === 'assignments' && /\bAsk students\b/.test(para)) {
        add('rendered-instructor-voice', featureId, 'student instructions', para);
      }
      const words = para
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
      for (let i = 0; i + 8 <= words.length; i += 1) {
        const shingle = words.slice(i, i + 8).join(' ');
        phraseCounts.set(shingle, (phraseCounts.get(shingle) || 0) + 1);
      }
    }
    let worst = ['', 0];
    for (const [shingle, count] of phraseCounts) if (count > worst[1]) worst = [shingle, count];
    // Whole-course documents bundle all lessons; ~2 recurrences per lesson of
    // a working phrase is normal prose. Fail only on template-stamping levels.
    if (worst[1] >= 18) add('rendered-phrase-repetition', featureId, `worst 8-gram x${worst[1]}`, worst[0]);
    else if (worst[1] >= 12) console.log(`  (info) ${featureId}: worst 8-gram x${worst[1]}: "${worst[0]}"`);
    if (featureId === 'slideDecks') {
      for (const para of doc.paragraphs) {
        if (/SUGGESTED VISUAL/i.test(para)) add('slide-visible-placeholder', featureId, 'slide surface', para);
      }
    }
  }
  return findings;
}

const args = process.argv.slice(2);
const courseMap = buildSparseCourseMap();
const blueprint = buildCourseBlueprint(courseMap);
const storedBlueprint = JSON.parse(JSON.stringify(blueprint));
const compiled = compileBlueprintDeliverables(storedBlueprint, FEATURES, {});

const dumpIdx = args.indexOf('--dump');
if (dumpIdx !== -1) {
  const featureId = args[dumpIdx + 1];
  console.log(JSON.stringify(compiled[featureId], null, 2));
  process.exit(0);
}

const findings = auditCompiled(compiled);
for (const featureId of ['quizBank', 'studyGuides']) {
  const substance = auditSubstance(featureId, compiled[featureId]);
  if (substance) {
    console.log(
      `  (substance) ${featureId}: ${substance.meta}/${substance.surfaces} surfaces are course-process talk (${Math.round(substance.metaShare * 100)}%)`,
    );
  }
}
const rendered = await renderFeatureTexts(compiled, courseMap.courseName);
findings.push(...auditRenderedText(rendered));

const textDumpIdx = args.indexOf('--text');
if (textDumpIdx !== -1) {
  const featureId = args[textDumpIdx + 1];
  console.log((rendered[featureId]?.paragraphs || []).join('\n'));
  process.exit(0);
}
const byCheck = new Map();
for (const f of findings) {
  byCheck.set(f.check, (byCheck.get(f.check) || []).concat(f));
}

if (args.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  console.log(`Compiled features: ${FEATURES.filter((f) => compiled[f]).join(', ')}`);
  console.log(`Total findings: ${findings.length}`);
  for (const [check, items] of [...byCheck.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n== ${check} (${items.length}) ==`);
    for (const item of items.slice(0, 5)) {
      console.log(`  [${item.featureId}] ${item.path}`);
      console.log(`    "${item.sample}"`);
    }
    if (items.length > 5) console.log(`  ... ${items.length - 5} more`);
  }
}
process.exit(findings.length > 0 ? 1 : 0);
