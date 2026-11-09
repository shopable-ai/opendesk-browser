import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {startSidebarToolLayoutServer} from '../helpers/sidebar-tool-layout-server.mjs';

// Explicit browser entry, like sidebar-tools-focus-react. The default suite
// never starts a browser. Ego was tried first; its installed page SDK collides
// with the HTTP sandbox's SDK, so this fixture needs a clean browser context.
const modulePath=process.env.OPENDESK_PLAYWRIGHT_MODULE;
test('Host allocates one bounded canvas to unchanged HTML/Vue/React and Web Flow',{
  skip:modulePath?false:'NOT_TESTED: OPENDESK_PLAYWRIGHT_MODULE required',timeout:90000
},async t=>{
  const {chromium}=await import(modulePath);
  const fixture=await startSidebarToolLayoutServer();
  t.after(()=>fixture.close());
  assert.deepEqual(fixture.gaps,[],'all original consumer sources must compile');
  const browser=await chromium.launch({headless:true,...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?
    {executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{})});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:400,height:600}}),errors=[],evidence=[];
  t.after(()=>writeFile(fixture.outputDir+'/measurements.json',JSON.stringify({evidence,errors},null,2)+'\n'));
  page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.addInitScript(()=>{
    window.layoutHints=[];
    addEventListener('message',event=>{
      if(event.source===parent&&event.data?.kind==='layout')window.layoutHints.push(event.data.availableHeight);
    });
  });
  await page.goto(fixture.url);await page.waitForFunction(()=>window.fixture||window.fixtureError);
  assert.equal(await page.evaluate(()=>window.fixtureError),undefined);
  const frame=()=>page.frameLocator('#sidebar-tool-frame iframe');
  async function open(id){
    await page.evaluate(id=>fixture.open(id),id);
    await frame().locator('#tool-status').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('#sidebar-tool-frame iframe')?.getBoundingClientRect().height>0);
    return (await page.locator('#sidebar-tool-frame iframe').elementHandle()).contentFrame();
  }
  async function layout(label){
    const value=await page.evaluate(async()=>{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const selectors=['#workspace-content','#sidebar-tool-display','#sidebar-tool-frame','#sidebar-tool-frame iframe'];
      return {viewport:{width:innerWidth,height:innerHeight},nodes:selectors.map(selector=>{
        const n=document.querySelector(selector),r=n.getBoundingClientRect();
        return {selector,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right,
          cw:n.clientWidth,sw:n.scrollWidth,ch:n.clientHeight,sh:n.scrollHeight};}),
        opaque:document.querySelector('iframe').contentDocument===null};
    });
    const [workspace,display,,canvas]=value.nodes;
    assert.equal(value.opaque,true,'real opaque-origin sandbox');
    for(const n of [workspace,display]){
      assert.ok(n.sh<=n.ch+1,label+' outer vertical overflow: '+JSON.stringify(n));
      assert.ok(n.sw<=n.cw+1,label+' outer horizontal overflow: '+JSON.stringify(n));
    }
    assert.ok(canvas.x>=display.x-1&&canvas.right<=display.right+1,label+' canvas is not clipped');
    assert.ok(canvas.height>0&&canvas.bottom<=value.viewport.height+1,label+' canvas must fit allocation');
    evidence.push({label,...value});return canvas;
  }
  async function canvasHint(f){
    await f.waitForFunction(()=>document.getElementById('tool-root').style.getPropertyValue('--opendesk-host-available-height'));
    return f.evaluate(()=>({hint:parseFloat(document.getElementById('tool-root').style.getPropertyValue('--opendesk-host-available-height')),
      viewport:innerHeight,hints:window.layoutHints}));
  }
  async function openAppAction(name){
    const header=page.locator('.sidebar-tool-view-head');
    const direct=header.getByRole('button',{name,exact:true});
    if(await direct.isVisible())return direct.click();
    await header.getByRole('button',{name:'更多操作',exact:true}).click();
    await page.getByRole('menuitem',{name,exact:true}).click();
  }

  let sandbox=await open('webflow');
  await page.getByRole('button',{name:'运行与授权：当前任务、任务授权及使用说明',exact:true}).waitFor();
  const withControls=await layout('Web Flow overview with trusted controls');
  await page.getByRole('button',{name:'运行与授权：当前任务、任务授权及使用说明',exact:true}).click();
  await page.getByRole('dialog',{name:'运行与授权',exact:true}).waitFor();
  assert.equal((await layout('trusted runtime panel open')).height,withControls.height,'opening the existing sheet preserves canvas');
  await page.getByRole('button',{name:'关闭运行与授权',exact:true}).click();
  assert.equal(await sandbox.locator('#webflow-app').evaluate(n=>n.clientHeight),await sandbox.evaluate(()=>innerHeight));
  await openAppAction('帮助');
  await frame().getByRole('heading',{name:'使用与排障',exact:true}).waitFor();
  await layout('Web Flow help');
  const scroll=frame().locator('.wf-body');
  const before=await scroll.evaluate(n=>({top:n.scrollTop,ch:n.clientHeight,sh:n.scrollHeight}));
  assert.ok(before.sh>before.ch,'help must genuinely overflow its business scroll area');
  await scroll.hover();await page.mouse.wheel(0,2500);
  await sandbox.waitForFunction(()=>document.querySelector('.wf-body').scrollTop>0);
  assert.equal(await sandbox.evaluate(()=>document.scrollingElement.scrollTop),0,'iframe document is not a second scroller');
  await scroll.evaluate(n=>{n.tabIndex=0;n.focus();});await page.keyboard.press('ControlOrMeta+End');
  await scroll.evaluate(n=>n.scrollTop=n.scrollHeight);
  assert.ok(await scroll.evaluate(n=>n.scrollTop+n.clientHeight>=n.scrollHeight-1),'last help section is reachable');
  await page.screenshot({path:fixture.outputDir+'/webflow-help.png'});
  const initial=await layout('help bottom');
  await page.evaluate(()=>fixture.setControlsHeight(164));
  await page.waitForFunction(h=>Math.abs(document.querySelector('iframe').getBoundingClientRect().height-h)<2,initial.height-100);
  const reduced=await layout('expanded outer controls');assert.ok(Math.abs(initial.height-reduced.height-100)<2);
  const hint=await canvasHint(sandbox);assert.ok(Math.abs(hint.hint-reduced.height)<2);
  const samples=await sandbox.evaluate(async()=>{const out=[];for(let i=0;i<12;i++){
    await new Promise(resolve=>requestAnimationFrame(resolve));out.push(document.getElementById('tool-root').clientHeight);}return out;});
  assert.equal(new Set(samples).size,1,'no intrinsic-height feedback or oscillation');
  const count=await sandbox.evaluate(()=>layoutHints.length);
  await sandbox.evaluate(async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>requestAnimationFrame(resolve));});
  assert.equal(await sandbox.evaluate(()=>layoutHints.length),count,'stable allocations are deduplicated');
  await page.evaluate(()=>fixture.setControlsHeight(64));await page.setViewportSize({width:320,height:300});
  await layout('narrow short help');
  await page.setViewportSize({width:400,height:600});
  await page.locator('#sidebar-tool-back').click();
  for(const name of ['脚本','记录','概览']){
    await frame().getByRole('tab',{name,exact:true}).click();await layout('Web Flow '+name);
  }
  await openAppAction('应用偏好');
  await frame().getByRole('heading',{name:'应用偏好',exact:true}).waitFor();await layout('Web Flow preferences');
  await page.locator('#sidebar-tool-back').click();
  await page.evaluate(()=>fixture.setSurface('page'));sandbox=await (await page.locator('iframe').elementHandle()).contentFrame();
  await sandbox.locator('#tool-status').waitFor({state:'hidden'});await layout('standalone page surface');
  assert.equal(await page.locator('html').getAttribute('data-opendesk-surface'),'tool-page');
  await page.evaluate(()=>fixture.setSurface('sidebar'));

  sandbox=await open('html');await layout('unchanged HTML');
  await sandbox.getByRole('button').click();
  await sandbox.getByText('网页标题读取成功',{exact:true}).waitFor();
  assert.match(await sandbox.locator('#runtime-title').innerText(),/Layout fixture chat/);
  // While an operation is pending, Back keeps the iframe but must restore the
  // ordinary list scroll owner. No installation or task operation is invoked.
  const retained=await page.locator('iframe').elementHandle();
  await sandbox.evaluate(()=>OpenDeskTool.setState({dirty:false,busy:true}));
  await page.waitForFunction(()=>fixture.view.getSnapshot().fields['sidebar-tool-back'].hidden!==true);
  await page.locator('#sidebar-tool-back').click();
  await page.locator('#sidebar-tool-list-view').waitFor({state:'visible'});
  await page.evaluate(()=>fixture.app.renderRows({rows:Array.from({length:80},(_,i)=>({key:'app:row-'+i,title:'列表 '+i,
    kind:'app',type:'应用',installed:true,primaryAction:'打开'})),busy:false,pendingKey:null}));
  const list=await page.locator('#workspace-content').evaluate(n=>({overflow:getComputedStyle(n).overflowY,ch:n.clientHeight,sh:n.scrollHeight}));
  assert.equal(list.overflow,'auto');assert.ok(list.sh>list.ch);
  await page.locator('[data-extension-key="app:row-79"][data-extension-action="main"]').focus();
  assert.ok(await page.locator('#workspace-content').evaluate(n=>n.scrollTop>0),'last row remains keyboard reachable');
  await page.evaluate(()=>fixture.open('html'));
  assert.equal(await page.locator('iframe').evaluate((n,old)=>n===old,retained),true,'busy instance survives list navigation');
  await sandbox.evaluate(()=>OpenDeskTool.setState({dirty:false,busy:false}));

  for(const id of ['vue','react']){
    sandbox=await open(id);const canvas=await layout('unchanged '+id);
    const note=sandbox.locator('textarea');await note.waitFor({state:'visible'});
    await note.fill('layout compatibility '+id);
    await sandbox.getByRole('button',{name:id==='vue'?'保存':'保存笔记',exact:true}).click();
    await sandbox.getByText('已保存',{exact:true}).waitFor();
    // Textarea resizing is a supported legacy user action. The app document
    // must scroll while Host's allocation remains unchanged.
    await note.evaluate(n=>n.style.height='1000px');
    await note.focus();await page.keyboard.press('Tab');
    await sandbox.waitForFunction(()=>document.scrollingElement.scrollTop>0);
    assert.equal((await layout(id+' natural document scroll')).height,canvas.height);
    if(id==='react'){
      await sandbox.getByText('查看 7 天原始数据',{exact:true}).click();
      await sandbox.locator('tbody tr').last().scrollIntoViewIfNeeded();
      assert.equal(await sandbox.locator('tbody tr').count(),7);
      await sandbox.getByRole('button',{name:'上周',exact:true}).click();
      await sandbox.getByRole('img',{name:/上周模拟趋势/}).waitFor();
    }
    await page.screenshot({path:fixture.outputDir+'/'+id+'-legacy.png'});
    await page.evaluate(()=>fixture.close());
    const leave=page.getByRole('button',{name:'放弃未保存内容并继续',exact:true});
    if(await leave.isVisible())await leave.click();
    await page.locator('#sidebar-tool-frame iframe').waitFor({state:'detached'});
    sandbox=await open(id);
    assert.equal(await sandbox.locator('textarea').inputValue(),'layout compatibility '+id,'same SDK storage survives reopen');
  }
  // Auto-height nested flex targets (e.g. Knowledge import) must also stretch
  // the generic iframe. This is a CSS-only stand-in for that existing target.
  const nested=await page.evaluate(()=>{
    const target=document.createElement('div');target.style.cssText='display:flex;flex-direction:column;min-height:300px;width:300px';
    const child=document.createElement('iframe');child.className='sidebar-tool-iframe';target.append(child);document.body.append(target);
    const result={target:target.getBoundingClientRect().height,iframe:child.getBoundingClientRect().height};target.remove();return result;
  });
  assert.equal(nested.iframe,nested.target,'nested auto-height target stretches its iframe');
  const calls=await page.evaluate(()=>fixture.calls);
  assert.equal(calls.some(call=>/^tasks\.(start|stop)$/.test(call.operation)),false,'no real task starts');
  assert.equal(calls.some(call=>call.blocked),false,'no privileged mutation is attempted');
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>fixture.errors),[]);
  await writeFile(fixture.outputDir+'/result.json',JSON.stringify({browser:browser.version(),evidence,calls,errors,nested},null,2)+'\n');
  t.diagnostic('Evidence: '+fixture.outputDir);
});
