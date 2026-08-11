// 动态问诊 - 根据历史动态选择下一个问题
//
// 目标：
//   - 每次一题
//   - 不诱导（"是不是被架空"这类禁问）
//   - 覆盖 5 个维度 + 时间趋势 + 反向验证
//   - 判断用户输入是"事实/判断/推测"，若只给出判断/推测，则先澄清具体行为
//   - 信息够就提前结束

import { classifyText } from "./classifier";
import type { Classified, Dimension, NextQuestion, QAItem, ScanMode } from "./types";

// 五维核心问题（非诱导性）
const DIM_QUESTIONS: Record<Dimension, string[]> = {
  power: [
    "和 3 个月前相比，你现在还能拍板决定哪些事情？可以举一两个例子。",
    "过去 1 个月，有没有本该由你决定的事情，最后由别人拍板？",
  ],
  resource: [
    "你原本负责的核心资源（项目 / 客户 / 预算 / 权限），最近有没有一部分转到别人手上？",
    "有没有你原本熟悉的项目或客户，现在换成别人对接？",
  ],
  info: [
    "最近有没有一些本该第一时间告诉你的信息，你却是最后才知道？",
    "过去一个月，有没有关键会议或讨论没有叫你？",
  ],
  relation: [
    "过去 3 个月，你和直属领导的沟通频率、方式发生了什么具体变化？",
    "领导现在遇到重要事情，第一个找的人是不是还是你？如果不是，是谁？",
  ],
  replace: [
    "最近有没有一个人，开始接触你原来负责的核心工作或人脉？",
    "有没有人正在被安排去学习或熟悉你在做的事情？",
  ],
};

const TREND_QUESTION =
  "你说的这些变化，大概是从什么时候开始的？是一次两次，还是过去两三个月一直在发生？";

const REVERSE_QUESTION =
  "反过来看：最近领导有没有仍然把某些重要事情单独交给你？或者在公开场合肯定过你？请具体说说。";

function clarifyFor(answer: string): string {
  const short = answer.length > 26 ? answer.slice(0, 26) + "…" : answer;
  return `你刚才提到「${short}」——这是一个具体发生过的事，还是你的判断？可以描述 1 到 2 个具体的行为或场景吗？`;
}

// 计算某维度已被"以事实形式"覆盖的强度
function factCoverage(history: QAItem[]): Record<Dimension, number> {
  const cov: Record<Dimension, number> = {
    power: 0, resource: 0, info: 0, relation: 0, replace: 0,
  };
  for (const h of history) {
    if (!h.classified) continue;
    const factsWeight = Math.min(h.classified.facts.length, 3);
    for (const d of h.classified.dimensions) {
      cov[d] += factsWeight;
    }
  }
  return cov;
}

function asked(history: QAItem[], q: string): boolean {
  return history.some((h) => h.question === q);
}

function pickForDimension(dim: Dimension, history: QAItem[]): string | null {
  for (const q of DIM_QUESTIONS[dim]) if (!asked(history, q)) return q;
  return null;
}

