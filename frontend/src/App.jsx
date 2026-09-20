import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import TopBar from './components/TopBar';
import SpxGexPage from './pages/SpxGexPage';
import { getDataDates, refreshSpxGamma } from './lib/api';

export default function App() {
  const [refreshingGamma, setRefreshingGamma] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('naive-greeks-theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('naive-greeks-theme', theme);
  }, [theme]);

  const loadDates = async () => {
    try {
      const payload = await getDataDates();
      const dates = Array.isArray(payload?.dates) ? payload.dates : [];
      setAvailableDates(dates);
      if (!selectedDate && payload?.latest) {
        setSelectedDate(payload.latest);
      }
    } catch {
      setAvailableDates([]);
    }
  };

  useEffect(() => {
    loadDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerGammaRefresh = async () => {
    setRefreshingGamma(true);
    try {
      await refreshSpxGamma(selectedDate);
      await loadDates();
      window.dispatchEvent(new CustomEvent('elysium-gamma-refreshed'));
      window.dispatchEvent(new CustomEvent('elysium-data-refreshed'));
    } catch (error) {
      console.error('Greeks reload failed:', error);
    } finally {
      setRefreshingGamma(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="content-shell">
        <TopBar
          onRefreshGamma={triggerGammaRefresh}
          refreshingGamma={refreshingGamma}
          selectedDate={selectedDate}
          availableDates={availableDates}
          onDateChange={setSelectedDate}
          theme={theme}
          onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />

        <div className="content-body">
          <Routes>
            <Route path="/" element={<SpxGexPage selectedDate={selectedDate} />} />
            <Route path="/spx-gamma" element={<SpxGexPage selectedDate={selectedDate} />} />
            <Route path="/spx-gex" element={<SpxGexPage selectedDate={selectedDate} />} />
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
