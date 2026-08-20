#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';
import { createServer } from 'vite';
import { Window } from 'happy-dom';

import { DEFAULT_GOLD_SAMPLES } from './goldSampleQualityAudit.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'v0.8.5-quality-sweep');
const DEFAULT_SAMPLE_COUNT = 25;
const REPEATED_LONG_COPY_WARNING_MIN = 6;
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
const DEFAULT_COLUMNS = [
  { key: 'learningGoals', label: 'Learning Goals', enabled: true },
  { key: 'topicSection', label: 'Topics', enabled: true },
  { key: 'learningObjectives', label: 'Learning Objectives', enabled: true },
  { key: 'weeklyAssessments', label: 'Assessments', enabled: true },
  { key: 'asyncActivities', label: 'Asynchronous Activities', enabled: true },
  { key: 'syncActivities', label: 'Synchronous Activities', enabled: true },
  { key: 'technologyNeeded', label: 'Technology Needed', enabled: true },
  { key: 'presentationFormat', label: 'Presentation Format', enabled: true },
  { key: 'supportingResources', label: 'Supporting Resources', enabled: true },
  { key: 'evaluateDesign', label: 'Evaluate Design', enabled: true },
];
const BLOCKER_PATTERNS = [
  {
    id: 'objective-stem-leak',
    pattern: /students?\s+will\s+be\s+able\s+to:?(?:\s|$)/i,
    message: 'Package leaks the objective stem "Students will be able to" into publishable content.',
  },
  {
    id: 'generic-distractor-template',
    pattern:
      /background information and move directly to a general summary|choose the quickest activity|delay .* until all possible/i,
    message: 'Package leaks generic quiz distractor template language.',
  },
  {
    id: 'course-title-as-concept',
    pattern: /\b(?:key term|concept)\s+as\s+used\s+in\s+lesson\b/i,
    message: 'Package contains circular key-term definition language.',
  },
];
const INTERNAL_REPETITION_SCAN_KEYS = new Set([
  'accessibilityPlan',
  'anchorExampleSet',
  'anchorExamples',
  'assessmentArchitecture',
  'assessmentCadence',
  'assessmentValidity',
  'blueprintGrounding',
  'calibrationPlan',
  'calibrationProtocol',
  'classSessionPlan',
  'classroomDryRun',
  'classroomEvidenceLoop',
  'compilerDecision',
  'compilerDecisionMatrix',
  'conceptDependencyPlan',
  'courseModalityProfile',
  'difficultyProfile',
  'evidenceResponsePlan',
  'feedbackCycle',
  'gradingCalibration',
  'gradingCalibrationPlan',
  'instructorFeedbackLoad',
  'instructionalMoveGuide',
  'instructionalRationale',
  'learnerContextCue',
  'learningTransferPlan',
  'masteryEvidencePlan',
  'modalityCue',
  'modalityDecode',
  'objectiveEvidenceChecklist',
  'practiceProgressionPlan',
  'prerequisitePlan',
  'criterionObjectiveAlignment',
  'criterionWeightPlan',
  'criterionEvidenceMap',
  'criterionWeightGuidance',
  'qualityReceipt',
  'qualitySummary',
  'quizBlueprint',
  'readyToTeachSupport',
  'reviewActionability',
  'sourceAnchors',
  'sourceEvidenceTrace',
  'sourceGrounding',
  'sourceRisk',
  'sourceUsePlan',
  'scorerCalibrationUse',
  'tags',
  'teachingIntent',
  'validityEvidence',
]);

let runtimePromise = null;

