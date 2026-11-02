// Focused browser regression for the approved offline cookie-editor.html visual baseline.
// Run: node examples/sidebar-tools/cookie-editor/preview/cookie-editor-import.chromium.mjs
// Uses synthetic metadata only. Never accesses Chrome cookies or real credentials.
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const url=pathToFileURL(fileURLToPath(new URL('./cookie-editor.html',import.meta.url))).href;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
const page=await browser.newPage({viewport:{width:520,height:850}});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));
const count=()=>page.locator('#cookieRows .cookie-row').count();
const trigger=()=>page.getByRole('button',{name:'导入 Cookie',exact:true});
const sheet=()=>page.getByRole('dialog',{name:'导入 Cookie'});
const open=async()=>{
  await trigger().click();
  await sheet().waitFor();
  await page.locator('#importDialog').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
};
const test=async(name,run)=>{await run();console.log('PASS',name);};
const mock=(name,changes={})=>({name,domain:'shop.example.com',path:'/',session:true,secure:false,httpOnly:false,...changes});
const measure=()=>page.evaluate(()=>{
  const p=document.querySelector('#panel').getBoundingClientRect();
  const s=document.querySelector('#importDialog').getBoundingClientRect();
  const h=document.querySelector('.import-sheet-header').getBoundingClientRect();
  const f=document.querySelector('.import-sheet-footer').getBoundingClientRect();
  const b=document.querySelector('.import-sheet-body');
  return {panel:{x:p.x,y:p.y,width:p.width,height:p.height,bottom:p.bottom},
    sheet:{x:s.x,y:s.y,width:s.width,height:s.height,bottom:s.bottom},
    header:{top:h.top,bottom:h.bottom},footer:{top:f.top,bottom:f.bottom},
    body:{clientHeight:b.clientHeight,scrollHeight:b.scrollHeight},vw:innerWidth,vh:innerHeight,
    horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
});
const checkGeometry=async(short=false)=>{
  const m=await measure(),delta=3;
  assert.ok(m.sheet.x>=m.panel.x-delta&&m.sheet.x+m.sheet.width<=m.panel.x+m.panel.width+delta,JSON.stringify(m));
  assert.ok(m.sheet.bottom<=m.panel.bottom+delta&&Math.abs(m.sheet.bottom-m.panel.bottom)<=delta,JSON.stringify(m));
  assert.ok(m.sheet.y>=m.panel.y-delta&&m.sheet.height<=m.panel.height+delta,JSON.stringify(m));
  assert.ok(m.header.bottom<=m.footer.top+delta,JSON.stringify(m));
  assert.ok(m.body.clientHeight>=0&&m.body.scrollHeight>=m.body.clientHeight,JSON.stringify(m));
  if(short)assert.ok(m.sheet.bottom<=m.vh+delta&&m.horizontalOverflow<=delta,JSON.stringify(m));
};
try{
  await page.goto(url);
  await page.locator('#cookieRows .cookie-row').first().waitFor();
  await test('import opens a modal bottom sheet without unmounting the Cookie list',async()=>{
    const initial=await count();
    assert.equal(initial,8);
    await open();
    assert.equal(await count(),initial);
    assert.equal(await sheet().getAttribute('aria-modal'),'true');
    assert.equal(await page.locator('#panelScroll').getAttribute('inert'),'');
    assert.equal(await page.locator('#importConfirm').textContent(),'确认导入');
    assert.equal(await page.locator('#importOverwrite').isChecked(),true);
    await checkGeometry();
  });
  await test('dirty close, Escape, backdrop and focus restoration',async()=>{
    await page.locator('#importText').fill(JSON.stringify([mock('draft_not_imported')]));
    await page.getByRole('button',{name:'取消',exact:true}).last().click();
    assert.equal(await page.locator('#importDiscard').isVisible(),true);
    await page.locator('#importKeep').click();
    assert.equal(await sheet().isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#importDiscard').isVisible(),true);
    await page.locator('#importBackdrop').evaluate(el=>el.click());
    assert.equal(await sheet().isVisible(),true,'backdrop must not discard a draft');
    await page.locator('#importDiscardConfirm').click();
    assert.equal(await sheet().isVisible(),false);
    assert.equal(await page.locator('#panelScroll').getAttribute('inert'),null);
    await page.waitForFunction(()=>document.activeElement?.getAttribute('data-action')==='import');
    assert.equal(await count(),8);
  });
  await test('file picker stages a file until one explicit Confirm click',async()=>{
    await open();
    await page.locator('#importFile').setInputFiles({
      name:'preview-metadata.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify([mock('picker_imported')]))
    });
    assert.equal(await page.locator('#importFileName').isVisible(),true);
    assert.equal(await count(),8,'file selection is not a write');
    await page.getByRole('button',{name:'确认导入'}).click();
    await sheet().waitFor({state:'hidden'});
    assert.equal(await sheet().isVisible(),false);
    assert.equal(await count(),9);
    assert.equal(await page.locator('#cookieRows').getByText('picker_imported').count(),1);
  });
  await test('native drag/drop stages and directly imports after confirmation',async()=>{
    await open();
    const payload=JSON.stringify([mock('drag_imported')]);
    await page.locator('#importDropzone').evaluate((el,json)=>{
      const data=new DataTransfer();
      data.items.add(new File([json],'drag-metadata.json',{type:'application/json'}));
      for(const type of ['dragenter','dragover','drop']){
        el.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:data}));
      }
    },payload);
    assert.equal(await page.locator('#importFileName').isVisible(),true);
    assert.equal(await count(),9,'drop alone is not a write');
    await page.locator('#importConfirm').click();
    await sheet().waitFor({state:'hidden'});
    assert.equal(await count(),10);
    assert.equal(await page.locator('#cookieRows').getByText('drag_imported').count(),1);
  });
  await test('value-bearing input is rejected without updating the list',async()=>{
    await open();
    await page.locator('#importText').fill(JSON.stringify([mock('unsafe_preview',{value:'synthetic-secret'})]));
    await page.locator('#importConfirm').click();
    assert.equal(await page.locator('#importError').isVisible(),true);
    assert.equal(await count(),10);
    await page.locator('#importCancel').click();
    await page.locator('#importDiscardConfirm').click();
    assert.equal(await sheet().isVisible(),false);
  });
  await test('search and list remain mounted across a clean open/close',async()=>{
    await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('theme');
    const query=await page.getByRole('searchbox',{name:'搜索 Cookie'}).inputValue();
    const scroll=await page.locator('#panelScroll').evaluate(el=>el.scrollTop);
    await open();await page.locator('#importClose').click();
    assert.equal(await page.getByRole('searchbox',{name:'搜索 Cookie'}).inputValue(),query);
    assert.equal(await page.locator('#panelScroll').evaluate(el=>el.scrollTop),scroll);
  });
  await page.locator('#labReset').click();
  await test('320, 360, 400 and 440px sheet geometry',async()=>{
    for(const width of [320,360,400,440]){
      await page.locator('#labWidth').selectOption(String(width));
      await open();await checkGeometry();
      await page.locator('#importClose').click();
    }
  });
  await test('320 × 420px short viewport keeps header, footer and sheet inside screen',async()=>{
    await page.setViewportSize({width:320,height:420});
    await page.locator('#labWidth').selectOption('320');
    await open();
    await checkGeometry(true);
    await page.locator('#importClose').click();
  });
  assert.deepEqual(pageErrors,[],'Browser page errors');
  console.log('PASS no uncaught browser errors');
}finally{
  await browser.close();
}
