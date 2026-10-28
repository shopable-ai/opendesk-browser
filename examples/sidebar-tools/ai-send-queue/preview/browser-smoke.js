// Pass this file to Playwright browser_run_code_unsafe.filename after opening index.html over HTTP.
(async page=>{
  const errors=[];const record=error=>errors.push(error.message);page.on('pageerror',record);
  const ensure=(value,reason)=>{if(!value)throw Error(reason);};
  try{
    await page.reload();await page.waitForFunction(()=>window.__sendQueuePreview?.().artworkLoaded);
    const f=page.frameLocator('#sidebar-frame');
    await page.locator('#sample-add').click();await f.getByText('3 条待处理').waitFor();
    await f.getByRole('button',{name:'暂停此条消息'}).first().click();
    await page.waitForFunction(()=>window.__sendQueuePreview().items[0].state==='paused');
    await page.locator('#rows [data-id=q1] [data-action=resume]').click();
    await f.getByRole('button',{name:'恢复此条消息'}).waitFor({state:'hidden'});
    await f.getByRole('button',{name:'更多操作'}).nth(2).click();
    await f.getByRole('button',{name:'上移',exact:true}).click();
    await page.waitForFunction(()=>window.__sendQueuePreview().items[1].id==='q3');
    await f.getByRole('button',{name:'更多操作'}).nth(1).click();
    await f.getByRole('button',{name:'取回输入框编辑'}).click();
    const reclaimed=await page.locator('#draft').inputValue();ensure(reclaimed.includes('编辑'),'edit did not reclaim original text');
    await page.locator('#draft').fill(reclaimed+'（浏览器已编辑）');await page.locator('#blue').click();
    await f.getByText('3 条待处理').waitFor();
    await f.getByRole('button',{name:'更多操作'}).nth(1).click();
    await f.getByRole('button',{name:'删除此条'}).click();await f.getByText('2 条待处理').waitFor();
    await f.getByRole('button',{name:'提前发送',exact:true}).nth(1).click();await f.getByText('1 条待处理').waitFor();
    await page.locator('#finish').click();await f.getByText('0 条待处理').waitFor();
    await page.locator('#sample-add').click();await page.locator('#unknown').click();
    await f.getByText('发送结果未知 · 请核对原对话').waitFor();
    const before=await page.evaluate(()=>window.__sendQueuePreview());await page.locator('#finish').click();
    const after=await page.evaluate(()=>window.__sendQueuePreview());
    ensure(after.items.length===before.items.length&&after.phase==='unknown','unknown must not replay');
    await page.locator('#themes [data-value=dark]').click();
    await page.locator('#widths [data-value="440"]').click();
    await page.locator('#sizes [data-value="42"]').click();
    ensure(await f.locator('html').getAttribute('data-theme')==='dark','theme did not reach actual React document');
    ensure(await page.locator('#sidebar-width').evaluate(x=>x.getBoundingClientRect().width)===440,'width mismatch');
    const touch=await page.evaluate(()=>window.__sendQueuePreview().official);
    ensure(JSON.stringify(touch)===JSON.stringify({w:33.15,h:23.8,x:1.93,y:-15.72,angle:-1}),'R5.4 touch crown drift');
    await page.locator('#reset').click();await f.getByText('0 条待处理').waitFor();
    const reset=await page.evaluate(()=>window.__sendQueuePreview());
    ensure(reset.instance!==before.instance&&reset.items.length===0,'reset retained owner');
    ensure(JSON.stringify(reset.official)===JSON.stringify({w:27.2,h:19.55,x:1.4,y:-13.31,angle:-1}),'R5.4 desktop crown drift');
    ensure(errors.length===0,errors.join('\n'));
    return {status:'PREVIEW_BROWSER_PASS',buildId:reset.buildId,simulation:true,
      checks:['sample ×3','Sidebar→Page pause','Page→Sidebar resume','move','edit and re-enqueue','delete','send now','reply complete FIFO','unknown no replay','theme','width','R5.4 crown','reset'],errors};
  }finally{page.off('pageerror',record);}
})
