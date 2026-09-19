from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    ok: bool


class ZoneLevel(BaseModel):
    low: float
    high: float


class SpreadRange(BaseModel):
    type: str
    lower: float
    upper: float


class StrikePoint(BaseModel):
    strike: float
    gex_bn: float


class DeltaStrikePoint(BaseModel):
    strike: float
    delta_m: float


class ExpirationPoint(BaseModel):
    expiration: str
    gex_bn: float


class GammaHeatmapMaxCell(BaseModel):
    date: str
    strike: float
    value: float


class GammaHeatmapRow(BaseModel):
    strike: float
    values: dict[str, float]


class GammaHeatmap(BaseModel):
    dates: list[str]
    rows: list[GammaHeatmapRow]
    max_abs_value: float
    max_cell: Optional[GammaHeatmapMaxCell] = None


class KeyGammaLevels(BaseModel):
    call_wall: Optional[float] = None
    put_wall: Optional[float] = None
    strongest_positive: Optional[float] = None
    strongest_negative: Optional[float] = None
    gamma_flip: Optional[float] = None
    nearest_pivot: Optional[float] = None
    support_zone: Optional[ZoneLevel] = None
    resistance_zone: Optional[ZoneLevel] = None
    pin_zone: Optional[ZoneLevel] = None
    high_risk_zone: Optional[ZoneLevel] = None
    calls_above_level: Optional[float] = None
    puts_below_level: Optional[float] = None


class TradeLevels(BaseModel):
    upside_targets: list[float]
    downside_targets: list[float]
    suggested_spread_ranges: list[SpreadRange]
    major_support_zone: Optional[ZoneLevel] = None
    major_resistance_zone: Optional[ZoneLevel] = None
    pin_magnet_zone: Optional[ZoneLevel] = None
    fast_move_zone: Optional[ZoneLevel] = None
    calls_above_level: Optional[float] = None
    puts_below_level: Optional[float] = None


class TradeSetup(BaseModel):
    title: str
    bias: str
    trigger: str
    thesis: str
    risk: str
    exact_trade: str


class SpxGammaResponse(BaseModel):
    ticker: str
    date_key: str
    last_updated: str
    spot_price: float
    total_gex: float
    total_delta: float
    gex_by_strike: list[StrikePoint]
    delta_by_strike: list[DeltaStrikePoint]
    gex_by_expiration: list[ExpirationPoint]
    gamma_heatmap: GammaHeatmap
    delta_heatmap: GammaHeatmap
    key_levels: KeyGammaLevels
    gamma_regime: str
    trade_levels: TradeLevels
    trade_setups: list[TradeSetup]
    trader_notes: list[str]
    expiration_focus: list[str]
    option_count: int


class DataDateEntry(BaseModel):
    key: str
    iso: str
    has_gamma: bool


class DataDatesResponse(BaseModel):
    latest: Optional[str] = None
    dates: list[DataDateEntry]
