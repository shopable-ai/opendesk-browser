import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PAGE_BROWSER_COMPILER,PAGE_BROWSER_UI_HELPER,PAGE_BROWSER_COMPILER_RESOURCE_LIMIT}
  from '../../src/libs/page-frameworks/contract.js';
const sha=data=>createHash('sha256').update(data).digest('hex');
test('R24.3 signed offline browser JSX compiler and Page UI helper are immutably pinned',async()=>{
  for(const row of [PAGE_BROWSER_COMPILER,PAGE_BROWSER_UI_HELPER]){
    const bytes=await readFile(row.source);
    assert.equal(bytes.length,row.bytes);
    assert.ok(bytes.length<PAGE_BROWSER_COMPILER_RESOURCE_LIMIT);
    assert.equal(sha(bytes),row.sha256);
  }
  const legal=await readFile(PAGE_BROWSER_COMPILER.licenseSource);
  assert.equal(sha(legal),PAGE_BROWSER_COMPILER.licenseSha256);
  assert.ok(legal.toString('utf8').includes('Permission is hereby granted'));
  const lock=JSON.parse(await readFile(PAGE_BROWSER_COMPILER.supplyLock,'utf8'));
  const pkg=lock.packages['node_modules/@babel/standalone'];
  assert.equal(pkg.version,PAGE_BROWSER_COMPILER.version);
  assert.equal(pkg.license,'MIT');
  assert.match(pkg.integrity,/^sha512-/);
});
