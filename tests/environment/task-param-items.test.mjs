import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileParamItems,parseTaskParamsHeader,compileTaskSourceParams} from '../../scripts/compile-task-param-items.mjs';
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

const headerSource=readFileSync(new URL('../../examples/tasks/task-params-header.example.js',import.meta.url),'utf8');
test('script header is the author source; JSON fixtures are derived without changing R9',()=>{
  assert.deepEqual(parseTaskParamsHeader(headerSource),compact);
  assert.deepEqual(compileTaskSourceParams(headerSource),expanded);
  assert.deepEqual(compileTaskSourceParams('\ufeff'+headerSource.replace(/\n/g,'\r\n')),expanded);
  assert.equal(compileTaskSourceParams('async function main() {}\n'+headerSource),null);
  assert.deepEqual(compileTaskSourceParams(headerSource+'\n// @param text ignored "正文注释"'),expanded);
});
test('script metadata rejects malformed, duplicate, unsafe or executable declarations',()=>{
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("@version 1","@version 2"))(headerSource)),TypeError,"wrong version");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("// @version 1\n",""))(headerSource)),TypeError,"missing version");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("// @version 1","// @version 1\n// @version 1"))(headerSource)),TypeError,"duplicate version");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("// ==/OpenDeskParams==","// missing"))(headerSource)),TypeError,"unclosed header");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("@param number limit ","@param number keyword "))(headerSource)),TypeError,"duplicate field");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("@param text keyword ","@param text constructor "))(headerSource)),TypeError,"unsafe key");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=80 default=81"))(headerSource)),TypeError,"duplicate attr");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=80 component=\"el-slider\""))(headerSource)),TypeError,"unknown attr");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default={\"value\":80}"))(headerSource)),TypeError,"object");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=1+2"))(headerSource)),TypeError,"expression");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=alert(1)"))(headerSource)),TypeError,"function");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace('default="浏览器"',"default='浏览器'"))(headerSource)),TypeError,"single quote");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=null"))(headerSource)),TypeError,"null");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=1e999"))(headerSource)),TypeError,"infinity");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace('["markdown","Markdown"]','["markdown","Markdown","third"]'))(headerSource)),TypeError,"invalid option pair");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace('default=["article","link"]','default=["article","link"'))(headerSource)),TypeError,"unclosed array");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace('default=["article","link"]','default=[[["article"]]]'))(headerSource)),TypeError,"nested array");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=80unit=\"%\""))(headerSource)),TypeError,"bad spacing");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace(" required "," required=false "))(headerSource)),TypeError,"required assignment");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("// ==/OpenDeskParams==",Array.from({length:3},(_,i)=>'// @param text added'+i+' "额外"').join("\n")+"\n// ==/OpenDeskParams=="))(headerSource)),TypeError,"too many fields");
  assert.throws(()=>parseTaskParamsHeader((s=>s.replace("default=80","default=80 description="+JSON.stringify("x".repeat(66000))))(headerSource)),TypeError,"oversize header");
  assert.throws(()=>compileTaskSourceParams(headerSource.replace('@param text keyword','@param el-input keyword')),TypeError);
  assert.throws(()=>compileTaskSourceParams(headerSource.replace('step=5','step="5"')),TypeError);
});
test('header scanner preserves typed literal values, escaping and missing fields',()=>{
  const items=parseTaskParamsHeader("// ==OpenDeskParams==\n// @version 1\n// @param number n \"小数\" valueType=\"number\" default=0 step=0.1\n// @param radio x \"模式\" valueType=\"integer\" options=[[0,\"零\"],1] default=0\n// @param switch b \"开关\" default=false\n// @param text s \"空值\" default=\"\"\n// @param checkbox optional \"未设置\"\n// @param text escaped \"引号\\\" 和空格\" description=\"路径 C:\\\\a b\"\n// ==/OpenDeskParams==\n").paramItems;
  assert.equal(items[0].default,0);
  assert.deepEqual(items[1].options,[{value:0,label:'零'},{value:1,label:'1'}]);
  assert.equal(items[2].default,false);
  assert.equal(items[3].default,'');
  assert.equal(Object.hasOwn(items[4],'default'),false);
  assert.equal(items[5].label,"引号\" 和空格");
  assert.equal(items[5].description,"路径 C:\\a b");
});

test('minimal two-parameter authoring example compiles without adding a business task',()=>{
  const source=readFileSync(new URL('../../examples/tasks/task-params-minimal.example.js',import.meta.url),'utf8');
  assert.deepEqual(compileTaskSourceParams(source),{
    paramsSchemaVersion:2,
    paramsSchema:{
      type:'object',
      properties:{
        keyword:{type:'string',title:'关键词',minLength:1},
        limit:{type:'integer',title:'数量',default:20,minimum:1,maximum:100}
      },
      required:['keyword'],
      additionalProperties:false
    },
    paramsUi:{version:1,order:['keyword','limit'],fields:{}}
  });
});
