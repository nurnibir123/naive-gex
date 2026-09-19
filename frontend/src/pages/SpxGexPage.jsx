import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import GammaHeatmap from '../components/GammaHeatmap';
import GexByStrikeChart from '../components/GexByStrikeChart';
import TradeSetupsPanel from '../components/TradeSetupsPanel';
import { getSpxGamma, refreshSpxGamma } from '../lib/api';

const REFRESH_EVENT = 'elysium-gamma-refreshed';

function normalizeTicker(value) {
  const clean = String(value || 'SPX').trim().toUpperCase();
  if (!clean) {
    return 'SPX';
  }
  return clean.replace(/[^A-Z0-9_.-]/g, '');
}

export default function SpxGexPage({ selectedDate }) {
  const [gamma, setGamma] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [searchParams, setSearchParams] = useSearchParams();
  const ticker = useMemo(() => normalizeTicker(searchParams.get('ticker') || 'SPX'), [searchParams]);
  const [tickerInput, setTickerInput] = useState(ticker);

  useEffect(() => {
    setTickerInput(ticker);
  }, [ticker]);

  const loadGamma = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await getSpxGamma(selectedDate, ticker);
      setGamma(payload);
    } catch (err) {
      setError(err.message || 'Failed to load Greek exposure data.');
      setGamma(null);
    } finally {
      setLoading(false);
    }
  };

  const forceRefreshGamma = async () => {
    setRefreshing(true);
    setError('');
    try {
      const payload = await refreshSpxGamma(selectedDate, false, ticker);
      setGamma(payload);
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
      window.dispatchEvent(new CustomEvent('elysium-data-refreshed'));
    } catch (err) {
      setError(err.message || 'Failed to reload Greek exposure data.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadGamma();
  }, [selectedDate, ticker]);

  useEffect(() => {
    const handler = () => loadGamma();
    window.addEventListener(REFRESH_EVENT, handler);
    return () => window.removeEventListener(REFRESH_EVENT, handler);
  }, [selectedDate, ticker]);

  const applyTicker = () => {
    const next = normalizeTicker(tickerInput);
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'SPX') {
      nextParams.delete('ticker');
    } else {
      nextParams.set('ticker', next);
    }
    setSearchParams(nextParams);
  };

  return (
    <section className="page">
      <div className="page-header page-header-split">
        <div>
          <h2>{ticker} Delta/Gamma</h2>
          <p>Trader-oriented market maker exposure dashboard with deterministic setups and dual strike profiles.</p>
        </div>

        <div className="ticker-controls">
          <input
            type="text"
            className="ticker-input"
            value={tickerInput}
            onChange={(event) => setTickerInput(event.target.value)}
            placeholder="Ticker (e.g. SPX, NVDA)"
          />
          <button type="button" className="topbar-btn" onClick={applyTicker}>
            Load Ticker
          </button>
          <button type="button" className="topbar-btn" onClick={forceRefreshGamma} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh This Page'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="analytics-loading" role="status" aria-live="polite">
          <div className="analytics-loading-header">
            <span className="loading-spinner" aria-hidden="true" />
            <div>
              <p className="analytics-loading-title">Loading {ticker} gamma analytics...</p>
              <p className="analytics-loading-note">Fetching the option chain and building the exposure profile.</p>
            </div>
          </div>
          <div className="loading-progress" aria-hidden="true"><span /></div>
        </div>
      ) : null}
      {error ? <p className="status-text error">{error}</p> : null}

      {!loading && !error ? (
        <>
          <TradeSetupsPanel setups={gamma?.trade_setups || []} />

          <section className="profile-grid">
            <GexByStrikeChart
              title="Delta Strike Profile"
              data={gamma?.delta_by_strike || []}
              valueKey="delta_m"
              valueLabel="Signed Delta"
              spotPrice={gamma?.spot_price}
              keyLevels={gamma?.key_levels || {}}
              showLevelOverlays={false}
            />
            <GexByStrikeChart
              title="Gamma Strike Profile"
              data={gamma?.gex_by_strike || []}
              valueKey="gex_bn"
              valueLabel="Signed GEX"
              spotPrice={gamma?.spot_price}
              keyLevels={gamma?.key_levels || {}}
              showLevelOverlays
            />
          </section>

          <section className="heatmap-grid">
            <GammaHeatmap
              heatmap={gamma?.delta_heatmap}
              title="Delta Heatmap (Next 5 Trading Days)"
              scale={1000}
              suffix="K"
              tooltipSuffix="M / K"
              spotPrice={gamma?.spot_price}
              gammaRegime={gamma?.gamma_regime}
            />

            <GammaHeatmap
              heatmap={gamma?.gamma_heatmap}
              title="Gamma Heatmap (Next 5 Trading Days)"
              scale={1000}
              suffix="M"
              tooltipSuffix="Bn"
              spotPrice={gamma?.spot_price}
              gammaRegime={gamma?.gamma_regime}
            />
          </section>
        </>
      ) : null}
    </section>
  );
}
