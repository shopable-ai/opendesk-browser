import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

export async function runControllerLifecycle({project,bindingId,mcpClient,until,report,record}) {
 const source=fs.readFileSync(project+'/src/extract.js','utf8');
 try {
  fs.writeFileSync(project+'/src/extract.js','export async function readSummary(page){await page.waitForSelector("#r101-never-present",{timeout:10000});return 99;}\n');
  for(const kind of ['stop','deadline']){
   const started=await mcpClient.tool('run',{bindingId,requestId:'r101-'+kind+'-'+crypto.randomUUID(),deadlineMs:kind==='deadline'?1000:30000});
   const running=await mcpClient.tool('result',{runId:started.runId});assert.equal(running.run.state,'running');assert.equal(running.results.length,0);
   if(kind==='stop')await mcpClient.tool('stop',{runId:started.runId,requestId:'r101-stop-ack-'+crypto.randomUUID()});
   const result=await until(async()=>{const value=await mcpClient.tool('result',{runId:started.runId});return value.run.retirementState==='released'&&value.results.length?value:null;},'real Controller '+kind+' retirement',20000);
   assert.equal(result.results[0].outcome.ok,false);assert.equal(result.results[0].revision.sourceHash,started.source.sourceHash);
   if(kind==='deadline')assert.equal(result.error.code,'E_TIMEOUT');else assert.equal(result.run.state,'stopped');
   const row={name:'r101-real-Controller-'+kind,status:'PASS',runId:result.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,documentId:result.run.target.documentId,state:result.run.state,error:result.error,retirement:result.run.retirementState};
   report.tests.push(row);record('r101.lifecycle',row);
  }
 }finally{fs.writeFileSync(project+'/src/extract.js',source);}
}
