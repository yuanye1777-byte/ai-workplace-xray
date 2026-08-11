// 直接测试：同一组输入经过固定后的 classifier -> generateReport，
// 验证深度报告是否生成反向证据区块
// 运行：node --experimental-strip-types scripts/rc-test-report-reverse.mjs

import { classifyText } from "../src/lib/ai/classifier.ts";
import { generateReport } from "../src/lib/ai/report.ts";

const TEST_INPUT = `最近三个月，我明显感觉到部门里的氛围变了。以前每周一的例会都是我主持的，现在领导突然让另一个同事代替我主持。我负责跟进两年多的核心客户项目，上个月被通知转交给另一个团队对接，理由是优化资源配置。我之前申请的预算审批也被卡住了，而同组其他人的申请都正常通过。部门新来了一个年轻同事，领导让他跟着我学习业务流程，但我感觉他更像是来接替我的。最近几次重要的决策会议，我都没有被邀请参加，以前这些会议我都是必须出席的。`;

const ANSWERS = [
  "大概从三个月前开始，最开始是周一例会不再由我主持，领导让同事小王代替。之后核心客户项目被转交，预算审批被卡，这些都是过去两三个月陆续发生的，不是一次性的事。",
  "过去一个月，本该由我决定的项目预算审批被卡住了，但同组其他人的申请正常通过。我之前有20万以内的审批权，现在超过5万就需要上级再签。",
  "我原本负责的核心客户项目上个月被转交给另一个团队，领导说是优化资源配置。另外我手上两个长期跟进的客户，也从上个月开始换成别人对接了。",
  "最近几次重要的季度规划会议和项目评审会，我都没有收到邀请。以前这些会议我都是必须出席的，后来是从同事的闲聊中才知道开了这些会。",
  "新来的同事小李，领导安排他跟着我学习业务流程和客户关系。他已经开始独立接触我之前负责的客户了，而且领导在内部群里表扬了他。",
  "领导现在找我的频率明显减少了，以前每周至少单独沟通一到两次，现在基本上两三周才有一次。他现在遇到重要事情第一个找的人是小王。",
  "关于反向来看：上个月领导确实单独交给我一个紧急的跨部门协调任务，并在月度会上口头表扬了我的处理方式。但除此之外，目前没有其他正面信号。",
  "这些变化让我非常焦虑和不安，我觉得领导可能对我有意见，但又不确定。我开始怀疑是不是自己的能力出了问题，或者有人在背后说了什么。",
  "我尝试过找领导沟通，但他总是说没什么特别的，就是正常调整。我也问过同事，他们也不太清楚具体情况。我感觉自己被蒙在鼓里。",
  "目前还没有明确的承接者完全接替我的工作，小李虽然在学习，但还没有正式接手。我的核心资源虽然被转移了一部分，但手里还有一些长期客户关系。关键会议确实没有叫我了，这个是确定的。",
];

const history = ANSWERS.map((answer, i) => ({
  question: `问题 ${i + 1}`,
  answer,
  classified: classifyText(answer),
  targetDimension: ["power", "resource", "info", "relation", "replace", "clarify", "reverse", "trend", "successor", "stability"][i],
}));

const report = generateReport(TEST_INPUT, history);

console.log("=== Report Reverse Evidence Check ===\n");
console.log(`headline: ${report.headline}`);
console.log(`totalScore: ${report.totalScore} / level: ${report.totalLevel}`);
console.log(`reversalSpace: ${report.reversalSpace}`);
console.log(`\ntopSignals (${report.topSignals.length}):`);
report.topSignals.forEach((s, i) => console.log(`  #${i + 1} ${s.slice(0, 80)}`));

console.log(`\n=== Dimensions with reverseFacts ===`);
let totalReverseFacts = 0;
report.dimensions.forEach((d) => {
  const cnt = d.reverseFacts?.length ?? 0;
  totalReverseFacts += cnt;
  console.log(`  ${d.key}: score=${d.score}, reverseFacts=${cnt}`);
  if (cnt > 0) {
    d.reverseFacts.forEach((f, i) => console.log(`    - ${f.slice(0, 120)}`));
  }
});

console.log(`\n=== Reverse Evidence Summary ===`);
console.log(`Total reverseFacts across all dimensions: ${totalReverseFacts}`);
console.log(`Has reverse evidence section: ${report.dimensions.some((d) => (d.reverseFacts?.length ?? 0) > 0)}`);

// Also show knownFacts / inferences / openAssumptions counts
console.log(`\n=== Report Sections ===`);
console.log(`knownFacts: ${report.knownFacts?.length ?? 0}`);
console.log(`inferences: ${report.inferences?.length ?? 0}`);
console.log(`openAssumptions: ${report.openAssumptions?.length ?? 0}`);
console.log(`actions.in72h: ${report.actions?.in72h?.length ?? 0}`);
console.log(`actions.in7d: ${report.actions?.in7d?.length ?? 0}`);
console.log(`actions.in30d: ${report.actions?.in30d?.length ?? 0}`);
console.log(`evidenceChain implied by facts: ${report.knownFacts?.length >= 3}`);
console.log(`infoGap implied by openAssumptions: ${(report.openAssumptions?.length ?? 0) > 0}`);

// Save report for reference
import fs from "fs";
import path from "path";
const outputPath = path.join(import.meta.dirname, "rc-rounds-output", "report-deep-local.json");
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf-8");
console.log(`\nReport saved to: ${outputPath}`);

// Final verdict
const hasReverse = totalReverseFacts > 0;
console.log(`\n=== VERDICT: ${hasReverse ? "PASS" : "FAIL"} ===`);
console.log(hasReverse
  ? "反向证据修复已传递到报告层：深度报告将渲染反向证据区块。"
  : "报告层仍未出现反向证据，需要进一步检查报告装配逻辑。");

process.exit(hasReverse ? 0 : 1);
