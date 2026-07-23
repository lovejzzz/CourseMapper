// Small, attributed reading profiles give compact local models an exact
// knowledge boundary for canonical works. They are retrieval data, not model
// weights: any compatible provider can receive the same facts and concepts,
// while browser-local Scion can project them without spending an inference
// call copying information the compiler already owns.

const ODYSSEY_SOURCE = {
  title: 'The Odyssey of Homer',
  author: 'Homer; translated by S. H. Butcher and A. Lang',
  license: 'Public domain in the USA',
  provider: 'gutenberg',
  url: 'https://www.gutenberg.org/ebooks/1727',
};

const LIBRARY_OF_BABEL_SOURCE = {
  title: 'The Library of Babel',
  author: 'Wikipedia contributors',
  license: 'CC BY-SA 4.0',
  provider: 'wikipedia',
  url: 'https://en.wikipedia.org/wiki/The_Library_of_Babel',
};

const READING_PROFILES = [
  {
    aliases: ['odyssey', 'the odyssey'],
    source: ODYSSEY_SOURCE,
    facts: [
      "The Odyssey opens with an appeal to the Muse, framing its subject through invocation after Odysseus's wanderings are underway.",
      'Hospitality organizes encounters by testing reciprocal duties among hosts, guests, strangers, and households.',
      'Recognition scenes delay confirmed identity until characters interpret bodily marks, private knowledge, or shared signs.',
      "Odysseus narrates much of his wandering retrospectively, embedding a first-person account inside the poem's broader third-person narration.",
      'Homecoming requires more than arrival: Odysseus must restore relationships, household order, and publicly recognized identity.',
    ],
    concepts: [
      {
        term: 'invocation',
        definition:
          'An invocation is an epic opening address that requests inspiration and frames the subject the poem will ask its audience to judge.',
        example:
          "A reader can compare the poem's opening appeal with the later account of Odysseus's return to test which parts of heroic identity it foregrounds.",
        misconception: 'An invocation is merely a table of contents that summarizes every later event in order.',
        correction:
          'The opening establishes narrative authority and priorities, but it neither lists every episode nor resolves the poem’s later tensions.',
      },
      {
        term: 'hospitality',
        definition:
          'Hospitality is a reciprocal social practice that makes the treatment of hosts, guests, and strangers evidence about household and communal order.',
        example:
          'Students can compare two arrivals and trace how welcome, questioning, food, gifts, or violence changes the ethical judgment of each household.',
        misconception: 'Hospitality in the poem is only private politeness and has no political or moral consequence.',
        correction:
          'The treatment of strangers tests obligations, status, alliances, and household legitimacy, so its consequences extend beyond manners.',
      },
      {
        term: 'recognition scene',
        definition:
          'A recognition scene is a structured disclosure in which identity becomes credible through interpreted signs, privileged knowledge, or embodied evidence.',
        example:
          'A close reading can compare what the audience already knows with the evidence a character requires before accepting Odysseus’s identity.',
        misconception: 'Recognition occurs immediately whenever a familiar character looks at the returning hero.',
        correction:
          'The poem repeatedly delays recognition and makes characters test signs or knowledge before identity becomes socially actionable.',
      },
      {
        term: 'embedded narration',
        definition:
          'Embedded narration places one character’s extended first-person account inside a broader narrative, changing who controls information and interpretation.',
        example:
          'Students can ask how Odysseus’s retrospective account of his wanderings differs from scenes presented by the poem’s external narrator.',
        misconception:
          'Every event in the poem is narrated from the same perspective and at the same distance from the action.',
        correction:
          'The poem shifts between an external narrator and Odysseus’s own retrospective storytelling, so perspective and authority must be evaluated separately.',
      },
    ],
  },
  {
    aliases: ['library of babel', 'the library of babel'],
    source: LIBRARY_OF_BABEL_SOURCE,
    facts: [
      "The story represents the universe as repeating hexagonal galleries whose ordered architecture contrasts with readers' unstable interpretations and behavior.",
      'Each book has a fixed format, so a finite alphabet yields a finite but unimaginably large set of possible books.',
      'Combinatorial completeness includes meaningful, false, contradictory, and nearly identical books; textual existence alone does not establish truth.',
      "Catalogs appear inside the same combinatorial system, so a catalog's existence does not make it discoverable or trustworthy.",
      "The librarians' searches produce hope, sectarian claims, despair, and violence, linking information abundance to epistemic and social disorder.",
    ],
    concepts: [
      {
        term: 'combinatorial totality',
        definition:
          'Combinatorial totality is the complete set produced by placing every permitted symbol into every position of a fixed-length book format.',
        example:
          'Because the alphabet and book length are bounded, every permitted sequence exists even though almost all sequences are meaningless or misleading.',
        misconception: 'If every possible book exists, every book must communicate a useful or truthful message.',
        correction:
          'Completeness guarantees possible symbol sequences, not meaning, truth, relevance, discoverability, or reliable interpretation.',
      },
      {
        term: 'epistemic uncertainty',
        definition:
          'Epistemic uncertainty is difficulty determining which claims can be known, justified, or verified when evidence is abundant and mutually contradictory.',
        example:
          'A true account and countless false variants may all exist, leaving readers without a dependable procedure for identifying the warranted one.',
        misconception:
          'Possessing every possible statement eliminates uncertainty because the correct statement must be somewhere in the collection.',
        correction:
          'Truth is not usable without a reliable way to locate and verify it among contradictory alternatives.',
      },
      {
        term: 'catalog problem',
        definition:
          'The catalog problem is the failure of a purported index to solve search when catalogs themselves belong to the same unverified textual universe.',
        example:
          'A book claiming to locate every other book still needs independent verification and may be impossible to distinguish from false catalogs.',
        misconception: 'Finding any catalog immediately provides a complete and trustworthy map of the library.',
        correction:
          'A catalog is another book whose accuracy and location require proof, so it can reproduce rather than resolve the search problem.',
      },
      {
        term: 'architectural regularity',
        definition:
          'Architectural regularity is the repeated spatial order of the galleries, shelves, and passages that structures life without guaranteeing interpretive order.',
        example:
          'Students can contrast identical galleries with the incompatible beliefs and search practices that develop inside them.',
        misconception:
          'A perfectly regular building necessarily produces an equally coherent system of knowledge and social behavior.',
        correction:
          'The story uses stable architecture to intensify the contrast with unstable interpretation, verification, and collective life.',
      },
    ],
  },
];

function canonicalReading(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveProfiles(readings = []) {
  const identities = (Array.isArray(readings) ? readings : [readings]).map(canonicalReading).filter(Boolean);
  return READING_PROFILES.filter((profile) =>
    profile.aliases.some((alias) => identities.some((identity) => identity === canonicalReading(alias))),
  );
}

function copyProfile(profile) {
  return {
    facts: profile.facts.map(String),
    concepts: profile.concepts.map((concept) => ({ ...concept })),
    source: { ...profile.source },
  };
}

export function resolveScionLiteratureSourceProfiles({ readings = [] } = {}) {
  return resolveProfiles(readings).map(copyProfile);
}

export function resolveScionLiteratureKnowledge({ readings = [] } = {}) {
  const [profile] = resolveProfiles(readings);
  if (!profile) return null;
  return copyProfile(profile);
}
