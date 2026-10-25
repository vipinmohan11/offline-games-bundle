'use strict';
/* Dice Duel: you vs the computer on a 5x5 board. Roll, then place your die. A bigger die flips the smaller
   enemy dice next to it. When the board is full the bigger pip total wins the round. Best of 3. */
(function () {
  var N = 5, ME = 1, CPU = 2, COLOR = { 1: '#4dabf7', 2: '#ff8787' };
  var D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function sums(b) {
    var s = [0, 0, 0];
    for (var i = 0; i < N * N; i++) if (b[i].o) s[b[i].o] += b[i].v;
    return s;
  }
  /* Place value v for owner o at index i on board b (mutates). Returns flipped indices. */
  function place(b, i, o, v) {
    var r = Math.floor(i / N), c = i % N, flipped = [];
    b[i] = { o: o, v: v };
    D4.forEach(function (d) {
      var rr_ = r + d[0], cc = c + d[1];
      if (rr_ < 0 || rr_ >= N || cc < 0 || cc >= N) return;
      var q = rr_ * N + cc;
      if (b[q].o && b[q].o !== o && b[q].v < v) { b[q] = { o: o, v: b[q].v }; flipped.push(q); }
    });
    return flipped;
  }
  function copy(b) { return b.map(function (x) { return { o: x.o, v: x.v }; }); }
  function empties(b) { var e = []; for (var i = 0; i < N * N; i++) if (!b[i].o) e.push(i); return e; }
  function diffFor(b, o) { var s = sums(b); return s[o] - s[3 - o]; }

  /* Choose a cell for owner o holding die v. look=true adds a one-reply lookahead. */
  function choose(b, o, v, eps, look, rnd) {
    var em = empties(b);
    if (!em.length) return -1;
    if (rnd() < eps) return em[Math.floor(rnd() * em.length)];
    var best = -1, bestV = -1e9;
    em.forEach(function (i) {
      var b2 = copy(b); place(b2, i, o, v);
      var val = diffFor(b2, o) + rnd() * 0.01;
      if (look) {
        var em2 = empties(b2);
        if (em2.length) {
          var tot = 0;
          for (var f = 1; f <= 6; f++) {
            var worst = -1e9;
            em2.forEach(function (j) { var b3 = copy(b2); place(b3, j, 3 - o, f); worst = Math.max(worst, diffFor(b3, 3 - o)); });
            tot += worst;
          }
          val = val - 0.5 * (tot / 6 - diffFor(b2, 3 - o));
        }
      }
      if (val > bestV) { bestV = val; best = i; }
    });
    return best;
  }

  function Duel(env) {
    var l = env.level, T = env.timed;
    this.env = env;
    this.eps = T ? 0.3 : Math.max(0, 0.7 - l * 0.0175);
    this.look = !T && l >= 32;
    this.hand = T ? 0 : Math.min(4, Math.floor(l / 10));
    this.cpuMaxF = T ? 5 : Math.min(6, 3 + l / 10);      // early CPU rolls smaller dice
    this.wins = [0, 0, 0]; this.margin = 0; this.round = 0; this.score = 0; this.flip = {}; this.hov = null; this.hint = null; this.hintT = 0;
    this.startRound();
  }
  Duel.prototype.rand = function (n) { return Math.floor(this.env.rnd() * n); };
  Duel.prototype.startRound = function () {
    this.round++;
    this.b = []; for (var i = 0; i < N * N; i++) this.b.push({ o: 0, v: 0 });
    for (var k = 0; k < this.hand; k++) { var c; do { c = this.rand(N * N); } while (this.b[c].o); this.b[c] = { o: CPU, v: 1 + this.rand(4) }; }
    this.turn = (this.round % 2 === 1) ? ME : CPU;
    this.state = 'play'; this.wait = 0.6; this.banner = null; this.flip = {};
    this.roll();
    this.env.setLeft(this.env.timed ? Infinity : Math.max(0, 3 - this.round + 1));
  };
  Duel.prototype.roll = function () { var mx = 6;
    if (this.turn === CPU) { mx = Math.min(6, Math.floor(this.cpuMaxF) + (this.env.rnd() < this.cpuMaxF % 1 ? 1 : 0)); }
    this.die = 1 + this.rand(mx); };
  Duel.prototype.play = function (i, who) {
    if (this.state !== 'play' || this.turn !== who || this.b[i].o) return false;
    var fl = place(this.b, i, who, this.die), s = this.cell;
    if (who === ME && !fl.length) this.env.mistake();                 // a move that flips nothing
    this.flip = {}; fl.forEach(function (q) { this.flip[q] = 0.5; }, this);
    this.hint = null;
    this.env.sfx(fl.length ? 'combo' : 'thud');
    if (fl.length >= 2) this.env.say(fl.length + ' flipped!');
    if (!empties(this.b).length) { this.endRound(); return true; }
    this.turn = 3 - who; this.roll(); this.wait = 0.75;
    return true;
  };
  Duel.prototype.endRound = function () {
    var s = sums(this.b), me = s[ME], cpu = s[CPU], won = me > cpu, tie = me === cpu;
    var pts = 0;
    if (won) { pts = 100 + 5 * (me - cpu); this.wins[ME]++; this.margin += me - cpu; }
    else if (!tie) this.wins[CPU]++;
    else { pts = 20; }
    if (pts) this.env.addScore(pts, this.W / 2, this.oy + this.cell * 2.5, '#ffd43b');
    this.env.sfx(won ? 'win' : 'bad');
    this.banner = { text: won ? 'You win the round!' : tie ? 'Draw!' : 'CPU wins the round', me: me, cpu: cpu, t: 1.7 };
    this.state = 'between';
  };
  Duel.prototype.afterRound = function () {
    if (this.env.timed) { this.startRound(); return; }
    if (this.wins[ME] >= 2 || this.wins[CPU] >= 2 || this.round >= 3 && this.wins[ME] !== this.wins[CPU]) {
      var won = this.wins[ME] > this.wins[CPU];
      this.env.finish({ won: won, sweep: won && this.wins[CPU] === 0, margin: this.margin, wins: this.wins[ME], losses: this.wins[CPU] });
    } else this.startRound();
  };
  Duel.prototype.update = function (dt) {
    this.hintT -= dt;
    for (var k in this.flip) { this.flip[k] -= dt; if (this.flip[k] <= 0) delete this.flip[k]; }
    if (this.state === 'between') { this.banner.t -= dt; if (this.banner.t <= 0) this.afterRound(); return; }
    if (this.state !== 'play') return;
    if (this.wait > 0) { this.wait -= dt; return; }
    if (this.turn === CPU) {
      var i = choose(this.b, CPU, this.die, this.eps, this.look, this.env.rnd);
      if (i >= 0) this.play(i, CPU);
    }
  };
  Duel.prototype.bot = function (dt) {
    if (this.state !== 'play' || this.turn !== ME || this.wait > 0 || !botReady(this, dt)) return;
    botDone(this);
    var sk = this.env.skill, i = choose(this.b, ME, this.die, sk.eps, this.env.level >= 12, this.env.rnd);
    if (i >= 0) this.play(i, ME);
  };
  Duel.prototype.showHint = function () {
    if (this.turn !== ME) return;
    this.hint = choose(this.b, ME, this.die, 0, true, function () { return 0.5; }); this.hintT = 4;
  };
  Duel.prototype.resize = function (W, H) {
    this.W = W; this.H = H;
    var land = W / H > 1.15; this.land = land;
    var bs = land ? Math.min(H * 0.95, W * 0.6) : Math.min(W * 0.97, H * 0.66);
    this.cell = Math.max(10, Math.floor(bs / N));
    var bw = this.cell * N;
    if (land) { this.ox = Math.floor((W * 0.6 - bw) / 2) + 8; this.oy = Math.floor((H - bw) / 2); }
    else { this.ox = Math.floor((W - bw) / 2); this.oy = 8; }
  };
  Duel.prototype.draw = function (c) {
    var s = this.cell, ox = this.ox, oy = this.oy, W = this.W, H = this.H, i;
    boardBg(c, ox, oy, s * N, s * N);
    var prev = {};
    if (this.hov != null && this.turn === ME && this.state === 'play' && !this.b[this.hov].o) {
      var b2 = copy(this.b); place(b2, this.hov, ME, this.die);
      for (i = 0; i < N * N; i++) if (b2[i].o !== this.b[i].o) prev[i] = 1;
    }
    for (i = 0; i < N * N; i++) {
      var r = Math.floor(i / N), cc = i % N, x = ox + cc * s, y = oy + r * s, d = this.b[i];
      rr(c, x + 2, y + 2, s - 4, s - 4, s * 0.15); c.fillStyle = this.hov === i ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'; c.fill();
      if (d.o) {
        var f = this.flip[i];
        drawDie(c, x, y, s, d.v, { color: COLOR[d.o], scale: f ? 1 + f * 0.3 : 1, stroke: f ? '#fff' : null });
      }
      if (prev[i]) { rr(c, x + 3, y + 3, s - 6, s - 6, s * 0.2); c.strokeStyle = '#ffd43b'; c.lineWidth = 3; c.stroke(); }
      if (this.hint === i && this.hintT > 0) { rr(c, x + 3, y + 3, s - 6, s - 6, s * 0.2); c.strokeStyle = 'rgba(140,233,154,' + (0.5 + 0.5 * Math.sin(this.env.t * 8)) + ')'; c.lineWidth = 4; c.stroke(); }
    }
    var sm = sums(this.b), bw = s * N, px, py, pw;
    if (this.land) { px = ox + bw + 20; pw = W - px - 10; py = oy; } else { px = 10; pw = W - 20; py = oy + bw + 14; }
    var cy = py + 24;
    text(c, 'You ' + sm[ME], px + pw * 0.25, cy, Math.min(26, s * 0.5), COLOR[ME]);
    text(c, 'CPU ' + sm[CPU], px + pw * 0.75, cy, Math.min(26, s * 0.5), COLOR[CPU]);
    if (!this.env.timed) {
      var wr = '', k; for (k = 0; k < 2; k++) wr += (k < this.wins[ME] ? '🏆' : '▫️') + ' ';
      text(c, wr, px + pw * 0.25, cy + 34, 20); var wc = ''; for (k = 0; k < 2; k++) wc += (k < this.wins[CPU] ? '🏆' : '▫️') + ' ';
      text(c, wc, px + pw * 0.75, cy + 34, 20);
      text(c, 'Round ' + Math.min(this.round, 3), px + pw * 0.5, cy + 34, 14, '#99a');
    } else text(c, 'Round ' + this.round + ' · wins ' + this.wins[ME], px + pw * 0.5, cy + 34, 14, '#99a');
    var dy = cy + 34 + Math.min(70, s * 1.0);
    var ds = Math.min(s * 1.0, 70);
    if (this.state === 'play') {
      var mine = this.turn === ME;
      text(c, mine ? 'Your die - tap a square' : 'CPU is thinking...', px + pw / 2, dy - ds * 0.85, 15, mine ? '#fff' : '#99a', 'center', '600');
      drawDie(c, px + pw / 2 - ds / 2, dy - ds * 0.55, ds, this.die, { color: COLOR[this.turn], stroke: '#fff' });
    }
    if (this.banner) {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(ox, oy + bw * 0.34, bw, bw * 0.32);
      text(c, this.banner.text, ox + bw / 2, oy + bw * 0.46, Math.min(28, s * 0.55), '#ffd43b');
      text(c, 'You ' + this.banner.me + '  -  CPU ' + this.banner.cpu, ox + bw / 2, oy + bw * 0.57, Math.min(22, s * 0.42), '#fff');
    }
  };
  Duel.prototype.cellAt = function (x, y) {
    var c = Math.floor((x - this.ox) / this.cell), r = Math.floor((y - this.oy) / this.cell);
    return (r >= 0 && r < N && c >= 0 && c < N) ? r * N + c : null;
  };
  Duel.prototype.pd = function (x, y) { this.hov = this.cellAt(x, y); };
  Duel.prototype.pm = function (x, y) { if (this.hov != null) this.hov = this.cellAt(x, y); };
  Duel.prototype.pu = function (x, y) { var i = this.cellAt(x, y); if (i != null && i === this.hov) this.play(i, ME); this.hov = null; };
  Duel.prototype.btn = function (k) { if (k === 'hint') this.showHint(); };

  Games.duel = {
    id: 'duel', name: 'Dice Duel', icon: '⚔️', color: '#e64980', unit: 'Rounds', noMeter: true,
    blurb: 'Beat the computer, best of 3!', how: 'Roll, then tap a square. A bigger die flips smaller enemy dice next to it. Biggest pip total at the end wins the round.', howDe: 'Würfeln, dann ein Feld antippen. Ein größerer Würfel dreht kleinere Würfel des Gegners um. Wer am Ende mehr Augen hat, gewinnt.',
    par: 1, budget: function () { return 3; }, timedPar: 3.8, timedSecs: 120,
    thresholds: function () { return [1, 2, 3]; },
    stars: function (l, r) {
      if (!r.won) return 0;
      if (!r.sweep) return 1;
      return r.margin >= 10 + Math.floor(l / 4) ? 3 : 2;
    },
    starHelp: function (l) { return '1 star: win the match. 2 stars: win 2-0. 3 stars: win 2-0 by ' + (10 + Math.floor(l / 4)) + '+ pips in total.'; },
    controls: [{ k: 'hint', t: '💡 Hint' }],
    create: function (env) { return new Duel(env); }
  };
  Games.duel._choose = choose; Games.duel._place = place;
})();
