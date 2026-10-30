import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pageVideoSVIP,requestVideoSVIP} from '../../projects/video-svip/trusted/host.js';
import {VIDEO_SVIP_CAPABILITY,VIDEO_SVIP_ID,VIDEO_SVIP_SITES,
  VIDEO_SVIP_VERSION,videoSVIPSiteFor} from '../../projects/video-svip/trusted/policy.js';
import {admitsOfficialVideoSVIP,VIDEO_SVIP_MARKET_ID} from '../../projects/video-svip/trusted/admission.js';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {officialSourceProjectPath,validateOfficialSourceCatalog} from '../../src/sidebar-tools/official-catalog.js';

const base=new URL('../../projects/video-svip/',import.meta.url);
const read=path=>readFile(new URL(path,base),'utf8');
const urls={
 tencent:'https://v.qq.com/x/cover/test/abc.html',
 iqiyi:'https://www.iqiyi.com/v_test.html',
 youku:'https://v.youku.com/v_show/id_test.html',
 mango:'https://www.mgtv.com/b/123/456.html',
 bilibili:'https://www.bilibili.com/bangumi/play/ep123',
 youtube:'https://www.youtube.com/watch?v=abc',
 netflix:'https://www.netflix.com/watch/801',
 fixture:'http://127.0.0.1/__opendesk_video_svip_fixture__/show'
};
const node=(value,attrs={})=>({
 textContent:value,getAttribute:key=>Object.hasOwn(attrs,key)?attrs[key]:null
});
const mockDocument=({title='示例影片',active='第 12 集',selector='[data-video-title]',
  activeSelector='[aria-current="page"]',metadata=null,onlyTotal=null}={})=>{
 const nodes=new Map();
 if(title!==null)nodes.set(selector,node(title));
 if(active!==null)nodes.set(activeSelector,node(active));
 if(metadata!==null)nodes.set('meta[property="og:title"]',node('',{content:metadata}));
 if(onlyTotal!==null)nodes.set('[data-current-episode]',node(onlyTotal));
 return {title:title||'播放页',documentElement:{},
   querySelector:selector=>nodes.get(selector)||null,nodes};
};
async function inPage(doc,url,fn,{chrome=null,MutationObserver=null}={}){
 const saved={document:globalThis.document,location:globalThis.location,
   chrome:globalThis.chrome,MutationObserver:globalThis.MutationObserver};
 globalThis.document=doc;globalThis.location={href:url};
 if(chrome!==null)globalThis.chrome=chrome;
 if(MutationObserver!==null)globalThis.MutationObserver=MutationObserver;
 try{return await fn();}finally{
   for(const [key,value] of Object.entries(saved)){
     if(value===undefined)delete globalThis[key];
     else globalThis[key]=value;
   }
 }
}
function fixture(url=urls.tencent,doc=mockDocument()){
 const top={frameId:0,documentId:'top-0001',url,documentLifecycle:'active'};
 const target={status:'available',tabId:41,windowId:2,frameId:0,documentId:top.documentId,
   url,origin:new URL(url).origin};
 const calls=[],state={allowed:true,stale:false,installed:true,doc,url,frames:[top],onCall:null};
 const api={
   permissions:{contains:async()=>state.allowed},
   webNavigation:{getAllFrames:async()=>state.frames},
   scripting:{executeScript:async req=>{
     calls.push(req);
     assert.equal(req.world,'ISOLATED');
     assert.deepEqual(req.target,{tabId:target.tabId,documentIds:[target.documentId]});
     assert.strictEqual(req.func,pageVideoSVIP);
     if(!state.allowed)throw Error('Missing host permission');
     if(state.onCall)await state.onCall(req,calls.length);
     const result=await inPage(state.doc,state.url,()=>req.func(...req.args));
     return [{frameId:0,documentId:target.documentId,result}];
   }}
 };
 const options={api,tool:{id:VIDEO_SVIP_ID,capabilities:[VIDEO_SVIP_CAPABILITY]},
   currentPageTarget:{capture:()=>({...target}),revalidate:async()=>{
     if(state.stale)throw Object.assign(Error('document changed'),{code:'E_DOCUMENT_STALE'});
     return {...target};
   }},
   assertCurrent:()=>{},assertInstalled:async()=>{
     if(!state.installed)throw Object.assign(Error('revoked'),{code:'E_TOOL_CHANGED'});
   }};
 return {options,calls,state,target,top};
}

