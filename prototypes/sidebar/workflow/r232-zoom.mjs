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
 zoomData={status:factor>=1.95&&factor<=2.05?'CHROME_NATIVE_ZOOM_200_PASS':'NOT_TESTED',initial:start,current,factor,events,via:'real X11 native Chrome Ctrl+Plus',windowId};
 assert.equal(zoomData.status,'CHROME_NATIVE_ZOOM_200_PASS','Chrome zoom ratio was not physically changed to 200%; never claim PASS');
 for(const width of ['360','420','520']){
   await page.locator('#r23-width').selectOption(width);
   const m=await page.evaluate(()=>{const d=document.querySelector('.device'),h=d.querySelector('.title-bar'),actions=[...h.querySelectorAll('button')];const boxes=actions.map(a=>a.getBoundingClientRect());return{actualWidth:Math.round(d.getBoundingClientRect().width),headerOverflow:h.scrollWidth>h.clientWidth+1,minTouch:boxes.every(b=>b.width>=39.5&&b.height>=39.5),overlap:boxes.some((b,i)=>i>0&&b.left<boxes[i-1].right-0.5),documentOverflow:document.documentElement.scrollWidth>innerWidth+1}});
   assert.equal(m.actualWidth,Number(width));assert.equal(m.headerOverflow,false);assert.equal(m.overlap,false);assert.equal(m.minTouch,true);
   assert.equal(m.documentOverflow,false);
   await page.locator('#r233-qa > summary').click();
   await page.screenshot({path:resolve(out,'r232-real-200-'+width+'.png'),fullPage:true});
   await page.locator('#r233-qa > summary').click();
   events.push({width,layout:m});
 }
 console.log('R232_REAL_CHROME_UI_200_ZOOM_PASS');
 await writeFile(resolve(out,'r232-real-zoom.json'),JSON.stringify({status:'CHROME_NATIVE_ZOOM_200_PASS',head,gitBlob,sha256,input,version,zoom:zoomData,events},null,2));
}catch(e){
 console.error(e);
 await writeFile(resolve(out,'r232-real-zoom.json'),JSON.stringify({status:'NOT_TESTED_OR_FAIL',head,gitBlob,sha256,input,version,zoom:zoomData,error:String(e?.stack||e),events},null,2));
 process.exitCode=1;
}finally{await browser?.close()}
