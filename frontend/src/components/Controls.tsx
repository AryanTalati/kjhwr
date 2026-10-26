import type { Meta, Mode, SelectionParams } from "../api";

interface Props {
  meta: Meta;
  selection: SelectionParams;
  onSelection: (s: SelectionParams) => void;
  start: string;
  end: string;
  onWindow: (start: string, end: string) => void;
  bufferQ: number;
  onBufferQ: (q: number) => void;
}

const BUFFER_OPTIONS = [
  { q: 0.2, label: "80% (P20)" },
  { q: 0.1, label: "90% (P10)" },
  { q: 0.05, label: "95% (P5)" },
];

const DAY_OPTIONS = [
  { d: 0, label: "Delivery day (D)" },
  { d: 1, label: "Day before (D-1)" },
  { d: 2, label: "Two days before (D-2)" },
];

export function Controls({ meta, selection, onSelection, start, end, onWindow, bufferQ, onBufferQ }: Props) {
  const set = (patch: Partial<SelectionParams>) => onSelection({ ...selection, ...patch });
  const isDefaultWindow = start === meta.default_start && end === meta.default_end;

  return (
    <div className="controls" role="group" aria-label="Analysis controls">
      <fieldset>
        <legend>Delivery days</legend>
        <div className="inline">
          <input
            type="date"
            aria-label="From"
            value={start}
            min={meta.data_min_date}
            max={end}
            onChange={(e) => e.target.value && onWindow(e.target.value, end)}
          />
          <span className="muted">to</span>
          <input
            type="date"
            aria-label="To"
            value={end}
            min={start}
            max={meta.data_max_date}
            onChange={(e) => e.target.value && onWindow(start, e.target.value)}
          />
          {!isDefaultWindow && (
            <button type="button" className="ghost" onClick={() => onWindow(meta.default_start, meta.default_end)}>
              Reset
            </button>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend>Forecast used</legend>
        <div className="segmented" role="radiogroup">
          {(["cutoff", "horizon"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={selection.mode === m}
              className={selection.mode === m ? "on" : ""}
              onClick={() => set({ mode: m })}
            >
              {m === "cutoff" ? "Decision cutoff" : "Fixed horizon"}
            </button>
          ))}
        </div>
      </fieldset>

      {selection.mode === "cutoff" ? (
        <fieldset>
          <legend>Latest run published before</legend>
          <div className="inline">
            <input
              type="time"
              aria-label="Cutoff time (Europe/London)"
              step={900}
              value={selection.cutoffTime}
              onChange={(e) => e.target.value && set({ cutoffTime: e.target.value.slice(0, 5) })}
            />
            <span className="muted">London, on</span>
            <select
              aria-label="Decision day"
              value={selection.daysBefore}
              onChange={(e) => set({ daysBefore: Number(e.target.value) })}
            >
              {DAY_OPTIONS.map((o) => (
                <option key={o.d} value={o.d}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      ) : (
        <fieldset className="grow">
          <legend>
            Published at least <strong>{selection.horizonHours} h</strong> before target
          </legend>
          <input
            type="range"
            aria-label="Forecast horizon in hours"
            min={1}
            max={60}
            step={1}
            value={selection.horizonHours}
            onChange={(e) => set({ horizonHours: Number(e.target.value) })}
          />
        </fieldset>
      )}

      <fieldset>
        <legend>Buffer covers</legend>
        <select aria-label="Buffer confidence" value={bufferQ} onChange={(e) => onBufferQ(Number(e.target.value))}>
          {BUFFER_OPTIONS.map((o) => (
            <option key={o.q} value={o.q}>
              {o.label}
            </option>
          ))}
        </select>
      </fieldset>
    </div>
  );
}
