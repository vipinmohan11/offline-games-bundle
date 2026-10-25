'use strict';
/* Dice Tower: a swinging row of dice. Tap to drop it on the tower. Overhang is cut off.
   Perfect drops keep the width and build a streak; three in a row grow the tower back. */
(function () {
  function Tower(env) {
    var l = env.level, T = env.timed;
    this.env = env;
    this.drops = T ? Infinity : env.budget;
    this.speed0 = T ? 0.6 : Math.min(1.3, 0.4 + 0.022 * l);                  // screen widths per second
    this.w0f = T ? 0.5 : Math.max(0.26, 0.58 - 0.0075 * l);
    this.win = T ? 0.03 : Math.max(0.014, 0.052 - 0.00085 * l);                // perfect window in seconds (tightens every level)
    this.blocks = []; this.debris = []; this.n = 0; this.streak = 0; this.phase = 0; this.dir = 1; this.botTarget = null; this.dropped = false;
    this.env.setLeft(this.drops);
  }
  Tower.prototype.init = function () {
    this.bw0 = Math.min(this.W * this.w0f, 300);
    this.bh = clamp(this.W * 0.1, 24, 52);
    this.blocks = [{ x: (this.W - this.bw0) / 2, w: this.bw0, v: [3, 5, 2, 6, 1, 4] }];
    this.mw = this.bw0; this.mx = 0;
  };
  Tower.prototype.top = function () { return this.blocks[this.blocks.length - 1]; };
  Tower.prototype.speed = function () {
    var s = this.speed0 * (1 + 0.012 * Math.min(this.n, 40));
    if (this.env.timed) s *= 1 + this.env.t * 0.004;
    return s * this.W;
  };
  Tower.prototype.drop = function () {
    if (this.env.over || this.dropped) return;
    var top = this.top(), L = this.mx, Rr = this.mx + this.mw, tl = top.x, tr = top.x + top.w;
    var ov = Math.min(Rr, tr) - Math.max(L, tl), off = this.mx - top.x, bh = this.bh;
    if (ov <= 1) {
      this.debris.push({ x: this.mx, w: this.mw, y: this.curY(), vy: 0, v: 3 });
      this.env.sfx('bad'); this.env.finish({ miss: true, height: this.n });
      return;
    }
    var perfect = Math.abs(off) <= Math.max(3, this.speed() * this.win), nx, nw;
    if (perfect) {
      nx = top.x; nw = this.mw;
      this.streak++;
      if (this.streak >= 2) nw = Math.min(this.bw0, nw + this.bw0 * 0.06);
      if (this.streak >= 2) nx = Math.max(0, nx - (nw - this.mw) / 2);
      this.env.addScore(25 + 5 * Math.min(this.streak, 10), this.mx + this.mw / 2, this.curY() + this.camera(), '#ffd43b');
      this.env.sfx('combo'); if (this.streak % 3 === 0) this.env.say('Perfect x' + this.streak + '!');
    } else {
      nx = Math.max(this.mx, top.x); nw = ov;
      if (off > 0) this.debris.push({ x: top.x + top.w, w: Rr - (top.x + top.w), y: this.curY(), vy: 0, v: 2 });
      else this.debris.push({ x: this.mx, w: tl - this.mx, y: this.curY(), vy: 0, v: 5 });
      this.streak = 0; if (ov < this.mw * 0.7) this.env.mistake();      // a bad cut (lost more than 30% of the width)
      this.env.addScore(10, this.mx + this.mw / 2, this.curY() + this.camera(), '#fff');
      this.env.sfx('thud');
    }
    var vals = []; for (var i = 0; i < 8; i++) vals.push(1 + Math.floor(this.env.rnd() * 6));
    this.blocks.push({ x: nx, w: nw, v: vals });
    this.n++;
    this.drops--; this.env.setLeft(Math.max(0, this.drops));
    this.mw = nw; this.botTarget = null; this.botArm = false;
    if (!this.env.timed && this.drops <= 0) { this.env.finish({ done: true, height: this.n }); return; }
    this.phase = this.phase;   // keep swinging
  };
  Tower.prototype.curY = function () { return this.baseY - (this.blocks.length) * this.bh; };
  Tower.prototype.update = function (dt) {
    var sp = this.speed(), range = Math.max(1, this.W - this.mw);
    this.mx += this.dir * sp * dt;
    if (this.mx <= 0) { this.mx = 0; this.dir = 1; }
    if (this.mx >= range) { this.mx = range; this.dir = -1; }
    this.debris = this.debris.filter(function (d) { d.vy += 1800 * dt; d.y += d.vy * dt; return d.y < this.baseY + 600; }, this);
  };
  Tower.prototype.bot = function (dt) {
    if (this.env.over) return;
    var sk = this.env.skill, top = this.top(), sp = this.speed();
    if (this.botTarget == null) {
      var g = (this.env.rnd() + this.env.rnd() + this.env.rnd() - 1.5) * 2;     // ~N(0,1)
      var std = 0.012 * sp * sk.noise;
      this.botTarget = top.x + g * std + (this.env.rnd() < sk.eps * 0.2 ? (this.env.rnd() - 0.5) * this.mw : 0);
    }
    var next = this.mx + this.dir * sp * dt, d0 = Math.abs(this.mx - this.botTarget), d1 = Math.abs(next - this.botTarget);
    if (this.botArm) { this.botArm = false; this.drop(); return; }
    if ((this.mx - this.botTarget) * (next - this.botTarget) <= 0 || d0 < 1) {
      if (d0 <= d1) this.drop(); else this.botArm = true;      // pick whichever frame is closer to the target
    }
  };
  Tower.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    var old = this.blocks.length, ow = this.W_;
    if (!this.blocks.length || !this.bw0) this.init();
    else if (ow && ow !== W) { var k = W / ow; this.blocks.forEach(function (b) { b.x *= k; b.w *= k; }); this.bw0 *= k; this.mw *= k; this.mx *= k; this.bh = clamp(W * 0.1, 24, 52); }
    this.W_ = W;
    this.baseY = H - 8;
  };
  Tower.prototype.camera = function () {
    var topY = this.baseY - this.blocks.length * this.bh;       // y of the next block row
    return Math.max(0, this.H * 0.55 - topY);
  };
  Tower.prototype.draw = function (c) {
    var bh = this.bh, cam = this.camera(), W = this.W, i;
    // sky stripes for a sense of height
    for (i = 0; i < 8; i++) { c.fillStyle = 'rgba(255,255,255,' + (0.02 + (i % 2) * 0.02) + ')'; c.fillRect(0, ((i * 120 + cam * 0.4) % (this.H + 120)) - 120, W, 60); }
    c.save(); c.translate(0, cam);
    rr(c, 0, this.baseY, W, 40, 6); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    var self = this;
    function row(b, y, alpha) {
      c.save(); c.beginPath(); c.rect(b.x, y - 2, b.w, bh + 4); c.clip();
      var n = Math.ceil(b.w / bh) + 1;
      for (var k = 0; k < n; k++) drawDie(c, b.x + k * bh, y, bh, b.v[k % b.v.length], { alpha: alpha });
      c.restore();
    }
    for (i = 0; i < this.blocks.length; i++) {
      var b = this.blocks[i];
      row(b, this.baseY - (i + 1) * bh, 1);
    }
    for (i = 0; i < this.debris.length; i++) { var d = this.debris[i]; if (d.w > 1) row({ x: d.x, w: d.w, v: [d.v, 6, 4, 2] }, d.y, 0.8); }
    if (!this.env.over) {
      var y = this.baseY - (this.blocks.length + 1) * bh - bh * 0.4;
      row({ x: this.mx, w: this.mw, v: [6, 1, 5, 2, 4, 3] }, y, 1);
      var top = this.top();
      c.setLineDash([5, 5]); c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(top.x, y + bh); c.lineTo(top.x, this.baseY - this.blocks.length * bh); c.moveTo(top.x + top.w, y + bh); c.lineTo(top.x + top.w, this.baseY - this.blocks.length * bh); c.stroke(); c.setLineDash([]);
    }
    c.restore();
    text(c, 'Height ' + this.n, 14, 22, 16, '#cde', 'left');
    if (this.streak > 1) text(c, '🔥 ' + this.streak, W - 14, 22, 18, '#ffd43b', 'right');
  };
  Tower.prototype.pd = function () { this.drop(); };
  Tower.prototype.pm = function () {}; Tower.prototype.pu = function () {}; Tower.prototype.btn = function (k) { if (k === 'drop') this.drop(); };

  Games.tower = {
    id: 'tower', name: 'Dice Tower', icon: '🗼', color: '#339af0', unit: 'Drops',
    blurb: 'Tap to stack. Be perfect!', how: 'Tap to drop the swinging dice onto the tower. Line it up perfectly to keep your width and build a streak.', howDe: 'Tippe, um den Würfel fallen zu lassen. Triff genau, dann bleibt er breit und du bekommst eine Serie.',
    par: 28, budget: function (l) { return 50 + 2 * l; }, timedPar: 11, timedSecs: 60,
    controls: [{ k: 'drop', t: '⬇ DROP' }],
    create: function (env) { return new Tower(env); }
  };
})();
