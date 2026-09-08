// Not shown in lessons 1–5 of the comparison course. Still an exposed,
// implementer-authored assessment, not an independent benchmark holdout.
export const helicopterInputs = [
  {
    id: 'helicopter-record',
    kind: 'fictional',
    text: 'Fictional earlier paper-helicopter trials: 4 cm blades released from 2 m had a median flight time of 1.4 s; 2 cm blades released from 1 m had 0.9 s. Original sample counts and individual times were not retained.',
  },
  {
    id: 'helicopter-plan',
    kind: 'fictional',
    text: 'New trial resources, not results: 30 fresh paper templates can each make one helicopter with either 2 cm or 4 cm blades. A helicopter is the independently assigned unit. Keep paper stock, body width, folds and the attached paper clip common. Release heights of 1 m and 2 m are available. Investigate blade length at one common height. Release without a push and time from release until first floor contact using the same timer and endpoint rule. Record desk/wall collisions and interruptions separately. Timer resolution and timing accuracy have not been supplied.',
  },
];
const rows = [
  {
    action:
      'Make an evidence table for the earlier helicopter trials. Calculate the difference in recorded medians and state why it cannot be attributed to blade length alone.',
    answer:
      'The 4 cm/2 m combination has median 1.4 s; the 2 cm/1 m combination has 0.9 s. Their recorded median difference is 0.5 s. Both blade length and release height differ. Without original counts and individual times, this does not establish a blade-length effect or a 0.5 s change for every helicopter.',
    reasoning: [
      'Attach each median to both its blade length and release height.',
      'Subtract 0.9 s from 1.4 s; retain seconds and a descriptive interpretation.',
      'Separate the combined-condition observation from an isolated blade-length effect.',
    ],
    feedback: 'Write both release heights beside the medians before interpreting the 0.5 s difference.',
    levels: [
      'Correctly attributes both medians, computes 0.5 s, names both changed factors and limits the claim to the recorded combinations.',
      'Computes the combination difference and identifies height as a confound, but omits the missing individual-data or sample-count limit.',
      'Mentions height but fails to attribute the medians or calculate the descriptive difference.',
      'Claims longer blades cause 0.5 s longer flight or applies that median difference to every helicopter.',
    ],
  },
  {
    action:
      'Allocate all 30 templates to blade lengths before construction. Describe executable random assignment and explain what repeated drops would count as.',
    answer:
      'Number the 30 templates, shuffle the IDs, assign the first 15 to 2 cm blades and the other 15 to 4 cm blades, then construct one helicopter per template. Save the allocation. A helicopter is the independently assigned unit. Repeated drops of that helicopter would be repeated observations of one unit, not additional independently assigned helicopters.',
    reasoning: [
      'Use the source-defined independent unit.',
      'Check that 15 + 15 uses all 30 templates.',
      'Distinguish treatment assignment from repeated measurements of the same object.',
    ],
    feedback:
      'Show the 30-ID allocation list and state why dropping one helicopter again does not increase independent sample size.',
    levels: [
      'Assigns 15 of the 30 templates to each length by a specified random procedure and distinguishes helicopters from repeated drops.',
      'Gives a valid randomized 15/15 allocation but leaves the interpretation of repeated drops unstated.',
      'Uses 15 per length but leaves assignment to convenience or gives no random procedure.',
      'Counts repeat drops as independent helicopters or requires more than 30 independently assigned units.',
    ],
  },
  {
    action:
      'Define the timing endpoint, recording columns and handling of collisions or interruptions. Identify what the source does not establish about timing precision.',
    answer:
      'For each helicopter, record ID, blade length, release height, run order, elapsed seconds from release without a push to first floor contact, and any deviation. Use the same timer and rule. Flag wall/desk collisions or interruptions with reasons; do not treat those runs as unobstructed flight times or replace them with zero. Timer resolution and operator timing accuracy are unspecified, so do not claim hundredth-second precision.',
    reasoning: [
      'Use an observable common start and endpoint.',
      'Separate obstructed or incomplete runs from the intended outcome.',
      'Do not invent instrument resolution or operator accuracy.',
    ],
    feedback:
      'Name the start and stop events, add a collision/interrupt flag, and remove unsupported claims of exact timing precision.',
    levels: [
      'Defines the supplied timing rule and record fields, separately handles collisions/interruption, and explicitly withholds unsupported precision claims.',
      'Uses the correct timing rule and flags invalid runs but omits a record field or the precision limit.',
      'Says to time flight without defining the endpoint or invalid-run handling.',
      'Counts a collision as normal floor-contact flight, fills an interruption with zero, or claims unsupported timing accuracy.',
    ],
  },
  {
    action:
      'Choose common conditions for the new helicopter comparison and specify release order separately from blade-length allocation.',
    answer:
      'Use 1 m for both lengths or 2 m for both, with common paper stock, body width, folds and paper clip. Use the same no-push release and timing procedure in a clear drop area. After allocation, independently shuffle helicopter IDs to form run order, recording deviations. Do not release all short-blade helicopters first and all long-blade helicopters later. Randomization reduces systematic alignment; it does not guarantee identical objects or conditions.',
    reasoning: [
      'Remove height from the systematic blade-length contrast.',
      'Keep the specified non-treatment features common.',
      'Separate allocation from run order so a time trend need not follow length.',
    ],
    feedback: 'Put one height at the top of the whole protocol and supply a separately randomized release schedule.',
    levels: [
      'Selects one allowed common height, retains specified construction/release controls and a separate mixed run order, and avoids a perfect-balance claim.',
      'Specifies common height and construction plus mixed order but leaves allocation versus order or its limitation implicit.',
      'Mentions controls or shuffling without a common height or executable order.',
      'Retains different heights for the two blade lengths or claims randomization guarantees identical groups.',
    ],
  },
  {
    action:
      'Plan how future helicopter-level times will be compared, how unusable runs will be reported, and which results remain unknown.',
    answer:
      'Plan one unobstructed flight-time result per independently assigned helicopter. Compare a declared summary such as median time by blade length with individual values or spread. Report usable, collided and interrupted counts with reasons for each length, and examine whether exclusions differ by length. No new trial values are known. Thirty templates is a resource limit, not a power calculation or a guarantee that longer blades improve flight time.',
    reasoning: [
      'Match the analysis row to the independently assigned helicopter.',
      'Show variability and exclusions beside the group summaries.',
      'Separate future analysis from observed evidence and a resource count from power.',
    ],
    feedback: 'Add spread and the reasons/counts for excluded runs by length. Keep future numerical results blank.',
    levels: [
      'Specifies helicopter-level comparison, a summary with variation, exclusions by length and no invented outcome or power guarantee.',
      'Plans a suitable comparison and avoids invented outcomes but omits spread or exclusion counts/reasons.',
      'Only proposes comparing an average without defining independent data rows or invalid-run handling.',
      'Invents new flight times, silently treats obstructed runs as valid, or promises an improvement because 30 templates are available.',
    ],
  },
];
export function helicopterTransfers() {
  return rows.map(({ levels: [exemplary, proficient, developing, beginning], ...row }) => ({
    ...structuredClone(row),
    levels: { exemplary, proficient, developing, beginning },
  }));
}
