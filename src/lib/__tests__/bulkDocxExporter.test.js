import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter';
import { extractPackage } from '../quality/deepQualityGrader';
import { createMemoryFileProvider } from '../quality/fileProviders';

async function docxDocumentXml(blob) {
  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  return await zip.file('word/document.xml').async('string');
}

async function docxPartXml(blob, partPath) {
  const buffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  return await zip.file(partPath).async('string');
}

async function extractedDocxParagraphs(blob, filePath) {
  const pkg = await extractPackage(createMemoryFileProvider({ [filePath]: blob }));
  const file = pkg.files.find((entry) => entry.path === filePath);
  return file?.paragraphs || [];
}

describe('buildDeliverableDocxBlob', () => {
  it('keeps the resolved total-page field inside the portrait footer gutter', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      { syllabus: { semester: 'Fall 2026', courseDescription: 'A concise course description.' } },
      'A Deliberately Long Course Title for Footer Geometry Verification',
    );

    const footer = await docxPartXml(blob, 'word/footer1.xml');
    expect(footer).toContain('w:pos="9960"');
    expect(footer).toContain('NUMPAGES');
    expect(footer).not.toContain('w:pos="9026"');

    const documentXml = await docxDocumentXml(blob);
    expect(documentXml).toContain(
      '<w:pgMar w:top="540" w:right="720" w:bottom="540" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>',
    );
  });

  it('ends an assignment brief on lesson-specific content without repeated package policy', async () => {
    const blob = await buildDeliverableDocxBlob(
      'assignments',
      {
        assignments: [
          {
            title: 'Maritime Crisis decision record (20%)',
            overview: 'Use the supplied evidence to make and revise one bounded decision.',
            academicIntegrityStatement: 'Submit original work; credit outside sources and approved tools.',
          },
        ],
      },
      'International Crisis Bargaining',
    );

    const xml = await docxDocumentXml(blob);
    const bodyBeforeSection = xml.slice(0, xml.lastIndexOf('<w:sectPr'));
    const lastParagraph = bodyBeforeSection.slice(bodyBeforeSection.lastIndexOf('<w:p>'));

    expect(lastParagraph).toContain('Overview');
    expect(lastParagraph).not.toMatch(/<w:pPr>\s*<w:spacing[^>]*\/>\s*<\/w:pPr>\s*<\/w:p>\s*$/);
    expect(xml).toContain('w:line="190"');
    expect(xml).not.toContain('Academic Integrity');
  });

  it('uses a compact readable rhythm for dense instructor lesson plans', async () => {
    const blob = await buildDeliverableDocxBlob(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'Lesson 2: Evidence Structure',
            objectives: ['Compare two visible structures and justify one revision.'],
            outline: [{ time: '20 min', activity: 'Compare', description: 'Annotate the evidence before revising.' }],
            homework: {
              title: 'Evidence revision',
              estimatedTime: '45 minutes',
              description: 'Revise one claim and mark the evidence that changed it.',
              connectionToNext: 'Bring the revision to the next comparison.',
            },
          },
        ],
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('w:line="204"');
    expect(xml).toContain('w:sz w:val="19"');
    expect(xml).toContain('<w:tcMar><w:top w:type="dxa" w:w="50"');
  });

  it('uses a compact closing-guidance rhythm in discussion handouts', async () => {
    const blob = await buildDeliverableDocxBlob(
      'discussions',
      {
        discussions: [
          {
            lessonTitle: 'Lesson 9: Evidence Review',
            prompt: 'Compare two interpretations and identify the deciding evidence.',
            equityConsiderations:
              'Offer a choice of annotated note, short spoken claim, or partner summary so students can make their evidence visible.',
            guidelines:
              'Name the evidence, distinguish observation from inference, and respond to one alternative interpretation.',
            followUp: 'Revise one claim after the discussion and record which evidence changed the conclusion.',
          },
        ],
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    const closingParagraphEnd = xml.indexOf('which evidence changed the conclusion');
    const closingParagraph = xml.slice(
      xml.lastIndexOf('<w:p>', closingParagraphEnd),
      xml.indexOf('</w:p>', closingParagraphEnd),
    );
    expect(closingParagraph).toContain('w:line="184"');
    expect(closingParagraph).toContain('w:sz w:val="18"');
    expect(closingParagraph).not.toContain('•');
    expect(closingParagraph).toContain(' — ');
  });

  it('ends a study guide on content and gives its term table a semantic header row', async () => {
    const blob = await buildDeliverableDocxBlob(
      'studyGuides',
      {
        studyGuides: [
          {
            lessonTitle: 'Lesson 1: Evidence',
            summary: 'Distinguish a claim from the evidence used to support it.',
            keyTerms: [{ term: 'Corroboration', definition: 'Checking a claim against independent evidence.' }],
            conceptConnections: ['Use corroboration to compare two source claims before drawing a conclusion.'],
            connectionToNext: "Use corroboration in the next lesson's source comparison.",
          },
        ],
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    const bodyBeforeSection = xml.slice(0, xml.lastIndexOf('<w:sectPr'));
    const lastParagraph = bodyBeforeSection.slice(bodyBeforeSection.lastIndexOf('<w:p>'));

    expect(xml).toContain('<w:tblHeader/>');
    expect(xml).toContain('Term');
    expect(xml).toContain('Definition');
    expect(xml).toContain('<w:keepLines/>');
    expect(xml).toContain('w:hanging="180"');
    expect(xml).toContain('w:after="160"');
    expect(lastParagraph).toContain('Connection to Next Lesson');
    expect(lastParagraph).not.toMatch(/<w:pPr>\s*<w:spacing[^>]*\/>\s*<\/w:pPr>\s*<\/w:p>\s*$/);
  });

  it('compacts exam preparation when its key topics already appear in the term table', async () => {
    const blob = await buildDeliverableDocxBlob(
      'studyGuides',
      {
        studyGuides: [
          {
            lessonTitle: 'Lesson 1: Evidence',
            keyTerms: [{ term: 'Corroboration', definition: 'Checking a claim against independent evidence.' }],
            commonMisconceptions: [
              {
                misconception: 'Repeated claims are independent evidence.',
                correction: 'Trace each claim to its source.',
              },
            ],
            examPrep: {
              keyTopicsToKnow: ['Corroboration'],
              commonErrors: 'Do not confuse repetition with independent support.',
              reviewStrategy: 'Compare two records and mark the independent detail.',
            },
          },
        ],
      },
      'Evidence Methods',
    );
    const xml = await docxDocumentXml(blob);
    expect(xml.match(/Exam Preparation/g)?.length || 0).toBe(1);
    expect(xml).not.toContain('Common errors: Do not confuse repetition with independent support.');
    expect(xml).toContain(
      'Review strategy: For Lesson 1: Evidence, compare the two source claims; record what they support, what remains unproven, and the revision required.',
    );
    expect(xml).not.toContain('Key Topics');
    expect(xml).toContain('w:line="196"');
    expect(xml).toContain('w:sz w:val="19"');
    expect(xml).toContain('<w:keepLines/>');
    expect(xml).toContain('w:before="60"');
  });

  it('keeps each study-guide review question with its hint during pagination', async () => {
    const blob = await buildDeliverableDocxBlob(
      'studyGuides',
      {
        studyGuides: [
          {
            lessonTitle: 'Lesson 4: Correlation',
            reviewQuestions: [
              {
                question: 'Which evidence would change the correlation claim?',
                bloomsLevel: 'Analyze',
                hint: 'Compare the observed pattern with the stated boundary.',
              },
            ],
          },
        ],
      },
      'Statistics in Practice',
    );

    const xml = await docxDocumentXml(blob);
    const questionParagraph = xml.match(
      /<w:p><w:pPr>[\s\S]*?<\/w:pPr>[\s\S]*?Which evidence would change the correlation claim\?[\s\S]*?<\/w:p>/,
    )?.[0];
    const hintParagraph = xml.match(
      /<w:p><w:pPr>[\s\S]*?<\/w:pPr>[\s\S]*?Hint: Compare the observed pattern with the stated boundary\.[\s\S]*?<\/w:p>/,
    )?.[0];

    expect(questionParagraph).toContain('<w:keepNext/>');
    expect(questionParagraph).toContain('<w:keepLines/>');
    expect(hintParagraph).toContain('<w:keepLines/>');
  });

  it('consolidates simple terminal exam-preparation fields without dropping unique topics', async () => {
    const blob = await buildDeliverableDocxBlob(
      'studyGuides',
      {
        studyGuides: [
          {
            lessonTitle: 'Lesson 8: Evidence Synthesis',
            examPrep: {
              keyTopicsToKnow: ['Source triangulation', 'Boundary statements'],
              commonErrors: ['Treating repetition as corroboration'],
              reviewStrategy: 'Compare the sources before revising the claim.',
              timeManagement: 'Reserve five minutes for the evidence boundary.',
            },
          },
        ],
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml.match(/Exam Preparation/g)?.length || 0).toBe(1);
    expect(xml).toContain('Key topics: Source triangulation; Boundary statements.');
    expect(xml).toContain('Common errors: Treating repetition as corroboration');
    expect(xml).toContain('Review strategy: Compare the sources before revising the claim.');
    expect(xml).toContain('Time management: Reserve five minutes for the evidence boundary.');
    expect(xml).not.toContain('>Key Topics<');
  });

  it('uses semantic table headers without forcing sparse syllabus page breaks', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          semester: 'Fall 2026',
          learningOutcomes: ['Evaluate source evidence.'],
          outcomeAlignmentMatrix: [
            {
              outcome: 'Evaluate source evidence.',
              bloomsLevel: 'Evaluate',
              practicedIn: ['Lesson 1: Evidence'],
              assessedBy: ['The Week 1 assignment.', 'Final source memo.'],
            },
          ],
          weeklySchedule: [
            { week: 'Week 1', topic: 'Evidence', readings: 'Course packet', assignments: 'Source note' },
          ],
          attendancePolicy: 'Participate in the weekly evidence workshop.',
          methodsStatement: {
            title: 'Evidence-Based Course Design',
            methods: [{ label: 'Retrieval practice', claim: 'Students revisit core distinctions.', references: [] }],
          },
        },
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml.match(/<w:tblHeader\/>/g)?.length || 0).toBeGreaterThanOrEqual(2);
    expect(xml).toContain('Course detail');
    expect(xml).not.toContain('>Field<');
    expect(xml).not.toContain('>Details<');
    expect(xml).toContain('<w:cantSplit/>');
    expect(xml).toContain('The Week 1 assignment; Final source memo');
    expect(xml).not.toContain('assignment.;');
    expect(xml).not.toContain('<w:br w:type="page"/>');
    expect(xml).toContain('w:before="300" w:after="100"');
    expect(xml).toContain('w:line="204"');
  });

  it('uses readable source blocks for a nine-source appendix', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          semester: 'Fall 2026',
          sourcesAndLicenses: {
            title: 'Sources & Licenses',
            groups: [
              {
                label: 'Open course sources',
                entries: Array.from({ length: 9 }, (_, index) => ({
                  citation: `Source ${index + 1}: A deliberately long source citation retained verbatim for auditability.`,
                  url: `https://example.edu/source-${index + 1}`,
                  license: 'CC BY 4.0',
                })),
              },
            ],
          },
        },
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Source 1: A deliberately long source citation retained verbatim for auditability.');
    expect(xml).toContain('Source 9: A deliberately long source citation retained verbatim for auditability.');
    expect(xml).not.toContain('<w:pageBreakBefore/>');
    expect(xml).toContain('w:line="204"');
    expect(xml).toContain('w:sz w:val="22"');
    expect(xml).toContain('License and attribution: CC BY 4.0.');
  });

  it('tightens twelve-source appendices before they create a sparse spill page', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          semester: 'Fall 2026',
          sourcesAndLicenses: {
            title: 'Sources & Licenses',
            groups: [
              {
                label: 'Open course sources',
                entries: Array.from({ length: 12 }, (_, index) => ({
                  citation: `Source ${index + 1}: A deliberately long source citation retained verbatim for auditability.`,
                  url: `https://example.edu/source-${index + 1}`,
                  license: 'CC BY 4.0',
                })),
              },
            ],
          },
        },
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Source 12: A deliberately long source citation retained verbatim for auditability.');
    expect(xml.match(/<w:numPr>/g)?.length).toBe(12);
    expect(xml).toContain('w:line="196"');
    expect(xml).toContain('w:sz w:val="18"');
    expect(xml).toContain('<w:pageBreakBefore/>');
  });

  it('lets a seven-source appendix fill the preceding methods page instead of stranding citations', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          semester: 'Fall 2026',
          sourcesAndLicenses: {
            title: 'Sources & Licenses',
            groups: [
              {
                label: 'Open course sources',
                entries: Array.from({ length: 7 }, (_, index) => ({
                  citation: `Source ${index + 1}: A complete source citation retained verbatim.`,
                  url: `https://example.edu/source-${index + 1}`,
                  license: 'CC BY 4.0',
                })),
              },
            ],
          },
        },
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Source 7: A complete source citation retained verbatim.');
    expect(xml).not.toContain('<w:pageBreakBefore/>');
  });

  it('keeps the penultimate review hint with the final question unit', async () => {
    const blob = await buildDeliverableDocxBlob(
      'studyGuides',
      {
        studyGuides: [
          {
            lessonTitle: 'Lesson 1: Evidence Analysis',
            reviewQuestions: [
              { question: 'First question', hint: 'First hint' },
              { question: 'Second question', hint: 'Second hint' },
              { question: 'Final question', hint: 'Final hint' },
            ],
          },
        ],
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    const secondHintEnd = xml.indexOf('Second hint');
    const secondHintParagraph = xml.slice(
      xml.lastIndexOf('<w:p>', secondHintEnd),
      xml.indexOf('</w:p>', secondHintEnd),
    );
    expect(secondHintParagraph).toContain('<w:keepNext/>');
    expect(secondHintParagraph).toContain('<w:keepLines/>');
    const finalHintEnd = xml.indexOf('Final hint');
    const finalHintParagraph = xml.slice(xml.lastIndexOf('<w:p>', finalHintEnd), xml.indexOf('</w:p>', finalHintEnd));
    expect(finalHintParagraph).not.toContain('<w:keepNext/>');
  });

  it('lets long splittable bibliographies absorb remaining methods-page space', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          semester: 'Fall 2026',
          methodsStatement: {
            title: 'Evidence-Based Course Design',
            methods: [
              {
                label: 'Retrieval practice',
                claim: 'Students revisit core distinctions.',
                references: ['A complete peer-reviewed reference retained verbatim.'],
              },
            ],
          },
          sourcesAndLicenses: {
            title: 'Sources & Licenses',
            groups: [
              {
                label: 'Open course sources',
                entries: Array.from({ length: 20 }, (_, index) => ({
                  citation: `Source ${index + 1}: A complete source citation retained verbatim.`,
                  url: `https://example.edu/source-${index + 1}`,
                  license: 'CC BY 4.0',
                })),
              },
            ],
          },
        },
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Source 20: A complete source citation retained verbatim.');
    expect(xml).not.toContain('<w:pageBreakBefore/>');
    expect(xml).toContain('w:line="174"');
  });

  it('cohorts repeated source owners when their license is shared at group level', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          semester: 'Fall 2026',
          sourcesAndLicenses: {
            title: 'Sources & Licenses',
            groups: [
              {
                label: 'Open encyclopedia',
                license: 'CC BY-SA 4.0',
                entries: Array.from({ length: 12 }, (_, index) => ({
                  citation: `Article ${index + 1} (open encyclopedia)`,
                  url: `https://example.edu/article-${index + 1}`,
                  attribution: `Wikipedia contributors, “Article ${index + 1}”`,
                })),
              },
            ],
          },
        },
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Shared rights statement for 12 cited entries: CC BY-SA 4.0 · Wikipedia contributors.');
    expect(xml.match(/Wikipedia contributors/g)?.length).toBe(1);
    expect(xml).toContain('Article 12 (open encyclopedia)');
  });

  it('does not render an empty sources and licenses appendix', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          semester: 'Fall 2026',
          sourcesAndLicenses: {
            title: 'Sources & Licenses',
            note: 'Only attributable sources should appear here.',
            groups: [
              {
                label: 'Internal evidence',
                entries: [{ citation: 'Private instructor note without redistribution metadata.' }],
              },
            ],
          },
        },
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).not.toContain('Sources &amp; Licenses');
    expect(xml).not.toContain('Only attributable sources should appear here.');
    expect(xml).not.toContain('Private instructor note without redistribution metadata.');
  });

  it('omits internal compiler metadata from generic custom deliverable DOCX exports', async () => {
    const blob = await buildDeliverableDocxBlob(
      'custom_reflection',
      {
        items: [
          {
            lessonTitle: 'Lesson 1',
            promptTitle: 'Weekly Reflection 1',
            responsePrompt: 'Connect the lesson evidence to your next revision.',
            sourceGrounding: {
              compilerDecision: 'deterministic-compile',
              publishGate: 'ready-with-spot-check',
            },
            nestedEvidence: {
              studentCue: 'Use one concrete course detail.',
              sourceGrounding: 'Internal source-grounding trace.',
            },
            checklist: [
              {
                item: 'Name one revision priority.',
                blueprintGrounding: 'Internal blueprint trace.',
              },
            ],
            qualityReceipt: 'Internal proof packet only.',
          },
        ],
      },
      'Export Cleanliness',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('Weekly Reflection 1');
    expect(xml).toContain('Use one concrete course detail');
    expect(xml).toContain('Name one revision priority');
    expect(xml).not.toContain('Source Grounding');
    expect(xml).not.toContain('deterministic-compile');
    expect(xml).not.toContain('Internal source-grounding trace');
    expect(xml).not.toContain('Internal blueprint trace');
    expect(xml).not.toContain('Internal proof packet');
  });

  it('renders lesson-plan grouping as student-facing class format text', async () => {
    const blob = await buildDeliverableDocxBlob(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'Lesson 4: Usability testing',
            duration: '75 minutes',
            outline: [
              {
                time: '15 minutes',
                activity: 'Draft revision workshop',
                description: 'Students revise a usability testing artifact using task evidence.',
                grouping: 'Independent studio work with brief evidence check-ins',
              },
            ],
          },
        ],
      },
      'User Experience Design Studio',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('Class format: Independent studio work with brief evidence check-ins');
    expect(xml).not.toContain('Grouping: Independent studio work with brief evidence check-ins');
  });

  it('keeps lesson-plan UDL modes in one compact export block', async () => {
    const blob = await buildDeliverableDocxBlob(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'Lesson 4: Maritime Crisis Simulation',
            udlNotes: {
              representation: 'Provide the briefing, roles, evidence, phase updates, clock, and requirements.',
              engagement: 'Offer equivalent roles in speaking, observing, evidence tracking, and documenting.',
              expression: 'Permit accessible production methods while keeping every requirement inspectable.',
            },
          },
        ],
      },
      'International Crisis Bargaining',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('Universal design for learning');
    expect(xml).toContain('Representation: Provide the briefing');
    expect(xml).toContain('Engagement: Offer equivalent roles');
    expect(xml).toContain('Expression: Permit accessible production methods');
    expect(xml).not.toContain('UDL Notes');
  });

  it('renders cited prerequisite definitions without X:X echoes', async () => {
    const definition = 'Electric current is the rate at which charge passes through a surface.';
    const baseline = `Electric current: ${definition}`;
    const echoPattern = /\b([A-Z][\w &'-]{3,50}): \1\b/;
    expect(baseline).toMatch(echoPattern);

    const blob = await buildDeliverableDocxBlob(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'Lesson 2: Electric Fields',
            prerequisiteCheck: {
              note: 'Confirm students have this background before teaching.',
              primers: Array.from({ length: 2 }, () => ({
                term: 'Electric current',
                definition,
                source: 'OpenStax university physics volume 2 §9.1',
              })),
            },
          },
        ],
      },
      'Introductory Physics II – Electricity and Magnetism',
    );

    const paragraphs = await extractedDocxParagraphs(
      blob,
      'Lesson Plans/Lesson 02 - Electric Fields - Lesson Plans.docx',
    );
    const rendered = paragraphs.join('\n');
    expect(rendered).toContain(`${definition} (Source: OpenStax university physics volume 2 §9.1)`);
    expect(rendered.match(/Electric current is the rate at which charge passes/g)).toHaveLength(1);
    expect(rendered).not.toMatch(echoPattern);
  });

  it('uses Word list structure instead of literal bullet glyphs for slide-deck bullets', async () => {
    const blob = await buildDeliverableDocxBlob(
      'slideDecks',
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Export Structure',
            slides: [
              {
                title: 'Structured Bullet Export',
                bullets: ['Review the generated DOCX.', 'Confirm list semantics survive export.'],
              },
            ],
          },
        ],
      },
      'Export Cleanliness',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('<w:numPr>');
    expect(xml).toContain('Review the generated DOCX.');
    expect(xml).not.toContain('• Review the generated DOCX.');
  });

  it('keeps lesson-plan handoff labels compact without fake bullet characters', async () => {
    const blob = await buildDeliverableDocxBlob(
      'lessonPlans',
      {
        lessonPlans: [
          {
            lessonTitle: 'Lesson 1: Clean Export',
            formativeCheck: {
              type: 'Exit ticket',
              prompt: 'Name the deciding evidence.',
            },
            homework: {
              title: 'Evidence note',
              description: 'Revise one claim from the lesson.',
            },
          },
        ],
      },
      'Export Cleanliness',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Formative Assessment');
    expect(xml).toContain('Homework');
    expect(xml).toContain(' — ');
    expect(xml).not.toContain('•');
  });

  it('renders brief constraints separately from the scored rubric with readable weight geometry', async () => {
    const blob = await buildDeliverableDocxBlob(
      'rubrics',
      {
        rubrics: [
          {
            lessonTitle: 'Lesson 5: Kepler’s third law',
            title: 'Kepler analysis rubric',
            totalPoints: 100,
            taskDirections: 'Score the analysis using the learning criteria below.',
            submissionRequirements: ['Scope: use the named case only.', 'Format: submit a two-page memo.'],
            submissionRequirementPolicy:
              'Check these brief requirements before scoring. They are unweighted constraints.',
            criteria: [
              {
                criterion: 'Evidence accuracy',
                weight: 30,
                excellent: 'Uses precise evidence.',
                proficient: 'Uses relevant evidence.',
                developing: 'Uses partial evidence.',
                beginning: 'Uses no inspectable evidence.',
              },
            ],
          },
        ],
      },
      'Introduction to Astronomy',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('SUBMISSION REQUIREMENTS (UNWEIGHTED)');
    expect(xml).toContain('Scope: use the named case only.');
    expect(xml).toContain('Evidence accuracy');
    expect(xml).toContain('30%');
    expect(xml).toContain('<w:gridCol w:w="1880"/>');
    expect(xml).toContain('<w:gridCol w:w="930"/>');
    expect(xml).toMatch(/<w:jc w:val="center"\/>[\s\S]*?Weight/);
  });

  it('renders a handoff note instead of a title-only DOCX for empty assignment slices', async () => {
    const blob = await buildDeliverableDocxBlob(
      'assignments',
      { assignments: [] },
      'Introduction to Computer Science with Python - Lesson 14 - Midterm and project work',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('No standalone assignment brief scheduled');
    expect(xml).toContain('Course Map L14');
    expect(xml).toContain('No submitted assignment brief was generated');
    expect(xml).toContain('add or regenerate that assignment before publishing');
    expect(xml).toContain('For Course Map L14, add a scored brief only when the Course Map promises submitted work.');
  });

  it('renders a complete distributable experiential activity packet instead of an empty assignment handoff', async () => {
    const blob = await buildDeliverableDocxBlob(
      'assignments',
      {
        assignments: [
          {
            title: 'Corridor protocol — activity packet',
            lessonNumber: 9,
            assignmentType: 'Experiential activity packet',
            relatedLessons: ['Lesson 9: Crisis Simulation Mechanics'],
            activityPacket: {
              activityType: 'Maritime negotiation simulation',
              scenario: 'A disputed maritime incident creates an attribution problem before a scheduled convoy.',
              safetyBoundary: 'Use only the supplied fictional record and do not map roles onto a current conflict.',
              evidence: [
                'The monitoring feed stopped before the incident.',
                'The convoy reaches the corridor at noon.',
              ],
              roles: [
                {
                  name: 'Regional organization delegation',
                  goal: 'Restore monitoring and stop escalation.',
                  constraint: 'No agreement without verification.',
                  privateInformation: 'Two members will veto sanctions.',
                },
              ],
              phases: [
                {
                  title: 'Monitoring update',
                  information: 'New imagery weakens the original attribution.',
                  requiredDecision: 'Revise one assumption and one proposed action.',
                },
              ],
              timing: [
                { phase: 'Briefing', minutes: 10 },
                { phase: 'Role work', minutes: 15 },
                { phase: 'Update', minutes: 20 },
                { phase: 'Artifact and debrief', minutes: 15 },
              ],
              totalMinutes: 60,
              activityLogFields: ['Evidence inspected', 'Decision or action'],
              artifact: {
                title: 'Corridor protocol',
                requirements: ['State the route.', 'Name the monitor.', 'Set the revision threshold.'],
              },
              debriefPrompts: ['Which evidence changed the decision?'],
            },
          },
        ],
      },
      'Introduction to International Relations - Lesson 09 - Crisis Simulation Mechanics',
    );

    const xml = await docxDocumentXml(blob);

    expect(xml).toContain('ACTIVITY BRIEFING');
    expect(xml).toContain('SAFETY AND EVIDENCE BOUNDARY');
    expect(xml).toContain('PARTICIPANT OR WORKING ROLES');
    expect(xml).toContain('Regional organization delegation');
    expect(xml).toContain('Two members will veto sanctions');
    expect(xml).toContain('PHASES AND UPDATES');
    expect(xml).toContain('Monitoring update');
    expect(xml).toContain('ACTIVITY LOG');
    expect(xml).toContain('STUDENT ARTIFACT');
    expect(xml).toContain('DEBRIEF');
    expect(xml).not.toContain('No standalone assignment brief scheduled');
  });

  // v0.12.1 P3: quiz exports split into a distributable question paper and a
  // page-broken answer key; option letters never double; internal enum ids
  // never print; tables are percentage-width (the fixed 9360dxa tables
  // overflowed the A4 margins in every file of the v0.12 audit).
  it('renders quiz papers with a separate answer key, clean options, and pct tables', async () => {
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 3: Elasticity',
            questions: [
              {
                type: 'multiple_choice',
                question: 'A 10% price increase cuts quantity demanded by 25%. Demand is:',
                options: ['A. unit elastic', 'B. inelastic', 'C. perfectly inelastic', 'D. elastic'],
                answer: 'D',
                explanation: 'Elasticity is 2.5, which is greater than one.',
                tags: ['quiz', 'elasticity', '我是学生。', 'Wǒ shì xuésheng.'],
              },
              {
                type: 'short_answer',
                question: 'Explain how elasticity shapes a revenue decision.',
                answer: 'Price cuts raise revenue only when demand is elastic, because quantity grows faster.',
                tags: ['quiz', 'revenue'],
              },
            ],
          },
        ],
      },
      'Microeconomics',
    );

    const xml = await docxDocumentXml(blob);
    // No doubled option letters; the option text appears exactly once.
    expect(xml).not.toContain('A. A.');
    expect(xml).toContain('unit elastic');
    // Internal enum ids are humanized.
    expect(xml).not.toContain('multiple_choice');
    expect(xml).not.toContain('short_answer');
    // Answer key exists on its own page, after the questions.
    expect(xml).toContain('Answer Key — Lesson 3: Elasticity');
    expect(xml.indexOf('Answer Key')).toBeGreaterThan(xml.indexOf('Demand is:'));
    // The answer heading owns the break. A standalone page-break paragraph
    // can spill to a new page and then create a second, blank page.
    expect(xml).toContain('<w:pageBreakBefore/>');
    expect(xml).not.toContain('<w:br w:type="page"/>');
    // Long short-answer keys stay sentence case (the callout label would
    // have uppercased them).
    expect(xml).toContain('Price cuts raise revenue only when demand is elastic');
    expect(xml).not.toContain('PRICE CUTS RAISE REVENUE');
    // Tags appear once per quiz, not after every question.
    expect(xml.match(/Tags: /g)?.length || 0).toBe(1);
    // Sentence terminators are valid in taught examples but not immediately
    // before the comma that separates tag labels.
    expect(xml).toContain('我是学生, Wǒ shì xuésheng');
    expect(xml).not.toContain('我是学生。,');
    expect(xml).not.toContain('Wǒ shì xuésheng.,');
    // Tables are pct-width, never the old fixed letter-width grid.
    expect(xml).not.toContain('w:w="9360"');
    expect(xml).not.toContain('<w:spacing w:before="200" w:after="100"/></w:pPr></w:p><w:sectPr>');
  });

  it('starts a bounded quiz answer key on a fresh page', async () => {
    const questions = Array.from({ length: 6 }, (_, index) => ({
      type: 'multiple_choice',
      question: `Question ${index + 1} asks students to inspect a detailed case, identify the relevant evidence boundary, compare two plausible interpretations, and choose the conclusion that the supplied record can actually support.`,
      options: [
        'A. Keep the claim because it sounds familiar.',
        'B. Select the conclusion with an inspectable evidence trail.',
        'C. Ignore the stated boundary and generalize.',
        'D. Replace the evidence with an unsupported assumption.',
      ],
      answer: 'B',
      explanation: 'The supported choice preserves the evidence boundary and makes the decision inspectable.',
    }));
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      { quizzes: [{ lessonTitle: 'Lesson 6: Evidence Audit', questions }] },
      'Evidence Audit',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Answer Key — Lesson 6: Evidence Audit');
    expect(xml).toContain('w:line="190"');
    expect(xml).toContain('w:sz w:val="18"');
    // The bounded paper fits on one page; starting its key on page 2 prevents
    // the final answers from becoming an orphaned low-occupancy tail page.
    expect(xml.match(/<w:pageBreakBefore\/>/g)?.length || 0).toBe(1);
  });

  it('lets an extensive answer key flow without creating a sparse tail page', async () => {
    const questions = Array.from({ length: 8 }, (_, index) => ({
      type: 'short_answer',
      question: `Question ${index + 1} asks for one bounded observation.`,
      answer: `Answer ${index + 1}.`,
      explanation: `Evidence explanation ${index + 1}. ${'Inspect the source boundary and justify the decision. '.repeat(18)}`,
    }));
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      { quizzes: [{ lessonTitle: 'Lesson 8: Extended Evidence Review', questions }] },
      'Evidence Review',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Answer Key — Lesson 8: Extended Evidence Review');
    expect(xml.match(/<w:pageBreakBefore\/>/g)?.length || 0).toBe(0);
  });

  it('omits a sample answer that substantially repeats an already rendered answer', async () => {
    const repeated =
      'The evidence supports a bounded conclusion about the observed pattern, identifies the relevant record, and explains why a broader causal claim would require an additional independent source.';
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 4: Evidence Boundaries',
            questions: [
              {
                question: 'What conclusion does the record support?',
                answer: repeated,
                sampleAnswer: `${repeated} The response should stay within that documented boundary.`,
              },
            ],
          },
        ],
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml).toContain(repeated);
    expect(xml).not.toContain('Sample Answer');
  });

  it('omits an explanation that substantially repeats an open-response answer', async () => {
    const answer =
      'The cited record supports a bounded morphological identification from the displayed form and gloss, while the evidence does not establish how every language marks the same category.';
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 3: Morphological Structures',
            questions: [
              {
                question: 'What conclusion does this form support?',
                answer,
                explanation: `Evidence basis: ${answer}`,
                scoringGuidance: 'Score the evidence, operation, source, and boundary.',
              },
            ],
          },
        ],
      },
      'Language Structure',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml.match(new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length || 0).toBe(1);
    expect(xml).not.toContain('Evidence basis:');
    expect(xml).toContain('Scoring Guidance');
  });

  it('consolidates identical scoring guidance once per answer key', async () => {
    const guidance = 'Score evidence, operation, source, and boundary.';
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 3: Evidence Analysis',
            questions: [
              { question: 'Analyze record one.', answer: 'A bounded answer.', scoringGuidance: guidance },
              { question: 'Analyze record two.', answer: 'A second bounded answer.', scoringGuidance: guidance },
            ],
          },
        ],
      },
      'Evidence Methods',
    );

    const xml = await docxDocumentXml(blob);
    expect(xml.match(/Shared Scoring Guidance/g)?.length || 0).toBe(1);
    expect(xml.match(/Score evidence, operation, source, and boundary\./g)?.length || 0).toBe(1);
    expect(xml).toContain('Use this guidance for Q1, Q2.');
  });

  it('does not repeat a generic explanation when model and scoring guidance already cover an open response', async () => {
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 6: Synthesis',
            questions: [
              {
                question: 'Synthesize the two lesson ideas.',
                explanation: 'Scoring rewards synthesis rather than a list of terms.',
                sampleAnswer: 'A strong response connects both ideas with inspectable evidence and one limitation.',
                rubricHints: 'The response should connect both ideas.',
                scoringGuidance:
                  'Full credit requires two accurate ideas, evidence for each, a relationship, and a limitation.',
              },
            ],
          },
        ],
      },
      'Evidence Methods',
    );
    const xml = await docxDocumentXml(blob);
    expect(xml).not.toContain('Scoring rewards synthesis rather than a list of terms.');
    expect(xml).not.toContain('Rubric Hints');
    expect(xml).toContain('Sample Answer');
    expect(xml).toContain('Scoring Guidance');
  });

  it('keeps FAQ related concepts in the answer paragraph', async () => {
    const blob = await buildDeliverableDocxBlob(
      'courseFaq',
      {
        faqs: [
          {
            lessonTitle: 'Lesson 2: Evidence',
            questions: [
              {
                question: 'What should I compare?',
                answer: 'Compare the two admitted records.',
                relatedConcepts: ['scope', 'warrant'],
              },
            ],
          },
        ],
      },
      'Evidence Methods',
    );
    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('Compare the two admitted records. See also: scope, warrant.');
    expect(xml.match(/See also:/g)?.length || 0).toBe(1);
  });

  it('does not repeat schedule-only week labels as important dates', async () => {
    const blob = await buildDeliverableDocxBlob(
      'syllabus',
      {
        syllabus: {
          weeklySchedule: [
            { week: 'Week 1', topic: 'Evidence', readings: 'Course packet', assignments: 'Source note' },
          ],
          importantDates: [
            { date: 'Week 1', event: 'Source note' },
            { date: 'October 12', event: 'Instructor-confirmed portfolio review' },
          ],
        },
      },
      'Evidence Methods',
    );
    const xml = await docxDocumentXml(blob);
    expect(xml).toContain('October 12');
    expect(xml).toContain('Instructor-confirmed portfolio review');
    expect(xml).not.toContain('<w:t>Source note</w:t></w:r></w:p></w:tc><w:tc');
  });

  it('keeps quiz answer callout labels separated in extracted DOCX text', async () => {
    const filePath = 'Quiz & Exam Bank/Lesson 02 - Personas - Quiz & Exam Bank.docx';
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 2: Personas',
            questions: [
              {
                type: 'short_answer',
                question: 'How should a UX team summarize interviews when creating a persona?',
                answer:
                  'A defensible position: Personas should focus on the most common patterns to stay usable. In a scenario where a team has interviews with six students about managing assignments, deadlines, and notifications, the persona should name repeated scheduling pain points.',
                explanation:
                  'The response should connect persona scope to recurring user evidence rather than isolated preferences.',
              },
            ],
          },
        ],
      },
      'User Experience Design Studio',
    );

    const paragraphs = await extractedDocxParagraphs(blob, filePath);
    const text = paragraphs.join('\n');

    expect(text).toContain('ANSWER A defensible position');
    expect(text).not.toContain('ANSWERA defensible position');
  });

  it('does not strip a short-answer word from the start of its explanation', async () => {
    const filePath = 'Quiz & Exam Bank/Lesson 02 - Elasticity - Quiz & Exam Bank.docx';
    const blob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 2: Elasticity',
            questions: [
              {
                type: 'short_answer',
                question: 'Which demand pattern is most responsive to price?',
                answer: 'Elastic',
                explanation: 'Elastic demand means quantity responds proportionally more than price.',
              },
            ],
          },
        ],
      },
      'Principles of Microeconomics',
    );

    const text = (await extractedDocxParagraphs(blob, filePath)).join('\n');
    expect(text).toContain('Elastic demand means quantity responds proportionally more than price.');
    expect(text).not.toContain('ANSWER ELASTIC demand means');
  });

  it('prints exact assigned-reading identities in quiz and study-guide DOCX files', async () => {
    const reading = 'Textbook Chapter: DNA Structure and Replication';
    const quizBlob = await buildDeliverableDocxBlob(
      'quizBank',
      {
        quizzes: [
          {
            lessonTitle: 'Lesson 3: DNA Structure and Replication',
            assignedReadings: [reading],
            questions: [{ type: 'short_answer', question: 'Explain replication.', answer: 'Use source evidence.' }],
          },
        ],
      },
      'Introduction to Genetics',
    );
    const guideBlob = await buildDeliverableDocxBlob(
      'studyGuides',
      {
        studyGuides: [
          {
            lessonTitle: 'Lesson 3: DNA Structure and Replication',
            assignedReadings: [reading],
            summary: 'Connect nucleotide structure to semi-conservative replication.',
          },
        ],
      },
      'Introduction to Genetics',
    );

    const quizText = (
      await extractedDocxParagraphs(quizBlob, 'Quiz & Exam Bank/Lesson 03 - DNA Structure and Replication.docx')
    ).join('\n');
    const guideText = (
      await extractedDocxParagraphs(guideBlob, 'Study Guides/Lesson 03 - DNA Structure and Replication.docx')
    ).join('\n');

    expect(quizText).toContain(`Assigned Reading: ${reading}`);
    expect(guideText).toContain(reading);
    expect(quizText).not.toContain('the DNA Structure Replication focus');
    expect(guideText).not.toContain('the DNA Structure Replication focus');
  });
});
