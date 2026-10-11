import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

export async function runR23Preparation({project,bindingId,mcpClient,until,report,record,out,directFile,origin}){
  if(directFile){
    const attached=await mcpClient.tool('attach',{path:directFile,runtimeKind:'controller',siteOrigin:origin});
    const started=await mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'r23-direct-'+crypto.randomUUID()});
    assert.equal(started.source.timings.buildCount,0);assert.equal(started.source.sourceHash,crypto.createHash('sha256').update(fs.readFileSync(directFile)).digest('hex'));
    const result=await until(async()=>{const value=await mcpClient.tool('result',{runId:started.runId});return value.run.retirementState==='released'&&value.results.length?value:null;},'R23 direct durable result');
    assert.equal(result.results[0].outcome.ok,true);assert.equal(result.value.version,23);assert.equal(result.sourceHash,started.source.sourceHash);
    report.tests.push({name:'r23-real-single-file-direct-zero-compilations',status:'PASS',runId:started.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,documentId:result.run.target.documentId});
  }
  const prepared=await until(async()=>{const value=await mcpClient.tool('status',{bindingId});return value.projects.find(x=>x.bindingId===bindingId)?.preparation.state==='ready'?value:null;},'R23 automatic preparation');
  const samples=[];
  for(let i=0;i<10;i++){
    const begin=performance.now(),started=await mcpClient.tool('run',{bindingId,requestId:'r23-hit-'+crypto.randomUUID()});
    assert.equal(started.source.cacheHit,true);assert.equal(started.source.timings.buildCount,0);
    const result=await until(async()=>{const value=await mcpClient.tool('result',{runId:started.runId});return value.run.retirementState==='released'&&value.results.length?value:null;},'R23 durable result');
    assert.equal(result.results[0].outcome.ok,true);assert.equal(result.sourceHash,started.source.sourceHash);
    samples.push({runId:started.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,sourceRevision:started.source.inputHash,documentId:started.target.documentId,retirement:result.run.retirementState,preparation:started.source.timings,nativeAdmissionMs:started.timings.nativeAdmissionMs,endToEndMs:performance.now()-begin});
  }
  // Thirty actual writes before any run. Only source preparation is permitted.
  const file=path.join(project,'src/extract.js'),before=fs.readFileSync(file,'utf8');
  for(let i=1;i<=30;i++){fs.writeFileSync(file,before+'\n// R23 save '+i+'\n');await new Promise(resolve=>setTimeout(resolve,8));}
  const latest=await until(async()=>{const value=await mcpClient.tool('status',{bindingId});const state=value.projects.find(x=>x.bindingId===bindingId)?.preparation;return state?.state==='ready'&&state.sourceRevision!==prepared.projects.find(x=>x.bindingId===bindingId).preparation.sourceRevision?state:null;},'R23 latest saved revision');
  const started=await mcpClient.tool('run',{bindingId,requestId:'r23-after-edit-'+crypto.randomUUID()});
  assert.equal(started.source.cacheHit,true);assert.equal(started.source.timings.buildCount,0);assert.equal(started.source.inputHash,latest.sourceRevision);
  const result=await until(async()=>{const value=await mcpClient.tool('result',{runId:started.runId});return value.run.retirementState==='released'&&value.results.length?value:null;},'R23 saved result');
  assert.equal(result.results[0].outcome.ok,true);
  const raw={level:'REAL_MAC_CFT_NATIVE_MCP',samples,latest,afterEdit:{runId:started.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,sourceRevision:started.source.inputHash},browserTimingScope:'endToEnd includes Native and result polling; no claim that Node compilation is browser execution'};
  fs.writeFileSync(path.join(out,'r23-performance.json'),JSON.stringify(raw,null,2)+'\n');record('r23.performance',raw);
  report.tests.push({name:'r23-ten-real-runs-zero-compilations-and-30-saves',status:'PASS',evidence:'r23-performance.json',runs:samples.length});
}
