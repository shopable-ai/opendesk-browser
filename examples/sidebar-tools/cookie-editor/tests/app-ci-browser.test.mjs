import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {prepareCookieEditorBrowser} from './prepare-browser.mjs';

test('browser preparation uses the locked preview project and verifies the rebuilt source',()=>{
  const calls=[];
  prepareCookieEditorBrowser({run:(...args)=>calls.push(args)});
  assert.deepEqual(calls.map(([command,args])=>[command,...args]),[
    ['npm','ci','--ignore-scripts','--no-audit','--no-fund'],
    ['npm','run','build'],
    ['npm','run','check']
  ]);
  for(const [,,options] of calls)
    assert.equal(options.cwd,fileURLToPath(new URL('../preview/react/',import.meta.url)));
});

test('failed install, build or source check blocks preparation without continuing',()=>{
  for(let failedAt=0;failedAt<3;failedAt++){
    let calls=0;
    const failure=new Error('PREPARATION_FAILED_'+failedAt);
    assert.throws(()=>prepareCookieEditorBrowser({run:()=>{
      if(calls++===failedAt)throw failure;
    }}),error=>error===failure);
    assert.equal(calls,failedAt+1);
  }
});
