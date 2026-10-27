#!/usr/bin/env node
// Browser smoke for the two source-bound iframe documents, not a third UI.
import assert from 'node:assert/strict';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const here=dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
try{
 const page=await browser.newPage({viewport:{width:1000,height:920},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(join(here,'a-b.html')).href,{waitUntil:'load'});
 const approved=page.frameLocator('#approved-html');
 const current=page.frameLocator('#current-react');
 await approved.locator('#tabAccounts').click({timeout:18000});
 await approved.locator('#viewAccounts').waitFor({state:'visible',timeout:18000});
 await current.locator('#cookie-product-tab-accounts').click({timeout:18000});
 await current.locator('#cookie-product-panel-accounts').waitFor({state:'visible',timeout:18000});
 assert.equal(await page.locator('iframe').count(),2,'exact original + current React');
 assert.equal(errors.length,0,'wrapper page is error-free');
 const output=join(here,'../../../../../artifacts/cookie-editor-r35-visual');
 await mkdir(output,{recursive:true});
 await page.screenshot({path:join(output,'380-side-by-side-a-b.png'),
   animations:'disabled',caret:'hide'});
 console.log(JSON.stringify({status:'R35_AB_INTERACTIVE_PASS',
   html:'preview/react/a-b.html',original:'approved HTML',react:'formal source / Mock SDK'}));
}finally{await browser.close();}
