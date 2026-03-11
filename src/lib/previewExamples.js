// ── Example preview data (shown before generation) ───────────────────────────
export const PREVIEW_EXAMPLES = {
  courseMap: {
    type: 'courseMap', isExample: true, total: 3,
    lessons: [
      { title: 'Week 1: Introduction', sections: [{ topics: 'Course overview, key concepts', objectives: 'Define core terms, identify scope', activities: 'Icebreaker discussion' }] },
      { title: 'Week 2: Foundations', sections: [{ topics: 'Theoretical framework', objectives: 'Compare models, analyze assumptions', activities: 'Case study analysis' }] },
      { title: 'Week 3: Applications', sections: [{ topics: 'Real-world applications', objectives: 'Apply concepts to scenarios', activities: 'Group project kickoff' }] },
    ],
    cols: [{ key: 'topics', label: 'Topics' }, { key: 'objectives', label: 'Objectives' }, { key: 'activities', label: 'Activities' }],
  },
  lessonPlans: {
    type: 'lessonPlans', isExample: true, total: 2,
    items: [
      { lessonTitle: 'Lesson 1: Introduction', sessionOutline: [
        { duration: '10 min', activity: 'Warm-Up', description: 'Review prior knowledge and set learning goals' },
        { duration: '25 min', activity: 'Direct Instruction', description: 'Present core concepts with visual aids' },
        { duration: '15 min', activity: 'Group Activity', description: 'Collaborative problem-solving exercise' },
      ]},
      { lessonTitle: 'Lesson 2: Deep Dive', sessionOutline: [
        { duration: '5 min', activity: 'Recap', description: 'Quick review of previous lesson' },
        { duration: '30 min', activity: 'Workshop', description: 'Hands-on practice with guided examples' },
        { duration: '15 min', activity: 'Reflection', description: 'Exit ticket and self-assessment' },
      ]},
    ],
  },
  slideDecks: {
    type: 'slideDecks', isExample: true, total: 2,
    items: [
      { lessonTitle: 'Lesson 1: Introduction', slides: [
        { title: 'Welcome & Overview' }, { title: 'Learning Objectives' }, { title: 'Key Concepts' },
        { title: 'Visual Example' }, { title: 'Discussion Prompt' }, { title: 'Summary & Next Steps' },
      ]},
      { lessonTitle: 'Lesson 2: Deep Dive', slides: [
        { title: 'Recap' }, { title: 'New Framework' }, { title: 'Case Study' }, { title: 'Takeaways' },
      ]},
    ],
  },
  rubrics: {
    type: 'rubrics', isExample: true, total: 1,
    items: [{
      assignmentTitle: 'Research Paper Rubric',
      criteria: [
        { name: 'Thesis', levels: [{ label: 'Excellent', description: 'Clear, arguable, well-supported' }, { label: 'Good', description: 'Clear thesis with some support' }, { label: 'Needs Work', description: 'Unclear or unsupported thesis' }] },
        { name: 'Evidence', levels: [{ label: 'Excellent', description: 'Strong, relevant sources' }, { label: 'Good', description: 'Adequate sources' }, { label: 'Needs Work', description: 'Insufficient evidence' }] },
        { name: 'Writing', levels: [{ label: 'Excellent', description: 'Polished, error-free prose' }, { label: 'Good', description: 'Generally clear writing' }, { label: 'Needs Work', description: 'Frequent errors' }] },
      ],
    }],
  },
  quizBank: {
    type: 'quizBank', isExample: true, total: 1,
    items: [{
      lessonTitle: 'Lesson 1 Quiz',
      questions: [
        { type: 'MC', question: 'Which of the following best describes the primary function of...?' },
        { type: 'T/F', question: 'The framework applies equally to all contexts regardless of scale.' },
        { type: 'Short', question: 'Explain one real-world application of the concept discussed in class.' },
      ],
    }],
  },
  discussions: {
    type: 'discussions', isExample: true, total: 2,
    items: [
      { lessonTitle: 'Week 1 Discussion', prompt: 'How does this concept connect to your own experience? Share a specific example and respond to at least one peer.', followUp: 'Consider alternative perspectives raised by your classmates.' },
      { lessonTitle: 'Week 2 Discussion', prompt: 'Analyze the case study and argue for or against the proposed approach. Support your position with evidence from the readings.' },
    ],
  },
  assignments: {
    type: 'assignments', isExample: true, total: 1,
    items: [{
      title: 'Midterm Project: Case Analysis',
      description: 'Select a real-world scenario and apply the course framework to analyze its key challenges and propose solutions.',
      components: ['Problem identification (20%)', 'Framework application (30%)', 'Proposed solution (30%)', 'Reflection & references (20%)'],
    }],
  },
  studyGuides: {
    type: 'studyGuides', isExample: true, total: 1,
    items: [{
      lessonTitle: 'Lesson 1 Study Guide',
      keyTerms: [
        { term: 'Framework', definition: 'A structured approach for analyzing and solving problems within a domain' },
        { term: 'Scope', definition: 'The boundaries and extent of a project or area of study' },
        { term: 'Methodology', definition: 'A systematic set of methods used in a particular area of activity' },
      ],
    }],
  },
  syllabus: {
    type: 'syllabus', isExample: true, total: 5,
    sections: [
      { heading: 'Course Description', content: 'This course introduces students to the foundational concepts and practical applications of...' },
      { heading: 'Learning Objectives', content: 'By the end of this course, students will be able to analyze, evaluate, and apply...' },
      { heading: 'Required Materials', content: 'Textbook (3rd edition), access to online learning platform, laptop for in-class activities' },
      { heading: 'Grading Policy', content: 'Participation 10%, Assignments 30%, Midterm 25%, Final Project 35%' },
      { heading: 'Course Schedule', content: 'Week 1: Introduction — Week 2: Foundations — Week 3: Applications — ...' },
    ],
  },
};
