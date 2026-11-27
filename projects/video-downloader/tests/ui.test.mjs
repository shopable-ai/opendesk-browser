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
  removeAttribute(name){delete this.attributes[name];}
  focus(){}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  async fire(name){if(name==='click'&&(this.disabled||this.hidden))return;for(const fn of this.listeners[name]||[])fn({target:this});await settle();}
}
function ui(handler,settings={output:'original'}){
  const ids=Object.fromEntries(['list','detect','stop','check','message','state','progress','info','output','format-feedback','format-retry'].map(id=>['vd-'+id,new Element()]));
  const root=new Element();root.querySelector=selector=>ids[selector.slice(1)];
  let counter=0;const timers=new Map(),calls=[];
  runInNewContext(source,{
    OpenDeskTool:{root,request:async(operation,payload)=>{
      calls.push({operation,payload});
      if(operation==='media.format.get')return settings.read?settings.read():{output:settings.output};
      if(operation==='media.format.set'){
        if(settings.write)return settings.write(payload.output);
        settings.output=payload.output;return {output:settings.output};
      }
      return handler(operation,payload);
    }},
    document:{createElement:tag=>new Element(tag)},window:new Element(),
    setTimeout:fn=>{timers.set(++counter,fn);return counter;},clearTimeout:id=>timers.delete(id)
  });
  const descendants=(element,tag)=>element.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...descendants(child,tag)]);
  return {ids,calls,root,find:tag=>descendants(ids['vd-list'],tag),
    click:id=>ids['vd-'+id].fire('click'),
    choose:async value=>{ids['vd-output'].value=value;await ids['vd-output'].fire('change');},
    tick:async()=>{const entries=[...timers];timers.clear();for(const [,fn] of entries)await fn();await settle();}};
}
const candidate={id:'candidate',format:'hls',mode:'ready',hls:{kind:'master',audio:[],variants:[
  {id:'high',ready:true,resolution:'1280x720',bandwidth:2149280,segments:64,encryption:'clear'},
  {id:'low',ready:true,resolution:'320x184',bandwidth:246440,segments:64,encryption:'clear'}
]}};
const tsCandidate={id:'ts',format:'hls',mode:'ready',hls:{kind:'media',container:'ts',segments:2,vod:true,originalTs:true}};
test('one persistent format setting controls each one-click download',async()=>{
  const settings={output:'original'},webm={id:'webm',format:'webm',mode:'ready'};
  const handler=operation=>operation==='media.detect'?{candidates:[webm,tsCandidate]}:{taskId:'job',state:'segments'};
  const app=ui(handler,settings);await settle();
  assert.equal(app.ids['vd-output'].value,'original');
  assert.deepEqual(app.find('button').map(button=>button.textContent),['下载','下载']);
  await app.choose('mp4');
  assert.equal(app.find('button')[0].disabled,true);
  assert.match(app.find('span')[0].textContent,/WebM.*请选择「原格式」/);
  assert.match(app.find('span')[1].textContent,/自动封装为 MP4/);
  await app.find('button')[0].fire('click');
  assert.equal(app.calls.filter(row=>row.operation==='media.start').length,0);
  await app.root.fire('opendesk-page-changed');await app.click('detect');
  assert.equal(app.ids['vd-output'].value,'mp4');
  const reopened=ui(handler,settings);await settle();
  assert.equal(reopened.ids['vd-output'].value,'mp4');
  await reopened.find('button')[1].fire('click');await reopened.choose('original');
  const starts=reopened.calls.filter(row=>row.operation==='media.start');
  assert.equal(starts.length,1);
  assert.deepEqual({...starts[0].payload},{candidateId:'ts',output:'mp4'});
  const later=ui(handler,settings);await settle();await later.find('button')[0].fire('click');
  assert.deepEqual({...later.calls.at(-1).payload},{candidateId:'webm',output:'original'});
});
test('MP4 packaging failure explains the reason and offers recovery through a fresh scan',async()=>{
  const app=ui(operation=>operation==='media.detect'?{candidates:[tsCandidate]}:
    operation==='media.start'?{taskId:'job',state:'segments'}:{state:'interrupted',error:'E_MEDIA_CODEC_UNSUPPORTED'});
  await settle();await app.choose('mp4');await app.find('button')[0].fire('click');
  assert.match(app.ids['vd-info'].textContent,/正在读取分段/);
  await app.tick();
  assert.match(app.ids['vd-info'].textContent,/编码无法封装.*重新检测后可下载原分段/);
  await app.choose('original');assert.match(app.ids['vd-info'].textContent,/编码无法封装/);
  assert.equal(app.find('button')[0].disabled,true);
  await app.click('detect');assert.equal(app.find('button')[0].disabled,false);
});
test('a lost settings receipt is read back without replay or download',async()=>{
  let saved='original';
  const app=ui(operation=>operation==='media.detect'?{candidates:[tsCandidate]}:{},{
    read:()=>({output:saved}),write:value=>{saved=value;throw Error('transport disconnected');}
  });
  await settle();await app.choose('mp4');
  assert.equal(app.ids['vd-output'].value,'mp4');
  assert.equal(app.find('button')[0].disabled,false);
  assert.deepEqual(app.calls.map(row=>row.operation),['media.detect','media.format.get','media.format.set','media.format.get']);
});
test('opening the tool detects media and shows a download button without starting a download',async()=>{
  const app=ui(operation=>operation==='media.detect'?{candidates:[candidate]}:{});
  await settle();
  assert.equal(app.find('button').length,1,'opening should reveal the available download');
  assert.equal(app.find('button')[0].disabled,false);
  assert.equal(app.find('select')[0].value,'low');
  assert.deepEqual(app.calls.map(row=>row.operation),['media.detect','media.format.get']);
  await app.tick();
  assert.equal(app.calls.length,2,'discovery is a single snapshot, not background polling');
});
test('recognized encrypted HLS and DRM are explained without offering a download',async()=>{
  const candidates=['encrypted','drm'].map(encryption=>({id:encryption,format:'hls',mode:'detected_only',
    hls:{kind:'media',vod:true,segments:31,container:'ts',encryption}}));
  const app=ui(()=>({candidates,partial:true}));
  await settle();
  assert.match(app.ids['vd-message'].textContent,/已识别 2 个视频源.*没有可下载/);
  assert.match(app.find('span')[0].textContent,/31 段.*视频流已加密，无法下载/);
  assert.match(app.find('span')[1].textContent,/视频受 DRM 保护，无法下载/);
  for(const button of app.find('button')){
    assert.equal(button.textContent,'不可下载');assert.equal(button.disabled,true);await button.fire('click');
  }
  assert.deepEqual(app.calls.map(row=>row.operation),['media.detect','media.format.get']);
});
test('choose a rendition and follow a segmented task through saving without a native download ID at start',async()=>{
  const states=[{state:'segments',segmentsCompleted:3,segmentsTotal:64,bytesReceived:1000},
    {state:'remuxing',segmentsCompleted:64,segmentsTotal:64,remuxBytes:50,remuxTotalBytes:100},
    {state:'saving'},{state:'started',downloadId:7},
    {state:'complete',downloadId:7,bytesReceived:2000,totalBytes:2000,playbackVerified:false}];
  const app=ui((operation)=>operation==='media.detect'?{candidates:[candidate]}:
    operation==='media.start'?{taskId:'task',state:'segments',segmentsTotal:64}:states.shift());
  await settle();
  const select=app.find('select')[0];assert.ok(select,'rendition choice must be available');
  assert.equal(select.value,'low','default to the smallest known bitrate');
  select.value='high';await select.fire('change');
  await app.find('button')[0].fire('click');
  assert.deepEqual({...app.calls.find(x=>x.operation==='media.start').payload},{candidateId:'candidate',variantId:'high',output:'original'});
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
  await settle();await app.find('button')[0].fire('click');
  await app.click('stop');assert.equal(app.ids['vd-state'].textContent,'停止中');
  resolveStart({taskId:'task',state:'segments'});await settle();
  assert.equal(app.ids['vd-state'].textContent,'停止中');
  await app.tick();assert.equal(app.ids['vd-state'].textContent,'已取消');
  assert.doesNotMatch(app.ids['vd-message'].textContent,/正在下载|正在启动/);
  await app.root.fire('opendesk-page-changed');
  assert.equal(app.ids['vd-state'].textContent,'已取消');
  assert.match(app.ids['vd-info'].textContent,/下载已取消/,'navigation preserves the original receipt');
  assert.equal(app.calls.filter(x=>x.operation==='media.start').length,1);
});
test('navigation discards a late scan and restores detection without replay',async()=>{
  let resolveScan;
  const app=ui(()=>new Promise(resolve=>{resolveScan=resolve;}));
  await app.root.fire('opendesk-page-changed');
  resolveScan({candidates:[candidate]});await settle();
  assert.equal(app.find('button').length,0);assert.equal(app.ids['vd-detect'].disabled,false);
  assert.equal(app.calls.length,2);
});
test('unknown start outcome blocks repeat downloads and offers read-only reconciliation',async()=>{
  const app=ui(operation=>{if(operation==='media.detect')return {candidates:[candidate]};throw Error('transport disconnected');});
  await settle();await app.find('button')[0].fire('click');
  assert.equal(app.ids['vd-state'].textContent,'结果未知');assert.equal(app.ids['vd-detect'].disabled,true);
  assert.equal(app.ids['vd-stop'].disabled,true);
  assert.equal(app.ids['vd-check'].disabled,false);
  await app.find('button')[0].fire('click');assert.equal(app.calls.filter(x=>x.operation==='media.start').length,1);
});
test('late download acknowledgement after Stop stays pending until Chrome confirms cancellation',async()=>{
  let rejectStart;
  const app=ui(operation=>{
    if(operation==='media.detect')return {candidates:[candidate]};
    if(operation==='media.start')return new Promise((_,reject)=>{rejectStart=reject;});
    if(operation==='media.stop')return {taskId:'task',state:'cancel_requested'};
    return {taskId:'task',state:'cancel_requested'};
  });
  await settle();await app.find('button')[0].fire('click');
  await app.click('stop');
  rejectStart(Object.assign(Error('已请求取消迟到的下载回执；请检查 Chrome 下载列表'),{code:'E_MEDIA_STOPPED'}));
  await settle();
  assert.equal(app.ids['vd-state'].textContent,'停止中');
  assert.equal(app.ids['vd-detect'].disabled,true);
  await app.tick();
  assert.equal(app.calls.filter(x=>x.operation==='media.start').length,1);
});

test('a lost Stop receipt remains visible after navigation and is reconciled without repeating Stop',async()=>{
  const app=ui(operation=>{
    if(operation==='media.detect')return {candidates:[candidate]};
    if(operation==='media.start')return {taskId:'task',state:'started'};
    if(operation==='media.stop')throw Error('transport disconnected');
    return {taskId:'task',state:'complete',bytesReceived:50,totalBytes:50};
  });
  await settle();await app.find('button')[0].fire('click');await app.click('stop');
  await app.root.fire('opendesk-page-changed');
  assert.equal(app.find('button').length,0);
  assert.equal(app.ids['vd-state'].textContent,'结果未知');
  assert.equal(app.ids['vd-stop'].disabled,true);
  await app.click('stop');await app.click('check');
  assert.equal(app.ids['vd-state'].textContent,'Chrome 下载完成');
  assert.equal(app.calls.filter(row=>row.operation==='media.stop').length,1);
});
