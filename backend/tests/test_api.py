"""Smoke tests for the API against the committed parquet cache (no network)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_meta():
    r = client.get("/api/meta")
    assert r.status_code == 200
    body = r.json()
    assert body["default_start"] == "2026-01-02"
    assert 0 < body["full_coverage_horizon"] <= body["max_horizon"]


def test_analysis_defaults_cover_every_hour():
    body = client.get("/api/analysis").json()
    assert body["summary"]["n"] == body["expected_periods"]
    assert len(body["by_hour"]) == 24
    assert body["buffer"]["mw"] >= 0


def test_horizon_mode_and_validation():
    assert client.get("/api/analysis", params={"mode": "horizon", "horizon_hours": 12}).status_code == 200
    assert client.get("/api/analysis", params={"cutoff_time": "25:00"}).status_code == 422
    assert client.get("/api/analysis", params={"start": "2026-01-10", "end": "2026-01-05"}).status_code == 422
    assert client.get("/api/analysis", params={"start": "2025-06-01"}).status_code == 422


def test_timeseries_has_half_hours_but_forecasts_only_on_the_hour():
    pts = client.get("/api/timeseries", params={"date": "2026-01-15"}).json()["points"]
    assert len(pts) == 48
    assert all(p["forecast"] is not None for p in pts if p["label"].endswith(":00"))
    assert all(p["forecast"] is None for p in pts if p["label"].endswith(":30"))
