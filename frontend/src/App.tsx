import { useEffect, useState } from "react";
import {
  fetchAnalysis,
  fetchMeta,
  fetchTimeSeries,
  type Analysis,
  type Meta,
  type SelectionParams,
  type TimeSeries,
} from "./api";
import { Controls } from "./components/Controls";
import { ErrorByHorizon } from "./components/ErrorByHorizon";
import { ErrorByHour } from "./components/ErrorByHour";
import { ErrorHistogram } from "./components/ErrorHistogram";
import { KpiCards } from "./components/KpiCards";
import { TimeSeriesChart } from "./components/TimeSeriesChart";
import { useChartTheme } from "./theme";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Fetch with abort-on-change; keeps the previous result while the next one loads. */
function useFetch<T>(load: ((signal: AbortSignal) => Promise<T>) | null, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!load) return;
    const ctrl = new AbortController();
    setLoading(true);
    load(ctrl.signal)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

export default function App() {
  const theme = useChartTheme();
  const metaQ = useFetch<Meta>((s) => fetchMeta(s), []);
  const meta = metaQ.data;

  const [selection, setSelection] = useState<SelectionParams>({
    mode: "cutoff",
    cutoffTime: "11:00",
    daysBefore: 1,
    horizonHours: 24,
  });
  const [window_, setWindow] = useState<{ start: string; end: string } | null>(null);
  const [bufferQ, setBufferQ] = useState(0.1);
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    setWindow({ start: meta.default_start, end: meta.default_end });
    setDay(meta.default_start);
    setSelection((s) => ({ ...s, cutoffTime: meta.default_cutoff_time, daysBefore: meta.default_days_before }));
    setBufferQ(meta.default_buffer_q);
  }, [meta]);

  const sel = useDebounced(selection, 200);

  const analysisQ = useFetch<Analysis>(
    window_ ? (s) => fetchAnalysis(sel, window_.start, window_.end, bufferQ, s) : null,
    [sel, window_?.start, window_?.end, bufferQ],
  );
  const tsQ = useFetch<TimeSeries>(day ? (s) => fetchTimeSeries(sel, day, s) : null, [sel, day]);

  if (metaQ.error) return <div className="page"><p className="error">Could not load data: {metaQ.error}</p></div>;
  if (!meta || !window_ || !day) return <div className="page"><p className="muted">Loading…</p></div>;

  const a = analysisQ.data;
  const scored = a?.summary.n ?? 0;
  const expected = a?.expected_periods ?? 0;
  const runs = a?.runs_used ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <h1>Day-ahead wind forecast accuracy</h1>
        <p className="muted">
          GB wind: Elexon WINDFOR forecast vs FUELHH outturn. Error = actual − forecast; negative means wind came in
          below forecast and the position was short. Times in Europe/London.
        </p>
      </header>

      <Controls
        meta={meta}
        selection={selection}
        onSelection={setSelection}
        start={window_.start}
        end={window_.end}
        onWindow={(start, end) => setWindow({ start, end })}
        bufferQ={bufferQ}
        onBufferQ={setBufferQ}
      />

      {analysisQ.error && <p className="error">{analysisQ.error}</p>}

      <KpiCards analysis={a} loading={analysisQ.loading} />

      {a && (
        <p className="status">
          Scored {scored} of {expected} hourly periods
          {runs.length > 0 && (
            <>
              {" "}· runs used (UTC):{" "}
              {runs.map((r) => `${r.time_utc} ×${r.count}`).join(", ")}
            </>
          )}
          {a.lead_hours.min != null && <> · lead {a.lead_hours.min}–{a.lead_hours.max} h</>}
        </p>
      )}
      {a && scored < expected && (
        <p className="warning" role="status">
          <span aria-hidden>⚠</span> Only {scored} of {expected} hours have a forecast this far ahead. Each run reaches
          about 66 h, and every hour is covered up to a {meta.full_coverage_horizon} h horizon.
        </p>
      )}

      <TimeSeriesChart
        theme={theme}
        data={tsQ.data}
        date={day}
        minDate={meta.data_min_date}
        maxDate={meta.data_max_date}
        onDate={setDay}
        loading={tsQ.loading}
      />

      <div className="grid-2">
        <ErrorHistogram theme={theme} analysis={a} loading={analysisQ.loading} />
        <ErrorByHour theme={theme} analysis={a} loading={analysisQ.loading} />
      </div>

      <ErrorByHorizon theme={theme} analysis={a} loading={analysisQ.loading} />

      <footer className="muted foot">
        {meta.forecast_runs} forecast runs cached, published at{" "}
        {meta.run_schedule_utc.map((r) => r.time).join(", ")} UTC. Data: Elexon Insights Solution (BMRS).
      </footer>
    </div>
  );
}
