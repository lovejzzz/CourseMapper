#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const RELEASE = 'v0.16.47';
const GENERATED_AT = '2026-07-16T21:30:00.000Z';
const MANIFEST_PATH = 'public/genome/manifest.json';
const RECEIPT_PATH = 'evaluation/scion-adapters/evidence/source-kernel-expansion-v0.16.47.json';

function anchor(src, loc, quote) {
  return { src, loc, quote };
}

function fact(text, sourceAnchor) {
  return { text, anchor: sourceAnchor, tier: 2, verifiedBy: 0, contested: false };
}

function kernel({
  id,
  term,
  aliases,
  tags,
  definition,
  facts,
  misconception,
  corrective,
  example,
  license,
  attribution,
}) {
  return {
    id,
    rev: 1,
    term,
    aliases,
    discipline: id.split('/')[0],
    tags,
    level: 'intro',
    difficulty: 2,
    bloomCeiling: 'Analyze',
    definition: { text: definition.text, anchor: definition.anchor, tier: 2, verifiedBy: 0 },
    facts,
    misconceptions: [{ text: misconception, corrective, anchor: null, tier: 1 }],
    examples: [{ text: example, domain: id.split('/')[0], anchor: null }],
    workedExamples: [],
    mcBank: [],
    edges: {},
    variants: [],
    freshness: { sourceEdition: 'accessed 2026-07-16', reviewBy: '2027-07-16', volatility: 'low' },
    license,
    attribution,
    standards: [],
  };
}

