/**
 * scripts/prof/arenas/adoptionTwin.mjs — A1twin: the same-generation paired
 * adoption arena. One captured generation, compiled by two compiler versions
 * (twinCompile), judged in PAIRS: each universe's persona reads BOTH packages
 * blind — labeled "Packet One" / "Packet Two" with the A/B → One/Two mapping
 * randomized per universe — and scores each on the anchored teach-as-is
 * scale plus a preference. The statistic is the CI on the per-universe DELTA:
 * generation variance and judge harshness cancel inside each pair, which is
 * what the confounded independent-round comparison could not do.
 */
import { runPool } from '../../lib/crucibleRound.mjs';
import { loadPersona, buildReadingPacket, ADOPTION_TIER_IDS, REJECTION_TAXONOMY } from '../personaEngine.mjs';
import { callModel, parseModelJson } from '../modelClient.mjs';
import { blindAssignments } from '../twinStats.mjs';

const TEACH_ANCHORS = `integer 1-10 anchored as follows —
    1: actively harmful or empty; adopting it would damage the course,
    2: generic filler; nothing here is specific enough to salvage,
    3: a few salvageable pieces, but I would rebuild most of it,
    4: usable skeleton; I would rewrite most student-facing prose,
    5: teachable after a full weekend of edits,
    6: teachable after several evenings of targeted edits,
    7: teachable with light edits in the weak spots,
    8: minor polish only,
    9: I would teach it as-is and adjust live,
    10: better than what I would have written`;

function twinSystemPrompt(persona) {
  return [
    `You are a real university instructor comparing TWO versions of the same AI-built course package for adoption. You are not an assistant; you are a busy professional with your own standards, and you are free to reject both.`,
    `Profile: ${persona.archetype}, ${persona.discipline}, ${persona.institution}, ${persona.experienceYears} years teaching. Tech comfort: ${persona.techComfort}.`,
    `Your standards: ${persona.standards}`,
    `Your pet peeves: ${persona.petPeeves.join('; ')}.`,
    `Your voice: ${persona.voice}.`,
    `The two packets cover the SAME course; judge each on its own merits, then compare. Do not assume either one is "the new version" — you do not know which is which.`,
    `HARD RULE: every finding must include a VERBATIM quote copied exactly from the packet it cites. Findings without an exact quote are discarded unread.`,
  ].join('\n');
}

function twinVerdictInstruction() {
  return `Return ONLY a JSON object:
{
  "packetOne": { "tier": one of ${JSON.stringify(ADOPTION_TIER_IDS)}, "teachAsIs": ${TEACH_ANCHORS}, "summary": "1-2 sentences" },
  "packetTwo": { "tier": same options, "teachAsIs": same anchored scale, "summary": "1-2 sentences" },
  "preference": "one" | "two" | "tie" — which packet you would rather start the semester from,
  "keyDifferences": ["the concrete differences that drove your preference", ...],
  "findings": [
    {
      "packet": "one" | "two",
      "taxonomy": one of ${JSON.stringify(REJECTION_TAXONOMY)},
      "severity": "P0" | "P1" | "P2",
      "file": "which document (as labeled)",
      "quote": "EXACT text copied verbatim from that packet",
      "objection": "why this matters to you, one sentence"
    }, ...
  ]
}`;
}

function renderPacket(label, packet) {
  const documents = packet.map((file) => `===== ${label} DOCUMENT: ${file.path} =====\n${file.text}`).join('\n\n');
  return `########## ${label} ##########\n${documents}`;
}

function validateSide(side, label) {
  if (!ADOPTION_TIER_IDS.includes(side?.tier)) throw new Error(`${label}: invalid tier ${side?.tier}`);
  if (!Number.isInteger(side?.teachAsIs) || side.teachAsIs < 1 || side.teachAsIs > 10) {
    throw new Error(`${label}: invalid teachAsIs ${side?.teachAsIs}`);
  }
}

