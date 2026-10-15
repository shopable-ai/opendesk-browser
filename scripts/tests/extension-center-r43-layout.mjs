#!/usr/bin/env node
// SOURCE_UI_SIMULATION_CHROME only. No extension, tool code, Native or GUI execution.
// Run from repository root: node scripts/tests/extension-center-r43-layout.mjs
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(import.meta.dirname,'../..');
const base=join(root,'docs/framework/workstreams/evidence/extension-center-r43-01a13e87/layout');
const run=join(base,new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(run,{recursive:true});
const receipt={owner:'independent-r43-layout-executor',status:'IN_PROGRESS',started:new Date().toISOString(),
  writes:['scripts/tests/extension-center-r43-layout.mjs',base],resources:'owned headless CFT, ephemeral HTTP/CDP ports, temporary profile; no shared dist writes',
  reuse:'AFFECTED_INPUTS: R4.3 accent-ink correction; independent layout matrix requested',evidenceLevel:'SOURCE_UI_SIMULATION_CHROME'};
await writeFile(join(run,'ownership.json'),JSON.stringify(receipt,null,2));
const files=new Map(),sha=b=>createHash('sha256').update(b).digest('hex');
async function freeze(path){
  if(files.has(path))return;
  const bytes=await readFile(join(root,path));files.set(path,bytes);
  if(path.endsWith('.js'))for(const m of bytes.toString().matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
    if(m[1].startsWith('.'))await freeze(resolve(root,dirname(path),m[1]).slice(root.length+1));
  }
}
let chrome,server,socket,profile;const pending=new Map();let seq=0;
const report={...receipt,limitations:['Simulated storage/client; real createExtensionCenter and CSS on HTTP, not an installed extension.',
  'CSS viewport/media emulation, not native Side Panel physical width or browser zoom.',
  'No tool execution, installation, permissions, Native, production, F3 or ZIP claim.',
  'At <=240px the real CSS intentionally uses two description lines; single-line ellipsis applies to titles and ordinary-width descriptions.'],samples:[],errors:[]};
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
function cdp(method,params={}){return new Promise((ok,fail)=>{
  const id=++seq,t=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},15000);
  pending.set(id,{ok:r=>{clearTimeout(t);ok(r);},fail:e=>{clearTimeout(t);fail(e);}});
  socket.send(JSON.stringify({id,method,params}));
});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
try{
  await freeze('scripts/tests/extension-center-r43-layout.mjs');
  await freeze('src/ui/extension-center.js');
  for(const p of ['src/ui/tool.html','src/ui/design-tokens.css','src/ui/design-system.css','src/ui/extension-center.css'])await freeze(p);
  const source=files.get('src/ui/tool.html').toString();
  const start=source.indexOf('<section id="extension-center"');
  const end=source.indexOf('<div class="sidebar-tools-head',start);
  if(start<0||end<0)throw Error('Actual Extension Center markup boundaries missing');
  const section=source.slice(start,end).trim();
  const bootstrap=`import {createExtensionCenter} from '/src/ui/extension-center.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage} from '/src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE} from '/src/ui/sidebar-tools/lifecycle.js';
const names=['超长中文扩展标题用于验证完整行主按钮与截断布局'.repeat(3),
  'Extremely long English extension title with repeated words '.repeat(3),
  'https://example.com/'+ 'very-long-unbroken-url-segment/'.repeat(7),
  '混合 Mixed 文本 Example 123 https://example.com/path/'.repeat(3)];
const installed=names.map((title,i)=>validateSidebarToolPackage({format:'opendesk.sidebar-tool.v1',id:'layout-fixture-'+i,
  version:'1.0.0',title:title.slice(0,80),description:names[(i+1)%4].slice(0,300),capabilities:[],html:'<main>Inert fixture</main>',css:'',js:'void 0;'}));
window.fixtureMutations=[];
const deny=(...args)=>{window.fixtureMutations.push(args);throw Error('Layout fixture forbids side effects');};
const api={runtime:{getURL:p=>location.origin+'/'+p},tabs:{create:deny},storage:{local:{
  get:async()=>({[SIDEBAR_TOOL_STORE]:installed,[SIDEBAR_TOOL_ENABLE_STORE]:{'layout-fixture-1':false}}),set:deny},
  onChanged:{addListener(){},removeListener(){}}}};
window.center=createExtensionCenter({api,doc:document,client:{request:async method=>{
  if(method!=='listPagePrograms')return deny(method);return {catalog:[]};},subscribeConnection:()=>()=>{}},
  sidebarTools:{openTool:deny,openSettings:deny,openOfficialReview:deny,openImport:deny},taskWorkbench:{}});
await window.center.refresh();
// HTTP cannot attest chrome-extension resource provenance. The real catalog loader
// intentionally fails closed; this test measures installed mock rows only.
window.fixtureReady=true;`;
  const html='<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">'+
    ['design-tokens','design-system','extension-center'].map(s=>'<link rel="stylesheet" href="/src/ui/'+s+'.css">').join('')+
    '<style>#workspace-content{overflow:auto;min-height:0;padding:10px var(--od-page-gutter)}</style><main id="workspace-content">'+section+'</main><script type="module" src="/fixture.js"></script>';
  report.fixture={htmlSha256:sha(html),bootstrapSha256:sha(bootstrap),kind:'actual source shell section + real createExtensionCenter + validated inert mock packages',
    expectedCatalogState:'fail-closed HTTP provenance error, no official rows'};
  await writeFile(join(run,'fixture.html'),html);await writeFile(join(run,'fixture.js'),bootstrap);
  server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname.slice(1);
    const body=path===''?Buffer.from(html):path==='fixture.js'?Buffer.from(bootstrap):files.get(path);
    res.writeHead(body?200:404,{'Content-Type':path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'text/html; charset=utf-8'}).end(body||'Not found');
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  profile=await mkdtemp(join(tmpdir(),'extension-center-r43-layout-'));
  chrome=spawn(process.env.CHROME_BIN||join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),[
    '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--use-mock-keychain','--password-store=basic',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
  let stderr='';chrome.stderr.on('data',b=>{stderr+=b;});chrome.on('error',e=>report.errors.push(String(e)));
  receipt.profile=profile;receipt.chromePid=chrome.pid;receipt.httpPort=server.address().port;
  await writeFile(join(run,'ownership.json'),JSON.stringify(receipt,null,2));
  let debugPort;
  for(let i=0;i<100;i++){try{debugPort=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(debugPort)break;}catch{}
    if(chrome.exitCode!==null)throw Error('Owned CFT exited '+chrome.exitCode);await sleep(100);}
  if(!debugPort)throw Error('Owned CDP port missing');receipt.cdpPort=debugPort;
  const tabs=await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();
  socket=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  report.browserExceptions=[];
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')report.browserExceptions.push(m.params);
    const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.fail(Error(m.error.message)):p.ok(m.result);});
  await cdp('Page.enable');await cdp('Runtime.enable');
  report.browser=await cdp('Browser.getVersion');
  await cdp('Page.navigate',{url:'http://127.0.0.1:'+receipt.httpPort+'/'});
  let ready=false;for(let i=0;i<100;i++){if(await evaluate('!!window.fixtureReady')){ready=true;break;}await sleep(100);}
  if(!ready)throw Error('Source fixture not ready: '+await evaluate('document.body.innerText'));
  for(const coarse of [false,true])for(const theme of ['light','dark'])for(const width of [300,320,360,420,520,240,180]){
    await cdp('Emulation.setTouchEmulationEnabled',{enabled:coarse,maxTouchPoints:1});
    await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:width-1,y:899});
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const sample=await evaluate(`(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
      const color=s=>(s.match(/[\\d.]+/g)||[]).map(Number);
      const rgb=(el,prop)=>{let owner=el,c=color(getComputedStyle(el)[prop]);
        if(prop==='backgroundColor')while(c.length===4&&c[3]===0&&owner.parentElement){owner=owner.parentElement;c=color(getComputedStyle(owner).backgroundColor);}
        let factor=1;for(let n=owner;n;n=n.parentElement){const f=getComputedStyle(n).filter.match(/brightness\\(([\\d.]+)\\)/);if(f)factor*=Number(f[1]);}
        return c.slice(0,3).map(x=>Math.min(255,x*factor));};
      const lum=c=>c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
      const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
      window.layoutContrast=el=>({text:contrast(rgb(el,'color'),rgb(el,'backgroundColor')),foreground:rgb(el,'color'),background:rgb(el,'backgroundColor')});
      const rows=[...document.querySelectorAll('.ec-row')].map(row=>{
        const main=row.querySelector('.ec-row-main'),action=row.querySelector('.ec-action'),more=row.querySelector('.ec-row-more');
        const buttons=[main,action,more];const name=row.querySelector('.ec-name-text'),desc=row.querySelector('.ec-description');
        const a=rect(main),b=rect(action),c=rect(more),r=rect(row);
        const hits=buttons.map(el=>{const b=rect(el),x=b.x+b.width/2,y=b.y+b.height/2;return el.contains(document.elementFromPoint(x,y));});
        const text=[name,desc].map(el=>({rect:rect(el),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,whiteSpace:getComputedStyle(el).whiteSpace,
          textOverflow:getComputedStyle(el).textOverflow,lineClamp:getComputedStyle(el).webkitLineClamp,contrast:window.layoutContrast(el).text}));
        return {key:row.dataset.extensionId,rect:r,minHeight:parseFloat(getComputedStyle(row).minHeight),buttons:buttons.map(rect),hits,
          overlap:a.x<b.right&&a.right>b.x+.5&&a.y<b.bottom&&a.bottom>b.y+.5||b.right>c.x+.5,
          text,actionContrast:window.layoutContrast(action).text,iconContrast:window.layoutContrast(row.querySelector('.ec-glyph')).text};
      });
      const outside=[...document.querySelectorAll('#extension-center *')].filter(visible).filter(e=>{const r=rect(e);return r.x<-.5||r.right>innerWidth+.5;}).map(e=>e.className||e.id);
      return {width:innerWidth,theme:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light',coarse:matchMedia('(pointer:coarse)').matches,
        overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('#workspace-content').scrollWidth>innerWidth,outside,rows,
        status:document.querySelector('#extension-center-status').textContent};
    })()`);
    sample.expected={width,theme,coarse,minHeight:width<=240?82:width<=330?68:72};sample.failures=[];
    const check=(condition,why)=>{if(!condition)sample.failures.push(why);};
    check(sample.width===width&&sample.theme===theme&&sample.coarse===coarse,'Emulation mismatch');
    check(sample.rows.length===4,'Expected four validated fixture rows');
    check(!sample.overflow&&!sample.outside.length,'Horizontal overflow: '+sample.outside.join(','));
    for(const row of sample.rows){
      check(row.minHeight===sample.expected.minHeight&&row.rect.height>=row.minHeight,'Row minimum height '+row.key);
      check(!row.overlap&&row.hits.every(Boolean),'Overlapping/obscured buttons '+row.key);
      check(row.buttons.every(b=>b.height>0&&b.width>0),'Invisible button '+row.key);
      if(coarse)check(row.buttons.every(b=>b.height>=44&&b.width>=44),'Coarse target below 44px '+row.key);
      check(row.text[0].whiteSpace==='nowrap'&&row.text[0].textOverflow==='ellipsis','Title ellipsis '+row.key);
      check(width<=240?row.text[1].lineClamp==='2':row.text[1].whiteSpace==='nowrap'&&row.text[1].textOverflow==='ellipsis','Description truncation '+row.key);
      check(row.text.every(t=>t.contrast>=4.5)&&row.actionContrast>=4.5,'Text contrast below 4.5 '+row.key);
      check(row.iconContrast>=3,'Icon contrast below 3 '+row.key);
    }
    // Real CDP key input establishes keyboard modality; no synthetic DOM events.
    await evaluate("document.querySelector('.ec-row-main').focus({preventScroll:true})");
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    sample.focus=await evaluate(`(()=>{const e=document.activeElement,s=getComputedStyle(e),v=document.createElement('span');v.style.color=s.outlineColor;e.append(v);
      const color=layoutContrast(v).text;v.remove();return {className:e.className,visible:e.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:parseFloat(s.outlineWidth),contrast:color};})()`);
    check(sample.focus.visible&&sample.focus.outlineWidth>=2&&sample.focus.outlineStyle!=='none'&&sample.focus.contrast>=3,'Keyboard focus visibility/contrast');
    sample.hover=[];
    for(const selector of ['.ec-row-main','.ec-action','.ec-row-more']){
      const before=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
      await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x+before.width/2,y:before.y+before.height/2});
      const hover=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,active:e.matches(':hover'),contrast:layoutContrast(e).text,
        childText:[...e.querySelectorAll('.ec-name-text,.ec-description,.ec-type')].map(n=>layoutContrast(n).text),
        icons:[...e.querySelectorAll('.ec-glyph')].map(n=>layoutContrast(n).text)};})()`);
      sample.hover.push({selector,before,after:hover});
      check(Object.keys(before).every(k=>Math.abs(before[k]-hover[k])<.1),'Hover layout movement '+selector);
      check(hover.active&&hover.contrast>=4.5,'Hover text contrast '+selector);
      check(hover.childText.every(c=>c>=4.5)&&hover.icons.every(c=>c>=3),'Hover child text/icon contrast '+selector);
    }
    if(!coarse&&[180,320,520].includes(width)){
      await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:width-1,y:899});
      const png=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      const name=theme+'-'+width+'.png';await writeFile(join(run,name),Buffer.from(png.data,'base64'));sample.png=name;
    }
    report.samples.push(sample);
    await writeFile(join(run,'progress.json'),JSON.stringify({samples:report.samples.length,last:{width,theme,coarse},failures:sample.failures},null,2));
  }
  report.mutations=await evaluate('window.fixtureMutations');
  if(report.mutations.length)report.errors.push('Unexpected fixture side effects');
  if(report.browserExceptions.length)report.errors.push('Unexpected browser exceptions');
  await evaluate('window.center.dispose()');
  await writeFile(join(run,'chrome.stderr.log'),stderr);
}catch(e){report.errors.push(String(e.stack||e));}
finally{
  socket?.close();for(const p of pending.values())p.fail(Error('Driver cleanup'));pending.clear();
  if(chrome?.pid&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(ok=>chrome.once('exit',ok)),sleep(3000)]);
    if(chrome.exitCode===null){chrome.kill('SIGKILL');await new Promise(ok=>chrome.once('exit',ok));}}
  if(server)await new Promise(ok=>server.close(ok));
  if(profile)await rm(profile,{recursive:true,force:true});
  report.sourceBinding=[];
  for(const [path,bytes] of files){let current;try{current=sha(await readFile(join(root,path)));}catch{current=null;}
    report.sourceBinding.push({path,sha256:sha(bytes),bytes:bytes.length,currentSha256:current});
    if(current!==sha(bytes))report.errors.push('Relevant source drift: '+path);
  }
  report.finished=new Date().toISOString();report.status=report.errors.length||report.samples.length!==28||report.samples.some(s=>s.failures.length)?'FAIL':'PASS';
  report.cleanup={chromePid:chrome?.pid,exitCode:chrome?.exitCode,signalCode:chrome?.signalCode,profileRemoved:!!profile,httpServerClosed:!server?.listening,
    release:'released',onlyOwnedBrowserClosed:true};
  await writeFile(join(run,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(run,'cleanup-receipt.json'),JSON.stringify(report.cleanup,null,2)+'\n');
  await writeFile(join(run,'ownership.json'),JSON.stringify({...receipt,status:report.status,release:'released',finished:report.finished},null,2)+'\n');
  console.log(JSON.stringify({status:report.status,report:join(run,'report.json'),samples:report.samples.length,errors:report.errors,
    failures:report.samples.filter(s=>s.failures.length).map(s=>({expected:s.expected,failures:s.failures}))},null,2));
  if(report.status!=='PASS')process.exitCode=1;
}
