export default function AnalysisPanel({ title, notes, items = [] }) {
  return (
    <section className="panel analysis-panel">
      <div className="panel-heading">
        <h3>{title}</h3>
      </div>

      {items.length > 0 ? (
        <div className="analysis-key-grid">
          {items.map((item) => (
            <article key={item.label} className="analysis-key-card">
              <p className="analysis-key-label">{item.label}</p>
              <p className="analysis-key-value">{item.value}</p>
            </article>
          ))}
        </div>
      ) : null}

      {notes?.length ? (
        <ul className="analysis-list">
          {notes.map((note, index) => (
            <li key={`${title}-${index}`}>{note}</li>
          ))}
        </ul>
      ) : (
        <p className="status-text">No analysis notes available.</p>
      )}
    </section>
  );
}
