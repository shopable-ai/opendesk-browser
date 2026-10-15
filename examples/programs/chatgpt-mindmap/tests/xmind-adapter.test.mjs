import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {requireXmindRuntime} from '../src/xmind-adapter.js';
import {mindTreeToXmindBlob,getXmindStyleData} from '../src/xmind-convert.js';

test('missing runtime fails closed without falling back to another engine',()=>{
  assert.throws(()=>requireXmindRuntime({}),{code:'E_XMIND_RUNTIME_UNAVAILABLE'});
});
test('original XMind skin is copied afresh for each workbook',()=>{
  const a=getXmindStyleData('dark'),b=getXmindStyleData('light');
  assert.equal(a.theme.map.properties['svg:fill'],'#282828');
  assert.equal(b.theme.map.properties['svg:fill'],'#ffffff');
  a.theme.map.properties['svg:fill']='mutated';
  assert.equal(getXmindStyleData('dark').theme.map.properties['svg:fill'],'#282828');
});

// Optional real upstream byte test. No fake SDK. Missing audit inputs are SKIP,
// never reported as XMind PASS; rendering belongs to the Chromium probe.
const directory=process.env.XMIND_REFERENCE_DIR;
let sdk;
async function actualSDK(){
  if(sdk)return sdk;
  const manifest=JSON.parse(await readFile(new URL('./xmind-provenance.json',import.meta.url),'utf8'));
  const context=vm.createContext({Blob,Uint8Array,ArrayBuffer,setTimeout,clearTimeout,
    console,TextEncoder,TextDecoder},{codeGeneration:{strings:false,wasm:false}});
  vm.runInContext('globalThis.window=globalThis;globalThis.self=globalThis;',context);
  for(const row of manifest.assets.filter(r=>['jszip.min.js','xmind-sdk.bundle.js'].includes(r.name))){
    const bytes=await readFile(join(directory,row.name));
    assert.equal(bytes.length,row.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
    vm.runInContext(bytes.toString('utf8'),context,{filename:row.name,timeout:10000});
  }
  sdk=context;return sdk;
}
const node=(title,children=[],content='')=>({id:'id',title,depth:0,content,children});
async function workbook(tree,options={defaultFolded:false}){
  const api=await actualSDK();
  const blob=await mindTreeToXmindBlob(api,tree,'light',options);
  const zip=await new api.JSZip().loadAsync(new Uint8Array(await blob.arrayBuffer()));
  return JSON.parse(await zip.file('content.json').async('string'))[0];
}
test('REAL SDK: Workbook/Topic/Dumper/JSZip keep duplicate titles and exact visible notes',
  {skip:!directory&&'XMIND_REFERENCE_DIR missing; real SDK NOT_TESTED'},async()=>{
    const out=await workbook(node('Root',[node('Same',[],'A'),node('Same',[],'B')],'Opening paragraph'));
    assert.equal(out.rootTopic.notes.plain.content,'Opening paragraph');
    const [a,b]=out.rootTopic.children.attached;
    assert.notEqual(a.id,b.id);
    assert.equal(a.title,'Same');assert.equal(b.title,'Same');
    assert.equal(a.notes.plain.content,'A');
    assert.equal(b.notes.plain.content,'B');
    assert.doesNotMatch(JSON.stringify(out),/\\[nodeKey:/);
  });
test('REAL SDK: branch state follows paths instead of duplicate visible titles',
  {skip:!directory&&'XMIND_REFERENCE_DIR missing; real SDK NOT_TESTED'},async()=>{
    const out=await workbook(node('Root',[node('Same',[node('child')]),node('Same',[node('child')])]),
      {defaultFolded:false,statesByNodeKey:new Map([['0','folded']])});
    assert.equal(out.rootTopic.children.attached[0].branch,'folded');
    assert.equal(out.rootTopic.children.attached[1].branch,undefined);
  });
test('REAL SDK: HTML visible text is not reinterpreted as Markdown or task status',
  {skip:!directory&&'XMIND_REFERENCE_DIR missing; real SDK NOT_TESTED'},async()=>{
    const out=await workbook(node('# literal',[node('[x] **literal**',[],'- code\n# code')]));
    assert.equal(out.rootTopic.title,'# literal');
    assert.equal(out.rootTopic.children.attached[0].title,'[x] **literal**');
    assert.match(out.rootTopic.children.attached[0].notes.plain.content,/^- code\n# code/);
  });
