import { classifyText } from "../src/lib/ai/classifier";
import { generateReport } from "../src/lib/ai/report";
import type { Dimension, QAItem, Report } from "../src/lib/ai/types";
import { headlineFor } from "../src/lib/report-presenter";

const initial = "最近两周，我感觉自己在团队里的位置有点变化。原来我负责推进的一个核心客户项目，现在领导让新同事一起参与，并让他直接跟客户同步几次进展。上周有两次关键会议我不是第一时间被通知，是同事转发给我的。但目前没有正式交接通知，我的系统权限和客户资料访问都还在，也没有公开负面评价。领导这周仍然单独交给我一个紧急任务。";

const answers: Array<Pick<QAItem, "question" | "answer" | "targetDimension">> = [
  {
    question: "最近最具体的资源变化是什么？",
    answer: "最近两周核心客户项目开始让新同事一起参与，他直接跟客户同步了两次进展，但没有正式交接通知，客户最终方案还是让我确认。",
    targetDimension: "resource",
  },
  {
    question: "关键信息和会议触达有什么变化？",
    answer: "上周有两次关键会议我不是第一时间被通知，是同事转发给我的，但我后来都参加了，也能看到会议纪要。",
    targetDimension: "info",
  },
  {
    question: "有没有反向证据？",
    answer: "有，领导这周仍然单独交给我一个紧急任务，我的系统权限没有变化，也没有公开负面评价。",
    targetDimension: "reverse",
  },
  {
    question: "有没有完全替代或正式调整？",
    answer: "目前没有完全替代，也没有正式交接通知，只是新同事参与变多，我担心他可能以后接手更多。",
    targetDimension: "replace",
  },
  {
    question: "这些变化持续多久？",
    answer: "就是最近两周连续出现，最近两次关键会议通知都晚了一点，时间还不算长。",
    targetDimension: "trend",
  },
];

const history: QAItem[] = answers.map((item) => ({
  ...item,
  classified: classifyText(item.answer),
}));

const report = generateReport(initial, history, "quick");
const dimensions = Object.fromEntries(report.dimensions.map((dimension) => [dimension.key, dimension.score])) as Record<Dimension, number>;
const fullText = collectReportText(report);
const headline = headlineFor(report);

assertBetween("total_score", report.totalScore, 55, 68);
assertBetween("development / replace", dimensions.replace, 45, 65);

if (report.totalScore >= 70) {
  throw new Error(`quick total_score rebounded to ${report.totalScore}`);
}

if (dimensions.resource > 85) {
  throw new Error(`resource exceeded quick cap: ${dimensions.resource}`);
}

if (dimensions.info > 80) {
  throw new Error(`info exceeded quick cap: ${dimensions.info}`);
}

if (Object.values(dimensions).some((score) => score >= 100)) {
  throw new Error(`dimension reached 100: ${JSON.stringify(dimensions)}`);
}

assertNotContains("headline career choice", headline, /了解其他选择|评估后续方向|启动\s*Plan\s*B|外部机会|内部转岗|调整团队/i);
assertNotContains("template copy", fullText, /变化较多，建议重点关注并持续观察|可能意味着该维度上你正经历变化|暂未看到强支撑事实|有风险信号，但当前报告缺少可直接引用的事实/);
assertNotContains("quick career actions", fullText, /Plan\s*B|外部机会|了解外部机会|内部转岗|调整团队/i);
assertNotContains("duration overstatement", report.trend.duration, /1\s*个月以上|一个月以上/);

if (!/约 2 周内连续出现|近期连续出现，尚不能确认是长期趋势/.test(report.trend.duration)) {
  throw new Error(`unexpected quick trend duration: ${report.trend.duration}`);
}

console.log("RC2.1 quick e2e fixture: PASS");
console.log(JSON.stringify({
  total_score: report.totalScore,
  dimensions,
  headline,
  trend_duration: report.trend.duration,
}, null, 2));

function assertBetween(label: string, value: number, min: number, max: number) {
  if (value < min || value > max) {
    throw new Error(`${label} expected ${min}-${max}, got ${value}`);
  }
}

function assertNotContains(label: string, text: string, pattern: RegExp) {
  if (pattern.test(text)) {
    throw new Error(`${label} contains forbidden copy: ${text.match(pattern)?.[0] ?? pattern.source}`);
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
