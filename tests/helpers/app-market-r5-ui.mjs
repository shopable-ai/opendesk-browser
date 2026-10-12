// Real Chrome layout, media-preference, tab zoom and native keyboard evidence.
// These observations do not add installation requests or mutate product data.
import assert from 'node:assert/strict';
export function marketUIAudit(d){
  const {evidence,evaluate,until,screenshot,activate}=d;
  const record=evidence.r5.ui={layouts:[],zoom:[],keyboard:[]};
  async function key(target,key,code,windowsVirtualKeyCode,modifiers=0){
    for(const type of ['keyDown','keyUp'])await target.send('Input.dispatchKeyEvent',{
      type,key,code,windowsVirtualKeyCode,modifiers,
      ...(type==='keyDown'&&key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
  }
  async function focused(target,selector){
    return evaluate(target,`(()=>{const el=document.activeElement,r=el.getBoundingClientRect();return {
      matches:el.matches(${JSON.stringify(selector)}),id:el.id,
      label:el.getAttribute('aria-label')||el.textContent.trim().slice(0,120),
      focusVisible:el.matches(':focus-visible'),disabled:Boolean(el.disabled),
      visible:r.width>0&&r.height>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight};})()`);
  }
  async function reach(target,selector,label){
    await activate(target);
    for(let step=0;step<40;step++){
      await key(target,'Tab','Tab',9);const state=await focused(target,selector);
      record.keyboard.push({label,action:'Tab',step,...state});
      if(state.matches){assert(state.visible&&state.focusVisible&&!state.disabled,label+' visible keyboard focus');return state;}
    }
    assert.fail(label+': intended control unreachable through native Tab');
  }
  async function enter(target,selector,label){
    await reach(target,selector,label);
    await key(target,'Tab','Tab',9,8);const previous=await focused(target,selector);
    record.keyboard.push({label,action:'Shift+Tab',...previous});assert(!previous.matches);
    await key(target,'Tab','Tab',9);
    const state=await until(async()=>{const value=await focused(target,selector);return value.matches&&value.visible&&value.focusVisible&&!value.disabled&&value;},label+' Tab returns to intended control');
    record.keyboard.push({label,action:'Enter',...state});await screenshot(target,label+'-keyboard-focus.png');
    await key(target,'Enter','Enter',13); // Once only; no click fallback/replay.
  }
  async function layout(target,label,selector){
    await until(()=>evaluate(target,`(async()=>{await document.fonts.ready;
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      return [...document.images].filter(img=>{const r=img.getBoundingClientRect();return r.width>0&&r.bottom>0&&r.top<innerHeight;}).every(img=>img.complete&&img.naturalWidth>0);})()`),label+' fonts and visible images ready');
    const state=await evaluate(target,`(()=>{const el=document.querySelector(${JSON.stringify(selector)}),r=el?.getBoundingClientRect();return {
      url:location.href,width:innerWidth,height:innerHeight,scrollY,scrollWidth:document.documentElement.scrollWidth,
      dark:matchMedia('(prefers-color-scheme: dark)').matches,color:getComputedStyle(document.body).color,background:getComputedStyle(document.body).backgroundColor,
      control:r?{left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom}:null,
      images:[...document.images].map(img=>({src:img.getAttribute('src'),widthAttribute:img.getAttribute('width'),heightAttribute:img.getAttribute('height'),naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}))};})()`);
    assert(state.scrollWidth<=state.width,label+' no document horizontal overflow');
    assert(state.control&&state.control.width>0,label+' control exists');
    assert(state.control.left>=0&&state.control.right<=state.width,label+' control not horizontally clipped');
    record.layouts.push({label,...state});await screenshot(target,label+'.png');
  }
  async function narrow(target,label,selector){
    await activate(target);
    try{
      await target.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:false});
      await until(()=>evaluate(target,'innerWidth===320'),label+' viewport 320');await layout(target,label+'-320',selector);
      const interactive=await evaluate(target,'document.querySelector('+JSON.stringify(selector)+')?.matches(\'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])\')');
      if(interactive){await reach(target,selector,label+'-320-action');await layout(target,label+'-320-action-visible',selector);}
    }finally{await target.send('Emulation.clearDeviceMetricsOverride');}
  }
  async function detail(target,label,selector){
    await activate(target);
    try{
      await target.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
      for(const width of [320,1280]){
        await target.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await until(()=>evaluate(target,'innerWidth==='+width),label+' viewport '+width);
        await evaluate(target,'window.scrollTo({top:0,left:0,behavior:"instant"})');
        await layout(target,label+'-'+width,selector);
        if(width===320){
          await target.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
          await until(()=>evaluate(target,"matchMedia('(prefers-color-scheme: dark)').matches"),label+' actual dark media preference');
          await layout(target,label+'-320-dark',selector);
          await target.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
          await reach(target,selector,label+'-320-action');
          await layout(target,label+'-320-action-visible',selector);
        }
      }
    }finally{await target.send('Emulation.clearDeviceMetricsOverride');await target.send('Emulation.setEmulatedMedia',{features:[]});}
    const url=await evaluate(target,'location.href');
    const tabs=await evaluate(d.getHost(),'chrome.tabs.query({}).then(tabs=>tabs.filter(tab=>tab.url==='+JSON.stringify(url)+').map(tab=>({id:tab.id,url:tab.url,pendingUrl:tab.pendingUrl})))');
    assert.equal(tabs.length,1,'unique actual Chrome tab for '+url);const tab=tabs[0];
    assert(Number.isSafeInteger(tab.id)&&tab.id>=0);assert(!tab.pendingUrl||tab.pendingUrl===url);
    const original=await evaluate(d.getHost(),`Promise.all([chrome.tabs.getZoom(${tab.id}),chrome.tabs.getZoomSettings(${tab.id})]).then(([factor,settings])=>({factor,settings}))`);
    try{
      await evaluate(d.getHost(),`chrome.tabs.setZoomSettings(${tab.id},{mode:'automatic',scope:'per-tab'})`);
      for(const factor of [1.25,2]){
        await evaluate(d.getHost(),`chrome.tabs.setZoom(${tab.id},${factor})`);
        const actual=await evaluate(d.getHost(),`chrome.tabs.getZoom(${tab.id})`);assert.equal(actual,factor,'actual Chrome tab zoom');
        record.zoom.push({label,tabId:tab.id,factor:actual,method:'Chrome tabs.setZoom/getZoom',scope:'per-tab'});
        await evaluate(target,'window.scrollTo({top:0,left:0,behavior:"instant"})');
        await layout(target,label+'-'+Math.round(factor*100)+'-percent',selector);
        await reach(target,selector,label+'-'+Math.round(factor*100)+'-action');
        await layout(target,label+'-'+Math.round(factor*100)+'-action-visible',selector);
      }
    }finally{
      await evaluate(d.getHost(),`chrome.tabs.setZoom(${tab.id},${original.factor})`);
      const restore={mode:original.settings.mode};if(restore.mode==='automatic')restore.scope=original.settings.scope;
      await evaluate(d.getHost(),`chrome.tabs.setZoomSettings(${tab.id},${JSON.stringify(restore)})`);
    }
  }
  return {key,focused,reach,enter,layout,narrow,detail};
}
