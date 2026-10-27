# Day-ahead wind forecast accuracy

A web app for a day-ahead power trading desk. It asks: **when we buy on D-1 using the published GB wind forecast, how wrong is that forecast, and how much extra power should we buy to cover wind shortfalls?**

It compares Elexon's wind generation forecast (WINDFOR) with metered wind outturn (FUELHH), selecting the forecast the desk would actually have had at its decision cutoff. It reports MAE, RMSE, bias, error percentiles, error by hour of day and by lead time, and a recommended shortfall buffer.

**Live app:** https://kjhwr-self.vercel.app

One Docker image (FastAPI serving the API and the built React app) runs locally and on [Vercel's Container Runtime](https://vercel.com/docs/functions/runtimes/container).

## What the January 2026 data shows

Defaults: decisions made 1–31 Jan 2026, so delivery 2 Jan – 1 Feb. The forecast used is the latest run published before 11:00 London time on D-1.

| Metric | Value |
|---|---|
| Hours scored | 744 |
| MAE | 1,996 MW |
| RMSE | 2,499 MW |
| Bias (actual − forecast) | −1,728 MW |
| P10 / P50 / P90 error | −4,184 / −1,507 / +503 MW |
| **Recommended buffer (P10)** | **4,184 MW**: actual wind fell more than this below forecast in 10% of hours |

- **The forecast ran high all month.** Outturn averaged about 1.7 GW below forecast, at every hour of the day and every lead time. A plausible cause, which we have not verified, is that FUELHH is metered output after curtailment while WINDFOR forecasts available wind output. The app reports the numbers as they are and does not correct for this.
- **The 11:00 cutoff just misses a run.** Forecast runs are published at 09:30 and 11:30 UTC, so an 11:00 cutoff always uses the 09:30 run. Moving the cutoff to 12:00 picks up the 11:30 run and cuts the P10 buffer from 4,184 MW to 3,768 MW.

## How it works

### Data (Elexon Insights API, `https://data.elexon.co.uk/bmrs/api/v1`)

| Dataset | Endpoint & query | Shape |
|---|---|---|
| Actuals | `/datasets/FUELHH/stream?settlementDateFrom=&settlementDateTo=&fuelType=WIND` | one row per **half-hour**: `startTime`, `generation` (average MW over the 30 min), settlement date and period |
| Forecasts | `/datasets/WINDFOR/stream?publishDateTimeFrom=&publishDateTimeTo=` | one row per run × **hour**: `publishTime`, `startTime`, `generation` (MW) |

What we found when inspecting the API:
- WINDFOR can only be filtered by publish time.
- Runs come 8 times a day: 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30 and 22:30 UTC.
- Each run has 73 hourly points. These include some hours *before* `publishTime`, which we drop, and reach about 66 h ahead.

`python -m app.fetch` downloads everything needed once and stores it as gzipped JSON lines in `backend/data/` (about 125 KB, committed):
- forecast runs published 27 Dec 2025 – 1 Feb 2026, so every horizon is covered for the first delivery day;
- actuals for 31 Dec 2025 – 2 Feb 2026.

The app only reads this cache and never calls Elexon at runtime. We chose JSON over parquet so the image doesn't need pyarrow, which would add about 150 MB.

### Forecast selection (`backend/app/selection.py`)
- **Decision cutoff (default):** for each target hour, use the latest run with `publishTime` strictly before *(the target's London delivery date − N days) at HH:MM London*. N defaults to 1 and HH:MM to 11:00. The cutoff is built in local time and then converted to UTC, so clock changes are handled correctly.
- **Fixed horizon:** use the latest run published at least *N hours* before the target. Runs reach about 66 h ahead, so every hour has a forecast up to a 43 h horizon. Beyond that the UI warns how many hours are missing.
- **Matching:** forecasts are hourly and actuals are half-hourly. Each forecast is matched to the actual half-hour with the same `startTime`, with no interpolation or averaging. Only the `:00` periods are scored; the `:30` actuals are plotted for context.
- `error = actual − forecast`. A negative error means wind came in short and the desk needed more power.

### Metrics (`backend/app/metrics.py`)
- MAE, RMSE, bias and P10/P50/P90 of the error, plus a 500 MW histogram.
- **By hour of day** (London time): MAE, bias, P10, P90 and the buffer for each hour.
- **By lead time:** every (run, target) pair is scored and grouped into 6-hour buckets, so the chart shows how accuracy falls off with lead time independently of the selection rule.
- **Buffer at quantile q** (default 0.10) = `max(0, −quantile(error, q))`. Buying this much extra covers the shortfall in (1 − q) of hours. The UI offers 80%, 90% and 95%.

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── config.py        # API base, fetch windows, defaults, paths
│   │   ├── fetch.py         # Elexon client + local cache (python -m app.fetch [--force])
│   │   ├── data.py          # loads the cache (fetches if missing)
│   │   ├── selection.py     # cutoff / horizon forecast selection, join with actuals
│   │   ├── metrics.py       # error statistics and buffer
│   │   └── main.py          # FastAPI routes + serves the built frontend
│   ├── data/                # cached data (windfor.jsonl.gz, fuelhh_wind.jsonl.gz)
│   ├── tests/               # pytest: selection + metrics on synthetic data, API smoke tests
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/                # React + TypeScript + Vite + Recharts
│   └── src/
│       ├── App.tsx          # layout, state, data fetching
│       ├── api.ts           # typed API client
│       └── components/      # Controls, KpiCards, TimeSeriesChart, ErrorHistogram, ErrorByHour, ErrorByHorizon
├── Dockerfile               # multi-stage: build SPA → slim Python 3.12 runtime serving API + SPA on $PORT
├── docker-compose.yml       # local dev (hot reload) + prod profile
├── vercel.json              # selects Vercel's Container preset, London region
└── .vercelignore            # keeps node_modules/.venv out of the Vercel upload
```

## Running it

### Docker (the same image Vercel runs)
Requires Docker Desktop or another Docker engine.
```bash
docker build -t wind-app .
docker run --rm -p 8000:8000 wind-app                 # default PORT=8000
# open http://localhost:8000  (API docs at /docs)

docker run --rm -e PORT=3000 -p 3000:3000 wind-app    # any port via $PORT
```
The container listens on `$PORT`, which defaults to 8000. It runs uvicorn as PID 1 under a non-root user, so it shuts down cleanly on SIGTERM.

### Docker Compose (development, hot reload)
```bash
docker compose up --build
# UI:  http://localhost:5173  (Vite, proxies /api to the backend)
# API: http://localhost:8000/docs
docker compose --profile prod up --build web   # production image on http://localhost:8080
```

### Without Docker
```bash
# backend (Python 3.12+)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # http://localhost:8000

# frontend (Node 22+), in another terminal
cd frontend
npm ci
npm run dev                              # http://localhost:5173
```

### Tests
```bash
cd backend && pytest                     # local
docker build --target test -t wind-test . && docker run --rm wind-test   # inside the Python 3.12 image
```
- `test_selection.py` covers:
  - the cutoff picks the latest run strictly before D-1 11:00, and a run exactly at the cutoff is excluded;
  - other cutoff times and D-2;
  - hindcast rows are never used;
  - the British Summer Time change;
  - local delivery dates;
  - horizon mode;
  - the join drops `:30` actuals and signs the error correctly.
- `test_metrics.py` checks the metrics against hand-computed values, including the buffer floor at zero.
- `test_api.py` smoke-tests the endpoints against the committed cache.

### Refreshing the data
```bash
cd backend && python -m app.fetch --force
```
Fetch windows are set in `backend/app/config.py`.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/meta` | Data ranges, defaults, run schedule, horizon coverage |
| `GET /api/analysis` | KPIs, buffer, histogram, by-hour, by-lead-time for a delivery window |
| `GET /api/timeseries?date=YYYY-MM-DD` | Half-hourly actuals and the selected hourly forecasts for one day |
| `GET /api/health` | Liveness |

Selection parameters accepted by `analysis` and `timeseries`:

| Parameter | Values |
|---|---|
| `mode` | `cutoff` \| `horizon` |
| `cutoff_time` | `HH:MM` London time |
| `days_before` | 0–2 |
| `horizon_hours` | 0–66 |

`analysis` also takes `start`, `end` and `buffer_q`. Interactive docs are at `/docs`.

## Deployment (Vercel Container Runtime)

Vercel builds the root `Dockerfile` and runs it as a Vercel Function. The Container Runtime is in beta and available on all plans, including the free Hobby plan.
- `vercel.json` sets `"framework": "container"`, so the Container preset is used even if another framework is detected later.
- It also pins the function to the London region (`lhr1`).

### Limits that apply (Hobby) and how this app fits

| Limit | Hobby | This app |
|---|---|---|
| Function size (uncompressed) | 250 MB | about 175 MB image (55 MB compressed) |
| Memory / CPU | 2 GB / 1 vCPU | about 75 MB resident |
| Max duration | 300 s | under 0.1 s per request |
| Request/response body | 4.5 MB | largest is the 620 KB JS bundle (about 180 KB gzipped); API responses are under 10 KB |
| Idle scale-down | 5 min (production) | cold start is about 1 s (imports) plus 0.1 s to load the cached data |

How the image stays small:
- **Alpine Python 3.12 base** with prebuilt musllinux wheels, so nothing is compiled.
- **Only the runtime dependencies** go in a virtualenv without pip.
- **Test suites stripped** from pandas and numpy.
- **No pyarrow.**

See Vercel's [Functions limits](https://vercel.com/docs/functions/limitations).

### Port
Vercel sends traffic to **port 80 unless a `PORT` environment variable is set on the project**. The image listens on 8000, so set `PORT=8000` once per environment. The `env` key in `vercel.json` is deprecated, so this lives in project settings instead.

### Deploy with the CLI
```bash
npm i -g vercel            # or prefix each command with npx
vercel login
vercel link                # from the repo root: create a new project (any name)

printf 8000 | vercel env add PORT production
printf 8000 | vercel env add PORT preview

vercel deploy              # preview deployment: check it works
vercel deploy --prod       # production
```

### Deploy from Git (alternative)
1. Push the repo to GitHub, GitLab or Bitbucket and import it at vercel.com/new.
2. The framework preset should show **Container**.
3. Add the environment variable `PORT` = `8000`, then deploy. Every push to `main` deploys to production.

### Check it
```bash
curl https://<your-app>.vercel.app/api/health     # {"status":"ok"}
```
Runtime logs (the container's stdout and stderr) are under the project's **Logs** tab, or `vercel logs <deployment-url>`.

## Use of AI tools

This project was AI-assisted, using **Claude Code** (Anthropic's AI coding assistant).

Design decisions were reviewed and confirmed by Aryan Talati: the scope of the delivery window, matching forecasts to actuals only on the hour, and the deployment approach. Commits co-authored by the assistant are marked as such.
