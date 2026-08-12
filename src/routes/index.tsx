import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  aiService,
  DIMENSION_LABEL,
  STATEMENT_LABEL,
  type Classified,
  type QAItem,
  type Report,
  type ScanMode,
} from "@/lib/ai";
import {
  abandonAssessmentFn,
  completeAssessmentFn,
  startAssessmentFn,
} from "@/lib/data/tracking.functions";
import {
  cleanCopy,
  cleanList,
  conclusionBlocks,
  dynamicObserveSignals,
  friendlyLevel,
  headlineFor,
  JUDGEMENT_NOTE,
  POSSIBILITY_NOTE,
  FRIENDLY_DIMENSION_LABEL,
  reversalAssessment,
  toPossibilities,
} from "@/lib/report-presenter";
import {
  buildReportShareText,
  reportQualitySnapshot,
} from "@/lib/report-quality";
import RadarChartView from "@/components/report/RadarChart";
import ScoreBar from "@/components/report/ScoreBar";
import { exportReportAsPdf } from "@/lib/export-pdf";
import { Copy, Download, Share2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI 职场 X 光" },
      {
        name: "description",
        content:
          "有些职场变化，不会被正式通知。当你感觉信息、关系、资源或机会开始变得不一样，AI 职场 X 光帮你把这些变化拆开来看：哪些是事实，哪些是担心，哪些值得继续观察。",
      },
      { property: "og:title", content: "AI 职场 X 光" },
      {
        property: "og:description",
        content: "有些职场变化，不会被正式通知。描述你最近觉得「不太对劲」的职场变化，AI 帮你拆开来看。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Stage = "home" | "interview" | "scanning" | "report";
const DRAFT_KEY = "zcsm_draft";

function loadDraft(): { initial: string; history: QAItem[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft.initial && Array.isArray(draft.history)) return draft;
  } catch {}
  return null;
}

function saveDraft(initial: string, history: QAItem[]) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ initial, history }));
  } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function Index() {
  const [stage, setStage] = useState<Stage>("home");
  const [scanMode, setScanMode] = useState<ScanMode>("deep");
  const [initial, setInitial] = useState("");
  const [history, setHistory] = useState<QAItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const assessmentIdRef = useRef<string | null>(null);

  // 草稿恢复
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.history.length > 0) {
      setInitial(draft.initial);
      setHistory(draft.history);
      setStage("interview");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      {stage === "home" && (
        <div key="home" className="animate-fade-in">
        <Home
          initial={initial}
          setInitial={setInitial}
          scanMode={scanMode}
          setScanMode={setScanMode}
          onStart={() => {
            if (!initial.trim()) return;
            setHistory([]);
            setReport(null);
            setReportError(null);
            clearDraft();
            setStage("interview");
            // 数据层：静默创建检测记录，失败不影响问诊
            assessmentIdRef.current = null;
            startAssessmentFn({ data: { type: "INITIAL" } })
              .then((r) => {
                assessmentIdRef.current = r.assessmentId;
              })
              .catch(() => {});
          }}
        />
        </div>
      )}
      {stage === "interview" && (
        <div key="interview" className="animate-fade-in">
        <Interview
          initial={initial}
          history={history}
          setHistory={setHistory}
          scanMode={scanMode}
          onDone={() => setStage("scanning")}
          onBack={() => {
            const id = assessmentIdRef.current;
            if (id) abandonAssessmentFn({ data: { assessmentId: id } }).catch(() => {});
            assessmentIdRef.current = null;
            saveDraft(initial, history);
            setStage("home");
          }}
        />
        </div>
      )}
      {stage === "scanning" && (
        <div key="scanning" className="animate-fade-in">
        <Scanning
          reportError={reportError}
          onDone={async () => {
            setReportError(null);
            try {
              const r = await aiService.generateReport(initial, history, scanMode);
              // P0-1: 防御性校验 — 确保报告包含必需字段后再渲染
              if (!r || !r.dimensions || r.dimensions.length === 0) {
                throw new Error("报告生成不完整，缺少维度数据");
              }
              setReport(r);
              clearDraft();
              setStage("report");
              const id = assessmentIdRef.current;
              if (id) {
                completeAssessmentFn({
                  data: {
                    assessmentId: id,
                    initial,
                    history: history.map((h) => ({
                      question: h.question,
                      answer: h.answer,
                      targetDimension: h.targetDimension,
                      classified: h.classified,
                    })),
                    report: r as unknown as Record<string, unknown>,
                  },
                }).catch(() => {});
              }
            } catch (e) {
              console.error("[scanning] generateReport failed:", e);
              const msg = e instanceof Error ? e.message : "报告生成失败";
              setReportError(msg);
            }
          }}
          onRetry={async () => {
            setReportError(null);
            try {
              const r = await aiService.generateReport(initial, history, scanMode);
              setReport(r);
              clearDraft();
              setStage("report");
            } catch (e) {
              console.error("[scanning retry] generateReport failed:", e);
              const msg = e instanceof Error ? e.message : "报告生成失败";
              setReportError(msg);
            }
          }}
        />
        </div>
      )}
      {stage === "report" && report && (
        <div key="report" className="animate-fade-in">
        <ReportView
          report={report}
          scanMode={scanMode}
          assessmentIdRef={assessmentIdRef}
          onRestart={() => {
            setInitial("");
            setHistory([]);
            setReport(null);
            setReportError(null);
            clearDraft();
            setStage("home");
          }}
        />
        </div>
      )}
      <Footer />
    </div>
  );
}

