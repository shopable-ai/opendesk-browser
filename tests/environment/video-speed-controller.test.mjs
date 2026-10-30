import test from 'node:test';
import assert from 'node:assert/strict';
import {pageVideoSpeed,requestVideoSpeed} from '../../projects/video-speed-controller/trusted/host.js';
import {VIDEO_SPEED_ID,VIDEO_SPEED_CAPABILITY} from '../../projects/video-speed-controller/trusted/policy.js';
import {admitsOfficialVideoSpeed,VIDEO_SPEED_VERSION,VIDEO_SPEED_MARKET_ID} from '../../projects/video-speed-controller/trusted/admission.js';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {createHash} from 'node:crypto';

const video=(playing=false,speed=1,area=100)=>({
  paused:!playing,ended:false,playbackRate:speed,
  getBoundingClientRect(){return {width:area,height:100};}
});
function fixture(){
  const top={frameId:0,documentId:'top-document',url:'https://media.example/watch'};
  const inner={frameId:2,documentId:'inner-document',url:'https://player.example/embed'};
  // Persistent mock media elements mirror a real DOM: playbackRate survives reads.
  const topVideo=video(false,1,300),innerVideo=video(true,1,800);
  const docs={
    [top.documentId]:{querySelectorAll:()=>[topVideo]},
    [inner.documentId]:{querySelectorAll:()=>[innerVideo]}
  };
  const calls=[],target={status:'available',windowId:1,tabId:4,frameId:0,
    documentId:top.documentId,url:top.url,origin:'https://media.example'};
  let stale=false,admitted=true;
  const api={
    webNavigation:{getAllFrames:async()=>[top,inner]},
    scripting:{executeScript:async req=>{
      calls.push(req);
      assert.equal(req.world,'ISOLATED');
      assert.equal(req.target.tabId,4);
      assert.equal(req.target.documentIds.length,1);
      const id=req.target.documentIds[0],frame=[top,inner].find(f=>f.documentId===id);
      assert.ok(frame);
      const before=globalThis.document;
      globalThis.document=docs[id];
      try{return [{documentId:id,frameId:frame.frameId,result:req.func(...req.args)}];}
      finally{globalThis.document=before;}
    }}
  };
  const options={api,tool:{id:VIDEO_SPEED_ID,capabilities:[VIDEO_SPEED_CAPABILITY]},
    currentPageTarget:{capture:()=>target,revalidate:async()=>{if(stale)throw Error('E_DOCUMENT_STALE');return target;}},
    assertCurrent:()=>{},assertInstalled:async()=>{if(!admitted)throw Error('E_TOOL_CHANGED');}};
  return {options,calls,docs,top,inner,setStale:value=>{stale=value;},
    setAdmitted:value=>{admitted=value;}};
}
test('HTML5 playbackRate on the active video is read and verified independently',async()=>{
  const f=fixture();
  const before=await requestVideoSpeed({...f.options,operation:'videoSpeed.status',payload:{}});
  assert.equal(before.speed,1);
  assert.equal(before.count,2);
  assert.equal(before.playing,true);
  const result=await requestVideoSpeed({...f.options,operation:'videoSpeed.set',payload:{speed:2}});
  assert.equal(result.speed,2);
  assert.equal(result.verified,true);
  assert.equal(f.docs[f.inner.documentId].querySelectorAll()[0].playbackRate,2);
  assert.equal(f.docs[f.top.documentId].querySelectorAll()[0].playbackRate,1);
  assert.equal(f.calls.filter(x=>x.args[0]==='set').length,1);
});
test('unsupported speed, foreign tool and revoked target fail before media writes',async()=>{
  const f=fixture();
  for(const speed of [-1,0,0.1,4.1,NaN,Infinity,'2',1.333]){
    await assert.rejects(requestVideoSpeed({...f.options,operation:'videoSpeed.set',payload:{speed}}),{code:'E_SCHEMA'});
  }
  await assert.rejects(requestVideoSpeed({...f.options,tool:{id:'other',capabilities:[VIDEO_SPEED_CAPABILITY]},
    operation:'videoSpeed.set',payload:{speed:2}}),{code:'E_VIDEO_CAPABILITY'});
  f.setAdmitted(false);
  await assert.rejects(requestVideoSpeed({...f.options,operation:'videoSpeed.set',payload:{speed:2}}),/E_TOOL_CHANGED/);
  assert.equal(f.calls.length,0);
});
test('no video is explicit and does not pretend success',async()=>{
  const f=fixture();
  f.docs[f.top.documentId].querySelectorAll=()=>[];
  f.docs[f.inner.documentId].querySelectorAll=()=>[];
  const status=await requestVideoSpeed({...f.options,operation:'videoSpeed.status',payload:{}});
  assert.equal(status.status,'no-video');
  await assert.rejects(requestVideoSpeed({...f.options,operation:'videoSpeed.set',payload:{speed:1.5}}),{code:'E_VIDEO_NOT_FOUND'});
  assert.equal(f.calls.filter(x=>x.args[0]==='set').length,0);
});
test('stale document is rejected without setting media rate',async()=>{
  const f=fixture();f.setStale(true);
  await assert.rejects(requestVideoSpeed({...f.options,operation:'videoSpeed.set',payload:{speed:2}}),/E_DOCUMENT_STALE/);
  assert.equal(f.calls.length,0);
});
test('page injection function is self-contained and chooses playing video',()=>{
  const before=globalThis.document;
  const paused=video(false,1,2000),playing=video(true,1,100);
  globalThis.document={querySelectorAll:()=>[paused,playing]};
  try{
    const probe=pageVideoSpeed('status');
    assert.equal(probe.index,1);
    assert.equal(probe.speed,1);
    const changed=pageVideoSpeed('set',1.75,probe.index);
    assert.equal(changed.speed,1.75);
    assert.equal(paused.playbackRate,1);
    assert.equal(playing.playbackRate,1.75);
  }finally{globalThis.document=before;}
});

