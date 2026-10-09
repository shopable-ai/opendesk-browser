// Real Codex CLI is the editing/MCP client. Its final prose is never a receipt.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';

export async function runCodexClient({root,project,origin,documentId,title,out,report,record}) {
 const requestPrefix='r101-codex-'+crypto.randomUUID();
 const server={command:process.execPath,args:[path.join(root,'native-agent/local-dev/mcp.mjs'),'--allow-project',project],env:{OPENDESK_NATIVE_INSTANCE:process.env.OPENDESK_NATIVE_INSTANCE},enabled:true,required:true,tool_timeout_sec:45};
 const configured=JSON.parse(execFileSync('python3',['-c',"import json,tomllib,pathlib;print(json.dumps(list(tomllib.loads((pathlib.Path.home()/'.codex/config.toml').read_text()).get('mcp_servers',{}))))"],{encoding:'utf8'}));
 const overrides=configured.flatMap(name=>['-c','mcp_servers.'+name+'.enabled=false']);
 overrides.push('-c','mcp_servers.r101_dev={command='+JSON.stringify(server.command)+',args='+JSON.stringify(server.args)+',env={OPENDESK_NATIVE_INSTANCE='+JSON.stringify(server.env.OPENDESK_NATIVE_INSTANCE)+'},enabled=true,required=true,default_tools_approval_mode="approve",tool_timeout_sec=45}');
 const prompt=`You are the actual Codex client for an authorized OpenDesk acceptance on a controlled page. Work only in ${project}. Do not use a browser automation tool, build command, network download, git, or modify any file except src/extract.js. Use Codex filesystem, shell or apply_patch tools to read and edit src/extract.js; these local editing tools are explicitly allowed. Use r101_dev MCP tools only for browser execution, binding and result retrieval. The user authorizes these two intentional runs on ${origin}, documentId ${documentId}.
1. Read the existing JavaScript. Save src/extract.js as an exported async function readSummary(page) returning {version:101,title:await page.title()}.
2. Attach this directory through opendesk.dev.attach with arguments exactly {"path":${JSON.stringify(project)}}. The directory package.json already declares its runtime and site origin; omit runtimeKind, entryFormat and siteOrigin (those are for single-file binding). Run with requestId ${requestPrefix}-101. Poll opendesk.dev.result until retirementState is released and the durable controller-result is present. Require version 101 and title ${JSON.stringify(title)}.
3. Edit only the number 101 to 102 in that same saved source file. Run once with requestId ${requestPrefix}-102, and poll the durable result. Require version 102. Require a different sourceHash and the same target documentId.
4. Read the original run's result again after version 102. Require the old value still be 101 with its original sourceHash.
If a run admission is uncertain, recover with the original admissionRequestId and never retry the effect. Stop on any failure. Return the two exact runIds, resultIds, sourceHashes, documentIds, and values. Do not simulate success.`;
 fs.writeFileSync(path.join(out,'codex-prompt.txt'),prompt);
 const stdout=fs.createWriteStream(path.join(out,'codex-events.jsonl'));
 const stderr=fs.createWriteStream(path.join(out,'codex-stderr.log'));
 const args=['-a','never',...overrides,'exec','--ephemeral','--json','--sandbox','danger-full-access','--skip-git-repo-check','-C',project,prompt];
 record('codex.start',{command:'codex',version:execFileSync('codex',['--version'],{encoding:'utf8'}).trim(),project,requestPrefix});
 const child=spawn('codex',args,{cwd:project,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(stdout);child.stderr.pipe(stderr);
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},240000);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});clearTimeout(timer);
 await Promise.all([new Promise(resolve=>stdout.end(resolve)),new Promise(resolve=>stderr.end(resolve))]);
 assert.equal(timedOut,false,'Codex CLI deadline; unknown effects must not be replayed');
 assert.equal(code,0,'real Codex CLI must complete; see codex-stderr.log');
 const rows=fs.readFileSync(path.join(out,'codex-events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
 const calls=rows.filter(row=>row.type==='item.completed'&&row.item?.type==='mcp_tool_call');
 assert.equal(calls.filter(row=>row.item.tool==='opendesk.dev.run').length,2,'exactly two Codex effect calls');
 const receipts=[];
 function inspect(value) {
  if(!value||typeof value!=='object')return;
  if(value.runId&&value.run?.retirementState==='released'&&value.results?.length)receipts.push(value);
  if(value.type==='text'&&typeof value.text==='string'){try{inspect(JSON.parse(value.text));}catch{}}
  for(const child of Object.values(value))if(child&&typeof child==='object')inspect(child);
 }
 for(const row of calls)inspect(row.item.result);
 const first=receipts.find(row=>row.value?.version===101),second=receipts.find(row=>row.value?.version===102);
 assert.ok(first&&second,'actual MCP tool receipts for both Codex versions');
 assert.notEqual(first.sourceHash,second.sourceHash);
 assert.notEqual(first.runId,second.runId);
 for(const result of [first,second]){
  assert.equal(result.run.target.documentId,documentId);
  assert.equal(result.value.title,title);
  assert.equal(result.results[0].outcome.ok,true);
  assert.equal(result.results[0].revision.sourceHash,result.sourceHash);
  assert.equal(result.results[0].resultId,result.run.resultId);
 }
 assert.ok(receipts.indexOf(receipts.findLast(row=>row.runId===first.runId))>receipts.indexOf(second),'original frozen result read after new result');
 const evidence={name:'r101-actual-Codex-CLI-edit-and-MCP-rerun',status:'PASS',requestPrefix,runs:[first,second].map(row=>({runId:row.runId,resultId:row.results[0].resultId,sourceHash:row.sourceHash,documentId:row.run.target.documentId,value:row.value,retirement:row.run.retirementState}))};
 fs.writeFileSync(path.join(out,'codex-receipts.json'),JSON.stringify({evidence,receipts},null,2)+'\n');
 report.tests.push(evidence);record('codex.complete',evidence);
}
