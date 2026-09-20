function formatRegime(regime) {
  return String(regime || 'mixed_balanced')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function confirmationFor(setup) {
  if (setup.confirmation) {
    return setup.confirmation;
  }
  if (String(setup.bias).includes('neutral')) {
    return 'Require spot acceptance inside the range and stable implied volatility before treating the pin scenario as valid.';
  }
  if (String(setup.bias).includes('bullish')) {
    return 'Require acceptance beyond the call-side level; this snapshot has no order-flow classification to confirm aggressor direction.';
  }
  return 'Require acceptance beyond the put-side level; this snapshot has no order-flow classification to confirm aggressor direction.';
}

export default function TradeSetupsPanel({ setups, gammaRegime }) {
  const rows = setups || [];

  const getBiasClass = (bias) => {
    const normalized = String(bias || '').toLowerCase();
    if (normalized.includes('neutral')) {
      return 'setup-card--neutral';
    }
    if (normalized.includes('bearish')) {
      return 'setup-card--bearish';
    }
    if (normalized.includes('bullish')) {
      return 'setup-card--bullish';
    }
    if (normalized.includes('momentum')) {
      return 'setup-card--momentum';
    }
    return '';
  };

  return (
    <section className="panel analysis-panel setup-panel">
      <div className="panel-heading">
        <div>
          <p className="setup-eyebrow">Conditional scenario engine</p>
          <h3>Deterministic Trade Ideas</h3>
          <p className="setup-panel-note">Rules-based expressions around gamma concentration—not trade signals.</p>
        </div>
        <span className="setup-regime-pill">{formatRegime(gammaRegime)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="status-text">No trade setup suggestions available for current data.</p>
      ) : (
        <div className="setups-grid">
          {rows.map((setup, index) => (
            <article className={`setup-card ${getBiasClass(setup.bias)}`} key={setup.title}>
              <div className="setup-card-header">
                <span className="setup-index">0{index + 1}</span>
                <span className="setup-bias-pill">{String(setup.bias || 'conditional').replaceAll('_', ' ')}</span>
              </div>
              <h4 className="setup-title">{setup.title}</h4>
              <p className="setup-line setup-line-trade"><span>Trade expression</span>{setup.exact_trade}</p>
              <div className="setup-detail-grid">
                <p className="setup-line"><span>Trigger</span>{setup.trigger}</p>
                <p className="setup-line setup-line--confirmation"><span>Confirmation</span>{confirmationFor(setup)}</p>
                <p className="setup-line"><span>Thesis</span>{setup.thesis}</p>
                <p className="setup-line setup-line--risk"><span>Invalidation / risk</span>{setup.risk}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
