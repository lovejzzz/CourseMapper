import { describe, expect, it } from 'vitest';
import { buildBundledRequiredLabAssets, collectRequiredLabAssets } from '../requiredLabAssets';

describe('collectRequiredLabAssets', () => {
  it('does not infer lab assets for non-data courses from generated deliverable wording', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Introduction to Psychology',
        lessons: [
          {
            title: 'Lesson 1: What Psychology Is and Why It Matters',
            sections: [
              {
                topicSection: 'Major perspectives in psychology',
                learningObjectives: 'Explain the scope of psychological science.',
              },
            ],
          },
        ],
      },
      deliverables: {
        studyGuides: {
          status: 'done',
          data: {
            studyGuides: [
              {
                summary:
                  'Old generated text mentions a Jupyter notebook, model card, dataset, precision, recall, and fairness.',
              },
            ],
          },
        },
      },
      requestedFeatureIds: ['courseMap', 'studyGuides'],
    });

    expect(requirements).toEqual([]);
  });

  it('keeps data-science asset requirements for explicit machine-learning courses', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Applied Machine Learning',
        lessons: [
          {
            title: 'Lesson 1: Model Validation',
            sections: [
              {
                topicSection: 'Train-test split, confusion matrix, precision, recall, fairness, model card',
                learningObjectives: 'Evaluate model validation evidence.',
                weeklyAssessments: 'Notebook analysis with validation metrics.',
              },
            ],
          },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).toEqual(
      expect.arrayContaining(['course-dataset', 'data-dictionary', 'starter-notebook', 'model-card-template']),
    );
    const bundled = buildBundledRequiredLabAssets(requirements, { courseName: 'Applied Machine Learning' });
    expect(bundled.map((asset) => asset.requirementId)).toEqual(['model-card-template']);
    expect(bundled.map((asset) => asset.path).join(' ')).not.toMatch(/policy|outcomes_sample/i);
  });

  it('keeps a language-data linguistics project out of the data-science asset genre', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Introduction to Language Structure',
        description:
          'An introductory linguistics course spanning phonetics, phonology, morphology, syntax, semantics, pragmatics, variation, audio waveform analysis, and a final language-data analysis.',
        lessons: [
          { title: 'Lesson 1: Linguistic Evidence' },
          {
            title: 'Lesson 14: Final Language-Data Analysis Project',
            sections: [{ technologyNeeded: 'Course dataset (.csv)' }],
          },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).toEqual(
      expect.arrayContaining(['language-data-packet', 'ipa-reference', 'audio-analysis-access']),
    );
    expect(JSON.stringify(requirements)).not.toMatch(/\.parquet|model card|\.ipynb/i);
  });

  it('does not infer an audio dependency from recording a written correction', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Introduction to Language Structure',
        lessons: [
          { title: 'Lesson 1: Phonetics', sections: [{ learningObjectives: 'Transcribe supplied written forms.' }] },
          { title: 'Lesson 2: Variation', sections: [{ asyncActivities: 'Audit a claim and record a correction.' }] },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).not.toContain('audio-analysis-access');
  });

  it('does not infer an audio dependency from a textual acoustic-phonetics source', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Introduction to Language Structure',
        lessons: [
          {
            title: 'Lesson 1: Phonetics',
            sections: [
              {
                learningObjectives: 'Compare articulatory and acoustic phonetics explanations in written sources.',
                supportingResources: 'Acoustic phonetics — https://example.edu/acoustic-phonetics',
              },
            ],
          },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).not.toContain('audio-analysis-access');
  });

  it('bundles a reusable multilingual packet only from validated structured examples and source records', () => {
    const requirements = [
      { id: 'language-data-packet', label: 'Documented language-data packet' },
      { id: 'ipa-reference', label: 'IPA reference' },
    ];
    const courseGraph = {
      authenticLanguageData: {
        protocol: 'coursemapper-authentic-language-data-v1',
        sources: [
          {
            id: 'lgr',
            title: 'Leipzig Glossing Rules',
            url: 'https://www.eva.mpg.de/lingua/resources/glossing-rules.php',
            license: 'CC BY-NC-SA 4.0',
            attribution: 'Max Planck Institute for Evolutionary Anthropology and University of Leipzig',
          },
          {
            id: 'wals-jpn',
            title: 'WALS Japanese word-order example',
            url: 'https://wals.info/valuesets/81A-jpn',
            license: 'CC BY 4.0',
            attribution: 'WALS Online, Dryer and Haspelmath, editors',
          },
        ],
        examples: [
          {
            id: 'turkish-1',
            language: 'Turkish',
            form: 'çık-mak',
            gloss: 'come.out-INF',
            translation: 'to come out',
            analysisFocus: 'one-to-many gloss correspondence',
            sourceId: 'lgr',
            sourceLocator: 'Rule 4, example 6',
          },
          {
            id: 'japanese-1',
            language: 'Japanese',
            form: 'John ga tegami o yon-da.',
            gloss: 'John SUBJ letter OBJ read-PST',
            translation: 'John read the letter.',
            analysisFocus: 'SOV constituent order',
            sourceId: 'wals-jpn',
            sourceLocator: 'Feature 81A, Japanese example igt-2990',
          },
        ],
      },
    };

    const bundled = buildBundledRequiredLabAssets(requirements, {
      courseName: 'Introduction to Language Structure',
      courseGraph,
    });
    const paths = bundled.map((asset) => asset.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'Required Assets/AUTHENTIC_LANGUAGE_DATA.csv',
        'Required Assets/AUTHENTIC_LANGUAGE_DATA_GUIDE.md',
        'Required Assets/IPA_REFERENCE_AND_INPUT_GUIDE.md',
      ]),
    );
    expect(bundled.find((asset) => asset.path.endsWith('.csv')).content).toMatch(/Turkish.*Japanese/s);
    const guide = bundled.find((asset) => asset.path.endsWith('GUIDE.md')).content;
    expect(guide).toContain('across 2 languages');
    expect(guide).toContain('NonCommercial condition');
    expect(guide).toContain('ShareAlike condition');
    expect(guide).toContain('does not relicense');
  });

  it('requires datasets and notebooks for a Python/pandas policy-analysis course', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Python for Public Policy',
        lessons: [
          { title: 'Python and pandas for public datasets' },
          { title: 'Functions and automated tests' },
          { title: 'Data cleaning, missing values, and reproducible notebooks' },
          { title: 'Data visualization with matplotlib for policy audiences' },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'course-dataset',
        'data-dictionary',
        'starter-notebook',
        'starter-script',
        'automated-test-exercise',
        'starter-test-suite',
      ]),
    );

    const bundled = buildBundledRequiredLabAssets(requirements, { courseName: 'Python for Public Policy' });
    expect(bundled.map((asset) => asset.path)).toEqual(
      expect.arrayContaining([
        'Required Assets/policy_outcomes_sample.csv',
        'Required Assets/DATA_DICTIONARY.md',
        'Required Assets/starter_policy_analysis.ipynb',
        'Required Assets/starter_policy_analysis.py',
        'Required Assets/AUTOMATED_TESTING_LAB.md',
        'Required Assets/test_starter_policy_analysis.py',
      ]),
    );
    expect(JSON.parse(bundled.find((asset) => asset.format === 'ipynb').content).nbformat).toBe(4);
    expect(bundled.find((asset) => asset.format === 'csv').content).toContain('reported_missing');
    expect(bundled.find((asset) => asset.path.endsWith('test_starter_policy_analysis.py')).content).toContain(
      'test_missing_required_column_fails_closed',
    );
    expect(bundled.find((asset) => asset.path.endsWith('AUTOMATED_TESTING_LAB.md')).content).toContain(
      'Add a failing test',
    );
  });

  it('does not treat computational Linear Algebra labs as physical wet-lab work', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Linear Algebra',
        lessons: [
          {
            title: 'Lesson 5: Bases and Dimension',
            sections: [
              {
                topicSection: '5.2: dimension',
                learningObjectives: 'Compute the dimension of a subspace from a basis.',
                weeklyAssessments: 'Computational lab in Python: bases and dimension',
                supportingResources: 'Instructor notes and worked matrix examples.',
              },
            ],
          },
        ],
      },
    });

    expect(requirements).toEqual([]);
  });

  it('does not treat a visual specimen as a physical laboratory specimen', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Visual Evidence and Image Analysis',
        lessons: [
          {
            title: 'Lesson 1: Composition',
            sections: [
              {
                learningObjectives: 'Analyze one concrete visual and distinguish observation from inference.',
                supportingResources:
                  'Lesson-specific visual specimen and attribution record for Composition; asset admission required before drafting; open photographic example.',
              },
            ],
          },
        ],
      },
    });

    expect(requirements).toEqual([]);
  });

  it('does not turn a nursing survey course with physiology topics into an anatomy lab', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Foundations for Nursing Practice',
        lessons: [
          {
            title: 'Lesson 1: Homeostasis',
            sections: [
              {
                topicSection: 'Cells, tissues, organs, and feedback regulation',
                learningObjectives: 'Explain how physiology informs safe nursing observations.',
                weeklyAssessments: 'Patient-observation case note.',
              },
            ],
          },
        ],
      },
    });

    expect(requirements).toEqual([]);
  });

  it('keeps physical wet-lab requirements when concrete lab evidence is present', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Physical Geology Laboratory',
        lessons: [
          {
            title: 'Lesson 1: Minerals',
            sections: [
              {
                topicSection: 'Mineral specimen identification',
                learningObjectives: 'Analyze mineral specimens using hand lenses and streak plates.',
                weeklyAssessments: 'Specimen notebook and lab safety check.',
              },
            ],
          },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).toEqual(
      expect.arrayContaining(['specimen-kit', 'lab-safety', 'observation-tools']),
    );
  });

  it('uses genetics-specific assets for a model-organism and microscopy course', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Introduction to Genetics',
        lessons: [
          {
            title: 'Lesson 10: Meiotic Data Analysis Lab',
            sections: [
              {
                topicSection: 'Microscopic observation and phenotype counting',
                learningObjectives: 'Compare model-organism phenotypes and calculate inheritance ratios.',
                weeklyAssessments: 'Model-organism observation log and data interpretation.',
              },
            ],
          },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).toEqual([
      'model-organism-materials',
      'genetics-lab-protocols',
      'genetics-observation-tools',
      'lab-safety',
      'genetics-data-sheet',
    ]);
    expect(requirements.map((item) => item.note).join(' ')).not.toMatch(/rock|mineral|streak plate|hand lens/i);
  });

  it('uses anatomy and physiology lab assets instead of geology field-lab assets', () => {
    const requirements = collectRequiredLabAssets({
      courseMap: {
        courseName: 'Human Anatomy and Physiology I',
        description:
          '15-week undergraduate course with model and microscope labs, lab practicals, tissue types, integumentary, skeletal, muscular, nervous, sensory physiology, homeostasis, and feedback regulation.',
        lessons: [
          {
            title: 'Lesson 2: Tissue types',
            sections: [
              {
                topicSection: '2.1 epithelial tissue',
                learningObjectives: 'Identify epithelial tissue on microscope slides.',
                weeklyAssessments: 'Lab practical with histology images.',
              },
            ],
          },
        ],
      },
    });

    expect(requirements.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'anatomical-model-set',
        'histology-slide-set',
        'anatomy-lab-manual',
        'specimen-model-policy',
      ]),
    );
    const text = JSON.stringify(requirements).toLowerCase();
    expect(text).not.toMatch(/rock|mineral|streak plate|hand lens|field notebook/);
  });
});
