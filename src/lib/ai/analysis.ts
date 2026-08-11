// 五维风险评分 + 反向证据消抵

import type { Classified, Dimension, DimensionScore, QAItem } from "./types";
import { DIMENSION_LABEL } from "./types";

// 每个维度的加分证据关键词
const RISK_KEYWORDS: Record<Dimension, RegExp[]> = {
  power: [
    /(不再由我|不让我|绕过我|不让我决定|从.*变成.*执行|决策.*减少|拍板.*别人|不签字|不批我)/,
  ],
  resource: [
    /(转移|交给|分走|拿走|接手|划走).*(项目|客户|预算|权限|资源)/,
    /(核心|重要).*(客户|项目).*(?:换|给).*(?:别人|他|同事)/,
  ],
  info: [
    /(最后才知道|事后才|没通知我|没叫我|排除.*会议|没让我参加)/,
  ],
  relation: [
    /(不再找我|冷淡|不理我|减少沟通|不再一对一|不再单独找我)/,
    /(更信任|更依赖).*(别人|他)/,
  ],
  replace: [
    /(新人|新同事|某某|同事).*(接手|接管|学.*工作|对接我的|接触我的)/,
    /(带走|接走).*下属/,
  ],
};

function scoreOne(
  dim: Dimension,
  history: QAItem[],
): { score: number; supporting: string[]; reverse: string[] } {
  const supporting: string[] = [];
  const reverse: string[] = [];
  let raw = 0;

  for (const h of history) {
    const c = h.classified;
    if (!c) continue;

    // 该轮是否命中该维度
    const dimHit = c.dimensions.includes(dim);
    if (dimHit) {
      // 事实的权重最高
      raw += Math.min(c.facts.length, 3) * 10;
      // 判断/推测降权
      raw += Math.min(c.judgments.length, 2) * 4;
      raw += Math.min(c.inferences.length, 2) * 3;
    }

    // 关键词强证据
    for (const re of RISK_KEYWORDS[dim]) {
      for (const f of c.facts) {
        if (re.test(f)) {
          raw += 12;
          if (supporting.length < 3) supporting.push(f);
        }
      }
    }

    // 反向证据
    for (const rev of c.reverseEvidence) {
      if (dimHit) {
        raw -= 10;
        if (reverse.length < 2) reverse.push(rev);
      }
    }

    // 时间趋势 - 长时间持续加分
    if (h.targetDimension === "trend") {
      if (/(三个月|3个月|半年|一直|持续|越来越)/.test(h.answer)) raw += 6;
      if (/(就一次|偶尔|最近才)/.test(h.answer)) raw -= 4;
    }
  }

  // 归一到 0-100
  const score = Math.max(0, Math.min(100, 20 + raw));
  return { score, supporting, reverse };
}

export function levelOf(score: number): string {
  if (score <= 20) return "正常状态";
  if (score <= 40) return "轻度变化";
  if (score <= 60) return "值得关注";
  if (score <= 80) return "变化明显";
  return "变化显著";
}

export function scoreDimensions(history: QAItem[]): DimensionScore[] {
  return (Object.keys(DIMENSION_LABEL) as Dimension[]).map((dim) => {
    const { score, supporting, reverse } = scoreOne(dim, history);
    const explain = buildExplain(dim, score, supporting.length, reverse.length);
    return {
      key: dim,
      score,
      level: levelOf(score),
      explain,
      supportingFacts: supporting,
      reverseFacts: reverse,
    };
  });
}

function buildExplain(
  dim: Dimension,
  score: number,
  supportCount: number,
  reverseCount: number,
): string {
  const label = DIMENSION_LABEL[dim];
  const signalWord = supportCount > 0 ? `${supportCount} 条` : "若干";
  if (score <= 20)
    return `${label}维度暂无明显变化信号${reverseCount > 0 ? "，且存在正向证据" : ""}。`;
  if (score <= 40)
    return `${label}维度出现 ${signalWord}零散信号，尚未形成趋势。`;
  if (score <= 60)
    return `${label}维度出现 ${signalWord}可观察到的变化，值得留意${reverseCount > 0 ? "，但仍有部分反向证据" : ""}。`;
  if (score <= 80)
    return `${label}维度出现 ${signalWord}较为明显的变化，已呈现一定模式。`;
  return `${label}维度变化较多，建议重点关注并持续观察。`;
}

export function aggregateTotal(dims: DimensionScore[]): {
  total: number;
  level: string;
} {
  // 加权：权力 + 资源 + 替代风险 权重更高
  const weights: Record<Dimension, number> = {
    power: 1.2, resource: 1.2, info: 1.0, relation: 1.0, replace: 1.1,
  };
  let num = 0;
  let den = 0;
  for (const d of dims) {
    num += d.score * weights[d.key];
    den += weights[d.key];
  }
  const total = Math.round(num / den);
  return { total, level: levelOf(total) };
}