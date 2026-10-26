import { useState, type ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  loading?: boolean;
  children: ReactNode;
}

/** Chart card with a chart/table toggle, so every value is reachable without hovering. */
export function Card({ title, subtitle, actions, legend, table, loading, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="card" aria-busy={loading}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        <div className="card-actions">
          {actions}
          <button type="button" className="ghost" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
      </header>
      {legend && !showTable && <div className="legend">{legend}</div>}
      <div className={loading ? "card-body stale" : "card-body"}>
        {showTable ? <div className="table-wrap">{table}</div> : children}
      </div>
    </section>
  );
}

export function LegendItem({ color, label, kind }: { color: string; label: string; kind: "line" | "rect" }) {
  return (
    <span className="legend-item">
      <span className={`key key-${kind}`} style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

export interface TipRow {
  color: string;
  label: string;
  value: string;
  kind?: "line" | "rect";
}

export function Tip({ title, rows, note }: { title: string; rows: TipRow[]; note?: string }) {
  return (
    <div className="tip">
      <div className="tip-title">{title}</div>
      {rows.map((r) => (
        <div className="tip-row" key={r.label}>
          <span className={`key key-${r.kind ?? "line"}`} style={{ background: r.color }} aria-hidden />
          <strong>{r.value}</strong>
          <span className="tip-label">{r.label}</span>
        </div>
      ))}
      {note && <div className="tip-note">{note}</div>}
    </div>
  );
}
