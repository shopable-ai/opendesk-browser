// R24.3 L4 actual Chrome/Native/MCP lifecycle campaign.
// A *cycle* is a new Page document, a new real previewId and a fresh
// stop receipt. Pointer clicks alone never increment the cycle count.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';

export async function runPageFrameworkLongLoops({projects,mcpClient,target,until,clickNode,record,report,getCurrentTarget}){
  const original=await target.read('location.href');
  const url=new URL(original);
  assert.equal(url.hostname,'127.0.0.1');
  assert.equal(url.pathname,'/demo-form.html');
  const base=url.origin+'/demo-form.html';
  const seenPreviews=new Set(),seenDocuments=new Set();
  for(const [framework,projectKey,programId] of [
    ['react','reactJsx','sample.page-ui-react'],
    ['vue','vueSfc','sample.page-ui-vue']
  ]){
    const binding=await mcpClient.tool('attach',{path:projects[projectKey]});
    const pinned=PAGE_FRAMEWORK_RUNTIMES[framework];
    for(let attempt=1;attempt<=20;attempt++){
      const before=(await getCurrentTarget()).result?.target;
      const destination=base+'?r243-loop='+framework+'-'+attempt;
      const navigation=await target.call('Page.navigate',{url:destination});
      assert.equal(navigation.errorText,undefined,'real Chrome must navigate to a fresh document');
      const actual=await until(async()=>{
        const state=await getCurrentTarget();
        const t=state.result?.target;
        if(t?.documentId&&t.documentId!==before?.documentId&&t.url===destination&&
           await target.read('document.readyState==="complete"'))return t;
        return null;
      },framework+' independent document '+attempt,25000);
      assert.equal(seenDocuments.has(actual.documentId),false,'each cycle must be a new actual Chrome document');
      seenDocuments.add(actual.documentId);
      const host='document.querySelector('+JSON.stringify('[data-od-id="'+programId+'"]')+')';
      assert.equal(await target.read('!('+host+')'),true,'fresh document cannot already contain a previous UI');
      const started=await mcpClient.tool('run',{bindingId:binding.bindingId,
        requestId:'r243-loop-'+framework+'-'+attempt+'-'+crypto.randomUUID()});
      assert.ok(started.previewId,'native Page admission requires real previewId');
      assert.equal(started.target.documentId,actual.documentId);
      assert.equal(seenPreviews.has(started.previewId),false,'new Run must allocate a new previewId');
      seenPreviews.add(started.previewId);
      assert.ok(started.source.sourceBytes>0&&started.source.sourceBytes<100000,'unchanged Page source budget');
      const receipt=await until(async()=>{
        const row=await mcpClient.tool('result',{previewId:started.previewId});
        return row.state==='preview-pending'?null:row;
      },framework+' real run receipt '+attempt,30000);
      assert.equal(receipt.state,'preview-evaluated',JSON.stringify(receipt.error));
      assert.equal(receipt.result.world,'USER_SCRIPT');
      assert.equal(receipt.result.documentId,actual.documentId);
      assert.equal(receipt.result.sourceHash,started.source.sourceHash);
      assert.equal(receipt.result.packagedFrameworkId,framework);
      assert.equal(receipt.result.packagedFrameworkSha256,pinned.sha256);
      const button='('+host+')?.shadowRoot?.querySelector("button")';
      await until(()=>target.read('('+button+')?.textContent.includes("已点击 0 次")'),
        framework+' component mounted '+attempt,12000);
      await clickNode(target,button);
      await until(()=>target.read('('+button+')?.textContent.includes("已点击 1 次")'),
        framework+' genuine pointer update '+attempt,12000);
      if(attempt===1||attempt===20)await target.screenshot('r243-loop-'+framework+'-'+attempt+'-mounted.png');
      const stopped=await mcpClient.tool('stop',{previewId:started.previewId,
        requestId:'r243-loop-stop-'+framework+'-'+attempt+'-'+crypto.randomUUID()});
      assert.equal(stopped.state,'preview-retired');
      assert.equal(stopped.sourceHash,started.source.sourceHash);
      assert.equal(stopped.receipt.ok,true);
      assert.equal(stopped.receipt.scope,'managed-ui-only');
      await until(()=>target.read('!('+host+')'),framework+' actual root unmount '+attempt,12000);
      assert.equal(await target.read('document.querySelectorAll("[data-od-managed]").length'),0,
        'Stop must remove all managed DOM hosts from the active document');
      const caseResult={
        name:'r243-'+framework+'-independent-run-stop-'+attempt,status:'PASS',
        sourceHash:started.source.sourceHash,sourceBytes:started.source.sourceBytes,
        previewId:started.previewId,documentId:actual.documentId,frameworkSha256:pinned.sha256,
        stopReceipt:stopped.receipt,actualPointerInput:true,domClean:true
      };
      report.tests.push(caseResult);record('r243.independent-run-stop',caseResult);
    }
  }
  assert.equal(seenPreviews.size,40);
  assert.equal(seenDocuments.size,40);
}
