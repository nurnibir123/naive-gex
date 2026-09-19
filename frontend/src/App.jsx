import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import SpxGexPage from './pages/SpxGexPage';
import { getDataDates, refreshSpxGamma } from './lib/api';

export default function App() {
  const [refreshingGamma, setRefreshingGamma] = useState(false);
  const [statusText, setStatusText] = useState('Ready');
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDates, setAvailableDates] = useState([]);

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
      <Sidebar />

      <div className="content-shell">
        <TopBar
          onRefreshGamma={triggerGammaRefresh}
          refreshingGamma={refreshingGamma}
          statusText={statusText}
          selectedDate={selectedDate}
          availableDates={availableDates}
          onDateChange={setSelectedDate}
        />

        <div className="content-body">
          <Routes>
            <Route path="/" element={<Navigate to="/spx-gamma" replace />} />
            <Route path="/spx-gamma" element={<SpxGexPage selectedDate={selectedDate} />} />
            <Route path="/spx-gex" element={<Navigate to="/spx-gamma" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
