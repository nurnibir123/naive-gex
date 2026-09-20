import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import TopBar from './components/TopBar';
import SpxGexPage from './pages/SpxGexPage';
import { getDataDates, refreshSpxGamma } from './lib/api';

export default function App() {
  const [refreshingGamma, setRefreshingGamma] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
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
    setStatusText('Reloading Greeks data...');
    try {
      await refreshSpxGamma(selectedDate);
      await loadDates();
      window.dispatchEvent(new CustomEvent('elysium-gamma-refreshed'));
      window.dispatchEvent(new CustomEvent('elysium-data-refreshed'));
      setStatusText('Greeks reloaded successfully');
    } catch (error) {
      setStatusText(`Greeks reload failed: ${error.message}`);
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
          statusText={statusText}
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
      </div>
    </div>
  );
}
