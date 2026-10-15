// Opaque-sandbox member surface. No account, SKU, receipt or expiry is inferred locally.
(function(){
  'use strict';
  const root=window.OpenDeskTool&&window.OpenDeskTool.root;
  if(!root)return;
  const shop=root.querySelector('#ai-vip-shop-open'),status=root.querySelector('#ai-vip-shop-status');
  // Business-owned audited configuration. Empty until a legitimate merchant is deployed.
  const PRODUCT_CATALOG_URL='';
  function validCatalogUrl(value){
    if(typeof value!=='string'||!value)return null;
    try{
      const url=new URL(value);
      const localDevelopment=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
      if(!(url.protocol==='https:'||localDevelopment)||!url.hostname||
         url.username||url.password||url.hash||url.href.length>2048)return null;
      return url.href;
    }catch{return null;}
  }
  const catalog=validCatalogUrl(PRODUCT_CATALOG_URL);
  if(!shop||!status)return;
  shop.disabled=!catalog;
  status.textContent=catalog?'在新标签页打开正式商品目录，不使用商品弹窗。':
    '正式商品目录尚未配置，不展示虚假价格或订单。';
  shop.addEventListener('click',event=>{
    if(event?.isTrusted!==true||!catalog||shop.disabled)return;
    shop.disabled=true;
    status.textContent='正在请求打开商品目录…';
    // A future reviewed v2 tool must declare browser.tabs; the existing Browser SDK
    // enforces the trusted one-use navigation intent, without sandbox window.open.
    const sdk=window.OpenDeskSDK?.browser?.tabs;
    Promise.resolve().then(()=>{
      if(typeof sdk?.create!=='function')throw Error('当前版本缺少网页打开能力');
      return sdk.create({url:catalog});
    }).then(
      ()=>{status.textContent='已请求在浏览器新标签页打开商品目录。';},
      error=>{status.textContent='未能打开商品目录：'+String(error?.message||error).slice(0,160);}
    ).finally(()=>{shop.disabled=false;});
  });
})();
