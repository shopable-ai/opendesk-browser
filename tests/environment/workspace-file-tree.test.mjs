import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkspaceTreeListing,parentDirectoriesForFile,MAX_WORKSPACE_TREE_ENTRIES} from '../../src/native-agent/workspace-file-tree.js';

const WS='workspace-00000000-0000-4000-8000-000000000001';
const dir=(name,path=name)=>({name,path,kind:'directory'});
const file=(name,path=name)=>({name,path,kind:'file'});
const list=(path,entries,truncated=false)=>({workspaceId:WS,path,entries,truncated});

test('tree listing is directory-first and numeric, without mutating Native rows',()=>{
  const data=list('',[file('z10.md'),dir('dir10'),file('a.md'),dir('dir2'),file('z2.md')]);
  const result=validateWorkspaceTreeListing(data,WS,'');
  assert.deepEqual(result.entries.map(row=>row.name),['dir2','dir10','a.md','z2.md','z10.md']);
  assert.equal(data.entries[0].name,'z10.md');
  assert.deepEqual(parentDirectoriesForFile('src/app/page.tsx'),['','src','src/app']);
});

test('tree rejects stale identity, path confusion, duplicates, hidden/binary paths and oversize lists',()=>{
  const malicious=[
    {...list('',[file('readme.md')]),workspaceId:'old'},
    {...list('',[]),path:'src'},
    {...list('',[]),truncated:'false'},
    list('',[dir('src','outside/src')]),
    list('src',[file('index.ts','index.ts')]),
    list('',[file('README.md'),file('README.md')]),
    list('',[dir('..')]),list('',[dir('.git')]),list('',[dir('node_modules')]),
    list('',[file('a.png')]),list('',[file('x.md/evil')]),
    list('',Array.from({length:MAX_WORKSPACE_TREE_ENTRIES+1},(_,i)=>file(i+'.md')))
  ];
  for(const row of malicious)assert.throws(
    ()=>validateWorkspaceTreeListing(row,WS,row.path==='src'?'':row.path),{code:'E_FILES_PROTOCOL'});
  assert.throws(()=>parentDirectoriesForFile('../outside.md'));
});

test('valid empty or truncated lists preserve Native flags',()=>{
  assert.deepEqual(validateWorkspaceTreeListing(list('src',[],true),WS,'src'),{entries:[],truncated:true});
  assert.deepEqual(validateWorkspaceTreeListing(list('src',[file('index.ts','src/index.ts')]),WS,'src').entries,
    [{kind:'file',path:'src/index.ts',name:'index.ts'}]);
});
