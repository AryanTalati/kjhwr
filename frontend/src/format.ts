const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

export const mw = (v: number | null | undefined) => (v == null ? "–" : `${nf.format(v)} MW`);

export const signedMw = (v: number | null | undefined) =>
  v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf.format(Math.abs(v))} MW`;

export const num = (v: number | null | undefined) => (v == null ? "–" : nf.format(v));

/** Compact axis ticks: 12000 -> 12k, -2500 -> −2.5k */
export const tick = (v: number) => {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}${+(a / 1000).toFixed(1)}k`;
  return `${sign}${a}`;
};

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const shiftDate = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const londonTime = (iso: string | null) =>
  iso == null
    ? "–"
    : new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
