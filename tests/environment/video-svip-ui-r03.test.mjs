import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source=new URL('../../projects/video-svip/src/main.js',import.meta.url);
const ticks=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function element(id=''){
 const listeners=new Map(),children=[],attrs=new Map();
 return {id,children,listeners,dataset:{},value:'',hidden:false,disabled:false,
   href:'',textContent:'',setAttribute:(k,v)=>attrs.set(k,String(v)),
   getAttribute:k=>attrs.get(k)||null,addEventListener:(k,fn)=>listeners.set(k,fn),
   fire:(kind,event={})=>listeners.get(kind)?.({preventDefault(){},...event}),
   replaceChildren(...items){children.splice(0,children.length,...items);},
   append(...items){children.push(...items);},
   focus(){},select(){}};
}
function harness(request){
 const ids=['vp-flash','vp-title','vp-provider','vp-episode','vp-page-state','vp-route-state',
   'vp-open','vp-copy','vp-stop','vp-manual-wrap','vp-evidence-text','vp-member-provider',
   'vp-member-save','vp-member-list','vp-member-form','vp-member-expiry','vp-watch',
   'vp-member','vp-refresh','vp-recheck','vp-manual'];
 const nodes=new Map(ids.map(id=>[id,element(id)]));
 const tabs=['watch','member'].map(mode=>{
   const button=element('tab-'+mode);button.dataset.vpTab=mode;return button;
 });
 const root=element('root');
 root.querySelector=selector=>nodes.get(selector.slice(1))||null;
 root.querySelectorAll=selector=>selector==='[data-vp-tab]'?tabs:[];
 let n=0;
 const timers=new Map();
 const timersFn={setTimeout(fn){const id=++n;timers.set(id,fn);return id;},
   clearTimeout(id){timers.delete(id);}};
 const window=element('window');
 const document={createElement:tag=>element(tag)};
 const sandbox={OpenDeskTool:{root,request},navigator:{},
   window,document,URL,console,...timersFn};
 const fireTimers=()=>{const active=[...timers.values()];timers.clear();active.forEach(fn=>fn());};
 const run=async()=>{runInNewContext(await readFile(source,'utf8'),sandbox,
   {filename:'projects/video-svip/src/main.js'});await ticks();};
 return {run,nodes,root,tabs,fireTimers,window};
}
const context=(title,number)=>({siteId:'tencent',siteName:'腾讯视频',domain:'v.qq.com',
 canonicalPageUrl:'https://v.qq.com/x/cover/demo/video.html',
 title,titleSource:'site-selector',titleConfidence:'high',
 episode:{season:null,number,label:'第'+number+'集'},episodeConfidence:'high',
 recognitionState:'recognized',recognitionReason:'site-evidence',contentRevision:'12345678',
 partial:false,evidence:{title:'[data-video-title]',episode:'selected:[aria-current="page"]'}});

test('late recognition for A can never replace B after a same-URL DOM invalidation',async()=>{
 const pending=[];
 const request=(name)=>{
   if(name==='videoSVIP.watch')return Promise.resolve({watching:true});
   if(name==='videoSVIP.inspect')return new Promise(resolve=>pending.push(resolve));
   if(name==='storage.get')return Promise.resolve({value:[],etag:'0'.repeat(64)});
   if(name==='videoSVIP.stop')return Promise.resolve({stopped:true});
   throw Error('unexpected operation '+name);
 };
 const h=harness(request);
 await h.run();
 assert.equal(pending.length,1);
 h.root.fire('opendesk-page-changed'); // clear old A immediately
 assert.equal(h.nodes.get('vp-title').textContent,'未识别影片');
 h.fireTimers();await ticks();assert.equal(pending.length,2);
 pending[1](context('影片 B',3));await ticks();
 assert.equal(h.nodes.get('vp-title').textContent,'影片 B');
 assert.equal(h.nodes.get('vp-episode').textContent,'第3集');
 pending[0](context('旧影片 A',12));await ticks();
 assert.equal(h.nodes.get('vp-title').textContent,'影片 B');
 assert.equal(h.nodes.get('vp-episode').textContent,'第3集');
});

test('Stop invalidates all pending work and only explicit recheck resumes it',async()=>{
 const pending=[];
 const request=name=>{
   if(name==='videoSVIP.watch')return Promise.resolve({watching:true});
   if(name==='videoSVIP.inspect')return new Promise(resolve=>pending.push(resolve));
   if(name==='storage.get')return Promise.resolve({value:[],etag:'0'.repeat(64)});
   if(name==='videoSVIP.stop')return Promise.resolve({stopped:true});
   throw Error('unexpected operation '+name);
 };
 const h=harness(request);
 await h.run();assert.equal(pending.length,1);
 h.nodes.get('vp-stop').fire('click');
 assert.equal(h.nodes.get('vp-title').textContent,'已停止识别');
 pending[0](context('不允许恢复的旧影片',1));await ticks();
 assert.equal(h.nodes.get('vp-title').textContent,'已停止识别');
 h.root.fire('opendesk-page-changed');h.fireTimers();await ticks();
 assert.equal(pending.length,1);
 h.nodes.get('vp-refresh').fire('click');await ticks();
 assert.equal(pending.length,2);
 pending[1](context('重新识别后的影片',7));await ticks();
 assert.equal(h.nodes.get('vp-title').textContent,'重新识别后的影片');
 assert.equal(h.nodes.get('vp-episode').textContent,'第7集');
});

test('existing memberships remain readable, editable and removable under ifMatch',async()=>{
 let records=[{id:'tencent',expiry:'2030-01-01'}],etag='0'.repeat(64),sets=0;
 const request=(name,args={})=>{
   if(name==='videoSVIP.watch')return Promise.resolve({watching:false});
   if(name==='videoSVIP.inspect')return Promise.resolve({
     siteId:null,siteName:null,canonicalPageUrl:'https://example.org/',title:null,
     recognitionState:'unsupported',episode:'unknown'
   });
   if(name==='storage.get')return Promise.resolve({value:structuredClone(records),etag});
   if(name==='storage.set'){
     assert.equal(args.key,'memberships');assert.equal(args.ifMatch,etag);
     sets++;records=structuredClone(args.value);etag='1'.repeat(64);return Promise.resolve({etag});
   }
   throw Error('unexpected operation '+name);
 };
 const h=harness(request);await h.run();
 const list=h.nodes.get('vp-member-list');
 assert.equal(list.children.length,1);
 assert.equal(list.children[0].children[0].textContent,'腾讯视频');
 h.nodes.get('vp-member-provider').value='tencent';
 h.nodes.get('vp-member-expiry').value='2031-03-05';
 // The real sandbox does not allow native form submission. Save must work
 // from the user button without adding allow-forms to the iframe.
 h.nodes.get('vp-member-save').fire('click');await ticks();
 assert.deepEqual(records,[{id:'tencent',expiry:'2031-03-05'}]);
 assert.equal(sets,1);
 list.children[0].children[2].fire('click');await ticks();
 assert.deepEqual(records,[]);
 assert.equal(sets,2);
});
