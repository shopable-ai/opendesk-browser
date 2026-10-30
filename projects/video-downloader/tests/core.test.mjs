import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {classifyMedia} from '../trusted/policy.js';
import {hlsAttributes,parseHlsPlaylist} from '../trusted/hls.js';
import {createVideoDownloaderHost} from '../trusted/host.js';

const dir=join(dirname(fileURLToPath(import.meta.url)),'fixtures');
const fixture=async name=>readFile(join(dir,name),'utf8');
const doc=(pageUrl='https://fixture.example/page')=>({status:'available',windowId:3,tabId:8,frameId:0,documentId:'doc-1',
  url:pageUrl,origin:new URL(pageUrl).origin,title:'Fixture'});
function rig({urls=['https://fixture.example/tiny.mp4'],sourceMime='',allowed=true,fetcher,
  actionState='in_progress',exists=true,bytesReceived=100,totalBytes=200,
  pageUrl='https://fixture.example/page'}={}){
  let target=doc(pageUrl),failDoc=false,admit=true,downloadId=100,downloadCalls=0,cancelled=[],permissionsSeen=[],submitted=[];
  let resultsState={state:actionState,exists,bytesReceived,totalBytes,error:null};
  let exportReady=null;
  const api={
    permissions:{contains:async value=>{permissionsSeen.push(value.origins);return allowed;}},
    webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:target.documentId,
      url:target.url,documentLifecycle:'active'}]},
    scripting:{executeScript:async()=>[{frameId:0,documentId:target.documentId,
      result:urls.map(url=>({url,mime:sourceMime,playing:true}))}]},
    downloads:{
      download:async options=>{downloadCalls++;submitted.push(options);return downloadId;},
      search:async({id})=>[{id,...resultsState}],
      cancel:async id=>{cancelled.push(id);}
    }
  };
  const currentPageTarget={
    capture:()=>({...target}),
    revalidate:async old=>{
      if(failDoc||!old||old.documentId!==target.documentId||old.tabId!==target.tabId)
        throw Object.assign(new Error('changed'),{code:'E_DOCUMENT_STALE'});
    }
  };
  let counter=0;
  const host=createVideoDownloaderHost({
    api,currentPageTarget,fetcher,
    uuid:()=>String(++counter).padStart(8,'0'),
    clock:()=>1234
  });
  const request=(operation,payload={},options={})=>host.request({
    tool:{id:'video-downloader',capabilities:['page.mediaDownload']},
    operation,payload,assertCurrent:()=>{},
    assertInstalled:async()=>{if(!admit)throw Object.assign(new Error('revoked'),{code:'E_MEDIA_TRUST'});},
    ...options
  });
  return {request,host,api,currentPageTarget,refuse:()=>{admit=false;},
    navigate:()=>{target={...target,documentId:'doc-2'};failDoc=true;},
    state:v=>{resultsState={...resultsState,...v};},
    setDownload:fn=>{api.downloads.download=fn;},
    get calls(){return downloadCalls;},
    get cancelled(){return cancelled;},
    get submitted(){return submitted;},
    get permissionsSeen(){return permissionsSeen;}
  };
}

