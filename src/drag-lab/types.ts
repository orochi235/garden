// src/drag-lab/types.ts

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ContainerShape = 'rectangle' | 'circle';

export interface LabItem {
  id: string;
  label: string;
  radiusFt: number;
  color: string;
  x: number;
  y: number;
  cultivarId?: string;
}

export interface DragFeedback {
  render(ctx: CanvasRenderingContext2D, bounds: Rect): void;
  /** Which circle to hide: 'ghost' (cursor-following) or 'preview' (strategy placement). Default: 'ghost'. */
  hide?: 'ghost' | 'preview';
}

export interface DropResult {
  item: LabItem;
  state: unknown;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'slider' | 'dropdown' | 'checkbox';
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  default: number | string | boolean;
}

export interface LayoutStrategy {
  name: string;
  render(ctx: CanvasRenderingContext2D, bounds: Rect, shape: ContainerShape, items: LabItem[], config: Record<string, unknown>): void;
  onDragOver(bounds: Rect, shape: ContainerShape, pos: Point, items: LabItem[], config: Record<string, unknown>): DragFeedback | null;
  onDrop(bounds: Rect, shape: ContainerShape, pos: Point, item: LabItem, items: LabItem[], config: Record<string, unknown>): DropResult;
  defaultConfig(): Record<string, unknown>;
  configSchema(): ConfigField[];
}

export interface WorkspaceState {
  id: string;
  strategyName: string;
  config: Record<string, unknown>;
  containerWidth: number;
  containerHeight: number;
  containerShape: ContainerShape;
  items: LabItem[];
  paletteMode: 'generic' | 'cultivar';
  genericRadius: number;
  expandToFill: boolean;
}

export interface SavedState {
  name: string;
  timestamp: number;
  workspace: WorkspaceState;
}
