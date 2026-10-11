import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const directory=resolve(new URL('.',import.meta.url).pathname), identity=JSON.parse(await readFile(join(directory,'current-main-candidate.json'),'utf8'));
const root=identity.directory, extension=join(root,'dist/production'), output=join(directory,'current-main-standalone-06');
await mkdir(join(output,'downloads'),{recursive:true});
const {launchChrome}=await import(join(root,'tests/framework/k5-sdk-native-launcher.mjs'));
const {chromium}=createRequire(import.meta.url)('/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const binary='/Users/shopme/Documents/workspace/opendesk-browser/tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const tool=await readFile(join(extension,'official-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json'));
const result={status:'IN_PROGRESS',scope:'Mac headless real MV3 standalone tool tab; not physical Side Panel or OS keyboard',sourceHead:identity.sourceHead,productionPackageHash:identity.packageHashes.production,toolSha256:sha(tool),toolVersion:JSON.parse(tool).version,driverSha256:sha(await readFile(new URL(import.meta.url))),stages:[],views:[]};
let launched,browser,page;
const save=()=>writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
const stage=async(name,data={})=>{result.stages.push({name,result:'PASS',...data});await save();};
const contrast=(a,b)=>{const lum=c=>c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);};
try{
  launched=await launchChrome({root,binary,extension,headed:false,directory:output,label:'standalone'});
  browser=await chromium.connectOverCDP(launched.endpoint);const context=browser.contexts()[0];
  page=await context.newPage();await page.goto('chrome://extensions');await page.locator('extensions-item').first().waitFor();
  const ids=await page.locator('extensions-item').evaluateAll(items=>items.filter(e=>e.data?.name==='OpenDesk Browser').map(e=>e.id));assert.equal(ids.length,1);
  await page.goto(`chrome-extension://${ids[0]}/ui/tool.html?toolId=knowledge-inbox`);
  await page.locator('#sidebar-tool-discover-tab').click();await page.locator('#sidebar-tool-official-knowledge-inbox-install').click();
  await page.locator('#sidebar-tool-preview').waitFor({state:'visible'});assert.equal(await page.locator('#sidebar-tool-frame iframe').count(),0);
  result.review=await page.locator('#sidebar-tool-preview').innerText();await page.locator('#sidebar-tool-install').click();
  await page.locator('[data-sidebar-tool-action=open][data-sidebar-tool-id=knowledge-inbox]').click();
  const frame=page.frameLocator('#sidebar-tool-frame iframe');await frame.locator('#ki-empty-new').waitFor({state:'visible'});
  await stage('reviewed official install; no execution before confirmation');
  const click=async(selector)=>{
    const control=typeof selector==='string'?frame.locator(selector):selector;
    await control.waitFor({state:'visible'});
    for(let i=0;i<100&&await control.isDisabled();i++)await page.waitForTimeout(100);
    assert.equal(await control.isDisabled(),false);await control.scrollIntoViewIfNeeded();await page.waitForTimeout(180);
    const rect=await control.boundingBox();assert.ok(rect);await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
  };
  const textSession=await context.newCDPSession(page);
  const type=async(selector,value)=>{
    const input=frame.locator(selector);await input.scrollIntoViewIfNeeded();await page.waitForTimeout(180);
    const rect=await input.boundingBox();assert.ok(rect);await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
    assert.equal(await input.evaluate(e=>e.ownerDocument.activeElement===e),true,'Trusted text input must target the focused control');
    await textSession.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4,commands:['selectAll']});
    await textSession.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4});
    assert.equal(await input.evaluate(e=>e.selectionStart===0&&e.selectionEnd===e.value.length),true,'Native Select All must select the complete control');
    await page.keyboard.insertText(value);assert.equal(await input.inputValue(),value);
  };
  const create=async(title,body,button)=>{
    await click(button);await frame.locator('#ki-create-title').waitFor({state:'visible'});
    await frame.locator('#ki-create-title').evaluate(e=>{if(e.ownerDocument.activeElement!==e||e.disabled)throw Error('Create title did not receive unlocked focus');});
    await type('#ki-create-title',title);await type('#ki-create-body',body);await click('#ki-create-save');await frame.locator('#ki-detail').waitFor({state:'visible'});
  };
  const body='# 受控内容\n\n测试段落、**粗体**。\n\n- 列表\n\n> 引用\n\n```js\nconst safe = 1;\n```\n\n| 项目 | 状态 |\n| --- | --- |\n| 测试 | 完成 |\n\n<script>window.injected = true</script>\n\n![测试图片链接](https://example.test/image.png)';
  let remoteImageRequests=0;page.on('request',r=>{if(r.url().includes('example.test/image.png'))remoteImageRequests++;});
  await create('R24.4 受控主题验收',body,'#ki-empty-new');await stage('new record title receives focus; trusted typed input and save');
  await click('#ki-edit');await type('#ki-content',body+'\n\n未保存修改');await click('#ki-edit-cancel');
  await click('#ki-confirm-no');await page.waitForTimeout(150);
  const focus=await frame.locator('#ki-edit-cancel').evaluate(e=>({active:e.ownerDocument.activeElement?.id,visible:!!e.getClientRects().length,disabled:e.disabled}));assert.equal(focus.active,'ki-edit-cancel');assert.ok(focus.visible&&!focus.disabled);
  assert.equal(await frame.locator('#ki-content').inputValue(),body+'\n\n未保存修改');await stage('declining discard restores visible trigger and exact draft',focus);
  await page.keyboard.press('Meta+s');await frame.locator('#ki-editor').waitFor({state:'hidden'});await stage('trusted Mac Cmd+S returns to reader');
  const cdp=await context.newCDPSession(page);
  const capture=async(name)=>{const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(output,name),Buffer.from(shot.data,'base64'));};
  for(const width of [360,400,1000])for(const colorScheme of ['light','dark']){
    await page.setViewportSize({width,height:850});await page.emulateMedia({colorScheme});await page.waitForTimeout(250);
    const host=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dark:matchMedia('(prefers-color-scheme:dark)').matches,navBg:getComputedStyle(document.querySelector('.workbench-nav')).backgroundColor}));
    const detail=await frame.locator('#ki-detail').evaluate(e=>({width:e.ownerDocument.documentElement.clientWidth,scroll:e.ownerDocument.documentElement.scrollWidth,ink:getComputedStyle(e).color,bg:getComputedStyle(e.ownerDocument.body).backgroundColor,muted:getComputedStyle(e.querySelector('#ki-date')).color,images:e.querySelectorAll('img').length,scripts:e.querySelectorAll('script').length,scriptExecuted:!!e.ownerDocument.defaultView.injected}));
    const ratios={body:contrast(detail.ink,detail.bg),secondary:contrast(detail.muted,detail.bg)};
    assert.equal(host.width,host.scroll);assert.equal(detail.width,detail.scroll);assert.ok(ratios.body>=4.5&&ratios.secondary>=4.5);assert.equal(detail.images+detail.scripts,0);assert.equal(detail.scriptExecuted,false);assert.equal(remoteImageRequests,0);
    if(colorScheme==='dark'){assert.notEqual(host.navBg,'rgb(255, 255, 255)');assert.notEqual(detail.bg,'rgb(255, 255, 255)');}
    result.views.push({scope:'standalone CSS viewport',width,theme:colorScheme,host,tool:detail,contrast:ratios});await capture(`standalone-${width}-${colorScheme}.png`);
  }
  await stage('six light/dark standalone viewports, selected text AA contrast, no script/image execution');
  await page.setViewportSize({width:1024,height:850});await page.emulateMedia({colorScheme:'light'});
  await page.evaluate(()=>chrome.tabs.getCurrent().then(t=>chrome.tabs.setZoom(t.id,2)));await page.waitForTimeout(500);
  const zoom=await page.evaluate(async()=>({factor:await chrome.tabs.getZoom((await chrome.tabs.getCurrent()).id),width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(zoom.factor,2);assert.equal(zoom.width,zoom.scroll);await capture('standalone-chrome-200-percent.png');await stage('actual Chrome standalone tab zoom 200 percent',zoom);
  await page.evaluate(()=>chrome.tabs.getCurrent().then(t=>chrome.tabs.setZoom(t.id,1)));await page.setViewportSize({width:1000,height:850});
  await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:join(output,'downloads'),eventsEnabled:true});
  const previousDownloadIds=await page.evaluate(()=>chrome.downloads.search({}).then(items=>items.map(item=>item.id)));
  await click('#ki-more > summary');await click('#ki-download');
  let download;
  for(let i=0;i<100;i++){
    const items=await page.evaluate(()=>chrome.downloads.search({}));
    const fresh=items.filter(item=>!previousDownloadIds.includes(item.id)&&item.url.startsWith('data:text/markdown'));
    assert.ok(fresh.length<=1,'One reviewed action must create at most one download');
    if(fresh[0]?.state==='interrupted')throw Error('Chrome download interrupted: '+fresh[0].error);
    if(fresh[0]?.state==='complete'){download=fresh[0];break;}
    await page.waitForTimeout(100);
  }
  assert.ok(download,'Chrome downloads API must confirm completion; Page download events do not observe SW-owned downloads');
  assert.ok(resolve(download.filename).startsWith(resolve(output,'downloads')+'/'),'Download must remain in this run owned directory');
  const disk=await readFile(download.filename);result.download={downloadId:download.id,state:download.state,filename:download.filename,bytesReceived:download.bytesReceived,totalBytes:download.totalBytes,bytes:disk.length,sha256:sha(disk),scope:'real Chrome download; isolated owned directory; differs from historical Native export'};
  assert.ok(disk.toString('utf8').includes('未保存修改'));await stage('Markdown download complete and disk readback',result.download);
  await click('#ki-back');await frame.locator('.ki-record').first().waitFor();await click(frame.locator('.ki-record').first());
  await frame.locator('#ki-detail').waitFor({state:'visible'});
  for(let i=0;i<100&&await frame.locator('#ki-back').isDisabled();i++)await page.waitForTimeout(100);
  assert.equal(await frame.locator('#ki-back').isDisabled(),false,'Reader must finish its asynchronous open before Escape');
  await page.keyboard.press('Escape');await frame.locator('#ki-list-view').waitFor({state:'visible'});
  let returned=false;
  for(let i=0;i<100;i++){returned=await frame.locator('.ki-record').first().evaluate(e=>e.ownerDocument.activeElement===e&&!e.disabled&&!!e.getClientRects().length);if(returned)break;await page.waitForTimeout(100);}
  assert.ok(returned,'Escape must restore actionable trigger after asynchronous list refresh');await stage('Escape from reader restores list trigger focus');
  await create('第二条受控知识','# 第二条\n\n仅用于键盘测试。','#ki-new');await click('#ki-back');
  await frame.locator('.ki-record').nth(1).waitFor({state:'visible'});await click('#ki-search');
  const focused=()=>frame.locator('#ki-records').evaluate(e=>({id:e.ownerDocument.activeElement?.id,record:e.ownerDocument.activeElement?.dataset?.recordId}));
  for(let i=0;i<35&&!(await focused()).record;i++)await page.keyboard.press('Tab');
  const first=(await focused()).record;assert.ok(first);await page.keyboard.press('ArrowDown');const second=(await focused()).record;assert.ok(second&&second!==first);
  await page.keyboard.press('ArrowUp');assert.equal((await focused()).record,first);await page.keyboard.press('End');assert.equal((await focused()).record,second);await page.keyboard.press('Home');assert.equal((await focused()).record,first);
  await page.keyboard.press('Enter');await frame.locator('#ki-detail').waitFor({state:'visible'});
  for(let i=0;i<100&&await frame.locator('#ki-back').isDisabled();i++)await page.waitForTimeout(100);
  assert.equal(await frame.locator('#ki-back').isDisabled(),false);await page.keyboard.press('Escape');
  let restored=false;for(let i=0;i<100;i++){if((await focused()).record===first){restored=true;break;}await page.waitForTimeout(100);}assert.ok(restored);
  await page.keyboard.press('Shift+Tab');assert.equal((await focused()).id,'ki-sort');await page.keyboard.press('Tab');await page.keyboard.press('/');assert.equal((await focused()).id,'ki-search');
  await stage('two manually created records: Tab, Shift+Tab, arrows, Home, End, Enter, Escape, slash', {firstRecordId:first,secondRecordId:second,keyboardScope:'trusted renderer CDP input; not physical Mac OS input'});
  await cdp.detach();result.status='PASS';
}catch(error){result.status='FAIL';result.error={name:error.name,message:error.message};if(page)await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{
  if(browser)await browser.close().catch(()=>{});
  if(launched){await launched.copyLog();result.cleanup=await launched.stop();}
  await save();console.log(JSON.stringify({status:result.status,stages:result.stages.length,error:result.error}));
}