function TopBar() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
          <span className="text-sm font-medium tracking-wider text-foreground/90">
            AI 职场 X 光
          </span>
        </div>
        <span className="text-xs text-muted-foreground">v1</span>
        <Link
          to="/history"
          className="ml-4 text-xs text-muted-foreground transition hover:text-foreground"
        >
          历史记录
        </Link>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
      本工具用于职场局势信号分析与观察辅助，不替代专业建议。所有分析基于你提供的信息，请结合实际情况持续验证。
    </footer>
  );
}

/* -------------------- Home -------------------- */

function Home({
  initial,
  setInitial,
  scanMode,
  setScanMode,
  onStart,
}: {
  initial: string;
  setInitial: (v: string) => void;
  scanMode: ScanMode;
  setScanMode: (m: ScanMode) => void;
  onStart: () => void;
}) {
  const MIN_CHARS = 50;
  const textRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInitial(e.target.value);
  };
  // P1-2: onInput 兜底 — 浏览器自动填充 / 移动端输入法在某些浏览器不触发 onChange
  const handleTextInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    setInitial((e.target as HTMLTextAreaElement).value);
  };

  const charCount = initial.replace(/\s/g, "").length;
  const enough = charCount >= MIN_CHARS;

  return (
    <section className="relative overflow-hidden">
      {/* 背景网格 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at 50% 30%, black 40%, transparent 75%)",
        }}
      />
      <div className="relative mx-auto max-w-4xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20 sm:pb-16">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          匿名 · 免费
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          AI 职场 X 光
        </h1>
        <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
          有些职场变化，不会被正式通知。
        </p>

        <div className="mt-8 space-y-4 text-[15px] leading-8 text-foreground/85 sm:text-base">
          <p>
            当你感觉信息、关系、资源或机会开始变得不一样，
            AI 职场 X 光帮你把这些变化拆开来看：
            哪些是<span className="text-foreground font-medium">事实</span>，
            哪些是<span className="text-foreground font-medium">担心</span>，
            哪些值得<span className="text-foreground font-medium">继续观察</span>。
          </p>
          <p>
            AI 会从{" "}
            <DimPill>决策参与</DimPill> · <DimPill>核心资源</DimPill> ·{" "}
            <DimPill>信息透明度</DimPill> · <DimPill>关键关系</DimPill> ·{" "}
            <DimPill>发展空间</DimPill>{" "}
            五个维度帮你看清当前位置和局势变化。
          </p>
        </div>

        <div className="mt-10 rounded-xl border border-border bg-card/70 p-4 shadow-2xl shadow-black/40 backdrop-blur">
          {/* 扫描模式选择 */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setScanMode("quick")}
              className={`w-full rounded-md px-3 py-1.5 text-xs font-medium transition sm:w-auto ${
                scanMode === "quick"
                  ? "bg-primary/15 text-primary border border-primary/40"
                  : "border border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              快速扫描 · 5 轮 · 约 3–5 分钟
            </button>
            <button
              type="button"
              onClick={() => setScanMode("deep")}
              className={`w-full rounded-md px-3 py-1.5 text-xs font-medium transition sm:w-auto ${
                scanMode === "deep"
                  ? "bg-primary/15 text-primary border border-primary/40"
                  : "border border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              深度扫描 · 10 轮 · 约 8–10 分钟
            </button>
          </div>
          <p className="mb-2 text-xs text-muted-foreground/70">
            把最近让你觉得「不太对劲」的职场变化写下来。
          </p>
          <textarea
            ref={textRef}
            suppressHydrationWarning
            value={initial}
            onChange={handleTextChange}
            onInput={handleTextInput}
            placeholder={`例如：\n"最近几个重要的项目讨论都不再叫我了，周会上我的发言也经常被打断……"`}
            className="min-h-[160px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs ${enough ? "text-muted-foreground" : "text-destructive"}`}>
                {charCount}/{MIN_CHARS}
              </span>
              {!enough && (
                <span className="text-xs text-muted-foreground">
                  至少输入 {MIN_CHARS} 字，AI 会通过追问补齐关键信息
                </span>
              )}
            </div>
            <button
              onClick={onStart}
              disabled={!enough}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              title={!enough ? `至少需要 ${MIN_CHARS} 字` : ""}
            >
              {scanMode === "quick" ? "快速 X 光扫描" : "深度 X 光扫描"}
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground/60">
          不需登录 · 匿名使用 · 分享摘要不包含原始对话
        </p>

        <div className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
          {(
            [
              ["决策参与", "决策参与度是否下降"],
              ["核心资源", "核心资源是否被转移"],
              ["信息透明度", "关键信息是否被过滤"],
              ["关键关系", "关键关系是否变化"],
              ["发展空间", "职业成长与机会是否在收窄"],
            ] as const
          ).map(([t, s]) => (
            <div
              key={t}
              className="rounded-lg border border-border/70 bg-card/40 p-4"
            >
              <div className="text-sm font-medium">{t}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-3 rounded-xl border border-border/60 bg-card/30 p-5 text-sm leading-7 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <span className="mt-1 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">快</span>
            <span className="text-muted-foreground"><span className="text-foreground font-medium">5 轮快速扫描</span> · 3–5 分钟初步判断</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-1 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">深</span>
            <span className="text-muted-foreground"><span className="text-foreground font-medium">10 轮深度扫描</span> · 8–10 分钟全面分析</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-1 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">辨</span>
            <span className="text-muted-foreground">区分<span className="text-foreground font-medium">事实 / 情绪 / 推测</span>，只把可观察行为当证据</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="mt-1 shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">行</span>
            <span className="text-muted-foreground">生成<span className="text-foreground font-medium">可执行的观察计划</span>，而非空泛建议</span>
          </div>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          AI 不会仅凭单一事件下结论。分析基于多个信号、持续时间、变化趋势与五个维度的综合判断。
        </p>
      </div>
    </section>
  );
}

function DimPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-border/70 bg-card/60 px-2 py-0.5 text-[13px] text-foreground/90">
      {children}
    </span>
  );
}

/* -------------------- Interview -------------------- */

function Interview({
  initial,
  history,
  setHistory,
  scanMode,
  onDone,
  onBack,
}: {
  initial: string;
  history: QAItem[];
  setHistory: (h: QAItem[]) => void;
  scanMode: ScanMode;
  onDone: () => void;
  onBack: () => void;
}) {
  const [currentQ, setCurrentQ] = useState<string | null>(null);
  const [currentTag, setCurrentTag] = useState<QAItem["targetDimension"]>();
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState(false);
  const [round, setRound] = useState(0);
  const [lastClassified, setLastClassified] = useState<Classified | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const TARGET_ROUNDS = scanMode === "quick" ? 5 : 10;

  const handleAnswerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setAnswer(v);
  };
  // P1-2: onInput 兜底
  const handleAnswerInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    setAnswer((e.target as HTMLTextAreaElement).value);
  };

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    console.log(`[Interview] effect fired: round=${round} history.length=${history.length} scanMode=${scanMode} TARGET_ROUNDS=${TARGET_ROUNDS}`);
    const timeout = setTimeout(() => {
      if (cancel) return;
      console.warn("[interview] nextQuestion timeout, falling back to local");
      // P0-1: 超时不应新增问题，先检查是否已达轮次上限
      if (history.length >= TARGET_ROUNDS) {
        setDone(true);
      } else {
        setCurrentQ("能再具体描述一下最近发生的一件事吗？");
        setCurrentTag("clarify");
      }
      setLoading(false);
    }, 15000);

    aiService
      .nextQuestion(initial, history, scanMode)
      .then((res) => {
        clearTimeout(timeout);
        if (cancel) return;
        // 达到目标轮次后强制结束
        const forcedDone = history.length >= TARGET_ROUNDS;
        console.log(`[Interview] nextQuestion resolved: res.done=${res.done} forcedDone=${forcedDone} history.length=${history.length} TARGET_ROUNDS=${TARGET_ROUNDS}`);
        if (res.done || forcedDone) {
          setDone(true);
        } else {
          setCurrentQ(res.question ?? null);
          setCurrentTag(res.targetDimension);
        }
        setLoading(false);
        setTimeout(() => ref.current?.focus(), 50);
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (cancel) return;
        console.error("[interview] nextQuestion error:", err);
        setLoading(false);
        setCurrentQ("能再具体描述一下最近发生的一件事吗？");
        setCurrentTag("clarify");
      });
    return () => {
      cancel = true;
      clearTimeout(timeout);
    };
  }, [round]);

  const submit = async () => {
    if (!answer.trim() || !currentQ) return;
    const classified = await aiService.classify(answer.trim());
    setLastClassified(classified);
    const next: QAItem[] = [
      ...history,
      {
        question: currentQ,
        answer: answer.trim(),
        classified,
        targetDimension: currentTag,
      },
    ];
    setHistory(next);
    saveDraft(initial, next);
    setAnswer("");
    setCurrentQ(null);
    setCurrentTag(undefined);
    setRound((r) => r + 1);
  };

  const progress = Math.min(
    100,
    Math.round((history.length / TARGET_ROUNDS) * 100),
  );

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex items-center justify-between text-xs text-muted-foreground">
        <button onClick={onBack} className="hover:text-foreground">
          ← 返回
        </button>
        <span>
          第 {history.length + (done ? 0 : 1)}/{TARGET_ROUNDS} 轮
          {currentTag && !done && (
            <span className="ml-2 rounded border border-border/70 bg-secondary/60 px-1.5 py-0.5 text-[10px] text-foreground/80">
              {tagLabel(currentTag)}
            </span>
          )}
        </span>
      </div>

      <div className="mb-6 h-[3px] w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 历史 */}
      <div className="mb-8 space-y-6">
        {history.map((h, i) => (
          <div key={i} className="space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <span>Q{i + 1} · AI</span>
              {h.targetDimension && (
                <span className="rounded border border-border/70 bg-secondary/50 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-foreground/70">
                  {tagLabel(h.targetDimension)}
                </span>
              )}
            </div>
            <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm leading-7">
              {h.question}
            </div>
            <div className="rounded-lg border border-border/40 bg-secondary/40 p-4 text-sm leading-7 text-foreground/90">
              {h.answer}
            </div>
            {h.classified && <ClassifiedStrip c={h.classified} />}
          </div>
        ))}
      </div>

      {/* 当前问题 */}
      {!done && (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            AI 正在追问
          </div>
          <div className="rounded-lg border border-primary/30 bg-card/70 p-5 text-[15px] leading-8 shadow-lg shadow-black/30 min-h-[72px]">
            {loading || !currentQ ? (
              <span className="inline-flex h-5 items-center">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              </span>
            ) : (
              currentQ
            )}
          </div>
          <textarea
            ref={ref}
            value={answer}
            onChange={handleAnswerChange}
            onInput={handleAnswerInput}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            placeholder="尽量描述具体的行为和事实，而不是感受。Ctrl / ⌘ + Enter 提交。"
            className="min-h-[120px] w-full resize-none rounded-lg border border-border bg-card/60 p-4 text-[15px] leading-7 outline-none focus:border-primary/60"
          />
          {lastClassified && (
            <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
              AI 已识别你上一轮回答里的：
              <ClassifiedStrip c={lastClassified} inline />
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted-foreground">
              AI 会区分「事实 / 情绪 / 判断 / 推测」，只把可观察行为当证据。
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={submit}
                disabled={!answer.trim() || !currentQ}
                className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
              >
                下一题 →
              </button>
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="rounded-lg border border-border bg-card/60 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {scanMode === "quick"
              ? "快速扫描已完成。AI 将基于 5 轮问诊生成初步判断。"
              : "信息已经足够。接下来 AI 会基于 10 轮问诊生成完整的报告。"}
          </p>
          <button
            onClick={onDone}
            className="mt-4 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:brightness-110"
          >
            开始扫描 →
          </button>
        </div>
      )}
    </section>
  );
}

