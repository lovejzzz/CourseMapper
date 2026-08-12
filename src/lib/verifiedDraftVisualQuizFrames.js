export function createTypedVisualQuizFrames({
  concept,
  sourceId,
  productId,
  sourceLabel,
  profile,
  lesson,
  lessonVariant,
}) {
  const entityLabelById = new Map(
    (Array.isArray(profile?.entities) ? profile.entities : []).map((entity) => [
      String(entity?.id || ''),
      String(entity?.label || entity?.id || 'visible entity').replace(/[-_]+/g, ' '),
    ]),
  );
  const entityLabel = (entity) => String(entity?.label || entity?.id || 'visible entity').replace(/[-_]+/g, ' ');
  const relationLabel = (relation) =>
    String(relation?.label || relation?.type || relation?.id || 'visible relation').replace(/[-_]+/g, ' ');
  const primaryEntityLabel = entityLabel(profile.entities[0]);
  const primaryRelationLabel = relationLabel(profile.relations[0]);
  const evidenceCase = `${sourceId}, the ${sourceLabel}, displays ${profile.entities
    .slice(0, 4)
    .map((entity) => entityLabel(entity))
    .join(', ')}. Its declared relations are ${profile.relations
    .slice(0, 3)
    .map(
      (relation) =>
        `${relationLabel(relation)} (${entityLabelById.get(relation.from) || relation.from} → ${
          entityLabelById.get(relation.to) || relation.to
        })`,
    )
    .join(', ')}.`;
  const transferObservation = lessonVariant(lesson, [
    `${profile.relations[0].visibleStatement} The relation is inspectable in ${sourceId}; use it in ${productId} only within the declared boundary.`,
    `${sourceId} makes this relation visible: ${profile.relations[0].visibleStatement} Carry the observation to ${productId} without generalizing beyond the encoded case.`,
    `The inspectable path in ${sourceId} shows that ${profile.relations[0].visibleStatement} Apply that bounded observation when reviewing ${productId}.`,
    `${profile.relations[0].visibleStatement} Verify the path in ${sourceId}, then test whether ${productId} preserves the same entity-relation evidence.`,
    `For ${productId}, the transferable evidence is limited to what ${sourceId} visibly encodes: ${profile.relations[0].visibleStatement}`,
  ]);
  const correctFrames = [
    profile.expectedObservation,
    `A defensible observation names ${primaryEntityLabel} and the ${primaryRelationLabel} relation before interpreting the pattern.`,
    transferObservation,
    lessonVariant(lesson, [
      `Keep the conclusion inside the entity-relation boundary encoded by ${sourceId}: ${profile.expectedObservation}`,
      `${sourceId} warrants only this bounded reading of its typed structure: ${profile.expectedObservation}`,
      `Do not extend the ${sourceId} interpretation beyond the following inspectable path: ${profile.expectedObservation}`,
      `Under the view represented in ${sourceId}, the supportable conclusion is: ${profile.expectedObservation}`,
      `The ethical claim boundary for ${sourceId} stops with what its entities and relations show: ${profile.expectedObservation}`,
    ]),
    `Visible relation: ${profile.relations[0].visibleStatement} Treat that path, not the lesson title, as the evidence for ${productId}.`,
    `Evidence path from ${sourceId}: ${primaryEntityLabel} participates in ${primaryRelationLabel}; the warranted reading is ${profile.expectedObservation}`,
    `A bounded reading checks ${primaryEntityLabel} against the ${primaryRelationLabel} relation before concluding: ${profile.expectedObservation}`,
    `Revision basis for ${productId}: retain the inspectable ${primaryRelationLabel} relation from ${sourceId} and qualify the claim as ${profile.expectedObservation}`,
  ];
  const universalRuleDistractor = lessonVariant(lesson, [
    `${concept} becomes a universal rule even though ${sourceId} supplies no transfer evidence.`,
    `Treat the single ${sourceId} pattern as proof that ${concept} works identically in every new case.`,
    `Extend the ${concept} conclusion beyond ${sourceId} without checking another view, condition, or specimen.`,
    `Assume an observation from ${sourceId} settles all ${concept} interpretations, including excluded contexts.`,
    `Publish a broad ${concept} claim from ${sourceId} while ignoring the record's stated evidence boundary.`,
  ]);
  const distractorSets = [
    [
      universalRuleDistractor,
      `Infer the ${concept} result from the lesson title and disregard ${sourceId}'s typed relations.`,
      `Use an entity absent from ${sourceId} as the decisive ${concept} evidence.`,
    ],
    [
      `Generalize the ${profile.specimenKind} pattern to every context without collecting another specimen.`,
      `Replace the declared ${primaryRelationLabel} relation with an unstated causal mechanism.`,
      lessonVariant(lesson, [
        `Choose the most prominent label as proof without tracing an entity-to-relation link in ${sourceId}.`,
        `Treat visual prominence in ${sourceId} as sufficient even when no declared relation connects the entities.`,
        `Select an entity name from ${sourceId} but never show how its relation warrants the conclusion.`,
        `Rely on the most noticeable mark while ignoring the view, condition, and relation encoded in ${sourceId}.`,
        `Turn a salient label into an ethical or contextual claim that ${sourceId}'s entity graph does not establish.`,
      ]),
    ],
    [
      `Carry ${concept} into ${productId} while omitting the evidence boundary and typed identifiers.`,
      `Claim that ${primaryEntityLabel} establishes an unrelated property not encoded in the specimen.`,
      `Treat the rights disclosure as if it were observational support for the ${concept} conclusion.`,
    ],
    [
      `Reject the visible ${primaryRelationLabel} relation because no external photograph is present.`,
      `Assume ${productId} is correct before comparing it with the expected observation in ${sourceId}.`,
      `Describe ${concept} in general terms but never name an inspectable entity or declared relation.`,
    ],
    [
      `Read ${concept} from the ${sourceId} filename without inspecting any entity or relation.`,
      `Substitute a personal preference for the ${primaryRelationLabel} evidence encoded in ${sourceId}.`,
      `Treat the planned ${productId} as proof that its own ${concept} decision is already warranted.`,
    ],
    [
      `Count labels in ${sourceId} but never test how ${primaryEntityLabel} participates in the declared relation.`,
      `Choose the broadest ${concept} interpretation even though the specimen records only one bounded view.`,
      `Ignore the expected observation and infer ${concept} from visual familiarity alone.`,
    ],
    [
      `Copy the ${primaryRelationLabel} label without explaining what visible change or comparison it represents.`,
      `Use ${productId}'s intended outcome to overwrite contradictory evidence in ${sourceId}.`,
      `Claim that a missing condition has been observed because the ${concept} topic appears in the lesson title.`,
    ],
    [
      `Report ${primaryEntityLabel} as an isolated fact and omit the relation that makes it evidential.`,
      `Transfer the ${sourceId} conclusion to every ${concept} case without naming a boundary or additional test.`,
      `Replace the inspectable specimen with a generic definition that cannot support the ${productId} decision.`,
    ],
  ];
  const revisionPrompt = lessonVariant(lesson, [
    `A peer interprets the ${concept} specimen without naming evidence. Revise the claim from ${sourceId} so it identifies ${primaryEntityLabel}, applies the ${primaryRelationLabel} relation, and marks one boundary.`,
    `Repair an unsupported ${concept} reading of ${sourceId}: locate ${primaryEntityLabel}, trace the ${primaryRelationLabel} relation, and reject one conclusion the specimen cannot warrant.`,
    `Turn a vague ${concept} interpretation into an auditable claim. Use ${sourceId} to name ${primaryEntityLabel}, explain the ${primaryRelationLabel} link, and qualify the transfer to ${productId}.`,
    `Challenge a peer's unbounded reading of ${sourceId}. Anchor the revision in ${primaryEntityLabel} and the ${primaryRelationLabel} relation, then identify an excluded view or condition.`,
    `Rewrite a claim that overreaches the ${concept} specimen: connect ${primaryEntityLabel} through the ${primaryRelationLabel} relation and state where ${sourceId} stops supporting ${productId}.`,
  ]);
  return {
    correctFrames,
    distractorSets,
    promptFrames: [
      `Evidence case: ${evidenceCase} Which conclusion about ${concept} is supported before interpretation?`,
      lessonVariant(lesson, [
        `Inspect ${sourceId}'s typed entities and declared relations. Which response correctly connects a ${concept} entity to its declared relation?`,
        `Audit the entity-relation path in ${sourceId}. Which conclusion about ${concept} follows from the visible connection?`,
        `Trace one named entity through ${sourceId}'s declared relation. Which ${concept} interpretation stays inside that evidence boundary?`,
        `Compare the entities and relations encoded in ${sourceId}. Which response uses the ${concept} evidence without adding an unsupported link?`,
        `Read ${sourceId} as an evidence model. Which ${concept} claim is warranted by its named entity and declared relation?`,
      ]),
      `Using ${sourceId}, name one visible ${concept} entity and one declared relation, then explain the bounded ${concept} observation they support.`,
      revisionPrompt,
      `Compare ${sourceId} with ${productId} for ${concept}. Which claim transfers without inventing evidence?`,
      lessonVariant(lesson, [
        `Evaluate ${sourceId}. Defend a decision for ${productId}, then name the ${concept} conclusion this native specimen cannot establish.`,
        `Judge whether ${sourceId} warrants the planned ${productId} move. Cite the relation and identify the transfer condition still untested.`,
        `Use ${sourceId} to justify or revise ${productId}; explain which ${concept} claim remains outside the encoded evidence.`,
        `Compare the ${sourceId} view with the intended ${productId} decision. Defend the choice and qualify it for an excluded view or condition.`,
        `Audit ${sourceId} before publishing ${productId}. State the warranted ${concept} decision and the broader claim the specimen does not clear.`,
      ]),
      `Select the ${concept} conclusion that stays within ${sourceId}'s inspectable evidence boundary.`,
      `Revise ${productId}'s ${concept} evidence using ${sourceId}. Preserve the ${primaryRelationLabel} relationship, reject one overclaim, and identify the next evidence needed.`,
    ],
    responseInstructionFrames: [
      `Cite a ${concept} entity in ${sourceId}, trace its ${primaryRelationLabel} relation, and keep the ${productId} use inside that boundary.`,
      `Locate the relevant ${sourceId} entity, explain the ${primaryRelationLabel} path, and decide whether its evidence transfers to ${productId}.`,
      `Connect a named ${concept} entity through ${primaryRelationLabel}; identify what new evidence ${productId} would need for a broader claim.`,
      `Ground the answer in a visible ${sourceId} entity-relation path and qualify the inference carried into ${productId}.`,
      `Preserve the exact evidence from ${sourceId} when revising ${productId}, including the point where the ${concept} observation stops warranting a conclusion.`,
      `Test ${productId} against the ${primaryRelationLabel} relation; defend the supported decision and name the condition that remains unobserved.`,
      `Bound the conclusion with ${sourceId}'s typed structure, then explain the next observation needed before changing ${productId}.`,
      `Revise ${productId} by retaining ${primaryEntityLabel}, the ${primaryRelationLabel} relation, and the evidence limit attached to their use.`,
    ],
    scoringGuidance: lessonVariant(lesson, [
      `Award credit for a named ${concept} entity, the ${primaryRelationLabel} relation, an evidence-to-claim explanation from ${sourceId}, and a stated boundary. A lesson-title guess earns no credit.`,
      `Check whether the response locates the ${concept} entity, traces ${primaryRelationLabel} in ${sourceId}, and qualifies the transfer. Do not score topic recall as visual evidence.`,
      `Require an inspectable ${sourceId} entity-relation path, the ${concept} conclusion it warrants, and one unresolved condition. Unsupported general description is insufficient.`,
      `Score the visible ${concept} feature, its ${primaryRelationLabel} connection, and the challenge to an alternative reading. Reject an answer that relies only on the lesson label.`,
      `Credit the exact ${sourceId} entity, the declared ${primaryRelationLabel} path, and a bounded implication for ${productId}. Broad claims without specimen evidence receive no credit.`,
    ]),
  };
}

