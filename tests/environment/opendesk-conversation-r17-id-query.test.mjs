import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {executePromptPlan} from '../../src/ui/conversation/prompt-actions.js';
import '../../examples/sidebar-tools/prompt-shortcuts/trusted/model.js';

const model=globalThis.OpenDeskPromptShortcutsModel;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

const fixture=(items,refs={},adapter=model)=>{
 let value=adapter.load({...model.defaults(),items});
 const calls={writes:0,guards:0,reviews:0,edits:0};
 return {calls,get value(){return value;},run:action=>executePromptPlan({plan:{action},model:adapter,refs,
  read:async()=>({value:structuredClone(value),etag:hash(value)}),
  write:async({value:next})=>{calls.writes++;value=structuredClone(next);
   return {saved:true,etag:hash(value)};},
  beforeWrite:async()=>{calls.guards++;},
  review:async()=>{calls.reviews++;return true;},
  providerEdit:async()=>{calls.edits++;return '错误编辑';}})};
};

for(const id of ['12345678-1234-4234-8234-123456789abc','ps_0123456789abcdef0123456789abcdef',
 'verified_legacy_id']){
 for(const field of ['name','label','body']){
  // Labels accept at most two graphemes: the injected model preserves a legacy
  // label for this resolver test, without changing the production data model.
  test(`R1.7 missing ID ${id} mentioned in ${field} never falls back to text`,async t=>{
   const row={...model.draft({name:'保留记录',body:'普通正文'}),[field]:id};
   const resolverModel=field==='label'?{...model,load:value=>structuredClone(value)}:model;
   const setup=()=>fixture([row],id==='verified_legacy_id'?{matches:[id]}:{},resolverModel);
   await t.test('search',async()=>{
    const f=setup(),found=await f.run({type:'search',query:id});
    assert.equal(found.total,0);assert.deepEqual(found.refs.matches,[]);
   });
   for(const action of [
    {type:'delete',query:id},{type:'batch_enabled',query:id,enabled:false},
    {type:'batch_edit',query:id,instruction:'精简'},
    {type:'edit',target:id,instruction:'精简'},
    {type:'update',target:id,name:'错误名称'},
    {type:'set_enabled',target:id,enabled:false},{type:'move',target:id,direction:'down'}
   ])await t.test(action.type,async()=>{
    const f=setup(),before=structuredClone(f.value);
    await assert.rejects(f.run(action),{code:'E_PROMPT_NOT_FOUND'});
    assert.deepEqual(f.calls,{writes:0,guards:0,reviews:0,edits:0});
    assert.deepEqual(f.value,before);
   });
  });
 }
}

test('R1.7 ordinary name, label and body searches remain textual',async()=>{
 const row=model.draft({name:'普通名称',label:'译',body:'独特正文内容'}),f=fixture([row]);
 for(const query of ['名称','译','独特正文']){
  const found=await f.run({type:'search',query});
  assert.deepEqual(found.refs.matches,[row.id]);
 }
 assert.deepEqual(f.calls,{writes:0,guards:0,reviews:0,edits:0});
});

test('R1.7 existing IDs stay unique even when another record has the ID as its name',async()=>{
 for(const id of ['12345678-1234-4234-8234-123456789abc',
  'ps_0123456789abcdef0123456789abcdef','verified_legacy_id']){
  const row={...model.draft({name:'精确目标',body:'目标正文'}),id};
  const other={...model.draft({name:id,body:'引用 '+id}),order:1};
  const f=fixture([row,other]);
  const found=await f.run({type:'search',query:' '+id+' '});
  assert.deepEqual(found.refs.matches,[id]);
  await f.run({type:'update',target:' '+id+' ',name:'准确更新'});
  assert.equal(f.value.items[0].name,'准确更新');
  assert.deepEqual(f.value.items[1],model.load({...model.defaults(),items:[other]}).items[0]);
  assert.deepEqual(f.calls,{writes:1,guards:2,reviews:0,edits:0});
 }
});

test('R1.7 verified record ID queries select exactly that record, including destructive review',async()=>{
  const row=model.draft({name:'R17旧版测试提示词',body:'可处置的旧版测试内容。'});
  // A different record mentioning the ID must never be included in its deletion.
  const other=model.draft({name:'保留说明',body:'引用旧记录 ID：'+row.id});
  let value=model.load({...model.defaults(),items:[row,{...other,order:1}]}),writes=0,guards=0;
  const run=(action,review=async()=>true)=>executePromptPlan({plan:{action},model,
    read:async()=>({value:structuredClone(value),etag:hash(value)}),
    write:async({value:next,ifMatch})=>{assert.equal(ifMatch,hash(value));
      value=structuredClone(next);writes++;return {saved:true,etag:hash(value)};},
    beforeWrite:async()=>{guards++;},review});

  const found=await run({type:'search',query:row.id});
  assert.deepEqual(found.refs.matches,[row.id]);
  assert.equal(found.total,1);assert.equal(writes,0);assert.equal(guards,0);
  const before=structuredClone(value);
  await assert.rejects(run({type:'delete',query:row.id},async proposal=>{
    assert.equal(proposal.count,1);assert.equal(proposal.changes[0].id,row.id);
    assert.equal(proposal.changes[0].after,null);return false;
  }),{code:'E_CANCELLED'});
  assert.deepEqual(value,before);assert.equal(writes,0);assert.equal(guards,0);
  await run({type:'delete',query:row.id},async proposal=>{
    assert.deepEqual(proposal.items.map(item=>item.id),[row.id]);return true;
  });
  assert.equal(writes,1);assert.deepEqual(value.items.map(item=>item.id),[other.id]);
  assert.equal(value.items[0].body,other.body);
});
