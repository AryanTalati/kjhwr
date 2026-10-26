"""Static configuration: data source, cached windows and analysis defaults."""

from datetime import date
from pathlib import Path

ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1"
LOCAL_TZ = "Europe/London"

# Scope: day-ahead purchase decisions made 1-31 Jan 2026, i.e. delivery days 2 Jan - 1 Feb.
DEFAULT_DELIVERY_START = date(2026, 1, 2)
DEFAULT_DELIVERY_END = date(2026, 2, 1)

# Fetch windows are wider than the delivery window so that every horizon (up to the
# ~66 h a WINDFOR run reaches) and every cutoff choice has forecasts available.
WINDFOR_PUBLISH_FROM = "2025-12-27T00:00:00Z"
WINDFOR_PUBLISH_TO = "2026-02-02T00:00:00Z"
FUELHH_SETTLEMENT_FROM = "2025-12-31"
FUELHH_SETTLEMENT_TO = "2026-02-02"

DEFAULT_CUTOFF_TIME = "11:00"
DEFAULT_DAYS_BEFORE = 1
DEFAULT_BUFFER_Q = 0.10

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
# Gzipped JSON lines: tiny, and readable by pandas without pyarrow (keeps the image slim).
FORECASTS_PATH = DATA_DIR / "windfor.jsonl.gz"
ACTUALS_PATH = DATA_DIR / "fuelhh_wind.jsonl.gz"
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
