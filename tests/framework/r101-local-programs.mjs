// Additional cases for the existing real MCP -> Native -> RunHost driver.
// Node builds prepare locked input only; browser execution stays in RunHost.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';

const remoteURL='https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';
export async function prepareR101Projects({root,workspace,origin,out,record}) {
  const projects=[];
  for(const kind of ['https','mixed']) {
    const importURL=remoteURL+(kind==='mixed'?'?opendesk=r101':'');
    const dir=path.join(workspace,'r101-'+kind);fs.mkdirSync(dir);fs.mkdirSync(dir+'/src');
    const pkg=JSON.parse(fs.readFileSync(root+'/examples/programs/local-controller/package.json'));
    pkg.name='@opendesk-examples/r101-'+kind;pkg.opendesk.id='sample.r101-'+kind;pkg.opendesk.siteOrigins=[origin];
    if(kind==='mixed') {
      pkg.dependencies={'lodash-es':'4.17.21'};
      const lock=JSON.parse(fs.readFileSync(root+'/examples/programs/page-npm-lodash/package-lock.json'));
      lock.name=pkg.name;lock.version=pkg.version;lock.packages[''].name=pkg.name;lock.packages[''].version=pkg.version;
      fs.writeFileSync(dir+'/package-lock.json',JSON.stringify(lock,null,2)+'\n');
    }
    fs.writeFileSync(dir+'/package.json',JSON.stringify(pkg,null,2)+'\n');
    const source=kind==='https'?
      `import add from ${JSON.stringify(importURL)};\nexport default async function main(){return add(20,22);}\n`:
      `import add from ${JSON.stringify(importURL)};\nimport * as remote from ${JSON.stringify(importURL)};\nimport {remoteAdd} from './re-export.js';\nimport subtract from 'lodash-es/subtract.js';\nimport {round} from 'lodash-es';\nimport * as local from 'lodash-es/add.js';\nexport default async function main(){return {value:round(add(20,22)),namespace:remote.default(20,22),reExport:remoteAdd(20,22),npmDefault:subtract(50,8),npmNamed:round(41.6),npmNamespace:local.default(20,22)};}\n`;
    fs.writeFileSync(dir+'/src/main.js',source);
    if(kind==='mixed') {
      fs.writeFileSync(dir+'/src/re-export.js',`export {default as remoteAdd} from ${JSON.stringify(importURL)};\n`);
      const npmOutput=execFileSync(process.env.npm_execpath?process.execPath:'npm',process.env.npm_execpath?[process.env.npm_execpath,'ci','--ignore-scripts','--no-audit','--no-fund']:['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir,encoding:'utf8'});
      fs.writeFileSync(path.join(out,kind+'-npm-ci.log'),npmOutput);
    }
    const online=await buildProgramProject(dir,{lockRemote:true,outputDirectory:path.join(workspace,'built-'+kind)});
    const offlineOutput=execFileSync(process.execPath,['--permission','--allow-fs-read=*','--allow-fs-write=*',path.join(root,'tests/framework/r101-offline-build.mjs'),dir,path.join(workspace,'offline-'+kind)],{encoding:'utf8'});
    const offlineProof=JSON.parse(offlineOutput),offline=offlineProof.artifact;
    assert.equal(offlineProof.networkPermission,false);assert.equal(offlineProof.probe,'ERR_ACCESS_DENIED');
    fs.writeFileSync(path.join(out,kind+'-network-denied-build.json'),offlineOutput);
    assert.equal(online.sourceHash,offline.sourceHash);
    const development=await buildProgramProject(dir,{mode:'development',outputDirectory:path.join(workspace,'development-'+kind)});
    const map=JSON.parse(fs.readFileSync(path.join(workspace,'development-'+kind,'program.js.map')));
    assert.ok(map.sources.some(name=>name.includes('main.js')));assert.ok(map.sourcesContent?.length);
    for(const [name,artifact] of [['online',online],['offline',offline],['development',development]])
      fs.writeFileSync(path.join(out,kind+'-'+name+'-artifact.json'),JSON.stringify(artifact,null,2)+'\n');
    fs.copyFileSync(path.join(workspace,'built-'+kind,'program.js'),path.join(out,kind+'-program.js'));
    fs.copyFileSync(path.join(workspace,'development-'+kind,'program.js.map'),path.join(out,kind+'-program.js.map'));
    record('r101.build',{kind,sourceHash:online.sourceHash,offlineSourceHash:offline.sourceHash,remoteModules:online.remoteModules,sourceMapSources:map.sources});
    projects.push({kind,path:dir,source,sourceHash:online.sourceHash});
  }
  return projects;
}
export async function runR101Projects({projects,mcpClient,until,report,record}) {
  for(const project of projects) {
    const binding=await mcpClient.tool('attach',{path:project.path});
    const started=await mcpClient.tool('run',{bindingId:binding.bindingId,requestId:'r101-'+project.kind+'-'+crypto.randomUUID()});
    const result=await until(async()=>{const r=await mcpClient.tool('result',{runId:started.runId});return r.run.retirementState==='released'&&r.results.length?r:null;},'R101 real '+project.kind,30000);
    assert.equal(result.results[0].outcome.ok,true);assert.equal(result.sourceHash,project.sourceHash);
    assert.equal(project.kind==='https'?result.value:result.value.value,42);
    if(project.kind==='mixed')for(const value of Object.values(result.value))assert.equal(value,42);
    const evidence={name:'r101-real-MCP-'+project.kind,status:'PASS',runId:result.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,documentId:result.run.target.documentId,value:result.value,retirement:result.run.retirementState};
    report.tests.push(evidence);record('r101.result',evidence);
    if(project.kind==='https') {
      fs.writeFileSync(project.path+'/src/main.js',project.source.replace('add(20,22)','add(21,22)'));
      const next=await mcpClient.tool('run',{bindingId:binding.bindingId,requestId:'r101-edit-'+crypto.randomUUID()});
      const edited=await until(async()=>{const r=await mcpClient.tool('result',{runId:next.runId});return r.run.retirementState==='released'&&r.results.length?r:null;},'R101 edited saved source',30000);
      assert.equal(edited.value,43);assert.notEqual(edited.sourceHash,result.sourceHash);
      const previous=await mcpClient.tool('result',{runId:started.runId});assert.equal(previous.value,42);assert.equal(previous.sourceHash,result.sourceHash);
      const row={name:'r101-edit-and-frozen-old-result',status:'PASS',runId:edited.runId,resultId:edited.results[0].resultId,sourceHash:edited.sourceHash,documentId:edited.run.target.documentId,value:edited.value,previousRunId:result.runId,previousSourceHash:result.sourceHash};report.tests.push(row);record('r101.result',row);
    }
  }
}
