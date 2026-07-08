import type { PopulationStats } from "../core/stats.js";

/** Palette shared across the rendering layer. */
export const COLORS = {
  background: "#0b1020",
  panel: "#111a33",
  grid: "#1e2a4a",
  accent: "#818cf8",
  accentSoft: "#4f46e5",
  text: "#e5e7eb",
  muted: "#94a3b8",
  best: "#818cf8",
  average: "#38bdf8",
} as const;

/**
 * Hand-drawn fitness chart (PRD §9): best and average fitness per generation,
 * auto-scaled to the observed range. No charting library (PRD §1).
 */
export function drawFitnessChart(
  ctx: CanvasRenderingContext2D,
  history: readonly PopulationStats[],
  width: number,
  height: number,
): void {
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(0, 0, width, height);

  if (history.length < 2) {
    return;
  }

  const bests = history.map((s) => s.best);
  const averages = history.map((s) => s.average);
  const max = Math.max(...bests);
  const min = Math.min(...averages);
  const range = max - min || 1;
  const padding = 8;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const toX = (index: number): number => padding + (index / (history.length - 1)) * plotWidth;
  const toY = (value: number): number => padding + (1 - (value - min) / range) * plotHeight;

  drawSeries(ctx, averages, toX, toY, COLORS.average);
  drawSeries(ctx, bests, toX, toY, COLORS.best);

  ctx.fillStyle = COLORS.muted;
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText(`best ${max.toFixed(2)}`, padding, padding + 10);
}

function drawSeries(
  ctx: CanvasRenderingContext2D,
  values: readonly number[],
  toX: (index: number) => number,
  toY: (value: number) => number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = toX(index);
    const y = toY(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