const MUSIC_LICENSE = 'CC-BY-SA-4.0';
const MUSIC_ATTRIBUTION = [
  'Open Music Theory by Mark Gotham, Kyle Gullings, Chelsey Hamm, Bryn Hughes, Brian Jarvis, Megan Lavengood, John Peterson, and contributors',
];
const MUSIC_KERNELS = [
  kernel({
    id: 'music/musical-texture',
    term: 'Musical texture',
    aliases: ['texture', 'monophony', 'homophony', 'polyphony', 'heterophony'],
    tags: ['texture', 'voices', 'aural analysis'],
    definition: {
      text: 'Musical texture describes the density of a passage and the way its simultaneous voices or layers interact.',
      anchor: anchor('omt:texture', 'Key Takeaways', 'density of and interaction between'),
    },
    facts: [
      fact(
        'Monophony presents one melodic line without an independent accompaniment.',
        anchor('omt:texture', 'Monophony', 'unaccompanied melodic line'),
      ),
      fact(
        'Heterophony presents simultaneous variants of essentially the same melody.',
        anchor('omt:texture', 'Heterophony', 'multiple variants of a single melodic line'),
      ),
      fact(
        'Homophony coordinates multiple voices at a shared harmonic pace, often as melody with accompaniment.',
        anchor('omt:texture', 'Homophony', 'multiple voices harmonically moving together'),
      ),
      fact(
        'Polyphony combines voices that carry independent melodic lines and rhythms.',
        anchor('omt:texture', 'Polyphony', 'separate melodic lines and rhythms'),
      ),
    ],
    misconception: 'Students may label any passage with several performers as polyphonic.',
    corrective:
      'Classify the relationship among lines: several performers can reinforce one monophonic line or form a homophonic melody-and-accompaniment texture.',
    example:
      'A listener compares a solo unaccompanied melody, a singer over block-chord accompaniment, and two independent imitative melodies.',
    license: MUSIC_LICENSE,
    attribution: MUSIC_ATTRIBUTION,
  }),
  kernel({
    id: 'music/dynamics-articulation-tempo',
    term: 'Dynamics, articulation, and tempo',
    aliases: ['expressive markings', 'dynamics', 'articulation', 'tempo'],
    tags: ['notation', 'performance', 'expression'],
    definition: {
      text: 'Dynamics, articulation, and tempo are distinct performance dimensions: loudness, the attack or connection of notes, and performance speed.',
      anchor: anchor('omt:other-notation', 'Introduction', 'dynamics, articulations, tempi'),
    },
    facts: [
      fact(
        'Dynamic markings communicate loudness rather than speed or note length.',
        anchor('omt:other-notation', 'Dynamics', 'Dynamics indicate the loudness of music'),
      ),
      fact(
        'A crescendo increases loudness, while a decrescendo or diminuendo decreases it.',
        anchor('omt:other-notation', 'Dynamics', 'increase in loudness'),
      ),
      fact(
        'Articulation describes how notes connect or separate and how their attacks are emphasized.',
        anchor('omt:other-notation', 'Articulations', 'connection or separation between notes'),
      ),
      fact(
        'Tempo indicates how fast or slowly a composition is performed and may be stated with text or beats per minute.',
        anchor('omt:other-notation', 'Tempo', 'how fast or slow'),
      ),
    ],
    misconception: 'Students may treat a louder marking as a request to play faster.',
    corrective:
      'Read each dimension separately: dynamics change loudness, tempo changes speed, and articulation changes connection or attack.',
    example:
      'A performer plays the same phrase softly, at an unchanged tempo, with staccato rather than legato articulation.',
    license: MUSIC_LICENSE,
    attribution: MUSIC_ATTRIBUTION,
  }),
  kernel({
    id: 'music/phrases-and-cadences',
    term: 'Phrases and cadences',
    aliases: ['phrase', 'cadence', 'antecedent and consequent', 'period'],
    tags: ['form', 'closure', 'phrase analysis'],
    definition: {
      text: 'A musical phrase is a relatively complete thought directed toward a goal, and a cadence is a harmonic event that can mark its ending.',
      anchor: anchor('omt:phrase-archetypes', 'Key Takeaways', 'trajectory toward a goal'),
    },
    facts: [
      fact(
        'A sentence is a phrase archetype with a presentation followed by a continuation.',
        anchor('omt:phrase-archetypes', 'Key Takeaways', 'presentation and a continuation'),
      ),
      fact(
        'A period combines an antecedent phrase with a consequent phrase.',
        anchor('omt:phrase-archetypes', 'The Period', 'antecedent and a consequent'),
      ),
      fact(
        'The antecedent normally ends with a weaker cadence than the consequent.',
        anchor('omt:phrase-archetypes', 'The Period', 'ends with a weaker cadence'),
      ),
      fact(
        'Cadential closure is a common phrase goal in tonal classical music, but other musical styles can establish different goals.',
        anchor('omt:phrase-archetypes', 'Key Takeaways', 'traditional cadence types'),
      ),
    ],
    misconception: 'Students may mark every pause or repeated motive as the end of a phrase.',
    corrective:
      'Test for a larger directed unit and evidence of closure; a local pause or motive boundary alone does not establish a phrase ending.',
    example:
      'An analyst hears a four-measure antecedent end inconclusively and a consequent answer it with stronger closure.',
    license: MUSIC_LICENSE,
    attribution: MUSIC_ATTRIBUTION,
  }),
  kernel({
    id: 'music/tonicization-and-modulation',
    term: 'Tonicization and modulation',
    aliases: ['key change', 'temporary tonic', 'pivot-chord modulation'],
    tags: ['harmony', 'tonality', 'key relationships'],
    definition: {
      text: 'Tonicization briefly makes a non-tonic harmony sound like a tonic, while modulation establishes a longer-term change of tonic.',
      anchor: anchor('omt:modulation', 'Key Takeaways', 'longer-term change of tonic'),
    },
    facts: [
      fact(
        'A modulation may introduce the new key directly and abruptly.',
        anchor('omt:modulation', 'Key Takeaways', 'direct, abrupt modulation'),
      ),
      fact(
        'A pivot-chord modulation uses a shared chord to make the move between keys more subtle.',
        anchor('omt:modulation', 'Key Takeaways', 'pivot chord modulation'),
      ),
      fact(
        'Extended tonicization can blur the boundary between a temporary tonic and a full modulation.',
        anchor('omt:modulation', 'Key Takeaways', 'extended tonicizations'),
      ),
      fact(
        'The duration and structural stability of the new tonic help distinguish modulation from a momentary tonicization.',
        anchor('omt:modulation', 'Introduction', 'temporary nature of tonicization'),
      ),
    ],
    misconception: 'Students may call every chromatic dominant chord a key change.',
    corrective:
      'Determine whether the music sustains and structurally confirms a new tonic; a brief applied chord can tonicize without modulating.',
    example:
      'An analyst compares a single applied dominant resolving immediately in the home key with a pivot chord followed by a sustained new key.',
    license: MUSIC_LICENSE,
    attribution: MUSIC_ATTRIBUTION,
  }),
];

