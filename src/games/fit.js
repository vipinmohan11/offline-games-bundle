'use strict';
/* Dice Fit: drag 3 dice-shapes onto an 8x8 board. Full rows/columns clear and score their pips. */
(function () {
  var N = 8;
  var T1 = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]]];
  var T2 = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [1, 1]], [[1, 0], [0, 1], [1, 1], [1, 2]], [[0, 0], [0, 1], [0, 2], [1, 2]], [[1, 0], [1, 1], [1, 2], [0, 2]], [[0, 0], [1, 0], [2, 0], [0, 1]], [[0, 0], [1, 0], [2, 0], [2, 1]]];
  var T3 = [[[0, 0], [1, 0], [1, 1], [2, 1]], [[1, 0], [2, 0], [0, 1], [1, 1]], [[0, 0], [0, 1], [1, 1], [1, 2]], [[1, 0], [1, 1], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]];

  function Fit(env) {
    var l = env.level, T = env.timed;
    this.env = env;
    this.g = []; for (var r = 0; r < N; r++) this.g.push(new Array(N).fill(0));
    this.pool = T1.slice();
    if (T || l >= 6) this.pool = this.pool.concat(T2);
    if (!T && l >= 24) this.pool = this.pool.concat(T3);
    this.placed = 0; this.streak = 0; this.drag = null; this.hint = null; this.hintT = 0; this.over = false;
    this.prefill(T ? 0 : Math.min(10, Math.floor(l * 0.25) + (l > 5 ? 2 : 0)));
    this.tray = [null, null, null];
    this.refill();
  }
  Fit.prototype.rand = function (n) { return Math.floor(this.env.rnd() * n); };
  Fit.prototype.prefill = function (n) {
    var k = 0, g = this.g;
    while (k < n) {
      var r = this.rand(N), c = this.rand(N);
      if (g[r][c]) continue;
      g[r][c] = 1 + this.rand(6); k++;
      var fl0 = this.fullLines(g); if (fl0.rows.length || fl0.cols.length) { g[r][c] = 0; k--; }
    }
  };
  Fit.prototype.makeShape = function () {
    var sh = this.pool[this.rand(this.pool.length)];
    return { cells: sh.map(function (c) { return [c[0], c[1], 1 + this.rand(6)]; }, this) };
  };
  Fit.prototype.pieceFits = function (p) {
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if (this.canPlace(p.cells, x, y)) return true;
    return false;
  };
  Fit.prototype.refill = function () {
    // Fair tray: early levels need every piece to fit somewhere, later levels at least one.
    var strict = !this.env.timed && this.env.level < 10, i, tries;
    for (tries = 0; tries < 40; tries++) {
      for (i = 0; i < 3; i++) this.tray[i] = this.makeShape();
      var fits = this.tray.filter(function (p) { return this.pieceFits(p); }, this).length;
      if (strict ? fits === 3 : fits >= 1) return;
    }
    for (i = 0; i < 3; i++) this.tray[i] = { cells: [[0, 0, 1 + this.rand(6)]] };
    if (!this.anyFits()) this.env.finish({ stuck: true });
  };
  Fit.prototype.canPlace = function (cells, x, y) {
    for (var i = 0; i < cells.length; i++) {
      var cx = x + cells[i][0], cy = y + cells[i][1];
      if (cx < 0 || cy < 0 || cx >= N || cy >= N || this.g[cy][cx]) return false;
    }
    return true;
  };
  Fit.prototype.anyFits = function () {
    for (var i = 0; i < 3; i++) {
      var p = this.tray[i]; if (!p) continue;
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if (this.canPlace(p.cells, x, y)) return true;
    }
    return false;
  };
  Fit.prototype.fullLines = function (g) {
    var rows = [], cols = [], r, c;
    for (r = 0; r < N; r++) { var f = true; for (c = 0; c < N; c++) if (!g[r][c]) { f = false; break; } if (f) rows.push(r); }
    for (c = 0; c < N; c++) { var f2 = true; for (r = 0; r < N; r++) if (!g[r][c]) { f2 = false; break; } if (f2) cols.push(c); }
    return { rows: rows, cols: cols };
  };
  /* Apply a placement to grid g; returns {pts, lines}. mutate=false works on a copy. */
  Fit.prototype.apply = function (g, cells, x, y, streak) {
    var i, r, c;
    for (i = 0; i < cells.length; i++) g[y + cells[i][1]][x + cells[i][0]] = cells[i][2];
    var fl = this.fullLines(g), lines = 0, pips = 0;
    if (fl.rows.length || fl.cols.length) {
      var kill = {};
      fl.rows.forEach(function (rw) { for (c = 0; c < N; c++) kill[rw * N + c] = 1; });
      fl.cols.forEach(function (cl) { for (r = 0; r < N; r++) kill[r * N + cl] = 1; });
      lines = fl.rows.length + fl.cols.length;
      for (var k in kill) { var kr = Math.floor(k / N), kc = k % N; pips += g[kr][kc]; g[kr][kc] = 0; }
      fl.kill = kill;
    }
    var mult = 1 + 0.5 * Math.min(streak, 4);
    var pts = cells.length * 2 + (lines ? Math.round(pips * lines * mult) : 0);
    return { pts: pts, lines: lines, kill: fl.kill };
  };
  Fit.prototype.place = function (idx, x, y) {
    var p = this.tray[idx];
    if (!p || !this.canPlace(p.cells, x, y)) return false;
    var s = this.cell, ox = this.ox, oy = this.oy;
    var fitBefore = this.tray.map(function (q, k) { return q && k !== idx && this.pieceFits(q); }, this);
    var res = this.apply(this.g, p.cells, x, y, this.streak);
    this.streak = res.lines ? this.streak + 1 : 0;
    this.placed++;
    this.tray[idx] = null;
    this.env.sfx(res.lines ? 'combo' : 'thud');
    this.env.addScore(res.pts, ox + (x + 0.5) * s, oy + (y + 0.5) * s, res.lines ? '#ffd43b' : '#fff');
    if (res.lines) {
      this.env.say(res.lines > 1 ? res.lines + ' lines!' : (this.streak > 1 ? 'Combo x' + this.streak : 'Line!'));
      for (var k in res.kill) this.env.burst(ox + ((k % N) + 0.5) * s, oy + (Math.floor(k / N) + 0.5) * s, '#ffd43b', 2);
    }
    this.hint = null;
    this.env.setLeft(this.env.budget - this.placed);
    if (!this.env.timed && this.placed >= this.env.budget) { this.env.finish({ done: true }); return true; }
    if (this.tray.some(function (q, k) { return q && fitBefore[k] && !this.pieceFits(q); }, this)) this.env.mistake();   // blocked a waiting shape
    if (this.tray.every(function (t) { return !t; })) this.refill();
    else if (!this.anyFits()) this.env.finish({ stuck: true });
    return true;
  };
  /* Best placement over the tray; the same function drives hints and the bot. */
  Fit.prototype.bestMove = function (randomPick) {
    var opts = [];
    for (var i = 0; i < 3; i++) {
      var p = this.tray[i]; if (!p) continue;
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
        if (!this.canPlace(p.cells, x, y)) continue;
        var g = this.g.map(function (r) { return r.slice(); });
        var res = this.apply(g, p.cells, x, y, this.streak);
        var holes = 0, edge = 0, r, c;
        for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (!g[r][c]) {
          var nb = 0;
          if (r === 0 || g[r - 1][c]) nb++; if (r === N - 1 || g[r + 1][c]) nb++;
          if (c === 0 || g[r][c - 1]) nb++; if (c === N - 1 || g[r][c + 1]) nb++;
          if (nb >= 4) holes += 3; else if (nb === 3) holes += 1;
        }
        opts.push({ i: i, x: x, y: y, val: res.pts * 1.2 + res.lines * 25 - holes * 4 });
      }
    }
    if (!opts.length) return null;
    opts.sort(function (a, b) { return b.val - a.val; });
    return randomPick ? opts[Math.min(opts.length - 1, Math.floor(this.env.rnd() * Math.min(opts.length, 8)))] : opts[0];
  };
  Fit.prototype.showHint = function () { this.hint = this.bestMove(false); this.hintT = 4; };
  Fit.prototype.bot = function (dt) {
    if (this.env.over || !botReady(this, dt)) return;
    botDone(this);
    var m = this.bestMove(this.env.rnd() < this.env.skill.eps);
    if (m) this.place(m.i, m.x, m.y);
  };
  Fit.prototype.update = function (dt) { this.hintT -= dt; };

  Fit.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    var land = W / H > 1.15;
    this.land = land;
    var bs = land ? Math.min(H * 0.96, W * 0.62) : Math.min(W * 0.97, H * 0.64);
    this.cell = Math.max(8, Math.floor(bs / N));
    var bw = this.cell * N;
    if (land) { this.ox = Math.floor((W * 0.62 - bw) / 2) + 6; this.oy = Math.floor((H - bw) / 2); }
    else { this.ox = Math.floor((W - bw) / 2); this.oy = 6; }
    // tray slots
    this.slots = [];
    var ts = this.cell * 0.55, i;
    for (i = 0; i < 3; i++) {
      if (land) this.slots.push({ x: this.ox + bw + (W - this.ox - bw) / 2 - ts * 2.5, y: this.oy + i * (bw / 3) + (bw / 3 - ts * 5) / 2, w: ts * 5, h: ts * 5, ts: ts });
      else { var sw = (W - 12) / 3; this.slots.push({ x: 6 + i * sw + (sw - ts * 5) / 2, y: this.oy + bw + 14 + Math.max(0, (H - bw - 20 - ts * 5) / 2 - 6), w: ts * 5, h: ts * 5, ts: ts }); }
    }
  };
  Fit.prototype.slotCells = function (i, s, cx, cy) {
    var p = this.tray[i], w = 0, h = 0;
    p.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); });
    return { p: p, w: w, h: h, x: cx - w * s / 2, y: cy - h * s / 2 };
  };
  Fit.prototype.draw = function (c) {
    var s = this.cell, ox = this.ox, oy = this.oy, r, cc, i;
    boardBg(c, ox, oy, s * N, s * N);
    for (r = 0; r < N; r++) for (cc = 0; cc < N; cc++) {
      rr(c, ox + cc * s + 2, oy + r * s + 2, s - 4, s - 4, s * 0.15); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
      if (this.g[r][cc]) drawDie(c, ox + cc * s, oy + r * s, s, this.g[r][cc]);
    }
    // rows and columns that are one die from full glow softly
    var gl, gr, gc, rowN, colN;
    for (gl = 0; gl < N; gl++) {
      rowN = 0; colN = 0;
      for (gr = 0; gr < N; gr++) { if (this.g[gl][gr]) rowN++; if (this.g[gr][gl]) colN++; }
      if (rowN === N - 1) { rr(c, ox, oy + gl * s, N * s, s, s * 0.2); c.fillStyle = 'rgba(255,212,59,0.13)'; c.fill(); }
      if (colN === N - 1) { rr(c, ox + gl * s, oy, s, N * s, s * 0.2); c.fillStyle = 'rgba(255,212,59,0.13)'; c.fill(); }
    }
    var d = this.drag;
    if (d && d.gx != null) {
      var p = this.tray[d.i], ok = this.canPlace(p.cells, d.gx, d.gy);
      if (ok) {
        var g2 = this.g.map(function (rw) { return rw.slice(); });
        var res = this.apply(g2, p.cells, d.gx, d.gy, 0);
        if (res.kill) for (var k in res.kill) { rr(c, ox + (k % N) * s + 1, oy + Math.floor(k / N) * s + 1, s - 2, s - 2, s * 0.2); c.strokeStyle = '#ffd43b'; c.lineWidth = 3; c.stroke(); }
      }
      for (i = 0; i < p.cells.length; i++) {
        rr(c, ox + (d.gx + p.cells[i][0]) * s + 2, oy + (d.gy + p.cells[i][1]) * s + 2, s - 4, s - 4, s * 0.15);
        c.fillStyle = ok ? 'rgba(140,233,154,0.45)' : 'rgba(255,107,107,0.4)'; c.fill();
      }
    }
    if (this.hint && this.hintT > 0) {
      var h = this.hint, hp = this.tray[h.i];
      if (hp) for (i = 0; i < hp.cells.length; i++) drawDie(c, ox + (h.x + hp.cells[i][0]) * s, oy + (h.y + hp.cells[i][1]) * s, s, hp.cells[i][2], { alpha: 0.45 + 0.3 * Math.sin(this.env.t * 8), stroke: '#ffd43b' });
    }
    for (i = 0; i < 3; i++) {
      var sl = this.slots[i];
      rr(c, sl.x - 4, sl.y - 4, sl.w + 8, sl.h + 8, 12); c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 2; c.stroke();
      if (!this.tray[i] || (d && d.i === i)) continue;
      var sc = this.slotCells(i, sl.ts, sl.x + sl.w / 2, sl.y + sl.h / 2);
      sc.p.cells.forEach(function (q) { drawDie(c, sc.x + q[0] * sl.ts, sc.y + q[1] * sl.ts, sl.ts, q[2]); });
    }
    if (d) {
      var dp = this.tray[d.i];
      dp.cells.forEach(function (q) { drawDie(c, d.x + q[0] * s, d.y + q[1] * s, s, q[2], { alpha: 0.92 }); });
    }
  };
  Fit.prototype.pd = function (x, y) {
    for (var i = 0; i < 3; i++) {
      var sl = this.slots[i];
      if (this.tray[i] && x >= sl.x - 14 && x <= sl.x + sl.w + 14 && y >= sl.y - 14 && y <= sl.y + sl.h + 14) {
        var p = this.tray[i], w = 0, h = 0;
        p.cells.forEach(function (c) { w = Math.max(w, c[0] + 1); h = Math.max(h, c[1] + 1); });
        this.drag = { i: i, w: w, h: h, x: 0, y: 0, gx: null, gy: null };
        this.pm(x, y); this.env.sfx('tick');
        return;
      }
    }
  };
  Fit.prototype.pm = function (x, y) {
    var d = this.drag; if (!d) return;
    var s = this.cell, lift = s * 1.7;
    d.x = x - d.w * s / 2; d.y = y - d.h * s / 2 - lift;
    var gx = Math.round((d.x - this.ox) / s), gy = Math.round((d.y - this.oy) / s);
    d.gx = (gx > -d.w && gx < N && gy > -d.h && gy < N) ? gx : null; d.gy = gy;
  };
  Fit.prototype.pu = function () {
    var d = this.drag; this.drag = null; if (!d) return;
    if (d.gx != null) this.place(d.i, d.gx, d.gy);
  };
  Fit.prototype.btn = function (k) { if (k === 'hint') this.showHint(); };

  Games.fit = {
    id: 'fit', name: 'Dice Fit', icon: '🧩', color: '#12b886', unit: 'Moves',
    blurb: 'Drag dice shapes. Fill lines to clear!', how: 'Drag a shape onto the board. Full rows or columns clear and score their dice pips.', howDe: 'Ziehe eine Form auf das Feld. Volle Reihen oder Spalten verschwinden.',
    par: 15, budget: function (l) { return 16 + Math.floor(l / 2); }, timedPar: 6.4, timedSecs: 90,
    controls: [{ k: 'hint', t: '💡 Hint' }],
    create: function (env) { return new Fit(env); }
  };
})();