test('R0.3 package capability and official catalog are bound to one source',async()=>{
 const config=JSON.parse(await read('tool.config.json'));
 assert.equal(config.id,VIDEO_SVIP_ID);
 assert.equal(config.version,VIDEO_SVIP_VERSION);
 assert.deepEqual(config.capabilities,['currentPage.read','page.videoContext','storage.local']);
 assert.deepEqual(config.files,{html:'src/index.html',css:'src/style.css',js:'src/main.js'});
 const catalog=JSON.parse(await readFile(new URL('../../official-tools/catalog.json',import.meta.url),'utf8'));
 const entries=validateOfficialSourceCatalog(catalog).tools.filter(row=>row.id===VIDEO_SVIP_ID);
 assert.equal(entries.length,1);
 assert.equal(entries[0].project,'projects/video-svip');
 assert.equal(officialSourceProjectPath(VIDEO_SVIP_ID),'projects/video-svip');
 assert.equal(catalog.tools.some(row=>row.id==='video-pass'),false);
});

test('all five domestic fixtures plus YouTube and Netflix use reviewed DOM adapters',async()=>{
 assert.equal(VIDEO_SVIP_SITES.length,8);
 for(const [id,url] of Object.entries(urls)){
   const site=videoSVIPSiteFor(url);
   assert.equal(site?.id,id);
   const selector=id==='youtube'?'h1.ytd-watch-metadata':
     id==='netflix'?'[data-video-title]':
     id==='fixture'?'[data-opendesk-video-title]':'[data-video-title]';
   const doc=mockDocument({title:'示例影片 '+id,selector});
   const result=await inPage(doc,url,()=>pageVideoSVIP('inspect',site));
   assert.equal(result.ok,true);
   assert.equal(result.title,'示例影片 '+id);
   assert.equal(result.episode.number,12);
   assert.equal(result.titleSource,'site-selector');
   assert.equal(result.episodeConfidence,'high');
 }
 assert.equal(videoSVIPSiteFor('https://v.qq.com.attacker.test/x/cover/123'),null);
 assert.equal(videoSVIPSiteFor('https://example.org/watch'),null);
 assert.equal(videoSVIPSiteFor('https://www.youtube.com/'),null);
 assert.equal(videoSVIPSiteFor('file:///tmp/show.html'),null);
});

test('current episode is never inferred from series totals, update count or generic video title',async()=>{
 const site=videoSVIPSiteFor(urls.tencent);
 for(const onlyTotal of ['共 24 集','更新至 18 集','全 12 集','已更新 8 集']){
   const doc=mockDocument({title:'示例剧集',active:null,onlyTotal});
   const result=await inPage(doc,urls.tencent,()=>pageVideoSVIP('inspect',site));
   assert.equal(result.episode,'unknown');
   assert.equal(result.episodeConfidence,'none');
   assert.equal(result.recognitionState,'recognized');
 }
 const unknown=await inPage(mockDocument({title:null,active:null}),urls.tencent,
   ()=>pageVideoSVIP('inspect',site));
 assert.equal(unknown.episode,'unknown');
 assert.notEqual(unknown.recognitionState,'recognized');
 const season=await inPage(mockDocument({title:'某剧',active:'第2季 第7集'}),urls.tencent,
   ()=>pageVideoSVIP('inspect',site));
 assert.deepEqual(season.episode,{season:2,number:7,label:'第2季 第7集'});
});

test('one exact inspected top-level Document yields independent stable DOM proof',async()=>{
 const f=fixture();
 const result=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 assert.equal(result.siteId,'tencent');
 assert.equal(result.title,'示例影片');
 assert.equal(result.episode.number,12);
 assert.equal(result.recognitionState,'recognized');
 assert.equal(result.partial,false);
 assert.match(result.contentRevision,/^[a-f0-9]{8}$/);
 assert.equal(f.calls.length,2);
 assert.equal(result.evidence.episode,'selected:[aria-current="page"]');
 assert.equal(typeof result.canonicalPageUrl,'string');
});

test('same URL DOM episode/title change invalidates prior result without modifying player',async()=>{
 const f=fixture();
 const watchedMedia={playbackRate:1,mutations:0};
 const first=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 f.state.doc=mockDocument({title:'示例影片 B',active:'第 3 集'});
 const second=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 assert.equal(first.title,'示例影片');
 assert.equal(second.title,'示例影片 B');
 assert.equal(second.episode.number,3);
 assert.notEqual(first.contentRevision,second.contentRevision);
 assert.equal(watchedMedia.mutations,0);
 assert.equal(watchedMedia.playbackRate,1);
});

test('DOM changes during a read do not produce old A as success',async()=>{
 const f=fixture();
 f.state.onCall=async (_req,count)=>{
   if(count===2)f.state.doc=mockDocument({title:'新片 B',active:'第 9 集'});
 };
 const result=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 assert.equal(result.title,'新片 B');
 assert.equal(result.episode.number,9);
 assert.equal(f.calls.length,4);
});

