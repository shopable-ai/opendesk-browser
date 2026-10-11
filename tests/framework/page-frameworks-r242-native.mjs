// R24.2 targeted L4 acceptance, invoked by the existing authenticated
// Chrome for Testing + Native Host + MCP harness. No second browser launcher,
// permission bypass, synthetic clicks or alternate Page executor.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PAGE_FRAMEWORK_RUNTIMES} from '../../src/libs/page-frameworks/contract.js';

export async function runPageFrameworkExamples({projects,mcpClient,target,until,clickNode,record,report}){
  const docBefore=await target.read('document.URL');
  assert.equal(new URL(docBefore).origin,'http://127.0.0.1:43111');
  const initialOutline=await target.read('document.querySelector("#sample-text").style.getPropertyValue("outline")');
  const initialForm=await target.read('({name:document.querySelector("#name")?.value,results:document.querySelector("#results")?.textContent})');
  for(const name of ['react','vue']){
    const path=projects[name],row=PAGE_FRAMEWORK_RUNTIMES[name];
    const binding=await mcpClient.tool('attach',{path});
    const requestId='r242-'+name+'-'+crypto.randomUUID();
    const started=await mcpClient.tool('run',{bindingId:binding.bindingId,requestId});
    assert.ok(started.previewId,'actual Page preview identity required');
    assert.equal(started.runId,undefined);
    assert.ok(started.source.sourceBytes<100000,'user-authored Page JS remains under original budget');
    const receipt=await until(async()=>{
      const result=await mcpClient.tool('result',{previewId:started.previewId});
      return result.state==='preview-pending'?null:result;
    },'R24.2 '+name+' real Page receipt',30000);
    assert.equal(receipt.state,'preview-evaluated',JSON.stringify(receipt.error));
    assert.equal(receipt.result.world,'USER_SCRIPT');
    assert.equal(receipt.result.documentId,started.target.documentId);
    assert.equal(receipt.result.sourceHash,started.source.sourceHash);
    assert.equal(receipt.result.packagedFrameworkId,name);
    assert.equal(receipt.result.packagedFrameworkSha256,row.sha256);
    const host='document.querySelector('+JSON.stringify('[data-od-id="sample.page-ui-'+name+'-direct"]')+')';
    const button='('+host+')?.shadowRoot?.querySelector("button")';
    await until(()=>target.read('!!('+button+')'),'R24.2 '+name+' real component mounted',10000);
    const originalCount=await target.read('document.querySelectorAll("[data-opendesk-example-marker]").length');
    assert.equal(originalCount,0,'previous tool markers retired');
    // Use genuine Chrome input; React/Vue state updates and DOM effects are
    // observed separately rather than forged with element.click().
    for(let i=0;i<20;i++){
      await clickNode(target,button);
      const count=(i%2===0)?1:0;
      await until(()=>target.read('document.querySelectorAll("[data-opendesk-example-marker]").length==='+count),
        name+' click effect '+i,5000);
    }
    assert.equal(await target.read('document.querySelector("#sample-text").style.getPropertyValue("outline")'),initialOutline,
      'toggle 20 must restore the site-owned outline');
    await clickNode(target,button);
    await until(()=>target.read('document.querySelectorAll("[data-opendesk-example-marker]").length===1'),
      name+' last active marker');
    const stop=await mcpClient.tool('stop',{previewId:started.previewId,requestId:'r242-stop-'+crypto.randomUUID()});
    assert.equal(stop.state,'preview-retired');
    assert.equal(stop.receipt.scope,'managed-ui-only');
    assert.equal(stop.receipt.ok,true);
    assert.equal(stop.sourceHash,started.source.sourceHash);
    await until(()=>target.read('!('+host+')'),'R24.2 '+name+' actual React/Vue root retired');
    assert.equal(await target.read('document.querySelectorAll("[data-opendesk-example-marker]").length'),0);
    assert.equal(await target.read('document.querySelector("#sample-text").style.getPropertyValue("outline")'),initialOutline);
    assert.deepEqual(await target.read('({name:document.querySelector("#name")?.value,results:document.querySelector("#results")?.textContent})'),initialForm);
    await target.screenshot('r242-page-'+name+'-stopped.png');
    const proof={name:'r242-'+name+'-page-no-manual-build-and-21-native-clicks',status:'PASS',
      sourceHash:started.source.sourceHash,sourceBytes:started.source.sourceBytes,
      previewId:started.previewId,documentId:started.target.documentId,world:receipt.result.world,
      frameworkSha256:row.sha256,cleanupReceipt:stop.receipt,originalWebsiteFormPreserved:true};
    report.tests.push(proof);record('r242.native-page-framework',proof);
  }
}
