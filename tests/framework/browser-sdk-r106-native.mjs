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

const root=fileURLToPath(new URL('../../',import.meta.url));
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
    runDir,extension,binary,demoUrl,cases:{},screenshots:[],trace:[],
    constraints:['No Runtime.evaluate business SDK calls','No storage writes/grants outside formal Host UI','No DOM value assignment or synthetic DOM events','No forged sender']};
  const save=()=>writeFile(path.join(runDir,'native-report.json'),json(report));
  let launched,client,side,tool,control,toolTarget,website,sideTarget,nativeKeyboard;
  async function native(command,value){
    assert(launched&&nativeKeyboard,'Owned Mac input is required');
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
    const rows=JSON.parse(await native('dump'));
    const open=['Open','打开'].find(label=>rows.filter(r=>r.role==='AXButton'&&(r.title===label||r.description===label)).length===1);
    assert(open,'Unique owned native Open button is required');await native('press',open);
    report.trace.push({at:now(),kind:'native-file-choice',file,sha256:sha256(await readFile(file))});
  }
  async function bindTool(){
    const frame=await deadline(()=>read(client,side,'(()=>{const n=document.querySelector("#sidebar-tool-frame iframe");return n?{url:n.src}:null})()'),'installed sandbox');
    const target=await deadline(async()=> (await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='iframe'&&t.url===frame.url),'opaque sandbox target');
    toolTarget=target;tool=await attach(client,target.targetId);return frame;
  }
  async function toolClick(selector){
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
  async function output(id){return deadline(async()=>{
    const state=await read(client,tool,'document.querySelector("#status").dataset.state');
    if(!['success','error'].includes(state))return null;
    const text=await read(client,tool,`document.querySelector(${quote('#'+id)}).textContent`);
    try{return JSON.parse(text)}catch{return null;}
  },'SDK receipt '+id);}
  async function approve(){
    await deadline(()=>read(client,side,'!document.querySelector("#sidebar-tool-action-review").hidden'),'trusted review');
    const summary=await read(client,side,'document.querySelector("#sidebar-tool-action-summary").textContent');
    await click(client,side,'#sidebar-tool-action-continue',report.trace);return summary;
  }
  async function permissionChoice(allow){
    await native('activate');
    const rows=await deadline(async()=>{
      const data=JSON.parse(await native('dump'));
      return data.some(r=>r.role==='AXButton'&&['Allow','Cancel','允许','取消','Add','添加'].includes(r.title||r.description))?data:null;
    },'native Chrome permission dialog',8000);
    report.trace.push({at:now(),kind:'native-permission-dialog',rows});
    const options=allow?['Allow','允许','Add','添加']:['Cancel','取消'];
    const label=options.find(label=>rows.filter(r=>r.role==='AXButton'&&(r.title===label||r.description===label)).length===1);
    assert(label,'Unique native permission control is required');await native('press',label);
  }
  async function recordCase(id,fn){
    console.log('R106_NATIVE_START '+id);
    report.cases[id]={status:'RUNNING',startedAt:now()};await save();
    try{
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
      assert(helper.includes('case "home":key(115)'));
      const source=path.join(runDir,'owned-native-input.swift');
      const activate='owned.activate(options:[]);RunLoop.current.run(until:Date().addingTimeInterval(0.25));';
      assert(helper.includes(activate));
      await writeFile(source,helper.replace(activate,
        'if let windows=value(app,kAXWindowsAttribute) as? [AXUIElement],let window=windows.first {AXUIElementPerformAction(window,kAXRaiseAction as CFString)};owned.activate(options:[.activateAllWindows,.activateIgnoringOtherApps]);let activationDeadline=Date().addingTimeInterval(3);while NSWorkspace.shared.frontmostApplication?.processIdentifier != pid && Date()<activationDeadline {RunLoop.current.run(until:Date().addingTimeInterval(0.1))};')
        .replace('case "home":key(115)',
        'case "go-to-folder":key(5,[.maskCommand,.maskShift])\n    case "home":key(115)')
        .replace('for down in [true,false]{let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down);event?.keyboardSetUnicodeString(stringLength:characters.count,unicodeString:characters);event?.post(tap:.cghidEventTap)}',
        'for start in stride(from:0,to:characters.count,by:8){let chunk=Array(characters[start..<min(start+8,characters.count)]);for down in [true,false]{let event=CGEvent(keyboardEventSource:nil,virtualKey:0,keyDown:down);event?.flags=[];event?.keyboardSetUnicodeString(stringLength:chunk.count,unicodeString:chunk);event?.post(tap:.cghidEventTap)};RunLoop.current.run(until:Date().addingTimeInterval(0.05))}'));
      nativeKeyboard=path.join(runDir,'owned-native-input');
      execFileSync('swiftc',[source,'-o',nativeKeyboard],{timeout:60000});
      report.nativeHelper={sourceSha256:sha256(await readFile(source)),baseSha256:sha256(Buffer.from(helper))};
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
      await deadline(()=>read(client,side,'!document.querySelector("#sidebar-tool-preview").hidden&&document.querySelector("#sidebar-tool-preview-title").textContent.includes("Browser SDK Acceptance")&&document.querySelector("#sidebar-tool-preview-version").textContent.includes("10.6.0")'),'formal exact package review');
      report.review=await read(client,side,'({title:document.querySelector("#sidebar-tool-preview-title").textContent,capabilities:document.querySelector("#sidebar-tool-preview-capabilities").textContent})');
      await click(client,side,'#sidebar-tool-install',report.trace);
      const open='[data-sidebar-tool-action="open"][data-sidebar-tool-id="browser-sdk-acceptance"]';
      await deadline(()=>read(client,side,`!!document.querySelector(${quote(open)})`),'installed tool');
      report.installed=await read(client,control,'chrome.storage.local.get(["opendesk.sidebar-tools.installed.v1","opendesk.sidebar-tools.revocation-epochs.v1"]).then(r=>({tool:r["opendesk.sidebar-tools.installed.v1"].find(t=>t.id==="browser-sdk-acceptance"),epoch:r["opendesk.sidebar-tools.revocation-epochs.v1"]?.["browser-sdk-acceptance"]??null}))');
      assert.equal(report.installed.tool.version,pkg.version);
      report.installed.fileSha256=sha256(await readFile(file));
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
    await recordCase('download-start-and-complete',async()=>{
      await toolClick('#download-start');const summary=await approve();const start=await output('download-output');
      assert(start.downloadRef&&!start.downloadId);await sleep(800);await toolClick('#download-status');
      const result=await output('download-output');assert.equal(result.state,'complete');return {summary,start,result};
    });
    report.status='CORE_PASS_MORE_CONTRACTS_NOT_TESTED';
    report.remaining=['Scheduler installed fixed Task + two Alarm/RunHost results','Worker restart','cross-tool isolation','History real trusted query','Origin revoke','upgrade/uninstall'];
    return report;
  }finally{
    if(client)client.close();
    if(launched){
      await launched.copyLog().catch(()=>{});
      report.cleanup=await launched.stop();
    }
    report.finishedAt=now();
    await save();
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