function installHeadlessDomShim() {
  // Node 25 exposes Web Storage through warning-emitting accessors unless a
  // backing file is configured. The sweep supplies happy-dom's browser-owned
  // storage instead, so remove only those unconfigured Node accessors before
  // DOCX's browser bundle probes the runtime.
  for (const name of ['localStorage', 'sessionStorage']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    if (typeof descriptor?.get === 'function') delete globalThis[name];
  }

  if (!globalThis.window || !globalThis.document) {
    const window = new Window();
    Object.defineProperty(globalThis, 'window', { value: window, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'HTMLElement', { value: window.HTMLElement, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'HTMLCanvasElement', {
      value: window.HTMLCanvasElement,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'XMLSerializer', {
      value: window.XMLSerializer,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'DOMParser', { value: window.DOMParser, configurable: true, writable: true });
  }

  const fakeCtxFactory = () => {
    let font = '12px sans';
    return {
      get font() {
        return font;
      },
      set font(value) {
        font = value;
      },
      measureText(text) {
        const match = String(font).match(/(\d+(?:\.\d+)?)px/);
        const px = match ? parseFloat(match[1]) : 12;
        return { width: String(text || '').length * px * 0.55 };
      },
      fillText() {},
      strokeText() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      rotate() {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    };
  };

  if (globalThis.HTMLCanvasElement) {
    globalThis.HTMLCanvasElement.prototype.getContext = function getContext(type) {
      return type === '2d' ? fakeCtxFactory() : null;
    };
  }
  if (globalThis.OffscreenCanvas) {
    globalThis.OffscreenCanvas.prototype.getContext = function getContext(type) {
      return type === '2d' ? fakeCtxFactory() : null;
    };
  }
}

function parseArgs(argv = []) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    count: DEFAULT_SAMPLE_COUNT,
    sampleIds: [],
    keepZips: true,
    progress: true,
    releaseLabel: 'v0.8.5',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output-dir') args.outputDir = path.resolve(argv[++i]);
    else if (arg === '--count') args.count = Number(argv[++i]);
    else if (arg === '--release-label') args.releaseLabel = String(argv[++i] || '').trim() || args.releaseLabel;
    else if (arg === '--sample' || arg === '--samples') {
      args.sampleIds.push(
        ...String(argv[++i] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    } else if (arg === '--no-zips') args.keepZips = false;
    else if (arg === '--no-progress') args.progress = false;
  }
  return args;
}

async function loadRuntime() {
  if (runtimePromise) return runtimePromise;
  installHeadlessDomShim();
  runtimePromise = (async () => {
    const server = await createServer({
      appType: 'custom',
      cacheDir: path.join(ROOT, 'node_modules', '.vite', `v085-quality-sweep-${process.pid}`),
      logLevel: 'error',
      optimizeDeps: { entries: [], noDiscovery: true },
      server: { middlewareMode: true, hmr: false, ws: false },
    });
    await server.pluginContainer.buildStart({});
    try {
      const [compiler, finalizer, zipExporter, requiredAssets, exportQualityAudit, readiness, contentQuality] =
        await Promise.all([
          server.ssrLoadModule('/src/lib/courseBlueprintCompiler.js'),
          server.ssrLoadModule('/src/lib/packageFinalizer.js'),
          server.ssrLoadModule('/src/lib/packageZipExporter.js'),
          server.ssrLoadModule('/src/lib/requiredLabAssets.js'),
          server.ssrLoadModule('/tests/lib/exportQualityAudit.js'),
          server.ssrLoadModule('/src/lib/deliverableReadiness.js'),
          server.ssrLoadModule('/src/lib/contentQualityChecks.js'),
        ]);
      return {
        server,
        buildCourseBlueprint: compiler.buildCourseBlueprint,
        compileBlueprintDeliverables: compiler.compileBlueprintDeliverables,
        repairCourseMapReadiness: readiness.repairCourseMapReadiness,
        runDeterministicPackageFinalizer: finalizer.runDeterministicPackageFinalizer,
        buildCourseMaterialsZip: zipExporter.buildCourseMaterialsZip,
        collectRequiredLabAssets: requiredAssets.collectRequiredLabAssets,
        auditCourseMaterialsZip: exportQualityAudit.auditCourseMaterialsZip,
        auditDeliverableContentQuality: contentQuality.auditDeliverableContentQuality,
        close: () => server.close(),
      };
    } catch (err) {
      await server.close();
      throw err;
    }
  })();
  return runtimePromise;
}

async function closeRuntime() {
  if (!runtimePromise) return;
  const runtime = await runtimePromise;
  await runtime.close();
  runtimePromise = null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function sampleCourseName(sample) {
  return sample?.project?.courseMap?.courseName || sample?.courseMap?.courseName || sample?.label || sample?.id;
}

function selectSweepSamples({ count = DEFAULT_SAMPLE_COUNT, sampleIds = [] } = {}) {
  const available = new Map(DEFAULT_GOLD_SAMPLES.map((sample) => [sample.id, sample]));
  if (sampleIds.length > 0) {
    const selected = sampleIds.map((id) => available.get(id));
    const missing = sampleIds.filter((id) => !available.has(id));
    if (missing.length > 0) throw new Error(`Unknown sample id(s): ${missing.join(', ')}`);
    return selected;
  }

  const selected = [];
  const seenCourseNames = new Set();
  for (const sample of DEFAULT_GOLD_SAMPLES) {
    const courseName = sampleCourseName(sample);
    const key = String(courseName || '').toLowerCase();
    if (!sample?.project?.courseMap || !key || seenCourseNames.has(key)) continue;
    seenCourseNames.add(key);
    selected.push(sample);
    if (selected.length >= count) break;
  }
  if (selected.length < count) {
    throw new Error(`Only found ${selected.length} unique course samples; requested ${count}.`);
  }
  return selected;
}

function stripLessonPrefix(title = '') {
  return String(title)
    .replace(/^(?:lesson|week|module)\s*\d+\s*[:.-]?\s*/i, '')
    .trim();
}

function collectStrings(value, output = []) {
  if (value == null) return output;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function textify(value) {
  return collectStrings(value).join(' ').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(value) {
  return (String(value || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTextNodes(xml) {
  const text = [];
  const pattern = /<(?:w:t|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|t)>/g;
  let match = pattern.exec(xml);
  while (match) {
    text.push(decodeXmlEntities(match[1]));
    match = pattern.exec(xml);
  }
  return text.join(' ').replace(/\s+/g, ' ').trim();
}

function extractXmlTextSegments(xml) {
  const segments = [];
  const blockPatterns = [
    /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,
    /<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g,
    /<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g,
  ];

  for (const pattern of blockPatterns) {
    let match = pattern.exec(xml);
    while (match) {
      const text = extractTextNodes(match[0]);
      if (text) segments.push(text);
      match = pattern.exec(xml);
    }
  }

  if (segments.length === 0) {
    const text = extractTextNodes(xml);
    if (text) segments.push(text);
  }
  return segments;
}

function makeDeliverableEntries(compiled) {
  return Object.fromEntries(
    Object.entries(compiled || {}).map(([featureId, data]) => [featureId, { status: 'done', data, error: null }]),
  );
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function questionType(question) {
  return String(question?.type || question?.ty || '').trim();
}

function questionOptions(question) {
  return asArray(question?.options || question?.op);
}

function answerLetter(question) {
  const answer = String(question?.answer || question?.an || '').trim();
  const directLetter = answer
    .match(/^[A-D](?:[.)]|\s*$)/i)?.[0]
    ?.slice(0, 1)
    ?.toUpperCase();
  if (directLetter) return directLetter;
  const normalizedAnswer = normalizeText(answer);
  if (!normalizedAnswer) return null;
  const index = questionOptions(question).findIndex((option) => {
    const normalizedOption = normalizeText(String(option || '').replace(/^[A-D][.)]\s*/i, ''));
    return normalizedOption === normalizedAnswer || normalizeText(option) === normalizedAnswer;
  });
  return index >= 0 ? String.fromCharCode('A'.charCodeAt(0) + index) : null;
}

function getQuizQuestions(quiz) {
  return asArray(quiz?.questions || quiz?.qs || quiz?.items);
}

function collectQuizPatternIssues(deliverables) {
  const issues = [];
  const quizzes = deliverables?.quizBank?.data?.quizzes || deliverables?.quizBank?.data?.quizBank || [];
  quizzes.forEach((quiz, lessonIndex) => {
    const multipleChoice = getQuizQuestions(quiz).filter((question) =>
      /multiple[-_ ]choice/i.test(questionType(question)),
    );
    if (multipleChoice.length < 3) return;
    const counts = multipleChoice.reduce((acc, question) => {
      const letter = answerLetter(question);
      if (letter) acc[letter] = (acc[letter] || 0) + 1;
      return acc;
    }, {});
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] === multipleChoice.length) {
      issues.push(`Lesson ${lessonIndex + 1} quiz keys every multiple-choice answer as ${dominant[0]}.`);
    }
  });
  return issues;
}

function collectLessonRangeIssues(courseMap, packageText) {
  const issues = [];
  const lessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  for (const match of packageText.matchAll(/\bLessons?\s+1\s*[–-]\s*(\d{1,2})\b/gi)) {
    const referenced = Number(match[1]);
    if (Number.isFinite(referenced) && referenced > lessonCount) {
      issues.push(`Package references Lessons 1-${referenced}, but the course has only ${lessonCount} lessons.`);
    }
  }
  for (const match of packageText.matchAll(/\bLesson\s+(\d{1,2})\s*:/gi)) {
    const referenced = Number(match[1]);
    if (Number.isFinite(referenced) && referenced > lessonCount) {
      issues.push(`Package references Lesson ${referenced}, but the course has only ${lessonCount} lessons.`);
    }
  }
  return [...new Set(issues)];
}

function collectRepeatedLongCopyIssuesFromSegments(segments) {
  const snippets = new Map();
  const filesBySnippet = new Map();

  for (const segment of segments) {
    const clean = String(segment?.text || segment || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      /\b(use this learner context|compile lesson plans|slides discussions assignments rubrics quizzes|check whether|distinct ready partial and needs support|review flags before finalizing)\b/i.test(
        clean,
      ) ||
      /^\s*suggested visual\b/i.test(clean) ||
      /\bacademic integrity submitted work must represent the student or team effort cite outside sources or approved tools\b/i.test(
        normalizeText(clean),
      )
    ) {
      continue;
    }
    const sentenceLike = /[.!?:;]/.test(clean);
    if (sentenceLike && wordCount(clean) >= 18 && clean.length >= 110) {
      const key = normalizeText(clean).slice(0, 220);
      snippets.set(key, (snippets.get(key) || 0) + 1);
      if (segment?.fileName) {
        if (!filesBySnippet.has(key)) filesBySnippet.set(key, new Set());
        filesBySnippet.get(key).add(segment.fileName);
      }
    }
  }

  return [...snippets.entries()]
    .filter(
      ([snippet, count]) => count > REPEATED_LONG_COPY_WARNING_MIN && (filesBySnippet.get(snippet)?.size || 0) > 3,
    )
    .slice(0, 25)
    .map(([snippet, count]) => {
      const fileCount = filesBySnippet.get(snippet)?.size || 0;
      const fileSuffix = fileCount > 0 ? ` across ${fileCount} exported file${fileCount === 1 ? '' : 's'}` : '';
      return `Long exported copy repeats ${count} times${fileSuffix}: "${snippet.slice(0, 120)}..."`;
    });
}

function collectRepeatedLongCopyIssues(deliverables) {
  const segments = [];
  function visit(value) {
    if (typeof value === 'string') {
      segments.push(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, nested]) => {
        if (
          INTERNAL_REPETITION_SCAN_KEYS.has(key) ||
          /receipt|proof|trace|contract|audit|evidenceMap|ledger|provenance|metadata/i.test(key)
        ) {
          return;
        }
        visit(nested);
      });
    }
  }
  visit(deliverables);
  return collectRepeatedLongCopyIssuesFromSegments(segments);
}

function expectedZipFolders() {
  return [
    'Course Map',
    'Syllabus',
    'Lesson Plans',
    'Slide Decks',
    'Assignment Briefs',
    'Rubrics',
    'Discussion Prompts',
    'Quiz & Exam Bank',
    'Study Guides',
    'Course FAQ',
  ];
}

function buildFaqExpectations(courseMap) {
  return Object.fromEntries(
    (courseMap?.lessons || []).map((lesson, index) => [
      `Lesson ${index + 1}: ${stripLessonPrefix(lesson.title || lesson.lessonTitle || 'Lesson')}`,
      5,
    ]),
  );
}

async function writeBlob(blob, filePath) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return buffer.length;
}

async function auditDocxListStructure(zipPath) {
  const issues = [];
  const buffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buffer);
  const docxNames = Object.keys(zip.files).filter((name) => /\.docx$/i.test(name));
  for (const docxName of docxNames) {
    const nested = await JSZip.loadAsync(await zip.file(docxName).async('nodebuffer'));
    const xml = await nested.file('word/document.xml')?.async('string');
    if (!xml) continue;
    if (/•\s/.test(xml)) {
      issues.push(`${docxName}: contains literal bullet glyphs instead of Word list structure.`);
    }
  }
  return issues;
}

async function collectZipTextSegments(zipPath) {
  const segments = [];
  const buffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  const pushXmlSegments = async (nested, fileName, partName) => {
    const file = nested.file(partName);
    if (!file) return;
    const xml = await file.async('string');
    extractXmlTextSegments(xml).forEach((text) => segments.push({ fileName, partName, text }));
  };

  for (const name of names) {
    const lower = name.toLowerCase();
    const file = zip.file(name);
    if (!file) continue;
    if (lower.endsWith('.docx')) {
      const nested = await JSZip.loadAsync(await file.async('nodebuffer'));
      await pushXmlSegments(nested, name, 'word/document.xml');
      for (const partName of Object.keys(nested.files).sort()) {
        if (/^word\/(?:header|footer)\d+\.xml$/.test(partName)) {
          await pushXmlSegments(nested, name, partName);
        }
      }
      continue;
    }
    if (lower.endsWith('.pptx')) {
      const nested = await JSZip.loadAsync(await file.async('nodebuffer'));
      for (const partName of Object.keys(nested.files).sort()) {
        if (/^ppt\/(?:slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(partName)) {
          await pushXmlSegments(nested, name, partName);
        }
      }
      continue;
    }
    if (lower.endsWith('.xlsx')) {
      const nested = await JSZip.loadAsync(await file.async('nodebuffer'));
      await pushXmlSegments(nested, name, 'xl/sharedStrings.xml');
      for (const partName of Object.keys(nested.files).sort()) {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(partName)) {
          await pushXmlSegments(nested, name, partName);
        }
      }
      continue;
    }
    if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      const text = (await file.async('nodebuffer')).toString('utf8');
      text
        .split(/\n{2,}/)
        .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .forEach((chunk) => segments.push({ fileName: name, partName: name, text: chunk }));
    }
  }

  return segments;
}

async function collectZipRepeatedLongCopyIssues(zipPath) {
  const segments = await collectZipTextSegments(zipPath);
  return collectRepeatedLongCopyIssuesFromSegments(segments);
}

function formatZipExportBlockers(error) {
  if (Array.isArray(error?.failures) && error.failures.length > 0) {
    return error.failures.map((failure) => {
      const target = failure.path || failure.label || failure.featureId || 'package';
      return `ZIP export failed for ${target}: ${failure.message || 'Unknown export failure.'}`;
    });
  }
  return [`ZIP export failed: ${error?.message || 'Unknown export failure.'}`];
}

function collectPackageBlockers({
  courseMap,
  deliverables,
  finalizer,
  requiredAssets,
  zipAudit,
  zipStructureIssues,
  zipCopyWarnings,
}) {
  const blockers = [];
  const warnings = [];
  const packageText = textify([courseMap, deliverables]);
  const nonDataScience = requiredAssets.length === 0;

  if (finalizer.readiness?.blockers?.length) {
    blockers.push(...finalizer.readiness.blockers.map((issue) => `Readiness: ${issue.message}`));
  }
  if (finalizer.status === 'needs_retry' || finalizer.status === 'blocked') {
    blockers.push(`Finalizer status is ${finalizer.status}: ${finalizer.message}`);
  } else if (finalizer.status === 'needs_review') {
    warnings.push(`Finalizer review warning: ${finalizer.message}`);
  }
  if (finalizer.readiness?.warnings?.length) {
    warnings.push(...finalizer.readiness.warnings.map((issue) => `Readiness warning: ${issue.message}`));
  }

  const semanticErrors = (finalizer.healthReport?.findings || []).filter(
    (finding) => finding.severity === 'error' && finding.category === 'semanticQuality',
  );
  blockers.push(...semanticErrors.map((finding) => `Semantic quality: ${finding.message}`));

  for (const check of BLOCKER_PATTERNS) {
    if (check.pattern.test(packageText)) blockers.push(check.message);
  }
  blockers.push(...collectLessonRangeIssues(courseMap, packageText));
  blockers.push(...collectQuizPatternIssues(deliverables).map((issue) => `Quiz pattern: ${issue}`));

  if (nonDataScience && /\b(Riverton|Westbrook)\b/.test(packageText)) {
    blockers.push('Non-data-science package contains invented Riverton/Westbrook case-packet language.');
  }
  if (nonDataScience && /\b(?:jupyter|ipynb|model card|starter notebook)\b/i.test(packageText)) {
    blockers.push('Non-data-science package references notebook/model-card lab assets.');
  }

  if (Array.isArray(zipAudit?.issues) && zipAudit.issues.length > 0) {
    const filteredZipIssues = zipAudit.issues.filter(
      (issue) => !(nonDataScience && /^Data-science package references notebooks/i.test(issue)),
    );
    blockers.push(...filteredZipIssues.map((issue) => `ZIP audit: ${issue}`));
  }
  if (Array.isArray(zipStructureIssues) && zipStructureIssues.length > 0) {
    blockers.push(...zipStructureIssues.map((issue) => `DOCX structure: ${issue}`));
  }
  warnings.push(...(zipCopyWarnings || collectRepeatedLongCopyIssues(deliverables)));

  return {
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
  };
}

async function auditSample({ sample, runtime, outputDir, keepZips }) {
  const sourceCourseMap = cloneJson(sample.project.courseMap);
  const normalizedSourceCourseMap = {
    ...sourceCourseMap,
    lessons: Array.isArray(sourceCourseMap.lessons) ? sourceCourseMap.lessons : [],
  };
  // Match the real generation path before blueprint construction. Imported
  // maps can contain blank/TBD lesson identities and sparse section fields;
  // compiling those raw rows while finalizing against a different repaired
  // identity creates false cross-artifact mismatch blockers and fails to test
  // the package instructors actually receive.
  const courseMapRepair = runtime.repairCourseMapReadiness({
    courseMap: normalizedSourceCourseMap,
    columns: DEFAULT_COLUMNS,
  });
  const courseMap = courseMapRepair.courseMap || normalizedSourceCourseMap;
  const blueprint = runtime.buildCourseBlueprint(courseMap, { enrichment: sample.enrichment || {} });
  const compiled = runtime.compileBlueprintDeliverables(blueprint, FEATURES, {
    configMap: {
      courseFaq: { questionsPerLesson: 5 },
    },
  });
  const deliverables = makeDeliverableEntries(compiled);
  const finalizer = runtime.runDeterministicPackageFinalizer({
    courseMap,
    deliverables,
    selectedFeatures: FEATURES,
    columns: DEFAULT_COLUMNS,
    includeClassroomReadiness: true,
    blockOnClassroomWarnings: false,
    includePedagogicalValidation: true,
    blockOnValidationWarnings: false,
    retryWarnings: false,
    blueprint,
    deliverableConfig: {
      courseFaq: { questionsPerLesson: 5 },
    },
  });
  const requiredAssets = runtime.collectRequiredLabAssets({ courseMap: finalizer.courseMap });
  let zipResult = null;
  let zipPath = null;
  let zipBytes = 0;
  let zipAudit = { issues: [], fileCount: 0, files: [] };
  let zipStructureIssues = [];
  let zipCopyWarnings = [];
  let zipExportBlockers = [];
  try {
    zipResult = await runtime.buildCourseMaterialsZip({
      courseMap: finalizer.courseMap,
      deliverables: finalizer.deliverables,
      columns: DEFAULT_COLUMNS,
      courseName: finalizer.courseMap.courseName,
      readiness: finalizer.readiness,
      featureIds: ['courseMap', ...FEATURES],
    });
    const zipDir = path.join(outputDir, 'zips');
    await fs.mkdir(zipDir, { recursive: true });
    const safeZipName = `${sample.id}.zip`;
    zipPath = path.join(zipDir, safeZipName);
    zipBytes = await writeBlob(zipResult.blob, zipPath);
    zipAudit = await runtime.auditCourseMaterialsZip(zipPath, {
      expectedFolders: expectedZipFolders(),
      expectedFaqQuestionsPerLesson: buildFaqExpectations(finalizer.courseMap),
      minSpeakerNoteWords: 16,
    });
    zipStructureIssues = await auditDocxListStructure(zipPath);
    zipCopyWarnings = await collectZipRepeatedLongCopyIssues(zipPath);
    if (!keepZips) await fs.rm(zipPath, { force: true });
  } catch (error) {
    zipExportBlockers = formatZipExportBlockers(error);
  }
  const quality = collectPackageBlockers({
    courseMap: finalizer.courseMap,
    deliverables: finalizer.deliverables,
    finalizer,
    requiredAssets,
    zipAudit,
    zipStructureIssues,
    zipCopyWarnings,
  });
  const contentQualityFindings = FEATURES.flatMap((featureId) => {
    const entry = finalizer.deliverables?.[featureId];
    if (entry?.status !== 'done' || !entry.data) return [];
    return runtime.auditDeliverableContentQuality(featureId, entry.data).findings.map((finding) => ({
      featureId,
      ...finding,
    }));
  });
  quality.blockers.unshift(...zipExportBlockers);
  return {
    sampleId: sample.id,
    label: sample.label,
    courseName: finalizer.courseMap.courseName,
    lessons: finalizer.courseMap.lessons.length,
    modality: sample.expectations?.courseModality || finalizer.healthReport?.courseModality || 'unknown',
    status: quality.blockers.length > 0 ? 'fail' : 'pass',
    blockerCount: quality.blockers.length,
    warningCount: quality.warnings.length,
    blockers: quality.blockers,
    warnings: quality.warnings,
    repairsApplied: finalizer.repairsApplied,
    readinessStatus: finalizer.readiness?.status || 'unknown',
    readinessWarnings: finalizer.readiness?.warnings?.length || 0,
    contentQualityFindings,
    healthErrors: finalizer.healthReport?.errorCount || 0,
    healthWarnings: finalizer.healthReport?.warningCount || 0,
    requiredAssetCount: requiredAssets.length,
    zip: {
      path: keepZips && zipPath ? path.relative(ROOT, zipPath) : null,
      bytes: zipBytes,
      files: zipAudit.fileCount,
      manifestFiles: zipResult?.files?.length || 0,
      hasRequiredAssetsMarker: zipAudit.files.some((name) => /^Required Assets\//.test(name)),
    },
  };
}

function summarize(results) {
  const failed = results.filter((result) => result.status !== 'pass');
  const warningCount = results.reduce((sum, result) => sum + result.warningCount, 0);
  const blockerCount = results.reduce((sum, result) => sum + result.blockerCount, 0);
  const modalities = [...new Set(results.map((result) => result.modality).filter(Boolean))];
  return {
    status: failed.length === 0 ? 'pass' : 'fail',
    sampleCount: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    blockerCount,
    warningCount,
    modalities,
    minLessonCount: Math.min(...results.map((result) => result.lessons)),
    maxLessonCount: Math.max(...results.map((result) => result.lessons)),
    totalZipFiles: results.reduce((sum, result) => sum + result.zip.files, 0),
  };
}

function renderMarkdown(payload) {
  const lines = [
    `# ${payload.meta.releaseLabel || 'v0.8.5'} Quality Sweep`,
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Status: ${payload.summary.status}`,
    `Courses: ${payload.summary.passed}/${payload.summary.sampleCount} passed`,
    `Blockers: ${payload.summary.blockerCount}`,
    `Warnings: ${payload.summary.warningCount}`,
    `Lesson range: ${payload.summary.minLessonCount}-${payload.summary.maxLessonCount}`,
    `Modalities: ${payload.summary.modalities.join(', ') || 'unknown'}`,
    `Export files inspected: ${payload.summary.totalZipFiles}`,
    '',
    '## Course Matrix',
    '',
    '| Course | Lessons | Status | Blockers | Warnings | Repairs | ZIP files | Required assets |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |',
    ...payload.results.map(
      (result) =>
        `| ${result.courseName} | ${result.lessons} | ${result.status} | ${result.blockerCount} | ${result.warningCount} | ${result.repairsApplied} | ${result.zip.files} | ${result.requiredAssetCount} |`,
    ),
    '',
  ];
  const failed = payload.results.filter((result) => result.blockers.length > 0);
  if (failed.length > 0) {
    lines.push('## Blockers', '');
    for (const result of failed) {
      lines.push(`### ${result.courseName}`, '');
      result.blockers.forEach((blocker) => lines.push(`- ${blocker}`));
      lines.push('');
    }
  }
  const warnings = payload.results.filter((result) => result.warnings.length > 0);
  if (warnings.length > 0) {
    lines.push('## Warnings For Refinement', '');
    for (const result of warnings) {
      lines.push(`### ${result.courseName}`, '');
      result.warnings.slice(0, 12).forEach((warning) => lines.push(`- ${warning}`));
      if (result.warnings.length > 12) lines.push(`- +${result.warnings.length - 12} more warnings`);
      lines.push('');
    }
  }
  lines.push('## Evidence', '');
  lines.push('- Every course was compiled through `buildCourseBlueprint` and `compileBlueprintDeliverables`.');
  lines.push('- Every package was finalized through `runDeterministicPackageFinalizer`.');
  lines.push('- Every package built a ZIP through `buildCourseMaterialsZip`.');
  lines.push(
    '- ZIP output was parsed for Office placeholder/internal text, visible PPTX slide density, speaker-note depth, FAQ counts, folders, and DOCX bullet structure.',
  );
  return lines.join('\n');
}

async function writeReport(payload, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));
  await fs.writeFile(markdownPath, renderMarkdown(payload));
  return { jsonPath, markdownPath };
}

async function run(options = {}) {
  const runtime = await loadRuntime();
  const samples = selectSweepSamples({ count: options.count, sampleIds: options.sampleIds });
  const releaseLabel = options.releaseLabel || 'v0.8.5';
  await fs.mkdir(options.outputDir, { recursive: true });
  const results = [];
  const startedAt = Date.now();
  for (const [index, sample] of samples.entries()) {
    if (options.progress) {
      console.log(`[${releaseLabel}:sweep] ${index + 1}/${samples.length} start ${sampleCourseName(sample)}`);
    }
    const result = await auditSample({ sample, runtime, outputDir: options.outputDir, keepZips: options.keepZips });
    results.push(result);
    if (options.progress) {
      console.log(
        `[${releaseLabel}:sweep] ${index + 1}/${samples.length} ${result.status} ${result.courseName} blockers=${result.blockerCount} warnings=${result.warningCount} zipFiles=${result.zip.files}`,
      );
    }
  }
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      releaseLabel,
      elapsedMs: Date.now() - startedAt,
      sampleSource: 'DEFAULT_GOLD_SAMPLES unique course maps',
      requestedSampleCount: samples.length,
      outputDir: path.relative(ROOT, options.outputDir),
    },
    summary: summarize(results),
    results,
  };
  const paths = await writeReport(payload, options.outputDir);
  return { payload, paths };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const { payload, paths } = await run(args);
    console.log(`${payload.meta.releaseLabel} quality sweep: ${payload.summary.status}`);
    console.log(`Courses: ${payload.summary.passed}/${payload.summary.sampleCount} passed`);
    console.log(`Report: ${paths.markdownPath}`);
    if (payload.summary.status !== 'pass') process.exitCode = 1;
  } finally {
    await closeRuntime();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
