import { sha256HexSync } from '../sha256Sync.js';

/**
 * Small, source-bound fallback library for authentic language-data packets.
 *
 * This is deliberately course-agnostic: evidence is selected from semantic
 * demand signals, never lesson numbers or authored titles. The records are
 * short CC BY 4.0 examples from WALS Online and retain exact form, gloss,
 * translation, locator, attribution, and a conservative claim boundary.
 */

const WALS_ATTRIBUTION = 'WALS Online, edited by Matthew S. Dryer and Martin Haspelmath.';

const CURATED_STRUCTURAL_LANGUAGE_EVIDENCE = Object.freeze([
  Object.freeze({
    family: 'phonology',
    subtype: 'consonant-contrast',
    source: Object.freeze({
      id: 'wals-consonants-1',
      title: 'WALS Online — Consonant Inventories',
      url: 'https://wals.info/chapter/1',
      license: 'CC BY 4.0',
      attribution: `${WALS_ATTRIBUTION} Maddieson, Ian. 2013. Consonant Inventories.`,
      checkedAt: '2026-08-06',
    }),
    example: Object.freeze({
      id: 'wals-1-english-minimal-sets',
      language: 'English',
      form: 'pin · tin · kin · fin · thin · sin · shin',
      gloss: 'word-initial consonant contrast set',
      translation: 'distinct English words',
      analysisFocus:
        'Phonetic and phonological identification: the forms differ at the beginning, supporting a consonant-inventory contrast analysis.',
      sourceId: 'wals-consonants-1',
      sourceLocator: 'Chapter 1, section 1, paragraphs 2–3',
      communityContext:
        'This controlled English comparison illustrates one inventory method; it does not establish every dialectal sound contrast.',
      comparisonRelation: Object.freeze({
        protocol: 'coursemapper-authentic-evidence-relation-v1',
        relationId: 'english-initial-consonant-contrast',
        kind: 'within-record-contrast',
        operandLabels: Object.freeze(['pin', 'tin', 'kin', 'fin', 'thin', 'sin', 'shin']),
        sharedFeature: 'Each cited form retains the -in rhyme.',
        discriminatingFeature: 'The word-initial consonant changes across the cited forms.',
      }),
    }),
  }),
  ...[
    ['wals-8-english-lake', 'English', 'lake', 'lake'],
    ['wals-8-spanish-lobo', 'Spanish', 'lobo', 'wolf'],
    ['wals-8-indonesian-laki', 'Indonesian', 'laki', 'husband'],
  ].map(([id, language, form, translation]) =>
    Object.freeze({
      family: 'phonology',
      subtype: 'lateral-comparison',
      source: Object.freeze({
        id: 'wals-laterals-8',
        title: 'WALS Online — Lateral Consonants',
        url: 'https://wals.info/chapter/8',
        license: 'CC BY 4.0',
        attribution: `${WALS_ATTRIBUTION} Maddieson, Ian. 2013. Lateral Consonants.`,
        checkedAt: '2026-08-06',
      }),
      example: Object.freeze({
        id,
        language,
        form,
        gloss: 'initial voiced dental or alveolar lateral approximant',
        translation,
        articulatoryProfile: Object.freeze({
          voicing: 'voiced',
          constrictionPlace: 'dental or alveolar',
          manner: 'lateral approximant',
          airflow: 'air passes along the side of the tongue',
        }),
        analysisFocus: `Phonetic and phonological comparison of the ${language} form “${form}”: the initial l represents a voiced dental or alveolar lateral approximant.`,
        sourceId: 'wals-laterals-8',
        sourceLocator: 'Chapter 8, section 1, paragraph 1',
        communityContext:
          'The cited word illustrates one lateral category; it does not establish every realization in the language or its varieties.',
      }),
    }),
  ),
  ...[
    [
      'wals-13-thai-tone',
      'Thai',
      '/kʰáá/ · /kʰāā/ · /kʰàà/ · /kʰàá/ · /kʰáà/',
      'high · mid · low · rising · falling tone',
      'trade · get stuck · galangal · leg · female-speaker declarative politeness particle',
    ],
    ['wals-13-yoruba-tone', 'Yoruba', '/bí/ · /bī/ · /bì/', 'high · mid · low tone', 'give birth · ask · vomit'],
  ].map(([id, language, form, gloss, translation], index) =>
    Object.freeze({
      family: 'phonology',
      subtype: 'prosody',
      source: Object.freeze({
        id: 'wals-tone-13',
        title: 'WALS Online — Tone',
        url: 'https://wals.info/chapter/13',
        license: 'CC BY 4.0',
        attribution: `${WALS_ATTRIBUTION} Maddieson, Ian. 2013. Tone.`,
        checkedAt: '2026-08-06',
      }),
      example: Object.freeze({
        id,
        language,
        form,
        gloss,
        translation,
        analysisFocus:
          'Prosodic and phonological comparison: pitch pattern distinguishes lexical or grammatical meaning on the cited syllable shape.',
        comparisonRelation: Object.freeze({
          protocol: 'coursemapper-authentic-evidence-relation-v1',
          relationId: `${id}-tone-contrast`,
          kind: 'within-record-tone-contrast',
          operandLabels: form.split(' · '),
          sharedFeature: `The cited forms preserve the same segmental syllable frame in ${language}.`,
          discriminatingFeature:
            'The marked pitch contour changes while the segmental frame is held constant, and the cited gloss or translation changes with it.',
        }),
        sourceId: 'wals-tone-13',
        sourceLocator: `Chapter 13, section 1, paragraph ${index + 5}`,
        communityContext:
          'The cited forms illustrate a bounded tone contrast; pronunciation, distribution, and social use require qualified local instruction.',
      }),
    }),
  ),
  Object.freeze({
    family: 'morphology',
    subtype: 'fusion',
    source: Object.freeze({
      id: 'wals-fusion-20',
      title: 'WALS Online — Fusion of Selected Inflectional Formatives',
      url: 'https://wals.info/chapter/20',
      license: 'CC BY 4.0',
      attribution: `${WALS_ATTRIBUTION} Bickel, Balthasar & Johanna Nichols. 2013. Fusion of Selected Inflectional Formatives.`,
      checkedAt: '2026-08-06',
    }),
    example: Object.freeze({
      id: 'wals-20-fijian-fusion',
      language: 'Boumaa Fijian',
      form: 'Au aa soli-a a=niu vei ira.',
      gloss: '1SG PST give-TR ART=coconut to 3PL',
      translation: 'I gave the coconut to them.',
      analysisFocus:
        'Morphological and morpheme identification: the cited past-tense formative aa is an isolating phonological word.',
      sourceId: 'wals-fusion-20',
      sourceLocator: 'Chapter 20, example 1',
      communityContext:
        'Analyze only the segmentation and fusion claim stated by the source; do not generalize one clause to all Fijian morphology.',
    }),
  }),
  Object.freeze({
    family: 'morphology',
    subtype: 'fusion',
    source: Object.freeze({
      id: 'wals-fusion-20',
      title: 'WALS Online — Fusion of Selected Inflectional Formatives',
      url: 'https://wals.info/chapter/20',
      license: 'CC BY 4.0',
      attribution: `${WALS_ATTRIBUTION} Bickel, Balthasar & Johanna Nichols. 2013. Fusion of Selected Inflectional Formatives.`,
      checkedAt: '2026-08-06',
    }),
    example: Object.freeze({
      id: 'wals-20-turkish-past',
      language: 'Turkish',
      form: 'git-ti · yap-tı · gel-di',
      gloss: 'go-PST · do-PST · come-PST',
      translation: 'went · did · came',
      analysisFocus:
        'Morphological comparison: the cited concatenative past-tense formative varies with vowel harmony and consonant voicing.',
      sourceId: 'wals-fusion-20',
      sourceLocator: 'Chapter 20, section 1, paragraph 4',
      communityContext: 'These cited variants illustrate one formative; they do not exhaust Turkish tense morphology.',
    }),
  }),
  ...[
    [
      'wals-81-japanese-sov',
      'Japanese',
      'John ga tegami o yon-da.',
      'John SUBJ letter OBJ read-PST',
      'John read the letter.',
      'SOV',
    ],
    [
      'wals-81-mandarin-svo',
      'Mandarin',
      'Zhāngsān shōudǎo-le yi-fēng xìn.',
      'Zhangsan receive-PERF one-CLF letter',
      'Zhangsan received a letter.',
      'SVO',
    ],
    [
      'wals-81-irish-vso',
      'Irish',
      'Léann na sagairt na leabhair.',
      'read.PRES the.PL priest.PL the.PL book.PL',
      'The priests are reading the books.',
      'VSO',
    ],
    [
      'wals-81-nias-vos',
      'Nias',
      'i-rino vakhe ina-gu.',
      '3SG.REALIS-cook ABS.rice mother-1SG.POSS',
      'My mother cooked rice.',
      'VOS',
    ],
    [
      'wals-81-hixkaryana-ovs',
      'Hixkaryana',
      'toto y-ahosɨ-ye kamara.',
      'man 3:3-grab-DISTANT.PST jaguar',
      'The jaguar grabbed the man.',
      'OVS',
    ],
    ['wals-81-nadeb-osv', 'Nadëb', 'awad kalapéé hapʉ́h.', 'jaguar child see.IND', 'The child sees the jaguar.', 'OSV'],
  ].map(([id, language, form, gloss, translation, order], index) =>
    Object.freeze({
      family: 'syntax',
      subtype: 'word-order',
      source: Object.freeze({
        id: 'wals-order-81',
        title: 'WALS Online — Order of Subject, Object and Verb',
        url: 'https://wals.info/chapter/81',
        license: 'CC BY 4.0',
        attribution: `${WALS_ATTRIBUTION} Dryer, Matthew S. 2013. Order of Subject, Object and Verb.`,
        checkedAt: '2026-08-06',
      }),
      example: Object.freeze({
        id,
        language,
        form,
        gloss,
        translation,
        analysisFocus: `Syntax and constituent word order: the cited transitive clause illustrates ${order} order.`,
        sourceId: 'wals-order-81',
        sourceLocator: `Chapter 81, example 2${String.fromCharCode(97 + index)}`,
        communityContext:
          'The attested clause supports the stated order in this source; it does not establish every clause order, discourse context, or variety.',
      }),
    }),
  ),
  ...[
    [
      'mit-head-movement-english-v-adv',
      'English',
      'Mary often speaks French.',
      'Mary often speak.3SG French',
      'The finite lexical verb follows the VP adverb in the cited contrast.',
    ],
    [
      'mit-head-movement-french-v-adv',
      'French',
      'Marie parle souvent français.',
      'Marie speak.3SG often French',
      'The finite lexical verb precedes the VP adverb in the cited V-to-I analysis.',
    ],
  ].map(([id, language, form, gloss, focus]) =>
    Object.freeze({
      family: 'syntax',
      subtype: 'head-movement',
      source: Object.freeze({
        id: 'mit-ocw-syntax-lecture-16',
        title: 'MIT OpenCourseWare 24.900 — Lecture 16: Syntax (Part 6)',
        url: 'https://ocw.mit.edu/courses/24-900-introduction-to-linguistics-spring-2022/mit24_900s22_lec16.pdf',
        license: 'CC BY-NC-SA 4.0',
        attribution: 'MIT OpenCourseWare. 24.900 Introduction to Linguistics, Spring 2022, Lecture 16.',
        checkedAt: '2026-08-06',
      }),
      example: Object.freeze({
        id,
        language,
        form,
        gloss,
        translation: language === 'English' ? 'Mary often speaks French.' : 'Mary often speaks French.',
        analysisFocus: `Syntax and head movement mechanism: ${focus}`,
        sourceId: 'mit-ocw-syntax-lecture-16',
        sourceLocator: 'Lecture 16, slides 48–49',
        communityContext:
          'Use the English–French adverb-placement contrast as evidence for the cited analysis, not as proof of every clause or variety.',
      }),
    }),
  ),
]);

