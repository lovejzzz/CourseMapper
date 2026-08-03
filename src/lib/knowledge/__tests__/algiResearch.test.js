import { describe, it, expect } from 'vitest';
import {
  sentencesFrom,
  definitionSentence,
  looksLikeEntity,
  contrastSentences,
  distractorsFromContrast,
  explanatoryScore,
  lexicalRelevance,
  researchQueryForTopic,
  directResearchTitles,
  cosine,
  buildKernelFromArticle,
  buildDoajProvider,
  buildEuropePmcProvider,
  buildWikipediaProvider,
  buildWaiProvider,
  researchConcept,
  researchCourse,
  researchLessonKernels,
  researchLessonKernelSets,
  researchLessonKernelSetsCascade,
  isResearchCandidateDomainAligned,
  isWaiSourceFamilyAligned,
  conciseDefinitionOption,
  contrastTargetFromSentence,
  extractWaiResearchText,
  misconceptionFromContrast,
  RESEARCH_ORIGIN,
  RELEVANCE_FLOOR,
} from '../algiResearch.js';
import { planAlgiCourseResearch } from '../algiResearchPlan.js';

const provider = {
  license: 'CC BY-SA 4.0',
  attributionFor: (title) => `Wikipedia, ${title}`,
  sourceIdFor: (title) => `wikipedia:${title}`,
  search: async () => [],
  article: async () => '',
};

/** Stub provider: no network, fully deterministic. */
function stubProvider(pages) {
  return {
    ...provider,
    search: async (query) =>
      Object.keys(pages).filter((title) =>
        query
          .toLowerCase()
          .split(/\s+/)
          .some((token) => pages[title].hits.includes(token)),
      ),
    article: async (title) => pages[title]?.text || '',
  };
}

describe('sentence selection (gap 2)', () => {
  it('does not fuse a section heading into the paragraph that follows it', () => {
    // The real defect: "History User experience design is a conceptual design
    // discipline..." was emitted as a single sentence and served as prose.
    const extract =
      'History\nUser experience design is a conceptual design discipline rooted in human factors and ergonomics research.';
    const sentences = sentencesFrom(extract);
    expect(sentences.some((sentence) => sentence.startsWith('History'))).toBe(false);
    expect(sentences[0]).toMatch(/^User experience design is a conceptual/);
  });

  it('keeps a middle initial attached to the source sentence', () => {
    const sentences = sentencesFrom(
      'First normal form is a level of database normalization defined by English computer scientist Edgar F. Codd. It requires each table cell to contain one value.',
    );
    expect(sentences[0]).toContain('Edgar F. Codd.');
    expect(sentences).not.toContain(
      'First normal form is a level of database normalization defined by English computer scientist Edgar F.',
    );
  });

  it('drops fragments that are too short or unterminated', () => {
    expect(sentencesFrom('Too short.\nAlso short')).toEqual([]);
  });

  it('scores narration below explanation', () => {
    const explain = 'Photosynthesis is a process that converts light energy into chemical energy for the organism.';
    const narrate = 'The term was coined in 1893 and first used in a scientific journal of that century.';
    expect(explanatoryScore(explain, 'photosynthesis')).toBeGreaterThan(explanatoryScore(narrate, 'photosynthesis'));
  });

  it('scores mechanisms above true but instructionally thin topic promotion', () => {
    const mechanism =
      'Quantum entanglement links subsystem states so the composite state cannot be described as independent parts.';
    const promotion =
      'The topic of quantum entanglement is at the heart of the disparity between classical physics and quantum physics.';
    expect(explanatoryScore(mechanism, 'quantum entanglement')).toBeGreaterThan(
      explanatoryScore(promotion, 'quantum entanglement'),
    );
  });

  it('prefers the lead definition over a mid-article comparative', () => {
    // Ranking by pattern alone served the comparative as the definition of
    // "deontology"; position is what distinguishes them.
    const sentences = [
      'Deontology is the normative ethical theory that judges the morality of an action using rules.',
      'One thing that clearly distinguishes Kantian deontologism from divine command deontology is that Kantianism maintains a rational basis.',
    ];
    expect(definitionSentence(sentences, 'Deontology')).toBe(sentences[0]);
  });

  it('requires the term to be the subject, not merely present', () => {
    const sentences = [
      'Some scholars argue that the wider literature on deontology is inconsistent across traditions.',
    ];
    expect(definitionSentence(sentences, 'Deontology')).toBeNull();
  });

  it('recognizes a qualified possessive-plural lead as the article subject', () => {
    const sentence =
      "In quantum information science, the Bell's states or EPR pairs are specific quantum states of two qubits.";
    expect(definitionSentence([sentence], 'Bell state')).toBe(sentence);
  });
});

describe('teaching-atom phrasing', () => {
  it('names the other side of an explicit contrast instead of emitting a dangling placeholder', () => {
    expect(contrastTargetFromSentence('Unlike many classical logic gates, quantum logic gates are reversible.')).toBe(
      'many classical logic gates',
    );
    expect(
      contrastTargetFromSentence(
        'Density matrices for entangled systems differ from ensembles of pure states with the same measurement statistics.',
      ),
    ).toBe('ensembles of pure states with the same measurement statistics');
  });

  it('turns an infinitive contrast into a grammatical misconception', () => {
    const misconception = misconceptionFromContrast(
      'Semantic HTML reinforces the meaning of web content rather than merely to define its presentation or look.',
      'Semantic HTML',
    );
    expect(misconception.text).toBe('Semantic HTML is mainly about defining its presentation or look.');
    expect(misconception.corrective).toBe(
      'The source distinguishes Semantic HTML from defining its presentation or look.',
    );
  });

  it('removes a redundant comparison preposition from an ARIA contrast', () => {
    const misconception = misconceptionFromContrast(
      'WAI-ARIA treats web pages as applications rather than as static documents.',
      'WAI-ARIA',
    );
    expect(misconception.text).toBe('WAI-ARIA is mainly about static documents.');
    expect(misconception.corrective).toBe('The source distinguishes WAI-ARIA from static documents.');
  });

  it('turns a full definition into a complete compact quiz option', () => {
    expect(
      conciseDefinitionOption({
        term: 'Qubit',
        definition: {
          text: 'In quantum computing, a qubit or quantum bit is a basic unit of quantum information, the quantum version of the classical binary bit.',
        },
      }),
    ).toBe('A basic unit of quantum information.');
  });
});

