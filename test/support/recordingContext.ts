/**
 * A hand-rolled recording stub for `CanvasRenderingContext2D` (§3.1 of
 * `.docs/remediation-plan.md`). No jsdom, no canvas package — consistent with
 * the project's zero-runtime-dependency rule. Implements exactly the API
 * surface `src/render/views.ts` and `src/render/palette.ts` actually call
 * (traced by grepping every `ctx.*` usage), recording each call so a test can
 * assert on what was drawn and where, without a real canvas anywhere.
 */

/** One recorded method call: its name and the arguments it was called with. */
export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

/** A recording context plus the call log it appends to. */
export interface RecordingContext {
  readonly ctx: CanvasRenderingContext2D;
  readonly calls: readonly RecordedCall[];
}

/** Creates a fresh recording context and its call log. */
export function createRecordingContext(): RecordingContext {
  const calls: RecordedCall[] = [];
  const record = (method: string, args: readonly unknown[]): void => {
    calls.push({ method, args });
  };

  const stub = {
    // Stateful properties every real CanvasRenderingContext2D exposes; views
    // only ever write these, never read them back, so a plain writable field
    // is enough to satisfy the type without simulating canvas state machinery.
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",

    save(): void {
      record("save", []);
    },
    restore(): void {
      record("restore", []);
    },
    beginPath(): void {
      record("beginPath", []);
    },
    clip(): void {
      record("clip", []);
    },
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void {
      record("arc", [x, y, radius, startAngle, endAngle]);
    },
    moveTo(x: number, y: number): void {
      record("moveTo", [x, y]);
    },
    lineTo(x: number, y: number): void {
      record("lineTo", [x, y]);
    },
    stroke(): void {
      record("stroke", []);
    },
    fill(): void {
      record("fill", []);
    },
    fillRect(x: number, y: number, width: number, height: number): void {
      record("fillRect", [x, y, width, height]);
    },
    strokeRect(x: number, y: number, width: number, height: number): void {
      record("strokeRect", [x, y, width, height]);
    },
    fillText(text: string, x: number, y: number): void {
      record("fillText", [text, x, y]);
    },
    setLineDash(segments: readonly number[]): void {
      record("setLineDash", [segments]);
    },
  };

  return { ctx: stub as unknown as CanvasRenderingContext2D, calls };
}