export const CURATED_SEMANTICS_PRAGMATICS_EVIDENCE = Object.freeze([
  Object.freeze({
    family: 'semantics-pragmatics',
    subtype: 'lexical-semantics',
    source: Object.freeze({
      id: 'wals-hand-arm-129',
      title: 'WALS Online — Hand and Arm',
      url: 'https://wals.info/chapter/129',
      license: 'CC BY 4.0',
      attribution: `${WALS_ATTRIBUTION} Brown, Cecil H. 2013. Hand and Arm.`,
      checkedAt: '2026-08-05',
    }),
    example: Object.freeze({
      id: 'wals-129-bambara-hand-arm',
      language: 'Bambara',
      form: 'bolo · tègè',
      gloss: 'hand/arm · hand/palm/foot',
      translation: 'upper-limb lexical contrast',
      analysisFocus:
        'Lexical semantics and polysemy: bolo denotes both hand and arm, while tègè is an alternate hand term that also denotes palm and foot.',
      sourceId: 'wals-hand-arm-129',
      sourceLocator: 'Chapter 129, section 1, paragraph 5',
      communityContext:
        'These cited lexical senses support a bounded polysemy analysis; they do not establish every regional, contextual, or speaker-specific use.',
    }),
  }),
  Object.freeze({
    family: 'semantics-pragmatics',
    subtype: 'speech-acts',
    source: Object.freeze({
      id: 'wals-imperative-hortative-72',
      title: 'WALS Online — Imperative-Hortative Systems',
      url: 'https://wals.info/chapter/72',
      license: 'CC BY 4.0',
      attribution: `${WALS_ATTRIBUTION} van der Auwera, Johan, Nina Dobrushina, and Valentin Goussev. 2013. Imperative-Hortative Systems.`,
      checkedAt: '2026-08-05',
    }),
    example: Object.freeze({
      id: 'wals-72-waunana-imperative',
      language: 'Waunana',
      form: 'Cö-ba!',
      gloss: 'eat-IMP.2SG',
      translation: 'Eat!',
      analysisFocus:
        'Pragmatics and speech-act identification: the dedicated second-person singular imperative expresses an appeal to the addressee to perform the future action.',
      sourceId: 'wals-imperative-hortative-72',
      sourceLocator: 'Chapter 72, example 3',
      communityContext:
        'The cited form supports this imperative function; it does not establish the full Waunana paradigm or the social appropriateness of an utterance in every context.',
    }),
  }),
  Object.freeze({
    family: 'semantics-pragmatics',
    subtype: 'modality',
    source: Object.freeze({
      id: 'wals-epistemic-possibility-75',
      title: 'WALS Online — Epistemic Possibility',
      url: 'https://wals.info/chapter/75',
      license: 'CC BY 4.0',
      attribution: `${WALS_ATTRIBUTION} van der Auwera, Johan and Andreas Ammann. 2013. Epistemic Possibility.`,
      checkedAt: '2026-08-05',
    }),
    example: Object.freeze({
      id: 'wals-75-harar-oromo-epistemic',
      language: 'Harar Oromo',
      form: 'Ní d´uf-t-i taa-t-i.',
      gloss: 'FOC come-F-IMPF become-F-IMPF',
      translation: 'She may come.',
      analysisFocus:
        'Semantics and epistemic modality: the cited verbal construction marks the proposition as possible rather than certain relative to the speaker’s knowledge or evidence.',
      sourceId: 'wals-epistemic-possibility-75',
      sourceLocator: 'Chapter 75, example 4',
      communityContext:
        'The example supports epistemic possibility in this construction; it does not establish every modal use of the verb or every Harar Oromo variety.',
    }),
  }),
]);

