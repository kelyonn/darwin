/**
 * Shared visual language for the "specimen plate" rendering style: paper and
 * ink, a circular lens viewport per environment, radial leader-line
 * annotations, and a bottom-right inset panel (sparkline, CIAO heat map, or
 * archive heat map depending on the environment). Ported pixel-for-pixel from
 * the Claude Design handoff (`project-darwin-design-system/`).
 */

/** Page background. */
export const CREAM = "#efe9db";
/** Lens interior — a slightly lighter paper. */
export const CREAM_PANEL = "#f7f3e8";
/** Ink used for text, strokes, and neutral marks. */
export const INK = "#1c1b17";
/** Predator / "beats the objective" hue. */
export const MOSS = "#4a7c59";
/** Prey / "novelty" hue. */
export const AMBER = "#c9a15a";

const STAGE_WIDTH = 1180;
const STAGE_HEIGHT = 740;
const INSET_WIDTH = 176;
const INSET_HEIGHT = 156;
const INSET_MARGIN = 44;

/** The plate canvas dimensions every view draws into. */
export const PLATE = { width: STAGE_WIDTH, height: STAGE_HEIGHT } as const;

/** The bottom-right inset panel's rectangle, shared by every environment. */
export const INSET_RECT = {
  x: STAGE_WIDTH - INSET_WIDTH - INSET_MARGIN,
  y: STAGE_HEIGHT - INSET_HEIGHT - INSET_MARGIN,
  width: INSET_WIDTH,
  height: INSET_HEIGHT,
} as const;

/** Linear interpolation between two RGB triples. */
export function mix(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Maps a value in [0, 1] to amber → paper → moss, used by the CIAO and archive heat maps. */
export function heatColor(value: number): string {
  const t = Math.min(1, Math.max(0, value));
  const [r, g, b] =
    t < 0.5 ? mix([201, 161, 90], [214, 209, 193], t * 2) : mix([214, 209, 193], [74, 124, 89], (t - 0.5) * 2);
  return `rgb(${r},${g},${b})`;
}

/** A filled dot. */
export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A dot with a heading whisker — the ink-drawn agent marker used across every lens. */
export function inkAgent(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(heading) * 5, y + Math.sin(heading) * 5);
  ctx.lineTo(x + Math.cos(heading) * 15, y + Math.sin(heading) * 15);
  ctx.stroke();
}

/** A radial leader-line label pointing out from the lens rim at `angle`. */
export function annotate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  label: string,
  color: string,
): void {
  const x1 = cx + Math.cos(angle) * (radius - 10);
  const y1 = cy + Math.sin(angle) * (radius - 10);
  const x2 = cx + Math.cos(angle) * (radius + 46);
  const y2 = cy + Math.sin(angle) * (radius + 46);
  ctx.strokeStyle = "rgba(28,27,23,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  dot(ctx, x1, y1, 2.5, color);
  ctx.fillStyle = INK;
  ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textAlign = x2 < cx ? "right" : "left";
  ctx.fillText(label, x2 + (x2 < cx ? -6 : 6), y2 + 3);
  ctx.textAlign = "left";
}

/** The circular "field-guide plate" viewport every environment draws its content inside. */
export function drawLens(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.fillStyle = CREAM_PANEL;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(28,27,23,0.55)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = "rgba(28,27,23,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 14, 0, Math.PI * 2);
  ctx.stroke();
}

/** The bordered appendix box (bottom-right) holding a sparkline, CIAO plot, or archive heat map. */
export function drawInsetPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  caption: string,
): void {
  ctx.strokeStyle = "rgba(28,27,23,0.4)";
  ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  ctx.fillStyle = "rgba(28,27,23,0.55)";
  ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
  ctx.fillText(caption, x, y - 8);
}

/** Best/average fitness history, drawn as two overlaid lines inside an inset panel. */
export function drawSparkline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  bests: readonly number[],
  averages: readonly number[],
): void {
  if (bests.length < 2) {
    return;
  }
  const max = Math.max(...bests);
  const min = Math.min(...averages);
  const range = max - min || 1;
  const toX = (i: number, n: number): number => x + (i / (n - 1)) * width;
  const toY = (v: number): number => y + height - ((v - min) / range) * height;
  const drawSeries = (values: readonly number[], color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    values.forEach((v, i) => {
      const px = toX(i, values.length);
      const py = toY(v);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  drawSeries(averages, "rgba(201,161,90,0.85)");
  drawSeries(bests, "rgba(74,124,89,0.9)");
}
