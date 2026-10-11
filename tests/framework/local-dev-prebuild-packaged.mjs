import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const tar=path.resolve(process.argv[2]),output=process.argv[3];
if(!output||fs.existsSync(output))throw Error('Supply tarball and fresh result path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r23-installed-'));
try{
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'r23-install-check',version:'1.0.0',private:true}));
  const log=execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund',tar],{cwd:root,encoding:'utf8'});
  const base=path.join(root,'node_modules/@shopable/opendesk-dev');
  const help=execFileSync(process.execPath,[path.join(base,'bin/opendesk-dev.mjs'),'--help'],{encoding:'utf8'});assert.match(help,/opendesk-dev/);
  const {LocalDevResolver}=await import(pathToFileURL(path.join(base,'runtime/native-agent/local-dev/resolver.mjs')));
  const project=path.join(root,'project');fs.cpSync(path.resolve('examples/programs/local-controller'),project,{recursive:true});
  const resolver=new LocalDevResolver({allowedPaths:[project]});
  try{
    const id=resolver.attach({path:project}).bindingId,first=await resolver.resolve(id),second=await resolver.resolve(id);
    assert.equal(second.cacheHit,true);assert.equal(second.timings.buildCount,0);assert.equal(first.sourceHash,second.sourceHash);
    resolver.preparation.start(id);const end=Date.now()+5000;
    while(resolver.preparation.status(id).state!=='ready'&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(resolver.preparation.status(id).state,'ready');
    fs.writeFileSync(output,JSON.stringify({status:'PASS_PACKAGED_NODE_ONLY',tarballSha256:crypto.createHash('sha256').update(fs.readFileSync(tar)).digest('hex'),installed:{webpack:JSON.parse(fs.readFileSync(path.join(root,'node_modules/webpack/package.json'))).version},log,first:first.timings,hit:second.timings,sourceHash:first.sourceHash,preparation:resolver.preparation.status(id)},null,2)+'\n');
  }finally{resolver.close();}
}finally{fs.rmSync(root,{recursive:true,force:true});}
