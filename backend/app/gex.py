from __future__ import annotations

import json
import math
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests

from .date_utils import current_market_date, date_key_from_input, iso_from_key, to_date_key
from .storage import get_snapshot_store


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SNAPSHOT_STORE = get_snapshot_store()
RAW_PREFIX = "options_raw"
PROCESSED_PREFIX = "gamma_dashboard"
CONTRACT_SIZE = 100
OPTION_PATTERN = re.compile(r"(?P<expiry>\d{6})(?P<otype>[CP])(?P<strike>\d{8})")
TICKER_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


class GexDataError(RuntimeError):
    """Raised when ticker gamma data cannot be fetched or processed."""


def _normalize_ticker(ticker: str | None) -> str:
    value = (ticker or "SPX").strip().upper()
    if not value:
        value = "SPX"
    if not TICKER_PATTERN.match(value):
        raise GexDataError(f"Invalid ticker format: {ticker}")
    return value


def _to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _raw_path(date_key: str, ticker: str) -> Path:
    return DATA_DIR / f"{RAW_PREFIX}_{ticker}_{date_key}.json"


def _processed_path(date_key: str, ticker: str) -> Path:
    return DATA_DIR / f"{PROCESSED_PREFIX}_{ticker}_{date_key}.json"


def _resolve_date_key(date_input: str | None, prefer_latest: bool = True, ticker: str = "SPX") -> str:
    parsed = date_key_from_input(date_input)
    if parsed:
        return parsed

    if prefer_latest:
        latest = latest_gamma_date_key(ticker)
        if latest:
            return latest

    return to_date_key(current_market_date())


def list_available_gamma_dates(ticker: str = "SPX") -> list[str]:
    if not DATA_DIR.exists():
        return []

    normalized = _normalize_ticker(ticker)
    keys: list[str] = []
    for file in DATA_DIR.glob(f"{PROCESSED_PREFIX}_{normalized}_*.json"):
        suffix = file.stem.replace(f"{PROCESSED_PREFIX}_{normalized}_", "")
        if iso_from_key(suffix):
            keys.append(suffix)

    return sorted(set(keys))


def latest_gamma_date_key(ticker: str = "SPX") -> str | None:
    dates = list_available_gamma_dates(ticker)
    return dates[-1] if dates else None


def _cboe_option_urls(ticker: str) -> list[str]:
    return [
        f"https://cdn.cboe.com/api/global/delayed_quotes/options/{ticker}.json",
        f"https://cdn.cboe.com/api/global/delayed_quotes/options/_{ticker}.json",
    ]


