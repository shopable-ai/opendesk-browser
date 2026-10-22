import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {executePromptPlan,validatePromptPlan} from '../../src/ui/conversation/prompt-actions.js';
import {createTrustedPromptHost,PROMPT_AI_RECOVERY_KEY} from '../../src/ui/conversation/prompt-host.js';
import '../../examples/sidebar-tools/prompt-shortcuts/trusted/model.js';

// Production Model, Validator, Adapter and Host coordination. In-memory
// Chrome/Provider/iframe ports are deterministic *boundaries*, not Native PASS.
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const model=globalThis.OpenDeskPromptShortcutsModel;
const canonical=value=>JSON.stringify(value,(_k,row)=>row&&typeof row==='object'&&!Array.isArray(row)
  ?Object.fromEntries(Object.keys(row).sort().map(k=>[k,row[k]])):row);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const failure=code=>Object.assign(new Error(code),{code});
function libraryFixture(initial=model.defaults()){
  let value=structuredClone(initial),writes=0;
  const read=async()=>({value:structuredClone(value),etag:hash(value)});
  const write=async({value:next,ifMatch})=>{
    if(ifMatch!==hash(value))throw failure('E_STORAGE_CONFLICT');
    value=structuredClone(next);writes++;return {saved:true,etag:hash(value)};
  };
  const run=(action,options={})=>executePromptPlan({
    plan:{action},model,read,write,review:async()=>true,...options
  });
  return {read,write,run,get value(){return value;},get writes(){return writes;}};
}
test('R1.3 real Model create, ETag write, independent readback and unique ID',async()=>{
  const f=libraryFixture();
  const saved=await f.run({type:'create',body:'把中文完整准确翻译成英文，并保留 Markdown 格式。'});
  assert.equal(saved.writeIssued,true);assert.equal(saved.etag,hash(f.value));
  assert.equal(f.writes,1);assert.equal(f.value.items.length,1);
  assert.equal(model.load((await f.read()).value).items[0].body,'把中文完整准确翻译成英文，并保留 Markdown 格式。');
  assert.match(f.value.items[0].id,/^[a-zA-Z0-9_-]{8,64}$/);
});
test('R1.3 ordinal search reference requires its exact library ETag',async()=>{
  const f=libraryFixture();
  await f.run({type:'create',body:'中文日语翻译，保留表格。'});
  const search=await f.run({type:'search',query:'日语'});
  assert.equal(search.total,1);assert.equal(search.refs.etag,hash(f.value));
  await f.run({type:'set_enabled',target:'$search:1',enabled:false},{refs:search.refs});
  assert.equal(f.value.items[0].enabled,false);
  const oldRefs=search.refs,writes=f.writes;
  await f.run({type:'create',body:'新版本的英文校对。'});
  await assert.rejects(f.run({type:'move',target:'$search:1',direction:'down'},{refs:oldRefs}),
    {code:'E_PROMPT_REFERENCE_STALE'});
  assert.equal(f.writes,writes+1,'a stale ordinal is never executed');
});
test('R1.3 batch preview must be reviewed and preserve records on cancel',async()=>{
  const f=libraryFixture();
  await f.run({type:'create',body:'旧版测试：说明 A',name:'旧版测试 A'});
  await f.run({type:'create',body:'旧版测试：说明 B',name:'旧版测试 B'});
  const before=canonical(f.value),writes=f.writes;
  await assert.rejects(f.run({type:'delete',query:'旧版测试'},
    {review:async info=>{assert.equal(info.count,2);
      assert.equal(info.changes.length,2);
      assert.ok(info.changes.every(item=>item.after===null));return false;}}),{code:'E_CANCELLED'});
  assert.equal(canonical(f.value),before);assert.equal(f.writes,writes);
  let reviewed=null;
  await f.run({type:'batch_edit',query:'旧版测试',instruction:'精简'},
    {providerEdit:async({item})=>'精简：'+item.body,review:async value=>(reviewed=value,true)});
  assert.equal(reviewed.count,2);
  assert.ok(reviewed.changes.every(({before,after})=>
    before.body!==after.body&&after.body==='精简：'+before.body));
  assert.deepEqual(f.value.items.map(item=>item.name),['旧版测试 A','旧版测试 B']);
});
test('R1.3 8192 bytes whole-library limit and forbidden plan fields are fail-closed',async()=>{
  const f=libraryFixture();
  await assert.rejects(f.run({type:'create',body:'汉'.repeat(3000)}),{code:'E_TOOL_DATA_LIMIT'});
  assert.equal(f.writes,0);
  assert.throws(()=>validatePromptPlan({action:{type:'create',body:'x',approved:true}}),{code:'E_PROMPT_SCHEMA'});
  assert.throws(()=>validatePromptPlan({action:{type:'delete',query:'a',confirmed:true}}),{code:'E_PROMPT_SCHEMA'});
});
test('R1.3 ETag races never overwrite another writer; lost ACK is read back, not replayed',async()=>{
  const f=libraryFixture();
  let first=true;
  await assert.rejects(f.run({type:'create',body:'翻译 A'},{
    beforeWrite:async()=>{
      if(first){first=false;await f.run({type:'create',body:'来自另一窗口的修改'});}
    }}),{code:'E_STORAGE_CONFLICT'});
  assert.equal(f.value.items.length,1);assert.equal(f.writes,1);
  const recovered=await f.run({type:'create',body:'翻译 B'},{
    write:async payload=>{await f.write(payload);throw failure('E_HOST_ACK_LOST');}
  });
  assert.equal(recovered.writeIssued,true);
  assert.equal(f.writes,2,'lost ACK cannot cause another storage.set');
});
test('R1.3 image references are retained during edits and orphan candidates are identified only after readback',async()=>{
  const id='psa_'+'a'.repeat(32);
  const record=model.draft({body:'图片提示词',appearance:'image',imageAssetId:id});
  const f=libraryFixture({schema:1,items:[record],settings:model.defaults().settings});
  await f.run({type:'edit',target:record.id,instruction:'只修改正文'},
    {providerEdit:async()=> '新图片提示词'});
  assert.equal(f.value.items[0].imageAssetId,id);
  const removed=await f.run({type:'delete',query:'新图片提示词'});
  assert.deepEqual(removed.releasedImageAssets,[id]);
  assert.equal(f.value.items.length,0);
});
function hostFixture({proposal={action:{type:'create',body:'给我一份准确的英文翻译提示词'}},
  granted=true,initial=model.defaults(),allowReview=true,editResult='改进后的专业提示词'}={}){
  const chromeStore=new Map(),library=libraryFixture(initial),messages=[],confirms=[];
  const source={},token='prompt-fixture-'+crypto.randomUUID(),epoch='fixture-epoch';
  const api={storage:{local:{
    async get(key){return Object.fromEntries((Array.isArray(key)?key:[key])
      .map(k=>[k,structuredClone(chromeStore.get(k))]));},
    async set(rows){for(const [k,v] of Object.entries(rows))chromeStore.set(k,structuredClone(v));},
    async remove(key){chromeStore.delete(key);}
  }}};
  let currentProposal=proposal,currentEditResult=editResult;
  const conversation={source:()=>({provider:'fixture-provider'}),
    request:async({scope})=>({proposal:scope==='prompt-edit'?{body:currentEditResult}:currentProposal,
      authorization:{assertWrite:async()=>{},release:()=>{}}}),
    cancel:async()=>{}};
  let host,changed=false,guardReplies=0,commits=0,revoked=false;
  const dispatch=async(op,payload)=>{
    if(op==='storage.get'){const v=await library.read();return payload.withEtag?v:{value:v.value};}
    if(op==='storage.set'){commits++;return library.write(payload);}
    if(op==='prompt.asset.remove')return {removed:true};
    throw failure('E_SCOPE');
  };
  host=createTrustedPromptHost({
    api,tool:{id:'prompt-shortcuts',version:'1.1.12'},token,epoch,model,
    conversation,assertIdentity:async()=>{if(revoked)throw failure('E_TOOL_CHANGED');},
    frameSource:()=>source,guardBlocked:()=>false,dispatch,etagFor:async value=>hash(value),
    confirm:async args=>{confirms.push(args.message);return allowReview;},
    sendToFrame:message=>{
      messages.push(message);
      if(message.kind==='ai-guard'){
        queueMicrotask(()=>{guardReplies++;host.onGuardResponse({
          guardId:message.guardId,granted},source);});
      }
      if(message.kind==='state-changed')changed=true;
    }
  });
  return {host,api,library,chromeStore,messages,confirms,
    get changed(){return changed;},get guardReplies(){return guardReplies;},
    get commits(){return commits;},revoke:()=>{revoked=true;},
    setProposal:next=>{currentProposal=next;},
    setEditResult:next=>{currentEditResult=next;}};
}
test('R1.3 trusted Host guard nonce -> conditional dispatcher -> readback -> iframe notice',async()=>{
  const f=hostFixture();
  const result=await f.host.request({request:'创建英文翻译提示词',event:{isTrusted:true}});
  assert.equal(result.writeIssued,true);
  assert.equal(f.guardReplies,1);assert.equal(f.commits,1);assert.equal(f.changed,true);
  assert.ok(f.messages.some(message=>message.kind==='ai-guard-release'));
  assert.equal(f.chromeStore.has(PROMPT_AI_RECOVERY_KEY),false);
  assert.equal(f.library.value.items.length,1);
  f.host.dispose();
});
test('R1.3 sandbox Guard denial forbids all writes and recovery records',async()=>{
  const f=hostFixture({granted:false});
  await assert.rejects(f.host.request({request:'创建英文翻译提示词',
    event:{isTrusted:true}}),{code:'E_PROMPT_DRAFT'});
  assert.equal(f.commits,0);assert.equal(f.chromeStore.has(PROMPT_AI_RECOVERY_KEY),false);
  f.host.dispose();
});
test('R1.3 trusted Host review aborts destructive operations without a storage write',async()=>{
  const row=model.draft({body:'旧版测试',name:'旧版测试'});
  const f=hostFixture({initial:{schema:1,items:[row],settings:model.defaults().settings},
    proposal:{action:{type:'delete',query:'旧版测试'}},allowReview:false});
  await assert.rejects(f.host.request({request:'删除旧版测试',event:{isTrusted:true}}),
    {code:'E_CANCELLED'});
  assert.equal(f.commits,0);assert.equal(f.library.value.items.length,1);
  assert.match(f.confirms[0],/旧版测试/);
  f.host.dispose();
});
test('R1.3 pending receipt is independently reconciled, never replayed',async()=>{
  const f=hostFixture();await f.host.request({request:'创建英文翻译提示词',event:{isTrusted:true}});
  const expected=hash(f.library.value);
  await f.api.storage.local.set({[PROMPT_AI_RECOVERY_KEY]:{
    toolId:'prompt-shortcuts',version:'1.1.12',instance:'older-instance',
    installEpoch:'older-epoch',expectedEtag:expected,createdAt:Date.now()}});
  assert.equal((await f.host.recovery()).expectedEtag,expected);
  const before=f.commits;
  const checked=await f.host.reconcile();
  assert.equal(checked.verified,true);assert.match(checked.message,/写入已确认/);
  assert.equal(f.commits,before);assert.equal(f.chromeStore.has(PROMPT_AI_RECOVERY_KEY),false);
  f.host.dispose();
});