export function validateTwinVerdict(verdict) {
  validateSide(verdict?.packetOne, 'packetOne');
  validateSide(verdict?.packetTwo, 'packetTwo');
  if (!['one', 'two', 'tie'].includes(verdict?.preference))
    throw new Error(`invalid preference: ${verdict?.preference}`);
  if (!Array.isArray(verdict?.findings)) throw new Error('findings must be an array');
  for (const finding of verdict.findings) {
    if (!['one', 'two'].includes(finding?.packet)) throw new Error('finding.packet must be "one" or "two"');
    if (typeof finding?.quote !== 'string' || finding.quote.trim().length < 10)
      throw new Error('finding needs a quote');
  }
  return verdict;
}

/** Unblind one universe's verdict: map packetOne/packetTwo back to A/B. */
export function unblind(verdict, aIsPacketOne) {
  const sideA = aIsPacketOne ? verdict.packetOne : verdict.packetTwo;
  const sideB = aIsPacketOne ? verdict.packetTwo : verdict.packetOne;
  const preference = verdict.preference === 'tie' ? 'tie' : (verdict.preference === 'one') === aIsPacketOne ? 'A' : 'B';
  const findings = (verdict.findings || []).map((finding) => ({
    ...finding,
    side: (finding.packet === 'one') === aIsPacketOne ? 'A' : 'B',
  }));
  return {
    teachA: sideA.teachAsIs,
    teachB: sideB.teachAsIs,
    tierA: sideA.tier,
    tierB: sideB.tier,
    summaryA: sideA.summary,
    summaryB: sideB.summary,
    preference,
    keyDifferences: verdict.keyDifferences || [],
    findings,
  };
}

export async function runAdoptionTwinArena({
  universes,
  extractedA,
  extractedB,
  courseBrief,
  meter,
  seed,
  concurrency = 3,
}) {
  const assignments = blindAssignments(universes.length, seed);
  const errors = [];

  const results = await runPool(universes, concurrency, async (universe) => {
    try {
      return await reviewOnePair(universe, assignments[universes.indexOf(universe)]);
    } catch (error) {
      if (/Spend cap/.test(String(error.message))) throw error;
      errors.push({ universeId: universe.universeId, error: String(error.message) });
      return null;
    }
  });

  async function reviewOnePair(universe, assignment) {
    const persona = await loadPersona(universe.instructor);
    // Both packets use the SAME reading order + hot spot — the pair must
    // differ only by compiler output. Half budget each: two packets share
    // one context window.
    const packetOptions = { readingOrder: universe.readingOrder, hotSpot: persona.hotSpot, charBudget: 34_000 };
    const packetA = buildReadingPacket({ extracted: extractedA, ...packetOptions });
    const packetB = buildReadingPacket({ extracted: extractedB, ...packetOptions });
    const one = assignment.aIsPacketOne ? packetA : packetB;
    const two = assignment.aIsPacketOne ? packetB : packetA;
    const user = `You asked an AI course tool to build this course: "${courseBrief}"\n\nTwo versions of the produced package follow. Review both.\n\n${renderPacket('PACKET ONE', one)}\n\n${renderPacket('PACKET TWO', two)}\n\n${twinVerdictInstruction()}`;

    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await callModel({
        model: universe.modelSeat,
        system: twinSystemPrompt(persona),
        user:
          attempt === 0
            ? user
            : `${user}\n\nYour previous reply was not valid JSON matching the schema (${lastError}). Return ONLY the JSON object.`,
        maxTokens: 3500,
        temperature: universe.temperature,
        meter,
        role: `twin:${persona.id}`,
      });
      try {
        const verdict = validateTwinVerdict(parseModelJson(response.text));
        return {
          arena: 'a1twin',
          universeId: universe.universeId,
          personaId: persona.id,
          model: response.model,
          readingOrder: universe.readingOrder,
          aIsPacketOne: assignment.aIsPacketOne,
          ...unblind(verdict, assignment.aIsPacketOne),
          costUsd: response.costUsd,
        };
      } catch (error) {
        lastError = error.message;
      }
    }
    throw new Error(`Persona ${persona.id} failed to produce a valid twin verdict: ${lastError}`);
  }

  return { pairs: results.filter(Boolean), errors };
}
