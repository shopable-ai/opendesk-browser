// Run with ego-browser nodejs; Replace EGO_TEST_SPACE with your dedicated TaskSpace ID via stdin.
const t=await taskSpace(EGO_TEST_SPACE);
const base='http://127.0.0.1:62824';
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const until=async(fn,label)=>{for(let i=0;i<20;i++){const x=await fn();if(x)return x;await new Promise(r=>setTimeout(r,75));}throw Error(label);};
const size=(p,width,height)=>p.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
const nav=await t.newPage();
await size(nav,1330,730);
await nav.goto(base+'/projects/ai-scroll-navigation/tests/fixtures/floating-navigation.html');
await until(()=>nav.evaluate(()=>!!window.scrollNavigationFixture),'navigation fixture not ready');
const navLayout=()=>nav.evaluate(()=>{
  const host=document.querySelector('[data-opendesk-ai-scroll-navigation="dock"]'),box=e=>{const r=e.getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};
  const main=document.querySelector('main'),composer=document.querySelector('form');
  return {visible:!!host&&getComputedStyle(host).visibility==='visible',main:box(main),composer:composer&&box(composer),
    top:main.scrollTop,max:main.scrollHeight-main.clientHeight,compact:!!host?.shadowRoot.querySelector('.compact'),
    controls:Object.fromEntries(Array.from(host?.shadowRoot.querySelectorAll('button')||[],e=>[e.dataset.scrollNavKey,{...box(e),disabled:e.getAttribute('aria-disabled')==='true'}]))};
});
const clickNav=async(key)=>{const b=(await navLayout()).controls[key];assert(b&&!b.disabled,'unusable navigation '+key);await nav.mouse.click(b.x+b.w/2,b.y+b.h/2);};
for(const step of [{w:1330,h:730,port:null},{w:800,h:460,port:318},{w:390,h:680,port:null},{w:1330,h:730,port:null}]){
  await size(nav,step.w,step.h);
  await nav.evaluate(({port,w,h})=>{
    const main=document.querySelector('main');main.style.width=port?port+'px':'';main.scrollTop=0;
    document.querySelector('#synthetic-composer')?.remove();
    if(w<900){const el=document.createElement('form');el.id='synthetic-composer';const r=main.getBoundingClientRect();
      Object.assign(el.style,{position:'fixed',left:r.left+'px',top:(Math.min(h,r.bottom)-82)+'px',width:r.width+'px',height:'82px',background:'white'});
      const input=document.createElement('textarea');input.setAttribute('aria-label','模拟原生输入框');el.append(input);document.body.append(el);}
    window.scrollNavigationFixture.setFlags({turnPaging:true,conversationTop:true,conversationBottom:true,floatingTop:false});
  },step);
  const a=await navLayout(),keys=Object.keys(a.controls);
  assert(a.visible&&keys.length===4,'four visible dock controls @'+step.w);
  for(const b of Object.values(a.controls))assert(b.x>=a.main.x&&b.right<=a.main.right&&b.y>=a.main.y&&b.bottom<=a.main.bottom&&(!a.composer||b.bottom<=a.composer.y),'dock clips or overlaps composer @'+step.w);
  await clickNav('turnNext');
  const offset=await until(async()=>{const n=await navLayout();return n.top>500&&n.top<n.max-5&&n.top;},'turn next did not enter transcript');
  await until(async()=>!(await navLayout()).controls.turnPrevious.disabled,'first question did not become reachable');
  await clickNav('turnPrevious');await until(async()=>{const n=await navLayout();return n.top<60;},'previous did not land at first question');
  await clickNav('conversationBottom');await until(async()=>{const n=await navLayout();return n.top>=n.max-2;},'bottom did not land');
  const start=keys.find(k=>/Top/.test(k));await until(async()=>!(await navLayout()).controls[start].disabled,"top control still disabled");await clickNav(start);await until(async()=>(await navLayout()).top<=2,'top did not land');
  console.log('NAV',JSON.stringify({viewport:step.w,port:a.main.w,compact:a.compact,buttons:keys.length,next:offset}));
}
