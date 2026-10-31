// Regression for the actual sandboxed Preview: native clicks/Enter, no SDK mock
// injected by the driver. Playwright is supplied by the caller; no new dependency.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.AI_PROXY_PREVIEW_URL||'http://127.0.0.1:43263';
const out=resolve(process.env.AI_PROXY_PREVIEW_OUTPUT||'artifacts/ai-proxy/ui-correction-20261031');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const context=await browser.newContext({viewport:{width:1100,height:2300}});
const page=await context.newPage(),errors=[],external=[];
page.setDefaultTimeout(6000);
page.on('pageerror',error=>errors.push(error.message));
context.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==new URL(base).origin)external.push(request.url());});
const app=page.frameLocator('#opendesk-preview-frame');
const report={visualResult:'NOT_REVIEWED',evidenceResult:'PENDING',comparison:{},at:new Date().toISOString(),kind:'same-source memory Preview, not native Chrome acceptance',checks:[],screenshots:{},externalRequests:external,pageErrors:errors};
const pass=name=>report.checks.push(name);
const ready=()=>app.getByRole('heading',{name:'连接方式',exact:true}).waitFor();
const snapshot=async name=>{
 // Keep every iframe visible before capture; fullPage alone can leave offscreen
 // sandbox frames unpainted in Chromium. This changes only the outer evidence page.
 for(const frame of page.frames())await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const file=join(out,name+'.png');await page.screenshot({path:file,fullPage:true});
 report.screenshots[name]={file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')};
};
try{
 if(!process.argv.includes('--compare-only')){
 await page.goto(base+'/ai-proxy-preview');await ready();
 assert.equal(await page.locator('#opendesk-preview-frame').getAttribute('sandbox'),'allow-scripts');
 await app.getByRole('button',{name:'添加代理',exact:true}).click();
 await app.getByRole('textbox',{name:'主机',exact:true}).fill('preview.example.com');
 await app.getByRole('spinbutton',{name:'端口',exact:true}).fill('8443');
 await app.getByRole('spinbutton',{name:'端口',exact:true}).fill('65536');
 await app.getByRole('button',{name:'保存并选择',exact:true}).click();
 await app.getByRole('heading',{name:'添加代理',exact:true}).waitFor();
 assert.equal(await app.getByRole('spinbutton',{name:'端口',exact:true}).evaluate(input=>input.validity.valid),false);
 await app.getByRole('button',{name:'← 返回',exact:true}).click();await ready();
 assert.doesNotMatch(await app.locator('body').innerText(),/preview.example.com/);
 await app.getByRole('button',{name:'添加代理',exact:true}).click();
 assert.equal(await app.getByRole('spinbutton',{name:'端口',exact:true}).inputValue(),'65536');
 await app.getByRole('spinbutton',{name:'端口',exact:true}).fill('8443');
 pass('invalid port cannot submit; Back cancels without writes and preserves the isolated draft');
 await page.waitForFunction(()=>document.getElementById('sidebar-tool-back').disabled);
 assert.equal(await page.locator('#od-preview-scenario').isEnabled(),false);
 await app.getByRole('button',{name:'← 返回',exact:true}).click();
 await app.getByRole('button',{name:'添加代理',exact:true}).click();
 assert.equal(await app.getByRole('textbox',{name:'主机',exact:true}).inputValue(),'preview.example.com');
 await app.getByRole('button',{name:'保存并选择',exact:true}).click();await ready();
 await page.waitForFunction(()=>!document.getElementById('sidebar-tool-back').disabled);
 assert.match(await app.locator('body').innerText(),/代理已保存并选中，还未应用到 Chrome/);
 pass('click Save selects config without applying; hidden/reopened draft survives; dirty lock releases only after save');
 await app.getByRole('button',{name:'添加代理',exact:true}).click();
 await app.getByRole('textbox',{name:'主机',exact:true}).fill('enter.example.com');
 await app.getByRole('spinbutton',{name:'端口',exact:true}).fill('443');
 await app.getByRole('spinbutton',{name:'端口',exact:true}).dispatchEvent('keydown',{key:'Enter',isComposing:true,bubbles:true});
 await app.getByRole('heading',{name:'添加代理',exact:true}).waitFor();
 pass('synthetic composition Enter reaches the real handler without submission; native OS IME not tested');
 await app.getByRole('spinbutton',{name:'端口',exact:true}).press('Enter');await ready();
 assert.match(await app.locator('body').innerText(),/enter.example.com:443/);
 pass('Enter submits the original React handler inside allow-scripts sandbox');
 await app.getByRole('button',{name:'打开设置',exact:true}).click();
 for(const name of ['网站规则','订阅管理','导入与备份','网络诊断','通用设置','官方网络','代理配置']){
  await app.getByRole('combobox',{name:'设置栏目',exact:true}).selectOption({label:name==='官方网络'?'官方网络 · 可选官方服务':name});
  await app.getByRole('heading',{name,exact:true}).first().waitFor();
 }
 await app.getByRole('button',{name:'← 返回',exact:true}).click();await ready();
 pass('all seven Settings sections and return render');
 await app.getByRole('button',{name:'打开设置',exact:true}).click();
 await app.getByRole('button',{name:'删除 工作代理',exact:true}).click();
 await app.locator('#proxy-confirm-cancel').waitFor();
 assert.equal(await page.locator('#od-preview-scenario').isEnabled(),false);
 assert.equal(await page.locator('#od-preview-restore').isEnabled(),false);
 await app.locator('#proxy-confirm-cancel').click();
 await page.waitForFunction(()=>!document.getElementById('sidebar-tool-back').disabled);
 assert.equal(await app.getByRole('button',{name:'删除 工作代理',exact:true}).isVisible(),true);
 assert.equal(await app.getByRole('button',{name:'删除 工作代理',exact:true}).evaluate(button=>button===document.activeElement),true);
 await app.getByRole('button',{name:'← 返回',exact:true}).click();await ready();
 pass('clean delete confirmation locks host replacement; Cancel preserves data and restores trigger focus');
 await app.getByRole('button',{name:'添加代理',exact:true}).click();
 await app.getByRole('textbox',{name:'主机',exact:true}).fill('draft.example.com');
 await app.getByRole('button',{name:'← 返回',exact:true}).click();
 await app.getByRole('button',{name:'打开设置',exact:true}).click();
 await app.locator('#proxy-draft-cancel').click();
 await app.getByRole('button',{name:'添加代理',exact:true}).click();
 assert.equal(await app.getByRole('textbox',{name:'主机',exact:true}).inputValue(),'draft.example.com');
 await app.getByRole('button',{name:'← 返回',exact:true}).click();
 await app.getByRole('button',{name:'打开设置',exact:true}).click();
 await app.locator('#proxy-draft-accept').click();
 await app.getByRole('heading',{name:'代理配置',exact:true}).waitFor();
 pass('Keep Editing retains draft; explicit discard navigates and clears only abandoned UI');
 await page.locator('#sidebar-tool-remove').click();
 await page.locator('#od-preview-accept-uninstall').click();
 assert.equal(await page.locator('#opendesk-preview-frame').getAttribute('srcdoc'),'');
 assert.equal(await page.locator('#od-preview-scenario').isEnabled(),false);
 await page.locator('#od-preview-reset').click();await ready();
 await page.getByText('预览辅助 · 非正式工具',{exact:true}).click();
 await page.locator('#od-preview-scenario').selectOption('empty');await ready();
 assert.doesNotMatch(await app.locator('body').innerText(),/preview.example.com/);
 pass('simulated uninstall stays unmounted until explicit restore; empty/reset uses fresh memory');
 report.uiManifest=await page.locator('#opendesk-preview-manifest').evaluate(node=>JSON.parse(node.textContent));
 }
 await page.goto(base+'/projects/ai-proxy/preview/compare.html');
 for(const state of ['configured','empty','add']){
  await page.locator('#view').selectOption(state);
  const original=page.frameLocator('#original'),migrated=page.frameLocator('#migrated');
  const heading=state==='settings'?'代理配置':state==='add'?'添加代理':'连接方式';
  await original.getByRole('heading',{name:heading,exact:true}).first().waitFor();
  await migrated.getByRole('heading',{name:heading,exact:true}).first().waitFor();
  const sizes=await page.locator('#original,#migrated').evaluateAll(nodes=>nodes.map(n=>({width:n.clientWidth,height:n.clientHeight})));
  assert.deepEqual(sizes,[{width:400,height:880},{width:400,height:880}],'equal complete application viewports');
  const measure=frame=>frame.locator('body').evaluate(body=>{
   const selectors=['.r86Modes','.r86StatusCard','.r86ProxyList button','.r86Legal','.r86Bottom','.sideAddHeader','.sideAddKind','.sideAddForm input','.sideAddActions','.optionsHead','.options .nav','.optionsPageHead','.optionsModeBar','.profileRecords','.optionsModeBar > *','.sideAddForm > *','.sideAddActions button'];
   const result={};for(const selector of selectors)result[selector]=[...body.querySelectorAll(selector)].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,fontSize:s.fontSize,lineHeight:s.lineHeight,display:s.display,padding:s.padding,margin:s.margin,flex:s.flex,gap:s.gap,text:e.innerText||e.getAttribute('aria-label')||''};});
   return {viewport:{width:innerWidth,height:innerHeight},scrollHeight:body.scrollHeight,geometry:result};
  });
  const a=await measure(original),b=await measure(migrated);
  // Assert geometry as well as presence: screenshots remain subject to a
  // separate visual review. The main brand/header adaptation is documented.
  for(const [selector,rows]of Object.entries(a.geometry)){
   assert.equal(b.geometry[selector].length,rows.length,state+' '+selector+' count');
   rows.forEach((row,i)=>{
    const other=b.geometry[selector][i];
    for(const prop of ['x','width','height'])assert.ok(Math.abs(row[prop]-other[prop])<.5,`${state} ${selector} ${prop}: ${row[prop]} / ${other[prop]}`);
    for(const prop of ['fontSize','lineHeight','padding','margin'])assert.equal(other[prop],row[prop],`${state} ${selector} ${prop}`);
    if(state==='add'||state==='settings')assert.ok(Math.abs(row.y-other.y)<.5,`${state} ${selector} y`);
   });
  }
  report.comparison[state]={original:a,migrated:b,geometryResult:'PASS',result:'EVIDENCE_GENERATED_REQUIRES_VISUAL_REVIEW'};
  await page.frameLocator('#hosted').frameLocator('#opendesk-preview-frame').getByRole('heading',{name:heading,exact:true}).first().waitFor();
  await snapshot('compare-'+state);
 }
 // Settings intentionally diverges from the legacy PC geometry after the
 // 2026-10-31 sidebar redesign. Its seven-section behavioral/visual evidence
 // now lives in settings-preview.mjs; old screenshots remain historical.
 report.settings={status:'INTENTIONAL_SIDEBAR_REDESIGN',driver:'projects/ai-proxy/scripts/settings-preview.mjs'};
 report.evidenceResult='GENERATED';
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 report.behaviorResult=process.argv.includes('--compare-only')?'NOT_RUN':'PASS';report.result='EVIDENCE_GENERATED_VISUAL_NOT_REVIEWED';
}catch(error){report.result='FAIL';report.failure=error.stack;throw error;}
finally{await writeFile(join(out,'preview-browser.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({result:report.result,checks:report.checks,report:join(out,'preview-browser.json')}));
