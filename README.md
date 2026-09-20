# Naive GEX Terminal

Naive GEX Terminal is a local full-stack SPX options positioning dashboard built with FastAPI and React.

## Product Scope

The platform focuses on the **SPX Delta/Gamma** trader-oriented market maker exposure dashboard.
  - defaults to SPX
  - supports other tickers through CBOE options endpoint-compatible symbols (for example `NVDA`)

## Project Structure

```text
scanner-app/
  backend/
    app/
      main.py
      scanner.py
      gex.py
      models.py
    data/
    requirements.txt
  frontend/
    src/
      App.jsx
      main.jsx
      pages/
        SpxGexPage.jsx
      components/
        Sidebar.jsx
        TopBar.jsx
        SummaryCards.jsx
        AnalysisPanel.jsx
        GammaSummaryStrip.jsx
        TraderLevelsPanel.jsx
        TradeSetupsPanel.jsx
        GexByStrikeChart.jsx
        GexByExpirationChart.jsx
      lib/
        format.js
        api.js
    package.json
  README.md
```

## Backend Behavior

### SPX Delta/Gamma

Uses CBOE delayed SPX options chain and computes signed gamma exposure.

Core functions in `backend/app/gex.py`:
- `fetch_spx_gex_data()`
- `compute_total_gex()`
- `compute_gex_by_strike()`
- `compute_gex_by_expiration()`
- `get_key_gamma_levels()`
- `classify_gamma_regime()`
- `generate_trade_levels()`
- `generate_trade_setups()`
- `get_spx_gamma_dashboard_payload()`

Returned payload includes:
- `spot_price`
- `total_gex`
- `total_delta`
- `gex_by_strike`
- `delta_by_strike`
- `gamma_heatmap` (next 5 trading days, strike x day color-grid values)
- `gex_by_expiration`
- `key_levels`
- `gamma_regime`
- `trade_levels`
- `trade_setups`
- `trader_notes`
- `expiration_focus`
- `last_updated`
- `date_key`

Data files are versioned daily:
- `backend/data/spx_options_raw_MM-DD-YYYY.json`
- `backend/data/spx_gamma_dashboard_MM-DD-YYYY.json`

## How SPX Gamma Trade Framing Works

Trade framing is deterministic and rules-based:
- **Call wall**: strongest positive GEX concentration above spot.
- **Put wall**: strongest negative GEX concentration below spot.
- **Gamma flip**: nearest local sign-change in strike-level GEX.
- **Support/resistance zones**: derived from nearby high-magnitude positive gamma levels.
- **Fast-move zone**: derived from nearest negative-gamma pocket.
- **Spread suggestions**: built from dominant wall + next concentration level.
- **Setups**: generated from regime + key level location (not random text generation).
- **Delta integration**: each idea keeps the same structure but includes delta-aware interpretation.

## Daily Data + Historical View

- SPX delta/gamma files are stored per day using `MM-DD-YYYY`.
- The UI date selector loads that specific day across the SPX Delta/Gamma views.
- Historical mode is built-in: choose a prior date from the top bar.
- Refresh endpoints are market-close aware by default:
  - before close: they return cached/latest daily data
  - after close: they generate/overwrite that market day snapshot
  - `force=true` can be used for manual intraday refresh

## API Endpoints

- `GET /api/health`
- `GET /api/gex/spx`
- `POST /api/gex/spx/refresh`
- `GET /api/dashboard/summary`
- `GET /api/data/dates`

Ticker support:
- `GET /api/gex/spx?ticker=NVDA`
- `POST /api/gex/spx/refresh?ticker=NVDA`
- Frontend example: `http://localhost:5173/spx-gamma?ticker=NVDA`

## Local Setup

### 1) Backend install

```bash
cd /Users/nurnibir/Desktop/hedge-fund-ai/scanner-app/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2) Frontend install

```bash
cd /Users/nurnibir/Desktop/hedge-fund-ai/scanner-app/frontend
npm install
```

### 3) Run backend

```bash
cd /Users/nurnibir/Desktop/hedge-fund-ai/scanner-app/backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4) Run frontend

```bash
cd /Users/nurnibir/Desktop/hedge-fund-ai/scanner-app/frontend
npm run dev
```

Open:
- App: `http://localhost:5173/spx-gamma`
- API docs: `http://127.0.0.1:8000/docs`

## Docker Setup

### 1) Build and start (recommended)

```bash
cd /Users/nurnibir/Desktop/hedge-fund-ai/scanner-app
docker compose up --build
```

### 2) Run in background

```bash
cd /Users/nurnibir/Desktop/hedge-fund-ai/scanner-app
docker compose up --build -d
```

### 3) Stop containers

```bash
cd /Users/nurnibir/Desktop/hedge-fund-ai/scanner-app
docker compose down
```

Docker URLs:
- App: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

## Notes

- Caching is used for SPX option payloads and processed dashboard payloads in `backend/data`.
- If upstream provider data is missing/sparse, API returns graceful defaults rather than crashing.
- The SPX Gamma strike profile chart is a vertical exposure view for fast wall/pivot scanning.
