import highsLoader from 'highs';
import { buildMipModel } from '../src/optimizer/formulation.ts';

const input = {
  bed: { widthIn: 48, heightIn: 90, trellisEdge: null, edgeClearanceIn: 0 },
  plants: [
    { cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, climber: false },
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

const model = buildMipModel(input);
console.log('vars=%d aux=%d cells=%d constraints=%d', model.vars.length, model.aux.length, model.cells.length, model.constraints.length);

// Inspect aux for NaN
let nanAux = 0, nanVar = 0, nanCons = 0;
for (const a of model.aux) if (!Number.isFinite(a.c)) nanAux++;
for (const v of model.vars) if (!Number.isFinite(v.c)) nanVar++;
for (const c of model.constraints) {
  for (const k in c.terms) if (!Number.isFinite(c.terms[k])) nanCons++;
  if (!Number.isFinite(c.rhs)) nanCons++;
}
console.log('NaN counts: vars=%d aux=%d constraints=%d', nanVar, nanAux, nanCons);

function fc(c){ if(c===1)return '+';if(c===-1)return '-';if(c>=0)return `+ ${c}`;return `- ${Math.abs(c)}`;}
function san(n){return n.replace(/[^A-Za-z0-9_]/g,'_');}
const lines=['Maximize'];const obj=[];
for(const v of model.vars)if(v.c!==0)obj.push(`${fc(v.c)} ${san(v.name)}`);
for(const a of model.aux)if(a.c!==0)obj.push(`${fc(a.c)} ${san(a.name)}`);
lines.push(obj.length?` obj: ${obj.join(' ')}`:' obj: 0');
lines.push('Subject To');
for(const c of model.constraints){const t=[];for(const[k,v]of Object.entries(c.terms))if(v!==0)t.push(`${fc(v)} ${san(k)}`);if(!t.length)continue;const op=c.op==='<='?'<=':c.op==='>='?'>=':'=';lines.push(` ${san(c.label)}: ${t.join(' ')} ${op} ${c.rhs}`);}
lines.push('Bounds');
for(const v of model.vars)lines.push(` 0 <= ${san(v.name)} <= 1`);
for(const a of model.aux)lines.push(` 0 <= ${san(a.name)} <= 1`);
lines.push('General');
const bin=model.vars.map(v=>san(v.name)).join(' ');
if(bin)lines.push(` ${bin}`);
lines.push('End');
const lp=lines.join('\n');
console.log('LP byte length:', lp.length);
// Print first 50 lines
console.log(lp.split('\n').slice(0,30).join('\n'));
console.log('...');
console.log(lp.split('\n').slice(-20).join('\n'));

const highs = await highsLoader();
try {
  const sol = highs.solve(lp, { time_limit: 10, mip_rel_gap: 0.01, output_flag: true, log_to_console: true });
  console.log('Status:', sol.Status, 'Obj:', sol.ObjectiveValue);
  const active = Object.entries(sol.Columns).filter(([n,c])=>n.startsWith('x_')&&c.Primal>0.5);
  console.log('Placements:', active.length);
} catch (e) {
  console.log('SOLVE THREW:', e?.message || e);
  console.log(e?.stack);
}
