import { formatPrice } from '../lib/format';

function zoneLabel(zone) {
  if (!zone) {
    return '-';
  }
  return `${formatPrice(zone.low)} - ${formatPrice(zone.high)}`;
}

function spreadLabel(spread) {
  if (!spread) {
    return '-';
  }
  return `${spread.type === 'call_spread' ? 'Call' : 'Put'} spread ${formatPrice(spread.lower)} / ${formatPrice(spread.upper)}`;
}

export default function TraderLevelsPanel({ gamma }) {
  const levels = gamma?.trade_levels || {};
  const spreads = levels?.suggested_spread_ranges || [];

  const entries = [
    { label: 'Calls Above', value: formatPrice(levels.calls_above_level) },
    { label: 'Puts Below', value: formatPrice(levels.puts_below_level) },
    { label: 'Major Support Zone', value: zoneLabel(levels.major_support_zone) },
    { label: 'Major Resistance Zone', value: zoneLabel(levels.major_resistance_zone) },
    { label: 'Pin / Magnet Zone', value: zoneLabel(levels.pin_magnet_zone) },
    { label: 'High-Risk Fast-Move Zone', value: zoneLabel(levels.fast_move_zone) },
    {
      label: 'Upside Targets',
      value: (levels.upside_targets || []).map((value) => formatPrice(value)).join(', ') || '-',
    },
    {
      label: 'Downside Targets',
      value: (levels.downside_targets || []).map((value) => formatPrice(value)).join(', ') || '-',
    },
    { label: 'Suggested Spread 1', value: spreadLabel(spreads[0]) },
    { label: 'Suggested Spread 2', value: spreadLabel(spreads[1]) },
  ];

  return (
    <section className="panel analysis-panel">
      <div className="panel-heading">
        <h3>Trader Levels / Actionable Structure</h3>
      </div>
      <div className="analysis-key-grid">
        {entries.map((entry) => (
          <article key={entry.label} className="analysis-key-card">
            <p className="analysis-key-label">{entry.label}</p>
            <p className="analysis-key-value">{entry.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
