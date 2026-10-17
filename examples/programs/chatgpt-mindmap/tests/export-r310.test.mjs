import test from 'node:test';
import assert from 'node:assert/strict';
import {Blob} from 'node:buffer';
import {buildOutlineMarkdown,exportFileBase,verifyXmindZip,MAX_XMIND_BYTES}
  from '../src/export.js';

test('outline stays within its reply and preserves headings and notes',()=>{
  const md=buildOutlineMarkdown({title:'本条回复',children:[
    {title:'一级 *主题*',content:'第1行\n第2行 <tag>',children:[
      {title:'子节点',content:'说明',children:[]}]},
    {title:'第二主题',children:[]}
  ]});
  assert.ok(md.startsWith('# 本条回复'));
  assert.ok(md.includes('一级 \\*主题\\*'));
  assert.ok(md.includes('  - 子节点'));
  assert.ok(md.includes('  > 第1行'));
  assert.ok(md.includes('  > 第2行 \\<tag\\>'));
  assert.ok(!md.includes('其他回复'));
});

test('download filename filters path separators and reserved names',()=>{
  assert.equal(exportFileBase('../危险/名称:<>?*'),'危险 名称');
  assert.equal(exportFileBase('CON'),'本条回复-思维导图');
  assert.equal(exportFileBase(''),'本条回复-思维导图');
  assert.equal(exportFileBase('中文 A'),'中文 A');
});

test('XMind Blob needs ZIP header and bounded nonzero size',async()=>{
  await verifyXmindZip(new Blob([new Uint8Array([80,75,3,4,0,1])]));
  await assert.rejects(verifyXmindZip(new Blob(['not zip'])),/E_XMIND_EXPORT_NOT_ZIP/);
  await assert.rejects(verifyXmindZip(new Blob([])),/E_XMIND_EXPORT_SIZE/);
  assert.equal(MAX_XMIND_BYTES,25*1024*1024);
});


test('PNG preflight rejects empty, forged signatures and oversized pixel dimensions',async()=>{
  const {verifyPngBlob}=await import('../src/export.js');
  await assert.rejects(verifyPngBlob(new Blob([])),{code:'E_XMIND_PNG_SIZE'});
  const raw=new Uint8Array(512);
  const dv=new DataView(raw.buffer);
  dv.setUint32(16,128);dv.setUint32(20,128);
  await assert.rejects(verifyPngBlob(new Blob([raw])),{code:'E_XMIND_PNG_INVALID'});
  raw.set([137,80,78,71,13,10,26,10]);
  raw.set([73,72,68,82],12);
  dv.setUint32(16,10000);dv.setUint32(20,10000);
  await assert.rejects(verifyPngBlob(new Blob([raw])),{code:'E_XMIND_PNG_INVALID'});
});