const GOVERNMENT_LICENSE = 'U.S. Government Work';
const DIGITAL_GOV_ATTRIBUTION = ['Digital.gov, U.S. General Services Administration'];
const UX_KERNELS = [
  kernel({
    id: 'ux/service-blueprinting',
    term: 'Service blueprinting',
    aliases: ['service blueprint', 'frontstage and backstage map'],
    tags: ['service design', 'systems', 'operations'],
    definition: {
      text: 'A service blueprint maps how a service works across user actions, visible interactions, backstage activities, and supporting operations.',
      anchor: anchor('digitalgov:journeys', 'Service blueprints — What', 'works across systems and operations'),
    },
    facts: [
      fact(
        'A service blueprint clarifies relationships among systems and processes and can expose improvement opportunities.',
        anchor(
          'digitalgov:journeys',
          'Service blueprints — Why',
          'clarify relationships between systems and processes',
        ),
      ),
      fact(
        'Unlike a journey map, a service blueprint includes operational layers beyond the user perspective.',
        anchor('digitalgov:journeys', 'Understand the differences', 'created from the perspective of the user'),
      ),
      fact(
        'The diagram separates user steps, frontstage actions, backstage actions, and support processes.',
        anchor('digitalgov:journeys', 'Service blueprints — How', 'Create a diagram with four rows'),
      ),
      fact(
        'Blueprint evidence can come from desk research and interviews with users, staff, and stakeholders.',
        anchor(
          'digitalgov:journeys',
          'Service blueprints — How',
          'desk research and user, staff, and stakeholder interviews',
        ),
      ),
    ],
    misconception: 'Students may redraw a customer journey and label it a service blueprint.',
    corrective:
      'Add the operational system: distinguish what users do and see from backstage work and support processes that enable the service.',
    example:
      'A benefits-application blueprint aligns the applicant form steps with call-center actions, eligibility systems, and document-review operations.',
    license: GOVERNMENT_LICENSE,
    attribution: DIGITAL_GOV_ATTRIBUTION,
  }),
  kernel({
    id: 'ux/user-scenarios',
    term: 'User scenarios',
    aliases: ['scenario-based design', 'persona scenario'],
    tags: ['context', 'user goals', 'accessibility'],
    definition: {
      text: 'A user scenario is a narrative that situates a user type, motivation, context, goal, and tasks in a specific interaction.',
      anchor: anchor('digitalgov:user-interaction', 'User scenarios — What', 'tells a story about how users interact'),
    },
    facts: [
      fact(
        'Scenarios communicate a design idea through a specific interaction for a specific user.',
        anchor('digitalgov:user-interaction', 'User scenarios — Why', 'specific interaction for a specific user'),
      ),
      fact(
        'A scenario should state who the user is, why and where they act, what goal they have, and how they pursue it.',
        anchor('digitalgov:user-interaction', 'User scenarios — How', 'Who they are'),
      ),
      fact(
        'Scenario work can reveal how needs vary with context and across diverse users.',
        anchor('digitalgov:user-interaction', 'User scenarios — Why', 'needs might vary depending on their context'),
      ),
      fact(
        'Teams should validate and refine scenarios with the represented user group and collaborators.',
        anchor('digitalgov:user-interaction', 'User scenarios — How', 'validation, feedback, and refinement'),
      ),
    ],
    misconception: 'Students may write a feature walkthrough with no user motivation or environmental context.',
    corrective:
      'Anchor the narrative in a user type, motivation, setting, goal, and realistic tasks; otherwise it is a product script rather than a user scenario.',
    example:
      'A commuter with limited connectivity must upload an eligibility document before a deadline while using a phone on a moving bus.',
    license: GOVERNMENT_LICENSE,
    attribution: DIGITAL_GOV_ATTRIBUTION,
  }),
  kernel({
    id: 'ux/usability-testing',
    term: 'Usability testing',
    aliases: ['usability test', 'think-aloud test'],
    tags: ['evaluation', 'observation', 'research'],
    definition: {
      text: 'A usability test observes representative users attempting realistic tasks with a product or service, often while thinking aloud.',
      anchor: anchor('digitalgov:usability-testing', 'What', 'observes users as they attempt to use'),
    },
    facts: [
      fact(
        'A usability test can examine a sketch, prototype, competitor product, or other artifact relevant to a user goal.',
        anchor('digitalgov:usability-testing', 'How to do it', 'Choose what you will test'),
      ),
      fact(
        'The plan should align the team on scenarios, participants, recruitment, moderation, and observation roles.',
        anchor('digitalgov:usability-testing', 'How to do it', 'Plan the test'),
      ),
      fact(
        'A test script gives the session a repeatable structure without turning the moderator into a teacher.',
        anchor('digitalgov:usability-testing', 'How to do it', 'Prepare a usability test script'),
      ),
      fact(
        'Recruitment should identify appropriate users and obtain their consent before the session.',
        anchor('digitalgov:usability-testing', 'How to do it', 'Recruit users and get their consent'),
      ),
    ],
    misconception:
      'Students may treat a usability test as a demonstration in which the moderator explains the correct path.',
    corrective:
      'Observe participants attempting realistic tasks with minimal coaching so the evidence reflects the design rather than the moderator instruction.',
    example:
      'A moderator asks participants to find and submit a form, watches where they hesitate, and records task success without showing the route.',
    license: GOVERNMENT_LICENSE,
    attribution: DIGITAL_GOV_ATTRIBUTION,
  }),
  kernel({
    id: 'ux/process-and-progress-indicators',
    term: 'Process and progress indicators',
    aliases: ['step indicator', 'process list', 'progress steps'],
    tags: ['status', 'workflow', 'accessibility'],
    definition: {
      text: 'Process lists explain sequential instructions, while step indicators show a user’s current position in a linear multi-page flow.',
      anchor: anchor('uswds:step-indicator', 'Overview', 'updates users on their progress'),
    },
    facts: [
      fact(
        'A step indicator suits a linear process with at least three high-level steps across multiple screens.',
        anchor('uswds:step-indicator', 'When to use', 'three or more high-level steps'),
      ),
      fact(
        'The indicator complements back and next controls; it is not navigation by itself.',
        anchor('uswds:step-indicator', 'When to use', 'not to be navigation of its own'),
      ),
      fact(
        'Completion and current-step meaning must not rely on color alone.',
        anchor('uswds:step-indicator', 'Accessibility guidance', 'make the completion status of each step explicit'),
      ),
      fact(
        'The current labeled step should be exposed programmatically with aria-current.',
        anchor('uswds:step-indicator', 'Accessibility guidance', 'use aria-current="true"'),
      ),
    ],
    misconception:
      'Students may use one indeterminate bar for every state and assume color alone explains what is happening.',
    corrective:
      'Expose named stages, distinguish complete, current, and pending states in text and semantics, and reserve a step indicator for a genuinely linear flow.',
    example:
      'A course build names Map, Enrich, Compile, Verify, and Grade, announces the current stage, and marks completed stages independently of color.',
    license: GOVERNMENT_LICENSE,
    attribution: ['U.S. Web Design System, U.S. General Services Administration'],
  }),
];

