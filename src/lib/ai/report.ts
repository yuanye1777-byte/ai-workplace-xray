// 报告生成 - 从问诊记录和维度分数装配一份 X 光报告

import { aggregateTotal, scoreDimensions } from "./analysis";
import type { DimensionScore, QAItem, Report } from "./types";

function collectByKind(history: QAItem[]) {
  const facts: string[] = [];
  const emotions: string[] = [];
  const judgments: string[] = [];
  const inferences: string[] = [];
  const reverse: string[] = [];
  for (const h of history) {
    const c = h.classified;
    if (!c) continue;
    facts.push(...c.facts);
    emotions.push(...c.emotions);
    judgments.push(...c.judgments);
    inferences.push(...c.inferences);
    reverse.push(...c.reverseEvidence);
  }
  return { facts, emotions, judgments, inferences, reverse };
}

function pickTopSignals(dims: DimensionScore[], factsFallback: string[]): string[] {
  const bucket: { score: number; text: string }[] = [];
  for (const d of dims) {
    for (const f of d.supportingFacts) {
      bucket.push({ score: d.score, text: f });
    }
  }
  bucket.sort((a, b) => b.score - a.score);
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const b of bucket) {
    if (seen.has(b.text)) continue;
    seen.add(b.text);
    uniq.push(b.text);
    if (uniq.length === 3) break;
  }
  while (uniq.length < 3 && factsFallback.length > 0) {
    const f = factsFallback.shift()!;
    if (!seen.has(f)) {
      uniq.push(f);
      seen.add(f);
    }
  }
  if (uniq.length === 0) {
    return [
      "暂无明确信号：从你目前的描述来看，尚不足以判断组织位置是否发生变化。",
      "但仍存在若干值得留意的地方，建议继续观察。",
      "建议按下方「未来观察」清单记录事件。",
    ];
  }
  return uniq;
}

function buildHeadline(total: number): string {
  if (total <= 20) return "目前没有明显的组织位置变化，但仍建议持续留意。";
  if (total <= 40) return "出现零散异常信号，还不构成明确趋势，属于早期留意区间。";
  if (total <= 60) return "你注意到一些权力与资源相关的持续变化，值得重点关注。";
  if (total <= 80) return "核心权力与资源出现持续转移，存在较明显的组织位置变化。";
  return "多个维度出现持续性变化，建议尽快评估当前局面并做出主动选择。";
}

function reversalOf(total: number, reverseCount: number): "高" | "中" | "低" {
  const boost = reverseCount >= 2 ? 1 : 0;
  if (total <= 40) return "高";
  if (total <= 65) return boost ? "高" : "中";
  if (total <= 80) return boost ? "中" : "低";
  return "低";
}

