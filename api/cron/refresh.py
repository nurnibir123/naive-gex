import os

from fastapi import FastAPI, Header, HTTPException

from backend.app.gex import get_spx_gamma_dashboard_payload

app = FastAPI()


@app.get("/")
def refresh(authorization: str | None = Header(default=None)) -> dict[str, object]:
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