describe('official W3C/WAI research provider', () => {
  it('extracts main instructional prose without navigation or scripts', () => {
    const text = extractWaiResearchText(`
      <nav>Navigation should not appear.</nav>
      <main>
        <h1>Accessible forms</h1>
        <p>Accessible forms are easier to use for everyone, including people with disabilities.</p>
        <script>window.bad = true;</script>
        <p>Labels identify the purpose of each form control.</p>
      </main>
    `);

    expect(text).toContain('Accessible forms are easier to use for everyone');
    expect(text).toContain('Labels identify the purpose of each form control.');
    expect(text).not.toContain('Navigation should not appear');
    expect(text).not.toContain('window.bad');
  });

  it('selects and attributes live WAI source pages by lesson topic', async () => {
    const requested = [];
    const provider = buildWaiProvider(async (url) => {
      requested.push(url);
      return `
        <main>
          <p>Accessible forms are interfaces that let people submit information without accessibility barriers.</p>
          <p>Accessible forms associate labels with controls so assistive technologies can identify each input.</p>
          <p>Accessible forms provide instructions and error feedback that help users complete required fields.</p>
        </main>
      `;
    });
    const records = await provider.searchArticles('accessible forms labels and validation', 3);

    expect(Object.keys(records)).toEqual(expect.arrayContaining(['Accessible forms', 'Labels']));
    expect(requested.every((url) => url.startsWith('https://www.w3.org/'))).toBe(true);
    expect(records['Accessible forms']).toMatchObject({
      providerId: 'w3c-wai',
      sourceKind: 'official accessibility standard and tutorial',
      license: 'W3C permissive license',
    });
  });

  it('keeps usable WAI pages when one catalog page rejects a browser fetch', async () => {
    const provider = buildWaiProvider(async (url) => {
      if (url.includes('/Understanding/conformance')) throw new TypeError('Failed to fetch');
      return `
        <main>
          <p>Web Content Accessibility Guidelines organize requirements for making web content accessible.</p>
          <p>WCAG conformance uses testable success criteria and defined levels.</p>
        </main>
      `;
    });
    const records = await provider.searchArticles('WCAG principles and conformance', 6);

    expect(records['Web Content Accessibility Guidelines']).toBeDefined();
    expect(records['Accessibility principles']).toBeDefined();
    expect(records['Understanding Conformance']).toBeUndefined();
  });

  it('routes accessibility testing and remediation lessons to official WAI evaluation guidance', async () => {
    const provider = buildWaiProvider(async () => '<main><p>Evaluation identifies accessibility problems.</p></main>');
    const titles = await provider.search('evidence-based accessibility testing and remediation', 5);

    expect(titles).toEqual(expect.arrayContaining(['Evaluating web accessibility', 'Easy Checks', 'WCAG-EM overview']));
  });

  it('keeps each official WAI source inside its lesson family', () => {
    expect(isWaiSourceFamilyAligned('WCAG principles and conformance', 'Understanding Conformance')).toBe(true);
    expect(isWaiSourceFamilyAligned('WCAG principles and conformance', 'Easy Checks')).toBe(false);
    expect(isWaiSourceFamilyAligned('semantic HTML and keyboard accessibility', 'Page structure')).toBe(true);
    expect(isWaiSourceFamilyAligned('semantic HTML and keyboard accessibility', 'Easy Checks')).toBe(false);
    expect(isWaiSourceFamilyAligned('accessible forms', 'Input validation')).toBe(true);
    expect(isWaiSourceFamilyAligned('accessible forms', 'Headings')).toBe(false);
    expect(isWaiSourceFamilyAligned('evidence-based accessibility testing and remediation', 'WCAG-EM overview')).toBe(
      true,
    );
    expect(
      isWaiSourceFamilyAligned('evidence-based accessibility testing and remediation', 'Accessibility principles'),
    ).toBe(false);
  });

  it('applies WAI lesson-family routing at the domain admission boundary', () => {
    const base = {
      courseContext: 'Digital Accessibility for Product Teams',
      extract:
        'Easy Checks supports accessibility evaluation with keyboard, headings, forms, and other preliminary checks.',
      definition: 'Accessibility assessment is a preliminary review of selected accessibility checks.',
      provider: 'w3c-wai',
    };
    expect(
      isResearchCandidateDomainAligned({
        ...base,
        topic: 'semantic HTML and keyboard accessibility',
        title: 'Easy Checks',
      }),
    ).toBe(false);
    expect(
      isResearchCandidateDomainAligned({
        ...base,
        topic: 'evidence-based accessibility testing and remediation',
        title: 'Easy Checks',
      }),
    ).toBe(true);
  });

  it('composes distinct evaluation concepts from official WAI guidance', async () => {
    const provider = buildWaiProvider(async (url) => {
      if (url.includes('wcag-em')) {
        return `<main>
          <p>WCAG Evaluation Methodology is a structured approach for evaluating conformance to Web Content Accessibility Guidelines.</p>
          <p>WCAG-EM defines the evaluation scope before a representative sample of pages is selected.</p>
          <p>Evaluators audit each selected page against the applicable WCAG success criteria.</p>
          <p>The methodology records findings so teams can prioritize remediation work.</p>
          <p>Evaluation reports state the tested scope, results, and evidence.</p>
        </main>`;
      }
      if (url.includes('preliminary')) {
        return `<main>
          <p>Accessibility assessment is a first review of selected accessibility checks.</p>
          <p>Easy Checks examines page titles, headings, contrast, keyboard focus, form labels, and alternatives.</p>
          <p>A page can pass preliminary checks and still contain significant accessibility barriers.</p>
          <p>More robust assessment is required for a comprehensive accessibility evaluation.</p>
          <p>Teams use the initial results to choose the next evaluation and remediation steps.</p>
        </main>`;
      }
      return `<main>
        <p>Accessibility evaluation is also called assessment, audit, and testing.</p>
        <p>Teams evaluate accessibility early and throughout design and development.</p>
        <p>No automated tool alone can determine whether a site meets accessibility standards.</p>
        <p>Knowledgeable human evaluation is required to determine whether a site is accessible.</p>
        <p>Evaluation findings help teams identify accessibility problems and plan repairs.</p>
      </main>`;
    });

    const topic = 'evidence-based accessibility testing and remediation';
    const result = await researchLessonKernelSets([topic], {
      provider,
      providerId: 'w3c-wai',
      courseContext: 'Digital Accessibility for Product Teams',
      want: 5,
      candidatesPerGroup: 7,
      maxTargetedFallbacks: 0,
    });
    const kernels = result.byTopic.get(topic) || [];

    expect(kernels.map((kernel) => kernel.term)).toEqual(
      expect.arrayContaining(['Accessibility evaluation', 'Accessibility assessment', 'WCAG Evaluation Methodology']),
    );
    expect(
      kernels.every((kernel) => kernel.provenance.sourceUrl.startsWith('https://www.w3.org/WAI/test-evaluate')),
    ).toBe(true);
  });
});

describe('entity filter (topic drift by page KIND)', () => {
  it('rejects a political party whose lead has lowercase adjectives before the noun', () => {
    // Admitted at 0.228 for "duties owed to workers" before this was fixed.
    expect(
      looksLikeEntity(
        "Workers' Party (Singapore)",
        "The Workers' Party (WP) is a major social democratic political party in Singapore and one of the oldest.",
      ),
    ).toBe(true);
  });

  it('rejects a dated parenthetical such as (2023 TV series)', () => {
    expect(looksLikeEntity('Jury Duty (2023 TV series)', 'Jury Duty is an American mockumentary comedy.')).toBe(true);
  });

  it('rejects biographies, the most dangerous case', () => {
    // A researcher's page is saturated with the topic's vocabulary, so it
    // OUTSCORES real concepts: "Sharon Oviatt" beat every genuine article for
    // "human-centered design foundations" and was admitted as a thing to teach.
    expect(
      looksLikeEntity(
        'Sharon Oviatt',
        'Sharon Oviatt is an American computer scientist known for multimodal interfaces.',
      ),
    ).toBe(true);
    expect(
      looksLikeEntity(
        'Klaus Krippendorff',
        'Klaus Krippendorff (born 1932) was a German-American communication scholar.',
      ),
    ).toBe(true);
    expect(
      looksLikeEntity(
        'Laura Wegener Parfrey',
        'Laura Wegener Parfrey is a Canadian bioscientist known for research on microbial diversity.',
      ),
    ).toBe(true);
  });

  it('rejects societies and institutes rather than teaching an organization as a concept', () => {
    expect(
      looksLikeEntity(
        'International Society for Microbial Ecology',
        'The International Society for Microbial Ecology is the principal scientific society for microbial ecologists.',
      ),
    ).toBe(true);
    expect(
      looksLikeEntity(
        'Aquatic Microbial Ecology',
        'Aquatic Microbial Ecology is a quarterly peer-reviewed scientific journal published for research communities.',
      ),
    ).toBe(true);
    expect(
      looksLikeEntity(
        'Bureau of Cyberspace and Digital Policy',
        'The Bureau of Cyberspace and Digital Policy is a bureau of the United States Department of State.',
      ),
    ).toBe(true);
  });

  it('does not mistake a concept for a person', () => {
    expect(
      looksLikeEntity('Interaction design', 'Interaction design is the practice of designing interactive products.'),
    ).toBe(false);
    expect(looksLikeEntity('Ergonomics', 'Ergonomics is the study of efficiency in a working environment.')).toBe(
      false,
    );
  });

  it('keeps genuine concept pages', () => {
    expect(
      looksLikeEntity(
        'Whistleblowing',
        'Whistleblowing is the activity of a person who reports wrongdoing to an authority.',
      ),
    ).toBe(false);
    expect(
      looksLikeEntity('Stakeholder theory', 'The stakeholder theory is a theory of organizational management.'),
    ).toBe(false);
  });
});