export function generateReport(initial: string, history: QAItem[]): Report {
  // P0-1: 防御性校验 — 输入为空时返回明确的「无效报告」而非让渲染层崩溃
  if (!history || history.length === 0) {
    return emptyReport();
  }
  const dims = scoreDimensions(history);
  const { total, level } = aggregateTotal(dims);
  const { facts, judgments, inferences, reverse } = collectByKind(history);

  const trendAnswer = history.find((h) => h.targetDimension === "trend")?.answer ?? "";
  const reverseAnswer = history.find((h) => h.targetDimension === "reverse")?.answer ?? "";
  const isTrend = total >= 50;
  const resourceDim = dims.find((d) => d.key === "resource")!;
  const replaceDim = dims.find((d) => d.key === "replace")!;

  const knownFacts = Array.from(new Set(facts)).slice(0, 6);
  const aiInferences = buildAIInferences(dims);
  const openAssumptions = buildAssumptions(judgments, inferences);

  const explanations = buildExplanations(dims);

  const report: Report = {
    headline: buildHeadline(total),
    totalScore: total,
    totalLevel: level,
    dimensions: dims,
    topSignals: pickTopSignals(dims, [...knownFacts]),
    trend: {
      verdict: isTrend ? "更接近持续变化，而非偶然" : "更接近偶然，但存在苗头",
      frequency: isTrend ? "较高：多次重复出现" : "偶发：目前次数有限",
      duration:
        /(三个月|3个月|半年|一年|一直|持续)/.test(trendAnswer)
          ? "已持续 1 个月以上"
          : trendAnswer
            ? "持续时间较短或尚未明确"
            : "未获取到明确时间线",
      continuous: isTrend ? "多个维度同时出现负面信号" : "维度之间尚未连成一片",
      coreResource: resourceDim.score >= 50 ? "已涉及核心资源" : "尚未明显触及核心资源",
      successor: replaceDim.score >= 50 ? "已出现潜在承接者" : "暂未看到明确承接者",
    },
    explanations,
    knownFacts:
      knownFacts.length > 0
        ? knownFacts
        : ["你在问诊中提供的描述较多为感受和判断，可观察事实较少。"],
    inferences: aiInferences,
    openAssumptions,
    misjudgment: buildMisjudgment(judgments, inferences, reverse),
    reversalSpace: reversalOf(total, reverse.length),
    observeSignals: [
      "下属是否越来越多地被领导直接安排，绕过你",
      "你手上的核心资源（客户 / 项目 / 权限）是否继续被转移",
      "关键会议与关键决策，你是否仍稳定出现在名单中",
    ],
    dontDo: [
      "不建议立刻找领导直接质问——信息不对称时贸然行动可能适得其反。",
      "不要在同事面前公开抱怨或表达不满——可能被误读为态度问题。",
      "不要拿这份报告去直接质问领导或同事——它是你的思考工具，不是对质的武器。",
    ],
    shouldDo: [
      "把最近 30 天的异常事件写成时间线，只写可观察到的行为，不写情绪。",
      "有意识地重新出现在关键会议和决策环节，通过实际行动制造可见度。",
      "在做好本职的前提下，同步了解外部机会或内部其他岗位——不是为了立刻离开，而是恢复选择的主动权。",
    ],
    actions: {
      in72h: [
        "只整理事实，不质问、不摊牌：把过去 30 天的异常事件按时间排列，只写可观察到的具体行为。",
        "记录当前你手上仍然掌握的核心资源清单（项目 / 客户 / 数据 / 权限）。",
        "明确写下你在组织里最重要的 3 个关键人（你最需要他们看到你价值的人）。",
      ],
      in7d: [
        "主动发起一次低冲突的一对一沟通（与直接上级或关键业务方），围绕业务目标和职责边界进行确认，不涉及情绪或不满。",
        "在至少一个重要会议或决策环节中，主动承担一件有可见度的任务。",
        "更新一份个人成果清单或对外简历，不是为了立刻离开，而是为了恢复选择空间的感知。",
      ],
      in30d: [
        "持续观察 3 个关键信号：关键会议的参与情况、核心资源的分配变化、决策权的实际行使。",
        "如果信号持续恶化，开始评估是否需要内部转岗、调整团队或了解外部机会。",
        "设定一个明确的「判断截止日」——在 X 月 X 日前，如果以下可观察指标没有改善，则启动 Plan B。",
      ],
    },
  };

  // 避免 initial 未使用告警（未来接入 LLM 时会传递）
  void initial;
  // P0-2: 一致性校验 — headline / topSignals / scores 必须对齐
  return validateConsistency(report, total);
}

/** P0-2 + P1-1: 校验 headline / topSignals / scores / level 的一致性 */
function validateConsistency(report: Report, total: number): Report {
  // 1. 如果 topSignals 全是 fallback 文案，用维度分数重新生成
  const fallbackPatterns = /暂无明确|尚不足以|建议按下方|值得留意|目前能确认|以上信号来自|无法判定|不太确定/;
  const allFallback = report.topSignals.every((s) => fallbackPatterns.test(s));
  if (allFallback && total > 20) {
    const newSignals: string[] = [];
    for (const d of [...report.dimensions].sort((a, b) => b.score - a.score)) {
      for (const f of d.supportingFacts) {
        if (!newSignals.includes(f)) newSignals.push(f);
        if (newSignals.length >= 3) break;
      }
      if (newSignals.length >= 3) break;
    }
    if (newSignals.length > 0) {
      report = { ...report, topSignals: newSignals };
    }
  }

  // 2. 过滤 topSignals 中的总结句（不包含具体信息、只是过渡/总结）
  const summaryPatterns = /目前能确认的是|以上信号|请结合|建议.*观察|无法判定|不太确定|暂不|综上|总而言之|总体来说/;
  const filteredSignals = report.topSignals.filter((s) => !summaryPatterns.test(s) && s.length > 10);
  if (filteredSignals.length >= 2 && filteredSignals.length !== report.topSignals.length) {
    report = { ...report, topSignals: filteredSignals };
  }

  // 3. headline 与最高维度一致性：如果最高维度分数差异大，修正 headline
  const maxDim = [...report.dimensions].sort((a, b) => b.score - a.score)[0];
  if (maxDim && maxDim.score >= 55 && !/[变显升降变]化|转移|下降|减少|削弱/.test(report.headline)) {
    // 有明显风险但 headline 过于温和 → 重新生成
    report = { ...report, headline: buildHeadline(total) };
  }
  if (maxDim && maxDim.score <= 20 && total <= 30 && /持续转移|明显变化|显著/.test(report.headline)) {
    // 低风险但 headline 夸张 → 重新生成
    report = { ...report, headline: buildHeadline(total) };
  }

  // 4. totalScore ↔ totalLevel 一致性
  const expectedLevel = scoreToLevel(total);
  if (expectedLevel !== report.totalLevel) {
    report = { ...report, totalLevel: expectedLevel };
  }

  // 5. 如果 resource 维度 ≤ 20 但 headline 提"核心资源持续转移" → 修正
  const resourceDim = report.dimensions.find((d) => d.key === "resource");
  if (resourceDim && resourceDim.score <= 20 && /资源.*转移|资源.*变化/.test(report.headline)) {
    report = { ...report, headline: buildHeadline(total) };
  }

  return report;
}

