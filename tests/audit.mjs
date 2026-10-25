// Audit of levels, scoring, stars and rewards. Exits non-zero if any rule is broken.
// Usage: node tests/audit.mjs [botRuns=10]
import { loadEngine, SKILLS, ORDER } from './load.mjs';
const { Prog, Games, Run, simulate, mulberry } = loadEngine();
const RUNS = +process.argv[2] || 10;
let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL: ' + msg); } }
function section(t) { console.log('\n' + t); }
const L = Prog.LEVELS;
const rng = mulberry(42);

/* ---------- 1. Level ladder: every level is harder than the one before ---------- */
section('1. Level ladder');
for (const id of ORDER) {
  const G = Games[id];
  if (G.stars) continue;                       // Duel is checked separately below
  let prevUnit = 0, prevGoal = 0;
  for (let l = 1; l <= L; l++) {
    const t = Prog.thresholds(G, l), unit = t[0] / G.budget(l);
    ok(t[0] < t[1] && t[1] < t[2], id + ' L' + l + ' star goals not strictly increasing: ' + t);
    ok(G.budget(l) >= 1, id + ' L' + l + ' has no budget');
    ok(Prog.f1(l) > Prog.f1(l - 1 || 1) || l === 1, id + ' f1 not rising at L' + l);
    ok(unit > prevUnit, id + ' L' + l + ': points needed per ' + G.unit.toLowerCase() + ' did not rise (' + unit.toFixed(2) + ' <= ' + prevUnit.toFixed(2) + ')');
    ok(t[0] >= prevGoal, id + ' L' + l + ': the 1-star goal went DOWN (' + t[0] + ' < ' + prevGoal + ')');
    prevUnit = unit; prevGoal = t[0];
  }
  const a = Prog.thresholds(G, 1), b = Prog.thresholds(G, L);
  console.log('  ' + G.name.padEnd(12) + ' 1-star goal L1 ' + String(a[0]).padStart(5) + ' -> L' + L + ' ' + String(b[0]).padStart(5) + '   3-star L1 ' + String(a[2]).padStart(5) + ' -> L' + L + ' ' + String(b[2]).padStart(5));
}
// Duel difficulty comes from the opponent: it must never get easier.
{
  let prev = null;
  for (let l = 1; l <= L; l++) {
    const r = new Run(Games.duel, l, false, 5), g = r.game;
    const cur = { eps: g.eps, hand: g.hand, cpuMaxF: g.cpuMaxF, look: g.look ? 1 : 0, margin: 10 + Math.floor(l / 4) };
    if (prev) {
      ok(cur.eps <= prev.eps + 1e-9, 'duel L' + l + ' CPU mistake rate went up');
      ok(cur.hand >= prev.hand, 'duel L' + l + ' CPU head start went down');
      ok(cur.cpuMaxF >= prev.cpuMaxF - 1e-9, 'duel L' + l + ' CPU dice got weaker');
      ok(cur.look >= prev.look, 'duel L' + l + ' CPU lost its lookahead');
      ok(cur.margin >= prev.margin, 'duel L' + l + ' 3-star margin went down');
    }
    prev = cur;
  }
  const a = new Run(Games.duel, 1, false, 5).game, z = new Run(Games.duel, L, false, 5).game;
  console.log('  Dice Duel    CPU mistakes ' + (a.eps * 100).toFixed(0) + '% -> ' + (z.eps * 100).toFixed(0) + '%, head-start dice ' + a.hand + ' -> ' + z.hand + ', max die ' + a.cpuMaxF.toFixed(1) + ' -> ' + z.cpuMaxF.toFixed(1) + ', lookahead L1 ' + a.look + ' -> L' + L + ' ' + z.look);
  // Duel star rules
  const S = Games.duel.stars;
  ok(S(5, { won: false }) === 0 && S(5, { won: true, sweep: false, margin: 99 }) === 1, 'duel: win without sweep must be exactly 1 star');
  ok(S(5, { won: true, sweep: true, margin: 0 }) === 2 && S(5, { won: true, sweep: true, margin: 99 }) === 3, 'duel: sweep = 2 stars, sweep + margin = 3 stars');
}

