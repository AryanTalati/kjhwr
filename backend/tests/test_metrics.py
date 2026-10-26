import math

import pandas as pd
import pytest

from app.metrics import buffer, by_horizon, by_hour, histogram, summary
from tests.conftest import ts

ERRORS = pd.Series([-300.0, -100.0, 0.0, 100.0, 300.0, 600.0])


def test_summary_against_hand_computed_values():
    s = summary(ERRORS)
    assert s["n"] == 6
    assert s["mae"] == pytest.approx(1400 / 6, abs=0.05)
    assert s["rmse"] == pytest.approx(math.sqrt(560000 / 6), abs=0.05)
    assert s["bias"] == pytest.approx(100.0)
    # Linear interpolation quantiles: position q*(n-1)
    assert s["p10"] == pytest.approx(-200.0)  # 0.5 between -300 and -100
    assert s["p50"] == pytest.approx(50.0)
    assert s["p90"] == pytest.approx(450.0)


def test_summary_empty():
    s = summary(pd.Series([], dtype=float))
    assert s["n"] == 0 and s["mae"] is None


def test_buffer_is_size_of_low_quantile_shortfall():
    b = buffer(ERRORS, 0.10)
    assert b["mw"] == 200
    assert "200 MW below forecast in 10% of hours" in b["sentence"]


def test_buffer_clamps_at_zero_when_forecast_never_too_high():
    b = buffer(pd.Series([0.0, 50.0, 200.0]), 0.10)
    assert b["mw"] == 0
    assert "no buffer needed" in b["sentence"]


def test_histogram_counts_and_edges():
    bins = histogram(ERRORS, bin_width=250)
    assert bins[0]["lo"] == -500 and bins[-1]["hi"] == 750
    assert sum(b["count"] for b in bins) == len(ERRORS)
    assert {(b["lo"], b["count"]) for b in bins} >= {(-500.0, 1), (0.0, 2), (500.0, 1)}


def test_by_hour_groups_by_london_hour():
    df = pd.DataFrame(
        {
            # 11:00 UTC in Jan = hour 11; 11:00 UTC in July = 12:00 BST
            "startTime": [ts("2026-01-10T11:00Z"), ts("2026-01-11T11:00Z"), ts("2026-07-10T11:00Z")],
            "error": [-100.0, 300.0, 50.0],
        }
    )
    rows = {r["hour"]: r for r in by_hour(df)}
    assert set(rows) == {11, 12}
    assert rows[11]["n"] == 2 and rows[11]["mae"] == 200 and rows[11]["bias"] == 100
    assert rows[12]["n"] == 1


def test_by_horizon_buckets():
    pairs = pd.DataFrame({"lead_hours": [1.0, 5.5, 6.0, 13.0], "error": [-100.0, 100.0, -50.0, 10.0]})
    rows = by_horizon(pairs, bucket_hours=6)
    assert [(r["lead_from"], r["n"]) for r in rows] == [(0, 2), (6, 1), (12, 1)]
    assert rows[0]["mae"] == 100 and rows[0]["bias"] == 0
