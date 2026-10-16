// R5.7 offline preview acceptance only: VM-backed DOM events, no SDK / Provider / real Chrome claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const businessSource=scripts.find(x=>x[0].includes('id="business-preview-model"'))?.[1];
const proxySource=scripts.find(x=>x[0].includes('id="proxy-demo-model"'))?.[1];
assert.ok(businessSource&&proxySource,'Two isolated domain models required');

function fixture(){
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  class Element {
    constructor(id){
      this.id=id;
      this.value=id==='scenario'?'member':id==='preview-width'?'390':id==='preview-theme'?'light':'';
      this.type=id==='redeem-code'?'password':'button';
      this.hidden=false;this.disabled=false;this._text='';this.children=[];
      this.listeners=new Map();this.attributes=new Map();this.focused=false;
      this.style={width:'',setProperty(key,value){this[key]=value;}};
    }
    get selectedOptions(){return [{textContent:this.value}];}
    get textContent(){return this.children.length?this.children.map(x=>x.textContent??'').join(''):this._text;}
    set textContent(value){this.children=[];this._text=String(value);}
    addEventListener(type,fn){
      if(!this.listeners.has(type))this.listeners.set(type,[]);
      this.listeners.get(type).push(fn);
    }
    dispatch(type){
      for(const fn of this.listeners.get(type)||[])fn({preventDefault(){},target:this});
    }
    replaceChildren(...children){this.children=children;this._text='';}
    append(child){this.children.push(child);}
    setAttribute(key,value){this.attributes.set(key,value);}
    querySelector(query){
      assert.equal(query,'p');
      this._paragraph??=new Element(this.id+'-paragraph');
      return this._paragraph;
    }
    focus(){this.focused=true;}
  }
  const elements=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
  const timers=[];
  const document={
    getElementById:id=>elements[id]??null,
    createElement:tag=>new Element('generated-'+tag),
    createTextNode:value=>({textContent:String(value)}),
    documentElement:new Element('html')
  };
  const sandbox={document,setTimeout:callback=>{timers.push(callback);return timers.length;}};
  for(const [,script] of scripts)runInNewContext(script,sandbox);
  function flush(){
    let limit=50;
    while(timers.length){
      assert.ok(--limit,'Timer loop should complete');
      timers.shift()();
    }
  }
  function emit(id,type='click'){elements[id].dispatch(type);}
  function scenario(id){elements.scenario.value=id;emit('scenario','change');}
  function code(value){elements['redeem-code'].value=value;emit('redeem-code','input');}
  function precheck(value){code(value);emit('redeem-form','submit');flush();}
  function submit(){emit('review-confirm');flush();}
  return {elements,emit,scenario,code,precheck,submit,flush,document,timers,model:sandbox.AIVipBusinessPreview,proxy:sandbox.AIVipProxyPreview};
}

test('one cohesive controller parses; event-capture interception and duplicate IDs removed',()=>{
  assert.equal(scripts.length,3);
  for(const [,body] of scripts)assert.doesNotThrow(()=>new Script(body));
  const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length);
  assert.doesNotMatch(scripts.map(x=>x[1]).join(''),/stopImmediatePropagation|\.innerHTML\s*=|localStorage/);
  const {elements}=fixture();
  for(const [id,event] of [['scenario','change'],['redeem-form','submit'],['history','click'],['proxy-toggle','click']])
    assert.equal(elements[id].listeners.get(event)?.length,1,id);
  assert.equal(elements['redeem-button'].listeners.size,0,'submit is owned by form');
});

test('experiment controls are outside installable tool visual area',()=>{
  const start=html.indexOf('<main class="shell"'),end=html.indexOf('</main>',start),aside=html.indexOf('<aside class="aside"');
  assert.ok(start>0&&end>start&&aside>end);
  for(const id of ['scenario','preview-width','preview-theme'])assert.ok(html.indexOf('id="'+id+'"')<start,id);
  for(const id of ['demo-code','lab-install-confirm','lab-notice'])assert.ok(html.indexOf('id="'+id+'"')>aside,id);
  assert.doesNotMatch(html.slice(start,end),/demo-footer|id="lab-install-confirm"/);
});

