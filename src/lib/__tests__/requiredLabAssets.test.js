import { describe, expect, it } from 'vitest';
import { collectRequiredLabAssets } from '../requiredLabAssets';

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
});
