import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SUPPORTED_TICKERS } from '../lib/tickers';

function toMonthStart(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(value) {
  if (!value) return 'No archived dates';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function DateCalendar({ selectedDate, availableDates, onDateChange }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => toMonthStart(selectedDate));
  const rootRef = useRef(null);
  const dateSet = useMemo(() => new Set(availableDates.map((entry) => entry.iso)), [availableDates]);
  const dates = useMemo(() => [...dateSet].sort(), [dateSet]);
  const earliestMonth = dates.length ? monthKey(toMonthStart(dates[0])) : monthKey(month);
  const latestMonth = dates.length ? monthKey(toMonthStart(dates[dates.length - 1])) : monthKey(month);
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  useEffect(() => {
    if (selectedDate) setMonth(toMonthStart(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const changeMonth = (amount) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  return (
    <div className="date-picker-wrap" ref={rootRef}>
      <span className="date-picker-label">Data Date</span>
      <button
        type="button"
        className="date-select date-calendar-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{formatDate(selectedDate)}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="date-calendar" role="dialog" aria-label="Choose archived data date">
          <div className="date-calendar-heading">
            <button
              type="button"
              aria-label="Previous month"
              disabled={monthKey(new Date(month.getFullYear(), month.getMonth() - 1, 1)) < earliestMonth}
              onClick={() => changeMonth(-1)}
            >‹</button>
            <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
            <button
              type="button"
              aria-label="Next month"
              disabled={monthKey(new Date(month.getFullYear(), month.getMonth() + 1, 1)) > latestMonth}
              onClick={() => changeMonth(1)}
            >›</button>
          </div>
          <div className="date-calendar-grid" role="grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <span className="date-calendar-weekday" key={`${day}-${index}`} aria-hidden="true">{day}</span>
            ))}
            {cells.map((day, index) => {
              if (!day) return <span className="date-calendar-empty" key={`empty-${index}`} />;
              const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const available = dateSet.has(iso);
              return (
                <button
                  type="button"
                  className={`date-calendar-day${iso === selectedDate ? ' is-selected' : ''}`}
                  key={iso}
                  disabled={!available}
                  aria-label={`${formatDate(iso)}${available ? ', data available' : ', no data'}`}
                  aria-pressed={iso === selectedDate}
                  onClick={() => {
                    onDateChange(iso);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="date-calendar-footnote">Only dates with saved data are selectable.</p>
        </div>
      ) : null}
    </div>
  );
}

export default function TopBar({
  selectedDate,
  availableDates,
  onDateChange,
  theme,
  onToggleTheme,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const ticker = SUPPORTED_TICKERS.includes((searchParams.get('ticker') || 'SPX').toUpperCase())
    ? (searchParams.get('ticker') || 'SPX').toUpperCase()
    : 'SPX';

  const onTickerChange = (value) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === 'SPX') nextParams.delete('ticker');
    else nextParams.set('ticker', value);
    setSearchParams(nextParams);
  };

  return (
    <header className="topbar">
      <div>
        <h2>Naive GEX Terminal</h2>
        <p>Options market maker exposure, actionable Greek levels, and heatmaps</p>
        <p className="analytics-disclaimer">
          Naive delta and gamma calculations for educational and research purposes; does not account for order flow, dealer inventory, volatility-surface dynamics, or other advanced institutional techniques.
        </p>
      </div>

      <button
        type="button"
        className="theme-toggle"
        onClick={onToggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      </button>

      <div className="topbar-actions">
        <div className="market-data-controls" aria-label="Market data selection">
          <label className="market-control" htmlFor="ticker-select">
            <span className="date-picker-label">Underlying</span>
            <select
              id="ticker-select"
              className="ticker-input ticker-select"
              value={ticker}
              onChange={(event) => onTickerChange(event.target.value)}
            >
              {SUPPORTED_TICKERS.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
            </select>
          </label>
          <DateCalendar
            selectedDate={selectedDate}
            availableDates={availableDates || []}
            onDateChange={onDateChange}
          />
        </div>
      </div>
    </header>
  );
}
