// Run against a browser started by agent-browser: node tests/browser.mjs <CDP HTTP endpoint> [app URL]
import assert from 'node:assert/strict';
const endpoint = process.argv[2] || 'http://127.0.0.1:9222';
const pages = await (await fetch(endpoint + '/json/list')).json();
const page = pages.find(p => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
  if (msg.id) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(msg.error) : p.resolve(msg.result); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await send('Runtime.enable');
  if (process.argv[3]) { await send('Page.navigate', { url: process.argv[3] }); await pause(1000); }
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('document.querySelector("#reset").click()');
  await evaluate('document.querySelector("#decimal").value="3"; document.querySelector("#decimal").dispatchEvent(new Event("change"))');
  const rect = await evaluate('(()=>{const r=document.querySelector("#board").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
  const point = (col, y, id) => ({ x: rect.x + (20 + (col + .5) * 560 / 6) / 600 * rect.width, y: rect.y + y / 390 * rect.height, id, radiusX: 5, radiusY: 5, force: 1 });
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(3, 354, 1), point(2, 28, 2)] });
  for (let i = 1; i <= 10; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(3, 354 - 78 * i / 10, 1), point(2, 28 + 72 * i / 10, 2)] }); await pause(16); }
  await pause(120);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pause(200);
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '54.00', 'simultaneous touch drags and neighbor pushing');
  await evaluate('document.querySelector("#reset").click();document.querySelector("#undo").click()');
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '54.00', 'undo reset');
  await evaluate('document.querySelector("#decimal").value="4";document.querySelector("#decimal").dispatchEvent(new Event("change"))');
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '540.0', 'decimal relocation');
  await send('Page.reload'); await pause(700);
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '540.0', 'persistence');
  await evaluate('document.querySelector("#motion").click()');
  for (let i = 0; i < 3; i++) {
    await evaluate('window.dispatchEvent(new DeviceMotionEvent("devicemotion",{acceleration:{x:0,y:0,z:0}}))');
    await pause(220);
    await evaluate('window.dispatchEvent(new DeviceMotionEvent("devicemotion",{acceleration:{x:22,y:0,z:0}}))');
  }
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '0.0', 'three shakes clear board');
  await evaluate('document.querySelector("#undo").click()');
  assert.equal(await evaluate('document.querySelector("#value").textContent'), '540.0', 'undo shake');
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'landscape has no horizontal overflow');
  assert.equal(await evaluate('document.querySelector(".toolbar").getBoundingClientRect().bottom <= innerHeight'), true, 'landscape controls visible');
  assert.deepEqual(errors, [], 'no browser exceptions');
  console.log('PASS: simultaneous touch, bead pushing, values, decimal placement, reset/undo, persistence, three-shake reset, landscape layout, no runtime errors.');
} finally { ws.close(); }
