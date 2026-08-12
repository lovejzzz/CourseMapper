#!/usr/bin/env node

import {
  buildWikipediaProvider,
  buildKernelFromArticle,
  directResearchTitles,
  directResearchTitleVariants,
  isResearchCandidateDomainAligned,
  looksLikeEntity,
  lexicalRelevance,
  researchLessonKernels,
  researchLessonKernelSets,
} from '../src/lib/knowledge/algiResearch.js';
import { admitKernel } from '../src/lib/genome/foundryAdmission.js';
import { attachKernelEntailmentReceipt } from '../src/lib/knowledge/claimEntailment.js';
import { planAlgiCourseResearch, providerQueryVariantsForLesson } from '../src/lib/knowledge/algiResearchPlan.js';
import {
  composeLessonFromCandidateKernels,
  expandResearchKernelsForComposition,
  fitSourceFacts,
  semanticAdmissionSafeResearchKernel,
  sourceClaimSemanticAdmission,
} from '../src/lib/algiKernelComposer.js';

function valuesFor(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

async function httpJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'api-user-agent': 'EduTool.dev/0.17 (+https://edutool.dev/#/contact)',
      'user-agent': 'EduTool.dev/0.17 (+https://edutool.dev/#/contact)',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${new URL(url).hostname}`);
  return response.json();
}

const topics = valuesFor('--topic');
const articleTitles = valuesFor('--article');
const courseContext = valuesFor('--course')[0] || '';
const evidenceContext = valuesFor('--evidence')[0] || '';
if (topics.length === 0) {
  throw new Error('Usage: researchDiagnostic --course <title> --topic <lesson query> [--topic <lesson query> ...]');
}

const researchPlan = planAlgiCourseResearch({
  courseName: courseContext,
  lessons: topics.map((topic, index) => ({
    lessonId: `lesson-${index + 1}`,
    title: topic,
    ...(evidenceContext ? { evidenceIntent: [evidenceContext] } : {}),
  })),
});

const wikipediaBase = buildWikipediaProvider(httpJson);
const fullArticleReads = [];
const wikipedia = {
  ...wikipediaBase,
  fullArticle: async (title) => {
    fullArticleReads.push(title);
    return wikipediaBase.fullArticle(title);
  },
};
const articleDiagnostics = [];
for (const title of articleTitles) {
  const article = await wikipedia.article(title);
  const topic = topics[0];
  const candidate = article
    ? buildKernelFromArticle({
        topic,
        title: article.title || title,
        extract: article.extract,
        provider: wikipedia,
        sourceMeta: article,
      })
    : null;
  const admission = candidate ? admitKernel(candidate.kernel, { sources: candidate.snapshot }) : null;
  const entailment = admission?.admitted ? attachKernelEntailmentReceipt(admission.kernel, candidate.snapshot) : null;
  articleDiagnostics.push({
    title,
    resolvedTitle: article?.title || '',
    extractLength: article?.extract?.length || 0,
    domainAligned: candidate
      ? isResearchCandidateDomainAligned({
          topic,
          courseContext,
          title: article.title || title,
          extract: article.extract,
          definition: candidate.kernel?.definition?.text,
          provider: 'wikipedia',
        })
      : false,
    looksLikeEntity: candidate ? looksLikeEntity(article.title || title, candidate.kernel?.definition?.text) : false,
    relevance: candidate
      ? String(topic)
          .split(/\s+(?:and|&)\s+|\s*[·|]\s*/i)
          .map((clause) => ({
            clause,
            title: lexicalRelevance(clause, article.title || title),
            definition: lexicalRelevance(clause, candidate.kernel?.definition?.text),
          }))
      : [],
    kernel: candidate?.kernel || null,
    admission,
    entailment,
    isolatedResearchKernels: await researchLessonKernels(topic, {
      provider: {
        ...wikipedia,
        search: async () => [title],
      },
      courseContext,
      candidates: 1,
      want: 5,
    }),
  });
}

const allDirectTitles = [...new Set(topics.flatMap((topic) => directResearchTitleVariants(topic, courseContext)))];
const directRecordPreview = await wikipedia.articles(allDirectTitles);

const result = await researchLessonKernelSets(topics, {
  provider: wikipedia,
  providerId: 'wikipedia',
  courseContext,
  want: 5,
  minimum: 3,
  groupSize: 3,
  candidatesPerGroup: 24,
  maxTargetedFallbacks: 6,
  maxTargetedSearchRequests: 8,
  researchPlan,
});

console.log(
  JSON.stringify(
    {
      errors: result.errors,
      searchGroups: result.searchGroups,
      targetedSearches: result.targetedSearches,
      targetedBudgetExhausted: result.targetedBudgetExhausted,
      articleCandidates: result.articleCandidates,
      fullArticleReads,
      directRecordPreview: allDirectTitles.map((title) => ({
        requestedTitle: title,
        resolvedTitle: directRecordPreview?.[title]?.title || '',
        extractLength: directRecordPreview?.[title]?.extract?.length || 0,
      })),
      articleDiagnostics,
      topics: topics.map((topic) => ({
        topic,
        directTitles: directResearchTitles(topic, courseContext),
        queryVariants: providerQueryVariantsForLesson(researchPlan, topic, 'wikipedia'),
        kernels: (result.byTopic.get(topic) || []).map((kernel) => ({
          term: kernel.term,
          sourceUrl: kernel.provenance?.sourceUrl,
          claimCount: kernel.provenance?.sourceSnapshot?.claims?.length || 0,
          definition: kernel.definition?.text,
          facts: (kernel.facts || []).map((fact) => fact.text || ''),
          claims: (kernel.provenance?.sourceSnapshot?.claims || []).map((claim) => claim.text || claim.claim || ''),
          research: kernel.provenance?.research || null,
          semanticAdmission: {
            kernelAdmitted: Boolean(semanticAdmissionSafeResearchKernel(kernel)),
            definition: sourceClaimSemanticAdmission(kernel, kernel.definition?.text || ''),
            facts: (kernel.facts || []).map((fact) => sourceClaimSemanticAdmission(kernel, fact?.text || '')),
          },
        })),
        composition: (() => {
          const [specific = '', broad = ''] = topic.split(/\s*·\s*/, 2);
          const diagnostics = {};
          const payload = composeLessonFromCandidateKernels(
            {
              lessonId: `diagnostic-${topics.indexOf(topic) + 1}`,
              title: broad || specific,
              topics: [specific || broad].filter(Boolean),
            },
            expandResearchKernelsForComposition(result.byTopic.get(topic) || [], topic),
            {
              factCount: 5,
              claimed: new Set(),
              usedOut: [],
              diagnostics,
            },
          );
          return {
            ready: Boolean(payload),
            reason: diagnostics.reason || '',
            attempts: diagnostics.attempts || 0,
            reasons: diagnostics.reasons || {},
            selected: diagnostics.selected || [],
            required: diagnostics.required || 0,
            candidateDecisions: diagnostics.candidateDecisions || [],
            keyTermDeclines: diagnostics.keyTermDeclines || [],
            expandedTerms: expandResearchKernelsForComposition(result.byTopic.get(topic) || [], topic).map(
              (kernel) => kernel.term,
            ),
            fittedFacts: (result.byTopic.get(topic) || []).flatMap((kernel) =>
              [kernel.definition, ...(kernel.facts || [])].flatMap((claim) => fitSourceFacts(claim?.text || '')),
            ),
          };
        })(),
      })),
    },
    null,
    2,
  ),
);