/* ---------- 2. Score -> stars mapping ---------- */
section('2. Score to stars');
for (const id of ORDER) {
  const G = Games[id]; if (G.stars) continue;
  for (const l of [1, 7, 20, 40]) {
    const t = Prog.thresholds(G, l);
    ok(Prog.starsFor(G, l, t[0] - 1) === 0 && Prog.starsFor(G, l, t[0]) === 1, id + ' L' + l + ' 1-star boundary');
    ok(Prog.starsFor(G, l, t[1] - 1) === 1 && Prog.starsFor(G, l, t[1]) === 2, id + ' L' + l + ' 2-star boundary');
    ok(Prog.starsFor(G, l, t[2] - 1) === 2 && Prog.starsFor(G, l, t[2]) === 3, id + ' L' + l + ' 3-star boundary');
    ok(Prog.starsFor(G, l, 10 * t[2]) === 3, id + ' L' + l + ' stars capped at 3');
  }
  const tt = Prog.timedThr(G);
  ok(tt[0] < tt[1] && tt[1] < tt[2], id + ' medal goals not increasing');
  ok(Prog.medalFor(G, tt[0] - 1) === 0 && Prog.medalFor(G, tt[0]) === 1 && Prog.medalFor(G, tt[1]) === 2 && Prog.medalFor(G, tt[2]) === 3, id + ' medal boundaries');
}
// The run engine must hand out exactly the stars the formula says.
for (const id of ORDER) {
  const G = Games[id]; if (G.stars) continue;
  const r = new Run(G, 9, false, 3);
  r.addScore(Prog.thresholds(G, 9)[1] + 1);
  r.finish({});
  ok(r.result.stars === 2 && r.result.score === Prog.thresholds(G, 9)[1] + 1, id + ' Run.finish stars/score mismatch');
}
console.log('  boundaries checked for 7 games x 4 levels, medals for 8 games');

