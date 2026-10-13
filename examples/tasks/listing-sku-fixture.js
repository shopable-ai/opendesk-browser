// Local Browser Test Lab demo data only. No event synthesis, network or storage.
(()=>{
  'use strict';
  const scope=document.querySelector('[data-opendesk-listing-fixture="seller-listing-v1"]');
  if(!scope)return;
  const rows=[...scope.querySelectorAll('[data-listing-variant]')];
  if(rows.length!==2)return;
  const field=(root,name)=>root.querySelector(`[data-listing-field="${name}"]`);
  const base={title:'便携式阅读灯 · 暖白色',description:'USB 供电，暖白色光，手动调节亮度',
    parentSku:'READ-LAMP-001',variants:[
      {sku:'READ-WARM-01',option:'暖白 / 小号',price:'129.00',stock:'8'},
      {sku:'READ-COOL-02',option:'冷白 / 小号',price:'139.00',stock:'12'}]};
  const names={valid:'正常商品',missing:'字段缺失',duplicate:'SKU 重复',variant:'变体异常'};
  function preset(name){
    if(!Object.hasOwn(names,name))return;
    const data=structuredClone(base);
    if(name==='missing'){data.title='';data.parentSku='';data.variants[1].sku='';}
    if(name==='duplicate')data.variants[1].sku=' read-warm-01 ';
    if(name==='variant'){data.variants[1].option='';data.variants[1].price='0';data.variants[1].stock='-1';}
    for(const key of ['title','description','parentSku'])field(scope,key).value=data[key];
    rows.forEach((row,index)=>{
      for(const key of ['sku','option','price','stock'])field(row,key).value=data.variants[index][key];
    });
    document.getElementById('listing-fixture-scenario').textContent='当前场景：'+names[name]+'（可继续手动编辑字段）';
  }
  scope.querySelectorAll('[data-listing-preset]').forEach(button=>
    button.addEventListener('click',()=>preset(button.getAttribute('data-listing-preset'))));
  preset('valid');
})();
