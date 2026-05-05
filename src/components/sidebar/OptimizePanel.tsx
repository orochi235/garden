import { useState, useRef } from 'react';
import { getCultivar } from '../../model/cultivars';
import { useGardenStore } from '../../store/gardenStore';
import { useUiStore } from '../../store/uiStore';
import { runOptimizerForBed } from '../optimizer/runOptimizerForBed';
import type { RunHandle } from '../../optimizer';

interface Props {
  structureId: string;
}

export function OptimizePanel({ structureId }: Props) {
  const garden = useGardenStore((s) => s.garden);
  const applyOptimizerResult = useGardenStore((s) => s.applyOptimizerResult);
  const optimizerResult = useUiStore((s) => s.optimizerResult);
  const selectedCandidate = useUiStore((s) => s.optimizerSelectedCandidate);
  const setOptimizerResult = useUiStore((s) => s.setOptimizerResult);
  const setSelectedCandidate = useUiStore((s) => s.setOptimizerSelectedCandidate);
  const clearOptimizerResult = useUiStore((s) => s.clearOptimizerResult);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; candidate: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<RunHandle | null>(null);

  const structure = garden.structures.find((s) => s.id === structureId);
  if (!structure) return null;

  // Gather current plantings for this bed, grouped by cultivar
  const bedPlantings = garden.plantings.filter((p) => p.parentId === structureId);
  const cultivarCounts = new Map<string, number>();
  for (const p of bedPlantings) {
    cultivarCounts.set(p.cultivarId, (cultivarCounts.get(p.cultivarId) ?? 0) + 1);
  }

  const request = Array.from(cultivarCounts.entries()).map(([cultivarId, count]) => ({
    cultivar: getCultivar(cultivarId)!,
    count,
  })).filter((r) => r.cultivar != null);

  const canSolve = !running && request.length > 0;

  async function handleSolve() {
    setRunning(true);
    setError(null);
    clearOptimizerResult();
    setProgress({ phase: 'starting', candidate: 0 });

    const handle = runOptimizerForBed({
      bed: structure!,
      request,
      candidateCount: 3,
      onProgress: (phase, candidate) => setProgress({ phase, candidate }),
    });
    handleRef.current = handle;

    try {
      const result = await handle.promise;
      setOptimizerResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setProgress(null);
      handleRef.current = null;
    }
  }

  function handleCancel() {
    handleRef.current?.cancel();
  }

  function handleApply() {
    if (!optimizerResult) return;
    const candidate = optimizerResult.candidates[selectedCandidate];
    if (!candidate) return;
    applyOptimizerResult(structureId, candidate);
    clearOptimizerResult();
  }

  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--color-border, #ddd)' }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Optimize Layout</div>

      {request.length === 0 && (
        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
          Add plants to this bed to enable optimization.
        </div>
      )}

      {request.length > 0 && (
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          {request.map((r) => (
            <div key={r.cultivar.id}>
              {r.cultivar.name} × {r.count}
            </div>
          ))}
        </div>
      )}

      {running && progress && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
          Solving candidate {progress.candidate + 1}/3 ({progress.phase})…
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: 'red', marginBottom: 6 }}>Error: {error}</div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {!running ? (
          <button
            disabled={!canSolve}
            onClick={handleSolve}
            style={{ flex: 1, cursor: canSolve ? 'pointer' : 'default' }}
          >
            Solve
          </button>
        ) : (
          <button onClick={handleCancel} style={{ flex: 1, cursor: 'pointer' }}>
            Cancel
          </button>
        )}
      </div>

      {optimizerResult && optimizerResult.candidates.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Candidates</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {optimizerResult.candidates.map((c, i) => (
              <button
                key={i}
                onClick={() => setSelectedCandidate(i)}
                style={{
                  flex: 1,
                  fontWeight: selectedCandidate === i ? 700 : 400,
                  outline: selectedCandidate === i ? '2px solid #4a90e2' : 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '4px 2px',
                }}
                title={c.reason}
              >
                {i + 1} ({c.score.toFixed(1)})
              </button>
            ))}
          </div>
          {optimizerResult.candidates[selectedCandidate] && (
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
              {optimizerResult.candidates[selectedCandidate].reason ||
                `${optimizerResult.candidates[selectedCandidate].placements.length} plants`}
            </div>
          )}
          <button
            onClick={handleApply}
            style={{ width: '100%', cursor: 'pointer', background: '#4a90e2', color: '#fff', border: 'none', padding: '6px 0', borderRadius: 3 }}
          >
            Apply
          </button>
        </>
      )}
    </div>
  );
}
