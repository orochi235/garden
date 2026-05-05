import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import highsLoader from 'highs';
import { buildMipModel } from './formulation';
import { DEFAULT_WEIGHTS, type OptimizationInput } from './types';

function fc(c: number) { if (c === 1) return '+'; if (c === -1) return '-'; if (c >= 0) return `+ ${c}`; return `- ${Math.abs(c)}`; }
function san(n: string) { return n.replace(/[^A-Za-z0-9_]/g, '_'); }
function toLp(model: ReturnType<typeof buildMipModel>) {
  const lines = ['Maximize'];
  const obj: string[] = [];
  for (const v of model.vars) if (v.c !== 0) obj.push(`${fc(v.c)} ${san(v.name)}`);
  for (const a of model.aux) if (a.c !== 0) obj.push(`${fc(a.c)} ${san(a.name)}`);
  lines.push(obj.length ? ` obj: ${obj.join(' ')}` : ' obj: 0');
  lines.push('Subject To');
  for (const c of model.constraints) {
    const t: string[] = [];
    for (const [k, v] of Object.entries(c.terms)) if (v !== 0) t.push(`${fc(v)} ${san(k)}`);
    if (!t.length) continue;
    lines.push(` ${san(c.label)}: ${t.join(' ')} ${c.op} ${c.rhs}`);
  }
  lines.push('Bounds');
  for (const v of model.vars) lines.push(` 0 <= ${san(v.name)} <= 1`);
  for (const a of model.aux) lines.push(` 0 <= ${san(a.name)} <= 1`);
  lines.push('General');
  const bin = model.vars.map(v => san(v.name)).join(' ');
  if (bin) lines.push(` ${bin}`);
  lines.push('End');
  return lines.join('\n');
}

describe('8 tomatoes repro', () => {
  it('runs', async () => {
    const input: OptimizationInput = {
      bed: { widthIn: 48, lengthIn: 90, trellisEdge: null, edgeClearanceIn: 0 },
      plants: [{ cultivarId: 'tomato', count: 8, footprintIn: 12, heightIn: null, climber: false }],
      weights: DEFAULT_WEIGHTS,
      gridResolutionIn: 4,
      companions: { pairs: {} },
      userRegions: [],
      timeLimitSec: 30,
      mipGap: 0.01,
      candidateCount: 1,
      diversityThreshold: 3,
    };
    const model = buildMipModel(input);
    // Bisection: drop different constraint families
    const drop = process.env.DROP || '';
    if (drop.includes('sym')) model.constraints = model.constraints.filter(c => !c.label.startsWith('sym:'));
    if (drop.includes('adj')) model.constraints = model.constraints.filter(c => !c.label.startsWith('adj:') && !c.label.startsWith('adj_ub'));
    if (drop.includes('cov')) model.constraints = model.constraints.filter(c => !c.label.startsWith('coverage:'));
    const log: string[] = [`DROP=${drop}`];
    log.push(`vars=${model.vars.length} aux=${model.aux.length} cells=${model.cells.length} cons=${model.constraints.length}`);
    let nanV = 0, nanA = 0, nanC = 0, nanRhs = 0;
    for (const v of model.vars) if (!Number.isFinite(v.c)) nanV++;
    for (const a of model.aux) if (!Number.isFinite(a.c)) nanA++;
    for (const c of model.constraints) {
      for (const k in c.terms) if (!Number.isFinite(c.terms[k])) nanC++;
      if (!Number.isFinite(c.rhs)) nanRhs++;
    }
    log.push(`NaN: vars=${nanV} aux=${nanA} termCoeffs=${nanC} rhs=${nanRhs}`);
    const lp = toLp(model);
    log.push(`LP bytes=${lp.length}`);
    const highs = await highsLoader();
    try {
      const sol = highs.solve(lp, { time_limit: 15, mip_rel_gap: 0.01, output_flag: true, log_to_console: true });
      log.push(`Status: ${sol.Status} Obj: ${sol.ObjectiveValue}`);
      const active = Object.entries(sol.Columns).filter(([n, c]: [string, { Primal: number }]) => n.startsWith('x_') && c.Primal > 0.5);
      log.push(`Placements: ${active.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.push(`THREW: ${msg}`);
      const lines = lp.split('\n');
      const bad = lines.filter(l => /NaN|Infinity|undefined/i.test(l));
      log.push(`SUSPICIOUS: ${bad.length}`);
      bad.slice(0, 10).forEach(l => log.push(`  ${l.slice(0, 200)}`));
      writeFileSync('/tmp/repro8tom.lp', lp);
    }
    writeFileSync('/tmp/repro8tom.log', log.join('\n') + '\n');
    expect(true).toBe(true);
  }, 60000);
});
