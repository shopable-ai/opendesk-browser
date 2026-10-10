#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
function exec(program,args,options={}){
  const r=spawnSync(program,args,{...options,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});
  assert.equal(r.status,0,program+' '+args.join(' ')+'\n'+(r.stderr||r.stdout||r.error?.message));
  return r.stdout;
}
const response=JSON.parse(exec(process.execPath,[path.join(root,'scripts/pack-opendesk-dev.mjs')]));
const archive=response.archive;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r17-pack-'));
try{
  const prefix=path.join(temp,'npm-global');
  fs.mkdirSync(prefix,{recursive:true,mode:0o700});
  // Install the actual npm pack tarball outside this git checkout.
  exec(process.platform==='win32'?'npm.cmd':'npm',
    ['install','-g','--prefix',prefix,'--ignore-scripts','--no-audit','--no-fund',archive],
    {cwd:temp});
  const packageRoot=path.join(prefix,'lib','node_modules','@shopable','opendesk-dev');
  const pkg=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8'));
  assert.equal(pkg.bin['opendesk-dev'],'bin/opendesk-dev.mjs');
  assert.equal(pkg.private,undefined);
  const executable=path.join(prefix,'bin','opendesk-dev');
  const help=exec(executable,['--help'],{cwd:temp,env:{...process.env,HOME:path.join(temp,'absent-home')}});
  assert.match(help,/opendesk-dev/);
  assert.match(exec(executable,['--version'],{cwd:temp}),/R17/);
  // Unlike the help case, this imports the ENTIRE resolver and packaging
  // dependency graph from the installed distribution, not author-tree files.
  const resolverURL=pathToFileURL(path.join(packageRoot,'runtime','native-agent','local-dev','resolver.mjs')).href;
  const sessionURL=pathToFileURL(path.join(packageRoot,'runtime','native-agent','local-dev','session.mjs')).href;
  const {LocalDevResolver}=await import(resolverURL);
  const {LocalDevSession}=await import(sessionURL);
  assert.deepEqual(new LocalDevResolver({allowedPaths:[]}).list(),[]);
  assert.deepEqual(new LocalDevSession({allowedPaths:[]}).resolver.list(),[]);
  if(fs.existsSync(path.join(packageRoot,'runtime','node_modules')))throw Error('E_PACKAGE_LEAK');
  for(const p of ['README.md','package-lock.json','package.json']){
    if(fs.existsSync(path.join(packageRoot,'runtime',p)))throw Error('E_AUTHOR_WORKTREE_LEAK');
  }
  console.log(JSON.stringify({result:'PASS',archive,packageRoot,
    registeredBin:executable,dependencyGraph:'loaded-from-installed-tarball'}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
