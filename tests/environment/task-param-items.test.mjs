import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileParamItems} from '../../scripts/compile-task-param-items.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../../'+path,import.meta.url),'utf8'));
const compact=read('examples/tasks/task-param-items.example.json'), expanded=read('examples/tasks/task-params-v2.example.json');

test('one row per field compiles to the existing R10 example without duplicate authoring constraints',()=>{
  assert.equal(compact.paramItems.length,14);
  assert.equal(new Set(compact.paramItems.map(x=>x.type)).size,12);
  assert.deepEqual(compileParamItems(compact),expanded);
  const copy=structuredClone(compact);const compiled=compileParamItems(copy);
  compiled.paramsSchema.properties.contentTypes.default.push('image');
  assert.deepEqual(copy.paramItems.find(x=>x.key==='contentTypes').default,['article','link']);
});
test('compact declaration rejects unknown/ambiguous/unsafe shapes',()=>{
  {const input=structuredClone(compact);(x=>x.paramsSchema={})(input);assert.throws(()=>compileParamItems(input),TypeError,"unknown root");}
  {const input=structuredClone(compact);(x=>x.paramItemsVersion=2)(input);assert.throws(()=>compileParamItems(input),TypeError,"unknown version");}
  {const input=structuredClone(compact);(x=>x.paramItems[1].key=x.paramItems[0].key)(input);assert.throws(()=>compileParamItems(input),TypeError,"duplicate key");}
  {const input=structuredClone(compact);(x=>x.paramItems[0].key="constructor")(input);assert.throws(()=>compileParamItems(input),TypeError,"unsafe key");}
  {const input=structuredClone(compact);(x=>x.paramItems[0].type="el-input")(input);assert.throws(()=>compileParamItems(input),TypeError,"unknown type");}
  {const input=structuredClone(compact);(x=>x.paramItems[0].component={name:"el-input"})(input);assert.throws(()=>compileParamItems(input),TypeError,"unknown field");}
  {const input=structuredClone(compact);(x=>x.paramItems[0].required="true")(input);assert.throws(()=>compileParamItems(input),TypeError,"nonboolean required");}
  {const input=structuredClone(compact);(x=>x.paramItems[0].min=0)(input);assert.throws(()=>compileParamItems(input),TypeError,"numeric constraint on text");}
  {const input=structuredClone(compact);(x=>x.paramItems[2].step="5")(input);assert.throws(()=>compileParamItems(input),TypeError,"wrong step");}
  {const input=structuredClone(compact);(x=>x.paramItems[0].unit="%")(input);assert.throws(()=>compileParamItems(input),TypeError,"unknown unit");}
  {const input=structuredClone(compact);(x=>x.paramItems[3].options[1].value=x.paramItems[3].options[0].value)(input);assert.throws(()=>compileParamItems(input),TypeError,"duplicate option");}
  {const input=structuredClone(compact);(x=>x.paramItems[3].options[0].value=1)(input);assert.throws(()=>compileParamItems(input),TypeError,"wrong option type");}
  {const input=structuredClone(compact);(x=>x.paramItems[3].default="xml")(input);assert.throws(()=>compileParamItems(input),TypeError,"unknown default option");}
  {const input=structuredClone(compact);(x=>x.paramItems[8].default=["image","image"])(input);assert.throws(()=>compileParamItems(input),TypeError,"duplicate array choice");}
  {const input=structuredClone(compact);(x=>delete x.paramItems[2].default)(input);assert.throws(()=>compileParamItems(input),TypeError,"missing slider default");}
  {const input=structuredClone(compact);(x=>x.paramItems[5].valueType="string")(input);assert.throws(()=>compileParamItems(input),TypeError,"unknown valueType");}
});
test('integer and number, typed options, zero/false/empty and absence stay distinct',()=>{
  const x=compileParamItems({paramItemsVersion:1,paramItems:[
    {key:'decimal',label:'小数',type:'number',valueType:'number',step:0.1,default:0},
    {key:'choice',label:'模式',type:'radio',valueType:'integer',options:[{value:0,label:'零'},{value:1,label:'一'}],default:0},
    {key:'flag',label:'开关',type:'switch',default:false},
    {key:'notes',label:'备注',type:'text',default:''},
    {key:'maybe',label:'可选',type:'checkbox'}
  ]});
  assert.equal(x.paramsSchema.properties.decimal.type,'number');
  assert.equal(x.paramsSchema.properties.decimal.default,0);
  assert.deepEqual(x.paramsSchema.properties.choice.enum,[0,1]);
  assert.equal(x.paramsSchema.properties.flag.default,false);
  assert.equal(x.paramsSchema.properties.notes.default,'');
  assert.equal(Object.hasOwn(x.paramsSchema.properties.maybe,'default'),false);
});