export function createFunctionalVisualAssignmentInstructions({
  blueprint,
  lesson,
  assessment,
  lessonRequiresFunctionalVisual,
  stripTerminalPunctuation,
  safeLessonArtifact,
  stripLessonPrefix,
  safeLessonPrimaryConcept,
  asArray,
  lessonVariant,
}) {
  const contract = blueprint?.briefQualityContract;
  if (!lessonRequiresFunctionalVisual(contract, lesson?.lessonNumber)) return [];
  const artifact = stripTerminalPunctuation(assessment?.artifact || assessment?.title || safeLessonArtifact(lesson));
  const lessonTitle = stripLessonPrefix(lesson?.title || `Lesson ${lesson?.lessonNumber || 1}`);
  const concept = safeLessonPrimaryConcept(lesson);
  const attributiveConcept = concept.replace(/^(?:the|an?)\s+/i, '').trim() || concept;
  const productActions = asArray(contract?.functionalVisual?.productActions);
  const productMove =
    productActions.includes('annotate') && productActions.includes('compare')
      ? `annotate one ${attributiveConcept} evidence-bearing feature or compare two visible features associated with ${concept}`
      : productActions.includes('compare')
        ? `compare two visible features associated with ${concept}`
        : `annotate one ${attributiveConcept} evidence-bearing feature`;
  const scoredDecisionInstruction = lessonVariant(lesson, [
    `Connect the ${concept} analysis to the scored choice in ${artifact}: locate the exact feature, explain the claim it warrants, and mark the evidence boundary.`,
    `Make the ${artifact} decision auditable by identifying the relevant ${concept} feature, separating observation from inference, and ruling out one overclaim.`,
    `Use the visible ${concept} relation to justify the decision in ${artifact}; show the evidence-to-claim step and identify what remains uncertain.`,
    `Defend one ${artifact} choice with a named ${concept} feature, then test the interpretation against an alternative view or condition.`,
    `For the scored ${artifact} decision, trace the ${concept} evidence to the conclusion and state where that evidence stops supporting further claims.`,
  ]);
  const strictRights = [
    `If ${artifact} uses an external ${concept} visual, include inspectable open-license or public-domain evidence plus creator, title, source URL, license, and required attribution. Mark a course-created diagram as original and do not imply external clearance.`,
    `For every external ${concept} image in ${artifact}, preserve creator, title, source URL, license, required attribution, and inspectable rights evidence. Identify an original course-created diagram separately from cleared outside material.`,
    `Document the rights path for ${artifact}: external ${concept} visuals need inspectable open-license or public-domain status and complete attribution; native CourseMapper diagrams must be labeled original without claiming third-party clearance.`,
    `Before submitting ${artifact}, verify each outside ${concept} visual's creator, title, source URL, license, attribution, and inspectable reuse status. Describe a course-created diagram only as an original asset.`,
    `Keep ${artifact} publication-safe by attaching inspectable rights and full attribution to external ${concept} visuals. Distinguish those from an original course-created diagram, whose label does not clear external rights.`,
  ];
  const basicRights = [
    `Credit every external ${concept} visual in ${artifact} with creator, title, source URL, and rights status; label an original course-created diagram separately.`,
    `Preserve creator, title, source URL, and rights status for outside ${concept} visuals, while identifying a course-created diagram in ${artifact} as original.`,
    `Separate external ${concept} attribution from the original-native label in ${artifact}; record creator, title, source URL, and rights status for each outside visual.`,
    `Audit ${artifact} so each external ${concept} visual carries creator, title, URL, and rights status and each native CourseMapper diagram is identified as original.`,
    `In ${artifact}, attach creator, title, source URL, and rights status to external ${concept} material; use the original-native label only for CourseMapper diagrams.`,
  ];
  const rightsInstruction = lessonVariant(
    lesson,
    contract?.rightsBoundary?.externalAssetAllowedOnlyWithInspectableRights ? strictRights : basicRights,
  );
  return [
    `For ${lessonTitle}, include a concrete visual evidence panel in ${artifact}. Use ${concept} to ${productMove}, then distinguish observation from interpretation.`,
    scoredDecisionInstruction,
    rightsInstruction,
  ];
}

