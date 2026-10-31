import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig} from '../../src/framework/sdk/registry.js';

test('UA requires the explicit isolated transport; Fetch header overrides remain rejected',()=>{
  assert.deepEqual(normalizeConfig({transport:'isolated-http',userAgent:'ScrapyJS-UA-A/1.0'}),
    {transport:'isolated-http',userAgent:'ScrapyJS-UA-A/1.0'});
  for(const config of [{userAgent:'UA'},{transport:'fetch',userAgent:'UA'},
    {transport:'isolated-http',userAgent:'UA\r\nInjected: true'},
    {headers:{'User-Agent':'UA'}},{headers:{Cookie:'secret'}}])
    assert.throws(()=>normalizeConfig(config),{code:'E_CONFIG_UNSUPPORTED'});
});
