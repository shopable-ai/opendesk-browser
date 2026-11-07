// Focused browser regression for the approved offline cookie-editor.html visual baseline.
// Run: node projects/cookie-editor/preview/cookie-editor-import.chromium.mjs
// Uses synthetic metadata only. Never accesses Chrome cookies or real credentials.
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {chromium}=createRequire(new URL('./react/package.json',import.meta.url))('playwright');

const url=pathToFileURL(fileURLToPath(new URL('./cookie-editor.html',import.meta.url))).href;
const output=fileURLToPath(new URL('../../../artifacts/cookie-import-dropzone/html/',import.meta.url));
await mkdir(output,{recursive:true});
const sourceHash=createHash('sha256').update(await readFile(new URL(url))).digest('hex');
const pass=[],network=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
const page=await browser.newPage({viewport:{width:520,height:850}});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));
page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
const count=()=>page.locator('#cookieRows .cookie-row').count();
const trigger=()=>page.getByRole('button',{name:'导入 Cookie',exact:true});
const sheet=()=>page.getByRole('dialog',{name:'导入 Cookie'});
const open=async()=>{
  await trigger().click();
  await sheet().waitFor();
  await page.locator('#importDialog').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
};
const test=async(name,run)=>{await run();pass.push(name);console.log('PASS',name);};
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
    await page.locator('#panel').screenshot({path:output+'dropzone-empty.png'});
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
    const zone=page.locator('#importDropzone');
    const file={
      name:'preview-metadata.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify([mock('picker_imported')]))
    };
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),zone.click({position:{x:8,y:8}})]);
    await chooser.setFiles(file);
    assert.equal(await page.locator('#importFileName').isVisible(),true);
    assert.match(await zone.innerText(),/文件已暂存/);
    await zone.focus();
    const [keyboardChooser]=await Promise.all([page.waitForEvent('filechooser'),page.keyboard.press('Enter')]);
    assert.equal(await page.locator('#importFile').inputValue(),'','same file can be selected again');
    await keyboardChooser.setFiles(file);
    const [spaceChooser]=await Promise.all([page.waitForEvent('filechooser'),zone.press('Space')]);
    await spaceChooser.setFiles([]);
    assert.match(await page.locator('#importFileName').innerText(),/preview-metadata.json/,'picker cancellation keeps the staged file');
    await page.locator('#panel').screenshot({path:output+'dropzone-selected.png'});
    await page.locator('#importFile').setInputFiles({name:'too-large.json',mimeType:'application/json',buffer:Buffer.alloc(8*1024*1024+1)});
    assert.equal(await page.locator('#importError').isVisible(),true);
    assert.match(await page.locator('#importFileName').innerText(),/preview-metadata.json/,'oversized replacement keeps the staged file');
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
    const zone=page.locator('#importDropzone');
    const background=await zone.evaluate(el=>getComputedStyle(el).backgroundColor);
    const transfer=await page.evaluateHandle(json=>{
      const data=new DataTransfer();
      data.items.add(new File([json],'drag-metadata.json',{type:'application/json'}));
      return data;
    },payload);
    await zone.dispatchEvent('dragenter',{dataTransfer:transfer});
    await zone.dispatchEvent('dragover',{dataTransfer:transfer});
    assert.match(await zone.innerText(),/松开以选择文件/);
    assert.notEqual(await zone.evaluate(el=>getComputedStyle(el).backgroundColor),background);
    await page.locator('#panel').screenshot({path:output+'dropzone-dragging.png'});
    await zone.dispatchEvent('dragleave',{dataTransfer:transfer});
    assert.equal(await zone.evaluate(el=>getComputedStyle(el).backgroundColor),background);
    await zone.dispatchEvent('dragenter',{dataTransfer:transfer});
    await zone.dispatchEvent('drop',{dataTransfer:transfer});
    await transfer.dispose();
    assert.match(await zone.innerText(),/文件已暂存/);
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
  await test('paste replaces a staged file and overwrite remains an explicit choice',async()=>{
    await page.getByRole('searchbox',{name:'搜索 Cookie'}).fill('');
    await page.waitForFunction(()=>document.querySelectorAll('#cookieRows .cookie-row').length===10);
    await open();
    await page.locator('#importFile').setInputFiles({name:'unused.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([mock('unused')]))});
    await page.locator('#importText').fill(JSON.stringify([mock('picker_imported',{secure:true}),mock('paste_imported')]));
    assert.equal(await page.locator('#importFileName').isHidden(),true);
    assert.doesNotMatch(await page.locator('#importDropzone').innerText(),/文件已暂存/);
    await page.locator('#importOverwrite').uncheck();
    await page.locator('#importConfirm').click();
    await sheet().waitFor({state:'hidden'});
    assert.equal(await count(),11);
    assert.equal(await page.locator('#cookieRows').getByText('unused',{exact:true}).count(),0);
    assert.match(await page.locator('#toast').innerText(),/覆盖 0、跳过 1/);
    await open();
    assert.equal(await page.locator('#importOverwrite').isChecked(),true);
    await page.locator('#importText').fill(JSON.stringify([mock('picker_imported',{secure:true})]));
    await page.locator('#importConfirm').click();
    await sheet().waitFor({state:'hidden'});
    assert.equal(await count(),11);
    assert.match(await page.locator('#toast').innerText(),/覆盖 1、跳过 0/);
  });
  if(process.argv.includes('--geometry')){
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
  }
  assert.deepEqual(pageErrors,[],'Browser page errors');
  assert.deepEqual(network,[],'Offline preview makes no external requests');
  assert.equal(createHash('sha256').update(await readFile(new URL(url))).digest('hex'),sourceHash,'HTML stayed stable during verification');
  await writeFile(output+'results.json',JSON.stringify({status:'PASS',url,sourceHash,chromium:browser.version(),tests:pass,pageErrors,network,geometry:process.argv.includes('--geometry'),gaps:['Offline fictional metadata only','Real Cookie SDK, package and installed Chrome NOT_TESTED']},null,2)+'\n');
  console.log('PASS no uncaught browser errors');
}finally{
  await browser.close();
}
