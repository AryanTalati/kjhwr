"""Download WINDFOR forecasts and FUELHH wind actuals from Elexon and cache them locally.

Run once with ``python -m app.fetch``; the app then only reads the cache.
Pass ``--force`` to refetch.
"""

import argparse
import logging

import httpx
import pandas as pd

from . import config

log = logging.getLogger(__name__)


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    resp = client.get(f"{config.ELEXON_BASE}{path}", params=params)
    resp.raise_for_status()
    rows = resp.json()
    if not isinstance(rows, list):
        raise ValueError(f"Unexpected response shape from {path}: {type(rows).__name__}")
    return rows


def parse_forecasts(rows: list[dict]) -> pd.DataFrame:
    """WINDFOR rows -> publishTime, startTime (UTC), generation (MW), one row per run x hour."""
    df = pd.DataFrame(rows, columns=["publishTime", "startTime", "generation"])
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = df["generation"].astype("float64")
    df = df.drop_duplicates(["publishTime", "startTime"], keep="last")
    return df.sort_values(["publishTime", "startTime"]).reset_index(drop=True)


def parse_actuals(rows: list[dict]) -> pd.DataFrame:
    """FUELHH rows -> startTime (UTC), generation (MW 30-min average), wind only."""
    df = pd.DataFrame(rows, columns=["startTime", "fuelType", "generation"])
    df = df[df["fuelType"] == "WIND"].drop(columns="fuelType")
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["generation"] = df["generation"].astype("float64")
    df = df.drop_duplicates("startTime", keep="last")
    return df.sort_values("startTime").reset_index(drop=True)


def write_cache(df: pd.DataFrame, path) -> None:
    """Gzipped JSON lines with ISO-8601 UTC timestamps (written as plain strings for stable output)."""
    out = df.copy()
    for col in out.columns:
        if isinstance(out[col].dtype, pd.DatetimeTZDtype):
            out[col] = out[col].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    out.to_json(path, orient="records", lines=True, compression={"method": "gzip", "mtime": 0})


def read_cache(path) -> pd.DataFrame:
    df = pd.read_json(path, orient="records", lines=True, compression="gzip", convert_dates=False)
    for col in ("publishTime", "startTime"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], utc=True)
    df["generation"] = df["generation"].astype("float64")
    return df


def fetch_all(force: bool = False) -> None:
    if not force and config.FORECASTS_PATH.exists() and config.ACTUALS_PATH.exists():
        log.info("Cache present in %s; skipping fetch (use --force to refetch)", config.DATA_DIR)
        return

    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60) as client:
        forecasts = parse_forecasts(
            _get(
                client,
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": config.WINDFOR_PUBLISH_FROM,
                    "publishDateTimeTo": config.WINDFOR_PUBLISH_TO,
                },
            )
        )
        actuals = parse_actuals(
            _get(
                client,
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": config.FUELHH_SETTLEMENT_FROM,
                    "settlementDateTo": config.FUELHH_SETTLEMENT_TO,
                    "fuelType": "WIND",
                },
            )
        )

    write_cache(forecasts, config.FORECASTS_PATH)
    write_cache(actuals, config.ACTUALS_PATH)
    log.info(
        "Cached %d forecast rows (%d runs) and %d actual half-hours",
        len(forecasts),
        forecasts["publishTime"].nunique(),
        len(actuals),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="refetch even if the cache exists")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    fetch_all(force=args.force)


if __name__ == "__main__":
    main()
