import type { DimensionScore } from "@/lib/ai/types";
import { FRIENDLY_DIMENSION_LABEL, cleanCopy, cleanList } from "@/lib/report-presenter";

interface ScoreBarProps {
  dimension: DimensionScore;
}

function scoreColor(score: number): { bg: string; text: string; label: string } {
  if (score <= 20)
    return { bg: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "正常" };
  if (score <= 40)
    return { bg: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-400", label: "轻度变化" };
  if (score <= 60)
    return { bg: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", label: "值得关注" };
  if (score <= 80)
    return { bg: "bg-red-500", text: "text-red-600 dark:text-red-400", label: "变化明显" };
  return { bg: "bg-red-700", text: "text-red-700 dark:text-red-400", label: "变化显著" };
}

export default function ScoreBar({ dimension: d }: ScoreBarProps) {
  const color = scoreColor(d.score);
  const supportingFacts = cleanList(d.supportingFacts);
  const reverseFacts = cleanList(d.reverseFacts);

  return (
    <div className="rounded-xl border border-border bg-card/60 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {FRIENDLY_DIMENSION_LABEL[d.key]}
        </span>
        <span className={`text-xs font-medium ${color.text}`}>{color.label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-semibold tabular-nums">{d.score}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full ${color.bg} transition-all duration-700`}
          style={{ width: `${d.score}%` }}
        />
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">
        {cleanCopy(d.explain)}
      </p>

      {supportingFacts.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
            支持信号
          </div>
          <ul className="space-y-0.5">
            {supportingFacts.map((f, i) => (
              <li key={i} className="text-xs leading-5 text-muted-foreground">
                · {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reverseFacts.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <div className="mb-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            反向信号
          </div>
          <ul className="space-y-0.5">
            {reverseFacts.map((f, i) => (
              <li key={i} className="text-xs leading-5 text-muted-foreground">
                · {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
