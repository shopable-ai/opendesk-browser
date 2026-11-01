// Evidence: STATIC_PREVIEW_CHROME. No extension, Native, real AI or installation.
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Read computed values and laid-out boxes, never CSS source strings. The fixture
// caller supplies real public React buttons, without consumer CSS/reset rules.
export async function observePublicControlGeometry(page) {
  return page.locator('#controls button').evaluateAll(nodes => nodes.map(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return {id:el.id, size:el.dataset.size || 'default', boxSizing:s.boxSizing,
      height:r.height, width:r.width, minHeight:s.minHeight};
  }));
}

export async function observeExplicitLightSemantics(page, selector, attribute) {
  const root = page.locator(selector);
  const previous = await root.getAttribute(attribute);
  const values = [];
  try {
    await root.evaluate((el, attr) => el.setAttribute(attr, 'light'), attribute);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({colorScheme});
      values.push(await root.evaluate(el => {
        const probe = document.createElement('span');
        el.append(probe);
        const result = {osDark:matchMedia('(prefers-color-scheme: dark)').matches};
        try {
          for (const name of ['warning','positive','warning-bg','warning-border','warning-ink']) {
            probe.style.color = 'var(--od-' + name + ')';
            const actual = getComputedStyle(probe).color;
            probe.style.color = 'var(--od-light-' + name + ')';
            const expected = getComputedStyle(probe).color;
            result[name] = {actual, expected};
          }
          return result;
        } finally { probe.remove(); }
      }));
    }
  } finally {
    await root.evaluate((el, {attribute, previous}) => {
      if (previous === null) el.removeAttribute(attribute); else el.setAttribute(attribute, previous);
    }, {attribute, previous});
    await page.emulateMedia({colorScheme:null});
  }
  return values;
}

export async function verifyKitNavigation(page, assert) {
  const observations = [];
  const nav = page.getByRole('navigation', {name:'页面组合',exact:true});
  for (const theme of ['light','dark']) {
    await page.locator('#recipe-theme').selectOption(theme);
    for (const name of ['偏好设置','基础控件','资源工作台']) {
      await nav.getByRole('button', {name,exact:true}).click();
      // Move both pointer and keyboard focus out of the navigation. Persistent
      // selection must survive without hover, active or focus styling.
      await page.locator('#recipe-theme').focus();
      await page.mouse.move(0,0);
      await page.waitForTimeout(150); // canonical 100ms background transition
      const states = await nav.getByRole('button').evaluateAll(nodes => nodes.map(el => {
        const s = getComputedStyle(el);
        return {name:el.textContent.trim(), selected:el.getAttribute('aria-pressed'),
          color:s.color, background:s.backgroundColor, border:s.borderTopColor,
          borderWidth:s.borderTopWidth, shadow:s.boxShadow,
          hover:el.matches(':hover'), focus:el.matches(':focus')};
      }));
      const selected = states.find(row => row.name === name);
      assert(states.filter(row => row.selected === 'true').length === 1 && selected?.selected === 'true',
        theme+' navigation has one selected destination: '+name, states);
      assert(!selected.hover && !selected.focus && states.filter(row => row !== selected).every(row =>
        ['color','background','border','borderWidth','shadow'].some(key => row[key] !== selected[key])),
        theme+' navigation selection remains visible without hover or focus: '+name, states);
      observations.push({theme,name,states});
    }
  }
  await page.locator('#recipe-theme').selectOption('light');
  return observations;
}

