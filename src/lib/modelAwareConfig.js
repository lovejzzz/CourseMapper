const ASSIGNMENT_TYPE_DEFAULTS = [
  'Essay',
  'Research Paper',
  'Case Study',
  'Reflection',
  'Group Project',
  'Presentation',
];

const BASE_FEATURE_DEFAULTS = {
  courseMap: {
    style: 'Tables',
    outputLength: 'Standard',
  },
  lessonPlans: {
    sessionLength: '75 min',
    detailLevel: 'Standard',
  },
  slideDecks: {
    slidesPerLesson: 12,
    speakerNotes: 'Standard',
  },
  rubrics: {
    criteriaCount: 4,
    performanceLevels: '4 levels',
  },
  quizBank: {
    questionsPerLesson: 8,
    difficultyDist: 'Mixed',
  },
  discussions: {
    formatPreference: 'Any',
  },
  assignments: {
    assignmentTypes: ASSIGNMENT_TYPE_DEFAULTS,
  },
  studyGuides: {
    keyTermsCount: 8,
  },
  courseFaq: {
    questionsPerLesson: 5,
    answerDepth: 'Standard',
  },
  syllabus: {
    citationStyle: 'APA 7th',
  },
};

const BASE_RANGES = {
  slideDecks: {
    slidesPerLesson: { min: 8, max: 20 },
    aiImagesTotal: { min: 1, max: 4 },
  },
  rubrics: {
    criteriaCount: { min: 3, max: 8 },
  },
  quizBank: {
    questionsPerLesson: { min: 3, max: 8 },
  },
  studyGuides: {
    keyTermsCount: { min: 4, max: 20 },
  },
  courseFaq: {
    questionsPerLesson: { min: 3, max: 8 },
  },
};

function cloneDefaults(value) {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneDefaults(nested)]));
  }
  return value;
}

