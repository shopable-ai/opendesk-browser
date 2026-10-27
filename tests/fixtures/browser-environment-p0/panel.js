const BASE = 'http://127.0.0.1:43128/browser-env-p0/';
const $ = id => document.getElementById(id);
let busy = false;
async function send(type, extra = {}) {
  const result = await chrome.runtime.sendMessage({type, ...extra});
  if (!result?.ok) throw new Error(result?.error || 'NO_WORKER_RESPONSE');
  return result;
}
async function persist(name, result, event) {
  const payload = {actionId: crypto.randomUUID(), at: new Date().toISOString(), trigger: {surface: 'CHROME_SIDE_PANEL', href: location.href, extensionId: chrome.runtime.id, isTrusted: event.isTrusted, button: event.currentTarget.id}, ...result};
  await navigator.locks.request('browser-environment-p0-evidence', async () => {
    const {p0PendingEvidence = {}} = await chrome.storage.session.get('p0PendingEvidence');
    p0PendingEvidence[payload.actionId] = {name, payload};
    await chrome.storage.session.set({p0PendingEvidence});
    await flushEvidenceUnlocked();
  });
}
async function writeEvidence({name, payload}) {
  // Chrome omits Origin on an extension's GET with host permission. POST
  // carries its immutable extension Origin, which the collector requires.
  const session = await fetch(BASE + 'evidence-session', {method: 'POST', cache: 'no-store'});
  if (!session.ok) throw new Error('EVIDENCE_SESSION_FAILED ' + session.status);
  const {token} = await session.json();
  const response = await fetch(BASE + 'evidence/' + name, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-P0-Evidence-Token': token}, body: JSON.stringify(payload)});
  if (!response.ok) throw new Error('EVIDENCE_WRITE_FAILED ' + response.status);
}
async function flushEvidence() {
  return navigator.locks.request('browser-environment-p0-evidence', flushEvidenceUnlocked);
}
async function flushEvidenceUnlocked() {
  const {p0PendingEvidence = {}} = await chrome.storage.session.get('p0PendingEvidence');
  for (const [id, pending] of Object.entries(p0PendingEvidence)) {
    await writeEvidence(pending); delete p0PendingEvidence[id];
    await chrome.storage.session.set({p0PendingEvidence});
  }
}
async function action(event, type, name, extra) {
  if (busy) return;
  busy = true; const button = event.currentTarget.id;
  // currentTarget becomes null after the event handler yields.
  const provenance = {isTrusted: event.isTrusted, currentTarget: {id: button}};
  $('status').textContent = '正在执行：' + button;
  let result;
  try {
    result = await send(type, extra);
    $('output').textContent = JSON.stringify(result, null, 2);
    $('status').textContent = result.state?.phase || '完成';
    if (name) await persist(name, result, provenance);
  } catch (error) {
    $('status').textContent = '错误：' + error.message;
    const state = await send('P0_STATUS').catch(() => null);
    $('output').textContent = JSON.stringify({...state, ok: false, error: String(error), ...(result ? {originalResult: result, pendingEvidence: true} : {})}, null, 2);
    if (!result) await persist('error', {ok: false, error: String(error), state: state?.state}, provenance).catch(console.error);
  } finally { busy = false; }
}
async function list() {
  await flushEvidence();
  const {tabs, state} = await send('P0_LIST');
  for (const [id, role] of [['target', 'target'], ['control', 'control']]) {
    $(id).replaceChildren(...tabs.map(tab => {
      const option = document.createElement('option'); option.value = tab.id;
      option.textContent = `${tab.id} / window ${tab.windowId} · ${tab.title || tab.url}`;
      option.selected = new URL(tab.url).searchParams.get('role') === role; return option;
    }));
  }
  $('status').textContent = state.phase;
}
$('list').addEventListener('click', () => list().catch(error => $('status').textContent = String(error)));
$('bind').addEventListener('click', event => action(event, 'P0_BIND', 'bind', {targetId: Number($('target').value), controlId: Number($('control').value)}));
$('observe').addEventListener('click', event => action(event, 'P0_OBSERVE', 'before'));
$('start').addEventListener('click', event => action(event, 'P0_START', 'after'));
$('stop').addEventListener('click', event => action(event, 'P0_STOP', 'stop'));
$('close').addEventListener('click', event => action(event, 'P0_CLOSE_TARGET', 'safe-close'));
list().catch(error => $('status').textContent = String(error));
