// R10.6 Browser SDK native acceptance driver.
// Default mode prepares immutable candidate receipts and native steps only.
// Real Chrome execution is gated by OPENDESK_R106_NATIVE=1 and explicit paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,readdir,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {canonical,digest} from '../../src/platform/protocol.js';
import {taskScriptId} from '../../src/platform/tasks/contract.js';
import {sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const driverFile=fileURLToPath(import.meta.url);
const toolRoot=path.join(root,'examples/sidebar-tools/browser-sdk-acceptance');
const defaultEvidence=path.join(root,'docs/framework/workstreams/evidence/browser-sdk-r106-native-driver');
const evidenceRoot=path.resolve(process.env.OPENDESK_R106_EVIDENCE||defaultEvidence);
const chrome155=path.join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const demoUrl='http://127.0.0.1:43111/demo-form.html';
const args=new Set(process.argv.slice(2));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const safeName=value=>value.replace(/[:.]/g,'-');
const now=()=>new Date().toISOString();
const quote=JSON.stringify;

async function fileHash(file){
  const bytes=await readFile(file);
  return {path:path.relative(root,file),bytes:bytes.length,sha256:sha256(bytes)};
}
async function treeHashes(dir){
  const out=[];
  async function scan(current){
    for(const entry of (await readdir(current,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const file=path.join(current,entry.name);
      assert(!entry.isSymbolicLink?.(),'Candidate tree must not contain symlinks: '+file);
      if(entry.isDirectory())await scan(file);
      else if(entry.isFile())out.push(await fileHash(file));
    }
  }
  await scan(dir);
  return out;
}
function gitHead(){
  try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}
  catch(error){return {error:String(error?.message||error)};}
}
async function prepareReceipt(){
  await mkdir(evidenceRoot,{recursive:true});
  const toolPackage=await createSidebarToolPackage(toolRoot);
  const toolBytes=Buffer.from(JSON.stringify(toolPackage));
  const files=await treeHashes(toolRoot);
  const receipt={schema:'opendesk.browser-sdk-r106-native.prepare.v1',status:'PREPARED_NOT_NATIVE_PASS',
    createdAt:now(),gitHead:gitHead(),toolRoot:path.relative(root,toolRoot),
    driver:await fileHash(driverFile),
    toolConfig:await fileHash(path.join(toolRoot,'tool.config.json')),
    sourceFiles:files,toolPackage:{id:toolPackage.id,version:toolPackage.version,
      sha256:sha256(toolBytes),bytes:toolBytes.length},
    demo:{url:demoUrl,checked:false},
    nativeGate:{requiredEnv:'OPENDESK_R106_NATIVE=1',chrome155,extensionEnv:'OPENDESK_R106_EXTENSION',
      evidenceRoot},
    restrictions:[
      'No browser launch, build of shared dist, git branch, storage grant, DOM value assignment, Runtime.evaluate business call, synthetic event, or sender forgery happened in prepare mode.',
      'Native PASS requires main-dialog execution with owned CFT foreground PID, formal UI file import/install, Host approval, screenshots, raw receipts, worker restart, and scheduler alarm evidence.'
    ]};
  const receiptFile=path.join(evidenceRoot,'prepare-receipt.json');
  await writeFile(receiptFile,json(receipt));
  return {receiptFile,receipt};
}

async function screenshot(client,session,dir,name){
  const image=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},session);
  const bytes=Buffer.from(image.data,'base64'),file=path.join(dir,name+'.png');
  await writeFile(file,bytes);
  return {file:path.relative(root,file),bytes:bytes.length,sha256:sha256(bytes)};
}
async function read(client,session,expression){
  return evaluate(client,expression,session);
}
async function deadline(fn,label,ms=20000){
  const end=Date.now()+ms;let last;
  while(Date.now()<end){
    try{const value=await fn();if(value)return value;}catch(error){last=String(error?.message||error);}
    await sleep(150);
  }
  throw Error(label+' NOT_OBSERVED'+(last?' · '+last:''));
}
async function attach(client,targetId){
  const session=(await client.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},session);
  await client.send('Page.enable',{},session);
  return session;
}
async function durableSchedules(client,session){
  // Read only the existing Authority/RunHost database. Never seed a Task,
  // schedule, native receipt, grant or Result from the acceptance observer.
  return read(client,session,`(async()=>{
    if(!(await indexedDB.databases()).some(x=>x.name==='opendesk-browser'))
      throw Error('Existing Authority database is required');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('opendesk-browser');
      r.onupgradeneeded=()=>{r.transaction.abort();reject(Error('Observer may not create or upgrade the Authority database'));};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{
      const tx=db.transaction(['frameworkKV','runs','results','commandJournal'],'readonly');
      const get=name=>new Promise((resolve,reject)=>{const r=tx.objectStore(name).getAll();
        r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const [kv,runs,results,journal]=await Promise.all(['frameworkKV','runs','results','commandJournal'].map(get));
      return {plans:kv.filter(x=>x.tag==='schedule-definition-v1'),
        installs:kv.filter(x=>x.tag==='task-installed-v1'),
        fires:kv.filter(x=>x.tag==='schedule-fire-v1'),
        runs:runs.filter(x=>x.tag==='controller-run'),
        results:results.filter(x=>x.tag==='controller-result'),
        native:journal.filter(x=>x.tag==='controller-operation')};
    }finally{db.close();}
  })()`);
}
async function successfulNativeEffects(state,run,manifest){
  const hash=manifest.program.sourceHash,effects=[];
  for(const value of state.native){
    const envelope=value.envelope,identity=envelope?.identity;
    if(value.runId!==run.runId||value.state!=='durable'||value.reply?.error||
      value.reply?.requestId!==envelope?.requestId||
      !['packaged','browser','user-script'].includes(envelope?.operation?.kind)||
      identity?.tag!=='controller-run'||identity.runId!==run.runId||
      identity.scriptId!==run.scriptId||identity.contentHash!==hash||
      identity.hostInstanceId!==run.hostInstanceId||identity.hostDocumentId!==run.hostDocumentId||
      envelope.revision?.sourceHash!==hash||envelope.target?.allowedOrigin!==manifest.siteOrigins[0])continue;
    const receipt=value.nativeReceipts?.find(x=>x.stage==='result'&&x.requestId===envelope.requestId&&
      x.receipt?.requestId===envelope.requestId);
    if(receipt&&value.requestDigest===await digest(envelope,{maxDepth:48})&&
      canonical(value.reply,{maxDepth:48})===canonical(receipt.receipt,{maxDepth:48}))effects.push(value);
  }
  return effects;
}
async function click(client,session,selector,trace){
  const point=await deadline(async()=>{
    const value=await read(client,session,`(()=>{const n=document.querySelector(${quote(selector)});
      if(!n||n.disabled||!n.getClientRects().length)return null;
      const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,w:r.width,h:r.height,hit:x>0&&y>0&&x<innerWidth&&y<innerHeight&&n.contains(document.elementFromPoint(x,y))};})()`);
    if(value&&!value.hit){
      await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:180,y:300,deltaX:0,
        deltaY:value.y<0?-260:260},session);await sleep(200);
    }
    return value?.hit&&value.w>4&&value.h>4?value:null;
  },'real clickable '+selector);
  for(const type of ['mousePressed','mouseReleased'])
    await client.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',clickCount:1},session);
  trace.push({at:now(),kind:'trusted-cdp-input',selector,x:point.x,y:point.y});
}
async function typeText(client,session,selector,text,trace){
  await click(client,session,selector,trace);
  await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},session);
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},session);
  await client.send('Input.insertText',{text},session);
  const observed=await read(client,session,`document.querySelector(${quote(selector)}).value`);
  assert.equal(observed,text,'native typed value mismatch for '+selector);
  trace.push({at:now(),kind:'trusted-cdp-text',selector,chars:text.length});
}
async function runNative(){
  assert.equal(process.env.OPENDESK_R106_NATIVE,'1','Native run requires OPENDESK_R106_NATIVE=1');
  assert.equal(process.platform,'darwin','R10.6 native driver is headed macOS CFT only');
  const extension=path.resolve(assertEnv('OPENDESK_R106_EXTENSION'));
  const binary=path.resolve(process.env.OPENDESK_R106_CHROME_BIN||chrome155);
  assert.equal(await realpath(binary),await realpath(chrome155),'Use the pinned CFT155 executable');
  assert(!extension.endsWith('/dist/development'),'Do not use shared daily dist/development as immutable native candidate');
  const runDir=path.join(evidenceRoot,'native-'+safeName(now())+'-'+randomUUID().slice(0,8));
  await mkdir(runDir,{recursive:true});
  const report={schema:'opendesk.browser-sdk-r106-native.v1',status:'RUNNING',startedAt:now(),
    gitHead:gitHead(),workingChanges:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}),
    driver:await fileHash(driverFile),
    runDir,extension,binary,demoUrl,cases:{},screenshots:[],trace:[],
    constraints:['No Runtime.evaluate business SDK calls','No storage writes/grants outside formal Host UI','No DOM value assignment or synthetic DOM events','No forged sender']};
  const save=()=>writeFile(path.join(runDir,'native-report.json'),json(report));
  let launched,client,side,tool,control,toolTarget,website,sideTarget,nativeKeyboard;
  function requireNativeResource(){
    const active=execFileSync('ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).split('\n')
      .map(line=>line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
      .filter(([,pid,parent,command])=>command.includes('Chrome for Testing')&&
        !command.includes('/Helpers/')&&parent!=='1'&&Number(pid)!==launched?.metadata?.pid)
      .map(([,pid,parent])=>({pid:Number(pid),parent:Number(parent)}));
    assert.equal(active.length,0,'E_NATIVE_RESOURCE_BUSY '+JSON.stringify(active));
  }
  async function native(command,value){
    assert(launched&&nativeKeyboard,'Owned Mac input is required');
    requireNativeResource();
    const output=execFileSync(nativeKeyboard,[String(launched.metadata.pid),command,...(value?[value]:[])],
      {encoding:'utf8',timeout:12000});
    report.trace.push({at:now(),kind:'owned-macos-input',command,value,output});return output;
  }
  async function chooseFile(session,selector,file){
    await native('activate');await click(client,session,selector,report.trace);
    const chooser=await deadline(async()=>{
      const rows=JSON.parse(await native('dump'));
      return rows.some(r=>r.role==='AXButton'&&['Open','打开'].includes(r.title||r.description))&&
        rows.some(r=>r.role==='AXButton'&&['Cancel','取消'].includes(r.title||r.description))?rows:null;
    },'actual owned macOS file chooser');
    report.trace.push({at:now(),kind:'native-file-chooser',rows:chooser});
    const open=['Open','打开'].find(label=>chooser.filter(r=>r.role==='AXButton'&&(r.title===label||r.description===label)).length===1);
    assert(open,'Unique owned native Open button is required');
    await native('key','go-to-folder');
    await deadline(async()=>{
      const rows=JSON.parse(await native('dump'));
      report.lastFolderDialog=rows;
      return rows.some(r=>['AXTextField','AXComboBox'].includes(r.role)&&r.focused)?rows:null;
    },'focused native Go to Folder field');
    await native('text',file);
    await deadline(async()=>{
      const rows=JSON.parse(await native('dump'));report.lastTypedFolderDialog=rows;
      return rows.some(r=>['AXTextField','AXComboBox'].includes(r.role)&&r.focused&&r.value===file);
    },'exact path entered by native keyboard');
    await native('key','return');await sleep(500);
    // AXPress revalidates the unique live control and owned foreground PID.
    // A second full dump can traverse the selected JSON's native preview.
    await native('press',open);
    report.trace.push({at:now(),kind:'native-file-choice',file,sha256:sha256(await readFile(file))});
  }
  async function bindTool(){
    const frame=await deadline(()=>read(client,side,'(()=>{const n=document.querySelector("#sidebar-tool-frame iframe");return n?{url:n.src}:null})()'),'installed sandbox');
    const target=await deadline(async()=> (await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='iframe'&&t.url===frame.url),'opaque sandbox target');
    toolTarget=target;tool=await attach(client,target.targetId);return frame;
  }
  async function toolClick(selector){
    requireNativeResource();
    await deadline(async()=>{
      const p=await read(client,tool,`(()=>{const n=document.querySelector(${quote(selector)});if(!n||n.disabled)return null;const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,h:r.height}})()`);
      if(!p)return null;
      const f=await read(client,side,'(()=>{const n=document.querySelector("#sidebar-tool-frame iframe"),r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:innerWidth,h:innerHeight}})()');
      const x=f.x+p.x,y=f.y+p.y;
      const hit=x>0&&x<f.w&&y>85&&y<f.h-8&&await read(client,side,`document.elementFromPoint(${x},${y})===document.querySelector("#sidebar-tool-frame iframe")`);
      if(!hit){await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.min(f.w-8,x),y:Math.min(f.h-8,Math.max(100,f.y+40)),deltaX:0,deltaY:y<85?-230:230},side);return false;}
      for(const type of ['mousePressed','mouseReleased'])await client.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1},side);
      report.trace.push({at:now(),kind:'trusted-tool-input',selector,x,y});return true;
    },'tool control '+selector);
  }
  async function toolType(selector,value){
    await toolClick(selector);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},side);
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},side);
    await client.send('Input.insertText',{text:value},side);
    assert.equal(await read(client,tool,`document.querySelector(${quote(selector)}).value`),value);
    report.trace.push({at:now(),kind:'trusted-tool-text',selector,chars:value.length});
  }
  async function openDetails(session,selector){
    if(!await read(client,session,`document.querySelector(${quote(selector)}).open`))
      await click(client,session,selector+' > summary',report.trace);
    assert.equal(await read(client,session,`document.querySelector(${quote(selector)}).open`),true);
  }
  async function output(id){const result=await deadline(async()=>{
    const state=await read(client,tool,'document.querySelector("#status").dataset.state');
    if(!['success','error'].includes(state))return null;
    const text=await read(client,tool,`document.querySelector(${quote('#'+id)}).textContent`);
    try{return JSON.parse(text)}catch{return null;}
  },'SDK receipt '+id);
    report.trace.push({at:now(),kind:'sdk-output',outputId:id,result});await save();return result;
  }
  async function approve(){
    await deadline(()=>read(client,side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'trusted review');
    const summary=await read(client,side,'document.querySelector("#sidebar-tool-action-summary").textContent');
    await click(client,side,'#sidebar-tool-action-continue',report.trace);return summary;
  }
  async function permissionChoice(allow){
    await native('activate');
    const rows=await deadline(async()=>{
      const data=JSON.parse(await native('dump'));
      return data.some(r=>r.role==='AXButton'&&r.enabled===true&&['Allow','允许','Add','添加'].includes(r.title||r.description))&&
        data.some(r=>r.role==='AXButton'&&r.enabled===true&&['Deny','拒绝','Cancel','取消'].includes(r.title||r.description))?data:null;
    },'native Chrome permission dialog',8000);
    report.trace.push({at:now(),kind:'native-permission-dialog',rows});
    const options=allow?['Allow','允许','Add','添加']:['Deny','拒绝','Cancel','取消'];
    const label=options.find(label=>rows.filter(r=>r.role==='AXButton'&&r.enabled===true&&(r.title===label||r.description===label)).length===1);
    assert(label,'Unique native permission control is required');await native('press',label);
  }
  async function recordCase(id,fn){
    console.log('R106_NATIVE_START '+id);
    report.cases[id]={status:'RUNNING',startedAt:now()};await save();
    try{
      requireNativeResource();
      const result=await fn();
      report.cases[id]={status:'PASS',result,finishedAt:now()};
      if(side)report.screenshots.push(await screenshot(client,side,runDir,id));
    }catch(error){
      report.cases[id]={status:'FAIL',error:String(error?.stack||error),finishedAt:now()};
      report.status='FAIL_OR_BLOCKED';
      if(side)report.cases[id].ui=await read(client,side,'({text:document.body.innerText,files:[...document.querySelectorAll("input[type=file]")].map(n=>({id:n.id,files:[...n.files].map(f=>f.name)}))})').catch(error=>({error:String(error)}));
      if(side)report.screenshots.push(await screenshot(client,side,runDir,id+'-failure').catch(e=>({error:String(e)})));
      throw error;
    }finally{await save();}
    console.log('R106_NATIVE_PASS '+id);
  }
  try{
    const fixture=await fetch(demoUrl,{signal:AbortSignal.timeout(5000)});
    assert(fixture.ok,'Canonical demo server must already be available');
    report.candidate={extensionPackage:await packageFingerprint(extension),
      extensionFiles:await treeHashes(extension),toolSourceFiles:await treeHashes(toolRoot)};
    const sourceCommit=assertEnv('OPENDESK_R106_CANDIDATE_SHA');
    assert(/^[0-9a-f]{40}$/.test(sourceCommit),'Exact extension source commit is required');
    const receiptFile=path.resolve(assertEnv('OPENDESK_R106_BUILD_RECEIPT'));
    const receipt=JSON.parse(await readFile(receiptFile,'utf8'));
    assert.equal(receipt.status,'passed');
    assert.deepEqual(receipt.sourceDriftDuringBuild,[]);
    assert.equal(receipt.report.packageHash,report.candidate.extensionPackage.packageHash,'Native package must match the successful build');
    assert(receipt.sourceInputs.length>0);
    for(const input of receipt.sourceInputs){
      const source=execFileSync('git',['show',sourceCommit+':'+input.path],{cwd:root,maxBuffer:32*1024*1024});
      assert.equal(sha256(source),input.sha256,'Build input must belong to the declared source commit: '+input.path);
      assert.equal(source.length,input.bytes);
    }
    report.candidate.sourceCommit=sourceCommit;
    report.candidate.buildReceipt=await fileHash(receiptFile);
    report.candidate.buildInputCount=receipt.sourceInputs.length;
    await recordCase('launch-owned-cft',async()=>{
      launched=await launchChrome({root,binary,extension,headed:true,directory:runDir,label:'r106'});
      client=await connect(launched.endpoint,{onCommand:event=>report.trace.push({at:now(),...event})});
      const version=await client.send('Browser.getVersion');
      assert(version.product.includes('Chrome/155.'),'Pinned Chrome 155 expected');
      const worker=await deadline(async()=> (await client.send('Target.getTargets')).targetInfos
        .find(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://')&&t.url.endsWith('/sw.js')),
        'candidate service worker');
      report.launch=launched.metadata;
      report.extensionId=new URL(worker.url).hostname;
      const helper=await readFile(path.join(root,'tests/framework/time-review-native-input.swift'),'utf8');
      assert(helper.includes('case "go-to-folder":key(5,[.maskCommand,.maskShift])'));
      assert(helper.includes('requireForeground()'));
      const source=path.join(runDir,'owned-native-input.swift');
      await writeFile(source,helper);
      report.nativeHelper={sourceSha256:sha256(await readFile(source)),baseSha256:sha256(Buffer.from(helper))};
      nativeKeyboard=path.join(runDir,'owned-native-input');
      execFileSync('swiftc',[source,'-o',nativeKeyboard],{timeout:60000});
      return {version,extensionId:report.extensionId,pid:launched.metadata.pid,profile:launched.metadata.profile};
    });
    await recordCase('side-panel-contexts',async()=>{
      const target=await client.send('Target.createTarget',{url:'chrome-extension://'+report.extensionId+'/ui/tool.html?hostInstanceId='+randomUUID()});
      control=await attach(client,target.targetId);
      await click(client,control,'#catalog-open-dev-sidebar',report.trace);
      const context=await deadline(async()=> (await read(client,control,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})")).find(r=>r.documentId),'real Side Panel');
      sideTarget=await deadline(async()=> (await client.send('Target.getTargets')).targetInfos.find(t=>t.url===context.documentUrl),'Side Panel target');
      side=await attach(client,sideTarget.targetId);report.sidePanelContext=context;
      await click(client,side,'#tab-tools',report.trace);
      return {shellTarget:target.targetId,context,sideTarget};
    });
    await recordCase('install-open-tool',async()=>{
      const pkg=await createSidebarToolPackage(toolRoot),file=path.join(runDir,'browser-sdk-acceptance.opendesk-tool.json');
      await writeFile(file,JSON.stringify(pkg));
      await click(client,side,'#sidebar-tool-import-trigger',report.trace);
      await chooseFile(side,'#sidebar-tool-file',file);
      await deadline(()=>read(client,side,'document.querySelector("#sidebar-tool-file").files[0]?.name==="browser-sdk-acceptance.opendesk-tool.json"'),'native selected exact file');
      await deadline(()=>read(client,side,`!document.querySelector("#sidebar-tool-preview").hidden&&document.querySelector("#sidebar-tool-preview-title").textContent.includes(${quote(pkg.title)})&&document.querySelector("#sidebar-tool-preview-version").textContent.includes(${quote(pkg.version)})`),'formal exact package review');
      report.review=await read(client,side,'({title:document.querySelector("#sidebar-tool-preview-title").textContent,capabilities:document.querySelector("#sidebar-tool-preview-capabilities").textContent})');
      await click(client,side,'#sidebar-tool-install',report.trace);
      const open='[data-sidebar-tool-action="open"][data-sidebar-tool-id="browser-sdk-acceptance"]';
      await deadline(()=>read(client,side,`!!document.querySelector(${quote(open)})`),'installed tool');
      report.installed=await read(client,control,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.sidebar-tools.revocation-epochs.v1"]).then(r=>({tool:r["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="browser-sdk-acceptance"),epoch:r["opendesk.sidebar-tools.revocation-epochs.v1"]?.["browser-sdk-acceptance"]??null}))');
      assert.equal(report.installed.tool.version,pkg.version);
      report.installed.fileSha256=sha256(await readFile(file));
      report.installed.canonicalPackageHash=await sidebarToolPackageHash(report.installed.tool);
      await click(client,side,open,report.trace);return {frame:await bindTool(),review:report.review,epoch:report.installed.epoch};
    });
    await recordCase('active-demo',async()=>{
      const page=await client.send('Target.createTarget',{url:demoUrl});website=await attach(client,page.targetId);
      await client.send('Target.activateTarget',{targetId:page.targetId});
      await deadline(()=>read(client,website,'document.readyState==="complete"'),'demo loaded');
      return {page,document:await read(client,website,'({url:location.href,title:document.title})')};
    });
    await recordCase('bookmarks-permission-denied',async()=>{
      await toolClick('#bookmark-create');const summary=await approve();await permissionChoice(false);
      const result=await output('bookmarks-output');assert.equal(result.code,'E_PERMISSION');
      assert.equal(await read(client,control,'chrome.permissions.contains({permissions:["bookmarks"]})'),false);
      return {summary,result};
    });
    await recordCase('bookmarks-create',async()=>{
      await toolClick('#bookmark-create');const summary=await approve();await permissionChoice(true);
      const result=await output('bookmarks-output');assert(result.bookmarkRef&&!result.id&&!result.bookmarkId);
      const rows=await read(client,control,'chrome.bookmarks.search({title:"OpenDesk R10.6 demo"})');
      assert.equal(rows.filter(r=>r.url===demoUrl).length,1);return {summary,result,nativeReceipt:rows};
    });
    await recordCase('storage-persist',async()=>{
      await toolClick('#storage-write');assert.equal((await output('storage-output')).written,1);
      await toolClick('#storage-read');const result=await output('storage-output');assert.equal(result.items.R106Proof.value,'first-run');return result;
    });
    await recordCase('bookmarks-remove',async()=>{
      await toolClick('#bookmark-remove');const summary=await approve();
      const result=await output('bookmarks-output');assert.equal(result.removed,true);
      const rows=await read(client,control,'chrome.bookmarks.search({title:"OpenDesk R10.6 demo"})');assert.equal(rows.length,0);return {summary,result,nativeReceipt:rows};
    });
    await recordCase('download-start-and-terminal-state',async()=>{
      await toolClick('#download-start');const summary=await approve();const start=await output('download-output');
      assert(start.downloadRef&&!start.downloadId);
      const states=[];let result,cancellation;
      const observe=async()=>{
        await toolClick('#download-status');const state=await output('download-output');states.push(state);
        assert.equal(state.downloadRef,start.downloadRef,'status must belong to the same started download');
        assert(!state.downloadId&&!state.id,'native IDs must stay private');
        assert(['in_progress','complete','interrupted'].includes(state.state),'actual download state is required');
        return state.state==='in_progress'?null:state;
      };
      const end=Date.now()+30000;
      while(Date.now()<end&&!result){result=await observe();if(!result)await sleep(300);}
      const nativeBeforeCancel=await read(client,control,`chrome.downloads.search({url:${quote(demoUrl)}})`);
      if(!result){
        await toolClick('#download-cancel');const consent=await approve();const reply=await output('download-output');
        assert.equal(typeof reply.cancelled,'boolean','owned cancellation requires a real acknowledgement');
        cancellation={consent,reply};
        result=await deadline(observe,'same owned download terminal state after one cancellation',30000);
      }
      const nativeReceipt=await read(client,control,`chrome.downloads.search({url:${quote(demoUrl)}})`);
      assert.equal(nativeReceipt.length,1,'only the same native download may be observed');
      assert.equal(nativeReceipt[0].state,result.state,'SDK terminal state must match the native item');
      return {summary,start,states,cancellation,nativeBeforeCancel,nativeReceipt,result,
        completion:result.state==='complete'?'COMPLETED':'INTERRUPTED'};
    });
    let installedTask;
    await recordCase('scheduler-fixed-task-install',async()=>{
      const file=path.join(root,'examples/tasks/form-fill.v1.opendesk-task.json');
      const task=JSON.parse(await readFile(file,'utf8'));
      assert.equal(sha256(Buffer.from(task.sourceUtf8)),task.manifest.program.sourceHash);
      assert.deepEqual(task.manifest.siteOrigins,[new URL(demoUrl).origin]);
      await client.send('Target.activateTarget',{targetId:report.cases['side-panel-contexts'].result.shellTarget});
      await chooseFile(control,'#task-package-file',file);
      await deadline(()=>read(client,control,'document.querySelector("#task-catalog-status").textContent.includes("已导入待验证任务")'),'Task candidate imported');
      await click(client,side,'#tab-develop',report.trace);
      const sourceFile=path.join(runDir,'r106-fixed-controller.js');
      await writeFile(sourceFile,task.sourceUtf8);
      // Import the identical Controller bytes through the normal catalog.
      await chooseFile(control,'#task-package-file',sourceFile);
      await deadline(()=>read(client,side,`document.querySelector('#script-source').value===${quote(task.sourceUtf8)}`),'fixed source in Developer');
      await client.send('Target.activateTarget',{targetId:report.cases['active-demo'].result.page.targetId});
      await deadline(()=>read(client,side,`document.querySelector('#script-current-page-url').textContent===${quote(demoUrl)}`),'exact demo target before Controller run');
      await openDetails(side,'#manual-project-params-tools');
      await typeText(client,side,'#script-params',JSON.stringify({name:'R106 Native Fixed Task'}),report.trace);
      const priorRunId=await read(client,side,'document.querySelector("#script-run-id").value');
      await click(client,side,'#script-run',report.trace);
      const runId=await deadline(async()=>{const value=await read(client,side,'document.querySelector("#script-run-id").value');
        return value&&value!==priorRunId?value:null;},'new verification Controller RunId',35000);
      const verified=await deadline(async()=>{
        const state=await durableSchedules(client,side),run=state.runs.find(x=>x.runId===runId);
        const result=state.results.find(x=>x.runId===runId&&x.resultId===run?.resultId);
        if(run?.state!=='completed'||run.retirementState!=='released'||run.workerRetired!==true||
          result?.state!=='completed'||result.outcome?.ok!==true||
          run.revision?.sourceHash!==task.manifest.program.sourceHash||result.revision?.sourceHash!==task.manifest.program.sourceHash)return null;
        const effects=await successfulNativeEffects(state,run,task.manifest);
        return effects.length?{run,result,effects}:null;
      },'same-source native verification Result and retirement',45000);
      await client.send('Target.activateTarget',{targetId:report.cases['side-panel-contexts'].result.shellTarget});
      await openDetails(control,'#catalog-verification');
      await typeText(client,control,'#task-verify-run',runId,report.trace);
      await click(client,control,'#task-verify',report.trace);
      await deadline(()=>read(client,control,'document.querySelector("#task-catalog-status").textContent.includes("已核对本机持久运行")'),'verified native candidate');
      await click(client,control,'#task-publish',report.trace);
      await deadline(()=>read(client,control,'document.querySelector("#task-catalog-status").textContent.includes("已成为本地可安装版本")'),'local available fixed Task');
      await click(client,control,'#task-install',report.trace);
      installedTask=await deadline(async()=>{
        const state=await durableSchedules(client,side);
        return state.installs.find(x=>x.taskId===task.manifest.taskId&&x.enabled===true&&x.version===task.manifest.version);
      },'installed fixed Task identity');
      assert.equal(installedTask.scriptId,taskScriptId(task.manifest.taskId,task.manifest.version));
      assert.equal(installedTask.manifestHash,task.manifestHash);
      assert(installedTask.authorization?.installationId&&Number.isSafeInteger(installedTask.authorization?.generation));
      return {taskPackageSha256:sha256(await readFile(file)),manifest:task.manifest,installedTask,verified};
    });
    let scheduleRef,runnerTarget,runner,runnerContext;
    await recordCase('scheduler-open-existing-runhost',async()=>{
      await click(client,side,'#tab-my-tasks',report.trace);
      await click(client,side,'#schedule-open',report.trace);
      const prior=(await client.send('Target.getTargets')).targetInfos.map(x=>x.targetId);
      await click(client,side,'#schedule-open-runner',report.trace);
      runnerTarget=await deadline(async()=> (await client.send('Target.getTargets')).targetInfos.find(x=>{
        if(prior.includes(x.targetId))return false;
        try{const url=new URL(x.url);return url.protocol==='chrome-extension:'&&url.hostname===report.extensionId&&
          url.pathname==='/ui/tool.html'&&url.searchParams.get('scheduledRunner')==='1'&&
          /^[0-9a-f-]{36}$/i.test(url.searchParams.get('hostInstanceId')||'');}catch{return false;}
      }),'newly user-opened exact canonical Schedule RunHost');
      runner=await attach(client,runnerTarget.targetId);
      runnerContext=await deadline(async()=> (await read(client,runner,'chrome.runtime.getContexts({contextTypes:["TAB"]})'))
        .find(x=>x.documentId&&x.documentUrl===runnerTarget.url),'registered actual runner TAB document');
      await deadline(()=>read(client,runner,'document.documentElement.dataset.opendeskSurface==="scheduled-runner"&&!document.querySelector("#scheduled-panel").hidden'),'real RunHost surface ready');
      await click(client,side,'#schedule-back',report.trace);
      await click(client,side,'#tab-tools',report.trace);
      await click(client,side,'[data-sidebar-tool-action="open"][data-sidebar-tool-id="browser-sdk-acceptance"]',report.trace);
      await bindTool();
      await client.send('Page.navigate',{url:demoUrl},website);
      await deadline(()=>read(client,website,'document.readyState==="complete"&&!document.querySelector("#done")'),'fresh untouched demo before scheduling');
      await client.send('Target.activateTarget',{targetId:report.cases['active-demo'].result.page.targetId});
      await deadline(()=>read(client,side,`document.querySelector('#script-current-page-url').textContent===${quote(demoUrl)}`),'exact demo target for Scheduler approval');
      return {runnerTarget,runnerContext};
    });
    await recordCase('storage-independent-tool-reopen',async()=>{
      await toolClick('#storage-read');const result=await output('storage-output');
      assert.equal(result.items.R106Proof.value,'first-run');
      return {result,withoutAI:true,frame:toolTarget};
    });
    await recordCase('scheduler-create-owned-alarm',async()=>{
      await toolType('#task-id',installedTask.taskId);
      await toolType('#task-revision','1');
      await toolClick('#schedule-create');const summary=await approve();const result=await output('scheduler-output');
      assert.equal(result.status,'active');assert(result.scheduleRef);scheduleRef=result.scheduleRef;
      const persisted=await deadline(async()=>{
        const state=await durableSchedules(client,side),plan=state.plans.find(x=>x.scheduleId===scheduleRef);
        const alarms=await read(client,side,'chrome.alarms.getAll()');
        const alarm=alarms.find(x=>x.name==='opendesk.schedule.v1:'+scheduleRef);
        return plan&&alarm&&Math.abs(alarm.scheduledTime-plan.nextDueAt)<2000?{plan,alarm}:null;
      },'owned persisted schedule and native Chrome Alarm');
      assert.equal(persisted.plan.taskId,installedTask.taskId);
      const manifest=report.cases['scheduler-fixed-task-install'].result.manifest;
      assert.equal(persisted.plan.version,installedTask.version);
      assert.equal(persisted.plan.manifestHash,installedTask.manifestHash);
      assert.equal(persisted.plan.sourceHash,manifest.program.sourceHash);
      assert.equal(persisted.plan.revision,manifest.program.revision);
      assert.equal(persisted.plan.installationId,installedTask.authorization.installationId);
      assert.equal(persisted.plan.taskGeneration,installedTask.authorization.generation);
      assert.equal(persisted.plan.owner?.kind,'installed-tool-owned');
      assert.equal(persisted.plan.owner.toolId,report.installed.tool.id);
      assert.equal(persisted.plan.owner.toolVersion,report.installed.tool.version);
      assert.equal(persisted.plan.owner.packageHash,report.installed.canonicalPackageHash);
      assert.equal(persisted.plan.owner.epoch,report.installed.epoch);
      await toolClick('#schedule-list');const list=await output('scheduler-output');
      assert.equal(list.schedules.filter(x=>x.scheduleRef===scheduleRef).length,1);
      return {summary,result,persisted,list};
    });
    await recordCase('scheduler-two-independent-runhost-results',async()=>{
      console.log('R106_NATIVE_WAIT actual 1-minute Alarm/RunHost twice; no AI or fire injection');
      let firstEffect;
      const results=await deadline(async()=>{
        const state=await durableSchedules(client,runner),fires=state.fires.filter(x=>x.scheduleId===scheduleRef);
        const complete=[];
        const contexts=await read(client,runner,'chrome.runtime.getContexts({contextTypes:["TAB","SIDE_PANEL"]})');
        for(const fire of fires){
          const runs=state.runs.filter(x=>x.scheduledFireId===fire.fireId);
          const run=runs[0],result=state.results.find(x=>x.runId===fire.runId&&x.resultId===fire.resultId);
          assert(runs.length<=1,'One original Run per FireId');
          const manifest=report.cases['scheduler-fixed-task-install'].result.manifest;
          if(run?.state!=='completed'||run.retirementState!=='released'||run.workerRetired!==true||
            result?.state!=='completed'||result.outcome?.ok!==true||run.revision?.sourceHash!==manifest.program.sourceHash||
            result.revision?.sourceHash!==manifest.program.sourceHash)continue;
          assert.equal(fire.runId,run.runId);assert.equal(fire.resultId,run.resultId);assert.equal(run.resultId,result.resultId);
          assert(contexts.some(x=>x.documentId===run.hostDocumentId),'Actual registered original RunHost document');
          const effects=await successfulNativeEffects(state,run,manifest);
          if(effects.length)complete.push({fire,run,result,effects,contexts});
        }
        if(complete.length===1&&!firstEffect){
          firstEffect=await read(client,website,'({done:!!document.querySelector("#done"),name:document.querySelector("#name").value})');
          assert.equal(firstEffect.done,true);assert.equal(firstEffect.name,'Alice');
          await client.send('Page.navigate',{url:demoUrl},website);
          await deadline(()=>read(client,website,'document.readyState==="complete"&&!document.querySelector("#done")'),'fresh document before second real Alarm');
        }
        return complete.length>=2?complete.slice(0,2):null;
      },'two actual durable scheduled Results without AI',185000);
      assert.notEqual(results[0].fire.fireId,results[1].fire.fireId);
      assert.notEqual(results[0].run.runId,results[1].run.runId);
      assert.notEqual(results[0].result.resultId,results[1].result.resultId);
      assert(firstEffect,'First scheduled effect must be observed before second execution');
      const secondEffect=await read(client,website,'({url:location.href,done:!!document.querySelector("#done"),name:document.querySelector("#name").value})');
      assert.equal(secondEffect.done,true);assert.equal(secondEffect.name,'Alice');
      return {runnerTarget,runnerContext,results,firstEffect,secondEffect,
        causality:'Registered Chrome Alarms and actual Scheduler/RunHost results; existing Host polling remains active, exclusive onAlarm causality not asserted'};
    });
    await recordCase('scheduler-cancel-owned',async()=>{
      await toolClick('#schedule-cancel');const result=await output('scheduler-output');
      assert.equal(result.cancelled,true);
      await toolClick('#schedule-list');const list=await output('scheduler-output');
      assert(!list.schedules.some(x=>x.scheduleRef===scheduleRef));
      assert(!(await read(client,side,'chrome.alarms.getAll()')).some(x=>x.name==='opendesk.schedule.v1:'+scheduleRef));
      return {result,list};
    });
    report.status='CORE_PASS_MORE_CONTRACTS_NOT_TESTED';
    report.remaining=['Worker restart','cross-tool isolation','History real trusted query','Origin revoke','upgrade/uninstall'];
    return report;
  }finally{
    if(client)client.close();
    if(launched){
      await launched.copyLog().catch(()=>{});
      report.cleanup=await launched.stop();
    }
    report.driverUnchanged=(await fileHash(driverFile)).sha256===report.driver.sha256;
    if(report.nativeHelper)report.nativeHelper.baseUnchanged=sha256(await readFile(path.join(root,
      'tests/framework/time-review-native-input.swift')))===report.nativeHelper.baseSha256;
    if(report.candidate){
      report.candidateUnchanged=JSON.stringify(await packageFingerprint(extension))===JSON.stringify(report.candidate.extensionPackage)&&
        JSON.stringify(await treeHashes(extension))===JSON.stringify(report.candidate.extensionFiles)&&
        JSON.stringify(await treeHashes(toolRoot))===JSON.stringify(report.candidate.toolSourceFiles);
    }
    const drift=report.driverUnchanged===false||report.candidateUnchanged===false||report.nativeHelper?.baseUnchanged===false;
    if(drift)report.status='FAIL_CANDIDATE_OR_DRIVER_DRIFT';
    report.finishedAt=now();
    await save();
    if(drift)throw Error('Native evidence input changed; original receipts retained, candidate PASS rejected');
  }
}
function assertEnv(name){
  assert(process.env[name],name+' is required');
  return process.env[name];
}

if(args.has('--native')){
  await runNative();
}else if(args.has('--prepare')||process.env.NODE_TEST_CONTEXT==='child-v8'){
  test('R10.6 prepare receipt is generated without native browser side effects',async()=>{
    const {receiptFile,receipt}=await prepareReceipt();
    assert.equal(receipt.status,'PREPARED_NOT_NATIVE_PASS');
    assert.match(receipt.toolPackage.sha256,/^[a-f0-9]{64}$/);
    assert(receipt.sourceFiles.some(row=>row.path.endsWith('examples/sidebar-tools/browser-sdk-acceptance/src/main.js')));
    assert.equal((await stat(receiptFile)).isFile(),true);
  });
}else{
  const {receiptFile}=await prepareReceipt();
  console.log(json({status:'PREPARED_NOT_NATIVE_PASS',receiptFile}));
}