describe('course-domain research alignment', () => {
  it('routes ambiguous database lessons to canonical DBMS source families', () => {
    expect(directResearchTitles('Transaction Management and Concurrency Control', 'Database Systems')).toEqual(
      expect.arrayContaining(['Database transaction', 'ACID', 'Concurrency control']),
    );
    expect(directResearchTitles('Transaction Management and Concurrency Control', 'Database Systems')).not.toContain(
      'Business transaction management',
    );
    expect(directResearchTitles('Database Normalization Theory', 'Database Systems')).toEqual(
      expect.arrayContaining(['Database normalization', 'Functional dependency', 'First normal form']),
    );
    const securityTitles = directResearchTitles('Database Security and Integrity', 'Database Systems');
    expect(securityTitles).toEqual(
      expect.arrayContaining([
        'Data integrity',
        'Database activity monitoring',
        'Access-control list',
        'Role-based access control',
      ]),
    );
    expect(securityTitles).not.toContain('Integrity');
  });

  it('routes programming and data-analysis lessons to canonical concept families', () => {
    const context =
      'Applied Civic Data Analysis · Python data types · Conditional branching · Functions and automated tests · Pandas cleaning';
    expect(directResearchTitles('Python data types and expressions', context)).toEqual(
      expect.arrayContaining(['Data type', 'Expression (computer science)', 'Python (programming language)']),
    );
    expect(directResearchTitles('Conditional branching and loops', context)).toEqual(
      expect.arrayContaining(['Control flow', 'Conditional (computer programming)', 'For loop']),
    );
    expect(directResearchTitles('Functions and automated tests', context)).toEqual(
      expect.arrayContaining(['Function (computer programming)', 'Unit testing']),
    );
    expect(directResearchTitles('Pandas tabular data cleaning', context)).toEqual(
      expect.arrayContaining(['Data cleansing', 'Data frame', 'Pandas (software)']),
    );
    expect(directResearchTitles('Reproducible visualization and uncertainty', context)).toEqual(
      expect.arrayContaining(['Reproducibility', 'Data visualization', 'Uncertainty quantification']),
    );
  });

  it('routes oral-history methods to interview, transcript, analysis, and public-history sources', () => {
    expect(directResearchTitles('Developing Open-Ended Questions', 'Community Oral History Methods')).toEqual(
      expect.arrayContaining(['Open-ended question', 'Interview (research)', 'Semi-structured interview']),
    );
    expect(directResearchTitles('Audio Recording Protocols', 'Community Oral History Methods')).toEqual(
      expect.arrayContaining([
        'Sound recording and reproduction',
        'Transcription (linguistics)',
        'Digital preservation',
      ]),
    );
    expect(directResearchTitles('Thematic Coding of Transcripts', 'Community Oral History Methods')).toEqual(
      expect.arrayContaining(['Thematic analysis', 'Coding (social sciences)', 'Content analysis']),
    );
    expect(directResearchTitles('Visual Storytelling in Presentation', 'Community Oral History Methods')).toEqual(
      expect.arrayContaining(['Visual narrative', 'Visual communication', 'Digital storytelling', 'Presentation']),
    );
  });

  it('rejects the architecture meaning of evidence-based design in a UX course', () => {
    expect(
      isResearchCandidateDomainAligned({
        topic: 'evidence-based design recommendations',
        courseContext: 'User Experience Research Studio',
        title: 'Evidence-based design',
        extract:
          'Evidence-based design is the process of constructing a building or physical environment based on scientific research.',
        provider: 'wikipedia',
      }),
    ).toBe(false);
  });

  it('accepts contextual inquiry and user-research evidence for the same UX course', () => {
    expect(
      isResearchCandidateDomainAligned({
        topic: 'contextual inquiry and field notes',
        courseContext: 'User Experience Research Studio',
        title: 'Contextual inquiry',
        extract:
          'Contextual inquiry is a user-centered design research method that observes and interviews people in context.',
        provider: 'wikipedia',
      }),
    ).toBe(true);
    expect(
      isResearchCandidateDomainAligned({
        topic: 'evidence-based design recommendations',
        courseContext: 'User Experience Research Studio',
        title: 'Design rationale',
        extract:
          'A design rationale records the reasons behind a design decision and connects the decision to user research evidence.',
        provider: 'wikipedia',
      }),
    ).toBe(true);
  });

  it('rejects an environmental false friend from a technology-policy course', () => {
    expect(
      isResearchCandidateDomainAligned({
        topic: 'AI governance',
        courseContext: 'Current Technology Policy',
        title: 'Strategies for emerging pollutant governance using artificial intelligence technology',
        extract:
          'Artificial intelligence is becoming a tool for pollutant screening, wastewater management, and environmental health risk assessment.',
        provider: 'doaj',
      }),
    ).toBe(false);
    expect(
      isResearchCandidateDomainAligned({
        topic: 'AI governance',
        courseContext: 'Current Technology Policy',
        title: 'Governance of artificial intelligence',
        extract:
          'Governance of artificial intelligence develops rules and institutions for accountability, oversight, and regulation.',
        provider: 'wikipedia',
      }),
    ).toBe(true);
  });

  it('rejects enterprise BTM from a database transaction lesson', () => {
    expect(
      isResearchCandidateDomainAligned({
        topic: 'Transaction Management and Concurrency Control',
        courseContext: 'Database Systems',
        title: 'Business transaction management',
        extract:
          'Business transaction management is a category of application performance management for monitoring business transactions across enterprise systems.',
        provider: 'wikipedia',
      }),
    ).toBe(false);
    expect(
      isResearchCandidateDomainAligned({
        topic: 'Transaction Management and Concurrency Control',
        courseContext: 'Database Systems',
        title: 'Database transaction',
        extract:
          'A database transaction is a unit of work in a database management system that follows atomicity, consistency, isolation, and durability.',
        provider: 'wikipedia',
      }),
    ).toBe(true);
  });

  it('rejects moral integrity but retains data integrity for a database security lesson', () => {
    const lesson = {
      topic: 'Database Security and Integrity',
      courseContext: 'Database Systems',
      provider: 'wikipedia',
    };
    expect(
      isResearchCandidateDomainAligned({
        ...lesson,
        title: 'Integrity',
        extract: 'Integrity is the quality of being honest and adhering to strong moral and ethical principles.',
        definition: 'Integrity is the quality of being honest and adhering to strong moral and ethical principles.',
      }),
    ).toBe(false);
    expect(
      isResearchCandidateDomainAligned({
        ...lesson,
        title: 'Data integrity',
        extract:
          'Data integrity is the maintenance and assurance of data accuracy and consistency over its life-cycle in systems that store, process, or retrieve data.',
        definition:
          'Data integrity is the maintenance and assurance of data accuracy and consistency over its life-cycle.',
      }),
    ).toBe(true);
  });

  it('rejects unrelated data-analysis papers from an oral-history lesson', () => {
    const lesson = {
      topic: 'Thematic Coding of Transcripts',
      courseContext: 'Community Oral History Methods',
      provider: 'doaj',
    };
    expect(
      isResearchCandidateDomainAligned({
        ...lesson,
        title: 'Where Does Wastewater-Based Epidemiology Fall in Medical Student Education?',
        extract: 'This article studies wastewater-based epidemiology and its place in medical student education.',
      }),
    ).toBe(false);
    expect(
      isResearchCandidateDomainAligned({
        ...lesson,
        title: 'Thematic analysis',
        extract:
          'Thematic analysis is a method of analysing qualitative data such as interview transcripts by identifying patterns of meaning.',
      }),
    ).toBe(true);
  });

  it('rejects wrong-domain biology from a digital-accessibility lesson', () => {
    expect(
      isResearchCandidateDomainAligned({
        topic: 'accessible forms',
        courseContext: 'Digital Accessibility for Product Teams',
        title: 'Cellular respiration',
        extract:
          'Cellular respiration is a set of metabolic reactions that convert biochemical energy into adenosine triphosphate.',
        provider: 'wikipedia',
      }),
    ).toBe(false);
    expect(
      isResearchCandidateDomainAligned({
        topic: 'accessible forms',
        courseContext: 'Digital Accessibility for Product Teams',
        title: 'Form (HTML)',
        extract:
          'An HTML form lets a web user enter data through labelled controls, and accessible forms expose those controls to assistive technology.',
        provider: 'wikipedia',
      }),
    ).toBe(true);
  });
});

