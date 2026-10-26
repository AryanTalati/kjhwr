import { CartesianGrid, LineChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analysis, HorizonRow } from "../api";
import { mw, signedMw, tick } from "../format";
import type { ChartTheme } from "../theme";
import { Card, LegendItem, Tip } from "./Card";

export function ErrorByHorizon({ theme, analysis, loading }: { theme: ChartTheme; analysis: Analysis | null; loading: boolean }) {
  const rows = (analysis?.by_horizon ?? []).map((r) => ({ ...r, mid: (r.lead_from + r.lead_to) / 2 }));
  const lead = analysis?.lead_hours;

  const table = (
    <table>
      <thead>
        <tr>
          <th>Lead time</th>
          <th>Pairs</th>
          <th>MAE</th>
          <th>RMSE</th>
          <th>Bias</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.lead_from}>
            <td>
              {r.lead_from}–{r.lead_to} h
            </td>
            <td>{r.n}</td>
            <td>{mw(r.mae)}</td>
            <td>{mw(r.rmse)}</td>
            <td>{signedMw(r.bias)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card
      title="Error by forecast horizon"
      subtitle={
        <>
          Every forecast run scored against outturn, grouped into 6-hour lead-time buckets. The shaded band shows
          the lead times you are using
          {lead?.min != null && (
            <>
              {" "}
              ({lead.min}–{lead.max} h, mean {lead.mean} h)
            </>
          )}
          .
        </>
      }
      legend={
        <>
          <LegendItem color={theme.actual} label="MAE" kind="line" />
          <LegendItem color={theme.forecast} label="Bias (actual − forecast)" kind="line" />
        </>
      }
      table={table}
      loading={loading}
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          {lead?.min != null && lead.max != null && (
            <ReferenceArea x1={lead.min} x2={lead.max} fill={theme.wash} fillOpacity={1} stroke="none" ifOverflow="extendDomain" />
          )}
          <XAxis
            dataKey="mid"
            type="number"
            domain={[0, 66]}
            ticks={[0, 12, 24, 36, 48, 60]}
            tickFormatter={(v: number) => `${v} h`}
            tick={{ fill: theme.muted, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: theme.axis }}
          />
          <YAxis tickFormatter={tick} tick={{ fill: theme.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
          <ReferenceLine y={0} stroke={theme.axis} />
          <Tooltip
            cursor={{ stroke: theme.axis, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const r = active ? (payload?.[0]?.payload as HorizonRow | undefined) : undefined;
              if (!r) return null;
              return (
                <Tip
                  title={`Lead ${r.lead_from}–${r.lead_to} h · ${r.n} pairs`}
                  rows={[
                    { color: theme.actual, label: "MAE", value: mw(r.mae) },
                    { color: theme.forecast, label: "Bias", value: signedMw(r.bias) },
                  ]}
                  note={`RMSE ${mw(r.rmse)}`}
                />
              );
            }}
          />
          <Line
            dataKey="mae"
            stroke={theme.actual}
            strokeWidth={2}
            dot={{ r: 4, fill: theme.actual, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="bias"
            stroke={theme.forecast}
            strokeWidth={2}
            dot={{ r: 4, fill: theme.forecast, stroke: theme.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
