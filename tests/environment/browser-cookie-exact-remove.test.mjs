import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedCookieHost} from '../../src/platform/chrome/browser-cookie-host.js';

const url='https://shop.example.test/account';
const partitionKey={topLevelSite:'https://shop.example.test',hasCrossSiteAncestor:false};
const document={tabId:1,windowId:2,documentId:'page-1',url,origin:new URL(url).origin};
const caller={documentId:'panel-1',hostInstanceId:'panel-instance'};
const reject=code=>err=>err?.code===code;
function fixture(){
  const state={rows:[],writes:[],queries:[],allowed:true,afterScan:null,afterWrite:null};
  const api={runtime:{lastError:null},
    permissions:{contains:async()=>state.allowed},
    tabs:{query:async()=>[{id:1,windowId:2,active:true,url,status:'complete'}]},
    webNavigation:{getFrame:async()=>({documentId:document.documentId,url,documentLifecycle:'active'})},
    cookies:{
      getAllCookieStores:cb=>cb([{id:'0',tabIds:[1]}]),
      getPartitionKey:(_d,cb)=>cb({partitionKey}),
      get:()=>{throw Error('Exact Host deletion must not use native get');},
      // Deliberately wider than the native query: Host/Driver must validate
      // Domain, literal Path, Store and Partition themselves.
      getAll:(d,cb)=>{state.queries.push(d);state.afterScan?.();cb([...state.rows]);},
      set:(d,cb)=>{
        state.writes.push(d);
        state.rows=state.rows.filter(row=>!(row.name===d.name&&row.domain===(d.domain??new URL(d.url).hostname)&&
          row.hostOnly===(d.domain===undefined)&&row.path===d.path&&row.storeId===d.storeId&&
          JSON.stringify(row.partitionKey??null)===JSON.stringify(d.partitionKey??null)));
        state.afterWrite?.();cb(null);api.runtime.lastError=null;
      }
    }};
  const host=createTrustedCookieHost({api});
  return {state,api,async run(kind,args){
    if(kind==='installed')return host.executeInstalled('browser.cookies.remove',{url,...args},{
      origin:document.origin,storeId:'0',partitionKey,ownerKey:'tool-1',
      authorize:async()=>{if(!state.allowed)throw Object.assign(Error('revoked'),{code:'E_GRANT_REVOKED'});}});
    const {approvalRef}=await host.approve({targetOperation:'browser.cookies.remove',
      targetArgs:args,document,hostInstanceId:caller.hostInstanceId},caller);
    return host.execute({approvalRef,hostInstanceId:caller.hostInstanceId},caller);
  }};
}
const row=(patch={})=>({name:'sid',domain:'.shop.example.test',hostOnly:false,path:'/account',
  storeId:'0',secure:true,httpOnly:true,value:'PRIVATE',...patch});
for(const kind of ['installed','trusted']){
  for(const path of ['/account','/a/../b','/account?x'])
  test(kind+' Host removes exact Domain/literal Path and preserves HostOnly, shorter Path and foreign scopes: '+path,async()=>{
    const f=fixture(),chosen=row({path});
    const survivors=[row({domain:'shop.example.test',hostOnly:true,path}),row({path:'/'}),
      row({path,storeId:'other'}),row({path,partitionKey}),row({path,domain:'.foreign.test'})];
    f.state.rows=[...survivors,chosen];
    const result=await f.run(kind,{name:chosen.name,domain:chosen.domain,path,storeId:'0'});
    assert.equal(result.removed,true);
    assert.deepEqual(f.state.rows,survivors);
    assert.equal(f.state.writes.length,1);
    assert.equal(f.state.writes[0].path,path);
    assert.equal(f.state.writes[0].value,'');
    assert(f.state.queries.length>=3);
    assert(f.state.queries.every(q=>q.domain==='shop.example.test'&&q.path===path&&q.storeId==='0'&&!q.url));
  });
  test(kind+' Host rejects parent-domain mutation through child URL',async()=>{
    const f=fixture(),chosen=row({domain:'.example.test'});f.state.rows=[chosen];
    await assert.rejects(f.run(kind,{name:chosen.name,domain:chosen.domain,path:chosen.path}),reject('E_COOKIE_SCOPE'));
    assert.equal(f.state.writes.length,0);
  });
  for(const patch of [{storeId:'other'},{partitionKey},{partitionKey:{...partitionKey,hasCrossSiteAncestor:true}}])
  test(kind+' Host rejects wrong scope '+JSON.stringify(patch),async()=>{
    const f=fixture(),chosen=row(patch);f.state.rows=[chosen];
    await assert.rejects(f.run(kind,{name:chosen.name,domain:chosen.domain,path:chosen.path,storeId:'0'}));
    assert.equal(f.state.writes.length,0);
  });
  test(kind+' Host rechecks revocation during exact scan before writing',async()=>{
    const f=fixture(),chosen=row();f.state.rows=[chosen];
    f.state.afterScan=()=>{f.state.allowed=false;};
    await assert.rejects(f.run(kind,{name:chosen.name,domain:chosen.domain,path:chosen.path}));
    assert.equal(f.state.writes.length,0);
  });
  test(kind+' Host unknown expiration receipt never retries',async()=>{
    const f=fixture(),chosen=row();f.state.rows=[chosen];
    f.state.afterWrite=()=>{f.api.runtime.lastError={message:'lost after effect'};};
    await assert.rejects(f.run(kind,{name:chosen.name,domain:chosen.domain,path:chosen.path}),reject('E_OUTCOME_UNKNOWN'));
    assert.equal(f.state.rows.length,0);
    assert.equal(f.state.writes.length,1);
  });
}
