import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useState } from 'react';

import { formatNotionalBn, formatPrice, formatWithCommas } from '../lib/format';

function defaultFormatter(value, valueKey) {
  if (valueKey === 'gex_bn') {
    return formatNotionalBn(value);
  }
  if (valueKey === 'delta_m') {
    return `${(Number(value) * 1000).toFixed(1)}K`;
  }
  return formatWithCommas(Number(value).toFixed(2));
}

function ProfileTooltip({ active, payload, label, valueKey, valueLabel }) {
  if (!active || !payload?.length) {
    return null;
  }

  const value = payload[0].value;

  return (
    <div className="profile-tooltip">
      <span className="profile-tooltip-label">Strike {formatPrice(label)}</span>
      <strong>{defaultFormatter(value, valueKey)}</strong>
      <small>{valueLabel}</small>
    </div>
  );
}

export default function GexByStrikeChart({
  title,
  data,
  valueKey,
  valueLabel,
  spotPrice,
  keyLevels,
  showLevelOverlays = false,
}) {
  const [showAllStrikes, setShowAllStrikes] = useState(false);
  const sorted = [...(data || [])].sort((a, b) => a.strike - b.strike);
  // Build the focused window around the actual structure, not a fixed number
  // of rows. This keeps the spot, walls, and gamma flip visible across ETFs
  // and index chains with very different strike spacing.
  const numericSpot = Number(spotPrice);
  const criticalLevels = [
    numericSpot,
    keyLevels?.call_wall,
    keyLevels?.put_wall,
    keyLevels?.gamma_flip,
  ]
    .filter((level) => level !== null && level !== undefined && level !== '')
    .map(Number)
    .filter(Number.isFinite);
  const strikeSteps = sorted
    .map((entry, index) => index > 0 ? Number(entry.strike) - Number(sorted[index - 1].strike) : null)
    .filter((step) => step > 0)
    .sort((a, b) => a - b);
  const strikeStep = strikeSteps.length
    ? strikeSteps[Math.floor(strikeSteps.length / 2)]
    : 1;
  const structurePadding = Math.max(strikeStep * 6, Math.abs(numericSpot) * 0.01);
  const structureLow = criticalLevels.length ? Math.min(...criticalLevels) - structurePadding : null;
  const structureHigh = criticalLevels.length ? Math.max(...criticalLevels) + structurePadding : null;
  const focused = structureLow !== null && structureHigh !== null
    ? sorted.filter((entry) => Number(entry.strike) >= structureLow && Number(entry.strike) <= structureHigh)
    : sorted;
  const canFocus = Boolean(spotPrice) && focused.length >= 12 && focused.length < sorted.length;
  const chartData = canFocus && !showAllStrikes ? focused : sorted;
  const values = chartData.map((entry) => Number(entry[valueKey]) || 0);
  const positivePeak = values.length ? Math.max(...values) : 0;
  const negativePeak = values.length ? Math.min(...values) : 0;
  const unit = valueKey === 'gex_bn' ? 'Bn' : valueKey === 'delta_m' ? 'K' : 'M';
  const chartId = `profile-${valueKey}`;

  return (
    <section className="panel chart-panel profile-chart-card">
      <div className="profile-chart-header">
        <div>
          <p className="profile-chart-eyebrow">Exposure by strike</p>
          <h3>{title}</h3>
        </div>
        <div className="profile-chart-header-actions">
          {canFocus ? (
            <button
              type="button"
              className="profile-chart-toggle"
              onClick={() => setShowAllStrikes((current) => !current)}
              aria-pressed={showAllStrikes}
            >
              {showAllStrikes ? 'Focus spot' : 'Show all'}
            </button>
          ) : null}
          <span className="profile-chart-unit">{unit}</span>
        </div>
      </div>
      <div className="profile-chart-meta">
        <span><i className="profile-dot profile-dot--positive" /> Positive {defaultFormatter(positivePeak, valueKey)}</span>
        <span><i className="profile-dot profile-dot--negative" /> Negative {defaultFormatter(negativePeak, valueKey)}</span>
        <span>{chartData.length === sorted.length ? `${sorted.length} strikes` : `Focused ${chartData.length} of ${sorted.length} strikes`}</span>
      </div>

      <div className="profile-chart-plot">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ left: 12, right: 20, top: 18, bottom: 18 }}
            barCategoryGap="8%"
          >
            <defs>
              <linearGradient id={`${chartId}-positive`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--chart-positive-deep)" />
                <stop offset="100%" stopColor="var(--chart-positive)" />
              </linearGradient>
              <linearGradient id={`${chartId}-negative`} x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--chart-negative-deep)" />
                <stop offset="100%" stopColor="var(--chart-negative)" />
              </linearGradient>
            </defs>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="2 5" verticalPoints={[0]} />
            <XAxis
              type="number"
              stroke="var(--chart-axis)"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => defaultFormatter(value, valueKey)}
            />
          <YAxis
            type="number"
            dataKey="strike"
            stroke="var(--chart-axis)"
            width={66}
            reversed
            tickLine={false}
            axisLine={false}
            tickCount={8}
            tickFormatter={(value) => formatPrice(value)}
            domain={['dataMin', 'dataMax']}
          />

            <Bar
              dataKey={valueKey}
              barSize={14}
              radius={[0, 5, 5, 0]}
              minPointSize={2}
              animationDuration={650}
              animationEasing="ease-out"
              activeBar={{ fillOpacity: 1, stroke: 'var(--chart-active)', strokeWidth: 1 }}
            >
              {chartData.map((entry) => (
                <Cell
                  key={`cell-${title}-${entry.strike}`}
                  fill={`url(#${chartId}-${entry[valueKey] >= 0 ? 'positive' : 'negative'})`}
                />
              ))}
            </Bar>

            <ReferenceLine x={0} stroke="var(--chart-zero)" strokeWidth={1.5} />

            <Tooltip
              cursor={{ fill: 'var(--chart-hover)', opacity: 0.35 }}
              content={<ProfileTooltip valueKey={valueKey} valueLabel={valueLabel} />}
            />

            {spotPrice ? (
              <ReferenceLine
                y={spotPrice}
                stroke="var(--chart-spot)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
            ) : null}

            {showLevelOverlays && keyLevels?.call_wall ? (
              <ReferenceLine
                y={keyLevels.call_wall}
                stroke="var(--chart-call)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            ) : null}

            {showLevelOverlays && keyLevels?.put_wall ? (
              <ReferenceLine
                y={keyLevels.put_wall}
                stroke="var(--chart-put)"
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            ) : null}

            {showLevelOverlays && keyLevels?.gamma_flip ? (
              <ReferenceLine
                y={keyLevels.gamma_flip}
                stroke="var(--chart-flip)"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            ) : null}

          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="profile-level-legend" aria-label="Chart reference levels">
        {spotPrice ? <span><i className="profile-level-swatch profile-level-swatch--spot" /> Spot {formatPrice(spotPrice)}</span> : null}
        {showLevelOverlays && keyLevels?.call_wall ? <span><i className="profile-level-swatch profile-level-swatch--call" /> Call Wall {formatPrice(keyLevels.call_wall)}</span> : null}
        {showLevelOverlays && keyLevels?.put_wall ? <span><i className="profile-level-swatch profile-level-swatch--put" /> Put Wall {formatPrice(keyLevels.put_wall)}</span> : null}
        {showLevelOverlays && keyLevels?.gamma_flip ? <span><i className="profile-level-swatch profile-level-swatch--flip" /> Gamma Flip {formatPrice(keyLevels.gamma_flip)}</span> : null}
      </div>
    </section>
  );
}
