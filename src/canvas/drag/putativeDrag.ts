import type { DrawCommand } from '../util/weaselLocal';

/**
 * Putative-drag framework — Phase 1.
 *
 * Every drag operation that wants a ghost preview implements this interface.
 * The controller (`useDragController`) calls `read` → `compute` on every
 * pointer / key change, writes the resulting putative into `uiStore.dragPreview`,
 * then `commit`s on pointerup (or clears the slot on escape / pointercancel).
 *
 * `compute` MUST be pure — no store mutation, no DOM side-effects. Only
 * `commit` is allowed to mutate persistent state.
 *
 * `renderPreview` is invoked by `dragPreviewLayer`. It receives the world-coord
 * canvas context and returns world-coord DrawCommands.
 *
 * See `docs/TODO.md` "Repeatable putative-drag framework" for the migration
 * history.
 */
export interface DragModifiers {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface DragViewport {
  /** Canvas container element so the drag can compute screen→world from its rect. */
  container: HTMLElement;
  /** World-space view: pan (x, y) and px-per-world-unit scale. */
  view: { x: number; y: number; scale: number };
}

export interface DragPointerSample {
  clientX: number;
  clientY: number;
  modifiers: DragModifiers;
}

export interface Drag<TInput, TPutative> {
  /** Discriminator used to look the drag up in the registry. */
  readonly kind: string;
  /** Map raw pointer + modifier + viewport state into a domain-specific input. */
  read(sample: DragPointerSample, viewport: DragViewport): TInput;
  /** Pure: derive the putative result from the input. No side effects. */
  compute(input: TInput): TPutative | null;
  /**
   * Emit DrawCommands for the ghost preview. Called by `dragPreviewLayer` inside
   * a world-space transform group — return world-coord commands.
   */
  renderPreview(putative: TPutative, view: { x: number; y: number; scale: number }): DrawCommand[];
  /** Apply the putative to persistent state. Called on pointerup. */
  commit(putative: TPutative): void;
  /**
   * Optional side-effect hook fired whenever the controller writes a new
   * putative to the slot. No current drag needs this, but it remains in the
   * interface as an escape hatch for drags that need to coordinate with
   * non-rendering side state. Must remain free of persistent-state mutations.
   */
  onPutativeChange?(putative: TPutative | null): void;
}

export type DragRegistry = Record<string, Drag<unknown, unknown>>;

/** What the controller writes into `uiStore.dragPreview`. */
export interface ActiveDragPreview {
  kind: string;
  putative: unknown;
}
