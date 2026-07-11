/**
 * Minimal ambient declaration of the Node `process` surface the headless
 * scripts use. The project deliberately ships no `@types/node` (it would pull a
 * dependency and widen the browser build's global types); the headless runners
 * touch only these few members, so declaring them here keeps the tree dep-free
 * while staying fully type-checked.
 */
declare const process: {
  readonly argv: readonly string[];
  readonly version: string;
  readonly stdout: { write(text: string): void };
};
