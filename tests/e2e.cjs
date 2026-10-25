// Browser test: loads the built index.html offline, checks for errors, plays every game through the real UI loop,
// and checks that rewards, unlocks and saving work end to end. Usage: node tests/e2e.cjs [outDir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const URL = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, '../.shots');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = process.argv[3];
const VIEWS0 = [
  { name: 'phone-s8', w: 360, h: 740, dpr: 3, touch: true },
  { name: 'phone-s23', w: 412, h: 915, dpr: 2.6, touch: true },
  { name: 'tablet-land', w: 1280, h: 800, dpr: 1.5, touch: true },
  { name: 'tablet-port', w: 800, h: 1280, dpr: 1.5, touch: true }
];
const VIEWS = VIEWS0.filter(v => !ONLY || v.name === ONLY);
const GAMES = ['drop', 'fit', 'garden', 'match', 'shot', 'rush', 'tower', 'duel'];
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL: ' + m); } };

(async () => {
  const browser = await chromium.launch();
  for (const v of VIEWS) {
    console.log('\n== ' + v.name + ' ' + v.w + 'x' + v.h);
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: v.touch, isMobile: v.w < 800 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push('network request: ' + r.url()); });
    await page.goto(URL);
    await page.waitForSelector('.gcard');
    ok((await page.$$('.gcard')).length === 8, 'home shows 8 game cards');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    ok(!overflow, 'no horizontal overflow on home');
    await page.screenshot({ path: path.join(OUT, v.name + '-home.png') });

    for (const id of GAMES) {
      // open through the real UI
      await page.click('[data-g="' + id + '"]');
      await page.waitForSelector('#goCur');
      if (id === 'drop' || id === 'duel') await page.screenshot({ path: path.join(OUT, v.name + '-levels-' + id + '.png') });
      await page.click('#goCur');
      await page.waitForSelector('#cv');
      if (await page.$('#intro')) await page.click('#inGo');   // skip the goal intro
      await page.waitForTimeout(400);
      // layout sanity: canvas fills the stage and nothing overflows
      const geo = await page.evaluate(() => {
        const st = document.querySelector('#stage').getBoundingClientRect(), cv = document.querySelector('#cv').getBoundingClientRect(), c = document.querySelector('#ctl').getBoundingClientRect();
        return { sh: st.height, sw: st.width, cw: cv.width, ch: cv.height, ctlBottom: c.bottom, ih: innerHeight, sx: document.documentElement.scrollWidth, iw: innerWidth };
      });
      ok(geo.sh > 250 && Math.abs(geo.cw - geo.sw) < 2 && geo.ctlBottom <= geo.ih + 1 && geo.sx <= geo.iw + 1, id + ' layout ' + JSON.stringify(geo));
      // real pointer interaction for a moment, then let the bot finish the level through the real loop
      await realInput(page, id, v);
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(OUT, v.name + '-play-' + id + '.png') });
      await page.evaluate(() => {
        window.__bot = setInterval(() => { const r = window.__app.run; if (r && !r.over && r.game.bot) { r.skill = { eps: 0, tempo: 0.05, noise: 1, think: 0.2 }; for (let i = 0; i < 4; i++) r.game.bot(1 / 30); } }, 33);
      });
      await page.waitForFunction(() => { const r = window.__app.run; return !r || r.over || r.score >= r.thr[0]; }, null, { timeout: 100000, polling: 500 });
      await page.evaluate(() => { const r = window.__app.run; if (r && r.timeLeft != null && !r.over) r.timeLeft = Math.min(r.timeLeft, 2); });   // 2-minute levels: once the goal is met, let the clock run out
      await page.waitForSelector('#rs', { timeout: 120000 });
      await page.evaluate(() => clearInterval(window.__bot));
      await page.waitForTimeout(1300);   // stars animate in
      const res = await page.evaluate(() => ({ coins: window.__app.save.coins, stars: window.__app.save.stars, txt: document.querySelector('.dlg').innerText }));
      ok(/\+\d+ 🪙/.test(res.txt) && /XP/.test(res.txt), id + ' result screen shows rewards: ' + res.txt.slice(0, 60).replace(/\n/g, ' '));
      if (id === 'drop' || id === 'rush') await page.screenshot({ path: path.join(OUT, v.name + '-result-' + id + '.png') });
      await page.click('#rBack'); await page.waitForSelector('#goCur');
      await page.click('#lvBack'); await page.waitForSelector('.gcard');
    }
    // progress saved and next level unlocked on every game
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('diceArcade.v1')));
    for (const id of GAMES) ok((st.stars[id] || {})[1] >= 1, id + ' level 1 star saved');
    ok(st.coins > 0 && st.xp > 0, 'coins and XP saved (' + st.coins + ' coins, ' + st.xp + ' xp)');
    await page.reload(); await page.waitForSelector('.gcard');
    const after = await page.evaluate(() => ({ coins: document.querySelector('#coins').textContent, cards: [...document.querySelectorAll('.st')].map(e => e.textContent) }));
    ok(after.cards.every(t => /Level 2/i.test(t)), 'after reload every game offers level 2: ' + after.cards.join(' | '));
    // daily gift, album, shop
    await page.click('#gift', { force: true }); await page.waitForSelector('.gdays'); await page.click('#mClose');
    await page.click('#navAlbum'); await page.waitForSelector('.skin');
    await page.screenshot({ path: path.join(OUT, v.name + '-album.png') });
    await page.click('#alBack');
    ok(errors.length === 0, 'no console/page errors or network requests: ' + errors.slice(0, 3).join(' ; '));
    if (errors.length) console.log(errors.slice(0, 5));
    console.log('  done');
    await ctx.close();
  }
  await browser.close();
  console.log('\n' + (fails ? fails + ' FAILED' : 'ALL BROWSER CHECKS PASSED'));
  process.exit(fails ? 1 : 0);
})();

