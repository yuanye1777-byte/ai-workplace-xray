import type { QAItem, Report } from "../src/lib/ai/types";
import { normalizeReportForMode, reportQualitySnapshot } from "../src/lib/report-quality";
import { headlineFor } from "../src/lib/report-presenter";

const history: QAItem[] = [
  {
    question: "最近最具体的资源变化是什么？",
    answer: "核心客户被转给新同事协助，但没有正式交接通知，我仍然负责客户每周例会。",
    targetDimension: "resource",
    classified: {
      facts: ["核心客户被转给新同事协助"],
      emotions: [],
      judgments: [],
      inferences: [],
      dimensions: ["resource"],
      reverseEvidence: ["没有正式交接通知", "我仍然负责客户每周例会"],
    },
  },
  {
    question: "有没有完全替代或权限变化？",
    answer: "目前没有完全替代，我的系统权限没有变化，也没有公开负面评价。",
    targetDimension: "replace",
    classified: {
      facts: [],
      emotions: [],
      judgments: [],
      inferences: ["没有完全替代"],
      dimensions: ["replace", "relation"],
      reverseEvidence: ["没有完全替代", "我的系统权限没有变化", "没有公开负面评价"],
    },
  },
  {
    question: "是否仍被交付任务？",
    answer: "领导这周仍被单独交付任务给我，只是关键会议角色变弱。",
    targetDimension: "reverse",
    classified: {
      facts: ["关键会议角色变弱"],
      emotions: [],
      judgments: [],
      inferences: [],
      dimensions: ["power", "info"],
      reverseEvidence: ["仍被单独交付任务"],
    },
  },
];

const overEscalatedQuickReport: Report = {
  headline: "核心职责与资源出现持续转移，组织位置出现较明显变化，建议在稳住现有工作的同时，也开始了解其他选择。",
  totalScore: 77,
  totalLevel: "变化明显",
  dimensions: [
    {
      key: "power",
      score: 74,
      level: "变化明显",
      explain: "权力维度变化较多，建议重点关注并持续观察。",
      supportingFacts: ["关键会议角色变弱"],
      reverseFacts: ["仍被单独交付任务"],
    },
    {
      key: "resource",
      score: 100,
      level: "变化显著",
      explain: "资源维度变化较多，建议重点关注并持续观察。",
      supportingFacts: ["核心客户被转给新同事协助"],
      reverseFacts: ["没有正式交接通知"],
    },
    {
      key: "info",
      score: 100,
      level: "变化显著",
      explain: "信息维度变化较多，建议重点关注并持续观察。",
      supportingFacts: ["关键会议角色变弱"],
      reverseFacts: ["我的系统权限没有变化"],
    },
    {
      key: "relation",
      score: 100,
      level: "变化显著",
      explain: "关系维度变化较多，建议重点关注并持续观察。",
      supportingFacts: ["关键会议角色变弱"],
      reverseFacts: ["没有公开负面评价"],
    },
    {
      key: "replace",
      score: 77,
      level: "变化明显",
      explain: "替代风险维度变化较多，建议重点关注并持续观察。",
      supportingFacts: ["核心客户被转给新同事协助"],
      reverseFacts: ["没有完全替代"],
    },
  ],
  topSignals: ["核心客户被转给新同事协助", "关键会议角色变弱", "核心资源变化较多，建议重点关注并持续观察。"],
  trend: {
    verdict: "更接近持续变化，而非偶然",
    frequency: "较高",
    duration: "一个月左右",
    continuous: "多个维度同时出现信号",
    coreResource: "已涉及核心资源",
    successor: "已出现潜在承接者",
  },
  explanations: ["解释 A：组织结构调整。", "解释 B：职责边界变化。", "解释 C：短期项目节奏变化。"],
  knownFacts: ["核心客户被转给新同事协助", "关键会议角色变弱"],
  inferences: ["同事可能正在接手部分职责"],
  openAssumptions: ["没有完全替代"],
  misjudgment: "AI 无法判断他人的真实意图，请回到可观察行为。",
  reversalSpace: "中",
  observeSignals: ["观察客户对接权是否继续转移", "观察关键会议是否恢复通知", "观察领导是否继续单独交付任务"],
  dontDo: ["不要立刻质问领导", "不要公开抱怨", "不要把推断当结论"],
  shouldDo: ["稳住现有职责", "记录资源流向", "记录会议信息触达"],
  actions: {
    in72h: ["整理过去 30 天事实", "确认当前职责边界", "记录仍掌握资源"],
    in7d: ["低冲突沟通", "主动承担可见任务", "更新成果清单"],
    in30d: ["建立观察线", "复盘信号变化", "再判断下一步"],
  },
};

const report = normalizeReportForMode(overEscalatedQuickReport, "quick", history);
const quality = reportQualitySnapshot(report);
const dimensions = Object.fromEntries(report.dimensions.map((dimension) => [dimension.key, dimension.score]));
const renderedHeadline = headlineFor(report);

assertBetween("total_score", report.totalScore, 55, 68);
assertBetween("核心资源", dimensions.resource, 70, 85);
assertBetween("信息透明度", dimensions.info, 60, 80);
assertBetween("关键关系", dimensions.relation, 45, 65);
assertBetween("决策参与", dimensions.power, 30, 55);
assertBetween("发展空间/替代", dimensions.replace, 45, 65);

if (/了解其他选择|评估后续方向|启动\s*Plan\s*B/i.test(renderedHeadline)) {
  throw new Error(`headline contains forbidden quick escalation copy: ${renderedHeadline}`);
}

if (renderedHeadline !== "建议先稳住现有职责，并围绕资源流向、会议角色、信息触达建立 30 天观察线。") {
  throw new Error(`unexpected quick headline: ${renderedHeadline}`);
}

if (report.dimensions.some((dimension) => dimension.score >= 100)) {
  throw new Error(`dimension score reached 100: ${JSON.stringify(dimensions)}`);
}

if (report.dimensions.some((dimension) => /变化较多，建议重点关注并持续观察/.test(dimension.explain))) {
  throw new Error("dimension explain still contains forbidden template sentence");
}

if (quality.status !== "pass") {
  throw new Error(`quality gate did not pass after RC2 normalization: ${JSON.stringify(quality.gates)}`);
}

console.log("RC2 quick fixture: PASS");
console.log(JSON.stringify({
  total_score: report.totalScore,
  dimensions,
  headline: renderedHeadline,
}, null, 2));

function assertBetween(label: string, value: unknown, min: number, max: number) {
  if (typeof value !== "number" || value < min || value > max) {
    throw new Error(`${label} expected ${min}-${max}, got ${String(value)}`);
  }
}
