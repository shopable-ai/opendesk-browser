import * as React from 'react';
import {CookieIconButton} from './CookieEditorView.jsx';

// Product-owned React presentation, shared by the official app and preview.
// No Cookie value, credential, share token, network call or persistent grant
// enters this component. Live invitation and marketplace backends do not exist.
const exampleResources=Object.freeze([
  {id:'team',title:'团队协作席位',type:'seat',category:'官方席位',
    description:'由服务商审核并正式邀请团队成员加入，不需要交出 Cookie。',
    details:'未来使用可信身份、席位配额、官方授权、到期管理和撤销记录。'},
  {id:'demo',title:'演示与测试环境',type:'demo',category:'隔离沙盒',
    description:'完全虚构的数据与测试网站，方便体验流程而不接入生产登录。',
    details:'资源应和真实会话隔离，带明确的演示标识、到期及数据清理规则。'},
  {id:'delegate',title:'授权委托访问',type:'delegate',category:'受控委托',
    description:'通过官方可撤销授权授予最低必要权限，不转交登录凭据。',
    details:'未来采用服务商认可的授权方式，并支持最小范围与随时撤销。'}
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

export function CookieAccountMarket({previewOnly=false}){
  const [query,setQuery]=React.useState('');
  const [category,setCategory]=React.useState('all');
  const [detail,setDetail]=React.useState(null);
  const [requested,setRequested]=React.useState(false);
  const results=exampleResources.filter(item=>
    (category==='all'||item.type===category)&&
    [item.title,item.description,item.category].some(s=>
      s.toLowerCase().includes(query.trim().toLowerCase())));
  const back=()=>{setDetail(null);setRequested(false);};
  return <section className="cookie-account-page od-surface" aria-label="市场"
    id="cookie-product-panel-market" role="tabpanel"
    aria-labelledby="cookie-product-tab-market">
    <header className="cookie-account-header">
      <strong>市场</strong><span className="cookie-market-status">未上线 · 虚构示例</span>
    </header>
    <div className="cookie-account-content">
      {detail?<div className="cookie-market-detail" aria-label="市场资源详情">
        <div className="cookie-market-detail-head">
          <CookieIconButton name="undo" label="返回市场" onClick={back}/>
          <strong>{detail.title}</strong>
          <small className="cookie-market-status">{detail.category}</small>
        </div>
        <p>{detail.description}</p>
        <p>{detail.details}</p>
        <p className="cookie-account-notice">官方授权方向尚未发布。不允许以 Cookie、密码或可重用登录会话作为交易对象。</p>
        <div className="cookie-share-actions">
          <button type="button" className="od-button od-button--secondary" onClick={back}>返回列表</button>
          <button type="button" className="od-button od-button--primary" disabled={!previewOnly}
            onClick={()=>setRequested(true)}>{previewOnly?'模拟申请':'授权未上线'}</button>
        </div>
        {requested&&<p className="cookie-share-status" role="status">
          预览模拟申请：只更新页面状态，不发送网络请求或创建授权。
        </p>}
      </div>:<>
        <div className="cookie-market-intro">
          <strong>官方授权资源方向</strong>
          <p>示例均为虚构设计；不提供购买、租赁或可领取的真实登录账号。</p>
        </div>
        <div className="cookie-market-controls">
          <input type="search" className="od-field" aria-label="搜索市场资源"
            placeholder="搜索授权资源" value={query} onChange={e=>setQuery(e.target.value)}/>
          <div className="cookie-market-categories" role="group" aria-label="市场分类">
            {[['all','全部'],['seat','团队席位'],['demo','演示环境'],['delegate','委托授权']]
              .map(([id,label])=><button key={id} type="button"
                className={'od-button '+(id===category?'od-button--secondary':'od-button--quiet')}
                aria-pressed={id===category} onClick={()=>setCategory(id)}>{label}</button>)}
          </div>
        </div>
        <div className="cookie-market-results" aria-label="虚构资源列表">
          {results.map(item=><article className="cookie-market-resource" key={item.id}>
            <div className="cookie-market-resource-head">
              <strong>{item.title}</strong><small>{item.category}</small>
            </div>
            <p>{item.description}</p>
            <div className="cookie-market-resource-actions">
              <small className="cookie-market-status">虚构示例</small>
              <button type="button" className="od-button od-button--secondary"
                onClick={()=>{setDetail(item);setRequested(false);}}>查看详情</button>
            </div>
          </article>)}
          {!results.length&&<p className="cookie-account-empty">没有匹配的资源。</p>}
        </div>
      </>}
    </div>
  </section>;
}
