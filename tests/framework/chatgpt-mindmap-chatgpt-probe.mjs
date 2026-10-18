// Real Chromium smoke for the product-style ChatGPT fixture.
// Uses the original four Git-tracked XMind JS and the SAME product registry,
// not a second engine or an installed/real-chatgpt.com claim.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
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
// Independent expectations transcribed from the fixed chatgpt.html fixture,
// never obtained from the extractor/converter under test. Heading promotion
// moves its paragraphs to the root note and retains A's leading paragraph.
const expected={
  A:[
    {title:'功能实施计划',depth:0,note:'把一条回复里的标题、列表和段落转换为层级主题，同时完整保留用户原文。'},
    {title:'这套功能的目标很明确：只需安装一次，就能在 ChatGPT 的每条 AI 回复中打开独立的思维导图。',depth:1,note:''},
    {title:'核心体验',depth:1,note:''},
    {title:'回复操作栏自动出现「思维导图」按钮',depth:2,note:''},
    {title:'使用原始 XMind 引擎绘制主题和连接线',depth:2,note:''},
    {title:'缩放与画布适配',depth:3,note:''},
    {title:'分支折叠与展开',depth:3,note:''},
    {title:'退出导图后恢复本条原文',depth:2,note:''},
    {title:'安全与稳定性',depth:1,note:'按回复分配独立控制器；禁用、页面导航时终止程序，并在正式产品中确保第三方引擎样式隔离。'}
  ],
  B:[
    {title:'功能实施计划',depth:0,note:'可以。这是第二条回复，虽然标题与第一条相同，但导图状态必须完全独立。\n当回复内容更新时，提示刷新该条导图，不使用另一条回复的状态。'},
    {title:'独立的内容节点身份',depth:1,note:''},
    {title:'独立缩放和滚动位置',depth:1,note:''},
    {title:'独立折叠状态',depth:1,note:''},
    {title:'单独恢复原文，不影响其他回复',depth:1,note:''}
  ]
};
const expectedOutline={
  A:'# 功能实施计划\n'+
    '> 把一条回复里的标题、列表和段落转换为层级主题，同时完整保留用户原文。\n'+
    '- 这套功能的目标很明确：只需安装一次，就能在 ChatGPT 的每条 AI 回复中打开独立的思维导图。\n'+
    '- 核心体验\n'+
    '  - 回复操作栏自动出现「思维导图」按钮\n'+
    '  - 使用原始 XMind 引擎绘制主题和连接线\n'+
    '    - 缩放与画布适配\n'+
    '    - 分支折叠与展开\n'+
    '  - 退出导图后恢复本条原文\n'+
    '- 安全与稳定性\n'+
    '  > 按回复分配独立控制器；禁用、页面导航时终止程序，并在正式产品中确保第三方引擎样式隔离。\n',
  B:'# 功能实施计划\n'+
    '> 可以。这是第二条回复，虽然标题与第一条相同，但导图状态必须完全独立。\n'+
    '> 当回复内容更新时，提示刷新该条导图，不使用另一条回复的状态。\n'+
    '- 独立的内容节点身份\n- 独立缩放和滚动位置\n- 独立折叠状态\n'+
    '- 单独恢复原文，不影响其他回复\n'
};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const project=resolve('examples/programs/chatgpt-mindmap');
const sourcePaths=[resolve('tests/framework/chatgpt-mindmap-chatgpt-probe.mjs'),
  join(project,'assets/ui.css')];
for(const directory of ['src','preview'])for(const file of await readdir(join(project,directory)))
  if(directory==='src'?file.endsWith('.js'):/\.(?:html|js|css)$/.test(file))
    sourcePaths.push(join(project,directory,file));
sourcePaths.sort();
const fingerprint=()=>Promise.all(sourcePaths.map(async path=>{
  const bytes=await readFile(path);return {path,bytes:bytes.length,sha256:sha256(bytes)};
}));
report.sourcesBefore=await fingerprint();
await writeFile(join(out,'fixture-expectations.json'),JSON.stringify({expected,expectedOutline},null,2)+'\n');
await writeFile(join(out,'chatgpt-fixture.html'),await readFile(
  resolve('examples/programs/chatgpt-mindmap/preview/chatgpt.html')));
