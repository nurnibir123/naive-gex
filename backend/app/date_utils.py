from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

US_EASTERN = ZoneInfo("America/New_York")


def _is_weekend(day: date) -> bool:
    return day.weekday() >= 5


def previous_business_day(day: date) -> date:
    candidate = day - timedelta(days=1)
    while _is_weekend(candidate):
        candidate -= timedelta(days=1)
    return candidate


def current_market_date(now: datetime | None = None) -> date:
    current = now.astimezone(US_EASTERN) if now else datetime.now(US_EASTERN)

    # If weekend, map to previous business day.
    if _is_weekend(current.date()):
        return previous_business_day(current.date())

    # Before market close, use previous business day for stable daily snapshots.
    if current.hour < 16 or (current.hour == 16 and current.minute < 5):
        return previous_business_day(current.date())

    return current.date()


def to_date_key(day: date) -> str:
    return day.strftime("%m-%d-%Y")


def to_iso_date(day: date) -> str:
    return day.strftime("%Y-%m-%d")


def parse_date_input(value: str | None) -> date | None:
    if not value:
        return None

    cleaned = value.strip()
    formats = ["%Y-%m-%d", "%m-%d-%Y", "%m/%d/%Y"]
    for pattern in formats:
        try:
            return datetime.strptime(cleaned, pattern).date()
        except ValueError:
            continue
    return None


def date_key_from_input(value: str | None) -> str | None:
    parsed = parse_date_input(value)
    if not parsed:
        return None
    return to_date_key(parsed)


def iso_from_key(date_key: str) -> str | None:
    try:
        parsed = datetime.strptime(date_key, "%m-%d-%Y").date()
    except ValueError:
        return None
    return to_iso_date(parsed)


def is_market_closed_now(now: datetime | None = None) -> bool:
    current = now.astimezone(US_EASTERN) if now else datetime.now(US_EASTERN)
    if _is_weekend(current.date()):
        return True
    return (current.hour, current.minute) >= (16, 5)
