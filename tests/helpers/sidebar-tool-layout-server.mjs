// Offline layout fixture. Never connects to Chrome, Native, or a real task runner.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT} from '../../src/ui/sidebar-tools/package.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const artifactRoot=path.join(root,'artifacts/sidebar-tool-layout');
const baselinePaths=new Set(['src/ui/sidebar-tools.js','src/ui/tool-shell.css','src/sidebar-tools/bridge.js','src/sidebar-tools/sandbox.html']);
const sha256=value=>createHash('sha256').update(value).digest('hex');

// This is added as a separate script, never spliced into the production bridge.
function sandboxDiagnostics(){
  addEventListener('error',event=>parent.postMessage({type:'sidebar-layout:error',message:event.message,stack:event.error?.stack},'*'));
  const measure=node=>{
    if(!node)return null;
    const r=node.getBoundingClientRect(),s=getComputedStyle(node);
    return {tag:node.tagName,id:node.id,className:String(node.className),rect:{x:r.x,y:r.y,width:r.width,height:r.height},
      clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop,
      clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,
      display:s.display,height:s.height,minHeight:s.minHeight,overflowY:s.overflowY,flex:s.flex};
  };
  addEventListener('message',event=>{
    if(event.source!==parent||event.data?.type!=='sidebar-layout:diagnose')return;
    try{
    const mounts=[...document.querySelectorAll('#tool-root,#tool-app,#root,[data-reactroot],.webflow-app')];
    const scrollables=[...document.querySelectorAll('body *')].filter(n=>
      n.scrollHeight>n.clientHeight+1||/auto|scroll/.test(getComputedStyle(n).overflowY)).slice(0,100);
    parent.postMessage({type:'sidebar-layout:diagnostics',requestId:event.data.requestId,
      data:{url:location.href,origin:location.origin,viewport:{width:innerWidth,height:innerHeight},
        html:measure(document.documentElement),body:measure(document.body),root:measure(document.getElementById('tool-root')),
        mounts:mounts.map(measure),businessScroll:scrollables.map(measure),
        hint:document.getElementById('tool-root')?.style.getPropertyValue('--opendesk-host-available-height'),
        text:document.getElementById('tool-root')?.innerText.slice(0,3000)}},'*');
    }catch(error){parent.postMessage({type:'sidebar-layout:diagnostics',requestId:event.data.requestId,data:{error:String(error.stack)}},'*');}
  });
}