test('classify MP4 WebM HLS DASH with strict HTTP(S) and same-origin boundary',()=>{
  assert.equal(classifyMedia('https://fixture.example/x.mp4?signature=not-stored','','https://fixture.example').format,'mp4');
  assert.equal(classifyMedia('https://fixture.example/x.webm','','https://fixture.example').format,'webm');
  assert.equal(classifyMedia('https://fixture.example/master.m3u8','','https://fixture.example').format,'hls');
  assert.equal(classifyMedia('https://fixture.example/live.mpd','','https://fixture.example').format,'dash');
  assert.equal(classifyMedia('https://cdn.example/x.mp4','','https://fixture.example').allowed,false);
  assert.equal(classifyMedia('blob:https://fixture.example/x','','https://fixture.example'),null);
  assert.equal(classifyMedia('file:///private/movie.mp4','','https://fixture.example'),null);
  assert.equal(classifyMedia('https://user:password@fixture.example/x.mp4','','https://fixture.example'),null);
});
test('parse HLS master resolution, bandwidth and audio groups',async()=>{
  const parsed=parseHlsPlaylist(await fixture('master.m3u8'));
  assert.equal(parsed.kind,'master');
  assert.equal(parsed.variants.length,2);
  assert.equal(parsed.variants[0].resolution,'160x90');
  assert.equal(parsed.variants[1].bandwidth,320000);
  assert.equal(parsed.audio[0].group,'a');
  assert.equal(parsed.encryption,'unknown');
  assert.equal(parsed.vod,false);
});
test('HLS media, AES-128 and DRM indicators remain distinct',async()=>{
  const media=parseHlsPlaylist(await fixture('media.m3u8'));
  assert.equal(media.kind,'media');assert.equal(media.segments,1);
  assert.equal(media.vod,true);assert.equal(media.encryption,'clear');
  assert.equal(parseHlsPlaylist(await fixture('encrypted.m3u8')).encryption,'encrypted');
  assert.equal(parseHlsPlaylist(await fixture('drm.m3u8')).encryption,'drm');
  assert.deepEqual(hlsAttributes('RESOLUTION=320x180,BANDWIDTH=420000'),{
    RESOLUTION:'320x180',BANDWIDTH:'420000'
  });
  assert.throws(()=>parseHlsPlaylist('not HLS'),/E_HLS_INVALID/);
});
test('official synthetic MP4 Fixture has real binary container',async()=>{
  const mp4=await readFile(join(dir,'tiny.mp4'));
  assert.ok(mp4.length>500&&mp4.subarray(4,8).toString()==='ftyp');
});
test('localhost native permission omits port but candidate remains exact-origin',async()=>{
  const r=rig({pageUrl:'http://127.0.0.1:43112/index.html',urls:[
    'http://127.0.0.1:43112/tiny.mp4','http://127.0.0.1:43113/tiny.mp4'
  ]});
  const d=await r.request('media.detect');
  assert.ok(r.permissionsSeen.length>0);
  for(const origins of r.permissionsSeen)assert.deepEqual(origins,['http://127.0.0.1/*']);
  assert.equal(d.candidates.length,2);
  assert.equal(d.candidates.filter(x=>x.mode==='ready').length,1);
  assert.equal(d.candidates.filter(x=>x.mode==='detected_only').length,1);
});
test('no video and duplicate URL results',async()=>{
  const empty=rig({urls:[]});
  const none=await empty.request('media.detect');
  assert.equal(none.state,'no-video');assert.equal(none.candidates.length,0);
  const same=rig({urls:['https://fixture.example/tiny.mp4','https://fixture.example/tiny.mp4']});
  const result=await same.request('media.detect');
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].mode,'ready');
  assert.equal(JSON.stringify(result).includes('https://'),false,'media URL must not escape trusted host');
});
test('direct MP4 returns real downloadId, progress and independently confirmed Chrome completion',async()=>{
  const r=rig();
  const d=await r.request('media.detect');
  const receipt=await r.request('media.start',{candidateId:d.candidates[0].id});
  assert.equal(receipt.downloadId,100);
  assert.equal(receipt.state,'started');assert.equal(r.calls,1);
  assert.equal((await r.request('media.status',{taskId:receipt.taskId})).state,'in_progress');
  r.state({state:'complete',exists:false,bytesReceived:200,totalBytes:200});
  assert.equal((await r.request('media.status',{taskId:receipt.taskId})).state,'complete_unverified');
  r.state({state:'complete',exists:true,bytesReceived:0,totalBytes:200});
  assert.equal((await r.request('media.status',{taskId:receipt.taskId})).state,'complete_unverified');
  r.state({state:'complete',exists:true,bytesReceived:200,totalBytes:200});
  const completed=await r.request('media.status',{taskId:receipt.taskId});
  assert.equal(completed.state,'complete');
  assert.equal(completed.playbackVerified,false,'file decode was not proven');
});
test('explicit stop requests Chrome cancel and can never auto-restart',async()=>{
  const r=rig();const result=await r.request('media.detect');
  const receipt=await r.request('media.start',{candidateId:result.candidates[0].id});
  const stopped=await r.request('media.stop',{taskId:receipt.taskId});
  assert.equal(stopped.state,'cancel_requested');
  assert.deepEqual(r.cancelled,[100]);
  assert.equal(r.calls,1);
  await assert.rejects(r.request('media.start',{candidateId:result.candidates[0].id}),error=>error.code==='E_MEDIA_STALE');
  r.state({state:'interrupted',error:'USER_CANCELED'});
  assert.equal((await r.request('media.status',{taskId:receipt.taskId})).state,'cancelled');
});
test('stop while native download ID is pending consumes the late result',async()=>{
  const r=rig();const d=await r.request('media.detect');
  let deliver,notify;
  const entered=new Promise(resolve=>{notify=resolve;});
  r.setDownload(()=>{notify();return new Promise(resolve=>{deliver=resolve;});});
  const starting=r.request('media.start',{candidateId:d.candidates[0].id});
  await entered;
  const stopped=await r.request('media.stop',{});
  assert.equal(stopped.state,'cancel_requested');
  deliver(77);
  await assert.rejects(starting,error=>error.code==='E_MEDIA_STOPPED');
  assert.deepEqual(r.cancelled,[77]);
});
test('Stop while waiting for admission blocks downloading before calling Chrome',async()=>{
  const r=rig();const d=await r.request('media.detect');
  let unblock,notify;
  const gate=new Promise(resolve=>{unblock=resolve;});
  const waiting=new Promise(resolve=>{notify=resolve;});
  const starting=r.request('media.start',{candidateId:d.candidates[0].id},{
    assertInstalled:async()=>{notify();await gate;}
  });
  await waiting;await r.request('media.stop',{});
  unblock();
  await assert.rejects(starting,error=>error.code==='E_MEDIA_STOPPED');
  assert.equal(r.calls,0);
});
test('navigation and revocation reject stale operations and clear downloads',async()=>{
  const r=rig();
  const d=await r.request('media.detect');
  r.navigate();
  await assert.rejects(r.request('media.start',{candidateId:d.candidates[0].id}),error=>error.code==='E_DOCUMENT_STALE');
  assert.equal(r.calls,0);
  const r2=rig();const second=await r2.request('media.detect');
  r2.refuse();
  await assert.rejects(r2.request('media.start',{candidateId:second.candidates[0].id}),/revoked/);
  assert.equal(r2.calls,0);
  const noGrant=rig({allowed:false});
  await assert.rejects(noGrant.request('media.detect'),error=>error.code==='E_MEDIA_PERMISSION');
});
test('cross-origin candidate is metadata-only and rejects any native download',async()=>{
  const r=rig({urls:['https://cdn.other.example/tiny.mp4']});
  const d=await r.request('media.detect');
  assert.equal(d.candidates[0].mode,'detected_only');
  await assert.rejects(r.request('media.start',{candidateId:d.candidates[0].id}),
    error=>error.code==='E_MEDIA_UNSUPPORTED');
  assert.equal(r.calls,0);
});
test('revoked source grant is checked again immediately before a direct save',async()=>{
  const r=rig(),d=await r.request('media.detect');
  r.api.permissions.contains=async()=>false;
  await assert.rejects(r.request('media.start',{candidateId:d.candidates[0].id}),error=>error.code==='E_MEDIA_PERMISSION');
  assert.equal(r.calls,0);
});
test('clear complete HLS VOD is downloadable; 403 degrades without a download',async()=>{
  const body=await fixture('media.m3u8');
  const r=rig({urls:['https://fixture.example/media.m3u8'],
    fetcher:async()=>new Response(body,{headers:{'content-type':'application/vnd.apple.mpegurl'}})});
  const d=await r.request('media.detect');
  assert.equal(d.candidates[0].mode,'ready');
  assert.equal(d.candidates[0].hls.kind,'media');
  assert.equal(d.candidates[0].hls.segments,1);
  assert.equal(r.calls,0,'detection does not save media');
  const missing=rig({urls:['https://fixture.example/expired.m3u8'],
    fetcher:async()=>new Response('Forbidden',{status:403})});
  const x=await missing.request('media.detect');
  assert.equal(x.candidates[0].note,'E_HLS_HTTP');
  assert.equal(x.candidates[0].mode,'detected_only');
  assert.equal(missing.calls,0);
});
const ts=()=>{const bytes=new Uint8Array(188*3);for(let i=0;i<bytes.length;i+=188){bytes[i]=0x47;bytes[i+3]=0x10;}return bytes;};
const clearVod='#EXTM3U\n#EXTINF:2,\nsegment.ts\n#EXT-X-ENDLIST\n';
const streamRig=options=>rig({urls:['https://fixture.example/media.m3u8'],fetcher:async url=>
  new Response(url.endsWith('.m3u8')?clearVod:ts()),...options});
