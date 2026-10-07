import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {discoverWorkerStartupPoint} from './b05-native-recovery-gate.mjs';
test('startup cut precedes all product effects in both unchanged packages',async()=>{
  for(const mode of ['production','development']){
    const source=await readFile(`dist/${mode}/sw.js`,'utf8'),point=discoverWorkerStartupPoint(source);
    assert.match(point.text,/^const \w+="opendesk.environment.v1";$/);
    assert.equal(point.location.lineNumber,0);
    assert(!point.effectFreePrefix.includes('chrome.'));
    assert(point.endLocation.columnNumber<100);
  }
});
test('startup observer refuses an effectful statement before the first constant',()=>{
  assert.throws(()=>discoverWorkerStartupPoint('var sw=function(){"use strict";effect();const e="opendesk.environment.v1";}();'));
});