export async function verifyPreview(page, {repo = ROOT, artifact, out} = {}) {
  const dir = join(out,'browser-' + Date.now());
  await fs.mkdir(dir,{recursive:true});
  const digest = data => crypto.createHash('sha256').update(data).digest('hex');
  const manifest = JSON.parse(await fs.readFile(artifact + '/manifest.json','utf8'));
  const evidence = {grade:'STATIC_PREVIEW_CHROME', nativeChrome:'NOT_TESTED', realAI:'NOT_TESTED', browser:page.context().browser().version(), platform:process.platform, sourceHash:manifest.sourceHash, htmlHash:digest(await fs.readFile(artifact + '/preview.html')), checks:[], styles:[], network:[], errors:[]};
  for (const [path, expected] of Object.entries(manifest.inputs)) {
    if (digest(await fs.readFile(repo + '/' + path)) !== expected) throw Error('Artifact input drift: ' + path);
  }
  evidence.observerHash = digest(await fs.readFile(repo + '/scripts/tests/sidebar-preview-kit-browser.mjs'));
  const assert = (ok, name, detail) => { if (!ok) throw Error(name + ': ' + JSON.stringify(detail)); evidence.checks.push(name); };
  const wait = () => page.waitForFunction(() => document.readyState === 'complete');
  await page.emulateMedia({reducedMotion:'reduce'});
  const status = () => page.locator('#app-status').innerText();
  const focused = () => page.evaluate(() => document.activeElement.id);
  const type = async (locator, text) => { await locator.click(); await locator.press('ControlOrMeta+A'); await locator.press('Backspace'); await locator.pressSequentially(text); };
  const state = index => page.locator('#preview-state [data-state="'+['ready','empty','error','revoked','busy','long','denied'][index]+'"]').click();
  const visibleFocus = () => page.evaluate(() => {
    const el = document.activeElement, r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && el.matches(':focus-visible');
  });
  let reference;
  page.on('pageerror', error => evidence.errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') evidence.errors.push(msg.text()); });
  page.on('request', req => { if (/^https?:/.test(req.url())) evidence.network.push(req.url()); });
  try {
    await page.goto('file://' + artifact + '/preview.html'); await wait();
    assert(await page.locator('#item-list>div').count() === 2,'initial list');
    assert(await page.locator('#list-view .od-shared-card').count() === 1 && await page.locator('#item-list .od-shared-card').count() === 0,'one collection surface without per-record cards');
    assert(await page.getByRole('list', {name:'条目',exact:true}).getByRole('listitem').count() === 2,'record list semantics');
    assert(await page.locator('#edit-1').getAttribute('aria-label') === '编辑：示例记录' && await page.locator('#remove-1').getAttribute('aria-label') === '删除：示例记录','row actions identify the target');
    assert(!await page.locator('#app-status').isVisible(),'ready status does not occupy content space');
    evidence.layout = await page.locator('#item-list').evaluate(el => {
      const style = getComputedStyle(el), app = getComputedStyle(document.getElementById('od-preview-app'));
      return {rowGap:style.rowGap, expectedGap:style.getPropertyValue('--space-2').trim(), gutter:app.paddingLeft, expectedGutter:app.getPropertyValue('--space-3').trim()};
    });
    assert(evidence.layout.rowGap === evidence.layout.expectedGap && evidence.layout.gutter === evidence.layout.expectedGutter,'collection gap and single app gutter follow canonical tokens',evidence.layout);
    assert(await page.getByRole('tab').count() === 5,'five visible product tabs');
    assert(await page.locator('.preview-device #od-preview-controls').count() === 0,'auxiliary controls outside device');
    await page.locator('#sidebar-tool-back').click();
    assert(await page.locator('#od-preview-return').isVisible(),'host back to list');
    await page.locator('#od-preview-reopen').click();
    await page.locator('#sidebar-tool-remove').click(); await page.keyboard.press('Escape');
    assert(await focused() === 'sidebar-tool-remove','uninstall Escape restores trigger');
    await page.locator('#sidebar-tool-remove').click(); await page.locator('#od-preview-cancel-uninstall').click();
    assert(await focused() === 'sidebar-tool-remove','uninstall cancel restores trigger');
    await page.locator('#sidebar-tool-remove').click(); await page.locator('#od-preview-accept-uninstall').click();
    assert(await page.locator('#od-preview-uninstalled').isVisible(),'simulated uninstall');
    await page.locator('#od-preview-reset').click();

    assert(await page.locator('#sidebar-tool-title[role=heading]').count() === 1,'single main heading');
    await page.locator('#create-item').click();
    assert(await focused() === 'item-title','create focuses input');
    // Guard fixture only; this does not simulate macOS's native IME candidate UI.
    await page.locator('#item-title').dispatchEvent('keydown',{key:'Escape',isComposing:true,bubbles:true});
    assert(await page.locator('#form-view').isVisible(),'HTML composing Escape does not discard the form');
    assert(await page.locator('#reset-items').isDisabled() && await page.locator('#od-design-theme').isDisabled(),'unsaved form protects external controls');
    await page.locator('#item-title').press('Enter');
    assert(await page.locator('#item-error').isVisible(),'empty submit shows error');
    assert(await page.locator('#item-title').getAttribute('aria-invalid') === 'true','field error association');
    await page.locator('#item-title').press('Tab'); assert(await focused() === 'save-item','Tab reaches save');
    await page.keyboard.press('Shift+Tab'); assert(await focused() === 'item-title','Shift+Tab returns input');
    await type(page.locator('#item-title'),'原生键盘新建'); await page.locator('#item-title').press('Enter');
    assert(await page.locator('#item-list>div').count() === 3,'save creates one item');
    assert(await focused() === 'create-item','save restores origin focus');
    await page.locator('#edit-3').click(); await type(page.locator('#item-title'),'取消不提交'); await page.locator('#cancel-form').click();
    assert((await page.locator('#item-list').innerText()).includes('原生键盘新建') && !(await page.locator('#item-list').innerText()).includes('取消不提交'),'cancel preserves data');
    assert(await focused() === 'edit-3','cancel restores row focus');
    await page.locator('#edit-3').click(); await type(page.locator('#item-title'),'已编辑'); await page.locator('#save-item').click();
    assert((await page.locator('#item-list').innerText()).includes('已编辑'),'edit saves existing item');
    await page.locator('#edit-3').click(); await page.keyboard.press('Escape');
    assert(await page.locator('#list-view').isVisible() && await focused() === 'edit-3','Escape cancels form');
    await page.locator('#remove-3').click(); assert(await focused() === 'cancel-delete','confirm starts on safe action');
    await page.locator('#cancel-delete').click();
    assert(await page.locator('#item-list>div').count() === 3 && await focused() === 'remove-3','delete cancel preserves item and focus');
    await page.locator('#remove-3').click(); await page.keyboard.press('Escape');
    assert(await page.locator('#item-list>div').count() === 3 && await focused() === 'remove-3','Escape cancels confirmation');
    await page.locator('#remove-3').click(); await page.locator('#confirm-delete').click();
    assert(await page.locator('#item-list>div').count() === 2 && await focused() === 'create-item','confirmed delete and fallback focus');
    await state(1); assert(await page.locator('#item-list>div').count() === 0 && !await page.locator('#create-item').isDisabled() && !await page.locator('#item-collection').isVisible(),'empty state is actionable without an empty surface');
    for (const [index, label] of [[2,'failure'],[3,'revoked'],[4,'busy'],[6,'denied']]) {
      await state(index);
      assert(await page.locator('#create-item').isDisabled() && await page.locator('#refresh-items').isDisabled() && !await page.locator('#reset-items').isDisabled() && await page.locator('#item-list>div').count() === 0,label + ' blocks mutations');
      assert(!await page.locator('#item-collection').isVisible(),label + ' does not leave an empty collection surface');
      assert((await status()).length > 0,label + ' has status text');
    }
    await state(5); assert(await page.locator('#item-list>div').count() === 24,'long state has scrollable content');
    await page.locator('#edit-24').scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.locator('#edit-24').click(); await page.locator('#cancel-form').click();
    assert(await focused() === 'edit-24','long form return focuses origin');
    assert(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) < 2,'long form restores scroll');
    const rectVisible = await page.locator('#edit-24').evaluate(el => { const r=el.getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight; });
    assert(rectVisible,'restored focus is visible');
    await state(0);
    await page.locator('#reset-items').click(); assert(await page.locator('#item-list>div').count() === 2,'reset uses local data');
    const canonical = await fs.readFile(repo+'/src/ui/design-tokens.css','utf8') + '\n' + await fs.readFile(repo+'/src/ui/design-system.css','utf8') + '\n' + await fs.readFile(repo+'/src/ui/react/components/ui/sidebar-shared.css','utf8');
    reference = await page.context().newPage();
    await reference.emulateMedia({reducedMotion:'reduce'});
    await reference.setContent('<!doctype html><html><head><style>'+canonical+'</style></head><body><main class="od-theme-shadcn" data-theme="light"><h1 id="ref-title" class="od-page-title">Canonical 参考</h1><input id="ref-before" class="od-field" aria-label="参考输入"><button type="button" id="ref-main" class="od-button od-button--primary">新建</button><button type="button" id="ref-row-action" class="od-button od-button--quiet">编辑</button><button type="button" id="ref-danger" class="od-button od-button--quiet">删除</button><button type="button" id="ref-disabled" class="od-button od-button--primary" disabled>新建</button><div class="od-page-head"><div class="od-page-actions"><button type="button" id="ref-icon" class="od-icon-button" aria-label="刷新条目">↻</button></div></div><div class="od-stack"><div id="ref-surface" class="od-shared-card"><div id="ref-content" class="od-shared-card-content">示例</div></div></div><details class="od-disclosure od-surface od-surface--padded"><summary id="ref-summary">说明</summary></details></main></body></html>');
    const props=['color','backgroundColor','borderTopColor','borderTopWidth','borderRadius','boxShadow','fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingRight','minHeight','opacity','filter','outlineColor','outlineWidth','outlineOffset'];
    const style = (p, selector) => p.locator(selector).first().evaluate((el, keys) => { const s=getComputedStyle(el); return Object.fromEntries(keys.map(key=>[key,s[key]])); },props);
    async function compare(label,a,b) {
      // Each page owns its pointer state. Reading after hovering a different
      // tab would compare a stale :hover state rather than the user action.
      if(label.includes('hover'))await page.locator(a).hover();
      const actual=await style(page,a);
      if(label.includes('hover'))await reference.locator(b).hover();
      const expected=await style(reference,b);
      evidence.styles.push({label,actual,expected}); assert(JSON.stringify(actual)===JSON.stringify(expected),'canonical style '+label,{actual,expected});
    }
    // Host stays on the existing palette; only the application opts into Nova.
    await reference.locator('main').evaluate(el=>el.classList.remove('od-theme-shadcn'));
    await compare('light host disclosure','#od-preview-controls summary','#ref-summary');
    await reference.locator('main').evaluate(el=>el.classList.add('od-theme-shadcn'));
    for (const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme}); await page.locator('#od-design-theme').selectOption(theme); await reference.emulateMedia({colorScheme:theme}); await reference.locator('main').evaluate((el,value)=>el.dataset.theme=value,theme); await reference.addStyleTag({content:'.od-theme-shadcn .od-button{transition:none}'});
      await page.locator('#sidebar-tool-title').click(); await reference.locator('#ref-title').click();
      await page.mouse.move(0,0); await reference.mouse.move(0,0);
      for (const [label,a,b] of [['primary','#create-item','#ref-main'],['quiet edit','#edit-1','#ref-row-action'],['quiet delete','#remove-1','#ref-danger'],['icon','#refresh-items','#ref-icon'],['field','#item-title','#ref-before'],['surface','#item-collection','#ref-surface'],['card padding','#item-collection .od-shared-card-content','#ref-content']]) await compare(theme+' '+label,a,b);
      await page.locator('#create-item').hover(); await reference.locator('#ref-main').hover(); await compare(theme+' hover','#create-item','#ref-main');
      await page.locator('#refresh-items').press('Tab'); await reference.locator('#ref-before').press('Tab');
      assert(await focused()==='create-item' && await visibleFocus(),theme+' keyboard visible focus');
      await compare(theme+' focus','#create-item','#ref-main');
      await page.screenshot({path:dir+'/'+theme+'.png',fullPage:true});
      await state(4); await page.mouse.move(0,0); await compare(theme+' disabled','#create-item','#ref-disabled'); await state(0);
    }
    await page.locator('#reset-items').click();
    assert(await page.locator('#od-preview-app').getAttribute('data-preview-theme')==='light' && await page.locator('#od-design-theme').inputValue()==='light','restore resets tool theme');
    assert(await page.locator('.preview-meta').isVisible(),'runtime preview declaration preserved');
    assert(await page.locator('style').count()===3,'runtime style block count preserved');
    evidence.runtimeInlineStyles = await page.locator('[style]').evaluateAll(els => els.map(el => ({tag:el.tagName,id:el.id,value:el.getAttribute('style')})));
    // Screenshot instrumentation can leave style=""; no declaration means no visual override.
    assert(evidence.runtimeInlineStyles.every(item => !item.value.trim()),'runtime no inline style declaration',evidence.runtimeInlineStyles);
    assert(await page.locator('script:not([type])').count()===1,'runtime single behavior script');
    // The companion is source-compiled React, not HTML pretending to be a Switch.
    const componentHtml=await fs.readFile(artifact+'/components.html');
    assert(digest(componentHtml)===manifest.componentReference.htmlHash,'component HTML receipt');
    for(const [path,expected] of Object.entries(manifest.componentReference.inputs)){
      if(digest(await fs.readFile(repo+'/'+path))!==expected)throw Error('component input drift: '+path);
    }
    assert(true,'component source and dependency receipts match');
    await page.goto('file://'+artifact+'/components.html');
    evidence.explicitLightSemantics = await observeExplicitLightSemantics(page, '#od-preview-app', 'data-preview-theme');
    assert(evidence.explicitLightSemantics[1].osDark, 'OS dark is actually emulated');
    for (const row of evidence.explicitLightSemantics) for (const [name, value] of Object.entries(row)) {
      if (name === 'osDark') continue;
      assert(value.actual === value.expected, 'explicit light semantic '+name+' under OS '+(row.osDark?'dark':'light'), value);
    }
    evidence.navigation = await verifyKitNavigation(page, assert);
    const resources=page.getByRole('region',{name:'资源组合示例'});
    assert(await resources.getByRole('listitem').count()===5,'representative resources render real content in groups');
    await page.locator('.preview-device').screenshot({path:dir+'/workspace-grouped-light.png'});
    await page.locator('#workspace-search').fill('不存在');
    assert(await resources.getByText('没有匹配的资源。').isVisible(),'search empty has a recovery action');
    await resources.getByRole('button',{name:'清除搜索',exact:true}).click();
    assert(await focused()==='workspace-search'&&await resources.getByRole('listitem').count()===5,'clear search restores rows and focus');
    await resources.getByRole('button',{name:'查看 设计系统与组件',exact:true}).click();
    assert(await resources.getByRole('heading',{name:'设计系统与组件',exact:true}).isVisible()&&await resources.locator('input').count()===0,'resource opens read-only detail');
    await resources.getByRole('button',{name:'编辑资源',exact:true}).click();
    assert(await page.locator('#recipe-theme').isDisabled()&&await page.locator('#recipe-scenario').isDisabled()&&await page.getByRole('button',{name:'偏好设置',exact:true}).isDisabled(),'editing protects draft from reset and navigation');
    await page.locator('#workspace-name').fill('');
    await page.getByRole('button',{name:'保存资源',exact:true}).click();
    assert(await focused()==='workspace-name'&&await page.locator('#workspace-error').isVisible(),'resource required name associates error and focus');
    await page.locator('#workspace-name').fill('不会保存的名称');
    await page.getByRole('button',{name:'取消',exact:true}).click();
    assert(await resources.getByRole('heading',{name:'设计系统与组件',exact:true}).isVisible(),'resource edit cancellation preserves original');
    await resources.getByRole('button',{name:'编辑资源',exact:true}).click();
    await page.locator('#workspace-name').fill('设计规范与组件');
    await page.locator('#workspace-url').fill('javascript:alert(1)');
    await page.getByRole('button',{name:'保存资源',exact:true}).click();
    assert(await focused()==='workspace-url'&&await page.locator('#workspace-error').isVisible(),'resource rejects non-HTTP addresses without navigation');
    await page.locator('#workspace-url').fill('https://example.com/design');
    await page.getByText('备注（可选）',{exact:true}).click();
    await page.locator('#workspace-note').fill('本页内存中的编辑备注');
    await page.locator('.preview-device').screenshot({path:dir+'/workspace-form-light.png'});
    await page.getByRole('button',{name:'保存资源',exact:true}).click();
    assert(await resources.getByRole('heading',{name:'设计规范与组件',exact:true}).isVisible()&&await resources.getByText('本页内存中的编辑备注',{exact:true}).isVisible(),'resource save updates detail and disclosed metadata');
    await resources.getByRole('button',{name:'← 返回资源',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='查看 设计规范与组件');
    assert(true,'resource back restores the originating row');
    await page.locator('#workspace-search').fill('设计规范');
    await resources.getByRole('button',{name:'查看 设计规范与组件',exact:true}).click();
    await resources.getByRole('button',{name:'编辑资源',exact:true}).click();
    await page.locator('#workspace-name').fill('组件参考');
    await page.getByRole('button',{name:'保存资源',exact:true}).click();
    await resources.getByRole('button',{name:'← 返回资源',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.id==='workspace-search');
    assert(await page.locator('#workspace-search').inputValue()==='设计规范'&&await resources.getByText('该资源已不匹配当前搜索，已保留搜索条件。',{exact:true}).isVisible(),'renamed nonmatching row retains search with fallback focus and explanation');
    await resources.getByRole('button',{name:'清除搜索',exact:true}).click();
    assert(!await resources.getByText('该资源已不匹配当前搜索，已保留搜索条件。',{exact:true}).isVisible(),'clearing search removes the obsolete filter explanation');
    await page.getByRole('button',{name:'偏好设置',exact:true}).click();
    await page.getByRole('switch',{name:'按分组整理资源',exact:true}).press('Space');
    await page.locator('.preview-device').screenshot({path:dir+'/workspace-settings-light.png'});
    await page.getByRole('button',{name:'资源工作台',exact:true}).click();
    assert(await resources.getByText('全部资源 · 5',{exact:true}).isVisible(),'instant setting changes the actual list grouping');
    assert(!await resources.getByText('已关闭分组整理。',{exact:true}).isVisible(),'setting receipt stays in its own view');
    for(const theme of ['light','dark']){
      await page.locator('#recipe-theme').selectOption(theme);
      await page.locator('.preview-device').screenshot({path:dir+'/workspace-'+theme+'.png'});
    }
    await page.getByRole('button',{name:'基础控件',exact:true}).click();
    const toggle=page.getByRole('switch',{name:'自动整理'});
    await toggle.waitFor();
    assert(await toggle.isChecked(),'real Switch starts selected');
    await toggle.press('Space');
    assert(!await toggle.isChecked(),'real Switch keyboard toggles');
    await page.locator('.od-shared-switch:visible').click();assert(await toggle.isChecked(),'real Switch pointer toggles');
    await page.getByLabel('名称',{exact:true}).fill('');await page.getByRole('button',{name:'保存示例',exact:true}).click();
    assert(await page.locator('#recipe-name-error').isVisible()&&await focused()==='recipe-name','React form error and focus');
    await page.getByLabel('名称',{exact:true}).fill('统一组件');
    assert(await page.locator('#recipe-name-error').count()===0,'React error clears on correction');
    await page.getByRole('button',{name:'保存示例',exact:true}).click();
    assert((await page.getByRole('status').allTextContents()).some(text=>text.includes('统一组件')),'React form save');
    await page.getByLabel('名称',{exact:true}).fill('不会保存的改动');
    await page.getByRole('button',{name:'取消编辑',exact:true}).click();
    assert(await page.locator('#recipe-name').inputValue()==='统一组件','cancel restores last saved value instead of the initial fixture');
    await page.getByRole('button',{name:'删除示例…',exact:true}).click();
    assert(await page.evaluate(()=>document.activeElement.textContent)==='取消','React confirmation safe focus');
    await page.getByRole('button',{name:'取消',exact:true}).press('Escape');
    // The recipe restores its trigger in requestAnimationFrame after React commits.
    // Observe that real transition instead of racing it or forcing focus in the driver.
    await page.waitForFunction(()=>document.activeElement?.textContent==='删除示例…');
    evidence.focusAfterEscape = await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,label:document.activeElement.getAttribute('aria-label')}));
    assert(await page.evaluate(()=>document.activeElement.textContent)==='删除示例…','React Escape restores trigger');
    await page.getByRole('button',{name:'删除示例…',exact:true}).click();
    await page.getByRole('button',{name:'取消',exact:true}).click();
    assert(await page.locator('#recipe-name').inputValue()==='统一组件','React cancel preserves value');
    await page.getByRole('button',{name:'删除示例…',exact:true}).click();
    await page.getByRole('button',{name:'确认删除',exact:true}).click();
    assert(await page.locator('#recipe-name').inputValue()==='','React confirmation changes memory');
    await page.locator('#recipe-scenario').selectOption('error');
    assert(await toggle.isDisabled()&&await page.locator('#recipe-name').isDisabled(),'React error disables affected controls');
    assert((await page.getByRole('alert').allTextContents()).some(text=>text.includes('读取失败')),'React error readable');
    await page.locator('#recipe-scenario').selectOption('ready');
    for(const theme of ['light','dark']){
      await page.locator('#recipe-theme').selectOption(theme);await reference.emulateMedia({colorScheme:theme}); await reference.locator('main').evaluate((el,value)=>el.dataset.theme=value,theme); await reference.addStyleTag({content:'.od-theme-shadcn .od-button{transition:none}'});
      await page.locator('#sidebar-tool-title').click();await reference.locator('#ref-title').click();
      await page.mouse.move(0,0);await reference.mouse.move(0,0);
      await compare('React '+theme+' Button','button.od-button--primary:visible','#ref-main');
      await compare('React '+theme+' Card','.od-shared-card:visible','#ref-surface');
      await compare('React '+theme+' CardContent','.od-shared-card-content:visible','#ref-content');
      await compare('React '+theme+' input','#recipe-name','#ref-before');
      await page.screenshot({path:dir+'/components-'+theme+'.png',fullPage:true});
    }
    await page.locator('#recipe-reset').click();
    await page.getByRole('button',{name:'基础控件',exact:true}).click();
    assert(await toggle.isChecked()&&await page.locator('#recipe-name').inputValue()==='示例条目'&&
      await page.locator('#od-preview-app').getAttribute('data-preview-theme')==='light','component restore resets memory and theme');
    await page.getByRole('button',{name:'资源工作台',exact:true}).click();
    await page.getByRole('button',{name:'添加资源',exact:true}).click();
    await page.locator('#workspace-name').fill('保留组合输入草稿');
    await page.locator('#workspace-name').dispatchEvent('keydown',{key:'Escape',isComposing:true,bubbles:true});
    assert(await page.locator('#workspace-name').inputValue()==='保留组合输入草稿','React composing Escape preserves the resource draft');
    await page.locator('#workspace-name').press('Escape');
    await page.waitForFunction(()=>document.activeElement?.textContent==='添加资源');
    assert(await resources.getByRole('listitem').count()===5,'resource Escape cancels creation and restores origin');
    await page.getByRole('button',{name:'添加资源',exact:true}).click();
    await page.locator('#workspace-name').fill('新增资源');
    await page.locator('#workspace-url').fill('https://example.com/new');
    await page.getByRole('button',{name:'保存资源',exact:true}).click();
    assert(await resources.getByRole('heading',{name:'新增资源',exact:true}).isVisible(),'resource creation saves and opens detail');
    await resources.getByRole('button',{name:'← 返回资源',exact:true}).click();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='查看 新增资源');
    assert(await resources.getByRole('listitem').count()===6,'new resource returns to its own row');
    await page.locator('#recipe-reset').click();
    const chat=page.getByRole('button',{name:'AI 对话',exact:true});
    await chat.click();
    const chatInput=page.locator('#recipe-chat-input');
    await chatInput.fill('保留的对话草稿');
    const separator=page.getByRole('separator',{name:'调整对话与原扩展的高度'});
    const beforeHeight=Number(await separator.getAttribute('aria-valuenow'));
    await separator.press('ArrowUp');
    assert(Number(await separator.getAttribute('aria-valuenow'))>beforeHeight,'shared Chat separator responds to keyboard');
    await page.getByRole('button',{name:'收起对话',exact:true}).click();
    assert(await chat.getAttribute('aria-expanded')==='false','shared Chat closes from toolbar');
    await chat.click();
    assert(await chatInput.inputValue()==='保留的对话草稿','shared Chat reopening preserves draft');
    await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.getByRole('button',{name:'停止对话',exact:true}).click();
    assert((await page.getByRole('log').innerText()).includes('保留的对话草稿')&&await page.getByRole('button',{name:'发送',exact:true}).isVisible(),'shared Chat Send and Stop preserve the message');
    await chatInput.fill('固定回复演示');
    await page.getByRole('button',{name:'发送',exact:true}).click();
    await page.getByRole('button',{name:'完成模拟回复',exact:true}).click();
    assert((await page.getByRole('log').innerText()).includes('这是固定的离线演示回复'),'shared Chat completes through the memory-only adapter');
    await page.locator('.preview-device').screenshot({path:dir+'/workspace-chat-light.png'});
    await chatInput.press('Escape');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='AI 对话');
    assert(await resources.getByRole('listitem').count()===5,'Chat Escape restores its trigger and preserves the business view');
    evidence.imeGuard='SYNTHETIC_KEY_EVENT_ONLY; NATIVE_IME_NOT_TESTED';
    assert(await page.locator('#od-preview-app #recipe-theme,#od-preview-app #recipe-scenario').count()===0,'React diagnostics outside tool');
    assert(evidence.network.length===0,'no HTTP network requests',evidence.network);
    assert(evidence.errors.length===0,'no console or page errors',evidence.errors);
    for (const [path, expected] of Object.entries(manifest.inputs)) assert(digest(await fs.readFile(repo+'/'+path))===expected,'stable input '+path);
    assert(digest(await fs.readFile(artifact+'/preview.html'))===evidence.htmlHash,'stable tested HTML');
    evidence.componentHtmlHash=digest(componentHtml);
    evidence.result='PASS';
  } catch(error) {
    evidence.result='FAIL'; evidence.failure=error.stack;
    await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});
    throw error;
  } finally {
    await reference?.close(); await page.emulateMedia({colorScheme:null});
    await fs.writeFile(dir+'/report.json',JSON.stringify(evidence,null,2)+'\n');
  }
  return {dir,result:evidence.result,checks:evidence.checks.length,styleComparisons:evidence.styles.length,browser:evidence.browser,htmlHash:evidence.htmlHash};
}

async function cli() {
  if (!process.argv[2] || !process.argv[3]) throw Error('用法：node scripts/tests/sidebar-preview-kit-browser.mjs <套件目录> <独立证据目录>；使用现有 Playwright，必要时 OPENDESK_PLAYWRIGHT_MODULE 指向其 index.mjs');
  const {chromium} = await import(process.env.OPENDESK_PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({headless:true, executablePath:process.env.OPENDESK_PREVIEW_CHROME_BIN});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log(JSON.stringify(await verifyPreview(page,{artifact:resolve(process.argv[2]),out:resolve(process.argv[3])}),null,2));
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) cli().catch(error => { console.error(error.stack); process.exitCode=1; });
