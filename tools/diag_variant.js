// Diagnostic only (throwaway): load ONE page with one browser configuration and print a single "RESULT {json}" line.
// usage: node diag_variant.js BASE_URL PAGE DEADLINE_SECONDS CONFIG_JSON
//   CONFIG_JSON: {"channel":"chrome"|"chromium"|undefined, "args":[...], "headless":true}
// A plain setTimeout enforces the deadline, so a wedged page can never hang this process.
const { chromium } = require('playwright');
const [base, pagePath, deadlineS = '80', cfgJson = '{}'] = process.argv.slice(2);
const cfg = JSON.parse(cfgJson);
const t0 = Date.now();
const sec = () => +((Date.now() - t0) / 1000).toFixed(1);
const res = { page: pagePath, status: 'start', dcl: null, loaded: null, firstUnresp: null, unresp: 0, beats: 0, crash: null, disc: null, errs: [], gl: '', ver: '' };
let state = 'launching', finished = false;
const finish = (status) => {
  if (finished) return; finished = true;
  res.status = status; res.total = sec(); res.state = state;
  console.log('RESULT ' + JSON.stringify(res));
  process.exit(status === 'LOADED' ? 0 : 2);
};
setTimeout(() => finish('DEADLINE'), Number(deadlineS) * 1000);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ channel: cfg.channel, headless: cfg.headless !== false, args: cfg.args || [], executablePath: process.env.CHROME_PATH || undefined, timeout: 60000 });
  res.ver = browser.version();
  browser.on('disconnected', () => { res.disc = sec(); finish('BROWSER-DIED'); });
  state = 'newPage';
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  page.on('crash', () => { res.crash = sec(); finish('PAGE-CRASH'); });
  page.on('pageerror', e => res.errs.push('pageerror: ' + e.message.slice(0, 120)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) res.errs.push('console: ' + m.text().replace(/\s+/g, ' ').slice(0, 120)); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) res.errs.push(r.status() + ' ' + r.url().slice(-60)); });
  state = 'goto';
  await page.goto(base + '/' + pagePath, { waitUntil: 'domcontentloaded', timeout: 60000 });
  res.dcl = sec();
  state = 'waiting for body.dataset.loaded';
  for (;;) {
    res.beats++;
    const r = await Promise.race([
      page.evaluate(() => (document.body && document.body.dataset.loaded) || '0').catch(e => 'ERR'),
      sleep(2000).then(() => 'UNRESP')]);
    if (r === 'UNRESP') { res.unresp++; if (res.firstUnresp === null) res.firstUnresp = sec(); }
    if (r === '1') {
      res.loaded = sec();
      res.gl = await Promise.race([page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl'); if (!g) return 'no-gl'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL).slice(0, 90) : 'gl-no-info'; }).catch(() => 'gl-err'), sleep(8000).then(() => 'gl-unresp')]);
      finish('LOADED');
    }
    await sleep(500);
  }
})().catch(e => { res.errs.push('FATAL ' + e.message.slice(0, 160)); finish('FATAL'); });
