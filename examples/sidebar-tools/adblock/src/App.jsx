import * as React from 'react';
import {Card,CardContent,Switch,Button,IconButton} from '@opendesk/ui';
import {valid,verified,confirmed,siteHost} from './model.js';
import {validCosmeticSelector} from '../trusted/cosmetic-policy.js';

const siteCopy={
  navigating:'页面正在导航，加载完成后可管理本站。',
  incognito:'隐身页面不可管理网站例外。',
  unsupported:'仅支持普通 HTTP(S) 网站。',
  unavailable:'当前网站身份暂不可用，请切换标签页后重试。'
};
const errorText=error=>String(error?.message||error||'操作失败').slice(0,220);
const readyForInspect=state=>verified(state)&&state.toolEnabled===true&&
  !state.restartRequired;
function Status({state,loading}){
  const known=verified(state)&&state.toolEnabled===true&&!state.restartRequired;
  const active=Boolean(known&&state.enabled);
  const label=loading?'正在核对 Chrome…':!state?'Chrome 状态未知':
    state.toolEnabled===false?'工具已停用':state.restartRequired?'需要重载扩展':
    state.permissions?.dnr!==true?'过滤权限不可用':!verified(state)?'DNR 尚未确认':
    active?'保护已开启':'保护已关闭';
  return <span className={'adblock-state '+(active?'is-on':known?'is-off':'is-unknown')} role="status">
    <span className="adblock-dot" aria-hidden="true"/>{label}
  </span>;
}
// Fixed first-party SVGs in the existing host-owned IconButton: no new icon library.
function ActionGlyph({kind}){
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">
    {kind==='locate'?<><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>:null}
    {kind==='show'||kind==='hide'?<><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>{kind==='hide'?<path d="M3 3l18 18"/>:null}</>:null}
    {kind==='edit'?<><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>:null}
    {kind==='remove'?<><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6M10 10v6m4-6v6"/></>:null}
    {kind==='back'?<path d="m15 18-6-6 6-6"/>:null}
    {kind==='refresh'?<><path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 3v5h5M4 13a8 8 0 0 0 14 5l2-2M20 21v-5h-5"/></>:null}
  </svg>;
}
function App(){
  const [state,setState]=React.useState(null);
  const [loading,setLoading]=React.useState(true);
  const [busy,setBusy]=React.useState(false);
  const [notice,setNotice]=React.useState('');
  const [problem,setProblem]=React.useState(false);
  const [view,setView]=React.useState('overview');
  const alive=React.useRef(true),reading=React.useRef(0),locked=React.useRef(false);
  const queued=React.useRef(false),current=React.useRef(null);
  const contextRevision=React.useRef(0);
  const lastPickReceipt=React.useRef('');
  const [inspection,setInspection]=React.useState({});
  const [draftSelector,setDraftSelector]=React.useState('');
  const [editingSelector,setEditingSelector]=React.useState(null);
  const selectorInput=React.useRef(null),editTrigger=React.useRef(null);
  const [allowUnmatched,setAllowUnmatched]=React.useState(false);
  const [checkedMatches,setCheckedMatches]=React.useState(null);
  const [inspectionBusy,setInspectionBusy]=React.useState(false);
  const inspectSerial=React.useRef(0);
  const api=globalThis.OpenDeskTool;
  // The shared bridge enables this only after exact first-party release verification.
  // Standalone previews and custom installs retain the original internal controls.
  const sharedNavigation=typeof api?.setNavigation==='function';
  const selectorDraftDirty=view==='cosmetics'&&Boolean(draftSelector.trim())&&
    (editingSelector===null||draftSelector.trim()!==editingSelector);
  const navigationGuard=React.useRef(false);
  navigationGuard.current=selectorDraftDirty||busy;
  React.useEffect(()=>{
    if(!sharedNavigation)return;
    const titles={overview:'广告拦截',cosmetics:'手动屏蔽规则',
      exceptions:'已停用的网站',settings:'广告拦截设置'};
    api.setNavigation({page:view,title:titles[view]||titles.overview,canBack:view!=='overview'});
  },[api,sharedNavigation,view]);
  React.useEffect(()=>{
    if(sharedNavigation)api.setState?.({dirty:selectorDraftDirty,busy});
  },[api,sharedNavigation,selectorDraftDirty,busy]);
  React.useEffect(()=>{
    if(!sharedNavigation)return;
    const onNavigate=event=>{
      if(event.detail?.action!=='back'||view==='overview')return;
      if(busy||locked.current){
        setProblem(true);setNotice('正在处理广告规则，请完成后再返回。');return;
      }
      if(selectorDraftDirty){
        setProblem(true);setNotice('规则草稿尚未保存，请先保存或取消编辑。');return;
      }
      setView('overview');
    };
    api.root?.addEventListener?.('opendesk-tool-navigation',onNavigate);
    return ()=>api.root?.removeEventListener?.('opendesk-tool-navigation',onNavigate);
  },[api,sharedNavigation,view,busy,selectorDraftDirty]);
  const refresh=React.useCallback(async(silent=false,preserveNotice=false)=>{
    if(locked.current){queued.current=true;return;}
    const turn=++reading.current;
    if(!silent)setLoading(true);
    try{
      if(typeof api?.request!=='function')throw Error('AdBlock Host 未就绪');
      const next=await api.request('adblock.status',{});
      if(!valid(next))throw Error('Chrome DNR 状态数据不完整');
      if(!alive.current||turn!==reading.current||locked.current)return;
      current.current=next;setState(next);
      if(!preserveNotice){setProblem(false);setNotice('');}
    }catch(error){
      if(!alive.current||turn!==reading.current||locked.current)return;
      current.current=null;setState(null);setProblem(true);
      setNotice('无法核实 Chrome 状态：'+errorText(error));
    }finally{if(alive.current&&turn===reading.current)setLoading(false);}
  },[api]);
  const operate=React.useCallback(async(operation,payload={})=>{
    if(locked.current||!current.current)return;
    let needsReadback=false;
    locked.current=true;reading.current++;
    const operationContext=contextRevision.current;
    setBusy(true);setProblem(false);setNotice('正在更新 Chrome 规则并读取最终状态…');
    try{
      const result=await api.request(operation,payload);
      const checked=await api.request('adblock.status',{});
      if(operationContext!==contextRevision.current){
        needsReadback=true;
        if(alive.current){
          current.current=null;setState(null);setProblem(true);
          setNotice('页面或工具在确认期间已切换，旧操作结果不用于当前网页；正在重新读取 Chrome 状态。');
        }
        return;
      }
      if(!confirmed(result,checked,operation,payload))throw Error('Chrome DNR 规则回读不一致');
      if(!alive.current)return;
      current.current=checked;setState(checked);
      setNotice(operation==='adblock.site.set'||operation==='adblock.site.restore'
        ?'设置已由 Chrome 确认；请刷新目标网页。'
        :checked.enabled?'Chrome 已确认开启过滤。':'Chrome 已确认关闭过滤。');
    }catch(error){
      if(!alive.current)return;
      if(operationContext!==contextRevision.current){
        needsReadback=true;current.current=null;setState(null);setProblem(true);
        setNotice('页面或工具已切换，之前的操作结果不确定；正在读取当前 Chrome 状态。');
        return;
      }
      const cancelled=error?.code==='E_CANCELLED'||/cancel|取消/i.test(errorText(error));
      if(cancelled)setNotice('已取消，未提交这次更改。');
      else{
        current.current=null;setState(null);setProblem(true);
        needsReadback=true;
        setNotice('结果未确认（'+String(error?.code||'E_ADBLOCK')+'）：'+errorText(error)+'。正在重新读取 Chrome 状态，不会自动重试写入。');
      }
    }finally{
      locked.current=false;
      if(alive.current){setBusy(false);setLoading(false);
        if(queued.current||needsReadback){queued.current=false;void refresh(true);}}
    }
  },[api,refresh]);
  const operateCosmetic=React.useCallback(async(operation,payload={})=>{
    if(locked.current||!current.current)return;
    let preserveCosmeticError=false;
    locked.current=true;reading.current++;
    const generation=contextRevision.current,expectedHost=siteHost(current.current);
    setBusy(true);setProblem(false);setNotice('');
    try{
      const result=await api.request(operation,payload);
      const checked=await api.request('adblock.status',{});
      if(!valid(checked)||!alive.current||generation!==contextRevision.current||
         !expectedHost||siteHost(result)!==expectedHost||siteHost(checked)!==expectedHost){
        throw Error('当前网页已变化，请重新读取');
      }
      if(operation==='adblock.cosmetic.pick'&&
        (result?.pickerActive!==true||!verified(checked)||!checked.enabled||
         checked.exceptions.includes(expectedHost)))
        throw Error('网页未进入选择模式或本站保护已暂停');
      if(operation==='adblock.cosmetic.cancel'&&checked.pickerActive===true)
        throw Error('选择状态尚未结束，请重新读取');
      if(operation==='adblock.cosmetic.restore'&&
         (checked.cosmeticError||!Array.isArray(checked.cosmeticRules)||
          checked.cosmeticRules.some(row=>row.selector===payload.selector)))
        throw Error('本地规则读回仍存在，撤销结果未确认');
      if(operation==='adblock.cosmetic.add'&&
         !checked.cosmeticRules?.some(row=>row.selector===payload.selector))
        throw Error('本地规则读回没有刚添加的规则');
      if(operation==='adblock.cosmetic.replace'&&
         (!checked.cosmeticRules?.some(row=>row.selector===payload.selector)||
           payload.oldSelector!==payload.selector&&
           checked.cosmeticRules?.some(row=>row.selector===payload.oldSelector)))
        throw Error('替换规则读回不一致');
      if(['adblock.cosmetic.display','adblock.cosmetic.check','adblock.cosmetic.locate'].includes(operation)){
        if(!Array.isArray(result.inspection)||result.inspection.length!==1||
           result.inspection[0].selector!==payload.selector||
           !Number.isSafeInteger(result.inspection[0].matches))
          throw Error('网页匹配结果不可验证');
        if(operation==='adblock.cosmetic.display'&&
           result.inspection[0].visible!==payload.visible)
          throw Error('临时显示状态未确认');
        setInspection(old=>({...old,[payload.selector]:result.inspection[0]}));
        if(operation==='adblock.cosmetic.check')
          setCheckedMatches({selector:payload.selector,count:result.inspection[0].matches});
      }
      if(['adblock.cosmetic.add','adblock.cosmetic.replace','adblock.cosmetic.restore'].includes(operation)){
        inspectSerial.current++;setInspection({});
      }
      if(['adblock.cosmetic.add','adblock.cosmetic.replace'].includes(operation)){
        setDraftSelector('');setEditingSelector(null);
        setCheckedMatches(null);setAllowUnmatched(false);
      }
      current.current=checked;setState(checked);
      const messages={
        'adblock.cosmetic.pick':'网页已进入选择模式。单击目标即隐藏；Esc 或侧边栏可取消。',
        'adblock.cosmetic.cancel':checked.pickOutcome?.status==='saved'?
          '该区域已保存，可从侧边栏撤销。':'已取消网页选择。',
        'adblock.cosmetic.restore':'已永久删除本地规则，网页区域已恢复。',
        'adblock.cosmetic.display':payload.visible?
          '仅当前网页临时显示该区域；刷新后将恢复屏蔽。':'已在当前网页重新隐藏该区域。',
        'adblock.cosmetic.check':'已从当前网页读取真实匹配数量。',
         'adblock.cosmetic.locate':'已定位目标，短暂显示后自动恢复原有隐藏状态。',
        'adblock.cosmetic.add':'高级屏蔽规则已保存并读回确认。',
        'adblock.cosmetic.replace':'旧规则已原子替换并读回确认。'
      };
      setNotice(messages[operation]||'已完成');
    }catch(error){
      if(!alive.current)return;
      preserveCosmeticError=true;
      setProblem(true);setNotice(errorText(error));
    }finally{
      locked.current=false;
      if(alive.current){setBusy(false);setLoading(false);
        if(queued.current||preserveCosmeticError){
          queued.current=false;
          // A failed native write requires readback without deleting the error.
          void refresh(true,preserveCosmeticError);
        }}
    }
  },[api,refresh]);
  React.useEffect(()=>{
    alive.current=true;
    const onVisible=()=>{if(!document.hidden)void refresh(true);};
    const onPageChanged=()=>{
      // Invalidate both pending status reads and any already-confirmed write
      // whose result belongs to a previous tab, page or tool generation.
      contextRevision.current++;
      reading.current++;
      current.current=null;setState(null);setLoading(true);
      lastPickReceipt.current='';
      inspectSerial.current++;setInspection({});setCheckedMatches(null);
      setEditingSelector(null);setDraftSelector('');setAllowUnmatched(false);
      if(locked.current)queued.current=true;
      void refresh();
    };
    const onMessage=event=>{
      if(event.source!==globalThis.parent)return;
      if(event.data?.protocol==='opendesk.adblock.ui.v1'&&event.data?.kind==='settings'){
        if(navigationGuard.current||locked.current){
          setProblem(true);setNotice('请先完成或取消当前规则编辑，再打开设置。');
          return;
        }
        setView('settings');
      }
    };
    document.addEventListener('visibilitychange',onVisible);
    globalThis.addEventListener('focus',onVisible);
    globalThis.addEventListener('message',onMessage);
    api?.root?.addEventListener?.('opendesk-page-changed',onPageChanged);
    api?.root?.addEventListener?.('opendesk-tool-state-changed',onPageChanged);
    const interval=setInterval(()=>{if(!document.hidden)void refresh(true);},12000);
    void refresh();
    return ()=>{alive.current=false;reading.current++;clearInterval(interval);
      document.removeEventListener('visibilitychange',onVisible);
      globalThis.removeEventListener('focus',onVisible);
      globalThis.removeEventListener('message',onMessage);
      api?.root?.removeEventListener?.('opendesk-page-changed',onPageChanged);
      api?.root?.removeEventListener?.('opendesk-tool-state-changed',onPageChanged);};
  },[refresh]);
  // Poll only during the bounded picker session. A 12s global status refresh
  // would leave the sidebar stale after Escape or a confirmed webpage click.
  React.useEffect(()=>{
    if(state?.pickerActive!==true)return;
    const timer=setInterval(()=>{void refresh(true,true);},1500);
    return ()=>clearInterval(timer);
  },[state?.pickerActive,refresh]);
  React.useEffect(()=>{
    const receipt=state?.pickOutcome;
    if(!receipt||!Number.isSafeInteger(receipt.nonce))return;
    const id=[siteHost(state),receipt.nonce,receipt.status,receipt.selector].join('|');
    if(lastPickReceipt.current===id)return;
    lastPickReceipt.current=id;
    if(receipt.status==='saved'){setProblem(false);setNotice('已隐藏并保存；可直接撤销。');}
    else if(receipt.status==='cancelled'){setProblem(false);setNotice('已退出选择模式，未保存新规则。');}
    else if(receipt.status==='unknown'){setProblem(true);setNotice('结果未知，请核对规则列表；未自动重试。');}
    else if(receipt.status==='undone'){setProblem(false);setNotice('已撤销，持久化规则已删除。');}
  },[state]);
  const inspectRules=React.useCallback(async()=>{
    const currentState=current.current,host=siteHost(currentState);
    if(!host||!readyForInspect(currentState)||locked.current)return;
    const generation=contextRevision.current,turn=++inspectSerial.current;
    setInspectionBusy(true);
    try{
      const result=await api.request('adblock.cosmetic.inspect',{host});
      if(!alive.current||turn!==inspectSerial.current||
         generation!==contextRevision.current||siteHost(current.current)!==host)return;
      if(!Array.isArray(result?.inspection))throw Error('网页匹配回执无效');
      const next={};
      for(const row of result.inspection){
        if(typeof row.selector!=='string'||!Number.isSafeInteger(row.matches)||
           row.matches<0||typeof row.visible!=='boolean')throw Error('检查结果无效');
        next[row.selector]=row;
      }
      setInspection(next);
    }catch(error){
      if(alive.current&&turn===inspectSerial.current){
        setInspection({});
        setProblem(true);setNotice('无法检查当前网页：'+errorText(error));
      }
    }finally{if(alive.current&&turn===inspectSerial.current)setInspectionBusy(false);}
  },[api]);
  React.useEffect(()=>{
    if(view!=='cosmetics'||!state||!siteHost(state))return;
    void inspectRules();
  },[view,siteHost(state),state?.cosmeticRules?.map(x=>x.selector).join('|'),inspectRules]);
  const ready=Boolean(verified(state)&&state.toolEnabled===true&&!state.restartRequired);
  const on=Boolean(ready&&state.enabled);
  const host=siteHost(state);
  const exceptions=Array.isArray(state?.exceptions)?state.exceptions:[];
  const siteOn=Boolean(on&&host&&!exceptions.includes(host));
  const cosmeticRules=Array.isArray(state?.cosmeticRules)?state.cosmeticRules:[];
  const picking=state?.pickerActive===true;
  const recentSelector=state?.pickOutcome?.status==='saved'&&
    cosmeticRules.some(rule=>rule.selector===state.pickOutcome.selector)?
      state.pickOutcome.selector:null;
  const switchLocked=loading||busy||!ready;
  const siteLocked=switchLocked||!on||!host;
  const canRestore=ready&&!busy&&!loading;
  const canEdit=siteOn&&canRestore&&!state?.cosmeticError;
  const draft=draftSelector.trim();
  const draftChecked=checkedMatches?.selector===draft?checkedMatches.count:null;
  const safeDraft=validCosmeticSelector(draft);
  const saveAdvanced=()=>{
    if(!host||!safeDraft||!canEdit||draftChecked===null||draftChecked>15||
       draftChecked===0&&!allowUnmatched)return;
    const payload=editingSelector===null?
      {host,selector:draft,allowUnmatched}:
      {host,oldSelector:editingSelector,selector:draft,allowUnmatched};
    void operateCosmetic(editingSelector===null?'adblock.cosmetic.add':
      'adblock.cosmetic.replace',payload);
  };
  const back=sharedNavigation?null:<IconButton className="adblock-back" label="返回广告拦截概览" title="返回"
    onClick={()=>setView('overview')}><ActionGlyph kind="back"/></IconButton>;
  React.useEffect(()=>{
    if(editingSelector!==null)selectorInput.current?.focus();
  },[editingSelector]);
  const cancelEditing=()=>{
    setEditingSelector(null);setDraftSelector('');setCheckedMatches(null);
    setAllowUnmatched(false);editTrigger.current?.focus();
  };
  return <div className="adblock-app">
    {view==='overview'?<>
      <Card><CardContent className="adblock-card">
        <div className="adblock-control-row">
          <div className="adblock-copy"><strong>全局保护</strong><Status state={state} loading={loading}/></div>
          <Switch isSelected={on} isDisabled={switchLocked}
            onChange={value=>void operate(value?'adblock.enable':'adblock.disable')}
            aria-label="全局广告拦截"/>
        </div>
        {state?.restartRequired?<p className="adblock-help">过滤尚未就绪。请保存工作并重新加载 OpenDesk Browser 扩展，然后手动开启。</p>:null}
        {state?.permissions?.dnr===false?<p className="adblock-help">Chrome 必选广告过滤权限不可用，无法确认清理完成；请检查扩展状态后重新读取。</p>:null}
      </CardContent></Card>
      <Card><CardContent className="adblock-card">
        <div className="adblock-control-row">
          <div className="adblock-copy"><strong>当前网站</strong>
            <span className="adblock-host">{host||'当前网页不可管理'}</span></div>
          <Switch isSelected={siteOn} isDisabled={siteLocked}
            onChange={value=>{if(host)void operate('adblock.site.set',{host,filtering:value});}}
            aria-label="当前网站广告过滤"/>
        </div>
        <p className="adblock-help">{host?(!on?'开启全局保护后可管理本站。':
          siteOn?'正在过滤本站匹配的第三方广告请求。':'本站已加入例外列表。'):
          siteCopy[state?.currentSite?.status]||'等待 Chrome 读取当前网站身份。'}</p>
        <div className="adblock-manual-actions">
          <Button variant="primary" className="adblock-pick-trigger" disabled={!siteOn||loading||busy||picking||Boolean(state?.cosmeticError)}
            onClick={()=>void operateCosmetic('adblock.cosmetic.pick')}
            aria-label="在当前网页中点击选择要隐藏的元素"><ActionGlyph kind="locate"/>选择网页元素</Button>
          <Button variant="secondary" disabled={!host||loading||busy}
            onClick={()=>setView('cosmetics')}>已屏蔽 {cosmeticRules.length} 处 →</Button>
        </div>
        {picking?<div className="adblock-pick-panel" role="status">
          <div className="adblock-copy"><strong>正在选择网页区域</strong>
            <span className="adblock-muted">移动鼠标查看蓝框，单击目标即隐藏并保存。</span></div>
          <Button variant="secondary" disabled={busy}
            onClick={()=>void operateCosmetic('adblock.cosmetic.cancel')}>取消选择</Button>
        </div>:recentSelector?<div className="adblock-pick-panel" role="status">
          <div className="adblock-copy"><strong>已隐藏并保存</strong>
            <span className="adblock-muted adblock-selector" title={recentSelector}>{recentSelector}</span></div>
          <Button variant="secondary" disabled={!canRestore}
            onClick={()=>void operateCosmetic('adblock.cosmetic.restore',{host,selector:recentSelector})}>撤销</Button>
        </div>:null}
      </CardContent></Card>
      <Card><CardContent className="adblock-card">
        <div className="adblock-control-row"><div className="adblock-copy">
          <strong>内置过滤规则</strong>
          <span className="adblock-muted">{Number.isInteger(state?.domainCount)?state.domainCount+' 个离线域名':'离线规则'} · 不提供未经核实的拦截计数</span>
        </div></div>
      </CardContent></Card>
      <Button className="adblock-link" variant="secondary" onClick={()=>setView('exceptions')}>
        已停用的网站 <span>{exceptions.length}</span><span aria-hidden="true">→</span>
      </Button>
    </>:view==='cosmetics'?<>
      {sharedNavigation?<p className="adblock-page-count">{cosmeticRules.length} 处手动屏蔽规则</p>:
        <div className="adblock-page-head">{back}<strong>手动屏蔽规则</strong>
          <span>{cosmeticRules.length} 处</span></div>}
      <Card><CardContent className="adblock-exceptions">
        {state?.cosmeticError?<p className="adblock-help" role="alert">{state.cosmeticError}</p>:
          !state?<p className="adblock-help">规则尚未读取。</p>:
          !cosmeticRules.length?<p className="adblock-empty">本站尚无手动屏蔽区域</p>:
          cosmeticRules.map(rule=>{
            const match=inspection[rule.selector];
            return <div className="adblock-rule" key={rule.selector}>
              <div className="adblock-copy"><strong>{rule.selector.startsWith('#')?
                '指定网页区域':rule.selector.includes('nth-of-type')?'页面结构区域':'广告样式区域'}</strong>
                <span className="adblock-muted adblock-selector" title={rule.selector}>{rule.selector}</span>
                <span className="adblock-muted">{match?
                  match.matches>0?'当前匹配 '+match.matches+' 处':'当前网页暂无匹配':
                  inspectionBusy?'正在检查网页…':'匹配状态未确认'}</span>
              </div>
              <div className="adblock-rule-actions adblock-rule-actions--icons" aria-label="此规则的操作">
                <IconButton className="adblock-rule-action" label={'定位网页元素：'+rule.selector}
                  title="定位" disabled={!canRestore||!match||match.matches===0}
                  onClick={()=>void operateCosmetic('adblock.cosmetic.locate',
                    {host,selector:rule.selector})}><ActionGlyph kind="locate"/></IconButton>
                <IconButton className="adblock-rule-action"
                  label={(match?.visible?'重新隐藏：':'临时显示：')+rule.selector}
                  title={match?.visible?'重新隐藏':'临时显示'}
                  disabled={!canEdit||!match||match.matches===0}
                  onClick={()=>void operateCosmetic('adblock.cosmetic.display',
                    {host,selector:rule.selector,visible:!match.visible})}>
                  <ActionGlyph kind={match?.visible?'hide':'show'}/></IconButton>
                <IconButton className="adblock-rule-action" label={'编辑屏蔽规则：'+rule.selector}
                  title="编辑" disabled={!canEdit}
                  onClick={event=>{
                    editTrigger.current=event.currentTarget;
                    setEditingSelector(rule.selector);setDraftSelector(rule.selector);
                    setCheckedMatches(null);setAllowUnmatched(false);
                    if(editingSelector===rule.selector)selectorInput.current?.focus();
                  }}><ActionGlyph kind="edit"/></IconButton>
                <IconButton className="adblock-rule-action od-icon-button--danger"
                  label={'永久删除屏蔽规则：'+rule.selector} title="删除规则" disabled={!canRestore}
                  onClick={()=>void operateCosmetic('adblock.cosmetic.restore',
                    {host,selector:rule.selector})}><ActionGlyph kind="remove"/></IconButton>
              </div>
            </div>;
          })}
        <Button variant="secondary" disabled={!host||busy||inspectionBusy}
          onClick={()=>void inspectRules()}>↻ 检查当前网页匹配</Button>
      </CardContent></Card>
      <p className="adblock-help">「临时显示」仅针对当前网页，刷新后继续屏蔽；「删除」永久移除本地规则。没有匹配的历史规则仍可删除。</p>
      <details className="adblock-advanced" open={editingSelector!==null?true:undefined}
        onKeyDown={event=>{
          if(event.key==='Escape'&&editingSelector!==null&&!busy){
            event.preventDefault();event.stopPropagation();cancelEditing();
          }
        }}
        onToggle={event=>{if(!event.currentTarget.open&&editingSelector!==null)setEditingSelector(null);}}>
        <summary>高级 · CSS 选择器</summary>
        <div className="adblock-advanced-body">
          <label htmlFor="adblock-selector-input">{editingSelector===null?'新增选择器':'修改现有选择器'}</label>
          <input ref={selectorInput} id="adblock-selector-input" className="adblock-selector-input"
            placeholder=".ad-banner 或 #sponsor" value={draftSelector} maxLength={320}
            disabled={!canEdit} spellCheck={false} onChange={event=>{
              setDraftSelector(event.target.value);setCheckedMatches(null);
            }}/>
          <p className="adblock-muted">仅允许受约束的广告 class、稳定 ID 或 nth-of-type 路径；禁止任意 CSS 声明、通配符和根节点。</p>
          {draft&&!safeDraft?<p className="adblock-help" role="alert">选择器格式不受支持，请使用 #sponsor 或 .ad-banner 等安全规则。</p>:null}
          {draftChecked!==null?<p className="adblock-help" role="status">当前网页匹配 {draftChecked} 个元素{draftChecked===0?'；保存动态规则需明确勾选下方选项':draftChecked>15?'；匹配范围过大，请缩小选择器':''}</p>:null}
          <label className="adblock-dynamic">
            <input type="checkbox" checked={allowUnmatched} disabled={!canEdit}
              onChange={e=>setAllowUnmatched(e.target.checked)}/>
            即使当前页面匹配 0 个元素也保存（仅用于动态页面）
          </label>
          <div className="adblock-rule-actions">
            <Button variant="secondary" disabled={!canEdit||!safeDraft}
              onClick={()=>void operateCosmetic('adblock.cosmetic.check',
                {host,selector:draft})}>检查匹配 · 高亮</Button>
            <Button disabled={!canEdit||!safeDraft||draftChecked===null||draftChecked>15||
              draftChecked===0&&!allowUnmatched}
              onClick={saveAdvanced}>{editingSelector===null?'添加规则':'保存修改'}</Button>
            {editingSelector!==null?<Button variant="secondary" onClick={cancelEditing}>取消编辑</Button>:null}
          </div>
        </div>
      </details>
    </>:view==='exceptions'?<>
      {sharedNavigation?<p className="adblock-page-count">{exceptions.length} 个网站例外</p>:
        <div className="adblock-page-head">{back}<strong>已停用的网站</strong><span>{exceptions.length}</span></div>}
      <Card><CardContent className="adblock-exceptions">
        {!state?<p className="adblock-help">例外状态未确认，恢复操作不可用。</p>:
          !exceptions.length?<p className="adblock-empty">暂无网站例外</p>:
          exceptions.map(host=><div className="adblock-exception" key={host}>
            <div className="adblock-copy"><strong>{host}</strong><span className="adblock-muted">此网站的广告过滤已停用</span></div>
            <Button disabled={!canRestore} onClick={()=>void operate('adblock.site.restore',{host})}
              aria-label={'恢复 '+host+' 的广告过滤'}>恢复</Button>
          </div>)}
      </CardContent></Card>
    </>:<>
      {!sharedNavigation?<div className="adblock-page-head">{back}<strong>设置说明</strong></div>:null}
      <Card><CardContent className="adblock-card">
        <strong>过滤范围</strong><p className="adblock-help">使用 OpenDesk Browser 内置离线 DNR 规则，仅对符合规则的第三方请求生效。</p>
        <strong>网站例外</strong><p className="adblock-help">关闭本站过滤可加入例外；例外列表支持逐个恢复。</p>
        <strong>手动屏蔽</strong><p className="adblock-help">点击「选择网页元素」后，在网页上单击区域立即隐藏并保存到本地；下次访问仍然生效。误选可直接撤销，或在列表逐条恢复。</p>
        <Button variant="secondary" onClick={()=>setView('cosmetics')}>管理手动屏蔽规则</Button>
        <strong>网页异常</strong><p className="adblock-help">更改后请刷新网页；遇到异常可暂时关闭全局保护。</p>
        <Button variant="secondary" onClick={()=>setView('exceptions')}>管理网站例外</Button>
      </CardContent></Card>
    </>}
    <div className="adblock-footer"><IconButton disabled={busy}
      onClick={()=>void refresh()} label="重新读取 Chrome 广告过滤状态" title="刷新状态">
      <ActionGlyph kind="refresh"/></IconButton></div>
    {notice?<p className="adblock-notice" data-error={problem?'true':'false'} role={problem?'alert':'status'}>{notice}</p>:null}
  </div>;
}
export default App;
