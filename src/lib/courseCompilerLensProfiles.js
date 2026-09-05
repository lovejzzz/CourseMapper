import { cleanText } from './compilerText';

const PRECISE_DISCIPLINE_LENSES = [
  [
    /\b(?:oral history|oral histories|oral historian|narrator interviews?|interview protocols?|audio recording protocols?|transcript(?:ion|s)?|thematic coding of transcripts?)\b/,
    'oral-history fieldwork and interpretation',
    'narrator, consent, recording, transcript, and contextual evidence',
    'ethical interpretation or public-history decision',
    'oral historian',
    'interview, transcript, archive, or public-history scenario',
  ],
  [
    /\b(?:marine biology|marine ecology|ocean systems|intertidal transects?|seagrass|coral health)\b/,
    'marine field ecology',
    'field observation, sample, and ecological evidence',
    'ecological interpretation',
    'marine field researcher',
    'transect, sample, or habitat case',
  ],
  [
    /\b(?:corporate tax|tax strategy|corporate taxable income|stock redemptions?|consolidated returns?|transfer pricing)\b/,
    'corporate taxation and transaction planning',
    'statutory, transaction, and tax-calculation evidence',
    'tax-position decision',
    'corporate tax analyst',
    'corporate transaction or return scenario',
  ],
  [
    /\b(?:baroque counterpoint|species counterpoint|two voice invention|fugue subject|stretto|tonal answer)\b/,
    'counterpoint and score analysis',
    'notated voice-leading and harmonic evidence',
    'contrapuntal design decision',
    'composer-analyst',
    'score excerpt or contrapuntal passage',
  ],
  [
    /\b(?:applied epidemiology|disease frequency|outbreak case definitions?|cohort study design|case control study|screening test performance)\b/,
    'applied epidemiology',
    'population, study-design, and surveillance evidence',
    'epidemiologic inference',
    'epidemiologist',
    'outbreak, screening, or study-design case',
  ],
  [
    /\b(?:civil procedure|subject matter jurisdiction|personal jurisdiction|pleading standards|claim preclusion|class actions)\b/,
    'civil procedure and litigation analysis',
    'procedural rule, record, and precedent evidence',
    'procedural legal conclusion',
    'litigation analyst',
    'case record or procedural hypothetical',
  ],
  [
    /\b(?:materials science|crystal lattices?|phase diagrams?|mechanical testing|fracture and fatigue|material selection)\b/,
    'materials science laboratory',
    'microstructure, property, and test evidence',
    'material-selection or failure-analysis decision',
    'materials engineer',
    'sample, test, or design-failure scenario',
  ],
  [
    /\b(?:second[-\s]language pedagogy|language acquisition perspectives?|communicative competence|corrective feedback|language assessment)\b/,
    'second-language teaching practice',
    'learner-language and classroom evidence',
    'language-instruction decision',
    'language teacher',
    'learner-language sample or classroom task',
  ],
  [
    /\b(?:urban planning|land use analysis|transportation networks?|housing affordability|zoning alternatives?|planning proposal)\b/,
    'urban planning studio',
    'spatial, demographic, and stakeholder evidence',
    'planning decision',
    'urban planner',
    'site, map, or planning scenario',
  ],
  [
    /\b(?:clinical and medical ethics|medical ethics|informed consent|decision-making capacity|ethics consultation)\b/,
    'clinical ethics deliberation',
    'case facts, stakeholder values, and moral argument evidence',
    'clinical ethics judgment',
    'clinical ethicist',
    'patient-care ethics case',
  ],
  [
    /\b(?:database systems?|relational data models?|entity relationship design|sql queries|normalization|query optimization)\b/,
    'database design and implementation',
    'schema, query, transaction, and performance evidence',
    'database design decision',
    'database engineer',
    'schema, query, or transaction scenario',
  ],
  [
    /\b(?:modern art history|visual culture|impressionism|cubism|abstract expressionism|curatorial argument)\b/,
    'modern art-historical interpretation',
    'formal, contextual, and comparative visual evidence',
    'art-historical interpretation',
    'art historian',
    'artwork, exhibition, or visual comparison',
  ],
  [
    /\b(?:exercise and sports physiology|sports physiology|energy systems|neuromuscular function|performance testing|training program design)\b/,
    'exercise physiology and performance analysis',
    'physiological, workload, and performance evidence',
    'training or performance decision',
    'exercise physiologist',
    'athlete test or training-response scenario',
  ],
];

export function resolvePreciseDisciplineLens(value) {
  const text = cleanText(value).toLowerCase();
  const matched = PRECISE_DISCIPLINE_LENSES.find(([pattern]) => pattern.test(text));
  if (!matched) return null;
  const [, domain, evidenceNoun, decisionNoun, learnerRole, exampleNoun] = matched;
  return { domain, evidenceNoun, decisionNoun, learnerRole, exampleNoun };
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

export function pluralizeLensPhrase(value) {
  const text = cleanText(value);
  if (!text) return '';
  const pluralizePart = (part) => {
    const cleaned = cleanText(part);
    if (!cleaned || /s$/i.test(cleaned)) return cleaned;
    if (/\bdecision$/i.test(cleaned)) return cleaned.replace(/\bdecision$/i, 'decisions');
    if (/\by$/i.test(cleaned)) return cleaned.replace(/y$/i, 'ies');
    return `${cleaned}s`;
  };
  if (/\s+or\s+/i.test(text)) {
    return text
      .split(/\s+or\s+/i)
      .map(pluralizePart)
      .join(' or ');
  }
  if (/\s+and\s+/i.test(text)) {
    return text
      .split(/\s+and\s+/i)
      .map(pluralizePart)
      .join(' and ');
  }
  return pluralizePart(text);
}

export function alignLensToCourseModality(lens = {}, courseModalityProfile = {}) {
  const primaryMode = courseModalityProfile?.primaryMode || '';
  if (primaryMode === 'data-storytelling-studio') {
    return {
      ...lens,
      domain: /data story|data journalism|data visualization/.test(cleanText(lens.domain).toLowerCase())
        ? lens.domain
        : 'community data storytelling studio',
      evidenceNoun: 'source, transformation, visual, and uncertainty evidence',
      decisionNoun: 'data-story decision',
      learnerRole: /journal|story|communicat/.test(cleanText(lens.learnerRole).toLowerCase())
        ? lens.learnerRole
        : 'data storyteller',
      exampleNoun: 'dataset, chart, and source-ledger scenario',
    };
  }
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
