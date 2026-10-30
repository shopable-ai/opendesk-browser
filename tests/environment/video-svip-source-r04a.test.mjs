import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const base=new URL('../../projects/video-svip/',import.meta.url);
const read=path=>readFile(new URL(path,base),'utf8');
async function engine(){
 const src=await read('src/main.js');
 // Inject a read-only test seam into the ACTUAL shipped IIFE before bridge boot.
 const needle='const bridge=globalThis.OpenDeskTool;';
 assert.equal(src.split(needle).length,2);
 const code=src.replace(needle,
  'globalThis.__r04a={SourceRegistry,sourceContentKey,rankSources,createSourceOrchestrator,makeOwnedPlayer};\n'+needle);
 const context={OpenDeskTool:null,URL,setTimeout,clearTimeout,console};
 runInNewContext(code,context,{filename:'projects/video-svip/src/main.js'});
 return context.__r04a;
}
function owned(id,overrides={}){
 return {sourceId:'demo:'+id,type:'AUTHORIZED_MEDIA',label:id,
  platform:'self-authored',contentKey:'fixture|自制片|0-1',
  authorization:'APPROVED',rights:'SELF_AUTHORED',region:'SUPPORTED',
  entitlement:'NOT_REQUIRED',availability:'UNKNOWN',
  verificationLevel:'OWNED_VIDEO_EVENTS',mediaUrl:'https://demo.invalid/tiny.mp4',
  cost:0,...overrides};
}
const ranked=(api,sources,opts={})=>{
 const reg=new api.SourceRegistry();
 sources.forEach(item=>reg.add(item));
 return api.rankSources(reg.list(),{contentKey:'fixture|自制片|0-1',...opts});
};

test('stable source identities; rejects duplicate and invalid source types',async()=>{
 const {SourceRegistry}=await engine(),reg=new SourceRegistry();
 reg.add(owned('media'));
 assert.throws(()=>reg.add(owned('media')),/Duplicate sourceId/);
 assert.throws(()=>reg.add({...owned('other'),sourceId:'BAD ID'}),/Invalid source/);
 assert.throws(()=>reg.add({...owned('other'),type:'VIP_PARSER'}),/Invalid source/);
 assert.equal(reg.list().length,1);
 assert.equal(reg.list()[0].sourceId,'demo:media');
 assert.equal(Object.isFrozen(reg.list()[0]),true);
});

test('unknown cost/region/entitlement never become invented facts or verified rights',async()=>{
 const api=await engine();
 const rows=ranked(api,[
  owned('unknown',{region:'UNKNOWN',entitlement:'SELF_REPORTED',cost:'UNKNOWN'}),
  owned('blocked',{authorization:'DENIED'}),
  owned('wrong-work',{contentKey:'fixture|别的片|0-1'}),
  owned('wrong-region',{region:'UNSUPPORTED'}),
  owned('missing-right',{entitlement:'NONE'})
 ]);
 assert.ok(rows.every(row=>!row.playable));
 assert.equal(rows.find(row=>row.source.sourceId==='demo:unknown').source.cost,'UNKNOWN');
 assert.equal(rows.find(row=>row.source.sourceId==='demo:unknown').source.entitlement,'SELF_REPORTED');
 assert.equal(rows.find(row=>row.source.sourceId==='demo:blocked').reason,'来源未授权，禁止播放');
});

test('official openable does not claim playback; explicit user preference breaks valid ties',async()=>{
 const api=await engine();
 const rows=ranked(api,[owned('alpha'),owned('bravo'),{
  sourceId:'official:fixture',type:'OFFICIAL_LINK',label:'测试原站',
  contentKey:'fixture|自制片|0-1',pageUrl:'https://example.org/watch',
  availability:'UNKNOWN',verificationLevel:'OFFICIAL_URL'
 }],{preferredSourceId:'demo:bravo'});
 assert.equal(rows[0].source.sourceId,'demo:bravo');
 assert.equal(rows[0].playable,true);
 const link=rows.find(row=>row.source.type==='OFFICIAL_LINK');
 assert.equal(link.openable,true);assert.equal(link.playable,false);
 assert.match(link.reason,/未核验/);
});

test('only approved exact-match owned source starts; missing authorization blocks play',async()=>{
 const api=await engine(),seen=[];
 const rows=ranked(api,[owned('deny',{authorization:'DENIED'}),owned('other',{region:'UNSUPPORTED'})]);
 const runner=api.createSourceOrchestrator({
  playOwned:s=>{seen.push(s.sourceId);return Promise.resolve({outcome:'VERIFIED'});},
  stopOwned:()=>{},inspectOwned:()=>null
 });
 const result=await runner.start(rows);
 assert.equal(result.status,'ALL_UNAVAILABLE');assert.equal(seen.length,0);
});

test('definite source error falls back at most once to a second approved source',async()=>{
 const api=await engine(),seen=[];
 const rows=ranked(api,[owned('a-fails'),owned('b-backup')]);
 const runner=api.createSourceOrchestrator({
  playOwned:s=>{seen.push(s.sourceId);
   return Promise.resolve({outcome:s.sourceId==='demo:a-fails'?'FAILED':'VERIFIED',
    reason:'OBSERVED_VIDEO_EVENT'});},
  stopOwned:()=>{},inspectOwned:()=>({sourceId:'demo:b-backup',paused:false,readyState:3,currentTime:.2})
 });
 const result=await runner.start(rows);
 assert.equal(result.status,'PLAYING_VERIFIED');
 assert.equal(result.sourceId,'demo:b-backup');
 assert.equal(result.attempts.length,2);
 assert.equal(seen.join(','),'demo:a-fails,demo:b-backup');
 assert.equal(runner.readback().observation.currentTime,.2);
});

