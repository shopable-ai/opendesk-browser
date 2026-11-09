// Test-only localhost fixture. No Chrome connection, real Native, task runner,
// installed package writes, dist output, or browser launch. UI/protocol are source.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build,version as esbuildVersion} from 'esbuild';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {validateSidebarToolPackage,SIDEBAR_TOOL_FORMAT} from '../../src/ui/sidebar-tools/package.js';
import {TRUSTED_AI_PROXY_VERSION} from '../../projects/ai-proxy/trusted/admission.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha256=value=>createHash('sha256').update(value).digest('hex');

// The layout helper exports only its complete server, which builds a different
// tool selection. Keep it untouched; reuse its exported production dependencies
// and offline wiring pattern without importing/running its launcher.
function sandboxDiagnostics(){
  addEventListener('unhandledrejection',event=>parent.postMessage({type:'shared-confirmation:error',
    message:String(event.reason?.stack||event.reason)},'*'));
  addEventListener('error',event=>parent.postMessage({type:'shared-confirmation:error',message:event.message,stack:event.error?.stack},'*'));
  const measure=node=>{
    if(!node)return null;
    const r=node.getBoundingClientRect(),s=getComputedStyle(node);
    return {tag:node.tagName,id:node.id,className:String(node.className),rect:{x:r.x,y:r.y,width:r.width,height:r.height},
      clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop,
      clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,
      display:s.display,height:s.height,minHeight:s.minHeight,overflowY:s.overflowY,flex:s.flex};
  };
  addEventListener('message',event=>{
    if(event.source!==parent||event.data?.type!=='shared-confirmation:diagnose')return;
    try{
    const mounts=[...document.querySelectorAll('#tool-root,#tool-app,#root,[data-reactroot],.webflow-app')];
    const scrollables=[...document.querySelectorAll('body *')].filter(n=>
      n.scrollHeight>n.clientHeight+1||/auto|scroll/.test(getComputedStyle(n).overflowY)).slice(0,100);
    parent.postMessage({type:'shared-confirmation:diagnostics',requestId:event.data.requestId,
      data:{url:location.href,origin:location.origin,
        activeElement:{tag:document.activeElement?.tagName,id:document.activeElement?.id},
        confirmationAvailable:typeof globalThis.OpenDeskTool?.ui?.confirm==='function',
        dialogs:[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(measure),viewport:{width:innerWidth,height:innerHeight},
        html:measure(document.documentElement),body:measure(document.body),root:measure(document.getElementById('tool-root')),
        mounts:mounts.map(measure),businessScroll:scrollables.map(measure),
        hint:document.getElementById('tool-root')?.style.getPropertyValue('--opendesk-host-available-height'),
        text:document.getElementById('tool-root')?.innerText.slice(0,3000)}},'*');
    }catch(error){parent.postMessage({type:'shared-confirmation:diagnostics',requestId:event.data.requestId,data:{error:String(error.stack)}},'*');}
  });
}

async function browserFixture(){
  const {tools,gaps,mode}=await (await fetch('/packages.json')).json();
  const calls=[],errors=[];
  const offlineFetch=(url,options)=>{
    const target=new URL(url instanceof URL?url.href:typeof url==='string'?url:url.url,location.href);
    if(target.origin!==location.origin)return Promise.reject(Object.assign(Error('Fixture blocks external fetch'),{code:'E_FIXTURE_OFFLINE'}));
    return fetch(target,options);
  };
  let app,host,view,surface=new URL(location.href).searchParams.get('surface')==='page'?'page':'sidebar',activeId=null;
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
  globalThis.__sharedConfirmationMocks={taskRequest};
  const listeners=new Set();
  const local={async get(keys){if(keys==null)return structuredClone(store);const names=typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);
    return Object.fromEntries(names.map(key=>[key,structuredClone(store[key]??(typeof keys==='object'&&!Array.isArray(keys)?keys[key]:undefined))]));},
    async set(values){const changes={};for(const [key,value] of Object.entries(values)){changes[key]={oldValue:structuredClone(store[key]),newValue:structuredClone(value)};store[key]=structuredClone(value);}
      for(const fn of listeners)fn(changes,'local');},async remove(keys){for(const key of Array.isArray(keys)?keys:[keys])delete store[key];}};
  const page={status:'available',tabId:52,windowId:1,frameId:0,documentId:'confirmation-fixture-document',url:'https://chatgpt.com/c/confirmation-fixture',title:'Offline confirmation fixture',origin:'https://chatgpt.com'};
  const currentPageTarget={snapshot:page,capture:()=>({...page}),async revalidate(){return true;},async refresh(){return page;},subscribe(){return ()=>{};}};
  const api={runtime:{getURL:p=>location.origin+'/'+p,async sendMessage(message){
      if(message?.operation==='browser.proxy.managed.getStatus'){
        calls.push({operation:message.operation,payload:message.payload,mocked:true,time:Date.now()});
        return {ok:true,data:{state:'disabled',permission:true,control:'controllable_by_this_extension',canStop:false,activeConfig:null}};
      }
      return fail('runtime.sendMessage',message);
    }},
    storage:{local,session:{async get(){return {};},async set(){},async remove(){}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
  const runHost={start:payload=>fail('tasks.start',payload),stop:payload=>fail('tasks.stop',payload)};
  const taskWorkbench={setToolActive(){},focusInstalledTask:id=>fail('tasks.open',{id})};
  const webflowAuto={
    async readAutoSettings(){return {enabled:false,epoch:1,tasks:[],grants:[]};},
    async readBridgeState(){return {source:{documentId:page.documentId,url:page.url},
      listener:{state:'ready',reason:'Offline confirmation fixture only'},work:{state:'idle'},session:null,receipt:null};},
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
      trustedAIProxyPilot:{enabled:true,version:TRUSTED_AI_PROXY_VERSION,mount:params=>app.mountAIProxyPilot(params)},
      foundationClient:{request:(operation,payload)=>fail(operation,payload)},fetcher:offlineFetch,displaySurface:surface});
    await host.ready;host.setVisible(true);rows();
  }
  const pending=new Map();
  addEventListener('message',event=>{
    if(event.source!==document.querySelector('#sidebar-tool-frame iframe')?.contentWindow)return;
    if(event.data?.type==='shared-confirmation:error')errors.push(event.data);
    if(event.data?.kind==='request')calls.push({operation:event.data.operation,payload:event.data.payload,transport:'bridge',time:Date.now()});
    if(event.data?.type==='shared-confirmation:diagnostics')pending.get(event.data.requestId)?.(event.data.data);
  });
  const aliases={quicknotes:'quick-notes',vue:'vue-notes-starter','vue-starter':'vue-notes-starter','vue-confirm':'vue-confirm-fixture'};
  const f={tools:tools.map(({id,title})=>({id,title})),gaps,mode,calls,errors,store,currentPageTarget,
    testOnly:true,
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
        iframe.contentWindow.postMessage({type:'shared-confirmation:diagnose',requestId},'*');});},
    hostDiagnostics(){const active=document.activeElement;return {activeElement:{tag:active?.tagName,id:active?.id},
      dialogs:[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].map(n=>({role:n.getAttribute('role'),text:n.textContent,hidden:n.hidden})),
      iframeSandbox:document.querySelector('#sidebar-tool-frame iframe')?.getAttribute('sandbox'),
      snapshot:view.getSnapshot(),view:view.diagnostics?.(),errors:[...errors]};},
    requestTask:taskRequest,dispose(){host.dispose();app.dispose();view.dispose();}};
  addEventListener('error',event=>errors.push(String(event.error?.stack||event.message)));
  addEventListener('unhandledrejection',event=>errors.push(String(event.reason?.stack||event.reason)));
  await mount();window.fixture=f;
  const controls=document.getElementById('fixture-controls');
  for(const tool of tools){const button=document.createElement('button');button.textContent=tool.title;button.onclick=()=>{f.open(tool.id).catch(error=>errors.push(String(error.stack||error)));};controls.append(button);}
  const close=document.createElement('button');close.textContent='关闭工具';close.onclick=()=>f.close();controls.append(close);
  const select=document.createElement('select');for(const value of ['sidebar','page'])select.add(new Option(value,value));select.value=surface;select.onchange=()=>{f.setSurface(select.value).catch(error=>errors.push(String(error.stack||error)));};controls.append(select);
  const height=document.createElement('input');height.type='number';height.min='0';height.value='64';height.title='外层控件高度 px';height.onchange=()=>f.setControlsHeight(Number(height.value));controls.append(height);
  if(gaps.length){const warning=document.createElement('span');warning.textContent='编译缺口: '+gaps.map(g=>g.project).join(', ');controls.append(warning);}
}

