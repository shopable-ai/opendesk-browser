// Targeted current-source preview check. No installer, production service or build.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const project=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(project,'../../..');
const output=resolve(repo,process.env.COOKIE_SOURCE_EVIDENCE||'artifacts/cookie-service-preservation-20261031/final');
const url='http://127.0.0.1:43134/dev.html',origin=new URL(url).origin;
const require=createRequire(resolve(project,'preview/react/package.json'));
const {chromium,expect}=require('playwright/test');
const paths=['app/CookieEditorApp.jsx','app/components/CookieBusinessPanels.jsx',
  'app/components/CookieHttpConnections.jsx','src/react.css','preview/react/src/App.jsx',
  'preview/react/src/mock-sdk.js','app/components/CookieEditorView.jsx','preview/cookie-editor.html'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[
  path,createHash('sha256').update(await readFile(resolve(project,path))).digest('hex')])));
const source=await hashes(),results=[],pageErrors=[],nonPreviewNetwork=[],screenshots=[];
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1000,height:900},timezoneId:'Asia/Shanghai'});
context.on('page',page=>page.on('pageerror',error=>pageErrors.push(error.message)));
await context.route('**/*',async route=>{
  const target=new URL(route.request().url());
  if(/^https?:$/.test(target.protocol)&&target.origin!==origin){
    nonPreviewNetwork.push(target.href);return route.abort();
  }
  // Test-only telemetry around the actual preview factory, retaining all real
  // app/domain behavior. This exposes only the existing read-only inspect API.
  if(target.origin===origin&&target.pathname==='/src/mock-sdk.js'){
    const response=await route.fetch();
    const body=(await response.text()).replace('export function createMockSdk(',
      'function createInspectedMockSdk(')+
      '\nexport function createMockSdk(...args){const sdk=createInspectedMockSdk(...args);globalThis.__serviceListInspect=()=>sdk.inspect();return sdk;}\n';
    return route.fulfill({response,body});
  }
  return route.continue();
});
const page=await context.newPage();page.setDefaultTimeout(8000);
const button=name=>page.getByRole('button',{name,exact:true});
const tab=name=>page.getByRole('tab',{name,exact:true});
const form=()=>page.getByRole('form',{name:'HTTP 服务连接编辑'});
const nameField=()=>page.getByRole('textbox',{name:'服务名称',exact:true});
const address=()=>page.getByRole('textbox',{name:'服务地址',exact:true});
const radio=type=>page.getByRole('radio',{name:type==='local'?'此电脑上的服务':'公司服务',exact:true});
const cards=()=>page.locator('.cookie-http-list .cookie-http-card');
// The App can re-read Cookie metadata after dismissing a review. Those reads
// are unrelated to service dispatch; scoped storage/network calls are relevant.
const telemetry=()=>page.evaluate(()=>globalThis.__serviceListInspect().calls.filter(
  call=>call.op.startsWith('browser.storage.')||call.op.startsWith('browser.network.')));
