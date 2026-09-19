export default function SummaryCards({ cards }) {
  return (
    <section className="cards-grid">
      {cards.map((card) => (
        <article key={card.label} className="card">
          <p className="card-label">{card.label}</p>
          <p className="card-value">{card.value}</p>
          {card.note ? <p className="card-note">{card.note}</p> : null}
        </article>
      ))}
    </section>
  );
}
