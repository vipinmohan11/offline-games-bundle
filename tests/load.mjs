// Loads the game logic (everything except app.js) into a Node vm context for headless testing.
import fs from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../src/', import.meta.url);
const files = ['prog.js', 'common.js', 'games/drop.js', 'games/fit.js', 'games/garden.js', 'games/match.js',
  'games/shot.js', 'games/rush.js', 'games/tower.js', 'games/duel.js'];

export function loadEngine() {
  const src = files.map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n') +
    '\n;this.__x = { Prog, Games, Run, simulate, mulberry, SKINS, setSkin };';
  const ctx = vm.createContext({ Math, JSON, Date, console });
  vm.runInContext(src, ctx);
  return ctx.__x;
}
export const SKILLS = {
  good:   { eps: 0.03, tempo: 0.22, noise: 1, think: 1.6 },
  casual: { eps: 0.35, tempo: 0.45, noise: 3, think: 3.2 }
};
export const ORDER = ['drop', 'fit', 'garden', 'match', 'shot', 'rush', 'tower', 'duel'];
