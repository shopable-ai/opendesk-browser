import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';

function surface(){
  const nodes=new Map();
  const node=()=>({
    textContent:'',value:'',checked:false,disabled:false,children:[],
    events:new Map(),
    addEventListener(type,fn){this.events.set(type,fn);},
    removeEventListener(type){this.events.delete(type);},
    replaceChildren(){this.children=[];},
    append(...items){this.children.push(...items);}
  });
  const getElementById=id=>{
    if(!nodes.has(id))nodes.set(id,node());
    return nodes.get(id);
  };
  let model;
  return {nodes,reactUI:{cloudPageMounted:true,renderCloudPage(next){model=next;}},
    model:()=>model,document:{
    documentElement:{dataset:{opendeskTab:'cloud'}},
    getElementById,createElement:node
  }};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('Cloud Side Panel heartbeat claims once but manual read-only refresh cannot claim/resolve/start',async()=>{
  const {document,reactUI,model}=surface(),calls=[],hostCalls=[];
  const status={provider:{providerId:'redacted'},enabled:true,online:true,reconciled:true,
    connection:'authenticated',hostReady:true,slotAvailable:true,tasks:[],
    requestTotal:0,requests:[]};
  const client={cloud:{
    cloudStatus:async query=>{calls.push({type:'status',query});return status;},
    cloudNext:async()=>{calls.push({type:'claim'});return null;},
    cloudResolve:async()=>{hostCalls.push('resolve');throw Error('unexpected resolution');}
  }};
  const host={executionPending:false,start:async()=>{hostCalls.push('start');}};
  const control=createCloudHosting({client,host,document,api:{},reactUI});
  await flush();await flush();
  assert.equal(calls.filter(x=>x.type==='claim').length,1);
  assert.deepEqual(calls.filter(x=>x.type==='status').map(x=>x.query),
    [{includeRequests:false},{limit:5}]);
  await model().onRefresh();
  await flush();await flush();
  assert.equal(calls.filter(x=>x.type==='claim').length,1);
  assert.equal(calls.filter(x=>x.type==='status').length,3);
  assert.deepEqual(calls.at(-1),{type:'status',query:{limit:5}});
  assert.deepEqual(hostCalls,[]);
  control.dispose();
  const count=calls.length;
  await model().onRefresh();
  assert.equal(calls.length,count,'Disposed React actions cannot refresh or claim');
});

test('Cloud console opens a fixed extension tab and cannot register a second execution Host',async()=>{
  const {document,reactUI,model}=surface(),calls=[],opened=[];
  const client={cloud:{
    cloudStatus:async query=>{calls.push({type:'status',query});return {provider:null,
      enabled:false,online:false,reconciled:false,connection:'offline',tasks:[],
      hostReady:true,slotAvailable:true,requestTotal:0,requests:[]};},
    cloudNext:async()=>{calls.push({type:'claim'});throw Error('should not claim while disabled');}
  }};
  const api={runtime:{getURL:path=>'chrome-extension://trusted/'+path},
    tabs:{create:async options=>opened.push(options)}};
  const control=createCloudHosting({client,host:{executionPending:false},document,api,reactUI});
  await flush();await flush();
  await model().onOpenConsole();
  await flush();await flush();
  assert.deepEqual(opened,[{url:'chrome-extension://trusted/ui/cloud-control.html'}]);
  assert.deepEqual(calls.filter(x=>x.type==='claim'),[]);
  control.dispose();
});


test('React Cloud header has one gesture path, read-only refresh and no action after dispose',async()=>{
  const {document,nodes}=surface(),calls=[],opened=[];
  let actions;
  const client={cloud:{
    cloudStatus:async query=>{calls.push({type:'status',query});return {
      provider:null,enabled:false,online:false,reconciled:false,connection:'offline',
      tasks:[],hostReady:true,slotAvailable:true,requestTotal:0,requests:[]
    };},
    cloudNext:async()=>{calls.push({type:'claim'});throw Error('read-only must not claim');}
  }};
  const api={runtime:{getURL:path=>'chrome-extension://trusted/'+path},
    tabs:{create:async options=>opened.push(options)}};
  const reactUI={cloudPageMounted:true,renderCloudPage(next){actions=next;}};
  const control=createCloudHosting({client,host:{executionPending:false},document,api,reactUI});
  await flush();await flush();
  assert.equal(typeof actions?.onRefresh,'function');
  assert.equal(typeof actions?.onOpenConsole,'function');
  // Native listeners must never compete with the React onClick owner.
  for(const id of ['cloud-overview-refresh','cloud-open-console'])
    assert.equal(nodes.get(id)?.events.size||0,0,id);
  assert.equal(nodes.get('cloud-refresh')?.events.size||0,0,
    'React also owns the migrated settings controls');
  const before=calls.filter(x=>x.type==='status').length;
  actions.onRefresh();
  await flush();await flush();
  assert.equal(calls.filter(x=>x.type==='status').length,before+1);
  assert.equal(calls.filter(x=>x.type==='claim').length,0);
  actions.onOpenConsole();
  await flush();await flush();
  assert.deepEqual(opened,[{url:'chrome-extension://trusted/ui/cloud-control.html'}]);
  assert.equal(calls.filter(x=>x.type==='claim').length,0);
  const finished=calls.length;
  control.dispose();
  actions.onRefresh();actions.onOpenConsole();
  await flush();await flush();
  assert.equal(calls.length,finished,'a stale React callback cannot operate after pagehide');
  assert.equal(opened.length,1);
});

test('native offscreen Host prevents Side Panel competing claims while keeping management visible',async()=>{
  const {document,reactUI}=surface(),calls=[];
  const status={provider:{providerId:'trusted'},enabled:true,online:true,reconciled:true,
    connection:'authenticated',hostReady:true,slotAvailable:true,tasks:[],requestTotal:0,requests:[]};
  const api={runtime:{getURL:p=>'chrome-extension://trusted/'+p,
    getContexts:async args=>{assert.deepEqual(args,{contextTypes:['OFFSCREEN_DOCUMENT'],
      documentUrls:['chrome-extension://trusted/cloud-control/runner.html']});
      return [{contextType:'OFFSCREEN_DOCUMENT',documentId:'original-runner'}];}}};
  const client={cloud:{cloudStatus:async()=>status,
    cloudNext:async()=>{calls.push('claim');throw Error('Second Cloud dispatcher must not claim');}}};
  const control=createCloudHosting({api,client,host:{executionPending:false},document,reactUI});
  await flush();await flush();await flush();
  assert.deepEqual(calls,[]);
  control.dispose();
});
