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
  return {nodes,document:{
    documentElement:{dataset:{opendeskTab:'cloud'}},
    getElementById,createElement:node
  }};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('Cloud Side Panel heartbeat claims once but manual read-only refresh cannot claim/resolve/start',async()=>{
  const {document,nodes}=surface(),calls=[],hostCalls=[];
  const status={provider:{providerId:'redacted'},enabled:true,online:true,reconciled:true,
    connection:'authenticated',hostReady:true,slotAvailable:true,tasks:[],
    requestTotal:0,requests:[]};
  const client={cloud:{
    cloudStatus:async query=>{calls.push({type:'status',query});return status;},
    cloudNext:async()=>{calls.push({type:'claim'});return null;},
    cloudResolve:async()=>{hostCalls.push('resolve');throw Error('unexpected resolution');}
  }};
  const host={executionPending:false,start:async()=>{hostCalls.push('start');}};
  const control=createCloudHosting({client,host,document,api:{}});
  await flush();await flush();
  assert.equal(calls.filter(x=>x.type==='claim').length,1);
  assert.deepEqual(calls.filter(x=>x.type==='status').map(x=>x.query),
    [{includeRequests:false},{limit:5}]);
  nodes.get('cloud-refresh').events.get('click')();
  await flush();await flush();
  assert.equal(calls.filter(x=>x.type==='claim').length,1);
  assert.equal(calls.filter(x=>x.type==='status').length,3);
  assert.deepEqual(calls.at(-1),{type:'status',query:{limit:5}});
  assert.deepEqual(hostCalls,[]);
  control.dispose();
  for(const id of ['cloud-refresh','cloud-overview-refresh','cloud-open-console'])
    assert.equal(nodes.get(id).events.size,0);
});

test('Cloud console opens a fixed extension tab and cannot register a second execution Host',async()=>{
  const {document,nodes}=surface(),calls=[],opened=[];
  const client={cloud:{
    cloudStatus:async query=>{calls.push({type:'status',query});return {provider:null,
      enabled:false,online:false,reconciled:false,connection:'offline',tasks:[],
      hostReady:true,slotAvailable:true,requestTotal:0,requests:[]};},
    cloudNext:async()=>{calls.push({type:'claim'});throw Error('should not claim while disabled');}
  }};
  const api={runtime:{getURL:path=>'chrome-extension://trusted/'+path},
    tabs:{create:async options=>opened.push(options)}};
  const control=createCloudHosting({client,host:{executionPending:false},document,api});
  await flush();await flush();
  nodes.get('cloud-open-console').events.get('click')();
  await flush();await flush();
  assert.deepEqual(opened,[{url:'chrome-extension://trusted/ui/cloud-control.html'}]);
  assert.deepEqual(calls.filter(x=>x.type==='claim'),[]);
  control.dispose();
});
