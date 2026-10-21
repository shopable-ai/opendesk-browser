// R4.0 source-bound Node regression for the ORIGINAL complete preview.
// This is NOT a browser, installed extension, or Trusted Host acceptance result.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const PREVIEW='examples/sidebar-tools/prompt-shortcuts/preview/index.html';
const load=()=>readFile(PREVIEW,'utf8');
const script=html=>{
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1,'the complete original HTML must remain one standalone preview');
  return scripts[0][1];
};
function decoderFixture(html){
  const js=script(html);
  const start=js.indexOf('// R4.0: preview-only file decoder remains the original implementation.');
  const end=js.indexOf('function rawFormValues()',start);
  assert(start>=0&&end>start,'must exercise actual original-preview image handler');
  // Only substitute the injected crypto fixture; the image processing source stays identical.
  const actual=js.slice(start,end).replace('const crypto=globalThis.crypto','const crypto=deps.crypto');
  const nodes=new Map();
  const el=id=>{
    if(!nodes.has(id))nodes.set(id,{
      id,checked:false,disabled:false,hidden:false,files:[],value:'',dataset:{},
      setAttribute(key,value){this[key]=value},
      removeAttribute(key){delete this[key]}
    });
    return nodes.get(id);
  };
  el('imageSourceLocal').checked=true;
  let serial=0;
  const deps={
    el,state:{items:[]},crypto:{getRandomValues(bytes){
      serial++;for(let index=0;index<bytes.length;index++)bytes[index]=(index+serial)%256;
      return bytes;
    }},
    document:{createElement(name){
      assert.equal(name,'canvas');
      return {getContext(){return {clearRect(){},drawImage(){}}},
        toBlob(done){done({size:128,type:'image/webp'})}};
    }},
    createImageBitmap:async()=>({width:100,height:50,close(){}}),
    FileReader:class{readAsDataURL(){
      this.result='data:image/webp;base64,QUJDREVGR0g=';this.onload();
    }}
  };
  const fn=new Function('deps',
    'const {el,state,document,createImageBitmap,FileReader}=deps;\n'+
    'let saving=false,imageUploadBusy=false,imageAssets={},'+
    'draftImageAssetId="",draftImageMeta=null,currentView="form",storageFails=false,updates=0;\n'+
    'function persistDemoAssets(next){if(storageFails)return false;imageAssets=next;return true;}\n'+
    'function updateMeter(){updates++;}\n'+actual+
    'return {chooseLocalImage,'+
      'setStorageFailure(value){storageFails=value},'+
      'setBusy(value){imageUploadBusy=value},'+
      'snapshot(){return {draftImageAssetId,draftImageMeta,imageAssets,imageUploadBusy,updates}}};'
  );
  return {el,api:fn(deps)};
}
test('R4 original full HTML retains complete preview, single upload affordance and 3 sizes',async()=>{
  const html=await load(),js=script(html);
  assert(html.length>125000,'must NOT replace original with a simplified mock');
  for(const id of ['pageRail','promptList','mockDraft','imageFile','imagePick','imageDropzone',
    'imageSourceLocal','imageSourceUrl','imageUrl','pictureExample','imageSelected',
    'imageReplace','imageClear','imageHelp','imageFieldError']){
    assert.equal([...html.matchAll(new RegExp('\\bid="'+id+'"','g'))].length,1,id);
  }
  const sizes=[...html.matchAll(/<button\b[^>]*\bdata-image-size="([^"]+)"[^>]*>/g)]
    .map(match=>match[1]);
  assert.deepEqual(sizes,['compact','standard','large']);
  assert.match(html,/选择图片/);
  assert.match(html,/或拖动图片到这里/);
  assert.match(html,/本地图片/);
  assert.match(html,/图片链接/);
  assert.match(html,/object-fit:contain/);
  assert.match(html,/role="alert" hidden><\/p>/);
  assert.match(js,/el\('imageFile'\)\.addEventListener\('change',\(\)=>void chooseLocalImage\(\)\)/);
  assert.match(js,/zone\.addEventListener\('drop',event=>\{/);
  assert.match(js,/void chooseLocalImage\(files\[0\]\)/);
  assert.match(js,/el\('imageSourceLocal'\)\.checked\?'':el\('imageUrl'\)\.value\.trim\(\)/);
  assert.match(js,/imageAssets\[value\.imageAssetId\]/);
  assert.match(js,/returnIndex\(\);notice\(/);
  new Function(js);
});
test('R4 exact preview decoder: picker cancellation and invalid files preserve the old asset',async()=>{
  const {el,api}=decoderFixture(await load());
  const file=(name,type,size=1000)=>({name,type,size});
  await api.chooseLocalImage(file('first.png','image/png'));
  const before=api.snapshot(),id=before.draftImageAssetId;
  assert.match(id,/^psa_[a-f0-9]{32}$/);
  assert.equal(Object.keys(before.imageAssets).length,1);
  assert.equal(before.draftImageMeta.name,'first.png');
  assert.match(before.draftImageMeta.description,/100×50/);
  assert.match(el('imageHelp').textContent,/图片已准备好/);
  assert.equal(el('imagePick').disabled,false);

  await api.chooseLocalImage(); // native picker canceled
  assert.equal(api.snapshot().draftImageAssetId,id);
  await api.chooseLocalImage(file('bad.svg','image/svg+xml'));
  assert.equal(api.snapshot().draftImageAssetId,id);
  assert.match(el('imageFieldError').textContent,/PNG/);
  await api.chooseLocalImage(file('too-big.png','image/png',2*1024*1024+1));
  assert.equal(api.snapshot().draftImageAssetId,id);
  assert.match(el('imageFieldError').textContent,/2 MB/);
  assert.equal(api.snapshot().updates,1,'failed/canceled selection cannot mutate the projected prompt');
});
test('R4 exact preview decoder: all allowed MIME types share the single image pipeline',async()=>{
  const {api}=decoderFixture(await load());
  for(const [name,mime] of [['a.png','image/png'],['b.jpg','image/jpeg'],['c.webp','image/webp']]){
    await api.chooseLocalImage({name,type:mime,size:2048});
    assert.equal(api.snapshot().draftImageMeta.name,name);
    assert.equal(Object.keys(api.snapshot().imageAssets).length,1,
      'an unreferenced prior draft asset is cleaned up on successful replacement');
  }
});
test('R4 exact preview decoder: storage failure and overlapping jobs fail without losing draft',async()=>{
  const {el,api}=decoderFixture(await load());
  await api.chooseLocalImage({name:'original.png',type:'image/png',size:512});
  const before=api.snapshot().draftImageAssetId;
  api.setStorageFailure(true);
  await api.chooseLocalImage({name:'replacement.jpg',type:'image/jpeg',size:2048});
  assert.equal(api.snapshot().draftImageAssetId,before);
  assert.match(el('imageFieldError').textContent,/保存失败/);
  api.setStorageFailure(false);
  api.setBusy(true);
  await api.chooseLocalImage({name:'overlap.webp',type:'image/webp',size:2048});
  assert.equal(api.snapshot().draftImageAssetId,before);
  api.setBusy(false);
  assert.equal(api.snapshot().updates,1);
});
