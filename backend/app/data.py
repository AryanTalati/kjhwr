"""Load the cached datasets (fetching them on first use if the cache is missing)."""

from functools import lru_cache

import pandas as pd

from . import config
from .fetch import fetch_all, read_cache


@lru_cache(maxsize=1)
def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (forecasts, actuals) from the local cache."""
    if not (config.FORECASTS_PATH.exists() and config.ACTUALS_PATH.exists()):
        fetch_all()
    return read_cache(config.FORECASTS_PATH), read_cache(config.ACTUALS_PATH)
