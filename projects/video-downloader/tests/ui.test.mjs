import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));};
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.dataset={};this.disabled=false;this.value='';this.textContent='';this.attributes={};}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;this.textContent='';}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  async fire(name){if(name==='click'&&this.disabled)return;for(const fn of this.listeners[name]||[])fn({target:this});await settle();}
}
function ui(handler){
  const ids=Object.fromEntries(['list','detect','stop','message','state','progress','info'].map(id=>['vd-'+id,new Element()]));
  const root=new Element();root.querySelector=selector=>ids[selector.slice(1)];
  let counter=0;const timers=new Map(),calls=[];
  runInNewContext(source,{
    OpenDeskTool:{root,request:async(operation,payload)=>{calls.push({operation,payload});return handler(operation,payload);}},
    document:{createElement:tag=>new Element(tag)},window:new Element(),
    setTimeout:fn=>{timers.set(++counter,fn);return counter;},clearTimeout:id=>timers.delete(id)
  });
  const descendants=(element,tag)=>element.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...descendants(child,tag)]);
  return {ids,calls,root,find:tag=>descendants(ids['vd-list'],tag),
    click:id=>ids['vd-'+id].fire('click'),
    tick:async()=>{const entries=[...timers];timers.clear();for(const [,fn] of entries)await fn();await settle();}};
}
const candidate={id:'candidate',format:'hls',mode:'ready',hls:{kind:'master',audio:[],variants:[
  {id:'high',ready:true,resolution:'1280x720',bandwidth:2149280,segments:64,encryption:'clear'},
  {id:'low',ready:true,resolution:'320x184',bandwidth:246440,segments:64,encryption:'clear'}
]}};
test('choose a rendition and follow a segmented task through saving without a native download ID at start',async()=>{
  const states=[{state:'segments',segmentsCompleted:3,segmentsTotal:64,bytesReceived:1000},
    {state:'remuxing',segmentsCompleted:64,segmentsTotal:64,remuxBytes:50,remuxTotalBytes:100},
    {state:'saving'},{state:'started',downloadId:7},
    {state:'complete',downloadId:7,bytesReceived:2000,totalBytes:2000,playbackVerified:false}];
  const app=ui((operation)=>operation==='media.detect'?{candidates:[candidate]}:
    operation==='media.start'?{taskId:'task',state:'segments',segmentsTotal:64}:states.shift());
  await app.click('detect');
  const select=app.find('select')[0];assert.ok(select,'rendition choice must be available');
  assert.equal(select.value,'low','default to the smallest known bitrate');
  select.value='high';await select.fire('change');
  await app.find('button')[0].fire('click');
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.find(x=>x.operation==='media.start').payload)),{candidateId:'candidate',variantId:'high'});
  assert.equal(app.ids['vd-state'].textContent,'下载分段');assert.equal(app.ids['vd-stop'].disabled,false);
  assert.equal(app.ids['vd-detect'].disabled,true);
  await app.tick();assert.match(app.ids['vd-info'].textContent,/3\s*\/\s*64/);
  await app.tick();assert.equal(app.ids['vd-state'].textContent,'正在封装 MP4');assert.equal(app.ids['vd-progress'].value,50);assert.equal(app.ids['vd-stop'].disabled,false);assert.match(app.ids['vd-info'].textContent,/不重新编码/);
  await app.tick();assert.equal(app.ids['vd-state'].textContent,'正在保存');
  await app.tick();await app.tick();
  assert.equal(app.ids['vd-state'].textContent,'Chrome 下载完成');
  assert.equal(app.ids['vd-detect'].disabled,false);assert.match(app.ids['vd-info'].textContent,/播放仍需/);
  assert.doesNotMatch(app.ids['vd-message'].textContent,/正在下载|正在启动|正在核对/,'a completed task must retire its in-flight notice');
  await app.click('detect');
  assert.equal(app.ids['vd-state'].textContent,'未开始');
  assert.equal(app.ids['vd-progress'].value,0);
  assert.doesNotMatch(app.ids['vd-info'].textContent,/已从 Chrome 下载记录核对/,'a new scan must clear the previous task summary');
});
test('Stop while start is pending adopts the task receipt and cannot be overwritten by late segment progress',async()=>{
  let resolveStart;
  const app=ui(operation=>operation==='media.detect'?{candidates:[candidate]}:
    operation==='media.start'?new Promise(resolve=>{resolveStart=resolve;}):
    operation==='media.stop'?{taskId:'task',state:'cancel_requested'}:{taskId:'task',state:'cancelled'});
  await app.click('detect');await app.find('button')[0].fire('click');
  await app.click('stop');assert.equal(app.ids['vd-state'].textContent,'停止中');
  resolveStart({taskId:'task',state:'segments'});await settle();
  assert.equal(app.ids['vd-state'].textContent,'停止中');
  await app.tick();assert.equal(app.ids['vd-state'].textContent,'已取消');
  assert.doesNotMatch(app.ids['vd-message'].textContent,/正在下载|正在启动/);
  await app.root.fire('opendesk-page-changed');
  assert.equal(app.ids['vd-state'].textContent,'未开始');
  assert.doesNotMatch(app.ids['vd-info'].textContent,/下载已取消/,'navigation must clear the retired task details');
  assert.equal(app.calls.filter(x=>x.operation==='media.start').length,1);
});
test('navigation discards a late scan and restores detection without replay',async()=>{
  let resolveScan;
  const app=ui(()=>new Promise(resolve=>{resolveScan=resolve;}));
  await app.click('detect');await app.root.fire('opendesk-page-changed');
  resolveScan({candidates:[candidate]});await settle();
  assert.equal(app.find('button').length,0);assert.equal(app.ids['vd-detect'].disabled,false);
  assert.equal(app.calls.length,1);
});
test('unknown start outcome blocks repeat downloads and leaves Stop available',async()=>{
  const app=ui(operation=>{if(operation==='media.detect')return {candidates:[candidate]};throw Error('transport disconnected');});
  await app.click('detect');await app.find('button')[0].fire('click');
  assert.equal(app.ids['vd-state'].textContent,'结果未知');assert.equal(app.ids['vd-detect'].disabled,true);
  assert.equal(app.ids['vd-stop'].disabled,false);
  await app.find('button')[0].fire('click');assert.equal(app.calls.filter(x=>x.operation==='media.start').length,1);
});
