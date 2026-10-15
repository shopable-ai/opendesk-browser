import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';

const packagedScript=async()=>(await createSidebarToolPackage('examples/sidebar-tools/reading-toc')).js;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Node{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs=new Map();this.events=new Map();this.style={setProperty(){}};this.dataset={};this.textContent='';this.value='';this.hidden=false;this.disabled=false;}
 get options(){return this.children.filter(row=>row.tagName==='OPTION');}
 append(...nodes){for(const node of nodes)this.children.push(...(node.tagName==='FRAGMENT'?node.children:[node]));}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(key,value){this.attrs.set(key,String(value));}
 removeAttribute(key){this.attrs.delete(key);}
 addEventListener(type,handler){if(!this.events.has(type))this.events.set(type,[]);this.events.get(type).push(handler);}
 fire(type){for(const handler of this.events.get(type)||[])handler();}
 querySelectorAll(selector){const results=[];for(const child of this.children){if(selector==='button'&&child.tagName==='BUTTON')results.push(child);results.push(...child.querySelectorAll(selector));}return results;}
}
function harness(script){
 const ids=['toc-source','toc-list','toc-empty','toc-error','toc-overview-more','toc-refresh'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Node(id==='toc-source'?'select':'div')]));
 nodes['toc-empty'].hidden=true;nodes['toc-error'].hidden=true;
 const modes=['top','focus','full'].map(mode=>{const button=new Node('button');button.dataset.tocMode=mode;return button;});
 const containers=Object.fromEntries(['.toc-panel','.toc-title','.toc-modes','.toc-scroll']
   .map(selector=>[selector,new Node(selector==='.toc-panel'?'main':'div')]));
 const root={querySelector:selector=>selector.startsWith('#')?nodes[selector.slice(1)]:containers[selector],querySelectorAll:()=>modes};
 const document={createElement:tag=>new Node(tag),createDocumentFragment:()=>new Node('fragment'),hidden:false,
   events:new Map(),addEventListener:Node.prototype.addEventListener,fire:Node.prototype.fire};
 const window={events:new Map(),addEventListener:Node.prototype.addEventListener,fire:Node.prototype.fire};
 let timerId=0;const timers=new Map(),requests=[];
 const setTimeout=(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;};
 const clearTimeout=id=>timers.delete(id);
 const request=(name,payload)=>new Promise((resolve,reject)=>{requests.push({name,payload,resolve,reject});});
 runInNewContext(script,{globalThis:{OpenDeskTool:{root,request,locale:'zh-CN'}},document,window,setTimeout,clearTimeout});
 const advance=async()=>{const id=[...timers.keys()][0];assert(id,'scheduled retry');const {fn}=timers.get(id);timers.delete(id);fn();await tick();};
 return {nodes,modes,window,requests,advance};
}
function sample(label='正文'){return {url:'https://example.com/article',activeId:'h-1',sources:[{id:'s-1',label:'当前网页'}],
 items:[{id:'h-1',sourceId:'s-1',label,depth:0,topId:'h-1'}],overview:{'s-1':{ids:['h-1'],hiddenCount:0}}};}

test('R4.8 last-good fallback disables stale links; manual force and auto retry recover',async()=>{
 const f=harness(await packagedScript());
 assert.match(f.nodes['toc-error'].textContent,/正在读取/);
 assert.equal(f.nodes['toc-empty'].hidden,true,'loading differs from empty');
 f.window.fire('focus');f.nodes['toc-refresh'].fire('click');
 assert.equal(f.requests.length,1,'no overlapping read');
 f.requests[0].resolve(sample());await tick();
 assert.equal(f.nodes['toc-list'].querySelectorAll('button').length,1);
 await f.advance();
 assert.deepEqual(JSON.parse(JSON.stringify(f.requests[1].payload)),{refresh:true});
 f.requests[1].reject(Error('页面暂不可达'));await tick();
 assert.equal(f.nodes['toc-list'].querySelectorAll('button')[0].disabled,true);
 assert.match(f.nodes['toc-error'].textContent,/显示上次目录/);
 await f.advance();
 f.requests[2].resolve(sample('恢复后的章节'));await tick();
 assert.equal(f.nodes['toc-list'].querySelectorAll('button')[0].disabled,false);
 assert.equal(f.nodes['toc-list'].querySelectorAll('button')[0].children[0].textContent,'恢复后的章节');
 assert.equal(f.nodes['toc-error'].hidden,true);
});
test('R4.8 empty snapshot schedules forced second scan for asynchronous headings',async()=>{
 const f=harness(await packagedScript());
 f.requests[0].resolve({...sample(),items:[],sources:[],activeId:'',overview:{}});await tick();
 assert.equal(f.nodes['toc-empty'].hidden,false);
 await f.advance();assert.deepEqual(JSON.parse(JSON.stringify(f.requests[1].payload)),{refresh:true});
 f.requests[1].resolve(sample('延迟到达的标题'));await tick();
 assert.equal(f.nodes['toc-empty'].hidden,true);
 assert.equal(f.nodes['toc-list'].querySelectorAll('button').length,1);
});
test('R4.8 host responds on read throttling and preserves trusted force re-index',async()=>{
 const host=await readFile(new URL('../../src/ui/sidebar-tools.js',import.meta.url),'utf8');
 const page=await readFile(new URL('../../src/reading-toc/page.js',import.meta.url),'utf8');
 assert.doesNotMatch(host,/lastTocRead/);
 assert.match(host,/rateExceeded=\+\+requestCount>120;/);
 assert.match(host,/if\(rateExceeded\)\{reply\(false/);
 assert.match(host,/forceRefresh:true/);
 assert.match(page,/message\.forceRefresh===true/);
});