/* ---------- 3. Rewards ---------- */
section('3. Rewards ledger');
{
  const G = Games.drop, s = Prog.newSave();
  // coins per star rise with level and never pay twice
  for (let l = 2; l <= L; l++) ok(Prog.coinsForStars(l, 0, 3) >= Prog.coinsForStars(l - 1, 0, 3), 'coin reward fell at L' + l);
  for (let l = 1; l <= L; l++) ok(Prog.coinsForStars(l, 0, 3) === Prog.coinsForStars(l, 0, 1) + Prog.coinsForStars(l, 1, 2) + Prog.coinsForStars(l, 2, 3), 'coin split mismatch L' + l);
  ok(Prog.coinsForStars(10, 1, 3) < Prog.coinsForStars(10, 0, 3), 'improving only pays the new stars');
  // first clear
  let r = Prog.applyLevel(s, G, 1, 999, 3, rng);
  ok(r.coins === Prog.coinsForStars(1, 0, 3) && s.coins === r.coins, 'first 3-star clear pays full stars');
  ok(r.unlocked === 2 && Prog.isUnlocked(s, 'drop', 2), 'clearing L1 unlocks L2');
  ok(!Prog.isUnlocked(s, 'drop', 3), 'L3 stays locked');
  const c1 = s.coins; r = Prog.applyLevel(s, G, 1, 999, 3, rng);
  ok(r.coins - r.rankCoins === 1 && s.coins === c1 + r.coins, 'replaying a 3-star level pays only 1 coin (no farming)');
  ok(r.unlocked === null, 'replay does not re-unlock');
  r = Prog.applyLevel(s, G, 2, 10, 0, rng);
  ok(r.coins - r.rankCoins === 0 && !Prog.isUnlocked(s, 'drop', 3), 'failing pays no coins and does not unlock');
  ok(r.xp > 0, 'failing still earns a little XP');
  r = Prog.applyLevel(s, G, 2, 100, 1, rng); const c2 = s.coins;
  r = Prog.applyLevel(s, G, 2, 200, 2, rng);
  ok(r.coins - r.rankCoins === Prog.coinsForStars(2, 1, 2) && s.coins === c2 + r.coins && s.stars.drop[2] === 2, 'improving 1 -> 2 stars pays the difference and keeps the best');
  r = Prog.applyLevel(s, G, 2, 50, 1, rng);
  ok(s.stars.drop[2] === 2, 'a worse run never lowers saved stars');
  // chests
  const s2 = Prog.newSave(); let chests = 0, coinsBefore;
  for (let l = 1; l <= L; l++) {
    coinsBefore = s2.coins; r = Prog.applyLevel(s2, G, l, 999, 1, rng);
    if (l % 5 === 0) { ok(r.chest && r.chest.coins === Prog.chestCoins(l), 'chest on L' + l); chests++; ok(r.chest.sticker != null, 'chest gives a sticker L' + l); }
    else ok(!r.chest, 'no chest on L' + l);
  }
  ok(chests === 8, '8 chests per game');
  ok(Prog.chestCoins(40) > Prog.chestCoins(5), 'later chests pay more');
  const again = Prog.applyLevel(s2, G, 5, 999, 1, rng); ok(!again.chest, 'chest only once per level');
  ok(new Set(s2.stickers).size === s2.stickers.length, 'no duplicate stickers');
  // ranks
  let prevXp = -1, prevRank = 0;
  for (let xp = 0; xp < 40000; xp += 37) { const rk = Prog.rankOf(xp); ok(rk.rank >= prevRank && rk.into >= 0 && rk.into < rk.need, 'rank math at xp ' + xp); prevRank = rk.rank; }
  const s3 = Prog.newSave(); let rankUps = 0, guard = 0;
  while (guard++ < 400) { r = Prog.applyLevel(s3, G, 1, 200, 1, rng); rankUps += r.ranks.length; if (Prog.rankOf(s3.xp).rank >= 6) break; }
  ok(rankUps === Prog.rankOf(s3.xp).rank - 1, 'every rank-up reported exactly once');
  ok(s3.stickers.length === rankUps, 'every rank-up gave a sticker');
  // timed medals
  const s4 = Prog.newSave(), tg = Games.rush, th = Prog.timedThr(tg);
  r = Prog.applyTimed(s4, tg, th[0], rng); ok(r.medal === 1 && r.coins - r.rankCoins === Prog.MEDAL_COINS[0] + 5, 'bronze pays bronze + new-best');
  r = Prog.applyTimed(s4, tg, th[2], rng); ok(r.medal === 3 && r.coins - r.rankCoins === Prog.MEDAL_COINS[1] + Prog.MEDAL_COINS[2] + 5, 'jumping to gold pays silver + gold once');
  r = Prog.applyTimed(s4, tg, th[2], rng); ok(r.coins - r.rankCoins === 2 && !r.newBest, 'repeat gold pays 2 coins');
  r = Prog.applyTimed(s4, tg, 0, rng); ok(r.coins - r.rankCoins === 0 && s4.timed.rush.best === th[2], 'a bad round pays nothing and keeps the best');
  ok(Prog.MEDAL_COINS[0] < Prog.MEDAL_COINS[1] && Prog.MEDAL_COINS[1] < Prog.MEDAL_COINS[2], 'medal coins rise');
  // daily gift
  const s5 = Prog.newSave(); let g = Prog.claimGift(s5, '2026-01-01', rng);
  ok(g.coins === 20 && g.streak === 1, 'day 1 gift'); ok(Prog.claimGift(s5, '2026-01-01', rng) === null, 'one gift per day');
  for (let d = 2; d <= 7; d++) g = Prog.claimGift(s5, '2026-01-0' + d, rng);
  ok(g.streak === 7 && g.coins === 140 && g.sticker != null, 'day 7 gift: 140 coins + sticker');
  g = Prog.claimGift(s5, '2026-01-08', rng); ok(g.streak === 1, 'streak restarts after day 7');
  g = Prog.claimGift(s5, '2026-01-10', rng); ok(g.streak === 1, 'missed day resets streak');
  // shop affordability
  const total = s2.coins; console.log('  one game, 1 star each: ' + total + ' coins; skins cost ' + loadEngine().SKINS.reduce((a, k) => a + k.price, 0) + ' in total');
}