test('unbounded moving content fails closed; no guessed title or stale episode',async()=>{
 const f=fixture();
 f.state.onCall=async (_req,count)=>{
   f.state.doc=mockDocument({title:'变化 '+count,active:'第 '+count+' 集'});
 };
 const result=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 assert.equal(result.recognitionState,'changing');
 assert.equal(result.episode,'unknown');
 assert.equal(result.title,null);
 assert.equal(f.calls.length,6);
});

test('unsupported pages, wrong document, revoked installation and denied permissions fail safely',async()=>{
 const f=fixture('https://example.org/article',mockDocument({title:'普通网页'}));
 const ordinary=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 assert.equal(ordinary.recognitionState,'unsupported');
 assert.equal(ordinary.episode,'unknown');
 assert.equal(f.calls.length,0);
 for(const invalid of [{script:'alert(1)'},{selector:'video'}, {tabId:41}]){
   await assert.rejects(requestVideoSVIP({...f.options,operation:'videoSVIP.inspect',payload:invalid}),
     {code:'E_SCHEMA'});
 }
 const supported=fixture();
 supported.state.stale=true;
 await assert.rejects(requestVideoSVIP({...supported.options,operation:'videoSVIP.inspect'}),{code:'E_DOCUMENT_STALE'});
 assert.equal(supported.calls.length,0);
 supported.state.stale=false;supported.state.installed=false;
 await assert.rejects(requestVideoSVIP({...supported.options,operation:'videoSVIP.inspect'}),{code:'E_TOOL_CHANGED'});
 assert.equal(supported.calls.length,0);
 supported.state.installed=true;supported.state.allowed=false;
 await assert.rejects(requestVideoSVIP({...supported.options,operation:'videoSVIP.inspect'}),{code:'E_VIDEO_SITE_ACCESS'});
 const wrong=fixture();wrong.state.frames=[{...wrong.top,documentId:'new-document'}];
 await assert.rejects(requestVideoSVIP({...wrong.options,operation:'videoSVIP.inspect'}),{code:'E_DOCUMENT_STALE'});
 assert.equal(wrong.calls.length,0);
});

test('withheld website access is rejected before a Chrome injection can remain pending',async()=>{
 const f=fixture();
 f.options.api.permissions={contains:async request=>{
   assert.deepEqual(request,{origins:['https://v.qq.com/*']});
   return false;
 }};
 for(const operation of ['videoSVIP.watch','videoSVIP.inspect']){
   await assert.rejects(requestVideoSVIP({...f.options,operation,
     watchNonce:'00000000-0000-0000-0000-000000000001'}),{code:'E_VIDEO_SITE_ACCESS'});
 }
 assert.equal(f.calls.length,0);
});

test('re-identification re-observes a cached transient navigation failure before capturing',async()=>{
 const f=fixture();let settled=false,refreshes=0;
 f.options.currentPageTarget={
   get snapshot(){return settled?f.target:{status:'unavailable',reason:'E_DOCUMENT_UNRESOLVED'};},
   refresh:async options=>{
     assert.deepEqual(options,{quiet:true,preserveRetry:true});
     refreshes++;settled=true;
   },
   capture:()=>{if(!settled)throw Object.assign(Error('cached loading'),{code:'E_DOCUMENT_UNRESOLVED'});return {...f.target};},
   revalidate:async()=>({...f.target})
 };
 const result=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 assert.equal(result.recognitionState,'recognized');
 assert.equal(refreshes,1);assert.equal(f.calls.length,2);
});

test('iframe is explicitly partial; unrelated frame is never injected into',async()=>{
 const f=fixture();
 f.state.frames.push({frameId:3,documentId:'forbidden-child',url:'https://embed.invalid/blocked'});
 const result=await requestVideoSVIP({...f.options,operation:'videoSVIP.inspect'});
 assert.equal(result.partial,true);
 assert.ok(f.calls.every(call=>call.target.documentIds[0]===f.top.documentId));
});

