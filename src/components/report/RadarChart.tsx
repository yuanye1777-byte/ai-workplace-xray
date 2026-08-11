import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DimensionScore } from "@/lib/ai/types";
import { FRIENDLY_DIMENSION_LABEL } from "@/lib/report-presenter";

interface RadarChartViewProps {
  dimensions: DimensionScore[];
}

const DIM_ORDER: Array<DimensionScore["key"]> = [
  "power",
  "resource",
  "info",
  "relation",
  "replace",
];

export default function RadarChartView({ dimensions }: RadarChartViewProps) {
  const data = DIM_ORDER.map((key) => {
    const d = dimensions.find((x) => x.key === key);
    return {
      dimension: FRIENDLY_DIMENSION_LABEL[key],
      score: d?.score ?? 0,
      fullMark: 100,
    };
  });

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <ResponsiveContainer width="100%" height={340}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid
            stroke="oklch(from var(--border) l c h / 0.5)"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{
              fontSize: 12,
              fill: "var(--muted-foreground)",
            }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{
              fontSize: 10,
              fill: "var(--muted-foreground)",
            }}
            tickCount={5}
            stroke="oklch(from var(--border) l c h / 0.3)"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--foreground)",
            }}
            formatter={(value: number) => [`${value} / 100`, "风险评分"]}
          />
          <Radar
            name="风险评分"
            dataKey="score"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.18}
            strokeWidth={2}
            dot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#dc2626", strokeWidth: 0 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
