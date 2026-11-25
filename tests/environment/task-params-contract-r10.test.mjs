import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {checkParamsSchema,validateTaskParams,verifyTaskPackage} from '../../src/platform/tasks/contract.js';

const read = path => readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const example=JSON.parse(read('task-packs/examples/task-params-v2.example.json'));
const meta=JSON.parse(read('schemas/opendesk-task-params.v2.schema.json'));
const preview=read('prototypes/sidebar/my/index.html');
const marker='  const manyParamsFixture = () => compileTask(';
const start=preview.indexOf(marker)+marker.length;
const end=preview.indexOf('\n});',start);
const fixture=JSON.parse(preview.slice(start,end+2));
const plain=value=>JSON.parse(JSON.stringify(value));

test('R10 fixture equals R9 mirror and covers all twelve widgets',()=>{
  assert.ok(start>=marker.length&&end>start);
  assert.equal(example.paramsSchemaVersion,2);
  assert.deepEqual(example.paramsSchema,fixture.paramsSchema);
  assert.deepEqual(example.paramsUi,fixture.paramsUi);
  assert.equal(Object.keys(example.paramsSchema.properties).length,14);
  const source=preview.slice(preview.indexOf('  const own='),preview.indexOf('  const taskSeed'));
  const runtime=runInNewContext(source+'\n({compileTask,initialParams,fieldIssue,normalizedParams})');
  const task=runtime.compileTask(fixture);
  assert.deepEqual([...new Set(task.fields.map(f=>f.widget))].sort(),[...meta.$defs.uiField.properties.widget.enum].sort());
  const initial=plain(runtime.initialParams(task));
  assert.equal(initial.externalOnly,false);
  assert.equal(initial.notes,'');
  assert.equal(initial.quality,80);
  assert.ok(!Object.hasOwn(initial,'startUrl'));
  const check=(key,value)=>runtime.fieldIssue(task.fields.find(f=>f.key===key),value,false);
  assert.notEqual(check('quality',81),null);
  assert.equal(check('quality',0),null);
  assert.notEqual(check('contentTypes',['image','image']),null);
  assert.notEqual(check('since','2026-02-30'),null);
  assert.notEqual(check('afterTime','24:00'),null);
  assert.notEqual(check('startUrl','javascript:alert(1)'),null);
  assert.deepEqual(plain(runtime.normalizedParams(task,{quality:0,externalOnly:false,notes:'',contentTypes:[]})).contentTypes,[]);
});

test('legacy package and default semantics remain valid; v2 is not accepted by legacy validator',async()=>{
  const pkg=JSON.parse(read('task-packs/baidu.search/releases/baidu.search.top3.v1.opendesk-task.json'));
  assert.equal(pkg.manifest.version,'1.1.6');
  assert.equal(Object.hasOwn(pkg.manifest,'paramsUi'),false);
  await verifyTaskPackage(pkg);
  const schema=pkg.manifest.paramsSchema;
  assert.deepEqual(validateTaskParams(schema,{query:'浏览器'}),{query:'浏览器',limit:3,showExecutionTab:true});
  assert.deepEqual(validateTaskParams(schema,{query:'浏览器',showExecutionTab:false}),{query:'浏览器',limit:3,showExecutionTab:false});
  assert.throws(()=>validateTaskParams(schema,{}),/Missing required parameter/);
  assert.throws(()=>checkParamsSchema(example.paramsSchema));
});

// The Markdown examples are a derived view, never a second parameter source.
test('developer guide control fragments match the canonical example',()=>{
  const guide=read('docs/api/task-params.zh-CN.md');
  const pairs=[["text","keyword"],["textarea","notes"],["number","limit"],["slider","quality"],["checkbox","includeLinks"],["switch","deduplicate"],["select","format"],["radio","scope"],["multi-checkbox","contentTypes"],["date","since"],["time","afterTime"],["url","startUrl"]];
  const expected=pairs.map(([widget,key])=>JSON.stringify({widget,key,rule:example.paramsSchema.properties[key],ui:example.paramsUi.fields[key]||{}})).join('\n');
  const begin='<!-- task-params-control-examples:start -->\n'+String.fromCharCode(96,96,96)+'jsonl\n';
  const end='\n'+String.fromCharCode(96,96,96)+'\n<!-- task-params-control-examples:end -->';
  const start=guide.indexOf(begin);
  assert.ok(start>=0);
  const finish=guide.indexOf(end,start+begin.length);
  assert.ok(finish>start);
  assert.equal(guide.slice(start+begin.length,finish),expected);
});
