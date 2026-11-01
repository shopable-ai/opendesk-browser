import {readFile} from 'node:fs/promises';

export async function exerciseInlineColumns(page,url,{screenshot=async()=>{}}={}){
  const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
  await page.goto(url);
  const f=page.frameLocator('#opendesk-preview-frame'),get=id=>f.locator('#'+id);
  await get('tab-results').click();await get('start').click();await get('run-summary').filter({hasText:'采集完成'}).waitFor();await get('edit-result-columns').click();await namesMode(f,true);
  const input=f.getByRole('textbox',{name:'title 显示名称',exact:true}),source=f.getByRole('button',{name:'显示列 source',exact:true});
  const headers=()=>get('record-table').locator('thead th').allTextContents();
  const handle=key=>f.getByRole('button',{name:'调整列顺序：'+key,exact:true});
  check(await f.getByRole('switch',{name:'显示名称',exact:true}).isChecked()&&await get('field-list').locator('.rule-entry[data-field-key]').count()===2&&await get('field-list').getByRole('textbox',{name:/ 显示名称$/}).count()===2,'display-name switch reuses each row for one alias input');
  check(await f.getByRole('button',{name:/重命名列/}).count()===0,'display columns remove the second rename form');
  await screenshot('06-columns-clean');
  await input.fill('标题');check((await headers())[1].startsWith('标题'),'typing a display name updates the preview directly');
  check(await get('field-list').locator('input[aria-label="字段名 title"]').inputValue()==='title','renamed column retains a visible original-field identifier');
  await input.press('Escape');check((await headers())[1].startsWith('title')&&await input.inputValue()==='title','Escape restores the original display name');
  await input.fill('标题');await input.press('Enter');await namesMode(f,false);await source.click();check(await source.getAttribute('aria-pressed')==='false','source eye reports hidden');
  check((await headers()).length===2&&(await headers())[1].startsWith('标题'),'rename and hide change only the displayed columns');
  await get('tab-results').click();let download=page.waitForEvent('download');await get('download-json').click();const result=JSON.parse(await readFile(await(await download).path(),'utf8'));
  check(result.result.data.length>0&&Object.hasOwn(result.result.data[0],'title')&&Object.hasOwn(result.result.data[0],'source')&&!Object.hasOwn(result.result.data[0],'标题'),'JSON download retains hidden fields and original names');
  check(await get('app-notice').isHidden()&&await f.locator('.scrapy-download-status').isVisible(),'download receipt appears once in the download area');
  download=page.waitForEvent('download');await get('download-csv').click();const csv=await readFile(await(await download).path(),'utf8');
  check(csv.includes('title')&&csv.includes('source')&&!csv.includes('标题'),'CSV download retains original keys after presentation edits');
  await get('tab-rules').click();await namesMode(f,false);await source.click();check(await source.getAttribute('aria-pressed')==='true','source eye reports visible');const before=await headers();await handle('title').press('Space');await handle('title').press('End');
  check(JSON.stringify(await headers())===JSON.stringify(before),'keyboard reorder stays tentative until confirmation');await handle('title').press('Escape');
  check(JSON.stringify(await headers())===JSON.stringify(before),'Escape cancels tentative column order');
  await handle('title').press('Space');await handle('title').press('End');await handle('title').press('Enter');
  check((await headers())[1].startsWith('source')&&(await headers())[2].startsWith('标题'),'keyboard reorder commits the new order and retains labels');
  const from=await handle('title').boundingBox(),target=await handle('source').boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});await page.mouse.up();
  check((await headers())[1].startsWith('标题'),'mouse drag still reorders an inline-name row');
  await f.getByRole('button',{name:'显示列 title',exact:true}).click();await source.click();check(await source.getAttribute('aria-pressed')==='false','source eye reports hidden');check((await headers()).length===1,'all-hidden state retains only record actions');
  await namesMode(f,false);await restoreColumns(f);await namesMode(f,true);check((await headers()).length===3&&(await headers())[1].startsWith('title')&&await input.inputValue()==='title','Restore resets order, labels and visibility');
  await input.fill('中文输入');await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,isComposing:true})));
  check(await input.inputValue()==='中文输入','composition Escape does not discard a display-name edit');await input.press('Escape');
  await input.fill('标题');await input.press('Tab');check((await headers())[1].startsWith('标题'),'Tab retains a presentation name without a separate save form');
  await screenshot('07-columns-renamed');
  return checks;
}

async function namesMode(frame,selected){
  const control=frame.getByRole('switch',{name:'显示名称',exact:true});
  if(await control.isChecked()!==selected)await frame.locator('.rule-display-toggle label').click();
}
async function restoreColumns(frame){
  const options=frame.locator('#column-view-settings');
  if(await options.getAttribute('open')===null)await options.locator('summary').click();
  await frame.locator('#reset-columns').click();
}
