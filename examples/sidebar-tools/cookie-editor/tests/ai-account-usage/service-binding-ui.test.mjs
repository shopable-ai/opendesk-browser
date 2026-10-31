import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
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


test('admin application code request uses authenticated same-origin empty POST without auto pairing',async()=>{
  const calls=[],grant={origin:'http://synthetic.localhost:1234',code:'a'.repeat(64),expiresAt:1800000000000};
  const api=createPolicyApi(async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>grant};});
  assert.deepEqual(await api.issuePairing(),grant);
  assert.deepEqual(calls,[{path:'/opendesk/admin/api/client-pairing',options:{credentials:'same-origin',cache:'no-store',redirect:'error',method:'POST',headers:{'content-type':'application/json'},body:'{}'}}]);
  await assert.rejects(createPolicyApi(async()=>({ok:false})).issuePairing(),/管理员会话/);
});


test('management renders code issuance only for admin and shows grant without pairing automatically',async()=>{
  const built=buildSync({entryPoints:[new URL('../../ai-account-usage/web/ServiceBindingSettings.jsx',import.meta.url).pathname],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],jsx:'transform'});
  const originalFetch=globalThis.fetch;
  try{for(const readOnly of [false,true]){
    const calls=[],slots=[],effects=[];let index=0;
    const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
      useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
      useEffect(fn){const i=index++;if(!(i in slots)){slots[i]=true;effects.push(fn);}}};
    const grant={origin:'http://synthetic.localhost:1234',code:'b'.repeat(64),expiresAt:1800000000000};
    globalThis.fetch=async(path,options)=>{calls.push([path,options]);return {ok:true,json:async()=>path.endsWith('/devices')?{devices:[],readOnly}:grant};};
    const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(()=>React,module,module.exports);
    const render=()=>{index=0;return module.exports.ServiceBindingSettings();};
    const nodes=node=>!node||typeof node!=='object'?[]:[node,...node.children.flatMap(nodes)];
    const text=node=>!node||typeof node!=='object'?String(node??''):node.children.map(text).join('');
    render();for(const effect of effects)effect();await new Promise(resolve=>setImmediate(resolve));
    let tree=render();const button=nodes(tree).find(n=>n.type==='button'&&text(n)==='生成新应用连接码');
    assert.equal(!!button,!readOnly);
    if(button){await button.props.onClick();tree=render();assert.ok(text(tree).includes(grant.origin));assert.ok(text(tree).includes(grant.code));
      assert.deepEqual(calls.map(([path])=>path),['/opendesk/admin/api/devices','/opendesk/admin/api/client-pairing']);}
    else assert.deepEqual(calls.map(([path])=>path),['/opendesk/admin/api/devices']);
  }}finally{globalThis.fetch=originalFetch;}
});
