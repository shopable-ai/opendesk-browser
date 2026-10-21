// CDP transport and native input only. Runtime.evaluate callers supply observations.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';

export {sleep};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function until(run, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    try { const result = await run(); if (result) return result; }
    catch (error) { last = error; }
    await sleep(200);
  } while (Date.now() < deadline);
  throw new Error(`${label} timed out${last ? ': ' + last.message : ''}`);
}

export function connect(url, onEvent = () => {}) {
  const socket = new WebSocket(url), pending = new Map();
  let serial = 0;
  const ready = new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('CDP WebSocket connection failed'));
  });
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data);
    if (!message.id) { onEvent(message); return; }
    const request = pending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  socket.onclose = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer); request.reject(new Error('CDP disconnected'));
    }
    pending.clear();
  };
  return {
    ready,
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => {
          pending.delete(id); reject(new Error('CDP timeout: ' + method));
        }, 15000);
        pending.set(id, {resolve, reject, timer});
        try { socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})); }
        catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
      });
    },
    close() { socket.close(); }
  };
}

export async function connectLaunch(launchFile, onEvent) {
  const launch = JSON.parse(await readFile(launchFile, 'utf8'));
  assert.ok(launch.profile?.startsWith('/'), 'launch.profile must be absolute');
  const [portText, browserPath] = (await readFile(launch.profile + '/DevToolsActivePort', 'utf8')).trim().split('\n');
  const port = Number(portText);
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'Invalid DevToolsActivePort');
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(5000)})).json();
  const ws = new URL(version.webSocketDebuggerUrl);
  assert.equal(ws.pathname, browserPath, 'DevToolsActivePort browser identity must match /json/version');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(ws.hostname), 'CDP must be loopback');
  ws.hostname = '127.0.0.1'; ws.port = String(port);
  const client = connect(ws.href, onEvent);
  await client.ready;
  return {client, launch, version};
}

export async function read(c, session, expression) {
  const result = await c.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, session);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

// Resolve normal DOM or open shadow roots; no focus, scroll, value or state writes.
export function queryExpression(selector) {
  return `(()=>{const q=(root)=>{const hit=root.querySelector(${JSON.stringify(selector)});if(hit)return hit;
    for(const n of root.querySelectorAll('*'))if(n.shadowRoot){const found=q(n.shadowRoot);if(found)return found;}return null;};return q(document);})()`;
}
export async function visible(c, session, selector) {
  return read(c, session, `(()=>{const n=${queryExpression(selector)};if(!n||n.disabled||!n.getClientRects().length)return false;
    const r=n.getBoundingClientRect();return r.width>0&&r.height>0;})()`);
}

export async function click(c, session, selector, parentSession) {
  const point = await until(async () => {
    const p = await read(c, session, `(()=>{const n=${queryExpression(selector)};
      if(!n||n.disabled||!n.getClientRects().length)return null;
      const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      const hit=n.getRootNode().elementFromPoint?.(x,y)||document.elementFromPoint(x,y);
      return {x,y,width:innerWidth,height:innerHeight,hit:x>0&&x<innerWidth&&y>0&&y<innerHeight&&(n===hit||n.contains(hit))};})()`);
    if (!p) return false;
    const frame = parentSession ? await read(c, parentSession, `(()=>{const n=document.querySelector('#sidebar-tool-frame iframe');if(!n)return null;
      const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:innerWidth,height:innerHeight};})()`) : {x: 0, y: 0, width: p.width, height: p.height};
    if (!frame) return false;
    const x = p.x + frame.x, y = p.y + frame.y;
    const parentHit = !parentSession || await read(c, parentSession,
      `document.elementFromPoint(${x},${y})===document.querySelector('#sidebar-tool-frame iframe')`);
    if (p.hit && parentHit && x > 0 && x < frame.width && y > 0 && y < frame.height) return {x, y};
    const scrollParent = parentSession && (p.hit || y <= 85 || y >= frame.height);
    const target = scrollParent ? parentSession : (parentSession || session);
    await c.send('Input.dispatchMouseEvent', {type: 'mouseWheel',
      x: scrollParent ? 8 : Math.max(8, Math.min(frame.width - 8, frame.x + Math.max(8, Math.min(p.width - 8, p.x)))),
      y: Math.max(8, Math.min(frame.height - 8, scrollParent ? frame.height / 2 : frame.y + p.height / 2)),
      deltaX: 0, deltaY: (p.y < 85 || y < 85) ? -240 : 240}, target);
    await sleep(200);
    return false;
  }, 'Real visible pointer target ' + selector);
  const target = parentSession || session;
  await c.send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...point}, target);
  for (const type of ['mousePressed', 'mouseReleased'])
    await c.send('Input.dispatchMouseEvent', {type, ...point, button: 'left', clickCount: 1}, target);
}