def _extract_data_blob(payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(payload.get("data"), dict):
        return payload["data"]
    return payload


def _extract_spot_price(blob: dict[str, Any]) -> float:
    for candidate in [blob.get("current_price"), blob.get("last"), blob.get("close")]:
        parsed = _to_float(candidate)
        if parsed is not None and parsed > 0:
            return parsed

    raise GexDataError("Unable to determine spot price from CBOE payload.")


def _extract_options_rows(blob: dict[str, Any]) -> list[dict[str, Any]]:
    options = blob.get("options")
    if isinstance(options, list):
        return options
    if isinstance(options, dict) and isinstance(options.get("data"), list):
        return options["data"]
    raise GexDataError("CBOE payload does not contain option chain rows.")


def _parse_option_symbol(symbol: str) -> tuple[str, pd.Timestamp, float] | None:
    match = OPTION_PATTERN.search(str(symbol)) if symbol else None
    if not match:
        return None

    expiry = pd.to_datetime(match.group("expiry"), format="%y%m%d", errors="coerce")
    if pd.isna(expiry):
        return None

    option_type = match.group("otype")
    strike = int(match.group("strike")) / 1000
    return option_type, expiry, strike


def _prepare_options_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    if frame.empty:
        return pd.DataFrame(columns=["type", "expiration", "strike", "gamma", "delta", "open_interest", "vega", "implied_vol"])

    symbol_column = "option" if "option" in frame.columns else "symbol"
    if symbol_column not in frame.columns:
        raise GexDataError("Option symbol column missing from CBOE data.")

    parsed = frame[symbol_column].apply(_parse_option_symbol)
    frame["type"] = parsed.apply(lambda value: value[0] if value else None)
    frame["expiration"] = parsed.apply(lambda value: value[1] if value else pd.NaT)
    frame["strike"] = parsed.apply(lambda value: value[2] if value else None)

    oi_column = "open_interest" if "open_interest" in frame.columns else "openInterest"
    frame["open_interest"] = pd.to_numeric(frame.get(oi_column, 0), errors="coerce").fillna(0).astype(int)
    frame["gamma"] = pd.to_numeric(frame.get("gamma", 0), errors="coerce").fillna(0.0)
    frame["delta"] = pd.to_numeric(frame.get("delta", 0), errors="coerce").fillna(0.0)
    frame["vega"] = pd.to_numeric(frame.get("vega", 0), errors="coerce").fillna(0.0)
    frame["implied_vol"] = pd.to_numeric(frame.get("iv", frame.get("implied_volatility", 0)), errors="coerce").fillna(0.0)
    # Cboe commonly reports IV as a decimal, but tolerate percentage-form data.
    frame.loc[frame["implied_vol"] > 3, "implied_vol"] /= 100

    return frame.dropna(subset=["type", "expiration", "strike"]).copy()


def _normal_pdf(value: float) -> float:
    return math.exp(-0.5 * value * value) / math.sqrt(2 * math.pi)


def _normal_cdf(value: float) -> float:
    return 0.5 * (1 + math.erf(value / math.sqrt(2)))


def _black_scholes_greeks(spot: float, strike: float, years: float, vol: float, option_type: str) -> tuple[float, float]:
    """Return European delta and gamma; rates/dividend yield are neutral by design."""
    if spot <= 0 or strike <= 0 or years <= 0 or vol <= 0:
        return (1.0 if option_type == "C" and spot > strike else 0.0, 0.0)
    sigma_root_t = vol * math.sqrt(years)
    d1 = (math.log(spot / strike) + 0.5 * vol * vol * years) / sigma_root_t
    gamma = _normal_pdf(d1) / (spot * sigma_root_t)
    call_delta = _normal_cdf(d1)
    return (call_delta if option_type == "C" else call_delta - 1.0, gamma)


def _years_to_expiration(expiration: pd.Timestamp, valuation_date: pd.Timestamp) -> float:
    # Use a calendar clock with a one-day floor for expiry-day options.
    return max((expiration - valuation_date).total_seconds() / (365.25 * 24 * 3600), 1 / 365.25)


def _recalculate_surface_greeks(spot_price: float, frame: pd.DataFrame, valuation_date: pd.Timestamp) -> pd.DataFrame:
    """Prefer internally consistent BS Greeks when valid IV is available."""
    output = frame.copy()
    if output.empty or "implied_vol" not in output:
        return output
    for index, row in output.iterrows():
        if row["implied_vol"] <= 0:
            continue
        delta, gamma = _black_scholes_greeks(
            spot_price,
            float(row["strike"]),
            _years_to_expiration(pd.Timestamp(row["expiration"]), valuation_date),
            float(row["implied_vol"]),
            row["type"],
        )
        output.at[index, "delta"] = delta
        output.at[index, "gamma"] = gamma
    return output


def _compute_gex_columns(spot_price: float, frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        frame["gex"] = []
        frame["gex_bn"] = []
        frame["delta_exposure"] = []
        frame["delta_m"] = []
        return frame

    output = frame.copy()
    output["gex"] = (
        spot_price * output["gamma"] * output["open_interest"] * CONTRACT_SIZE * spot_price * 0.01
    )
    output.loc[output["type"] == "P", "gex"] = -output.loc[output["type"] == "P", "gex"]
    output["gex_bn"] = output["gex"] / 1_000_000_000

    # Dealer hedge exposure under the transparent baseline assumption that
    # customers own the reported options and dealers are the short side.
    output["delta_exposure"] = -output["delta"] * output["open_interest"] * CONTRACT_SIZE
    output["delta_m"] = output["delta_exposure"] / 1_000_000
    return output


def _save_json(path: Path, payload: Any) -> None:
    SNAPSHOT_STORE.save(path, payload)


def _load_json(path: Path) -> Any | None:
    return SNAPSHOT_STORE.load(path)


def _fetch_cboe_payload(ticker: str) -> dict[str, Any]:
    last_error: Exception | None = None
    for url in _cboe_option_urls(ticker):
        try:
            response = requests.get(url, timeout=20)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001
            last_error = exc

    raise GexDataError(f"Failed to fetch CBOE {ticker} options data: {last_error}")


def _strike_dataframe(gex_by_strike: list[dict[str, float]]) -> pd.DataFrame:
    if not gex_by_strike:
        return pd.DataFrame(columns=["strike", "gex_bn", "abs_gex"])

    strike_df = pd.DataFrame(gex_by_strike).sort_values("strike").reset_index(drop=True)
    strike_df["abs_gex"] = strike_df["gex_bn"].abs()
    return strike_df


def _strike_step(strike_df: pd.DataFrame) -> float:
    if len(strike_df) < 2:
        return 10.0
    diffs = strike_df["strike"].diff().dropna()
    if diffs.empty:
        return 10.0
    return float(max(1.0, diffs.median()))


def _round_strike(strike: float | None) -> float | None:
    if strike is None:
        return None
    return float(round(float(strike) / 5.0) * 5.0)


def _select_trade_expiration(gex_by_expiration: list[dict[str, Any]]) -> str:
    if not gex_by_expiration:
        return "nearest-expiration"
    first = gex_by_expiration[0].get("expiration")
    return str(first) if first else "nearest-expiration"


def fetch_spx_gex_data(
    force_refresh: bool = False,
    date_input: str | None = None,
    ticker: str = "SPX",
) -> dict[str, Any]:
    symbol = _normalize_ticker(ticker)
    date_key = _resolve_date_key(date_input, prefer_latest=not force_refresh, ticker=symbol)
    raw_path = _raw_path(date_key, symbol)

    if not force_refresh:
        cached = _load_json(raw_path)
        if cached:
            return cached

    payload = _fetch_cboe_payload(symbol)
    _save_json(raw_path, payload)
    return payload


def compute_total_gex(options_frame: pd.DataFrame) -> float:
    return float(options_frame["gex_bn"].sum()) if not options_frame.empty else 0.0


def compute_total_delta(options_frame: pd.DataFrame) -> float:
    return float(options_frame["delta_m"].sum()) if not options_frame.empty else 0.0


def compute_gex_by_strike(options_frame: pd.DataFrame, spot_price: float) -> list[dict[str, float]]:
    if options_frame.empty:
        return []

    grouped = options_frame.groupby("strike", as_index=False)["gex_bn"].sum().sort_values("strike")
    window = grouped[(grouped["strike"] >= spot_price * 0.85) & (grouped["strike"] <= spot_price * 1.15)]
    return [{"strike": float(row["strike"]), "gex_bn": float(row["gex_bn"])} for _, row in window.iterrows()]


def compute_delta_by_strike(options_frame: pd.DataFrame, spot_price: float) -> list[dict[str, float]]:
    if options_frame.empty:
        return []

    grouped = options_frame.groupby("strike", as_index=False)["delta_m"].sum().sort_values("strike")
    window = grouped[(grouped["strike"] >= spot_price * 0.85) & (grouped["strike"] <= spot_price * 1.15)]
    return [{"strike": float(row["strike"]), "delta_m": float(row["delta_m"])} for _, row in window.iterrows()]


def compute_gamma_profile(options_frame: pd.DataFrame, spot_price: float) -> tuple[list[dict[str, float]], float | None]:
    """Revalue gamma across spot levels and interpolate the nearest zero crossing."""
    if options_frame.empty or spot_price <= 0:
        return [], None
    levels = [spot_price * (0.80 + index * 0.40 / 80) for index in range(81)]
    valuation_date = pd.Timestamp.utcnow().tz_localize(None)
    profile: list[dict[str, float]] = []
    for level in levels:
        total = 0.0
        for _, row in options_frame.iterrows():
            vol = float(row.get("implied_vol", 0) or 0)
            if vol > 0:
                _, gamma = _black_scholes_greeks(
                    level,
                    float(row["strike"]),
                    _years_to_expiration(pd.Timestamp(row["expiration"]), valuation_date),
                    vol,
                    row["type"],
                )
            else:
                gamma = float(row["gamma"] or 0)
            signed_gamma = gamma * float(row["open_interest"]) * CONTRACT_SIZE * level * level * 0.01
            total += signed_gamma if row["type"] == "C" else -signed_gamma
        profile.append({"spot": float(level), "gex_bn": total / 1_000_000_000})

    flip: float | None = None
    candidates: list[float] = []
    for left, right in zip(profile, profile[1:]):
        if left["gex_bn"] == 0:
            candidates.append(left["spot"])
        elif left["gex_bn"] * right["gex_bn"] < 0:
            fraction = -left["gex_bn"] / (right["gex_bn"] - left["gex_bn"])
            candidates.append(left["spot"] + fraction * (right["spot"] - left["spot"]))
    if candidates:
        flip = min(candidates, key=lambda level: abs(level - spot_price))
    return profile, flip


def compute_gex_by_expiration(options_frame: pd.DataFrame) -> list[dict[str, Any]]:
    if options_frame.empty:
        return []

    now_utc = pd.Timestamp.utcnow()
    if now_utc.tzinfo is not None:
        now_utc = now_utc.tz_localize(None)
    max_date = now_utc + pd.Timedelta(days=365)

    scoped = options_frame[options_frame["expiration"] <= max_date]
    grouped = scoped.groupby("expiration", as_index=False)["gex_bn"].sum().sort_values("expiration")
    return [
        {"expiration": row["expiration"].strftime("%Y-%m-%d"), "gex_bn": float(row["gex_bn"])}
        for _, row in grouped.iterrows()
    ]


def _next_business_days(start_day: date, count: int) -> list[date]:
    days: list[date] = []
    candidate = start_day
    while len(days) < count:
        if candidate.weekday() < 5:
            days.append(candidate)
        candidate += timedelta(days=1)
    return days


def _compute_exposure_heatmap(
    options_frame: pd.DataFrame,
    spot_price: float,
    date_key: str,
    value_column: str,
    days: int = 5,
) -> dict[str, Any]:
    if options_frame.empty:
        return {"dates": [], "rows": [], "max_abs_value": 0.0, "max_cell": None}

    if value_column not in options_frame.columns:
        return {"dates": [], "rows": [], "max_abs_value": 0.0, "max_cell": None}

    try:
        start_day = datetime.strptime(date_key, "%m-%d-%Y").date()
    except ValueError:
        start_day = current_market_date()

    trading_days = _next_business_days(start_day, days)
    date_labels = [day.strftime("%Y-%m-%d") for day in trading_days]

    strike_low = spot_price * 0.88
    strike_high = spot_price * 1.12
    scoped = options_frame[(options_frame["strike"] >= strike_low) & (options_frame["strike"] <= strike_high)].copy()
    if scoped.empty:
        scoped = options_frame.copy()

    strike_maps: dict[str, dict[float, float]] = {}
    strike_set: set[float] = set()

    for day, label in zip(trading_days, date_labels):
        active = scoped[scoped["expiration"] >= pd.Timestamp(day)]
        grouped = active.groupby("strike", as_index=False)[value_column].sum()
        mapping = {float(row["strike"]): float(row[value_column]) for _, row in grouped.iterrows()}
        strike_maps[label] = mapping
        strike_set.update(mapping.keys())

    strikes = sorted(strike_set, reverse=True)
    if len(strikes) > 55:
        strikes = sorted(strikes, key=lambda strike: abs(strike - spot_price))[:55]
        strikes = sorted(strikes, reverse=True)

    rows: list[dict[str, Any]] = []
    max_abs_value = 0.0
    max_cell: dict[str, Any] | None = None

    for strike in strikes:
        values: dict[str, float] = {}
        for label in date_labels:
            value = float(strike_maps.get(label, {}).get(strike, 0.0))
            values[label] = value
            abs_value = abs(value)
            if abs_value > max_abs_value:
                max_abs_value = abs_value
                max_cell = {"date": label, "strike": float(strike), "value": value}

        rows.append({"strike": float(strike), "values": values})

    return {
        "dates": date_labels,
        "rows": rows,
        "max_abs_value": float(max_abs_value),
        "max_cell": max_cell,
    }


def compute_gamma_heatmap(
    options_frame: pd.DataFrame,
    spot_price: float,
    date_key: str,
    days: int = 5,
) -> dict[str, Any]:
    return _compute_exposure_heatmap(
        options_frame=options_frame,
        spot_price=spot_price,
        date_key=date_key,
        value_column="gex_bn",
        days=days,
    )


def compute_delta_heatmap(
    options_frame: pd.DataFrame,
    spot_price: float,
    date_key: str,
    days: int = 5,
) -> dict[str, Any]:
    return _compute_exposure_heatmap(
        options_frame=options_frame,
        spot_price=spot_price,
        date_key=date_key,
        value_column="delta_m",
        days=days,
    )


def get_key_gamma_levels(gex_by_strike: list[dict[str, float]], spot_price: float) -> dict[str, Any]:
    strike_df = _strike_dataframe(gex_by_strike)
    if strike_df.empty:
        return {
            "call_wall": None,
            "put_wall": None,
            "strongest_positive": None,
            "strongest_negative": None,
            "gamma_flip": None,
            "nearest_pivot": None,
            "support_zone": None,
            "resistance_zone": None,
            "pin_zone": None,
            "high_risk_zone": None,
            "calls_above_level": None,
            "puts_below_level": None,
        }

    step = _strike_step(strike_df)
    strike_df["distance"] = (strike_df["strike"] - spot_price).abs()
    positive = strike_df[strike_df["gex_bn"] > 0]
    negative = strike_df[strike_df["gex_bn"] < 0]

    call_candidates = positive[positive["strike"] >= spot_price]
    put_candidates = negative[negative["strike"] <= spot_price]

    call_wall = (
        float(call_candidates.sort_values("gex_bn", ascending=False).iloc[0]["strike"])
        if not call_candidates.empty
        else (float(positive.sort_values("gex_bn", ascending=False).iloc[0]["strike"]) if not positive.empty else None)
    )

    put_wall = (
        float(put_candidates.sort_values("gex_bn", ascending=True).iloc[0]["strike"])
        if not put_candidates.empty
        else (float(negative.sort_values("gex_bn", ascending=True).iloc[0]["strike"]) if not negative.empty else None)
    )

    strongest_positive = (
        float(positive.sort_values("gex_bn", ascending=False).iloc[0]["strike"]) if not positive.empty else None
    )
    strongest_negative = (
        float(negative.sort_values("gex_bn", ascending=True).iloc[0]["strike"]) if not negative.empty else None
    )

    gamma_flip = None
    for idx in range(1, len(strike_df)):
        prev = strike_df.iloc[idx - 1]
        curr = strike_df.iloc[idx]
        if prev["gex_bn"] == 0 or curr["gex_bn"] == 0:
            continue
        if (prev["gex_bn"] > 0 > curr["gex_bn"]) or (prev["gex_bn"] < 0 < curr["gex_bn"]):
            midpoint = float((prev["strike"] + curr["strike"]) / 2)
            if gamma_flip is None or abs(midpoint - spot_price) < abs(gamma_flip - spot_price):
                gamma_flip = midpoint

    nearest_pivot = float(strike_df.sort_values(["distance", "abs_gex"], ascending=[True, False]).iloc[0]["strike"])

    support_center = None
    if not positive.empty:
        support_pool = positive[positive["strike"] <= spot_price]
        if support_pool.empty:
            support_pool = positive
        support_center = float(support_pool.sort_values(["abs_gex", "distance"], ascending=[False, True]).iloc[0]["strike"])

    resistance_center = None
    if not positive.empty:
        resistance_pool = positive[positive["strike"] >= spot_price]
        if resistance_pool.empty:
            resistance_pool = positive
        resistance_center = float(
            resistance_pool.sort_values(["abs_gex", "distance"], ascending=[False, True]).iloc[0]["strike"]
        )

    risk_center = None
    if not negative.empty:
        risk_center = float(negative.sort_values("distance", ascending=True).iloc[0]["strike"])

    pin_zone = None
    pos_below = positive[positive["strike"] <= spot_price].sort_values("strike", ascending=False).head(1)
    pos_above = positive[positive["strike"] >= spot_price].sort_values("strike", ascending=True).head(1)
    if not pos_below.empty and not pos_above.empty:
        low = float(pos_below.iloc[0]["strike"])
        high = float(pos_above.iloc[0]["strike"])
        if low <= high and abs(high - low) <= step * 5:
            pin_zone = {"low": low, "high": high}

    def zone(center: float | None, width_steps: float) -> dict[str, float] | None:
        if center is None:
            return None
        width = step * width_steps
        return {"low": float(center - width), "high": float(center + width)}

    return {
        "call_wall": call_wall,
        "put_wall": put_wall,
        "strongest_positive": strongest_positive,
        "strongest_negative": strongest_negative,
        "gamma_flip": gamma_flip,
        "nearest_pivot": nearest_pivot,
        "support_zone": zone(support_center, 1.5),
        "resistance_zone": zone(resistance_center, 1.5),
        "pin_zone": pin_zone,
        "high_risk_zone": zone(risk_center, 2.0),
        "calls_above_level": call_wall,
        "puts_below_level": put_wall,
    }


def classify_gamma_regime(total_gex: float, spot_price: float, gamma_flip: float | None) -> str:
    if gamma_flip is not None and abs(spot_price - gamma_flip) / max(spot_price, 1) <= 0.003:
        return "pivot_sensitive"
    if total_gex >= 0.5:
        return "positive_gamma_stable"
    if total_gex <= -0.5:
        return "negative_gamma_unstable"
    return "mixed_balanced"


def generate_trade_levels(
    gex_by_strike: list[dict[str, float]],
    spot_price: float,
    key_levels: dict[str, Any],
) -> dict[str, Any]:
    strike_df = _strike_dataframe(gex_by_strike)
    if strike_df.empty:
        return {
            "upside_targets": [],
            "downside_targets": [],
            "suggested_spread_ranges": [],
            "major_support_zone": None,
            "major_resistance_zone": None,
            "pin_magnet_zone": None,
            "fast_move_zone": None,
            "calls_above_level": key_levels.get("calls_above_level"),
            "puts_below_level": key_levels.get("puts_below_level"),
        }

    positive = strike_df[strike_df["gex_bn"] > 0].sort_values("strike")
    negative = strike_df[strike_df["gex_bn"] < 0].sort_values("strike")

    upside = positive[positive["strike"] > spot_price].sort_values("abs_gex", ascending=False).head(3)
    downside = negative[negative["strike"] < spot_price].sort_values("abs_gex", ascending=False).head(3)

    call_wall = key_levels.get("call_wall")
    put_wall = key_levels.get("put_wall")

    spreads: list[dict[str, Any]] = []
    if call_wall is not None:
        next_call = positive[positive["strike"] > call_wall].sort_values("strike").head(1)
        if not next_call.empty:
            spreads.append(
                {
                    "type": "call_spread",
                    "lower": float(call_wall),
                    "upper": float(next_call.iloc[0]["strike"]),
                }
            )

    if put_wall is not None:
        next_put = negative[negative["strike"] < put_wall].sort_values("strike", ascending=False).head(1)
        if not next_put.empty:
            spreads.append(
                {
                    "type": "put_spread",
                    "lower": float(next_put.iloc[0]["strike"]),
                    "upper": float(put_wall),
                }
            )

    return {
        "upside_targets": upside["strike"].astype(float).tolist(),
        "downside_targets": downside["strike"].astype(float).tolist(),
        "suggested_spread_ranges": spreads,
        "major_support_zone": key_levels.get("support_zone"),
        "major_resistance_zone": key_levels.get("resistance_zone"),
        "pin_magnet_zone": key_levels.get("pin_zone"),
        "fast_move_zone": key_levels.get("high_risk_zone"),
        "calls_above_level": key_levels.get("calls_above_level"),
        "puts_below_level": key_levels.get("puts_below_level"),
    }


def generate_trade_setups(
    ticker: str,
    spot_price: float,
    gamma_regime: str,
    key_levels: dict[str, Any],
    trade_levels: dict[str, Any],
    gex_by_expiration: list[dict[str, Any]],
    total_delta: float,
    delta_by_strike: list[dict[str, float]],
) -> list[dict[str, str]]:
    setups: list[dict[str, str]] = []

    call_wall = key_levels.get("call_wall")
    put_wall = key_levels.get("put_wall")
    pin_zone = trade_levels.get("pin_magnet_zone")

    expiry = _select_trade_expiration(gex_by_expiration)

    calls_above = _round_strike(trade_levels.get("calls_above_level") or call_wall)
    puts_below = _round_strike(trade_levels.get("puts_below_level") or put_wall)
    upside_targets = [_round_strike(level) for level in (trade_levels.get("upside_targets") or [])]
    downside_targets = [_round_strike(level) for level in (trade_levels.get("downside_targets") or [])]

    delta_bias = "supportive" if total_delta >= 0 else "fragile"

    nearest_delta = None
    if delta_by_strike:
        nearest_delta = min(delta_by_strike, key=lambda row: abs(float(row.get("strike", 0.0)) - spot_price))

    wing = 20.0
    if calls_above is not None and upside_targets and upside_targets[0] is not None:
        wing = max(10.0, abs(upside_targets[0] - calls_above))
    elif puts_below is not None and downside_targets and downside_targets[0] is not None:
        wing = max(10.0, abs(puts_below - downside_targets[0]))

    pin_low = _round_strike((pin_zone or {}).get("low"))
    pin_high = _round_strike((pin_zone or {}).get("high"))
    if pin_low is None or pin_high is None or pin_low >= pin_high:
        center = _round_strike(spot_price) or 0.0
        pin_low = center - wing
        pin_high = center + wing

    neutral_put_long = pin_low - wing
    neutral_call_long = pin_high + wing
    setups.append(
        {
            "title": "Pin / Mean-Reversion Frame",
            "bias": "neutral",
            "trigger": f"Spot holds inside {pin_low:.0f}-{pin_high:.0f}",
            "thesis": (
                "Heavy positive gamma near spot can dampen movement and favor range behavior. "
                + (
                    "Delta is currently supportive, which can reinforce pinning behavior around central strikes."
                    if delta_bias == "supportive"
                    else "Delta is fragile, so expect weaker pinning and faster zone failures."
                )
            ),
            "risk": "Break and acceptance outside the pin zone can invalidate the range setup.",
            "exact_trade": (
                f"{ticker} {expiry} Iron Condor: Buy {neutral_put_long:.0f} Put / Sell {pin_low:.0f} Put / "
                f"Sell {pin_high:.0f} Call / Buy {neutral_call_long:.0f} Call (1-lot structure)."
            ),
        }
    )

    bull_long = calls_above if calls_above is not None else _round_strike(spot_price + wing)
    bull_short = None
    for target in upside_targets:
        if target is not None and bull_long is not None and target > bull_long:
            bull_short = target
            break
    if bull_short is None and bull_long is not None:
        bull_short = bull_long + wing

    setups.append(
        {
            "title": "Upside Compression Toward Call Wall",
            "bias": "bullish_tactical",
            "trigger": f"Spot reclaims and holds above {bull_long:.0f}" if bull_long is not None else "Spot reclaims key upside level",
            "thesis": (
                "Positive gamma above can attract price toward the next call concentration while compressing realized vol. "
                + (
                    f"Nearest delta pocket around {nearest_delta['strike']:.0f} also supports upside stickiness."
                    if nearest_delta and nearest_delta.get("delta_m", 0) > 0
                    else "Delta near spot is not strongly supportive, so upside follow-through may be less persistent."
                )
            ),
            "risk": "Failure back below the reclaimed wall can trap upside continuation entries.",
            "exact_trade": (
                f"{ticker} {expiry} Call Debit Spread: Buy {bull_long:.0f} Call / Sell {bull_short:.0f} Call (1-lot structure)."
                if bull_long is not None and bull_short is not None
                else f"{ticker} {expiry} Call Debit Spread around nearest call-wall and next upside target."
            ),
        }
    )

    bear_long = puts_below if puts_below is not None else _round_strike(spot_price - wing)
    bear_short = None
    for target in downside_targets:
        if target is not None and bear_long is not None and target < bear_long:
            bear_short = target
            break
    if bear_short is None and bear_long is not None:
        bear_short = bear_long - wing

    setups.append(
        {
            "title": "Downside Expansion Through Put Wall",
            "bias": "bearish_tactical",
            "trigger": f"Spot loses and accepts below {bear_long:.0f}" if bear_long is not None else "Spot loses key downside level",
            "thesis": (
                "Negative gamma below can open a faster move toward the next downside pocket. "
                + (
                    "Negative aggregate delta can amplify downside instability if puts gain sensitivity into weakness."
                    if total_delta < 0
                    else "Supportive delta can partially cushion downside acceleration unless the wall breaks decisively."
                )
            ),
            "risk": "Quick reclaim above the broken put wall can trigger short-covering and whipsaw.",
            "exact_trade": (
                f"{ticker} {expiry} Put Debit Spread: Buy {bear_long:.0f} Put / Sell {bear_short:.0f} Put (1-lot structure)."
                if bear_long is not None and bear_short is not None
                else f"{ticker} {expiry} Put Debit Spread around nearest put-wall and next downside target."
            ),
        }
    )

    return setups


def _expiration_focus_notes(gex_by_expiration: list[dict[str, Any]]) -> list[str]:
    if not gex_by_expiration:
        return ["No expiration-level concentration data is available."]

    exp_df = pd.DataFrame(gex_by_expiration)
    exp_df["abs_gex"] = exp_df["gex_bn"].abs()
    top = exp_df.sort_values("abs_gex", ascending=False).head(3)

    notes = []
    if not top.empty:
        first = top.iloc[0]
        notes.append(
            f"Highest expiration concentration is {first['expiration']} at {first['gex_bn']:.2f}Bn, which can anchor near-term strike behavior."
        )

    if len(top) > 1:
        second = top.iloc[1]
        notes.append(
            f"Secondary cluster at {second['expiration']} ({second['gex_bn']:.2f}Bn) is a nearby catalyst window to monitor."
        )

    notes.append("When large expiries roll off, nearby strike sensitivity can shift quickly and reprice local support/resistance.")
    return notes


def get_spx_gamma_dashboard_payload(
    force_refresh: bool = False,
    date_input: str | None = None,
    ticker: str = "SPX",
) -> dict[str, Any]:
    symbol = _normalize_ticker(ticker)
    date_key = _resolve_date_key(date_input, prefer_latest=not force_refresh, ticker=symbol)
    processed_path = _processed_path(date_key, symbol)

    if not force_refresh:
        cached = _load_json(processed_path)
        required_keys = {
            "total_delta",
            "delta_by_strike",
            "gamma_heatmap",
            "delta_heatmap",
            "gamma_profile",
            "trade_setups",
            "key_levels",
            "date_key",
            "ticker",
        }
        if cached and required_keys.issubset(set(cached.keys())):
            return cached

        # In historical mode, never synthesize a missing old snapshot from live data.
        # Fall back to latest available snapshot for this ticker.
        if date_input:
            latest = latest_gamma_date_key(symbol)
            if latest:
                latest_cached = _load_json(_processed_path(latest, symbol))
                if latest_cached and required_keys.issubset(set(latest_cached.keys())):
                    return latest_cached

    raw_payload = fetch_spx_gex_data(force_refresh=force_refresh, date_input=date_key, ticker=symbol)
    data_blob = _extract_data_blob(raw_payload)
    spot_price = _extract_spot_price(data_blob)

    options_frame = _prepare_options_frame(_extract_options_rows(data_blob))
    options_frame = _recalculate_surface_greeks(spot_price, options_frame, pd.Timestamp.utcnow().tz_localize(None))
    options_frame = _compute_gex_columns(spot_price, options_frame)

    total_gex = compute_total_gex(options_frame)
    total_delta = compute_total_delta(options_frame)
    gex_by_strike = compute_gex_by_strike(options_frame, spot_price)
    delta_by_strike = compute_delta_by_strike(options_frame, spot_price)
    gamma_profile, profile_gamma_flip = compute_gamma_profile(options_frame, spot_price)
    gex_by_expiration = compute_gex_by_expiration(options_frame)
    gamma_heatmap = compute_gamma_heatmap(options_frame, spot_price, date_key=date_key, days=5)
    delta_heatmap = compute_delta_heatmap(options_frame, spot_price, date_key=date_key, days=5)

    key_levels = get_key_gamma_levels(gex_by_strike, spot_price)
    if profile_gamma_flip is not None:
        key_levels["gamma_flip"] = profile_gamma_flip
    gamma_regime = classify_gamma_regime(total_gex, spot_price, key_levels.get("gamma_flip"))
    trade_levels = generate_trade_levels(gex_by_strike, spot_price, key_levels)
    trade_setups = generate_trade_setups(
        symbol,
        spot_price,
        gamma_regime,
        key_levels,
        trade_levels,
        gex_by_expiration,
        total_delta,
        delta_by_strike,
    )

    trader_notes = [
        f"Calls above {key_levels['calls_above_level']:.0f} and puts below {key_levels['puts_below_level']:.0f} define the nearest directional gates."
        if key_levels.get("calls_above_level") is not None and key_levels.get("puts_below_level") is not None
        else "Key directional gates are unavailable due to sparse strike data.",
        (
            "Spot is near the gamma flip, so small breaks can change local flow behavior quickly."
            if gamma_regime == "pivot_sensitive"
            else "Spot is away from the gamma flip, so structural walls are the primary reference points."
        ),
        (
            "Positive gamma dominates; range and spread structures are generally favored while key walls hold."
            if gamma_regime == "positive_gamma_stable"
            else (
                "Negative gamma dominates; directional breaks can extend quickly through weak liquidity pockets."
                if gamma_regime == "negative_gamma_unstable"
                else "Gamma is mixed; monitor reaction at nearest call/put walls before committing directional size."
            )
        ),
    ]

    payload = {
        "ticker": symbol,
        "date_key": date_key,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "spot_price": float(spot_price),
        "total_gex": float(total_gex),
        "total_delta": float(total_delta),
        "gex_by_strike": gex_by_strike,
        "delta_by_strike": delta_by_strike,
        "gex_by_expiration": gex_by_expiration,
        "gamma_profile": gamma_profile,
        "gamma_heatmap": gamma_heatmap,
        "delta_heatmap": delta_heatmap,
        "key_levels": key_levels,
        "gamma_regime": gamma_regime,
        "trade_levels": trade_levels,
        "trade_setups": trade_setups,
        "trader_notes": trader_notes,
        "expiration_focus": _expiration_focus_notes(gex_by_expiration),
        "option_count": int(len(options_frame)),
    }

    _save_json(processed_path, payload)
    return payload
