// Feed to ego-browser nodejs after setting globalThis.mindmapUi = { space, page,
// indices: [0, 1, 2], site: 'deepseek', sample: 'deepseek-1',
// installation: {catalogPage, extensionId, programId, revision, sourceHash} }.
// catalogPage is the managed readback tab belonging to the bound OpenDesk install.
// For loopback only, use fixture: true in place of installation. Never logs reply text.
(async()=>{
  const assert=(await import('node:assert/strict')).default;
  await globalThis.mindmapUiReady;
  const {space,page:label,indices=[0,1,2,3],cycles=2,fixture=false,site='deepseek',expectFailure=false,
    receipt,sample=label,installation}=globalThis.mindmapUi;
  const emit=async result=>{
    const line=JSON.stringify({site,sample,...result});
    if(receipt)await (await import('node:fs/promises')).appendFile(receipt,line+'\n');
    console.log(line);
  };
  const task=await taskSpace(space),page=task.page(label);
  const url=new URL(await page.url());
  const origin={chatgpt:'https://chatgpt.com',deepseek:'https://chat.deepseek.com',gemini:'https://gemini.google.com'}[site];
  assert.ok(origin,'an internal adapter site is required');
  if(fixture)assert.equal(url.hostname,'127.0.0.1');
  else{
    assert.equal(url.origin,origin);
    assert.ok(/^[a-z0-9_-]+$/i.test(sample),'use a redacted sample alias');
    assert.ok(installation?.catalogPage&&/^[a-p]{32}$/.test(installation.extensionId)&&
      ['app.ai-reply-mindmap','opendesk.ai-reply-mindmap'].includes(installation.programId)&&
      Number.isSafeInteger(installation.revision)&&installation.revision>0&&
      /^[a-f0-9]{64}$/.test(installation.sourceHash),'real UI checks require the installed candidate identity');
    const catalogUrl=new URL(await task.page(installation.catalogPage).url());
    assert.ok(catalogUrl.protocol==='chrome-extension:'&&catalogUrl.hostname===installation.extensionId,
      'readback tab must belong to the selected OpenDesk extension');
  }
  await page.cdp('Page.bringToFront');
  const trigger='[data-opendesk-chatgpt-mindmap="button"]';
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let documentId;
  async function readInstallation(marker=null){
    const {catalogPage,...expected}=installation;
    const targetId=(await task.tabs()).find(tab=>tab.label===label)?.targetId;
    assert.ok(targetId,'managed reply tab must have an exact browser target');
    const result=await task.page(catalogPage).evaluate(async ({targetId,expected,origin,marker})=>{
      if(chrome.runtime.id!==expected.extensionId)return {exactTarget:false};
      const target=(await chrome.debugger.getTargets()).find(t=>t.id===targetId);
      if(!Number.isSafeInteger(target?.tabId))return {exactTarget:false};
      const tab=await chrome.tabs.get(target.tabId);
      if(tab.incognito||new URL(tab.url).origin!==origin)return {exactTarget:false};
      const frames=await chrome.webNavigation.getAllFrames({tabId:tab.id});
      const top=frames?.find(f=>f.frameId===0&&f.documentLifecycle==='active'&&!f.errorOccurred&&f.url===tab.url);
      if(!top)return {exactTarget:false};
      const hostPermission=await chrome.permissions.contains({origins:[origin+'/*']});
      const {opendeskPagePreviewWorldsD1:ledger=[]}=await chrome.storage.session.get('opendeskPagePreviewWorldsD1');
      const programs=ledger.filter(row=>row.tabId===tab.id&&row.documentId===top.documentId&&row.installed)
        .map(({installed})=>installed);
      const matching=programs.filter(p=>p.programId===expected.programId&&p.revision===expected.revision&&
        p.sourceHash===expected.sourceHash&&p.state==='evaluated');
      const child=marker&&frames.find(f=>f.parentFrameId===0&&f.parentDocumentId===top.documentId&&
        f.documentLifecycle==='active'&&!f.errorOccurred&&f.url==='about:blank#'+marker);
      const claimants=child?programs.flatMap(p=>(p.frames||[]).filter(f=>f.frameId===child.frameId&&
        f.documentId===child.documentId&&'opendesk-'+f.requestId===marker&&f.state==='evaluated'&&
        f.resourceId==='xmind-runtime'&&f.receipt?.state==='evaluated'&&f.receipt.parentDocumentId===top.documentId&&
        f.receipt.documentId===child.documentId&&f.receipt.resourceSha256===f.resourceSha256&&
        f.receipt.programId===p.programId&&f.receipt.revision===p.revision&&f.receipt.sourceHash===p.sourceHash)
        .map(()=>p)):[];
      const frameOwner=claimants.length===1&&claimants[0]===matching[0];
      const current=await chrome.webNavigation.getFrame({tabId:tab.id,frameId:0});
      const sameTop=current?.documentId===top.documentId&&current.documentLifecycle==='active';
      return {exactTarget:sameTop,hostPermission,documentId:top.documentId,
        program:matching.length===1?expected:null,frameOwner:marker?frameOwner:null,
        observed:programs.filter(p=>['app.ai-reply-mindmap','opendesk.ai-reply-mindmap'].includes(p.programId))
          .map(({programId,revision,sourceHash,state})=>({programId,revision,sourceHash,state}))};
    },{targetId,expected,origin,marker});
    const {documentId:currentDocument,...publicResult}=result;
    const sameDocument=!!currentDocument&&(!documentId||currentDocument===documentId);
    if(result.exactTarget&&!documentId)documentId=currentDocument;
    return {...publicResult,sameDocument};
  }
  const mountDeadline=Date.now()+12000;
  let count;
  do{
    count=await page.evaluate(selector=>document.querySelectorAll(selector).length,trigger);
    if(count>Math.max(...indices))break;
    await delay(100);
  }while(Date.now()<mountDeadline);
  const runtime=fixture?null:await readInstallation().catch(()=>({exactTarget:false,readbackUnavailable:true}));
  const runtimeReady=fixture||(runtime.exactTarget&&runtime.sameDocument&&runtime.hostPermission&&runtime.program);
  if(count<=Math.max(...indices)||!runtimeReady){
    for(const index of indices)await emit({index,pass:false,cycles:[],
      phase:count<=Math.max(...indices)?'trigger-discovery':'installed-runtime',triggers:count,runtime,
      reason:count<=Math.max(...indices)?'the requested reply triggers must be mounted':
        'the expected candidate is not confirmed in the active document'});
    process.exitCode=1;
    return;
  }
  await page.cdp('egoAutomated.disable');
  await page.cdp('Runtime.enable');
  const diagnostics=async()=> (await page.events()).flatMap(e=>{
    if(e.method!=='Runtime.consoleAPICalled'||e.params?.args?.[0]?.value!=='[OpenDesk ChatGPT Mindmap]')return [];
    try{
      const {error,program}=JSON.parse(e.params.args[1].value);
      return [{stage:error.stage,code:error.code,revision:program.revision,
        contextInvalidated:error.message?.includes('Extension context invalidated')||false}];
    }catch{return [];}
  });
  const read=(index,operation='read',action='')=>page.evaluate(({trigger,index,operation,action,site})=>{
    const entries=globalThis.__odmmUiEntries??(globalThis.__odmmUiEntries=new Map());
    if(operation==='bind'){
      const host=document.querySelectorAll(trigger)[index];
      let turn,body;
      if(site==='chatgpt'){
        turn=host?.closest('[data-talvt-turn-state],[data-testid^="conversation-turn-"],article');
        const root=turn?.querySelector('[data-content-search-unit-key$=":assistant"],[data-message-author-role="assistant"],[data-message-role="assistant"]');
        body=root?.matches('[data-content-search-unit-key$=":assistant"]')?
          [...root.children].find(el=>el.tagName==='DIV'&&el.querySelector('[data-d-component],[data-markdown-text-style="assistant-message"]')):
          root?.querySelector('.markdown,.prose,[data-testid="message-content"],[data-assistant-markdown-root]');
      }else if(site==='gemini'){
        turn=host?.closest('model-response');
        body=turn?.querySelector('message-content .markdown');
      }else{
        turn=host?.parentElement;
        while(turn&&!turn.matches('.ds-virtual-list--printable')&&
          !turn.querySelector('.ds-assistant-message-main-content'))turn=turn.parentElement;
        body=turn?.querySelector('.ds-assistant-message-main-content');
      }
      entries.set(index,{turn,body,text:body?.textContent,aria:body?.getAttribute('aria-hidden'),
        display:body&&getComputedStyle(body).display,style:body?.getAttribute('style'),
        title:body?.querySelector('h2')?.textContent});
    }
    const entry=entries.get(index);
    const {turn,body}=entry??{};
    if(operation==='matches'){
      const compact=s=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
      const original=compact(entry.text);
      return action.some(label=>{const s=compact(label);return s.length>=Math.min(4,original.length)&&s.length>0&&original.includes(s);});
    }
    const host=turn?.querySelector(trigger);
    const triggerButton=host?.shadowRoot?.querySelector('.odmm-trigger');
    const viewer=[...turn?.querySelectorAll('[data-opendesk-chatgpt-mindmap="viewer"]')||[]].find(v=>!v.hidden);
    const frame=viewer?.shadowRoot?.querySelector('iframe');
    const lookup={
      open:triggerButton,close:viewer?.shadowRoot?.querySelector('[data-action="original"]'),
      zoom:viewer?.shadowRoot?.querySelector('[data-action="zoom-in"]')
    };
    if(operation==='pointer')return entry.pointer??null;
    const point=button=>{
      if(!button||button.disabled)return null;
      const root=button.getRootNode(),{x,y,width,height}=button.getBoundingClientRect();
      const at=[x+width/2,y+height/2];
      return width>0&&height>0&&document.elementFromPoint(...at)===root.host&&
        root.elementFromPoint(...at)?.closest('button')===button?at:null;
    };
    if(operation==='scroll'&&!point(lookup[action])){
      lookup[action]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      return true;
    }
    if(operation==='arm'){
      const button=lookup[action],at=point(button);
      if(!at)return null;
      entry.pointer=null;
      document.addEventListener('click',event=>{
        entry.pointer={trusted:event.isTrusted,matched:event.composedPath().includes(button)};
      },{capture:true,once:true,signal:AbortSignal.timeout(2500)});
      return at;
    }
    const failure=turn?.querySelector('[data-opendesk-chatgpt-mindmap="failure"]');
    const fr=frame?.getBoundingClientRect();
    const br=body?.getBoundingClientRect();
    return {buttons:document.querySelectorAll(trigger).length,replyButtons:turn?.querySelectorAll(trigger).length,
      visible:!!viewer&&!viewer.hidden&&viewer.getBoundingClientRect().height>0,
      failure:!!failure,refreshAdvice:failure?.shadowRoot?.textContent.includes('刷新此网页')??false,
      enabled:!!triggerButton&&!triggerButton.disabled,removed:!turn?.querySelector('[data-opendesk-chatgpt-mindmap="viewer"]'),
      pressed:triggerButton?.getAttribute('aria-pressed')==='true',ready:viewer?.dataset.ready==='true',
      frame:frame?.getAttribute('src')?.split('#')[1]||viewer?.dataset.fixtureView||null,
      frameVisible:!!fr&&fr.width>0&&fr.height>0&&fr.bottom>0&&fr.top<innerHeight,
      originalInViewport:!!br&&br.width>0&&br.height>0&&br.bottom>0&&br.top<innerHeight,
      sameBody:!!body?.isConnected&&turn?.contains(body),sameText:!!body&&entry?.text===body.textContent,
      restored:!!body?.isConnected&&entry.display!=='none'&&getComputedStyle(body).display===entry.display&&
        body.getAttribute('style')===entry.style&&body.getAttribute('aria-hidden')===entry.aria,
      fixtureTitle:operation==='bind'&&location.hostname==='127.0.0.1'?entry.title:null,
      concealed:body?.getAttribute('aria-hidden')==='true',
      point:point(lookup[action])};
  },{trigger,index,operation,action,site});
  const bound=new Map();
  await page.evaluate(()=>{delete globalThis.__odmmUiEntries;});
  for(const index of indices)bound.set(index,await read(index,'bind'));
  async function click(index,action){
    if(await read(index,'scroll',action)===true)await delay(250);
    const until=Date.now()+2200;
    do{
      const point=await read(index,'arm',action);
      if(point){
        await page.mouse.click(...point,{label:
          {open:'Open reply mind map',close:'Return to original reply',zoom:'Zoom in on map'}[action]});
        const pointer=await read(index,'pointer');
        assert.ok(pointer?.trusted&&pointer.matched,action+' did not deliver a trusted click to the selected button');
        return;
      }
      await delay(60);
    }while(Date.now()<until);
    throw Error(action+' button did not receive a pointer hit');
  }
  async function waitFor(index,predicate,ms){
    const until=Date.now()+ms;
    let state;
    do{
      state=await read(index);
      if(predicate(state))break;
      await delay(100);
    }while(Date.now()<until);
    return state;
  }
  const mapState=(fixtureMarker=null)=>{
    const root=fixtureMarker?document.querySelector('[data-fixture-view="'+fixtureMarker+'"]').shadowRoot:document;
    const topics=[...root.querySelectorAll('.topic')];
    const boxes=topics.map(t=>t.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
    const labels=topics.flatMap(t=>[t.textContent,t.getAttribute('aria-label'),
      ...[...t.querySelectorAll('text,tspan,title,[aria-label],foreignObject,[data-text],[title]')]
        .map(n=>n.getAttribute('aria-label')||n.getAttribute('data-text')||n.getAttribute('title')||n.textContent)]).filter(Boolean);
    return {topics:boxes.length,width:boxes.length?Math.max(...boxes.map(r=>r.width)):0,labels};
  };
  async function readMap(marker){
    if(fixture)return page.evaluate(mapState,marker);
    const {frameTree}=await page.cdp('Page.getFrameTree');
    const find=node=>node.frame.urlFragment==='#'+marker?node:(node.childFrames||[]).map(find).find(Boolean);
    const target=find(frameTree);
    assert.ok(target,'the mounted frame must have its own runtime');
    const {executionContextId}=await page.cdp('Page.createIsolatedWorld',{
      frameId:target.frame.id,worldName:'odmm-ui-readback'});
    return (await page.cdp('Runtime.evaluate',{contextId:executionContextId,
      expression:'('+mapState.toString()+')()',returnByValue:true})).result.value;
  }
  const closedState=s=>s.restored&&s.sameBody&&s.sameText&&s.removed&&!s.pressed&&s.enabled&&s.replyButtons===1;
  for(const index of indices){
    let outcome={index,cycles:[],...(runtime?{runtime}:{})};
    try{
      if(expectFailure&&index===indices[0]){
        await click(index,'open');
        const failed=await waitFor(index,s=>s.failure&&closedState(s),5000);
        assert.ok(failed.failure&&failed.refreshAdvice&&closedState(failed),'failed startup restores original and offers refresh');
        outcome.failureRecovered=true;
      }
      for(let i=0;i<cycles;i++){
        const row={};outcome.cycles.push(row);
        const before=await waitFor(index,closedState,6000);
        assert.ok(closedState(before),'one active trigger and an intact original before opening');
        row.uniqueTrigger=true;
        const start=Date.now();let visible=false,now;
        await click(index,'open');
        do{
          now=await read(index);
          if(now.visible)visible=true;
          row.sawOverlay=visible;
          assert.ok(!now.failure,'viewer reported a render failure');
          assert.ok(!visible||now.visible,'viewer disappeared without a close click');
          assert.ok(visible||Date.now()-start<3500,'click did not open a viewer');
          if(now.ready)break;
          await delay(100);
        }while(Date.now()-start<72000);
        row.binding={ready:now.ready,visible:now.visible,pressed:now.pressed,
          concealed:now.concealed,sameBody:now.sameBody,frame:!!now.frame};
        assert.ok(Object.values(row.binding).every(Boolean),'matching reply opens a ready frame');
        row.readyMs=Date.now()-start;
        const original=await readMap(now.frame);assert.ok(original.topics>0,'real XMind topics must render');
        row.topics=original.topics;
        const title=bound.get(index).fixtureTitle;
        row.replyMatch=fixture?!!title&&original.labels.some(label=>label.includes(title)):
          await read(index,'matches',original.labels);
        assert.ok(row.replyMatch,'rendered topics match the selected reply');
        await click(index,'zoom');
        const until=Date.now()+5000;
        do{
          const after=await read(index);
          assert.ok(after.visible&&after.ready&&after.frame===now.frame,'the same frame stays open during interaction');
          const map=await readMap(now.frame);
          if(map.width>original.width+0.5){row.zoom=true;break;}
          await delay(120);
        }while(Date.now()<until);
        assert.ok(row.zoom,'zoom changes rendered topic scale');
        const stableStart=Date.now();
        do{
          const current=await read(index);
          assert.ok(current.visible&&current.ready&&current.frame===now.frame&&
            (fixture||current.frameVisible),'viewer stays visible until explicitly closed');
          row.stableMs=Date.now()-stableStart;
          if(row.stableMs>=2000)break;
          await delay(120);
        }while(true);
        if(!fixture){
          row.runtime=await readInstallation(now.frame).catch(()=>({exactTarget:false,readbackUnavailable:true}));
          assert.ok(row.runtime.exactTarget&&row.runtime.sameDocument&&row.runtime.hostPermission&&
            row.runtime.program&&row.runtime.frameOwner,'the visible XMind frame must be owned by the installed candidate');
        }
        await click(index,'close');
        const closed=await waitFor(index,s=>closedState(s)&&(fixture||s.originalInViewport),6000);
        row.restored=closedState(closed);
        assert.ok(row.restored,'close restores the same original and keeps one trigger');
        row.originalInViewport=closed.originalInViewport;
        if(!fixture)assert.ok(row.originalInViewport,'close returns the original reply to the viewport');
      }
      outcome.pass=true;
    }catch(error){
      const {buttons,replyButtons,sameBody,removed,visible,ready,failure}=await read(index);
      outcome={...outcome,pass:false,reason:error.message.split(String.fromCharCode(10))[0],
        state:{buttons,replyButtons,sameBody,removed,visible,ready,failure}};process.exitCode=1;
      if(visible)await click(index,'close').catch(()=>{});
    }
    outcome.diagnostics=await diagnostics();
    await emit(outcome);
  }
  await page.evaluate(()=>{delete globalThis.__odmmUiEntries;});
})().catch(error=>{console.error(error.message.split(String.fromCharCode(10))[0]);process.exitCode=1;});
