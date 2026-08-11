import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Report } from "@/lib/ai/types";
import {
  cleanCopy,
  cleanList,
  FRIENDLY_DIMENSION_LABEL,
  friendlyLevel,
  headlineFor,
} from "@/lib/report-presenter";
import {
  getHistoryDetailFn,
  listHistoryFn,
} from "@/lib/data/tracking.functions";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [{ title: "历史记录 | AI职场X光" }],
  }),
  component: HistoryPage,
});

/* ---------- issue_type 标签（prompts.server.ts 中的同份映射，前端用） ---------- */

const ISSUE_LABEL: Record<string, string> = {
  hollowing_out: "决策参与度下降",
  marginalization: "参与度变化",
  power_change: "决策影响力减弱",
  resource_transfer: "核心资源调整",
  information_loss: "信息获取减少",
  trust_decline: "上级互动变化",
  successor_forming: "出现替代人选",
  loss_of_favor: "参与度降低",
  promotion_stagnation: "晋升节奏放缓",
  relationship_risk: "职场关系波动",
  value_decline: "核心价值变化",
  normal_adjustment: "正常组织调整",
  org_restructure: "组织结构变化",
  career_pivot: "职业转折点",
  unclear: "证据不足",
};

/* ---------- 类型 ---------- */

type HistoryItem = {
  id: string;
  created_at: string;
  headline: string;
  total_score: number;
  main_issue_type: string;
};

type TurnRow = {
  turn_index: number;
  question: string | null;
  answer: string | null;
};

/* ---------- 页面 ---------- */

