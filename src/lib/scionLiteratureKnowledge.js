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

const GILGAMESH_SOURCE = {
  title: 'Epic of Gilgamesh',
  author: 'Wikipedia contributors',
  license: 'CC BY-SA 4.0',
  provider: 'wikipedia',
  url: 'https://en.wikipedia.org/wiki/Epic_of_Gilgamesh',
};

const ANTIGONE_SOURCE = {
  title: 'Antigone (Sophocles play)',
  author: 'Wikipedia contributors',
  license: 'CC BY-SA 4.0',
  provider: 'wikipedia',
  url: 'https://en.wikipedia.org/wiki/Antigone_(Sophocles_play)',
};

const TANG_POETRY_SOURCE = {
  title: 'Tang poetry',
  author: 'Wikipedia contributors',
  license: 'CC BY-SA 4.0',
  provider: 'wikipedia',
  url: 'https://en.wikipedia.org/wiki/Tang_poetry',
};

const NIGHTS_SOURCE = {
  title: 'One Thousand and One Nights',
  author: 'Wikipedia contributors',
  license: 'CC BY-SA 4.0',
  provider: 'wikipedia',
  url: 'https://en.wikipedia.org/wiki/One_Thousand_and_One_Nights',
};

const INFERNO_SOURCE = {
  title: 'Inferno (Dante)',
  author: 'Wikipedia contributors',
  license: 'CC BY-SA 4.0',
  provider: 'wikipedia',
  url: 'https://en.wikipedia.org/wiki/Inferno_(Dante)',
};

