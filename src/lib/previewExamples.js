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
          { title: 'Lesson 1 — Supervised Learning Basics',                                      type: 'title',      timeEstimate: '1 min',  bullets: ['Intro to Machine Learning · Week 1'], speakerNotes: 'Welcome, introduce today\'s arc.', visual: { kind: 'none' } },
          { title: 'Today\'s agenda',                                                             type: 'agenda',     timeEstimate: '2 min',  bullets: ['Warm-up poll (10 min)', 'Supervised vs unsupervised (20 min)', 'Linear regression by hand (15 min)', 'Pair activity (20 min)'], visual: { kind: 'none' } },
          { title: 'Learning objectives',                                                         type: 'objectives', timeEstimate: '2 min',  bullets: ['Distinguish supervised from unsupervised learning', 'Explain the bias-variance tradeoff', 'Apply the train/test split to prevent overfitting'], visual: { kind: 'none' } },
          { title: 'Supervised learning maps labeled inputs to predictable outputs',              type: 'content',    timeEstimate: '5 min',  bullets: ['Training data: (xᵢ, yᵢ) pairs', 'Goal: learn f such that f(x) ≈ y', 'Generalize beyond training examples'], visual: { kind: 'diagram', description: 'Flowchart: labeled data → learner → trained model → new input → prediction', altText: 'A four-step horizontal flow: a table of labeled examples feeds into a learning algorithm box, which outputs a trained model; a new unlabeled input flows into the model and out as a prediction.' } },
          { title: 'Classification predicts categories; regression predicts continuous values',   type: 'content',    timeEstimate: '5 min',  bullets: ['Spam vs ham → classification', 'House price → regression', 'Same framework, different loss functions'], visual: { kind: 'chart', description: 'Side-by-side: scatter plot (regression line) vs 2-class decision boundary', altText: 'Two scatter plots side by side. Left: continuous y-axis with points and a fitted regression line. Right: two-color clusters separated by a diagonal decision boundary.' } },
          { title: 'Bias–Variance Tradeoff',                                                      type: 'keyTerm',    timeEstimate: '6 min',  bullets: ['The tension between a model\'s ability to fit the training data and generalize to new data', 'High bias: model too simple (underfits)', 'High variance: model too complex (overfits)'], visual: { kind: 'chart', description: 'U-shaped test-error curve vs model complexity, with bias and variance components', altText: 'Line chart with model complexity on the x-axis and error on the y-axis. Two curves: bias decreases as complexity grows, variance increases; their sum is a U-shaped test error curve with a minimum at moderate complexity.' } },
          { title: 'Predicting house prices illustrates supervised learning end-to-end',          type: 'example',    timeEstimate: '8 min',  bullets: ['Features: sq ft, bedrooms, ZIP', 'Label: sale price', 'Model learns weights that minimize squared error', 'Evaluate on held-out test set'], visual: { kind: 'table', description: '5-row sample dataset: sq_ft, bedrooms, zip, sale_price', altText: 'A five-row table with columns for square footage, number of bedrooms, ZIP code, and sale price — showing how labeled training data is structured.' } },
          { title: 'Pair activity: classify 10 ML problems',                                      type: 'activity',   timeEstimate: '20 min', bullets: ['Work with neighbor', 'Label each scenario: regression / classification / neither', 'Report 2 edge cases to the class'], activityType: 'Think-Pair-Share', visual: { kind: 'image', description: 'Classroom pair icon', altText: 'Two-person conversation icon.' } },
          { title: 'Summary — can you now…',                                                      type: 'summary',    timeEstimate: '3 min',  bullets: ['Distinguish supervised vs unsupervised?', 'Explain bias-variance in your own words?', 'Identify when to use regression vs classification?'], visual: { kind: 'none' } },
          { title: 'Before next time',                                                            type: 'closing',    timeEstimate: '3 min',  bullets: ['Read ISLR Ch. 2', 'Complete scikit-learn intro notebook', 'Quiz 1 opens Friday — covers today + Week 0'], visual: { kind: 'none' } },
        ],
      },
      {
        lessonTitle: 'Lesson 2: Decision Trees and Random Forests',
        slides: [
          { title: 'Lesson 2 — Decision Trees and Random Forests', type: 'title',    timeEstimate: '1 min',  bullets: ['Intro to ML · Week 2'], visual: { kind: 'none' } },
          { title: 'Today\'s agenda',                               type: 'agenda',   timeEstimate: '2 min',  bullets: ['Recap of Lesson 1 (5 min)', 'Build a tree by hand (25 min)', 'Random forest lab (30 min)', 'Reflection (15 min)'], visual: { kind: 'none' } },
          { title: 'Building from Lesson 1',                        type: 'bridge',   timeEstimate: '5 min',  bullets: ['Last time: linear regression + bias-variance', 'Today: non-linear models that address high bias', 'Thread: every model we study has a bias-variance profile'], visual: { kind: 'diagram', description: 'Timeline arrow: Lesson 1 (linear) → Lesson 2 (trees) → Lesson 3 (neural nets)', altText: 'A horizontal arrow with three nodes labeled Linear Regression, Decision Trees, and Neural Networks, representing the course progression.' } },
          { title: 'Gini Impurity',                                 type: 'keyTerm',  timeEstimate: '7 min',  bullets: ['A measure of how "mixed" a set of labels is — lower means cleaner splits', 'Gini = 1 − Σpᵢ²', 'Used by decision trees to pick the best feature to split on'], visual: { kind: 'equation', description: 'Gini formula + worked example on a 4:2 label split', altText: 'Mathematical formula: G equals 1 minus the sum of p-sub-i squared. Below, a small set of six colored dots showing four reds and two blues yields G equals 0.444.' } },
          { title: 'A decision tree partitions feature space by asking one question at a time', type: 'content',   timeEstimate: '10 min', bullets: ['Root: pick feature that most reduces Gini', 'Recurse on each child', 'Stop when pure or depth limit hit'], visual: { kind: 'diagram', description: '2D feature space partitioned by axis-aligned splits, with the corresponding tree beside it', altText: 'On the left, a 2D plane with two classes of points separated by three axis-aligned rectangular regions. On the right, a binary decision tree whose splits correspond to the rectangle boundaries.' } },
          { title: 'Kaggle lab: train a random forest on Titanic', type: 'activity', timeEstimate: '30 min', bullets: ['Load dataset', 'Fit RandomForestClassifier with 100 trees', 'Plot feature importance', 'Compare to a single tree'], activityType: 'Guided Lab', visual: { kind: 'code', description: 'Starter snippet: from sklearn.ensemble import RandomForestClassifier; rf = RandomForestClassifier(n_estimators=100).fit(X,y)', altText: 'Python code import statement followed by two lines that instantiate and fit a RandomForestClassifier with 100 trees.' } },
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
            { label: 'Exemplary',  description: 'RandomForestClassifier correctly trained with thoughtful hyperparameter choices (n_estimators, max_depth) justified in comments. e.g., "# n_estimators=200 — diminishing returns observed after 150 in 5-fold CV."' },
            { label: 'Proficient', description: 'Model trains on the dataset with reasonable default hyperparameters; train/test split applied correctly. e.g., uses sklearn\'s train_test_split with stratify=y and random_state set for reproducibility.' },
            { label: 'Developing', description: 'Model trains but uses defaults without justification; train/test split missing or misapplied. e.g., uses train_test_split without stratify and reports results on a shuffled split that left one class under-represented.' },
            { label: 'Beginning',  description: 'Code does not run, or trains on the full dataset without any split (risk of data leakage). e.g., fits the model on X,y and reports accuracy on the same X without any hold-out.' },
          ],
        },
        {
          name: 'Feature engineering', weight: '25%', points: 25,
          levels: [
            { label: 'Exemplary',  description: 'Handles missing values, encodes categoricals, and engineers ≥1 derived feature with a stated hypothesis. e.g., creates price_per_sqft = price / sqft with a comment: "hypothesis: density ratio correlates with label independent of raw size."' },
            { label: 'Proficient', description: 'Handles missing values and categoricals correctly; uses provided features as-is. e.g., SimpleImputer(strategy="median") + OneHotEncoder wrapped in a ColumnTransformer.' },
            { label: 'Developing', description: 'Basic preprocessing only; model fails on categorical columns OR drops rows without discussing bias. e.g., df.dropna() removes 30% of rows without acknowledging that missingness was not random.' },
            { label: 'Beginning',  description: 'No preprocessing — model errors on raw data. e.g., fit() raises ValueError: could not convert string to float because categorical columns were left unencoded.' },
          ],
        },
        {
          name: 'Evaluation and interpretation', weight: '25%', points: 25,
          levels: [
            { label: 'Exemplary',  description: 'Reports accuracy + ≥1 other metric (F1, ROC-AUC); discusses feature importance and what it reveals about the problem. e.g., "Test F1=0.82; feature importance ranks fare and age highest, suggesting socioeconomic factors drove survival more than gender alone."' },
            { label: 'Proficient', description: 'Reports test accuracy; plots feature importance. e.g., prints "Test accuracy: 0.81" and saves a horizontal bar chart of feature_importances_.' },
            { label: 'Developing', description: 'Reports only training accuracy OR omits feature importance. e.g., prints "Accuracy: 0.99" without noting that this is on train, masking overfitting.' },
            { label: 'Beginning',  description: 'No evaluation code. e.g., notebook ends at model.fit() with no print/plot of performance metrics.' },
          ],
        },
        {
          name: 'Code quality and documentation', weight: '20%', points: 20,
          levels: [
            { label: 'Exemplary',  description: 'Code is modular, well-commented; README explains decisions; notebook renders top-to-bottom without edits. e.g., README includes a "Design decisions" section, and running "Kernel > Restart and Run All" completes without errors.' },
            { label: 'Proficient', description: 'Code runs; cells organized; most choices commented. e.g., section headers separate EDA, preprocessing, modeling, evaluation; most non-obvious lines have a short comment.' },
            { label: 'Developing', description: 'Code runs but monolithic; sparse comments. e.g., one 200-line cell does everything from load to plot, with only a handful of comments.' },
            { label: 'Beginning',  description: 'Code does not run top-to-bottom OR has no comments. e.g., cell 4 references a variable defined only if cell 7 was run first.' },
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
      scaffoldingMilestones: [
        {
          milestone: 'Dataset selection + problem statement',
          dueDate: 'Week 3, Monday 5pm',
          description: 'A single-paragraph problem statement (100-150 words) naming the dataset, the classification target, the real-world decision your model would inform, and one concern about class balance or label quality.',
          feedback: 'Instructor written feedback within 48 hours',
          points: 5,
        },
        {
          milestone: 'Exploratory data analysis draft',
          dueDate: 'Week 3, Friday 5pm',
          description: 'Jupyter notebook with ≥3 visualizations (at least one univariate, one bivariate, one class-balance check) and a 1-page "what I learned from this EDA" markdown cell.',
          feedback: 'Peer review — each student reviews 2 peers\' EDAs using a provided checklist',
          points: 10,
        },
        {
          milestone: 'First model + baseline',
          dueDate: 'Week 4, Monday class time',
          description: 'Trained linear model (logistic regression or linear SVM) with a preprocessing pipeline and test-set metrics. Used as a baseline for the final report.',
          feedback: 'Office-hours discussion — bring the notebook to a 10-min slot',
          points: 10,
        },
        {
          milestone: 'Final submission',
          dueDate: 'End of Week 4, Friday 11:59pm',
          description: 'Complete notebook + PDF report + README, submitted via LMS as a single ZIP.',
          feedback: 'Instructor rubric-based feedback within 7 days',
          points: 75,
          uploadChecklist: [
            'Notebook runs top-to-bottom without errors (Kernel → Restart and Run All)',
            '3-page PDF report includes EDA summary, two model comparisons, conclusion',
            'README names the dataset source + installation commands for reproducibility',
          ],
        },
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
    type: 'syllabus', isExample: true, total: 6,
    sections: [
      { heading: 'Course Description',
        content: 'Intro to Machine Learning covers the mathematical and computational foundations of supervised learning, with a focus on building intuition through hands-on implementation. Students leave able to train, evaluate, and reason about classifiers and regressors on real data.' },
      { heading: 'Learning Outcomes',
        content: 'By semester end, students will: (1) distinguish supervised from unsupervised learning and select appropriate methods, (2) implement and tune tree-based and neural models, (3) apply the train/test discipline to avoid overfitting, (4) interpret model predictions via feature importance and error analysis.' },
      { heading: 'Outcome ↔ Assessment Alignment',
        content: '(1) Distinguish supervised vs unsupervised — Weekly Quizzes #1-2, Midterm Project. (2) Implement and tune tree-based + neural models — Midterm Project, Final Project, Coding Assignments #3-5. (3) Train/test discipline — every coding assignment, Midterm Project rubric criterion "Model implementation". (4) Interpret via feature importance — Midterm Project rubric "Evaluation and interpretation", Final Project presentation. Every learning outcome is both practiced in class AND assessed on a graded artifact (accreditation evidence).' },
      { heading: 'Required Materials',
        content: 'Introduction to Statistical Learning (James, Witten, Hastie, Tibshirani — 2nd edition, free PDF); Python 3.10+ with scikit-learn, pandas, NumPy, matplotlib; laptop for in-class labs.' },
      { heading: 'Grading Policy',
        content: 'Participation 10% · Weekly quizzes 20% · Midterm project 20% · Weekly coding assignments 30% · Final project 20%. Late work loses 10%/day; all due dates fixed in the course schedule.' },
      { heading: 'Course Schedule',
        content: 'Week 1: Supervised Learning Basics · Week 2: Decision Trees & Random Forests · Week 3: Neural Networks Fundamentals · (…) · Week 14: Final project presentations. Full calendar posted in LMS.' },
    ],
    // Structured data for the SyllabusView matrix renderer — used when the
    // syllabus has real outcomeAlignmentMatrix output.
    outcomeAlignmentMatrix: [
      { outcome: 'Distinguish supervised from unsupervised learning and select appropriate methods', bloomsLevel: 'Analyze',  assessedBy: ['Weekly Quizzes #1-2', 'Midterm Project (problem statement)'],                             practicedIn: ['Lesson 1: Supervised Learning Basics'] },
      { outcome: 'Implement and tune tree-based and neural models',                                  bloomsLevel: 'Apply',    assessedBy: ['Midterm Project', 'Final Project', 'Coding Assignments #3-5'],                                practicedIn: ['Lesson 2: Decision Trees and Random Forests', 'Lesson 3: Neural Networks Fundamentals'] },
      { outcome: 'Apply the train/test discipline to avoid overfitting',                             bloomsLevel: 'Apply',    assessedBy: ['All coding assignments', 'Midterm rubric "Model implementation"'],                            practicedIn: ['Lesson 1: Supervised Learning Basics'] },
      { outcome: 'Interpret model predictions via feature importance and error analysis',            bloomsLevel: 'Evaluate', assessedBy: ['Midterm rubric "Evaluation and interpretation"', 'Final Project presentation'],             practicedIn: ['Lesson 2: Decision Trees and Random Forests'] },
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
