// Diagnostic only: load ONE page and narrate everything with timestamps. A hard deadline guarantees it can never hang silently.
// usage: node diag_smoke.js BASE_URL PAGE [DEADLINE_SECONDS] [CHROMIUM_ARGS_CSV]
const { chromium } = require('playwright');
const [base, pagePath, deadlineS = '150', argsCsv = ''] = process.argv.slice(2);
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
const args = argsCsv ? argsCsv.split(',') : ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let state = 'start', consoleLines = 0;
setTimeout(() => { log('DEADLINE reached while in state:', state); process.exit(2); }, Number(deadlineS) * 1000);
(async () => {
  log('launch args:', args.join(' '));
  state = 'launching';
  const browser = await chromium.launch({ args, executablePath: process.env.CHROME_PATH || undefined, timeout: 60000 });
  log('launched, browser', browser.version());
  state = 'newPage';
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  page.on('console', m => { if (consoleLines++ < 60) log('console.' + m.type(), m.text().replace(/\s+/g, ' ').slice(0, 220)); });
  page.on('pageerror', e => log('PAGEERROR', e.message.slice(0, 300)));
  page.on('requestfailed', r => log('REQFAILED', r.url().slice(-90), (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400) log('HTTP', r.status(), r.url().slice(-90)); });
  page.on('crash', () => log('PAGE CRASHED'));
  state = 'goto';
  await page.goto(base + '/' + pagePath, { waitUntil: 'domcontentloaded', timeout: 60000 });
  log('domcontentloaded');
  state = 'waiting for body.dataset.loaded';
  const hb = setInterval(async () => {
    const r = await Promise.race([
      page.evaluate(() => 'loaded=' + (document.body.dataset.loaded || '0') + ' page-time=' + Math.round(performance.now()) + 'ms'),
      new Promise(res => setTimeout(() => res('MAIN THREAD UNRESPONSIVE (no reply in 3 s)'), 3000))]).catch(e => 'evaluate error: ' + e.message.slice(0, 80));
    log('heartbeat', r);
  }, 5000);
  try { await page.waitForFunction(() => document.body.dataset.loaded === '1', null, { timeout: 100000 }); log('LOADED OK'); }
  catch (e) { log('NOT LOADED within 100 s:', e.message.slice(0, 100)); }
  clearInterval(hb);
  state = 'closing';
  await browser.close();
  log('browser closed cleanly');
  process.exit(0);
})().catch(e => { log('FATAL in state', state + ':', e.message.slice(0, 300)); process.exit(1); });
