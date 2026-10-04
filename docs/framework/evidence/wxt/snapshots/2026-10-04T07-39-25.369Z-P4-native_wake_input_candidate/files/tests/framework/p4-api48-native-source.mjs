// Saved through the actual product editor and executed by its bound Worker.
// This proves this execution mode's semantics, not all original API48 variants.
export const api48Source = `
const checks=[];
async function check(member,work){
  try{const actual=await work();checks.push({member,ok:true,actual});}
  catch(e){checks.push({member,ok:false,error:{code:e.code,name:e.name,message:e.message}});}
}
function eq(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Expected '+JSON.stringify(b)+' got '+JSON.stringify(a));return true;}
async function denied(work,codes){try{await work();}catch(e){if(codes.includes(e.code))return {code:e.code};throw e;}throw Error('Expected rejection');}
await check('ChromePage.keyboard',()=>eq(page.keyboard.page===page,true));
await check('ChromePage.environment',()=>eq(page.environment,'CHROME'));
await check('ChromePage.debug',()=>eq(page.debug,true));
await check('ChromePage.constructor',()=>denied(()=>new page.constructor(),['E_PAGE_CONTEXT_REQUIRED']));
await check('ChromePage.handleMessage',()=>denied(()=>page.handleMessage({}),['E_CALLBACK_UNAUTHORIZED']));
await check('ChromePage.operationCompleted',()=>denied(()=>page.operationCompleted({}),['E_CALLBACK_UNAUTHORIZED']));
await check('ChromePage.title',async()=>eq(await page.title(),'Controller api48'));
await check('ChromePage.content',async()=>eq((await page.content()).includes('id="marker"'),true));
await check('ChromePage.url',async()=>eq(await page.url(),params.url));
await check('ChromePage.reload',async()=>eq(await page.reload({timeout:5000}),undefined));
await check('ChromePage.goto',async()=>eq(await page.goto(params.url,{timeout:5000}),undefined));
await check('ChromePage.$',()=>denied(()=>page.$('#marker'),['E_DOM_SNAPSHOT_CONTEXT']));
await check('ChromePage.$$',()=>denied(()=>page.$$('.item'),['E_DOM_SNAPSHOT_CONTEXT']));
await check('ChromePage.$eval',async()=>eq(await page.$eval('#marker',e=>e.textContent),'A'));
await check('ChromePage.$$eval',async()=>eq(await page.$$eval('.item',els=>els.map(e=>e.textContent)),['one','two']));
await check('ChromePage.addScriptTag',async()=>{await page.addScriptTag({content:'globalThis.__p4Tag=7;'});return eq(await page.evaluate(()=>globalThis.__p4Tag),7);});
await check('ChromePage.addStyleTag',async()=>{await page.addStyleTag({content:'#marker {color:rgb(1, 2, 3)}'});return eq(await page.$eval('#marker',e=>getComputedStyle(e).color),'rgb(1, 2, 3)');});
await check('ChromePage.cookies',async()=>eq(Array.isArray(await page.cookies(params.url)),true));
await check('ChromePage.setCookie',async()=>{await page.setCookie({url:params.url,name:'p4',value:'yes'});return eq((await page.cookies(params.url)).find(c=>c.name==='p4')?.value,'yes');});
await check('ChromePage.deleteCookie',async()=>{await page.deleteCookie({url:params.url,name:'p4'});return eq((await page.cookies(params.url)).some(c=>c.name==='p4'),false);});
await check('ChromePage.click',async()=>eq(await page.click('#submit'),'clicked'));
await check('ChromePage.type',async()=>eq(await page.type('#name','Native'),'Typed'));
await check('ChromePage.waitFor',async()=>{await page.waitFor('#marker');return true;});
await check('ChromePage.waitForTimeout',async()=>{await page.waitForTimeout(10);return true;});
let element;
await check('ChromePage.waitForSelector',async()=>{element=await page.waitForSelector('#name');return eq(element.selector,'#name');});
await check('ChromePage.waitForFunction',async()=>{await page.waitForFunction(()=>document.querySelector('#marker').textContent==='A',{timeout:2000});return true;});
await check('ChromePage.screenshot',()=>denied(()=>page.screenshot({fullPage:true}),['E_FULL_PAGE_UNSUPPORTED']));
await check('ChromePage.screenshotInWebview',()=>denied(()=>page.screenshotInWebview(),['E_CAPABILITY_UNAVAILABLE']));
await check('ChromePage.screenshotInChrome',()=>denied(()=>page.screenshotInChrome({format:'webp'}),['E_OPTION_UNSUPPORTED']));
await check('ChromePage.uploadFile',async()=>{await page.uploadFile('#file','data:text/plain;base64,YWJj');return eq(await page.$eval('#file',e=>e.files.length),1);});
await check('ChromePage._uploadFromBlob',async()=>{await page._uploadFromBlob('#file',new Uint8Array([97,98,99]).buffer);return eq(await page.$eval('#file',e=>e.files[0].size),3);});
await check('ChromePage._uploadFromDataUrl',async()=>{await page._uploadFromDataUrl('#file','data:text/plain;base64,YWJj');return eq(await page.$eval('#file',e=>e.files[0].size),3);});
await check('ChromePage._uploadFromUrl',async()=>{await page._uploadFromUrl('#file',params.fileURL);return eq(await page.$eval('#file',e=>e.files[0].size),3);});
await check('ChromePage.eval',async()=>eq(await page.eval('false',{mode:'expression'}),false));
await check('ChromePage.evaluate',async()=>eq(await page.evaluate(async value=>({value,zero:0}),false),{value:false,zero:0}));
await check('ChromePage._execute',()=>denied(()=>page._execute(),['E_INTERNAL_API_ONLY']));
await check('ChromeElement.page',()=>eq(element.page===page,true));
await check('ChromeElement.selector',()=>eq(element.selector,'#name'));
let button;
await check('ChromeElement.constructor',async()=>{button=await page.waitForSelector('#submit');const view=new button.constructor(page,'#submit');return eq(view.page===page,true);});
await check('ChromeElement.click',async()=>eq(await button.click(),'clicked'));
await check('ChromeElement.type',async()=>eq(await element.type('Element'),'Typed'));
await check('ChromeElement.uploadFile',async()=>{const file=await page.waitForSelector('#file');await file.uploadFile('data:text/plain;base64,YWJj');return eq(await page.$eval('#file',e=>e.files[0].size),3);});
await check('Keyboard.page',()=>eq(page.keyboard.page===page,true));
await check('Keyboard.constructor',()=>eq(new page.keyboard.constructor(page).page===page,true));
await check('Keyboard.type',async()=>eq(await page.keyboard.type('A'),undefined));
await check('Keyboard.press',async()=>eq(await page.keyboard.press('Enter'),undefined));
await check('Keyboard.down',async()=>eq(await page.keyboard.down('Shift'),undefined));
await check('Keyboard.up',async()=>eq(await page.keyboard.up('Shift'),undefined));
return {checks,executionMode:'saved-controller-worker',originalMatrixClosed:false};
`;
