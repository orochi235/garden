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
 * canvas context. Drags whose preview is rendered by an existing legacy layer
 * (e.g. seed-fill-tray, which is drawn by `seedling-fill-preview`) may leave
 * `renderPreview` as a no-op while the migration is still in progress.
 *
 * See `docs/TODO.md` "Repeatable putative-drag framework" for the migration
 * plan and Phase 2 follow-ups (palette → garden, move, resize, plot, area-select).
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
   * Draw the ghost preview into the canvas context. The context has whatever
   * world transform the canvas's `RenderLayer` pipeline applies.
   * Drags that rely on a legacy preview layer can leave this as a no-op.
   */
  renderPreview(ctx: CanvasRenderingContext2D, putative: TPutative, view: { x: number; y: number; scale: number }): void;
  /** Apply the putative to persistent state. Called on pointerup. */
  commit(putative: TPutative): void;
  /**
   * Optional side-effect hook fired whenever the controller writes a new
   * putative to the slot. Drags that need to keep legacy slots in sync (e.g.
   * mirroring into `seedFillPreview` so the legacy fill-preview layer keeps
   * rendering during Phase 1 coexistence) can implement it. Must remain free
   * of persistent-state mutations — preview slots only.
   */
  onPutativeChange?(putative: TPutative | null): void;
}

export type DragRegistry = Record<string, Drag<unknown, unknown>>;

/** What the controller writes into `uiStore.dragPreview`. */
export interface ActiveDragPreview {
  kind: string;
  putative: unknown;
}
