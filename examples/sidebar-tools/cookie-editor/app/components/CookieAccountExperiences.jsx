import * as React from 'react';
import {CookieIcon,CookieIconButton} from './CookieEditorView.jsx';

// Product-owned React presentation, shared by the official app and preview.
// No Cookie value, credential, share token, network call or persistent grant
// enters this component. Live invitation and marketplace backends do not exist.
const marketOffers=Object.freeze([
  {id:'account-kit',title:'多账号整理',category:'template',categoryLabel:'使用模板',
    audience:'个人 · 多账号',description:'把工作、个人与备用账号分开保存，常用账号一键定位。',
    action:'体验账号管理'},
  {id:'switch-kit',title:'网址快捷切换',category:'workflow',categoryLabel:'快捷方案',
    audience:'本机 · 自动切换',description:'用本站白名单和 URL Fragment 创建快捷入口，避免反复查找账号。',
    action:'体验切换设置'},
  {id:'expiry-kit',title:'Cookie 有效期管理',category:'guide',categoryLabel:'功能示例',
    audience:'Cookie · 属性',description:'区分 Session 与指定有效期，查看并安全调整过期时间。',
    action:'体验 Expiration'}
]);
const shareExpiryOptions=Object.freeze([
  ['1h','1 小时'],['1d','1 天'],['7d','7 天'],['1mo','1 个月'],
  ['3mo','3 个月'],['6mo','6 个月'],['1y','1 年']
]);
const shareClaimOptions=Object.freeze([1,3,5,10]);
const shareExpiryLabel=value=>shareExpiryOptions.find(([key])=>key===value)?.[1]||'—';
const mockOutcomes={
  created:'已生成虚构邀请：没有创建服务端令牌或访问权限。',
  received:'模拟已领取：仅修改当前预览反馈，不传输 Cookie。',
  expired:'模拟邀请已过期：之后的领取均被拒绝。',
  revoked:'模拟邀请已撤销：不再允许领取。',
  repeated:'模拟重复领取被拒绝：已达到上限。',
  failed:'模拟请求失败：结果未确认，不自动重试。'
};