export const CURATED_LANGUAGE_EVIDENCE = Object.freeze([
  ...CURATED_STRUCTURAL_LANGUAGE_EVIDENCE,
  ...CURATED_SEMANTICS_PRAGMATICS_EVIDENCE,
]);

export function semanticPragmaticDemandSubtype(value) {
  const text = String(value || '').normalize('NFKC');
  if (/\b(?:lexical semantics?|lexical meanings?|word meanings?|polysem|sense and denotation)\w*\b/i.test(text)) {
    return 'lexical-semantics';
  }
  if (/\b(?:speech acts?|utterance functions?|illocution|imperative|hortative)\w*\b/i.test(text)) {
    return 'speech-acts';
  }
  if (/\b(?:modal logic|modal semantics|epistemic|possibility|necessity)\w*\b/i.test(text)) {
    return 'modality';
  }
  if (/\b(?:semantic|meaning|interpretation|pragmatic|context|inference)\w*\b/i.test(text)) {
    return 'general';
  }
  return '';
}

export function semanticPragmaticEvidenceSubtype(example = {}) {
  const analysis = String(example?.analysisFocus || '').normalize('NFKC');
  // Incidental words such as "lexical meaning" inside a phonology record do
  // not change the evidence's declared analytic discipline.
  if (
    /\b(?:head movement|syntax|syntactic|constituent (?:word )?order|word order|morpholog|morpheme|phonetic|phonolog|prosodic|prosody|vowel|consonant)\w*\b/i.test(
      analysis,
    )
  ) {
    return '';
  }
  return semanticPragmaticDemandSubtype(analysis);
}

