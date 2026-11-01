// Explicit offline interaction check. This file is not auto-discovered by npm test.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const project=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(project,'../../..');
const require=createRequire(resolve(project,'preview/react/package.json'));
const {chromium}=require('playwright');
const html=resolve(project,'preview/cookie-editor.html');
const output=resolve(repo,process.env.COOKIE_SERVICE_EVIDENCE||'artifacts/cookie-enterprise-preservation-20261031');
const baselineHead=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
const baselineHTML=execFileSync('git',['show',baselineHead+':examples/sidebar-tools/cookie-editor/preview/cookie-editor.html'],{cwd:repo,encoding:'utf8'});
await mkdir(output,{recursive:true});
const startHash=createHash('sha256').update(await readFile(html)).digest('hex');
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[],errors=[],network=[];
const pages=[];
const fresh=async()=>{
  const context=await browser.newContext({viewport:{width:1000,height:900},timezoneId:'Asia/Shanghai'});
  await context.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
  const page=await context.newPage();pages.push(page);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('file://'+html+'?view=enterprise');
  return page;
};
const button=(page,name)=>page.getByRole('button',{name,exact:true});
const action=(page,name,id)=>page.locator(`${name==='back'?'.svc-subhead ':''}[data-action="svc-${name}"]${id?`[data-id="${id}"]`:''}`);
const shot=async(page,name)=>{
  if(name!=='connecting')await page.locator('#toast').waitFor({state:'hidden'});
  return page.screenshot({path:resolve(output,name+'.png'),clip:await page.locator('#panel').boundingBox()});
};
// Navigation restores focus in requestAnimationFrame; observe after that frame commits.
const active=async page=>{await page.evaluate(()=>new Promise(requestAnimationFrame));return page.evaluate(()=>document.activeElement?.id||document.activeElement?.dataset.action||(document.activeElement?.tagName==='BODY'?'BODY':document.activeElement?.textContent));};
const withinPanel=locator=>locator.evaluate(el=>{
  const box=el.getBoundingClientRect(),viewport=document.getElementById('panelScroll').getBoundingClientRect();
  return box.top>=viewport.top-1&&box.bottom<=viewport.bottom+1;
});
const preservation=[];
const check=async(name,fn)=>{
  if(process.env.COOKIE_SERVICE_CHECK&&!process.env.COOKIE_SERVICE_CHECK.split('|').some(part=>name.includes(part)))return;
  try{await fn();results.push({name,status:'PASS'});console.log('PASS '+name);}
  catch(error){results.push({name,status:'FAIL',error:error.message});throw error;}
};

