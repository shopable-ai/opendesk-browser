// Native input and read-only observation driver.
// No permission writes, database mutations, synthetic events, execution RPCs or receipt writes.
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect, evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';

const directory = path.resolve(process.env.PROGRAM_EVIDENCE_DIR || 'docs/framework/evidence/program-r31-01a11c05');
const sessionFile = path.join(directory, 'session.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const save = async (name, value) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2) + '\n',{flag:'wx'});

async function start() {
  await mkdir(directory, {recursive:true});
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push({at:new Date().toISOString(), url:request.url});
    const name = new URL(request.url, 'http://localhost').pathname;
    if (['/api/success','/api/failure'].includes(name)) {
      const status=name==='/api/success'?200:503;
      const body=JSON.stringify({ok:status===200,fixture:'program-r31',method:request.method,status});
      requests.at(-1).response={status,body};
      response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});response.end(body);return;
    }
    const allowed = {'/demo-form.html':'demo-form.html', '/d1-userscript.html':'d1-userscript.html'};
    if (!allowed[name]) {response.writeHead(404); response.end('Not found'); return;}
    response.setHeader('Content-Type','text/html; charset=utf-8');
    response.end(await readFile(path.resolve('examples/tasks', allowed[name])));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const binary = process.env.PROGRAM_CHROME_BINARY;
  if (!binary || !path.isAbsolute(binary)) throw Error('PROGRAM_CHROME_BINARY must identify the controlled CFT executable');
  const extension = path.resolve(process.env.PROGRAM_EXTENSION || 'dist/production');
  const launched = await launchChrome({root:process.cwd(), binary, extension, headed:true, directory, label:'program-r3'});
  let closing = false;
  const cleanup = async (exitCode=0) => {
    if (closing) return;
    closing = true;
    try {await save('server-events.json', requests);await launched.copyLog();}
    finally {
      const stopped=await launched.stop();server.close();
      try {await save('cleanup.json',stopped);} finally {process.exit(exitCode);}
    }
  };
  process.on('SIGTERM',()=>cleanup());process.on('SIGINT',()=>cleanup());
  let client;
  try {
    client=await connect(launched.endpoint);
    const A=await client.send('Target.createTarget',{url:origin+'/demo-form.html'});
    const B=await client.send('Target.createTarget',{url:origin+'/demo-form.html?tab=B'});
    await client.send('Target.activateTarget',{targetId:A.targetId});
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const sw=targets.find(target=>target.type==='service_worker'&&target.url.endsWith('/sw.js'));
    if(!sw)throw Error('Controlled extension worker not observed');
    await save('session.json',{at:new Date().toISOString(),...launched.metadata,driverPid:process.pid,endpoint:launched.endpoint,
      origin,A:A.targetId,B:B.targetId,extension,extensionId:sw.url.split('/')[2],
      version:await client.send('Browser.getVersion'),package:await packageFingerprint(extension)});
    console.log(JSON.stringify({sessionFile,origin,pid:launched.metadata.pid}));
  }catch(error){console.error(error);await cleanup(1);}
  finally{client?.close();}
}