export function CookieAccountShare({account,previewOnly=false,onBack=()=>{}}){
  const [recipientType,setRecipientType]=React.useState('named');
  const [recipient,setRecipient]=React.useState('');
  const [expiry,setExpiry]=React.useState('1d');
  const [maxClaims,setMaxClaims]=React.useState('1');
  const [outcome,setOutcome]=React.useState('');
  const updateType=type=>{setRecipientType(type);setMaxClaims('1');setOutcome('');};
  const validRecipient=recipientType==='anonymous'||(
    recipient.includes('@')&&recipient.includes('.')&&recipient.length<=254
  );
  return <section className="cookie-account-page od-surface" aria-label="分享配置">
    <header className="cookie-account-header">
      <CookieIconButton name="undo" label="返回账号" onClick={onBack}/>
      <h2>分享配置</h2><small className="cookie-market-status">未上线</small>
    </header>
    <div className="cookie-account-content">
      <p className="cookie-account-notice" role="status">
        {previewOnly
          ?'虚构数据演示：仅预览邀请配置及领取结果，不生成任何真实权限。'
          :'邀请服务未上线；这里只展示配置方案，不会分享 Cookie 或建立授权。'}
      </p>
      <div className="cookie-share-source">
        <small>账号配置来源 · 不包含登录凭据</small>
        <strong>{account.displayName}</strong>
      </div>
      <div className="cookie-share-form">
        <fieldset className="cookie-share-options">
          <legend>邀请方式</legend>
          <label><input type="radio" name="cookie-share-recipient"
            checked={recipientType==='named'} onChange={()=>updateType('named')}/>
            指定用户</label>
          <label><input type="radio" name="cookie-share-recipient"
            checked={recipientType==='anonymous'} onChange={()=>updateType('anonymous')}/>
            匿名邀请</label>
        </fieldset>
        {recipientType==='named'&&<label className="cookie-share-field">
          指定用户邮箱
          <input className="od-field" type="email" autoComplete="off"
            placeholder="recipient@example.invalid" value={recipient}
            onChange={e=>{setRecipient(e.target.value);setOutcome('');}}/>
        </label>}
        <div className="cookie-share-row">
          <label className="cookie-share-field">邀请有效期
            <select className="od-field" value={expiry}
              onChange={e=>{setExpiry(e.target.value);setOutcome('');}}>
              {shareExpiryOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {recipientType==='anonymous'&&<label className="cookie-share-field">最多领取
            <select className="od-field" value={maxClaims}
              onChange={e=>{setMaxClaims(e.target.value);setOutcome('');}}>
              {shareClaimOptions.map(n=><option key={n} value={n}>{n} 次</option>)}
            </select>
          </label>}
        </div>
        <p className="cookie-account-empty">
          {recipientType==='named'
            ?'指定用户仅有 1 个领取名额，无需额外设置次数。'
            :'任何持有匿名链接的人都可能尝试领取，请限制名额并按需撤销。'}
        </p>
        {['3mo','6mo','1y'].includes(expiry)&&<p className="cookie-account-empty">
          长期链接更容易外传；正式版应由服务端按日历月份计算到期时间并允许撤销。
        </p>}
        <p className="cookie-account-empty">
          正式分享必须由服务端验证用户、有效期、领取次数及撤销状态；不发送原始 Cookie、密码或 Session Token。
        </p>
        <div className="cookie-share-actions">
          <button className="od-button od-button--secondary" type="button" onClick={onBack}>取消</button>
          <button className="od-button od-button--primary" type="button"
            disabled={!previewOnly||!validRecipient}
            onClick={()=>setOutcome('created')}>{previewOnly?'模拟生成邀请':'邀请服务未上线'}</button>
        </div>
        {outcome&&<div className="cookie-market-detail" role="status">
          <strong>虚构邀请 · {shareExpiryLabel(expiry)} · {recipientType==='anonymous'?maxClaims:1} 次</strong>
          <code className="cookie-share-demo-code">https://example.invalid/invite/demo-only</code>
          <p className="cookie-account-empty">地址仅供视觉评审，不含任何有效令牌，也不能用于访问。</p>
          <p className="cookie-share-status">{mockOutcomes[outcome]}</p>
          <div className="cookie-share-outcomes" role="group" aria-label="模拟领取结果">
            {[['received','模拟领取'],['expired','模拟过期'],['revoked','模拟撤销'],
              ['repeated','模拟重复领取'],['failed','模拟失败']]
              .map(([key,label])=><button key={key} type="button"
                className="od-button od-button--secondary"
                onClick={()=>setOutcome(key)}>{label}</button>)}
          </div>
        </div>}
      </div>
    </div>
  </section>;
}

export function CookieAccountMarket({onExperience=()=>{},onEnterprise=()=>{}}){
  const [query,setQuery]=React.useState('');
  const [category,setCategory]=React.useState('all');
  const search=query.trim().toLowerCase();
  const results=marketOffers.filter(item=>
    (category==='all'||item.category===category)&&
    [item.title,item.description,item.audience,item.categoryLabel]
      .some(text=>text.toLowerCase().includes(search)));
  return <section className="cookie-account-page od-surface" aria-label="市场"
    id="cookie-product-panel-market" role="tabpanel"
    aria-labelledby="cookie-product-tab-market">
    <div className="cookie-account-content cookie-market-page">
      <header className="cookie-business-hero">
        <small>MARKET · 轻量体验</small>
        <h2>发现实用功能与配置示例</h2>
        <p>从多账号管理、快捷切换到 Cookie 有效期，点击即可在当前产品中体验。
           企业多部门、席位与用量管理在「企业」中查看。</p>
      </header>
      <div className="searchbox">
        <span className="cookie-search-symbol"><CookieIcon name="search"/></span>
        <input type="search" placeholder="搜索功能、模板或场景"
          aria-label="搜索市场功能" value={query} onChange={e=>setQuery(e.target.value)}/>
      </div>
      <div className="cookie-market-categories" role="group" aria-label="市场分类">
        {[['all','全部'],['template','模板'],['workflow','快捷方案'],['guide','示例']]
          .map(([key,label])=><button key={key} type="button"
            className="od-button cookie-button--choice"
            aria-pressed={category===key} onClick={()=>setCategory(key)}>{label}</button>)}
      </div>
      <div className="cookie-market-results" aria-label="功能示例">
        {results.map(item=><article key={item.id} className="cookie-market-resource">
          <div className="cookie-market-resource-head">
            <span className="cookie-business-symbol"><CookieIcon name={item.category==='template'?'users':item.category==='workflow'?'link':'clock'}/></span>
            <small>{item.categoryLabel}</small><small>可体验</small>
          </div>
          <strong>{item.title}</strong>
          <p>{item.description}</p>
          <div className="cookie-market-resource-actions">
            <small>{item.audience}</small>
            <button type="button" className="od-button od-button--secondary cookie-button--compact cookie-button--row-action"
              onClick={()=>onExperience(item.id)}>{item.action}<CookieIcon name="right"/></button>
          </div>
        </article>)}
        {!results.length&&<p className="cookie-account-empty">没有匹配的功能示例。</p>}
      </div>
      <p className="cookie-account-empty">
        不提供账号交易、登录 Cookie 共享、申请或审批；未来真实市场资源须单独核验来源和授权。
      </p>
      <button type="button" className="od-button od-button--quiet cookie-button--compact"
        onClick={onEnterprise}>需要团队管理？看看企业方案<CookieIcon name="right"/></button>
    </div>
  </section>;
}
