import { evidenceTransferPackets } from './teachingTaskEvidenceTransferPackets.js';
import { explicitSourceRelationTask } from './teachingTaskSourceRelations.js';
import { explicitExperimentalExtensionTask } from './teachingTaskExperimentalExtensions.js';
import { sourceQuantityTask } from './teachingTaskQuantityOperations.js';
import { explicitExperimentalDesignTask } from './teachingTaskEvidenceOperations.js';
import { compareSourceProportions, inconsistentParticipantCountsTask } from './teachingTaskProportionOperations.js';

// New fictional packets exercise the same operation in a different setting.
// They contain no answer key in the student question. Existing operation
// compilers produce the teacher key and its matching criterion descriptors.
const experiments = {
  'counterbalance-order-and-task': {
    objective: 'Design a comparison that separates practice order from music effects.',
    sources: [
      'In a fictional symbol-search study, all volunteers first find symbols on a page in silence, then repeat the same page with music. Everyone completes the second search faster.',
      'There are no counterbalanced sequences. Music, second position and practice coincide; the record supplies no results from other orders or page versions.',
    ],
    directions:
      'Explain two competing explanations for the faster second search. Design a comparison that separates condition, page version and order, and specify what to measure.',
  },
  'self-selection-and-baseline': {
    objective: 'Design a comparison of learning methods with baseline differences and self selection.',
    sources: [
      'In a fictional vocabulary class, learners choose either drawing words or writing definitions. The drawing group has higher starting knowledge on a common pretest and higher scores on the same final test.',
      'There was no random assignment. Learners self-selected their method; the final scores alone do not establish which method caused better learning.',
    ],
    directions:
      'Explain why the final scores cannot isolate the learning method. Propose an allocation, practice and measurement plan, and distinguish it from adjusting the original observations.',
  },
  'cluster-treatment-unit': {
    objective: 'Identify the experimental unit and design independent replication.',
    sources: [
      'A fictional seedling trial uses two trays with twenty seedlings in each. One whole tray receives mixture A and the other receives mixture B; every seedling within a tray shares its mixture and watering system.',
      'Only one tray receives each mixture. Individual seedling heights are measured after the same duration; there are no independently assigned replicate trays.',
    ],
    directions:
      'Identify the treatment-assignment unit and the measurement unit. Explain whether measuring more seedlings in the same trays creates independent replication. Design a replicated comparison.',
  },
  'incomplete-measurement-plan': {
    objective: 'Specify an experimental comparison before collecting outcomes.',
    sources: [
      'A fictional class plans to compare two growing media for bean plants and calls the preferred medium “better.” No results have been collected.',
      'The plan does not specify the outcome, when it will be measured, or how plants will be allocated to the two media.',
    ],
    directions:
      'Turn “better” into a measurable proposed outcome. Specify time, independent allocation and comparable conditions. Explain why these choices do not yet establish a result.',
  },
};

const quantityPackets = {
  'pooled-proportion': {
    objective: 'Calculate the combined resolution proportion across the two queues.',
    sources: [
      'Queue Cedar received 16 tickets and resolved 12; Queue Pine received 64 tickets and resolved 24.',
      'Count all resolved tickets among all received tickets; the queues contain separate tickets.',
      'Ticket complexity was not controlled, so the rates do not establish a causal queue advantage.',
    ],
    directions:
      'Calculate the combined resolution proportion. Explain the effect of unequal queue sizes and whether averaging the queue percentages answers the same question.',
  },
  'union-bounds': {
    objective: 'Find the fraction of members attending at least one activity.',
    sources: [
      'A fictional society has 50 members; 35 attended a rehearsal and 30 attended a performance.',
      'Members may attend both events; the overlap is unknown.',
      'Each count refers to distinct members within that event.',
    ],
    directions:
      'Determine the possible range of the fraction attending at least one event. Explain why the sum cannot exceed the membership and identify the missing observation.',
  },
  'count-unit-boundary': {
    objective: 'Distinguish a device proportion from an energy proportion.',
    sources: [
      'In a fictional workshop, 6 of 24 monitored devices have standby mode.',
      'All devices used 960 kilowatt-hours of energy in the recorded period.',
      'There is no energy breakdown between devices with standby mode and the remaining devices.',
    ],
    directions:
      'Calculate the fraction of devices with standby mode. Decide whether the record determines their energy share, and state exactly which measurement is missing.',
  },
};

export function operationSpecificTransfer(task) {
  let packet = evidenceTransferPackets[task.operation?.kind];
  if (task.language === 'zh' && !packet) return null;
  let body =
    packet &&
    (explicitSourceRelationTask(packet.sources, packet.objective) ||
      explicitExperimentalExtensionTask(packet.sources, packet.objective));
  if (!packet) {
    packet = experiments[task.operation?.kind];
    body = packet && explicitExperimentalDesignTask(packet.sources, packet.objective);
  }
  if (quantityPackets[task.operation?.kind]) {
    packet = quantityPackets[task.operation.kind];
    body = sourceQuantityTask(packet.sources, packet.objective);
  }
  if (task.kind === 'source-proportion-comparison') {
    packet = {
      objective: 'Compare recorded proportions and counts.',
      sources: [
        'In a fictional repair log, team A has a resolution proportion of 14/20 of its assigned tickets.',
        'Team B has a resolution proportion of 24/40 of its assigned tickets.',
        'Ticket difficulty and team assignment were not controlled, so the observed comparison does not establish a causal advantage.',
      ],
      directions:
        'Compare each team’s resolution proportion and resolved count. Show the calculation, explain any different rankings, and bound the conclusion about team performance.',
    };
    body = compareSourceProportions(packet.sources, packet.objective);
  } else if (task.kind === 'source-proportion-validation') {
    packet = {
      objective: 'Check whether the records support a participant completion proportion.',
      sources: [
        'A fictional workshop attendance list records 18 distinct participants for one session.',
        'Its completion log records 21 distinct participants who completed that session.',
        'Each participant can complete the session at most once. Neither original identity list is supplied.',
      ],
      directions:
        'Decide whether these counts define a valid completion proportion. Explain the constraint, identify the records to reconcile, and avoid inventing a corrected count.',
    };
    body = inconsistentParticipantCountsTask(packet.sources, packet.objective);
  }
  if (!body) return null;
  return {
    operationKind: task.operation?.kind || task.kind,
    sources: packet.sources,
    directions: packet.directions,
    question: `${packet.sources.join(' ')} ${packet.directions}`,
    answer: body.answer,
    reasoning: body.reasoning,
    rubric: body.criteria.map((criterion) => ({
      label: criterion.label,
      ...criterion.levels,
      feedback: criterion.feedback,
    })),
    feedback: body.criteria.map((criterion) => criterion.feedback).join(' '),
  };
}
