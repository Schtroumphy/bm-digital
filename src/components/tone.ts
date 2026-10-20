import type { CSSProperties } from 'react';

/** Family hues (OKLCH). */
export const HUE = { rev: 150, dep: 38, epa: 300, inv: 250, obj: 190, cash: 85 } as const;

export function tone(h: number) {
  return {
    bg: `oklch(0.968 0.028 ${h})`,
    line: `oklch(0.87 0.065 ${h})`,
    base: `oklch(0.72 0.13 ${h})`,
    ink: `oklch(0.36 0.09 ${h})`,
    soft: `oklch(0.93 0.05 ${h})`,
  };
}

/** Exposes a tone as CSS variables (--t-bg, --t-line, --t-base, --t-ink, --t-soft) for the subtree. */
export function toneVars(h: number, extra?: CSSProperties): CSSProperties {
  const t = tone(h);
  return { '--t-bg': t.bg, '--t-line': t.line, '--t-base': t.base, '--t-ink': t.ink, '--t-soft': t.soft, ...extra } as CSSProperties;
}

export const GOOD = 'oklch(0.5 0.12 150)';
export const BAD = 'oklch(0.54 0.18 25)';
export const MUTED = 'rgba(32,30,29,.4)';
export const gapColor = (g: number | null) => (g === null ? MUTED : g >= 0 ? GOOD : BAD);
