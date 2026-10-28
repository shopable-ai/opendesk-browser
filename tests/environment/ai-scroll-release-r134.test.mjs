import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';

const workflow=readFileSync(new URL('../../.github/workflows/ai-scroll-navigation-r131.yml',import.meta.url),'utf8');
// Extract actual run blocks, so the race tests execute the shipping shell code.
function runBlock(name){
  const step=workflow.split(`      - name: ${name}\n`)[1];
  assert.ok(step,`missing step: ${name}`);
  const body=step.split('        run: |\n')[1].split(/\n      - /)[0];
  return body.split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
}
const publish=runBlock('Commit verified package with normal fast-forward push');
const verify=runBlock('Verify byte identity, revision, scope and blocked release');
const packagePath='examples/programs/chatgpt-jump-top/ai-scroll-navigation.opendesk-page.json';
const catalogPath='official-pages/sources.json';
const id='opendesk.ai-scroll-navigation';
const row={programId:id,version:'0.4.1',revision:2,publication:'blocked'};
const desired={...row,version:'0.4.8',revision:8};
const pkg={programId:id,version:'0.4.8',revision:8,sourceHash:'a'.repeat(64),packageHash:'b'.repeat(64)};
const catalog=(entry= row,other='original')=>({schema:'test',programs:[entry,{programId:'other',version:other}]});
const write=(root,path,value)=>{mkdirSync(dirname(join(root,path)),{recursive:true});
  writeFileSync(join(root,path),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
function command(cmd,args,cwd,env={}){
  return spawnSync(cmd,args,{cwd,encoding:'utf8',env:{...process.env,...env}});
}
function git(cwd,...args){const result=command('git',args,cwd);
  assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
function fixture(t,initialPackage={...pkg,version:'0.4.1',revision:2},initialCatalog=catalog()){
  const root=mkdtempSync(join(tmpdir(),'ai-scroll-release-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const remote=join(root,'origin.git'),author=join(root,'author'),runner=join(root,'runner'),temp=join(root,'temp');
  mkdirSync(temp);
  git(root,'init','--bare',remote);git(root,'init','-b','main',author);
  git(author,'config','user.name','Test');git(author,'config','user.email','test@example.invalid');
  write(author,packagePath,initialPackage);
  write(author,catalogPath,initialCatalog);write(author,'README.md','base\n');
  git(author,'add','.');git(author,'commit','-m','fixture');
  git(author,'remote','add','origin',remote);git(author,'push','origin','main');
  git(root,'clone','-b','main',remote,runner);
  const base=git(runner,'rev-parse','HEAD');
  write(runner,packagePath,pkg);write(runner,catalogPath,catalog(desired));
  write(temp,'ai-scroll-release-record.json',{...pkg,publication:'blocked'});
  return {root,remote,author,runner,temp,base,
    advance(path,value){write(author,path,value);git(author,'add','.');git(author,'commit','-m','parallel change');git(author,'push','origin','main');},
    run(env={}){return command('bash',['-c',publish],runner,{AI_SCROLL_INPUT_HEAD:base,RUNNER_TEMP:temp,...env});},
    runVerify(){
      // Isolate the release fence from the production validator: package schema
      // validation has its own CI suite; this executes the actual workflow gate.
      write(runner,'package.json',{type:'module'});
      write(runner,'src/scripting/user-scripts/page-install-package.js',
        `export const validatePageInstallPackage=async value=>({...value,sourceUtf8:'built source',pageRules:{matches:['https://chatgpt.com/*','https://chat.deepseek.com/*','https://gemini.google.com/*']}});`);
      write(runner,'examples/programs/chatgpt-jump-top/chatgpt-jump-top.opendesk-page.json',{programId:'opendesk.chatgpt-jump-top'});
      write(temp,'ai-scroll-nav-build/program.js','built source');
      return command('bash',['-c',verify],runner,{AI_SCROLL_INPUT_HEAD:base,RUNNER_TEMP:temp});
    },
    remoteFile(path){return JSON.parse(git(author,'show',`refs/remotes/origin/main:${path}`));}};
}

test('official r8 uses reserved-range guard and a matching hash record without native claims',()=>{
  assert.match(workflow,/--revision 8 /);
  assert.match(verify,/value.version,'0.4.8'/);
  assert.match(verify,/value.revision,8/);
  assert.match(verify,/value.revision<1_000_000_000/);
  assert.match(verify,/sourceHash:value.sourceHash,packageHash:value.packageHash/);
  assert.match(verify,/chromeNative:'NOT_TESTED',macNative:'NOT_TESTED'/);
  assert.match(publish,/\['programId','version','revision','sourceHash','packageHash'\]/);
  assert.match(workflow,/ai-scroll-release-record.json/);
  assert.match(workflow,/fetch-depth: 0/);
  assert.doesNotMatch(publish,/--force|git rebase/);
});

test('actual publish block has valid bash syntax',()=>{
  for(const body of [verify,publish,runBlock('Reuse production Program Builder and Page Installer')]){
    const result=command('bash',['-n','-c',body],process.cwd());
    assert.equal(result.status,0,result.stderr);
  }
});

test('parallel unrelated main push is preserved in the two-file commit',t=>{
  const f=fixture(t);f.advance('README.md','parallel\n');
  const latest=git(f.author,'rev-parse','HEAD'),result=f.run();
  assert.equal(result.status,0,result.stderr+result.stdout);
  git(f.author,'fetch','origin','main');
  assert.equal(git(f.author,'rev-parse','origin/main^'),latest);
  assert.equal(git(f.author,'show','origin/main:README.md'),'parallel');
  assert.deepEqual(git(f.author,'diff-tree','--no-commit-id','--name-only','-r','origin/main').split('\n').sort(),
    [packagePath,catalogPath].sort());
});

for(const path of ['src/platform/host/authority.js','src/platform/host/broker.js',
  'src/ui/react/tabs/tools.tsx','src/ui/local-project-install.js',
  'examples/sidebar-tools/time-review/trusted/host-controls.js',
  'src/scripting/user-scripts/page-install-authorization.js','src/ui/program-source.js',
  'scripts/program-assets.mjs','native-agent/local-dev/snapshot.mjs',
  'schemas/opendesk-program-project.v1.schema.json','package-lock.json',
  'tests/environment/ai-scroll-release-r134.test.mjs',
  'examples/programs/chatgpt-jump-top/src/conversation.js']){
  test(`input fence rejects changed ${path}`,t=>{
    const f=fixture(t);f.advance(path,'changed\n');const latest=git(f.author,'rev-parse','HEAD');
    const result=f.run();assert.notEqual(result.status,0);
    assert.match(result.stdout,/tested package inputs changed/);
    git(f.author,'fetch','origin','main');assert.equal(git(f.author,'rev-parse','origin/main'),latest);
    const paths=[...workflow.split('    paths:\n')[1].split('  workflow_dispatch:')[0].matchAll(/- '([^']+)'/g)].map(match=>match[1]);
    assert.ok(paths.some(pattern=>pattern.endsWith('/**')?path.startsWith(pattern.slice(0,-2)):pattern===path),`missing trigger ${path}`);
  });
}

test('another Program catalog update survives publication',t=>{
  const f=fixture(t);f.advance(catalogPath,catalog(row,'parallel-version'));
  const result=f.run();assert.equal(result.status,0,result.stderr+result.stdout);
  git(f.author,'fetch','origin','main');
  assert.deepEqual(f.remoteFile(catalogPath),catalog(desired,'parallel-version'));
});

test('identical remote package and own entry cause no duplicate commit even if another entry changed',t=>{
  const f=fixture(t);write(f.author,packagePath,pkg);
  f.advance(catalogPath,catalog(desired,'parallel-version'));
  const latest=git(f.author,'rev-parse','HEAD'),result=f.run();
  assert.equal(result.status,0,result.stderr+result.stdout);assert.match(result.stdout,/no duplicate commit/);
  git(f.author,'fetch','origin','main');assert.equal(git(f.author,'rev-parse','origin/main'),latest);
  assert.equal(git(f.runner,'rev-parse','HEAD'),f.base);
});

test('conflicting remote package cannot be overwritten',t=>{
  const f=fixture(t);f.advance(packagePath,{...pkg,sourceHash:'c'.repeat(64)});
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stdout,/destination changed/);
});

test('conflicting AI Scroll catalog entry cannot be overwritten',t=>{
  const f=fixture(t);f.advance(catalogPath,catalog({...row,publication:'approved'}));
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/AI Scroll catalog entry changed/);
});

for(const key of ['sourceHash','packageHash']){
  test(`mismatched release ${key} fails before any commit or push`,t=>{
    const f=fixture(t);write(f.temp,'ai-scroll-release-record.json',{...pkg,[key]:'c'.repeat(64)});
    const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,new RegExp(`${key} mismatch`));
    assert.equal(git(f.runner,'rev-parse','HEAD'),f.base);
  });
}

test('official publication rejects the dynamic site reserved Revision range',t=>{
  const f=fixture(t),revision=1_000_000_000;
  write(f.runner,packagePath,{...pkg,revision});
  write(f.runner,catalogPath,catalog({...desired,revision}));
  write(f.temp,'ai-scroll-release-record.json',{...pkg,revision,publication:'blocked'});
  const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/AssertionError/);
  assert.equal(git(f.runner,'rev-parse','HEAD'),f.base);
});

// Advance main after the workflow's fetch/fence, immediately before its first
// push. The first push is rejected normally; the next fetch must recheck inputs.
for(const [label,path,value,pass] of [
  ['unrelated update','README.md','raced\n',true],
  ['other Program update',catalogPath,catalog(row,'raced'),true],
  ['changed Broker','src/platform/host/broker.js','raced\n',false],
  ['same package from another publisher',packagePath,pkg,true]
]){
  test(`push retry handles ${label}`,t=>{
    const f=fixture(t),bin=join(f.root,'bin');mkdirSync(bin);
    write(f.author,path,value);
    if(label==='same package from another publisher')write(f.author,catalogPath,catalog(desired));
    const realGit=command('which',['git'],f.root).stdout.trim();
    const wrapper=join(bin,'git');
    writeFileSync(wrapper,`#!/bin/bash
set -euo pipefail
if [ "\${1:-}" = push ] && [ ! -e "$AI_SCROLL_RACE_MARKER" ]; then
  touch "$AI_SCROLL_RACE_MARKER"
  env -u GIT_INDEX_FILE "$AI_SCROLL_REAL_GIT" -C "$AI_SCROLL_RACE_AUTHOR" add .
  env -u GIT_INDEX_FILE "$AI_SCROLL_REAL_GIT" -C "$AI_SCROLL_RACE_AUTHOR" commit -m race
  env -u GIT_INDEX_FILE "$AI_SCROLL_REAL_GIT" -C "$AI_SCROLL_RACE_AUTHOR" push origin main
fi
exec "$AI_SCROLL_REAL_GIT" "$@"
`);chmodSync(wrapper,0o755);
    const result=f.run({PATH:bin+':'+process.env.PATH,AI_SCROLL_REAL_GIT:realGit,
      AI_SCROLL_RACE_MARKER:join(f.temp,'raced'),AI_SCROLL_RACE_AUTHOR:f.author});
    assert.equal(result.status,pass?0:1,result.stderr+result.stdout);
    assert.match(result.stdout,/push attempt 1 failed/);
    git(f.author,'fetch','origin','main');
    if(pass){
      assert.deepEqual(f.remoteFile(packagePath),pkg);
      if(path===catalogPath)assert.equal(f.remoteFile(catalogPath).programs[1].version,'raced');
      if(path==='README.md')assert.equal(git(f.author,'show','origin/main:README.md'),'raced');
      if(label==='same package from another publisher'){
        assert.match(result.stdout,/no duplicate commit/);
        assert.equal(git(f.author,'rev-parse','HEAD'),git(f.author,'rev-parse','origin/main'));
      }
    }else{
      assert.match(result.stdout,/tested package inputs changed/);
      assert.equal(f.remoteFile(packagePath).version,'0.4.1');
    }
  });
}


test('Node CI includes affected install, catalog and tool-local regressions',()=>{
  const ci=runBlock('Affected Node and Page Authority regressions');
  for(const name of ['page-program-library','page-install-package','sidebar-tools-view',
    'ai-scroll-install-ui-r134','ai-scroll-site-detail-ui-r134'])
    assert.ok(ci.includes(`tests/environment/${name}.test.mjs`),name);
  assert.ok(ci.includes('examples/programs/chatgpt-jump-top/tests/*.test.mjs'));
});

for(const stage of ['publish','verify']){
  for(const [label,initial,error] of [
    ['same r8 with different source',{...pkg,sourceUtf8:'committed A'},/identical raw package bytes/],
    ['same r8 with only different formatting',JSON.stringify(pkg),/identical raw package bytes/],
    ['revision rollback',{...pkg,revision:pkg.revision+1},/revision rollback/],
    ['dynamic reserved revision',{...pkg,revision:1_000_000_000},/dynamic reserved revision/]
  ]){
    test(`${stage} rejects frozen ${label} in a real Git fixture`,t=>{
      const f=fixture(t,initial,catalog(desired));
      if(label==='same r8 with different source')write(f.runner,packagePath,{...pkg,sourceUtf8:'rebuilt B'});
      const before=git(f.author,'rev-parse','origin/main');
      const result=stage==='publish'?f.run():f.runVerify();
      assert.notEqual(result.status,0,result.stdout+result.stderr);
      assert.match(result.stderr,error);
      git(f.author,'fetch','origin','main');
      assert.equal(git(f.author,'rev-parse','origin/main'),before);
      assert.equal(git(f.runner,'rev-parse','HEAD'),f.base);
    });
  }
  test(`${stage} accepts frozen r2 to r8 upgrade`,t=>{
    const f=fixture(t),result=stage==='publish'?f.run():f.runVerify();
    assert.equal(result.status,0,result.stdout+result.stderr);
    if(stage==='publish'){
      git(f.author,'fetch','origin','main');assert.deepEqual(f.remoteFile(packagePath),pkg);
    }
  });
  test(`${stage} accepts identical frozen r8 without replacing package bytes`,t=>{
    const f=fixture(t,pkg,catalog(desired)),before=git(f.author,'rev-parse','origin/main');
    const result=stage==='publish'?f.run():f.runVerify();
    assert.equal(result.status,0,result.stdout+result.stderr);
    git(f.author,'fetch','origin','main');
    assert.equal(git(f.author,'rev-parse','origin/main'),before);
    if(stage==='publish')assert.match(result.stdout,/no duplicate commit/);
  });
}
