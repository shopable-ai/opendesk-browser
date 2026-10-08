// Read native loading/pending facts through the live packaged Side Panel.
import fs from 'node:fs/promises';
import path from 'node:path';
import {connect, evaluate} from './sidebar-native-session.mjs';
const dir = path.resolve(process.env.SIDEBAR_EVIDENCE_DIR || 'docs/framework/evidence/sidebar-native-20261008-01a119ff');
const session = JSON.parse(await fs.readFile(path.join(dir, 'session.json')));
const tabId = Number(process.argv[2]), label = process.argv[3] || 'S4-pending-native-facts';
if (!Number.isSafeInteger(tabId) || !/^[A-Za-z0-9_-]+$/.test(label)) throw Error('Arguments');
const client = await connect(session.endpoint);
const target = (await client.send('Target.getTargets')).targetInfos.find(t => t.url.includes('/ui/tool.html?hostInstanceId='));
const {sessionId} = await client.send('Target.attachToTarget', {targetId: target.targetId, flatten: true});
const deadline = Date.now() + 60000;
const samples = [];
console.log('READY read-only native pending observer');
while (Date.now() < deadline) {
  const facts = await evaluate(client, `Promise.all([chrome.tabs.get(${tabId}),chrome.webNavigation.getAllFrames({tabId:${tabId}})]).then(([tab,frames])=>({at:Date.now(),tab,frames,currentPageStatus:document.querySelector('#script-current-page-status').textContent,currentPageState:document.querySelector('#script-current-page-status').dataset.state}))`, sessionId);
  if (facts.tab.status === 'loading' || facts.tab.pendingUrl) {
    samples.push(facts);
    if (facts.currentPageState === 'unavailable' || facts.currentPageState === 'resolving') {
      await fs.writeFile(path.join(dir, `${label}.json`), JSON.stringify({session, facts, samples}, null, 2));
      console.log(JSON.stringify(facts)); client.close(); process.exit(0);
    }
  }
  await new Promise(resolve => setTimeout(resolve, 25));
}
await fs.writeFile(path.join(dir, `${label}-failed.json`), JSON.stringify({session, samples}, null, 2));
client.close(); throw Error('No fail-closed loading/pending candidate observed');