const SHARDS = [
  {
    id: 'music-scion-v01647',
    discipline: 'music',
    sourcePath: 'public/genome/music-intro.json',
    path: 'public/genome/music-scion-v01647.json',
    baseHash: '0acd827673397b71',
    baseConceptCount: 7,
    kernels: MUSIC_KERNELS,
  },
  {
    id: 'ux-scion-v01647',
    discipline: 'ux',
    sourcePath: 'public/genome/ux-intro.json',
    path: 'public/genome/ux-scion-v01647.json',
    baseHash: '97184a577a92ba3e',
    baseConceptCount: 6,
    kernels: UX_KERNELS,
  },
];

const REFERENCES = {
  'omt:texture': {
    displayTitle: 'Open Music Theory — Texture',
    sourceUrl: 'https://viva.pressbooks.pub/openmusictheory/chapter/texture/',
  },
  'omt:other-notation': {
    displayTitle: 'Open Music Theory — Other Aspects of Notation',
    sourceUrl: 'https://viva.pressbooks.pub/openmusictheory/chapter/other-aspects-of-notation/',
  },
  'omt:phrase-archetypes': {
    displayTitle: 'Open Music Theory — The Phrase, Archetypes, and Unique Forms',
    sourceUrl: 'https://viva.pressbooks.pub/openmusictheory/chapter/phrase-archetypes-unique-forms/',
  },
  'omt:modulation': {
    displayTitle: 'Open Music Theory — Extended Tonicization and Modulation',
    sourceUrl:
      'https://viva.pressbooks.pub/openmusictheory/chapter/extended-tonicization-and-modulation-to-closely-related-keys/',
  },
  'digitalgov:journeys': {
    displayTitle: 'Digital.gov — Map your users’ and system’s journeys',
    sourceUrl: 'https://digital.gov/guides/research-collaboration/user-needs/journeys',
  },
  'digitalgov:user-interaction': {
    displayTitle: 'Digital.gov — User interactions',
    sourceUrl: 'https://digital.gov/guides/research-collaboration/designing/user-interaction',
  },
  'digitalgov:usability-testing': {
    displayTitle: 'Digital.gov — Usability testing',
    sourceUrl: 'https://digital.gov/guides/research-collaboration/testing/usability',
  },
  'uswds:step-indicator': {
    displayTitle: 'U.S. Web Design System — Step indicator',
    sourceUrl: 'https://designsystem.digital.gov/components/step-indicator/',
  },
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(root, relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
}

function assertKernelSet(shard, expected) {
  const byId = new Map((shard.kernels || []).map((entry) => [entry.id, entry]));
  for (const entry of expected) {
    if (JSON.stringify(byId.get(entry.id)) !== JSON.stringify(entry)) {
      throw new Error(`Source kernel drift: ${entry.id}`);
    }
  }
}

async function writeExpansion(root) {
  for (const config of SHARDS) {
    const sourceAbsolute = path.join(root, config.sourcePath);
    const source = await readJson(root, config.sourcePath);
    const addedIds = new Set(config.kernels.map((entry) => entry.id));
    const retainedKernels = (source.kernels || []).filter((entry) => !addedIds.has(entry.id));
    source.kernels = retainedKernels;
    // Historical Foundry shards are minified, newline-free artifacts. Keep
    // their exact byte contract so earlier source-packet hashes still replay.
    const historicalBytes = JSON.stringify(source);
    if (sha256(historicalBytes).slice(0, 16) !== config.baseHash) {
      throw new Error(`${config.sourcePath} historical content drifted`);
    }
    const currentSourceRaw = await fs.readFile(sourceAbsolute);
    if (sha256(currentSourceRaw).slice(0, 16) !== config.baseHash) {
      await fs.writeFile(sourceAbsolute, historicalBytes);
    }
    const sourceRaw = await fs.readFile(sourceAbsolute);
    if (source.kernels.length !== config.baseConceptCount || sha256(sourceRaw).slice(0, 16) !== config.baseHash) {
      throw new Error(`${config.sourcePath} historical bytes drifted`);
    }
    const shard = {
      id: config.id,
      discipline: config.discipline,
      level: 'intro',
      conceptCount: config.kernels.length,
      kernels: config.kernels,
      index: { postings: {} },
    };
    await fs.writeFile(path.join(root, config.path), canonical(shard));
  }

  const manifest = await readJson(root, MANIFEST_PATH);
  manifest.version = '2026-07-16';
  manifest.shards = manifest.shards.filter((entry) => !SHARDS.some((config) => config.id === entry.id));
  for (const config of SHARDS) {
    const sourceRaw = await fs.readFile(path.join(root, config.sourcePath));
    const sourceEntry = manifest.shards.find((candidate) => candidate.path === path.basename(config.sourcePath));
    if (!sourceEntry || sha256(sourceRaw).slice(0, 16) !== config.baseHash) {
      throw new Error(`Historical genome manifest drift: ${config.sourcePath}`);
    }
    sourceEntry.conceptCount = config.baseConceptCount;
    sourceEntry.hash = config.baseHash;
    const raw = await fs.readFile(path.join(root, config.path));
    const shard = JSON.parse(raw);
    manifest.shards.push({
      id: config.id,
      discipline: config.discipline,
      level: 'intro',
      path: path.basename(config.path),
      conceptCount: shard.kernels.length,
      hash: sha256(raw).slice(0, 16),
    });
  }
  manifest.conceptCount = manifest.shards.reduce((sum, entry) => sum + Number(entry.conceptCount || 0), 0);
  manifest.references = { ...(manifest.references || {}), ...REFERENCES };
  await fs.writeFile(path.join(root, MANIFEST_PATH), canonical(manifest));
}

async function buildReceipt(root) {
  const manifestRaw = await fs.readFile(path.join(root, MANIFEST_PATH));
  const manifest = JSON.parse(manifestRaw);
  const shards = [];
  for (const config of SHARDS) {
    const sourceRaw = await fs.readFile(path.join(root, config.sourcePath));
    if (sha256(sourceRaw).slice(0, 16) !== config.baseHash) {
      throw new Error(`Historical genome source drift: ${config.sourcePath}`);
    }
    const raw = await fs.readFile(path.join(root, config.path));
    const shard = JSON.parse(raw);
    assertKernelSet(shard, config.kernels);
    const manifestEntry = manifest.shards.find((entry) => entry.id === config.id);
    const digest = sha256(raw);
    if (manifestEntry?.conceptCount !== shard.kernels.length || manifestEntry?.hash !== digest.slice(0, 16)) {
      throw new Error(`Genome manifest drift: ${config.id}`);
    }
    shards.push({
      path: config.path,
      historicalSource: {
        path: config.sourcePath,
        sha256: sha256(sourceRaw),
        preserved: true,
      },
      bytes: raw.length,
      sha256: digest,
      conceptCount: shard.kernels.length,
      addedKernelIds: config.kernels.map((entry) => entry.id),
      licenseCounts: Object.fromEntries(
        [...new Set(config.kernels.map((entry) => entry.license))].map((license) => [
          license,
          config.kernels.filter((entry) => entry.license === license).length,
        ]),
      ),
    });
  }
  const expectedConceptCount = manifest.shards.reduce((sum, entry) => sum + Number(entry.conceptCount || 0), 0);
  if (manifest.version !== '2026-07-16' || manifest.conceptCount !== expectedConceptCount) {
    throw new Error('Genome aggregate concept count or version drifted');
  }
  for (const [id, reference] of Object.entries(REFERENCES)) {
    if (JSON.stringify(manifest.references?.[id]) !== JSON.stringify(reference)) {
      throw new Error(`Genome source reference drift: ${id}`);
    }
  }
  return {
    schemaVersion: 1,
    protocol: 'scion-source-kernel-expansion-v1',
    release: RELEASE,
    generatedAt: GENERATED_AT,
    status: 'source-kernels-expanded',
    addedKernels: MUSIC_KERNELS.length + UX_KERNELS.length,
    addedByDomain: { 'music-theory': MUSIC_KERNELS.length, 'user-experience-design': UX_KERNELS.length },
    genome: {
      manifest: { path: MANIFEST_PATH, bytes: manifestRaw.length, sha256: sha256(manifestRaw) },
      conceptCount: manifest.conceptCount,
      shards,
    },
    sources: Object.entries(REFERENCES).map(([id, value]) => ({ id, ...value })),
    licenseBoundary: {
      researchCompatible: true,
      productionCompatible: false,
      reason:
        'Open Music Theory rows are CC-BY-SA-4.0. They may support the declared research lane, but the production adapter gate requires replacement or explicit legal clearance.',
    },
    claimBoundary:
      'This receipt proves eight new source-anchored public genome kernels and their file lineage. It proves no generated preference, trained adapter, model win, or production license clearance.',
  };
}

export async function runScionSourceKernelExpansion({ cwd = process.cwd(), write = false } = {}) {
  const root = path.resolve(cwd);
  if (write) await writeExpansion(root);
  const receipt = await buildReceipt(root);
  const receiptFile = path.join(root, RECEIPT_PATH);
  if (write) {
    await fs.mkdir(path.dirname(receiptFile), { recursive: true });
    await fs.writeFile(receiptFile, canonical(receipt));
  } else {
    const tracked = await fs.readFile(receiptFile, 'utf8');
    if (tracked !== canonical(receipt)) throw new Error('Tracked source-kernel expansion receipt is stale');
  }
  return { receipt, receiptFile, wrote: write };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--write')) throw new Error(`Unknown source-kernel expansion option`);
  const result = await runScionSourceKernelExpansion({ write: args.has('--write') });
  console.log(
    `Scion source kernels: +${result.receipt.addedKernels} (${Object.entries(result.receipt.addedByDomain)
      .map(([domain, count]) => `${domain} ${count}`)
      .join(', ')})`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${path.relative(process.cwd(), result.receiptFile)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
