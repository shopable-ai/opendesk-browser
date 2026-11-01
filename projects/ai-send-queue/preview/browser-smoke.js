// Optional preview check; Sidebar instructions never consume the simulated queue.
(async page=>{
  const errors=[];const record=error=>errors.push(error.message);page.on('pageerror',record);
  const ensure=(value,reason)=>{if(!value)throw Error(reason);};
  try{
    await page.reload();await page.waitForFunction(()=>window.__sendQueuePreview?.().artworkLoaded);
    const f=page.frameLocator('#sidebar-frame');
    await f.getByText('在 ChatGPT 网页中使用',{exact:true}).waitFor();
    await page.locator('#sample-add').click();
    await page.waitForFunction(()=>window.__sendQueuePreview().items.length===3);
    ensure(await f.locator('button').count()===0,'Sidebar still exposes queue actions');
    const messages=await page.evaluate(()=>window.__sendQueuePreview().items.map(item=>item.text));
    const sidebar=await f.locator('#tool-app').innerText();
    ensure(messages.every(text=>!sidebar.includes(text)),'Sidebar displays queue data');
    ensure(errors.length===0,errors.join('\n'));
    return {status:'PREVIEW_BROWSER_PASS',buildId:(await page.evaluate(()=>window.__sendQueuePreview())).buildId,
      simulation:true,checks:['Sidebar instructions','Page-only queue display'],errors};
  }finally{page.off('pageerror',record);}
})