async function realInput(page, id, v) {
  const box = await page.$eval('#cv', e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const m = page.mouse, cx = box.x + box.w / 2;
  if (id === 'garden') { await m.move(cx, box.y + box.h * 0.5); await m.down(); await m.move(cx + 40, box.y + box.h * 0.5, { steps: 4 }); await m.up(); }
  else if (id === 'rush') { await m.click(box.x + box.w * 0.3, box.y + box.h * 0.93); }
  else if (id === 'tower') { await m.click(cx, box.y + box.h * 0.5); }
  else if (id === 'shot') { await m.move(cx, box.y + box.h * 0.9); await m.down(); await m.move(cx + 60, box.y + box.h * 0.3, { steps: 5 }); await m.up(); }
  else if (id === 'drop') { await m.move(cx, box.y + box.h * 0.4); await m.down(); await m.move(cx + 80, box.y + box.h * 0.4, { steps: 5 }); await m.up(); await m.click(cx, box.y + box.h * 0.4); }
  else if (id === 'fit') { const s = await page.evaluate(() => { const g = window.__app.run.game, sl = g.slots[0], r = document.querySelector('#cv').getBoundingClientRect(); return { x: r.left + sl.x + sl.w / 2, y: r.top + sl.y + sl.h / 2, bx: r.left + g.ox + g.cell * 3.5, by: r.top + g.oy + g.cell * 4.5 }; }); await m.move(s.x, s.y); await m.down(); await m.move(s.bx, s.by, { steps: 8 }); await m.up(); }
  else if (id === 'match') { const s = await page.evaluate(() => { const g = window.__app.run.game, mv = g.bestSwap(), r = document.querySelector('#cv').getBoundingClientRect(); return { ax: r.left + g.ox + (mv.a[1] + 0.5) * g.cell, ay: r.top + g.oy + (mv.a[0] + 0.5) * g.cell, bx: r.left + g.ox + (mv.b[1] + 0.5) * g.cell, by: r.top + g.oy + (mv.b[0] + 0.5) * g.cell }; }); await m.move(s.ax, s.ay); await m.down(); await m.move(s.bx, s.by, { steps: 5 }); await m.up(); }
  else if (id === 'duel') { const s = await page.evaluate(() => { const g = window.__app.run.game, r = document.querySelector('#cv').getBoundingClientRect(); return { x: r.left + g.ox + g.cell * 2.5, y: r.top + g.oy + g.cell * 2.5, mine: g.turn === 1 }; }); if (s.mine) await m.click(s.x, s.y); }
  const score = await page.evaluate(() => window.__app.run.score);
  console.log('  ' + id + ': real input ok (score ' + score + ')');
}