function operationDemand(value) {
  const text = String(value || '').normalize('NFKC');
  if (
    /\b(?:head movement|syntactic movement|movement analysis|derive|derivation|competing (?:syntactic )?accounts?)\b/i.test(
      text,
    )
  ) {
    return { operation: 'mechanism-explanation', requiredExamples: 2, requiredLanguages: 2 };
  }
  if (/\b(?:typolog|cross[- ]linguistic|universal|generaliz|language variation)\w*\b/i.test(text)) {
    return { operation: 'generalization', requiredExamples: 3, requiredLanguages: 3 };
  }
  if (/\b(?:compar|contrast|distinguish|word order|constituent order)\w*\b/i.test(text)) {
    return { operation: 'comparison', requiredExamples: 2, requiredLanguages: 2 };
  }
  return { operation: 'identification', requiredExamples: 1, requiredLanguages: 1 };
}

export function languageEvidenceDemand(value, { courseContext = '' } = {}) {
  const text = String(value || '').normalize('NFKC');
  const languageCourseContext =
    /\b(?:language|linguistic|multilingual|phonetic|phonolog|morpholog|syntax|semantic|pragmatic|corpus)\w*\b/i.test(
      `${courseContext} ${text}`,
    );
  const projectContext = /\b(?:project|capstone|data presentation|drafting findings|results visualization)\b/i.test(
    text,
  );
  if (languageCourseContext && projectContext) {
    if (
      /\b(?:corpus (?:selection|sampling|annotation|design)|annotat(?:e|ion) (?:scheme|protocol|quality))\b/i.test(text)
    ) {
      return {
        family: 'language-data-methods',
        subtype: 'corpus-methods',
        operation: 'dataset-audit',
        requiredExamples: 3,
        requiredLanguages: 3,
      };
    }
    if (/\b(?:scop|hypothesis|methodolog|proposal|design|develop)\w*\b/i.test(text)) {
      return {
        family: 'language-data-methods',
        subtype: 'project-synthesis',
        operation: 'proposal-defense',
        requiredExamples: 3,
        requiredLanguages: 3,
      };
    }
    if (/\b(?:execut|process|implement|annotat|draft(?:ing)? findings)\w*\b/i.test(text)) {
      return {
        family: 'language-data-methods',
        subtype: 'project-execution',
        operation: 'dataset-audit',
        requiredExamples: 3,
        requiredLanguages: 3,
      };
    }
    if (/\b(?:present|visualiz|result|conclusion|submission|report)\w*\b/i.test(text)) {
      return {
        family: 'language-data-methods',
        subtype: 'project-reporting',
        operation: 'evidence-audit',
        requiredExamples: 2,
        requiredLanguages: 2,
      };
    }
  }
  // A synchronic form/gloss record cannot establish acquisition, social
  // variation, contact, or historical change. These domains require their
  // own explanatory sources rather than borrowing a merely adjacent sound or
  // cross-language example from the packet.
  if (
    /\b(?:language acquisition|first language processing|universal grammar|dialectal|social stratification|language contact|language change|sound change|lexical evolution|structural drift|historical linguistics)\w*\b/i.test(
      text,
    )
  ) {
    return null;
  }
  if (/\b(?:linguistic|language) evidence\b/i.test(text)) {
    return {
      family: 'language-data-methods',
      subtype: 'evidence-foundations',
      operation: 'evidence-audit',
      requiredExamples: 2,
      requiredLanguages: 2,
    };
  }
  if (
    /\b(?:corpus (?:selection|sampling|annotation|design)|annotat(?:e|ion) (?:scheme|protocol|quality)|language data(?:set)? (?:selection|annotation|analysis)|linguistic data(?:set)? (?:selection|annotation|analysis)|authentic (?:language |linguistic )?data(?:set)? (?:application|selection|annotation|analysis)|data set selection)\b/i.test(
      text,
    ) &&
    languageCourseContext
  ) {
    return {
      family: 'language-data-methods',
      subtype: 'corpus-methods',
      operation: 'dataset-audit',
      requiredExamples: 3,
      requiredLanguages: 3,
    };
  }
  if (
    /\b(?:final language data (?:analysis )?project|final linguistic (?:analysis )?project|final data analysis project|language data project|linguistic analysis project)\b/i.test(
      text,
    ) &&
    /\b(?:proposal|defen[cs]e|design|plan|capstone|synthesis)\b/i.test(text)
  ) {
    return {
      family: 'language-data-methods',
      subtype: 'project-synthesis',
      operation: 'proposal-defense',
      requiredExamples: 3,
      requiredLanguages: 3,
    };
  }
  const operation = operationDemand(text);
  // Broad typology lessons still need one shared observable dimension. Bind
  // them to the multilingual constituent-order records rather than mixing
  // unrelated sound, morphology, and meaning examples into a false
  // "structural" generalization. More specific syntax, morphology, or sound
  // signals below continue to select their own evidence family.
  if (
    /\b(?:typolog\w*|cross[- ]linguistic|language comparison)\b/i.test(text) &&
    /\b(?:grammatical structures?|structural (?:patterns?|similarit\w*|differen\w*|variation)|language comparison|typolog\w*)\b/i.test(
      text,
    )
  ) {
    return {
      family: 'syntax',
      subtype: 'word-order',
      operation: 'generalization',
      requiredExamples: 3,
      requiredLanguages: 3,
    };
  }
  if (/\b(?:head movement|head-to-head|v-to-i|verb movement)\b/i.test(text)) {
    return { family: 'syntax', subtype: 'head-movement', ...operation };
  }
  if (/\b(?:word order|constituent|syntax|syntactic|phrase structure|clause)\w*\b/i.test(text)) {
    return { family: 'syntax', subtype: 'word-order', ...operation };
  }
  if (/\b(?:morpholog|morpheme|formative|affix|segmentation|fusion)\w*\b/i.test(text)) {
    return { family: 'morphology', subtype: 'fusion', ...operation };
  }
  // Pragmatics must precede phonology so “speech acts” is not mistaken for
  // speech-sound evidence.
  const semanticSubtype = semanticPragmaticDemandSubtype(text);
  if (semanticSubtype) return { family: 'semantics-pragmatics', subtype: semanticSubtype, ...operation };
  if (/\b(?:prosod|suprasegment|tone|intonation)\w*\b/i.test(text)) {
    return { family: 'phonology', subtype: 'prosody', ...operation };
  }
  if (/\b(?:phonetic|phonolog|sound|ipa|speech production|consonant|vowel)\w*\b/i.test(text)) {
    if (
      operation.operation === 'comparison' &&
      /\b(?:phoneme|minimal (?:pair|set)|consonant (?:contrast|inventory)|sound contrast)\b/i.test(text)
    ) {
      return {
        family: 'phonology',
        subtype: 'consonant-contrast',
        operation: 'comparison',
        requiredExamples: 1,
        requiredLanguages: 1,
      };
    }
    return { family: 'phonology', subtype: 'general', ...operation };
  }
  return null;
}