async function targetSession(client, session, targetName) {
  const targets = (await client.send('Target.getTargets')).targetInfos;
  let contextUrl;
  if (targetName === 'panel' || targetName === 'catalog') {
    const sw = targets.find(value => value.type === 'service_worker' && value.url.endsWith('/sw.js'));
    if (!sw) throw Error('Extension worker not observed');
    const swId = (await client.send('Target.attachToTarget',{targetId:sw.targetId,flatten:true})).sessionId;
    const contexts = await evaluate(client, 'chrome.runtime.getContexts({})', swId);
    contextUrl = contexts.find(value => value.contextType === (targetName === 'panel' ? 'SIDE_PANEL' : 'TAB') && value.documentUrl?.includes('/ui/tool.html'))?.documentUrl;
    if (!contextUrl) throw Error('Native extension context not observed: ' + targetName);
  }
  const target = targets.find(value => targetName === 'panel'
    ? value.url === contextUrl
    : targetName === 'catalog' ? value.url === contextUrl
    : targetName === 'sw' ? value.type === 'service_worker' && value.url.endsWith('/sw.js')
    : value.targetId === (session[targetName] || targetName));
  if (!target) throw Error('Target not observed: ' + targetName);
  return {target, id:(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId};
}

const observation = `(() => {
  const visible = node => Boolean(node.getClientRects().length) && getComputedStyle(node).visibility !== 'hidden';
  return {url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth},
    tab:document.documentElement.dataset.opendeskTab,activeElement:document.activeElement?.id,scroll:{x:scrollX,y:scrollY},
    mainReferencesUnchanged:window.__d1MainReferences ? window.$===window.__d1MainReferences.dollar && window.jQuery===window.__d1MainReferences.jquery : null,
    controls:[...document.querySelectorAll('[id]')].map(node=>({id:node.id,value:node.value,text:node.textContent?.slice(0,8192),
      visible:visible(node),disabled:node.disabled,readOnly:node.readOnly,checked:node.checked,open:node.open,state:node.dataset.state,
      rect:{x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height},
      stopOnly:node.dataset.stopOnly,ariaSelected:node.getAttribute('aria-selected'),tabIndex:node.tabIndex})),
    taskCards:[...document.querySelectorAll('[data-task-id]')].map(node=>({taskId:node.dataset.taskId,ariaPressed:node.getAttribute('aria-pressed'),visible:visible(node)})),
    resources:globalThis.OpenDeskResourceDiagnostics?.snapshot(),inputs:globalThis.__programInputs};
})()`;

async function observe(client, session, label) {
  if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error('Invalid evidence label');
  const targets = (await client.send('Target.getTargets')).targetInfos;
  const pages = [];
  for (const target of targets.filter(value => ['page','other'].includes(value.type) && !value.url.startsWith('chrome://'))) {
    try {
      const id = (await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
      pages.push({target, observation:await evaluate(client, observation, id)});
    } catch(error) {pages.push({target,error:String(error)});}
  }
  const {id} = await targetSession(client, session, 'sw');
  const native = await evaluate(client, `(async () => {
    const stores={};
    for(const info of await indexedDB.databases()) {
      const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(info.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      const values={};
      for(const name of db.objectStoreNames) values[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      stores[info.name]=values; db.close();
    }
    return {contexts:await chrome.runtime.getContexts({}),tabs:await chrome.tabs.query({}),permissions:await chrome.permissions.getAll(),
      frames:await Promise.all((await chrome.tabs.query({})).map(async tab=>({tabId:tab.id,frames:await chrome.webNavigation.getAllFrames({tabId:tab.id}).catch(()=>[])}))),
      localStorage:await chrome.storage.local.get(null),userScriptsAvailable:typeof chrome.userScripts!=='undefined',stores};
  })()`, id);
  await save(label+'.json', {at:new Date().toISOString(),session,native,pages,targets});
  console.log(JSON.stringify({label,pages:pages.map(row=>({url:row.target.url,tab:row.observation?.tab,
    status:row.observation?.controls?.filter(node=>/status|result|done|task-id/.test(node.id)).map(({id,text,state})=>({id,text,state}))}))}));
}

async function input(client, session, targetName, selector, file) {
  const {id,target} = await targetSession(client, session, targetName);
  // Observe all trusted input identities, including the exact editor bytes.
  await evaluate(client, `(() => {
    if(globalThis.__programInputs) return;
    globalThis.__programInputs=[];
    for(const type of ['click','input','change','keydown']) document.addEventListener(type,event=>{
      globalThis.__programInputs.push({at:Date.now(),type,id:event.target.id,isTrusted:event.isTrusted,key:event.key,
        sourceUtf8:document.querySelector('#script-source')?.value,
        executionSourceUtf8:document.querySelector('#program-generated-source')?.textContent || document.querySelector('#script-source')?.value,
        params:document.querySelector('#script-params')?.value});
    },true);
  })()`,id);
  const document = await client.send('DOM.getDocument', {}, id);
  const {nodeId} = await client.send('DOM.querySelector',{nodeId:document.root.nodeId,selector},id);
  if (!nodeId) throw Error('Control not observed: '+selector);
  await client.send('DOM.scrollIntoViewIfNeeded',{nodeId},id);
  let rect;
  for(let attempt=0;attempt<8;attempt++) {
    rect = await evaluate(client, `(() => {const n=document.querySelector(${JSON.stringify(selector)});const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,disabled:!!n.disabled,hit:n.contains(document.elementFromPoint(x,y)),height:innerHeight};})()`, id);
    if(rect.hit) break;
    await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:rect.x,y:rect.height/2,deltaX:0,deltaY:rect.y<120?-180:180},id);
    await evaluate(client,'new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))',id);
  }
  if (rect.disabled) throw Error('Control disabled: '+selector);
  if (!rect.hit) throw Error('Control covered by another element: '+selector);
  for (const type of ['mousePressed','mouseReleased']) await client.send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1},id);
  if (file) {
    const source = await readFile(file,'utf8');
    await client.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65,commands:['selectAll']},id);
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65},id);
    const selected = await evaluate(client, `(() => {const n=document.querySelector(${JSON.stringify(selector)});return {focused:document.activeElement===n,start:n.selectionStart,end:n.selectionEnd,length:n.value.length};})()`,id);
    if (!selected.focused || selected.start !== 0 || selected.end !== selected.length) throw Error('Native selectAll did not select the entire input');
    await client.send('Input.insertText',{text:source},id);
    const actual = await evaluate(client, `document.querySelector(${JSON.stringify(selector)}).value`,id);
    if (actual !== source) throw Error('Native input differs from source file');
    await save('input-'+Date.now()+'-'+randomUUID()+'.json',{at:new Date().toISOString(),target,selector,file:path.resolve(file),sourceHash:hash(source),method:'Chrome CDP Input'});
  }
  console.log(JSON.stringify({target:target.targetId,selector,inserted:Boolean(file)}));
}

