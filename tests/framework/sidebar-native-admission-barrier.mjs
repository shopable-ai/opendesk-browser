// A diagnostic CDP breakpoint, not an alternate runner or native input source.
// Run is clicked in Chrome; SIGUSR1 resumes after a real UI target change.
import fs from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve(process.env.SIDEBAR_EVIDENCE_DIR || 'docs/framework/evidence/sidebar-native-20261008-01a119ff');
const session = JSON.parse(await fs.readFile(path.join(dir, 'session.json')));
const label = process.argv[2] || 'S4-admission-barrier';
if (!/^[A-Za-z0-9_-]+$/.test(label)) throw Error('Invalid evidence label');
const source = await fs.readFile(path.join(session.extensionPath, 'sw.js'), 'utf8');
const markers = [...source.matchAll(/await \w+\(\{api:\w+,target:\w+,expectedUrl:\w+\.target\.expectedUrl,expectedWindowId:\w+\.target\.expectedWindowId\}\)/g)];
if (markers.length !== 1) throw Error('Candidate breakpoint marker changed; inspect the current build');
const marker = markers[0][0];
const offset = source.indexOf(marker), before = source.slice(0, offset);
const lineNumber = before.split('\n').length - 1, columnNumber = before.length - before.lastIndexOf('\n') - 1;
const socket = new WebSocket(session.endpoint), pending = new Map(); let seq = 0, swSession, breakpointId;
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
function send(method, params = {}, sessionId = swSession) {
  return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, {resolve, reject}); socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})); });
}
socket.onmessage = async ({data}) => {
  const message = JSON.parse(data), entry = pending.get(message.id);
  if (entry) { pending.delete(message.id); message.error ? entry.reject(Error(JSON.stringify(message.error))) : entry.resolve(message.result); return; }
  if (message.method === 'Debugger.paused') {
    await fs.writeFile(path.join(dir, `${label}-paused.json`), JSON.stringify({at: Date.now(), pid: process.pid, marker, requested: {lineNumber, columnNumber}, event: message}, null, 2));
    console.log('PAUSED after pin, before native revalidation; change tab through Chrome UI, then SIGUSR1');
  }
};
const targets = (await send('Target.getTargets', {}, null)).targetInfos;
const sw = targets.find(t => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
if (!sw) throw Error('Wake extension first');
swSession = (await send('Target.attachToTarget', {targetId: sw.targetId, flatten: true}, null)).sessionId;
await send('Debugger.enable');
({breakpointId} = await send('Debugger.setBreakpointByUrl', {url: sw.url, lineNumber, columnNumber}));
console.log(JSON.stringify({pid: process.pid, breakpointId, marker, lineNumber, columnNumber}));
process.on('SIGUSR1', async () => {
  await send('Debugger.removeBreakpoint', {breakpointId}); await send('Debugger.resume');
  await fs.writeFile(path.join(dir, `${label}-resumed.json`), JSON.stringify({at: Date.now(), pid: process.pid}));
  await send('Debugger.disable'); socket.close(); process.exit(0);
});
process.on('SIGTERM', async () => { try { await send('Debugger.disable'); } finally { socket.close(); process.exit(0); } });
