import test from 'node:test';
import assert from 'node:assert/strict';
import {checkReadingTocContentAccess,chromeSitePattern} from '../../projects/reading-toc/trusted/existing-tabs.js';
import {READING_TOC_CHROME_ACCESS_PROTOCOL} from '../../src/sidebar-tools/official-reading-toc.js';

test('R1.1 worker accepts only real same-extension top-frame sender and live Chrome permission',async()=>{
 const attempts=[];
 const api={runtime:{id:'fixed-extension'},permissions:{async contains(request){attempts.push(request);return true;}}};
 const sender={id:'fixed-extension',tab:{id:4},frameId:0,url:'https://example.com/article'};
 assert.equal(await checkReadingTocContentAccess({api,sender,expectedUrl:'https://example.com/spa'}),true);
 assert.deepEqual(attempts,[{origins:['https://example.com/*']}]);
 assert.equal(await checkReadingTocContentAccess({api,sender:{...sender,id:'another-extension'},expectedUrl:sender.url}),false);
 assert.equal(await checkReadingTocContentAccess({api,sender:{...sender,tab:undefined},expectedUrl:sender.url}),false);
 assert.equal(await checkReadingTocContentAccess({api,sender:{...sender,frameId:1},expectedUrl:sender.url}),false);
 assert.equal(await checkReadingTocContentAccess({api,sender,expectedUrl:'https://evil.example'}),false);
 assert.equal(await checkReadingTocContentAccess({api,sender,expectedUrl:'chrome://settings'}),false);
 assert.equal(attempts.length,1,'forged requests never probe Chrome permissions');
 assert.match(READING_TOC_CHROME_ACCESS_PROTOCOL,/chrome-access/);
 assert.equal(chromeSitePattern('http://localhost:3000/path'),'http://localhost/*');
 api.permissions.contains=async()=>false;
 assert.equal(await checkReadingTocContentAccess({api,sender,expectedUrl:sender.url}),false);
});
