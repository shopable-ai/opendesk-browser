import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {composeExtensionEntries,filterExtensionEntries}
  from '../../src/ui/extension-center-model.js';

const page=(id,revision=1)=>({
  programId:id,manifestHash:'m'.repeat(64),sourceHash:'s'.repeat(64),
  title:'用户已安装的程序',revision,enabled:true,
  pageRules:{matches:['https://chatgpt.com/*']},authorization:{installationId:'install',generation:1}
});
const release=(id,status='blocked',revision=1)=>({
  programId:id,kind:'page-program',version:'1.0.0',revision,title:'官方 '+id,
  description:'官方 Page 候选',sites:['https://chatgpt.com/*'],
  installationPolicy:'reviewed',status,
  ...(status==='blocked'?{blockedReason:'正式安装包未审核'}:
    {packagePath:'official-pages/'+id+'/'+id+'.opendesk-page.json',
      sha256:'0'.repeat(64),sourceHash:'1'.repeat(64),packageHash:'2'.repeat(64),bytes:1234})
});

test('R1.2.4 uninstalled Page candidates are discoverable but never installed',()=>{
  const pages=[release('opendesk.ai-scroll-navigation'),release('opendesk.ai-reply-mindmap'),
    release('opendesk.ai-send-queue')];
  const rows=composeExtensionEntries({pageReleases:pages,pages:[]});
  assert.equal(rows.length,3);
  assert.ok(rows.every(row=>row.kind==='page'&&!row.installed&&!row.enabled&&!row.record));
  assert.equal(filterExtensionEntries(rows,{scope:'smart'}).length,0);
  assert.equal(filterExtensionEntries(rows,{scope:'available'}).length,3);
  assert.equal(filterExtensionEntries(rows,{kind:'page',scope:'available',query:'思维导图'}).length,1);
});

test('R1.2.4 installed old ID stays distinct from newly discoverable candidate',()=>{
  const old=page('opendesk.chatgpt-jump-top',2);
  const candidate=release('opendesk.ai-scroll-navigation');
  const rows=composeExtensionEntries({pages:[old],pageReleases:[candidate]});
  assert.equal(rows.length,2);
  assert.equal(rows.find(row=>row.id===old.programId).installed,true);
  assert.equal(rows.find(row=>row.id===candidate.programId).installed,false);
  assert.ok(rows.every(row=>row.update===false));
});

test('R1.2.4 only an approved higher Page revision counts as an update',()=>{
  const installed=page('opendesk.ai-scroll-navigation',2);
  assert.equal(composeExtensionEntries({pages:[installed],
    pageReleases:[release(installed.programId,'blocked',3)]})[0].update,false);
  assert.equal(composeExtensionEntries({pages:[installed],
    pageReleases:[release(installed.programId,'available',2)]})[0].update,false);
  assert.equal(composeExtensionEntries({pages:[installed],
    pageReleases:[release(installed.programId,'available',3)]})[0].update,true);
});

test('R1.2.4 installed Page status is independent of bundled catalog availability',()=>{
  const installed=page('opendesk.ai-scroll-navigation');
  const rows=composeExtensionEntries({pages:[installed],pageReleases:[],pageStatusKnown:true});
  assert.equal(rows.length,1);
  assert.equal(rows[0].installed,true);
  assert.equal(rows[0].release,null);
  assert.equal(rows[0].record.installed.manifestHash,installed.manifestHash);
  assert.equal(composeExtensionEntries({pages:[],pageReleases:[]}).length,0);
});

test('R1.2.4 Page discovery controls route through the original authority review',async()=>{
  const center=await readFile('src/ui/extension-center.js','utf8');
  const host=await readFile('src/ui/sidebar-tools.js','utf8');
  assert.match(center,/row\.kind==='page'&&!row\.installed/);
  assert.match(center,/row\.release\?\.status==='available'\)add\('审阅并安装'/);
  assert.match(center,/row\.record\?\.installed:null/);
  assert.match(center,/current\?\.installed!==false\|\|current\?\.release!==row\.release/);
  assert.match(host,/loadOfficialPagePackage\(release,\{api,fetcher\}\)/);
  assert.match(host,/await reviewPagePackage\(pkg,/);
  assert.match(host,/foundationClient\.request\('importPageInstallPackage'/);
  assert.match(host,/foundationClient\.request\('listPagePrograms'/);
});
