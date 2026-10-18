// Diagnostic only: can this machine launch Chromium and get a working WebGL context? Hard deadline, timestamps.
const { chromium } = require('playwright');
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's', ...a);
setTimeout(() => { log('DEADLINE: probe did not finish'); process.exit(2); }, 100000);
(async () => {
  const args = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ args, executablePath: process.env.CHROME_PATH || undefined, timeout: 60000 });
  log('launched', browser.version());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent('<canvas id=c width=1280 height=720></canvas>');
  log('blank page ok');
  const info = await page.evaluate(() => {
    const out = {};
    for (const kind of ['webgl', 'webgl2']) {
      const gl = document.getElementById('c').getContext(kind) || document.createElement('canvas').getContext(kind);
      if (!gl) { out[kind] = 'NO CONTEXT'; continue; }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      out[kind] = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'context ok (no renderer info)';
    }
    return out;
  });
  log('contexts', JSON.stringify(info));
  const ms = await page.evaluate(() => {
    const gl = document.getElementById('c').getContext('webgl2') || document.getElementById('c').getContext('webgl');
    const t = performance.now();
    for (let i = 0; i < 60; i++) { gl.clearColor(i / 60, 0.2, 0.4, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.finish(); }
    return Math.round(performance.now() - t);
  });
  log('60 full-frame clears + finish took', ms, 'ms');
  await browser.close();
  log('closed cleanly');
  process.exit(0);
})().catch(e => { log('FATAL', e.message.slice(0, 300)); process.exit(1); });
