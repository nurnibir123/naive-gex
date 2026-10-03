from __future__ import annotations

import os

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .date_utils import is_market_closed_now, iso_from_key
from .gex import GexDataError, get_spx_gamma_dashboard_payload, list_available_gamma_dates
from .models import (
    DataDatesResponse,
    HealthResponse,
    SpxGammaResponse,
)

app = FastAPI(title="Naive GEX Terminal API", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True)


@app.get("/api/cron/refresh")
def refresh_cron(authorization: str | None = Header(default=None)) -> dict[str, object]:
    secret = os.getenv("CRON_SECRET")
    if secret and authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    payload = get_spx_gamma_dashboard_payload(force_refresh=True, ticker="SPX")
    return {
        "ok": True,
        "ticker": payload["ticker"],
        "date_key": payload["date_key"],
        "option_count": payload["option_count"],
    }


@app.get("/api/gex/spx", response_model=SpxGammaResponse)
def get_spx_gamma(
    date: str | None = Query(default=None),
    ticker: str = Query(default="SPX"),
) -> dict:
    try:
        return get_spx_gamma_dashboard_payload(force_refresh=False, date_input=date, ticker=ticker)
    except GexDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/gex/spx/refresh", response_model=SpxGammaResponse)
def refresh_spx_gamma(
    date: str | None = Query(default=None),
    ticker: str = Query(default="SPX"),
    force: bool = Query(default=False),
) -> dict:
    if not force and not is_market_closed_now():
        return get_spx_gamma_dashboard_payload(force_refresh=False, date_input=date, ticker=ticker)

    try:
        return get_spx_gamma_dashboard_payload(force_refresh=True, date_input=date, ticker=ticker)
    except GexDataError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/data/dates", response_model=DataDatesResponse)
def get_data_dates(ticker: str = Query(default="SPX")) -> dict:
    gamma_dates = set(list_available_gamma_dates(ticker=ticker))
    all_dates = sorted(gamma_dates)

    entries = []
    for date_key in reversed(all_dates):
        iso = iso_from_key(date_key)
        if not iso:
            continue

        entries.append(
            {
                "key": date_key,
                "iso": iso,
                "has_gamma": date_key in gamma_dates,
            }
        )

    latest = entries[0]["iso"] if entries else None
    return {
        "latest": latest,
        "dates": entries,
    }
