#!/usr/bin/env node
// Source-bound layout simulation only. No extension, existing profile, GUI,
// watcher, network, dependency install, production build or native PASS.
// Run: node scripts/tests/sidebar-tool-title-r22-chrome.mjs
// Optional existing dependencies: OPENDESK_PLAYWRIGHT_MODULE,
// OPENDESK_PREVIEW_CHROME_BIN. Exit 0=PASS, 1=layout failures, 2=harness error.
import {build, stop} from 'esbuild';
import {readFile, writeFile, mkdir, access, readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname, resolve, relative, extname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'artifacts/tool-title-r22-layout', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, {recursive:true});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = new Map();
async function capture(path) {
  const bytes = await readFile(path);
  sources.set(relative(root, path), {sha256:sha(bytes), bytes:bytes.length});
  return bytes;
}
const report = {
  kind:'SOURCE_BOUND_HEADLESS_CHROMIUM_SIMULATION', nativeChrome:'NOT_TESTED',
  status:'RUNNING', startedAt:new Date().toISOString(),
  command:'node scripts/tests/sidebar-tool-title-r22-chrome.mjs',
  scope:'Real ToolHost/createSidebarToolsView + title-path formatter; simulated view state, real React events and source CSS.',
  limitations:[
    'Half-width CSS viewports simulate available layout at 200%; browser zoom itself is not exercised.',
    'No extension installation, Mac Chrome Side Panel, controller navigation or native authority is exercised.',
    'Only ToolHost is mounted inside the source App Shell ancestor structure; other tabs and chat portal are absent.',
    'Button handlers record input only; no real settings, uninstall or other business action runs.'
  ],
  widths:[320,360,400,440,960,160,180,200,220,480], cases:[], errors:[]
};
let browser;
const previousTmpdir=process.env.TMPDIR;
try {
  const cssPaths = ['src/ui/design-tokens.css','src/ui/design-system.css','src/ui/tool-shell.css'];
  const css = (await Promise.all(cssPaths.map(async path => (await capture(resolve(root,path))).toString()))).join('\n');
  await capture(fileURLToPath(import.meta.url));
  // Capture exact bytes read by the bundler, including transitive components.
  // The browser runs this frozen bundle even if another owner edits afterwards.
  const result = await build({
    stdin:{resolveDir:root, sourcefile:'r22-title-fixture.tsx', contents:`
      import * as React from 'react';
      import {createRoot} from 'react-dom/client';
      import {ToolHost} from './src/ui/react/tabs/tool-host.tsx';
      import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
      import {formatSidebarToolTitle,sidebarToolTitleParts} from './src/ui/sidebar-tools/title-path.js';
      const view=createSidebarToolsView();
      const ids=['sidebar-tool-back','sidebar-tool-primary-action','sidebar-tool-secondary-action',
        'sidebar-tool-settings-open','sidebar-tool-remove'];
      window.r22Clicks=[];
      for(const id of ids)view.bind(id,'click',event=>window.r22Clicks.push({id,trusted:event.isTrusted}));
      view.patch('sidebar-tool-display',{hidden:false});
      const tree=React.createElement('div',{id:'opendesk-react-app',className:'opendesk-react-app'},
        React.createElement('main',{id:'workspace-content'},
          React.createElement('div',{id:'workbench-tools',className:'od-page','data-workbench-page':'tools'},
            React.createElement('section',{id:'sidebar-tools',className:'sidebar-tools'},
              React.createElement(ToolHost,{view})))));
      createRoot(document.getElementById('fixture')).render(tree);
      window.r22Set=async ({parent,leaf,many})=>{
        const options={toolTitle:parent,pageTitle:leaf,isHome:false,isSettings:false};
        const parts=sidebarToolTitleParts(options),text=formatSidebarToolTitle(options);
        view.patch('sidebar-tool-title',{textContent:text,title:text+' · v1.0.0',
          data:{toolLabel:parts.tool,pageLabel:parts.page}});
        for(const id of ids)view.patch(id,{hidden:!many&&id!=='sidebar-tool-back'&&id!=='sidebar-tool-settings-open',disabled:false});
        view.patch('sidebar-tool-primary-action',{title:'保存当前页面',attributes:{'aria-label':'保存当前页面'},data:{action:'save'}});
        view.patch('sidebar-tool-secondary-action',{title:'更多页面操作',attributes:{'aria-label':'更多页面操作'},data:{action:'more'}});
        window.r22Clicks=[];
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return {text,title:text+' · v1.0.0',parts};
      };
    `},
    bundle:true, write:false, platform:'browser', format:'iife', jsx:'transform',
    define:{'process.env.NODE_ENV':'"production"'}, metafile:true,
    loader:{'.css':'empty'},
    plugins:[{name:'record-exact-source',setup(builder){
      builder.onLoad({filter:/\.(?:[cm]?js|tsx?|jsx|json|css)$/},async ({path})=>{
        const contents=await capture(path);
        const extension=extname(path).slice(1);
        return {contents,loader:extension==='css'?'empty':extension==='mjs'||extension==='cjs'?'js':extension};
      });
    }}]
  });
  stop();
  const bundle = result.outputFiles[0].text;
  await writeFile(resolve(output,'fixture.js'),bundle);
  await writeFile(resolve(output,'source.css'),css);
  // An offline replay for native browser zoom/input checks. It remains a
  // source-bound fixture, never evidence of installed-tool authority.
  const replayDocument='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>'+css+
    '</style><div id="fixture"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>';
  await writeFile(resolve(output,'native-review.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8">
    <title>R2.2 源码绑定标题验证 · 非安装实例</title>
    <style>body{margin:12px;font:14px system-ui}label{margin-right:16px}iframe{display:block;border:1px solid #999;height:260px;margin-top:16px}button,select{font:inherit;padding:8px}output{display:block;white-space:pre-wrap;margin-top:8px}</style>
    <p>真实 ToolHost 与 CSS 的离线回放；不代表已安装扩展、权限或业务验收。</p>
    <label>CSS 宽度 <select id="width">${report.widths.map(w=>'<option>'+w+'</option>').join('')}</select></label>
    <label>标题场景 <select id="variant"><option value="normal">正常名称</option><option value="long-parent">超长扩展名称</option><option value="long-leaf">超长子页名称</option><option value="both-long">两者超长</option></select></label>
    <button id="matrix">记录全部宽度与标题几何</button><output id="status"></output><iframe title="真实 ToolHost 标题回放" id="host"></iframe>
    <script>
    const host=document.getElementById('host'),width=document.getElementById('width'),variant=document.getElementById('variant');
    host.srcdoc=${JSON.stringify(replayDocument).replaceAll('<',String.fromCharCode(92)+'u003c')};
    const variants={normal:{parent:'书签管理',leaf:'设置'},'long-parent':{parent:'超长父工具名称_LongParentWithoutBreaks_'.repeat(4),leaf:'设置'},'long-leaf':{parent:'书签管理',leaf:'超长子页面名称_LongLeafWithoutBreaks_'.repeat(4)},'both-long':{parent:'超长父工具名称_LongParentWithoutBreaks_'.repeat(4),leaf:'超长子页面名称_LongLeafWithoutBreaks_'.repeat(4)}};
    async function show(){host.style.width=width.value+'px';await host.contentWindow.r22Set({...variants[variant.value],many:true});}
    function measure(){const w=host.contentWindow,d=host.contentDocument,h=d.querySelector('.sidebar-tool-view-head'),t=d.getElementById('sidebar-tool-title'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};const buttons=[...h.querySelectorAll('button')].filter(e=>e.checkVisibility());return {width:w.innerWidth,variant:variant.value,dpr:w.devicePixelRatio,title:{rect:rect(t),aria:t.getAttribute('aria-label'),tooltip:t.title},buttons:buttons.map(e=>{const r=rect(e);return {id:e.id,rect:r,hit:d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')?.id}}),overflow:h.scrollWidth>h.clientWidth||d.documentElement.scrollWidth>w.innerWidth};}
    host.onload=()=>show();width.onchange=show;variant.onchange=show;
    document.getElementById('matrix').onclick=async()=>{const oldWidth=width.value,oldVariant=variant.value;window.nativeMatrix=[];for(const v of Object.keys(variants))for(const w of ${JSON.stringify(report.widths)}){width.value=w;variant.value=v;await show();window.nativeMatrix.push(measure());}width.value=oldWidth;variant.value=oldVariant;await show();document.getElementById('status').textContent=window.nativeMatrix.length+' 个原生浏览器渲染场景已记录；几何仍须检查。';};
    window.nativeMeasure=measure;
    </script>`);
  report.bundleSha256=sha(bundle);
  report.cssSha256=sha(css);
  report.metafile=result.metafile;
  const require=createRequire(import.meta.url);
  const candidates=[process.env.OPENDESK_PLAYWRIGHT_MODULE,'playwright',
    '/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'].filter(Boolean);
  let playwright;
  for(const candidate of candidates){
    let resolved;
    try{resolved=candidate.startsWith('/')?candidate:require.resolve(candidate);await access(resolved);}
    catch{continue;}
    playwright=await import(pathToFileURL(resolved).href);
    report.playwrightModule=resolved;
    break;
  }
  if(!playwright)throw new Error('No existing Playwright module found; installation is forbidden.');
  let executable=process.env.OPENDESK_PREVIEW_CHROME_BIN;
  if(!executable){
    const cache=process.env.PLAYWRIGHT_BROWSERS_PATH||resolve(homedir(),'Library/Caches/ms-playwright');
    const cached=await readdir(cache,{recursive:true}).catch(()=>[]);
    const binaries=cached.filter(path=>/^chromium(?:_headless_shell)?-\d+\//.test(path)&&
      /(?:\/chrome-headless-shell|\/Chromium\.app\/Contents\/MacOS\/Chromium)$/.test(path));
    binaries.sort((a,b)=>Number(b.match(/-(\d+)/)[1])-Number(a.match(/-(\d+)/)[1]));
    executable=binaries.length?resolve(cache,binaries[0]):playwright.chromium.executablePath();
  }
  await access(executable);
  // Keep this run's automatically created Playwright profile/temp files under
  // its artifact directory. This affects this process only, never GUI profiles.
  process.env.TMPDIR=resolve(output,'tmp');
  await mkdir(process.env.TMPDIR,{recursive:true});
  browser=await playwright.chromium.launch({headless:true,executablePath:executable});
  report.browser={version:browser.version(),executable};
  const variants=[
    {name:'normal',parent:'书签管理',leaf:'设置'},
    {name:'long-parent',parent:'超长父工具名称_LongParentWithoutBreaks_'.repeat(4),leaf:'设置'},
    {name:'long-leaf',parent:'书签管理',leaf:'超长子页面名称_LongLeafWithoutBreaks_'.repeat(4)},
    {name:'both-long',parent:'超长父工具名称_LongParentWithoutBreaks_'.repeat(4),leaf:'超长子页面名称_LongLeafWithoutBreaks_'.repeat(4)}
  ];
  for(const coarse of [false,true]){
    const context=await browser.newContext({viewport:{width:320,height:420},hasTouch:coarse,deviceScaleFactor:1,offline:true});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(String(error)));
    await page.setContent('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body><div id="fixture"></div></body></html>');
    await page.addStyleTag({content:css});
    await page.addScriptTag({content:bundle});
    await page.waitForSelector('.sidebar-tool-view-head');
    const actualCoarse=await page.evaluate(()=>matchMedia('(pointer:coarse)').matches);
    if(actualCoarse!==coarse)throw new Error('Pointer media simulation does not match requested mode');
    for(const width of report.widths){
      await page.setViewportSize({width,height:420});
      for(const variant of variants)for(const many of [false,true]){
        const name=`${coarse?'coarse':'fine'}-${width}-${variant.name}-${many?'four-right':'one-right'}`;
        await page.mouse.move(0,419);
        await page.evaluate(()=>document.activeElement?.blur());
        const expected=await page.evaluate(input=>window.r22Set(input),{...variant,many});
        if(expected.text!==`${variant.parent} / ${variant.leaf}`||expected.parts.tool!==variant.parent||expected.parts.page!==variant.leaf){
          throw new Error('Fixture formatter unexpectedly changes the full input title: '+name);
        }
        const row=await page.evaluate(({expected,coarse})=>{
          const header=document.querySelector('.sidebar-tool-view-head');
          const title=document.getElementById('sidebar-tool-title');
          const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          const visible=node=>!!node&&node.checkVisibility()&&node.getBoundingClientRect().width>0;
          const box=node=>node?{rect:rect(node),display:getComputedStyle(node).display,
            clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,text:node.textContent,
            textOverflow:getComputedStyle(node).textOverflow}:null;
          const buttons=[...header.querySelectorAll('button')].filter(visible);
          const failures=[];
          const check=(ok,code,detail)=>{if(!ok)failures.push({code,detail});};
          const hr=rect(header),tr=rect(title);
          const controls=buttons.map(button=>{
            const r=rect(button);
            const points=[[r.x+r.width/2,r.y+r.height/2],[r.x+4,r.y+4],[r.right-4,r.bottom-4]];
            const hits=points.map(([x,y])=>({x,y,hit:document.elementFromPoint(x,y)?.closest('button')?.id||null}));
            const record={id:button.id,rect:r,ariaLabel:button.getAttribute('aria-label'),title:button.title,hits};
            check(hits.every(hit=>hit.hit===button.id),'button-hit',record);
            check(r.x>=hr.x-.5&&r.right<=hr.right+.5&&r.y>=hr.y-.5&&r.bottom<=hr.bottom+.5,'button-outside-header',record);
            check(!!record.ariaLabel&&!!record.title,'button-accessible-name',record);
            if(coarse)check(r.width>=43.5&&r.height>=43.5,'coarse-target-44',record);
            return record;
          });
          const elements=[{id:title.id,rect:tr},...controls];
          for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++){
            const a=elements[i],b=elements[j];
            const overlapX=Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.x,b.rect.x);
            const overlapY=Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.y,b.rect.y);
            check(overlapX<=.5||overlapY<=.5,'overlap',{a:a.id,b:b.id,overlapX,overlapY});
          }
          const parent=title.querySelector('.sidebar-tool-title-parent');
          const divider=title.querySelector('.sidebar-tool-title-divider');
          const leaf=title.querySelector('.sidebar-tool-title-current');
          check(title.getAttribute('aria-label')===expected.text,'full-title-aria',{actual:title.getAttribute('aria-label'),expected:expected.text});
          check(title.title===expected.title,'full-title-tooltip',{actual:title.title,expected:expected.title});
          check(parent?.textContent===expected.parts.tool&&leaf?.textContent===expected.parts.page,'untruncated-source-text',{parent:parent?.textContent,leaf:leaf?.textContent});
          let visibleLeafCharacters=0;
          if(leaf?.firstChild&&visible(leaf)){
            const lr=rect(leaf);
            const canvas=document.createElement('canvas').getContext('2d');
            canvas.font=getComputedStyle(leaf).font;
            const ellipsis=leaf.scrollWidth>leaf.clientWidth?canvas.measureText('…').width:0;
            for(let i=0;i<leaf.firstChild.length;i++){
              const range=document.createRange();range.setStart(leaf.firstChild,i);range.setEnd(leaf.firstChild,i+1);
              const r=range.getBoundingClientRect();
              if(r.width>0&&r.x>=Math.max(lr.x,tr.x)-.5&&r.right<=Math.min(lr.right,tr.right)-ellipsis+.5)visibleLeafCharacters++;
            }
          }
          check(visibleLeafCharacters>0,'leaf-readable',{visibleLeafCharacters,titleWidth:tr.width,leaf:box(leaf)});
          if(tr.width<=100&&leaf){
            check(!visible(parent)&&!visible(divider),'narrow-leaf-priority',{titleWidth:tr.width,parent:box(parent),divider:box(divider)});
            check(leaf.getBoundingClientRect().width>=tr.width-2,'narrow-leaf-available-width',{titleWidth:tr.width,leaf:box(leaf)});
          }
          check(header.scrollWidth<=header.clientWidth+1,'header-overflow',{scrollWidth:header.scrollWidth,clientWidth:header.clientWidth});
          check(document.documentElement.scrollWidth<=innerWidth+1,'document-overflow',{scrollWidth:document.documentElement.scrollWidth,innerWidth});
          check(tr.width>0&&tr.height>0&&tr.x>=hr.x-.5&&tr.right<=hr.right+.5,'title-bounds',{title:tr,header:hr});
          return {failures,header:box(header),title:box(title),parent:box(parent),leaf:box(leaf),divider:box(divider),
            visibleLeafCharacters,controls,ariaLabel:title.getAttribute('aria-label'),tooltip:title.title,
            viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,coarse:matchMedia('(pointer:coarse)').matches},
            documentScrollWidth:document.documentElement.scrollWidth};
        },{expected,coarse});
        const expectedControls=many?['sidebar-tool-back','sidebar-tool-primary-action',
          'sidebar-tool-secondary-action','sidebar-tool-settings-open','sidebar-tool-remove']:
          ['sidebar-tool-back','sidebar-tool-settings-open'];
        if(JSON.stringify(row.controls.map(control=>control.id))!==JSON.stringify(expectedControls)){
          row.failures.push({code:'expected-controls-visible',detail:{expected:expectedControls,actual:row.controls.map(control=>control.id)}});
        }
        row.screenshot=name+'.png';
        await page.screenshot({path:resolve(output,row.screenshot)});
        // Exercise real input and the real React -> view.dispatch path, without
        // running controller business actions or using force-click/DOM click().
        for(const control of row.controls){
          await page.mouse.click(control.rect.x+control.rect.width/2,control.rect.y+control.rect.height/2);
        }
        row.clicks=await page.evaluate(()=>window.r22Clicks);
        if(JSON.stringify(row.clicks.map(click=>click.id))!==JSON.stringify(row.controls.map(control=>control.id))||row.clicks.some(click=>!click.trusted)){
          row.failures.push({code:'trusted-click-dispatch',detail:row.clicks});
        }
        await page.evaluate(()=>{document.body.tabIndex=-1;document.body.focus();});
        row.tabs=[];
        for(const control of row.controls){
          await page.keyboard.press('Tab');
          const focus=await page.evaluate(()=>({id:document.activeElement.id,
            focusVisible:document.activeElement.matches(':focus-visible'),
            outlineStyle:getComputedStyle(document.activeElement).outlineStyle,
            outlineWidth:getComputedStyle(document.activeElement).outlineWidth}));
          row.tabs.push(focus);
          if(focus.id!==control.id||!focus.focusVisible||focus.outlineStyle==='none'||parseFloat(focus.outlineWidth)===0){
            row.failures.push({code:'keyboard-tab-focus',detail:{expected:control.id,actual:focus}});
          }
          await page.keyboard.press(row.tabs.length%2?'Enter':'Space');
        }
        row.keyboardClicks=(await page.evaluate(()=>window.r22Clicks)).slice(row.clicks.length);
        if(JSON.stringify(row.keyboardClicks.map(click=>click.id))!==JSON.stringify(expectedControls)||row.keyboardClicks.some(click=>!click.trusted)){
          row.failures.push({code:'keyboard-activation',detail:row.keyboardClicks});
        }
        row.name=name;row.variant=variant;row.many=many;
        row.simulatedZoom=width<320||width===480?'200%-available-CSS-width':'normal-CSS-width';
        row.physicalWidthReference=row.simulatedZoom.startsWith('200%')?width*2:width;
        if(many&&variant.name==='both-long'){
          row.keyboardScreenshot=name+'-keyboard.png';
          await page.screenshot({path:resolve(output,row.keyboardScreenshot)});
        }
        row.status=row.failures.length?'FAIL':'PASS';
        report.cases.push(row);
      }
    }
    await context.close();
    console.log(`${coarse?'coarse':'fine'}: ${report.cases.filter(row=>row.viewport.coarse===coarse).length} cases recorded`);
  }
  report.status=report.cases.some(row=>row.status==='FAIL')||report.errors.length?'FAIL':'PASS';
} catch(error){
  report.status='HARNESS_ERROR';report.errors.push(error.stack||String(error));
} finally {
  stop();
  await browser?.close();
  if(previousTmpdir===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=previousTmpdir;
  report.finishedAt=new Date().toISOString();
  report.sources=Object.fromEntries([...sources].sort(([a],[b])=>a.localeCompare(b)));
  report.sourceChangesSinceCapture=[];
  for(const [path,record] of sources){
    try{if(sha(await readFile(resolve(root,path)))!==record.sha256)report.sourceChangesSinceCapture.push(path);}
    catch{report.sourceChangesSinceCapture.push(path);}
  }
  report.summary={total:report.cases.length,passed:report.cases.filter(row=>row.status==='PASS').length,
    failed:report.cases.filter(row=>row.status==='FAIL').length};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  const groups={};
  for(const row of report.cases)for(const failure of row.failures){
    (groups[failure.code]??=[]).push(row.name);
  }
  const summary=[`# R2.2 Chromium source-bound simulation: ${report.status}`,
    '',`Cases: ${report.summary.passed} PASS / ${report.summary.failed} FAIL / ${report.summary.total} total.`,
    'Native Mac Chrome: NOT_TESTED. Half-width viewport is a CSS layout simulation of 200%, not native browser zoom.',
    '', 'Rerun: `node scripts/tests/sidebar-tool-title-r22-chrome.mjs`',
    '', 'Real components: src/ui/react/tabs/tool-host.tsx; src/ui/sidebar-tools-view.js; src/ui/sidebar-tools/title-path.js.',
    'Geometry rules to inspect: src/ui/tool-shell.css (.sidebar-tool-view-head, #sidebar-tool-title, title-path/current/parent, @container tool-title, pointer:coarse); src/ui/design-system.css (.od-page-head).',
    '',...Object.entries(groups).map(([code,names])=>`- ${code}: ${names.length} observations; examples: ${names.slice(0,5).join(', ')}. Full geometry and all affected cases: report.json.`),
    '',...report.errors.map(error=>`Error: ${error}`),
    '',`Sources changed after capture: ${report.sourceChangesSinceCapture.join(', ')||'none'}. Evidence refers to frozen hashes in report.json.`,
    '',...report.limitations.map(limit=>`- ${limit}`),''];
  await writeFile(resolve(output,'summary.md'),summary.join('\n'));
  console.log(JSON.stringify({status:report.status,...report.summary,failures:Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,rows.length])),output},null,2));
  process.exitCode=report.status==='PASS'?0:report.status==='FAIL'?1:2;
}
