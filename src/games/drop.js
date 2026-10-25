'use strict';
/* Dice Drop: falling joined dice. 3+ touching dice with the same face vanish; chains multiply. */
(function () {
  var COLS = 6, ROWS = 11;
  var SHAPES = [[[0, 0], [1, 0]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [0, 1]]];

  function rot(cells) {
    var r = cells.map(function (c) { return [-c[1], c[0], c[2]]; });
    var mx = Math.min.apply(null, r.map(function (c) { return c[0]; }));
    var my = Math.min.apply(null, r.map(function (c) { return c[1]; }));
    return r.map(function (c) { return [c[0] - mx, c[1] - my, c[2]]; });
  }
  function width(cells) { return Math.max.apply(null, cells.map(function (c) { return c[0]; })) + 1; }

  function groups(g) {
    var seen = [], out = [], r, c;
    for (r = 0; r < ROWS; r++) seen.push(new Array(COLS).fill(false));
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      if (!g[r][c] || seen[r][c]) continue;
      var v = g[r][c], st = [[r, c]], grp = [];
      seen[r][c] = true;
      while (st.length) {
        var p = st.pop(); grp.push(p);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var rr_ = p[0] + d[0], cc = p[1] + d[1];
          if (rr_ >= 0 && rr_ < ROWS && cc >= 0 && cc < COLS && !seen[rr_][cc] && g[rr_][cc] === v) { seen[rr_][cc] = true; st.push([rr_, cc]); }
        });
      }
      if (grp.length >= 3) out.push(grp);
    }
    return out;
  }
  function gravity(g) {
    for (var c = 0; c < COLS; c++) {
      var w = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) if (g[r][c]) { var v = g[r][c]; g[r][c] = 0; g[w][c] = v; w--; }
    }
  }
  function copy(g) { return g.map(function (r) { return r.slice(); }); }
  function groupPts(n, chain) { return (n * 10 + (n - 3) * 10) * chain; }
  function chainSim(g) {
    var total = 0, chain = 0, gs;
    while ((gs = groups(g)).length) {
      chain++;
      gs.forEach(function (grp) { total += groupPts(grp.length, chain); grp.forEach(function (p) { g[p[0]][p[1]] = 0; }); });
      gravity(g);
    }
    return total;
  }

  function Drop(env) {
    var l = env.level, T = env.timed;
    this.env = env;
    this.g = []; for (var r = 0; r < ROWS; r++) this.g.push(new Array(COLS).fill(0));
    this.V = T ? 4 : Math.min(6, 3 + Math.floor((l - 1) / 6));
    this.base0 = T ? 0.8 : Math.max(0.34, 0.92 - 0.015 * l);
    this.base = this.base0;
    this.interval = this.base; this.timer = 0;
    this.pieces = Infinity;                     // pieces never run out: the 2-minute clock ends the level
    this.state = 'fall'; this.clr = null; this.chain = 0; this.hint = null; this.hintT = 0; this.botT = 0; this.plan = null;
    this.prefill(T ? 0 : Math.min(4, Math.floor(l / 8)));
    this.next = this.makePiece();
    this.spawn();
  }
  Drop.prototype.rand = function (n) { return Math.floor(this.env.rnd() * n); };
  Drop.prototype.prefill = function (rows) {
    var g = this.g, r, c, tries = 0;
    for (r = ROWS - rows; r < ROWS; r++) for (c = 0; c < COLS; c++) if (this.env.rnd() < 0.7) g[r][c] = 1 + this.rand(this.V);
    gravity(g);
    var gs;
    while ((gs = groups(g)).length && tries++ < 50) gs.forEach(function (grp) { grp.forEach(function (p) { g[p[0]][p[1]] = 1 + this.rand(this.V); }, this); }, this);
    gs = groups(g);
    gs.forEach(function (grp) { grp.forEach(function (p) { g[p[0]][p[1]] = 0; }); });
    gravity(g);
  };
  Drop.prototype.makePiece = function () {
    var l = this.env.level, p3 = this.env.timed ? 0.3 : l < 8 ? 0 : l < 20 ? 0.25 : 0.4;
    var sh = this.env.rnd() < p3 ? SHAPES[1 + this.rand(2)] : SHAPES[0];
    var cells = sh.map(function (c) { return [c[0], c[1], 1 + this.rand(this.V)]; }, this);
    for (var i = this.rand(4); i > 0; i--) cells = rot(cells);
    return cells;
  };
  Drop.prototype.collide = function (cells, x, y) {
    for (var i = 0; i < cells.length; i++) {
      var cx = x + cells[i][0], cy = y + cells[i][1];
      if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
      if (cy >= 0 && this.g[cy][cx]) return true;
    }
    return false;
  };
  Drop.prototype.spawn = function () {
    if (!this.env.timed && this.pieces <= 0) { this.env.finish({ done: true }); return; }
    this.cur = { cells: this.next, x: Math.floor((COLS - width(this.next)) / 2), y: 0 };
    this.next = this.makePiece();
    this.pieces--;
    this.env.setLeft(Math.max(0, this.pieces));
    this.state = 'fall'; this.timer = 0; this.plan = null;
    if (this.collide(this.cur.cells, this.cur.x, 0)) { this.env.finish({ overflow: true }); }
  };
  Drop.prototype.move = function (d) { if (this.state === 'fall' && !this.collide(this.cur.cells, this.cur.x + d, this.cur.y)) this.cur.x += d; };
  Drop.prototype.rotate = function () {
    if (this.state !== 'fall') return;
    var rc = rot(this.cur.cells), ks = [0, -1, 1, -2, 2];
    for (var i = 0; i < ks.length; i++) if (!this.collide(rc, this.cur.x + ks[i], this.cur.y)) { this.cur.cells = rc; this.cur.x += ks[i]; this.env.sfx('tick'); return; }
  };
  Drop.prototype.land = function (cells, x) {
    var y = 0; while (!this.collide(cells, x, y + 1)) y++; return y;
  };
  Drop.prototype.hard = function () { if (this.state !== 'fall') return; this.cur.y = this.land(this.cur.cells, this.cur.x); this.lock(); };
  Drop.prototype.lock = function () {
    var c = this.cur;
    for (var i = 0; i < c.cells.length; i++) {
      var y = c.y + c.cells[i][1];
      if (y < 0) { this.env.finish({ overflow: true }); return; }
      this.g[y][c.x + c.cells[i][0]] = c.cells[i][2];
    }
    this.env.sfx('thud');
    gravity(this.g);
    this.chain = 0; this.cur = null; this.resolve();
  };
  Drop.prototype.resolve = function () {
    var gs = groups(this.g);
    if (!gs.length) {
      this.chain = 0;
      var hh = 0; for (var cc = 0; cc < COLS; cc++) { var rr0 = 0; while (rr0 < ROWS && !this.g[rr0][cc]) rr0++; hh = Math.max(hh, ROWS - rr0); }
      if (hh >= ROWS - 3) { if (!this.hot) { this.hot = true; this.env.mistake(); } } else if (hh < ROWS - 4) this.hot = false;   // stack got dangerously high
      this.spawn(); return;
    }
    this.chain++;
    var cells = [], self = this;
    gs.forEach(function (grp) {
      var pts = groupPts(grp.length, self.chain), sx = 0, sy = 0;
      grp.forEach(function (p) { cells.push(p); sx += p[1]; sy += p[0]; });
      self.env.addScore(pts, self.ox + (sx / grp.length + 0.5) * self.cell, self.oy + (sy / grp.length + 0.5) * self.cell, self.chain > 1 ? '#ffd43b' : '#fff');
    });
    this.env.sfx(this.chain > 1 ? 'combo' : 'pop');
    if (this.chain > 1) this.env.say('Chain x' + this.chain + '!');
    this.clr = { cells: cells, t: 0.28 }; this.state = 'clear';
  };
  Drop.prototype.update = function (dt) {
    this.hintT -= dt;
    if (this.env.timed) this.base = Math.max(0.16, 0.8 - this.env.t * 0.0075);
    else this.base = Math.max(0.26, this.base0 * (1 - 0.25 * Math.min(1, this.env.t / 120)));   // speeds up inside the level
    if (this.state === 'clear') {
      this.clr.t -= dt;
      if (this.clr.t <= 0) {
        var self = this;
        this.clr.cells.forEach(function (p) { self.env.burst(self.ox + (p[1] + 0.5) * self.cell, self.oy + (p[0] + 0.5) * self.cell, Skin.cur.faces[(self.g[p[0]][p[1]] - 1 + 6) % 6], 5); self.g[p[0]][p[1]] = 0; });
        gravity(this.g); this.clr = null; this.resolve();
      }
      return;
    }
    if (this.state !== 'fall' || !this.cur) return;
    this.timer += dt;
    while (this.timer >= this.base && this.state === 'fall' && this.cur) {
      this.timer -= this.base;
      if (!this.collide(this.cur.cells, this.cur.x, this.cur.y + 1)) this.cur.y++; else { this.lock(); break; }
    }
  };
  /* Score every (rotation, column) by simulating the drop; used for hints and the bot. */
  Drop.prototype.bestPlan = function (randomPick) {
    if (!this.cur) return null;
    var opts = [], cells = this.cur.cells, seen = {};
    for (var ri = 0; ri < 4; ri++, cells = rot(cells)) {
      var key = JSON.stringify(cells.map(function (c) { return [c[0], c[1]]; }).sort());
      var w = width(cells);
      for (var x = 0; x <= COLS - w; x++) {
        if (this.collide(cells, x, 0)) continue;
        var y = this.land(cells, x), g = copy(this.g), i;
        for (i = 0; i < cells.length; i++) if (y + cells[i][1] >= 0) g[y + cells[i][1]][x + cells[i][0]] = cells[i][2];
        gravity(g);
        var pts = chainSim(g), h = 0, holes = 0, adj = 0, c, r;
        for (c = 0; c < COLS; c++) { var top = -1; for (r = 0; r < ROWS; r++) if (g[r][c]) { if (top < 0) top = r; } else if (top >= 0) holes++; if (top >= 0) h = Math.max(h, ROWS - top); }
        for (i = 0; i < cells.length; i++) { var px = x + cells[i][0], py = y + cells[i][1]; [[1, 0], [-1, 0], [0, 1]].forEach(function (d) { var a = py + d[0], b = px + d[1]; if (a >= 0 && a < ROWS && b >= 0 && b < COLS && g[a][b] === cells[i][2]) adj++; }); }
        opts.push({ cells: cells, x: x, y: y, val: pts * 3 + adj * 4 - h * 2 - holes * 3 + (ri === 0 ? 0.01 : 0) });
      }
    }
    if (!opts.length) return null;
    opts.sort(function (a, b) { return b.val - a.val; });
    return randomPick ? opts[Math.min(opts.length - 1, Math.floor(this.env.rnd() * Math.min(opts.length, 5)))] : opts[0];
  };
  Drop.prototype.showHint = function () { this.hint = this.bestPlan(false); this.hintT = 4; };
  Drop.prototype.bot = function (dt) {
    if (this.state !== 'fall' || !this.cur) return;
    var sk = this.env.skill;
    if (!this.plan) { this.plan = this.bestPlan(this.env.rnd() < sk.eps) || { cells: this.cur.cells, x: this.cur.x }; this.botT = -(sk.think || 0) * 0.5; }
    this.botT += dt;
    if (this.botT < sk.tempo) return;
    this.botT = 0;
    var p = this.plan, cur = this.cur;
    if (JSON.stringify(cur.cells) !== JSON.stringify(p.cells)) {
      var before = cur.cells; this.rotate();
      if (cur.cells === before) this.plan = { cells: cur.cells, x: p.x };
    } else if (cur.x < p.x) this.move(1);
    else if (cur.x > p.x) this.move(-1);
    else this.hard();
  };

  Drop.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    this.cell = Math.max(8, Math.floor(Math.min(W * 0.96 / COLS, (H - 6) / (ROWS + 1.35))));
    this.ox = Math.floor((W - this.cell * COLS) / 2);
    this.strip = this.cell * 1.35;
    this.oy = Math.floor(Math.max(0, (H - this.strip - this.cell * ROWS) / 2) + this.strip);
  };
  Drop.prototype.draw = function (c) {
    var s = this.cell, ox = this.ox, oy = this.oy, i, r, cc;
    boardBg(c, ox, oy, s * COLS, s * ROWS);
    c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
    for (i = 1; i < COLS; i++) { c.beginPath(); c.moveTo(ox + i * s, oy); c.lineTo(ox + i * s, oy + ROWS * s); c.stroke(); }
    var clr = {};
    if (this.clr) this.clr.cells.forEach(function (p) { clr[p[0] * 10 + p[1]] = 1; });
    for (r = 0; r < ROWS; r++) for (cc = 0; cc < COLS; cc++) if (this.g[r][cc]) {
      var f = clr[r * 10 + cc], blink = f && Math.floor(this.env.t * 20) % 2;
      drawDie(c, ox + cc * s, oy + r * s, s, this.g[r][cc], { alpha: f ? (blink ? 0.4 : 1) : 1, scale: f ? 1.1 : 1, stroke: f ? '#fff' : null });
    }
    var dl = oy + (ROWS - 8) * s;    // danger line: the stack is one piece away from trouble (3 rows from the top)
    c.save(); c.setLineDash([6, 6]); c.strokeStyle = this.hot ? 'rgba(255,107,107,' + (0.6 + 0.4 * Math.sin(this.env.t * 8)) + ')' : 'rgba(255,255,255,0.14)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(ox, dl); c.lineTo(ox + COLS * s, dl); c.stroke(); c.restore();
    var cur = this.cur;
    if (cur && this.state === 'fall') {
      for (i = 0; i < cur.cells.length; i++) drawDie(c, ox + (cur.x + cur.cells[i][0]) * s, oy + (cur.y + cur.cells[i][1]) * s, s, cur.cells[i][2], { stroke: '#fff' });
    }
    if (this.hint && this.hintT > 0) {
      var h = this.hint;
      for (i = 0; i < h.cells.length; i++) drawDie(c, ox + (h.x + h.cells[i][0]) * s, oy + (h.y + h.cells[i][1]) * s, s, h.cells[i][2], { alpha: 0.5 + 0.3 * Math.sin(this.env.t * 8), stroke: '#ffd43b' });
    }
    text(c, 'NEXT', ox + 4, oy - this.strip * 0.5, s * 0.34, '#aab', 'left');
    for (i = 0; i < this.next.length; i++) drawDie(c, ox + s * 1.5 + this.next[i][0] * s * 0.7, oy - this.strip + this.next[i][1] * s * 0.7 + s * 0.1, s * 0.7, this.next[i][2]);
  };
  Drop.prototype.pd = function (x, y) { this.sx = this.lx = x; this.sy = y; this.acc = 0; this.moved = false; this.dropped = false; this.st = this.env.t; };
  Drop.prototype.pm = function (x, y) {
    if (this.sx == null || this.dropped) return;
    this.acc += x - this.lx; this.lx = x;
    var step = this.cell * 0.9;
    while (Math.abs(this.acc) >= step) { var d = this.acc > 0 ? 1 : -1; this.move(d); this.acc -= d * step; this.moved = true; }
    if (y - this.sy > this.cell * 2.2) { this.dropped = true; this.hard(); }
  };
  Drop.prototype.pu = function (x, y) {
    if (!this.moved && !this.dropped && Math.abs(x - this.sx) < 12 && Math.abs(y - this.sy) < 12) this.rotate();
    this.sx = null;
  };
  Drop.prototype.btn = function (k) { if (k === 'l') this.move(-1); else if (k === 'r') this.move(1); else if (k === 'rot') this.rotate(); else if (k === 'drop') this.hard(); else if (k === 'hint') this.showHint(); };

  Games.drop = {
    lose: 'the stack reaches the top',
    goal: "Match 3+ same dice to pop them",
    intro: [["👆 ⟳ ⏬", "Move · turn · drop"], ["⚄ ⚄ ⚄", "3 same dice touch…"], ["💥", "…they pop! Chains score more"]],
    id: 'drop', name: 'Dice Drop', icon: '🎲', color: '#7c5cff', unit: 'Pieces',
    blurb: 'Stack joined dice. Match 3 to pop!', how: 'Drag to move, tap to turn, swipe down to drop. 3+ touching dice with the same face pop.', howDe: 'Ziehen = bewegen, Tippen = drehen, nach unten wischen = fallen lassen. 3 oder mehr gleiche Würfel zusammen verschwinden.',
    par: 26, budget: function (l) { return 56 + Math.floor(l * 0.8); },       // pieces a steady player places in 2 minutes (sets the goals)
    levelTime: function () { return 120; }, fixedClock: true, timedPar: 10.6, timedSecs: 90,
    controls: [{ k: 'l', t: '◀' }, { k: 'rot', t: '⟳' }, { k: 'r', t: '▶' }, { k: 'drop', t: '⏬' }, { k: 'hint', t: '💡' }],
    create: function (env) { return new Drop(env); }
  };
})();