function definedEntries(object = {}) {
  return Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function getOutputLimit(profile = {}, plan = {}) {
  const raw =
    plan.maxOutputTokens ||
    profile.limits?.maxOutputTokens ||
    profile.maxOutputTokens ||
    profile.outputTokenLimit ||
    8192;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8192;
}

function classifyModel(profile = {}, plan = {}) {
  const maxOutputTokens = getOutputLimit(profile, plan);
  const chunkStrategy = plan.chunkStrategy || 'standard';
  const strictSchema = plan.useStrictSchema === true || profile.structuredOutput?.supportsStrictSchema === true;
  const jsonHigh =
    plan.useJsonMode === true ||
    profile.supportsJsonMode === true ||
    profile.jsonReliability === 'high' ||
    profile.structuredOutput?.jsonReliability === 'high';
  const reasoning =
    plan.reasoning?.supported === true ||
    plan.reasoning?.enabledByDefault === true ||
    profile.reasoning?.supported === true;
  const compact = chunkStrategy === 'conservative' || maxOutputTokens < 12000;
  const expansive =
    chunkStrategy === 'expanded' || maxOutputTokens >= 64000 || profile.quality === 'high' || plan.quality === 'high';

  return {
    maxOutputTokens,
    chunkStrategy,
    compact,
    expansive,
    strictSchema,
    jsonHigh,
    reasoning,
  };
}

function buildBasePlan() {
  return {
    mode: 'balanced',
    label: 'Balanced defaults',
    universal: {
      tone: 'Academic',
      style: 'Mixed',
      outputLength: 'Standard',
    },
    features: cloneDefaults(BASE_FEATURE_DEFAULTS),
    ranges: cloneDefaults(BASE_RANGES),
    tags: ['Balanced defaults'],
  };
}

export function createModelAwareConfigPlan(modelCapabilities = {}, generationPlan = {}) {
  const signals = classifyModel(modelCapabilities || {}, generationPlan || {});
  const plan = buildBasePlan();

  if (signals.compact) {
    plan.mode = 'compact';
    plan.label = 'Compact defaults';
    plan.universal = {
      tone: 'Professional',
      style: 'Tables',
      outputLength: 'Standard',
    };
    plan.features.lessonPlans.detailLevel = 'Standard';
    plan.features.slideDecks.slidesPerLesson = 10;
    plan.features.slideDecks.speakerNotes = 'Standard';
    plan.features.rubrics.criteriaCount = 4;
    plan.features.quizBank.questionsPerLesson = 6;
    plan.features.studyGuides.keyTermsCount = 6;
    plan.features.courseFaq.questionsPerLesson = 4;
    plan.features.courseFaq.answerDepth = 'Standard';
    plan.ranges.slideDecks.slidesPerLesson.max = 16;
    plan.ranges.quizBank.questionsPerLesson.max = 8;
    plan.ranges.studyGuides.keyTermsCount.max = 12;
  } else if (signals.expansive || signals.reasoning) {
    plan.mode = 'expanded';
    plan.label = 'Detailed defaults';
    plan.universal = {
      tone: 'Academic',
      style: 'Mixed',
      outputLength: 'Detailed',
    };
    plan.features.lessonPlans.detailLevel = 'Detailed';
    plan.features.slideDecks.slidesPerLesson = 14;
    plan.features.slideDecks.speakerNotes = signals.maxOutputTokens >= 64000 ? 'Full script' : 'Standard';
    plan.features.rubrics.criteriaCount = 5;
    // The deterministic compiler guarantees six core items and can add at
    // most two admitted bank extensions. Never advertise a default the
    // package generator cannot satisfy.
    plan.features.quizBank.questionsPerLesson = 8;
    plan.features.studyGuides.keyTermsCount = 10;
    plan.features.courseFaq.questionsPerLesson = 6;
    plan.features.courseFaq.answerDepth = 'Detailed';
    plan.ranges.slideDecks.slidesPerLesson.max = 24;
    plan.ranges.quizBank.questionsPerLesson.max = 8;
    plan.ranges.studyGuides.keyTermsCount.max = 24;
  }

  if (signals.strictSchema || signals.jsonHigh) {
    plan.tags.push(signals.strictSchema ? 'Strict schema' : 'JSON output');
  }
  if (signals.chunkStrategy === 'conservative') plan.tags.push('Smaller batches');
  if (signals.chunkStrategy === 'expanded') plan.tags.push('Larger batches');
  if (signals.reasoning) plan.tags.push('Reasoning controls');
  if (signals.maxOutputTokens >= 64000) plan.tags.push('Long output');

  plan.signals = signals;
  plan.tags = Array.from(new Set(plan.tags)).slice(0, 5);
  return plan;
}

export function hasExplicitConfigValue(config = {}, key) {
  const value = config?.[key];
  return value !== undefined && value !== null && value !== '';
}

export function getCurrentModelCapabilityProfile(
  modelCapabilities = null,
  provider = '',
  modelId = '',
  generationPlan = {},
) {
  const matchesCurrentModel =
    modelCapabilities?.provider === provider && (!modelCapabilities?.modelId || modelCapabilities.modelId === modelId);
  if (matchesCurrentModel) return modelCapabilities;

  const maxOutputTokens = generationPlan?.maxOutputTokens || generationPlan?.limits?.maxOutputTokens || 8192;
  return {
    provider,
    modelId,
    maxOutputTokens,
    limits: { maxOutputTokens },
    quality: generationPlan?.quality || 'balanced',
  };
}

export function applyModelAwareDeliverableDefaults(featureId, config = {}, modelConfigPlan = buildBasePlan()) {
  const universalDefaults = modelConfigPlan?.universal || {};
  const featureDefaults = modelConfigPlan?.features?.[featureId] || {};
  const defaults = {
    ...cloneDefaults(universalDefaults),
    ...cloneDefaults(featureDefaults),
  };
  const resolved = {
    ...defaults,
    ...Object.fromEntries(definedEntries(config)),
  };
  if (featureId === 'quizBank') {
    const range = modelConfigPlan?.ranges?.quizBank?.questionsPerLesson || BASE_RANGES.quizBank.questionsPerLesson;
    const requested = Number(resolved.questionsPerLesson);
    if (Number.isFinite(requested)) {
      resolved.questionsPerLesson = Math.max(range.min, Math.min(range.max, Math.round(requested)));
    }
  }
  return resolved;
}

export function getEffectiveDeliverableConfig(featureId, configMap = {}, modelConfigPlan = buildBasePlan()) {
  return applyModelAwareDeliverableDefaults(featureId, configMap?.[featureId] || {}, modelConfigPlan);
}

export function applyModelAwareConfigMap(configMap = {}, modelConfigPlan = buildBasePlan()) {
  return Object.fromEntries(
    Object.entries(configMap || {}).map(([featureId, config]) => [
      featureId,
      applyModelAwareDeliverableDefaults(featureId, config, modelConfigPlan),
    ]),
  );
}
