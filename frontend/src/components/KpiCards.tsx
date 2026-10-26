import type { Analysis } from "../api";
import { mw, signedMw } from "../format";

export function KpiCards({ analysis, loading }: { analysis: Analysis | null; loading: boolean }) {
  const s = analysis?.summary;
  const b = analysis?.buffer;
  const bias = s?.bias ?? null;
  const biasNote =
    bias == null ? "" : bias < 0 ? "Forecast too high on average" : bias > 0 ? "Forecast too low on average" : "Unbiased";
  return (
    <div className={loading ? "kpis stale" : "kpis"}>
      <article className="kpi kpi-hero">
        <h3>Recommended buffer</h3>
        <p className="kpi-value">{mw(b?.mw)}</p>
        <p className="kpi-note">{b?.sentence ?? " "}</p>
      </article>
      <article className="kpi">
        <h3>Mean absolute error</h3>
        <p className="kpi-value">{mw(s?.mae)}</p>
        <p className="kpi-note">Typical miss per hour</p>
      </article>
      <article className="kpi">
        <h3>RMSE</h3>
        <p className="kpi-value">{mw(s?.rmse)}</p>
        <p className="kpi-note">Weights large misses more</p>
      </article>
      <article className="kpi">
        <h3>Bias (actual − forecast)</h3>
        <p className="kpi-value">{signedMw(bias)}</p>
        <p className="kpi-note">{biasNote}</p>
      </article>
    </div>
  );
}