/** Build fresh source into a unique artifacts tree and bind only loopback. */
export async function startSharedConfirmationServer({port=0,preflight=false,aiProxyIdentity='formal'}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Expected a valid port');
  if(!['formal','source'].includes(aiProxyIdentity))throw Error('Unknown AI Proxy fixture identity');
  const parent=path.join(root,'artifacts/shared-confirmation');await mkdir(parent,{recursive:true});
  const outputDir=await mkdtemp(path.join(parent,'run-'));
  const inputs={},tools=[],gaps=[],inlineCSS={},mode='freshsource';
  async function input(relative){
    const bytes=await readFile(path.resolve(root,relative));
    const entry={source:relative,bytes:bytes.length,sha256:sha256(bytes)};
    if(inputs[relative]&&inputs[relative].sha256!==entry.sha256)throw Error('Input changed during fixture compilation: '+relative);
    inputs[relative]=entry;return bytes.toString('utf8');
  }
  await input('tests/helpers/shared-confirmation-server.mjs');
  await input('package.json');await input('package-lock.json');
  const capture={name:'shared-confirmation-source-inputs',setup(builder){
    builder.onResolve({filter:/\.css\?inline$/},args=>({path:path.resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'inline-css'}));
    builder.onLoad({filter:/.*/,namespace:'inline-css'},async args=>{
      // Vite's ?inline contract returns bundled CSS text, never raw @imports.
      // Use the same esbuild source capture for every transitive stylesheet.
      const result=await build({...common,entryPoints:[args.path],outfile:path.join(outputDir,'inline.css'),plugins:[capture]});
      const css=result.outputFiles.find(file=>file.path.endsWith('.css'))?.text;
      if(typeof css!=='string'||/^\s*@import\s/m.test(css))throw Error('Inline CSS was not fully bundled: '+args.path);
      inlineCSS[path.relative(root,args.path)]={bytes:Buffer.byteLength(css),sha256:sha256(css)};
      return {contents:'export default '+JSON.stringify(css)+';',loader:'js',resolveDir:path.dirname(args.path)};
    });
    builder.onResolve({filter:/\?raw$/},args=>({path:path.resolve(args.resolveDir,args.path),namespace:'raw-source'}));
    builder.onLoad({filter:/.*/,namespace:'raw-source'},async args=>({contents:await input(path.relative(root,args.path.slice(0,-4))),loader:'text'}));
    builder.onLoad({filter:/\.(?:[cm]?js|jsx|ts|tsx|css|json)$/},async args=>{
      if(args.namespace!=='file')return;
      const relative=path.relative(root,args.path).split(path.sep).join('/');
      const contents=await input(relative);
      // Task execution is deliberately mocked. Confirmation Host/Bridge/UI and
      // their admission/epoch/lifecycle code are never overridden.
      if(relative==='src/platform/host/task-delegation.js')return {contents:`export function createTaskDelegationHost(){return {
        request:(operation,payload)=>globalThis.__sharedConfirmationMocks.taskRequest(operation,payload),dispose(){}}}`,loader:'js'};
      const ext=path.extname(args.path).slice(1);
      return {contents,loader:['mjs','cjs'].includes(ext)?'js':ext,resolveDir:path.dirname(args.path)};
    });
  }};
  const common={bundle:true,write:false,platform:'browser',target:'es2022',logLevel:'silent',metafile:true,
    define:{'process.env.NODE_ENV':JSON.stringify('production')}};
  // Compile the UNMODIFIED starter SFC through the installed Vue compiler,
  // then let esbuild bundle the ordinary Vue runtime and styles. No Vite/dist.
  const vueProject='examples/sidebar-tools/vue-starter';
  const vueRequire=createRequire(path.join(root,vueProject,'package.json'));
  const compiler=vueRequire('@vue/compiler-sfc');
  await input(vueProject+'/package.json');await input(vueProject+'/package-lock.json');
  await input(path.relative(root,vueRequire.resolve('@vue/compiler-sfc')));
  const vueRuntime=path.join(path.dirname(vueRequire.resolve('vue/package.json')),'dist/vue.runtime.esm-bundler.js');
  const vuePlugin={name:'shared-confirmation-vue-sfc',setup(builder){
    builder.onLoad({filter:/\.vue$/},async args=>{
      const source=await input(path.relative(root,args.path));
      const {descriptor,errors}=compiler.parse(source,{filename:args.path});
      if(errors.length)throw errors[0];
      if(descriptor.styles.length)throw Error('Fixture SFC has new styles; add source-bound style compilation before using it');
      const result=compiler.compileScript(descriptor,{id:sha256(source).slice(0,12),inlineTemplate:true});
      return {contents:result.content,loader:'js',resolveDir:path.dirname(args.path)};
    });
  }};
  async function compileVue(entry,outfile){
    return build({...common,entryPoints:[path.join(root,entry)],format:'iife',outfile:path.join(outputDir,outfile),
      alias:{vue:vueRuntime},define:{...common.define,__VUE_OPTIONS_API__:'true',__VUE_PROD_DEVTOOLS__:'false',__VUE_PROD_HYDRATION_MISMATCH_DETAILS__:'false'},
      plugins:[vuePlugin,capture]});
  }
  for(const project of ['projects/webflow','projects/quick-notes']){
    const meta=JSON.parse(await input(project+'/tool.config.json'));
    for(const name of Object.values(meta.files).flat())await input(project+'/'+name);
    if(meta.locales)throw Error('Add explicit locale input capture before using localized tool');
    const pkg=await createSidebarToolPackage(path.join(root,project));
    tools.push(pkg);
  }
  let aiProxyTool=null;
  if(aiProxyIdentity==='source'){
    // Synthetic, reviewed memory identity for current fixed-source UI tests.
    // Throwing fallback prevents sandbox execution from passing a trusted test.
    aiProxyTool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'ai-proxy',
      version:TRUSTED_AI_PROXY_VERSION,title:'AI Proxy',description:'Test-only source identity',
      capabilities:['storage.local','currentPage.read','browser.proxy.managed'],html:'<div></div>',css:'',
      requires:{browserSdk:'1.0.0'},uiRuntime:'opendesk.react-ui.v1',contributes:{contextMenus:[]},
      js:'throw Error("Source fixture requires the statically compiled trusted UI");'});
  }else{
    // Formal identity only; do not mutate, rebuild or promote the real package.
    const formalAIProxy=validateSidebarToolPackage(JSON.parse(await input('projects/ai-proxy/ai-proxy.opendesk-tool.json')));
    if(formalAIProxy.id!=='ai-proxy'||formalAIProxy.version!==TRUSTED_AI_PROXY_VERSION){
      gaps.push({project:'projects/ai-proxy',code:'E_FIXTURE_AI_PROXY_VERSION',
        packageVersion:formalAIProxy.version,trustedVersion:TRUSTED_AI_PROXY_VERSION,
        message:'Formal package identity does not match the trusted component marker; AIProxy entry omitted.'});
    }else aiProxyTool=formalAIProxy;
  }
  if(aiProxyTool)tools.push(aiProxyTool);
  const meta=JSON.parse(await input(vueProject+'/tool.config.json'));
  const starter=await compileVue(vueProject+'/src/main.js','vue-starter.js');
  const starterHtml=await input(vueProject+'/'+meta.files.html);
  tools.push(validateSidebarToolPackage({format:SIDEBAR_TOOL_FORMAT,id:meta.id,version:meta.version,title:meta.title,
    description:meta.description,capabilities:meta.capabilities,html:starterHtml,
    css:starter.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n'),
    js:starter.outputFiles.find(f=>f.path.endsWith('.js')).text}));
  const minimal=await compileVue('tests/fixtures/shared-confirmation/vue-confirm.js','vue-confirm.js');
  tools.push(validateSidebarToolPackage({format:SIDEBAR_TOOL_FORMAT,id:'vue-confirm-fixture',version:'1.0.0',
    title:'Vue 共享确认夹具',description:'只测试普通确认，无业务写入与授权。',capabilities:[],
    html:'<div id="tool-app"></div>',css:'',js:minimal.outputFiles.find(f=>f.path.endsWith('.js')).text}));
  const app=await build({...common,stdin:{contents:`import {mountSidebarApp} from './src/ui/react/main.tsx';
    import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
    import {createSidebarTools} from './src/ui/sidebar-tools.js';
    import {SIDEBAR_TOOL_STORE} from './src/ui/sidebar-tools/package.js';
    import {SIDEBAR_TOOL_ENABLE_STORE} from './src/ui/sidebar-tools/lifecycle.js';
    import {TRUSTED_AI_PROXY_VERSION} from './projects/ai-proxy/trusted/admission.js';
    (${browserFixture.toString()})().catch(error=>{window.fixtureError=String(error.stack);console.error(error);});`,resolveDir:root,loader:'tsx'},
    alias:{'@opendesk/ui':path.join(root,'src/ui/react/components/ui/button.tsx')},
    outfile:path.join(outputDir,'app.js'),format:'esm',plugins:[capture]});
  const bridge=await build({...common,stdin:{contents:`import {initSidebarToolSandbox} from './src/sidebar-tools/bridge.js';initSidebarToolSandbox();`,resolveDir:root},
    outfile:path.join(outputDir,'bridge.js'),format:'iife',plugins:[capture]});
  const fixedRuntime={name:'shared-confirmation-fixed-entry',setup(builder){
    builder.onResolve({filter:/^wxt\/utils\/define-unlisted-script$/},()=>({path:'wxt-entry',namespace:'fixture-runtime'}));
    builder.onResolve({filter:/^react(?:\/jsx-runtime)?$/},()=>({path:'pinned-react',namespace:'fixture-runtime'}));
    builder.onLoad({filter:/.*/,namespace:'fixture-runtime'},args=>({contents:args.path==='wxt-entry'
      ?'export function defineUnlistedScript(callback){callback();}'
      :'module.exports=globalThis.OpenDeskPageReact;',loader:'js'}));
  }};
  const shared=await build({...common,entryPoints:[path.join(root,'src/entrypoints/sidebar-shared-ui.js')],
    outfile:path.join(outputDir,'sidebar-shared-ui.js'),format:'iife',plugins:[fixedRuntime,capture]});
  const reactRuntime=await input('src/libs/page-frameworks/react-19.2.0.js');
  const css=(await Promise.all(['design-tokens.css','design-system.css','tool-shell.css','extension-center.css'].map(n=>input('src/ui/'+n)))).join('\n')+
    app.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
  const originalSandbox=await input('src/sidebar-tools/sandbox.html');
  if(!originalSandbox.includes('<script src="bridge.js">'))throw Error('Sandbox script entry changed');
  const sandbox=originalSandbox.replace('<script src="bridge.js">',
    '<script src="/diagnostics.js" crossorigin="anonymous"></script><script src="bridge.js" crossorigin="anonymous">');
  const html='<!doctype html><html lang="zh-CN" data-opendesk-tab="tools"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>#fixture-controls{flex:0 0 auto;box-sizing:border-box;height:64px;overflow:auto;background:#eee}#fixture-controls input{width:70px}</style></head><body><div id="fixture-controls" aria-label="Test-only fixture controls"></div><div id="opendesk-react-app" class="opendesk-react-app"></div><script type="module" src="/app.js"></script></body></html>';
  // Detect source drift, including concurrent platform edits, before advertising
  // this frozen candidate. Never silently mix two revisions of the same input.
  for(const [name,entry] of Object.entries(inputs)){
    if(sha256(await readFile(path.resolve(root,name)))!==entry.sha256)throw Error('Source changed during fixture build: '+name);
  }
  const inputHash=sha256(JSON.stringify(Object.entries(inputs).sort(([a],[b])=>a.localeCompare(b))));
  const manifest={schema:'opendesk.shared-confirmation.fixture.v1',testOnly:true,mode,inputHash,inputs,gaps,aiProxyIdentity,
    build:{esbuild:esbuildVersion,output:'isolated artifacts only',inlineCSS,
      overrides:['src/platform/host/task-delegation.js -> mock task service',
        'wxt defineUnlistedScript -> invoke fixed entry',
        'shared runtime React -> production pinned OpenDeskPageReact'],
      sourcePolicy:'Current disk sources; fail if a captured input changes during compilation'},
    tools:tools.map(t=>({id:t.id,title:t.title,version:t.version,sha256:sha256(JSON.stringify(t))})),
    boundaries:{real:['React shell/ToolHost','createSidebarToolsController via createSidebarTools','Bridge','UI confirmation protocol','tool source'],
      mocked:['Chrome storage (memory only)','Native/foundation','browser.proxy.managed.getStatus (read-only)','current page','tasks/delegation','catalog'],
      notTested:['browser rendering','cross-iframe focus','Chrome installation','Native permissions']}};
  const routes=new Map([
    ['/', ['text/html',html]],['/app.js',['text/javascript',app.outputFiles.find(f=>f.path.endsWith('.js')).text]],
    ['/style.css',['text/css',css]],['/sidebar-tools/sandbox.html',['text/html',sandbox]],
    ['/sidebar-tools/bridge.js',['text/javascript',bridge.outputFiles.find(f=>f.path.endsWith('.js')).text]],
    ['/libs/page-frameworks/react-19.2.0.js',['text/javascript',reactRuntime]],
    ['/sidebar-shared-ui.js',['text/javascript',shared.outputFiles.find(f=>f.path.endsWith('.js')).text]],
    ['/diagnostics.js',['text/javascript',`(${sandboxDiagnostics.toString()})();`]],
    // Serialized in-memory packages are served only; no tool JSON is emitted.
    ['/packages.json',['application/json',JSON.stringify({tools,gaps,mode})]],
    ['/inputs.json',['application/json',JSON.stringify(manifest,null,2)]]
  ]);
  if(aiProxyTool)routes.set('/official-tools/ai-proxy/ai-proxy.opendesk-tool.json',
    ['application/json',JSON.stringify(aiProxyTool)]);
  for(const [route,[,body]] of routes){
    if(route==='/packages.json'||route.startsWith('/official-tools/'))continue;
    const destination=path.join(outputDir,route==='/'?'index.html':route.slice(1));
    await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,body);
  }
  // Preserve the isolated Vue compiler outputs as evidence, never project dist.
  for(const result of [starter,minimal])for(const file of result.outputFiles)await writeFile(file.path,file.contents);
  if(preflight)return {preflight:true,mode,outputDir,inputs,inputHash,tools:manifest.tools,manifest};
  const server=createServer((req,res)=>{
    let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400);res.end();return;}
    const entry=routes.get(pathname)||(pathname.endsWith('/catalog.json')?['application/json',JSON.stringify({schema:'opendesk.official-tools.releases.v1',sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[]})]:null);
    res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');
    if(pathname==='/sidebar-tools/sandbox.html')res.setHeader('Content-Security-Policy',"sandbox allow-scripts; script-src 'self' blob:");
    res.writeHead(entry?200:404,{'Content-Type':(entry?.[0]||'text/plain')+'; charset=utf-8'});res.end(entry?.[1]||'Fixture route not found');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  const actualPort=server.address().port,url=`http://127.0.0.1:${actualPort}/`;let closing;
  return {server,port:actualPort,url,mode,outputDir,inputs,inputHash,tools:manifest.tools,manifest,
    close(){return closing??=new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);
  if(args.some(arg=>arg!=='--preflight'))throw Error('Usage: node tests/helpers/shared-confirmation-server.mjs [--preflight]');
  const fixture=await startSharedConfirmationServer({preflight:args.includes('--preflight')});
  console.log(JSON.stringify({url:fixture.url,outputDir:fixture.outputDir,inputHash:fixture.inputHash,
    inputsUrl:fixture.url?fixture.url+'inputs.json':undefined,preflight:fixture.preflight,gaps:fixture.manifest.gaps,manifest:path.join(fixture.outputDir,'inputs.json'),tools:fixture.tools},null,2));
  if(!fixture.preflight)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
    fixture.close().catch(error=>{console.error(error);process.exitCode=1;});
  });
}