function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    report: Report | null;
    turns: TurnRow[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    listHistoryFn()
      .then((r) => {
        if (r.ok) setItems([...r.items]);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleDetail = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const r = await getHistoryDetailFn({ data: { assessmentId: id } });
      if (r.ok && r.detail) {
        const report = r.detail.diagnosis?.report_data as unknown as Report | null;
        setDetail({ report, turns: (r.detail.turns ?? []) as TurnRow[] });
      }
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* TopBar */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
            <span className="text-sm font-medium tracking-wider text-foreground/90">
              AI 职场 X 光
            </span>
          </Link>
          <span className="text-xs text-muted-foreground">历史记录</span>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          检测历史
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          查看你过往的职场 X 光扫描记录
        </p>

        {loading ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-xl border border-border/60 bg-card/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">还没有检测记录</p>
            <Link
              to="/"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110"
            >
              开始第一次扫描 →
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {items.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => toggleDetail(item.id)}
                  className={`w-full rounded-xl border p-5 text-left transition hover:bg-card/60 ${
                    expandedId === item.id
                      ? "border-primary/40 bg-card/70"
                      : "border-border/70 bg-card/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-7 text-foreground">
                        {item.headline}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(item.created_at)}</span>
                        {item.main_issue_type && !(item.main_issue_type === "unclear" && item.total_score > 40) && (
                        <span className="rounded border border-border/70 bg-secondary/50 px-1.5 py-0.5 text-[10px] text-foreground/70">
                          {ISSUE_LABEL[item.main_issue_type] ?? item.main_issue_type}
                        </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end">
                      <ScoreBadge score={item.total_score} />
                    </div>
                  </div>
                </button>

                {expandedId === item.id && (
                  <div className="mt-2 animate-fade-in rounded-xl border border-border/50 bg-card/20 p-5">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                        加载详情…
                      </div>
                    ) : detail?.report ? (
                      <DetailContent report={detail.report} turns={detail.turns} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        无法加载详情
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground/80 hover:bg-secondary"
          >
            ← 返回首页
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ---------- 详情展开 ---------- */

function DetailContent({
  report,
  turns,
}: {
  report: Report;
  turns: TurnRow[];
}) {
  const signals = cleanList(report.topSignals);
  const facts = cleanList(report.knownFacts);
  const inferences = cleanList(report.inferences);
  const assumptions = cleanList(report.openAssumptions);

  return (
    <div className="space-y-6">
      {/* 结论 */}
      <div>
        <div className="text-xs text-muted-foreground">一句话结论</div>
        <p className="mt-2 text-sm leading-7 text-foreground">
          {headlineFor(report)}
        </p>
        {report.mainIssue && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">当前主要情况</span>
            <span className="inline-flex items-center gap-1 rounded border border-primary/50 bg-card/40 px-2 py-0.5 text-foreground">
              {report.mainIssue.label}
              <span className="text-[10px] text-muted-foreground">
                {Math.round((report.mainIssue.confidence ?? 0) * 100)}%
              </span>
            </span>
            {report.secondaryIssues && report.secondaryIssues.length > 0 && (
              <>
                <span className="text-muted-foreground">次要发现</span>
                {report.secondaryIssues.map((it, i) => (
                  <span
                    key={`sec-${i}`}
                    className="inline-flex items-center gap-1 rounded border border-yellow-500/40 bg-card/40 px-2 py-0.5 text-yellow-100/90"
                  >
                    {it.label}
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round((it.confidence ?? 0) * 100)}%
                    </span>
                  </span>
                ))}
              </>
            )}
            {report.potentialRisks && report.potentialRisks.length > 0 && (
              <>
                <span className="text-muted-foreground">潜在风险</span>
                {report.potentialRisks.map((it, i) => (
                  <span
                    key={`risk-${i}`}
                    className="inline-flex items-center gap-1 rounded border border-border bg-card/40 px-2 py-0.5 text-muted-foreground"
                  >
                    {it.label}
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round((it.confidence ?? 0) * 100)}%
                    </span>
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 评分 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="text-xs text-muted-foreground">风险等级</div>
          <div className="mt-1 text-sm font-medium">
            {friendlyLevel(report.totalLevel)}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="text-xs text-muted-foreground">综合评分</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {report.totalScore}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
      </div>

      {/* 五维扫描 */}
      <div>
        <div className="mb-3 text-xs font-medium tracking-wider text-muted-foreground">
          五维扫描
        </div>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
          {report.dimensions.map((d) => (
            <div
              key={d.key}
              className="rounded-lg border border-border/60 bg-card/40 p-3"
            >
              <div className="text-xs font-medium">
                {FRIENDLY_DIMENSION_LABEL[d.key]}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-lg font-semibold tabular-nums">
                  {d.score}
                </span>
                <span className="text-[10px] text-muted-foreground">/100</span>
              </div>
              <Bar value={d.score} />
            </div>
          ))}
        </div>
      </div>

      {/* 信号 */}
      {signals.length > 0 && (
        <div>
          <div className="mb-3 text-xs font-medium tracking-wider text-muted-foreground">
            最值得关注的信号
          </div>
          <ul className="space-y-2">
            {signals.map((s, i) => (
              <li
                key={i}
                className="rounded-lg border border-border/50 bg-secondary/30 p-3 text-sm leading-6"
              >
                <span className="mr-2 text-primary">#{i + 1}</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 事实与判断 */}
      {facts.length > 0 && (
        <div>
          <div className="mb-3 text-xs font-medium tracking-wider text-muted-foreground">
            已确认的情况
          </div>
          <ul className="space-y-1.5">
            {facts.map((f, i) => (
              <li key={i} className="text-sm leading-6 text-foreground/90">
                · {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {inferences.length > 0 && (
        <div>
          <div className="mb-3 text-xs font-medium tracking-wider text-orange-400">
            AI 逻辑推断
          </div>
          <ul className="space-y-1.5">
            {inferences.map((f, i) => (
              <li key={i} className="text-sm leading-6 text-foreground/90">
                · {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {assumptions.length > 0 && (
        <div>
          <div className="mb-3 text-xs font-medium tracking-wider text-yellow-400">
            未验证假设
          </div>
          <ul className="space-y-1.5">
            {assumptions.map((f, i) => (
              <li key={i} className="text-sm leading-6 text-foreground/90">
                · {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 最容易误判的地方 */}
      {report.misjudgment && (
        <div>
          <div className="mb-3 text-xs font-medium tracking-wider text-orange-400">
            最容易误判的地方
          </div>
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 text-sm leading-7 text-foreground/90">
            {cleanCopy(report.misjudgment)}
          </div>
        </div>
      )}

      {/* 问诊记录 */}
      {turns.length > 0 && (
        <div>
          <div className="mb-3 text-xs font-medium tracking-wider text-muted-foreground">
            问诊记录
          </div>
          <div className="space-y-3">
            {turns.map((turn, i) => (
              <div
                key={i}
                className="rounded-lg border border-border/40 bg-card/30 p-3"
              >
                {turn.question && (
                  <div className="text-xs text-muted-foreground">
                    Q{turn.turn_index}
                  </div>
                )}
                {turn.question && (
                  <div className="mt-1 text-sm leading-6">
                    {cleanCopy(turn.question)}
                  </div>
                )}
                <div
                  className={`text-sm leading-6 text-foreground/90 ${
                    turn.question ? "mt-2" : ""
                  }`}
                >
                  {turn.answer ?? ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 辅助组件 ---------- */

function ScoreBadge({ score }: { score: number }) {
  const color =
    score <= 20
      ? "text-emerald-400"
      : score <= 40
        ? "text-yellow-400"
        : score <= 60
          ? "text-orange-400"
          : score <= 80
            ? "text-red-400"
            : "text-red-500";
  return (
    <div className="flex flex-col items-end">
      <span className={`text-2xl font-semibold tabular-nums ${color}`}>
        {score}
      </span>
      <span className="text-[10px] text-muted-foreground">/ 100</span>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  const color =
    value <= 20
      ? "bg-emerald-500/70"
      : value <= 40
        ? "bg-yellow-500/70"
        : value <= 60
          ? "bg-orange-500/70"
          : value <= 80
            ? "bg-red-500/70"
            : "bg-red-600";
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={`h-full ${color} transition-all`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/* ---------- 工具 ---------- */

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