/* ---------- 4. Bots: does real play match the ladder? ---------- */
section('4. Bot play vs. the ladder (' + RUNS + ' runs per cell)');
const BANDS = [[1, 8], [9, 16], [17, 24], [25, 32], [33, 40]];
function measure(G, skill) {
  const out = BANDS.map(([a, b]) => {
    let stars = 0, pass = 0, n = 0, best1 = 0, best3 = 0;
    for (let l = a; l <= b; l += 2) for (let k = 0; k < RUNS; k++) {
      const r = simulate(G, l, false, 7919 * l + k * 13 + 1, skill, 600); n++;
      stars += r.stars; if (r.stars >= 1) pass++;
    }
    return { stars: stars / n, pass: pass / n };
  });
  return out;
}
const timeEst = {};
for (const id of ORDER) {
  const G = Games[id];
  const good = measure(G, SKILLS.good), cas = measure(G, SKILLS.casual);
  console.log('  ' + G.name.padEnd(12) + ' good  ' + good.map(x => x.stars.toFixed(1) + '★/' + (x.pass * 100).toFixed(0) + '%').join('  ') + '   | casual ' + cas.map(x => x.stars.toFixed(1) + '★/' + (x.pass * 100).toFixed(0) + '%').join('  '));
  for (let i = 1; i < BANDS.length; i++) {
    ok(good[i].stars <= good[i - 1].stars + 0.45, id + ': good bot earns MORE stars in levels ' + BANDS[i] + ' than ' + BANDS[i - 1]);
    ok(cas[i].stars <= cas[i - 1].stars + 0.45, id + ': casual bot earns MORE stars in levels ' + BANDS[i] + ' than ' + BANDS[i - 1]);
  }
  ok(good[0].stars >= 2.2, id + ': early levels should give a good player 2-3 stars (got ' + good[0].stars.toFixed(1) + ')');
  ok(cas[0].pass >= 0.9, id + ': a casual player must be able to clear early levels (' + (cas[0].pass * 100).toFixed(0) + '%)');
  ok(good[4].pass >= 0.35, id + ': the last levels must stay beatable by a good player (' + (good[4].pass * 100).toFixed(0) + '%)');
  ok(good[4].stars <= good[0].stars - 0.4, id + ': the last levels must be clearly harder than the first (' + good[4].stars.toFixed(1) + ' vs ' + good[0].stars.toFixed(1) + ')');
}

/* ---------- 5. Timed mode ---------- */
section('5. Timed mode medals');
for (const id of ORDER) {
  const G = Games[id], th = Prog.timedThr(G);
  const sc = { good: [], casual: [] };
  for (const sk of ['good', 'casual']) for (let k = 0; k < RUNS; k++) sc[sk].push(simulate(G, 1, true, 100 + k, SKILLS[sk], G.timedSecs + 5).score);
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const mg = avg(sc.good.map(v => Prog.medalFor(G, v))), mc = avg(sc.casual.map(v => Prog.medalFor(G, v)));
  console.log('  ' + G.name.padEnd(12) + ' medal goals ' + th.join('/') + '   good avg ' + Math.round(avg(sc.good)) + ' (' + mg.toFixed(1) + ' medals)   casual avg ' + Math.round(avg(sc.casual)) + ' (' + mc.toFixed(1) + ')');
  ok(avg(sc.good) >= th[1], id + ': a good player averages at least silver in timed mode');
  ok(avg(sc.casual) >= th[0], id + ': a casual player averages at least bronze');
  ok(avg(sc.casual) < th[2], id + ': gold is not handed to a casual player');
  ok(mg >= mc - 0.2, id + ': good bot should not do worse than casual in timed mode');
}

/* ---------- 6. Campaign length ---------- */
section('6. Estimated play time (single pass, 1-star clears, bot-timed + human think time)');
const THINK = { drop: 0, fit: 5, garden: 3, match: 3.5, shot: 3.5, rush: 0, tower: 1.2, duel: 6 };
let grand = 0;
for (const id of ORDER) {
  const G = Games[id]; let secs = 0, plays = 0;
  for (let l = 1; l <= L; l += 3) {
    const run = new Run(G, l, false, 55 + l, null, SKILLS.casual), dt = 1 / 30; let n = 0, acts = 0;
    while (!run.over && n++ < 30 * 900) { const sc = run.score; if (run.game.bot) run.game.bot(dt); run.step(dt); }
    if (!run.over) run.finish({});
    const budget = isFinite(G.budget(l)) ? G.budget(l) : 3;
    secs += run.t * 1.2; plays++;
  }
  const perLevel = secs / plays, hrs = perLevel * L / 3600;
  timeEst[id] = hrs; grand += hrs;
  console.log('  ' + G.name.padEnd(12) + ' ~' + (perLevel / 60).toFixed(1) + ' min per level  ->  ~' + hrs.toFixed(1) + ' h for ' + L + ' levels (one attempt each)');
  ok(hrs >= 0.4, id + ': at least ~0.4 hour of content');
}
console.log('  TOTAL about ' + grand.toFixed(1) + ' hours for all eight games, before retries, timed mode and 3-star runs');
ok(grand >= 5, 'bundle gives at least 5 hours');

console.log('\n' + checks + ' checks, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
