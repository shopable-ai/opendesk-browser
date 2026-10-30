import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHlsPlaylist} from '../trusted/hls.js';
import {publicMediaUrl,readMediaBytes,readHls,downloadHlsVod,STREAM_LIMITS} from '../trusted/stream.js';
const source='https://media.example/vod/list.m3u8';
const authorize=async()=>{};
const ts=value=>{const data=new Uint8Array(188*3).fill(value);for(let i=0;i<data.length;i+=188){data[i]=0x47;data[i+1]=0;data[i+3]=0x10;}return data;};
const manifest=(count=3,extra='')=>'#EXTM3U\n'+extra+Array.from({length:count},(_,i)=>'#EXTINF:2.0,\n'+i+'.ts\n').join('')+'#EXT-X-ENDLIST\n';
const parsed=(count=3,extra='')=>parseHlsPlaylist(manifest(count,extra));
const coded=code=>error=>error.code===code;
test('parser preserves complete VOD beyond former 200 segment truncation',()=>{
  const p=parsed(201);assert.equal(p.segmentList.length,201);assert.equal(p.duration,402);assert.equal(p.truncated,false);
  assert.throws(()=>parsed(2049),/E_HLS_SEGMENTS/);
  assert.throws(()=>parseHlsPlaylist('#EXTM3U\n0.ts\n#EXT-X-ENDLIST'),/E_HLS_INVALID/);
});
test('URL transport rejects private literals, local names, credentials, ports and abnormal paths',()=>{
  for(const value of ['http://127.0.0.1/a','https://[::1]/a','http://2130706433/a','http://0x7f000001/a',
    'http://192.168.1.1/a','http://server.local/a','file:///a','data:a','https://user:secret@media.example/a',
    'https://media.example:444/a','https://media.example/a%2fb','https://media.example/a#fragment',
    'https://media.example./a','https://media.example/a\\b'])assert.throws(()=>publicMediaUrl(value),/E_MEDIA_/);
  assert.equal(publicMediaUrl('../seg.ts',source),'https://media.example/seg.ts');
});
test('real ordered assembly with bounded concurrent requests and every segment SHA',async()=>{
  let running=0,peak=0;const completions=[],progress=[];
  const result=await downloadHlsVod(source,parsed(),{authorize,fetcher:async url=>{
    running++;peak=Math.max(peak,running);const i=Number(new URL(url).pathname.match(/(\d+)\.ts/)[1]);
    await new Promise(resolve=>setTimeout(resolve,(3-i)*5));running--;completions.push(i);
    return new Response(ts(i),{headers:{'content-type':'video/mp2t','content-length':String(ts(i).length)}});
  },onProgress:p=>progress.push(p)});
  assert.equal(peak,3);assert.deepEqual(completions,[2,1,0]);assert.equal(result.format,'ts');
  assert.equal(result.bytes.length,188*3*3);assert.equal(result.duration,6);assert.equal(result.segments,3);
  assert.deepEqual(result.integrity.map(x=>x.index),[0,1,2]);
  result.integrity.forEach(x=>{assert.match(x.sha256,/^[a-f0-9]{64}$/);assert.equal(x.status,200);assert.equal(x.bytes,x.contentLength);});
  assert.equal(result.bytes[188*3+2],1);assert.equal(result.bytes[188*6+2],2);
  assert.equal(progress.at(-1).phase,'assembling');assert.equal(result.playbackVerified,false);
});
test('403/expired, HTML, partial, truncated and invalid TS responses cannot be saved',async()=>{
  const cases=[
    [()=>new Response('expired',{status:403}),'E_MEDIA_HTTP'],
    [()=>new Response('<html>',{headers:{'content-type':'text/html'}}),'E_MEDIA_CONTENT'],
    [()=>new Response(ts(1),{status:206}),'E_MEDIA_HTTP'],
    [()=>new Response(ts(1),{headers:{'content-length':'999'}}),'E_MEDIA_TRUNCATED'],
    [()=>new Response(new Uint8Array([1,2,3])),'E_MEDIA_TS'],
    [()=>({...new Response(ts(1)),status:200,redirected:true}),'E_MEDIA_HTTP']
  ];
  for(const [fetcher,code] of cases)await assert.rejects(downloadHlsVod(source,parsed(1),{authorize,fetcher}),coded(code));
});
test('reject missing authority, cross-origin denial, segment and total byte budgets',async()=>{
  await assert.rejects(readMediaBytes(source),coded('E_MEDIA_PERMISSION'));
  await assert.rejects(readMediaBytes(source,{authorize:async()=>{throw Object.assign(Error(),{code:'E_MEDIA_PERMISSION'});}}),coded('E_MEDIA_PERMISSION'));
  await assert.rejects(downloadHlsVod(source,parsed(),{authorize,fetcher:async()=>new Response(ts(1)),limits:{totalBytes:1000}}),coded('E_MEDIA_TOTAL_SIZE'));
  await assert.rejects(downloadHlsVod(source,parsed(1),{authorize,fetcher:async()=>new Response(ts(1)),limits:{segmentBytes:100}}),coded('E_MEDIA_SIZE'));
  await assert.rejects(downloadHlsVod(source,parsed(),{authorize,limits:{concurrency:4}}),coded('E_MEDIA_LIMIT'));
});
test('encrypted, discontinuous, byte-range and live playlists fail closed before fetching',async()=>{
  for(const extra of ['#EXT-X-KEY:METHOD=AES-128,URI="key"\n','#EXT-X-KEY:METHOD=SAMPLE-AES,KEYFORMAT="com.example"\n',
    '#EXT-X-DISCONTINUITY\n','#EXT-X-BYTERANGE:100@0\n','#EXT-X-GAP\n']){
    await assert.rejects(downloadHlsVod(source,parsed(1,extra),{authorize,fetcher:()=>assert.fail('no fetch')}),coded('E_HLS_UNSUPPORTED'));
  }
  const live=parsed();live.vod=false;
  await assert.rejects(downloadHlsVod(source,live,{authorize}),coded('E_HLS_UNSUPPORTED'));
});
test('Stop aborts a pending body and ignores any late chunk',async()=>{
  const controller=new AbortController();let notify,deliver,cancelled=false;
  const ready=new Promise(resolve=>{notify=resolve;});
  const job=downloadHlsVod(source,parsed(1),{signal:controller.signal,authorize,fetcher:async()=>({
    status:200,headers:new Headers(),body:{getReader:()=>({read:()=>{notify();return new Promise(resolve=>{deliver=resolve;});},
      cancel:async()=>{cancelled=true;},releaseLock:()=>{}})}
  })});
  await ready;controller.abort();await assert.rejects(job,coded('E_MEDIA_STOPPED'));
  deliver({done:false,value:ts(1)});assert.equal(cancelled,true);
});
test('segment timeout stops the pipeline; failure never triggers automatic retries',async()=>{
  let calls=0;
  await assert.rejects(downloadHlsVod(source,parsed(1),{authorize,limits:{timeoutMs:10},fetcher:async()=>{
    calls++;return {status:200,headers:new Headers(),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{},releaseLock:()=>{}})}};
  }}),coded('E_MEDIA_TIMEOUT'));
  assert.equal(calls,1);
});
test('revoke after response aborts before consuming body and never leaks native URL errors',async()=>{
  let calls=0;
  await assert.rejects(readMediaBytes(source,{authorize:async()=>{if(++calls>1)throw Object.assign(Error('secret?sig=abc'),{code:'E_MEDIA_PERMISSION'});},
    fetcher:async()=>new Response(ts(1))}),error=>error.code==='E_MEDIA_PERMISSION'&&!error.message.includes('sig'));
  await assert.rejects(readHls(source,{authorize,fetcher:async()=>{throw Error('https://media.example/?secret');}}),
    error=>error.code==='E_MEDIA_NETWORK'&&!error.message.includes('secret'));
});
test('fMP4 init and media are validated as boxes and retain true mp4 extension',async()=>{
  const box=type=>{const b=new Uint8Array(8);b[3]=8;b.set(new TextEncoder().encode(type),4);return b;};
  const p=parsed(1,'#EXT-X-MAP:URI="init.mp4"\n');
  const result=await downloadHlsVod(source,p,{authorize,fetcher:async url=>new Response(new Blob(
    url.endsWith('init.mp4')?[box('ftyp'),box('moov')]:[box('moof'),box('mdat')]))});
  assert.equal(result.format,'mp4');assert.equal(result.bytes.length,32);
  assert.equal(result.playbackVerified,false,'box structure is not decode evidence');
});
