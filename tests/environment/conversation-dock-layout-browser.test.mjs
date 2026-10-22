import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {renderSidebarFixture} from '../helpers/sidebar-react-fixture.mjs';

// RENDER_ONLY: real React/CSS in Chromium, with no model, SDK, installed
// extension or business writes. CSS viewport cases do not prove Mac SidePanel
// browser zoom/origin200 behavior. Opt in exactly like workflow-react-browser.
const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;
const repo=fileURLToPath(new URL('../../',import.meta.url));
const longDraft=Array.from({length:48},(_,i)=>`布局草稿 ${i+1}：保留输入并检查底部按钮，不执行任何业务。`).join('\n');
const sourcePaths=['src/ui/react/components/conversation.tsx',
  'src/ui/react/components/ui/button.tsx','src/ui/design-tokens.css',
  'src/ui/design-system.css','src/ui/tool-shell.css',
  'src/ui/react/components/conversation-dock.css'];

// Kept inline so this bounded regression owns no extra fixture or product hook.
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {TrustedConversationWorkspace} from './src/ui/react/components/conversation.tsx';
const review=new URLSearchParams(location.search).has('review');
const state=window.fixture={scope:'RENDER_ONLY',realAI:'NOT_TESTED',sdk:'NOT_TESTED',
  businessLoop:'NOT_TESTED',requests:0,cancels:0,aborts:0,inputEvents:[],clicks:[],pointers:[],session:null};