const THINGS_FALL_APART_SOURCE = {
  title: 'Things Fall Apart',
  author: 'Wikipedia contributors',
  license: 'CC BY-SA 4.0',
  provider: 'wikipedia',
  url: 'https://en.wikipedia.org/wiki/Things_Fall_Apart',
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
    aliases: ['epic of gilgamesh', 'the epic of gilgamesh', 'gilgamesh'],
    source: GILGAMESH_SOURCE,
    facts: [
      'The epic frames Gilgamesh through Uruk and its walls, connecting the hero’s story to civic memory rather than presenting adventure alone.',
      'Gilgamesh and Enkidu move from confrontation to companionship, making their relationship a structural counterweight to solitary kingship.',
      'Enkidu’s death turns the narrative from a pursuit of fame toward Gilgamesh’s fear of mortality and search for knowledge about death.',
      'The account of Utnapishtim and the flood is embedded inside Gilgamesh’s later quest, expanding the poem’s temporal and narrative frame.',
      'Surviving versions and modern translations differ, so close reading should identify the assigned edition instead of assuming one fixed wording.',
    ],
    concepts: [
      {
        term: 'civic frame',
        definition:
          'A civic frame connects the hero’s actions to the city, institutions, and collective memory that surround the personal story.',
        example:
          'A reader can compare the poem’s attention to Uruk with Gilgamesh’s private fear of death and ask what each frame makes valuable.',
        misconception: 'The city is only a backdrop that has no bearing on how Gilgamesh’s achievements are judged.',
        correction:
          'The return to civic space places individual experience beside public memory, so the city helps shape the poem’s final perspective.',
      },
      {
        term: 'companion structure',
        definition:
          'Companion structure uses the bond between Gilgamesh and Enkidu to change the hero’s conduct, motivation, and self-understanding.',
        example:
          'Students can trace how scenes before and after Enkidu’s arrival create different versions of Gilgamesh’s power.',
        misconception: 'Enkidu merely joins adventures without changing the narrative’s account of kingship or loss.',
        correction:
          'The companionship redirects action and makes Enkidu’s death the hinge that reorganizes Gilgamesh’s goals.',
      },
      {
        term: 'mortality turn',
        definition:
          'A mortality turn is the structural shift in which death changes the central problem from heroic achievement to the limits of human life.',
        example:
          'A passage before Enkidu’s death can be compared with Gilgamesh’s later search to show how the narrative question changes.',
        misconception: 'The search for immortality simply repeats the earlier quest for fame with a new destination.',
        correction:
          'The later quest arises from grief and fear, so its stakes and the evidence used to judge success are different.',
      },
      {
        term: 'embedded flood account',
        definition:
          'An embedded account places Utnapishtim’s flood narrative inside Gilgamesh’s quest and gives one character control over an earlier story.',
        example:
          'A reader can distinguish what the flood account explains from what Gilgamesh hopes it will prove about his own mortality.',
        misconception: 'The flood account is narrated from the same time and perspective as Gilgamesh’s journey.',
        correction:
          'It is a retrospective story told within the journey, so its speaker, audience, and argumentative purpose require separate analysis.',
      },
    ],
  },
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
    aliases: ['antigone'],
    source: ANTIGONE_SOURCE,
    facts: [
      'The play establishes its central conflict through Creon’s burial prohibition and Antigone’s decision to perform burial rites for Polyneices.',
      'Antigone and Creon defend competing obligations in direct confrontations, so the drama tests claims through speech as well as action.',
      'The Chorus comments on events and changes its responses over time, but it does not function as a neutral or all-knowing narrator.',
      'Reports from guards, messengers, and other characters make offstage events depend on mediated testimony.',
      'Creon’s late change of course cannot undo the consequences already set in motion, making timing central to the play’s reversal.',
    ],
    concepts: [
      {
        term: 'competing obligations',
        definition:
          'Competing obligations arise when claims of family, religious practice, civic law, and political authority cannot all be satisfied at once.',
        example:
          'Students can compare the grounds Antigone and Creon give for obedience and identify what each argument excludes.',
        misconception: 'The conflict is only a simple choice between a clearly private duty and a clearly public rule.',
        correction:
          'Both speakers make broader claims about order and legitimacy, so the conflict must be evaluated through their language and consequences.',
      },
      {
        term: 'stichomythic exchange',
        definition:
          'A stichomythic exchange uses rapid alternating lines to intensify conflict and expose opposing assumptions.',
        example:
          'A close reading can track how repeated words or sharply opposed claims change the balance of authority in a confrontation.',
        misconception:
          'Rapid dialogue only speeds up the scene and does not contribute to characterization or argument.',
        correction:
          'The compressed pattern makes each reply answer, redirect, or refuse the previous claim, so form becomes evidence about the conflict.',
      },
      {
        term: 'choral perspective',
        definition:
          'Choral perspective is the shifting communal commentary through which the Chorus frames, questions, or reacts to the action.',
        example:
          'Students can compare two choral responses and ask what changed in the Chorus’s judgment and available evidence.',
        misconception: 'The Chorus always states the play’s final and authoritative interpretation.',
        correction:
          'Its judgments develop within the action and can be limited, cautious, or belated, so they must be interpreted rather than simply accepted.',
      },
      {
        term: 'tragic reversal',
        definition:
          'Tragic reversal is the change in action and understanding that arrives after earlier decisions have made loss difficult or impossible to prevent.',
        example:
          'A reader can locate Creon’s changed decision and then test whether the timing supports remorse, recognition, or both.',
        misconception: 'A reversal erases the earlier decision once the ruler adopts a better course.',
        correction:
          'The changed intention matters, but the plot measures it against consequences that continue after the decision shifts.',
      },
    ],
  },
  {
    aliases: ['selected poems by li bai and du fu', 'selected poems of li bai and du fu', 'li bai and du fu'],
    source: TANG_POETRY_SOURCE,
    facts: [
      'Li Bai and Du Fu write within Tang poetic traditions, but a comparison must use particular assigned poems rather than treat either poet as one uniform style.',
      'Parallel syntax, line breaks, image sequence, and shifts in address can organize an interpretation even when translations render those features differently.',
      'Li Bai’s poems often use mobile speakers and expansive natural imagery, while the exact effect depends on the selected poem and translation.',
      'Du Fu’s poems often connect compressed observation to social or historical pressure, while the exact claim must remain bounded to the assigned poem.',
      'Translation choices in diction, syntax, rhyme, and lineation can change tone and emphasis without providing direct access to one uncontested original effect.',
    ],
    concepts: [
      {
        term: 'image sequence',
        definition:
          'Image sequence is the ordered movement among visual or sensory details that creates emphasis, contrast, or a shift in perspective.',
        example:
          'Students can mark where an image changes and explain how the new relation alters the speaker’s stance.',
        misconception: 'Listing every image is enough to explain how imagery produces meaning.',
        correction: 'Analysis must show how the order and relation among images shape a defensible interpretation.',
      },
      {
        term: 'lyric speaker',
        definition:
          'The lyric speaker is the voice constructed by a poem and should not automatically be treated as a transparent record of the historical poet.',
        example:
          'A reader can track address, pronouns, and changes in distance to explain how the poem positions its speaker.',
        misconception:
          'Every first-person statement can be used as direct biographical evidence about Li Bai or Du Fu.',
        correction: 'The poem’s voice is textual evidence; biographical claims require separate historical support.',
      },
      {
        term: 'parallelism',
        definition:
          'Parallelism arranges corresponding grammatical or imagistic units so their similarity and difference become meaningful.',
        example:
          'Students can compare two balanced lines and identify which repeated structure makes a contrast visible.',
        misconception: 'Parallel lines must communicate the same idea twice.',
        correction: 'Formal balance can sharpen opposition, development, or tension rather than simple repetition.',
      },
      {
        term: 'translation choice',
        definition:
          'A translation choice is a translator’s decision about diction, syntax, sound, or lineation when no version can reproduce every feature at once.',
        example:
          'Comparing two translations of one line can reveal which formal or semantic feature each version prioritizes.',
        misconception: 'A smoother English version is automatically more accurate in every respect.',
        correction:
          'Accuracy has multiple dimensions, so a comparison should name the feature preserved, changed, or lost.',
      },
    ],
  },
  {
    aliases: ['the thousand and one nights', 'one thousand and one nights', 'arabian nights'],
    source: NIGHTS_SOURCE,
    facts: [
      'The collection is organized by the frame in which Scheherazade tells stories over successive nights to postpone her death.',
      'Stories can contain further stories, so narrators and audiences shift across nested narrative levels.',
      'Deferred endings make continuation part of the frame narrative’s action, not only a way to divide the collection.',
      'The collection has developed through multiple manuscripts, editions, additions, and translations rather than one single fixed text.',
      'A close reading should distinguish the outer frame from an embedded tale and identify which narrator controls each layer of information.',
    ],
    concepts: [
      {
        term: 'frame narrative',
        definition:
          'A frame narrative places one or more stories inside an outer storytelling situation that gives the telling immediate stakes.',
        example: 'Students can compare an embedded tale’s conflict with Scheherazade’s need to continue telling.',
        misconception: 'The frame is merely an introduction that becomes irrelevant once an embedded story begins.',
        correction: 'The outer situation shapes why stories are told, interrupted, resumed, and judged.',
      },
      {
        term: 'narrative level',
        definition:
          'A narrative level identifies whether a speaker and event belong to the outer frame, an embedded story, or a story inside that story.',
        example: 'A reader can diagram who tells a story to whom before interpreting a claim about voice or authority.',
        misconception: 'Every first-person speaker belongs to the same narrative level as Scheherazade.',
        correction:
          'Nested tales create distinct speakers and audiences, so pronouns alone do not establish the narrative level.',
      },
      {
        term: 'deferred ending',
        definition:
          'A deferred ending postpones resolution so the interruption itself changes suspense, expectation, or the teller’s position.',
        example:
          'Students can examine what information is withheld at a stopping point and what the delay asks the audience to anticipate.',
        misconception: 'Deferral only makes a story longer without changing its form or power relation.',
        correction:
          'The timing of interruption can produce narrative leverage and shape how an audience values continuation.',
      },
      {
        term: 'textual plurality',
        definition:
          'Textual plurality is the existence of materially different manuscript, edition, and translation traditions for a work.',
        example:
          'A comparison can identify whether an episode or wording belongs to the assigned edition before making a cross-version claim.',
        misconception: 'Every translation contains the same tales in the same order and wording.',
        correction:
          'The collection’s textual history varies, so edition-neutral analysis must name the assigned version and avoid universal claims.',
      },
    ],
  },
  {
    aliases: ['inferno', 'dante s inferno', 'dante inferno'],
    source: INFERNO_SOURCE,
    facts: [
      'Inferno distinguishes Dante the pilgrim, who experiences the journey, from the retrospective narrator who shapes how that experience is told.',
      'The poem organizes Hell spatially and ethically through descending circles, encounters, and explanations of punishment.',
      'Terza rima links tercets through an interlocking rhyme pattern, making forward movement part of the poem’s formal design.',
      'Encounters with individual speakers interrupt the journey and create tensions among sympathy, judgment, memory, and authority.',
      'Claims about contrapasso must be supported by the punishment, the speaker’s account, and the canto’s framing rather than assumed from a label alone.',
    ],
    concepts: [
      {
        term: 'pilgrim-narrator distinction',
        definition:
          'The pilgrim-narrator distinction separates the character who experiences events from the later voice that selects and interprets them.',
        example:
          'Students can compare the pilgrim’s immediate response with the narrator’s framing of the same encounter.',
        misconception: 'The pilgrim and narrator always possess the same knowledge and judgment.',
        correction:
          'Retrospective narration can reveal distance between what the pilgrim understood then and how the journey is presented later.',
      },
      {
        term: 'terza rima',
        definition:
          'Terza rima is an interlocking rhyme scheme in which the middle rhyme of one tercet becomes the outer rhyme of the next.',
        example:
          'A reader can ask how the chained pattern creates continuity or pressure across a passage, while noting what a translation preserves.',
        misconception: 'Terza rima is only decorative sound and has no relation to movement or structure.',
        correction: 'The linked rhyme carries the poem forward and can reinforce continuity, enclosure, or transition.',
      },
      {
        term: 'contrapasso',
        definition:
          'Contrapasso is an interpreted relation between a sin and its punishment, often through resemblance, reversal, or consequence.',
        example:
          'Students can test two explanations of one punishment against the canto’s details instead of assuming a single obvious correspondence.',
        misconception: 'Every punishment has one officially stated symbolic meaning that needs no textual analysis.',
        correction: 'The relation must be argued from the scene and may support more than one plausible emphasis.',
      },
      {
        term: 'encounter structure',
        definition:
          'Encounter structure organizes the journey through meetings whose stories, speech, and placement create local interpretive problems.',
        example:
          'A close reading can track how an encounter begins, what the speaker controls, and how Dante or Virgil redirects it.',
        misconception: 'Each encounter is an independent anecdote with no effect on the larger journey.',
        correction:
          'Placement, repetition, and response connect individual encounters to the poem’s developing moral and narrative architecture.',
      },
    ],
  },
  {
    aliases: ['things fall apart'],
    source: THINGS_FALL_APART_SOURCE,
    facts: [
      'The novel centers much of its narration on Okonkwo while also presenting communal practices, debates, and voices that exceed his perspective.',
      'Proverbs, folktales, speech, and ritual language make oral forms part of the novel’s English prose and social world.',
      'Okonkwo defines himself against traits he associates with his father, and that opposition shapes decisions without fully explaining the community.',
      'The arrival of missionaries and colonial government changes religious, legal, and political relationships over the novel’s later movement.',
      'The final shift toward the District Commissioner compresses Okonkwo’s life into a colonial writing project, creating a sharp conflict of narrative scale and authority.',
    ],
    concepts: [
      {
        term: 'focalization',
        definition:
          'Focalization is the perspective through which narrative information is selected and limited, even when the narrator speaks in the third person.',
        example:
          'Students can separate what Okonkwo notices and values from evidence the wider narration provides about the community.',
        misconception: 'Because the novel often follows Okonkwo, every communal judgment is identical to his.',
        correction:
          'Other voices, customs, and consequences qualify his perspective, so focalization is not complete authority.',
      },
      {
        term: 'proverbial discourse',
        definition:
          'Proverbial discourse uses compact inherited sayings as social reasoning whose force depends on speaker, audience, and context.',
        example:
          'A reader can explain what a proverb permits a speaker to imply and how its context changes its authority.',
        misconception: 'A proverb provides a universal rule that every character accepts in the same way.',
        correction:
          'Its meaning and force emerge in use, so a close reading must identify who invokes it and for what purpose.',
      },
      {
        term: 'constructed masculinity',
        definition:
          'Constructed masculinity is the set of behaviors and fears through which a character tries to perform a socially legible masculine identity.',
        example:
          'Students can trace how Okonkwo’s fear of resembling his father narrows the choices he considers acceptable.',
        misconception: 'Okonkwo’s choices transparently represent one uncontested Igbo definition of masculinity.',
        correction:
          'The novel presents competing characters, practices, and consequences, so his performance cannot stand for the whole community.',
      },
      {
        term: 'colonial framing',
        definition:
          'Colonial framing is the reduction and reorganization of local lives through the categories and narrative authority of colonial institutions.',
        example:
          'The final perspective can be compared with the novel’s prior detail to show what the Commissioner’s proposed account excludes.',
        misconception:
          'The final colonial perspective neutrally summarizes everything the novel has already established.',
        correction: 'Its compression is itself evidence about power, selection, and whose narrative becomes official.',
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