test('R1.3 an unresolved receipt from a retired instance blocks new write intent until readback',async()=>{
  const f=hostFixture();
  const record={toolId:'prompt-shortcuts',version:'1.1.12',
    instance:'retired',installEpoch:'prior',expectedEtag:'a'.repeat(64),createdAt:Date.now()};
  await f.api.storage.local.set({[PROMPT_AI_RECOVERY_KEY]:record});
  await assert.rejects(f.host.request({request:'再新建一条',
    event:{isTrusted:true}}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.commits,0);
  assert.deepEqual(f.chromeStore.get(PROMPT_AI_RECOVERY_KEY),record);
  f.host.dispose();
});

test('R1.4 unique natural-language shorthand resolves a saved prompt but ambiguity never writes',async()=>{
  const f=libraryFixture();
  await f.run({type:'create',body:'请把中文翻译成日语',name:'中日互译'});
  await f.run({type:'set_enabled',target:'翻译提示词',enabled:false});
  assert.equal(f.value.items[0].enabled,false);
  await f.run({type:'create',body:'请把英文翻译成法语',name:'英法互译'});
  const before=f.writes;
  await assert.rejects(f.run({type:'set_enabled',target:'翻译提示词',enabled:true}),
    {code:'E_PROMPT_AMBIGUOUS'});
  assert.equal(f.writes,before);
});

test('R1.4 exact before-version proves no retained write and unlocks without replay',async()=>{
  const f=hostFixture();
  const record={toolId:'prompt-shortcuts',version:'1.1.12',
    instance:'prior',installEpoch:'prior',
    beforeEtag:hash(f.library.value),expectedEtag:'f'.repeat(64),createdAt:Date.now()};
  await f.api.storage.local.set({[PROMPT_AI_RECOVERY_KEY]:record});
  const result=await f.host.reconcile();
  assert.equal(result.verified,true);
  assert.equal(result.status,'not_applied');
  assert.equal(f.commits,0);
  assert.equal(f.chromeStore.has(PROMPT_AI_RECOVERY_KEY),false);
  f.host.dispose();
});

test('R1.4 mismatched recovery stays UNKNOWN until an explicit review acknowledgement',async()=>{
  const f=hostFixture();
  const record={toolId:'prompt-shortcuts',version:'1.1.12',
    instance:'prior',installEpoch:'prior',beforeEtag:'a'.repeat(64),
    expectedEtag:'b'.repeat(64),createdAt:Date.now()};
  await f.api.storage.local.set({[PROMPT_AI_RECOVERY_KEY]:record});
  const first=await f.host.reconcile();
  assert.equal(first.verified,false);assert.equal(first.status,'uncertain');
  assert.equal(first.currentEtag,hash(f.library.value));
  assert.deepEqual(f.chromeStore.get(PROMPT_AI_RECOVERY_KEY),record);
  await assert.rejects(f.host.request({request:'创建一个新提示词',event:{isTrusted:true}}),
    {code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.commits,0);
  const checked=await f.host.reconcile({acknowledgeEtag:first.currentEtag});
  assert.equal(checked.verified,true);assert.equal(checked.status,'acknowledged');
  assert.equal(f.chromeStore.has(PROMPT_AI_RECOVERY_KEY),false);
  assert.equal(f.commits,0,'reconciliation never performs storage.set');
  f.host.dispose();
});

test('R1.4 stale review acknowledgement cannot erase newer unknown outcome',async()=>{
  const f=hostFixture();
  const record={toolId:'prompt-shortcuts',version:'1.1.12',
    instance:'prior',installEpoch:'prior',beforeEtag:'a'.repeat(64),
    expectedEtag:'b'.repeat(64),createdAt:Date.now()};
  await f.api.storage.local.set({[PROMPT_AI_RECOVERY_KEY]:record});
  const initial=await f.host.reconcile();
  const current=await f.library.read();
  await f.library.write({value:model.load({...current.value,items:[
    model.draft({body:'另一个窗口的合法修改'})]}),ifMatch:current.etag});
  const next=await f.host.reconcile({acknowledgeEtag:initial.currentEtag});
  assert.equal(next.verified,false);assert.equal(next.status,'uncertain');
  assert.deepEqual(f.chromeStore.get(PROMPT_AI_RECOVERY_KEY),record);
  f.host.dispose();
});


test('R1.4 Host verifies all seven Prompt business categories with readback and one iframe',async()=>{
  const base=model.defaults(),initial={...base,items:[
    model.draft({body:'翻译中文为日语',name:'测试翻译甲'}),
    model.draft({body:'翻译英文为中文',name:'测试翻译乙'}),
    model.draft({body:'翻译法文为中文',name:'测试翻译丙'})
  ].map((item,order)=>({...item,order}))};
  const f=hostFixture({initial});
  const run=async(action,request='用户明确要求操作',refs={})=>{
    f.setProposal({action});
    const value=await f.host.request({request,refs,event:{isTrusted:true}});
    assert.equal(hash(f.library.value),(await f.library.read()).etag);
    return value;
  };
  const created=await run({type:'create',body:'将中文翻译成日语，保留 Markdown 格式',name:'新增日语'});
  assert.equal(created.writeIssued,true);
  assert.equal(f.library.value.items.length,4);
  const beforeSearch=f.commits,guards=f.guardReplies;
  const found=await run({type:'search',query:'测试翻译'});
  assert.equal(found.total,3);
  assert.equal(f.commits,beforeSearch,'search is read-only');
  assert.equal(f.guardReplies,guards,'search does not acquire a draft guard');
  const thirdId=found.refs.matches[2];
  await run({type:'set_enabled',target:'$search:3',enabled:false},'把第三条停用',found.refs);
  assert.equal(f.library.value.items.find(row=>row.id===thirdId).enabled,false);
  await run({type:'move',target:thirdId,direction:'up'},'把第三条上移');
  assert.equal(f.library.value.items[1].id,thirdId);
  const oldName=f.library.value.items[1].name;
  const reviewsBeforeUpdate=f.confirms.length;
  await run({type:'update',target:thirdId,name:'专业翻译',label:'译'});
  assert.equal(f.library.value.items[1].name,'专业翻译');
  assert.equal(f.library.value.items[1].label,'译');
  assert.notEqual(oldName,f.library.value.items[1].name);
  assert.equal(f.confirms.length,reviewsBeforeUpdate,'attribute update never exports the private body');
  f.setEditResult('请专业翻译：保留所有 Markdown 标题和表格。');
  await run({type:'edit',target:thirdId,instruction:'更专业，保留格式'});
  assert.match(f.library.value.items[1].body,/Markdown/);
  const oldOthers=f.library.value.items.filter(row=>row.name.startsWith('测试翻译')).length;
  const beforeBatch=f.confirms.length;
  f.setEditResult('简洁版专业说明：保留 Markdown');
  await run({type:'batch_edit',query:'测试翻译',instruction:'缩短为简洁版本'});
  assert.equal(f.confirms.length-beforeBatch,2,'one grouped privacy review and one batch change review');
  assert.equal(f.library.value.items.filter(row=>row.name.startsWith('测试翻译')).length,oldOthers);
  const beforeDelete=f.confirms.length;
  await run({type:'delete',query:'新增日语'},'删除指定旧提示词');
  assert.equal(f.confirms.length-beforeDelete,1,'delete requires only one target review');
  assert.equal(f.library.value.items.some(row=>row.name==='新增日语'),false);
  assert.equal(f.messages.filter(m=>m.kind==='state-changed').length,7,
    'every durable Host write notifies the existing iframe; search does not');
  assert.equal(f.commits,7,'one storage.set per successful mutation, zero replays');
  assert.equal(f.chromeStore.has(PROMPT_AI_RECOVERY_KEY),false);
  f.host.dispose();
});

test('R1.4 update only changes the user-specified attributes and preserves opaque assets',async()=>{
  const id='psa_'+'a'.repeat(32),row=model.draft({
    body:'不得外传的原始正文',name:'手动名称',label:'保',appearance:'image',imageAssetId:id
  });
  const f=libraryFixture({schema:1,items:[row],settings:model.defaults().settings});
  const result=await f.run({type:'update',target:row.id,name:'新名称',enabled:false});
  const saved=f.value.items[0];
  assert.equal(result.writeIssued,true);assert.equal(saved.body,row.body);
  assert.equal(saved.imageAssetId,id);assert.equal(saved.appearance,'image');
  assert.equal(saved.label,'保');assert.equal(saved.name,'新名称');
  assert.equal(saved.enabled,false);assert.equal(f.writes,1);
  await f.run({type:'update',target:row.id,name:'',label:''});
  assert.equal(f.value.items[0].nameAuto,true);assert.equal(f.value.items[0].labelAuto,true);
  assert.throws(()=>validatePromptPlan({action:{type:'update',target:row.id,body:'越界'}}),
    {code:'E_PROMPT_SCHEMA'});
});
