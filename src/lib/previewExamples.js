// ── Example preview data shown on the Configure Generation page ──
//
// These examples are displayed BEFORE the user runs generation, so they serve
// as a "this is what you'll get" promise. Every field name here has to match
// what the preview renderer in src/screens/Config.jsx reads, AND the content
// has to feel like real generated output — not placeholder filler.
//
// Fixed theme: "Introduction to Machine Learning". Grounding every preview in
// the same subject makes the cross-deliverable coherence visible (a quiz
// question on overfitting maps to a slide on overfitting maps to a rubric
// criterion on model evaluation). Course Mapper's pitch IS that coherence,
// so the examples should show it.

export const PREVIEW_EXAMPLES = {

  // ── Course Map ─────────────────────────────────────────────────────────
  courseMap: {
    type: 'courseMap', isExample: true, total: 3,
    lessons: [
      { title: 'Week 1: Supervised Learning Basics', sections: [{
        topics: 'Classification vs regression, labeled data, train/test split',
        objectives: 'Distinguish supervised from unsupervised learning; explain the bias-variance tradeoff',
        activities: 'Hands-on scikit-learn notebook: predict housing prices on a cleaned dataset',
      }]},
      { title: 'Week 2: Decision Trees and Random Forests', sections: [{
        topics: 'Splitting criteria (Gini, entropy), pruning, bagging, random forests',
        objectives: 'Implement a decision tree classifier; compare bagging vs boosting ensembles',
        activities: 'Lab: build and tune a random forest on a Kaggle dataset; plot feature importances',
      }]},
      { title: 'Week 3: Neural Networks Fundamentals', sections: [{
        topics: 'Perceptrons, activation functions, forward/back propagation, gradient descent',
        objectives: 'Describe feedforward architecture; derive the backpropagation update for one layer',
        activities: 'Build a 2-layer neural net from scratch in NumPy; compare against scikit-learn MLP',
      }]},
    ],
    cols: [
      { key: 'topics', label: 'Topics' },
      { key: 'objectives', label: 'Objectives' },
      { key: 'activities', label: 'Activities' },
    ],
  },

  // ── Lesson Plans ───────────────────────────────────────────────────────
  lessonPlans: {
    type: 'lessonPlans', isExample: true, total: 2,
    items: [
      {
        lessonTitle: 'Lesson 1: Supervised Learning Basics',
        duration: '75 min', weekNumber: 'Week 1',
        bloomsLevels: ['Understand', 'Apply'],
        sessionOutline: [
          { duration: '10 min', activity: 'Warm-Up',            description: 'Quick poll: "name one ML application you used today" — surfaces intuitions before we formalize them' },
          { duration: '20 min', activity: 'Direct Instruction', description: 'Supervised vs unsupervised with Venn diagram; worked example on labeled vs unlabeled housing data' },
          { duration: '15 min', activity: 'Worked Example',     description: 'Fit a linear regression on 5 data points by hand; discuss why minimizing squared error corresponds to maximum likelihood' },
          { duration: '20 min', activity: 'Think-Pair-Share',   description: 'Pairs classify 10 real-world ML problems as regression or classification; full-class debrief on edge cases' },
          { duration: '10 min', activity: 'Formative Check',    description: 'Exit ticket: "How would you split a small dataset into train/test, and why not just test on the training data?"' },
        ],
      },
      {
        lessonTitle: 'Lesson 2: Decision Trees and Random Forests',
        duration: '75 min', weekNumber: 'Week 2',
        bloomsLevels: ['Apply', 'Analyze'],
        sessionOutline: [
          { duration: '5 min',  activity: 'Recap',          description: 'Review bias-variance tradeoff from Lesson 1 — sets up why ensembles help' },
          { duration: '25 min', activity: 'Demonstration',  description: 'Live-code a decision tree on Iris; walk through the Gini impurity calculation at the first split' },
          { duration: '30 min', activity: 'Guided Lab',     description: 'Students train random forests on a Kaggle dataset; compare accuracy + plot feature importance' },
          { duration: '15 min', activity: 'Reflection',     description: 'Write-up: when would bagging beat boosting? Share-out rotates through 3 pairs' },
        ],
      },
    ],
  },

  // ── Slide Decks ────────────────────────────────────────────────────────
  // Titles are assertion-evidence style (content/bridge/example slides).
  // keyTerm slides use the term itself as the title (matches prompt rule).
  slideDecks: {
    type: 'slideDecks', isExample: true, total: 2,
    items: [
      {
        lessonTitle: 'Lesson 1: Supervised Learning Basics',
        slides: [
          { title: 'Lesson 1 — Supervised Learning Basics',                                      type: 'title',      bullets: ['Intro to Machine Learning · Week 1'],                                                                     speakerNotes: 'Welcome, introduce today\'s arc.' },
          { title: 'Today\'s agenda',                                                             type: 'agenda',     bullets: ['Warm-up poll (10 min)', 'Supervised vs unsupervised (20 min)', 'Linear regression by hand (15 min)', 'Pair activity (20 min)'] },
          { title: 'Learning objectives',                                                         type: 'objectives', bullets: ['Distinguish supervised from unsupervised learning', 'Explain the bias-variance tradeoff', 'Apply the train/test split to prevent overfitting'] },
          { title: 'Supervised learning maps labeled inputs to predictable outputs',              type: 'content',    bullets: ['Training data: (xᵢ, yᵢ) pairs', 'Goal: learn f such that f(x) ≈ y', 'Generalize beyond training examples'] },
          { title: 'Classification predicts categories; regression predicts continuous values',   type: 'content',    bullets: ['Spam vs ham → classification', 'House price → regression', 'Same framework, different loss functions'] },
          { title: 'Bias–Variance Tradeoff',                                                      type: 'keyTerm',    bullets: ['The tension between a model\'s ability to fit the training data and generalize to new data', 'High bias: model too simple (underfits)', 'High variance: model too complex (overfits)'] },
          { title: 'Predicting house prices illustrates supervised learning end-to-end',          type: 'example',    bullets: ['Features: sq ft, bedrooms, ZIP', 'Label: sale price', 'Model learns weights that minimize squared error', 'Evaluate on held-out test set'] },
          { title: 'Pair activity: classify 10 ML problems',                                      type: 'activity',   bullets: ['Work with neighbor', 'Label each scenario: regression / classification / neither', 'Report 2 edge cases to the class'], activityType: 'Think-Pair-Share', timeEstimate: '20 min' },
          { title: 'Summary — can you now…',                                                      type: 'summary',    bullets: ['Distinguish supervised vs unsupervised?', 'Explain bias-variance in your own words?', 'Identify when to use regression vs classification?'] },
          { title: 'Before next time',                                                             type: 'closing',    bullets: ['Read ISLR Ch. 2', 'Complete scikit-learn intro notebook', 'Quiz 1 opens Friday — covers today + Week 0'] },
        ],
      },
      {
        lessonTitle: 'Lesson 2: Decision Trees and Random Forests',
        slides: [
          { title: 'Lesson 2 — Decision Trees and Random Forests', type: 'title',   bullets: ['Intro to ML · Week 2'] },
          { title: 'Today\'s agenda',                               type: 'agenda',  bullets: ['Recap of Lesson 1 (5 min)', 'Build a tree by hand (25 min)', 'Random forest lab (30 min)', 'Reflection (15 min)'] },
          { title: 'Building from Lesson 1',                        type: 'bridge',  bullets: ['Last time: linear regression + bias-variance', 'Today: non-linear models that address high bias', 'Thread: every model we study has a bias-variance profile'] },
          { title: 'Gini Impurity',                                 type: 'keyTerm', bullets: ['A measure of how "mixed" a set of labels is — lower means cleaner splits', 'Gini = 1 − Σpᵢ²', 'Used by decision trees to pick the best feature to split on'] },
          { title: 'A decision tree partitions feature space by asking one question at a time', type: 'content',  bullets: ['Root: pick feature that most reduces Gini', 'Recurse on each child', 'Stop when pure or depth limit hit'] },
          { title: 'Kaggle lab: train a random forest on Titanic', type: 'activity', bullets: ['Load dataset', 'Fit RandomForestClassifier with 100 trees', 'Plot feature importance', 'Compare to a single tree'], activityType: 'Guided Lab', timeEstimate: '30 min' },
        ],
      },
    ],
  },

  // ── Rubrics ────────────────────────────────────────────────────────────
  // Full 4-level scale (Exemplary / Proficient / Developing / Beginning) with
  // weight + points per criterion — matches what RubricsView renders.
  rubrics: {
    type: 'rubrics', isExample: true, total: 1,
    items: [{
      assignmentTitle: 'Random Forest Classifier — Coding Assignment',
      totalPoints: 100,
      assessmentType: 'Coding Project',
      bloomsLevel: 'Apply',
      criteria: [
        {
          name: 'Model implementation', weight: '30%', points: 30,
          levels: [
            { label: 'Exemplary',  description: 'RandomForestClassifier correctly trained with thoughtful hyperparameter choices (n_estimators, max_depth) justified in comments' },
            { label: 'Proficient', description: 'Model trains on the dataset with reasonable default hyperparameters; train/test split applied correctly' },
            { label: 'Developing', description: 'Model trains but uses defaults without justification; train/test split missing or misapplied' },
            { label: 'Beginning',  description: 'Code does not run, or trains on the full dataset without any split (risk of data leakage)' },
          ],
        },
        {
          name: 'Feature engineering', weight: '25%', points: 25,
          levels: [
            { label: 'Exemplary',  description: 'Handles missing values, encodes categoricals, and engineers ≥1 derived feature with a stated hypothesis' },
            { label: 'Proficient', description: 'Handles missing values and categoricals correctly; uses provided features as-is' },
            { label: 'Developing', description: 'Basic preprocessing only; model fails on categorical columns OR drops rows without discussing bias' },
            { label: 'Beginning',  description: 'No preprocessing — model errors on raw data' },
          ],
        },
        {
          name: 'Evaluation and interpretation', weight: '25%', points: 25,
          levels: [
            { label: 'Exemplary',  description: 'Reports accuracy + at least one other metric (F1, ROC-AUC); discusses feature importance and what it reveals about the problem' },
            { label: 'Proficient', description: 'Reports test accuracy; plots feature importance' },
            { label: 'Developing', description: 'Reports only training accuracy OR omits feature importance' },
            { label: 'Beginning',  description: 'No evaluation code' },
          ],
        },
        {
          name: 'Code quality and documentation', weight: '20%', points: 20,
          levels: [
            { label: 'Exemplary',  description: 'Code is modular, well-commented; README explains decisions; notebook renders top-to-bottom without edits' },
            { label: 'Proficient', description: 'Code runs; cells organized; most choices commented' },
            { label: 'Developing', description: 'Code runs but monolithic; sparse comments' },
            { label: 'Beginning',  description: 'Code does not run top-to-bottom OR has no comments' },
          ],
        },
      ],
    }],
  },

  // ── Quiz Bank ──────────────────────────────────────────────────────────
  // 3 questions showing the three types (MC, short_answer, essay) with full
  // metadata: Bloom's level, difficulty, options, answer, explanation,
  // distractorRationale (MC), rubricHints (essay), sampleAnswer.
  quizBank: {
    type: 'quizBank', isExample: true, total: 1,
    items: [{
      lessonTitle: 'Lesson 1 Quiz — Supervised Learning Basics',
      questions: [
        {
          type: 'multiple_choice', bloomsLevel: 'Remember', difficulty: 'Easy', points: 1,
          question: 'Which of the following best describes supervised learning?',
          options: [
            'A. Learning patterns from unlabeled data by grouping similar examples',
            'B. Learning a mapping from inputs to outputs using labeled training pairs',
            'C. Learning a policy that maximizes a cumulative reward signal',
            'D. Learning to compress data by finding a low-dimensional representation',
          ],
          answer: 'B',
          explanation: 'The correct answer is B because supervised learning requires labeled (x, y) pairs and learns a function f such that f(x) ≈ y.',
          distractorRationale: 'A: clustering (unsupervised); C: reinforcement learning; D: dimensionality reduction (unsupervised).',
          objectiveAligned: 'Distinguish supervised from unsupervised learning',
        },
        {
          type: 'short_answer', bloomsLevel: 'Understand', difficulty: 'Medium', points: 2,
          question: 'In 2–3 sentences, explain the bias-variance tradeoff and why a model that fits the training data perfectly often performs poorly on new data.',
          sampleAnswer: 'High-variance models memorize training noise (overfit) and fail to generalize; high-bias models are too simple to capture the pattern (underfit). The tradeoff means increasing model complexity reduces bias but raises variance, so we pick the complexity that minimizes test error.',
          objectiveAligned: 'Explain the bias-variance tradeoff',
        },
        {
          type: 'essay', bloomsLevel: 'Analyze', difficulty: 'Hard', points: 5,
          question: 'You\'re given a dataset of 500 housing sales. Your linear regression hits 95% R² on train but 40% on test. Analyze three distinct causes and propose a concrete fix for each.',
          rubricHints: 'A strong response: (1) identifies overfitting as the root symptom, (2) names ≥3 distinct causes — e.g. insufficient data for the feature count, data leakage in features, lack of regularization, (3) proposes concrete fixes tied to each cause (more data / cross-validation / ridge regression), (4) discusses how to verify each fix worked.',
          sampleAnswer: 'The train–test gap signals overfitting. Three likely causes: (a) too many features relative to N=500 — fix by feature selection or reducing polynomial degree; (b) the train set leaks information from test (e.g. ZIP code duplicates) — fix with a careful split that accounts for duplicates; (c) no regularization — fix with Ridge or Lasso. Validate each fix via 5-fold CV on train.',
          objectiveAligned: 'Apply the train/test split to prevent overfitting',
        },
      ],
      bloomsCoverage: ['Remember', 'Understand', 'Analyze'],
    }],
  },

  // ── Discussions ────────────────────────────────────────────────────────
  // Follow-ups as an array (matches DiscussionsView's followUpProbes) plus
  // a Bloom's level per prompt.
  discussions: {
    type: 'discussions', isExample: true, total: 2,
    items: [
      {
        lessonTitle: 'Week 1 Discussion — Real-World Supervised Learning',
        bloomsLevel: 'Apply',
        format: 'Async forum',
        estimatedDuration: '30 min',
        prompt: 'Pick a supervised learning system you interact with regularly (email spam filter, streaming recommendations, credit scoring…). Identify the inputs it sees, the label it\'s predicting, and one failure mode you\'ve personally noticed. Respond to at least one peer whose system has a different structure than yours.',
        followUp: [
          'What training data would you need to fix the failure mode you described?',
          'If you could collect one more feature, which one and why?',
          'How would you know your fix actually worked without deploying it?',
        ],
      },
      {
        lessonTitle: 'Week 2 Discussion — Ensembles in Practice',
        bloomsLevel: 'Evaluate',
        format: 'Sync breakout',
        estimatedDuration: '25 min',
        prompt: 'A colleague says "we should always use random forests instead of a single decision tree." Evaluate that claim with at least two scenarios where it holds and one where it doesn\'t. Cite evidence from the readings.',
        followUp: [
          'How does the answer change for a small dataset (N < 200)?',
          'When does a simpler model earn its interpretability premium?',
        ],
      },
    ],
  },

  // ── Assignments ────────────────────────────────────────────────────────
  assignments: {
    type: 'assignments', isExample: true, total: 1,
    items: [{
      title: 'Midterm Project — Build and Evaluate a Classifier',
      assignmentType: 'Coding Project',
      bloomsLevel: 'Apply',
      estimatedTime: '6–8 hours over two weeks',
      totalPoints: 100,
      percentOfGrade: '20%',
      dueWeek: 'End of Week 4',
      description: 'Select a publicly-available dataset with a clear classification target (Kaggle, UCI, or instructor-approved source). Train at least two models — one linear, one tree-based — and evaluate them on held-out data. Write a 3-page report analyzing the results and justifying your modeling choices.',
      components: [
        'Exploratory data analysis with ≥3 visualizations (20%)',
        'Preprocessing pipeline with documented decisions (20%)',
        'Two trained models with hyperparameter tuning (30%)',
        'Evaluation using accuracy, F1, and a confusion matrix (20%)',
        'Written analysis connecting results to course concepts (10%)',
      ],
      deliverables: [
        'Jupyter notebook (runs top-to-bottom)',
        '3-page PDF report',
        'README with dataset source and reproducibility instructions',
      ],
      relatedLessons: ['Lesson 1: Supervised Learning Basics', 'Lesson 2: Decision Trees and Random Forests'],
    }],
  },

  // ── Study Guides ───────────────────────────────────────────────────────
  studyGuides: {
    type: 'studyGuides', isExample: true, total: 1,
    items: [{
      lessonTitle: 'Lesson 1 Study Guide — Supervised Learning Basics',
      summary: 'This lesson introduces the supervised learning paradigm, defines the bias-variance tradeoff, and shows why we never evaluate a model on its training data.',
      keyTerms: [
        {
          term: 'Supervised learning',
          definition: 'Learning a function from input–output pairs where the correct output (label) is known during training.',
          example: 'An email spam filter trained on emails labeled "spam" or "not spam".',
        },
        {
          term: 'Bias-variance tradeoff',
          definition: 'The tension between a model\'s capacity to fit training data (low bias) and its ability to generalize to new data (low variance).',
          example: 'A straight line fit to a curved pattern has high bias; a wiggly polynomial that passes through every training point has high variance.',
        },
        {
          term: 'Train/test split',
          definition: 'Partitioning data so the model is trained on one subset and evaluated on a separate held-out subset it has never seen.',
          example: 'Shuffle 1000 examples, use 800 for training and hold 200 out for final evaluation.',
        },
      ],
      reviewQuestions: [
        'What distinguishes supervised from unsupervised learning in terms of the data available during training?',
        'Why does a model with 100% training accuracy sometimes perform poorly on new data?',
        'How does the train/test split protect against overfitting, and what\'s one pitfall it doesn\'t catch?',
      ],
      commonMisconceptions: [
        {
          misconception: '"If train accuracy is high, the model is good."',
          correction: 'High train accuracy can indicate overfitting. Always report test accuracy on held-out data.',
        },
      ],
    }],
  },

  // ── Syllabus ───────────────────────────────────────────────────────────
  syllabus: {
    type: 'syllabus', isExample: true, total: 5,
    sections: [
      { heading: 'Course Description',
        content: 'Intro to Machine Learning covers the mathematical and computational foundations of supervised learning, with a focus on building intuition through hands-on implementation. Students leave able to train, evaluate, and reason about classifiers and regressors on real data.' },
      { heading: 'Learning Outcomes',
        content: 'By semester end, students will: (1) distinguish supervised from unsupervised learning and select appropriate methods, (2) implement and tune tree-based and neural models, (3) apply the train/test discipline to avoid overfitting, (4) interpret model predictions via feature importance and error analysis.' },
      { heading: 'Required Materials',
        content: 'Introduction to Statistical Learning (James, Witten, Hastie, Tibshirani — 2nd edition, free PDF); Python 3.10+ with scikit-learn, pandas, NumPy, matplotlib; laptop for in-class labs.' },
      { heading: 'Grading Policy',
        content: 'Participation 10% · Weekly quizzes 20% · Midterm project 20% · Weekly coding assignments 30% · Final project 20%. Late work loses 10%/day; all due dates fixed in the course schedule.' },
      { heading: 'Course Schedule',
        content: 'Week 1: Supervised Learning Basics · Week 2: Decision Trees & Random Forests · Week 3: Neural Networks Fundamentals · (…) · Week 14: Final project presentations. Full calendar posted in LMS.' },
    ],
  },

  // ── Course FAQ ─────────────────────────────────────────────────────────
  // NEW — had no preview example before. Shows the student-facing FAQ tone.
  courseFaq: {
    type: 'courseFaq', isExample: true, total: 4,
    items: [
      {
        question: 'What math background do I need for this course?',
        answer: 'You need comfort with basic linear algebra (matrix multiplication, dot products) and calculus (what a derivative means). We re-derive the math as it comes up — there\'s no prerequisite exam.',
        category: 'Logistics',
      },
      {
        question: 'Why are we training a model on a train set AND a test set — what\'s the difference?',
        answer: 'The train set is what the model learns from. The test set is held out so we can measure how the model performs on data it has never seen. Evaluating on the train set would be like grading yourself on questions you already had the answer to.',
        category: 'Concepts',
      },
      {
        question: 'How do I know if I\'m overfitting?',
        answer: 'The classic sign: train accuracy is much higher than test accuracy. If you see 99% train / 60% test, your model is memorizing rather than generalizing. Cross-validation and simpler models are your main tools against it.',
        category: 'Concepts',
      },
      {
        question: 'Can I use PyTorch or Keras for the coding assignments?',
        answer: 'For the first half of the course, stick with scikit-learn — the pedagogical goal is intuition about the algorithms themselves, not framework fluency. The final project is framework-agnostic.',
        category: 'Assessments',
      },
    ],
  },
};
