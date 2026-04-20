import { useGardenOffscreen } from '../hooks/useGardenOffscreen';
import { useViewMoving } from '../hooks/useViewMoving';
import { useGardenStore } from '../store/gardenStore';
import { useUiStore } from '../store/uiStore';

interface Props {
  canvasWidth: number;
  canvasHeight: number;
}

export function ReturnToGarden({ canvasWidth, canvasHeight }: Props) {
  const offscreen = useGardenOffscreen(canvasWidth, canvasHeight);
  const moving = useViewMoving();
  const visible = offscreen && !moving;

  const handleClick = () => {
    const { widthFt, heightFt } = useGardenStore.getState().garden;
    const { zoom, setPan } = useUiStore.getState();
    const gardenW = widthFt * zoom;
    const gardenH = heightFt * zoom;
    setPan((canvasWidth - gardenW) / 2, (canvasHeight - gardenH) / 2);
  };

  return (
    <button
      onClick={handleClick}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        padding: '8px 16px',
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(0, 0, 0, 0.6)',
        background: 'rgba(255, 255, 255, 0.7)',
        border: '1px solid rgba(0, 0, 0, 0.2)',
        borderRadius: 4,
        cursor: 'pointer',
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transition: visible ? 'opacity 0.3s ease-in 0.2s' : 'opacity 0.15s ease-out',
        zIndex: 10,
      }}
    >
      Return to garden
    </button>
  );
}
