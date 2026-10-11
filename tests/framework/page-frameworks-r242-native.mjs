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
  // R24.3: officially authored JSX is compiled from disk by the exact
  // local Resolver, not pasted into a page or reinterpreted by the test.
  const jsxBinding=await mcpClient.tool('attach',{path:projects.reactJsx});
  const jsxStarted=await mcpClient.tool('run',{bindingId:jsxBinding.bindingId,requestId:'r243-jsx-'+crypto.randomUUID()});
  assert.ok(jsxStarted.previewId,'new JSX preview uses real Page authority');
  assert.equal(jsxStarted.source.sourceBytes<100000,true);
  const jsxResult=await until(async()=>{
    const value=await mcpClient.tool('result',{previewId:jsxStarted.previewId});
    return value.state==='preview-pending'?null:value;
  },'R24.3 real JSX Page result',30000);
  assert.equal(jsxResult.state,'preview-evaluated',JSON.stringify(jsxResult.error));
  assert.equal(jsxResult.result.packagedFrameworkId,'react');
  assert.equal(jsxResult.result.packagedFrameworkSha256,PAGE_FRAMEWORK_RUNTIMES.react.sha256);
  assert.equal(jsxResult.result.sourceHash,jsxStarted.source.sourceHash);
  const jsxHost='document.querySelector(\'[data-od-id="sample.page-ui-react"]\')';
  const jsxButton='('+jsxHost+')?.shadowRoot?.querySelector("button")';
  await until(()=>target.read('('+jsxButton+')?.textContent.includes("已点击 0 次")'),
    'R24.3 JSX mounted in real website',10000);
  await clickNode(target,jsxButton);
  await until(()=>target.read('('+jsxButton+')?.textContent.includes("已点击 1 次")'),
    'R24.3 JSX React Hook updates from genuine Chrome input',10000);
  await target.screenshot('r243-react-jsx-mounted.png');
  const jsxStopped=await mcpClient.tool('stop',{previewId:jsxStarted.previewId,
    requestId:'r243-jsx-stop-'+crypto.randomUUID()});
  assert.equal(jsxStopped.state,'preview-retired');
  assert.equal(jsxStopped.receipt.ok,true);
  assert.equal(jsxStopped.receipt.scope,'managed-ui-only');
  await until(()=>target.read('!('+jsxHost+')'),'R24.3 JSX root.unmount');
  assert.deepEqual(await target.read('({name:document.querySelector("#name")?.value,results:document.querySelector("#results")?.textContent})'),
    initialForm,'React JSX did not change the host form');
  const jsxProof={name:'r243-react-official-jsx-real-native-run-stop',status:'PASS',
    sourceHash:jsxStarted.source.sourceHash,sourceBytes:jsxStarted.source.sourceBytes,
    previewId:jsxStarted.previewId,documentId:jsxStarted.target.documentId,
    frameworkSha256:PAGE_FRAMEWORK_RUNTIMES.react.sha256,
    stopReceipt:jsxStopped.receipt,actualPointerInput:true};
  report.tests.push(jsxProof);record('r243.native-jsx',jsxProof);

  // Vue SFC is compiled by the pinned offline compiler in the same original
  // local project resolver. This is a fresh native preview, not a Node mock.
  const vueBinding=await mcpClient.tool('attach',{path:projects.vueSfc});
  const vueStarted=await mcpClient.tool('run',{bindingId:vueBinding.bindingId,
    requestId:'r243-vue-sfc-'+crypto.randomUUID()});
  assert.ok(vueStarted.previewId,'new Vue SFC preview identity');
  assert.ok(vueStarted.source.sourceBytes<100000);
  const vueResult=await until(async()=>{
    const value=await mcpClient.tool('result',{previewId:vueStarted.previewId});
    return value.state==='preview-pending'?null:value;
  },'R24.3 Vue SFC native Page result',30000);
  assert.equal(vueResult.state,'preview-evaluated',JSON.stringify(vueResult.error));
  assert.equal(vueResult.result.packagedFrameworkId,'vue');
  assert.equal(vueResult.result.packagedFrameworkSha256,PAGE_FRAMEWORK_RUNTIMES.vue.sha256);
  assert.equal(vueResult.result.sourceHash,vueStarted.source.sourceHash);
  const vueHost=`document.querySelector('[data-od-id="sample.page-ui-vue"]')`;
  const vueButton='('+vueHost+')?.shadowRoot?.querySelector("button")';
  await until(()=>target.read('('+vueButton+')?.textContent.includes("已点击 0 次")'),
    'R24.3 Vue SFC mounted in actual webpage',10000);
  const scoped=await target.read('Array.from(('+vueHost+')?.shadowRoot?.querySelectorAll("style")||[]).some(e=>e.textContent.includes("data-v-"))');
  assert.equal(scoped,true,'Scoped CSS must be mounted in managed Shadow DOM');
  await clickNode(target,vueButton);
  await until(()=>target.read('('+vueButton+')?.textContent.includes("已点击 1 次")'),
    'R24.3 Vue SFC state updated from genuine pointer click',10000);
  await target.screenshot('r243-vue-sfc-mounted.png');
  const vueStop=await mcpClient.tool('stop',{previewId:vueStarted.previewId,
    requestId:'r243-vue-sfc-stop-'+crypto.randomUUID()});
  assert.equal(vueStop.state,'preview-retired');
  assert.equal(vueStop.receipt.ok,true);
  assert.equal(vueStop.receipt.scope,'managed-ui-only');
  await until(()=>target.read('!('+vueHost+')'),'R24.3 Vue app.unmount/managed CSS removed');
  assert.deepEqual(await target.read('({name:document.querySelector("#name")?.value,results:document.querySelector("#results")?.textContent})'),
    initialForm,'Vue SFC must preserve host form state');
  const vueProof={name:'r243-vue-official-sfc-real-native-run-stop',status:'PASS',
    sourceHash:vueStarted.source.sourceHash,sourceBytes:vueStarted.source.sourceBytes,
    previewId:vueStarted.previewId,documentId:vueStarted.target.documentId,
    frameworkSha256:PAGE_FRAMEWORK_RUNTIMES.vue.sha256,
    scopeIdSeen:true,stopReceipt:vueStop.receipt,actualPointerInput:true};
  report.tests.push(vueProof);record('r243.native-vue-sfc',vueProof);

}
