import test from 'node:test';
import assert from 'node:assert/strict';
import {checkParamsSchemaV2,validateTaskParamsV2} from '../../src/platform/tasks/params-v2.js';

const schema=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const r=(type,extra={})=>({type,title:'Parameter',...extra});
const one=(rule,required=[])=>schema({value:rule},required);
const verify=(rule,value)=>validateTaskParamsV2(one(rule),{value});
const invalid=(rule,value)=>assert.throws(()=>verify(rule,value),{code:'E_PARAMS'});
const reject=(rule)=>assert.throws(()=>checkParamsSchemaV2(one(rule)),{code:'E_SCHEMA'});
const time='^(?:[01][0-9]|2[0-3]):[0-5][0-9]$';

test('presence and defaults preserve false, zero, empty string, empty array, and missing',()=>{
  const s=schema({keyword:r('string',{minLength:1}),limit:r('integer',{const:3,default:3}),
    shown:r('boolean',{default:true}),zero:r('number',{default:0}),notes:r('string',{default:''}),
    tags:r('array',{items:{type:'string',enum:['x','y']},uniqueItems:true,default:[]}),optional:r('boolean')},['keyword','limit']);
  const a=validateTaskParamsV2(s,{keyword:'test',shown:false});
  assert.deepEqual(a,{keyword:'test',limit:3,shown:false,zero:0,notes:'',tags:[]});
  a.tags.push('x');assert.deepEqual(s.properties.tags.default,[]);
  assert.throws(()=>validateTaskParamsV2(s,{}),{code:'E_PARAMS'});
  assert.throws(()=>validateTaskParamsV2(s,{keyword:'test',limit:4}),{code:'E_PARAMS'});
  for(const v of [null,undefined,'false',0])assert.throws(()=>validateTaskParamsV2(s,{keyword:'test',shown:v}),{code:'E_PARAMS'});
});
test('closed JSON, safe field names, declarations, enum and const collisions',()=>{
  for(const key of ['constructor','prototype','__proto__','1bad'])assert.throws(()=>checkParamsSchemaV2(schema({[key]:r('string')})),{code:'E_SCHEMA'});
  for(const props of [{type:'string',title:'a',default:null},{type:'string',title:'a',pattern:'.*'},
    r('number',{enum:[1,1]}),r('integer',{const:3,enum:[4]}),r('number',{default:4,maximum:3}),
    r('integer',{minimum:0.1,maximum:0.9}),r('string',{minLength:1025}),r('string',{maxLength:1,default:'ab'}),r('boolean',{foo:true})])reject(props);
  const s=one(r('string'));
  for(const p of [undefined,null,[],{unknown:'x'},{value:undefined},{value:{nested:{}}},JSON.parse('{"__proto__":1}'),{value:'\ud800'}])
    assert.throws(()=>validateTaskParamsV2(s,p),{code:'E_PARAMS'});
  assert.throws(()=>checkParamsSchemaV2(schema({value:r('string')},['missing'])),{code:'E_SCHEMA'});
});
test('exact decimal grid, numeric limits and Unicode code points',()=>{
  const rule=r('number',{minimum:-1,maximum:1,multipleOf:0.1});
  for(const value of [-0.3,0,0.3,1])assert.deepEqual(verify(rule,value),{value});
  for(const value of [0.1+0.2,0.31,1.1,NaN,Infinity,'0.3'])invalid(rule,value);
  assert.deepEqual(verify(r('number',{multipleOf:1e-7}),3e-7),{value:3e-7});
  reject(r('number',{minimum:0.01,maximum:0.09,multipleOf:0.1}));
  reject(r('integer',{minimum:1,maximum:2,multipleOf:1.5}));
  assert.deepEqual(verify(r('integer',{multipleOf:1.5}),3),{value:3});
  invalid(r('integer'),Number.MAX_SAFE_INTEGER+1);
  assert.deepEqual(verify(r('string',{minLength:1,maxLength:1}),'😀'),{value:'😀'});
});
test('date, time and HTTP(S) URI validate actual values without granting permissions',()=>{
  const d=r('string',{format:'date'}),t=r('string',{pattern:time}),u=r('string',{format:'uri',pattern:'^https?://'});
  for(const v of ['0001-01-01','2000-02-29','2024-02-29','9999-12-31'])assert.deepEqual(verify(d,v),{value:v});
  for(const v of ['0000-01-01','1900-02-29','2026-02-30','2026-11-25\n','2026-1-01'])invalid(d,v);
  for(const v of ['00:00','23:59'])assert.deepEqual(verify(t,v),{value:v});
  for(const v of ['24:00','12:60','12:00\n','1:00','09:30:00'])invalid(t,v);
  for(const v of ['https://example.com/','http://localhost:43111/path','https://[::1]/'])assert.deepEqual(verify(u,v),{value:v});
  for(const v of ['javascript:alert(1)','http:example.com','https:///example.com','https://user:pass@example.com','https://@example.com','https://exa mple.com','https://example.com\\x','https://*','https://'])invalid(u,v);
  reject(r('string',{format:'date',pattern:time}));reject(r('string',{format:'date',maxLength:9}));
});
test('array choices preserve order and reject holes, duplicates and empty domains',()=>{
  const rule=r('array',{items:{type:'integer',enum:[0,1,2]},uniqueItems:true,minItems:1,maxItems:2});
  assert.deepEqual(verify(rule,[2,0]),{value:[2,0]});
  for(const v of [[],[1,1],[3],[1,'2'],[0,1,2],Array(1),[{}]])invalid(rule,v);
  reject({...rule,minItems:4});reject({...rule,uniqueItems:false});reject({...rule,default:[3]});
});
test('all 12 widgets and UI mapping remain declaration-only; reject mismatches',()=>{
  const properties={text:r('string'),textarea:r('string'),number:r('integer'),slider:r('number',{minimum:0,maximum:1,multipleOf:0.1,default:0.3}),
    checkbox:r('boolean'),switch:r('boolean'),select:r('integer',{enum:[0,1]}),radio:r('boolean',{enum:[false,true]}),
    'multi':r('array',{items:{type:'string',enum:['a','b']},uniqueItems:true}),date:r('string',{format:'date'}),time:r('string',{pattern:time}),url:r('string',{format:'uri'})};
  const order=Object.keys(properties),fields=Object.fromEntries(order.map(k=>[k,{widget:k==='multi'?'multi-checkbox':k}]));
  fields.slider.unit='%';fields.select.optionLabels=['Zero','One'];
  const s=schema(properties),ui={version:1,order,fields};
  assert.equal(checkParamsSchemaV2(s,ui),s);
  assert.deepEqual(validateTaskParamsV2(s,{select:0,radio:false,multi:[],textarea:'line\nline'},ui),{slider:0.3,select:0,radio:false,multi:[],textarea:'line\nline'});
  for(const bad of [{...ui,version:2},{...ui,order:order.slice(1)},{...ui,order:[...order.slice(1),order[1]]},
    {...ui,fields:{other:{widget:'text'}}},{...ui,fields:{number:{widget:'switch'}}},{...ui,fields:{text:{unit:'x'}}},
    {...ui,fields:{radio:{optionLabels:['one']}}},{...ui,fields:{slider:{step:0.2}}}])assert.throws(()=>checkParamsSchemaV2(s,bad),{code:'E_SCHEMA'});
  assert.throws(()=>checkParamsSchemaV2(one(r('integer',{minimum:1,maximum:10,multipleOf:2,default:2})),{version:1,fields:{value:{widget:'slider'}}}),{code:'E_SCHEMA'});
});
test('runtime JSON byte budget applies to supplied and default-expanded values',()=>{
  const properties=Object.fromEntries(Array.from({length:16},(_,i)=>['f'+i,r('string',{maxLength:4096,default:'界'.repeat(4096)})]));
  const s=schema(properties);assert.equal(checkParamsSchemaV2(s),s);
  assert.throws(()=>validateTaskParamsV2(s,{}),{code:'E_PARAMS'});
  const values=Object.fromEntries(Object.keys(properties).map(k=>[k,'界'.repeat(4096)]));
  assert.throws(()=>validateTaskParamsV2(s,values),{code:'E_PARAMS'});
});
