import { Card } from './Card';
import { MoveDemo, MOVE_DEMO_SOURCE } from './demos/MoveDemo';
import { ResizeDemo, RESIZE_DEMO_SOURCE } from './demos/ResizeDemo';
import { InsertDemo, INSERT_DEMO_SOURCE } from './demos/InsertDemo';
import { CloneDemo, CLONE_DEMO_SOURCE } from './demos/CloneDemo';

export function CanvasKitDemo() {
  return (
    <div className="ckd-root">
      <header className="ckd-header">
        <h1>canvas-kit demos</h1>
        <p>
          canvas-kit is a domain-agnostic toolkit of React hooks for building 2D
          drag-and-edit interactions on a canvas. Each card below shows one
          interaction hook driving a tiny in-memory adapter, with the source for
          that demo on the right.
        </p>
      </header>

      <Card
        title="Move"
        description="useMoveInteraction with a grid-snap behavior — drag any rectangle and watch it snap to the 20-unit grid."
        hint="Drag a rectangle."
        canvas={<MoveDemo />}
        source={MOVE_DEMO_SOURCE}
      />

      <Card
        title="Resize"
        description="useResizeInteraction — grab one of the four corner handles to resize the rectangle from the opposite anchor."
        hint="Drag a corner handle."
        canvas={<ResizeDemo />}
        source={RESIZE_DEMO_SOURCE}
      />

      <Card
        title="Insert"
        description="useInsertInteraction — drag on empty space to draw a new rectangle. Each gesture commits an InsertOp through the adapter."
        hint="Drag on empty space to draw."
        canvas={<InsertDemo />}
        source={INSERT_DEMO_SOURCE}
      />

      <Card
        title="Clone"
        description="useCloneInteraction with the cloneByAltDrag behavior — hold Alt and drag a rectangle to duplicate it at the drop point."
        hint="Hold Alt and drag a rectangle."
        canvas={<CloneDemo />}
        source={CLONE_DEMO_SOURCE}
      />
    </div>
  );
}