const shot=async(name,target=page.locator('.cookie-app'))=>{
  await target.screenshot({path:resolve(output,name+'.png')});screenshots.push(name+'.png');
};
const check=async(name,run)=>{
  try{await run();results.push({name,status:'PASS'});console.log('PASS '+name);}
  catch(error){results.push({name,status:'FAIL',error:error.message});throw error;}
};
const jump=async count=>{
  await page.getByRole('button',{name:new RegExp('^服务连接 · '+count+' 个')}).click();
  await expect(page.locator('.cookie-http-connections')).toHaveAttribute('data-view','list');
};
// Playwright visibility alone does not establish scroller/viewport visibility.
const inViewport=async locator=>{
  await expect(locator).toBeVisible();
  assert.equal(await locator.evaluate(el=>{
    const box=el.getBoundingClientRect();let top=0,bottom=innerHeight,left=0,right=innerWidth;
    for(let p=el.parentElement;p;p=p.parentElement){
      const css=getComputedStyle(p),r=p.getBoundingClientRect();
      if(/auto|scroll|hidden|clip/.test(css.overflowY)){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
      if(/auto|scroll|hidden|clip/.test(css.overflowX)){left=Math.max(left,r.left);right=Math.min(right,r.right);}
    }
    return box.top>=top-1&&box.bottom<=bottom+1&&box.left>=left-1&&box.right<=right+1;
  }),true,'Element is fully visible inside viewport and clipping ancestors');
};
const visibleFirstTwo=async()=>{for(let i=0;i<2;i++)await inViewport(cards().nth(i));};
const fixtures=[['本机额度服务','http://usage-demo.localhost:43121'],['示例公司','https://team.example.com']];
const list=async count=>{
  await expect(cards()).toHaveCount(count);
  for(const [index,[label,endpoint]] of fixtures.slice(0,count).entries()){
    const card=page.getByRole('article',{name:'服务：'+label,exact:true});
    await expect(card.getByText(endpoint,{exact:true})).toBeVisible();
    await expect(card.locator('[data-status]')).toHaveAttribute('data-status','UNCONNECTED');
    await expect(card.locator('.cookie-http-associations')).toHaveText(/关联\s*0/);
    await expect(card.getByRole('img',{name:'已关联账号：0 个',exact:true})).toBeVisible();
    await expect(card.locator('.cookie-http-card-name')).toContainText(index===0?'此电脑 ·':'公司 ·');
    await expect(card.getByRole('group',{name:label+'的操作',exact:true})).toBeVisible();
  }
};
let overview;
const overviewMarkup=()=>page.locator('.cookie-enterprise-overview').evaluate(el=>{
  const clone=el.cloneNode(true);clone.querySelector('.cookie-http-entry').textContent='Service entry count checked separately';
  return clone.innerHTML;
});
const preserved=async()=>{
  const root=page.locator('.cookie-enterprise-overview');
  assert.equal(await overviewMarkup(),overview,'All enterprise overview DOM survives');
  for(const title of ['让团队 AI 账号更好管理','团队常见场景','企业资源概览'])
    await expect(root.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect(root.locator('.cookie-business-feature')).toHaveCount(3);
  await expect(root.locator('.cookie-business-usage-row')).toHaveCount(4);
  await expect(root.getByRole('link',{name:'官方会员 / 席位',exact:true})).toHaveAttribute('href','https://chatgpt.com/pricing/');
  await expect(root.getByRole('button',{name:'了解企业定制',exact:true})).toBeVisible();
};
const draft={local:['本机草稿','http://draft.localhost:43121'],company:['公司草稿','https://draft.example.com']};
const assertDraft=async type=>{
  await expect(radio(type)).toBeChecked();await expect(nameField()).toHaveValue(draft[type][0]);
  await expect(address()).toHaveValue(draft[type][1]);
};
const fillBoth=async()=>{
  for(const type of ['local','company']){
    await radio(type).check();await expect(nameField()).toHaveValue('');await expect(address()).toHaveValue('');
    await nameField().fill(draft[type][0]);await address().fill(draft[type][1]);
  }
};
const leave=kind=>kind==='Escape'?nameField().press('Escape'):button(kind).click();
try{
  await page.goto(url);
  await expect(tab('企业')).toHaveAttribute('aria-selected','true');
  await expect(page.getByTestId('scenario')).toHaveValue('serviceConnections');
  await expect(page.getByRole('tab')).toHaveCount(6);
  // Open the external lab only to fix its existing width control, then close it.
  await page.locator('.demo-lab summary').click();await page.getByTestId('width').selectOption('380');
  await page.locator('.demo-lab summary').click();
  await expect(page.locator('.cookie-http-header-actions button').first()).toBeEnabled();
  overview=await overviewMarkup();
  await check('default enterprise overview and original two unconnected services',async()=>{
    await preserved();await shot('overview');await jump(2);await list(2);await visibleFirstTwo();await shot('list');
  });
  await check('detail back restores two services, original detail focus and visible cards',async()=>{
    await button('服务详情：本机额度服务').click();
    await expect(page.getByRole('heading',{name:'服务详情',exact:true})).toBeVisible();
    await expect(page.getByRole('article',{name:'服务：本机额度服务',exact:true})).toContainText(fixtures[0][1]);
    await shot('detail');await button('返回服务列表').click();
    await expect(button('服务详情：本机额度服务')).toBeFocused();await list(2);await visibleFirstTwo();
    await button('刷新服务列表').click();await expect(button('刷新服务列表')).toBeEnabled();await list(2);
    await button('返回企业概览').click();await inViewport(page.getByRole('button',{name:/^服务连接 ·/}));
    await preserved();await jump(2);
  });
  await check('untouched cancel is immediate and restores Add focus and visible original cards',async()=>{
    const before=await telemetry();await button('添加服务').click();
    await expect(nameField()).toHaveValue('');await expect(address()).toHaveValue('');
    await shot('add-local');await radio('company').check();await expect(address()).toHaveValue('');
    await expect(nameField()).toHaveValue('');await shot('add-company');
    await button('取消').click();await expect(form()).toHaveCount(0);
    await expect(button('放弃')).toHaveCount(0);await expect(button('添加服务')).toBeFocused();
    await visibleFirstTwo();await list(2);await preserved();assert.deepEqual(await telemetry(),before);
  });
  await check('both type drafts survive cancel/back/Escape review and continue; discard never dispatches',async()=>{
    for(const type of ['local','company'])for(const exit of ['取消','返回服务列表','Escape']){
      await jump(2);const before=await telemetry();await button('添加服务').click();await fillBoth();
      await radio(type).check();await assertDraft(type);await leave(exit);
      await button('继续编辑').click();await assertDraft(type);
      const other=type==='local'?'company':'local';await radio(other).check();await assertDraft(other);
      await radio(type).check();await assertDraft(type);
      assert.deepEqual(await telemetry(),before,'Editing/type switching/continue must not dispatch');
      await leave(exit);await button('放弃').click();await expect(form()).toHaveCount(0);
      await expect(button('添加服务')).toBeFocused();await visibleFirstTwo();await list(2);await preserved();
      assert.deepEqual(await telemetry(),before,'Discard must not dispatch');
      await jump(2);await button('添加服务').click();
      for(const value of ['local','company']){
        await radio(value).check();await expect(nameField()).toHaveValue('');await expect(address()).toHaveValue('');
      }
      await button('取消').click();await visibleFirstTwo();
    }
  });
  await check('field adjacent empty input errors and expanded help stay above footer',async()=>{
    await jump(2);await button('添加服务').click();await nameField().press('Enter');
    await expect(nameField()).toHaveAttribute('aria-invalid','true');
    await expect(nameField().locator('..').locator('#cookie-http-name-error')).toBeVisible();
    await nameField().fill('新增预览服务');await address().press('Enter');
    await expect(address()).toHaveAttribute('aria-invalid','true');
    await expect(address().locator('..').locator('#cookie-http-address-error')).toBeVisible();
    await expect(address()).toHaveValue('');
    await page.locator('.cookie-http-setup summary').click();
    await page.locator('.cookie-http-setup p').last().scrollIntoViewIfNeeded();
    const help=await page.locator('.cookie-http-setup').boundingBox();
    const footer=await page.locator('.cookie-http-form-footer').boundingBox();
    assert.ok(help&&footer&&help.y+help.height<=footer.y+1,'Expanded help never overlaps footer');
    await shot('help');
    await address().fill('http://new-preview.localhost:43121');await button('保存配置').click();
    await expect(form()).toHaveCount(0);
  });
  await check('save adds exactly one unconnected service and refresh/navigation retain all three',async()=>{
    await jump(3);await list(3);
    const added=page.getByRole('article',{name:'服务：新增预览服务',exact:true});
    await expect(added).toHaveCount(1);await expect(added).toContainText('http://new-preview.localhost:43121');
    await expect(added.locator('[data-status]')).toHaveAttribute('data-status','UNCONNECTED');
    await expect(added.locator('.cookie-http-associations')).toHaveText(/关联\s*0/);
    await shot('saved3');await button('刷新服务列表').click();await expect(button('刷新服务列表')).toBeEnabled();await list(3);
    await tab('Cookie').click();await tab('企业').click();await jump(3);await list(3);
    // Count text changes only; all original enterprise content stays present.
    await preserved();
    await button('了解企业定制').click();await expect(tab('定制')).toHaveAttribute('aria-selected','true');
    await tab('企业').click();await jump(3);await list(3);await preserved();
    const writes=(await telemetry()).filter(call=>call.op==='browser.storage.local.set');
    assert.equal(writes.length,1,'Only the explicit save persists a new configuration');
  });
  await check('pairing is explicit, masks its code, rejects invalid 64-character input and restores focus on cancel',async()=>{
    await jump(3);await list(3);
    const before=await telemetry();
    await button('连接服务：本机额度服务').click();
    // Password inputs intentionally have no implicit textbox role.
    const password=page.getByLabel('应用一次性配对码',{exact:true});
    await expect(password).toHaveAttribute('type','password');
    await expect(password).toHaveValue('');await password.fill('a'.repeat(63));
    await button('确认连接').click();
    await expect(page.locator('#cookie-http-form-error')).toContainText('64 位');
    await expect(password).toHaveValue('a'.repeat(63));
    assert.deepEqual(await telemetry(),before,'Invalid pairing never dispatches or implicitly connects');
    await button('取消').click();await expect(form()).toHaveCount(0);
    await expect(button('连接服务：本机额度服务')).toBeFocused();
    await list(3);assert.deepEqual(await telemetry(),before);
  });
  await check('external truly empty scenario stays empty after untouched add/cancel',async()=>{
    await page.locator('.demo-lab summary').click();await page.getByTestId('scenario').selectOption('serviceConnectionsEmpty');
    await page.locator('.demo-lab summary').click();await expect(tab('企业')).toHaveAttribute('aria-selected','true');
    await jump(0);await expect(cards()).toHaveCount(0);
    await expect(page.getByText('连接你的第一个服务',{exact:true})).toBeVisible();
    await expect(button('添加服务')).toHaveCount(1);
    await expect(page.getByText('尚未配置服务。先添加地址，再使用应用一次性配对码连接。',{exact:true})).toBeVisible();
    const before=await telemetry();await button('添加服务').click();await button('取消').click();
    await expect(button('添加服务')).toBeFocused();await jump(0);await expect(cards()).toHaveCount(0);
    assert.deepEqual(await telemetry(),before);await shot('empty');
  });
  await check('original HTML list/add baseline uses real service jump and add actions',async()=>{
    const baseline=await context.newPage();
    await baseline.goto(pathToFileURL(resolve(project,'preview/cookie-editor.html')).href+'?view=enterprise');
    await baseline.locator('#labWidth').selectOption('380');
    await expect(baseline.getByRole('tab')).toHaveCount(6);
    for(const title of ['让团队 AI 账号更好管理','团队常见场景','企业资源概览'])
      await expect(baseline.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await baseline.locator('.svc [data-action="svc-jump"], [data-action="svc-jump"]').click();
    await expect(baseline.locator('.svc-card')).toHaveCount(2);
    for(const [label,endpoint] of fixtures){
      const row=baseline.getByRole('article',{name:'服务：'+label,exact:true});
      await expect(row).toContainText(endpoint);await expect(row).toContainText(/关联\s*0/);
    }
    await shot('original-list',baseline.locator('#panel'));
    await baseline.locator('[data-action="svc-add"]').click();
    await expect(baseline.getByRole('heading',{name:'添加服务',exact:true})).toBeVisible();
    await shot('original-add',baseline.locator('#panel'));await baseline.close();
  });
  assert.deepEqual(pageErrors,[]);assert.deepEqual(nonPreviewNetwork,[]);
  assert.deepEqual(await hashes(),source,'Relevant sources remained stable during this run');
}finally{
  await browser.close();
  await writeFile(resolve(output,'interactions.json'),JSON.stringify({
    mode:'CURRENT_SOURCE_PREVIEW_ONLY',url,viewport:{width:1000,height:900},panelWidth:380,
    source,results,screenshots,pageErrors,nonPreviewNetwork,
    telemetry:'Test-only preview mock factory wrapper exposes existing inspect(); no domain/network changes',
    nativeInstalledChrome:'NOT_TESTED',checkedAt:new Date().toISOString()
  },null,2)+'\n');
}
