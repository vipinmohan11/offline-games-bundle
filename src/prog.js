'use strict';
/* Progression: levels, stars, coins, XP, ranks, chests, stickers, timed medals.
   Pure functions over a save object so they can be tested in Node. */
var Prog = (function () {
  var LEVELS = 50;               // 1-40 guided path, 41-50 Endless Ladder
  var GUIDED = 40;
  var STAR_GAP = 0.20;
  var MEDAL_MULT = [0.5, 1.0, 1.6];       // bronze, silver, gold as multiples of timedPar * timedSecs
  var MEDAL_COINS = [15, 30, 60];
  var STICKER_COUNT = 64;

  // Share of "par" a player must score for 1 star on a level. Rises every level: 0.25 -> 0.85
  function f1(l) {
    if (l <= GUIDED) return 0.25 + 0.60 * (l - 1) / (GUIDED - 1);
    return 0.85 + 0.25 * Math.log(1 + (l - GUIDED) / 8);          // Endless Ladder: slow, never a jump
  }
  // Difficulty index 0..1 (1 = Level 40 and beyond), pace pressure, target pass rate, mistake allowance
  function D(l) { return Math.pow((Math.min(l, GUIDED) - 1) / (GUIDED - 1), 0.85); }
  function rho(l) { return l <= GUIDED ? 0.55 + 0.55 * D(l) : Math.min(1.25, 1.10 + 0.05 * Math.log(1 + (l - GUIDED) / 10)); }
  function pTarget(l) { return 0.95 - 0.65 * Math.pow(D(l), 1.2) - (isBoss(l) ? 0.10 : 0); }
  function allowedMistakes(l) { return Math.round(5 - 3 * D(l)); }
  function isBoss(l) { return l % 10 === 0; }
  // Style 0..100 = accuracy, goal progress, streak. Stars never use it (they stay on the Base score).
  function styleOf(mistakes, allowed, goal, streakFrac) {
    var acc = Math.max(0, 1 - mistakes / Math.max(1, allowed));
    return Math.round(100 * (0.5 * acc + 0.3 * Math.max(0, Math.min(1, goal)) + 0.2 * Math.max(0, Math.min(1, streakFrac))));
  }
  function styleRank(s) { return s >= 90 ? 'S' : s >= 75 ? 'A' : s >= 55 ? 'B' : 'C'; }

  function thresholds(G, l) {
    if (G.thresholds) return G.thresholds(l);
    var base = G.par * G.budget(l), a = f1(l);
    return [a, a + STAR_GAP, a + 2 * STAR_GAP].map(function (f) { return Math.round(f * base); });
  }
  function starsFor(G, l, score, res) {
    if (G.stars) return G.stars(l, res || { score: score });
    var t = thresholds(G, l);
    return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
  }
  function timedThr(G) {
    return MEDAL_MULT.map(function (m) { return Math.round(m * G.timedPar * G.timedSecs); });
  }
  function medalFor(G, score) {
    var t = timedThr(G);
    return score >= t[2] ? 3 : score >= t[1] ? 2 : score >= t[0] ? 1 : 0;
  }

  function newSave() {
    return { v: 1, coins: 0, xp: 0, stars: {}, best: {}, timed: {}, chests: {}, stickers: [], stamps: {}, bosses: {}, tokens: 0, seenStk: 0,
      skin: 0, skins: [0], gift: { last: '', streak: 0 }, sound: true, flowers: 0, plays: 0, seen: {} };
  }
  function rankOf(xp) {
    var r = 1, need = 80;
    while (xp >= need) { xp -= need; r++; need = 80 + 40 * (r - 1); }
    return { rank: r, into: xp, need: need };
  }
  function isUnlocked(save, g, l) { return l === 1 || ((save.stars[g] || {})[l - 1] || 0) >= 1; }
  function totalStars(save, g) {
    var s = save.stars[g] || {}, n = 0;
    for (var k in s) n += s[k];
    return n;
  }
  function coinsForStars(l, from, to) {
    var c = 0;
    for (var s = from + 1; s <= to; s++) c += s * (1 + Math.ceil(l / 4));
    return c;
  }
  function chestCoins(l) { return 25 + 2 * l; }

  function giveSticker(save, rng) {
    var have = {}, i, free = [];
    save.stickers.forEach(function (s) { have[s] = 1; });
    for (i = 0; i < STICKER_COUNT; i++) if (!have[i]) free.push(i);
    if (!free.length) return null;
    var id = free[Math.floor(rng() * free.length)];
    save.stickers.push(id);
    return id;
  }
  function addXp(save, amount, rng, res) {
    var before = rankOf(save.xp).rank;
    save.xp += amount;
    res.xp += amount;
    var after = rankOf(save.xp).rank;
    for (var r = before + 1; r <= after; r++) {
      var c = 15 * r, st = giveSticker(save, rng);
      save.coins += c;
      res.coins += c;
      res.rankCoins += c;
      res.ranks.push({ rank: r, coins: c, sticker: st });
    }
  }

  // Apply the result of a finished level. Mutates save, returns a summary for the result screen.
  function applyLevel(save, G, l, score, stars, rng, opts) {
    opts = opts || {};
    var g = G.id;
    var res = { coins: 0, rankCoins: 0, xp: 0, stars: stars, oldStars: 0, chest: null, ranks: [], unlocked: null, newBest: false, stamp: 0, token: 0, tokenLost: 0, boss: null, challenge: !!opts.challenge, style: opts.style || 0 };
    var st = save.stars[g] = save.stars[g] || {};
    var old = st[l] || 0;
    res.oldStars = old;
    save.plays++;
    if (stars > old) {
      var sc = coinsForStars(l, old, stars);
      res.coins += sc; st[l] = stars;
      if (opts.challenge && stars === 3) { res.coins += sc; }                // Star Challenge: double star coins, first time only
    }
    else if (stars >= 1) res.coins += 1;
    var bk = g + ':' + l;
    if (score > (save.best[bk] || 0)) { save.best[bk] = score; res.newBest = true; }
    if (stars >= 1 && l < LEVELS && old < 1) res.unlocked = l + 1;
    if (stars >= 1 && l % 5 === 0 && !save.chests[bk]) {
      save.chests[bk] = 1;
      var cc = chestCoins(l);
      res.chest = { coins: cc, sticker: giveSticker(save, rng) };
      res.coins += cc;
      save.tokens = (save.tokens || 0) + 1; res.token += 1;                  // Courage Tokens come from chests only
    }
    if (stars >= 1 && isBoss(l) && !(save.bosses = save.bosses || {})[bk]) {
      save.bosses[bk] = 1; res.boss = { sticker: giveSticker(save, rng) };   // boss badge + sticker, first win only
    }
    var stampMap = save.stamps = save.stamps || {};
    if (opts.perfect && stars === 3 && !(stampMap[g] = stampMap[g] || {})[l]) {
      stampMap[g][l] = 1; res.stamp = 10 + Math.floor(l / 2); res.coins += res.stamp;   // Gold Stamp, first time only
    }
    if (opts.challenge) {
      if (stars === 3) { save.tokens = (save.tokens || 0) + 1; res.token += 1; } else res.tokenLost = 1;
    }
    save.coins += res.coins;
    var xp = stars >= 1 ? 8 + 12 * stars + Math.floor(score / 60) : Math.round(0.25 * (20 + Math.floor(score / 60)));   // a failed run still pays 25%
    if (stars >= 1 && opts.style >= 90) xp = Math.round(xp * 1.2);
    addXp(save, xp, rng, res);
    return res;
  }

  function applyTimed(save, G, score, rng) {
    var g = G.id;
    var res = { coins: 0, rankCoins: 0, xp: 0, medal: medalFor(G, score), oldMedal: 0, best: 0, newBest: false, ranks: [] };
    var t = save.timed[g] = save.timed[g] || { medal: 0, best: 0 };
    res.oldMedal = t.medal;
    save.plays++;
    for (var m = t.medal + 1; m <= res.medal; m++) res.coins += MEDAL_COINS[m - 1];
    if (res.medal > t.medal) t.medal = res.medal;
    if (score > t.best) { t.best = score; res.newBest = true; res.coins += 5; }
    else if (res.medal >= 1) res.coins += 2;
    res.best = t.best;
    save.coins += res.coins;
    addXp(save, 5 + Math.floor(score / 60) + 6 * res.medal, rng, res);
    return res;
  }

  // Daily gift. today = 'YYYY-MM-DD'. Streak 1..7 then repeats.
  function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
  function giftReady(save, today) { return save.gift.last !== today; }
  function claimGift(save, today, rng) {
    if (!giftReady(save, today)) return null;
    var streak = (save.gift.last && dayDiff(save.gift.last, today) === 1) ? save.gift.streak + 1 : 1;
    if (streak > 7) streak = 1;
    save.gift.last = today;
    save.gift.streak = streak;
    var coins = 20 * streak, st = streak === 7 ? giveSticker(save, rng) : null;
    save.coins += coins;
    return { coins: coins, streak: streak, sticker: st };
  }

  return { LEVELS: LEVELS, STAR_GAP: STAR_GAP, MEDAL_MULT: MEDAL_MULT, MEDAL_COINS: MEDAL_COINS, STICKER_COUNT: STICKER_COUNT,
    f1: f1, D: D, rho: rho, pTarget: pTarget, allowedMistakes: allowedMistakes, isBoss: isBoss, styleOf: styleOf, styleRank: styleRank, GUIDED: GUIDED, thresholds: thresholds, starsFor: starsFor, timedThr: timedThr, medalFor: medalFor,
    newSave: newSave, rankOf: rankOf, isUnlocked: isUnlocked, totalStars: totalStars,
    coinsForStars: coinsForStars, chestCoins: chestCoins, applyLevel: applyLevel, applyTimed: applyTimed,
    giftReady: giftReady, claimGift: claimGift };
})();
if (typeof module !== 'undefined') module.exports = Prog;
