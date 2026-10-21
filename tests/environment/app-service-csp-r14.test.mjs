import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectScript,CONTROL_WORKER} from '../../scripts/verify-package.mjs';
const capture='const Body=Object.getPrototypeOf(async function(){}).constructor;';
const controller='new Body("page","params","axiosx","AppStorage","AppLocal","storage",data.body);';
const app='new Body("browser",data.body);';
test('only the opaque Worker has the two exact admitted script profiles',()=>{
  assert.deepEqual(inspectScript(capture+controller+app,CONTROL_WORKER),{approvedAsyncBodyConstructors:2});
  for(const source of [capture+controller,capture+app,capture+controller+app+app,
    capture+controller+'new Body("chrome",data.body);',capture+controller+'new Body("browser",data.source);',
    capture+controller+'Body("browser",data.body);'])
    assert.throws(()=>inspectScript(source,CONTROL_WORKER));
  for(const file of ['sw.js','cloud-control/runner.js','sidepanel.js'])
    assert.throws(()=>inspectScript(capture+controller+app,file));
  for(const code of ['eval(data.body)','new Function(data.body)','importScripts(data.url)','import(data.url)'])
    assert.throws(()=>inspectScript(capture+controller+app+code,CONTROL_WORKER));
});
