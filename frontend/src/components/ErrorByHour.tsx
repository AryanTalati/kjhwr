import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analysis, HourRow } from "../api";
import { mw, pad2, signedMw, tick } from "../format";
import { useNarrow, type ChartTheme } from "../theme";
import { Card, LegendItem, Tip } from "./Card";

export function ErrorByHour({ theme, analysis, loading }: { theme: ChartTheme; analysis: Analysis | null; loading: boolean }) {
  const narrow = useNarrow();
  const rows = (analysis?.by_hour ?? []).map((r) => ({ ...r, label: `${pad2(r.hour)}:00` }));
  const pct = Math.round((analysis?.buffer.q ?? 0.1) * 100);

  const table = (
    <table>
      <thead>
        <tr>
          <th>Hour (London)</th>
          <th>Hours</th>
          <th>MAE</th>
          <th>Bias</th>
          <th>P10</th>
          <th>P90</th>
          <th>Buffer (P{pct})</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.hour}>
            <td>{r.label}</td>
            <td>{r.n}</td>
            <td>{mw(r.mae)}</td>
            <td>{signedMw(r.bias)}</td>
            <td>{signedMw(r.p10)}</td>
            <td>{signedMw(r.p90)}</td>
            <td>{mw(r.buffer)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card
      title="Error by hour of day"
      subtitle="Mean absolute error and bias for each delivery hour (London time). The table adds a buffer for each hour."
      legend={
        <>
          <LegendItem color={theme.actual} label="MAE" kind="rect" />
          <LegendItem color={theme.forecast} label="Bias (actual − forecast)" kind="line" />
        </>
      }
      table={table}
      loading={loading}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="label" interval={narrow ? 5 : 2} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: theme.axis }} />
          <YAxis tickFormatter={tick} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
          <ReferenceLine y={0} stroke={theme.axis} />
          <Tooltip
            cursor={{ fill: theme.wash }}
            content={({ active, payload }) => {
              const r = active ? (payload?.[0]?.payload as (HourRow & { label: string }) | undefined) : undefined;
              if (!r) return null;
              return (
                <Tip
                  title={`${r.label} London · ${r.n} hours`}
                  rows={[
                    { color: theme.actual, label: "MAE", value: mw(r.mae), kind: "rect" },
                    { color: theme.forecast, label: "Bias", value: signedMw(r.bias) },
                  ]}
                  note={`P10 ${signedMw(r.p10)} · P90 ${signedMw(r.p90)} · buffer ${mw(r.buffer)}`}
                />
              );
            }}
          />
          <Bar dataKey="mae" fill={theme.actual} maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line
            dataKey="bias"
            stroke={theme.forecast}
            strokeWidth={2}
            dot={{ r: 4, fill: theme.forecast, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
