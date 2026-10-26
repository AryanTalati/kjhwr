import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analysis, HistogramBin } from "../api";
import { mw, num, signedMw, tick } from "../format";
import type { ChartTheme } from "../theme";
import { Card, LegendItem, Tip } from "./Card";

export function ErrorHistogram({ theme, analysis, loading }: { theme: ChartTheme; analysis: Analysis | null; loading: boolean }) {
  const bins = (analysis?.histogram ?? []).map((b) => ({ ...b, mid: (b.lo + b.hi) / 2 }));
  const buffer = analysis?.buffer.mw ?? null;
  const pct = Math.round((analysis?.buffer.q ?? 0.1) * 100);
  const total = analysis?.summary.n ?? 0;
  // A bin is in the shortfall tail if it lies wholly beyond the buffer.
  const inTail = (b: HistogramBin) => buffer != null && buffer > 0 && b.hi <= -buffer;
  const lo = bins.length ? bins[0].lo : 0;
  const hi = bins.length ? bins[bins.length - 1].hi : 0;
  const step = hi - lo > 8000 ? 2000 : 1000;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);

  const table = (
    <table>
      <thead>
        <tr>
          <th>Error from</th>
          <th>to</th>
          <th>Hours</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        {bins.map((b) => (
          <tr key={b.lo}>
            <td>{signedMw(b.lo)}</td>
            <td>{signedMw(b.hi)}</td>
            <td>{b.count}</td>
            <td>{total ? `${((100 * b.count) / total).toFixed(1)}%` : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card
      title="Error distribution"
      subtitle={<>Hours by error (actual − forecast), 500 MW bins. Left of zero means wind came in short.</>}
      legend={
        <>
          <LegendItem color={theme.actual} label="Hours" kind="rect" />
          <LegendItem color={theme.forecast} label={`Shortfall beyond buffer (worst ${pct}%)`} kind="rect" />
        </>
      }
      table={table}
      loading={loading}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={bins} barCategoryGap={2} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="mid"
            type="number"
            domain={[lo, hi]}
            ticks={ticks}
            tickFormatter={tick}
            tick={{ fill: theme.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: theme.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: theme.wash }}
            content={({ active, payload }) => {
              const b = active ? (payload?.[0]?.payload as HistogramBin | undefined) : undefined;
              if (!b) return null;
              return (
                <Tip
                  title={`${signedMw(b.lo)} to ${signedMw(b.hi)}`}
                  rows={[{ color: inTail(b) ? theme.forecast : theme.actual, label: "hours", value: num(b.count), kind: "rect" }]}
                  note={total ? `${((100 * b.count) / total).toFixed(1)}% of scored hours` : undefined}
                />
              );
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {bins.map((b) => (
              <Cell key={b.lo} fill={inTail(b) ? theme.forecast : theme.actual} />
            ))}
          </Bar>
          <ReferenceLine x={0} stroke={theme.inkSecondary} strokeWidth={1} label={{ value: "0", position: "top", fill: theme.muted, fontSize: 12 }} />
          {buffer != null && buffer > 0 && (
            <ReferenceLine
              x={-buffer}
              stroke={theme.inkSecondary}
              strokeWidth={1}
              label={{ value: `Buffer ${mw(buffer)}`, position: "top", fill: theme.inkSecondary, fontSize: 12 }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
