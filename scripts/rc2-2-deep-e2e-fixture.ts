import { classifyText } from "../src/lib/ai/classifier";
import { generateReport } from "../src/lib/ai/report";
import { headlineFor, reversalAssessment, cleanList } from "../src/lib/report-presenter";
import type { Dimension, QAItem, Report } from "../src/lib/ai/types";

const initial =
  "最近两周，我感觉自己在团队里的位置有点变化。原来我负责推进的一个核心客户项目，现在领导让新同事一起参与，并让他直接跟客户同步几次进展。上周有两次关键会议我不是第一时间被通知，是同事转发给我的。但目前没有正式交接通知，我的系统权限和客户资料访问都还在，也没有公开负面评价。领导这周仍然单独交给我一个紧急任务。";

const answers = [
  {
    question: "最近最具体的资源变化是什么？",
    answer:
      "最近两周核心客户项目开始让新同事直接对接客户，他在会议上代表我汇报进展，但没有正式交接通知，我仍负责最终确认。",
    targetDimension: "resource",
  },
  {
    question: "关键信息和会议触达有什么变化？",
    answer:
      "上周两次关键会议我不是第一时间被通知，是同事转发给我的，会议纪要也是他先发送给我。",
    targetDimension: "info",
  },
  {
    question: "有没有反向证据？",
    answer:
      "有，领导这周仍然单独交给我一个紧急任务，我的系统权限没有变化，也没有公开负面评价。",
    targetDimension: "reverse",
  },
  {
    question: "有没有完全替代或正式调整？",
    answer:
      "目前没有完全替代，也没有正式交接，只是新同事开始参与更多客户对接工作。",
    targetDimension: "replace",
  },
  {
    question: "你现在在关键会议中的角色有什么具体变化？",
    answer:
      "我仍然被邀请参加关键会议，但很多时候只是接收信息，而不是被要求提前准备或做决策。",
    targetDimension: "power",
  },
  {
    question: "你和上级的沟通频率有没有变化？",
    answer:
      "沟通没有完全断掉，但最近上级更多是通过邮件和同事同步，面对面的对话明显变少了。",
    targetDimension: "relation",
  },
  {
    question: "你觉得这些变化持续多久了？",
    answer:
      "就是最近两周连续出现，最近两次关键会议通知都晚了一点，时间还不算长。",
    targetDimension: "trend",
  },
  {
    question: "还有哪些信号说明信息传递上存在缺口？",
    answer:
      "我不是所有会议材料都能第一时间拿到，有时需要同事再转发给我。",
    targetDimension: "info",
  },
  {
    question: "当前你的职责边界是否有明确变化？",
    answer:
      "职责边界没有正式调整，我仍负责最终交付，但同事已经开始处理部分客户沟通。",
    targetDimension: "resource",
  },
  {
    question: "你是否看到对方已经在准备接替你的工作？",
    answer:
      "他在会议里开始承担更多对接工作，但我还没有看到明确的接替节点或正式替代决定。",
    targetDimension: "replace",
  },
];

const history: QAItem[] = answers.map((item) => ({
  ...item,
  classified: classifyText(item.answer),
}));

const report = generateReport(initial, history, "deep");
const dimensions = Object.fromEntries(report.dimensions.map((dimension) => [dimension.key, dimension.score])) as Record<Dimension, number>;
const reversal = reversalAssessment(report);
const renderedHeadline = headlineFor(report);
const fullText = collectReportText(report);

assertBetween("total_score", report.totalScore, 62, 72);
assertBetween("resource", dimensions.resource, 0, 85);
assertBetween("info", dimensions.info, 0, 80);
assertBetween("relation", dimensions.relation, 0, 70);
assertBetween("power", dimensions.power, 0, 70);
assertBetween("replace", dimensions.replace, 45, 65);
if (report.dimensions.some((dimension) => dimension.score >= 100)) {
  throw new Error(`dimension score reached 100: ${JSON.stringify(dimensions)}`);
}
if (/了解其他选择|评估后续方向|启动\s*Plan\s*B|外部机会|内部转岗|调整团队/i.test(renderedHeadline)) {
  throw new Error(`headline contains forbidden career choice copy: ${renderedHeadline}`);
}
if (/外部机会|内部转岗|调整团队|启动\s*Plan\s*B/i.test(fullText)) {
  throw new Error(`report contains forbidden career action copy: ${fullText.match(/外部机会|内部转岗|调整团队|启动\s*Plan\s*B/i)}`);
}
if (reversal.label === "有限") {
  throw new Error(`adjustable space is too pessimistic: ${reversal.label}`);
}
if (report.trend.duration !== "约 2 周内连续出现") {
  throw new Error(`unexpected trend duration: ${report.trend.duration}`);
}
if (!report.dimensions.some((dimension) => dimension.supportingFacts.length > 0)) {
  throw new Error(`no evidence chain: missing supporting facts`);
}
if (!report.dimensions.some((dimension) => dimension.reverseFacts.length > 0)) {
  throw new Error(`no reverse evidence present`);
}
if (!report.dimensions.some((dimension) => /信息不足|低权重处理/.test(dimension.explain))) {
  throw new Error(`missing information gap wording in dimensions`);
}
if (cleanList(report.actions.in72h).length < 1 || cleanList(report.actions.in7d).length < 1 || cleanList(report.actions.in30d).length < 1) {
  throw new Error(`missing deep action plan content`);
}

console.log("RC2.2 deep e2e fixture: PASS");
console.log(JSON.stringify({
  total_score: report.totalScore,
  dimensions,
  headline: renderedHeadline,
  trend_duration: report.trend.duration,
  adjustable_space: reversal.label,
}, null, 2));

function assertBetween(label: string, value: number, min: number, max: number) {
  if (typeof value !== "number" || value < min || value > max) {
    throw new Error(`${label} expected ${min}-${max}, got ${String(value)}`);
  }
}

function collectReportText(report: Report): string {
  return [
    report.headline,
    report.totalLevel,
    ...report.topSignals,
    ...report.explanations,
    ...report.knownFacts,
    ...report.inferences,
    ...report.openAssumptions,
    report.misjudgment,
    report.trend.verdict,
    report.trend.frequency,
    report.trend.duration,
    report.trend.continuous,
    report.trend.coreResource,
    report.trend.successor,
    ...report.observeSignals,
    ...report.dontDo,
    ...report.shouldDo,
    ...report.actions.in72h,
    ...report.actions.in7d,
    ...report.actions.in30d,
    ...report.dimensions.flatMap((dimension) => [
      dimension.level,
      dimension.explain,
      ...dimension.supportingFacts,
      ...dimension.reverseFacts,
    ]),
  ].join("\n");
}