async function browserFixture(){
  const {tools,gaps,mode}=await (await fetch('/packages.json')).json();
  const calls=[],errors=[];let app,host,view,surface=new URL(location.href).searchParams.get('surface')==='page'?'page':'sidebar',activeId=null;
  const store={[SIDEBAR_TOOL_STORE]:tools,[SIDEBAR_TOOL_ENABLE_STORE]:Object.fromEntries(tools.map(t=>[t.id,true]))};
  const fail=(operation,payload)=>{calls.push({operation,payload,blocked:true,time:Date.now()});throw Object.assign(Error('Fixture blocks '+operation),{code:'E_FIXTURE_READ_ONLY'});};
  const taskRequest=async(operation,payload)=>{
    if(operation!=='tasks.read')return fail(operation,payload);
    calls.push({operation,payload,time:Date.now()});
    if(payload.taskId){const pin=tools.flatMap(t=>t.delegatedTasks||[]).find(t=>t.taskId===payload.taskId);
      if(!pin)throw Error('Fixture task not found');
      return {task:{...pin,installationId:'00000000-0000-4000-8000-000000000001',generation:1}};}
    return {clientRequestId:payload.clientRequestId,state:'idle',runId:null,resultId:null,result:null,value:null};
  };
  globalThis.__sidebarLayoutServices={taskRequest};
  const listeners=new Set();
  const local={async get(keys){if(keys==null)return structuredClone(store);const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);
    return Object.fromEntries(names.map(key=>[key,structuredClone(store[key]??(typeof keys==='object'&&!Array.isArray(keys)?keys[key]:undefined))]));},
    async set(values){const changes={};for(const [key,value] of Object.entries(values)){changes[key]={oldValue:structuredClone(store[key]),newValue:structuredClone(value)};store[key]=structuredClone(value);}
      for(const fn of listeners)fn(changes,'local');},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete store[key];}};
  const page={status:'available',tabId:52,windowId:1,frameId:0,documentId:'layout-fixture-document',url:'https://chatgpt.com/c/layout-fixture',title:'Layout fixture chat',origin:'https://chatgpt.com'};
  const currentPageTarget={snapshot:page,capture:()=>({...page}),async revalidate(){return true;},async refresh(){return page;},subscribe(){return ()=>{};}};
  const api={runtime:{getURL:p=>location.origin+'/'+p,async sendMessage(message){return fail('runtime.sendMessage',message);}},
    storage:{local,session:{async get(){return {};},async set(){},async remove(){}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const runHost={start:payload=>fail('tasks.start',payload),stop:payload=>fail('tasks.stop',payload)};
  const taskWorkbench={setToolActive(){},focusInstalledTask:id=>fail('tasks.open',{id})};
  const webflowAuto={
    async readAutoSettings(){return {enabled:false,epoch:1,tasks:[],grants:[]};},
    async readBridgeState(){return {source:{documentId:page.documentId,url:page.url},
      listener:{state:'ready',reason:'Layout fixture only'},work:{state:'idle'},session:null,receipt:null};},
    subscribeBridgeContext(){return ()=>{};},
    setAutoEnabled:value=>fail('auto.enable',value),prepareAutoGrant:value=>fail('auto.prepare',value),
    approveAutoTask:value=>fail('auto.approve',value),revokeAutoTask:value=>fail('auto.revoke',value),
    controlBridge:value=>fail('bridge.control',value),refreshBridge:value=>fail('bridge.refresh',value)
  };
  function rows(){app.renderRows({rows:tools.map(tool=>({key:'app:'+tool.id,title:tool.title,kind:'app',type:'应用',installed:true,
    description:tool.description,primaryAction:'打开'})),busy:false,pendingKey:null,
    onOpenRow:row=>f.open(typeof row==='string'?row.replace(/^app:/,''):row.key.replace(/^app:/,'')),
    onMore:row=>f.open(typeof row==='string'?row.replace(/^app:/,''):row.key.replace(/^app:/,''))});}
  async function mount(){
    view=createSidebarToolsView();app=mountSidebarApp(document,{toolView:view,webflowAuto,onNavigate:tab=>app.renderNavigation(tab)});
    host=createSidebarTools({api,doc:document,view,taskWorkbench,currentPageTarget,runHost,
      foundationClient:{request:(operation,payload)=>fail(operation,payload)},fetcher:fetch,displaySurface:surface});
    await host.ready;host.setVisible(true);rows();
  }
  const pending=new Map();
  addEventListener('message',event=>{
    if(event.source!==document.querySelector('#sidebar-tool-frame iframe')?.contentWindow)return;
    if(event.data?.type==='sidebar-layout:error')errors.push(event.data);
    if(event.data?.kind==='request')calls.push({operation:event.data.operation,payload:event.data.payload,transport:'bridge',time:Date.now()});
    if(event.data?.type==='sidebar-layout:diagnostics')pending.get(event.data.requestId)?.(event.data.data);
  });
  const aliases={html:'runtime-globals-demo',vue:'vue-notes-starter',react:'react-notes-starter','minimal-html-starter':'runtime-globals-demo','vue-starter':'vue-notes-starter','react-starter':'react-notes-starter'};
  const f={tools:tools.map(({id,title})=>({id,title})),gaps,mode,calls,errors,store,currentPageTarget,
    get app(){return app;},get host(){return host;},get view(){return view;},get surface(){return surface;},get activeId(){return activeId;},
    async open(id){id=aliases[id]||id;if(!tools.some(t=>t.id===id))throw Error('Unavailable tool '+id+': '+JSON.stringify(gaps));activeId=id;return host.openTool(id);},
    close(){const result=host.closeTool();if(result!==false)activeId=null;return result;},
    setControlsHeight(px){if(!Number.isFinite(px)||px<0)throw Error('Expected nonnegative height');document.getElementById('fixture-controls').style.height=px+'px';},
    async setSurface(next){if(!['page','sidebar'].includes(next))throw Error('Invalid surface');if(surface===next)return;
      const reopen=activeId;host.dispose();app.dispose();view.dispose();document.getElementById('opendesk-react-app').replaceChildren();
      surface=next;document.documentElement.dataset.opendeskSurface=next==='page'?'tool-page':'sidebar';await mount();if(reopen)await f.open(reopen);},
    inspect(){return f.diagnostics();},
    diagnostics(){const iframe=document.querySelector('#sidebar-tool-frame iframe');if(!iframe)return Promise.reject(Error('No open sandbox'));
      const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(requestId);reject(Error('Sandbox diagnostics timeout'));},5000);
        pending.set(requestId,data=>{clearTimeout(timeout);pending.delete(requestId);resolve({surface,frame:{width:iframe.getBoundingClientRect().width,height:iframe.getBoundingClientRect().height},...data});});
        iframe.contentWindow.postMessage({type:'sidebar-layout:diagnose',requestId},'*');});},
    requestTask:taskRequest,dispose(){host.dispose();app.dispose();view.dispose();}};
  addEventListener('error',event=>errors.push(String(event.error?.stack||event.message)));
  addEventListener('unhandledrejection',event=>errors.push(String(event.reason?.stack||event.reason)));
  await mount();window.fixture=f;
  const controls=document.getElementById('fixture-controls');
  for(const tool of tools){const button=document.createElement('button');button.textContent=tool.title;button.onclick=()=>f.open(tool.id);controls.append(button);}
  const close=document.createElement('button');close.textContent='关闭工具';close.onclick=()=>f.close();controls.append(close);
  const select=document.createElement('select');for(const value of ['sidebar','page'])select.add(new Option(value,value));select.value=surface;select.onchange=()=>f.setSurface(select.value);controls.append(select);
  const height=document.createElement('input');height.type='number';height.min='0';height.value='64';height.title='外层控件高度 px';height.onchange=()=>f.setControlsHeight(Number(height.value));controls.append(height);
  if(gaps.length){const warning=document.createElement('span');warning.textContent='编译缺口: '+gaps.map(g=>g.project).join(', ');controls.append(warning);}
}

