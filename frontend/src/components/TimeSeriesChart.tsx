import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Point, TimeSeries } from "../api";
import { londonTime, mw, shiftDate, signedMw, tick } from "../format";
import { useNarrow, type ChartTheme } from "../theme";
import { Card, LegendItem, Tip } from "./Card";

interface Props {
  theme: ChartTheme;
  data: TimeSeries | null;
  date: string;
  minDate: string;
  maxDate: string;
  onDate: (d: string) => void;
  loading: boolean;
}

export function TimeSeriesChart({ theme, data, date, minDate, maxDate, onDate, loading }: Props) {
  const narrow = useNarrow();
  const points = data?.points ?? [];
  const s = data?.summary;
  const run = points.find((p) => p.publishTime)?.publishTime ?? null;

  const actions = (
    <div className="inline">
      <button type="button" className="ghost" aria-label="Previous day" disabled={date <= minDate} onClick={() => onDate(shiftDate(date, -1))}>
        ‹
      </button>
      <input
        type="date"
        aria-label="Delivery day to plot"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => e.target.value && onDate(e.target.value)}
      />
      <button type="button" className="ghost" aria-label="Next day" disabled={date >= maxDate} onClick={() => onDate(shiftDate(date, 1))}>
        ›
      </button>
    </div>
  );

  const table = (
    <table>
      <thead>
        <tr>
          <th>Time (London)</th>
          <th>Actual MW</th>
          <th>Forecast MW</th>
          <th>Error MW</th>
          <th>Run used</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.time}>
            <td>{p.label}</td>
            <td>{mw(p.actual)}</td>
            <td>{mw(p.forecast)}</td>
            <td>{signedMw(p.error)}</td>
            <td>{londonTime(p.publishTime)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card
      title="Forecast vs actual"
      subtitle={
        <>
          Half-hourly actual output, hourly forecast. Day MAE {mw(s?.mae)}, bias {signedMw(s?.bias)}
          {run && <> · run published {londonTime(run)}</>}
        </>
      }
      actions={actions}
      legend={
        <>
          <LegendItem color={theme.actual} label="Actual (FUELHH)" kind="line" />
          <LegendItem color={theme.forecast} label="Forecast (WINDFOR)" kind="line" />
        </>
      }
      table={table}
      loading={loading}
    >
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis
            dataKey="label"
            interval={narrow ? 11 : 5}
            tick={{ fill: theme.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
          />
          <YAxis
            tickFormatter={tick}
            tick={{ fill: theme.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={["auto", "auto"]}
            unit=""
          />
          <Tooltip
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!p) return null;
              const rows = [{ color: theme.actual, label: "Actual", value: mw(p.actual) }];
              if (p.forecast != null) rows.push({ color: theme.forecast, label: "Forecast", value: mw(p.forecast) });
              return (
                <Tip
                  title={p.label}
                  rows={rows}
                  note={p.error != null ? `Error ${signedMw(p.error)} · lead ${p.lead_hours} h` : "No hourly forecast at :30"}
                />
              );
            }}
          />
          <Line
            dataKey="actual"
            stroke={theme.actual}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="forecast"
            connectNulls
            stroke={theme.forecast}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
}