describe('teaching atoms from the source (gap 3)', () => {
  const sentences = [
    'Weather is the state of the atmosphere at a given time and place over short periods.',
    'Weather is not to be confused with climate, which describes conditions averaged over decades.',
    'Extreme weather events, for example hurricanes and blizzards, cause the greatest damage.',
    'Weather is driven by differences in air pressure, temperature and moisture between one place and another.',
    'Weather occurs primarily in the troposphere because that is where nearly all atmospheric water resides.',
    'Forecasting requires measurements of the current state because the atmosphere is a chaotic system.',
  ];

  it("reads the source's own contrast as a misconception", () => {
    expect(contrastSentences(sentences)).toHaveLength(1);
  });

  it('mines distractors from what the source says it is confused with', () => {
    expect(distractorsFromContrast(contrastSentences(sentences), 'Weather')).toContain('climate');
  });

  it('carries a verbatim quote on every atom so admission can verify it', () => {
    const built = buildKernelFromArticle({
      topic: 'weather basics',
      title: 'Weather',
      extract: sentences.join('\n'),
      provider,
    });
    expect(built).not.toBeNull();
    const snapshot = built.snapshot['wikipedia:Weather'];
    expect(snapshot).toContain(built.kernel.definition.anchor.quote);
    for (const fact of built.kernel.facts) expect(snapshot).toContain(fact.anchor.quote);
  });

  it('uses a distinct source-boundary correction when the source states no misconception', () => {
    const built = buildKernelFromArticle({
      topic: 'accessible forms',
      title: 'Web accessibility',
      extract: [
        'Web accessibility is the inclusive practice of removing barriers that prevent people with disabilities from using websites.',
        'Accessible forms associate each visible label with the corresponding form control.',
        'Form instructions help users understand the information each control requires.',
      ].join('\n'),
      provider,
    });

    expect(built.kernel.misconceptions[0]).toEqual({
      text: 'Naming Web accessibility without identifying a supporting source detail is sufficient evidence.',
      corrective: expect.stringMatching(/^Web accessibility:/),
    });
    expect(built.kernel.misconceptions[0].corrective).not.toContain('Cite the specific definition or fact');
    expect(built.kernel.misconceptions[0].corrective).not.toBe(built.kernel.definition.text);
  });

  it('rejects code-sample notes, publication road maps, and sweeping compliance predictions from accessibility facts', () => {
    const built = buildKernelFromArticle({
      topic: 'accessible forms',
      title: 'Web accessibility',
      extract: [
        'Web accessibility is the inclusive practice of removing barriers that prevent people with disabilities from using websites.',
        'Accessible forms associate each visible label with the corresponding form control.',
        'Form instructions help users understand the information each control requires.',
        'Note that interactive elements are still active when using this code.',
        'A future update will provide a Quick Reference for this page.',
        'The WCAG 2.2 Quick Reference will provide a way to group criteria.',
        "W3C's Techniques for WCAG 2.0 lists techniques that help authors.",
        'There are 12 guidelines and 65 testable success criteria.',
        'All websites will need to adhere to these requirements.',
      ].join('\n'),
      provider,
    });

    const visibleKnowledge = [built.kernel.definition.text, ...built.kernel.facts.map((fact) => fact.text)].join(' ');
    expect(visibleKnowledge).toContain(
      'Form instructions help users understand the information each control requires.',
    );
    expect(visibleKnowledge).not.toMatch(
      /Note that|Quick Reference|WCAG 2\.[01]|12 guidelines|All websites will need/i,
    );
  });

  it('rejects historical and decontextualized facts from a current WCAG principles lesson', () => {
    const built = buildKernelFromArticle({
      topic: 'WCAG principles',
      title: 'Web Content Accessibility Guidelines (WCAG) 2.2',
      extract: [
        'Web Content Accessibility Guidelines (WCAG) 2.2 covers a wide range of recommendations for making web content more accessible.',
        'The guidelines are organized under four principles: perceivable, operable, understandable, and robust.',
        'WCAG conformance is defined at levels A, AA, and AAA.',
        'WCAG 2.1 is backwards-compatible with WCAG 2.0.',
        'WCAG 2.0 consists of 12 guidelines.',
        'This avoids the need to change the section number of success criteria from WCAG 2.',
        'Then only the initial positions of user-movable content are considered for testing and conformance of this success criterion.',
        'User agents - software that people use to access web content.',
        'Authoring tools - software or services that people use to produce web content.',
        'Web content - information and sensory experience communicated to the user.',
        'satisfies all the Level A success criteria, or a conforming alternate version is provided.',
        'A Level AAA conforming alternate version is provided.',
        'Accessibility policies are listed in WAI Resources.',
      ].join('\n'),
      provider,
    });

    const visibleKnowledge = [built.kernel.definition.text, ...built.kernel.facts.map((fact) => fact.text)].join(' ');
    expect(visibleKnowledge).toContain(
      'The guidelines are organized under four principles: perceivable, operable, understandable, and robust.',
    );
    expect(visibleKnowledge).toContain('WCAG conformance is defined at levels A, AA, and AAA.');
    expect(visibleKnowledge).not.toMatch(
      /WCAG 2(?:\.[01])?|12 guidelines|initial positions|User agents|Authoring tools|Web content -|satisfies all|alternate version|Accessibility policies/i,
    );
  });

  it('keeps robust-content facts focused on compatibility rather than neighboring principle sections', () => {
    const built = buildKernelFromArticle({
      topic: 'WCAG principles',
      title: 'Accessibility principles',
      extract: [
        'Robust content is compatible with different browsers, assistive technologies, and other user agents.',
        'Standards-based markup helps current and future user agents interpret the content reliably.',
        'Meeting this requirement makes the content easier to use across a wide range of devices.',
        'Flashing content is ideally avoided entirely or only used in a way that does not cause known risks.',
        'People using assistive technologies may observe interference from prominent audio or visual content in the background.',
      ].join('\n'),
      provider,
      sourceMeta: { suggestedTerm: 'Robust content' },
    });

    const visibleKnowledge = [built.kernel.definition.text, ...built.kernel.facts.map((fact) => fact.text)].join(' ');
    expect(visibleKnowledge).toContain('Standards-based markup');
    expect(visibleKnowledge).not.toMatch(/Flashing content|prominent audio or visual content/i);
  });

  it('keeps a concise source with one explanatory fact for course-level composition', () => {
    const built = buildKernelFromArticle({
      topic: 'waterborne pathogens',
      title: 'Waterborne disease',
      extract: [
        'Waterborne diseases are conditions caused by pathogenic microorganisms transmitted in contaminated water.',
        'Transmission can occur when people drink, prepare food with, or bathe in contaminated water supplies.',
      ].join('\n'),
      provider,
    });
    expect(built).not.toBeNull();
    expect(built.kernel.facts).toHaveLength(1);
  });

  it('does not promote an unrelated sentence from a long canonical article', () => {
    const built = buildKernelFromArticle({
      topic: 'semantic HTML and keyboard accessibility',
      title: 'Semantic HTML',
      extract: [
        'Semantic HTML is the use of HTML markup to reinforce the meaning of information in web pages.',
        'Semantic HTML helps user agents and assistive technologies interpret page structure.',
        'HTML headings and landmarks expose navigable structure to keyboard and screen-reader users.',
        'A means of marking-up any arbitrary section of HTML would require a mechanism independent of the markup structure itself, such as XPointer.',
        'Mashups and price comparison websites may be coming close.',
      ].join('\n'),
      provider,
    });
    expect(built).not.toBeNull();
    const facts = built.kernel.facts.map((fact) => fact.text).join(' ');
    expect(facts).not.toContain('Mashups and price comparison websites');
    expect(facts).not.toMatch(/XPointer|arbitrary section of HTML/i);
  });

  it('keeps standards-specific WCAG facts that use a conformance label instead of repeating the acronym', () => {
    const built = buildKernelFromArticle({
      topic: 'WCAG principles and conformance',
      title: 'Web Content Accessibility Guidelines',
      extract: [
        'Web Content Accessibility Guidelines are recommendations for making web content more accessible.',
        'The guidelines organize accessibility around perceivable, operable, understandable, and robust principles.',
        'Level AA is the conformance target adopted by many organizations for web content.',
        'Success criteria provide testable statements for evaluating a page.',
        'A sports league changed its schedule after a rain delay.',
      ].join('\n'),
      provider,
    });
    expect(built).not.toBeNull();
    const facts = built.kernel.facts.map((fact) => fact.text).join(' ');
    expect(facts).toContain('Level AA');
    expect(facts).toContain('Success criteria');
    expect(facts).not.toContain('sports league');
  });

  it('ranks the standard’s teachable structure ahead of a long adoption history', () => {
    const built = buildKernelFromArticle({
      topic: 'WCAG principles and conformance',
      title: 'Web Content Accessibility Guidelines',
      extract: [
        'Web Content Accessibility Guidelines are recommendations for making web content more accessible.',
        'A ministry published regulations requiring websites to comply with the Web Content Accessibility Guidelines.',
        'A government rule adopted the Web Content Accessibility Guidelines for public mobile applications.',
        'A directive requires public bodies to use the Web Content Accessibility Guidelines.',
        'Several jurisdictions built legislation around the Web Content Accessibility Guidelines.',
        'An accessibility act requires organizations to use the Web Content Accessibility Guidelines.',
        'The guidelines are organized under four principles: perceivable, operable, understandable, and robust.',
        'Each guideline has testable success criteria for evaluating conformance.',
        'WCAG uses three levels of conformance: Level A, Level AA, and Level AAA.',
      ].join('\n'),
      provider,
      factCount: 5,
    });

    const facts = built.kernel.facts.map((fact) => fact.text).join(' ');
    expect(facts).toContain('perceivable, operable, understandable, and robust');
    expect(facts).toContain('testable success criteria');
    expect(facts).toContain('three levels of conformance');
  });

  it('prefers an exact compact lesson phrase visibly anchored in a scholarly title', () => {
    const built = buildKernelFromArticle({
      topic: 'intervention design',
      title: 'Applying behavior change theory to intervention design in primary care',
      extract: [
        'Intervention design applies behavior change theory to a clinic-based program in primary care.',
        'Intervention design uses stakeholder interviews to identify knowledge gaps and missing implementation resources.',
        'Intervention design includes team training and a structured implementation checklist.',
        'Intervention design compares the implementation plan with observed clinic workflow constraints.',
        'Intervention design evaluation records whether each component reaches its intended primary care team.',
      ].join('\n'),
      provider,
      sourceMeta: {
        suggestedTerm: 'Applying behavior change theory to intervention design in primary care',
        definitionMode: 'scholarly-abstract',
      },
    });

    expect(built.kernel.term).toBe('intervention design');
  });

  it('preserves a compact topic-relevant source concept instead of collapsing every article to the lesson title', () => {
    const built = buildKernelFromArticle({
      topic: 'bioremediation',
      title: 'Phytoremediation approaches to bioremediation of contaminated water',
      extract: [
        'Phytoremediation is the use of plants and associated microorganisms to remove or contain environmental contaminants.',
        'Phytoremediation can treat contaminated soil, sediment, and water at or near the affected site.',
        'Plant selection depends on the contaminant, climate, root depth, and intended removal mechanism.',
        'Field monitoring compares contaminant concentrations before and after the treatment period.',
      ].join('\n'),
      provider,
      sourceMeta: {
        suggestedTerm: 'Phytoremediation',
        definitionMode: 'scholarly-abstract',
      },
    });

    expect(built.kernel.term).toBe('Phytoremediation');
  });

  it('recognizes encompasses as a source-authored definitional verb', () => {
    const built = buildKernelFromArticle({
      topic: 'platform governance',
      title: 'Platform economy',
      extract: [
        'The platform economy encompasses economic and social activities facilitated by digital platforms.',
        'The platform economy has experienced rapid growth and disrupted established business models.',
        'Platform businesses rely on network effects as more users join.',
        'Regulators examine platform market concentration, worker protection, and tax obligations.',
      ].join('\n'),
      provider,
      sourceMeta: {
        suggestedTerm: 'Platform economy',
      },
    });

    expect(built.kernel.term).toBe('Platform economy');
    expect(built.kernel.definition.text).toContain('encompasses economic and social activities');
  });
});

