// 展示层适配：只做文案清洗与信息层级整理，不改变任何分析数据或评分。
import type { Dimension, Report } from "@/lib/ai/types";

// 用户端可读的维度名称（仅展示用，不改变数据结构中的 key）
export const FRIENDLY_DIMENSION_LABEL: Record<Dimension, string> = {
  power: "决策参与",
  resource: "核心资源",
  info: "信息透明度",
  relation: "关键关系",
  replace: "发展空间",
};

// 需要在用户端隐藏的内部分析标注
const INTERNAL_MARKERS = [
  "【推断，非事实】",
  "被架空检测器",
  "被架空检测",
  "（可能性，非事实）",
  "(可能性，非事实)",
  "（推断，非事实）",
  "推断，非事实",
  "可能性，非事实",
  "人工智能推断",
  "模型推断",
  "系统判断",
  "系统性框架空",
  "AI 无法直接判断领导真实想法",
  "AI无法直接判断领导真实想法",
  "AI 无法直接判断领导的真实想法",
  "AI 无法判断",
  "AI无法判断",
  "AI 推断",
  "AI推断",
  "非事实",
];

export function cleanCopy(text: string): string {
  let out = text ?? "";
  for (const m of INTERNAL_MARKERS) out = out.split(m).join("");
  return out
    // 移除任何残留的内部分析标签，例如【推断】【AI 分析】（模型推断）（系统判断）
    .replace(/[【\[(（]\s*(AI|人工智能|模型|系统)?\s*[^】\])）]{0,12}(推断|非事实|系统判断|模型判断)[^】\])）]{0,12}\s*[】\])）]/g, "")
    .replace(/^[\s：:，,。、·\-—]+/, "")
    .replace(/[，,、]\s*(?=。)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^AI\s*/, "")
    .trim();
}

export function cleanList(items: string[] | undefined): string[] {
  return (items ?? []).map(cleanCopy).filter((s) => s.length > 0);
}

const ORDINALS = ["一", "二", "三", "四", "五"];

// 「解释 A：xxx，yyy。」→ { title: "可能性一：xxx", detail: "yyy。" }
export function toPossibilities(
  explanations: string[],
): { title: string; detail: string }[] {
  return cleanList(explanations)
    .slice(0, 3)
    .map((raw, i) => {
      const body = raw.replace(/^解释\s*[A-Za-z]\s*[:：]\s*/, "");
      const sep = body.search(/[，,]/);
      const head = sep > 0 ? body.slice(0, sep) : body;
      const rest = sep > 0 ? body.slice(sep + 1).trim() : "";
      return {
        title: `可能性${ORDINALS[i] ?? i + 1}：${head.replace(/[。.]$/, "")}`,
        detail: rest,
      };
    });
}

export const REPORT_DISCLAIMER =
  "本工具用于职场局势信号分析与观察辅助，不替代专业建议。所有分析基于你提供的信息，请结合实际情况持续验证。";

export const JUDGEMENT_NOTE =
  "以下判断基于你目前提供的信息，仅代表当前阶段的分析，后续需要通过实际行为继续验证。";

export const POSSIBILITY_NOTE =
  "以上是基于目前信息的可能性分析，后续需要通过实际行为继续验证。";

export function reversalHint(space: Report["reversalSpace"]): string {
  if (space === "高")
    return "目前仍有较大空间：通过增加关键项目参与度、恢复核心资源掌控和提高决策可见度，可以改变局面。";
  if (space === "中")
    return "仍有可调整的余地，但需要在近期主动争取关键项目与决策的参与机会。";
  return "可调整空间有限，建议在稳住现有资源的同时，同步准备其他选择。";
}

/* ---------------- 风险等级 / 结论（展示层，不改变任何评分数据） ---------------- */

// 页面统一使用的五级名称
const LEVEL_ALIAS: Record<string, string> = {
  正常状态: "正常状态",
  轻度变化: "轻度变化",
  值得关注: "值得关注",
  变化明显: "变化明显",
  变化显著: "变化显著",
};

export function friendlyLevel(level: string): string {
  return LEVEL_ALIAS[level] ?? cleanCopy(level);
}

function dimsAtRisk(report: Report, threshold = 45): Dimension[] {
  return report.dimensions.filter((d) => d.score >= threshold).map((d) => d.key);
}

function factCount(report: Report): number {
  return cleanList(report.knownFacts).length;
}

