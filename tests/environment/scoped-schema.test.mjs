import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';
import {rollup} from 'rollup';
import schema from '../../src/platform/schema.js';
import {validate,validateSchema} from '../../src/platform/protocol.js';
import {createSchemaSpecializer} from '../../scripts/scoped-schema.mjs';
import {createMethodRoutes} from '../../src/platform/host/broker.js';

const root=process.cwd(),specializer=createSchemaSpecializer(schema,{root});
const named=await import('data:text/javascript;base64,'+Buffer.from(specializer.namedExports()).toString('base64'));
const scope=name=>named['opendeskSchemaScope'+specializer.names.indexOf(name)];
const outcome=fn=>{try{return {ok:true,value:fn()};}catch(error){return {ok:false,code:error.code,message:error.message};}};

test('every named rule retains the byte-identical complete local reference closure',()=>{
  assert.equal(specializer.names.length,Object.keys(schema.$defs).length);
  for(const name of specializer.names) {
    assert.deepEqual(Object.keys(scope(name).$defs),specializer.closure(name));
    for(const [key,rule] of Object.entries(scope(name).$defs))
      assert.equal(JSON.stringify(rule),JSON.stringify(schema.$defs[key]));
  }
  assert(specializer.closure('Limits').length<Object.keys(schema.$defs).length);
  assert(specializer.closure('RulePlan').includes('TemplateRevision'),'nested pointers retain their owning definition');
});

test('all frozen roots give identical results, error codes and messages for malformed inputs',()=>{
  const samples=[null,undefined,true,false,0,-1,1.5,NaN,'','2026-10-10T12:00:00Z',[],{},
    {unexpected:true},Object.assign(Object.create(null),{a:1}),[undefined],new Date(0),{a:'\ud800'}];
  for(const name of specializer.names)for(const value of samples)
    assert.deepEqual(outcome(()=>validateSchema(scope(name),name,value)),outcome(()=>validate(name,value)),name);
  const limits={maxPages:50,maxRecords:10000,maxDurationMs:600000,maxStoredBytes:20971520};
  assert.equal(validateSchema(scope('Limits'),'Limits',limits),limits,'successful validation preserves identity');
  assert.deepEqual(outcome(()=>validateSchema(scope('Limits'),'Limits',{...limits,maxPages:51})),
    outcome(()=>validate('Limits',{...limits,maxPages:51})));
});

test('reference cycles are retained, while unresolved or unreviewed references block generation',()=>{
  const cyclic={$defs:{A:{anyOf:[{type:'null'},{$ref:'#/$defs/B'}]},B:{$ref:'#/$defs/A'}}};
  assert.deepEqual(createSchemaSpecializer(cyclic).closure('A'),['A','B']);
  for(const $ref of ['https://example.invalid/schema','#/$defs/Missing','#/$defs/A/missing','#/$defs/A/~2bad'])
    assert.throws(()=>createSchemaSpecializer({$defs:{A:{$ref}}}),/reference|pointer|dependency/);
});

test('literal calls and import aliases specialize, but dynamic, unknown and namespace calls retain the generic path',()=>{
  const id=resolve(root,'src/audit-fixture.js');
  const source="import {validate as check} from './platform/protocol.js';\ncheck('Limits',value); check(name,value); check('Unknown',value);";
  const result=specializer.transform(source,id).code;
  assert.match(result,/Validate\(__opendeskScopedRule0,'Limits',value\)/);
  assert.match(result,/check\(name,value\)/);
  assert.match(result,/check\('Unknown',value\)/);
  assert.equal(specializer.transform("import * as p from './platform/protocol.js'; p.validate('Limits',value);",id),null);
  assert.equal(specializer.transform("import {validate} from './platform/protocol.js';validate('Limits',value,sideEffect());",id),null);
});

test('shadowed aliases are conservatively left untouched; foreign modules and strings are never rewritten',()=>{
  const id=resolve(root,'src/audit-fixture.js');
  for(const shadow of ["function f(validate){validate('Limits',value);}",
    "function f(){const {validate}=other;validate('Limits',value);}",
    "try{}catch(validate){validate('Limits',value);}",
    "function f(){class validate{};}"])
    assert.equal(specializer.transform("import {validate} from './platform/protocol.js';"+shadow,id),null);
  assert.equal(specializer.transform("import {validate} from './other.js';validate('Limits',value);",id),null);
  assert.equal(specializer.transform("const script=\"validate('Limits',value)\";",id),null);
});

