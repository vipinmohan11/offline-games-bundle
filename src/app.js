'use strict';
/* App shell: screens, save data, input, audio, effects, result flow. Browser only. */
(function () {
  var ORDER = ['drop', 'fit', 'garden', 'match', 'shot', 'rush', 'tower', 'duel'];
  var STICKERS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
    '🐧', '🐦', '🦆', '🦉', '🦄', '🐝', '🦋', '🐞', '🐢', '🐍', '🐙', '🦀', '🐠', '🐬', '🐳', '🦈',
    '🐘', '🦒', '🦓', '🦘', '🐪', '🦔', '🦥', '🦦', '🍎', '🍌', '🍓', '🍉', '🍕', '🍔', '🍦', '🍩',
    '⚽', '🏀', '🚀', '🛸', '🚂', '🚁', '⛵', '🎈', '🌈', '⭐', '🌙', '☀️', '🎸', '🥁', '🎨', '🏆'];
  var RANKS = ['Rookie Roller', 'Dice Cadet', 'Pip Pilot', 'Lucky Roller', 'Dice Knight', 'Dice Wizard', 'Dice Master', 'Dice Legend'];
  var KEY = 'diceArcade.v1';
  var VERSION = '2.1', BUILD = '__BUILD__';
  var DEF_SET = { vol: 0.8, vibe: true, motion: true, hints: true, text: 1, theme: 'night', big: false, lefty: false, name: '' };
  var $ = function (s) { return document.querySelector(s); };
  var save, run = null, G = null, curGame = null, paused = false, last = 0, raf = 0, overT = 0;
  var cv, ctx, dpr = 1, fx = [], parts = [], sayT = 0;

  /* ---------- storage ---------- */
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY)), d = Prog.newSave();
      if (s && s.v === 1) { for (var k in d) if (!(k in s)) s[k] = d[k]; fixSet(s); return s; }
    } catch (e) {}
    var n = Prog.newSave(); fixSet(n); return n;
  }
  function fixSet(s) { s.set = s.set || {}; for (var k in DEF_SET) if (!(k in s.set)) s.set[k] = DEF_SET[k]; }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function rankName(r) { return RANKS[Math.min(RANKS.length - 1, Math.floor((r - 1) / 4))]; }
  function fmt(n) { return Math.round(n).toLocaleString('en'); }

  /* ---------- audio ---------- */
  var ac = null;
  function tone(f, t0, d, type, vol) {
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, ac.currentTime + t0);
    g.gain.setValueAtTime(0.0001, ac.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (vol || 0.15) * save.set.vol / 0.8), ac.currentTime + t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + d);
    o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + t0); o.stop(ac.currentTime + t0 + d + 0.02);
  }
  function sfx(k) {
    if (save && save.set.vibe && navigator.vibrate && (k === 'bad' || k === 'win' || k === 'combo')) { try { navigator.vibrate(k === 'bad' ? 40 : k === 'win' ? 80 : 15); } catch (e) {} }
    if (!save || !save.sound) return;
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      if (k === 'pop') { tone(520, 0, 0.1, 'triangle'); tone(780, 0.05, 0.1, 'triangle'); }
      else if (k === 'combo') { tone(523, 0, 0.1, 'triangle'); tone(659, 0.07, 0.1, 'triangle'); tone(784, 0.14, 0.14, 'triangle'); }
      else if (k === 'thud') tone(130, 0, 0.12, 'sine', 0.22);
      else if (k === 'bad') { tone(220, 0, 0.18, 'sawtooth', 0.08); tone(160, 0.1, 0.2, 'sawtooth', 0.08); }
      else if (k === 'win') [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.1, 0.18, 'triangle'); });
      else if (k === 'star') tone(880 + Math.random() * 200, 0, 0.15, 'sine');
      else tone(700, 0, 0.04, 'square', 0.04);
    } catch (e) {}
  }

  /* ---------- screens ---------- */
  var screens = ['home', 'levels', 'album', 'settings', 'play'];
  function show(id) { screens.forEach(function (s) { $('#' + s).classList.toggle('hidden', s !== id); }); }
  function modal(html) { var m = $('#modal'); m.innerHTML = '<div class="dlg">' + html + '</div>'; m.classList.remove('hidden'); }
  function closeModal() { var m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; }

  function topLevel(id) { var l = 1; while (l < Prog.LEVELS && Prog.isUnlocked(save, id, l + 1)) l++; return l; }

  function renderHome() {
    $('#coins').textContent = '🪙 ' + fmt(save.coins);
    $('#pAv').textContent = save.avatar || '🎲';
    $('#pName').textContent = (save.set.name || 'Player') + ' · ' + TITLES[save.title || 0].t;
    var rk = Prog.rankOf(save.xp);
    $('#rankLine').textContent = 'Rank ' + rk.rank + ' · ' + rankName(rk.rank) + ' · ' + rk.into + ' / ' + rk.need + ' XP';
    $('#rankBar').style.width = (100 * rk.into / rk.need) + '%';
    var rdy = Prog.giftReady(save, today());
    $('#gift').classList.toggle('rdy', rdy);
    $('#gift').querySelector('small').textContent = rdy ? 'Claim' : 'Gift';
    $('#navAlbum').classList.toggle('dot', save.stickers.length > (save.seenStk || 0));
    $('#navSound').firstChild.textContent = save.sound ? '🔊' : '🔇';
    var h = '';
    ORDER.forEach(function (id) {
      var g = Games[id];
      var pct = Math.round(100 * Prog.totalStars(save, id) / (Prog.LEVELS * 3));
      h += '<button class="gcard" data-g="' + id + '" style="--c:' + g.color + '" aria-label="' + g.name + '"><span class="ic">' + g.icon + '</span>' +
        '<span class="tx"><b class="nm">' + g.name + '</b><small>' + g.blurb + '</small><span class="sbar"><i style="width:' + pct + '%"></i></span></span>' +
        '<span class="meta"><b>Level ' + topLevel(id) + '</b><small>⭐ ' + Prog.totalStars(save, id) + '</small></span><span class="go">›</span></button>';
    });
    $('#cards').innerHTML = h;
    checkBonus();
  }
  /* Sticker collection bonus: every 8 stickers pays a reward. */
  function checkBonus() {
    var r = Prog.stickerBonus(save); if (!r.length) return;
    persist();
    var txt = r.map(function (x) { return (x.coins ? '+' + x.coins + ' 🪙 ' : '') + (x.pu ? '+' + x.n + ' ' + POWERUPS.filter(function (p) { return p.id === x.pu; })[0].name : ''); }).join('<br>');
    modal('<h2>🎁 Collection reward!</h2><div class="sub">You collected ' + save.stickers.length + ' stickers.</div><div class="big" style="font-size:26px">' + txt + '</div><div class="btns"><button class="pri" id="mClose">Nice!</button></div>');
    sfx('win');
  }

  function openGame(id) {
    curGame = id; G = Games[id];
    $('#levels').style.setProperty('--c', G.color);
    $('#lvTitle').textContent = G.icon + ' ' + G.name;
    $('#lvHow').innerHTML = G.how + '<br><i>' + G.howDe + '</i>';
    $('#tabLv').style.setProperty('--c', G.color); $('#tabTm').style.setProperty('--c', G.color);
    renderLevels('lv'); show('levels');
  }
  function renderLevels(tab) {
    $('#lvCoins').textContent = '🪙 ' + fmt(save.coins);
    $('#tabLv').classList.toggle('on', tab === 'lv'); $('#tabTm').classList.toggle('on', tab === 'tm');
    var h = '', id = G.id, i;
    if (tab === 'lv') {
      var cur = topLevel(id);
      var nextChest = Math.ceil(cur / 5) * 5; if (nextChest > Prog.LEVELS) nextChest = 0;
      h += '<p class="note">⭐ ' + Prog.totalStars(save, id) + ' / ' + (Prog.LEVELS * 3) + (nextChest ? ' · next 🎁 at level ' + nextChest : '') + '</p>';
      h += '<div class="lvgrid">';
      for (i = 1; i <= Prog.LEVELS; i++) {
        var ok = Prog.isUnlocked(save, id, i), st = (save.stars[id] || {})[i] || 0;
        if (i === Prog.GUIDED + 1) h += '</div><p class="note">🏁 Endless Ladder ' + i + '–' + Prog.LEVELS + '</p><div class="lvgrid">';
        h += '<button class="lv ' + (ok ? '' : 'lock') + (i === cur ? ' cur' : '') + '" data-l="' + i + '"' + (ok ? '' : ' data-lock="1"') + '>' +
          (i % 5 === 0 ? '<span class="ch">' + (Prog.isBoss(i) ? '👑' : '🎁') + '</span>' : '') + ((save.stamps[id] || {})[i] ? '<span class="ch" style="left:4px;right:auto">💎</span>' : '') + '<b>' + (ok ? i : '🔒') + '</b><small>' + (ok ? '⭐'.repeat(st) + '<i style="opacity:.35;font-style:normal">' + '⭐'.repeat(3 - st) + '</i>' : '') + '</small></button>';
      }
      h += '</div><div class="lvfoot"><label class="chal' + (save.tokens > 0 ? '' : ' off') + '" title="Star Challenge: win 3 stars for double coins. Costs 1 token; if you lose only the token is gone."><input type="checkbox" id="chal"' + (save.tokens > 0 ? '' : ' disabled') + '><span>⚔ 🎖' + (save.tokens || 0) + '</span></label><button class="pri" id="goCur">▶ Level ' + cur + '</button></div>';
      h += '<p class="note leg">👑 boss · 💎 perfect · 🎁 chest · ⚔ Star Challenge (3★ = double coins)</p>';
    } else {
      var t = save.timed[id] || { medal: 0, best: 0 }, th = Prog.timedThr(G);
      h += '<div class="how"><b>⏱ Timed: ' + G.timedSecs + ' seconds.</b> Score as much as you can. It gets faster as you go!</div>';
      h += '<div class="rew"><span class="pill">🥉 ' + fmt(th[0]) + '</span><span class="pill">🥈 ' + fmt(th[1]) + '</span><span class="pill">🥇 ' + fmt(th[2]) + '</span></div>';
      h += '<p class="note">Best score: <b>' + fmt(t.best) + '</b> · Best medal: ' + (['none yet', '🥉 Bronze', '🥈 Silver', '🥇 Gold'][t.medal]) + '</p>';
      h += '<p class="note">Rewards: ' + Prog.MEDAL_COINS.map(function (c, k) { return ['🥉', '🥈', '🥇'][k] + ' +' + c + ' 🪙'; }).join(' · ') + ' (first time each) and +5 🪙 for a new best.</p>';
      h += '<div class="btns"><button class="pri" id="goTm">▶ Start timed round</button></div>';
    }
    $('#lvBody').innerHTML = h;
  }

  function renderAlbum() {
    checkBonus();
    $('#alCoins').textContent = '🪙 ' + fmt(save.coins);
    var h = '<h3>Power-ups</h3><p class="note">Use them while you play: tap the button under the score. Each one works once per game. Not in Star Challenges.</p><div class="pus">';
    POWERUPS.forEach(function (p) {
      h += '<div class="pu"><span class="pi">' + p.icon + '</span><div class="pt"><b>' + p.name + '</b><small>' + p.desc + '</small></div><div class="pr"><small>You have ' + (save.inv[p.id] || 0) + '</small><button data-pu="' + p.id + '" class="pri' + (save.coins < p.price ? ' poor' : '') + '">🪙 ' + p.price + '</button></div></div>';
    });
    h += '</div><h3>Dice skins</h3><div class="skins">';
    SKINS.forEach(function (s, i) {
      var own = save.skins.indexOf(i) >= 0;
      h += '<div class="skin' + (save.skin === i ? ' sel' : '') + '"><b>' + s.name + '</b><div class="sw">' + s.faces.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</div>' +
        '<button data-skin="' + i + '" class="' + (own ? '' : 'pri') + (!own && save.coins < s.price ? ' poor' : '') + '">' + (save.skin === i ? '✔ In use' : own ? 'Use' : '🪙 ' + s.price) + '</button></div>';
    });
    h += '</div><h3>Board looks</h3><p class="note">The background of the play board in most games.</p><div class="skins">';
    BOARDS.forEach(function (bd, i) {
      var own = save.boards.indexOf(i) >= 0;
      h += '<div class="skin' + (save.board === i ? ' sel' : '') + '"><b>' + bd.name + '</b><div class="bsw" style="background:' + (bd.bg || Skin.cur.bg) + '"></div>' +
        '<button data-board="' + i + '" class="' + (own ? '' : 'pri') + (!own && save.coins < bd.price ? ' poor' : '') + '">' + (save.board === i ? '✔ In use' : own ? 'Use' : '🪙 ' + bd.price) + '</button></div>';
    });
    h += '</div><h3>Avatars</h3><p class="note">Shown on the start page next to your name.</p><div class="avs">';
    AVATARS.forEach(function (a, i) {
      var own = save.avatars.indexOf(a) >= 0;
      h += '<button class="av' + (save.avatar === a ? ' sel' : '') + (own ? '' : ' lockd') + '" data-avatar="' + a + '"><span>' + a + '</span><small>' + (save.avatar === a ? 'In use' : own ? 'Use' : '🪙 ' + AVATAR_PRICE) + '</small></button>';
    });
    h += '</div><h3>Titles</h3><div class="tls">';
    TITLES.forEach(function (t, i) {
      var own = save.titles.indexOf(i) >= 0;
      h += '<button class="tl' + (save.title === i ? ' sel' : '') + '" data-title="' + i + '"><b>' + t.t + '</b><small>' + (save.title === i ? 'In use' : own ? 'Use' : '🪙 ' + t.price) + '</small></button>';
    });
    h += '</div>';
    $('#shop').innerHTML = h;
    var nxt = Math.min(Prog.STK_REWARDS.length, save.stkClaimed + 1) * Prog.STK_STEP, rw = Prog.STK_REWARDS[Math.min(save.stkClaimed, Prog.STK_REWARDS.length - 1)];
    $('#stkNote').textContent = save.stkClaimed >= Prog.STK_REWARDS.length ? 'All collection rewards claimed. Great job!' :
      'Collection reward at ' + nxt + ' stickers: ' + (rw.coins ? '+' + rw.coins + ' 🪙 ' : '') + (rw.pu ? '+' + rw.n + ' ' + POWERUPS.filter(function (p) { return p.id === rw.pu; })[0].name : '') + ' (you have ' + save.stickers.length + ').';
    $('#stkTitle').textContent = 'Stickers ' + save.stickers.length + ' / ' + Prog.STICKER_COUNT;
    var sh = '';
    var fresh = {}, order = [], seen = save.seenStk || 0, j;
    for (j = seen; j < save.stickers.length; j++) { fresh[save.stickers[j]] = 1; order.push(save.stickers[j]); }     // new ones first
    for (j = 0; j < Prog.STICKER_COUNT; j++) if (save.stickers.indexOf(j) >= 0 && !fresh[j]) order.push(j);          // then owned, by number
    for (j = 0; j < Prog.STICKER_COUNT; j++) if (save.stickers.indexOf(j) < 0) order.push(j);                          // missing last
    order.forEach(function (n) {
      var own = save.stickers.indexOf(n) >= 0;
      sh += '<div class="stk ' + (own ? '' : 'no') + '">' + (own ? '' : '<u>?</u>') + '<span>' + STICKERS[n] + '</span>' + (fresh[n] ? '<i class="nw"></i>' : '') + '</div>';
    });
    save.seenStk = save.stickers.length; persist();
    $('#stickers').innerHTML = sh;
  }

  /* ---------- play ---------- */
  function fitCanvas() {
    var st = $('#stage'), w = st.clientWidth, h = st.clientHeight;
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (run) run.resize(w, h);
  }
  var ui = {
    fx: function (x, y, t, color) { if (x == null) { x = run.W / 2; y = run.H / 3; } fx.push({ x: x, y: y, t: 0, s: t, c: color || '#fff' }); },
    burst: function (x, y, color, n) { if (!save.set.motion) return; for (var i = 0; i < (n || 6); i++) parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 320, vy: -Math.random() * 260 - 40, t: 0, c: color || '#fff' }); },
    sfx: sfx,
    say: function (s) { var e = $('#say'); e.textContent = s; e.classList.remove('go'); void e.offsetWidth; e.classList.add('go'); clearTimeout(sayT); sayT = setTimeout(function () { e.classList.remove('go'); e.textContent = ''; }, 1150); }
  };

  function startRun(id, level, timed, wantChal) {
    closeModal();
    G = Games[id]; curGame = id;
    run = new Run(G, level, timed, (Math.random() * 2147483647) | 0, ui, { eps: 0, tempo: 0.15, noise: 1 });
    run.challenge = false; $('#play').dataset.urg = 0;
    if (wantChal && !timed && save.tokens > 0) { save.tokens--; run.challenge = true; persist(); }
    fx = []; parts = []; paused = false; overT = 0; clearTimeout(sayT); $('#say').classList.remove('go'); $('#say').textContent = '';
    $('#hudTitle').textContent = G.icon + ' ' + G.name + ' · ' + (timed ? 'Timed' : (Prog.isBoss(level) ? '👑 Boss ' : '') + 'Level ' + level) + (run.challenge ? ' ⚔' : '');
    buildMeter();
    var c = $('#ctl'); c.innerHTML = '';
    c.classList.toggle('none', !G.controls.length || (G.controls.length === 1 && G.controls[0].k === 'hint' && !save.set.hints));
    G.controls.forEach(function (b) {
      if (b.k === 'hint' && !save.set.hints) return;
      var e = document.createElement('button'); e.textContent = b.t; e.dataset.k = b.k;
      var fire = function (ev) { ev.preventDefault(); if (run && !paused && !run.over) { run.game.btn(b.k); } };
      e.addEventListener('pointerdown', fire);
      c.appendChild(e);
    });
    show('play'); fitCanvas(); updateHud();
    $('#hudGoal').textContent = G.goal || '';
    buildPower();
    var first = !save.seen[id];
    if (first) { save.seen[id] = 1; persist(); }
    if (first || (!timed && level <= 10)) showIntro(first);
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  /* Power-up buttons under the HUD: once per run each. */
  function buildPower() {
    var el = $('#pwr'), h = '';
    if (run.challenge) { el.innerHTML = ''; el.classList.add('none'); return; }
    POWERUPS.forEach(function (p) {
      if (p.id === 'time' && run.timeLeft == null) return;
      var n = save.inv[p.id] || 0, used = run.pu[p.id];
      h += '<button class="pwb' + (used ? ' used' : n ? '' : ' none0') + '" data-pu="' + p.id + '">' + p.icon + ' ' + p.short + '<b>' + (used ? '✓' : n) + '</b></button>';
    });
    el.innerHTML = h; el.classList.toggle('none', !h);
  }
  function usePowerBtn(id) {
    if (!run || paused || run.over) return;
    var p = POWERUPS.filter(function (x) { return x.id === id; })[0];
    if (run.pu[id]) { sfx('tick'); return; }
    if (!(save.inv[id] > 0)) { sfx('bad'); ui.say('None left. Buy in 🛍 Shop'); return; }
    if (run.usePower(id)) { save.inv[id]--; persist(); sfx('win'); ui.say(p.icon + ' ' + p.name + '!'); buildPower(); }
  }

  /* Goal intro: an animated 3-step card shown 3 s before every run until level 10 (and the first time ever). Tap to skip. */
  var introT = 0;
  function goalLine() {
    var h = '';
    if (G.noMeter && !run.timed) h = G.starHelp(run.level);
    else {
      h = '🎯 Goal: <b>' + fmt(run.thr[0]) + '</b> points for ⭐';
      if (isFinite(run.budget) && !G.fixedClock) h += ' in <b>' + run.budget + '</b> ' + G.unit.toLowerCase();
    }
    if (run.timeLeft != null) h += ' · ⏱ <b>' + clockStr(run.clockMax) + '</b>';
    return h;
  }
  function showIntro(long) {
    paused = true;
    var panels = (G.intro || []).map(function (p) { return '<div class="ip"><b>' + p[0] + '</b><small>' + p[1] + '</small></div>'; }).join('<span class="ia">▶</span>');
    var secs = long ? 4 : 3;
    modal('<div class="intro" id="intro"><h2>' + G.icon + ' ' + G.name + '</h2><div class="ipanels">' + panels + '</div><p class="goalp">' + goalLine() + '</p>' + (G.lose ? '<p class="losep">⚠ Game over if ' + G.lose + '</p>' : '') +
      (long ? '<p class="sub"><i>' + G.howDe + '</i></p>' : '') + '<div class="skipbar"><i id="skipI" style="animation-duration:' + secs + 's"></i></div>' +
      '<div class="btns"><button id="inHold">⏸ Hold</button><button class="pri" id="inGo">▶ Start</button></div></div>');
    clearTimeout(introT);
    var go = function () { clearTimeout(introT); if ($('#intro')) { closeModal(); paused = false; last = performance.now(); } };
    introT = setTimeout(go, secs * 1000);
    $('#inGo').addEventListener('click', go);
    $('#inHold').addEventListener('click', function () {           // keep the intro open as long as you like
      clearTimeout(introT);
      $('#skipI').style.animationPlayState = 'paused';
      document.querySelectorAll('#intro .ip').forEach(function (e) { e.style.animationPlayState = 'paused'; });
      this.disabled = true; this.textContent = '⏸ Held';
    });
  }

  function buildMeter() {
    var m = $('#meter'), tb = $('#tbar');
    tb.classList.toggle('hidden', run.timeLeft == null);
    if (G.noMeter && !run.timed) { m.innerHTML = '<div style="font-size:12px;color:#9aa3c7;font-weight:700;padding-top:1px;white-space:normal;line-height:1.1;margin-top:-4px">' + G.starHelp(run.level) + '</div>'; m.style.background = 'none'; m.style.height = 'auto'; return; }
    m.style.background = ''; m.style.height = '';
    var max = run.thr[2] * 1.12, h = '<i id="meterFill"></i>';
    run.thr.forEach(function (t, k) { h += '<u data-k="' + k + '" style="left:' + (100 * t / max) + '%">' + (run.timed ? ['🥉', '🥈', '🥇'][k] : '⭐') + '</u>'; });
    m.innerHTML = h; run.meterMax = max;
  }
  function clockStr(t) { t = Math.ceil(t); return t >= 100 ? Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2) : t + 's'; }
  function updateHud() {
    if (!run) return;
    var hs = $('#hudScore'), st = fmt(run.score);
    var gl = null; if (!(G.noMeter && !run.timed)) { gl = run.thr[2]; for (var q = 0; q < 3; q++) if (run.score < run.thr[q]) { gl = run.thr[q]; break; } }
    var hh = st + (gl != null ? '<small>/ ' + fmt(gl) + '</small>' : '');
    if (run.hs !== hh) { var grew = run.hs != null; run.hs = hh; hs.innerHTML = hh; if (grew && save.set.motion) { hs.classList.remove('bump'); void hs.offsetWidth; hs.classList.add('bump'); } }
    var urg = 0, hasClock = run.timeLeft != null;
    if (hasClock) { var fr = run.timeLeft / run.clockMax; urg = (run.timeLeft <= 10 || fr < 0.1) ? 2 : fr < 0.25 ? 1 : 0; }
    else if (G.id === 'rush' && run.game.lives === 1) urg = 1;
    if ($('#play').dataset.urg !== String(urg)) $('#play').dataset.urg = urg;
    if (hasClock && urg === 2 && Math.ceil(run.timeLeft) !== run.lastTick) { run.lastTick = Math.ceil(run.timeLeft); sfx('tick'); }
    var left = hasClock ? (urg === 2 ? '⏳ ' : '⏱ ') + clockStr(run.timeLeft) : '';
    if (!run.timed && isFinite(run.left) && G.id !== 'duel') left += (left ? ' · ' : '') + G.unit + ' ' + run.left;
    $('#hudLeft').textContent = left;
    if (hasClock) $('#tbar').firstChild.style.width = (100 * run.timeLeft / run.clockMax) + '%';
    var f = $('#meterFill');
    if (f) {
      f.style.width = Math.min(100, 100 * run.score / run.meterMax) + '%';
      var us = $('#meter').querySelectorAll('u');
      for (var k = 0; k < us.length; k++) us[k].classList.toggle('on', run.score >= run.thr[k]);
      var reached = run.thr.filter(function (t) { return run.score >= t; }).length;
      if (reached > (run.lastReached || 0)) { if (!run.timed) ui.say(['', '⭐ Goal reached!', '⭐⭐ Two stars!', '⭐⭐⭐ Three stars!'][reached]); sfx('star'); }
      run.lastReached = reached;
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!run) return;
    if (!paused && !run.over) { run.step(dt); updateHud(); }
    else if (run.over && !paused) { overT += dt; if (overT > 0.9 && !run.done) { run.done = true; onOver(); } }
    var W = run.W, H = run.H;
    ctx.clearRect(0, 0, W, H);
    run.draw(ctx);
    var i, f, p;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i]; p.t += dt; p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.t > 0.7) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - p.t / 0.7; ctx.fillStyle = p.c; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    for (i = fx.length - 1; i >= 0; i--) {
      f = fx[i]; f.t += dt;
      if (f.t > 1) { fx.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - f.t; text(ctx, f.s, f.x, f.y - f.t * 46, 22 + (f.t < 0.15 ? 6 : 0), f.c);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- results ---------- */
  function onOver() {
    var res = run.result, out, lvl = run.level, timed = run.timed, rnd = Math.random;
    if (run.flowers) save.flowers += run.flowers;
    if (timed) out = Prog.applyTimed(save, G, res.score, rnd);
    else out = Prog.applyLevel(save, G, lvl, res.score, res.stars, rnd, { style: res.style, perfect: res.perfect, challenge: run.challenge });
    persist();
    showResult(out, res, lvl, timed);
  }
  function reasonOf(i) {
    i = i || {};
    if (i.stuck) return '⚠ Game over: none of your 3 shapes fits any more.';
    if (i.full) return '⚠ Game over: every column is full.';
    if (i.overflow) return '⚠ Game over: the stack reached the top.';
    if (i.overrun) return '⚠ Game over: the wall crossed the red line.';
    if (i.lives) return '⚠ Game over: you lost all hearts.';
    if (i.miss) return '⚠ Game over: the row missed the tower.';
    if (i.timeUp) return '⏱ Time is up. The score you had counts.';
    return '';
  }
  function showResult(out, res, lvl, timed) {
    var th = timed ? Prog.timedThr(G) : Prog.thresholds(G, lvl), won = res.stars >= 1, i;
    var h = '';
    var title = timed ? (res.stars ? 'Time\'s up! Great job!' : 'Time\'s up!') : (won ? 'Level ' + lvl + ' complete!' : 'So close! Try again');
    h += '<h2>' + title + '</h2>';
    var why = reasonOf(res.info); if (why) h += '<div class="why">' + why + '</div>';
    h += '<div class="stars" id="rs">' + [0, 1, 2].map(function () { return '<span>' + (timed ? '🏅' : '⭐') + '</span>'; }).join('') + '</div>';
    h += '<div class="big">' + fmt(res.score) + '</div>';
    var best = timed ? out.best : (save.best[G.id + ':' + lvl] || 0);
    h += '<div class="sub">' + (out.newBest ? '🎉 New best!' : 'Best ' + fmt(best)) + '</div>';
    if (G.noMeter && !timed) h += '<div class="thr">' + G.starHelp(lvl) + '</div>';
    else h += '<div class="thr">' + th.map(function (t, k) { return (timed ? ['🥉', '🥈', '🥇'][k] : '⭐'.repeat(k + 1)) + ' ' + fmt(t); }).join('<span>·</span>') + '</div>';
    if (!won && !timed && !G.noMeter) h += '<div class="sub">Almost! You need ' + fmt(th[0] - res.score) + ' more points for 1 star.</div><div class="bar"><i style="width:' + Math.min(99, Math.round(100 * res.score / th[0])) + '%"></i></div>';
    if (!timed) h += '<div class="sub">Style <b>' + Prog.styleRank(res.style) + '</b> · ' + res.mistakes + ' mistake' + (res.mistakes === 1 ? '' : 's') + (out.challenge ? ' · ⚔ Star Challenge' : '') + '</div>';
    h += '<div class="rew"><span class="pill gold">+' + out.coins + ' 🪙</span><span class="pill">+' + out.xp + ' XP</span></div>';
    if (!timed && out.stars > out.oldStars && out.oldStars > 0) h += '<div class="sub">Improved from ' + out.oldStars + ' to ' + out.stars + ' stars!</div>';
    if (!timed && out.stars <= out.oldStars && won) h += '<div class="sub">Beat your ' + out.oldStars + '-star score to earn more coins.</div>';
    if (out.stamp) h += '<div class="reveal"><div class="em">💎</div>Gold Stamp! Perfect run, +' + out.stamp + ' 🪙<br><small>Goldener Stempel!</small></div>';
    if (out.boss) h += '<div class="reveal"><div class="em">👑' + (out.boss.sticker != null ? STICKERS[out.boss.sticker] : '') + '</div>Boss beaten!' + (out.boss.sticker != null ? ' New sticker!' : '') + '</div>';
    if (out.token) h += '<div class="reveal">🎖 +' + out.token + ' Courage Token (now ' + (save.tokens || 0) + ')</div>';
    if (out.tokenLost) h += '<div class="sub">⚔ Challenge lost: only the token is gone. Your coins and stars are safe.</div>';
    if (out.chest) h += '<div class="reveal" id="chestBox" data-open="' + (out.chest.sticker != null ? STICKERS[out.chest.sticker] : '🎉') + '"><div class="em shake">🎁</div>Chest! +' + out.chest.coins + ' 🪙' + (out.chest.sticker != null ? ' and a new sticker!' : '') + '</div>';
    out.ranks.forEach(function (r) { h += '<div class="reveal"><div class="em">🏅' + (r.sticker != null ? STICKERS[r.sticker] : '') + '</div>Rank up! Rank ' + r.rank + ' · ' + rankName(r.rank) + '<br>+' + r.coins + ' 🪙' + (r.sticker != null ? ' and a new sticker' : '') + '</div>'; });
    if (out.unlocked) h += '<div class="reveal">🔓 Level ' + out.unlocked + ' unlocked!</div>';
    h += '<div class="btns">';
    if (!timed && won && lvl < Prog.LEVELS) h += '<button class="pri" id="rNext">Next level ▶</button>';
    h += '<button id="rRetry" class="' + (won ? '' : 'pri') + '">↻ Again</button><button id="rBack">Levels</button></div>';
    modal(h);
    var spans = document.querySelectorAll('#rs span');
    for (i = 0; i < res.stars; i++) (function (k) { setTimeout(function () { if (spans[k]) { spans[k].classList.add('on'); sfx('star'); } }, 300 + k * 350); })(i);
    // reward sequence: coins and XP count up, the chest shakes then opens; a tap on the sheet skips to the end
    var pills = document.querySelectorAll('.rew .pill'), cb = $('#chestBox'), timers = [];
    var finish = function () { timers.forEach(clearTimeout); timers = []; pills.forEach(function (p) { p.textContent = p.dataset.fin; }); if (cb) { cb.firstChild.className = 'em'; cb.firstChild.textContent = '🎁' + cb.dataset.open; } };
    pills.forEach(function (p) { p.dataset.fin = p.textContent; });
    if (save.set.motion) {
      pills.forEach(function (p) {
        var m = p.dataset.fin.match(/^\+(\d+)(.*)$/); if (!m) return;
        var n = +m[1], t0 = performance.now();
        (function tick() { var k = Math.min(1, (performance.now() - t0) / 700); p.textContent = '+' + Math.round(n * k) + m[2]; if (k < 1 && p.dataset.fin) timers.push(setTimeout(tick, 40)); })();
      });
      if (cb) timers.push(setTimeout(function () { cb.firstChild.className = 'em'; cb.firstChild.textContent = '🎁' + cb.dataset.open; sfx('win'); }, 1100));
    } else finish();
    document.querySelector('.dlg').addEventListener('click', function (e) { if (!e.target.closest('button')) finish(); });
    sfx(won ? 'win' : 'bad');
    $('#coins').textContent = '🪙 ' + fmt(save.coins);
  }

  /* ---------- events ---------- */
  function on(sel, ev, fn) { $(sel).addEventListener(ev, fn); }
  function wire() {
    cv = $('#cv'); ctx = cv.getContext('2d');
    window.addEventListener('resize', fitCanvas);
    if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe($('#stage'));
    document.addEventListener('visibilitychange', function () { if (document.hidden && run && !run.over && !paused) doPause(); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} if (!run || paused || run.over) return; var p = pos(e); run.game.pd(p[0], p[1]); });
    cv.addEventListener('pointermove', function (e) { if (!run || paused || run.over) return; var p = pos(e); run.game.pm(p[0], p[1]); });
    var up = function (e) { if (!run || paused) return; var p = pos(e); run.game.pu(p[0], p[1]); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);

    $('#cards').addEventListener('click', function (e) { var b = e.target.closest('[data-g]'); if (b) { sfx('tick'); openGame(b.dataset.g); } });
    on('#lvBack', 'click', function () { renderHome(); show('home'); });
    on('#lvHelp', 'click', function () { modal('<h2>' + G.icon + ' ' + G.name + '</h2><p class="sub">' + G.how + '<br><i>' + G.howDe + '</i></p><div class="btns"><button class="pri" id="mClose">OK</button></div>'); });
    $('#pwr').addEventListener('click', function (e) { var b = e.target.closest('[data-pu]'); if (b) usePowerBtn(b.dataset.pu); });
    on('#tabLv', 'click', function () { renderLevels('lv'); });
    on('#tabTm', 'click', function () { renderLevels('tm'); });
    $('#lvBody').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var chal = !!($('#chal') && $('#chal').checked);
      if (b.id === 'goCur') startRun(curGame, topLevel(curGame), false, chal);
      else if (b.id === 'goTm') startRun(curGame, 1, true);
      else if (b.dataset.l) { if (b.dataset.lock) { sfx('bad'); return; } startRun(curGame, +b.dataset.l, false, chal); }
    });
    on('#gift', 'click', function () {
      var g = Prog.claimGift(save, today(), Math.random);
      var days = '', st = g ? g.streak : save.gift.streak, d;
      for (d = 1; d <= 7; d++) days += '<div class="' + (d <= st ? 'on' : '') + '">Day ' + d + '<br>' + (d === 7 ? '🎁' : '+' + (20 * d)) + '</div>';
      var how = '<p class="sub" style="text-align:left">🎁 <b>Daily gift</b>: open the game once a day and tap <b>Claim</b> on the start page to get coins. Play on consecutive days to build a streak: the coins grow each day, and <b>day 7 also gives a sticker</b>. Miss a day and the streak starts again. Spend coins in the 🛍 Shop on power-ups, dice skins, board looks and avatars.</p>';
      if (!g) { sfx('tick'); modal('<h2>🎁 Daily gift</h2><div class="sub">Already claimed today. Come back tomorrow!</div><div class="sub">Streak: day ' + save.gift.streak + ' of 7. Tomorrow: +' + (20 * (save.gift.streak >= 7 ? 1 : save.gift.streak + 1)) + ' 🪙</div><div class="gdays">' + days + '</div>' + how + '<div class="btns"><button class="pri" id="mClose">OK</button></div>'); return; }
      persist(); renderHome(); sfx('win');
      modal('<h2>🎁 Daily gift!</h2><div class="big">+' + g.coins + ' 🪙</div><div class="sub">Day ' + g.streak + ' of 7. Come back tomorrow for more!</div><div class="gdays">' + days + '</div>' +
        (g.sticker != null ? '<div class="reveal"><div class="em">' + STICKERS[g.sticker] + '</div>New sticker!</div>' : '') + how + '<div class="btns"><button class="pri" id="mClose">Yay!</button></div>');
    });
    on('#navSet', 'click', function () { renderSettings(); show('settings'); });
    on('#stBack', 'click', function () { renderHome(); show('home'); });
    $('#stBody').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tog) {
        var k = b.dataset.tog;
        if (k === 'sound') save.sound = !save.sound; else save.set[k] = !save.set[k];
        persist(); applySettings(); renderSettings(); sfx('pop');
      } else if (b.dataset.set) {
        var v = b.dataset.val; save.set[b.dataset.set] = b.dataset.set === 'text' ? +v : v;
        persist(); applySettings(); renderSettings(); sfx('tick');
      } else if (b.id === 'exDl') {
        try {
          var blob = new Blob([JSON.stringify(save)], { type: 'application/json' }), u = URL.createObjectURL(blob), a = document.createElement('a');
          a.href = u; a.download = 'dice-arcade-backup-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(u); }, 2000); setMsg('Backup file saved to your Downloads.');
        } catch (x) { setMsg('Could not create a file. Use "Copy save code" instead.'); }
      } else if (b.id === 'exCp') {
        var code = saveCode(), ta = $('#imTxt');
        var done = function () { setMsg('Save code copied. Paste it somewhere safe.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { ta.value = code; ta.select(); setMsg('Copy the code from the box.'); });
        else { ta.value = code; ta.select(); setMsg('Copy the code from the box.'); }
      } else if (b.id === 'imGo') {
        var s = importData($('#imTxt').value);
        if (!s) { setMsg('That code does not look right. Nothing was changed.'); sfx('bad'); return; }
        modal('<h2>Restore this save?</h2><p class="sub">It has ' + fmt(s.coins) + ' coins and ' + Object.keys(s.stars).length + ' games of progress. Your current progress will be replaced.</p><div class="btns"><button id="mClose">Cancel</button><button class="pri" id="mImport">Restore</button></div>');
        window.__pendingImport = s;
      } else if (b.id === 'reset') askReset();
      else if (b.id === 'imFile') $('#imPick').click();
      else if (b.id === 'stTut') { save.seen = {}; persist(); setMsg('Tutorials will show again the first time you open each game.'); }
      else if (b.id === 'stDef') { save.set = {}; fixSet(save); persist(); applySettings(); renderSettings(); }
      else if (b.id === 'stUpd') {
        var um = $('#updMsg'); um.textContent = 'Checking…';
        var fin = function () { um.textContent = 'Loading the latest version…'; setTimeout(function () { location.reload(); }, 400); };
        if (location.protocol.indexOf('http') !== 0) { um.textContent = 'You are running a saved file. To update, open the new index.html file (or the web link) instead.'; return; }
        Promise.resolve(navigator.serviceWorker && navigator.serviceWorker.getRegistrations ? navigator.serviceWorker.getRegistrations() : []).then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })
          .then(function () { return window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : 0; }).then(fin, fin);
      }
    });
    $('#stBody').addEventListener('input', function (e) {
      if (e.target.id === 'setVol') { save.set.vol = +e.target.value; persist(); }
      else if (e.target.id === 'setName') { save.set.name = e.target.value.replace(/[<>"&]/g, '').slice(0, 14); persist(); }
    });
    $('#stBody').addEventListener('change', function (e) {
      if (e.target.id === 'setVol') sfx('pop');
      if (e.target.id === 'imPick' && e.target.files && e.target.files[0]) {
        var fr = new FileReader();
        fr.onload = function () { $('#imTxt').value = String(fr.result).slice(0, 2000000); var s = importData(fr.result); setMsg(s ? 'File read. Tap "Restore from code" to continue.' : 'That file does not look right.'); };
        fr.readAsText(e.target.files[0]);
      }
    });
    on('#navAlbum', 'click', function () { renderAlbum(); show('album'); });
    on('#navSound', 'click', function () { save.sound = !save.sound; persist(); renderHome(); sfx('pop'); });
    on('#alBack', 'click', function () { renderHome(); show('home'); });
    function pay(b, price) { if (save.coins < price) { sfx('bad'); b.textContent = 'Need ' + (price - save.coins) + ' more 🪙'; return false; } save.coins -= price; sfx('win'); return true; }
    $('#shop').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var d = b.dataset;
      if (d.skin != null) { var i = +d.skin; if (save.skins.indexOf(i) < 0) { if (!pay(b, SKINS[i].price)) return; save.skins.push(i); } save.skin = i; setSkin(i); }
      else if (d.board != null) { var j = +d.board; if (save.boards.indexOf(j) < 0) { if (!pay(b, BOARDS[j].price)) return; save.boards.push(j); } save.board = j; setBoard(j); }
      else if (d.avatar != null) { if (save.avatars.indexOf(d.avatar) < 0) { if (!pay(b, AVATAR_PRICE)) return; save.avatars.push(d.avatar); } save.avatar = d.avatar; }
      else if (d.title != null) { var t = +d.title; if (save.titles.indexOf(t) < 0) { if (!pay(b, TITLES[t].price)) return; save.titles.push(t); } save.title = t; }
      else if (d.pu) { var pu = POWERUPS.filter(function (p) { return p.id === d.pu; })[0]; if (!pay(b, pu.price)) return; save.inv[pu.id] = (save.inv[pu.id] || 0) + 1; }
      else return;
      persist(); var y = $('#album').scrollTop; renderAlbum(); $('#album').scrollTop = y;
    });
    on('#profile', 'click', function () { renderAlbum(); show('album'); });
    var askReset = function () { modal('<h2>Reset everything?</h2><p class="sub">All stars, coins and stickers will be deleted.</p><div class="btns"><button id="mClose">Cancel</button><button class="pri" id="mReset">Reset</button></div>'); };
    on('#pause', 'click', function () { doPause(); });
    $('#modal').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var id = b.id;
      if (id === 'mClose') closeModal();
      else if (id === 'mGo') { closeModal(); paused = false; last = performance.now(); }
      else if (id === 'mImport' && window.__pendingImport) { save = window.__pendingImport; window.__pendingImport = null; persist(); setSkin(save.skin || 0); setBoard(save.board || 0); applySettings(); closeModal(); renderHome(); show('home'); }
      else if (id === 'mReset') { save = Prog.newSave(); fixSet(save); persist(); setSkin(0); setBoard(0); applySettings(); closeModal(); renderHome(); show('home'); }
      else if (id === 'pResume') { closeModal(); paused = false; last = performance.now(); }
      else if (id === 'pRestart' || id === 'rRetry') startRun(run.G.id, run.level, run.timed);
      else if (id === 'pQuit' || id === 'rBack') { closeModal(); run = null; cancelAnimationFrame(raf); openGame(curGame); }
      else if (id === 'rNext') startRun(run.G.id, run.level + 1, false);
    });
  }
  function doPause() {
    if (!run || run.over) return;
    paused = true;
    modal('<h2>Paused</h2><div class="btns" style="flex-direction:column"><button class="pri" id="pResume">▶ Resume</button><button id="pRestart">↻ Restart</button><button id="pQuit">Quit to levels</button></div>');
  }

  /* ---------- settings ---------- */
  function applySettings() {
    var b = document.body, s = save.set;
    b.classList.remove('t-ocean', 't-candy', 't-forest');
    if (s.theme !== 'night') b.classList.add('t-' + s.theme);
    b.classList.toggle('reduce', !s.motion); b.classList.toggle('lefty', !!s.lefty); b.classList.toggle('bigbtn', !!s.big);
    $('#app').style.zoom = s.text === 1 ? '' : s.text;
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(b).getPropertyValue('--bg') || '#12162b';
  }
  function seg(key, opts) {
    return '<div class="seg">' + opts.map(function (o) { return '<button data-set="' + key + '" data-val="' + o[0] + '" class="' + (String(save.set[key]) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function tog(key, on) { return '<button class="tg ' + (on ? 'on' : '') + '" data-tog="' + key + '">' + (on ? 'On' : 'Off') + '</button>'; }
  function renderSettings() {
    var s = save.set, h = '';
    h += '<div class="set"><h3>👤 Player</h3><div class="srow"><div class="lbl">Name<small>Shown on the home screen. Stays on this device.</small></div></div><input type="text" id="setName" maxlength="14" placeholder="Your name" value="' + (s.name || '').replace(/"/g, '') + '"></div>';
    h += '<div class="set"><h3>🔊 Sound and feel</h3>' +
      '<div class="srow"><div class="lbl">Sound effects</div>' + tog('sound', save.sound) + '</div>' +
      '<div class="srow"><div class="lbl">Volume</div><input type="range" id="setVol" min="0" max="1" step="0.05" value="' + s.vol + '"></div>' +
      '<div class="srow"><div class="lbl">Vibration<small>Short buzz on wins and mistakes (Android)</small></div>' + tog('vibe', s.vibe) + '</div>' +
      '<div class="srow"><div class="lbl">Animations and sparkles<small>Turn off for calmer visuals</small></div>' + tog('motion', s.motion) + '</div></div>';
    h += '<div class="set"><h3>🎮 Controls</h3>' +
      '<div class="srow"><div class="lbl">Hint button 💡<small>Off hides the hint in games</small></div>' + tog('hints', s.hints) + '</div>' +
      '<div class="srow"><div class="lbl">Big buttons<small>Larger control buttons for small hands</small></div>' + tog('big', s.big) + '</div>' +
      '<div class="srow"><div class="lbl">Left-handed layout<small>Mirrors the button order</small></div>' + tog('lefty', s.lefty) + '</div></div>';
    h += '<div class="set"><h3>🎨 Look</h3>' +
      '<div class="srow"><div class="lbl">Theme</div>' + seg('theme', [['night', '🌙 Night'], ['ocean', '🌊 Ocean'], ['candy', '🍬 Candy'], ['forest', '🌲 Forest']]) + '</div>' +
      '<div class="srow"><div class="lbl">Text and menu size</div>' + seg('text', [[0.9, 'S'], [1, 'M'], [1.15, 'L'], [1.3, 'XL']]) + '</div>' +
      '<div class="note">Dice skins are in 🎨 Stickers &amp; Shop.</div></div>';
    h += '<div class="set"><h3>💾 Save data</h3><div class="note">Everything is stored only on this device. Back it up before clearing browser data or changing phone.</div>' +
      '<div class="btns"><button id="exDl">⬇ Download backup</button><button id="exCp">📋 Copy save code</button></div>' +
      '<div class="note" style="margin-top:12px">Restore: paste a save code or choose a backup file.</div>' +
      '<textarea id="imTxt" placeholder="Paste save code here"></textarea>' +
      '<div class="btns"><button id="imGo">⬆ Restore from code</button><button id="imFile">📂 Choose backup file</button></div><input type="file" id="imPick" accept=".json,.txt,application/json,text/plain" class="hidden">' +
      '<div class="note" id="stMsg"></div>' +
      '<div class="btns"><button id="stTut">Show game tutorials again</button><button id="stDef">Reset settings</button></div>' +
      '<div class="btns"><button class="ghost" id="reset">Reset all progress</button></div></div>';
    h += '<div class="set"><h3>ℹ About</h3><div class="srow"><div class="lbl">Version<small>Dice Arcade ' + VERSION + ' · built ' + BUILD + ' · 50 levels per game</small></div></div>' +
      '<div class="btns"><button id="stUpd">🔄 Check for update</button></div><div class="note" id="updMsg"></div></div>';
    $('#stBody').innerHTML = h;
  }
  function saveCode() { return 'DICE1:' + btoa(unescape(encodeURIComponent(JSON.stringify(save)))); }
  function importData(txt) {
    try {
      txt = String(txt || '').trim();
      if (txt.indexOf('DICE1:') === 0) txt = decodeURIComponent(escape(atob(txt.slice(6))));
      var s = JSON.parse(txt), d = Prog.newSave();
      if (!s || s.v !== 1 || typeof s.coins !== 'number' || typeof s.xp !== 'number' || typeof s.stars !== 'object') return false;
      for (var k in d) if (!(k in s)) s[k] = d[k];
      fixSet(s); return s;
    } catch (e) { return false; }
  }
  function setMsg(t) { var m = $('#stMsg'); if (m) m.textContent = t; }

  function init() {
    save = load(); setSkin(save.skin || 0); setBoard(save.board || 0); applySettings();
    wire(); renderHome(); show('home');
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(function () {});
    window.__app = { get save() { return save; }, get run() { return run; }, startRun: startRun, Prog: Prog, Games: Games };
  }
  init();
})();
