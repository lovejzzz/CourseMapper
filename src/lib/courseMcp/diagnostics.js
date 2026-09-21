import { isMetadataOnlyPracticeRecord } from '../quality/practiceRecordSubstance.js';

/** Descriptive diagnostics over actual generated content, not a quality score. */
export function diagnoseCourseOutput(snapshot) {
  const quizzes = snapshot.deliverables?.quizBank?.data?.quizzes || [];
  const findings = [];
  for (const [quizIndex, quiz] of quizzes.entries()) {
    const questions = quiz.questions || [];
    const unresolved = questions.filter((q) => q.sourceReviewRequired === true);
    const metadataOnly =
      isMetadataOnlyPracticeRecord(quiz.practiceRecord) ||
      questions.some((q) => isMetadataOnlyPracticeRecord(q.practiceRecord));
    const base = {
      feature: 'quizBank',
      lessonNumber: quiz.lessonNumber,
      title: quiz.lessonTitle,
      path: `/materials/quizBank/quizzes/${quizIndex}`,
    };
    if (metadataOnly)
      findings.push({
        ...base,
        code: 'METADATA_ONLY_PRACTICE',
        severity: 'warning',
        message:
          'The practice record contains lesson instructions rather than subject inputs. Inspect whether the questions actually test the subject.',
        evidence:
          quiz.practiceRecord?.records?.slice(0, 2) ||
          questions.find((q) => isMetadataOnlyPracticeRecord(q.practiceRecord))?.practiceRecord.records.slice(0, 2),
      });
    if (unresolved.length)
      findings.push({
        ...base,
        code: 'REFERENCE_ANSWERS_UNREVIEWED',
        severity: 'warning',
        count: unresolved.length,
        message:
          'Questions have no verified specific reference response. General scoring guidance is not a solved answer.',
        questionIds: unresolved.map((q) => q.id).slice(0, 20),
      });
  }
  const digest = snapshot.lastRunDigest;
  return {
    courseName: snapshot.courseMap?.courseName,
    lessonCount: snapshot.courseMap?.lessons?.length || 0,
    materialTypes: Object.keys(snapshot.deliverables || {}),
    findings,
    recordedRun: digest
      ? {
          appVersion: digest.appVersion,
          at: digest.at,
          provider: digest.run?.provider,
          modelCalls: digest.run?.providerCalls,
          pipeline: Object.fromEntries(
            ['scionEvidenceAdmission', 'groundingMetrics', 'nativeAuthoring', 'enrichment', 'voicePass']
              .filter((key) => digest.pipeline?.[key])
              .map((key) => [key, digest.pipeline[key]]),
          ),
        }
      : null,
    recordedQuality: snapshot.packageQualityPass
      ? {
          status: snapshot.packageQualityPass.status,
          trustState: snapshot.packageQualityPass.trustState,
          topIssues: snapshot.packageQualityPass.receipt?.topIssues || [],
        }
      : null,
    boundary:
      'These checks expose observed output defects and recorded run signals. Absence of findings does not certify subject accuracy or teaching quality. Inspect the actual materials; fix and retest website generation code rather than silently rewriting this course.',
  };
}
