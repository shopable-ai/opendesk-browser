#!/usr/bin/env node
// R2.6 real headless Chrome INTERACTIVE MOCK preview. Not an installed/native extension pass.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildPreview} from '../preview/build-preview.mjs';

const out=resolve(process.argv[2]||'artifacts/preview-chrome');
await mkdir(out,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'bm-r26-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--no-first-run','--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map(),contexts=new Map(),network=[],exceptions=[];
let socket,seq=0;
function cdp(method,params={},sessionId=null){
  return new Promise((ok,fail)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method))},25000);
    pending.set(id,{ok(value){clearTimeout(timer);ok(value)},fail(error){clearTimeout(timer);fail(error)}});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
async function connect(){
  let port=0;
  for(let i=0;i<110;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+chrome.exitCode);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break}catch{}
    await delay(100);
  }
  assert.ok(port,'Chrome debugging port must be accessible');
  const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=pages.find(item=>item.type==='page');
  assert.ok(page?.webSocketDebuggerUrl,'Chrome page target');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const row=JSON.parse(event.data),session=row.sessionId||null;
    if(row.id&&pending.has(row.id)){
      const done=pending.get(row.id);pending.delete(row.id);
      if(row.error)done.fail(Error(row.error.message));else done.ok(row.result);
    }
    if(row.method==='Runtime.executionContextCreated'){
      const ctx=row.params.context;
      contexts.set((session||'root')+':'+ctx.id,{contextId:ctx.id,session});
    }
    if(row.method==='Runtime.executionContextDestroyed')
      contexts.delete((session||'root')+':'+row.params.executionContextId);
    if(row.method==='Runtime.executionContextsCleared')
      for(const key of contexts.keys())if(key.startsWith((session||'root')+':'))contexts.delete(key);
    if(row.method==='Target.attachedToTarget'){
      const nested=row.params.sessionId;
      void Promise.all([cdp('Runtime.enable',{},nested),cdp('Network.enable',{},nested)])
        .catch(error=>exceptions.push('Nested context '+error.message));
    }
    if(row.method==='Network.requestWillBeSent'&&/^https?:/i.test(row.params.request?.url||''))
      network.push(row.params.request.url);
    if(row.method==='Runtime.exceptionThrown')
      exceptions.push(row.params.exceptionDetails?.exception?.description||
        row.params.exceptionDetails?.text||'Script exception');
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
}
async function evaluate(expr,ctx){
  const response=await cdp('Runtime.evaluate',{expression:expr,
    contextId:ctx.contextId,returnByValue:true,awaitPromise:true},ctx.session);
  if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||
    response.exceptionDetails.text||'Sandbox evaluation exception');
  return response.result?.value;
}
async function findFrame(){
  for(let i=0;i<130;i++){
    for(const ctx of [...contexts.values()]){
      try{
        if(await evaluate("Boolean(document.readyState==='complete'&&globalThis.OpenDeskTool&&globalThis.OpenDeskSDK&&globalThis.BookmarkR2Service&&document.getElementById('bm-list')&&document.getElementById('bm-inspector'))",ctx))
          return ctx;
      }catch{/* Context retired during navigation */}
    }
    await delay(70);
  }
  throw Error('Bookmark preview iframe execution context not found');
}
async function exercise(mode){
  const q=id=>document.getElementById(id);
  const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
  const wait=async(fn,label)=>{
    for(let i=0;i<140;i++){if(fn())return;await sleep(65)}
    throw Error('UI wait failed: '+label+'; notice='+q('bm-notice')?.textContent+'; gate='+q('bm-gate-reason')?.textContent+'; total='+q('bm-total')?.textContent+'; workspaceHidden='+q('bm-workspace')?.hidden+'; scripts='+document.scripts.length+'; sdk='+typeof globalThis.OpenDeskSDK+'; tool='+typeof globalThis.OpenDeskTool+'; service='+typeof globalThis.BookmarkR2Service+'; state='+document.readyState+'; formValid='+q('bm-form')?.checkValidity()+'; name='+q('bm-name')?.validationMessage+'; url='+q('bm-url')?.validationMessage+'; parent='+q('bm-parent')?.value+'/'+q('bm-parent')?.options?.length+'/'+q('bm-parent')?.validationMessage+'; formError='+q('bm-form-error')?.textContent);
  };
  const check=(condition,label)=>{if(!condition)throw Error('UI assertion: '+label)};
  const field=(id,value)=>{
    const el=q(id);el.value=value;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const submit=()=>q('bm-save').click();
  const diagnostic=label=>{
    const match=[...document.querySelectorAll('details button')].find(x=>x.textContent===label);
    check(Boolean(match),'Mock diagnostic '+label);match.click();
  };
  await wait(()=>!q('bm-workspace').hidden,'initial tree is loaded');
  check(q('bm-total').textContent.includes('2,159'),'whole authorized 2159-node tree');
  check(document.documentElement.scrollWidth<=innerWidth+1,'no outer horizontal overflow');
  field('bm-search','模拟书签 2152');
  await wait(()=>[...q('bm-list').querySelectorAll('.bm-entry')].some(x=>x.textContent.includes('2152')),
    'find last bookmark among 2159');
  const last=[...q('bm-list').querySelectorAll('.bm-entry')].find(x=>x.textContent.includes('2152'));
  last.click();
  await wait(()=>!q('bm-inspector').hidden&&q('bm-inspector-title').textContent.includes('2152'),
    'select -> immediate detail');
  check(q('bm-inspector').parentElement.id===(mode==='narrow'?'bm-list':'bm-workspace'),
    mode+' inspector is near selection without changing pages');
  q('bm-inspector-edit').click();
  await wait(()=>!q('bm-form-view').hidden,'same inspector switches read to edit');
  check(!q('bm-explorer').hidden,'tree never disappears on edit');
  check(!q('bm-parent-row').open,'ordinary edit initially hides the tall folder picker');
  check(q('bm-parent-summary').textContent.includes('所在文件夹：'),
    'collapsed editor shows the current directory as an accessible disclosure');
  field('bm-name','模拟书签 2152 · 已编辑');
  field('bm-url','https://example.org/updated-2152');
  check(q('bm-search').value==='模拟书签 2152','search context stays while typing');
  submit();
  await wait(()=>q('bm-form-view').hidden&&
    q('bm-inspector-title').textContent==='模拟书签 2152 · 已编辑','confirmed readback save');
  check(q('bm-inspector-url').textContent==='https://example.org/updated-2152',
    'list and detail reflect confirmed URL');
  check(q('bm-search').value==='模拟书签 2152','search retained after save');
  check([...q('bm-list').querySelectorAll('.bm-entry')].some(x=>
    x.textContent.includes('2152 · 已编辑')&&x.getAttribute('aria-current')==='true'),
    'selected row and renamed title retained');
  q('bm-inspector-edit').click();
  await wait(()=>!q('bm-form-view').hidden,'editing second time');
  field('bm-name','这条草稿必须取消');
  q('bm-cancel').click();
  await wait(()=>q('bm-form-view').hidden,'cancel returns directly to read');
  check(q('bm-inspector-title').textContent==='模拟书签 2152 · 已编辑',
    'cancel never writes');
  if(mode==='wide')return {mode,initial:2159,inlineEdit:true,selectedAfterSave:true,cancel:true,
    overflow:false,source:'production-source-bound-mock'};
  q('bm-inspector-edit').click();
  field('bm-name','未保存且必须保护的草稿');
  field('bm-search','模拟书签 0001');
  await wait(()=>[...q('bm-list').querySelectorAll('.bm-entry')].some(x=>
    x.textContent.includes('0001')),'second search');
  q('bm-list').querySelector('.bm-entry').click();
  await wait(()=>!q('bm-draft-guard').hidden,'protect dirty switch');
  check(q('bm-name').value==='未保存且必须保护的草稿','dirty input survives switch attempt');
  q('bm-keep-draft').focus();
  q('bm-keep-draft').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  check(q('bm-draft-guard').hidden&&document.activeElement===q('bm-name'),
    'Escape dismisses switch request and returns keyboard focus to draft');
  q('bm-list').querySelector('.bm-entry').click();
  await wait(()=>!q('bm-draft-guard').hidden,'switch guard reopened after Escape');
  q('bm-keep-draft').click();
  check(q('bm-name').value==='未保存且必须保护的草稿','continue editing');
  q('bm-list').querySelector('.bm-entry').click();
  await wait(()=>!q('bm-draft-guard').hidden,'second switch guard');
  q('bm-discard-switch').click();
  await wait(()=>q('bm-form-view').hidden&&q('bm-inspector-title').textContent.includes('0001'),
    'explicitly abandon draft and select new bookmark');
  q('bm-inspector-move').click();
  await wait(()=>!q('bm-form-view').hidden,'move inside same inspector');
  check(q('bm-parent-row').open,'explicit move exposes folder search immediately');
  field('bm-folder-query','产品研究');
  await wait(()=>[...q('bm-parent').options].some(x=>x.value==='11'),'searchable folder path');
  q('bm-parent').value='11';q('bm-parent').dispatchEvent(new Event('change',{bubbles:true}));
  submit();
  await wait(()=>q('bm-form-view').hidden&&q('bm-inspector-parent').textContent.includes('产品研究'),
    'confirmed move and refreshed directory');
  q('bm-inspector-edit').click();
  await wait(()=>!q('bm-form-view').hidden,'begin failure scenario');
  field('bm-name','模拟首次失败然后保存成功');
  diagnostic('下一次写入失败');submit();
  await wait(()=>q('bm-notice').textContent.includes('模拟保存失败'),'explicit save failure');
  check(q('bm-name').value==='模拟首次失败然后保存成功'&&!q('bm-save').disabled,
    'failed save retains draft and allows explicit retry');
  submit();
  await wait(()=>q('bm-form-view').hidden&&
    q('bm-inspector-title').textContent==='模拟首次失败然后保存成功',
    'user-triggered retry after definite failure');
  q('bm-inspector-edit').click();
  field('bm-name','审阅外部修改后继续编辑');
  diagnostic('模拟外部冲突');submit();
  await wait(()=>!q('bm-conflict-review').hidden,'external update rejection');
  check(q('bm-name').value==='审阅外部修改后继续编辑','conflict preserves draft');
  q('bm-review').click();
  await wait(()=>!q('bm-adopt').hidden,'fresh external version review');
  check(q('bm-conflict-summary').textContent.includes('另一窗口修改'),
    'review shows the external version');
  q('bm-adopt').click();
  check(q('bm-name').value==='审阅外部修改后继续编辑','explicit rebase preserves draft');
  submit();
  await wait(()=>q('bm-form-view').hidden&&
    q('bm-inspector-title').textContent==='审阅外部修改后继续编辑',
    'explicit post-review save');
  q('bm-inspector-edit').click();
  field('bm-name','未知结果不自动重试');
  diagnostic('下一次写入结果未知');submit();
  await wait(()=>q('bm-save').disabled&&q('bm-notice').textContent.includes('未知'),
    'unknown write outcome locks submit');
  check(q('bm-name').value==='未知结果不自动重试','unknown outcome retains draft');
  q('bm-cancel').click();
  // R2.7: a transient read error must not destroy an authorized in-progress
  // editor, whereas revocation must still clear the entire workspace.
  q('bm-inspector-edit').click();
  field('bm-name','刷新超时后保留的草稿');
  diagnostic('下一次读取超时');q('bm-refresh').click();
  await wait(()=>q('bm-notice').textContent.includes('刷新暂时失败'),
    'transient refresh failure is non-destructive');
  check(!q('bm-form-view').hidden&&q('bm-name').value==='刷新超时后保留的草稿',
    'failed read preserves typed draft and editor');
  check(!q('bm-refresh').disabled,'refresh is re-enabled after transient failure');
  q('bm-cancel').click();
  // More than 120 folders: filtering must retain a selected path even after
  // the query is cleared and the selected option lies beyond the DOM budget.
  diagnostic('新增 130 个模拟文件夹');q('bm-refresh').click();
  await wait(()=>q('bm-total').textContent.includes('2,289'),
    '130 additional folders available after refresh');
  q('bm-inspector-move').click();
  field('bm-folder-query','性能文件夹 0130');
  await wait(()=>[...q('bm-parent').options].some(x=>x.textContent.includes('0130')),
    'deep folder is searchable');
  const farFolder=[...q('bm-parent').options].find(x=>x.textContent.includes('0130')).value;
  field('bm-parent',farFolder);
  field('bm-folder-query','');
  check(q('bm-parent').value===farFolder&&
    [...q('bm-parent').options].some(x=>x.value===farFolder),
    'selected folder beyond first 120 stays selectable');
  check(q('bm-parent').options.length<=121,'target folder DOM remains bounded');
  q('bm-cancel').click();
  field('bm-search','');
  const firstToggle=q('bm-list').querySelector('.bm-toggle');
  check(Boolean(firstToggle),'expanded folder has a keyboard toggle');
  firstToggle.focus();firstToggle.click();
  check(document.activeElement?.classList?.contains('bm-toggle')&&
    document.activeElement?.getAttribute('aria-expanded')!==null,
    'keyboard focus survives list rebuild after toggle');
  field('bm-search','这条搜索不会匹配新书签');
  q('bm-new-bookmark').click();
  await wait(()=>!q('bm-form-view').hidden,'new bookmark stays inline');
  check(q('bm-parent-row').open,'create requires the destination to stay visible');
  field('bm-name','R2.7 新建流程书签');
  field('bm-url','https://example.org/r27-create');
  submit();
  await wait(()=>q('bm-form-view').hidden&&
    q('bm-inspector-title').textContent==='R2.7 新建流程书签',
    'new bookmark SDK readback selects created ID');
  check(q('bm-search').value==='这条搜索不会匹配新书签'&&
    q('bm-notice').textContent.includes('当前搜索未匹配'),
    'creation preserves search and explains hidden row');
  field('bm-search','');
  q('bm-new-folder').click();
  await wait(()=>!q('bm-form-view').hidden,'new folder stays inline');
  field('bm-name','R2.7 新建文件夹');submit();
  await wait(()=>q('bm-form-view').hidden&&
    q('bm-inspector-title').textContent==='R2.7 新建文件夹',
    'new folder SDK readback selects created ID');
  field('bm-search','R2.7 新建流程书签');
  await wait(()=>[...q('bm-list').querySelectorAll('.bm-entry')].some(x=>
    x.textContent.includes('R2.7 新建流程书签')),'find created bookmark');
  [...q('bm-list').querySelectorAll('.bm-entry')].find(x=>
    x.textContent.includes('R2.7 新建流程书签')).click();
  q('bm-inspector-edit').click();
  check(!q('bm-parent-row').open,'folder chooser is collapsed again in a fresh edit');
  const folderSummary=q('bm-parent-row').querySelector('summary');
  const nativeEnter=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
  check(folderSummary.dispatchEvent(nativeEnter)&&!nativeEnter.defaultPrevented,
    'Enter on the disclosure is not hijacked as Save by the form handler');
  folderSummary.click();
  check(q('bm-parent-row').open,'disclosure can be expanded with a real click');
  field('bm-parent','10');
  field('bm-name','R2.7 新建流程书签 · 组合编辑');
  submit();
  await wait(()=>q('bm-form-view').hidden&&
    q('bm-inspector-title').textContent.includes('组合编辑')&&
    q('bm-inspector-parent').textContent.includes('设计资料'),
    'combined edit and move require both Host-safe SDK steps and native readback');
  q('bm-inspector-edit').click();
  field('bm-name','外部删除后仍需保留的草稿');
  diagnostic('模拟外部删除当前书签');q('bm-refresh').click();
  await wait(()=>q('bm-save').disabled&&q('bm-form-error').textContent.includes('已在其他窗口删除'),
    'external delete does not silently discard draft');
  check(!q('bm-form-view').hidden&&q('bm-name').value==='外部删除后仍需保留的草稿',
    'external delete keeps read-only draft available for copying');
  q('bm-cancel').click();
  diagnostic('模拟撤销权限');q('bm-refresh').click();
  await wait(()=>!q('bm-gate').hidden&&q('bm-workspace').hidden,
    'revocation clears private workspace');
  check(q('bm-name').value===''&&q('bm-list').children.length===0,
    'no draft or private tree remains on permission loss');
  return {mode,initial:2159,inlineEdit:true,selectedAfterSave:true,cancel:true,
    dirtyGuard:true,searchableMove:true,saveFailure:true,conflict:true,
    outcomeUnknown:true,transientRefresh:true,folderLimit:true,createBookmark:true,
    createFolder:true,compactEdit:true,combinedEditMove:true,keyboardFocus:true,
    externalDeleteDraft:true,revocation:true,overflow:false,
    source:'production-source-bound-mock'};
}
try{
  await connect();
  const reports=[];
  for(const [mode,width] of [['narrow',360],['wide',960]]){
    const built=await buildPreview({tool:'bookmark-manager',scenario:'success',
      theme:'light',surface:'side-panel',width,height:760});
    contexts.clear();network.length=0;exceptions.length=0;
    await cdp('Emulation.setDeviceMetricsOverride',{
      width:Math.max(1100,width+70),height:980,deviceScaleFactor:1,mobile:false
    });
    await cdp('Page.navigate',{url:pathToFileURL(built.output).href});
    const ctx=await findFrame();
    const report=await evaluate('('+exercise.toString()+')('+JSON.stringify(mode)+')',ctx);
    assert.ok(report?.inlineEdit&&report?.selectedAfterSave);
    assert.deepEqual(network,[],'preview must not make real network requests');
    assert.deepEqual(exceptions,[],'preview must not throw unhandled errors');
    const screenshot=await cdp('Page.captureScreenshot',{format:'png'});
    await writeFile(join(out,'bookmark-r26-'+mode+'.png'),
      Buffer.from(screenshot.data,'base64'));
    // Capture actual production-sourced HTML in read, edit and conflict states.
    // The preceding end-state screenshot can be a revoked gate, not a useful UI
    // design review. Visuals remain clearly marked as installed:false / Mock.
    contexts.clear();
    await cdp('Page.navigate',{url:pathToFileURL(built.output).href});
    const visualCtx=await findFrame();
    const visualRead=await evaluate(`(async()=>{
      const q=id=>document.getElementById(id);
      for(let i=0;i<160&&q('bm-workspace').hidden;i++)
        await new Promise(done=>setTimeout(done,65));
      if(q('bm-workspace').hidden)throw Error('visual bookmark tree did not load');
      const search=q('bm-search');
      search.value='OpenDesk 产品资料';
      search.dispatchEvent(new Event('input',{bubbles:true}));
      const row=[...q('bm-list').querySelectorAll('.bm-entry')].find(el=>
        el.textContent.includes('OpenDesk 产品资料'));
      if(!row)throw Error('visual sample bookmark missing');
      row.click();
      return {detailsVisible:!q('bm-inspector-read').hidden,
        listVisible:!q('bm-explorer').hidden};
    })()`,visualCtx);
    assert.ok(visualRead?.detailsVisible&&visualRead?.listVisible,
      'visual read state uses same source as real editor');
    const shots=[];
    const capture=async state=>{
      const filename='bookmark-r27-'+mode+'-'+state+'.png';
      const image=await cdp('Page.captureScreenshot',{format:'png'});
      await writeFile(join(out,filename),Buffer.from(image.data,'base64'));
      shots.push(filename);
    };
    await capture('details');
    const visualEdit=await evaluate(`(()=>{
      const q=id=>document.getElementById(id);
      q('bm-inspector-edit').click();
      const name=q('bm-name');
      name.value='OpenDesk 产品资料 · 正在原位编辑';
      name.dispatchEvent(new Event('input',{bubbles:true}));
      return {editing:!q('bm-form-view').hidden,
        explorer:!q('bm-explorer').hidden,compact:!q('bm-parent-row').open,
        dirty:name.value.includes('正在原位编辑')};
    })()`,visualCtx);
    assert.ok(visualEdit?.editing&&visualEdit?.explorer&&visualEdit?.dirty&&
      visualEdit?.compact,'visual edit stays compact until folder change is requested');
    await capture('editing');
    const visualConflict=await evaluate(`(async()=>{
      const q=id=>document.getElementById(id);
      const diagnostic=[...document.querySelectorAll('details button')].find(x=>
        x.textContent==='模拟外部冲突');
      if(!diagnostic)throw Error('visual conflict diagnostic missing');
      diagnostic.click();q('bm-save').click();
      for(let i=0;i<160&&q('bm-conflict-review').hidden;i++)
        await new Promise(done=>setTimeout(done,65));
      return !q('bm-conflict-review').hidden&&!q('bm-form-view').hidden;
    })()`,visualCtx);
    assert.ok(visualConflict,'visual conflict must be visible with draft preserved');
    await capture('conflict');
    assert.deepEqual(network,[],'visual review must remain fully offline');
    assert.deepEqual(exceptions,[],'visual review must not throw');
    reports.push({...report,sourceCommit:built.sourceCommit,
      designSha256:built.designSha256,uiSha256:built.uiSha256,
      visualEvidence:shots});
  }
  await writeFile(join(out,'bookmark-r26-interaction.json'),
    JSON.stringify({status:'MOCK_BROWSER_INTERACTION_PASS_NOT_INSTALLED',cases:reports},null,2)+'\n');
  console.log('MOCK_BROWSER_INTERACTION_PASS_NOT_INSTALLED '+reports.length+' viewports');
}catch(error){
  console.error('MOCK_BROWSER_INTERACTION_FAIL '+error.stack+'; chromeExceptions='+JSON.stringify(exceptions.map(s=>s.slice(0,240)))+'; network='+JSON.stringify(network));
  process.exitCode=1;
}finally{
  if(socket)socket.close();
  chrome.kill('SIGTERM');
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
