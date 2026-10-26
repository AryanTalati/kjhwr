from datetime import date, time

import pandas as pd

from app.selection import (
    all_pairs,
    decision_cutoff,
    filter_delivery,
    join_actuals,
    select_by_cutoff,
    select_by_horizon,
)
from tests.conftest import make_actuals, make_forecasts, ts

TARGET = "2026-01-15T12:00:00Z"  # January: London == UTC

# Runs on D-1 (14 Jan) and D-2, each forecasting the same target hour.
RUNS = make_forecasts(
    [
        ("2026-01-13T09:30:00Z", TARGET, 1000),  # D-2, before 11:00
        ("2026-01-14T09:30:00Z", TARGET, 2000),  # latest before 11:00 on D-1
        ("2026-01-14T11:00:00Z", TARGET, 3000),  # exactly at cutoff -> excluded
        ("2026-01-14T11:30:00Z", TARGET, 4000),  # after cutoff
        ("2026-01-15T07:30:00Z", TARGET, 5000),  # same day
    ]
)


def picked(df: pd.DataFrame) -> float:
    assert len(df) == 1
    return df["forecast"].iloc[0]


def test_cutoff_picks_latest_strictly_before_d_minus_1_11am():
    sel = select_by_cutoff(RUNS)
    assert picked(sel) == 2000
    assert sel["publishTime"].iloc[0] == ts("2026-01-14T09:30:00Z")
    assert sel["lead_hours"].iloc[0] == 26.5


def test_later_cutoff_picks_later_run():
    assert picked(select_by_cutoff(RUNS, cutoff_time=time(12, 0))) == 4000


def test_days_before_two():
    assert picked(select_by_cutoff(RUNS, days_before=2)) == 1000


def test_no_run_before_cutoff_gives_no_row():
    sel = select_by_cutoff(RUNS, cutoff_time=time(0, 0), days_before=3)
    assert sel.empty


def test_hindcast_rows_are_never_selected():
    # A run published after the target (hindcast row) must not be used even when before cutoff.
    fc = make_forecasts([("2026-01-14T09:30:00Z", "2026-01-14T06:00:00Z", 999)])
    assert select_by_cutoff(fc, days_before=0).empty
    assert select_by_horizon(fc, 0).empty


def test_cutoff_respects_bst_after_clock_change():
    # Clocks go forward 29 Mar 2026. For a 30 Mar target, D-1 11:00 London = 10:00 UTC.
    target = "2026-03-30T12:00:00Z"
    fc = make_forecasts(
        [
            ("2026-03-29T09:30:00Z", target, 1),  # 10:30 BST -> before cutoff
            ("2026-03-29T10:15:00Z", target, 2),  # 11:15 BST -> after cutoff
        ]
    )
    assert picked(select_by_cutoff(fc)) == 1
    cutoff = decision_cutoff(fc["startTime"], time(11, 0), 1)
    assert cutoff.iloc[0] == ts("2026-03-29T10:00:00Z")


def test_delivery_date_is_local_date():
    # 23:30 UTC on 30 Mar is 00:30 BST on 31 Mar -> delivery day 31 Mar, cutoff 30 Mar 10:00 UTC.
    cutoff = decision_cutoff(pd.Series([ts("2026-03-30T23:30:00Z")]), time(11, 0), 1)
    assert cutoff.iloc[0] == ts("2026-03-30T10:00:00Z")


def test_horizon_picks_latest_at_least_n_hours_before():
    # Lead times: 50.5, 26.5, 25, 24.5, 4.5
    assert picked(select_by_horizon(RUNS, 24.5)) == 4000
    assert picked(select_by_horizon(RUNS, 25)) == 3000
    assert picked(select_by_horizon(RUNS, 30)) == 1000
    assert select_by_horizon(RUNS, 51).empty


def test_selection_is_per_target():
    fc = make_forecasts(
        [
            ("2026-01-14T09:30:00Z", "2026-01-15T00:00:00Z", 10),
            ("2026-01-14T09:30:00Z", "2026-01-15T01:00:00Z", 11),
            ("2026-01-14T11:30:00Z", "2026-01-15T00:00:00Z", 20),
            ("2026-01-14T11:30:00Z", "2026-01-15T01:00:00Z", 21),
        ]
    )
    sel = select_by_cutoff(fc)
    assert sel["forecast"].tolist() == [10, 11]
    sel = select_by_horizon(fc, 1)
    assert sel["forecast"].tolist() == [20, 21]


def test_join_drops_half_past_actuals_and_signs_error():
    sel = select_by_cutoff(RUNS)
    actuals = make_actuals([(TARGET, 1500), ("2026-01-15T12:30:00Z", 1800)])
    joined = join_actuals(sel, actuals)
    assert len(joined) == 1
    assert joined["actual"].iloc[0] == 1500
    assert joined["error"].iloc[0] == 1500 - 2000  # actual - forecast: short by 500 MW


def test_all_pairs_keeps_every_run_with_lead():
    actuals = make_actuals([(TARGET, 1500)])
    pairs = all_pairs(RUNS, actuals)
    assert len(pairs) == 5
    assert sorted(pairs["lead_hours"].tolist()) == [4.5, 24.5, 25.0, 26.5, 50.5]


def test_filter_delivery_uses_london_dates():
    df = pd.DataFrame(
        {"startTime": [ts("2026-03-30T22:00:00Z"), ts("2026-03-30T23:00:00Z")], "x": [1, 2]}
    )
    out = filter_delivery(df, date(2026, 3, 30), date(2026, 3, 30))
    assert out["x"].tolist() == [1]  # 23:00 UTC is 00:00 BST on 31 Mar