test('visual structure has exactly one shop entry and one proxy principal action',()=>{
  const sequence=['class="membership"','class="redeem"','class="bottomline"','class="proxy-card"'];
  const at=sequence.map(value=>html.indexOf(value));
  assert.ok(at.every((position,i)=>position>=0&&(i===0||position>at[i-1])));
  assert.equal((html.match(/id="proxy-toggle"/g)||[]).length,1);
  assert.equal((html.match(/href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer"/g)||[]).length,1);
  assert.doesNotMatch(html,/<dialog\b|showModal\(|id="top-shop"|id="proxy-mode"/i);
});

test('member, quota, feature, guest, expired, and unavailable have accurate distinct meanings',()=>{
  const {scenario,elements}=fixture();
  assert.equal(elements.remaining.textContent,'31天');
  scenario('quota');assert.equal(elements.remaining.textContent,'12次');
  assert.match(elements['time-meta'].textContent,/不换算/);
  scenario('feature');assert.equal(elements.remaining.textContent,'已开通');
  assert.equal(elements['meter-wrap'].hidden,true);
  scenario('guest');assert.equal(elements.remaining.textContent,'未开通');
  scenario('expired');assert.equal(elements.remaining.textContent,'0天');
  scenario('blocked');assert.equal(elements.remaining.textContent,'待核验');
});

test('unknown format or unknown valid-looking voucher cannot create a successful review',()=>{
  const v=fixture();v.precheck('bad code!');
  assert.match(v.elements['redeem-feedback'].textContent,/格式/);
  v.precheck('UNKNOWN-123456');
  assert.match(v.elements['redeem-feedback'].textContent,/未知/);
  assert.equal(v.elements['redeem-review'].hidden,true);
  assert.equal(v.elements['history-list'].children.length,0);
});

test('preflight classification is precise and minted preview is single-use',()=>{
  const {model}=fixture();
  for(const [code,status] of [
    ['DEMO-USED-2026','used'],['DEMO-EXPIRED-2026','expired'],
    ['DEMO-WRONG-ACCOUNT-2026','wrong_account'],['bad!','invalid'],
    ['UNKNOWN-123456','unavailable']
  ])assert.equal(model.preflight(code,'member').status,status);
  assert.equal(model.preflight('DEMO-ACCESS-2026','guest').status,'login_required');
  assert.equal(model.preflight('DEMO-ACCESS-2026','blocked').status,'unavailable');
  assert.equal(model.preflight('DEMO-ACCESS-2026','service-timeout').status,'timeout');
  const minted=model.preflight('DEMO-ACCESS-2026','member');
  assert.equal(model.confirm({...minted}).status,'invalid','forged copy is refused');
  assert.equal(model.confirm(minted).status,'simulated');
  assert.equal(model.confirm(minted).status,'invalid','cannot use same preflight twice');
});

test('guest must intentionally simulate account binding before review',()=>{
  const v=fixture();v.scenario('guest');v.precheck('DEMO-ACCESS-2026');
  assert.match(v.elements['redeem-feedback'].textContent,/先绑定/);
  v.emit('account-action');v.precheck('DEMO-ACCESS-2026');
  assert.equal(v.elements['redeem-review'].hidden,false);
  assert.match(v.elements['review-account'].textContent,/li\*\*\*@example\.com/);
  v.emit('review-cancel');
  assert.equal(v.elements['redeem-review'].hidden,true);
  assert.equal(v.elements['history-list'].children.length,0);
});

test('code reveal, hide, clear and keyboard submit are operational',()=>{
  const v=fixture();v.code('DEMO-ACCESS-2026');
  assert.equal(v.elements['redeem-code'].type,'password');
  v.emit('code-reveal');assert.equal(v.elements['redeem-code'].type,'text');
  v.emit('code-reveal');assert.equal(v.elements['redeem-code'].type,'password');
  v.emit('code-clear');assert.equal(v.elements['redeem-code'].value,'');
  v.code('DEMO-ACCESS-2026');v.emit('redeem-form','submit');v.flush();
  assert.equal(v.elements['redeem-review'].hidden,false);
});

test('preflight cancellation invalidates the in-flight async response',()=>{
  const v=fixture();v.code('DEMO-ACCESS-2026');v.emit('redeem-form','submit');
  v.code('DEMO-USED-2026');v.flush();
  assert.equal(v.elements['redeem-review'].hidden,true);
  assert.match(v.elements['redeem-feedback'].textContent,/取消/);
});

test('cancel review leaves voucher unconsumed and never adds history',()=>{
  const v=fixture();v.precheck('DEMO-ACCESS-2026');v.emit('review-cancel');
  assert.equal(v.elements['history-list'].children.length,0);
  v.precheck('DEMO-ACCESS-2026');
  assert.equal(v.elements['redeem-review'].hidden,false);
});

test('explicit confirm is idempotent and updates labeled mock receipt once',()=>{
  const v=fixture();v.precheck('DEMO-ACCESS-2026');
  v.emit('review-confirm');v.emit('review-confirm');v.flush();
  v.emit('history');
  assert.equal(v.elements['history-list'].children.length,1);
  assert.match(v.elements['history-list'].children[0].textContent,/PREVIEW-RECEIPT-001/);
  assert.match(v.elements['redeem-feedback'].textContent,/未发放真实权益/);
  v.precheck('DEMO-ACCESS-2026');
  assert.match(v.elements['redeem-feedback'].textContent,/不能重复/);
  assert.equal(v.elements['history-list'].children.length,1);
});

test('preflight timeout does not mark transaction as confirmed',()=>{
  const v=fixture();v.scenario('service-timeout');v.precheck('DEMO-ACCESS-2026');
  assert.match(v.elements['redeem-feedback'].textContent,/超时/);
  assert.equal(v.elements['redeem-review'].hidden,true);
  assert.equal(v.elements['history-list'].children.length,0);
  assert.equal(v.elements['redeem-button'].disabled,false);
});

test('unknown submit receipt is locked, recovery stays unknown and membership unchanged',()=>{
  const v=fixture();v.scenario('submit-unknown');v.precheck('DEMO-ACCESS-2026');
  v.submit();
  assert.equal(v.elements['recovery-panel'].hidden,false);
  assert.equal(v.elements['redeem-button'].disabled,true);
  assert.equal(v.elements.remaining.textContent,'31天');
  assert.equal(v.elements['history-list'].children.length,0);
  v.emit('recovery-check');
  assert.match(v.elements['recovery-text'].textContent,/可信服务端终态/);
  v.scenario('member');
  assert.equal(v.elements['recovery-panel'].hidden,false,'changing the lab scenario cannot erase unknown receipt');
});

test('changing scene during submit conservatively locks unknown result, discards late callback',()=>{
  const v=fixture();v.precheck('DEMO-ACCESS-2026');
  v.emit('review-confirm');v.scenario('quota');v.flush();
  assert.equal(v.elements['recovery-panel'].hidden,false);
  assert.equal(v.elements['history-list'].children.length,0);
});

test('activation link progresses host → tool → precheck only via explicit lab simulation',()=>{
  const v=fixture();v.scenario('link-host');
  assert.equal(v.elements['install-step'].hidden,false);
  assert.equal(v.elements['redeem-button'].disabled,true);
  v.emit('install-button');
  assert.equal(v.elements['install-step'].hidden,false,'viewing steps must not fake installation');
  v.emit('lab-install-confirm');
  assert.match(v.elements['install-title'].textContent,/添加 AI VIP Share/);
  assert.equal(v.elements['redeem-button'].disabled,true);
  v.emit('lab-install-confirm');
  assert.equal(v.elements['install-step'].hidden,true);
  assert.equal(v.elements['redeem-button'].disabled,false);
  assert.equal(v.elements['history-list'].children.length,0);
  v.precheck('DEMO-ACCESS-2026');
  assert.equal(v.elements['redeem-review'].hidden,false);
});

test('tool missing and already installed links keep the same pending intent',()=>{
  for(const id of ['link-install','link-ready']){
    const v=fixture();v.scenario(id);
    assert.equal(v.elements['link-hint'].hidden,false);
    if(id==='link-install'){
      assert.equal(v.elements['redeem-button'].disabled,true);
      v.emit('lab-install-confirm');
    }
    assert.equal(v.elements['redeem-button'].disabled,false);
    v.precheck('DEMO-ACCESS-2026');
    assert.equal(v.elements['redeem-review'].hidden,false);
  }
});

test('STOP during START is accepted and late START cannot report enabled',()=>{
  const v=fixture();v.scenario('existing');
  v.emit('proxy-toggle');
  assert.match(v.elements['proxy-status'].textContent,/正在启用/);
  assert.equal(v.elements['proxy-toggle'].disabled,false);
  v.emit('proxy-toggle');v.flush();
  assert.match(v.elements['proxy-status'].textContent,/本工具已停用/);
  assert.match(v.elements['proxy-source'].textContent,/现有网络/);
});

test('STOP failure must be retryable, never optimistically successful',()=>{
  const v=fixture();v.scenario('stop-failed');v.emit('proxy-toggle');v.flush();
  assert.match(v.elements['proxy-status'].textContent,/停止未确认/);
  assert.equal(v.elements['proxy-toggle'].textContent,'重试停用');
  v.emit('proxy-toggle');v.flush();
  assert.match(v.elements['proxy-status'].textContent,/本工具已停用/);
});

test('owner conflict, member expiry and offline provider do not block local STOP',()=>{
  for(const [scene,ownerLabel] of [
    ['other-tool','另一工具'],['conflict','其他 Chrome 扩展'],
    ['expired-stop','现有网络'],['provider-stop','现有网络']
  ]){
    const v=fixture();v.scenario(scene);
    assert.equal(v.elements['proxy-toggle'].disabled,false,scene);
    v.emit('proxy-toggle');v.flush();
    assert.match(v.elements['proxy-source'].textContent,new RegExp(ownerLabel),scene);
  }
});

test('scenario generation invalidates a previous proxy completion',()=>{
  const v=fixture();v.scenario('existing');v.emit('proxy-toggle');
  v.scenario('member');v.flush();
  assert.match(v.elements['proxy-status'].textContent,/代理已启用/);
});

test('theme and width controls modify preview root only',()=>{
  const v=fixture();v.elements['preview-width'].value='320';v.emit('preview-width','change');
  assert.equal(v.document.documentElement.style['--preview-width'],'320px');
  v.elements['preview-theme'].value='dark';v.emit('preview-theme','change');
  assert.equal(v.document.documentElement.attributes.get('data-preview-theme'),'dark');
});

test('offline preview cannot claim Chrome native or server acceptance',()=>{
  const all=scripts.map(s=>s[1]).join('\n');
  assert.doesNotMatch(all,/chrome\.proxy\s*\.|OpenDeskSDK\.browser\.proxy\.managed\.requestEnable\s*\(/);
  assert.doesNotMatch(all,/fetch\s*\(|XMLHttpRequest\s*\(|localStorage\s*\./);
  assert.match(html,/演示/);
});

test('R5.8 offline Provider cannot authorize redemption while STOP remains usable',()=>{
  const v=fixture();v.scenario('provider-stop');v.precheck('DEMO-ACCESS-2026');
  assert.equal(v.elements['redeem-review'].hidden,true);
  assert.match(v.elements['redeem-feedback'].textContent,/尚不能核验/);
  assert.equal(v.elements['proxy-toggle'].disabled,false);
});

test('R5.8 selecting recovery establishes the same persistent unknown lock as initial load',()=>{
  const v=fixture();v.scenario('recovery');
  assert.equal(v.elements['recovery-panel'].hidden,false);
  assert.equal(v.elements['redeem-button'].disabled,true);
  v.scenario('link-host');v.emit('lab-install-confirm');v.emit('lab-install-confirm');
  assert.equal(v.elements['recovery-panel'].hidden,false);
  assert.equal(v.elements['history-list'].children.length,0);
});

test('R5.8 Chrome not controllable cannot claim that its preference was released',()=>{
  const v=fixture();v.scenario('locked');v.emit('proxy-toggle');v.flush();
  assert.match(v.elements['proxy-status'].textContent,/停止未确认/);
  assert.equal(v.elements['proxy-toggle'].textContent,'重试停用');
});

test('R5.8 precheck and terminal receipt restore a visible focus target',()=>{
  const v=fixture();v.precheck('DEMO-ACCESS-2026');
  assert.equal(v.elements['review-confirm'].focused,true);
  v.submit();assert.equal(v.elements['redeem-code'].focused,true);
});
