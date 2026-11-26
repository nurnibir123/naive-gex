import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import TopBar from './components/TopBar';
import SpxGexPage from './pages/SpxGexPage';
import { getDataDates } from './lib/api';

export default function App() {
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState([]);
  const [dateRequest, setDateRequest] = useState({ ticker: '', date: '' });
  const [theme, setTheme] = useState(() => localStorage.getItem('naive-greeks-theme') || 'dark');
  const location = useLocation();
  const ticker = useMemo(() => {
    const requested = new URLSearchParams(location.search).get('ticker') || 'SPX';
    return requested.trim().toUpperCase().replace(/[^A-Z0-9_.-]/g, '') || 'SPX';
  }, [location.search]);
  const requestedDate = dateRequest.ticker === ticker ? dateRequest.date : '';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('naive-greeks-theme', theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    setDateRequest({ ticker, date: '' });
    setSelectedDate('');
    setAvailableDates([]);
    let loadedSnapshot = '';

    const loadTickerDates = (snapshotDate = '') => getDataDates(ticker)
      .then((payload) => {
        if (cancelled) return;
        snapshotDate = loadedSnapshot || snapshotDate;
        const dates = Array.isArray(payload?.dates) ? [...payload.dates] : [];
        if (snapshotDate && !dates.some((entry) => entry.iso === snapshotDate)) {
          dates.push({ iso: snapshotDate, key: snapshotDate });
        }
        const dateValues = new Set(dates.map((entry) => entry.iso));
        setAvailableDates(dates);
        setSelectedDate((current) => (
          current && dateValues.has(current) ? current : snapshotDate || payload?.latest || ''
        ));
      })
      .catch(() => {
        if (!cancelled) {
          snapshotDate = loadedSnapshot || snapshotDate;
          setAvailableDates(snapshotDate ? [{ iso: snapshotDate, key: snapshotDate }] : []);
          setSelectedDate(snapshotDate);
        }
      });

    const handleGammaLoaded = (event) => {
      if (event.detail?.ticker !== ticker) return;
      const dateKey = String(event.detail?.dateKey || '');
      const match = dateKey.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const snapshotDate = match ? `${match[3]}-${match[1]}-${match[2]}` : '';
      if (!snapshotDate) return;
      loadedSnapshot = snapshotDate;
      setSelectedDate(snapshotDate);
      setAvailableDates((dates) => dates.some((entry) => entry.iso === snapshotDate)
        ? dates : [...dates, { iso: snapshotDate, key: dateKey }]);
    };

    loadTickerDates();
    window.addEventListener('elysium-gamma-loaded', handleGammaLoaded);

    return () => {
      cancelled = true;
      window.removeEventListener('elysium-gamma-loaded', handleGammaLoaded);
    };
  }, [ticker]);

  return (
    <div className="app-shell">
      <div className="content-shell">
        <TopBar
          selectedDate={selectedDate}
          availableDates={availableDates}
          onDateChange={(date) => { setSelectedDate(date); setDateRequest({ ticker, date }); }}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />

        <div className="content-body">
          <Routes>
            <Route path="/" element={<SpxGexPage selectedDate={requestedDate} />} />
            <Route path="/spx-gamma" element={<SpxGexPage selectedDate={requestedDate} />} />
            <Route path="/spx-gex" element={<SpxGexPage selectedDate={requestedDate} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>

        <footer className="research-footer">
          <div className="research-footer-intro">
            <p className="research-footer-eyebrow">Research & methodology</p>
            <h3>Frameworks behind the terminal</h3>
            <p>These references informed the exposure model, hedging assumptions, volatility context, and strategy guardrails.</p>
          </div>
          <nav className="research-footer-links" aria-label="Research sources">
            <a href="https://docs.gexbot.com/pdfs/cboe_dxto.pdf" target="_blank" rel="noreferrer">
              <span>Cboe DXTO</span>
              <small>Options volume, liquidity, and cash-equity impact</small>
            </a>
            <a href="https://docs.gexbot.com/pdfs/hau.pdf" target="_blank" rel="noreferrer">
              <span>Hau Volatility Surface</span>
              <small>Order flow, maker inventory, and surface tracking</small>
            </a>
            <a href="https://perfiliev.com/blog/how-to-calculate-gamma-exposure-and-zero-gamma-level/" target="_blank" rel="noreferrer">
              <span>Perfiliev GEX Model</span>
              <small>Gamma exposure and zero-gamma methodology</small>
            </a>
            <a href="https://moontower.ai/blog/moontower-on-gamma" target="_blank" rel="noreferrer">
              <span>Moontower Meta</span>
              <small>Dynamic delta hedging and gamma mechanics</small>
            </a>
            <a href="https://www.mheducation.com/highered/mhp/product/complete-guide-to-option-pricing-formulas-2e.html" target="_blank" rel="noreferrer">
              <span>Espen Gaarder Haug</span>
              <small>Analytical option-pricing formulas and higher-order Greeks</small>
            </a>
          </nav>
          <p className="research-footer-note">Educational references only. The terminal’s calculations remain simplified estimates and do not represent a complete institutional options or order-flow model.</p>
        </footer>
      </div>
    </div>
  );
}