test('UNKNOWN and user gesture denial stop attempts; cannot loop over another source',async()=>{
 const api=await engine(),rows=ranked(api,[owned('first'),owned('second')]);
 for(const outcome of ['UNKNOWN','GESTURE_REQUIRED']){
  let attempts=0;
  const runner=api.createSourceOrchestrator({
   playOwned:()=>{attempts++;return Promise.resolve({outcome});},
   stopOwned:()=>{},inspectOwned:()=>null
  });
  const result=await runner.start(rows);
  assert.equal(result.status,outcome==='UNKNOWN'?'UNKNOWN':'NEEDS_USER_ACTION');
  assert.equal(attempts,1);
 }
});

test('Stop, replacement and stale async completion cannot overwrite newer operation',async()=>{
 const api=await engine(),rows=ranked(api,[owned('first')]);
 const callbacks=[],updates=[],stops=[];
 const runner=api.createSourceOrchestrator({
  playOwned:(_s,signal)=>new Promise(resolve=>{callbacks.push({resolve,signal});}),
  stopOwned:()=>stops.push('stop'),inspectOwned:()=>null,
  onUpdate:s=>updates.push(s.status)
 });
 const old=runner.start(rows);
 const oldId=runner.readback().operationId;
 const current=runner.start(rows);
 const currentId=runner.readback().operationId;
 assert.notEqual(oldId,currentId);
 assert.equal(callbacks[0].signal.aborted,true);
 callbacks[0].resolve({outcome:'VERIFIED'});await old;
 assert.equal(runner.readback().operationId,currentId);
 assert.notEqual(runner.readback().status,'PLAYING_VERIFIED');
 runner.cancel('STOPPED');
 callbacks[1].resolve({outcome:'VERIFIED'});await current;
 assert.equal(runner.readback().status,'STOPPED');
 assert.ok(stops.length>=3);
 assert.equal(updates.at(-1),'STOPPED');
});

test('owned video requires actual frame/time progress; a playing event alone is insufficient',async()=>{
 const api=await engine(),handlers=new Map();
 const video={dataset:{},readyState:3,currentTime:0,videoWidth:640,paused:true,ended:false,error:null,
  src:'',pause(){this.paused=true;},load(){},removeAttribute(){this.src='';},
  addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);},
  getVideoPlaybackQuality(){return {totalVideoFrames:1};},
  play(){this.paused=false;
   queueMicrotask(()=>{handlers.get('playing')?.();this.currentTime=.21;handlers.get('timeupdate')?.();});
   return Promise.resolve();
  }
 };
 const source=owned('one'),player=api.makeOwnedPlayer(video,new Set([source.mediaUrl]));
 const result=await player.play(source,new AbortController().signal,1000);
 assert.equal(result.outcome,'VERIFIED');
 assert.match(result.reason,/VIDEO_FRAME_AND_TIME/);
 assert.equal(player.inspect().sourceId,source.sourceId);
 assert.ok(player.inspect().currentTime>.08);
 player.stop();
 assert.equal(player.inspect().sourceId,null);
 assert.equal(video.paused,true);
 assert.equal(handlers.size,0);
});

test('video blocked by user activation returns GESTURE_REQUIRED, not a fictitious success',async()=>{
 const api=await engine(),video={
  dataset:{},paused:true,currentTime:0,videoWidth:0,readyState:0,src:'',
  pause(){},load(){},removeAttribute(){},
  addEventListener(){},removeEventListener(){},
  play(){return Promise.reject(Object.assign(Error('gesture'),{name:'NotAllowedError'}));}
 };
 const source=owned('one'),player=api.makeOwnedPlayer(video,new Set([source.mediaUrl]));
 const result=await player.play(source,new AbortController().signal,1000);
 assert.equal(result.outcome,'GESTURE_REQUIRED');
});

test('canonical formal HTML is literally shared by preview and legacy features remain',async()=>{
 const [html,preview,js,css]=await Promise.all([
  read('src/index.html'),read('preview/index.html'),read('src/main.js'),read('src/style.css')
 ]);
 assert.ok(preview.includes(html.trim()));
 assert.ok(preview.includes('src="../src/main.js"')&&preview.includes('href="../src/style.css"'));
 for(const id of ['vp-member-form','vp-open','vp-stop','vp-evidence','vp-source-list',
  'vp-source-play','vp-owned-video','vp-source-evidence'])assert.ok(html.includes('id="'+id+'"'));
 for(const scene of ['r04a-success','r04a-fallback','r04a-unavailable',
  'r04a-unauthorized','r04a-region','r04a-entitlement','r04a-manual','r04a-unknown'])
  assert.ok(preview.includes('data-demo="'+scene+'"'));
 assert.ok(js.includes("request('videoSVIP.inspect'")&&js.includes("request('videoSVIP.stop'"));
 assert.ok(js.includes("request('storage.set'")&&js.includes('ifMatch:etag'));
 assert.ok(css.includes('.vp-owned-video[hidden]'));
 assert.doesNotMatch(js,/GM_xmlhttpRequest|unsafeWindow|document\.cookie|HTMLMediaElement\.prototype/);
 assert.doesNotThrow(()=>new Function(js));
});
