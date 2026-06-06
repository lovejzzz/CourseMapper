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
});
