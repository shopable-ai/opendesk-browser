// Read-only observer for an already opened, genuinely installed CFT tool.
// Installation, permissions and every bookmark write must use native UI.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

const [launchFile,outputFile,mode='snapshot']=process.argv.slice(2);
assert(launchFile&&outputFile,'Usage: node observer.mjs launch.json NEW-report.json [snapshot|tree|search|observe|page]');
assert(['snapshot','tree','search','observe','page'].includes(mode));
const launch=JSON.parse(await readFile(launchFile,'utf8'));
assert(launch.profile.includes('/codex-cft-')&&launch.args.includes('--use-mock-keychain'),
  'Only the dedicated managed CFT profile is admitted');
const extension=resolve('dist/development');
assert(launch.args.includes('--load-extension='+extension),'Daily development path must match');
const [port,route]=(await readFile(launch.profile+'/DevToolsActivePort','utf8')).trim().split('\n');
const client=await connect('ws://127.0.0.1:'+port+route);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=['examples/sidebar-tools/bookmark-manager/src/main.js',
  'examples/sidebar-tools/bookmark-manager/src/service.js',
  'examples/sidebar-tools/bookmark-manager/src/model.js',
  'examples/sidebar-tools/bookmark-manager/tool.config.json',
  'src/platform/chrome/bookmarks-full.js','src/platform/chrome/current-page-refs.js',
  'src/framework/sdk/browser-schemas.js','src/ui/sidebar-tools.js'];
const fingerprints=()=>Promise.all(inputs.map(async path=>({path,sha256:hash(await readFile(path))})));
const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children||[])]);
// The bounded SDK explicitly represents the synthetic root's absent parent and
// position as null; Chrome omits those two fields. Other positions stay exact.
const canonical=nodes=>nodes.map(({id,parentId,index,title,url})=>({id,
  parentId:parentId??null,index:index??null,title,url}))
  .sort((a,b)=>a.id.localeCompare(b.id));
const report={at:new Date().toISOString(),mode,status:'NOT_TESTED',
  environment:{profile:launch.profile,pid:launch.pid,extension},inputsBefore:await fingerprints()};