describe('relevance scoring', () => {
  it('takes the weaker of title and definition so a right-definition/wrong-subject page loses', () => {
    // "truth-telling in the marketplace" -> "Lie": the definition of lying is
    // about truth-telling, so definition-only scoring could not see the drift.
    expect(Math.min(0.2, 0.9)).toBeLessThan(RELEVANCE_FLOOR + 0.1);
  });

  it('cosine of a unit vector with itself is 1', () => {
    expect(cosine([0, 1, 0], [0, 1, 0])).toBeCloseTo(1);
  });

  it('normalizes non-unit embeddings before applying semantic floors', () => {
    expect(cosine([0, 2], [0, 5])).toBeCloseTo(1);
    expect(cosine([2, 0], [0, 7])).toBeCloseTo(0);
  });

  it('lexical relevance ignores pedagogical filler words', () => {
    expect(lexicalRelevance('introduction to photosynthesis', 'Photosynthesis')).toBeGreaterThan(0.5);
  });

  it('normalizes scientific morphology used by environmental microbiology sources', () => {
    expect(lexicalRelevance('microbial risk', 'microbiological risk')).toBe(1);
    expect(lexicalRelevance('bioremediation', 'phytoremediation')).toBe(1);
    expect(lexicalRelevance('pathogens', 'pathogenic microorganisms')).toBeGreaterThan(0);
  });

  it('normalizes governance morphology across lesson titles and source prose', () => {
    expect(lexicalRelevance('platform governance', 'Platforms are governed by shared rules')).toBe(1);
  });

  it('tries canonical phrase windows for a three-word pedagogical topic', () => {
    expect(directResearchTitles('Microbial risk assessment', 'Environmental Microbiology')).toEqual(
      expect.arrayContaining(['Microbial risk assessment', 'Microbial risk', 'risk assessment']),
    );
    expect(directResearchTitles('Waterborne pathogens', 'Environmental Microbiology')).toEqual(
      expect.arrayContaining(['Waterborne disease', 'Waterborne diseases', 'Pathogenic bacteria', 'Water pollution']),
    );
    expect(directResearchTitles('Biofilms', 'Environmental Microbiology')).toEqual(
      expect.arrayContaining([
        'Biofilm',
        'Biofilm matrix',
        'Microbial mat',
        'Phototrophic biofilm',
        'Extracellular polymeric substance',
      ]),
    );
    expect(directResearchTitles('Bioremediation', 'Environmental Microbiology')).toEqual(
      expect.arrayContaining(['Bioremediation', 'Phytoremediation', 'Mycoremediation', 'Biodegradation']),
    );
    expect(directResearchTitles('Contextual inquiry and field notes', 'User Experience Research Studio')).toEqual(
      expect.arrayContaining(['Contextual inquiry', 'Fieldnotes', 'Field research']),
    );
    expect(directResearchTitles('AI governance: in practice', 'Current Technology Policy')).toEqual(
      expect.arrayContaining([
        'AI governance',
        'Governance of artificial intelligence',
        'Regulation of artificial intelligence',
      ]),
    );
    expect(directResearchTitles('Privacy regulation', 'Current Technology Policy')).toEqual(
      expect.arrayContaining(['Information privacy law', 'Privacy law', 'Data protection']),
    );
    expect(directResearchTitles('Algorithmic audits', 'Current Technology Policy')).toEqual(
      expect.arrayContaining(['Algorithmic accountability', 'Algorithmic bias', 'Algorithmic transparency']),
    );
    expect(directResearchTitles('WCAG principles', 'Digital Accessibility for Product Teams')).toEqual(
      expect.arrayContaining(['Web Content Accessibility Guidelines', 'Web accessibility']),
    );
    expect(directResearchTitles('semantic HTML', 'Digital Accessibility for Product Teams')).toEqual(
      expect.arrayContaining(['Semantic HTML', 'HTML', 'WAI-ARIA']),
    );
    expect(directResearchTitles('accessible forms', 'Digital Accessibility for Product Teams')).toEqual(
      expect.arrayContaining(['Form (HTML)', 'Web accessibility', 'Web Accessibility Initiative']),
    );
  });

  it('expands the exact frozen comparison topics into canonical source concepts', () => {
    expect(directResearchTitles('duties to workers', 'Business Ethics and Responsible Decision-Making')).toEqual(
      expect.arrayContaining(["Workers' rights", 'Labour law', 'Occupational safety and health']),
    );
    expect(
      directResearchTitles('accountable case recommendations', 'Business Ethics and Responsible Decision-Making'),
    ).toEqual(expect.arrayContaining(['Business ethics', 'Stakeholder theory', 'Accountability']));
    expect(directResearchTitles('intervention design', 'Public Health Program Planning')).toEqual(
      expect.arrayContaining(['Logic model', 'Theory of change', 'Program evaluation']),
    );
    expect(directResearchTitles('implementation barriers', 'Public Health Program Planning')).toEqual(
      expect.arrayContaining(['Implementation science', 'Policy implementation', 'Implementation research']),
    );
    expect(directResearchTitles('evaluation metrics', 'Public Health Program Planning')).toEqual(
      expect.arrayContaining(['Program evaluation', 'Performance indicator', 'Outcome measure']),
    );
    expect(directResearchTitles('current artificial-intelligence regulation', 'Current Technology Policy')).toEqual(
      expect.arrayContaining(['Governance of artificial intelligence', 'Regulation of artificial intelligence']),
    );
    expect(directResearchTitles('platform governance', 'Current Technology Policy')).toEqual(
      expect.arrayContaining(['Internet governance', 'Platform economy', 'Content moderation']),
    );
    expect(directResearchTitles('privacy and data protection', 'Current Technology Policy')).toEqual(
      expect.arrayContaining(['Information privacy law', 'Privacy law', 'Data protection']),
    );
    expect(directResearchTitles('algorithmic accountability standards', 'Current Technology Policy')).toEqual(
      expect.arrayContaining(['Algorithmic accountability', 'Algorithmic bias', 'Algorithmic transparency']),
    );
    expect(directResearchTitles('evidence-based policy recommendations', 'Current Technology Policy')).toEqual(
      expect.arrayContaining(['Public policy', 'Policy analysis', 'Regulatory impact analysis']),
    );
  });

  it('searches both named sides of a compound topic in one request', () => {
    expect(researchQueryForTopic('Qubits and quantum states')).toBe('"Qubits" OR "quantum states"');
    expect(researchQueryForTopic('Superposition and measurement', 'Introduction to Quantum Computing')).toBe(
      'quantum ("Superposition" OR "measurement")',
    );
    expect(researchQueryForTopic('Quantum algorithms')).toBe('Quantum algorithms');
  });
});

describe('researchConcept', () => {
  it('returns nothing rather than a wrong article when every candidate is an entity page', async () => {
    // Thick enough to extract cleanly: the point is that it is rejected for
    // being the wrong KIND of page, not for being unparseable.
    const pages = {
      'Jury Duty (2023 TV series)': {
        hits: ['jury', 'deliberation'],
        text: [
          'Jury Duty is an American mockumentary comedy television series about a staged trial.',
          'The series follows a jury in which every participant except one is a paid actor.',
          'Jury Duty was released in 2023 and received praise for the sincerity of its lead.',
          'The production required improvisation because the outcome depended on one unaware juror.',
        ].join('\n'),
      },
    };
    const result = await researchConcept('closing case deliberation', { provider: stubProvider(pages) });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('only-entity-pages');
  });

  it('admits a relevant concept page at source-anchored tier', async () => {
    const text = [
      'Whistleblowing is the activity of a person who reports wrongdoing by an organisation to an authority.',
      'Whistleblowing is not to be confused with an internal grievance, which stays inside the organisation.',
      'Whistleblowers are protected by statute in many jurisdictions because disclosure serves the public interest.',
      'Retaliation against a whistleblower is unlawful when the disclosure concerns a legal violation.',
    ].join('\n');
    const result = await researchConcept('whistleblowing', {
      provider: stubProvider({ Whistleblowing: { hits: ['whistleblowing'], text } }),
    });
    expect(result.ok).toBe(true);
    expect(result.tier).toBeGreaterThanOrEqual(2);
    expect(result.kernel.facts.length).toBeGreaterThanOrEqual(2);
    expect(result.kernel.provenance).toMatchObject({
      origin: 'algi-research',
      title: 'Whistleblowing',
    });
  });
});

describe('the research flag is opt-in', () => {
  it('stays offline unless explicitly enabled', async () => {
    const { buildResearchProvider, ALGI_RESEARCH_FLAG } = await import('../../algiComposer.js');
    const store = (value) => ({ getItem: (key) => (key === ALGI_RESEARCH_FLAG ? value : null) });
    expect(buildResearchProvider({ storage: store(null) })).toBeNull();
    expect(buildResearchProvider({ storage: store('off') })).toBeNull();
    // Absent storage must not be read as consent.
    expect(buildResearchProvider({ storage: undefined })).toBeNull();
    expect(buildResearchProvider({ storage: store('on') })).not.toBeNull();
  });

  it('governs the shared reading backbone as well as Wikipedia research', async () => {
    const { allowExternalKnowledgeLookups, ALGI_RESEARCH_FLAG } = await import('../../algiResearchPolicy.js');
    const store = (value) => ({ getItem: (key) => (key === ALGI_RESEARCH_FLAG ? value : null) });
    expect(allowExternalKnowledgeLookups({ algiRoute: true, storage: store(null) })).toBe(false);
    expect(allowExternalKnowledgeLookups({ algiRoute: true, storage: store('on') })).toBe(true);
    expect(allowExternalKnowledgeLookups({ algiRoute: false, storage: store(null) })).toBe(true);
  });

  it('deduplicates requests, enforces a course budget, and propagates cancellation', async () => {
    const { buildResearchProvider, ALGI_RESEARCH_FLAG } = await import('../../algiComposer.js');
    const storage = { getItem: (key) => (key === ALGI_RESEARCH_FLAG ? 'on' : null) };
    const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) });
    const bounded = buildResearchProvider({ storage, fetchImpl, gapMs: 0, maxRequests: 1 });
    await expect(bounded.httpJson('https://example.test/a')).resolves.toEqual({ ok: true });
    await expect(bounded.httpJson('https://example.test/a')).resolves.toEqual({ ok: true });
    await expect(bounded.httpJson('https://example.test/b')).rejects.toThrow('algi-research-budget-exhausted:1');
    expect(bounded.diagnostics()).toMatchObject({ requestCount: 1, cachedRequestCount: 1 });

    const controller = new AbortController();
    const stalled = buildResearchProvider({
      storage,
      signal: controller.signal,
      gapMs: 0,
      fetchImpl: (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        }),
    });
    const request = stalled.httpJson('https://example.test/stalled');
    controller.abort(Object.assign(new Error('stop-now'), { name: 'AbortError' }));
    await expect(request).rejects.toThrow('stop-now');
  });

  it('recovers one temporary 429 inside the bounded request budget', async () => {
    const { buildResearchProvider, ALGI_RESEARCH_FLAG } = await import('../../algiComposer.js');
    const storage = { getItem: (key) => (key === ALGI_RESEARCH_FLAG ? 'on' : null) };
    let calls = 0;
    const recovered = buildResearchProvider({
      storage,
      gapMs: 0,
      maxRequests: 2,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return { ok: false, status: 429, headers: { get: () => '0' } };
        }
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ recovered: true }) };
      },
    });
    await expect(recovered.httpJson('https://example.test/rate-limited')).resolves.toEqual({ recovered: true });
    expect(recovered.diagnostics()).toMatchObject({ requestCount: 2, maxRequests: 2 });
  });
});