document.addEventListener('input',event=>{
  if(event.target.id==='od-conversation-input')state.inputEvents.push(event.isTrusted);
});
document.addEventListener('pointerdown',event=>{
  const button=event.target.closest('button');
  if(button)state.pointers.push({label:button.getAttribute('aria-label'),type:event.pointerType,trusted:event.isTrusted});
},true);
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(button)state.clicks.push({label:button.getAttribute('aria-label'),trusted:event.isTrusted});
},true);
let pendingSignal;
const controller={
  readSession:()=>({open:true,draft:'',needsReview:review,
    rows:Array.from({length:16},(_,i)=>({id:'render-'+i,speaker:'系统',
      message:'RENDER_ONLY 布局占位记录 '+i+'；没有调用模型、SDK 或执行业务。'}))}),
  saveSession:value=>{state.session=value;},
  request:()=>{throw Error('The render fixture must never dispatch a real request');},
  cancel:({signal})=>{state.cancels++;state.cancelledOriginal=signal===pendingSignal&&signal.aborted;}
};
function request({signal,event,onPhase}){
  state.requests++;state.requestTrusted=event.isTrusted;pendingSignal=signal;
  onPhase('observing');
  const pending=new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>{
      state.aborts++;reject(Object.assign(Error('RENDER_ONLY cancelled'),{code:'E_CANCELLED'}));
    },{once:true});
  });
  pending.catch(()=>{state.rejectionObserved=true;});
  return pending;
}
const root=createRoot(document.getElementById('root'));
root.render(<TrustedConversationWorkspace controller={controller} renderBusiness={bridge=>{
  bridge.adapterRef.current={request};
  return <div className="fixture-business">RENDER_ONLY business placeholder</div>;
}}/>);
window.unmount=()=>root.unmount();`;

async function settle(page){
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}

// Check the actual intersection with every clipping ancestor, not isVisible()
// alone (a clipped button is still considered visible by Playwright).
async function geometry(page,action){
  return page.evaluate(action=>{
    const rect=el=>{
      const {left,top,right,bottom,width,height}=el.getBoundingClientRect();
      return {left,top,right,bottom,width,height};
    };
    const inspect=selector=>{
      const el=document.querySelector(selector),box=rect(el);
      const clip={left:0,top:0,right:innerWidth,bottom:innerHeight},ancestors=[];
      for(let node=el.parentElement;node;node=node.parentElement){
        const css=getComputedStyle(node),r=node.getBoundingClientRect();
        const x=/^(auto|scroll|hidden|clip)$/.test(css.overflowX);
        const y=/^(auto|scroll|hidden|clip)$/.test(css.overflowY);
        if(x){clip.left=Math.max(clip.left,r.left+node.clientLeft);clip.right=Math.min(clip.right,r.left+node.clientLeft+node.clientWidth);}
        if(y){clip.top=Math.max(clip.top,r.top+node.clientTop);clip.bottom=Math.min(clip.bottom,r.top+node.clientTop+node.clientHeight);}
        if(x||y)ancestors.push({node:node.className||node.tagName,box:rect(node),x,y});
      }
      const x=box.left+box.width/2,y=box.top+box.height/2,hit=document.elementFromPoint(x,y);
      return {box,clip,ancestors,hit:hit===el||el.contains(hit)};
    };
    const input=document.querySelector('textarea'),log=document.querySelector('[role="log"]');
    const outer=['html','body','#root','.od-conversation-workspace','.od-conversation-business',
      '.od-conversation-dock','.od-conversation-composer'].map(selector=>{
      const el=document.querySelector(selector);
      return {selector,x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight,
        top:el.scrollTop,left:el.scrollLeft};
    });
    return {targets:Object.fromEntries(['textarea','.od-conversation-composer',action,
        ...(document.querySelector('.od-conversation-phase')?['.od-conversation-phase']:[]),
        ...(document.querySelector('.od-conversation-feedback')?['.od-conversation-feedback']:[])]
        .map(selector=>[selector,inspect(selector)])),outer,
      input:{height:input.clientHeight,scrollHeight:input.scrollHeight,overflow:getComputedStyle(input).overflowY},
      log:{height:log.clientHeight,scrollHeight:log.scrollHeight},
      dockHeight:document.querySelector('.od-conversation-dock').getBoundingClientRect().height,
      coarse:matchMedia('(pointer: coarse)').matches,compact:matchMedia('(max-height:520px)').matches};
  },action);
}

function assertGeometry(result,{coarse,compact,action}){
  assert.equal(result.coarse,coarse,'exercise the intended real pointer media query');
  assert.equal(result.compact,compact,'exercise the intended compact media query');
  if(compact)assert.equal(result.dockHeight,144,'exercise the compact Dock floor');
  for(const [selector,{box,clip,ancestors,hit}] of Object.entries(result.targets)){
    const detail=JSON.stringify({selector,box,clip,ancestors});
    assert.ok(box.width>0&&box.height>0,detail);
    assert.ok(box.left>=clip.left-1&&box.right<=clip.right+1&&
      box.top>=clip.top-1&&box.bottom<=clip.bottom+1,`clipped: ${detail}`);
    if(selector==='textarea'||selector===action)assert.equal(hit,true,`not hit-testable: ${detail}`);
  }
  const input=result.targets.textarea.box,button=result.targets[action].box;
  assert.ok(button.bottom<=input.bottom+1&&button.right<=input.right+1&&
    button.top>=input.top-1&&button.left>=input.left-1,'action remains inside input bounds');
  assert.ok(input.height>=(coarse?54:44)-1,'the textarea retains its usable minimum height');
  assert.ok(button.height>=(coarse?44:32)-1,'the action retains its pointer target');
  assert.match(result.input.overflow,/^(auto|scroll)$/,'long drafts remain internally scrollable');
  assert.ok(result.input.scrollHeight>result.input.height+20,'case actually has overflowing draft text');
  for(const outer of result.outer){
    assert.ok(outer.x<=1&&outer.y<=1,`unexpected outer/double scroll: ${JSON.stringify(outer)}`);
    assert.equal(outer.top,0,`outer scrolled: ${outer.selector}`);
    assert.equal(outer.left,0,`outer scrolled horizontally: ${outer.selector}`);
  }
}

test('Conversation Dock Chromium RENDER_ONLY: draft, busy Stop, clipping and independent scroll',
  {skip:modulePath?false:'NOT_TESTED: set OPENDESK_PLAYWRIGHT_MODULE to an existing Playwright module'},async t=>{
  const {chromium}=await import(modulePath);
  const before=await Promise.all(sourcePaths.map(path=>readFile(new URL(path,new URL('../../',import.meta.url)))));
  const hashes=before.map(bytes=>createHash('sha256').update(bytes).digest('hex'));
  const bundled=await build({stdin:{contents:entry,resolveDir:repo,sourcefile:'conversation-dock-render-only.tsx',loader:'tsx'},
    bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  const styles=before.slice(2).map(bytes=>bytes.toString()).join('\n');
  const headerMarkup=(await renderSidebarFixture()).match(/<div class="sidebar-tool-view-head[^]*?<\/div>/)?.[0];
  assert.ok(headerMarkup,'render the real ToolHost header for the compact layout regression');
  // Only the containing viewport and a non-business placeholder are fixture CSS.
  const frameCSS='html,body{height:100%;margin:0;overflow:hidden}body{font-family:system-ui}'+
    '.fixture-label{height:40px;box-sizing:border-box;padding:8px}#root{height:calc(100% - 40px);overflow:hidden}'+
    '.fixture-business{height:100%;overflow:hidden}';
  const server=createServer((request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname;
    response.setHeader('Content-Type',path==='/app.js'?'text/javascript':path==='/style.css'?'text/css':'text/html');
    response.end(path==='/app.js'?bundled.outputFiles[0].text:path==='/style.css'?styles+'\n'+frameCSS:
      path==='/header.html'?'<link rel="stylesheet" href="/style.css"><div id="header-case">'+headerMarkup+'</div>':
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
      '<link rel="stylesheet" href="/style.css"></head><body><div class="fixture-label">RENDER_ONLY · no model / SDK</div>'+
      '<div id="root"></div><script type="module" src="/app.js"></script></body></html>');
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  // launch() owns a fresh temporary profile; never connectOverCDP or touch an
  // existing Chrome, its profile, watcher, extension, or product build output.
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
    ...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?{executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  t.diagnostic(JSON.stringify({scope:'RENDER_ONLY',browser:browser.version(),platform:process.platform,
    nativeChrome:'NOT_TESTED',macSidePanelOrigin200:'NOT_TESTED',realAI:'NOT_TESTED',sdk:'NOT_TESTED',
    businessLoop:'NOT_TESTED',sourceHashes:Object.fromEntries(sourcePaths.map((path,i)=>[path,hashes[i]]))}));
  for(const compact of [true,false])for(const coarse of [false,true])for(const needsReview of [false,true]){
    await t.test(`${compact?'small viewport / 144px dock':'large viewport'} / ${coarse?'coarse':'fine'} / ${needsReview?'needsReview':'long draft + busy phase'}`,async t=>{
      const context=await browser.newContext({viewport:{width:420,height:compact?400:900},hasTouch:coarse,isMobile:false});
      t.after(()=>context.close());
      const page=await context.newPage(),errors=[];
      page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(10000);
      page.on('pageerror',error=>errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${server.address().port}/${needsReview?'?review=1':''}`);
      const input=page.getByRole('textbox',{name:'对话输入'}),send=page.getByRole('button',{name:'发送',exact:true});
      await input.fill(longDraft);
      await page.waitForFunction(value=>window.fixture.session?.draft===value,longDraft);
      await settle(page);
      const options={coarse,compact,action:'[aria-label="发送"]'};
      assertGeometry(await geometry(page,options.action),options);
      if(needsReview){
        assert.equal(await send.isDisabled(),true);
        await input.press('Enter');
        assert.equal(await input.inputValue(),longDraft);
        assert.equal(await page.evaluate(()=>window.fixture.requests),0,'review prevents dispatch');
        await page.getByLabel('对话状态详情').focus();
        await page.keyboard.press('End');
        await settle(page);
        assertGeometry(await geometry(page,options.action),options);
      }else{
        if(coarse)await send.tap();else await send.click();
        const stop=page.getByRole('button',{name:'停止对话',exact:true});await stop.waitFor();
        assert.match(await page.locator('.od-conversation-phase').innerText(),/正在查找并核对/);
        // Send clears the original draft. Real input during the pending request
        // is essential: an empty busy composer would miss the reported defect.
        await input.fill(longDraft);
        await page.waitForFunction(value=>window.fixture.session?.draft===value,longDraft);
        await settle(page);
        options.action='[aria-label="停止对话"]';
        assert.equal(await input.inputValue(),longDraft);
        assertGeometry(await geometry(page,options.action),options);
        // Both scroll areas may have content, but neither may move the shell.
        await input.click();await input.press('ControlOrMeta+A');await input.press('ArrowRight');
        await settle(page);
        assert.ok(await input.evaluate(el=>el.scrollTop)>0,'caret can reach the end of a long draft');
        const log=page.getByRole('log');
        const initialLogTop=await log.evaluate(el=>el.scrollTop);
        assert.ok(initialLogTop>0,'transcript has genuinely overflowing history');
        // Compact coarse layout may give the transcript no usable hit area;
        // in that case the input/Stop remain the priority, not a fabricated log hit.
        const logBox=await log.boundingBox();
        if(logBox?.height>30){
          await log.hover();await page.mouse.wheel(0,-10000);
          await page.waitForFunction(top=>document.querySelector('[role="log"]').scrollTop<top,initialLogTop);
          assert.ok(await input.evaluate(el=>el.scrollTop)>0,'transcript scrolling preserves draft scroll');
        }
        assertGeometry(await geometry(page,options.action),options);
        // Synchronous fixture rejection intentionally exercises the browser's
        // click default action when React reuses Stop's DOM button as Send.
        // This must never submit the queued draft after cancellation.
        if(coarse)await stop.tap();else await stop.click();
        assert.deepEqual(await page.evaluate(()=>({cancels:window.fixture.cancels,aborts:window.fixture.aborts,
          clicks:window.fixture.clicks.filter(click=>click.label==='停止对话').length})),
          {cancels:1,aborts:1,clicks:1},`Stop delivery; page errors: ${JSON.stringify(errors)}`);
        await settle(page);
        assert.deepEqual(errors,[],'Stop promise must settle without browser exceptions');
        await stop.waitFor({state:'detached'});
        await page.waitForFunction(()=>window.fixture.cancels===1&&window.fixture.aborts===1);
        assert.equal(await page.locator('.od-conversation-phase').count(),0,'busy phase ends after Stop');
        assert.deepEqual(await page.evaluate(()=>({requests:window.fixture.requests,
          trusted:window.fixture.requestTrusted,original:window.fixture.cancelledOriginal})),
          {requests:1,trusted:true,original:true});
        assert.equal(await input.inputValue(),longDraft,'Stop preserves the newly typed unsent draft');
        assert.ok(await page.evaluate(()=>window.fixture.clicks.some(click=>click.label==='停止对话'&&click.trusted)),
          'Stop was a trusted browser click');
        if(coarse)assert.ok(await page.evaluate(()=>window.fixture.pointers.some(pointer=>
          pointer.label==='停止对话'&&pointer.type==='touch'&&pointer.trusted)),
          'coarse Stop was a real touch tap, not a mouse or synthetic click');
        await settle(page);options.action='[aria-label="发送"]';
        assert.equal(await page.evaluate(()=>window.fixture.requests),1,'Stop cannot auto-submit the queued draft');
        assert.equal(await page.evaluate(()=>window.fixture.session.draft),longDraft,'saved queued draft is unchanged');
        assertGeometry(await geometry(page,options.action),options);
      }
      assert.ok(await page.evaluate(()=>window.fixture.inputEvents.length>0&&window.fixture.inputEvents.every(Boolean)),
        'draft changes came through trusted browser input events');
      await page.evaluate(()=>window.unmount());assert.deepEqual(errors,[]);
    });
  }
  for(const width of [180,240])for(const coarse of [false,true]){
    await t.test(`real ToolHost header / ${width}px / ${coarse?'coarse':'fine'}`,async t=>{
      const context=await browser.newContext({viewport:{width,height:407},hasTouch:coarse,isMobile:false});
      t.after(()=>context.close());const page=await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/header.html`);
      const rects=await page.evaluate(()=>{
        const frame=document.querySelector('#header-case');frame.style.width='calc(100% - 18px)';
        const head=frame.querySelector('.sidebar-tool-view-head');
        for(const button of head.querySelectorAll('button'))button.hidden=!['sidebar-tool-back',
          'sidebar-tool-primary-action','sidebar-tool-settings-open','sidebar-tool-remove'].includes(button.id);
        const title=head.querySelector('#sidebar-tool-title');title.textContent='书签管理';
        const back=head.querySelector('#sidebar-tool-back');
        return {head:head.getBoundingClientRect().toJSON(),title:title.getBoundingClientRect().toJSON(),
          back:back.getBoundingClientRect().toJSON()};
      });
      assert.ok(rects.title.top<rects.back.bottom,'title must share the back-button row');
      assert.ok(rects.head.height<=rects.back.height*2+10,'compact header must fit two rows');
      assert.ok(rects.title.right<=rects.head.right+.6,'title stays inside the header');
      t.diagnostic(JSON.stringify({scope:'RENDER_ONLY',width,coarse,rects}));
    });
  }
  // Shared-main edits invalidate this run rather than silently claiming to have
  // tested source bytes that changed while Chromium was running.
  for(let i=0;i<sourcePaths.length;i++)assert.equal(createHash('sha256').update(
    await readFile(new URL(sourcePaths[i],new URL('../../',import.meta.url)))).digest('hex'),hashes[i],
    `NOT_TESTED: input changed during render regression: ${sourcePaths[i]}`);
});