// 一句话结论：由多维信号与证据量共同决定，避免单一事件式的确定性结论
export function headlineFor(report: Report): string {
  const normalizedHeadline = cleanCopy(report.headline);
  if (normalizedHeadline.includes("30 天观察线")) {
    return normalizedHeadline;
  }

  const risky = dimsAtRisk(report).length;
  const facts = factCount(report);
  const score = report.totalScore;

  if (facts < 2) {
    return "目前信息不足，暂不支持形成明确结论，建议先按下方清单记录可观察到的具体事件。";
  }
  if (score <= 20 || risky === 0) {
    return "目前的变化更接近正常的职责调整，暂未看到明确的组织位置下降信号。";
  }
  if (score <= 40 || risky === 1) {
    return "出现零散异常信号，但尚未形成明确趋势，建议继续观察。";
  }
  if (score <= 60 || risky === 2) {
    return "多个关键维度出现持续变化，需要重点观察这些变化是否继续扩大。";
  }
  if (score <= 80) {
    return "核心职责与资源出现持续转移，组织位置出现较明显变化，建议在稳住现有工作的同时，也开始了解其他选择。";
  }
  return "多个维度出现持续性变化，组织位置已有较为明显的改变。建议在稳住现有资源的同时，主动评估后续方向。";
}

/* ---------------- 「还不能下结论」结构化 ---------------- */

export function conclusionBlocks(report: Report): {
  confirmed: string;
  unconfirmed: string;
  observe: string[];
} {
  const facts = cleanList(report.knownFacts);
  const risky = report.dimensions
    .filter((d) => d.score >= 45)
    .sort((a, b) => b.score - a.score);

  const confirmed =
    facts.length > 0
      ? `你已经明确描述过 ${facts.length} 项可观察到的变化，其中最集中的是${
          risky.length > 0
            ? risky.map((d) => FRIENDLY_DIMENSION_LABEL[d.key]).slice(0, 2).join("、")
            : "日常职责安排"
        }方面的变化。`
      : "目前你提供的多为感受和判断，可观察到的具体事件还比较少。";

  const unconfirmed =
    risky.length >= 2
      ? "这些变化是否已经导致你的组织位置实质下降，目前仍无法确认；也无法据此判断相关人员的真实想法。"
      : "这些变化究竟是阶段性的职责调整，还是组织位置的变化，目前还无法确认。";

  return { confirmed, unconfirmed, observe: dynamicObserveSignals(report) };
}

/* ---------------- 未来 30 天观察信号（按维度动态挑选） ---------------- */

const OBSERVE_BY_DIM: Record<Dimension, string> = {
  power: "观察本该由你拍板的事情，是否仍然由你做最终决定。",
  resource: "观察原本由你负责协调的资源与项目，是否持续绕过你。",
  info: "观察关键会议与关键信息，你是否仍稳定出现在名单中。",
  relation: "观察重要事情发生时，上级是否仍然第一时间直接找你。",
  replace: "观察是否有固定的某个人持续接手你原本负责的核心工作。",
};

export function dynamicObserveSignals(report: Report): string[] {
  const ranked = [...report.dimensions].sort((a, b) => b.score - a.score);
  const picked = ranked.slice(0, 3).map((d) => OBSERVE_BY_DIM[d.key]);
  const backend = cleanList(report.observeSignals);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...picked, ...backend]) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length === 3) break;
  }
  return out;
}

/* ---------------- 可调整空间（结合五维现状） ---------------- */

export function reversalAssessment(report: Report): { label: string; hint: string } {
  const get = (k: Dimension) => report.dimensions.find((d) => d.key === k)?.score ?? 0;
  const power = get("power");
  const resource = get("resource");
  const relation = get("relation");
  const intact: string[] = [];
  if (power < 45) intact.push("决策参与");
  if (resource < 45) intact.push("核心资源");
  if (relation < 45) intact.push("关键关系");

  if (intact.length >= 2) {
    return {
      label: "较大",
      hint: `你在${intact.slice(0, 2).join("和")}上仍有基础，短期内主动争取一个关键项目的参与，就有机会把局面拉回来。`,
    };
  }
  if (intact.length === 1) {
    return {
      label: "中等",
      hint: `目前主要还剩下${intact[0]}这一条通道，需要尽快围绕它重新建立可见度，同时稳住手上剩余的资源。`,
    };
  }
  return {
    label: "有限",
    hint: "决策参与、核心资源与关键关系都出现变化，建议在稳住现有工作的同时，也开始了解其他选择。",
  };
}
