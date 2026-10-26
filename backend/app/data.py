"""Load the cached datasets (fetching them on first use if the cache is missing)."""

from functools import lru_cache

import pandas as pd

from . import config
from .fetch import fetch_all


@lru_cache(maxsize=1)
def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (forecasts, actuals) from the parquet cache."""
    if not (config.FORECASTS_PATH.exists() and config.ACTUALS_PATH.exists()):
        fetch_all()
    return pd.read_parquet(config.FORECASTS_PATH), pd.read_parquet(config.ACTUALS_PATH)