let browser=null,session=null,success=false;
try{
  const {chromium}=await import(pathToFileURL(resolve(args.playwright)).href);
  browser=await chromium.launch({executablePath:resolve(args.browser),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  session=await startXmindPreview();
  report.chromiumVersion=browser.version();
  report.browserExecutable=resolve(args.browser);report.playwrightModule=resolve(args.playwright);
  report.startedAt=new Date().toISOString();
  const page=await browser.newPage({viewport:{width:1220,height:860},acceptDownloads:true});
  report.downloadEvents=[];
  page.on('download',download=>report.downloadEvents.push({
    filename:download.suggestedFilename(),url:download.url(),time:new Date().toISOString()}));
  // Read-only browser test instrumentation. Observe the renderer's REAL
  // Canvas pixels before the product intentionally fails E_XMIND_PNG_BLANK.
  // No synthetic topics, alternate drawing or production diagnostics.
  await page.addInitScript(()=>{
    // Observe real Blob URL/anchor/timer ownership without changing results,
    // deadlines, renderer input or export completion ordering.
    const resources={urls:[],anchors:[],timers:[]};
    window.__odmmDownloadResources=resources;
    const createURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL;
    URL.createObjectURL=function(blob){
      const url=createURL.call(this,blob);
      resources.urls.push({url,type:blob?.type,size:blob?.size,created:performance.now(),revoked:null});
      return url;
    };
    URL.revokeObjectURL=function(url){
      for(const item of resources.urls)if(item.url===url)item.revoked=performance.now();
      return revokeURL.call(this,url);
    };
    const click=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      if(this.download)resources.anchors.push({url:this.href,filename:this.download,time:performance.now()});
      return click.call(this);
    };
    const set=window.setTimeout,clear=window.clearTimeout;
    window.setTimeout=function(callback,delay,...args){
      if(delay!==30000||!new Error().stack?.includes('/src/view.js'))
        return set.call(this,callback,delay,...args);
      const item={id:null,delay,created:performance.now(),state:'pending'};
      item.id=set.call(this,function(...values){item.state='fired';return callback.apply(this,values);},delay,...args);
      resources.timers.push(item);return item.id;
    };
    window.clearTimeout=function(id){
      for(const item of resources.timers)if(item.id===id&&item.state==='pending')item.state='cleared';
      return clear.call(this,id);
    };
    const originalSerialize=XMLSerializer.prototype.serializeToString;
    XMLSerializer.prototype.serializeToString=function(node){
      if(window.__odmmCaptureProbe===true&&node?.querySelector?.('.topic')){
        const root=node.querySelector('.topic');
        const originalStage=[...document.body.children].find(el=>
          el.style?.left==='-100000px');
        const originalTopic=originalStage?.querySelector('.topic');
        const cssSummary=el=>{
          const style=el?.style;
          return {tag:el?.tagName||null,classes:String(el?.className||'').slice(0,100),
            left:style?.left,top:style?.top,transform:style?.transform,
            translate:style?.translate,width:style?.width,height:style?.height,
            position:style?.position,overflow:style?.overflow,
            opacity:style?.opacity,display:style?.display};
        };
        const chain=[];let cursor=root;
        while(cursor&&cursor!==node&&chain.length<18){
          chain.push(cssSummary(cursor));cursor=cursor.parentElement;
        }
        const stageBounds=originalStage?.getBoundingClientRect();
        const real=originalTopic?.getBoundingClientRect();
        const offset=new DOMMatrixReadOnly(node.style.transform);
        const semantics=root=>({
          topics:[...root.querySelectorAll('.topic')].map(topic=>topic.textContent),
          text:[...root.querySelectorAll('text,tspan,foreignObject')].map(el=>el.textContent),
          paths:[...root.querySelectorAll('path')].map(el=>el.getAttribute('d'))
        });
        const sourceElements=[originalStage,...originalStage.querySelectorAll('*')];
        const cloneStage=node.firstElementChild;
        const cloneElements=[cloneStage,...cloneStage.querySelectorAll('*')];
        const unexpectedHides=[];
        for(let i=0;i<sourceElements.length;i++){
          const source=sourceElements[i],clone=cloneElements[i];
          if(clone?.style.display==='none'&&getComputedStyle(source).display!=='none'&&
            !clone.matches('.icon-information,.collapseextend [data-name="action-area"]'))
            unexpectedHides.push({index:i,tag:clone.tagName,classes:clone.getAttribute('class')});
        }
        const cloneAudit={source:semantics(originalStage),clone:semantics(cloneStage),
          sourceElements:sourceElements.length,cloneElements:cloneElements.length,unexpectedHides,
          noteIcons:[...cloneStage.querySelectorAll('.icon-information')].map(icon=>({
            display:icon.style.getPropertyValue('display'),priority:icon.style.getPropertyPriority('display'),
            text:icon.textContent,html:icon.outerHTML})),
          sourceNoteIcons:[...originalStage.querySelectorAll('.icon-information')].map(icon=>({
            display:getComputedStyle(icon).display,text:icon.textContent}))};
        window.__odmmPngDomMetrics={
          wrapper:cssSummary(node),topicCount:node.querySelectorAll('.topic').length,
          originalStage:{x:stageBounds?.x,y:stageBounds?.y,width:stageBounds?.width,
            height:stageBounds?.height},
          originalTopic:{x:real?.x,y:real?.y,width:real?.width,height:real?.height},
          ancestorChain:chain,cloneAudit,offset:{x:offset.m41,y:offset.m42},
          topics:[...(originalStage?.querySelectorAll('.topic')||[])].map(topic=>{
            const rect=topic.getBoundingClientRect();
            return {text:topic.textContent,left:rect.left-stageBounds.left+offset.m41,
              top:rect.top-stageBounds.top+offset.m42,
              right:rect.right-stageBounds.left+offset.m41,
              bottom:rect.bottom-stageBounds.top+offset.m42,
              width:rect.width,height:rect.height};
          })};
        window.__odmmSerializedPngDom=originalSerialize.call(this,node);
        return window.__odmmSerializedPngDom;
      }
      return originalSerialize.call(this,node);
    };
    const original=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){
      const result=original.apply(this,args);
      if(window.__odmmCaptureProbe===true&&this.canvas.width===64&&
         this.canvas.height===64&&args[0] instanceof HTMLCanvasElement){
        try{
          const source=args[0];
          window.__odmmCaptureTrace={width:source.width,height:source.height,
            dataUrl:source.toDataURL('image/png')};
        }catch(error){window.__odmmCaptureTrace={error:String(error)};}
      }
      return result;
    };
  });
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
  assert.equal(await button(1).isVisible(),true,
    'The native action-bar mind-map toggle must stay in its original slot');
  assert.equal(await button(1).getAttribute('aria-pressed'),'true');
  report.topicsA=await viewer(1).locator('.topic:visible').count();
  assert.ok(report.topicsA>1,'XMind must render actual SDK topics');
  // Diagnose glyphs using the actual original SVG topic DOM. No changes to
  // real renderer, production DOM or image content are made by this probe.
  const glyphAudit=await viewer(1).evaluate(host=>{
    const elements=[...host.shadowRoot.querySelectorAll(
      '.topic text,.topic tspan,.topic foreignObject,.topic [class*="icon"]')];
    return elements.map(el=>{
      const text=(el.textContent||'').trim();
      if(!text||text.length>80)return null;
      const cps=[...text].map(ch=>ch.codePointAt(0));
      return {tag:el.localName,cls:el.getAttribute('class'),
        text:text.slice(0,45),codepoints:cps.slice(0,45),
        font:getComputedStyle(el).fontFamily,
        html:el.outerHTML.slice(0,350)};
    }).filter(Boolean).slice(0,80);
  });
  console.log('REAL_XMIND_GLYPH_AUDIT',JSON.stringify(glyphAudit));
  assert.equal(await t(1).locator('.markdown').isVisible(),false);
  await button(2).click();
  await viewer(2).and(page.locator('[data-ready="true"]')).waitFor({timeout:20000});
  report.topicsB=await viewer(2).locator('.topic:visible').count();
  assert.ok(report.topicsB>1);
  assert.ok(await viewer(1).locator('.topic:visible').count()>1,'A remains open while B opens');
  report.checks.push('REAL_XMIND_A_AND_B_INDEPENDENT');
  // All formats use the existing product toolbar and Chromium's download
  // event. Persist the bytes before asserting, so failures remain reviewable.
  const downloadFormat=async(n,format,stem)=>{
    const pending=page.waitForEvent('download',{timeout:45000});
    await viewer(n).locator('.odmm-export-toggle').click();
    await viewer(n).locator('[data-export="'+format+'"]').click();
    const failed=viewer(n).locator('.odmm-export-status[role="alert"]')
      .waitFor({timeout:45000}).then(async()=>{
        throw Error('Real '+format+' export failed: '+
          await viewer(n).locator('.odmm-export-status').textContent());
      });
    const download=await Promise.race([pending,failed]);
    assert.equal(await download.failure(),null);
    const filename=download.suggestedFilename();
    assert.match(filename,format==='outline'?/大纲\.md$/:new RegExp('\\.'+format+'$','i'));
    const bytes=await readFile(await download.path());
    const file=join(out,stem+(format==='outline'?'.md':'.'+format));
    await writeFile(file,bytes);
    return {bytes,metadata:{file,bytes:bytes.length,sha256:sha256(bytes),filename}};
  };
  const auditXmind=async(n,key,stem='chatgpt-mindmap-real-answer-'+key)=>{
    const {bytes,metadata}=await downloadFormat(n,'xmind',stem);
    assert.deepEqual([...bytes.subarray(0,4)],[80,75,3,4]);
    const workbook=await page.evaluate(async base64=>{
      const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
      const zip=await window.JSZip.loadAsync(bytes,{checkCRC32:true});
      const file=zip.file('content.json');
      if(!file)throw Error('Downloaded XMind ZIP lacks content.json');
      const content=await file.async('string');
      const sheets=JSON.parse(content);
      if(!Array.isArray(sheets)||sheets.length!==1||!sheets[0].rootTopic)
        throw Error('Expected exactly one complete downloaded XMind sheet');
      const records=[];
      function walk(topic,depth,path){
        if(depth>12||records.length>=160)throw Error('Unexpected workbook depth/size');
        records.push({id:topic.id,path,title:topic.title,depth,note:topic.notes?.plain?.content||''});
        for(const [kind,children] of Object.entries(topic.children||{})){
          if(kind!=='attached'&&children.length)throw Error('Unexpected XMind child category: '+kind);
          for(const [i,child] of children.entries())walk(child,depth+1,path+'/'+i);
        }
      }
      walk(sheets[0].rootTopic,0,'0');
      return {records,content,entries:Object.keys(zip.files).sort(),checkCRC32:true};
    },bytes.toString('base64'));
    await writeFile(join(out,stem+'.content.json'),workbook.content);
    await writeFile(join(out,stem+'.records.json'),JSON.stringify(workbook.records,null,2)+'\n');
    const result={...metadata,topics:workbook.records.length,records:workbook.records,
      entries:workbook.entries,checkCRC32:workbook.checkCRC32};
    // Exact ordered comparison catches extra/missing topics, shifted hierarchy,
    // lost Chinese text, wrong notes and a duplicated unpromoted root heading.
    assert.deepEqual(workbook.records.map(({title,depth,note})=>({title,depth,note})),
      expected[key],key+' downloaded XMind must equal the entire fixed HTML expectation');
    assert.equal(new Set(workbook.records.map(record=>record.id)).size,workbook.records.length);
    assert.equal(workbook.records.filter(record=>record.title==='功能实施计划').length,1);
    return result;
  };
  const auditOutline=async(n,key,stem='chatgpt-mindmap-real-answer-'+key+'-outline')=>{
    const {bytes,metadata}=await downloadFormat(n,'outline',stem);
    assert.deepEqual(bytes,Buffer.from(expectedOutline[key],'utf8'),
      key+' complete Markdown bytes, Chinese, notes, depth and heading promotion');
    const outline=bytes.toString('utf8');
    assert.ok(outline.startsWith('# '));
    assert.equal(outline.split('\n').filter(line=>line.startsWith('# ')).length,1);
    assert.doesNotMatch(outline,/^- 功能实施计划$/m);
    if(key==='A'){
      assert.match(outline,/^    - /m);
      assert.doesNotMatch(outline,/当回复内容更新时/);
    }else assert.doesNotMatch(outline,/安全与稳定性|缩放与画布适配/);
    return {...metadata,completeExpectedMatch:true};
  };
  const auditPng=async(n,key,theme,stem)=>{
    const liveNoteIcons=()=>viewer(n).evaluate(host=>[
      ...host.shadowRoot.querySelectorAll('.odmm-canvas .icon-information')
    ].map(icon=>{const rect=icon.getBoundingClientRect();
      return {display:getComputedStyle(icon).display,text:icon.textContent,
        width:rect.width,height:rect.height};}));
    const liveIconsBefore=await liveNoteIcons();
    await page.evaluate(()=>{
      window.__odmmCaptureProbe=true;
      window.__odmmPngDomMetrics=null;window.__odmmCaptureTrace=null;
      window.__odmmSerializedPngDom=null;
    });
    let downloaded;
    try{downloaded=await downloadFormat(n,'png',stem);}
    finally{
      const diagnostics=await page.evaluate(()=>({dom:window.__odmmPngDomMetrics,
        trace:window.__odmmCaptureTrace,markup:window.__odmmSerializedPngDom}));
      await writeFile(join(out,stem+'.dom.json'),JSON.stringify(diagnostics.dom,null,2)+'\n');
      if(diagnostics.markup)await writeFile(join(out,stem+'.serialized.xhtml'),diagnostics.markup);
      if(!downloaded&&diagnostics.trace?.dataUrl)await writeFile(
        join(out,stem+'-debug-on-failure.png'),Buffer.from(diagnostics.trace.dataUrl.split(',').at(-1),'base64'));
    }
    const {bytes,metadata}=downloaded;
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    const dom=await page.evaluate(()=>window.__odmmPngDomMetrics);
    assert.ok(width>=100&&height>=100&&width*height<=24_000_000);
    assert.equal(dom?.topicCount,expected[key].length,'Original SDK clone must contain all topics');
    // Decode the downloaded file; source Canvas pixels are diagnostic only.
    // Coordinates come from real offscreen SDK DOM plus the actual serializer
    // wrapper translation, without mounting/moving/modifying the clone.
    const raster=await page.evaluate(async({base64,topics})=>{
      const image=new Image();image.src='data:image/png;base64,'+base64;
      await image.decode();
      const canvas=document.createElement('canvas');
      canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
      const color=(x,y)=>Array.from(data.slice((y*canvas.width+x)*4,(y*canvas.width+x)*4+4));
      const base=color(0,0),buckets=new Set();
      const ink=(x,y)=>{const i=(y*canvas.width+x)*4;
        return data[i+3]>80&&(Math.abs(data[i]-base[0])>28||
          Math.abs(data[i+1]-base[1])>28||Math.abs(data[i+2]-base[2])>28);};
      let painted=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
      for(let y=0;y<canvas.height;y+=2)for(let x=0;x<canvas.width;x+=2){
        if(!ink(x,y))continue;
        painted++;minX=Math.min(minX,x);minY=Math.min(minY,y);
        maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
        const [r,g,b]=color(x,y);buckets.add([r>>5,g>>5,b>>5].join(','));
      }
      const topicPixels=topics.map(topic=>{
        const x0=Math.max(0,Math.floor(topic.left)),y0=Math.max(0,Math.floor(topic.top));
        const x1=Math.min(canvas.width,Math.ceil(topic.right)),y1=Math.min(canvas.height,Math.ceil(topic.bottom));
        let painted=0,samples=0;
        for(let y=y0+1;y<y1;y+=2)for(let x=x0+1;x<x1;x+=2){samples++;if(ink(x,y))painted++;}
        return {...topic,painted,samples,coverage:samples?painted/samples:0};
      });
      return {painted,colors:buckets.size,background:base,
        corners:[base,color(canvas.width-1,0),color(0,canvas.height-1),color(canvas.width-1,canvas.height-1)],
        margins:{left:minX,top:minY,right:canvas.width-1-maxX,bottom:canvas.height-1-maxY},topicPixels};
    },{base64:bytes.toString('base64'),topics:dom.topics});
    const liveIconsAfter=await liveNoteIcons();
    const result={...metadata,type:'ORIGINAL_XMIND_FULL_MAP',answer:key,theme,width,height,raster,
      liveIconsBefore,liveIconsAfter,cloneAudit:dom.cloneAudit};
    await writeFile(join(out,stem+'.pixels.json'),JSON.stringify(result,null,2)+'\n');
    const audit=dom.cloneAudit;
    assert.deepEqual(audit.clone,audit.source,'Cloned topic text and SVG paths must be unchanged');
    assert.equal(audit.cloneElements,audit.sourceElements,'Clone must retain every original element');
    assert.ok(audit.clone.text.length>0&&audit.clone.paths.length>0,'Keep real SDK text and SVG paths');
    assert.deepEqual(audit.unexpectedHides,[],'Only export UI icons may become hidden');
    assert.equal(audit.noteIcons.length,expected[key].filter(topic=>topic.note).length);
    assert.ok(audit.noteIcons.every(icon=>icon.display==='none'&&icon.priority==='important'),
      'Every cloned note icon must be hidden');
    assert.ok(audit.sourceNoteIcons.every(icon=>icon.display!=='none'),'Offscreen original note icons remain');
    assert.equal(liveIconsBefore.length,audit.noteIcons.length);
    assert.equal(liveIconsAfter.length,liveIconsBefore.length,'Visible workbook retains its note icons');
    assert.ok([...liveIconsBefore,...liveIconsAfter].every(icon=>
      icon.display!=='none'&&icon.width>0&&icon.height>0),'Original visible note icons remain displayed');
    assert.deepEqual(raster.background,theme==='dark'?[40,40,40,255]:[255,255,255,255]);
    for(const corner of raster.corners)assert.deepEqual(corner,raster.background);
    assert.ok(raster.painted>=1000&&raster.colors>=5,'Real multicolored XMind nodes/connectors');
    assert.ok(Object.values(raster.margins).every(n=>n>=32),'Breathing room on every PNG edge');
    // Snowbrush inserts U+200E around wrapped text runs; it is layout metadata,
    // not fixture content. ZIP/Markdown remain exact byte/text comparisons.
    const normalize=text=>text.replace(/[\s\u200e]+/g,'');
    for(const record of expected[key]){
      const matches=raster.topicPixels.filter(topic=>normalize(topic.text).includes(normalize(record.title)));
      assert.equal(matches.length,1,'One original SDK rectangle for '+record.title);
      const box=matches[0];
      assert.ok(box.width>=2&&box.height>=2&&box.left>=32&&box.top>=32&&
        box.right<=width-32&&box.bottom<=height-32,'Unclipped topic rectangle: '+record.title);
      assert.ok(box.painted>=8,'Downloaded pixels inside each original topic: '+record.title);
    }
    return result;
  };
  report.xmind=await auditXmind(1,'A');
  assert.ok(report.xmind.topics>3&&report.xmind.records.some(item=>item.depth>=2));
  report.checks.push('ACTUAL_XMIND_DOWNLOAD_ZIP_CRC_CONTENT_AND_REPLY_ISOLATION');
  report.outline=await auditOutline(1,'A');
  report.checks.push('ACTUAL_MARKDOWN_OUTLINE_DOWNLOAD_DEPTH_AND_REPLY_ISOLATION');
  report.png=await auditPng(1,'A','dark','chatgpt-mindmap-real-xmind-full');
  report.checks.push('ORIGINAL_XMIND_FULL_MAP_PNG_DOWNLOADED_PIXEL_AUDITED');
  report.xmindB=await auditXmind(2,'B');
  report.outlineB=await auditOutline(2,'B');
  report.checks.push('TWO_SAME_TITLE_ANSWERS_REAL_ZIP_CRC_AND_MARKDOWN_DOWNLOAD_ISOLATION',
    'A_B_COMPLETE_XMIND_TOPIC_TITLE_DEPTH_NOTE_AND_MARKDOWN_FIXED_FIXTURE_MATCH');

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
  // The viewer theme is independent from the ChatGPT page. Both real XMind
  // workbooks must repaint when the toolbar control changes the preference.
  assert.equal(await viewer(1).getAttribute('data-dark'),'true');
  assert.equal(await viewer(2).getAttribute('data-dark'),'true');
  await viewer(1).getByRole('button',{name:'切换为浅色导图'}).click();
  await page.waitForFunction(()=>{
    const hosts=[...document.querySelectorAll('[data-opendesk-chatgpt-mindmap="viewer"]')];
    return hosts.length===2&&hosts.every(host=>
      host.getAttribute('data-dark')==='false'&&
      host.dataset.skinReady==='light'&&!host.dataset.skinPending&&
      !!host.shadowRoot?.querySelector('.topic'));
  },null,{timeout:20000});
  assert.equal(await page.evaluate(()=>
    localStorage.getItem('opendesk.chatgpt-mindmap.viewer-theme.v1')),'light');
  report.checks.push('USER_LIGHT_TOGGLE_REPAINTS_BOTH_REAL_XMIND_WORKBOOKS');
  await capture('chatgpt-answer-A-light.png',{target:t(1),answer:'A'});
  await capture('chatgpt-answer-B-light.png',{target:t(2),answer:'B'});
  report.pngLightA=await auditPng(1,'A','light','chatgpt-mindmap-real-answer-A-light');
  report.checks.push('LIGHT_A_REAL_PNG_ALL_TOPIC_PIXELS_THEME_MARGIN_AND_CLONE_UI_ONLY');
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
  await viewer(1).getByRole('button',{name:'返回完整原文'}).click();
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
  // Changing ChatGPT appearance must not override an explicit light workbook.
  assert.equal(await viewer(2).getAttribute('data-dark'),'false');
  assert.equal(await viewer(2).getAttribute('data-skin-ready'),'light');
  report.checks.push('CHATGPT_PAGE_THEME_DOES_NOT_OVERRIDE_VIEWER_PREFERENCE');
  await viewer(2).getByRole('button',{name:'切换为深色导图'}).click();
  await page.waitForFunction(()=>{
    const host=document.querySelector('[data-testid="conversation-turn-2"] [data-opendesk-chatgpt-mindmap="viewer"]');
    return host?.getAttribute('data-dark')==='true'&&
      host.dataset.skinReady==='dark'&&!host.dataset.skinPending&&
      !!host.shadowRoot?.querySelector('.topic');
  },null,{timeout:20000});
  assert.equal(await page.evaluate(()=>
    localStorage.getItem('opendesk.chatgpt-mindmap.viewer-theme.v1')),'dark');
  report.checks.push('USER_DARK_TOGGLE_REPAINTS_ORIGINAL_XMIND_WORKBOOK');
  await capture('chatgpt-answer-B-dark.png',{target:t(2),answer:'B'});
  report.pngDarkB=await auditPng(2,'B','dark','chatgpt-mindmap-real-answer-B-dark');
  report.checks.push('DARK_B_REAL_PNG_ALL_TOPIC_PIXELS_THEME_MARGIN_AND_CLONE_UI_ONLY',
    'THREE_PNG_DOWNLOADS_HIDE_CLONED_NOTE_ICONS_RETAIN_LIVE_ICONS_TEXT_AND_SVG_PATHS');
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
  await viewer(3).getByRole('button',{name:'返回完整原文'}).click();
  await viewer(3).waitFor({state:'detached',timeout:15000});
  assert.equal(await t(3).locator('.markdown').evaluate(node=>node.innerHTML),originalC);
  report.checks.push('HEADINGLESS_TABLE_CODE_QUOTE_REAL_TOPICS_AND_LOSSLESS_RESTORE');
  const resources=()=>page.evaluate(()=>({
    ...window.__odmmDownloadResources,
    offscreenStages:[...document.body.children].filter(el=>el.style?.left==='-100000px').length
  }));
  const assertRetired=(before,after)=>{
    const anchors=after.anchors.slice(before.anchors.length);
    const urls=after.urls.filter(item=>anchors.some(anchor=>anchor.url===item.url));
    assert.equal(urls.length,anchors.length,'Every actual download URL is observable');
    assert.ok(urls.every(item=>item.revoked!==null),'Closing must revoke every owned download URL');
    const timers=after.timers.slice(before.timers.length);
    assert.equal(timers.length,anchors.length,'Observe every real download cleanup timer');
    assert.ok(timers.every(item=>item.state!=='pending'),'Closing must retire download cleanup timers');
    assert.equal(after.offscreenStages,0,'No offscreen export workbooks after close');
    return {anchors,urls,timers,offscreenStages:after.offscreenStages};
  };
  // Repeated open/close cycles must not accumulate viewers or inject buttons.
  for(let i=0;i<20;i++){
    await button(1).click();
    await viewer(1).and(page.locator('[data-ready="true"]')).waitFor({timeout:25000});
    let beforeDownloads;
    if(i===0){
      beforeDownloads=await resources();
      const beforeEvents=report.downloadEvents.length;
      report.consecutiveDownloads={exports:[
        await auditXmind(1,'A','lifecycle-consecutive-1-A'),
        await auditOutline(1,'A','lifecycle-consecutive-2-A-outline'),
        await auditPng(1,'A','dark','lifecycle-consecutive-3-A-dark'),
        await auditPng(1,'A','dark','lifecycle-consecutive-4-A-dark')
      ]};
      assert.equal(report.downloadEvents.length-beforeEvents,4,'One actual download per consecutive export');
      report.checks.push('FOUR_CONSECUTIVE_REAL_DOWNLOADS_INCLUDING_REPEAT_PNG_CONTENT_VERIFIED');
    }
    if(i===1){
      const before=await resources(),beforeEvents=report.downloadEvents.length;
      report.closeDuringExport={status:'NOT_OBSERVED',before,beforeEvents,quietWindowMs:1200};
      await viewer(1).locator('.odmm-export-toggle').click();
      await viewer(1).locator('[data-export="png"]').click();
      try{
        const observation=await page.waitForFunction(()=>{
          const host=document.querySelector('[data-testid="conversation-turn-1"] [data-opendesk-chatgpt-mindmap="viewer"]');
          const stages=[...document.body.children].filter(el=>el.style?.left==='-100000px');
          const status=host?.shadowRoot?.querySelector('.odmm-export-status')?.textContent;
          const busy=host?.shadowRoot?.querySelector('.odmm-export-toggle')?.disabled;
          if(!stages.length||!busy||!status?.startsWith('正在生成'))return false;
          const observed={stageCount:stages.length,topics:stages.map(stage=>stage.querySelectorAll('.topic').length),
            status,busy,time:performance.now(),anchorCount:window.__odmmDownloadResources.anchors.length,
            trigger:'ORIGINAL_TOOLBAR_DOM_CLICK_WHILE_REAL_PNG_STAGE_CONNECTED'};
          host.shadowRoot.querySelector('[data-action="original"]').click();
          return observed;
        },null,{timeout:10000});
        report.closeDuringExport.observed=await observation.jsonValue();
        await observation.dispose();
        report.closeDuringExport.status='IN_FLIGHT_CLOSE_OBSERVED';
      }catch(error){
        if(error.name!=='TimeoutError')throw error;
        report.closeDuringExport.reason='No in-flight stage observed before export completed; cancellation NOT_TESTED';
        await viewer(1).getByRole('button',{name:'返回完整原文'}).click();
      }
      await viewer(1).waitFor({state:'detached',timeout:25000});
      // Detachment follows the real renderer's queued operation retirement.
      // Also observe a bounded quiet interval; do not claim an infinite-time proof.
      await page.waitForTimeout(report.closeDuringExport.quietWindowMs);
      const after=await resources();
      report.closeDuringExport.after=after;
      report.closeDuringExport.afterEvents=report.downloadEvents.length;
      if(report.closeDuringExport.status==='IN_FLIGHT_CLOSE_OBSERVED'){
        assert.equal(report.downloadEvents.length,beforeEvents,'No late Chromium download after in-flight close');
        assert.equal(after.anchors.length,before.anchors.length,'No late download anchor after in-flight close');
        report.closeDuringExport.cleanup=assertRetired(before,after);
        report.checks.push('REAL_IN_FLIGHT_PNG_CLOSE_NO_LATE_DOWNLOAD_AND_RESOURCES_RETIRED');
      }
      await page.screenshot({path:join(out,'lifecycle-close-during-export.png')});
    }else await viewer(1).getByRole('button',{name:'返回完整原文'}).click();
    await viewer(1).waitFor({state:'detached',timeout:20000});
    if(i===0){
      report.consecutiveDownloads.cleanup=assertRetired(beforeDownloads,await resources());
      report.checks.push('CONSECUTIVE_DOWNLOAD_CLOSE_REVOKES_BLOB_URLS_AND_CLEARS_TIMERS');
    }
    assert.equal(await page.locator('[data-opendesk-chatgpt-mindmap="button"]').count(),3);
    assert.equal(await t(1).locator('.markdown').evaluate(node=>node.innerHTML),originalA);
  }
  assert.ok(await viewer(2).locator('.topic:visible').count()>1,
    'Twenty A cycles must not affect B');
  report.checks.push('TWENTY_OPEN_RESTORE_CYCLES_NO_ORPHAN_UI');
  // The opener should occupy the same screen position after a real XMind
  // workbook replaces a differently sized source reply and is closed.
  await button(1).scrollIntoViewIfNeeded();
  const originalOpenerY=await button(1).evaluate(el=>el.getBoundingClientRect().top);
  await button(1).click();
  await viewer(1).and(page.locator('[data-ready="true"]')).waitFor({timeout:25000});
  assert.equal(await button(1).getAttribute('aria-pressed'),'true');
  await viewer(1).getByRole('button',{name:'返回完整原文'}).click();
  await viewer(1).waitFor({state:'detached',timeout:20000});
  const restoredOpenerY=await button(1).evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(Math.abs(restoredOpenerY-originalOpenerY)<=10,
    'Restoring the source answer must retain the icon position in the viewport: '+
    JSON.stringify({before:originalOpenerY,after:restoredOpenerY}));
  assert.equal(await button(1).getAttribute('aria-pressed'),'false');
  report.checks.push('REAL_BROWSER_RETURN_PRESERVES_NATIVE_BUTTON_SCREEN_POSITION');
  await page.locator('#developer-lab summary').click();
  // React-like action-bar replacement must move—not duplicate—the real
  // button, and the mock copy/feedback behavior must remain delegated.
  await page.getByRole('button',{name:'重建 B 操作栏'}).click();
  await page.waitForFunction(()=>{
    const turn=document.querySelector('[data-testid="conversation-turn-2"]');
    const actionBar=turn?.querySelector('.actions');
    const buttons=actionBar?.querySelectorAll('[data-opendesk-chatgpt-mindmap="button"]');
    return buttons?.length===1&&!!buttons[0].shadowRoot?.querySelector('button');
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
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="theme"]:focus').count(),1,
    'The theme toggle is part of the original toolbar More menu on 320px');
  await page.keyboard.press('ArrowDown');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="refresh"]:focus').count(),1);
  await page.keyboard.press('Home');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="fold"]:focus').count(),1);
  await page.keyboard.press('End');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="export-open"]:focus').count(),1,
    'End must reach the last actual More action: Export');
  await page.keyboard.press('ArrowUp');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="refresh"]:focus').count(),1);
  await page.keyboard.press('ArrowUp');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="theme"]:focus').count(),1);
  await page.keyboard.press('ArrowUp');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="fold"]:focus').count(),1);
  await page.keyboard.press('ArrowDown');
  assert.equal(await viewer(2).locator('.odmm-menu button[data-action="theme"]:focus').count(),1);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  const exportMenu=viewer(2).locator('.odmm-export-menu');
  assert.equal(await exportMenu.evaluate(el=>!el.hidden),true,
    'Enter on Export in More must open the shared format menu');
  assert.equal(await more.getAttribute('aria-expanded'),'false',
    'More must close while the format menu is open');
  const mobilePopup=await viewer(2).evaluate(host=>{
    const root=host.shadowRoot,trigger=root.querySelector('.odmm-more');
    const popup=root.querySelector('.odmm-export-menu');
    const anchor=root.querySelector('.odmm-menu-wrap'),shell=root.querySelector('.odmm-shell');
    const a=trigger.getBoundingClientRect(),p=popup.getBoundingClientRect(),s=shell.getBoundingClientRect();
    return {parentIsAnchor:popup.parentElement===anchor,rightGap:Math.abs(p.right-a.right),
      below:p.top-a.bottom,left:p.left-s.left,shellOverflow:p.right-s.right,
      labels:[...popup.querySelectorAll('[data-export]')].map(item=>item.textContent)};
  });
  assert.deepEqual(mobilePopup.labels,['PNG','XMind','Markdown']);
  assert.equal(mobilePopup.parentIsAnchor,true);
  assert.ok(mobilePopup.rightGap<=3&&mobilePopup.below>=2&&mobilePopup.below<=12,
    'Export must open beneath More at narrow widths');
  assert.ok(mobilePopup.left>=0&&mobilePopup.shellOverflow<=1,
    'Mobile Export must remain inside the viewer');
  assert.equal(await viewer(2).locator('.odmm-export-menu button[data-export="png"]:focus').count(),1);
  await page.keyboard.press('ArrowDown');
  assert.equal(await viewer(2).locator('.odmm-export-menu button[data-export="xmind"]:focus').count(),1);
  await page.keyboard.press('End');
  assert.equal(await viewer(2).locator('.odmm-export-menu button[data-export="outline"]:focus').count(),1);
  await page.keyboard.press('Home');
  assert.equal(await viewer(2).locator('.odmm-export-menu button[data-export="png"]:focus').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await exportMenu.evaluate(el=>el.hidden),true);
  assert.equal(await more.evaluate(el=>el.matches(':focus')),true,
    'Escape in the format menu must restore focus to More');
  report.checks.push('MOBILE_EXPORT_ENTER_ARROWS_HOME_END_ESCAPE_FOCUS');
  await more.focus();await page.keyboard.press('ArrowDown');
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
  await page.waitForFunction(()=>{
    const host=document.querySelector('[data-testid="conversation-turn-2"] [data-opendesk-chatgpt-mindmap="viewer"]');
    const root=host?.shadowRoot?.querySelector('.topic')?.getBoundingClientRect();
    const canvas=host?.shadowRoot?.querySelector('.odmm-canvas');
    const frame=canvas?.getBoundingClientRect();
    if(!root||!frame||canvas.dataset.fitReady!=='true'||
      canvas.dataset.manualViewport!=='false')return false;
    const visible=Math.max(0,Math.min(root.right,frame.right)-Math.max(root.left,frame.left));
    return visible>=Math.max(90,root.width*.85);
  },null,{timeout:20000});
  report.mobileFitAfterPan=await getPan();
  assert.ok(report.mobileFitAfterPan.left<report.mobilePan.after.left-20,
    'Fit must return toward the root after manually panning right');
  report.checks.push('MOBILE_FIT_AFTER_MANUAL_PAN_RETURNS_READABLE_ROOT');
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
  for(const width of [320,360,375,390,400,440,768,1220,1440]){
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
    // Match the shipped @container(max-width:420px), not a stale 390px probe.
    if(metrics.shellWidth>420){
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
  report.resourcesAfterStop=await resources();
  assertRetired({anchors:[],timers:[]},report.resourcesAfterStop);
  report.checks.push('STOP_RETIRES_ALL_OBSERVED_DOWNLOAD_URLS_TIMERS_AND_OFFSCREEN_STAGES');
  report.styleIsolation=report.stop.styleIsolation;
  assert.equal(report.externalRequests.length,0,'No external requests from this fixture');
  assert.equal(report.errors.length,0,'No uncaught JavaScript errors');
  report.sourcesAfter=await fingerprint();
  assert.deepEqual(report.sourcesAfter,report.sourcesBefore,'Actual candidate/probe source must stay stable throughout run');
  report.checks.push('ALL_PROJECT_JS_FIXTURE_CSS_AND_PROBE_SHA256_BOUND_AND_STABLE');
  success=true;
  console.log('CHATGPT_MINDMAP_REAL_ENGINE_PREVIEW_PASS '+JSON.stringify({
    checks:report.checks,topicsA:report.topicsA,topicsB:report.topicsB,
    styleIsolation:report.styleIsolation,narrowWidth:report.narrowWidth}));
}catch(error){
  report.failure={message:error.message,stack:error.stack};
  throw error;
}finally{
  report.success=success;
  report.finishedAt=new Date().toISOString();
  report.sourcesAfter=await fingerprint();
  await writeFile(join(out,'chatgpt-result.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(join(out,'screenshot-evidence.json'),JSON.stringify(screenshots,null,2)+'\n');
  await browser?.close().catch(()=>{});
  await session?.close().catch(()=>{});
}