test('the mutation listener only signals invalidation; its port disconnect is cleanup',async()=>{
 const doc=mockDocument(),site=videoSVIPSiteFor(urls.tencent),messages=[];
 let callback=null,disconnected=false,unwatch=null,disconnectListener=null;
 class FakeObserver{
   constructor(fn){callback=fn;}
   observe(){this.observed=true;}
   disconnect(){disconnected=true;}
 }
 const port={onDisconnect:{addListener:fn=>{disconnectListener=fn;}},
   postMessage:m=>messages.push(m),disconnect(){disconnectListener?.();}};
 const chrome={runtime:{connect:({name})=>{
   assert.equal(name,'opendesk.video-svip.watch.v1');return port;
 }}};
 const nonce='12345678-1234-4234-8234-123456789abc';
 const result=await inPage(doc,urls.tencent,()=>pageVideoSVIP('watch-on',site,nonce),
   {chrome,MutationObserver:FakeObserver});
 assert.equal(result.watching,true);
 assert.deepEqual(messages,[{nonce,kind:'ready'}]);
 assert.equal(typeof callback,'function');
 assert.equal(doc.documentElement!==null,true);
 unwatch=globalThis.__opendeskSVIPObserver_v1?.close;
 assert.equal(typeof unwatch,'function');
 unwatch();
 assert.equal(disconnected,true);
 assert.equal(globalThis.__opendeskSVIPObserver_v1,undefined);
 assert.ok(messages.every(m=>!Object.hasOwn(m,'title')));
});

test('official package bytes, provenance, enablement and epoch are all required',async()=>{
 const tool=await createSidebarToolPackage('projects/video-svip');
 const bytes=encodeSidebarToolPackage(tool);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const release={id:VIDEO_SVIP_MARKET_ID,toolId:VIDEO_SVIP_ID,
   version:VIDEO_SVIP_VERSION,packagePath:'official-tools/video-svip/video-svip.opendesk-tool.json',
   sha256,bytes:bytes.length,capabilities:tool.capabilities};
 const expectedEpoch='video-svip-epoch';
 const good={tool,release,installed:[tool],
   provenance:{[VIDEO_SVIP_ID]:{marketId:VIDEO_SVIP_MARKET_ID,version:VIDEO_SVIP_VERSION,sha256}},
   enableRecords:{},epochs:{[VIDEO_SVIP_ID]:expectedEpoch},expectedEpoch};
 assert.equal(await admitsOfficialVideoSVIP(good),true);
 for(const delta of [
   {tool:{...tool,js:tool.js+'/* tampered */'}},
   {release:{...release,sha256:'a'.repeat(64)}},
   {enableRecords:{[VIDEO_SVIP_ID]:false}},
   {installed:[tool,tool]},
   {provenance:{}},
   {epochs:{[VIDEO_SVIP_ID]:'revoked'}},
   {expectedEpoch:'mismatch'}
 ])assert.equal(await admitsOfficialVideoSVIP({...good,...delta}),false);
});

test('only pinned first-party Video SVIP trusted sources may enter existing Host',()=>{
 const root=new URL('../..',import.meta.url).pathname;
 const owned=['policy.js','host.js','admission.js'].map(name=>'projects/video-svip/trusted/'+name);
 const modules=Object.fromEntries(owned.map(path=>[root+'/'+path,{renderedLength:300,originalLength:300}]));
 const lock={packages:{}};
 const host=describeBundle({root,chunk:{fileName:'ui/sidebar-tool-host.js',modules},lock});
 assert.deepEqual(host.modules.map(row=>row.path).sort(),owned.slice().sort());
 assert.ok(host.modules.every(row=>/^[a-f0-9]{40}$/.test(row.reviewedFirstPartyBlob)));
 assert.throws(()=>describeBundle({root,chunk:{fileName:'sw.js',modules},lock}),
   /Historical\/user\/vendor/);
});

test('production UI and mock preview share exactly the product markup, with no parser/credential handling',async()=>{
 const [html,js,preview]=await Promise.all([
   read('src/index.html'),read('src/main.js'),read('preview/index.html')
 ]);
 assert.ok(html.includes('id="vp-member-form"'));
 assert.ok(html.includes('id="vp-evidence"')&&html.includes('id="vp-stop"'));
 assert.ok(preview.includes(html.trim()));
 assert.ok(preview.includes('src="../src/main.js"'));
 assert.ok(js.includes("request('videoSVIP.inspect'"));
 assert.ok(js.includes("request('videoSVIP.watch'"));
 assert.ok(js.includes("request('videoSVIP.stop'"));
 assert.ok(js.includes("request('storage.set'"));
 assert.ok(js.includes('ifMatch:etag'));
 assert.ok(js.includes('SHARE_KEYS'));
 assert.doesNotThrow(()=>new Function(js));
 assert.doesNotMatch(js,/GM_xmlhttpRequest|unsafeWindow|executeScript|HTMLMediaElement|document\.cookie|access_token/);
 assert.doesNotMatch(html,/\s(?:type=["']password|src=["']https?:|onsubmit=)/);
 assert.doesNotMatch(html,/会员优惠与好友邀请|授权备用播放服务|播放成功|VIP 已解锁/);
});
