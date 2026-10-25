// Builds the standalone index.html from src/. Run: node build.mjs
import fs from 'node:fs';
const r = f => fs.readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
const order = ['prog.js', 'common.js', 'games/drop.js', 'games/fit.js', 'games/garden.js', 'games/match.js',
  'games/shot.js', 'games/rush.js', 'games/tower.js', 'games/duel.js', 'app.js'];
let js = order.map(f => '/* ---- ' + f + ' ---- */\n' + r(f)).join('\n');
if (js.includes('</script')) throw new Error('script terminator in JS');
const BUILD = new Date().toISOString().slice(0, 10);
let html = r('template.html').replace('/*CSS*/', () => r('style.css')).replace('/*JS*/', () => js.replace('__BUILD__', BUILD));
fs.writeFileSync(new URL('./index.html', import.meta.url), html);
console.log('index.html', (html.length / 1024).toFixed(1) + ' KB');
