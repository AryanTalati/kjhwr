"""FastAPI app: JSON API under /api and the built React app at /."""

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time
from functools import lru_cache
from typing import Literal

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, metrics
from .data import load
from .selection import all_pairs, filter_delivery, join_actuals, select_by_cutoff, select_by_horizon

app = FastAPI(title="Wind forecast accuracy", version="1.0.0")
app.add_middleware(GZipMiddleware, minimum_size=1000)

MAX_HORIZON = 66


@dataclass(frozen=True)
class Selection:
    mode: Literal["cutoff", "horizon"]
    cutoff_time: time
    days_before: int
    horizon_hours: float


def selection_params(
    mode: Literal["cutoff", "horizon"] = "cutoff",
    cutoff_time: str = Query(config.DEFAULT_CUTOFF_TIME, pattern=r"^([01]\d|2[0-3]):[0-5]\d$"),
    days_before: int = Query(config.DEFAULT_DAYS_BEFORE, ge=0, le=2),
    horizon_hours: float = Query(24, ge=0, le=MAX_HORIZON),
) -> Selection:
    return Selection(mode, time.fromisoformat(cutoff_time), days_before, horizon_hours)


@lru_cache(maxsize=64)
def joined(sel: Selection) -> pd.DataFrame:
    forecasts, actuals = load()
    if sel.mode == "cutoff":
        chosen = select_by_cutoff(forecasts, sel.cutoff_time, sel.days_before)
    else:
        chosen = select_by_horizon(forecasts, sel.horizon_hours)
    return join_actuals(chosen, actuals)


@lru_cache(maxsize=1)
def pairs() -> pd.DataFrame:
    return all_pairs(*load())


def _local_dates(s: pd.Series) -> pd.Series:
    return s.dt.tz_convert(config.LOCAL_TZ).dt.date


@lru_cache(maxsize=1)
def data_range() -> tuple[date, date]:
    _, actuals = load()
    d = _local_dates(actuals["startTime"])
    return d.min(), d.max()


def _hourly_periods(start: date, end: date) -> int:
    """Number of on-the-hour actual periods in the window (the scoring universe)."""
    _, actuals = load()
    a = filter_delivery(actuals, start, end)
    return int((a["startTime"].dt.minute == 0).sum())


@lru_cache(maxsize=1)
def full_coverage_horizon() -> int:
    """Largest whole-hour horizon at which every default-window hour still has a forecast.

    Horizon mode needs a run with lead >= H, so a target is covered up to its longest available lead.
    """
    p = filter_delivery(pairs(), config.DEFAULT_DELIVERY_START, config.DEFAULT_DELIVERY_END)
    expected = _hourly_periods(config.DEFAULT_DELIVERY_START, config.DEFAULT_DELIVERY_END)
    longest = p.groupby("startTime")["lead_hours"].max()
    if len(longest) < expected:
        return 0
    return min(int(longest.min()), MAX_HORIZON)


def _check_window(start: date, end: date) -> None:
    lo, hi = data_range()
    if start > end:
        raise HTTPException(422, "start must be on or before end")
    if start < lo or end > hi:
        raise HTTPException(422, f"window must be within {lo} .. {hi}")


def _iso(t: pd.Timestamp | None) -> str | None:
    return None if t is None or pd.isna(t) else t.isoformat().replace("+00:00", "Z")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    forecasts, actuals = load()
    lo, hi = data_range()
    runs = forecasts["publishTime"].drop_duplicates()
    schedule = Counter(runs.dt.strftime("%H:%M"))
    return {
        "data_min_date": lo.isoformat(),
        "data_max_date": hi.isoformat(),
        "default_start": config.DEFAULT_DELIVERY_START.isoformat(),
        "default_end": config.DEFAULT_DELIVERY_END.isoformat(),
        "default_cutoff_time": config.DEFAULT_CUTOFF_TIME,
        "default_days_before": config.DEFAULT_DAYS_BEFORE,
        "default_buffer_q": config.DEFAULT_BUFFER_Q,
        "timezone": config.LOCAL_TZ,
        "forecast_runs": int(runs.size),
        "forecast_publish_from": _iso(runs.min()),
        "forecast_publish_to": _iso(runs.max()),
        "run_schedule_utc": [
            {"time": t, "count": c} for t, c in sorted(schedule.items()) if c > 1
        ],
        "actual_periods": int(len(actuals)),
        "max_horizon": MAX_HORIZON,
        "full_coverage_horizon": full_coverage_horizon(),
    }


@app.get("/api/analysis")
def analysis(
    sel: Selection = Depends(selection_params),
    start: date = config.DEFAULT_DELIVERY_START,
    end: date = config.DEFAULT_DELIVERY_END,
    buffer_q: float = Query(config.DEFAULT_BUFFER_Q, ge=0.01, le=0.5),
    bin_width: int = Query(500, ge=50, le=5000),
) -> dict:
    _check_window(start, end)
    df = filter_delivery(joined(sel), start, end)
    horizon_pairs = filter_delivery(pairs(), start, end)
    horizon_pairs = horizon_pairs[horizon_pairs["lead_hours"] <= MAX_HORIZON]
    lead = df["lead_hours"]
    return {
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "expected_periods": _hourly_periods(start, end),
        "summary": metrics.summary(df["error"]),
        "buffer": metrics.buffer(df["error"], buffer_q),
        "histogram": metrics.histogram(df["error"], bin_width),
        "by_hour": metrics.by_hour(df, buffer_q),
        "by_horizon": metrics.by_horizon(horizon_pairs, bucket_hours=6),
        "lead_hours": {
            "min": None if lead.empty else float(lead.min()),
            "mean": None if lead.empty else round(float(lead.mean()), 1),
            "max": None if lead.empty else float(lead.max()),
        },
        "runs_used": [
            {"time_utc": t, "count": int(c)}
            for t, c in df["publishTime"].dt.strftime("%H:%M").value_counts().sort_index().items()
        ],
    }


@app.get("/api/timeseries")
def timeseries(
    day: date = Query(config.DEFAULT_DELIVERY_START, alias="date"),
    sel: Selection = Depends(selection_params),
) -> dict:
    _check_window(day, day)
    _, actuals = load()
    acts = filter_delivery(actuals, day, day)
    fc = filter_delivery(joined(sel), day, day).set_index("startTime")
    points = []
    for t, actual in zip(acts["startTime"], acts["generation"]):
        row = fc.loc[t] if t in fc.index else None
        points.append(
            {
                "time": _iso(t),
                "label": t.tz_convert(config.LOCAL_TZ).strftime("%H:%M"),
                "actual": float(actual),
                "forecast": None if row is None else float(row["forecast"]),
                "error": None if row is None else float(row["error"]),
                "publishTime": None if row is None else _iso(row["publishTime"]),
                "lead_hours": None if row is None else float(row["lead_hours"]),
            }
        )
    day_df = fc.reset_index()
    return {
        "date": day.isoformat(),
        "points": points,
        "summary": metrics.summary(day_df["error"]) if not day_df.empty else metrics.summary(pd.Series([], dtype=float)),
    }


if config.STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="static")
