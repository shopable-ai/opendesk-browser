import test from 'node:test';
import assert from 'node:assert/strict';
import {createPolicyApi,initializeManagementOpen} from '../../ai-account-usage/web/service-binding-api.mjs';

test('opening management resource consumes fragment before any data request and uses no cross-origin URL',async()=>{
  const calls=[],location={hash:'#open=one_time',pathname:'/opendesk/admin/accounts/acct_01',search:''};
  const history={replaceState:(_a,_b,path)=>calls.push(['clear',path])};
  await initializeManagementOpen({location,history,fetcher:async(path,options)=>{calls.push([path,JSON.parse(options.body)]);return {ok:true,json:async()=>({path:location.pathname})};}});
  assert.deepEqual(calls,[['clear',location.pathname],['/opendesk/open-session',{code:'one_time'}]]);
});

test('desired save timeout stays unknown and receipt lookup uses original operation ID without retrying POST',async()=>{
  const calls=[];const api=createPolicyApi(async(path,options)=>{calls.push([path,options.method,options.body]);
    if(options.method==='POST')throw Error('response lost');return {ok:true,json:async()=>({status:'CONFIRMED',operationId:'op_one',result:{desiredRevision:1}})};});
  const change={deviceId:'device_a',operationId:'op_one',expectedRevision:0,scope:{bindingIds:[],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:7}};
  await assert.rejects(api.save(change),{code:'RESULT_UNKNOWN'});
  assert.equal((await api.reconcile(change)).result.desiredRevision,1);
  assert.equal(calls.filter(x=>x[1]==='POST').length,1);
  assert.equal(calls[1][0],'/opendesk/admin/api/operations/op_one?device=device_a');
});

function memoryStorage(initial={}){const values=new Map(Object.entries(initial));return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
const change={deviceId:'device_a',operationId:'unknown_one',expectedRevision:0,scope:{bindingIds:[],dataCategories:['ACCOUNT_METADATA'],trigger:'MANUAL',retentionDays:7}};

test('explicit archive preserves original unknown ID and payload in same ledger; only fresh GET permits a separately reviewed new operation',async()=>{
  const {createPolicyLedger,refreshArchivedPolicy}=await import('../../ai-account-usage/web/service-binding-api.mjs');
  const key='od-desired-pending:device_a',storage=memoryStorage({[key]:JSON.stringify(change)}),ledger=createPolicyLedger(storage,key);
  assert.throws(()=>ledger.archiveUnknown(false),/CONFIRMATION_REQUIRED/);
  const archived=ledger.archiveUnknown(true);
  assert.equal(archived.pending,null);assert.equal(archived.needsRevisionRead,true);
  assert.equal(archived.archived[0].status,'archived');assert.deepEqual(archived.archived[0].payload,change);
  assert.equal(archived.archived[0].operationId,change.operationId);
  assert.throws(()=>ledger.savePending({...change,operationId:'new_one'}),/REVISION_READ_REQUIRED/);
  const calls=[],api=createPolicyApi(async(path,options)=>{calls.push([path,options.method]);return {ok:true,json:async()=>({readOnly:false,devices:[{deviceId:'device_a',desired:{desiredRevision:3,desiredHash:'a'.repeat(64),scope:change.scope}}]})};});
  const device=await refreshArchivedPolicy({ledger,api,deviceId:'device_a'});
  assert.equal(device.desired.desiredRevision,3);assert.deepEqual(calls,[['/opendesk/admin/api/devices','GET']]);
  assert.throws(()=>ledger.savePending(change),/ARCHIVED_OPERATION/);
  ledger.savePending({...change,operationId:'new_one',expectedRevision:3});
  const saved=JSON.parse(storage.getItem(key));assert.equal(saved.pending.operationId,'new_one');assert.deepEqual(saved.archived[0].payload,change);
});

test('archive write failure preserves pending; failed or read-only GET leaves new saves blocked across reload',async()=>{
  const {createPolicyLedger,refreshArchivedPolicy}=await import('../../ai-account-usage/web/service-binding-api.mjs');
  const key='od-desired-pending:device_a',storage=memoryStorage({[key]:JSON.stringify(change)});
  assert.throws(()=>createPolicyLedger({...storage,setItem:()=>{throw Error('storage full');}},key).archiveUnknown(true),/storage full/);
  assert.deepEqual(JSON.parse(storage.getItem(key)),change);
  const ledger=createPolicyLedger(storage,key);ledger.archiveUnknown(true);
  for(const api of [{devices:async()=>{throw Error('offline');}},{devices:async()=>({readOnly:true,devices:[{deviceId:'device_a'}]})},{devices:async()=>({readOnly:false,devices:[{deviceId:'other'}]})},{devices:async()=>({readOnly:false,devices:[{deviceId:'device_a',desired:{desiredRevision:2}}]})}]){
    await assert.rejects(refreshArchivedPolicy({ledger,api,deviceId:'device_a'}));
    assert.equal(createPolicyLedger(storage,key).read().needsRevisionRead,true);
    assert.throws(()=>ledger.savePending({...change,operationId:'new_one'}),/REVISION_READ_REQUIRED/);
  }
});