describe('Wikipedia request architecture', () => {
  it('retrieves all candidate articles in one attributed batch', async () => {
    const httpJson = async (url) => {
      expect(url).toContain('titles=Photosynthesis%7CCellular%20respiration');
      expect(url).toContain('exlimit=max');
      expect(url).toContain('exintro=1');
      return {
        query: {
          pages: {
            1: {
              title: 'Photosynthesis',
              extract: 'Photosynthesis is a source passage with enough explanatory detail for a lesson.',
              fullurl: 'https://en.wikipedia.org/wiki/Photosynthesis',
              revisions: [{ revid: 101, timestamp: '2026-07-01T00:00:00Z' }],
            },
            2: {
              title: 'Cellular respiration',
              extract: 'Cellular respiration is a source passage with enough explanatory detail for a lesson.',
              fullurl: 'https://en.wikipedia.org/wiki/Cellular_respiration',
              revisions: [{ revid: 202, timestamp: '2026-07-02T00:00:00Z' }],
            },
          },
        },
      };
    };
    const providerWithBatch = buildWikipediaProvider(httpJson);
    const records = await providerWithBatch.articles(['Photosynthesis', 'Cellular respiration']);

    expect(Object.keys(records)).toEqual(['Photosynthesis', 'Cellular respiration']);
    expect(records.Photosynthesis).toMatchObject({
      sourceUrl: 'https://en.wikipedia.org/wiki/Photosynthesis',
      revisionId: 101,
      revisionTimestamp: '2026-07-01T00:00:00Z',
    });
    expect(providerWithBatch.attributionFor('Photosynthesis')).toContain('Wikipedia contributors');
  });

  it('retrieves one selected page as a full extract after intro ranking', async () => {
    const httpJson = async (url) => {
      expect(url).toContain('titles=Semantic%20HTML');
      expect(url).not.toContain('exintro=1');
      expect(url).not.toContain('exlimit=max');
      return {
        query: {
          pages: {
            3: {
              title: 'Semantic HTML',
              extract: 'Semantic HTML is the use of markup to express meaning. '.repeat(20),
              fullurl: 'https://en.wikipedia.org/wiki/Semantic_HTML',
              revisions: [{ revid: 303, timestamp: '2026-07-03T00:00:00Z' }],
            },
          },
        },
      };
    };
    const providerWithFullExtract = buildWikipediaProvider(httpJson);
    const record = await providerWithFullExtract.fullArticle('Semantic HTML');
    expect(record).toMatchObject({
      title: 'Semantic HTML',
      revisionId: 303,
      sourceUrl: 'https://en.wikipedia.org/wiki/Semantic_HTML',
    });
    expect(record.extract.length).toBeGreaterThan(500);
  });
});

describe('open scholarly provider architecture', () => {
  it('normalizes DOAJ CC0 article metadata into source-specific records', async () => {
    const providerWithMetadata = buildDoajProvider(async (url) => {
      expect(url).toContain('doaj.org/api/search/articles/');
      return {
        results: [
          {
            id: 'article-1',
            last_updated: '2026-07-20T00:00:00Z',
            bibjson: {
              title: 'Biofilm removal in water systems',
              abstract:
                'Biofilm is a community of microorganisms attached to a surface. Biofilm removal requires evidence about attachment, flow, and treatment conditions. The study compares two removal methods under controlled water-system conditions.',
              year: '2026',
              keywords: ['biofilm', 'water systems'],
              author: [{ name: 'A. Researcher' }],
              identifier: [{ type: 'doi', id: '10.1000/example' }],
              link: [{ type: 'fulltext', url: 'https://example.org/open-article' }],
            },
          },
        ],
      };
    });

    const records = await providerWithMetadata.searchArticles('biofilm', 5);
    expect(records['Biofilm removal in water systems']).toMatchObject({
      providerId: 'doaj',
      sourceKind: 'open scholarly article',
      sourceId: 'doaj:article-1',
      sourceUrl: 'https://example.org/open-article',
      license: 'CC0 1.0 (DOAJ article metadata)',
      suggestedTerm: 'biofilm',
      definitionMode: 'scholarly-abstract',
    });
    expect(records['Biofilm removal in water systems'].attribution).toContain('A. Researcher (2026)');
  });

  it('admits only explicitly licensed open Europe PMC abstracts', async () => {
    const providerWithMetadata = buildEuropePmcProvider(async (url) => {
      expect(url).toContain('europepmc/webservices/rest/search');
      expect(decodeURIComponent(url)).toContain('OPEN_ACCESS:Y');
      return {
        resultList: {
          result: [
            {
              id: '41976490',
              pmcid: 'PMC13074090',
              title: 'A Review of Quantitative Microbial Risk Assessment.',
              abstractText:
                'Quantitative microbial risk assessment is a framework for evaluating microbial hazards. Exposure assessment measures contact with a hazard because dose shapes the probability of harm. Risk characterization combines evidence and uncertainty into one bounded estimate.',
              license: 'cc by',
              isOpenAccess: 'Y',
              authorString: 'A. Researcher, B. Reviewer',
              pubYear: '2026',
              journalTitle: 'Open Microbiology',
              keywordList: {
                keyword: ['Quantitative Microbial Risk Assessment', 'Exposure assessment'],
              },
            },
            {
              id: 'closed-1',
              title: 'Closed microbial evidence.',
              abstractText: 'This record has an abstract but does not state an open article license.',
              license: '',
              isOpenAccess: 'N',
            },
          ],
        },
      };
    });
    const records = await providerWithMetadata.searchArticles('microbial risk assessment', 5);
    expect(Object.keys(records)).toEqual(['A Review of Quantitative Microbial Risk Assessment.']);
    expect(records['A Review of Quantitative Microbial Risk Assessment.']).toMatchObject({
      providerId: 'europe-pmc',
      sourceKind: 'open biomedical article',
      sourceId: 'europe-pmc:PMC13074090',
      sourceUrl: 'https://europepmc.org/article/PMC/13074090',
      license: 'CC BY',
      definitionMode: 'scholarly-abstract',
    });
  });

  it('uses the scholarly lane before the encyclopedia lane and preserves both receipts', async () => {
    const articleText = (term, detail) =>
      [
        `${term} is a source-defined concept used to explain ${detail} in this lesson.`,
        `${term} requires evidence that connects the observed condition to the stated mechanism.`,
        `${term} includes a comparison that distinguishes the mechanism from a neighbouring explanation.`,
        `${term} allows investigators to evaluate one bounded claim against an observable result.`,
        `${term} provides a worked example that can be checked against the cited source passage.`,
      ].join('\n');
    const makeProvider = (id, records) => ({
      id,
      sourceKind: id === 'doaj' ? 'open scholarly article' : 'open encyclopedia',
      supportsDirectTitles: false,
      searchArticles: async () => records,
      search: async () => Object.keys(records),
      articles: async (titles) =>
        Object.fromEntries(titles.map((title) => [title, records[title]]).filter(([, value]) => value)),
      article: async (title) => records[title] || null,
      license: id === 'doaj' ? 'CC0 1.0 (DOAJ article metadata)' : 'CC BY-SA 4.0',
      attributionFor: (title) => `${id}, ${title}`,
      sourceIdFor: (title) => `${id}:${title}`,
    });
    const scholarly = makeProvider('doaj', {
      'Biofilm evidence': {
        title: 'Biofilm evidence',
        extract: articleText('Biofilm', 'surface attachment'),
        sourceId: 'doaj:biofilm-evidence',
        providerId: 'doaj',
        sourceKind: 'open scholarly article',
        license: 'CC0 1.0 (DOAJ article metadata)',
        attribution: 'Researcher (2026). Biofilm evidence. DOAJ metadata.',
        sourceUrl: 'https://example.org/biofilm-evidence',
        suggestedTerm: 'Biofilm',
        definitionMode: 'scholarly-abstract',
      },
    });
    const encyclopediaRecords = Object.fromEntries(
      ['Biofilm matrix', 'Microbial mat', 'Surface adhesion'].map((title) => [
        title,
        {
          title,
          extract: articleText(title, 'biofilm structure'),
          sourceUrl: `https://example.org/${title}`,
          providerId: 'wikipedia',
          sourceKind: 'open encyclopedia',
        },
      ]),
    );
    const encyclopedia = makeProvider('wikipedia', encyclopediaRecords);

    const result = await researchLessonKernelSetsCascade(['Biofilm'], {
      providers: [
        { id: 'doaj', provider: scholarly, options: { maxTargetedFallbacks: 0 } },
        { id: 'wikipedia', provider: encyclopedia, options: { maxTargetedFallbacks: 0 } },
      ],
      want: 4,
      minimum: 3,
      floor: 0.2,
    });

    expect(result.providerStats.map((entry) => entry.providerId)).toEqual(['doaj', 'wikipedia']);
    expect(result.providersUsed).toContain('doaj');
    expect(result.byTopic.get('Biofilm').some((kernel) => kernel.provenance.providerId === 'doaj')).toBe(true);
    expect(result.byTopic.get('Biofilm').every((kernel) => kernel.provenance.entailment?.status === 'passed')).toBe(
      true,
    );
  });

  it('continues to the next provider when a raw kernel count is not schema-ready', async () => {
    const recordsFor = (providerId, prefix) =>
      Object.fromEntries(
        [1, 2, 3].map((index) => {
          const title = `Biofilm ${prefix} ${index}`;
          const extract = [
            `${title} is a source-defined biofilm concept with a distinct role in an environmental system.`,
            `${title} requires evidence because its mechanism depends on observable attachment conditions.`,
            `${title} allows investigators to compare one bounded result with a neighbouring explanation.`,
          ].join('\n');
          return [
            title,
            {
              title,
              extract,
              sourceId: `${providerId}:${prefix}-${index}`,
              providerId,
              sourceKind: 'open source',
              sourceUrl: `https://example.org/${providerId}/${index}`,
            },
          ];
        }),
      );
    const providerFor = (id, records) => ({
      id,
      supportsDirectTitles: false,
      searchArticles: async () => records,
      search: async () => Object.keys(records),
      articles: async (titles) =>
        Object.fromEntries(titles.map((title) => [title, records[title]]).filter(([, value]) => value)),
      article: async (title) => records[title] || null,
      license: 'CC BY 4.0',
      attributionFor: (title) => `${id}, ${title}`,
      sourceIdFor: (title) => `${id}:${title}`,
    });
    const first = providerFor('doaj', recordsFor('doaj', 'study'));
    const second = providerFor('wikipedia', recordsFor('wikipedia', 'concept'));

    const result = await researchLessonKernelSetsCascade(['Biofilm'], {
      providers: [
        { id: 'doaj', provider: first, options: { maxTargetedFallbacks: 0 } },
        { id: 'wikipedia', provider: second, options: { maxTargetedFallbacks: 0 } },
      ],
      want: 4,
      minimum: 3,
      floor: 0.2,
      isTopicReady: (_topic, kernels) => kernels.some((kernel) => kernel.provenance?.providerId === 'wikipedia'),
    });

    expect(result.providerStats.map((entry) => entry.providerId)).toEqual(['doaj', 'wikipedia']);
    expect(result.byTopic.get('Biofilm')).toHaveLength(6);
    expect(result.providersUsed).toEqual(['doaj', 'wikipedia']);
  });

  it('uses the course research plan to skip irrelevant providers and issue a disambiguated lesson query', async () => {
    const queries = [];
    const noResultsProvider = (id) => ({
      id,
      supportsDirectTitles: false,
      searchArticles: async (query) => {
        queries.push([id, query]);
        return {};
      },
      search: async () => [],
      articles: async () => ({}),
      article: async () => null,
      license: 'CC BY 4.0',
      attributionFor: (title) => `${id}, ${title}`,
      sourceIdFor: (title) => `${id}:${title}`,
    });
    const researchPlan = planAlgiCourseResearch({
      courseName: 'World Literature',
      lessons: [{ lessonId: 'lesson-1', title: 'Postcolonial narrative voice' }],
    });

    const result = await researchLessonKernelSetsCascade(['Postcolonial narrative voice'], {
      providers: [
        { id: 'europe-pmc', provider: noResultsProvider('europe-pmc'), options: { maxTargetedFallbacks: 0 } },
        { id: 'doaj', provider: noResultsProvider('doaj'), options: { maxTargetedFallbacks: 0 } },
        { id: 'wikipedia', provider: noResultsProvider('wikipedia'), options: { maxTargetedFallbacks: 0 } },
      ],
      researchPlan,
    });

    expect(queries.some(([providerId]) => providerId === 'europe-pmc')).toBe(false);
    expect(queries.find(([providerId]) => providerId === 'doaj')?.[1]).toContain('"Postcolonial narrative voice"');
    expect(result.providerStats.map((entry) => entry.providerId)).toEqual(['doaj', 'wikipedia']);
  });
});

