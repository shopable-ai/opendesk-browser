import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {parse} from 'acorn';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {FIXED_OUTPUTS} from '../../scripts/build-contract.mjs';

// Independently reviewed cdfe6e3d6 bytes plus the uninstall-race repair: the flow uses
// trusted Foundation storage and preserves the legacy encrypted record.
// Git fixtures verify exact approval without rewriting another owner's service.
// No source is executed, transformed, built or installed by these tests.
const prefix='examples/sidebar-tools/cookie-editor/';
const pins={
  'trusted/account-contract.js':'1d17f897014a4c4e2876018994a6daaea255c835',
  'trusted/account-service.js':'796f1cd801cd011d77c236ba2e55ad2fe75df366',
  'trusted/account-vault.js':'bf9cd090b7ba805de70bfdea271b8143fb18ed50',
  'app/domain/account-switch-url.js':'3e5bb3fb3bf6d1d8e74d4a2b1841107d1166d2bd'
};
const contract='trusted/account-contract.js';
const contractTargets=[
  'sw.js','ui/tool-shell.js','ui/stay-focus-controls.js','ui/sidebar-tool-host.js',
  'ui/marketplace.js','marketplace/market-host.js','knowledge/knowledge-host.js',
  'platform/context-menus.js','sidebar-tools/preinstall-intent.js'
];
const targets=[...new Set(['sw.js',...Object.values(FIXED_OUTPUTS),
  'unregistered/custom.js','cookie-editor.js'])];
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const describe=(root,path,target)=>describeBundle({root,lock:{packages:{}},chunk:{
  fileName:target,modules:{[resolve(root,path)]:{originalLength:100,renderedLength:80}}
}});
function fixture(t){
  const root=realpathSync(mkdtempSync(resolve(tmpdir(),'od-cookie-provenance-r134-')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const [name,pin] of Object.entries(pins)){
    const file=resolve(root,prefix+name);
    const bytes=execFileSync('git',['cat-file','blob',pin]);
    assert.equal(blob(bytes),pin);
    mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes);
  }
  return root;
}

test('R134: each reviewed Cookie blob enters only its actual fixed static targets',t=>{
  const root=fixture(t);
  for(const [name,pin] of Object.entries(pins))for(const target of targets){
    const allowed=name===contract?contractTargets.includes(target):target==='sw.js';
    if(allowed){
      const row=describe(root,prefix+name,target).modules[0];
      assert.equal(row.path,prefix+name);
      assert.equal(row.reviewedFirstPartyBlob,pin);
    }else assert.throws(()=>describe(root,prefix+name,target),
      /Historical\/user\/vendor code cannot enter/,`${name} must not enter ${target}`);
  }
});

test('R134: every approved source-target pair fails closed on byte drift',t=>{
  const root=fixture(t);
  for(const name of Object.keys(pins)){
    const file=resolve(root,prefix+name);
    writeFileSync(file,Buffer.concat([readFileSync(file),Buffer.from('\n// unreviewed drift\n')]));
    for(const target of name===contract?contractTargets:['sw.js'])
      assert.throws(()=>describe(root,prefix+name,target),/Trusted Cookie account source changed/);
  }
});

test('R134: file and ancestor-directory symlinks cannot substitute reviewed bytes',t=>{
  const root=fixture(t),linked=fixture(t);
  for(const name of Object.keys(pins)){
    const file=resolve(linked,prefix+name);rmSync(file);symlinkSync(resolve(root,prefix+name),file);
    for(const target of name===contract?contractTargets:['sw.js'])
      assert.throws(()=>describe(linked,prefix+name,target),/must not be a symlink/);
  }
  const dir=resolve(linked,prefix,'trusted');rmSync(dir,{recursive:true});
  symlinkSync(resolve(root,prefix,'trusted'),dir);
  assert.throws(()=>describe(linked,prefix+contract,'sw.js'),/must not be a symlink/);
});

test('R134: same-ID packages, arbitrary trusted files, tool UI and vendor/history stay rejected',t=>{
  const root=fixture(t);
  const paths=[
    prefix+'cookie-editor.opendesk-tool.json',prefix+'trusted/unreviewed.js',
    prefix+'trusted/account-service.js.backup',prefix+'src/main.js',
    prefix+'app/main.jsx',prefix+'app/domain/unreviewed.js',
    'examples/sidebar-tools/user-cookie-editor/trusted/account-contract.js',
    'examples/programs/cookie-editor/account-service.js',
    'src/vendor/account-service.js','docs/contracts/source-snapshots/account-service.js'
  ];
  for(const path of paths){
    // Identical bytes at a different path do not inherit first-party admission.
    mkdirSync(dirname(resolve(root,path)),{recursive:true});
    writeFileSync(resolve(root,path),readFileSync(resolve(root,prefix+contract)));
    for(const target of targets)
      assert.throws(()=>describe(root,path,target),/Historical\/user\/vendor code cannot enter/);
  }
});

test('R134: audited Cookie closure uses only static imports and a pure shared contract',t=>{
  const root=fixture(t);
  const deps=name=>{
    const ast=parse(readFileSync(resolve(root,prefix+name),'utf8'),{ecmaVersion:'latest',sourceType:'module'});
    const dynamic=[];
    const walk=node=>{
      if(!node||typeof node!=='object')return;
      if(node.type==='ImportExpression')dynamic.push(node);
      for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);
      else if(value&&typeof value==='object')walk(value);
    };
    walk(ast);assert.equal(dynamic.length,0,name+' must not import dynamic code');
    return ast.body.filter(row=>row.source).map(row=>row.source.value);
  };
  assert.deepEqual(deps(contract),[]);
  assert.deepEqual(deps('app/domain/account-switch-url.js'),[]);
  assert.deepEqual([...new Set(deps('trusted/account-vault.js'))],['./account-contract.js']);
  assert.deepEqual(deps('trusted/account-service.js').filter(path=>!path.startsWith('../../../../src/')),
    ['../app/domain/account-switch-url.js','./account-vault.js','./account-contract.js','./account-contract.js']);
});

test('R134: the pre-fence service is rejected, and working-tree drift never inherits approval',t=>{
  const root=fixture(t),name='trusted/account-service.js';
  for(const oldPin of ['c2fc72b60d661a09718303da9048eff3324ee6ef',
    '6227027e10e5dc0c7934d3d9ba7171dde6f37cd5','5aab9035b98ce29e3fadc7ac466836b5a72be70c']){
    const old=execFileSync('git',['cat-file','blob',oldPin]);
    assert.notEqual(blob(old),pins[name]);writeFileSync(resolve(root,prefix+name),old);
    assert.throws(()=>describe(root,prefix+name,'sw.js'),/Trusted Cookie account source changed/);
  }
  for(const [name,pin] of Object.entries(pins)){
    const target=name===contract?'ui/sidebar-tool-host.js':'sw.js';
    if(blob(readFileSync(resolve(prefix+name)))===pin)
      assert.equal(describe(process.cwd(),prefix+name,target).modules[0].reviewedFirstPartyBlob,pin);
    else assert.throws(()=>describe(process.cwd(),prefix+name,target),/Trusted Cookie account source changed/);
  }
});
