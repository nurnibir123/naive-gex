import { useEffect, useRef } from 'react';

import { formatPrice } from '../lib/format';

function formatCellValue(value, scale, suffix) {
  if (value === null || value === undefined) {
    return '-';
  }
  const scaled = Number(value) * scale;
  const sign = scaled > 0 ? '+' : '';
  return `${sign}${scaled.toFixed(1)}${suffix}`;
}

function mixColor(start, end, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(start.r + (end.r - start.r) * clamped),
    g: Math.round(start.g + (end.g - start.g) * clamped),
    b: Math.round(start.b + (end.b - start.b) * clamped),
  };
}

function rgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function cellColor(value, maxAbs, isLightTheme = false) {
  if (!maxAbs || maxAbs <= 0) {
    return 'rgba(28, 33, 45, 0.9)';
  }

  const intensity = Math.min(1, Math.abs(value) / maxAbs);
  if (value > 0) {
    // Positive exposure: green -> yellow
    const positive = mixColor({ r: 34, g: 197, b: 94 }, { r: 250, g: 204, b: 21 }, intensity);
    const alpha = isLightTheme ? 0.62 + intensity * 0.28 : 0.24 + intensity * 0.64;
    return rgba(positive, alpha);
  }
  if (value < 0) {
    // Negative exposure: blue -> purple
    const negative = mixColor({ r: 59, g: 130, b: 246 }, { r: 126, g: 34, b: 206 }, intensity);
    const alpha = isLightTheme ? 0.62 + intensity * 0.28 : 0.24 + intensity * 0.64;
    return rgba(negative, alpha);
  }
  return 'rgba(28, 33, 45, 0.9)';
}

function regimeClassFromGamma(regime) {
  if (regime === 'positive_gamma_stable') {
    return 'heatmap-panel--trending';
  }
  if (regime === 'negative_gamma_unstable') {
    return 'heatmap-panel--noisy';
  }
  return 'heatmap-panel--range';
}

export default function GammaHeatmap({
  heatmap,
  title = 'Gamma Heatmap (Next 5 Trading Days)',
  scale = 1000,
  suffix = 'M',
  tooltipSuffix = 'Bn',
  spotPrice = null,
  gammaRegime = '',
}) {
  const heatmapWrapRef = useRef(null);
  const dates = heatmap?.dates || [];
  const rows = heatmap?.rows || [];
  const maxAbs = Number(heatmap?.max_abs_value || 0);
  const maxCell = heatmap?.max_cell;
  const numericSpot = Number(spotPrice);
  const hasSpot = Number.isFinite(numericSpot);

  const spotStrike =
    hasSpot && rows.length
      ? rows.reduce((nearest, row) => {
          if (nearest === null) {
            return row.strike;
          }
          return Math.abs(Number(row.strike) - numericSpot) < Math.abs(Number(nearest) - numericSpot)
            ? row.strike
            : nearest;
        }, null)
      : null;

  const regimeClass = regimeClassFromGamma(gammaRegime);
  const isLightTheme = document.documentElement.dataset.theme === 'light';
  const peakLabel = title.toLowerCase().includes('delta') ? 'Peak Delta' : 'Peak Gamma';

  useEffect(() => {
    if (spotStrike === null || !heatmapWrapRef.current) {
      return;
    }

    const spotRow = heatmapWrapRef.current.querySelector('[data-heatmap-spot="true"]');
    if (!spotRow) {
      return;
    }

    heatmapWrapRef.current.scrollTop = Math.max(
      0,
      spotRow.offsetTop - (heatmapWrapRef.current.clientHeight - spotRow.clientHeight) / 2,
    );
  }, [spotStrike, rows.length, dates.length]);

  return (
    <section className={`panel heatmap-panel ${regimeClass}`}>
      <div className="panel-heading">
        <div>
          <p className="heatmap-eyebrow">Exposure matrix</p>
          <h3>{title}</h3>
        </div>
      </div>

      {rows.length === 0 || dates.length === 0 ? (
        <p className="status-text">No heatmap data available.</p>
      ) : (
        <>
          <div className="heatmap-wrap" ref={heatmapWrapRef}>
            <table className="heatmap-table" aria-label={title}>
            <thead>
              <tr>
                <th>Strike</th>
                {dates.map((day) => (
                  <th key={day}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSpotRow = spotStrike !== null && Number(row.strike) === Number(spotStrike);
                return (
                <tr
                  key={row.strike}
                  className={isSpotRow ? 'heatmap-row-spot' : ''}
                  data-heatmap-spot={isSpotRow ? 'true' : undefined}
                >
                  <td className={`heatmap-strike${isSpotRow ? ' heatmap-strike-spot' : ''}`}>
                    {isSpotRow ? <span className="heatmap-spot-arrow">▶</span> : null}
                    {formatPrice(row.strike)}
                    {isSpotRow ? <span className="heatmap-spot-tag">SPOT</span> : null}
                  </td>
                  {dates.map((day) => {
                    const value = row.values?.[day] ?? 0;
                    const isMax =
                      maxCell &&
                      maxCell.date === day &&
                      Number(maxCell.strike) === Number(row.strike) &&
                      Number(maxCell.value) === Number(value);

                    return (
                      <td
                        key={`${row.strike}-${day}`}
                        className={`heatmap-cell ${value > 0 ? 'heatmap-cell-positive' : value < 0 ? 'heatmap-cell-negative' : 'heatmap-cell-neutral'}${isMax ? ' heatmap-cell-max' : ''}${isSpotRow ? ' heatmap-cell-spot-row' : ''}`}
                        style={{
                          background: isMax ? 'linear-gradient(135deg, #6d28d9, #9333ea)' : cellColor(value, maxAbs, isLightTheme),
                        }}
                        title={`${day} @ ${row.strike}: ${value.toFixed(4)}${tooltipSuffix}`}
                      >
                        {formatCellValue(value, scale, suffix)}
                      </td>
                    );
                  })}
                </tr>
              )})}
            </tbody>
            </table>
          </div>
          <div className="heatmap-legend" aria-label="Heatmap color legend">
          <span className="heatmap-legend-title">Color meaning</span>
          <span className="heatmap-legend-item">
            <span className="heatmap-legend-swatch heatmap-legend-swatch--positive" />
            Positive exposure
          </span>
          <span className="heatmap-legend-item">
            <span className="heatmap-legend-swatch heatmap-legend-swatch--negative" />
            Negative exposure
          </span>
          <span className="heatmap-legend-item">
            <span className="heatmap-legend-swatch heatmap-legend-swatch--neutral" />
            Near zero
          </span>
          <span className="heatmap-legend-note">Brighter colors indicate greater magnitude.</span>
          {maxCell ? (
            <span className="heatmap-key-level">
              <i />
              {peakLabel} {formatPrice(maxCell.strike)} · {maxCell.date} · {formatCellValue(maxCell.value, scale, suffix)}
            </span>
          ) : null}
          <div className="heatmap-scale" aria-hidden="true">
            <span>Negative</span>
            <i />
            <span>Positive</span>
          </div>
          </div>
        </>
      )}
    </section>
  );
}