export function chooseNextQuestion(
  initial: string,
  history: QAItem[],
  minRounds: number = 10,
  scanMode: ScanMode = "deep",
): NextQuestion {
  const MIN_ROUNDS = minRounds;
  const MAX_ROUNDS = minRounds;

  const isQuick = scanMode === "quick";

  // 首题：根据初始输入涉及的维度出题
  if (history.length === 0) {
    const c = classifyText(initial);
    // 快速模式：取信号最强的维度（按事实数排序），而非仅取第一个
    const dimsWithFacts = c.dimensions.length > 0 ? c.dimensions : ["relation" as Dimension];
    const primary = dimsWithFacts[0];
    return {
      done: false,
      question: pickForDimension(primary, history) ?? DIM_QUESTIONS.relation[0],
      targetDimension: primary,
      reason: `首轮：从用户初始描述最相关的维度切入${isQuick ? "（快速模式）" : ""}`,
    };
  }

  const last = history[history.length - 1];
  const c = last.classified ?? classifyText(last.answer);

  // 上一轮以"判断/推测"为主 & 缺少事实 —— 先澄清
  const hasFact = c.facts.length > 0;
  const hasSubjective = c.judgments.length + c.inferences.length > 0;
  const clarifyDone = history.some((h) => h.targetDimension === "clarify");
  if (hasSubjective && !hasFact && !clarifyDone) {
    return {
      done: false,
      question: clarifyFor(last.answer),
      targetDimension: "clarify",
      reason: "上一轮以判断/推测为主，缺少可观察事实，追问澄清",
    };
  }

  // 如果刚完成澄清，回到当前最弱维度（而不继续原问题链）
  const justClarified = history.length >= 2 && history[history.length - 2].targetDimension === "clarify";
  if (justClarified) {
    const cov = factCoverage(history);
    const dimsByCov = (Object.keys(cov) as Dimension[]).sort((a, b) => cov[a] - cov[b]);
    for (const dim of dimsByCov) {
      const q = pickForDimension(dim, history);
      if (q) {
        return { done: false, question: q, targetDimension: dim, reason: `澄清后，补足最弱维度：${dim}` };
      }
    }
  }

  // 维度覆盖度：优先补足最弱的维度
  const coverage = factCoverage(history);
  const dimsSortedByCoverage = (Object.keys(coverage) as Dimension[]).sort(
    (a, b) => coverage[a] - coverage[b],
  );

  // 是否已经问过时间趋势
  const trendAsked = history.some((h) => h.targetDimension === "trend");
  // 是否已经做过反向验证
  const reverseAsked = history.some((h) => h.targetDimension === "reverse");

  const coveredDims = dimsSortedByCoverage.filter((d) => coverage[d] > 0).length;

  // ---- 快速模式专属策略 ----
  // 5 轮核心路径：事实 → 澄清(如需) → 时间趋势 → 反向验证 → 最强维度
  // P0-1: 硬上限 — 快速模式最多 MAX_ROUNDS 轮，超出直接结束
  if (isQuick) {
    if (history.length >= MAX_ROUNDS) {
      console.log(`[chooseNextQuestion] quick mode hard cap: history.length=${history.length} >= MAX_ROUNDS=${MAX_ROUNDS}, done=true`);
      return { done: true, reason: "快速扫描达到最大轮次" };
    }
    // 快问趋势（第 2 轮即可插入：history.length=1 时正在生成 Q2）
    if (!trendAsked && history.length >= 1) {
      return { done: false, question: TREND_QUESTION, targetDimension: "trend", reason: "快速模式：提前补时间趋势" };
    }
    // 快问反向（第 3 轮即可插入：history.length=2 时正在生成 Q3）
    if (!reverseAsked && history.length >= 2) {
      return { done: false, question: REVERSE_QUESTION, targetDimension: "reverse", reason: "快速模式：提前补反向证据" };
    }
    // 补最强变化维度（按 coverage 从高到低取，即目前有信号的维度优先深入）
    // P2: 避免 Q4/Q5 连续重复同一维度
    const lastDim = history[history.length - 1]?.targetDimension;
    const dimsBySignal = (Object.keys(coverage) as Dimension[]).sort((a, b) => coverage[b] - coverage[a]);
    // 首选排除上一轮维度
    const preferred = dimsBySignal.filter((d) => d !== lastDim);
    const candidates = preferred.length > 0 ? preferred : dimsBySignal;
    for (const dim of candidates) {
      const q = pickForDimension(dim, history);
      if (q) {
        return { done: false, question: q, targetDimension: dim, reason: `快速模式：深入最强信号维度 ${dim}` };
      }
    }
    // 所有维度问题已穷尽
    console.log(`[chooseNextQuestion] quick mode exhausted: no more dimension questions, done=true`);
    return { done: true, reason: "快速模式所有维度问题已问完" };
  }

  // ---- 深度模式策略（保持原有逻辑） ----
  // 达到最小轮次且覆盖良好，且已问过时间趋势和反向验证 => 结束
  const enough =
    history.length >= MIN_ROUNDS &&
    coveredDims >= 3 &&
    trendAsked &&
    reverseAsked;

  if (enough || history.length >= MAX_ROUNDS) {
    return { done: true, reason: "信息充足或达到最大轮次" };
  }

  // 中段：在合适时机插入时间趋势问题（第 3 或 4 题）
  if (!trendAsked && history.length >= 3) {
    return {
      done: false,
      question: TREND_QUESTION,
      targetDimension: "trend",
      reason: "补足时间趋势维度",
    };
  }

  // 后段：插入反向验证（覆盖度到位或问了 5 轮以上）
  if (!reverseAsked && (coveredDims >= 3 || history.length >= 5)) {
    return {
      done: false,
      question: REVERSE_QUESTION,
      targetDimension: "reverse",
      reason: "补充反向证据，避免过度归因",
    };
  }

  // 默认：补足最弱维度
  for (const dim of dimsSortedByCoverage) {
    const q = pickForDimension(dim, history);
    if (q) {
      return {
        done: false,
        question: q,
        targetDimension: dim,
        reason: `补足最弱维度：${dim}`,
      };
    }
  }

  return { done: true, reason: "所有预置问题已问完" };
}

// 便利函数：判断问诊是否收敛（仅在完成全部轮次后才允许提前结束）
export function canFinishEarly(history: QAItem[]): boolean {
  if (history.length < 10) return false;
  const cov = factCoverage(history);
  const covered = (Object.keys(cov) as Dimension[]).filter((d) => cov[d] > 0).length;
  const trend = history.some((h) => h.targetDimension === "trend");
  const reverse = history.some((h) => h.targetDimension === "reverse");
  return covered >= 3 && trend && reverse;
}

export function classifyAnswer(text: string): Classified {
  return classifyText(text);
}