export function languageEvidenceClassification(example = {}) {
  const analysis = String(example?.analysisFocus || '').normalize('NFKC');
  if (/\b(?:head movement|head-to-head|v-to-i|verb movement)\b/i.test(analysis)) {
    return { family: 'syntax', subtype: 'head-movement' };
  }
  if (/\b(?:syntax|syntactic|constituent (?:word )?order|word order)\b/i.test(analysis)) {
    return { family: 'syntax', subtype: 'word-order' };
  }
  if (/\b(?:morpholog|morpheme|formative|affix|segmentation|fusion)\w*\b/i.test(analysis)) {
    return { family: 'morphology', subtype: 'fusion' };
  }
  if (/\b(?:prosodic|prosody|suprasegment|tone|intonation)\w*\b/i.test(analysis)) {
    return { family: 'phonology', subtype: 'prosody' };
  }
  if (/\b(?:phonetic|phonolog|sound|consonant|vowel)\w*\b/i.test(analysis)) {
    return {
      family: 'phonology',
      subtype:
        example?.comparisonRelation?.protocol === 'coursemapper-authentic-evidence-relation-v1'
          ? 'consonant-contrast'
          : 'general',
    };
  }
  const subtype = semanticPragmaticEvidenceSubtype(example);
  return subtype ? { family: 'semantics-pragmatics', subtype } : null;
}

