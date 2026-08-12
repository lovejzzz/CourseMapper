import { sha256HexSync } from './sha256Sync.js';

export const INSTRUCTIONAL_INSTANCE_PROTOCOL = 'coursemapper-instructional-instance-contract-v1';
export const INSTRUCTIONAL_REQUIREMENT_PROTOCOL = 'coursemapper-instructional-requirement-v1';

function clean(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function uniqueText(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function requirementPayloads(intent = {}) {
  const expected = intent?.expectedEvidence || {};
  const criteria = uniqueText(expected.successCriteria || []);
  const specimenRequired = intent?.evidenceNeedKind && intent.evidenceNeedKind !== 'source-claims';
  return [
    {
      role: 'objective',
      required: true,
      payload: { targetObjectives: uniqueText(intent.targetObjectives || []) },
    },
    {
      role: 'modeled-example',
      required: true,
      payload: {
        focusConcepts: uniqueText(intent.focusConcepts || []),
        evidenceRequirement: clean(expected.evidenceRequirement),
      },
    },
    {
      role: 'learner-task',
      required: true,
      payload: { learnerAction: clean(intent.learnerAction), artifact: clean(expected.artifact) },
    },
    {
      role: 'assessment-criterion',
      required: true,
      payload: { successCriteria: criteria },
    },
    {
      role: 'scoring-guidance',
      required: true,
      payload: { artifact: clean(expected.artifact), successCriteria: criteria },
    },
    {
      role: 'visual-or-procedural-specimen',
      required: Boolean(specimenRequired),
      payload: {
        evidenceNeedKind: clean(intent.evidenceNeedKind),
        evidenceRequirement: clean(expected.evidenceRequirement),
      },
    },
  ];
}

function planIntentBody(intent = {}, index = 0) {
  return {
    lessonId: clean(intent.id) || `lesson-${index + 1}`,
    lessonNumber: Number(intent.lessonNumber) || index + 1,
    title: clean(intent.title),
    focusConcepts: uniqueText(intent.focusConcepts || []),
    targetObjectives: uniqueText(intent.targetObjectives || []),
    learnerAction: clean(intent.learnerAction),
    expectedEvidence: {
      artifact: clean(intent?.expectedEvidence?.artifact),
      evidenceRequirement: clean(intent?.expectedEvidence?.evidenceRequirement),
      successCriteria: uniqueText(intent?.expectedEvidence?.successCriteria || []),
    },
    evidenceNeedKind: clean(intent.evidenceNeedKind),
    sequence: {
      prerequisiteIntentId: clean(intent?.sequence?.prerequisiteIntentId) || null,
      transferIntentId: clean(intent?.sequence?.transferIntentId) || null,
      role: clean(intent?.sequence?.role),
    },
  };
}

export function buildInstructionalInstanceContract({
  course = {},
  lessonIntents = [],
  planningAuthority = null,
  predecessorByLessonId = {},
} = {}) {
  const planBody = {
    course: {
      name: clean(course?.name),
      lessonCount: Number(course?.lessonCount) || lessonIntents.length,
    },
    lessonIntents: lessonIntents.map(planIntentBody),
  };
  const planBodySha256 = sha256HexSync(canonicalJson(planBody));
  const planningContextSha256 = sha256HexSync(canonicalJson(planningAuthority || null));
  const instances = lessonIntents.map((intent, index) => {
    const lessonId = clean(intent?.id) || `lesson-${index + 1}`;
    const predecessor = predecessorByLessonId?.[lessonId];
    if (
      predecessor?.protocol === INSTRUCTIONAL_INSTANCE_PROTOCOL &&
      predecessor?.lessonId === lessonId &&
      clean(predecessor?.instructionalInstanceId) &&
      clean(predecessor?.planBodySha256)
    ) {
      return structuredClone(predecessor);
    }
    const intentBody = planIntentBody(intent, index);
    const operationSpecSha256 = sha256HexSync(
      canonicalJson({
        learnerAction: intentBody.learnerAction,
        evidenceNeedKind: intentBody.evidenceNeedKind,
        focusConcepts: intentBody.focusConcepts,
      }),
    );
    const artifactRequirementSha256 = sha256HexSync(canonicalJson(intentBody.expectedEvidence));
    const assessmentRequirementSha256 = sha256HexSync(
      canonicalJson({
        artifact: intentBody.expectedEvidence.artifact,
        successCriteria: intentBody.expectedEvidence.successCriteria,
      }),
    );
    const instructionalInstanceId = sha256HexSync(
      canonicalJson({
        protocol: INSTRUCTIONAL_INSTANCE_PROTOCOL,
        planningContextSha256,
        planBodySha256,
        lessonId,
        lessonOrdinal: index + 1,
        coverageNodes: intentBody.focusConcepts,
        operationSpecSha256,
        artifactRequirementSha256,
        assessmentRequirementSha256,
      }),
    );
    const requirements = requirementPayloads(intent).map((requirement) => {
      const requirementId = sha256HexSync(
        canonicalJson({
          protocol: INSTRUCTIONAL_REQUIREMENT_PROTOCOL,
          instructionalInstanceId,
          role: requirement.role,
          required: requirement.required,
          payload: requirement.payload,
        }),
      );
      return { ...requirement, requirementId };
    });
    const instanceWithoutReceipt = {
      protocol: INSTRUCTIONAL_INSTANCE_PROTOCOL,
      instructionalInstanceId,
      lessonId,
      lessonNumber: index + 1,
      planBodySha256,
      planningContextSha256,
      operationSpecSha256,
      artifactRequirementSha256,
      assessmentRequirementSha256,
      requirements,
    };
    return {
      ...instanceWithoutReceipt,
      receiptSha256: sha256HexSync(canonicalJson(instanceWithoutReceipt)),
    };
  });
  const contractWithoutReceipt = {
    protocol: INSTRUCTIONAL_INSTANCE_PROTOCOL,
    planBodySha256,
    planningContextSha256,
    lessonCount: instances.length,
    instances,
  };
  return {
    ...contractWithoutReceipt,
    receiptSha256: sha256HexSync(canonicalJson(contractWithoutReceipt)),
  };
}

export function instructionalInstanceReceiptMatches(instance = null) {
  if (!instance || instance?.protocol !== INSTRUCTIONAL_INSTANCE_PROTOCOL || !clean(instance?.receiptSha256)) {
    return false;
  }
  const { receiptSha256, ...payload } = instance;
  return sha256HexSync(canonicalJson(payload)) === receiptSha256;
}

export function instructionalInstanceContractReceiptMatches(contract = null) {
  if (!contract || contract?.protocol !== INSTRUCTIONAL_INSTANCE_PROTOCOL || !clean(contract?.receiptSha256)) {
    return false;
  }
  const { receiptSha256, ...payload } = contract;
  return (
    sha256HexSync(canonicalJson(payload)) === receiptSha256 &&
    Array.isArray(contract.instances) &&
    contract.instances.every(instructionalInstanceReceiptMatches)
  );
}

export function instanceByLessonId(contract = null) {
  return Object.fromEntries(
    (Array.isArray(contract?.instances) ? contract.instances : [])
      .filter(instructionalInstanceReceiptMatches)
      .map((instance) => [instance.lessonId, instance]),
  );
}
