'use strict';
/* Dice Rush: dice slide down the belt and speed up. Tap the right bin before they fall off.
   Rules get harder: even/odd, low/high, thirds, then two-dice sums, then rules that switch. */
(function () {
  var RULES = [
    { bins: ['EVEN', 'ODD'], n: 1, f: function (d) { return d[0] % 2 === 0 ? 0 : 1; }, tip: 'Even or odd?' },
    { bins: ['1 - 3', '4 - 6'], n: 1, f: function (d) { return d[0] <= 3 ? 0 : 1; }, tip: 'Low or high?' },
    { bins: ['1 - 2', '3 - 4', '5 - 6'], n: 1, f: function (d) { return Math.floor((d[0] - 1) / 2); }, tip: 'Which pair?' },
    { bins: ['< 7', '= 7', '> 7'], n: 2, f: function (d) { var s = d[0] + d[1]; return s < 7 ? 0 : s === 7 ? 1 : 2; }, tip: 'Add them up!' }
  ];
  var BINCOL = ['#4dabf7', '#ffa94d', '#69db7c'];
  var LOAD = [1, 1.2, 1.8, 2.5, 3];          // how error-prone each tier is for the test bots

  function tierOf(l) { return l <= 8 ? 0 : l <= 16 ? 1 : l <= 24 ? 2 : l <= 32 ? 3 : 4; }

  function Rush(env) {
    var l = env.level, T = env.timed;
    this.env = env;
    this.tier = T ? 0 : tierOf(l);
    this.rule = this.tier >= 4 ? Math.floor(env.rnd() * 4) : this.tier;
    this.tt = T ? 3.6 : Math.max(1.8, 4.4 - 0.06 * l);        // seconds from top to the bins
    this.items = []; this.spawnT = 0.4; this.spawned = 0; this.sorted = 0; this.streak = 0; this.lives = 3;
    this.total = T ? Infinity : env.budget;
    this.freeze = 0; this.flash = null; this.press = -1; this.sinceRule = 0; this.ruleSecs = 0;
    env.setLeft(this.total);
  }
  Rush.prototype.R = function () { return RULES[this.rule]; };
  Rush.prototype.speedMul = function () {
    if (this.env.timed) return Math.pow(0.987, this.env.t);
    return Math.pow(0.965, Math.floor(this.sorted / 8));
  };
  Rush.prototype.makeItem = function () {
    var R = this.R(), d = [];
    for (var i = 0; i < R.n; i++) d.push(1 + Math.floor(this.env.rnd() * 6));
    return { d: d, y: 0, age: 0 };
  };
  Rush.prototype.setRule = function (r, msg) {
    this.rule = r; this.freeze = 1.1; this.env.say(msg || 'New rule: ' + RULES[r].tip); this.env.sfx('combo');
    // refresh dice already on the belt so they match the new rule's dice count
    this.items.forEach(function (it) { var n = RULES[r].n; while (it.d.length < n) it.d.push(1 + Math.floor(this.env.rnd() * 6)); it.d.length = n; }, this);
  };
  Rush.prototype.lose = function (why) {
    this.lives--; this.streak = 0; this.env.sfx('bad'); this.flash = { t: 0.35, ok: false };
    if (this.lives <= 0) this.env.finish({ lives: true });
  };
  Rush.prototype.sort = function (bin) {
    if (this.env.over || this.freeze > 0 || !this.items.length) return false;
    var front = this.items[0];
    this.items.shift();
    var ok = this.R().f(front.d) === bin;
    if (ok) {
      this.streak++;
      var mult = 1 + Math.min(3, Math.floor(this.streak / 5));
      var pts = (10 + Math.round(6 * (1 - front.y))) * mult;
      this.env.addScore(pts, this.cx, this.binTop - this.ds, mult > 1 ? '#ffd43b' : '#fff');
      if (this.streak % 10 === 0 && this.lives < 5) { this.lives++; this.env.say('Heart +1!'); }
      else if (this.streak % 5 === 0) this.env.say(this.streak + ' streak! x' + mult);
      this.env.sfx('pop'); this.flash = { t: 0.2, ok: true }; this.press = bin; this.pressT = 0.15;
    } else this.lose('wrong');
    this.sorted++;
    this.env.setLeft(Math.max(0, this.total - this.sorted));
    this.afterSort();
    return true;
  };
  Rush.prototype.afterSort = function () {
    if (this.env.over) return;
    if (!this.env.timed) {
      if (this.sorted >= this.total) { this.env.finish({ done: true, lives: this.lives }); return; }
      if (this.tier >= 4 && this.sorted % 8 === 0 && this.sorted < this.total) {
        var r; do { r = Math.floor(this.env.rnd() * 4); } while (r === this.rule);
        this.setRule(r);
      }
    }
  };
  Rush.prototype.update = function (dt) {
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    if (this.pressT > 0) { this.pressT -= dt; if (this.pressT <= 0) this.press = -1; }
    if (this.freeze > 0) { this.freeze -= dt; return; }
    var env = this.env;
    if (env.timed) {
      var want = Math.min(3, Math.floor(env.t / 15));
      if (want > this.tier) { this.tier = want; this.setRule(want); return; }
    }
    var sp = 1 / (this.tt * this.speedMul());
    this.items.forEach(function (it) { it.y += sp * dt; it.age += dt; });
    while (this.items.length && this.items[0].y >= 1) {
      this.items.shift(); this.lose('miss'); this.sorted++;
      env.setLeft(Math.max(0, this.total - this.sorted));
      this.afterSort();
      if (env.over) return;
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.spawned < this.total) {
      this.items.push(this.makeItem()); this.spawned++;
      this.spawnT = this.tt * this.speedMul() * (0.34 + env.rnd() * 0.1);
    }
  };
  Rush.prototype.bot = function () {
    if (this.env.over || this.freeze > 0 || !this.items.length) return;
    var sk = this.env.skill, it = this.items[0];
    if (!it.react) it.react = sk.tempo * 2 * (0.8 + this.env.rnd() * 0.5);
    if (it.age < it.react) return;
    var correct = this.R().f(it.d), bins = this.R().bins.length;
    var err = sk.eps * 0.25 * LOAD[this.rule === this.tier ? this.tier : 4];
    var pick = this.env.rnd() < err ? Math.floor(this.env.rnd() * bins) : correct;
    this.sort(pick);
  };
  Rush.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    this.laneW = Math.min(W * 0.96, 600); this.lx = (W - this.laneW) / 2; this.cx = W / 2;
    this.binH = Math.max(60, H * 0.2); this.binTop = H - this.binH - 6;
    this.ds = Math.max(24, Math.min(this.laneW * 0.24, this.binTop * 0.16, 96));
  };
  Rush.prototype.draw = function (c) {
    var W = this.W, H = this.H, R = this.R(), nb = R.bins.length, i;
    rr(c, this.lx, 4, this.laneW, this.binTop - 4, 14); c.fillStyle = 'rgba(0,0,0,0.28)'; c.fill();
    c.save(); c.beginPath(); c.rect(this.lx, 4, this.laneW, this.binTop - 4); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.05)';
    var off = (this.env.t * 60) % 40;
    for (i = -1; i < this.binTop / 40 + 1; i++) c.fillRect(this.cx - 3, i * 40 + off, 6, 20);
    var travel = this.binTop - this.ds * 0.9;
    for (i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i], y = it.y * travel;
      if (it.d.length === 1) drawDie(c, this.cx - this.ds / 2, y, this.ds, it.d[0], { stroke: i === 0 ? '#fff' : null });
      else { drawDie(c, this.cx - this.ds * 1.05, y, this.ds, it.d[0], { stroke: i === 0 ? '#fff' : null }); drawDie(c, this.cx + this.ds * 0.05, y, this.ds, it.d[1], { stroke: i === 0 ? '#fff' : null }); }
    }
    c.restore();
    var bw = this.laneW / nb;
    for (i = 0; i < nb; i++) {
      var x = this.lx + i * bw, pr = this.press === i;
      rr(c, x + 4, this.binTop, bw - 8, this.binH, 16); c.fillStyle = pr ? '#fff' : BINCOL[i]; c.fill();
      text(c, R.bins[i], x + bw / 2, this.binTop + this.binH / 2, Math.min(bw * 0.24, this.binH * 0.32, 42), pr ? '#222' : '#10203a');
    }
    for (i = 0; i < Math.max(3, this.lives); i++) text(c, i < this.lives ? '❤️' : '🖤', this.lx + 18 + i * 26, 26, 20);
    var mult = 1 + Math.min(3, Math.floor(this.streak / 5));
    text(c, 'Streak ' + this.streak + (mult > 1 ? '  x' + mult : ''), this.lx + this.laneW - 10, 26, 16, mult > 1 ? '#ffd43b' : '#cde', 'right');
    text(c, R.tip, this.cx, 54, 15, '#cde', 'center', '600');
    if (this.flash) { c.fillStyle = this.flash.ok ? 'rgba(105,219,124,0.15)' : 'rgba(255,107,107,0.28)'; c.fillRect(0, 0, W, H); }
    if (this.freeze > 0) { c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(this.lx, 4, this.laneW, this.binTop - 4); text(c, 'New rule!', this.cx, this.binTop * 0.38, 32, '#ffd43b'); text(c, R.tip, this.cx, this.binTop * 0.38 + 40, 22, '#fff'); }
  };
  Rush.prototype.pd = function (x, y) {
    if (y < this.binTop - 10) return;
    var nb = this.R().bins.length, i = Math.floor((x - this.lx) / (this.laneW / nb));
    if (i >= 0 && i < nb) this.sort(i);
  };
  Rush.prototype.pm = function () {}; Rush.prototype.pu = function () {}; Rush.prototype.btn = function () {};

  Games.rush = {
    id: 'rush', name: 'Dice Rush', icon: '⚡', color: '#fab005', unit: 'Dice',
    blurb: 'Sort fast! It speeds up!', how: 'Tap the bin that matches the front die. Streaks multiply your points. 3 hearts only!',
    par: 41, budget: function (l) { return 50 + Math.floor(l * 1.6); }, timedPar: 35, timedSecs: 60,
    controls: [],
    create: function (env) { return new Rush(env); }
  };
})();
