// Reproduce the optimizer LP-string bug end-to-end in node, to inspect the
// generated LP and the highs error.
import highsLoader from 'highs';
import { buildMipModel } from '../src/optimizer/formulation.ts';

// Realistic input: 2 cultivars x count=4 (so sameSpecies aux vars emit) in a 4x8 bed.
const tinyInput = {
  bed: { widthIn: 48, heightIn: 96, trellisEdge: null, edgeClearanceIn: 0 },
  plants: [
    { cultivarId: 'tomato.cherokee', count: 4, footprintIn: 18, heightIn: 48, climber: false },
    { cultivarId: 'basil.genovese', count: 4, footprintIn: 12, heightIn: 18, climber: false },
  ],
  weights: { shading: 1, companion: 1, antagonist: 1, sameSpeciesBuffer: 1, trellisAttraction: 1, regionPreference: 1 },
  gridResolutionIn: 4,
  companions: { pairs: {} },
  userRegions: [],
  timeLimitSec: 30,
  mipGap: 0.01,
  candidateCount: 1,
  diversityThreshold: 3,
};

const model = buildMipModel(tinyInput);
console.log('model: vars=%d aux=%d cells=%d constraints=%d', model.vars.length, model.aux.length, model.cells.length, model.constraints.length);

// Inline copy of mipModelToLpString
function formatCoeff(c) { if (c === 1) return '+'; if (c === -1) return '-'; if (c >= 0) return `+ ${c}`; return `- ${Math.abs(c)}`; }
function san(n) { return n.replace(/[^A-Za-z0-9_]/g, '_'); }
function toLp(model) {
  const lines = ['Maximize'];
  const obj = [];
  for (const v of model.vars) if (v.c !== 0) obj.push(`${formatCoeff(v.c)} ${san(v.name)}`);
  for (const a of model.aux) if (a.c !== 0) obj.push(`${formatCoeff(a.c)} ${san(a.name)}`);
  lines.push(obj.length ? ` obj: ${obj.join(' ')}` : ' obj: 0');
  lines.push('Subject To');
  for (const c of model.constraints) {
    const t = [];
    for (const [k, v] of Object.entries(c.terms)) if (v !== 0) t.push(`${formatCoeff(v)} ${san(k)}`);
    if (!t.length) continue;
    const op = c.op === '<=' ? '<=' : c.op === '>=' ? '>=' : '=';
    lines.push(` ${san(c.label)}: ${t.join(' ')} ${op} ${c.rhs}`);
  }
  lines.push('Bounds');
  for (const v of model.vars) lines.push(` 0 <= ${san(v.name)} <= 1`);
  for (const a of model.aux) lines.push(` 0 <= ${san(a.name)} <= 1`);
  lines.push('General');
  const bin = model.vars.map((v) => san(v.name)).join(' ');
  if (bin) lines.push(` ${bin}`);
  lines.push('End');
  return lines.join('\n');
}

const lp = toLp(model);
console.log('--- LP STRING ---');
console.log(lp);
console.log('--- END LP ---');

const highs = await highsLoader();
try {
  const sol = highs.solve(lp, { time_limit: 5, mip_rel_gap: 0.01, output_flag: true, log_to_console: true });
  console.log('Status:', sol.Status);
  console.log('Obj:', sol.ObjectiveValue);
  const active = Object.entries(sol.Columns).filter(([n, col]) => n.startsWith('x_') && col.Primal > 0.5);
  console.log('Active placements:', active.length);
  for (const [name, col] of active) console.log(' ', name, 'Primal=', col.Primal);
} catch (e) {
  console.log('SOLVE THREW:', e?.message || e);
}