/* -------------------- Scanning -------------------- */

function Scanning({ onDone, onRetry, reportError }: { onDone: () => void; onRetry: () => void; reportError: string | null }) {
  const steps = [
    "分析权力变化",
    "分析核心资源",
    "检查信息流向",
    "分析关键关系",
    "评估发展空间变化",
    "判断这是偶然还是趋势",
  ];
  const [done, setDone] = useState<number>(0);
  const firedRef = useRef(false);

  // 错误时停止动画
  useEffect(() => {
    if (reportError) return;
    if (done >= steps.length) {
      if (firedRef.current) return;
      firedRef.current = true;
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 650);
    return () => clearTimeout(t);
  }, [done, onDone, steps.length, reportError]);

  if (reportError) {
    return (
      <section className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 rounded-full bg-destructive/10 p-4">
          <span className="text-3xl">⚠️</span>
        </div>
        <h3 className="text-lg font-medium text-foreground">报告生成失败</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {reportError}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          你的问诊内容已保留，可以重试。
        </p>
        <button
          onClick={onRetry}
          className="mt-6 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110"
        >
          重试生成报告
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="relative h-3 w-3">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
          <span className="absolute inset-0 rounded-full bg-primary" />
        </div>
        <span className="text-sm tracking-widest text-muted-foreground">
          正在完成你的职场 X 光扫描……
        </span>
      </div>

      <ul className="w-full space-y-3">
        {steps.map((s, i) => {
          const state = i < done ? "done" : i === done ? "doing" : "wait";
          return (
            <li
              key={s}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all duration-300 ${
                state === "done"
                  ? "border-primary/40 bg-card/60 text-foreground"
                  : state === "doing"
                    ? "border-primary/60 bg-card/70 text-foreground"
                    : "border-border/50 bg-card/20 text-muted-foreground"
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  state === "done"
                    ? "bg-primary text-primary-foreground"
                    : state === "doing"
                      ? "bg-primary/30 text-foreground"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {state === "done" ? "✓" : state === "doing" ? "…" : "•"}
              </span>
              {s}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* -------------------- Report -------------------- */

function ReportView({ report, scanMode, assessmentIdRef, onRestart }: { report: Report; scanMode: ScanMode; assessmentIdRef: React.MutableRefObject<string | null>; onRestart: () => void }) {
  const possibilities = toPossibilities(report.explanations);
  const knownFacts = cleanList(report.knownFacts);
  const judgements = cleanList(report.inferences);
  const assumptions = cleanList(report.openAssumptions);
  const conclusion = conclusionBlocks(report);
  const observe = dynamicObserveSignals(report);
  const reversal = reversalAssessment(report);
  const quality = reportQualitySnapshot(report);
  const [exporting, setExporting] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const shareText = buildReportShareText(report);
  const shareUrl = assessmentIdRef.current
    ? `${window.location.origin}/share/${assessmentIdRef.current}`
    : "";

  const handleExport = async () => {
    const el = document.getElementById("report-content");
    if (!el || exporting) return;
    setExporting(true);
    try {
      await exportReportAsPdf(el, "AI职场X光报告.pdf");
      toast.success("报告已开始下载");
    } catch (e) {
      console.error("PDF export failed", e);
      const message = e instanceof Error ? e.message : "PDF 导出失败，请重试";
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const handleCopyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success("分享文案已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) {
      toast.error("分享链接不可用");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("分享链接已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            AI JOB X-RAY REPORT
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-3xl">
            你的 AI 职场 X 光报告
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowShare(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground/80 transition hover:bg-secondary"
          >
            <Share2 className="h-4 w-4" />
            分享
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? "导出中…" : "导出 PDF"}
          </button>
          <button
            onClick={onRestart}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground/80 hover:bg-secondary"
          >
            重新扫描
          </button>
        </div>
      </div>

      <div id="report-content">

      {/* 1. 当前状态 */}
      <h3 className="mb-4 text-sm font-medium tracking-wider text-muted-foreground">
        你的当前职场状态
      </h3>
      {import.meta.env.DEV && (
      <div className="mb-4 rounded-xl border border-border bg-card/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-medium tracking-wider text-muted-foreground">
              V1 报告质量门禁
            </div>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              统一检查评分等级、证据分层、行动建议、边界文案和分享字段最小化。
            </p>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={quality.status === "pass" ? "text-primary" : "text-yellow-300"}>
              {quality.status === "pass" ? "通过" : "需复核"}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{quality.score}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quality.gates.map((gate) => (
            <span
              key={gate.id}
              title={gate.detail}
              className={`rounded border px-2 py-1 text-[11px] ${
                gate.passed
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-yellow-500/40 bg-yellow-500/10 text-yellow-200"
              }`}
            >
              {gate.label}
            </span>
          ))}
        </div>
      </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
        <div className="rounded-xl border border-border bg-card/60 p-6">
          <div className="text-xs text-muted-foreground">一句话结论</div>
          <p className="mt-3 text-lg leading-8 text-foreground">
            {headlineFor(report)}
          </p>
          {report.mainIssue && (
            <div className="mt-5 border-t border-border/60 pt-4 text-xs">
              <IssueRow k="当前主要情况" tone="primary" issue={report.mainIssue} />
              {report.secondaryIssues && report.secondaryIssues.length > 0 && (
                <div className="mt-2">
                  <IssueRow k="次要发现" tone="warn" issues={report.secondaryIssues} />
                </div>
              )}
              {report.potentialRisks && report.potentialRisks.length > 0 && (
                <div className="mt-2">
                  <IssueRow k="潜在风险" tone="mute" issues={report.potentialRisks} />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card/60 p-6">
          <div className="text-xs text-muted-foreground">当前风险等级</div>
          <div className="mt-1 text-lg font-medium">{friendlyLevel(report.totalLevel)}</div>
          <div className="mt-4 text-xs text-muted-foreground">综合风险评分</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl font-semibold tabular-nums">
              {report.totalScore}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <Bar value={report.totalScore} className="mt-4" />
          <div className="mt-2 grid grid-cols-5 gap-0.5 text-[9px] text-muted-foreground sm:text-[10px]">
            <span>正常</span>
            <span>轻度</span>
            <span>值得关注</span>
            <span>明显</span>
            <span>显著</span>
          </div>
        </div>
      </div>

      {/* 2. 最值得关注的 3 个信号 */}
      <Section title="目前最值得关注的 3 个信号">
        <ol className="grid gap-3 sm:grid-cols-3">
          {cleanList(report.topSignals).map((s, i) => (
            <li key={i} className="rounded-lg border border-border/70 bg-secondary/30 p-4 text-sm leading-7">
              <span className="mr-2 text-primary">#{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          以上信号来自你在问诊中提供的描述。
        </p>
      </Section>

      {/* 3. 五维扫描 */}
      <h3 className="mt-10 mb-4 text-sm font-medium tracking-wider text-muted-foreground">
        五维扫描
      </h3>
      <div className="mb-8">
        <RadarChartView dimensions={report.dimensions} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.dimensions.map((d) => (
          <ScoreBar key={d.key} dimension={d} />
        ))}
      </div>

      {/* 4. 事实与判断 */}
      <Section title="事实与判断">
        <p className="mb-4 text-xs leading-6 text-muted-foreground">
          {JUDGEMENT_NOTE}
        </p>
        <div className="mb-4 rounded-lg border border-border/60 bg-card/30 p-4 text-xs leading-6 text-muted-foreground">
          <span className="font-medium text-foreground/80">这个判断的依据：</span>
          以下「已确认的情况」来自你在问诊中明确描述过的可观察行为；「AI 逻辑推断」是 AI 基于这些事实的推理，不代表确定的结论；「未验证假设」是你提到过但缺少行为证据的判断/推测，需要后续验证。
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <FactCard
            title="已确认的情况"
            hint="你明确描述过的事实"
            tone="fact"
            items={knownFacts}
          />
          <FactCard
            title="AI 逻辑推断"
            hint="基于事实的分析，不代表确定结论"
            tone="inference"
            items={judgements}
          />
          <FactCard
            title="未验证假设"
            hint="需要进一步验证的判断"
            tone="assumption"
            items={assumptions}
          />
        </div>
      </Section>

      {/* 偶然 vs 趋势 */}
      <Section title='你的变化是"偶然"还是"趋势"'>
        <div className="rounded-xl border border-border bg-card/50 p-5">
          <div className="text-sm font-medium">{report.trend.verdict}</div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <TrendRow k="发生频率" v={report.trend.frequency} />
            <TrendRow k="持续时间" v={report.trend.duration} />
            <TrendRow k="是否连续发生" v={report.trend.continuous} />
            <TrendRow k="是否涉及核心资源" v={report.trend.coreResource} />
            <TrendRow k="是否存在新的承接者" v={report.trend.successor} />
          </dl>
        </div>
      </Section>

      {/* 5. 目前可能存在的 3 种情况 */}
      <Section title="目前可能存在的 3 种情况">
        <p className="mb-4 text-xs leading-6 text-muted-foreground">
          {POSSIBILITY_NOTE}
        </p>
        <ul className="grid gap-3 sm:grid-cols-3">
          {possibilities.map((p, i) => (
            <li key={i} className="rounded-lg border border-border/70 bg-card/40 p-4 text-sm leading-7">
              <div className="font-medium">{p.title}</div>
              {p.detail && (
                <p className="mt-1 text-muted-foreground">{p.detail}</p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {/* 6. 误判 / 最容易误判的地方 */}
      <Section title="这件事，现在还不能下结论">
        {/* misjudgment 高价值字段优先展示 */}
        {report.misjudgment ? (
          <div className="mb-4 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 text-sm leading-7">
            <div className="mb-1 text-xs font-medium text-orange-400">最容易误判的地方</div>
            <p className="text-foreground/90">{cleanCopy(report.misjudgment)}</p>
          </div>
        ) : null}
        <div className="grid gap-3 rounded-lg border border-border/70 bg-secondary/40 p-4 text-sm leading-7">
          <div>
            <span className="text-muted-foreground">目前可以确认：</span>
            {conclusion.confirmed}
          </div>
          <div>
            <span className="text-muted-foreground">目前不能确认：</span>
            {conclusion.unconfirmed}
          </div>
          <div>
            <div className="text-muted-foreground">还需要观察：</div>
            <ul className="mt-1 space-y-1">
              {conclusion.observe.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">·</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 7. 可调整空间 */}
      <Section title="当前可调整空间">
        <div className="flex items-start gap-4 rounded-lg border border-border/70 bg-card/40 p-4">
          <span className="whitespace-nowrap text-2xl font-semibold leading-none">
            {reversal.label}
          </span>
          <span className="text-sm leading-7 text-muted-foreground">
            {reversal.hint}
          </span>
        </div>
      </Section>

      {/* 8. 未来 30 天观察 */}
      <Section title="未来 30 天，重点观察这 3 个信号">
        <ul className="grid gap-3 sm:grid-cols-3">
          {observe.map((s, i) => (
            <li key={i} className="rounded-lg border border-border/70 bg-card/50 p-4 text-sm leading-7">
              {s}
            </li>
          ))}
        </ul>
      </Section>

      {report.futureTrend && (
        <Section title="未来趋势判断">
          <div className="grid gap-4 lg:grid-cols-[1fr,1.4fr]">
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <div className="text-xs text-muted-foreground">未来 30 天风险</div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-4xl font-semibold">{report.futureTrend.in30d.risk}</span>
              </div>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                {cleanCopy(report.futureTrend.in30d.note)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <div className="mb-3 text-xs text-muted-foreground">未来 3 个月观察点</div>
              <ul className="space-y-2 text-sm leading-7">
                {cleanList(report.futureTrend.in3m).map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary">·</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}

      {/* Do / Don't */}
      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-destructive/40 bg-card/50 p-5">
          <div className="mb-3 text-sm font-medium text-destructive">
            现在最容易做错的 3 件事
          </div>
          <ul className="space-y-2 text-sm leading-7">
            {cleanList(report.dontDo).slice(0, 3).map((s, i) => (
              <li key={i}>× {s}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-primary/40 bg-card/50 p-5">
          <div className="mb-3 text-sm font-medium text-primary">
            现在应该做的 3 件事
          </div>
          <ul className="space-y-2 text-sm leading-7">
            {cleanList(report.shouldDo).slice(0, 3).map((s, i) => (
              <li key={i}>✓ {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* 9. 接下来怎么做 */}
      <Section title="接下来怎么做">
        <div className="grid gap-4 lg:grid-cols-3">
          <ActionCard title="72 小时 · 短期动作" items={cleanList(report.actions.in72h)} />
          <ActionCard title="7 天 · 近期动作" items={cleanList(report.actions.in7d)} />
          <ActionCard title="30 天 · 中期动作" items={cleanList(report.actions.in30d)} />
        </div>
      </Section>

      {/* ---- 深度报告专属区块 ---- */}
      {scanMode === "deep" && (
        <>
          {/* 10. 证据链 */}
          {knownFacts.length > 0 && (
            <Section title="证据链：从事实到判断">
              <div className="space-y-3">
                {report.dimensions
                  .filter((d) => d.score >= 30)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 4)
                  .map((d, i) => (
                    <div key={i} className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm leading-7">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs font-medium text-primary">
                          {FRIENDLY_DIMENSION_LABEL[d.key]}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · 评分 {d.score}/100 ·{" "}
                          {d.score >= 55 ? "较高" : d.score >= 35 ? "中等" : "较低"}置信度
                        </span>
                      </div>
                      {d.supportingFacts.length > 0 && (
                        <div className="mb-2">
                          <span className="text-xs text-muted-foreground">支撑事实：</span>
                          <ul className="mt-1 ml-3 list-disc space-y-0.5 text-muted-foreground">
                            {d.supportingFacts.slice(0, 2).map((f, j) => (
                              <li key={j}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-muted-foreground">判断：</span>
                        <span>{d.explain}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {/* 11. 反向证据 */}
          {report.dimensions.some((d) => d.reverseFacts.length > 0) && (
            <Section title="反向证据：哪些信号降低了风险">
              <p className="mb-3 text-xs leading-6 text-muted-foreground">
                以下信号来自你在问诊中的描述，它们与高风险推论方向相反，值得同等重视。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {report.dimensions
                  .filter((d) => d.reverseFacts.length > 0)
                  .map((d, i) => (
                    <div key={i} className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 text-sm leading-7">
                      <div className="mb-1 text-xs font-medium text-green-400">
                        {FRIENDLY_DIMENSION_LABEL[d.key]} · 反向信号
                      </div>
                      <ul className="ml-3 list-disc space-y-1">
                        {d.reverseFacts.map((f, j) => (
                          <li key={j} className="text-muted-foreground">{f}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {/* 12. 信息缺口 */}
          {assumptions.length > 0 && (
            <Section title="信息缺口：补齐后可能如何改变结论">
              <p className="mb-3 text-xs leading-6 text-muted-foreground">
                以下信息目前缺失或不确定。如果你能通过观察或行动补全它们，结论可能会发生变化。
              </p>
              <ul className="space-y-3">
                {assumptions.slice(0, 4).map((a, i) => (
                  <li key={i} className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm leading-7">
                    <span className="mr-2 text-orange-400">✦</span>
                    {a}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      </div>

      {/* Share dialog */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">分享报告摘要</h3>
              <button
                onClick={() => setShowShare(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              以下摘要适合发送给朋友或发到社交媒体，不包含你的原始输入。
            </p>
            <div className="mb-4 rounded-lg border border-border/60 bg-secondary/40 p-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                匿名分享链接
              </div>
              <div className="break-all text-sm leading-6 text-foreground/90">
                {shareUrl || "链接生成中…"}
              </div>
            </div>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-secondary/40 p-4 text-sm leading-6 text-foreground/90">
              {shareText}
            </pre>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={handleCopyShareLink}
                disabled={!shareUrl}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                复制链接
              </button>
              <button
                onClick={handleCopyShare}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground/80 transition hover:bg-secondary"
              >
                <Copy className="h-4 w-4" />
                复制分享文案
              </button>
              <button
                onClick={() => setShowShare(false)}
                className="rounded-md border border-border px-4 py-2.5 text-sm text-foreground/80 hover:bg-secondary transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <h3 className="mb-4 text-sm font-medium tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Bar({ value, className = "" }: { value: number; className?: string }) {
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
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-secondary ${className}`}>
      <div className={`h-full ${color} transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

function TrendRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 last:border-b-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right text-foreground/90">{v}</span>
    </div>
  );
}

function IssueRow({
  k,
  tone,
  issue,
  issues,
}: {
  k: string;
  tone: "primary" | "warn" | "mute";
  issue?: { type: string; label: string; confidence: number };
  issues?: Array<{ type: string; label: string; confidence: number }>;
}) {
  const list = issues ?? (issue ? [issue] : []);
  if (list.length === 0) return null;
  const border =
    tone === "primary"
      ? "border-primary/50 text-foreground"
      : tone === "warn"
        ? "border-yellow-500/40 text-yellow-100/90"
        : "border-border text-muted-foreground";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground">{k}</span>
      {list.map((it, i) => (
        <span
          key={`${it.type}-${i}`}
          className={`inline-flex items-center gap-1 rounded border bg-card/40 px-2 py-0.5 ${border}`}
        >
          {it.label}
          <span className="text-[10px] text-muted-foreground">
            {Math.round((it.confidence ?? 0) * 100)}%
          </span>
        </span>
      ))}
    </div>
  );
}

function ActionCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <ol className="space-y-2 text-sm leading-7">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-primary">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function FactCard({
  title,
  hint,
  tone,
  items,
}: {
  title: string;
  hint: string;
  tone: "fact" | "inference" | "assumption";
  items: string[];
}) {
  const border =
    tone === "fact"
      ? "border-primary/40"
      : tone === "inference"
        ? "border-orange-500/40"
        : "border-yellow-500/40";
  const dot =
    tone === "fact"
      ? "bg-primary"
      : tone === "inference"
        ? "bg-orange-400"
        : "bg-yellow-400";
  return (
    <div className={`rounded-xl border bg-card/50 p-5 ${border}`}>
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {title}
      </div>
      <div className="mb-3 text-[11px] text-muted-foreground">{hint}</div>
      <ul className="space-y-2 text-sm leading-7">
        {items.map((s, i) => (
          <li key={i} className="text-foreground/90">
            · {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------- shared helpers -------------------- */

function tagLabel(tag: NonNullable<QAItem["targetDimension"]>): string {
  if (tag === "clarify") return "澄清";
  if (tag === "reverse") return "反向验证";
  if (tag === "trend") return "时间趋势";
  return DIMENSION_LABEL[tag];
}

function ClassifiedStrip({
  c,
  inline = false,
}: {
  c: Classified;
  inline?: boolean;
}) {
  const items = (
    [
      { kind: "fact", count: c.facts.length },
      { kind: "emotion", count: c.emotions.length },
      { kind: "judgment", count: c.judgments.length },
      { kind: "inference", count: c.inferences.length },
    ] as { kind: keyof typeof STATEMENT_LABEL; count: number }[]
  ).filter((x) => x.count > 0);
  if (items.length === 0) return null;
  const styleFor = (k: string) =>
    k === "fact"
      ? "border-primary/40 text-foreground/90"
      : k === "emotion"
        ? "border-border text-muted-foreground"
        : k === "judgment"
          ? "border-yellow-500/40 text-yellow-200/90"
          : "border-orange-500/40 text-orange-200/90";
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${inline ? "mt-2" : "mt-1"} text-[11px]`}
    >
      {items.map((it) => (
        <span
          key={it.kind}
          className={`rounded border bg-card/40 px-1.5 py-0.5 ${styleFor(it.kind)}`}
        >
          {STATEMENT_LABEL[it.kind]} × {it.count}
        </span>
      ))}
      {c.reverseEvidence.length > 0 && (
        <span className="rounded border border-emerald-500/40 bg-card/40 px-1.5 py-0.5 text-emerald-200/90">
          反向证据 × {c.reverseEvidence.length}
        </span>
      )}
    </div>
  );
}
