/**
 * QA screenshot harness.
 *   node scripts/shoot.mjs [--scenario name[,name…]] [--out dir] [--t 0.5] [--zoom 3]
 *                          [--ui 0|1] [--wait ms] [--size 1600x900] [--lm landmark] [--url extra]
 *                          [--dist dir]  (serve a custom build dir: npx vite build --outDir <dir>)
 *                          [--tag suffix] (appended to the png name)
 * Builds nothing: run `npm run build` first. Serves dist/ with vite preview,
 * opens headless Chromium (SwiftShader WebGL), waits for window.__ready,
 * lets effects play for --wait ms, then saves PNGs to shots/.
 * Also prints console errors from the page (important for QA).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? '1' : arr[i + 1]]);
    return acc;
  }, []),
);
const scenarios = (args.scenario ?? 'title').split(',');
const out = args.out ?? 'shots';
const [W, H] = (args.size ?? '1600x900').split('x').map(Number);
const wait = Number(args.wait ?? 2500);
const port = 4173 + Math.floor(Math.random() * 500);
mkdirSync(out, { recursive: true });

const previewArgs = ['preview', '--port', String(port), '--strictPort'];
if (args.dist) previewArgs.push('--outDir', args.dist);
// Run the vite binary directly (not via npx) so kill() really stops the server.
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...previewArgs], { stdio: 'pipe' });
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('preview timeout')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(port))) {
      clearTimeout(to);
      res();
    }
  });
});

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let failed = false;
try {
  for (const scen of scenarios) {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    const q = new URLSearchParams();
    if (scen !== 'title') q.set('scenario', scen);
    for (const k of ['t', 'zoom', 'ui', 'speed', 'lm']) if (args[k] != null) q.set(k, args[k]);
    const url = `http://localhost:${port}/?${q.toString()}${args.url ? '&' + args.url : ''}`;
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => {
      errors.push('[harness] window.__ready never became true');
      failed = true;
    });
    const bootMs = Date.now() - t0;
    await page.waitForTimeout(wait);
    const fps = await page.evaluate(() => window.__game?.scene?.game?.loop?.actualFps ?? null).catch(() => null);
    const file = `${out}/${scen}${args.tag ? '-' + args.tag : ''}.png`;
    await page.screenshot({ path: file });
    console.log(`📸 ${file}  boot=${bootMs}ms fps≈${fps ? fps.toFixed(1) : '?'}`);
    for (const e of errors.slice(0, 30)) console.log('   ' + e);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
process.exit(failed ? 1 : 0);
