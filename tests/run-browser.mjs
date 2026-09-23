// Runs the browser suites end to end: starts a dev server and a headless
// Chromium, drives each suite against it, and tears everything down.
//
//   npm run test:browser
//
// Each suite gets a fresh profile of its own. They must not share one: the app
// saves to localStorage, so leftover board state from the first run makes the
// second fail on a value it never set — which reads like an app bug and is not.
//
// Set CHROME_BIN to point at a specific browser, APP_PORT to move the server.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const APP_PORT = Number(process.env.APP_PORT || 5199);
const CDP_PORT = Number(process.env.CDP_PORT || 9333);
const APP_URL = `http://localhost:${APP_PORT}/`;
const SUITES = ['browser.mjs', 'browser-testmode.mjs'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  return null;
}

async function waitFor(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`${label} did not come up at ${url} within ${timeoutMs}ms`);
}

async function runSuite(file, chrome) {
  const profile = mkdtempSync(join(tmpdir(), 'soroban-cdp-'));
  const browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let child;
  try {
    await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`, 20000, 'chrome');
    child = spawn(process.execPath, [join(here, file), `http://127.0.0.1:${CDP_PORT}`, APP_URL], { stdio: 'inherit' });
    return await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
  } finally {
    child?.kill('SIGKILL');
    browser.kill('SIGKILL');
    await sleep(400); // let the port go before the next suite takes it
    rmSync(profile, { recursive: true, force: true });
  }
}

const chrome = findChrome();
if (!chrome) {
  console.error('No Chromium found. Install Chrome, or set CHROME_BIN to its path.');
  process.exit(1);
}

const vite = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(APP_PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
let failed = 0;
try {
  await waitFor(APP_URL, 30000, 'dev server');
  for (const suite of SUITES) {
    console.log(`\n=== ${suite} ===`);
    const code = await runSuite(suite, chrome);
    if (code !== 0) { failed++; console.error(`${suite} FAILED (exit ${code})`); }
    else console.log(`${suite} passed`);
  }
} catch (err) {
  console.error(String(err?.message || err));
  failed++;
} finally {
  vite.kill('SIGKILL');
}
console.log(failed ? `\n${failed} suite(s) failed.` : '\nAll browser suites passed.');
process.exit(failed ? 1 : 0);