// A debugger observation pauses only after the real Chrome execute reply arrived.
// It reads that local receipt, resumes immediately and never replaces API results.
async function previewReceipt(session, label) {
  if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw Error('Invalid receipt label');
  const source = await readFile(path.join(session.extension,'sw.js'),'utf8');
  const marker = source.indexOf('Native user script returned no exact document receipt');
  const tail = source.slice(marker,marker+400);
  const match = /const ([A-Za-z_$][\w$]*)=[A-Za-z_$][\w$]*\[0\];if\(/.exec(tail);
  if (!match) throw Error('Current candidate receipt observation point not unique/recognized');
  const column = marker + match.index + match[0].length - 3;
  const socket = new WebSocket(session.endpoint), pending = new Map();
  let sequence = 0, workerId, breakpoint;
  const send = (method, params={}, sessionId=workerId) => new Promise((resolve,reject) => {
    const id=++sequence;pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));
  });
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let complete;
  const finished = new Promise((resolve,reject)=>{complete={resolve,reject};});
  socket.onmessage = async ({data}) => {
    const message=JSON.parse(data);
    const request=pending.get(message.id);
    if(request){pending.delete(message.id);message.error?request.reject(Error(JSON.stringify(message.error))):request.resolve(message.result);return;}
    if(message.method!=='Debugger.paused') return;
    try {
      const reply=await send('Debugger.evaluateOnCallFrame',{callFrameId:message.params.callFrames[0].callFrameId,
        expression:match[1],returnByValue:true,silent:true});
      if(reply.exceptionDetails || !reply.result.value?.documentId) throw Error('Exact native receipt not in observed scope');
      await save(label+'-native-receipt.json',{at:new Date().toISOString(),method:'Debugger read after chrome.userScripts.execute',
        swSha256:hash(source),targetId:session.extensionId,callFrame:message.params.callFrames[0].location,receipt:reply.result.value});
      await send('Debugger.resume'); complete.resolve();
    } catch(error) {await send('Debugger.resume').catch(()=>{});complete.reject(error);}
  };
  const targets=(await send('Target.getTargets',{},null)).targetInfos;
  const sw=targets.find(value=>value.type==='service_worker' && value.url.endsWith('/sw.js'));
  workerId=(await send('Target.attachToTarget',{targetId:sw.targetId,flatten:true},null)).sessionId;
  await send('Debugger.enable');
  breakpoint=(await send('Debugger.setBreakpointByUrl',{url:sw.url,lineNumber:0,columnNumber:column})).breakpointId;
  console.log(JSON.stringify({armed:true,label,column,sw:sw.url}));
  const timeout=setTimeout(()=>complete.reject(Error('Native receipt observation timed out')),90000);
  try {await finished;} finally {clearTimeout(timeout);await send('Debugger.removeBreakpoint',{breakpointId:breakpoint}).catch(()=>{});await send('Debugger.disable').catch(()=>{});socket.close();}
}

