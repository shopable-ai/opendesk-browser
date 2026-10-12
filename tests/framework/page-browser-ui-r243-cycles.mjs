// Real Chrome for Testing only, no Native/Go/MCP and no synthetic DOM events.
// Every item is a new document + fresh previewId + authenticated USER_SCRIPT
// run + browser pointer update + real Stop receipt + DOM teardown.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export async function runBrowserComponentCycles({
  sidebar,website,output,report,until,clickReal,selectFramework
}){
  const base='http://127.0.0.1:43111/demo-form.html';
  const previews=new Set(),documents=new Set();
  const frameworkHashes=new Map();
  const selections=[];
  for(const framework of ['react','vue']){
    await selectFramework(sidebar,framework);
    const selector=JSON.stringify('[data-od-id="browser-'+framework+'"]');
    const host='document.querySelector('+selector+')';
    const button='('+host+')?.shadowRoot?.querySelector("button")';
    for(let cycle=1;cycle<=20;cycle++){
      const address=base+'?native-free-framework='+framework+'&cycle='+cycle;
      const navigation=await website.session.call('Page.navigate',{url:address});
      assert.equal(navigation.errorText,undefined,'real Chrome must complete native navigation');
      await until(()=>website.session.read('location.href==='+JSON.stringify(address)+
        '&&document.readyState==="complete"'),framework+' new document '+cycle,20000);
      await until(()=>sidebar.read('document.querySelector("#script-current-page-url")?.textContent==='+
        JSON.stringify(address)+'&&document.querySelector("#page-preview-run")?.disabled===false'),
        framework+' original Sidebar target ready '+cycle,20000);
      const target=await sidebar.read('(async()=>{const tabs=await chrome.tabs.query({active:true,currentWindow:true});'+
        'if(tabs.length!==1)return null;const frames=await chrome.webNavigation.getAllFrames({tabId:tabs[0].id});'+
        'const frame=frames?.find(x=>x.frameId===0);return frame?{tabId:tabs[0].id,'+
        'documentId:frame.documentId,url:frame.url}:null})()');
      assert.equal(target?.url,address);
      assert.ok(target.documentId,'Chrome webNavigation supplies actual documentId');
      assert.equal(documents.has(target.documentId),false,'each Run MUST use a new actual documentId');
      documents.add(target.documentId);
      assert.equal(await website.session.read('!('+host+')'),true,'new document begins with no managed UI');
      await clickReal(sidebar,'document.querySelector("#page-preview-run")');
      const receipt=await until(async()=>{
        const state=await sidebar.read('(()=>{const e=document.querySelector("#page-preview-status");'+
          'return e?{state:e.dataset.state,text:e.textContent}:null})()');
        if(state?.state==='error')throw Error(framework+' cycle '+cycle+' failed: '+state.text);
        if(state?.state!=='completed')return null;
        const raw=await sidebar.read('document.querySelector("#page-preview-technical").textContent');
        let result;try{result=JSON.parse(raw);}catch{return null;}
        if(!result.managedPreviewId||previews.has(result.managedPreviewId))return null;
        return result;
      },framework+' actual Run receipt '+cycle,60000);
      assert.equal(receipt.state,'preview-evaluated');
      assert.equal(receipt.managedUI,true);
      assert.equal(receipt.authoring?.framework,framework);
      assert.equal(receipt.packagedFrameworkId,framework);
      assert.equal(receipt.tabId,target.tabId);
      assert.equal(receipt.documentId,target.documentId);
      assert.match(receipt.sourceHash,/^[a-f0-9]{64}$/);
      if(frameworkHashes.has(framework))
        assert.equal(receipt.sourceHash,frameworkHashes.get(framework),
          'the identical original component and page rules cannot silently drift');
      frameworkHashes.set(framework,receipt.sourceHash);
      if(cycle>=2)assert.equal(receipt.authoring?.cacheHit,true,
        'hot identical source graph should hit only its exact immutable compilation cache');
      assert.equal(previews.has(receipt.managedPreviewId),false,
        'one CDP button click is not a new Run without an original distinct previewId');
      previews.add(receipt.managedPreviewId);
      await until(()=>website.session.read('('+button+')?.textContent.includes("已点击 0 次")'),
        framework+' attached to real website '+cycle,15000);
      await clickReal(website.session,button);
      await until(()=>website.session.read('('+button+')?.textContent.includes("已点击 1 次")'),
        framework+' real pointer changed component state '+cycle,15000);
      if(cycle===1||cycle===20){
        const shot=await website.session.call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(output,'r243-no-native-'+framework+'-'+cycle+'.png'),
          Buffer.from(shot.data,'base64'));
      }
      await until(()=>sidebar.read('document.querySelector("#script-stop")?.disabled===false'),
        framework+' Stop must be enabled '+cycle,10000);
      await clickReal(sidebar,'document.querySelector("#script-stop")');
      const retired=await until(async()=>{
        const raw=await sidebar.read('document.querySelector("#page-preview-technical").textContent');
        let info;try{info=JSON.parse(raw);}catch{return null;}
        if(info.stop?.previewId!==receipt.managedPreviewId)return null;
        return info.stop;
      },framework+' original managed Stop receipt '+cycle,25000);
      assert.equal(retired.state,'preview-retired');
      assert.equal(retired.sourceHash,receipt.sourceHash);
      assert.equal(retired.receipt?.ok,true);
      assert.equal(retired.receipt?.scope,'managed-ui-only');
      await until(()=>website.session.read('!('+host+')&&'+
        'document.querySelectorAll("[data-opendesk-ui-owner]").length===0'),
        framework+' managed DOM retired '+cycle,15000);
      const evidence={name:'r243-browser-'+framework+'-native-free-independent-'+cycle,
        status:'PASS',framework,cycle,documentId:receipt.documentId,
        previewId:receipt.managedPreviewId,sourceHash:receipt.sourceHash,
        compilerCacheHit:receipt.authoring.cacheHit,sourceBytes:receipt.authoring.sourceBytes??null,
        stopReceipt:retired.receipt,actualPointerInput:true,domClean:true,noNative:true};
      report.tests.push(evidence);
      selections.push(evidence);
    }
  }
  assert.equal(selections.length,40);
  assert.equal(new Set(selections.map(x=>x.documentId)).size,40);
  assert.equal(new Set(selections.map(x=>x.previewId)).size,40);
  assert.equal(selections.filter(x=>x.framework==='react').length,20);
  assert.equal(selections.filter(x=>x.framework==='vue').length,20);
  assert.equal(selections.filter(x=>x.stopReceipt?.ok&&x.domClean&&x.actualPointerInput).length,40);
  report.tests.push({name:'r243-native-free-independent-cycle-summary',status:'PASS',
    react:20,vue:20,uniquePreviewIds:40,uniqueDocumentIds:40,
    originalUserScriptStopReceipts:40,allDOMClean:true,noNative:true});
}
