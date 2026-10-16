// Real Chromium smoke for the product-style ChatGPT fixture.
// Uses the original four Git-tracked XMind JS and the SAME product registry,
// not a second engine or an installed/real-chatgpt.com claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {startXmindPreview} from '../../examples/programs/chatgpt-mindmap/preview/serve.mjs';

const argv=process.argv.slice(2),args={};
for(let i=0;i<argv.length;i+=2){
  if(!argv[i]?.startsWith('--')||!argv[i+1])throw Error('Usage: --browser path --playwright module --out dir');
  args[argv[i].slice(2)]=argv[i+1];
}
for(const required of ['browser','playwright','out'])assert.ok(args[required],'Missing '+required);
const out=resolve(args.out);
await mkdir(out,{recursive:true});
const gitSha=process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const screenshots={gitSha,source:'LOCAL_CHATGPT_SIMULATION_ONLY',
  visualReview:'SCREENSHOT_NOT_VERIFIED',nativeInstalled:'NOT_TESTED',captures:[]};
const report={scope:'LOCAL_CHATGPT_SIMULATION_ONLY',nativeInstalled:'NOT_TESTED',
  loggedInChatGPT:'NOT_TESTED',productionStyleIsolation:'BLOCKED',
  engine:'ORIGINAL_FOUR_GIT_TRACKED_JS',externalRequests:[],errors:[],checks:[]};
