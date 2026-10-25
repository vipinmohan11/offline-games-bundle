'use strict';
/* Shared helpers: RNG, dice drawing, skins, and the Run engine (works headless for bot tests). */
var Games = {};

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* Bot pacing so test bots play at a human speed (think = seconds per decision). */
function botReady(g, dt) { g.botWait = (g.botWait || 0) - dt; return g.botWait <= 0; }
function botDone(g) { var t = g.env.skill.think || 0; g.botWait = t * (0.7 + g.env.rnd() * 0.6); }
/* Seconds a level clock allows per move: generous early, tighter later (never below 3.6 s). */
function perMoveSecs(l) { return l <= 40 ? 8 - 0.1 * l : Math.max(3.6, 4 - 0.04 * (l - 40)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function shade(hex, k) {
  var n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
  r = clamp(Math.round(r * k), 0, 255); g = clamp(Math.round(g * k), 0, 255); b = clamp(Math.round(b * k), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

var SKINS = [
  { name: 'Classic', price: 0,    faces: ['#ff8787', '#ffc078', '#ffe066', '#8ce99a', '#74c0fc', '#d0bfff'], pip: '#2b2b44', bg: '#1f2a44' },
  { name: 'Candy',   price: 150,  faces: ['#ff99c8', '#fcf6bd', '#d0f4de', '#a9def9', '#e4c1f9', '#ffb88c'], pip: '#4a2c4f', bg: '#3b2a4f' },
  { name: 'Sunset',  price: 300,  faces: ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'], pip: '#ffffff', bg: '#2b1d3a' },
  { name: 'Ocean',   price: 500,  faces: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9bf6ff', '#c8b6ff'], pip: '#073b4c', bg: '#073b4c' },
  { name: 'Forest',  price: 800,  faces: ['#e07a5f', '#f2cc8f', '#81b29a', '#a7c957', '#6a994e', '#bc6c25'], pip: '#1b2a1b', bg: '#233a2a' },
  { name: 'Neon',    price: 1200, faces: ['#ff2e63', '#ff9f1c', '#f9f871', '#08fdd8', '#3a86ff', '#c77dff'], pip: '#101020', bg: '#10101c' },
  { name: 'Gold',    price: 1800, faces: ['#ffd700', '#ffb703', '#fb8500', '#f4a261', '#e9c46a', '#ffe8a3'], pip: '#4a3000', bg: '#3a2a10' },
  { name: 'Galaxy',  price: 2400, faces: ['#7b2cbf', '#3c096c', '#5a189a', '#9d4edd', '#c77dff', '#e0aaff'], pip: '#ffffff', bg: '#10002b' }
];
var BOARDS = [
  { name: 'Classic', price: 0,   bg: null },
  { name: 'Wood',    price: 250, bg: '#6b4423', pat: 'lines' },
  { name: 'Space',   price: 400, bg: '#0b1030', pat: 'stars' },
  { name: 'Paper',   price: 300, bg: '#cfc4a8', pat: 'grid' },
  { name: 'Mint',    price: 350, bg: '#1d5c4e', pat: 'dots' }
];
var Board = { i: 0, cur: BOARDS[0] };
function setBoard(i) { Board.i = i; Board.cur = BOARDS[i] || BOARDS[0]; }
/* Power-ups: used from the play screen, once per run each. */
var POWERUPS = [
  { id: 'time', icon: '⏱', name: '+15 seconds', short: '+15s', price: 60, desc: 'Adds 15 seconds to the clock (games with a clock).' },
  { id: 'x2',   icon: '✖2', name: 'Double points', short: '×2', price: 80, desc: 'Every point counts double for 20 seconds.' },
  { id: 'slow', icon: '🐢', name: 'Slow motion', short: 'Slow', price: 70, desc: 'Everything moves 40% slower for 20 seconds.' }
];
var AVATARS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐙', '🦄', '🐲', '🚀', '👾', '🤖', '🎩'];
var AVATAR_PRICE = 100;
var TITLES = [{ t: 'Rookie', price: 0 }, { t: 'Dice Whiz', price: 150 }, { t: 'Lucky Roller', price: 200 }, { t: 'Board Boss', price: 300 }, { t: 'Combo King', price: 400 }, { t: 'Legend', price: 800 }];
var Skin = { i: 0, cur: SKINS[0] };
function setSkin(i) { Skin.i = i; Skin.cur = SKINS[i] || SKINS[0]; }

var PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
function drawDie(c, x, y, s, v, o) {
  o = o || {};
  var sk = Skin.cur, col = o.color || sk.faces[(v - 1 + 6) % 6];
  var p = s * 0.05, w = s - 2 * p, r = s * 0.2;
  c.save();
  if (o.alpha != null) c.globalAlpha = o.alpha;
  if (o.scale && o.scale !== 1) { c.translate(x + s / 2, y + s / 2); c.scale(o.scale, o.scale); c.translate(-s / 2, -s / 2); x = 0; y = 0; }
  rr(c, x + p, y + p + s * 0.03, w, w, r); c.fillStyle = shade(col, 0.72); c.fill();
  rr(c, x + p, y + p, w, w * 0.96, r); c.fillStyle = col; c.fill();
  if (o.stroke) { c.lineWidth = Math.max(2, s * 0.07); c.strokeStyle = o.stroke; c.stroke(); }
  c.fillStyle = o.pip || sk.pip;
  var pr = s * 0.075, g = w / 3.6, ox = x + p + w / 2 - g, oy = y + p + w * 0.48 - g;
  var ids = PIPS[v] || [];
  for (var i = 0; i < ids.length; i++) {
    var k = ids[i];
    c.beginPath(); c.arc(ox + (k % 3) * g, oy + Math.floor(k / 3) * g, pr, 0, 6.2832); c.fill();
  }
  c.restore();
}
function text(c, str, x, y, size, color, align, weight) {
  c.font = (weight || '700') + ' ' + size + 'px system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.fillStyle = color || '#fff';
  c.fillText(str, x, y);
}
function boardBg(c, x, y, w, h) {
  rr(c, x - 6, y - 6, w + 12, h + 12, 14); c.fillStyle = 'rgba(0,0,0,0.28)'; c.fill();
  boardFill(c, x, y, w, h, 10);
}
/* Board look: colour plus a quiet pattern chosen in the shop. */
function boardFill(c, x, y, w, h, r) {
  var B = Board.cur;
  rr(c, x, y, w, h, r); c.fillStyle = B.bg || Skin.cur.bg; c.fill();
  if (!B.pat) return;
  c.save(); rr(c, x, y, w, h, r); c.clip(); var i;
  if (B.pat === 'lines') { c.fillStyle = 'rgba(0,0,0,0.16)'; for (i = 0; i < h; i += 16) c.fillRect(x, y + i, w, 2); }
  else if (B.pat === 'grid') { c.fillStyle = 'rgba(0,0,0,0.10)'; for (i = 0; i < w; i += 20) c.fillRect(x + i, y, 1, h); for (i = 0; i < h; i += 20) c.fillRect(x, y + i, w, 1); }
  else if (B.pat === 'dots') { c.fillStyle = 'rgba(255,255,255,0.08)'; for (i = 0; i < w; i += 18) for (var j = 0; j < h; j += 18) c.fillRect(x + i + 8, y + j + 8, 3, 3); }
  else if (B.pat === 'stars') { c.fillStyle = 'rgba(255,255,255,0.55)'; for (i = 0; i < 40; i++) c.fillRect(x + ((i * 97) % 101) / 101 * w, y + ((i * 53) % 103) / 103 * h, i % 5 ? 1.5 : 2.5, i % 5 ? 1.5 : 2.5); }
  c.restore();
}

/* Run: one play session of one game (level or timed). Works headless (ui = null). */
function Run(G, level, timed, seed, ui, skill) {
  this.G = G; this.level = level; this.timed = !!timed; this.ui = ui || null;
  this.rnd = mulberry(seed || 1);
  this.skill = skill || { eps: 0, tempo: 0.15, noise: 1 };
  this.score = 0; this.t = 0; this.over = false; this.result = null;
  this.mistakes = 0; this.acts = 0; this.run = 0; this.bestRun = 0; this.helper = false;
  this.mult = 1; this.multT = 0; this.slowT = 0; this.pu = {};
  this.W = 360; this.H = 560;
  this.budget = this.timed ? Infinity : G.budget(level);
  this.left = this.budget;
  this.clockMax = this.timed ? G.timedSecs : (G.levelTime ? G.levelTime(level) : null);   // every level has a clock when the game defines levelTime
  this.timeLeft = this.clockMax;
  this.thr = this.timed ? Prog.timedThr(G) : Prog.thresholds(G, level);
  this.game = G.create(this);
  this.game.resize(this.W, this.H);
}
Run.prototype.resize = function (w, h) { this.W = w; this.H = h; this.game.resize(w, h); };
Run.prototype.addScore = function (n, x, y, color) {
  n = Math.round(n * this.mult); if (n <= 0) return;
  this.score += n; this.acts++; if (++this.run > this.bestRun) this.bestRun = this.run;
  if (this.ui) this.ui.fx(x, y, '+' + n, color);
};
Run.prototype.mistake = function (n) { this.mistakes += (n || 1); this.run = 0; this.acts++; };
Run.prototype.setLeft = function (n) { this.left = n; };
Run.prototype.sfx = function (k) { if (this.ui) this.ui.sfx(k); };
Run.prototype.burst = function (x, y, color, n) { if (this.ui) this.ui.burst(x, y, color, n); };
Run.prototype.say = function (s) { if (this.ui) this.ui.say(s); };
Run.prototype.finish = function (info) {
  if (this.over) return;
  this.over = true;
  info = info || {}; info.score = this.score;
  var stars = this.timed ? Prog.medalFor(this.G, this.score) : Prog.starsFor(this.G, this.level, this.score, info);
  var allowed = Prog.allowedMistakes(this.level), goal = this.thr && this.thr[2] ? this.score / this.thr[2] : 0;
  if (this.G.stars && !this.timed) goal = stars / 3;
  var style = Prog.styleOf(this.mistakes, allowed, goal, this.bestRun / Math.max(1, this.acts));
  this.result = { score: this.score, stars: stars, info: info, mistakes: this.mistakes, style: style,
    perfect: !this.timed && stars === 3 && this.mistakes === 0 && style >= 90 && !this.helper };
};
/* Power-ups: once per run each. Returns true if it took effect. */
Run.prototype.usePower = function (id) {
  if (this.over || this.pu[id]) return false;
  if (id === 'time') { if (this.timeLeft == null) return false; this.timeLeft += 15; this.clockMax += 15; }
  else if (id === 'x2') { this.mult = 2; this.multT = 20; }
  else if (id === 'slow') { this.slowT = 20; }
  else return false;
  this.pu[id] = true; this.helper = true; return true;
};
Run.prototype.step = function (dt) {
  if (this.over) return;
  this.t += dt;
  if (this.multT > 0) { this.multT -= dt; if (this.multT <= 0) this.mult = 1; }
  var gdt = dt; if (this.slowT > 0) { this.slowT -= dt; gdt = dt * 0.6; }
  this.game.update(gdt);
  if (this.timeLeft != null && !this.over) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.finish({ timeUp: true }); }
  }
};
Run.prototype.draw = function (c) { this.game.draw(c); };

/* Headless simulation used by the audit tests. */
function simulate(G, level, timed, seed, skill, maxSecs) {
  var run = new Run(G, level, timed, seed, null, skill);
  var dt = 1 / 30, cap = (maxSecs || 900) / dt, n = 0;
  while (!run.over && n++ < cap) {
    if (run.game.bot) run.game.bot(dt);
    run.step(dt);
  }
  if (!run.over) run.finish({ capped: true });
  return run.result;
}
if (typeof module !== 'undefined') module.exports = { Games: Games, Run: Run, simulate: simulate, mulberry: mulberry };
