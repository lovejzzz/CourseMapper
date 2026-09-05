import { createCourse, type Brief, type Source } from '../../src/studio/domain';

const source = (id: string, title: string, text: string, kind: Source['kind'] = 'provided'): Source => ({
  id,
  version: 1,
  title,
  kind,
  text,
});
const common = { lessonCount: 4, minutesPerLesson: 50, allowFictional: true };
export const fixtures: { id: string; brief: Brief; sources: Source[] }[] = [
  {
    id: 'statistics',
    brief: {
      ...common,
      language: 'en',
      audience: 'Adult beginners who can add, divide and read a small table; no prior statistics course.',
      description:
        'Create a complete introductory statistics short course about making defensible decisions from small data. Lesson 1: distinguish sample/population, denominator and selection bias. Lesson 2: calculate and interpret mean and median and compare sensitivity to an extreme value. Lesson 3: calculate quartiles using median of halves (exclude middle for odd n), IQR and upper outlier fence. Lesson 4: students produce an independent evidence memo combining numerical analysis, sampling limitations and a justified recommendation. All data must be explicitly fictional. Supply all readings, examples, practice, answers, rubrics and a cumulative assessment.',
    },
    sources: [
      source(
        'stats-primer',
        'Instructor reference: definitions and calculation conventions',
        'A population is the full group about which a question is asked. A sample is the observed subset. A sample proportion uses the number observed in the sample as its denominator. A convenience sample may under-represent groups who cannot reach the collection location or time; its observed proportion does not automatically describe the population. The mean is the sum divided by the number of values. The median is the middle sorted value or the average of the two middle sorted values. For this course, calculate Q1 and Q3 as the medians of the lower and upper halves; exclude the overall middle value when the count is odd. IQR = Q3 - Q1. The upper outlier fence is Q3 + 1.5 times IQR. An observation above this fence is flagged for investigation, not automatically deleted. A numerical summary does not repair a biased sampling process. Recommendations must distinguish what was observed from what remains unknown.',
      ),
      source(
        'stats-data',
        'Fictional town data for practice',
        'All numbers here are fictional teaching data. A town has 100 residents: 60 day-shift and 40 night-shift workers. At a daytime bus stop, a survey reaches 20 day-shift residents; 16 support a route change. No night-shift worker was surveyed. A separate fictional set of eight journey delays in minutes is [1,2,2,3,3,4,4,11]. Another set of eight delays is [1,2,2,3,3,4,4,5]. These are separate examples; the delay observations are not the same people as the opinion survey. No causal claim about the route change is supported by these data.',
        'fictional',
      ),
    ],
  },
  {
    id: 'museum-zh',
    brief: {
      ...common,
      language: 'zh',
      audience: '高中一年级学生，能阅读短篇现代汉语，尚未学习史料批判。',
      description:
        '设计一门完整的四课时“博物馆里的证据与推论”短课程。逐步学会区分观察、推论与未知；比较相互冲突的记录；用带有限定词的证据写展签；最后独立提交一份120至180字展签及证据说明。不要把没有记载的年代、用途、主人身份说成事实。为每课提供完整讲解、示范、不同材料的练习、独立任务、参考答案、具体错误反馈和评分依据。最终作品必须综合前面三课的技能。所有馆藏档案均为虚构教学材料。',
    },
    sources: [
      source(
        'museum-method',
        '史料阅读方法',
        '观察是材料直接呈现的内容，例如记录中的颜色、形状和文字。推论是根据材料提出的解释，需要说明依据和其他可能性。未记载的内容属于未知，不能因符合常识就写成确定事实。比较两份记录时，要分别列出相同点、冲突点及无法核实之处；记录写得较晚并不自动意味着更可靠。展签应区分确定描述与带有保留的解释。引用时保持原句；改写时不得增加原文没有的信息。',
      ),
      source(
        'museum-a',
        '虚构档案：陶片甲',
        '以下为虚构教学档案。登记卡甲：编号A17，陶片，表面呈红褐色，有两条平行刻痕，长6厘米；出土地不详，入藏日期为1998年3月。记录员手记甲：A17由一位来访者带到馆内；来访者称其发现于河边，但未留下姓名。两份记录均未给出烧制年代、完整器形及原用途。',
        'fictional',
      ),
      source(
        'museum-b',
        '虚构档案：木盒乙',
        '以下为虚构教学档案。登记卡乙：编号B09，木盒，盒盖有一个圆孔；长18厘米，宽10厘米；捐赠日期为2005年6月。捐赠便条乙：我祖父把这个盒子用来装线团，具体制作时间不记得了。修护记录乙：盒底的一层新漆覆盖了旧刻字；在不去除漆层的情况下，无法读出旧刻字。',
        'fictional',
      ),
      source(
        'museum-c',
        '虚构档案：地图丙',
        '以下为虚构教学档案。地图边注丙：这张路线图绘于1921年，图上标有北桥和市场。入藏登记丙：编号C21，纸本路线图，登记员于1978年接收；捐赠者称图纸抄自一张更早的图。修护检查丙：纸面右下角有一次补纸；补纸上的“1921”字样与边注颜色不同。现有材料没有说明是谁绘图、何时抄写或补纸发生于哪一年。',
        'fictional',
      ),
    ],
  },
  {
    id: 'argument-writing',
    brief: {
      ...common,
      language: 'en',
      audience:
        'First-year college writers who can summarize a paragraph but need practice building evidence-based arguments.',
      description:
        'Create a complete short course on writing an evidence-based recommendation for a fictional campus library. Sequence: distinguish claim/evidence/warrant; compare conflicting testimony and qualify generalizations; construct a counterargument and a fair rebuttal; independently write a 300–400 word recommendation with citations to supplied packet IDs, a limitation, and a feasible way to gather missing evidence. Teach writing moves with concrete model sentences. Each lesson must give a different independent task, full materials, feedback and an analytic rubric. Do not invent surveys, costs, usage totals or external studies. The final assessment must be possible entirely from the supplied source packet.',
    },
    sources: [
      source(
        'writing-guide',
        'Instructor reference: argument writing',
        'A claim is a position that a reader could reasonably question. Evidence is the specific material offered in support. A warrant explains why the evidence supports that claim. One interview describes the interviewee’s experience; it does not establish how common that experience is. A counterargument states a plausible reason against the recommendation fairly. A rebuttal responds with reasoning and available evidence rather than dismissing the person. A limitation states what the available evidence cannot establish. A feasible recommendation identifies an action, its scope and how its effects could be checked.',
      ),
      source(
        'library-packet',
        'Fictional campus library source packet',
        'The following records are fictional. [L1] Library opening notice: During teaching weeks, the library currently closes at 8 p.m. Monday through Friday. [L2] Student A interview: My laboratory finishes at 7:30 p.m. on Wednesdays. I often need a quiet desk afterward, and my apartment is noisy. [L3] Student B interview: I study best in the early morning. I would use an earlier opening more than later closing. [L4] Staff memo: Extending opening hours requires an additional staffing plan. This memo provides no wage estimate or budget allocation. [L5] Facilities memo: A ground-floor reading room can be separated from the book stacks. The memo does not state its capacity or whether staffing requirements would change. [L6] Student council proposal: Test a later closing time on one weekday for four teaching weeks, record attendance by time period, and invite both users and nonusers to submit feedback. No attendance data have yet been collected.',
        'fictional',
      ),
    ],
  },
];
export const fixtureCourse = (id: string) => {
  const fixture = fixtures.find((f) => f.id === id);
  if (!fixture) throw new Error(`Unknown fixture ${id}`);
  return createCourse(fixture.brief, fixture.sources);
};
