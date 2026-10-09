// Existing browser-action acceptance API; no evaluated sidePanel.open or synthetic UI event.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {connect, evaluate} from '../../../../../tests/framework/sidebar-native-session.mjs';
const directory = process.env.TOOL_EVIDENCE_DIR;
const label = process.argv[2];
assert(directory?.includes('sidebar-tools-r1-mac-01a11fa4/') && /^[a-z0-9-]+$/.test(label));
const session = JSON.parse(await readFile(directory + '/session.json', 'utf8'));
const client = await connect(session.endpoint);
try {
  const tabs = (await client.send('Target.getTargets', {filter: [{type: 'tab', exclude: false}, {exclude: true}]})).targetInfos
    .filter(t => t.url.startsWith('http://127.0.0.1:43111/demo-form.html'));
  assert.equal(tabs.length, 1, 'One canonical business tab in this owned browser');
  await client.send('Target.activateTarget', {targetId: tabs[0].targetId});
  const ack = await client.send('Extensions.triggerAction', {id: session.extensionId, targetId: tabs[0].targetId});
  let worker;
  for (let i = 0; i < 30; i++) {
    worker = (await client.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url === 'chrome-extension://' + session.extensionId + '/sw.js');
    if (worker) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(worker);
  const id = (await client.send('Target.attachToTarget', {targetId: worker.targetId, flatten: true})).sessionId;
  let contexts;
  for (let i = 0; i < 30; i++) {
    contexts = await evaluate(client, 'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})', id);
    if (contexts.length === 1) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(contexts.length, 1);
  assert(contexts[0].documentUrl.includes('/ui/tool.html?hostInstanceId='));
  await writeFile(directory + '/' + label + '.json', JSON.stringify({at: new Date().toISOString(), session, status: 'NATIVE_PASS', method: 'Browser Extensions.triggerAction, then actual SIDE_PANEL runtime context; same API as local-dev-native-acceptance.mjs', tab: tabs[0], ack, contexts}, null, 2) + '\n');
  console.log(JSON.stringify({status: 'NATIVE_PASS', pid: session.pid, context: contexts[0].contextType}));
} finally { client.close(); }
