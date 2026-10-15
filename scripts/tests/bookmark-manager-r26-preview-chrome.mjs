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
  q('bm-keep-draft').click();
  check(q('bm-name').value==='未保存且必须保护的草稿','continue editing');
  q('bm-list').querySelector('.bm-entry').click();
  await wait(()=>!q('bm-draft-guard').hidden,'second switch guard');
  q('bm-discard-switch').click();
  await wait(()=>q('bm-form-view').hidden&&q('bm-inspector-title').textContent.includes('0001'),
    'explicitly abandon draft and select new bookmark');
  q('bm-inspector-move').click();
  await wait(()=>!q('bm-form-view').hidden,'move inside same inspector');
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
  diagnostic('模拟撤销权限');q('bm-refresh').click();
  await wait(()=>!q('bm-gate').hidden&&q('bm-workspace').hidden,
    'revocation clears private workspace');
  check(q('bm-name').value===''&&q('bm-list').children.length===0,
    'no draft or private tree remains on permission loss');
  return {mode,initial:2159,inlineEdit:true,selectedAfterSave:true,cancel:true,
    dirtyGuard:true,searchableMove:true,saveFailure:true,conflict:true,
    outcomeUnknown:true,revocation:true,overflow:false,
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
    reports.push({...report,sourceCommit:built.sourceCommit,
      designSha256:built.designSha256,uiSha256:built.uiSha256});
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
