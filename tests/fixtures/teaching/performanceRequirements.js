// Authored development examples, not learner responses or independent review.
export function performanceRequirementsFixture() {
  const practiceInputs = [
    {
      id: 'device-counts',
      kind: 'fictional',
      text: 'A fictional workshop tests 25 of its 30 devices; 20 of the tested devices pass.',
    },
    {
      id: 'device-gap',
      kind: 'fictional',
      text: 'Five devices have missing batteries and cannot be tested. Their outcomes are unknown.',
    },
  ];
  const estimate = {
    id: 'estimate',
    weight: 60,
    label: 'Calculate and name the observed group',
    action:
      'Calculate the percentage choosing the shorter route among afternoon volunteers. Show the conversion and label the group.',
    answer:
      '17 of 40 afternoon volunteers choose the shorter route: 17/40 × 100 = 42.5%. This is the percentage among the observed afternoon volunteers.',
    reasoning: [
      'Choose 40 as the denominator because the 17 route choices belong to those same afternoon volunteers.',
      'Divide 17 by 40, then multiply by 100 to express the result as a percentage.',
    ],
    levels: {
      exemplary: 'Shows 17/40 × 100 = 42.5% and identifies afternoon volunteers as the observed group.',
      proficient: 'Shows the correct fraction and percentage but does not label the observed group.',
      developing: 'States 42.5% without a calculation or observed-group label.',
      beginning: 'Reverses the part and whole or claims an unsupported percentage.',
    },
    feedback: 'Label what 17 and 40 count, then write the fraction before converting to percent.',
    guided: {
      question: 'Which count is the denominator for the afternoon volunteers, and why?',
      answer: '40, because all 17 counted choices are within that recorded group of 40.',
    },
    examples: {
      partial: '42.5%.',
      misconception: '40/17 × 100 = 235.3%.',
      alternative: 'The equivalent fraction is 85/200, or 42.5 per hundred afternoon volunteers.',
    },
    transfer: {
      action:
        'Calculate the pass percentage among tested devices. Show the conversion and identify the observed group.',
      answer: '20/25 × 100 = 80% of tested devices pass; 25 is the tested count, not the full set of 30 devices.',
      reasoning: ['Use 25 tested devices as the relevant whole.', 'Divide 20 by 25 and convert to 80%.'],
      levels: {
        exemplary: 'Shows 20/25 × 100 = 80% and limits the result to tested devices.',
        proficient: 'Shows 20/25 and 80% without labelling the group.',
        developing: 'Gives 80% without explaining its denominator.',
        beginning: 'Uses 30 for the requested tested-device percentage or reverses the fraction.',
      },
      feedback: 'Separate tested devices from all recorded devices before choosing the denominator.',
    },
  };
  const nextEvidence = {
    id: 'next-evidence',
    weight: 40,
    label: 'Specify a comparable follow-up record',
    action:
      'Propose a concrete record to collect for the missing morning volunteers before discussing all event volunteers. Specify how it will be comparable.',
    answer:
      'Collect morning volunteers’ responses to the same route-choice question for the same event. Record who was approached and who responded, and check coverage of all event volunteers. This is a proposed collection, not evidence already obtained.',
    reasoning: [
      'Morning volunteers have no supplied outcome record.',
      'Using the same question and event makes the proposed observations comparable.',
      'Coverage must be checked before discussing the full event population.',
    ],
    levels: {
      exemplary:
        'Names morning volunteers, the same question/event and a coverage record; keeps the evidence proposed.',
      proficient: 'Names a comparable morning record but omits coverage.',
      developing: 'Asks for more data without naming a collection.',
      beginning: 'Invents morning results or assumes the afternoon rate applies to them.',
    },
    feedback: 'Name who will be asked, which question they receive, and how missing responses will remain visible.',
    guided: {
      question: 'What observation is missing, and how would the new question stay comparable?',
      answer: 'Morning volunteers’ route choices are missing. Use the same route-choice question for the same event.',
    },
    examples: {
      partial: 'We need more data.',
      misconception: 'Morning volunteers must also be at 42.5%, so no more collection is needed.',
      alternative:
        'A complete event roster with the same route-choice item and nonresponse marked could cover both groups without assuming equal rates.',
    },
    transfer: {
      action:
        'Specify a comparable follow-up test for the five untested devices. Explain what cannot yet be concluded.',
      answer:
        'Fit the missing batteries and apply the same pass/fail test under the same conditions to each untested device. Retain their identities and any remaining missing results. The pass rate across all 30 devices is still unknown until those outcomes are recorded.',
      reasoning: [
        'Missing batteries prevented five outcomes from being observed.',
        'The same test and conditions make the follow-up comparable.',
        'A planned test is not an observed pass result.',
      ],
      levels: {
        exemplary:
          'Specifies batteries, the same test and conditions, retained device identities and unknown full-set outcomes.',
        proficient: 'Specifies comparable retesting but omits tracking missing results.',
        developing: 'Says test again without specifying how.',
        beginning: 'Assumes all five pass or that the overall rate must be 80%.',
      },
      feedback: 'Write the retest procedure and separate planned observations from actual results.',
    },
  };
  return { requirements: [estimate, nextEvidence], practiceInputs };
}
