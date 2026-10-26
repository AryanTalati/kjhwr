"""Error statistics on joined frames (columns startTime, forecast, actual, error[, lead_hours]).

Sign convention: error = actual - forecast, so negative error means wind came in below forecast
and the team was short.
"""

import math

import numpy as np
import pandas as pd

from .config import LOCAL_TZ


def _r(x: float | None, nd: int = 1) -> float | None:
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(float(x), nd)


def summary(errors: pd.Series) -> dict:
    e = errors.dropna().astype(float)
    if e.empty:
        return {k: None for k in ("mae", "rmse", "bias", "p10", "p50", "p90")} | {"n": 0}
    return {
        "n": int(e.size),
        "mae": _r(e.abs().mean()),
        "rmse": _r(math.sqrt((e**2).mean())),
        "bias": _r(e.mean()),
        "p10": _r(e.quantile(0.10)),
        "p50": _r(e.quantile(0.50)),
        "p90": _r(e.quantile(0.90)),
    }


def buffer(errors: pd.Series, q: float = 0.10) -> dict:
    """Extra MW to buy so that wind shortfall is covered in (1 - q) of periods.

    The buffer is the size of the q-quantile shortfall: max(0, -quantile(error, q)).
    """
    e = errors.dropna().astype(float)
    if e.empty:
        return {"mw": None, "q": q, "sentence": "No matched periods in the selected window."}
    mw = max(0.0, -float(e.quantile(q)))
    pct = round(q * 100)
    if mw == 0:
        sentence = f"Actual wind was at or above forecast in at least {100 - pct}% of hours; no buffer needed."
    else:
        sentence = f"Actual wind fell more than {mw:,.0f} MW below forecast in {pct}% of hours."
    return {"mw": _r(mw, 0), "q": q, "sentence": sentence}


def histogram(errors: pd.Series, bin_width: float = 500) -> list[dict]:
    e = errors.dropna().astype(float).to_numpy()
    if e.size == 0:
        return []
    lo = math.floor(e.min() / bin_width) * bin_width
    hi = math.ceil(e.max() / bin_width) * bin_width
    if hi == lo:
        hi = lo + bin_width
    edges = np.arange(lo, hi + bin_width, bin_width)
    counts, _ = np.histogram(e, bins=edges)
    return [
        {"lo": float(a), "hi": float(b), "count": int(c)}
        for a, b, c in zip(edges[:-1], edges[1:], counts)
    ]


def by_hour(df: pd.DataFrame, q: float = 0.10, tz: str = LOCAL_TZ) -> list[dict]:
    """Error statistics per local hour of day (0-23), including the per-hour buffer."""
    if df.empty:
        return []
    hours = df["startTime"].dt.tz_convert(tz).dt.hour
    out = []
    for hour, e in df["error"].groupby(hours):
        out.append(
            {
                "hour": int(hour),
                "n": int(e.size),
                "mae": _r(e.abs().mean()),
                "bias": _r(e.mean()),
                "p10": _r(e.quantile(0.10)),
                "p90": _r(e.quantile(0.90)),
                "buffer": _r(max(0.0, -float(e.quantile(q))), 0),
            }
        )
    return out


def by_horizon(pairs: pd.DataFrame, bucket_hours: int = 6) -> list[dict]:
    """MAE and bias grouped into lead-time buckets [k*bucket, (k+1)*bucket) hours."""
    if pairs.empty:
        return []
    bucket = (pairs["lead_hours"] // bucket_hours * bucket_hours).astype(int)
    out = []
    for start, e in pairs["error"].groupby(bucket):
        out.append(
            {
                "lead_from": int(start),
                "lead_to": int(start + bucket_hours),
                "n": int(e.size),
                "mae": _r(e.abs().mean()),
                "rmse": _r(math.sqrt((e**2).mean())),
                "bias": _r(e.mean()),
            }
        )
    return out