export async function nativeText(c, session, selector, value, parentSession) {
  await click(c, session, selector, parentSession);
  const target = parentSession || session;
  const modifier = process.platform === 'darwin' ? 4 : 2;
  await c.send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: modifier,commands:['selectAll']}, target);
  await c.send('Input.dispatchKeyEvent', {type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: modifier}, target);
  await c.send('Input.insertText', {text: value}, target);
  await until(() => read(c, session, `(${queryExpression(selector)})?.value===${JSON.stringify(value)}`), 'Native input readback');
}

export async function nativeSelectToolPackage(c, session, filename) {
  await c.send('DOM.enable', {}, session);
  const {root} = await c.send('DOM.getDocument', {depth: 1}, session);
  const {nodeId} = await c.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#sidebar-tool-file'}, session);
  assert.ok(nodeId > 0, 'Real import input #sidebar-tool-file required');
  await c.send('DOM.setFileInputFiles', {files: [filename], nodeId}, session);
}

export async function attach(c, targetId) {
  const {sessionId} = await c.send('Target.attachToTarget', {targetId, flatten: true});
  await c.send('Runtime.enable', {}, sessionId);
  await c.send('Page.enable', {}, sessionId);
  return sessionId;
}

export async function openFixture(c, side, appId) {
  const discard=async()=>await visible(c,side,'#sidebar-tool-action-continue')&&await read(c,side,'document.querySelector("#sidebar-tool-action-continue")?.textContent.includes("放弃未保存内容")');
  if(await discard())await click(c,side,'#sidebar-tool-action-continue');
  await click(c, side, '#tab-tools');
  for(let n=0;n<2&&await visible(c,side,'#sidebar-tool-back');n++){
    await click(c,side,'#sidebar-tool-back');
    if(await discard())await click(c,side,'#sidebar-tool-action-continue');
  }
  if(await discard())await click(c,side,'#sidebar-tool-action-continue');
  await click(c, side, `[data-extension-key="app:${appId}"][data-extension-action="main"]`);
  const frameId = await until(async () => {
    const {root} = await c.send('DOM.getDocument', {depth: 1}, side);
    const {nodeId} = await c.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#sidebar-tool-frame iframe'}, side);
    if (!nodeId) return false;
    return (await c.send('DOM.describeNode', {nodeId}, side)).node.frameId;
  }, 'Current installed app iframe identity');
  const frame = await until(async () => {
    const targets = (await c.send('Target.getTargets')).targetInfos;
    for (const target of targets.filter(t => t.type === 'iframe' && t.url.includes('/sidebar-tools/sandbox.html'))) {
      const session = await attach(c, target.targetId);
      const {frameTree} = await c.send('Page.getFrameTree', {}, session);
      if (frameTree.frame.id === frameId) return {session, targetId: target.targetId, frameId};
      await c.send('Target.detachFromTarget', {sessionId: session});
    }
    return false;
  }, 'Sandbox matching current app DOM frame');
  await until(() => visible(c, frame.session, '#storage-get'), 'App UI ready');
  return frame;
}

export async function screenshot(c, session, file) {
  const {data} = await c.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, session);
  const bytes = Buffer.from(data, 'base64'); await writeFile(file, bytes);
  return {file, bytes: bytes.length, sha256: sha256(bytes)};
}