export function evidenceMatchesLanguageDemand(example, demand) {
  const classification = languageEvidenceClassification(example);
  // Methods lessons operate on the packet as a dataset: learners inspect
  // sampling, annotation, comparability, and claim boundaries rather than
  // treating one analytic family as the lesson's subject-matter answer. Any
  // complete, classified language record can therefore be a candidate row.
  if (demand.family === 'language-data-methods') return Boolean(classification);
  if (!classification || classification.family !== demand.family) return false;
  if (demand.family === 'semantics-pragmatics') {
    return demand.subtype === 'general' || classification.subtype === demand.subtype;
  }
  if (demand.family === 'syntax' && demand.subtype === 'head-movement') {
    return classification.subtype === 'head-movement';
  }
  if (demand.family === 'phonology' && demand.subtype === 'prosody') {
    return classification.subtype === 'prosody';
  }
  if (demand.family === 'phonology' && demand.subtype === 'consonant-contrast') {
    return classification.subtype === 'consonant-contrast';
  }
  return true;
}

export function enrichAuthenticLanguageDataPacket(packet = null, sessions = [], courseContext = '') {
  const sessionRows = Array.isArray(sessions) ? sessions : [];
  const sessionText = [
    courseContext,
    ...sessionRows.flatMap((session) => [
      session?.title,
      ...(Array.isArray(session?.sections)
        ? session.sections.flatMap((section) => [section?.topic, section?.objective, ...(section?.goals || [])])
        : []),
    ]),
  ]
    .filter(Boolean)
    .join(' ');
  const existingPacket = packet?.protocol === 'coursemapper-authentic-language-data-v1';
  // A missing packet should not force a language course to draft placeholder
  // “data” activities. Seed the source-bound open library only when the
  // curriculum itself contains a strong language-analysis signal. A malformed
  // non-null packet remains fail-closed instead of being silently replaced.
  const mayInitializeCuratedPacket =
    !packet &&
    /\b(?:language|linguistic|multilingual|phonetic|phonolog|morpholog|morpheme|syntax|syntactic|pragmatic|corpus annotation)\w*\b/i.test(
      sessionText,
    );
  if (!existingPacket && !mayInitializeCuratedPacket) return packet;
  const sourcePacket = existingPacket
    ? packet
    : {
        protocol: 'coursemapper-authentic-language-data-v1',
        sources: [],
        examples: [],
      };
  const existingExamples = Array.isArray(sourcePacket?.examples) ? sourcePacket.examples : [];
  const demands = sessionRows
    .map((session) =>
      languageEvidenceDemand(
        [
          session?.title,
          ...(Array.isArray(session?.sections)
            ? session.sections.flatMap((section) => [section?.topic, section?.objective, ...(section?.goals || [])])
            : []),
        ]
          .filter(Boolean)
          .join(' '),
        { courseContext },
      ),
    )
    .filter(Boolean);
  if (demands.length === 0) return packet;

  const demandedSubtypes = new Set(
    demands.filter((demand) => demand.family === 'semantics-pragmatics').map((demand) => demand.subtype),
  );
  const demandedFamilies = new Set(demands.map((demand) => `${demand.family}:${demand.subtype}`));
  const additionsById = new Map();
  for (const demand of demands) {
    const repeatedDemandCount = demands.filter(
      (candidate) => candidate.family === demand.family && candidate.subtype === demand.subtype,
    ).length;
    // Generic meaning/context sessions need a small rotation pool even though
    // each individual identification task uses one record. Otherwise a
    // multi-lesson course repeats the same language example everywhere and a
    // one-record packet also fails the packet's multilingual admission floor.
    const rotationPoolTarget =
      demand.family === 'semantics-pragmatics' && demand.subtype === 'general'
        ? Math.min(3, Math.max(2, repeatedDemandCount))
        : 0;
    const packetAdmissionFloor = existingPacket ? 0 : 2;
    const requiredPoolExamples = Math.max(demand.requiredExamples, rotationPoolTarget, packetAdmissionFloor);
    const requiredPoolLanguages = Math.max(demand.requiredLanguages, rotationPoolTarget, packetAdmissionFloor);
    const availableForDemand = () =>
      [...existingExamples, ...[...additionsById.values()].map((entry) => entry.example)].filter((example) =>
        evidenceMatchesLanguageDemand(example, demand),
      );
    const demandSatisfied = () => {
      const available = availableForDemand();
      const languages = new Set(
        available
          .map((example) =>
            String(example?.language || '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      );
      return available.length >= requiredPoolExamples && languages.size >= requiredPoolLanguages;
    };
    if (demandSatisfied()) continue;
    for (const entry of CURATED_LANGUAGE_EVIDENCE) {
      if (!evidenceMatchesLanguageDemand(entry.example, demand)) continue;
      if (existingExamples.some((example) => example?.id === entry.example.id)) continue;
      additionsById.set(entry.example.id, entry);
      if (demandSatisfied()) break;
    }
  }
  const additions = [...additionsById.values()];
  if (additions.length === 0) return packet;

  const sourceById = new Map(
    (Array.isArray(sourcePacket?.sources) ? sourcePacket.sources : []).map((source) => [source?.id, source]),
  );
  const exampleById = new Map(existingExamples.map((example) => [example?.id, example]));
  for (const entry of additions) {
    sourceById.set(entry.source.id, structuredClone(entry.source));
    exampleById.set(entry.example.id, structuredClone(entry.example));
  }
  return {
    ...sourcePacket,
    sources: [...sourceById.values()],
    examples: [...exampleById.values()],
    curatedFallbackReceipt: {
      protocol: 'coursemapper-curated-authentic-language-evidence-v1',
      demandedSubtypes: [...demandedSubtypes].sort(),
      demandedFamilies: [...demandedFamilies].sort(),
      addedExampleIds: additions.map((entry) => entry.example.id),
      initializedFromCurriculumDemand: !existingPacket,
      claimBoundary:
        'Curated fallback records fill an uncovered analytic evidence family from a source-bound open library; they do not replace instructor review or establish transfer beyond the cited examples.',
    },
  };
}

function cleanAuthorityText(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function authenticTaskCore(task = {}) {
  const { taskContractSha256: _taskReceipt, truthProof: _truthProof, ...core } = task || {};
  return core;
}

function exactVisibleExampleClaim(example = {}) {
  return [
    example?.displayLabel,
    example?.form,
    example?.gloss,
    example?.translation,
    example?.analysisFocus,
    example?.sourceLocator,
  ]
    .map(cleanAuthorityText)
    .filter(Boolean)
    .join(' | ');
}

/**
 * Promote an already-fingerprinted authentic-data task into exact claim
 * authority for Stage 2. The adapter binds the same strings that the
 * instructional-intent graph observes later: source records and the
 * answer-key boundary. Topic labels never become factual authority.
 */
export function createAuthenticLanguageEvidenceAuthorityByLessonId({ coverage = null, packet = null } = {}) {
  if (
    coverage?.protocol !== 'coursemapper-authentic-language-data-coverage-v1' ||
    packet?.protocol !== 'coursemapper-authentic-language-data-v1'
  ) {
    return {};
  }
  const packetSourceById = new Map(
    (Array.isArray(packet?.sources) ? packet.sources : [])
      .filter((source) => cleanAuthorityText(source?.id) && cleanAuthorityText(source?.title))
      .map((source) => [cleanAuthorityText(source.id), source]),
  );
  const byLessonId = {};
  for (const lesson of Array.isArray(coverage?.lessons) ? coverage.lessons : []) {
    const lessonNumber = Number(lesson?.lessonNumber);
    const task = lesson?.taskBinding;
    const examples = Array.isArray(task?.examples) ? task.examples : [];
    if (!lesson?.admitted || !Number.isInteger(lessonNumber) || lessonNumber < 1 || examples.length === 0) continue;

    const taskCore = authenticTaskCore(task);
    const taskReceiptValid = cleanAuthorityText(task?.taskContractSha256) === sha256HexSync(JSON.stringify(taskCore));
    const payloadReceiptValid = cleanAuthorityText(task?.payloadSha256) === sha256HexSync(JSON.stringify(examples));
    const truthProofValid =
      task?.truthProof?.protocol === 'coursemapper-authentic-evidence-truth-proof-v1' &&
      task.truthProof.payloadSha256 === task.payloadSha256 &&
      task.truthProof.taskContractSha256 === task.taskContractSha256 &&
      task.truthProof.promptDisplaysBoundPayload === true &&
      task.truthProof.answerKeyOperatesOnBoundPayload === true &&
      task.truthProof.rubricScoresDeclaredOperation === true;
    if (!taskReceiptValid || !payloadReceiptValid || !truthProofValid) continue;

    const requestedSourceIds = [
      ...new Set(examples.map((example) => cleanAuthorityText(example?.sourceId)).filter(Boolean)),
    ];
    const sources = requestedSourceIds
      .map((sourceId) => packetSourceById.get(sourceId))
      .filter(Boolean)
      .map((source) => ({
        id: cleanAuthorityText(source.id),
        title: cleanAuthorityText(source.title),
        url: cleanAuthorityText(source.url),
        license: cleanAuthorityText(source.license),
        attribution: cleanAuthorityText(source.attribution),
        checkedAt: cleanAuthorityText(source.checkedAt),
        authorityKind: 'curated-authentic-language-evidence',
        sourceRecordSha256: sha256HexSync(JSON.stringify(source)),
      }));
    if (sources.length !== requestedSourceIds.length) continue;

    const exampleClaims = examples.map(exactVisibleExampleClaim).filter(Boolean);
    const answerKey = cleanAuthorityText(task.answerKey);
    const claimTexts = [...new Set([...exampleClaims, ...(answerKey ? [answerKey] : [])])];
    if (claimTexts.length < 2) continue;
    const sourceIdsByExample = new Map(
      examples.map((example) => [
        exactVisibleExampleClaim(example),
        [cleanAuthorityText(example?.sourceId)].filter(Boolean),
      ]),
    );
    const allSourceIds = sources.map((source) => source.id);
    const lessonId = `lesson-${lessonNumber}`;
    const exactPayload = {
      protocol: 'coursemapper-evidence-authority-v1',
      lessonId,
      status: 'admitted',
      authorityKind: 'curated-authentic-language-evidence',
      admissionPolicyVersion: 'scion-authentic-language-evidence-admission-v1',
      claims: claimTexts.map((text, index) => ({
        id: `${lessonId}-authentic-claim-${index + 1}`,
        candidateId: `${lessonId}-authentic-candidate-${index + 1}`,
        text,
        sourceIds: sourceIdsByExample.get(text) || allSourceIds,
        authorityKind: 'curated-authentic-language-evidence',
        claimRole: sourceIdsByExample.has(text) ? 'source-bound-example' : 'source-bound-answer-key',
        admissionPolicyVersion: 'scion-authentic-language-evidence-admission-v1',
      })),
      sources,
      authenticEvidenceReceipt: {
        protocol: 'scion-authentic-language-evidence-transaction-v1',
        taskContractSha256: task.taskContractSha256,
        payloadSha256: task.payloadSha256,
        evidenceItemIds: [...(task.evidenceItemIds || [])],
        sourceRecordSha256: sources.map((source) => ({ id: source.id, sha256: source.sourceRecordSha256 })),
      },
    };
    byLessonId[lessonId] = {
      ...exactPayload,
      receiptSha256: sha256HexSync(JSON.stringify(exactPayload)),
    };
  }
  return byLessonId;
}