const command = process.argv[2];
if (command==='start') await start();
else {
  const session=JSON.parse(await readFile(sessionFile,'utf8'));
  execFileSync('/usr/bin/python3',['/Users/shopme/.codex/skills/chrome-testing-keychain/scripts/check_instance.py',path.join(directory,'launcher-program-r3.json')],{stdio:'pipe'});
  const current=await packageFingerprint(session.extension);
  if(JSON.stringify(current)!==JSON.stringify(session.package))throw Error('Loaded candidate directory changed');
  if(command==='preview-receipt') {await previewReceipt(session,process.argv[3]);process.exit(0);}
  const client=await connect(session.endpoint);
  try {
    if(command==='offline') {
      const {target,id}=await targetSession(client,session,'sw');
      await client.send('Network.enable',{},id);
      const conditions={offline:true,latency:0,downloadThroughput:0,uploadThroughput:0};
      const reply=await client.send('Network.emulateNetworkConditions',conditions,id);
      await save('offline-worker.json',{at:new Date().toISOString(),target,conditions,reply,scope:'Extension Service Worker; local HTTP page remains online in its separate target'});
      console.log(JSON.stringify({offline:true,target:target.targetId}));
      await new Promise(resolve=>{process.on('SIGTERM',resolve);process.on('SIGINT',resolve);});
      await client.send('Network.emulateNetworkConditions',{...conditions,offline:false,downloadThroughput:-1,uploadThroughput:-1},id);
      await save('offline-restored.json',{at:new Date().toISOString(),target});
    }
    else if(command==='observe') await observe(client,session,process.argv[3]);
    else if(command==='input') await input(client,session,...process.argv.slice(3));
    else if(command==='navigate') {const {id}=await targetSession(client,session,process.argv[3]);await client.send('Page.navigate',{url:process.argv[4]},id);}
    else if(command==='activate') {const {target}=await targetSession(client,session,process.argv[3]);await client.send('Target.activateTarget',{targetId:target.targetId});}
    else if(command==='key') {const {id}=await targetSession(client,session,process.argv[3]);const key=process.argv[4];for(const type of ['keyDown','keyUp']) await client.send('Input.dispatchKeyEvent',{type,key,code:key},id);}
    else if(command==='screenshot') {if(!/^[a-zA-Z0-9_-]+$/.test(process.argv[4]))throw Error('Invalid screenshot label');const {id}=await targetSession(client,session,process.argv[3]);const {data}=await client.send('Page.captureScreenshot',{},id);await writeFile(path.join(directory,process.argv[4]+'.png'),Buffer.from(data,'base64'),{flag:'wx'});}
    else throw Error('Commands: start, observe, input, navigate, activate, key, screenshot');
  } finally {client.close();}
}
