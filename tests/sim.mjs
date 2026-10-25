// Bot calibration report: how many stars do a "good" and a "casual" bot earn at sample levels?
// Usage: node tests/sim.mjs [runsPerCell=6] [games=drop,fit,...]
import { loadEngine, SKILLS, ORDER } from './load.mjs';
const { Games, Prog, simulate } = loadEngine();
const runs = +process.argv[2] || 6;
const only = (process.argv[3] || '').split(',').filter(Boolean);
const LV = [1, 5, 10, 15, 20, 25, 30, 35, 40];

for (const id of ORDER) {
  if (only.length && !only.includes(id)) continue;
  const G = Games[id], t0 = Date.now();
  console.log('\n== ' + G.name + ' ==  (level: good stars / casual stars | score vs 1-star goal)');
  const rows = [];
  for (const l of LV) {
    const cell = {};
    for (const sk of ['good', 'casual']) {
      let st = 0, sc = 0, pass = 0;
      for (let k = 0; k < runs; k++) {
        const r = simulate(G, l, false, 1000 * l + k * 7 + 3, SKILLS[sk], 600);
        st += r.stars; sc += r.score; if (r.stars >= 1) pass++;
      }
      cell[sk] = { stars: st / runs, score: sc / runs, pass: pass / runs };
    }
    const th = Prog.thresholds(G, l);
    rows.push(['L' + String(l).padStart(2), 'good ' + cell.good.stars.toFixed(1) + '★ pass ' + (cell.good.pass * 100).toFixed(0) + '%',
      'casual ' + cell.casual.stars.toFixed(1) + '★ pass ' + (cell.casual.pass * 100).toFixed(0) + '%',
      'goal ' + th[0] + '/' + th[1] + '/' + th[2], 'avg score good ' + Math.round(cell.good.score) + ' casual ' + Math.round(cell.casual.score)].join(' | '));
  }
  console.log(rows.join('\n'));
  console.log('(' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
}
