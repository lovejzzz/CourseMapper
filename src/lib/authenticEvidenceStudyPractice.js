// Course-agnostic projection of an authenticated evidence task into a
// learner-facing worked example. The compiler injects its text helpers so
// this leaf stays deterministic, browser-safe, and independently cacheable.
export function createAuthenticDataStudyWorkedExample({ asArray, cleanText, clonePlain, stripLessonPrefix }) {
  return function authenticDataStudyWorkedExample(lesson = {}) {
    const task = lesson?.authenticDataTaskPlan;
    const examples = asArray(task?.examples);
    if (
      task?.protocol !== 'coursemapper-authentic-evidence-task-binding-v1' ||
      task?.truthProof?.promptDisplaysBoundPayload !== true ||
      task?.truthProof?.answerKeyOperatesOnBoundPayload !== true ||
      task?.truthProof?.rubricScoresDeclaredOperation !== true ||
      examples.length === 0
    ) {
      return null;
    }
    const evidenceNames = examples.map((example) => cleanText(example.displayLabel || example.id)).filter(Boolean);
    const lessonFocus = stripLessonPrefix(lesson.title);
    const first = examples[0];
    const second = examples[1];
    const evidenceLabel = evidenceNames.join(' and ');
    // The verified specimen intentionally appears in several artifact
    // families. Give each lesson its own readable reasoning path so a
    // 14-lesson course does not turn that legitimate projection into stamped
    // prose. The 4x4 combinations are deterministic, discipline-neutral, and
    // preserve the same task payload and truth proof.
    const variationIndex = (Math.max(1, Number(lesson.lessonNumber) || 1) - 1) % 16;
    const leadIndex = Math.floor(variationIndex / 4);
    const tailIndex = variationIndex % 4;
    const locatorStep =
      [
        `Find ${evidenceLabel} in the bound packet.`,
        `Begin with the packet entries labeled ${evidenceLabel}.`,
        `Open the cited evidence record and locate ${evidenceLabel}.`,
        `Trace ${evidenceLabel} to the displayed packet evidence.`,
      ][leadIndex] +
      ' ' +
      [
        `Preserve each form, gloss, translation, and source locator while analyzing ${lessonFocus}.`,
        `Record the visible forms and their gloss, translation, and locator before interpreting ${lessonFocus}.`,
        `Copy the displayed linguistic data accurately, including provenance, before addressing ${lessonFocus}.`,
        `Keep the record's form, gloss, translation, and citation intact as you work on ${lessonFocus}.`,
      ][tailIndex];
    const boundaryCheck =
      [
        `Test the tentative ${task.operation} against the analysis focus.`,
        `Audit the proposed ${task.operation} with the evidence record.`,
        `Use the stated analysis focus to challenge the ${task.operation} conclusion.`,
        `Compare the ${task.operation} result with the source-bounded observation.`,
      ][leadIndex] +
      ' ' +
      [
        'Mark the limit that applies before transfer.',
        'Separate the supported inference from the claim that needs new data.',
        'Name what this packet cannot establish beyond the displayed case.',
        'Identify where a broader claim would outrun the available evidence.',
      ][tailIndex];
    const observationStep = second
      ? [
          `Compare “${first.form}” with “${second.form}” as two displayed records.`,
          `Align the forms “${first.form}” and “${second.form}” before interpreting them.`,
          `Read “${first.form}” beside “${second.form}” and mark the contrast.`,
          `Set “${first.form}” against “${second.form}” using the packet fields.`,
        ][leadIndex] +
        ' ' +
        [
          `Describe the decisive difference, then test a ${task.operation} inference for ${lessonFocus}.`,
          `Separate the visible contrast from the ${task.operation} claim required in ${lessonFocus}.`,
          `Name what changes across the pair before explaining its role in ${lessonFocus}.`,
          `Use the aligned glosses to justify one bounded ${task.operation} conclusion.`,
        ][tailIndex]
      : [
          `Inspect “${first.form}” beside its supplied gloss “${first.gloss}.”`,
          `Read the displayed form “${first.form}” against the gloss “${first.gloss}.”`,
          `Begin with “${first.form}” and its recorded gloss “${first.gloss}.”`,
          `Align the source form “${first.form}” with “${first.gloss}.”`,
        ][leadIndex] +
        ' ' +
        [
          `Describe the first observable feature, then test a ${task.operation} inference for ${lessonFocus}.`,
          `Separate the data detail from the ${task.operation} claim needed in ${lessonFocus}.`,
          `Point to the visible pattern before explaining what it supports for ${lessonFocus}.`,
          `Use that form-gloss alignment to justify one bounded ${task.operation} conclusion.`,
        ][tailIndex];
    const interpretation =
      [
        `The ${lessonFocus} answer applies ${task.operation} to ${evidenceLabel}.`,
        `For ${lessonFocus}, the result comes from performing ${task.operation} on ${evidenceLabel}.`,
        `${evidenceLabel} supplies the record used for the ${lessonFocus} ${task.operation} conclusion.`,
        `This ${lessonFocus} analysis executes ${task.operation} on the displayed ${evidenceLabel}.`,
      ][leadIndex] +
      ' ' +
      [
        'The reasoning begins with the visible data rather than a topic label.',
        'No invented example substitutes for the forms shown in the packet.',
        'The source record, not a generic disciplinary description, controls the inference.',
        'Its evidence trail remains inspectable from the cited forms through the stated result.',
      ][tailIndex];
    const transferTask =
      [
        `Challenge the ${lessonFocus} ${task.operation} result with one new record.`,
        `Design a transfer check for the ${task.operation} conclusion reached in ${lessonFocus}.`,
        `Ask whether the ${lessonFocus} inference survives an additional linguistic record.`,
        `Extend the ${task.operation} test beyond the current ${lessonFocus} packet.`,
      ][leadIndex] +
      ' ' +
      [
        'Specify the form, gloss, and source evidence required before extending the conclusion.',
        'Name the added language data and provenance that would support or overturn the claim.',
        'State what must be displayed and cited before treating the pattern as transferable.',
        'Identify the next observable form and the locator needed to test generalization.',
      ][tailIndex];
    const evidenceBoundary =
      examples.length === 1
        ? examples.map((example) => cleanText(example.communityContext)).find(Boolean) ||
          `The conclusion is limited to ${evidenceLabel} and its cited source location.`
        : `The ${task.operation} result is limited to these ${examples.length} cited records and their recorded contexts; it does not establish unseen languages, varieties, or constructions.`;
    return {
      protocol: 'coursemapper-authentic-evidence-study-practice-v1',
      problem: task.prompt,
      steps: [locatorStep, observationStep, boundaryCheck],
      result: task.answerKey,
      interpretation,
      boundary: evidenceBoundary,
      transferTask,
      verification: {
        checked: true,
        payloadSha256: task.payloadSha256,
        evidenceItemIds: [...asArray(task.evidenceItemIds)],
        operation: task.operation,
      },
      truthProof: clonePlain(task.truthProof),
    };
  };
}
