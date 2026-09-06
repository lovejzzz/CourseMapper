// Fictional independent cases: each is solved by the same evidence operation,
// from a new source packet. Student directions contain no worked solution.
export const evidenceTransferPackets = {
  'event-stage-dates': {
    objective: 'Compare manuscript and edition dates as records of different stages.',
    sources: [
      'A fictional author’s notebook dates the completion of a manuscript to 1912.',
      'A catalog dates this particular edition of that manuscript to 1927.',
      'An edition can be published after completion; neither record identifies every intervening owner.',
    ],
    directions:
      'Label the dated events, assess whether the records conflict, and identify which parts of the manuscript’s history remain unknown.',
  },
  'effective-record-amendment': {
    objective: 'Interpret an amended capacity record using its effective date.',
    sources: [
      'A fictional room register originally lists 24 places for a workshop.',
      'A later entry explicitly revises the permitted capacity to 36 places from 15 October.',
      'A workshop attendance image is undated.',
    ],
    directions:
      'Explain the relationship between the entries, make an effective-date timeline, and state whether the image can be assigned to a capacity rule.',
  },
  'missing-chart-context': {
    objective: 'Assess a claim of a dramatic decline from a pictured line.',
    sources: [
      'A fictional bulletin screenshot shows a downward-sloping line.',
      'The axis labels, units, numeric scale, and time interval are missing.',
      'Its caption claims a dramatic decline but supplies no underlying values.',
    ],
    directions:
      'Distinguish the reported visual feature from the caption’s claim. Identify the information needed to determine what changed, by how much and how quickly.',
  },
  'testimony-attribution': {
    objective: '区分访谈中的观察、转述与个人推断。',
    sources: [
      '新的虚构访谈中，说话者说：我亲眼看见仓库的灯亮着。',
      '同一人接着说：保安告诉我，设备正在检修；我推测生产可能已经停止。',
      '材料未提供维修日志，也没有停产公告。',
    ],
    directions: '逐句摘录并归类三种陈述，追踪信息来源，说明哪些内容尚未核实，并提出可以寻找的独立证据。',
  },
  'co-intervention-and-assignment': {
    objective: 'Propose a comparison of a training schedule using independent treatment units.',
    sources: [
      'In a fictional athletics club, Squad Cedar uses a new training schedule with an extra nutrition program; Squad Pine uses the original schedule without that program.',
      'Different coaches train the squads, and sprint times are measured at the end of eight weeks.',
      'No baseline sprint times or random assignment are reported.',
    ],
    directions:
      'Explain which changes prevent a schedule-only interpretation. Specify allocation units, comparable support and coaching, baseline and follow-up measurement, and what remains unknown.',
  },
  'cache-and-run-order': {
    objective: 'Design a fair algorithm timing comparison controlling cache and run order.',
    sources: [
      'A fictional sorting benchmark always runs Algorithm Merge first on a cold cache and Algorithm Heap second on warmed data.',
      'Algorithm Merge has a lower elapsed time in these trials.',
      'Input data and hardware are shared, but cache state and order differ systematically.',
    ],
    directions:
      'Map the trial conditions, explain whether the observed faster algorithm has an established intrinsic advantage, and propose a reproducible timing comparison.',
  },
  'label-and-serving-order': {
    objective: 'Design a blinded comparison to evaluate recipe preferences.',
    sources: [
      'In a fictional bread tasting, the new recipe is served in cups labeled artisan and the original in cups labeled everyday.',
      'Participants know the labels and rate the everyday cups higher.',
      'Serving order is fixed and no blinded tasting is reported.',
    ],
    directions:
      'Explain what the original ratings can establish. Propose a coded comparison with allocation/order and measurement rules, and identify uncertainties that coding alone may not remove.',
  },
  'initial-condition-and-duration': {
    objective: '设计两种滤材的公平比较，说明如何分配、测量及重复。',
    sources: [
      '新的虚构试验：丙滤材处理高浑浊度的水12分钟，丁滤材处理低浑浊度的水4分钟。',
      '处理后丁组水看起来更清，但没有统一量表或仪器读数。',
      '没有随机分配水样，也没有重复试验。',
    ],
    directions: '比较两组的起点、时长和测量，判断是否能单独归因于滤材；写出可复核的新设计，并区分建议与已有结果。',
  },
};