async function bundleEntry(source,{specialize=false}={}) {
  const protocolId=resolve(root,'src/platform/protocol.js'),schemaId=resolve(root,'src/platform/schema.js');
  const entry=resolve(root,'src/audit-fixture.js');
  const protocol=await readFile(protocolId,'utf8');
  const fullSchema=await readFile(schemaId,'utf8');
  const files=new Map([[entry,source],[protocolId,protocol],[schemaId,
    specializer.schemaModuleSource(fullSchema,{background:specialize})]]);
  const bundle=await rollup({input:entry,plugins:[{
    name:'actual-protocol-memory-test',
    resolveId(id,importer){const path=importer?resolve(dirname(importer),id):id;return files.has(path)?path:null;},
    load:id=>files.get(id),
    transform(code,id){return specialize&&id!==schemaId?specializer.transform(code,id):null;}
  }]});
  try{return (await bundle.generate({format:'iife'})).output[0].code;}
  finally{await bundle.close();}
}

test('real Rollup drops the complete schema and its decoder for protocol-only consumers',async()=>{
  const code=await bundleEntry("import {PROTOCOL} from './platform/protocol.js'; globalThis.result=PROTOCOL;");
  assert.doesNotMatch(code,/unpackSchema|Invalid packaged schema|\$defs/);
  const context={};vm.runInNewContext(code,context);
  assert.equal(context.result,'opendesk.foundation.v1');
  assert(code.length<1024);
});

test('real Rollup retains only selected rules and unchanged validation for fixed calls',async()=>{
  const code=await bundleEntry("import {validate} from './platform/protocol.js'; globalThis.result=validate('Limits',globalThis.value);",{specialize:true});
  assert.doesNotMatch(code,/unpackFixedSchema|SourcePreviewResult|TargetCreationIntent/);
  const value={maxPages:1,maxRecords:1,maxDurationMs:1,maxStoredBytes:1};
  const context=vm.createContext({});
  vm.runInContext('globalThis.value='+JSON.stringify(value),context);
  vm.runInContext(code,context);
  assert.equal(context.result,context.value);
  vm.runInContext('globalThis.value.maxPages=51',context);
  assert.throws(()=>vm.runInContext(code,context),error=>error.code==='E_SCHEMA');
});

test('runtime-selected names still use the full validator and reject unknown roots',async()=>{
  const code=await bundleEntry("import {validate} from './platform/protocol.js';globalThis.result=validate(globalThis.ruleName,globalThis.value);",{specialize:true});
  assert.match(code,/unpackFixedSchema/);
  const context=vm.createContext({atob,TextDecoder});
  vm.runInContext('globalThis.ruleName="Limits";globalThis.value={maxPages:1,maxRecords:1,maxDurationMs:1,maxStoredBytes:1}',context);
  vm.runInContext(code,context);
  context.ruleName='Unknown';
  assert.throws(()=>vm.runInContext(code,context),error=>error.code==='E_SCHEMA');
});

test('service forwarding preserves arguments, receiver, late lookup and Promise/error identity',()=>{
  const payload={},sender={},promise=Promise.resolve(42),failure=new Error('unchanged');
  const service={run(p,s){assert.equal(this,service);assert.equal(p,payload);assert.equal(s,sender);return promise;}};
  const routes=createMethodRoutes(service,['run']);
  assert.deepEqual(Object.keys(routes),['run']);
  assert.equal(Object.hasOwn(routes,'constructor'),false);
  assert.equal(routes.run(payload,sender),promise);
  service.run=function(){assert.equal(this,service);throw failure;};
  assert.throws(()=>routes.run(payload,sender),error=>error===failure);
});

test('a changed schema cannot silently reuse stale build-selected rules',async()=>{
  const original=await readFile(resolve(root,'src/platform/schema.js'),'utf8');
  assert.throws(()=>specializer.schemaModuleSource(original.replace('maxPages','changedPages')),
    /Schema changed/);
});
