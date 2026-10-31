// Read the original working tree without installing, building or writing there.
// Only the original Chrome boundary is replaced with project-owned memory data.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,join,relative} from 'node:path';
import {build} from 'esbuild';

const project=fileURLToPath(new URL('..',import.meta.url));
const repo=resolve(project,'../..');
const original=resolve(process.env.AI_PROXY_SOURCE||join(repo,'../ai-proxy/apps/browser-extension'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['style.css','options.css','sidepanel-r86.css','rotation-entry.css'];
const styles=await Promise.all(files.map(name=>readFile(join(original,'src/ui',name),'utf8')));
const source=`
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import QuickPanel from ${JSON.stringify(join(original,'entrypoints/sidepanel/App.tsx'))};
import Settings from ${JSON.stringify(join(original,'entrypoints/options/App.tsx'))};
import {LocaleProvider} from ${JSON.stringify(join(original,'src/i18n/LocaleProvider.tsx'))};
import {createPreviewBoundary} from './preview/sdk-preview.js';
import {createProxyService} from './src/service.ts';
const params=new URLSearchParams(location.search),boundary=createPreviewBoundary(params.get('scenario')||'success');
const service=createProxyService(boundary.service);
const event=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),emit:(...args)=>{for(const fn of listeners)fn(...args);}};};
const storageChanged=event(),proxyChanged=event();
const navigate=url=>{location.hash=new URL(url,location.href).hash||'#/profiles';};
globalThis.chrome={
 i18n:{getUILanguage:()=> 'zh-CN'},
 storage:{onChanged:storageChanged,local:{get:async key=>({[key]:await boundary.read(key)}),set:async items=>{for(const [key,value]of Object.entries(items)){await boundary.write(key,value);storageChanged.emit({[key]:{newValue:value}},'local');}},remove:async key=>boundary.write(key,null)}},
 proxy:{settings:{onChange:proxyChanged}},
 tabs:{query:async()=>[{url:'https://docs.example.com/'}],onActivated:event(),onUpdated:event(),create:async({url})=>navigate(url)},
 runtime:{getURL:path=>location.origin+'/'+path,openOptionsPage:async()=>{location.hash='#/profiles';},sendMessage:async message=>message.type?.startsWith('OFFICIAL_')?{ok:true,snapshot:{configured:false,auth:'guest',availability:'unconfigured',plans:[],lines:[],checkout:'none'}}:service.request(message)}
};
service.subscribe(()=>{storageChanged.emit({'aiProxy.config.v2':{newValue:true}},'local');});
const routeCss={quick:${JSON.stringify([styles[0],styles[2],styles[3]].join('\n'))},settings:${JSON.stringify([styles[0],styles[1]].join('\n'))}};
function Reference(){const [route,setRoute]=useState(location.hash);useEffect(()=>{const change=()=>setRoute(location.hash);addEventListener('hashchange',change);return()=>removeEventListener('hashchange',change);},[]);return <><style>{route.startsWith('#/')?routeCss.settings:routeCss.quick}</style><LocaleProvider>{route.startsWith('#/')?<Settings/>:<QuickPanel/>}</LocaleProvider></>;}
createRoot(document.getElementById('root')).render(<Reference/>);
if(params.get('view')==='add')setTimeout(()=>document.querySelector('[aria-label="添加代理"]')?.click(),150);
`;
const result=await build({stdin:{contents:source,loader:'jsx',resolveDir:project},bundle:true,write:false,
  format:'iife',platform:'browser',target:'es2022',minify:true,jsx:'automatic',metafile:true,
  alias:{react:join(repo,'node_modules/react'),'react-dom':join(repo,'node_modules/react-dom')},
  plugins:[{name:'reference-raw',setup(b){
    b.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'reference-raw'}));
    b.onLoad({filter:/.*/,namespace:'reference-raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));
  }}],
  nodePaths:[join(repo,'node_modules')],define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":true,"MODE":"preview"}'}});
const sources={};
for(const path of Object.keys(result.metafile.inputs)){
 if(path.startsWith('<'))continue;
 const absolute=path.startsWith('reference-raw:')?path.slice(14):resolve(path),bytes=await readFile(absolute);
 if(absolute.startsWith(original))sources[relative(original,absolute)]={bytes:bytes.length,sha256:sha(bytes)};
}
for(let i=0;i<files.length;i++)sources['src/ui/'+files[i]]={bytes:Buffer.byteLength(styles[i]),sha256:sha(styles[i])};
// The outer comparison switches views; the original app keeps its own hierarchy.
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src data: \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">'+
 '<title>AI Proxy 原版 React · 只读来源 / 内存模拟</title><div id="root"></div>'+ 
 '<script src="data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64')+'"></script></html>';
const out=join(project,'.opendesk-preview');await mkdir(out,{recursive:true});
await writeFile(join(out,'reference.html'),html);
await writeFile(join(out,'reference-sources.json'),JSON.stringify({original,sources,sha256:sha(html),simulation:'Original UI and CSS; Chrome boundary uses memory only. No real proxy/storage/network.'},null,2)+'\n');
console.log(JSON.stringify({reference:join(out,'reference.html'),original,sourceFiles:Object.keys(sources).length,sha256:sha(html)}));
