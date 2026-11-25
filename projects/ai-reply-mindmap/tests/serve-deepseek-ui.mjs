// Loopback only: production site adapters and XMind SDK, without OpenDesk frame grants.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {verifyFixedXmindAssets} from '../preview/serve.mjs';

const assets=await verifyFixedXmindAssets();
const css=await readFile(new URL('../assets/ui.css',import.meta.url));
const route='/a/chat/s/11111111-2222-4333-8444-555555555555';
const {outputFiles:[script]}=await build({bundle:true,write:false,format:'esm',stdin:{
  loader:'js',resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),contents:[
    "import {createAnswerRegistry} from './answer-registry.js';",
    "import * as deepseek from './deepseek-adapter.js';",
    "import * as chatgpt from './chatgpt-adapter.js';",
    "import {createAnswerView} from './view.js';",
    "import {createXmindRenderer} from './xmind-adapter.js';",
    offlineProgram.toString(),
    'await offlineProgram(createAnswerRegistry,deepseek,chatgpt,createAnswerView,createXmindRenderer);'
  ].join('\n')
}});
const names=['Garden','Voyage','Orchard','Library'];
const page=(replies,container)=>'<!doctype html><meta charset="utf-8"><title>Reply mind map UI test</title>'+
  '<link rel="stylesheet" href="/fixture.css"><div id="root">'+
  '<main class="'+container+'">'+replies.join('')+'</main></div>'+
  [...assets.keys()].map(path=>'<script src="'+path+'"></script>').join('')+
  '<script type="module" src="/fixture.js"></script>';
const deepseekHtml=page(names.map(name=>
    '<article><div class="ds-message"><div class="ds-assistant-message-main-content">'+
    '<h2>'+name+' plan</h2><p>First group</p><h3>Second group</h3><p>Third group</p></div></div>'+
    '<div class="native-row"><div class="ds-button ds-button--icon" role="button" aria-label="Copy">'+
    '<svg viewBox="0 0 16 16"><path d="M6.14929 4.02032 Z"/></svg></div>'+
    '<div class="ds-button ds-button--icon" role="button" aria-label="Like">+</div></div></article>'
  ),'ds-virtual-list ds-virtual-list--printable');
const chatgptHtml=page(names.map((name,i)=>
  '<article data-talvt-turn-state="complete"><section data-content-search-unit-key="'+i+':assistant">'+
  '<div data-conversation-role="assistant"></div><div class="history-reply">'+
  '<div data-markdown-text-style="assistant-message"><h2>'+name+' plan</h2><p>First group</p>'+
  '<h3>Second group</h3><p>Third group</p></div></div></section>'+
  '<div class="turn-action-controls"><button data-testid="copy-turn-action-button">Copy</button></div></article>'
),'chatgpt-history');
const styles='body{margin:0;background:#eee;font:16px system-ui} main{box-sizing:border-box;height:100dvh;overflow:auto;'+
  'padding:32px;max-width:1000px;margin:auto;background:white} article{padding:24px 0;min-height:245px}'+
  '.native-row,.turn-action-controls{display:flex;align-items:center;gap:4px}.native-row svg{width:20px}'+
  '.history-reply{min-height:1100px}';
const routes=new Map([...assets,[route,deepseekHtml],['/c/fixture',chatgptHtml],
  ['/fixture.js',script.contents],['/fixture.css',styles],['/ui.css',css]]);
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(req.method!=='GET'||!routes.has(path)){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "+
      "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'"});
  res.end(routes.get(path));
});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+route));

async function offlineProgram(createAnswerRegistry,deepseek,chatgpt,createAnswerView,createXmindRenderer){
  const isDeepSeek=!location.pathname.startsWith('/c/');
  // Only the adapter sees the synthetic DeepSeek location; the browser stays on loopback.
  Object.defineProperty(document,'defaultView',{value:new Proxy(window,{get(target,key){
    if(key==='location')return new URL(location.pathname,'https://chat.deepseek.com');
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }})});
  const css=await(await fetch('/ui.css')).text();
  const owner={active:()=>true,on(target,type,handler,options){
    target.addEventListener(type,handler,options);return ()=>target.removeEventListener(type,handler,options);
  },observe(target,handler,options){new MutationObserver(handler).observe(target,options);},
  setTimeout:(...args)=>setTimeout(...args),setInterval:(...args)=>setInterval(...args)};
  const mode=new URLSearchParams(location.search).get('mode');
  let serial=0;
  createAnswerRegistry({document,window,owner,css,adapter:isDeepSeek?deepseek:chatgpt,createView(options){
    const view=createAnswerView({...options,rendererFactory:createXmindRenderer}),id=++serial;
    view.host.dataset.fixtureView=String(id);
    return {...view,async start(){
      if(mode==='failure'&&id===1)throw Error('Extension context invalidated');
      // Replace reply markup without restarting generation, as a highlighter could.
      if(isDeepSeek){
        const heading=view.host.previousElementSibling.querySelector('h2');
        setTimeout(()=>heading.replaceWith(heading.cloneNode(true)),20);
      }
      await view.start();
    },async destroy(){
      // The original and its scroll position must be restored during teardown.
      if(!isDeepSeek)await new Promise(resolve=>setTimeout(resolve,600));
      await view.destroy();
    }};
  }}).start();
}