try{
  const {targetInfos}=await client.send('Target.getTargets');
  const worker=targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
  assert(worker,'Loaded extension worker required');
  const extensionId=new URL(worker.url).hostname;
  const attach=async target=>(await client.send('Target.attachToTarget',
    {targetId:target.targetId,flatten:true})).sessionId;
  const ws=await attach(worker);
  const native=()=>evaluate(client,'chrome.bookmarks.getTree()',ws);
  report.environment.extensionId=extensionId;
  report.nativeBefore=await native();
  const nativeNodes=flatten(report.nativeBefore);
  assert(nativeNodes.some(n=>n.title==='R25 专用测试数据 01a13e74'),
    'Named disposable fixture must exist; never test against private bookmarks');
  report.environment.permission=await evaluate(client,
    'chrome.permissions.contains({permissions:["bookmarks"]})',ws);
  const installation=await evaluate(client,`(async()=>{
    const s=await chrome.storage.local.get(['opendesk.sidebar-tools.installed.v1',
      'opendesk.browser.context-menu-grants.v1','opendesk.sidebar-tools.revocation-epochs.v1']);
    return {tool:s['opendesk.sidebar-tools.installed.v1'].find(t=>t.id==='bookmark-manager'),
      grant:s['opendesk.browser.context-menu-grants.v1']?.['bookmark-manager'],
      epoch:s['opendesk.sidebar-tools.revocation-epochs.v1']?.['bookmark-manager']};
  })()`,ws);
  report.installation={version:installation.tool.version,
    packageHash:await sidebarToolPackageHash(installation.tool),
    installEpoch:installation.epoch,grant:installation.grant};
  const catalog=JSON.parse(await readFile(extension+'/official-tools/catalog.json','utf8'));
  report.release=catalog.apps.find(t=>t.toolId==='bookmark-manager');
  assert.equal(report.installation.version,report.release.version,'Installed version differs from current release');
  const releaseBytes=await readFile(extension+'/'+report.release.packagePath);
  assert.equal(hash(releaseBytes),report.release.sha256);
  assert.equal(report.installation.packageHash,await sidebarToolPackageHash(JSON.parse(releaseBytes)));
  report.build=JSON.parse(await readFile(extension+'/development-update.json','utf8')).revision;
  const page=targetInfos.find(t=>t.url.startsWith('chrome-extension://'+extensionId+'/ui/tool.html'));
  if(page)report.ui=await evaluate(client,'({text:document.body.innerText,dev:document.getElementById("opendesk-development-status")?.textContent})',await attach(page));
  const sandbox=targetInfos.find(t=>t.type==='iframe'&&t.url.startsWith(
    'chrome-extension://'+extensionId+'/sidebar-tools/sandbox.html'));
  assert(sandbox,'Installed tool sandbox required');
  const ss=await attach(sandbox);
  report.sandbox=await evaluate(client,'({text:document.body.innerText,chromeBookmarks:typeof globalThis.chrome?.bookmarks,version:typeof OpenDeskSDK})',ss);
  assert.equal(report.sandbox.chromeBookmarks,'undefined');
  if(mode==='tree'||mode==='search'){
    report.sdk=await evaluate(client,`(async()=>{
      const api=OpenDeskSDK.browser.bookmarks,all=[],cursors=new Set();let cursor,pages=0,ref;
      do{
        const page=await api.${mode==='tree'?'getTree':'search'}({limit:100,
          ${mode==='search'?'query:"R25-1001",':''}...(cursor?{cursor}:{})});
        if(!Array.isArray(page.nodes)||pages++>2048||ref&&ref!==page.snapshotRef)
          throw Error('Invalid or drifting SDK snapshot');
        ref=page.snapshotRef;all.push(...page.nodes);cursor=page.nextCursor;
        if(cursor&&cursors.has(cursor))throw Error('Repeated cursor');cursors.add(cursor);
      }while(cursor);
      return {nodes:all,pages,snapshotRef:ref,lastCursor:cursor};
    })()`,ss);
    const expected=mode==='tree'?nativeNodes:nativeNodes.filter(n=>n.title.includes('R25-1001'));
    assert.deepEqual(canonical(report.sdk.nodes),canonical(expected),'All IDs, parents, order and fields must match Chrome');
    if(mode==='tree'){
      const id=report.sdk.nodes.find(n=>n.url)?.id;
      report.get=await evaluate(client,`OpenDeskSDK.browser.bookmarks.get({id:${JSON.stringify(id)}})`,ss);
      assert.deepEqual(canonical(report.get),canonical(nativeNodes.filter(n=>n.id===id)));
    }
  }else if(mode==='observe'){
    report.observation=await evaluate(client,`(async()=>{
      const api=OpenDeskSDK.browser.bookmarks.observe;
      const session=await api.start({maxEvents:100,durationMs:30000});
      try{return {session,read:await api.read({sessionRef:session.sessionRef,cursor:session.cursor,limit:50})}}
      finally{await api.stop({sessionRef:session.sessionRef})}
    })()`,ss);
  }else if(mode==='page'){
    report.context=await evaluate(client,'OpenDeskSDK.browser.page.getContext()',ss);
    assert(report.context.tabRef&&report.context.documentRef,'Host-issued document refs required');
    assert(!('tabId' in report.context)&&!('documentId' in report.context),'Raw native IDs must stay private');
  }
  report.nativeAfter=await native();
  assert.deepEqual(canonical(flatten(report.nativeAfter)),canonical(nativeNodes),'Native tree changed during read verification');
  report.inputsAfter=await fingerprints();
  assert.deepEqual(report.inputsAfter,report.inputsBefore,'Relevant source drifted during observation');
  report.status=mode==='snapshot'?'OBSERVED':'PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{
  client.close();
  await writeFile(outputFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output:outputFile,mode,status:report.status,error:report.error,
    nodes:report.sdk?.nodes.length,pages:report.sdk?.pages}));
}
