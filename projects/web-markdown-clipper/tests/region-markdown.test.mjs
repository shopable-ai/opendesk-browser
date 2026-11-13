import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {domToMarkdown,CLIP_MAX_BYTES} from '../../../examples/shared/markdown/convert.js';

const bytes=text=>new TextEncoder().encode(text).length;
function paragraph(length){
 const dom=new JSDOM('<p></p>');
 const root=dom.window.document.querySelector('p');
 // Three-byte characters with an ASCII remainder, including the final newline.
 root.textContent='中'.repeat(Math.floor((length-1)/3))+'x'.repeat((length-1)%3);
 return {dom,root};
}
test('region Markdown retains exact UTF-8 boundaries without truncation',()=>{
 for(const length of [159999,160000,160001]){
  const {dom,root}=paragraph(length);
  try{
   if(length>160000)assert.throws(()=>domToMarkdown(root,'https://example.test',{maxBytes:160000}),/160,000/);
   else{
    const markdown=domToMarkdown(root,'https://example.test',{maxBytes:160000});
    assert.equal(bytes(markdown),length);assert.equal(markdown,root.textContent+'\n');
   }
  }finally{dom.window.close();}
 }
});
test('region budget does not raise the legacy article/selection budget',()=>{
 const {dom,root}=paragraph(155000);
 try{
  assert.equal(CLIP_MAX_BYTES,150000);
  assert.throws(()=>domToMarkdown(root,'https://example.test'),/150 KB/);
  assert.equal(bytes(domToMarkdown(root,'https://example.test',{maxBytes:160000})),155000);
  for(const maxBytes of [160001,Infinity,NaN,0,-1,159999.5])
   assert.throws(()=>domToMarkdown(root,'https://example.test',{maxBytes}),/上限无效/);
 }finally{dom.window.close();}
});
test('code escapes and newlines retain their content even when JSON is much larger',()=>{
 const dom=new JSDOM('<pre><code class="language-js"></code></pre>');
 try{
  const code=dom.window.document.querySelector('code');
  code.textContent='\\'.repeat(140000);
  const markdown=domToMarkdown(code.parentElement,'https://example.test',{maxBytes:160000});
  assert.equal(markdown,'```js\n'+code.textContent+'\n```\n');
  assert.ok(bytes(markdown)<160000);assert.ok(bytes(JSON.stringify({markdown}))>176000);
 }finally{dom.window.close();}
});
