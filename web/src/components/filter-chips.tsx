export interface Chip {
  id: string;
  label: string;
  count?: number;
}

export function FilterChips({ chips, value, onChange, extra }: { chips: Chip[]; value: string; onChange(id: string): void; extra?: React.ReactNode }) {
  return (
    <div className="filters" role="toolbar" aria-label="Filters">
      {chips.map((c) => (
        <button key={c.id} type="button" className={`f${value === c.id ? " on" : ""}`} aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
          {c.label}
          {c.count !== undefined ? <span className="fc">{c.count}</span> : null}
        </button>
      ))}
      {extra}
    </div>
  );
}