try{
  await check('Icon actions expose contextual names, dismissible tooltips and neutral account counts',async()=>{
    const page=await fresh();await action(page,'jump').click();
    const detail=action(page,'detail','local-usage'),connect=action(page,'connect','local-usage');
    assert.equal(await detail.getAttribute('aria-label'),'服务详情：本机额度服务');
    assert.equal(await connect.getAttribute('aria-label'),'连接服务：本机额度服务');
    assert.equal(await page.getByRole('img',{name:'已关联账号：0 个',exact:true}).count(),2);
    assert.match(await page.locator('.svc-card').first().innerText(),/关联 0/);
    const size=await connect.boundingBox();assert.ok(size.width>=34&&size.height>=34);
    await shot(page,'icons-default');
    const tip=detail.getByRole('tooltip');
    await detail.hover();await tip.waitFor({state:'visible'});await shot(page,'icons-hover-tooltip');
    await page.keyboard.press('Escape');assert.equal(await tip.isVisible(),false,'Escape dismisses a hovered tooltip without moving focus');
    await page.mouse.move(0,0);await detail.hover();await tip.waitFor({state:'visible'});
    const tipBox=await tip.boundingBox();await page.mouse.move(tipBox.x+tipBox.width/2,tipBox.y+tipBox.height/2);
    assert.equal(await tip.isVisible(),true,'Tooltip remains available while the pointer is over its text');
    await page.mouse.move(0,0);await detail.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    await tip.waitFor({state:'visible'});assert.equal(await active(page),'svc-detail');
    assert.equal(await withinPanel(tip),true,'The keyboard tooltip is visible inside the panel');
    await shot(page,'icons-keyboard-tooltip');
    await page.keyboard.press('Escape');assert.equal(await tip.isVisible(),false);assert.equal(await active(page),'svc-detail');
    await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await tip.waitFor({state:'visible'});
    await page.keyboard.press('Enter');assert.equal(await page.getByRole('heading',{name:'服务详情',exact:true}).isVisible(),true);
    await shot(page,'icons-detail');await action(page,'edit').click();await active(page);
    assert.equal(await button(page,'保存配置').isVisible(),true,'Save keeps its explicit text');
    await button(page,'取消').click();await action(page,'back').click();
    await page.locator('#labService').selectOption('connected');await action(page,'jump').click();
    assert.equal(await page.getByRole('img',{name:'已关联账号：0 个',exact:true}).count(),2,'Connecting does not imply an account is associated');
    assert.equal(await page.getByRole('button',{name:'打开管理页预览：本机额度服务',exact:true}).isVisible(),true);
    assert.match(await page.locator('.svc-card').first().innerText(),/已连接 · 演示/);
    await action(page,'management','local-usage').click();assert.equal(await page.getByRole('heading',{name:'管理页预览',exact:true}).isVisible(),true);
    await action(page,'back').click();await action(page,'associate').click();
    await page.locator('#svcAccount').selectOption('work');await page.locator('#svcResource').selectOption('codex-demo');
    await button(page,'核对关联').click();await button(page,'确认关联').click();await action(page,'back').click();
    assert.equal(await page.getByRole('img',{name:'已关联账号：1 个',exact:true}).count(),1,'The count changes only after an explicit account association');
    await action(page,'jump').click();await page.mouse.move(0,0);await shot(page,'icons-connected');
    await page.locator('#labService').selectOption('unknown');await action(page,'jump').click();
    assert.equal(await page.getByRole('button',{name:'核对原操作：本机额度服务',exact:true}).isVisible(),true);
    assert.equal(await button(page,'添加服务').isDisabled(),true);await shot(page,'icons-unknown');
    await page.locator('#labService').selectOption('default');await action(page,'jump').click();await page.locator('#labTheme').click();
    await page.mouse.move(0,0);await shot(page,'icons-dark');await page.context().close();
  });
  await check('Enterprise overview preserves six tabs and exposes service actions',async()=>{
    const page=await fresh();assert.equal(await page.getByRole('tab').count(),6);
    assert.equal(await page.locator('.svc-card').count(),2);
    assert.equal(await button(page,'添加服务').isVisible(),true);
    assert.equal(await page.locator('.svc-badge.ok').count(),0);
    assert.equal(await page.getByRole('heading',{name:'让团队 AI 账号更好管理',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('heading',{name:'团队常见场景',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('heading',{name:'企业资源概览',exact:true}).isVisible(),true);
    assert.equal(await page.getByRole('link',{name:/官方会员 \/ 席位/}).isVisible(),true);
    assert.equal(await page.locator('#viewEnterprise details').count(),0,'Original UI remains directly displayed');
    // Compare the rendered, complete original block against Git, including links and progress semantics.
    const baseline=await fresh();await baseline.setContent(baselineHTML);await baseline.getByRole('tab',{name:'企业',exact:true}).click();
    const original=await baseline.locator('#viewEnterprise .custom-content').innerHTML();
    const retained=await page.locator('#viewEnterprise .custom-content').evaluate(el=>{
      const copy=el.cloneNode(true);copy.querySelector('.svc-jump').remove();
      const title=copy.querySelector('h2');for(const attribute of ['id','class','tabindex'])title.removeAttribute(attribute);
      return copy.innerHTML;
    });
    assert.equal(retained,original,'Every original region, text, value, action and relative order remains intact');
    preservation.push({baselineHead,renderedOriginalBlock:'IDENTICAL_AFTER_REMOVING_ADDED_JUMP_AND_FOCUS_ATTRIBUTES'});
    const contrast=await page.locator('#viewEnterprise .custom-content').evaluate(root=>{
      const rgb=color=>(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
      const luminance=color=>rgb(color).map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
      return [...root.querySelectorAll('.custom-hero p,.custom-feature p,.custom-callout,.custom-usage-row small,.note')].map(el=>{
        let parent=el,bg='rgb(255,255,255)';
        while(parent){const c=getComputedStyle(parent).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break;}parent=parent.parentElement;}
        const fg=luminance(getComputedStyle(el).color),back=luminance(bg);
        return {text:el.textContent,ratio:(Math.max(fg,back)+0.05)/(Math.min(fg,back)+0.05)};
      });
    });
    assert.ok(contrast.length>5&&contrast.every(item=>item.ratio>=4.5),'Original explanatory text has readable contrast');
    preservation.push({originalExplanatoryContrast:contrast});
    await baseline.context().close();
    await shot(page,'overview');
    for(const [selector,name] of [['.custom-features','original-team-scenarios'],['.custom-usage','original-resource-overview'],['.enterprise-cta','original-membership-and-custom']]){
      // Center documentary screenshots: Chromium nearest scrolling can leave 1–2px behind the fixed footer.
      const region=page.locator('#viewEnterprise '+selector);await region.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
      assert.equal(await withinPanel(region),true,name+' is actually visible inside the scroller');await shot(page,name);
    }
    assert.equal(await page.getByRole('link',{name:/官方会员 \/ 席位/}).getAttribute('href'),'https://chatgpt.com/pricing/');
    await page.getByRole('button',{name:'了解企业定制',exact:false}).click();
    assert.equal(await page.getByRole('tab',{name:'定制',exact:true}).getAttribute('aria-selected'),'true');
    await page.getByRole('tab',{name:'企业',exact:true}).click();await action(page,'jump').click();
    assert.equal(await active(page),'svcConnections');assert.equal(await withinPanel(page.locator('#svcConnections')),true);
    assert.equal(await page.evaluate(()=>window.scrollY),0,'Jump scrolls only the side panel');
    await shot(page,'service-region');
    await action(page,'overview').click();assert.equal(await active(page),'svcTitle');
    assert.equal(await page.locator('#panelScroll').evaluate(el=>el.scrollTop),0);
    await page.getByRole('tab',{name:'Cookie',exact:true}).click();assert.equal(await page.locator('#viewCookies').isVisible(),true);
    await page.getByRole('tab',{name:'账号',exact:true}).click();assert.equal(await page.locator('.account-row').count(),3);
    await page.context().close();
  });
  await check('Persistent actions work without hover, with keyboard and touch, and return to visible triggers',async()=>{
    const page=await fresh();await action(page,'jump').focus();await page.keyboard.press('Enter');
    assert.equal(await withinPanel(page.locator('#svcConnections')),true);
    await page.keyboard.press('Tab');assert.equal(await active(page),'svc-refresh');
    await page.keyboard.press('Enter');assert.equal(await active(page),'svc-refresh');
    assert.equal(await withinPanel(action(page,'refresh')),true);
    await page.keyboard.press('Tab');assert.equal(await active(page),'svc-add');
    await page.keyboard.press('Tab');assert.equal(await active(page),'svc-detail');
    await page.keyboard.press('Enter');assert.equal(await active(page),'svcTitle');
    await action(page,'edit').click();await active(page);await page.locator('#svcName').fill('键盘草稿');
    await page.getByRole('tab',{name:'市场',exact:true}).click();await button(page,'继续编辑').click();
    assert.equal(await active(page),'svcName');assert.equal(await withinPanel(page.locator('#svcName')),true);
    await action(page,'back').click();await button(page,'放弃更改').click();
    await page.waitForFunction(()=>document.activeElement?.dataset.action==='svc-edit');
    assert.equal(await withinPanel(action(page,'edit')),true);
    await action(page,'back').click();await page.waitForFunction(()=>document.activeElement?.dataset.action==='svc-detail');
    assert.equal(await withinPanel(action(page,'detail','local-usage')),true);
    assert.equal(await page.evaluate(()=>window.scrollY),0);
    await page.context().close();
    const context=await browser.newContext({viewport:{width:1000,height:900},hasTouch:true});
    await context.route(/^https?:/,route=>{network.push(route.request().url());return route.abort();});
    const touch=await context.newPage();touch.on('pageerror',error=>errors.push(error.message));
    await touch.goto('file://'+html+'?view=enterprise');await action(touch,'jump').tap();
    await action(touch,'detail','local-usage').tap();await action(touch,'edit').tap();
    assert.equal(await touch.getByRole('heading',{name:'编辑服务',exact:true}).isVisible(),true);
    const size=await action(touch,'back').boundingBox();assert.ok(size.width>=44&&size.height>=44,'Coarse-pointer target remains usable');
    await shot(touch,'touch-configuration');await context.close();
  });
  await check('Local/company configuration validates fields and saving stays unconnected',async()=>{
    const page=await fresh();await button(page,'添加服务').click();
    await button(page,'保存配置').click();assert.equal(await active(page),'svcName');
    assert.equal(await page.locator('#svcName').getAttribute('aria-invalid'),'true');
    await page.getByRole('radio',{name:'公司服务'}).check();
    await page.locator('#svcName').fill('设计团队');
    for(const origin of ['http://team.example.com','https://team.example.com/','https://team.example.com/path','https://user:pass@team.example.com','https://team.example.com?x=1']){
      await page.locator('#svcOrigin').fill(origin);await button(page,'保存配置').click();
      assert.equal(await page.locator('#svcOrigin').getAttribute('aria-invalid'),'true');
    }
    await shot(page,'configuration-error');
    await page.locator('#svcOrigin').fill('https://design.example.com');await shot(page,'configuration');
    await button(page,'保存配置').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/设计团队[\s\S]*未连接/);
    assert.equal(await action(page,'associate').isDisabled(),true);
    await action(page,'back').click();assert.equal(await page.locator('.svc-card').count(),3);
    await page.context().close();
  });
  await check('Add service: clear local setup, separate address drafts and exact origin validation',async()=>{
    const page=await fresh();await button(page,'添加服务').click();
    assert.equal(await page.getByRole('radio',{name:/此电脑上的服务/}).isChecked(),true);
    assert.equal(await page.locator('#svcConfigForm input:not([type="radio"])').count(),2);
    assert.equal(await withinPanel(button(page,'保存配置')),true,'Save is visible before scrolling');
    assert.equal(await withinPanel(page.locator('#svcConfigForm summary')),true,'Startup help remains visible above the actions');
    const helpBox=await page.locator('#svcConfigForm summary').boundingBox(),saveBox=await page.locator('#svcConfigForm .svc-form-footer').boundingBox();
    assert.ok(helpBox.y+helpBox.height<=saveBox.y,'Actions do not cover the startup help');
    assert.equal(await page.locator('#svcOrigin').inputValue(),'','No invented default endpoint');
    assert.match(await page.locator('#svcConfigForm').innerText(),/此电脑上已启动的账号额度服务/);
    assert.match(await page.locator('#svcOriginHelp').innerText(),/Cookie 同步设置.*生成新应用连接码/);
    await shot(page,'add-local-empty');
    await page.getByText('服务还没启动，或找不到地址？',{exact:true}).click();
    assert.match(await page.locator('#svcConfigForm details').innerText(),/地址随启动可能改变/);
    await shot(page,'add-local-help-top');
    await page.locator('#svcConfigForm details p').last().scrollIntoViewIfNeeded();
    assert.equal(await withinPanel(page.locator('#svcConfigForm details p').last()),true,'Expanded startup help can be read completely');
    const expandedHelp=await page.locator('#svcConfigForm details').boundingBox();
    const expandedActions=await page.locator('#svcConfigForm .svc-form-footer').boundingBox();
    assert.ok(expandedHelp.y+expandedHelp.height<=expandedActions.y,'Actions never cover expanded help');
    await button(page,'保存配置').scrollIntoViewIfNeeded();
    assert.equal(await withinPanel(button(page,'保存配置')),true,'Save is reachable after expanded help');
    await shot(page,'add-local-help');
    await page.locator('#svcName').fill('我的第二个服务');
    await page.locator('#svcOrigin').fill('http://usage-second.localhost:43121');
    await page.getByRole('radio',{name:'公司服务'}).check();
    assert.equal(await page.locator('#svcName').inputValue(),'我的第二个服务');
    assert.equal(await page.locator('#svcOrigin').inputValue(),'','A company does not inherit a loopback origin');
    await page.locator('#svcOrigin').fill('https://second.example.com');await shot(page,'add-company');
    await page.getByRole('radio',{name:/此电脑上的服务/}).check();
    assert.equal(await page.locator('#svcOrigin').inputValue(),'http://usage-second.localhost:43121');
    for(const value of ['http://team.example.com','https://not-local.example.com','http://localhost.evil.example:43121','file:///tmp/service','http://user:pass@localhost:43121','http://localhost:43121/','http://localhost:43121/pair#pair=secret','http://localhost:43121?code=secret']){
      await page.locator('#svcOrigin').fill(value);await button(page,'保存配置').click();
      assert.equal(await active(page),'svcOrigin');assert.equal(await page.locator('#svcOrigin').getAttribute('aria-invalid'),'true');
      assert.equal(await page.locator('#svcName').inputValue(),'我的第二个服务');
    }
    await shot(page,'add-local-invalid');
    await page.locator('#svcOrigin').fill('http://usage-second.localhost:43121');await button(page,'保存配置').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/我的第二个服务[\s\S]*未连接/);
    assert.match(await page.locator('#viewEnterprise').innerText(),/http:\/\/usage-second.localhost:43121/);
    assert.equal(await action(page,'associate').isDisabled(),true);await shot(page,'add-local-saved');
    await action(page,'back').click();assert.equal(await page.locator('.svc-card').count(),3,'Distinct local endpoints are distinct configurations');
    await button(page,'添加服务').click();await page.getByRole('radio',{name:'公司服务'}).check();
    await page.locator('#svcName').fill('公司地址检查');
    for(const value of ['https://localhost','https://usage-demo.localhost:43121','https://127.0.0.1','https://[::1]']){
      await page.locator('#svcOrigin').fill(value);await button(page,'保存配置').click();assert.equal(await active(page),'svcOrigin');
    }
    await page.context().close();
  });
  await check('Add service: connection code review, return to edit and offline helper stay coherent',async()=>{
    const page=await fresh();await button(page,'添加服务').click();await page.locator('#labServiceExample').click();
    assert.equal(await page.locator('#svcOrigin').inputValue(),'http://usage-example.localhost:43121');
    await button(page,'保存配置').click();await action(page,'connect').click();
    assert.match(await page.locator('.svc-lead').innerText(),/usage-example.localhost:43121/);
    await page.locator('#svcCode').fill('invalid');await button(page,'确认连接 · 演示').click();
    assert.equal(await active(page),'svcCode');assert.equal(await page.locator('#svcConnectError').isVisible(),true);
    assert.match(await page.locator('#svcConnectError').innerText(),/0–9、a–f/);await shot(page,'add-code-invalid');
    await page.locator('#labServiceExample').click();assert.equal(await page.locator('#svcCode').inputValue(),'d'.repeat(64));
    assert.equal(await page.locator('#svcCode').getAttribute('type'),'password');await shot(page,'add-code-review');
    await button(page,'返回修改配置').click();await button(page,'继续编辑').click();
    assert.equal(await page.locator('#svcCode').inputValue(),'d'.repeat(64));
    await button(page,'返回修改配置').click();await button(page,'放弃更改').click();
    assert.equal(await page.locator('#svcName').inputValue(),'我的额度服务');
    assert.equal(await page.locator('#svcOrigin').inputValue(),'http://usage-example.localhost:43121');
    await page.locator('#svcName').fill('修正后的服务');await button(page,'保存配置').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/修正后的服务[\s\S]*未连接/);
    await action(page,'connect').click();assert.equal(await page.locator('#svcCode').inputValue(),'','Old code was discarded');
    await page.locator('#labServiceExample').click();await button(page,'确认连接 · 演示').click();
    await page.getByRole('heading',{name:'服务详情',exact:true}).waitFor();
    assert.match(await page.locator('#viewEnterprise').innerText(),/已连接 · 演示/);
    assert.match(await page.locator('#viewEnterprise').innerText(),/尚未授权/);await shot(page,'add-connected');
    await action(page,'edit').click();await active(page);assert.equal(await page.locator('#svcOrigin').getAttribute('readonly'),'');
    await page.locator('#svcName').fill('重命名服务');await button(page,'保存配置').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/重命名服务[\s\S]*已连接/);
    await action(page,'disconnect').click();await page.getByRole('dialog').getByRole('button',{name:'断开连接',exact:true}).click();
    await action(page,'edit').click();await active(page);assert.equal(await page.locator('#svcOrigin').getAttribute('readonly'),null);
    await page.locator('#svcOrigin').fill('http://usage-new.localhost:43122');await button(page,'保存配置').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/未连接/);assert.match(await page.locator('#viewEnterprise').innerText(),/usage-new.localhost:43122/);
    await page.context().close();
  });
  await check('Dirty drafts survive tab navigation, Escape, and continue editing',async()=>{
    const page=await fresh();await button(page,'添加服务').click();await page.locator('#svcName').fill('保留我的草稿');
    await page.getByRole('tab',{name:'账号',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'放弃未保存的更改？'});await dialog.waitFor();
    await shot(page,'unsaved-draft');await button(page,'继续编辑').click();
    assert.equal(await page.locator('#svcName').inputValue(),'保留我的草稿');
    assert.equal(await active(page),'svcName','Continue editing returns focus to the draft field');
    await page.locator('#svcName').focus();await page.keyboard.press('Escape');await dialog.waitFor();
    await page.keyboard.press('Escape');assert.equal(await active(page),'svcName');
    assert.equal(await page.locator('#labTheme').isDisabled(),true);
    await button(page,'取消').click();await button(page,'放弃更改').click();
    await page.waitForFunction(()=>document.activeElement?.dataset.action==='svc-add');
    assert.equal(await page.locator('#labTheme').isEnabled(),true);
    await button(page,'添加服务').click();await button(page,'取消').click();
    assert.equal(await page.getByRole('dialog').isVisible(),false);
    await page.context().close();
  });
  await check('Failed configuration save preserves input and supports an explicit retry',async()=>{
    const page=await fresh();await page.locator('#labFault').selectOption('write');
    await button(page,'添加服务').click();await page.getByRole('radio',{name:'公司服务'}).check();
    await page.locator('#svcName').fill('保存失败后保留');await page.locator('#svcOrigin').fill('https://retry.example.com');
    await button(page,'保存配置').click();
    assert.match(await page.locator('#svcConfigError').innerText(),/输入已保留/);
    assert.equal(await page.locator('#svcName').inputValue(),'保存失败后保留');
    await shot(page,'save-failure');await page.locator('#svcName').fill('保存失败后更正');
    assert.equal(await page.locator('#svcConfigError').isVisible(),false,'Correcting a field clears the outdated form error');
    await button(page,'保存配置').click();
    assert.equal(await page.getByRole('heading',{name:'服务详情',exact:true}).isVisible(),true);
    await page.context().close();
  });
  await check('Connection review, resource association, scope review and management preview are coherent',async()=>{
    const page=await fresh();await action(page,'connect','local-usage').click();
    await button(page,'确认连接 · 演示').click();assert.equal(await active(page),'svcCode');
    assert.match(await page.locator('#svcCode').getAttribute('aria-describedby'),/svcConnectError/);
    await page.locator('#svcCode').fill('d'.repeat(64));
    assert.equal(await page.locator('#svcConnectError').isVisible(),false,'Entering a connection code clears the earlier error');
    await shot(page,'connection-review');
    await button(page,'确认连接 · 演示').click();assert.equal(await action(page,'confirm-connect').isDisabled(),true);
    await shot(page,'connecting');await page.getByRole('heading',{name:'服务详情',exact:true}).waitFor();
    assert.match(await page.locator('#viewEnterprise').innerText(),/已连接 · 演示/);
    await action(page,'associate').click();await page.locator('#svcAccount').selectOption('work');await page.locator('#svcResource').selectOption('codex-demo');
    await button(page,'核对关联').click();await shot(page,'association-review');
    await action(page,'back').click();
    assert.equal(await page.locator('#svcAccount').inputValue(),'work');assert.equal(await page.locator('#svcResource').inputValue(),'codex-demo');
    await button(page,'核对关联').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/手动关联 · 身份未核验/);
    await button(page,'确认关联').click();assert.match(await page.locator('#viewEnterprise').innerText(),/已关联|1 个/);
    await action(page,'policy').click();assert.equal(await button(page,'接受此范围').isDisabled(),true);
    assert.match(await page.locator('#viewEnterprise').innerText(),/工作账号[\s\S]*shop.example.com[\s\S]*codex-demo/,'Authorization names exact resources');
    await page.locator('#svcAcceptScope').check();await shot(page,'scope-review');
    await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor();await button(page,'继续编辑').click();
    assert.equal(await page.locator('#svcAcceptScope').isChecked(),true);
    await button(page,'接受此范围').click();await shot(page,'connected-detail');
    await action(page,'management').click();await shot(page,'management-preview');
    assert.match(await page.locator('#viewEnterprise').innerText(),/离线示意/);
    await action(page,'policy').click();await action(page,'back').click();
    assert.equal(await page.getByRole('heading',{name:'管理页预览',exact:true}).isVisible(),true);
    await action(page,'policy').click();await page.locator('#svcAcceptScope').check();await button(page,'接受此范围').click();
    assert.equal(await page.getByRole('heading',{name:'管理页预览',exact:true}).isVisible(),true,'Accepting review returns to its management origin');
    await action(page,'back').click();
    assert.equal(await page.getByRole('heading',{name:'服务详情',exact:true}).isVisible(),true,'Management back reaches detail without a cycle');
    await action(page,'associate').click();
    assert.notEqual(await page.locator('#svcResource option[value="codex-demo"]').getAttribute('disabled'),null,'Remote resource cannot be bound twice');
    await action(page,'back').click();
    await page.getByRole('button',{name:'解除工作账号的关联',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'解除关联',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.dataset.action==='svc-associate');
    assert.equal(await withinPanel(action(page,'associate')),true,'Unlink returns visible focus to the next association action');
    assert.match(await page.locator('#viewEnterprise').innerText(),/尚未授权/,'Binding changes invalidate the reviewed scope');
    await action(page,'policy').click();assert.equal(await page.locator('#svcAcceptScope').isDisabled(),true,'No resource means no grant');
    await action(page,'back').click();await action(page,'disconnect').click();
    await button(page,'取消').click();assert.equal(await active(page),'svc-disconnect');
    await action(page,'disconnect').click();await page.getByRole('dialog').getByRole('button',{name:'断开连接',exact:true}).click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/已断开/);
    await page.getByRole('tab',{name:'账号',exact:true}).click();assert.equal(await page.locator('.account-row').count(),3);
    await page.context().close();
  });
  await check('Disconnect preserves association configuration and invalidates the reviewed grant',async()=>{
    const page=await fresh();await page.locator('#labService').selectOption('connected');await action(page,'detail','local-usage').click();
    await action(page,'associate').click();await page.locator('#svcAccount').selectOption('work');await page.locator('#svcResource').selectOption('codex-demo');
    await button(page,'核对关联').click();await button(page,'确认关联').click();
    await action(page,'policy').click();await page.locator('#svcAcceptScope').check();await button(page,'接受此范围').click();
    await action(page,'disconnect').click();assert.match(await page.getByRole('dialog').innerText(),/保留/);
    await page.getByRole('dialog').getByRole('button',{name:'断开连接',exact:true}).click();
    const text=await page.locator('#viewEnterprise').innerText();assert.match(text,/已断开/);assert.match(text,/工作账号/);assert.match(text,/连接后可用/);assert.match(text,/尚未授权/);
    assert.equal(await page.getByRole('button',{name:'解除工作账号的关联',exact:true}).count(),1);
    await shot(page,'disconnected-preserves-config');
    await action(page,'edit').click();await active(page);await page.locator('#svcOrigin').fill('http://usage-replacement.localhost:43122');await button(page,'保存配置').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/未连接/);assert.match(await page.locator('#viewEnterprise').innerText(),/尚未授权/);
    assert.equal(await page.getByRole('button',{name:'解除工作账号的关联',exact:true}).count(),0,'Changing the recipient retires the previous association');
    await shot(page,'changed-recipient');await page.context().close();
  });
  await check('Duplicate service configuration is rejected without silently discarding its draft',async()=>{
    const page=await fresh();await button(page,'添加服务').click();await page.locator('#svcName').fill('另一个本机名称');await page.locator('#svcOrigin').fill('http://usage-demo.localhost:43121');
    await button(page,'保存配置').click();assert.match(await page.locator('#svcConfigError').innerText(),/已有配置/);
    assert.equal(await page.locator('#svcName').inputValue(),'另一个本机名称');
    await button(page,'查看已有服务').click();await button(page,'放弃更改').click();
    assert.equal(await page.getByRole('heading',{name:'服务详情',exact:true}).isVisible(),true);
    await page.context().close();
  });
  await check('Local account updates and deletion invalidate stale associations and authorization',async()=>{
    for(const mutation of ['update','delete']){
      const page=await fresh();await page.locator('#labService').selectOption('connected');await action(page,'detail','local-usage').click();
      await action(page,'associate').click();await page.locator('#svcAccount').selectOption('work');await page.locator('#svcResource').selectOption('codex-demo');
      await button(page,'核对关联').click();await button(page,'确认关联').click();await action(page,'policy').click();
      await page.locator('#svcAcceptScope').check();await button(page,'接受此范围').click();await page.getByRole('tab',{name:'账号',exact:true}).click();
      if(mutation==='update'){
        await page.locator('#labRenewCookie').click();await page.locator('[data-action="quick-update"][data-id="work"]').click();
      }else{
        await page.getByRole('button',{name:'工作账号更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'删除快照',exact:true}).click();
        await page.locator('#confirmSheet').click();
      }
      await page.getByRole('tab',{name:'企业',exact:true}).click();await action(page,'detail','local-usage').click();
      assert.match(await page.locator('#viewEnterprise').innerText(),/关联已失效/,'Changed local account cannot retain a stale binding');
      assert.match(await page.locator('#viewEnterprise').innerText(),/尚未授权/);
      assert.equal(await page.getByRole('button',{name:'解除工作账号的关联',exact:true}).count(),0);
      await action(page,'policy').click();assert.equal(await page.locator('#svcAcceptScope').isDisabled(),true);
      await shot(page,'account-'+mutation+'-invalidates-scope');await page.context().close();
    }
  });
  await check('Unchanged edit cancels to detail and connected receiver is read-only',async()=>{
    const page=await fresh();await page.locator('#labService').selectOption('connected');
    await action(page,'detail','local-usage').click();await action(page,'edit').click();await active(page);await button(page,'取消').click();
    assert.equal(await page.getByRole('heading',{name:'服务详情',exact:true}).isVisible(),true);
    await action(page,'back').click();await action(page,'connect','company-demo').click();await button(page,'确认连接 · 演示').click();
    await page.getByRole('heading',{name:'服务详情',exact:true}).waitFor();await action(page,'edit').click();await active(page);
    assert.equal(await page.locator('#svcOrigin').getAttribute('readonly'),'');
    await page.locator('#svcName').fill('公司新名称');await button(page,'保存配置').click();
    assert.match(await page.locator('#viewEnterprise').innerText(),/已连接 · 演示/);
    await page.context().close();
  });
  const bindAndReview=async page=>{
    await page.locator('#labService').selectOption('connected');await action(page,'detail','local-usage').click();
    await action(page,'associate').click();await page.locator('#svcAccount').selectOption('work');await page.locator('#svcResource').selectOption('codex-demo');
    await button(page,'核对关联').click();await button(page,'确认关联').click();
    await action(page,'policy').click();await page.locator('#svcAcceptScope').check();await button(page,'接受此范围').click();
  };
  await check('Ordinary snapshot form update invalidates the previous binding and reviewed scope',async()=>{
    const page=await fresh();await bindAndReview(page);await page.getByRole('tab',{name:'账号',exact:true}).click();
    await page.getByRole('button',{name:'工作账号更多操作',exact:true}).click();
    await page.getByRole('menuitem',{name:'更新关联 Cookie',exact:true}).click();
    await page.locator('#snapshotDetails > summary').click();await page.locator('[data-linked-cookie]').first().uncheck();
    await button(page,'更新账号 Cookie').click();
    await page.getByRole('button',{name:'工作账号更多操作',exact:true}).click();
    await page.getByRole('menuitem',{name:'查看关联 Cookie',exact:true}).click();
    assert.match(await page.locator('.snapshot-source strong').innerText(),/7 条/,'The actual selected snapshot changed');
    await page.locator('[data-action="cancel-profile"]').first().click();
    await page.getByRole('tab',{name:'企业',exact:true}).click();await action(page,'detail','local-usage').click();
    await shot(page,'ordinary-snapshot-update-invalidates-scope');
    assert.equal(await page.getByRole('button',{name:'解除工作账号的关联',exact:true}).count(),0);
    assert.match(await page.locator('#viewEnterprise').innerText(),/关联已失效/);
    assert.match(await page.locator('#viewEnterprise').innerText(),/尚未授权/);await page.context().close();
  });
  await check('Website selection invalidates the old binding and grant without deleting local accounts',async()=>{
    const page=await fresh();await bindAndReview(page);await page.locator('#sitePick').selectOption('docs.example.org');
    await shot(page,'site-change-invalidates-scope');
    assert.equal(await page.getByRole('button',{name:'解除工作账号的关联',exact:true}).count(),0);
    assert.match(await page.locator('#viewEnterprise').innerText(),/尚未授权/);
    await page.locator('#sitePick').selectOption('shop.example.com');
    assert.equal(await page.getByRole('button',{name:'解除工作账号的关联',exact:true}).count(),0,'Old bindings do not reappear when returning');
    await page.getByRole('tab',{name:'账号',exact:true}).click();assert.equal(await page.locator('.account-row').count(),3);
    await page.context().close();
  });
  await check('Discarding a service draft to change tabs focuses the selected destination tab',async()=>{
    const page=await fresh();await button(page,'添加服务').click();await page.locator('#svcName').fill('离开草稿');
    await page.getByRole('tab',{name:'市场',exact:true}).click();await button(page,'放弃更改').click();
    await page.evaluate(()=>new Promise(requestAnimationFrame));await shot(page,'discard-to-market-focus');
    assert.equal(await active(page),'tabMarket');
    assert.equal(await page.getByRole('tab',{name:'市场',exact:true}).getAttribute('aria-selected'),'true');
    await page.context().close();
  });
  await check('Unknown outcome allows only reconciliation and does not create a new operation',async()=>{
    const page=await fresh();await page.locator('#labService').selectOption('unknown');await shot(page,'unknown-overview');
    assert.equal(await button(page,'添加服务').isDisabled(),true);
    await action(page,'connect','local-usage').click();
    assert.equal(await button(page,'核对原操作').isVisible(),true);
    assert.equal(await action(page,'edit').isDisabled(),true);
    assert.equal(await action(page,'confirm-connect').count(),0);
    await button(page,'核对原操作').click();assert.match(await page.locator('#viewEnterprise').innerText(),/结果待核对/);
    await shot(page,'unknown-detail');await page.context().close();
  });
  await check('Empty, unavailable, expired and error states have an honest recovery path',async()=>{
    const page=await fresh();
    for(const state of ['empty','error','unavailable','expired']){
      await page.locator('#labService').selectOption(state);
      if(state==='empty')assert.match(await page.locator('#viewEnterprise').innerText(),/连接你的第一个服务/);
      else{await action(page,'detail','local-usage').click();assert.match(await page.locator('#viewEnterprise').innerText(),state==='error'?/连接未成功/:state==='unavailable'?/服务尚未启动/:/会话已过期/);}
      await shot(page,state);
      if(state==='unavailable'){
        await button(page,'重新核对服务状态').click();assert.equal(await active(page),'svc-connect','Detail recovery focuses the next connection action');
        await page.locator('#labService').selectOption('default');await page.locator('#labService').selectOption('unavailable');
        await action(page,'detail','local-usage').click();await action(page,'connect').click();
        assert.equal(await button(page,'确认连接 · 演示').isDisabled(),true);
        assert.match(await page.locator('#viewEnterprise').innerText(),/服务尚未运行，暂不能连接/);
        assert.equal(await button(page,'返回修改配置').isVisible(),true);await shot(page,'unavailable-connect-review');
        await button(page,'重新核对服务状态').click();
        assert.equal(await active(page),'svcCode','Connection recovery focuses the empty code input');
        assert.equal(await withinPanel(page.locator('#svcCode')),true);await shot(page,'unavailable-recovered-focus');
        assert.equal(await button(page,'确认连接 · 演示').isEnabled(),true,'A status refresh never submits a connection');
        assert.equal(await page.locator('#svcCode').inputValue(),'');await action(page,'back').click();
        assert.match(await page.locator('#viewEnterprise').innerText(),/未连接/);
        await action(page,'connect').click();assert.equal(await page.locator('#svcCode').count(),1);
        assert.equal(await page.locator('#svcCode').inputValue(),'','Recovery still requires a fresh connection code and explicit confirmation');
        await action(page,'back').click();
      }
    }
    await page.context().close();
  });
  await check('Dark tool theme keeps the laboratory light and main controls keyboard accessible',async()=>{
    const page=await fresh();await page.locator('#labTheme').click();await shot(page,'overview-dark');
    assert.equal(await page.locator('#panel').evaluate(el=>el.classList.contains('dark')),true);
    await page.getByRole('tab',{name:'企业',exact:true}).focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab',{name:'市场',exact:true}).getAttribute('aria-selected'),'true');
    await page.context().close();
  });
  assert.deepEqual(errors,[],'No page errors');assert.deepEqual(network,[],'No real service network requests');
  assert.equal(createHash('sha256').update(await readFile(html)).digest('hex'),startHash,'Candidate did not change during verification');
}finally{
  await browser.close();
  await writeFile(resolve(output,'interactions.json'),JSON.stringify({source:'examples/sidebar-tools/cookie-editor/preview/cookie-editor.html',sha256:startHash,checkedAt:new Date().toISOString(),mode:'OFFLINE_HTML_CHROMIUM',preservation,results,pageErrors:errors,networkRequests:network,nativeChrome:'NOT_TESTED'},null,2)+'\n');
}
