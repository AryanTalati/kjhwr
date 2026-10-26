import { useEffect, useState } from "react";

/** Chart colours resolved from the CSS custom properties, so SVG marks follow light/dark mode. */
export interface ChartTheme {
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  actual: string;
  forecast: string;
  wash: string;
}

const read = (): ChartTheme => {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    surface: v("--surface-1"),
    ink: v("--text-primary"),
    inkSecondary: v("--text-secondary"),
    muted: v("--text-muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    actual: v("--series-1"),
    forecast: v("--series-2"),
    wash: v("--wash"),
  };
};

export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(read());
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return theme;
}

/** True on phone-width screens, used to thin out axis ticks. */
export function useNarrow(maxWidth = 600): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setNarrow(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return narrow;
}