/** Start an independently owned localhost server. close() is idempotent. */
export async function startSidebarToolLayoutServer({baseline=false,port=0}={}){
  const mode=baseline?'baseline':'freshsource',runId=mode+'-'+randomUUID();
  const outputDir=path.join(artifactRoot,runId);await mkdir(outputDir,{recursive:true});
  const inputs={},gaps=[];
  async function input(relative){
    const selected=baseline&&baselinePaths.has(relative)?'artifacts/sidebar-tool-layout/baseline/'+relative:relative;
    const bytes=await readFile(path.join(root,selected));inputs[relative]={source:selected,bytes:bytes.length,sha256:sha256(bytes)};return bytes.toString('utf8');
  }
  // Preflight every requested override: missing baseline bytes must fail closed.
  for(const name of baselinePaths)await input(name);
  const tools=[];
  for(const project of ['projects/webflow',...['minimal-html-starter','vue-starter','react-starter'].map(n=>'examples/sidebar-tools/'+n)]){
    const meta=JSON.parse(await input(project+'/tool.config.json'));
    let pkg;
    try{pkg=await createSidebarToolPackage(path.join(root,project));}
    catch(error){
      if(!['vue-notes-starter','react-notes-starter'].includes(meta.id))throw error;
      try{
        async function sources(relative){
          for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){
            const name=relative+'/'+entry.name;if(entry.isDirectory())await sources(name);else if(entry.isFile())await input(name);
          }
        }
        await sources(project+'/src');
        for(const name of ['package.json','package-lock.json','vite.config.mjs'])await input(project+'/'+name);
        const {build:compile}=await import('vite');
        const vue=meta.id==='vue-notes-starter';
        const projectRequire=createRequire(path.join(root,project,'package.json'));
        const plugins=vue?[(await import(pathToFileURL(projectRequire.resolve('@vitejs/plugin-vue')).href)).default()]:[];
        const result=await compile({configFile:false,root:path.join(root,project),plugins,logLevel:'silent',
          define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{write:false,minify:true,cssCodeSplit:false,
            lib:{entry:path.join(root,project,'src',vue?'main.js':'main.jsx'),name:'OpenDeskToolUI',formats:['iife']}}});
        const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>r.output);
        pkg=validateSidebarToolPackage({format:SIDEBAR_TOOL_FORMAT,id:meta.id,version:meta.version,title:meta.title,
          description:meta.description,capabilities:meta.capabilities,html:await input(project+'/'+meta.files.html),
          css:outputs.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css')).map(o=>o.source).join('\n'),
          js:outputs.filter(o=>o.type==='chunk').map(o=>o.code).join('\n')});
      }catch(compilation){gaps.push({project,packageError:error.message,compilationError:compilation.message});continue;}
    }
    // Package digest covers the actual executable input, including compiled resources.
    inputs['package:'+project]={sha256:sha256(JSON.stringify(pkg)),bytes:Buffer.byteLength(JSON.stringify(pkg))};
    for(const name of Object.values(meta.files).flat().filter(v=>typeof v==='string'&&!v.startsWith('@'))){
      try{await input(project+'/'+name);}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    tools.push(pkg);
  }
  const loader={name:'layout-fixture-inputs',setup(builder){
    builder.onLoad({filter:/(?:\.(?:js|jsx|ts|tsx|css)|\?raw)$/},async args=>{
      const filename=args.path.replace(/\?raw$/,''),relative=path.relative(root,filename).split(path.sep).join('/');
      if(relative==='src/platform/host/task-delegation.js')return {contents:`export function createTaskDelegationHost(){return {request:(operation,payload)=>globalThis.__sidebarLayoutServices.taskRequest(operation,payload),dispose(){}}}`,loader:'js'};
      if(relative.startsWith('node_modules/')||relative.startsWith('..'))return;
      const contents=await input(relative);
      return {contents,loader:args.path.endsWith('?raw')?'text':path.extname(filename).slice(1),resolveDir:path.dirname(filename)};
    });
    builder.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path)}));
  }};
  const app=await build({stdin:{contents:`import {mountSidebarApp} from './src/ui/react/main.tsx';
    import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
    import {createSidebarTools} from './src/ui/sidebar-tools.js';
    import {SIDEBAR_TOOL_STORE} from './src/ui/sidebar-tools/package.js';
    import {SIDEBAR_TOOL_ENABLE_STORE} from './src/ui/sidebar-tools/lifecycle.js';
    (${browserFixture.toString()})().catch(error=>{window.fixtureError=String(error.stack);console.error(error);});`,resolveDir:root,loader:'tsx'},
    define:{'process.env.NODE_ENV':JSON.stringify('production')},alias:{'@opendesk/ui':path.join(root,'src/ui/react/components/ui/button.tsx')},
    bundle:true,write:false,outfile:'app.js',format:'esm',platform:'browser',target:'es2022',logLevel:'silent',plugins:[loader]});
  const bridge=await build({stdin:{contents:`import {initSidebarToolSandbox} from './src/sidebar-tools/bridge.js';initSidebarToolSandbox();`,resolveDir:root},
    bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',logLevel:'silent',plugins:[loader]});
  // Serve both actual fixed runtime dependencies requested by the bridge.
  const shared=await build({entryPoints:[path.join(root,'src/entrypoints/sidebar-shared-ui.js')],
    bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',logLevel:'silent',
    define:{'process.env.NODE_ENV':JSON.stringify('production')},plugins:[{name:'fixture-fixed-runtime-entry',setup(builder){
      builder.onResolve({filter:/^wxt\/utils\/define-unlisted-script$/},()=>({path:'wxt-entry',namespace:'fixture-runtime'}));
      builder.onResolve({filter:/^react(?:\/jsx-runtime)?$/},()=>({path:'pinned-react',namespace:'fixture-runtime'}));
      builder.onLoad({filter:/.*/,namespace:'fixture-runtime'},args=>({contents:args.path==='wxt-entry'
        ?'export function defineUnlistedScript(callback){callback();}'
        :'module.exports=globalThis.OpenDeskPageReact;',loader:'js'}));
    }},loader]});
  const reactRuntime=await input('src/libs/page-frameworks/react-19.2.0.js');
  const css=(await Promise.all(['design-tokens.css','design-system.css','tool-shell.css','extension-center.css'].map(n=>input('src/ui/'+n)))).join('\n')+
    app.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
  const sandbox=(await input('src/sidebar-tools/sandbox.html')).replace('<script src="bridge.js">','<script src="/diagnostics.js" crossorigin="anonymous"></script><script src="bridge.js" crossorigin="anonymous">');
  const html='<!doctype html><html lang="zh-CN" data-opendesk-tab="tools"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>#fixture-controls{flex:0 0 auto;box-sizing:border-box;height:64px;overflow:auto;background:#eee}#fixture-controls input{width:70px}</style></head><body><div id="fixture-controls" aria-label="Fixture controls"></div><div id="opendesk-react-app" class="opendesk-react-app"></div><script type="module" src="/app.js"></script></body></html>';
  const manifest={mode,inputs,gaps,tools:tools.map(t=>({id:t.id,title:t.title,version:t.version}))};
  const routes=new Map([
    ['/', ['text/html',html]],['/app.js',['text/javascript',app.outputFiles.find(f=>f.path.endsWith('.js')).text]],
    ['/style.css',['text/css',css]],['/sidebar-tools/sandbox.html',['text/html',sandbox]],
    ['/sidebar-tools/bridge.js',['text/javascript',bridge.outputFiles[0].text]],
    ['/libs/page-frameworks/react-19.2.0.js',['text/javascript',reactRuntime]],
    ['/sidebar-shared-ui.js',['text/javascript',shared.outputFiles[0].text]],
    ['/diagnostics.js',['text/javascript',`(${sandboxDiagnostics.toString()})();`]],
    ['/packages.json',['application/json',JSON.stringify({tools,gaps,mode})]],['/inputs.json',['application/json',JSON.stringify(manifest,null,2)]],
  ]);
  for(const [route,[,body]] of routes){const destination=path.join(outputDir,route==='/'?'index.html':route.slice(1));await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,body);}
  const server=createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const entry=routes.get(pathname)||(pathname.endsWith('/catalog.json')?['application/json',JSON.stringify({schema:'opendesk.official-tools.releases.v1',sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[]})]:null);
    res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');
    if(pathname==='/sidebar-tools/sandbox.html')res.setHeader('Content-Security-Policy',"sandbox allow-scripts; script-src 'self' blob:");
    res.writeHead(entry?200:404,{'Content-Type':(entry?.[0]||'text/plain')+'; charset=utf-8'});res.end(entry?.[1]||'Fixture route not found');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const actualPort=server.address().port,url=`http://127.0.0.1:${actualPort}/`;
  let closing;
  return {server,port:actualPort,url,mode,inputs,gaps,tools:manifest.tools,outputDir,
    close(){return closing??=(new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();}));}};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--baseline'))throw Error('Usage: node tests/helpers/sidebar-tool-layout-server.mjs [--baseline]');
  const fixture=await startSidebarToolLayoutServer({baseline:args.includes('--baseline')});
  console.log(JSON.stringify({port:fixture.port,url:fixture.url,mode:fixture.mode,outputDir:fixture.outputDir,inputs:fixture.inputs,gaps:fixture.gaps},null,2));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void fixture.close().catch(error=>{console.error(error);process.exitCode=1;});});
}