describe('lesson research admission', () => {
  it('uses course context to search without diluting exact lesson relevance', async () => {
    const pages = {
      'Quantum error correction': {
        hits: ['quantum', 'error', 'correction'],
        text: [
          'Quantum error correction is a set of techniques used to protect quantum information from errors caused by decoherence and other noise.',
          'Quantum error correction stores information across multiple physical qubits because a single physical qubit is vulnerable to noise.',
          'Quantum error correction detects error syndromes without directly measuring and destroying the encoded quantum information.',
          'Quantum error correction requires fault-tolerant operations when a computation must remain reliable as circuit depth increases.',
        ].join('\n'),
      },
    };
    const kernels = await researchLessonKernels('quantum error correction', {
      provider: stubProvider(pages),
      courseContext: 'Introduction to Quantum Computing',
      candidates: 4,
      want: 4,
    });
    expect(kernels.map((kernel) => kernel.term)).toContain('Quantum error correction');
  });

  it('admits named sub-concepts when their definitions explicitly match the lesson', async () => {
    const makeText = (term, definition) =>
      [
        definition,
        `${term} requires a source-grounded procedure because the protected state cannot be inspected as an ordinary classical bit.`,
        `${term} uses redundant structure to make errors detectable without replacing the encoded information with an unsupported estimate.`,
        `${term} supports reliable computation when its assumptions about noise and recovery operations are satisfied.`,
      ].join('\n');
    const pages = {
      'Quantum error correction': {
        hits: ['quantum', 'error', 'correction'],
        text: makeText(
          'Quantum error correction',
          'Quantum error correction is a set of techniques that protects quantum information from errors caused by noise.',
        ),
      },
      'Shor code': {
        hits: ['quantum', 'error', 'correction'],
        text: makeText(
          'Shor code',
          'Shor code is a foundational code in quantum error correction that protects quantum information against single-qubit errors.',
        ),
      },
      'Stabilizer code': {
        hits: ['quantum', 'error', 'correction'],
        text: makeText(
          'Stabilizer code',
          'Stabilizer code is a class of quantum error correction codes defined by a commuting set of quantum operators.',
        ),
      },
    };
    const kernels = await researchLessonKernels('quantum error correction', {
      provider: stubProvider(pages),
      want: 4,
    });
    expect(kernels.map((kernel) => kernel.term)).toEqual(['Quantum error correction', 'Shor code', 'Stabilizer code']);
    expect(kernels.every((kernel) => kernel.mcBank.length === 1)).toBe(true);
  });

  it('keeps an exact topic phrase even when an earlier repeated word appears in the definition', async () => {
    const pages = {
      'Quantum entanglement': {
        hits: ['quantum', 'entanglement'],
        text: [
          'Quantum entanglement is a phenomenon in which linked quantum systems cannot be described independently.',
          'Quantum entanglement produces correlations because the composite state constrains measurements of its parts.',
          'Quantum entanglement requires a joint description when the state cannot be factored into separate subsystem states.',
        ].join('\n'),
      },
      'Entropy of entanglement': {
        hits: ['quantum', 'entanglement'],
        text: [
          'The entropy of entanglement is a measure of the degree of quantum entanglement between two subsystems of a composite quantum system.',
          'The entropy of entanglement quantifies correlations because a subsystem can have mixed-state entropy inside a pure composite state.',
          'The entropy of entanglement requires a specified bipartition when a system contains more than two subsystems.',
        ].join('\n'),
      },
      'Entanglement witness': {
        hits: ['quantum', 'entanglement'],
        text: [
          'An entanglement witness is an observable used to distinguish a quantum entangled state from separable states.',
          'An entanglement witness detects selected states because its expectation value crosses a defined bound.',
          'An entanglement witness requires measurement evidence before a state can be classified by the chosen criterion.',
        ].join('\n'),
      },
    };
    const kernels = await researchLessonKernels('quantum entanglement', {
      provider: stubProvider(pages),
      want: 4,
    });
    expect(kernels.map((kernel) => kernel.term)).toContain('Entropy of entanglement');
  });

  it('composes a compound lesson from concepts that source-ground each named side', async () => {
    const pages = {
      'Quantum superposition': {
        hits: ['superposition', 'measurement'],
        text: [
          'Quantum superposition is a principle in which a quantum state can be a linear combination of other states.',
          'Quantum superposition allows interference because probability amplitudes combine before an observation is made.',
          'Quantum superposition requires a basis when coefficients are used to describe a prepared state.',
        ].join('\n'),
      },
      'Measurement problem': {
        hits: ['superposition', 'measurement'],
        text: [
          'The measurement problem is the problem of definite outcomes when quantum systems have superpositions but measurements give one result.',
          'The measurement problem distinguishes unitary evolution from the definite record produced by an observation.',
          'The measurement problem requires an interpretation to explain how a single observed result relates to the prior state.',
        ].join('\n'),
      },
      "Schrödinger's cat": {
        hits: ['superposition', 'measurement'],
        text: [
          "Schrödinger's cat is a thought experiment concerning quantum superposition and observation.",
          "Schrödinger's cat links a microscopic state to a macroscopic outcome because the imagined mechanism couples them.",
          "Schrödinger's cat illustrates a boundary because a mathematical superposition is contrasted with the definite result an observer records.",
        ].join('\n'),
      },
    };
    const kernels = await researchLessonKernels('superposition and measurement', {
      provider: stubProvider(pages),
      courseContext: 'Introduction to Quantum Computing',
      want: 4,
    });
    expect(kernels).toHaveLength(3);
    expect(kernels.map((kernel) => kernel.term)).toEqual(
      expect.arrayContaining(['Quantum superposition', 'Measurement problem', "Schrödinger's cat"]),
    );
    expect(kernels.every((kernel) => kernel.mcBank.length === 1)).toBe(true);
  });

  it('rejects same-domain pages that mention the topic words out of relation', async () => {
    const pages = {
      'Quantum algorithm': {
        hits: ['quantum', 'algorithms'],
        text: [
          'Quantum algorithm is an algorithm that runs on a realistic model of quantum computation.',
          'Quantum algorithms use quantum operations because their computational steps act on quantum states.',
          'Quantum algorithms can exploit interference to change the probability of measured outcomes.',
          'Quantum algorithms require an explicit measurement strategy before a classical result is returned.',
        ].join('\n'),
      },
      'Post-quantum cryptography': {
        hits: ['quantum', 'algorithms'],
        text: [
          'Post-quantum cryptography is the study of cryptographic algorithms thought to be secure against attack by a quantum computer.',
          'Post-quantum cryptography uses classical algorithms because its goal is resistance to quantum attacks.',
          'Post-quantum cryptography changes cryptographic assumptions when large quantum computers become practical.',
          'Post-quantum cryptography remains a classical security discipline rather than a model of quantum computation.',
        ].join('\n'),
      },
    };
    const kernels = await researchLessonKernels('quantum algorithms', {
      provider: stubProvider(pages),
      want: 4,
    });
    expect(kernels.map((kernel) => kernel.term)).toContain('Quantum algorithm');
    expect(kernels.map((kernel) => kernel.term)).not.toContain('Post-quantum cryptography');
  });

  it('admits a canonical family concept when its definition explicitly supplies the lesson topic', async () => {
    const pages = {
      Biofilm: {
        hits: ['biofilms'],
        text: [
          'A biofilm is a community of microorganisms in which cells adhere to one another and often to a surface.',
          'A biofilm can protect resident cells because its extracellular matrix changes transport and exposure.',
          'A biofilm develops through attachment, growth, and dispersal under environmental conditions.',
        ].join('\n'),
      },
      'Microbial mat': {
        hits: ['biofilms'],
        text: [
          'A microbial mat is a multilayered sheet or biofilm of microbial colonies at a material interface.',
          'A microbial mat develops vertical chemical gradients because different populations use resources at different depths.',
          'A microbial mat records community structure across layers that receive different light and oxygen conditions.',
        ].join('\n'),
      },
      'Phototrophic biofilm': {
        hits: ['biofilms'],
        text: [
          'Phototrophic biofilms are microbial communities that include organisms using light as an energy source.',
          'Phototrophic biofilms form attached layers because cells remain within a shared matrix.',
          'Phototrophic biofilms occur in aquatic and terrestrial environments where light reaches the surface.',
        ].join('\n'),
      },
    };
    const kernels = await researchLessonKernels('Biofilms', {
      provider: stubProvider(pages),
      courseContext: 'Environmental Microbiology',
      want: 5,
    });
    expect(kernels.map((kernel) => kernel.term)).toEqual(
      expect.arrayContaining(['Biofilm', 'Microbial mat', 'Phototrophic biofilm']),
    );
  });

  it('hydrates canonical-family pages before ranking when the intro omits the exact lesson phrase', async () => {
    const intro =
      'The Web Accessibility Initiative is an effort by the World Wide Web Consortium to improve web access.';
    const full = [
      intro,
      'The Web Accessibility Initiative develops the Web Content Accessibility Guidelines (WCAG) for accessible web content.',
      'The Web Content Accessibility Guidelines define testable success criteria at multiple conformance levels.',
      'Authoring Tool Accessibility Guidelines address software used to create web content.',
      'User Agent Accessibility Guidelines address browsers and media players.',
    ].join('\n');
    let fullReads = 0;
    const provider = {
      id: 'wikipedia',
      sourceKind: 'open encyclopedia',
      license: 'CC BY-SA 4.0',
      search: async () => ['Web Accessibility Initiative'],
      articles: async () => ({
        'Web Accessibility Initiative': {
          title: 'Web Accessibility Initiative',
          extract: intro,
          sourceUrl: 'https://en.wikipedia.org/wiki/Web_Accessibility_Initiative',
        },
      }),
      fullArticle: async () => {
        fullReads += 1;
        return {
          title: 'Web Accessibility Initiative',
          extract: full,
          sourceUrl: 'https://en.wikipedia.org/wiki/Web_Accessibility_Initiative',
        };
      },
      sourceIdFor: () => 'wikipedia:Web_Accessibility_Initiative',
      attributionFor: () => 'Wikipedia contributors',
    };
    const kernels = await researchLessonKernels('WCAG principles', {
      provider,
      courseContext: 'Digital Accessibility for Product Teams',
      floor: 0.15,
    });
    expect(fullReads).toBe(1);
    expect(kernels.map((kernel) => kernel.term)).toContain('Web Accessibility Initiative');
    expect(kernels[0].facts.map((fact) => fact.text).join(' ')).toContain('Web Content Accessibility Guidelines');
  });

  it('composes waterborne pathogens from three admitted source concepts', async () => {
    const pages = {
      'Waterborne disease': {
        hits: ['waterborne', 'pathogens'],
        text: [
          'Waterborne diseases are diseases caused by pathogenic microorganisms that are transmitted through contaminated water.',
          'Waterborne diseases spread when contaminated water carries bacteria, viruses, protozoa, or parasitic worms.',
          'Waterborne disease prevention depends on separating human waste from drinking-water supplies.',
        ].join('\n'),
      },
      'Pathogenic bacteria': {
        hits: ['pathogens'],
        text: [
          'Pathogenic bacteria are bacteria that can cause disease in humans or other organisms.',
          'Pathogenic bacteria produce illness when their virulence mechanisms damage tissue or disrupt normal host functions.',
          'Pathogenic bacteria differ from harmless bacteria because pathogenic species can establish infection.',
        ].join('\n'),
      },
      'Water pollution': {
        hits: ['waterborne'],
        text: [
          'Water pollution is the contamination of water bodies, which has a negative impact on how they can be used.',
          'Water pollution results when contaminants mix with rivers, lakes, aquifers, reservoirs, or groundwater.',
          'Water pollution can spread waterborne diseases when contaminated water exposes people to disease-causing organisms.',
        ].join('\n'),
      },
    };
    const kernels = await researchLessonKernels('Waterborne pathogens', {
      provider: stubProvider(pages),
      courseContext: 'Environmental Microbiology',
      want: 5,
    });
    expect(kernels.map((kernel) => kernel.term)).toEqual(
      expect.arrayContaining(['Waterborne disease', 'Pathogenic bacteria', 'Water pollution']),
    );
    expect(kernels.every((kernel) => kernel.provenance?.origin === RESEARCH_ORIGIN)).toBe(true);
    expect(kernels.every((kernel) => kernel.provenance?.entailment?.status === 'passed')).toBe(true);
  });

  it('does not let weak related pages ride along below the relevance floor', async () => {
    const pages = {
      Photosynthesis: {
        hits: ['photosynthesis'],
        text: [
          'Photosynthesis is a process that converts light energy into chemical energy in plants and algae.',
          'Photosynthesis requires pigments because those molecules absorb wavelengths of incoming light.',
          'Photosynthesis produces chemical energy that organisms can later release through cellular respiration.',
          'Photosynthesis occurs in chloroplasts, where specialized membranes organize the light-dependent reactions.',
        ].join('\n'),
      },
      Architecture: {
        hits: ['photosynthesis'],
        text: [
          'Architecture is the process and product of planning, designing, and constructing buildings or structures.',
          'Architecture requires technical knowledge because buildings must satisfy structural and environmental constraints.',
          'Architecture uses drawings and models to communicate proposed spatial arrangements before construction begins.',
          'Architecture affects communities through the placement, scale, and material character of built environments.',
        ].join('\n'),
      },
    };
    const kernels = await researchLessonKernels('photosynthesis', {
      provider: stubProvider(pages),
      candidates: 4,
      want: 4,
    });
    expect(kernels.map((kernel) => kernel.term)).toContain('Photosynthesis');
    expect(kernels.map((kernel) => kernel.term)).not.toContain('Architecture');
  });
});

