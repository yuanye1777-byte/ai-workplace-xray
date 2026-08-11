import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Dimension } from "@/lib/ai/types";
import {
  cleanList,
  FRIENDLY_DIMENSION_LABEL,
  friendlyLevel,
  REPORT_DISCLAIMER,
} from "@/lib/report-presenter";
import { getSharedReportFn } from "@/lib/data/tracking.functions";
import type { SharedReportData } from "@/lib/data/tracking.server";

export const Route = createFileRoute("/share/$id")({
  head: () => ({
    meta: [
      { title: "AI 职场 X 光报告 | 分享" },
      { name: "description", content: "一份 AI 职场 X 光扫描报告" },
      { property: "og:title", content: "AI 职场 X 光报告" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const { id } = Route.useParams();
  const [data, setData] = useState<SharedReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSharedReportFn({ data: { id } })
      .then((r) => {
        if (r.ok && r.report) {
          setData(r.report);
        } else {
          setData(null);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-800" />
          加载报告中…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-neutral-900">
            加载失败
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            报告加载出错，请稍后重试。
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-neutral-900">
            报告不存在
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            该报告可能已被删除或链接无效。
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const dimensions = data.dimensions ?? [];
  const topSignals = cleanList(data.top_signals).slice(0, 3);
  const knownFacts = cleanList(data.known_facts).slice(0, 5);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* 顶部栏 */}
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
            <span className="text-sm font-medium tracking-wider text-neutral-900">
              AI 职场 X 光
            </span>
          </div>
          <Link
            to="/"
            className="text-xs text-neutral-500 transition hover:text-neutral-900"
          >
            自己也试试 →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        {/* 标题 */}
        <div className="mb-6">
          <div className="text-xs uppercase tracking-[0.3em] text-neutral-400">
            AI JOB X-RAY REPORT
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            AI 职场 X 光报告
          </h1>
          <p className="mt-1 text-xs text-neutral-400">
            {formatDate(data.created_at)}
          </p>
        </div>

        {/* headline */}
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
          <div className="text-xs text-neutral-500">一句话结论</div>
          <p className="mt-2 text-[15px] leading-7 text-neutral-900">
            {data.headline}
          </p>
        </div>

        {/* 总分 + 等级 */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="text-xs text-neutral-500">综合风险评分</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums text-neutral-900">
                {data.total_score}
              </span>
              <span className="text-sm text-neutral-400">/ 100</span>
            </div>
            <ScoreBar value={data.total_score} />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="text-xs text-neutral-500">风险等级</div>
            <div className="mt-2 text-lg font-semibold text-neutral-900">
              {data.total_level ? friendlyLevel(data.total_level) : "—"}
            </div>
            <div className="mt-3 text-xs text-neutral-400">
              基于五维综合评估
            </div>
          </div>
        </div>

        {/* 五维评分摘要 */}
        {dimensions.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wider text-neutral-700">
              五维评分摘要
            </h2>
            <div className="space-y-2">
              {dimensions.map((d) => (
                <div
                  key={d.key}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
                >
                  <span className="text-sm text-neutral-700">
                    {FRIENDLY_DIMENSION_LABEL[d.key as Dimension] ?? d.key}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-neutral-900">
                      {d.score}
                    </span>
                    <span className="text-xs text-neutral-400">/ 100</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* topSignals 前 3 条 */}
        {topSignals.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wider text-neutral-700">
              最值得关注的信号
            </h2>
            <ol className="space-y-2">
              {topSignals.map((s, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-6 text-neutral-800"
                >
                  <span className="mr-2 font-semibold text-neutral-900">
                    #{i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* knownFacts 前 5 条 */}
        {knownFacts.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wider text-neutral-700">
              已确认的情况
            </h2>
            <ul className="space-y-1.5">
              {knownFacts.map((f, i) => (
                <li
                  key={i}
                  className="text-sm leading-6 text-neutral-700"
                >
                  · {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* misjudgment — 最容易误判的地方 */}
        {data.misjudgment && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold tracking-wider text-neutral-700">
              最容易误判的地方
            </h2>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm leading-7 text-neutral-800">
              {data.misjudgment}
            </div>
          </section>
        )}

        {/* 底部 */}
        <footer className="mt-10 border-t border-neutral-200 pt-5">
          <p className="text-sm font-medium text-neutral-900">
            由 AI 职场 X 光生成
          </p>
          <p className="mt-2 text-xs leading-5 text-neutral-400">
            {REPORT_DISCLAIMER}
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center gap-1 text-xs text-neutral-500 transition hover:text-neutral-900"
          >
            自己也做一次职场 X 光扫描 →
          </Link>
        </footer>
      </main>
    </div>
  );
}

/* ---------- 辅助组件 ---------- */

function ScoreBar({ value }: { value: number }) {
  const color =
    value <= 20
      ? "bg-emerald-500"
      : value <= 40
        ? "bg-yellow-500"
        : value <= 60
          ? "bg-orange-500"
          : value <= 80
            ? "bg-red-500"
            : "bg-red-600";
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
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
