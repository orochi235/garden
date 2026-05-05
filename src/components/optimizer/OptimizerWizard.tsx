import { createPortal } from 'react-dom';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import type { OptimizationCandidate } from '../../optimizer';
import styles from '../../styles/CollectionEditor.module.css';

interface Props {
  structureId: string;
  onClose: () => void;
}

/**
 * Modal that shows up to three optimizer candidate cards side-by-side.
 * Triggered from the OptimizePanel "Open in Wizard" button.
 */
export function OptimizerWizard({ structureId, onClose }: Props) {
  const optimizerResult = useUiStore((s) => s.optimizerResult);
  const selectedCandidate = useUiStore((s) => s.optimizerSelectedCandidate);
  const setSelectedCandidate = useUiStore((s) => s.setOptimizerSelectedCandidate);
  const clearOptimizerResult = useUiStore((s) => s.clearOptimizerResult);
  const applyOptimizerResult = useGardenStore((s) => s.applyOptimizerResult);

  function handleApply(candidate: OptimizationCandidate) {
    applyOptimizerResult(structureId, candidate);
    clearOptimizerResult();
    onClose();
  }

  const candidates = optimizerResult?.candidates ?? [];

  return createPortal(
    <div
      className={styles.backdrop}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--theme-panel-bg, #1f2123)',
          padding: 24,
          borderRadius: 8,
          maxWidth: 800,
          width: '90vw',
          color: 'var(--theme-text, #eee)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <strong style={{ fontSize: 16 }}>Optimizer Wizard</strong>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >×</button>
        </div>

        {candidates.length === 0 ? (
          <p style={{ color: '#888' }}>No optimizer results available. Run the optimizer from the sidebar first.</p>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {candidates.map((c, i) => (
              <div
                key={i}
                onClick={() => setSelectedCandidate(i)}
                style={{
                  flex: '1 1 200px',
                  border: selectedCandidate === i ? '2px solid #4a90e2' : '2px solid #444',
                  borderRadius: 6,
                  padding: 12,
                  cursor: 'pointer',
                  background: selectedCandidate === i ? 'rgba(74,144,226,0.1)' : 'rgba(255,255,255,0.03)',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Candidate {i + 1}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                  Score: {c.score.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
                  {c.placements.length} plants
                </div>
                {c.reason && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{c.reason}</div>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleApply(c); }}
                  style={{
                    width: '100%',
                    background: '#4a90e2',
                    color: '#fff',
                    border: 'none',
                    padding: '6px 0',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            className={styles.button}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
