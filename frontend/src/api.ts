export type Mode = "cutoff" | "horizon";

export interface SelectionParams {
  mode: Mode;
  cutoffTime: string;
  daysBefore: number;
  horizonHours: number;
}

export interface Meta {
  data_min_date: string;
  data_max_date: string;
  default_start: string;
  default_end: string;
  default_cutoff_time: string;
  default_days_before: number;
  default_buffer_q: number;
  timezone: string;
  forecast_runs: number;
  run_schedule_utc: { time: string; count: number }[];
  max_horizon: number;
  full_coverage_horizon: number;
}

export interface Summary {
  n: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

export interface HistogramBin {
  lo: number;
  hi: number;
  count: number;
}

export interface HourRow {
  hour: number;
  n: number;
  mae: number;
  bias: number;
  p10: number;
  p90: number;
  buffer: number;
}

export interface HorizonRow {
  lead_from: number;
  lead_to: number;
  n: number;
  mae: number;
  rmse: number;
  bias: number;
}

export interface Analysis {
  window: { start: string; end: string };
  expected_periods: number;
  summary: Summary;
  buffer: { mw: number | null; q: number; sentence: string };
  histogram: HistogramBin[];
  by_hour: HourRow[];
  by_horizon: HorizonRow[];
  lead_hours: { min: number | null; mean: number | null; max: number | null };
  runs_used: { time_utc: string; count: number }[];
}

export interface Point {
  time: string;
  label: string;
  actual: number;
  forecast: number | null;
  error: number | null;
  publishTime: string | null;
  lead_hours: number | null;
}

export interface TimeSeries {
  date: string;
  points: Point[];
  summary: Summary;
}

function selectionQuery(s: SelectionParams): Record<string, string> {
  return {
    mode: s.mode,
    cutoff_time: s.cutoffTime,
    days_before: String(s.daysBefore),
    horizon_hours: String(s.horizonHours),
  };
}

async function getJson<T>(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${path}?${new URLSearchParams(params)}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const fetchMeta = (signal?: AbortSignal) => getJson<Meta>("/api/meta", {}, signal);

export const fetchAnalysis = (
  s: SelectionParams,
  start: string,
  end: string,
  bufferQ: number,
  signal?: AbortSignal,
) =>
  getJson<Analysis>(
    "/api/analysis",
    { ...selectionQuery(s), start, end, buffer_q: String(bufferQ) },
    signal,
  );

export const fetchTimeSeries = (s: SelectionParams, date: string, signal?: AbortSignal) =>
  getJson<TimeSeries>("/api/timeseries", { ...selectionQuery(s), date }, signal);
