// Real tool UI in the offline memory SDK; no installed data or network actions.
export async function exerciseLibraryDesign(page,url,{screenshot=async()=>{}}={}){
  const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  await page.goto(url);
  const f=page.frameLocator('#opendesk-preview-frame'),get=id=>f.locator('#'+id);
  await f.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});
  await get('manage-profiles').click();await get('profile-management').waitFor();
  check(await page.locator('#sidebar-tool-title').innerText()==='scrapyjs 采集/配置库','host heading shows the tool and library path');
  check(await get('open-local-runner').isHidden(),'library omits root-only task entry');
  await screenshot('library');
  check(await get('profile-search').evaluate(el=>el.ownerDocument.activeElement===el),'entry focuses the first library control');
  check(await f.getByRole('button',{name:'返回采集界面'}).count()===0&&await f.getByRole('heading',{name:'配置库',exact:true}).count()===0,'content has no duplicate Back or page heading');
  check(!(await get('profile-management').innerText()).includes('随时切换使用'),'collection toolbar has no permanent purpose description');
  await page.locator('#sidebar-tool-back').click();
  await get('profile-management').waitFor({state:'hidden'});
  check(await page.locator('#sidebar-tool-title').innerText()==='scrapyjs 采集'&&await get('manage-profiles').evaluate(el=>el.ownerDocument.activeElement===el),'host Back returns to capture root and restores entry focus');
  await page.locator('#sidebar-tool-back').click();
  check(await page.locator('#od-preview-return').isVisible(),'root Back returns to the extensions list');
  await page.locator('#od-preview-reopen').click();await get('manage-profiles').click();
  check(await get('library-save-config').isHidden(),'saved configuration has one status and no redundant Save button');
  check(await get('profile-more-actions').getAttribute('open')===null,'low-frequency management starts collapsed');
  await get('profile-search').fill('DOUBAN.COM');
  check(await f.locator('.profile-entry').count()===1&&(await get('profile-entry-douban').innerText()).includes('book.douban.com'),'search matches website without case sensitivity');
  check(await get('profile-list').inputValue()==='demo','search does not switch the active configuration');
  await get('profile-search').fill('没有这个配置');
  check(await get('library-no-results').isVisible()&&await get('library-new-profile').isEnabled(),'no-match state keeps creation available');
  check((await f.locator('.profile-tools').innerText()).includes('当前使用配置不受搜索筛选影响'),'no-match retains an explicit active-configuration context');
  await screenshot('no-match');
  await get('profile-search-clear').click();
  check(await f.locator('.profile-entry').count()===2&&await get('profile-search').evaluate(el=>el.ownerDocument.activeElement===el),'clear restores the list and search focus');
  await get('profile-search').fill('豆瓣');await get('profile-search').press('Escape');
  check(await get('profile-search').inputValue()===''&&await get('profile-management').isVisible(),'Escape clears a search before leaving the library');
  await get('profile-entry-douban').press('Enter');await get('profile-entry-douban[aria-pressed="true"]').waitFor();
  check(await get('profile-list').inputValue()==='douban'&&await f.locator('.profile-entry[aria-pressed="true"]').count()===1,'keyboard selection changes one persisted identity');
  await get('profile-more-actions').locator('summary').click();
  await get('rename-profile').click();
  await page.locator('#sidebar-tool-back').click();
  check(await get('profile-naming').isVisible()&&await get('profile-management').isVisible(),'host Back cannot abandon an open name form');
  await get('profile-name').fill('图书采集规则');await get('profile-name-submit').click();await get('profile-naming').waitFor({state:'hidden'});
  check((await get('profile-entry-douban').innerText()).includes('图书采集规则'),'rename updates the saved list');
  await get('copy-profile').click();await get('profile-name').fill('独立副本');await get('profile-name-submit').click();await get('profile-naming').waitFor({state:'hidden'});
  check((await get('profile-list').inputValue())!=='douban'&&await f.locator('.profile-entry').count()===3,'copy creates an independent saved identity');
  const selectedRow=f.locator('.profile-entry[aria-pressed="true"]');
  check((await selectedRow.locator('.profile-entry-meta').innerText()).includes('2 个字段')&&!(await f.locator('.profile-tools').innerText()).includes('2 个采集字段'),'saved copy shows its field count once');
  await get('delete-profile').click();await get('profile-confirm[open]').waitFor();
  check((await get('profile-confirm-text').innerText()).includes('独立副本')&&await get('profile-confirm-cancel').evaluate(el=>el.ownerDocument.activeElement===el),'deletion names its target and defaults to Cancel');
  await get('profile-confirm-cancel').press('Escape');
  check(await f.locator('.profile-entry').count()===3&&await get('delete-profile').evaluate(el=>el.ownerDocument.activeElement===el),'cancel deletion preserves the copy and restores focus');
  const contrast=await get('delete-profile').evaluate(el=>{
    const ctx=document.createElement('canvas').getContext('2d');
    const luminance=value=>{ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).reduce((sum,v,i)=>{v/=255;return sum+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);};
    // The tool can explicitly use dark while its host document remains light.
    // Resolve the painted surface rather than assuming the body's background.
    let surface=el;
    while(surface.parentElement&&getComputedStyle(surface).backgroundColor==='rgba(0, 0, 0, 0)')surface=surface.parentElement;
    const fg=getComputedStyle(el).color,bg=getComputedStyle(surface).backgroundColor,a=luminance(fg),b=luminance(bg);
    return {foreground:fg,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
  check(contrast.ratio>=4.5,'delete text contrast meets 4.5:1 on its actual tool surface');
  await screenshot('management');
  await get('edit-profile-rules').click();check(await get('rules-editor').isVisible(),'primary edit action returns to rules');
  await get('tab-json').click();const config=JSON.parse(await get('config-json').inputValue());config.maxPages=3;config.itemConfig.extra='.author::text';
  await get('config-json').fill(JSON.stringify(config));const draft=await get('config-json').inputValue();
  await get('manage-profiles').click();
  check((await selectedRow.locator('.profile-entry-meta').innerText()).includes('保存版')&&(await f.locator('.profile-tools').innerText()).includes('草稿 · 3 个采集字段')&&await get('library-save-config').isVisible(),'dirty detail distinguishes its three-field draft from the two-field saved version');
  check(!(await get('profile-management').innerText()).includes('配置已保存为独立副本'),'new edits clear the previous save receipt');
  await screenshot('dirty');
  await get('profile-entry-demo').click();await get('profile-confirm[open]').waitFor();
  check((await get('profile-confirm-text').innerText()).includes('示例 · 列表采集'),'discard confirmation names the intended switch target');
  await get('profile-confirm-cancel').click();
  check((await get('profile-list').inputValue())!=='demo'&&await get('config-json').inputValue()===draft,'cancel switching preserves the exact JSON draft and identity');
  await page.locator('#sidebar-tool-back').click();
  await f.locator('#manage-profiles:focus').waitFor();
  check(await get('config-json').inputValue()===draft&&await get('manage-profiles').evaluate(el=>el.ownerDocument.activeElement===el),'child Back preserves the dirty draft without leaving the tool');
  await page.locator('#sidebar-tool-back').click();
  check(await page.locator('#od-preview-extension-detail').isVisible()&&await get('config-json').inputValue()===draft,'root guard prevents silent draft loss');
  await get('manage-profiles').click();
  await get('library-save-config').click();await get('library-current').filter({hasText:'配置已保存'}).waitFor();
  check((await selectedRow.locator('.profile-entry-meta').innerText()).includes('3 个字段')&&await get('library-save-config').isHidden(),'save synchronizes the list with the draft and removes redundant Save');
  await page.locator('#sidebar-tool-back').click();
  await f.locator('#manage-profiles:focus').waitFor();
  check(await get('config-json').inputValue()===draft&&await get('manage-profiles').evaluate(el=>el.ownerDocument.activeElement===el),'return preserves the workspace draft and restores entry focus');
  await get('tab-rules').click();await f.getByRole('textbox',{name:'采集规则 title',exact:true}).fill('h2 a');
  await get('manage-profiles').evaluate(el=>el.focus({preventScroll:true}));
  const scroll=await f.locator('.capture-business').evaluate(el=>{el.scrollTop=Math.min(100,el.scrollHeight-el.clientHeight);return el.scrollTop;});
  await get('manage-profiles').press('Enter');
  check(await get('library-save-config').isDisabled(),'unapplied field draft cannot be saved from library');
  await page.locator('#sidebar-tool-back').click();
  await f.locator('#manage-profiles:focus').waitFor();
  check(await get('field-rule').inputValue()==='h2 a'&&await get('manage-profiles').evaluate(el=>el.ownerDocument.activeElement===el),'header return retains unapplied field input and focus');
  check(Math.abs(await f.locator('.capture-business').evaluate(el=>el.scrollTop)-scroll)<2,'header return restores workspace scroll');
  await page.locator('#sidebar-tool-conversation-toggle').click();
  await get('manage-profiles').click();await page.locator('#sidebar-tool-back').click();
  check(await get('ai-preview-placeholder').isVisible(),'navigation retains the mounted conversation presentation');
  await page.goto(url);
  const picker=page.locator('#scrapyjs-preview-scenario');
  await page.locator('details').filter({has:picker}).locator('summary').click();await picker.selectOption('loading');
  await f.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});
  await get('start').click();await get('run-summary').filter({hasText:'正在采集'}).waitFor();
  await get('manage-profiles').click();
  check(await get('library-new-profile').isDisabled()&&await get('library-save-config').isDisabled(),'busy library keeps mutation locks');
  await page.locator('#sidebar-tool-back').click();
  check(await get('run-summary').innerText().then(text=>text.includes('正在采集')),'child Back leaves the same active run mounted');
  await page.locator('#sidebar-tool-back').click();
  check(await page.locator('#od-preview-extension-detail').isVisible()&&await get('stop').isEnabled(),'root Back cannot discard an active run');
  check(await page.locator('#opendesk-preview-frame').getAttribute('sandbox')==='allow-scripts allow-downloads','preview retains its opaque sandbox');
  // Remove only the optional capability from the in-memory Mock in a new frame.
  // The frozen deliverable stays unchanged; this proves the unadmitted fallback.
  await page.goto(url);
  await f.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});
  await page.locator('#opendesk-preview-frame').evaluate(frame=>{
    const doc=new DOMParser().parseFromString(frame.srcdoc,'text/html');let changed=false;
    for(const script of doc.querySelectorAll('script[src^="data:text/javascript;base64,"]')){
      const code=atob(script.src.split(',')[1]);
      if(code.includes("Object.defineProperty(globalThis, 'OpenDeskTool'")){
        const without=code.replace('setState,setConversationState,setNavigation})','setState,setConversationState})');
        if(without===code)throw Error('optional-capability fixture drift');
        script.src='data:text/javascript;base64,'+btoa(without);changed=true;
      }
    }
    if(!changed)throw Error('optional-capability fixture missing');
    frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;
  });
  await f.locator('#profile-list option[value="demo"]').waitFor({state:'attached'});
  await get('profile-management-close').waitFor({state:'attached'});
  await get('manage-profiles').click();
  check(await get('profile-management-close').isVisible(),'unadmitted tool keeps an internal return when navigation is unavailable');
  await get('profile-management-close').click();
  check(await get('profile-management').isHidden()&&await get('manage-profiles').evaluate(el=>el.ownerDocument.activeElement===el),'fallback return preserves the tool and restores entry focus');
  return {checks,count:checks.length,contrast};
}
