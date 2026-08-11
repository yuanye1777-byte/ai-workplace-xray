// 用户回答的语义分类：区分【事实/情绪/判断/推测】
// v1 使用启发式规则；未来可直接替换成 LLM 调用。

import type { Classified, Dimension } from "./types";

const EMOTION_WORDS = [
  "难受", "焦虑", "委屈", "生气", "愤怒", "沮丧", "害怕", "担心", "郁闷",
  "不安", "失落", "崩溃", "心累", "无力", "感觉", "觉得心里", "觉得",
  "烦躁", "绝望", "无助", "孤独", "恐慌",
];

// 主观定性："他就是不喜欢我" —— 没有具体行为的性质判断
const JUDGMENT_PATTERNS = [
  /看我不顺眼/, /针对我/, /排挤/, /不信任我/, /不喜欢我/, /偏心/,
  /故意/, /存心/, /就是想.*(?:让我走|赶我|挤走)/, /瞧不起/, /嫌弃/,
];

// 推测：因果 / 意图推断
const INFERENCE_PATTERNS = [
  /所以.*(?:想让|要把|准备)/, /肯定是/, /一定是/, /多半是/, /估计是/, /估计/,
  /大概是想/, /是不是要/, /可能是想让我/, /打算让我/,
  /应该是/, /应该是想/,
];

// 条件句 / 假设 / 未来观察：不应归为已发生事实
const CONDITIONAL_PATTERNS = [
  /如果/, /假如/, /万一/, /要是/, /假设/,
  /接下来/, /未来/, /今后/, /以后/, /下次/,
  /我会认为/, /我会觉得/, /到时候/,
  /再.*的话/, /继续.*的话/,
];

// 推测 / 担心 / 传闻 / 主观印象：不应归为已确认事实
const SPECULATION_PATTERNS = [
  /我担心/, /我怕/, /我怀疑/, /我感觉到/, /我隐约觉得/,
  /可能/, /是不是/, /会不会/, /也许/, /或许/, /大概/,
  /说不定/, /没准/, /有待观察/, /再看看/,
  // 自我不确定性表述 — 不应归为已确认事实
  /不能确认/, /无法确认/, /不确定/, /不知道/, /无法判断/,
  /说不准/, /不敢肯定/, /不太确定/, /还没搞清楚/,
  // 主观感受/传闻词 — 容易与事实混淆
  /觉得/, /好像/, /似乎/, /听说/, /看来/,
];

// 反向证据（对"被架空"结论的反证）
const REVERSE_PATTERNS = [
  /仍然.*(?:让我|交给我|由我)/, /还是.*(?:让我|找我|由我)/,
  /最近.*(?:单独|私下).*(?:交给我|告诉我|安排我)/,
  /(?:反向|正面|相反).*?单独.*(?:交给我|安排我|找我)/,
  /在[^。，]*?(?:会议|会上).*?(?:表扬|肯定|点名)/, /新的.*(?:项目|机会).*(?:给我|由我负责)/,
  /涨薪|加薪|晋升|升职/,
];

// 维度关键词（用于覆盖度追踪）
const DIM_KEYWORDS: Record<Dimension, RegExp[]> = {
  power: [
    /决策|拍板|决定|签字|批准|审批|定方向|不再由我|变少|绕过我/,
    /从.*变成.*执行|只让我执行|不让我参与决策/,
  ],
  resource: [
    /项目|客户|预算|权限|资源|账号|数据|系统|地盘/,
    /转移|交给|分走|拿走|接手|划走/,
  ],
  info: [
    /会议|通知|群里|消息|信息|知道|最后才|事后才|没人告诉我|被排除/,
  ],
  relation: [
    /领导|老板|直属|上级|一对一|沟通|谈话|信任|冷淡|不理我|不找我|绕过/,
  ],
  replace: [
    /新人|新同事|接手|顶替|学我|对接我的|接触我的|带走我的下属|带.*下属/,
  ],
};

// 按句子切分（中英标点）
function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function anyMatch(s: string, list: RegExp[] | string[]): boolean {
  return list.some((p) => (typeof p === "string" ? s.includes(p) : p.test(s)));
}

export function classifyText(text: string): Classified {
  const sentences = splitSentences(text);
  const facts: string[] = [];
  const emotions: string[] = [];
  const judgments: string[] = [];
  const inferences: string[] = [];
  const reverseEvidence: string[] = [];
  const dims = new Set<Dimension>();

  for (const s of sentences) {
    let placed = false;

    if (anyMatch(s, CONDITIONAL_PATTERNS)) {
      // 条件句/假设/未来观察 → 归入推测，不进入事实
      inferences.push(s);
      placed = true;
    }
    if (anyMatch(s, SPECULATION_PATTERNS)) {
      // 主观不确定表述 → 归入推测或情绪
      inferences.push(s);
      if (anyMatch(s, EMOTION_WORDS)) emotions.push(s);
      placed = true;
    }
    if (anyMatch(s, INFERENCE_PATTERNS)) {
      inferences.push(s);
      placed = true;
    }
    if (anyMatch(s, JUDGMENT_PATTERNS)) {
      judgments.push(s);
      placed = true;
    }
    if (!placed && anyMatch(s, EMOTION_WORDS)) {
      emotions.push(s);
      placed = true;
    }
    if (anyMatch(s, REVERSE_PATTERNS)) {
      reverseEvidence.push(s);
    }

    // 是否包含具体行为动词/时间线索，作为事实候选
    const hasBehavior =
      /(说|问|发|打电话|开会|出席|参加|主持|安排|通知|抄送|叫我|找我|绕过|接手|转给|转到|转交|移交|对接|负责|交给|拿走|转移|移除|移出|踢出|调整|取消|停止|暂停|批|签|审批|核准|分配|分派|发消息|汇报)/.test(
        s,
      );
    const hasTime = /(昨天|今天|上周|这周|上个月|最近|三个月|半年|去年|周[一二三四五六日天])/.test(
      s,
    );

    // 兜底：未匹配到任何模式的句子
    // 同时有行为+时间 → 高置信事实
    // 仅有行为或时间 → 可能事实
    // 都没有 → 归入推测（等待追问澄清），不默认归为事实
    if (!placed && hasBehavior && hasTime) {
      facts.push(s);
    } else if (!placed && hasBehavior) {
      facts.push(s);
    } else if (!placed) {
      // 无法判断是什么类型 → 归入推测，等待澄清
      if (s.length >= 4) inferences.push(s);
    }

    // 维度识别（无论归属哪一类，都记录该句涉及的维度）
    for (const dim of Object.keys(DIM_KEYWORDS) as Dimension[]) {
      if (DIM_KEYWORDS[dim].some((re) => re.test(s))) dims.add(dim);
    }
  }

  return {
    facts,
    emotions,
    judgments,
    inferences,
    dimensions: Array.from(dims),
    reverseEvidence,
  };
}