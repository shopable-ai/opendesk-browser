// Real Chrome UI 200% zoom proof: X11 Ctrl+Plus sent to a focused Chrome window.
// No CSS transforms, emulated device scale, setViewportSize, or page.set_content.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const input=resolve('prototypes/sidebar/workflow/index.html'),out=resolve(process.argv[2]||'artifacts/workflow-r232-zoom');
await mkdir(out,{recursive:true});
const sha256=createHash('sha256').update(await readFile(input)).digest('hex');
const gitBlob=execFileSync('git',['hash-object',input],{encoding:'utf8'}).trim();
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
// Real native zoom can cause Playwright's viewport screenshots to crop the physical window.
// Supplement with X11 screen captures and verify the physical pixels.
const capturePhysicalScreen=async filename=>{
 const dest=resolve(out,filename);
 execFileSync('scrot',['-q','95',dest]);
 const png=await readFile(dest);
 assert.ok(png.length>24&&png.readUInt32BE(16)>=1300&&png.readUInt32BE(20)>=900,
   'native zoom X11 screenshot must capture the full physical desktop');
 return filename;
};
let browser,version='NOT_STARTED',events=[],zoomData={status:'NOT_TESTED'};
try{
 browser=await chromium.launch({headless:false,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--window-size=1280,950']});
 version=browser.version();
 const context=await browser.newContext({viewport:null});
 const page=await context.newPage();
 await page.goto(pathToFileURL(input).href);
 await page.locator('#content .intro').waitFor({timeout:12000});
 // Developer test controls are collapsed by default, separate from the product UI.
 await page.locator('#r233-qa > summary').click();
 const zoom=()=>page.evaluate(()=>({dpr:devicePixelRatio,innerWidth,outerWidth,scale:visualViewport?.scale}));
 const start=await zoom();
 const windows=execFileSync('xdotool',['search','--name','OpenDesk Browser'],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);
 assert.ok(windows.length,'No browser window matching preview title');
 const windowId=windows[windows.length-1];
 execFileSync('xdotool',['windowfocus','--sync',windowId]);
 let current=start;
 for(let step=0;step<8;step++){
   execFileSync('xdotool',['key','--clearmodifiers','ctrl+plus']);
   await page.waitForTimeout(380);
   current=await zoom();
   events.push({step:step+1,...current,ratio:current.dpr/start.dpr});
   if(current.dpr/start.dpr>=1.95&&current.dpr/start.dpr<=2.05)break;
 }
 const factor=current.dpr/start.dpr;
 zoomData={status:factor>=1.95&&factor<=2.05?'CHROME_NATIVE_ZOOM_200_PASS':'NOT_TESTED',initial:start,current,factor,events,via:'real X11 native Chrome Ctrl+Plus; scrot physical X11 screenshots',windowId};
 assert.equal(zoomData.status,'CHROME_NATIVE_ZOOM_200_PASS','Chrome zoom ratio was not physically changed to 200%; never claim PASS');
 for(const width of ['360','420','520']){
   await page.locator('#r23-width').selectOption(width);
   const m=await page.evaluate(()=>{const d=document.querySelector('.device'),h=d.querySelector('.title-bar'),actions=[...h.querySelectorAll('button')];const boxes=actions.map(a=>a.getBoundingClientRect());return{actualWidth:Math.round(d.getBoundingClientRect().width),headerOverflow:h.scrollWidth>h.clientWidth+1,minTouch:boxes.every(b=>b.width>=39.5&&b.height>=39.5),overlap:boxes.some((b,i)=>i>0&&b.left<boxes[i-1].right-0.5),documentOverflow:document.documentElement.scrollWidth>innerWidth+1}});
   assert.equal(m.actualWidth,Number(width));assert.equal(m.headerOverflow,false);assert.equal(m.overlap,false);assert.equal(m.minTouch,true);
   assert.equal(m.documentOverflow,false);
   await page.locator('#r233-qa').evaluate(el=>{el.open=!el.open});
   await page.screenshot({path:resolve(out,'r232-real-200-'+width+'.png'),fullPage:true});
   await page.waitForTimeout(180);
   events.push({width,physicalScreenshot:await capturePhysicalScreen('r234-physical-200-chat-'+width+'.png')});
   await page.locator('#r233-qa').evaluate(el=>{el.open=!el.open});
   events.push({width,layout:m});
 }

 // Native browser zoom must not clip fields in the complete settings route.
 for(const width of ['360','420','520']){
   await page.locator('#r23-width').selectOption(width);
   await page.locator('#settings').click();
   await page.locator('#r236-https').check();
   await page.locator('#r23-api-key').scrollIntoViewIfNeeded();
   const geom=await page.evaluate(()=>{
     const d=document.querySelector('.device').getBoundingClientRect(),
       p=document.querySelector('.r23-settings').getBoundingClientRect(),
       body=document.querySelector('#r234-body').getBoundingClientRect(),
       field=document.querySelector('#r23-api-key').getBoundingClientRect(),
       back=document.querySelector('#r234-back').getBoundingClientRect(),
       switchBox=document.querySelector('.r236-switch').getBoundingClientRect(),
       note=document.querySelector('#r236-protocol-note').getBoundingClientRect(),
       url=document.querySelector('#r23-endpoint').closest('.r236-input-action').getBoundingClientRect();
     const fieldRows=[...document.querySelectorAll('.r234-field')].map(row=>{
       const a=row.querySelector('label').getBoundingClientRect(),
         b=(row.querySelector('.r236-input-action')||row.querySelector('.r234-secret')||row.querySelector('input')).getBoundingClientRect();
       return{stacked:a.bottom<b.top-4,sameLeft:Math.abs(a.left-b.left)<=2,
         inside:b.left>=p.left-1&&b.right<=p.right+1};
     });
     return{
       deviceWidth:d.width,panelWidth:p.width,
       inputInside:field.left>=p.left-1&&field.right<=p.right+1,
       backInside:back.left>=p.left-1&&back.right<=p.right+1,
       selectorAligned:Math.abs(switchBox.left-(body.left+parseFloat(getComputedStyle(document.querySelector('#r234-body')).paddingLeft)))<=2,
       selectorAtTop:Math.abs(switchBox.top-(body.top+parseFloat(getComputedStyle(document.querySelector('#r234-body')).paddingTop)))<=2,
       noVisibleSourceLabel:!document.querySelector('#r236-source-title'),
       accessibleSourceName:document.querySelector('.r236-switch legend')?.textContent.trim()==='AI 来源',
       selectorWidth:switchBox.width,
       noteAligned:Math.abs(note.left-url.left)<=2,
       rows:fieldRows,
       noFooter:!document.querySelector('.r234-footer'),
       documentOverflow:document.documentElement.scrollWidth>innerWidth+1
     };
   });
   assert.equal(Math.round(geom.deviceWidth),Number(width));
   assert.ok(Math.abs(geom.panelWidth-geom.deviceWidth)<=2,'settings route fits native Chrome 200%');
   assert.ok(geom.inputInside&&geom.backInside&&!geom.documentOverflow,'all controls stay accessible');
   assert.ok(geom.selectorAligned&&geom.selectorAtTop&&geom.noVisibleSourceLabel&&geom.accessibleSourceName,
     'source choices start settings without visible heading while retaining accessible name');
   assert.ok(geom.selectorWidth>=Number(width)-58,
     'source switch fills the bottom sheet rail under native Chrome zoom');
   assert.ok(geom.noteAligned&&geom.noFooter,'protocol hint and return controls are coherent');
   assert.ok(geom.rows.every(x=>x.stacked&&x.sameLeft&&x.inside),'native 200% input labels stacked correctly');
   await page.locator('#r233-qa').evaluate(el=>{el.open=!el.open});
   await page.screenshot({path:resolve(out,'r234-real-200-settings-'+width+'.png'),fullPage:true});
   await page.waitForTimeout(180);
   events.push({width,physicalScreenshot:await capturePhysicalScreen('r234-physical-200-settings-'+width+'.png')});
   if(width==='360'){
     // Settings now apply immediately; the persistent header Back is the sole
     // exit instead of a detached fixed-footer Done button.
     await page.locator('#r234-back').scrollIntoViewIfNeeded();
     const headerBack=await page.locator('#r234-back').evaluate(el=>{
       const b=el.getBoundingClientRect();return{top:b.top,bottom:b.bottom,viewport:innerHeight};
     });
     assert.ok(headerBack.top>=0&&headerBack.bottom<=headerBack.viewport+1,
       'header return remains reachable under native Chrome 200%');
     await page.waitForTimeout(220);
     events.push({width,headerBack,physicalScreenshot:await capturePhysicalScreen('r238-physical-200-header-back-360.png')});
   }
   await page.locator('#r233-qa').evaluate(el=>{el.open=!el.open});
   await page.locator('#r234-back').click();
   events.push({width,settingsLayout:geom});
 }

 console.log('R2391_REAL_CHROME_UI_200_ZOOM_PASS');
 await writeFile(resolve(out,'r232-real-zoom.json'),JSON.stringify({status:'CHROME_NATIVE_ZOOM_200_PASS',head,gitBlob,sha256,input,version,zoom:zoomData,events},null,2));
}catch(e){
 console.error(e);
 await writeFile(resolve(out,'r232-real-zoom.json'),JSON.stringify({status:'NOT_TESTED_OR_FAIL',head,gitBlob,sha256,input,version,zoom:zoomData,error:String(e?.stack||e),events},null,2));
 process.exitCode=1;
}finally{await browser?.close()}
