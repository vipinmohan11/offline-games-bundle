'use strict';
/* Dice Shot: aim and fire a die at the hanging wall. Same number, or two numbers that add to 7, pop together
   (3+ same neighbours pop too). Dice cut off from the ceiling fall for bonus points. */
(function () {
  var COLS = 9, ROWS = 13, DANGER = 10;

  function Shot(env) {
    var l = env.level, T = env.timed;
    this.env = env;
    this.nv = T ? 4 : Math.min(6, 3 + Math.floor(l / 9));
    this.rows0 = T ? 4 : Math.min(8, 3 + Math.floor(l / 6));
    this.K = T ? 5 : Math.max(3, 7 - Math.floor(l / 8));        // misses before the ceiling drops
    this.shots = T ? Infinity : env.budget;
    this.g = []; for (var r = 0; r < ROWS; r++) this.g.push(new Array(COLS).fill(0));
    for (r = 0; r < this.rows0; r++) for (var c = 0; c < COLS; c++) if (env.rnd() < 0.92) this.g[r][c] = 1 + Math.floor(env.rnd() * this.nv);
    this.miss = 0; this.proj = null; this.aim = null; this.falling = []; this.angle = Math.PI / 2; this.cool = 0; this.botT = 0;
    this.cur = this.pick(); this.next = this.pick();
    env.setLeft(this.shots);
  }
  Shot.prototype.present = function () {
    var seen = {}, out = [];
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) { var v = this.g[r][c]; if (v && !seen[v]) { seen[v] = 1; out.push(v); } }
    return out;
  };
  Shot.prototype.pick = function () {
    var p = this.present();
    if (p.length && this.env.rnd() < 0.85) {
      // also allow complement partners of present values
      var v = p[Math.floor(this.env.rnd() * p.length)];
      return this.env.rnd() < 0.2 ? 7 - v : v;
    }
    return 1 + Math.floor(this.env.rnd() * this.nv);
  };
  /* Trace a shot from the cannon; returns landing cell {r,c} and the path for the guide. */
  Shot.prototype.trace = function (ang, g, maxPath) {
    var s = this.cell, x = this.cx, y = this.cy, vx = Math.cos(ang), vy = -Math.sin(ang), step = s * 0.2, path = [], px = x, py = y;
    var left = this.ox, right = this.ox + COLS * s, top = this.oy;
    for (var i = 0; i < 900; i++) {
      px = x; py = y;
      x += vx * step; y += vy * step;
      if (x < left + s * 0.1) { x = left + s * 0.1; vx = Math.abs(vx); }
      if (x > right - s * 0.1) { x = right - s * 0.1; vx = -Math.abs(vx); }
      if (i % 3 === 0 && path.length < (maxPath || 60)) path.push([x, y]);
      var cc = Math.floor((x - this.ox) / s), rr_ = Math.floor((y - this.oy) / s);
      if (y <= top + s * 0.1) { var c0 = clamp(cc, 0, COLS - 1), r0 = 0; if (g[0][c0]) return { hit: true, none: true, path: path }; return { r: 0, c: c0, path: path }; }
      if (rr_ >= 0 && rr_ < ROWS && cc >= 0 && cc < COLS && g[rr_][cc]) {
        // landing = previous empty cell
        var pc = clamp(Math.floor((px - this.ox) / s), 0, COLS - 1), pr = Math.floor((py - this.oy) / s);
        if (pr < 0) pr = 0;
        if (pr >= ROWS) return { none: true, path: path };
        if (g[pr][pc]) {
          // slid into an occupied cell; fall back to the cell below the hit
          if (rr_ + 1 < ROWS && !g[rr_ + 1][cc]) return { r: rr_ + 1, c: cc, path: path };
          return { none: true, path: path };
        }
        return { r: pr, c: pc, path: path };
      }
      if (y > this.cy + s) return { none: true, path: path };
    }
    return { none: true, path: path };
  };
  Shot.prototype.nbrs = function (r, c) {
    return [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]].filter(function (p) { return p[0] >= 0 && p[0] < ROWS && p[1] >= 0 && p[1] < COLS; });
  };
  /* Land die v at (r,c) on grid g. Returns {pop:[cells], fall:[cells]} (g is mutated). */
  Shot.prototype.land = function (g, r, c, v) {
    g[r][c] = v;
    var kill = {}, list = [], self = this;
    // same-number group of 3+
    var seen = {}, st = [[r, c]], grp = [];
    seen[r * 20 + c] = 1;
    while (st.length) {
      var p = st.pop(); grp.push(p);
      this.nbrs(p[0], p[1]).forEach(function (q) { if (!seen[q[0] * 20 + q[1]] && g[q[0]][q[1]] === v) { seen[q[0] * 20 + q[1]] = 1; st.push(q); } });
    }
    if (grp.length >= 3) grp.forEach(function (p) { kill[p[0] * 20 + p[1]] = p; });
    // complement pairs (sum 7) touching the landed die
    var comp = this.nbrs(r, c).filter(function (q) { return g[q[0]][q[1]] === 7 - v && 7 - v !== v; });
    if (comp.length) { kill[r * 20 + c] = [r, c]; comp.forEach(function (q) { kill[q[0] * 20 + q[1]] = q; }); }
    for (var k in kill) list.push(kill[k]);
    list.forEach(function (p) { g[p[0]][p[1]] = 0; });
    // disconnected dice fall
    var fall = [];
    if (list.length) {
      var conn = {}, stack = [];
      for (var cc = 0; cc < COLS; cc++) if (g[0][cc]) { conn[cc] = 1; stack.push([0, cc]); }
      while (stack.length) {
        var q = stack.pop();
        this.nbrs(q[0], q[1]).forEach(function (n) { if (g[n[0]][n[1]] && !conn[n[0] * 20 + n[1]]) { conn[n[0] * 20 + n[1]] = 1; stack.push(n); } });
      }
      for (var rr_ = 0; rr_ < ROWS; rr_++) for (var c2 = 0; c2 < COLS; c2++) if (g[rr_][c2] && !conn[rr_ * 20 + c2] && !(rr_ === 0 && conn[c2])) { fall.push([rr_, c2, g[rr_][c2]]); g[rr_][c2] = 0; }
    }
    return { pop: list, fall: fall };
  };
  Shot.prototype.scoreOf = function (res) { return res.pop.length * 12 + res.fall.length * 28; };
  Shot.prototype.fire = function (ang) {
    if (this.proj || this.env.over || this.cool > 0) return;
    var t = this.trace(ang, this.g, 220);
    this.proj = { x: this.cx, y: this.cy, path: t.path, i: 0, v: this.cur, tr: t };
    this.env.sfx('tick');
  };
  Shot.prototype.resolveShot = function (tr, v) {
    var s = this.cell, res = { pop: [], fall: [] };
    if (!tr.none) res = this.land(this.g, tr.r, tr.c, v);
    else { this.miss++; }
    var pts = this.scoreOf(res), self = this;
    if (res.pop.length || res.fall.length) {
      this.env.addScore(pts, this.ox + ((tr.c || 4) + 0.5) * s, this.oy + ((tr.r || 0) + 0.5) * s, res.fall.length ? '#ffd43b' : '#fff');
      this.env.sfx(res.fall.length ? 'combo' : 'pop');
      res.pop.forEach(function (p) { self.env.burst(self.ox + (p[1] + 0.5) * s, self.oy + (p[0] + 0.5) * s, Skin.cur.faces[(v - 1 + 6) % 6], 4); });
      res.fall.forEach(function (p) { self.falling.push({ x: self.ox + (p[1] + 0.5) * s, y: self.oy + (p[0] + 0.5) * s, vy: 0, v: p[2] }); });
      if (res.fall.length >= 3) this.env.say(res.fall.length + ' dice dropped!');
      this.miss = 0;
    } else this.miss++;
    if (this.miss >= this.K) { this.pushRow(); this.miss = 0; }
    this.shots--;
    this.env.setLeft(Math.max(0, this.shots));
    this.cur = this.next; this.next = this.pick();
    // wall cleared?
    var any = false; for (var r = 0; r < ROWS && !any; r++) for (var c = 0; c < COLS; c++) if (this.g[r][c]) { any = true; break; }
    if (!any) {
      var bonus = 150 + (this.shots === Infinity ? 0 : this.shots * 20);
      this.env.addScore(bonus, this.W / 2, this.H / 3, '#ffd43b'); this.env.say('Wall cleared!'); this.env.sfx('win');
      if (this.env.timed) { for (var rr_ = 0; rr_ < 3; rr_++) for (var cc = 0; cc < COLS; cc++) this.g[rr_][cc] = 1 + Math.floor(this.env.rnd() * this.nv); }
      else { this.env.finish({ cleared: true }); return; }
    }
    for (var c3 = 0; c3 < COLS; c3++) for (var r3 = DANGER; r3 < ROWS; r3++) if (this.g[r3][c3]) { this.env.finish({ overrun: true }); return; }
    if (!this.env.timed && this.shots <= 0) this.env.finish({ done: true });
  };
  Shot.prototype.pushRow = function () {
    for (var r = ROWS - 1; r > 0; r--) this.g[r] = this.g[r - 1];
    this.g[0] = new Array(COLS).fill(0);
    for (var c = 0; c < COLS; c++) this.g[0][c] = 1 + Math.floor(this.env.rnd() * this.nv);
    this.env.say('Ceiling drops!'); this.env.sfx('bad');
  };
  Shot.prototype.update = function (dt) {
    if (this.cool > 0) this.cool -= dt;
    var p = this.proj;
    if (p) {
      p.i += dt * 48 * (this.cell / 18);
      var idx = Math.floor(p.i);
      if (idx >= p.path.length - 1) { this.proj = null; this.cool = 0.12; this.resolveShot(p.tr, p.v); }
    }
    this.falling = this.falling.filter(function (f) { f.vy += 1500 * dt; f.y += f.vy * dt; return f.y < this.H + 40; }, this);
  };
  Shot.prototype.bot = function (dt) {
    if (this.proj || this.cool > 0 || this.env.over) return;
    if (!botReady(this, dt)) return;
    botDone(this);
    var best = null, bestV = -1, sk = this.env.skill, rnd = this.env.rnd;
    for (var a = 12; a <= 168; a += 2.5) {
      var ang = a * Math.PI / 180, t = this.trace(ang, this.g, 4);
      var v;
      if (t.none) v = -1;
      else { var g = this.g.map(function (r) { return r.slice(); }); var res = this.land(g, t.r, t.c, this.cur); v = this.scoreOf(res) + (res.pop.length ? 0 : (t.r < 4 ? 1 : -t.r * 0.2)); }
      if (v > bestV) { bestV = v; best = ang; }
    }
    if (best == null) best = Math.PI / 2;
    if (rnd() < sk.eps) best = (15 + rnd() * 150) * Math.PI / 180;
    best += (rnd() - 0.5) * 0.02 * sk.noise;
    this.fire(best);
  };
  Shot.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    this.cell = Math.max(8, Math.floor(Math.min(W * 0.97 / COLS, (H - 6) / (ROWS + 1.6))));
    this.ox = Math.floor((W - this.cell * COLS) / 2);
    this.oy = 4;
    this.cx = W / 2; this.cy = this.oy + this.cell * (ROWS + 0.75);
  };
  Shot.prototype.draw = function (c) {
    var s = this.cell, ox = this.ox, oy = this.oy, r, cc, i;
    rr(c, ox - 4, oy - 4, s * COLS + 8, s * ROWS + 8, 12); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
    rr(c, ox, oy, s * COLS, s * ROWS, 8); c.fillStyle = Skin.cur.bg; c.fill();
    c.fillStyle = 'rgba(255,107,107,0.18)'; c.fillRect(ox, oy + DANGER * s, s * COLS, s * (ROWS - DANGER));
    c.setLineDash([6, 6]); c.strokeStyle = 'rgba(255,107,107,0.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(ox, oy + DANGER * s); c.lineTo(ox + s * COLS, oy + DANGER * s); c.stroke(); c.setLineDash([]);
    for (r = 0; r < ROWS; r++) for (cc = 0; cc < COLS; cc++) if (this.g[r][cc]) drawDie(c, ox + cc * s, oy + r * s, s, this.g[r][cc]);
    for (i = 0; i < this.falling.length; i++) drawDie(c, this.falling[i].x - s / 2, this.falling[i].y - s / 2, s, this.falling[i].v, { alpha: 0.8 });
    if (this.aim != null && !this.proj) {
      var t = this.trace(this.aim, this.g, 40);
      for (i = 0; i < t.path.length; i++) { c.beginPath(); c.arc(t.path[i][0], t.path[i][1], Math.max(2, s * 0.07), 0, 6.3); c.fillStyle = 'rgba(255,255,255,' + (0.8 - i * 0.015) + ')'; c.fill(); }
      if (!t.none) { rr(c, ox + t.c * s + 2, oy + t.r * s + 2, s - 4, s - 4, s * 0.2); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.setLineDash([4, 4]); c.lineWidth = 2; c.stroke(); c.setLineDash([]); }
    }
    // cannon
    c.save(); c.translate(this.cx, this.cy); c.rotate(-(this.aim != null ? this.aim : Math.PI / 2) + Math.PI / 2);
    rr(c, -s * 0.28, -s * 0.9, s * 0.56, s * 1.0, s * 0.12); c.fillStyle = '#495057'; c.fill(); c.restore();
    rr(c, this.cx - s * 0.8, this.cy - s * 0.1, s * 1.6, s * 0.8, s * 0.3); c.fillStyle = '#343a40'; c.fill();
    if (!this.proj) drawDie(c, this.cx - s * 0.5, this.cy - s * 0.5, s, this.cur, { stroke: '#fff' });
    else {
      var p = this.proj, k = Math.min(p.path.length - 1, Math.floor(p.i)), pt = p.path[k] || [this.cx, this.cy];
      drawDie(c, pt[0] - s / 2, pt[1] - s / 2, s, p.v, { stroke: '#fff' });
    }
    text(c, 'NEXT', this.cx - s * 2.6, this.cy - s * 0.1, s * 0.3, '#aab');
    drawDie(c, this.cx - s * 2.95, this.cy + s * 0.05, s * 0.7, this.next);
    text(c, 'Pops: same number, or two that add to 7', this.cx, this.cy + s * 1.25, Math.min(s * 0.3, 15), '#99a', 'center', '500');
  };
  Shot.prototype.angleTo = function (x, y) {
    var a = Math.atan2(-(y - this.cy), x - this.cx);
    return clamp(a, 12 * Math.PI / 180, 168 * Math.PI / 180);
  };
  Shot.prototype.pd = function (x, y) { this.aim = this.angleTo(x, y); this.down = true; };
  Shot.prototype.pm = function (x, y) { if (this.down) this.aim = this.angleTo(x, y); };
  Shot.prototype.pu = function (x, y) { if (!this.down) return; this.down = false; var a = this.angleTo(x, y); this.aim = null; this.fire(a); };
  Shot.prototype.btn = function (k) { if (k === 'swap') { var t = this.cur; this.cur = this.next; this.next = t; this.env.sfx('tick'); } };

  Games.shot = {
    id: 'shot', name: 'Dice Shot', icon: '🎯', color: '#fd7e14', unit: 'Shots',
    blurb: 'Aim and pop the dice wall!', how: 'Drag to aim, let go to fire. Same numbers pop, and so do two numbers that add to 7. Cut dice loose for bonus points.',
    par: 38, budget: function (l) { return 22 + Math.floor(l / 2); }, timedPar: 9, timedSecs: 90,
    controls: [{ k: 'swap', t: '🔁 Swap die' }],
    create: function (env) { return new Shot(env); }
  };
})();