/** P1-1: score → level 映射，保证 sanitizeReport 中 totalLevel 与 totalScore 一致 */
function scoreToLevel(total: number): string {
  if (total <= 20) return "正常状态";
  if (total <= 40) return "轻度变化";
  if (total <= 60) return "值得关注";
  if (total <= 80) return "变化明显";
  return "变化显著";
}

function buildAIInferences(dims: DimensionScore[]): string[] {
  const out: string[] = [];
  for (const d of dims) {
    if (d.score >= 55) {
      out.push(
        `【推断，非事实】${d.explain.replace("维度", "")} 可能意味着该维度上你正经历变化。`,
      );
    }
  }
  if (out.length === 0) {
    out.push("【推断，非事实】当前信号不足以推断存在系统性架空。");
  }
  return out.slice(0, 4);
}

function buildAssumptions(judgments: string[], inferences: string[]): string[] {
  const out: string[] = [];
  for (const j of judgments.slice(0, 2)) {
    out.push(`「${j}」——这是你的定性判断，尚未被具体行为验证。`);
  }
  for (const i of inferences.slice(0, 2)) {
    out.push(`「${i}」——这是你的推测，需要更多可观察证据支持。`);
  }
  if (out.length === 0) {
    out.push("目前没有明显的未验证假设。继续保持只记录事实的习惯。");
  }
  return out;
}

function buildExplanations(dims: DimensionScore[]): string[] {
  const sorted = [...dims].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const set = new Set<string>();
  set.add("解释 A：组织结构 / 业务方向调整，导致你的岗位职责被动重组（可能性，非事实）。");
  if (top.key === "relation" || top.key === "power") {
    set.add("解释 B：上级对你的信任正在下降，正逐步减少你可触达的信息与决策（可能性，非事实）。");
  }
  if (top.key === "replace" || top.key === "resource") {
    set.add("解释 C：可能有人正在分担或接替你的部分核心职责（可能性，非事实）。");
  }
  set.add("解释 D：短期项目节奏变化 / 领导个人风格变化造成的假象（可能性，非事实）。");
  return Array.from(set).slice(0, 3);
}

function buildMisjudgment(
  judgments: string[],
  inferences: string[],
  reverse: string[],
): string {
  const parts: string[] = [];
  if (judgments.length > 0) {
    parts.push("你可能把一些主观感受当作确凿的判断依据，但缺少对应的具体行为证据。");
  }
  if (inferences.length > 0) {
    parts.push("你把一些推断直接当成了结论——AI 无法据此判定他人的真实意图。");
  }
  if (reverse.length > 0) {
    parts.push("你的描述中同时存在反向证据（例如仍然被单独交付重要事情），说明局势尚未定型。");
  }
  if (parts.length === 0) {
    parts.push("你的描述较克制，主要基于可观察事实，误判风险较低。");
  }
  parts.push("请只用可观察行为（会议、决策、资源流向、信息触达）作证据。");
  return parts.join(" ");
}

/** P0-1: 返回一个安全的空报告，确保渲染层不会因缺失字段而崩溃 */
function emptyReport(): Report {
  return {
    headline: "信息不足，无法生成报告。请至少完成一轮问诊后再试。",
    totalScore: 0,
    totalLevel: "正常状态",
    dimensions: [
      { key: "power", score: 0, level: "正常状态", explain: "无数据", supportingFacts: [], reverseFacts: [] },
      { key: "resource", score: 0, level: "正常状态", explain: "无数据", supportingFacts: [], reverseFacts: [] },
      { key: "info", score: 0, level: "正常状态", explain: "无数据", supportingFacts: [], reverseFacts: [] },
      { key: "relation", score: 0, level: "正常状态", explain: "无数据", supportingFacts: [], reverseFacts: [] },
      { key: "replace", score: 0, level: "正常状态", explain: "无数据", supportingFacts: [], reverseFacts: [] },
    ],
    topSignals: ["当前没有足够信息进行分析。"],
    trend: {
      verdict: "无法判断",
      frequency: "无数据",
      duration: "无数据",
      continuous: "无数据",
      coreResource: "无数据",
      successor: "无数据",
    },
    explanations: ["信息不足，无法生成可能性分析。"],
    knownFacts: ["未获取到足够的可观察事实。"],
    inferences: ["当前信息不足以进行逻辑推断。"],
    openAssumptions: ["暂无明确假设。"],
    misjudgment: "信息不足，建议完成完整问诊流程。",
    reversalSpace: "低",
    observeSignals: ["建议完成完整问诊后查看观察清单。"],
    dontDo: ["不要在信息不足的情况下过早做出判断。"],
    shouldDo: ["完成问诊流程，提供更多具体事件描述。"],
    actions: {
      in72h: ["完成完整问诊。"],
      in7d: ["完成完整问诊。"],
      in30d: ["完成完整问诊。"],
    },
  };
}