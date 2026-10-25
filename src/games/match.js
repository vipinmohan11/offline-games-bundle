'use strict';
/* Dice Match: swap neighbours to line up 3+ same dice. 4 in a row makes a bomb, 5 makes a rainbow die. */
(function () {
  var COLS = 7, ROWS = 8, D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function Match(env) {
    var l = env.level, T = env.timed;
    this.env = env;
    this.nv = 6;
    this.stones = T ? 0 : Math.min(10, Math.floor(l / 4));
    this.g = [];
    for (var r = 0; r < ROWS; r++) { this.g.push([]); for (var c = 0; c < COLS; c++) this.g[r].push(null); }
    this.moves = T ? Infinity : env.budget;
    this.state = 'idle'; this.timer = 0; this.chain = 0; this.sel = null; this.shake = 0; this.swapA = null; this.hintM = null; this.hintT = 0;
    this.fillBoard();
    env.setLeft(this.moves);
  }
  Match.prototype.rand = function (n) { return Math.floor(this.env.rnd() * n); };
  Match.prototype.newDie = function () { return { v: 1 + this.rand(this.nv), s: 0, oy: 0 }; };
  Match.prototype.fillBoard = function () {
    var g = this.g, r, c, tries = 0;
    do {
      for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) g[r][c] = this.newDie();
      var m;
      while ((m = this.findMatches(g)).cells.length && tries++ < 200) m.cells.forEach(function (p) { g[p[0]][p[1]] = this.newDie(); }, this);
    } while (!this.bestSwap() && tries++ < 400);
    var k = 0;
    while (k < this.stones) {
      r = this.rand(ROWS); c = this.rand(COLS);
      if (this.g[r][c].s === 3) continue;
      this.g[r][c] = { v: 0, s: 3, oy: 0 }; k++;
    }
    if (this.stones && !this.bestSwap()) { this.stones = Math.max(0, this.stones - 2); this.fillBoard(); }
  };
  Match.prototype.findMatches = function (g) {
    var mark = {}, cells = [], runs = [], r, c, k;
    function add(r_, c_) { var key = r_ * 10 + c_; if (!mark[key]) { mark[key] = 1; cells.push([r_, c_]); } }
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS - 2;) {
      var a = g[r][c]; if (!a || a.s === 2 || a.s === 3) { c++; continue; }
      k = c + 1; while (k < COLS && g[r][k] && g[r][k].s !== 2 && g[r][k].v === a.v) k++;
      if (k - c >= 3) { runs.push({ r: r, c: c, len: k - c, h: true }); for (var i = c; i < k; i++) add(r, i); }
      c = k;
    }
    for (c = 0; c < COLS; c++) for (r = 0; r < ROWS - 2;) {
      var b = g[r][c]; if (!b || b.s === 2 || b.s === 3) { r++; continue; }
      k = r + 1; while (k < ROWS && g[k][c] && g[k][c].s !== 2 && g[k][c].v === b.v) k++;
      if (k - r >= 3) { runs.push({ r: r, c: c, len: k - r, h: false }); for (var j = r; j < k; j++) add(j, c); }
      r = k;
    }
    return { cells: cells, runs: runs };
  };
  Match.prototype.swapCells = function (g, a, b) { var t = g[a[0]][a[1]]; g[a[0]][a[1]] = g[b[0]][b[1]]; g[b[0]][b[1]] = t; };
  Match.prototype.adjacent = function (a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; };
  Match.prototype.validSwap = function (a, b) {
    var da = this.g[a[0]][a[1]], db = this.g[b[0]][b[1]];
    if (da.s === 3 || db.s === 3) return false;
    if (da.s === 2 || db.s === 2) return true;
    this.swapCells(this.g, a, b);
    var ok = this.findMatches(this.g).cells.length > 0;
    this.swapCells(this.g, a, b);
    return ok;
  };
  Match.prototype.bestSwap = function (randomPick) {
    var opts = [], r, c;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      [[0, 1], [1, 0]].forEach(function (d) {
        var r2 = r + d[0], c2 = c + d[1]; if (r2 >= ROWS || c2 >= COLS) return;
        var a = [r, c], b = [r2, c2];
        if (!this.g[r][c] || !this.g[r2][c2]) return;
        if (!this.validSwap(a, b)) return;
        // score by number of matched dice
        var da = this.g[r][c], db = this.g[r2][c2], val;
        if (da.s === 2 || db.s === 2) val = 40;
        else { this.swapCells(this.g, a, b); var m = this.findMatches(this.g); val = m.cells.length * 10 + m.runs.filter(function (x) { return x.len >= 4; }).length * 40 + (r2 > r || c2 > c ? 0 : 0) + (ROWS - Math.min(r, r2)) * 0.6; this.swapCells(this.g, a, b); }
        opts.push({ a: a, b: b, val: val });
      }, this);
    }
    if (!opts.length) return null;
    opts.sort(function (x, y) { return y.val - x.val; });
    return randomPick ? opts[Math.min(opts.length - 1, this.rand(Math.min(opts.length, 6)))] : opts[0];
  };
  Match.prototype.trySwap = function (a, b) {
    if (this.state !== 'idle' || this.env.over) return false;
    if (!this.adjacent(a, b)) return false;
    if (!this.validSwap(a, b)) { this.shake = 0.25; this.env.sfx('bad'); this.env.mistake(); return false; }
    this.swapCells(this.g, a, b);
    this.swapA = [a, b]; this.chain = 0; this.sel = null; this.hintM = null;
    if (this.moves !== Infinity) { this.moves--; this.env.setLeft(this.moves); }
    this.processSwap(a, b);
    return true;
  };
  Match.prototype.processSwap = function (a, b) {
    var da = this.g[a[0]][a[1]], db = this.g[b[0]][b[1]];
    // rainbow die: swapped with a normal die clears every die of that value
    if (da.s === 2 || db.s === 2) {
      var rb = da.s === 2 ? a : b, other = da.s === 2 ? db : da, kill = [rb];
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) if (this.g[r][c] && this.g[r][c].v === other.v && this.g[r][c].s < 2) kill.push([r, c]);
      this.startClear({ cells: kill, runs: [] }, true);
      return;
    }
    this.resolve();
  };
  Match.prototype.resolve = function () {
    var m = this.findMatches(this.g);
    if (!m.cells.length) { this.afterResolve(); return; }
    this.startClear(m, false);
  };
  Match.prototype.startClear = function (m, rainbow) {
    this.chain++;
    var cells = m.cells.slice(), mark = {}, i;
    cells.forEach(function (p) { mark[p[0] * 10 + p[1]] = 1; });
    // bombs explode 3x3
    var queue = cells.slice();
    while (queue.length) {
      var p = queue.pop(), d = this.g[p[0]][p[1]];
      if (d && d.s === 1) for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        var rr_ = p[0] + dr, cc = p[1] + dc;
        if (rr_ < 0 || rr_ >= ROWS || cc < 0 || cc >= COLS || mark[rr_ * 10 + cc] || !this.g[rr_][cc]) continue;
        mark[rr_ * 10 + cc] = 1; cells.push([rr_, cc]); queue.push([rr_, cc]);
      }
    }
    var crumbled = 0, base = cells.length;
    for (i = 0; i < base; i++) {
      var q0 = cells[i];
      D4.forEach(function (d) {
        var a = q0[0] + d[0], b = q0[1] + d[1];
        if (a >= 0 && a < ROWS && b >= 0 && b < COLS && this.g[a][b] && this.g[a][b].s === 3 && !mark[a * 10 + b]) { mark[a * 10 + b] = 1; cells.push([a, b]); crumbled++; }
      }, this);
    }
    // specials created from 4/5 runs (placed at the swapped cell if inside the run, else run start)
    var specials = [];
    m.runs.forEach(function (run) {
      if (run.len < 4) return;
      var pos = null, sw = this.swapA;
      for (i = 0; i < run.len; i++) {
        var q = run.h ? [run.r, run.c + i] : [run.r + i, run.c];
        if (sw && ((q[0] === sw[0][0] && q[1] === sw[0][1]) || (q[0] === sw[1][0] && q[1] === sw[1][1]))) pos = q;
      }
      if (!pos) pos = run.h ? [run.r, run.c + Math.floor(run.len / 2)] : [run.r + Math.floor(run.len / 2), run.c];
      specials.push({ pos: pos, s: run.len >= 5 ? 2 : 1, v: this.g[pos[0]][pos[1]].v });
    }, this);
    var n = cells.length, pts = n * 10 * Math.min(this.chain, 4) + specials.length * 30 + (rainbow ? 40 : 0) + crumbled * 15;
    var cx = 0, cy = 0; cells.forEach(function (p) { cx += p[1]; cy += p[0]; });
    this.env.addScore(pts, this.ox + (cx / n + 0.5) * this.cell, this.oy + (cy / n + 0.5) * this.cell, this.chain > 1 ? '#ffd43b' : '#fff');
    this.env.sfx(this.chain > 1 ? 'combo' : 'pop');
    if (this.chain > 1) this.env.say('Combo x' + this.chain + '!');
    this.clearing = { cells: cells, specials: specials, t: 0.25 }; this.state = 'clear';
  };
  Match.prototype.finishClear = function () {
    var cl = this.clearing, self = this;
    cl.cells.forEach(function (p) {
      var d = self.g[p[0]][p[1]];
      if (d) self.env.burst(self.ox + (p[1] + 0.5) * self.cell, self.oy + (p[0] + 0.5) * self.cell, Skin.cur.faces[Math.max(0, d.v - 1)], 4);
      self.g[p[0]][p[1]] = null;
    });
    cl.specials.forEach(function (sp) { self.g[sp.pos[0]][sp.pos[1]] = { v: sp.v, s: sp.s, oy: 0 }; });
    this.clearing = null;
    // gravity + refill with fall animation offsets
    for (var c = 0; c < COLS; c++) {
      var w = ROWS - 1, r;
      for (r = ROWS - 1; r >= 0; r--) if (this.g[r][c]) { var d = this.g[r][c]; this.g[r][c] = null; d.oy -= (w - r); this.g[w][c] = d; w--; }
      var k = 0;
      for (r = w; r >= 0; r--) { var nd = this.newDie(); nd.oy = -(w + 1) - 0.0 - k * 0; this.g[r][c] = nd; }
    }
    this.state = 'fall';
  };
  Match.prototype.afterResolve = function () {
    this.chain = 0; this.swapA = null;
    if (!this.bestSwap()) { this.env.say('Shuffle!'); this.fillBoard(); }
    this.state = 'idle';
    if (this.moves !== Infinity && this.moves <= 0) this.env.finish({ done: true });
  };
  Match.prototype.update = function (dt) {
    this.hintT -= dt; if (this.shake > 0) this.shake -= dt;
    if (this.state === 'clear') { this.clearing.t -= dt; if (this.clearing.t <= 0) this.finishClear(); }
    else if (this.state === 'fall') {
      var moving = false;
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var d = this.g[r][c]; if (d && d.oy < 0) { d.oy = Math.min(0, d.oy + dt * 14); if (d.oy < 0) moving = true; }
      }
      if (!moving) { this.state = 'settle'; this.resolve(); if (this.state === 'settle') this.state = 'idle'; }
    }
  };
  Match.prototype.bot = function (dt) {
    if (this.state !== 'idle' || this.env.over || !botReady(this, dt)) return;
    botDone(this);
    var m = this.bestSwap(this.env.rnd() < this.env.skill.eps);
    if (m) this.trySwap(m.a, m.b);
  };
  Match.prototype.showHint = function () { this.hintM = this.bestSwap(false); this.hintT = 4; };
  Match.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    this.cell = Math.max(8, Math.floor(Math.min(W * 0.97 / COLS, (H - 8) / ROWS)));
    this.ox = Math.floor((W - this.cell * COLS) / 2);
    this.oy = Math.floor((H - this.cell * ROWS) / 2);
  };
  Match.prototype.draw = function (c) {
    var s = this.cell, ox = this.ox, oy = this.oy, r, cc, mark = {};
    boardBg(c, ox, oy, s * COLS, s * ROWS);
    if (this.clearing) this.clearing.cells.forEach(function (p) { mark[p[0] * 10 + p[1]] = 1; });
    var blink = Math.floor(this.env.t * 20) % 2;
    for (r = 0; r < ROWS; r++) for (cc = 0; cc < COLS; cc++) {
      var d = this.g[r][cc]; if (!d) continue;
      var x = ox + cc * s, y = oy + (r + d.oy) * s;
      if (y < oy - s * 0.2 && d.oy < 0) { c.save(); c.beginPath(); c.rect(ox, oy, s * COLS, s * ROWS); c.clip(); }
      else c.save();
      if (this.shake > 0 && this.sel) x += Math.sin(this.env.t * 60) * 2;
      var m = mark[r * 10 + cc];
      if (d.s === 3) { rr(c, x + 3, y + 3, s - 6, s - 6, s * 0.22); c.fillStyle = m && blink ? '#ced4da' : '#868e96'; c.fill(); text(c, '🪨', x + s / 2, y + s / 2, s * 0.55); }
      else if (d.s === 2) {
        drawDie(c, x, y, s, d.v, { color: '#f8f9fa', pip: '#f8f9fa', alpha: m && blink ? 0.4 : 1 });
        var cols = Skin.cur.faces; for (var i = 0; i < 6; i++) { c.fillStyle = cols[i]; c.beginPath(); c.arc(x + s * 0.5 + Math.cos(i * 1.047 + this.env.t * 2) * s * 0.26, y + s * 0.5 + Math.sin(i * 1.047 + this.env.t * 2) * s * 0.26, s * 0.1, 0, 6.3); c.fill(); }
      } else {
        drawDie(c, x, y, s, d.v, { alpha: m && blink ? 0.4 : 1, scale: m ? 1.08 : 1, stroke: d.s === 1 ? '#fff' : null });
        if (d.s === 1) text(c, '💣', x + s * 0.8, y + s * 0.2, s * 0.32);
      }
      c.restore();
    }
    if (this.sel) { rr(c, ox + this.sel[1] * s + 1, oy + this.sel[0] * s + 1, s - 2, s - 2, s * 0.2); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); }
    if (this.hintM && this.hintT > 0 && this.state === 'idle') {
      var pul = 0.5 + 0.5 * Math.sin(this.env.t * 8);
      [this.hintM.a, this.hintM.b].forEach(function (p) { rr(c, ox + p[1] * s + 1, oy + p[0] * s + 1, s - 2, s - 2, s * 0.2); c.strokeStyle = 'rgba(255,212,59,' + (0.4 + pul * 0.6) + ')'; c.lineWidth = 4; c.stroke(); });
    }
  };
  Match.prototype.cellAt = function (x, y) {
    var c = Math.floor((x - this.ox) / this.cell), r = Math.floor((y - this.oy) / this.cell);
    return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? [r, c] : null;
  };
  Match.prototype.pd = function (x, y) { this.start = this.cellAt(x, y); this.sx = x; this.sy = y; this.did = false; };
  Match.prototype.pm = function (x, y) {
    if (!this.start || this.did) return;
    var dx = x - this.sx, dy = y - this.sy, th = this.cell * 0.4;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    var t = Math.abs(dx) > Math.abs(dy) ? [this.start[0], this.start[1] + (dx > 0 ? 1 : -1)] : [this.start[0] + (dy > 0 ? 1 : -1), this.start[1]];
    this.did = true;
    if (t[0] >= 0 && t[0] < ROWS && t[1] >= 0 && t[1] < COLS) this.trySwap(this.start, t);
    this.sel = null;
  };
  Match.prototype.pu = function (x, y) {
    if (this.did || !this.start) { this.start = null; return; }
    var p = this.cellAt(x, y);
    if (p && this.state === 'idle') {
      if (this.sel && this.adjacent(this.sel, p)) { this.trySwap(this.sel, p); this.sel = null; }
      else { this.sel = p; this.env.sfx('tick'); }
    }
    this.start = null;
  };
  Match.prototype.btn = function (k) { if (k === 'hint') this.showHint(); };

  Games.match = {
    id: 'match', name: 'Dice Match', icon: '💎', color: '#f06595', unit: 'Moves',
    blurb: 'Swap dice, match 3, make bombs!', how: 'Swap two neighbours to line up 3 or more same dice. 4 in a row makes a bomb, 5 makes a rainbow die.', howDe: 'Tausche zwei Nachbarn, bis 3 oder mehr gleiche in einer Reihe sind. 4 machen eine Bombe, 5 einen Regenbogen-Würfel.',
    par: 78, budget: function () { return 28; }, timedPar: 32, timedSecs: 90,
    controls: [{ k: 'hint', t: '💡 Hint' }],
    create: function (env) { return new Match(env); }
  };
})();