const until=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('expected task state was not reached');};
test('HLS saves every segment as a truthful TS Blob and only Chrome confirms completion',async()=>{
  const r=streamRig(),d=await r.request('media.detect');
  const receipt=await r.request('media.start',{candidateId:d.candidates[0].id});
  assert.equal(receipt.state,'segments');assert.equal(receipt.downloadId,undefined);
  await until(()=>r.calls===1);
  const options=r.submitted[0];assert.match(options.filename,/\.ts$/);assert.match(options.url,/^blob:/);
  assert.deepEqual(new Uint8Array(await (await fetch(options.url)).arrayBuffer()),ts());
  let status=await r.request('media.status',{taskId:receipt.taskId});
  assert.equal(status.state,'in_progress');assert.equal(status.playbackVerified,false);
  r.state({state:'complete',bytesReceived:ts().length,totalBytes:ts().length});
  status=await r.request('media.status',{taskId:receipt.taskId});
  assert.equal(status.state,'complete');assert.equal(status.stream.segments,1);
  await assert.rejects(fetch(options.url),'terminal status releases the object URL');
});
test('a failed HLS segment interrupts without calling Chrome or retaining URL metadata in the UI receipt',async()=>{
  const r=streamRig({fetcher:async url=>new Response(url.endsWith('.m3u8')?clearVod:'expired',
    {status:url.endsWith('.m3u8')?200:403})});
  const d=await r.request('media.detect');assert.ok(!JSON.stringify(d).includes('https://fixture.example'));
  const receipt=await r.request('media.start',{candidateId:d.candidates[0].id});
  let status;await until(async()=>{status=await r.request('media.status',{taskId:receipt.taskId});return status.state==='interrupted';});
  assert.equal(status.error,'E_MEDIA_HTTP');assert.equal(r.calls,0);
});
test('a master session key cannot be bypassed by clear child playlists',async()=>{
  const master='#EXTM3U\n#EXT-X-SESSION-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.example",URI="key"\n#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=320x180\nmedia.m3u8\n';
  const r=rig({urls:['https://fixture.example/master.m3u8'],fetcher:async url=>new Response(url.endsWith('master.m3u8')?master:clearVod)});
  const d=await r.request('media.detect');assert.equal(d.candidates[0].mode,'detected_only');
  await assert.rejects(r.request('media.start',{candidateId:d.candidates[0].id,variantId:d.candidates[0].hls.variants[0].id}),error=>error.code==='E_MEDIA_UNSUPPORTED');
});
test('unknown native HLS save remains unknown after Stop and blocks replay across invalidation',async()=>{
  const r=streamRig(),d=await r.request('media.detect');
  r.setDownload(async()=>{throw Error('native disconnected');});
  const receipt=await r.request('media.start',{candidateId:d.candidates[0].id});
  await until(async()=>(await r.request('media.status',{taskId:receipt.taskId})).state==='unknown');
  assert.equal((await r.request('media.stop',{taskId:receipt.taskId})).state,'unknown');
  r.host.invalidate();
  await assert.rejects(r.request('media.detect'),error=>error.code==='E_OUTCOME_UNKNOWN');
});
test('HLS Stop consumes a late native ID and keeps its Blob until Chrome confirms termination',async()=>{
  const r=streamRig(),d=await r.request('media.detect');
  let deliver,notify,url;
  const entered=new Promise(resolve=>{notify=resolve;});
  r.setDownload(options=>{url=options.url;notify();return new Promise(resolve=>{deliver=resolve;});});
  const receipt=await r.request('media.start',{candidateId:d.candidates[0].id});
  await entered;await r.request('media.stop',{taskId:receipt.taskId});
  assert.equal((await fetch(url)).ok,true);
  deliver(77);await until(()=>r.cancelled.includes(77));
  r.state({state:'interrupted',error:'USER_CANCELED'});
  assert.equal((await r.request('media.status',{taskId:receipt.taskId})).state,'cancelled');
  await assert.rejects(fetch(url));
});
test('revocation during a segment aborts before a Blob or native save can be produced',async()=>{
  let notify,release;
  const entered=new Promise(resolve=>{notify=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const r=streamRig({fetcher:async url=>{
    if(url.endsWith('.m3u8'))return new Response(clearVod);
    notify();await gate;return new Response(ts());
  }});
  const d=await r.request('media.detect');await r.request('media.start',{candidateId:d.candidates[0].id});
  await entered;r.refuse();r.host.invalidate();release();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(r.calls,0);
});
test('native terminal event releases a Blob after the UI document is invalidated',async()=>{
  const r=streamRig();const listeners=new Set();
  r.api.downloads.onChanged={addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};
  const d=await r.request('media.detect');await r.request('media.start',{candidateId:d.candidates[0].id});
  await until(()=>r.calls===1);const url=r.submitted[0].url;
  r.host.invalidate();await until(()=>r.cancelled.length===1);
  for(const fn of listeners)fn({id:100,state:{current:'interrupted'}});
  await assert.rejects(fetch(url));assert.equal(listeners.size,0);
});
test('a Stop for another task cannot invalidate a valid candidate',async()=>{
  const r=rig(),d=await r.request('media.detect');
  await assert.rejects(r.request('media.stop',{taskId:'another-task'}),error=>error.code==='E_MEDIA_TASK');
  await r.request('media.start',{candidateId:d.candidates[0].id});assert.equal(r.calls,1);
});
test('parallel HLS segment authority checks serialize the real target revalidation contract',async()=>{
  const playlist='#EXTM3U\n'+[0,1,2].map(i=>'#EXTINF:2,\nsegment'+i+'.ts\n').join('')+'#EXT-X-ENDLIST\n';
  const r=streamRig({fetcher:async url=>new Response(url.endsWith('.m3u8')?playlist:ts())});
  let sequence=0;
  r.currentPageTarget.revalidate=async()=>{
    const ticket=++sequence;await new Promise(resolve=>setImmediate(resolve));
    if(ticket!==sequence)throw Object.assign(Error('concurrent observation superseded'),{code:'E_DOCUMENT_STALE'});
  };
  const d=await r.request('media.detect');
  const receipt=await r.request('media.start',{candidateId:d.candidates[0].id});
  let status;await until(async()=>{status=await r.request('media.status',{taskId:receipt.taskId});return r.calls===1||status.state==='interrupted';});
  assert.equal(r.calls,1,JSON.stringify(status));
  r.state({state:'complete',bytesReceived:ts().length*3});
  assert.equal((await r.request('media.status',{taskId:receipt.taskId})).stream.segments,3);
});
test('HLS master returns rendition resolution and audio declarations, but no video file',async()=>{
  const master=await fixture('master.m3u8'),media=await fixture('media.m3u8');
  const r=rig({urls:['https://fixture.example/master.m3u8'],
    fetcher:async url=>new Response(url.endsWith('master.m3u8')?master:media)});
  const d=await r.request('media.detect');
  const info=d.candidates[0].hls;
  assert.equal(d.candidates[0].mode,'detected_only');
  assert.equal(info.variants.length,2);
  assert.equal(info.variants[0].resolution,'160x90');
  assert.equal(info.variants[1].segments,1);
  assert.equal(info.audio[0].name,'Original');
  assert.equal(info.encryption,'unknown');
});
test('only opaque candidate ID is accepted; requests cannot supply arbitrary source URLs',async()=>{
  const r=rig();await r.request('media.detect');
  await assert.rejects(r.request('media.start',{url:'https://fixture.example/other.mp4'}),
    error=>error.code==='E_SCHEMA');
  await assert.rejects(r.request('media.detect',{tabId:88}),
    error=>error.code==='E_SCHEMA');
  assert.equal(r.calls,0);
});