export function createFunctionalVisualStudyWorkedExample({
  blueprint,
  lesson,
  studyArtifact,
  lessonRequiresFunctionalVisual,
  safeLessonPrimaryConcept,
  safeLessonConcepts,
  asArray,
  typedEvidenceSpecimenProfile,
  lessonVariant,
}) {
  if (!lessonRequiresFunctionalVisual(blueprint?.briefQualityContract, lesson?.lessonNumber)) return null;
  const concept = safeLessonPrimaryConcept(lesson);
  const secondary = safeLessonConcepts(lesson, { limit: 3 })[1] || 'supporting evidence';
  const productActions = asArray(blueprint?.briefQualityContract?.functionalVisual?.productActions);
  const profile = typedEvidenceSpecimenProfile(concept, secondary);
  const suffix = String(Number(lesson?.lessonNumber)).padStart(2, '0');
  const sourceId = `CM-SRC-L${suffix}`;
  const productId = `CM-PROD-L${suffix}`;
  const sourceDisplay = `Lesson ${Number(lesson?.lessonNumber)} evidence specimen`;
  const productDisplay = `Lesson ${Number(lesson?.lessonNumber)} application artifact`;
  const primaryEntity = profile.entities[0];
  const primaryRelation = profile.relations[0];
  return {
    protocol: 'coursemapper-functional-visual-study-practice-v1',
    problem: lessonVariant(lesson, [
      `Inspect the ${sourceDisplay}, a course-created ${concept} specimen. First inventory its typed entities; then decide which declared relation warrants an observation for ${studyArtifact}.`,
      `Begin with the ${sourceDisplay}. Trace one entity-to-entity relation in the native ${concept} specimen and determine the bounded claim that can inform ${studyArtifact}.`,
      `Use the encoded objects in the ${sourceDisplay} to test a ${concept} interpretation. Show which relation supports it before transferring any conclusion to ${studyArtifact}.`,
      `Audit the ${sourceDisplay} as evidence for ${studyArtifact}: separate the visible ${concept} entities from the relationship you infer and identify an unsupported alternative.`,
      `Read the ${sourceDisplay} as a constrained ${concept} evidence record. Establish what the entity-relation structure proves and where the reasoning must stop before revising ${studyArtifact}.`,
    ]),
    steps: lessonVariant(lesson, [
      [
        `Locate ${primaryEntity.id} (${primaryEntity.label}) and describe only what is visibly encoded.`,
        `Trace ${primaryRelation.id}: ${primaryRelation.from} ${primaryRelation.type} ${primaryRelation.to}.`,
        `Separate that observation from the interpretation proposed for the ${productDisplay}.`,
      ],
      [
        `Inventory ${primaryEntity.id} and the other named objects in the ${sourceDisplay}.`,
        `Follow ${primaryRelation.id} from ${primaryRelation.from} to ${primaryRelation.to}.`,
        `Test whether the relation warrants the intended transfer to the ${productDisplay}.`,
      ],
      [
        `Mark ${primaryEntity.label} as the observation anchor in the ${sourceDisplay}.`,
        `Explain how ${primaryRelation.type} connects the two encoded entities.`,
        `Identify one alternative claim that the specimen does not support.`,
      ],
      [
        `Record the view or condition under which ${primaryEntity.id} is visible.`,
        `Compare the ${primaryRelation.type} path with a plausible changed view.`,
        `Qualify the ${productDisplay} decision wherever the relation could change.`,
      ],
      [
        `Audit the visible identity of ${primaryEntity.label} and its source binding.`,
        `Connect ${primaryRelation.from} to ${primaryRelation.to} only through declared ${primaryRelation.type}.`,
        `State the boundary that must travel with any conclusion used in the ${productDisplay}.`,
      ],
    ]),
    result: profile.expectedObservation,
    interpretation: lessonVariant(lesson, [
      `For this ${profile.specimenKind}, ${primaryEntity.label} anchors the ${primaryRelation.type} relation. That visible path limits the ${concept} claim used in ${studyArtifact}.`,
      `The ${concept} interpretation begins at ${primaryEntity.label} and follows ${primaryRelation.type}; ${studyArtifact} may use only the portion the specimen actually encodes.`,
      `Here, ${primaryEntity.label} participates in the ${primaryRelation.type} relation. The resulting ${concept} conclusion can guide ${studyArtifact} but cannot substitute for new evidence.`,
      `Changing the view could change how ${primaryEntity.label} and ${primaryRelation.type} appear, so the ${concept} decision in ${studyArtifact} must retain that condition.`,
      `The auditable ${concept} warrant is the path from ${primaryEntity.label} through ${primaryRelation.type}; carry its boundary, not just its conclusion, into ${studyArtifact}.`,
    ]),
    boundary: `The ${sourceDisplay} proves only the encoded ${primaryRelation.type} link from ${primaryRelation.from} to ${primaryRelation.to}; a new context needs its own ${concept} specimen.`,
    transferTask: lessonVariant(lesson, [
      `Create a second ${concept} specimen, identify its decisive entity-relation path, and compare that path with the bounded observation from the ${sourceDisplay}.`,
      `Inspect a new ${concept} case and test whether its visible relation matches the ${sourceDisplay}; explain what would have to remain true before revising the ${productDisplay}.`,
      `Build an alternative ${concept} specimen, then use its typed structure to confirm, narrow, or reject the inference intended for the ${productDisplay}.`,
      `Change one view or condition in a second ${concept} specimen. Trace how that change affects the relation and the decision attached to the ${productDisplay}.`,
      `Audit another ${concept} example for entity, relation, and context. State which part of the ${sourceDisplay}'s reasoning transfers to the ${productDisplay} and which part does not.`,
    ]),
    verification: {
      checked: true,
      sourceId,
      productId,
      entityIds: profile.entities.map((entity) => entity.id),
      relationIds: profile.relations.map((relation) => relation.id),
      productActions,
    },
  };
}
