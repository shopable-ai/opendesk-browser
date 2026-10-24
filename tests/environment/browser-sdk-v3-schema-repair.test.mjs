import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {operationSchemas,validateDirectBrowserValue}
  from '../../src/framework/sdk/browser-schemas.js';

const policyOperation='browser.siteBudget.setPolicy';
const cookieOperation='browser.cookies.set';
const commit=()=>{
  // The model is opaque app data, as in managed-site-v3-rules-r17.test.mjs.
  const sealedModel={version:1,sites:[{host:'example.com',minutes:30}],groups:{}};
  return {expectedRev:0,desiredPolicy:{kind:'site-budget.v3',enabled:true,
    sites:[{host:'example.com',subdomains:true,enabled:true,pool:'s:example.com',
      conditions:[{type:'counter-limit',limitMs:1800000}]}],whitelist:[]},
    modelRef:createHash('sha256').update(JSON.stringify(sealedModel)).digest('hex'),sealedModel};
};
const cookie=()=>({url:'https://example.com/',name:'session',value:'test-value'});

test('repaired real module preserves V2/V3 policy schemas and strict Cookie schemas',()=>{
  const input=operationSchemas(policyOperation).input;
  assert.equal(input.anyOf.length,2);
  const v3=input.anyOf.find(schema=>schema.properties?.desiredPolicy?.properties?.kind?.const==='site-budget.v3');
  assert.ok(v3,'setPolicy discovery must retain the intended V3 input');
  assert.equal(v3.additionalProperties,false);
  assert.deepEqual(v3.required,['expectedRev','desiredPolicy','modelRef','sealedModel']);
  assert.deepEqual(v3.properties.modelRef,{type:'string',maxLength:64,pattern:'^[a-f0-9]{64}$'});
  assert.equal(validateDirectBrowserValue(commit().modelRef,v3.properties.modelRef),commit().modelRef);
  for(const value of ['a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'g'.repeat(64)])
    assert.throws(()=>validateDirectBrowserValue(value,v3.properties.modelRef),{code:'E_SCHEMA'});
  assert.equal(v3.properties.sealedModel.type,'object');
  assert.equal(v3.properties.sealedModel.additionalProperties,true);
  assert.equal(v3.properties.sealedModel.maxProperties,160);
  const v2=input.anyOf.find(schema=>schema.properties?.dailyMinutes);
  assert.ok(v2,'setPolicy discovery must also preserve V2 input');
  assert.equal(v2.additionalProperties,false);
  for(const operation of ['browser.siteBudget.getStatus',policyOperation]){
    const output=operationSchemas(operation).output;
    assert.deepEqual(output.anyOf.map(schema=>schema.properties.kind.const).sort(),
      ['site-budget.v2','site-budget.v3'],operation);
    assert.ok(output.anyOf.every(schema=>schema.type==='object'&&schema.additionalProperties===false));
  }
  const cookieSchema=operationSchemas(cookieOperation);
  assert.equal(cookieSchema.input.type,'object');
  assert.equal(cookieSchema.input.additionalProperties,false);
  assert.equal(cookieSchema.output.type,'object');
});

// V3 is dispatched by the audited custom normalizer, not the DIRECT-only
// validator (which deliberately rejects opaque additionalProperties objects).
test('V3 setPolicy accepts a real commit with a 64-character lowercase hex modelRef',()=>{
  const input=commit();
  assert.match(input.modelRef,/^[a-f0-9]{64}$/);
  const before=structuredClone(input);
  assert.deepEqual(normalizeBrowserOperation(policyOperation,input),before);
  assert.deepEqual(input,before);
});

for(const [label,modelRef] of [
  ['63 characters','a'.repeat(63)],['65 characters','a'.repeat(65)],
  ['uppercase hex','A'.repeat(64)],['nonhex','a'.repeat(63)+'g'],
  ['non-string',64]
])test(`V3 setPolicy rejects modelRef with ${label}`,()=>{
  assert.throws(()=>normalizeBrowserOperation(policyOperation,{...commit(),modelRef}),
    {code:'E_SITE_BUDGET_V3_POLICY'});
});

test('V3 setPolicy rejects every missing required root field and extra root fields',()=>{
  for(const field of ['expectedRev','desiredPolicy','modelRef','sealedModel']){
    const input=commit();
    delete input[field];
    // Missing desiredPolicy enters the legacy branch; its error code differs.
    assert.throws(()=>normalizeBrowserOperation(policyOperation,input),
      {code:field==='expectedRev'?'E_SCHEMA':
        field==='desiredPolicy'?'E_TOOL_POLICY':'E_SITE_BUDGET_V3_POLICY'},field);
  }
  assert.throws(()=>normalizeBrowserOperation(policyOperation,{...commit(),extra:true}),
    {code:'E_SITE_BUDGET_V3_POLICY'});
});

test('V3 sealedModel remains flexible opaque JSON rather than a fixed app schema',()=>{
  for(const sealedModel of [{},commit().sealedModel,
    {version:2,settings:{enabled:true,label:'Focus',selection:null},history:[0,'saved',false]}]){
    const input={...commit(),sealedModel,
      modelRef:createHash('sha256').update(JSON.stringify(sealedModel)).digest('hex')};
    const result=normalizeBrowserOperation(policyOperation,input);
    assert.deepEqual(result.sealedModel,sealedModel);
    assert.notEqual(result.sealedModel,sealedModel);
  }
  for(const sealedModel of [null,[], 'model'])
    assert.throws(()=>normalizeBrowserOperation(policyOperation,{...commit(),sealedModel}),
      {code:'E_SITE_BUDGET_V3_POLICY'});
});

test('Cookie set retains valid minimal and partitioned request schemas and normalization',()=>{
  const schema=operationSchemas(cookieOperation).input;
  const partitioned={...cookie(),domain:'example.com',path:'/',secure:true,httpOnly:true,
    sameSite:'lax',expirationDate:2000000000,storeId:'0',ifAbsent:true,
    partitionKey:{topLevelSite:'https://example.com',hasCrossSiteAncestor:false}};
  for(const input of [cookie(),{...cookie(),value:''},partitioned]){
    assert.equal(validateDirectBrowserValue(input,schema),input);
    assert.deepEqual(normalizeBrowserOperation(cookieOperation,input),input);
  }
});

test('Cookie set still rejects missing, extra, mistyped and malformed partition fields',()=>{
  const schema=operationSchemas(cookieOperation).input;
  const invalid=[{...cookie(),extra:true},{...cookie(),value:3},
    {...cookie(),secure:'true'},{...cookie(),httpOnly:1},
    {...cookie(),partitionKey:{}},
    {...cookie(),partitionKey:{topLevelSite:'https://example.com',extra:true}},
    {...cookie(),partitionKey:{topLevelSite:'https://example.com',hasCrossSiteAncestor:'false'}}];
  for(const field of ['url','name','value']){
    const input=cookie();delete input[field];invalid.push(input);
  }
  for(const input of invalid){
    assert.throws(()=>validateDirectBrowserValue(input,schema),{code:'E_SCHEMA'});
    assert.throws(()=>normalizeBrowserOperation(cookieOperation,input),{code:'E_SCHEMA'});
  }
  // Semantic checks belong to the custom normalizer, beyond schema types.
  for(const input of [{...cookie(),name:'bad name'},
    {...cookie(),sameSite:'invalid'},{...cookie(),ifAbsent:true}])
    assert.throws(()=>normalizeBrowserOperation(cookieOperation,input),{code:'E_SCHEMA'});
});
