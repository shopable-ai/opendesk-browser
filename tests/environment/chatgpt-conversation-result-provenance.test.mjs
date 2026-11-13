import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {FIXED_OUTPUTS} from '../../scripts/build-contract.mjs';

// Reviewed WebFlow formatter delegates strict result validation to the exact shared Task contract.
const source='projects/webflow/src/chatgpt-conversation-result.js';
const pin='edbf68264b5aaa17d0c2f323baf88f4d99a79b71';
const allowed=['sw.js','ui/tool-shell.js'];
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const describe=(root,paths,target)=>describeBundle({root,lock:{packages:{}},chunk:{
  fileName:target,modules:Object.fromEntries(paths.map(path=>[
    resolve(root,path),{originalLength:100,renderedLength:80}]))
}});
function fixture(t){
  const root=realpathSync(mkdtempSync(resolve(tmpdir(),'od-chatgpt-result-provenance-')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const bytes=readFileSync(new URL('../../'+source,import.meta.url));
  assert.equal(blob(bytes),pin,'Changed source requires review and an explicit new pin');
  const file=resolve(root,source);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);
  return root;
}

test('conversation result: exact reviewed blob enters only SW and tool shell',t=>{
  const root=fixture(t);
  for(const target of new Set([...allowed,...Object.values(FIXED_OUTPUTS),'unregistered/custom.js'])){
    if(allowed.includes(target)){
      // Keep the shell's independent AI Proxy source verification active.
      const row=describe(process.cwd(),[source],target).modules[0];
      assert.equal(row.path,source);assert.equal(row.reviewedFirstPartyBlob,pin);
    }else assert.throws(()=>describe(root,[source],target),/Historical\/user\/vendor code cannot enter/);
  }
});

test('conversation result: one-byte drift fails closed in both consumers',t=>{
  const root=fixture(t),file=resolve(root,source);
  writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from(' ')]));
  for(const target of allowed)assert.throws(()=>describe(root,[source],target),/Trusted ChatGPT files source changed/);
});

test('conversation result: file and ancestor symlinks are rejected',t=>{
  const root=fixture(t),linked=fixture(t),file=resolve(linked,source);
  rmSync(file);symlinkSync(resolve(root,source),file);
  for(const target of allowed)assert.throws(()=>describe(linked,[source],target),/must not be a symlink/);
  const directory=dirname(file);rmSync(directory,{recursive:true});
  symlinkSync(dirname(resolve(root,source)),directory);
  for(const target of allowed)assert.throws(()=>describe(linked,[source],target),/must not be a symlink/);
});

test('conversation result: adjacent and same-name project paths gain no admission',t=>{
  const root=fixture(t),paths=[source+'.backup','projects/webflow/src/unreviewed.js',
    'projects/webflow/trusted/chatgpt-conversation-result.js',
    'projects/other/src/chatgpt-conversation-result.js'];
  for(const path of paths)for(const target of allowed)
    assert.throws(()=>describe(root,[path],target),/Historical\/user\/vendor code cannot enter/);
});

test('conversation result: an admitted module cannot admit an unreviewed chunk dependency',t=>{
  const root=fixture(t);
  for(const target of allowed)assert.throws(()=>describe(root,
    [source,'projects/webflow/src/unreviewed.js'],target),/Historical\/user\/vendor code cannot enter/);
});
