import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const queueSource=await readFile(new URL('../src/batch.js',import.meta.url),'utf8');
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
  const ids=Object.fromEntries(['list','detect','stop','check','message','state','progress','info','output','format-feedback','format-retry',
    'batch-list','addresses','job','playing-name','pages','jobs','queue','batch-message','address-summary','import',
    'open-next','redetect','skip','run','pause','batch','single','batch-mode','single-mode','auto-open'].map(id=>['vd-'+id,new Element()]));
  const root=new Element();root.querySelector=selector=>ids[selector.slice(1)];
  let counter=0;const timers=new Map(),calls=[];
  runInNewContext(queueSource+'\n'+source,{
    URL,TextEncoder,queueMicrotask,
    OpenDeskTool:{root,request:async(operation,payload)=>{
      calls.push({operation,payload});
      if(operation==='media.format.get')return settings.read?settings.read():{output:settings.output};
      if(operation==='media.format.set'){
        if(settings.write)return settings.write(payload.output);
        settings.output=payload.output;return {output:settings.output};
      }
      return handler(operation,payload);
    }},
    document:{createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},window:new Element(),
    setTimeout:fn=>{timers.set(++counter,fn);return counter;},clearTimeout:id=>timers.delete(id)
  });
  const descendants=(element,tag)=>element.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...descendants(child,tag)]);
  return {ids,calls,root,find:(tag,section='list')=>descendants(ids['vd-'+section],tag),
    click:id=>ids['vd-'+id].fire('click'),
    type:async(id,value)=>{ids['vd-'+id].value=value;await ids['vd-'+id].fire('input');},
    choose:async value=>{ids['vd-output'].value=value;await ids['vd-output'].fire('change');},
    tick:async()=>{const entries=[...timers];timers.clear();for(const [,fn] of entries)await fn();await settle();}};
}
const candidate={id:'candidate',format:'hls',mode:'ready',hls:{kind:'master',audio:[],variants:[
  {id:'high',ready:true,resolution:'1280x720',bandwidth:2149280,segments:64,encryption:'clear'},
  {id:'low',ready:true,resolution:'320x184',bandwidth:246440,segments:64,encryption:'clear'}
]}};
const tsCandidate={id:'ts',format:'hls',mode:'ready',hls:{kind:'media',container:'ts',segments:2,vod:true,originalTs:true}};
const mp4Candidate={id:'mp4',format:'mp4',mode:'ready'};
const webmCandidate={id:'webm',format:'webm',mode:'ready'};
const urlOne='https://one.example/video?q=1#t=20',urlTwo='https://two.example/片段';
const absoluteTwo=new URL(urlTwo).href;
const errorCode=code=>Object.assign(Error(code),{code});
async function importLinks(app,urls){
  await app.click('batch-mode');await app.type('addresses',urls.join('\n'));await app.click('import');
}
function batchUI({candidates=ref=>ref==='owned-1'?[candidate,mp4Candidate]:[webmCandidate],
  createError=null,start=null,status=null,stop=null,getOwned=null,detect=null}={}){
  const tabs=new Map();
  return ui((op,input)=>{
    if(op==='browser.tabs.create'){
      if(createError)throw errorCode(createError);
      const tabRef='owned-'+(tabs.size+1);tabs.set(tabRef,input.url);return {tabRef};
    }
    if(op==='browser.tabs.getOwned')return getOwned?getOwned(input.tabRef,tabs):{tabRef:input.tabRef,url:tabs.get(input.tabRef)};
    if(op==='browser.tabs.activateOwned')return {focused:true};
    if(op==='browser.tabs.removeOwned')return {closed:true};
    if(op==='media.detect')return input.tabRef?
      (detect?detect(input.tabRef):{title:'片段测试',candidates:candidates(input.tabRef)}):{candidates:[]};
    if(op==='media.start')return start?start(input):{taskId:input.candidateId,state:'started'};
    if(op==='media.status')return status?status(input):{state:'complete',filename:'Chrome 实际名称.mp4'};
    if(op==='media.stop')return stop?stop(input):{state:'cancelled'};
    throw Error('Unexpected operation: '+op);
  });
}
const ops=(app,name)=>app.calls.filter(row=>row.operation===name).map(row=>({...row.payload}));
const queueRows=(app,tag)=>app.find(tag,'jobs');
test('imports up to eight normalized web addresses and reports whitespace, duplicates and invalid rows',async()=>{
  const app=batchUI();await settle();await app.click('batch-mode');
  assert.equal(app.ids['vd-batch-mode'].attributes['aria-pressed'],'true');
  await app.type('addresses',['', ' https://ONE.example:443/video?q=1#t=20 ',urlOne,
    'ftp://one.example/video','http://user:pass@one.example/', 'https://one.example/'+ 'a'.repeat(2048)].join('\n'));
  assert.match(app.ids['vd-address-summary'].textContent,/有效 1 条.*重复 1 条.*无效 3 条（第 4、5、6 行）/);
  await app.click('import');assert.equal(app.find('li','pages').length,1);
  await app.click('open-next');assert.deepEqual(ops(app,'browser.tabs.create'),[{url:urlOne}]);
  assert.deepEqual(ops(app,'media.detect'),[{}, {tabRef:'owned-1'}]);
  const many=batchUI();await settle();const urls=Array.from({length:9},(_,i)=>'https://example.com/'+i);
  await importLinks(many,urls);
  assert.match(many.ids['vd-address-summary'].textContent,/有效 9 条.*超过 8 条/);
  assert.equal(many.find('li','pages').length,0);
  await importLinks(many,urls.slice(0,8));assert.equal(many.find('li','pages').length,8);
});
test('groups a rendition with its video, serializes all media across two origins, and shows the saved basename',async()=>{
  const app=batchUI();await settle();await importLinks(app,[urlOne,urlTwo]);await app.click('open-next');
  assert.deepEqual(ops(app,'browser.tabs.create'),[{url:urlOne}]);
  assert.equal(app.find('button','batch-list').length,2);
  const quality=app.find('select','batch-list')[0];quality.value='1';await quality.fire('change');
  const name=app.find('input','batch-list')[0];assert.equal(name.value,'001-片段测试-1');
  name.value='我的视频';await name.fire('input');
  await app.find('button','batch-list')[0].fire('click');await app.find('button','batch-list')[1].fire('click');
  const queuedName=queueRows(app,'input')[0];queuedName.value='最终名称';await queuedName.fire('input');
  await app.click('run');await app.click('run');assert.equal(queuedName.disabled,true);
  assert.deepEqual(ops(app,'media.start'),[{candidateId:'candidate',variantId:'high',output:'original',filename:'最终名称'}]);
  assert.equal(app.ids['vd-open-next'].disabled,true);
  await app.tick();assert.equal(ops(app,'media.start').length,2);
  assert.match(queueRows(app,'strong')[0].textContent,/Chrome 实际名称.mp4/);
  await app.tick();assert.equal(app.ids['vd-open-next'].disabled,false);
  assert.equal(ops(app,'browser.tabs.create').length,1,'automatic open defaults to off');
  await app.click('open-next');assert.deepEqual(ops(app,'browser.tabs.create'),[{url:urlOne},{url:absoluteTwo}]);
  assert.equal(app.find('input','batch-list')[0].value,'002-片段测试');
  await app.find('button','batch-list')[0].fire('click');await app.click('run');await app.tick();
  assert.equal(ops(app,'media.start').at(-1).candidateId,'webm');
  await app.find('button','pages')[0].fire('click');
  assert.deepEqual(ops(app,'browser.tabs.removeOwned'),[{tabRef:'owned-1'}]);
});
test('uses the page title as a filename stem without inheriting path separators',async()=>{
  const app=batchUI({detect:()=>({title:'页面/标题\\示例%252f章节',candidates:[mp4Candidate]})});await settle();
  await importLinks(app,[urlOne]);await app.click('open-next');
  assert.equal(app.find('input','batch-list')[0].value,'001-页面 标题 示例 章节');
});
test('rechecks the owned Document on a slow page without reopening it or following a replacement',async t=>{
  for(const replaced of [false,true])await t.test(replaced?'replaced Document':'initial Document becomes ready',async()=>{
    let checks=0,detections=0;
    const app=batchUI({getOwned(tabRef,tabs){
      if(++checks===2&&replaced)throw errorCode('E_TAB_REF_INVALID');
      return {tabRef,url:tabs.get(tabRef)};
    },detect(){
      if(++detections===1)throw errorCode('E_DOCUMENT_UNRESOLVED');
      return {candidates:[mp4Candidate]};
    }});
    await importLinks(app,[urlOne]);await app.click('open-next');await app.tick();
    assert.equal(checks,2);assert.equal(detections,replaced?1:2);
    assert.equal(ops(app,'browser.tabs.create').length,1);
    assert.equal(ops(app,'media.start').length,0);
    assert.equal(app.find('button','batch-list').length,replaced?0:1);
    if(replaced)assert.match(app.ids['vd-batch-message'].textContent,/文档已变化/);
  });
});
test('pauses on approval failure and invalidates closed or changed documents before a start',async()=>{
  const denied=batchUI({createError:'E_TOOL_CAPABILITY_REQUIRED'});await settle();
  await importLinks(denied,[urlOne,urlTwo]);await denied.click('open-next');
  assert.match(denied.ids['vd-batch-message'].textContent,/授权/);
  assert.equal(denied.ids['vd-open-next'].disabled,true);assert.equal(ops(denied,'media.detect').length,1);
  const closed=batchUI({getOwned(){throw errorCode('E_TAB_REF_INVALID');}});await settle();
  await importLinks(closed,[urlOne]);await closed.click('open-next');
  assert.match(closed.ids['vd-batch-message'].textContent,/关闭或文档已变化/);
  assert.equal(ops(closed,'media.detect').length,1);
  const changed=batchUI();await settle();await importLinks(changed,[urlOne,urlTwo]);await changed.click('open-next');
  await changed.find('button','batch-list')[0].fire('click');await changed.root.fire('opendesk-page-changed');
  assert.equal(changed.find('button','batch-list').length,0);assert.equal(changed.ids['vd-run'].disabled,true);
  assert.match(queueRows(changed,'span')[0].textContent,/候选已失效/);
  await changed.click('redetect');assert.deepEqual(ops(changed,'browser.tabs.activateOwned'),[{tabRef:'owned-1'}]);
  assert.equal(ops(changed,'media.start').length,0);
});
test('auto next only opens after verified completion and does not bypass an empty page',async()=>{
  const app=batchUI({candidates:ref=>ref==='owned-1'?[mp4Candidate]:[]});await settle();
  await importLinks(app,[urlOne,urlTwo,'https://three.example/']);
  const auto=app.ids['vd-auto-open'];auto.checked=true;await auto.fire('change');await app.click('open-next');
  await app.find('button','batch-list')[0].fire('click');await app.click('run');
  assert.equal(ops(app,'browser.tabs.create').length,1);
  await app.tick();assert.equal(ops(app,'browser.tabs.create').length,2);
  assert.match(app.ids['vd-batch-message'].textContent,/未发现.*播放/);
  assert.equal(app.ids['vd-open-next'].disabled,true);assert.equal(ops(app,'media.start').length,1);
});
test('Stop, unknown readback, and unverified final receipts each keep the next task paused',async t=>{
  for(const mode of ['stop','unknown','complete_unverified'])await t.test(mode,async()=>{
    const receipts=mode==='unknown'?[{state:'unknown'},{state:'in_progress'},{state:'complete'}]:[{state:mode}];
    const app=batchUI({status:()=>receipts.shift()});await settle();
    await importLinks(app,[urlOne,urlTwo]);const auto=app.ids['vd-auto-open'];auto.checked=true;await auto.fire('change');
    await app.click('open-next');
    for(const button of app.find('button','batch-list'))await button.fire('click');
    await app.click('run');
    if(mode==='stop'){await app.click('stop');assert.equal(ops(app,'media.stop').length,1);}
    else await app.tick();
    if(mode==='unknown'){
      assert.equal(app.ids['vd-check'].hidden,false);assert.equal(queueRows(app,'input')[0].disabled,true);
      await app.click('check');await app.tick();
      assert.equal(app.ids['vd-check'].hidden,true);
    }
    if(mode==='complete_unverified')assert.match(queueRows(app,'span')[0].textContent,/文件未核实/);
    assert.equal(app.ids['vd-pause'].disabled,true);
    assert.equal(ops(app,'media.start').length,1);assert.equal(ops(app,'browser.tabs.create').length,1);
    assert.equal(app.ids['vd-open-next'].disabled,true);
  });
});
test('one persistent format setting controls each one-click download',async()=>{
  const settings={output:'original'},webm={id:'webm',format:'webm',mode:'ready'};
  const handler=operation=>operation==='media.detect'?{candidates:[webm,tsCandidate]}:{taskId:'job',state:'segments'};
  const app=ui(handler,settings);await settle();
  assert.equal(app.ids['vd-output'].value,'original');
  assert.deepEqual(app.find('button').map(button=>button.attributes['aria-label']),['下载视频 1','下载视频 2']);
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
  assert.match(app.find('option')[Number(app.find('select')[0].value)].textContent,/184p/);
  assert.deepEqual(app.calls.map(row=>row.operation),['media.detect','media.format.get']);
  await app.tick();
  assert.equal(app.calls.length,2,'discovery is a single snapshot, not background polling');
});
test('recognized encrypted HLS and DRM are explained without offering a download',async()=>{
  const candidates=['encrypted','drm'].map(encryption=>({id:encryption,format:'hls',mode:'detected_only',
    hls:{kind:'media',vod:true,segments:31,container:'ts',encryption}}));
  const app=ui(()=>({candidates,partial:true}));
  await settle();
  assert.match(app.ids['vd-message'].textContent,/已识别 2 个视频.*没有可下载/);
  assert.match(app.find('span')[0].textContent,/31 段.*视频流已加密，无法下载/);
  assert.match(app.find('span')[1].textContent,/视频受 DRM 保护，无法下载/);
  assert.equal(app.find('button').length,0);
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
  assert.match(app.find('option')[Number(select.value)].textContent,/184p/,'default to the smallest known bitrate');
  select.value='1';await select.fire('change');
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

test('alternative formats share one direct action while independent videos remain separate',async()=>{
  const candidates=[
    {id:'playing',videoKey:'first',format:'mp4',mode:'ready'},
    {id:'alternative',videoKey:'first',format:'webm',mode:'ready'},
    {id:'independent',videoKey:'second',format:'mp4',mode:'ready'}
  ];
  const app=ui(op=>op==='media.detect'?{candidates}:{taskId:'done',state:'complete'});
  await settle();
  assert.equal(app.ids['vd-list'].children.length,2);
  assert.equal(app.find('button').length,2);
  assert.equal(app.find('select').length,1);
  await app.find('button')[0].fire('click');
  const select=app.find('select')[0];select.value='1';await select.fire('change');
  assert.equal(app.calls.filter(row=>row.operation==='media.start').length,1);
  await app.choose('mp4');
  assert.match(app.find('span')[0].textContent,/WebM.*原格式/);
  assert.equal(app.find('button')[0].disabled,true);
  await app.choose('original');await app.find('button')[0].fire('click');
  assert.deepEqual(app.calls.filter(row=>row.operation==='media.start').map(row=>[row.payload.candidateId,row.payload.output]),[
    ['playing','original'],['alternative','original']
  ]);
});
