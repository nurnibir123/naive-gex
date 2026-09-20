export default function TopBar({
  onRefreshGamma,
  refreshingGamma,
  selectedDate,
  availableDates,
  onDateChange,
  theme,
  onToggleTheme,
}) {
  return (
    <header className="topbar">
      <div>
        <h2>Naive Greeks Terminal</h2>
        <p>Options market maker exposure, actionable Greek levels, and heatmaps</p>
        <p className="analytics-disclaimer">
          Naive delta and gamma calculations for educational and research purposes; does not account for order flow, dealer inventory, volatility-surface dynamics, or other advanced institutional techniques.
        </p>
      </div>

      <div className="topbar-actions">
        <label className="date-picker-wrap" htmlFor="history-date">
          <span className="date-picker-label">Data Date</span>
          <select
            id="history-date"
            className="date-select"
            value={selectedDate || ''}
            onChange={(event) => onDateChange(event.target.value)}
          >
            <option value="">Latest</option>
            {(availableDates || []).map((entry) => (
              <option key={entry.iso} value={entry.iso}>
                {entry.iso}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? '☀' : '☾'} <span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <button type="button" className="topbar-btn" onClick={onRefreshGamma} disabled={refreshingGamma}>
          {refreshingGamma ? 'Reloading Greeks...' : 'Reload Greeks'}
        </button>
      </div>
    </header>
  );
}
