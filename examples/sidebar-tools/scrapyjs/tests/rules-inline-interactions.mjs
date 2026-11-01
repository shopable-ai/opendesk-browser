// Targeted real React UI replay. Uses a fresh headless instance and memory SDK.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.argv[2],out=resolve(process.argv[3]);
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const page=await browser.newPage({viewport:{width:1200,height:1120},reducedMotion:'reduce'});
page.setDefaultTimeout(8000);
const report={url,kind:'OFFLINE_REACT_UI_SIMULATED_SDK',checks:[],errors:[],screenshots:[],nativeChrome:'NOT_TESTED'};
const check=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);};
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
const f=page.frameLocator('#opendesk-preview-frame'),get=id=>f.locator('#'+id);
const shot=async name=>{const path=join(out,name+'.png');await page.locator('.preview-device').screenshot({path});report.screenshots.push(path);};
const config=async()=>JSON.parse(await get('config-json').inputValue());
const key=name=>f.getByRole('textbox',{name:'字段名 '+name,exact:true});
const rule=name=>f.getByRole('textbox',{name:'采集规则 '+name,exact:true});
const focused=locator=>locator.evaluate(el=>el===el.ownerDocument.activeElement);
const reset=async()=>{await page.goto(url);await get('profile-list').locator('option[value="demo"]').waitFor({state:'attached'});await get('tab-rules').click();};
const noApply=async()=>{
  check(await f.locator('#apply-field,#cancel-field,.rule-draft-actions').count()===0,'inline fields and scope have no Apply/Cancel bar');
  check(await f.getByText('字段更改未应用',{exact:true}).count()===0,'redundant unapplied-field message is absent');
};
const runnable=async()=>{
  check(await get('save-config').isEnabled(),'legal inline draft can be saved directly');
  check(await get('start').isEnabled(),'legal inline draft can be run directly');
};
const invalid=async(input,value,lastConfig)=>{
  await input.fill(value);
  check(await input.inputValue()===value,'invalid input stays visible: '+JSON.stringify(value));
  await get('field-error').waitFor({state:'visible'});
  check((await get('field-error').innerText()).trim().length>0,'invalid input has an actionable error');
  check(await input.getAttribute('aria-invalid')==='true','invalid input is marked at its source');
  check(await get('save-config').isDisabled(),'invalid input blocks saving');
  check(await get('start').isDisabled(),'invalid input blocks running');
  check(JSON.stringify(await config())===JSON.stringify(lastConfig),'invalid input preserves last legal config draft');
};
try{
  await reset();await noApply();
  check(await f.locator('.rule-row').count()===1,'one stored field renders one inline row');
  await rule('title').fill('h2 a::text');
  check((await config()).itemConfig.title==='h2 a::text','onChange writes legal rule before blur or Enter');
  check(await focused(rule('title')),'legal rule edit retains focus');
  check(await get('profile-current').getAttribute('data-dirty')==='true','immediate editing still requires configuration persistence');
  await runnable();await noApply();await shot('01-immediate');
  await get('save-config').click();await get('profile-current[data-dirty="false"]').waitFor();
  await get('profile-list').selectOption('douban');await get('profile-list').selectOption('demo');await get('tab-rules').click();
  check(await rule('title').inputValue()==='h2 a::text','direct Save persists edited rule across configuration switches');
  await rule('title').fill('a::href');await get('tab-results').click();await get('start').click();
  await get('run-summary').filter({hasText:'采集完成'}).waitFor();
  check((await config()).itemConfig.title==='a::href','direct Run accepts latest unsaved legal rule');

  await reset();await get('new-field').click();
  await f.getByRole('textbox',{name:'新字段名',exact:true}).fill('url');
  check(!Object.hasOwn((await config()).itemConfig,'url'),'incomplete new row does not create a partial field');
  const newRule=f.getByRole('textbox',{name:'新字段采集规则',exact:true});
  const newRuleElement=await newRule.elementHandle();
  await newRule.pressSequentially('a');
  check(await newRuleElement.evaluate(el=>el.isConnected&&el===el.ownerDocument.activeElement),'completing new field preserves the same focused input node');
  await page.keyboard.type('::href');
  check(await rule('url').inputValue()==='a::href','typing continues in newly completed field without refocusing');
  check((await config()).itemConfig.url==='a::href','complete new row joins config immediately');
  check(await f.locator('.rule-row').count()===2,'completed addition renders exactly two rows');await runnable();await noApply();
  const nameInput=key('url');await nameInput.focus();
  const element=await nameInput.elementHandle();
  const rowIndex=await nameInput.evaluate(el=>[...el.ownerDocument.querySelectorAll('.rule-entry')].indexOf(el.closest('.rule-entry')));
  let current='url';
  for(const next of ['link','link2','link3']){
    await key(current).fill(next);
    check(await element.evaluate(el=>el.isConnected&&el===el.ownerDocument.activeElement),'rename '+next+' preserves the same focused input node');
    check(await key(next).evaluate((el,index)=>[...el.ownerDocument.querySelectorAll('.rule-entry')].indexOf(el.closest('.rule-entry'))===index,rowIndex),'rename '+next+' preserves visual row order');
    check((await config()).itemConfig[next]==='a::href'&&!Object.hasOwn((await config()).itemConfig,current),'rename '+next+' replaces only the prior key');current=next;
  }
  const last=await config();
  await invalid(key(current),'title',last);await shot('02-duplicate');
  await key(current).press('Escape');check(await key(current).inputValue()===current,'Escape restores last legal name');await runnable();
  await invalid(key(current),'1invalid',last);await key(current).fill('link4');current='link4';
  check((await config()).itemConfig.link4==='a::href','correcting invalid name immediately releases legal draft');await runnable();
  await invalid(key(current),'',await config());await key(current).press('Escape');
  check(await key(current).inputValue()===current,'Escape restores an emptied name');
  for(const value of ['', '::text']){
    await invalid(rule(current),value,await config());await rule(current).press('Escape');
    check(await rule(current).inputValue()==='a::href','Escape restores last legal rule after '+JSON.stringify(value));
  }
  await rule(current).focus();await f.getByRole('button',{name:'清空采集规则 '+current,exact:true}).click();
  check(await rule(current).inputValue()===''&&await focused(rule(current)),'clear icon preserves focus and empty input');
  check(await get('save-config').isDisabled()&&await get('start').isDisabled(),'clear icon blocks Save and Run');
  await rule(current).fill('a.book-title::text');await runnable();
  // Synthetic composition covers keyboard guards; actual OS IME remains NOT_TESTED.
  await invalid(key(current),'中文',await config());
  for(const event of [{key:'Escape',isComposing:true},{key:'Enter',isComposing:true},{key:'Escape',keyCode:229}]){
    await key(current).evaluate((el,init)=>el.dispatchEvent(new KeyboardEvent('keydown',{...init,bubbles:true})),event);
    check(await key(current).inputValue()==='中文','composition key does not reset or commit the pending name: '+JSON.stringify(event));
    check(await focused(key(current)),'composition key preserves focus');
  }
  await key(current).press('Escape');await runnable();await noApply();
  await get('list-scope').locator('summary').click();await get('list-container').fill('.books');
  check((await config()).itemConfig._listContainer==='.books','list container syncs without Apply');
  await get('list-item').fill('article');check((await config()).itemConfig._listItem==='article','list item syncs without Apply');
  check(await rule('title').isEnabled(),'legal scope changes do not lock field editing');
  await get('list-container').fill('');await get('list-item').fill('');
  check(!Object.hasOwn((await config()).itemConfig,'_listContainer')&&!Object.hasOwn((await config()).itemConfig,'_listItem'),'empty optional scope removes only scope keys');
  check((await config()).itemConfig.link4==='a.book-title::text','scope edits preserve field rules');await runnable();await noApply();
  await get('tab-json').click();let c=await config();c.itemConfig.complex={selector:'p',read:'innerHTML'};c.itemConfig.long='.list '+'.nested '.repeat(35)+'a::href';
  await get('config-json').fill(JSON.stringify(c));await get('tab-rules').click();
  check(await rule('complex').getAttribute('readonly')!==null,'complex rule stays read only');
  await f.getByRole('button',{name:'在 JSON 编辑字段 complex',exact:true}).click();
  check((await get('json-field-help').innerText()).length>0,'complex field opens JSON with contextual guidance');
  check(JSON.stringify((await config()).itemConfig.complex)===JSON.stringify(c.itemConfig.complex),'JSON handoff preserves exact complex object');
  await get('tab-rules').click();await rule('long').focus();await rule('long').press('End');
  check(await rule('long').inputValue()===c.itemConfig.long,'long rule remains lossless');await shot('03-scope-complex');
  await f.getByRole('button',{name:'删除字段 link4',exact:true}).click();
  check(await focused(get('cancel-remove-field')),'deletion defaults focus to Cancel');
  await get('cancel-remove-field').press('Escape');
  check(await focused(f.getByRole('button',{name:'删除字段 link4',exact:true})),'cancel delete restores original trigger focus');
  check(Object.hasOwn((await config()).itemConfig,'link4'),'cancel delete preserves field');
  const beforeDelete=await config();await f.getByRole('button',{name:'删除字段 link4',exact:true}).click();await f.getByRole('button',{name:'确认删除字段',exact:true}).click();
  delete beforeDelete.itemConfig.link4;
  check(JSON.stringify(await config())===JSON.stringify(beforeDelete),'confirm delete changes only selected field');
  await rule('title').fill('pending::text');await get('profile-list').selectOption('douban');await get('profile-confirm[open]').waitFor();await get('profile-confirm-cancel').click();
  check(await rule('title').inputValue()==='pending::text'&&await get('profile-list').inputValue()==='demo','cancel profile switch preserves immediate unsaved draft and identity');
  await get('save-config').click();await get('profile-current[data-dirty="false"]').waitFor();
  await reset();await f.getByRole('button',{name:'删除字段 title',exact:true}).click();await f.getByRole('button',{name:'确认删除字段',exact:true}).click();
  await get('field-error').waitFor({state:'visible'});
  check(await f.locator('.rule-row').count()===1&&Object.hasOwn((await config()).itemConfig,'title'),'last-field deletion fails visibly without data loss');
  await shot('04-last-field');
  await reset();await get('tab-json').click();
  const labeled=await config();labeled.output={...labeled.output,fieldNames:{title:'标题'}};
  await get('config-json').fill(JSON.stringify(labeled));await get('tab-rules').click();
  const labeledInput=await key('title').elementHandle();
  await key('title').press('ControlOrMeta+A');
  let previous='title',typed='';
  for(const character of 'heading'){
    await page.keyboard.type(character);typed+=character;
    const draft=await config();
    check(draft.output.fieldNames[typed]==='标题','CSV label follows consecutive rename to '+typed);
    check(!Object.hasOwn(draft.output.fieldNames,previous),'CSV label removes previous key '+previous);
    check(await labeledInput.evaluate(el=>el.isConnected&&el===el.ownerDocument.activeElement),'CSV-associated rename retains the same input and focus at '+typed);
    previous=typed;
  }
  check((await config()).itemConfig.heading===labeled.itemConfig.title&&!Object.hasOwn((await config()).itemConfig,'title'),'CSV-associated rename preserves selector under new field key');
  await get('save-config').click();await get('profile-current[data-dirty="false"]').waitFor();
  await get('profile-list').selectOption('douban');await get('profile-list').selectOption('demo');await get('tab-rules').click();
  const restored=await config();
  check(restored.output.fieldNames.heading==='标题'&&!Object.hasOwn(restored.output.fieldNames,'title'),'direct Save and profile roundtrip preserve migrated CSV label without old key');
  await get('csv-preset').locator('summary').click();
  check(await get('csv-preset').getByRole('textbox',{name:'heading 显示名称',exact:true}).inputValue()==='标题','CSV preset displays migrated label for heading');
  check((await get('csv-preset').locator('.csv-header-preview th').allTextContents()).includes('标题'),'CSV header preview uses migrated label');
  await shot('05-csv-rename');
  // The simulated task always returns title/source, regardless of configured keys.
  // A download here cannot prove heading extraction; do not mutate that fixture.
  report.renamedFieldDownload='NOT_TESTED: fixed simulated task returns title/source, not configured heading';

  await reset();await get('tab-json').click();
  const referenced=await config();referenced.dedupeKey='title';referenced.output={fieldNames:{title:'标题'}};
  await get('config-json').fill(JSON.stringify(referenced));await get('tab-rules').click();
  await invalid(key('title'),'heading',referenced);
  check((await config()).dedupeKey==='title'&&(await config()).output.fieldNames.title==='标题','rejected referenced-field rename preserves reference and CSV label');
  await key('title').press('Escape');
  check(await key('title').inputValue()==='title','Escape restores referenced field name');
  check(JSON.stringify(await config())===JSON.stringify(referenced),'Escape preserves complete referenced configuration');await runnable();

  await get('list-scope').locator('summary').click();
  await invalid(get('list-container'),'[',await config());await get('list-container').press('Escape');
  check(await get('list-container').inputValue()===referenced.itemConfig._listContainer,'Escape restores last legal list container');await runnable();
  await invalid(get('list-item'),'[',await config());await get('list-item').fill('article');
  check((await config()).itemConfig._listItem==='article','corrected scope selector immediately updates config');await runnable();
  await reset();const picker=page.locator('#scrapyjs-preview-scenario');
  await page.locator('details').filter({has:picker}).locator('summary').click();await picker.selectOption('loading');
  await get('profile-list').locator('option[value="demo"]').waitFor({state:'attached'});await get('tab-results').click();await get('start').click();
  await get('run-summary').filter({hasText:'正在采集'}).waitFor();await get('tab-rules').click();
  check(await key('title').isDisabled()&&await rule('title').isDisabled(),'active run locks field editing');
  check(await get('new-field').isDisabled(),'active run locks field addition');
  check(await get('save-config').isDisabled()&&await get('start').isDisabled(),'active run prevents Save and duplicate Run');
  await get('list-scope').locator('summary').click();
  check(await get('list-container').isDisabled()&&await get('list-item').isDisabled(),'active run locks list scope');
  await shot('06-busy');
  report.unknownRecovery='NOT_TESTED: existing simulated SDK has no UNKNOWN scenario; do not reset or replay real requests';
  report.realIME='NOT_TESTED: synthetic composition keyboard guards only';
  check(report.errors.length===0,'no page or console errors');report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;await shot('failure');process.exitCode=1;}
finally{
  const bytes=url.startsWith('file:')?await readFile(new URL(url)):Buffer.from(await (await fetch(url)).arrayBuffer());
  report.previewSha256=createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));
}
