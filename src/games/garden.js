'use strict';
/* Dice Garden: drop a die into a column. 3 touching same dice merge into the next number.
   Merge three 5s and a flower blooms (gem in Ocean, star in Space). Rocks crumble next to merges. */
(function () {
  var COLS = 5, ROWS = 7, ROCK = 9, TOP = 5;
  var WORLDS = [
    { name: 'Garden', bg: '#1f4d2c', bloom: '🌸' },
    { name: 'Ocean', bg: '#0b3c5d', bloom: '🐚' },
    { name: 'Space', bg: '#1a1040', bloom: '⭐' }
  ];
  function world(l) { return Math.min(2, Math.floor((l - 1) / 14)); }

  function Garden(env) {
    var l = env.level, T = env.timed;
    this.env = env; this.W_ = WORLDS[T ? 0 : world(l)];
    this.g = []; for (var r = 0; r < ROWS; r++) this.g.push(new Array(COLS).fill(0));
    this.maxSpawn = T ? 3 : l < 12 ? 3 : l < 28 ? 4 : 5;
    this.drops = T ? Infinity : env.budget;
    this.busy = 0; this.col = 2; this.pop = []; this.flowers = 0; this.fall = [];
    var rocks = T ? 0 : Math.min(9, Math.floor(l / 4)), k = 0;
    while (k < rocks) { var c = this.rand(COLS), rw = ROWS - 1 - this.rand(2); if (!this.g[rw][c]) { this.g[rw][c] = ROCK; k++; } }
    this.gravity(this.g);
    this.cur = this.roll(); this.next = this.roll();
    env.setLeft(this.drops);
  }
  Garden.prototype.rand = function (n) { return Math.floor(this.env.rnd() * n); };
  Garden.prototype.roll = function () {
    // weights favour small numbers
    var w = [], i, tot = 0;
    for (i = 1; i <= this.maxSpawn; i++) { var x = this.maxSpawn - i + 1.5; w.push(x); tot += x; }
    var r = this.env.rnd() * tot;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i + 1; }
    return 1;
  };
  Garden.prototype.gravity = function (g) {
    for (var c = 0; c < COLS; c++) {
      var w = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) if (g[r][c]) { var v = g[r][c]; g[r][c] = 0; g[w][c] = v; w--; }
    }
  };
  Garden.prototype.landRow = function (g, c) { for (var r = ROWS - 1; r >= 0; r--) if (!g[r][c]) return r; return -1; };
  Garden.prototype.groupAt = function (g, r0, c0) {
    var v = g[r0][c0]; if (!v || v === ROCK) return [];
    var seen = {}, st = [[r0, c0]], out = [];
    seen[r0 * 10 + c0] = 1;
    while (st.length) {
      var p = st.pop(); out.push(p);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var a = p[0] + d[0], b = p[1] + d[1];
        if (a >= 0 && a < ROWS && b >= 0 && b < COLS && !seen[a * 10 + b] && g[a][b] === v) { seen[a * 10 + b] = 1; st.push([a, b]); }
      });
    }
    return out;
  };
  /* Resolve merges on grid g starting from the dropped die. Returns {pts, flowers, steps}. */
  Garden.prototype.resolve = function (g, r0, c0) {
    var pts = 0, flowers = 0, chain = 0, anchor = [r0, c0], steps = [];
    for (var guard = 0; guard < 40; guard++) {
      var grp = null, ar = null;
      if (g[anchor[0]][anchor[1]]) { var a = this.groupAt(g, anchor[0], anchor[1]); if (a.length >= 3) { grp = a; ar = anchor; } }
      if (!grp) {
        for (var r = ROWS - 1; r >= 0 && !grp; r--) for (var c = 0; c < COLS && !grp; c++) {
          if (!g[r][c] || g[r][c] === ROCK) continue;
          var gg = this.groupAt(g, r, c);
          if (gg.length >= 3) { grp = gg; ar = [r, c]; }
        }
      }
      if (!grp) break;
      chain++;
      var v = g[ar[0]][ar[1]], n = grp.length, p;
      var crumble = [];
      grp.forEach(function (q) { [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var a2 = q[0] + d[0], b2 = q[1] + d[1]; if (a2 >= 0 && a2 < ROWS && b2 >= 0 && b2 < COLS && g[a2][b2] === ROCK) crumble.push([a2, b2]); }); });
      grp.forEach(function (q) { g[q[0]][q[1]] = 0; });
      var gain;
      if (v >= TOP) { flowers++; gain = 120 * (n - 2) * chain; }
      else { g[ar[0]][ar[1]] = v + 1; gain = v * 12 * (n - 2) * chain; }
      crumble.forEach(function (q) { if (g[q[0]][q[1]] === ROCK) { g[q[0]][q[1]] = 0; gain += 8; } });
      pts += gain;
      steps.push({ r: ar[0], c: ar[1], v: v, gain: gain, bloom: v >= TOP, chain: chain });
      this.gravity(g);
      // after gravity the merged die may have moved down; find it again
      anchor = [ar[0], ar[1]];
      if (v < TOP) { for (var rr_ = ROWS - 1; rr_ >= 0; rr_--) { if (g[rr_][ar[1]] === v + 1) { anchor = [rr_, ar[1]]; break; } } }
    }
    return { pts: pts, flowers: flowers, steps: steps };
  };
  Garden.prototype.dropIn = function (c) {
    if (this.env.over || this.busy > 0) return false;
    var r = this.landRow(this.g, c);
    if (r < 0) return false;
    if (r <= 1) this.env.mistake();                                    // dropping onto a nearly full column
    var v = this.cur;
    this.g[r][c] = v;
    var res = this.resolve(this.g, r, c), self = this, s = this.cell;
    this.env.sfx('thud');
    this.drops--;
    this.env.setLeft(Math.max(0, this.drops));
    if (res.pts) {
      this.env.addScore(res.pts, this.ox + (c + 0.5) * s, this.oy + (r + 0.5) * s, res.flowers ? '#ffd43b' : '#fff');
      this.env.sfx(res.flowers ? 'win' : 'pop');
      if (res.steps.length > 1) this.env.say('Chain x' + res.steps.length + '!');
      res.steps.forEach(function (st) {
        self.env.burst(self.ox + (st.c + 0.5) * s, self.oy + (st.r + 0.5) * s, st.bloom ? '#ffd43b' : Skin.cur.faces[st.v - 1], st.bloom ? 12 : 5);
        if (st.bloom) self.pop.push({ x: st.c, y: st.r, t: 1.4 });
      });
      this.flowers += res.flowers;
      if (res.flowers) { this.env.say(this.W_.bloom + ' Bloom!'); this.env.flowers = (this.env.flowers || 0) + res.flowers; }
    }
    this.busy = 0.18;
    this.cur = this.next; this.next = this.roll();
    var full = true; for (var cc = 0; cc < COLS; cc++) if (this.landRow(this.g, cc) >= 0) full = false;
    if (full) {
      var empty = 0; this.env.finish({ full: true, flowers: this.flowers });
    } else if (!this.env.timed && this.drops <= 0) {
      var e = 0; for (var rr2 = 0; rr2 < ROWS; rr2++) for (var c2 = 0; c2 < COLS; c2++) if (!this.g[rr2][c2]) e++;
      this.env.addScore(e * 3, this.W / 2, this.H / 2, '#8ce99a');   // tidy-garden bonus
      this.env.finish({ done: true, flowers: this.flowers });
    }
    return true;
  };
  Garden.prototype.bestCol = function (randomPick) {
    var opts = [];
    for (var c = 0; c < COLS; c++) {
      var r = this.landRow(this.g, c); if (r < 0) continue;
      var g = this.g.map(function (rw) { return rw.slice(); });
      g[r][c] = this.cur;
      var res = this.resolve(g, r, c), h = 0, adj = 0, cc, rw;
      for (cc = 0; cc < COLS; cc++) for (rw = 0; rw < ROWS; rw++) if (g[rw][cc]) { h = Math.max(h, ROWS - rw); break; }
      if (g[r] && g[r][c] === this.cur) {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var a = r + d[0], b = c + d[1]; if (a >= 0 && a < ROWS && b >= 0 && b < COLS && g[a][b] === g[r][c]) adj++; });
      }
      opts.push({ c: c, val: res.pts * 2 + adj * 8 - h * 3 - Math.abs(c - 2) * 0.1 });
    }
    if (!opts.length) return null;
    opts.sort(function (a, b) { return b.val - a.val; });
    return randomPick ? opts[Math.min(opts.length - 1, this.rand(Math.min(opts.length, 4)))] : opts[0];
  };
  Garden.prototype.update = function (dt) {
    if (this.busy > 0) this.busy -= dt;
    this.pop = this.pop.filter(function (p) { p.t -= dt; return p.t > 0; });
  };
  Garden.prototype.bot = function (dt) {
    if (this.busy > 0 || this.env.over || !botReady(this, dt)) return;
    botDone(this);
    var m = this.bestCol(this.env.rnd() < this.env.skill.eps);
    if (m) this.dropIn(m.c);
  };
  Garden.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    this.cell = Math.max(8, Math.floor(Math.min(W * 0.94 / COLS, (H - 4) / (ROWS + 1.6))));
    this.ox = Math.floor((W - this.cell * COLS) / 2);
    this.oy = Math.floor(Math.max(0, (H - this.cell * (ROWS + 1.6)) / 2) + this.cell * 1.6);
  };
  Garden.prototype.draw = function (c) {
    var s = this.cell, ox = this.ox, oy = this.oy, r, cc;
    rr(c, ox - 6, oy - 6, s * COLS + 12, s * ROWS + 12, 14); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
    rr(c, ox, oy, s * COLS, s * ROWS, 10); c.fillStyle = this.W_.bg; c.fill();
    for (cc = 0; cc < COLS; cc++) if (cc === this.col) { c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(ox + cc * s, oy, s, s * ROWS); }
    for (r = 0; r < ROWS; r++) for (cc = 0; cc < COLS; cc++) {
      var v = this.g[r][cc]; if (!v) continue;
      if (v === ROCK) { rr(c, ox + cc * s + 3, oy + r * s + 3, s - 6, s - 6, s * 0.25); c.fillStyle = '#868e96'; c.fill(); text(c, '🪨', ox + (cc + 0.5) * s, oy + (r + 0.5) * s, s * 0.55); }
      else drawDie(c, ox + cc * s, oy + r * s, s, v);
    }
    this.pop.forEach(function (p) { text(c, this.W_.bloom, ox + (p.x + 0.5) * s, oy + (p.y + 0.5) * s - (1.4 - p.t) * s, s * (0.7 + (1.4 - p.t) * 0.6)); }, this);
    drawDie(c, ox + this.col * s, oy - s * 1.15, s, this.cur, { stroke: '#fff' });
    text(c, 'NEXT', ox + s * 0.1, oy - s * 1.3, s * 0.28, '#cde', 'left');
    drawDie(c, ox + s * 0.1, oy - s * 1.1, s * 0.6, this.next);
    text(c, this.W_.bloom + ' ' + this.flowers, ox + COLS * s - 4, oy - s * 1.3, s * 0.4, '#ffd43b', 'right');
    text(c, '1 → 2 → 3 → 4 → 5 → ' + this.W_.bloom + '   (3 same merge)', ox + COLS * s - 4, oy - s * 0.62, Math.min(s * 0.27, 14), '#cde', 'right');
  };
  Garden.prototype.colAt = function (x) { return clamp(Math.floor((x - this.ox) / this.cell), 0, COLS - 1); };
  Garden.prototype.pd = function (x) { this.col = this.colAt(x); this.down = true; };
  Garden.prototype.pm = function (x) { if (this.down) this.col = this.colAt(x); };
  Garden.prototype.pu = function (x) { if (!this.down) return; this.down = false; this.col = this.colAt(x); this.dropIn(this.col); };
  Garden.prototype.btn = function (k) { if (k === 'hint') { var m = this.bestCol(false); if (m) { this.col = m.c; this.env.say('Try the glowing column'); } } };

  Games.garden = {
    goal: "Merge 3 same dice · three 5s = a flower",
    intro: [["⚀ ⚀ ⚀", "Drop 3 same dice together"], ["→ ⚁", "They merge into the next number"], ["⚄⚄⚄ → 🌸", "Three 5s bloom a flower!"]],
    id: 'garden', name: 'Dice Garden', icon: '🌸', color: '#40c057', unit: 'Drops',
    blurb: 'Merge 3 same dice. Grow flowers!', how: 'Drag over a column and let go to drop the die. 3 touching same dice merge into the next number. Merge three 5s to bloom.', howDe: 'Ziehe über eine Spalte und lass los. 3 gleiche Würfel werden zur nächsten Zahl. Drei Fünfen lassen eine Blume blühen.',
    par: 21, budget: function (l) { return 30 + Math.floor(l * 0.7); }, timedPar: 5.4, timedSecs: 90,
    levelTime: function (l) { return Math.round(this.budget(l) * perMoveSecs(l)); },
    controls: [{ k: 'hint', t: '💡 Hint' }],
    create: function (env) { return new Garden(env); }
  };
})();
