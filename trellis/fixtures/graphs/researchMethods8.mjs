// Golden fixture: an 8-lesson intro Research Methods course, hand-built to be
// structurally perfect (V1–V7 clean) with real kernel-grade content, so E0
// exercises the full lattice with zero tokens. Content style mirrors the
// research-methods genome shard (OpenStax-anchored facts, misconceptions with
// required correctives).

import { makeGraph } from '../../graph/schema.mjs';

export function buildResearchMethods8() {
  return makeGraph({
    course: {
      id: 'course-rm8',
      title: 'Introduction to Research Methods',
      subject: 'research methods',
      level: 'intro',
      weeks: 8,
      sessionsPerWeek: 1,
      termStart: '2026-09-07',
    },
    concepts: [
      {
        id: 'c-research-question',
        name: 'Empirical research question',
        kernelFacts: [
          'An empirical research question asks something that observation or measurement could answer.',
          'A focused research question names a population, a construct, and the relationship being asked about.',
        ],
      },
      {
        id: 'c-empirical-claim',
        name: 'Empirical claim',
        kernelFacts: [
          'An empirical claim stands or falls on evidence, not on authority or intuition.',
          'Claims that no possible observation could contradict are not empirical claims.',
        ],
      },
      {
        id: 'c-hypothesis',
        name: 'Research hypothesis',
        requires: ['c-research-question'],
        misconceptionIds: ['m-hypothesis-topic'],
        kernelFacts: [
          'A hypothesis is a testable prediction that connects a research idea to observable evidence.',
          'A strong hypothesis is specific enough that evidence could support or challenge it.',
          'A hypothesis bridges abstract theory and the real-world observations that can test it.',
        ],
      },
      {
        id: 'c-operationalization',
        name: 'Operational definition',
        requires: ['c-hypothesis'],
        misconceptionIds: ['m-constructs-measure-themselves'],
        kernelFacts: [
          'An operational definition specifies the exact procedure or instrument used to measure a construct.',
          'The same construct can be operationalized in different ways, and the choice changes what the data can say.',
        ],
      },
      {
        id: 'c-validity-reliability',
        name: 'Validity and reliability',
        requires: ['c-operationalization'],
        misconceptionIds: ['m-reliable-means-valid'],
        kernelFacts: [
          'Reliability is the consistency of a measure across repetitions; validity is whether it measures what it claims to.',
          'A measure can be perfectly consistent and still measure the wrong thing.',
        ],
      },
      {
        id: 'c-sampling',
        name: 'Sampling and selection bias',
        requires: ['c-research-question'],
        misconceptionIds: ['m-bigger-fixes-bias'],
        kernelFacts: [
          'A sample supports conclusions about a population only if the way it was drawn does not systematically exclude anyone.',
          'Increasing sample size shrinks sampling error but does nothing to remove selection bias.',
        ],
      },
      {
        id: 'c-experimental-design',
        name: 'Experimental design',
        requires: ['c-hypothesis', 'c-operationalization'],
        kernelFacts: [
          'An experiment manipulates one variable while holding others constant to isolate its effect.',
          'A control group provides the comparison that makes an observed difference interpretable.',
        ],
      },
      {
        id: 'c-random-assignment',
        name: 'Random assignment',
        requires: ['c-experimental-design'],
        misconceptionIds: ['m-assignment-is-sampling'],
        kernelFacts: [
          'Random assignment distributes both known and unknown confounds evenly across conditions.',
          'Random assignment concerns which condition a participant gets, not who gets into the study.',
        ],
      },
      {
        id: 'c-correlation-causation',
        name: 'Correlation versus causation',
        requires: ['c-experimental-design'],
        misconceptionIds: ['m-correlation-causes'],
        kernelFacts: [
          'A correlation between two variables is compatible with either one causing the other or a third variable causing both.',
          'Only designs that control exposure — typically through random assignment — can support causal claims.',
        ],
      },
      {
        id: 'c-research-ethics',
        name: 'Research ethics',
        kernelFacts: [
          'The Belmont Report grounds research ethics in respect for persons, beneficence, and justice.',
          'Ethical review weighs the risks to participants against the value of the knowledge sought.',
        ],
      },
      {
        id: 'c-informed-consent',
        name: 'Informed consent',
        requires: ['c-research-ethics'],
        kernelFacts: [
          'Informed consent requires that participants understand the study, its risks, and their right to withdraw.',
          'Consent is a process, not a signature: it must hold for the study participants actually experience.',
        ],
      },
      {
        id: 'c-peer-review',
        name: 'Peer review',
        requires: ['c-empirical-claim'],
        kernelFacts: [
          'Peer review filters claims through independent experts before publication, catching errors the authors missed.',
          'Peer review is a quality floor, not a truth guarantee; reviewed findings can still fail to replicate.',
        ],
      },
    ],
    misconceptions: [
      {
        id: 'm-hypothesis-topic',
        conceptId: 'c-hypothesis',
        statement: 'A hypothesis is a broad topic or a personal opinion about what will happen.',
        corrective:
          'A hypothesis must be a testable prediction: ask what observable result would count as evidence against it. If nothing could, it is a topic, not a hypothesis.',
      },
      {
        id: 'm-constructs-measure-themselves',
        conceptId: 'c-operationalization',
        statement: 'Abstract constructs like "stress" can be measured directly, so naming the construct is enough.',
        corrective:
          'A construct is only measurable through an operational definition that names the exact procedure or instrument — "stress" is not a measure; "score on the PSS-10 scale" is.',
      },
      {
        id: 'm-reliable-means-valid',
        conceptId: 'c-validity-reliability',
        statement: 'If a measure gives consistent results, it must be measuring the right thing.',
        corrective:
          'Consistency is not accuracy: a bathroom scale that always reads five pounds heavy is perfectly reliable and systematically invalid. Reliability is necessary for validity, never sufficient.',
      },
      {
        id: 'm-bigger-fixes-bias',
        conceptId: 'c-sampling',
        statement: 'A biased sample stops being a problem once the sample is large enough.',
        corrective:
          'Sample size shrinks random sampling error, not systematic selection bias — a million self-selected respondents still misrepresent the population in the same direction.',
      },
      {
        id: 'm-assignment-is-sampling',
        conceptId: 'c-random-assignment',
        statement: 'Random assignment and random sampling are the same thing.',
        corrective:
          'Random sampling decides who enters the study (supports generalization); random assignment decides which condition each participant gets (supports causal inference). A study can have either without the other.',
      },
      {
        id: 'm-correlation-causes',
        conceptId: 'c-correlation-causation',
        statement: 'If two variables are correlated, one must be causing the other.',
        corrective:
          'A correlation is equally compatible with reverse causation and with a third variable driving both — ice cream sales do not cause drownings; summer causes both. Causal claims need controlled exposure.',
      },
    ],
    outcomes: [
      {
        id: 'o1',
        statement: 'Formulate a focused empirical research question that names a population and a construct',
        bloom: 'create',
        conceptIds: ['c-research-question', 'c-empirical-claim'],
      },
      {
        id: 'o2',
        statement: 'Write a testable hypothesis and identify the observation that would falsify it',
        bloom: 'create',
        conceptIds: ['c-hypothesis'],
      },
      {
        id: 'o3',
        statement: 'Construct operational definitions for two abstract constructs',
        bloom: 'apply',
        conceptIds: ['c-operationalization'],
      },
      {
        id: 'o4',
        statement: 'Distinguish reliability from validity in a published measure and justify the distinction',
        bloom: 'analyze',
        conceptIds: ['c-validity-reliability'],
      },
      {
        id: 'o5',
        statement: 'Evaluate a sampling strategy for selection bias and propose a fix',
        bloom: 'evaluate',
        conceptIds: ['c-sampling'],
      },
      {
        id: 'o6',
        statement: 'Design a two-group experiment that uses random assignment to isolate one variable',
        bloom: 'create',
        conceptIds: ['c-experimental-design', 'c-random-assignment'],
      },
      {
        id: 'o7',
        statement: 'Explain why correlational evidence alone cannot establish a causal claim',
        bloom: 'understand',
        conceptIds: ['c-correlation-causation'],
      },
      {
        id: 'o8',
        statement: 'Apply informed-consent principles to a draft study protocol',
        bloom: 'apply',
        conceptIds: ['c-research-ethics', 'c-informed-consent'],
      },
    ],
    lessons: [
      {
        id: 'l1',
        week: 1,
        session: 1,
        title: 'Asking Empirical Questions',
        introduces: ['c-research-question', 'c-empirical-claim'],
        outcomeIds: ['o1'],
      },
      {
        id: 'l2',
        week: 2,
        session: 1,
        title: 'From Question to Hypothesis',
        introduces: ['c-hypothesis'],
        reinforces: ['c-research-question'],
        outcomeIds: ['o2'],
      },
      {
        id: 'l3',
        week: 3,
        session: 1,
        title: 'Measurement: Operational Definitions, Validity, and Reliability',
        introduces: ['c-operationalization', 'c-validity-reliability'],
        reinforces: ['c-hypothesis'],
        outcomeIds: ['o3', 'o4'],
      },
      {
        id: 'l4',
        week: 4,
        session: 1,
        title: 'Sampling and the Midterm Checkpoint',
        introduces: ['c-sampling'],
        reinforces: ['c-validity-reliability'],
        outcomeIds: ['o5'],
      },
      {
        id: 'l5',
        week: 5,
        session: 1,
        title: 'Experimental Design and Random Assignment',
        introduces: ['c-experimental-design', 'c-random-assignment'],
        reinforces: ['c-operationalization'],
        outcomeIds: ['o6'],
      },
      {
        id: 'l6',
        week: 6,
        session: 1,
        title: 'Correlation Is Not Causation',
        introduces: ['c-correlation-causation'],
        reinforces: ['c-random-assignment'],
        outcomeIds: ['o7'],
      },
      {
        id: 'l7',
        week: 7,
        session: 1,
        title: 'Research Ethics and Informed Consent',
        introduces: ['c-research-ethics', 'c-informed-consent'],
        outcomeIds: ['o8'],
      },
      {
        id: 'l8',
        week: 8,
        session: 1,
        title: 'Peer Review and Course Synthesis',
        introduces: ['c-peer-review'],
        reinforces: ['c-correlation-causation', 'c-hypothesis'],
        outcomeIds: ['o1', 'o7'],
      },
    ],
    assessments: [
      {
        id: 'a-q1',
        kindOf: 'quiz',
        registryKey: 'Quiz 1 — Empirical Questions',
        anchor: { lessonId: 'l1' },
        outcomeIds: ['o1'],
        weightPct: 8,
      },
      {
        id: 'a-q2',
        kindOf: 'quiz',
        registryKey: 'Quiz 2 — Hypotheses',
        anchor: { lessonId: 'l2' },
        outcomeIds: ['o2'],
        weightPct: 8,
      },
      {
        id: 'a-q3',
        kindOf: 'quiz',
        registryKey: 'Quiz 3 — Measurement',
        anchor: { lessonId: 'l3' },
        outcomeIds: ['o3', 'o4'],
        weightPct: 8,
      },
      {
        id: 'a-midterm',
        kindOf: 'exam',
        registryKey: 'Midterm Exam',
        anchor: { week: 4 },
        outcomeIds: ['o1', 'o2', 'o3', 'o4'],
        weightPct: 22,
      },
      {
        id: 'a-q5',
        kindOf: 'quiz',
        registryKey: 'Quiz 4 — Experimental Design',
        anchor: { lessonId: 'l5' },
        outcomeIds: ['o6'],
        weightPct: 8,
      },
      {
        id: 'a-q6',
        kindOf: 'quiz',
        registryKey: 'Quiz 5 — Correlation and Causation',
        anchor: { lessonId: 'l6' },
        outcomeIds: ['o7'],
        weightPct: 8,
      },
      {
        id: 'a-q7',
        kindOf: 'quiz',
        registryKey: 'Quiz 6 — Research Ethics',
        anchor: { lessonId: 'l7' },
        outcomeIds: ['o8'],
        weightPct: 8,
      },
      {
        id: 'a-final',
        kindOf: 'exam',
        registryKey: 'Final Exam',
        anchor: { week: 8 },
        outcomeIds: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8'],
        weightPct: 30,
      },
    ],
    sources: [
      {
        id: 's-openstax-psych-2-1',
        title: 'OpenStax Psychology 2e, §2.1 — Why Is Research Important?',
        url: 'https://openstax.org/books/psychology-2e/pages/2-1-why-is-research-important',
        provider: 'openstax',
        license: 'CC BY 4.0',
        trust: 'verified',
        conceptIds: ['c-research-question', 'c-empirical-claim', 'c-hypothesis'],
      },
      {
        id: 's-openstax-psych-2-2',
        title: 'OpenStax Psychology 2e, §2.2 — Approaches to Research',
        url: 'https://openstax.org/books/psychology-2e/pages/2-2-approaches-to-research',
        provider: 'openstax',
        license: 'CC BY 4.0',
        trust: 'verified',
        conceptIds: ['c-correlation-causation', 'c-experimental-design'],
      },
      {
        id: 's-openstax-psych-2-3',
        title: 'OpenStax Psychology 2e, §2.3 — Analyzing Findings',
        url: 'https://openstax.org/books/psychology-2e/pages/2-3-analyzing-findings',
        provider: 'openstax',
        license: 'CC BY 4.0',
        trust: 'verified',
        conceptIds: ['c-operationalization', 'c-validity-reliability', 'c-random-assignment'],
      },
      {
        id: 's-openstax-stats-1-2',
        title: 'OpenStax Introductory Statistics, §1.2 — Sampling and Data',
        url: 'https://openstax.org/books/introductory-statistics/pages/1-2-definitions-of-statistics-probability-and-key-terms',
        provider: 'openstax',
        license: 'CC BY 4.0',
        trust: 'verified',
        conceptIds: ['c-sampling'],
      },
      {
        id: 's-belmont',
        title: 'The Belmont Report — Ethical Principles for Research with Human Subjects',
        url: 'https://www.hhs.gov/ohrp/regulations-and-policy/belmont-report/index.html',
        provider: 'hhs.gov',
        license: 'public domain',
        trust: 'verified',
        conceptIds: ['c-research-ethics', 'c-informed-consent'],
      },
      {
        id: 's-openstax-psych-2-4',
        title: 'OpenStax Psychology 2e, §2.4 — Ethics',
        url: 'https://openstax.org/books/psychology-2e/pages/2-4-ethics',
        provider: 'openstax',
        license: 'CC BY 4.0',
        trust: 'verified',
        conceptIds: ['c-research-ethics', 'c-peer-review'],
      },
    ],
  });
}
