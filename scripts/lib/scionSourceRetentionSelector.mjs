import { assessScionKeyTermContract } from '../../src/lib/scionKeyTermContract.js';
import { scionLessonKernelSha256 } from './scionLessonKernelCampaign.mjs';

export function assessScionSourceStrictCandidate({ term, authorizedClaims = [] } = {}) {
  if (!term || authorizedClaims.length === 0) {
    return { eligible: false, issues: ['missing-candidate-or-authorized-source'] };
  }
  const assessment = assessScionKeyTermContract(term, {
    definitionMin: 45,
    knownFacts: authorizedClaims,
    semanticProfile: 'source-strict-v6',
  });
  return { eligible: assessment.eligible, issues: assessment.issues };
}

export function selectScionSourceRetentionCandidate({ control, teacher, authorizedClaims = [] } = {}) {
  const controlAssessment = assessScionSourceStrictCandidate({ term: control, authorizedClaims });
  const teacherAssessment = assessScionSourceStrictCandidate({ term: teacher, authorizedClaims });
  const selectedArm = controlAssessment.eligible ? 'matched-control' : teacherAssessment.eligible ? 'teacher-rescue' : 'quarantine';
  const selectedTerm = selectedArm === 'matched-control' ? control : selectedArm === 'teacher-rescue' ? teacher : null;
  const selection = {
    schemaVersion: 1,
    protocol: 'scion-source-retention-selector-v1',
    status: selectedTerm ? 'selected' : 'quarantined',
    selectedArm,
    selectionRule:
      'Retain the matched-control candidate whenever it passes source-strict-v6; use the teacher only when control fails and teacher passes; quarantine when neither passes.',
    controlAssessment,
    teacherAssessment,
    selectedTermSha256: selectedTerm ? scionLessonKernelSha256(selectedTerm) : null,
    productionEligible: false,
    trainingEligible: false,
    claimBoundary:
      'Selection proves deterministic retention under the source-strict gate only. It is not independent factual review or production admission.',
  };
  selection.identity = { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(selection) };
  return selection;
}
