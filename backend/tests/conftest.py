import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


def make_forecasts(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    """rows: (publishTime, startTime, generation) as UTC ISO strings."""
    return pd.DataFrame(
        {
            "publishTime": [ts(p) for p, _, _ in rows],
            "startTime": [ts(s) for _, s, _ in rows],
            "generation": [float(g) for _, _, g in rows],
        }
    )


def make_actuals(rows: list[tuple[str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        {"startTime": [ts(s) for s, _ in rows], "generation": [float(g) for _, g in rows]}
    )


@pytest.fixture
def ts_():
    return ts
