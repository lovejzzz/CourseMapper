import { cleanText } from './compilerText';

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
