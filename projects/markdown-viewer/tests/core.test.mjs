import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownFile,resolveReference,isPlainMarkdownMime,uniqueSlug,decodeText,READ_PROTOCOL,MAX_BYTES} from '../src/policy.js';
import {createLiveReader} from '../src/live.js';
import {readSenderMarkdown} from '../src/service.js';
test('local file scope, Unicode paths, fragments and strict URL policy',()=>{
  assert.equal(markdownFile('file:///Users/test/a%20中文.MARKDOWN#chapter'),new URL('file:///Users/test/a%20中文.MARKDOWN').href);
  assert.equal(markdownFile('file:///tmp/a.txt'),null);
  assert.equal(markdownFile('https://example.com/a.md'),null);
  assert.equal(markdownFile('file://remote-server/a.md'),null);
  assert.equal(markdownFile('file:///tmp/%ZZ.md'),null);
  assert.equal(isPlainMarkdownMime('text/markdown; charset=UTF-8'),true);
  assert.equal(isPlainMarkdownMime('text/html'),false);
  const base='file:///Users/test/docs/readme.md';
  assert.equal(resolveReference('../计划%20A.md',base),new URL('file:///Users/test/计划%20A.md').href);
  assert.equal(resolveReference('#标题',base),new URL('#标题',base).href);
  assert.equal(resolveReference('./images/a.png',base,{image:true}),'file:///Users/test/docs/images/a.png');
  assert.equal(resolveReference('/Users/test/other.md',base),'file:///Users/test/other.md');
  assert.equal(resolveReference('javascript:alert(1)',base),null);
  assert.equal(resolveReference('https://example.com/p.png',base,{image:true}),null);
  assert.equal(resolveReference('data:image/svg+xml,<svg/>',base,{image:true}),null);
  assert.equal(resolveReference('file://remote-server/a.png',base,{image:true}),null);
  const used=new Set();
  assert.equal(uniqueSlug('中文 / 日本語',used),'中文-日本語');
  assert.equal(uniqueSlug('中文 / 日本語',used),'中文-日本語-1');
  assert.equal(decodeText('&lt;script&gt;&#x1f642;'),'<script>🙂');
});
const tick=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
function harness(){
  const pending=[],timers=new Map(),renders=[],states=[];let serial=0,visible=true,now=100,failRender=false;
  const reader=createLiveReader({read:()=>new Promise(resolve=>pending.push(resolve)),render:text=>{
    if(failRender)throw Error('render failed');renders.push(text);
  },status:state=>states.push(state),visible:()=>visible,schedule:(fn,ms)=>{
    const id=++serial;timers.set(id,{fn,ms});return id;
  },cancel:id=>timers.delete(id),clock:()=>now});
  return {reader,pending,timers,renders,states,setVisible:v=>visible=v,setClock:v=>now=v,setFailRender:v=>failRender=v,
    async finish(value){assert.ok(pending.length);pending.shift()(value);await tick();},
    async next(){const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();await tick();}};
}
test('live reader: exact change comparison, empty documents, retry, pause, visibility and disposal',async()=>{
  const h=harness(),{reader,pending,timers,renders,states}=h;
  reader.start();assert.equal(pending.length,1);await h.finish({ok:true,text:'A'});
  assert.deepEqual(renders,['A']);await h.next();await h.finish({ok:true,text:'A'});assert.equal(renders.length,1);
  h.setClock(200);await h.next();await h.finish({ok:true,text:'B'});assert.equal(states.at(-1).last,200);
  await h.next();await h.finish({ok:false,code:'E_READ'});assert.equal(renders.at(-1),'B');assert.equal(states.at(-1).state,'error');
  await h.next();await h.finish({ok:true,text:''});assert.equal(renders.at(-1),'');assert.equal(states.at(-1).state,'live');
  await h.next();reader.setEnabled(false);await h.finish({ok:true,text:'late'});assert.equal(renders.at(-1),'');assert.equal(timers.size,0);
  reader.setEnabled(true);assert.equal(pending.length,1);await h.finish({ok:true,text:'C'});
  h.setVisible(false);reader.sleep();assert.equal(timers.size,0);h.setVisible(true);reader.wake();reader.wake();assert.equal(pending.length,1);
  await h.finish({ok:true,text:'D'});assert.equal([...timers.values()][0].ms,0);
  reader.destroy();assert.equal(timers.size,0);
});
test('a failed render never commits the new version; recovery retries it',async()=>{
  const h=harness();h.reader.start();await h.finish({ok:true,text:'A'});
  h.setFailRender(true);await h.next();await h.finish({ok:true,text:'B'});
  assert.equal(h.reader.text,'A');assert.equal(h.states.at(-1).state,'error');
  h.setFailRender(false);await h.next();await h.finish({ok:true,text:'B'});
  assert.equal(h.reader.text,'B');assert.deepEqual(h.renders,['A','B']);h.reader.destroy();
});
function worker(){
  const url='file:///Users/test/中文%20QA.md';
  const sender={id:'test-extension',frameId:0,documentId:'doc-a',documentLifecycle:'active',url,tab:{id:7,url,incognito:false}};
  const message={protocol:READ_PROTOCOL,type:'read'};
  let allowed=true,documentId='doc-a',reads=0,frameReads=0;
  const api={runtime:{id:'test-extension'},extension:{isAllowedFileSchemeAccess(cb){cb(allowed);}},
    webNavigation:{async getFrame(){frameReads++;return {url,documentId,documentLifecycle:'active'};}}};
  const fetchFile=async(request,options)=>{
    reads++;const parsed=new URL(request);assert.equal(parsed.protocol,'file:');
    assert.equal(parsed.pathname,new URL(url).pathname);assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');
    return new Response('# 中文\n');
  };
  return {api,sender,message,fetchFile,get reads(){return reads;},get frameReads(){return frameReads;},
    setAllowed:v=>allowed=v,setDocument:v=>documentId=v};
}
test('worker reads only the active sender document; rejects arbitrary URLs and wrong senders',async()=>{
  const w=worker();assert.deepEqual(await readSenderMarkdown(w),{ok:true,text:'# 中文\n'});
  assert.equal(w.reads,1);assert.equal(w.frameReads,2);
  for(const sender of [{...w.sender,frameId:1},{...w.sender,id:'another'},{...w.sender,documentId:undefined},
      {...w.sender,url:'https://example.com/a.md'},{...w.sender,tab:{...w.sender.tab,incognito:true}}]){
    assert.equal((await readSenderMarkdown({...w,sender})).code,'E_SENDER');
  }
  assert.equal((await readSenderMarkdown({...w,message:{...w.message,url:'file:///etc/passwd'}})).code,'E_SENDER');
  w.setAllowed(false);assert.equal((await readSenderMarkdown(w)).code,'E_FILE_PERMISSION');assert.equal(w.reads,1);
  w.setAllowed(true);w.setDocument('new-doc');assert.equal((await readSenderMarkdown(w)).code,'E_DOCUMENT_CHANGED');assert.equal(w.reads,1);
});
test('worker checks permission and document again after IO, enforces byte budget and reports errors',async()=>{
  const w=worker();
  assert.equal((await readSenderMarkdown({...w,fetchFile:async()=>{w.setAllowed(false);return new Response('secret');}})).code,'E_FILE_PERMISSION');
  w.setAllowed(true);
  assert.equal((await readSenderMarkdown({...w,fetchFile:async()=>{w.setDocument('other');return new Response('secret');}})).code,'E_DOCUMENT_CHANGED');
  w.setDocument('doc-a');
  assert.equal((await readSenderMarkdown({...w,fetchFile:async()=>new Response(new Uint8Array(MAX_BYTES+1))})).code,'E_TOO_LARGE');
  assert.equal((await readSenderMarkdown({...w,fetchFile:async()=>new Response('',{status:404})})).code,'E_READ');
  assert.equal((await readSenderMarkdown({...w,fetchFile:async()=>{throw Error('missing');}})).code,'E_READ');
  assert.deepEqual(await readSenderMarkdown({...w,fetchFile:async()=>new Response('')}),{ok:true,text:''});
  assert.equal((await readSenderMarkdown({...w,timeout:5,fetchFile:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('abort'))))})).code,'E_TIMEOUT');
});
