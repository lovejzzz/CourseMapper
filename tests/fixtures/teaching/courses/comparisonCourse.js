import { comparisonDesignFixture } from '../comparisonDesign.js';
import { helicopterInputs, helicopterTransfers } from './helicopterTransfer.js';

// Implementer-authored course draft, not independent teacher validation or
// hidden benchmark data. One protocol develops across all six sessions.
const stages = [
  {
    title: 'Separate an observation from a causal claim',
    action:
      'Build a two-row evidence table from the workshop records. State the observed difference, identify both changes, and rewrite “gel ink dries faster” as a claim the records actually support.',
    answer:
      'Water-based ink at 18 °C has a recorded median drying time of 90 s; gel ink at 26 °C has 60 s. The second combination has a median 30 s lower. Formula and temperature both changed, so the difference does not isolate formula. The original sample sizes and individual readings are missing.',
    reasoning: [
      'Attribute each median to its ink–temperature combination.',
      'Subtract 60 from 90 to describe the median difference.',
      'Keep description separate from a causal effect of formula.',
    ],
    partial: 'The gel-ink group has a lower recorded median, but temperature may matter.',
    wrong: 'Gel ink reduces drying time by 30 seconds for every card.',
    feedback:
      'Label both conditions beside each median. Replace the formula-only claim with a statement about the observed combinations.',
    levels: [
      'Attributes both medians, gives the 30 s descriptive difference, identifies both changed conditions and missing sample detail, and withholds a formula-only causal claim.',
      'Correctly compares the combinations and identifies confounding, but omits the missing sample sizes or individual readings.',
      'Names temperature as a possible issue but does not correctly attribute both medians or distinguish the descriptive difference.',
      'Treats the median difference as a proven ink effect or as a change for every individual card.',
    ],
    check: 'What changed besides formula, and which record gives that setting?',
    checkAnswer: 'Temperature changed from 18 °C in record A to 26 °C in record B.',
    transfer:
      'Compare the two tray records. Give the recorded mass-loss difference, identify the confound, and state the causal limit.',
    transferAnswer:
      'The shallow trays at 28 °C lost 18 g and the deep trays at 20 °C lost 9 g over 15 minutes: a recorded difference of 9 g between combinations. Tray shape and room temperature both differ. These group summaries do not isolate a shape effect or describe every tray.',
  },
  {
    title: 'Choose independent units and a feasible allocation',
    action:
      'Continue the protocol from lesson 1. Identify what can receive an ink assignment independently. Allocate all 32 fresh cards between formulas, describe an executable random assignment, and distinguish cards from repeated checks.',
    answer:
      'The card is the independently assignable unit. Number fresh cards 1–32, shuffle those IDs, assign the first 16 to water-based ink and the rest to gel ink, and record the allocation before stamping. Use each card once. The five-second strip checks determine one drying-time result per card; they are not extra cards or independent ink assignments.',
    reasoning: [
      'Use the unit specified in the planning brief.',
      'Check that 16 + 16 accounts for all 32 available cards.',
      'Separate observations within a card from independently assigned cards.',
    ],
    partial: 'Use 16 cards for each ink, with several strip checks per card.',
    wrong: 'Ten strip checks on each of three cards give thirty independent experimental units.',
    feedback:
      'Count assignment units before counting measurements. State how each numbered card receives one ink and how one final result is recorded.',
    levels: [
      'Names cards as units, gives a feasible allocation using all 32, specifies a reproducible random assignment and keeps repeated checks within cards.',
      'Correctly allocates and randomizes 32 cards but does not explain why strip checks are not independent units.',
      'Gives 16 cards per formula but leaves assignment to convenience or confuses checks with units.',
      'Counts repeated checks as independent units, assigns the same card both formulas without a valid design, or exceeds 32 cards.',
    ],
    check: 'If one card is checked six times, how many independently assigned cards does that provide?',
    checkAnswer: 'One independently assigned card and repeated checks used to determine its drying time.',
    transfer:
      'Plan a randomized allocation of the 24 fresh trays to two shapes. Identify the unit and distinguish repeated balance readings from independent units.',
    transferAnswer:
      'Number the 24 trays, shuffle their IDs, assign 12 to each shape, and save that allocation before filling. Each tray receives one shape condition and produces one 15-minute mass-loss result. Reweighing a tray does not create another independently assigned tray.',
  },
  {
    title: 'Make the outcome measurable',
    action:
      'Add a measurement and data-recording section to the protocol. Use the provided drying rule, identify the timing resolution, and specify what to record when a run is interrupted before the dry endpoint.',
    answer:
      'Start a timer when stamping. Every five seconds use a fresh clean strip with the same light pressing procedure; record elapsed seconds at the first check with no transfer. This gives an endpoint detected on a five-second grid, not an exact continuous drying instant. Save card ID, formula, temperature, run order, check times and endpoint. For an interruption, record its time and reason, leave the endpoint missing, and do not enter zero or silently drop the card.',
    reasoning: [
      'Use a common observable endpoint rather than an impression of dryness.',
      'Relate five-second checks to measurement resolution.',
      'Distinguish a missing endpoint from a true observed value.',
    ],
    partial: 'Check every five seconds until dry and record the time.',
    wrong: 'Enter zero seconds for an interrupted run so the spreadsheet is complete.',
    feedback:
      'Define “dry” by the strip result. Add a separate missing-endpoint field and explain how the checking interval limits precision.',
    levels: [
      'Specifies the common transfer endpoint, five-second checks, required record fields, timing resolution and transparent handling of interrupted runs.',
      'Gives the endpoint, common checks and honest missing-data handling, but omits timing resolution or a record field.',
      'Says to time until dry but leaves the endpoint subjective or omits interrupted-run handling.',
      'Invents exact timing precision or records an interrupted observation as zero/completed.',
    ],
    check: 'A card transfers ink at 20 s and not at 25 s. What is recorded, and what remains uncertain?',
    checkAnswer: 'Record the first no-transfer check at 25 s; the exact transition between checks is not observed.',
    transfer:
      'Define one reproducible mass-loss measurement for every tray and a record for a spilled or interrupted trial.',
    transferAnswer:
      'Record tray ID and shape, weigh the filled tray at the start and at 15 minutes using the same balance, and subtract final mass from initial mass. Record actual timing and room temperature. For a spill or interruption, flag the run and explain why its mass change cannot be interpreted as evaporation; do not turn it into zero loss.',
  },
  {
    title: 'Prevent conditions and order from following treatment',
    action:
      'Integrate the assignment and measurement sections from lessons 2–3. Choose one allowed common temperature, state the retained controls, and give a run-order procedure that does not stamp all of one formula first.',
    answer:
      'Use 18 °C for both formulas, or 26 °C for both, and verify that setting during runs. Retain the same card stock, stamped area, ink volume and strip procedure. After allocating cards, independently shuffle all 32 IDs to define run order, interleaving formulas as the shuffle dictates. Record order and deviations. Random assignment and a mixed run order reduce systematic alignment with conditions; neither guarantees identical cards or proves an effect.',
    reasoning: [
      'Remove the temperature–formula alignment from the original records.',
      'Keep the specified non-treatment conditions consistent.',
      'Prevent a time trend from being tied to formula by treatment-blocked run order.',
    ],
    partial: 'Use the same temperature and shuffle the cards.',
    wrong: 'Run water-based ink at 18 °C first, then gel ink at 26 °C, because those were the original settings.',
    feedback:
      'Write the temperature once for the whole comparison, then distinguish the allocation shuffle from the run-order shuffle.',
    levels: [
      'Chooses an allowed common temperature, retains the named controls, specifies mixed run order and records deviations without promising perfect balance.',
      'Gives common conditions and mixed order but does not distinguish allocation from order or explain a limitation.',
      'Mentions control variables or randomization without an executable common-setting and ordering procedure.',
      'Keeps formula aligned with temperature or time order, or claims randomization guarantees a valid causal result.',
    ],
    check: 'Why does random card allocation not by itself justify running every gel card after every water-based card?',
    checkAnswer:
      'Conditions may drift over time; treatment-blocked run order can align that drift with formula despite random allocation.',
    transfer:
      'Remove the temperature confound in the tray study and specify how filling/weighing order will be handled consistently across shapes.',
    transferAnswer:
      'Use 20 °C for both shapes, or 28 °C for both, with the specified common water mass and balance procedure. Randomize tray allocation and the order of starting trials; record individual start times and obtain each endpoint 15 minutes later. Do not run all trays of one shape in one time block and the other shape later.',
  },
  {
    title: 'Plan analysis before seeing results',
    action:
      'Write the analysis section for the accumulating protocol. State a comparison using the future card-level data, how variability and missing runs will be reported, and what cannot be concluded before the trial.',
    answer:
      'Keep one endpoint row per card and report the observed number of usable and interrupted runs by formula. Compare the distributions and a declared summary such as the median drying time for each formula, together with the observed spread. Show interrupted-run counts and reasons and assess whether exclusions differ by formula; do not silently delete them. No new drying-time results exist yet. The 32 available cards are a resource constraint, not a power calculation or a guarantee of statistical significance.',
    reasoning: [
      'Match analysis rows to independent units.',
      'Compare a stated summary alongside variation rather than repeating one selected result.',
      'Separate planned analysis from collected evidence and expose missingness.',
    ],
    partial: 'Compare the two medians after collecting the data.',
    wrong: 'The new experiment will prove gel ink is faster because there are 32 cards.',
    feedback:
      'Use future-tense analysis instructions, add spread and usable/missing counts, and remove any invented result or significance guarantee.',
    levels: [
      'Specifies card-level analysis, summary and spread, transparent missing-run reporting and clear limits on uncollected results and sample-size claims.',
      'Plans a suitable comparison and avoids invented results but omits spread or missing-run reporting.',
      'Only names an average or median without defining data rows or how incomplete runs are handled.',
      'Invents future values, promises significance, or treats resource availability as proof of adequate statistical power.',
    ],
    check: 'Can the old 90 s and 60 s medians be used as the new trial’s results?',
    checkAnswer:
      'No. They came from the original confounded combinations and do not supply results for the proposed common-temperature trial.',
    transfer:
      'Plan a comparison of future tray-level mass losses, including spread, unusable trials and an honest statement about results not yet collected.',
    transferAnswer:
      'Compare one valid 15-minute mass loss per independently assigned tray by shape, report a stated summary with spread, and show usable and spilled/interrupted counts with reasons by shape. Investigate whether exclusions differ between shapes. The new losses are unknown; the 24 trays do not guarantee a detectable or statistically significant effect.',
  },
];
const practiceInputs = [
  {
    id: 'tray-observation',
    kind: 'fictional',
    text: 'Fictional prior tray study: shallow trays at 28 °C had a recorded group mass loss of 18 g over 15 minutes; deep trays at 20 °C had 9 g. Individual results and original sample sizes are unavailable.',
  },
  {
    id: 'tray-plan',
    kind: 'fictional',
    text: 'New-test resources, not results: 24 fresh trays can each be assigned a shallow or deep shape condition. Use the same initial water mass, water source, 15-minute duration and balance. Room settings of 20 °C and 28 °C are available. Investigate tray shape while keeping temperature common. Spills can occur and must be recorded.',
  },
];
// These anchors describe visible decisions, not writing fluency. Reusing one
// tray case develops a second portfolio; it is not a fresh capstone assessment.
const anchors = [
  {
    alternative:
      'Observed combination | median: water/18 °C | 90 s; gel/26 °C | 60 s. Difference (gel minus water): −30 s. Both ink and temperature vary. Without the original counts and individual values, this table establishes neither a formula effect nor an individual-card change.',
    levels: [
      'Attributes 18 g and 9 g to their shape–temperature combinations, computes 9 g, names both changes and withholds a shape-only or individual-tray conclusion.',
      'Gives the correct combination difference and temperature confound, but does not distinguish group summaries from individual tray results.',
      'Recognizes temperature differs but omits the 9 g comparison or fails to attach the losses to both conditions.',
      'Claims shallow shape causes 9 g more evaporation, or treats the group difference as a result for every tray.',
    ],
    feedback:
      'Put shape and temperature beside each loss, subtract the recorded values, then remove any claim that shape alone caused the difference.',
  },
  {
    alternative:
      'Prepare 16 water labels and 16 gel labels. Mix the 32 labels face down and draw one without replacement for each fresh numbered card. Save each assignment; never reuse a card. Repeated five-second checks contribute to that card’s single endpoint, not to the number of independently assigned cards.',
    levels: [
      'Uses 24 independently assigned trays, specifies 12 per shape and an executable random allocation, and explains why repeat weighings do not increase the unit count.',
      'Correctly randomizes 12 trays to each shape but leaves repeated readings versus independent trays unexplained.',
      'Allocates 12 per shape but uses convenience assignment or gives no executable random procedure.',
      'Counts repeated weighings as new independent trays, reuses trays across conditions without a justified design, or requires more than 24 trays.',
    ],
    feedback:
      'Make an allocation list with 24 tray IDs and exactly one shape per ID. Explain how the list is randomized and why another weighing does not add a tray.',
  },
  {
    alternative:
      'Use a sheet with columns card ID, ink, temperature, run order, check times, first clean-strip time and interruption reason. Start at stamping; press a fresh strip lightly every 5 s. The first no-transfer check is the endpoint on that checking grid. An interrupted run retains its observed check times and a blank endpoint, never an invented zero.',
    levels: [
      'Defines initial-minus-final mass at 15 minutes on the same balance, identifies each tray and conditions, and separately flags spills or interruptions as uninterpretable evaporation results.',
      'Defines the paired mass readings and 15-minute interval and flags spills, but omits an identifying or condition field.',
      'Says to weigh trays but omits the subtraction, common interval or handling of spills.',
      'Uses final mass alone as mass loss, reverses the subtraction, or records spilled/interrupted trials as zero evaporation.',
    ],
    feedback:
      'Write the two readings and subtraction for one tray. Add an explicit spill flag so water lost by spilling cannot be counted as evaporation.',
  },
  {
    alternative:
      'Select 26 °C for the entire comparison and log deviations. Keep stock, area, ink volume and strip testing constant. Following treatment allocation, draw all 32 card IDs without replacement to form a separate run schedule. Record that schedule. Mixing order reduces alignment with drift; chance imbalance and other influences remain possible.',
    levels: [
      'Chooses one allowed temperature for both shapes, keeps water mass and balance consistent, randomizes starting order and schedules each endpoint 15 minutes after its own start.',
      'Removes the temperature confound and mixes starting order, but leaves each tray’s individual 15-minute endpoint implicit.',
      'Names common controls or randomization without specifying the common setting or executable start/end schedule.',
      'Keeps shallow trays at 28 °C and deep trays at 20 °C, or runs shapes in separate time blocks while claiming order is controlled.',
    ],
    feedback:
      'Write one temperature for both shapes and a start/end schedule for individual trays. Check that every interval is 15 minutes even when starts are staggered.',
  },
  {
    alternative:
      'Pre-register a card-level dot plot and the median plus minimum–maximum range for each formula. Next to each plot show usable/assigned counts and interruption reasons. Examine whether missing endpoints concentrate in one formula before interpreting a difference. Leave numerical result cells empty until collection; 32 cards is the available resource, not evidence of power or significance.',
    levels: [
      'Plans tray-level mass losses by shape with a declared summary and spread, reports usable and spoiled/interrupted counts and reasons, and avoids invented results or power guarantees.',
      'Uses tray-level losses, a summary and honest unknown results, but omits spread or unusable-trial counts and reasons.',
      'Only proposes comparing an average, without identifying the unit-level data or treatment of invalid trials.',
      'Invents future losses, silently includes spills as evaporation, or claims 24 trays guarantees significance.',
    ],
    feedback:
      'Add spread and valid/invalid counts by shape beside the planned comparison. Keep every future result blank and distinguish available trays from a power calculation.',
  },
];
function requirement(stage, index, weight = 100) {
  const [exemplary, proficient, developing, beginning] = stage.levels;
  const anchor = anchors[index];
  const [transferExemplary, transferProficient, transferDeveloping, transferBeginning] = anchor.levels;
  return {
    id: `design-${index + 1}`,
    weight,
    label: stage.title,
    action: stage.action,
    answer: stage.answer,
    reasoning: stage.reasoning,
    levels: { exemplary, proficient, developing, beginning },
    feedback: stage.feedback,
    guided: { question: stage.check, answer: stage.checkAnswer },
    examples: {
      partial: stage.partial,
      misconception: stage.wrong,
      alternative: anchor.alternative,
    },
    transfer: {
      action: stage.transfer,
      answer: stage.transferAnswer,
      reasoning: [
        'Identify the supplied tray conditions and the source of each quantity.',
        'Apply the same design principle to the tray setting without copying ink results.',
      ],
      feedback: anchor.feedback,
      levels: {
        exemplary: transferExemplary,
        proficient: transferProficient,
        developing: transferDeveloping,
        beginning: transferBeginning,
      },
    },
  };
}
export function comparisonCourseDraft() {
  const base = comparisonDesignFixture(false);
  const lessons = stages.map((stage, index) => ({
    ...base,
    title: stage.title,
    objective: stage.action,
    requirements: [requirement(stage, index)],
    practiceInputs,
    progression: `Protocol portfolio, stage ${index + 1}: ${stage.action}`,
  }));
  const finalTransfer = helicopterTransfers();
  lessons.push({
    ...base,
    title: 'Revise and defend a complete protocol',
    objective:
      'Combine and revise the protocol developed in lessons 1–5, defend its evidence limits, then independently design a paper-helicopter comparison from a previously unpractised source packet.',
    requirements: stages.map((stage, index) => ({ ...requirement(stage, index, 20), transfer: finalTransfer[index] })),
    practiceInputs: structuredClone(helicopterInputs),
    progression:
      'Submit the full ink protocol portfolio from lessons 1–5 with a before/after revision note responding to peer feedback. Independently complete the paper-helicopter case before opening its reference. Defend allocation, controls, measurement and analysis using that new packet; it supplies no new-trial results.',
  });
  return {
    id: 'experiment-course-en-draft',
    language: 'en',
    title: 'From workshop records to a defensible experiment',
    description:
      'Six 50-minute sessions for upper-secondary learners who can read a two-condition table and subtract measurements. Learners build, critique and revise one ink-testing protocol across sessions. All records are explicitly fictional; no new trial results are supplied. The course develops source-grounded causal limits, independent units, measurement, allocation, analysis and transfer.',
    sourceKind: 'implementer-authored explicit teaching structure using exposed fictional development records',
    lessons,
  };
}
