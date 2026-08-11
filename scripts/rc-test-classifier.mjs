// 直接测试 classifier.ts 的反向证据修复
// 使用 node --experimental-strip-types 运行

import { classifyText } from "../src/lib/ai/classifier.ts";

const TEST_CASES = [
  {
    name: `深度模式第7轮回答（含"在会上表扬"）`,
    text: `关于反向来看：上个月领导确实单独交给我一个紧急的跨部门协调任务，并在月度会上口头表扬了我的处理方式。但除此之外，目前没有其他正面信号。`,
    expectReverse: true,
  },
  {
    name: `含"会议"二字的表扬场景`,
    text: `领导在部门会议上表扬了我对项目的贡献，还让其他同事向我学习。`,
    expectReverse: true,
  },
  {
    name: `含"会上"的表扬场景（修复触发条件）`,
    text: `在上周的总结会上，领导肯定了我的工作成果。`,
    expectReverse: true,
  },
  {
    name: `反向来看，单独交给我任务`,
    text: `反向来看，领导上周单独交给我一个重要客户的对接工作，并在会上点名表扬了我。`,
    expectReverse: true,
  },
  {
    name: `纯负面，不应有反向证据`,
    text: `领导最近完全不理我了，重要会议都不叫我，我的项目也被转走了。`,
    expectReverse: false,
  },
  {
    name: `模糊表述，含"觉得"推测词`,
    text: `我觉得领导最近对我态度变了，好像在疏远我，可能对我不满意。`,
    expectReverse: false,
  },
];

let pass = 0;
let fail = 0;

for (const tc of TEST_CASES) {
  const result = classifyText(tc.text);
  const hasReverse = result.reverseEvidence && result.reverseEvidence.length > 0;
  const ok = hasReverse === tc.expectReverse;

  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${tc.name}`);
  console.log(`   text: ${tc.text.slice(0, 60)}...`);
  console.log(`   expected reverseEvidence: ${tc.expectReverse}`);
  console.log(`   actual reverseEvidence: ${hasReverse} ${hasReverse ? JSON.stringify(result.reverseEvidence) : ""}`);
  console.log(`   facts: ${result.facts.length}, inferences: ${result.inferences.length}, emotions: ${result.emotions.length}, judgments: ${result.judgments.length}`);

  if (ok) pass++;
  else fail++;
}

console.log(`\n=== Results: ${pass}/${TEST_CASES.length} passed ===`);
process.exit(fail > 0 ? 1 : 0);
