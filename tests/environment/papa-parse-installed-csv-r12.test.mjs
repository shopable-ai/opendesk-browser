import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {browserTextDownloadUrl} from '../../src/framework/sdk/browser-schemas.js';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
const project='examples/sidebar-tools/papaparse-csv-export';
test('tool build embeds only the official catalog-verified Papa bytes',async()=>{
  const pkg=await createSidebarToolPackage(project),row=BUILTIN_CATALOG.libraries.papaParse;
  assert.equal(pkg.format,'opendesk.sidebar-tool.v2');
  assert.deepEqual(pkg.capabilities,['user.export']);
  assert.equal(pkg.scripts.length,1);
  assert.equal(pkg.scripts[0].sha256,row.sha256);
  assert.equal(pkg.scripts[0].name,row.output);
  assert.equal(pkg.scripts[0].code,await readFile(row.source,'utf8'));
  assert.match(pkg.js,/Papa\.unparse/);
  assert.equal(BROWSER_OPERATIONS['browser.downloads.text'].requiresUserGesture,true);
  assert(BROWSER_OPERATIONS['browser.downloads.text'].requiredChromePermissions.includes('downloads'));
});
test('installed CSV click invokes upstream parser and canonical SDK while preserving bytes',async()=>{
  const pkg=await createSidebarToolPackage(project);
  const records=[['Book','18','0000123456789012345'],['Pen','3','0000002'],
    ['苹果, "Pro"','5','0000003'],['=1+2','0','0000004']];
  let click;
  const button={disabled:false,addEventListener:(_type,fn)=>{click=fn;}};
  const status={textContent:''};
  const table={querySelectorAll:selector=>{
    assert.equal(selector,'tbody tr');
    return records.map(row=>({cells:row.map(textContent=>({textContent}))}));
  }};
  const elements={'#csv-table':table,'#csv-export':button,'#csv-status':status};
  const requests=[],states=[];
  const browser=createBrowserSdk({request:async(operation,args)=>{
    assert.equal(operation,'browser.downloads.text');requests.push(args);return {started:true};
  }});
  const context=vm.createContext({OpenDeskTool:{
    root:{querySelector:selector=>elements[selector]},setState:state=>states.push(state)
  },OpenDeskSDK:{browser}});
  vm.runInContext(pkg.scripts[0].code,context,{timeout:3000});
  vm.runInContext(pkg.js,context,{timeout:3000});
  assert.equal(typeof click,'function');
  await click({isTrusted:false});
  assert.equal(requests.length,0);
  await click({isTrusted:true});
  assert.equal(requests.length,1);
  assert.equal(requests[0].filename,'products.csv');
  const csv=requests[0].text;
  assert(csv.startsWith('\uFEFFname,price,sku\r\n'));
  assert(csv.includes('苹果, ""Pro""'));
  assert(csv.includes("'=1+2"));
  assert(csv.includes('0000123456789012345'));
  const uri=browserTextDownloadUrl(requests[0]);
  assert(uri.startsWith('data:text/csv;charset=utf-8,'));
  assert.equal(decodeURIComponent(uri.slice(uri.indexOf(',')+1)),csv);
  const parsed=vm.runInContext('Papa.parse('+JSON.stringify(csv)+',{header:true,skipEmptyLines:true,dynamicTyping:false})',context);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.data.length,4);
  assert.equal(parsed.data[2].name,'苹果, "Pro"');
  assert.equal(parsed.data[0].sku,'0000123456789012345');
  assert.equal(button.disabled,false);
  assert.match(status.textContent,/已收到 CSV 下载请求/);
  assert.deepEqual(JSON.parse(JSON.stringify(states)),[{dirty:false,busy:true},{dirty:false,busy:false}]);
});
test('tool reports SDK revocation, never a false disk-success receipt',async()=>{
  const pkg=await createSidebarToolPackage(project);
  let click;
  const button={disabled:false,addEventListener:(_type,fn)=>{click=fn;}};
  const status={textContent:''};
  const root={querySelector:selector=>({
    '#csv-table':{querySelectorAll:()=>[{cells:[{textContent:'Book'},{textContent:'18'},{textContent:'0001'}]}]},
    '#csv-export':button,'#csv-status':status
  })[selector]};
  const browser=createBrowserSdk({request:async()=>{
    throw Object.assign(Error('permission revoked'),{code:'E_GRANT_REVOKED'});
  }});
  const context=vm.createContext({OpenDeskTool:{root,setState(){}},OpenDeskSDK:{browser}});
  vm.runInContext(pkg.scripts[0].code,context);
  vm.runInContext(pkg.js,context);
  await click({isTrusted:true});
  assert.equal(button.disabled,false);
  assert.match(status.textContent,/E_GRANT_REVOKED/);
  assert.doesNotMatch(status.textContent,/已收到 CSV 下载请求/);
});
