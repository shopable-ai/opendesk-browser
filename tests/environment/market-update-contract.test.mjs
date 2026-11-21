import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {UPDATE_INDEX_PATH,UPDATE_INDEX_SCHEMA,SIGNED_UPDATE_INDEX_SCHEMA,
  validateUpdateIndex,updateIndexSigningBytes} from '../../src/marketplace/update-index.js';

const spec=JSON.parse(await readFile(new URL('../../docs/api/opendesk-market-update-v1.openapi.json',import.meta.url),'utf8'));

test('one public channel index and the Payload root mount describe the same route',()=>{
  const key='/api/market/v1/channels/{channel}/index';
  assert.equal(key.replace('{channel}','stable'),UPDATE_INDEX_PATH);
  assert.deepEqual(Object.keys(spec.paths).filter(path=>path.startsWith('/api/')),[key]);
  assert.deepEqual(spec.components.parameters.Channel.schema.enum,['stable']);
  assert.equal(spec.servers[0].url,'/');
  assert.equal(spec['x-http-mount'].payloadRoutesApi+
    spec['x-http-mount'].payloadRootEndpointPath.replace(':channel','stable'),UPDATE_INDEX_PATH);
  for(const status of ['200','304','404','429','503'])assert.ok(spec.paths[key].get.responses[status]);
  let references=0;
  function visit(value){
    if(!value||typeof value!=='object')return;
    if(value.$ref){
      assert.ok(value.$ref.startsWith('#/'));
      let target=spec;
      for(const part of value.$ref.slice(2).split('/'))target=target?.[part.replaceAll('~1','/').replaceAll('~0','~')];
      assert.notEqual(target,undefined,value.$ref);references++;
    }
    for(const child of Object.values(value))visit(child);
  }
  visit(spec);assert.ok(references>30);
});

test('the documented index example is accepted without widening the six-field descriptor',()=>{
  const schemas=spec.components.schemas;
  assert.equal(schemas.UpdateIndex.properties.schema.const,UPDATE_INDEX_SCHEMA);
  assert.equal(schemas.SignedUpdateIndex.properties.schema.const,SIGNED_UPDATE_INDEX_SCHEMA);
  assert.deepEqual(schemas.ReleaseDescriptor.required,
    ['schema','marketId','version','bytes','sha256','packagePath']);
  assert.equal(schemas.ReleaseDescriptor.additionalProperties,false);
  for(const sample of schemas.UpdateIndex.examples){
    assert.deepEqual(validateUpdateIndex(sample,{now:Date.parse(sample.issuedAt)}),sample);
    const changed=structuredClone(sample);changed.releases[0].descriptor.sourceId='opendesk-official';
    assert.throws(()=>validateUpdateIndex(changed,{now:Date.parse(sample.issuedAt)}));
  }
});

test('signature bytes preserve the envelope schema and original payload whitespace',()=>{
  const payload=' { "schema" : "opaque illustrative bytes" }\n';
  const envelope={schema:SIGNED_UPDATE_INDEX_SCHEMA,algorithm:'Ed25519',keyId:'test-key',
    payload:Buffer.from(payload,'utf8').toString('base64'),signature:Buffer.alloc(64).toString('base64')};
  const bytes=updateIndexSigningBytes(envelope);
  assert.deepEqual(bytes,new Uint8Array(Buffer.concat([
    Buffer.from(SIGNED_UPDATE_INDEX_SCHEMA+'\nEd25519\ntest-key\n'),Buffer.from(payload)])));
  assert.notDeepEqual(bytes,updateIndexSigningBytes({...envelope,
    payload:Buffer.from(JSON.stringify(JSON.parse(payload))).toString('base64')}));
});