let browser=null,session=null,success=false;
try{
  const {chromium}=await import(pathToFileURL(resolve(args.playwright)).href);
  browser=await chromium.launch({executablePath:resolve(args.browser),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  session=await startXmindPreview();
  const page=await browser.newPage({viewport:{width:1220,height:860}});
  const origin=new URL(session.url).origin;
  const capture=async(name,{target=page,fullPage=false,answer='ALL'}={})=>{
    // Capture after real rendered geometry has settled (not after a blind timer).
    await page.waitForFunction(()=>{
      return [...document.querySelectorAll('[data-opendesk-chatgpt-mindmap="viewer"]')]
        .every(host=>{
          if(host.dataset.ready!=='true'||host.dataset.layoutReady==='pending')return false;
          const canvas=host.shadowRoot?.querySelector('.odmm-canvas');
          return !!canvas&&canvas.dataset.fitReady==='true'&&
            (Number(canvas.dataset.fitWidth)===canvas.clientWidth||
              canvas.dataset.manualViewport==='true');
        });
    },null,{timeout:20000});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const file=join(out,name);
    await target.screenshot({path:file,fullPage});
    const bytes=await readFile(file);
    const observed=await page.evaluate(()=>{
      const topics={},views={};
      for(const [index,key] of [[1,'A'],[2,'B'],[3,'C']]){
        const host=document.querySelector('[data-testid="conversation-turn-'+index+'"] [data-opendesk-chatgpt-mindmap="viewer"]');
        if(!host){topics[key]=0;continue;}
        const root=host.shadowRoot;
        const nodes=[...root.querySelectorAll('.topic')];
        topics[key]=nodes.length;
        const canvas=root.querySelector('.odmm-canvas');
        const frame=canvas?.getBoundingClientRect();
        const topic=nodes[0]?.getBoundingClientRect();
        const toolbar=root.querySelector('.odmm-toolbar');
        const scroll=canvas?.querySelector('.workbook-item');
        views[key]={
          canvasWidth:canvas?.clientWidth??null,fitWidth:canvas?.dataset.fitWidth??null,
          fitReady:canvas?.dataset.fitReady??null,
          rootWidth:topic?.width??null,
          rootVisibleWidth:frame&&topic?Math.max(0,
            Math.min(frame.right,topic.right)-Math.max(frame.left,topic.left)):null,
          toolbarWidth:toolbar?.clientWidth??null,toolbarScrollWidth:toolbar?.scrollWidth??null,
          scrollerClientWidth:scroll?.clientWidth??null,
          scrollerScrollWidth:scroll?.scrollWidth??null,scrollerScrollLeft:scroll?.scrollLeft??null
        };
      }
      return {topics,geometry:{
        contentContainerWidth:document.getElementById('preview-conversation')?.getBoundingClientRect().width??null,
        documentScrollWidth:document.documentElement.scrollWidth,
        documentClientWidth:document.documentElement.clientWidth,views
      }};
    });
    screenshots.captures.push({
      gitSha,pageUrl:page.url(),pageType:'LOCAL_CHATGPT_SIMULATION_ONLY',
      chromiumVersion:browser.version(),viewport:page.viewportSize(),answer,
      topics:observed.topics,geometry:observed.geometry,
      pageErrors:report.errors.length,externalRequests:report.externalRequests.length,
      file,sha256:createHash('sha256').update(bytes).digest('hex'),
      screenshotTime:new Date().toISOString(),ciRunId:process.env.GITHUB_RUN_ID||null,
      ciArtifactId:null,visualReview:'SCREENSHOT_NOT_VERIFIED'
    });
  };
  await page.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/'))return route.continue();
    report.externalRequests.push(url);return route.abort();
  });
  page.on('pageerror',error=>report.errors.push(String(error.stack||error)));
  await page.goto(new URL('/chatgpt.html',session.url).href);
  await page.waitForFunction(()=>window.mindmapPreview?.sdk==='FIXED_RESOURCES_LOADED',
    null,{timeout:25000});
  const geometry=async n=>page.evaluate(n=>{
    const host=document.querySelector('[data-testid="conversation-turn-'+n+'"] [data-opendesk-chatgpt-mindmap="viewer"]');
    if(!host)return null;
    const canvas=host.shadowRoot.querySelector('.odmm-canvas');
    const frame=canvas.getBoundingClientRect();
    const nodes=[...host.shadowRoot.querySelectorAll('.topic')];
    const boxes=nodes.map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
    if(!boxes.length)return null;
    const root=boxes[0];
    const union={left:Math.min(...boxes.map(b=>b.left)),
      right:Math.max(...boxes.map(b=>b.right)),
      top:Math.min(...boxes.map(b=>b.top)),
      bottom:Math.max(...boxes.map(b=>b.bottom))};
    return {topicCount:boxes.length,canvas:{x:frame.x,y:frame.y,width:frame.width,height:frame.height},
      root:{x:root.x,width:root.width,visibleWidth:Math.max(0,Math.min(frame.right,root.right)-Math.max(frame.left,root.left))},
      union,overhangLeft:Math.max(0,frame.left-union.left),
      overhangRight:Math.max(0,union.right-frame.right),
      fitScrollOverhang:{left:canvas.dataset.fitOverhangLeft,right:canvas.dataset.fitOverhangRight},
      fitWidth:canvas.dataset.fitWidth};
  },n);
  const t=n=>page.locator('[data-testid="conversation-turn-'+n+'"]');
  const button=n=>t(n).locator('[data-opendesk-chatgpt-mindmap="button"] button');
  const viewer=n=>t(n).locator('[data-opendesk-chatgpt-mindmap="viewer"]');
  const count=await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count();
  assert.equal(count,3,'Product answer registry must auto-inject once per AI answer');
  assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="viewer"]').count(),0);
  const idA=await t(1).locator('[data-message-id]').getAttribute('data-message-id');
  const idB=await t(2).locator('[data-message-id]').getAttribute('data-message-id');
  assert.notEqual(idA,idB,'Same-title answers must remain different messages');
  assert.equal(await t(1).locator('h2').first().textContent(),
    await t(2).locator('h2').first().textContent(),'A/B fixture titles match');
  const originalA=await t(1).locator('.markdown').evaluate(node=>node.innerHTML);
  const originalC=await t(3).locator('.markdown').evaluate(node=>node.innerHTML);
  assert.equal(await t(3).locator('table').count(),1);
  assert.equal(await t(3).locator('pre code').count(),1);
  assert.equal(await t(3).locator('blockquote').count(),1);
  report.checks.push('THREE_AUTO_INJECTED_REAL_PRODUCT_BUTTONS','SAME_TITLE_SEPARATE_MESSAGE_IDS');
  report.createdBy='src/answer-registry.js';
  await capture('chatgpt-before.png',{fullPage:true});
  await button(1).click();
  await viewer(1).and(page.locator('[data-ready="true"]')).waitFor({timeout:20000});
  assert.equal(await button(1).isVisible(),false,
    'The answer toolbar trigger must hide when the viewer provides Return to original');
  report.topicsA=await viewer(1).locator('.topic:visible').count();
  assert.ok(report.topicsA>1,'XMind must render actual SDK topics');
  assert.equal(await t(1).locator('.markdown').isVisible(),false);
  await button(2).click();
  await viewer(2).and(page.locator('[data-ready="true"]')).waitFor({timeout:20000});
  report.topicsB=await viewer(2).locator('.topic:visible').count();
  assert.ok(report.topicsB>1);
  assert.ok(await viewer(1).locator('.topic:visible').count()>1,'A remains open while B opens');
  report.checks.push('REAL_XMIND_A_AND_B_INDEPENDENT');
  // Query the *computed* CSS inside the real product ShadowRoot. A container
  // cannot style itself via @container; the containing .odmm-shell must own it.
  report.desktopToolbar=await viewer(1).evaluate(host=>{
    const root=host.shadowRoot;
    const toolbar=root.querySelector('.odmm-toolbar');
    return {container:getComputedStyle(root.querySelector('.odmm-shell')).containerType,
      mobile:getComputedStyle(root.querySelector('.odmm-mobile-only')).display,
      desktop:getComputedStyle(root.querySelector('.odmm-desktop-only')).display,
      button:root.querySelector('.odmm-tool').getBoundingClientRect().width,
      client:toolbar.clientWidth,scroll:toolbar.scrollWidth};
  });
  assert.equal(report.desktopToolbar.container,'inline-size');
  assert.equal(report.desktopToolbar.mobile,'none');
  assert.notEqual(report.desktopToolbar.desktop,'none');
  assert.ok(report.desktopToolbar.button>=36);
  assert.ok(report.desktopToolbar.scroll<=report.desktopToolbar.client+1);
  await capture('chatgpt-xmind.png',{fullPage:true});
  await capture('chatgpt-answer-A-light.png',{target:t(1),answer:'A'});
  await capture('chatgpt-answer-B-light.png',{target:t(2),answer:'B'});
  report.desktopA=await geometry(1);
  report.desktopB=await geometry(2);
  assert.ok(report.desktopA?.root.visibleWidth>=Math.min(90,report.desktopA.root.width*.5),
    'A root topic must be visibly readable in the desktop reply');
  // When geometry CAN fit in the actual canvas, clipping is a fit regression.
  const aCanvas=report.desktopA.canvas.width;
  const aTopicWidth=report.desktopA.union.right-report.desktopA.union.left;
  if(aTopicWidth<=aCanvas-24)assert.ok(report.desktopA.overhangRight<=16&&
    report.desktopA.overhangLeft<=16,
    'A real SDK map fits geometrically but is clipped by the desktop viewport');
  report.checks.push('DESKTOP_A_REAL_TOPIC_GEOMETRY_AUDITED');
  const zoomWidth=async n=>(await viewer(n).locator('.topic:visible').first().boundingBox()).width;
  const aBeforeZoom=await zoomWidth(1);
  const bBeforeZoom=await zoomWidth(2);
  await viewer(1).getByRole('button',{name:'放大导图'}).click();
  await page.waitForFunction(({before})=>{
    const host=document.querySelector('[data-testid="conversation-turn-1"] [data-opendesk-chatgpt-mindmap="viewer"]');
    const topic=host?.shadowRoot?.querySelector('.topic');
    return !!topic&&topic.getBoundingClientRect().width>=before*1.07;
  },{before:aBeforeZoom},{timeout:15000});
  const aAfterZoom=await zoomWidth(1),bAfterZoom=await zoomWidth(2);
  assert.ok(aAfterZoom>aBeforeZoom*1.07,'A zoom changes its real SDK topic geometry');
  assert.ok(Math.abs(bAfterZoom-bBeforeZoom)<1.5,'A zoom must not mutate B zoom');
  report.zoom={aBeforeZoom,aAfterZoom,bBeforeZoom,bAfterZoom};
  report.checks.push('PER_ANSWER_XMIND_ZOOM_ISOLATION');
  const foldButton=viewer(1).locator('button[data-action="fold"]').first();
  await foldButton.click();
  await page.waitForFunction(()=>{
    const host=document.querySelector('[data-testid="conversation-turn-1"] [data-opendesk-chatgpt-mindmap="viewer"]');
    const button=host?.shadowRoot?.querySelector('button[data-action="fold"]');
    return button?.getAttribute('aria-label')==='展开所有分支'&&!button.disabled;
  },null,{timeout:20000});
  assert.ok(await viewer(2).locator('.topic:visible').count()>1);
  await foldButton.click();
  await page.waitForFunction(()=>{
    const host=document.querySelector('[data-testid="conversation-turn-1"] [data-opendesk-chatgpt-mindmap="viewer"]');
    const button=host?.shadowRoot?.querySelector('button[data-action="fold"]');
    return button?.getAttribute('aria-label')==='折叠所有分支'&&!button.disabled;
  },null,{timeout:20000});
  report.checks.push('PER_ANSWER_FOLD_AND_UNFOLD');
  await viewer(2).getByRole('button',{name:'进入全屏'}).click();
  await page.locator('[data-opendesk-chatgpt-mindmap="viewer"].odmm-fullscreen')
    .waitFor({timeout:12000});
  // The DOM class changes before the real SDK finishes its fit. Wait for
  // actual renderer completion before taking a visual acceptance screenshot.
  await page.locator('[data-opendesk-chatgpt-mindmap="viewer"].odmm-fullscreen[data-layout-ready="fullscreen"]')
    .waitFor({timeout:20000});
  report.fullBounds=await page.locator('[data-opendesk-chatgpt-mindmap="viewer"].odmm-fullscreen')
    .evaluate(host=>{
      const canvas=host.shadowRoot.querySelector('.odmm-canvas').getBoundingClientRect();
      const rects=[...host.shadowRoot.querySelectorAll('.topic')]
        .map(n=>n.getBoundingClientRect()).filter(r=>r.width&&r.height);
      return {canvasLeft:canvas.left,canvasRight:canvas.right,
        topicLeft:Math.min(...rects.map(r=>r.left)),
        topicRight:Math.max(...rects.map(r=>r.right))};
    });
  assert.ok(report.fullBounds.topicLeft>=report.fullBounds.canvasLeft-16&&
    report.fullBounds.topicRight<=report.fullBounds.canvasRight+16,
    'Fullscreen fit must not clip the real six-topic B workbook horizontally');
  report.checks.push('FULLSCREEN_REAL_SDK_FIT_COMPLETE_AND_VISIBLE');
  await capture('chatgpt-fullscreen.png',{fullPage:false});
  await page.keyboard.press('Escape');
  await page.locator('[data-opendesk-chatgpt-mindmap="viewer"].odmm-fullscreen')
    .waitFor({state:'detached',timeout:12000});
  assert.equal(await viewer(2).count(),1,'Fullscreen Escape must return to the original answer');
  await viewer(2).and(page.locator('[data-layout-ready="inline"]')).waitFor({timeout:20000});
  report.checks.push('NATIVE_FULLSCREEN_ESCAPE_RESTORES_POSITION');
  await viewer(1).getByRole('button',{name:'恢复本条回复原文'}).click();
  await viewer(1).waitFor({state:'detached',timeout:15000});
  assert.equal(await t(1).locator('.markdown').isVisible(),true);
  assert.equal(await button(1).isVisible(),true);
  assert.equal(await t(1).locator('.markdown').evaluate(node=>node.innerHTML),originalA,
    'The original answer HTML must retain identity and markup after view removal');
  assert.ok(await viewer(2).locator('.topic:visible').count()>1);
  await capture('chatgpt-original-restored.png',{target:t(1),answer:'A'});
  report.checks.push('RESTORE_A_DOES_NOT_CLOSE_B');
  await page.getByRole('button',{name:'切换模拟页面深浅色主题'}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await viewer(2).getAttribute('data-dark'),'true');
  await page.waitForFunction(()=>{
    const host=document.querySelector('[data-testid="conversation-turn-2"] [data-opendesk-chatgpt-mindmap="viewer"]');
    return host?.dataset.skinReady==='dark'&&!host.dataset.skinPending&&
      !!host.shadowRoot?.querySelector('.topic');
  },null,{timeout:20000});
  report.checks.push('DARK_MODE_PROPAGATES_TO_ORIGINAL_XMIND_WORKBOOK');
  await capture('chatgpt-answer-B-dark.png',{target:t(2),answer:'B'});
  // C intentionally has no heading: retain the rendered paragraph, table,
  // code and quotation semantics through the *same* product renderer.
  await button(3).click();
  await viewer(3).and(page.locator('[data-ready="true"]')).waitFor({timeout:20000});
  report.topicsC=await viewer(3).locator('.topic:visible').count();
  const cTopicText=(await viewer(3).locator('.topic').allTextContents()).join(' ');
  assert.match(cTopicText,/表格/);
  assert.match(cTopicText,/代码/);
  assert.match(cTopicText,/引用/);
  assert.ok(report.topicsC>=4,'C should contain real structured SDK topics');
  await capture('chatgpt-answer-C-structured.png',{target:t(3),answer:'C'});
  await viewer(3).getByRole('button',{name:'恢复本条回复原文'}).click();
  await viewer(3).waitFor({state:'detached',timeout:15000});
  assert.equal(await t(3).locator('.markdown').evaluate(node=>node.innerHTML),originalC);
  report.checks.push('HEADINGLESS_TABLE_CODE_QUOTE_REAL_TOPICS_AND_LOSSLESS_RESTORE');
  // Repeated open/close cycles must not accumulate viewers or inject buttons.
  for(let i=0;i<20;i++){
    await button(1).click();
    await viewer(1).and(page.locator('[data-ready="true"]')).waitFor({timeout:25000});
    await viewer(1).getByRole('button',{name:'恢复本条回复原文'}).click();
    await viewer(1).waitFor({state:'detached',timeout:20000});
    assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),3);
    assert.equal(await t(1).locator('.markdown').evaluate(node=>node.innerHTML),originalA);
  }
  assert.ok(await viewer(2).locator('.topic:visible').count()>1,
    'Twenty A cycles must not affect B');
  report.checks.push('TWENTY_OPEN_RESTORE_CYCLES_NO_ORPHAN_UI');
  await page.locator('#developer-lab summary').click();
  // React-like action-bar replacement must move—not duplicate—the real
  // button, and the mock copy/feedback behavior must remain delegated.
  await page.getByRole('button',{name:'重建 B 操作栏'}).click();
  await page.waitForFunction(()=>{
    const turn=document.querySelector('[data-testid="conversation-turn-2"]');
    return turn?.querySelector('.actions')?.nextElementSibling===
      turn?.querySelector('[data-opendesk-chatgpt-mindmap="button"]');
  },null,{timeout:12000});
  assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),3);
  await t(2).getByRole('button',{name:'Good response'}).click();
  assert.equal(await t(2).getByRole('button',{name:'Good response'}).getAttribute('aria-pressed'),'true');
  report.checks.push('REBUILT_ACTION_BAR_REUSES_PRODUCT_BUTTON');
  await page.getByRole('button',{name:'更新 B 回复正文'}).click();
  await viewer(2).getByText('原回复已更新，请刷新导图').waitFor({timeout:12000});
  assert.ok(await viewer(2).getByRole('button',{name:'重新读取本条回复'}).isVisible());
  report.checks.push('CONTENT_UPDATE_MARKS_ONLY_B_STALE');
  await page.getByRole('button',{name:'切换 320px 容器'}).click();
  await page.waitForFunction(()=>document.getElementById('preview-conversation').getBoundingClientRect().width<=321);
  report.narrowWidth=await page.locator('#preview-conversation').evaluate(node=>node.getBoundingClientRect().width);
  // A ResizeObserver fit is asynchronous. A topic's width can still reflect
  // the previous 619px canvas, so wait for the actual *new* fitted width.
  await page.waitForFunction(()=>{
    const host=document.querySelector('[data-testid="conversation-turn-2"] [data-opendesk-chatgpt-mindmap="viewer"]');
    const canvas=host?.shadowRoot?.querySelector('.odmm-canvas');
    return !!canvas&&canvas.dataset.fitReady==='true'&&
      Number(canvas.dataset.fitWidth)===canvas.clientWidth&&canvas.clientWidth<=320;
  },null,{timeout:25000});
  await page.waitForFunction(()=>{
    const host=document.querySelector('[data-testid="conversation-turn-2"] [data-opendesk-chatgpt-mindmap="viewer"]');
    return (host?.shadowRoot?.querySelector('.topic')?.getBoundingClientRect().width||0)>=115;
  },null,{timeout:20000});
  report.narrowRootWidth=(await viewer(2).locator('.topic').first().boundingBox()).width;
  report.narrowGeometry=await geometry(2);
  report.narrowScroller=await viewer(2).evaluate(host=>{
    const canvas=host.shadowRoot.querySelector('.odmm-canvas');
    return {fitReady:canvas.dataset.fitReady,fitWidth:canvas.dataset.fitWidth,
      width:canvas.clientWidth,manualViewport:canvas.dataset.manualViewport,
      candidates:[...canvas.querySelectorAll('.workbook-item,[class*=\"scroll\"],[class*=\"viewport\"]')]
        .filter(node=>node.clientWidth>0).slice(0,12).map(node=>({
          tag:node.tagName,className:String(node.className).slice(0,70),
          client:node.clientWidth,scroll:node.scrollWidth,left:node.scrollLeft}))};
  });
  assert.ok(report.narrowGeometry?.root.visibleWidth>=
    Math.min(48,report.narrowGeometry.root.width*.3),
    'At 320px, the actual root topic must be visible enough to understand: '+
    JSON.stringify({geometry:report.narrowGeometry,scroll:report.narrowScroller}));
  report.checks.push('MOBILE_320_ROOT_ACTUALLY_VISIBLE');
  report.narrowToolbar=await viewer(2).locator('.odmm-toolbar').evaluate(node=>({
    client:node.clientWidth,scroll:node.scrollWidth}));
  assert.ok(report.narrowToolbar.scroll<=report.narrowToolbar.client+1,
    'The real product toolbar must fit without overflow at 320px');
  report.narrowStyles=await viewer(2).evaluate(host=>{
    const root=host.shadowRoot,toolbar=root.querySelector('.odmm-toolbar');
    const mobile=root.querySelector('.odmm-mobile-only');
    return {container:getComputedStyle(root.querySelector('.odmm-shell')).containerType,
      toolbarGap:getComputedStyle(toolbar).gap,
      desktop:getComputedStyle(root.querySelector('.odmm-desktop-only')).display,
      mobile:getComputedStyle(mobile).display,
      button:root.querySelector('.odmm-tool').getBoundingClientRect().width};
  });
  assert.equal(report.narrowStyles.container,'inline-size');
  assert.equal(report.narrowStyles.toolbarGap,'2px');
  assert.equal(report.narrowStyles.desktop,'none');
  assert.equal(report.narrowStyles.mobile,'flex');
  assert.ok(report.narrowStyles.button>=44,'Every narrow icon needs a 44px target');
  const more=viewer(2).locator('.odmm-more');
  await more.focus();await page.keyboard.press('ArrowDown');
  assert.equal(await more.getAttribute('aria-expanded'),'true');
  assert.equal(await viewer(2).locator('.odmm-menu button:focus').count(),1);
  report.narrowMenuMetrics=await viewer(2).evaluate(host=>{
    const panel=host.shadowRoot.querySelector('.odmm-menu');
    return {width:panel.getBoundingClientRect().width,
      buttons:[...panel.querySelectorAll('button:not([hidden])')].map(el=>({
        label:el.getAttribute('aria-label'),width:el.getBoundingClientRect().width,
        height:el.getBoundingClientRect().height}))};
  });
  assert.ok(report.narrowMenuMetrics.buttons.every(item=>
    item.width>=report.narrowMenuMetrics.width-14&&item.height>=44),
  'Menu item text and focus must be inside an entire clickable row');
  const panHint=await viewer(2).evaluate(host=>getComputedStyle(
    host.shadowRoot.querySelector('.odmm-canvas'),'::after').content);
  assert.match(panHint,/左右拖动查看分支/);
  await page.keyboard.press('ArrowDown');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="refresh"]:focus').count(),1);
  await page.keyboard.press('Home');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="fold"]:focus').count(),1);
  await page.keyboard.press('End');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="refresh"]:focus').count(),1);
  await page.keyboard.press('ArrowUp');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="fold"]:focus').count(),1);
  await page.keyboard.press('ArrowDown');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="refresh"]:focus').count(),1);
  await page.keyboard.press('Home');
  await capture('chatgpt-narrow-320-menu.png',{target:viewer(2),answer:'B'});
  await page.keyboard.press('Escape');
  assert.equal(await more.getAttribute('aria-expanded'),'false');
  assert.equal(await more.evaluate(el=>el.shadowRoot?.activeElement===el||el.matches(':focus')) ,true);
  await more.focus();await page.keyboard.press('Enter');
  assert.equal(await more.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  await more.focus();await page.keyboard.press('Space');
  assert.equal(await more.getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  await more.click();
  assert.equal(await more.getAttribute('aria-expanded'),'true');
  await page.locator('.model-title').click();
  assert.equal(await more.getAttribute('aria-expanded'),'false');
  report.checks.push('NARROW_COMPUTED_CONTAINER_QUERY','MENU_KEYBOARD_ARROWS_HOME_ESCAPE_ENTER',
    'MENU_KEYBOARD_UP_END_SPACE_AND_OUTSIDE_DISMISS');
  const focusViewer=()=>viewer(2).evaluate(node=>{
    const transcript=node.closest('.transcript');
    if(transcript)transcript.scrollTop+=
      node.getBoundingClientRect().top-transcript.getBoundingClientRect().top-8;
  });
  await page.locator('#mock-action-status').waitFor({state:'hidden',timeout:5000});
  await page.locator('#developer-lab summary').click();
  await focusViewer();
  await capture('chatgpt-narrow-320.png',{fullPage:true});
  await viewer(2).screenshot({path:join(out,'chatgpt-answer-B-narrow-320.png')});
  await page.setViewportSize({width:320,height:760});
  await focusViewer();
  const mobile=await page.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth}));
  assert.ok(mobile.scrollWidth<=mobile.viewportWidth+1,
    '320px screen must never gain page-level horizontal scrolling');
  report.mobile=mobile;
  await capture('chatgpt-mobile-320.png',{fullPage:true});
  const getPan=()=>viewer(2).evaluate(host=>{
    const scroller=host.shadowRoot.querySelector('.workbook-item');
    return {left:scroller?.scrollLeft??null,extent:scroller?.scrollWidth??null,
      client:scroller?.clientWidth??null};
  });
  const beforePan=await getPan();
  await viewer(2).locator('.odmm-canvas').hover();
  await page.mouse.wheel(235,0);
  await page.waitForFunction(previous=>{
    const host=document.querySelector('[data-testid="conversation-turn-2"] [data-opendesk-chatgpt-mindmap="viewer"]');
    const scroller=host?.shadowRoot?.querySelector('.workbook-item');
    return scroller&&Math.abs(scroller.scrollLeft-previous)>10;
  },beforePan.left,{timeout:12000});
  report.mobilePan={before:beforePan,after:await getPan()};
  assert.ok(report.mobilePan.after.left>report.mobilePan.before.left+10,
    'Actual XMind scroller must reveal off-screen branches via horizontal wheel');
  await capture('chatgpt-mobile-320-panned.png',{fullPage:true});
  report.checks.push('MOBILE_REAL_XMIND_HORIZONTAL_BROWSE');
  await viewer(2).getByRole('button',{name:'适配导图画布'}).click();
  // The fixture controls live inside a <details> which we collapsed before
  // the mobile screenshots. Restore desktop viewport, reopen its controls,
  // then turn off the forced 320px mode before testing natural widths.
  await page.setViewportSize({width:1220,height:860});
  await page.locator('#developer-lab summary').click();
  await page.getByRole('button',{name:'切换 320px 容器'}).click();
  await page.locator('#developer-lab summary').click();
  await page.waitForFunction(()=>!document.getElementById('preview-conversation')
    ?.classList.contains('is-narrow'),null,{timeout:10000});
  report.responsive=[];
  for(const width of [375,390,400,440,768,1220,1440]){
    await page.setViewportSize({width,height:860});
    await page.waitForFunction(expected=>document.documentElement.clientWidth===expected,
      width,{timeout:10000});
    await page.waitForFunction(()=>{
      const host=document.querySelector('[data-testid="conversation-turn-2"] [data-opendesk-chatgpt-mindmap="viewer"]');
      const canvas=host?.shadowRoot?.querySelector('.odmm-canvas');
      return !!canvas&&canvas.dataset.fitReady==='true'&&
        Number(canvas.dataset.fitWidth)===canvas.clientWidth;
    },null,{timeout:25000});
    // Resizing preserves the transcript's previous scroll offset. Align
    // the real toolbar within the transcript before recording UX screenshots,
    // or a cropped toolbar produces misleading 400/440px visual evidence.
    await focusViewer();
    const toolbarVisible=await viewer(2).locator('.odmm-toolbar').evaluate(node=>{
      const frame=node.getBoundingClientRect();
      const viewport=document.querySelector('.transcript').getBoundingClientRect();
      return Math.max(0,Math.min(frame.bottom,viewport.bottom)-
        Math.max(frame.top,viewport.top));
    });
    assert.ok(toolbarVisible>=36,
      'Responsive toolbar must be visible in the captured viewport: '+width);
    const metrics=await viewer(2).evaluate(host=>{
      const root=host.shadowRoot;
      const canvas=root.querySelector('.odmm-canvas');
      const panel=document.getElementById('preview-conversation');
      const topic=root.querySelector('.topic')?.getBoundingClientRect();
      const rect=canvas.getBoundingClientRect();
      return {contentWidth:Math.round(panel.getBoundingClientRect().width),
        shellWidth:root.querySelector('.odmm-shell').getBoundingClientRect().width,
        canvasWidth:canvas.clientWidth,fitWidth:Number(canvas.dataset.fitWidth),
        desktop:getComputedStyle(root.querySelector('.odmm-desktop-only')).display,
        mobile:getComputedStyle(root.querySelector('.odmm-mobile-only')).display,
        visibleRootPx:topic?Math.max(0,Math.min(rect.right,topic.right)-
          Math.max(rect.left,topic.left)):0};
    });
    // @container follows actual shell width, not a browser-window breakpoint:
    // 400px still fits compact mode while 440px may use desktop controls.
    if(width>=768)assert.ok(metrics.contentWidth>390&&metrics.canvasWidth>390,
      'Wide viewport must contain a genuinely wide XMind canvas, not 320px');
    if(metrics.shellWidth>390){
      assert.notEqual(metrics.desktop,'none');
      assert.equal(metrics.mobile,'none');
    }else{
      assert.equal(metrics.desktop,'none');
      assert.equal(metrics.mobile,'flex');
    }
    assert.ok(metrics.visibleRootPx>48,'Responsive root must remain visible: '+width);
    const overflow=await page.evaluate(()=>({
      documentWidth:document.documentElement.scrollWidth,
      viewport:document.documentElement.clientWidth
    }));
    assert.ok(overflow.documentWidth<=overflow.viewport+1,
      'Viewport '+width+' must not overflow horizontally');
    report.responsive.push({viewport:width,toolbarVisible,...metrics,...overflow});
    await capture('chatgpt-responsive-'+width+'.png',{fullPage:true,answer:'B'});
    report.checks.push('RESPONSIVE_'+width+'_SCREEN_AND_CONTENT_LAYOUT');
  }
  report.checks.push('TRUE_320PX_CONTENT_CONTAINER','NARROW_TOOLBAR_WRAP',
    'NARROW_READABLE_XMIND_ZOOM','MOBILE_320_NO_OVERFLOW');
  await page.locator('#developer-lab summary').click();
  await page.getByRole('button',{name:'Stop 并检查残余样式'}).click();
  await page.waitForFunction(()=>window.mindmapPreview?.sdk==='STOPPED');
  report.stop=await page.evaluate(()=>window.mindmapPreview);
  assert.equal(report.stop.remainingOwnNodes,0,'Program-owned nodes must be removed after Stop');
  report.checks.push('STOP_RETIRES_OWNED_UI');
  report.styleIsolation=report.stop.styleIsolation;
  assert.equal(report.externalRequests.length,0,'No external requests from this fixture');
  assert.equal(report.errors.length,0,'No uncaught JavaScript errors');
  success=true;
  console.log('CHATGPT_MINDMAP_REAL_ENGINE_PREVIEW_PASS '+JSON.stringify({
    checks:report.checks,topicsA:report.topicsA,topicsB:report.topicsB,
    styleIsolation:report.styleIsolation,narrowWidth:report.narrowWidth}));
}finally{
  report.success=success;
  await writeFile(join(out,'chatgpt-result.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(out,'screenshot-evidence.json'),JSON.stringify(screenshots,null,2)+'\n');
  await browser?.close().catch(()=>{});
  await session?.close().catch(()=>{});
}
