export default function TradeSetupsPanel({ setups }) {
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
    <section className="panel analysis-panel">
      <div className="panel-heading">
        <h3>Deterministic Trade Ideas</h3>
      </div>

      {rows.length === 0 ? (
        <p className="status-text">No trade setup suggestions available for current data.</p>
      ) : (
        <div className="setups-grid">
          {rows.map((setup) => (
            <article className={`setup-card ${getBiasClass(setup.bias)}`} key={setup.title}>
              <p className="setup-title">{setup.title}</p>
              <p className="setup-line setup-line-trade"><strong>Trade Idea:</strong> {setup.exact_trade}</p>
              <p className="setup-line"><strong>Bias:</strong> {setup.bias}</p>
              <p className="setup-line"><strong>Trigger:</strong> {setup.trigger}</p>
              <p className="setup-line"><strong>Thesis:</strong> {setup.thesis}</p>
              <p className="setup-line"><strong>Risk:</strong> {setup.risk}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