describe('course-level research batching', () => {
  it('researches three lessons with one grouped search and two article batches', async () => {
    const page = (title, topic) => ({
      title,
      extract: [
        `${title} is a source anchored ${topic} concept with a distinct instructional purpose.`,
        `${title} explains a concrete ${topic} relationship that learners can inspect in an applied case.`,
        `${title} requires evidence before a learner draws a conclusion about the ${topic} case.`,
      ].join('\n'),
      sourceUrl: `https://example.test/${encodeURIComponent(title)}`,
      revisionId: title.length,
    });
    const pages = Object.fromEntries(
      ['Alpha', 'Beta', 'Gamma'].flatMap((topic) =>
        [topic, `${topic} method`, `${topic} evidence`].map((title) => [title, page(title, topic.toLowerCase())]),
      ),
    );
    let searchCalls = 0;
    let articleCalls = 0;
    const batchedProvider = {
      ...provider,
      search: async () => {
        searchCalls += 1;
        return Object.keys(pages);
      },
      articles: async (titles) => {
        articleCalls += 1;
        return Object.fromEntries(titles.filter((title) => pages[title]).map((title) => [title, pages[title]]));
      },
    };

    const result = await researchLessonKernelSets(['Alpha', 'Beta', 'Gamma'], {
      provider: batchedProvider,
      want: 4,
    });

    expect(result.searchGroups).toBe(1);
    expect(searchCalls).toBe(1);
    expect(articleCalls).toBe(2);
    expect([...result.byTopic.values()].map((kernels) => kernels.length)).toEqual([3, 3, 3]);
  });
});

describe('researchCourse (course-level assessment)', () => {
  it('backfills multiple-choice items using sibling definitions as distractors', async () => {
    // No single article yields enough distractors; the course supplies them.
    const mk = (term) =>
      [
        `${term} is a distinct concept in this field with its own defining characteristics and scope.`,
        `${term} applies whenever practitioners need to reason about the situation it describes.`,
        `${term} requires evidence before a conclusion can be drawn about any particular case.`,
      ].join('\n');
    const pages = Object.fromEntries(
      ['Alpha', 'Beta', 'Gamma', 'Delta'].map((term) => [term, { hits: [term.toLowerCase()], text: mk(term) }]),
    );
    const result = await researchCourse(['alpha', 'beta', 'gamma', 'delta'], { provider: stubProvider(pages) });
    expect(result.admitted.length).toBe(4);
    for (const entry of result.admitted) {
      expect(entry.kernel.mcBank).toHaveLength(1);
      expect(entry.kernel.mcBank[0].options).toHaveLength(4);
      // The key must be this concept's own definition, distractors real siblings.
      expect(entry.kernel.mcBank[0].options[entry.kernel.mcBank[0].answerIndex]).toBe(entry.kernel.definition.text);
      expect(new Set(entry.kernel.mcBank[0].options).size).toBe(4);
    }
  });
});
