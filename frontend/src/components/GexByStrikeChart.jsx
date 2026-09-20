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

export default function GexByStrikeChart({
  title,
  data,
  valueKey,
  valueLabel,
  spotPrice,
  keyLevels,
  showLevelOverlays = false,
}) {
  const sorted = [...(data || [])].sort((a, b) => a.strike - b.strike);
  const values = sorted.map((entry) => Number(entry[valueKey]) || 0);
  const positivePeak = values.length ? Math.max(...values) : 0;
  const negativePeak = values.length ? Math.min(...values) : 0;
  const unit = valueKey === 'gex_bn' ? 'Bn' : valueKey === 'delta_m' ? 'K' : 'M';

  return (
    <section className="panel chart-panel profile-chart-card">
      <div className="profile-chart-header">
        <div>
          <p className="profile-chart-eyebrow">Exposure by strike</p>
          <h3>{title}</h3>
        </div>
        <span className="profile-chart-unit">{unit}</span>
      </div>
      <div className="profile-chart-meta">
        <span><i className="profile-dot profile-dot--positive" /> Positive {defaultFormatter(positivePeak, valueKey)}</span>
        <span><i className="profile-dot profile-dot--negative" /> Negative {defaultFormatter(negativePeak, valueKey)}</span>
        <span>{sorted.length} strikes</span>
      </div>

      <ResponsiveContainer width="100%" height={560}>
        <BarChart layout="vertical" data={sorted} margin={{ left: 18, right: 28, top: 14, bottom: 18 }} barCategoryGap="2%">
          <CartesianGrid horizontal={false} stroke="#26334d" strokeDasharray="2 4" />
          <XAxis type="number" stroke="#93a2bf" tickFormatter={(value) => defaultFormatter(value, valueKey)} />
          <YAxis
            type="number"
            dataKey="strike"
            stroke="#93a2bf"
            width={66}
            reversed
            tickFormatter={(value) => formatPrice(value)}
            domain={['dataMin', 'dataMax']}
          />

          <Bar dataKey={valueKey} barSize={12} radius={[0, 5, 5, 0]}>
            {sorted.map((entry) => (
              <Cell key={`cell-${title}-${entry.strike}`} fill={entry[valueKey] >= 0 ? '#2dd4bf' : '#f472b6'} fillOpacity={0.9} />
            ))}
          </Bar>

          <ReferenceLine x={0} stroke="#dbeafe" strokeOpacity={0.7} />

          <Tooltip
            formatter={(value) => [defaultFormatter(value, valueKey), valueLabel]}
            labelFormatter={(value) => `Strike ${formatPrice(value)}`}
            contentStyle={{
              backgroundColor: '#141a27',
              border: '1px solid #4b638d',
              borderRadius: 8,
              color: '#f8fbff',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.32)',
            }}
            labelStyle={{ color: '#dbeafe', fontWeight: 700 }}
            itemStyle={{ color: '#f8fbff' }}
          />

          {spotPrice ? (
            <ReferenceLine
              y={spotPrice}
              stroke="#22c55e"
              strokeDasharray="6 3"
              label={{ value: `Spot ${formatPrice(spotPrice)}`, fill: '#22c55e', position: 'insideRight' }}
            />
          ) : null}

          {showLevelOverlays && keyLevels?.call_wall ? (
            <ReferenceLine
              y={keyLevels.call_wall}
              stroke="#60a5fa"
              strokeDasharray="5 3"
              label={{ value: `Call Wall ${formatPrice(keyLevels.call_wall)}`, fill: '#93c5fd', position: 'insideLeft' }}
            />
          ) : null}

          {showLevelOverlays && keyLevels?.put_wall ? (
            <ReferenceLine
              y={keyLevels.put_wall}
              stroke="#fca5a5"
              strokeDasharray="5 3"
              label={{ value: `Put Wall ${formatPrice(keyLevels.put_wall)}`, fill: '#fca5a5', position: 'insideLeft' }}
            />
          ) : null}

          {showLevelOverlays && keyLevels?.gamma_flip ? (
            <ReferenceLine
              y={keyLevels.gamma_flip}
              stroke="#fbbf24"
              strokeDasharray="4 2"
              label={{ value: `Gamma Flip ${formatPrice(keyLevels.gamma_flip)}`, fill: '#fbbf24', position: 'insideLeft' }}
            />
          ) : null}

        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
