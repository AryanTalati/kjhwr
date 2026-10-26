"""Pick which forecast the trading team would have had for each target hour, and join actuals.

Forecast frames have columns publishTime, startTime, generation (tz-aware UTC).
Actual frames have columns startTime, generation (tz-aware UTC, half-hourly).
"""

from datetime import date, time

import pandas as pd

from .config import LOCAL_TZ

SELECTED_COLUMNS = ["startTime", "forecast", "publishTime", "lead_hours"]


def _with_lead(forecasts: pd.DataFrame) -> pd.DataFrame:
    """Drop hindcast rows (target not after publish) and add lead time in hours."""
    df = forecasts[forecasts["startTime"] > forecasts["publishTime"]].copy()
    df["lead_hours"] = (df["startTime"] - df["publishTime"]).dt.total_seconds() / 3600
    return df


def _latest_per_target(candidates: pd.DataFrame) -> pd.DataFrame:
    if candidates.empty:
        return pd.DataFrame(columns=SELECTED_COLUMNS)
    idx = candidates.groupby("startTime")["publishTime"].idxmax()
    out = candidates.loc[idx].rename(columns={"generation": "forecast"})
    return out[SELECTED_COLUMNS].sort_values("startTime").reset_index(drop=True)


def decision_cutoff(
    start_times: pd.Series, cutoff_time: time, days_before: int, tz: str = LOCAL_TZ
) -> pd.Series:
    """UTC decision cutoff for each target: (local delivery date - days_before) at cutoff_time local.

    Built from the naive local wall-clock time and then localised, so DST changes are handled.
    An ambiguous wall-clock time (autumn fall-back) resolves to the earlier instant.
    """
    local_day = start_times.dt.tz_convert(tz).dt.tz_localize(None).dt.normalize()
    offset = pd.Timedelta(hours=cutoff_time.hour, minutes=cutoff_time.minute)
    naive_cutoff = local_day - pd.Timedelta(days=days_before) + offset
    return naive_cutoff.dt.tz_localize(
        tz, ambiguous=True, nonexistent="shift_forward"
    ).dt.tz_convert("UTC")


def select_by_cutoff(
    forecasts: pd.DataFrame,
    cutoff_time: time = time(11, 0),
    days_before: int = 1,
    tz: str = LOCAL_TZ,
) -> pd.DataFrame:
    """Latest forecast published strictly before the day-ahead decision cutoff."""
    df = _with_lead(forecasts)
    cutoff = decision_cutoff(df["startTime"], cutoff_time, days_before, tz)
    return _latest_per_target(df[df["publishTime"] < cutoff])


def select_by_horizon(forecasts: pd.DataFrame, horizon_hours: float) -> pd.DataFrame:
    """Latest forecast published at least ``horizon_hours`` before the target time."""
    df = _with_lead(forecasts)
    return _latest_per_target(df[df["lead_hours"] >= horizon_hours])


def join_actuals(selected: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Inner join on exact startTime and add error = actual - forecast.

    Forecasts are hourly, so only the :00 half-hours survive; :30 actuals are dropped.
    """
    actual = actuals[["startTime", "generation"]].rename(columns={"generation": "actual"})
    df = selected.merge(actual, on="startTime", how="inner")
    df["error"] = df["actual"] - df["forecast"]
    return df.sort_values("startTime").reset_index(drop=True)


def all_pairs(forecasts: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Every (run, target hour) forecast joined to its actual, for error-by-lead-time analysis."""
    return join_actuals(
        _with_lead(forecasts).rename(columns={"generation": "forecast"})[SELECTED_COLUMNS],
        actuals,
    )


def filter_delivery(
    df: pd.DataFrame, start: date, end: date, tz: str = LOCAL_TZ
) -> pd.DataFrame:
    """Keep rows whose local delivery date (from startTime) is within [start, end]."""
    if df.empty:
        return df
    local_date = df["startTime"].dt.tz_convert(tz).dt.date
    return df[(local_date >= start) & (local_date <= end)].reset_index(drop=True)
