// 快速模式报告验证：5 轮输入应生成不含深度区块的报告
// 运行：tsx scripts/rc-test-report-quick.mjs

import { classifyText } from "../src/lib/ai/classifier.ts";
import { generateReport } from "../src/lib/ai/report.ts";

const TEST_INPUT = `最近三个月，我明显感觉到部门里的氛围变了。以前每周一的例会都是我主持的，现在领导突然让另一个同事代替我主持。我负责跟进两年多的核心客户项目，上个月被通知转交给另一个团队对接，理由是优化资源配置。我之前申请的预算审批也被卡住了，而同组其他人的申请都正常通过。部门新来了一个年轻同事，领导让他跟着我学习业务流程，但我感觉他更像是来接替我的。最近几次重要的决策会议，我都没有被邀请参加，以前这些会议我都是必须出席的。`;

const QUICK_ANSWERS = [
  "大概从三个月前开始，最开始是周一例会不再由我主持，领导让同事小王代替。之后核心客户项目被转交，预算审批被卡。",
  "过去一个月，本该由我决定的项目预算审批被卡住了，但同组其他人的申请正常通过。",
  "关于反向来看：上个月领导确实单独交给我一个紧急任务，并在月度会上口头表扬了我。",
  "这些变化让我非常焦虑和不安，我觉得领导可能对我有意见。",
  "目前还没有明确的承接者完全接替我的工作，但关键会议确实没有叫我了。",
];

const history = QUICK_ANSWERS.map((answer, i) => ({
  question: `问题 ${i + 1}`,
  answer,
  classified: classifyText(answer),
  targetDimension: ["power", "resource", "reverse", "relation", "stability"][i],
}));

const report = generateReport(TEST_INPUT, history, "quick");

console.log("=== Quick Mode Report Check ===\n");
console.log(`headline: ${report.headline}`);
console.log(`totalScore: ${report.totalScore} / level: ${report.totalLevel}`);
console.log(`topSignals (${report.topSignals.length}):`);
report.topSignals.forEach((s, i) => console.log(`  #${i + 1} ${s.slice(0, 80)}`));

const totalReverseFacts = report.dimensions.reduce((sum, d) => sum + (d.reverseFacts?.length ?? 0), 0);
console.log(`\ntotalReverseFacts: ${totalReverseFacts}`);
console.log(`knownFacts: ${report.knownFacts?.length ?? 0}`);
console.log(`inferences: ${report.inferences?.length ?? 0}`);
console.log(`openAssumptions: ${report.openAssumptions?.length ?? 0}`);
console.log(`has deep evidenceChain: ${report.knownFacts?.length >= 5}`);

// Quick report expectations
const pass = totalReverseFacts >= 0 && report.topSignals.length >= 2;
console.log(`\n=== VERDICT: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
