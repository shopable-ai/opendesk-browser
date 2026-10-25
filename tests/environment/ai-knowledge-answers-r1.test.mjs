import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';

const base=new URL('../../examples/sidebar-tools/ai-knowledge-answers/',import.meta.url);
const source=readFileSync(new URL('src/model.js',base),'utf8');
const context={TextEncoder,crypto:{randomUUID}};
runInNewContext(source,context,{filename:'src/model.js'});
const m=context.OpenDeskKnowledgeAnswersModel;
const js=value=>JSON.parse(JSON.stringify(value));
const record=(question='退款期限是多少',answer='7 天内可退款',scope='')=>({
  id:m.newId(),question,aliases:['多久可以退款'],answer,scope,enabled:true
});
const library=()=>m.save(m.empty(),record());

test('R1 固定问题、同义问题返回真知识 ID，适用条件不可跨域',()=>{
  const db=library();
  const direct=m.lookup(db,{question:'多久可以退款'});
  assert.equal(direct.status,'ANSWERED_FIXED');
  assert.equal(direct.answer,'7 天内可退款');
  assert.deepEqual(js(direct.sourceIds),[db.items[0].id]);
  assert.equal(direct.needsHuman,false);
  assert.equal(m.lookup(db,{question:'多久可以退款',scope:'产品 B'}).status,'NO_MATCH');
});

test('R1 未知、否定问题不被当作固定问答',()=>{
  const db=library();
  assert.notEqual(m.lookup(db,{question:'不允许退款吗'}).status,'ANSWERED_FIXED');
  assert.equal(m.lookup(db,{question:'航天飞船位置'}).status,'NO_MATCH');
});

test('R1 非精确问题只返回有实际 ID 的候选，不伪称 AI 已生成',()=>{
  const db=library();
  const hit=m.lookup(db,{question:'退款需要多少天'});
  assert.equal(hit.status,'RETRIEVED_ONLY');
  assert.equal(hit.answer,'');
  assert.equal(hit.needsHuman,true);
  assert.ok(hit.sourceIds.every(id=>db.items.some(row=>row.id===id)));
});

test('R1 伪造引用与模型新增金额、期限被拒绝或转人工；属于生成器替身单测',async()=>{
  const db=library(),query={question:'退款需要多少天'};
  const bad=await m.answerWithAI(db,query,async()=>({
    proposal:{answer:'7 天内',sourceIds:['qa_unknownxyz'],needsHuman:false}
  }));
  assert.equal(bad.status,'INVALID_AI');
  assert.equal(bad.answer,'');
  const drift=await m.answerWithAI(db,query,async()=>({
    proposal:{answer:'30 天内可退款',sourceIds:[db.items[0].id],needsHuman:false}
  }));
  assert.equal(drift.status,'INVALID_AI');
  assert.equal(drift.answer,'');
  assert.equal(drift.reason,'NUMERIC_DRIFT');
  assert.equal(drift.needsHuman,true);
  const valid=await m.answerWithAI(db,query,async()=>({
    proposal:{answer:'7天内可退款',sourceIds:[db.items[0].id],needsHuman:false}
  }));
  assert.equal(valid.status,'REVIEW_REQUIRED');
  assert.equal(valid.needsHuman,true);
});

test('R1 查不到候选不得调用模型',async()=>{
  const db=library();let called=0;
  const result=await m.answerWithAI(db,{question:'航天飞船位置'},async()=>{called++;return {};});
  assert.equal(called,0);assert.equal(result.status,'NO_MATCH');
});

test('R1 编辑、停用、删除后必须使用新索引',()=>{
  let db=library(),r=db.items[0];
  const edited={...r,question:'商品退货时间',aliases:[],answer:'15 天后不退'};
  db=m.save(db,edited);
  assert.equal(m.lookup(db,{question:'商品退货时间'}).answer,'15 天后不退');
  db=m.save(db,{...edited,enabled:false});
  assert.equal(m.lookup(db,{question:'商品退货时间'}).status,'NO_MATCH');
  db=m.remove(db,r.id);
  assert.equal(db.items.length,0);
});

test('R1 无效版本、重复 ID、过大数据、恶意额外字段必须拒绝',()=>{
  const db=library();
  assert.throws(()=>m.library({...db,version:2}),/格式/);
  assert.throws(()=>m.library({version:1,items:[db.items[0],db.items[0]]}),/重复/);
  assert.throws(()=>m.save(db,{...db.items[0],answer:'X'.repeat(1300)}),/格式/);
  assert.throws(()=>m.library({version:1,items:[{...db.items[0],execute:'shell'}]}),/格式/);
  assert.throws(()=>m.library({version:1,items:Array.from({length:21},()=>record())}),/20/);
});

test('R1 JSON/CSV 往返、逗号换行、合并跳过重复与替换',()=>{
  let db=library();const old=db.items[0];
  db=m.save(db,{...record('操作指南','第一行,\n第二行'),aliases:['别名','其他说法']});
  assert.deepEqual(js(m.parseJson(JSON.stringify(db))),js(db));
  assert.deepEqual(js(m.parseCsv(m.exportCsv(db))),js(db));
  const merged=m.merge(db,db,'merge');
  assert.equal(merged.added,0);assert.equal(merged.conflicts,2);
  const replaced=m.merge(db,{version:1,items:[old]},'replace');
  assert.equal(replaced.library.items.length,1);
  assert.throws(()=>m.parseJson('{"items":[]}'),/格式/);
  assert.throws(()=>m.parseCsv('id,question\n1,2'),/表头/);
});

test('R1 工具安全声明不能把 ai.access 代理权限伪装成通用 AI',()=>{
  const meta=JSON.parse(readFileSync(new URL('tool.config.json',base),'utf8'));
  assert.equal(meta.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(meta.capabilities,['storage.local','user.export']);
  assert.ok(meta.files.dependencies.includes('src/model.js'));
  const main=readFileSync(new URL('src/main.js',base),'utf8');
  assert.match(main,/RETRIEVED_ONLY/);
  assert.match(main,/storage\.set/);
  assert.match(main,/withEtag:true/);
  assert.doesNotMatch(main,/chrome\.runtime\.sendMessage|new WebSocket|fetch\(/);
});
