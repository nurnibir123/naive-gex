import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import GammaHeatmap from '../components/GammaHeatmap';
import GexByStrikeChart from '../components/GexByStrikeChart';
import TradeSetupsPanel from '../components/TradeSetupsPanel';
import { getSpxGamma } from '../lib/api';
import { SUPPORTED_TICKERS } from '../lib/tickers';

function normalizeTicker(value) {
  const clean = String(value || 'SPX').trim().toUpperCase();
  return SUPPORTED_TICKERS.includes(clean) ? clean : 'SPX';
}

export default function SpxGexPage({ selectedDate }) {
  const [gamma, setGamma] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchParams] = useSearchParams();
  const ticker = useMemo(() => normalizeTicker(searchParams.get('ticker') || 'SPX'), [searchParams]);

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

  useEffect(() => {
    loadGamma();
  }, [selectedDate, ticker]);

  return (
    <section className="page">
      <div className="page-header page-header-split">
        <div>
          <h2>{ticker} Delta/Gamma</h2>
          <p>Trader-oriented market maker exposure dashboard with deterministic setups and dual strike profiles.</p>
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
          <TradeSetupsPanel setups={gamma?.trade_setups || []} gammaRegime={gamma?.gamma_regime} />

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