test('only the official installed release can use first-party video mutation',async()=>{
  const tool=await createSidebarToolPackage('projects/video-speed-controller');
  const bytes=encodeSidebarToolPackage(tool);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const release={id:VIDEO_SPEED_MARKET_ID,toolId:VIDEO_SPEED_ID,
    version:VIDEO_SPEED_VERSION,packagePath:'official-tools/'+VIDEO_SPEED_ID+'/'+VIDEO_SPEED_ID+'.opendesk-tool.json',
    sha256,bytes:bytes.length,capabilities:tool.capabilities};
  const expectedEpoch='video-install-epoch';
  const source={[VIDEO_SPEED_ID]:{marketId:VIDEO_SPEED_MARKET_ID,
    version:VIDEO_SPEED_VERSION,sha256}};
  const admitted={tool,release,installed:[tool],provenance:source,
    enableRecords:{},epochs:{[VIDEO_SPEED_ID]:expectedEpoch},expectedEpoch};
  assert.equal(await admitsOfficialVideoSpeed(admitted),true);
  for(const changes of [
    {tool:{...tool,html:tool.html+'<p>modified</p>'}},
    {installed:[tool,{...tool}]},
    {provenance:{}},
    {provenance:{[VIDEO_SPEED_ID]:{marketId:VIDEO_SPEED_MARKET_ID,version:VIDEO_SPEED_VERSION,sha256:'0'.repeat(64)}}},
    {release:{...release,sha256:'a'.repeat(64)}},
    {enableRecords:{[VIDEO_SPEED_ID]:false}},
    {epochs:{[VIDEO_SPEED_ID]:'another-install'}},
    {expectedEpoch:'another-install'},
    {tool:{...tool,id:'other-id'}}
  ])assert.equal(await admitsOfficialVideoSpeed({...admitted,...changes}),false);
});

test('isolated key listener emits signals only; trusted Host remains the sole media writer',async()=>{
  const f=fixture(),events=[],messages=[];
  const topDocument=f.docs[f.top.documentId];
  topDocument.addEventListener=(kind,fn,capture)=>{events.push({kind,fn,capture,op:'add'});};
  topDocument.removeEventListener=(kind,fn,capture)=>{events.push({kind,fn,capture,op:'remove'});};
  const previous=globalThis.chrome;
  const nonce='00000000-0000-4000-8000-000000000001';
  globalThis.chrome={runtime:{sendMessage:async message=>{messages.push(message);}}};
  try{
    await assert.rejects(requestVideoSpeed({...f.options,
      operation:'videoSpeed.shortcuts.enable',payload:{},shortcutNonce:'bad'}),{code:'E_SCHEMA'});
    const enabled=await requestVideoSpeed({...f.options,
      operation:'videoSpeed.shortcuts.enable',payload:{},shortcutNonce:nonce});
    assert.equal(enabled.enabled,true);
    assert.equal(f.calls.filter(x=>x.args[0]==='set').length,0);
    const listener=events.find(row=>row.op==='add')?.fn;
    assert.equal(typeof listener,'function');
    const key=(letter,overrides={})=>({
      isTrusted:true,key:letter,target:{closest:()=>false,isContentEditable:false},
      composedPath:()=>[],...overrides
    });
    listener(key('d'));
    listener(key('s',{target:{closest:()=>true}})); // User is typing in a form.
    listener(key('r',{isTrusted:false})); // Site JS cannot forge a real keystroke.
    listener(key('d',{ctrlKey:true}));
    assert.deepEqual(messages,[{protocol:'opendesk.video-speed.shortcut.v1',nonce,key:'d'}]);
    assert.equal(f.docs[f.inner.documentId].querySelectorAll()[0].playbackRate,1);
    const disabled=await requestVideoSpeed({...f.options,
      operation:'videoSpeed.shortcuts.disable',payload:{}});
    assert.equal(disabled.enabled,false);
    assert.equal(events.filter(row=>row.op==='remove').length,1);
    assert.equal(f.calls.filter(x=>x.args[0]==='set').length,0);
  }finally{
    if(previous===undefined)delete globalThis.chrome;else globalThis.chrome=previous;
    delete globalThis.__opendeskVideoSpeedShortcutListener_v1;
  }
});

test('website playback override does not become an acknowledged speed change',async()=>{
  const f=fixture();
  const video=f.docs[f.inner.documentId].querySelectorAll()[0];
  Object.defineProperty(video,'playbackRate',{configurable:true,get:()=>1,set:()=>{}});
  const result=await requestVideoSpeed({...f.options,
    operation:'videoSpeed.set',payload:{speed:2}});
  assert.equal(result.requested,2);
  assert.equal(result.speed,1);
  assert.equal(result.verified,false);
});

test('preview remains a standalone demo and is not a declared production resource',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {resolve}=await import('node:path');
  const root=resolve(new URL('../..',import.meta.url).pathname);
  const config=JSON.parse(await readFile(resolve(root,'projects/video-speed-controller/tool.config.json'),'utf8'));
  const preview=await readFile(resolve(root,'projects/video-speed-controller/preview/index.html'),'utf8');
  assert.equal(config.version,'1.1.0');
  assert.deepEqual(config.capabilities,['page.videoSpeed','storage.local']);
  assert.deepEqual(Object.values(config.files).sort(),['src/index.html','src/main.js','src/style.css']);
  assert.match(preview,/<!doctype html>/i);
  assert.match(preview,/模拟/);
  assert.match(preview,/data-theme/);
});
